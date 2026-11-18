/**
 * @module actions/score-record-set.action
 *
 * **Score Record Set** action — the thin Action boundary over `ScoringService` (§5.8.3). With a `BindingID` the scope
 * is scored through the binding and written as the binding's Feature Values (`Score`); without one the model predicts
 * and nothing is written (`Predict`), the predictions are returned.
 *
 * Per CLAUDE.md "Actions are boundaries": this action does NOT do any scoring logic. It validates its params,
 * delegates to an injectable {@link IScoreRecordSetRunner} and maps the scoring result onto output params: a completed
 * run's `ScoringRunID`, `Status`, `Total` and `Written` (and `Predictions` when nothing was written); a refused or
 * failed run fails the action with the refusal's code, and keeps `ScoringRunID`, `Status`, `Total`, `Written` and
 * `Failed` as outputs, so a refusal is never flattened into a message.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { PredictiveStudioScoredPrediction } from '@memberjunction/core-entities';
import type { EntityRef, ScoringResult } from '@memberjunction/predictive-studio-core';

import { BasePredictiveStudioAction, type JsonObject } from './base-predictive-studio.action';
import { BuildScoreRecordSetRunner } from '../operations/delegation';
import { PredictiveStudioRefusals } from '../operations/refusals';
import { ScoringRefusedError } from '../scoring/scoring-refused-error';

/** The driver-class key this action registers under (matches the metadata row). */
export { SCORE_RECORD_SET_DRIVER_CLASS } from './driver-classes';
import { SCORE_RECORD_SET_DRIVER_CLASS } from './driver-classes';

/**
 * The records a Score Record Set call names, in the operation's wire shapes (records / view / list / filter / single).
 * Exactly one shape is populated; the runner resolves it into the scoring scope.
 */
export interface ScoreRecordSetScope {
  /** Explicit record keys (a bare value or a `Field|value` segment) or primary-key objects to score. */
  records?: Array<string | JsonObject>;
  /** A `User Views` id whose rows are scored. */
  viewId?: string;
  /** A `Lists` id whose member rows are scored. */
  listId?: string;
  /** An entity name + SQL filter selecting the rows to score; a positive `maxRows` refuses a larger scope. */
  filter?: { entityName: string; extraFilter?: string; maxRows?: number };
  /** A single record (entity + primary key) to score. */
  single?: { entityName: string; primaryKey: JsonObject };
}

/** What the runner is asked to score. */
export interface ScoreRecordSetRequest {
  /** The model; with a `bindingId` it must be a model of the binding's pipeline. */
  modelId: string;
  /** The binding to score through and write for; without it the call predicts and writes nothing. */
  bindingId?: string;
  scope: ScoreRecordSetScope;
  /** ISO date the scope is scored as of; the run date when omitted. */
  asOfDate?: string;
  /** The stored row mapping the scope's entity onto the model's entity, when they differ. */
  entityMapping?: EntityRef;
  /** Score and record the run, but write no Feature Value and no column. */
  dryRun?: boolean;
  contextUser?: UserInfo;
  /** The provider every read and write goes through (required: no fallback to the global provider). */
  provider: IMetadataProvider;
}

/** A completed scoring call: the run's result, and the predictions when nothing was written. */
export interface ScoredRecordSet {
  readonly Result: Extract<ScoringResult, { readonly Status: 'completed' }>;
  readonly Predictions: readonly PredictiveStudioScoredPrediction[];
}

/**
 * The scoring seam this action depends on. The production implementation ({@link ProductionScoreRecordSetRunner})
 * resolves the scope and calls `ScoringService`; it throws {@link ScoringRefusedError} for a refused or failed run.
 */
