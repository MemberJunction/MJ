"""The reference pipeline's `truthsuite.refpipe.run.gate_decision` equals the TypeScript gate (`GateRules.DecideGate` and
`GateRules.GateInputsFromIntervals`, built Core) on seeded cases. The shared body is the sidecar's
tests/tools/gate_parity.py, loaded by file path: it imports only the standard library, so this file puts nothing on
`sys.path` and the sidecar's `app` and `tests` packages stay unimportable from the TruthSuite session.

Run `cd packages/AI/PredictiveStudio/Core && pnpm run build` first: the cases come from the built Core.
Expected: 0 mismatches at seed 7 x 5,000 and seed 424242 x 20,000, and every branch exercised in each loop.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import TYPE_CHECKING

import pytest

from truthsuite.refpipe.run import GATE_BRANCHES, gate_decision

SUPPORT_FILE = Path(__file__).resolve().parents[3] / "Sidecar" / "src" / "python" / "tests" / "tools" / "gate_parity.py"


def _load_support(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("gate_parity_support", path)
    assert spec is not None and spec.loader is not None, f"cannot load the shared parity body from {path}"
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


if TYPE_CHECKING:
    # Typing only: mypy follows this import to check the shared body; at run time it is loaded by path above.
    from tests.tools import gate_parity as support
else:
    support = _load_support(SUPPORT_FILE)


@pytest.mark.parametrize(("seed", "n"), [(7, 5000), (424242, 20000)])
def test_decide_gate_matches_reference(seed: int, n: int) -> None:
    support.check_decision_loop(seed, n, gate_decision, GATE_BRANCHES)


@pytest.mark.parametrize(("seed", "n"), [(7, 5000), (424242, 20000)])
def test_gate_inputs_from_intervals_matches_reference(seed: int, n: int) -> None:
    support.check_interval_loop(seed, n, gate_decision, GATE_BRANCHES)
