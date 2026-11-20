/**
 * @module registry/lifecycle-gate
 *
 * `LifecycleGate` — the only writer of `MJ: ML Models.Status` (§5.1's lifecycle table, §5.2). `Evaluate` moves a Draft
 * model to Validated or KeepBaseline as the run's stored gate decision says, or records a run whose decision shipped no
 * model row (D4-56); `Publish` is the one publish function every publisher calls (it also archives a pre-change model
 * serving the pipeline while Unevaluated); `Archive` takes a reason and no sign-off; `AdoptPublished` re-verifies a
 * pre-change Published model on its stored gate record for the Registry Check job alone (§5.6 step 2, D4-61). Each is a short composer over protected steps that a subclass may override and each step is unit-tested on
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
 * context is `GateContexts.ForRequest({ ContextUser, Provider })` for the production seams.
 */
import { LogError, WellKnownUserSource } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLOutputBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import {
  GateRules,
  LifecycleStates,
  PublishRules,
  RegistrySchemas,
  SemanticsRules,
  StatusWriteRules,
  type Actor,
  type ArtifactLoad,
  type ListsEveryMember,
  type OutputSemantics,
  type PersistedModelStatus,
  type PublishReverification,
  type SignOff,
  type StoredGateRecord,
  type StoredPublishInputs,
  type TransitionRefusal,
} from '@memberjunction/predictive-studio-core';

import { ModelScoringActionGenerator } from '../actions/model-scoring-action-generator';
import { SemanticsChecker } from '../governance/semantics-checker';
import { ModelReadiness } from '../scoring/model-readiness';
import { StorageProviderArtifactLoader } from '../scoring/storage-provider-artifact-loader';
import type { IArtifactLoader } from '../scoring/types';
import { TrainerModelLineageReader } from '../training/trainer-model-lineage';
import { ArtifactRegistry } from './artifact-registry';
import type {
  AdoptOptions, AdoptOutcome, AppliedPublishPurpose, ArtifactCheck, EvaluateAttempt, EvaluateOutcome, EvaluateSubject, GateApplyResult, GateContext, LockResult, PublishApprover, PublishCheck, PublishOutcome, PublishRequest,
  RefusalWriteIdentity, ScoringActionSync,
} from './gate-context';
import { GateRefusals } from './gate-refusals';
import { MonitoringJobs } from './monitoring-job';
import { ProviderTransactions } from './provider-transactions';
import { PUBLISH_LOCK_QUERIES, PublishLocks, SYSTEM_CLOCK, type GateClock, type LockAttempt } from './publish-locks';
import { PublishRecords } from './publish-records';
import { RegistryCheckInitiators } from './registry-check-initiators';
import type { RegistryContext } from './registry-context';
import { StatusWriteAuthorisations } from './status-write-authorisations';
import { StoredPublishInputsLoader, StoredRuns } from './stored-publish-inputs';
import { StoredRowReads } from './stored-row-reads';

/** Thrown by `Publish` for an ID that is not a UUID or names no model: there is no model row to record a refusal against. */
export class LifecycleModelNotFoundError extends Error {
  /** The refusal the error stands for, naming the ID. */
  public readonly Refusal: Extract<TransitionRefusal, { readonly kind: 'model-not-found' }>;
  /** @param ModelID the ID that is not a UUID or names no ML Model */
  constructor(public readonly ModelID: string) {
    super(`Predictive Studio lifecycle gate: no ML Model has the ID '${ModelID}'`);
    this.name = 'LifecycleModelNotFoundError';
    this.Refusal = { kind: 'model-not-found', modelId: ModelID };
  }
}

/** One publish attempt inside its transaction: applied (committed), or refused (rolled back, then recorded). */
type PublishAttempt =
  | {
      readonly Kind: 'applied';
      readonly Outcome: Exclude<PublishOutcome, { readonly Kind: 'withheld' }>;
      /** The pipeline's pre-change models the publish archived because they were serving it while Unevaluated (§5.1). */
      readonly RetiredServing: readonly string[];
    }
  | {
      readonly Kind: 'refused';
      readonly Refusal: TransitionRefusal;
      readonly Transient: boolean;
      readonly Artifact: ArtifactCheck | null;
      /** The persisted status the refused attempt saw; the refusal's `StatusReason` is written only while it still holds. */
      readonly SeenStatus: MJMLModelEntity['Status'];
      /**
       * True when the caller was refused for a missing grant ({@link LifecycleGate.CheckContextUserMayPublish}): the
       * refusal's audit is then written with the gate's write identity, since the caller may not write it (D4-134, F6).
       */
      readonly MissingGrant: boolean;
    };

/** One model-level Evaluate: evaluated (committed), or refused (rolled back) with what recording the refusal needs. */
type EvaluateAttemptResult =
  | { readonly Kind: 'evaluated'; readonly Outcome: Extract<EvaluateOutcome, { readonly Kind: 'evaluated' }> }
  | {
      readonly Kind: 'refused';
      readonly Refusal: TransitionRefusal;
      /** True for `publish-in-progress`: a retry may succeed. */
      readonly Transient: boolean;
      /** True when the caller lacks a grant Evaluate writes with ({@link LifecycleGate.EVALUATE_WRITES}): the record is written with the gate's identity (D4-134). */
      readonly MissingGrant: boolean;
    };

/** One adoption inside its transaction: applied or found applied (committed), or refused (rolled back) and whether to demote. */
type AdoptAttempt =
  | Extract<AdoptOutcome, { readonly Kind: 'adopted' | 'already-adopted' }>
  | {
      readonly Kind: 'refused';
      readonly Refusal: TransitionRefusal;
      readonly Transient: boolean;
      /** True when the stored record did not re-verify (the model is then demoted); false when nothing may change. */
      readonly Demote: boolean;
    };

/** One demotion inside its transaction: recorded (committed), or refused with nothing written (rolled back). */
type DemotionAttempt = { readonly Kind: 'recorded'; readonly RecordID: string } | { readonly Kind: 'refused'; readonly Refusal: TransitionRefusal };

/** A refusal of {@link LifecycleGate.CheckInitiator}, and whether it was for a missing grant (case (a)). */
export interface InitiatorRefusal {
  /** The `actor-not-permitted` refusal. */
  readonly Refusal: TransitionRefusal;
  /** True for case (a), a grant the publish writes with is missing: the refusal is written with the gate's write identity. */
  readonly MissingGrant: boolean;
}

