"""CLV / BTYD drivers (Doc 3 T7).

Buy-Till-You-Die models consume an RFM summary — per customer: frequency (# repeat
transactions), recency (age at last purchase), T (age observed), and (Gamma-Gamma)
monetary_value (avg spend per txn). They fit latent purchasing + churn distributions
and predict expected FUTURE purchases / value — a contract distinct from a feature
matrix, so main.py routes them to ``_run_clv_training``.

  - bg_nbd     : Beta-Geometric/NBD — the standard repeat-purchase + dropout model.
  - pareto_nbd : Pareto/NBD — the classic (continuous dropout) alternative.
  - gamma_gamma: expected monetary value per transaction (pairs with a frequency model).

lifetimes is an OPTIONAL extra (requirements-clv.txt), gated by _HAVE_LIFETIMES.
"""
from __future__ import annotations

from typing import Any, Dict

import numpy as np

try:
    from lifetimes import BetaGeoFitter, GammaGammaFitter, ParetoNBDFitter

    _HAVE_LIFETIMES = True
except Exception:  # pragma: no cover
    _HAVE_LIFETIMES = False


def _sanitize_rfm(frequency, recency, T):
    """Enforce the BTYD identity: a customer with no repeat purchase (frequency=0)
    has recency 0 by definition. lifetimes rejects frequency=0 with recency>0, so we
    normalize slightly-off real RFM inputs rather than crash."""
    freq = np.asarray(frequency, dtype=float)
    rec = np.where(freq <= 0, 0.0, np.asarray(recency, dtype=float))
    return freq, rec, np.asarray(T, dtype=float)


class _BGNBDWrapper:
    """Beta-Geometric / NBD: expected purchases in the next `horizon` per customer."""

    def __init__(self, penalizer_coef: float = 0.01, **hp: Any):
        self._fitter = BetaGeoFitter(penalizer_coef=penalizer_coef)

    def fit(self, frequency, recency, T, monetary=None):
        freq, rec, Ta = _sanitize_rfm(frequency, recency, T)
        self._fitter.fit(freq, rec, Ta)
        return self

    def predict(self, horizon, frequency, recency, T):
        return np.asarray(self._fitter.conditional_expected_number_of_purchases_up_to_time(
            horizon, np.asarray(frequency, dtype=float),
            np.asarray(recency, dtype=float), np.asarray(T, dtype=float)))

    def params(self) -> Dict[str, float]:
        return {k: float(v) for k, v in self._fitter.params_.items()}


class _ParetoNBDWrapper:
    """Pareto/NBD: continuous-dropout repeat-purchase model."""

    def __init__(self, penalizer_coef: float = 0.01, **hp: Any):
        self._fitter = ParetoNBDFitter(penalizer_coef=penalizer_coef)

    def fit(self, frequency, recency, T, monetary=None):
        freq, rec, Ta = _sanitize_rfm(frequency, recency, T)
        self._fitter.fit(freq, rec, Ta)
        return self

    def predict(self, horizon, frequency, recency, T):
        return np.asarray(self._fitter.conditional_expected_number_of_purchases_up_to_time(
            horizon, np.asarray(frequency, dtype=float),
            np.asarray(recency, dtype=float), np.asarray(T, dtype=float)))

    def params(self) -> Dict[str, float]:
        return {k: float(v) for k, v in self._fitter.params_.items()}


class _GammaGammaWrapper:
    """Gamma-Gamma: expected monetary value per transaction (fit on repeat buyers)."""

    def __init__(self, penalizer_coef: float = 0.01, **hp: Any):
        self._fitter = GammaGammaFitter(penalizer_coef=penalizer_coef)

    def fit(self, frequency, recency, T, monetary=None):
        # Gamma-Gamma is fit on customers with ≥1 repeat purchase (frequency > 0).
        freq = np.asarray(frequency, dtype=float)
        mon = np.asarray(monetary, dtype=float)
        mask = freq > 0
        self._fitter.fit(freq[mask], mon[mask])
        return self

    def predict(self, horizon, frequency, monetary):
        return np.asarray(self._fitter.conditional_expected_average_profit(
            np.asarray(frequency, dtype=float), np.asarray(monetary, dtype=float)))

    def params(self) -> Dict[str, float]:
        return {k: float(v) for k, v in self._fitter.params_.items()}


_CLV_REGISTRY = {
    "bg_nbd": _BGNBDWrapper,
    "pareto_nbd": _ParetoNBDWrapper,
    "gamma_gamma": _GammaGammaWrapper,
}


def is_clv(algorithm: str) -> bool:
    return algorithm in _CLV_REGISTRY


def build_clv(algorithm: str, hp: Dict[str, Any]):
    return _CLV_REGISTRY[algorithm](**hp)
