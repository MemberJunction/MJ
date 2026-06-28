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
  CompositeKey,
  LogError,
  type UserInfo,
  type IMetadataProvider,
  type EntityInfo,
  Metadata,
} from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { resolveMappingRef } from '@memberjunction/global';
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
  WriteBackDirective,
} from './score-record-set.action';
import type { JsonObject } from './base-predictive-studio.action';

/**
 * The declarative write-back shape this runner applies — IDENTICAL in meaning to
 * the Record Set Processing substrate's `OutputMappingConfig`
 * (`@memberjunction/record-set-processor`). Keys are **entity field names** on the
 * scored record; values are **result references** resolved against the prediction
 * payload via the shared {@link resolveMappingRef} resolver, where `$` is the
 * payload root. So `{ "PredictedClass": "$.class", "ChurnProbability": "$.score" }`
 * writes the prediction's `class` into `PredictedClass` and its `score` into
 * `ChurnProbability`. Matching the substrate exactly keeps one mental model for
 * write-back across the Action / Agent / Infer / ML-Model work types.
 *
 * Only the field-update form is honored here (the `MLInferenceResultPayload` is a
 * flat score/class — there is no child-record fan-out to map). The substrate's
 * optional `childRecord` shape is intentionally not part of the scoring path.
 */
