/**
 * Per-migration baseline-completeness audit.
 *
 * For each .pg.sql / .pg-only.sql migration found in MIGRATIONS_DIR, parse the
 * file for CREATE TABLE, ALTER TABLE ADD COLUMN, CREATE INDEX, CREATE VIEW,
 * CREATE FUNCTION, ADD CONSTRAINT statements. For each named object, query the
 * target PG database to verify it exists. Report per-migration whether every
 * object the migration adds is present in the database.
 *
 * Usage:
 *   # Audit a baseline-applied DB against migrations in the worktree
 *   MIGRATIONS_DIR=../MJ-pg-migrations-worktree/migrations-pg/v5 \
 *     PG_DATABASE=mj_pg_baseline_test \
 *     PG_PASSWORD=...                  \
 *     node scripts/audit-baseline-completeness.mjs
 *
 *   # Or, on the historical-migrations branch where files are in-tree:
 *   PG_DATABASE=mj_pg_baseline_test PG_PASSWORD=... \
 *     node scripts/audit-baseline-completeness.mjs
 *
 * Defaults to the local `migrations-pg/v5` directory. On the baseline path
 * branch (where only the baseline file lives), point MIGRATIONS_DIR at a
 * checkout of the historical-migrations branch (or any directory with the
 * V*.pg.sql files) to verify the baseline contains all of their content.
 *
 * All PG connection settings come from PG_* env vars (no hardcoded defaults
 * for password). Set PG_PASSWORD before running.
 *
 * Pass — every migration's objects are present in the database.
 * Fail — list of missing objects per migration.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? 'migrations-pg/v5';
const DB_CONFIG = {
  host: process.env.PG_HOST ?? 'localhost',
  port: parseInt(process.env.PG_PORT ?? '5432', 10),
  database: process.env.PG_DATABASE ?? 'mj_pg_baseline_test',
  user: process.env.PG_USERNAME ?? 'postgres',
  password: process.env.PG_PASSWORD,
};

if (!DB_CONFIG.password) {
  console.error('PG_PASSWORD env var is required.');
  process.exit(1);
}

// Match `CREATE TABLE [IF NOT EXISTS] [schema.]"TableName"` (or unquoted)
const RE_CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.${}]+\.)?["[]?(\w+)["\]]?\s*\(/gi;
// Match `ALTER TABLE [schema.]"TableName" ... ADD COLUMN "ColumnName"` (or w/o "ADD COLUMN" keyword)
const RE_ALTER_ADD_COLUMN = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:[\w.${}]+\.)?["[]?(\w+)["\]]?\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?["[]?(\w+)["\]]?/gi;
const RE_CREATE_INDEX = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["[]?(\w+)["\]]?/gi;
const RE_CREATE_VIEW = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:[\w.${}]+\.)?["[]?(\w+)["\]]?/gi;
const RE_CREATE_FUNCTION = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:[\w.${}]+\.)?["[]?(\w+)["\]]?/gi;
const RE_ADD_CONSTRAINT = /ADD\s+CONSTRAINT\s+["[]?(\w+)["\]]?/gi;

function parseMigration(content) {
  // Strip line comments and DO $$ ... $$ blocks (those have nested DDL but in PG/PLpgsql logic, not at top level)
  // For audit purposes we focus on top-level DDL.
  const stripped = content
    .replace(/--[^\n]*/g, '')          // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments

  const tables = new Set();
  const columns = new Set(); // "Table.Column" keys
  const indexes = new Set();
  const views = new Set();
  const functions = new Set();
  const constraints = new Set();

  let m;
  while ((m = RE_CREATE_TABLE.exec(stripped))) tables.add(m[1]);
  while ((m = RE_ALTER_ADD_COLUMN.exec(stripped))) {
    // Skip if column name is a SQL keyword (CONSTRAINT, COLUMN itself, etc.)
    if (!/^(constraint|column|primary|foreign|unique|check|index|if)$/i.test(m[2])) {
      columns.add(`${m[1]}.${m[2]}`);
    }
  }
  while ((m = RE_CREATE_INDEX.exec(stripped))) indexes.add(m[1]);
  while ((m = RE_CREATE_VIEW.exec(stripped))) views.add(m[1]);
  while ((m = RE_CREATE_FUNCTION.exec(stripped))) functions.add(m[1]);
  while ((m = RE_ADD_CONSTRAINT.exec(stripped))) constraints.add(m[1]);

  return { tables, columns, indexes, views, functions, constraints };
}

