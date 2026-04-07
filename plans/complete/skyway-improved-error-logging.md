# Skyway — Improved Error Logging Plan

## Problem

When a migration fails, Skyway reports the error message and the migration file name, but **no line number, batch number, or SQL context**. For large migrations (10K+ lines with many GO-separated batches), this makes debugging extremely difficult.

### Example of current output:
```
✖ Running migrations...

Migration failed: Invalid column name '__mj_CreatedAt'.

  FAILED: V202604060452__v5.24.x__KnowledgeHub_Integrated_Migration.sql
    Error: Invalid column name '__mj_CreatedAt'.
```

The user has no idea which of the 200+ batches failed, which line in a 17,000-line file caused it, or what SQL was being executed.

### What we need:
```
✖ BATCH 47 FAILED (of 231 batches)
  File:    V202604060452__v5.24.x__KnowledgeHub_Integrated_Migration.sql
  Lines:   696 - 7594 (6898 lines in this batch)
  Error:   Invalid column name '__mj_CreatedAt'
  
  ► Exact error location:
    File line 852 (batch line 157): , [__mj_CreatedAt]

  Related lines (searching for "__mj_CreatedAt"):
    Line 852:  , [__mj_CreatedAt]
    Line 881:  ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt]...
    
  47/231 batches succeeded before failure.
  Transaction rolled back — database unchanged.
```

## Root Cause Context

SQL Server's `GO` statement is a batch separator. Each batch is compiled and validated **as a unit** before execution. If any statement in a batch references a column that doesn't exist at compile time — even if an earlier statement in the same batch creates it — the entire batch fails.

Common patterns that trigger this:
1. `ALTER TABLE ... ADD [Column]` followed by `UPDATE ... SET [Column] = ...` in the same batch
2. `CREATE VIEW ... SELECT *` on a table where columns are added by ALTER TABLE later in the same batch
3. Large CodeGen-generated migration blocks without sufficient `GO` separators

The upstream CodeGen tool has been fixed to emit proper batch separators in these cases, but Skyway's error reporting should be robust regardless of the migration content.

## Proposed Changes to Skyway

### 1. Batch-Level Error Reporting

**Where**: The migration runner module (wherever `executeScript()` or equivalent executes SQL files)

Currently Skyway likely does one of:
- Sends the entire migration file as a single query
- Splits on `GO` but doesn't track batch numbers or line ranges

**Change**: When executing a migration:
1. Split the SQL file on `GO` statements (respecting quoted strings and comments)
2. Track the original file line number for each batch start/end
3. Execute each batch sequentially within the migration's transaction
4. On failure, report:
   - **Batch number** (N of M)
   - **Original file line range** (start line - end line)  
   - **Batch size** in lines
   - **Number of batches that succeeded** before failure
   - **The SQL Server error message** (already reported)

### 2. Intelligent Error Context

When the error message contains identifiable patterns, extract and display the probable source lines:

| Error Pattern | Context to Show |
|--------------|-----------------|
| `Invalid column name 'X'` | Search batch SQL for all lines containing `X`, show with file line numbers |
| `Invalid object name 'X'` | Same — show lines referencing the object |
| `Violation of UNIQUE KEY constraint 'X'` | Show the INSERT/UPDATE statement and the conflicting values |
| `Cannot insert duplicate key` | Show the INSERT statement with the key values |
| `Conversion failed` | Show the line with the conversion |

Implementation: regex match on the error message to extract identifiers, then scan the failed batch's SQL for lines containing those identifiers.

### 3. Line Number Normalization

SQL Server's `err.lineNumber` property gives the line within the **executed batch** — but this is the batch as SQL Server sees it, which may include Skyway's transaction wrapper (`BEGIN TRANSACTION`, `COMMIT`, etc.) prepended/appended around the user's migration SQL. 

Skyway must:
1. Track how many lines its own pre-block (transaction start, variable declarations, etc.) adds before the user's SQL
2. Subtract that offset from `err.lineNumber` to get the line within the user's batch
3. Add the batch's `startLine` (from the original file) to get the file-level line number

```
preBlockLineCount = number of lines Skyway adds before the migration SQL
batchLocalLine = err.lineNumber - preBlockLineCount
fileLineNumber = batch.startLine + batchLocalLine - 1
```

Data model for batch tracking:
```typescript
interface SqlBatch {
    index: number;          // 1-based batch number
    sql: string;            // The SQL text for this batch
    startLine: number;      // 1-based line in original migration file
    endLine: number;        // 1-based line in original migration file  
    lineCount: number;      // Number of lines in this batch
}
```

The final reported line number should match exactly what the user sees when they open the migration file in their editor.

**Important**: This normalization logic must be implemented per database provider. Skyway is being extended to support PostgreSQL, MySQL, and other databases — each has different:
- Batch separator conventions (`GO` for SQL Server, `;` for PG/MySQL, or none)
- Error metadata shape (SQL Server returns `lineNumber` on the error object; PG returns it differently)
- Transaction wrapper patterns (different pre/post blocks per provider)