export interface IScoreRecordSetRunner {
  /** Score the requested scope; a run that does not complete throws {@link ScoringRefusedError}. */
  run(request: ScoreRecordSetRequest): Promise<ScoredRecordSet>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Scores a set of records with a trained `MJ: ML Models`. Inputs `ModelID`, `Scope`, optional `BindingID`, `AsOfDate`;
 * outputs `ScoringRunID`, `Status`, `Total`, `Written`, `Failed` and `Predictions`.
 */
@RegisterClass(BaseAction, SCORE_RECORD_SET_DRIVER_CLASS)
export class PredictiveStudioScoreRecordSetAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const request = this.buildRequest(params);
      if (typeof request === 'string') return this.fail('VALIDATION_ERROR', request);
      const result = await this.createRunner().run(request);
      return this.mapResult(params, result);
    } catch (e) {
      if (e instanceof ScoringRefusedError) return this.mapRefusal(params, e);
      LogError(e);
      const error = e instanceof Error ? e : new Error(String(e));
      // A refusal keeps its typed code (the same one the operation returns), so agents never parse the message.
      return this.fail(PredictiveStudioRefusals.CodeOf(error) || 'SCORING_FAILED', `Scoring failed: ${error.message}`);
    }
  }

  /** The runner request from the params, or the validation message. */
  protected buildRequest(params: RunActionParams): ScoreRecordSetRequest | string {
    const modelId = this.getStringParam(params, 'ModelID');
    if (!modelId) return 'ModelID parameter is required';
    // Scoring runs server-side and reads records on behalf of a user — a ContextUser is mandatory (CLAUDE.md).
    if (!params.ContextUser) return 'ContextUser is required to score records (server-side data access is user-scoped)';
    const scope = this.parseScope(params);
    if (!scope) return 'Scope parameter is required and must be a JSON object describing records/view/list/filter/single';
    if (!this.scopeHasTarget(scope)) return 'Scope must populate exactly one of: records, viewId, listId, filter, single';
    const provider = params.Provider || Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts)
    return {
      modelId, scope, bindingId: this.getStringParam(params, 'BindingID'), asOfDate: this.getStringParam(params, 'AsOfDate'),
      contextUser: params.ContextUser, provider,
    };
  }

  /** Map a completed run onto output params and a message. */
  protected mapResult(params: RunActionParams, scored: ScoredRecordSet): ActionResultSimple {
    const result = scored.Result;
    this.addRunOutputs(params, result.ScoringRunID, result.Status, result.Total, result.Written, 0);
    this.addOutputParam(params, 'Predictions', JSON.stringify(scored.Predictions));
    const what = result.Written > 0 ? `wrote ${result.Written} Feature Value(s)` : `returned ${scored.Predictions.length} prediction(s)`;
    return this.ok(params, `Scored ${result.Total} record(s) with model ${result.ModelID} v${result.ModelVersion}; ${what} (scoring run ${result.ScoringRunID}).`);
  }

  /** A refused or failed run: the action fails with the refusal's code and keeps the run's fields as outputs. */
  protected mapRefusal(params: RunActionParams, e: ScoringRefusedError): ActionResultSimple {
    const result = e.Result;
    if (result.Status === 'failed') this.addRunOutputs(params, result.ScoringRunID, result.Status, result.Total, 0, result.Failed);
    else this.addRunOutputs(params, result.ScoringRunID, result.Status, 0, 0, 0);
    return { Success: false, ResultCode: PredictiveStudioRefusals.CodeOf(e) || 'SCORING_FAILED', Message: e.message, Params: params.Params };
  }

  /** The run's output params. */
  private addRunOutputs(params: RunActionParams, runId: string, status: ScoringResult['Status'], total: number, written: number, failed: number): void {
    this.addOutputParam(params, 'ScoringRunID', runId);
    this.addOutputParam(params, 'Status', status);
    this.addOutputParam(params, 'Total', total);
    this.addOutputParam(params, 'Written', written);
    this.addOutputParam(params, 'Failed', failed);
  }

  // ----- param parsing -------------------------------------------------------

  /** Parse the `Scope` JSON param into a {@link ScoreRecordSetScope}. */
  protected parseScope(params: RunActionParams): ScoreRecordSetScope | undefined {
    const raw = this.getJsonObjectParam(params, 'Scope');
    return raw ? (raw as ScoreRecordSetScope) : undefined;
  }

  /**
   * Whether the scope populates EXACTLY ONE selector. More than one is ambiguous and is rejected the same as none, so
   * the caller's intent is always unambiguous.
   */
  protected scopeHasTarget(scope: ScoreRecordSetScope): boolean {
    return PredictiveStudioScoreRecordSetAction.CountScopeSelectors(scope) === 1;
  }

  /** How many of the mutually-exclusive scope selectors are populated. Pure. */
  public static CountScopeSelectors(scope: ScoreRecordSetScope): number {
    let count = 0;
    if (Array.isArray(scope.records) && scope.records.length > 0) count++;
    if (scope.viewId) count++;
    if (scope.listId) count++;
    if (scope.filter) count++;
    if (scope.single) count++;
    return count;
  }

  // ----- injectable runner seam (overridden in tests) ------------------------

  /**
   * Construct the production scoring runner — the same one the Score Record Set operation uses. Overridable so tests
   * inject a mock.
   */
  protected createRunner(): IScoreRecordSetRunner {
    return BuildScoreRecordSetRunner();
  }
}
