import type { UserInfo, EntityInfo } from '@memberjunction/core';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLTrainingRunEntity, MJProcessRunEntity,
  MJProcessRunDetailEntity, PredictiveStudioScoreRecordSetInput,
  PredictiveStudioTrainAsOf, PredictiveStudioModelTargetStatus } from '@memberjunction/core-entities';
import type { ModelingPlanSpec, TrustVerdict, ValidationStrategy, AsOfStrategy, ProblemType,
  PredictiveStudioRefusalCode } from '@memberjunction/predictive-studio-core';
import type { ProvenanceCheck } from '../fixtures/provenance-resolver';
import type { RunRecords } from './cleanup';

export type WorldID = 'W1-signal' | 'W2-noise' | 'W3-leak-row' | 'W4-pit' | 'W5-censor' | 'W6-drift'
  | 'W7-small-imbalanced' | 'W8-highcard' | 'W9-multiclass';
export type ScenarioID = 'C2' | 'C4' | 'D1c' | 'D1r' | 'D2' | 'N1c' | 'N1r' | 'R1' | 'R2p' | 'R3' | 'T1p' | 'T2p'
  | 'T3' | 'T3-lag' | 'T4';
export type DatasetRef = { Kind: 'world'; ID: WorldID; Seed: number } | { Kind: 'scenario'; ID: ScenarioID; Seed: number }
  | { Kind: 'series-origin'; ID: 'T1p' | 'T3' | 'T4'; Seed: number; Origin: number };
export type AlgorithmKey = 'logistic_regression' | 'xgboost' | 'lightgbm' | 'random_forest' | 'ridge' | 'mlp';

// The result shapes are new and mirror no shipped camelCase shape, so their members are PascalCase.
export interface LoadedDataset { Ref: DatasetRef; Dir: string; Entity: EntityInfo; RowCount: number; RowsSha256: string }

export interface PipelineSpec {
  Name: string;                       // always prefixed "PSTruth:" (marks suite fixtures)
  Dataset: LoadedDataset;
  Target: string;
  ProblemType: ProblemType;
  Features: string[];
  Algorithm: AlgorithmKey;
  AsOf: AsOfStrategy;
  Validation: ValidationStrategy;
  DenyFields: string[];
  TimeIndexColumn?: string;           // saved as ValidationStrategy.TimeIndexColumn (ContainmentProbe.ApplyTimeIndexDeclaration, G0.11)
}

export interface TrainAttempt {
  Ok: boolean;                        // the operation returned Success with an Output
  ErrorMessage: string | null;
  /** The operation's refusal code (`RemoteOpResult.ResultCode`) when it refused; null on success or a generic failure. */
  RefusalCode: PredictiveStudioRefusalCode | null;
  ModelID: string | null;
  TrainingRunID: string | null;
  HoldoutMetricsJSON: string | null;
  DurationMs: number;
}

export interface CandidateModel {
  // Status unions are derived from the generated entities (never widened to string), so a value CodeGen adds reaches
  // every comparison as a compile-time change. `Trust` is Core's shipped TrustVerdict, whose members stay camelCase.
  ModelID: string; PipelineID: string; Algorithm: AlgorithmKey; Status: MJMLModelEntity['Status']; TrainingRowCount: number | null;
  HoldoutRowCount: number | null; Metrics: Record<string, number>; HoldoutMetrics: Record<string, number>;
  Trust: TrustVerdict; TrainingRunStatus: MJMLTrainingRunEntity['Status'] | null; TrainingRunNotes: string | null; LineageJSON: string | null;
  ValidationResultsJSON: string | null;
}

// The operation's shipped input minus the model, so the request keeps the operation's own wire names.
export type ScoreRequest = Omit<PredictiveStudioScoreRecordSetInput, 'modelId'>;
export interface ScoreAttempt { Ok: boolean; ErrorMessage: string | null;
  /** The operation's refusal code (`RemoteOpResult.ResultCode`) when it refused; null on success or a generic failure. */
  RefusalCode: PredictiveStudioRefusalCode | null; Scored: number; Failed: number; Skipped: number;
  WroteBack: boolean; Predictions: Array<{ RecordID: string; Score: number; Class: string | null }>; DurationMs: number }

