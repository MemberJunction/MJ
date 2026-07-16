"""Rubric / Weighted-Scorecard driver (Doc 3 T1 + ADDENDUM Sonar §2).

The glass-box scorer: a transparent, per-feature weighted sum — the exerciser of
the ontology's *reusable ≠ trainable* axis. Two modes over ONE math:
  - trainable  : fit non-negative feature weights (NNLS on standardized features),
                 then (classification) a 1-D logistic map score→probability.
  - reusable   : operator-supplied weights (hp['weights']) — no fit of the weights,
                 only the score→probability map is fit for a probability output.

Either way the per-feature ``coef_`` is the plain-language weight vector Sonar's
factor rubric exposes — measured by the SAME locked-holdout machinery as every
black-box model. Pure numpy + scipy (already a sidecar dep); no new dependency.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
from scipy.optimize import nnls
from sklearn.linear_model import LogisticRegression


class _RubricScorer:
    """A weighted scorecard. ``higher_is_better`` per-feature signs are folded into
    the learned/supplied weights. Standardization travels with the model so the
    score is comparable across features regardless of raw scale."""

    def __init__(self, weights: Optional[List[float]] = None, **hp: Any):
        self._supplied = None if weights is None else np.asarray(weights, dtype=float)
        self._mean = None
        self._std = None
        self._logit = None  # score→probability map (classification)
        self.coef_ = None

    def _standardize(self, X: np.ndarray, fit: bool) -> np.ndarray:
        Xa = np.asarray(X, dtype=float)
        if fit:
            self._mean = Xa.mean(axis=0)
            self._std = np.where(Xa.std(axis=0) > 0, Xa.std(axis=0), 1.0)
        return (Xa - self._mean) / self._std

    def fit(self, X, y):
        Xs = self._standardize(X, fit=True)
        ya = np.asarray(y, dtype=float)
        if self._supplied is not None:
            self.coef_ = self._supplied[: Xs.shape[1]]
        else:
            # NNLS: non-negative weights so the scorecard is monotone + glass-box.
            # Center y so a positive weight means "raises the score toward the
            # positive class / larger response".
            w, _ = nnls(Xs, ya - ya.mean())
            self.coef_ = w
        score = Xs @ self.coef_
        # Fit the score→probability map for a probability output (both modes).
        if len(np.unique(ya)) <= 20 and set(np.unique(ya)).issubset(set(range(21))):
            self._logit = LogisticRegression(max_iter=1000)
            self._logit.fit(score.reshape(-1, 1), ya.astype(int))
        return self

    def _score(self, X):
        return self._standardize(X, fit=False) @ self.coef_

    def predict(self, X):
        if self._logit is not None:
            return self._logit.predict(self._score(X).reshape(-1, 1))
        return self._score(X)

    def predict_proba(self, X):
        if self._logit is None:
            raise AttributeError("rubric has no probability map (regression mode)")
        return self._logit.predict_proba(self._score(X).reshape(-1, 1))


def make_rubric(hp: Dict[str, Any]):
    return _RubricScorer(**hp)
