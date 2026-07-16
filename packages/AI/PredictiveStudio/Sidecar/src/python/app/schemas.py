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

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

# Scalar cell type used throughout the matrix / row payloads.
Cell = Union[str, float, int, bool, None]

FeatureKind = str  # 'numeric' | 'categorical' | 'embedding' | 'llm-derived'
ProblemType = str  # 'classification' | 'regression'

# The 10-value Task union — the catalog-level task-family vocabulary. Mirrors, and
# is held in three-way lockstep with (contract-tested from the TS side):
#   1. TypeScript ALL_TASKS in Core/src/tasks.ts, and
#   2. the ML_Component_Framework migration's CHECK constraints.
# ProblemType above remains the narrow binary alias today's train/predict path uses;
# new task families activate per driver tranche.
Task = Literal[
    "classification",
    "regression",
    "clustering",
    "dim-reduction",
    "anomaly",
    "survival",
    "forecasting",
    "sequence-state",
    "recommendation",
    "pattern-mining",
]


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


class SurvivalTargetSpec(BaseModel):
    """Survival (duration, event) target columns (Doc 3 T4)."""

    duration_col: str
    event_col: str


class SeriesSpec(BaseModel):
    """Forecasting series spec (Doc 3 T5)."""

    time_col: str
    value_col: str
    horizon: int
    seasonal_periods: Optional[int] = None


class SequenceSpec(BaseModel):
    """Sequence-state spec (Doc 3 T6)."""

    group_col: str
    order_col: str
    n_states: Optional[int] = 3


class TrainRequest(BaseModel):
    """``POST /train`` request body."""

    algorithm: str
    problem_type: ProblemType
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    validation: ValidationConfig = Field(default_factory=ValidationConfig)
    feature_schema: List[FeatureSchemaEntry] = Field(default_factory=list)
    preprocessing: List[PreprocessingOp] = Field(default_factory=list)
    # OPTIONAL: unsupervised task families (clustering/dim-reduction/anomaly/
    # sequence-state/pattern-mining) train with no target. Mirrors the TS contract's
    # `target?`. Supervised families still set it.
    target: Optional[str] = None
    target_spec: Optional[SurvivalTargetSpec] = None
    series_spec: Optional[SeriesSpec] = None
    sequence_spec: Optional[SequenceSpec] = None
    data: Optional[MatrixData] = None
    data_ref: Optional[str] = None  # shared-storage handle (not implemented in v1)
    # The locked holdout (plan §8.2): rows carved off by the orchestrator BEFORE
    # any train/test split and absent from `data`. Same columns as `data` (it
    # includes the target). When present, preprocessing fitted on `data` is
    # APPLIED (never re-fit) to these rows and they are scored exactly once. Takes
    # precedence over `validation.holdout_size` (the sidecar-side re-carve).
    holdout: Optional[MatrixData] = None


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


class PredictionContribution(BaseModel):
    """One signed per-record feature contribution (P1-5). ``value > 0`` pushes the score up, ``< 0`` down."""

    feature: str
    value: float


class Prediction(BaseModel):
    """A single prediction for one input row.

    ``score``/``class`` cover supervised outputs; the remaining optional fields
    carry the structural task families' shapes (mirrors the TS ``Prediction``).
    """

    # OPTIONAL: unsupervised/structural families emit cluster/vector/curve/... instead.
    score: Optional[float] = None
    class_: Optional[str] = Field(default=None, alias="class")
    cluster: Optional[int] = None  # clustering
    vector: Optional[List[float]] = None  # dim-reduction/embedding/soft-assignment
    anomaly_score: Optional[float] = None  # anomaly
    latent_state: Optional[int] = None  # sequence-state
    curve: Optional[Dict[str, List[float]]] = None  # survival: {"times":[...], "survival":[...]}
    # Top signed drivers behind THIS row's prediction (linear models only; None otherwise — callers
    # fall back to global feature importance). See app/main.py::_row_contributions.
    contributions: Optional[List[PredictionContribution]] = None

    model_config = {"populate_by_name": True}


class PredictResponse(BaseModel):
    """``POST /predict`` response body."""

    predictions: List[Prediction]


class HealthResponse(BaseModel):
    """``GET /health`` response body — liveness plus introspection.

    Mirrors ``SidecarHealthResponse`` in the TypeScript client.
    """

    status: str
    algorithms: List[str]
    # Subset of `algorithms` whose optional native deps are importable HERE — i.e.
    # actually runnable. Drivers absent from this list are cataloged-but-Planned.
    runnable_algorithms: List[str] = Field(default_factory=list)
    cached_models: int
