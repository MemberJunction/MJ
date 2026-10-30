"""Time-ordered evaluation of one series: the rolling-origin design, per-origin baselines and MASE, the Diebold-Mariano
test, residual autocorrelation, and the series models.

  rolling_origins    >= 5 non-overlapping h-period test windows ending at the last period; origin k trains on the
                     periods up to `gap` before its first test period, from period 0 (expanding) or from the last
                     `min_train` periods (sliding)
  SeriesBaseline     naive (last value), seasonal-naive (last season, aligned by season position across any gap) and
                     training-window mean, each from the window it was fitted on only (naive_last / seasonal_naive /
                     series_mean)
  mase_scale         in-sample seasonal-naive MAE of a training window, the MASE denominator (Hyndman & Athanasopoulos,
                     FPP3 5.8)
  backtest           scores a forecaster and the three baselines at every origin, scaled by that origin's own MASE scale
  diebold_mariano    DM test of equal accuracy with HAC variance (h-1 lags) and the Harvey-Leybourne-Newbold correction
  hac_se             Newey-West (Bartlett) standard error of a mean
  acf / ljung_box    residual autocorrelation and the Ljung-Box Q test; panel_acf pools within-entity pairs and
                     box_pierce tests them
  SeriesModel        AR(1) + constant, trend + season OLS, trend + season + AR(1); terms on the series' own previous
                     value are forecast recursively, so no target inside a test window is read

The statistics are ports of the truth suite's reference pipeline (`truthsuite.refpipe.scoring`: mase_scale, acf,
ljung_box, hac_se, panel_acf, diebold_mariano; `truthsuite.refpipe.baselines`: naive_last, seasonal_naive,
series_mean), with input checks added: a function that cannot compute on its input raises ValueError naming it. The
series models follow `truthsuite.refpipe.models.SeriesModel` with two differences, both because statsmodels is not a
sidecar dependency. AR(1) + constant is fitted by conditional least squares with a Gaussian sigma^2 * sum phi^(2j)
interval, not by statsmodels' exact ARIMA likelihood and its forecast interval, so its forecasts, intervals and
MASE differ from the reference pipeline's (on the 240-month monthly truth series with 12 origins: MASE 0.6229
against 0.6242). The reference pipeline's additive Holt-Winters candidate is not offered.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Literal, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy import stats

from .array_types import FArr, IntArr

SeriesAlgo = Literal["ar1_const", "trend_season_ols", "trend_season_ar1"]
# Complexity order: the one-standard-error rule prefers earlier entries.
SERIES_ALGOS: Tuple[SeriesAlgo, ...] = ("ar1_const", "trend_season_ols", "trend_season_ar1")
WindowKind = Literal["expanding", "sliding"]
BaselineKind = Literal["naive", "seasonal-naive", "mean"]
# Backtest member name -> the baseline that produces it ("model" is the forecaster under test).
BASELINE_MEMBERS: Tuple[Tuple[str, BaselineKind], ...] = (
    ("mean", "mean"), ("naive", "naive"), ("seasonalNaive", "seasonal-naive"))


def series_algo(key: str) -> Optional[SeriesAlgo]:
    """`key` as a series algorithm, or None when it names some other driver."""
    for algo in SERIES_ALGOS:
        if algo == key:
            return algo
    return None


# ------------------------------------------------------------------ design ------------------------------------------

@dataclass(frozen=True)
class Origin:
    """One rolling origin: its training window (period indices first_train..last_train) and the periods it scores."""

    k: int                 # 1-based origin number
    last_train: int        # index of the last training period (inclusive)
    first_train: int       # index of the first training period; 0 for expanding windows
    test: Tuple[int, ...]  # period indices scored at this origin


def rolling_origins(n_periods: int, origins: int, horizon: int, gap: int, min_train: int,
                    window: WindowKind) -> List[Origin]:
    """`origins` non-overlapping `horizon`-period test windows ending at the last period (first test period =
    n - origins * horizon, as the reference pipeline places them). Origin k's training window ends `gap` periods
    before its first test period; every origin must keep at least `min_train` training periods."""
    if origins < 5:
        raise ValueError(f"rolling-origin needs at least 5 origins, got {origins}")
    if horizon < 1:
        raise ValueError(f"rolling-origin horizon must be at least 1 period, got {horizon}")
    if gap < 0:
        raise ValueError(f"rolling-origin gap must be at least 0 periods, got {gap}")
    first_test = n_periods - origins * horizon
    out: List[Origin] = []
    for k in range(1, origins + 1):
        start = first_test + (k - 1) * horizon
        last_train = start - 1 - gap
        if last_train + 1 < min_train:
            raise ValueError(f"origin {k} has {max(0, last_train + 1)} training periods, below minTrainPeriods "
                             f"{min_train}")
        first = 0 if window == "expanding" else last_train + 1 - min_train
        out.append(Origin(k, last_train, first, tuple(range(start, start + horizon))))
    return out


# ------------------------------------------------------------------ baselines and scale -----------------------------

def _window(y_train: FArr) -> FArr:
    tr = np.asarray(y_train, dtype=np.float64)
    if len(tr) == 0:
        raise ValueError("the training window is empty")
    return tr


def _steps_after(t: IntArr, last_t: int, what: str) -> IntArr:
    """Each period's step past a window ending at period `last_t` (1 = the next period); earlier periods refused."""
    return _checked_steps(np.asarray(t, dtype=np.int64) - last_t, what, f" (last period {last_t})")


