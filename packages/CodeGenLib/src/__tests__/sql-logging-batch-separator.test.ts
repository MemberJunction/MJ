import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// vi.mock factories are hoisted above every import, so anything they reference must be hoisted too.
const { tmpDir, logFile } = await vi.hoisted(async () => {
    const [nodeFs, nodeOs, nodePath] = await Promise.all([import('fs'), import('os'), import('path')]);
    return {
        tmpDir: nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'mj-sql-log-')),
        logFile: 'CodeGen_Run_test.sql',
    };
});

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
    configInfo: {
        SQLOutput: {
            enabled: true,
            folderPath: tmpDir,
            fileName: logFile,
            appendToFile: false,
            omitRecurringScriptsFromLog: false,
            convertCoreSchemaToFlywayMigrationFile: false,
        },
    },
    currentWorkingDirectory: '/tmp',
    getSettingValue: vi.fn(),
    mj_core_schema: () => '__mj',
    dbPlatform: () => 'sqlserver',
    outputDir: '/tmp',
}));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn() }));

import { SQLLogging } from '../Misc/sql_logging';
import { SQLServerCodeGenProvider } from '../Database/providers/sqlserver/SQLServerCodeGenProvider';

/**
 * CodeGen executes every logged unit as its own query, so a T-SQL local variable declared in one
 * unit can never collide with the same name in the next. The SQL log is different: it is
 * concatenated verbatim into a migration (guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md step 4), and
 * SQL Server compiles a whole batch at once. Two `DECLARE @constraintName` blocks in one batch fail
 * replay with "The variable name '@constraintName' has already been declared" — which is exactly
 * what the drop-default-constraint path emitted for IdentityClaim / IdentityClaimType, whose
 * `SYSUTCDATETIME()` defaults CodeGen replaces on every run. Nothing fails at CodeGen time; the
 * migration fails on the next clean install.
 */
describe('SQLLogging batch separators in the replayable log', () => {
    const logPath = path.join(tmpDir, logFile);

    beforeEach(() => {
        // appendToFile is false in the mocked config, so init truncates the file for each test.
        SQLLogging.resetForTests();
        SQLLogging.initSQLLogging();
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('declaresTSQLVariable', () => {
        it('matches a top-level DECLARE @variable', () => {
            expect(SQLLogging.declaresTSQLVariable('DECLARE @constraintName NVARCHAR(255);\nSELECT 1')).toBe(true);
            expect(SQLLogging.declaresTSQLVariable('  declare @x int')).toBe(true);
        });

        it('sees through leading comments and whitespace', () => {
            expect(SQLLogging.declaresTSQLVariable('/* banner */\n-- note\nDECLARE @c NVARCHAR(10)')).toBe(true);
        });

        it('matches a batch-scoped DECLARE that is not the first statement', () => {
            expect(SQLLogging.declaresTSQLVariable('SET NOCOUNT ON;\nDECLARE @x INT;\nSELECT @x = 1')).toBe(true);
            expect(SQLLogging.declaresTSQLVariable("IF OBJECT_ID('x') IS NULL\nBEGIN\n    DECLARE @c NVARCHAR(10);\nEND")).toBe(true);
        });

        it('does not match a routine whose body declares variables', () => {
            const proc = 'CREATE PROCEDURE [__mj].[spX]\nAS\nBEGIN\n    DECLARE @id UNIQUEIDENTIFIER;\n    SELECT @id = NEWID();\nEND\nGO';
            expect(SQLLogging.declaresTSQLVariable(proc)).toBe(false);
            const fn = 'CREATE OR ALTER FUNCTION [__mj].[fnX]() RETURNS INT\nAS\nBEGIN\n    DECLARE @n INT = 1;\n    RETURN @n;\nEND';
            expect(SQLLogging.declaresTSQLVariable(fn)).toBe(false);
        });

        it('does not match ordinary statements or PostgreSQL DO blocks', () => {
            expect(SQLLogging.declaresTSQLVariable('ALTER TABLE [__mj].[X] ADD CONSTRAINT [DF_X] DEFAULT (GETUTCDATE()) FOR [Y]')).toBe(false);
            expect(SQLLogging.declaresTSQLVariable("DO $$ DECLARE c text; BEGIN SELECT 1; END $$;")).toBe(false);
            expect(SQLLogging.declaresTSQLVariable('')).toBe(false);
        });
    });

    it('separates consecutive SQL Server drop-default-constraint blocks into their own batches', async () => {
        const provider = new SQLServerCodeGenProvider();
        const blocks = [
            provider.dropDefaultConstraintSQL('__mj', 'IdentityClaim', '__mj_CreatedAt'),
            provider.dropDefaultConstraintSQL('__mj', 'IdentityClaim', '__mj_UpdatedAt'),
        ];
        for (const block of blocks) {
            // Deliberately the caller default (no separator requested): the logger must protect the file anyway.
            await SQLLogging.appendToSQLLogFile(block, 'drop default');
        }

        const written = fs.readFileSync(logPath, 'utf-8');
        const batches = written.split(/^\s*GO\s*$/im).filter((b) => b.trim().length > 0);
        expect(batches).toHaveLength(2);
        for (const batch of batches) {
            expect(batch.match(/DECLARE\s+@constraintName/gi)).toHaveLength(1);
        }
    });

    it('honors an explicit separator request from the caller', async () => {
        await SQLLogging.appendToSQLLogFile('ALTER TABLE [__mj].[X] ADD [Y] INT NULL', 'add column', false, true, 'GO');
        const written = fs.readFileSync(logPath, 'utf-8');
        expect(written).toMatch(/ADD \[Y\] INT NULL;\nGO\n\n$/);
    });

    it('does not emit a blank separator line when the platform has no batch separator', async () => {
        await SQLLogging.appendToSQLLogFile('ALTER TABLE "__mj"."x" ADD COLUMN "y" integer', 'pg add column', false, true, '');
        const written = fs.readFileSync(logPath, 'utf-8');
        expect(written).toBe('/* pg add column */\nALTER TABLE "__mj"."x" ADD COLUMN "y" integer;\n\n');
    });

    it('does not double a separator on a DECLARE unit that already closes its batch', async () => {
        await SQLLogging.appendToSQLLogFile('DECLARE @n INT;\nSELECT @n = 1;\nGO', 'self-terminated');
        const written = fs.readFileSync(logPath, 'utf-8');
        expect(written.match(/^\s*GO\s*$/gim)).toHaveLength(1);
    });

    it('leaves statements without variables alone', async () => {
        await SQLLogging.appendToSQLLogFile('ALTER TABLE [__mj].[X] ADD CONSTRAINT [DF_X_Y] DEFAULT (GETUTCDATE()) FOR [Y]', 'add default');
        const written = fs.readFileSync(logPath, 'utf-8');
        expect(written).not.toMatch(/\bGO\b/);
    });
});
