"""Test and runtime-verification helpers for the trainer: build the snapshot files (matrix.jsonl, manifest.jsonl) from a
frame, serve them over a local HTTP server as pre-authorised downloads, and build TrainerRequest payloads.

Used by the unit tests (synthetic frames), the gate tests (the truth suite's planted-truth data, read through its Python
package `truthsuite`) and the runtime check
(`python -m tests.tools.trainer_fixture --scenario C2 --url http://127.0.0.1:<port> --task '{"kind":"binary",...}'`).
"""

from __future__ import annotations

import argparse
import functools
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from collections.abc import Mapping, Sequence
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Union

import numpy as np
import pandas as pd
from pydantic import TypeAdapter

from app.baselines import BASELINE_ONLY_DRIVERS, GLM_DRIVER
from app.schemas import Cell
from app.snapshot_format import (
    INCUMBENT_SCORE_COLUMN,
    LABEL_COLUMN,
    MATRIX_FORMAT,
    REFERENCE_SCORE_COLUMN,
    SLICE_COLUMN_PREFIX,
)
from app.trainer_schemas import TrainerCompleted, TrainerResult

JsonValue = Union[None, bool, int, float, str, list["JsonValue"], dict[str, "JsonValue"]]
JsonObject = dict[str, JsonValue]

NIL = "00000000-0000-0000-0000-0000000000"
NUMERIC: JsonObject = {"kind": "numeric", "nonNumericValue": "fail"}
# The binary task of the planted 0/1 scenarios and worlds (class "1" adverse) and the label map that writes their 0/1
# targets as those class names.
BINARY_TASK: JsonObject = {"kind": "binary", "classOrder": ["0", "1"], "adverseIndex": 1}
BINARY_LABELS: dict[int, str] = {0: "0", 1: "1"}
# Integers beyond this are not exactly representable as a JavaScript number, so they are never folded from a float.
_JS_SAFE_INTEGER = 2**53


def uid(n: int) -> str:
    return f"{NIL}{n:02d}"


# ------------------------------------------------------------------------------------------------ JSON reading ------

def as_object(v: JsonValue, where: str) -> JsonObject:
    """`v` as a JSON object; ValueError naming `where` otherwise (the as_* readers narrow parsed JSON without casts)."""
    if not isinstance(v, dict):
        raise ValueError(f"{where} is not a JSON object")
    return v


def as_list(v: JsonValue, where: str) -> list[JsonValue]:
    if not isinstance(v, list):
        raise ValueError(f"{where} is not a JSON array")
    return v


def as_str(v: JsonValue, where: str) -> str:
    if not isinstance(v, str):
        raise ValueError(f"{where} is not a JSON string")
    return v


def as_number(v: JsonValue, where: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f"{where} is not a JSON number")
    return float(v)


def as_int(v: JsonValue, where: str) -> int:
    if isinstance(v, bool) or not isinstance(v, int):
        raise ValueError(f"{where} is not a JSON integer")
    return v


def _read_json(path: Path) -> JsonValue:
    parsed: JsonValue = json.loads(path.read_text(encoding="utf-8"))
    return parsed


