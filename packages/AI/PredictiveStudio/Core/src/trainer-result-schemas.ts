/**
 * @module trainer-result-schemas
 *
 * Zod schemas of the sidecar's `POST /trainer` answer. The answer crosses a process boundary, so it is checked rather
 * than cast: a sidecar of another version, or a wrong host behind a configured URL, can answer 200 with a body that
 * is not a {@link TrainerResult}, and the engine records the answer as lineage.
 *
 * Every object is `.strict()`, as the sidecar's pydantic models forbid unknown keys, and the field constraints the
 * pydantic models declare (36-character run IDs, lower-case hex SHA-256 digests, ISO dates, integer counts) are
 * declared here too. {@link TrainerResultSchemas.ModelFields} lists each object's members under its pydantic model's
 * name in `Sidecar/src/python/app/trainer_schemas.py`, so a test can compare the two declarations member by member.
 */
import { z } from 'zod';
import type { BaselineSpec, Budgets, CalibrationMethod, MetricKey, MetricWithInterval } from './evaluation-protocol';
import type { GateDecision, PairedComparison } from './gate';
import type {
  CandidateSpec,
  LeakageFlag,
  SliceResult,
  StoredTrainerResult,
  TrainerFailureStage,
  TrainerRequestConfig,
  TrainerResult,
} from './trainer-contract';

/** `true` only when the list names every member of the union; otherwise `never`, and assigning `true` fails to compile. */
type ListsEveryMember<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;

/** Every metric key; `satisfies` refuses a value that is not one. */
const METRIC_KEYS = [
  'log-loss', 'brier', 'multiclass-log-loss', 'rmse', 'mae', 'poisson-deviance', 'tweedie-deviance', 'mase',
  'auc', 'accuracy', 'f1', 'precision', 'recall', 'r2', 'calibration-slope',
] as const satisfies readonly MetricKey[];

/** Every stage a trainer run can fail at; `satisfies` refuses a value that is not one. */
const FAILURE_STAGES = [
  'load-snapshot', 'inner-cv', 'holdout', 'baselines', 'timeout', 'budget-exceeded',
] as const satisfies readonly TrainerFailureStage[];

/** Every calibration method kind; `satisfies` refuses a value that is not one. */
const CALIBRATION_KINDS = ['platt', 'isotonic', 'auto', 'not-applicable'] as const satisfies readonly CalibrationMethod['kind'][];

/** Compile-time completeness: a metric key, failure stage or calibration kind added without listing it here breaks the build. */
const metricKeysComplete: ListsEveryMember<MetricKey, (typeof METRIC_KEYS)[number]> = true;
const failureStagesComplete: ListsEveryMember<TrainerFailureStage, (typeof FAILURE_STAGES)[number]> = true;
const calibrationKindsComplete: ListsEveryMember<CalibrationMethod['kind'], (typeof CALIBRATION_KINDS)[number]> = true;
void metricKeysComplete;
void failureStagesComplete;
void calibrationKindsComplete;

const uuid = z.string().length(36);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const nonEmpty = z.string().min(1);
const int = z.number().int();

const interval = z.object({ level: z.number(), lower: z.number(), upper: z.number() }).strict();
const metricWithInterval = z.object({ metric: z.enum(METRIC_KEYS), value: z.number(), interval, n: int }).strict();

const dummyBaseline = z.object({ kind: z.literal('dummy'), name: z.enum(['base-rate', 'mean', 'training-window-mean']) }).strict();
const oneFeatureBaseline = z.object({ kind: z.literal('one-feature'), selection: z.literal('best-single-feature-inner-cv') }).strict();
const glmBaseline = z.object({
  kind: z.literal('glm'),
  family: z.enum(['logistic', 'multinomial', 'gaussian', 'poisson', 'tweedie']),
  penalty: z.literal('l2'),
}).strict();
const naiveBaseline = z.object({ kind: z.literal('naive') }).strict();
const seasonalNaiveBaseline = z.object({ kind: z.literal('seasonal-naive'), season: int.min(1) }).strict();
const incumbentHeuristicBaseline = z.object({ kind: z.literal('incumbent-heuristic'), name: nonEmpty }).strict();

