"""MEXC Futures kline fetching and EMA trend calculation.

Refactored from the original main.py. The math, the trend rule, and the
candle-filtering logic are preserved exactly.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd
import requests

logger = logging.getLogger(__name__)

_session: requests.Session | None = None


def get_session() -> requests.Session:
    global _session
    if _session is None:
        _session = requests.Session()
        _session.headers.update({
            "User-Agent": "MEXC-EMA-Cloud-Pipeline/1.0"
        })
    return _session


def token_to_symbol(token: str) -> str:
    return f"{token.upper()}_USDT"


def get_required_candle_count(ema_periods: list[int], extra_candles: int) -> int:
    return max(ema_periods) + extra_candles


def get_mexc_klines(
    token: str,
    timeframe: str,
    config: dict[str, Any],
) -> pd.DataFrame:
    timeframes = config["timeframes"]
    if timeframe not in timeframes:
        raise ValueError(f"Unsupported timeframe: {timeframe}")

    symbol = token_to_symbol(token)
    tf_cfg = timeframes[timeframe]
    interval = tf_cfg["mexc_interval"]

    url = f"{config['mexc_base_url']}/api/v1/contract/kline/{symbol}"
    params = {"interval": interval}

    logger.debug("Requesting MEXC data: %s %s", symbol, timeframe)

    response = get_session().get(
        url,
        params=params,
        timeout=config["request_timeout"],
    )
    response.raise_for_status()

    payload = response.json()
    if not payload.get("success"):
        raise RuntimeError(f"MEXC API error: {payload}")

    data = payload.get("data")
    if not data:
        raise RuntimeError(f"No K-line data returned for {symbol} {timeframe}")

    required_fields = ["time", "open", "high", "low", "close", "vol"]
    for field in required_fields:
        if field not in data:
            raise RuntimeError(
                f"Missing MEXC field '{field}' for {symbol} {timeframe}"
            )

    df = pd.DataFrame({
        "timestamp": data["time"],
        "open": data["open"],
        "high": data["high"],
        "low": data["low"],
        "close": data["close"],
        "volume": data["vol"],
    })

    if df.empty:
        raise RuntimeError(f"Empty K-line DataFrame for {symbol} {timeframe}")

    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="s", utc=True)

    for column in ["open", "high", "low", "close", "volume"]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=["timestamp", "close"])
    df = df.sort_values("timestamp").drop_duplicates(subset=["timestamp"])

    # Remove the currently forming candle.
    timeframe_minutes = tf_cfg["minutes"]
    now = pd.Timestamp.now(tz="UTC")
    candle_duration = pd.Timedelta(minutes=timeframe_minutes)
    df = df[df["timestamp"] + candle_duration <= now].copy()

    required = get_required_candle_count(
        config["ema_periods"],
        config["extra_candles"],
    )
    if len(df) < required:
        raise RuntimeError(
            f"Not enough closed candles for {symbol} {timeframe}. "
            f"Required={required}, available={len(df)}"
        )

    df = df.tail(required).reset_index(drop=True)
    return df


def calculate_ema_values(df: pd.DataFrame, ema_periods: list[int]) -> dict[str, float]:
    result: dict[str, float] = {}
    for period in ema_periods:
        ema = df["close"].ewm(span=period, adjust=False, min_periods=period).mean()
        result[f"EMA{period}"] = float(ema.iloc[-1])
    return result


def determine_trend(ema_values: dict[str, float]) -> str:
    ema20 = ema_values["EMA20"]
    ema50 = ema_values["EMA50"]
    ema100 = ema_values["EMA100"]
    ema200 = ema_values["EMA200"]

    if ema20 > ema50 and ema50 > ema100 and ema100 > ema200:
        return "BULLISH"
    if ema20 < ema50 and ema50 < ema100 and ema100 < ema200:
        return "BEARISH"
    return "NEUTRAL"


def calculate_ema(token: str, timeframe: str, config: dict[str, Any]) -> dict[str, Any]:
    df = get_mexc_klines(token, timeframe, config)
    ema_values = calculate_ema_values(df, config["ema_periods"])
    trend = determine_trend(ema_values)
    candle_time = df.iloc[-1]["timestamp"]

    return {
        "token": token,
        "timeframe": timeframe,
        "trend": trend,
        "ema": ema_values,
        "candle_time": candle_time,
        "close": float(df.iloc[-1]["close"]),
    }
