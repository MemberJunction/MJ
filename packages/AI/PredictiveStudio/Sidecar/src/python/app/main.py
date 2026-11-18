"""Predictive Studio Python ML sidecar — FastAPI service.

CPU-only tabular ML training + inference. Training is the protocol-driven ``/trainer`` (the contract in
``packages/AI/PredictiveStudio/Core/src/trainer-contract.ts``); ``/predict`` also loads the legacy (v1) envelopes of
models trained before Prediction Units, so they keep scoring.

Endpoints:
  * ``GET  /health``  — liveness + registered algorithms + warm-cache depth
  * ``POST /trainer`` — one protocol-driven training: inner-CV selection, one holdout scoring, baselines, the gate
  * ``POST /predict``— score rows by APPLYING (never re-fitting) frozen preprocessing (legacy or v2 artifacts)
"""

from __future__ import annotations

import base64
import binascii
import time
from typing import AbstractSet, Any, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from . import algorithms, artifacts, preprocessing
from .array_types import FArr, IntArr
from .artifacts_v2 import PredictorEnvelope
from .failures import RequestRefused
from .run import run_trainer
from .trainer import DriverBaseline, TrainedPredictor, single_coef_row, top_signed_drivers
from .trainer_schemas import TrainerRequest
from .schemas import (
    Cell,
    HealthResponse,
    PredictRequest,
    PredictResponse,
    Prediction,
    PredictionContribution,
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
# /trainer
# ---------------------------------------------------------------------------

@app.post("/trainer")
def trainer(req: TrainerRequest) -> JSONResponse:
    """Run one protocol-driven training: inner-CV selection on development rows, one scoring of the locked holdout
    for one finalist, baselines, the gate and artifacts. Returns the TrainerResult (`completed`, or `failed` with its
    stage); a request that must not run at all (e.g. a primary score of another family) is a 400."""
    try:
        result = run_trainer(req)
    except RequestRefused as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse(result.model_dump(mode="json"))


def _positive_scores(estimator: Any, X: FArr) -> FArr:
    """Best available continuous score for classification metrics/predictions.

    Prefers calibrated ``predict_proba``, then ``decision_function``, then the
    raw ``predict`` output cast to float — so AUC/positive-class probability is
    derivable from whatever the estimator supports.
    """
    if hasattr(estimator, "predict_proba"):
        return np.asarray(estimator.predict_proba(X), dtype=np.float64)
    if hasattr(estimator, "decision_function"):
        return np.asarray(estimator.decision_function(X), dtype=np.float64)
    return np.asarray(estimator.predict(X), dtype=float)


# The legacy response carries importance shares only (no interval), so no bootstrap draws are spent on one.
@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    """Score 1..N rows by APPLYING (never re-fitting) the frozen preprocessing.

    Resolves the estimator from the warm cache or the supplied artifact, applies
    the frozen ``fitted_preprocessing`` to the rows (apply-only — the anti-skew
    guarantee), then predicts. Classification vs. regression is determined by the
    presence of the train-time label-decode map stashed on the estimator, so the
    response shape needs no out-of-band flag.

    A legacy model scores with the fitted preprocessing stored in its artifact: a request copy that differs from it is
    refused, and the request copy is used only when the artifact stores none. It scores only against the feature
    schema stored with it: a request without one is refused
    ("no stored feature schema"), never scored against the fitted output columns; a request schema that differs from
    the artifact's (its stored schema and the columns its fitted preprocessing reads) is refused naming each column
    the request lacks and each the artifact does not know, before any row is transformed; and rows that lack a schema
    column are refused with every missing column and every row column the schema does not name (a renamed feature
    shows as one of each), never scored with the column's value filled in.

    Raises:
        HTTPException: 400 for a missing artifact/cache key, missing
            ``fitted_preprocessing`` (with ``output_columns``), a request ``fitted_preprocessing`` that differs from
            the artifact's stored copy, no stored feature schema, a request schema that
            differs from the artifact's, rows that do not carry
            the schema's columns, or a transform error.
    """
    v2 = _load_v2(req.artifact_b64)
    if v2 is not None:
        return _predict_v2(v2[0], v2[1], req)
    try:
        estimator, envelope = artifacts.load_estimator(req.artifact_b64, req.model_id)
    except (ValueError, artifacts.ArtifactRefusedError) as exc:
        # ArtifactRefusedError is a ValueError too; named here so the intent is visible:
        # a refused or malformed artifact is the caller's error, never a 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    fitted = _resolve_fitted_preprocessing(envelope, req.fitted_preprocessing)

    if not req.feature_schema:
        raise HTTPException(
            status_code=400,
            detail="no stored feature schema: a legacy model scores only against the feature schema stored with it.",
        )
    feature_cols = [fs.Name for fs in req.feature_schema]
    _refuse_schema_the_artifact_does_not_match(feature_cols, envelope, fitted)
    _refuse_unmatched_columns(feature_cols, set(feature_cols), req.rows)

    try:
        X = preprocessing.transform(req.rows, fitted, feature_cols)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Classification iff we stashed a label-decode map at train time. This is the
    # authoritative signal — a regressor never has it, and a classifier always does.
    label_classes = getattr(estimator, "mj_label_classes_", None)
    is_classification = label_classes is not None
    # The transformed matrix X is aligned to the fitted output columns; those names align with a linear
    # model's coef_ for per-record contributions (P1-5). Absent/mismatched → contributions degrade to None.
    output_cols = list(fitted.get("output_columns") or [])
    predictions = _build_predictions(estimator, X, is_classification, label_classes, output_cols)
    return PredictResponse(predictions=predictions, classOrder=list(label_classes) if label_classes else None)


def _load_v2(artifact_b64: Optional[str]) -> Optional[Tuple[TrainedPredictor, PredictorEnvelope]]:
    """(predictor, envelope) when `artifact_b64` carries a ps-predictor/v2 envelope; None when it is another envelope
    (the legacy loader owns it). A refused v2 envelope is a 400, never a 500."""
    if not artifact_b64:
        return None
    try:
        raw = base64.b64decode(artifact_b64.encode("ascii"), validate=True)
    except (binascii.Error, UnicodeEncodeError):  # not base64 at all: the legacy loader reports it
        return None
    try:
        return artifacts.load_v2_envelope(raw)
    except artifacts.NotAV2EnvelopeError:
        return None
    except artifacts.ArtifactRefusedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _predict_v2(predictor: TrainedPredictor, envelope: PredictorEnvelope, req: PredictRequest) -> PredictResponse:
    """Score raw rows with a v2 predictor, its own in-fold encoding applied (never re-fit). Classification returns
    every class's probability in the artifact's declared classOrder; `score` is P(classOrder[1]) for binary, else
    the predicted class's probability. A linear predictor's rows carry signed drivers measured from the envelope's
    training mean; an envelope without one gives no driver."""
    names = [c.name for c in envelope.featureColumns if c.encoding.kind != "identifier"]
    _refuse_unmatched_columns(names, {c.name for c in envelope.featureColumns}, req.rows)
    frame = pd.DataFrame([{n: r.get(n) for n in names} for r in req.rows], columns=names)
    try:
        out = np.asarray(predictor.predict(frame), dtype=np.float64)
        drivers = predictor.contributions(frame, _envelope_driver_baseline(envelope))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    contribs = [None if d is None else [PredictionContribution(feature=f, value=v) for f, v in d] for d in drivers]
    order = envelope.classOrder
    if order is None:
        return PredictResponse(predictions=[Prediction(score=float(v), contributions=c) for v, c in zip(out, contribs)],
                               classOrder=None)
    probs = np.column_stack([1 - out, out]) if out.ndim == 1 else out
    preds: List[Prediction] = []
    for row, c in zip(probs, contribs):
        k = int(np.argmax(row))
        score = float(row[1]) if len(order) == 2 else float(row[k])
        preds.append(Prediction.model_validate({"score": score, "class": order[k], "contributions": c,
                                                "probabilities": [float(v) for v in row]}))
    return PredictResponse(predictions=preds, classOrder=list(order))


def _resolve_fitted_preprocessing(
    envelope: Mapping[str, Any], requested: Dict[str, Any]
) -> preprocessing.FittedPreprocessing:
    """The fitted preprocessing a legacy model scores with: the copy its artifact stores, when it stores one (with
    ``output_columns``); else the request's. A request copy beside a stored one must equal it as parsed structure
    (key order and JSON spelling do not matter), so a drifted copy never scores.

    Raises:
        HTTPException: 400 when the request copy differs from the stored one, when neither copy carries
            ``output_columns``, or when the request copy is malformed (an op lacking a key it needs, an unknown op).
    """
    stored = envelope.get("fitted_preprocessing")
    if isinstance(stored, dict) and "output_columns" in stored:
        if requested and requested != stored:
            raise HTTPException(
                status_code=400,
                detail="the request's fitted preprocessing differs from the model's stored copy; "
                       "a legacy model scores only with the preprocessing it was trained with.",
            )
        return stored
    if not requested or "output_columns" not in requested:
        raise HTTPException(
            status_code=400,
            detail="fitted_preprocessing (with output_columns) is required at /predict.",
        )
    try:
        preprocessing.validate_fitted_preprocessing(requested)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return requested


def _stored_schema_names(envelope: Mapping[str, Any]) -> List[str]:
    """The feature names a legacy envelope stores in its ``feature_schema`` ([] when it stores none)."""
    stored = envelope.get("feature_schema")
    if not isinstance(stored, list):
        return []
    return [str(e["Name"]) for e in stored if isinstance(e, dict) and "Name" in e]


def _refuse_schema_the_artifact_does_not_match(
    request_cols: Sequence[str], envelope: Mapping[str, Any], fitted: Mapping[str, Any]
) -> None:
    """Refuse (400) a request feature schema that differs from the legacy artifact's: the artifact's columns are its
    stored ``feature_schema`` together with every raw column its fitted preprocessing reads
    (``preprocessing.source_columns``), so no fitted column reaches the transform without a request column behind it.

    Raises:
        HTTPException: 400 naming every artifact column the request schema lacks and every request column the
            artifact does not know.
    """
    artifact_cols = _stored_schema_names(envelope)
    for col in preprocessing.source_columns(dict(fitted)):
        if col not in artifact_cols:
            artifact_cols.append(col)
    requested, known = set(request_cols), set(artifact_cols)
    missing = [c for c in artifact_cols if c not in requested]
    unknown = [c for c in request_cols if c not in known]
    if not missing and not unknown:
        return
    parts: List[str] = []
    if missing:
        parts.append(f"the request's feature schema lacks the model's columns: {missing}")
    if unknown:
        parts.append(f"the model does not know the request's columns: {unknown}")
    raise HTTPException(status_code=400, detail="; ".join(parts))


def _refuse_unmatched_columns(
    expected: Sequence[str], known: AbstractSet[str], rows: Sequence[Mapping[str, Cell]]
) -> None:
    """Refuse (400) rows that do not carry a model's feature columns: the detail names every `expected` column no
    row carries and every row column outside `known` (a renamed feature shows as one of each). Rows that carry every
    expected column pass, with or without columns the model does not read; no rows pass (nothing to score).

    Raises:
        HTTPException: 400 naming the missing columns and the unmatched row columns.
    """
    present = {k for r in rows for k in r}
    missing = sorted(n for n in expected if n not in present)
    if not rows or not missing:
        return
    detail = f"rows lack the model's feature columns: {missing}"
    unmatched = sorted(present - known)
    if unmatched:
        detail += f"; row columns the model's feature schema does not name: {unmatched}"
    raise HTTPException(status_code=400, detail=detail)


def _envelope_driver_baseline(envelope: PredictorEnvelope) -> Optional[DriverBaseline]:
    """The training mean a v2 envelope carries with its encoded column names, or None when either is absent."""
    if envelope.driverBaseline is None or envelope.transformedColumns is None:
        return None
    return DriverBaseline(np.asarray(envelope.driverBaseline, dtype=np.float64), list(envelope.transformedColumns))


def _row_contributions(
    estimator: Any, X: FArr, feature_names: List[str], top_k: int = 5
) -> List[Optional[List[PredictionContribution]]]:
    """Top signed per-record feature contributions for a LINEAR model (P1-5), else all-None.

    For a linear model the contribution of feature j to row i's output, measured from the mean development row
    ``x_bar`` stashed at training as ``mj_driver_baseline_``, is ``coef[j] * (X[i, j] - x_bar[j])`` (the log-odds
    contribution for classification, the value contribution for regression), so a driver says how the row differs
    from the training population rather than from zero. We rank by magnitude and return the top ``top_k``
    non-negligible ones per row. A model without the stashed mean (trained before it was stashed), any shape
    mismatch or an unexpected estimator yields ``[None, ...]``: no driver rather than one measured from zero, and
    /predict never fails because of the explanation layer — the score path is unaffected and the UI falls back to
    global importance.
    """
    n_rows = int(X.shape[0]) if hasattr(X, "shape") and X.ndim >= 1 else 0
    try:
        coef = single_coef_row(estimator)
        stashed = getattr(estimator, "mj_driver_baseline_", None)
        baseline = None if stashed is None else np.asarray(stashed, dtype=float).reshape(-1)
        if coef is None or baseline is None or X.ndim != 2 or X.shape[1] != coef.shape[0] \
                or len(feature_names) != coef.shape[0] or baseline.shape[0] != coef.shape[0]:
            return [None] * n_rows
        out: List[Optional[List[PredictionContribution]]] = []
        for i in range(n_rows):
            drivers = top_signed_drivers(coef * (np.asarray(X[i], dtype=float) - baseline), feature_names, top_k)
            out.append(None if drivers is None else [PredictionContribution(feature=f, value=v) for f, v in drivers])
        return out
    except Exception:  # never let the explanation layer break scoring
        return [None] * n_rows


def _build_predictions(
    estimator: Any,
    X: FArr,
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
        try:
            encoded_labels = estimator.predict(X)
            scores = _positive_scores(estimator, X)
        except ValueError as exc:
            raise _estimator_refusal(estimator, X, exc) from exc
        out = [
            _classification_prediction(scores, encoded_labels, label_classes, i, contribs[i])
            for i in range(X.shape[0])
        ]
        if scores.ndim == 2 and label_classes and scores.shape[1] == len(label_classes):
            for i, pred in enumerate(out):
                pred.probabilities = [float(v) for v in scores[i]]  # every class, in label order
        return out
    try:
        values = np.asarray(estimator.predict(X), dtype=float)
    except ValueError as exc:
        raise _estimator_refusal(estimator, X, exc) from exc
    return [
        Prediction(score=float(values[i]), contributions=contribs[i]) for i in range(X.shape[0])
    ]


def _estimator_refusal(estimator: Any, X: FArr, exc: ValueError) -> HTTPException:
    """The 400 for an estimator that refuses the transformed matrix: the feature count it was fitted on beside the
    count the rows carry (the usual cause: preprocessing that emits other columns than training did), never a 500."""
    expected = getattr(estimator, "n_features_in_", None)
    received = int(X.shape[1]) if X.ndim == 2 else 0
    expected_text = "an unrecorded number of" if expected is None else str(int(expected))
    return HTTPException(
        status_code=400,
        detail=f"the model expects {expected_text} feature columns but the transformed rows carry {received}: {exc}",
    )


def _classification_prediction(
    scores: FArr,
    encoded_labels: IntArr,
    label_classes: Optional[List[str]],
    i: int,
    contributions: Optional[List[PredictionContribution]] = None,
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
    return Prediction.model_validate({"score": score, "class": label, "contributions": contributions})
