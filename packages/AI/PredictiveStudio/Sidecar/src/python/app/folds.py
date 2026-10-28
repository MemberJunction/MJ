"""Inner-validation folds over development rows only.

The trainer scores and selects candidates on these folds, so they must never see a locked-holdout row. Every generator
takes the development rows only (positions or arrays the caller has already restricted to the development set; this
module never receives a manifest role) and returns positions into that development set. The caller maps them back to
snapshot rows.

  repeated_stratified  `repeats` x `folds` partitions, stratified on the label (classification) or random (regression)
  grouped              whole group keys per fold, `repeats` reshuffles of the key-to-fold map: no key on both sides
  blocked_time         grouped and blocked in time: validation is a fold's groups at periods at or after an inner
                       trailing cutoff; training is the other groups' rows at periods at least `gap_periods` before the
                       earliest validation period

The first repeat of the unstratified, grouped and blocked-time assignments is the reference pipeline's (one
`default_rng(seed)`; rows dealt round-robin after one permutation, or group keys sorted then permuted), so a leakage
audit over these folds reproduces the reference pipeline's numbers. Repeat r draws from `default_rng(seed + r)`. The
stratified assignment has no reference counterpart.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

IntArr = npt.NDArray[np.int64]


@dataclass(frozen=True)
class Fold:
    """One inner fold: positions into the development rows for training and validation, and the repeat it belongs to."""

    repeat: int
    train: IntArr
    valid: IntArr


def _require_partition(folds: int, repeats: int) -> None:
    if folds < 2:
        raise ValueError(f"inner validation needs at least 2 folds, got {folds}")
    if repeats < 1:
        raise ValueError(f"inner validation needs at least 1 repeat, got {repeats}")


def _folds_of(assign: IntArr, folds: int, repeat: int) -> list[Fold]:
    return [Fold(repeat, np.flatnonzero(assign != k).astype(np.int64), np.flatnonzero(assign == k).astype(np.int64))
            for k in range(folds)]


def _stratified_assignment(labels: list[str], folds: int, rng: np.random.Generator) -> IntArr:
    """Each class, in sorted label order, is shuffled and dealt round-robin over the folds, continuing the deal where
    the previous class stopped, so validation fold sizes differ by at most 1 and each class's count per fold differs by
    at most 1. A class with fewer members than `folds` is therefore spread over fewer validation folds than there are
    (some folds hold none of it)."""
    tokens = np.asarray(labels, dtype=object)
    assign = np.empty(len(labels), dtype=np.int64)
    offset = 0
    for cls in sorted(set(labels)):
        idx = np.flatnonzero(tokens == cls)
        idx = idx[rng.permutation(len(idx))]
        assign[idx] = (np.arange(len(idx)) + offset) % folds
        offset += len(idx)
    return assign


def repeated_stratified(y: npt.NDArray[np.generic], folds: int, repeats: int, seed: int,
                        stratify: bool) -> list[Fold]:
    """`repeats` independent k-fold partitions of the development rows `y`. With `stratify` (classification), each
    class is dealt round-robin over the folds after a seeded shuffle, so every fold keeps the class balance; without it
    (regression), rows are dealt round-robin after a seeded permutation, the reference pipeline's random assignment.
    Raises when there are fewer rows than folds (a fold would validate nothing)."""
    _require_partition(folds, repeats)
    n = len(y)
    if n < folds:
        raise ValueError(f"repeated inner validation needs at least {folds} development rows, got {n}")
    labels = [str(v) for v in np.asarray(y).tolist()] if stratify else []
    out: list[Fold] = []
    for r in range(repeats):
        rng = np.random.default_rng(seed + r)
        if stratify:
            assign = _stratified_assignment(labels, folds, rng)
        else:
            assign = np.empty(n, dtype=np.int64)
            assign[rng.permutation(n)] = np.arange(n) % folds
        out.extend(_folds_of(assign, folds, r))
    return out


def _group_assignment(keys: Sequence[str], folds: int, rng: np.random.Generator) -> IntArr:
    """Group keys sorted, permuted and dealt round-robin over the folds; every row takes its key's fold."""
    ordered = sorted(set(keys))
    perm = rng.permutation(len(ordered))
    fold_of = {ordered[int(j)]: i % folds for i, j in enumerate(perm)}
    return np.array([fold_of[k] for k in keys], dtype=np.int64)


