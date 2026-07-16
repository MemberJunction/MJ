"""Survival drivers over lifelines (Doc 3 T4).

Survival is a CONTRACT DELTA, not just a driver: the target is a (duration, event)
pair, not a single label. These wrappers take a fitted feature matrix plus the
duration/event arrays and expose:
  - fit(X, durations, events)
  - risk(X)   → per-row relative risk (higher = sooner event) for ranking / C-index
  - curve(X)  → per-row survival curve {times, survival} for the `curve` port

lifelines is an OPTIONAL extra (requirements-survival.txt); import failures gate
via _HAVE_LIFELINES and surface on /health, like xgboost/statsmodels.
"""
from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

try:
    from lifelines import (
        CoxPHFitter,
        KaplanMeierFitter,
        LogLogisticAFTFitter,
        LogNormalAFTFitter,
        WeibullAFTFitter,
    )
    from lifelines.utils import concordance_index

    _HAVE_LIFELINES = True
except Exception:  # pragma: no cover
    _HAVE_LIFELINES = False


try:
    from sksurv.ensemble import RandomSurvivalForest
    from sksurv.util import Surv

    _HAVE_SKSURV = True
except Exception:  # pragma: no cover
    _HAVE_SKSURV = False


_DURATION = "__duration__"
_EVENT = "__event__"


def _frame(X, durations, events, feature_names: List[str]) -> pd.DataFrame:
    df = pd.DataFrame(np.asarray(X, dtype=float), columns=feature_names)
    df[_DURATION] = np.asarray(durations, dtype=float)
    df[_EVENT] = np.asarray(events, dtype=int)
    return df


class _CoxPHWrapper:
    """Cox proportional hazards — semiparametric; risk = partial hazard."""

    def __init__(self, penalizer: float = 0.1, **hp: Any):
        self._fitter = CoxPHFitter(penalizer=penalizer)
        self._feature_names: List[str] = []

    def fit(self, X, durations, events, feature_names: List[str]):
        self._feature_names = feature_names
        df = _frame(X, durations, events, feature_names)
        self._fitter.fit(df, duration_col=_DURATION, event_col=_EVENT)
        return self

    def risk(self, X):
        df = pd.DataFrame(np.asarray(X, dtype=float), columns=self._feature_names)
        return np.asarray(self._fitter.predict_partial_hazard(df)).ravel()

    def curve(self, X):
        df = pd.DataFrame(np.asarray(X, dtype=float), columns=self._feature_names)
        sf = self._fitter.predict_survival_function(df)
        times = [float(t) for t in sf.index]
        return [{"times": times, "survival": [float(v) for v in sf[col].values]} for col in sf.columns]


class _WeibullAFTWrapper:
    """Weibull accelerated-failure-time — parametric; risk = -expected lifetime."""

    def __init__(self, penalizer: float = 0.1, **hp: Any):
        self._fitter = WeibullAFTFitter(penalizer=penalizer)
        self._feature_names: List[str] = []

    def fit(self, X, durations, events, feature_names: List[str]):
        self._feature_names = feature_names
        df = _frame(X, durations, events, feature_names)
        self._fitter.fit(df, duration_col=_DURATION, event_col=_EVENT)
        return self

    def risk(self, X):
        df = pd.DataFrame(np.asarray(X, dtype=float), columns=self._feature_names)
        # shorter expected lifetime ⇒ higher risk
        return -np.asarray(self._fitter.predict_expectation(df)).ravel()

    def curve(self, X):
        df = pd.DataFrame(np.asarray(X, dtype=float), columns=self._feature_names)
        sf = self._fitter.predict_survival_function(df)
        times = [float(t) for t in sf.index]
        return [{"times": times, "survival": [float(v) for v in sf[col].values]} for col in sf.columns]


