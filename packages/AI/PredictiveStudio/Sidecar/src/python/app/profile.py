"""POST /profile — the read-only profile of a draft Prediction Unit's development rows (PR 5, A4; DD-4, D5-32).

``/trainer`` cannot serve it: a TrainerRequest needs a persisted Training Snapshot, a training run and a protocol, none
of which exists before a plan is approved. ``/profile`` takes the development rows' feature columns, their labels, a
fold count and a seed in the body, holds no database connection and writes nothing. It returns, per field, the
single-feature inner-CV log-loss improvement over the dummy (the training folds' class prior) with a paired bootstrap
interval and a near-unique flag, plus the improvement of a cross-validated GLM on every field over the dummy on the
same folds. The agent's no-usable-signal refusal fires when that interval includes 0.

Encoding (fitted on each fold's training rows only): a column whose non-null values are all numbers is imputed with
the training median, standardised, and gets a missing indicator when it has nulls; any other column is one-hot over
its most frequent training categories (null is a category), every other value in one "other" column.
"""

from __future__ import annotations

import time
from typing import Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
from pydantic import BaseModel, ConfigDict, Field
from sklearn.linear_model import LogisticRegression

from .array_types import FArr, IntArr
from .folds import Fold, repeated_stratified
from .scores import row_log_loss

Cell = Optional[Union[float, str]]

BOOTSTRAP_DRAWS = 1000  # paired percentile bootstrap draws per interval (the trainer's interval default)
BOOTSTRAP_CHUNK = 100  # draws resampled per vectorised chunk, so a 12,000-row profile stays within a few MB
INTERVAL_LEVEL = 0.95  # the interval level every PS metric reports
NEAR_UNIQUE_SHARE = 0.95  # distinct non-null values on at least this share of rows: an identifier, not a feature
MAX_ONE_HOT = 50  # the most frequent training categories a categorical field is one-hot encoded over; the rest share one column
PRIOR_SMOOTHING = 0.5  # additive smoothing of the dummy's class prior, so a class absent from a training fold has p > 0
GLM_C = 1.0  # inverse L2 strength of the single-feature models and the GLM (scikit-learn's default)
GLM_MAX_ITER = 1000  # lbfgs iterations per fit; the standardised one-hot design converges well within it