/** One permission a gate path writes with as the caller: the entity, and the grant the write needs. */
export interface GateWritePermission {
  /** The entity the path saves a row of. */
  readonly EntityName: 'MJ: ML Models' | 'MJ: ML Output Bindings' | 'MJ: ML Model Publish Records' | 'MJ: Scheduled Jobs';
  /** `CanCreate` for a new row, `CanUpdate` for a saved one. */
  readonly Need: 'CanCreate' | 'CanUpdate';
}

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
   * one run-level refusal record, however often it is evaluated (written with the gate's write identity for a caller
   * who may not create it, D4-134). A caller without the permissions the status change writes with (`CanUpdate` on
   * `MJ: ML Models`, `CanCreate` on `MJ: ML Output Bindings`) is refused `actor-not-permitted` before it.
   *
   * **A model-level refusal is recorded only inside a publish attempt (D4-143).** When `subject.AttemptPurpose` is set
   * (only `AutomatedPublisher.EvaluateAndPublish` sets it), a `not-servable`, `gate-no-signal`, `calibration-held`,
   * `actor-not-permitted` or (transient) `publish-in-progress` refusal is recorded as a withheld publish is
   * ({@link recordWithheld}: one `refusal` record with `Purpose` the attempt's purpose, the model and its run, the
   * caller's actor as initiator, and the model's `StatusReason`; the gate's write identity only for a missing grant),
   * after Evaluate's transaction rolled back. `illegal-transition` (a resume's or a served model's re-run signal,
   * D4-131/D4-133) and `model-not-found` are never recorded. A bare Evaluate records no model-level refusal. A model whose
   * `OutputSemantics` does not parse (empty or malformed) is refused `not-servable` before its status is written, so it
   * stays Draft (D4-129). An applied evaluation also creates the model's missing output bindings from its semantics
   * ({@link CreateOutputBindings}), in the same transaction; a refused one creates none. A publish, rollback or restore fills them again before its
   * semantics check (D4-112), so a model past Draft with none is never refused for rows only derived truth would hold.
   */
  public async Evaluate(subject: EvaluateSubject, actor: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    if ('trainingRunId' in subject) return this.evaluateRun(subject.trainingRunId, actor, ctx, subject.AttemptPurpose);
    return this.evaluateModel(subject.modelId, actor, ctx, subject.AttemptPurpose);
  }

  /**
   * Validated / KeepBaseline → Published (`purpose: 'publish'`) or Archived → Published (`purpose: 'rollback'`), under
   * the pipeline and model locks in one transaction: who started it first ({@link CheckInitiator}, before the locks),
   * then idempotency (a retry of an applied run is `already-published`), then the persisted status, the stored inputs, the leakage flags and the publish checks; then
   * the status change with the archive of the replaced model, the `publish` record and the `Active` monitoring job. A
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
    for (const retired of attempt.RetiredServing) await this.syncCommitted(retired, 'Archived', ctx);
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

  /**
   * Re-verifies a pre-change Published model on its stored gate record (§5.6 step 2, D4-61) with no status change:
   * who started it first ({@link CheckAdoptInitiator}: only a Registry Check job run, R9), then under both locks in one
   * transaction the back-fill `options` names, then the checks of a publish over the stored rows (the re-derived
   * decision, the leakage flags, the servability holds, the semantics check, a verified artifact, the protocol's
   * sign-off rule). A pass writes one `publish` record with `Purpose = 'adopt'` and the model's monitoring job when it
   * has none; anything but a pass rolls the attempt back and, unless it was transient, demotes the model
   * ({@link DemoteAdoption}): `Published → Unevaluated`, not serving, the refusal as its `StatusReason`, a `refusal`
   * record, then §5.7 R7 (a)'s rollback of the pipeline's incumbent ({@link RollBackToIncumbent}). A retry of an
   * applied adoption is `already-adopted`. The scoring Action follows the committed status.
   *
   * @throws LifecycleModelNotFoundError when the ID is not a UUID or names no model
   */
  public async AdoptPublished(modelId: string, initiator: Actor, ctx: GateContext, options: AdoptOptions = {}): Promise<AdoptOutcome> {
    const model = await this.readModelOrThrow(modelId, ctx);
    const refused = await this.CheckAdoptInitiator(initiator, ctx);
    if (refused !== null) return { Kind: 'refused', ModelID: model.ID, Refusal: refused, Transient: false };
    const request: PublishRequest = { modelId: model.ID, purpose: 'publish', initiator, signOffId: null, reason: LifecycleGate.ADOPT_REASON };
    const attempt = await ProviderTransactions.Run(ctx, `the adoption of ML Model ${model.ID}`, () => this.attemptAdopt(model, request, ctx, options), (a) => a.Kind !== 'refused');
    if (attempt.Kind === 'adopted') await this.syncCommitted(model.ID, 'Published', ctx);
    if (attempt.Kind !== 'refused') return attempt;
    if (!attempt.Demote) return { Kind: 'refused', ModelID: model.ID, Refusal: attempt.Refusal, Transient: attempt.Transient };
    return this.DemoteAdoption(model, request, attempt.Refusal, ctx);
  }

  // ========================================================================================= protected steps ==

  /**
   * Who may adopt (and so demote) a Published model: `actor-not-permitted` naming the initiator's kind unless
   * `ctx.ContextUser` holds every permission the adoption writes with ({@link PUBLISH_WRITES}) and the initiator is a run
   * of a Registry Check job ({@link RegistryCheckInitiators.RefusalOf}, R9). Checked before any lock or write.
   */
  protected async CheckAdoptInitiator(initiator: Actor, ctx: GateContext): Promise<TransitionRefusal | null> {
    const permitted = this.CheckContextUserMayPublish(initiator, ctx);
    if (permitted !== null) return permitted;
    const why = await RegistryCheckInitiators.RefusalOf(initiator, ctx);
    return why === null ? null : { kind: 'actor-not-permitted', actor: initiator.kind };
  }

  /**
   * An adoption that did not re-verify: in its own short transaction under both locks, and only while the model is
   * still Published, `Published → Unevaluated` with `ServingWhileUnevaluated` cleared (it stops serving, ruling R8),
   * the refusal as its `StatusReason`, its monitoring job disabled and one `refusal` record with `Purpose = 'adopt'`;
   * then, after the commit, its scoring Action disabled and the pipeline's incumbent rolled back
   * ({@link RollBackToIncumbent}). A lock that times out, or a model no longer Published, changes nothing (`refused`).
   */
  protected async DemoteAdoption(model: MJMLModelEntity, request: PublishRequest, refusal: TransitionRefusal, ctx: GateContext): Promise<AdoptOutcome> {
    const recorded = await ProviderTransactions.Run(ctx, `the demotion of ML Model ${model.ID}`, () => this.demoteLocked(model, request, refusal, ctx), (r) => r.Kind === 'recorded');
    if (recorded.Kind === 'refused') return { Kind: 'refused', ModelID: model.ID, Refusal: recorded.Refusal, Transient: recorded.Refusal.kind === 'publish-in-progress' };
    await this.syncCommitted(model.ID, 'Unevaluated', ctx);
    const rollback = await this.RollBackToIncumbent(model.PipelineID, request.initiator, ctx);
    return { Kind: 'demoted', ModelID: model.ID, Refusal: refusal, RefusalRecordID: recorded.RecordID, Rollback: rollback };
  }

  /**
   * §5.7 R7 (a)'s rollback rule for a pipeline left with no Published model: the newest (highest `Version`) `Archived`
   * model of the pipeline that has a `Delivery`, a verified artifact and a `publish` record for its training run is
   * published again through {@link Publish} (`purpose: 'rollback'`); null when the pipeline has none (scoring then refuses
   * `model-not-published` until a re-evaluation publishes).
   */
  protected async RollBackToIncumbent(pipelineId: string, initiator: Actor, ctx: GateContext): Promise<PublishOutcome | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID' | 'TrainingRunID' | 'Delivery'>>(
      {
        EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID='${EscapeSQLString(pipelineId)}' AND Status='Archived' AND ArtifactStatus='verified'`,
        OrderBy: 'Version DESC', Fields: ['ID', 'TrainingRunID', 'Delivery'], ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the archived models of pipeline ${pipelineId} failed: ${r.ErrorMessage || 'unknown error'}`);
    for (const candidate of r.Results) {
      if (!candidate.Delivery || !candidate.TrainingRunID) continue;
      if ((await PublishRecords.FindPublishForRun(candidate.TrainingRunID, ctx)) === null) continue;
      return this.Publish({ modelId: candidate.ID, purpose: 'rollback', initiator, signOffId: null, reason: LifecycleGate.ADOPT_ROLLBACK_REASON }, ctx);
    }
    return null;
  }

  /**
   * Archives the pipeline's pre-change models that serve it while Unevaluated (`ServingWhileUnevaluated = 1`) in the
   * caller's publish transaction (§5.1): "Replaced by v<n>, published through the gate" as the reason, the flag cleared
   * by the same authorised save, its monitoring job disabled. Returns their IDs, so their scoring Actions are disabled
   * after the commit.
   *
   * @throws Error when the read or a save fails (the caller's transaction rolls the publish back)
   */
  protected async RetireServingModels(published: MJMLModelEntity, initiator: Actor, ctx: GateContext): Promise<string[]> {
    const r = await StoredRowReads.Run<MJMLModelEntity>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID='${EscapeSQLString(published.PipelineID)}' AND Status='Unevaluated' AND ServingWhileUnevaluated=1`, ResultType: 'entity_object' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the serving pre-change model of pipeline ${published.PipelineID} failed: ${r.ErrorMessage || 'unknown error'}`);
    const retired: string[] = [];
    for (const serving of r.Results.filter((m) => !UUIDsEqual(m.ID, published.ID))) {
      serving.StatusReason = `Replaced by v${published.Version}, published through the gate.`;
      await LifecycleGate.saveAuthorised(serving, 'Archived', initiator, null, true);
      await MonitoringJobs.DisableForModel(serving.ID, ctx);
      retired.push(serving.ID);
    }
    return retired;
  }

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

  /**
   * Who may start this publish, checked first, before the locks (so it also covers R1's restore, which runs under
   * them): `actor-not-permitted` naming the initiator's kind when
   * - `ctx.ContextUser` lacks any permission the applied publish writes with ({@link CheckContextUserMayPublish},
   *   D4-135): `MissingGrant` is true, and only this refusal is recorded with the gate's write identity
   *   ({@link GateWriteContext}, D4-134);
   * - a `rollback` is started by an `agent` or `system` initiator (§5.1: an automatic rollback comes from monitoring or
   *   the registry job, a `scheduled-job` initiator, or from a user);
   * - a `human` initiator names a user other than `ctx.ContextUser` (`ReverifyPublish` treats every `human` initiator as
   *   an interactive request, which may publish a kept baseline, so a caller cannot claim to be another person).
   *
   * The two other cases come from a caller who holds every grant, so their refusal is written as that caller (and the
   * Record Change names them; `MissingGrant` false). A sign-off of another model, or a reject, is not checked here: the sign-off lookup returns null for it, so a
   * protocol that requires a sign-off withholds the publish `no-sign-off` ({@link FindRequestSignOff}).
   */
  protected CheckInitiator(request: PublishRequest, ctx: GateContext): InitiatorRefusal | null {
    const permitted = this.CheckContextUserMayPublish(request.initiator, ctx);
    if (permitted !== null) return { Refusal: permitted, MissingGrant: true };
    const refused: InitiatorRefusal = { Refusal: { kind: 'actor-not-permitted', actor: request.initiator.kind }, MissingGrant: false };
    if (request.purpose === 'rollback' && (request.initiator.kind === 'agent' || request.initiator.kind === 'system')) return refused;
    if (request.initiator.kind === 'human' && !UUIDsEqual(request.initiator.userId, ctx.ContextUser.ID)) return refused;
    return null;
  }

  /**
   * Case (a) of {@link CheckInitiator} (D4-135): `actor-not-permitted` naming the initiator's kind unless
   * `ctx.ContextUser` holds every permission a publish, rollback or restore writes with as the caller —
   * {@link PUBLISH_WRITES}, kept beside {@link applyPublish}, the code that writes.
   */
  protected CheckContextUserMayPublish(initiator: Actor, ctx: GateContext): TransitionRefusal | null {
    return this.CheckContextUserMayWrite(LifecycleGate.PUBLISH_WRITES, initiator, ctx);
  }

  /**
   * `actor-not-permitted` naming the initiator's kind unless `ctx.ContextUser` holds every permission in `writes`
   * (`EntityInfo.GetUserPermisions` per entity; an entity the provider does not know, or permissions that cannot be
   * read, fail closed). The lists are {@link PUBLISH_WRITES}, {@link EVALUATE_WRITES} and {@link RUN_RECORD_WRITES}.
   */
  protected CheckContextUserMayWrite(writes: readonly GateWritePermission[], initiator: Actor, ctx: GateContext): TransitionRefusal | null {
    const permitted = writes.every((w) => {
      const permissions = ctx.Provider.EntityByName(w.EntityName)?.GetUserPermisions(ctx.ContextUser);
      return permissions ? permissions[w.Need] === true : false;
    });
    return permitted ? null : { kind: 'actor-not-permitted', actor: initiator.kind };
  }

  /**
   * The context the gate writes a refusal's audit as when the caller may not write it (D4-134): the MJ system user
   * (`WellKnownUserSource.Instance.GetSystemUser(ctx.Provider)`, the server's own account) on the SAME provider and
   * seams. The writes run in the refusal path's own short transaction (`recordWithheld`, after the attempt's rolled
   * back; or `writeRunOutcome`'s). The row then records the gate as its writer, not the caller; the caller stays the
   * record's `Initiator`.
   *
   * @throws Error when the provider offers no system user (a process with no server-side user source): the refusal of
   *   a caller missing a grant cannot be recorded, and the attempt fails loudly rather than unrecorded
   */
  protected async GateWriteContext(ctx: GateContext): Promise<GateContext> {
    const system = await WellKnownUserSource.Instance.GetSystemUser(ctx.Provider);
    if (system === null) {
      throw new Error('Predictive Studio lifecycle gate: no MJ system user is available on this provider, so the refusal of a caller missing a grant the gate writes with cannot be recorded');
    }
    return { ContextUser: system, Provider: ctx.Provider, EvidenceBuilder: ctx.EvidenceBuilder, SemanticsCheck: ctx.SemanticsCheck, SignOffLookup: ctx.SignOffLookup };
  }

  /** `illegal-transition` (naming both states, D4-90) unless the §5.1 table has a row from the model's persisted status to `to`. */
  protected CheckPersistedStatus(model: MJMLModelEntity, to: MJMLModelEntity['Status']): TransitionRefusal | null {
    if (StatusWriteRules.IsAuthorisedTransition(model.Status, to)) return null;
    return { kind: 'illegal-transition', from: LifecycleStates.FromPersisted(model.Status), to: LifecycleStates.FromPersisted(to) };
  }

  /**
   * The run's stored leakage flags (`ValidationResults.trainer.leakageFlags`): null when there are none, or when the
   * request's approving sign-off (made over the evidence the stored rows give now, {@link FindRequestSignOff}) overrides
   * every flag kind; otherwise `unacknowledged-leakage-flags` naming each kind it does not cover, once.
   */
  protected async CheckLeakageFlags(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<TransitionRefusal | null> {
    const run = model.TrainingRunID ? await StoredRuns.Read(model.TrainingRunID, ctx) : null;
    const kinds = [...new Set((run?.Trainer?.leakageFlags || []).map((f) => f.kind))];
    if (kinds.length === 0) return null;
    const evidenceSha256 = request.signOffId === null ? null : PublishRecords.EvidenceSha256(await ctx.EvidenceBuilder.Build(model.ID, ctx));
    const signOff = evidenceSha256 === null ? null : await this.FindRequestSignOff(request, evidenceSha256, ctx);
    const uncovered = kinds.filter((k) => !(signOff?.OverridesFlags || []).includes(k));
    return uncovered.length === 0 ? null : { kind: 'unacknowledged-leakage-flags', flags: uncovered };
  }

  /**
   * The approving sign-off the request names (`signOffId`) for its model and purpose, whose `EvidenceSha256` equals
   * `evidenceSha256` — the hash of the evidence this publish rebuilt from stored rows — through the context's sign-off
   * lookup; null when the request names none or the lookup returns null (a reject, another model's or purpose's record, or
   * a sign-off over evidence that has changed since).
   */
  protected async FindRequestSignOff(request: PublishRequest, evidenceSha256: string, ctx: GateContext): Promise<SignOff | null> {
    if (request.signOffId === null) return null;
    return ctx.SignOffLookup.FindApproving(request, evidenceSha256, ctx);
  }

  /** The stored publish inputs of the model for this attempt's initiator, or the refusal naming what the stored rows lack. */
  protected async LoadStoredPublishInputs(modelId: string, initiator: Actor, ctx: GateContext): Promise<StoredPublishInputs | TransitionRefusal> {
    return StoredPublishInputsLoader.Load(modelId, initiator, ctx);
  }

  /**
   * Every check of a publish over stored inputs, in order: `PublishRules.ReverifyPublish` (a rollback re-derives with no
   * incumbent and replaces the current Published model); the calibration hold and servability of the old promotion
   * gate (D4-57); the semantics check — first filling the model's missing output bindings from its semantics
   * ({@link CreateOutputBindings}: missing surfaces only, an existing row never overwritten, so a stored row that
   * disagrees is still refused `semantics-check-failed`), in the caller's transaction, so a refused attempt keeps none
   * of them; the artifact verified inside the transaction (a load that throws is transient, a
   * definite non-verified load is not and records the model's `ArtifactStatus`); then the evidence, rebuilt from stored
   * rows, and the request's sign-off over it ({@link FindRequestSignOff}): required (`no-sign-off` without one) when
   * the pinned protocol sets `requiresHumanSignOff`, and consumed (recorded on the publish, its approver the approver)
   * whenever the request names one that matches; then who approved.
   */
  protected async CheckPublishable(model: MJMLModelEntity, inputs: StoredPublishInputs, request: PublishRequest, ctx: GateContext): Promise<PublishCheck> {
    const rollback = request.purpose === 'rollback';
    const reverified = PublishRules.ReverifyPublish(rollback ? { ...inputs, CurrentPublishedModelID: null } : inputs);
    if (reverified.Ok === false) return LifecycleGate.refused(LifecycleGate.reverificationRefusal(reverified, inputs));
    const held = this.servingRefusal(model);
    if (held !== null) return LifecycleGate.refused(held);
    await this.CreateOutputBindings(model, { task: inputs.Task }, ctx);
    const semantics = await ctx.SemanticsCheck.Check(model, ctx);
    if (semantics.Result.Status === 'failed') return LifecycleGate.refused({ kind: 'semantics-check-failed', mismatches: semantics.Result.Mismatches });
    const artifact = await this.verifyArtifact(model, ctx);
    if (artifact !== null) return artifact;
    const evidence = await ctx.EvidenceBuilder.Build(model.ID, ctx);
    const evidenceSha256 = PublishRecords.EvidenceSha256(evidence);
    const signOff = await this.FindRequestSignOff(request, evidenceSha256, ctx);
    if (inputs.ProtocolRow.Promotion.requiresHumanSignOff && signOff === null) return LifecycleGate.refused({ kind: 'no-sign-off' });
    return {
      Ok: true, Reverified: reverified, Replaces: rollback ? inputs.CurrentPublishedModelID : reverified.Replaces, Evidence: evidence,
      EvidenceSha256: evidenceSha256, SignOff: signOff, Approver: LifecycleGate.approverOf(request.initiator, signOff?.Approver.userId || null),
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

  /**
   * Creates the model's `MJ: ML Output Bindings` rows that are missing: `SemanticsRules.DefaultBindings` of the
   * model's parsed `OutputSemantics`, one per surface the model has no row for. An existing row is never overwritten, so
   * an operator's edit survives a re-evaluation. Runs in the Evaluate transaction after the status write, and in a
   * publish's, rollback's or restore's transaction before its semantics check ({@link CheckPublishable}); each row is
   * saved through the entity (its server subclass checks it against the semantics). The caller hands in the semantics
   * it already parsed, so the column is parsed once per attempt: Evaluate parses it before the status write and refuses
   * `not-servable` when it does not parse (D4-129); a publish takes `StoredPublishInputs.Task`, whose loader refuses
   * `not-servable` for the same reason. A failed read or save throws on either path and rolls that transaction back (a
   * publish never succeeds without its rows).
   *
   * @param semantics the model's `OutputSemantics`, already parsed by the caller
   * @throws Error when the existing rows cannot be read or a save fails (with the entity's `LatestResult` message), so
   *   the caller's transaction rolls the attempt back
   */
  protected async CreateOutputBindings(model: MJMLModelEntity, semantics: OutputSemantics, ctx: GateContext): Promise<void> {
    const existing = await SemanticsChecker.ReadBindings(model.ID, ctx);
    const missing = SemanticsRules.DefaultBindings(semantics).filter((d) => !existing.some((e) => e.Surface === d.Surface));
    for (const spec of missing) {
      const row = await ctx.Provider.GetEntityObject<MJMLOutputBindingEntity>('MJ: ML Output Bindings', ctx.ContextUser);
      row.NewRecord();
      row.ModelID = model.ID;
      row.Surface = spec.Surface;
      row.SortsBy = spec.SortsBy;
      row.DriverDirectionRelativeTo = spec.DriverDirectionRelativeTo;
      row.Label = spec.Label;
      if (!(await row.Save())) throw new Error(`Saving the ${spec.Surface} output binding of ML Model ${model.ID} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
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
   * with the model's training run.
   *
   * **Identity.** The row is saved as `ctx.ContextUser`. With `identity: 'caller'` that is the caller and the approver is
   * the one the attempt would have had (for a `human` initiator, the caller: `CheckInitiator` (c) makes them one). With `identity: 'gate'` `ctx` is {@link GateWriteContext}'s: the row is saved as
   * the MJ system user (the gate's write identity, D4-134): for a caller refused for a missing publish grant
   * ({@link PUBLISH_WRITES}), or a run-level record of a caller without `CanCreate` on `MJ: ML Model Publish Records`
   * ({@link RUN_RECORD_WRITES}). Its `ApproverKind` is `automated-gate` and its `Initiator` stays the caller's actor.
   *
   * The insert's foreign-key check reads the model row, so it waits while another session holds that row with an
   * exclusive lock (it has written the row and not yet committed). The wait is not bounded: a stored query cannot carry
   * `SET LOCK_TIMEOUT`, and `RunQueryResult` carries no error number (owner flag OF4-12).
   *
   * @throws Error when a `{ modelId }` subject comes with no request (a model-level refusal is always the refusal of a
   *   publish request: a publish, or the publish attempt an Evaluate runs inside, D4-143)
   */
  protected async WriteRefusalRecord(
    subject: EvaluateSubject, initiator: Actor, request: PublishRequest | null, refusal: TransitionRefusal, transient: boolean, ctx: GateContext,
    identity: RefusalWriteIdentity,
  ): Promise<string> {
    // A human initiator's approver is the caller who saves the row: equal to `initiator.userId` for every attempt that
    // passes `CheckInitiator` (c), and the honest name for its impersonation refusal, which names another user.
    const approver: PublishApprover = identity === 'gate' ? { Kind: 'automated-gate' }
      : initiator.kind === 'human' ? { Kind: 'user', UserID: ctx.ContextUser.ID } : LifecycleGate.approverOf(initiator, null);
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
   * Creates the published model's `Active` monitoring job (D4-179) from the protocol version row it was evaluated under.
   *
   * @throws Error when the model names no protocol or the protocol row is gone
   */
  protected async CreateMonitoringJob(model: MJMLModelEntity, ctx: GateContext): Promise<string> {
    const protocol = model.EvaluationProtocolID ? await StoredRuns.ReadProtocol(model.EvaluationProtocolID, ctx) : null;
    if (protocol === null) throw new Error(`Predictive Studio lifecycle gate: ML Model ${model.ID} names no Evaluation Protocol row to build its monitoring job from`);
    return MonitoringJobs.CreateActive(model, protocol.Spec, ctx);
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

  /** The `Reason` of an adoption's `publish` record (§5.6 step 2). */
  private static readonly ADOPT_REASON = 'pre-change model re-verified on its stored gate record';
  /** The `Reason` of the rollback a refused adoption starts (§5.7 R7 (a)). */
  private static readonly ADOPT_ROLLBACK_REASON = 'rolled back: the Published pre-change model did not re-verify on its stored gate record';

  /** The model's `StatusReason` after a refused adoption: the re-verification's refusal, in plain words and by kind. Pure. */
  public static AdoptionRefusedReason(refusal: TransitionRefusal): string {
    return `Trained before the Predictive Studio lifecycle gate; re-verification on its stored gate record refused (${refusal.kind}): ${GateRefusals.Describe(refusal)}`;
  }

  /**
   * One adoption under both locks: a model no longer Published is `illegal-transition` (nothing to adopt); a run that
   * already holds its `adopt` (or `publish`) record is `already-adopted`; then the back-fill, the stored-row checks of a
   * publish, and the writes of a pass — the model's `StatusReason` cleared and its artifact `verified` in a save that
   * changes no status, the `adopt` record, the monitoring job when the model has no open one.
   */
  private async attemptAdopt(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext, options: AdoptOptions): Promise<AdoptAttempt> {
    const lock = await this.LockPipelineAndModel(model.PipelineID, model.ID, ctx);
    if (lock.Locked === false) return { Kind: 'refused', Refusal: lock.Refusal, Transient: lock.Refusal.kind === 'publish-in-progress', Demote: false };
    const locked = await this.readModel(model.ID, ctx);
    if (locked === null) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: model.ID }, Transient: false, Demote: false };
    if (locked.Status !== 'Published') {
      return { Kind: 'refused', Refusal: { kind: 'illegal-transition', from: LifecycleStates.FromPersisted(locked.Status), to: 'published' }, Transient: false, Demote: false };
    }
    const prior = locked.TrainingRunID ? await PublishRecords.FindPublishForRun(locked.TrainingRunID, ctx) : null;
    if (prior !== null) return { Kind: 'already-adopted', ModelID: locked.ID, PublishRecordID: prior.ID };
    const backFill = options.BackFill ? await options.BackFill(locked, ctx) : null;
    if (backFill !== null) return { Kind: 'refused', Refusal: backFill, Transient: false, Demote: true };
    const checked = await this.checkFromStoredRows(locked, request, ctx);
    if (checked.Ok === false) return { Kind: 'refused', Refusal: checked.Refusal, Transient: checked.Transient, Demote: !checked.Transient };
    locked.StatusReason = null;
    locked.ArtifactStatus = 'verified';
    locked.ArtifactCheckedAt = new Date();
    if (!(await locked.Save())) throw new Error(`Saving the adopted ML Model ${locked.ID} failed: ${locked.LatestResult?.CompleteMessage || 'unknown error'}`);
    const recordId = await PublishRecords.WritePublish({
      ModelID: locked.ID, TrainingRunID: locked.TrainingRunID, Purpose: 'adopt', Approver: checked.Approver, Initiator: request.initiator, Reason: request.reason,
      GateDecision: checked.Reverified.Gate, Evidence: checked.Evidence, EvidenceSha256: checked.EvidenceSha256, SignOffID: null, ReplacesModelID: null,
    }, ctx);
    if ((await MonitoringJobs.OpenJobCount(locked.ID, ctx)) === 0) await this.CreateMonitoringJob(locked, ctx);
    return { Kind: 'adopted', ModelID: locked.ID, PublishRecordID: recordId };
  }

  /** The demotion's writes under both locks ({@link DemoteAdoption}). */
  private async demoteLocked(model: MJMLModelEntity, request: PublishRequest, refusal: TransitionRefusal, ctx: GateContext): Promise<DemotionAttempt> {
    const lock = await this.LockPipelineAndModel(model.PipelineID, model.ID, ctx);
    if (lock.Locked === false) return { Kind: 'refused', Refusal: lock.Refusal };
    const locked = await this.readModel(model.ID, ctx);
    if (locked === null) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: model.ID } };
    if (locked.Status !== 'Published') return { Kind: 'refused', Refusal: { kind: 'illegal-transition', from: LifecycleStates.FromPersisted(locked.Status), to: 'unevaluated' } };
    locked.StatusReason = LifecycleGate.AdoptionRefusedReason(refusal);
    await LifecycleGate.saveAuthorised(locked, 'Unevaluated', request.initiator, null, locked.ServingWhileUnevaluated);
    await MonitoringJobs.DisableForModel(locked.ID, ctx);
    const recordId = await PublishRecords.WriteRefusal({
      ModelID: locked.ID, TrainingRunID: locked.TrainingRunID, Purpose: 'adopt', Approver: LifecycleGate.approverOf(request.initiator, null),
      Initiator: request.initiator, Refusal: refusal, Transient: false,
    }, ctx);
    return { Kind: 'recorded', RecordID: recordId };
  }

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
   * One publish attempt: the initiator checked before the locks ({@link CheckInitiator}), then under both locks;
   * refusals return before anything is written. Idempotency first under the locks (R1, D4-92 M1):
   * a model that is Published now with an applied `publish` record for its run (or, for a rollback, with its own
   * `rollback` record) is `already-published`; a model with a `publish` record for its run whose status was changed
   * outside the gate to Validated or KeepBaseline is restored ({@link restorePublish}); a model that was published and
   * later archived is not re-published by a retry (that is a rollback, so `checkPurpose` refuses it).
   */
  private async attemptPublish(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<PublishAttempt> {
    const initiator = this.CheckInitiator(request, ctx);
    if (initiator !== null) return LifecycleGate.refusedAttempt(initiator.Refusal, false, null, model.Status, initiator.MissingGrant);
    const lock = await this.LockPipelineAndModel(model.PipelineID, model.ID, ctx);
    if (lock.Locked === false) return LifecycleGate.refusedAttempt(lock.Refusal, lock.Refusal.kind === 'publish-in-progress', null, model.Status, false);
    const locked = await this.readModel(model.ID, ctx);
    if (locked === null) return LifecycleGate.refusedAttempt({ kind: 'model-not-found', modelId: model.ID }, false, null, model.Status, false);
    const prior = await this.findAppliedPublish(locked, request, ctx);
    if (prior !== null && locked.Status === 'Published') {
      return { Kind: 'applied', Outcome: { Kind: 'already-published', Purpose: prior.Purpose, ModelID: locked.ID, PublishRecordID: prior.ID }, RetiredServing: [] };
    }
    if (prior !== null && request.purpose === 'publish' && LifecycleGate.RESTORABLE_STATUSES.some((s) => s === locked.Status)) {
      return this.restorePublish(locked, request, prior.ID, ctx);
    }
    const before = this.CheckPersistedStatus(locked, 'Published') || (await this.checkPurpose(locked, request, ctx));
    if (before !== null) return LifecycleGate.refusedAttempt(before, false, null, locked.Status, false);
    const checked = await this.checkFromStoredRows(locked, request, ctx);
    if (checked.Ok === false) return LifecycleGate.refusedAttempt(checked.Refusal, checked.Transient, checked.Artifact, locked.Status, false);
    return this.applyPublish(locked, request, checked, ctx);
  }

  /**
   * The stored inputs, then the leakage flags, then every publish check over the inputs — the one order of a publish,
   * rollback and restore. The stored inputs come first (D4-128): they refuse `not-servable` for a model whose evidence
   * cannot be built from stored rows (no run, gate record, trainer result or Training Snapshot), and both
   * {@link CheckLeakageFlags} (for a request naming a sign-off) and {@link CheckPublishable} build that evidence, which
   * throws on those rows. The leakage check keeps its own run read: `StoredPublishInputs` carries no leakage flags.
   */
  private async checkFromStoredRows(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<PublishCheck> {
    const inputs = await this.LoadStoredPublishInputs(model.ID, request.initiator, ctx);
    if (LifecycleGate.isRefusal(inputs)) return LifecycleGate.refused(inputs);
    const leakage = await this.CheckLeakageFlags(model, request, ctx);
    if (leakage !== null) return LifecycleGate.refused(leakage);
    return this.CheckPublishable(model, inputs, request, ctx);
  }

  /**
   * The applied publish a retry of `request` would repeat: the run's `publish` (or `adopt`) record for a publish
   * (`UX_MLModelPublishRecord_OnePublishPerRun`), the model's newest `rollback` record for a rollback; null for none.
   */
  private async findAppliedPublish(model: MJMLModelEntity, request: PublishRequest, ctx: GateContext): Promise<{ readonly ID: string; readonly Purpose: AppliedPublishPurpose } | null> {
    if (request.purpose === 'rollback') {
      const rollback = await PublishRecords.FindLatestApplied(model.ID, 'rollback', ctx);
      return rollback === null ? null : { ID: rollback.ID, Purpose: 'rollback' };
    }
    return model.TrainingRunID ? PublishRecords.FindPublishForRun(model.TrainingRunID, ctx) : null;
  }

  /**
   * R1's restore (§5.7): a model whose run holds a `publish` record but whose status was changed outside the gate. The
   * full checks run again under the locks, and `Published` is written with no second `publish` record; the outcome
   * names the run's existing record. The model's monitoring job is created only when it has no open one.
   */
  private async restorePublish(model: MJMLModelEntity, request: PublishRequest, recordId: string, ctx: GateContext): Promise<PublishAttempt> {
    const checked = await this.checkFromStoredRows(model, request, ctx);
    if (checked.Ok === false) return LifecycleGate.refusedAttempt(checked.Refusal, checked.Transient, checked.Artifact, model.Status, false);
    model.StatusReason = null;
    model.ArtifactStatus = 'verified';
    model.ArtifactCheckedAt = new Date();
    await this.ApplyTransition(model, 'Published', checked.Replaces, request.initiator, ctx);
    const retired = await this.RetireServingModels(model, request.initiator, ctx);
    if ((await MonitoringJobs.OpenJobCount(model.ID, ctx)) === 0) await this.CreateMonitoringJob(model, ctx);
    return {
      Kind: 'applied', Outcome: { Kind: 'published', Purpose: request.purpose, ModelID: model.ID, PublishRecordID: recordId, Replaces: checked.Replaces, Approver: checked.Approver.Kind },
      RetiredServing: retired,
    };
  }

  /**
   * Every permission the applied publish path (a publish, a rollback, R1's restore) writes with as the caller, which
   * {@link CheckContextUserMayPublish} requires before the locks. A write added to this path without its row here is a
   * save the caller may be refused, after the attempt was let through; keep the two together.
   * - `MJ: ML Models` `CanUpdate`: {@link ApplyTransition} saves the model's status (`saveAuthorised`), and first the
   *   archived incumbent it replaces;
   * - `MJ: ML Output Bindings` `CanCreate`: {@link CheckPublishable} fills the missing bindings ({@link CreateOutputBindings}, D4-112);
   * - `MJ: ML Model Publish Records` `CanCreate`: {@link WritePublishRecord} (a publish or rollback; a restore writes none);
   * - `MJ: Scheduled Jobs` `CanCreate`: {@link CreateMonitoringJob} (the published model's `Active` monitoring job);
   * - `MJ: Scheduled Jobs` `CanUpdate`: `MonitoringJobs.DisableForModel`, the replaced incumbent's job ({@link ApplyTransition}).
   *
   * Not listed: the scoring Action sync ({@link SyncScoringAction}) runs after the commit, logs a failure and never
   * rolls a publish back, so a caller who cannot write `MJ: Actions` still publishes (the registry job resyncs it).
   */
  private static readonly PUBLISH_WRITES: readonly GateWritePermission[] = [
    { EntityName: 'MJ: ML Models', Need: 'CanUpdate' },
    { EntityName: 'MJ: ML Output Bindings', Need: 'CanCreate' },
    { EntityName: 'MJ: ML Model Publish Records', Need: 'CanCreate' },
    { EntityName: 'MJ: Scheduled Jobs', Need: 'CanCreate' },
    { EntityName: 'MJ: Scheduled Jobs', Need: 'CanUpdate' },
  ];

  /**
   * The writes of a passing publish, in the publish transaction (their permissions: {@link PUBLISH_WRITES}): the status
   * change with the archive of the replaced model, the archive of a pre-change model serving the pipeline
   * ({@link RetireServingModels}), the `publish` record and the monitoring job.
   */
  private async applyPublish(model: MJMLModelEntity, request: PublishRequest, check: PassedCheck, ctx: GateContext): Promise<PublishAttempt> {
    model.StatusReason = null;
    model.ArtifactStatus = 'verified';
    model.ArtifactCheckedAt = new Date();
    await this.ApplyTransition(model, 'Published', check.Replaces, request.initiator, ctx);
    const retired = await this.RetireServingModels(model, request.initiator, ctx);
    const recordId = await this.WritePublishRecord(model, request, check, ctx);
    await this.CreateMonitoringJob(model, ctx);
    return {
      Kind: 'applied', Outcome: { Kind: 'published', Purpose: request.purpose, ModelID: model.ID, PublishRecordID: recordId, Replaces: check.Replaces, Approver: check.Approver.Kind },
      RetiredServing: retired,
    };
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
    const identity: RefusalWriteIdentity = refused.MissingGrant ? 'gate' : 'caller';
    const writer = identity === 'gate' ? await this.GateWriteContext(ctx) : ctx;
    return ProviderTransactions.Run(writer, `the refusal record of ML Model ${modelId}`, async () => {
      const lock = await PublishLocks.RunStored(PUBLISH_LOCK_QUERIES.LockModel, { ModelID: modelId }, writer);
      const persisted = lock.Success ? LifecycleGate.persistedStatusOf(lock.Results[0]?.Status) : null;
      if (lock.Success === false) {
        LogError(`Predictive Studio lifecycle gate: the model lock of ML Model ${modelId} is held, so the ${refused.Refusal.kind} refusal is recorded without its StatusReason; last error: ${lock.ErrorMessage || 'unknown error'}`);
      } else if (persisted === refused.SeenStatus) {
        await this.saveWithheldReason(modelId, request, refused, writer);
      }
      const recordId = await this.WriteRefusalRecord({ modelId }, request.initiator, request, refused.Refusal, refused.Transient, writer, identity);
      const withheld: PublishOutcome = {
        Kind: 'withheld', Purpose: request.purpose, ModelID: modelId, Status: persisted || refused.SeenStatus, Refusal: refused.Refusal, Transient: refused.Transient, RefusalRecordID: recordId,
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

  /**
   * A model-subject Evaluate. A model past Draft is `illegal-transition` first (so a resume can read its state); then a
   * caller without Evaluate's write permissions ({@link EVALUATE_WRITES}) is `actor-not-permitted`, before any read of
   * the run and any status write (D4-134). A refusal is recorded only when `attemptPurpose` is set and its kind is one
   * {@link RECORDED_EVALUATE_REFUSALS} names ({@link recordEvaluateRefusal}, D4-143).
   */
  private async evaluateModel(modelId: string, actor: Actor, ctx: GateContext, attemptPurpose: EvaluateAttempt['AttemptPurpose']): Promise<EvaluateOutcome> {
    if (!IsValidUUID(modelId)) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId } };
    const model = await this.readModel(modelId, ctx);
    if (model === null) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId } };
    const attempt = await this.attemptEvaluate(model, actor, ctx);
    if (attempt.Kind === 'evaluated') return attempt.Outcome;
    if (attemptPurpose !== undefined && LifecycleGate.RECORDED_EVALUATE_REFUSALS.includes(attempt.Refusal.kind)) {
      await this.recordEvaluateRefusal(model, attemptPurpose, actor, attempt, ctx);
    }
    return { Kind: 'refused', Refusal: attempt.Refusal };
  }

  /**
   * The model-level Evaluate refusals a publish attempt records (D4-143). Not `illegal-transition` (a resume's signal,
   * D4-131, or a served model's re-run, D4-133) and not `model-not-found` (no model row to name).
   */
  private static readonly RECORDED_EVALUATE_REFUSALS: readonly TransitionRefusal['kind'][] = ['not-servable', 'gate-no-signal', 'calibration-held', 'actor-not-permitted', 'publish-in-progress'];

  /** The model's Evaluate checks, then its status change under both locks in one transaction (rolled back on a refusal). */
  private async attemptEvaluate(model: MJMLModelEntity, actor: Actor, ctx: GateContext): Promise<EvaluateAttemptResult> {
    const draft = this.CheckPersistedStatus(model, 'Validated');
    if (draft !== null) return LifecycleGate.refusedEvaluate(draft, false);
    const permitted = this.CheckContextUserMayWrite(LifecycleGate.EVALUATE_WRITES, actor, ctx);
    if (permitted !== null) return LifecycleGate.refusedEvaluate(permitted, true);
    const run = model.TrainingRunID ? await StoredRuns.Read(model.TrainingRunID, ctx) : null;
    if (run === null || run.Gate === null) return LifecycleGate.refusedEvaluate({ kind: 'not-servable', reason: `ML Model ${model.ID} has no stored gate decision to evaluate` }, false);
    const target = LifecycleGate.evaluationTarget(run.Gate);
    if (target === null) return LifecycleGate.refusedEvaluate({ kind: 'gate-no-signal', reason: run.Gate.reason.text }, false);
    const hold = target === 'Validated' ? TrainerModelLineageReader.CalibrationHoldOf(model.Lineage) : null;
    if (hold !== null) return LifecycleGate.refusedEvaluate({ kind: 'calibration-held', slope: hold.slope }, false);
    return ProviderTransactions.Run(ctx, `the evaluation of ML Model ${model.ID}`, () => this.evaluateLocked(model, target, run.Gate.reason.text, actor, ctx), (o) => o.Kind === 'evaluated');
  }

  /**
   * Records a model-level Evaluate refusal of a publish attempt (D4-143) through the withheld publish's own path,
   * {@link recordWithheld}: its own short transaction after Evaluate's rolled back, the model's `StatusReason` under the
   * NOWAIT model lock while the model is still in the status Evaluate saw, and one `refusal` record with `Purpose` the
   * attempt's purpose, the model and its training run, the caller's actor as initiator, `Transient` for
   * `publish-in-progress`; written with the gate's identity only for a missing grant (D4-134).
   */
  private async recordEvaluateRefusal(
    model: MJMLModelEntity, purpose: Extract<PublishRequest['purpose'], 'publish'>, actor: Actor, refused: Extract<EvaluateAttemptResult, { readonly Kind: 'refused' }>, ctx: GateContext,
  ): Promise<void> {
    const request: PublishRequest = { modelId: model.ID, purpose, initiator: actor, signOffId: null, reason: null };
    const attempt: Extract<PublishAttempt, { readonly Kind: 'refused' }> = {
      Kind: 'refused', Refusal: refused.Refusal, Transient: refused.Transient, Artifact: null, SeenStatus: model.Status, MissingGrant: refused.MissingGrant,
    };
    await this.recordWithheld(model.ID, request, attempt, ctx);
  }

  /**
   * Every permission Evaluate's status change writes with as the caller ({@link evaluateLocked}), required before it:
   * - `MJ: ML Models` `CanUpdate`: the model's Draft → Validated / KeepBaseline save ({@link ApplyTransition});
   * - `MJ: ML Output Bindings` `CanCreate`: the model's missing bindings ({@link CreateOutputBindings}).
   */
  private static readonly EVALUATE_WRITES: readonly GateWritePermission[] = [
    { EntityName: 'MJ: ML Models', Need: 'CanUpdate' },
    { EntityName: 'MJ: ML Output Bindings', Need: 'CanCreate' },
  ];

  /**
   * The permission a run-level record is written with as the caller ({@link writeRunOutcome}); a caller without it has
   * the record written with the gate's write identity instead (D4-134):
   * - `MJ: ML Model Publish Records` `CanCreate`.
   */
  private static readonly RUN_RECORD_WRITES: readonly GateWritePermission[] = [{ EntityName: 'MJ: ML Model Publish Records', Need: 'CanCreate' }];

  /**
   * Evaluate's status change under both locks: re-checks the status the lock read, then parses the locked row's
   * `OutputSemantics` — one that does not parse is refused `not-servable` before anything is written (D4-129: Draft
   * stays Draft and the transaction rolls back empty; inside a publish attempt the refusal is then recorded after the
   * rollback, as `publish-in-progress` is, transiently, D4-143) — then writes the status and creates the model's
   * missing output bindings from the parsed semantics.
   */
  private async evaluateLocked(
    model: MJMLModelEntity, to: Extract<MJMLModelEntity['Status'], 'Validated' | 'KeepBaseline'>, reason: string, actor: Actor, ctx: GateContext,
  ): Promise<EvaluateAttemptResult> {
    const lock = await this.LockPipelineAndModel(model.PipelineID, model.ID, ctx);
    if (lock.Locked === false) return LifecycleGate.refusedEvaluate(lock.Refusal, false);
    const locked = await this.readModel(model.ID, ctx);
    if (locked === null) return LifecycleGate.refusedEvaluate({ kind: 'model-not-found', modelId: model.ID }, false);
    const status = this.CheckPersistedStatus(locked, to);
    if (status !== null) return LifecycleGate.refusedEvaluate(status, false);
    const semantics = RegistrySchemas.ParseOutputSemantics(locked.OutputSemantics);
    if (semantics.Ok === false) {
      return LifecycleGate.refusedEvaluate({ kind: 'not-servable', reason: `ML Model ${locked.ID}'s OutputSemantics does not parse: ${semantics.Errors.join('; ')}` }, false);
    }
    locked.StatusReason = reason;
    await this.ApplyTransition(locked, to, null, actor, ctx);
    await this.CreateOutputBindings(locked, semantics.Value, ctx);
    return { Kind: 'evaluated', Outcome: { Kind: 'evaluated', ModelID: locked.ID, From: 'Draft', To: to } };
  }

  /** A run-subject Evaluate: the run's model when it has one, else the one run-level record of its outcome. */
  private async evaluateRun(trainingRunId: string, actor: Actor, ctx: GateContext, attemptPurpose: EvaluateAttempt['AttemptPurpose']): Promise<EvaluateOutcome> {
    if (!IsValidUUID(trainingRunId)) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: trainingRunId } };
    const run = await StoredRuns.Read(trainingRunId, ctx);
    if (run === null) return { Kind: 'refused', Refusal: { kind: 'model-not-found', modelId: trainingRunId } };
    if (run.ResultingModelID) return this.evaluateModel(run.ResultingModelID, actor, ctx, attemptPurpose);
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
   * returns the winner's record, and rethrows only when there is still none. A caller without the permission to create
   * the record ({@link RUN_RECORD_WRITES}) has it written with the gate's write identity ({@link GateWriteContext}, D4-134).
   */
  private async writeRunOutcome(trainingRunId: string, actor: Actor, refusal: TransitionRefusal, ctx: GateContext): Promise<string> {
    const identity: RefusalWriteIdentity = this.CheckContextUserMayWrite(LifecycleGate.RUN_RECORD_WRITES, actor, ctx) === null ? 'caller' : 'gate';
    const writer = identity === 'gate' ? await this.GateWriteContext(ctx) : ctx;
    try {
      return await ProviderTransactions.Run(writer, `the run-level record of ML Training Run ${trainingRunId}`, () => this.WriteRefusalRecord({ trainingRunId }, actor, null, refusal, false, writer, identity));
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

  /**
   * Saves a status change the gate authorised for exactly this instance; the authorisation never outlives the save.
   * With `clearsServing`, the same save clears `ServingWhileUnevaluated` and the authorisation carries that change (the
   * only change of the flag an entity save may make, D4-61).
   */
  private static async saveAuthorised(model: MJMLModelEntity, to: MJMLModelEntity['Status'], initiator: Actor, replaces: string | null, clearsServing = false): Promise<void> {
    const from = model.Status;
    if (!StatusWriteRules.IsAuthorisedTransition(from, to)) throw new Error(`Predictive Studio lifecycle gate: ${from} → ${to} is not in the lifecycle table`);
    StatusWriteAuthorisations.Instance.Authorise(model, clearsServing
      ? { From: from, To: to, Initiator: initiator, Replaces: replaces, ServingWhileUnevaluated: false }
      : { From: from, To: to, Initiator: initiator, Replaces: replaces });
    try {
      if (clearsServing) model.ServingWhileUnevaluated = false;
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
          : { kind: 'not-servable', reason: `the training run stored no comparison with ML Model ${inputs.CurrentPublishedModelID}, which is Published now; retrain to compare with it, or, when its artifact is missing (so training cannot use it as an incumbent), the registry check job archives it` };
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

  /** A refused Evaluate; `Transient` is true only for `publish-in-progress` (a retry may succeed). */
  private static refusedEvaluate(refusal: TransitionRefusal, missingGrant: boolean): EvaluateAttemptResult {
    return { Kind: 'refused', Refusal: refusal, Transient: refusal.kind === 'publish-in-progress', MissingGrant: missingGrant };
  }

  private static refusedAttempt(refusal: TransitionRefusal, transient: boolean, artifact: ArtifactCheck | null, seen: MJMLModelEntity['Status'], missingGrant: boolean): PublishAttempt {
    return { Kind: 'refused', Refusal: refusal, Transient: transient, Artifact: artifact, SeenStatus: seen, MissingGrant: missingGrant };
  }

  private static isRefusal(x: StoredPublishInputs | TransitionRefusal): x is TransitionRefusal {
    return 'kind' in x;
  }
}
