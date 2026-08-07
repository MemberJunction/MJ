/**
 * Tests for the transaction mode used when running an Open App's migrations.
 *
 * Skyway supports two modes: `per-run` (one transaction wraps the WHOLE pending
 * set — all or nothing) and `per-migration` (each migration file commits on its
 * own, Flyway's semantics). Skyway's own config layer defaults to `per-run`.
 *
 * Two things must hold here:
 *
 *  1. **The mode is reachable.** `RunAppMigrations` must accept a TransactionMode
 *     and actually put it on the config handed to Skyway. Before this was wired,
 *     the option existed only on the internal SkywayConfig shape, so no caller
 *     could influence the mode at all and Skyway silently fell back to `per-run`.
 *
 *  2. **The default is `per-migration`.** Ruled by the MJ maintainers: app installs
 *     apply migrations file-by-file rather than as one all-or-nothing transaction, which
 *     also matches what MJCLI already defaults `mj migrate` to. `per-run` cannot host a
 *     migration set that creates a table type and instantiates it (SQL Server deadlocks
 *     the session against itself, error 1205), and on a from-zero install the whole app is
 *     one transaction, so no file arrangement avoids it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** The subset of the Skyway config this test inspects. */
interface CapturedSkywayConfig {
    TransactionMode?: 'per-run' | 'per-migration';
    Migrations: { DefaultSchema: string };
}

// Captured across the mocked Skyway constructor. `vi.hoisted` so the mock factory
// (which vitest hoists above the imports) can close over it without a TDZ error.
const captured = vi.hoisted(() => ({ configs: [] as CapturedSkywayConfig[] }));

vi.mock('@memberjunction/skyway-core', () => ({
    Skyway: class {
        constructor(config: CapturedSkywayConfig) {
            captured.configs.push(config);
        }
        async Migrate(): Promise<{ Success: boolean; MigrationsApplied: number; Details: [] }> {
            return { Success: true, MigrationsApplied: 0, Details: [] };
        }
        async Close(): Promise<void> {
            /* no-op */
        }
    },
}));

vi.mock('@memberjunction/skyway-sqlserver', () => ({
    SqlServerProvider: class {
        constructor(_config: unknown) {
            /* no-op */
        }
    },
}));

import { BuildSkywayConfig, RunAppMigrations, type SkywayDatabaseConfig } from '../install/migration-runner.js';

const dbConfig: SkywayDatabaseConfig = {
    Host: 'localhost',
    Port: 1433,
    Database: 'MJ_TEST',
    User: 'sa',
    Password: 'pw',
};

describe('BuildSkywayConfig — transaction mode', () => {
    it("defaults to 'per-migration', matching MJCLI's `mj migrate` default", () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'sqlserver');
        expect(cfg.TransactionMode).toBe('per-migration');
    });

    it("honors an explicit 'per-run' request", () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'sqlserver', 'per-run');
        expect(cfg.TransactionMode).toBe('per-run');
    });

    it("honors an explicit 'per-migration' request", () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'sqlserver', 'per-migration');
        expect(cfg.TransactionMode).toBe('per-migration');
    });

    it('applies the same default on PostgreSQL (the setting is dialect-independent)', () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'postgresql');
        expect(cfg.TransactionMode).toBe('per-migration');
    });
});

describe('RunAppMigrations — transaction mode reaches Skyway', () => {
    beforeEach(() => {
        captured.configs.length = 0;
    });

    it('hands Skyway a per-migration config by default, never its per-run fallback', async () => {
        const result = await RunAppMigrations({
            MigrationsDir: '/tmp/migrations',
            SchemaName: 'app_schema',
            DatabaseConfig: dbConfig,
        });

        expect(result.Success).toBe(true);
        expect(captured.configs).toHaveLength(1);
        expect(captured.configs[0].TransactionMode).toBe('per-migration');
    });

    it("forwards 'per-migration' through to Skyway", async () => {
        await RunAppMigrations({
            MigrationsDir: '/tmp/migrations',
            SchemaName: 'app_schema',
            DatabaseConfig: dbConfig,
            TransactionMode: 'per-migration',
        });

        expect(captured.configs[0].TransactionMode).toBe('per-migration');
    });

    it('forwards an explicit TransactionMode from the caller through to Skyway', async () => {
        await RunAppMigrations({
            MigrationsDir: '/tmp/migrations',
            SchemaName: 'app_schema',
            DatabaseConfig: dbConfig,
            TransactionMode: 'per-run',
        });

        expect(captured.configs).toHaveLength(1);
        expect(captured.configs[0].TransactionMode).toBe('per-run');
    });
});