const budgets = z.object({
  maxComputeSeconds: z.number().positive(),
  maxTokens: int.min(0),
  maxCandidates: int.min(1),
  hardStop: z.literal(true),
}).strict();

const codeVersion = z.object({
  psGitSha: z.string(),
  sidecarVersion: z.string(),
  libraryVersions: z.record(z.string()),
  threads: int,
  seed: int,
}).strict();

const candidateInnerScore = z.object({ candidate: z.string(), inner: metricWithInterval, folds: int, optimistic: z.literal(true) }).strict();
const holdoutAccess = z.object({ accessedAt: z.string(), count: z.literal(1), finalist: z.string() }).strict();
const holdoutScores = z.object({ primary: metricWithInterval, secondary: z.array(metricWithInterval) }).strict();
const pairedComparison = z.object({ value: z.number(), ci: z.tuple([z.number(), z.number()]), beats: z.boolean() }).strict();

const gateModel = z.object({
  outcome: z.literal('model'),
  branch: z.enum(['a:beats-best-simple', 'a:Q15-only-model-beats-dummy']),
  shipped: z.string(),
  shippedRole: z.literal('model'),
  note: z.literal('no simple baseline carries demonstrable signal').nullable(),
}).strict();
const gateKeepSimple = z.object({
  outcome: z.literal('keep-simple-baseline'),
  branch: z.literal('b:keep-simple-baseline'),
  shipped: z.string(),
  shippedRole: z.literal('simpleBaseline'),
  note: z.null(),
}).strict();
const gateNoSignal = z.object({
  outcome: z.literal('no-signal'),
  branch: z.literal('c:no-signal'),
  shipped: z.null(),
  shippedRole: z.null(),
  note: z.null(),
}).strict();

const returnedArtifact = z.object({
  candidate: z.string(),
  bytesBase64: z.string(),
  sha256,
  featureSchemaHash: sha256,
  classOrder: z.array(z.string()).nullable(),
}).strict();
const incumbentDiff = z.object({ incumbentModelId: nonEmpty, value: z.number(), lower: z.number(), upper: z.number() }).strict();
const reliabilityRow = z.object({
  binLower: z.number(), binUpper: z.number(), meanPredicted: z.number(), observedRate: z.number(), n: int,
}).strict();
const calibrationReport = z.object({
  method: z.enum(CALIBRATION_KINDS), intercept: z.number(), slope: z.number(), reliability: z.array(reliabilityRow),
}).strict();
const outOfTimeSlice = z.object({ kind: z.literal('out-of-time'), period: isoDate }).strict();
const subgroupSlice = z.object({ kind: z.literal('subgroup'), field: z.string(), value: z.string() }).strict();
const sliceResult = z.object({ slice: z.discriminatedUnion('kind', [outOfTimeSlice, subgroupSlice]), primary: metricWithInterval }).strict();
const operatingPoint = z.object({ capacityPerPeriod: z.number(), precisionAtCapacity: metricWithInterval, baseRate: z.number() }).strict();
const runCost = z.object({
  computeSeconds: z.number(), tokens: int, usd: z.number(), budget: budgets, stoppedByBudget: z.boolean(),
}).strict();
const sourceColumnImportance = z.object({ sourceColumn: z.string(), permutationImportance: metricWithInterval }).strict();
const singleFeatureAucFlag = z.object({ kind: z.literal('single-feature-auc'), sourceColumn: z.string(), heldOutAuc: z.number() }).strict();
const timeShiftedLabelFlag = z.object({ kind: z.literal('time-shifted-label'), scoreWithShiftedLabel: z.number() }).strict();
const dropColumnFlag = z.object({ kind: z.literal('drop-column'), sourceColumn: z.string(), scoreDrop: z.number() }).strict();
const highCardinalityIdFlag = z.object({ kind: z.literal('high-cardinality-id'), sourceColumn: z.string(), distinctRatio: z.number() }).strict();
const predictionIntervalCoverage = z.object({ nominal: z.number(), observed: z.number(), n: int }).strict();
const ljungBox = z.object({ statistic: z.number(), pValue: z.number(), lags: int }).strict();
const residualDiagnostics = z.object({ acf: z.array(z.number()), ljungBox, autocorrelationFlagged: z.boolean() }).strict();
const rollingOriginResult = z.object({
  k: int, lastTrainPeriod: int, testPeriods: z.array(int), scale: z.number(), mase: z.record(z.number()),
}).strict();
const dieboldMariano = z.object({ statistic: z.number(), pValue: z.number(), meanDiff: z.number(), n: int, horizon: int }).strict();
const forecastEvaluation = z.object({ origins: z.array(rollingOriginResult), dieboldMarianoVsSeasonalNaive: dieboldMariano }).strict();
const splitContrast = z.object({ rows: int, blockedGroupedScore: z.number(), randomRowScore: z.number(), inflation: z.number() }).strict();

