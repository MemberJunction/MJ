"""Algorithm driver registry.

Two halves share this module:

* The ``/train`` registry (``build_estimator``) maps a sidecar driver key (e.g. ``xgboost``) to a factory that builds an
  sklearn-compatible estimator, choosing the classifier vs. regressor variant by ``problem_type``. Request
  hyperparameters are passed straight through to the estimator constructor, and the caller's seed reaches every
  factory.
* The trainer estimators (``tabular_estimator``) build one candidate for a task family: the objective follows the
  family, every random state is the protocol seed, every parallel library is held to the given thread count, and a
  candidate hyperparameter that names one of those fixed keywords is refused.

The driver keys MUST match the ``DriverClass`` values seeded in the ``MJ: ML Algorithms`` catalog (the two GLM
baseline drivers excepted, see ``_TABULAR_BUILDERS``).

The ``/train`` half keeps ``Any`` for its hyperparameter values and estimators: its request schema types
hyperparameters as ``Dict[str, Any]`` and its callers duck-type the returned estimator (``fit``/``predict_proba``).
"""

from __future__ import annotations

from typing import Any, Callable, Dict, FrozenSet, List, Literal, Tuple, Union

from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, PoissonRegressor, Ridge, TweedieRegressor
from sklearn.neural_network import MLPClassifier, MLPRegressor

from .trainer_schemas import HyperparameterValue

# Seed shared by every estimator. Seeded training is reproducible single-threaded (n_jobs=1); the multi-threaded
# defaults below (n_jobs=-1) are not guaranteed bit-identical across runs.
DEFAULT_RANDOM_STATE: int = 0

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


# A factory takes (problem_type, hyperparameters, random_state) and returns an estimator.
EstimatorFactory = Callable[[str, Dict[str, Any], int], Any]


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


def _xgboost(problem_type: str, hp: Dict[str, Any], random_state: int) -> Any:
    """Build an XGBoost classifier/regressor with histogram tree method.

    Hyperparameters override the histogram + n_jobs defaults. For classification
    a default ``eval_metric=logloss`` is set to quiet modern-xgboost warnings.
    """
    _require(_HAVE_XGB, "xgboost")
    common = {"n_jobs": -1, "tree_method": "hist", "random_state": random_state, **hp}
    if problem_type == "classification":
        # use_label_encoder removed in modern xgboost; eval_metric quiets warnings
        common.setdefault("eval_metric", "logloss")
        return XGBClassifier(**common)
    return XGBRegressor(**common)


def _lightgbm(problem_type: str, hp: Dict[str, Any], random_state: int) -> Any:
    """Build a LightGBM classifier/regressor (quiet, small-leaf-friendly defaults)."""
    _require(_HAVE_LGBM, "lightgbm")
    common = {"n_jobs": -1, "verbose": -1, "min_child_samples": 5, "random_state": random_state, **hp}
    if problem_type == "classification":
        return LGBMClassifier(**common)
    return LGBMRegressor(**common)


def _logistic_regression(problem_type: str, hp: Dict[str, Any], random_state: int) -> Any:
    """Build a logistic-regression classifier (classification only).

    Raises:
        AlgorithmNotSupportedError: When ``problem_type`` is not ``classification``.
    """
    if problem_type != "classification":
        raise AlgorithmNotSupportedError(
            "logistic_regression supports classification only."
        )
    params = {"max_iter": 1000, "random_state": random_state, **hp}
    return LogisticRegression(**params)


def _random_forest(problem_type: str, hp: Dict[str, Any], random_state: int) -> Any:
    """Build a random-forest classifier/regressor (all cores by default)."""
    common = {"n_jobs": -1, "random_state": random_state, **hp}
    if problem_type == "classification":
        return RandomForestClassifier(**common)
    return RandomForestRegressor(**common)


