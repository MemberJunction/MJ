import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore, ShutdownRegistry } from '@memberjunction/global';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { AgentRunWatchdog } from '../agent-run-watchdog';

/** Predictable T-SQL-flavored dialect so we can assert on the generated SQL. */
const mockDialect = {
    QuoteIdentifier: (n: string) => `[${n}]`,
    QuoteSchema: (s: string, o: string) => `[${s}].[${o}]`,
    QuoteStringLiteral: (v: string) => `'${v.replace(/'/g, "''")}'`,
    CurrentTimestampUTC: () => 'GETUTCDATE()',
    Coalesce: (a: string, b: string) => `COALESCE(${a}, ${b})`,
};

interface MockProvider {
    Dialect: typeof mockDialect;
    EntityByName: (name: string) => { SchemaName: string; BaseTable: string } | undefined;
    ExecuteSQL: ReturnType<typeof vi.fn>;
}

function makeProvider(resolveTable = true): MockProvider {
    return {
        Dialect: mockDialect,
        EntityByName: (name: string) =>
            resolveTable && name === 'MJ: AI Agent Runs' ? { SchemaName: '__mj', BaseTable: 'AIAgentRun' } : undefined,
        ExecuteSQL: vi.fn().mockResolvedValue([]),
    };
}

const asProvider = (p: MockProvider) => p as unknown as DatabaseProviderBase;
const mockUser = {} as UserInfo;
const RUN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function resetSingletons(): void {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__AgentRunWatchdog'];
    delete g['___SINGLETON__ShutdownRegistry'];
}

describe('AgentRunWatchdog', () => {
    beforeEach(() => {
        resetSingletons();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    describe('SweepOrphanedRuns', () => {
        it('returns 0 and issues no UPDATE when no runs are stale', async () => {
            const p = makeProvider();
            p.ExecuteSQL.mockResolvedValueOnce([]); // scan finds nothing

            const failed = await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser);

            expect(failed).toBe(0);
            // Only the scan ran — no UPDATE.
            expect(p.ExecuteSQL).toHaveBeenCalledTimes(1);
            expect(String(p.ExecuteSQL.mock.calls[0][0])).toMatch(/^SELECT/);
        });

        it('force-fails stale Running runs and returns the count', async () => {
            const p = makeProvider();
            p.ExecuteSQL
                .mockResolvedValueOnce([{ ID: RUN_A }, { ID: RUN_B }]) // scan
                .mockResolvedValueOnce([]); // update

            const failed = await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser);

            expect(failed).toBe(2);
            expect(p.ExecuteSQL).toHaveBeenCalledTimes(2);
            const updateSql = String(p.ExecuteSQL.mock.calls[1][0]);
            expect(updateSql).toMatch(/UPDATE \[__mj\]\.\[AIAgentRun\]/);
            expect(updateSql).toContain("[Status] = 'Failed'");
            expect(updateSql).toContain("[Status] = 'Running'"); // never touches non-Running rows
            expect(updateSql).toContain('[LastHeartbeatAt] <'); // staleness predicate
        });

        it('returns 0 (and does not throw) when the table cannot be resolved from metadata', async () => {
            const p = makeProvider(false);
            const failed = await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser);
            expect(failed).toBe(0);
            expect(p.ExecuteSQL).not.toHaveBeenCalled();
        });

        it('honors a custom stale threshold in the failure reason', async () => {
            const p = makeProvider();
            p.ExecuteSQL.mockResolvedValueOnce([{ ID: RUN_A }]).mockResolvedValueOnce([]);
            await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser, { staleThresholdMinutes: 17 });
            const updateSql = String(p.ExecuteSQL.mock.calls[1][0]);
            expect(updateSql).toContain('17 minute(s)');
        });
    });

    describe('Track / heartbeat / Shutdown', () => {
        it('tracks valid run IDs and ignores malformed ones', () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);
            wd.Track('not-a-uuid', asProvider(p), mockUser);
            expect(wd.TrackedCount).toBe(1);
        });

        it('registers with the ShutdownRegistry on first track', () => {
            const p = makeProvider();
            AgentRunWatchdog.Instance.Track(RUN_A, asProvider(p), mockUser);
            const names = ShutdownRegistry.Instance.List().map(i => i.ShutdownName);
            expect(names).toContain('AgentRunWatchdog');
        });

        it('stamps a DB-clock heartbeat for tracked runs on the timer', async () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);

            await vi.advanceTimersByTimeAsync(30_000);

            const heartbeatCall = p.ExecuteSQL.mock.calls.find(c => /SET \[LastHeartbeatAt\] = GETUTCDATE\(\)/.test(String(c[0])));
            expect(heartbeatCall).toBeTruthy();
            expect(String(heartbeatCall![0])).toContain(`'${RUN_A}'`);
            expect(String(heartbeatCall![0])).toContain("[Status] = 'Running'");
        });

        it('cancels in-flight runs and clears the set on Shutdown', async () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);
            p.ExecuteSQL.mockClear();

            await wd.Shutdown();

            expect(wd.TrackedCount).toBe(0);
            const cancelCall = p.ExecuteSQL.mock.calls.find(c => /\[Status\] = 'Cancelled'/.test(String(c[0])));
            expect(cancelCall).toBeTruthy();
            expect(String(cancelCall![0])).toContain(`'${RUN_A}'`);
        });

        it('Untrack removes a run from the guarded set', () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);
            wd.Track(RUN_B, asProvider(p), mockUser);
            wd.Untrack(RUN_A);
            expect(wd.TrackedCount).toBe(1);
        });
    });
});
