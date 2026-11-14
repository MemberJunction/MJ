/**
 * @module registry/lifecycle-gate
 *
 * `LifecycleGate` — the only writer of `MJ: ML Models.Status` (§5.1's lifecycle table, §5.2). `Evaluate` moves a Draft
 * model to Validated or KeepBaseline as the run's stored gate decision says, or records a run whose decision shipped no
 * model row (D4-56); `Publish` is the one publish function every publisher calls; `Archive` takes a reason and no
 * sign-off. Each is a short composer over protected steps that a subclass may override and each step is unit-tested on
 * its own. Every read and write runs on `ctx.Provider` as `ctx.ContextUser`, inside one provider transaction holding
 * the pipeline and model locks (pipeline first, D-020); a refused publish rolls that transaction back and records the
 * refusal and the model's `StatusReason` in a second, short one. Every ID comparison goes through `UUIDsEqual`.
 *
 * After a transition commits, the per-model scoring Action is kept in step ({@link LifecycleGate.SyncScoringAction}):
 * generated on a move into `Published`, disabled on a move out of it. It never runs inside the transaction, so it can
 * never roll a publish back; a failure is logged and the registry job's `ResyncScoringActions` step repairs it.
 *
 * **Production construction:** `new LifecycleGate()` — the storage-provider artifact loader, the system clock and the
 * production {@link ModelScoringActionGenerator}. Tests pass an in-memory loader, a fake clock and a recording scoring-
 * Action seam (`new LifecycleGate(loader, clock, scoringActions)`), so the 30 s lock wait runs without waiting. The
 * context is `GateContexts.ForRequest({ ContextUser, Provider })` for M3's seams.
 */
import { LogError } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import {
  GateRules,
  LifecycleStates,
  PublishRules,
  StatusWriteRules,
  type Actor,
  type ArtifactLoad,
  type ListsEveryMember,
  type PersistedModelStatus,
  type PublishReverification,
  type StoredGateRecord,
  type StoredPublishInputs,
  type TransitionRefusal,
} from '@memberjunction/predictive-studio-core';

import { ModelScoringActionGenerator } from '../actions/model-scoring-action-generator';
import { ModelReadiness } from '../scoring/model-readiness';
import { StorageProviderArtifactLoader } from '../scoring/storage-provider-artifact-loader';
import type { IArtifactLoader } from '../scoring/types';
import { TrainerModelLineageReader } from '../training/trainer-model-lineage';
import { ArtifactRegistry } from './artifact-registry';
import type {
  ArtifactCheck, EvaluateOutcome, EvaluateSubject, GateApplyResult, GateContext, LockResult, PublishApprover, PublishCheck, PublishOutcome, PublishRequest,
  ScoringActionSync,
} from './gate-context';
import { GateRefusals } from './gate-refusals';
import { MonitoringJobs } from './monitoring-job';
import { ProviderTransactions } from './provider-transactions';
import { PUBLISH_LOCK_QUERIES, PublishLocks, SYSTEM_CLOCK, type GateClock, type LockAttempt } from './publish-locks';
import { PublishRecords } from './publish-records';
import type { RegistryContext } from './registry-context';
import { StatusWriteAuthorisations } from './status-write-authorisations';
import { StoredPublishInputsLoader, StoredRuns } from './stored-publish-inputs';
import { StoredRowReads } from './stored-row-reads';

/** Thrown by `Publish` for an ID that is not a UUID or names no model: there is no model row to record a refusal against. */
export class LifecycleModelNotFoundError extends Error {
  public readonly Refusal: Extract<TransitionRefusal, { readonly kind: 'model-not-found' }>;
  constructor(public readonly ModelID: string) {
    super(`Predictive Studio lifecycle gate: no ML Model has the ID '${ModelID}'`);
    this.name = 'LifecycleModelNotFoundError';
    this.Refusal = { kind: 'model-not-found', modelId: ModelID };
  }
}

/** One publish attempt inside its transaction: applied (committed), or refused (rolled back, then recorded). */
type PublishAttempt =
  | { readonly Kind: 'applied'; readonly Outcome: Exclude<PublishOutcome, { readonly Kind: 'withheld' }> }
  | {
      readonly Kind: 'refused';
      readonly Refusal: TransitionRefusal;
      readonly Transient: boolean;
      readonly Artifact: ArtifactCheck | null;
      /** The persisted status the refused attempt saw; the refusal's `StatusReason` is written only while it still holds. */
      readonly SeenStatus: MJMLModelEntity['Status'];
    };

/** A passing publish check. */
type PassedCheck = Extract<PublishCheck, { readonly Ok: true }>;

/** The persisted statuses, for checking the status a lock query returned (a lock row is untyped query output). */
const PERSISTED_STATUSES = ['Draft', 'Validated', 'Published', 'Archived', 'KeepBaseline', 'Unevaluated'] as const satisfies readonly PersistedModelStatus[];
/** Compile-time completeness: a status added to `PersistedModelStatus` without listing it here breaks the build. */
const persistedStatusesComplete: ListsEveryMember<PersistedModelStatus, (typeof PERSISTED_STATUSES)[number]> = true;
void persistedStatusesComplete;

/** The lifecycle gate. */
export class LifecycleGate {
  /** The statuses R1's restore moves back to Published: the ones the lifecycle table lets publish (Archived is a rollback). */
  private static readonly RESTORABLE_STATUSES: readonly MJMLModelEntity['Status'][] = ['Validated', 'KeepBaseline'];

