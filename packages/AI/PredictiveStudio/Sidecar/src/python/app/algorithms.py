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
    ExtraTreesClassifier,
    ExtraTreesRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.gaussian_process import GaussianProcessClassifier, GaussianProcessRegressor
from sklearn.linear_model import (
    ElasticNet,
    Lasso,
    LinearRegression,
    LogisticRegression,
    Ridge,
)
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

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


def _extra_trees(problem_type: str, hp: Dict[str, Any]):
    """Extremely-randomized trees (bagging with random split thresholds)."""
    common = {"n_jobs": -1, **hp}
    if problem_type == "classification":
        return ExtraTreesClassifier(**common)
    return ExtraTreesRegressor(**common)


def _decision_tree(problem_type: str, hp: Dict[str, Any]):
    """A single CART decision tree (interpretable rule paths)."""
    if problem_type == "classification":
        return DecisionTreeClassifier(**hp)
    return DecisionTreeRegressor(**hp)


def _knn(problem_type: str, hp: Dict[str, Any]):
    """k-nearest-neighbors (distance-based; scale the inputs upstream)."""
    common = {"n_jobs": -1, **hp}
    if problem_type == "classification":
        return KNeighborsClassifier(**common)
    return KNeighborsRegressor(**common)


def _naive_bayes(problem_type: str, hp: Dict[str, Any]):
    """Gaussian naive Bayes (classification only; probabilities are often over-confident)."""
    if problem_type != "classification":
        raise AlgorithmNotSupportedError("naive_bayes supports classification only.")
    return GaussianNB(**hp)


def _lasso(problem_type: str, hp: Dict[str, Any]):
    """Lasso (L1) regression — sparse coefficients (regression only)."""
    if problem_type != "regression":
        raise AlgorithmNotSupportedError("lasso supports regression only.")
    return Lasso(**{"max_iter": 5000, **hp})


def _elastic_net(problem_type: str, hp: Dict[str, Any]):
    """ElasticNet (L1+L2) regression (regression only)."""
    if problem_type != "regression":
        raise AlgorithmNotSupportedError("elastic_net supports regression only.")
    return ElasticNet(**{"max_iter": 5000, **hp})


def _svm(problem_type: str, hp: Dict[str, Any]):
    """Support vector machine (kernel; scale inputs upstream). SVC exposes calibrated
    probabilities only with probability=True (internal Platt CV)."""
    if problem_type == "classification":
        return SVC(**{"probability": True, **hp})
    return SVR(**hp)


def _gp(problem_type: str, hp: Dict[str, Any]):
    """Gaussian process (native uncertainty; O(n^3) — gate to small n upstream)."""
    if problem_type == "classification":
        return GaussianProcessClassifier(**hp)
    return GaussianProcessRegressor(**{"normalize_y": True, **hp})


def _ols(problem_type: str, hp: Dict[str, Any]):
    """Ordinary least squares linear regression (regression only)."""
    if problem_type != "regression":
        raise AlgorithmNotSupportedError("ols supports regression only.")
    return LinearRegression(**hp)


def _dummy_classifier(problem_type: str, hp: Dict[str, Any]):
    """The classification leaderboard floor (predicts the base rate / prior)."""
    if problem_type != "classification":
        raise AlgorithmNotSupportedError("dummy_classifier supports classification only.")
    return DummyClassifier(**{"strategy": "prior", **hp})


def _dummy_regressor(problem_type: str, hp: Dict[str, Any]):
    """The regression leaderboard floor (predicts the mean/median)."""
    if problem_type != "regression":
        raise AlgorithmNotSupportedError("dummy_regressor supports regression only.")
    return DummyRegressor(**{"strategy": "mean", **hp})


# --- T2: statsmodels count/GLM families (optional extra; sklearn-wrapped) ---
from app import glm_wrappers as _glm  # noqa: E402
from app import survival_wrappers as _surv  # noqa: E402
from app import forecast_wrappers as _fc  # noqa: E402
from app import sequence_wrappers as _seq  # noqa: E402
from app import unsupervised_wrappers as _uns  # noqa: E402
from app import rubric_wrappers as _rub  # noqa: E402
from app import calibration_wrappers as _cal  # noqa: E402


def _glm_factory(maker):
    def factory(problem_type: str, hp: Dict[str, Any]):
        _require(_glm._HAVE_STATSMODELS, "statsmodels")
        if problem_type != "regression":
            raise AlgorithmNotSupportedError(
                "count/GLM families model a non-negative response; use problem_type='regression'."
            )
        return maker(hp)
    return factory


def _glm_classifier_factory(maker):
    """Factory for statsmodels classifiers (ordinal / multinomial) — classification only."""
    def factory(problem_type: str, hp: Dict[str, Any]):
        _require(_glm._HAVE_STATSMODELS, "statsmodels")
        if problem_type != "classification":
            raise AlgorithmNotSupportedError(
                "ordinal / multinomial-logit model discrete classes; use problem_type='classification'."
            )
        return maker(hp)
    return factory


def _rubric(problem_type: str, hp: Dict[str, Any]):
    """The glass-box weighted scorecard — trainable or reusable, both tasks."""
    return _rub.make_rubric(hp)


def _survival_placeholder(problem_type: str, hp: Dict[str, Any]):
    raise AlgorithmNotSupportedError(
        "survival algorithms are trained via the survival branch (target_spec), not build_estimator."
    )


