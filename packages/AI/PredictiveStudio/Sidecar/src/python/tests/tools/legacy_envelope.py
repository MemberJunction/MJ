"""Legacy (v1) model envelopes for the ``/predict`` tests, built the way the retired ``/train`` route built them.

Models trained before Prediction Units keep scoring through ``/predict``, which loads their v1 envelopes and applies
their frozen preprocessing. Those models can no longer be trained by the sidecar, so the fitting half lives here: the
estimator factories (``build_estimator``), the fit-once preprocessing (``fit_transform``), the label order of a
classifier from a label encoder over the target as text (``mj_label_classes_``), the mean training row for per-row
drivers (``mj_driver_baseline_``) and the envelope itself (``serialize_envelope``), with the model cache warmed as the
route warmed it.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.preprocessing import LabelEncoder
from lightgbm import LGBMClassifier, LGBMRegressor
from xgboost import XGBClassifier, XGBRegressor

from app import artifacts, preprocessing
from app.algorithms import AlgorithmNotSupportedError
from app.missing_values import is_missing
from app.preprocessing import FittedPreprocessing

ENVELOPE_VERSION = 1

# The seed every legacy factory passed to its estimator.
LEGACY_RANDOM_STATE = 0

# ---------------------------------------------------------------------------
# Estimators — one factory per legacy driver key, classifier or regressor by problem type
# ---------------------------------------------------------------------------


def _xgboost(problem_type: str) -> Any:
    """XGBoost with the histogram tree method; a classifier reports log loss."""
    common: Dict[str, Any] = {"n_jobs": -1, "tree_method": "hist", "random_state": LEGACY_RANDOM_STATE}
    if problem_type == "classification":
        return XGBClassifier(**common, eval_metric="logloss")
    return XGBRegressor(**common)


def _lightgbm(problem_type: str) -> Any:
    """LightGBM with quiet, small-leaf-friendly defaults."""
    common: Dict[str, Any] = {"n_jobs": -1, "verbose": -1, "min_child_samples": 5, "random_state": LEGACY_RANDOM_STATE}
    return LGBMClassifier(**common) if problem_type == "classification" else LGBMRegressor(**common)


def _logistic_regression(problem_type: str) -> Any:
    """Logistic regression (classification only)."""
    if problem_type != "classification":
        raise AlgorithmNotSupportedError("logistic_regression supports classification only.")
    return LogisticRegression(max_iter=1000, random_state=LEGACY_RANDOM_STATE)


def _random_forest(problem_type: str) -> Any:
    """Random forest on all cores."""
    if problem_type == "classification":
        return RandomForestClassifier(n_jobs=-1, random_state=LEGACY_RANDOM_STATE)
    return RandomForestRegressor(n_jobs=-1, random_state=LEGACY_RANDOM_STATE)


def _ridge(problem_type: str) -> Any:
    """Ridge (L2) regression (regression only)."""
    if problem_type != "regression":
        raise AlgorithmNotSupportedError("ridge supports regression only.")
    return Ridge(random_state=LEGACY_RANDOM_STATE)


def _mlp(problem_type: str) -> Any:
    """Multi-layer perceptron with a 500-iteration cap."""
    if problem_type == "classification":
        return MLPClassifier(max_iter=500, random_state=LEGACY_RANDOM_STATE)
    return MLPRegressor(max_iter=500, random_state=LEGACY_RANDOM_STATE)


LEGACY_DRIVERS: Dict[str, Callable[[str], Any]] = {
    "xgboost": _xgboost,
    "lightgbm": _lightgbm,
    "logistic_regression": _logistic_regression,
    "random_forest": _random_forest,
    "ridge": _ridge,
    "mlp": _mlp,
}


def build_estimator(algorithm: str, problem_type: str) -> Any:
    """An unfitted legacy estimator for ``algorithm`` (``classification`` or ``regression``).

    Raises:
        AlgorithmNotSupportedError: For an unknown key or a driver that cannot fit ``problem_type``.
    """
    factory = LEGACY_DRIVERS.get(algorithm)
    if factory is None:
        raise AlgorithmNotSupportedError(f"Unknown algorithm '{algorithm}'. Supported: {sorted(LEGACY_DRIVERS)}")
    return factory(problem_type)


# ---------------------------------------------------------------------------
# FIT helpers — each returns the learned params for one op
# ---------------------------------------------------------------------------

def _fit_impute(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit the imputation fill value for one column from the training frame.

    Learns the mean/median (numeric), the mode (categorical), or carries the
    declared constant. Returns the frozen ``{op, col, strategy, fill}`` params
    applied at ``/predict``.

    Raises:
        ValueError: For an unknown ``strategy``.
    """
    col = op["col"]
    strategy = op.get("strategy", "mean")
    series = df[col]
    if strategy == "mean":
        fill = float(pd.to_numeric(series, errors="coerce").mean())
    elif strategy == "median":
        fill = float(pd.to_numeric(series, errors="coerce").median())
    elif strategy == "mode":
        non_null = series.dropna()
        non_null = non_null[non_null.astype(str).str.strip() != ""]
        fill = non_null.mode().iloc[0] if not non_null.mode().empty else None
        fill = None if fill is None else _json_safe_scalar(fill)
    elif strategy == "constant":
        fill = op.get("fillValue")
    else:
        raise ValueError(f"Unknown impute strategy '{strategy}'")
    return {
        "op": "impute",
        "col": col,
        "strategy": strategy,
        "fill": fill,
        "indicator": bool(op.get("indicator", False)),
    }