  /**
   * @param artifactLoader what `Publish` verifies the artifact through (production: `StorageProviderArtifactLoader`)
   * @param clock what the lock wait reads and sleeps on (production: the system clock)
   * @param scoringActions what keeps the per-model scoring Action in step after a commit (production: {@link ModelScoringActionGenerator})
   */
  constructor(
    private readonly artifactLoader: IArtifactLoader = new StorageProviderArtifactLoader(),
    private readonly clock: GateClock = SYSTEM_CLOCK,
    private readonly scoringActions: ScoringActionSync = new ModelScoringActionGenerator(),
  ) {}

  // ============================================================================================== composers ==

  /**
   * Draft → Validated | KeepBaseline from the run's stored gate decision (`model` → Validated, `keep-simple-baseline`
   * → KeepBaseline with the decision's reason as `StatusReason`). A `{ trainingRunId }` subject is resolved to the run's
   * `ResultingModelID`; a run with no model row (no-signal, or a kept incumbent-heuristic rule) changes no status and gets
   * one run-level refusal record, however often it is evaluated. A model-level refusal writes no record.
   */
  public async Evaluate(subject: EvaluateSubject, actor: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    if ('trainingRunId' in subject) return this.evaluateRun(subject.trainingRunId, actor, ctx);
    return this.evaluateModel(subject.modelId, actor, ctx);
  }

  /**
   * Validated / KeepBaseline → Published (`purpose: 'publish'`) or Archived → Published (`purpose: 'rollback'`), under
   * the pipeline and model locks in one transaction: idempotency first (a retry of an applied run is
   * `already-published`), then the persisted status, the leakage flags, the stored inputs and the publish checks; then
   * the status change with the archive of the replaced model, the `publish` record and the `Pending` monitoring job. A
   * refusal rolls the transaction back, and the refusal record and the model's `StatusReason` are written in a second one.
   * After an applied publish commits, the published model's scoring Action is generated and the replaced model's disabled.
   *
   * @throws LifecycleModelNotFoundError when the ID is not a UUID or names no model
   */
  public async Publish(request: PublishRequest, ctx: GateContext): Promise<PublishOutcome> {
    const model = await this.readModelOrThrow(request.modelId, ctx);
    const attempt = await ProviderTransactions.Run(ctx, `the publish of ML Model ${model.ID}`, () => this.attemptPublish(model, request, ctx), (a) => a.Kind === 'applied');
    if (attempt.Kind === 'refused') return this.recordWithheld(model.ID, request, attempt, ctx);
    if (attempt.Outcome.Kind === 'published') await this.syncAfterPublish(attempt.Outcome, ctx);
    return attempt.Outcome;
  }

  /**
   * Validated, KeepBaseline, Unevaluated or Published → Archived with a reason and no sign-off, flagged or not
   * (F-TR-11): the reason becomes the model's `StatusReason` and its monitoring job is disabled, in one transaction under
   * both locks. `actor` is who archives it: the status change is attributed to `ctx.ContextUser` in Record Changes.
   */
  public async Archive(modelId: string, reason: string, actor: Actor, ctx: GateContext): Promise<GateApplyResult> {
    const why = reason.trim();
    if (why.length === 0) return { Ok: false, Refusal: { kind: 'reason-required' } };
    if (!IsValidUUID(modelId)) return { Ok: false, Refusal: { kind: 'model-not-found', modelId } };
    const model = await this.readModel(modelId, ctx);
    if (model === null) return { Ok: false, Refusal: { kind: 'model-not-found', modelId } };
    const result = await ProviderTransactions.Run(ctx, `the archive of ML Model ${model.ID} by a ${actor.kind}`, () => this.archiveLocked(model, why, actor, ctx), (r) => r.Ok);
    if (result.Ok && result.From === 'Published') await this.syncCommitted(result.ModelID, 'Archived', ctx);
    return result;
  }

  // ========================================================================================= protected steps ==

  /**
   * Takes the pipeline lock, then the model lock, through the two stored Queries on `ctx.Provider` (inside the caller's
   * transaction), each waiting up to 30 s ({@link PublishLocks.Acquire}); the model lock's row is the persisted status.
   * A wait that runs out is `publish-in-progress` (transient); a model row the lock finds absent is `model-not-found`.
   */
  protected async LockPipelineAndModel(pipelineId: string, modelId: string, ctx: GateContext): Promise<LockResult> {
    const started = this.clock.Now();
    const pipeline = await PublishLocks.Acquire(PUBLISH_LOCK_QUERIES.LockPipeline, { PipelineID: pipelineId }, ctx, this.clock);
    if (pipeline.Acquired === false) return this.lockTimedOut('pipeline', pipelineId, modelId, pipeline, started);
    const model = await PublishLocks.Acquire(PUBLISH_LOCK_QUERIES.LockModel, { ModelID: modelId }, ctx, this.clock);
    if (model.Acquired === false) return this.lockTimedOut('model', pipelineId, modelId, model, started);
    const persisted = LifecycleGate.persistedStatusOf(model.Rows[0]?.Status);
    return persisted === null ? { Locked: false, Refusal: { kind: 'model-not-found', modelId } } : { Locked: true, PersistedStatus: persisted };
  }

  /** Logs a lock wait that ran out (which lock, both IDs, the elapsed time and the provider's last message) and refuses `publish-in-progress`. */
  private lockTimedOut(which: 'pipeline' | 'model', pipelineId: string, modelId: string, attempt: Extract<LockAttempt, { readonly Acquired: false }>, started: number): LockResult {
    LogError(
      `Predictive Studio lifecycle gate: the ${which} lock was not acquired for pipeline ${pipelineId}, ML Model ${modelId} after ` +
        `${this.clock.Now() - started} ms (${attempt.Attempts} attempts); refusing publish-in-progress. Last error: ${attempt.LastError}`,
    );
    return { Locked: false, Refusal: { kind: 'publish-in-progress' } };
  }

