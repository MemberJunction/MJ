/**
 * @module monitoring/challenger-step
 *
 * `ChallengerStep` — what a fired retrain trigger does (D-029, D4-20, architecture C7): the pipeline's protocol
 * prepared for it (`ChallengerProtocol`, D4-180: a date-carved holdout re-carved over the current rows), then one
 * challenger training run on a fresh snapshot of the pipeline, published unattended through `AutomatedPublisher.EvaluateAndPublish` with the
 * scheduled-job initiator. The trainer compares the challenger with the incumbent on the incumbent's holdout rows and
 * the gate publishes it only when its paired lower bound beats the margin; monitoring writes no status. A trigger that
 * stays fired in the period after the one that started a challenger does not start another until it has been clear for
 * a period (`waiting`, D4-11). A drift alarm never reaches this step (S8.4).
 */
import type { Actor, MonitoringChallengerResult, MonitoringMirror, MonitoringTriggerFired } from '@memberjunction/predictive-studio-core';

import type { EvaluateOutcome, PublishOutcome } from '../registry/gate-context';
import { GateRefusals } from '../registry/gate-refusals';
import { TrainingInFlightError } from '../training/training-claims';
import type { MonitoringContext, MonitoredModel } from './monitoring-seams';

/** The step's result: the challenger run it started (null when none) and the stored outcome. */
export interface ChallengerStepResult {
  readonly ChallengerRunID: string | null;
  readonly Result: MonitoringChallengerResult;
}

/** Starts and records a fired trigger's challenger. */
export class ChallengerStep {
  /**
   * Starts one challenger when a trigger fired this period that had not fired the period before; records `waiting`
   * when every fired trigger was already fired the period before, and `none` when nothing fired.
   *
   * @param fired the triggers that fired this period
   * @param firedBefore the triggers stored as fired on the previous evaluated period
   * @param mirror the live challenger mirror's divergence of the period, stored with the outcome
   */
  public async RunChallenger(
    model: MonitoredModel, fired: readonly MonitoringTriggerFired[], firedBefore: readonly MonitoringTriggerFired[], mirror: MonitoringMirror | null,
    initiator: Actor, ctx: MonitoringContext,
  ): Promise<ChallengerStepResult> {
    if (fired.length === 0) return { ChallengerRunID: null, Result: ChallengerStep.result('none', null, null, null, mirror) };
    const fresh = fired.filter((f) => !firedBefore.some((b) => b.kind === f.kind));
    if (fresh.length === 0) {
      return { ChallengerRunID: null, Result: ChallengerStep.result('waiting', null, null, `${fired.map((f) => f.kind).join(', ')} stayed fired since the period that started a challenger; the next one waits until it is clear for a period`, mirror) };
    }
    let trainingRunId: string;
    try {
      const refusal = await ctx.Seams.Publisher.PrepareChallenger(model.PipelineID, initiator, ctx.Seams.Clock.Now(), ctx);
      if (refusal !== null) return { ChallengerRunID: null, Result: ChallengerStep.result('stopped', null, null, refusal, mirror) };
      trainingRunId = (await ctx.Seams.Publisher.Train(model.PipelineID, ctx)).TrainingRunID;
    } catch (e) {
      const reason = e instanceof TrainingInFlightError ? `another training of the pipeline is in flight (run ${e.InFlightRunID})` : e instanceof Error ? e.message : String(e);
      return { ChallengerRunID: null, Result: ChallengerStep.result('failed', null, null, `the challenger training did not start: ${reason}`, mirror) };
    }
    const outcome = await ctx.Seams.Publisher.EvaluateAndPublish(trainingRunId, initiator, ctx);
    return { ChallengerRunID: trainingRunId, Result: ChallengerStep.FromOutcome(trainingRunId, outcome, mirror) };
  }

  /** The stored outcome of an automatic attempt: published, withheld with its refusal, or stopped at Evaluate. Pure. */
  public static FromOutcome(trainingRunId: string, outcome: PublishOutcome | EvaluateOutcome, mirror: MonitoringMirror | null): MonitoringChallengerResult {
    switch (outcome.Kind) {
      case 'published':
      case 'already-published':
        return ChallengerStep.result('published', trainingRunId, outcome.PublishRecordID, null, mirror);
      case 'withheld':
        return ChallengerStep.result('withheld', trainingRunId, outcome.RefusalRecordID, GateRefusals.Describe(outcome.Refusal), mirror);
      case 'run-recorded':
        return ChallengerStep.result('stopped', trainingRunId, outcome.RefusalRecordID, GateRefusals.Describe(outcome.Refusal), mirror);
      case 'refused':
        return ChallengerStep.result('withheld', trainingRunId, null, GateRefusals.Describe(outcome.Refusal), mirror);
      case 'evaluated':
        return ChallengerStep.result('stopped', trainingRunId, null, `the challenger was evaluated ${outcome.To} and not published`, mirror);
    }
  }

  private static result(outcome: MonitoringChallengerResult['outcome'], trainingRunId: string | null, recordId: string | null, reason: string | null, mirror: MonitoringMirror | null): MonitoringChallengerResult {
    return { outcome, trainingRunId, recordId, reason, mirror };
  }
}
