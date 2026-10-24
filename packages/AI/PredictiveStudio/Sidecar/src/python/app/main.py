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
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Dict, Iterator, List, Literal, Optional, Sequence, Tuple

import numpy as np
from fastapi import FastAPI, HTTPException

if TYPE_CHECKING:  # scikit-learn is imported function-local at runtime; this import is for the type checker only.
    from sklearn.preprocessing import LabelEncoder

from . import algorithms, artifacts, metrics, preprocessing
from .schemas import (
    ImportanceKind,
    HealthResponse,
    PredictRequest,
    PredictResponse,
    Prediction,
    TrainRequest,
    TrainResponse,
)

app = FastAPI(title="Predictive Studio Sidecar", version="1.0.0")

MIN_VALIDATION_ROWS = 4

# Where the locked holdout came from, so refusals can name the knob that applies on that path:
# "forwarded" = orchestrator-carved (LockedHoldoutFraction), "carved" = sidecar re-carve (validation.holdout_size).
HoldoutSource = Literal["forwarded", "carved", "none"]


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness probe: report ``ok`` plus registered drivers and warm-cache depth.

    Polled by the TypeScript ``MLSidecar`` client until the process is ready.
    """
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
    """Fit a model on the assembled inline matrix and return the full train result.

    Validates the request (inline ``data`` required, ``target`` must be present),
    delegates the ML work to :func:`_run_training`, then serializes the estimator
    into a base64 envelope, warms the model cache (so an immediately-following
    ``/predict`` is fast), and returns the artifact, frozen fitted preprocessing,
    metrics, feature importance, and any locked-holdout metrics.

    Raises:
        HTTPException: 400 for a missing/invalid target, an unimplemented
            ``data_ref`` path, an unsupported algorithm, or any training ValueError.
    """
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
        feature_importance_kind=result["feature_importance_kind"],
        training_row_count=result["training_row_count"],
        duration_sec=round(duration, 4),
        holdout_metrics=result.get("holdout_metrics"),
        validation_out_of_sample=result["validation_out_of_sample"],
    )


def _feature_columns(req: TrainRequest) -> List[str]:
    """Ordered feature column names: prefer feature_schema, else data minus target."""
    if req.feature_schema:
        return [fs.Name for fs in req.feature_schema]
    return [c for c in req.data.columns if c != req.target]


def _split_holdout_indices(
    y: np.ndarray,
    holdout_size: Optional[float],
    random_state: int,
    is_classification: bool,
) -> Tuple[np.ndarray, np.ndarray]:
    """Split row INDICES into (dev, holdout) from the labels alone, before anything is fit, so the holdout rows
    never contribute to the fitted preprocessing that later scores them. When no holdout is configured, all rows
    are dev."""
    from sklearn.model_selection import train_test_split

    n = len(y)
    all_idx = np.arange(n)
    if not holdout_size or holdout_size <= 0 or holdout_size >= 1:
        return all_idx, np.empty((0,), dtype=int)
    stratify = y if is_classification and len(np.unique(y)) > 1 else None
    try:
        dev_idx, hold_idx = train_test_split(
            all_idx, test_size=holdout_size, random_state=random_state, stratify=stratify
        )
    except ValueError as exc:
        raise ValueError(
            _split_failure_message(f"carve a {holdout_size:g} locked holdout from", n, stratify, exc)
            + " Add rows or lower validation.holdout_size."
        ) from exc
    return dev_idx, hold_idx


def _split_failure_message(action: str, n_rows: int, stratify: Optional[np.ndarray], exc: ValueError) -> str:
    """Explain a failed ``train_test_split``. A stratified split usually fails because one class has too few rows
    (which can happen with thousands of rows), so that case names the least-populated class instead of the total."""
    if stratify is not None:
        _, class_counts = np.unique(stratify, return_counts=True)
        return (
            f"Could not {action} the {n_rows} training rows with every class on both sides: the least-populated "
            f"class has {int(np.min(class_counts))} row(s), too few to measure the model on rows it did not train "
            f"on ({exc})."
        )
    return (
        f"Could not {action} the {n_rows} training rows — too few to measure the model on rows it did not train "
        f"on ({exc})."
    )


def _holdout_advice(source: HoldoutSource) -> Tuple[str, str]:
    """``(context, remedy)`` phrases for a too-few-rows refusal: say "after the locked holdout" only when one was
    taken, and name the knob that controls it on the path this request used."""
    if source == "forwarded":
        return " after the locked holdout", " Add rows or lower LockedHoldoutFraction."
    if source == "carved":
        return " after the locked holdout", " Add rows or lower validation.holdout_size."
    return "", " Add rows."


def _run_training(req: TrainRequest) -> Dict[str, Any]:
    """Run the full training pipeline and return all artifacts the response needs.

    The anti-skew backbone (plan §6.2) lives here:
      1. Label-encode classification targets to contiguous ints (XGBoost requires it),
         stashing the decode map on the estimator for /predict.
      2. Separate the locked holdout — an orchestrator-forwarded ``req.holdout`` (already
         absent from ``data``) takes precedence over a sidecar re-carve from
         ``validation.holdout_size``. The re-carve happens BEFORE any fitting.
      3. Fit preprocessing on the dev rows only → the FROZEN ``fitted`` payload, and APPLY it
         (never re-fit) to the holdout rows.
      4. Fit + score via :func:`_fit_and_score` (honest, train-fold-only validation),
         then re-fit the production estimator on all dev rows.
      5. Score the locked holdout exactly once.

    Returns:
        A dict with ``estimator``, ``fitted``, ``metrics``, ``feature_importance``,
        ``feature_importance_kind``, ``training_row_count`` (dev rows the model was fit on),
        ``validation_out_of_sample``, and (when a holdout exists) ``holdout_metrics``.
    """
    feature_cols = _feature_columns(req)
    target = req.target
    columns = list(req.data.columns)
    rows = req.data.rows
    target_idx = columns.index(target)

    # Filter out rows where target is None (unlabeled / in-flight rows cannot be used for training)
    valid_indices = [i for i, r in enumerate(rows) if r[target_idx] is not None]
    if not valid_indices:
        raise HTTPException(
            status_code=400,
            detail=f"Target column '{target}' contains only null values in training data.",
        )
    if len(valid_indices) < len(rows):
        rows = [rows[i] for i in valid_indices]

    y_raw = [r[target_idx] for r in rows]
    is_classification = req.problem_type == "classification"

    # Classification: label-encode to contiguous ints. XGBoost's sklearn wrapper
    # requires integer-encoded labels [0..n-1]; encoding uniformly across all
    # classifiers keeps the metrics + decode path identical. The original string
    # labels are stashed on the estimator so /predict can decode back. The same
    # fitted encoder is reused to encode the locked-holdout labels so the holdout
    # score uses an identical label mapping.
    label_classes: List[str] = []
    encoder: Optional[LabelEncoder] = None
    if is_classification:
        from sklearn.preprocessing import LabelEncoder

        encoder = LabelEncoder()
        y = encoder.fit_transform([str(v) for v in y_raw])
        label_classes = [str(c) for c in encoder.classes_]
    else:
        y = np.array([float(v) for v in y_raw], dtype=float)

    # `or 42` would turn an explicit seed of 0 into 42.
    rng = 42 if req.validation.random_state is None else req.validation.random_state

    # Separate the locked holdout for scoring exactly once. Precedence:
    #   1. An explicit forwarded `req.holdout` (the orchestrator-carved locked
    #      holdout). `data` already excludes it, so we DON'T re-carve.
    #   2. Else `validation.holdout_size` — the sidecar re-carves from `rows`
    #      (fallback used by the sidecar's own fixtures).
    # Either way the holdout is set aside before preprocessing is fit, so its
    # statistics never reach the transform that scores it.
    forwarded = _forwarded_holdout_rows(req)
    holdout_source: HoldoutSource
    if forwarded is not None:
        hold_columns, hold_rows = forwarded
        dev_rows = rows
        y_dev = y
        holdout_source = "forwarded"
    else:
        dev_idx, hold_idx = _split_holdout_indices(y, req.validation.holdout_size, rng, is_classification)
        hold_columns = columns
        hold_rows = [rows[i] for i in hold_idx]
        dev_rows = [rows[i] for i in dev_idx]
        y_dev = y[dev_idx]
        holdout_source = "carved" if len(hold_idx) > 0 else "none"

    # Fit preprocessing on the dev rows only, then transform. This `fitted`
    # payload is FROZEN: it is what gets applied (never re-fit) to the locked
    # holdout below and at /predict — the anti-skew guarantee (plan §6.2).
    ops_spec = [op.model_dump(exclude_none=True) for op in req.preprocessing]
    X_dev, output_columns, fitted = preprocessing.fit_transform(columns, dev_rows, ops_spec, feature_cols)

    # Out-of-sample validation for every strategy (train/test split, holdout, or pooled K-fold). The validation
    # metric fits preprocessing on the TRAIN fold ONLY (no val-fold leakage), so the
    # reported `metrics` are an honest estimate; the production `estimator` + the
    # FROZEN `fitted` payload remain fit on ALL dev data.
    fit = _fit_and_score(
        req, X_dev, y_dev, is_classification, rng,
        dev_rows=dev_rows, columns=columns, feature_cols=feature_cols, ops_spec=ops_spec,
        target_idx=target_idx, holdout_source=holdout_source,
    )
    estimator = fit.estimator

    # Stash decode map so the serialized model can map int predictions -> labels.
    if is_classification:
        estimator.mj_label_classes_ = label_classes

    feature_importance, importance_kind = _extract_importance(estimator, output_columns)

    result: Dict[str, Any] = {
        "estimator": estimator,
        "fitted": fitted,
        "metrics": fit.metrics,
        "feature_importance": feature_importance,
        "feature_importance_kind": importance_kind,
        "training_row_count": int(len(dev_rows)),
        "validation_out_of_sample": fit.out_of_sample,
    }

    if hold_rows:
        X_hold, y_hold = _transform_holdout(
            hold_columns, hold_rows, target, fitted, feature_cols, is_classification, encoder
        )
        result["holdout_metrics"] = _score(estimator, X_hold, y_hold, is_classification)
    return result


def _forwarded_holdout_rows(req: TrainRequest) -> Optional[Tuple[List[str], List[List[Any]]]]:
    """The orchestrator-forwarded locked holdout as ``(columns, labelled rows)``, or ``None`` when none was
    forwarded or every forwarded row is unlabelled (unlabelled rows cannot be evaluated)."""
    if req.holdout is None or not req.holdout.rows:
        return None
    hold_columns = list(req.holdout.columns)
    if req.target not in hold_columns:
        raise ValueError(
            f"Holdout matrix is missing the target column '{req.target}'."
        )
    target_idx = hold_columns.index(req.target)
    hold_rows = [list(r) for r in req.holdout.rows if r[target_idx] is not None]
    if not hold_rows:
        return None
    return hold_columns, hold_rows


def _transform_holdout(
    hold_columns: List[str],
    hold_rows: Sequence[Sequence[Any]],
    target: str,
    fitted: Dict[str, Any],
    feature_cols: List[str],
    is_classification: bool,
    encoder: Optional[LabelEncoder],
) -> Tuple[np.ndarray, np.ndarray]:
    """Transform + encode locked-holdout rows, returning ``(X_hold, y_hold)`` ready to score.

    The feature rows are run through the FROZEN dev-fitted preprocessing (``preprocessing.transform`` — apply
    only, never re-fit), so the holdout score is free of train/serve skew and of holdout leakage. Classification
    labels are encoded with the SAME fitted ``encoder`` used on the training labels.
    """
    target_idx = hold_columns.index(target)
    # Map each holdout row to a feature-name -> value dict (the /predict shape)
    # so the frozen `preprocessing.transform` apply-path produces a positionally
    # identical vector to training.
    feature_dicts = [
        {c: r[i] for i, c in enumerate(hold_columns) if c != target}
        for r in hold_rows
    ]
    X_hold = preprocessing.transform(feature_dicts, fitted, feature_cols)

    y_raw_hold = [r[target_idx] for r in hold_rows]
    if is_classification:
        if encoder is None:
            raise RuntimeError("classification holdout scored without a fitted label encoder")
        y_hold = encoder.transform([str(v) for v in y_raw_hold])
    else:
        y_hold = np.array([float(v) for v in y_raw_hold], dtype=float)
    return X_hold, y_hold


@dataclass(frozen=True)
class FitResult:
    """What :func:`_fit_and_score` produces: the validation metrics, the production estimator, and whether those
    metrics were measured on rows the scoring model did not train on (set by the validation path taken)."""

    metrics: Dict[str, float]
    estimator: Any
    out_of_sample: bool


def _fit_and_score(
    req: TrainRequest,
    X: np.ndarray,
    y: np.ndarray,
    is_classification: bool,
    random_state: int,
    *,
    dev_rows: List[Sequence[Any]],
    columns: List[str],
    feature_cols: List[str],
    ops_spec: List[Dict[str, Any]],
    target_idx: int,
    holdout_source: HoldoutSource,
) -> FitResult:
    """Fit the estimator using the configured validation strategy.

    Validation metrics are computed out-of-sample for every strategy (`train_test_split`, `holdout`, and `kfold`)
    with preprocessing fit on the training fold only — the raw dev rows are split first, preprocessing is
    fit on the training fold and APPLIED (never re-fit) to the held-out fold, and
    only then is the estimator scored. This prevents the validation fold from
    leaking into the fitted preprocessing (which would make ``metrics`` optimistic).

    Returns the (honest) validation metrics plus the FINAL estimator, re-fit on the
    full transformed dev matrix ``X`` (which carries the frozen, fit-on-all-dev
    preprocessing) so the shipped model uses every available row.
    """
    from sklearn.model_selection import train_test_split

    def build() -> Any:
        return algorithms.build_estimator(
            req.algorithm, req.problem_type, req.hyperparameters
        )

    fold_ctx = FoldContext(dev_rows, columns, feature_cols, ops_spec, target_idx, y, build)
    n_dev = X.shape[0]
    context, remedy = _holdout_advice(holdout_source)
    if n_dev < MIN_VALIDATION_ROWS:
        raise ValueError(
            f"Only {n_dev} training rows remain{context}; at least {MIN_VALIDATION_ROWS} are needed to "
            f"measure the model on rows it did not train on.{remedy}"
        )

    if req.validation.strategy == "kfold":
        val_metrics = _kfold_out_of_fold_metrics(req, fold_ctx, is_classification, random_state)
        out_of_sample = True  # pooled out-of-fold: each row is scored by a fold model that never saw it
    else:
        # `train_test_split` and `holdout` (the schema's Literal admits nothing else) share one out-of-sample split
        # (F-SC-1): `holdout` used to score in-sample.
        test_size = req.validation.test_size or 0.2
        idx = np.arange(n_dev)
        stratify = y if is_classification and len(np.unique(y)) > 1 else None
        try:
            tr_idx, te_idx = train_test_split(idx, test_size=test_size, random_state=random_state, stratify=stratify)
        except ValueError as exc:
            raise ValueError(
                _split_failure_message(f"split {test_size:g} for validation from", n_dev, stratify, exc)
                + remedy.rstrip(".") + ", or increase test_size."
            ) from exc
        val_metrics = _anti_skew_val_metrics(fold_ctx, tr_idx, te_idx, is_classification)
        out_of_sample = True  # scored on the split's test rows, which the scoring model never trained on

    # The production estimator is fit on all dev rows (with the frozen, fit-on-all-dev preprocessing).
    final = build()
    final.fit(X, y)
    return FitResult(metrics=val_metrics, estimator=final, out_of_sample=out_of_sample)


@dataclass(frozen=True)
class FoldContext:
    """The per-training-run inputs every validation fold shares: raw dev rows, schema, preprocessing spec, target and
    the estimator factory."""

    dev_rows: List[Sequence[Any]]
    columns: List[str]
    feature_cols: List[str]
    ops_spec: List[Dict[str, Any]]
    target_idx: int
    y_dev: np.ndarray
    build: Callable[[], Any]


def _anti_skew_val_metrics(
    ctx: FoldContext, tr_idx: np.ndarray, te_idx: np.ndarray, is_classification: bool
) -> Dict[str, float]:
    """Compute validation metrics with preprocessing fit on the TRAIN fold only.

    The raw dev rows are split by ``tr_idx``/``te_idx``; preprocessing is FIT on the
    train fold and APPLIED to the validation fold (fit-once / apply-everywhere within
    the split), so the validation fold never leaks into the fitted params.
    """
    est, X_te = _fit_fold(ctx, tr_idx, te_idx)
    return _score(est, X_te, ctx.y_dev[te_idx], is_classification)


def _fit_fold(ctx: FoldContext, tr_idx: np.ndarray, te_idx: np.ndarray) -> Tuple[Any, np.ndarray]:
    """Fit preprocessing and the estimator on the training fold only; return the estimator and the transformed
    held-out fold (preprocessing APPLIED, never re-fit — no held-out leakage into the fitted params)."""
    tr_rows = [list(ctx.dev_rows[i]) for i in tr_idx]
    te_rows = [list(ctx.dev_rows[i]) for i in te_idx]
    X_tr, _, fold_fitted = preprocessing.fit_transform(ctx.columns, tr_rows, ctx.ops_spec, ctx.feature_cols)
    te_feature_dicts = [{c: r[i] for i, c in enumerate(ctx.columns) if i != ctx.target_idx} for r in te_rows]
    X_te = preprocessing.transform(te_feature_dicts, fold_fitted, ctx.feature_cols)
    est = ctx.build()
    est.fit(X_tr, ctx.y_dev[tr_idx])
    return est, X_te


def _kfold_splits(
    y_dev: np.ndarray, k: int, is_classification: bool, random_state: int
) -> Iterator[Tuple[np.ndarray, np.ndarray]]:
    """Validate K against the rows/classes and return the (stratified for classification) fold splitter's splits."""
    # Function-local, as every other scikit-learn import in main.py is.
    from sklearn.model_selection import KFold, StratifiedKFold

    n_rows = len(y_dev)
    if k < 2 or k > n_rows:
        raise ValueError(f"kfold needs 2 <= K <= {n_rows} (the training rows); got K={k}.")
    idx = np.arange(n_rows)
    if not is_classification:
        return KFold(n_splits=k, shuffle=True, random_state=random_state).split(idx)
    _, class_counts = np.unique(y_dev, return_counts=True)
    if len(class_counts) < 2:
        raise ValueError("kfold needs at least two classes in the training rows; the target has only one.")
    smallest = int(np.min(class_counts))
    if smallest < k:
        raise ValueError(
            f"kfold with K={k} needs at least {k} rows of every class; the smallest class has {smallest}. "
            "Lower K or use train_test_split."
        )
    return StratifiedKFold(n_splits=k, shuffle=True, random_state=random_state).split(idx, y_dev)


