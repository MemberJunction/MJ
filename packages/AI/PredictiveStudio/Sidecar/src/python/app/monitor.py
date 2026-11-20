"""Monitor procedure M (Ruling Q24; plan §5, D4-05, D4-11): input drift with false-discovery control.

The reference window is the model's training window; there is one look per monitored period. At a look each input gets
a z statistic against the reference, a two-sided empirical p-value from seeded no-drift replays at that look
(``(1 + #{|z_null| >= |z|}) / (1 + replays)``), and Benjamini-Hochberg runs across the look's inputs at level q(L). An
alarm is any rejection at any look. q(L) is the largest level whose any-alarm rate over L looks is at most the target
(0.05); ``calibrate_q`` finds it by bisection on seeded replays. A drift alarm is recorded and starts nothing (S8.4).

The no-drift replays per input kind:
  * ``mean`` — ``z = (mean(current) - mean(reference)) / (sd(reference) * sqrt(1/n_current + 1/n_reference))``; the
    replays draw both means from their normal-theory sampling distributions under no drift (the reference mean is
    shared by every look of a replay, as in the D1c design).
  * ``proportion`` — 0/1 values, the pooled two-proportion z; the replays draw binomial counts at the reference rate.
  * ``series`` — one value per look; ``z = (value - mean(reference)) / sd(reference)``; the replays are a stationary
    AR(1) with the reference's lag-1 autocorrelation (Kendall bias-corrected, clipped to [-0.99, 0.99]); look k is the
    k-th value after the reference window (the T4 design).

Wire shapes are the camelCase ``Monitor*`` types of ``Core/src/sidecar-contract.ts``. Every model is frozen and forbids
unknown keys, so a request outside the contract is a 422. numpy only (D4-11).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Annotated, Dict, Final, List, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .array_types import FArr

# The documented q(L) of the two gate designs (plan §5, `logs/P12/qcal/verify_q.txt`): T4 at L = 12 and D1c at L = 3,
# each calibrated on a >= 4M-replay null and checked on an independent one.
Q_BY_LOOKS: Final[Dict[int, float]] = {12: 0.0095, 3: 0.0171}

MIN_REPLAYS: Final = 100
MAX_REPLAYS: Final = 100_000
MAX_LOOKS: Final = 120
BISECTION_STEPS: Final = 40
MAX_AUTOCORRELATION: Final = 0.99

InputKind = Literal["mean", "proportion", "series"]
Name = Annotated[str, StringConstraints(min_length=1)]
Replays = Annotated[int, Field(ge=MIN_REPLAYS, le=MAX_REPLAYS)]
Seed = Annotated[int, Field(ge=0)]
Level = Annotated[float, Field(gt=0.0, lt=1.0)]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)


# ------------------------------------------------------------------------------------------- the input rules -----

@dataclass(frozen=True)
class InputSpec:
    """One input's reference summary: everything its z statistic and its no-drift replays need."""

    kind: InputKind
    n_reference: int
    look_size: int
    mean: float
    sd: float
    autocorrelation: float

    @staticmethod
    def of(kind: InputKind, reference: FArr, look_size: int) -> InputSpec:
        """Summarise a reference window. Raises ValueError for a window the kind cannot test: too short, a
        proportion with a value other than 0 or 1, no variation, or a series looked at more than one row at a time."""
        minimum = 3 if kind == "series" else 2
        if reference.shape[0] < minimum:
            raise ValueError(f"a {kind} input needs at least {minimum} reference values")
        if kind == "proportion" and not np.isin(reference, (0.0, 1.0)).all():
            raise ValueError("a proportion input's values must be 0 or 1")
        if kind == "series" and look_size != 1:
            raise ValueError("a series input has exactly one value per look")
        sd = float(reference.std(ddof=1))
        if not sd > 0.0:
            raise ValueError("the reference window has no variation, so the z statistic is undefined")
        return InputSpec(kind, int(reference.shape[0]), look_size, float(reference.mean()), sd,
                         _autocorrelation(reference) if kind == "series" else 0.0)

    def z(self, current: FArr) -> float:
        """The look's z statistic for `current` (the look's rows; a series look is one value)."""
        if self.kind == "series":
            return (float(current[0]) - self.mean) / self.sd
        if self.kind == "proportion":
            look_rate = float(current.mean())
            pool = (look_rate * current.shape[0] + self.mean * self.n_reference) / (current.shape[0] + self.n_reference)
            denom = math.sqrt(pool * (1 - pool) * (1 / current.shape[0] + 1 / self.n_reference))
            return 0.0 if denom == 0.0 else (look_rate - self.mean) / denom
        se = self.sd * math.sqrt(1 / current.shape[0] + 1 / self.n_reference)
        return (float(current.mean()) - self.mean) / se


