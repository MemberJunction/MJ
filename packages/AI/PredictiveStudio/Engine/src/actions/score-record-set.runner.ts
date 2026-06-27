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
        this.primaryKeyFilter(scope.single.primaryKey),
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
      // A List is resolved by its backing view's id contract; the substrate's
      // ListSource owns full list semantics. Here we resolve via RunView's ViewID
      // path using the list's entity rows — the thin Action path scores the
      // materialized rows the view returns.
      return this.resolveView({ ViewID: scope.listId }, contextUser, provider);
    }
    return [];
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

  /** Build the per-record execution context for the processor. */
  protected buildContext(request: ScoreRecordSetRequest): RecordProcessorContext {
    const provider = request.provider ?? Metadata.Provider;
    return {
      contextUser: request.contextUser as UserInfo,
      provider: provider as IMetadataProvider,
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

  /** Build a `Field='value'`-style filter from a primary-key object. */
  protected primaryKeyFilter(primaryKey: JsonObject): string {
    return Object.entries(primaryKey)
      .map(([k, v]) => `${k}='${String(v).replace(/'/g, "''")}'`)
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

  /** Fold per-record results into the run summary (counts + predictions / write-back). */
  protected summarize(
    records: RecordRef[],
    results: RecordResult[],
    request: ScoreRecordSetRequest,
  ): ScoreRecordSetResult {
    let scoredCount = 0;
    let failedCount = 0;
    const predictions: EphemeralPrediction[] = [];

    results.forEach((result, i) => {
      if (result.Status === 'Succeeded') {
        scoredCount++;
        const payload = result.ResultPayload as MLInferenceResultPayload | undefined;
        if (payload) {
          predictions.push({ recordId: records[i]?.RecordID, score: payload.score, class: payload.class });
        }
      } else if (result.Status === 'Failed') {
        failedCount++;
      }
    });

    const wroteBack = Boolean(request.writeBack);
    return {
      scoredCount,
      failedCount,
      wroteBack,
      // Predictions are ephemeral — only surfaced when NOT writing back.
      predictions: wroteBack ? undefined : predictions,
    };
  }
}