interface ScoringOutputMapping {
  /** Map of `EntityFieldName -> resultRef` (e.g. `{ "Score": "$.score" }`). */
  fields?: Record<string, string>;
}

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

    // When an explicit OutputMapping was supplied (and this is not a dry run),
    // persist each succeeded record's prediction into the mapped entity field(s).
    // Records whose Save fails are reclassified Succeeded -> Failed in the summary.
    const writeBack = await this.applyWriteBack(records, results, request, context);

    return this.summarize(records, results, request, writeBack);
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

  // ----- write-back ------------------------------------------------------------

  /**
   * Persist predictions back onto the scored records per the request's write-back
   * `OutputMapping`, returning a {@link WriteBackOutcome} the summary folds in.
   *
   * No-ops (and reports `wroteBack: false`) when:
   * - write-back is not requested, or is the boolean form (no explicit mapping — a
   *   default-mapping write-back is owned by the higher Record Process layer, not
   *   this runner), or
   * - `request.dryRun` is `true` (compute-only — predictions are surfaced but never
   *   persisted, matching `ProcessRun.DryRun` in the substrate).
   *
   * Otherwise, for each **Succeeded** record (paired 1:1 with `records` in order),
   * it resolves the target {@link BaseEntity}, validates + applies the mapped
   * fields, and `Save()`s. A record whose Save fails is recorded in
   * `failedIndexes` so {@link summarize} can move it from scored -> failed.
   */
  protected async applyWriteBack(
    records: RecordRef[],
    results: RecordResult[],
    request: ScoreRecordSetRequest,
    context: RecordProcessorContext,
  ): Promise<WriteBackOutcome> {
    const mapping = this.resolveOutputMapping(request.writeBack);
    if (!mapping || request.dryRun) {
      return { wroteBack: false, failedIndexes: new Set<number>() };
    }

    const failedIndexes = new Set<number>();
    let anyWritten = false;
    const pairCount = Math.min(records.length, results.length);
    for (let i = 0; i < pairCount; i++) {
      const result = results[i];
      if (result.Status !== 'Succeeded') {
        continue; // only persist predictions for records that actually scored
      }
      const payload = result.ResultPayload as MLInferenceResultPayload | undefined;
      const ok = await this.writeBackRecord(records[i], payload, mapping, context);
      if (ok) {
        anyWritten = true;
      } else {
        failedIndexes.add(i);
      }
    }

    return { wroteBack: anyWritten, failedIndexes };
  }

  /**
   * Resolve the explicit field-mapping out of the write-back directive. Returns
   * `undefined` for the boolean form or a malformed/empty mapping (treated as
   * "no write-back to apply here").
   */
  protected resolveOutputMapping(directive: WriteBackDirective | undefined): ScoringOutputMapping | undefined {
    if (!directive || directive === true) {
      return undefined;
    }
    const raw = directive.OutputMapping as { fields?: unknown };
    const fields = raw?.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return undefined;
    }
    const normalized: Record<string, string> = {};
    for (const [field, ref] of Object.entries(fields as Record<string, unknown>)) {
      if (typeof ref === 'string') {
        normalized[field] = ref;
      }
    }
    return Object.keys(normalized).length > 0 ? { fields: normalized } : undefined;
  }

  /**
   * Apply the mapping to ONE record's prediction and Save it. Resolves the target
   * `BaseEntity` (reusing the preloaded `.Record` when present, else loading by id
   * via the provider), validates every mapped field name against the entity's real
   * fields (rejecting unknown names — mirroring the PK-name validation in
   * {@link primaryKeyFilter}), sets the resolved values via the config-driven
   * `Set` accessor, and Saves. Returns `true` on a successful Save, `false` on any
   * failure (logged) so the caller can reclassify the record as failed.
   */
  protected async writeBackRecord(
    record: RecordRef,
    payload: MLInferenceResultPayload | undefined,
    mapping: ScoringOutputMapping,
    context: RecordProcessorContext,
  ): Promise<boolean> {
    try {
      const entity = await this.resolveTargetEntity(record, context);
      this.assertMappedFieldsExist(entity.EntityInfo, mapping);
      // `$` is the prediction payload root; `record` exposes the source row — the
      // SAME source contract the substrate's `applyOutputMapping` uses.
      const sources: Record<string, unknown> = { $: payload ?? {}, record: record.Record ?? {} };
      for (const [field, ref] of Object.entries(mapping.fields ?? {})) {
        // Config-driven field name (no compile-time property) — the legitimate
        // use of Set(), exactly as the substrate's write-back does.
        entity.Set(field, resolveMappingRef(ref, sources));
      }
      const saved = await entity.Save();
      if (!saved) {
        LogError(
          `Score Record Set: write-back Save failed for record '${record.RecordID}': ` +
            `${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
      }
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`Score Record Set: write-back failed for record '${record.RecordID}': ${message}`);
      return false;
    }
  }

  /**
   * Resolve the strongly-typed target {@link BaseEntity} for a record. Most scopes
   * carry the already-loaded entity on `.Record`; reuse it (no extra DB round-trip)
   * when it is a real `BaseEntity`. Otherwise (id-only `records`/`single` refs)
   * load it from the provider via the record's `EntityID` + single-column PK using
   * the request user, so write-back works regardless of how the scope was resolved.
   */
  protected async resolveTargetEntity(record: RecordRef, context: RecordProcessorContext): Promise<BaseEntity> {
    if (record.Record instanceof BaseEntity) {
      return record.Record;
    }
    const entityInfo = context.provider.EntityByID(record.EntityID);
    if (!entityInfo) {
      throw new Error(`entity '${record.EntityID}' not found in metadata; cannot write back prediction.`);
    }
    if (entityInfo.PrimaryKeys.length !== 1) {
      throw new Error(`write-back supports single-primary-key entities only ('${entityInfo.Name}').`);
    }
    const obj = await context.provider.GetEntityObject<BaseEntity>(entityInfo.Name, context.contextUser);
    const loaded = await obj.InnerLoad(CompositeKey.FromKeyValuePair(entityInfo.FirstPrimaryKey.Name, record.RecordID));
    if (!loaded) {
      throw new Error(`record '${record.RecordID}' of '${entityInfo.Name}' not found.`);
    }
    return obj;
  }

  /**
   * Validate every mapped target field name against the entity's real fields,
   * throwing on the first unknown name. The mapping is caller-supplied, so an
   * unknown field would otherwise silently no-op (or be swallowed by `Set`); we
   * reject loudly — the same defensive posture as {@link primaryKeyFilter}.
   */
  protected assertMappedFieldsExist(entityInfo: EntityInfo, mapping: ScoringOutputMapping): void {
    for (const field of Object.keys(mapping.fields ?? {})) {
      const match = entityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === field.trim().toLowerCase());
      if (!match) {
        throw new Error(
          `'${field}' is not a field on entity '${entityInfo.Name}'; refusing to write back to an unknown field.`,
        );
      }
    }
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
   *
   * `wroteBack` reflects what was ACTUALLY persisted: it is `true` only when at
   * least one record's prediction was Saved. A record that scored but whose
   * write-back Save failed (its index is in `writeBack.failedIndexes`) is moved
   * from the scored bucket into the failed bucket — its prediction did not land.
   * Predictions are surfaced ephemerally only when nothing was written back.
   */
  protected summarize(
    records: RecordRef[],
    results: RecordResult[],
    request: ScoreRecordSetRequest,
    writeBack: WriteBackOutcome,
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
        if (writeBack.failedIndexes.has(i)) {
          // Scored, but the write-back Save failed — the prediction never landed.
          failedCount++;
          continue;
        }
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

    return {
      scoredCount,
      failedCount,
      skippedCount,
      wroteBack: writeBack.wroteBack,
      // Predictions are ephemeral — only surfaced when NOTHING was written back.
      predictions: writeBack.wroteBack ? undefined : predictions,
    };
  }
}

/**
 * The outcome of the write-back pass, folded into the run summary. `wroteBack` is
 * `true` only when at least one prediction was successfully Saved; `failedIndexes`
 * holds the positions of records that scored but whose write-back Save failed (so
 * they are reclassified scored -> failed).
 */
interface WriteBackOutcome {
  /** True when at least one record's prediction was Saved. */
  wroteBack: boolean;
  /** Indexes (into the paired records/results) whose write-back Save failed. */
  failedIndexes: Set<number>;
}
