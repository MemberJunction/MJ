/**
 * @module scoring/scoring-process-shared
 *
 * Shared primitives for the two model-scoring Record-Process builders — the
 * **scheduled** helper ({@link module:scheduling/scheduled-model-scoring}, recurring
 * cron-driven write-back) and the **on-demand** helper
 * ({@link module:scoring/scoring-process}, a single `WorkType='ML Model'` Record
 * Process the UI run-now / generic scheduler dialog then targets). Both assemble the
 * SAME kind of Record Process row + (optional) `MJ: ML Model Scoring Bindings` lineage
 * row, differing only in trigger (schedule vs on-demand) and binding `Mode`
 * (`'Scheduled'` vs `'OnDemand'`).
 *
 * Rather than copy-paste that contract twice, the shared shape + the field-population
 * primitives live here: the scope model, the value-kind → result-ref mapping, the
 * runtime-registered work-type constant, scope application onto the row, the model
 * `Configuration` JSON, the (optional) write-back `OutputMapping`, scope validation,
 * target-entity resolution, and the lineage-binding creation. The two helpers compose
 * these primitives and own only their trigger-specific bits.
 */

import { LogError, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJRecordProcessEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { upsertScoringBinding, type ScoringBindingMode } from './scoring-binding';
import { MetadataEntityFactory } from '../training/seams';

/**
 * Which prediction value the write-back lands in the target column: the numeric
 * `score` (probability / regression value — the default) or the predicted `class`
 * label (classification). Maps to the `OutputMapping` result-ref `$.score` / `$.class`.
 */
export type ScoringValueKind = 'score' | 'class';

/**
 * The scope of records a scoring run covers. Exactly one selector must be populated —
 * the common case is a `filter` (SQL predicate over the target entity, e.g. only active
 * memberships), but a saved `viewId` or `listId` is also supported, as is `all` (the
 * whole entity — "score everyone"). Mirrors the Record Set Processing `ScopeType` shapes
 * (Filter / View / List); `all` is expressed as a `Filter` with an explicit all-rows
 * predicate (`(1=1)`).
 */
export interface ScoringScope {
  /** A SQL filter (`ScopeFilter`) over the target entity selecting the rows to score. */
  filter?: string;
  /** A `User Views` id whose rows are scored (`ScopeViewID`). */
  viewId?: string;
  /** A `Lists` id whose member rows are scored (`ScopeListID`). */
  listId?: string;
  /**
   * Score the WHOLE target entity ("score everyone"). When `true`, the run scores
   * every row — expressed as `ScopeType='Filter'` with the explicit all-rows
   * predicate `(1=1)`. Mutually exclusive with `filter` / `viewId` / `listId`.
   */
  all?: boolean;
}

/** The runtime-registered scoring work-type (PS2-1) — not in the CodeGen'd `WorkType` union. */
export const ML_MODEL_WORK_TYPE = 'ML Model';

/** Set the `ScopeType` + corresponding scope field from the (validated, single-selector) scope. */
export function applyScope(rp: MJRecordProcessEntity, scope: ScoringScope): void {
  if (scope.all === true) {
    // Whole entity ("score everyone") — a Filter with an explicit all-rows predicate.
    rp.ScopeType = 'Filter';
    rp.ScopeFilter = '(1=1)';
  } else if (scope.filter != null) {
    rp.ScopeType = 'Filter';
    rp.ScopeFilter = scope.filter;
  } else if (scope.viewId != null) {
    rp.ScopeType = 'View';
    rp.ScopeViewID = scope.viewId;
  } else {
    // The exactly-one-selector rule guarantees listId is the remaining case.
    rp.ScopeType = 'List';
    rp.ScopeListID = scope.listId as string;
  }
}

/** The prediction result-ref the write-back maps into the column: `$.class` for a label, else `$.score`. */
export function outputRef(valueKind: ScoringValueKind | undefined): string {
  return valueKind === 'class' ? '$.class' : '$.score';
}

/**
 * Serialize the model `Configuration` JSON every scoring Record Process carries: the
 * `MJ: ML Models` id to score with and the target-entity primary-key field (default
 * `'ID'`). The `'ML Model'` work-type reads this at run time to load + apply the model.
 */
export function modelConfiguration(modelId: string, primaryKeyField: string | undefined): string {
  return JSON.stringify({ modelId, primaryKeyField: primaryKeyField ?? 'ID' });
}

/**
 * Serialize the write-back `OutputMapping` JSON mapping the (non-empty) `outputField`
 * to the prediction result-ref for `valueKind`. Only called in write-back mode.
 */
export function writeBackOutputMapping(outputField: string, valueKind: ScoringValueKind | undefined): string {
  return JSON.stringify({ fields: { [outputField]: outputRef(valueKind) } });
}

/**
 * Create the `MJ: ML Model Scoring Bindings` lineage row for a just-saved scoring
 * Record Process. Reuses the already-resolved `entityID` (no second metadata lookup)
 * and the production `MetadataEntityFactory` over the same provider so the binding
 * lands on the right server in multi-provider setups. `mode` distinguishes the
 * scheduled (`'Scheduled'`) from the on-demand (`'OnDemand'`) caller.
 *
 * Fail-loud on save failure: {@link upsertScoringBinding} throws (after `LogError`)
 * when the binding `Save()` fails, which propagates out of this helper. We do NOT
 * swallow it — a scoring Record Process whose lineage binding is missing would score
 * records but stay invisible to the model-prediction panel / production dashboard, the
 * exact bug this wiring exists to prevent. The Record Process is already persisted at
 * this point, so the failure is surfaced for operator follow-up rather than rolled back
 * (there is no cross-row transaction across the two saves).
 *
 * @param modelId the `MJ: ML Models` id the binding scores with
 * @param outputField the (non-empty) target column the prediction lands in
 * @param recordProcessId the id of the just-saved scoring Record Process
 * @param entityID the already-resolved target-entity id
 * @param mode the binding mode — `'Scheduled'` or `'OnDemand'`
 * @param provider the metadata provider the binding is created against
 * @param contextUser request user — required server-side for isolation/audit
 * @param contextLabel a short helper name used to prefix the contextual log on failure
 */
export async function createScoringBinding(
  modelId: string,
  outputField: string,
  recordProcessId: string,
  entityID: string,
  mode: ScoringBindingMode,
  provider: IMetadataProvider,
  contextUser: UserInfo | undefined,
  contextLabel: string,
): Promise<MJMLModelScoringBindingEntity> {
  try {
    return await upsertScoringBinding(
      {
        mlModelId: modelId,
        recordProcessId,
        targetEntityId: entityID,
        targetColumn: outputField,
        mode,
      },
      new MetadataEntityFactory(provider),
      contextUser,
    );
  } catch (e) {
    // upsertScoringBinding already LogError'd the underlying Save() failure; add the
    // caller's context (the saved RP id) so the inconsistency is traceable.
    LogError(
      `${contextLabel}: Record Process '${recordProcessId}' saved but its scoring binding ` +
        `failed for model '${modelId}': ${e instanceof Error ? e.message : String(e)}`,
    );
    throw e;
  }
}

/**
 * Count how many of the mutually-exclusive scope selectors are populated — the basis
 * for the exactly-one-selector validation both helpers enforce.
 */
export function countScopeSelectors(scope: ScoringScope | undefined): number {
  if (!scope) {
    return 0;
  }
  let count = 0;
  if (isNonEmpty(scope.filter)) count++;
  if (isNonEmpty(scope.viewId)) count++;
  if (isNonEmpty(scope.listId)) count++;
  if (scope.all === true) count++;
  return count;
}

/**
 * Resolve the target entity's id from its name, throwing when the entity is unknown.
 * `contextLabel` prefixes the error so the failing helper is identifiable.
 */
export function resolveTargetEntityID(
  targetEntityName: string,
  provider: IMetadataProvider,
  contextLabel: string,
): string {
  const entity = provider.EntityByName(targetEntityName);
  if (!entity) {
    throw new Error(`${contextLabel}: target entity '${targetEntityName}' was not found in metadata.`);
  }
  return entity.ID;
}

/** Whether a value is a non-empty (trimmed) string. */
export function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
