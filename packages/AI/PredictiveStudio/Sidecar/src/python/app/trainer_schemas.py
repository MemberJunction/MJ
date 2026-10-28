"""Pydantic mirror of the trainer contract (Core `trainer-contract.ts`, `gate.ts`, `task-type.ts`) and of Core
`EvaluationProtocolSpec` (`evaluation-protocol.ts`), member for member.

Field names are the contract's camelCase exactly, so JSON round-trips with the TypeScript engine without key
translation. Every model is frozen and forbids unknown keys: a misspelled protocol field is a 422, never a
silently-ignored default. A member the TypeScript type declares `T | null` is required here and accepts null.
"""

from __future__ import annotations

from typing import Annotated, Dict, List, Literal, Optional, Tuple, Union

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .failures import FailedStage  # the stage union has one definition, in failures.py

Sha256 = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
Uuid = Annotated[str, StringConstraints(min_length=36, max_length=36)]
IsoDateTime = str
# A non-empty identifier the contract types as a plain string (not necessarily a UUID).
Id = Annotated[str, StringConstraints(min_length=1)]
IsoDate = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
HyperparameterValue = Union[bool, int, float, str, None]
# The 0.95 level the contract fixes (a float cannot be a typing Literal).
Level95 = Annotated[float, Field(ge=0.95, le=0.95)]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", protected_namespaces=())


# ------------------------------------------------------------------------------------------------ task type -----

class BinaryTask(_Frozen):
    kind: Literal["binary"]
    classOrder: Tuple[str, str]
    adverseIndex: Literal[0, 1]


class MulticlassTask(_Frozen):
    kind: Literal["multiclass"]
    classOrder: List[str]
    adverseIndices: List[int]


class ContinuousTask(_Frozen):
    kind: Literal["continuous"]


class CountTask(_Frozen):
    kind: Literal["count"]


class NonNegativeTask(_Frozen):
    kind: Literal["non-negative"]
    tweediePower: float = Field(gt=1, lt=2)


class ForecastTask(_Frozen):
    kind: Literal["forecast"]
    valueKind: Literal["continuous", "count", "non-negative"]


TaskType = Annotated[
    Union[BinaryTask, MulticlassTask, ContinuousTask, CountTask, NonNegativeTask, ForecastTask],
    Field(discriminator="kind"),
]


# ------------------------------------------------------------------------------------------------- protocol -----

class BinaryScore(_Frozen):
    family: Literal["binary"]
    metric: Literal["log-loss", "brier"]


class MulticlassScore(_Frozen):
    family: Literal["multiclass"]
    metric: Literal["multiclass-log-loss"]


class ContinuousScore(_Frozen):
    family: Literal["continuous"]
    metric: Literal["rmse", "mae"]


class CountScore(_Frozen):
    family: Literal["count"]
    metric: Literal["poisson-deviance"]


class NonNegativeScore(_Frozen):
    family: Literal["non-negative"]
    metric: Literal["tweedie-deviance"]


class ForecastScore(_Frozen):
    family: Literal["forecast"]
    metric: Literal["mase", "rmse"]


ProperScore = Annotated[
    Union[BinaryScore, MulticlassScore, ContinuousScore, CountScore, NonNegativeScore, ForecastScore],
    Field(discriminator="family"),
]
SecondaryMetric = Literal["auc", "accuracy", "f1", "precision", "recall", "r2", "calibration-slope"]
MetricKey = Literal["log-loss", "brier", "multiclass-log-loss", "rmse", "mae", "poisson-deviance", "tweedie-deviance",
                    "mase", "auc", "accuracy", "f1", "precision", "recall", "r2", "calibration-slope"]


class DummyBaseline(_Frozen):
    kind: Literal["dummy"]
    name: Literal["base-rate", "mean", "training-window-mean"]


class OneFeatureBaseline(_Frozen):
    kind: Literal["one-feature"]
    selection: Literal["best-single-feature-inner-cv"]


class GlmBaseline(_Frozen):
    kind: Literal["glm"]
    family: Literal["logistic", "multinomial", "gaussian", "poisson", "tweedie"]
    penalty: Literal["l2"]


