from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from truthsuite import paths
from truthsuite.refpipe import run

_OPEN_UNDER_GUARD = """
import sys
from truthsuite.refpipe import run
run.install_truth_guard()
try:
    open(sys.argv[1], encoding="utf-8").read()
except PermissionError as e:
    print(e)
    raise SystemExit(3)
raise SystemExit(0)
"""


def _world_manifest(root: Path) -> Path:
    """A planted world's manifest where the catalog writes it: <data root>/world/<id>/<hash>/seed-<k>/manifest.json."""
    d = root / "world" / "W9-multiclass" / "0123456789ab" / "seed-42"
    d.mkdir(parents=True)
    (d / "manifest.json").write_text('{"oracle": 0.5}\n', encoding="utf-8")
    return d / "manifest.json"


def test_the_guard_recognises_truth_files_in_the_cache_layout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRUTH_DATA_DIR", str(tmp_path))
    assert run._is_truth_path(str(tmp_path / "world" / "W9-multiclass" / "0123456789ab" / "seed-42" / "manifest.json"))
    assert not run._is_truth_path(str(tmp_path / "scenario" / "C2" / "0123456789ab" / "seed-2201" / "manifest.json"))
    assert run._is_truth_path(str(tmp_path / "scenario" / "C2" / "0123456789ab" / "seed-2201" / "truth.csv"))


def test_the_installed_guard_refuses_to_open_a_world_manifest(tmp_path: Path) -> None:
    manifest = _world_manifest(tmp_path)
    # A separate interpreter: the guard is a process-wide audit hook that cannot be removed once installed.
    done = subprocess.run([sys.executable, "-c", _OPEN_UNDER_GUARD, str(manifest)], cwd=paths.PACKAGE_ROOT / "python",
                          env={**os.environ, "TRUTH_DATA_DIR": str(tmp_path)}, capture_output=True, text=True, check=False)
    assert done.returncode == 3, done.stdout + done.stderr
    assert "PermissionError" not in done.stderr
    assert str(manifest) in done.stdout
