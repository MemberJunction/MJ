/**
 * @module training-run-results
 *
 * What a unit-based training run stores in `MJ: ML Training Runs.ValidationResults` (schema `ps-run-results/v2`).
 * The `completed` variant carries the unit resolution, the trainer result and request, the holdout carve and the gate
 * record (the gate decision lives here).
 */
import { z } from 'zod';
import type { AssemblyRefusal } from './assembly-contract';
import type { UnitRefusal } from './prediction-unit';
import { TASK_KINDS, type TaskKind } from './task-type';
import { JsonParse, type ParseResult } from './json-value';

export const TRAINING_RUN_RESULTS_SCHEMA = 'ps-run-results/v2';

export type PipelineRefusal =
  | { readonly kind: 'unit-required'; readonly pipelineId: string; readonly why: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'protocol-required'; readonly pipelineId: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'input-not-accepted'; readonly input: 'asOf' | 'labelEventDates' | 'maxRows'; readonly why: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'unit-invalid'; readonly unitId: string; readonly errors: readonly string[] };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export type TrainingRefusal =
  | { readonly stage: 'pipeline'; readonly reason: PipelineRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly stage: 'unit'; readonly reason: UnitRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly stage: 'assembly'; readonly reason: AssemblyRefusal };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

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

export type TrainingRunResults =
  | { readonly schema: typeof TRAINING_RUN_RESULTS_SCHEMA; readonly status: 'refused'; readonly refusal: TrainingRefusal }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly schema: typeof TRAINING_RUN_RESULTS_SCHEMA; readonly status: 'completed'; readonly unitResolution: UnitResolutionCounts; readonly legacy: LegacyTrainerMetrics | null };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

// The stored envelope is parsed with zod, never `JSON.parse(...) as T`: the column is text any writer
// (a migration, a hand edit, an older build) can change, so every member is checked before the type is trusted.
// Each schema is annotated with the TypeScript type it parses, so `tsc` refuses a schema whose output does not fit it.
// Every later task that adds an envelope member, a refusal stage or a refusal kind extends these schemas in the same
// task and adds a case to `training-run-results.test.ts` (the union cannot make `tsc` notice a missing variant).
const pipelineRefusalSchema: z.ZodType<PipelineRefusal> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit-required'), pipelineId: z.string(), why: z.string() }),
  z.object({ kind: z.literal('protocol-required'), pipelineId: z.string() }),
  z.object({ kind: z.literal('input-not-accepted'), input: z.enum(['asOf', 'labelEventDates', 'maxRows']), why: z.string() }),
  z.object({ kind: z.literal('unit-invalid'), unitId: z.string(), errors: z.array(z.string()) }),
]);
const unitRefusalSchema: z.ZodType<UnitRefusal> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single-valued-target'), value: z.string(), rows: z.number() }),
  z.object({ kind: z.literal('task-type-mismatch'), declared: z.enum(TASK_KINDS as [TaskKind, ...TaskKind[]]), observed: z.string() }),
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
const trainingRefusalSchema: z.ZodType<TrainingRefusal> = z.discriminatedUnion('stage', [
  z.object({ stage: z.literal('pipeline'), reason: pipelineRefusalSchema }),
  z.object({ stage: z.literal('unit'), reason: unitRefusalSchema }),
  z.object({ stage: z.literal('assembly'), reason: assemblyRefusalSchema }),
]);
const unitResolutionCountsSchema: z.ZodType<UnitResolutionCounts> = z.object({
  rowsRead: z.number(), censoredRowsExcluded: z.number(), labelKnownRowsExcluded: z.number(),
  emptyLabelRowsExcluded: z.number(), duplicateRowsRemoved: z.number(), resolvedRows: z.number(), dataCutoff: z.string(),
});
const legacyTrainerMetricsSchema: z.ZodType<LegacyTrainerMetrics> = z.object({
  metrics: z.record(z.number()), holdoutMetrics: z.record(z.number()).nullable(),
  trainingRowCount: z.number(), holdoutRowCount: z.number(),
});
const trainingRunResultsSchema: z.ZodType<TrainingRunResults> = z.discriminatedUnion('status', [
  z.object({ schema: z.literal(TRAINING_RUN_RESULTS_SCHEMA), status: z.literal('refused'), refusal: trainingRefusalSchema }),
  z.object({ schema: z.literal(TRAINING_RUN_RESULTS_SCHEMA), status: z.literal('completed'), unitResolution: unitResolutionCountsSchema, legacy: legacyTrainerMetricsSchema.nullable() }),
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
