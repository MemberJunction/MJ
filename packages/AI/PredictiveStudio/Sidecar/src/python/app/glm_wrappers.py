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
    from statsmodels.discrete.discrete_model import MNLogit
    from statsmodels.miscmodels.ordinal_model import OrderedModel
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


# --- T2 continued: GAM (regression) + ordinal / multinomial classifiers ---


class _GAMWrapper:
    """Generalized Additive Model via spline-basis expansion + a Gaussian GLM
    (regression). Each numeric feature is expanded into a B-spline basis so the
    fit is additive-and-smooth in each feature; the rest is linear. Robust to
    constant columns (they collapse to a single basis column) and many features
    (only the first ``max_smooth`` non-constant columns are splined; the tail is
    passed linearly) so it never blows up on a wide matrix."""

    def __init__(self, df: int = 4, degree: int = 3, max_smooth: int = 8, **hp: Any):
        self.df = max(int(df), degree + 1)
        self.degree = int(degree)
        self.max_smooth = int(max_smooth)
        self._result = None
        self._smoothers = None  # list[(col_idx, knots)]
        self.coef_ = None

    def _basis(self, col: np.ndarray, knots) -> np.ndarray:
        # natural cubic-ish basis: powers up to `degree` + truncated-power terms at knots
        cols = [col ** p for p in range(1, self.degree + 1)]
        for k in knots:
            cols.append(np.clip(col - k, 0, None) ** self.degree)
        return np.column_stack(cols)

    def _design(self, X: np.ndarray, fit: bool) -> np.ndarray:
        n, p = X.shape
        if fit:
            self._smoothers = []
        parts = [np.ones((n, 1))]  # intercept
        for j in range(p):
            col = X[:, j]
            spread = np.ptp(col)
            smoothable = j < self.max_smooth and spread > 0 and len(np.unique(col)) > self.degree + 1
            if smoothable:
                if fit:
                    qs = np.linspace(0, 100, self.df - self.degree + 2)[1:-1]
                    knots = np.percentile(col, qs)
                    self._smoothers.append((j, knots))
                else:
                    knots = dict(self._smoothers).get(j)
                    if knots is None:
                        parts.append(col.reshape(-1, 1)); continue
                parts.append(self._basis(col, knots))
            else:
                parts.append(col.reshape(-1, 1))
        return np.column_stack(parts)

    def fit(self, X, y):
        Xa = np.asarray(X, dtype=float)
        design = self._design(Xa, fit=True)
        self._result = sm.GLM(np.asarray(y, dtype=float), design,
                              family=sm.families.Gaussian()).fit()
        self.coef_ = np.asarray(self._result.params[1:])
        return self

    def predict(self, X):
        design = self._design(np.asarray(X, dtype=float), fit=False)
        return np.asarray(self._result.predict(design))


def make_gam(hp: Dict[str, Any]):
    return _GAMWrapper(**hp)


class _OrderedModelWrapper:
    """Proportional-odds ordinal regression (statsmodels OrderedModel, logit link).
    Targets are contiguous ordinal ints [0..k-1] (the sidecar's LabelEncoder order
    IS the ordinal order for an ordinal target). predict_proba returns per-level
    probabilities; predict returns the argmax level."""

    def __init__(self, distr: str = "logit", **hp: Any):
        self.distr = distr
        self._result = None
        self._k = 0

    def fit(self, X, y):
        Xa = np.asarray(X, dtype=float)
        ya = np.asarray(y, dtype=int)
        self._k = int(ya.max()) + 1
        # OrderedModel estimates its own thresholds — do NOT add a constant.
        self._result = OrderedModel(ya, Xa, distr=self.distr).fit(method="bfgs", disp=0)
        return self

    def predict_proba(self, X):
        return np.asarray(self._result.predict(np.asarray(X, dtype=float)))

    def predict(self, X):
        return np.argmax(self.predict_proba(X), axis=1)


def make_ordinal(hp: Dict[str, Any]):
    return _OrderedModelWrapper(**hp)


class _MultinomialLogitWrapper:
    """Multinomial (softmax) logistic regression via statsmodels MNLogit.
    predict_proba returns the (n, k) class-probability matrix in sorted-class order
    (aligned to the sidecar's 0..k-1 label encoding); predict returns the argmax."""

    def __init__(self, **hp: Any):
        self._hp = hp
        self._result = None

    def fit(self, X, y):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        self._result = MNLogit(np.asarray(y, dtype=int), Xa).fit(disp=0, maxiter=200)
        return self

    def predict_proba(self, X):
        Xa = sm.add_constant(np.asarray(X, dtype=float), has_constant="add")
        return np.asarray(self._result.predict(Xa))

    def predict(self, X):
        return np.argmax(self.predict_proba(X), axis=1)


def make_multinomial_logit(hp: Dict[str, Any]):
    return _MultinomialLogitWrapper(**hp)