  /** `illegal-transition` (naming both states, D4-90) unless the §5.1 table has a row from the model's persisted status to `to`. */
  protected CheckPersistedStatus(model: MJMLModelEntity, to: MJMLModelEntity['Status']): TransitionRefusal | null {
    if (StatusWriteRules.IsAuthorisedTransition(model.Status, to)) return null;
    return { kind: 'illegal-transition', from: LifecycleStates.FromPersisted(model.Status), to: LifecycleStates.FromPersisted(to) };
  }

  /**
   * The run's stored leakage flags (`ValidationResults.trainer.leakageFlags`): `unacknowledged-leakage-flags` naming each
   * flag kind, unless the sign-off lookup returns an approving sign-off whose `OverridesFlags` covers every one.
   */
  protected async CheckLeakageFlags(model: MJMLModelEntity, ctx: GateContext): Promise<TransitionRefusal | null> {
    const run = model.TrainingRunID ? await StoredRuns.Read(model.TrainingRunID, ctx) : null;
    const kinds = [...new Set((run?.Trainer?.leakageFlags || []).map((f) => f.kind))];
    if (kinds.length === 0) return null;
    const signOff = await ctx.SignOffLookup.FindApproving(model.ID, 'publish', ctx);
    if (signOff !== null && kinds.every((k) => signOff.OverridesFlags.includes(k))) return null;
    return { kind: 'unacknowledged-leakage-flags', flags: kinds };
  }

  /** The stored publish inputs of the model for this attempt's initiator, or the refusal naming what the stored rows lack. */
  protected async LoadStoredPublishInputs(modelId: string, initiator: Actor, ctx: GateContext): Promise<StoredPublishInputs | TransitionRefusal> {
    return StoredPublishInputsLoader.Load(modelId, initiator, ctx);
  }

  /**
   * Every check of a publish over stored inputs, in order: `PublishRules.ReverifyPublish` (a rollback re-derives with no
   * incumbent and replaces the current Published model); the calibration hold and servability of the old promotion
   * gate (D4-57); the semantics check; the artifact verified inside the transaction (a load that throws is transient, a
   * definite non-verified load is not and records the model's `ArtifactStatus`); the sign-off, only when the pinned
   * protocol sets `requiresHumanSignOff`; then the evidence and who approved.
   */
  protected async CheckPublishable(model: MJMLModelEntity, inputs: StoredPublishInputs, request: PublishRequest, ctx: GateContext): Promise<PublishCheck> {
    const rollback = request.purpose === 'rollback';
    const reverified = PublishRules.ReverifyPublish(rollback ? { ...inputs, CurrentPublishedModelID: null } : inputs);
    if (reverified.Ok === false) return LifecycleGate.refused(LifecycleGate.reverificationRefusal(reverified, inputs));
    const held = this.servingRefusal(model);
    if (held !== null) return LifecycleGate.refused(held);
    const semantics = await ctx.SemanticsCheck.Check(model, ctx);
    if (semantics.Result.Status === 'failed') return LifecycleGate.refused({ kind: 'semantics-check-failed', mismatches: semantics.Result.Mismatches });
    const artifact = await this.verifyArtifact(model, ctx);
    if (artifact !== null) return artifact;
    const signOff = inputs.ProtocolRow.Promotion.requiresHumanSignOff ? await ctx.SignOffLookup.FindApproving(model.ID, request.purpose, ctx) : null;
    if (inputs.ProtocolRow.Promotion.requiresHumanSignOff && signOff === null) return LifecycleGate.refused({ kind: 'no-sign-off' });
    const evidence = await ctx.EvidenceBuilder.Build(model.ID, ctx);
    return {
      Ok: true, Reverified: reverified, Replaces: rollback ? inputs.CurrentPublishedModelID : reverified.Replaces, Evidence: evidence,
      EvidenceSha256: PublishRecords.EvidenceSha256(evidence), SignOff: signOff, Approver: LifecycleGate.approverOf(request.initiator, signOff?.Approver.userId || null),
    };
  }

  /**
   * Writes the status change. When the publish replaces a model, that model is archived FIRST — "Replaced by v<n>,
   * published through the gate" as its reason, its monitoring job disabled — so the pipeline never holds two Published
   * rows (D4-10's `UX_MLModel_OnePublishedPerPipeline`); then `model.Status → to` is authorised by `initiator` for this
   * instance ({@link StatusWriteAuthorisations}, carrying `replaces` so the PreSave status guard re-derives the publish
   * against the archived incumbent's stored comparison), saved, and whatever the save did not take is revoked. Both
   * saves run in the caller's transaction.
   *
   * @param initiator who started the gate call; the guard re-derives a move into `Published` for this initiator
   * @throws Error when a save fails or `replaces` names no model (the caller's transaction rolls everything back)
   */
  protected async ApplyTransition(model: MJMLModelEntity, to: MJMLModelEntity['Status'], replaces: string | null, initiator: Actor, ctx: GateContext): Promise<void> {
    if (replaces !== null) {
      const old = await this.readModel(replaces, ctx);
      if (old === null) throw new Error(`Predictive Studio lifecycle gate: the model ${replaces} this publish replaces does not exist`);
      old.StatusReason = `Replaced by v${model.Version}, published through the gate.`;
      await LifecycleGate.saveAuthorised(old, 'Archived', initiator, null);
      await MonitoringJobs.DisableForModel(old.ID, ctx);
    }
    await LifecycleGate.saveAuthorised(model, to, initiator, replaces);
  }

