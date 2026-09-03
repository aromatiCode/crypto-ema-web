"""Load the shared config.json file at the repo root.

Both the Python pipeline and the Next.js web app read this same file.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = REPO_ROOT / "config.json"


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
