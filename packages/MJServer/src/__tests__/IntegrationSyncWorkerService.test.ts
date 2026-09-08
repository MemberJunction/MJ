/**
 * Worker poll-loop pins (tasks.md PR 1 item 8).
 *
 * The worker is the thing that lets a sync outlive the request that asked for it. What must
 * hold: it stays OFF unless explicitly enabled; it never runs more than its configured
 * concurrency; overlapping timer ticks can't stack; losing a claim race is normal traffic,
 * not an error; and stopping the poll loop must never abandon a run that is already
 * executing (its lease is being renewed — killing it here would only strand the row).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The service pulls in config.ts (which eagerly validates DB env at module load) plus the
// integration engine, so stub both — this suite exercises loop behavior only.
vi.mock('../config.js', () => ({ configInfo: {} }));

const mockUsers: Array<{ ID: string; Email: string }> = [];
// UserCache lives in generic-database-provider, not sqlserver-dataprovider — it moved there in the
// platform split. Mocking the old package silently left the service reading the REAL (empty) cache,
// so all 13 tests failed on "System user not found" rather than on anything they were asserting.
vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        get Users() { return mockUsers; },
        Instance: { get Users() { return mockUsers; } },
    },
}));

const mockPollQueuedRuns = vi.fn();
const mockExecuteQueuedRun = vi.fn();
const mockConfig = vi.fn().mockResolvedValue(undefined);
vi.mock('@memberjunction/integration-engine', () => ({
    IntegrationEngine: {
        PollQueuedRuns: (...args: unknown[]) => mockPollQueuedRuns(...args),
        Instance: {
            Config: (...args: unknown[]) => mockConfig(...args),
            ExecuteQueuedRun: (...args: unknown[]) => mockExecuteQueuedRun(...args),
        },
    },
}));

import { IntegrationSyncWorkerService } from '../services/IntegrationSyncWorkerService.js';
import type { IntegrationSyncWorkerConfig } from '../config.js';

function makeConfig(overrides: Partial<IntegrationSyncWorkerConfig> = {}): IntegrationSyncWorkerConfig {
    return {
        enabled: true,
        systemUserEmail: 'system@memberjunction.org',
        pollingIntervalMs: 15_000,
        maxConcurrentRuns: 3,
        ...overrides,
    };
}

/** A never-settling ExecuteQueuedRun, so a run stays "in flight" for as long as the test wants. */
function pendingRun() {
    let release: (v: { Success: boolean; RecordsProcessed: number }) => void = () => undefined;
    const promise = new Promise<{ Success: boolean; RecordsProcessed: number }>(res => { release = res; });
    return { promise, release: () => release({ Success: true, RecordsProcessed: 1 }) };
}

