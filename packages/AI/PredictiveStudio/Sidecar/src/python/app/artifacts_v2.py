"""Trainer predictor artifacts (`ps-predictor/v2`).

A v2 artifact is the UTF-8 JSON envelope below, carried base64-encoded as `bytesBase64`. `sha256` is the SHA-256 of
the envelope BYTES (what the engine stores as the model file), so the engine can compare it with the stored file's
hash. The payload is a joblib dump of one whole fitted trainer predictor (in-fold encoding + estimator + optional
calibration map); it is loaded only through the restricted unpickler (`artifacts.load_v2_envelope`).

    {"format": "ps-predictor/v2", "version": 2, "payload_b64": "...", "featureColumns": [column...],
     "taskKind": "...", "classOrder": [...] | null, "featureSchemaHash": "<sha256>",
     "driverBaseline": [...] | null, "transformedColumns": [...] | null}

Only a trainer predictor ships. The dummy and the incumbent heuristic are yardsticks for the publishing gate: the
heuristic reads a column `/predict` never receives, and neither is a model anyone should score with.

The legacy `/train` route's artifacts (`format: joblib`, `artifacts.serialize_envelope`) keep their own envelope and
their own content hash (the SHA-256 of the base64 text).
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
from dataclasses import dataclass
from typing import Annotated, Final, List, Literal, Optional, Sequence, Union

import joblib
import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from .array_types import FArr
from .baselines import HEURISTIC_PREFIX
from .encoding import CategoricalEncoding, ColumnSpec, NumericEncoding
from .trainer import TrainedPredictor

FORMAT_V2: Final = "ps-predictor/v2"
TaskKind = Literal["binary", "multiclass", "continuous", "count", "non-negative", "forecast"]
# The gate's yardstick member names, which never ship as artifacts.
_DUMMY_MEMBER = "dummy"


class _Wire(BaseModel):
    """Frozen, and unknown keys are refused: the envelope is a persisted shape whose keys are its wire names."""

    model_config = ConfigDict(frozen=True, extra="forbid")


class NumericColumnEncoding(_Wire):
    kind: Literal["numeric", "date-parts", "boolean"]


class CategoricalColumnEncoding(_Wire):
    kind: Literal["categorical"]
    cardinalityCap: int
    method: Literal["onehot", "hashed", "target-in-fold"]


class IdentifierColumnEncoding(_Wire):
    kind: Literal["identifier"]
    policy: Literal["exclude"]


ColumnEncoding = Annotated[Union[NumericColumnEncoding, CategoricalColumnEncoding, IdentifierColumnEncoding],
                           Field(discriminator="kind")]


class EnvelopeColumn(_Wire):
    """One feature column as the envelope describes it: name, source column and encoding."""

    name: str
    sourceColumn: str
    encoding: ColumnEncoding


class PredictorEnvelope(_Wire):
    """The v2 envelope, key for key."""

    format: Literal["ps-predictor/v2"]
    version: Literal[2]
    payload_b64: str
    featureColumns: List[EnvelopeColumn]
    taskKind: TaskKind
    classOrder: Optional[List[str]]
    featureSchemaHash: str
    driverBaseline: Optional[List[float]]
    transformedColumns: Optional[List[str]]


def envelope_column(c: ColumnSpec) -> EnvelopeColumn:
    """The envelope's description of one feature column."""
    e = c.encoding
    enc: Union[NumericColumnEncoding, CategoricalColumnEncoding, IdentifierColumnEncoding]
    if isinstance(e, NumericEncoding):
        enc = NumericColumnEncoding(kind=e.kind)
    elif isinstance(e, CategoricalEncoding):
        enc = CategoricalColumnEncoding(kind="categorical", cardinalityCap=e.cardinality_cap, method=e.method)
    else:
        enc = IdentifierColumnEncoding(kind="identifier", policy=e.policy)
    return EnvelopeColumn(name=c.name, sourceColumn=c.source_column, encoding=enc)


@dataclass(frozen=True)
class BuiltArtifact:
    """One shippable artifact: the candidate or gate member it belongs to, the base64 envelope, the SHA-256 of the
    envelope bytes, and the feature schema hash and class order it was built for."""

    candidate: str
    bytes_base64: str
    sha256: str
    feature_schema_hash: str
    class_order: Optional[List[str]]


def _refuse_yardstick(candidate: str, predictor: TrainedPredictor) -> None:
    """The dummy and the incumbent heuristic never ship: refused by gate member name and by predictor type."""
    if candidate == _DUMMY_MEMBER or candidate.startswith(HEURISTIC_PREFIX):
        raise ValueError(f"'{candidate}' is a publishing-gate yardstick and never ships as an artifact")
    if not isinstance(predictor, TrainedPredictor):
        raise ValueError(f"'{candidate}' is a {type(predictor).__name__}, not a trainer predictor: only a trainer "
                         f"predictor ships as an artifact; the dummy and the incumbent heuristic never ships")


def build(candidate: str, predictor: TrainedPredictor, columns: Sequence[ColumnSpec], task_kind: TaskKind,
          class_order: Optional[List[str]], feature_schema_hash: str,
          driver_baseline: Optional[FArr], transformed_columns: Optional[List[str]]) -> BuiltArtifact:
    """The v2 artifact of one fitted trainer predictor. The envelope is canonical JSON (sorted keys, no spaces), so
    the same predictor and arguments always produce the same bytes and hash.

    Raises:
        ValueError: When `candidate` names the dummy or an incumbent heuristic, or `predictor` is not a trainer
            predictor.
    """
    _refuse_yardstick(candidate, predictor)
    buf = io.BytesIO()
    joblib.dump(predictor, buf)
    envelope = PredictorEnvelope(
        format=FORMAT_V2, version=2, payload_b64=base64.b64encode(buf.getvalue()).decode("ascii"),
        featureColumns=[envelope_column(c) for c in columns], taskKind=task_kind, classOrder=class_order,
        featureSchemaHash=feature_schema_hash,
        driverBaseline=None if driver_baseline is None else [float(v) for v in np.asarray(driver_baseline).reshape(-1)],
        transformedColumns=transformed_columns,
    )
    raw = json.dumps(envelope.model_dump(mode="json"), separators=(",", ":"), sort_keys=True).encode("utf-8")
    return BuiltArtifact(candidate, base64.b64encode(raw).decode("ascii"), hashlib.sha256(raw).hexdigest(),
                         feature_schema_hash, class_order)
