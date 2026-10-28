"""`run_trainer`: one TrainerRequest -> one TrainerResult. Refusals that mean "this request must not run" raise
RequestRefused (HTTP 400, nothing fitted); every failure after that returns `failed` with its stage and the compute
spent, never partial metrics. One run clock measures the whole run and enforces the timeout and the compute budget.
"""

from __future__ import annotations

import datetime as dt
from typing import List, Union

import numpy as np
from threadpoolctl import threadpool_limits

from . import baselines as BL, code_version, encoding, evaluation as EV, scores, snapshot as SN, trainer as TR
from .failures import RequestRefused, RunClock, TrainerFailure
from .trainer_schemas import TrainerCompleted, TrainerFailed, TrainerRequest

TrainerOutcome = Union[TrainerCompleted, TrainerFailed]


def refuse_invalid(req: TrainerRequest) -> None:
    """Refuse a request that must not run at all.

    Raises:
        RequestRefused: For a primary score of another family than the task, a request seed other than the
            protocol's, duplicate candidate names, a candidate named as a gate member (or with the heuristic prefix),
            a candidate on a baseline-only driver, or a holdout kind that does not fit the task.
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
    snap = SN.load(req, dt.datetime.now(dt.timezone.utc), clock)
    enc = TR.encode_label(req.task, snap.label)
    roles = np.array(snap.roles)
    dev = np.flatnonzero(roles == "development").astype(np.int64)
    hold = np.flatnonzero(roles == "locked-holdout").astype(np.int64)
    if len(hold) == 0:
        raise TrainerFailure("load-snapshot", "the snapshot has no locked-holdout rows")
    periods = SN.period_ordinals(snap)
    code = code_version.code_version(req.threads, p.seed)
    clock.check("snapshot load")
    columns: List[encoding.ColumnSpec] = list(snap.columns)
    out = TR.select_finalist(p, snap, columns, enc, dev, req.candidates, req.threads, clock, periods)
    return EV.evaluate(req, snap, enc, dev, hold, out, columns, code, clock, [])
