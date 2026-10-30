"""The reference pipeline's `truthsuite.refpipe.run.gate_decision` equals the TypeScript gate (`GateRules.DecideGate` and
`GateRules.GateInputsFromIntervals`, built Core) on seeded cases; the shared body is the sidecar's
tests/tools/gate_parity.py, imported by putting the sidecar's python root on the path.

Run `cd packages/AI/PredictiveStudio/Core && pnpm run build` first: the cases come from the built Core.
Expected: 0 mismatches at seed 7 x 5,000 and seed 424242 x 20,000, and every branch exercised in each loop.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SIDECAR_PYTHON_ROOT = Path(__file__).resolve().parents[3] / "Sidecar" / "src" / "python"
sys.path.append(str(SIDECAR_PYTHON_ROOT))

from tests.tools.gate_parity import check_decision_loop, check_interval_loop  # noqa: E402
from truthsuite.refpipe.run import GATE_BRANCHES, gate_decision  # noqa: E402


@pytest.mark.parametrize(("seed", "n"), [(7, 5000), (424242, 20000)])
def test_decide_gate_matches_reference(seed: int, n: int) -> None:
    check_decision_loop(seed, n, gate_decision, GATE_BRANCHES)


@pytest.mark.parametrize(("seed", "n"), [(7, 5000), (424242, 20000)])
def test_gate_inputs_from_intervals_matches_reference(seed: int, n: int) -> None:
    check_interval_loop(seed, n, gate_decision, GATE_BRANCHES)
