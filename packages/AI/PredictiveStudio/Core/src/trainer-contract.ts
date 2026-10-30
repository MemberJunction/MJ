/**
 * @module trainer-contract
 *
 * The Trainer/Evaluator contract between the engine and the Python sidecar: the request the engine sends to the
 * sidecar's `POST /trainer` and the result it gets back, plus the run's cost. The sidecar's pydantic mirror is
 * `Sidecar/src/python/app/trainer_schemas.py`; field names are identical so JSON crosses without translation
 * (camelCase wire names, shared with the sidecar; identifiers are plain strings).
 *
 * The protocol travels as the typed {@link EvaluationProtocolSpec}, with no pipeline or unit reference (the pipeline
 * binds both). Each candidate carries its algorithm's driver key, because the sidecar cannot resolve an
 * `MJ: ML Algorithms` row ID. A time-shifted-label leak that a single source column explains is named by a paired
 * `single-feature-auc` flag for that column rather than by a column on the time-shifted flag. A completed result
 * carries the forecast evaluation of a rolling-origin run and the blocked/grouped versus random-row inner-score
 * contrast, and reports prediction-interval coverage once per declared nominal level.
 */
import type {
  BaselineRole,
  BaselineSpec,
  Budgets,
  CalibrationMethod,
  EvaluationProtocolSpec,
  MetricWithInterval,
} from './evaluation-protocol';
import type { GateDecision, PairedComparison } from './gate';
import type { JsonValue, ParseResult } from './json-value';
import { StoreSchemas } from './store-schemas';
import type { TaskType } from './task-type';
import { TrainerResultSchemas } from './trainer-result-schemas';

/** One hyperparameter value of a candidate. */
export type HyperparameterValue = number | string | boolean | null;

