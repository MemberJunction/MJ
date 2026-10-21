import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore, ShutdownRegistry } from '@memberjunction/global';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { AgentRunWatchdog } from '../agent-run-watchdog';

/** Predictable T-SQL-flavored dialect so we can assert on the generated SQL. The watchdog
 *  reaches the DB through stored procs (writes) and RunView over the entity (reads), so the
 *  proc-call builder and the provider's RunView are the pieces to mock. */
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
    /** `RunView.FromMetadataProvider(provider)` routes every entity read here. */
    RunView: ReturnType<typeof vi.fn>;
}

/** The RunView params the watchdog's reads are asserted on. */
interface ReadParams {
    EntityName: string;
    ExtraFilter: string;
    Fields: string[];
    BypassCache?: boolean;
    IgnoreMaxRows?: boolean;
}

function makeProvider(resolveEntity = true): MockProvider {
    return {
        Dialect: mockDialect,
        EntityByName: (name: string) =>
            resolveEntity && name === 'MJ: AI Agent Runs'
                ? { SchemaName: '__mj', BaseTable: 'AIAgentRun', BaseView: 'vwAIAgentRuns' }
                : undefined,
        ExecuteSQL: vi.fn().mockResolvedValue([]),
        RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
    };
}

const isPoll = (params: ReadParams) => /Status='Cancelled'/.test(params.ExtraFilter);

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

        it('batches multiple tracked runs into a single heartbeat round-trip (one EXEC per id)', async () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);
            wd.Track(RUN_B, asProvider(p), mockUser);

            await vi.advanceTimersByTimeAsync(30_000);

            const heartbeatCalls = p.ExecuteSQL.mock.calls.filter(c => /spStampAIAgentRunHeartbeat/.test(String(c[0])));
            // One batched statement for both runs — not one call per run.
            expect(heartbeatCalls.length).toBe(1);
            const sql = String(heartbeatCalls[0][0]);
            expect(sql).toContain(`'${RUN_A}'`);
            expect(sql).toContain(`'${RUN_B}'`);
            expect(sql).toContain('\n');
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

        it('the periodic prune reads the still-running subset through the entity and drops the rest', async () => {
            const p = makeProvider();
            p.RunView.mockImplementation(async (params: ReadParams) =>
                ({ Success: true, Results: /Status='Running'/.test(params.ExtraFilter) ? [{ ID: RUN_A }] : [] }));
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser);
            wd.Track(RUN_B, asProvider(p), mockUser);

            await vi.advanceTimersByTimeAsync(5 * 60_000); // the sweep interval

            const prune = p.RunView.mock.calls.map(c => c[0] as ReadParams).find(x => /Status='Running'/.test(x.ExtraFilter));
            expect(prune).toBeTruthy();
            expect(prune!.EntityName).toBe('MJ: AI Agent Runs');
            expect(prune!.Fields).toEqual(['ID']);
            expect(prune!.ExtraFilter).toContain(`'${RUN_A}'`);
            expect(prune!.ExtraFilter).toContain(`'${RUN_B}'`);
            expect(wd.TrackedCount).toBe(1);
            expect(wd.IsStoppable(RUN_B)).toBe(false);
        });

        it('Untrack removes a run from the guarded set and suspends active-run timers when idle', () => {
            const p = makeProvider();
            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(p), mockUser, new AbortController());
            wd.Track(RUN_B, asProvider(p), mockUser, new AbortController());
            expect(wd.HasActiveRunTimers).toBe(true);
            wd.Untrack(RUN_A);
            expect(wd.TrackedCount).toBe(1);
            expect(wd.HasActiveRunTimers).toBe(true);
            wd.Untrack(RUN_B);
            expect(wd.TrackedCount).toBe(0);
            expect(wd.HasActiveRunTimers).toBe(false);
        });

        it('isolates per-run provider and contextUser across multiple tenants during heartbeat and cancellation polling', async () => {
            const providerTenantA = makeProvider();
            const providerTenantB = makeProvider();
            const userTenantA = { ID: 'user-tenant-a' } as UserInfo;
            const userTenantB = { ID: 'user-tenant-b' } as UserInfo;
            const controllerA = new AbortController();
            const controllerB = new AbortController();

            const wd = AgentRunWatchdog.Instance;
            wd.Track(RUN_A, asProvider(providerTenantA), userTenantA, controllerA);
            wd.Track(RUN_B, asProvider(providerTenantB), userTenantB, controllerB);

            await vi.advanceTimersByTimeAsync(30_000);

            // Each tenant's provider receives only its own run's heartbeat and poll with its own user
            const hbA = providerTenantA.ExecuteSQL.mock.calls.find(c => /spStampAIAgentRunHeartbeat/.test(String(c[0])));
            const hbB = providerTenantB.ExecuteSQL.mock.calls.find(c => /spStampAIAgentRunHeartbeat/.test(String(c[0])));
            expect(hbA).toBeTruthy();
            expect(String(hbA![0])).toContain(RUN_A);
            expect(String(hbA![0])).not.toContain(RUN_B);
            expect(hbA![3]).toBe(userTenantA);

            expect(hbB).toBeTruthy();
            expect(String(hbB![0])).toContain(RUN_B);
            expect(String(hbB![0])).not.toContain(RUN_A);
            expect(hbB![3]).toBe(userTenantB);

            const pollA = providerTenantA.RunView.mock.calls.find(c => isPoll(c[0] as ReadParams));
            const pollB = providerTenantB.RunView.mock.calls.find(c => isPoll(c[0] as ReadParams));
            expect(pollA?.[1]).toBe(userTenantA);
            expect(pollB?.[1]).toBe(userTenantB);
        });
    });
});