describe('IntegrationSyncWorkerService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockUsers.length = 0;
        mockUsers.push({ ID: 'sys-1', Email: 'system@memberjunction.org' });
        mockPollQueuedRuns.mockReset().mockResolvedValue([]);
        mockExecuteQueuedRun.mockReset().mockResolvedValue({ Success: true, RecordsProcessed: 0 });
        mockConfig.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('opt-in', () => {
        it('is disabled by default, so existing deployments are unaffected', async () => {
            const svc = new IntegrationSyncWorkerService(makeConfig({ enabled: false }));
            expect(svc.IsEnabled).toBe(false);
            await svc.Initialize();
            svc.Start();
            expect(svc.IsRunning).toBe(false);
            await vi.advanceTimersByTimeAsync(60_000);
            expect(mockPollQueuedRuns).not.toHaveBeenCalled();
        });

        it('refuses to start before Initialize resolved the system user', () => {
            const svc = new IntegrationSyncWorkerService(makeConfig());
            expect(() => svc.Start()).toThrow('Not initialized');
        });

        it('fails loudly when the configured system user does not exist', async () => {
            mockUsers.length = 0;
            const svc = new IntegrationSyncWorkerService(makeConfig({ systemUserEmail: 'nobody@example.com' }));
            await expect(svc.Initialize()).rejects.toThrow('nobody@example.com');
        });

        it('matches the system user case-insensitively and configures the engine as that user', async () => {
            mockUsers.length = 0;
            mockUsers.push({ ID: 'sys-1', Email: 'System@MemberJunction.ORG' });
            const svc = new IntegrationSyncWorkerService(makeConfig());
            await svc.Initialize();
            expect(mockConfig).toHaveBeenCalledWith(false, { ID: 'sys-1', Email: 'System@MemberJunction.ORG' });
        });
    });

    describe('polling', () => {
        async function started(config: Partial<IntegrationSyncWorkerConfig> = {}) {
            const svc = new IntegrationSyncWorkerService(makeConfig(config));
            await svc.Initialize();
            svc.Start();
            await vi.advanceTimersByTimeAsync(0); // let the immediate first pass run
            return svc;
        }

        it('drains an already-populated queue immediately rather than waiting a full interval', async () => {
            const svc = await started();
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(1);
            svc.Stop();
        });

        it('keeps polling on the configured interval', async () => {
            const svc = await started({ pollingIntervalMs: 5_000 });
            await vi.advanceTimersByTimeAsync(15_000);
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(4); // immediate + 3 ticks
            svc.Stop();
        });

        it('asks only for as many runs as it has free slots', async () => {
            const first = pendingRun();
            mockPollQueuedRuns.mockResolvedValueOnce([{ ID: 'r1', CompanyIntegrationID: 'c1' }]);
            mockExecuteQueuedRun.mockReturnValueOnce(first.promise);

            const svc = await started({ maxConcurrentRuns: 3, pollingIntervalMs: 1_000 });
            expect(mockPollQueuedRuns.mock.calls[0][1]).toBe(3);

            await vi.advanceTimersByTimeAsync(1_000);
            expect(mockPollQueuedRuns.mock.calls[1][1]).toBe(2); // one slot is occupied
            expect(svc.InFlightCount).toBe(1);

            first.release();
            await vi.advanceTimersByTimeAsync(1_000);
            expect(svc.InFlightCount).toBe(0);
            svc.Stop();
        });

        it('does not poll at all while every slot is busy', async () => {
            const held = [pendingRun(), pendingRun()];
            mockPollQueuedRuns.mockResolvedValueOnce([
                { ID: 'r1', CompanyIntegrationID: 'c1' },
                { ID: 'r2', CompanyIntegrationID: 'c2' },
            ]);
            mockExecuteQueuedRun.mockReturnValueOnce(held[0].promise).mockReturnValueOnce(held[1].promise);

            const svc = await started({ maxConcurrentRuns: 2, pollingIntervalMs: 1_000 });
            expect(svc.InFlightCount).toBe(2);

            await vi.advanceTimersByTimeAsync(5_000);
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(1); // saturated — never asked again

            held.forEach(h => h.release());
            await vi.advanceTimersByTimeAsync(1_000);
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(2);
            svc.Stop();
        });

        it('never starts the same run twice, even if a slow poll returns it again', async () => {
            const held = pendingRun();
            mockPollQueuedRuns.mockResolvedValue([{ ID: 'r1', CompanyIntegrationID: 'c1' }]);
            mockExecuteQueuedRun.mockReturnValueOnce(held.promise);

            const svc = await started({ maxConcurrentRuns: 3, pollingIntervalMs: 1_000 });
            await vi.advanceTimersByTimeAsync(3_000);

            expect(mockExecuteQueuedRun).toHaveBeenCalledTimes(1);
            expect(svc.InFlightCount).toBe(1);
            held.release();
            svc.Stop();
        });

        it('suppresses overlapping passes so a slow query cannot stack up timers', async () => {
            let releasePoll: (v: unknown[]) => void = () => undefined;
            mockPollQueuedRuns.mockReturnValueOnce(new Promise(res => { releasePoll = res; }));

            const svc = await started({ pollingIntervalMs: 1_000 });
            await vi.advanceTimersByTimeAsync(5_000);
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(1); // still waiting on the first

            releasePoll([]);
            await vi.advanceTimersByTimeAsync(1_000);
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(2);
            svc.Stop();
        });

        it('keeps polling after a failed pass instead of wedging the loop', async () => {
            mockPollQueuedRuns.mockRejectedValueOnce(new Error('db down'));
            const svc = await started({ pollingIntervalMs: 1_000 });
            await vi.advanceTimersByTimeAsync(1_000);
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(2);
            svc.Stop();
        });
    });

    describe('run outcomes', () => {
        async function startWithOneCandidate(result: unknown, reject = false) {
            mockPollQueuedRuns.mockResolvedValueOnce([{ ID: 'r1', CompanyIntegrationID: 'c1' }]);
            if (reject) mockExecuteQueuedRun.mockRejectedValueOnce(result);
            else mockExecuteQueuedRun.mockResolvedValueOnce(result);
            const svc = new IntegrationSyncWorkerService(makeConfig());
            await svc.Initialize();
            svc.Start();
            await vi.advanceTimersByTimeAsync(0);
            return svc;
        }

        it('executes a claimed run as the system user and frees the slot afterwards', async () => {
            const svc = await startWithOneCandidate({ Success: true, RecordsProcessed: 12 });
            expect(mockExecuteQueuedRun).toHaveBeenCalledWith('r1', { ID: 'sys-1', Email: 'system@memberjunction.org' });
            expect(svc.InFlightCount).toBe(0);
            svc.Stop();
        });

        it('treats a lost claim race as ordinary traffic, not an error', async () => {
            const svc = await startWithOneCandidate({
                Success: false,
                ErrorMessage: "Run r1 is 'In Progress', not 'Queued' — another worker already took it",
                RecordsProcessed: 0,
            });
            expect(console.error).not.toHaveBeenCalled();
            expect(svc.InFlightCount).toBe(0);
            svc.Stop();
        });

        it('frees the slot even when the run throws', async () => {
            const svc = await startWithOneCandidate(new Error('connector exploded'), true);
            expect(svc.InFlightCount).toBe(0);
            svc.Stop();
        });
    });

    describe('Stop', () => {
        it('halts polling but leaves in-flight runs to finish — their leases are still being renewed', async () => {
            const held = pendingRun();
            mockPollQueuedRuns.mockResolvedValueOnce([{ ID: 'r1', CompanyIntegrationID: 'c1' }]);
            mockExecuteQueuedRun.mockReturnValueOnce(held.promise);

            const svc = new IntegrationSyncWorkerService(makeConfig({ pollingIntervalMs: 1_000 }));
            await svc.Initialize();
            svc.Start();
            await vi.advanceTimersByTimeAsync(0);
            expect(svc.InFlightCount).toBe(1);

            svc.Stop();
            expect(svc.IsRunning).toBe(false);
            expect(svc.InFlightCount).toBe(1); // NOT abandoned

            await vi.advanceTimersByTimeAsync(10_000);
            expect(mockPollQueuedRuns).toHaveBeenCalledTimes(1);

            held.release();
            await vi.advanceTimersByTimeAsync(0);
            expect(svc.InFlightCount).toBe(0);
        });

        it('is idempotent', async () => {
            const svc = new IntegrationSyncWorkerService(makeConfig());
            await svc.Initialize();
            svc.Start();
            svc.Stop();
            expect(() => svc.Stop()).not.toThrow();
        });
    });
});
