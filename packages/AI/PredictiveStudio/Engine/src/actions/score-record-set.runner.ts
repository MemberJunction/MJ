/**
 * @module actions/score-record-set.runner
 *
 * Production implementation of the {@link IScoreRecordSetRunner} seam used by the
 * {@link PredictiveStudioScoreRecordSetAction}. It is the only place in the Score
 * action path that touches MJ's live data plumbing: it resolves the requested
 * {@link ScoringScope} into a concrete set of {@link RecordRef}s (via `RunView`),
 * constructs the scoring work type {@link MLModelInferenceProcessor} with the
 * production seams, and drives its batch path.
 *
 * Keeping this OUT of the action keeps the action thin (validate → delegate → map)
 * and keeps this resolver independently testable. The artifact-loader seam is
 * deliberately injected from a higher layer (the Engine package does not import
 * MJStorage drivers — see `scoring/seams.ts`); when it is not supplied the runner
 * fails with a clear, actionable message rather than silently mis-scoring.
 */

import {
  RunView,
  type UserInfo,
  type IMetadataProvider,
  Metadata,
} from '@memberjunction/core';
import type { BaseEntity } from '@memberjunction/core';
import type { RecordRef, RecordProcessorContext, RecordResult } from '@memberjunction/record-set-processor-base';

import { MLModelInferenceProcessor } from '../scoring/ml-model-inference-processor';
import { RunViewMLModelLoader, MJSidecarPredictor } from '../scoring/seams';
import type { MLInferenceDeps, IArtifactLoader } from '../scoring/types';
import type { MLInferenceResultPayload } from '../scoring/ml-model-inference-processor';
import type {
  IScoreRecordSetRunner,
  ScoreRecordSetRequest,
  ScoreRecordSetResult,
  ScoringScope,
  EphemeralPrediction,
} from './score-record-set.action';
import type { JsonObject } from './base-predictive-studio.action';

/** Options for {@link ProductionScoreRecordSetRunner}. */
export interface ProductionScoreRecordSetRunnerOptions {
  /**
   * The scoring dependency bundle (model loader / artifact loader / sidecar). When
   * omitted, production model-loader + sidecar are built, but the artifact loader
   * MUST be supplied by the higher layer that owns the MJStorage binding.
   */
  deps?: MLInferenceDeps;
  /** Primary-key field on scored entities (defaults to `ID`). */
  primaryKeyField?: string;
}

/**
 * Resolves a {@link ScoringScope} into records and drives the
 * {@link MLModelInferenceProcessor} batch path.
 */
export class ProductionScoreRecordSetRunner implements IScoreRecordSetRunner {
  private readonly options: ProductionScoreRecordSetRunnerOptions;

  constructor(options: ProductionScoreRecordSetRunnerOptions = {}) {
    this.options = options;
  }

  /** @inheritdoc */
  public async run(request: ScoreRecordSetRequest): Promise<ScoreRecordSetResult> {
    const records = await this.resolveScope(request.scope, request.contextUser, request.provider);
    const processor = new MLModelInferenceProcessor({
      modelId: request.modelId,
      deps: this.resolveDeps(),
      primaryKeyField: this.options.primaryKeyField,
    });

    const context = this.buildContext(request);
    const results = await processor.ProcessBatch(records, context);

    return this.summarize(records, results, request);
  }

  // ----- scope resolution ------------------------------------------------------

