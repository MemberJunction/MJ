/**
 * @module registry/status-guard
 *
 * `PredictiveStudioStatusGuard` — the platform's door on `MJ: ML Models.Status` (§5.1, architecture §6.1, D4-58). A
 * `PreSave` data hook, registered once per process from the Engine entry point, that runs on every save of the entity
 * from any caller (GraphQL, an agent, an Action, the gate itself):
 *
 * 1. It takes the save's `StatusWriteAuthorisations` entry (one-shot: a refused save leaves none behind) and reads the
 *    persisted `Status` and `ServingWhileUnevaluated` itself through the entity's own provider — never `OldValue`, which
 *    a caller can reset — failing closed when the provider is not a metadata provider, there is no user, the read fails
 *    or finds no row.
 * 2. `StatusWriteRules.DecideStatusWrite` decides: the serving flag, a create as Draft, a TransactionGroup, an unchanged
 *    Status, or exactly the authorised `From → To` of the lifecycle table.
 * 3. A gate-authorised move into `Published` is re-derived from the stored rows (`StoredPublishInputsLoader.Load` +
 *    `PublishRules.ReverifyPublish`, a rollback from `Archived` with no incumbent, as the gate does), on the same
 *    provider and so inside the gate's transaction: the authorisation is an exported singleton any module can fill, so
 *    it alone proves nothing. The gate archives the incumbent first, so the transaction reads no Published incumbent;
 *    the authorisation's `Replaces` names it, and the re-derivation runs the incumbent and margin check against that
 *    model (which must be a model of the same pipeline, archived) instead of skipping it.
 * 4. A gate-authorised `Published → Unevaluated` is refused `actor-not-permitted` unless its initiator is a run of a
 *    Predictive Studio Registry Check job (`MJ: Scheduled Job Runs` → `MJ: Scheduled Jobs.JobTypeID` → the type's name;
 *    ruling R9). That job type ships with Task M6.4; until then every such save is refused (fail closed).
 *
 * The hook returns `true` or a refusal message naming the model and the reason. A refused save also drops the same
 * instance's `EvidenceWriteAuthorisations` entry: hooks stop at the first refusal, so the evidence guard never takes it.
 */
