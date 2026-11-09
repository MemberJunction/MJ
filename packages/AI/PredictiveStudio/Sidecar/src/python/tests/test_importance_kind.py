"""The importance kind reported for every registry algorithm and problem type: tree ensembles report split/impurity
importances, linear models report |coefficient|, and the MLP (which has only `coefs_`) reports none."""

from __future__ import annotations

from typing import List, Tuple

import numpy as np
import pytest
from sklearn.datasets import make_classification, make_regression

from app import algorithms
from app.main import _extract_importance
from app.schemas import ImportanceKind

_EXPECTED_KIND: dict[str, ImportanceKind] = {
    "xgboost": "split_or_impurity",
    "lightgbm": "split_or_impurity",
    "random_forest": "split_or_impurity",
    "logistic_regression": "coefficient",
    "ridge": "coefficient",
    "mlp": "none",
}

# Pairings the registry refuses (they raise AlgorithmNotSupportedError), so they have no importance kind.
_UNSUPPORTED = {("logistic_regression", "regression"), ("ridge", "classification")}

_CASES: List[Tuple[str, str]] = [
    (algorithm, problem_type)
    for algorithm in algorithms.supported_algorithms()
    for problem_type in ("classification", "regression")
    if (algorithm, problem_type) not in _UNSUPPORTED
]


def test_expected_kinds_cover_the_whole_registry() -> None:
    assert set(_EXPECTED_KIND) == set(algorithms.supported_algorithms())


@pytest.mark.parametrize("algorithm,problem_type", _CASES)
def test_importance_kind_per_family(algorithm: str, problem_type: str) -> None:
    if problem_type == "classification":
        X, y = make_classification(n_samples=60, n_features=4, n_informative=3, n_redundant=0, random_state=0)
    else:
        X, y = make_regression(n_samples=60, n_features=4, noise=1.0, random_state=0)
    estimator = algorithms.build_estimator(algorithm, problem_type, {}).fit(X, y)
    importance, kind = _extract_importance(estimator, ["a", "b", "c", "d"])
    assert kind == _EXPECTED_KIND[algorithm]
    if kind == "none":
        assert importance == {}
    else:
        assert set(importance) == {"a", "b", "c", "d"}
        assert np.isclose(sum(abs(v) for v in importance.values()), 1.0)
