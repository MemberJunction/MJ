# truthsuite/refpipe/models.py — the reference pipeline's candidate learners, all seeded and single-threaded (S5.4), plus calibration and series models.
#   tabular: GLM (L2 logistic / multinomial / ridge / PoissonRegressor / TweedieRegressor(1.5, log link)),
#            xgboost and lightgbm with the objective chosen by problem family (S4.3)
#   calibration: Platt below 2,000 training rows, isotonic at or above, fit on out-of-fold predictions (S6.3)
#   series: trend+season OLS, trend+season+AR(1) (recursive), additive Holt-Winters; forecasts clipped at 0 when the
#           training window is non-negative
from __future__ import annotations

import warnings
from statistics import NormalDist
from dataclasses import dataclass, field
from typing import Protocol

import lightgbm as lgb
import numpy as np
import numpy.typing as npt
import pandas as pd
import xgboost as xgb
from sklearn.compose import ColumnTransformer
from statsmodels.tsa.arima.model import ARIMA, ARIMAResults
from statsmodels.tsa.holtwinters import ExponentialSmoothing, HoltWintersResults
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression, PoissonRegressor, Ridge, TweedieRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler

FArr = npt.NDArray[np.float64]
PROBLEMS = ("binary", "multiclass", "regression", "count", "tweedie")
ALGOS = ("glm", "lgbm", "xgb")  # complexity order: the 1-SE rule prefers earlier entries
TWEEDIE_POWER = 1.5
PLATT_BELOW = 2000


class Predictor(Protocol):
    def predict(self, X: pd.DataFrame) -> FArr: ...


def _pre(num: list[str], cat: list[str], scale: bool) -> ColumnTransformer:
    num_steps: list[tuple[str, object]] = [("imp", SimpleImputer(strategy="median"))]
    if scale:
        num_steps.append(("sc", StandardScaler()))
    parts: list[tuple[str, object, list[str]]] = []
    if num:
        parts.append(("num", Pipeline(num_steps), num))
    if cat:
        enc: object = (OneHotEncoder(handle_unknown="ignore") if scale
                       else OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1))
        parts.append(("cat", Pipeline([("imp", SimpleImputer(strategy="constant", fill_value="NA")), ("enc", enc)]), cat))
    return ColumnTransformer(parts)


def _estimator(problem: str, algo: str, n_classes: int, seed: int) -> object:
    if algo == "glm":
        if problem in ("binary", "multiclass"):
            return LogisticRegression(C=1.0, max_iter=5000)
        if problem == "regression":
            return Ridge(alpha=1.0)
        if problem == "count":
            return PoissonRegressor(alpha=1e-4, max_iter=5000)
        if problem == "tweedie":
            return TweedieRegressor(power=TWEEDIE_POWER, link="log", alpha=1e-4, max_iter=5000)
    if algo == "xgb":
        common = dict(n_estimators=300, learning_rate=0.05, max_depth=4, subsample=0.8, tree_method="hist",
                      random_state=seed, n_jobs=1, verbosity=0)
        if problem == "binary":
            return xgb.XGBClassifier(objective="binary:logistic", **common)
        if problem == "multiclass":
            return xgb.XGBClassifier(objective="multi:softprob", num_class=n_classes, **common)
        if problem == "regression":
            return xgb.XGBRegressor(objective="reg:squarederror", **common)
        if problem == "count":
            return xgb.XGBRegressor(objective="count:poisson", **common)
        if problem == "tweedie":
            return xgb.XGBRegressor(objective="reg:tweedie", tweedie_variance_power=TWEEDIE_POWER, **common)
    if algo == "lgbm":
        cls = lgb.LGBMClassifier if problem in ("binary", "multiclass") else lgb.LGBMRegressor
        objective = {"binary": "binary", "multiclass": "multiclass", "regression": "regression", "count": "poisson",
                     "tweedie": "tweedie"}[problem]
        est = cls(objective=objective, n_estimators=300, learning_rate=0.05, num_leaves=15, min_child_samples=50,
                  subsample=0.8, subsample_freq=1, random_state=seed, n_jobs=1, deterministic=True, force_row_wise=True,
                  verbose=-1)
        if problem == "tweedie":
            est.set_params(tweedie_variance_power=TWEEDIE_POWER)
        return est
    raise ValueError(f"no estimator for {problem}/{algo}")


