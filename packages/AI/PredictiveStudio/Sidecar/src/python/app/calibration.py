"""Calibration measurement and calibration maps.

  calibration_fit  slope and intercept of y ~ a + b * logit(p) and calibration-in-the-large (y ~ offset(logit p)),
                   by Newton-Raphson on the Bernoulli likelihood (the same GLM the truth suite's reference pipeline
                   fits with statsmodels)
  reliability      10 equal-count bins: mean predicted vs observed rate
  Calibrator       Platt (logistic on logit p) or isotonic, one-vs-rest + renormalised for multiclass; fit on
                   predictions for rows the predicting model never trained on (out-of-fold), applied to the
                   finalist refit only when a 2-fold cross-fit of the map lowers the primary score

This module imports nothing from `scores` (which imports `calibration_fit` from here), so there is no cycle.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Literal, Union

import numpy as np
import numpy.typing as npt
from sklearn.base import BaseEstimator
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

from .array_types import FArr

# A family whose holdout calibration slope lies outside this range is hidden.
SLOPE_RANGE = (0.8, 1.2)


def logit(p: FArr, eps: float = 1e-6) -> FArr:
    q = np.clip(np.asarray(p, dtype=np.float64), eps, 1 - eps)
    return np.asarray(np.log(q / (1 - q)), dtype=np.float64)


def _newton_logistic(X: FArr, y: FArr, offset: FArr, iters: int = 100) -> FArr:
    """Maximum-likelihood coefficients of a logistic GLM with an offset (a 1e-12 ridge keeps the Hessian solvable)."""
    beta = np.zeros(X.shape[1], dtype=np.float64)
    for _ in range(iters):
        eta = X @ beta + offset
        mu = 1 / (1 + np.exp(-eta))
        w = mu * (1 - mu)
        grad = X.T @ (y - mu)
        hess = X.T @ (X * w[:, None])
        step = np.linalg.solve(hess + 1e-12 * np.eye(X.shape[1]), grad)
        beta = beta + step
        if float(np.max(np.abs(step))) < 1e-10:
            break
    return beta


@dataclass(frozen=True)
class CalibrationFit:
    """Calibration slope and intercept (y ~ a + b * logit p) and calibration-in-the-large (y ~ offset(logit p))."""

    slope: float
    intercept: float
    citl: float


def calibration_fit(y: FArr, p: FArr) -> CalibrationFit:
    """The calibration GLM fit of binary outcomes on predicted probabilities; slope and intercept are NaN when the
    predictions are constant (the slope is undefined)."""
    yy = np.asarray(y, dtype=np.float64)
    lp = logit(p)
    citl = float(_newton_logistic(np.ones((len(yy), 1), dtype=np.float64), yy, lp)[0])
    if float(np.ptp(lp)) < 1e-8:
        return CalibrationFit(float("nan"), float("nan"), citl)
    b = _newton_logistic(np.column_stack([np.ones(len(yy)), lp]), yy, np.zeros(len(yy), dtype=np.float64))
    return CalibrationFit(float(b[1]), float(b[0]), citl)


@dataclass(frozen=True)
class ReliabilityBin:
    """One equal-count bin of a reliability table."""

    bin_lower: float
    bin_upper: float
    mean_predicted: float
    observed_rate: float
    n: int


def reliability(y: FArr, p: FArr, bins: int = 10) -> List[ReliabilityBin]:
    """Equal-count bins of the predictions (stable sort order): mean predicted vs observed rate per bin."""
    yy = np.asarray(y, dtype=np.float64)
    pp = np.asarray(p, dtype=np.float64)
    order = np.argsort(pp, kind="mergesort")
    out: List[ReliabilityBin] = []
    for chunk in np.array_split(order, bins):
        if len(chunk) == 0:
            continue
        out.append(ReliabilityBin(float(pp[chunk].min()), float(pp[chunk].max()), float(pp[chunk].mean()),
                                  float(yy[chunk].mean()), int(len(chunk))))
    return out


def slope_hides_family(slope: float) -> bool:
    """A family whose holdout calibration slope is undefined or lies outside 0.8-1.2 is hidden."""
    return math.isnan(slope) or slope < SLOPE_RANGE[0] or slope > SLOPE_RANGE[1]


CalMethod = Literal["platt", "isotonic"]
CalMap = Union[LogisticRegression, IsotonicRegression]


# sklearn ships no type stubs, so BaseEstimator is `Any` to mypy and subclassing it is reported.
class Calibrator(BaseEstimator):  # type: ignore[misc]
    """A fitted calibration map. `apply` maps raw probabilities (1-D binary or (n, K)) to calibrated ones."""

    def __init__(self, method: CalMethod = "platt") -> None:
        self.method = method

    def fit(self, y: npt.NDArray[np.generic], p: FArr) -> "Calibrator":
        """Fit one map per class column (the positive class only for 1-D binary probabilities)."""
        P = p.reshape(-1, 1) if p.ndim == 1 else p
        yi = np.asarray(y, dtype=np.int64)
        cols = [1] if p.ndim == 1 else list(range(P.shape[1]))
        maps: List[CalMap] = []
        for j, k in enumerate(cols):
            yk = (yi == k).astype(np.int64)
            pk = P[:, j]
            if self.method == "platt":
                maps.append(LogisticRegression(C=1e6, max_iter=5000).fit(logit(pk).reshape(-1, 1), yk))
            else:
                maps.append(IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(pk, yk))
        self.maps_: List[CalMap] = maps
        self.multiclass_: bool = p.ndim != 1
        return self

    def apply(self, p: FArr) -> FArr:
        """Calibrated probabilities: clipped to [1e-6, 1 - 1e-6] for binary, renormalised rows for multiclass."""
        P = p.reshape(-1, 1) if p.ndim == 1 else p
        outs: List[FArr] = []
        for j, m in enumerate(self.maps_):
            pk = P[:, j]
            if isinstance(m, LogisticRegression):
                outs.append(np.asarray(m.predict_proba(logit(pk).reshape(-1, 1))[:, 1], dtype=np.float64))
            else:
                outs.append(np.asarray(m.predict(pk), dtype=np.float64))
        if not self.multiclass_:
            return np.clip(outs[0], 1e-6, 1 - 1e-6)
        Q = np.clip(np.column_stack(outs), 1e-6, None)
        return np.asarray(Q / Q.sum(axis=1, keepdims=True), dtype=np.float64)


def choose_method(kind: Literal["platt", "isotonic", "auto"], n_rows: int, threshold_rows: int) -> CalMethod:
    """`auto` picks Platt below `threshold_rows` rows (isotonic overfits small sets), isotonic at or above it."""
    if kind == "auto":
        return "platt" if n_rows < threshold_rows else "isotonic"
    return kind
