"""Candidate selection on inner cross-validation.

Each candidate's inner score is the mean of its per-fold primary scores over every repeat, with a corrected
resampled-t interval (Nadeau and Bengio 2003: variance (1/J + n_valid/n_train) * S^2 over the J fold scores),
because fold scores share training rows and the naive t interval is too narrow.

The finalist is chosen by the reference pipeline's rule (`truthsuite.refpipe.run._select`): the lowest pooled
out-of-fold primary score, then the earliest candidate in request order whose mean per-row loss excess over that best
is within one standard error of the paired row differences. Nothing is pruned: every candidate is scored on every
fold, so no candidate is dropped while its interval still overlaps the leader's.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from scipy import stats

FArr = npt.NDArray[np.float64]


@dataclass(frozen=True)
class InnerScore:
    """One candidate's inner-CV primary score: the mean over every fold of every repeat and its corrected interval."""

    candidate: str
    mean: float
    lower: float
    upper: float
    folds: int
    n_rows: int


def corrected_resampled_t(fold_scores: Sequence[float], n_train: float, n_valid: float,
                          level: float) -> tuple[float, float, float]:
    """(mean, lower, upper) of fold scores with the Nadeau-Bengio corrected variance.

    Raises:
        ValueError: With fewer than two fold scores (no variance to correct).
    """
    s = np.asarray(list(fold_scores), dtype=np.float64)
    j = len(s)
    if j < 2:
        raise ValueError("a corrected resampled-t interval needs at least two fold scores")
    mean = float(s.mean())
    var = (1.0 / j + n_valid / n_train) * float(np.var(s, ddof=1))
    half = float(stats.t.ppf((1 + level) / 2, j - 1)) * math.sqrt(max(var, 0.0))
    return mean, mean - half, mean + half


@dataclass(frozen=True)
class Selection:
    """The one-standard-error decision: the finalist, the best candidate by pooled score, and per candidate its mean
    per-row loss excess over the best, the standard error of that excess, and whether it is within one SE."""

    finalist: str
    best_by_score: str
    excess: Mapping[str, float]
    se_of_excess: Mapping[str, float]
    within_one_se: Mapping[str, bool]


def select_one_se(order: Sequence[str], pooled_score: Mapping[str, float],
                  row_loss: Mapping[str, FArr]) -> Selection:
    """Lowest pooled score, then the earliest candidate (request order) within 1 SE of it."""
    ranked = list(order)
    best = min(ranked, key=lambda c: (pooled_score[c], ranked.index(c)))
    excess: dict[str, float] = {}
    se: dict[str, float] = {}
    within: dict[str, bool] = {}
    chosen: str | None = None
    for c in ranked:
        d = row_loss[c] - row_loss[best]
        excess[c] = float(d.mean())
        se[c] = float(np.std(d, ddof=1) / math.sqrt(len(d))) if len(d) > 1 else 0.0
        within[c] = excess[c] <= se[c]
        if chosen is None and within[c]:
            chosen = c
    if chosen is None:  # the best candidate's excess over itself is 0, always within its own SE
        chosen = best
    return Selection(chosen, best, excess, se, within)
