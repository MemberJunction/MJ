import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mutable cosmiconfig result so each test can vary mj.config.cjs contents.
const h = vi.hoisted(() => ({ config: {} as Record<string, unknown> }));
vi.mock('cosmiconfig', () => ({
    cosmiconfig: () => ({ search: async () => ({ config: h.config }) })
}));

import { LoadDbConfig, LoadClientConfig } from '../config';

const ENV_KEYS = [
    'DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE',
    'MJ_API_KEY', 'GRAPHQL_PORT', 'GRAPHQL_ROOT_PATH', 'MJAPI_URL'
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    h.config = {};
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) { delete process.env[k]; } else { process.env[k] = saved[k]; }
    }
});

describe('LoadDbConfig', () => {
    it('throws a clear error when no DB settings are present', async () => {
        await expect(LoadDbConfig()).rejects.toThrow(/Missing DB settings/);
    });

    it('resolves from env with Schema "__mj" and Port 1433 defaults', async () => {
        process.env.DB_HOST = 'h';
        process.env.DB_USERNAME = 'u';
        process.env.DB_PASSWORD = 'p';
        process.env.DB_DATABASE = 'd';
        const cfg = await LoadDbConfig();
        expect(cfg).toEqual({ Host: 'h', Port: 1433, User: 'u', Password: 'p', Database: 'd', Schema: '__mj' });
    });

    it('lets mj.config.cjs databaseSettings take precedence over env', async () => {
        process.env.DB_HOST = 'envhost';
        h.config = {
            databaseSettings: { host: 'cfghost', user: 'u', password: 'p', database: 'd', port: 1500, mjCoreSchema: 'custom' }
        };
        const cfg = await LoadDbConfig();
        expect(cfg.Host).toBe('cfghost');
        expect(cfg.Port).toBe(1500);
        expect(cfg.Schema).toBe('custom');
    });
});

describe('LoadClientConfig', () => {
    it('throws when MJ_API_KEY is unset', () => {
        expect(() => LoadClientConfig()).toThrow(/MJ_API_KEY/);
    });

    it('composes the localhost URL and honors MJAPI_URL override', () => {
        process.env.MJ_API_KEY = 'k';
        process.env.GRAPHQL_PORT = '4000';
        process.env.GRAPHQL_ROOT_PATH = '/';
        expect(LoadClientConfig()).toEqual({ Url: 'http://localhost:4000/', MJAPIKey: 'k' });

        process.env.MJAPI_URL = 'https://api.example.com/graphql';
        expect(LoadClientConfig().Url).toBe('https://api.example.com/graphql');
    });

    it('normalizes a root path lacking a leading slash', () => {
        process.env.MJ_API_KEY = 'k';
        process.env.GRAPHQL_PORT = '5000';
        process.env.GRAPHQL_ROOT_PATH = 'api';
        expect(LoadClientConfig().Url).toBe('http://localhost:5000/api');
    });
});
