/**
 * @module scoring/scoring-process
 *
 * **On-demand model scoring** ("Operate this model"). A one-call way to create a
 * persisted `WorkType='ML Model'` `MJ: Record Processes` row that scores a target
 * entity's records with a trained `MJ: ML Models` — WITHOUT a schedule. It is the
 * sibling of {@link module:scheduling/scheduled-model-scoring}: same assembled Record
 * Process, but an **on-demand** trigger (no cron) instead of a recurring one.
 *
 * ## Why this shape (the UI "Operate this model" flow)
 * The new UX lets a user operationalize a model in two steps that REUSE existing
 * generic machinery:
 *
 *   1. **Create** the on-demand scoring Record Process — this helper. It assembles a
 *      single `MJ: Record Processes` row (`WorkType='ML Model'`, `Status='Active'`,
 *      `OnDemandEnabled=true`, `ScheduleEnabled=false`, NO cron) with the model
 *      `Configuration` and the scope (no `OutputMapping`), plus — in both modes — a
 *      `MJ: ML Model Scoring Bindings` row (`Mode='OnDemand'`) naming the model's
 *      training pipeline and, when a write-back column is supplied, the column.
 *   2. **Run / schedule** it later via the GENERIC surfaces — the existing
 *      "Run Record Process" Remote Op for run-now, and the generic
 *      `@memberjunction/ng-scheduling` dialog for scheduling (which creates its own
 *      "Run Record Process" scheduled job). Neither needs ML-specific server code.
 *
 * So the only ML-specific server piece is creating the row in step 1 — exactly what
 * this helper does. It shares the scope model, value-kind → result-ref mapping,
 * `Configuration` serialization, scope application, validation, entity
 * resolution, and lineage-binding creation with the scheduled sibling (in
 * {@link module:scoring/scoring-process-shared}); it owns only the on-demand-trigger
 * difference (no cron, `ScheduleEnabled=false`, binding `Mode='OnDemand'`).
 *
 * The `'ML Model'` `WorkType` is a runtime-registered extension (PS2-1) that the
 * CodeGen'd `WorkType` value-list union (`'Action' | 'Agent' | 'FieldRules' |
 * 'Infer'`) cannot represent, so it is set via `rp.Set('WorkType', 'ML Model')` —
 * the same legitimate, documented exception PS2-1's scoring path uses.
 */

