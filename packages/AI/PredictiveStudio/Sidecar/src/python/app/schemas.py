"""Pydantic request/response models for the Predictive Studio sidecar.

These mirror the canonical TypeScript contract in
``packages/AI/PredictiveStudio/Core/src/sidecar-contract.ts``. Field names and
casing match that contract exactly so JSON round-trips between MJ (the
orchestrator) and this sidecar (the server side of the contract) without any
key translation.

Notably the TS contract uses **PascalCase** for the ordered feature-schema
entry (``Name`` / ``Kind``) and **snake_case** for everything else (``artifact_b64``,
``feature_schema``, ``fitted_preprocessing`` ...). We honor that split here.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field

# Scalar cell type used throughout the matrix / row payloads.
Cell = Union[str, float, int, bool, None]

FeatureKind = str  # 'numeric' | 'categorical' | 'embedding' | 'llm-derived'


class FeatureSchemaEntry(BaseModel):
    """One entry in the ordered feature schema (the inference input contract).

    Matches ``FeatureSchemaEntry`` in the TS contract — PascalCase ``Name`` /
    ``Kind``.
    """

    Name: str
    Kind: FeatureKind


class PreprocessingOp(BaseModel):
    """A single preprocessing operation declaration (applied at /predict to a legacy envelope's fitted preprocessing)."""

    op: str
    col: Optional[str] = None
    cols: Optional[List[str]] = None
    strategy: Optional[str] = None  # 'mean' | 'median' | 'mode' | 'constant'
    fillValue: Optional[Union[str, float, int]] = None
    # bin-specific (the contract leaves `op` open so we extend additively)
    bins: Optional[int] = None
    # impute-specific: also emit a `<col>__missing` indicator column before filling
    indicator: bool = False


class PredictRequest(BaseModel):
    """``POST /predict`` request body."""

    artifact_b64: Optional[str] = None
    artifact_ref: Optional[str] = None
    # convenience: warm-cache key returned by /train as `model_id`
    model_id: Optional[str] = None
    fitted_preprocessing: Dict[str, Any] = Field(default_factory=dict)
    feature_schema: List[FeatureSchemaEntry] = Field(default_factory=list)
    rows: List[Dict[str, Cell]] = Field(default_factory=list)

    model_config = {"protected_namespaces": ()}


class PredictionContribution(BaseModel):
    """One signed per-record feature contribution (P1-5). ``value > 0`` pushes the score up, ``< 0`` down."""

    feature: str
    value: float


class Prediction(BaseModel):
    """A single prediction for one input row."""

    score: float
    class_: Optional[str] = Field(default=None, alias="class")
    # Top signed drivers behind THIS row's prediction (linear models only; None otherwise — callers
    # fall back to global feature importance). See app/main.py::_row_contributions.
    contributions: Optional[List[PredictionContribution]] = None
    # Every class's probability, in PredictResponse.classOrder; None for a regression.
    probabilities: Optional[List[float]] = None

    model_config = {"populate_by_name": True}


class PredictResponse(BaseModel):
    """``POST /predict`` response body."""

    predictions: List[Prediction]
    # The class order `probabilities` follow: the artifact's declared classOrder (v2) or the trained label order.
    classOrder: Optional[List[str]] = None


class HealthResponse(BaseModel):
    """``GET /health`` response body — liveness plus introspection.

    Mirrors ``SidecarHealthResponse`` in the TypeScript client.
    """

    status: str
    algorithms: List[str]
    cached_models: int
