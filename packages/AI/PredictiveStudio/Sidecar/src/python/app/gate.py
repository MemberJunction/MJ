"""The publishing gate's decision table, with the evaluation protocol's margin.

`gate_decision`, `GATE_OUTCOMES`, `GATE_BRANCHES` and `NO_SIMPLE_SIGNAL_NOTE` are transcribed from the reference
pipeline's gate. "Beats" means the lower bound of the paired interval of (comparator loss - candidate loss) on the
same holdout rows is above `margin`; margin 0 is the reference pipeline's rule.

The engine recomputes the decision in TypeScript (`GateRules.DecideGate`), which is authoritative for the stored
outcome; the sidecar uses this decision only to choose the artifacts it returns and to report `TrainerResult.gate`.
Keep the two decision tables identical.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Literal, Mapping, Optional, Sequence, Tuple

from .array_types import FArr
from .intervals import paired_bootstrap
from .scores import ScoreFn

GateOutcome = Literal["model", "keep-simple-baseline", "no-signal"]
GateBranch = Literal["a:beats-best-simple", "a:Q15-only-model-beats-dummy", "b:keep-simple-baseline", "c:no-signal"]

GATE_OUTCOMES: Tuple[GateOutcome, ...] = ("model", "keep-simple-baseline", "no-signal")
GATE_BRANCHES: Tuple[GateBranch, ...] = (
    "a:beats-best-simple", "a:Q15-only-model-beats-dummy", "b:keep-simple-baseline", "c:no-signal")
NO_SIMPLE_SIGNAL_NOTE = "no simple baseline carries demonstrable signal"


def gate_decision(model_beats_dummy: bool, model_beats_best: bool, member_beats_dummy: Dict[str, bool],
                  scores: Dict[str, float], delivered_member: Optional[str]
                  ) -> Tuple[GateOutcome, GateBranch, Optional[str]]:
    """Returns (outcome, branch, shipped simple member or None). Every input maps to exactly one branch."""
    eligible = [k for k in sorted(member_beats_dummy) if member_beats_dummy[k]]
    if delivered_member is None and model_beats_dummy and model_beats_best:
        return "model", "a:beats-best-simple", None
    if model_beats_dummy and not eligible:
        return "model", "a:Q15-only-model-beats-dummy", None
    if eligible:
        return "keep-simple-baseline", "b:keep-simple-baseline", min(eligible, key=lambda k: (scores[k], k))
    return "no-signal", "c:no-signal", None


@dataclass(frozen=True)
class GateRecord:
    """The contract's GateDecision (shipped name, shipped role, note) built from `gate_decision`."""

    outcome: GateOutcome
    branch: GateBranch
    shipped: Optional[str]
    shipped_role: Optional[Literal["model", "simpleBaseline"]]
    note: Optional[str]


def gate_record(model_name: str, model_beats_dummy: bool, model_beats_best: bool,
                member_beats_dummy: Mapping[str, bool], member_scores: Mapping[str, float],
                delivered_member: Optional[str]) -> GateRecord:
    outcome, branch, member = gate_decision(model_beats_dummy, model_beats_best, dict(member_beats_dummy),
                                            dict(member_scores), delivered_member)
    if outcome == "model":
        note = NO_SIMPLE_SIGNAL_NOTE if branch == "a:Q15-only-model-beats-dummy" else None
        return GateRecord(outcome, branch, model_name, "model", note)
    if outcome == "keep-simple-baseline":
        return GateRecord(outcome, branch, member, "simpleBaseline", None)
    return GateRecord(outcome, branch, None, None, None)


@dataclass(frozen=True)
class Paired:
    value: float
    lower: float
    upper: float
    draws: int
    beats: bool


@dataclass(frozen=True)
class GateRun:
    decision: GateRecord
    comparisons: Dict[str, Paired]
    member_scores: Dict[str, float]
    best_simple: Optional[str]


def run_gate(y: FArr, fn: ScoreFn, model_name: str, model: FArr, dummy: FArr, simple: Sequence[Tuple[str, FArr]],
             delivered_member: Optional[str], margin: float, resamples: int, seed: int,
             groups: Optional[Sequence[str]], level: float) -> GateRun:
    """Runs every paired comparison and the gate. `beats` is `lower > margin` (False when the interval is NaN)."""

    def pb(base: FArr, cand: FArr) -> Paired:
        r = paired_bootstrap(y, base, cand, fn, n=resamples, seed=seed, groups=groups, level=level)
        return Paired(r.value, r.lower, r.upper, r.draws, r.lower > margin)

    scores = {nm: fn(y, p) for nm, p in simple}
    comparisons: Dict[str, Paired] = {"modelVsDummy": pb(dummy, model)}
    for nm, p in simple:
        comparisons[f"{nm}VsDummy"] = pb(dummy, p)
        comparisons[f"modelVs:{nm}"] = pb(p, model)
    best = min(sorted(scores), key=lambda k: scores[k]) if scores else None
    member_beats = {nm: comparisons[f"{nm}VsDummy"].beats for nm, _ in simple}
    beats_best = best is not None and comparisons[f"modelVs:{best}"].beats
    decision = gate_record(model_name, comparisons["modelVsDummy"].beats, beats_best, member_beats, scores,
                           delivered_member)
    return GateRun(decision, comparisons, scores, best)
