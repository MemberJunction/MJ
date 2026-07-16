"""Sklearn-compatible wrappers over statsmodels GLMs (Doc 3 T2).

statsmodels uses a formula/endog-exog API, not sklearn's ``fit(X, y)`` /
``predict(X)``. These thin wrappers adapt it so ``_fit_and_score`` in the sidecar
stays unchanged — the count/GLM families plug into the same train/predict path as
every sklearn driver. Coefficients + standard errors are stashed on the fitted
wrapper for the (later) parameters-as-output emission.

statsmodels is an OPTIONAL extra (``requirements-glm.txt``); import failures are
gated by ``_HAVE_STATSMODELS`` and surfaced via ``_require`` on /health, exactly
like xgboost/lightgbm.
"""
from __future__ import annotations

from typing import Any, Dict

import numpy as np

try:
    import statsmodels.api as sm
    from statsmodels.discrete.count_model import ZeroInflatedPoisson
    from statsmodels.regression.quantile_regression import QuantReg

    _HAVE_STATSMODELS = True
except Exception:  # pragma: no cover - exercised only when statsmodels missing
    _HAVE_STATSMODELS = False


class _StatsmodelsGLMWrapper:
    """A minimal sklearn-style estimator over a statsmodels GLM family.

    fit(X, y) adds an intercept, fits the GLM, and captures params/bse; predict(X)
    returns the mean response (counts / rates). Regression-family only.
    """

    def __init__(self, family, **fit_kwargs: Any):
        self._family = family
        self._fit_kwargs = fit_kwargs
        self._result = None
        self.coef_ = None
        self.coef_se_ = None

    def fit(self, X, y):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        self._result = sm.GLM(np.asarray(y, dtype=float), Xa, family=self._family).fit(**self._fit_kwargs)
        # [1:] drops the intercept term for the per-feature coefficient view
        self.coef_ = np.asarray(self._result.params[1:])
        self.coef_se_ = np.asarray(self._result.bse[1:])
        return self

    def predict(self, X):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        return np.asarray(self._result.predict(Xa))


class _QuantRegWrapper:
    """Quantile regression (pinball loss at quantile q; no distributional error assumption)."""

    def __init__(self, q: float = 0.5):
        self.q = float(q)
        self._result = None
        self.coef_ = None

    def fit(self, X, y):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        self._result = QuantReg(np.asarray(y, dtype=float), Xa).fit(q=self.q)
        self.coef_ = np.asarray(self._result.params[1:])
        return self

    def predict(self, X):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        return np.asarray(self._result.predict(Xa))


def make_poisson(hp: Dict[str, Any]):
    return _StatsmodelsGLMWrapper(sm.families.Poisson())


def make_neg_binomial(hp: Dict[str, Any]):
    alpha = float(hp.get("alpha", 1.0))
    return _StatsmodelsGLMWrapper(sm.families.NegativeBinomial(alpha=alpha))


def make_tweedie(hp: Dict[str, Any]):
    var_power = float(hp.get("var_power", 1.5))
    return _StatsmodelsGLMWrapper(sm.families.Tweedie(var_power=var_power))


def make_quantile(hp: Dict[str, Any]):
    return _QuantRegWrapper(q=float(hp.get("q", 0.5)))


class _ZeroInflatedPoissonWrapper:
    """Two-part zero-inflated Poisson: a structural-zero regime + a count regime.
    predict returns the expected count (marginal mean across both parts)."""

    def __init__(self, **hp: Any):
        self._hp = hp
        self._result = None

    def fit(self, X, y):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        self._result = ZeroInflatedPoisson(
            np.asarray(y, dtype=float), Xa, exog_infl=Xa, inflation="logit"
        ).fit(disp=0, maxiter=200)
        return self

    def predict(self, X):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        # which='mean' → the marginal expected count E[y] across both regimes
        return np.asarray(self._result.predict(Xa, exog_infl=Xa, which="mean"))


def make_zero_inflated(hp: Dict[str, Any]):
    return _ZeroInflatedPoissonWrapper(**hp)
