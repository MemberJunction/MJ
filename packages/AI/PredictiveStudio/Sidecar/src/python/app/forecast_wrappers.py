"""Forecasting drivers (Doc 3 T5).

Forecasting is a CONTRACT DELTA: the input is a single time-indexed SERIES (not a
feature matrix), the output is a horizon FORECAST, and validation MUST be a
trailing time window (never a random split). These wrappers each expose:
  - fit(y)            train on the in-sample series (a 1-D array, time-ordered)
  - forecast(h)       produce the next h values

The floors (seasonal_naive, sma) are reusable-only — they don't learn parameters.
ETS/ARIMA use statsmodels (the optional GLM extra already ships it); Prophet is a
separate heavy extra (not included here).
"""
from __future__ import annotations

from typing import Any, Dict

import numpy as np

try:
    import pandas as pd
    from prophet import Prophet

    _HAVE_PROPHET = True
except Exception:  # pragma: no cover
    _HAVE_PROPHET = False

try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.forecasting.theta import ThetaModel
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    from statsmodels.tsa.api import VAR
    from statsmodels.tsa.regime_switching.markov_regression import MarkovRegression
    from statsmodels.tsa.statespace.structural import UnobservedComponents

    _HAVE_STATSMODELS_TS = True
except Exception:  # pragma: no cover
    _HAVE_STATSMODELS_TS = False


class _SeasonalNaive:
    """Repeat the last full season — the forecasting FLOOR (learns nothing)."""

    def __init__(self, seasonal_periods: int = 1, **hp: Any):
        self.m = max(int(seasonal_periods), 1)
        self._y = None

    def fit(self, y):
        self._y = np.asarray(y, dtype=float)
        return self

    def forecast(self, h: int):
        tail = self._y[-self.m:]
        return np.array([tail[i % len(tail)] for i in range(h)])


class _SMA:
    """Simple moving average of the last `window` points, held flat over the horizon."""

    def __init__(self, window: int = 4, **hp: Any):
        self.window = max(int(window), 1)
        self._level = 0.0

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        self._level = float(np.mean(ya[-self.window:]))
        return self

    def forecast(self, h: int):
        return np.full(h, self._level)


class _ETS:
    """Exponential smoothing (trend + optional seasonality)."""

    def __init__(self, seasonal_periods: int | None = None, trend: str = "add", **hp: Any):
        self.seasonal_periods = seasonal_periods
        self.trend = trend
        self._result = None

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        seasonal = "add" if self.seasonal_periods and len(ya) >= 2 * self.seasonal_periods else None
        self._result = ExponentialSmoothing(
            ya, trend=self.trend, seasonal=seasonal, seasonal_periods=self.seasonal_periods
        ).fit()
        return self

    def forecast(self, h: int):
        return np.asarray(self._result.forecast(h))


class _ARIMA:
    """ARIMA(p,d,q) forecaster."""

    def __init__(self, p: int = 1, d: int = 1, q: int = 1, **hp: Any):
        self.order = (int(p), int(d), int(q))
        self._result = None

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        self._result = ARIMA(ya, order=self.order).fit()
        return self

    def forecast(self, h: int):
        return np.asarray(self._result.forecast(h))


class _Theta:
    """The Theta method — a competition-strong, simple decomposition forecaster."""

    def __init__(self, seasonal_periods: int | None = None, **hp: Any):
        self.seasonal_periods = seasonal_periods
        self._result = None

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        period = self.seasonal_periods if (self.seasonal_periods and len(ya) >= 2 * self.seasonal_periods) else None
        self._result = ThetaModel(ya, period=period).fit()
        return self

    def forecast(self, h: int):
        return np.asarray(self._result.forecast(h))


class _Croston:
    """Croston's method for intermittent (sparse, bursty) demand — separately
    smooths the nonzero demand size and the inter-arrival interval, held flat."""

    def __init__(self, alpha: float = 0.1, **hp: Any):
        self.alpha = float(alpha)
        self._rate = 0.0

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        nz = np.flatnonzero(ya > 0)
        if len(nz) == 0:
            self._rate = 0.0
            return self
        sizes = ya[nz]
        intervals = np.diff(np.concatenate([[-1], nz]))  # gaps between nonzero points
        z = sizes[0]
        p = intervals[0]
        a = self.alpha
        for i in range(1, len(sizes)):
            z = a * sizes[i] + (1 - a) * z
            p = a * intervals[i] + (1 - a) * p
        self._rate = float(z / max(p, 1e-9))
        return self

    def forecast(self, h: int):
        return np.full(h, self._rate)


class _StructuralTS:
    """Structural / unobserved-components time series: a local linear trend (+
    optional seasonal) state-space model. Decomposes the series into trend +
    seasonal + irregular and forecasts the trend forward."""

    def __init__(self, seasonal_periods: int | None = None, **hp: Any):
        self.seasonal_periods = seasonal_periods
        self._result = None

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        seasonal = self.seasonal_periods if (self.seasonal_periods and len(ya) >= 2 * self.seasonal_periods) else None
        self._result = UnobservedComponents(
            ya, level="local linear trend", seasonal=seasonal
        ).fit(disp=0)
        return self

    def forecast(self, h: int):
        return np.asarray(self._result.forecast(h))


