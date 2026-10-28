"""Intervals and paired tests on the holdout rows.

  bootstrap_ci       percentile bootstrap of a score over rows; whole groups when `groups` is given
                     (cluster bootstrap by entity; block bootstrap when the groups are contiguous period blocks)
  paired_bootstrap   (score(base) - score(candidate)) on the SAME resampled rows; > 0 favours the candidate
  delong_paired      the paired DeLong (1988) test of two scores' AUCs on one set of rows
  hanley_mcneil_se   the textbook AUC standard error, the yardstick an interval's width is checked against

Resampling is the truth suite's reference pipeline's: numpy default_rng(seed), integers(0, n, n) for rows,
integers(0, G, G) for whole groups, the 2.5/97.5 percentiles for a 95% interval.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy import stats

from .array_types import FArr, IntArr
from .scores import ScoreFn


def index_sets(groups: Optional[Sequence[str]]) -> Optional[List[IntArr]]:
    """Row indices per group, groups in sorted order."""
    if groups is None:
        return None
    codes, _ = pd.factorize(pd.Series(list(groups)).astype(str), sort=True)
    order = np.argsort(codes, kind="mergesort")
    bounds = np.flatnonzero(np.diff(codes[order])) + 1
    return [a.astype(np.int64) for a in np.split(order, bounds)]


def resample_indices(rng: np.random.Generator, n: int, sets: Optional[List[IntArr]]) -> IntArr:
    """One bootstrap draw of row positions: rows with replacement, or whole clusters/blocks when `sets` is given."""
    if sets is None:
        return rng.integers(0, n, n).astype(np.int64)
    pick = rng.integers(0, len(sets), len(sets))
    return np.concatenate([sets[int(i)] for i in pick])


def _pct(level: float) -> Tuple[float, float]:
    a = (1 - level) / 2 * 100
    return a, 100 - a


def bootstrap_ci(y: FArr, pred: FArr, fn: ScoreFn, n: int, seed: int,
                 groups: Optional[Sequence[str]] = None, level: float = 0.95) -> Tuple[float, float]:
    """(lower, upper) percentile interval of `fn` over `n` resamples; NaN draws are skipped, (NaN, NaN) when all are."""
    yy = np.asarray(y)
    pp = np.asarray(pred)
    rng = np.random.default_rng(seed)
    sets = index_sets(groups)
    vals: List[float] = []
    for _ in range(n):
        i = resample_indices(rng, len(yy), sets)
        v = fn(yy[i], pp[i])
        if not math.isnan(v):
            vals.append(v)
    if not vals:
        return float("nan"), float("nan")
    lo, hi = _pct(level)
    return float(np.percentile(vals, lo)), float(np.percentile(vals, hi))


def paired_bootstrap(y: FArr, base: FArr, cand: FArr, fn: ScoreFn, n: int, seed: int,
                     groups: Optional[Sequence[str]] = None, level: float = 0.95) -> Tuple[float, float, float]:
    """(value, lower, upper) of fn(base) - fn(cand) on the same resampled rows; for a loss, > 0 favours the
    candidate. NaN draws are skipped; the interval is (NaN, NaN) when every draw is NaN."""
    yy = np.asarray(y)
    a = np.asarray(base)
    b = np.asarray(cand)
    rng = np.random.default_rng(seed)
    sets = index_sets(groups)
    vals: List[float] = []
    for _ in range(n):
        i = resample_indices(rng, len(yy), sets)
        v = fn(yy[i], a[i]) - fn(yy[i], b[i])
        if not math.isnan(v):
            vals.append(v)
    value = float(fn(yy, a) - fn(yy, b))
    if not vals:
        return value, float("nan"), float("nan")
    lo, hi = _pct(level)
    return value, float(np.percentile(vals, lo)), float(np.percentile(vals, hi))


# ------------------------------------------------------------------------------------------------ DeLong -------

def _midrank(x: FArr) -> FArr:
    order = np.argsort(x, kind="mergesort")
    xs = x[order]
    n = len(x)
    t = np.zeros(n, dtype=np.float64)
    i = 0
    while i < n:
        j = i
        while j < n and xs[j] == xs[i]:
            j += 1
        t[i:j] = 0.5 * (i + j - 1) + 1
        i = j
    out = np.empty(n, dtype=np.float64)
    out[order] = t
    return out


def _structural(y: FArr, score_rows: FArr) -> Tuple[FArr, FArr, FArr]:
    """Per-score AUC plus the V10/V01 structural components (Sun and Xu 2014 fast DeLong). score_rows: (k, n)."""
    pos = y == 1
    m = int(pos.sum())
    nneg = len(y) - m
    if m == 0 or nneg == 0:
        raise ValueError("DeLong needs both classes on the rows")
    k = score_rows.shape[0]
    aucs = np.empty(k, dtype=np.float64)
    v10 = np.empty((k, m), dtype=np.float64)
    v01 = np.empty((k, nneg), dtype=np.float64)
    for r in range(k):
        s = score_rows[r]
        tx = _midrank(s[pos])
        ty = _midrank(s[~pos])
        tz = _midrank(s)
        aucs[r] = (tz[pos].sum() - m * (m + 1) / 2) / (m * nneg)
        v10[r] = (tz[pos] - tx) / nneg
        v01[r] = 1.0 - (tz[~pos] - ty) / m
    return aucs, v10, v01


@dataclass(frozen=True)
class DeLongPaired:
    """The paired DeLong comparison of two scores' AUCs on the same rows."""

    auc_a: float
    auc_b: float
    diff: float          # auc_a - auc_b
    se: float
    z: float
    p_two_sided: float
    p_a_greater: float   # one-sided p for H1: auc_a > auc_b


def delong_paired(y: FArr, score_a: FArr, score_b: FArr) -> DeLongPaired:
    """Paired DeLong test of AUC(score_a) vs AUC(score_b) on one set of rows.

    Raises:
        ValueError: When the rows do not hold both classes.
    """
    yy = np.asarray(y, dtype=np.float64)
    aucs, v10, v01 = _structural(yy, np.vstack([np.asarray(score_a, np.float64), np.asarray(score_b, np.float64)]))
    cov = np.cov(v10) / v10.shape[1] + np.cov(v01) / v01.shape[1]
    var = float(cov[0, 0] + cov[1, 1] - 2 * cov[0, 1])
    diff = float(aucs[0] - aucs[1])
    se = math.sqrt(var) if var > 0 else 0.0
    z = diff / se if se > 0 else (math.inf if diff > 0 else (-math.inf if diff < 0 else 0.0))
    p_two = float(2 * stats.norm.sf(abs(z))) if math.isfinite(z) else 0.0
    p_one = float(stats.norm.sf(z)) if math.isfinite(z) else (0.0 if z > 0 else 1.0)
    return DeLongPaired(float(aucs[0]), float(aucs[1]), diff, se, z, p_two, p_one)


def hanley_mcneil_se(auc: float, n_pos: int, n_neg: int) -> float:
    """Hanley and McNeil (1982) standard error of an AUC from its value and the two class counts."""
    q1 = auc / (2 - auc)
    q2 = 2 * auc * auc / (1 + auc)
    var = (auc * (1 - auc) + (n_pos - 1) * (q1 - auc * auc) + (n_neg - 1) * (q2 - auc * auc)) / (n_pos * n_neg)
    return math.sqrt(max(var, 0.0))
