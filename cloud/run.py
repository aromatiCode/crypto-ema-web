"""Pipeline entrypoint: fetch EMAs from MEXC, write transitions to Supabase,
and send Telegram alerts. Designed to run as a long-lived worker on Railway
(or any always-on host). Each loop iteration is roughly equivalent to one
GitHub Actions run.
"""

from __future__ import annotations

import logging
import time
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


def _sleep_until_next_run(config: dict[str, Any]) -> None:
    """Sleep until the next scheduled boundary + configured delay."""
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
    sleep_seconds = max(0, (target - datetime.now(PH_TIMEZONE)).total_seconds())
    if sleep_seconds > 0:
        logger.info("Sleeping %.1fs until next scheduled run at %s", sleep_seconds, target.isoformat())
        time.sleep(sleep_seconds)


def _fetch_one(token: str, timeframe: str, config: dict[str, Any]) -> dict[str, Any] | None:
    """Fetch EMA for one (token, timeframe) with retry on MEXC rate limit.

    MEXC may return HTTP 200 with payload {success: False, code: 510}
    when requests are too frequent. We treat that as a rate limit and
    retry with exponential backoff up to 5 times.
    """
    max_attempts = 5
    base_delay = 2.0  # seconds
    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return calculate_ema(token, timeframe, config)
        except requests.exceptions.HTTPError as http_err:
            status = http_err.response.status_code if http_err.response is not None else None
            if status == 429:
                wait = base_delay * (2 ** (attempt - 1))
                logger.warning("HTTP 429 for %s %s (attempt %d/%d). Backing off %.1fs.", token, timeframe, attempt, max_attempts, wait)
                time.sleep(wait)
                last_exc = http_err
                continue
            logger.exception("HTTP error for %s %s: %s", token, timeframe, http_err)
            return None
        except RuntimeError as exc:
            msg = str(exc)
            if "code': 510" in msg or "Requests are too frequent" in msg:
                wait = base_delay * (2 ** (attempt - 1))
                logger.warning("MEXC 510 rate limit for %s %s (attempt %d/%d). Backing off %.1fs.", token, timeframe, attempt, max_attempts, wait)
                time.sleep(wait)
                last_exc = exc
                continue
            logger.exception("RuntimeError for %s %s: %s", token, timeframe, exc)
            return None
        except Exception as exc:
            logger.exception("Failed to compute EMA for %s %s: %s", token, timeframe, exc)
            return None

    logger.error("Giving up on %s %s after %d attempts.", token, timeframe, max_attempts)
    return None


def run_once() -> None:
    config = load_config()
    tokens = get_tokens(config)
    timeframes = list(config["timeframes"].keys())

    logger.info("Processing %d tokens x %d timeframes", len(tokens), len(timeframes))

    client = get_client()
    results_by_token: dict[str, dict[str, dict[str, Any]]] = {t: {} for t in tokens}

    pairs = [(t, tf) for t in tokens for tf in timeframes]

    results_by_token: dict[str, dict[str, dict[str, Any]]] = {t: {} for t in tokens}

    mexc_delay = 2.0  # seconds between MEXC requests to avoid rate limiting on Railway shared IPs
    for idx, (token, timeframe) in enumerate(pairs):
        if idx > 0:
            time.sleep(mexc_delay)
        res = _fetch_one(token, timeframe, config)
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


def main() -> None:
    logger.info("EMA pipeline worker starting")
    while True:
        try:
            _sleep_until_next_run(load_config())
            run_once()
        except requests.exceptions.HTTPError as http_err:
            if http_err.response is not None and http_err.response.status_code == 429:
                logger.warning("Rate limited globally. Backing off for 60s.")
                time.sleep(60)
                continue
            logger.exception("HTTP error in loop: %s", http_err)
            time.sleep(10)
        except Exception as exc:
            logger.exception("Unexpected error in loop: %s", exc)
            time.sleep(10)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Pipeline worker stopped by user.")
