"""`run_trainer`: one TrainerRequest -> one TrainerResult. Refusals that mean "this request must not run" raise
RequestRefused (HTTP 400, nothing fitted); every failure after that returns `failed` with its stage and the compute
spent, never partial metrics. One run clock measures the whole run and enforces the timeout and the compute budget.

The run, in order: load and verify the snapshot; audit the development rows for leakage (audit.py) and remove every
flagged source column from every candidate and baseline (failing at `inner-cv` when no feature column remains);
select the finalist on the remaining columns; for a binary task whose snapshot carries a planted reference score
(test fixtures only), apply the implausible-gain rule, which compares AUCs by paired DeLong and so is skipped for
every other task kind; then the holdout stage (evaluation.py), which reports the audit's flags.

A forecast task leaves that path right after the snapshot is loaded and runs its rolling-origin backtest instead
(forecast.py: selection on inner origins before the first test period, then every outer origin scored once). It
skips the leakage audit: a forecast snapshot is one series, so it has one entity, and the audit's grouped folds need at
least 5 entities; the audit could only score NaN there.
"""

from __future__ import annotations

import datetime as dt
from typing import List, Optional, Sequence, Tuple, Union

import numpy as np
from threadpoolctl import threadpool_limits

from . import audit as AU, baselines as BL, code_version, encoding, evaluation as EV, scores, snapshot as SN
from . import trainer as TR
from .array_types import FArr, IntArr
from .failures import RequestRefused, RunClock, TrainerFailure
from .forecast import run_forecast, refuse_invalid_forecast
from .trainer_schemas import CandidateSpec, DropColumnFlag, LeakageFlag, TrainerCompleted, TrainerFailed, TrainerRequest

TrainerOutcome = Union[TrainerCompleted, TrainerFailed]


def refuse_invalid(req: TrainerRequest) -> None:
    """Refuse a request that must not run at all.

    Raises:
        RequestRefused: For a primary score of another family than the task, a request seed other than the
            protocol's, duplicate candidate names, a candidate named as a gate member (or with the heuristic prefix),
            a candidate on a baseline-only driver, a holdout kind that does not fit the task, or a forecast protocol
            the rolling-origin backtest cannot honour (`forecast.refuse_invalid_forecast`).
    """
    p = req.protocol
    scores.refuse_cross_family(req.task.kind, p.primaryScore.family, p.primaryScore.metric)
    if req.seed != p.seed:
        raise RequestRefused(f"request seed {req.seed} differs from the protocol seed {p.seed}")
    names = [c.name for c in req.candidates]
    if len(set(names)) != len(names):
        raise RequestRefused("candidate names must be unique")
    reserved = sorted(n for n in names if n in BL.MEMBER_NAMES or n.startswith(BL.HEURISTIC_PREFIX))
    if reserved:
        raise RequestRefused(f"candidate names {reserved} are reserved for gate members")
    baseline_only = sorted(c.name for c in req.candidates if c.driverKey in BL.BASELINE_ONLY_DRIVERS)
    if baseline_only:
        raise RequestRefused(f"candidates {baseline_only} name a driver only the GLM baseline fits "
                             f"({sorted(BL.BASELINE_ONLY_DRIVERS)})")
    if (p.holdout.kind == "rolling-origin") != (req.task.kind == "forecast"):
        raise RequestRefused("a rolling-origin holdout is for forecast tasks, and a forecast task needs one")
    if req.task.kind == "forecast":
        refuse_invalid_forecast(p)


def run_trainer(req: TrainerRequest) -> TrainerOutcome:
    """Run one request under `threadpool_limits(req.threads)`; `failed` with the stage on any trainer failure.

    Raises:
        RequestRefused: See `refuse_invalid`.
    """
    refuse_invalid(req)
    p = req.protocol
    clock = RunClock(req.timeoutSeconds, p.budgets.maxComputeSeconds)
    try:
        if len(req.candidates) > p.budgets.maxCandidates:
            raise TrainerFailure("budget-exceeded",
                                 f"{len(req.candidates)} candidates exceed the protocol budget of {p.budgets.maxCandidates}")
        with threadpool_limits(limits=req.threads):
            return _run(req, clock)
    except TrainerFailure as f:
        return TrainerFailed(status="failed", trainingRunId=req.trainingRunId, stage=f.stage, message=f.message,
                             computeSeconds=clock.compute_seconds())


