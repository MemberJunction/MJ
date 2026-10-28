"""Trainer estimators: seeded single-threaded refits predict identically, the catalog's MLP default parses and trains,
and a candidate hyperparameter can never replace the objective, seed or thread count its task type fixes."""

from __future__ import annotations

import numpy as np
import pytest

from app import algorithms
from app.trainer_schemas import HyperparameterValue

# These tests pin reproducibility and that the fit runs, not convergence: the short iteration caps that keep them fast
# stop the MLP's optimizer before its tolerance is met, which sklearn reports as a ConvergenceWarning.
_MLP_STOPS_AT_ITERATION_CAP = pytest.mark.filterwarnings("ignore::sklearn.exceptions.ConvergenceWarning")


@_MLP_STOPS_AT_ITERATION_CAP
@pytest.mark.parametrize("driver", ["random_forest", "mlp", "xgboost", "lightgbm"])
def test_refit_is_deterministic(driver: str) -> None:
    """Two fits with the protocol seed and one thread predict identically (1e-9)."""
    rng = np.random.default_rng(0)
    X = rng.normal(size=(400, 5))
    y = (X[:, 0] + rng.normal(size=400) > 0).astype(int)
    preds = []
    for _ in range(2):
        est = algorithms.tabular_estimator(driver, "binary", {"n_estimators": 30} if driver != "mlp" else {}, 42, 1, None)
        est.fit(X, y)
        preds.append(est.predict_proba(X)[:, 1])
    assert np.max(np.abs(preds[0] - preds[1])) <= 1e-9


@_MLP_STOPS_AT_ITERATION_CAP
def test_mlp_catalog_default_trains() -> None:
    """The catalog stores hidden_layer_sizes as the string "100"; it is parsed to a tuple of ints, then the MLP fits."""
    assert algorithms.parse_hidden_layer_sizes("100") == (100,)
    assert algorithms.parse_hidden_layer_sizes("100,50") == (100, 50)
    est = algorithms.tabular_estimator("mlp", "binary", {"hidden_layer_sizes": "100", "max_iter": 50}, 1, 1, None)
    X = np.random.default_rng(1).normal(size=(80, 3))
    est.fit(X, np.array([0, 1] * 40))
    proba = est.predict_proba(X)
    assert proba.shape == (80, 2)
    assert bool(np.all(np.isfinite(proba)))


def test_objective_override_is_refused() -> None:
    with pytest.raises(algorithms.ObjectiveOverrideError):
        algorithms.tabular_estimator("lightgbm", "non-negative", {"objective": "regression"}, 0, 1, 1.5)


@pytest.mark.parametrize(
    "driver,family,key,value",
    [
        ("xgboost", "binary", "objective", "reg:squarederror"),
        ("xgboost", "binary", "eval_metric", "auc"),
        ("xgboost", "count", "random_state", 7),
        ("xgboost", "continuous", "n_jobs", -1),
        ("lightgbm", "binary", "objective", "regression"),
        ("lightgbm", "multiclass", "deterministic", False),
        ("lightgbm", "continuous", "force_row_wise", False),
        ("lightgbm", "count", "seed", 3),
    ],
)
def test_fixed_keyword_collision_is_a_typed_refusal(driver: str, family: algorithms.TabularFamily, key: str,
                                                    value: HyperparameterValue) -> None:
    """A candidate hyperparameter naming a keyword the factory fixes is refused by name, never a duplicate-keyword
    TypeError from the estimator constructor."""
    with pytest.raises(algorithms.ObjectiveOverrideError, match=f"'{key}'"):
        algorithms.tabular_estimator(driver, family, {key: value}, 0, 1, None)
