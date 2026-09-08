import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('mssql', () => ({}));
vi.mock('../Config/config', () => ({
    configInfo: {
        SQLOutput: {
            enabled: true,
            // Overridden per run through SQLLogging.sqlOutputDirFlag, which resolveSQLOutputFolder prefers.
            folderPath: '/tmp',
            fileName: 'CodeGen_Run_test.sql',
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
    let tmpDir: string;
    let logPath: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-sql-log-'));
        logPath = path.join(tmpDir, 'CodeGen_Run_test.sql');
    });

    beforeEach(() => {
        // appendToFile is false in the mocked config, so init truncates the file for each test.
        SQLLogging.resetForTests();
        SQLLogging.sqlOutputDirFlag = tmpDir;
        SQLLogging.initSQLLogging();
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('declaresBatchScopedVariable', () => {
        it('matches a top-level DECLARE @variable', () => {
            expect(SQLLogging.declaresBatchScopedVariable('DECLARE @constraintName NVARCHAR(255);\nSELECT 1')).toBe(true);
            expect(SQLLogging.declaresBatchScopedVariable('  declare @x int')).toBe(true);
        });

        it('sees through leading comments and whitespace', () => {
            expect(SQLLogging.declaresBatchScopedVariable('/* banner */\n-- note\nDECLARE @c NVARCHAR(10)')).toBe(true);
        });

        it('matches a batch-scoped DECLARE that is not the first statement', () => {
            expect(SQLLogging.declaresBatchScopedVariable('SET NOCOUNT ON;\nDECLARE @x INT;\nSELECT @x = 1')).toBe(true);
            expect(SQLLogging.declaresBatchScopedVariable("IF OBJECT_ID('x') IS NULL\nBEGIN\n    DECLARE @c NVARCHAR(10);\nEND")).toBe(true);
        });

        it('does not match a routine whose body declares variables', () => {
            const proc = 'CREATE PROCEDURE [__mj].[spX]\nAS\nBEGIN\n    DECLARE @id UNIQUEIDENTIFIER;\n    SELECT @id = NEWID();\nEND\nGO';
            expect(SQLLogging.declaresBatchScopedVariable(proc)).toBe(false);
            const fn = 'CREATE OR ALTER FUNCTION [__mj].[fnX]() RETURNS INT\nAS\nBEGIN\n    DECLARE @n INT = 1;\n    RETURN @n;\nEND';
            expect(SQLLogging.declaresBatchScopedVariable(fn)).toBe(false);
            const altered = 'ALTER PROCEDURE [__mj].[spX]\nAS\nBEGIN\n    DECLARE @id UNIQUEIDENTIFIER;\nEND';
            expect(SQLLogging.declaresBatchScopedVariable(altered)).toBe(false);
        });

        it('matches a batch-scoped DECLARE that follows a routine and its GO in the same unit', () => {
            const unit = 'CREATE FUNCTION [__mj].[fnX]() RETURNS INT\nAS\nBEGIN\n    RETURN 1;\nEND\nGO\nDECLARE @c NVARCHAR(255);\nSELECT @c = 1;';
            expect(SQLLogging.declaresBatchScopedVariable(unit)).toBe(true);
        });

        it('does not match ordinary statements or PostgreSQL DO blocks', () => {
            expect(SQLLogging.declaresBatchScopedVariable('ALTER TABLE [__mj].[X] ADD CONSTRAINT [DF_X] DEFAULT (GETUTCDATE()) FOR [Y]')).toBe(false);
            expect(SQLLogging.declaresBatchScopedVariable("DO $$ DECLARE c text; BEGIN SELECT 1; END $$;")).toBe(false);
            expect(SQLLogging.declaresBatchScopedVariable('')).toBe(false);
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

    it('suppressOutputForTests closes an open capture file and restores it', async () => {
        const restore = SQLLogging.suppressOutputForTests();
        try {
            expect(SQLLogging.SQLLoggingFilePath).toBe('');
            await SQLLogging.appendToSQLLogFile('SELECT 1', 'while suppressed');
            expect(fs.readFileSync(logPath, 'utf-8')).toBe('');
        } finally {
            restore();
        }
        expect(SQLLogging.SQLLoggingFilePath).toBe(logPath);
    });

    it('leaves statements without variables alone', async () => {
        await SQLLogging.appendToSQLLogFile('ALTER TABLE [__mj].[X] ADD CONSTRAINT [DF_X_Y] DEFAULT (GETUTCDATE()) FOR [Y]', 'add default');
        const written = fs.readFileSync(logPath, 'utf-8');
        expect(written).not.toMatch(/\bGO\b/);
    });
});