def _autocorrelation(reference: FArr) -> float:
    """The reference's lag-1 autocorrelation with Kendall's bias correction (r + (1 + 3r) / n), clipped so the
    stationary AR(1) the replays draw exists."""
    d = reference - reference.mean()
    r = float((d[1:] * d[:-1]).sum() / (d * d).sum())
    corrected = r + (1 + 3 * r) / reference.shape[0]
    return max(-MAX_AUTOCORRELATION, min(MAX_AUTOCORRELATION, corrected))


def replay_z(spec: InputSpec, rng: np.random.Generator, replays: int, looks: int) -> FArr:
    """`replays` no-drift replays of the input's z at looks 1..`looks`, shape (replays, looks)."""
    if spec.kind == "series":
        return _series_replay(spec, rng, replays, looks)
    if spec.kind == "proportion":
        ref = rng.binomial(spec.n_reference, spec.mean, replays) / spec.n_reference
        cur = rng.binomial(spec.look_size, spec.mean, (replays, looks)) / spec.look_size
        pool = (cur * spec.look_size + ref[:, None] * spec.n_reference) / (spec.look_size + spec.n_reference)
        denom = np.sqrt(pool * (1 - pool) * (1 / spec.look_size + 1 / spec.n_reference))
        safe = np.where(denom > 0.0, denom, 1.0)
        out: FArr = np.where(denom > 0.0, (cur - ref[:, None]) / safe, 0.0)
        return out
    ref_mean = rng.normal(0.0, math.sqrt(1 / spec.n_reference), replays)
    cur_mean = rng.normal(0.0, math.sqrt(1 / spec.look_size), (replays, looks))
    z: FArr = (cur_mean - ref_mean[:, None]) / math.sqrt(1 / spec.look_size + 1 / spec.n_reference)
    return z


def _series_replay(spec: InputSpec, rng: np.random.Generator, replays: int, looks: int) -> FArr:
    """A stationary AR(1) per replay (unit innovations; z is scale-free): the reference window's mean and SD, then the
    z of each of the next `looks` values."""
    phi = spec.autocorrelation
    e = rng.normal(0.0, 1 / math.sqrt(1 - phi * phi), replays)
    total = np.zeros(replays)
    squares = np.zeros(replays)
    for t in range(spec.n_reference):
        if t > 0:
            e = phi * e + rng.normal(0.0, 1.0, replays)
        total += e
        squares += e * e
    mean = total / spec.n_reference
    sd = np.sqrt((squares - spec.n_reference * mean * mean) / (spec.n_reference - 1))
    out = np.empty((replays, looks))
    for k in range(looks):
        e = phi * e + rng.normal(0.0, 1.0, replays)
        out[:, k] = (e - mean) / sd
    return out


def empirical_p(z: float, null: FArr) -> float:
    """The two-sided empirical p of `z` against the no-drift replays `null`: (1 + #{|null| >= |z|}) / (1 + N)."""
    return float((1 + int((np.abs(null) >= abs(z)).sum())) / (1 + null.shape[0]))


def _empirical_p_many(z: FArr, null: FArr) -> FArr:
    """`empirical_p` of each element of `z` against one null, by binary search on the sorted |null|."""
    srt = np.sort(np.abs(null))
    ge = srt.shape[0] - np.searchsorted(srt, np.abs(z), side="left")
    out: FArr = (1 + ge) / (1 + srt.shape[0])
    return out


def bh_adjust(p: FArr) -> FArr:
    """Benjamini-Hochberg adjusted p-values (step-up: min over j >= i of m p_(j) / j, capped at 1), in input order.
    An input is rejected at level q exactly when its adjusted p is at most q."""
    m = p.shape[0]
    order = np.argsort(p, kind="stable")
    scaled = p[order] * m / np.arange(1, m + 1)
    adjusted = np.minimum(np.minimum.accumulate(scaled[::-1])[::-1], 1.0)
    out = np.empty(m)
    out[order] = adjusted
    return out


# ------------------------------------------------------------------------------------------------- wire shapes -----

class _InputBase(_Frozen):
    name: Name
    kind: InputKind
    reference: List[float]


class DriftInput(_InputBase):
    """`MonitorDriftInput`: one input's training-window values and this period's values."""

    current: Annotated[List[float], Field(min_length=1)]

    @model_validator(mode="after")
    def _testable(self) -> DriftInput:
        spec = InputSpec.of(self.kind, np.asarray(self.reference, dtype=np.float64), len(self.current))
        if spec.kind == "proportion" and not np.isin(np.asarray(self.current), (0.0, 1.0)).all():
            raise ValueError(f"input {self.name!r}: a proportion input's values must be 0 or 1")
        return self


class CalibrateInput(_InputBase):
    """`MonitorCalibrateInput`: one input of the design being calibrated and its rows per look."""

    lookSize: Annotated[int, Field(ge=1)]

    @model_validator(mode="after")
    def _testable(self) -> CalibrateInput:
        InputSpec.of(self.kind, np.asarray(self.reference, dtype=np.float64), self.lookSize)
        return self


