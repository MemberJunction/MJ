/**
 * #6273 / #6274 — `mj queue work` mints a provider per delivery above concurrency 1 and keeps its sweeper and reconcile
 * timers when long-running; `mj queue sweep` runs one sweeper pass.
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

import { IndependentProviderSource, SharedProviderSource } from '@memberjunction/work-queue-engine';
import type { DatabaseProviderBase } from '@memberjunction/core';
import { QueueWorkProviderSource, QueueWorkTimers, DEFAULT_RECONCILE_INTERVAL_MS, DEFAULT_SWEEPER_INTERVAL_MS } from '../commands/queue/work.js';
import QueueSweep, { FormatSweepCounts } from '../commands/queue/sweep.js';

const provider = { name: 'provider' } as unknown as DatabaseProviderBase;

describe('mj queue work', () => {
    it('shares one provider at concurrency 1 and mints one per delivery above that', () => {
        expect(QueueWorkProviderSource(provider, 1)).toBeInstanceOf(SharedProviderSource);
        expect(QueueWorkProviderSource(provider, 2)).toBeInstanceOf(IndependentProviderSource);
    });

    it('--once neither sweeps nor re-plans; a long-running worker keeps both timers', () => {
        expect(QueueWorkTimers(true, 123, 456)).toEqual({ SweeperIntervalMs: 0, ReconcileIntervalMs: 0 });
        expect(QueueWorkTimers(false, 123, 456)).toEqual({ SweeperIntervalMs: 123, ReconcileIntervalMs: 456 });
        expect(DEFAULT_SWEEPER_INTERVAL_MS).toBe(300000);
        expect(DEFAULT_RECONCILE_INTERVAL_MS).toBe(30000);
    });
});

describe('mj queue sweep', () => {
    beforeEach(() => {
        runSweeperOnce.mockReset();
        hostConfigs.length = 0;
        closeSession.mockReset();
    });

    it('runs one sweeper pass on a host with no subscriptions or timers, then closes the session', async () => {
        runSweeperOnce.mockResolvedValue({ LeasesExpired: 2, RetentionPurged: 10 });
        const logs: string[] = [];
        const command = new QueueSweep([], { runHook: vi.fn() } as never);
        vi.spyOn(command, 'log').mockImplementation((line?: string) => { logs.push(String(line)); });

        await command.run();

        expect(runSweeperOnce).toHaveBeenCalledTimes(1);
        expect(hostConfigs[0]).toMatchObject({ Subscriptions: [], SweeperIntervalMs: 0, ReconcileIntervalMs: 0 });
        expect(logs.join('\n')).toBe('LeasesExpired: 2\nRetentionPurged: 10');
        expect(closeSession).toHaveBeenCalledTimes(1);
    });

    it('says when a pass reported nothing', () => {
        expect(FormatSweepCounts({})).toMatch(/no steps reported/);
    });
});
