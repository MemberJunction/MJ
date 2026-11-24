/**
 * @module governance/scoring-binding-authorization-backfills
 *
 * The one-shot authorisations the scoring binding guard accepts for the retention job's backfill (D4-28): the daily
 * backfill gives a binding that has no view authorization the seeded "View Model Predictions" one. Nobody holds a
 * binding's "no authorization", so the guard's rule for a `ViewAuthorizationID` change (the caller holds the stored
 * authorization, D4-60) would refuse it; the backfill authorises exactly that save — from no authorization to the one it
 * names — and nothing else (an authorization a binding already has is never replaced this way).
 */
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';

/** One-shot authorisations of a backfill's `ViewAuthorizationID` assignment, keyed by the entity object being saved. */
export class ScoringBindingAuthorizationBackfills extends BaseSingleton<ScoringBindingAuthorizationBackfills> {
  private readonly pending = new WeakMap<MJMLModelScoringBindingEntity, string>();

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): ScoringBindingAuthorizationBackfills {
    return super.getInstance<ScoringBindingAuthorizationBackfills>();
  }

  /** Authorises the next save of `binding` to assign `authorizationId` to a binding stored without one. */
  public Authorise(binding: MJMLModelScoringBindingEntity, authorizationId: string): void {
    this.pending.set(binding, authorizationId);
  }

  /** The authorised authorization of `binding`, removed as it is read: a second call returns null. The guard calls this. */
  public Take(binding: MJMLModelScoringBindingEntity): string | null {
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
