/**
 * PostgreSQL pools read the same databaseSettings values as SQL Server, with the same defaults.
 */
import { describe, it, expect } from 'vitest';
import {
    BuildPostgreSQLConnectionConfig,
    CODEGEN_STATEMENT_TIMEOUT_MS,
    ResolvePostgreSQLEndpoint,
    ToPGPoolConfig
} from '../postgresqlPoolSettings.js';
import type { DatabaseSettingsInfo } from '../config.js';

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
        const pool = ToPGPoolConfig(BuildPostgreSQLConnectionConfig(endpoint, defaults, 'api'));
        expect(pool).toEqual({
            host: 'db', port: 5432, database: 'mj', user: 'api', password: 'secret',
            max: 50, min: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 30000,
            statement_timeout: 30000, idle_in_transaction_session_timeout: 60000
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
