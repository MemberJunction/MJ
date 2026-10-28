"""Snapshot download, SHA-256 verification and typed parsing (stage load-snapshot)."""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pytest

from app import snapshot as SN
from app.encoding import MISSING_TOKEN, CategoricalEncoding, MissingPolicy, NumericEncoding
from app.failures import SnapshotLoadFailure
from app.trainer_schemas import TrainerRequest
from tests.tools.trainer_fixture import FileServer, JsonObject, JsonValue, candidates, protocol, request, snapshot_files
from tests.tools.trainer_scaffold import FEATS, TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

NOW = dt.datetime(2026, 10, 12, tzinfo=dt.timezone.utc)
HASH = "a" * 64


def _request(srv: FileServer, matrix: bytes, manifest: bytes,
             expires: str | None = "2099-01-01T00:00:00Z") -> TrainerRequest:
    return TrainerRequest.model_validate(request(srv, matrix, manifest, TASK, protocol("binary"), candidates("binary"),
                                                 expires=expires))


def _lines(body: bytes) -> list[str]:
    return body.decode("utf-8").split("\n")[:-1]


def _join(lines: list[str]) -> bytes:
    return "".join(f"{line}\n" for line in lines).encode("utf-8")


def _with_header(matrix: bytes, change: Callable[[JsonObject], None]) -> bytes:
    lines = _lines(matrix)
    header: JsonObject = json.loads(lines[0])
    change(header)
    return _join([json.dumps(header), *lines[1:]])


def _files(n: int = 60) -> tuple[bytes, bytes]:
    return snapshot_files(binary_frame(n), FEATS, ["r0", "r1", "r2"])


def _refusal(matrix: bytes, manifest: bytes) -> SnapshotLoadFailure:
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.parse_snapshot(matrix, manifest, HASH)
    assert e.value.stage == "load-snapshot"
    return e.value


# ----------------------------------------------------------------------------------------------- download -------

def test_snapshot_hash_mismatch_fails_load_snapshot(server: FileServer) -> None:
    raw = json.loads(json.dumps(request(server, *snapshot_files(binary_frame(60), FEATS, []), TASK,
                                        protocol("binary"), candidates("binary"))))
    raw["snapshot"]["matrix"]["sha256"] = "0" * 64
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.load(TrainerRequest.model_validate(raw), NOW)
    assert e.value.stage == "load-snapshot" and e.value.problem == "hash-mismatch"


def test_snapshot_expired_url_fails_load_snapshot(server: FileServer) -> None:
    m, n = snapshot_files(binary_frame(60), FEATS, [])
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.load(_request(server, m, n, expires="2026-10-12T00:00:00Z"), NOW)
    assert e.value.stage == "load-snapshot" and e.value.problem == "expired-url"


def test_a_url_without_an_expiry_never_expires(server: FileServer) -> None:
    snap = SN.load(_request(server, *_files(), expires=None), dt.datetime(2999, 1, 1, tzinfo=dt.timezone.utc))
    assert len(snap.row_ids) == 60


def test_a_file_url_is_read_from_the_local_file_system(server: FileServer) -> None:
    raw = json.loads(json.dumps(request(server, *_files(), TASK, protocol("binary"), candidates("binary"),
                                        expires=None)))
    for key, name in (("matrix", "snap-matrix.jsonl"), ("rowManifest", "snap-manifest.jsonl")):
        raw["snapshot"][key]["url"] = Path(server.root / name).as_uri()
    assert len(SN.load(TrainerRequest.model_validate(raw), NOW).row_ids) == 60


@pytest.mark.parametrize("url", ["ftp://127.0.0.1/snap-matrix.jsonl", "file:///nonexistent/ps-snapshot/matrix.jsonl"])
def test_an_unsupported_or_unreadable_url_is_a_download_failure(server: FileServer, url: str) -> None:
    raw = json.loads(json.dumps(request(server, *_files(), TASK, protocol("binary"), candidates("binary"))))
    raw["snapshot"]["matrix"]["url"] = url
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.load(TrainerRequest.model_validate(raw), NOW)
    assert e.value.problem == "download-failed" and raw["snapshot"]["matrix"]["fileId"] in e.value.message


# ------------------------------------------------------------------------------------------------ parsing -------

