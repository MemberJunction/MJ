/**
 * @module training-run-results
 *
 * What a unit-based training run stores in `MJ: ML Training Runs.ValidationResults` (schema `ps-run-results/v2`).
 * The `refused` variant carries the refusal (its stage and reason); the `completed` variant carries the unit resolution
 * counts and one of two records of the training, so a later training of the same snapshot can call the trainer the
 * same way: a run trained under an Evaluation Protocol stores the trainer's result (`trainer`, artifacts as stored file
 * references, never bytes) and the request settings (`trainerRequest`); a unit run stored before every unit run was
 * trained under its protocol holds the legacy trainer's metrics and row counts (`legacy`) and the request settings
 * (`legacyRequest`), and is read but no longer written. A completed run also stores the
 * locked-holdout carve its protocol declared (`carve`). An envelope written before trainer results or the carve were
 * stored has no `trainer`/`trainerRequest`/`carve` members and reads them as null.
 */
import { z } from 'zod';
import type { AssemblyRefusal } from './assembly-contract';
import type { HoldoutSplit } from './evaluation-protocol';
import type { CarveRefusal, HoldoutCarveSummary } from './holdout-carve';
import type { UnitRefusal } from './prediction-unit';
import { TASK_KINDS } from './task-type';
import { JsonParse, type JsonObject, type JsonValue, type ParseResult } from './json-value';
import type { StoredTrainerResult, TrainerFailureStage, TrainerRequestConfig } from './trainer-contract';
import { TrainerResultSchemas } from './trainer-result-schemas';

export const TRAINING_RUN_RESULTS_SCHEMA = 'ps-run-results/v2';

export type PipelineRefusal =
  | { readonly kind: 'unit-required'; readonly pipelineId: string; readonly why: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'protocol-required'; readonly pipelineId: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'input-not-accepted'; readonly input: 'asOf' | 'labelEventDates' | 'maxRows'; readonly why: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'unit-invalid'; readonly unitId: string; readonly errors: readonly string[] }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'too-many-candidates'; readonly pipelineId: string; readonly candidates: number; readonly maxCandidates: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'protocol-created-after-run'; readonly protocolId: string; readonly protocolCreatedAt: string; readonly runCreatedAt: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'protocol-unit-mismatch'; readonly protocolId: string; readonly problems: readonly string[] }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'protocol-invalid'; readonly protocolId: string; readonly errors: readonly string[] };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/** A trainer run that did not complete: the stage it failed at, or a lineage the run cannot record. */
