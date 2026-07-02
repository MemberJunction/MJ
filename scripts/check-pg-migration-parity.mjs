#!/usr/bin/env node
/**
 * PG Migration Parity Check
 *
 * Verifies that every T-SQL V-migration in migrations/v5/ has a committed PG
 * counterpart in migrations-pg/v5/ (either .pg.sql or .pg-only.sql).
 *
 * Previously lived in packages/SQLConverter/src/__tests__/pg-migration-regression.test.ts
 * as the `'should have a PG counterpart for every T-SQL V-migration'` test.
 * Moved out of the unit test suite because turbo runs tests in dependency order
 * and stops on first failure — a parity gap (which happens any time a T-SQL
 * migration is added before pg-migrate runs) was masking every downstream
 * package's test failures.
 *
 * Intended usage:
 *   - The `pg-migrate` skill should run this at the end of Phase 1 and again
 *     after Phase 5 to confirm parity before declaring the run complete.
 *   - `.github/workflows/pg-migrations.yml` (the PG-specific PR workflow that
 *     already triggers on migration changes) can run this as a gate.
 *   - Local developers can run it manually before opening a migration PR.
 *
 * Exit codes:
 *   0  parity holds
 *   1  one or more T-SQL files lack a PG counterpart
 *   2  required directories missing
 */
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'migrations', 'v5');
const PG_MIGRATIONS_DIR = join(REPO_ROOT, 'migrations-pg', 'v5');

/**
 * Intentionally-removed pre-baseline files. These T-SQL migrations exist
 * upstream for SQL Server but have no PG counterpart by design — they were
 * pre-baseline upgrades that the v5.0 PG baseline already incorporates, so
 * shipping a PG version would re-apply the same DDL on top of the baseline.
 */
const INTENTIONALLY_NO_PG_COUNTERPART = new Set([
    'V202602131500__v5.0.x__Entity_Name_Normalization_And_ClassName_Prefix_Fix',
    'V202602141421__v5.0.x__Add_AllowMultipleSubtypes_to_Entity',
]);

function readDirOrExit(path, label) {
    try {
        return readdirSync(path);
    } catch (err) {
        console.error(`ERROR: cannot read ${label} (${path}): ${err.message}`);
        process.exit(2);
    }
}

const tsqlFiles = readDirOrExit(MIGRATIONS_DIR, 'T-SQL migrations dir')
    .filter(f => f.startsWith('V') && f.endsWith('.sql'))
    .sort();

const pgBases = new Set(
    readDirOrExit(PG_MIGRATIONS_DIR, 'PG migrations dir')
        .filter(f => f.startsWith('V'))
        .map(f => f.replace(/\.pg\.sql$/, '').replace(/\.pg-only\.sql$/, ''))
);

const missing = tsqlFiles
    .map(f => f.replace(/\.sql$/, ''))
    .filter(base => !pgBases.has(base))
    .filter(base => !INTENTIONALLY_NO_PG_COUNTERPART.has(base));

if (missing.length === 0) {
    console.log(`PG parity OK — all ${tsqlFiles.length} T-SQL V-migrations have PG counterparts (or are documented exclusions).`);
    process.exit(0);
}

console.error(`PG parity FAILED — ${missing.length} T-SQL migration${missing.length === 1 ? '' : 's'} without PG counterpart:`);
for (const m of missing) console.error(`  ${m}`);
console.error('');
console.error('Run the `pg-migrate` skill to generate the missing PG file(s) and commit them to migrations-pg/v5/.');
process.exit(1);