@dataclass
class TabularModel:
    """One candidate: preprocessing + estimator on raw source columns. predict() returns P(y=1) (binary), an (n, K)
    probability matrix (multiclass) or the conditional mean (regression, count, tweedie)."""
    problem: str
    algo: str
    num: list[str]
    cat: list[str]
    n_classes: int = 2
    seed: int = 0
    _pipe: Pipeline | None = field(default=None, repr=False)

    @property
    def name(self) -> str:
        return self.algo

    def fit(self, X: pd.DataFrame, y: npt.NDArray[np.generic]) -> "TabularModel":
        pipe = Pipeline([("pre", _pre(self.num, self.cat, scale=self.algo == "glm")),
                         ("est", _estimator(self.problem, self.algo, self.n_classes, self.seed))])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pipe.fit(X[self.num + self.cat], y)
        self._pipe = pipe
        return self

    def predict(self, X: pd.DataFrame) -> FArr:
        pipe = self._pipe
        if pipe is None:
            raise RuntimeError("not fitted")
        Xs = X[self.num + self.cat]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            if self.problem == "binary":
                return np.asarray(pipe.predict_proba(Xs)[:, 1], dtype=np.float64)
            if self.problem == "multiclass":
                return np.asarray(pipe.predict_proba(Xs), dtype=np.float64)
            out = np.asarray(pipe.predict(Xs), dtype=np.float64)
        return np.maximum(out, 1e-9) if self.problem in ("count", "tweedie") else out


@dataclass
class ConstantModel:
    """Base rate (binary), class prior (multiclass) or training mean (regression families)."""
    value: FArr

    def predict(self, X: pd.DataFrame) -> FArr:
        if self.value.ndim == 0 or self.value.size == 1:
            return np.full(len(X), float(self.value.reshape(-1)[0]), dtype=np.float64)
        return np.tile(self.value, (len(X), 1)).astype(np.float64)


def _logit(p: FArr) -> FArr:
    q = np.clip(p, 1e-6, 1 - 1e-6)
    return np.asarray(np.log(q / (1 - q)), dtype=np.float64)


@dataclass
class Calibrator:
    """Platt (logistic on logit p) below PLATT_BELOW calibration rows, isotonic at or above (S6.3: "Platt ... below a few
    thousand calibration rows and isotonic only above that"); one-vs-rest + renormalised for multiclass. Fit on
    out-of-fold predictions, which are disjoint from the rows each fold model was trained on."""
    method: str
    maps: list[LogisticRegression | IsotonicRegression]

    @staticmethod
    def fit(y: npt.NDArray[np.generic], p_oof: FArr, n_cal_rows: int) -> "Calibrator":
        method = "platt" if n_cal_rows < PLATT_BELOW else "isotonic"
        P = p_oof.reshape(-1, 1) if p_oof.ndim == 1 else p_oof
        yi = np.asarray(y, dtype=np.int64)
        maps: list[LogisticRegression | IsotonicRegression] = []
        cols = [1] if p_oof.ndim == 1 else list(range(P.shape[1]))
        for j, k in enumerate(cols):
            yk = (yi == k).astype(np.int64)
            pk = P[:, 0] if p_oof.ndim == 1 else P[:, j]
            if method == "platt":
                m: LogisticRegression | IsotonicRegression = LogisticRegression(C=1e6, max_iter=5000).fit(_logit(pk).reshape(-1, 1), yk)
            else:
                m = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(pk, yk)
            maps.append(m)
        return Calibrator(method, maps)

    def apply(self, p: FArr) -> FArr:
        P = p.reshape(-1, 1) if p.ndim == 1 else p
        outs = []
        for j, m in enumerate(self.maps):
            pk = P[:, j]
            if self.method == "platt":
                outs.append(np.asarray(m.predict_proba(_logit(pk).reshape(-1, 1))[:, 1], dtype=np.float64))
            else:
                outs.append(np.asarray(m.predict(pk), dtype=np.float64))
        if p.ndim == 1:
            return np.clip(outs[0], 1e-6, 1 - 1e-6)
        Q = np.clip(np.column_stack(outs), 1e-6, None)
        return np.asarray(Q / Q.sum(axis=1, keepdims=True), dtype=np.float64)