  /** Resolve the scope into a set of record refs. Exactly one selector is honored. */
  protected async resolveScope(
    scope: ScoringScope,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RecordRef[]> {
    if (Array.isArray(scope.records) && scope.records.length > 0) {
      return scope.records.map((r) => this.toRecordRef(r));
    }
    if (scope.single) {
      return this.resolveFilter(
        scope.single.entityName,
        this.primaryKeyFilter(scope.single.entityName, scope.single.primaryKey, provider),
        1,
        contextUser,
        provider,
      );
    }
    if (scope.filter) {
      return this.resolveFilter(
        scope.filter.entityName,
        scope.filter.extraFilter,
        scope.filter.maxRows,
        contextUser,
        provider,
      );
    }
    if (scope.viewId) {
      return this.resolveView({ ViewID: scope.viewId }, contextUser, provider);
    }
    if (scope.listId) {
      return this.resolveList(scope.listId, contextUser, provider);
    }
    return [];
  }

  /**
   * Resolve a `MJ: Lists` id into its member records as entity objects. Mirrors
   * the substrate's `ListSource` membership contract — a List's members live in
   * `MJ: List Details` (which store a composite-key-safe `RecordID`), NOT in a
   * backing User View. We (1) read the list's target `EntityID`/name, (2) read its
   * member `RecordID`s from `MJ: List Details`, then (3) load those target rows as
   * `entity_object`s so the inference processor gets the same preloaded-row shape
   * as the other scopes.
   */
  protected async resolveList(
    listId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RecordRef[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();

    const listResult = await rv.RunView<{ EntityID: string }>(
      { EntityName: 'MJ: Lists', ExtraFilter: `ID='${listId}'`, Fields: ['EntityID'], ResultType: 'simple', MaxRows: 1 },
      contextUser,
    );
    if (!listResult.Success) {
      throw new Error(`Score Record Set: failed to load list '${listId}': ${listResult.ErrorMessage}`);
    }
    const entityId = listResult.Results[0]?.EntityID;
    if (!entityId) {
      throw new Error(`Score Record Set: list '${listId}' not found.`);
    }
    const entityName = (provider ?? Metadata.Provider)?.Entities.find((e) => e.ID === entityId)?.Name;
    if (!entityName) {
      throw new Error(`Score Record Set: list '${listId}' targets an unknown entity (id '${entityId}').`);
    }

    const memberResult = await rv.RunView<{ RecordID: string }>(
      { EntityName: 'MJ: List Details', ExtraFilter: `ListID='${listId}'`, Fields: ['RecordID'], OrderBy: 'ID', ResultType: 'simple' },
      contextUser,
    );
    if (!memberResult.Success) {
      throw new Error(`Score Record Set: failed to load members for list '${listId}': ${memberResult.ErrorMessage}`);
    }
    const recordIds = memberResult.Results.map((r) => String(r.RecordID)).filter((id) => id.length > 0);
    if (recordIds.length === 0) {
      return [];
    }

    // Load the member rows of the target entity as entity objects, keyed by their
    // single-column PK (List Details store the PK string in RecordID).
    const pkName = (provider ?? Metadata.Provider)?.EntityByName(entityName)?.FirstPrimaryKey?.Name ?? 'ID';
    const inList = recordIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
    return this.resolveFilter(entityName, `${pkName} IN (${inList})`, undefined, contextUser, provider);
  }

  /** Resolve an entity + filter into entity-object record refs. */
  protected async resolveFilter(
    entityName: string,
    extraFilter: string | undefined,
    maxRows: number | undefined,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RecordRef[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<BaseEntity>(
      {
        EntityName: entityName,
        ExtraFilter: extraFilter,
        MaxRows: maxRows,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    if (!result.Success) {
      throw new Error(`Score Record Set: failed to resolve scope for '${entityName}': ${result.ErrorMessage}`);
    }
    const entityId = this.resolveEntityId(entityName, provider);
    return result.Results.map((row) => this.entityToRecordRef(row, entityId));
  }

  /** Resolve a saved-view id into entity-object record refs. */
  protected async resolveView(
    params: { ViewID: string },
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<RecordRef[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<BaseEntity>(
      { ViewID: params.ViewID, ResultType: 'entity_object' },
      contextUser,
    );
    if (!result.Success) {
      throw new Error(`Score Record Set: failed to resolve view '${params.ViewID}': ${result.ErrorMessage}`);
    }
    return result.Results.map((row) => this.entityToRecordRef(row));
  }

  // ----- helpers ---------------------------------------------------------------

  /**
   * Build the per-record execution context for the processor. A `contextUser` is
   * required (server-side scoring is user-scoped); the Action validates it before
   * delegating, but we also assert here so this runner can't be driven without one
   * (no silent force-cast of an absent user).
   */
  protected buildContext(request: ScoreRecordSetRequest): RecordProcessorContext {
    if (!request.contextUser) {
      throw new Error('Score Record Set: a ContextUser is required to score records (server-side data access is user-scoped).');
    }
    const provider: IMetadataProvider = request.provider ?? Metadata.Provider;
    return {
      contextUser: request.contextUser,
      provider,
    };
  }

  /** Resolve the deps bundle, building production model-loader + sidecar when absent. */
  protected resolveDeps(): MLInferenceDeps {
    if (this.options.deps) {
      return this.options.deps;
    }
    return {
      modelLoader: new RunViewMLModelLoader(),
      sidecar: new MJSidecarPredictor(),
      artifactLoader: this.missingArtifactLoader(),
    };
  }

  /**
   * A placeholder {@link IArtifactLoader} that fails loudly. The Engine package
   * does not import MJStorage drivers, so the real artifact loader is supplied by
   * the layer that owns the storage binding (see `scoring/seams.ts`). Callers that
   * run this action in production wire `deps` (with a real artifact loader) into
   * the runner; tests inject the whole runner.
   */
  protected missingArtifactLoader(): IArtifactLoader {
    return {
      async load(): Promise<Uint8Array | null> {
        throw new Error(
          'Score Record Set: no artifact loader is configured. Supply MLInferenceDeps with a production ' +
            'IArtifactLoader (the MJStorage binding) when constructing ProductionScoreRecordSetRunner.',
        );
      },
    };
  }

  /** Convert a scope `records` entry (id string or pk object) into a record ref. */
  protected toRecordRef(entry: string | JsonObject): RecordRef {
    if (typeof entry === 'string') {
      return { EntityID: '', RecordID: entry };
    }
    const id = this.firstStringValue(entry);
    return { EntityID: '', RecordID: id, Record: entry };
  }

  /** Convert a loaded entity object into a record ref carrying the preloaded row. */
  protected entityToRecordRef(row: BaseEntity, entityId?: string): RecordRef {
    return {
      EntityID: entityId ?? row.EntityInfo?.ID ?? '',
      RecordID: row.PrimaryKey.ToString(),
      Record: row,
    };
  }

  /**
   * Build a `Field='value'`-style filter from a primary-key object. Each KEY is
   * validated against the entity's real fields BEFORE interpolation — an unknown
   * field name is rejected (SQL-injection defense for the untrusted key names,
   * mirroring how the write-entity-fields action validates field names). Values
   * are still single-quote-escaped.
   */
  protected primaryKeyFilter(entityName: string, primaryKey: JsonObject, provider?: IMetadataProvider): string {
    const entity = (provider ?? Metadata.Provider)?.EntityByName(entityName);
    if (!entity) {
      throw new Error(`Score Record Set: entity '${entityName}' not found in metadata; cannot resolve a single-record scope.`);
    }
    const entries = Object.entries(primaryKey);
    if (entries.length === 0) {
      throw new Error(`Score Record Set: single-record scope for '${entityName}' supplied no primary-key fields.`);
    }
    return entries
      .map(([k, v]) => {
        const field = entity.Fields.find((f) => f.Name.trim().toLowerCase() === k.trim().toLowerCase());
        if (!field) {
          throw new Error(`Score Record Set: '${k}' is not a field on entity '${entityName}'; refusing to build a filter from an unknown key.`);
        }
        return `${field.Name}='${String(v).replace(/'/g, "''")}'`;
      })
      .join(' AND ');
  }

  /** Resolve an entity id from its name (best-effort; empty when unavailable). */
  protected resolveEntityId(entityName: string, provider?: IMetadataProvider): string {
    const md = provider ?? Metadata.Provider;
    return md?.EntityByName(entityName)?.ID ?? '';
  }

  /** First string-able value of an object (used to key a record ref from a pk map). */
  protected firstStringValue(obj: JsonObject): string {
    for (const v of Object.values(obj)) {
      if (v != null) {
        return String(v);
      }
    }
    return '';
  }

  // ----- result summarization --------------------------------------------------

  /**
   * Fold per-record results into the run summary (counts + predictions /
   * write-back). The `MLModelInferenceProcessor.ProcessBatch` contract returns
   * results 1:1 with the input `records` in the SAME order, so we pair each
   * result with its record by walking both together and key each prediction off
   * the PAIRED record's `RecordID` (record-correlated, not a bare positional
   * lookup that would silently misalign if the lengths ever diverged). All three
   * outcome buckets — Succeeded / Failed / Skipped — are tallied.
   */
  protected summarize(
    records: RecordRef[],
    results: RecordResult[],
    request: ScoreRecordSetRequest,
  ): ScoreRecordSetResult {
    let scoredCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const predictions: EphemeralPrediction[] = [];

    const pairCount = Math.min(records.length, results.length);
    for (let i = 0; i < pairCount; i++) {
      const record = records[i];
      const result = results[i];
      if (result.Status === 'Succeeded') {
        scoredCount++;
        const payload = result.ResultPayload as MLInferenceResultPayload | undefined;
        if (payload) {
          predictions.push({ recordId: record.RecordID, score: payload.score, class: payload.class });
        }
      } else if (result.Status === 'Failed') {
        failedCount++;
      } else if (result.Status === 'Skipped') {
        skippedCount++;
      }
    }

    const wroteBack = Boolean(request.writeBack);
    return {
      scoredCount,
      failedCount,
      skippedCount,
      wroteBack,
      // Predictions are ephemeral — only surfaced when NOT writing back.
      predictions: wroteBack ? undefined : predictions,
    };
  }
}
