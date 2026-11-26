/**
 * @module agent/agent-session-lease
 *
 * `AgentSessionLease` — liveness before recovery (D5-38, D5-43). A Model Development Agent session can be continued by
 * two runs at once (a dashboard approval's `resumeAgent` and a chat turn). A run is **live** when it is `Running` and its
 * newest heartbeat (`LastHeartbeatAt`, stamped every 30 s; stale runs are force-failed by `AgentRunWatchdog`), or its
 * `StartedAt` while no heartbeat has been stamped yet, is younger than {@link AgentSessionLease.STALE_AFTER_MINUTES},
 * measured on the database clock (`DbNow` from the session lock Query), never this process's clock.
 *
 * A run's first turn takes the session lock (`Predictive Studio: Lock Agent Session`, through `PublishLocks`' retry,
 * inside `ProviderTransactions.Run`). Under it, a live sibling run of the session that started first (by `StartedAt`,
 * then ID) holds the session: the run replies `session-busy` and runs nothing. The rule needs no write, so two runs that
 * start together both see each other and exactly one proceeds.
 */
import { RunView, type IMetadataProvider } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDSet, UUIDsEqual } from '@memberjunction/global';

import { PublishLocks, SYSTEM_CLOCK, type GateClock } from '../registry/publish-locks';
import { ProviderTransactions } from '../registry/provider-transactions';
import type { RegistryContext } from '../registry/registry-context';

/** The run columns liveness reads. */
export type LivenessRun = Pick<MJAIAgentRunEntity, 'Status' | 'LastHeartbeatAt' | 'StartedAt'>;

/** A sibling run that holds the session. */
export type SessionBusy = { readonly kind: 'session-busy'; readonly liveRunId: string };  // case-violation-ok-legacy-back-compat: refusal JSON shape

/** The session a turn continues: the run taking the turn and every run of the session. */
export interface SessionLockOptions {
  /** The run taking its first turn. */
  readonly CurrentRunID: string;
  /** Every run of the session (the `LastRunID` walk), the session run included. */
  readonly SessionRunIDs: readonly string[];
  /** The clock the lock wait sleeps on (tests pass a fake); liveness never reads it. */
  readonly Clock?: GateClock;
}

/** Thrown when the session lock is not acquired within the lock wait. */
export class AgentSessionLockTimeoutError extends Error {
  constructor(public readonly SessionRunID: string, public readonly Attempts: number, public readonly LastError: string) {
    super(`Predictive Studio: the lock of agent session ${SessionRunID} was not acquired after ${Attempts} attempts (${LastError})`);
    this.name = 'AgentSessionLockTimeoutError';
  }
}

/** A sibling run row the lock reads. */
type SiblingRow = Pick<MJAIAgentRunEntity, 'ID' | 'Status' | 'StartedAt' | 'LastHeartbeatAt'>;

/** Session liveness and the session lock. */
export class AgentSessionLease {
  /** How long a run stays live after its newest heartbeat (or its start), in minutes: 20 missed 30 s heartbeats (D5-38). */
  public static readonly STALE_AFTER_MINUTES = 10;
  /** The stored Query that takes the session lock and returns the database clock. */
  public static readonly LOCK_QUERY = 'Predictive Studio: Lock Agent Session';

  /** True when `run` is `Running` and heard from within {@link STALE_AFTER_MINUTES} of `dbNow` (the database clock). */
  public static IsLive(run: LivenessRun, dbNow: Date): boolean {
    if (run.Status !== 'Running') return false;
    // `??` because a run has no heartbeat until one interval after it starts (D5-43); StartedAt is never null
    const heardAt = new Date(run.LastHeartbeatAt ?? run.StartedAt).getTime();
    return dbNow.getTime() - heardAt < AgentSessionLease.STALE_AFTER_MINUTES * 60_000;
  }

  /**
   * Runs `work` under the session lock, unless a live sibling run of the session that started first holds the session.
   * `work` receives the database clock read under the lock.
   *
   * @throws AgentSessionLockTimeoutError when the lock is not acquired within the lock wait
   */
  public static async WithSessionLock<T>(sessionRunId: string, work: (dbNow: Date) => Promise<T>, ctx: RegistryContext, options: SessionLockOptions): Promise<T | SessionBusy> {
    return ProviderTransactions.Run(ctx, `the turn lock of agent session ${sessionRunId}`, async () => {
      const dbNow = await AgentSessionLease.lock(sessionRunId, ctx, options.Clock ?? SYSTEM_CLOCK);
      const holder = await AgentSessionLease.liveHolder(options, dbNow, ctx);
      if (holder !== null) return { kind: 'session-busy', liveRunId: holder } as const;
      return work(dbNow);
    });
  }

  /** Takes the lock and returns the database clock it read. */
  private static async lock(sessionRunId: string, ctx: RegistryContext, clock: GateClock): Promise<Date> {
    const lock = await PublishLocks.Acquire(AgentSessionLease.LOCK_QUERY, { SessionRunID: sessionRunId }, ctx, clock);
    if (lock.Acquired === false) throw new AgentSessionLockTimeoutError(sessionRunId, lock.Attempts, lock.LastError);
    const dbNow = lock.Rows[0]?.DbNow;
    if (dbNow === undefined || dbNow === null) throw new Error(`Predictive Studio: the lock of agent session ${sessionRunId} returned no database clock (is ${sessionRunId} a run?)`);
    return new Date(dbNow);
  }

  /** The live sibling that started before the current run (the session's holder), or null. */
  private static async liveHolder(options: SessionLockOptions, dbNow: Date, ctx: RegistryContext): Promise<string | null> {
    const current = await AgentSessionLease.runningSiblings(options, ctx);
    const me = current.find((r) => UUIDsEqual(r.ID, options.CurrentRunID));
    const myStart = me ? new Date(me.StartedAt).getTime() : Number.POSITIVE_INFINITY;
    const earlier = current
      .filter((r) => !UUIDsEqual(r.ID, options.CurrentRunID) && AgentSessionLease.IsLive(r, dbNow))
      .filter((r) => {
        const start = new Date(r.StartedAt).getTime();
        return start < myStart || (start === myStart && r.ID.toUpperCase() < options.CurrentRunID.toUpperCase());
      })
      .sort((a, b) => new Date(a.StartedAt).getTime() - new Date(b.StartedAt).getTime());
    return earlier[0]?.ID ?? null;
  }

  /** The session's `Running` runs: its runs and the runs continuing any of them (read under the lock, not cached). */
  private static async runningSiblings(options: SessionLockOptions, ctx: RegistryContext): Promise<SiblingRow[]> {
    const ids = [...new UUIDSet([...options.SessionRunIDs, options.CurrentRunID])].map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    const provider: IMetadataProvider = ctx.Provider;
    const result = await RunView.FromMetadataProvider(provider).RunView<SiblingRow>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: `Status='Running' AND (ID IN (${ids}) OR LastRunID IN (${ids}))`,
      Fields: ['ID', 'Status', 'StartedAt', 'LastHeartbeatAt'],
      ResultType: 'simple',
      BypassCache: true,
    }, ctx.ContextUser);
    if (!result.Success) throw new Error(`Predictive Studio: reading the running runs of an agent session failed: ${result.ErrorMessage || 'unknown error'}`);
    return result.Results;
  }
}