export interface RecordProcessScoring {
  ProcessRunID: string; Status: MJProcessRunEntity['Status'];
  Details: Array<{ RecordID: string; Status: MJProcessRunDetailEntity['Status']; ResultPayload: string | null }>;
}

export interface AgentStepResult {
  AgentRunID: string | null; AgentSuccess: boolean; AgentErrorMessage: string | null;
  BuildModelID: string | null; BuildSuccess: boolean; BuildErrorMessage: string | null;
  /** The pipelines the run created (whether or not it succeeded), so cleanup can delete them. */
  PipelineIDs: string[];
  WallMs: number;
}

/** What a gate body returns: whether its threshold is met, the measured values and one plain sentence. */
export interface GateMeasurement {
  /** True when the gate's threshold is met. */
  Passed: boolean;
  /** The measured numbers the threshold talks about, e.g. { trainingRows: 13421, holdoutRows: 3355, scored: 1000 }. */
  Measured: Record<string, number | string | boolean | null>;
  /** One sentence: what was measured against what. */
  Detail: string;
}

/** One row of a world's truth.csv (`MembershipYearID,Cycle,TrueP,Drawn,Censored`). */
export interface WorldTruthRow { readonly Cycle: number; readonly TrueP: number; readonly Censored: boolean }

/** What `Promote` reports: whether the operation applied the transition and the model's status after it. */
export interface PromoteAttempt { Promoted: boolean; Status: MJMLModelEntity['Status'] }

export interface TruthHarness {
  readonly Provider: GraphQLDataProvider;
  readonly User: UserInfo;
  readonly RunID: string;
  /** The pipelines and models this harness created or observed (what `RunFixtures.CleanupRun` deletes). */
  readonly Created: RunRecords;
  EnsureLoaded(ref: DatasetRef): Promise<LoadedDataset>;
  CreatePipeline(spec: PipelineSpec): Promise<MJMLTrainingPipelineEntity>;
  /** Never throws for a failed operation: Ok false, ModelID null, ErrorMessage set. */
  Train(pipeline: MJMLTrainingPipelineEntity, opts?: { MaxRows?: number; AsOf?: PredictiveStudioTrainAsOf }): Promise<TrainAttempt>;
  RunBuilderAgent(plan: ModelingPlanSpec): Promise<AgentStepResult>;
  /** Trust = TrustVerdicts.DeriveTrustVerdict(<the loaded MJ: ML Models entity>) — the whole entity, so Lineage reaches the verdict. */
  ReadModel(modelId: string): Promise<CandidateModel>;
  ModelsForPipelineNamePrefix(prefix: string): Promise<CandidateModel[]>;
  Promote(modelId: string, target: PredictiveStudioModelTargetStatus, reason: string): Promise<PromoteAttempt>;
  Score(modelId: string, req: ScoreRequest): Promise<ScoreAttempt>;
  ScoreViaRecordProcess(modelId: string, dataset: LoadedDataset, extraFilter: string): Promise<RecordProcessScoring>;
  CountNonNull(dataset: LoadedDataset, column: 'TruthScore'): Promise<number>;
  ResetColumn(dataset: LoadedDataset, column: 'TruthScore'): Promise<void>;
  /** The Model Development Agent's user-facing report for one model (live AI model; G0.6's stories); null if none. */
  GenerateStory(modelId: string): Promise<string | null>;
  Judge<TOut>(module: string, args: string[]): Promise<TOut>;       // python -m truthsuite.judges.<module> … → JSON
  WriteArtifact(name: string, data: object): Promise<string>;      // $TRUTH_RESULTS_DIR/artifacts/<name>.json
  /** The planted truth of a loaded W1–W8 seed, keyed by lower-cased MembershipYearID. */
  ReadWorldTruth(dataset: LoadedDataset): Promise<ReadonlyMap<string, WorldTruthRow>>;
  /** A seeded sample of n primary keys of the dataset's row table. */
  SampleRowIds(dataset: LoadedDataset, n: number, seed: number): Promise<string[]>;
  /** Whether one assembled value names its scored row and resolves to its source, source version and computed-at. */
  ResolveProvenance(check: ProvenanceCheck): Promise<boolean>;
  /** Route this process's in-process engine calls to the suite sidecar; returns its URL. */
  UseSuiteSidecar(): string;
}