def test_the_snapshot_parses_into_typed_features_label_and_row_keys(server: FileServer) -> None:
    """Feature columns are typed (numeric float64 with NaN for missing, categorical text), the manifest gives the row
    keys and roles in matrix order, and the feature schema hash is the request's."""
    req = _request(server, *_files())
    snap = SN.load(req, NOW)
    assert [c.name for c in snap.columns] == ["x1", "x2", "city"]
    assert snap.frame["x1"].dtype == np.float64 and snap.frame["x1"].isna().any()
    assert set(snap.frame["city"]) <= {"NYC", "LA", "SF", "CHI"}
    assert snap.row_ids[:3] == ["r0", "r1", "r2"] and snap.entity_keys[3] == "e1"
    assert snap.roles[:4] == ["locked-holdout", "locked-holdout", "locked-holdout", "development"]
    assert set(snap.label.tolist()) <= {0, 1}
    assert snap.incumbent_score is None and snap.reference_score is None and snap.slice_values == {}
    assert snap.decision == SN.DecisionSpec(None, "year")
    assert snap.feature_schema_hash == req.snapshot.featureSchemaHash


def test_non_numeric_in_numeric_column_is_refused_by_name(server: FileServer) -> None:
    df = binary_frame(60).astype({"x2": object})
    df.loc[5, "x2"] = "twelve"
    m, n = snapshot_files(df, FEATS, [])
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.load(_request(server, m, n), NOW)
    assert e.value.problem == "non-numeric" and e.value.column == "x2"
    assert "'twelve'" in e.value.message and "'x2'" in e.value.message


def test_an_infinite_numeric_cell_is_refused_by_name() -> None:
    m, n = _files()
    lines = _lines(m)
    row = json.loads(lines[4])
    row[1] = 123456.789
    lines[4] = json.dumps(row).replace("123456.789", "1e400")
    failure = _refusal(_join(lines), n)
    assert failure.problem == "infinite" and failure.column == "x2"


def test_an_unknown_header_key_is_malformed() -> None:
    m, n = _files()
    failure = _refusal(_with_header(m, lambda h: h.update({"targetColumn": "y"})), n)
    assert failure.problem == "malformed" and "matrix.jsonl line 1" in failure.message


def _set_cap(cap: int) -> Callable[[JsonObject], None]:
    def change(h: JsonObject) -> None:
        numeric: JsonObject = {"kind": "numeric", "nonNumericValue": "fail"}
        h["featureColumns"] = [{"name": "x1", "sourceColumn": "x1", "encoding": numeric},
                               {"name": "x2", "sourceColumn": "x2", "encoding": numeric},
                               {"name": "city", "sourceColumn": "city",
                                "encoding": {"kind": "categorical", "cardinalityCap": cap, "method": "onehot"}}]
    return change


@pytest.mark.parametrize("change", [
    _set_cap(0),
    lambda h: h.update({"featureSchema": [{"name": "x1", "kind": "numeric"}]}),
    lambda h: h.update({"preprocessing": [{"op": "impute", "col": "x1", "strategy": "median", "extra": 1}]}),
    lambda h: h.update({"preprocessing": [{"op": "impute", "col": None}]}),
    lambda h: h.update({"decision": {"action": "review", "capacityPerPeriod": None, "period": "year"}}),
    lambda h: h.update({"incumbentScoreColumn": "score"}),
    lambda h: h.update({"format": "ps-snapshot-matrix/v0"}),
], ids=["cardinality-cap-0", "feature-schema-keys", "op-extra-key", "op-null-member", "decision-missing-member",
        "foreign-score-column", "format"])
def test_a_header_value_of_the_wrong_shape_is_malformed(change: Callable[[JsonObject], None]) -> None:
    m, n = _files()
    assert _refusal(_with_header(m, change), n).problem == "malformed"


def test_a_cardinality_cap_of_one_is_accepted() -> None:
    m, n = _files()
    snap = SN.parse_snapshot(_with_header(m, _set_cap(1)), n, HASH)
    assert snap.columns[2].encoding == CategoricalEncoding(1, "onehot")


def test_declared_impute_ops_become_the_columns_missing_policies() -> None:
    """Each numeric column's policy is the impute op naming it; a column no op names has none (the encoder's
    default); a categorical column's missing values are its own level, not a numeric fill."""
    m, n = _files()
    ops: list[JsonValue] = [{"op": "impute", "col": "x1", "strategy": "constant", "fillValue": 7, "indicator": True},
                            {"op": "impute", "col": "city", "strategy": "mode", "indicator": True},
                            {"op": "onehot", "col": "city"}]
    snap = SN.parse_snapshot(_with_header(m, lambda h: h.update({"preprocessing": ops})), n, HASH)
    by_name = {c.name: c for c in snap.columns}
    assert by_name["x1"].missing == MissingPolicy("constant", 7.0, True)
    assert by_name["x2"].missing is None
    assert by_name["city"].missing is None

    mean: list[JsonValue] = [{"op": "impute", "col": "x2", "strategy": "mean", "indicator": False}]
    plain = SN.parse_snapshot(_with_header(m, lambda h: h.update({"preprocessing": mean})), n, HASH)
    assert plain.columns[1].missing == MissingPolicy("mean", None, False)