  /** Writes the `publish` record of an applied publish (the re-derived decision, the evidence and its hash, the approver). */
  protected async WritePublishRecord(model: MJMLModelEntity, request: PublishRequest, check: PassedCheck, ctx: GateContext): Promise<string> {
    return PublishRecords.WritePublish({
      ModelID: model.ID, TrainingRunID: model.TrainingRunID, Purpose: request.purpose, Approver: check.Approver, Initiator: request.initiator,
      Reason: request.reason, GateDecision: check.Reverified.Gate, Evidence: check.Evidence, EvidenceSha256: check.EvidenceSha256,
      SignOffID: check.SignOff?.ID || null, ReplacesModelID: check.Replaces,
    }, ctx);
  }

  /**
   * Writes a `refusal` record. A `{ trainingRunId }` subject writes the run-level row (`ModelID` null, `Purpose = 'evaluate'`;
   * one per run, `UX_MLModelPublishRecord_OneRunOutcome`); a `{ modelId }` subject writes the model's row for `request`,
   * with the model's training run. The approver is the one the attempt would have had.
   *
   * The insert's foreign-key check reads the model row, so it waits while another session holds that row with an
   * exclusive lock (it has written the row and not yet committed). The wait is not bounded: a stored query cannot carry
   * `SET LOCK_TIMEOUT`, and `RunQueryResult` carries no error number (owner flag OF4-12).
   *
   * @throws Error when a `{ modelId }` subject comes with no request (a model-level Evaluate refusal writes no record)
   */
  protected async WriteRefusalRecord(
    subject: EvaluateSubject, initiator: Actor, request: PublishRequest | null, refusal: TransitionRefusal, transient: boolean, ctx: GateContext,
  ): Promise<string> {
    const approver = LifecycleGate.approverOf(initiator, null);
    if ('trainingRunId' in subject) {
      return PublishRecords.WriteRefusal({ ModelID: null, TrainingRunID: subject.trainingRunId, Purpose: 'evaluate', Approver: approver, Initiator: initiator, Refusal: refusal, Transient: transient }, ctx);
    }
    if (request === null) throw new Error('Predictive Studio lifecycle gate: a model-level refusal record needs the publish request it refuses');
    const model = await this.readModel(subject.modelId, ctx);
    return PublishRecords.WriteRefusal({
      ModelID: subject.modelId, TrainingRunID: model?.TrainingRunID || null, Purpose: request.purpose, Approver: approver, Initiator: initiator, Refusal: refusal, Transient: transient,
    }, ctx);
  }

  /**
   * Creates the published model's `Pending` monitoring job from the protocol version row it was evaluated under.
   *
   * @throws Error when the model names no protocol or the protocol row is gone
   */
  protected async CreateMonitoringJob(model: MJMLModelEntity, ctx: GateContext): Promise<string> {
    const protocol = model.EvaluationProtocolID ? await StoredRuns.ReadProtocol(model.EvaluationProtocolID, ctx) : null;
    if (protocol === null) throw new Error(`Predictive Studio lifecycle gate: ML Model ${model.ID} names no Evaluation Protocol row to build its monitoring job from`);
    return MonitoringJobs.CreatePending(model, protocol.Spec, ctx);
  }

