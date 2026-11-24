/**
 * @module registry/automated-publisher
 *
 * `AutomatedPublisher` — the one unattended publish path (§5.2, D-029): auto-train, the agent's publish step and
 * monitoring's retrains all publish a freshly trained run through {@link AutomatedPublisher.EvaluateAndPublish}. It is
 * a composer over the {@link LifecycleGate} and never writes a model's `Status` or a publish record itself: the gate
 * writes both — the `publish` record of an applied publish, the `refusal` record of a withheld one, and the run-level
 * `refusal` record of a run whose decision shipped no model row (written inside `Evaluate`, D4-56), and the `refusal`
 * record of a model-level Evaluate refusal of the attempt (the Evaluate runs with `AttemptPurpose: 'publish'`, D4-143). Each automatic
 * outcome is then surfaced to the user behind the initiator through {@link PublishNotifications}.
 *
 * | Gate call | Outcome | Notification | Record (written by the gate) |
 * |---|---|---|---|
 * | `Evaluate({ trainingRunId, AttemptPurpose: 'publish' })` (every row) | `evaluated` → `Publish` | `published` or `withheld` of the model | `publish`, or the model's `refusal` |
 * | `Evaluate({ trainingRunId })` | `run-recorded` | the pipeline's run stopped at Evaluate | the run-level `refusal` |
 * | `Evaluate({ trainingRunId })` | `refused` `illegal-transition` from `validated` / `keep-baseline` (evaluated before: a resume, D4-131) → `Publish` | `published` or `withheld` of the model | as the first row |
 * | `Evaluate({ trainingRunId })` | `refused` `illegal-transition` from `published` (a re-run of a served model, D4-133) | none (one `LogStatus` line) | none |
 * | `Evaluate({ trainingRunId })` | any other `refused` | `withheld` of the run's model (none when the run is not found) | the model's `refusal`, `Purpose 'publish'` (D4-143: `not-servable`, `gate-no-signal` with a model row, `calibration-held`, `actor-not-permitted`, transient `publish-in-progress`); none for `model-not-found` |
 *
 * **Production construction:** `new AutomatedPublisher()` — the production gate and notifications.
 */
import { LogStatus } from '@memberjunction/core';
import type { Actor, PersistedLifecycleState } from '@memberjunction/predictive-studio-core';

import type { EvaluateOutcome, GateContext, PublishOutcome } from './gate-context';
import { LifecycleGate } from './lifecycle-gate';
import { PublishNotifications } from './publish-notifications';
import { StoredRuns } from './stored-publish-inputs';

/** A run's model that Evaluate found past Draft: its ID and the lifecycle state it is in. */
export interface EvaluatedModel {
  /** The run's `ResultingModelID`. */
  readonly ModelID: string;
  /** The model's persisted state, as Evaluate's `illegal-transition` named it. */
  readonly From: PersistedLifecycleState;
}

/** An Evaluate outcome that did not move a model into a publishable status. */
export type StoppedEvaluateOutcome = Exclude<EvaluateOutcome, { readonly Kind: 'evaluated' }>;

/** Evaluates a trained run and publishes its model through the lifecycle gate, unattended. */
export class AutomatedPublisher {
  /**
   * The states a resume publishes from: a model already evaluated into a publishable status. An Archived, Published or
   * Unevaluated model is not resumed (a retrained run is a new run; a Published one is already served).
   */
  private static readonly RESUMABLE_STATES: readonly PersistedLifecycleState[] = ['validated', 'keep-baseline'];

  /**
   * @param gate the lifecycle gate both steps run through (production: `new LifecycleGate()`)
   * @param notifications what surfaces each outcome to the initiator's user (production: `new PublishNotifications()`)
   */
  constructor(
    private readonly gate: LifecycleGate = new LifecycleGate(),
    private readonly notifications: PublishNotifications = new PublishNotifications(),
  ) {}