def _kfold_out_of_fold_metrics(
    req: TrainRequest, ctx: FoldContext, is_classification: bool, random_state: int
) -> Dict[str, float]:
    """Pooled out-of-fold metrics for ``kfold``: every dev row is predicted exactly once by a model (and preprocessing)
    fit without it. ``K`` = ``req.validation.k`` (default 5); stratified folds for classification."""
    n_rows = len(ctx.dev_rows)
    k = req.validation.k or 5
    splits = _kfold_splits(ctx.y_dev, k, is_classification, random_state)

    oof_pred: Optional[np.ndarray] = None
    oof_score: Optional[np.ndarray] = None
    for tr_idx, te_idx in splits:
        est, X_te = _fit_fold(ctx, tr_idx, te_idx)
        pred = np.asarray(est.predict(X_te))
        if oof_pred is None:
            oof_pred = np.empty(n_rows, dtype=pred.dtype)
        oof_pred[te_idx] = pred
        if is_classification:
            score = _positive_scores(est, X_te)
            if oof_score is None:
                oof_score = np.empty((n_rows,) + score.shape[1:], dtype=float)
            oof_score[te_idx] = score

    # K >= 2 guarantees at least one fold; explicit raises (not `assert`, which `python -O` strips) narrow for mypy.
    if oof_pred is None:
        raise RuntimeError(f"kfold produced no out-of-fold predictions (K={k}, rows={n_rows})")
    if not is_classification:
        return metrics.regression_metrics(ctx.y_dev, oof_pred)
    if oof_score is None:
        raise RuntimeError(f"kfold produced no out-of-fold scores (K={k}, rows={n_rows})")
    return metrics.classification_metrics(ctx.y_dev, oof_pred, oof_score)


