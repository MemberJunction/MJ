"""Training Snapshot download, verification and typed parsing for the trainer.

The sidecar cannot call MJ storage. The request carries a pre-authorised URL for each of the two files the trainer
reads (`matrix.jsonl`, `manifest.jsonl`); both are downloaded at request start and each file's SHA-256 is verified
before it is parsed. An expired URL, a failed download, a hash mismatch, a malformed file, text in a numeric column or
a non-finite number ends the run `failed` at stage `load-snapshot` (`SnapshotLoadFailure`, with a structured
`problem` and, for a cell problem, the column). Nothing is coerced: a numeric cell holding text is a refusal naming
the column, never a 0 or a missing value.

The header is checked against a strict mirror of Core's `StoreSchemas.SnapshotMatrixHeader` (every object forbids
unknown keys, every member has the TypeScript type), and the structure across the files is checked as the engine's
`SnapshotFiles.ParseSnapshotFiles` checks it: every row is as wide as the header's columns, matrix row i is manifest
line i so the counts must agree, and every manifest line is a `SnapshotRowKey` with a distinct `rowId`. The matrix
carries no row-id column, so rows and row keys align by position only.

URLs: `http(s)://` (cloud storage drivers) and `file://` (the local file-system driver, whose files only processes on
the same host can read; this sidecar runs co-located with the engine in that deployment). A URL whose `expiresAt` is
null does not expire (the local driver issues no lifetime). Any other scheme is a failed download, and so is a
redirect to anything but http or https. A download is bounded by the run clock (the request timeout and the compute
budget: past either the run stops at that stage) and by a size cap per file (`MAX_SNAPSHOT_FILE_BYTES`).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import http.client
import json
import math
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import IO, Annotated, Dict, List, Literal, Mapping, Optional, Sequence, Tuple, Union

import numpy as np
import numpy.typing as npt
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from .encoding import (
    MISSING_TOKEN,
    CategoricalEncoding,
    ColumnSpec,
    Encoding,
    IdentifierEncoding,
    MissingPolicy,
    NumericEncoding,
)
from .failures import RunClock, SnapshotLoadFailure
from .snapshot_format import INCUMBENT_SCORE_COLUMN, MATRIX_FORMAT, REFERENCE_SCORE_COLUMN
from .trainer_schemas import PreAuthDownload, TrainerRequest

FArr = npt.NDArray[np.float64]
Cell = Union[str, int, float, bool, None]
RowRole = Literal["development", "locked-holdout"]
DecisionPeriod = Literal["day", "week", "month", "quarter", "year"]
MATRIX_FILE = "matrix.jsonl"
MANIFEST_FILE = "manifest.jsonl"
_URL_SCHEMES = frozenset({"http", "https", "file"})
_REDIRECT_SCHEMES = frozenset({"http", "https"})
# The largest snapshot file the trainer downloads (1 GiB): a larger body is refused rather than read into memory.
MAX_SNAPSHOT_FILE_BYTES = 1 << 30
_CHUNK_BYTES = 1 << 20


# ---------------------------------------------------------------------------------------------- download -------

def _instant(text: str) -> dt.datetime:
    v = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    return v if v.tzinfo is not None else v.replace(tzinfo=dt.timezone.utc)


def _refuse_expired(d: PreAuthDownload, now: dt.datetime) -> None:
    """Refuses a URL past its expiry; a null expiry never expires. An expiry that cannot be read fails closed."""
    if d.expiresAt is None:
        return
    try:
        expires = _instant(d.expiresAt)
    except ValueError as exc:
        raise SnapshotLoadFailure("expired-url", f"pre-authorised URL for file {d.fileId} has an unreadable expiry "
                                                 f"{d.expiresAt!r}") from exc
    at = now if now.tzinfo is not None else now.replace(tzinfo=dt.timezone.utc)
    if at >= expires:
        raise SnapshotLoadFailure("expired-url", f"pre-authorised URL for file {d.fileId} expired at {d.expiresAt}")


class _SchemeCheckedRedirect(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to http or https: a pre-authorised URL must not lead the sidecar to another scheme."""

    def redirect_request(self, req: urllib.request.Request, fp: IO[bytes], code: int, msg: str,
                         headers: http.client.HTTPMessage, newurl: str) -> Optional[urllib.request.Request]:
        scheme = urllib.parse.urlsplit(newurl).scheme.lower()
        if scheme not in _REDIRECT_SCHEMES:
            raise urllib.error.HTTPError(newurl, code, f"redirect to a {scheme!r} URL is refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_SchemeCheckedRedirect)


def _read_bounded(d: PreAuthDownload, clock: RunClock, max_bytes: int) -> bytes:
    """Read the body in chunks, refusing it past `max_bytes` and checking the run clock after every chunk. Each socket
    operation also times out at the time left when the download started, so one stalled read cannot outlast it."""
    where = f"download of file {d.fileId}"
    clock.check(where)
    chunks: List[bytes] = []
    total = 0
    with _OPENER.open(d.url, timeout=max(clock.remaining_seconds(), 0.001)) as resp:  # noqa: S310 - scheme checked
        while True:
            chunk: bytes = resp.read(_CHUNK_BYTES)
            if not chunk:
                return b"".join(chunks)
            total += len(chunk)
            if total > max_bytes:
                raise SnapshotLoadFailure("download-failed", f"download of file {d.fileId} failed: the file is larger "
                                                             f"than the {max_bytes} bytes a snapshot file may be")
            chunks.append(chunk)
            clock.check(where)


def fetch_verified(d: PreAuthDownload, now: dt.datetime, clock: RunClock,
                   max_bytes: int = MAX_SNAPSHOT_FILE_BYTES) -> bytes:
    """Download one pre-authorised file within the run clock and the size cap, and verify its SHA-256.

    Raises:
        SnapshotLoadFailure: `expired-url`, `download-failed` (also for a URL scheme other than http, https or file, a
            redirect to anything but http or https, and a file larger than `max_bytes`) or `hash-mismatch`.
        TrainerFailure: `timeout` or `budget-exceeded` when the run clock runs out during the download.
    """
    _refuse_expired(d, now)
    scheme = urllib.parse.urlsplit(d.url).scheme.lower()
    if scheme not in _URL_SCHEMES:
        raise SnapshotLoadFailure("download-failed", f"download of file {d.fileId} failed: unsupported URL scheme "
                                                     f"{scheme!r}")
    try:
        body = _read_bounded(d, clock, max_bytes)
    except (OSError, http.client.HTTPException, ValueError) as exc:
        raise SnapshotLoadFailure("download-failed", f"download of file {d.fileId} failed: {exc}") from exc
    digest = hashlib.sha256(body).hexdigest()
    if digest != d.sha256:
        raise SnapshotLoadFailure("hash-mismatch", f"file {d.fileId} SHA-256 {digest} does not match the declared "
                                                   f"{d.sha256}")
    return body


# --------------------------------------------------------------------------------------- header mirror -------

class _Stored(BaseModel):
    """A stored shape: frozen, unknown keys refused, and no type coercion (a "3" is not a 3), as Core's zod schemas."""
    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)


