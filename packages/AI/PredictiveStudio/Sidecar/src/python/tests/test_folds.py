"""Inner-validation folds over development rows: grouped folds share no group key, time-blocked folds keep the gap,
stratified folds keep the class balance, and the unstratified and grouped assignments are the reference pipeline's."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt
import pytest

from app import folds as F


def test_grouped_folds_share_zero_keys_and_repeat() -> None:
    groups = [f"m{i // 4}" for i in range(400)]
    fs = F.grouped(groups, folds=5, repeats=3, seed=7)
    assert len(fs) == 15
    assert all(F.shared_groups(f, groups) == 0 for f in fs)
    assert {f.repeat for f in fs} == {0, 1, 2}


def test_blocked_time_folds_keep_gap_and_groups() -> None:
    n = 600
    periods = np.repeat(np.arange(6), 100).astype(np.int64)
    groups = [f"m{i % 100}" for i in range(n)]
    fs = F.blocked_time(periods, groups, folds=5, gap_periods=1, seed=0)
    for f in fs:
        assert int(periods[f.train].max()) <= int(periods[f.valid].min()) - 1
        assert F.shared_groups(f, groups) == 0


def test_stratified_folds_keep_class_balance() -> None:
    y = np.array([1] * 50 + [0] * 950)
    for f in F.repeated_stratified(y, 5, 2, 0, stratify=True):
        assert int(y[f.valid].sum()) == 10


def _reference_assignment(n: int, keys: list[str] | None, k: int, seed: int) -> npt.NDArray[np.int64]:
    """The reference pipeline's inner fold assignment, restated from its two assignment rules: ungrouped rows are dealt
    round-robin after one seeded permutation; grouped rows take the fold of their key, keys sorted then permuted.
    Restated rather than imported: the sidecar's venv does not carry the truth-suite package `truthsuite` (it is
    importable only with the TruthSuite venv and PYTHONPATH, which the product unit tests never set)."""
    rng = np.random.default_rng(seed)
    if keys is None:
        f = np.empty(n, dtype=np.int64)
        f[rng.permutation(n)] = np.arange(n) % k
        return f
    ents = sorted(set(keys))
    perm = rng.permutation(len(ents))
    fold_of = {ents[int(j)]: i % k for i, j in enumerate(perm)}
    return np.array([fold_of[e] for e in keys], dtype=np.int64)


def _assignment(fs: list[F.Fold], n: int) -> npt.NDArray[np.int64]:
    out = np.full(n, -1, dtype=np.int64)
    for k, f in enumerate(fs):
        out[f.valid] = k
    return out


def test_first_repeat_reproduces_the_reference_unstratified_and_grouped_assignment() -> None:
    n, k, seed = 237, 5, 11
    y = np.arange(n) % 3
    first = [f for f in F.repeated_stratified(y, k, 3, seed, stratify=False) if f.repeat == 0]
    assert np.array_equal(_assignment(first, n), _reference_assignment(n, None, k, seed))
    keys = [f"e{(i * 7) % 41}" for i in range(n)]
    first_grouped = [f for f in F.grouped(keys, k, 3, seed) if f.repeat == 0]
    assert np.array_equal(_assignment(first_grouped, n), _reference_assignment(n, keys, k, seed))
    later = [f for f in F.repeated_stratified(y, k, 3, seed, stratify=False) if f.repeat == 1]
    assert not np.array_equal(_assignment(later, n), _assignment(first, n))


def test_blocked_time_gap_removes_training_periods_closer_than_the_gap() -> None:
    # 20 entities observed once in each of 10 periods: the trailing cutoff is period 8 (20% of rows), so validation
    # starts at period 8 and, without a gap, inner training runs through period 7.
    periods = np.repeat(np.arange(10), 20).astype(np.int64)
    groups = [f"m{i % 20}" for i in range(len(periods))]
    assert F.trailing_cutoff_index(periods) == 8

    def train_periods(gap: int) -> set[int]:
        fs = F.blocked_time(periods, groups, folds=4, gap_periods=gap, seed=3)
        assert all(int(periods[f.valid].min()) == 8 for f in fs)
        return {int(p) for f in fs for p in periods[f.train].tolist()}

    assert train_periods(0) == set(range(8))
    # A gap of one period keeps the adjacent period: training and validation periods are at least one period apart.
    assert train_periods(1) == set(range(8))
    # A gap of two periods drops the period one before validation and keeps the one exactly two before.
    assert train_periods(2) == set(range(7))
    assert train_periods(3) == set(range(6))


def test_blocked_time_refuses_a_fold_with_no_validation_rows() -> None:
    # 20 single-row periods, ungrouped: only the last 5 rows are at or after the trailing cutoff, so with 10 folds at
    # least 5 folds draw no late row.
    periods = np.arange(20).astype(np.int64)
    with pytest.raises(ValueError, match=r"fold \d+ has no validation rows"):
        F.blocked_time(periods, None, folds=10, gap_periods=0, seed=0)


def test_blocked_time_refuses_a_fold_with_no_training_rows() -> None:
    periods = np.repeat(np.arange(10), 20).astype(np.int64)
    groups = [f"m{i % 20}" for i in range(len(periods))]
    with pytest.raises(ValueError, match=r"fold \d+ has no training rows"):
        F.blocked_time(periods, groups, folds=4, gap_periods=9, seed=0)


def test_blocked_time_refuses_group_keys_of_a_different_length() -> None:
    periods = np.repeat(np.arange(10), 20).astype(np.int64)
    with pytest.raises(ValueError, match="group keys"):
        F.blocked_time(periods, [f"m{i % 20}" for i in range(199)], folds=4, gap_periods=0, seed=0)


def test_repeated_folds_refuse_fewer_rows_than_folds() -> None:
    with pytest.raises(ValueError, match="at least 5 development rows"):
        F.repeated_stratified(np.arange(4), 5, 1, 0, stratify=False)
    with pytest.raises(ValueError, match="at least 5 development rows"):
        F.repeated_stratified(np.arange(4), 5, 1, 0, stratify=True)


def test_stratified_deal_continues_across_classes_so_folds_stay_balanced() -> None:
    y = np.array([0] * 7 + [1] * 8 + [2] * 9)
    for r in range(3):
        fs = [f for f in F.repeated_stratified(y, 5, 3, 4, stratify=True) if f.repeat == r]
        sizes = [len(f.valid) for f in fs]
        assert max(sizes) - min(sizes) <= 1
        for cls in (0, 1, 2):
            per_fold = [int(np.sum(y[f.valid] == cls)) for f in fs]
            assert max(per_fold) - min(per_fold) <= 1


def _reference_blocked(periods: npt.NDArray[np.int64], keys: list[str], k: int, seed: int,
                       gap: int) -> list[tuple[npt.NDArray[np.int64], npt.NDArray[np.int64]]]:
    """The reference pipeline's grouped, time-blocked folds restated over integer periods: the grouped assignment, a
    trailing cutoff (earliest period whose trailing block holds at most a quarter of the rows), validation = a fold's
    keys at or after it, training = the other keys at periods <= earliest validation period - gap."""
    f = _reference_assignment(len(periods), keys, k, seed)
    uniq = sorted({int(p) for p in periods.tolist()})
    cut = uniq[-1]
    for u in reversed(uniq):
        if float(np.sum(periods >= u)) / len(periods) <= 0.25:
            cut = u
        else:
            break
    late = periods >= cut
    early_ok = periods <= int(periods[late].min()) - gap
    return [(np.flatnonzero((f != i) & ~late & early_ok).astype(np.int64),
             np.flatnonzero((f == i) & late).astype(np.int64)) for i in range(k)]


def test_blocked_time_reproduces_the_reference_grouped_time_blocked_folds() -> None:
    n = 311
    periods = np.array([i % 12 for i in range(n)], dtype=np.int64)
    keys = [f"E{(i * 13) % 57}" for i in range(n)]
    for seed, gap in ((0, 0), (7, 1), (42, 3)):
        mine = F.blocked_time(periods, keys, 5, gap, seed)
        ref = _reference_blocked(periods, keys, 5, seed, gap)
        assert all(np.array_equal(a, m.train) and np.array_equal(b, m.valid) for (a, b), m in zip(ref, mine))
        assert all(m.repeat == 0 for m in mine)