def _ridge(problem_type: str, hp: Dict[str, Any], random_state: int) -> Any:
    """Build a ridge (L2) regressor (regression only).

    Raises:
        AlgorithmNotSupportedError: When ``problem_type`` is not ``regression``.
    """
    if problem_type != "regression":
        raise AlgorithmNotSupportedError("ridge supports regression only.")
    # Only the sag/saga solvers draw random numbers; seeding keeps them reproducible when a caller picks one.
    params = {"random_state": random_state, **hp}
    return Ridge(**params)


def _mlp(problem_type: str, hp: Dict[str, Any], random_state: int) -> Any:
    """Build a multi-layer-perceptron classifier/regressor (500-iter default cap).

    The catalog stores ``hidden_layer_sizes`` as a string (``"100"``); it is parsed to the int tuple sklearn needs.
    """
    params: Dict[str, Any] = {"max_iter": 500, "random_state": random_state, **hp}
    if "hidden_layer_sizes" in hp:
        params["hidden_layer_sizes"] = parse_hidden_layer_sizes(hp["hidden_layer_sizes"])
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


def build_estimator(algorithm: str, problem_type: str, hyperparameters: Dict[str, Any],
                    random_state: int = DEFAULT_RANDOM_STATE) -> Any:
    """Build an sklearn-compatible estimator for the given driver key.

    Args:
        algorithm: Driver key (must match a seeded ``MJ: ML Algorithms`` DriverClass).
        problem_type: ``classification`` or ``regression``; selects the estimator variant.
        hyperparameters: Passed straight through to the estimator constructor.
        random_state: The seed every factory passes to its estimator; a caller that omits it gets
            ``DEFAULT_RANDOM_STATE``.

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
    return factory(problem_type, dict(hyperparameters or {}), random_state)


# ----------------------------------------------------------------------------- trainer estimators -----

# The task families a tabular candidate trains for (a forecast task has its own estimators).
TabularFamily = Literal["binary", "multiclass", "continuous", "count", "non-negative"]

# Constructor keywords whose value is a candidate's tunable hyperparameter, or a value a trainer factory fixes.
EstimatorParams = Dict[str, Union[HyperparameterValue, Tuple[int, ...]]]


class ObjectiveOverrideError(ValueError):
    """Raised when a candidate's hyperparameters name a keyword the task type fixes: the objective, its evaluation
    metric or power, the random seed, or the thread count (including the libraries' aliases for each)."""


# Every keyword some trainer factory fixes. A candidate naming any of them is refused whatever its driver, so a key a
# driver happens not to set today cannot become a silent override when that driver starts fixing it.
_FIXED_KEYS: FrozenSet[str] = frozenset({
    # objective and the metric/power/link that complete it
    "objective", "objective_type", "application", "app", "loss", "criterion", "eval_metric",
    "tweedie_variance_power", "power", "link",
    # seeds
    "random_state", "seed", "random_seed",
    # thread counts and the deterministic-histogram switches
    "n_jobs", "nthread", "num_threads", "deterministic", "force_row_wise", "force_col_wise",
})


def parse_hidden_layer_sizes(value: HyperparameterValue) -> Tuple[int, ...]:
    """Parse the catalog's ``hidden_layer_sizes`` (``"100"`` or ``"100,50"``, or a bare int) to the int tuple sklearn
    needs.

    Raises:
        ValueError: When the value is missing, a bool, a non-integral number, or names a non-positive layer size.
    """
    if isinstance(value, bool) or value is None:
        raise ValueError(f"hidden_layer_sizes must be a positive int or 'n,m,...', got {value!r}")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"hidden_layer_sizes must be whole numbers, got {value!r}")
    if isinstance(value, (int, float)):
        sizes: Tuple[int, ...] = (int(value),)
    else:
        try:
            sizes = tuple(int(part.strip()) for part in value.split(",") if part.strip() != "")
        except ValueError as exc:
            raise ValueError(f"hidden_layer_sizes must be positive integers, got {value!r}") from exc
    if not sizes or any(s < 1 for s in sizes):
        raise ValueError(f"hidden_layer_sizes must be positive integers, got {value!r}")
    return sizes