class NaiveBaseline(_Frozen):
    kind: Literal["naive"]


class SeasonalNaiveBaseline(_Frozen):
    kind: Literal["seasonal-naive"]
    season: int = Field(ge=1)


class IncumbentHeuristicBaseline(_Frozen):
    kind: Literal["incumbent-heuristic"]
    name: Id


BaselineSpec = Annotated[
    Union[DummyBaseline, OneFeatureBaseline, GlmBaseline, NaiveBaseline, SeasonalNaiveBaseline,
          IncumbentHeuristicBaseline],
    Field(discriminator="kind"),
]


class NewEntityReport(_Frozen):
    groupKey: str
    holdoutFraction: float = Field(gt=0, lt=1)


class DateCarvedHoldout(_Frozen):
    kind: Literal["date-carved"]
    dateColumn: str
    cutoff: IsoDate
    holdoutEnd: Optional[IsoDate]
    newEntityReport: Optional[NewEntityReport]

    @model_validator(mode="after")
    def _end_after_cutoff(self) -> DateCarvedHoldout:
        # yyyy-mm-dd strings order as their dates.
        if self.holdoutEnd is not None and self.holdoutEnd <= self.cutoff:
            raise ValueError("holdoutEnd must be a date after cutoff")
        return self


class RollingOriginHoldout(_Frozen):
    kind: Literal["rolling-origin"]
    origins: int = Field(ge=5)
    horizonPeriods: int = Field(ge=1)
    gapPeriods: int = Field(ge=0)
    minTrainPeriods: int = Field(ge=1)
    window: Literal["expanding", "sliding"]


HoldoutSplit = Annotated[Union[DateCarvedHoldout, RollingOriginHoldout], Field(discriminator="kind")]


class RepeatedStratifiedKFold(_Frozen):
    kind: Literal["repeated-stratified-kfold"]
    folds: int = Field(ge=2)
    repeats: int = Field(ge=1)


class GroupedKFold(_Frozen):
    kind: Literal["grouped-kfold"]
    folds: int = Field(ge=2)
    repeats: int = Field(ge=1)
    groupKey: Id


class BlockedTime(_Frozen):
    kind: Literal["blocked-time"]
    folds: int = Field(ge=2)
    gapPeriods: int = Field(ge=0)
    groupKey: Optional[str]


InnerValidation = Annotated[Union[RepeatedStratifiedKFold, GroupedKFold, BlockedTime], Field(discriminator="kind")]


class PlattCalibration(_Frozen):
    kind: Literal["platt"]
    fitOn: Literal["disjoint-calibration-fold"]


class IsotonicCalibration(_Frozen):
    kind: Literal["isotonic"]
    fitOn: Literal["disjoint-calibration-fold"]


class AutoCalibration(_Frozen):
    kind: Literal["auto"]
    thresholdRows: int = Field(ge=1)
    fitOn: Literal["disjoint-calibration-fold"]


class NoCalibration(_Frozen):
    kind: Literal["not-applicable"]
    reason: Literal["regression-task"]


CalibrationMethod = Annotated[
    Union[PlattCalibration, IsotonicCalibration, AutoCalibration, NoCalibration], Field(discriminator="kind")
]


class NoResampling(_Frozen):
    kind: Literal["none"]


class InFoldResampling(_Frozen):
    kind: Literal["in-fold"]
    method: Literal["class-weight", "undersample", "oversample"]


Resampling = Annotated[Union[NoResampling, InFoldResampling], Field(discriminator="kind")]


class IntervalSpec(_Frozen):
    level: Level95
    method: Literal["bootstrap", "cluster-bootstrap", "block-bootstrap", "delong"]
    resamples: int = Field(ge=100)
    pairedTest: Literal["paired-bootstrap", "delong", "corrected-resampled-t", "diebold-mariano"]


