"""Algorithm drivers: the trainer's estimator for one candidate.

``tabular_estimator`` builds one candidate for a task family: the objective follows the family, every random state is
the protocol seed, every parallel library is held to the given thread count, and a candidate hyperparameter that names
one of those fixed keywords is refused.

The driver keys MUST match the ``DriverClass`` values seeded in the ``MJ: ML Algorithms`` catalog (the two GLM
baseline drivers excepted, see ``_TABULAR_BUILDERS``).
"""

from __future__ import annotations

from typing import Callable, Dict, FrozenSet, List, Literal, Tuple, Union

from sklearn.ensemble import (
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, PoissonRegressor, Ridge, TweedieRegressor
from sklearn.neural_network import MLPClassifier, MLPRegressor

from .trainer_schemas import HyperparameterValue

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


class AlgorithmNotSupportedError(ValueError):
    """Raised when a driver key / task-family pairing has no estimator."""


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


def supported_algorithms() -> List[str]:
    """Return the catalog driver keys a candidate may name (sorted for stable health output); the baseline-only GLM
    drivers are left out."""
    return sorted(k for k in _TABULAR_BUILDERS if k not in BASELINE_ONLY_DRIVERS)


# ----------------------------------------------------------------------------- trainer estimators -----

# The task families a tabular candidate trains for (a forecast task has its own estimators).
TabularFamily = Literal["binary", "multiclass", "continuous", "count", "non-negative"]

# Constructor keywords whose value is a candidate's tunable hyperparameter, or a value a trainer factory fixes.
EstimatorParams = Dict[str, Union[HyperparameterValue, Tuple[int, ...]]]

# A candidate's tunable hyperparameters, as the trainer request carries them (vetted against the fixed keywords).
CandidateParams = Dict[str, HyperparameterValue]


class ObjectiveOverrideError(ValueError):
    """Raised when a candidate's hyperparameters name a keyword the task type fixes: the objective (including the
    multiclass strategy), its evaluation metric or power, a random seed, the thread count, or the tree method and
    device (including the libraries' aliases for each)."""


class InvalidTweediePowerError(ValueError):
    """Raised when a non-negative target's declared ``tweedie_power`` is missing or outside the open interval (1, 2)
    of the compound Poisson-gamma distribution."""


# Every keyword some trainer factory fixes. A candidate naming any of them is refused whatever its driver, so a key a
# driver happens not to set today cannot become a silent override when that driver starts fixing it.
_FIXED_KEYS: FrozenSet[str] = frozenset({
    # objective and the metric/power/link that complete it
    "objective", "objective_type", "application", "app", "loss", "criterion", "multi_class",
    "eval_metric", "metric", "metrics", "metric_types",
    "tweedie_variance_power", "power", "link",
    # seeds, including LightGBM's sub-seeds (each would otherwise replace the one derived from the protocol seed)
    "random_state", "seed", "random_seed",
    "bagging_seed", "feature_fraction_seed", "data_random_seed", "extra_seed", "drop_seed",
    # thread counts, the deterministic-histogram switches, and the tree method and device, including XGBoost's older
    # GPU selectors (a GPU fit is not bit-reproducible)
    "n_jobs", "nthread", "num_threads", "deterministic", "force_row_wise", "force_col_wise",
    "tree_method", "device", "device_type", "gpu_id", "predictor",
})


def parse_hidden_layer_sizes(value: HyperparameterValue) -> Tuple[int, ...]:
    """Parse ``hidden_layer_sizes`` to the int tuple sklearn needs: the catalog's ``"100"`` or ``"100,50"``, or a bare
    int.

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
        InvalidTweediePowerError: When a non-negative target's ``tweedie_power`` is missing or outside (1, 2).
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
    """The Tweedie power a non-negative target declares, strictly between 1 (Poisson) and 2 (gamma)."""
    if tweedie_power is None:
        raise InvalidTweediePowerError(f"{driver} needs the declared tweedie_power for non-negative targets")
    if not 1.0 < tweedie_power < 2.0:
        raise InvalidTweediePowerError(f"tweedie_power must lie strictly between 1 and 2, got {tweedie_power!r}")
    return tweedie_power


def _glm(driver: str, family: TabularFamily, params: CandidateParams, seed: int, threads: int,
         tweedie_power: float | None) -> object:
    """The four GLM drivers, each tied to the family whose likelihood it fits."""
    if driver == "logistic_regression":
        if family not in ("binary", "multiclass"):
            raise AlgorithmNotSupportedError("logistic_regression supports binary and multiclass only")
        fixed: EstimatorParams = {"random_state": seed, "n_jobs": threads}
        if family == "multiclass":
            fixed["multi_class"] = "multinomial"  # one softmax likelihood, not one-vs-rest
        return LogisticRegression(**{"max_iter": 5000, "C": 1.0, **params, **fixed})
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


def _forest(family: TabularFamily, params: CandidateParams, seed: int, threads: int) -> object:
    """Random forest; count and non-negative targets split on Poisson deviance."""
    if family in ("binary", "multiclass"):
        return RandomForestClassifier(**{**params, "criterion": "gini", "n_jobs": threads, "random_state": seed})
    criterion = "poisson" if family in ("count", "non-negative") else "squared_error"
    return RandomForestRegressor(**{**params, "criterion": criterion, "n_jobs": threads, "random_state": seed})


def _trainer_mlp(family: TabularFamily, params: CandidateParams, seed: int) -> object:
    """Multi-layer perceptron (binary, multiclass and continuous only); the catalog's string layer sizes are parsed.

    sklearn's MLP has no ``n_jobs``: its matrix products run in the BLAS, so its threads are bounded by the process's
    BLAS limits. The test runners and the truth sidecar pin those to one thread through the environment; the trainer
    holds them to ``threads`` with ``threadpool_limits`` around each fit.
    """
    if family in ("count", "non-negative"):
        raise AlgorithmNotSupportedError("mlp has no Poisson/Tweedie objective; it cannot rank by deviance")
    mlp_params: EstimatorParams = {"max_iter": 500, **params, "random_state": seed}
    if "hidden_layer_sizes" in params:
        mlp_params["hidden_layer_sizes"] = parse_hidden_layer_sizes(params["hidden_layer_sizes"])
    if family in ("binary", "multiclass"):
        return MLPClassifier(**mlp_params)
    return MLPRegressor(**mlp_params)


def _trainer_xgboost(family: TabularFamily, params: CandidateParams, seed: int, threads: int,
                     tweedie_power: float | None) -> object:
    """XGBoost with the histogram tree method on the CPU; the objective and its evaluation metric follow the family."""
    _require(_HAVE_XGB, "xgboost")
    tunable: EstimatorParams = {"verbosity": 0, **params}
    fixed: EstimatorParams = {"n_jobs": threads, "random_state": seed, "tree_method": "hist", "device": "cpu"}
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


def _trainer_lightgbm(family: TabularFamily, params: CandidateParams, seed: int, threads: int,
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
TabularBuilder = Callable[[TabularFamily, CandidateParams, int, int, Union[float, None]], object]

# The drivers only the GLM baseline fits: they have no ``MJ: ML Algorithms`` catalog row, and a request candidate
# naming one is refused.
BASELINE_ONLY_DRIVERS: FrozenSet[str] = frozenset({"poisson_glm", "tweedie_glm"})

# The trainer's driver table: every catalog driver plus the baseline-only ones.
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