class _KaplanMeierWrapper:
    """Kaplan-Meier — covariate-FREE population survival (the survival floor)."""

    def __init__(self, **hp: Any):
        self._fitter = KaplanMeierFitter()

    def fit(self, X, durations, events, feature_names: List[str]):
        self._fitter.fit(np.asarray(durations, dtype=float), np.asarray(events, dtype=int))
        return self

    def risk(self, X):
        # covariate-free → every row shares the population risk (constant); no ranking power
        return np.zeros(len(np.asarray(X, dtype=float)))

    def curve(self, X):
        sf = self._fitter.survival_function_
        times = [float(t) for t in sf.index]
        surv = [float(v) for v in sf.iloc[:, 0].values]
        return [{"times": times, "survival": surv} for _ in range(len(np.asarray(X, dtype=float)))]


class _AFTWrapper:
    """Accelerated-failure-time with a Log-Logistic (default) or Log-Normal
    baseline — parametric, heavier-tailed than Weibull, good when the hazard is
    non-monotone (rises then falls). risk = -expected lifetime; curve = survival
    function per row. Pick the baseline via hp['dist'] ∈ {log_logistic, log_normal}."""

    def __init__(self, dist: str = "log_logistic", penalizer: float = 0.1, **hp: Any):
        fitter_cls = LogNormalAFTFitter if dist == "log_normal" else LogLogisticAFTFitter
        self._fitter = fitter_cls(penalizer=penalizer)
        self._feature_names: List[str] = []

    def fit(self, X, durations, events, feature_names: List[str]):
        self._feature_names = feature_names
        df = _frame(X, durations, events, feature_names)
        self._fitter.fit(df, duration_col=_DURATION, event_col=_EVENT)
        return self

    def risk(self, X):
        df = pd.DataFrame(np.asarray(X, dtype=float), columns=self._feature_names)
        return -np.asarray(self._fitter.predict_expectation(df)).ravel()

    def curve(self, X):
        df = pd.DataFrame(np.asarray(X, dtype=float), columns=self._feature_names)
        sf = self._fitter.predict_survival_function(df)
        times = [float(t) for t in sf.index]
        return [{"times": times, "survival": [float(v) for v in sf[col].values]} for col in sf.columns]


class _RSFWrapper:
    """Random Survival Forest (scikit-survival): a tree ensemble that splits on the
    log-rank statistic — non-parametric, captures non-linear + interaction effects
    on the hazard that Cox's proportional-hazards assumption cannot. risk = the
    ensemble risk score; curve = the predicted survival function per row."""

    def __init__(self, n_estimators: int = 100, min_samples_leaf: int = 15, **hp: Any):
        self._rsf = RandomSurvivalForest(
            n_estimators=int(n_estimators), min_samples_leaf=int(min_samples_leaf),
            n_jobs=-1, random_state=0, **hp)
        self._feature_names: List[str] = []

    def fit(self, X, durations, events, feature_names: List[str]):
        self._feature_names = feature_names
        y = Surv.from_arrays(event=np.asarray(events, dtype=bool),
                             time=np.asarray(durations, dtype=float))
        self._rsf.fit(np.asarray(X, dtype=float), y)
        return self

    def risk(self, X):
        return np.asarray(self._rsf.predict(np.asarray(X, dtype=float))).ravel()

    def curve(self, X):
        fns = self._rsf.predict_survival_function(np.asarray(X, dtype=float))
        times = [float(t) for t in self._rsf.unique_times_]
        return [{"times": times, "survival": [float(fn(t)) for t in self._rsf.unique_times_]}
                for fn in fns]


_SURVIVAL_REGISTRY = {
    "cox_ph": _CoxPHWrapper,
    "weibull_aft": _WeibullAFTWrapper,
    "aft": _AFTWrapper,
    "rsf": _RSFWrapper,
    "km": _KaplanMeierWrapper,
}


def is_survival(algorithm: str) -> bool:
    return algorithm in _SURVIVAL_REGISTRY


def build_survival(algorithm: str, hp: Dict[str, Any]):
    return _SURVIVAL_REGISTRY[algorithm](**hp)


def c_index(durations, events, risk) -> float:
    """Harrell's concordance index — the survival-native ranking metric.
    Higher risk should mean shorter duration, so we negate risk for the event-time order."""
    return float(concordance_index(np.asarray(durations, dtype=float),
                                   -np.asarray(risk, dtype=float),
                                   np.asarray(events, dtype=int)))
