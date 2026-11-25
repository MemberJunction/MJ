"""Measurements the unit tests and gates take of the trainer's outputs: group keys a fold shares across its sides, and
the share of permutation importance carried by planted noise sources."""

from __future__ import annotations

from collections.abc import Sequence

from app.folds import Fold
from app.importance import ColumnImportance


def shared_groups(fold: Fold, groups: Sequence[str]) -> int:
    """Number of group keys present on both sides of a fold; a grouped or blocked-time fold must share none."""
    return len({groups[int(i)] for i in fold.train} & {groups[int(i)] for i in fold.valid})


def noise_share(importances: Sequence[ColumnImportance], noise_sources: Sequence[str]) -> float:
    """Share of the positive importance carried by the named sources (0 when no source has positive importance)."""
    pos = {c.source_column: max(0.0, c.drop) for c in importances}
    total = sum(pos.values())
    return 0.0 if total == 0 else sum(pos.get(s, 0.0) for s in noise_sources) / total
