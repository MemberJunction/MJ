"""The always-majority rate on a model's locked holdout, read from the class counts training recorded.

Training carves the locked holdout itself (a seeded, label-stratified sample) and writes the carved holdout's
per-label row counts into the model's lineage as `lockedHoldoutClassCounts` (label -> row count), next to
`lockedHoldoutRowCount`. This judge reads that field from the model artifact the harness writes
(`TruthHarness.WriteArtifact(<CandidateModel>)`, whose `LineageJSON` is the stored `MJ: ML Models.Lineage`), so it
never rebuilds the holdout from rows and does not depend on the order a database returns them in.
"""
from __future__ import annotations

import json
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TypedDict


class HoldoutMajorityResult(TypedDict):
    n: int
    majorityCount: int
    majorityRate: float
    classCounts: dict[str, int]


def holdout_class_counts(lineage: Mapping[str, object]) -> dict[str, int]:
    """The `lockedHoldoutClassCounts` of a model lineage; raises ValueError when it is missing, empty or not counts."""
    raw = lineage.get("lockedHoldoutClassCounts")
    if not isinstance(raw, dict) or len(raw) == 0:
        raise ValueError("the model's Lineage has no lockedHoldoutClassCounts: train the model with a build that records them")
    counts: dict[str, int] = {}
    for label, count in raw.items():
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ValueError(f"lockedHoldoutClassCounts[{label!r}] is not a non-negative integer: {count!r}")
        counts[str(label)] = count
    if sum(counts.values()) == 0:
        raise ValueError("lockedHoldoutClassCounts counts no rows")
    return counts


def majority_from_counts(counts: Mapping[str, int]) -> HoldoutMajorityResult:
    """The always-majority rate over the holdout's class counts: max(counts) / sum(counts)."""
    n = sum(counts.values())
    majority = max(counts.values())
    return {"n": n, "majorityCount": majority, "majorityRate": majority / n, "classCounts": dict(counts)}


def majority_from_model_file(model_json: Path) -> HoldoutMajorityResult:
    """Read a CandidateModel artifact, parse its `LineageJSON`, and return the holdout's majority rate."""
    raw_model: object = json.loads(model_json.read_text())
    if not isinstance(raw_model, dict):
        raise ValueError(f"{model_json} must contain a JSON object")
    lineage_json = raw_model.get("LineageJSON")
    if not isinstance(lineage_json, str) or lineage_json == "":
        raise ValueError(f"{model_json} has no LineageJSON")
    lineage: object = json.loads(lineage_json)
    if not isinstance(lineage, dict):
        raise ValueError(f"{model_json}: LineageJSON is not a JSON object")
    return majority_from_counts(holdout_class_counts(lineage))


def main(argv: Sequence[str]) -> int:
    if len(argv) != 2 or argv[0] != "--model":
        raise SystemExit("usage: python -m truthsuite.judges.holdout_rebuild --model <model.json>")
    try:
        res = majority_from_model_file(Path(argv[1]))
    except ValueError as e:
        raise SystemExit(f"holdout_rebuild: {e}") from e
    print(json.dumps(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
