"""G0.9 / F-SC-1 / F-TR-1: validation metrics are out-of-sample for every strategy, K is honoured, and the
classification metrics report the majority rate they must be judged against."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pytest

from app import algorithms, main, metrics, schemas
from tests.test_train_predict import client


def _noise_request(strategy: str, algorithm: str, k: Optional[int] = None, n: int = 1000) -> Dict[str, Any]:
    rng = np.random.default_rng(100)
    X = rng.normal(size=(n, 6))
    y = rng.integers(0, 2, size=n)
    columns = [f"x{i}" for i in range(6)] + ["label"]
    rows: List[List[Any]] = [[float(v) for v in X[i]] + [int(y[i])] for i in range(n)]
    validation: Dict[str, Any] = {"strategy": strategy, "test_size": 0.2, "random_state": 42}
    if k is not None:
        validation["k"] = k
    return {
        "algorithm": algorithm,
        "problem_type": "classification",
        "hyperparameters": {},
        "validation": validation,
        "feature_schema": [{"Name": c, "Kind": "numeric"} for c in columns[:-1]],
        "preprocessing": [{"op": "standardize", "cols": columns[:-1]}],
        "target": "label",
        "data": {"columns": columns, "rows": rows},
    }


@pytest.mark.parametrize("strategy", ["kfold", "holdout"])
@pytest.mark.parametrize("algorithm", ["random_forest", "xgboost", "lightgbm", "logistic_regression"])
def test_validation_metrics_are_out_of_sample_on_noise(strategy: str, algorithm: str) -> None:
    resp = client.post("/train", json=_noise_request(strategy, algorithm, k=5 if strategy == "kfold" else None))
    assert resp.status_code == 200, resp.text
    auc = resp.json()["metrics"]["auc"]
    assert 0.35 <= auc <= 0.65, (strategy, algorithm, auc)


def test_kfold_uses_k() -> None:
    m3 = client.post("/train", json=_noise_request("kfold", "logistic_regression", k=3)).json()["metrics"]
    m10 = client.post("/train", json=_noise_request("kfold", "logistic_regression", k=10)).json()["metrics"]
    assert m3["auc"] != m10["auc"]
    assert m3["n"] == 1000.0 and m10["n"] == 1000.0


def test_kfold_refuses_k_larger_than_a_class() -> None:
    req = _noise_request("kfold", "logistic_regression", k=5, n=40)
    rows = req["data"]["rows"]
    req["data"]["rows"] = [r[:-1] + [0] for r in rows[:37]] + [r[:-1] + [1] for r in rows[37:]]
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "needs at least 5 rows of every class" in resp.text


def test_kfold_allows_non_contiguous_integer_class_labels() -> None:
    """When class indices in y_dev are [1, 2] (class 0 absent in dev split), kfold still runs."""
    raw = _noise_request("kfold", "logistic_regression", k=5, n=40)
    req = schemas.TrainRequest.model_validate(raw)
    dev_rows = raw["data"]["rows"]
    y_dev = np.array([1] * 20 + [2] * 20, dtype=int)
    ctx = main.FoldContext(
        dev_rows=dev_rows,
        columns=raw["data"]["columns"],
        feature_cols=[f"x{i}" for i in range(6)],
        ops_spec=[{"op": "standardize", "cols": [f"x{i}" for i in range(6)]}],
        target_idx=6,
        y_dev=y_dev,
        build=lambda: algorithms.build_estimator("logistic_regression", "classification", {}),
    )
    m = main._kfold_out_of_fold_metrics(req, ctx, True, 42)
    assert m["n"] == 40.0


def test_too_few_rows_are_refused_not_scored_in_sample() -> None:
    req = _noise_request("train_test_split", "logistic_regression", n=3)
    req["data"]["rows"][0][-1] = 0
    req["data"]["rows"][1][-1] = 1
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "at least 4" in resp.text


def test_four_binary_rows_with_20pct_split_reports_insufficient_rows_message() -> None:
    req = _noise_request("train_test_split", "logistic_regression", n=4)
    req["data"]["rows"][0][-1] = 0
    req["data"]["rows"][1][-1] = 0
    req["data"]["rows"][2][-1] = 1
    req["data"]["rows"][3][-1] = 1
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "measure the model on rows it did not train on" in resp.text


def test_classification_metrics_report_majority_rate_and_predicted_classes() -> None:
    y_true = np.array([0] * 19 + [1])
    y_pred = np.zeros(20, dtype=int)
    y_score = np.column_stack([np.full(20, 0.9), np.full(20, 0.1)])
    m = metrics.classification_metrics(y_true, y_pred, y_score)
    assert m["baseline_accuracy"] == pytest.approx(0.95)
    assert m["predicted_classes"] == 1.0
    assert m["n"] == 20.0
    assert m["n_positive"] == 1.0


def _regression_noise_request(strategy: str, algorithm: str, n: int = 1000) -> Dict[str, Any]:
    rng = np.random.default_rng(200)
    X = rng.normal(size=(n, 6))
    y = rng.normal(size=n)
    columns = [f"x{i}" for i in range(6)] + ["target"]
    rows: List[List[Any]] = [[float(v) for v in X[i]] + [float(y[i])] for i in range(n)]
    return {
        "algorithm": algorithm,
        "problem_type": "regression",
        "hyperparameters": {},
        "validation": {"strategy": strategy, "test_size": 0.2, "k": 5, "random_state": 42},
        "feature_schema": [{"Name": c, "Kind": "numeric"} for c in columns[:-1]],
        "preprocessing": [{"op": "standardize", "cols": columns[:-1]}],
        "target": "target",
        "data": {"columns": columns, "rows": rows},
    }


@pytest.mark.parametrize("strategy", ["kfold", "holdout", "train_test_split"])
@pytest.mark.parametrize("algorithm", ["random_forest", "xgboost", "lightgbm", "ridge"])
def test_regression_validation_metrics_are_out_of_sample_on_noise(strategy: str, algorithm: str) -> None:
    """A target unrelated to the features has no learnable signal, so an out-of-sample R2 sits at or below ~0. Scored
    in-sample, the tree ensembles memorise the noise and report R2 far above 0.1."""
    resp = client.post("/train", json=_regression_noise_request(strategy, algorithm))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["metrics"]["r2"] < 0.1, (strategy, algorithm, body["metrics"])
    assert body["validation_out_of_sample"] is True


def test_kfold_refuses_a_single_class_target() -> None:
    req = _noise_request("kfold", "logistic_regression", k=5, n=40)
    req["data"]["rows"] = [r[:-1] + [0] for r in req["data"]["rows"]]
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "at least two classes" in resp.text


def test_split_failure_names_the_least_populated_class() -> None:
    req = _noise_request("train_test_split", "logistic_regression", n=200)
    rows = req["data"]["rows"]
    req["data"]["rows"] = [r[:-1] + [0] for r in rows[:199]] + [rows[199][:-1] + [1]]
    resp = client.post("/train", json=req)
    assert resp.status_code == 400
    assert "least-populated class has 1 row(s)" in resp.text


def test_unknown_strategy_is_refused_by_the_schema() -> None:
    resp = client.post("/train", json=_noise_request("leave_one_out", "logistic_regression", n=40))
    assert resp.status_code == 422
