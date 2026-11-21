/**
 * PostgreSQL pools read the same databaseSettings values as SQL Server, with the same defaults.
 */
import { describe, it, expect } from 'vitest';
import {
    ADHOC_READ_ONLY_MAX_CONNECTIONS,
    BuildPostgreSQLConnectionConfig,
    CODEGEN_STATEMENT_TIMEOUT_MS,
    PostgreSQLReadOnlyPool,
    ResolvePostgreSQLEndpoint,
    ResolvePostgreSQLReadOnlyCredentials,
    ToPGPoolConfig,
    DescribeConnectionBudget,
    PostgreSQLPoolBudget,
    WarnIfPostgreSQLConnectionBudgetExceeded,
    ResolvePostgreSQLReadOnlyEndpoints,
} from '../postgresqlPoolSettings.js';
import { GetReadOnlyProvider } from '../util.js';
import type { ProviderInfo } from '../types.js';
import type { DatabaseProviderBase } from '@memberjunction/core';
import type { DatabaseSettingsInfo } from '../config.js';
import { DescribeReadOnlyLoginOverreach } from '../postgresqlPoolSettings.js';
import type { ReadOnlyLoginCheckClient, ReadOnlyLoginGrants } from '../postgresqlPoolSettings.js';

const defaults: DatabaseSettingsInfo = {
    connectionTimeout: 45000,
    requestTimeout: 30000,
    metadataCacheRefreshInterval: 180000,
    connectionPool: { max: 50, min: 5, idleTimeoutMillis: 30000, acquireTimeoutMillis: 30000 }
};
const endpoint = { Host: 'db', Port: 5432, Database: 'mj', User: 'api', Password: 'secret' };

describe('BuildPostgreSQLConnectionConfig', () => {
    it('gives API pools requestTimeout as the statement timeout and the pool settings SQL Server uses', () => {
        const config = BuildPostgreSQLConnectionConfig(endpoint, defaults, 'api');
        expect(config).toMatchObject({
            ...endpoint,
            MaxConnections: 50,
            MinConnections: 5,
            IdleTimeoutMillis: 30000,
            ConnectionTimeoutMillis: 30000,
            StatementTimeoutMs: 30000,
            IdleInTransactionSessionTimeoutMs: 60000
        });
    });

    it('follows a configured requestTimeout and pool', () => {
        const config = BuildPostgreSQLConnectionConfig(endpoint, {
            ...defaults,
            requestTimeout: 5000,
            connectionPool: { max: 12, min: 1, idleTimeoutMillis: 7000, acquireTimeoutMillis: 9000 }
        }, 'api');
        expect(config).toMatchObject({ MaxConnections: 12, MinConnections: 1, IdleTimeoutMillis: 7000, ConnectionTimeoutMillis: 9000, StatementTimeoutMs: 5000, IdleInTransactionSessionTimeoutMs: 10000 });
    });

    it('sets no timeouts when requestTimeout is 0', () => {
        const config = BuildPostgreSQLConnectionConfig(endpoint, { ...defaults, requestTimeout: 0 }, 'api');
        expect(config.StatementTimeoutMs).toBe(0);
        expect(config.IdleInTransactionSessionTimeoutMs).toBe(0);
    });

    it('sizes the application read-only pool up to apiMax (or connectionPool.readOnlyMax) with MinConnections=0 and API timeouts', () => {
        const config = BuildPostgreSQLConnectionConfig(endpoint, defaults, 'read-only');
        expect(config).toMatchObject({ MaxConnections: 50, MinConnections: 0, StatementTimeoutMs: 30000, IdleInTransactionSessionTimeoutMs: 60000 });
        expect(BuildPostgreSQLConnectionConfig(endpoint, {
            ...defaults,
            connectionPool: { max: 50, min: 5, readOnlyMax: 35, idleTimeoutMillis: 30000, acquireTimeoutMillis: 30000 }
        }, 'read-only').MaxConnections).toBe(35);
        expect(BuildPostgreSQLConnectionConfig(endpoint, { ...defaults, connectionPool: { max: 4, min: 1, idleTimeoutMillis: 1, acquireTimeoutMillis: 1 } }, 'read-only').MaxConnections).toBe(4);
    });

    it('bounds the untrusted ad-hoc read-only pool at ADHOC_READ_ONLY_MAX_CONNECTIONS (10) while keeping API timeouts', () => {
        expect(ADHOC_READ_ONLY_MAX_CONNECTIONS).toBe(10);
        const config = BuildPostgreSQLConnectionConfig(endpoint, defaults, 'adhoc-read-only');
        expect(config).toMatchObject({ MaxConnections: 10, MinConnections: 0, StatementTimeoutMs: 30000, IdleInTransactionSessionTimeoutMs: 60000 });
        expect(BuildPostgreSQLConnectionConfig(endpoint, { ...defaults, connectionPool: { max: 4, min: 1, idleTimeoutMillis: 1, acquireTimeoutMillis: 1 } }, 'adhoc-read-only').MaxConnections).toBe(4);
    });

    it('gives the CodeGen pool the long timeout the SQL Server CodeGen pool has, and no idle-in-transaction limit', () => {
        const config = BuildPostgreSQLConnectionConfig(endpoint, defaults, 'codegen');
        expect(config.StatementTimeoutMs).toBe(CODEGEN_STATEMENT_TIMEOUT_MS);
        expect(CODEGEN_STATEMENT_TIMEOUT_MS).toBe(600000);
        expect(config.IdleInTransactionSessionTimeoutMs).toBe(0);
        expect(config.MaxConnections).toBe(10);
    });
});

