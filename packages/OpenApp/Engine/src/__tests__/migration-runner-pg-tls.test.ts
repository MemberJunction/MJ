/**
 * PostgreSQL TLS for an Open App install. The install's migration run (Skyway) and the metadata
 * refresh after it are two connections; both must use the TLS options the caller resolved from the
 * shared `PG_SSL_*` settings, or `mj app install` cannot reach a server that only accepts TLS.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pgClients = vi.hoisted(() => ({ configs: [] as Array<Record<string, unknown>> }));

vi.mock('pg', () => {
    class Client {
        constructor(config: Record<string, unknown>) {
            pgClients.configs.push(config);
        }
        async connect(): Promise<void> { /* no-op */ }
        async query(): Promise<{ rows: [] }> { return { rows: [] }; }
        async end(): Promise<void> { /* no-op */ }
    }
    return { Client, default: { Client } };
});

import { BuildSkywayConfig, type SkywayDatabaseConfig } from '../install/migration-runner.js';
import { ExecuteOpenAppMetadataRefresh } from '../install/open-app-metadata-refresh.js';

const tls = { rejectUnauthorized: true, ca: 'PEM', servername: 'db.example.com' };

const pgConfig: SkywayDatabaseConfig = {
    Host: 'db.example.com',
    Port: 5432,
    Database: 'mj',
    User: 'mj_codegen',
    Password: 'pw',
    SSL: tls,
};

describe('BuildSkywayConfig — PostgreSQL TLS', () => {
    it('passes the TLS options to Skyway on PostgreSQL', () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', pgConfig, '__mj', undefined, 'postgresql');
        expect(cfg.Database.Options?.SSL).toEqual(tls);
    });

    it('leaves the option out when the caller resolved plain TCP', () => {
        const { SSL: _omit, ...plain } = pgConfig;
        const cfg = BuildSkywayConfig('migrations', 'app_schema', plain, '__mj', undefined, 'postgresql');
        expect(cfg.Database.Options).not.toHaveProperty('SSL');
    });

    it('never sends PostgreSQL TLS options to SQL Server', () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', { ...pgConfig, Port: 1433 }, '__mj', undefined, 'sqlserver');
        expect(cfg.Database.Options).not.toHaveProperty('SSL');
    });
});

describe('ExecuteOpenAppMetadataRefresh — PostgreSQL TLS', () => {
    beforeEach(() => {
        pgClients.configs.length = 0;
    });

    it('opens the refresh connection with the same TLS options', async () => {
        await ExecuteOpenAppMetadataRefresh({ platform: 'postgresql', coreSchema: '__mj', appSchema: 'app_schema', database: pgConfig });
        expect(pgClients.configs).toHaveLength(1);
        expect(pgClients.configs[0].ssl).toEqual(tls);
    });

    it('uses plain TCP, not PGSSLMODE, when no TLS options were given', async () => {
        const { SSL: _omit, ...plain } = pgConfig;
        await ExecuteOpenAppMetadataRefresh({ platform: 'postgresql', coreSchema: '__mj', appSchema: 'app_schema', database: plain });
        expect(pgClients.configs[0].ssl).toBe(false);
    });
});
