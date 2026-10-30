"""Proper scores per task family (per-row losses and their aggregates), secondary metrics, metric direction and the
cross-family ranking refusal.

Every primary score is lower-is-better; `METRIC_DIRECTION` gives the direction of every metric key, secondary metrics
included. A per-row loss exists for every metric that is a mean of row losses, so paired comparisons (model vs
baseline on the same rows) and the one-standard-error selection rule use the same numbers. RMSE and MASE are
aggregates of a row loss (sqrt of mean squared error; mean of scaled absolute errors).

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
from scipy import stats

from .array_types import FArr
from .calibration import calibration_fit
from .failures import RequestRefused
from .trainer_schemas import MetricKey, SecondaryMetric

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
        ValueError: For `tweedie-deviance` without a declared power, a power outside (1, 2), or an unknown metric.
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
    if metric == "tweedie-deviance":
        if tweedie_power is None:
            raise ValueError("tweedie-deviance needs the task's tweediePower")
        rl = row_tweedie_deviance(tweedie_power)
        return PrimaryScore(metric, rl, _mean_of(rl))
    raise ValueError(f"unknown primary metric {metric}")


# ------------------------------------------------------------------------------- secondary + direction -----

MetricDirection = Literal["lower-is-better", "higher-is-better", "closer-to-one"]
METRIC_DIRECTION: dict[MetricKey, MetricDirection] = {
    "log-loss": "lower-is-better", "brier": "lower-is-better", "multiclass-log-loss": "lower-is-better",
    "rmse": "lower-is-better", "mae": "lower-is-better", "poisson-deviance": "lower-is-better",
    "tweedie-deviance": "lower-is-better", "mase": "lower-is-better", "auc": "higher-is-better",
    "accuracy": "higher-is-better", "f1": "higher-is-better", "precision": "higher-is-better",
    "recall": "higher-is-better", "r2": "higher-is-better", "calibration-slope": "closer-to-one",
}
"""The direction of every metric key, mirroring Core's `METRIC_DIRECTION` key for key."""


def _auc_binary(y: FArr, s: FArr) -> float:
    pos = y == 1
    n1 = int(pos.sum())
    n0 = len(y) - n1
    if n1 == 0 or n0 == 0:
        return float("nan")
    r = stats.rankdata(s)
    return float((r[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def auc(y: FArr, p: FArr) -> float:
    """Binary AUC of P(classOrder[1]); multiclass: macro one-vs-rest."""
    pa = _f(p)
    if pa.ndim == 1:
        return _auc_binary(_f(y), pa)
    return float(np.mean(auc_by_class(y, pa)))


def auc_by_class(y: FArr, p: FArr) -> list[float]:
    """One-vs-rest AUC per class column of an (n, K) probability matrix, in classOrder."""
    yi = np.asarray(y, dtype=np.int64)
    pa = _f(p)
    return [_auc_binary((yi == k).astype(np.float64), pa[:, k]) for k in range(pa.shape[1])]


def _labels(p: FArr) -> FArr:
    pa = _f(p)
    return (pa >= 0.5).astype(np.float64) if pa.ndim == 1 else np.argmax(pa, axis=1).astype(np.float64)


def accuracy(y: FArr, p: FArr) -> float:
    return float(np.mean(_labels(p) == _f(y)))


def _prf(y: FArr, p: FArr) -> tuple[float, float, float]:
    """Precision, recall and F1 of the positive class at threshold 0.5; each is NaN when its denominator is zero
    (nothing predicted positive, or no actual positives), F1 whenever precision or recall is.

    Raises:
        ValueError: When `p` is not 1-D (these are binary metrics).
    """
    if _f(p).ndim != 1:
        raise ValueError("precision, recall and F1 need 1-D binary probabilities")
    yy = _f(y)
    yhat = _labels(p)
    tp = float(np.sum((yhat == 1) & (yy == 1)))
    fp = float(np.sum((yhat == 1) & (yy == 0)))
    fn = float(np.sum((yhat == 0) & (yy == 1)))
    nan = float("nan")
    prec = tp / (tp + fp) if tp + fp > 0 else nan
    rec = tp / (tp + fn) if tp + fn > 0 else nan
    f1 = nan if math.isnan(prec) or math.isnan(rec) else 2 * tp / (2 * tp + fp + fn)
    return prec, rec, f1


def r2(y: FArr, p: FArr) -> float:
    yy = _f(y)
    ss = float(np.sum((yy - yy.mean()) ** 2))
    return float(1 - float(np.sum((yy - _f(p)) ** 2)) / ss) if ss > 0 else float("nan")


_SECONDARY: dict[SecondaryMetric, ScoreFn] = {
    "auc": auc, "accuracy": accuracy, "r2": r2,
    "precision": lambda y, p: _prf(y, p)[0], "recall": lambda y, p: _prf(y, p)[1],
    "f1": lambda y, p: _prf(y, p)[2],
    "calibration-slope": lambda y, p: calibration_fit(y, p).slope,
}


def secondary_fn(metric: SecondaryMetric) -> ScoreFn:
    """The score function of a secondary metric. Secondary metrics are reported with intervals and never rank or
    gate. precision/recall/f1 are for the binary positive class classOrder[1] at threshold 0.5."""
    return _SECONDARY[metric]


# Task kinds and the proper-score families the protocol declares (Core `PROPER_SCORES_BY_FAMILY`).
ScoreFamily = Literal["binary", "multiclass", "continuous", "count", "non-negative", "forecast"]

FAMILY_OF_METRIC: dict[PrimaryMetric, tuple[ScoreFamily, ...]] = {
    "log-loss": ("binary",), "brier": ("binary",), "multiclass-log-loss": ("multiclass",),
    "rmse": ("continuous", "forecast"), "mae": ("continuous",), "poisson-deviance": ("count",),
    "tweedie-deviance": ("non-negative",), "mase": ("forecast",),
}


class CrossFamilyRankingRefused(RequestRefused):
    """A primary score of another family than the task (HTTP 400, nothing fitted); typed so the route and tests read
    the fields, never the message."""

    def __init__(self, task_kind: ScoreFamily, family: ScoreFamily, metric: PrimaryMetric) -> None:
        super().__init__(
            f"primary score {metric} (family '{family}') cannot rank a '{task_kind}' task: ranking across families "
            f"(e.g. Tweedie vs squared-error by RMSE) is refused; use the task family's proper score"
        )
        self.task_kind: ScoreFamily = task_kind
        self.family: ScoreFamily = family
        self.metric: PrimaryMetric = metric


def refuse_cross_family(task_kind: ScoreFamily, family: ScoreFamily, metric: PrimaryMetric) -> None:
    """Rank only by the task family's own proper score. A Tweedie or Poisson task ranked by RMSE (or any family
    mismatch) is refused before anything is fitted.

    Raises:
        CrossFamilyRankingRefused: When the protocol's score family is not the task's, or the metric is not one of
            that family's proper scores.
    """
    if family != task_kind or task_kind not in FAMILY_OF_METRIC[metric]:
        raise CrossFamilyRankingRefused(task_kind, family, metric)
