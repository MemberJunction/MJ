from __future__ import annotations

import json
from pathlib import Path

import pytest

from truthsuite import paths
from truthsuite.refpipe import run


def _seed(root: Path, key: str) -> Path:
    d = root / key.replace("/seed-", "/0123456789ab/seed-")
    d.mkdir(parents=True)
    (d / ".complete").write_text("0123456789ab\n", encoding="utf-8")
    return d


def test_a_derived_scenario_resolves_its_cache_directory_by_its_source_spec_seed(tmp_path: Path,
                                                                                 monkeypatch: pytest.MonkeyPatch) -> None:
    t3_seed = int(json.loads((paths.FIXTURES / "scenarios" / "specs" / "T3.json").read_text(encoding="utf-8"))["seed"])
    entries = {k: _seed(tmp_path, k) for k in (f"scenario/T3/seed-{t3_seed}", f"scenario/T3-lag/seed-{t3_seed}")}
    (tmp_path / "index.json").write_text(json.dumps({k: str(v) for k, v in entries.items()}), encoding="utf-8")
    monkeypatch.setenv("TRUTH_DATA_DIR", str(tmp_path))
    lag_dir = entries[f"scenario/T3-lag/seed-{t3_seed}"]
    assert paths.spec_seed_dir("T3-lag") == lag_dir
    assert run._scenario_files("T3-lag") == (lag_dir / "rows.csv", lag_dir / "manifest.json")
    assert paths.spec_seed_dir("T3") == entries[f"scenario/T3/seed-{t3_seed}"]
