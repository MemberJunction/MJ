/**
 * @module scoring/ml-model-score-enricher
 *
 * **PS2-3 — scored-query enrichment.** A {@link QueryResultEnricherBase} that scores a
 * RunQuery result set with a trained ML model and appends the prediction as a new
 * column on each row. It is the Predictive-Studio half of the decoupled enrichment
 * seam: MJCore's `RunQuery` resolves an enricher by key (`@RegisterClass`) at runtime
 * and never depends on Predictive Studio (mirrors how the `'ML Model'` Record Set
 * Processing work type stays decoupled via the registry).
 *
 * The model determines the target entity (the processor assembles features against the
 * model's `targetEntityName`), so the enrichment only needs each row's PRIMARY KEY — it
 * passes those keys as the scorer's `records` scope, scores WITHOUT write-back so the
 * predictions are ephemeral, then joins them back onto the rows by record id.
 *
 * Resilience: the enricher degrades gracefully (logs + returns the input rows unchanged)
 * for recoverable conditions — missing config, no primary keys — and RunQuery additionally
 * guards the call, so a scoring problem can never break the underlying query.
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, QueryResultEnricherBase, type IMetadataProvider, type QueryInfo, type UserInfo } from '@memberjunction/core';

import type {
  EphemeralPrediction,
  IScoreRecordSetRunner,
  ScoringScope,
} from '../actions/score-record-set.action';
import { buildScoreRecordSetRunner } from '../operations/delegation';

/** The ClassFactory key the enricher registers under — the `EnricherKey` callers pass on `RunQueryParams.Enrichment`. */
export const ML_MODEL_SCORE_ENRICHER_KEY = 'ML Model Score';

/**
 * The shape of `RunQueryEnrichment.Config` this enricher reads. Owned here (not by
 * MJCore), so RunQuery stays generic.
 */
export interface MLModelScoreEnricherConfig {
  /** The `MJ: ML Models` id to score each row with. */
  modelId: string;
  /** The result column the prediction is written into (added to each scored row). */
  outputField: string;
  /** The result column holding each row's primary key (joined to the model's records). Defaults to `ID`. */
  primaryKeyField?: string;
  /**
   * Which prediction value to write: the numeric `score` (default — e.g. a renewal
   * probability) or the classification `class` label. Falls back to `score` when
   * `class` is requested but absent.
   */
  valueKind?: 'score' | 'class';
}

/**
 * Scores RunQuery result rows with a trained ML model, appending the prediction column.
 * Registered on the MJGlobal ClassFactory so MJCore's `RunQuery` can resolve it by key
 * without a static dependency.
 */
@RegisterClass(QueryResultEnricherBase, ML_MODEL_SCORE_ENRICHER_KEY)
export class MLModelScoreEnricher extends QueryResultEnricherBase {
  /** @inheritdoc */
  public async EnrichResults(opts: {
    rows: Record<string, unknown>[];
    config: Record<string, unknown>;
    query?: QueryInfo;
    contextUser?: UserInfo;
    provider?: IMetadataProvider;
  }): Promise<Record<string, unknown>[]> {
    const { rows, contextUser, provider } = opts;
    if (!Array.isArray(rows) || rows.length === 0) {
      return rows;
    }

    const config = this.parseConfig(opts.config);
    if (!config) {
      // Recoverable: bad/missing config — leave the rows as they are.
      return rows;
    }

    const pkField = config.primaryKeyField ?? 'ID';
    const ids = this.collectPrimaryKeys(rows, pkField);
    if (ids.length === 0) {
      LogError(`MLModelScoreEnricher: no '${pkField}' primary keys in the result rows; returning rows un-enriched`);
      return rows;
    }

    // Score WITHOUT write-back → ephemeral predictions. The model supplies the target
    // entity, so bare primary keys are a sufficient `records` scope.
    const result = await this.createRunner().run({
      modelId: config.modelId,
      scope: { records: ids } as ScoringScope,
      contextUser,
      provider,
    });

    const predictionById = this.indexPredictionsById(result.predictions);
    if (predictionById.size === 0) {
      return rows;
    }

    const useClass = config.valueKind === 'class';
    for (const row of rows) {
      const id = this.rowKey(row, pkField);
      const prediction = id != null ? predictionById.get(id) : undefined;
      if (prediction) {
        row[config.outputField] = useClass && prediction.class != null ? prediction.class : prediction.score;
      }
      // Rows with no matching prediction are intentionally left untouched (no column added).
    }
    return rows;
  }

  /**
   * The scoring runner to delegate to. Overridable so unit tests inject a fake with no
   * live DB / sidecar (mirrors the Score action / operation `createRunner` seam). The
   * production default wires the model loader / sidecar / artifact loader.
   */
  protected createRunner(): IScoreRecordSetRunner {
    return buildScoreRecordSetRunner();
  }

  /**
   * Validate + narrow the free-form config to {@link MLModelScoreEnricherConfig}, or
   * `null` (with a logged reason) when the required `modelId` / `outputField` are absent.
   */
  protected parseConfig(config: Record<string, unknown>): MLModelScoreEnricherConfig | null {
    const modelId = typeof config?.modelId === 'string' ? config.modelId : undefined;
    const outputField = typeof config?.outputField === 'string' ? config.outputField : undefined;
    if (!modelId || !outputField) {
      LogError(`MLModelScoreEnricher: config requires string 'modelId' and 'outputField'; got ${JSON.stringify(config)}`);
      return null;
    }
    const primaryKeyField = typeof config.primaryKeyField === 'string' ? config.primaryKeyField : undefined;
    const valueKind = config.valueKind === 'class' ? 'class' : 'score';
    return { modelId, outputField, primaryKeyField, valueKind };
  }

  /** Distinct, defined primary-key values from the rows (as strings — the scorer's record ids). */
  protected collectPrimaryKeys(rows: Record<string, unknown>[], pkField: string): string[] {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = this.rowKey(row, pkField);
      if (key != null) {
        seen.add(key);
      }
    }
    return [...seen];
  }

  /** A single row's primary-key value as a string, or `undefined` when absent/null. */
  protected rowKey(row: Record<string, unknown>, pkField: string): string | undefined {
    const value = row?.[pkField];
    return value == null ? undefined : String(value);
  }

  /** Index ephemeral predictions by their `recordId` for an O(1) join back onto rows. */
  protected indexPredictionsById(predictions: EphemeralPrediction[] | undefined): Map<string, EphemeralPrediction> {
    const map = new Map<string, EphemeralPrediction>();
    for (const prediction of predictions ?? []) {
      if (prediction.recordId != null) {
        map.set(String(prediction.recordId), prediction);
      }
    }
    return map;
  }
}

/**
 * Tree-shaking anchor — referencing the class through this function creates a static
 * code path the bundler keeps, so the `@RegisterClass` side-effect survives. Called from
 * the scoring barrel so the enricher is registered when the package's module graph loads.
 */
export function LoadMLModelScoreEnricher(): void {
  void MLModelScoreEnricher;
}