def _checked_steps(steps: IntArr, what: str, where: str = "") -> IntArr:
    s = np.asarray(steps, dtype=np.int64)
    if len(s) > 0 and int(s.min()) < 1:
        raise ValueError(f"{what} forecasts only periods after the training window{where}")
    return s


def naive_last(y_train: FArr, steps: IntArr) -> FArr:
    """The window's last value at every step past the window."""
    s = _checked_steps(steps, "naive")
    return np.full(len(s), float(_window(y_train)[-1]), dtype=np.float64)


def seasonal_naive(y_train: FArr, steps: IntArr, season: int) -> FArr:
    """The window's last full season, read at each step's position in the season: step s past the window takes the
    value s - season * ceil(s / season) periods from the window's end, so a gap between the window and the forecast
    periods keeps the season aligned. (The reference pipeline's `truthsuite.refpipe.baselines.seasonal_naive` takes a
    horizon and assumes the first forecast period follows the window; its series pipeline never leaves a gap, and at
    gap 0 both give the same values.)"""
    s = _checked_steps(steps, "seasonal-naive")
    tr = _window(y_train)
    if len(tr) < season:
        raise ValueError(f"the training window ({len(tr)} periods) is shorter than the seasonal period {season}")
    last = tr[-season:]
    return np.asarray(last[(s - 1) % season], dtype=np.float64)


def series_mean(y_train: FArr, steps: IntArr) -> FArr:
    """The window's mean at every step past the window."""
    s = _checked_steps(steps, "mean")
    return np.full(len(s), float(np.mean(_window(y_train))), dtype=np.float64)


def mase_scale(y_train: FArr, season: int) -> float:
    """In-sample seasonal-naive MAE of the training window only; a window with no seasonal change cannot scale."""
    tr = np.asarray(y_train, dtype=np.float64)
    if len(tr) <= season:
        raise ValueError(f"the training window ({len(tr)} periods) is shorter than the seasonal period {season} + 1")
    scale = float(np.mean(np.abs(tr[season:] - tr[:-season])))
    if not scale > 0:
        raise ValueError("the training window's in-sample seasonal-naive MAE is 0, so MASE is undefined")
    return scale


@dataclass
class SeriesBaseline:
    """Naive, seasonal-naive or training-window-mean forecaster. `fit`/`forecast` take period indices like
    `SeriesModel` so either can stand as a series member. A baseline reads only the window's values; the periods
    place each forecast at its step past the window."""

    kind: BaselineKind
    season: int = 12
    history: FArr = field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    last_t: int = -1

    def fit(self, y: FArr, t: IntArr) -> "SeriesBaseline":
        """Keeps the window's values `y` at periods `t` (in period order) and its last period.

        Raises:
            ValueError: When `y` and `t` differ in length.
        """
        if len(y) != len(t):
            raise ValueError(f"y ({len(y)}) and t ({len(t)}) must have the same length")
        self.history = np.asarray(y, dtype=np.float64)
        self.last_t = int(t[-1]) if len(t) > 0 else -1
        return self

    def forecast(self, t: IntArr) -> FArr:
        """Forecasts for periods t after the window, each at its own step past the window's last period."""
        if len(self.history) == 0:
            raise ValueError(f"the {self.kind} baseline is not fitted")
        steps = _steps_after(t, self.last_t, f"the {self.kind} baseline")
        if self.kind == "naive":
            return naive_last(self.history, steps)
        if self.kind == "seasonal-naive":
            return seasonal_naive(self.history, steps, self.season)
        return series_mean(self.history, steps)


# ------------------------------------------------------------------ backtest ----------------------------------------

