from __future__ import annotations

import json
from pathlib import Path

import pytest

from truthsuite.judges.holdout_rebuild import majority_from_model_file


def write_model(tmp_path: Path, lineage: dict[str, object] | None) -> Path:
    model = tmp_path / "model.json"
    model.write_text(json.dumps({"ModelID": "m1", "LineageJSON": json.dumps(lineage) if lineage is not None else None}))
    return model


def test_majority_rate_is_the_largest_class_count_over_the_holdout(tmp_path: Path) -> None:
    lineage: dict[str, object] = {"lockedHoldoutRowCount": 40, "lockedHoldoutClassCounts": {"1": 30, "0": 10}}
    res = majority_from_model_file(write_model(tmp_path, lineage))
    assert res["n"] == 40
    assert res["majorityCount"] == 30
    assert res["majorityRate"] == pytest.approx(0.75)


def test_majority_rate_covers_more_than_two_classes(tmp_path: Path) -> None:
    lineage: dict[str, object] = {"lockedHoldoutClassCounts": {"Gold": 5, "Silver": 3, "Bronze": 2}}
    assert majority_from_model_file(write_model(tmp_path, lineage))["majorityRate"] == pytest.approx(0.5)


@pytest.mark.parametrize(
    "lineage",
    [
        {"lockedHoldoutRowCount": 40},
        {"lockedHoldoutClassCounts": {}},
        {"lockedHoldoutClassCounts": {"1": 0, "0": 0}},
        {"lockedHoldoutClassCounts": {"1": "3"}},
    ],
)
def test_refuses_a_lineage_without_usable_class_counts(tmp_path: Path, lineage: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        majority_from_model_file(write_model(tmp_path, lineage))


def test_refuses_a_model_without_lineage(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        majority_from_model_file(write_model(tmp_path, None))
