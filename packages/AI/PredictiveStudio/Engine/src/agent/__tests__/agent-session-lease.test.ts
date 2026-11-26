/**
 * A2 attack list — session liveness and the session lock (`AgentSessionLease`, D5-38, D5-43): attack 22.
 *
 * The provider double opens a transaction (`BeginEntityTransaction`) and answers the `Lock Agent Session` stored Query
 * with the database clock (`DbNow`); the session's runs come from a spied `RunView`. The clock of this process is never
 * read for liveness, so skewing it (`vi.setSystemTime`) changes nothing. Casts: the provider and `RunView` doubles, where
 * they are handed over.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { AgentSessionLease } from '../agent-session-lease';
import type { RegistryContext } from '../../registry/registry-context';

const DB_NOW = new Date('2026-11-26T10:00:00.000Z');
const SESSION = 'S0000000-0000-4000-8000-000000000001';
const DASHBOARD_RUN = 'R1000000-0000-4000-8000-000000000001';
const CHAT_RUN = 'R2000000-0000-4000-8000-000000000002';

interface RunRow { ID: string; Status: 'Running' | 'Completed' | 'Failed' | 'AwaitingFeedback'; StartedAt: Date; LastHeartbeatAt: Date | null; LastRunID: string | null }
let runs: RunRow[];
let queries: { QueryName: string; Parameters: Record<string, string> }[];
let lockHeld: boolean;

const provider = {
  SupportsEntityTransactions: true,
  BeginEntityTransaction: vi.fn(async () => ({ Commit: vi.fn(async () => undefined), Rollback: vi.fn(async () => undefined) })),
  RunQuery: vi.fn(async (p: { QueryName: string; Parameters: Record<string, string> }) => {
    queries.push(p);
    if (lockHeld) return { Success: false, ErrorMessage: 'Lock request time out period exceeded.', Results: [] };
    return { Success: true, Results: [{ ID: SESSION, DbNow: DB_NOW.toISOString() }] };
  }),
} as unknown as IMetadataProvider;
const ctx: RegistryContext = { ContextUser: { ID: 'U1' } as unknown as UserInfo, Provider: provider };

beforeEach(() => {
  queries = [];
  lockHeld = false;
  runs = [];
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
    RunView: vi.fn(async () => ({ Success: true, Results: runs.filter((r) => r.Status === 'Running') })),
  } as unknown as RunView);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const minutesBefore = (m: number, from = DB_NOW): Date => new Date(from.getTime() - m * 60_000);

describe('AgentSessionLease.IsLive', () => {
  it('a Running run with a heartbeat younger than 10 minutes is live; older is not; not Running is not', () => {
    expect(AgentSessionLease.STALE_AFTER_MINUTES).toBe(10);
    expect(AgentSessionLease.IsLive({ Status: 'Running', LastHeartbeatAt: minutesBefore(9), StartedAt: minutesBefore(60) }, DB_NOW)).toBe(true);
    expect(AgentSessionLease.IsLive({ Status: 'Running', LastHeartbeatAt: minutesBefore(11), StartedAt: minutesBefore(60) }, DB_NOW)).toBe(false);
    expect(AgentSessionLease.IsLive({ Status: 'Completed', LastHeartbeatAt: minutesBefore(1), StartedAt: minutesBefore(2) }, DB_NOW)).toBe(false);
  });

  it('before its first heartbeat (LastHeartbeatAt NULL) a run is measured from StartedAt (D5-43)', () => {
    expect(AgentSessionLease.IsLive({ Status: 'Running', LastHeartbeatAt: null, StartedAt: new Date(DB_NOW.getTime() - 5_000) }, DB_NOW)).toBe(true);
    expect(AgentSessionLease.IsLive({ Status: 'Running', LastHeartbeatAt: null, StartedAt: minutesBefore(11) }, DB_NOW)).toBe(false);
  });

  it('is measured on the database clock: a process clock skewed +15 min changes nothing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DB_NOW.getTime() + 15 * 60_000));
    expect(AgentSessionLease.IsLive({ Status: 'Running', LastHeartbeatAt: null, StartedAt: new Date(DB_NOW.getTime() - 5_000) }, DB_NOW)).toBe(true);
  });
});

describe('attack 22: two live runs of one session', () => {
  const options = (current: string) => ({ CurrentRunID: current, SessionRunIDs: [SESSION] });

  it('a dashboard resume and a chat turn at once: the earlier-started proceeds, the other is session-busy and runs nothing', async () => {
    runs = [
      { ID: DASHBOARD_RUN, Status: 'Running', StartedAt: new Date(DB_NOW.getTime() - 4_000), LastHeartbeatAt: null, LastRunID: SESSION },
      { ID: CHAT_RUN, Status: 'Running', StartedAt: new Date(DB_NOW.getTime() - 3_000), LastHeartbeatAt: null, LastRunID: SESSION },
    ];
    const work = vi.fn(async () => 'proceeded');
    expect(await AgentSessionLease.WithSessionLock(SESSION, work, ctx, options(DASHBOARD_RUN))).toBe('proceeded');
    expect(await AgentSessionLease.WithSessionLock(SESSION, work, ctx, options(CHAT_RUN))).toEqual({ kind: 'session-busy', liveRunId: DASHBOARD_RUN });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('both before their first heartbeat with the process clock skewed +15 min: still one proceeds, one is busy (D5-43)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(DB_NOW.getTime() + 15 * 60_000));
    runs = [
      { ID: DASHBOARD_RUN, Status: 'Running', StartedAt: new Date(DB_NOW.getTime() - 2_000), LastHeartbeatAt: null, LastRunID: SESSION },
      { ID: CHAT_RUN, Status: 'Running', StartedAt: new Date(DB_NOW.getTime() - 1_000), LastHeartbeatAt: null, LastRunID: SESSION },
    ];
    const results = await Promise.all([
      AgentSessionLease.WithSessionLock(SESSION, async () => 'a', ctx, options(DASHBOARD_RUN)),
      AgentSessionLease.WithSessionLock(SESSION, async () => 'b', ctx, options(CHAT_RUN)),
    ]);
    expect(results.filter((r) => typeof r === 'string')).toHaveLength(1);
    expect(results.filter((r) => typeof r !== 'string')).toHaveLength(1);
  });

  it('a sibling whose heartbeat went stale is not live: the run proceeds', async () => {
    runs = [
      { ID: DASHBOARD_RUN, Status: 'Running', StartedAt: minutesBefore(40), LastHeartbeatAt: minutesBefore(12), LastRunID: SESSION },
      { ID: CHAT_RUN, Status: 'Running', StartedAt: minutesBefore(0), LastHeartbeatAt: null, LastRunID: SESSION },
    ];
    expect(await AgentSessionLease.WithSessionLock(SESSION, async () => 'proceeded', ctx, options(CHAT_RUN))).toBe('proceeded');
  });

  it('takes the Lock Agent Session stored Query with the session run, and returns its database clock to the work', async () => {
    runs = [{ ID: CHAT_RUN, Status: 'Running', StartedAt: DB_NOW, LastHeartbeatAt: null, LastRunID: SESSION }];
    let seen: Date | null = null;
    await AgentSessionLease.WithSessionLock(SESSION, async (dbNow) => { seen = dbNow; return 1; }, ctx, options(CHAT_RUN));
    expect(queries[0]).toMatchObject({ QueryName: AgentSessionLease.LOCK_QUERY, Parameters: { SessionRunID: SESSION } });
    expect(seen).toEqual(DB_NOW);
  });
});
