import { describe, it, expect, vi } from 'vitest';

// TaskGraphProviderFactory imports config.ts (which validates DB env at module load); UserCache needs a live
// provider. Both are replaced; the tests pass explicit dependencies.
vi.mock('../config.js', () => ({ configInfo: {}, mj_core_schema: '__mj' }));
vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/generic-database-provider')>()),
    UserCache: { get Users() { return []; } },
}));

import type { DatabaseProviderBase, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { WorkQueueEngine, WorkQueueHostConfig, WorkQueueProviderSource } from '@memberjunction/work-queue-engine';
import { workQueueSchema } from '../services/workQueueConfig.js';
import type { WorkQueueConfig } from '../services/workQueueConfig.js';
import {
    BuildWorkQueueHostConfig, CreateWorkQueueInstanceID, IsWorkQueueHostDisabledByEnv, MJServerWorkQueueProviderSource,
    StartWorkQueueHost, WORK_QUEUE_DISABLE_ENV,
} from '../services/WorkQueueHostService.js';
import type { WorkQueueHostStartDependencies } from '../services/WorkQueueHostService.js';

const PROVIDER = { Name: 'server-provider' } as unknown as DatabaseProviderBase;
const SYSTEM_USER = { ID: 'AAAAAAAA-1111-4111-8111-000000000001', Email: 'system@memberjunction.org' } as UserInfo;
const ENGINE = { Name: 'engine' } as unknown as WorkQueueEngine;
const PROVIDER_SOURCE: WorkQueueProviderSource = { CreateProvider: async (): Promise<IMetadataProvider> => PROVIDER };

interface Recorder {
    Dependencies: WorkQueueHostStartDependencies;
    Started: WorkQueueHostConfig[];
    EngineCalls: number;
}

function recorder(users: UserInfo[] = [SYSTEM_USER], env: Record<string, string | undefined> = {}): Recorder {
    const result: Recorder = {
        Started: [],
        EngineCalls: 0,
        Dependencies: {
            Env: env,
            FindUserByEmail: email => users.find(user => user.Email === email),
            ConfigureEngine: async (user, provider) => {
                expect(user).toBe(SYSTEM_USER);
                expect(provider).toBe(PROVIDER);
                result.EngineCalls++;
                return ENGINE;
            },
            CreateHost: (config, engine, user, provider, source) => {
                expect([engine, user, provider, source]).toEqual([ENGINE, SYSTEM_USER, PROVIDER, PROVIDER_SOURCE]);
                return { Start: async () => { result.Started.push(config); } };
            },
        },
    };
    return result;
}

function enabled(overrides: Partial<WorkQueueConfig> = {}): WorkQueueConfig {
    return { ...workQueueSchema.parse({ enabled: true }), ...overrides };
}

describe('workQueue configuration', () => {
    it('defaults to disabled, running every MJWorker subscription once enabled', () => {
        expect(workQueueSchema.parse({})).toEqual({
            enabled: false, systemUserEmail: 'system@memberjunction.org', subscriptions: [{ name: '*', concurrency: 4 }],
            idlePollMinMs: 250, idlePollMaxMs: 5000, shutdownDrainMs: 8000, sweeperEnabled: true, sweeperIntervalMs: 60000,
            reconcileIntervalMs: 30000,
        });
    });

    it('rejects an idle poll maximum below the minimum', () => {
        expect(workQueueSchema.safeParse({ idlePollMinMs: 1000, idlePollMaxMs: 500 }).success).toBe(false);
    });
});

describe('host configuration helpers', () => {
    it('maps the section to a host config and disables the sweeper when asked', () => {
        const config = enabled({ subscriptions: [{ name: 'email.unsubscribe', concurrency: 8 }], sweeperEnabled: false });
        expect(BuildWorkQueueHostConfig(config, 'api-1')).toEqual({
            InstanceID: 'api-1', Subscriptions: [{ Name: 'email.unsubscribe', Concurrency: 8 }], IdlePollMinMs: 250,
            IdlePollMaxMs: 5000, ShutdownDrainMs: 8000, SweeperIntervalMs: 0, ReconcileIntervalMs: 30000,
        });
    });

    it('builds a unique instance ID from host, pid and random entropy', () => {
        const first = CreateWorkQueueInstanceID({ HOSTNAME: 'api-7' });
        expect(first).toMatch(new RegExp(`^api-7-${process.pid}-[0-9a-f]{8}$`));
        expect(CreateWorkQueueInstanceID({ HOSTNAME: 'api-7' })).not.toBe(first);
    });

    it(`treats only ${WORK_QUEUE_DISABLE_ENV}=1 as the kill switch`, () => {
        expect(IsWorkQueueHostDisabledByEnv({ [WORK_QUEUE_DISABLE_ENV]: '1' })).toBe(true);
        expect(IsWorkQueueHostDisabledByEnv({ [WORK_QUEUE_DISABLE_ENV]: 'true' })).toBe(false);
        expect(IsWorkQueueHostDisabledByEnv({})).toBe(false);
    });
});

describe('StartWorkQueueHost', () => {
    it('starts nothing when the section is disabled', async () => {
        const rec = recorder();
        expect(await StartWorkQueueHost(workQueueSchema.parse({}), PROVIDER, PROVIDER_SOURCE, rec.Dependencies)).toBeNull();
        expect(rec.EngineCalls).toBe(0);
    });

    it('starts nothing when the kill switch is set', async () => {
        const rec = recorder([SYSTEM_USER], { [WORK_QUEUE_DISABLE_ENV]: '1' });
        expect(await StartWorkQueueHost(enabled(), PROVIDER, PROVIDER_SOURCE, rec.Dependencies)).toBeNull();
        expect(rec.EngineCalls).toBe(0);
    });

    it('refuses to start without the system user', async () => {
        const rec = recorder([]);
        await expect(StartWorkQueueHost(enabled(), PROVIDER, PROVIDER_SOURCE, rec.Dependencies)).rejects.toThrow('System user not found with email: system@memberjunction.org');
    });

    it('names the setting to fix when the placeholder email from DEFAULT_SERVER_CONFIG is still in effect', async () => {
        const rec = recorder();
        await expect(StartWorkQueueHost(enabled({ systemUserEmail: 'not.set@nowhere.com' }), PROVIDER, PROVIDER_SOURCE, rec.Dependencies))
            .rejects.toThrow('set workQueue.systemUserEmail');
    });

    it('configures the engine, then creates and starts the host', async () => {
        const rec = recorder();
        const host = await StartWorkQueueHost(enabled(), PROVIDER, PROVIDER_SOURCE, rec.Dependencies);
        expect(host).not.toBeNull();
        expect(rec.EngineCalls).toBe(1);
        expect(rec.Started).toHaveLength(1);
        expect(rec.Started[0]).toMatchObject({ Subscriptions: [{ Name: '*', Concurrency: 4 }], SweeperIntervalMs: 60000 });
    });
});

describe('MJServerWorkQueueProviderSource', () => {
    it('falls back to the shared server provider when there is no SQL Server pool', async () => {
        const source = new MJServerWorkQueueProviderSource(null, PROVIDER);
        expect(await source.CreateProvider()).toBe(PROVIDER);
    });
});
