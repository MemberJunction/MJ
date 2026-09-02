"""Hidden Markov Model — the `sequence` driver.

An HMM is unusually easy to make LOOK like it worked: give it no sequence boundaries and it trains
happily on nonsense, producing a fitted model and confident-looking scores. So most of these tests
are about the refusals, and the one capability test plants a known two-state structure and checks it
is actually recovered rather than merely that `fit` returned.
"""

from __future__ import annotations

import numpy as np
import pytest

from app import algorithms
from app.estimators.hmm import (
    HMMConfigError,
    HMMEstimator,
    MIN_GROUP_LENGTH,
    hmmlearn_available,
    sequence_lengths_from_groups,
)

pytestmark = pytest.mark.skipif(not hmmlearn_available(), reason="hmmlearn not installed")


def planted_sequences(n_groups: int = 30, per_group: int = 12, seed: int = 7):
    """Groups whose observations switch between two clearly separated regimes."""
    rng = np.random.default_rng(seed)
    rows, lengths = [], []
    for _ in range(n_groups):
        # First half sits near 0, second half near 8 — a single, obvious transition per group.
        low = rng.normal(0.0, 0.4, size=(per_group // 2, 2))
        high = rng.normal(8.0, 0.4, size=(per_group - per_group // 2, 2))
        rows.append(np.vstack([low, high]))
        lengths.append(per_group)
    return np.vstack(rows), lengths


def fitted(n_states: int = 2):
    X, lengths = planted_sequences()
    est = HMMEstimator(n_states=n_states, n_iter=50, random_state=0)
    est.mj_set_sequence_lengths(lengths)
    est.fit(X)
    return est, X, lengths


# ---------------------------------------------------------------------------
# capability
# ---------------------------------------------------------------------------

def test_recovers_the_planted_two_regime_structure() -> None:
    est, X, _ = fitted()
    states = est.predict(X)

    # The two regimes must land in DIFFERENT states — that is the whole claim.
    low_rows, high_rows = X[:, 0] < 4.0, X[:, 0] >= 4.0
    assert len(np.unique(states[low_rows])) == 1
    assert len(np.unique(states[high_rows])) == 1
    assert states[low_rows][0] != states[high_rows][0]


def test_posterior_is_a_bounded_comparable_confidence() -> None:
    # Not a log-likelihood: unbounded numbers are not comparable across models or records.
    est, X, _ = fitted()
    confidence = est.score_samples(X)
    assert confidence.shape == (X.shape[0],)
    assert np.all(confidence >= 0.0) and np.all(confidence <= 1.0)
    # Well-separated regimes ⇒ the assignment should be confident.
    assert confidence.mean() > 0.9


def test_predict_proba_rows_are_distributions_over_the_states() -> None:
    est, X, _ = fitted(n_states=3)
    proba = est.predict_proba(X)
    assert proba.shape == (X.shape[0], 3)
    assert np.allclose(proba.sum(axis=1), 1.0)


def test_states_are_reported_as_indices_not_invented_labels() -> None:
    est, _X, _ = fitted(n_states=3)
    # A discovered state has no business meaning until a person gives it one.
    assert list(est.classes_) == [0, 1, 2]


def test_scoring_one_entity_history_needs_no_lengths() -> None:
    # Decoding a single sequence learns nothing from the boundary, so this is safe — unlike fit.
    est, X, _ = fitted()
    one = X[:12]
    assert est.predict(one).shape == (12,)


# ---------------------------------------------------------------------------
# refusals — the ways an HMM silently means nothing
# ---------------------------------------------------------------------------

def test_refuses_to_fit_without_sequence_boundaries() -> None:
    """The important one.

    hmmlearn given no `lengths` treats the whole matrix as ONE sequence and trains happily, learning
    transitions between unrelated entities. It produces a fitted model and plausible scores, so
    nothing downstream would ever reveal the mistake.
    """
    X, _ = planted_sequences()
    with pytest.raises(HMMConfigError, match="needs sequence boundaries"):
        HMMEstimator().fit(X)


def test_refuses_lengths_that_do_not_account_for_every_row() -> None:
    X, lengths = planted_sequences()
    est = HMMEstimator()
    est.mj_set_sequence_lengths(lengths[:-1])
    with pytest.raises(HMMConfigError, match="but the matrix has"):
        est.fit(X)


def test_refuses_when_no_sequence_is_long_enough_to_have_a_transition() -> None:
    X = np.random.default_rng(1).normal(size=(6, 2))
    est = HMMEstimator()
    est.mj_set_sequence_lengths([1, 1, 1, 1, 1, 1])
    with pytest.raises(HMMConfigError, match=f"shorter than {MIN_GROUP_LENGTH}"):
        est.fit(X)


def test_refuses_a_single_state() -> None:
    X, lengths = planted_sequences()
    est = HMMEstimator(n_states=1)
    est.mj_set_sequence_lengths(lengths)
    with pytest.raises(HMMConfigError, match="cannot transition"):
        est.fit(X)


def test_refuses_to_predict_before_fitting() -> None:
    with pytest.raises(HMMConfigError, match="not fitted"):
        HMMEstimator().predict(np.zeros((3, 2)))


def test_the_driver_refuses_a_per_record_problem_type() -> None:
    # Asking a sequence model a per-record question would fit fine and mean nothing.
    for problem in ("classification", "regression"):
        with pytest.raises(algorithms.AlgorithmNotSupportedError, match="models sequences"):
            algorithms.build_estimator("hmm", problem, {})


def test_the_driver_is_registered_and_builds() -> None:
    assert "hmm" in algorithms.supported_algorithms()
    est = algorithms.build_estimator("hmm", "sequence", {"n_states": 3, "n_iter": 5})
    assert isinstance(est, HMMEstimator) and est.n_states == 3


# ---------------------------------------------------------------------------
# grouping helper
# ---------------------------------------------------------------------------

def test_group_keys_become_contiguous_run_lengths() -> None:
    assert sequence_lengths_from_groups(["a", "a", "b", "b", "b"]) == [2, 3]


def test_a_key_that_reappears_starts_a_NEW_run() -> None:
    # Merging them would stitch a gap into one history and invent a transition that never happened.
    assert sequence_lengths_from_groups(["a", "a", "b", "a"]) == [2, 1, 1]


def test_empty_input_has_no_runs() -> None:
    assert sequence_lengths_from_groups([]) == []


# ---------------------------------------------------------------------------
# End to end through /train — problem_type='sequence'
# ---------------------------------------------------------------------------

def sequence_request(n_groups: int = 24, per_group: int = 10, **over):
    """A matrix of per-member histories: engagement drops partway through each member's history."""
    import numpy as _np

    rng = _np.random.default_rng(11)
    columns = ["MemberID", "At", "engagement", "spend"]
    rows = []
    for g in range(n_groups):
        for i in range(per_group):
            level = 0.0 if i < per_group // 2 else 8.0
            rows.append([f"m{g}", f"2026-0{(i % 9) + 1}-01", float(rng.normal(level, 0.4)), float(rng.normal(level, 0.4))])
    req = {
        "algorithm": "hmm",
        "problem_type": "sequence",
        "hyperparameters": {"n_states": 2, "n_iter": 30, "random_state": 0},
        "validation": {"strategy": "none", "holdout_size": 0.25},
        "feature_schema": [{"Name": "engagement", "Kind": "numeric"}, {"Name": "spend", "Kind": "numeric"}],
        "preprocessing": [],
        "target": "engagement",
        "data": {"columns": columns, "rows": rows},
        "sequence": {"group_field": "MemberID", "order_field": "At"},
    }
    req.update(over)
    return req


def test_a_sequence_model_trains_end_to_end() -> None:
    from fastapi.testclient import TestClient
    from app.main import app

    resp = TestClient(app).post("/train", json=sequence_request())
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Posterior-based, bounded, comparable — never a log-likelihood.
    assert 0.0 <= body["metrics"]["mean_posterior"] <= 1.0
    assert 0.0 <= body["metrics"]["state_confidence"] <= 1.0
    assert body["metrics"]["mean_posterior"] > 0.8  # the planted regimes are well separated
    # An HMM attributes to latent states, not input features; inventing a per-feature number
    # would be worse than reporting none.
    assert body["feature_importance"] == {}


def test_the_holdout_holds_out_WHOLE_entities() -> None:
    """A row-wise split would put part of a member's history in train and part in holdout —
    leaking their future into their past and flattering the holdout score."""
    from fastapi.testclient import TestClient
    from app.main import app

    body = TestClient(app).post("/train", json=sequence_request()).json()
    assert "holdout_metrics" in body
    assert 0.0 <= body["holdout_metrics"]["mean_posterior"] <= 1.0


def test_sequence_training_refuses_without_a_group_field() -> None:
    from fastapi.testclient import TestClient
    from app.main import app

    req = sequence_request()
    del req["sequence"]
    resp = TestClient(app).post("/train", json=req)
    assert resp.status_code == 400
    assert "sequence.group_field" in resp.json()["detail"]


def test_sequence_training_refuses_a_group_field_that_is_not_a_column() -> None:
    from fastapi.testclient import TestClient
    from app.main import app

    resp = TestClient(app).post("/train", json=sequence_request(sequence={"group_field": "Nonexistent"}))
    assert resp.status_code == 400
    assert "is not a column" in resp.json()["detail"]


def test_group_split_holds_out_whole_groups_or_nothing() -> None:
    from app.main import _split_sequences_by_group

    dev, hold, dev_rows = _split_sequences_by_group([5, 5, 5, 5], 0.25)
    assert dev == [5, 5, 5] and hold == [5] and dev_rows == 15
    # A fraction too small to hold out a whole group holds out nothing — a holdout is worth
    # less than a model.
    assert _split_sequences_by_group([5, 5], 0.1) == ([5, 5], [], 10)
    # With two groups, a large fraction still keeps one to train on.
    assert _split_sequences_by_group([5, 5], 0.99) == ([5], [5], 5)
    # ...but it never holds out EVERY group — there would be nothing left to fit.
    assert _split_sequences_by_group([5, 5], 1.0) == ([5, 5], [], 10)
    # A single group cannot be split at all.
    assert _split_sequences_by_group([7], 0.5) == ([7], [], 7)