import type { BaseEntity, PreSaveHook, UserInfo } from '@memberjunction/core';
import { MJMLModelEntity, type MJScheduledJobEntity, type MJScheduledJobRunEntity, type MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { PublishRules, StatusWriteRules, type Actor, type PersistedStatus, type StatusGuardDecision, type StoredPublishInputs } from '@memberjunction/predictive-studio-core';

import { EvidenceWriteAuthorisations } from './evidence-write-authorisations';
import { GuardContexts } from './guard-context';
import { PreSaveHookRegistration } from './pre-save-hook-registration';
import type { RegistryContext } from './registry-context';
import { StatusWriteAuthorisations, type StatusWriteAuthorisation } from './status-write-authorisations';
import { StoredPublishInputsLoader } from './stored-publish-inputs';

/** A refusal reason of the decision. */
type StatusRefusalReason = Extract<StatusGuardDecision, { readonly Allow: false }>['Reason'];

/** Set once this copy of the module has registered (or found) its hook. */
let registered = false;

/** The `PreSave` status guard on `MJ: ML Models`. */
export class PredictiveStudioStatusGuard {
  /** The global mark the registered hook carries, so a second copy of the module finds it and does not register again. */
  public static readonly HookMark: symbol = Symbol.for('@memberjunction/predictive-studio:status-guard');
  /** The entity the guard checks. */
  public static readonly EntityName = 'MJ: ML Models';
  /** The scheduled-job type whose runs alone may demote a Published model to Unevaluated (R9; shipped by M6.4). */
  public static readonly RegistryCheckJobTypeName = 'Predictive Studio Registry Check';

  /** Registers the hook once per process; idempotent within a copy of the module (a flag) and across copies (the mark). */
  public static Register(): void {
    if (registered) return;
    registered = true;
    const hook: PreSaveHook = (entity, contextUser) => PredictiveStudioStatusGuard.Check(entity, contextUser);
    PreSaveHookRegistration.RegisterOnce(PredictiveStudioStatusGuard.HookMark, hook);
  }

  /**
   * Removes this process's status-guard hook (any copy's, by `HookMark`) and resets the module's registered flag, so a
   * later {@link Register} registers again. For a process that must behave as a browser-only client — one that does
   * not load the Engine (a browser running Explorer) — so its save is refused, or not, by MJAPI alone; the integration
   * suite's UI path removes it for one save and registers it again. Nothing in production calls it.
   *
   * @returns true when a hook was removed; false when none was registered
   */
  public static Unregister(): boolean {
    registered = false;
    return PreSaveHookRegistration.Unregister(PredictiveStudioStatusGuard.HookMark);
  }

  /**
   * The hook's body: `true` for an allowed save (and for every other entity), else the refusal message. A refusal drops
   * the instance's evidence authorisation too, so no authorisation of a refused save is left behind.
   */
  protected static async Check(entity: BaseEntity, contextUser: UserInfo | undefined): Promise<boolean | string> {
    if (entity.EntityInfo?.Name !== PredictiveStudioStatusGuard.EntityName) return true;
    if (!(entity instanceof MJMLModelEntity)) {
      return `Predictive Studio status guard: a save of ${PredictiveStudioStatusGuard.EntityName} is refused (stored-row-unreadable): the entity object is not an MJMLModelEntity, so its Status cannot be checked`;
    }
    const result = await PredictiveStudioStatusGuard.Decide(entity, contextUser);
    if (result !== true) EvidenceWriteAuthorisations.Instance.Revoke(entity);
    return result;
  }

  /** The decision for one save of a model row. */
  protected static async Decide(entity: MJMLModelEntity, contextUser: UserInfo | undefined): Promise<boolean | string> {
    const authorised = StatusWriteAuthorisations.Instance.Take(entity);
    const persisted = await PredictiveStudioStatusGuard.ReadPersistedStatus(entity, contextUser);
    const decision = StatusWriteRules.DecideStatusWrite(entity.Status, persisted, authorised, !!entity.TransactionGroup, entity.ServingWhileUnevaluated);
    if (decision.Allow === false) return PredictiveStudioStatusGuard.refusal(entity, decision.Reason, PredictiveStudioStatusGuard.explain(entity, decision.Reason, persisted, authorised));
    if (decision.Reason !== 'gate-authorised' || authorised === null) return true;
    return PredictiveStudioStatusGuard.CheckAuthorisedTransition(entity, authorised, contextUser);
  }

  /**
   * The persisted `Status` and `ServingWhileUnevaluated` of the row, read by the guard itself on the entity's provider
   * (`Fields: ['ID', 'Status', 'ServingWhileUnevaluated']`, never `OldValue`): `create` for an unsaved entity;
   * `unreadable` when the provider is not a metadata provider, there is no user, the read fails, finds no row or a flag
   * that is not a boolean (fail closed, N7).
   */
  protected static async ReadPersistedStatus(entity: MJMLModelEntity, contextUser: UserInfo | undefined): Promise<PersistedStatus> {
    if (!entity.IsSaved) return { Kind: 'create' };
    const ctx = GuardContexts.ForSave(entity.ProviderToUse, contextUser);
    if (ctx === null) return { Kind: 'unreadable' };
    try {
      const row = await GuardContexts.ReadById<Pick<MJMLModelEntity, 'ID' | 'Status' | 'ServingWhileUnevaluated'>>(
        PredictiveStudioStatusGuard.EntityName, entity.ID, ['ID', 'Status', 'ServingWhileUnevaluated'], ctx,
      );
      if (row === null || typeof row.ServingWhileUnevaluated !== 'boolean') return { Kind: 'unreadable' };
      return { Kind: 'row', Status: row.Status, ServingWhileUnevaluated: row.ServingWhileUnevaluated };
    } catch {
      return { Kind: 'unreadable' };
    }
  }

  /**
   * The checks of a gate-authorised transition beyond the authorisation itself: a move into `Published` re-derived from
   * the stored rows, and `Published → Unevaluated` only for a Registry Check job run. A read that fails is
   * `stored-row-unreadable` (fail closed).
   */
  protected static async CheckAuthorisedTransition(model: MJMLModelEntity, t: StatusWriteAuthorisation, contextUser: UserInfo | undefined): Promise<boolean | string> {
    const ctx = GuardContexts.ForSave(model.ProviderToUse, contextUser);
    if (ctx === null) return PredictiveStudioStatusGuard.refusal(model, 'stored-row-unreadable', 'the provider cannot read the stored rows this transition is checked against');
    try {
      if (t.To === 'Published') return await PredictiveStudioStatusGuard.ReverifyPublish(model, t, ctx);
      if (t.From === 'Published' && t.To === 'Unevaluated') return await PredictiveStudioStatusGuard.CheckDemotionInitiator(model, t.Initiator, ctx);
      return true;
    } catch (error) {
      return PredictiveStudioStatusGuard.refusal(model, 'stored-row-unreadable', `a read of the stored rows failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Re-derives an authorised move into `Published` from the stored rows for the authorisation's initiator, as the gate
   * does: against the incumbent it replaces ({@link ResolveIncumbent}), or with no incumbent for a rollback from
   * `Archived`; refuses with the loader's refusal kind, the re-verification's reason, or `incumbent-not-current` when a
   * model is still Published or `Replaces` is not this pipeline's archived incumbent.
   */
  protected static async ReverifyPublish(model: MJMLModelEntity, t: StatusWriteAuthorisation, ctx: RegistryContext): Promise<boolean | string> {
    const loaded = await StoredPublishInputsLoader.Load(model.ID, t.Initiator, ctx);
    if ('kind' in loaded) {
      const why = loaded.kind === 'not-servable' ? loaded.reason : `no stored row for ML Model ${model.ID}`;
      return PredictiveStudioStatusGuard.publishRefusal(model, t, loaded.kind, why);
    }
    // The decision's own refusals come first; then the incumbent's consistency with the archive-first publish.
    const incumbent = await PredictiveStudioStatusGuard.ResolveIncumbent(model, t, loaded, ctx);
    const against = t.From === 'Archived' ? null : incumbent.Ok ? incumbent.ModelID : loaded.CurrentPublishedModelID;
    const reverified = PublishRules.ReverifyPublish({ ...loaded, CurrentPublishedModelID: against });
    if (reverified.Ok === false) return PredictiveStudioStatusGuard.publishRefusal(model, t, reverified.Reason, reverified.Detail);
    if (incumbent.Ok === false) return PredictiveStudioStatusGuard.publishRefusal(model, t, 'incumbent-not-current', incumbent.Detail);
    return true;
  }

  /**
   * The incumbent a publish is re-derived against. The gate archives it before the publish save, so the loader's
   * current Published model is null and the authorisation's `Replaces` names it: it must be a model of the same pipeline
   * that is now `Archived`. A model still Published at the publish save is refused, whether or not `Replaces` names it:
   * the save would leave two Published rows; with neither, the publish is a pipeline's first.
   */
  protected static async ResolveIncumbent(
    model: MJMLModelEntity, t: StatusWriteAuthorisation, loaded: StoredPublishInputs, ctx: RegistryContext,
  ): Promise<{ readonly Ok: true; readonly ModelID: string | null } | { readonly Ok: false; readonly Detail: string }> {
    const replaces = t.Replaces || null;
    const current = loaded.CurrentPublishedModelID;
    if (current !== null) {
      const named = replaces !== null && UUIDsEqual(replaces, current) ? 'the model it replaces' : 'a model this publish does not replace';
      return { Ok: false, Detail: `ML Model ${current} (${named}) is still Published; the gate archives the model it replaces before the publish` };
    }
    if (replaces === null) return { Ok: true, ModelID: null };
    const row = await GuardContexts.ReadById<Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Status'>>(PredictiveStudioStatusGuard.EntityName, replaces, ['ID', 'PipelineID', 'Status'], ctx);
    if (row === null) return { Ok: false, Detail: `the replaced model ${replaces} does not exist` };
    if (!UUIDsEqual(row.PipelineID, model.PipelineID)) return { Ok: false, Detail: `the replaced model ${replaces} belongs to pipeline ${row.PipelineID}, not ${model.PipelineID}` };
    if (row.Status !== 'Archived') return { Ok: false, Detail: `the replaced model ${replaces} is ${row.Status}, not archived before the publish` };
    return { Ok: true, ModelID: replaces };
  }

  /** `Published → Unevaluated` only for a Registry Check job run (R9): the run's job's type is resolved by name. */
  protected static async CheckDemotionInitiator(model: MJMLModelEntity, initiator: Actor, ctx: RegistryContext): Promise<boolean | string> {
    const why = await PredictiveStudioStatusGuard.registryCheckRefusal(initiator, ctx);
    if (why === null) return true;
    return PredictiveStudioStatusGuard.refusal(
      model, 'actor-not-permitted',
      `Published → Unevaluated is authorised only for a run of a ${PredictiveStudioStatusGuard.RegistryCheckJobTypeName} job (ruling R9); ${why}`,
    );
  }

  /** Null when `initiator` is a Registry Check job run, else why it is not. */
  private static async registryCheckRefusal(initiator: Actor, ctx: RegistryContext): Promise<string | null> {
    if (initiator.kind !== 'scheduled-job') return `the initiator is a ${initiator.kind}, not a scheduled job run`;
    const runId = initiator.scheduledJobRunId;
    const run = await GuardContexts.ReadById<Pick<MJScheduledJobRunEntity, 'ID' | 'ScheduledJobID'>>('MJ: Scheduled Job Runs', runId, ['ID', 'ScheduledJobID'], ctx);
    if (run === null) return `no Scheduled Job Run has the ID '${runId}'`;
    const job = await GuardContexts.ReadById<Pick<MJScheduledJobEntity, 'ID' | 'JobTypeID'>>('MJ: Scheduled Jobs', run.ScheduledJobID, ['ID', 'JobTypeID'], ctx);
    if (job === null) return `the job ${run.ScheduledJobID} of run ${runId} does not exist`;
    const type = await GuardContexts.ReadById<Pick<MJScheduledJobTypeEntity, 'ID' | 'Name'>>('MJ: Scheduled Job Types', job.JobTypeID, ['ID', 'Name'], ctx);
    if (type === null) return `the job type ${job.JobTypeID} of run ${runId} does not exist`;
    if (type.Name !== PredictiveStudioStatusGuard.RegistryCheckJobTypeName) return `run ${runId} is a run of a '${type.Name}' job`;
    return null;
  }

  /** What a refusal reason means for this save. */
  private static explain(model: MJMLModelEntity, reason: StatusRefusalReason, persisted: PersistedStatus, t: StatusWriteAuthorisation | null): string {
    const from = persisted.Kind === 'row' ? persisted.Status : '(unread)';
    switch (reason) {
      case 'serving-flag-set-outside-migration':
        return `ServingWhileUnevaluated ${persisted.Kind === 'row' ? `${persisted.ServingWhileUnevaluated} → ` : 'on a create: '}${model.ServingWhileUnevaluated} is refused: `
          + 'only the pre-change data migration\'s SQL sets it (D4-61), and clearing it takes a model out of service, so it is cleared only inside a gate-authorised transition that carries the change';
      case 'create-not-draft':
        return `a new model row is created as Draft, not ${model.Status}; only the lifecycle gate moves it on`;
      case 'stored-row-unreadable':
        return 'its stored row could not be read through the entity\'s provider, so the save cannot be checked (fail closed)';
      case 'deferred-in-transaction-group':
        return 'a save inside a TransactionGroup is deferred past the guard\'s read of the stored row; save it outside the group';
      case 'status-changed-outside-gate':
        return `Status ${from} → ${model.Status} was not authorised by the lifecycle gate; change it through LifecycleGate (Evaluate, Publish, Archive)`;
      case 'gate-transition-mismatch':
        return `the gate authorised ${t === null ? 'nothing' : `${t.From} → ${t.To}`}, not ${from} → ${model.Status}`;
      default: {
        const unhandled: never = reason;
        return `refused (${String(unhandled)})`;
      }
    }
  }

  private static publishRefusal(model: MJMLModelEntity, t: StatusWriteAuthorisation, reason: string, detail: string): string {
    return PredictiveStudioStatusGuard.refusal(
      model, reason,
      `the stored rows do not re-derive ${t.From} → Published (${detail}); an authorisation alone is not proof that the lifecycle gate ran (D4-58)`,
    );
  }

  private static refusal(model: MJMLModelEntity, reason: string, why: string): string {
    return `Predictive Studio status guard: the save of ML Model ${model.ID} is refused (${reason}): ${why}.`;
  }
}