def _score(
    estimator: Any, X: np.ndarray, y: np.ndarray, is_classification: bool
) -> Dict[str, float]:
    """Score a fitted estimator against ``(X, y)`` and return the metric map.

    Dispatches to classification vs. regression metrics; returns an empty dict for
    an empty matrix (e.g. no holdout rows).
    """
    if X.shape[0] == 0:
        return {}
    if is_classification:
        y_pred = estimator.predict(X)
        y_score = _positive_scores(estimator, X)
        return metrics.classification_metrics(y, y_pred, y_score)
    y_pred = estimator.predict(X)
    return metrics.regression_metrics(y, y_pred)


def _positive_scores(estimator: Any, X: np.ndarray) -> np.ndarray:
    """Best available continuous score for classification metrics/predictions.

    Prefers calibrated ``predict_proba``, then ``decision_function``, then the
    raw ``predict`` output cast to float — so AUC/positive-class probability is
    derivable from whatever the estimator supports.
    """
    if hasattr(estimator, "predict_proba"):
        return np.asarray(estimator.predict_proba(X))
    if hasattr(estimator, "decision_function"):
        return np.asarray(estimator.decision_function(X))
    return np.asarray(estimator.predict(X), dtype=float)


def _extract_importance(estimator: Any, columns: List[str]) -> Tuple[Dict[str, float], ImportanceKind]:
    """Build a ``(feature_name -> importance map, kind)`` pair from a fitted estimator.

    Prefers ``feature_importances_`` (tree models); falls back to the absolute,
    class-summed ``coef_`` magnitude (linear models). Returns ``({}, "none")`` when the
    estimator exposes neither. The kind says which of the two numbers the map holds. The map drives the leakage guard's single-feature-
    dominance check (plan §6.4).
    """
    if hasattr(estimator, "feature_importances_"):
        values = np.asarray(estimator.feature_importances_, dtype=float)
        kind: ImportanceKind = "split_or_impurity"
    elif hasattr(estimator, "coef_"):
        raw = np.asarray(estimator.coef_, dtype=float)
        # Multi-class linear models produce (n_classes, n_features); sum magnitudes across classes
        values = np.sum(np.abs(raw), axis=0) if raw.ndim > 1 else np.abs(raw)
        kind = "coefficient"
    else:
        return {}, "none"
    total = float(np.sum(np.abs(values)))
    if total > 0:
        values = values / total
    n = min(len(columns), len(values))
    return {columns[i]: float(values[i]) for i in range(n)}, kind


