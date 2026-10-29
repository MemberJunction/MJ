"""Leakage audit on DEVELOPMENT rows, run before any candidate is fitted, and the implausible-gain rule against a
planted reference score.

Port of the truth suite's reference pipeline audit (`packages/AI/PredictiveStudio/TruthSuite/python/truthsuite/
refpipe/audit.py`), with the protocol's single-feature ceiling in place of the reference's fixed 0.9:

  high-cardinality-id   a categorical or identifier feature column whose distinct-value ratio over its non-missing
                        development values exceeds 0.5. The reference applies this to every non-numeric column; here
                        the declared encoding decides, so a boolean or date-part column (numeric by declaration) is
                        never treated as an identifier. An identifier column is excluded by its encoding either way;
                        the flag reports it.
  single-feature-auc    a feature column whose out-of-fold single-feature score against the label shifted by
  time-shifted-label    k in {-1, 0, +1} rows within its entity is best at k >= 0 and above the ceiling: a same-period
                        proxy of the outcome (k = 0) or a future-period outcome (k = +1). A column whose best shift is
                        k = -1 is a past-period outcome (a lag): legitimate, kept and reported.

Scores: binary AUC, multiclass macro one-vs-rest AUC, continuous R^2. The single-feature model is a shrunken bin mean
(20 quantile bins for a numeric column with more than 20 distinct values, else one bin per value), fitted on each
audit fold's training rows. Audit folds are 5 whole-entity folds when entities repeat, else 5 random folds, from the
same fold builders (and so the same draws) as the reference. With time, rows are ordered by entity, decision-period
ordinal and snapshot position, where the reference orders by entity, decision date and row ID; the two agree when an
entity has at most one row per period.

Every feature column of a source column is audited, and the source is flagged when any of them is, so an encoding or
a derivation (several feature columns from one source) cannot split a leak into parts that each pass. Flagged source
columns are removed from every candidate and baseline before selection.

A shift whose audit folds cannot be built (fewer than 20 shifted rows, fewer than 5 entities to group, or no fold
with rows on both sides) scores NaN and never wins; a column with no scored shift is not flagged by the single-feature
rule. The audit raises nothing. (The reference scores a shift with fewer than 5 entities on the folds that are not
empty; here such a shift is unscored.)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Literal, Mapping, Optional, Sequence, Tuple

import numpy as np
import numpy.typing as npt
import pandas as pd

from . import encoding, folds as F, scores
from .algorithms import TabularFamily
from .array_types import FArr, IntArr
from .intervals import delong_paired
from .trainer_schemas import (
    HighCardinalityIdFlag, LeakageFlag, SingleFeatureAucFlag, TimeShiftedLabelFlag,
)

AuditMetric = Literal["auc", "r2", "n/a"]
ID_DISTINCT_RATIO = 0.5
# Shrinkage of each bin mean toward the fold's overall mean, in pseudo-rows.
SHRINK = 10.0
AUDIT_FOLDS = 5
MIN_SHIFTED_ROWS = 20
NUMERIC_BINS = 20
# A candidate beating the reference score with a one-sided paired DeLong p below this is treated as a leak.
REFERENCE_P = 0.001


@dataclass(frozen=True)
class ColumnAudit:
    """One feature column's single-feature scores by label shift (NaN where a shift could not be scored), its best
    scored shift and whether that makes it a leak."""

    source_column: str
    feature_column: str
    metric: AuditMetric
    score_by_shift: Dict[int, float]
    best_shift: int
    flagged: bool

    @property
    def best_score(self) -> float:
        return self.score_by_shift.get(self.best_shift, float("nan"))


@dataclass(frozen=True)
class AuditResult:
    """The flags, the source columns to exclude, the source columns kept as past-period outcomes, and the per-column
    evidence (not on the wire; for comparison with the reference pipeline)."""

    flags: List[LeakageFlag]
    excluded_sources: List[str]
    past_outcome_sources: List[str]
    evidence: List[ColumnAudit]


@dataclass(frozen=True)
class _AuditRows:
    """The development rows in audit order: entity codes, label, and whether whole-entity folds are used."""

    entity: List[str]
    label: FArr
    grouped: bool


def _key(v: object) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "__nan__"
    return str(v)


def _bin_keys(x_tr: npt.NDArray[np.generic], x_va: npt.NDArray[np.generic],
              numeric: bool) -> Tuple[List[str], List[str]]:
    if numeric:
        xt = x_tr.astype(np.float64)
        if len(np.unique(xt[~np.isnan(xt)])) > NUMERIC_BINS:
            xv = x_va.astype(np.float64)
            edges = np.unique(np.nanquantile(xt, np.linspace(0, 1, NUMERIC_BINS + 1)[1:-1]))
            kt = np.where(np.isnan(xt), -1, np.searchsorted(edges, xt, side="right"))
            kv = np.where(np.isnan(xv), -1, np.searchsorted(edges, xv, side="right"))
            return [str(int(v)) for v in kt], [str(int(v)) for v in kv]
    return [_key(v) for v in x_tr.tolist()], [_key(v) for v in x_va.tolist()]


def _oof_binned(x: npt.NDArray[np.generic], numeric: bool, Y: FArr,
                folds: Sequence[F.Fold]) -> Optional[Tuple[IntArr, FArr]]:
    """Out-of-fold shrunken bin means of each column of Y (one per class, or one for a continuous label); None when
    no fold has rows on both sides."""
    idx_all: List[IntArr] = []
    pred_all: List[FArr] = []
    for f in folds:
        if len(f.train) == 0 or len(f.valid) == 0:
            continue
        kt, kv = _bin_keys(x[f.train], x[f.valid], numeric)
        Ytr = Y[f.train]
        prior = Ytr.mean(axis=0)
        sums: Dict[str, FArr] = {}
        counts: Dict[str, int] = {}
        for i, k in enumerate(kt):
            sums[k] = sums.get(k, np.zeros(Y.shape[1])) + Ytr[i]
            counts[k] = counts.get(k, 0) + 1
        lookup = {k: (sums[k] + SHRINK * prior) / (counts[k] + SHRINK) for k in sums}
        idx_all.append(f.valid)
        pred_all.append(np.array([lookup.get(k, prior) for k in kv], dtype=np.float64))
    if not idx_all:
        return None
    return np.concatenate(idx_all), np.concatenate(pred_all)


def _shifted_label(rows: _AuditRows, k: int) -> FArr:
    """The label of the row k rows later within the same entity (NaN where there is none); k = -1 is the previous
    row's label."""
    return np.asarray(pd.Series(rows.label).groupby(rows.entity, sort=False).shift(-k), dtype=np.float64)


