"""The publishing gate's decision table (transcribed from the reference pipeline's gate), its contract-shaped record
and its runner over paired bootstrap intervals. The engine recomputes the decision in TypeScript, which is
authoritative; this module only chooses the artifacts the sidecar returns."""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Set, Tuple, get_args

import numpy as np
import pytest

from app import gate as G, trainer_schemas as TS
from app.array_types import FArr
from app.scores import ScoreFn

SCORES = {"glm": 0.30, "oneFeature": 0.31}


@pytest.mark.parametrize("beats_dummy,beats_best,members,delivered,expected", [
    (True, True, {"glm": True, "oneFeature": True}, None, ("model", "a:beats-best-simple", "m", None)),
    (True, False, {"glm": False, "oneFeature": False}, None,
     ("model", "a:Q15-only-model-beats-dummy", "m", G.NO_SIMPLE_SIGNAL_NOTE)),
    (True, False, {"glm": True, "oneFeature": True}, None, ("keep-simple-baseline", "b:keep-simple-baseline", "glm", None)),
    (True, True, {"glm": True, "oneFeature": True}, "glm", ("keep-simple-baseline", "b:keep-simple-baseline", "glm", None)),
    (False, False, {"glm": False, "oneFeature": False}, None, ("no-signal", "c:no-signal", None, None)),
])
def test_gate_record_table(beats_dummy: bool, beats_best: bool, members: Dict[str, bool], delivered: Optional[str],
                           expected: Tuple[str, str, Optional[str], Optional[str]]) -> None:
    d = G.gate_record("m", beats_dummy, beats_best, members, SCORES, delivered)
    assert (d.outcome, d.branch, d.shipped, d.note) == expected


def test_gate_decision_is_refpipes_tuple_form() -> None:
    assert G.gate_decision(True, False, {"glm": True, "oneFeature": True}, SCORES, None) == (
        "keep-simple-baseline", "b:keep-simple-baseline", "glm")
    assert G.gate_decision(True, True, {"glm": True}, {"glm": 0.3}, None) == ("model", "a:beats-best-simple", None)
    assert G.GATE_OUTCOMES == ("model", "keep-simple-baseline", "no-signal")
    assert len(G.GATE_BRANCHES) == 4


def test_vocabularies_equal_the_wire_models_and_the_literals() -> None:
    wire = (TS.GateModel, TS.GateKeepSimple, TS.GateNoSignal)
    outcomes: List[str] = []
    branches: List[str] = []
    for m in wire:
        outcomes += get_args(m.model_fields["outcome"].annotation)
        branches += get_args(m.model_fields["branch"].annotation)
    assert set(G.GATE_OUTCOMES) == set(outcomes) and len(outcomes) == len(G.GATE_OUTCOMES)
    assert set(G.GATE_BRANCHES) == set(branches) and len(branches) == len(G.GATE_BRANCHES)
    assert set(G.GATE_OUTCOMES) == set(get_args(G.GateOutcome))
    assert set(G.GATE_BRANCHES) == set(get_args(G.GateBranch))
    assert G.NO_SIMPLE_SIGNAL_NOTE in get_args(TS.GateModel.model_fields["note"].annotation)[0].__args__


# ---------------------------------------------------------------------------------------------- run_gate -------

def _mse(y: FArr, p: FArr) -> float:
    return float(np.mean((y - p) ** 2))


def _nan_score(y: FArr, p: FArr) -> float:
    return float("nan")


def _data() -> Tuple[FArr, FArr, FArr, FArr, FArr]:
    rng = np.random.default_rng(7)
    n = 300
    y = rng.normal(0.0, 1.0, n)
    dummy = np.full(n, float(y.mean()))
    model = y + rng.normal(0.0, 0.3, n)
    glm = y + rng.normal(0.0, 0.6, n)
    one = y + rng.normal(0.0, 0.9, n)
    return y, dummy, model, glm, one


def _run(margin: float = 0.0, simple_names: Tuple[str, ...] = ("glm", "oneFeature"),
         fn: ScoreFn = _mse) -> G.GateRun:
    y, dummy, model, glm, one = _data()
    arrs = {"glm": glm, "oneFeature": one}
    simple = [(nm, arrs[nm]) for nm in simple_names]
    return G.run_gate(y, fn, "m", model, dummy, simple, None, margin, 200, 11, None, 0.95)


def test_run_gate_comparison_keys() -> None:
    run = _run()
    assert set(run.comparisons) == {"modelVsDummy", "glmVsDummy", "oneFeatureVsDummy", "modelVs:glm",
                                    "modelVs:oneFeature"}
    assert run.best_simple == "glm"
    assert set(run.member_scores) == {"glm", "oneFeature"}
    assert run.comparisons["modelVsDummy"].draws == 200
    assert run.decision.outcome == "model" and run.decision.branch == "a:beats-best-simple"


def test_beats_is_lower_bound_above_margin() -> None:
    base = _run(0.0).comparisons["modelVsDummy"]
    assert base.beats and base.lower > 0
    above = _run(base.lower + 0.01).comparisons["modelVsDummy"]
    assert above.lower == base.lower and not above.beats


def test_empty_simple_set_with_model_beating_dummy() -> None:
    run = _run(simple_names=())
    assert run.best_simple is None and run.member_scores == {}
    assert set(run.comparisons) == {"modelVsDummy"}
    assert (run.decision.outcome, run.decision.branch) == ("model", "a:Q15-only-model-beats-dummy")
    assert run.decision.note == G.NO_SIMPLE_SIGNAL_NOTE
    assert run.decision.shipped == "m" and run.decision.shipped_role == "model"


def test_nan_interval_is_not_beats() -> None:
    run = _run(fn=_nan_score)
    c = run.comparisons["modelVsDummy"]
    assert math.isnan(c.lower) and c.draws == 0 and not c.beats
    assert run.decision.outcome == "no-signal"