def _run(req: TrainerRequest, clock: RunClock) -> TrainerCompleted:
    p = req.protocol
    now = dt.datetime.now(dt.timezone.utc)
    snap = SN.load(req, now, clock)
    # The incumbent's artifact is downloaded and verified with the snapshot, so an expired or wrong file fails before
    # any fit; it is loaded and scored in the holdout stage.
    incumbent = None if req.incumbent is None else SN.fetch_verified(req.incumbent.artifact, now, clock)
    enc = TR.encode_label(req.task, snap.label)
    roles = np.array(snap.roles)
    dev = np.flatnonzero(roles == "development").astype(np.int64)
    hold = np.flatnonzero(roles == "locked-holdout").astype(np.int64)
    if len(hold) == 0:
        raise TrainerFailure("load-snapshot", "the snapshot has no locked-holdout rows")
    periods = SN.period_ordinals(snap)
    code = code_version.code_version(req.threads, p.seed)
    clock.check("snapshot load")
    if req.task.kind == "forecast":
        return run_forecast(req, snap, enc, code, clock)
    columns, flags = _audited_columns(req, snap, enc, dev, periods)
    clock.check("leakage audit")
    out = TR.select_finalist(p, snap, columns, enc, dev, req.candidates, req.threads, clock, periods)
    if snap.reference_score is not None and enc.family == "binary":
        columns, out, dropped = _reference_rule(req, snap, enc, dev, columns, out, clock, periods)
        flags.extend(dropped)
    return EV.evaluate(req, snap, enc, dev, hold, out, columns, code, clock, flags, incumbent)


def _audited_columns(req: TrainerRequest, snap: SN.Snapshot, enc: TR.EncodedLabel, dev: IntArr,
                     periods: IntArr) -> Tuple[List[encoding.ColumnSpec], List[LeakageFlag]]:
    """The snapshot's feature columns without the source columns the leakage audit flags on the development rows,
    and the audit's flags (see `_dev_audit`).

    Raises:
        TrainerFailure: Stage `inner-cv` when the audit leaves no feature column.
    """
    audit = _dev_audit(req, snap, enc, dev, periods)
    return _without_sources(snap.columns, audit.excluded_sources, "the leakage audit"), list(audit.flags)


def _dev_audit(req: TrainerRequest, snap: SN.Snapshot, enc: TR.EncodedLabel, dev: IntArr,
               periods: IntArr) -> AU.AuditResult:
    """The leakage audit of the snapshot's development rows under the request's protocol (its single-feature ceiling
    and seed). The development rows have time when they span more than one decision period."""
    p = req.protocol
    dev_periods = periods[dev]
    return AU.run_audit(
        snap.frame.iloc[dev].reset_index(drop=True), snap.columns, np.asarray(enc.y)[dev],
        [snap.entity_keys[int(i)] for i in dev], dev_periods, len(set(dev_periods.tolist())) > 1, enc.family,
        p.leakageAudit.singleFeatureHeldOutAucMax, p.seed, len(enc.class_order or []))


def _without_sources(columns: Sequence[encoding.ColumnSpec], excluded: Sequence[str],
                     by: str) -> List[encoding.ColumnSpec]:
    """`columns` without the excluded source columns.

    Raises:
        TrainerFailure: Stage `inner-cv`, naming the excluded sources, when no feature column (identifiers aside)
            remains, since nothing would be left to fit.
    """
    gone = set(excluded)
    kept = [c for c in columns if c.source_column not in gone]
    if not encoding.source_map(kept):
        raise TrainerFailure("inner-cv", f"{by} excluded every feature source column: {sorted(gone)}")
    return kept