import { type UserInfo, type IMetadataProvider, Metadata } from '@memberjunction/core';
import type { MJRecordProcessEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import {
  ML_MODEL_WORK_TYPE,
  ApplyScope,
  ModelConfiguration,
  CreateScoringBinding,
  CountScopeSelectors,
  ResolveTargetEntityID,
  IsNonEmpty,
  type ScoringValueKind,
  type ScoringProcessScope,
} from './scoring-process-shared';

/**
 * Inputs for {@link CreateScoringProcess}. The required pair — `modelId` and
 * `targetEntityName` — plus exactly one `scope` selector is the minimum to create an
 * on-demand scoring Record Process; everything else has a sensible default (`ID`
 * primary key, numeric score, generated name).
 *
 * Two output modes, driven by whether `outputField` is supplied:
 * - **Write-back** (`outputField` present): a run writes the prediction into that
 *   target column, and the binding created for the process names that column.
 * - **Generic** (`outputField` omitted): no write-back column; the binding has no
 *   `TargetColumn`.
 *
 * Either way a `MJ: ML Model Scoring Bindings` row (`Mode='OnDemand'`) defines the
 * prediction feature.
 */
export interface CreateScoringProcessOptions {
  /** The `MJ: ML Models` id to score with. */
  modelId: string;
  /** The entity whose rows are scored (e.g. `'Memberships'`). */
  targetEntityName: string;
  /** The records a run scores. Populate EXACTLY ONE of: `filter`, `viewId`, `listId`, `all`. */
  scope: ScoringProcessScope;
  /**
   * Optional. The target-entity column to write the prediction into (e.g.
   * `'RenewalScore'`). **Omit for generic output** — a run's predictions are recorded
   * in the process run history (`MJ: Process Run Details`); no write-back column is
   * set and the scoring binding names no column.
   */
  outputField?: string;
  /** Which prediction value to write — numeric `'score'` (default) or `'class'` label. */
  valueKind?: ScoringValueKind;
  /** Primary-key field on the target entity (defaults to `'ID'`). */
  primaryKeyField?: string;
  /** The prediction's feature name on the target entity; defaults to the model's pipeline name. */
  featureName?: string;
  /** Who may see the predictions; defaults to the seeded "View Model Predictions" authorization. */
  viewAuthorizationId?: string;
  /** Optional Record Process name; a descriptive default is generated when omitted. */
  name?: string;
  /** Server-side context user (required for data isolation + audit on the saved row). */
  contextUser?: UserInfo;
  /** The provider every read and the entity creation go through (no fallback to the global provider). */
  provider: IMetadataProvider;
}

/**
 * The result of {@link CreateScoringProcess}: the saved on-demand Record Process AND —
 * its scoring binding. The Record Process is the row that the
 * generic "Run Record Process" run-now / scheduler dialog then targets; the
 * `MJ: ML Model Scoring Bindings` row defines the prediction feature, so the
 * model-prediction form panel and "Models in Production" dashboard surface it.
 */
export interface CreateScoringProcessResult {
  /** The saved on-demand `MJ: Record Processes` entity (`OnDemandEnabled=true`, no schedule). */
  recordProcess: MJRecordProcessEntity;
  /** The saved `MJ: ML Model Scoring Bindings` row (`Mode='OnDemand'`); its `TargetColumn` is null in generic mode. */
  binding: MJMLModelScoringBindingEntity;
}

/** The helper name used to prefix this module's errors + binding-failure logs. */
const HELPER_NAME = 'createScoringProcess';

/**
 * Create and save an **on-demand** Record Process that scores `targetEntity`'s rows
 * with `modelId` — no schedule. The generic "Run Record Process" run-now Remote Op
 * and the generic scheduling dialog target the returned row later. Operates in one of
 * two modes, driven by whether `opts.outputField` is supplied:
 *
 * - **Write-back** (`outputField` present): the binding names that target column, and
 *   a run copies the newest score into it (the binding's column copy, `ScoringService`).
 * - **Generic** (`outputField` omitted): the binding names no column; a run writes the
 *   scores as the binding's Feature Values only.
 *
 * In both modes this helper records a `MJ: ML Model Scoring Bindings` row
 * (`Mode='OnDemand'`) naming the model's training pipeline, the Record Process, the
 * target entity and (in write-back mode) the column; `result.binding` is the saved row.
 *
 * Unlike the scheduled sibling, this row carries `ScheduleEnabled=false` and NO cron,
 * so saving it does NOT create an owned `MJ: Scheduled Jobs` row — it stays purely
 * on-demand until a generic scheduler dialog (optionally) schedules it.
 *
 * @param opts the model + target + scope (+ optional write-back column); see
 *   {@link CreateScoringProcessOptions}
 * @returns the saved Record Process and its scoring binding; see {@link CreateScoringProcessResult}
 * @throws if a required input is missing, the scope is not exactly one selector, the
 *   target entity is unknown, the Record Process fails to save, or — after the Record
 *   Process was saved — the binding fails to save (the message carries
 *   the cause). The binding save is intentionally fail-loud (not swallowed): a saved RP
 *   without a binding would run invisibly to the lineage UX, so we surface the inconsistency.
 */
export async function CreateScoringProcess(
  opts: CreateScoringProcessOptions,
): Promise<CreateScoringProcessResult> {
  validateOptions(opts);

  const provider = opts.provider;
  const entityID = ResolveTargetEntityID(opts.targetEntityName, provider, HELPER_NAME);

  const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', opts.contextUser);
  rp.NewRecord();
  applyRecordProcessFields(rp, opts, entityID);

  if (!(await rp.Save())) {
    throw new Error(
      `${HELPER_NAME}: failed to save Record Process for model '${opts.modelId}': ` +
        `${rp.LatestResult?.CompleteMessage ?? 'unknown error'}`,
    );
  }

  const binding = await CreateScoringBinding({
    ModelID: opts.modelId,
    RecordProcessID: rp.ID,
    TargetEntityID: entityID,
    TargetColumn: IsNonEmpty(opts.outputField) ? opts.outputField : null,
    ValueKind: opts.valueKind,
    FeatureName: opts.featureName,
    ViewAuthorizationID: opts.viewAuthorizationId,
    Mode: 'OnDemand',
    Provider: provider,
    ContextUser: opts.contextUser,
    ContextLabel: HELPER_NAME,
  });
  return { recordProcess: rp, binding };
}

// ----- field population --------------------------------------------------------

/**
 * Populate the on-demand Record Process row from the (validated) options. Sets the
 * lifecycle + work-type, the scope, the model `Configuration`, and enables on-demand
 * runs — but leaves scheduling OFF (`ScheduleEnabled=false`, no cron), the one
 * difference from the scheduled sibling.
 *
 * No `OutputMapping` is set in either mode: the binding names the column, and each run
 * writes its scores as the binding's Feature Values and copies the newest into the column.
 */
function applyRecordProcessFields(
  rp: MJRecordProcessEntity,
  opts: CreateScoringProcessOptions,
  entityID: string,
): void {
  rp.Name = opts.name ?? defaultName(opts);
  rp.EntityID = entityID;
  rp.Status = 'Active';
  // 'ML Model' is the runtime-registered scoring work-type (PS2-1); the generated
  // WorkType union (`'Action' | 'Agent' | 'FieldRules' | 'Infer'`) can't represent
  // it, so Set() is the legitimate, documented exception (same as PS2-1's path).
  rp.Set('WorkType', ML_MODEL_WORK_TYPE);

  ApplyScope(rp, opts.scope);

  rp.Configuration = ModelConfiguration(opts.modelId, opts.primaryKeyField);
  // No OutputMapping in either mode: a write-back column is the binding's column copy (ScoringService), so the
  // column is written once, by the binding, never also by a Record Process write-back.

  // On-demand only: enable run-now, leave the schedule off (no cron → no owned job).
  rp.OnDemandEnabled = true;
  rp.ScheduleEnabled = false;
}

// ----- naming ------------------------------------------------------------------

/**
 * A descriptive default Record Process name. The base shape never implies a column —
 * `Score <entity> with model <id> (On Demand)` — which is exactly right for generic
 * mode (no `outputField`). In write-back mode the target column is appended so the
 * name records where the prediction lands (e.g.
 * `Score Memberships with model <id> → RenewalScore (On Demand)`).
 */
function defaultName(opts: CreateScoringProcessOptions): string {
  const writeBack = IsNonEmpty(opts.outputField) ? ` → ${opts.outputField}` : '';
  return `Score ${opts.targetEntityName} with model ${opts.modelId}${writeBack} (On Demand)`;
}

// ----- validation --------------------------------------------------------------

/**
 * Validate the required inputs + exactly-one-scope rule, throwing a clear error on the
 * first problem. `outputField` is NOT required — omitting it selects generic output
 * (predictions recorded in run history only; see {@link CreateScoringProcess}).
 */
function validateOptions(opts: CreateScoringProcessOptions): void {
  if (!IsNonEmpty(opts.modelId)) {
    throw new Error(`${HELPER_NAME}: \`modelId\` is required.`);
  }
  if (!IsNonEmpty(opts.targetEntityName)) {
    throw new Error(`${HELPER_NAME}: \`targetEntityName\` is required.`);
  }
  if (CountScopeSelectors(opts.scope) !== 1) {
    throw new Error(
      `${HELPER_NAME}: \`scope\` must populate exactly one of: filter, viewId, listId, all.`,
    );
  }
}
