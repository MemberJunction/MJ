/**
 * Tests for BuildSkywayConfig's baseline semantics (B19).
 *
 * BaselineOnMigrate fires only against a *non-empty* schema that has no Flyway
 * history table — i.e. an adopted schema, or a `--keep-data` reinstall whose history
 * was lost. The version Flyway stamps at that baseline determines which migrations it
 * then treats as already-applied. With BaselineVersion '1' the app's own `V1__`
 * migration is SKIPPED (its objects never get created); '0' baselines below every real
 * migration so V1+ all apply. A fresh empty-schema install is unaffected either way
 * (Flyway never baselines an empty schema).
 */
import { describe, it, expect } from 'vitest';
import { BuildSkywayConfig, type SkywayDatabaseConfig } from '../install/migration-runner.js';

const dbConfig: SkywayDatabaseConfig = {
    Host: 'localhost',
    Port: 1433,
    Database: 'MJ_TEST',
    User: 'sa',
    Password: 'pw',
};

describe('BuildSkywayConfig — baseline version (B19)', () => {
    it("baselines at '0' so a non-empty/history-less schema does not skip the app's V1 migration", () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'sqlserver');
        // Pre-fix this was '1', which stamped "v1 applied" and skipped a V1__ migration on
        // any adopted / keep-data-reinstalled schema.
        expect(cfg.Migrations.BaselineVersion).toBe('0');
    });

    it('still baselines-on-migrate (adopting a populated schema applies migrations on top)', () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'sqlserver');
        expect(cfg.Migrations.BaselineOnMigrate).toBe(true);
    });

    it("uses '0' on PostgreSQL too (dialect-independent baseline floor)", () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'postgres');
        expect(cfg.Migrations.BaselineVersion).toBe('0');
        expect(cfg.Migrations.BaselineOnMigrate).toBe(true);
    });

    it('wires the app schema as the default schema + flyway:defaultSchema placeholder', () => {
        const cfg = BuildSkywayConfig('migrations', 'app_schema', dbConfig, '__mj', undefined, 'sqlserver');
        expect(cfg.Migrations.DefaultSchema).toBe('app_schema');
        expect(cfg.Placeholders?.['flyway:defaultSchema']).toBe('app_schema');
        expect(cfg.Placeholders?.mjSchema).toBe('__mj');
    });
});