OriginForecaster = Callable[[Origin], FArr]


@dataclass(frozen=True)
class OriginScores:
    """One origin's forecasts and errors for the model ("model") and each baseline (BASELINE_MEMBERS names)."""

    origin: Origin
    scale: float                     # the origin's in-sample seasonal-naive MAE
    actual: FArr                     # the test periods' targets
    forecasts: Dict[str, FArr]
    raw_errors: Dict[str, FArr]      # actual - forecast
    scaled_errors: Dict[str, FArr]   # |actual - forecast| / scale

    @property
    def k(self) -> int:
        """The origin's 1-based number."""
        return self.origin.k

    def mase(self, member: str) -> float:
        """The member's MASE at this origin."""
        return float(np.mean(self.scaled_errors[member]))


def backtest(y: FArr, design: Sequence[Origin], season: int, forecaster: OriginForecaster) -> List[OriginScores]:
    """At every origin, forecast the test periods with `forecaster` (which must fit on that origin's window only)
    and with each baseline fitted on the same window, and scale the errors by the window's MASE scale."""
    yy = np.asarray(y, dtype=np.float64)
    out: List[OriginScores] = []
    for o in design:
        t_train = np.arange(o.first_train, o.last_train + 1, dtype=np.int64)
        t_test = np.asarray(o.test, dtype=np.int64)
        y_train = yy[t_train]
        try:
            scale = mase_scale(y_train, season)
            model = np.asarray(forecaster(o), dtype=np.float64)
            if len(model) != len(t_test):
                raise ValueError(f"the forecaster returned {len(model)} values for {len(t_test)} test periods")
            forecasts: Dict[str, FArr] = {"model": model}
            for name, kind in BASELINE_MEMBERS:
                forecasts[name] = SeriesBaseline(kind, season).fit(y_train, t_train).forecast(t_test)
        except ValueError as exc:
            raise ValueError(f"origin {o.k}: {exc}") from exc
        actual = yy[t_test]
        raw = {name: np.asarray(actual - fc, dtype=np.float64) for name, fc in forecasts.items()}
        out.append(OriginScores(o, scale, actual, forecasts, raw,
                                {name: np.asarray(np.abs(e) / scale, dtype=np.float64) for name, e in raw.items()}))
    return out


# ------------------------------------------------------------------ autocorrelation ---------------------------------

def acf(e: FArr, nlags: int) -> FArr:
    """Sample autocorrelation at lags 1..nlags."""
    if nlags < 1:
        raise ValueError(f"acf needs at least 1 lag, got {nlags}")
    v = np.asarray(e, dtype=np.float64)
    if len(v) <= nlags:
        raise ValueError(f"acf has {len(v)} residuals for {nlags} lags")
    x = v - float(np.mean(v))
    den = float(np.sum(x * x))
    if not den > 0:
        raise ValueError("acf is undefined for constant residuals")
    return np.array([float(np.sum(x[k:] * x[: len(x) - k])) / den for k in range(1, nlags + 1)], dtype=np.float64)


def ljung_box(e: FArr, lags: int) -> Tuple[float, float]:
    """Ljung-Box Q over lags 1..lags and its chi-square p-value."""
    n = len(e)
    if n <= lags:
        raise ValueError(f"ljung_box has {n} residuals for {lags} lags")
    r = acf(e, lags)
    q = float(n * (n + 2) * np.sum(r ** 2 / (n - np.arange(1, lags + 1))))
    return q, float(stats.chi2.sf(q, lags))


def panel_acf(resid: FArr, entity: Sequence[str], order: IntArr, nlags: int) -> Tuple[List[float], List[int]]:
    """Pooled within-entity residual autocorrelation at lags 1..nlags (residuals demeaned globally, pairs never cross
    entities), with the number of pairs at each lag."""
    if not len(resid) == len(entity) == len(order):
        raise ValueError(f"resid ({len(resid)}), entity ({len(entity)}) and order ({len(order)}) must have the same "
                         "length")
    d = pd.DataFrame({"e": np.asarray(resid, dtype=np.float64), "g": pd.Series(list(entity)).astype(str).to_numpy(),
                      "o": np.asarray(order)})
    d = d.sort_values(["g", "o"], kind="mergesort")
    d["e"] = d["e"] - d["e"].mean()
    den = float((d["e"] ** 2).mean())
    if not den > 0:
        raise ValueError("panel_acf is undefined for constant residuals")
    rhos: List[float] = []
    ns: List[int] = []
    for k in range(1, nlags + 1):
        lag = d.groupby("g", sort=False)["e"].shift(k)
        m = lag.notna()
        if not bool(m.any()):
            raise ValueError(f"panel_acf lag {k}: no entity has more than {k} periods")
        rhos.append(float((d.loc[m, "e"] * lag[m]).mean() / den))
        ns.append(int(m.sum()))
    return rhos, ns


