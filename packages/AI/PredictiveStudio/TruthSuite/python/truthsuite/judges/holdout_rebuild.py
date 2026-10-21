"""Rebuild Predictive Studio's locked holdout slice in SQL Server clustered-PK (uniqueidentifier) order."""
from __future__ import annotations

import json
import sys
import uuid
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import TypedDict

import pandas as pd

POSITIVE_TOKENS: frozenset[str] = frozenset({"1", "true", "True", "TRUE", "Renewed", "yes", "Yes"})


class HoldoutRebuildResult(TypedDict):
    n: int
    positives: int
    ids: list[str]


def sqlserver_guid_key(s: str) -> bytes:
    """Sort key reproducing SQL Server's uniqueidentifier ordering (bytes 10-15, 8-9, 6-7, 4-5, 0-3 of bytes_le)."""
    b = uuid.UUID(s).bytes_le
    return b[10:16] + b[8:10] + b[6:8] + b[4:6] + b[0:4]


def trailing_holdout(ids: Sequence[str], labels: Mapping[str, object], n_hold: int) -> list[str]:
    """Return the trailing `n_hold` labelled row IDs in SQL Server uniqueidentifier order."""
    labeled = [i for i in ids if labels.get(i) is not None and str(labels.get(i)) != ""]
    ordered = sorted(labeled, key=sqlserver_guid_key)
    if n_hold <= 0:
        return []
    return ordered[-n_hold:]


def rebuild_from_files(rows_csv: Path, model_json: Path, label_col: str) -> HoldoutRebuildResult:
    """Rebuild the holdout IDs and positive count from a dataset's rows.csv and a model artifact JSON."""
    raw_model: object = json.loads(model_json.read_text())
    if not isinstance(raw_model, dict):
        raise TypeError(f"{model_json} must contain a JSON object")
    rows = pd.read_csv(rows_csv, usecols=["ID", label_col], dtype=str, keep_default_na=False)
    rows["k"] = rows["ID"].map(sqlserver_guid_key)
    rows = rows.sort_values("k").reset_index(drop=True)

    hr_raw = raw_model.get("holdoutReconstruction")
    hr: dict[str, object] = hr_raw if isinstance(hr_raw, dict) else {}
    cap = hr.get("fetchCap")
    if isinstance(cap, int) and cap > 0:
        fetched = rows.iloc[:cap]
    else:
        fetched = rows
    labeled = fetched[fetched[label_col] != ""].reset_index(drop=True)

    # Support both ModelJson (judge.py) and CandidateModel (TruthHarness.ReadModel)
    train_count = raw_model.get("trainingRowCount")
    if not isinstance(train_count, int):
        train_count = raw_model.get("TrainingRowCount")
    hold_count = raw_model.get("HoldoutRowCount")
    if not isinstance(hold_count, int):
        lineage_raw = raw_model.get("lineage")
        if not isinstance(lineage_raw, dict):
            lineage_str = raw_model.get("LineageJSON")
            if isinstance(lineage_str, str) and lineage_str:
                parsed_lin: object = json.loads(lineage_str)
                lineage_raw = parsed_lin if isinstance(parsed_lin, dict) else {}
            else:
                lineage_raw = {}
        lin_hold = lineage_raw.get("lockedHoldoutRowCount")
        if isinstance(lin_hold, int):
            hold_count = lin_hold

    if isinstance(train_count, int) and isinstance(hold_count, int) and (train_count + hold_count) <= len(labeled):
        labeled = labeled.iloc[: train_count + hold_count].reset_index(drop=True)

    n = len(labeled)
    if isinstance(hold_count, int):
        n_hold = hold_count
    else:
        frac_raw = hr.get("lockedHoldoutFraction", 0.2)
        frac = float(frac_raw) if isinstance(frac_raw, (int, float)) else 0.2
        n_hold = min(max(int(n * frac), 1 if frac > 0 else 0), max(0, n - 1))

    n_train = max(0, n - n_hold)
    held = labeled.iloc[n_train:]
    positives = int(held[label_col].isin(POSITIVE_TOKENS).sum())
    ids = [str(x).lower() for x in held["ID"].tolist()]
    return {"n": len(ids), "positives": positives, "ids": ids}


def main(argv: Sequence[str]) -> int:
    rows_path: str | None = None
    model_path: str | None = None
    label_col = "Renewed"
    i = 0
    while i < len(argv):
        if argv[i] == "--rows":
            rows_path = argv[i + 1]
            i += 2
        elif argv[i] == "--model":
            model_path = argv[i + 1]
            i += 2
        elif argv[i] == "--label":
            label_col = argv[i + 1]
            i += 2
        else:
            raise SystemExit(f"Unknown argument: {argv[i]}")
    if not rows_path or not model_path:
        raise SystemExit("usage: python -m truthsuite.judges.holdout_rebuild --rows <rows.csv> --model <model.json> [--label <col>]")
    res = rebuild_from_files(Path(rows_path), Path(model_path), label_col)
    print(json.dumps(res))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