def grouped(groups: Sequence[str], folds: int, repeats: int, seed: int) -> list[Fold]:
    """Whole groups per fold over the development rows' group keys `groups`: no group key is on both the training and
    the validation side of a fold."""
    _require_partition(folds, repeats)
    distinct = len(set(groups))
    if distinct < folds:
        raise ValueError(f"grouped inner validation needs at least {folds} groups, got {distinct}")
    out: list[Fold] = []
    for r in range(repeats):
        out.extend(_folds_of(_group_assignment(groups, folds, np.random.default_rng(seed + r)), folds, r))
    return out


def trailing_cutoff_index(period_ordinals: IntArr, max_share: float = 0.25) -> int:
    """Earliest period ordinal whose trailing block (ordinals at or after it) holds at most `max_share` of the rows; at
    least the last ordinal. Raises when that would leave no earlier rows to train on."""
    uniq = sorted({int(v) for v in period_ordinals.tolist()})
    if not uniq:
        raise ValueError("blocked-time inner validation needs at least one development row")
    n = len(period_ordinals)
    best = uniq[-1]
    for u in reversed(uniq):
        if float(np.sum(period_ordinals >= u)) / n <= max_share:
            best = u
        else:
            break
    if best == uniq[0]:
        raise ValueError("blocked-time cutoff would leave no inner-training rows")
    return best


def blocked_time(period_ordinals: IntArr, groups: Sequence[str] | None, folds: int, gap_periods: int,
                 seed: int) -> list[Fold]:
    """Grouped, time-blocked folds over the development rows' period ordinals: validation is fold k's groups at
    ordinals at or after the inner trailing cutoff; training is the other groups' rows with
    ordinal <= (earliest validation ordinal - gap_periods), so training and validation periods are at least
    `gap_periods` apart (a gap of 0 or 1 already holds once the trailing block is removed). With no group key every row
    is its own group. One repeat: the time order fixes the blocks. Raises when a fold would have no validation rows
    (none of its groups reaches the trailing block) or no training rows (the gap leaves no other group's row early
    enough): a fold that scores nothing, or a model fitted on nothing, must not reach candidate selection.

    The reference pipeline blocks on dates with a gap in days; ordinals over the unit's period kind are the product's
    equivalent, with the gap counted in periods."""
    if gap_periods < 0:
        raise ValueError(f"blocked-time gap must be at least 0 periods, got {gap_periods}")
    n = len(period_ordinals)
    if groups is not None and len(groups) != n:
        raise ValueError(f"blocked-time inner validation got {len(groups)} group keys for {n} period ordinals")
    keys: Sequence[str] = groups if groups is not None else [str(i) for i in range(n)]
    late = period_ordinals >= trailing_cutoff_index(period_ordinals)
    early_ok = period_ordinals <= int(period_ordinals[late].min()) - gap_periods
    out: list[Fold] = []
    for k, f in enumerate(grouped(keys, folds, 1, seed)):
        in_valid_fold = np.zeros(n, dtype=bool)
        in_valid_fold[f.valid] = True
        train = np.flatnonzero(~in_valid_fold & ~late & early_ok).astype(np.int64)
        valid = np.flatnonzero(in_valid_fold & late).astype(np.int64)
        _require_nonempty(k, train, valid, gap_periods)
        out.append(Fold(0, train, valid))
    return out


def _require_nonempty(k: int, train: IntArr, valid: IntArr, gap_periods: int) -> None:
    if len(valid) == 0:
        raise ValueError(f"blocked-time fold {k} has no validation rows: none of its groups has a row at or after the "
                         "inner trailing cutoff (use fewer folds or more late development rows)")
    if len(train) == 0:
        raise ValueError(f"blocked-time fold {k} has no training rows: no other group has a row at least "
                         f"{gap_periods} period(s) before the earliest validation period (use a smaller gap or more "
                         "early development rows)")


def shared_groups(fold: Fold, groups: Sequence[str]) -> int:
    """Number of group keys present on both sides of a fold; a grouped or blocked-time fold must share none."""
    return len({groups[int(i)] for i in fold.train} & {groups[int(i)] for i in fold.valid})