@dataclass
class CalibratedModel:
    """The calibration map (fit on out-of-fold predictions, disjoint from each fold model's training rows) applied to the
    full-carve refit, so the delivered predictor uses all training rows including the most recent ones."""
    base: Predictor
    cal: Calibrator

    def predict(self, X: pd.DataFrame) -> FArr:
        return self.cal.apply(self.base.predict(X))


# ------------------------------------------------------------------ series ------------------------------------------
# complexity order (the 1-SE rule prefers earlier entries): AR(1)+constant (3 parameters), trend+season OLS (13),
# trend+season+AR(1) (14), additive Holt-Winters (3 smoothing + 14 initial states)
SERIES_ALGOS = ("ar1_const", "trend_season_ols", "trend_season_ar1", "holt_winters_add")
SEASON = 12


def _design(t: npt.NDArray[np.int64], month: npt.NDArray[np.int64], exog: FArr | None) -> FArr:
    cols = [np.ones(len(t)), t.astype(np.float64)]
    for m in range(1, SEASON):
        cols.append((month == m).astype(np.float64))
    X = np.column_stack(cols)
    return np.column_stack([X, exog]) if exog is not None and exog.shape[1] > 0 else X


@dataclass
class SeriesModel:
    """Forecaster on one monthly series. exog: columns read as-is at forecast time (their values are in the rows). The
    AR(1) term is the series' own previous value, forecast recursively beyond one step, so no test-window target is
    read (S-T.1). Prediction intervals: Gaussian with the model's h-step variance (OLS: sigma^2; trend+season+AR(1):
    sigma^2 * sum_{j<h} phi^(2j); ARIMA(1,0,0): statsmodels get_forecast().conf_int) or, for Holt-Winters, the
    statsmodels simulate() quantiles (2,000 seeded paths). sigma^2 comes from the origin's own in-window residuals."""
    algo: str
    nonneg: bool = False
    beta: FArr = field(default_factory=lambda: np.zeros(0))
    resid: FArr = field(default_factory=lambda: np.zeros(0))
    sigma2: float = 0.0
    phi: float | None = None
    phi_se: float | None = None
    last_y: float = 0.0
    hw: HoltWintersResults | None = None
    arima: ARIMAResults | None = None

    def fit(self, y: FArr, t: npt.NDArray[np.int64], month: npt.NDArray[np.int64], exog: FArr | None) -> "SeriesModel":
        self.nonneg = bool(np.min(y) >= 0)
        has_ex = exog is not None and exog.shape[1] > 0
        if self.algo == "holt_winters_add":
            if has_ex:
                raise ValueError("holt_winters_add takes no exogenous columns")
            if len(y) < 2 * SEASON + 1:
                raise ValueError("holt_winters_add needs at least two full seasons")
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                fit = ExponentialSmoothing(y, trend="add", seasonal="add", seasonal_periods=SEASON,
                                           initialization_method="estimated").fit(optimized=True)
            self.hw = fit
            self.resid = np.asarray(y - np.asarray(fit.fittedvalues, dtype=np.float64), dtype=np.float64)
            self.sigma2 = float(np.mean(self.resid ** 2))
            return self
        if self.algo == "ar1_const":
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                res = ARIMA(y, exog=exog if has_ex else None, order=(1, 0, 0), trend="c").fit()
            self.arima = res
            names = list(res.model.param_names)
            i = names.index("ar.L1")
            self.phi = float(np.asarray(res.params)[i]); self.phi_se = float(np.asarray(res.bse)[i])
            self.resid = np.asarray(res.resid, dtype=np.float64)[1:]  # the first residual is the unconditional start
            self.sigma2 = float(np.asarray(res.params)[names.index("sigma2")])
            return self
        X = _design(t, month, exog)
        yy = y
        if self.algo == "trend_season_ar1":
            X = np.column_stack([X[1:], y[:-1]]); yy = y[1:]
        beta, *_ = np.linalg.lstsq(X, yy, rcond=None)
        self.beta = np.asarray(beta, dtype=np.float64)
        self.resid = np.asarray(yy - X @ self.beta, dtype=np.float64)
        dof = max(1, len(yy) - X.shape[1])
        self.sigma2 = float(np.sum(self.resid ** 2) / dof)
        if self.algo == "trend_season_ar1":
            cov = self.sigma2 * np.linalg.pinv(X.T @ X)
            self.phi = float(self.beta[-1]); self.phi_se = float(np.sqrt(cov[-1, -1]))
        self.last_y = float(y[-1])
        return self

    def forecast(self, t: npt.NDArray[np.int64], month: npt.NDArray[np.int64], exog: FArr | None) -> FArr:
        if self.algo == "holt_winters_add":
            if self.hw is None:
                raise RuntimeError("not fitted")
            out = np.asarray(self.hw.forecast(len(t)), dtype=np.float64)
        elif self.algo == "ar1_const":
            if self.arima is None:
                raise RuntimeError("not fitted")
            has_ex = exog is not None and exog.shape[1] > 0
            out = np.asarray(self.arima.forecast(len(t), exog=exog if has_ex else None), dtype=np.float64)
        elif self.algo == "trend_season_ar1":
            X = _design(t, month, exog); prev = self.last_y; res = []
            for i in range(len(t)):
                v = float(np.concatenate([X[i], [prev]]) @ self.beta)
                res.append(v); prev = v
            out = np.array(res, dtype=np.float64)
        else:
            out = np.asarray(_design(t, month, exog) @ self.beta, dtype=np.float64)
        return np.maximum(out, 0.0) if self.nonneg else out

    def interval(self, t: npt.NDArray[np.int64], month: npt.NDArray[np.int64], exog: FArr | None, level: float,
                 seed: int = 0) -> tuple[FArr, FArr]:
        h = len(t)
        mean = self.forecast(t, month, exog)
        if self.algo == "holt_winters_add":
            if self.hw is None:
                raise RuntimeError("not fitted")
            sims = np.asarray(self.hw.simulate(h, repetitions=2000, error="add", random_state=seed), dtype=np.float64)
            lo = np.quantile(sims, (1 - level) / 2, axis=1); hi = np.quantile(sims, (1 + level) / 2, axis=1)
        elif self.algo == "ar1_const":
            if self.arima is None:
                raise RuntimeError("not fitted")
            has_ex = exog is not None and exog.shape[1] > 0
            ci = np.asarray(self.arima.get_forecast(h, exog=exog if has_ex else None).conf_int(alpha=1 - level),
                            dtype=np.float64)
            lo, hi = ci[:, 0], ci[:, 1]
        else:
            z = NormalDist().inv_cdf((1 + level) / 2)
            if self.algo == "trend_season_ar1" and self.phi is not None:
                var = self.sigma2 * np.cumsum(self.phi ** (2 * np.arange(h)))
            else:
                var = np.full(h, self.sigma2)
            raw = mean if not self.nonneg else self._raw_forecast(t, month, exog)
            lo, hi = raw - z * np.sqrt(var), raw + z * np.sqrt(var)
        lo_a = np.asarray(lo, dtype=np.float64); hi_a = np.asarray(hi, dtype=np.float64)
        if self.nonneg:
            lo_a = np.maximum(lo_a, 0.0); hi_a = np.maximum(hi_a, 0.0)
        return lo_a, hi_a

    def _raw_forecast(self, t: npt.NDArray[np.int64], month: npt.NDArray[np.int64], exog: FArr | None) -> FArr:
        keep = self.nonneg
        self.nonneg = False
        try:
            return self.forecast(t, month, exog)
        finally:
            self.nonneg = keep
