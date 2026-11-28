/**
 * PostgreSQL token logins for an Open App install. One install runs several migration runs and
 * metadata refreshes, with package installs between them, so each one must take its password from
 * the source at the time it connects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface CapturedSkywayConfig {
    Database: { Password: string; PasswordProvider?: () => Promise<string> };
}

const captured = vi.hoisted(() => ({
    skyway: [] as CapturedSkywayConfig[],
    pgClients: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/skyway-core', () => ({
    Skyway: class {
        constructor(config: CapturedSkywayConfig) {
            captured.skyway.push(config);
        }
        async Migrate(): Promise<{ Success: boolean; MigrationsApplied: number; Details: [] }> {
            return { Success: true, MigrationsApplied: 0, Details: [] };
        }
        async Close(): Promise<void> { /* no-op */ }
    },
}));

vi.mock('@memberjunction/skyway-postgres', () => ({
    PostgresProvider: class {
        constructor(_config: unknown) { /* no-op */ }
    },
}));

vi.mock('pg', () => {
    class Client {
        constructor(config: Record<string, unknown>) {
            captured.pgClients.push(config);
        }
        async connect(): Promise<void> { /* no-op */ }
        async query(): Promise<{ rows: [] }> { return { rows: [] }; }
        async end(): Promise<void> { /* no-op */ }
    }
    return { Client, default: { Client } };
});

import { RunAppMigrations, type SkywayDatabaseConfig } from '../install/migration-runner.js';
import { ExecuteOpenAppMetadataRefresh } from '../install/open-app-metadata-refresh.js';

/** A database config whose source hands out token-1, token-2, … */
function tokenConfig(): SkywayDatabaseConfig {
    let issued = 0;
    return {
        Host: 'db.example.com',
        Port: 5432,
        Database: 'mj',
        User: 'mj_codegen',
        Password: '',
        SSL: { rejectUnauthorized: true },
        PasswordSource: async () => `token-${++issued}`,
    };
}

async function migrate(databaseConfig: SkywayDatabaseConfig, schema: string): Promise<void> {
    const result = await RunAppMigrations({ MigrationsDir: 'migrations', SchemaName: schema, DatabaseConfig: databaseConfig, Platform: 'postgresql' });
    expect(result.ErrorMessage).toBeUndefined();
}

describe('RunAppMigrations — PostgreSQL token login', () => {
    beforeEach(() => {
        captured.skyway.length = 0;
        captured.pgClients.length = 0;
    });

    it('hands Skyway the source itself, so each connection a run opens asks for its own token', async () => {
        const source = vi.fn(async () => 'token');
        const databaseConfig: SkywayDatabaseConfig = { ...tokenConfig(), PasswordSource: source };
        await migrate(databaseConfig, 'app_one');
        await migrate(databaseConfig, 'app_two');
        expect(captured.skyway).toHaveLength(2);
        expect(captured.skyway.map((c) => c.Database.PasswordProvider)).toEqual([source, source]);
        // MJ never resolves a token for Skyway; Skyway's provider calls the source when it connects.
        expect(source).not.toHaveBeenCalled();
    });

    it('gives Skyway no PasswordProvider for a password login', async () => {
        const { PasswordSource: _omit, ...databaseConfig } = tokenConfig();
        await migrate({ ...databaseConfig, Password: 'secret' }, 'app_one');
        expect(captured.skyway[0].Database.PasswordProvider).toBeUndefined();
        expect(captured.skyway[0].Database.Password).toBe('secret');
    });

    it('gives the metadata refresh connection the source, so the driver asks it when it connects', async () => {
        const databaseConfig = tokenConfig();
        await migrate(databaseConfig, 'app_one');
        expect(captured.pgClients).toHaveLength(1);
        expect(captured.pgClients[0].password).toBe(databaseConfig.PasswordSource);
    });
});

describe('PostgreSQL token login — TLS that does not verify the server', () => {
    const unverified: Array<[string, Record<string, unknown> | undefined]> = [
        ['plain TCP', undefined],
        ['TLS without certificate checks', { rejectUnauthorized: false }],
    ];

    beforeEach(() => {
        captured.skyway.length = 0;
        captured.pgClients.length = 0;
    });

    it.each(unverified)('the migration run asks for no token over %s', async (_label, ssl) => {
        const source = vi.fn(async () => 'token');
        const { SSL: _omit, ...base } = tokenConfig();
        const databaseConfig: SkywayDatabaseConfig = { ...base, PasswordSource: source, ...(ssl ? { SSL: ssl } : {}) };
        const result = await RunAppMigrations({ MigrationsDir: 'migrations', SchemaName: 'app_one', DatabaseConfig: databaseConfig, Platform: 'postgresql' });
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/do not verify the server/);
        expect(source).not.toHaveBeenCalled();
        expect(captured.skyway).toHaveLength(0);
    });

    it.each(unverified)('the metadata refresh opens no connection over %s', async (_label, ssl) => {
        const { SSL: _omit, ...base } = tokenConfig();
        const database: SkywayDatabaseConfig = { ...base, ...(ssl ? { SSL: ssl } : {}) };
        await expect(
            ExecuteOpenAppMetadataRefresh({ platform: 'postgresql', coreSchema: '__mj', appSchema: 'app_one', database }),
        ).rejects.toThrow(/do not verify the server/);
        expect(captured.pgClients).toHaveLength(0);
    });
});
