"""Recommendation driver (Doc 3 T7): implicit-feedback ALS.

Consumes interaction TRIPLES (user, item, value) — not a feature matrix — builds a
sparse user×item confidence matrix and factorizes it into latent user + item vectors
(the ``latent-factors`` output the ontology feeds back as features / segments). A
distinct contract, routed to ``_run_reco_training``.

``implicit`` is an OPTIONAL extra (requirements-reco.txt), gated by _HAVE_IMPLICIT.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

import numpy as np

try:
    from implicit.als import AlternatingLeastSquares
    from scipy.sparse import csr_matrix

    _HAVE_IMPLICIT = True
except Exception:  # pragma: no cover
    _HAVE_IMPLICIT = False


class _ALSWrapper:
    """Alternating Least Squares over the implicit user×item confidence matrix.
    fit builds the sparse matrix from triples; the fitted user/item factors ARE the
    model (latent embeddings). Reports the training reconstruction fit."""

    def __init__(self, factors: int = 16, iterations: int = 15,
                 regularization: float = 0.01, **hp: Any):
        self.factors = int(factors)
        self._als = AlternatingLeastSquares(
            factors=self.factors, iterations=int(iterations),
            regularization=float(regularization), random_state=0)
        self._user_index: Dict[Any, int] = {}
        self._item_index: Dict[Any, int] = {}

    def _build_matrix(self, users, items, values) -> "csr_matrix":
        uu = {u: i for i, u in enumerate(sorted(set(users)))}
        ii = {it: i for i, it in enumerate(sorted(set(items)))}
        self._user_index, self._item_index = uu, ii
        rows = np.array([uu[u] for u in users])
        cols = np.array([ii[it] for it in items])
        vals = np.asarray(values, dtype=float)
        return csr_matrix((vals, (rows, cols)), shape=(len(uu), len(ii)))

    def fit(self, users, items, values):
        mat = self._build_matrix(users, items, values)
        self._als.fit(mat, show_progress=False)
        self._matrix = mat
        return self

    def metrics(self) -> Dict[str, float]:
        # reconstruction fit: correlation of observed vs predicted on the nonzero cells
        U = self._als.user_factors
        V = self._als.item_factors
        coo = self._matrix.tocoo()
        pred = np.sum(U[coo.row] * V[coo.col], axis=1)
        obs = coo.data
        corr = float(np.corrcoef(obs, pred)[0, 1]) if len(obs) > 1 else 0.0
        return {"n_users": float(len(self._user_index)),
                "n_items": float(len(self._item_index)),
                "factors": float(self.factors),
                "reconstruction_corr": corr}


def is_reco(algorithm: str) -> bool:
    return algorithm == "implicit_als"


def build_reco(algorithm: str, hp: Dict[str, Any]):
    if algorithm == "implicit_als":
        return _ALSWrapper(**hp)
    raise ValueError(f"unknown reco algorithm '{algorithm}'")