export type TrainerRefusal =
  | { readonly kind: 'trainer-failed'; readonly stage: TrainerFailureStage; readonly message: string; readonly computeSeconds: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'lineage-incomplete'; readonly gaps: readonly string[] };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export type TrainingRefusal =
  | { readonly stage: 'pipeline'; readonly reason: PipelineRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly stage: 'unit'; readonly reason: UnitRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly stage: 'assembly'; readonly reason: AssemblyRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly stage: 'trainer'; readonly reason: TrainerRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly stage: 'carve'; readonly reason: CarveRefusal };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export interface UnitResolutionCounts {
  readonly rowsRead: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly censoredRowsExcluded: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly labelKnownRowsExcluded: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly emptyLabelRowsExcluded: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly duplicateRowsRemoved: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly resolvedRows: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly dataCutoff: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

export interface LegacyTrainerMetrics {
  readonly metrics: Readonly<Record<string, number>>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdoutMetrics: Readonly<Record<string, number>> | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly trainingRowCount: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdoutRowCount: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/**
 * The settings a unit run called the trainer with, apart from the rows (those come from the run's Training Snapshot):
 * the algorithm driver key, the problem type, the hyperparameters and the validation the trainer applies inside the
 * development rows.
 */
export interface LegacyRequestConfig {
  readonly algorithm: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly problemType: 'classification' | 'regression';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly hyperparameters: JsonObject;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly validation: {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly strategy: 'train_test_split' | 'kfold' | 'holdout';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly test_size?: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly k?: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    readonly random_state?: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  };
}

export type TrainingRunResults =
  | { readonly schema: typeof TRAINING_RUN_RESULTS_SCHEMA; readonly status: 'refused'; readonly refusal: TrainingRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | {  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly schema: typeof TRAINING_RUN_RESULTS_SCHEMA;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly status: 'completed';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly unitResolution: UnitResolutionCounts;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly legacy: LegacyTrainerMetrics | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly legacyRequest: LegacyRequestConfig | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly trainer: StoredTrainerResult | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly trainerRequest: TrainerRequestConfig | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** The locked-holdout carve the protocol declared; null for a run without one and for an envelope stored before it existed. */
      readonly carve: HoldoutCarveSummary | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    };

// The stored envelope is parsed with zod, never `JSON.parse(...) as T`: the column is text any writer
// (a migration, a hand edit, an older build) can change, so every member is checked before the type is trusted.
// Each schema is annotated with the TypeScript type it parses, so `tsc` refuses a schema whose output does not fit it.
// A new envelope member, refusal stage or refusal kind needs its schema here and a case in
// `training-run-results.test.ts`: the union cannot make `tsc` notice a missing variant.
const pipelineRefusalSchema: z.ZodType<PipelineRefusal> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit-required'), pipelineId: z.string(), why: z.string() }),
  z.object({ kind: z.literal('protocol-required'), pipelineId: z.string() }),
  z.object({ kind: z.literal('input-not-accepted'), input: z.enum(['asOf', 'labelEventDates', 'maxRows']), why: z.string() }),
  z.object({ kind: z.literal('unit-invalid'), unitId: z.string(), errors: z.array(z.string()) }),
  z.object({ kind: z.literal('too-many-candidates'), pipelineId: z.string(), candidates: z.number().int(), maxCandidates: z.number().int() }),
  z.object({ kind: z.literal('protocol-created-after-run'), protocolId: z.string(), protocolCreatedAt: z.string(), runCreatedAt: z.string() }),
  z.object({ kind: z.literal('protocol-unit-mismatch'), protocolId: z.string(), problems: z.array(z.string()) }),
  z.object({ kind: z.literal('protocol-invalid'), protocolId: z.string(), errors: z.array(z.string()) }),
]);
const unitRefusalSchema: z.ZodType<UnitRefusal> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single-valued-target'), value: z.string(), rows: z.number() }),
  z.object({ kind: z.literal('task-type-mismatch'), declared: z.enum(TASK_KINDS), observed: z.string() }),
  z.object({ kind: z.literal('unresolved-reference'), entity: z.string(), field: z.string().nullable() }),
  z.object({ kind: z.literal('lag-inside-horizon'), lag: z.number(), horizonPeriods: z.number() }),
  z.object({ kind: z.literal('rolling-window-inside-horizon'), endLag: z.number(), horizonPeriods: z.number() }),
  z.object({ kind: z.literal('missing-decision-date'), entity: z.string(), rows: z.number() }),
  z.object({ kind: z.literal('no-resolved-rows'), censored: z.number(), labelKnown: z.number(), emptyLabel: z.number() }),
]);
const assemblyRefusalSchema: z.ZodType<AssemblyRefusal> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('select-changes-after-decision-date'), entity: z.string(), field: z.string(), changesAfter: z.number() }),
  z.object({ kind: z.literal('decision-date-before-change-history'), entity: z.string(), field: z.string(), historyStart: z.string().nullable(), rowsAffected: z.number() }),
  z.object({ kind: z.literal('truncated-read'), entity: z.string(), rowsExpected: z.number(), rowsRead: z.number() }),
  z.object({ kind: z.literal('non-numeric-in-numeric-column'), column: z.string(), sampleValue: z.string() }),
  z.object({ kind: z.literal('future-period-lag'), column: z.string(), lag: z.number(), horizonPeriods: z.number() }),
  z.object({ kind: z.literal('unpinned-feature-version'), featureName: z.string() }),
  z.object({ kind: z.literal('scope-entity-mismatch'), modelEntity: z.string(), scopeEntity: z.string() }),
  z.object({ kind: z.literal('unresolved-column'), entity: z.string(), field: z.string() }),
  z.object({ kind: z.literal('unsupported-step-kind'), stepId: z.string(), stepKind: z.string() }),
]);
const trainerRefusalSchema: z.ZodType<TrainerRefusal> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('trainer-failed'), stage: TrainerResultSchemas.TrainerFailureStage, message: z.string(), computeSeconds: z.number().nonnegative() }),
  z.object({ kind: z.literal('lineage-incomplete'), gaps: z.array(z.string()) }),
]);
const carveRefusalSchema: z.ZodType<CarveRefusal> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unparseable-cutoff'), value: z.string() }),
  z.object({ kind: z.literal('unparseable-carve-date'), rowId: z.string(), value: z.string() }),
  z.object({ kind: z.literal('missing-carve-date'), rowId: z.string(), column: z.string() }),
  z.object({ kind: z.literal('no-development-rows'), cutoff: z.string() }),
  z.object({ kind: z.literal('no-holdout-rows'), cutoff: z.string(), holdoutEnd: z.string().nullable() }),
  z.object({
    kind: z.literal('too-few-periods'), periods: z.number().int(), origins: z.number().int(), horizonPeriods: z.number().int(),
    gapPeriods: z.number().int(), minTrainPeriods: z.number().int(),
  }),
]);
/** `true` only when the list names every member of the union; otherwise `never`, and assigning `true` fails to compile. */
type ListsEveryMember<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : never;
/** Every holdout kind a stored carve summary may name; `satisfies` refuses a value that is not one. */
const HOLDOUT_KINDS = ['date-carved', 'rolling-origin', 'seeded-random'] as const satisfies readonly HoldoutSplit['kind'][];
/** Compile-time completeness: a `HoldoutSplit` kind added without listing it here breaks the build (a stored carve of that kind would otherwise be refused on read). */
const holdoutKindsComplete: ListsEveryMember<HoldoutSplit['kind'], (typeof HOLDOUT_KINDS)[number]> = true;
void holdoutKindsComplete;
const nonNegativeCount = z.number().int().nonnegative();
const holdoutCarveSummarySchema: z.ZodType<HoldoutCarveSummary> = z.object({
  kind: z.enum(HOLDOUT_KINDS),
  cutoff: z.string().nullable(),
  holdoutEnd: z.string().nullable(),
  developmentRowCount: nonNegativeCount,
  holdoutRowCount: nonNegativeCount,
  excludedAfterHoldoutEnd: nonNegativeCount,
  holdoutClassCounts: z.record(nonNegativeCount).nullable(),
  holdoutPeriods: z.array(z.string()),
  newEntity: z.object({
    holdoutEntityKeys: nonNegativeCount, trainingRowCount: nonNegativeCount, holdoutRowCount: nonNegativeCount,
    excludedRowCount: nonNegativeCount, sharedEntityKeys: nonNegativeCount,
  }).nullable(),
});
const trainingRefusalSchema: z.ZodType<TrainingRefusal> = z.discriminatedUnion('stage', [
  z.object({ stage: z.literal('pipeline'), reason: pipelineRefusalSchema }),
  z.object({ stage: z.literal('unit'), reason: unitRefusalSchema }),
  z.object({ stage: z.literal('assembly'), reason: assemblyRefusalSchema }),
  z.object({ stage: z.literal('trainer'), reason: trainerRefusalSchema }),
  z.object({ stage: z.literal('carve'), reason: carveRefusalSchema }),
]);
const unitResolutionCountsSchema: z.ZodType<UnitResolutionCounts> = z.object({
  rowsRead: z.number(), censoredRowsExcluded: z.number(), labelKnownRowsExcluded: z.number(),
  emptyLabelRowsExcluded: z.number(), duplicateRowsRemoved: z.number(), resolvedRows: z.number(), dataCutoff: z.string(),
});
const legacyTrainerMetricsSchema: z.ZodType<LegacyTrainerMetrics> = z.object({
  metrics: z.record(z.number()), holdoutMetrics: z.record(z.number()).nullable(),
  trainingRowCount: z.number(), holdoutRowCount: z.number(),
});
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);
const legacyRequestConfigSchema: z.ZodType<LegacyRequestConfig> = z.object({
  algorithm: z.string(),
  problemType: z.enum(['classification', 'regression']),
  hyperparameters: z.record(jsonValueSchema),
  validation: z.object({
    strategy: z.enum(['train_test_split', 'kfold', 'holdout']),
    test_size: z.number().optional(),
    k: z.number().int().optional(),
    random_state: z.number().int().optional(),
  }),
});
// The input type is left open (`unknown`) because `trainer`, `trainerRequest` and `carve` may be absent on read (an
// envelope written before they existed) while the parsed value always has them (absent reads as null).
const trainingRunResultsSchema: z.ZodType<TrainingRunResults, z.ZodTypeDef, unknown> = z.discriminatedUnion('status', [
  z.object({ schema: z.literal(TRAINING_RUN_RESULTS_SCHEMA), status: z.literal('refused'), refusal: trainingRefusalSchema }),
  z.object({
    schema: z.literal(TRAINING_RUN_RESULTS_SCHEMA),
    status: z.literal('completed'),
    unitResolution: unitResolutionCountsSchema,
    legacy: legacyTrainerMetricsSchema.nullable(),
    legacyRequest: legacyRequestConfigSchema.nullable(),
    trainer: TrainerResultSchemas.StoredTrainerResult.nullable().default(null),
    trainerRequest: TrainerResultSchemas.TrainerRequestConfig.nullable().default(null),
    carve: holdoutCarveSummarySchema.nullable().default(null),
  }),
]);

/** Reads the ValidationResults envelope of a unit-based run (static member on one owner). */
export class TrainingRunResultsParser {
  /** Reads the v2 envelope with its zod schema; a legacy (pre-v2) blob or any member of the wrong shape is reported as an error. */
  public static ParseTrainingRunResults(text: string | null): ParseResult<TrainingRunResults> {
    const json = JsonParse.ParseJsonText(text, 'ValidationResults');
    if (json.Ok === false) return json;
    if (!JsonParse.IsJsonObject(json.Value) || JsonParse.JsonString(json.Value, 'schema') !== TRAINING_RUN_RESULTS_SCHEMA) {
      return { Ok: false, Errors: ['ValidationResults is not a ps-run-results/v2 envelope'] };
    }
    const parsed = trainingRunResultsSchema.safeParse(json.Value);
    return parsed.success
      ? { Ok: true, Value: parsed.data }
      : { Ok: false, Errors: parsed.error.issues.map((i) => `ValidationResults.${i.path.join('.')}: ${i.message}`) };
  }
}
