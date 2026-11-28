/**
 * @module actions/score-record-set.runner
 *
 * Production implementation of the {@link IScoreRecordSetRunner} seam the Score Record Set action and operation (and
 * the query enricher) share. It resolves the request's wire scope into the scoring scope
 * of C6 (`record-ids`, `view` or `filter` over a named entity) and calls `ScoringService`: `Score` through the binding
 * when the request names one (the only path that writes), else `Predict` (writes nothing). A run that does not
 * complete throws {@link ScoringRefusedError} carrying the result, so the refusal reaches the caller whole.
 *
 * Record keys are bare: a records entry, a list member and a single record resolve to their entity's single-column key
 * value (F-L3-6), the form `MJ: Feature Values.RecordID` and the predictions carry.
 */

import { CompositeKey, RunView, type EntityInfo, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJMLTrainingPipelineEntity, PredictiveStudioScoredPrediction } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import { JsonParse, type ScoredRow, type ScoringResult, type ScoringScope } from '@memberjunction/predictive-studio-core';

import { ReadCapExceededError } from '../feature-assembly/read-cap-error';
import { PredictiveStudioRefusals } from '../operations/refusals';
import { ModelNeedsTrainingError } from '../scoring/model-readiness';
import { ModelValueRows } from '../scoring/model-value-rows';
import type { ScoringContext, ScoringPath } from '../scoring/scoring-context';
import { ScoringRefusedError } from '../scoring/scoring-refused-error';
import { ScoringRunRecorder } from '../scoring/scoring-run-recorder';
import type { ScoringServiceSeams } from '../scoring/scoring-seams';
import { ScoringService } from '../scoring/scoring-service';
import { UnitModelLineageParser } from '../training/unit-model-lineage';
import type { JsonObject } from './base-predictive-studio.action';
import type { IScoreRecordSetRunner, ScoredRecordSet, ScoreRecordSetRequest, ScoreRecordSetScope } from './score-record-set.action';

/** Options for {@link ProductionScoreRecordSetRunner}. */
export interface ProductionScoreRecordSetRunnerOptions {
  /** Replacements for the scoring service's production collaborators (tests); each one left out is the default. */
  readonly seams?: Partial<ScoringServiceSeams>;
  /** The caller's path on the scoring run row (default `'score-record-set'`). */
  readonly path?: ScoringPath;
}

/** The model columns the runner reads: its pipeline and lineage (the entity a key-only scope is read against). */
type RunnerModelRow = Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Lineage'>;

/** What the runner operation key names its input errors with. */
const OPERATION_KEY = 'PredictiveStudio.ScoreRecordSet';

/** Resolves a Score Record Set request into a scoring scope and runs it through `ScoringService`. */
export class ProductionScoreRecordSetRunner implements IScoreRecordSetRunner {
  /** @param options the service seams (tests) and the caller's path */
  constructor(private readonly options: ProductionScoreRecordSetRunnerOptions = {}) {}

  /** @inheritdoc */
  public async run(request: ScoreRecordSetRequest): Promise<ScoredRecordSet> {
    const ctx = this.buildContext(request);
    const model = await this.readModel(request.modelId, ctx);
    const binding = request.bindingId ? await this.readBinding(request.bindingId, model, ctx) : null;
    const entity = binding ? binding.TargetEntity || '' : await this.modelEntity(model, ctx);
    const scope = await this.resolveScope(request.scope, entity, ctx);
    const asOf = this.asOfOf(request, ctx);
    const service = new ScoringService(ctx);
    if (binding) {
      const result = await service.Score(binding, scope, asOf, request.dryRun === true);
      return ProductionScoreRecordSetRunner.completed(result, request.dryRun === true ? service.ScoredRows() : []);
    }
    await this.refuseOverInlineLimit(scope, request.maxInlinePredictions, ctx);
    const predicted = await service.Predict({
      ScoringRunID: '', ModelID: model.ID, Scope: scope, EntityMapping: null, AsOfDate: asOf.toISOString(),
      Read: { mode: 'complete' }, DryRun: request.dryRun === true, RequestedBy: ScoringRunRecorder.RequestedBy(ctx),
    });
    return ProductionScoreRecordSetRunner.completed(predicted.Result, predicted.Rows);
  }

