/**
 * @module scheduling/scheduled-model-scoring
 *
 * **Scheduled model scoring** (plan PS2-6 — the north-star enabler). A one-call way
 * to bind a trained `MJ: ML Models` to write its prediction into a target entity
 * column on a recurring schedule (e.g. monthly): "build a model, write the renewal
 * probability back into the member record, and re-score it on the 1st of every
 * month." This is the helper the Model Dev Agent fulfils that goal with.
 *
 * ## How it works (composition, no new substrate)
 * Everything underneath already exists; this helper just assembles a single
 * `MJ: Record Processes` row that the existing machinery picks up:
 *
 *   1. {@link createScheduledModelScoring} creates + saves a Record Process with
 *      `WorkType='ML Model'` (the runtime-registered scoring work type, PS2-1),
 *      a `Configuration` of `{ modelId, primaryKeyField }`, an `OutputMapping` of
 *      `{ fields: { <outputField>: '$.score' } }` (write the prediction into a
 *      column), and `ScheduleEnabled=true` + a cron expression for the cadence.
 *   2. Saving that row with `Status='Active'` + `ScheduleEnabled=true` + a
 *      `CronExpression` auto-creates an owned `MJ: Scheduled Jobs` row (via
 *      `MJRecordProcessEntityServer.Save → reconcileScheduledJob`).
 *   3. `SchedulingEngine` dispatches that job on its cron through
 *      `RecordProcessScheduledJobDriver → RecordProcessExecutor.RunByID(...)`,
 *      which resolves the scope, scores each row with the model, and writes the
 *      prediction back per the `OutputMapping`.
 *   4. AFTER the Record Process is saved, this helper also creates a
 *      `MJ: ML Model Scoring Bindings` row (`Mode='Scheduled'`) tying the model to
 *      that Record Process + target entity/column. The binding is the **lineage
 *      record** the new UX surfaces read — the model-prediction form panel and the
 *      "Models in Production" dashboard both list operationalized models from these
 *      binding rows — so without it the scheduled scoring would run but be invisible.
 *
 * So binding a model to a recurring write-back is a single create-and-save (plus a
 * lineage binding) — no new scheduling, dispatch, or write-back code. This module
 * only validates inputs, maps a cadence to a cron string, populates that one Record
 * Process row, and records the binding for it.
 *
 * The `'ML Model'` `WorkType` is a runtime-registered extension (PS2-1) that the
 * CodeGen'd `WorkType` value-list union (`'Action' | 'Agent' | 'FieldRules' |
 * 'Infer'`) cannot represent, so it is set via `rp.Set('WorkType', 'ML Model')` —
 * the same legitimate, documented exception PS2-1's scoring path uses.
 */