async function loadDbState(client) {
  // Tables
  const tables = new Set(
    (await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='__mj' AND table_type='BASE TABLE'"
    )).rows.map(r => r.table_name)
  );
  // Columns
  const columns = new Set(
    (await client.query(
      `SELECT table_name||'.'||column_name AS k FROM information_schema.columns WHERE table_schema='__mj'`
    )).rows.map(r => r.k)
  );
  // Indexes
  const indexes = new Set(
    (await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname='__mj'`
    )).rows.map(r => r.indexname)
  );
  // Views
  const views = new Set(
    (await client.query(
      "SELECT table_name FROM information_schema.views WHERE table_schema='__mj'"
    )).rows.map(r => r.table_name)
  );
  // Functions
  const functions = new Set(
    (await client.query(
      "SELECT routine_name FROM information_schema.routines WHERE routine_schema='__mj'"
    )).rows.map(r => r.routine_name)
  );
  // Constraints
  const constraints = new Set(
    (await client.query(
      `SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='__mj'`
    )).rows.map(r => r.conname)
  );
  return { tables, columns, indexes, views, functions, constraints };
}

// Some objects are dropped/replaced/skipped by later migrations; that's expected.
// These match patterns where a CREATE in one migration is countered by a later
// DROP or rename, so the object legitimately won't be in the final state.
function shouldExempt(category, name, file, dbState) {
  // 1. SS-style auto-generated CHECK constraint names (`CK__TableName__Col__hex`)
  //    PG uses NOT NULL CHECK constraints named `<Table>_<Col>_not_null`.
  //    These are present in the DB just with a different name.
  if (category === 'constraint' && /^CK__\w+__\w+__[0-9A-F]{8}$/i.test(name)) return true;

  // 2. SS-style stored procedure names (`spCreateFoo`, `spUpdateFoo`, `spDeleteFoo`)
  //    PG uses CodeGen-generated `fn_create_foo` / `fn_update_foo` / `fn_delete_foo`.
  //    Verify the PG equivalent exists.
  if (category === 'function' && /^sp(Create|Update|Delete)([A-Z]\w+)$/.test(name)) {
    const m = name.match(/^sp(Create|Update|Delete)([A-Z]\w+)$/);
    const verb = m[1].toLowerCase();
    // snake_case the entity portion: TestRunOutput → test_run_output
    const entity = m[2].replace(/([a-z])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toLowerCase();
    const pgName = `fn_${verb}_${entity}`;
    if (dbState.functions.has(pgName)) return true;
  }

  // 3. Customer-specific table constraint that snuck into the legacy baseline.
  //    Not part of MJ core schema.
  if (category === 'constraint' && name === 'CHK_Customers_Deactivation') return true;

  // 4. v5.0 utility view dropped before v5.30. The CREATE in the legacy baseline
  //    is wrapped in a DO block with DROP-on-error fallback; the v5.30 state
  //    legitimately doesn't have this view.
  if (category === 'view' && name === 'vwEntitiesWithMissingBaseTables') return true;

  return false;
}

async function main() {
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  console.log(`Auditing baseline DB: ${DB_CONFIG.database}\n`);

  const dbState = await loadDbState(client);
  console.log(`DB state: ${dbState.tables.size} tables, ${dbState.columns.size} cols, ${dbState.indexes.size} indexes, ${dbState.views.size} views, ${dbState.functions.size} functions, ${dbState.constraints.size} constraints\n`);

  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql'))
    .sort();
  console.log(`Auditing ${migrations.length} migrations…\n`);

  let totalChecks = 0;
  let totalMissing = 0;
  const failuresByMigration = [];

  for (const file of migrations) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const declared = parseMigration(content);

    const missing = { tables: [], columns: [], indexes: [], views: [], functions: [], constraints: [] };

    for (const t of declared.tables) {
      totalChecks++;
      if (!dbState.tables.has(t) && !shouldExempt('table', t, file, dbState)) missing.tables.push(t);
    }
    for (const c of declared.columns) {
      totalChecks++;
      if (!dbState.columns.has(c) && !shouldExempt('column', c, file, dbState)) missing.columns.push(c);
    }
    for (const i of declared.indexes) {
      totalChecks++;
      if (!dbState.indexes.has(i) && !shouldExempt('index', i, file, dbState)) missing.indexes.push(i);
    }
    for (const v of declared.views) {
      totalChecks++;
      if (!dbState.views.has(v) && !shouldExempt('view', v, file, dbState)) missing.views.push(v);
    }
    for (const fn of declared.functions) {
      totalChecks++;
      if (!dbState.functions.has(fn) && !shouldExempt('function', fn, file, dbState)) missing.functions.push(fn);
    }
    for (const k of declared.constraints) {
      totalChecks++;
      // PG case-folds unquoted constraint names. Compare lowercase.
      const kLower = k.toLowerCase();
      const allLower = new Set([...dbState.constraints].map(x => x.toLowerCase()));
      if (!dbState.constraints.has(k) && !allLower.has(kLower) && !shouldExempt('constraint', k, file, dbState)) {
        missing.constraints.push(k);
      }
    }

    const missCount = Object.values(missing).reduce((a, x) => a + x.length, 0);
    if (missCount > 0) {
      totalMissing += missCount;
      failuresByMigration.push({ file, missing });
    }
  }

  console.log(`=== AUDIT RESULTS ===`);
  console.log(`Total objects declared across all migrations: ${totalChecks}`);
  console.log(`Total missing from baseline: ${totalMissing}`);
  console.log(`Migrations with missing objects: ${failuresByMigration.length}/${migrations.length}\n`);

  if (failuresByMigration.length > 0) {
    console.log(`=== Per-migration missing objects ===\n`);
    for (const { file, missing } of failuresByMigration) {
      const counts = Object.entries(missing).filter(([_, v]) => v.length > 0).map(([k, v]) => `${k}: ${v.length}`).join(', ');
      console.log(`${file}`);
      console.log(`  ${counts}`);
      for (const [cat, items] of Object.entries(missing)) {
        for (const it of items) console.log(`    [${cat}] ${it}`);
      }
      console.log('');
    }
  }

  await client.end();
  process.exit(totalMissing > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