class PromotionRule(_Frozen):
    comparators: List[BaselineSpec]
    incumbent: Literal["current-published", "none"]
    margin: float = Field(ge=0)
    lowerBoundLevel: Level95
    pairedOn: Literal["same-holdout-rows"]
    decisionTable: Literal["Q13+Q14+Q15"]


class LeakageAuditSpec(_Frozen):
    singleFeatureHeldOutAucMax: float = Field(gt=0.5, le=1.0)
    timeShiftedLabelTest: Literal[True]
    dropColumnTest: Literal[True]
    importanceAggregation: Literal["per-source-column"]
    highCardinalityIdCheck: Literal[True]


class Slices(_Frozen):
    outOfTime: bool
    subgroups: List[str]


class PredictionIntervals(_Frozen):
    method: Literal["split-conformal", "quantile"]
    nominalCoverage: List[Annotated[float, Field(gt=0, lt=1)]] = Field(min_length=1)


class ResidualDiagnosticsSpec(_Frozen):
    acfLags: int = Field(ge=1)
    ljungBoxAlpha: float = Field(gt=0, lt=1)


class OutcomeDegradationTrigger(_Frozen):
    kind: Literal["outcome-degradation"]
    margin: float = Field(ge=0)
    consecutivePeriods: int = Field(ge=1)


class CalibrationDriftTrigger(_Frozen):
    kind: Literal["calibration-drift"]
    slopeOutside: Tuple[float, float]
    consecutivePeriods: int = Field(ge=1)

    @model_validator(mode="after")
    def _range_ordered(self) -> CalibrationDriftTrigger:
        if not self.slopeOutside[0] < self.slopeOutside[1]:
            raise ValueError("slopeOutside must be [lo, hi] with lo < hi")
        return self


RetrainTrigger = Annotated[Union[OutcomeDegradationTrigger, CalibrationDriftTrigger], Field(discriminator="kind")]


class RandomSearch(_Frozen):
    kind: Literal["random"]
    candidates: int = Field(ge=1)


class GuidedSearch(_Frozen):
    kind: Literal["guided"]
    method: Literal["bayesian", "successive-halving"]
    equalCostComparisonId: Id


SearchStrategy = Annotated[Union[RandomSearch, GuidedSearch], Field(discriminator="kind")]


class Budgets(_Frozen):
    maxComputeSeconds: float = Field(gt=0)
    maxTokens: int = Field(ge=0)
    maxCandidates: int = Field(ge=1)
    hardStop: Literal[True]


class ProtocolExclusions(_Frozen):
    denyFields: List[str]
    denySources: List[str]


class HumanActor(_Frozen):
    kind: Literal["human"]
    userId: Id


class AgentActor(_Frozen):
    kind: Literal["agent"]
    agentRunId: str


class ScheduledJobActor(_Frozen):
    kind: Literal["scheduled-job"]
    scheduledJobRunId: str


class SystemActor(_Frozen):
    kind: Literal["system"]
    component: str


Actor = Annotated[Union[HumanActor, AgentActor, ScheduledJobActor, SystemActor], Field(discriminator="kind")]


class EvaluationProtocol(_Frozen):
    """Mirror of Core `EvaluationProtocolSpec`, field for field; no pipeline or unit reference."""
    id: Uuid
    lineageRootId: Uuid
    version: int = Field(ge=1)
    name: str
    holdout: HoldoutSplit
    innerValidation: InnerValidation
    seed: int = Field(ge=0)
    holdoutAccessBudget: Literal[1]
    primaryScore: ProperScore
    secondaryMetrics: List[SecondaryMetric]
    baselines: List[BaselineSpec]
    calibration: CalibrationMethod
    resampling: Resampling
    intervals: IntervalSpec
    promotion: PromotionRule
    allowedOutcomes: Tuple[Literal["model"], Literal["keep-simple-baseline"], Literal["no-signal"]]
    leakageAudit: LeakageAuditSpec
    exclusions: ProtocolExclusions
    slices: Slices
    predictionIntervals: Optional[PredictionIntervals]
    residualDiagnostics: Optional[ResidualDiagnosticsSpec]
    retrainTriggers: List[RetrainTrigger]
    search: SearchStrategy
    budgets: Budgets
    minMinorityClassRows: int = Field(ge=1)
    guardFieldsEditableBy: Literal["non-agent", "human-only"]
    authoredBy: Actor