import { LogError, type UserInfo, type IMetadataProvider, Metadata } from '@memberjunction/core';
import type { MJRecordProcessEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { upsertScoringBinding } from '../scoring/scoring-binding';
import { MetadataEntityFactory } from '../training/seams';

/**
 * Recurrence for the scheduled scoring run. The named cadences map to a fixed cron
 * (see {@link CADENCE_CRON}); supply `{ cron }` for any other recurrence.
 */
export type ScoringCadence = 'Monthly' | 'Weekly' | 'Daily' | { cron: string };

/**
 * Which prediction value the write-back lands in the target column: the numeric
 * `score` (probability / regression value — the default) or the predicted `class`
 * label (classification). Maps to the `OutputMapping` result-ref `$.score` / `$.class`.
 */
export type ScoringValueKind = 'score' | 'class';

/**
 * The scope of records each scheduled run scores. Exactly one selector must be
 * populated — the common case is a `filter` (SQL predicate over the target entity,
 * e.g. only active memberships), but a saved `viewId` or `listId` is also supported,
 * as is `all` (the whole entity — "score everyone"). Mirrors the Record Set Processing
 * `ScopeType` shapes (Filter / View / List); `all` is expressed as a `Filter` with an
 * explicit all-rows predicate (`(1=1)`).
 */
export interface ScheduledScoringScope {
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

/**
 * Inputs for {@link createScheduledModelScoring}. The required trio — `modelId`,
 * `targetEntityName`, and exactly one `scope` selector — is the minimum to bind a
 * model to a recurring scoring run; everything else has a sensible default (monthly
 * cadence, `ID` primary key, numeric score, UTC, generated name).
 *
 * Two output modes, driven by whether `outputField` is supplied:
 * - **Write-back** (`outputField` present): each run writes the prediction into that
 *   target column AND a `MJ: ML Model Scoring Bindings` lineage row is created.
 * - **Generic** (`outputField` omitted): each run records its predictions in the
 *   process run history (`MJ: Process Run Details`) only — no write-back column and
 *   no scoring binding.
 */
export interface ScheduleModelScoringOptions {
  /** The `MJ: ML Models` id to score with. */
  modelId: string;
  /** The entity whose rows are scored (e.g. `'Memberships'`). */
  targetEntityName: string;
  /**
   * Optional. The target-entity column to write the prediction into (e.g.
   * `'RenewalScore'`). **Omit for generic output** — each run's predictions are
   * recorded in the process run history (`MJ: Process Run Details`) only; no
   * write-back column and no scoring binding are created.
   */
  outputField?: string;
  /** The records each run scores. Populate EXACTLY ONE of: `filter`, `viewId`, `listId`, `all`. */
  scope: ScheduledScoringScope;
  /** Recurrence; defaults to `'Monthly'` (the 1st of every month at 00:00). */
  cadence?: ScoringCadence;
  /** Primary-key field on the target entity (defaults to `'ID'`). */
  primaryKeyField?: string;
  /** Which prediction value to write — numeric `'score'` (default) or `'class'` label. */
  valueKind?: ScoringValueKind;
  /** Optional Record Process name; a descriptive default is generated when omitted. */
  name?: string;
  /** Timezone the cron is evaluated in (defaults to `'UTC'`). */
  timezone?: string;
  /** Server-side context user (required for data isolation + audit on the saved row). */
  contextUser?: UserInfo;
  /** Metadata provider to create the entity object against (defaults to the global). */
  provider?: IMetadataProvider;
}

/**
 * The cron expression each named {@link ScoringCadence} maps to.
 * - `Monthly` → `0 0 1 * *`  (00:00 on the 1st of every month)
 * - `Weekly`  → `0 0 * * 0`  (00:00 every Sunday)
 * - `Daily`   → `0 0 * * *`  (00:00 every day)
 */
export const CADENCE_CRON: Readonly<Record<'Monthly' | 'Weekly' | 'Daily', string>> = {
  Monthly: '0 0 1 * *',
  Weekly: '0 0 * * 0',
  Daily: '0 0 * * *',
};

/** The runtime-registered scoring work-type (PS2-1) — not in the CodeGen'd `WorkType` union. */
const ML_MODEL_WORK_TYPE = 'ML Model';

/**
 * The result of {@link createScheduledModelScoring}: the saved scheduled Record
 * Process AND — in write-back mode — its lineage binding. The Record Process is the
 * row that *does* the recurring scoring; the `MJ: ML Model Scoring Bindings` row
 * *records* it (the latter is what the model-prediction form panel and "Models in
 * Production" dashboard read).
 *
 * `binding` is `null` in **generic** mode (no `outputField`): there is no write-back
 * column to bind, so no lineage row is created — predictions live in the process run
 * history (`MJ: Process Run Details`) only.
 */
export interface ScheduledModelScoringResult {
  /** The saved scheduled `MJ: Record Processes` entity (its owned scheduled job already reconciled). */
  recordProcess: MJRecordProcessEntity;
  /**
   * The saved `MJ: ML Model Scoring Bindings` lineage row (`Mode='Scheduled'`) in
   * write-back mode, or `null` in generic mode (no `outputField`, no binding).
   */
  binding: MJMLModelScoringBindingEntity | null;
}

/**
 * Create and save a scheduled Record Process that scores `targetEntity`'s rows with
 * `modelId` on a recurring cadence. Operates in one of two modes, driven by whether
 * `opts.outputField` is supplied:
 *
 * - **Write-back** (`outputField` present): each run writes the prediction into that
 *   target column (via the Record Process `OutputMapping`), AND this helper records a
 *   `MJ: ML Model Scoring Bindings` lineage row (`Mode='Scheduled'`) tying the model →
 *   Record Process → target entity/column so the operationalized model is discoverable
 *   by the UX surfaces that read those bindings. `result.binding` is the saved row.
 * - **Generic** (`outputField` omitted): no `OutputMapping` is set and no binding is
 *   created — each run's predictions are recorded in the process run history
 *   (`MJ: Process Run Details`) only. `result.binding` is `null`.
 *
 * In both modes, saving the Record Process auto-creates its owned `MJ: Scheduled Jobs`
 * row (so the run is live on the schedule immediately).
 *
 * @param opts the model + target + scope + cadence (see {@link ScheduleModelScoringOptions})
 * @returns the saved Record Process AND — in write-back mode — its scoring binding
 *   (`null` in generic mode); see {@link ScheduledModelScoringResult}
 * @throws if a required input is missing, the scope is not exactly one selector, the
 *   target entity is unknown, the Record Process fails to save, or — in write-back mode,
 *   after the Record Process was saved — the binding fails to save (the message carries
 *   the cause). The binding save is intentionally fail-loud (not swallowed): a saved RP
 *   without a binding would run invisibly to the lineage UX, so we surface the inconsistency.
 */
export async function createScheduledModelScoring(
  opts: ScheduleModelScoringOptions,
): Promise<ScheduledModelScoringResult> {
  validateOptions(opts);

  const provider = opts.provider ?? Metadata.Provider;
  const entityID = resolveTargetEntityID(opts.targetEntityName, provider);
  const cron = cadenceToCron(opts.cadence);

  const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', opts.contextUser);
  rp.NewRecord();
  applyRecordProcessFields(rp, opts, entityID, cron);

  if (!(await rp.Save())) {
    throw new Error(
      `createScheduledModelScoring: failed to save Record Process for model '${opts.modelId}': ` +
        `${rp.LatestResult?.CompleteMessage ?? 'unknown error'}`,
    );
  }

  // Lineage binding only in write-back mode — generic output has no column to bind.
  const binding = isNonEmpty(opts.outputField)
    ? await createScoringBinding(opts, rp.ID, entityID, provider)
    : null;
  return { recordProcess: rp, binding };
}

/**
 * Record the `MJ: ML Model Scoring Bindings` lineage row for a just-saved scheduled
 * Record Process. Reuses the already-resolved `entityID` (no second metadata lookup)
 * and the production `MetadataEntityFactory` over the same provider so the binding
 * lands on the right server in multi-provider setups.
 *
 * Fail-loud on save failure: {@link upsertScoringBinding} throws (after `LogError`)
 * when the binding `Save()` fails, which propagates out of this helper. We do NOT
 * swallow it — a scheduled Record Process whose lineage binding is missing would
 * score records but stay invisible to the model-prediction panel / production
 * dashboard, the exact bug this wiring exists to prevent. The Record Process is
 * already persisted at this point, so the failure is surfaced for operator follow-up
 * rather than rolled back (there is no cross-row transaction across the two saves).
 */
async function createScoringBinding(
  opts: ScheduleModelScoringOptions,
  recordProcessId: string,
  entityID: string,
  provider: IMetadataProvider,
): Promise<MJMLModelScoringBindingEntity> {
  try {
    return await upsertScoringBinding(
      {
        mlModelId: opts.modelId,
        recordProcessId,
        targetEntityId: entityID,
        targetColumn: opts.outputField,
        mode: 'Scheduled',
      },
      new MetadataEntityFactory(provider),
      opts.contextUser,
    );
  } catch (e) {
    // upsertScoringBinding already LogError'd the underlying Save() failure; add the
    // scheduled-scoring context (the saved RP id) so the inconsistency is traceable.
    LogError(
      `createScheduledModelScoring: Record Process '${recordProcessId}' saved but its scoring binding ` +
        `failed for model '${opts.modelId}': ${e instanceof Error ? e.message : String(e)}`,
    );
    throw e;
  }
}

// ----- field population --------------------------------------------------------

/**
 * Populate the Record Process row from the (validated) options — the single place
 * the scheduled-scoring contract is encoded onto the entity. Sets the lifecycle +
 * work-type, the scope, the model `Configuration`, the schedule (cron + timezone),
 * and enables on-demand runs too.
 *
 * The write-back `OutputMapping` is set ONLY in write-back mode (`opts.outputField`
 * present). In generic mode it is left unset, so each run records its predictions in
 * the process run history (`MJ: Process Run Details`) only — there is no target column.
 */
function applyRecordProcessFields(
  rp: MJRecordProcessEntity,
  opts: ScheduleModelScoringOptions,
  entityID: string,
  cron: string,
): void {
  rp.Name = opts.name ?? defaultName(opts, cron);
  rp.EntityID = entityID;
  rp.Status = 'Active';
  // 'ML Model' is the runtime-registered scoring work-type (PS2-1); the generated
  // WorkType union (`'Action' | 'Agent' | 'FieldRules' | 'Infer'`) can't represent
  // it, so Set() is the legitimate, documented exception (same as PS2-1's path).
  rp.Set('WorkType', ML_MODEL_WORK_TYPE);

  applyScope(rp, opts.scope);

  rp.Configuration = JSON.stringify({
    modelId: opts.modelId,
    primaryKeyField: opts.primaryKeyField ?? 'ID',
  });
  // Write-back mode only: map the prediction into the target column. Generic mode
  // (no outputField) leaves OutputMapping unset — predictions land in run history only.
  if (isNonEmpty(opts.outputField)) {
    rp.OutputMapping = JSON.stringify({
      fields: { [opts.outputField]: outputRef(opts.valueKind) },
    });
  }

  rp.ScheduleEnabled = true;
  rp.CronExpression = cron;
  rp.Timezone = opts.timezone ?? 'UTC';
  rp.OnDemandEnabled = true;
}

/** Set the `ScopeType` + corresponding scope field from the (validated, single-selector) scope. */
function applyScope(rp: MJRecordProcessEntity, scope: ScheduledScoringScope): void {
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
    // validateOptions guarantees exactly one selector — listId is the remaining case.
    rp.ScopeType = 'List';
    rp.ScopeListID = scope.listId as string;
  }
}

/** The prediction result-ref the write-back maps into the column: `$.class` for a label, else `$.score`. */
function outputRef(valueKind: ScoringValueKind | undefined): string {
  return valueKind === 'class' ? '$.class' : '$.score';
}

// ----- cadence + naming --------------------------------------------------------

/**
 * Map a {@link ScoringCadence} to its cron expression. Named cadences resolve via
 * {@link CADENCE_CRON}; an explicit `{ cron }` is passed through (trimmed). Defaults
 * to `'Monthly'` when no cadence is supplied.
 */
export function cadenceToCron(cadence: ScoringCadence | undefined): string {
  if (cadence == null) {
    return CADENCE_CRON.Monthly;
  }
  if (typeof cadence === 'object') {
    const cron = cadence.cron?.trim();
    if (!cron) {
      throw new Error('createScheduledModelScoring: an explicit cadence must supply a non-empty `cron` expression.');
    }
    return cron;
  }
  return CADENCE_CRON[cadence];
}

/**
 * A descriptive default Record Process name. The base shape never implies a column —
 * `Score <entity> with model <id> (<cadence>)` — which is exactly right for generic
 * mode (no `outputField`). In write-back mode the target column is appended so the
 * name records where the prediction lands (e.g.
 * `Score Memberships with model <id> → RenewalScore (Monthly)`).
 */
function defaultName(opts: ScheduleModelScoringOptions, cron: string): string {
  const label = typeof opts.cadence === 'object' || opts.cadence == null
    ? (opts.cadence == null ? 'Monthly' : `cron ${cron}`)
    : opts.cadence;
  const writeBack = isNonEmpty(opts.outputField) ? ` → ${opts.outputField}` : '';
  return `Score ${opts.targetEntityName} with model ${opts.modelId}${writeBack} (${label})`;
}

// ----- validation --------------------------------------------------------------

/**
 * Validate the required inputs + exactly-one-scope rule, throwing a clear error on the
 * first problem. `outputField` is NOT required — omitting it selects generic output
 * (predictions recorded in run history only; see {@link createScheduledModelScoring}).
 */
function validateOptions(opts: ScheduleModelScoringOptions): void {
  if (!isNonEmpty(opts.modelId)) {
    throw new Error('createScheduledModelScoring: `modelId` is required.');
  }
  if (!isNonEmpty(opts.targetEntityName)) {
    throw new Error('createScheduledModelScoring: `targetEntityName` is required.');
  }
  if (countScopeSelectors(opts.scope) !== 1) {
    throw new Error(
      'createScheduledModelScoring: `scope` must populate exactly one of: filter, viewId, listId, all.',
    );
  }
}

/** Count how many of the mutually-exclusive scope selectors are populated. */
function countScopeSelectors(scope: ScheduledScoringScope | undefined): number {
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

/** Resolve the target entity's id from its name, throwing when the entity is unknown. */
function resolveTargetEntityID(targetEntityName: string, provider: IMetadataProvider): string {
  const entity = provider.EntityByName(targetEntityName);
  if (!entity) {
    throw new Error(
      `createScheduledModelScoring: target entity '${targetEntityName}' was not found in metadata.`,
    );
  }
  return entity.ID;
}

/** Whether a value is a non-empty (trimmed) string. */
function isNonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
