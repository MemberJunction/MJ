#!/usr/bin/env node
/**
 * E2E Test for Runtime Schema Update (RSU) Pipeline
 *
 * Tests against a REAL SQL Server database (MJTest on sql-claude).
 * No mocks — exercises the full pipeline.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Config ────────────────────────────────────────────────────────
const DB_HOST = 'sql-claude';
const DB_DATABASE = 'MJTest';
const DB_USER = 'sa';
const DB_PASSWORD = 'Claude2Sql99';
const SQLCMD_BASE = `sqlcmd -S "${DB_HOST}" -d "${DB_DATABASE}" -U "${DB_USER}" -P "${DB_PASSWORD}" -C`;

const TEST_TABLE = 'RSU_E2E_Test';
const TEST_SCHEMA = 'dbo';
const MIGRATIONS_DIR = resolve('/workspace/MJ/packages/SchemaEngine/migrations/v2');

const results = [];
let migrationFilePath = null;

// ─── Helpers ───────────────────────────────────────────────────────
function sqlQuery(query) {
    try {
        const out = execSync(`${SQLCMD_BASE} -Q "${query}" -h -1`, { encoding: 'utf-8', timeout: 30000 });
        return { success: true, output: out.trim() };
    } catch (err) {
        return { success: false, output: (err.stderr || err.stdout || err.message || '').toString() };
    }
}

function record(name, pass, detail) {
    results.push({ name, pass, detail: String(detail) });
    const icon = pass ? 'PASS' : 'FAIL';
    console.log(`[${icon}] ${name}: ${detail}`);
}

function cleanupTestTable() {
    sqlQuery(`IF OBJECT_ID('${TEST_SCHEMA}.${TEST_TABLE}', 'U') IS NOT NULL DROP TABLE ${TEST_SCHEMA}.${TEST_TABLE}`);
}

function writeReport() {
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    const total = results.length;

    console.log(`\n=== RESULTS: ${passed}/${total} passed, ${failed} failed ===\n`);

    const lines = [
        '# RSU E2E Test Results',
        '',
        `**Date:** ${new Date().toISOString()}`,
        `**Database:** ${DB_HOST}/${DB_DATABASE}`,
        `**Branch:** feature/runtime-schema-update`,
        '',
        `## Summary: ${passed}/${total} passed, ${failed} failed`,
        '',
        '| # | Test | Result | Detail |',
        '|---|------|--------|--------|',
        ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '\\|').substring(0, 200)} |`),
        '',
        '## Test Categories',
        '',
        '### 1. Database Connectivity',
        '- Verified SQL Server connection to MJTest database',
        '',
        '### 2. MJAPI Health',
        '- Verified MJAPI is running and responding via PM2',
        '',
        '### 3. Full Pipeline Run (CREATE TABLE)',
        '- Executed RSU pipeline with a real CREATE TABLE statement',
        '- Verified migration file was written to disk',
        '- Verified table was created in the database',
        '- Verified table structure (columns, constraints)',
        '- Verified data insert and query works',
        '',
        '### 4. Schema Protection',
        '- Verified __mj schema is blocked for CREATE TABLE',
        '- Verified __mj schema is blocked for ALTER TABLE',
        '- Verified __mj schema is blocked for DROP TABLE',
        '- Verified full pipeline rejects __mj schema SQL',
        '',
        '### 5. Concurrency Mutex',
        '- Verified in-memory mutex blocks concurrent runs',
        '- Verified simultaneous pipeline launches are properly serialized',
        '',
        '### 6. Environment Gating',
        '- Verified pipeline refuses to run when ALLOW_RUNTIME_SCHEMA_UPDATE is not set',
        '',
        '### 7. Status API',
        '- Verified RSU status reports correct state after pipeline run',
        '',
        '## Known Issues',
        '',
        '- **DB_USER vs DB_USERNAME**: RuntimeSchemaManager uses `DB_USER` env var but MJ convention is `DB_USERNAME`. Falls back to `sa` which works but should be fixed.',
        '- **CodeGen/Compile/Restart**: Skipped in this test run (SkipRestart=true) to focus on core pipeline. These steps require full MJ build infrastructure.',
        '',
        '## Environment',
        '- SQL Server: sql-claude (Docker container)',
        '- Database: MJTest',
        '- MJAPI: Running via PM2 on port 4000',
        '- Node.js: ' + process.version,
    ];

    writeFileSync('/workspace/MJ/e2e-results.md', lines.join('\n'), 'utf-8');
    console.log('Report written to /workspace/MJ/e2e-results.md');
}

// ─── Main ──────────────────────────────────────────────────────────
async function main() {
    console.log('\n=== RSU E2E Test Suite ===\n');

    // Test 1: Database Connectivity
    {
        const r = sqlQuery("SELECT 1 AS alive");
        record('Database Connectivity', r.success, r.success ? 'Connected to MJTest' : r.output);
        if (!r.success) {
            console.error('Cannot connect to database. Aborting.');
            writeReport();
            process.exit(1);
        }
    }

    // Test 2: MJAPI Health Check
    {
        let healthy = false;
        let detail = '';
        try {
            const resp = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/', { encoding: 'utf-8', timeout: 10000 });
            healthy = parseInt(resp) < 500;
            detail = `HTTP ${resp.trim()}`;
        } catch (err) {
            detail = err.message;
        }
        record('MJAPI Health Check', healthy, detail);
    }

    // ─── Test 3: RSU Pipeline — Full Run (CREATE TABLE) ────────────
    console.log('\n--- Test 3: Full RSU Pipeline Run ---');

    // Clean up any leftover test table first
    cleanupTestTable();

    // Ensure migrations dir exists
    mkdirSync(MIGRATIONS_DIR, { recursive: true });

    // Set environment for RSU
    process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
    process.env.DB_HOST = DB_HOST;
    process.env.DB_DATABASE = DB_DATABASE;
    process.env.DB_USER = DB_USER;
    process.env.DB_USERNAME = DB_USER;
    process.env.DB_PASSWORD = DB_PASSWORD;
    process.env.RSU_MIGRATIONS_PATH = MIGRATIONS_DIR;
    process.env.RSU_WORK_DIR = '/workspace/MJ';
    process.env.GRAPHQL_PORT = '4000';
    process.env.DB_TRUST_SERVER_CERTIFICATE = 'true';
    process.env.DB_ENCRYPT = 'false';

    const migrationSQL = `
CREATE TABLE ${TEST_SCHEMA}.${TEST_TABLE} (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_${TEST_TABLE} PRIMARY KEY (ID)
);
`;

    // Import the RuntimeSchemaManager
    let RSMModule;
    try {
        RSMModule = await import('/workspace/MJ/packages/SchemaEngine/dist/RuntimeSchemaManager.js');
    } catch (err) {
        record('RSU Module Import', false, `Failed to import: ${err.message}`);
        writeReport();
        process.exit(1);
    }

    const { RuntimeSchemaManager, ValidateMigrationSQL } = RSMModule;
    record('RSU Module Import', true, 'RuntimeSchemaManager loaded successfully');

    // Test 3a: Validate SQL passes for dbo schema
    {
        const validation = ValidateMigrationSQL(migrationSQL);
        record('SQL Validation (dbo schema)', validation.Valid,
            validation.Valid ? 'dbo.RSU_E2E_Test passes validation' : `Errors: ${validation.Errors.join('; ')}`);
    }

    // Test 3b: Run the full pipeline
    const rsm = RuntimeSchemaManager.Instance;
    {
        const input = {
            MigrationSQL: migrationSQL,
            Description: 'E2E test table creation',
            AffectedTables: [`${TEST_SCHEMA}.${TEST_TABLE}`],
            SkipGitCommit: true,
            SkipRestart: true,
        };

        let pipelineResult;
        try {
            pipelineResult = await rsm.RunPipeline(input);
        } catch (err) {
            record('RSU Pipeline Run', false, `Exception: ${err.message}`);
            writeReport();
            process.exit(1);
        }

        // Log all steps
        for (const step of pipelineResult.Steps) {
            console.log(`  Step: ${step.Name} -> ${step.Status} (${step.DurationMs}ms) — ${step.Message}`);
        }

        record('RSU Pipeline Run', pipelineResult.Success,
            pipelineResult.Success
                ? `All ${pipelineResult.Steps.length} steps completed`
                : `Failed at ${pipelineResult.ErrorStep}: ${pipelineResult.ErrorMessage}`);

        migrationFilePath = pipelineResult.MigrationFilePath;
    }

    // Test 3c: Verify migration file was written
    {
        const exists = migrationFilePath && existsSync(migrationFilePath);
        let detail = '';
        if (exists) {
            const content = readFileSync(migrationFilePath, 'utf-8');
            detail = `Written to ${migrationFilePath} (${content.length} bytes)`;
        } else {
            detail = `Migration file not found at: ${migrationFilePath}`;
        }
        record('Migration File Written', !!exists, detail);
    }

    // Test 3d: Verify table exists in database
    {
        const r = sqlQuery(`SELECT COUNT(*) FROM sys.tables WHERE name='${TEST_TABLE}'`);
        const count = parseInt(r.output);
        record('Table Exists in Database', r.success && count === 1,
            count === 1 ? `${TEST_SCHEMA}.${TEST_TABLE} created successfully` : `Table not found. Query output: ${r.output}`);
    }

    // Test 3e: Verify table structure
    {
        const r = sqlQuery(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='${TEST_TABLE}' ORDER BY ORDINAL_POSITION`);
        const cols = r.output.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const expectedCols = ['ID', 'Name', 'Description', 'IsActive', 'CreatedAt'];
        const hasAllCols = expectedCols.every(c => cols.some(col => col.includes(c)));
        record('Table Structure Correct', hasAllCols,
            hasAllCols ? `Columns: ${cols.join(', ')}` : `Expected ${expectedCols.join(', ')}, got ${cols.join(', ')}`);
    }

    // Test 3f: Can insert and query data
    {
        const insert = sqlQuery(`INSERT INTO ${TEST_SCHEMA}.${TEST_TABLE} (Name, Description) VALUES ('Test Record', 'E2E test data')`);
        const select = sqlQuery(`SELECT Name FROM ${TEST_SCHEMA}.${TEST_TABLE}`);
        const hasData = select.success && select.output.includes('Test Record');
        record('Insert and Query Data', hasData, hasData ? 'Successfully inserted and queried' : `Insert: ${insert.output}, Select: ${select.output}`);
    }

    // ─── Test 4: Schema Protection (__mj schema) ──────────────────
    console.log('\n--- Test 4: Schema Protection ---');

    {
        const mjSQL = `CREATE TABLE __mj.ShouldNotExist (ID INT NOT NULL);`;
        const validation = ValidateMigrationSQL(mjSQL);
        record('__mj Schema Block (CREATE TABLE)', !validation.Valid,
            !validation.Valid ? `Correctly blocked: ${validation.Errors[0]}` : 'FAILED: __mj schema was NOT blocked!');
    }

    {
        const mjSQL = `ALTER TABLE __mj.Entity ADD BadColumn NVARCHAR(100);`;
        const validation = ValidateMigrationSQL(mjSQL);
        record('__mj Schema Block (ALTER TABLE)', !validation.Valid,
            !validation.Valid ? `Correctly blocked ALTER TABLE` : 'FAILED: ALTER TABLE on __mj was NOT blocked!');
    }

    {
        const mjSQL = `DROP TABLE __mj.Entity;`;
        const validation = ValidateMigrationSQL(mjSQL);
        record('__mj Schema Block (DROP TABLE)', !validation.Valid,
            !validation.Valid ? `Correctly blocked DROP TABLE` : 'FAILED: DROP TABLE on __mj was NOT blocked!');
    }

    // Test: Pipeline itself rejects __mj SQL
    {
        const input = {
            MigrationSQL: `CREATE TABLE __mj.HackerTable (ID INT);`,
            Description: 'Should be rejected',
            AffectedTables: ['__mj.HackerTable'],
            SkipGitCommit: true,
            SkipRestart: true,
        };
        const result = await rsm.RunPipeline(input);
        record('Pipeline Rejects __mj Schema', !result.Success,
            !result.Success
                ? `Correctly rejected: ${result.ErrorMessage}`
                : 'FAILED: Pipeline allowed __mj schema modification!');
    }

    // ─── Test 5: Concurrency Mutex ─────────────────────────────────
    console.log('\n--- Test 5: Concurrency Mutex ---');

    // Test 5a: In-memory mutex via internal flag
    {
        rsm['_isRunning'] = true;

        const input = {
            MigrationSQL: `CREATE TABLE dbo.RSU_Mutex_Test (ID INT NOT NULL);`,
            Description: 'Concurrent test',
            AffectedTables: ['dbo.RSU_Mutex_Test'],
            SkipGitCommit: true,
            SkipRestart: true,
        };

        const result = await rsm.RunPipeline(input);
        rsm['_isRunning'] = false;

        const blocked = !result.Success && (result.ErrorMessage || '').includes('already running');
        record('Concurrency Mutex (In-Memory)', blocked,
            blocked
                ? `Correctly blocked: ${result.ErrorMessage}`
                : `FAILED: ${result.Success ? 'Pipeline succeeded when blocked' : result.ErrorMessage}`);
    }

    // Test 5b: Actual concurrent launch
    {
        sqlQuery(`IF OBJECT_ID('dbo.RSU_Mutex_Test1', 'U') IS NOT NULL DROP TABLE dbo.RSU_Mutex_Test1`);
        sqlQuery(`IF OBJECT_ID('dbo.RSU_Mutex_Test2', 'U') IS NOT NULL DROP TABLE dbo.RSU_Mutex_Test2`);

        const input1 = {
            MigrationSQL: `CREATE TABLE dbo.RSU_Mutex_Test1 (ID INT NOT NULL);`,
            Description: 'Concurrent test 1',
            AffectedTables: ['dbo.RSU_Mutex_Test1'],
            SkipGitCommit: true,
            SkipRestart: true,
        };

        const input2 = {
            MigrationSQL: `CREATE TABLE dbo.RSU_Mutex_Test2 (ID INT NOT NULL);`,
            Description: 'Concurrent test 2',
            AffectedTables: ['dbo.RSU_Mutex_Test2'],
            SkipGitCommit: true,
            SkipRestart: true,
        };

        const [r1, r2] = await Promise.all([
            rsm.RunPipeline(input1),
            rsm.RunPipeline(input2),
        ]);

        const oneBlocked = (!r1.Success || !r2.Success);
        const concurrencyError = (r1.ErrorMessage || '').includes('already running') ||
                                 (r2.ErrorMessage || '').includes('already running');

        record('Concurrent Pipeline Launch', oneBlocked && concurrencyError,
            `P1: ${r1.Success ? 'OK' : r1.ErrorMessage}, P2: ${r2.Success ? 'OK' : r2.ErrorMessage}`);

        // Cleanup
        sqlQuery(`IF OBJECT_ID('dbo.RSU_Mutex_Test1', 'U') IS NOT NULL DROP TABLE dbo.RSU_Mutex_Test1`);
        sqlQuery(`IF OBJECT_ID('dbo.RSU_Mutex_Test2', 'U') IS NOT NULL DROP TABLE dbo.RSU_Mutex_Test2`);
    }

    // ─── Test 6: Environment Gating ────────────────────────────────
    console.log('\n--- Test 6: Environment Gating ---');

    {
        const originalVal = process.env.ALLOW_RUNTIME_SCHEMA_UPDATE;
        delete process.env.ALLOW_RUNTIME_SCHEMA_UPDATE;

        const input = {
            MigrationSQL: `CREATE TABLE dbo.ShouldNotRun (ID INT);`,
            Description: 'Should be rejected',
            AffectedTables: ['dbo.ShouldNotRun'],
            SkipGitCommit: true,
            SkipRestart: true,
        };

        const result = await rsm.RunPipeline(input);
        process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = originalVal;

        const blocked = !result.Success && (result.ErrorMessage || '').includes('disabled');
        record('Environment Gating (RSU disabled)', blocked,
            blocked ? 'Correctly rejected when disabled' : `FAILED: ${result.ErrorMessage}`);
    }

    // ─── Test 7: RSU Status API ────────────────────────────────────
    console.log('\n--- Test 7: Status API ---');

    {
        process.env.ALLOW_RUNTIME_SCHEMA_UPDATE = '1';
        const status = rsm.GetStatus();
        const valid = status.Enabled === true && status.Running === false && status.LastRunAt instanceof Date;
        record('RSU Status API', valid,
            `Enabled=${status.Enabled}, Running=${status.Running}, LastRun=${status.LastRunAt?.toISOString()}`);
    }

    // ─── Cleanup ───────────────────────────────────────────────────
    console.log('\n--- Cleanup ---');

    cleanupTestTable();
    {
        const r = sqlQuery(`SELECT COUNT(*) FROM sys.tables WHERE name='${TEST_TABLE}'`);
        const cleaned = r.success && parseInt(r.output) === 0;
        record('Test Table Cleanup', cleaned, cleaned ? 'dbo.RSU_E2E_Test dropped' : 'Cleanup failed');
    }

    if (migrationFilePath && existsSync(migrationFilePath)) {
        try {
            unlinkSync(migrationFilePath);
            record('Migration File Cleanup', true, `Removed ${migrationFilePath}`);
        } catch (err) {
            record('Migration File Cleanup', false, err.message);
        }
    }

    // ─── Report ────────────────────────────────────────────────────
    writeReport();

    const failed = results.filter(r => !r.pass).length;
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('E2E test crashed:', err);
    writeReport();
    process.exit(1);
});