# ---------------------------------------------------------------------------
# /predict
# ---------------------------------------------------------------------------

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    """Score 1..N rows by APPLYING (never re-fitting) the frozen preprocessing.

    Resolves the estimator from the warm cache or the supplied artifact, applies
    the frozen ``fitted_preprocessing`` to the rows (apply-only — the anti-skew
    guarantee), then predicts. Classification vs. regression is determined by the
    presence of the train-time label-decode map stashed on the estimator, so the
    response shape needs no out-of-band flag.

    Raises:
        HTTPException: 400 for a missing artifact/cache key, missing
            ``fitted_preprocessing`` (with ``output_columns``), or a transform error.
    """
    try:
        estimator, _ = artifacts.load_estimator(req.artifact_b64, req.model_id)
    except (ValueError, artifacts.ArtifactRefusedError) as exc:
        # ArtifactRefusedError is a ValueError too; named here so the intent is visible:
        # a refused or malformed artifact is the caller's error, never a 500.
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
    # The transformed matrix X is aligned to the fitted output columns; those names align with a linear
    # model's coef_ for per-record contributions (P1-5). Absent/mismatched → contributions degrade to None.
    output_cols = list(req.fitted_preprocessing.get("output_columns") or [])
    predictions = _build_predictions(estimator, X, is_classification, label_classes, output_cols)
    return PredictResponse(predictions=predictions)


