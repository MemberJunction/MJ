from __future__ import annotations

import hashlib

from truthsuite import paths


def test_every_real_case_file_matches_its_recorded_sha256() -> None:
    real = paths.FIXTURES / "real"
    rows = [line.split() for line in (real / "SHA256SUMS").read_text(encoding="utf-8").splitlines() if line.strip()]
    expected = {name: digest for digest, name in rows}
    assert sorted(expected) == sorted(p.name for p in real.iterdir() if p.name != "SHA256SUMS")
    assert len(expected) == 5
    for name, digest in expected.items():
        assert hashlib.sha256((real / name).read_bytes()).hexdigest() == digest, name
