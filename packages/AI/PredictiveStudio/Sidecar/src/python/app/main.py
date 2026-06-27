"""Predictive Studio Python ML sidecar — FastAPI service.

CPU-only tabular ML training + inference. The server side of the contract in
``packages/AI/PredictiveStudio/Core/src/sidecar-contract.ts``: MJ assembles the
feature matrix and orchestrates; this service fits/serves the model.

Endpoints:
  * ``GET  /health``  — liveness + registered algorithms + warm-cache depth
  * ``POST /train``   — fit a model, return artifact + fitted preprocessing + metrics
  * ``POST /predict``— score rows by APPLYING (never re-fitting) frozen preprocessing
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Tuple

import numpy as np
from fastapi import FastAPI, HTTPException

from . import algorithms, artifacts, metrics, preprocessing
from .schemas import (
    HealthResponse,
    PredictRequest,
    PredictResponse,
    Prediction,
    TrainRequest,
    TrainResponse,
)

app = FastAPI(title="Predictive Studio Sidecar", version="1.0.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        algorithms=algorithms.supported_algorithms(),
        cached_models=len(artifacts.MODEL_CACHE),
    )


# ---------------------------------------------------------------------------
# /train
# ---------------------------------------------------------------------------

@app.post("/train", response_model=TrainResponse)
def train(req: TrainRequest) -> TrainResponse:
    if req.data is None:
        raise HTTPException(
            status_code=400,
            detail="Inline `data` is required (data_ref shared-storage is not "
            "implemented in v1).",
        )
    if req.target not in req.data.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Target column '{req.target}' not found in data columns.",
        )

    started = time.perf_counter()
    try:
        result = _run_training(req)
    except algorithms.AlgorithmNotSupportedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    duration = time.perf_counter() - started

    artifact_b64, model_id = artifacts.serialize_envelope(
        result["estimator"],
        result["fitted"],
        [fs.model_dump() for fs in req.feature_schema],
    )
    # warm the cache so the immediately-following /predict is fast
    artifacts.MODEL_CACHE.put(model_id, (result["estimator"], {
        "fitted_preprocessing": result["fitted"],
    }))

    return TrainResponse(
        artifact_b64=artifact_b64,
        model_id=model_id,
        fitted_preprocessing=result["fitted"],
        metrics=result["metrics"],
        feature_importance=result["feature_importance"],
        training_row_count=result["training_row_count"],
        duration_sec=round(duration, 4),
        holdout_metrics=result.get("holdout_metrics"),
    )


def _feature_columns(req: TrainRequest) -> List[str]:
    """Ordered feature column names: prefer feature_schema, else data minus target."""
    if req.feature_schema:
        return [fs.Name for fs in req.feature_schema]
    return [c for c in req.data.columns if c != req.target]


def _split_holdout(
    matrix: np.ndarray, y: np.ndarray, holdout_size, random_state: int
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    from sklearn.model_selection import train_test_split

    if not holdout_size or holdout_size <= 0 or holdout_size >= 1:
        return matrix, np.empty((0, matrix.shape[1])), y, np.empty((0,), dtype=y.dtype)
    stratify = y if _looks_like_classes(y) and len(np.unique(y)) > 1 else None
    return train_test_split(
        matrix, y, test_size=holdout_size, random_state=random_state, stratify=stratify
    )


def _looks_like_classes(y: np.ndarray) -> bool:
    return y.dtype.kind in {"U", "S", "O", "b", "i"} and len(np.unique(y)) <= max(
        20, int(0.5 * len(y))
    )


def _run_training(req: TrainRequest) -> Dict[str, Any]:
    feature_cols = _feature_columns(req)
    target = req.target
    columns = list(req.data.columns)
    rows = req.data.rows
    target_idx = columns.index(target)

    # Fit preprocessing on the FULL training data, then transform. This `fitted`
    # payload is FROZEN: it is what gets applied (never re-fit) to the locked
    # holdout below and at /predict — the anti-skew guarantee (plan §6.2).
    ops_spec = [op.model_dump(exclude_none=True) for op in req.preprocessing]
    matrix, output_columns, fitted = preprocessing.fit_transform(
        columns, rows, ops_spec, feature_cols
    )

    y_raw = [r[target_idx] for r in rows]
    is_classification = req.problem_type == "classification"

    # Classification: label-encode to contiguous ints. XGBoost's sklearn wrapper
    # requires integer-encoded labels [0..n-1]; encoding uniformly across all
    # classifiers keeps the metrics + decode path identical. The original string
    # labels are stashed on the estimator so /predict can decode back. The same
    # fitted encoder is reused to encode the locked-holdout labels so the holdout
    # score uses an identical label mapping.
    label_classes: List[str] = []
    encoder = None
    if is_classification:
        from sklearn.preprocessing import LabelEncoder

        encoder = LabelEncoder()
        y = encoder.fit_transform([str(v) for v in y_raw])
        label_classes = [str(c) for c in encoder.classes_]
    else:
        y = np.array([float(v) for v in y_raw], dtype=float)

    rng = req.validation.random_state or 42

    # Carve off a locked holdout for scoring exactly once. Precedence:
    #   1. An explicit forwarded `req.holdout` (the orchestrator-carved locked
    #      holdout) — scored via the FROZEN fitted transform (apply-only).
    #   2. Else `validation.holdout_size` — the sidecar re-carves from `matrix`
    #      (fallback used by the sidecar's own fixtures).
    # When (1) is used, `data` already excludes the holdout, so we DON'T re-carve.
    forwarded_holdout = _prepare_forwarded_holdout(
        req, fitted, feature_cols, is_classification, encoder
    )
    if forwarded_holdout is not None:
        X_dev, y_dev = matrix, y
        X_hold, y_hold = forwarded_holdout
    else:
        X_dev, X_hold, y_dev, y_hold = _split_holdout(
            matrix, y, req.validation.holdout_size, rng
        )

    # Train/validation split (or full-fit fallback for kfold/none).
    train_metrics, estimator = _fit_and_score(req, X_dev, y_dev, is_classification, rng)

    # Stash decode map so the serialized model can map int predictions -> labels.
    if is_classification:
        estimator.mj_label_classes_ = label_classes

    feature_importance = _extract_importance(estimator, output_columns)

    result: Dict[str, Any] = {
        "estimator": estimator,
        "fitted": fitted,
        "metrics": train_metrics,
        "feature_importance": feature_importance,
        "training_row_count": int(len(rows)),
    }

    if X_hold.shape[0] > 0:
        result["holdout_metrics"] = _score(
            estimator, X_hold, y_hold, is_classification
        )
    return result


def _prepare_forwarded_holdout(
    req: TrainRequest,
    fitted: Dict[str, Any],
    feature_cols: List[str],
    is_classification: bool,
    encoder,
) -> Tuple[np.ndarray, np.ndarray] | None:
    """Transform + encode an explicit orchestrator-forwarded locked holdout.

    Returns ``(X_hold, y_hold)`` ready to score, or ``None`` when no `holdout`
    matrix was forwarded. The holdout feature rows are run through the FROZEN
    fitted preprocessing (``preprocessing.transform`` — apply only, never re-fit),
    so the holdout score is free of train/serve skew. Classification labels are
    encoded with the SAME fitted ``encoder`` used on the training labels.
    """
    if req.holdout is None or not req.holdout.rows:
        return None

    hold_columns = list(req.holdout.columns)
    if req.target not in hold_columns:
        raise ValueError(
            f"Holdout matrix is missing the target column '{req.target}'."
        )
    target_idx = hold_columns.index(req.target)

    # Map each holdout row to a feature-name -> value dict (the /predict shape)
    # so the frozen `preprocessing.transform` apply-path produces a positionally
    # identical vector to training.
    hold_rows = req.holdout.rows
    feature_dicts = [
        {c: r[i] for i, c in enumerate(hold_columns) if c != req.target}
        for r in hold_rows
    ]
    X_hold = preprocessing.transform(feature_dicts, fitted, feature_cols)

    y_raw_hold = [r[target_idx] for r in hold_rows]
    if is_classification:
        y_hold = encoder.transform([str(v) for v in y_raw_hold])
    else:
        y_hold = np.array([float(v) for v in y_raw_hold], dtype=float)
    return X_hold, y_hold


def _fit_and_score(
    req: TrainRequest,
    X: np.ndarray,
    y: np.ndarray,
    is_classification: bool,
    random_state: int,
) -> Tuple[Dict[str, float], Any]:
    """Fit the estimator using the configured validation strategy.

    Returns the validation metrics plus the FINAL estimator (re-fit on all dev
    data so the shipped model uses every available row).
    """
    from sklearn.model_selection import train_test_split

    strategy = req.validation.strategy

    def build():
        return algorithms.build_estimator(
            req.algorithm, req.problem_type, req.hyperparameters
        )

    if strategy == "train_test_split" and X.shape[0] >= 4:
        test_size = req.validation.test_size or 0.2
        stratify = y if is_classification and len(np.unique(y)) > 1 else None
        X_tr, X_te, y_tr, y_te = train_test_split(
            X, y, test_size=test_size, random_state=random_state, stratify=stratify
        )
        est = build()
        est.fit(X_tr, y_tr)
        val_metrics = _score(est, X_te, y_te, is_classification)
        # re-fit on all dev data for the production model
        final = build()
        final.fit(X, y)
        return val_metrics, final

    # kfold / holdout-only / tiny data: fit on all dev data and score in-sample.
    est = build()
    est.fit(X, y)
    return _score(est, X, y, is_classification), est


def _score(
    estimator: Any, X: np.ndarray, y: np.ndarray, is_classification: bool
) -> Dict[str, float]:
    if X.shape[0] == 0:
        return {}
    if is_classification:
        y_pred = estimator.predict(X)
        y_score = _positive_scores(estimator, X)
        return metrics.classification_metrics(y, y_pred, y_score)
    y_pred = estimator.predict(X)
    return metrics.regression_metrics(y, y_pred)


def _positive_scores(estimator: Any, X: np.ndarray) -> np.ndarray:
    if hasattr(estimator, "predict_proba"):
        return np.asarray(estimator.predict_proba(X))
    if hasattr(estimator, "decision_function"):
        return np.asarray(estimator.decision_function(X))
    return np.asarray(estimator.predict(X), dtype=float)


def _extract_importance(estimator: Any, columns: List[str]) -> Dict[str, float]:
    if hasattr(estimator, "feature_importances_"):
        values = np.asarray(estimator.feature_importances_, dtype=float)
    elif hasattr(estimator, "coef_"):
        coef = np.asarray(estimator.coef_, dtype=float)
        values = np.abs(coef).sum(axis=0) if coef.ndim > 1 else np.abs(coef)
    else:
        return {}
    n = min(len(columns), len(values))
    return {columns[i]: float(values[i]) for i in range(n)}


# ---------------------------------------------------------------------------
# /predict
# ---------------------------------------------------------------------------

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    try:
        estimator, _ = artifacts.load_estimator(req.artifact_b64, req.model_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not req.fitted_preprocessing or "output_columns" not in req.fitted_preprocessing:
        raise HTTPException(
            status_code=400,
            detail="fitted_preprocessing (with output_columns) is required at /predict.",
        )

    feature_cols = [fs.Name for fs in req.feature_schema] if req.feature_schema else (
        # fall back to declared output columns when no schema travels with predict
        list(req.fitted_preprocessing["output_columns"])
    )

    try:
        X = preprocessing.transform(req.rows, req.fitted_preprocessing, feature_cols)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Classification iff we stashed a label-decode map at train time. This is the
    # authoritative signal — a regressor never has it, and a classifier always does.
    label_classes = getattr(estimator, "mj_label_classes_", None)
    is_classification = label_classes is not None
    predictions = _build_predictions(estimator, X, is_classification, label_classes)
    return PredictResponse(predictions=predictions)


def _build_predictions(
    estimator: Any,
    X: np.ndarray,
    is_classification: bool,
    label_classes: List[str] = None,
) -> List[Prediction]:
    if X.shape[0] == 0:
        return []
    if is_classification:
        # estimator.classes_ are the encoded ints [0..n-1]; map idx -> string label.
        encoded_labels = estimator.predict(X)
        scores = _positive_scores(estimator, X)
        return [
            _classification_prediction(scores, encoded_labels, label_classes, i)
            for i in range(X.shape[0])
        ]
    values = np.asarray(estimator.predict(X), dtype=float)
    return [Prediction(score=float(values[i])) for i in range(X.shape[0])]


def _classification_prediction(
    scores: np.ndarray, encoded_labels: np.ndarray, label_classes: List[str], i: int
) -> Prediction:
    encoded = int(encoded_labels[i])
    label = (
        label_classes[encoded]
        if label_classes and 0 <= encoded < len(label_classes)
        else str(encoded)
    )
    n_classes = len(label_classes) if label_classes else 0
    # score = probability of the positive class (binary) or the predicted class.
    if scores.ndim == 2 and scores.shape[1] >= 2:
        if n_classes == 2:
            score = float(scores[i][1])  # canonical: P(positive class)
        else:
            idx = encoded if 0 <= encoded < scores.shape[1] else int(np.argmax(scores[i]))
            score = float(scores[i][idx])
    elif scores.ndim == 2 and scores.shape[1] == 1:
        score = float(scores[i][0])
    else:
        score = float(np.ravel(scores)[i])
    return Prediction(score=score, **{"class": label})
