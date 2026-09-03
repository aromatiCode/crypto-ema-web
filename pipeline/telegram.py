"""Telegram alert logic, preserved verbatim from the original main.py.

The combined 5m+15m-with-1m-confirmation rule and both message formats
controlled by the MINIMAL flag are kept exactly as they were.
"""

from __future__ import annotations

import logging
import os
from typing import Any
from zoneinfo import ZoneInfo

import requests

logger = logging.getLogger(__name__)

PH_TIMEZONE = ZoneInfo("Asia/Manila")

_session: requests.Session | None = None


def _get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({"User-Agent": "MEXC-EMA-Cloud-Pipeline/1.0"})
    return _session


def send_telegram_message(message: str, config: dict[str, Any]) -> bool:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    url = f"{config['telegram_api_url']}/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        resp = _get_session().post(url, json=payload, timeout=config["request_timeout"])
        resp.raise_for_status()
        result = resp.json()
        if not result.get("ok"):
            logger.error("Telegram error: %s", result)
            return False
        return True
    except requests.RequestException as exc:
        logger.error("Telegram request failed: %s", exc)
        return False


def format_price(value: float) -> str:
    return f"{value:,.8f}".rstrip("0").rstrip(".")


def format_ema(value: float) -> str:
    return f"{value:,.8f}".rstrip("0").rstrip(".")


def alert_condition_met(result_5m: dict[str, Any], result_15m: dict[str, Any], config: dict[str, Any]) -> bool:
    trend_5m = result_5m["trend"]
    trend_15m = result_15m["trend"]

    if not config.get("alert_on_same_trend", True):
        return False
    if trend_5m != trend_15m:
        return False
    if trend_5m == "NEUTRAL":
        return False
    return True


def build_alert_message(
    result_1m: dict[str, Any],
    result_5m: dict[str, Any],
    result_15m: dict[str, Any],
    config: dict[str, Any],
) -> str | bool:
    token = result_5m["token"]

    trend = "NEUTRAL"
    if (
        result_5m["trend"] == result_15m["trend"]
        and result_5m["trend"] == "BULLISH"
        and result_1m["trend"] != "BULLISH"
    ):
        trend = "BULLISH"
    if (
        result_5m["trend"] == result_15m["trend"]
        and result_5m["trend"] == "BEARISH"
        and result_1m["trend"] != "BEARISH"
    ):
        trend = "BEARISH"
    if result_5m["trend"] == "NEUTRAL" or result_15m["trend"] == "NEUTRAL":
        trend = "NEUTRAL"

    if trend == "NEUTRAL":
        return False

    candle_time_1m = (
        result_1m["candle_time"]
        .astimezone(PH_TIMEZONE)
        .strftime("%Y-%m-%d %I:%M:%S %p")
    )
    candle_time_5m = (
        result_5m["candle_time"]
        .astimezone(PH_TIMEZONE)
        .strftime("%Y-%m-%d %I:%M:%S %p")
    )
    candle_time_15m = (
        result_15m["candle_time"]
        .astimezone(PH_TIMEZONE)
        .strftime("%Y-%m-%d %I:%M:%S %p")
    )

    emoji = "🟢" if trend == "BULLISH" else "🔴"
    minimal = str(config.get("minimal", "TRUE")).upper()

    if minimal == "FALSE":
        return (
            f"{emoji} <b>MEXC FUTURES EMA ALERT</b>\n"
            f"\n"
            f"<b>Token:</b> {token}/USDT\n"
            f"<b>Trend:</b> {trend}\n"
            f"\n"
            f"<b>1m</b>\n"
            f"<b>Trend:</b> {result_1m['trend']}\n"
            f"Close: {format_price(result_1m['close'])}\n"
            f"Candle: {candle_time_1m}\n"
            f"\n"
            f"\n"
            f"<b>5m</b>\n"
            f"<b>Trend:</b> {result_5m['trend']}\n"
            f"Close: {format_price(result_5m['close'])}\n"
            f"Candle: {candle_time_5m}\n"
            f"\n"
            f"<b>15m</b>\n"
            f"<b>Trend:</b> {result_15m['trend']}\n"
            f"Close: {format_price(result_15m['close'])}\n"
            f"Candle: {candle_time_15m}\n"
        )

    if trend == "BEARISH" and result_1m["close"] >= result_1m["ema"]["EMA200"]:
        return (
            f"{emoji} <b>MEXC FUTURES EMA ALERT</b>\n"
            f"\n"
            f"<b>Token:</b> {token}/USDT\n"
            f"<b>Trend:</b> {trend}\n"
            f"\n"
            f"<b>Trends:</b> {result_1m['trend']} | {result_5m['trend']} | {result_15m['trend']}"
        )
    if trend == "BULLISH" and result_1m["close"] <= result_1m["ema"]["EMA200"]:
        return (
            f"{emoji} <b>MEXC FUTURES EMA ALERT</b>\n"
            f"\n"
            f"<b>Token:</b> {token}/USDT\n"
            f"<b>Trend:</b> {trend}\n"
            f"\n"
            f"<b>Trends:</b> {result_1m['trend']} | {result_5m['trend']} | {result_15m['trend']}"
        )
    return False


def send_alert(
    result_1m: dict[str, Any],
    result_5m: dict[str, Any],
    result_15m: dict[str, Any],
    config: dict[str, Any],
    previous_alert_state: str,
) -> tuple[bool, str]:
    """Run the alert check and send a message if needed.

    Returns (sent: bool, new_state: str).
    """
    if not alert_condition_met(result_5m, result_15m, config):
        return False, previous_alert_state

    message = build_alert_message(result_1m, result_5m, result_15m, config)
    if message is False or message == "False":
        return False, previous_alert_state

    # Combined 5m+15m+1m trend (matching the build_alert_message logic).
    combined = "NEUTRAL"
    if (
        result_5m["trend"] == result_15m["trend"]
        and result_5m["trend"] == "BULLISH"
        and result_1m["trend"] != "BULLISH"
    ):
        combined = "BULLISH"
    elif (
        result_5m["trend"] == result_15m["trend"]
        and result_5m["trend"] == "BEARISH"
        and result_1m["trend"] != "BEARISH"
    ):
        combined = "BEARISH"

    if combined == previous_alert_state:
        return False, previous_alert_state

    logger.info("ALERT: %s %s", result_5m["token"], combined)
    sent = send_telegram_message(message, config)
    return sent, combined