class _NumericColumnEncoding(_Stored):
    kind: Literal["numeric"]
    nonNumericValue: Literal["fail"]


class _CategoricalColumnEncoding(_Stored):
    kind: Literal["categorical"]
    cardinalityCap: int = Field(ge=1)
    method: Literal["onehot", "hashed", "target-in-fold"]


class _DatePartsColumnEncoding(_Stored):
    kind: Literal["date-parts"]
    parts: List[Literal["year", "month", "dow", "days-since-decision"]]


class _BooleanColumnEncoding(_Stored):
    kind: Literal["boolean"]


class _IdentifierColumnEncoding(_Stored):
    kind: Literal["identifier"]
    policy: Literal["exclude"]


_ColumnEncoding = Annotated[
    Union[_NumericColumnEncoding, _CategoricalColumnEncoding, _DatePartsColumnEncoding, _BooleanColumnEncoding,
          _IdentifierColumnEncoding],
    Field(discriminator="kind"),
]


class _FeatureColumnHeader(_Stored):
    name: str
    sourceColumn: str
    encoding: _ColumnEncoding


class _DecisionHeader(_Stored):
    action: str
    actorRole: str
    capacityPerPeriod: Optional[Annotated[float, Field(ge=0)]]
    period: DecisionPeriod


class _FeatureSchemaEntry(_Stored):
    Name: str
    Kind: Literal["numeric", "categorical", "embedding", "llm-derived", "decision-derived"]


