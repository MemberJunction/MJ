/**
 * E2E Smoke Test for RuntimeSchemaManager pipeline.
 *
 * Tests Preview() and RunPipeline() against a live SQL Server.
 * Run with: npx tsx e2e-test.ts
 */

// ─── Environment Setup ──────────────────────────────────────────────
process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
process.env.DB_HOST = 'sql-claude';
process.env.DB_DATABASE = 'MJTest';
process.env.DB_USER = 'sa';
process.env.DB_PASSWORD = 'Claude2Sql99';
process.env.RSU_MIGRATIONS_PATH = '/tmp/rsu_migrations';

import { RuntimeSchemaManager, ValidateMigrationSQL } from './packages/SchemaEngine/src/RuntimeSchemaManager.js';
import type { RSUPipelineInput, RSUPipelineResult, RSUPreviewResult } from './packages/SchemaEngine/src/RuntimeSchemaManager.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function log(label: string, data: unknown): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${label}`);
    console.log('='.repeat(60));
    console.log(JSON.stringify(data, null, 2));
}

function logStep(step: { Name: string; Status: string; DurationMs: number; Message: string }): void {
    const icon = step.Status === 'success' ? '✅' : step.Status === 'skipped' ? '⏭️' : '❌';
    console.log(`  ${icon} ${step.Name} (${step.DurationMs}ms) — ${step.Message}`);
}

// ─── Test SQL ────────────────────────────────────────────────────────

const SETUP_SCHEMA_SQL = `
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'smoke_test')
    EXEC('CREATE SCHEMA smoke_test');
`;

const CREATE_TABLE_SQL = `
CREATE TABLE [smoke_test].[RSU_Test] (
    ID INT NOT NULL IDENTITY(1,1),
    Name NVARCHAR(100) NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_RSU_Test PRIMARY KEY (ID)
);
`;

const CLEANUP_SQL = `
IF OBJECT_ID('smoke_test.RSU_Test', 'U') IS NOT NULL
    DROP TABLE [smoke_test].[RSU_Test];
`;

// ─── Tests ───────────────────────────────────────────────────────────

async function testValidateMigrationSQL(): Promise<void> {
    console.log('\n--- Test: ValidateMigrationSQL ---');

    // Should pass: smoke_test schema
    const good = ValidateMigrationSQL(CREATE_TABLE_SQL);
    console.log(`  Safe SQL valid: ${good.Valid} (expected: true)`);

    // Should fail: __mj schema
    const bad = ValidateMigrationSQL('CREATE TABLE [__mj].[Bad] (ID INT)');
    console.log(`  __mj SQL valid: ${bad.Valid} (expected: false)`);
    if (bad.Errors.length > 0) {
        console.log(`  Error: ${bad.Errors[0]}`);
    }
}

async function testPreview(): Promise<void> {
    console.log('\n--- Test: Preview ---');

    const rsm = RuntimeSchemaManager.Instance;
    console.log(`  IsEnabled: ${rsm.IsEnabled}`);

    const input: RSUPipelineInput = {
        MigrationSQL: CREATE_TABLE_SQL,
        Description: 'Smoke test table',
        AffectedTables: ['smoke_test.RSU_Test'],
    };

    const preview: RSUPreviewResult = rsm.Preview(input);
    log('Preview Result', preview);
}

async function testRunPipeline(): Promise<void> {
    console.log('\n--- Test: RunPipeline ---');

    const rsm = RuntimeSchemaManager.Instance;

    // First ensure the schema exists and clean up any previous test table
    const { exec } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execAsync = promisify(exec);

    console.log('  Setting up: creating smoke_test schema and cleaning up old table...');
    const setupSQL = CLEANUP_SQL + '\n' + SETUP_SCHEMA_SQL;
    const { writeFileSync, unlinkSync, mkdirSync } = await import('node:fs');
    const tmpSetup = '/tmp/rsu_setup.sql';
    writeFileSync(tmpSetup, setupSQL, 'utf-8');
    try {
        const setupResult = await execAsync(
            `sqlcmd -S sql-claude -d MJTest -U sa -P Claude2Sql99 -i ${tmpSetup} -C`,
            { timeout: 30_000 }
        );
        console.log(`  Setup stdout: ${setupResult.stdout.trim()}`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  Setup warning: ${msg}`);
    } finally {
        try { unlinkSync(tmpSetup); } catch { /* */ }
    }

    // Create migrations dir
    try { mkdirSync('/tmp/rsu_migrations', { recursive: true }); } catch { /* */ }

    // Set CodeGen to a no-op so the pipeline can complete through all steps.
    // In a real environment, RSU_CODEGEN_COMMAND would point to `npx mj codegen`.
    process.env.RSU_CODEGEN_COMMAND = 'echo "CodeGen skipped (smoke test)"';
    // Skip TS compile by pointing to a trivially-buildable no-op
    process.env.RSU_COMPILE_PACKAGES = '';

    const input: RSUPipelineInput = {
        MigrationSQL: CREATE_TABLE_SQL,
        Description: 'Smoke test: create RSU_Test table',
        AffectedTables: ['smoke_test.RSU_Test'],
        SkipRestart: true,
        SkipGitCommit: true,
    };

    console.log('  Running pipeline...');
    const result: RSUPipelineResult = await rsm.RunPipeline(input);

    console.log(`\n  Pipeline Success: ${result.Success}`);
    console.log(`  Migration File: ${result.MigrationFilePath}`);
    console.log(`  API Restarted: ${result.APIRestarted}`);
    console.log(`  Error: ${result.ErrorMessage || 'none'}`);
    console.log(`  Error Step: ${result.ErrorStep || 'none'}`);
    console.log('\n  Steps:');
    for (const step of result.Steps) {
        logStep(step);
    }

    // Verify the table was actually created
    console.log('\n  Verifying table creation...');
    const verifySQL = `SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'smoke_test' AND TABLE_NAME = 'RSU_Test'`;
    const tmpVerify = '/tmp/rsu_verify.sql';
    writeFileSync(tmpVerify, verifySQL, 'utf-8');
    try {
        const verifyResult = await execAsync(
            `sqlcmd -S sql-claude -d MJTest -U sa -P Claude2Sql99 -i ${tmpVerify} -C`,
            { timeout: 10_000 }
        );
        console.log(`  Verify result: ${verifyResult.stdout.trim()}`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  Verify error: ${msg}`);
    } finally {
        try { unlinkSync(tmpVerify); } catch { /* */ }
    }

    // Cleanup
    console.log('\n  Cleaning up test table...');
    const tmpCleanup = '/tmp/rsu_cleanup.sql';
    writeFileSync(tmpCleanup, CLEANUP_SQL, 'utf-8');
    try {
        await execAsync(
            `sqlcmd -S sql-claude -d MJTest -U sa -P Claude2Sql99 -i ${tmpCleanup} -C`,
            { timeout: 10_000 }
        );
        console.log('  Cleanup done.');
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  Cleanup warning: ${msg}`);
    } finally {
        try { unlinkSync(tmpCleanup); } catch { /* */ }
    }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('RuntimeSchemaManager E2E Smoke Test');
    console.log('===================================');

    await testValidateMigrationSQL();
    await testPreview();
    await testRunPipeline();

    console.log('\n\nDone.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
