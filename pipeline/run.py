"""Pipeline entrypoint: fetch EMAs from MEXC, write transitions to Supabase,
and send Telegram alerts. Designed to run as a one-shot script under
GitHub Actions every 5 minutes.
"""

from __future__ import annotations

import logging
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Any

import requests
from dotenv import load_dotenv

from config_loader import load_config, get_tokens
from mexc import calculate_ema
from supabase_client import (
    get_client,
    get_latest_trend,
    get_combined_alert_state,
    insert_transition,
)
from telegram import send_alert

load_dotenv()

PH_TIMEZONE = ZoneInfo("Asia/Manila")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("ema-pipeline")


def _sleep_until_candle_close(config: dict[str, Any]) -> None:
    """Sleep until the next 5m boundary + configured delay.

    Matches the original main.py scheduling behavior, but in a one-shot
    script the value is informational: we always do a fresh fetch when
    invoked. Kept as a no-op helper for parity / future use.
    """
    delay = config.get("check_delay_seconds", 5)
    interval = config["check_interval_minutes"]
    now = datetime.now(PH_TIMEZONE)
    minutes_since = now.minute
    next_boundary = ((minutes_since // interval) + 1) * interval
    if next_boundary >= 60:
        next_close = (now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1))
    else:
        next_close = now.replace(minute=next_boundary, second=0, microsecond=0)
    target = next_close + timedelta(seconds=delay)
    logger.info("Next candle close target (informational): %s", target.isoformat())


def _fetch_one(token: str, timeframe: str, config: dict[str, Any]) -> dict[str, Any] | None:
    try:
        return calculate_ema(token, timeframe, config)
    except requests.exceptions.HTTPError as http_err:
        if http_err.response is not None and http_err.response.status_code == 429:
            logger.error("Rate limit hit for %s %s; aborting run.", token, timeframe)
            raise
        logger.exception("HTTP error for %s %s: %s", token, timeframe, http_err)
        return None
    except Exception as exc:
        logger.exception("Failed to compute EMA for %s %s: %s", token, timeframe, exc)
        return None


def run() -> int:
    config = load_config()
    tokens = get_tokens(config)
    timeframes = list(config["timeframes"].keys())

    logger.info("Processing %d tokens x %d timeframes", len(tokens), len(timeframes))

    _sleep_until_candle_close(config)

    client = get_client()
    results_by_token: dict[str, dict[str, dict[str, Any]]] = {t: {} for t in tokens}

    pairs = [(t, tf) for t in tokens for tf in timeframes]

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_fetch_one, token, timeframe, config): (token, timeframe)
            for token, timeframe in pairs
        }
        for fut in as_completed(futures):
            token, timeframe = futures[fut]
            try:
                res = fut.result()
            except requests.exceptions.HTTPError as http_err:
                if http_err.response is not None and http_err.response.status_code == 429:
                    logger.error("Aborting due to 429.")
                    return 2
                continue
            if res is not None:
                results_by_token[token][timeframe] = res

    transitions_written = 0
    for token in tokens:
        for timeframe in timeframes:
            res = results_by_token[token].get(timeframe)
            if res is None:
                continue
            try:
                prior = get_latest_trend(client, token, timeframe)
            except Exception:
                logger.exception("Failed to read prior trend for %s %s", token, timeframe)
                continue

            if res["trend"] != prior:
                try:
                    insert_transition(
                        client,
                        token=token,
                        timeframe=timeframe,
                        previous_trend=prior,
                        new_trend=res["trend"],
                        ema_values=res["ema"],
                        close=res["close"],
                        candle_time=res["candle_time"],
                    )
                    transitions_written += 1
                except Exception:
                    logger.exception("Failed to insert transition for %s %s", token, timeframe)

    alerts_sent = 0
    for token in tokens:
        r1 = results_by_token[token].get("1m")
        r5 = results_by_token[token].get("5m")
        r15 = results_by_token[token].get("15m")
        if not (r1 and r5 and r15):
            continue
        try:
            prior_state = get_combined_alert_state(client, token)
        except Exception:
            logger.exception("Failed to read prior alert state for %s", token)
            prior_state = "NEUTRAL"
        try:
            sent, _ = send_alert(r1, r5, r15, config, prior_state)
            if sent:
                alerts_sent += 1
        except Exception:
            logger.exception("Telegram alert failed for %s", token)

    logger.info(
        "Run complete. transitions_written=%d, alerts_sent=%d",
        transitions_written,
        alerts_sent,
    )
    return 0


if __name__ == "__main__":
    sys.exit(run())