class _PreprocessingOp(_Stored):
    """Core `PreprocessingOp`: every member but `op` may be absent, none may be null."""
    op: str
    col: Optional[str] = None
    cols: Optional[List[str]] = None
    strategy: Optional[Literal["mean", "median", "mode", "constant"]] = None
    fillValue: Optional[Union[str, float]] = None
    bins: Optional[Annotated[int, Field(ge=1)]] = None
    indicator: Optional[bool] = None

    @model_validator(mode="before")
    @classmethod
    def _no_null_members(cls, raw: object) -> object:
        if isinstance(raw, dict):
            nulls = sorted(str(k) for k, v in raw.items() if v is None)
            if nulls:
                raise ValueError(f"members may be absent but not null: {', '.join(nulls)}")
        return raw


class _MatrixHeader(_Stored):
    """Core `StoreSchemas.SnapshotMatrixHeader`, member for member."""
    format: str
    columns: List[str]
    labelColumn: str
    featureColumns: List[_FeatureColumnHeader]
    incumbentScoreColumn: Optional[str]
    referenceScoreColumn: Optional[str]
    sliceColumns: Dict[str, str]
    decision: _DecisionHeader
    featureSchema: List[_FeatureSchemaEntry]
    preprocessing: List[_PreprocessingOp]

    @field_validator("format")
    @classmethod
    def _format(cls, v: str) -> str:
        if v != MATRIX_FORMAT:
            raise ValueError(f"format must be {MATRIX_FORMAT}")
        return v

    @field_validator("incumbentScoreColumn")
    @classmethod
    def _incumbent(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != INCUMBENT_SCORE_COLUMN:
            raise ValueError(f"must be {INCUMBENT_SCORE_COLUMN} or null")
        return v

    @field_validator("referenceScoreColumn")
    @classmethod
    def _reference(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v != REFERENCE_SCORE_COLUMN:
            raise ValueError(f"must be {REFERENCE_SCORE_COLUMN} or null")
        return v


class _RowKey(_Stored):
    """Core `StoreSchemas.SnapshotRowKey`: one manifest line."""
    rowId: str
    entityKey: str
    decisionDate: str
    groupKey: Optional[str]
    period: Optional[str]
    role: RowRole


# -------------------------------------------------------------------------------------------- the snapshot -------

@dataclass(frozen=True)
class DecisionSpec:
    capacity_per_period: Optional[float]
    period: DecisionPeriod


@dataclass(frozen=True)
class Snapshot:
    """A verified, parsed Training Snapshot. Every per-row list is in matrix (= manifest) order."""
    columns: List[ColumnSpec]
    frame: pd.DataFrame                  # feature columns only: numeric float64 (NaN missing), categorical str/None
    label: npt.NDArray[np.object_]       # the raw label cells
    row_ids: List[str]
    entity_keys: List[str]
    group_keys: List[Optional[str]]
    decision_dates: List[str]
    periods: List[Optional[str]]
    roles: List[RowRole]
    incumbent_score: Optional[FArr]
    reference_score: Optional[FArr]
    slice_values: Dict[str, List[str]]
    decision: DecisionSpec
    feature_schema_hash: str


# ------------------------------------------------------------------------------------------------ parsing -------

def _problems(exc: ValidationError) -> str:
    return "; ".join(f"{'.'.join(str(p) for p in e['loc']) or '(line)'}: {e['msg']}" for e in exc.errors())


def _refuse_constant(token: str) -> float:
    raise ValueError(f"{token} is not JSON")


def _json_lines(body: bytes, file: str) -> List[object]:
    """JSON Lines -> values. Only the final line terminator is dropped, so a blank line inside the file is refused,
    as is `NaN`/`Infinity` (not JSON)."""
    try:
        lines = body.decode("utf-8").split("\n")
    except UnicodeDecodeError as exc:
        raise SnapshotLoadFailure("malformed", f"{file} is not UTF-8: {exc}") from exc
    if lines[-1] == "":
        lines.pop()
    out: List[object] = []
    for i, line in enumerate(lines):
        try:
            out.append(json.loads(line, parse_constant=_refuse_constant))
        except ValueError as exc:
            raise SnapshotLoadFailure("malformed", f"{file} line {i + 1}: {exc}") from exc
    return out


def _header(value: object) -> _MatrixHeader:
    try:
        header = _MatrixHeader.model_validate(value)
    except ValidationError as exc:
        raise SnapshotLoadFailure("malformed", f"{MATRIX_FILE} line 1: {_problems(exc)}") from exc
    named = [header.labelColumn, *(c.name for c in header.featureColumns), *header.sliceColumns.values()]
    named += [c for c in (header.incumbentScoreColumn, header.referenceScoreColumn) if c is not None]
    if len(set(header.columns)) != len(header.columns):
        raise SnapshotLoadFailure("malformed", f"{MATRIX_FILE} line 1: the header lists a column twice")
    absent = [c for c in named if c not in header.columns]
    if absent:
        raise SnapshotLoadFailure("malformed", f"{MATRIX_FILE} line 1: {', '.join(absent)} not in the header's columns")
    return header


def _rows(values: Sequence[object], width: int) -> List[List[Cell]]:
    """Matrix rows (line 2 on): JSON arrays of scalar cells, exactly as wide as the header's columns."""
    rows: List[List[Cell]] = []
    for i, v in enumerate(values):
        line = i + 2
        if not isinstance(v, list) or not all(c is None or isinstance(c, (str, int, float, bool)) for c in v):
            raise SnapshotLoadFailure("malformed", f"{MATRIX_FILE} line {line}: a row is a JSON array of scalars")
        if len(v) != width:
            raise SnapshotLoadFailure("malformed", f"{MATRIX_FILE} line {line}: the row has {len(v)} cells; the header "
                                                   f"lists {width} columns")
        rows.append(v)
    return rows


def _row_keys(values: Sequence[object], rows: int) -> List[_RowKey]:
    if rows != len(values):
        raise SnapshotLoadFailure("malformed", f"{MATRIX_FILE} has {rows} rows but {MANIFEST_FILE} has {len(values)} "
                                               "row keys; matrix row i is manifest line i")
    keys: List[_RowKey] = []
    seen: Dict[str, int] = {}
    for i, v in enumerate(values):
        try:
            key = _RowKey.model_validate(v)
        except ValidationError as exc:
            raise SnapshotLoadFailure("malformed", f"{MANIFEST_FILE} line {i + 1}: {_problems(exc)}") from exc
        if key.rowId in seen:
            raise SnapshotLoadFailure("malformed", f"{MANIFEST_FILE} line {i + 1}: rowId {key.rowId!r} is also line "
                                                   f"{seen[key.rowId]}'s")
        seen[key.rowId] = i + 1
        keys.append(key)
    return keys


def _refuse_non_finite(rows: Sequence[Sequence[Cell]], columns: Sequence[str]) -> None:
    """A number JSON cannot hold (it parsed beyond float range) is refused in any column, naming the column."""
    for r in rows:
        for j, v in enumerate(r):
            if isinstance(v, float) and not math.isfinite(v):
                raise SnapshotLoadFailure("infinite", f"non-finite value in column '{columns[j]}'", columns[j])
            if isinstance(v, int) and not isinstance(v, bool):
                try:
                    float(v)
                except OverflowError as exc:
                    raise SnapshotLoadFailure("infinite", f"value beyond float range in column '{columns[j]}'",
                                              columns[j]) from exc


def _numeric(column: str, cells: Sequence[Cell]) -> FArr:
    """Numeric cells: a number (a boolean reads 1/0), or null for missing. The engine writes nothing else in a
    numeric column, so any text is refused."""
    out = np.empty(len(cells), dtype=np.float64)
    for i, v in enumerate(cells):
        if v is None:
            out[i] = np.nan
        elif isinstance(v, str):
            raise SnapshotLoadFailure("non-numeric", f"non-numeric value {v!r} in numeric column '{column}'", column)
        else:
            out[i] = float(v)
    return out


def _categorical(cells: Sequence[Cell]) -> List[Optional[str]]:
    return [None if v is None or (isinstance(v, str) and v.strip() == "") else str(v) for v in cells]


def _encoding(raw: _ColumnEncoding) -> Encoding:
    if isinstance(raw, _CategoricalColumnEncoding):
        return CategoricalEncoding(raw.cardinalityCap, raw.method)
    if isinstance(raw, _IdentifierColumnEncoding):
        return IdentifierEncoding("exclude")
    return NumericEncoding(raw.kind)


def _policies(ops: Sequence[_PreprocessingOp], numeric: Sequence[str]) -> Dict[str, MissingPolicy]:
    """Each numeric column's declared impute policy, from the impute op naming it.

    Categorical columns are skipped: their missing values encode as their own level (the missing token), so a
    categorical impute op states no numeric fill.
    """
    out: Dict[str, MissingPolicy] = {}
    for op in ops:
        if op.op != "impute" or op.col is None or op.col not in numeric:
            continue
        col = op.col
        if col in out:
            raise SnapshotLoadFailure("malformed", f"two impute ops name column '{col}'", col)
        if op.strategy is None:
            raise SnapshotLoadFailure("malformed", f"the impute op of column '{col}' has no strategy", col)
        fill = op.fillValue
        if op.strategy == "constant" and not isinstance(fill, float):
            raise SnapshotLoadFailure("malformed", f"the constant impute of numeric column '{col}' needs a numeric "
                                                   f"fill value, got {fill!r}", col)
        out[col] = MissingPolicy(op.strategy, fill if isinstance(fill, float) else None, op.indicator is True)
    return out


def _levels(values: Sequence[Optional[str]]) -> Tuple[str, ...]:
    """A categorical column's declared levels: its distinct values over every row (label-free), sorted, with the
    missing token when any value is missing."""
    distinct = {MISSING_TOKEN if v is None else v for v in values}
    return tuple(sorted(distinct))


def _features(header: _MatrixHeader, rows: Sequence[Sequence[Cell]],
              pos: Mapping[str, int]) -> Tuple[List[ColumnSpec], pd.DataFrame]:
    """The ColumnSpecs (encoding, declared impute policy, declared levels) and the typed feature frame."""
    numeric = [c.name for c in header.featureColumns if isinstance(_encoding(c.encoding), NumericEncoding)]
    policies = _policies(header.preprocessing, numeric)
    specs: List[ColumnSpec] = []
    data: Dict[str, Union[FArr, List[Optional[str]]]] = {}
    for c in header.featureColumns:
        enc = _encoding(c.encoding)
        cells = [r[pos[c.name]] for r in rows]
        if isinstance(enc, NumericEncoding):
            data[c.name] = _numeric(c.name, cells)
            specs.append(ColumnSpec(c.name, c.sourceColumn, enc, policies.get(c.name)))
        else:
            values = _categorical(cells)
            data[c.name] = values
            levels = _levels(values) if isinstance(enc, CategoricalEncoding) else None
            specs.append(ColumnSpec(c.name, c.sourceColumn, enc, None, levels))
    return specs, pd.DataFrame(data, index=pd.RangeIndex(len(rows)))


def _slices(header: _MatrixHeader, rows: Sequence[Sequence[Cell]], pos: Mapping[str, int]) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for field, col in header.sliceColumns.items():
        values: List[str] = []
        for r in rows:
            v = r[pos[col]]
            if not isinstance(v, str):
                raise SnapshotLoadFailure("malformed", f"slice column '{col}' holds the non-text value {v!r}", col)
            values.append(v)
        out[field] = values
    return out


def parse_snapshot(matrix: bytes, manifest: bytes, feature_schema_hash: str) -> Snapshot:
    """Parse verified snapshot files: matrix.jsonl (line 1 the header, then one JSON array per row) and
    manifest.jsonl (one SnapshotRowKey per line, line i the key of matrix row i).

    `feature_schema_hash` is the engine's hash from the request, carried onto the snapshot: the engine computes it over
    its canonical JSON bytes (MJ's `Canonicalize`), which this module does not reproduce, so the sidecar echoes it
    rather than recomputing a value that could differ for the same schema.

    Raises:
        SnapshotLoadFailure: `malformed`, `non-numeric` or `infinite`.
    """
    lines = _json_lines(matrix, MATRIX_FILE)
    if not lines:
        raise SnapshotLoadFailure("malformed", f"{MATRIX_FILE} has no header line")
    header = _header(lines[0])
    rows = _rows(lines[1:], len(header.columns))
    keys = _row_keys(_json_lines(manifest, MANIFEST_FILE), len(rows))
    _refuse_non_finite(rows, header.columns)
    pos = {c: i for i, c in enumerate(header.columns)}
    specs, frame = _features(header, rows, pos)

    def score(col: Optional[str]) -> Optional[FArr]:
        return None if col is None else _numeric(col, [r[pos[col]] for r in rows])

    return Snapshot(
        columns=specs, frame=frame,
        label=np.asarray([r[pos[header.labelColumn]] for r in rows], dtype=object),
        row_ids=[k.rowId for k in keys], entity_keys=[k.entityKey for k in keys],
        group_keys=[k.groupKey for k in keys], decision_dates=[k.decisionDate for k in keys],
        periods=[k.period for k in keys], roles=[k.role for k in keys],
        incumbent_score=score(header.incumbentScoreColumn), reference_score=score(header.referenceScoreColumn),
        slice_values=_slices(header, rows, pos),
        decision=DecisionSpec(header.decision.capacityPerPeriod, header.decision.period),
        feature_schema_hash=feature_schema_hash,
    )


def load(req: TrainerRequest, now: dt.datetime, clock: RunClock) -> Snapshot:
    """Download, verify and parse the request's snapshot within the run clock. Raises SnapshotLoadFailure (stage
    `load-snapshot`), or TrainerFailure (`timeout`/`budget-exceeded`) when the clock runs out while downloading."""
    matrix = fetch_verified(req.snapshot.matrix, now, clock)
    manifest = fetch_verified(req.snapshot.rowManifest, now, clock)
    return parse_snapshot(matrix, manifest, req.snapshot.featureSchemaHash)


def _ordinal(day: dt.date, period: DecisionPeriod) -> int:
    if period == "year":
        return day.year
    if period == "quarter":
        return day.year * 4 + (day.month - 1) // 3
    if period == "month":
        return day.year * 12 + day.month - 1
    if period == "week":
        return day.toordinal() // 7
    return day.toordinal()


def period_ordinals(snap: Snapshot) -> npt.NDArray[np.int64]:
    """Integer period index per row at the unit's decision period, so gaps between training and test rows are counted
    in whole decision periods. The manifest's `period` wins when it is set (an empty one is malformed, not a fallback
    to the decision date); a null period buckets the decision date.

    Raises:
        SnapshotLoadFailure: `malformed`, when a row's period or decision date is not a yyyy-mm-dd day.
    """
    out = np.empty(len(snap.row_ids), dtype=np.int64)
    for i, (p, d) in enumerate(zip(snap.periods, snap.decision_dates)):
        text = d if p is None else p
        try:
            day = dt.date.fromisoformat(text[:10])
        except ValueError as exc:
            raise SnapshotLoadFailure("malformed", f"row {snap.row_ids[i]}: {text!r} is not a yyyy-mm-dd day") from exc
        out[i] = _ordinal(day, snap.decision.period)
    return out
