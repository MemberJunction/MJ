import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuntimeSchemaManager, ValidateMigrationSQL, RSUError } from '../RuntimeSchemaManager.js';

// ─── ValidateMigrationSQL Tests ──────────────────────────────────────

describe('ValidateMigrationSQL', () => {
    it('should accept DDL on non-protected schemas', () => {
        const sql = 'CREATE TABLE [hubspot].[Contact] (ID INT NOT NULL);';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(true);
        expect(result.Errors).toHaveLength(0);
    });

    it('should accept DDL on dbo schema', () => {
        const sql = 'CREATE TABLE [dbo].[MyTable] (ID INT NOT NULL);';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(true);
    });

    it('should accept DDL on custom schema', () => {
        const sql = 'CREATE TABLE [custom].[UD_MyTable] (ID INT NOT NULL);';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(true);
    });

    it('should reject CREATE TABLE on __mj schema', () => {
        const sql = 'CREATE TABLE [__mj].[SomeTable] (ID INT NOT NULL);';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
        expect(result.Errors.length).toBeGreaterThan(0);
        expect(result.Errors[0]).toContain('__mj');
    });

    it('should reject ALTER TABLE on __mj schema', () => {
        const sql = 'ALTER TABLE [__mj].[Entity] ADD NewColumn NVARCHAR(100);';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('__mj');
    });

    it('should reject DROP TABLE on __mj schema', () => {
        const sql = 'DROP TABLE [__mj].[SomeTable];';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('__mj');
    });

    it('should reject DROP VIEW on __mj schema', () => {
        const sql = 'DROP VIEW [__mj].[vwSomething];';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
    });

    it('should reject DROP PROCEDURE on __mj schema', () => {
        const sql = 'DROP PROCEDURE [__mj].[spSomething];';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
    });

    it('should handle PostgreSQL-style quoting for __mj', () => {
        const sql = 'CREATE TABLE "__mj"."SomeTable" (id UUID NOT NULL);';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('__mj');
    });

    it('should handle unquoted __mj schema references', () => {
        const sql = 'CREATE TABLE __mj.SomeTable (ID INT NOT NULL);';
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
    });

    it('should reject DDL on additional protected schemas', () => {
        const sql = 'CREATE TABLE [sensitive].[Data] (ID INT NOT NULL);';
        const result = ValidateMigrationSQL(sql, ['sensitive']);
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('sensitive');
    });

    it('should handle case-insensitive schema matching', () => {
        const sql = 'CREATE TABLE [__MJ].[SomeTable] (ID INT NOT NULL);';
        const result = ValidateMigrationSQL(sql);
        // __mj protection is case-sensitive for the schema name
        // but the regex uses 'gi' flag, so it should catch __MJ
        expect(result.Valid).toBe(false);
    });

    it('should accept SQL that mentions __mj in comments only', () => {
        // This is a known limitation — comment-only mentions should not block,
        // but our simple regex doesn't distinguish comments from code.
        // For safety, we err on the side of blocking.
        const sql = '-- This migration is related to __mj schema\nCREATE TABLE [dbo].[NewTable] (ID INT NOT NULL);';
        // The comment doesn't have "CREATE TABLE __mj." so it should pass
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(true);
    });

    it('should handle multi-statement SQL with mixed schemas', () => {
        const sql = `
            CREATE TABLE [hubspot].[Contact] (ID INT NOT NULL);
            ALTER TABLE [__mj].[Entity] ADD NewColumn INT;
        `;
        const result = ValidateMigrationSQL(sql);
        expect(result.Valid).toBe(false);
        expect(result.Errors[0]).toContain('__mj');
    });

    it('should accept empty SQL', () => {
        const result = ValidateMigrationSQL('');
        expect(result.Valid).toBe(true);
    });
});

// ─── RuntimeSchemaManager Tests ──────────────────────────────────────

