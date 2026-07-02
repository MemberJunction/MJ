"""Algorithm driver registry.

Maps a sidecar driver key (e.g. ``xgboost``) to a factory that builds an
sklearn-compatible estimator, choosing the classifier vs. regressor variant by
``problem_type``. Request hyperparameters are passed straight through to the
estimator constructor.

The driver keys here MUST match the ``DriverClass`` values seeded in the
``MJ: ML Algorithms`` catalog (plan §4.1 / §7).
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List

from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.neural_network import MLPClassifier, MLPRegressor

try:  # xgboost requires OpenMP (libomp on macOS, libgomp1 on Linux)
    from xgboost import XGBClassifier, XGBRegressor

    _HAVE_XGB = True
except Exception:  # pragma: no cover - exercised only when xgboost missing
    _HAVE_XGB = False

try:
    from lightgbm import LGBMClassifier, LGBMRegressor

    _HAVE_LGBM = True
except Exception:  # pragma: no cover
    _HAVE_LGBM = False


# A factory takes (problem_type, hyperparameters) and returns an estimator.
EstimatorFactory = Callable[[str, Dict[str, Any]], Any]


class AlgorithmNotSupportedError(ValueError):
    """Raised when a driver key / problem-type pairing has no estimator."""


def _require(flag: bool, name: str) -> None:
    """Assert that an optional driver's package imported successfully.

    Args:
        flag: The ``_HAVE_*`` import-success flag for the driver.
        name: Driver key, used in the error message.

    Raises:
        AlgorithmNotSupportedError: When ``flag`` is falsy (package missing,
            typically because the OpenMP runtime libxgboost/lightgbm need is absent).
    """
    if not flag:
        raise AlgorithmNotSupportedError(
            f"Driver '{name}' is unavailable — its package failed to import "
            f"(missing OpenMP runtime?)."
        )


def _xgboost(problem_type: str, hp: Dict[str, Any]):
    """Build an XGBoost classifier/regressor with histogram tree method.

    Hyperparameters override the histogram + n_jobs defaults. For classification
    a default ``eval_metric=logloss`` is set to quiet modern-xgboost warnings.
    """
    _require(_HAVE_XGB, "xgboost")
    common = {"n_jobs": -1, "tree_method": "hist", **hp}
    if problem_type == "classification":
        # use_label_encoder removed in modern xgboost; eval_metric quiets warnings
        common.setdefault("eval_metric", "logloss")
        return XGBClassifier(**common)
    return XGBRegressor(**common)


def _lightgbm(problem_type: str, hp: Dict[str, Any]):
    """Build a LightGBM classifier/regressor (quiet, small-leaf-friendly defaults)."""
    _require(_HAVE_LGBM, "lightgbm")
    common = {"n_jobs": -1, "verbose": -1, "min_child_samples": 5, **hp}
    if problem_type == "classification":
        return LGBMClassifier(**common)
    return LGBMRegressor(**common)


def _logistic_regression(problem_type: str, hp: Dict[str, Any]):
    """Build a logistic-regression classifier (classification only).

    Raises:
        AlgorithmNotSupportedError: When ``problem_type`` is not ``classification``.
    """
    if problem_type != "classification":
        raise AlgorithmNotSupportedError(
            "logistic_regression supports classification only."
        )
    params = {"max_iter": 1000, **hp}
    return LogisticRegression(**params)


def _random_forest(problem_type: str, hp: Dict[str, Any]):
    """Build a random-forest classifier/regressor (all cores by default)."""
    common = {"n_jobs": -1, **hp}
    if problem_type == "classification":
        return RandomForestClassifier(**common)
    return RandomForestRegressor(**common)


def _ridge(problem_type: str, hp: Dict[str, Any]):
    """Build a ridge (L2) regressor (regression only).

    Raises:
        AlgorithmNotSupportedError: When ``problem_type`` is not ``regression``.
    """
    if problem_type != "regression":
        raise AlgorithmNotSupportedError("ridge supports regression only.")
    return Ridge(**hp)


def _mlp(problem_type: str, hp: Dict[str, Any]):
    """Build a multi-layer-perceptron classifier/regressor (500-iter default cap)."""
    params = {"max_iter": 500, **hp}
    if problem_type == "classification":
        return MLPClassifier(**params)
    return MLPRegressor(**params)


_REGISTRY: Dict[str, EstimatorFactory] = {
    "xgboost": _xgboost,
    "lightgbm": _lightgbm,
    "logistic_regression": _logistic_regression,
    "random_forest": _random_forest,
    "ridge": _ridge,
    "mlp": _mlp,
}


def supported_algorithms() -> List[str]:
    """Return the registered driver keys (sorted for stable health output)."""
    return sorted(_REGISTRY.keys())


def build_estimator(algorithm: str, problem_type: str, hyperparameters: Dict[str, Any]):
    """Build an sklearn-compatible estimator for the given driver key.

    Args:
        algorithm: Driver key (must match a seeded ``MJ: ML Algorithms`` DriverClass).
        problem_type: ``classification`` or ``regression``; selects the estimator variant.
        hyperparameters: Passed straight through to the estimator constructor.

    Returns:
        An unfitted, sklearn-compatible estimator.

    Raises:
        AlgorithmNotSupportedError: For unknown keys or invalid driver/problem-type
            pairings (e.g. ``ridge`` with classification).
    """
    factory = _REGISTRY.get(algorithm)
    if factory is None:
        raise AlgorithmNotSupportedError(
            f"Unknown algorithm '{algorithm}'. Supported: {supported_algorithms()}"
        )
    return factory(problem_type, dict(hyperparameters or {}))


def supports_feature_importance(estimator: Any) -> bool:
    """True when the fitted estimator exposes importances or linear coefficients."""
    return hasattr(estimator, "feature_importances_") or hasattr(estimator, "coef_")
