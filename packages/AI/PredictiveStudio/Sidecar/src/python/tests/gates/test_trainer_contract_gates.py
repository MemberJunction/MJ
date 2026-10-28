"""Trainer contract gates: a run records the library versions and the thread count it trained with."""

from __future__ import annotations

import pytest

from app import code_version


@pytest.mark.gate("W1 -> S5.4 #3")
def test_W1_S5_4_3_versions_and_threads_logged() -> None:
    """Every trainer run carries the versions of the libraries it ran on and the thread count it was given."""
    cv = code_version.code_version(threads=1, seed=0)
    for lib in ("python", "numpy", "scikit-learn", "xgboost", "lightgbm"):
        assert cv.libraryVersions[lib]
    assert cv.threads == 1 and cv.seed == 0
