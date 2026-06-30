"""End-to-end /train + /predict tests per algorithm, plus the FastAPI smoke test.

Each algorithm is trained on a small synthetic fixture (make_classification /
make_regression) and asserted to hit sane metrics, then round-tripped through
/predict (via the artifact AND via the warm-cache model_id).
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.datasets import make_classification, make_regression

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures: build inline-matrix train requests from synthetic data
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


def _train_request(algorithm: str, problem_type: str) -> dict:
    if problem_type == "classification":
        columns, rows = _classification_data()
        target = "label"
    else:
        columns, rows = _regression_data()
        target = "target"

    # standardize the numeric features so preprocessing is exercised on the path
    feature_cols = [c for c in columns if c != target]
    return {
        "algorithm": algorithm,
        "problem_type": problem_type,
        "hyperparameters": {},
        "validation": {
            "strategy": "train_test_split",
            "test_size": 0.25,
            "holdout_size": 0.2,
        },
        "feature_schema": _feature_schema(columns, target),
        "preprocessing": [{"op": "standardize", "cols": feature_cols}],
        "target": target,
        "data": {"columns": columns, "rows": rows},
    }


CLASSIFIERS = ["xgboost", "lightgbm", "logistic_regression", "random_forest", "mlp"]
REGRESSORS = ["xgboost", "lightgbm", "random_forest", "ridge", "mlp"]


@pytest.mark.parametrize("algorithm", CLASSIFIERS)
def test_classification_train_predict(algorithm: str) -> None:
    req = _train_request(algorithm, "classification")
    resp = client.post("/train", json=req)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # sane classification metrics on separable synthetic data
    assert body["metrics"]["accuracy"] >= 0.7, (algorithm, body["metrics"])
    assert "auc" in body["metrics"]
    assert body["metrics"]["auc"] >= 0.7, (algorithm, body["metrics"])
    assert body["holdout_metrics"], "expected locked-holdout metrics"
    assert body["training_row_count"] == 240
    assert body["fitted_preprocessing"]["output_columns"]

    # predict via artifact, then via warm-cache model_id — both must agree
    pred_rows = [
        {fs["Name"]: 0.5 for fs in req["feature_schema"]},
        {fs["Name"]: -0.5 for fs in req["feature_schema"]},
    ]
    p_artifact = _predict(body["artifact_b64"], None, body["fitted_preprocessing"],
                          req["feature_schema"], pred_rows)
    p_cache = _predict(None, body["model_id"], body["fitted_preprocessing"],
                       req["feature_schema"], pred_rows)

    assert len(p_artifact["predictions"]) == 2
    for pred in p_artifact["predictions"]:
        assert pred["class"] in {"renew", "lapse"}
        assert 0.0 <= pred["score"] <= 1.0
    # identical inputs -> identical predictions whether from artifact or cache
    assert p_artifact["predictions"] == p_cache["predictions"]


@pytest.mark.parametrize("algorithm", REGRESSORS)
def test_regression_train_predict(algorithm: str) -> None:
    req = _train_request(algorithm, "regression")
    resp = client.post("/train", json=req)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "r2" in body["metrics"] and "rmse" in body["metrics"]
    # learnable signal -> non-trivial R2
    assert body["metrics"]["r2"] >= 0.5, (algorithm, body["metrics"])
    assert body["holdout_metrics"]

    pred_rows = [{fs["Name"]: 0.3 for fs in req["feature_schema"]}]
    out = _predict(body["artifact_b64"], None, body["fitted_preprocessing"],
                   req["feature_schema"], pred_rows)
    assert len(out["predictions"]) == 1
    assert isinstance(out["predictions"][0]["score"], float)
    assert out["predictions"][0].get("class") is None


def test_feature_importance_present_for_tree_models() -> None:
    req = _train_request("random_forest", "classification")
    body = client.post("/train", json=req).json()
    assert body["feature_importance"], "tree model should report importances"
    assert all(v >= 0 for v in body["feature_importance"].values())


def test_logistic_regression_rejects_regression() -> None:
    req = _train_request("logistic_regression", "regression")
    req["problem_type"] = "regression"
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "classification only" in resp.text


def test_ridge_rejects_classification() -> None:
    req = _train_request("ridge", "classification")
    req["problem_type"] = "classification"
    resp = client.post("/train", json=req)
    assert resp.status_code == 400


def test_health_smoke() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "xgboost" in body["algorithms"]
    assert "lightgbm" in body["algorithms"]


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
