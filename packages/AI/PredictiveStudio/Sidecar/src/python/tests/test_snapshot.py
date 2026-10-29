"""Snapshot download, SHA-256 verification and typed parsing (stage load-snapshot)."""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
import threading
from collections.abc import Callable, Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import pytest

from app import snapshot as SN
from app.encoding import MISSING_TOKEN, CategoricalEncoding, MissingPolicy, NumericEncoding
from app.failures import RunClock, SnapshotLoadFailure, TrainerFailure
from app.trainer_schemas import TrainerRequest
from tests.tools.trainer_fixture import FileServer, JsonObject, JsonValue, candidates, protocol, request, snapshot_files
from tests.tools.trainer_scaffold import FEATS, TASK, binary_frame, server  # noqa: F401 - `server` is a pytest fixture

NOW = dt.datetime(2026, 10, 12, tzinfo=dt.timezone.utc)
HASH = "a" * 64


def _clock() -> RunClock:
    return RunClock(600, 600)


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
        SN.load(TrainerRequest.model_validate(raw), NOW, _clock())
    assert e.value.stage == "load-snapshot" and e.value.problem == "hash-mismatch"


def test_snapshot_expired_url_fails_load_snapshot(server: FileServer) -> None:
    m, n = snapshot_files(binary_frame(60), FEATS, [])
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.load(_request(server, m, n, expires="2026-10-12T00:00:00Z"), NOW, _clock())
    assert e.value.stage == "load-snapshot" and e.value.problem == "expired-url"


def test_a_url_without_an_expiry_never_expires(server: FileServer) -> None:
    snap = SN.load(_request(server, *_files(), expires=None), dt.datetime(2999, 1, 1, tzinfo=dt.timezone.utc), _clock())
    assert len(snap.row_ids) == 60


def test_a_file_url_is_read_from_the_local_file_system(server: FileServer) -> None:
    raw = json.loads(json.dumps(request(server, *_files(), TASK, protocol("binary"), candidates("binary"),
                                        expires=None)))
    for key, name in (("matrix", "snap-matrix.jsonl"), ("rowManifest", "snap-manifest.jsonl")):
        raw["snapshot"][key]["url"] = Path(server.root / name).as_uri()
    assert len(SN.load(TrainerRequest.model_validate(raw), NOW, _clock()).row_ids) == 60


def test_an_unreadable_expiry_fails_closed_as_expired(server: FileServer) -> None:
    m, n = snapshot_files(binary_frame(60), FEATS, [])
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.load(_request(server, m, n, expires="not a date"), NOW, _clock())
    assert e.value.problem == "expired-url" and "unreadable expiry" in e.value.message


def test_a_download_larger_than_the_size_cap_is_a_download_failure(server: FileServer) -> None:
    req = _request(server, *_files())
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.fetch_verified(req.snapshot.matrix, NOW, _clock(), max_bytes=1024)
    assert e.value.problem == "download-failed" and "1024 bytes" in e.value.message
    assert len(SN.fetch_verified(req.snapshot.matrix, NOW, _clock(), max_bytes=1 << 20)) > 1024


def test_a_download_is_bounded_by_the_run_clock(server: FileServer) -> None:
    req = _request(server, *_files())
    with pytest.raises(TrainerFailure) as e:
        SN.fetch_verified(req.snapshot.matrix, NOW, RunClock(timeout_seconds=0.0, max_compute_seconds=600))
    assert e.value.stage == "timeout" and req.snapshot.matrix.fileId in e.value.message


class _RunsOutAfterFirstCheck(RunClock):
    """A run clock with time left when the download starts that runs out at its next check."""

    def __init__(self) -> None:
        super().__init__(600, 600)
        self.checks = 0

    def check(self, where: str) -> None:
        self.checks += 1
        if self.checks > 1:
            raise TrainerFailure("timeout", f"timeout of 600s exceeded during {where}")


def test_a_download_stops_when_the_run_clock_runs_out_while_reading(server: FileServer) -> None:
    req = _request(server, *_files())
    clock = _RunsOutAfterFirstCheck()
    with pytest.raises(TrainerFailure) as e:
        SN.fetch_verified(req.snapshot.matrix, NOW, clock)
    assert e.value.stage == "timeout" and clock.checks == 2


class _Redirect(BaseHTTPRequestHandler):
    """Answers every GET with a 302 to the URL in the server's `location` attribute."""

    def do_GET(self) -> None:  # noqa: N802 - the stdlib handler names it do_GET
        self.send_response(302)
        self.send_header("Location", getattr(self.server, "location"))
        self.end_headers()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - the stdlib signature names it `format`
        return


@pytest.fixture()
def redirector() -> Iterator[ThreadingHTTPServer]:
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Redirect)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield httpd
    httpd.shutdown()
    httpd.server_close()


def _redirected(server: FileServer, redirector: ThreadingHTTPServer, location: str) -> TrainerRequest:
    raw = json.loads(json.dumps(request(server, *_files(), TASK, protocol("binary"), candidates("binary"))))
    setattr(redirector, "location", location)
    raw["snapshot"]["matrix"]["url"] = f"http://127.0.0.1:{redirector.server_address[1]}/snap-matrix.jsonl"
    return TrainerRequest.model_validate(raw)


def test_a_redirect_off_http_or_https_is_a_download_failure(server: FileServer,
                                                            redirector: ThreadingHTTPServer) -> None:
    req = _redirected(server, redirector, "ftp://127.0.0.1/snap-matrix.jsonl")
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.fetch_verified(req.snapshot.matrix, NOW, _clock())
    assert e.value.problem == "download-failed" and "'ftp'" in e.value.message


