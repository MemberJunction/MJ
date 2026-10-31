"""G0.10 keep-list: every registry estimator is built with the default seed, so two trainings on the same rows predict
the same. random_forest (bootstrap + feature sampling) and mlp (weight init + shuffling) are the estimators that draw
random numbers, so they are the ones the seed actually pins. (The trainer's own determinism is tested with /trainer.)"""

from __future__ import annotations

from typing import List, Tuple

import pytest

from app import algorithms

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


@pytest.mark.parametrize("algorithm,problem_type", _CASES)
def test_every_registry_estimator_is_seeded(algorithm: str, problem_type: str) -> None:
    """Removing the seed from any factory fails here, including families whose default config draws nothing random."""
    estimator = algorithms.build_estimator(algorithm, problem_type, {})
    assert estimator.get_params()["random_state"] == algorithms.DEFAULT_RANDOM_STATE
