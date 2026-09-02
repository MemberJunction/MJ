"""Predictive Studio Python ML sidecar — FastAPI service.

CPU-only tabular ML training + inference. The server side of the contract in
``packages/AI/PredictiveStudio/Core/src/sidecar-contract.ts``: MJ assembles the
feature matrix and orchestrates; this service fits/serves the model.

Endpoints:
  * ``GET  /health``   — liveness + registered algorithms + warm-cache depth
  * ``POST /train``    — fit a model, return artifact + fitted preprocessing + metrics
  * ``POST /predict``  — score rows by APPLYING (never re-fitting) frozen preprocessing
  * ``POST /describe`` — READ-ONLY statistics pre-pass over the training partition; fits
    nothing and returns no artifact (see :mod:`app.describe`)
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
from fastapi import FastAPI, HTTPException

from . import (
    algorithms,
    artifacts,
    composition,
    describe as describe_mod,
    metrics,
    preprocessing,
)
from .estimators import hmm as hmm_estimators
from .schemas import (
    DescribeRequest,
    DescribeResponse,
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
        _reject_unsupported_missingness(req)
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
        component_states=result.get("component_states"),
    )


def _run_sequence_training(req: TrainRequest) -> Dict[str, Any]:
    """Train a sequence model (problem_type='sequence') over per-entity observation histories.

    Deliberately separate from the supervised path, because three of its assumptions are wrong here:

    * **There is no supervised target.** An HMM is unsupervised over the observation sequence; the
      `target` column, if present, rides along and is not fitted against.
    * **A holdout must split by GROUP, never by row.** Splitting rows would put part of a member's
      history in train and part in holdout — leaking their future into their past and producing a
      holdout score that flatters the model. Whole entities are held out instead.
    * **The metrics are different.** There is no AUC and no R². What is comparable across sequence
      models is the mean POSTERIOR confidence of the assigned state, bounded 0–1.

    Raises:
        ValueError: when no sequence spec is supplied, or the group column is absent — either would
            otherwise train transitions between unrelated entities and still look successful.
    """
    if req.sequence is None or not req.sequence.group_field:
        raise ValueError(
            "problem_type='sequence' requires a `sequence.group_field` naming the column that says "
            "which entity each row belongs to. Without it every row would be treated as one long "
            "sequence and the model would learn transitions between unrelated records."
        )

    columns = list(req.data.columns)
    group_field = req.sequence.group_field
    if group_field not in columns:
        raise ValueError(
            f"sequence.group_field '{group_field}' is not a column in `data` "
            f"(columns: {', '.join(columns)})."
        )

    feature_cols = [c for c in _feature_columns(req) if c not in (group_field, req.sequence.order_field)]
    rows = req.data.rows
    group_idx = columns.index(group_field)
    group_values = [r[group_idx] for r in rows]

    ops_spec = [op.model_dump(exclude_none=True) for op in req.preprocessing]
    matrix, output_columns, fitted = preprocessing.fit_transform(columns, rows, ops_spec, feature_cols)

    lengths = hmm_estimators.sequence_lengths_from_groups(group_values)
    dev_lengths, hold_lengths, dev_rows_n = _split_sequences_by_group(lengths, req.validation.holdout_size)

    X_dev = matrix[:dev_rows_n]
    X_hold = matrix[dev_rows_n:]

    estimator = algorithms.build_estimator(req.algorithm, req.problem_type, dict(req.hyperparameters or {}))
    if hasattr(estimator, "mj_set_sequence_lengths"):
        estimator.mj_set_sequence_lengths(dev_lengths)
    if output_columns and hasattr(estimator, "mj_set_feature_names"):
        estimator.mj_set_feature_names(output_columns)
    estimator.fit(X_dev)

    result: Dict[str, Any] = {
        "estimator": estimator,
        "fitted": fitted,
        "metrics": _sequence_metrics(estimator, X_dev),
        # An HMM attributes to latent states, not to input features. Reporting a per-feature
        # importance would be inventing one.
        "feature_importance": {},
        "training_row_count": int(len(rows)),
    }
    if X_hold.shape[0] > 0 and hold_lengths:
        result["holdout_metrics"] = _sequence_metrics(estimator, X_hold)
    return result


def _split_sequences_by_group(
    lengths: List[int], holdout_size: Optional[float]
) -> Tuple[List[int], List[int], int]:
    """Hold out WHOLE entities, from the end, so no history is split across the boundary.

    Returns ``(dev_lengths, holdout_lengths, dev_row_count)``. A fraction that would leave no
    training groups holds nothing out — a holdout is worth less than a model.
    """
    fraction = holdout_size if holdout_size and holdout_size > 0 else 0.0
    if fraction <= 0 or len(lengths) < 2:
        return lengths, [], sum(lengths)
    hold_groups = int(len(lengths) * fraction)
    if hold_groups < 1 or hold_groups >= len(lengths):
        return lengths, [], sum(lengths)
    split_at = len(lengths) - hold_groups
    dev, hold = lengths[:split_at], lengths[split_at:]
    return dev, hold, sum(dev)


def _sequence_metrics(estimator: Any, X: np.ndarray) -> Dict[str, float]:
    """Posterior-based metrics for a sequence model — bounded and comparable across models.

    `mean_posterior` is the average confidence of the state each observation was assigned;
    `state_confidence` is the fraction of observations assigned with better than even confidence.
    A log-likelihood would be unbounded and comparable to nothing, so it is not reported as a score.
    """
    if X.shape[0] == 0 or not hasattr(estimator, "score_samples"):
        return {}
    try:
        confidence = np.asarray(estimator.score_samples(X), dtype=float)
    except Exception:  # pragma: no cover - a scoring failure must not lose the trained model
        return {}
    if confidence.size == 0:
        return {}
    return {
        "mean_posterior": float(np.mean(confidence)),
        "state_confidence": float(np.mean(confidence > 0.5)),
    }


def _reject_unsupported_missingness(req: TrainRequest) -> None:
    """Refuse a pipeline that preserves missingness for an estimator that cannot take it.

    Without this the failure surfaces as a raw sklearn "Input X contains NaN" from somewhere deep
    in the fit — and, worse, only when a row actually happens to be missing something, which may be
    long after the model was trained and promoted. Better to say it here, in terms of the two
    things the operator actually chose.
    """
    preserving = [
        op.col for op in req.preprocessing if op.op == "present" and op.preserveMissing and op.col
    ]
    if not preserving:
        return
    root = req.component_graph.driver if req.component_graph else req.algorithm
    if algorithms.tolerates_missing(root):
        return
    raise ValueError(
        f"'{root}' cannot be trained on missing values, but preprocessing preserves them for "
        f"{', '.join(sorted(preserving))}. Either impute those columns, drop preserveMissing, or "
        f"choose an algorithm that handles absence "
        f"({', '.join(sorted(algorithms.MISSING_TOLERANT_DRIVERS))})."
    )


def _feature_columns(req: TrainRequest) -> List[str]:
    """Ordered feature column names: prefer feature_schema, else data minus target."""
    if req.feature_schema:
        return [fs.Name for fs in req.feature_schema]
    return [c for c in req.data.columns if c != req.target]


def _split_holdout_indices(
    matrix: np.ndarray,
    y: np.ndarray,
    holdout_size,
    random_state: int,
    is_classification: bool,
) -> Tuple[np.ndarray, np.ndarray]:
    """Split row INDICES into (dev, holdout). Index-based so the caller can carry
    the raw dev rows alongside the transformed matrix (needed for the anti-skew
    validation split). When no holdout is configured, all rows are dev."""
    from sklearn.model_selection import train_test_split

    n = matrix.shape[0]
    all_idx = np.arange(n)
    if not holdout_size or holdout_size <= 0 or holdout_size >= 1:
        return all_idx, np.empty((0,), dtype=int)
    stratify = y if (is_classification or _looks_like_classes(y)) and len(np.unique(y)) > 1 else None
    dev_idx, hold_idx = train_test_split(
        all_idx, test_size=holdout_size, random_state=random_state, stratify=stratify
    )
    return dev_idx, hold_idx


def _looks_like_classes(y: np.ndarray) -> bool:
    """Heuristic: do these labels look categorical (so a holdout split can stratify)?

    True when the dtype is string/bool/int AND the distinct-value count is small
    relative to the sample size — i.e. a plausible label set rather than a continuum.
    """
    return y.dtype.kind in {"U", "S", "O", "b", "i"} and len(np.unique(y)) <= max(
        20, int(0.5 * len(y))
    )


def _run_training(req: TrainRequest) -> Dict[str, Any]:
    """Run the full training pipeline and return all artifacts the response needs.

    The anti-skew backbone (plan §6.2) lives here:
      1. Fit preprocessing on ALL training data → the FROZEN ``fitted`` payload.
      2. Label-encode classification targets to contiguous ints (XGBoost requires it),
         stashing the decode map on the estimator for /predict.
      3. Carve the locked holdout — an orchestrator-forwarded ``req.holdout`` (scored
         via the frozen transform, apply-only) takes precedence over a sidecar
         re-carve from ``validation.holdout_size``.
      4. Fit + score via :func:`_fit_and_score` (honest, train-fold-only validation),
         then re-fit the production estimator on all dev rows.
      5. Score the locked holdout exactly once.

    Returns:
        A dict with ``estimator``, ``fitted``, ``metrics``, ``feature_importance``,
        ``training_row_count``, and (when a holdout exists) ``holdout_metrics``.
    """
    if req.problem_type == "sequence":
        # A sequence model does not fit the supervised path at all: it is unsupervised over the
        # observation sequence, and a row-wise holdout would split a member's own history — leaking
        # their future into their past. It gets its own function rather than a branch per step.
        return _run_sequence_training(req)

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
    # We carve by ROW INDEX so the raw dev rows are available for an anti-skew
    # validation split (preprocessing fit on the train fold only — see below).
    forwarded_holdout = _prepare_forwarded_holdout(
        req, fitted, feature_cols, is_classification, encoder
    )
    if forwarded_holdout is not None:
        X_dev, y_dev = matrix, y
        dev_rows = rows
        X_hold, y_hold = forwarded_holdout
    else:
        dev_idx, hold_idx = _split_holdout_indices(
            matrix, y, req.validation.holdout_size, rng, is_classification
        )
        X_dev, y_dev = matrix[dev_idx], y[dev_idx]
        X_hold, y_hold = matrix[hold_idx], y[hold_idx]
        dev_rows = [rows[i] for i in dev_idx]

    # Train/validation split (or full-fit fallback for kfold/none). The validation
    # metric fits preprocessing on the TRAIN fold ONLY (no val-fold leakage), so the
    # reported `metrics` are an honest estimate; the production `estimator` + the
    # FROZEN `fitted` payload remain fit on ALL dev data.
    train_metrics, estimator = _fit_and_score(
        req, X_dev, y_dev, is_classification, rng,
        dev_rows=dev_rows, columns=columns, feature_cols=feature_cols, ops_spec=ops_spec,
        target_idx=target_idx, encoder=encoder,
        output_columns=output_columns,
    )

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

    if req.component_graph is not None:
        # One state per node, so the caller can write one `MJ: ML Components` row per
        # component instead of a single opaque root.
        result["component_states"] = composition.describe_states(
            req.component_graph, estimator, output_columns
        )

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
    *,
    dev_rows: List[Sequence[Any]],
    columns: List[str],
    feature_cols: List[str],
    ops_spec: List[Dict[str, Any]],
    target_idx: int,
    encoder: Any,
    output_columns: Optional[List[str]] = None,
) -> Tuple[Dict[str, float], Any]:
    """Fit the estimator using the configured validation strategy.

    For ``train_test_split`` the validation metric is computed with preprocessing
    fit on the TRAIN fold ONLY — the raw dev rows are split first, preprocessing is
    fit on the training fold and APPLIED (never re-fit) to the validation fold, and
    only then is the estimator scored. This prevents the validation fold from
    leaking into the fitted preprocessing (which would make ``metrics`` optimistic).

    Returns the (honest) validation metrics plus the FINAL estimator, re-fit on the
    full transformed dev matrix ``X`` (which carries the frozen, fit-on-all-dev
    preprocessing) so the shipped model uses every available row.
    """
    from sklearn.model_selection import train_test_split

    strategy = req.validation.strategy

    def build():
        # A composed model is a TREE of estimators; `algorithm` still names the root driver,
        # so every path that does not send a graph is untouched.
        if req.component_graph is not None:
            return composition.build_from_graph(
                req.component_graph,
                req.problem_type,
                output_columns,
                req.component_artifacts,
            )
        est = algorithms.build_estimator(
            req.algorithm, req.problem_type, req.hyperparameters
        )
        # Name-keyed estimators (the glass-box rubric) need the matrix's column names,
        # which sklearn's fit(X, y) does not carry. Injected here so BOTH the anti-skew
        # validation build and the final production build receive them.
        if output_columns and hasattr(est, "mj_set_feature_names"):
            est.mj_set_feature_names(output_columns)
        return est

    if strategy == "train_test_split" and X.shape[0] >= 4:
        test_size = req.validation.test_size or 0.2
        idx = np.arange(X.shape[0])
        stratify = y if is_classification and len(np.unique(y)) > 1 else None
        tr_idx, te_idx = train_test_split(
            idx, test_size=test_size, random_state=random_state, stratify=stratify
        )
        val_metrics = _anti_skew_val_metrics(
            req, dev_rows, columns, feature_cols, ops_spec, target_idx,
            tr_idx, te_idx, y, is_classification, encoder, build,
        )
        # re-fit on all dev data (with the frozen, fit-on-all-dev preprocessing)
        # for the production model.
        final = build()
        final.fit(X, y)
        return val_metrics, final

    # kfold / holdout-only / tiny data: fit on all dev data and score in-sample.
    est = build()
    est.fit(X, y)
    return _score(est, X, y, is_classification), est


def _anti_skew_val_metrics(
    req: TrainRequest,
    dev_rows: List[Sequence[Any]],
    columns: List[str],
    feature_cols: List[str],
    ops_spec: List[Dict[str, Any]],
    target_idx: int,
    tr_idx: np.ndarray,
    te_idx: np.ndarray,
    y_dev: np.ndarray,
    is_classification: bool,
    encoder: Any,
    build,
) -> Dict[str, float]:
    """Compute validation metrics with preprocessing fit on the TRAIN fold only.

    The raw dev rows are split by ``tr_idx``/``te_idx``; preprocessing is FIT on the
    train fold and APPLIED to the validation fold (fit-once / apply-everywhere within
    the split), so the validation fold never leaks into the fitted params.
    """
    tr_rows = [list(dev_rows[i]) for i in tr_idx]
    te_rows = [list(dev_rows[i]) for i in te_idx]

    # Fit preprocessing on the train fold ONLY, then apply to the validation fold.
    X_tr, _, fold_fitted = preprocessing.fit_transform(
        columns, tr_rows, ops_spec, feature_cols
    )
    te_feature_dicts = [
        {c: r[i] for i, c in enumerate(columns) if i != target_idx}
        for r in te_rows
    ]
    X_te = preprocessing.transform(te_feature_dicts, fold_fitted, feature_cols)

    y_tr = y_dev[tr_idx]
    y_te = y_dev[te_idx]

    est = build()
    est.fit(X_tr, y_tr)
    return _score(est, X_te, y_te, is_classification)


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


def _extract_importance(estimator: Any, columns: List[str]) -> Dict[str, float]:
    """Build a ``feature_name -> importance`` map from a fitted estimator.

    Prefers ``feature_importances_`` (tree models); falls back to the absolute,
    class-summed ``coef_`` magnitude (linear models). Returns ``{}`` when the
    estimator exposes neither. The map drives the leakage guard's single-feature-
    dominance check (plan §6.4).
    """
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

    A cell that is MISSING (only possible when preprocessing preserved it — see the `present` op)
    has no contribution to rank: ``coef * nan`` is nan and would silently vanish from the top-k.
    Those features are reported separately by :func:`_missing_features` instead, so "we had no data
    for this" stays visible rather than looking like "this did not matter".
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
                {"feature": feature_names[j], "value": float(contrib[j]), "hadData": True}
                for j in order
                if np.isfinite(contrib[j]) and abs(float(contrib[j])) > 1e-9
            ]
            out.append(row or None)
        return out
    except Exception:  # never let the explanation layer break scoring
        return [None] * n_rows


def _missing_features(X: np.ndarray, feature_names: List[str]) -> List[Optional[List[str]]]:
    """Per row, the features whose input value was missing.

    Empty for every row of a pipeline that does not preserve missingness — which is most of them,
    because absence is coerced to 0.0 unless a `present` op asks otherwise. Reported as ``None``
    rather than ``[]`` in that case, so "nothing was missing" and "we cannot tell" stay distinct.
    """
    n_rows = int(X.shape[0]) if hasattr(X, "shape") and X.ndim >= 1 else 0
    try:
        if X.ndim != 2 or len(feature_names) != X.shape[1]:
            return [None] * n_rows
        missing_mask = ~np.isfinite(X)
        if not missing_mask.any():
            return [None] * n_rows
        return [
            [feature_names[j] for j in np.flatnonzero(missing_mask[i])] or None
            for i in range(n_rows)
        ]
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
    missing = _missing_features(X, feature_names or [])
    if is_classification:
        # estimator.classes_ are the encoded ints [0..n-1]; map idx -> string label.
        encoded_labels = estimator.predict(X)
        scores = _positive_scores(estimator, X)
        return [
            _classification_prediction(
                scores, encoded_labels, label_classes, i, contribs[i], missing[i]
            )
            for i in range(X.shape[0])
        ]
    values = np.asarray(estimator.predict(X), dtype=float)
    return [
        Prediction(score=float(values[i]), contributions=contribs[i], missingFeatures=missing[i])
        for i in range(X.shape[0])
    ]


def _classification_prediction(
    scores: np.ndarray,
    encoded_labels: np.ndarray,
    label_classes: List[str],
    i: int,
    contributions: Optional[List[Dict[str, Any]]] = None,
    missing_features: Optional[List[str]] = None,
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
    return Prediction(
        score=score,
        contributions=contributions,
        missingFeatures=missing_features,
        **{"class": label},
    )


# ---------------------------------------------------------------------------
# /describe
# ---------------------------------------------------------------------------


@app.post("/describe", response_model=DescribeResponse)
def describe(req: DescribeRequest) -> DescribeResponse:
    """Measure the training partition — the statistics pre-pass (read-only).

    Returns per-feature and target statistics so the Model Development Agent can choose an
    architecture from evidence rather than from the goal statement alone. Nothing is fitted,
    cached, or persisted; the caller sends ONLY the training partition, because a statistic
    measured on the locked holdout would leak into every downstream decision.

    Raises 400 on an empty matrix or a target column that is not in the data — both are
    caller bugs that would otherwise surface as an opaque numeric error deep in the pass.
    """
    if not req.data or not req.data.rows:
        raise HTTPException(status_code=400, detail="describe requires a non-empty inline `data` matrix")
    try:
        return describe_mod.describe(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
