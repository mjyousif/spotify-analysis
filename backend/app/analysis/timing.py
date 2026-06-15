"""
timing.py — Pipeline stage timing utilities.

Usage:
    with AnalysisTimer("stage_name", timings) as t:
        do_something()
    # t.duration_ms is now set; timings["stage_name"] = t
"""

import time
import logging
from dataclasses import dataclass, field
from typing import Dict, Optional

logger = logging.getLogger("uvicorn.error")


@dataclass
class StageResult:
    name: str
    duration_ms: float = 0.0
    metadata: Dict = field(default_factory=dict)


class AnalysisTimer:
    """Context manager that measures wall-clock time for a named pipeline stage."""

    def __init__(self, name: str, report: Optional[Dict[str, "StageResult"]] = None):
        self.name = name
        self.report = report  # shared dict to auto-register result
        self.start: float = 0.0
        self.end: float = 0.0
        self.duration_ms: float = 0.0

    def __enter__(self) -> "AnalysisTimer":
        self.start = time.perf_counter()
        return self

    def __exit__(self, *_):
        self.end = time.perf_counter()
        self.duration_ms = (self.end - self.start) * 1000.0
        if self.report is not None:
            self.report[self.name] = StageResult(
                name=self.name,
                duration_ms=self.duration_ms,
            )


def log_timing_summary(timings: Dict[str, StageResult], playlist_id: str = "") -> None:
    """Emit a clean timing summary table to the logger at INFO level."""
    if not timings:
        return

    total_ms = sum(s.duration_ms for s in timings.values())
    header = f"{'Stage':<30} {'Duration':>10}  {'% Total':>8}"
    separator = "-" * len(header)
    rows = [header, separator]
    for stage_result in timings.values():
        pct = (stage_result.duration_ms / total_ms * 100.0) if total_ms > 0 else 0.0
        rows.append(
            f"{stage_result.name:<30} {stage_result.duration_ms:>8.0f}ms  {pct:>7.1f}%"
        )
    rows.append(separator)
    rows.append(f"{'TOTAL':<30} {total_ms:>8.0f}ms  {'100.0':>7}%")

    context_str = f" [{playlist_id}]" if playlist_id else ""
    logger.info(
        "⏱  Pipeline timing summary%s:\n%s",
        context_str,
        "\n".join(rows),
    )
