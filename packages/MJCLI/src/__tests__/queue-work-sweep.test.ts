/**
 * #6274 — `mj queue sweep` runs one sweeper pass and exits non-zero when it failed. The `mj queue work` host config
 * (timers, #6273 provider per delivery) is covered in work-queue-worker.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runSweeperOnce, hostConfigs, closeSession } = vi.hoisted(() => ({
    runSweeperOnce: vi.fn(),
    hostConfigs: [] as Array<Record<string, unknown>>,
    closeSession: vi.fn(),
}));

vi.mock('@memberjunction/work-queue-engine', () => {
    class SharedProviderSource { constructor(public readonly Provider: unknown) {} async CreateProvider() { return this.Provider; } }
    class IndependentProviderSource { constructor(public readonly Base: unknown) {} async CreateProvider() { return this.Base; } }
    class WorkQueueHost {
        constructor(config: Record<string, unknown>) { hostConfigs.push(config); }
        RunSweeperOnce = runSweeperOnce;
    }
    return {
        SharedProviderSource,
        IndependentProviderSource,
        WorkQueueHost,
        MJWorkLogger: class {},
        WorkQueueEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined) } },
    };
});
vi.mock('@memberjunction/work-queue-engine/aws', () => ({}));
vi.mock('../lib/work-queue/queue-session.js', () => ({
    OpenWorkQueueSession: vi.fn(async () => ({ Provider: { name: 'provider' }, User: { ID: 'u' }, Close: closeSession })),
}));

import QueueSweep from '../commands/queue/sweep.js';

function sweepCommand(argv: string[] = []): { command: QueueSweep; logs: string[] } {
    const logs: string[] = [];
    const command = new QueueSweep(argv, { runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }) } as never);
    vi.spyOn(command, 'log').mockImplementation((line?: string) => { logs.push(String(line)); });
    return { command, logs };
}

describe('mj queue sweep', () => {
    beforeEach(() => {
        runSweeperOnce.mockReset();
        hostConfigs.length = 0;
        closeSession.mockReset();
    });

    it('runs one sweeper pass on a host with no subscriptions or timers, then closes the session', async () => {
        runSweeperOnce.mockResolvedValue({ ExpireLeases: 2, PurgeRetention: 10, PurgeDeduplications: 0 });
        const { command, logs } = sweepCommand();

        await command.run();

        expect(runSweeperOnce).toHaveBeenCalledTimes(1);
        expect(hostConfigs[0]).toMatchObject({ Subscriptions: [], SweeperIntervalMs: 0, ReconcileIntervalMs: 0 });
        expect(logs.join('\n')).toBe('expired leases 2 · purged retention 10 · purged deduplications 0');
        expect(closeSession).toHaveBeenCalledTimes(1);
    });

    it('exits 0 when another instance holds the sweep lock', async () => {
        runSweeperOnce.mockResolvedValue({});
        const { command, logs } = sweepCommand();

        await command.run();

        expect(logs.join('\n')).toMatch(/holds the sweep lock/);
    });

    it('exits 1 when the pass failed, after closing the session', async () => {
        runSweeperOnce.mockResolvedValue({ Pass: -1 });
        const { command } = sweepCommand();

        await expect(command.run()).rejects.toMatchObject({ oclif: { exit: 1 } });
        expect(closeSession).toHaveBeenCalledTimes(1);
    });
});