def _audit_folds(entity: Sequence[str], n: int, grouped: bool, seed: int) -> Optional[List[F.Fold]]:
    try:
        if grouped:
            return F.grouped(entity, AUDIT_FOLDS, 1, seed)
        return F.repeated_stratified(np.zeros(n), AUDIT_FOLDS, 1, seed, stratify=False)
    except ValueError:
        return None


def _score_shift(rows: _AuditRows, x: npt.NDArray[np.generic], numeric: bool, k: int, family: TabularFamily,
                 seed: int, n_classes: int) -> Tuple[float, AuditMetric]:
    """One feature column's out-of-fold single-feature score against the label shifted by k; NaN when the shifted
    rows are too few or cannot fill the audit folds."""
    shifted = _shifted_label(rows, k)
    keep = np.flatnonzero(~np.isnan(shifted))
    if len(keep) < MIN_SHIFTED_ROWS:
        return float("nan"), "n/a"
    folds = _audit_folds([rows.entity[int(i)] for i in keep], len(keep), rows.grouped, seed)
    if folds is None:
        return float("nan"), "n/a"
    xs = x[keep]
    ys = shifted[keep]
    if family == "multiclass":
        yi = ys.astype(np.int64)
        oof = _oof_binned(xs, numeric, np.eye(n_classes)[yi], folds)
        return (float("nan"), "n/a") if oof is None else (scores.auc(yi[oof[0]].astype(np.float64), oof[1]), "auc")
    oof = _oof_binned(xs, numeric, ys.reshape(-1, 1), folds)
    if oof is None:
        return float("nan"), "n/a"
    if family == "binary":
        return scores.auc(ys[oof[0]], oof[1][:, 0]), "auc"
    return scores.r2(ys[oof[0]], oof[1][:, 0]), "r2"


def _audit_column(rows: _AuditRows, spec: encoding.ColumnSpec, x: npt.NDArray[np.generic], shifts: Sequence[int],
                  family: TabularFamily, seed: int, n_classes: int, ceiling: float) -> ColumnAudit:
    """Scores one feature column against each label shift; flagged when its best scored shift is same- or
    future-period and above the ceiling."""
    numeric = isinstance(spec.encoding, encoding.NumericEncoding)
    by_shift: Dict[int, float] = {}
    metric: AuditMetric = "n/a"
    for k in shifts:
        v, m = _score_shift(rows, x, numeric, k, family, seed, n_classes)
        by_shift[k] = v
        if m != "n/a":
            metric = m
    valid = {k: v for k, v in by_shift.items() if not math.isnan(v)}
    best = max(sorted(valid), key=lambda k: valid[k]) if valid else 0
    flagged = best >= 0 and valid.get(best, float("nan")) > ceiling
    return ColumnAudit(spec.source_column, spec.name, metric, by_shift, best, flagged)


def _distinct_ratio(x: npt.NDArray[np.generic]) -> float:
    present = x[~pd.isna(x)]
    return float(len(set(present.tolist()))) / max(1, len(present))


