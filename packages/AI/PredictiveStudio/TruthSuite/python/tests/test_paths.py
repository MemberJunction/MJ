from __future__ import annotations

import json
from pathlib import Path

import pytest

from truthsuite import paths


def _cache(root: Path, entries: dict[str, Path]) -> None:
    """A data cache as the catalog writes it: each seed directory with its .complete marker, listed in index.json."""
    for d in entries.values():
        d.mkdir(parents=True)
        (d / ".complete").write_text("0123456789ab\n", encoding="utf-8")
    (root / "index.json").write_text(json.dumps({k: str(v) for k, v in entries.items()}), encoding="utf-8")


def test_seed_dir_reads_the_catalog_index(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    d = tmp_path / "scenario" / "C2" / "0123456789ab" / "seed-2201"
    _cache(tmp_path, {"scenario/C2/seed-2201": d})
    monkeypatch.setenv("TRUTH_DATA_DIR", str(tmp_path))
    assert paths.seed_dir("scenario", "C2", 2201) == d


def test_a_seed_missing_from_the_index_raises_key_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _cache(tmp_path, {"world/W1-signal/seed-42": tmp_path / "world" / "W1-signal" / "0123456789ab" / "seed-42"})
    monkeypatch.setenv("TRUTH_DATA_DIR", str(tmp_path))
    with pytest.raises(KeyError, match="world/W1-signal/seed-43"):
        paths.seed_dir("world", "W1-signal", 43)


def test_an_unfinished_seed_directory_raises_key_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    d = tmp_path / "scenario" / "C2" / "0123456789ab" / "seed-2201"
    d.mkdir(parents=True)
    (tmp_path / "index.json").write_text(json.dumps({"scenario/C2/seed-2201": str(d)}), encoding="utf-8")
    monkeypatch.setenv("TRUTH_DATA_DIR", str(tmp_path))
    with pytest.raises(KeyError, match="complete"):
        paths.seed_dir("scenario", "C2", 2201)


def test_data_root_defaults_to_the_package_cache_and_refuses_a_relative_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TRUTH_DATA_DIR", raising=False)
    assert paths.data_root() == paths.PACKAGE_ROOT / ".data"
    monkeypatch.setenv("TRUTH_DATA_DIR", "relative/cache")
    with pytest.raises(ValueError, match="absolute"):
        paths.data_root()


def test_real_fixture_resolves_committed_files_only() -> None:
    assert paths.real_fixture("person_years.parquet") == paths.FIXTURES / "real" / "person_years.parquet"
    with pytest.raises(FileNotFoundError):
        paths.real_fixture("no-such-case.rows.csv")


def test_spec_seed_reads_the_spec_file_and_a_derived_scenario_uses_its_source_spec() -> None:
    c2 = json.loads((paths.FIXTURES / "scenarios" / "specs" / "C2.json").read_text(encoding="utf-8"))["seed"]
    t3 = json.loads((paths.FIXTURES / "scenarios" / "specs" / "T3.json").read_text(encoding="utf-8"))["seed"]
    assert paths.spec_seed("C2") == c2
    assert paths.spec_seed("T3-lag") == t3


def test_generated_scenario_seeds_lists_the_current_spec_seeds_spec_seed_first(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    current = tmp_path / "scenario" / "C2" / "0123456789ab"
    _cache(tmp_path, {
        "scenario/C2/seed-2201002": current / "seed-2201002",
        "scenario/C2/seed-2201": current / "seed-2201",
        "scenario/C2/seed-2201001": current / "seed-2201001",
        "scenario/C2/seed-42": tmp_path / "scenario" / "C2" / "ba9876543210" / "seed-42",  # an older spec's seed
        "scenario/C4/seed-2202": tmp_path / "scenario" / "C4" / "0123456789ab" / "seed-2202",
    })
    (current / "seed-2201002" / ".complete").unlink()  # an unfinished seed is not a generated one
    monkeypatch.setenv("TRUTH_DATA_DIR", str(tmp_path))
    assert paths.generated_scenario_seeds("C2") == [2201, 2201001]
