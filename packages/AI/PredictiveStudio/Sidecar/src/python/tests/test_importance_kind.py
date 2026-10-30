"""The legacy importance kind for every registry algorithm and problem type: held-out permutation shares per source
column, or none below two held-out rows."""

from __future__ import annotations

from typing import List, Tuple

import numpy as np
import pytest
from sklearn.datasets import make_classification, make_regression

from app import algorithms
from app.main import _extract_importance
from app.preprocessing import FittedPreprocessing

# Pairings the registry refuses (they raise AlgorithmNotSupportedError), so they have no importance kind.
_UNSUPPORTED = {("logistic_regression", "regression"), ("ridge", "classification")}

_CASES: List[Tuple[str, str]] = [
    (algorithm, problem_type)
    for algorithm in algorithms.supported_algorithms()
    for problem_type in ("classification", "regression")
    if (algorithm, problem_type) not in _UNSUPPORTED
]

# Four pass-through columns: each output column is its own source column.
_PASSTHROUGH: FittedPreprocessing = {"ops": [], "output_columns": ["a", "b", "c", "d"]}


@pytest.mark.parametrize("algorithm,problem_type", _CASES)
def test_importance_kind_per_family(algorithm: str, problem_type: str) -> None:
    if problem_type == "classification":
        X, y = make_classification(n_samples=80, n_features=4, n_informative=3, n_redundant=0, random_state=0)
    else:
        X, y = make_regression(n_samples=80, n_features=4, noise=1.0, random_state=0)
    estimator = algorithms.build_estimator(algorithm, problem_type, {}).fit(X[:60], y[:60])
    importance, kind = _extract_importance(estimator, _PASSTHROUGH, X[60:], y[60:], problem_type == "classification", 0)
    assert kind == "held_out_permutation"
    assert set(importance) == {"a", "b", "c", "d"}
    assert all(v >= 0 for v in importance.values())
    assert np.isclose(sum(importance.values()), 1.0)


def test_too_few_held_out_rows_report_none() -> None:
    X, y = make_classification(n_samples=40, n_features=4, n_informative=3, n_redundant=0, random_state=0)
    estimator = algorithms.build_estimator("random_forest", "classification", {}).fit(X, y)
    assert _extract_importance(estimator, _PASSTHROUGH, X[:1], y[:1], True, 0) == ({}, "none")
