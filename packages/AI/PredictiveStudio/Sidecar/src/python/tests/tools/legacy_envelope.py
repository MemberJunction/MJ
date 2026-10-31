"""A legacy (v1) model envelope for the ``/predict`` tests, built the way the retired ``/train`` route built one.

Models trained before Prediction Units keep scoring through ``/predict``, which loads their v1 envelopes. Those models
can no longer be trained here, so the tests build an envelope from the same calls the route made: the estimator from
:func:`algorithms.build_estimator`, the frozen preprocessing from :func:`preprocessing.fit_transform`, the label order
of a classifier from a label encoder over the target as text (``mj_label_classes_``), the mean training row for
per-row drivers (``mj_driver_baseline_``) and the envelope from :func:`artifacts.serialize_envelope`, with the model
cache warmed as the route warmed it.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

import numpy as np
from sklearn.preprocessing import LabelEncoder

from app import algorithms, artifacts, preprocessing


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
    estimator = algorithms.build_estimator(algorithm, problem_type, {})
    X, _output_columns, fitted = preprocessing.fit_transform(columns, rows, list(preprocessing_ops or []), feature_cols)
    if problem_type == "classification":
        encoder = LabelEncoder()
        y = encoder.fit_transform([str(v) for v in y_raw])
        estimator.fit(X, y)
        estimator.mj_label_classes_ = [str(c) for c in encoder.classes_]
    else:
        estimator.fit(X, np.array([float(str(v)) for v in y_raw], dtype=float))
    estimator.mj_driver_baseline_ = np.asarray(X, dtype=float).mean(axis=0)
    artifact_b64, model_id = artifacts.serialize_envelope(estimator, fitted, [dict(fs) for fs in feature_schema])
    artifacts.MODEL_CACHE.put(model_id, (estimator, {"fitted_preprocessing": fitted}))
    return artifact_b64, model_id, fitted
