"""Sequence-state drivers (Doc 3 T6).

Sequence-state is a CONTRACT DELTA: rows are grouped by an entity (group_col) and
ordered within the group (order_col); the model infers latent structure over each
sequence. The flagship, validated use (RD-COMPOSE) is the HMM cadence-state
extractor — the state a member is IN becomes a feature via the
latent-state→features:tabular adapter.

  - hmm:          GaussianHMM over the grouped observation sequences; decode() → the
                  most-likely hidden state per row (the latent-state output).
  - markov_chain: observed-state transition-matrix estimation by counting (a single
                  discrete state column); no per-row prediction (the matrix IS the model).

hmmlearn is an OPTIONAL extra (requirements-sequence.txt).
"""
from __future__ import annotations

from typing import Any, Dict, List, Sequence, Tuple

import numpy as np

try:
    from hmmlearn.hmm import GaussianHMM

    _HAVE_HMMLEARN = True
except Exception:  # pragma: no cover
    _HAVE_HMMLEARN = False


class _HMMWrapper:
    """Gaussian HMM over grouped sequences. fit takes (X, lengths); decode returns
    the most-likely state per row (aligned to the input row order)."""

    def __init__(self, n_states: int = 3, n_iter: int = 50, **hp: Any):
        self.n_states = int(n_states)
        self.n_iter = int(n_iter)
        self._hmm = None

    def fit(self, X: np.ndarray, lengths: List[int]):
        self._hmm = GaussianHMM(n_components=self.n_states, covariance_type="diag",
                                n_iter=self.n_iter, random_state=0)
        self._hmm.fit(np.asarray(X, dtype=float), lengths)
        return self

    def log_likelihood(self, X: np.ndarray, lengths: List[int]) -> float:
        return float(self._hmm.score(np.asarray(X, dtype=float), lengths))

    def decode(self, X: np.ndarray, lengths: List[int]) -> np.ndarray:
        _, states = self._hmm.decode(np.asarray(X, dtype=float), lengths)
        return states


def group_sequences(rows: Sequence[Sequence[Any]], columns: List[str],
                    group_col: str, order_col: str, feature_cols: List[str],
                    ) -> Tuple[np.ndarray, List[int], List[int]]:
    """Build the (X, lengths, original_index_order) for hmmlearn from grouped rows.

    Rows are grouped by group_col and ordered by order_col within each group. Returns
    the stacked feature matrix, the per-group lengths, and the mapping from stacked
    position back to the ORIGINAL row index (so decoded states realign to input order).
    """
    gi = columns.index(group_col)
    oi = columns.index(order_col)
    fi = [columns.index(c) for c in feature_cols]
    indexed = list(enumerate(rows))
    # stable sort by (group, order)
    indexed.sort(key=lambda t: (t[1][gi], t[1][oi]))
    X: List[List[float]] = []
    lengths: List[int] = []
    order: List[int] = []
    cur_group = object()
    run = 0
    for orig_idx, r in indexed:
        if r[gi] != cur_group:
            if run:
                lengths.append(run)
            cur_group = r[gi]
            run = 0
        X.append([float(r[j]) for j in fi])
        order.append(orig_idx)
        run += 1
    if run:
        lengths.append(run)
    return np.asarray(X, dtype=float), lengths, order


class _MarkovChainWrapper:
    """Discrete first-order Markov chain over an OBSERVED single state column.
    fit(X, lengths) estimates the state transition matrix by counting adjacent
    (state_t → state_{t+1}) pairs within each grouped sequence (Laplace-smoothed).
    The matrix IS the model — decode returns the per-row observed state (there is
    no latent inference). log_likelihood scores the sequences under the matrix.
    Pure numpy; no dependency."""

    def __init__(self, n_states: int | None = None, **hp: Any):
        self.n_states = n_states
        self.transition_matrix_ = None

    def _states(self, X: np.ndarray) -> np.ndarray:
        # single observed state column, coerced to contiguous int labels
        col = np.asarray(X, dtype=float)[:, 0]
        uniq = np.unique(col)
        self._levels = uniq
        return np.searchsorted(uniq, col)

    def fit(self, X, lengths: List[int]):
        s = self._states(X)
        k = self.n_states or int(s.max()) + 1
        self.n_states = k
        counts = np.ones((k, k))  # Laplace smoothing
        pos = 0
        for L in lengths:
            seg = s[pos:pos + L]
            for a, b in zip(seg[:-1], seg[1:]):
                counts[a, b] += 1
            pos += L
        self.transition_matrix_ = counts / counts.sum(axis=1, keepdims=True)
        self._fitted_states = s
        return self

    def log_likelihood(self, X: np.ndarray, lengths: List[int]) -> float:
        s = self._states(X)
        ll = 0.0
        pos = 0
        for L in lengths:
            seg = s[pos:pos + L]
            for a, b in zip(seg[:-1], seg[1:]):
                ll += float(np.log(self.transition_matrix_[a, b]))
            pos += L
        return ll

    def decode(self, X: np.ndarray, lengths: List[int]) -> np.ndarray:
        return self._states(X)


def is_sequence(algorithm: str) -> bool:
    return algorithm in {"hmm", "markov_chain"}


def runnable(algorithm: str) -> bool:
    if algorithm == "hmm":
        return _HAVE_HMMLEARN
    if algorithm == "markov_chain":
        return True
    return False


def build_sequence(algorithm: str, hp: Dict[str, Any]):
    if algorithm == "hmm":
        return _HMMWrapper(**hp)
    if algorithm == "markov_chain":
        return _MarkovChainWrapper(**hp)
    raise ValueError(f"unknown sequence algorithm '{algorithm}'")