  /**
   * Evaluates the run (`LifecycleGate.Evaluate({ trainingRunId })`); when its model moved to Validated or KeepBaseline,
   * publishes it (`LifecycleGate.Publish`, purpose `publish`, no sign-off) and notifies the outcome. A run whose model
   * was evaluated before (Validated or KeepBaseline — a publish that was refused, transiently or not) resumes at the
   * publish instead ({@link EvaluatedModelOf}, D4-131). A Published model is not resumed and nobody is notified (it is
   * being served; one `LogStatus` line names it, D4-133): Evaluate's `illegal-transition` is returned, never Publish's
   * `already-published`. Otherwise (an Archived or Unevaluated model, or any other stop) it notifies the stop and returns
   * the Evaluate outcome. The gate's rules decide (a kept baseline is withheld unless the protocol
   * auto-publishes it; a required sign-off withholds it), and every attempt that does not publish leaves the gate's
   * record: the Evaluate runs with `AttemptPurpose: 'publish'`, so the gate also records a model-level Evaluate refusal
   * as this attempt's `refusal` (D4-143); only `illegal-transition` (a resume or a served model) and `model-not-found`
   * leave none.
   *
   * @param initiator the automated initiator — `{ kind: 'system', component: 'auto-train', processRunId }`, an agent run,
   *   or a scheduled job run (a `human` initiator publishes as that user and is not notified)
   * @throws LifecycleModelNotFoundError when the evaluated model is gone before its publish (from `LifecycleGate.Publish`)
   * @throws Error when the run cannot be read for a resume (`StoredRuns.Read`, from {@link EvaluatedModelOf}), or when a
   *   refusal of a caller missing a grant the gate writes with cannot be recorded because the provider offers no system user
   *   (`LifecycleGate.GateWriteContext`)
   */
  public async EvaluateAndPublish(trainingRunId: string, initiator: Actor, ctx: GateContext): Promise<PublishOutcome | EvaluateOutcome> {
    const evaluated = await this.EvaluateRun(trainingRunId, initiator, ctx);
    if (evaluated.Kind === 'evaluated') return this.publishAndNotify(evaluated.ModelID, initiator, ctx);
    const evaluatedBefore = await this.EvaluatedModelOf(trainingRunId, evaluated, ctx);
    if (evaluatedBefore !== null && AutomatedPublisher.RESUMABLE_STATES.some((s) => s === evaluatedBefore.From)) {
      return this.publishAndNotify(evaluatedBefore.ModelID, initiator, ctx);
    }
    if (evaluatedBefore !== null && evaluatedBefore.From === 'published') {
      LogStatus(`Predictive Studio automated publisher: ML Model ${evaluatedBefore.ModelID} of training run ${trainingRunId} is already Published; nothing is published and nobody is notified.`);
      return evaluated;
    }
    await this.NotifyStoppedAtEvaluate(trainingRunId, evaluated, initiator, ctx);
    return evaluated;
  }

  /**
   * The run's model when Evaluate refused it `illegal-transition` because it is past Draft, with the state it is in
   * (the refusal's `from`, the model's persisted status); null for any other stop. One read of the run, for its
   * `ResultingModelID`. `EvaluateAndPublish` resumes the publish of a `validated` or `keep-baseline` model (§5.7 R2,
   * D4-131, as after a transiently refused publish), and stays silent for a `published` one (D4-133).
   *
   * @throws Error when the run cannot be read
   */
  protected async EvaluatedModelOf(trainingRunId: string, stopped: StoppedEvaluateOutcome, ctx: GateContext): Promise<EvaluatedModel | null> {
    if (stopped.Kind !== 'refused' || stopped.Refusal.kind !== 'illegal-transition') return null;
    const from = stopped.Refusal.from;
    const run = await StoredRuns.Read(trainingRunId, ctx);
    return run?.ResultingModelID ? { ModelID: run.ResultingModelID, From: from } : null;
  }

  /**
   * The run's Evaluate through the gate, as the first step of a publish attempt (`AttemptPurpose: 'publish'`): the gate
   * writes the run-level record of a run with no model row, and the `refusal` record of a model-level refusal (D4-143).
   */
  protected async EvaluateRun(trainingRunId: string, initiator: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    return this.gate.Evaluate({ trainingRunId, AttemptPurpose: 'publish' }, initiator, ctx);
  }

  /** The evaluated model's publish through the gate: purpose `publish`, no sign-off and no reason. */
  protected async PublishEvaluated(modelId: string, initiator: Actor, ctx: GateContext): Promise<PublishOutcome> {
    return this.gate.Publish({ modelId, purpose: 'publish', initiator, signOffId: null, reason: null }, ctx);
  }

  /**
   * Notifies an attempt that stopped at Evaluate: a run-level outcome on the run's pipeline, a model-level refusal as a
   * withheld publish of the run's model. The run-level record itself is the gate's, written inside `Evaluate` (D4-56).
   *
   * @param trainingRunId the evaluated run (a model-level refusal carries no model ID, so its subject is read from the run)
   */
  protected async NotifyStoppedAtEvaluate(trainingRunId: string, result: StoppedEvaluateOutcome, initiator: Actor, ctx: GateContext): Promise<void> {
    await this.notifications.NotifyStoppedAtEvaluate(trainingRunId, result.Refusal, initiator, ctx);
  }

  /** The model's publish, then its notification. */
  private async publishAndNotify(modelId: string, initiator: Actor, ctx: GateContext): Promise<PublishOutcome> {
    const published = await this.PublishEvaluated(modelId, initiator, ctx);
    await this.notifications.Notify(published, initiator, ctx);
    return published;
  }
}