def _unique_names(names: List[str]) -> None:
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise ValueError(f"input names must be unique; repeated: {duplicates}")


class DriftRequest(_Frozen):
    """`MonitorDriftRequest`: one look of procedure M at level q = q(L)."""

    inputs: Annotated[List[DriftInput], Field(min_length=1)]
    look: Annotated[int, Field(ge=1, le=MAX_LOOKS)]
    q: Level
    replays: Replays
    seed: Seed

    @model_validator(mode="after")
    def _names(self) -> DriftRequest:
        _unique_names([i.name for i in self.inputs])
        return self


class DriftLook(_Frozen):
    """`MonitorDriftLook`: one input's result at one look (an element of `MJ: ML Monitoring Results.DriftLook`)."""

    input: str
    kind: InputKind
    z: float
    p: float
    pAdjusted: float
    q: float
    look: int
    flagged: bool


class DriftResponse(_Frozen):
    """`MonitorDriftResponse`: every input's result in request order and the flagged subset (`[]` = no alarm)."""

    look: int
    q: float
    replays: int
    results: List[DriftLook]
    alarms: List[DriftLook]


class CalibrateRequest(_Frozen):
    """`MonitorCalibrateRequest`: find q(L) for a design over `looks` looks on seeded no-drift replays."""

    inputs: Annotated[List[CalibrateInput], Field(min_length=1)]
    looks: Annotated[int, Field(ge=1, le=MAX_LOOKS)]
    replays: Replays
    seed: Seed
    target: Level

    @model_validator(mode="after")
    def _names(self) -> CalibrateRequest:
        _unique_names([i.name for i in self.inputs])
        return self


class CalibrateResponse(_Frozen):
    """`MonitorCalibrateResponse`: the calibrated q(L) and the calibration replays' any-alarm rate at it."""

    q: float
    looks: int
    replays: int
    target: float
    anyAlarmRate: float


# ------------------------------------------------------------------------------------------------- procedures -----

def drift_look(req: DriftRequest) -> DriftResponse:
    """One look of procedure M: each input's z against its reference, its empirical p against `replays` seeded
    no-drift replays at this look, and BH across the inputs at `q`. Reproducible under `seed`."""
    rng = np.random.default_rng(req.seed)
    zs: List[float] = []
    ps: List[float] = []
    for item in req.inputs:
        spec = InputSpec.of(item.kind, np.asarray(item.reference, dtype=np.float64), len(item.current))
        z = spec.z(np.asarray(item.current, dtype=np.float64))
        null = replay_z(spec, rng, req.replays, req.look if spec.kind == "series" else 1)[:, -1]
        zs.append(z)
        ps.append(empirical_p(z, null))
    adjusted = bh_adjust(np.asarray(ps, dtype=np.float64))
    results = [DriftLook(input=item.name, kind=item.kind, z=z, p=p, pAdjusted=float(a), q=req.q, look=req.look,
                         flagged=bool(a <= req.q))
               for item, z, p, a in zip(req.inputs, zs, ps, adjusted)]
    return DriftResponse(look=req.look, q=req.q, replays=req.replays, results=results,
                         alarms=[r for r in results if r.flagged])


def calibrate_q(req: CalibrateRequest) -> CalibrateResponse:
    """q(L) by bisection: one set of `replays` no-drift replays gives each look's null of z, a second set gives the
    replays the any-alarm rate is measured on; the result is the largest level (to 40 halvings of [0, target]) whose
    rate is at most `target`."""
    rng = np.random.default_rng(req.seed)
    specs = [InputSpec.of(i.kind, np.asarray(i.reference, dtype=np.float64), i.lookSize) for i in req.inputs]
    null = [replay_z(s, rng, req.replays, req.looks) for s in specs]
    cal = [replay_z(s, rng, req.replays, req.looks) for s in specs]
    smallest = _smallest_bh_level(null, cal, req.looks)
    lo, hi = 0.0, req.target
    for _ in range(BISECTION_STEPS):
        mid = (lo + hi) / 2
        if float((smallest <= mid).mean()) <= req.target:
            lo = mid
        else:
            hi = mid
    return CalibrateResponse(q=lo, looks=req.looks, replays=req.replays, target=req.target,
                             anyAlarmRate=float((smallest <= lo).mean()))


def _smallest_bh_level(null: List[FArr], cal: List[FArr], looks: int) -> FArr:
    """Per calibration replay, the smallest level at which BH rejects at any look (min over looks of the smallest
    adjusted p): the replay alarms at level q exactly when this is at most q."""
    m = len(cal)
    out = np.full(cal[0].shape[0], np.inf)
    for k in range(looks):
        p = np.column_stack([_empirical_p_many(c[:, k], n[:, k]) for c, n in zip(cal, null)])
        smallest = (np.sort(p, axis=1) * m / np.arange(1, m + 1)).min(axis=1)
        out = np.minimum(out, smallest)
    return out