def _fit_standardize(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit per-column mean/std for z-score standardization (population std, ddof=0).

    A degenerate (zero/non-finite std) column gets std=1.0 so apply-time division
    can't blow up — the column stays centered. Returns ``{op, cols, stats}``.
    """
    cols = op.get("cols") or ([op["col"]] if op.get("col") else [])
    stats: Dict[str, Dict[str, float]] = {}
    for col in cols:
        numeric = pd.to_numeric(df[col], errors="coerce")
        mean = float(numeric.mean())
        std = float(numeric.std(ddof=0))
        if not np.isfinite(std) or std == 0.0:
            std = 1.0  # degenerate column -> avoid divide-by-zero, keep centered
        stats[col] = {"mean": mean, "std": std}
    return {"op": "standardize", "cols": list(cols), "stats": stats}


def _fit_onehot(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit the sorted categorical vocabulary for one-hot encoding one column.

    The sorted vocabulary fixes the indicator-column order so train and serve
    produce positionally identical features. Returns ``{op, col, vocabulary}``.
    """
    col = op["col"]
    values = df[col].apply(lambda v: None if is_missing(v) else str(v))
    vocab = sorted({v for v in values if v is not None})
    return {"op": "onehot", "col": col, "vocabulary": vocab}


def _fit_bin(df: pd.DataFrame, op: Dict[str, Any]) -> Dict[str, Any]:
    """Fit quantile bin edges for discretizing one numeric column.

    Edges are the (deduplicated) quantiles of the non-null values; degenerate
    cases (empty / all-identical) fall back to a trivial two-edge range so the
    apply path always has a valid bucket boundary. Returns ``{op, col, edges}``.
    """
    col = op["col"]
    n_bins = int(op.get("bins") or 4)
    numeric = pd.to_numeric(df[col], errors="coerce").dropna()
    if numeric.empty:
        edges = [0.0, 1.0]
    else:
        quantiles = np.linspace(0.0, 1.0, n_bins + 1)
        edges = sorted(set(float(x) for x in np.quantile(numeric, quantiles)))
        if len(edges) < 2:  # all identical values
            base = edges[0] if edges else 0.0
            edges = [base, base + 1.0]
    return {"op": "bin", "col": col, "edges": edges}


def _json_safe_scalar(value: Any) -> Any:
    """Coerce numpy scalars to plain Python so the fitted payload is JSON-safe."""
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value

_FIT_DISPATCH: Dict[str, Callable[[pd.DataFrame, Dict[str, Any]], Dict[str, Any]]] = {
    "impute": _fit_impute,
    "standardize": _fit_standardize,
    "onehot": _fit_onehot,
    "bin": _fit_bin,
}


def _output_columns(fitted_ops: List[Dict[str, Any]], feature_columns: Sequence[str]) -> List[str]:
    """The training matrix's column order: missing indicators (impute op order), one-hot columns (op order), then the
    pass-through features.

    Raises:
        ValueError: When the assembled output columns contain a duplicate name.
    """
    onehot_cols = {op["col"] for op in fitted_ops if op["op"] == "onehot"}
    ordered: List[str] = [f"{op['col']}__missing" for op in fitted_ops if op["op"] == "impute" and op.get("indicator")]
    for op in fitted_ops:
        if op["op"] == "onehot":
            ordered.extend(f"{op['col']}={cat}" for cat in op["vocabulary"])
    ordered.extend(c for c in feature_columns if c not in onehot_cols)
    duplicates = sorted({c for c in ordered if ordered.count(c) > 1})
    if duplicates:
        raise ValueError(f"Duplicate output column '{duplicates[0]}' in the training matrix")
    return ordered


def fit_transform(
    columns: Sequence[str],
    rows: Sequence[Sequence[Any]],
    ops_spec: List[Dict[str, Any]],
    feature_columns: Sequence[str],
) -> Tuple[np.ndarray, List[str], FittedPreprocessing]:
    """Fit the stateful transforms on the rows, then transform them with ``preprocessing.transform`` (the ``/predict``
    path). ``feature_columns`` excludes the target. Returns ``(matrix, output_columns, fitted_preprocessing)``.

    Raises:
        ValueError: For an unknown op or a duplicate output column.
    """
    df = pd.DataFrame([list(r) for r in rows], columns=list(columns))
    fitted_ops: List[Dict[str, Any]] = []
    for op in ops_spec:
        fitter = _FIT_DISPATCH.get(op["op"])
        if fitter is None:
            raise ValueError(f"Unknown preprocessing op '{op['op']}'")
        fitted_ops.append(fitter(df, op))
    output_columns = _output_columns(fitted_ops, feature_columns)
    fitted: FittedPreprocessing = {"ops": fitted_ops, "output_columns": output_columns}
    matrix = preprocessing.transform(df.to_dict("records"), fitted, feature_columns)
    return matrix, output_columns, fitted


def serialize_envelope(estimator: Any, fitted_preprocessing: Dict[str, Any],
                       feature_schema: List[Dict[str, Any]]) -> Tuple[str, str]:
    """Serialize an estimator + metadata into a base64 v1 envelope. Returns ``(artifact_b64, model_id)``, where
    ``model_id`` is the content hash ``artifacts.artifact_hash`` computes (the warm-cache key)."""
    buf = io.BytesIO()
    joblib.dump(estimator, buf)
    envelope = {
        "format": "joblib",
        "version": ENVELOPE_VERSION,
        "payload_b64": base64.b64encode(buf.getvalue()).decode("ascii"),
        "fitted_preprocessing": fitted_preprocessing,
        "feature_schema": feature_schema,
    }
    envelope_json = json.dumps(envelope, separators=(",", ":"), sort_keys=True)
    artifact_b64 = base64.b64encode(envelope_json.encode("utf-8")).decode("ascii")
    return artifact_b64, hashlib.sha256(artifact_b64.encode("ascii")).hexdigest()


def legacy_envelope(
    algorithm: str,
    problem_type: str,
    columns: List[str],
    rows: List[List[object]],
    feature_schema: List[Dict[str, str]],
    target: str,
    preprocessing_ops: Optional[List[Dict[str, object]]] = None,
) -> Tuple[str, str, Dict[str, object]]:
    """Fit ``algorithm`` on every row and return ``(artifact_b64, model_id, fitted_preprocessing)``."""
    feature_cols = [fs["Name"] for fs in feature_schema]
    target_idx = columns.index(target)
    y_raw = [r[target_idx] for r in rows]
    estimator = build_estimator(algorithm, problem_type)
    X, _output_columns, fitted = fit_transform(columns, rows, list(preprocessing_ops or []), feature_cols)
    if problem_type == "classification":
        encoder = LabelEncoder()
        y = encoder.fit_transform([str(v) for v in y_raw])
        estimator.fit(X, y)
        estimator.mj_label_classes_ = [str(c) for c in encoder.classes_]
    else:
        estimator.fit(X, np.array([float(str(v)) for v in y_raw], dtype=float))
    estimator.mj_driver_baseline_ = np.asarray(X, dtype=float).mean(axis=0)
    artifact_b64, model_id = serialize_envelope(estimator, fitted, [dict(fs) for fs in feature_schema])
    artifacts.MODEL_CACHE.put(model_id, (estimator, {"fitted_preprocessing": fitted}))
    return artifact_b64, model_id, fitted
