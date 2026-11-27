/**
 * @module agent/build-approval-claim-write-authorisations
 *
 * The one-shot authorisations that make `MJ: ML Build Approval Claims` writable only by its two writers (D5-23, D5-30):
 * `BuildApprovalClaims.Claim` creates a row and `BuildApprovalClaims.Settle` records its outcome. A writer authorises the
 * exact entity instance it is about to save; the claim guard (a `PreSave` hook, `BuildApprovalClaims.CheckSave`) takes
 * the entry during that save and refuses a save without one, so a row written through GraphQL, an Action, an agent or
 * any other server save — even one interleaved in this process with a `Claim` in flight — is refused. The writer revokes
 * whatever its save left, so an entry never outlives the save it was issued for (PR 4's
 * `PublishRecordWriteAuthorisations` pattern).
 *
 * A `WeakMap` keyed by the instance keeps a dropped entity collectable, and the `BaseSingleton` keeps one map per process
 * even when the module is loaded twice. The map lives in the server process: an API caller cannot fill it.
 */
import type { MJMLBuildApprovalClaimEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';

/** What a writer authorised a save of an instance for. */
export type BuildApprovalClaimWrite = 'claim' | 'settle';

/** The process-wide map of pending claim-row write authorisations. */
export class BuildApprovalClaimWriteAuthorisations extends BaseSingleton<BuildApprovalClaimWriteAuthorisations> {
  private readonly writes = new WeakMap<MJMLBuildApprovalClaimEntity, BuildApprovalClaimWrite>();

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): BuildApprovalClaimWriteAuthorisations {
    return super.getInstance<BuildApprovalClaimWriteAuthorisations>();
  }

  /**
   * Saves `row` under a one-shot authorisation of `write`, revoking whatever the save left. The only way
   * `BuildApprovalClaims` saves a claim row.
   *
   * @returns the save's result (false with the refusal or the database error in `LatestResult`)
   */
  public static async SaveAuthorised(row: MJMLBuildApprovalClaimEntity, write: BuildApprovalClaimWrite): Promise<boolean> {
    const auth = BuildApprovalClaimWriteAuthorisations.Instance;
    if (write === 'claim') auth.AuthoriseClaim(row);
    else auth.AuthoriseSettle(row);
    try {
      return await row.Save();
    } finally {
      auth.Revoke(row);
    }
  }

  /** Authorises the next save of `row` as a new claim. */
  public AuthoriseClaim(row: MJMLBuildApprovalClaimEntity): void {
    this.writes.set(row, 'claim');
  }

  /** Authorises the next save of `row` as the settlement of its outcome. */
  public AuthoriseSettle(row: MJMLBuildApprovalClaimEntity): void {
    this.writes.set(row, 'settle');
  }

  /** The authorised write of `row`, removed as it is read: a second call returns null. The guard calls this. */
  public Take(row: MJMLBuildApprovalClaimEntity): BuildApprovalClaimWrite | null {
    const found = this.writes.get(row);
    if (found === undefined) return null;
    this.writes.delete(row);
    return found;
  }

  /** Drops any entry of `row` its save did not take. */
  public Revoke(row: MJMLBuildApprovalClaimEntity): void {
    this.writes.delete(row);
  }
}
