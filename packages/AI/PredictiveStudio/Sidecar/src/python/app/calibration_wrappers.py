"""Calibration drivers (Doc 3 T1 — the first Calibration-kind components).

A calibrator is NOT a feature model: it consumes a raw ``probability`` (the single
input column) + the true labels, and emits a CALIBRATED probability that better
matches observed frequencies. Two classic post-hoc methods:
  - platt     : a 1-D logistic map raw→calibrated (parametric, monotone sigmoid).
  - isotonic  : a non-parametric monotone step function (more flexible, needs more n).

Both are fit on a calibration split (in a composite the executor carves one so the
calibrator never fits on the rows its upstream model fit on). The honest report is
ECE before vs after + the log-loss delta — a calibrator must never WORSEN log-loss.
Pure sklearn; no new dependency.
"""
from __future__ import annotations

from typing import Any, Dict

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression


class _PlattCalibrator:
    """Platt scaling: fit a 1-D logistic map from raw score → P(y=1)."""

    def __init__(self, **hp: Any):
        self._logit = LogisticRegression(max_iter=1000)

    def fit(self, raw, y):
        self._logit.fit(np.asarray(raw, dtype=float).reshape(-1, 1), np.asarray(y, dtype=int))
        return self

    def transform(self, raw):
        return self._logit.predict_proba(np.asarray(raw, dtype=float).reshape(-1, 1))[:, 1]


class _IsotonicCalibrator:
    """Isotonic regression: a non-parametric monotone raw → calibrated map."""

    def __init__(self, **hp: Any):
        self._iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)

    def fit(self, raw, y):
        self._iso.fit(np.asarray(raw, dtype=float), np.asarray(y, dtype=float))
        return self

    def transform(self, raw):
        return np.asarray(self._iso.predict(np.asarray(raw, dtype=float)))


_CALIBRATION_REGISTRY = {
    "platt": _PlattCalibrator,
    "isotonic": _IsotonicCalibrator,
}


def is_calibration(algorithm: str) -> bool:
    return algorithm in _CALIBRATION_REGISTRY


def build_calibration(algorithm: str, hp: Dict[str, Any]):
    return _CALIBRATION_REGISTRY[algorithm](**hp)


def expected_calibration_error(prob, y, n_bins: int = 10) -> float:
    """ECE: |confidence − accuracy| averaged over equal-width probability bins."""
    p = np.asarray(prob, dtype=float)
    ya = np.asarray(y, dtype=float)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(p)
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (p >= lo) & (p < hi if hi < 1.0 else p <= hi)
        if not mask.any():
            continue
        ece += (mask.sum() / n) * abs(p[mask].mean() - ya[mask].mean())
    return float(ece)
