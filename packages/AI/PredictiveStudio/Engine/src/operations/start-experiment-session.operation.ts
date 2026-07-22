/**
 * @module operations/start-experiment-session.operation
 *
 * **Start Experiment Session** Remote Operation — the server body for the
 * Manual-mode `PredictiveStudio.StartExperimentSession` operation. The typed peer of
 * the Run-Experiment *Action*: it validates that an **approved** modeling plan was
 * supplied and runs it as an experiment session (in waves, under a budget,
 * maintaining a leaderboard) via {@link ExperimentOrchestrator.runSession}.
 *
 * Per CLAUDE.md "transport-layer architecture", the operation is a THIN adapter —
 * it carries no orchestration logic. The wave loop / leaderboard / budget gate live
 * in the orchestrator, and the production deps wiring is shared with the action via
 * {@link runExperimentSessionViaOrchestrator}.
 *
 * Marked `LongRunning`: it emits coarse start/finish progress. The orchestrator runs
 * the session synchronously to completion (or a clean budget pause); it does not
 * expose a per-wave progress hook today, so progress is bounded to lifecycle phases.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation, type RemoteOpServerContext } from '@memberjunction/core';
import {
  PredictiveStudioStartExperimentSessionOperation,
  type PredictiveStudioStartExperimentSessionInput,
  type PredictiveStudioStartExperimentSessionOutput,
} from '@memberjunction/core-entities';
import {
  validateModelingPlanSpec,
  validateBudget,
  type ModelingPlanSpec,
  type Budget,
} from '@memberjunction/predictive-studio-core';

import { ExperimentOrchestrator } from '../experiment/experiment-orchestrator';
import type { ExperimentRunOptions, ExperimentSessionResult } from '../experiment/types';
import { runExperimentSessionViaOrchestrator } from './delegation';

/**
 * Server implementation of `PredictiveStudio.StartExperimentSession`. Extends the
 * CodeGen-emitted {@link PredictiveStudioStartExperimentSessionOperation} base
 * (`ExecutionMode='LongRunning'`, `RequiredScope='predictive:execute'`) and supplies
 * only the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.StartExperimentSession')
export class PredictiveStudioStartExperimentSessionServerOperation extends PredictiveStudioStartExperimentSessionOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioStartExperimentSessionInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext,
  ): Promise<PredictiveStudioStartExperimentSessionOutput> {
    const plan = this.validatePlan(input.planSpec);

    context.emitProgress({
      OperationKey: this.OperationKey,
      Processed: 0,
      Status: 'Running',
      Message: `Starting experiment session for goal: ${plan.Goal}`,
    });

    const result = await runExperimentSessionViaOrchestrator(
      plan,
      this.buildOptions(input),
      provider,
      user,
      this.orchestrator(),
    );

    context.emitProgress({
      OperationKey: this.OperationKey,
      Processed: result.iterations.length,
      Total: result.iterations.length,
      Status: 'Running',
      Message: `Session ${result.session.ID} finished (${result.stopReason}) across ${result.iterations.length} iteration(s).`,
    });

    return {
      sessionId: result.session.ID,
      experimentId: result.experiment.ID,
      status: result.session.Status,
    };
  }

  /**
   * Validate the untrusted plan against the Core schema and enforce the approval
   * gate. Experiment execution is gated on user approval (§9.1) — an unapproved
   * (or malformed) plan is refused before any orchestration begins.
   *
   * NB: the server tsconfig runs with `strictNullChecks` OFF, under which the
   * discriminated-union return does NOT narrow on `validation.ok`; we read the
   * failure detail off the concrete failure shape (mirrors the Run-Experiment action).
   */
  protected validatePlan(rawPlan: PredictiveStudioStartExperimentSessionInput['planSpec']): ModelingPlanSpec {
    if (!rawPlan) {
      throw new Error('planSpec is required (the approved modeling plan to execute)');
    }
    const validation = validateModelingPlanSpec(rawPlan);
    if (!validation.ok) {
      const error = (validation as { error?: string }).error ?? 'unknown validation error';
      throw new Error(`planSpec is not a valid modeling plan: ${error}`);
    }
    const plan = validation.value;
    if (plan.Approved !== true) {
      throw new Error(
        'The planSpec is not approved. Experiment execution is gated on user approval — set Approved=true before starting.',
      );
    }
    return plan;
  }

  /**
   * Build the orchestrator run options from the input — an optional `ExperimentID`
   * to attach the session to, an optional validated `Budget` override (else the
   * plan's `ProposedBudget`), and an optional session name.
   */
  protected buildOptions(input: PredictiveStudioStartExperimentSessionInput): ExperimentRunOptions {
    const options: ExperimentRunOptions = {};
    if (input.experimentId) {
      options.experimentID = input.experimentId;
    }
    if (input.sessionName) {
      options.sessionName = input.sessionName;
    }
    const budget = this.parseBudget(input.budget);
    if (budget) {
      options.budget = budget;
    }
    return options;
  }

  /**
   * Validate the optional budget override. A malformed budget is NOT a hard failure
   * — the plan's `ProposedBudget` is the downstream fallback — so this returns
   * `undefined` on absence or invalidity rather than throwing (mirrors the action).
   */
  protected parseBudget(raw: PredictiveStudioStartExperimentSessionInput['budget']): Budget | undefined {
    if (!raw) {
      return undefined;
    }
    const validation = validateBudget(raw);
    return validation.ok ? validation.value : undefined;
  }

  /**
   * The {@link ExperimentOrchestrator} to delegate to. Overridable so unit tests
   * inject a mock with no live DB / sidecar (mirrors the Action's seam).
   */
  protected orchestrator(): ExperimentOrchestrator {
    return new ExperimentOrchestrator();
  }
}

/** Local alias so JSDoc {@link} references resolve cleanly. */
export type { ExperimentSessionResult };

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioStartExperimentSessionOperation(): void {
  // intentionally empty
}