# -------------------------------------------------------------------------------------------------- request -----

class PreAuthDownload(_Frozen):
    fileId: Uuid
    url: str
    issuedAt: IsoDateTime
    driverLifetimeSeconds: Optional[Annotated[int, Field(ge=1)]]
    expiresAt: Optional[IsoDateTime]
    sha256: Sha256


class SnapshotRef(_Frozen):
    id: Uuid
    contentHash: Sha256
    featureSchemaHash: Sha256
    matrix: PreAuthDownload
    rowManifest: PreAuthDownload


class IncumbentRef(_Frozen):
    modelId: Id
    artifact: PreAuthDownload


class CandidateSpec(_Frozen):
    name: str = Field(min_length=1)
    algorithmId: Uuid
    driverKey: str = Field(min_length=1)
    hyperparameters: Dict[str, HyperparameterValue]


class TrainerRequest(_Frozen):
    trainingRunId: Uuid
    snapshot: SnapshotRef
    incumbent: Optional[IncumbentRef]
    protocol: EvaluationProtocol
    task: TaskType
    candidates: List[CandidateSpec] = Field(min_length=1)
    seed: int
    threads: int = Field(ge=1)
    timeoutSeconds: float = Field(gt=0)
    maxRetries: int = Field(ge=0)


# --------------------------------------------------------------------------------------------------- result -----

class Interval(_Frozen):
    level: float
    lower: float
    upper: float


class MetricWithInterval(_Frozen):
    metric: MetricKey
    value: float
    interval: Interval
    n: int


class CodeVersion(_Frozen):
    psGitSha: str
    sidecarVersion: str
    libraryVersions: Dict[str, str]
    threads: int
    seed: int


class CandidateInnerScore(_Frozen):
    candidate: str
    inner: MetricWithInterval
    folds: int
    optimistic: Literal[True]


class HoldoutAccess(_Frozen):
    accessedAt: IsoDateTime
    count: Literal[1]
    finalist: str


class HoldoutScores(_Frozen):
    primary: MetricWithInterval
    secondary: List[MetricWithInterval]


class BaselineResult(_Frozen):
    baseline: BaselineSpec
    role: Literal["dummy", "simple"]
    holdout: MetricWithInterval


class PairedComparison(_Frozen):
    value: float
    ci: Tuple[float, float]
    beats: bool


class GateModel(_Frozen):
    outcome: Literal["model"]
    branch: Literal["a:beats-best-simple", "a:Q15-only-model-beats-dummy"]
    shipped: str
    shippedRole: Literal["model"]
    note: Optional[Literal["no simple baseline carries demonstrable signal"]]


class GateKeepSimple(_Frozen):
    outcome: Literal["keep-simple-baseline"]
    branch: Literal["b:keep-simple-baseline"]
    shipped: str
    shippedRole: Literal["simpleBaseline"]
    note: None


class GateNoSignal(_Frozen):
    outcome: Literal["no-signal"]
    branch: Literal["c:no-signal"]
    shipped: None
    shippedRole: None
    note: None


GateDecision = Annotated[Union[GateModel, GateKeepSimple, GateNoSignal], Field(discriminator="outcome")]


class ReturnedArtifact(_Frozen):
    candidate: str
    bytesBase64: str
    sha256: Sha256
    featureSchemaHash: Sha256
    classOrder: Optional[List[str]]


class IncumbentDiff(_Frozen):
    incumbentModelId: Id
    value: float
    lower: float
    upper: float


class ReliabilityRow(_Frozen):
    binLower: float
    binUpper: float
    meanPredicted: float
    observedRate: float
    n: int


class CalibrationReport(_Frozen):
    method: Literal["platt", "isotonic", "auto", "not-applicable"]
    intercept: float
    slope: float
    reliability: List[ReliabilityRow]


class OutOfTimeSlice(_Frozen):
    kind: Literal["out-of-time"]
    period: IsoDate


