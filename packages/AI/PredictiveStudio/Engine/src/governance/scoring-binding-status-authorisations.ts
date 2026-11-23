/**
 * @module governance/scoring-binding-status-authorisations
 *
 * The one-shot authorisation of a `MJ: ML Model Scoring Bindings.Status` change (review question 4 of PR #6517): only
 * `ScoringBindings.Withdraw` moves a binding `Active → Withdrawn`, in the same transaction that clears the column copies
 * the binding wrote (§5.8.3), and nothing moves one back (`ScoringBindings.Upsert` refuses a withdrawn binding). The
 * writer authorises the exact entity instance it is about to save; `PredictiveStudioScoringBindingGuard` (a `PreSave`
 * hook) takes the entry during that save and refuses any other `Status` change. A `WeakMap` keyed by the instance
 * keeps a dropped entity collectable; the `BaseSingleton` keeps one map per process. An API caller cannot fill it.
 */
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';

/** One authorised binding status change, by persisted status. */
export interface ScoringBindingStatusChange {
  /** The persisted status the change starts from. */
  readonly From: MJMLModelScoringBindingEntity['Status'];
  /** The status the save writes. */
  readonly To: MJMLModelScoringBindingEntity['Status'];
}

/** The process-wide map of pending binding status-change authorisations. */
export class ScoringBindingStatusAuthorisations extends BaseSingleton<ScoringBindingStatusAuthorisations> {
  private readonly pending = new WeakMap<MJMLModelScoringBindingEntity, ScoringBindingStatusChange>();

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): ScoringBindingStatusAuthorisations {
    return super.getInstance<ScoringBindingStatusAuthorisations>();
  }

  /** Authorises the next save of `binding` to change its status as `change` says, replacing any earlier entry. */
  public Authorise(binding: MJMLModelScoringBindingEntity, change: ScoringBindingStatusChange): void {
    this.pending.set(binding, change);
  }

  /** The authorisation of `binding`, removed as it is read: a second call returns null. The guard calls this. */
  public Take(binding: MJMLModelScoringBindingEntity): ScoringBindingStatusChange | null {
    const found = this.pending.get(binding);
    if (found === undefined) return null;
    this.pending.delete(binding);
    return found;
  }

  /** Drops any authorisation of `binding` its save did not take. */
  public Revoke(binding: MJMLModelScoringBindingEntity): void {
    this.pending.delete(binding);
  }
}
