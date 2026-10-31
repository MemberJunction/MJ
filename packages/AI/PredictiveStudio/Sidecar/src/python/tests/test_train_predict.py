"""/predict tests over legacy (v1) envelopes per algorithm, plus the FastAPI smoke test.

Models trained before Prediction Units keep scoring through /predict. Each algorithm's legacy envelope is built from
a small synthetic fixture by ``tests.tools.legacy_envelope`` (the calls the retired /train route made) and scored via
the artifact AND via the warm-cache model_id. Training itself is the trainer's (/trainer), tested elsewhere.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.datasets import make_classification, make_regression

from app.main import app
from tests.tools.legacy_envelope import legacy_envelope

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures: legacy envelopes built from synthetic data
# ---------------------------------------------------------------------------

def _classification_data(n: int = 240, seed: int = 7) -> Tuple[List[str], List[list]]:
    X, y = make_classification(
        n_samples=n,
        n_features=6,
        n_informative=4,
        n_redundant=1,
        random_state=seed,
    )
    columns = [f"f{i}" for i in range(X.shape[1])] + ["label"]
    rows = []
    for i in range(n):
        # map 0/1 -> human labels to exercise string-class handling
        label = "renew" if y[i] == 1 else "lapse"
        rows.append([float(v) for v in X[i]] + [label])
    return columns, rows


def _regression_data(n: int = 240, seed: int = 11) -> Tuple[List[str], List[list]]:
    X, y = make_regression(
        n_samples=n, n_features=6, n_informative=4, noise=8.0, random_state=seed
    )
    columns = [f"f{i}" for i in range(X.shape[1])] + ["target"]
    rows = [[float(v) for v in X[i]] + [float(y[i])] for i in range(n)]
    return columns, rows


def _feature_schema(columns: List[str], target: str) -> List[Dict[str, str]]:
    return [{"Name": c, "Kind": "numeric"} for c in columns if c != target]


def _envelope(algorithm: str, problem_type: str) -> Tuple[List[Dict[str, str]], str, str, Dict[str, object]]:
    """A legacy envelope of ``algorithm`` with standardized numeric features: (feature schema, artifact, model id, fitted)."""
    columns, rows = _classification_data() if problem_type == "classification" else _regression_data()
    target = "label" if problem_type == "classification" else "target"
    schema = _feature_schema(columns, target)
    artifact, model_id, fitted = legacy_envelope(
        algorithm, problem_type, columns, rows, schema, target, [{"op": "standardize", "cols": [fs["Name"] for fs in schema]}],
    )
    return schema, artifact, model_id, fitted


def _predict(artifact_b64, model_id, fitted, feature_schema, rows) -> dict:
    payload = {
        "fitted_preprocessing": fitted,
        "feature_schema": feature_schema,
        "rows": rows,
    }
    if artifact_b64:
        payload["artifact_b64"] = artifact_b64
    if model_id:
        payload["model_id"] = model_id
    resp = client.post("/predict", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


CLASSIFIERS = ["xgboost", "lightgbm", "logistic_regression", "random_forest", "mlp"]
REGRESSORS = ["xgboost", "lightgbm", "random_forest", "ridge", "mlp"]


@pytest.mark.parametrize("algorithm", CLASSIFIERS)
def test_classification_predict_from_artifact_and_cache(algorithm: str) -> None:
    schema, artifact, model_id, fitted = _envelope(algorithm, "classification")
    pred_rows = [{fs["Name"]: 0.5 for fs in schema}, {fs["Name"]: -0.5 for fs in schema}]
    p_artifact = _predict(artifact, None, fitted, schema, pred_rows)
    p_cache = _predict(None, model_id, fitted, schema, pred_rows)
    assert len(p_artifact["predictions"]) == 2
    for pred in p_artifact["predictions"]:
        assert pred["class"] in {"renew", "lapse"}
        assert 0.0 <= pred["score"] <= 1.0
    # identical inputs -> identical predictions whether from artifact or cache
    assert p_artifact["predictions"] == p_cache["predictions"]


@pytest.mark.parametrize("algorithm", REGRESSORS)
def test_regression_predict(algorithm: str) -> None:
    schema, artifact, _model_id, fitted = _envelope(algorithm, "regression")
    out = _predict(artifact, None, fitted, schema, [{fs["Name"]: 0.3 for fs in schema}])
    assert len(out["predictions"]) == 1
    assert isinstance(out["predictions"][0]["score"], float)
    assert out["predictions"][0].get("class") is None


def test_per_record_contributions_present_for_linear_classifier() -> None:
    """P1-5: a linear classifier (logistic regression) returns per-row signed contributions."""
    schema, artifact, _model_id, fitted = _envelope("logistic_regression", "classification")
    out = _predict(artifact, None, fitted, schema, [{fs["Name"]: 0.9 for fs in schema}, {fs["Name"]: -0.7 for fs in schema}])
    for pred in out["predictions"]:
        contribs = pred.get("contributions")
        assert contribs, "linear model should carry per-record contributions"
        assert all("feature" in c and "value" in c for c in contribs)
        # ranked by magnitude, descending
        mags = [abs(c["value"]) for c in contribs]
        assert mags == sorted(mags, reverse=True)


def test_per_record_contributions_present_for_linear_regressor() -> None:
    """P1-5: a linear regressor (ridge) also returns per-row signed contributions."""
    schema, artifact, _model_id, fitted = _envelope("ridge", "regression")
    out = _predict(artifact, None, fitted, schema, [{fs["Name"]: 0.4 for fs in schema}])
    assert out["predictions"][0].get("contributions"), "linear regressor should carry contributions"


def test_per_record_contributions_absent_for_tree_model() -> None:
    """P1-5: a tree model (random forest) has no exact per-row attribution → contributions is None."""
    schema, artifact, _model_id, fitted = _envelope("random_forest", "classification")
    out = _predict(artifact, None, fitted, schema, [{fs["Name"]: 0.5 for fs in schema}])
    assert out["predictions"][0].get("contributions") is None


def test_health_smoke() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "xgboost" in body["algorithms"]
    assert "lightgbm" in body["algorithms"]


@pytest.mark.parametrize("n_classes", [2, 3])
def test_legacy_predict_returns_every_class_probability_in_label_order(n_classes: int) -> None:
    """Legacy classification predictions carry every class's probability in the trained label order, which the
    response names as `classOrder`; `score` keeps its meaning (P(positive) for binary, the predicted class's else)."""
    X, y = make_classification(n_samples=300, n_features=6, n_informative=4, n_redundant=1, n_classes=n_classes,
                               random_state=5)
    names = ["c0", "c1", "c2"][:n_classes]
    columns = [f"f{i}" for i in range(X.shape[1])] + ["label"]
    rows = [[float(v) for v in X[i]] + [names[int(y[i])]] for i in range(len(y))]
    schema = _feature_schema(columns, "label")
    artifact, _model_id, fitted = legacy_envelope("logistic_regression", "classification", columns, rows, schema, "label",
                                                  [{"op": "standardize", "cols": columns[:-1]}])
    pred_rows = [{fs["Name"]: v for fs in schema} for v in (-1.0, 0.0, 1.0)]
    out = _predict(artifact, None, fitted, schema, pred_rows)
    assert out["classOrder"] == names
    for p in out["predictions"]:
        probs = p["probabilities"]
        assert len(probs) == n_classes and sum(probs) == pytest.approx(1.0)
        assert p["class"] == names[int(np.argmax(probs))]
        assert p["score"] == pytest.approx(probs[1] if n_classes == 2 else max(probs))