class ProfileRequest(BaseModel):
    """The development rows only, as columns aligned with their labels (camelCase wire names, D-039)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    features: Dict[str, List[Cell]]
    labels: List[Union[float, str]]
    folds: int = Field(ge=2, le=20)
    seed: int


class ProfileRefused(ValueError):
    """A request outside the contract (HTTP 422): columns and labels of different lengths, fewer than two classes."""


def _interval_dict(value: float, lower: float, upper: float, n: int) -> Dict[str, object]:
    return {"metric": "log-loss", "value": value, "interval": {"level": INTERVAL_LEVEL, "lower": lower, "upper": upper}, "n": n}


def _label_indices(labels: Sequence[Union[float, str]]) -> Tuple[IntArr, List[str]]:
    tokens = [str(v).strip() for v in labels]
    classes = sorted(set(tokens))
    if len(classes) < 2:
        raise ProfileRefused(f"a profile needs at least two classes in the labels, got {len(classes)}")
    index = {c: i for i, c in enumerate(classes)}
    return np.asarray([index[t] for t in tokens], dtype=np.int64), classes


def _is_numeric(values: Sequence[Cell]) -> bool:
    return all(isinstance(v, (int, float)) for v in values if v is not None)


def _numeric_block(values: Sequence[Cell], train: IntArr) -> FArr:
    col = np.asarray([np.nan if v is None else float(v) for v in values], dtype=np.float64)
    missing = np.isnan(col)
    known = col[train][~missing[train]]
    median = float(np.median(known)) if known.size else 0.0
    filled = np.where(missing, median, col)
    sd = float(np.std(filled[train]))
    scaled = (filled - float(np.mean(filled[train]))) / (sd if sd > 0 else 1.0)
    blocks = [scaled.reshape(-1, 1)]
    if missing.any():
        blocks.append(missing.astype(np.float64).reshape(-1, 1))
    return np.hstack(blocks)


def _categorical_block(values: Sequence[Cell], train: IntArr) -> FArr:
    tokens = np.asarray(["\u0000null" if v is None else str(v) for v in values], dtype=object)
    cats, counts = np.unique(tokens[train], return_counts=True)
    order = np.argsort(-counts, kind="stable")
    kept = [str(c) for c in cats[order][:MAX_ONE_HOT]]
    out = np.zeros((len(tokens), len(kept) + 1), dtype=np.float64)
    position = {c: i for i, c in enumerate(kept)}
    for row, t in enumerate(tokens):
        out[row, position.get(str(t), len(kept))] = 1.0
    return out


def _design(columns: Sequence[Sequence[Cell]], train: IntArr) -> FArr:
    blocks = [_numeric_block(c, train) if _is_numeric(c) else _categorical_block(c, train) for c in columns]
    return np.hstack(blocks)


def _dummy_probabilities(y: IntArr, k: int, folds: Sequence[Fold]) -> FArr:
    out = np.zeros((len(y), k), dtype=np.float64)
    for fold in folds:
        counts = np.bincount(y[fold.train], minlength=k).astype(np.float64) + PRIOR_SMOOTHING
        out[fold.valid] = counts / counts.sum()
    return out


def _model_probabilities(columns: Sequence[Sequence[Cell]], y: IntArr, k: int, folds: Sequence[Fold]) -> FArr:
    out = np.zeros((len(y), k), dtype=np.float64)
    for fold in folds:
        x = _design(columns, fold.train)
        train_classes = np.unique(y[fold.train])
        if len(train_classes) < 2:
            counts = np.bincount(y[fold.train], minlength=k).astype(np.float64) + PRIOR_SMOOTHING
            out[fold.valid] = counts / counts.sum()
            continue
        model = LogisticRegression(C=GLM_C, max_iter=GLM_MAX_ITER)
        model.fit(x[fold.train], y[fold.train])
        probs = np.zeros((len(fold.valid), k), dtype=np.float64)
        probs[:, model.classes_.astype(np.int64)] = model.predict_proba(x[fold.valid])
        out[fold.valid] = probs
    return out


def _row_losses(y: IntArr, probs: FArr) -> FArr:
    if probs.shape[1] == 2:
        return row_log_loss(y.astype(np.float64), probs[:, 1])
    return row_log_loss(y.astype(np.float64), probs)


def _paired_improvement(dummy_loss: FArr, model_loss: FArr, seed: int) -> Dict[str, object]:
    diff = dummy_loss - model_loss
    n = len(diff)
    rng = np.random.default_rng(seed)
    means: List[float] = []
    remaining = BOOTSTRAP_DRAWS
    while remaining > 0:
        draws = min(BOOTSTRAP_CHUNK, remaining)
        idx = rng.integers(0, n, size=(draws, n))
        means.extend(diff[idx].mean(axis=1).tolist())
        remaining -= draws
    tail = (1 - INTERVAL_LEVEL) / 2 * 100
    lower, upper = np.percentile(means, [tail, 100 - tail])
    return _interval_dict(float(diff.mean()), float(lower), float(upper), n)


def _near_unique(values: Sequence[Cell]) -> bool:
    known = [v for v in values if v is not None]
    return len(values) > 0 and len(set(known)) >= NEAR_UNIQUE_SHARE * len(values)


def _validate(req: ProfileRequest) -> None:
    n = len(req.labels)
    if n < req.folds:
        raise ProfileRefused(f"a profile on {req.folds} folds needs at least {req.folds} rows, got {n}")
    if not req.features:
        raise ProfileRefused("a profile needs at least one feature column")
    for name, column in req.features.items():
        if len(column) != n:
            raise ProfileRefused(f"feature '{name}' has {len(column)} values for {n} labels")


def run_profile(req: ProfileRequest) -> Dict[str, object]:
    """The profile of the request's development rows; raises ProfileRefused for a request outside the contract."""
    started = time.monotonic()
    _validate(req)
    y, classes = _label_indices(req.labels)
    k = len(classes)
    folds = repeated_stratified(y, req.folds, 1, req.seed, stratify=True)
    dummy_loss = _row_losses(y, _dummy_probabilities(y, k, folds))
    names = sorted(req.features)
    fields = []
    for name in names:
        column = req.features[name]
        loss = _row_losses(y, _model_probabilities([column], y, k, folds))
        fields.append({"name": name, "improvement": _paired_improvement(dummy_loss, loss, req.seed), "nearUnique": _near_unique(column)})
    glm_loss = _row_losses(y, _model_probabilities([req.features[n] for n in names], y, k, folds))
    return {
        "fields": fields,
        "glmVsDummy": _paired_improvement(dummy_loss, glm_loss, req.seed),
        "computeSeconds": time.monotonic() - started,
    }
