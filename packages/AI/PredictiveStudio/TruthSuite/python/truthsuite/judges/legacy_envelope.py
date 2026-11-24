"""A legacy (v1) model envelope for G5.2's no-stored-schema half (`W1 -> S7.3 #2`), printed as JSON.

Models trained before Prediction Units score through ``/predict`` from a v1 envelope: a joblib-pickled estimator with
the fitted preprocessing and feature schema stored beside it. No route trains one any more, so this module builds one
the way the retired ``/train`` route did (the shape of the sidecar's ``tests/tools/legacy_envelope.py``): a seeded
logistic regression over three numeric features, the label classes stashed as ``mj_label_classes_``, the mean
training row as ``mj_driver_baseline_``, and an identity fitted preprocessing whose ``output_columns`` are the
features. The gate sends it to the running truth sidecar; nothing is stored, so there is nothing to clean up.

Prints ``{"artifactB64", "fittedPreprocessing", "featureSchema", "rows"}``: the envelope, its stored preprocessing and
schema, and three rows that carry every feature.
"""
from __future__ import annotations

import base64
import io
import json
import sys
from typing import TypedDict

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

FEATURES = ("DistanceZ", "Tenure", "Visits")
ENVELOPE_VERSION = 1
SEED = 42
TRAINING_ROWS = 300


class SchemaEntry(TypedDict):
    Name: str
    Kind: str


class FittedPreprocessing(TypedDict):
    ops: list[dict[str, object]]
    output_columns: list[str]


class LegacyFixture(TypedDict):
    artifactB64: str
    fittedPreprocessing: FittedPreprocessing
    featureSchema: list[SchemaEntry]
    rows: list[dict[str, float]]


def fitted_estimator() -> LogisticRegression:
    """A seeded binary logistic regression over FEATURES with the legacy route's two stashed attributes."""
    rng = np.random.default_rng(SEED)
    x = rng.normal(size=(TRAINING_ROWS, len(FEATURES)))
    y = (x[:, 0] - 0.5 * x[:, 1] + rng.normal(scale=0.5, size=TRAINING_ROWS) > 0).astype(np.int64)
    estimator = LogisticRegression(max_iter=1000, random_state=0)
    estimator.fit(x, y)
    estimator.mj_label_classes_ = ["0", "1"]
    estimator.mj_driver_baseline_ = x.mean(axis=0)
    return estimator


def envelope_b64(estimator: LogisticRegression, fitted: FittedPreprocessing, schema: list[SchemaEntry]) -> str:
    """The base64 v1 envelope text, serialized as the sidecar's legacy tool serializes it."""
    buf = io.BytesIO()
    joblib.dump(estimator, buf)
    envelope = {
        "format": "joblib",
        "version": ENVELOPE_VERSION,
        "payload_b64": base64.b64encode(buf.getvalue()).decode("ascii"),
        "fitted_preprocessing": fitted,
        "feature_schema": schema,
    }
    text = json.dumps(envelope, separators=(",", ":"), sort_keys=True)
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def build() -> LegacyFixture:
    """The fixture: the envelope, its stored preprocessing and schema, and three rows carrying every feature."""
    schema: list[SchemaEntry] = [{"Name": f, "Kind": "numeric"} for f in FEATURES]
    fitted: FittedPreprocessing = {"ops": [], "output_columns": list(FEATURES)}
    rows = [dict(zip(FEATURES, values)) for values in ((-1.0, 0.5, 2.0), (0.0, 0.0, 0.0), (1.5, -0.5, -1.0))]
    return {"artifactB64": envelope_b64(fitted_estimator(), fitted, schema), "fittedPreprocessing": fitted, "featureSchema": schema, "rows": rows}


def main() -> int:
    """Print the fixture as JSON on stdout."""
    sys.stdout.write(json.dumps(build()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