describe('AgentRunWatchdog stop relay (cancellation poll)', () => {
    beforeEach(() => {
        resetSingletons();
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    /** Routes the poll's read to `cancelledRows` and every other read to `[]`. */
    function providerWithCancelledRows(cancelledRows: Array<{ ID: string; CancellationReason: string | null }>): MockProvider {
        const p = makeProvider();
        p.RunView.mockImplementation(async (params: ReadParams) =>
            ({ Success: true, Results: isPoll(params) ? cancelledRows : [] }));
        return p;
    }

    it('aborts a tracked run whose row was marked Cancelled with User Request, using the user-cancel reason', async () => {
        const p = providerWithCancelledRows([{ ID: RUN_A, CancellationReason: 'User Request' }]);
        const controller = new AbortController();
        const wd = AgentRunWatchdog.Instance;
        wd.Track(RUN_A, asProvider(p), mockUser, controller);

        await vi.advanceTimersByTimeAsync(3_000);

        expect(controller.signal.aborted).toBe(true);
        expect(controller.signal.reason).toBe(AgentRunWatchdog.UserCancelAbortReason);
        // Aborted runs leave the guarded set — nothing else to heartbeat for them.
        expect(wd.TrackedCount).toBe(0);
        expect(wd.IsStoppable(RUN_A)).toBe(false);
    });

    it('polls only the runs that registered a controller, and only while any did', async () => {
        const p = providerWithCancelledRows([]);
        const wd = AgentRunWatchdog.Instance;
        wd.Track(RUN_A, asProvider(p), mockUser); // no controller — a stop cannot reach it
        await vi.advanceTimersByTimeAsync(3_000);
        expect(p.RunView.mock.calls.some(c => isPoll(c[0] as ReadParams))).toBe(false);

        wd.Track(RUN_B, asProvider(p), mockUser, new AbortController());
        await vi.advanceTimersByTimeAsync(3_000);
        const pollCall = p.RunView.mock.calls.find(c => isPoll(c[0] as ReadParams));
        expect(pollCall).toBeTruthy();
        const params = pollCall![0] as ReadParams;
        expect(params.ExtraFilter).toContain(`'${RUN_B}'`);
        expect(params.ExtraFilter).not.toContain(`'${RUN_A}'`);
        // Through the entity, not a hand-built SELECT: the named fields, no cache, no row cap.
        expect(params.EntityName).toBe('MJ: AI Agent Runs');
        expect(params.Fields).toEqual(['ID', 'CancellationReason']);
        expect(params.BypassCache).toBe(true);
        expect(params.IgnoreMaxRows).toBe(true);
        expect(p.ExecuteSQL.mock.calls.some(c => /SELECT/i.test(String(c[0])))).toBe(false);
        expect(pollCall![1]).toBe(mockUser); // the tracked user's read permission applies
    });

    it('leaves a run alone while its row is still Running', async () => {
        const p = providerWithCancelledRows([]);
        const controller = new AbortController();
        const wd = AgentRunWatchdog.Instance;
        wd.Track(RUN_A, asProvider(p), mockUser, controller);

        await vi.advanceTimersByTimeAsync(9_000);

        expect(controller.signal.aborted).toBe(false);
        expect(wd.TrackedCount).toBe(1);
    });

    it('uses the external-cancel reason when the row carries any other CancellationReason', async () => {
        const p = providerWithCancelledRows([{ ID: RUN_A, CancellationReason: 'System' }]);
        const controller = new AbortController();
        AgentRunWatchdog.Instance.Track(RUN_A, asProvider(p), mockUser, controller);

        await vi.advanceTimersByTimeAsync(3_000);

        expect(controller.signal.aborted).toBe(true);
        expect(controller.signal.reason).toBe(AgentRunWatchdog.ExternalCancelAbortReason);
    });

    it('raises distinct reasons for a user stop and an external cancel, so a reader never confuses them', () => {
        expect(AgentRunWatchdog.UserCancelAbortReason).not.toBe(AgentRunWatchdog.ExternalCancelAbortReason);
    });

    it('RequestCancel aborts in-process without waiting for the poll, once', () => {
        const p = makeProvider();
        const controller = new AbortController();
        const wd = AgentRunWatchdog.Instance;
        wd.Track(RUN_A, asProvider(p), mockUser, controller);

        expect(wd.RequestCancel(RUN_A)).toBe(true);
        expect(controller.signal.aborted).toBe(true);
        expect(controller.signal.reason).toBe(AgentRunWatchdog.UserCancelAbortReason);
        // Already fired and untracked: a second request is a no-op.
        expect(wd.RequestCancel(RUN_A)).toBe(false);
        expect(wd.RequestCancel(RUN_B)).toBe(false);
    });

    it('Untrack drops the controller so a later cancel cannot reach a finished run', () => {
        const p = makeProvider();
        const controller = new AbortController();
        const wd = AgentRunWatchdog.Instance;
        wd.Track(RUN_A, asProvider(p), mockUser, controller);
        wd.Untrack(RUN_A);

        expect(wd.IsStoppable(RUN_A)).toBe(false);
        expect(wd.RequestCancel(RUN_A)).toBe(false);
        expect(controller.signal.aborted).toBe(false);
    });

    it('a failing poll query is logged, not thrown, and the run stays tracked', async () => {
        const p = makeProvider();
        p.RunView.mockImplementation(async (params: ReadParams) => {
            if (isPoll(params)) {
                throw new Error('boom');
            }
            return { Success: true, Results: [] };
        });
        const controller = new AbortController();
        const wd = AgentRunWatchdog.Instance;
        wd.Track(RUN_A, asProvider(p), mockUser, controller);

        await expect(vi.advanceTimersByTimeAsync(3_000)).resolves.toBeTruthy(); // the timer tick itself never rejects

        expect(controller.signal.aborted).toBe(false);
        expect(wd.TrackedCount).toBe(1);
    });
});
