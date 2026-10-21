"""G0.10 keep-list: two single-threaded trainings of logistic regression, XGBoost and LightGBM on the same rows with
the same seed predict within 1e-9, for the default split and for kfold."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from tests.test_train_predict import _predict, _train_request, client


@pytest.mark.parametrize("strategy", ["train_test_split", "kfold"])
@pytest.mark.parametrize("algorithm", ["logistic_regression", "xgboost", "lightgbm"])
def test_single_threaded_training_is_deterministic(algorithm: str, strategy: str) -> None:
    req = _train_request(algorithm, "classification")
    req["validation"]["strategy"] = strategy
    req["validation"]["k"] = 5
    if algorithm != "logistic_regression":
        req["hyperparameters"] = {"n_jobs": 1}
    first = client.post("/train", json=req).json()
    second = client.post("/train", json=req).json()
    assert first["metrics"] == second["metrics"]
    names = [fs["Name"] for fs in req["feature_schema"]]
    rows: List[Dict[str, Any]] = [dict(zip(names, r[: len(names)])) for r in req["data"]["rows"][:50]]
    p1 = _predict(first["artifact_b64"], None, first["fitted_preprocessing"], req["feature_schema"], rows)["predictions"]
    p2 = _predict(second["artifact_b64"], None, second["fitted_preprocessing"], req["feature_schema"], rows)["predictions"]
    assert len(p1) == 50
    assert all(abs(a["score"] - b["score"]) <= 1e-9 for a, b in zip(p1, p2))
