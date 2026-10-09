/**
 * Unit tests for the AI CLI's database provider: it connects with settings from mj.config.cjs or,
 * failing that, the environment — as MJAPI does — and it can be closed so the process can exit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakePool {
    Config: Record<string, unknown>;
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}

const state = vi.hoisted(() => ({
    pools: [] as FakePool[],
    connectError: null as Error | null,
    providerConfigArgs: [] as unknown[][],
    fileConfig: null as Record<string, unknown> | null,
}));

const setupClient = vi.hoisted(() => vi.fn());

vi.mock('mssql', () => {
    class ConnectionPool {
        Config: Record<string, unknown>;
        connect: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        constructor(config: Record<string, unknown>) {
            this.Config = config;
            this.connect = vi.fn(async () => {
                if (state.connectError) throw state.connectError;
                return this;
            });
            this.close = vi.fn(async () => undefined);
            state.pools.push(this);
        }
    }
    return { default: { ConnectionPool } };
});

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SetupSQLServerClient: setupClient,
    SQLServerProviderConfigData: class {
        constructor(...args: unknown[]) {
            state.providerConfigArgs.push(args);
        }
    },
}));

vi.mock('@memberjunction/dynamic-packages', () => ({
    DiscoverMJConfig: vi.fn(() => ({ config: {}, configFilePath: undefined })),
    EffectiveProcessId: vi.fn((id: string) => id),
    LoadDynamicPackages: vi.fn(async () => undefined),
    StderrDynamicPackagesLogger: {},
}));

vi.mock('cosmiconfig', () => ({
    cosmiconfig: () => ({
        search: vi.fn(async () => (state.fileConfig ? { config: state.fileConfig, filepath: '/ws/mj.config.cjs' } : null)),
    }),
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

// Side-effect registrations the provider module imports
vi.mock('@memberjunction/core-actions', () => ({}));
vi.mock('@memberjunction/ai-agents', () => ({}));
vi.mock('@memberjunction/ai-openai', () => ({}));
vi.mock('@memberjunction/ai-groq', () => ({}));
vi.mock('@memberjunction/ai-anthropic', () => ({}));

import {
    BuildSqlServerConnectionConfig,
    CloseMJProvider,
    GetMJProvider,
    InitializeMJProvider,
} from '../lib/mj-provider';

const DB_ENV: Record<string, string> = {
    DB_HOST: 'sql-server',
    DB_PORT: '1444',
    DB_USERNAME: 'mj_api',
    DB_PASSWORD: 'secret',
    DB_DATABASE: 'MJ_Workspace',
    DB_TRUST_SERVER_CERTIFICATE: '1',
};

const FAKE_PROVIDER = { Name: 'fake provider' };

describe('BuildSqlServerConnectionConfig', () => {
    const complete = { dbHost: 'db', dbPort: 1433, dbDatabase: 'MJ', dbUsername: 'u', dbPassword: 'p' };

    it('builds the connection from the settings', () => {
        const config = BuildSqlServerConnectionConfig(complete);
        expect(config).toMatchObject({ server: 'db', port: 1433, database: 'MJ', user: 'u', password: 'p' });
        expect(config.options).toMatchObject({ encrypt: true, enableArithAbort: true });
    });

    // It was hard-coded to true; now it follows DB_TRUST_SERVER_CERTIFICATE / dbTrustServerCertificate like MJAPI.
    it('trusts the server certificate only when told to', () => {
        expect(BuildSqlServerConnectionConfig(complete).options?.trustServerCertificate).toBe(false);
        expect(BuildSqlServerConnectionConfig({ ...complete, dbTrustServerCertificate: true }).options?.trustServerCertificate).toBe(true);
        expect(BuildSqlServerConnectionConfig({ ...complete, dbTrustServerCertificate: 'Y' }).options?.trustServerCertificate).toBe(true);
        expect(BuildSqlServerConnectionConfig({ ...complete, dbTrustServerCertificate: 'N' }).options?.trustServerCertificate).toBe(false);
    });

    it('passes a named instance through', () => {
        expect(BuildSqlServerConnectionConfig({ ...complete, dbInstanceName: 'SQLEXPRESS' }).options?.instanceName).toBe('SQLEXPRESS');
        expect(BuildSqlServerConnectionConfig(complete).options?.instanceName).toBeUndefined();
    });

    it('defaults the host and port', () => {
        const config = BuildSqlServerConnectionConfig({ dbDatabase: 'MJ', dbUsername: 'u', dbPassword: 'p' });
        expect(config.server).toBe('localhost');
        expect(config.port).toBe(1433);
    });

    it('names DB_DATABASE when the database is missing', () => {
        expect(() => BuildSqlServerConnectionConfig({ dbUsername: 'u', dbPassword: 'p' })).toThrow(/DB_DATABASE/);
    });

    it('names DB_USERNAME and DB_PASSWORD when credentials are missing', () => {
        expect(() => BuildSqlServerConnectionConfig({ dbDatabase: 'MJ' })).toThrow(/DB_USERNAME and DB_PASSWORD/);
    });
});

describe('InitializeMJProvider / CloseMJProvider', () => {
    const savedEnv = Object.fromEntries(Object.keys(DB_ENV).map((key) => [key, process.env[key]]));

    beforeEach(() => {
        state.pools.length = 0;
        state.providerConfigArgs.length = 0;
        state.connectError = null;
        state.fileConfig = null;
        setupClient.mockReset();
        setupClient.mockResolvedValue(FAKE_PROVIDER);
        Object.assign(process.env, DB_ENV);
    });

    afterEach(async () => {
        await CloseMJProvider();
        for (const [key, value] of Object.entries(savedEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    // An installed workspace: mj.config.cjs has its db* lines commented out; .env has the values.
    it('connects with the environment when mj.config.cjs sets no database settings', async () => {
        state.fileConfig = { output: [], commands: [] };

        const provider = await InitializeMJProvider();

        expect(provider).toBe(FAKE_PROVIDER);
        expect(state.pools).toHaveLength(1);
        expect(state.pools[0].Config).toMatchObject({
            server: 'sql-server',
            port: 1444,
            database: 'MJ_Workspace',
            user: 'mj_api',
            password: 'secret',
        });
        expect(state.pools[0].Config.options).toMatchObject({ trustServerCertificate: true });
    });

    // A non-zero interval starts a setInterval that is not unref'd and kept the process alive.
    it('turns off the metadata refresh timer', async () => {
        await InitializeMJProvider();

        expect(state.providerConfigArgs).toHaveLength(1);
        const [pool, schema, refreshIntervalSeconds] = state.providerConfigArgs[0];
        expect(pool).toBe(state.pools[0]);
        expect(schema).toBe('__mj');
        expect(refreshIntervalSeconds).toBe(0);
    });

    it('returns the same provider when called again', async () => {
        await InitializeMJProvider();
        await InitializeMJProvider();

        expect(state.pools).toHaveLength(1);
        expect(setupClient).toHaveBeenCalledTimes(1);
    });

    it('closes the pool and forgets the provider, so the process can exit', async () => {
        await InitializeMJProvider();
        const pool = state.pools[0];

        await CloseMJProvider();

        expect(pool.close).toHaveBeenCalledTimes(1);
        expect(GetMJProvider()).toBeNull();

        // Closing again is harmless, and a later initialize starts fresh.
        await CloseMJProvider();
        expect(pool.close).toHaveBeenCalledTimes(1);
        await InitializeMJProvider();
        expect(state.pools).toHaveLength(2);
    });

    it('closes the pool when startup fails after connecting', async () => {
        setupClient.mockRejectedValue(new Error('metadata load failed'));

        await expect(InitializeMJProvider()).rejects.toThrow(/metadata load failed/);

        expect(state.pools[0].close).toHaveBeenCalledTimes(1);
        expect(GetMJProvider()).toBeNull();
    });

    it('explains a rejected login', async () => {
        state.connectError = Object.assign(new Error('Login failed'), { code: 'ELOGIN' });

        await expect(InitializeMJProvider()).rejects.toThrow(/Database authentication failed/);
    });

    it('explains an unreachable server, naming host and port', async () => {
        state.connectError = Object.assign(new Error('Failed to connect'), { code: 'ESOCKET' });

        await expect(InitializeMJProvider()).rejects.toThrow(/Could not reach sql-server:1444/);
    });

    it('passes the missing-settings error through untouched', async () => {
        delete process.env.DB_DATABASE;

        await expect(InitializeMJProvider()).rejects.toThrow(/^❌ Database configuration missing/);
        expect(state.pools).toHaveLength(0);
    });
});