class _KalmanDLM:
    """Dynamic linear model / Kalman local-level: a random-walk-plus-noise state
    space. The Kalman filter tracks a slowly-varying level; the forecast is the
    last filtered level held flat (with widening uncertainty, not modeled here)."""

    def __init__(self, trend: bool = False, **hp: Any):
        self.level = "local linear trend" if trend else "local level"
        self._result = None

    def fit(self, y):
        self._result = UnobservedComponents(np.asarray(y, dtype=float), level=self.level).fit(disp=0)
        return self

    def forecast(self, h: int):
        return np.asarray(self._result.forecast(h))


class _MarkovSwitching:
    """Markov-switching (regime) model: a small number of hidden regimes each with
    its own mean/variance, with Markov transitions between them. The forecast is the
    regime-probability-weighted mean under the last filtered regime distribution,
    held flat over the horizon — an honest level forecast under regime uncertainty."""

    def __init__(self, k_regimes: int = 2, **hp: Any):
        self.k_regimes = int(k_regimes)
        self._level = 0.0

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        res = MarkovRegression(ya, k_regimes=self.k_regimes, trend="c",
                               switching_variance=True).fit()
        # regime means (constants) weighted by the last filtered regime probabilities
        means = np.asarray(res.params[: self.k_regimes])
        last_probs = np.asarray(res.filtered_marginal_probabilities[-1])
        self._level = float(np.dot(means, last_probs))
        return self

    def forecast(self, h: int):
        return np.full(h, self._level)


class _Prophet:
    """Prophet: additive trend + seasonality + holidays forecaster. The sidecar
    contract passes a bare value series + horizon, so we synthesize a daily date
    index (the real calendar handling lives upstream); Prophet fits trend/seasonality
    and forecasts the horizon. Heaviest optional extra (pulls cmdstanpy)."""

    def __init__(self, seasonal_periods: int | None = None, **hp: Any):
        self.seasonal_periods = seasonal_periods
        self._model = None
        self._n = 0

    def fit(self, y):
        ya = np.asarray(y, dtype=float)
        self._n = len(ya)
        ds = pd.date_range("2000-01-01", periods=self._n, freq="D")
        df = pd.DataFrame({"ds": ds, "y": ya})
        weekly = bool(self.seasonal_periods and self.seasonal_periods == 7)
        yearly = bool(self.seasonal_periods and self.seasonal_periods >= 12 and self._n >= 2 * self.seasonal_periods)
        self._model = Prophet(weekly_seasonality=weekly, yearly_seasonality=yearly,
                              daily_seasonality=False)
        self._model.fit(df)
        return self

    def forecast(self, h: int):
        future = self._model.make_future_dataframe(periods=h, freq="D")
        fc = self._model.predict(future)
        return np.asarray(fc["yhat"].values[-h:])


class _VAR:
    """Vector autoregression: a MULTIVARIATE forecaster where each series is a
    linear function of the recent lags of ALL series (cross-series dynamics). Fits
    on the full matrix; the horizon forecast for the target column is returned. The
    forecast branch feeds it every numeric column and the target index."""

    def __init__(self, maxlags: int | None = None, target_index: int = 0, **hp: Any):
        self.maxlags = maxlags
        self.target_index = int(target_index)
        self._result = None
        self._endog = None
        self._k_ar = 1

    def fit(self, Y):
        Ya = np.asarray(Y, dtype=float)
        if Ya.ndim == 1:
            Ya = Ya.reshape(-1, 1)
        self._endog = Ya
        maxlags = self.maxlags or max(1, min(8, Ya.shape[0] // (Ya.shape[1] + 1) - 1))
        res = VAR(Ya).fit(maxlags=maxlags)
        self._result = res
        self._k_ar = max(int(res.k_ar), 1)
        return self

    def forecast(self, h: int):
        fc = self._result.forecast(self._endog[-self._k_ar:], h)  # (h, k)
        return np.asarray(fc)[:, self.target_index]


_FORECAST_REGISTRY = {
    "seasonal_naive": _SeasonalNaive,
    "sma": _SMA,
    "ets": _ETS,
    "arima": _ARIMA,
    "theta": _Theta,
    "croston": _Croston,
    "structural_ts": _StructuralTS,
    "kalman_dlm": _KalmanDLM,
    "markov_switching": _MarkovSwitching,
    "var": _VAR,
    "prophet": _Prophet,
}

# floors + croston need no statsmodels; the rest do
_NEEDS_STATSMODELS = {"ets", "arima", "theta", "structural_ts", "kalman_dlm",
                      "markov_switching", "var"}


def runnable(algorithm: str) -> bool:
    if algorithm not in _FORECAST_REGISTRY:
        return False
    if algorithm == "prophet":
        return _HAVE_PROPHET
    return algorithm not in _NEEDS_STATSMODELS or _HAVE_STATSMODELS_TS


def is_multivariate(algorithm: str) -> bool:
    """VAR consumes ALL numeric series (not just the value column)."""
    return algorithm == "var"


def is_forecast(algorithm: str) -> bool:
    return algorithm in _FORECAST_REGISTRY


def build_forecast(algorithm: str, hp: Dict[str, Any]):
    return _FORECAST_REGISTRY[algorithm](**hp)


def mase(y_train, y_true, y_pred, m: int = 1) -> float:
    """Mean absolute scaled error vs the in-sample seasonal-naive MAE (the honest floor).
    MASE < 1 means the forecast beats repeating the last season."""
    yt = np.asarray(y_train, dtype=float)
    scale = np.mean(np.abs(yt[m:] - yt[:-m])) if len(yt) > m else np.mean(np.abs(np.diff(yt)))
    mae = np.mean(np.abs(np.asarray(y_true, dtype=float) - np.asarray(y_pred, dtype=float)))
    return float(mae / max(scale, 1e-9))
