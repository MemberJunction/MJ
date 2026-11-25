/**
 * The A2A server's config schema: `statusPollIntervalMs` has a floor, because every poll is a database read
 * per running or watched task, and 0 would turn each into a tight loop.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ userConfig: {} as Record<string, unknown> }));

vi.mock('@memberjunction/core', () => ({ LogStatus: vi.fn(), LogError: vi.fn() }));
vi.mock('@memberjunction/server', () => ({ DEFAULT_SERVER_CONFIG: {} }));
vi.mock('@memberjunction/config', () => ({ mergeConfigs: (base: object, user: object) => ({ ...base, ...user }) }));
vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: () => ({ search: () => ({ config: h.userConfig, filepath: 'mj.config.cjs', isEmpty: false }) }),
}));

const REQUIRED = {
    databaseSettings: { connectionTimeout: 1000, requestTimeout: 1000 },
    dbDatabase: 'MJ',
    dbUsername: 'user',
    dbPassword: 'password',
    mjCoreSchema: '__mj',
};

/** Loads the config module fresh over a config file with these A2A settings. */
async function loadWith(a2aServerSettings: Record<string, unknown>) {
    h.userConfig = { ...REQUIRED, a2aServerSettings };
    vi.resetModules();
    return import('../config');
}

describe('A2A server config: statusPollIntervalMs', () => {
    it('refuses an interval under one second', async () => {
        await expect(loadWith({ statusPollIntervalMs: 0 })).rejects.toThrow('Configuration validation failed');
        await expect(loadWith({ statusPollIntervalMs: 999 })).rejects.toThrow('Configuration validation failed');
    });

    it('accepts one second and defaults to five', async () => {
        expect((await loadWith({ statusPollIntervalMs: 1000 })).a2aServerSettings?.statusPollIntervalMs).toBe(1000);
        expect((await loadWith({})).a2aServerSettings?.statusPollIntervalMs).toBe(5000);
    });
});
