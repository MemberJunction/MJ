/**
 * @module agent/decision-log-write-authorisations
 *
 * The one-shot authorisations that make `MJ: Agent Decision Log` writable only by `AgentDecisionLog.Append` (PR 5, A4;
 * D5-30). `Append` authorises the exact entity instance it is about to save; the log guard (a `PreSave` hook,
 * `AgentDecisionLog.CheckSave`) takes the entry during that save and refuses a create without one, so a row written
 * through GraphQL, an Action, an agent or any other server save — even one interleaved in this process with an
 * `Append` in flight — is refused. `Append` revokes whatever its save left, so an entry never outlives the save it was
 * issued for (PR 4's `PublishRecordWriteAuthorisations` pattern).
 *
 * A `WeakMap` keyed by the instance keeps a dropped entity collectable, and the `BaseSingleton` keeps one map per process
 * even when the module is loaded twice. The map lives in the server process: an API caller cannot fill it.
 */
import type { MJAgentDecisionLogEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';

/** What `Append` authorised a save of an instance for (the log has one writer and one write). */
export type AgentDecisionLogWrite = 'append';

/** The process-wide map of pending decision-log write authorisations. */
export class AgentDecisionLogWriteAuthorisations extends BaseSingleton<AgentDecisionLogWriteAuthorisations> {
  private readonly writes = new WeakMap<MJAgentDecisionLogEntity, AgentDecisionLogWrite>();

  protected constructor() {
    super();
  }

  /** The process-wide instance. */
  public static get Instance(): AgentDecisionLogWriteAuthorisations {
    return super.getInstance<AgentDecisionLogWriteAuthorisations>();
  }

  /**
   * Saves `row` under a one-shot authorisation to append it, revoking whatever the save left. The only way
   * `AgentDecisionLog` saves a row.
   *
   * @returns the save's result (false with the refusal or the database error in `LatestResult`)
   */
  public static async SaveAuthorised(row: MJAgentDecisionLogEntity): Promise<boolean> {
    const auth = AgentDecisionLogWriteAuthorisations.Instance;
    auth.AuthoriseAppend(row);
    try {
      return await row.Save();
    } finally {
      auth.Revoke(row);
    }
  }

  /** Authorises the next save of `row` as an append. */
  public AuthoriseAppend(row: MJAgentDecisionLogEntity): void {
    this.writes.set(row, 'append');
  }

  /** The authorised write of `row`, removed as it is read: a second call returns null. The guard calls this. */
  public Take(row: MJAgentDecisionLogEntity): AgentDecisionLogWrite | null {
    const found = this.writes.get(row);
    if (found === undefined) return null;
    this.writes.delete(row);
    return found;
  }

  /** Drops any entry of `row` its save did not take. */
  public Revoke(row: MJAgentDecisionLogEntity): void {
    this.writes.delete(row);
  }
}