def _linear_coef_row(estimator: Any) -> Optional[np.ndarray]:
    """The single coefficient vector for a linear model, or None when per-row attribution isn't exact.

    Returns the 1-D ``coef_`` for regression (Ridge) or binary classification (LogisticRegression,
    ``coef_`` shape ``(1, n)``). Returns None for tree/ensemble models (no ``coef_``) and for multiclass
    (``coef_`` shape ``(k, n)``, k>1) — those fall back to global importance rather than a dishonest guess.
    """
    if not hasattr(estimator, "coef_"):
        return None
    coef = np.asarray(estimator.coef_, dtype=float)
    if coef.ndim == 1:
        return coef
    if coef.ndim == 2 and coef.shape[0] == 1:
        return coef[0]
    return None


def _row_contributions(
    estimator: Any, X: np.ndarray, feature_names: List[str], top_k: int = 5
) -> List[Optional[List[Dict[str, Any]]]]:
    """Top signed per-record feature contributions for a LINEAR model (P1-5), else all-None.

    For a linear model the exact contribution of feature j to row i's output is ``coef[j] * X[i, j]``
    (the log-odds contribution for classification, the value contribution for regression). We rank by
    magnitude and return the top ``top_k`` non-negligible ones per row. Any shape mismatch or unexpected
    estimator yields ``[None, ...]`` so /predict never fails because of the explanation layer — the score
    path is unaffected and the UI falls back to global importance.
    """
    n_rows = int(X.shape[0]) if hasattr(X, "shape") and X.ndim >= 1 else 0
    try:
        coef = _linear_coef_row(estimator)
        if coef is None or X.ndim != 2 or X.shape[1] != coef.shape[0] or len(feature_names) != coef.shape[0]:
            return [None] * n_rows
        out: List[Optional[List[Dict[str, Any]]]] = []
        for i in range(n_rows):
            contrib = coef * np.asarray(X[i], dtype=float)
            order = np.argsort(-np.abs(contrib))[:top_k]
            row = [
                {"feature": feature_names[j], "value": float(contrib[j])}
                for j in order
                if abs(float(contrib[j])) > 1e-9
            ]
            out.append(row or None)
        return out
    except Exception:  # never let the explanation layer break scoring
        return [None] * n_rows


