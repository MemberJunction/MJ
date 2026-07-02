"""Deterministic, comparable model metrics.

Classification: AUC, F1, accuracy, precision, recall.
Regression: RMSE, MAE, R2.

Returned as a plain ``Dict[str, float]`` so they map directly onto the TS
``ModelMetrics = Record<string, number>`` contract and drive the experiment
leaderboard (plan §8).
"""

from __future__ import annotations

from typing import Dict

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)


def classification_metrics(
    y_true: np.ndarray, y_pred: np.ndarray, y_score: np.ndarray
) -> Dict[str, float]:
    """Compute classification metrics.

    ``y_score`` is the positive-class probability for binary problems, or the
    per-class probability matrix for multiclass (used for AUC).
    """
    metrics: Dict[str, float] = {}
    classes = np.unique(np.concatenate([np.unique(y_true), np.unique(y_pred)]))
    is_binary = len(classes) <= 2

    # For binary problems sklearn's `binary` average needs a pos_label; the
    # default of 1 breaks when labels are strings ('renew'/'lapse'). Pick the
    # larger class value deterministically as the positive class so the AUC's
    # positive-class probability (scores[:,1]) and these metrics agree.
    if is_binary and len(classes) == 2:
        average = "binary"
        kw = {"average": average, "pos_label": classes[1], "zero_division": 0}
    else:
        average = "weighted"
        kw = {"average": average, "zero_division": 0}

    metrics["accuracy"] = float(accuracy_score(y_true, y_pred))
    metrics["f1"] = float(f1_score(y_true, y_pred, **kw))
    metrics["precision"] = float(precision_score(y_true, y_pred, **kw))
    metrics["recall"] = float(recall_score(y_true, y_pred, **kw))

    auc = _safe_auc(y_true, y_score)
    if auc is not None:
        metrics["auc"] = auc
    return metrics


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """Compute regression metrics."""
    mse = float(mean_squared_error(y_true, y_pred))
    return {
        "rmse": float(np.sqrt(mse)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "r2": float(r2_score(y_true, y_pred)),
    }


def _safe_auc(y_true: np.ndarray, y_score: np.ndarray):
    """ROC-AUC with graceful degradation (single-class folds, shape issues)."""
    try:
        classes = np.unique(y_true)
        if len(classes) < 2:
            return None
        if y_score.ndim == 1 or (y_score.ndim == 2 and y_score.shape[1] == 1):
            return float(roc_auc_score(y_true, np.ravel(y_score)))
        if y_score.shape[1] == 2:
            return float(roc_auc_score(y_true, y_score[:, 1]))
        return float(
            roc_auc_score(y_true, y_score, multi_class="ovr", average="weighted")
        )
    except Exception:
        return None
