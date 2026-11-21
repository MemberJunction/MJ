from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from truthsuite import paths

REFERENCE_IDS = ["C1", "C2", "C2-shuffled", "C3", "C4", "R1", "R2-real", "R2p", "R3", "T2p"]
SUMMARY_KEYS = ["branch", "ci", "nTest", "outcome", "score", "selected", "sha256", "value"]


def _golden() -> dict[str, dict[str, object]]:
    raw: dict[str, dict[str, object]] = json.loads((paths.FIXTURES / "reference" / "p5-golden.json").read_text(encoding="utf-8"))
    return raw


def test_the_committed_summary_holds_ten_reference_ids_with_eight_keys() -> None:
    golden = _golden()
    assert sorted(golden) == sorted(REFERENCE_IDS)
    assert all(sorted(entry) == SUMMARY_KEYS for entry in golden.values())


def test_the_reference_pipeline_reproduces_the_committed_c1_summary(tmp_path: Path) -> None:
    out = tmp_path / "C1.json"
    subprocess.run([sys.executable, "-m", "truthsuite.refpipe.run", "C1", "--out", str(out)], check=True,
                   cwd=paths.PACKAGE_ROOT / "python", env={**os.environ, "PYTHONHASHSEED": "0"})
    got = json.loads(out.read_text(encoding="utf-8"))
    want = _golden()["C1"]
    ps = got["primaryScore"]
    assert got["selected"] == want["selected"]
    assert ps["name"] == want["score"]
    assert abs(round(float(ps["value"]), 10) - float(str(want["value"]))) <= 1e-9
    want_ci = want["ci"]
    assert isinstance(want_ci, list) and len(want_ci) == 2
    assert all(abs(round(float(a), 10) - float(str(b))) <= 1e-9 for a, b in zip(ps["ci"], want_ci, strict=True))
    assert ps["nTest"] == want["nTest"]
    assert got["gateOutcome"] == want["outcome"]
    assert got["gate"]["branch"] == want["branch"]
    assert got["source"]["sha256"] == want["sha256"]