def _most_implausible(y_dev: FArr, ref_dev: FArr, out: TR.SelectionOutcome,
                      candidates: List[CandidateSpec]) -> Optional[CandidateSpec]:
    """The candidate whose out-of-fold predictions beat the reference by the most implausible margin (smallest
    one-sided p; request order on a tie), or None when no candidate beats it."""
    y_val, ref_val = y_dev[out.validated], ref_dev[out.validated]
    beaten: List[Tuple[float, int, CandidateSpec]] = []
    for i, c in enumerate(candidates):
        leaky, p_value = AU.beats_reference(y_val, out.cv[c.name].oof, ref_val)
        if leaky:
            beaten.append((p_value, i, c))
    return min(beaten, key=lambda t: (t[0], t[1]))[2] if beaten else None


def _explaining_columns(req: TrainerRequest, snap: SN.Snapshot, enc: TR.EncodedLabel, dev: IntArr,
                        columns: List[encoding.ColumnSpec], out: TR.SelectionOutcome, spec: CandidateSpec,
                        y_dev: FArr, ref_dev: FArr, clock: RunClock) -> List[DropColumnFlag]:
    """Drop-column trials: `spec` cross-validated on `out`'s folds without each source column in turn (no refit);
    a source whose removal alone makes it plausible is flagged with the loss increase its removal causes."""
    y_val, ref_val = y_dev[out.validated], ref_dev[out.validated]
    base_loss = float(np.mean(out.cv[spec.name].row_loss))
    flags: List[DropColumnFlag] = []
    for src in sorted(encoding.source_map(columns)):
        kept = [c for c in columns if c.source_column != src]
        if not encoding.source_map(kept):
            continue   # no feature column would remain: removing the only source explains nothing
        trial = TR.cross_validate(req.protocol, snap, kept, enc, dev, spec, req.threads, clock, out)
        if not AU.beats_reference(y_val, trial.oof, ref_val)[0]:
            flags.append(DropColumnFlag(kind="drop-column", sourceColumn=src,
                                        scoreDrop=float(np.mean(trial.row_loss)) - base_loss))
    return flags


def _reference_rule(req: TrainerRequest, snap: SN.Snapshot, enc: TR.EncodedLabel, dev: IntArr,
                    columns: List[encoding.ColumnSpec], out: TR.SelectionOutcome, clock: RunClock,
                    periods: IntArr) -> Tuple[List[encoding.ColumnSpec], TR.SelectionOutcome, List[LeakageFlag]]:
    """The implausible-gain rule. When a candidate's out-of-fold predictions beat the planted reference score by an
    implausible margin (`audit.beats_reference`), the source columns whose removal alone makes that candidate
    plausible again are flagged (`drop-column`) and excluded, and selection runs again. If no single column explains
    the gain, or a candidate still beats the reference after the exclusion, the run fails.

    Raises:
        TrainerFailure: Stage `inner-cv` when the gain is not explained by single columns, or from selection.
    """
    y_dev = np.asarray(enc.y, dtype=np.float64)[dev]
    ref_dev = np.asarray(snap.reference_score, dtype=np.float64)[dev]
    spec = _most_implausible(y_dev, ref_dev, out, list(req.candidates))
    if spec is None:
        return columns, out, []
    explaining = _explaining_columns(req, snap, enc, dev, columns, out, spec, y_dev, ref_dev, clock)
    if not explaining:
        raise TrainerFailure("inner-cv", f"candidate '{spec.name}' beats the reference score by an implausible margin "
                                         f"(paired DeLong p < {AU.REFERENCE_P}) and no single source column explains it")
    gone = sorted(f.sourceColumn for f in explaining)
    columns = _without_sources(columns, gone, "the implausible-gain rule")
    out = TR.select_finalist(req.protocol, snap, columns, enc, dev, req.candidates, req.threads, clock, periods)
    still = _most_implausible(y_dev, ref_dev, out, list(req.candidates))
    if still is not None:
        raise TrainerFailure("inner-cv", f"candidate '{still.name}' still beats the reference score by an implausible "
                                         f"margin after excluding {gone}")
    return columns, out, list(explaining)
