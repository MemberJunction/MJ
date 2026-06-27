"""Pydantic request/response models for the Predictive Studio sidecar.

These mirror the canonical TypeScript contract in
``packages/AI/PredictiveStudio/Core/src/sidecar-contract.ts``. Field names and
casing match that contract exactly so JSON round-trips between MJ (the
orchestrator) and this sidecar (the server side of the contract) without any
key translation.

Notably the TS contract uses **PascalCase** for the ordered feature-schema
entry (``Name`` / ``Kind``) and **snake_case** for everything else (``problem_type``,
``feature_schema``, ``fitted_preprocessing`` ...). We honor that split here.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field

# Scalar cell type used throughout the matrix / row payloads.
Cell = Union[str, float, int, bool, None]

FeatureKind = str  # 'numeric' | 'categorical' | 'embedding' | 'llm-derived'
ProblemType = str  # 'classification' | 'regression'


class FeatureSchemaEntry(BaseModel):
    """One entry in the ordered feature schema (the inference input contract).

    Matches ``FeatureSchemaEntry`` in the TS contract — PascalCase ``Name`` /
    ``Kind``.
    """

    Name: str
    Kind: FeatureKind


class PreprocessingOp(BaseModel):
    """A single preprocessing operation declaration (fit at /train, apply at /predict)."""

    op: str
    col: Optional[str] = None
    cols: Optional[List[str]] = None
    strategy: Optional[str] = None  # 'mean' | 'median' | 'mode' | 'constant'
    fillValue: Optional[Union[str, float, int]] = None
    # bin-specific (the contract leaves `op` open so we extend additively)
    bins: Optional[int] = None


class ValidationConfig(BaseModel):
    """Validation configuration sent at train time."""

    strategy: str = "train_test_split"  # 'train_test_split' | 'kfold' | 'holdout'
    test_size: Optional[float] = 0.2
    k: Optional[int] = None
    # Locked-holdout fraction (plan §8.2). Scored exactly once, separate from
    # the train/test split. Optional — when omitted no holdout_metrics returned.
    holdout_size: Optional[float] = None
    random_state: Optional[int] = 42


class MatrixData(BaseModel):
    """Inline columnar-header + row-array feature matrix."""

    columns: List[str]
    rows: List[List[Cell]]


class TrainRequest(BaseModel):
    """``POST /train`` request body."""

    algorithm: str
    problem_type: ProblemType
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    validation: ValidationConfig = Field(default_factory=ValidationConfig)
    feature_schema: List[FeatureSchemaEntry] = Field(default_factory=list)
    preprocessing: List[PreprocessingOp] = Field(default_factory=list)
    target: str
    data: Optional[MatrixData] = None
    data_ref: Optional[str] = None  # shared-storage handle (not implemented in v1)


class TrainResponse(BaseModel):
    """``POST /train`` response body."""

    artifact_b64: str
    fitted_preprocessing: Dict[str, Any]
    metrics: Dict[str, float]
    feature_importance: Dict[str, float]
    training_row_count: int
    duration_sec: float
    holdout_metrics: Optional[Dict[str, float]] = None
    # Opaque id callers may pass back on /predict to hit the warm model cache
    # without re-sending the (potentially large) artifact_b64.
    model_id: Optional[str] = None

    # `model_id` collides with pydantic's protected `model_` namespace; we use it
    # intentionally as a cache key, so disable the namespace guard here.
    model_config = {"protected_namespaces": ()}


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


class Prediction(BaseModel):
    """A single prediction for one input row."""

    score: float
    class_: Optional[str] = Field(default=None, alias="class")

    model_config = {"populate_by_name": True}


class PredictResponse(BaseModel):
    """``POST /predict`` response body."""

    predictions: List[Prediction]


class HealthResponse(BaseModel):
    status: str
    algorithms: List[str]
    cached_models: int