@pytest.mark.parametrize("ops", [
    [{"op": "impute", "col": "x1", "strategy": "constant", "fillValue": "seven", "indicator": True}],
    [{"op": "impute", "col": "x1", "strategy": "constant", "indicator": True}],
    [{"op": "impute", "col": "x1", "indicator": True}],
    [{"op": "impute", "col": "x1", "strategy": "mean", "indicator": True},
     {"op": "impute", "col": "x1", "strategy": "median", "indicator": True}],
], ids=["text-fill", "no-fill", "no-strategy", "two-ops"])
def test_an_impute_op_that_states_no_single_numeric_policy_is_malformed(ops: list[JsonValue]) -> None:
    m, n = _files()
    failure = _refusal(_with_header(m, lambda h: h.update({"preprocessing": ops})), n)
    assert failure.problem == "malformed" and failure.column == "x1"


def test_categorical_levels_are_the_distinct_values_of_the_whole_snapshot() -> None:
    """Levels span development and holdout rows (label-free), sorted, with the missing token when a value is missing;
    numeric columns declare none."""
    df = binary_frame(60).astype({"city": object})
    df.loc[0, "city"] = "BOS"  # r0 is a locked-holdout row
    df.loc[10, "city"] = None
    m, n = snapshot_files(df, FEATS, ["r0"])
    snap = SN.parse_snapshot(m, n, HASH)
    assert snap.columns[2].levels == tuple(sorted({"BOS", "NYC", "LA", "SF", "CHI", MISSING_TOKEN}))
    assert snap.columns[0].levels is None and isinstance(snap.columns[0].encoding, NumericEncoding)

    full = SN.parse_snapshot(*_files(), HASH)
    assert full.columns[2].levels == ("CHI", "LA", "NYC", "SF")


def _drop_cell(m: bytes, n: bytes) -> tuple[bytes, bytes]:
    lines = _lines(m)
    lines[3] = json.dumps(json.loads(lines[3])[:-1])
    return _join(lines), n


def _drop_key(m: bytes, n: bytes) -> tuple[bytes, bytes]:
    return m, _join(_lines(n)[:-1])


def _edit_key(change: Callable[[JsonObject], object]) -> Callable[[bytes, bytes], tuple[bytes, bytes]]:
    def edit(m: bytes, n: bytes) -> tuple[bytes, bytes]:
        lines = _lines(n)
        key: JsonObject = json.loads(lines[4])
        change(key)
        lines[4] = json.dumps(key)
        return m, _join(lines)
    return edit


def _blank_line(m: bytes, n: bytes) -> tuple[bytes, bytes]:
    lines = _lines(m)
    return _join([*lines[:2], "", *lines[2:]]), n


def _nan_token(m: bytes, n: bytes) -> tuple[bytes, bytes]:
    lines = _lines(m)
    row = json.loads(lines[2])
    row[1] = 123456.789
    lines[2] = json.dumps(row).replace("123456.789", "NaN")
    return _join(lines), n


@pytest.mark.parametrize("damage, names", [
    (_drop_cell, "matrix.jsonl line 4"),
    (_drop_key, "manifest.jsonl"),
    (_edit_key(lambda k: k.update({"rowId": "r0"})), "r0"),
    (_edit_key(lambda k: k.update({"role": "validation"})), "manifest.jsonl line 5"),
    (_edit_key(lambda k: k.update({"rowId": 4})), "manifest.jsonl line 5"),
    (_edit_key(lambda k: k.pop("period")), "manifest.jsonl line 5"),
    (_blank_line, "matrix.jsonl line 3"),
    (_nan_token, "matrix.jsonl line 3"),
    (lambda m, n: (b"", n), "matrix.jsonl"),
], ids=["row-width", "row-count", "duplicate-row-id", "unknown-role", "non-text-row-id", "missing-key-member",
        "blank-line", "nan-token", "no-header"])
def test_files_that_do_not_align_or_parse_are_malformed(damage: Callable[[bytes, bytes], tuple[bytes, bytes]],
                                                        names: str) -> None:
    failure = _refusal(*damage(*_files()))
    assert failure.problem == "malformed" and names in failure.message


def test_period_ordinals_count_whole_decision_periods() -> None:
    snap = SN.parse_snapshot(*_files(), HASH)
    years = [int(d[:4]) for d in snap.decision_dates]
    assert SN.period_ordinals(snap).tolist() == years
