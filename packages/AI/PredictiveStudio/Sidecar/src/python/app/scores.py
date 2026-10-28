"""Primary proper scores per task family, as per-row losses and their aggregates.

Every primary score is lower-is-better. A per-row loss exists for every metric that is a mean of row losses, so
paired comparisons (model vs baseline on the same rows) and the one-standard-error selection rule use the same
numbers. RMSE and MASE are aggregates of a row loss (sqrt of mean squared error; mean of scaled absolute errors).

Predictions: binary -> P(classOrder[1]) as a 1-D array; multiclass -> (n, K) probabilities in classOrder;
continuous/count/non-negative -> the conditional mean.

The legacy `/train` route's `metrics` module reports sklearn summary metrics (AUC, F1, RMSE, ...) as one dictionary
per model and has no per-row losses; the trainer ranks on proper scores row by row, so this module is a separate,
typed mechanism by design and shares no code with it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Literal

import numpy as np
import numpy.typing as npt

FArr = npt.NDArray[np.float64]
EPS = 1e-15

PrimaryMetric = Literal[
    "log-loss", "brier", "multiclass-log-loss", "rmse", "mae", "poisson-deviance", "tweedie-deviance", "mase"
]
RowLoss = Callable[[FArr, FArr], FArr]
ScoreFn = Callable[[FArr, FArr], float]


def _f(a: object) -> FArr:
    return np.asarray(a, dtype=np.float64)


def row_log_loss(y: FArr, p: FArr) -> FArr:
    """Binary: y in {0,1}, p = P(y=1). Multiclass: y = class index, p = (n, K) probabilities."""
    pa = _f(p)
    if pa.ndim == 1:
        q = np.clip(pa, EPS, 1 - EPS)
        yy = _f(y)
        return np.asarray(-(yy * np.log(q) + (1 - yy) * np.log(1 - q)), dtype=np.float64)
    q = np.clip(pa, EPS, 1 - EPS)
    q = q / q.sum(axis=1, keepdims=True)
    yi = np.asarray(y, dtype=np.int64)
    return np.asarray(-np.log(q[np.arange(len(yi)), yi]), dtype=np.float64)


def row_brier(y: FArr, p: FArr) -> FArr:
    """Squared distance between the predicted probabilities and the one-hot outcome."""
    pa = _f(p)
    if pa.ndim == 1:
        return np.asarray((pa - _f(y)) ** 2, dtype=np.float64)
    yi = np.asarray(y, dtype=np.int64)
    onehot = np.zeros_like(pa)
    onehot[np.arange(len(yi)), yi] = 1.0
    return np.asarray(np.sum((pa - onehot) ** 2, axis=1), dtype=np.float64)


def row_squared_error(y: FArr, p: FArr) -> FArr:
    return np.asarray((_f(y) - _f(p)) ** 2, dtype=np.float64)


def row_absolute_error(y: FArr, p: FArr) -> FArr:
    return np.asarray(np.abs(_f(y) - _f(p)), dtype=np.float64)


def row_poisson_deviance(y: FArr, mu: FArr) -> FArr:
    """Unit Poisson deviance 2 (y log(y/mu) - (y - mu)), with y log(y/mu) = 0 at y = 0."""
    yy = _f(y)
    m = np.maximum(_f(mu), EPS)
    ylog = np.where(yy > 0, yy * np.log(np.where(yy > 0, yy, 1.0) / m), 0.0)
    return np.asarray(2 * (ylog - (yy - m)), dtype=np.float64)


def row_tweedie_deviance(power: float) -> RowLoss:
    """The unit Tweedie deviance at a variance power strictly between 1 (Poisson) and 2 (gamma)."""
    if not 1.0 < power < 2.0:
        raise ValueError(f"tweedie power must be in (1, 2), got {power}")

    def loss(y: FArr, mu: FArr) -> FArr:
        yy = _f(y)
        m = np.maximum(_f(mu), EPS)
        p = power
        return np.asarray(
            2 * (np.power(yy, 2 - p) / ((1 - p) * (2 - p)) - yy * np.power(m, 1 - p) / (1 - p) + np.power(m, 2 - p) / (2 - p)),
            dtype=np.float64,
        )

    return loss


@dataclass(frozen=True)
class PrimaryScore:
    """A primary proper score: its metric key, per-row loss and aggregate (lower is better)."""

    metric: PrimaryMetric
    row_loss: RowLoss
    aggregate: ScoreFn


def _mean_of(row_loss: RowLoss) -> ScoreFn:
    return lambda y, p: float(np.mean(row_loss(y, p)))


def _rmse(y: FArr, p: FArr) -> float:
    return float(math.sqrt(float(np.mean(row_squared_error(y, p)))))


def primary_score(metric: PrimaryMetric, tweedie_power: float | None) -> PrimaryScore:
    """The primary score for a protocol's proper-score metric. Count targets rank on Poisson deviance and
    non-negative targets on Tweedie deviance at the task's declared power. MASE rows are scaled absolute errors (the
    caller divides by each origin's scale), so its aggregate is their mean.

    Raises:
        ValueError: For `tweedie-deviance` without a declared power, or a power outside (1, 2).
    """
    if metric in ("log-loss", "multiclass-log-loss"):
        return PrimaryScore(metric, row_log_loss, _mean_of(row_log_loss))
    if metric == "brier":
        return PrimaryScore(metric, row_brier, _mean_of(row_brier))
    if metric == "rmse":
        return PrimaryScore(metric, row_squared_error, _rmse)
    if metric in ("mae", "mase"):
        return PrimaryScore(metric, row_absolute_error, _mean_of(row_absolute_error))
    if metric == "poisson-deviance":
        return PrimaryScore(metric, row_poisson_deviance, _mean_of(row_poisson_deviance))
    if tweedie_power is None:
        raise ValueError("tweedie-deviance needs the task's tweediePower")
    rl = row_tweedie_deviance(tweedie_power)
    return PrimaryScore(metric, rl, _mean_of(rl))
