/**
 * Tests for `Config/pg-connection.ts` — the PostgreSQL counterpart to
 * `db-connection.ts`'s `MSSQLConnection()`. Verifies:
 *
 *  - Lazy + module-cached pool (the previous PG path created a fresh pool
 *    every `setupDataSource()` call; the refactor brings the SQL Server
 *    `_pool` cache pattern to PostgreSQL)
 *  - `getPgConfig()` returns `undefined` before `PGConnection()` and the
 *    live config after
 *  - `statement_timeout` GUC is wired on the pool's `connect` event when
 *    `codegenPool.statementTimeoutMs` is set
 *  - `codegenPool` knobs (max, min, idleTimeoutMillis, connectionTimeoutMillis)
 *    flow into the underlying `PGConnectionManager.Initialize` config
 *  - `ClosePGConnection()` resets the module-level cache so the next
 *    `PGConnection()` rebuilds
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks: keep heavy real deps out of the test process ─────────────────
//
// We avoid actually opening a pg.Pool by mocking PGConnectionManager. The
// fake manager records its Initialize() args so we can assert that the
// codegenPool / configInfo values flowed through correctly.

class FakePoolEventBus {
    public listeners: Record<string, Array<(client: unknown) => void>> = {};
    on(event: string, fn: (client: unknown) => void) {
        (this.listeners[event] ??= []).push(fn);
        return this;
    }
}

const fakePool = new FakePoolEventBus();

const initializeMock = vi.fn(async (_config: unknown) => {
    /* no-op — real Initialize would call new pg.Pool() + verify */
});

const closeMock = vi.fn(async () => { /* no-op */ });

vi.mock('@memberjunction/postgresql-dataprovider', () => ({
    PGConnectionManager: vi.fn(() => ({
        Initialize: initializeMock,
        Close: closeMock,
        get Pool() {
            return fakePool;
        },
    })),
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } },
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    resolveDbPlatformFromEnv: vi.fn().mockReturnValue('postgresql'),
}));

vi.mock('@memberjunction/config', () => ({
    mergeConfigs: vi.fn((...configs: unknown[]) => Object.assign({}, ...configs)),
    parseBooleanEnv: vi.fn(() => false),
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    SeverityType: { Info: 'Info', Warning: 'Warning', Critical: 'Critical' },
}));

vi.mock('cosmiconfig', () => ({
    cosmiconfigSync: vi.fn().mockReturnValue({ search: vi.fn().mockReturnValue(null) }),
}));

// Import after mocks. We then mutate the shared `configInfo` to control
// what `buildPgConfig()` sees in each test.
import { configInfo } from '../Config/config';
import { PGConnection, getPgConfig, ClosePGConnection } from '../Config/pg-connection';

describe('PGConnection — lazy + cached pool', () => {
    beforeEach(async () => {
        // Always clear the module cache between tests so each call to
        // PGConnection() rebuilds from the current configInfo.
        await ClosePGConnection();
        initializeMock.mockClear();
        closeMock.mockClear();
        fakePool.listeners = {};

        // Reset baseline configInfo values for the pg-connection consumer.
        configInfo.dbHost = 'pg.example.com';
        configInfo.dbPort = 5432;
        configInfo.dbDatabase = 'mj_test';
        configInfo.codeGenLogin = 'mj_codegen';
        configInfo.codeGenPassword = 'pwd';
        configInfo.mjCoreSchema = '__mj';
        configInfo.codegenPool = undefined;
    });

    afterEach(async () => {
        await ClosePGConnection();
    });

    it('builds the pool lazily on first call and caches it for subsequent calls', async () => {
        expect(getPgConfig()).toBeUndefined();

        const pool1 = await PGConnection();
        expect(initializeMock).toHaveBeenCalledTimes(1);
        expect(getPgConfig()).toBeDefined();

        const pool2 = await PGConnection();
        expect(initializeMock).toHaveBeenCalledTimes(1);
        expect(pool2).toBe(pool1);
    });

    it('reads connection params from configInfo (not directly from process.env)', async () => {
        configInfo.dbHost = 'pg.custom.example';
        configInfo.dbPort = 5433;
        configInfo.dbDatabase = 'analytics';
        configInfo.codeGenLogin = 'codegen_user';
        configInfo.codeGenPassword = 'secret-value';

        await PGConnection();
        const passed = initializeMock.mock.calls[0]![0] as Record<string, unknown>;
        expect(passed.Host).toBe('pg.custom.example');
        expect(passed.Port).toBe(5433);
        expect(passed.Database).toBe('analytics');
        expect(passed.User).toBe('codegen_user');
        expect(passed.Password).toBe('secret-value');
    });

    it('passes codegenPool knobs (max/min/timeouts) to PGConnectionManager.Initialize', async () => {
        configInfo.codegenPool = {
            max: 25,
            min: 3,
            idleTimeoutMillis: 60000,
            connectionTimeoutMillis: 15000,
        };

        await PGConnection();
        const passed = initializeMock.mock.calls[0]![0] as Record<string, unknown>;
        expect(passed.MaxConnections).toBe(25);
        expect(passed.MinConnections).toBe(3);
        expect(passed.IdleTimeoutMillis).toBe(60000);
        expect(passed.ConnectionTimeoutMillis).toBe(15000);
    });

    it('omits codegenPool fields when not configured — manager falls back to its own defaults', async () => {
        await PGConnection();
        const passed = initializeMock.mock.calls[0]![0] as Record<string, unknown>;
        expect(passed.MaxConnections).toBeUndefined();
        expect(passed.MinConnections).toBeUndefined();
        expect(passed.IdleTimeoutMillis).toBeUndefined();
        expect(passed.ConnectionTimeoutMillis).toBeUndefined();
    });

    it('wires a per-connection statement_timeout hook when statementTimeoutMs is set', async () => {
        configInfo.codegenPool = { statementTimeoutMs: 90_000 };

        await PGConnection();
        // The connect listener should be registered exactly once.
        expect(fakePool.listeners.connect?.length).toBe(1);

        // Simulate a connect event — the listener fires `client.query()` with
        // `SET statement_timeout = <ms>`. We verify the SQL via a stub client.
        const queries: string[] = [];
        const fakeClient = { query: (sql: string) => { queries.push(sql); return Promise.resolve(); } };
        fakePool.listeners.connect![0](fakeClient);
        await new Promise((resolve) => setImmediate(resolve));
        expect(queries).toEqual(['SET statement_timeout = 90000']);
    });

    it('does NOT register a statement_timeout hook when statementTimeoutMs is unset or zero', async () => {
        configInfo.codegenPool = { statementTimeoutMs: 0 };
        await PGConnection();
        expect(fakePool.listeners.connect ?? []).toHaveLength(0);
    });

    it('ClosePGConnection() resets the cache so the next PGConnection() rebuilds', async () => {
        await PGConnection();
        expect(getPgConfig()).toBeDefined();
        expect(initializeMock).toHaveBeenCalledTimes(1);

        await ClosePGConnection();
        expect(getPgConfig()).toBeUndefined();
        expect(closeMock).toHaveBeenCalledTimes(1);

        await PGConnection();
        expect(initializeMock).toHaveBeenCalledTimes(2);
    });
});
