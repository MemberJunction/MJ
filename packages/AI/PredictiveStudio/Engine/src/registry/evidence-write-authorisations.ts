/**
 * @module registry/evidence-write-authorisations
 *
 * The one exception to write-once stored evidence (D4-61): §5.6's back-fill of a pre-change `MJ: ML Models` row, whose
 * `Delivery` and `ArtifactSha256` are still null, writes them for the first time. Only M7.2's `PreGateModelMigration`
 * fills this map, for the exact entity instance it is about to save; `PredictiveStudioEvidenceGuard` takes the entry
 * (one-shot) during that save and still checks a written `Delivery` against the one rebuilt from the row's stored
 * training run, so an entry alone never lets an arbitrary delivery through. A `WeakMap` keyed by the instance keeps a
 * dropped entity collectable, and the `BaseSingleton` keeps one map per process even when the module is loaded twice.
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';

/** A write-once model column whose first non-null write the pre-change migration may authorise. */
export type BackFilledEvidenceField = 'Delivery' | 'ArtifactSha256';

/** The process-wide map of the pre-change migration's pending first-write authorisations. */
export class EvidenceWriteAuthorisations extends BaseSingleton<EvidenceWriteAuthorisations> {
  private readonly pending = new WeakMap<MJMLModelEntity, readonly BackFilledEvidenceField[]>();

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): EvidenceWriteAuthorisations {
    return super.getInstance<EvidenceWriteAuthorisations>();
  }

  /** Authorises the first non-null write of `fields` in the next save of `entity`, replacing any earlier entry. */
  public Authorise(entity: MJMLModelEntity, fields: readonly BackFilledEvidenceField[]): void {
    this.pending.set(entity, [...fields]);
  }

  /** The fields authorised for `entity`, removed as they are read: a second call returns `[]`. The evidence guard calls this. */
  public Take(entity: MJMLModelEntity): readonly BackFilledEvidenceField[] {
    const found = this.pending.get(entity);
    if (found === undefined) return [];
    this.pending.delete(entity);
    return found;
  }

  /**
   * Drops any entry of `entity` its save did not take. The status guard calls this when it refuses a save: `PreSave`
   * hooks stop at the first refusal, so the evidence guard never runs to take it.
   */
  public Revoke(entity: MJMLModelEntity): void {
    this.pending.delete(entity);
  }
}
