"""Legacy /train importance is held-out permutation importance per source column: every output column a source
produces (one-hot levels, missing indicators) is permuted together on the locked-holdout rows, so encoding cannot
dilute a leaked column, every algorithm reports it the same way, and impurity bias does not apply."""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

Cell = Union[str, float, int, None]


def _req(algorithm: str, columns: List[str], rows: Sequence[Sequence[Cell]], onehot: Optional[List[str]] = None,
         impute_with_indicator: Optional[List[str]] = None) -> Dict[str, object]:
    categorical = onehot or []
    imputed = impute_with_indicator or []
    preprocessing: List[Dict[str, object]] = [
        {"op": "impute", "col": c, "strategy": "mean", "indicator": True} for c in imputed
    ] + [{"op": "onehot", "col": c} for c in categorical]
    return {"algorithm": algorithm, "problem_type": "classification", "hyperparameters": {},
            "validation": {"strategy": "train_test_split", "test_size": 0.2, "holdout_size": 0.25, "random_state": 7},
            "feature_schema": [{"Name": c, "Kind": "categorical" if c in categorical else "numeric"} for c in columns[:-1]],
            "preprocessing": preprocessing, "target": columns[-1],
            "data": {"columns": columns, "rows": [list(r) for r in rows]}}


def _train(body: Dict[str, object]) -> Tuple[Dict[str, float], str]:
    """The trained model's importance map and its kind."""
    response = client.post("/train", json=body)
    assert response.status_code == 200, response.text
    payload = response.json()
    importance: Dict[str, float] = payload["feature_importance"]
    kind: str = payload["feature_importance_kind"]
    return importance, kind


@pytest.mark.parametrize("algorithm", ["random_forest", "xgboost", "lightgbm", "logistic_regression"])
def test_leaky_25_level_categorical_dominates_after_aggregation(algorithm: str) -> None:
    rng = np.random.default_rng(1)
    plan = rng.integers(0, 25, 1500)
    y = (plan % 2).astype(int)                       # the label is a function of the plan level
    x = rng.normal(size=1500)
    rows = [[f"P{p}", float(v), int(t)] for p, v, t in zip(plan, x, y)]
    imp, kind = _train(_req(algorithm, ["plan", "x", "label"], rows, onehot=["plan"]))
    assert set(imp) == {"plan", "x"}
    assert imp["plan"] >= 0.6
    assert kind == "held_out_permutation"


def test_mlp_reports_importance() -> None:
    rng = np.random.default_rng(2)
    x = rng.normal(size=(800, 3))
    y = (x[:, 0] > 0).astype(int)
    rows = [[*map(float, r), int(t)] for r, t in zip(x, y)]
    imp, kind = _train(_req("mlp", ["a", "b", "c", "label"], rows))
    assert imp["a"] > imp["b"]
    assert kind == "held_out_permutation"


def test_random_forest_does_not_prefer_continuous_noise() -> None:
    rng = np.random.default_rng(3)
    driver = rng.integers(0, 2, 3000)
    noise = rng.random(3000)
    y = (rng.random(3000) < np.where(driver == 1, 0.6, 0.4)).astype(int)
    rows = [[int(d), float(n), int(t)] for d, n, t in zip(driver, noise, y)]
    imp, _ = _train(_req("random_forest", ["signal_binary", "noise_continuous", "label"], rows))
    assert imp["signal_binary"] > imp["noise_continuous"]


def test_missing_indicator_importance_belongs_to_its_source_column() -> None:
    rng = np.random.default_rng(4)
    missing = rng.random(1500) < 0.5
    y = missing.astype(int)                          # the label is whether the value was missing
    x = rng.normal(size=1500)
    z = rng.normal(size=1500)
    rows = [[None if m else float(v), float(w), int(t)] for m, v, w, t in zip(missing, x, z, y)]
    imp, _ = _train(_req("logistic_regression", ["x", "z", "label"], rows, impute_with_indicator=["x"]))
    assert set(imp) == {"x", "z"}
    assert not any(k.endswith("__missing") for k in imp)
    assert imp["x"] >= 0.6