describe('ToPGPoolConfig', () => {
    it('maps the connection config onto pg.Pool option names', () => {
        const pool = ToPGPoolConfig(BuildPostgreSQLConnectionConfig(endpoint, defaults, 'api', {}));
        expect(pool).toEqual({
            host: 'db', port: 5432, database: 'mj', user: 'api', password: 'secret',
            max: 50, min: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000,
            statement_timeout: 30000, idle_in_transaction_session_timeout: 60000,
            ssl: false
        });
    });

    it('leaves the timeouts out when they are 0', () => {
        const pool = ToPGPoolConfig(BuildPostgreSQLConnectionConfig(endpoint, { ...defaults, requestTimeout: 0 }, 'api'));
        expect(pool).not.toHaveProperty('statement_timeout');
        expect(pool).not.toHaveProperty('idle_in_transaction_session_timeout');
    });
});

describe('ResolvePostgreSQLEndpoint', () => {
    it('prefers PG_* variables over DB_* ones', () => {
        expect(ResolvePostgreSQLEndpoint({ PG_HOST: 'pg', DB_HOST: 'db', DB_PORT: '6000', DB_DATABASE: 'd', DB_USERNAME: 'u', DB_PASSWORD: 'p' }))
            .toEqual({ Host: 'pg', Port: 6000, Database: 'd', User: 'u', Password: 'p' });
    });

    it('falls back to localhost:5432 and the postgres user', () => {
        expect(ResolvePostgreSQLEndpoint({})).toEqual({ Host: 'localhost', Port: 5432, Database: '', User: 'postgres', Password: '' });
    });
});

describe('ResolvePostgreSQLReadOnlyCredentials', () => {
    it('uses the dbReadOnlyUsername / dbReadOnlyPassword settings SQL Server uses', () => {
        expect(ResolvePostgreSQLReadOnlyCredentials({ dbReadOnlyUsername: 'ro', dbReadOnlyPassword: 'pw' }, {}))
            .toEqual({ User: 'ro', Password: 'pw' });
    });

    it('falls back to PG_READ_ONLY_* when the settings are absent', () => {
        expect(ResolvePostgreSQLReadOnlyCredentials({}, { PG_READ_ONLY_USERNAME: 'pgro', PG_READ_ONLY_PASSWORD: 'x' }))
            .toEqual({ User: 'pgro', Password: 'x' });
    });

    it('returns null when no complete pair is configured', () => {
        expect(ResolvePostgreSQLReadOnlyCredentials({ dbReadOnlyUsername: 'ro' }, { PG_READ_ONLY_USERNAME: 'pgro' })).toBeNull();
    });
});

describe('DescribeReadOnlyLoginOverreach', () => {
    const clientAnswering = (row: ReadOnlyLoginGrants): ReadOnlyLoginCheckClient => ({
        query: async () => ({ rows: [row] }),
    });

    it('says nothing for a login that reads only views', async () => {
        expect(await DescribeReadOnlyLoginOverreach(clientAnswering({ ReadsServerFiles: false, ReadableBaseTables: 0 }), '__mj')).toEqual([]);
    });

    it('warns when the login can read base tables', async () => {
        const warnings = await DescribeReadOnlyLoginOverreach(clientAnswering({ ReadsServerFiles: false, ReadableBaseTables: 412 }), '__mj');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/can read 412 base table\(s\) in schema "__mj"/);
    });

    it('warns when the login can read server files', async () => {
        const warnings = await DescribeReadOnlyLoginOverreach(clientAnswering({ ReadsServerFiles: true, ReadableBaseTables: 0 }), '__mj');
        expect(warnings[0]).toMatch(/pg_read_server_files/);
    });
});