def _build_predictions(
    estimator: Any,
    X: np.ndarray,
    is_classification: bool,
    label_classes: Optional[List[str]] = None,
    feature_names: Optional[List[str]] = None,
) -> List[Prediction]:
    """Build one :class:`Prediction` per transformed row, in input order.

    Regression rows carry only a numeric ``score``. Classification rows decode the
    estimator's encoded integer prediction back to its original string ``class``
    (via ``label_classes``) and attach the positive-class/predicted-class score.
    Each row also carries its top signed feature contributions when the model
    supports exact per-row attribution (linear models); None otherwise (P1-5).
    """
    if X.shape[0] == 0:
        return []
    contribs = _row_contributions(estimator, X, feature_names or [])
    if is_classification:
        # estimator.classes_ are the encoded ints [0..n-1]; map idx -> string label.
        encoded_labels = estimator.predict(X)
        scores = _positive_scores(estimator, X)
        return [
            _classification_prediction(scores, encoded_labels, label_classes, i, contribs[i])
            for i in range(X.shape[0])
        ]
    values = np.asarray(estimator.predict(X), dtype=float)
    return [
        Prediction(score=float(values[i]), contributions=contribs[i]) for i in range(X.shape[0])
    ]


def _classification_prediction(
    scores: np.ndarray,
    encoded_labels: np.ndarray,
    label_classes: List[str],
    i: int,
    contributions: Optional[List[Dict[str, Any]]] = None,
) -> Prediction:
    """Assemble the i-th classification :class:`Prediction` (decoded label + score).

    The score convention: for binary problems it is P(positive class) (column 1);
    for multiclass it is the probability of the predicted class; 1-D/single-column
    score arrays fall back to the available value. ``class`` is the decoded string
    label, or the raw integer when no decode map is available.
    """
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
    return Prediction(score=score, contributions=contributions, **{"class": label})