  /**
   * Keeps the per-model scoring Action in step with a committed transition: `GenerateForModel` on a move into
   * `Published`, `DisableForModel` on a move out of it (the rule PR 3's promote path applied, found by the Action's `ModelID`
   * param). Called only after the transaction commits; a failure is logged with `LogError` naming the model and leaves
   * the transition applied (the registry job's `ResyncScoringActions` step repairs the Action on its next run).
   *
   * @param model the committed model row
   * @param to the status the committed transition moved it to
   */
  protected async SyncScoringAction(model: MJMLModelEntity, to: MJMLModelEntity['Status'], ctx: GateContext): Promise<void> {
    try {
      if (to === 'Published') await this.scoringActions.GenerateForModel(model, ctx.ContextUser, ctx.Provider);
      else await this.scoringActions.DisableForModel(model, ctx.ContextUser, ctx.Provider);
    } catch (error) {
      LogError(
        `Predictive Studio lifecycle gate: the scoring Action sync of ML Model ${model.ID} (→ ${to}) failed after the transition committed; ` +
          `the transition stands and the registry job resyncs the Action: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ================================================================================================ private ==

  /** After a committed publish: the published model's Action generated, then the replaced model's disabled. */
  private async syncAfterPublish(outcome: Extract<PublishOutcome, { readonly Kind: 'published' }>, ctx: GateContext): Promise<void> {
    await this.syncCommitted(outcome.ModelID, 'Published', ctx);
    if (outcome.Replaces !== null) await this.syncCommitted(outcome.Replaces, 'Archived', ctx);
  }

  /** Re-reads the committed model row and syncs its scoring Action; a failed read is logged like a failed sync. */
  private async syncCommitted(modelId: string, to: MJMLModelEntity['Status'], ctx: GateContext): Promise<void> {
    let model: MJMLModelEntity | null;
    try {
      model = await this.readModel(modelId, ctx);
    } catch (error) {
      LogError(`Predictive Studio lifecycle gate: ML Model ${modelId} could not be re-read to sync its scoring Action (→ ${to}): ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (model === null) {
      LogError(`Predictive Studio lifecycle gate: ML Model ${modelId} was not found after its transition committed; its scoring Action is not synced (→ ${to}).`);
      return;
    }
    await this.SyncScoringAction(model, to, ctx);
  }

  /**
   * One publish attempt under both locks; refusals return before anything is written. Idempotency first (R1, D4-92 M1):
   * a model that is Published now with an applied `publish` record for its run (or, for a rollback, with its own
   * `rollback` record) is `already-published`; a model with a `publish` record for its run whose status was changed
   * outside the gate to Validated or KeepBaseline is restored ({@link restorePublish}); a model that was published and
   * later archived is not re-published by a retry (that is a rollback, so `checkPurpose` refuses it).
   */
  private async attemptPublish(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<PublishAttempt> {
    const lock = await this.LockPipelineAndModel(model.PipelineID, model.ID, ctx);
    if (lock.Locked === false) return LifecycleGate.refusedAttempt(lock.Refusal, lock.Refusal.kind === 'publish-in-progress', null, model.Status);
    const locked = await this.readModel(model.ID, ctx);
    if (locked === null) return LifecycleGate.refusedAttempt({ kind: 'model-not-found', modelId: model.ID }, false, null, model.Status);
    const prior = await this.findAppliedPublish(locked, request, ctx);
    if (prior !== null && locked.Status === 'Published') return { Kind: 'applied', Outcome: { Kind: 'already-published', ModelID: locked.ID, PublishRecordID: prior.ID } };
    if (prior !== null && request.purpose === 'publish' && LifecycleGate.RESTORABLE_STATUSES.some((s) => s === locked.Status)) {
      return this.restorePublish(locked, request, prior.ID, ctx);
    }
    const before = this.CheckPersistedStatus(locked, 'Published') || (await this.checkPurpose(locked, request, ctx)) || (await this.CheckLeakageFlags(locked, ctx));
    if (before !== null) return LifecycleGate.refusedAttempt(before, false, null, locked.Status);
    const checked = await this.checkFromStoredRows(locked, request, ctx);
    if (checked.Ok === false) return LifecycleGate.refusedAttempt(checked.Refusal, checked.Transient, checked.Artifact, locked.Status);
    return { Kind: 'applied', Outcome: await this.applyPublish(locked, request, checked, ctx) };
  }

  /** The stored inputs and every publish check over them. */
  private async checkFromStoredRows(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<PublishCheck> {
    const inputs = await this.LoadStoredPublishInputs(model.ID, request.initiator, ctx);
    if (LifecycleGate.isRefusal(inputs)) return LifecycleGate.refused(inputs);
    return this.CheckPublishable(model, inputs, request, ctx);
  }

  /**
   * The applied publish a retry of `request` would repeat: the run's `publish` (or `adopt`) record for a publish
   * (`UX_MLModelPublishRecord_OnePublishPerRun`), the model's newest `rollback` record for a rollback; null for none.
   */
  private async findAppliedPublish(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<{ readonly ID: string } | null> {
    if (request.purpose === 'rollback') return PublishRecords.FindLatestApplied(model.ID, 'rollback', ctx);
    return model.TrainingRunID ? PublishRecords.FindPublishForRun(model.TrainingRunID, ctx) : null;
  }

  /**
   * R1's restore (§5.7): a model whose run holds a `publish` record but whose status was changed outside the gate. The
   * full checks run again under the locks, and `Published` is written with no second `publish` record; the outcome
   * names the run's existing record. The model's monitoring job is created only when it has no open one.
   */
  private async restorePublish(model: MJMLModelEntity, request: PublishRequest, recordId: string, ctx: GateContext): Promise<PublishAttempt> {
    const leakage = await this.CheckLeakageFlags(model, ctx);
    if (leakage !== null) return LifecycleGate.refusedAttempt(leakage, false, null, model.Status);
    const checked = await this.checkFromStoredRows(model, request, ctx);
    if (checked.Ok === false) return LifecycleGate.refusedAttempt(checked.Refusal, checked.Transient, checked.Artifact, model.Status);
    model.StatusReason = null;
    model.ArtifactStatus = 'verified';
    model.ArtifactCheckedAt = new Date();
    await this.ApplyTransition(model, 'Published', checked.Replaces, request.initiator, ctx);
    if ((await MonitoringJobs.OpenJobCount(model.ID, ctx)) === 0) await this.CreateMonitoringJob(model, ctx);
    return { Kind: 'applied', Outcome: { Kind: 'published', ModelID: model.ID, PublishRecordID: recordId, Replaces: checked.Replaces, Approver: checked.Approver.Kind } };
  }

  /** The writes of a passing publish, in the publish transaction. */
  private async applyPublish(model: MJMLModelEntity, request: PublishRequest, check: PassedCheck, ctx: GateContext): Promise<Extract<PublishOutcome, { readonly Kind: 'published' }>> {
    model.StatusReason = null;
    model.ArtifactStatus = 'verified';
    model.ArtifactCheckedAt = new Date();
    await this.ApplyTransition(model, 'Published', check.Replaces, request.initiator, ctx);
    const recordId = await this.WritePublishRecord(model, request, check, ctx);
    await this.CreateMonitoringJob(model, ctx);
    return { Kind: 'published', ModelID: model.ID, PublishRecordID: recordId, Replaces: check.Replaces, Approver: check.Approver.Kind };
  }

  /**
   * The refusal path's own short transaction. The model lock is tried ONCE with the NOWAIT stored query, so taking it
   * never waits. When it is held, only the refusal record is written (the model is someone else's to change right now)
   * and the reason is logged. When it is taken, the persisted status is the one the lock read, and the model's
   * `StatusReason` (and a definite artifact state) is written only while that status is still the one the refused
   * attempt saw, so a refusal never stamps "withheld" on a model another publish just changed.
   *
   * One wait is NOT bounded: when another session has already written the model row (it holds an exclusive lock, not
   * just the update lock the publish locks take), the refusal record's insert checks its foreign key to that row and
   * waits until that session commits or rolls back. A stored query cannot bound that wait: it may not carry
   * `SET LOCK_TIMEOUT` (one statement per stored query, D4-91), and a lock-timeout failure would come back from
   * `RunQuery` as text only, because `RunQueryResult` carries no error number. This is owner flag OF4-12.
   */
  private async recordWithheld(modelId: string, request: PublishRequest, refused: Extract<PublishAttempt, { readonly Kind: 'refused' }>, ctx: GateContext): Promise<PublishOutcome> {
    return ProviderTransactions.Run(ctx, `the refusal record of ML Model ${modelId}`, async () => {
      const lock = await PublishLocks.RunStored(PUBLISH_LOCK_QUERIES.LockModel, { ModelID: modelId }, ctx);
      const persisted = lock.Success ? LifecycleGate.persistedStatusOf(lock.Results[0]?.Status) : null;
      if (lock.Success === false) {
        LogError(`Predictive Studio lifecycle gate: the model lock of ML Model ${modelId} is held, so the ${refused.Refusal.kind} refusal is recorded without its StatusReason; last error: ${lock.ErrorMessage || 'unknown error'}`);
      } else if (persisted === refused.SeenStatus) {
        await this.saveWithheldReason(modelId, request, refused, ctx);
      }
      const recordId = await this.WriteRefusalRecord({ modelId }, request.initiator, request, refused.Refusal, refused.Transient, ctx);
      const withheld: PublishOutcome = {
        Kind: 'withheld', ModelID: modelId, Status: persisted || refused.SeenStatus, Refusal: refused.Refusal, Transient: refused.Transient, RefusalRecordID: recordId,
      };
      return withheld;
    });
  }

  /** The model's `StatusReason` in plain words (and a definite artifact state), saved under the model lock. */
  private async saveWithheldReason(modelId: string, request: PublishRequest, refused: Extract<PublishAttempt, { readonly Kind: 'refused' }>, ctx: GateContext): Promise<void> {
    const model = await this.readModel(modelId, ctx);
    if (model === null) throw new LifecycleModelNotFoundError(modelId);
    model.StatusReason = GateRefusals.WithheldStatusReason(refused.Refusal, request.initiator);
    if (refused.Artifact !== null) {
      model.ArtifactStatus = refused.Artifact.Status;
      model.ArtifactCheckedAt = refused.Artifact.CheckedAt;
    }
    if (!(await model.Save())) throw new Error(`Saving the StatusReason of ML Model ${modelId} failed: ${model.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /** A model-subject Evaluate: no record is written for a refusal. */
  private async evaluateModel(modelId: string, actor: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    if (!IsValidUUID(modelId)) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId } };
    const model = await this.readModel(modelId, ctx);
    if (model === null) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId } };
    const draft = this.CheckPersistedStatus(model, 'Validated');
    if (draft !== null) return { Kind: 'refused', Refusal: draft };
    const run = model.TrainingRunID ? await StoredRuns.Read(model.TrainingRunID, ctx) : null;
    if (run === null || run.Gate === null) return { Kind: 'refused', Refusal: { kind: 'not-servable', reason: `ML Model ${model.ID} has no stored gate decision to evaluate` } };
    const target = LifecycleGate.evaluationTarget(run.Gate);
    if (target === null) return { Kind: 'refused', Refusal: { kind: 'gate-no-signal', reason: run.Gate.reason.text } };
    const hold = target === 'Validated' ? TrainerModelLineageReader.CalibrationHoldOf(model.Lineage) : null;
    if (hold !== null) return { Kind: 'refused', Refusal: { kind: 'calibration-held', slope: hold.slope } };
    return ProviderTransactions.Run(ctx, `the evaluation of ML Model ${model.ID}`, () => this.evaluateLocked(model, target, run.Gate.reason.text, actor, ctx), (o) => o.Kind === 'evaluated');
  }

  /** Evaluate's status change under both locks, re-checking the status the lock read. */
  private async evaluateLocked(
    model: MJMLModelEntity, to: Extract<MJMLModelEntity['Status'], 'Validated' | 'KeepBaseline'>, reason: string, actor: Actor, ctx: GateContext,
  ): Promise<EvaluateOutcome> {
    const lock = await this.LockPipelineAndModel(model.PipelineID, model.ID, ctx);
    if (lock.Locked === false) return { Kind: 'refused', Refusal: lock.Refusal };
    const locked = await this.readModel(model.ID, ctx);
    if (locked === null) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: model.ID } };
    const status = this.CheckPersistedStatus(locked, to);
    if (status !== null) return { Kind: 'refused', Refusal: status };
    locked.StatusReason = reason;
    await this.ApplyTransition(locked, to, null, actor, ctx);
    return { Kind: 'evaluated', ModelID: locked.ID, From: 'Draft', To: to };
  }

  /** A run-subject Evaluate: the run's model when it has one, else the one run-level record of its outcome. */
  private async evaluateRun(trainingRunId: string, actor: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    if (!IsValidUUID(trainingRunId)) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: trainingRunId } };
    const run = await StoredRuns.Read(trainingRunId, ctx);
    if (run === null) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: trainingRunId } };
    if (run.ResultingModelID) return this.evaluateModel(run.ResultingModelID, actor, ctx);
    if (run.Gate === null) return { Kind: 'refused', Refusal: { kind: 'not-servable', reason: `ML Training Run ${trainingRunId} has no stored gate decision` } };
    const refusal = LifecycleGate.runLevelRefusal(run.Gate);
    if (refusal === null) return { Kind: 'refused', Refusal: { kind: 'not-servable', reason: `ML Training Run ${trainingRunId}'s decision ships a model, but the run has no model row` } };
    const existing = await PublishRecords.FindRunOutcome(trainingRunId, ctx);
    if (existing !== null) return { Kind: 'run-recorded', TrainingRunID: trainingRunId, Refusal: refusal, RefusalRecordID: existing.ID };
    return { Kind: 'run-recorded', TrainingRunID: trainingRunId, Refusal: refusal, RefusalRecordID: await this.writeRunOutcome(trainingRunId, actor, refusal, ctx) };
  }

  /**
   * Writes the run's one run-level record. Two evaluations of one run can both find none and both insert; the loser's
   * insert is refused by `UX_MLModelPublishRecord_OneRunOutcome`, so a failed write re-reads the run's outcome and
   * returns the winner's record, and rethrows only when there is still none.
   */
  private async writeRunOutcome(trainingRunId: string, actor: Actor, refusal: TransitionRefusal, ctx: GateContext): Promise<string> {
    try {
      return await ProviderTransactions.Run(ctx, `the run-level record of ML Training Run ${trainingRunId}`, () => this.WriteRefusalRecord({ trainingRunId }, actor, null, refusal, false, ctx));
    } catch (error) {
      const winner = await PublishRecords.FindRunOutcome(trainingRunId, ctx);
      if (winner !== null) return winner.ID;
      throw error;
    }
  }

  /** Archive's status change under both locks. */
  private async archiveLocked(model: MJMLModelEntity, reason: string, actor: Actor, ctx: GateContext): Promise<GateApplyResult> {
    const lock = await this.LockPipelineAndModel(model.PipelineID, model.ID, ctx);
    if (lock.Locked === false) return { Ok: false, Refusal: lock.Refusal };
    const locked = await this.readModel(model.ID, ctx);
    if (locked === null) return { Ok: false, Refusal: { kind: 'model-not-found', modelId: model.ID } };
    const status = this.CheckPersistedStatus(locked, 'Archived');
    if (status !== null) return { Ok: false, Refusal: status };
    const from = locked.Status;
    locked.StatusReason = reason;
    await this.ApplyTransition(locked, 'Archived', null, actor, ctx);
    await MonitoringJobs.DisableForModel(locked.ID, ctx);
    return { Ok: true, ModelID: locked.ID, From: from, To: 'Archived', Archived: null };
  }

  /** The purpose's own rules: a rollback restores an Archived model that was published before, and needs a reason. */
  private async checkPurpose(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<TransitionRefusal | null> {
    const illegal: TransitionRefusal = { kind: 'illegal-transition', from: LifecycleStates.FromPersisted(model.Status), to: 'published' };
    if (request.purpose === 'publish') return model.Status === 'Archived' ? illegal : null;
    if (!request.reason || request.reason.trim().length === 0) return { kind: 'reason-required' };
    if (model.Status !== 'Archived') return illegal;
    const published = model.TrainingRunID ? await PublishRecords.FindPublishForRun(model.TrainingRunID, ctx) : null;
    return published === null ? illegal : null;
  }

  /** The two holds PR 3's promote path applied (D4-57): a calibration-held finalist, and an artifact `/predict` does not serve. */
  private servingRefusal(model: MJMLModelEntity): TransitionRefusal | null {
    const hold = TrainerModelLineageReader.CalibrationHoldOf(model.Lineage);
    if (hold !== null) return { kind: 'calibration-held', slope: hold.slope };
    if (!model.ArtifactFileID) return { kind: 'not-servable', reason: `ML Model ${model.ID} has no artifact file` };
    if (!ModelReadiness.IsServedByPredict(model)) return { kind: 'not-servable', reason: ModelReadiness.NotServedByPredictMessage(model.ID) };
    return null;
  }

  /** The artifact verified now, inside the transaction; null when verified, else the refusal. */
  private async verifyArtifact(model: MJMLModelEntity, ctx: GateContext): Promise<PublishCheck | null> {
    let load: ArtifactLoad;
    try {
      load = await ArtifactRegistry.ForContext(ctx, this.artifactLoader).Load(model, ctx);
    } catch (error) {
      const detail = `storage could not be read: ${error instanceof Error ? error.message : String(error)}`;
      return { Ok: false, Refusal: { kind: 'artifact-unverifiable', detail }, Transient: true, Artifact: null };
    }
    if (load.Status === 'verified') return null;
    const detail =
      load.Status === 'missing' ? `the artifact file ${load.FileID} is missing`
        : load.Status === 'hash-mismatch' ? `the stored bytes hash to ${load.Actual}, not the registered ${load.Expected}`
          : `ML Model ${load.ModelID} has no registered artifact hash`;
    return { Ok: false, Refusal: { kind: 'artifact-unverifiable', detail }, Transient: false, Artifact: { Status: ArtifactRegistry.ArtifactStatusOf(load), CheckedAt: new Date() } };
  }

  /** The model row as an entity object (it is saved), or null. */
  private async readModel(modelId: string, ctx: RegistryContext): Promise<MJMLModelEntity | null> {
    const r = await StoredRowReads.Run<MJMLModelEntity>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, MaxRows: 1, ResultType: 'entity_object' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const model = r.Results[0] || null;
    return model !== null && UUIDsEqual(model.ID, modelId) ? model : null;
  }

  private async readModelOrThrow(modelId: string, ctx: RegistryContext): Promise<MJMLModelEntity> {
    if (!IsValidUUID(modelId)) throw new LifecycleModelNotFoundError(modelId);
    const model = await this.readModel(modelId, ctx);
    if (model === null) throw new LifecycleModelNotFoundError(modelId);
    return model;
  }

  /** A status a lock query returned (untyped query output) as a persisted status; null for none or an unknown value. */
  private static persistedStatusOf(value: string | number | null | undefined): PersistedModelStatus | null {
    return PERSISTED_STATUSES.find((s) => s === value) || null;
  }

  /** Saves a status change the gate authorised for exactly this instance; the authorisation never outlives the save. */
  private static async saveAuthorised(model: MJMLModelEntity, to: MJMLModelEntity['Status'], initiator: Actor, replaces: string | null): Promise<void> {
    const from = model.Status;
    if (!StatusWriteRules.IsAuthorisedTransition(from, to)) throw new Error(`Predictive Studio lifecycle gate: ${from} → ${to} is not in the lifecycle table`);
    StatusWriteAuthorisations.Instance.Authorise(model, { From: from, To: to, Initiator: initiator, Replaces: replaces });
    try {
      model.Status = to;
      if (!(await model.Save())) throw new Error(`Saving ML Model ${model.ID} as ${to} failed: ${model.LatestResult?.CompleteMessage || 'unknown error'}`);
    } finally {
      StatusWriteAuthorisations.Instance.Revoke(model);
    }
  }

  /** The status the stored decision picks for a model row: Validated for `model`, KeepBaseline for `keep-simple-baseline`. */
  private static evaluationTarget(gate: StoredGateRecord): Extract<MJMLModelEntity['Status'], 'Validated' | 'KeepBaseline'> | null {
    if (gate.decision.outcome === 'model') return 'Validated';
    return gate.decision.outcome === 'keep-simple-baseline' ? 'KeepBaseline' : null;
  }

  /** The run-level refusal of a decision that shipped no model row; null for a decision that ships one. */
  private static runLevelRefusal(gate: StoredGateRecord): Extract<TransitionRefusal, { readonly kind: 'gate-no-signal' | 'kept-existing-rule' }> | null {
    const d = gate.decision;
    if (d.outcome === 'no-signal') return { kind: 'gate-no-signal', reason: gate.reason.text };
    if (d.outcome === 'keep-simple-baseline' && d.shipped.startsWith(GateRules.HeuristicPrefix)) {
      return { kind: 'kept-existing-rule', rule: d.shipped.slice(GateRules.HeuristicPrefix.length) };
    }
    return null;
  }

  /**
   * The gate refusal of a failed re-verification: its own kind where the contract has one (`gate-no-signal`,
   * `keep-baseline-not-auto-published`, `does-not-beat-incumbent`, `incumbent-not-current`: the run was compared with a
   * model that is no longer the Published one, §5.7 R2); a stored-data inconsistency (protocol or delivery mismatch, no
   * stored comparison) is `not-servable`, naming the reason and detail — for a missing comparison, the Published model
   * the run was never compared with.
   */
  private static reverificationRefusal(r: Extract<PublishReverification, { readonly Ok: false }>, inputs: StoredPublishInputs): TransitionRefusal {
    switch (r.Reason) {
      case 'gate-no-signal':
        return { kind: 'gate-no-signal', reason: r.Detail };
      case 'keep-baseline-not-auto-published':
        return { kind: 'keep-baseline-not-auto-published' };
      case 'does-not-beat-incumbent':
      case 'incumbent-not-current': {
        // ReverifyPublish reaches both reasons only with a stored diff and a current Published model.
        const diff = inputs.IncumbentDiff;
        const current = inputs.CurrentPublishedModelID;
        if (diff === null || current === null) return { kind: 'not-servable', reason: `publish re-verification refused (${r.Reason}) with no stored comparison: ${r.Detail}` };
        if (r.Reason === 'incumbent-not-current') return { kind: 'incumbent-not-current', comparedWith: diff.incumbentModelId, current };
        return { kind: 'does-not-beat-incumbent', incumbentModelId: diff.incumbentModelId, comparison: { value: diff.value, ci: [diff.lower, diff.upper], beats: false } };
      }
      case 'incumbent-diff-missing':
        // The run compared with nothing while a model is Published (one set Published outside the gate, or published
        // after the run trained): the refusal names that model, so the record says which row the publish would replace.
        return inputs.CurrentPublishedModelID === null
          ? { kind: 'not-servable', reason: `publish re-verification refused (${r.Reason}): ${r.Detail}` }
          : { kind: 'not-servable', reason: `the training run stored no comparison with ML Model ${inputs.CurrentPublishedModelID}, which is Published now; retrain to compare with it` };
      default:
        return { kind: 'not-servable', reason: `publish re-verification refused (${r.Reason}): ${r.Detail}` };
    }
  }

  /** The approver of an attempt: the interactive user, else the sign-off's approver, else the gate itself. */
  private static approverOf(initiator: Actor, signOffUserId: string | null): PublishApprover {
    if (initiator.kind === 'human') return { Kind: 'user', UserID: initiator.userId };
    return signOffUserId !== null ? { Kind: 'user', UserID: signOffUserId } : { Kind: 'automated-gate' };
  }

  private static refused(refusal: TransitionRefusal): PublishCheck {
    return { Ok: false, Refusal: refusal, Transient: false, Artifact: null };
  }

  private static refusedAttempt(refusal: TransitionRefusal, transient: boolean, artifact: ArtifactCheck | null, seen: MJMLModelEntity['Status']): PublishAttempt {
    return { Kind: 'refused', Refusal: refusal, Transient: transient, Artifact: artifact, SeenStatus: seen };
  }

  private static isRefusal(x: StoredPublishInputs | TransitionRefusal): x is TransitionRefusal {
    return 'kind' in x;
  }
}
