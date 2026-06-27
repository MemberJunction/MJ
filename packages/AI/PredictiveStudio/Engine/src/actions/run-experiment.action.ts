/**
 * @module actions/run-experiment.action
 *
 * **Run Experiment Session** action — the thin Action boundary over
 * {@link ExperimentOrchestrator} (plan §8.3 / §9.1 / §12). It lets an agent /
 * workflow / UI execute an approved modeling plan to completion (or until the
 * budget bound) and read back the session id, the best model id, and the
 * leaderboard.
 *
 * Per CLAUDE.md "Actions are boundaries": this action does NOT do any experiment
 * orchestration. It validates that an **approved** `PlanSpec` is supplied (and an
 * optional `ExperimentID` to attach the session to an existing durable
 * experiment), parses the optional `Budget`, builds the orchestrator's production
 * deps (entity factory + clock + trainer), delegates to
 * `ExperimentOrchestrator.runSession`, then maps the result onto output params.
 *
 * The orchestrator + deps are created behind overridable factory seams so unit
 * tests substitute mocks with no live DB and no sidecar.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ModelingPlanSpec, Budget } from '@memberjunction/predictive-studio-core';

import { ExperimentOrchestrator } from '../experiment/experiment-orchestrator';
import type { ExperimentDeps, ExperimentRunOptions, ExperimentSessionResult } from '../experiment/types';
import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { buildProductionExperimentDeps } from './run-experiment.deps';

/** The driver-class key this action registers under (matches the metadata row). */
export const RUN_EXPERIMENT_DRIVER_CLASS = 'PredictiveStudioRunExperimentAction';

/**
 * Runs an approved modeling plan as an experiment session. Outputs: `SessionID`
 * (string), `BestModelID` (string | null), `Leaderboard` (JSON string),
 * `StopReason` (string).
 */
@RegisterClass(BaseAction, RUN_EXPERIMENT_DRIVER_CLASS)
export class PredictiveStudioRunExperimentAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const plan = this.parsePlan(params);
      if (!plan) {
        return this.fail(
          'VALIDATION_ERROR',
          'PlanSpec parameter is required and must be a JSON modeling plan (the approved plan to execute)',
        );
      }
      if (plan.Approved !== true) {
        return this.fail(
          'PLAN_NOT_APPROVED',
          'The PlanSpec is not approved. Experiment execution is gated on user approval — set Approved=true on the plan before running.',
        );
      }

      const options = this.buildOptions(params);
      const orchestrator = this.createOrchestrator();
      const deps = this.buildDeps(params);

      const result = await orchestrator.runSession(plan, deps, options);
      return this.mapResult(params, result);
    } catch (e) {
      LogError(e);
      return this.fail('EXPERIMENT_FAILED', `Experiment session failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Map the orchestrator result onto output params + a human-readable message. */
  protected mapResult(params: RunActionParams, result: ExperimentSessionResult): ActionResultSimple {
    this.addOutputParam(params, 'SessionID', result.session.ID);
    this.addOutputParam(params, 'BestModelID', result.bestModel?.ID ?? null);
    this.addOutputParam(params, 'Leaderboard', JSON.stringify(result.leaderboard));
    this.addOutputParam(params, 'StopReason', result.stopReason);

    const best = result.bestModel ? `best model ${result.bestModel.ID}` : 'no winning model';
    return this.ok(
      params,
      `Experiment session ${result.session.ID} finished (${result.stopReason}) with ${best} across ${result.iterations.length} iteration(s).`,
    );
  }

  // ----- param parsing -------------------------------------------------------

  /** Parse the `PlanSpec` JSON param into a {@link ModelingPlanSpec}. */
  protected parsePlan(params: RunActionParams): ModelingPlanSpec | undefined {
    const raw = this.getJsonObjectParam(params, 'PlanSpec');
    return raw ? (raw as unknown as ModelingPlanSpec) : undefined;
  }

  /** Parse the optional `Budget` JSON param into a {@link Budget}. */
  protected parseBudget(params: RunActionParams): Budget | undefined {
    const raw = this.getJsonObjectParam(params, 'Budget');
    return raw ? (raw as Budget) : undefined;
  }

  /**
   * Build the orchestrator run options from the action's params — an optional
   * pre-resolved `ExperimentID` to attach the session to, and an optional `Budget`
   * override (otherwise the plan's `ProposedBudget` is used).
   */
  protected buildOptions(params: RunActionParams): ExperimentRunOptions {
    const options: ExperimentRunOptions = {};
    const experimentId = this.getStringParam(params, 'ExperimentID');
    if (experimentId) {
      options.experimentID = experimentId;
    }
    const budget = this.parseBudget(params);
    if (budget) {
      options.budget = budget;
    }
    return options;
  }

  // ----- injectable orchestrator + deps seams (overridden in tests) ----------

  /** Construct the {@link ExperimentOrchestrator}. Overridable so tests inject a mock. */
  protected createOrchestrator(): ExperimentOrchestrator {
    return new ExperimentOrchestrator();
  }

  /**
   * Build the orchestrator's production dependency bundle from the action's run
   * params. Overridable so tests inject in-memory seams (entity factory, fake
   * clock, fake trainer).
   */
  protected buildDeps(params: RunActionParams): ExperimentDeps {
    return buildProductionExperimentDeps(params.ContextUser, params.Provider);
  }
}
