/**
 * @module scoring/scoring-process-shared
 *
 * Shared primitives for the two model-scoring Record-Process builders — the
 * **scheduled** helper ({@link module:scheduling/scheduled-model-scoring}, recurring
 * cron-driven write-back) and the **on-demand** helper
 * ({@link module:scoring/scoring-process}, a single `WorkType='ML Model'` Record
 * Process the UI run-now / generic scheduler dialog then targets). Both assemble the
 * SAME kind of Record Process row + its `MJ: ML Model Scoring Bindings` row (in
 * generic mode too), differing only in trigger (schedule vs on-demand) and binding `Mode`
 * (`'Scheduled'` vs `'OnDemand'`).
 *
 * Rather than copy-paste that contract twice, the shared shape + the field-population
 * primitives live here: the scope model, the value-kind → result-ref mapping, the
 * runtime-registered work-type constant, scope application onto the row, the model
 * `Configuration` JSON, scope validation,
 * target-entity resolution, and the lineage-binding creation. The two helpers compose
 * these primitives and own only their trigger-specific bits.
 */

import { LogError, RunView, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity, MJRecordProcessEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { ScoringBindings, type ScoringBindingMode } from './scoring-binding';
import { MetadataEntityFactory } from '../training/seams';
import { ProviderTransactions } from '../registry/provider-transactions';
import type { RegistryContext } from '../registry/registry-context';

/**
 * Which prediction value the binding's column copy writes into the target column: the
 * numeric score (the adverse probability of a classification, a regression's value — the
 * default) or the predicted `class` label ({@link DefaultCopySource}).
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
export interface ScoringProcessScope {
  /** A SQL filter (`ScopeFilter`) over the target entity selecting the rows to score. */
  filter?: string;  // case-violation-ok-legacy-back-compat: the CreateScoringProcess operation's scope wire keys
  /** A `User Views` id whose rows are scored (`ScopeViewID`). */
  viewId?: string;  // case-violation-ok-legacy-back-compat: the CreateScoringProcess operation's scope wire keys
  /** A `Lists` id whose member rows are scored (`ScopeListID`). */
  listId?: string;  // case-violation-ok-legacy-back-compat: the CreateScoringProcess operation's scope wire keys
  /**
   * Score the WHOLE target entity ("score everyone"). When `true`, the run scores
   * every row — expressed as `ScopeType='Filter'` with the explicit all-rows
   * predicate `(1=1)`. Mutually exclusive with `filter` / `viewId` / `listId`.
   */
  all?: boolean;  // case-violation-ok-legacy-back-compat: the CreateScoringProcess operation's scope wire keys
}

/** The runtime-registered scoring work-type (PS2-1) — not in the CodeGen'd `WorkType` union. */
export const ML_MODEL_WORK_TYPE = 'ML Model';

