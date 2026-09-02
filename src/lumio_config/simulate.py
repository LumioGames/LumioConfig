from __future__ import annotations

from pathlib import Path
from typing import Any


def run(candidate_dir: Path) -> dict[str, Any]:
    Path(candidate_dir)
    return {
        "status": "unavailable",
        "evidence": {"reason": "no simulator bound"},
    }