describe('RuntimeSchemaManager', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Reset environment
        delete process.env.ALLOW_RUNTIME_SCHEMA_UPDATE;
        delete process.env.RSU_PROTECTED_SCHEMAS;
        delete process.env.RSU_MIGRATIONS_PATH;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('IsEnabled', () => {
        it('should be disabled when ALLOW_RUNTIME_SCHEMA_UPDATE is not set', () => {
            const rsm = RuntimeSchemaManager.Instance;
            expect(rsm.IsEnabled).toBe(false);
        });

        it('should be disabled when ALLOW_RUNTIME_SCHEMA_UPDATE is not "1"', () => {
            process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '0';
            const rsm = RuntimeSchemaManager.Instance;
            expect(rsm.IsEnabled).toBe(false);
        });

        it('should be disabled when ALLOW_RUNTIME_SCHEMA_UPDATE is "true"', () => {
            process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = 'true';
            const rsm = RuntimeSchemaManager.Instance;
            expect(rsm.IsEnabled).toBe(false);
        });

        it('should be enabled when ALLOW_RUNTIME_SCHEMA_UPDATE is "1"', () => {
            process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
            const rsm = RuntimeSchemaManager.Instance;
            expect(rsm.IsEnabled).toBe(true);
        });
    });

    describe('GetStatus', () => {
        it('should return current status', () => {
            const rsm = RuntimeSchemaManager.Instance;
            const status = rsm.GetStatus();
            expect(status.Enabled).toBe(false);
            expect(status.Running).toBe(false);
            expect(status.OutOfSync).toBe(false);
            expect(status.OutOfSyncSince).toBeNull();
        });
    });

    describe('Out-of-Sync Management', () => {
        it('should mark and clear out-of-sync state', () => {
            const rsm = RuntimeSchemaManager.Instance;
            expect(rsm.IsOutOfSync).toBe(false);

            rsm.MarkOutOfSync();
            expect(rsm.IsOutOfSync).toBe(true);
            expect(rsm.OutOfSyncSince).not.toBeNull();

            rsm.ClearOutOfSync();
            expect(rsm.IsOutOfSync).toBe(false);
            expect(rsm.OutOfSyncSince).toBeNull();
        });
    });

    describe('Preview', () => {
        it('should return validation errors for __mj schema SQL', () => {
            process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
            const rsm = RuntimeSchemaManager.Instance;

            const result = rsm.Preview({
                MigrationSQL: 'CREATE TABLE [__mj].[Bad] (ID INT NOT NULL);',
                Description: 'test',
                AffectedTables: ['__mj.Bad'],
            });

            expect(result.WouldExecute).toBe(false);
            expect(result.ValidationErrors.length).toBeGreaterThan(0);
        });

        it('should indicate execution is possible for valid SQL when enabled', () => {
            process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
            const rsm = RuntimeSchemaManager.Instance;

            const result = rsm.Preview({
                MigrationSQL: 'CREATE TABLE [custom].[Good] (ID INT NOT NULL);',
                Description: 'test',
                AffectedTables: ['custom.Good'],
            });

            expect(result.WouldExecute).toBe(true);
            expect(result.ValidationErrors).toHaveLength(0);
        });

        it('should not execute when RSU is disabled', () => {
            const rsm = RuntimeSchemaManager.Instance;
            // ALLOW_RUNTIME_SCHEMA_UPDATE not set

            const result = rsm.Preview({
                MigrationSQL: 'CREATE TABLE [custom].[Good] (ID INT NOT NULL);',
                Description: 'test',
                AffectedTables: ['custom.Good'],
            });

            expect(result.WouldExecute).toBe(false);
            expect(result.ValidationErrors).toHaveLength(0); // SQL is valid, but RSU is disabled
        });
    });

    describe('RunPipeline', () => {
        it('should fail immediately when RSU is disabled', async () => {
            const rsm = RuntimeSchemaManager.Instance;

            const result = await rsm.RunPipeline({
                MigrationSQL: 'CREATE TABLE [custom].[Test] (ID INT NOT NULL);',
                Description: 'test',
                AffectedTables: ['custom.Test'],
            });

            expect(result.Success).toBe(false);
            expect(result.ErrorStep).toBe('ValidateEnvironment');
            expect(result.Steps[0].Status).toBe('failed');
            expect(result.Steps[0].Message).toContain('disabled');
        });

        it('should fail when SQL targets __mj schema', async () => {
            process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
            const rsm = RuntimeSchemaManager.Instance;

            const result = await rsm.RunPipeline({
                MigrationSQL: 'ALTER TABLE [__mj].[Entity] ADD NewCol INT;',
                Description: 'bad migration',
                AffectedTables: ['__mj.Entity'],
            });

            expect(result.Success).toBe(false);
            expect(result.ErrorStep).toBe('ValidateSQL');
        });
    });

    describe('RSUError', () => {
        it('should carry a code and message', () => {
            const error = new RSUError('TEST_CODE', 'Test message');
            expect(error.Code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.name).toBe('RSUError');
        });
    });
});
