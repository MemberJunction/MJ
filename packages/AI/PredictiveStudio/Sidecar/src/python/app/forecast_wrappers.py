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
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

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


_FORECAST_REGISTRY = {
    "seasonal_naive": _SeasonalNaive,
    "sma": _SMA,
    "ets": _ETS,
    "arima": _ARIMA,
}

# floors need no statsmodels; ETS/ARIMA do
_NEEDS_STATSMODELS = {"ets", "arima"}


def is_forecast(algorithm: str) -> bool:
    return algorithm in _FORECAST_REGISTRY


def runnable(algorithm: str) -> bool:
    if algorithm not in _FORECAST_REGISTRY:
        return False
    return algorithm not in _NEEDS_STATSMODELS or _HAVE_STATSMODELS_TS


def build_forecast(algorithm: str, hp: Dict[str, Any]):
    return _FORECAST_REGISTRY[algorithm](**hp)


def mase(y_train, y_true, y_pred, m: int = 1) -> float:
    """Mean absolute scaled error vs the in-sample seasonal-naive MAE (the honest floor).
    MASE < 1 means the forecast beats repeating the last season."""
    yt = np.asarray(y_train, dtype=float)
    scale = np.mean(np.abs(yt[m:] - yt[:-m])) if len(yt) > m else np.mean(np.abs(np.diff(yt)))
    mae = np.mean(np.abs(np.asarray(y_true, dtype=float) - np.asarray(y_pred, dtype=float)))
    return float(mae / max(scale, 1e-9))
