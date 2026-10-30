"""Shared body of the gate parity tests.

The TypeScript `GateRules.DecideGate` / `GateRules.GateInputsFromIntervals` (`@memberjunction/predictive-studio-core`,
built `dist`) decide seeded random gate inputs through a Node script (`scripts/gate-parity-cases.mjs`: same LCG, same
draws, same order as the reference generator). Each Python gate under test recomputes every decision, and every interval
boolean as `lower > margin`; the two must agree on every case, and every branch must be hit in each loop.

This module imports only the standard library (each caller injects its gate), so the TruthSuite test can load it by
file path without putting the sidecar's `app` or `tests` packages on the import path. Both gates are compared from here: the sidecar's `app.gate.gate_decision` (tests/test_gate_parity.py, sidecar venv)
and the reference pipeline's `truthsuite.refpipe.run.gate_decision` (the TruthSuite package's
tests/test_gate_parity_refpipe.py, TruthSuite venv). Each caller supplies only its `gate_decision` and `GATE_BRANCHES`.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from collections import Counter
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import TypedDict

SIDECAR_ROOT = Path(__file__).resolve().parents[3].parent
SCRIPT = SIDECAR_ROOT / "scripts" / "gate-parity-cases.mjs"
CORE_ENTRY = SIDECAR_ROOT / "node_modules" / "@memberjunction" / "predictive-studio-core" / "dist" / "index.js"

GateDecisionFn = Callable[[bool, bool, dict[str, bool], dict[str, float], str | None], tuple[str, str, str | None]]


class CaseInputs(TypedDict):
    modelName: str
    modelBeatsDummy: bool
    modelBeatsBestSimple: bool
    memberBeatsDummy: dict[str, bool]
    memberScores: dict[str, float]
    deliveredMember: str | None


class Case(TypedDict):
    i: CaseInputs
    g: list[str | None]


class StoredIv(TypedDict):
    value: float
    lower: float
    upper: float


class Stored(TypedDict):
    modelName: str
    modelVsDummy: StoredIv
    modelVsBestSimple: StoredIv | None
    memberVsDummy: dict[str, StoredIv]
    memberScores: dict[str, float]
    deliveredMember: str | None


class IntervalCase(TypedDict):
    s: Stored
    margin: float
    b: list[bool | dict[str, bool]]
    g: list[str | None]


class Cases(TypedDict):
    out: list[Case]
    iv: list[IntervalCase]


def load_cases(seed: int, n: int) -> Cases:
    node = shutil.which("node")
    assert node is not None, "node is required: the TypeScript side of the parity check runs under Node"
    assert CORE_ENTRY.exists(), (
        f"the built Core is missing ({CORE_ENTRY}): run `cd packages/AI/PredictiveStudio/Core && pnpm run build` first"
    )
    done = subprocess.run([node, str(SCRIPT), str(seed), str(n)], check=False, capture_output=True, text=True, cwd=SIDECAR_ROOT)
    assert done.returncode == 0, (
        "the case generator failed (a stale Core build lacks the gate: run "
        f"`cd packages/AI/PredictiveStudio/Core && pnpm run build`):\n{done.stderr}"
    )
    data: Cases = json.loads(done.stdout)
    return data


def _assert_all_branches(branches: Counter[str], expected: Sequence[str], loop: str) -> None:
    missing = [b for b in expected if branches[b] == 0]
    assert not missing, f"{loop} loop never reached branches {missing}; counts {dict(branches)}"


def check_decision_loop(seed: int, n: int, gate_decision: GateDecisionFn, gate_branches: Sequence[str]) -> None:
    """Every TypeScript decision of the decision-table loop equals the Python gate's, and every branch is reached."""
    cases = load_cases(seed, n)
    assert len(cases["out"]) == n
    branches: Counter[str] = Counter()
    for k in cases["out"]:
        i = k["i"]
        py = list(gate_decision(i["modelBeatsDummy"], i["modelBeatsBestSimple"], i["memberBeatsDummy"], i["memberScores"], i["deliveredMember"]))
        branches[str(py[1])] += 1
        assert py == k["g"], f"first differing decision case: inputs {i}, Python {py}, TypeScript {k['g']}"
    _assert_all_branches(branches, gate_branches, "decision")


def check_interval_loop(seed: int, n: int, gate_decision: GateDecisionFn, gate_branches: Sequence[str]) -> None:
    """Every TypeScript interval-derived input and decision equals `lower > margin` fed to the Python gate, and every branch is reached."""
    cases = load_cases(seed, n)
    assert len(cases["iv"]) == n
    branches: Counter[str] = Counter()
    for k in cases["iv"]:
        s, mg = k["s"], k["margin"]
        mbd = s["modelVsDummy"]["lower"] > mg
        best = s["modelVsBestSimple"]
        mbs = best is not None and best["lower"] > mg
        memb = {m: v["lower"] > mg for m, v in s["memberVsDummy"].items()}
        py = list(gate_decision(mbd, mbs, memb, s["memberScores"], s["deliveredMember"]))
        branches[str(py[1])] += 1
        derived: list[bool | dict[str, bool]] = [mbd, mbs, memb]
        assert derived == k["b"], f"first differing interval-derived inputs: case {k['s']}, margin {mg}, Python {derived}, TypeScript {k['b']}"
        assert py == k["g"], f"first differing interval decision: case {k['s']}, margin {mg}, Python {py}, TypeScript {k['g']}"
    _assert_all_branches(branches, gate_branches, "interval")