describe('PostgreSQLReadOnlyPool & GetReadOnlyProvider purpose routing', () => {
    it('tracks separate application Pool and bounded AdhocPool handles', () => {
        const prevPool = PostgreSQLReadOnlyPool.Instance.Pool;
        const prevAdhoc = PostgreSQLReadOnlyPool.Instance.AdhocPool;
        try {
            const appPool = { kind: 'app' } as unknown as import('pg').Pool;
            const adhocPool = { kind: 'adhoc' } as unknown as import('pg').Pool;
            PostgreSQLReadOnlyPool.Instance.Pool = appPool;
            PostgreSQLReadOnlyPool.Instance.AdhocPool = adhocPool;
            expect(PostgreSQLReadOnlyPool.Instance.Pool).toBe(appPool);
            expect(PostgreSQLReadOnlyPool.Instance.AdhocPool).toBe(adhocPool);
        } finally {
            PostgreSQLReadOnlyPool.Instance.Pool = prevPool;
            PostgreSQLReadOnlyPool.Instance.AdhocPool = prevAdhoc;
        }
    });

    it('routes purpose:"adhoc" to Adhoc-Read-Only (never Read-Write) and app RunView* to Read-Only', () => {
        const rw = { type: 'Read-Write', provider: { id: 'rw' } as unknown as DatabaseProviderBase } satisfies ProviderInfo;
        const ro = { type: 'Read-Only', provider: { id: 'ro' } as unknown as DatabaseProviderBase } satisfies ProviderInfo;
        const adhoc = { type: 'Adhoc-Read-Only', provider: { id: 'adhoc' } as unknown as DatabaseProviderBase } satisfies ProviderInfo;

        expect(GetReadOnlyProvider([rw, ro, adhoc], { allowFallbackToReadWrite: true })).toBe(ro.provider);
        expect(GetReadOnlyProvider([rw, ro, adhoc], { allowFallbackToReadWrite: false, purpose: 'adhoc' })).toBe(adhoc.provider);
        // Falls back to Read-Only (never Read-Write) when no separate Adhoc-Read-Only exists (e.g. SQL Server)
        expect(GetReadOnlyProvider([rw, ro], { allowFallbackToReadWrite: false, purpose: 'adhoc' })).toBe(ro.provider);
        // Never falls back to Read-Write when RO + Adhoc pools are absent and allowFallbackToReadWrite is false
        expect(GetReadOnlyProvider([rw], { allowFallbackToReadWrite: false, purpose: 'adhoc' })).toBeNull();
        expect(GetReadOnlyProvider([rw], { allowFallbackToReadWrite: false, purpose: 'app' })).toBeNull();
        // App queries never route onto the bounded Adhoc-Read-Only pool when Read-Only is absent
        expect(GetReadOnlyProvider([rw, adhoc], { allowFallbackToReadWrite: false, purpose: 'app' })).toBeNull();
        expect(GetReadOnlyProvider([], { allowFallbackToReadWrite: false, purpose: 'adhoc' })).toBeNull();
    });
});

describe('PostgreSQL TLS and login for MJAPI pools', () => {
    const remote = { ...endpoint, Host: 'mj.postgres.database.azure.com' };

    it('verifies the server certificate by default for a remote host, on every pool', () => {
        for (const purpose of ['api', 'read-only', 'adhoc-read-only', 'codegen'] as const) {
            const pool = ToPGPoolConfig(BuildPostgreSQLConnectionConfig(remote, defaults, purpose, {}));
            expect(pool.ssl, purpose).toEqual({ rejectUnauthorized: true });
        }
    });

    it('uses plain TCP by default for a local or bare service-name host', () => {
        expect(ToPGPoolConfig(BuildPostgreSQLConnectionConfig(endpoint, defaults, 'api', {})).ssl).toBe(false);
    });

    it('follows databaseSettings.postgres.ssl, and PG_SSL_MODE over it', () => {
        const settings: DatabaseSettingsInfo = { ...defaults, postgres: { ssl: { mode: 'require' } } };
        expect(BuildPostgreSQLConnectionConfig(remote, settings, 'api', {}).SSL).toEqual({ rejectUnauthorized: false });
        expect(BuildPostgreSQLConnectionConfig(remote, settings, 'api', { PG_SSL_MODE: 'disable' }).SSL).toBe(false);
    });

    it('uses the configured password and no password source in password mode', () => {
        const config = BuildPostgreSQLConnectionConfig(remote, defaults, 'api', {});
        expect(config.PasswordSource).toBeUndefined();
        expect(ToPGPoolConfig(config).password).toBe('secret');
    });

    it('refuses a token login when TLS does not verify the server', () => {
        expect(() => BuildPostgreSQLConnectionConfig(remote, defaults, 'api', { PG_AUTH_MODE: 'azure-entra', PG_SSL_MODE: 'require' }))
            .toThrow(/Refusing to send the token/);
    });

    it('fails clearly when a token mode has no registered provider', () => {
        expect(() => BuildPostgreSQLConnectionConfig(remote, defaults, 'api', { PG_AUTH_MODE: 'no-such-mode' }))
            .toThrow(/no PostgreSQL credential provider is registered/);
    });
});

