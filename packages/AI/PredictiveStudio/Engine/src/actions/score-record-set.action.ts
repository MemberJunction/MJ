/**
 * @module actions/score-record-set.action
 *
 * **Score Record Set** action — the thin Action boundary over the scoring work
 * type {@link MLModelInferenceProcessor} (plan §10 / §12). It lets an agent /
 * workflow / UI score a set of records with a trained model and either read the
 * predictions back ephemerally or confirm a write-back.
 *
 * Per CLAUDE.md "Actions are boundaries": this action does NOT do any scoring
 * logic. It validates `ModelID` + `Scope`, parses the optional `WriteBack`
 * directive, delegates to an injectable {@link IScoreRecordSetRunner} (whose
 * production implementation resolves the scope into records and drives the
 * `MLModelInferenceProcessor`'s batch path), then maps `ScoredCount` +
 * (ephemeral) `Predictions` / write-back confirmation onto output params.
 *
 * The runner is an injectable seam so unit tests substitute a mock with no live DB
 * and no sidecar.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

import { BasePredictiveStudioAction, type JsonObject } from './base-predictive-studio.action';
import { ProductionScoreRecordSetRunner } from './score-record-set.runner';

/** The driver-class key this action registers under (matches the metadata row). */
export const SCORE_RECORD_SET_DRIVER_CLASS = 'PredictiveStudioScoreRecordSetAction';

/**
 * The scope of records to score. Mirrors the Record Set Processing scope shapes
 * (records / view / list / filter / single). Exactly one shape should be
 * populated; the runner resolves it into a concrete record set.
 */
export interface ScoringScope {
  /** Explicit record refs / primary keys to score. */
  records?: Array<string | JsonObject>;
  /** A `User Views` id whose rows are scored. */
  viewId?: string;
  /** A `Lists` id whose member rows are scored. */
  listId?: string;
  /** An entity name + SQL filter selecting the rows to score. */
  filter?: { entityName: string; extraFilter?: string; maxRows?: number };
  /** A single record (entity + primary key) to score. */
  single?: { entityName: string; primaryKey: JsonObject };
}

/**
 * The optional write-back directive. `true` enables write-back with the model's
 * default mapping; an object supplies an explicit `OutputMapping` (target column /
 * child record) handled by the write-back wrapper in the higher Record Process
 * layer.
 */
export type WriteBackDirective = boolean | { OutputMapping: JsonObject };

/** The model id + resolved scope + write-back directive handed to the runner. */
export interface ScoreRecordSetRequest {
  modelId: string;
  scope: ScoringScope;
  writeBack?: WriteBackDirective;
  contextUser?: UserInfo;
  provider?: IMetadataProvider;
}

/** A single ephemeral prediction surfaced when write-back is NOT requested. */
export interface EphemeralPrediction {
  /** The scored record's id (when known). */
  recordId?: string;
  /** Numeric model output (probability or value). */
  score: number;
  /** Predicted class (classification only). */
  class?: string;
}

/** The runner's result — counts + (ephemeral) predictions or write-back confirmation. */
export interface ScoreRecordSetResult {
  /** Number of records successfully scored. */
  scoredCount: number;
  /** Number of records that failed to score. */
  failedCount: number;
  /** Ephemeral predictions (present when write-back was NOT requested). */
  predictions?: EphemeralPrediction[];
  /** True when the runner applied a write-back instead of returning predictions. */
  wroteBack: boolean;
}

/**
 * The single scoring-execution seam this action depends on — "score this scope
 * with this model, give me the counts + predictions / write-back confirmation".
 * The production implementation ({@link ProductionScoreRecordSetRunner}) resolves
 * the scope into records and drives the {@link MLModelInferenceProcessor}; tests
 * inject a deterministic fake.
 */
export interface IScoreRecordSetRunner {
  /** Score the requested scope and return the run summary. */
  run(request: ScoreRecordSetRequest): Promise<ScoreRecordSetResult>;
}

/**
 * Scores a set of records with a trained `MJ: ML Models`. Outputs: `ScoredCount`
 * (number), `Predictions` (JSON array, ephemeral only), `WroteBack` (boolean).
 */
@RegisterClass(BaseAction, SCORE_RECORD_SET_DRIVER_CLASS)
export class PredictiveStudioScoreRecordSetAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const modelId = this.getStringParam(params, 'ModelID');
      if (!modelId) {
        return this.fail('VALIDATION_ERROR', 'ModelID parameter is required');
      }

      const scope = this.parseScope(params);
      if (!scope) {
        return this.fail(
          'VALIDATION_ERROR',
          'Scope parameter is required and must be a JSON object describing records/view/list/filter/single',
        );
      }
      if (!this.scopeHasTarget(scope)) {
        return this.fail(
          'VALIDATION_ERROR',
          'Scope must populate exactly one of: records, viewId, listId, filter, single',
        );
      }

      const writeBack = this.parseWriteBack(params);

      const runner = this.createRunner();
      const result = await runner.run({
        modelId,
        scope,
        writeBack,
        contextUser: params.ContextUser,
        provider: params.Provider,
      });

      return this.mapResult(params, result);
    } catch (e) {
      LogError(e);
      return this.fail('SCORING_FAILED', `Scoring failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Map the runner result onto output params + a human-readable message. */
  protected mapResult(params: RunActionParams, result: ScoreRecordSetResult): ActionResultSimple {
    this.addOutputParam(params, 'ScoredCount', result.scoredCount);
    this.addOutputParam(params, 'WroteBack', result.wroteBack);
    if (result.wroteBack) {
      return this.ok(params, `Scored ${result.scoredCount} record(s); predictions written back to the target.`);
    }
    this.addOutputParam(params, 'Predictions', JSON.stringify(result.predictions ?? []));
    return this.ok(params, `Scored ${result.scoredCount} record(s); returned ephemeral predictions.`);
  }

  // ----- param parsing -------------------------------------------------------

  /** Parse the `Scope` JSON param into a {@link ScoringScope}. */
  protected parseScope(params: RunActionParams): ScoringScope | undefined {
    const raw = this.getJsonObjectParam(params, 'Scope');
    return raw ? (raw as ScoringScope) : undefined;
  }

  /** Whether the scope populates at least one selector. */
  protected scopeHasTarget(scope: ScoringScope): boolean {
    return Boolean(
      (Array.isArray(scope.records) && scope.records.length > 0) ||
        scope.viewId ||
        scope.listId ||
        scope.filter ||
        scope.single,
    );
  }

  /**
   * Parse the optional `WriteBack` param. Accepts a boolean, or a JSON object with
   * an `OutputMapping`. Returns `undefined` when not requested.
   */
  protected parseWriteBack(params: RunActionParams): WriteBackDirective | undefined {
    const obj = this.getJsonObjectParam(params, 'WriteBack');
    if (obj && 'OutputMapping' in obj && obj.OutputMapping && typeof obj.OutputMapping === 'object') {
      return { OutputMapping: obj.OutputMapping as JsonObject };
    }
    const flag = this.getBooleanParam(params, 'WriteBack', false);
    return flag ? true : undefined;
  }

  // ----- injectable runner seam (overridden in tests) ------------------------

  /** Construct the production scoring runner. Overridable so tests inject a mock. */
  protected createRunner(): IScoreRecordSetRunner {
    return new ProductionScoreRecordSetRunner();
  }
}
