"""Supabase client and trend-transition persistence."""

from __future__ import annotations

import logging
import os
from typing import Any

from supabase import Client, create_client

logger = logging.getLogger(__name__)

TABLE = "trend_transitions"


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def get_latest_trend(client: Client, token: str, timeframe: str) -> str:
    """Return the most recent new_trend for a (token, timeframe), or 'NEUTRAL' if none."""
    resp = (
        client.table(TABLE)
        .select("new_trend,created_at")
        .eq("token", token)
        .eq("timeframe", timeframe)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return "NEUTRAL"
    return str(rows[0]["new_trend"])


def insert_transition(
    client: Client,
    *,
    token: str,
    timeframe: str,
    previous_trend: str,
    new_trend: str,
    ema_values: dict[str, float],
    close: float,
    candle_time: Any,
) -> None:
    payload = {
        "token": token,
        "timeframe": timeframe,
        "previous_trend": previous_trend,
        "new_trend": new_trend,
        "ema20": ema_values["EMA20"],
        "ema50": ema_values["EMA50"],
        "ema100": ema_values["EMA100"],
        "ema200": ema_values["EMA200"],
        "close": close,
        "candle_time": candle_time.isoformat() if hasattr(candle_time, "isoformat") else str(candle_time),
    }
    client.table(TABLE).insert(payload).execute()
    logger.info("Wrote transition: %s %s %s -> %s", token, timeframe, previous_trend, new_trend)


def get_last_updated(client: Client) -> str | None:
    resp = client.table(TABLE).select("created_at").order("created_at", desc=True).limit(1).execute()
    rows = resp.data or []
    if not rows:
        return None
    return str(rows[0]["created_at"])


def get_combined_alert_state(client: Client, token: str) -> str:
    """Reconstruct the prior combined alert state for a token.

    Mirrors the logic in telegram.build_alert_message:
        BULLISH if 5m == 15m == BULLISH and 1m != BULLISH
        BEARISH if 5m == 15m == BEARISH and 1m != BEARISH
        otherwise NEUTRAL
    Falls back to NEUTRAL when no transition row exists.
    """
    latest: dict[str, str] = {}
    for tf in ("1m", "5m", "15m"):
        latest[tf] = get_latest_trend(client, token, tf)

    if latest["5m"] == "BULLISH" and latest["15m"] == "BULLISH" and latest["1m"] != "BULLISH":
        return "BULLISH"
    if latest["5m"] == "BEARISH" and latest["15m"] == "BEARISH" and latest["1m"] != "BEARISH":
        return "BEARISH"
    return "NEUTRAL"