The batch parsing, line tracking, and error context extraction should be implemented in the provider-specific layer, not hardcoded to SQL Server conventions.

### 4. Verbose Mode Flag

Add a `--verbose` or `--trace` flag that enables:
- Per-batch progress logging: `[  1/231] Lines 1-21: ALTER TABLE... ✓`
- Full SQL dump of failed batch (truncated to ~30 lines with "... N more lines" indicator)
- All probable error location lines

In normal mode, just report the summary on failure. In verbose mode, show progress for every batch.

### 5. Transaction Safety Reporting

When a migration fails:
- Clearly state whether the transaction was rolled back
- If rolled back: "Database unchanged — safe to re-run after fixing the migration"
- If NOT in a transaction: "WARNING: Partial changes may have been applied. Manual cleanup may be required."

## Reference Implementation

The following standalone Node.js script demonstrates all of the above features. It was used to debug the actual migration failure that prompted this plan.

```javascript
/**
 * Debug migration runner — executes a SQL migration file batch-by-batch
 * within a transaction, providing exact line numbers on failure.
 *
 * Usage: node run-migration-debug.mjs <migration-file> [--commit]
 *
 * Features:
 * - Splits on GO statements (batch separator)
 * - Runs each batch sequentially in a transaction
 * - On failure: reports exact batch #, original file line range, and error
 * - Rolls back on any failure so the DB stays clean for re-run
 * - Use --commit flag to actually apply on success (default: rollback for testing)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import sql from 'mssql';

const MIGRATION_FILE = process.argv[2];
if (!MIGRATION_FILE) {
    console.error('Usage: node run-migration-debug.mjs <migration-file> [--commit]');
    process.exit(1);
}

// Configure these for your environment
const DB_CONFIG = {
    server: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433'),
    user: process.env.DB_USER || 'sa',
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
    const lines = raw.split('\n');
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

    // Extract identifiers from common SQL Server error patterns
    const colMatch = errorMessage.match(/Invalid column name '([^']+)'/);
    const objMatch = errorMessage.match(/Invalid object name '([^']+)'/);
    const constraintMatch = errorMessage.match(/constraint '([^']+)'/);
    const searchTerm = colMatch?.[1] || objMatch?.[1] || constraintMatch?.[1];

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
        process.stdout.write(
            `  [${String(batch.index).padStart(3)}/${batches.length}] ` +
            `Lines ${batch.startLine}-${batch.endLine}: ` +
            `${preview.substring(0, 50)}...`
        );

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

            // SQL Server returns the line number within the batch via err.lineNumber
            // Combine with batch.startLine to get the exact file line
            if (err.lineNumber) {
                const fileLine = batch.startLine + err.lineNumber - 1;
                const batchLines = batch.sql.split('\n');
                const errorLineContent = batchLines[err.lineNumber - 1]?.trimStart() || '';
                console.log(`\n  ► Exact error location:`);
                console.log(`    File line ${fileLine} (batch line ${err.lineNumber}): ${errorLineContent}`);
            }

            // Also search for identifiers from the error message for additional context
            const { searchTerm, hints } = findErrorLine(
                batch.sql, err.message, batch.startLine
            );
            if (searchTerm && hints.length > 0) {
                console.log(`\n  Related lines (searching for "${searchTerm}"):`);
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
        console.log(`\n  All ${successCount} batches succeeded.`);
        if (process.argv.includes('--commit')) {
            console.log(`  Committing transaction...`);
            await transaction.commit();
            console.log(`  ✓ Committed.\n`);
        } else {
            console.log(`  Rolling back (test mode — use --commit to apply)...`);
            await transaction.rollback();
            console.log(`  ✓ Rolled back. Database unchanged.\n`);
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
```

### Key functions to port into Skyway:

| Function | Purpose |
|----------|---------|
| `parseSqlIntoBatches()` | Splits SQL on `GO` with original file line tracking |
| `findErrorLine()` | Searches batch SQL for error-related identifiers, returns file-level line numbers |
| `truncateSql()` | Displays batch SQL with configurable line limit + "... N more lines" |
| Main loop | Sequential batch execution with per-batch try/catch, progress logging, and rollback |

### Upstream Context

The specific migration failure that prompted this was caused by CodeGen emitting `ALTER TABLE ADD [column]` and `UPDATE ... SET [column]` in the same batch without `GO` separators. That has been fixed in the CodeGen tool. However, Skyway's error reporting should be robust regardless of migration content — any future failure in a large migration will benefit from batch-level error context.

## Testing the Skyway Changes

1. Create a test migration with a known error (e.g., reference a non-existent column after a `GO`)
2. Verify Skyway reports the correct batch number, line range, and error context
3. Test with migrations of various sizes (10 lines, 1000 lines, 10000+ lines)
4. Test with `GO` inside quoted strings and comments (should not be treated as batch separator)
5. Test with migrations that have no `GO` at all (entire file = one batch)
6. Test verbose/trace mode shows per-batch progress
7. Verify line numbers in error output match the original file when opened in an editor