def tabular_estimator(driver: str, family: TabularFamily, hp: Dict[str, HyperparameterValue], seed: int,
                      threads: int, tweedie_power: float | None) -> object:
    """Build a deterministic, unfitted estimator for one trainer candidate.

    The objective follows the task family (Poisson for count, Tweedie with the declared power for non-negative),
    every random state is ``seed``, and every parallel library is held to ``threads``.

    Args:
        driver: A key of ``_TABULAR_BUILDERS``.
        family: The task family the candidate trains for.
        hp: The candidate's tunable hyperparameters.
        seed: The protocol seed.
        threads: The thread count every parallel library is held to.
        tweedie_power: The declared Tweedie variance power (non-negative targets only).

    Raises:
        AlgorithmNotSupportedError: For an unknown driver, or a driver that cannot fit ``family``.
        ObjectiveOverrideError: When ``hp`` names a keyword the factory fixes.
    """
    builder = _TABULAR_BUILDERS.get(driver)
    if builder is None:
        raise AlgorithmNotSupportedError(f"Unknown algorithm '{driver}'. Supported: {sorted(_TABULAR_BUILDERS)}")
    collisions = sorted(_FIXED_KEYS.intersection(hp))
    if collisions:
        raise ObjectiveOverrideError(
            f"candidate hyperparameter '{collisions[0]}' is refused: the objective, seed and thread count are set "
            f"from the task type ({family}) and the protocol"
        )
    return builder(family, dict(hp), seed, threads, tweedie_power)


def _declared_tweedie_power(driver: str, tweedie_power: float | None) -> float:
    """The Tweedie power a non-negative target declares; a non-negative candidate without one cannot be built."""
    if tweedie_power is None:
        raise AlgorithmNotSupportedError(f"{driver} needs the declared Tweedie power for non-negative targets")
    return tweedie_power


def _glm(driver: str, family: TabularFamily, params: EstimatorParams, seed: int, threads: int,
         tweedie_power: float | None) -> object:
    """The four GLM drivers, each tied to the family whose likelihood it fits."""
    if driver == "logistic_regression":
        if family not in ("binary", "multiclass"):
            raise AlgorithmNotSupportedError("logistic_regression supports binary and multiclass only")
        return LogisticRegression(**{"max_iter": 5000, "C": 1.0, **params, "random_state": seed, "n_jobs": threads})
    if driver == "ridge":
        if family != "continuous":
            raise AlgorithmNotSupportedError("ridge supports continuous targets only")
        # Only the sag/saga solvers draw random numbers; the seed keeps them reproducible when a candidate picks one.
        return Ridge(**{"alpha": 1.0, **params, "random_state": seed})
    if driver == "poisson_glm":
        if family != "count":
            raise AlgorithmNotSupportedError("poisson_glm supports count targets only")
        return PoissonRegressor(**{"alpha": 1e-4, "max_iter": 5000, **params})
    if family != "non-negative":
        raise AlgorithmNotSupportedError("tweedie_glm supports non-negative targets only")
    power = _declared_tweedie_power(driver, tweedie_power)
    return TweedieRegressor(**{"alpha": 1e-4, "max_iter": 5000, **params, "power": power, "link": "log"})


def _forest(family: TabularFamily, params: EstimatorParams, seed: int, threads: int) -> object:
    """Random forest; count and non-negative targets split on Poisson deviance."""
    if family in ("binary", "multiclass"):
        return RandomForestClassifier(**{**params, "criterion": "gini", "n_jobs": threads, "random_state": seed})
    criterion = "poisson" if family in ("count", "non-negative") else "squared_error"
    return RandomForestRegressor(**{**params, "criterion": criterion, "n_jobs": threads, "random_state": seed})


def _trainer_mlp(family: TabularFamily, params: EstimatorParams, seed: int) -> object:
    """Multi-layer perceptron (binary, multiclass and continuous only); the catalog's string layer sizes are parsed.

    sklearn's MLP has no ``n_jobs``: its matrix products run in the BLAS, whose threads the process environment holds.
    """
    if family in ("count", "non-negative"):
        raise AlgorithmNotSupportedError("mlp has no Poisson/Tweedie objective; it cannot rank by deviance")
    mlp_params: EstimatorParams = {"max_iter": 500, **params, "random_state": seed}
    layers = params.get("hidden_layer_sizes")
    if layers is not None and not isinstance(layers, tuple):
        mlp_params["hidden_layer_sizes"] = parse_hidden_layer_sizes(layers)
    if family in ("binary", "multiclass"):
        return MLPClassifier(**mlp_params)
    return MLPRegressor(**mlp_params)


