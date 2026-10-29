"""Held-out permutation importance per SOURCE column.

Every feature column derived from one source column is permuted together with ONE row permutation, so an encoding or
a derivation cannot split (dilute) a source column's importance. The measure is the increase of the primary loss on
the rows given (the locked holdout in the trainer), averaged over repeats: model-agnostic, so every family reports it
the same way (no impurity or split counts). The interval is a paired bootstrap of that increase on the same resampled
rows (`intervals.paired_bootstrap`). Port of the truth suite's reference pipeline
(`packages/AI/PredictiveStudio/TruthSuite/python/truthsuite/refpipe/scoring.py`, `permutation_importance_by_column`):
the same permutation draws, the same bootstrap draws (seeded `seed + 1` for every source), the same ordering.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Mapping, Optional, Sequence

import numpy as np
import pandas as pd

from .array_types import FArr
from .intervals import paired_bootstrap
from .scores import ScoreFn

PredictFn = Callable[[pd.DataFrame], FArr]


@dataclass(frozen=True)
class ColumnImportance:
    """One source column's held-out permutation importance: the mean loss increase when it is permuted (> 0: the model
    relies on it) and its paired bootstrap interval."""

    source_column: str
    drop: float
    lower: float
    upper: float


def _mean_over_repeats(fn: ScoreFn) -> ScoreFn:
    """`fn` averaged over the repeat axis (axis 1) of stacked predictions, so a bootstrap draw scores every repeat on
    the same resampled rows."""

    def score(y: FArr, stacked: FArr) -> float:
        return float(np.mean([fn(y, stacked[:, r]) for r in range(stacked.shape[1])]))

    return score


def _permuted_predictions(predict: PredictFn, X: pd.DataFrame, columns: Sequence[str], n_repeats: int,
                          rng: np.random.Generator) -> FArr:
    """Predictions with `columns` permuted together, one row permutation per repeat, stacked on axis 1."""
    out: List[FArr] = []
    for _ in range(n_repeats):
        Xp = X.copy()
        idx = rng.permutation(len(Xp))
        for c in columns:
            Xp[c] = X[c].to_numpy()[idx]
        out.append(np.asarray(predict(Xp), dtype=np.float64))
    return np.stack(out, axis=1)


def permutation_importance(predict: PredictFn, X: pd.DataFrame, y: FArr, fn: ScoreFn,
                           source_map: Mapping[str, Sequence[str]], n_repeats: int, seed: int, n_boot: int,
                           groups: Optional[Sequence[str]], level: float = 0.95) -> List[ColumnImportance]:
    """Each source column's importance on the rows of `X`/`y`, for the model behind `predict` (lower-is-better `fn`).
    Sorted by decreasing importance, then source name. `groups` resamples whole groups in the interval."""
    yy = np.asarray(y, dtype=np.float64)
    intact = np.expand_dims(np.asarray(predict(X), dtype=np.float64), axis=1)
    rng = np.random.default_rng(seed)
    mean_fn = _mean_over_repeats(fn)
    out: List[ColumnImportance] = []
    for src in sorted(source_map):
        permuted = _permuted_predictions(predict, X, source_map[src], n_repeats, rng)
        b = paired_bootstrap(yy, permuted, intact, mean_fn, n_boot, seed + 1, groups, level)
        out.append(ColumnImportance(src, b.value, b.lower, b.upper))
    out.sort(key=lambda c: (-c.drop, c.source_column))
    return out


def noise_share(importances: Sequence[ColumnImportance], noise_sources: Sequence[str]) -> float:
    """Share of the positive importance carried by the named sources (0 when no source has positive importance)."""
    pos = {c.source_column: max(0.0, c.drop) for c in importances}
    total = sum(pos.values())
    return 0.0 if total == 0 else sum(pos.get(s, 0.0) for s in noise_sources) / total
