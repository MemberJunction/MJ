"""The legacy /train route: random forest and MLP are seeded with the request's seed, the catalog's MLP default
trains, and validation stays out of sample."""

from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import algorithms
from app.main import app

client = TestClient(app)

# An MLP on a noise target stops at its iteration cap before its tolerance is met, which sklearn reports as a
# ConvergenceWarning; the cap is the setting under test, so the warning is expected.
pytestmark = pytest.mark.filterwarnings("ignore::sklearn.exceptions.ConvergenceWarning")


def _noise_request(algorithm: str, strategy: str, k: int | None = None, hp: dict[str, object] | None = None,
                   random_state: int = 42) -> dict[str, object]:
    rng = np.random.default_rng(600)
    X = rng.normal(size=(600, 5))
    y = rng.integers(0, 2, 600)
    cols = [f"f{i}" for i in range(5)] + ["label"]
    rows = [[float(v) for v in X[i]] + [int(y[i])] for i in range(600)]
    return {"algorithm": algorithm, "problem_type": "classification", "hyperparameters": hp or {},
            "validation": {"strategy": strategy, "test_size": 0.2, "k": k, "random_state": random_state},
            "feature_schema": [{"Name": c, "Kind": "numeric"} for c in cols[:-1]], "preprocessing": [],
            "target": "label", "data": {"columns": cols, "rows": rows}}


@pytest.mark.parametrize("algorithm", ["random_forest", "mlp"])
@pytest.mark.parametrize("strategy", ["train_test_split", "kfold"])
def test_retrain_is_deterministic(algorithm: str, strategy: str) -> None:
    a = client.post("/train", json=_noise_request(algorithm, strategy, k=5)).json()["metrics"]
    b = client.post("/train", json=_noise_request(algorithm, strategy, k=5)).json()["metrics"]
    assert a == b


def test_seed_zero_is_honoured() -> None:
    """A request seed of 0 is used as given, not replaced by the default of 42."""
    a = client.post("/train", json=_noise_request("random_forest", "train_test_split", random_state=0)).json()["metrics"]
    b = client.post("/train", json=_noise_request("random_forest", "train_test_split", random_state=42)).json()["metrics"]
    assert a != b


def test_request_seed_reaches_every_estimator(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every fold estimator and the final refit are built with the request's seed, not the module constant: five
    fold estimators and one refit, six builds, each seeded 7."""
    seen: list[int] = []
    real = algorithms.build_estimator

    def spy(algorithm: str, problem_type: str, hyperparameters: dict[str, object], random_state: int) -> object:
        seen.append(random_state)
        return real(algorithm, problem_type, hyperparameters, random_state)

    monkeypatch.setattr(algorithms, "build_estimator", spy)
    assert client.post("/train", json=_noise_request("random_forest", "kfold", k=5, random_state=7)).status_code == 200
    assert seen == [7] * 6


def test_catalog_mlp_default_trains() -> None:
    hp: dict[str, object] = {"hidden_layer_sizes": "100", "activation": "relu", "alpha": 0.0001, "learning_rate_init": 0.001, "max_iter": 200}
    assert client.post("/train", json=_noise_request("mlp", "train_test_split", hp=hp)).status_code == 200


@pytest.mark.parametrize("strategy", ["kfold", "holdout"])
def test_validation_stays_out_of_sample(strategy: str) -> None:
    """A random forest on a noise target is graded on rows it did not train on, so it does not look skilful."""
    resp = client.post("/train", json=_noise_request("random_forest", strategy, k=5))
    assert resp.status_code == 200, resp.text
    assert resp.json()["metrics"]["auc"] < 0.62
