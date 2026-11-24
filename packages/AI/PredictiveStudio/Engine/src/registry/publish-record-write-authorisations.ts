/**
 * @module registry/publish-record-write-authorisations
 *
 * The one-shot authorisations that make `MJ: ML Model Publish Records` writable only by its two writers (review item 1
 * of PR #6517): `SignOffService` creates `sign-off` rows, and `PublishRecords` (the lifecycle gate, and the registry
 * check through it) creates `publish` and `refusal` rows. A writer authorises the exact entity instance it is about to
 * save, for the `Kind` it writes; `PredictiveStudioPublishRecordGuard` (a `PreSave` hook) takes the entry during that
 * save and refuses a new row without one, so a row created through GraphQL, an Action, an agent or any other save is
 * refused before it is written. The ledger is append-only: a delete needs its own one-shot entry (only the TruthSuite
 * harness's cleanup of its own fixture rows sets one), checked by the guard's `PreDelete` hook. The writer revokes
 * whatever its save left, so an entry never outlives the save it was issued for.
 *
 * A `WeakMap` keyed by the instance keeps a dropped entity collectable, and the `BaseSingleton` keeps one map per
 * process even when the module is loaded twice. The map lives in the server process: an API caller cannot fill it.
 */
import type { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';

/** The `Kind` of a publish record (`sign-off`, `publish` or `refusal`). */
export type PublishRecordKind = MJMLModelPublishRecordEntity['Kind'];

/** The process-wide map of pending publish-record create and delete authorisations. */
export class PublishRecordWriteAuthorisations extends BaseSingleton<PublishRecordWriteAuthorisations> {
  private readonly creates = new WeakMap<MJMLModelPublishRecordEntity, PublishRecordKind>();
  private readonly deletes = new WeakSet<MJMLModelPublishRecordEntity>();

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): PublishRecordWriteAuthorisations {
    return super.getInstance<PublishRecordWriteAuthorisations>();
  }

  /**
   * Saves `row` as a new record of its `Kind` under a one-shot create authorisation, revoking whatever the save left.
   * The only way `SignOffService` and `PublishRecords` save a record.
   *
   * @returns the save's result (false with the refusal in `LatestResult`)
   */
  public static async SaveNew(row: MJMLModelPublishRecordEntity): Promise<boolean> {
    const auth = PublishRecordWriteAuthorisations.Instance;
    auth.AuthoriseCreate(row, row.Kind);
    try {
      return await row.Save();
    } finally {
      auth.Revoke(row);
    }
  }

  /** Authorises the next create of `row` as a record of `kind`, replacing any earlier entry of it. */
  public AuthoriseCreate(row: MJMLModelPublishRecordEntity, kind: PublishRecordKind): void {
    this.creates.set(row, kind);
  }

  /** The authorised `Kind` of `row`'s create, removed as it is read: a second call returns null. The guard calls this. */
  public TakeCreate(row: MJMLModelPublishRecordEntity): PublishRecordKind | null {
    const found = this.creates.get(row);
    if (found === undefined) return null;
    this.creates.delete(row);
    return found;
  }

  /** Authorises the next delete of `row` (the TruthSuite harness's cleanup of its own fixture rows). */
  public AuthoriseDelete(row: MJMLModelPublishRecordEntity): void {
    this.deletes.add(row);
  }

  /** True when `row`'s delete was authorised, removing the entry: a second call returns false. The guard calls this. */
  public TakeDelete(row: MJMLModelPublishRecordEntity): boolean {
    return this.deletes.delete(row);
  }

  /** Drops any create or delete entry of `row` its save or delete did not take. */
  public Revoke(row: MJMLModelPublishRecordEntity): void {
    this.creates.delete(row);
    this.deletes.delete(row);
  }
}
