"""Hidden Markov Model — the `sequence` problem type.

Every other estimator in this sidecar answers "given this record's features, what is the answer for
THIS record". An HMM answers a different question: given a record's history **in order**, which
latent state is it in now, and how confident is that. Renewal risk that builds over four quarters of
declining engagement is a different shape of question from renewal risk read off one snapshot, and
flattening it into per-row features throws away the ordering that carried the signal.

Three honest positions, because an HMM is easy to make look like it worked:

* **Sequence boundaries are required, not inferred.** ``hmmlearn`` takes a ``lengths`` array saying
  where one entity's history ends and the next begins. Given none, it treats the entire matrix as a
  single sequence and happily trains — learning transitions ACROSS unrelated members, which is
  nonsense that still produces a fitted model and a plausible score. So a missing/degenerate grouping
  raises here rather than training something meaningless.
* **The states are unlabeled.** An HMM discovers latent states; state 0 is not "at risk" unless
  someone says so. ``predict`` returns the Viterbi state index and nothing pretends it is a business
  label. Naming them is a separate, human act.
* **The score is a posterior, not a likelihood.** ``predict_proba`` gives the posterior probability
  of the assigned state — bounded 0–1 and comparable across models and records. A log-likelihood is
  unbounded and not comparable to anything, so it is not what gets reported as a score.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import numpy as np
from sklearn.base import BaseEstimator

try:  # hmmlearn ships prebuilt wheels; guarded like xgboost/lightgbm all the same
    from hmmlearn.hmm import GaussianHMM

    _HAVE_HMMLEARN = True
except Exception:  # pragma: no cover - exercised only when hmmlearn is missing
    _HAVE_HMMLEARN = False


class HMMConfigError(ValueError):
    """Raised when an HMM cannot be trained as configured."""


#: Fewest observations a group needs to say anything about transitions. One observation has no
#: transition at all; two is the minimum that does.
MIN_GROUP_LENGTH = 2


class HMMEstimator(BaseEstimator):
    """A Gaussian HMM over per-entity observation sequences.

    Args:
        n_states: Number of latent states to discover.
        n_iter: EM iterations.
        covariance_type: ``hmmlearn`` covariance parameterization.
        random_state: Seed, so a run is reproducible.
    """

    def __init__(
        self,
        n_states: int = 2,
        n_iter: int = 100,
        covariance_type: str = "diag",
        random_state: Optional[int] = 42,
    ):
        self.n_states = n_states
        self.n_iter = n_iter
        self.covariance_type = covariance_type
        self.random_state = random_state

    # ------------------------------------------------------------------ fit
    def fit(self, X: Any, y: Any = None, **kwargs: Any) -> "HMMEstimator":  # noqa: N803
        """Fit the HMM over sequences delimited by ``mj_sequence_lengths_``.

        ``y`` is accepted and ignored: an HMM is unsupervised over the observation sequence. It is
        in the signature so the estimator drops into the same fit path as every other driver.
        """
        if not _HAVE_HMMLEARN:
            raise HMMConfigError(
                "Driver 'hmm' is unavailable — the 'hmmlearn' package failed to import."
            )
        X = np.asarray(X, dtype=float)
        lengths = self._resolve_lengths(X)

        if int(self.n_states) < 2:
            raise HMMConfigError("An HMM needs at least 2 states; 1 state cannot transition.")

        self.model_ = GaussianHMM(
            n_components=int(self.n_states),
            n_iter=int(self.n_iter),
            covariance_type=self.covariance_type,
            random_state=self.random_state,
        )
        self.model_.fit(X, lengths)
        self.n_features_in_ = X.shape[1]
        return self

    def _resolve_lengths(self, X: np.ndarray) -> List[int]:
        """Validate the sequence boundaries this fit was given.

        Refuses rather than defaulting to "it is all one sequence": that default trains transitions
        between unrelated entities and still produces a fitted model, so nothing downstream would
        reveal the mistake.
        """
        lengths = getattr(self, "mj_sequence_lengths_", None)
        if not lengths:
            raise HMMConfigError(
                "An HMM needs sequence boundaries — which rows belong to which entity, in order. "
                "Without them every row would be treated as one long sequence and the model would "
                "learn transitions between unrelated records."
            )
        lengths = [int(n) for n in lengths]
        if sum(lengths) != X.shape[0]:
            raise HMMConfigError(
                f"Sequence lengths sum to {sum(lengths)} but the matrix has {X.shape[0]} rows."
            )
        usable = [n for n in lengths if n >= MIN_GROUP_LENGTH]
        if not usable:
            raise HMMConfigError(
                f"Every sequence is shorter than {MIN_GROUP_LENGTH} observations, so there is not a "
                f"single transition to learn from."
            )
        return lengths

    def mj_set_sequence_lengths(self, lengths: Sequence[int]) -> None:
        """Supply the per-entity sequence lengths, in matrix row order.

        Separate from ``fit`` because sklearn's ``fit(X, y)`` has nowhere to carry them, and the same
        injection point is used by the validation-fold build and the final production build.
        """
        self.mj_sequence_lengths_ = [int(n) for n in lengths]

    # -------------------------------------------------------------- predict
    def predict(self, X: Any) -> np.ndarray:  # noqa: N803
        """The most likely latent state per observation (Viterbi).

        Returned as a state INDEX. It is not a business label — the states are discovered, and what
        each one means is a judgment a person makes after looking at them.
        """
        self._check_fitted()
        X = np.asarray(X, dtype=float)
        lengths = getattr(self, "mj_sequence_lengths_", None)
        # At score time a caller may pass one entity's history at a time; absent lengths, treat the
        # matrix as a single sequence. That is correct HERE (unlike at fit time) because decoding
        # one sequence does not learn anything from the boundary.
        return self.model_.predict(X, [X.shape[0]] if not lengths or sum(lengths) != X.shape[0] else lengths)

    def predict_proba(self, X: Any) -> np.ndarray:  # noqa: N803
        """Posterior probability of each state per observation — bounded, comparable, reportable."""
        self._check_fitted()
        X = np.asarray(X, dtype=float)
        return self.model_.predict_proba(X)

    def score_samples(self, X: Any) -> np.ndarray:  # noqa: N803
        """Posterior probability of the ASSIGNED state — the per-row confidence."""
        proba = self.predict_proba(X)
        return proba.max(axis=1)

    def _check_fitted(self) -> None:
        if getattr(self, "model_", None) is None:
            raise HMMConfigError("HMMEstimator is not fitted.")

    @property
    def classes_(self) -> np.ndarray:
        """The discovered state indices, so downstream decode paths have something to map."""
        return np.arange(int(self.n_states))


def sequence_lengths_from_groups(group_values: Sequence[Any]) -> List[int]:
    """Turn a per-row group key into contiguous run lengths.

    Rows are expected already ordered — grouped by entity, ordered within it. A key that reappears
    after a different one starts a NEW run rather than being merged, because merging would silently
    stitch a gap into a single history and invent a transition that never happened.
    """
    lengths: List[int] = []
    previous: Any = object()
    for value in group_values:
        if value != previous:
            lengths.append(0)
            previous = value
        lengths[-1] += 1
    return lengths


def hmmlearn_available() -> bool:
    """Whether the optional `hmmlearn` dependency imported."""
    return _HAVE_HMMLEARN
