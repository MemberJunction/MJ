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
    """Lower/upper percentiles of a central interval, rounded so 0.95 gives exactly 2.5/97.5."""
    a = round((1 - level) / 2 * 100, 10)
    return a, round(100 - a, 10)


@dataclass(frozen=True)
class BootstrapInterval:
    """A percentile bootstrap interval; `draws` counts the resamples on which the score was defined (NaN draws are
    dropped), and both bounds are NaN when it is 0."""

    lower: float
    upper: float
    draws: int


@dataclass(frozen=True)
class PairedBootstrap:
    """score(base) - score(candidate) on the full rows, with its paired percentile interval and defined-draw count."""

    value: float
    lower: float
    upper: float
    draws: int


def bootstrap_ci(y: FArr, pred: FArr, fn: ScoreFn, n: int, seed: int,
                 groups: Optional[Sequence[str]] = None, level: float = 0.95) -> BootstrapInterval:
    """Percentile interval of `fn` over `n` resamples; NaN draws are skipped and counted out of `draws`."""
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
        return BootstrapInterval(float("nan"), float("nan"), 0)
    lo, hi = _pct(level)
    return BootstrapInterval(float(np.percentile(vals, lo)), float(np.percentile(vals, hi)), len(vals))


def paired_bootstrap(y: FArr, base: FArr, cand: FArr, fn: ScoreFn, n: int, seed: int,
                     groups: Optional[Sequence[str]] = None, level: float = 0.95) -> PairedBootstrap:
    """fn(base) - fn(cand) on the same resampled rows; for a loss, > 0 favours the candidate. NaN draws are skipped
    and counted out of `draws`; the interval is (NaN, NaN) when every draw is NaN."""
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
        return PairedBootstrap(value, float("nan"), float("nan"), 0)
    lo, hi = _pct(level)
    return PairedBootstrap(value, float(np.percentile(vals, lo)), float(np.percentile(vals, hi)), len(vals))


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
    """Paired DeLong test of AUC(score_a) vs AUC(score_b) on one set of rows; z and both p-values are NaN when the
    difference has zero variance.

    Raises:
        ValueError: When the rows do not hold both classes.
    """
    yy = np.asarray(y, dtype=np.float64)
    aucs, v10, v01 = _structural(yy, np.vstack([np.asarray(score_a, np.float64), np.asarray(score_b, np.float64)]))
    cov = np.cov(v10) / v10.shape[1] + np.cov(v01) / v01.shape[1]
    var = float(cov[0, 0] + cov[1, 1] - 2 * cov[0, 1])
    diff = float(aucs[0] - aucs[1])
    if not var > 0:   # zero variance (e.g. identical scores): the test statistic is undefined
        return DeLongPaired(float(aucs[0]), float(aucs[1]), diff, 0.0, float("nan"), float("nan"), float("nan"))
    se = math.sqrt(var)
    z = diff / se
    p_two = float(2 * stats.norm.sf(abs(z)))
    p_one = float(stats.norm.sf(z))
    return DeLongPaired(float(aucs[0]), float(aucs[1]), diff, se, z, p_two, p_one)


def hanley_mcneil_se(auc: float, n_pos: int, n_neg: int) -> float:
    """Hanley and McNeil (1982) standard error of an AUC from its value and the two class counts.

    Raises:
        ValueError: When either class count is below 1 (the AUC is undefined).
    """
    if n_pos < 1 or n_neg < 1:
        raise ValueError(f"an AUC standard error needs both classes (n_pos={n_pos}, n_neg={n_neg})")
    q1 = auc / (2 - auc)
    q2 = 2 * auc * auc / (1 + auc)
    var = (auc * (1 - auc) + (n_pos - 1) * (q1 - auc * auc) + (n_neg - 1) * (q2 - auc * auc)) / (n_pos * n_neg)
    return math.sqrt(max(var, 0.0))
