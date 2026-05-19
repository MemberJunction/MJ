/**
 * Debug migration runner — executes a SQL migration file batch-by-batch
 * within a transaction, providing exact line numbers on failure.
 *
 * Usage: node scripts/run-migration-debug.mjs <migration-file> [--commit]
 *
 * Reads DB connection from .env (DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE).
 *
 * Features:
 * - Replaces ${flyway:defaultSchema} with __mj
 * - Splits on GO statements
 * - Runs each batch sequentially in a transaction
 * - On failure: reports exact batch #, original file line range, and error
 * - Rolls back on any failure so the DB stays clean for re-run
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import sql from 'mssql';
import { config as dotenvConfig } from 'dotenv';

// Load .env from repo root
dotenvConfig();

const MIGRATION_FILE = process.argv[2];
if (!MIGRATION_FILE) {
    console.error('Usage: node scripts/run-migration-debug.mjs <migration-file> [--commit]');
    console.error('  Reads DB connection from .env: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE');
    process.exit(1);
}

const DB_CONFIG = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || '',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 120000,
    },
    pool: { max: 1, min: 1 },
};

// ─── Parse the SQL file into batches with line tracking ───

function parseSqlIntoBatches(filePath) {
    const raw = readFileSync(resolve(filePath), 'utf-8');
    // Replace Flyway placeholder
    const sqlText = raw.replace(/\$\{flyway:defaultSchema\}/g, '__mj');

    const lines = sqlText.split('\n');
    const batches = [];
    let currentBatch = [];
    let batchStartLine = 1; // 1-based line number in original file

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim().toUpperCase();

        if (trimmed === 'GO' || trimmed === 'GO;') {
            if (currentBatch.length > 0) {
                const batchText = currentBatch.join('\n').trim();
                if (batchText.length > 0) {
                    batches.push({
                        index: batches.length + 1,
                        sql: batchText,
                        startLine: batchStartLine,
                        endLine: i + 1, // 1-based
                        lineCount: currentBatch.length,
                    });
                }
            }
            currentBatch = [];
            batchStartLine = i + 2; // next line after GO (1-based)
        } else {
            currentBatch.push(line);
        }
    }

    // Last batch (no trailing GO)
    if (currentBatch.length > 0) {
        const batchText = currentBatch.join('\n').trim();
        if (batchText.length > 0) {
            batches.push({
                index: batches.length + 1,
                sql: batchText,
                startLine: batchStartLine,
                endLine: lines.length,
                lineCount: currentBatch.length,
            });
        }
    }

    return { batches, totalLines: lines.length };
}

// ─── Truncate SQL for display ───

function truncateSql(sqlText, maxLines = 8) {
    const lines = sqlText.split('\n');
    if (lines.length <= maxLines) return sqlText;
    return lines.slice(0, maxLines).join('\n') + `\n  ... (${lines.length - maxLines} more lines)`;
}

// ─── Find the specific line within a batch that likely caused the error ───

function findErrorLine(batchSql, errorMessage, batchStartLine) {
    const lines = batchSql.split('\n');
    const hints = [];

    // Extract column name from error like "Invalid column name 'xxx'"
    const colMatch = errorMessage.match(/Invalid column name '([^']+)'/);
    const objMatch = errorMessage.match(/Invalid object name '([^']+)'/);
    const searchTerm = colMatch?.[1] || objMatch?.[1];

    if (searchTerm) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(searchTerm)) {
                hints.push({
                    fileLine: batchStartLine + i,
                    batchLine: i + 1,
                    content: lines[i].trimStart(),
                });
            }
        }
    }

    return { searchTerm, hints };
}

// ─── Main ───

async function main() {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  Migration Debug Runner`);
    console.log(`  File: ${MIGRATION_FILE}`);
    console.log(`  Database: ${DB_CONFIG.database}`);
    console.log(`${'═'.repeat(70)}\n`);

    const { batches, totalLines } = parseSqlIntoBatches(MIGRATION_FILE);
    console.log(`  Parsed ${totalLines} lines into ${batches.length} SQL batches\n`);

    let pool;
    try {
        pool = await sql.connect(DB_CONFIG);
        console.log(`  Connected to ${DB_CONFIG.server}/${DB_CONFIG.database}\n`);
    } catch (err) {
        console.error(`  ✖ Connection failed: ${err.message}`);
        process.exit(1);
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    console.log(`  Transaction started\n`);

    let successCount = 0;
    let failedBatch = null;

    for (const batch of batches) {
        const preview = batch.sql.substring(0, 80).replace(/\n/g, ' ').trim();
        process.stdout.write(`  [${String(batch.index).padStart(3)}/${batches.length}] Lines ${batch.startLine}-${batch.endLine}: ${preview.substring(0, 50)}...`);

        try {
            const request = new sql.Request(transaction);
            request.timeout = 120000;
            await request.query(batch.sql);
            successCount++;
            console.log(` ✓`);
        } catch (err) {
            console.log(` ✖ FAILED`);
            failedBatch = batch;

            console.log(`\n${'─'.repeat(70)}`);
            console.log(`  ✖ BATCH ${batch.index} FAILED`);
            console.log(`${'─'.repeat(70)}`);
            console.log(`  Error:     ${err.message}`);
            console.log(`  SQL Lines: ${batch.startLine} - ${batch.endLine} (${batch.lineCount} lines)`);
            console.log(`  Batch #:   ${batch.index} of ${batches.length}`);
            console.log(`  Succeeded: ${successCount} batches before failure`);

            // Find specific lines that likely caused the error
            const { searchTerm, hints } = findErrorLine(batch.sql, err.message, batch.startLine);
            if (searchTerm && hints.length > 0) {
                console.log(`\n  Probable error locations (searching for "${searchTerm}"):`);
                for (const hint of hints.slice(0, 10)) {
                    console.log(`    Line ${hint.fileLine}: ${hint.content}`);
                }
            }

            console.log(`\n  Full SQL of failed batch:`);
            console.log(`${'─'.repeat(40)}`);
            console.log(truncateSql(batch.sql, 30));
            console.log(`${'─'.repeat(40)}`);

            break;
        }
    }

    if (failedBatch) {
        console.log(`\n  Rolling back transaction (failure)...`);
        await transaction.rollback();
        console.log(`  ✓ Rolled back. Database unchanged.\n`);
    } else {
        // Always rollback for testing — change to commit() for production use
        console.log(`\n  All ${successCount} batches succeeded.`);
        console.log(`  Rolling back transaction (test mode — use --commit to apply)...`);
        if (process.argv.includes('--commit')) {
            await transaction.commit();
            console.log(`  ✓ Committed.\n`);
        } else {
            await transaction.rollback();
            console.log(`  ✓ Rolled back. Database unchanged (test mode).\n`);
        }
    }

    await pool.close();

    // Summary
    console.log(`${'═'.repeat(70)}`);
    if (failedBatch) {
        console.log(`  RESULT: FAILED at batch ${failedBatch.index} (line ${failedBatch.startLine})`);
        console.log(`  ${successCount}/${batches.length} batches succeeded before failure`);
    } else {
        console.log(`  RESULT: SUCCESS — ${successCount} batches applied`);
    }
    console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
});