_REGISTRY: Dict[str, EstimatorFactory] = {
    "xgboost": _xgboost,
    "lightgbm": _lightgbm,
    "logistic_regression": _logistic_regression,
    "random_forest": _random_forest,
    "ridge": _ridge,
    "mlp": _mlp,
    # T1 tranche — zero-new-dependency sklearn drivers
    "extra_trees": _extra_trees,
    "decision_tree": _decision_tree,
    "knn": _knn,
    "naive_bayes": _naive_bayes,
    "lasso": _lasso,
    "elastic_net": _elastic_net,
    "svm": _svm,
    "gp": _gp,
    "ols": _ols,
    "dummy_classifier": _dummy_classifier,
    "dummy_regressor": _dummy_regressor,
    # T2 — statsmodels GLM families (optional extra)
    "poisson": _glm_factory(_glm.make_poisson),
    "neg_binomial": _glm_factory(_glm.make_neg_binomial),
    "tweedie": _glm_factory(_glm.make_tweedie),
    "quantile": _glm_factory(_glm.make_quantile),
    "zero_inflated": _glm_factory(_glm.make_zero_inflated),
    "gam": _glm_factory(_glm.make_gam),
    "ordinal": _glm_classifier_factory(_glm.make_ordinal),
    "multinomial_logit": _glm_classifier_factory(_glm.make_multinomial_logit),
    # Rubric / weighted scorecard (glass-box; sklearn+scipy, no dep)
    "rubric": _rubric,
    # T4 survival — handled by the survival branch in main.py, not build_estimator
    "cox_ph": _survival_placeholder,
    "weibull_aft": _survival_placeholder,
    "aft": _survival_placeholder,
    "km": _survival_placeholder,
    # T5 forecasting — handled by the forecast branch in main.py
    "seasonal_naive": _survival_placeholder,
    "sma": _survival_placeholder,
    "ets": _survival_placeholder,
    "arima": _survival_placeholder,
    "theta": _survival_placeholder,
    "croston": _survival_placeholder,
    "structural_ts": _survival_placeholder,
    "kalman_dlm": _survival_placeholder,
    "markov_switching": _survival_placeholder,
    "var": _survival_placeholder,
    "hmm": _survival_placeholder,
    "markov_chain": _survival_placeholder,
    # T3 unsupervised (sklearn, no dep) — handled by the unsupervised branch
    "kmeans": _survival_placeholder,
    "dbscan": _survival_placeholder,
    "gmm": _survival_placeholder,
    "hierarchical": _survival_placeholder,
    "pca": _survival_placeholder,
    "isolation_forest": _survival_placeholder,
    "lda": _survival_placeholder,
    # Calibration (sklearn, no dep) — handled by the calibration branch in main.py
    "platt": _survival_placeholder,
    "isotonic": _survival_placeholder,
}



def supported_algorithms() -> List[str]:
    """Return the registered driver keys (sorted for stable health output)."""
    return sorted(_REGISTRY.keys())


# Per-driver optional-dependency importability. A driver key is RUNNABLE only if its
# native dep imported successfully (the `_HAVE_*` flags); everything else is a pure-
# sklearn/statsmodels driver that is always runnable. `/health` reports this so the
# catalog can show Planned (cataloged, no runnable driver) vs Active per component.
_DRIVER_REQUIREMENTS = {
    "xgboost": _HAVE_XGB,
    "lightgbm": _HAVE_LGBM,
    "poisson": _glm._HAVE_STATSMODELS,
    "neg_binomial": _glm._HAVE_STATSMODELS,
    "tweedie": _glm._HAVE_STATSMODELS,
    "quantile": _glm._HAVE_STATSMODELS,
    "zero_inflated": _glm._HAVE_STATSMODELS,
    "gam": _glm._HAVE_STATSMODELS,
    "ordinal": _glm._HAVE_STATSMODELS,
    "multinomial_logit": _glm._HAVE_STATSMODELS,
    "rubric": True,
    "cox_ph": _surv._HAVE_LIFELINES,
    "weibull_aft": _surv._HAVE_LIFELINES,
    "aft": _surv._HAVE_LIFELINES,
    "km": _surv._HAVE_LIFELINES,
    "seasonal_naive": True,
    "sma": True,
    "ets": _fc._HAVE_STATSMODELS_TS,
    "arima": _fc._HAVE_STATSMODELS_TS,
    "theta": _fc._HAVE_STATSMODELS_TS,
    "croston": True,
    "structural_ts": _fc._HAVE_STATSMODELS_TS,
    "kalman_dlm": _fc._HAVE_STATSMODELS_TS,
    "markov_switching": _fc._HAVE_STATSMODELS_TS,
    "var": _fc._HAVE_STATSMODELS_TS,
    "hmm": _seq._HAVE_HMMLEARN,
    "markov_chain": True,
    "kmeans": True, "dbscan": True, "gmm": True, "hierarchical": True,
    "pca": True, "isolation_forest": True, "lda": True,
    "platt": True, "isotonic": True,
}


def runnable_algorithms() -> List[str]:
    """Registered drivers whose native dependency (if any) is importable here."""
    return sorted(k for k in _REGISTRY if _DRIVER_REQUIREMENTS.get(k, True))


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