describe('PostgreSQL connection budget', () => {
    const limits = (max: number, reserved = 3) => ({
        query: async () => ({ rows: [{ MaxConnections: max, ReservedConnections: reserved }] }),
    });

    it('counts the API pool, both read-only pools and the CodeGen pool', () => {
        expect(PostgreSQLPoolBudget(defaults, true, true)).toEqual([
            { Name: 'API', MaxConnections: 50 },
            { Name: 'read-only', MaxConnections: 50 },
            { Name: 'ad-hoc read-only', MaxConnections: 10 },
            { Name: 'CodeGen', MaxConnections: 10 },
        ]);
        expect(PostgreSQLPoolBudget(defaults, false, false)).toEqual([{ Name: 'API', MaxConnections: 50 }]);
    });

    it('stays quiet when the worst case fits', async () => {
        expect(await DescribeConnectionBudget(limits(200), [{ Name: 'API', MaxConnections: 50 }])).toBeNull();
    });

    it('warns with the numbers when the worst case exceeds 80% of usable connections', async () => {
        const warning = await DescribeConnectionBudget(limits(100), PostgreSQLPoolBudget(defaults, true, true));
        expect(warning).toMatch(/up to 120 connection\(s\) per instance/);
        expect(warning).toMatch(/97 usable/);
    });

    it('multiplies by the number of instances', async () => {
        const warning = await DescribeConnectionBudget(limits(200), [{ Name: 'API', MaxConnections: 50 }], 4);
        expect(warning).toMatch(/× 4 instances = 200/);
    });

    it('logs a failed check instead of throwing', async () => {
        const messages: string[] = [];
        const failing = { query: async (): Promise<{ rows: [] }> => { throw new Error('boom'); } };
        await WarnIfPostgreSQLConnectionBudgetExceeded(failing, defaults, false, false, m => messages.push(m));
        expect(messages).toEqual(['WARNING: could not check the PostgreSQL connection budget: boom']);
    });
});

describe('ResolvePostgreSQLReadOnlyEndpoints', () => {
    const ro = { ...endpoint, User: 'ro', Password: 'ropw' };

    it('keeps both read-only pools on the primary without a replica', () => {
        expect(ResolvePostgreSQLReadOnlyEndpoints(ro, defaults, {})).toEqual({ Application: ro, Adhoc: ro });
    });

    it('moves only the ad-hoc pool to the replica by default, keeping the read-only login', () => {
        const eps = ResolvePostgreSQLReadOnlyEndpoints(ro, defaults, { PG_READ_REPLICA_HOST: 'reader.example.com' });
        expect(eps.Application).toEqual(ro);
        expect(eps.Adhoc).toEqual({ ...ro, Host: 'reader.example.com' });
    });

    it('moves the application pool too when asked, with a configured port', () => {
        const settings: DatabaseSettingsInfo = { ...defaults, postgres: { readReplica: { host: 'reader', port: 6432, pools: 'all-read-only' } } };
        const eps = ResolvePostgreSQLReadOnlyEndpoints(ro, settings, {});
        expect(eps.Application).toEqual({ ...ro, Host: 'reader', Port: 6432 });
        expect(eps.Adhoc).toEqual({ ...ro, Host: 'reader', Port: 6432 });
    });

    it('rejects an unknown pools value', () => {
        expect(() => ResolvePostgreSQLReadOnlyEndpoints(ro, defaults, { PG_READ_REPLICA_HOST: 'r', PG_READ_REPLICA_POOLS: 'everything' }))
            .toThrow(/expected adhoc or all-read-only/);
    });
});