def _high_cardinality_flag(src: str, specs: Sequence[encoding.ColumnSpec],
                           values: Mapping[str, npt.NDArray[np.generic]]) -> Optional[HighCardinalityIdFlag]:
    """The flag of a source whose categorical or identifier feature columns include one with a distinct ratio above
    one half (the highest such ratio), else None."""
    ratios = [_distinct_ratio(values[s.name]) for s in specs
              if isinstance(s.encoding, (encoding.CategoricalEncoding, encoding.IdentifierEncoding))]
    over = [r for r in ratios if r > ID_DISTINCT_RATIO]
    if not over:
        return None
    return HighCardinalityIdFlag(kind="high-cardinality-id", sourceColumn=src, distinctRatio=max(over))


def _source_flags(src: str, audits: Sequence[ColumnAudit]) -> List[LeakageFlag]:
    """One single-feature flag for a source with a flagged column (its highest flagged score), plus a time-shifted-label
    flag when a flagged column's best shift is the next period."""
    flagged = [a for a in audits if a.flagged]
    if not flagged:
        return []
    out: List[LeakageFlag] = [SingleFeatureAucFlag(kind="single-feature-auc", sourceColumn=src,
                                                   heldOutAuc=max(a.best_score for a in flagged))]
    future = [a.best_score for a in flagged if a.best_shift == 1]
    if future:
        out.append(TimeShiftedLabelFlag(kind="time-shifted-label", scoreWithShiftedLabel=max(future)))
    return out


def run_audit(frame: pd.DataFrame, columns: Sequence[encoding.ColumnSpec], y: npt.NDArray[np.generic],
              entity: Sequence[str], period_ordinal: IntArr, has_time: bool, family: TabularFamily, ceiling: float,
              seed: int, n_classes: int) -> AuditResult:
    """Audit the development rows: `frame` holds every feature column of `columns` (raw values, before encoding), one
    row per entry of `y`, `entity` and `period_ordinal`.

    Every feature column of each source column is audited (identifier columns only by the distinct-ratio check); a
    source is excluded when any of its columns is flagged. Label shifts are taken ROW by row within an entity, as the
    reference pipeline does: with time, rows are ordered by entity, then period, then their position, and shift k pairs
    a row with the label k rows later in its entity, which is the label k periods later only when an entity has one row
    per period. Without time the rows keep their given order. Without time, or when no entity has more than one row,
    only shift 0 is scored; folds group whole entities only when some entity has more than one row.
    `y` is the encoded label: class index (binary, multiclass) or value."""
    entities_repeat = len(set(entity)) < len(entity)
    shifts: Tuple[int, ...] = (-1, 0, 1) if has_time and entities_repeat else (0,)
    order = (np.lexsort((np.arange(len(entity)), period_ordinal, np.asarray([str(e) for e in entity])))
             if has_time else np.arange(len(entity)))
    rows = _AuditRows([str(entity[int(i)]) for i in order], np.asarray(y, dtype=np.float64)[order], entities_repeat)
    by_source: Dict[str, List[encoding.ColumnSpec]] = {}
    for c in columns:
        by_source.setdefault(c.source_column, []).append(c)
    flags: List[LeakageFlag] = []
    excluded: List[str] = []
    past: List[str] = []
    evidence: List[ColumnAudit] = []
    for src, specs in sorted(by_source.items()):
        values = {s.name: frame[s.name].to_numpy()[order] for s in specs}
        id_flag = _high_cardinality_flag(src, specs, values)
        if id_flag is not None:
            flags.append(id_flag)
            excluded.append(src)
            continue
        audits = [_audit_column(rows, s, values[s.name], shifts, family, seed, n_classes, ceiling)
                  for s in specs if not isinstance(s.encoding, encoding.IdentifierEncoding)]
        evidence.extend(audits)
        source_flags = _source_flags(src, audits)
        if source_flags:
            flags.extend(source_flags)
            excluded.append(src)
        elif any(a.best_shift == -1 and a.best_score > ceiling for a in audits):
            past.append(src)
    return AuditResult(flags, excluded, past, evidence)


def beats_reference(y: FArr, candidate: FArr, reference: FArr) -> Tuple[bool, float]:
    """Whether a candidate's out-of-fold scores rank the rows better than the planted reference score (the true
    probability a test world wrote) by an implausible margin: paired DeLong on the same rows, one-sided p below
    `REFERENCE_P`. Returns the decision and that p. Only test fixtures carry a reference score; product snapshots
    do not, so in production this rule does not run and the single-feature audit is the leak guard. Undefined
    comparisons are never a leak: rows with one class give (False, 1.0), and a zero-variance difference gives a NaN
    p, which is not below the threshold."""
    yy = np.asarray(y, dtype=np.float64)
    if len(np.unique(yy)) < 2:
        return False, 1.0
    p = delong_paired(yy, candidate, reference).p_a_greater
    return bool(p < REFERENCE_P), p