def box_pierce(rhos: Sequence[float], pairs: Sequence[int]) -> Tuple[float, float]:
    """Pooled Box-Pierce Q over lags 1..len(rhos): the sum of each lag's pair count times its squared
    autocorrelation (the pairs behind each rho of panel_acf, so lags with fewer within-entity pairs weigh less), and
    its chi-square p-value on len(rhos) degrees of freedom (`truthsuite.refpipe.run._residual_panel`)."""
    if len(rhos) != len(pairs):
        raise ValueError(f"box_pierce got {len(rhos)} autocorrelations for {len(pairs)} pair count(s)")
    if not rhos:
        raise ValueError("box_pierce needs at least one lag")
    q = float(sum(n * r * r for n, r in zip(pairs, rhos)))
    return q, float(stats.chi2.sf(q, len(rhos)))


def hac_se(d: FArr, lags: int) -> float:
    """Newey-West (Bartlett) standard error of the mean of d with `lags` lags."""
    x = np.asarray(d, dtype=np.float64)
    n = len(x)
    if n == 0:
        raise ValueError("hac_se of an empty series")
    z = x - x.mean()
    var = float(np.sum(z * z)) / n
    for k in range(1, min(lags, n - 1) + 1):
        var += 2 * (1 - k / (lags + 1)) * float(np.sum(z[k:] * z[: n - k])) / n
    return float(math.sqrt(max(var, 0.0) / n))


# ------------------------------------------------------------------ Diebold-Mariano ---------------------------------

@dataclass(frozen=True)
class DMResult:
    """A Diebold-Mariano test of equal accuracy: the corrected statistic, its two-sided p-value, the mean loss
    differential and the number of differentials."""

    statistic: float   # < 0: loss_a is the more accurate; NaN when the differential's HAC variance is not positive
    p_value: float
    mean_diff: float
    n: int


def diebold_mariano(loss_a: FArr, loss_b: FArr, h: int) -> DMResult:
    """DM test of equal accuracy on d = loss_a - loss_b: HAC variance with h-1 lags, the Harvey-Leybourne-Newbold
    small-sample correction, a t(n-1) reference. The statistic and p-value are NaN, as in the reference pipeline,
    when the HAC variance of the differential is not positive: identical losses, or a differential so negatively
    autocorrelated that gamma_0 + 2 * sum(gamma_k) <= 0."""
    a = np.asarray(loss_a, dtype=np.float64)
    b = np.asarray(loss_b, dtype=np.float64)
    if len(a) != len(b):
        raise ValueError(f"loss_a ({len(a)}) and loss_b ({len(b)}) must have the same length")
    if h < 1:
        raise ValueError(f"diebold_mariano horizon must be at least 1, got {h}")
    d = a - b
    n = len(d)
    if n <= h:
        raise ValueError(f"diebold_mariano has {n} loss differentials for horizon {h}")
    dbar = float(d.mean())
    x = d - dbar
    gamma = [float(np.sum(x[k:] * x[: n - k]) / n) for k in range(h)]
    var = (gamma[0] + 2 * sum(gamma[1:])) / n
    if var <= 0:
        return DMResult(float("nan"), float("nan"), dbar, n)
    dm = dbar / math.sqrt(var)
    corr = math.sqrt((n + 1 - 2 * h + h * (h - 1) / n) / n)
    stat = dm * corr
    return DMResult(float(stat), float(2 * stats.t.sf(abs(stat), n - 1)), dbar, n)


# ------------------------------------------------------------------ series models -----------------------------------

def _season_design(t: IntArr, season: int, phase: int) -> FArr:
    """Intercept, linear trend and season-1 seasonal dummies for periods t."""
    position = (t + phase) % season
    cols = [np.ones(len(t)), t.astype(np.float64)]
    for s in range(1, season):
        cols.append((position == s).astype(np.float64))
    return np.asarray(np.column_stack(cols), dtype=np.float64)