/** One candidate the sidecar trains and scores in inner cross-validation. */
export interface CandidateSpec {
  readonly name: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly algorithmId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The `MJ: ML Algorithms.DriverClass` of `algorithmId`, resolved by the engine (e.g. `lightgbm`): the sidecar cannot resolve the row ID. */
  readonly driverKey: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly hyperparameters: Readonly<Record<string, HyperparameterValue>>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/**
 * A pre-authorized download URL for one stored file. A storage driver whose URLs do not expire (the local file-system
 * driver's `file://` URLs) states `driverLifetimeSeconds` and `expiresAt` as null; the consumer checks expiry only
 * when `expiresAt` is set.
 */
export interface PreAuthDownload {
  readonly fileId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly url: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** ISO instant. */
  readonly issuedAt: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The driver's URL lifetime in seconds; null when the driver's URLs do not expire. */
  readonly driverLifetimeSeconds: number | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** ISO instant: `issuedAt` + the driver's lifetime; null when the driver's URLs do not expire. */
  readonly expiresAt: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** SHA-256 (lower-case hex) of the file bytes. */
  readonly sha256: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** What the engine sends to the sidecar's `POST /trainer`: one Training Run over one immutable Training Snapshot. */
export interface TrainerRequest {
  readonly trainingRunId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly snapshot: {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly id: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly contentHash: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    /** The `MJ: Training Snapshots` row's `FeatureSchemaHash`; the sidecar copies it onto every returned artifact instead of recomputing it. */
    readonly featureSchemaHash: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly matrix: PreAuthDownload;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly rowManifest: PreAuthDownload;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  };
  readonly incumbent: { readonly modelId: string; readonly artifact: PreAuthDownload } | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly protocol: EvaluationProtocolSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly task: TaskType;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly candidates: readonly CandidateSpec[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly seed: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly threads: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly timeoutSeconds: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly maxRetries: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** One trained artifact the sidecar returns. */
export interface ReturnedArtifact {
  readonly candidate: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly bytesBase64: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** SHA-256 of the decoded envelope bytes — the bytes MJ stores, so delivery registration can compare it. */
  readonly sha256: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** Copied from {@link TrainerRequest}'s `snapshot.featureSchemaHash`. */
  readonly featureSchemaHash: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly classOrder: readonly string[] | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** The code a run executed: the repository commit, the sidecar version, the library versions, threads and seed. */
export interface CodeVersion {
  readonly psGitSha: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sidecarVersion: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly libraryVersions: Readonly<Record<string, string>>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly threads: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly seed: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** A candidate's inner cross-validation score; optimistic by construction (it was used to select). */
export interface CandidateInnerScore {
  readonly candidate: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly inner: MetricWithInterval;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly folds: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly optimistic: true;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** One baseline's holdout score and its role in the gate. */
export interface BaselineResult {
  readonly baseline: BaselineSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly role: BaselineRole;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdout: MetricWithInterval;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** The calibration fitted on the disjoint calibration fold and its reliability curve on the holdout rows. */
export interface CalibrationReport {
  readonly method: CalibrationMethod['kind'];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly intercept: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly slope: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly reliability: readonly {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly binLower: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly binUpper: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly meanPredicted: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly observedRate: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly n: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  }[];
}

/** Permutation importance aggregated to one source column. */
export interface SourceColumnImportance {
  readonly sourceColumn: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly permutationImportance: MetricWithInterval;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** One leakage-audit finding. */
export type LeakageFlag =
  | { readonly kind: 'single-feature-auc'; readonly sourceColumn: string; readonly heldOutAuc: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'time-shifted-label'; readonly scoreWithShiftedLabel: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'drop-column'; readonly sourceColumn: string; readonly scoreDrop: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'high-cardinality-id'; readonly sourceColumn: string; readonly distinctRatio: number };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/** The primary score on one slice of the holdout rows. */
export interface SliceResult {
  readonly slice:  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    | { readonly kind: 'out-of-time'; readonly period: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    | { readonly kind: 'subgroup'; readonly field: string; readonly value: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly primary: MetricWithInterval;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** Residual autocorrelation of a forecast run. */
export interface ResidualDiagnostics {
  readonly acf: readonly number[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly ljungBox: { readonly statistic: number; readonly pValue: number; readonly lags: number };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly autocorrelationFlagged: boolean;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** What a run spent against its protocol's budgets. */
export interface RunCost {
  readonly computeSeconds: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** AI model tokens the run consumed (0 for a run that calls no AI model). */
  readonly tokens: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** US dollars the sidecar attributes to the run; the engine prices compute time separately from `computeSeconds`. */
  readonly usd: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly budget: Budgets;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly stoppedByBudget: boolean;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** Observed coverage of the prediction interval at one declared nominal level, on the holdout rows. */
export interface PredictionIntervalCoverage {
  readonly nominal: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly observed: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly n: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** One outer origin of a rolling-origin backtest (period ordinals at the unit's period). */
export interface RollingOriginResult {
  /** The origin's 1-based ordinal, earliest origin first. */
  readonly k: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly lastTrainPeriod: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly testPeriods: readonly number[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The MASE denominator: the seasonal-naive in-sample MAE of this origin's training window only, in target units. */
  readonly scale: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** MASE per forecaster at this origin: `model`, `naive`, `seasonalNaive`, `mean`. */
  readonly mase: Readonly<Record<string, number>>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** The forecast evaluation: MASE at every rolling origin and a Diebold–Mariano test of the model against seasonal naive. */
export interface ForecastEvaluation {
  readonly origins: readonly RollingOriginResult[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly dieboldMarianoVsSeasonalNaive: {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly statistic: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly pValue: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly meanDiff: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly n: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly horizon: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  };
}

/** The blocked/grouped inner score beside a random-row K-fold score on the same rows, both in the primary score's units. */
export interface SplitContrast {
  readonly rows: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly blockedGroupedScore: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly randomRowScore: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /**
   * A difference, not a ratio: `blockedGroupedScore − randomRowScore`, in the primary score's units. For a loss
   * (every primary score is one) a positive value is how much the random-row split understated the loss.
   */
  readonly inflation: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** Where a trainer run failed (disjoint from the engine's refusal stages, which stop a run before the sidecar). */
export type TrainerFailureStage = 'load-snapshot' | 'inner-cv' | 'holdout' | 'baselines' | 'timeout' | 'budget-exceeded';

/** What the sidecar returns: a completed run with every score and audit, or a failure naming its stage. */
export type TrainerResult =
  | {
      readonly status: 'completed';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly trainingRunId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly codeVersion: CodeVersion;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly computeSeconds: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly innerScores: readonly CandidateInnerScore[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly finalist: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** The single holdout access: when (ISO instant), how often (once) and for which finalist. */
      readonly holdoutAccess: { readonly accessedAt: string; readonly count: 1; readonly finalist: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly holdout: { readonly primary: MetricWithInterval; readonly secondary: readonly MetricWithInterval[] };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly baselines: readonly BaselineResult[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** Keyed `modelVsDummy`, `<member>VsDummy` and `modelVs:<member>`, as the reference pipeline keys them (reserved member names). */
      readonly comparisons: Readonly<Record<string, PairedComparison>>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** The sidecar's transcribed decision; the stored decision is computed in TypeScript by the gate rules. */
      readonly gate: GateDecision;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly artifacts: readonly ReturnedArtifact[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly incumbentDiff: {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
        readonly incumbentModelId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
        readonly value: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
        readonly lower: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
        readonly upper: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      } | null;
      readonly calibration: CalibrationReport | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly slices: readonly SliceResult[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly operatingPoint: {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
        readonly capacityPerPeriod: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
        readonly precisionAtCapacity: MetricWithInterval;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
        readonly baseRate: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      } | null;
      readonly cost: RunCost;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly importance: readonly SourceColumnImportance[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly leakageFlags: readonly LeakageFlag[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** One entry per nominal level the protocol's prediction intervals declare. */
      readonly predictionIntervalCoverage: readonly PredictionIntervalCoverage[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly residualDiagnostics: ResidualDiagnostics | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** The forecast evaluation of a rolling-origin run; null otherwise. */
      readonly forecast: ForecastEvaluation | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** The blocked versus random-row inner-score contrast; null unless the inner validation is blocked-time. */
      readonly innerSplitContrast: SplitContrast | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    }
  | {
      readonly status: 'failed';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly trainingRunId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly stage: TrainerFailureStage;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly message: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly computeSeconds: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    };

/** The completed variant of {@link TrainerResult}. */
export type TrainerCompleted = Extract<TrainerResult, { readonly status: 'completed' }>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
/** The failed variant of {@link TrainerResult}. */
export type TrainerFailed = Extract<TrainerResult, { readonly status: 'failed' }>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/** An artifact the engine stored in `MJ: Files`; a run's stored results keep this reference, never the bytes. */
export interface StoredArtifactRef {
  readonly candidate: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sha256: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly featureSchemaHash: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly classOrder: readonly string[] | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The `MJ: Files` row the artifact's bytes were stored as. */
  readonly fileId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** A completed {@link TrainerResult} as a run stores it (`ValidationResults.trainer`): every artifact replaced by its stored file. */
export type StoredTrainerResult = Omit<TrainerCompleted, 'artifacts'> & { readonly artifacts: readonly StoredArtifactRef[] };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/**
 * What a retrain needs to send the same request again (`ValidationResults.trainerRequest`). The downloads are not kept:
 * they expire, so a retrain issues new ones for the same snapshot files.
 */
export interface TrainerRequestConfig {
  readonly evaluationProtocolId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly candidates: readonly CandidateSpec[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly seed: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly threads: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly timeoutSeconds: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly maxRetries: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/**
 * `true` only when `Listed` names every key of `Shape` and nothing else; otherwise `never`, and assigning `true` fails
 * to compile. The member lists below are what the sidecar's pydantic mirror is checked against.
 */
type ListsExactlyTheKeys<Shape, Listed> = [Exclude<keyof Shape, Listed>] extends [never]
  ? [Exclude<Listed, keyof Shape>] extends [never] ? true : never
  : never;

/** Every member of {@link TrainerCompleted}. */
export const TRAINER_COMPLETED_KEYS = [
  'status', 'trainingRunId', 'codeVersion', 'computeSeconds', 'innerScores', 'finalist', 'holdoutAccess', 'holdout',
  'baselines', 'comparisons', 'gate', 'artifacts', 'incumbentDiff', 'calibration', 'slices', 'operatingPoint', 'cost',
  'importance', 'leakageFlags', 'predictionIntervalCoverage', 'residualDiagnostics', 'forecast', 'innerSplitContrast',
] as const satisfies readonly (keyof TrainerCompleted)[];

/** Every member of {@link TrainerFailed}. */
export const TRAINER_FAILED_KEYS = ['status', 'trainingRunId', 'stage', 'message', 'computeSeconds'] as const satisfies readonly (keyof TrainerFailed)[];

/** Every member of {@link TrainerRequest}. */
export const TRAINER_REQUEST_KEYS = [
  'trainingRunId', 'snapshot', 'incumbent', 'protocol', 'task', 'candidates', 'seed', 'threads', 'timeoutSeconds', 'maxRetries',
] as const satisfies readonly (keyof TrainerRequest)[];

/** Compile-time completeness: a member added to or dropped from TrainerCompleted without updating its list breaks the build. */
const trainerCompletedKeysExact: ListsExactlyTheKeys<TrainerCompleted, (typeof TRAINER_COMPLETED_KEYS)[number]> = true;
/** Compile-time completeness: a member added to or dropped from TrainerFailed without updating its list breaks the build. */
const trainerFailedKeysExact: ListsExactlyTheKeys<TrainerFailed, (typeof TRAINER_FAILED_KEYS)[number]> = true;
/** Compile-time completeness: a member added to or dropped from TrainerRequest without updating its list breaks the build. */
const trainerRequestKeysExact: ListsExactlyTheKeys<TrainerRequest, (typeof TRAINER_REQUEST_KEYS)[number]> = true;
void trainerCompletedKeysExact;
void trainerFailedKeysExact;
void trainerRequestKeysExact;

/** The format of the artifact envelope the trainer returns (each returned artifact's decoded bytes). */
export const PREDICTOR_ARTIFACT_FORMAT = 'ps-predictor/v2';

/** Libraries every run's CodeVersion must name: a lineage without them cannot be reproduced and is refused. */
export const REQUIRED_LIBRARIES = ['python', 'numpy', 'scikit-learn', 'xgboost', 'lightgbm'] as const;

/**
 * The holdout calibration-slope range a family must fall in to be offered. The sidecar's `SLOPE_RANGE` in
 * `app/calibration.py` declares the same range; a Core test compares the two.
 */
export const CALIBRATION_SLOPE_RANGE = [0.8, 1.2] as const;

/** Rules over the trainer contract. */
export class TrainerContract {
  /** What a CodeVersion lacks for lineage: missing library versions and a thread count below 1. Empty = complete. */
  public static CodeVersionGaps(cv: CodeVersion): string[] {
    const gaps: string[] = REQUIRED_LIBRARIES.filter((lib) => {
      const v = cv.libraryVersions[lib];
      return v === undefined || v.trim().length === 0;
    }).map((lib) => `libraryVersions.${lib}`);
    if (!Number.isInteger(cv.threads) || cv.threads < 1) gaps.push('threads');
    return gaps;
  }

  /**
   * Check a sidecar's `POST /trainer` answer against the contract: the typed result, or one problem per mismatch
   * (`<path>: <message>`). Unknown keys are refused, as the sidecar's own models refuse them.
   */
  public static ParseTrainerResult(value: JsonValue): ParseResult<TrainerResult> {
    return StoreSchemas.Validate(TrainerResultSchemas.TrainerResult, value);
  }

  /**
   * The result with every returned artifact replaced by the `MJ: Files` row it was stored as (`fileIds` maps candidate
   * to file ID), so the stored result carries no artifact bytes. Generic over the result shape, so a
   * {@link TrainerCompleted} becomes a {@link StoredTrainerResult}.
   *
   * @throws Error naming the candidate when an artifact has no stored file
   */
  public static ToStoredTrainerResult<T extends { readonly artifacts: readonly ReturnedArtifact[] }>(
    result: T,
    fileIds: ReadonlyMap<string, string>,
  ): Omit<T, 'artifacts'> & { readonly artifacts: readonly StoredArtifactRef[] } {
    const { artifacts, ...rest } = result;
    return {
      ...rest,
      artifacts: artifacts.map((a): StoredArtifactRef => {
        const fileId = fileIds.get(a.candidate);
        if (fileId === undefined) throw new Error(`artifact '${a.candidate}' has no stored file`);
        return { candidate: a.candidate, sha256: a.sha256, featureSchemaHash: a.featureSchemaHash, classOrder: a.classOrder, fileId };
      }),
    };
  }

  /** A completed run's holdout scores by metric: the primary score and every secondary one. */
  public static HoldoutMetricsOf(holdout: TrainerCompleted['holdout']): Record<string, number> {
    return Object.fromEntries([holdout.primary, ...holdout.secondary].map((m): [string, number] => [m.metric, m.value]));
  }

  /**
   * Whether a family is hidden for its holdout calibration: a slope outside 0.8–1.2, or one that is not a finite
   * number, hides it, so it is never offered. A null report (regression families have none) hides nothing.
   */
  public static CalibrationHidesFamily(report: CalibrationReport | null): boolean {
    if (report === null) return false;
    return (
      !Number.isFinite(report.slope) ||
      report.slope < CALIBRATION_SLOPE_RANGE[0] ||
      report.slope > CALIBRATION_SLOPE_RANGE[1]
    );
  }
}