def test_a_redirect_to_http_is_followed(server: FileServer, redirector: ThreadingHTTPServer) -> None:
    req = _redirected(server, redirector, f"{server.base}/snap-matrix.jsonl")
    assert SN.fetch_verified(req.snapshot.matrix, NOW, _clock()).startswith(b"{")


@pytest.mark.parametrize("url", ["ftp://127.0.0.1/snap-matrix.jsonl", "file:///nonexistent/ps-snapshot/matrix.jsonl"])
def test_an_unsupported_or_unreadable_url_is_a_download_failure(server: FileServer, url: str) -> None:
    raw = json.loads(json.dumps(request(server, *_files(), TASK, protocol("binary"), candidates("binary"))))
    raw["snapshot"]["matrix"]["url"] = url
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.load(TrainerRequest.model_validate(raw), NOW, _clock())
    assert e.value.problem == "download-failed" and raw["snapshot"]["matrix"]["fileId"] in e.value.message


# ------------------------------------------------------------------------------------------------ parsing -------

def test_the_snapshot_parses_into_typed_features_label_and_row_keys(server: FileServer) -> None:
    """Feature columns are typed (numeric float64 with NaN for missing, categorical text), the manifest gives the row
    keys and roles in matrix order, and the feature schema hash is the request's."""
    req = _request(server, *_files())
    snap = SN.load(req, NOW, _clock())
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
        SN.load(_request(server, m, n), NOW, _clock())
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


def _dated(snap: SN.Snapshot, period: SN.DecisionPeriod, dates: list[str],
           periods: list[str | None] | None = None) -> SN.Snapshot:
    """`snap` cut to len(dates) rows with those decision dates (and manifest periods) at the decision period."""
    n = len(dates)
    return dataclasses.replace(snap, row_ids=snap.row_ids[:n], decision_dates=dates,
                               periods=periods if periods is not None else [None] * n,
                               decision=SN.DecisionSpec(None, period))


@pytest.mark.parametrize(
    "period,expected",
    [
        ("quarter", [2024 * 4 + 0, 2024 * 4 + 0, 2024 * 4 + 1, 2024 * 4 + 3, 2025 * 4 + 0]),
        ("month", [2024 * 12 + 0, 2024 * 12 + 2, 2024 * 12 + 3, 2024 * 12 + 11, 2025 * 12 + 0]),
        ("week", [dt.date(2024, 1, 1).toordinal() // 7, dt.date(2024, 3, 31).toordinal() // 7,
                  dt.date(2024, 4, 1).toordinal() // 7, dt.date(2024, 12, 31).toordinal() // 7,
                  dt.date(2025, 1, 1).toordinal() // 7]),
        ("day", [dt.date(2024, 1, 1).toordinal(), dt.date(2024, 3, 31).toordinal(), dt.date(2024, 4, 1).toordinal(),
                 dt.date(2024, 12, 31).toordinal(), dt.date(2025, 1, 1).toordinal()]),
    ],
)
def test_period_ordinals_bucket_each_decision_period(period: SN.DecisionPeriod, expected: list[int]) -> None:
    dates = ["2024-01-01", "2024-03-31", "2024-04-01", "2024-12-31", "2025-01-01"]
    assert SN.period_ordinals(_dated(SN.parse_snapshot(*_files(), HASH), period, dates)).tolist() == expected


@pytest.mark.parametrize(
    "period,starts",
    [
        ("year", ["2024-01-01", "2024-01-01", "2024-01-01", "2024-01-01", "2025-01-01"]),
        ("quarter", ["2024-01-01", "2024-01-01", "2024-04-01", "2024-10-01", "2025-01-01"]),
        ("month", ["2024-01-01", "2024-03-01", "2024-04-01", "2024-12-01", "2025-01-01"]),
        ("week", [dt.date.fromordinal(dt.date(2024, m, d).toordinal() // 7 * 7).isoformat()
                  for m, d in ((1, 1), (3, 31), (4, 1), (12, 31))] + [dt.date.fromordinal(dt.date(2025, 1, 1).toordinal() // 7 * 7).isoformat()]),
        ("day", ["2024-01-01", "2024-03-31", "2024-04-01", "2024-12-31", "2025-01-01"]),
    ],
)
def test_period_start_is_the_first_day_of_each_rows_period(period: SN.DecisionPeriod, starts: list[str]) -> None:
    """The start of a period buckets back to the same ordinal, so slices and ordinals cannot disagree."""
    dates = ["2024-01-01", "2024-03-31", "2024-04-01", "2024-12-31", "2025-01-01"]
    ordinals = SN.period_ordinals(_dated(SN.parse_snapshot(*_files(), HASH), period, dates)).tolist()
    got = [SN.period_start(o, period) for o in ordinals]
    assert [d.isoformat() for d in got] == starts
    assert SN.period_ordinals(_dated(SN.parse_snapshot(*_files(), HASH), period, starts)).tolist() == ordinals


def test_the_manifest_period_takes_precedence_over_the_decision_date() -> None:
    snap = _dated(SN.parse_snapshot(*_files(), HASH), "quarter", ["2024-01-15", "2024-01-15"], ["2024-07-01", None])
    assert SN.period_ordinals(snap).tolist() == [2024 * 4 + 2, 2024 * 4 + 0]


def test_an_empty_manifest_period_is_malformed_not_the_decision_date() -> None:
    snap = _dated(SN.parse_snapshot(*_files(), HASH), "year", ["2024-01-15"], [""])
    with pytest.raises(SnapshotLoadFailure) as e:
        SN.period_ordinals(snap)
    assert e.value.problem == "malformed" and snap.row_ids[0] in e.value.message
