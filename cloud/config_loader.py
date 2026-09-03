"""Load the shared config.json for the Python pipeline.

The same config (tokens, timeframes, MEXC URL, etc.) is mirrored at the
repo root for the Next.js app. The pipeline reads the copy in its own
directory; the web app reads the repo-root copy.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PIPELINE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = PIPELINE_DIR / "config.json"


def load_config(path: Path | None = None) -> dict[str, Any]:
    p = path or CONFIG_PATH
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def get_tokens(config: dict[str, Any]) -> list[str]:
    """Return the deduped, order-preserving token list."""
    seen: set[str] = set()
    out: list[str] = []
    for t in config.get("tokens", []):
        u = str(t).upper()
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out