const baselineSpec = z.discriminatedUnion('kind', [
  dummyBaseline, oneFeatureBaseline, glmBaseline, naiveBaseline, seasonalNaiveBaseline, incumbentHeuristicBaseline,
]);
const baselineResult = z.object({ baseline: baselineSpec, role: z.enum(['dummy', 'simple']), holdout: metricWithInterval }).strict();
const leakageFlag = z.discriminatedUnion('kind', [singleFeatureAucFlag, timeShiftedLabelFlag, dropColumnFlag, highCardinalityIdFlag]);

const trainerCompleted = z.object({
  status: z.literal('completed'),
  trainingRunId: uuid,
  codeVersion,
  computeSeconds: z.number(),
  innerScores: z.array(candidateInnerScore),
  finalist: z.string(),
  holdoutAccess,
  holdout: holdoutScores,
  baselines: z.array(baselineResult),
  comparisons: z.record(pairedComparison),
  gate: z.discriminatedUnion('outcome', [gateModel, gateKeepSimple, gateNoSignal]),
  artifacts: z.array(returnedArtifact),
  incumbentDiff: incumbentDiff.nullable(),
  calibration: calibrationReport.nullable(),
  slices: z.array(sliceResult),
  operatingPoint: operatingPoint.nullable(),
  cost: runCost,
  importance: z.array(sourceColumnImportance),
  leakageFlags: z.array(leakageFlag),
  predictionIntervalCoverage: z.array(predictionIntervalCoverage),
  residualDiagnostics: residualDiagnostics.nullable(),
  forecast: forecastEvaluation.nullable(),
  innerSplitContrast: splitContrast.nullable(),
}).strict();

const trainerFailed = z.object({
  status: z.literal('failed'),
  trainingRunId: uuid,
  stage: z.enum(FAILURE_STAGES),
  message: z.string(),
  computeSeconds: z.number(),
}).strict();

// The stored forms (`ValidationResults.trainer` and `.trainerRequest`) are defined from the wire schemas above, so the
// stored result and the sidecar's answer cannot drift apart: the stored result is the completed answer with each
// artifact's bytes replaced by the file it was stored as.
const storedArtifactRef = returnedArtifact.omit({ bytesBase64: true }).extend({ fileId: nonEmpty });
const storedTrainerResult = trainerCompleted.omit({ artifacts: true }).extend({ artifacts: z.array(storedArtifactRef) });
const candidateSpec = z.object({
  name: nonEmpty,
  algorithmId: nonEmpty,
  driverKey: nonEmpty,
  hyperparameters: z.record(z.union([z.number(), z.string(), z.boolean(), z.null()])),
}).strict();
const trainerRequestConfig = z.object({
  evaluationProtocolId: nonEmpty,
  candidates: z.array(candidateSpec),
  seed: int,
  threads: int.min(1),
  timeoutSeconds: z.number().positive(),
  maxRetries: int.min(0),
}).strict();

