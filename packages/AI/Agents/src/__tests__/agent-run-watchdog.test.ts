import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore, ShutdownRegistry } from '@memberjunction/global';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { AgentRunWatchdog } from '../agent-run-watchdog';

/** Predictable T-SQL-flavored dialect so we can assert on the generated SQL. The watchdog now
 *  reaches the DB only through stored procs (writes) + the base view (reads), so the proc-call
 *  builder is the key piece to mock. */
const mockDialect = {
    QuoteIdentifier: (n: string) => `[${n}]`,
    QuoteSchema: (s: string, o: string) => `[${s}].[${o}]`,
    QuoteStringLiteral: (v: string) => `'${v.replace(/'/g, "''")}'`,
    CurrentTimestampUTC: () => 'GETUTCDATE()',
    Coalesce: (a: string, b: string) => `COALESCE(${a}, ${b})`,
    ProcedureCallSyntax: (schema: string, name: string, params: string[]) => `EXEC [${schema}].[${name}] ${params.join(', ')}`,
};

interface MockProvider {
    Dialect: typeof mockDialect;
    EntityByName: (name: string) => { SchemaName: string; BaseTable: string; BaseView: string } | undefined;
    ExecuteSQL: ReturnType<typeof vi.fn>;
}

function makeProvider(resolveEntity = true): MockProvider {
    return {
        Dialect: mockDialect,
        EntityByName: (name: string) =>
            resolveEntity && name === 'MJ: AI Agent Runs'
                ? { SchemaName: '__mj', BaseTable: 'AIAgentRun', BaseView: 'vwAIAgentRuns' }
                : undefined,
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
        it('calls the sweep proc and returns 0 when it reports no stale runs', async () => {
            const p = makeProvider();
            p.ExecuteSQL.mockResolvedValueOnce([{ RunsFailed: 0 }]);

            const failed = await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser);

            expect(failed).toBe(0);
            expect(p.ExecuteSQL).toHaveBeenCalledTimes(1);
            expect(String(p.ExecuteSQL.mock.calls[0][0])).toContain('spSweepStaleAIAgentRuns');
        });

        it('returns the count of force-failed runs reported by the proc', async () => {
            const p = makeProvider();
            p.ExecuteSQL.mockResolvedValueOnce([{ RunsFailed: 2 }]);

            const failed = await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser);

            expect(failed).toBe(2);
            // One atomic proc call — no separate scan + update.
            expect(p.ExecuteSQL).toHaveBeenCalledTimes(1);
            const sql = String(p.ExecuteSQL.mock.calls[0][0]);
            expect(sql).toContain('[__mj].[spSweepStaleAIAgentRuns]');
        });

        it('returns 0 (and does not throw) when the entity cannot be resolved from metadata', async () => {
            const p = makeProvider(false);
            const failed = await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser);
            expect(failed).toBe(0);
            expect(p.ExecuteSQL).not.toHaveBeenCalled();
        });

        it('passes a custom stale threshold to the proc', async () => {
            const p = makeProvider();
            p.ExecuteSQL.mockResolvedValueOnce([{ RunsFailed: 1 }]);
            await AgentRunWatchdog.SweepOrphanedRuns(asProvider(p), mockUser, { staleThresholdMinutes: 17 });
            const sql = String(p.ExecuteSQL.mock.calls[0][0]);
            expect(sql).toContain('spSweepStaleAIAgentRuns');
            expect(sql).toContain('17'); // threshold passed as the proc argument
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

        it('stamps a heartbeat for tracked runs via the heartbeat proc on the timer', async () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);

            await vi.advanceTimersByTimeAsync(30_000);

            const heartbeatCall = p.ExecuteSQL.mock.calls.find(c => /spStampAIAgentRunHeartbeat/.test(String(c[0])));
            expect(heartbeatCall).toBeTruthy();
            expect(String(heartbeatCall![0])).toContain(`'${RUN_A}'`);
        });

        it('cancels in-flight runs via the cancel proc and clears the set on Shutdown', async () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);
            p.ExecuteSQL.mockClear();

            await wd.Shutdown();

            expect(wd.TrackedCount).toBe(0);
            const cancelCall = p.ExecuteSQL.mock.calls.find(c => /spCancelAIAgentRun/.test(String(c[0])));
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
