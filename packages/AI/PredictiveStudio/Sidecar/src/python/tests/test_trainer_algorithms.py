"""Trainer estimators: seeded single-threaded refits predict identically, the catalog's MLP default parses and trains,
and a candidate hyperparameter can never replace the objective, seed or thread count its task type fixes."""

from __future__ import annotations

import numpy as np
import pytest

from app import algorithms
from app.trainer_schemas import HyperparameterValue


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
        ("logistic_regression", "multiclass", "multi_class", "ovr"),
        ("xgboost", "binary", "tree_method", "exact"),
        ("xgboost", "binary", "device", "cuda"),
        ("xgboost", "binary", "gpu_id", 0),
        ("xgboost", "binary", "predictor", "gpu_predictor"),
        ("xgboost", "binary", "nthread", 8),
        ("lightgbm", "binary", "application", "regression"),
        ("lightgbm", "binary", "loss", "huber"),
        ("lightgbm", "binary", "metric", "auc"),
        ("lightgbm", "binary", "metrics", "auc"),
        ("lightgbm", "binary", "metric_types", "auc"),
        ("lightgbm", "binary", "bagging_seed", 1),
        ("lightgbm", "binary", "feature_fraction_seed", 1),
        ("lightgbm", "binary", "data_random_seed", 1),
        ("lightgbm", "binary", "extra_seed", 1),
        ("lightgbm", "binary", "drop_seed", 1),
        ("random_forest", "continuous", "criterion", "absolute_error"),
    ],
)
def test_fixed_keyword_collision_is_a_typed_refusal(driver: str, family: algorithms.TabularFamily, key: str,
                                                    value: HyperparameterValue) -> None:
    """A candidate hyperparameter naming a keyword the factory fixes is refused by name, never a duplicate-keyword
    TypeError from the estimator constructor."""
    with pytest.raises(algorithms.ObjectiveOverrideError, match=f"'{key}'"):
        algorithms.tabular_estimator(driver, family, {key: value}, 0, 1, None)


def test_multiclass_logistic_regression_is_multinomial() -> None:
    est = algorithms.tabular_estimator("logistic_regression", "multiclass", {}, 0, 1, None)
    assert est.get_params()["multi_class"] == "multinomial"


def test_xgboost_tree_method_and_device_are_fixed() -> None:
    params = algorithms.tabular_estimator("xgboost", "continuous", {"n_estimators": 5}, 0, 1, None).get_params()
    assert (params["tree_method"], params["device"]) == ("hist", "cpu")


@pytest.mark.parametrize("driver", ["xgboost", "lightgbm", "tweedie_glm"])
@pytest.mark.parametrize("power", [0.5, 1.0, 2.0, 2.5])
def test_tweedie_power_outside_the_open_unit_interval_above_one_is_refused(driver: str, power: float) -> None:
    """A compound Poisson-gamma Tweedie needs a variance power strictly between 1 and 2."""
    with pytest.raises(algorithms.InvalidTweediePowerError, match="tweedie_power"):
        algorithms.tabular_estimator(driver, "non-negative", {}, 0, 1, power)


def test_legacy_mlp_accepts_a_json_list_of_layer_sizes() -> None:
    """The /train request carries hidden_layer_sizes as a JSON list as well as the catalog's string."""
    est = algorithms.build_estimator("mlp", "classification", {"hidden_layer_sizes": [100, 50]})
    assert est.hidden_layer_sizes == (100, 50)
    assert algorithms.parse_hidden_layer_sizes((8, 4)) == (8, 4)


@pytest.mark.parametrize("value", [[], [100, "a"], [0], [True], [1.5], [[100]]])
def test_invalid_layer_size_lists_are_refused(value: object) -> None:
    with pytest.raises(ValueError, match="hidden_layer_sizes"):
        algorithms.build_estimator("mlp", "classification", {"hidden_layer_sizes": value})
