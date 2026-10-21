# tests/test_manifest.py — the rolling-origin accessor reads P2 planted series and P3 real series alike.
from __future__ import annotations
import json
import pytest
from truthsuite import paths
from truthsuite.scenarios.manifest import RollingOrigin, rolling_origin

def test_p2_planted_location() -> None:
    m = json.loads((paths.seed_dir("scenario", "T1p", 2206) / "manifest.json").read_text())
    assert rolling_origin(m) == RollingOrigin(K=12, H=12, firstTestPeriod=96)

def test_p3_real_top_level_location() -> None:
    m = json.loads(paths.real_fixture("T1-real.manifest.json").read_text())
    assert m["planted"] is None
    ro = rolling_origin(m)
    assert ro == RollingOrigin(K=5, H=12, firstTestPeriod=31)
    assert ro.firstTestPeriod == m["nRows"] - ro.K * ro.H

def test_same_field_names_as_p2() -> None:
    p2 = json.loads((paths.seed_dir("scenario", "T1p", 2206) / "manifest.json").read_text())["planted"]["rollingOrigin"]
    p3 = json.loads(paths.real_fixture("T1-real.manifest.json").read_text())["rollingOrigin"]
    assert sorted(p2) == sorted(p3) == ["H", "K", "firstTestPeriod"]

def test_missing_or_ambiguous_raises() -> None:
    with pytest.raises(KeyError):
        rolling_origin({"planted": None})
    ro = {"K": 1, "H": 12, "firstTestPeriod": 10}
    with pytest.raises(ValueError):
        rolling_origin({"planted": {"rollingOrigin": ro}, "rollingOrigin": ro})
