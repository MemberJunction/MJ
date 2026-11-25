/**
 * #6273 — `mj queue work` hands the host a provider source that mints one provider per delivery, at every concurrency.
 * #6274 — `mj queue sweep` runs one sweeper pass and exits non-zero when it failed.
 * The `mj queue work` timers are covered through BuildWorkerHostConfig in work-queue-worker.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runSweeperOnce, hostConfigs, hostDependencies, closeSession, sessionProvider } = vi.hoisted(() => ({
    runSweeperOnce: vi.fn(),
    hostConfigs: [] as Array<Record<string, unknown>>,
    hostDependencies: [] as Array<{ ProviderSource?: unknown }>,
    closeSession: vi.fn(),
    sessionProvider: { name: 'provider' },
}));

vi.mock('@memberjunction/work-queue-engine', () => {
    class SharedProviderSource { constructor(public readonly Provider: unknown) {} async CreateProvider() { return this.Provider; } }
    class IndependentProviderSource { constructor(public readonly Base: unknown) {} async CreateProvider() { return this.Base; } }
    class WorkQueueHost {
        constructor(config: Record<string, unknown>, _engine: unknown, _user: unknown, _provider: unknown, _log: unknown, dependencies: { ProviderSource?: unknown } = {}) {
            hostConfigs.push(config);
            hostDependencies.push(dependencies);
        }
        RunSweeperOnce = runSweeperOnce;
        async RunOnce() { return { Processed: 0, Reason: 'Idle' }; }
        async Shutdown() { return undefined; }
        GetHealth() { return { InstanceID: 'test', Subscriptions: [{ Name: 'venue-import', State: 'Running', InFlight: 0 }] }; }
    }
    return {
        SharedProviderSource,
        IndependentProviderSource,
        WorkQueueHost,
        HOST_SHUT_DOWN_REASON: 'host shut down',
        MJWorkLogger: class {},
        WorkQueueEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined) } },
    };
});
vi.mock('@memberjunction/work-queue-engine/aws', () => ({}));
vi.mock('../lib/work-queue/queue-session.js', () => ({
    OpenWorkQueueSession: vi.fn(async () => ({ Provider: sessionProvider, User: { ID: 'u' }, Close: closeSession })),
}));

import { IndependentProviderSource } from '@memberjunction/work-queue-engine';
import QueueSweep from '../commands/queue/sweep.js';
import QueueWork from '../commands/queue/work.js';

const OCLIF_CONFIG = { runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }) } as never;

describe('mj queue work', () => {
    beforeEach(() => {
        hostConfigs.length = 0;
        hostDependencies.length = 0;
        closeSession.mockReset();
    });

    // The mocked IndependentProviderSource keeps its constructor argument as Base.
    it.each([['1', []], ['2', ['--concurrency', '2']]])('mints a provider per delivery at concurrency %s (#6273)', async (_label, extra) => {
        const command = new QueueWork(['--subscription', 'venue-import', '--once', ...extra], OCLIF_CONFIG);
        vi.spyOn(command, 'log').mockImplementation(() => undefined);

        await command.run();

        expect(hostDependencies).toHaveLength(1);
        expect(hostDependencies[0].ProviderSource).toBeInstanceOf(IndependentProviderSource);
        expect(hostDependencies[0].ProviderSource).toMatchObject({ Base: sessionProvider });
        expect(closeSession).toHaveBeenCalledTimes(1);
    });
});

function sweepCommand(argv: string[] = []): { command: QueueSweep; logs: string[] } {
    const logs: string[] = [];
    const command = new QueueSweep(argv, OCLIF_CONFIG);
    vi.spyOn(command, 'log').mockImplementation((line?: string) => { logs.push(String(line)); });
    return { command, logs };
}

describe('mj queue sweep', () => {
    beforeEach(() => {
        runSweeperOnce.mockReset();
        hostConfigs.length = 0;
        hostDependencies.length = 0;
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

    it('prints the raw counts with --json', async () => {
        const counts = { ExpireLeases: 0, PurgeRetention: 0, PurgeDeduplications: 1 };
        runSweeperOnce.mockResolvedValue(counts);
        const { command, logs } = sweepCommand(['--json']);

        await command.run();

        expect(JSON.parse(logs.join('\n'))).toEqual(counts);
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