/** Set the `ScopeType` + corresponding scope field from the (validated, single-selector) scope. */
export function ApplyScope(rp: MJRecordProcessEntity, scope: ScoringProcessScope): void {
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


/**
 * Serialize the model `Configuration` JSON every scoring Record Process carries: the
 * `MJ: ML Models` id to score with and the target-entity primary-key field (default
 * `'ID'`). The `'ML Model'` work-type reads this at run time to load + apply the model.
 */
export function ModelConfiguration(modelId: string, primaryKeyField: string | undefined): string {
  return JSON.stringify({ modelId, primaryKeyField: primaryKeyField ?? 'ID' });
}


/** What {@link CreateScoringBinding} needs to bind a just-saved scoring Record Process. */
export interface ScoringBindingRequest {
  /** The `MJ: ML Models` id the process scores with; the binding names its training pipeline. */
  readonly ModelID: string;
  /** The id of the just-saved scoring Record Process. */
  readonly RecordProcessID: string;
  /** The already-resolved target-entity id. */
  readonly TargetEntityID: string;
  /** The column the newest value is copied into, or null for generic output (no column). */
  readonly TargetColumn: string | null;
  /** Which prediction value the column receives (the copy source); ignored without a column. */
  readonly ValueKind: ScoringValueKind | undefined;
  /** The prediction's feature name; defaults to the model's pipeline name (the plan's default for a binding, §5.8.6). */
  readonly FeatureName: string | undefined;
  /** Who may see the predictions; defaults through {@link ScoringBindings.ResolveViewAuthorizationID}. */
  readonly ViewAuthorizationID: string | undefined;
  /** The binding mode — `'Scheduled'` or `'OnDemand'`. */
  readonly Mode: ScoringBindingMode;
  /** The provider every read and the binding save go through. */
  readonly Provider: IMetadataProvider;
  /** The request user; the provider's current user when omitted (a client provider). */
  readonly ContextUser: UserInfo | undefined;
  /** A short helper name used to prefix errors and the contextual log on failure. */
  readonly ContextLabel: string;
}

/** The model columns a binding is created from. */
type BindingModelRow = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Pipeline' | 'ProblemType'>;
/** The existing binding a creation of the same feature updates. */
type ExistingBindingRow = Pick<MJMLModelScoringBindingEntity, 'ID' | 'MLTrainingPipelineID'>;

/**
 * Create (or, for the same pipeline and feature on the same entity, update) the `MJ: ML Model Scoring Bindings` row of a
 * just-saved scoring Record Process — in generic mode too, with no column. The binding names the model's training
 * pipeline, so a newly published version of the pipeline scores it with no binding change.
 *
 * Fail-loud: a failure throws (after `LogError`) — a scoring Record Process whose binding is missing would score records
 * that no prediction feature names. Call it through {@link SaveScoringProcessWithBinding}, which saves the Record Process
 * and the binding in one transaction, so a failed binding rolls the Record Process (and its schedule) back with it.
 *
 * @throws when the model cannot be read, no view authorization is given or seeded, or the binding save fails
 */
export async function CreateScoringBinding(request: ScoringBindingRequest): Promise<MJMLModelScoringBindingEntity> {
  const label = request.ContextLabel;
  try {
    const user = request.ContextUser || request.Provider.CurrentUser;
    if (!user) throw new Error(`${label}: no user to create the scoring binding as`);
    const model = await readBindingModel(request, user);
    const featureName = IsNonEmpty(request.FeatureName) ? request.FeatureName.trim() : model.Pipeline || model.PipelineID;
    const existing = await readExistingBinding(request, featureName, user);
    return await ScoringBindings.Upsert(
      {
        bindingId: existing !== null && UUIDsEqual(existing.MLTrainingPipelineID, model.PipelineID) ? existing.ID : undefined,
        mlTrainingPipelineId: model.PipelineID,
        featureName,
        viewAuthorizationId: ScoringBindings.ResolveViewAuthorizationID(request.ViewAuthorizationID, request.Provider),
        targetEntityId: request.TargetEntityID,
        recordProcessId: request.RecordProcessID,
        targetColumn: request.TargetColumn,
        targetColumnSource: request.TargetColumn === null ? null : DefaultCopySource(model.ProblemType, request.ValueKind),
        mode: request.Mode,
      },
      new MetadataEntityFactory(request.Provider),
      user,
    );
  } catch (e) {
    LogError(
      `${label}: the scoring binding of Record Process '${request.RecordProcessID}' failed for model '${request.ModelID}'; ` +
        `the Record Process is rolled back with it: ${e instanceof Error ? e.message : String(e)}`,
    );
    throw e;
  }
}

/**
 * Saves a new scoring Record Process and creates its binding in one provider transaction: both commit, or a failure
 * of either rolls both back — including the owned `MJ: Scheduled Jobs` row a scheduled Record Process creates on save —
 * and the error is rethrown. A scoring process never exists without the binding that names its predictions.
 *
 * @param rp the populated, unsaved Record Process
 * @param binding the binding request, less the Record Process id (the saved row's id is used)
 * @throws EntityTransactionsUnsupportedError when the provider cannot open a server-side transaction (nothing is
 *   saved); an Error with the save's `CompleteMessage` when the Record Process fails to save; the binding's error
 */
export async function SaveScoringProcessWithBinding(
  rp: MJRecordProcessEntity,
  binding: Omit<ScoringBindingRequest, 'RecordProcessID'>,
): Promise<MJMLModelScoringBindingEntity> {
  const user = binding.ContextUser || binding.Provider.CurrentUser;
  if (!user) throw new Error(`${binding.ContextLabel}: no user to save the scoring process as`);
  const ctx: RegistryContext = { Provider: binding.Provider, ContextUser: user };
  return ProviderTransactions.Run(ctx, `${binding.ContextLabel} scoring process and binding`, async () => {
    if (!(await rp.Save())) {
      throw new Error(
        `${binding.ContextLabel}: failed to save Record Process for model '${binding.ModelID}': ` +
          `${rp.LatestResult?.CompleteMessage ?? 'unknown error'}`,
      );
    }
    return CreateScoringBinding({ ...binding, RecordProcessID: rp.ID });
  });
}

/**
 * The scored value a column copy receives by default: `$.Class` for a class label, else the adverse-class probability
 * of a classification and the point prediction of a regression. Pure.
 */
export function DefaultCopySource(problemType: MJMLModelEntity['ProblemType'], valueKind: ScoringValueKind | undefined): string {
  if (valueKind === 'class') return '$.Class';
  return problemType === 'classification' ? '$.AdverseProbability' : '$.Value';
}

/** The model the binding is created from (its pipeline and problem type); throws when it cannot be read. */
async function readBindingModel(request: ScoringBindingRequest, user: UserInfo): Promise<BindingModelRow> {
  const read = await RunView.FromMetadataProvider(request.Provider).RunView<BindingModelRow>({
    EntityName: 'MJ: ML Models',
    ExtraFilter: `ID='${EscapeSQLString(request.ModelID)}'`, // pk-filter-ok: MJ: ML Models is an MJ core entity keyed by ID
    Fields: ['ID', 'PipelineID', 'Pipeline', 'ProblemType'],
    ResultType: 'simple',
  }, user);
  if (!read.Success) throw new Error(`${request.ContextLabel}: reading ML Model '${request.ModelID}' failed: ${read.ErrorMessage}`);
  const model = read.Results[0];
  if (!model) throw new Error(`${request.ContextLabel}: ML Model '${request.ModelID}' was not found`);
  return model;
}

/** The binding of `featureName` on the target entity, or null when there is none. */
async function readExistingBinding(request: ScoringBindingRequest, featureName: string, user: UserInfo): Promise<ExistingBindingRow | null> {
  const read = await RunView.FromMetadataProvider(request.Provider).RunView<ExistingBindingRow>({
    EntityName: 'MJ: ML Model Scoring Bindings',
    ExtraFilter: `TargetEntityID='${EscapeSQLString(request.TargetEntityID)}' AND FeatureName='${EscapeSQLString(featureName)}'`,
    Fields: ['ID', 'MLTrainingPipelineID'],
    ResultType: 'simple',
    BypassCache: true,
  }, user);
  if (!read.Success) throw new Error(`${request.ContextLabel}: reading the scoring bindings of "${featureName}" failed: ${read.ErrorMessage}`);
  return read.Results[0] || null;
}

/**
 * Count how many of the mutually-exclusive scope selectors are populated — the basis
 * for the exactly-one-selector validation both helpers enforce.
 */
export function CountScopeSelectors(scope: ScoringProcessScope | undefined): number {
  if (!scope) {
    return 0;
  }
  let count = 0;
  if (IsNonEmpty(scope.filter)) count++;
  if (IsNonEmpty(scope.viewId)) count++;
  if (IsNonEmpty(scope.listId)) count++;
  if (scope.all === true) count++;
  return count;
}


/**
 * Resolve the target entity's id from its name, throwing when the entity is unknown.
 * `contextLabel` prefixes the error so the failing helper is identifiable.
 */
export function ResolveTargetEntityID(
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
export function IsNonEmpty(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