class SubgroupSlice(_Frozen):
    kind: Literal["subgroup"]
    field: str
    value: str


class SliceResult(_Frozen):
    slice: Annotated[Union[OutOfTimeSlice, SubgroupSlice], Field(discriminator="kind")]
    primary: MetricWithInterval


class OperatingPoint(_Frozen):
    capacityPerPeriod: float
    precisionAtCapacity: MetricWithInterval
    baseRate: float


class RunCost(_Frozen):
    computeSeconds: float
    tokens: int
    usd: float
    budget: Budgets
    stoppedByBudget: bool


class SourceColumnImportance(_Frozen):
    sourceColumn: str
    permutationImportance: MetricWithInterval


class SingleFeatureAucFlag(_Frozen):
    kind: Literal["single-feature-auc"]
    sourceColumn: str
    heldOutAuc: float


class TimeShiftedLabelFlag(_Frozen):
    kind: Literal["time-shifted-label"]
    scoreWithShiftedLabel: float


class DropColumnFlag(_Frozen):
    kind: Literal["drop-column"]
    sourceColumn: str
    scoreDrop: float


class HighCardinalityIdFlag(_Frozen):
    kind: Literal["high-cardinality-id"]
    sourceColumn: str
    distinctRatio: float


LeakageFlag = Annotated[
    Union[SingleFeatureAucFlag, TimeShiftedLabelFlag, DropColumnFlag, HighCardinalityIdFlag],
    Field(discriminator="kind"),
]


class PredictionIntervalCoverage(_Frozen):
    nominal: float
    observed: float
    n: int


class LjungBox(_Frozen):
    statistic: float
    pValue: float
    lags: int


class ResidualDiagnostics(_Frozen):
    acf: List[float]
    ljungBox: LjungBox
    autocorrelationFlagged: bool


class RollingOriginResult(_Frozen):
    """One outer origin of a rolling-origin backtest (period ordinals at the unit's period)."""
    k: int
    lastTrainPeriod: int
    testPeriods: List[int]
    scale: float
    mase: Dict[str, float]


class DieboldMariano(_Frozen):
    statistic: float
    pValue: float
    meanDiff: float
    n: int
    horizon: int


class ForecastEvaluation(_Frozen):
    """MASE at every rolling origin and a Diebold-Mariano test of the model against seasonal naive."""
    origins: List[RollingOriginResult]
    dieboldMarianoVsSeasonalNaive: DieboldMariano


class SplitContrast(_Frozen):
    """The blocked/grouped inner score beside a random-row K-fold score on the same rows, in the primary score's units;
    `inflation` is their difference (blocked minus random-row)."""
    rows: int
    blockedGroupedScore: float
    randomRowScore: float
    inflation: float


class TrainerCompleted(_Frozen):
    status: Literal["completed"]
    trainingRunId: Uuid
    codeVersion: CodeVersion
    computeSeconds: float
    innerScores: List[CandidateInnerScore]
    finalist: str
    holdoutAccess: HoldoutAccess
    holdout: HoldoutScores
    baselines: List[BaselineResult]
    comparisons: Dict[str, PairedComparison]
    gate: GateDecision
    artifacts: List[ReturnedArtifact]
    incumbentDiff: Optional[IncumbentDiff]
    calibration: Optional[CalibrationReport]
    slices: List[SliceResult]
    operatingPoint: Optional[OperatingPoint]
    cost: RunCost
    importance: List[SourceColumnImportance]
    leakageFlags: List[LeakageFlag]
    predictionIntervalCoverage: List[PredictionIntervalCoverage]
    residualDiagnostics: Optional[ResidualDiagnostics]
    forecast: Optional[ForecastEvaluation]
    innerSplitContrast: Optional[SplitContrast]


class TrainerFailed(_Frozen):
    status: Literal["failed"]
    trainingRunId: Uuid
    stage: FailedStage
    message: str
    computeSeconds: float


TrainerResult = Annotated[Union[TrainerCompleted, TrainerFailed], Field(discriminator="status")]
