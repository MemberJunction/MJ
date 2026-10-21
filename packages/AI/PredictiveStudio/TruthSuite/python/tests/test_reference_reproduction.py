"""The ported reference pipeline reproduces the review's 18 committed results (+ the two shuffled-label controls)."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from truthsuite.paths import FIXTURES

GOLDEN: dict[str, dict[str, object]] = json.loads((FIXTURES / "reference" / "p5-golden.json").read_text())
IDS = sorted(GOLDEN)


@pytest.mark.slow
@pytest.mark.parametrize("ref_id", IDS)
def test_reference_result_reproduces(ref_id: str, tmp_path: Path) -> None:
    sid, shuffled = (ref_id.removesuffix("-shuffled"), ref_id.endswith("-shuffled"))
    out = tmp_path / f"{ref_id}.json"
    cmd = [sys.executable, "-m", "truthsuite.refpipe.run", sid, "--out", str(out)] + (["--shuffle-labels"] if shuffled else [])
    subprocess.run(cmd, check=True, cwd=Path(__file__).resolve().parents[1])
    got = json.loads(out.read_text())
    want = GOLDEN[ref_id]
    assert got["selected"] == want["selected"]
    assert got["primaryScore"]["name"] == want["score"]
    assert round(got["primaryScore"]["value"], 10) == pytest.approx(want["value"], abs=1e-9)
    assert [round(x, 10) for x in got["primaryScore"]["ci"]] == pytest.approx(want["ci"], abs=1e-9)
    assert got["primaryScore"]["nTest"] == want["nTest"]
    assert got["gateOutcome"] == want["outcome"]
    assert got["gate"]["branch"] == want["branch"]
    assert got["source"]["sha256"] == want["sha256"]