def _canonical_line(value: object) -> str:
    """One JSON line as the engine's canonical JSON writes it: sorted keys, no whitespace, non-ASCII text verbatim."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n"


# --------------------------------------------------------------------------------------------- file server ---------

class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - the stdlib signature names it `format`
        return


class FileServer:
    """A local HTTP server over a temp directory, standing in for the storage driver's pre-authorised URLs."""

    def __init__(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="ps-snapshot-"))
        handler = functools.partial(_QuietHandler, directory=str(self.root))
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def publish(self, name: str, body: bytes, file_id: str, expires: str | None = "2099-01-01T00:00:00Z") -> JsonObject:
        """Serve `body` as `name`. `expires=None` states a driver whose URLs do not expire (null lifetime and expiry)."""
        (self.root / name).write_bytes(body)
        return {"fileId": file_id, "url": f"{self.base}/{name}", "issuedAt": "2026-10-12T00:00:00Z",
                "driverLifetimeSeconds": 600 if expires is not None else None, "expiresAt": expires,
                "sha256": hashlib.sha256(body).hexdigest()}

    def close(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()


# ------------------------------------------------------------------------------------------- snapshot files --------

def _cell(v: object) -> Cell:
    """A frame value as a matrix cell: missing is null, numpy scalars become Python scalars, and an integral float is
    written as an integer (JavaScript's JSON writes 3.0 as 3)."""
    if v is None:
        return None
    if isinstance(v, np.generic):
        item: object = v.item()
        return _cell(item)
    if isinstance(v, bool) or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        if np.isnan(v):
            return None
        if np.isfinite(v) and v.is_integer() and abs(v) < _JS_SAFE_INTEGER:
            return int(v)
        return v
    raise TypeError(f"a matrix cell must be a string, number, boolean or missing, got {type(v).__name__}")


def _slice_cell(v: object) -> Cell:
    cell = _cell(v)
    return "(missing)" if cell is None else str(v)


def _day(v: object) -> str | None:
    """The yyyy-mm-dd prefix of a date value; None when it is missing."""
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return str(v)[:10]


def snapshot_files(df: pd.DataFrame, features: Mapping[str, JsonObject], holdout_ids: Sequence[str], *,
                   label: str = "Target", label_map: Mapping[int, str] | None = None,
                   time_col: str | None = "T", period_col: str | None = None, entity_col: str = "EntityKey",
                   id_col: str = "ID", decision: JsonObject | None = None, incumbent_col: str | None = None,
                   reference_col: str | None = None, slice_cols: Mapping[str, str] | None = None,
                   source_of: Mapping[str, str] | None = None) -> tuple[bytes, bytes]:
    """(matrix.jsonl bytes, manifest.jsonl bytes) for a frame in the format `SerializeSnapshotFiles` writes: every line
    is canonical JSON (sorted keys, no whitespace) and matches the engine's `Canonicalize` byte for byte for the number
    forms the product emits (integers and plain decimals); exponent-form floats (1e-07, 1e+21) serialize differently in
    Python and JavaScript and never appear in these fixtures. Matrix line 1 is the header, then one JSON array per
    row; manifest line i is the SnapshotRowKey of matrix row i (positional, no row-id column). Rows whose ID is in
    `holdout_ids` are the locked holdout. Only fixtures set `referenceScoreColumn` (a planted truth such as a world's
    true probability); snapshots the product writes leave it null. The provenance file is not written: the trainer
    never reads it."""
    hold = {str(i) for i in holdout_ids}
    extras: list[tuple[str, str]] = []
    if incumbent_col:
        extras.append((INCUMBENT_SCORE_COLUMN, incumbent_col))
    if reference_col:
        extras.append((REFERENCE_SCORE_COLUMN, reference_col))
    for field, src in (slice_cols or {}).items():
        extras.append((f"{SLICE_COLUMN_PREFIX}{field}", src))
    cols = list(features) + [LABEL_COLUMN] + [e for e, _ in extras]
    rows: list[list[Cell]] = []
    manifest: list[JsonObject] = []
    for rec in df.to_dict("records"):
        raw_label: object = rec[label]
        label_cell = _cell(raw_label)
        if label_map is not None:
            if not isinstance(label_cell, int) or isinstance(label_cell, bool):
                raise ValueError(f"label_map maps integer labels; row {rec[id_col]} has {raw_label!r}")
            label_cell = label_map[label_cell]
        rows.append([_cell(rec[f]) for f in features] + [label_cell]
                    + [_slice_cell(rec[s]) if e.startswith(SLICE_COLUMN_PREFIX) else _cell(rec[s]) for e, s in extras])
        row_id = str(rec[id_col])
        manifest.append({
            "rowId": row_id, "entityKey": str(rec[entity_col]),
            "decisionDate": (_day(rec[time_col]) if time_col else None) or "2000-01-01",
            "groupKey": str(rec[entity_col]),
            "period": _day(rec[period_col]) if period_col else None,
            "role": "locked-holdout" if row_id in hold else "development",
        })
    header: JsonObject = {
        "format": MATRIX_FORMAT, "columns": list(cols), "labelColumn": LABEL_COLUMN,
        "featureColumns": [{"name": f, "sourceColumn": (source_of or {}).get(f, f), "encoding": e}
                           for f, e in features.items()],
        "incumbentScoreColumn": INCUMBENT_SCORE_COLUMN if incumbent_col else None,
        "referenceScoreColumn": REFERENCE_SCORE_COLUMN if reference_col else None,
        "sliceColumns": {field: f"{SLICE_COLUMN_PREFIX}{field}" for field in (slice_cols or {})},
        "decision": decision or {"action": "review", "actorRole": "analyst", "capacityPerPeriod": None, "period": "year"},
        "featureSchema": [], "preprocessing": [],
    }
    matrix = "".join(_canonical_line(line) for line in [header, *rows])
    manifest_text = "".join(_canonical_line(m) for m in manifest)
    return matrix.encode("utf-8"), manifest_text.encode("utf-8")


def feature_schema_hash(matrix: bytes) -> str:
    """The snapshot's feature schema hash, by the engine's rule (`ComputeFeatureSchemaHash`): SHA-256 of the canonical
    JSON of each header feature column's name, encoding and source column, in column order. A matrix without a
    readable header hashes an empty column list."""
    first = matrix.split(b"\n", 1)[0].decode("utf-8")
    header: JsonValue = json.loads(first) if first.strip() else {}
    columns = header.get("featureColumns", []) if isinstance(header, dict) else []
    entries: list[JsonObject] = []
    for i, c in enumerate(columns if isinstance(columns, list) else []):
        col = as_object(c, f"featureColumns[{i}]")
        entries.append({"name": col.get("name"), "encoding": col.get("encoding"), "sourceColumn": col.get("sourceColumn")})
    return hashlib.sha256(_canonical_line(entries).rstrip("\n").encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------------------------- request -----------

GLM_FAMILY = {"binary": "logistic", "multiclass": "multinomial", "continuous": "gaussian", "count": "poisson",
              "non-negative": "tweedie"}
METRIC = {"binary": "log-loss", "multiclass": "multiclass-log-loss", "continuous": "rmse", "count": "poisson-deviance",
          "non-negative": "tweedie-deviance", "forecast": "mase"}


def _baselines(family: str) -> list[JsonValue]:
    if family == "forecast":
        return [{"kind": "dummy", "name": "training-window-mean"}, {"kind": "naive"},
                {"kind": "seasonal-naive", "season": 12}]
    classify = family in ("binary", "multiclass")
    return [{"kind": "dummy", "name": "base-rate" if classify else "mean"},
            {"kind": "one-feature", "selection": "best-single-feature-inner-cv"},
            {"kind": "glm", "family": GLM_FAMILY[family], "penalty": "l2"}]


def protocol(family: str, **over: JsonValue) -> JsonObject:
    """A complete EvaluationProtocolSpec for `family` with the reference pipeline's settings; keyword overrides replace
    top-level keys. No pipeline or unit reference: the pipeline binds the protocol."""
    classify = family in ("binary", "multiclass")
    p: JsonObject = {
        "id": uid(1), "lineageRootId": uid(1), "version": 1, "name": f"{family} test protocol",
        "holdout": {"kind": "date-carved", "dateColumn": "DecisionDate", "cutoff": "2024-01-01", "holdoutEnd": None,
                    "newEntityReport": None},
        "innerValidation": {"kind": "repeated-stratified-kfold", "folds": 5, "repeats": 1},
        "seed": 0, "holdoutAccessBudget": 1,
        "primaryScore": {"family": family, "metric": METRIC[family]},
        "secondaryMetrics": ["auc", "accuracy"] if classify else ["r2"],
        "baselines": _baselines(family),
        "calibration": ({"kind": "auto", "thresholdRows": 2000, "fitOn": "disjoint-calibration-fold"} if classify
                        else {"kind": "not-applicable", "reason": "regression-task"}),
        "resampling": {"kind": "none"},
        "intervals": {"level": 0.95, "method": "bootstrap", "resamples": 1000, "pairedTest": "paired-bootstrap"},
        "promotion": {"comparators": [], "incumbent": "none", "margin": 0, "lowerBoundLevel": 0.95,
                      "pairedOn": "same-holdout-rows", "decisionTable": "Q13+Q14+Q15"},
        "allowedOutcomes": ["model", "keep-simple-baseline", "no-signal"],
        "leakageAudit": {"singleFeatureHeldOutAucMax": 0.9, "timeShiftedLabelTest": True, "dropColumnTest": True,
                         "importanceAggregation": "per-source-column", "highCardinalityIdCheck": True},
        "exclusions": {"denyFields": [], "denySources": []},
        "slices": {"outOfTime": False, "subgroups": []}, "predictionIntervals": None, "residualDiagnostics": None,
        "retrainTriggers": [], "search": {"kind": "random", "candidates": 3},
        "budgets": {"maxComputeSeconds": 3600, "maxTokens": 0, "maxCandidates": 10, "hardStop": True},
        "minMinorityClassRows": 20, "guardFieldsEditableBy": "non-agent",
        "authoredBy": {"kind": "human", "userId": uid(9)},
    }
    p.update(over)
    return p


DriverSpec = tuple[str, str, JsonObject]
REFPIPE_CANDIDATES: dict[str, list[DriverSpec]] = {
    "tabular-boost": [
        ("lgbm", "lightgbm", {"n_estimators": 300, "learning_rate": 0.05, "num_leaves": 15, "min_child_samples": 50,
                              "subsample": 0.8, "subsample_freq": 1}),
        ("xgb", "xgboost", {"n_estimators": 300, "learning_rate": 0.05, "max_depth": 4, "subsample": 0.8}),
    ],
}


# The GLM baseline's driver per family, looked up by the family name a caller passes (the command line's included).
_GLM_DRIVER_BY_NAME: dict[str, str] = dict(GLM_DRIVER.items())


def _default_drivers(family: str) -> list[DriverSpec]:
    """glm < lgbm < xgb (the 1-SE rule's complexity order). A family whose GLM driver only the GLM baseline may fit
    (count, non-negative) has no GLM candidate: the gate's `glm` member is that model."""
    glm = _GLM_DRIVER_BY_NAME[family]
    lead: list[DriverSpec] = [] if glm in BASELINE_ONLY_DRIVERS else [("glm_candidate", glm, {})]
    return lead + REFPIPE_CANDIDATES["tabular-boost"]


def candidates(family: str, drivers: Sequence[DriverSpec] | None = None) -> list[JsonValue]:
    """The reference pipeline's candidate set (see `_default_drivers`) unless `drivers` is given."""
    spec = list(drivers) if drivers is not None else _default_drivers(family)
    return [{"name": n, "algorithmId": uid(10 + i), "driverKey": d, "hyperparameters": h} for i, (n, d, h) in enumerate(spec)]


def request(server: FileServer, matrix: bytes, manifest: bytes, task: JsonObject, proto: JsonObject,
            cands: list[JsonValue], *, tag: str = "snap", threads: int = 1, timeout: float = 3600,
            incumbent: JsonObject | None = None, expires: str | None = "2099-01-01T00:00:00Z") -> JsonObject:
    """A TrainerRequest over the two files, published on `server`. Its `contentHash` is a SHA-256 of the two files'
    bytes, not the engine's content-hash formula: the sidecar carries the content hash through and never recomputes
    it. `featureSchemaHash` follows the engine's formula (see `feature_schema_hash`)."""
    return {
        "trainingRunId": uid(4),
        "snapshot": {"id": uid(5), "contentHash": hashlib.sha256(matrix + manifest).hexdigest(),
                     "featureSchemaHash": feature_schema_hash(matrix),
                     "matrix": server.publish(f"{tag}-matrix.jsonl", matrix, uid(6), expires),
                     "rowManifest": server.publish(f"{tag}-manifest.jsonl", manifest, uid(7), expires)},
        "incumbent": incumbent, "protocol": proto, "task": task, "candidates": cands,
        "seed": as_int(proto["seed"], "protocol.seed"), "threads": threads, "timeoutSeconds": timeout, "maxRetries": 0,
    }


# --------------------------------------------------------------------------------------- planted-truth data --------
# The truth-suite data, read through its Python package `truthsuite`, which is importable when PYTHONPATH holds
# TruthSuite/python (the gate bridge sets it). Generated seeds live in the cache
# $TRUTH_DATA_DIR/<kind>/<id>/<specHash12>/seed-<k>/ and are located by truthsuite.paths through
# $TRUTH_DATA_DIR/index.json; the committed real cases (R2-real, T1-real, person_years.parquet) through
# truthsuite.paths.real_fixture. A seed that is not in the cache raises KeyError: a failure, never a skip.
# `truthsuite` is imported inside each reader, so the product-venv unit tests (which never read planted truth) do not
# need it.

def _require_truthsuite() -> None:
    if importlib.util.find_spec("truthsuite") is None:
        raise RuntimeError("truthsuite is not importable: run with PYTHONPATH=$MJ/packages/AI/PredictiveStudio/TruthSuite/python "
                           "(the truth-suite package) and the TruthSuite venv")


def real_scenarios() -> tuple[str, ...]:
    """The committed real cases (the reference pipeline's own list): one seed each, read from fixtures/real/."""
    _require_truthsuite()
    from truthsuite.refpipe import run as refpipe_run

    return refpipe_run.REAL_CASES


def spec_seed(sid: str) -> int:
    """A planted scenario's spec seed: the seed its spec file names (a derived scenario: its source spec's), i.e. the
    truth suite's `base` seed set for that scenario."""
    _require_truthsuite()
    from truthsuite import paths

    return paths.spec_seed(sid)


def scenario_seeds400(sid: str) -> list[int]:
    """The truth suite's `n400` seed set for a scenario as the catalog generated it: the spec seed, then
    spec*1000+1 … spec*1000+399 (C2: 2201, 2201001 … 2201399). The generated seeds must be exactly that set; one that
    is not fully generated raises KeyError (generate it with `--set n400`)."""
    _require_truthsuite()
    from truthsuite import paths

    seeds = paths.generated_scenario_seeds(sid)
    spec = seeds[0]
    expected = [spec] + [spec * 1000 + k for k in range(1, 400)]
    if seeds != expected:
        raise KeyError(f"scenario {sid}'s {len(seeds)} generated seeds are not its n400 set (spec seed {spec}, then "
                       f"{spec * 1000 + 1} … {spec * 1000 + 399}); generate them with "
                       f"`pnpm run truth:data -- --set n400 --only {sid}`")
    return seeds


def scenario_dir(sid: str, seed: int | None = None) -> Path:
    """The cache directory of one generated scenario seed (default: the spec seed)."""
    _require_truthsuite()
    from truthsuite import paths

    return paths.spec_seed_dir(sid) if seed is None else paths.seed_dir("scenario", sid, seed)


def world_dir(name: str, seed: int) -> Path:
    """The cache directory of one generated world seed (W1-signal s42, W2-noise s100–s499 and fresh 9100, …)."""
    _require_truthsuite()
    from truthsuite import paths

    return paths.seed_dir("world", name, seed)


def scenario(sid: str, seed: int | None = None) -> pd.DataFrame:
    """A planted scenario's rows (a committed real case has one seed)."""
    if sid in real_scenarios():
        if seed is not None:
            raise ValueError(f"{sid} is a committed real case with one seed")
        from truthsuite import paths

        path = paths.real_fixture(f"{sid}.rows.csv")
    else:
        path = scenario_dir(sid, seed) / "rows.csv"
    return pd.read_csv(path, dtype={"ID": str, "EntityKey": str})


def scenario_manifest(sid: str, seed: int | None = None) -> JsonObject:
    """A planted scenario's manifest.json."""
    if sid in real_scenarios():
        from truthsuite import paths

        path = paths.real_fixture(f"{sid}.manifest.json")
    else:
        path = scenario_dir(sid, seed) / "manifest.json"
    return as_object(_read_json(path), str(path))


def person_years() -> pd.DataFrame:
    """The MoreCheese person-years table, committed in the truth suite as fixtures/real/person_years.parquet."""
    _require_truthsuite()
    from truthsuite import paths

    return pd.read_parquet(paths.real_fixture("person_years.parquet"))


def _golden_mismatches(got: JsonObject, want: JsonObject) -> list[str]:
    """The keys of the committed summary entry `want` that the full result `got` does not reproduce."""
    def close(a: JsonValue, b: JsonValue) -> bool:
        return abs(round(as_number(a, "result value"), 10) - as_number(b, "summary value")) <= 1e-9

    try:
        ps = as_object(got["primaryScore"], "primaryScore")
        ci, want_ci = as_list(ps["ci"], "primaryScore.ci"), as_list(want["ci"], "ci")
        checks = {
            "selected": got.get("selected") == want.get("selected"),
            "score": ps.get("name") == want.get("score"),
            "value": close(ps["value"], want["value"]),
            "ci": len(ci) == len(want_ci) == 2 and all(close(a, b) for a, b in zip(ci, want_ci)),
            "nTest": ps.get("nTest") == want.get("nTest"),
            "outcome": got.get("gateOutcome") == want.get("outcome"),
            "branch": as_object(got["gate"], "gate").get("branch") == want.get("branch"),
            "sha256": as_object(got["source"], "source").get("sha256") == want.get("sha256"),
        }
    except (KeyError, ValueError) as e:
        return [f"shape ({e})"]
    return [k for k, ok in checks.items() if not ok]


@functools.lru_cache(maxsize=None)
def refpipe(ref_id: str) -> JsonObject:
    """The reference pipeline's full result for one reference id ('C2', 'C2-shuffled', 'R2-real', 'C1', …).

    The truth suite commits only a summary of each result, fixtures/reference/p5-golden.json: per id `selected`,
    `score` (the primary score's name), `value`, `ci`, `nTest`, `outcome`, `branch`, `sha256`. The gate tests also read
    `features`, `split.testIds` and `gate.shipped`, which the summary does not hold, so the full result is computed by
    the truth suite's port of the pipeline (`python -m truthsuite.refpipe.run <id> --out <file> [--shuffle-labels]`,
    the command its tests/test_refpipe_golden.py runs), cached at $TRUTH_DATA_DIR/refpipe/<id>.json, and accepted only
    when it reproduces the summary entry (else the cache file is deleted and this raises).
    `primaryScore.value`/`.ci`, `gateOutcome` and `gate.branch` therefore equal the committed reference results.
    Callers must not mutate the returned object: it is cached."""
    _require_truthsuite()
    from truthsuite import paths

    golden = as_object(_read_json(paths.FIXTURES / "reference" / "p5-golden.json"), "p5-golden.json")
    if ref_id not in golden:
        raise KeyError(f"{ref_id} is not a reference id of fixtures/reference/p5-golden.json")
    want = as_object(golden[ref_id], f"p5-golden.json {ref_id}")
    out = paths.data_root() / "refpipe" / f"{ref_id}.json"
    if not out.is_file():
        out.parent.mkdir(parents=True, exist_ok=True)
        sid, shuffled = ref_id.removesuffix("-shuffled"), ref_id.endswith("-shuffled")
        tmp = out.with_suffix(".tmp")
        subprocess.run([sys.executable, "-m", "truthsuite.refpipe.run", sid, "--out", str(tmp)] + (["--shuffle-labels"] if shuffled else []),
                       check=True, cwd=paths.PACKAGE_ROOT / "python", env={**os.environ, "PYTHONHASHSEED": "0"})
        tmp.replace(out)
    got = as_object(_read_json(out), str(out))
    bad = _golden_mismatches(got, want)
    if bad:
        out.unlink()
        raise RuntimeError(f"refpipe {ref_id} does not reproduce fixtures/reference/p5-golden.json ({', '.join(bad)})")
    return got


def refpipe_carve(df: pd.DataFrame, seed: int = 0) -> list[str]:
    """The reference pipeline's deployment carve for scenarios without a stored split, computed by its own `make_split`:
    the locked-holdout row IDs. With a decision time on every row (`T`), the rows at or after the earliest 1 January
    whose trailing block holds <= 25% of rows; else a seeded 25% carve (whole entities when entity keys repeat)."""
    _require_truthsuite()
    from truthsuite.refpipe import run as refpipe_run

    frame = df.copy()
    frame["ID"] = frame["ID"].astype(str)
    frame["EntityKey"] = frame["EntityKey"].astype(str)
    frame["T"] = pd.to_datetime(frame["T"]) if "T" in frame else pd.NaT
    carve_input = refpipe_run.Scenario(sid="carve", df=frame, problem="binary", structure="cross-section",
                                       manifest_kind="carve", features=[])
    split = refpipe_run.make_split(carve_input, seed)
    return list(split.folds[0][1])


# --------------------------------------------------------------------------------------------- runtime check -------

def _summary(ref: JsonObject, result: TrainerCompleted | None, status: str, compute_seconds: float) -> JsonObject:
    rp = as_object(ref["primaryScore"], "primaryScore")
    gate = as_object(ref["gate"], "gate")
    return {"status": status,
            "finalist": result.finalist if result is not None else None,
            "gate": result.gate.model_dump(mode="json") if result is not None else None,
            "primary": result.holdout.primary.model_dump(mode="json") if result is not None else None,
            "refpipe": {"selected": ref.get("selected"), "primary": rp.get("value"), "ci": rp.get("ci"),
                        "gate": {"outcome": gate.get("outcome"), "shipped": gate.get("shipped")}},
            "computeSeconds": compute_seconds}


def main(argv: Sequence[str] | None = None) -> int:
    """Runtime check: POST a planted scenario to a running sidecar's /trainer and compare with the reference pipeline's
    result for the same scenario."""
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenario", required=True)
    ap.add_argument("--url", required=True)
    ap.add_argument("--task", required=True, help="TaskType JSON, e.g. '{\"kind\":\"count\"}'")
    ap.add_argument("--label-map", default=None, help="JSON object mapping raw label -> class name")
    ap.add_argument("--dump-request", default=None, help="write the TrainerRequest JSON here and serve the snapshot")
    ap.add_argument("--serve-seconds", type=float, default=600.0, help="with --dump-request: how long to serve")
    a = ap.parse_args(argv)
    ref = refpipe(a.scenario)
    df = scenario(a.scenario)
    task = as_object(json.loads(a.task), "--task")
    family = as_str(task["kind"], "--task kind")
    label_map = ({int(k): as_str(v, f"--label-map {k}") for k, v in as_object(json.loads(a.label_map), "--label-map").items()}
                 if a.label_map else None)
    feats = {as_str(c, "features[]"): NUMERIC for c in as_list(ref["features"], "features")}
    test_ids = [as_str(i, "split.testIds[]") for i in as_list(as_object(ref["split"], "split")["testIds"], "split.testIds")]
    srv = FileServer()
    try:
        m, n = snapshot_files(df, feats, test_ids, label_map=label_map)
        body = json.dumps(request(srv, m, n, task, protocol(family), candidates(family))).encode("utf-8")
        if a.dump_request:
            Path(a.dump_request).write_bytes(body)
            print(f"request written to {a.dump_request}; serving the snapshot for {a.serve_seconds:.0f}s", flush=True)
            time.sleep(a.serve_seconds)
            return 0
        req = urllib.request.Request(f"{a.url}/trainer", data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3600) as resp:  # noqa: S310 - local sidecar
            res = TypeAdapter(TrainerResult).validate_json(resp.read())
    finally:
        srv.close()
    completed = res if isinstance(res, TrainerCompleted) else None
    print(json.dumps(_summary(ref, completed, res.status, res.computeSeconds), indent=1))
    return 0 if completed is not None else 1


if __name__ == "__main__":
    sys.exit(main())
