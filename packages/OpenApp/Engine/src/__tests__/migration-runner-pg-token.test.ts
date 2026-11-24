/**
 * PostgreSQL token logins for an Open App install. One install runs several migration runs and
 * metadata refreshes, with package installs between them, so each one must take its password from
 * the source at the time it connects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface CapturedSkywayConfig {
    Database: { Password: string };
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

    it('takes a new password from the source for each migration run', async () => {
        const databaseConfig = tokenConfig();
        await migrate(databaseConfig, 'app_one');
        await migrate(databaseConfig, 'app_two');
        expect(captured.skyway.map((c) => c.Database.Password)).toEqual(['token-1', 'token-2']);
    });

    it('gives the metadata refresh connection the source, so the driver asks it when it connects', async () => {
        const databaseConfig = tokenConfig();
        await migrate(databaseConfig, 'app_one');
        expect(captured.pgClients).toHaveLength(1);
        expect(captured.pgClients[0].password).toBe(databaseConfig.PasswordSource);
    });
});
