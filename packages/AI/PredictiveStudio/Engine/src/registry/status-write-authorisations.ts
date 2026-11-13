/**
 * @module registry/status-write-authorisations
 *
 * The lifecycle gate's authorisation of one `MJ: ML Models.Status` save, handed to the PreSave status guard
 * (`PredictiveStudioStatusGuard`, M3.3) without a field on the entity: the gate authorises `{ From, To, Initiator }` for
 * the exact entity instance it is about to save, the guard takes it (one-shot) during that save, and the gate revokes
 * whatever is left once the save returns, so an authorisation never outlives the save it was issued for. A `WeakMap`
 * keyed by the instance keeps a dropped entity collectable, and the `BaseSingleton` keeps one map per process even when
 * the module is loaded twice (D4-90's plan note).
 *
 * Only `LifecycleGate`'s steps authorise (M4b.1 later adds `CheckInitiator` before them, and M7.2's `AdoptPublished`
 * checks its initiator itself). Because this is an exported singleton any module can fill, the guard does not treat an
 * authorisation as proof that the gate ran: it re-derives every authorised move into `Published` from the stored rows,
 * passing the `Initiator` into `StoredPublishInputs`, and resolves the initiator of `Published → Unevaluated` (D4-58, R9).
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';
import type { Actor, StatusWriteAuthorisationRule } from '@memberjunction/predictive-studio-core';

/**
 * One authorised transition, by persisted status (with `ServingWhileUnevaluated: false` when it clears that flag, the
 * only change of it an authorisation can carry), with who started the gate call that issued it and, for a move into
 * `Published`, the model the publish replaces.
 */
export interface StatusWriteAuthorisation extends StatusWriteAuthorisationRule {
  readonly Initiator: Actor;
  /**
   * The Published model this publish replaces, which the gate archives FIRST in the same transaction (so the guard reads
   * no Published incumbent and re-derives against this one's stored comparison); absent or null for none.
   */
  readonly Replaces?: string | null;
}

/** The process-wide map of the gate's pending status-write authorisations. */
export class StatusWriteAuthorisations extends BaseSingleton<StatusWriteAuthorisations> {
  private readonly pending = new WeakMap<MJMLModelEntity, StatusWriteAuthorisation>();

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): StatusWriteAuthorisations {
    return super.getInstance<StatusWriteAuthorisations>();
  }

  /** Authorises the next status save of `entity` from `From` to `To` by `Initiator`, replacing any earlier authorisation of it. */
  public Authorise(entity: MJMLModelEntity, t: StatusWriteAuthorisation): void {
    this.pending.set(entity, t);
  }

  /** The authorisation of `entity`, removed as it is read: a second call returns null. The status guard calls this. */
  public Take(entity: MJMLModelEntity): StatusWriteAuthorisation | null {
    const found = this.pending.get(entity);
    if (found === undefined) return null;
    this.pending.delete(entity);
    return found;
  }

  /** Drops any authorisation of `entity` that the save did not take (a save refused before the guard ran). */
  public Revoke(entity: MJMLModelEntity): void {
    this.pending.delete(entity);
  }
}