def _trainer_xgboost(family: TabularFamily, params: EstimatorParams, seed: int, threads: int,
                     tweedie_power: float | None) -> object:
    """XGBoost with the histogram tree method; the objective and its evaluation metric follow the family."""
    _require(_HAVE_XGB, "xgboost")
    tunable: EstimatorParams = {"tree_method": "hist", "verbosity": 0, **params}
    fixed: EstimatorParams = {"n_jobs": threads, "random_state": seed}
    if family == "binary":
        return XGBClassifier(**tunable, **fixed, objective="binary:logistic", eval_metric="logloss")
    if family == "multiclass":
        return XGBClassifier(**tunable, **fixed, objective="multi:softprob", eval_metric="mlogloss")
    if family == "count":
        return XGBRegressor(**tunable, **fixed, objective="count:poisson")
    if family == "non-negative":
        power = _declared_tweedie_power("xgboost", tweedie_power)
        return XGBRegressor(**tunable, **fixed, objective="reg:tweedie", tweedie_variance_power=power)
    return XGBRegressor(**tunable, **fixed, objective="reg:squarederror")


_LIGHTGBM_OBJECTIVE: Dict[TabularFamily, str] = {
    "binary": "binary", "multiclass": "multiclass", "continuous": "regression",
    "count": "poisson", "non-negative": "tweedie",
}


def _trainer_lightgbm(family: TabularFamily, params: EstimatorParams, seed: int, threads: int,
                      tweedie_power: float | None) -> object:
    """LightGBM in its deterministic row-wise histogram mode; the objective follows the family.

    The fixed keywords go to the typed constructor; the candidate's vetted tunables are applied with ``set_params``,
    which takes arbitrary keywords (the constructor's typed signature cannot accept a dict of mixed values).
    """
    _require(_HAVE_LGBM, "lightgbm")
    tunable: EstimatorParams = {"verbose": -1, "min_child_samples": 5, **params}
    estimator_type = LGBMClassifier if family in ("binary", "multiclass") else LGBMRegressor
    est = estimator_type(objective=_LIGHTGBM_OBJECTIVE[family], n_jobs=threads, random_state=seed,
                         deterministic=True, force_row_wise=True)
    if family == "non-negative":
        est.set_params(tweedie_variance_power=_declared_tweedie_power("lightgbm", tweedie_power))
    return est.set_params(**tunable)


# Builds one candidate from (family, vetted hyperparameters, seed, threads, declared Tweedie power).
TabularBuilder = Callable[[TabularFamily, EstimatorParams, int, int, Union[float, None]], object]

# The trainer's driver table. ``poisson_glm`` and ``tweedie_glm`` are baseline-only drivers (the GLM baseline fits
# them): they have no ``MJ: ML Algorithms`` catalog row, and a candidate's driver key must never name them.
_TABULAR_BUILDERS: Dict[str, TabularBuilder] = {
    "logistic_regression": lambda f, p, s, t, w: _glm("logistic_regression", f, p, s, t, w),
    "ridge": lambda f, p, s, t, w: _glm("ridge", f, p, s, t, w),
    "poisson_glm": lambda f, p, s, t, w: _glm("poisson_glm", f, p, s, t, w),
    "tweedie_glm": lambda f, p, s, t, w: _glm("tweedie_glm", f, p, s, t, w),
    "random_forest": lambda f, p, s, t, w: _forest(f, p, s, t),
    "mlp": lambda f, p, s, t, w: _trainer_mlp(f, p, s),
    "xgboost": _trainer_xgboost,
    "lightgbm": _trainer_lightgbm,
}
