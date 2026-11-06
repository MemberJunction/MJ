"""G0.10 keep-list: two single-threaded trainings of every registry algorithm on the same rows with the same seed
predict within 1e-9, for the default split and for kfold. random_forest (bootstrap + feature sampling) and mlp
(weight init + shuffling) are the estimators that draw random numbers, so they are the ones the seed actually pins."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

import pytest

from app import algorithms
from tests.test_train_predict import _predict, _train_request, client

# Families that accept n_jobs; the rest are single-threaded already.
_MULTI_THREADED = {"xgboost", "lightgbm", "random_forest"}

_CASES: List[Tuple[str, str]] = [
    ("logistic_regression", "classification"),
    ("xgboost", "classification"),
    ("lightgbm", "classification"),
    ("random_forest", "classification"),
    ("mlp", "classification"),
    ("xgboost", "regression"),
    ("lightgbm", "regression"),
    ("random_forest", "regression"),
    ("ridge", "regression"),
    ("mlp", "regression"),
]


@pytest.mark.parametrize("strategy", ["train_test_split", "kfold"])
@pytest.mark.parametrize("algorithm,problem_type", _CASES)
def test_single_threaded_training_is_deterministic(algorithm: str, problem_type: str, strategy: str) -> None:
    req = _train_request(algorithm, problem_type)
    req["validation"]["strategy"] = strategy
    req["validation"]["k"] = 5
    if algorithm in _MULTI_THREADED:
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


@pytest.mark.parametrize("algorithm,problem_type", _CASES)
def test_every_registry_estimator_is_seeded(algorithm: str, problem_type: str) -> None:
    """Removing the seed from any factory fails here, including families whose default config draws nothing random."""
    estimator = algorithms.build_estimator(algorithm, problem_type, {})
    assert estimator.get_params()["random_state"] == algorithms.DEFAULT_RANDOM_STATE