/** Each object schema under the name of the pydantic model it mirrors. */
const MODEL_OBJECTS = {
  Interval: interval, MetricWithInterval: metricWithInterval,
  DummyBaseline: dummyBaseline, OneFeatureBaseline: oneFeatureBaseline, GlmBaseline: glmBaseline, NaiveBaseline: naiveBaseline,
  SeasonalNaiveBaseline: seasonalNaiveBaseline, IncumbentHeuristicBaseline: incumbentHeuristicBaseline, Budgets: budgets,
  CodeVersion: codeVersion, CandidateInnerScore: candidateInnerScore, HoldoutAccess: holdoutAccess, HoldoutScores: holdoutScores,
  BaselineResult: baselineResult, PairedComparison: pairedComparison,
  GateModel: gateModel, GateKeepSimple: gateKeepSimple, GateNoSignal: gateNoSignal,
  ReturnedArtifact: returnedArtifact, IncumbentDiff: incumbentDiff, ReliabilityRow: reliabilityRow, CalibrationReport: calibrationReport,
  OutOfTimeSlice: outOfTimeSlice, SubgroupSlice: subgroupSlice, SliceResult: sliceResult, OperatingPoint: operatingPoint, RunCost: runCost,
  SourceColumnImportance: sourceColumnImportance, SingleFeatureAucFlag: singleFeatureAucFlag, TimeShiftedLabelFlag: timeShiftedLabelFlag,
  DropColumnFlag: dropColumnFlag, HighCardinalityIdFlag: highCardinalityIdFlag, PredictionIntervalCoverage: predictionIntervalCoverage,
  LjungBox: ljungBox, ResidualDiagnostics: residualDiagnostics, RollingOriginResult: rollingOriginResult, DieboldMariano: dieboldMariano,
  ForecastEvaluation: forecastEvaluation, SplitContrast: splitContrast, TrainerCompleted: trainerCompleted, TrainerFailed: trainerFailed,
} as const;

/** The trainer answer's schemas, as static members on one owner class. */
export class TrainerResultSchemas {
  /** The whole answer: a completed run or a failure naming its stage. */
  public static readonly TrainerResult: z.ZodType<TrainerResult> = z.discriminatedUnion('status', [trainerCompleted, trainerFailed]);
  /** One score with its interval. */
  public static readonly MetricWithInterval: z.ZodType<MetricWithInterval> = metricWithInterval;
  /** One baseline specification. */
  public static readonly BaselineSpec: z.ZodType<BaselineSpec> = baselineSpec;
  /** A protocol's budgets, as a run's cost reports them. */
  public static readonly Budgets: z.ZodType<Budgets> = budgets;
  /** One paired comparison. */
  public static readonly PairedComparison: z.ZodType<PairedComparison> = pairedComparison;
  /** The gate's decision. */
  public static readonly GateDecision: z.ZodType<GateDecision> = z.discriminatedUnion('outcome', [gateModel, gateKeepSimple, gateNoSignal]);
  /** One leakage-audit finding. */
  public static readonly LeakageFlag: z.ZodType<LeakageFlag> = leakageFlag;
  /** The primary score on one slice. */
  public static readonly SliceResult: z.ZodType<SliceResult> = sliceResult;

  /** A stage a trainer run can fail at. */
  public static readonly TrainerFailureStage: z.ZodType<TrainerFailureStage> = z.enum(FAILURE_STAGES);
  /** A completed answer as a run stores it: every artifact replaced by its stored `MJ: Files` row. */
  public static readonly StoredTrainerResult: z.ZodType<StoredTrainerResult> = storedTrainerResult;
  /** One candidate of a request. */
  public static readonly CandidateSpec: z.ZodType<CandidateSpec> = candidateSpec;
  /** The request settings a run stores so a retrain sends the same request with new downloads. */
  public static readonly TrainerRequestConfig: z.ZodType<TrainerRequestConfig> = trainerRequestConfig;

  /** Each object's member names, keyed by the name of the pydantic model it mirrors (for the parity test). */
  public static readonly ModelFields: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
    Object.entries(MODEL_OBJECTS).map(([name, schema]) => [name, Object.keys(schema.shape)]),
  );
}