@dataclass
class SeriesModel:
    """One series forecaster fitted on a window of periods t. AR terms use the series' own previous value, which
    beyond the window's last period is the model's own earlier forecast; a gap between the window and the first
    forecast period is recursed through. Forecasts and interval bounds are clipped at 0 when the window is
    non-negative."""

    algo: SeriesAlgo
    season: int = 12
    phase: int = 0          # season position of period index 0 (calendar month - 1 for monthly data)
    nonneg: bool = False
    beta: FArr = field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    resid: FArr = field(default_factory=lambda: np.zeros(0, dtype=np.float64))
    sigma2: float = 0.0
    phi: Optional[float] = None
    last_y: float = 0.0
    last_t: int = -1

    def fit(self, y: FArr, t: IntArr) -> "SeriesModel":
        """Least-squares fit on the window's values `y` at periods `t` (in period order); keeps the residuals, their
        variance, the AR coefficient (None for trend + season OLS) and the window's last value and period.

        Raises:
            ValueError: When `y` and `t` differ in length, or the window has no more periods than coefficients.
        """
        yv = np.asarray(y, dtype=np.float64)
        tv = np.asarray(t, dtype=np.int64)
        if len(yv) != len(tv):
            raise ValueError(f"y ({len(yv)}) and t ({len(tv)}) must have the same length")
        if self.algo == "ar1_const":
            X = np.column_stack([np.ones(max(0, len(yv) - 1)), yv[:-1]])
            target = yv[1:]
        elif self.algo == "trend_season_ols":
            X = _season_design(tv, self.season, self.phase)
            target = yv
        else:
            X = np.column_stack([_season_design(tv, self.season, self.phase)[1:], yv[:-1]])
            target = yv[1:]
        if len(target) <= X.shape[1]:
            raise ValueError(f"{self.algo} needs more than {X.shape[1] + len(yv) - len(target)} periods, "
                             f"got {len(yv)}")
        beta, *_ = np.linalg.lstsq(X, target, rcond=None)
        self.beta = np.asarray(beta, dtype=np.float64)
        self.resid = np.asarray(target - X @ self.beta, dtype=np.float64)
        self.sigma2 = float(np.sum(self.resid ** 2) / (len(target) - X.shape[1]))
        self.phi = None if self.algo == "trend_season_ols" else float(self.beta[-1])
        self.nonneg = bool(np.min(yv) >= 0)
        self.last_y = float(yv[-1])
        self.last_t = int(tv[-1])
        return self

    def forecast(self, t: IntArr) -> FArr:
        """Forecasts for future periods t."""
        out = self._raw_forecast(t)
        return np.maximum(out, 0.0) if self.nonneg else out

    def interval(self, t: IntArr, level: float) -> Tuple[FArr, FArr]:
        """Gaussian interval at each period's step h past the window: variance sigma^2 (OLS) or
        sigma^2 * sum_{j<h} phi^(2j) (AR terms), sigma^2 from the window's own residuals."""
        mean = self._raw_forecast(t)
        steps = self._steps(t)
        z = float(stats.norm.ppf((1 + level) / 2))
        if self.phi is None:
            var = np.full(len(steps), self.sigma2)
        else:
            var = (self.sigma2 * np.cumsum(self.phi ** (2 * np.arange(int(steps.max(initial=0))))))[steps - 1]
        half = z * np.sqrt(var)
        lo, hi = mean - half, mean + half
        if self.nonneg:
            lo, hi = np.maximum(lo, 0.0), np.maximum(hi, 0.0)
        return np.asarray(lo, dtype=np.float64), np.asarray(hi, dtype=np.float64)

    def _steps(self, t: IntArr) -> IntArr:
        """Each requested period's step past the window's last period (1 = the next period)."""
        if len(self.beta) == 0:
            raise ValueError(f"the {self.algo} model is not fitted")
        return _steps_after(t, self.last_t, self.algo)

    def _raw_forecast(self, t: IntArr) -> FArr:
        """The unclipped forecast (the interval is centred on it, then clipped)."""
        steps = self._steps(t)
        if self.algo == "trend_season_ols":
            return np.asarray(_season_design(np.asarray(t, dtype=np.int64), self.season, self.phase) @ self.beta,
                              dtype=np.float64)
        horizon = int(steps.max(initial=0))
        path_t = np.arange(self.last_t + 1, self.last_t + 1 + horizon, dtype=np.int64)
        X = (_season_design(path_t, self.season, self.phase) if self.algo == "trend_season_ar1"
             else np.ones((horizon, 1)))
        path = np.empty(horizon, dtype=np.float64)
        prev = self.last_y
        for i in range(horizon):
            prev = float(np.concatenate([X[i], [prev]]) @ self.beta)
            path[i] = prev
        return np.asarray(path[steps - 1], dtype=np.float64)