  /** The prediction of one scored row, keyed by its bare record id. Pure. */
  public static Prediction(row: ScoredRow): PredictiveStudioScoredPrediction {
    return { recordId: row.recordId, inTraining: row.inTraining, ...ModelValueRows.Score(row) };
  }

  /** A completed result with its predictions; any other result throws {@link ScoringRefusedError}. */
  private static completed(result: ScoringResult, rows: readonly ScoredRow[]): ScoredRecordSet {
    if (result.Status !== 'completed') throw new ScoringRefusedError(result);
    return { Result: result, Predictions: rows.map((r) => ProductionScoreRecordSetRunner.Prediction(r)) };
  }

  // ----- request ---------------------------------------------------------------

  /** The scoring context of the request's user and provider. */
  protected buildContext(request: ScoreRecordSetRequest): ScoringContext {
    if (!request.contextUser) {
      throw new Error('Score Record Set: a ContextUser is required to score records (server-side data access is user-scoped).');
    }
    if (!request.provider) {
      throw new Error('Score Record Set: a provider is required to score records (every read and write goes through it).');
    }
    return {
      ContextUser: request.contextUser, Provider: request.provider, Path: this.options.path || 'score-record-set',
      OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null, Seams: this.options.seams,
    };
  }

  /** The as-of date: the request's (validated), else the run date of the service's clock. */
  private asOfOf(request: ScoreRecordSetRequest, ctx: ScoringContext): Date {
    if (!request.asOfDate) return ctx.Seams?.Clock ? ctx.Seams.Clock.Now() : new Date();
    const asOf = new Date(request.asOfDate);
    if (Number.isNaN(asOf.getTime())) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'asOfDate', `'${request.asOfDate}' is not a date`);
    return asOf;
  }

  /** The model row; a model that does not exist needs training (the typed error the readers report). */
  private async readModel(modelId: string, ctx: ScoringContext): Promise<RunnerModelRow> {
    if (!IsValidUUID(modelId)) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'modelId', `'${modelId}' is not a UUID`);
    const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<RunnerModelRow>({
      EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'PipelineID', 'Lineage'], ResultType: 'simple', MaxRows: 1, BypassCache: true, // pk-filter-ok: MJ: ML Models is an MJ core entity keyed by ID
    }, ctx.ContextUser);
    if (!read.Success) throw new Error(`Score Record Set: reading ML Model '${modelId}' failed: ${read.ErrorMessage}`);
    const model = read.Results[0];
    if (!model) throw new ModelNeedsTrainingError(`Score Record Set: ML Model '${modelId}' not found`);
    return model;
  }

  /** The binding, which must name the model's pipeline. */
  private async readBinding(bindingId: string, model: RunnerModelRow, ctx: ScoringContext): Promise<MJMLModelScoringBindingEntity> {
    if (!IsValidUUID(bindingId)) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'bindingId', `'${bindingId}' is not a UUID`);
    const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJMLModelScoringBindingEntity>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `ID='${EscapeSQLString(bindingId)}'`, ResultType: 'entity_object', MaxRows: 1, BypassCache: true, // pk-filter-ok: MJ core entity keyed by ID
    }, ctx.ContextUser);
    if (!read.Success) throw new Error(`Score Record Set: reading scoring binding '${bindingId}' failed: ${read.ErrorMessage}`);
    const binding = read.Results[0];
    if (!binding) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'bindingId', `names no scoring binding ('${bindingId}')`);
    if (!UUIDsEqual(binding.MLTrainingPipelineID, model.PipelineID)) {
      throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'modelId', `'${model.ID}' is not a model of binding '${binding.ID}''s pipeline '${binding.MLTrainingPipelineID}'`);
    }
    await this.refuseModelBindingDoesNotServe(binding, model, ctx);
    return binding;
  }

  /**
   * A binding scores with its pipeline's serving model, not with a version the caller names (§5.8.3, D-058), so a
   * `modelId` that is not that model is refused `INVALID_INPUT` naming the serving model, before any run row: a
   * generated "Score with <model> vN" Action of a superseded version, or a caller naming an older version, never has its
   * call answered by another version (review R5 question 2, D4-286). The serving model is read by `ScoringService`'s rule
   * (`ResolvePublishedModel`): the pipeline's newest Published model, else its newest model kept serving while
   * Unevaluated. With neither, nothing is refused here: `Score` refuses the run `no-published-model` with its run row.
   */
  private async refuseModelBindingDoesNotServe(binding: MJMLModelScoringBindingEntity, model: RunnerModelRow, ctx: ScoringContext): Promise<void> {
    const pipeline = EscapeSQLString(binding.MLTrainingPipelineID);
    const serving = (await this.newestModel(`PipelineID='${pipeline}' AND Status='Published'`, ctx))
      || (await this.newestModel(`PipelineID='${pipeline}' AND Status='Unevaluated' AND ServingWhileUnevaluated=1`, ctx));
    if (serving === null || UUIDsEqual(serving.ID, model.ID)) return;
    throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'modelId',
      `'${model.ID}' is not the model binding '${binding.ID}' scores with: its pipeline serves ML Model '${serving.ID}' v${serving.Version}; name that model, or score without the binding to predict with '${model.ID}'`);
  }

  /** The newest-version model matching `filter`, read past the cache; null when there is none. */
  private async newestModel(filter: string, ctx: ScoringContext): Promise<Pick<MJMLModelEntity, 'ID' | 'Version'> | null> {
    const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLModelEntity, 'ID' | 'Version'>>({
      EntityName: 'MJ: ML Models', ExtraFilter: filter, Fields: ['ID', 'Version'], OrderBy: 'Version DESC', ResultType: 'simple', MaxRows: 1, BypassCache: true,
    }, ctx.ContextUser);
    if (!read.Success) throw new Error(`Score Record Set: reading the serving ML Model failed: ${read.ErrorMessage}`);
    return read.Results[0] || null;
  }

  /**
   * The entity a key-only scope of the model is read against: its Prediction Unit's row entity (unit lineage), else the
   * lineage's target entity, else its pipeline's target entity.
   */
  private async modelEntity(model: RunnerModelRow, ctx: ScoringContext): Promise<string> {
    if (UnitModelLineageParser.NamesUnit(model.Lineage)) {
      const lineage = UnitModelLineageParser.ParseUnitModelLineage(model.Lineage);
      if (lineage.Ok) return lineage.Value.unitRowEntity;
    }
    const parsed = JsonParse.ParseJsonText(model.Lineage, 'Lineage');
    const named = parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? JsonParse.JsonString(parsed.Value, 'targetEntityName') : null;
    if (named) return named;
    return this.pipelineEntity(model, ctx);
  }

  /** The model's pipeline's target entity; throws when it names none. */
  private async pipelineEntity(model: RunnerModelRow, ctx: ScoringContext): Promise<string> {
    const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLTrainingPipelineEntity, 'ID' | 'TargetEntity'>>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(model.PipelineID)}'`, Fields: ['ID', 'TargetEntity'], ResultType: 'simple', MaxRows: 1, // pk-filter-ok: MJ core entity keyed by ID
    }, ctx.ContextUser);
    if (!read.Success) throw new Error(`Score Record Set: reading ML Training Pipeline '${model.PipelineID}' failed: ${read.ErrorMessage}`);
    const entity = read.Results[0]?.TargetEntity;
    if (!entity) throw new Error(`Score Record Set: model '${model.ID}' names no entity to read a records scope against`);
    return entity;
  }

  // ----- scope -----------------------------------------------------------------

  /** The scoring scope of the wire scope; `entity` is the entity a records scope is read against. */
  protected async resolveScope(scope: ScoreRecordSetScope, entity: string, ctx: ScoringContext): Promise<ScoringScope> {
    if (Array.isArray(scope.records) && scope.records.length > 0) {
      const info = this.entityInfo(entity, ctx.Provider);
      return { kind: 'record-ids', entity: info.Name, ids: scope.records.map((r) => this.bareKey(info, r)) };
    }
    if (scope.single) {
      const info = this.entityInfo(scope.single.entityName, ctx.Provider);
      return { kind: 'record-ids', entity: info.Name, ids: [this.singleKey(info, scope.single.primaryKey)] };
    }
    if (scope.filter) return this.filterScope(scope.filter, ctx);
    if (scope.viewId) return this.viewScope(scope.viewId, ctx);
    if (scope.listId) return this.listScope(scope.listId, ctx);
    throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope', 'must populate exactly one of: records, viewId, listId, filter, single');
  }

  /**
   * Refuses a predict-only scope with more records than `limit` before anything is scored or recorded
   * ({@link ReadCapExceededError.ForInlinePredictions}); no limit, no check. A records scope is counted as given; a
   * filter or view scope by reading at most `limit + 1` of its keys as the caller.
   */
  private async refuseOverInlineLimit(scope: ScoringScope, limit: number | undefined, ctx: ScoringContext): Promise<void> {
    if (limit === undefined) return;
    const matched = scope.kind === 'record-ids' ? scope.ids.length : await this.countUpTo(scope, limit + 1, ctx);
    if (matched > limit) throw ReadCapExceededError.ForInlinePredictions(scope.entity, limit, matched);
  }

  /** How many keys a filter or view scope matches, reading at most `cap` of them as the caller. */
  private async countUpTo(scope: Exclude<ScoringScope, { kind: 'record-ids' }>, cap: number, ctx: ScoringContext): Promise<number> {
    const info = this.entityInfo(scope.entity, ctx.Provider);
    const key = info.FirstPrimaryKey.Name; // first-pk-ok: a count read of the scope's keys only
    const params: RunViewParams = scope.kind === 'filter'
      ? { EntityName: info.Name, ExtraFilter: scope.extraFilter, Fields: [key], MaxRows: cap, ResultType: 'simple', BypassCache: true }
      : { ViewID: scope.userViewId, Fields: [key], MaxRows: cap, ResultType: 'simple', BypassCache: true };
    const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<Record<string, string>>(params, ctx.ContextUser);
    if (!read.Success) throw new Error(`Score Record Set: counting the scope of ${info.Name} failed: ${read.ErrorMessage}`);
    return read.Results.length;
  }

  /** A filter scope; a positive `maxRows` refuses a scope with more rows than it (D2-C1), read past the entity's row cap. */
  private async filterScope(filter: NonNullable<ScoreRecordSetScope['filter']>, ctx: ScoringContext): Promise<ScoringScope> {
    const info = this.entityInfo(filter.entityName, ctx.Provider);
    const extraFilter = filter.extraFilter && filter.extraFilter.trim().length > 0 ? filter.extraFilter : '(1=1)';
    const cap = typeof filter.maxRows === 'number' && filter.maxRows > 0 ? filter.maxRows : null;
    if (cap !== null) {
      const key = info.FirstPrimaryKey.Name; // first-pk-ok: a count read of the scope's keys only
      const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<Record<string, string>>(
        { EntityName: info.Name, ExtraFilter: extraFilter, Fields: [key], MaxRows: cap + 1, ResultType: 'simple', BypassCache: true }, ctx.ContextUser);
      if (!read.Success) throw new Error(`Score Record Set: reading the scope of ${info.Name} failed: ${read.ErrorMessage}`);
      if (read.Results.length > cap) throw ReadCapExceededError.ForScoring(info.Name, cap, cap, Math.max(read.TotalRowCount || 0, read.Results.length));
    }
    return { kind: 'filter', entity: info.Name, extraFilter };
  }

  /** A saved view's scope over the view's entity. */
  private async viewScope(viewId: string, ctx: ScoringContext): Promise<ScoringScope> {
    if (!IsValidUUID(viewId)) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope.viewId', `'${viewId}' is not a UUID`);
    const read = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ EntityID: string }>(
      { EntityName: 'MJ: User Views', ExtraFilter: `ID='${EscapeSQLString(viewId)}'`, Fields: ['EntityID'], ResultType: 'simple', MaxRows: 1 }, ctx.ContextUser); // pk-filter-ok: MJ core entity keyed by ID
    if (!read.Success) throw new Error(`Score Record Set: reading view '${viewId}' failed: ${read.ErrorMessage}`);
    const entity = read.Results[0] ? ctx.Provider.EntityByID(read.Results[0].EntityID) : undefined;
    if (!entity) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope.viewId', `names no view of a known entity ('${viewId}')`);
    return { kind: 'view', entity: entity.Name, userViewId: viewId };
  }

  /** A list's members as a record-ids scope over the list's entity (members store compact key segments). */
  private async listScope(listId: string, ctx: ScoringContext): Promise<ScoringScope> {
    if (!IsValidUUID(listId)) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope.listId', `'${listId}' is not a UUID`);
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const list = await rv.RunView<{ EntityID: string }>(
      { EntityName: 'MJ: Lists', ExtraFilter: `ID='${EscapeSQLString(listId)}'`, Fields: ['EntityID'], ResultType: 'simple', MaxRows: 1 }, ctx.ContextUser); // pk-filter-ok: MJ core entity keyed by ID
    if (!list.Success) throw new Error(`Score Record Set: failed to load list '${listId}': ${list.ErrorMessage}`);
    const entity = list.Results[0] ? ctx.Provider.EntityByID(list.Results[0].EntityID) : undefined;
    if (!entity) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope.listId', `names no list of a known entity ('${listId}')`);
    const members = await rv.RunView<{ RecordID: string }>(
      { EntityName: 'MJ: List Details', ExtraFilter: `ListID='${EscapeSQLString(listId)}'`, Fields: ['RecordID'], OrderBy: 'ID', IgnoreMaxRows: true, ResultType: 'simple' }, ctx.ContextUser);
    if (!members.Success) throw new Error(`Score Record Set: failed to load members for list '${listId}': ${members.ErrorMessage}`);
    const ids = members.Results.map((m) => String(m.RecordID)).filter((id) => id.length > 0).map((id) => this.bareKey(entity, id));
    return { kind: 'record-ids', entity: entity.Name, ids };
  }

  /** The bare key value of a records entry: a bare value or a `Field|value` segment, or a primary-key object. */
  private bareKey(entity: EntityInfo, entry: string | JsonObject): string {
    if (typeof entry !== 'string') return this.singleKey(entity, entry);
    const pairs = CompositeKey.FromURLSegment(entity, entry.trim()).KeyValuePairs;
    if (pairs.length !== 1) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope.records', `'${entry}' is not one key of ${entity.Name}`);
    return String(pairs[0].Value).trim();
  }

  /** The key value of a primary-key object; every key must be the entity's single primary key. */
  private singleKey(entity: EntityInfo, primaryKey: JsonObject): string {
    if (entity.PrimaryKeys.length !== 1) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope', `${entity.Name} has a composite key; scoring keys records by a single-column key`);
    const key = entity.FirstPrimaryKey.Name; // first-pk-ok: guarded by PrimaryKeys.length === 1 above
    const entries = Object.entries(primaryKey);
    const unknown = entries.filter(([k]) => k.trim().toLowerCase() !== key.toLowerCase()).map(([k]) => k);
    const value = entries.find(([k]) => k.trim().toLowerCase() === key.toLowerCase())?.[1];
    if (unknown.length > 0 || value === undefined || value === null || String(value).trim() === '') {
      throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope', `names ${unknown.length > 0 ? `'${unknown.join(', ')}', not the primary key` : 'no value for the primary key'} '${key}' of ${entity.Name}`);
    }
    return String(value).trim();
  }

  /** The provider's entity of that name, or an invalid-input refusal. */
  private entityInfo(name: string, provider: IMetadataProvider): EntityInfo {
    const entity = provider.EntityByName(name);
    if (!entity) throw PredictiveStudioRefusals.InvalidInput(OPERATION_KEY, 'scope', `names entity '${name}', which is not in the metadata`);
    return entity;
  }
}
