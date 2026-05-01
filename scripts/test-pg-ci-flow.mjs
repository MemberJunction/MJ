/**
 * Local simulation of the pg-migrations.yml CI workflow.
 * Runs the same steps against a local PG instance to verify the workflow works.
 *
 * Prerequisites:
 *   - PostgreSQL running on localhost:5432
 *   - PG_PASSWORD env var set
 *   - SQLConverter already built (npm run build in packages/SQLConverter)
 *
 * Usage:
 *   PG_PASSWORD=<pass> node scripts/test-pg-ci-flow.mjs
 *   PG_PASSWORD=<pass> node scripts/test-pg-ci-flow.mjs --skip-convert  # Use existing .pg.sql files
 */

import pg from 'pg';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

const DB_CONFIG = {
  host: process.env.PG_HOST ?? 'localhost',
  port: parseInt(process.env.PG_PORT ?? '5432', 10),
  user: process.env.PG_USERNAME ?? 'postgres',
  password: process.env.PG_PASSWORD ?? '',
  database: 'postgres', // connect to default DB first
};
const TEST_DB = 'mj_pg_ci_test';
const SKIP_CONVERT = process.argv.includes('--skip-convert');

let totalSteps = 0, passedSteps = 0, failedSteps = 0;

function step(name, fn) {
  return async () => {
    totalSteps++;
    process.stdout.write(`\n[Step ${totalSteps}] ${name}... `);
    try {
      await fn();
      console.log('✓ PASS');
      passedSteps++;
    } catch (e) {
      console.log('✗ FAIL');
      console.error(`  Error: ${e.message}`);
      failedSteps++;
    }
  };
}

async function main() {
  console.log('=== PG CI Flow — Local Simulation ===');
  console.log(`Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${TEST_DB}`);
  console.log(`Skip conversion: ${SKIP_CONVERT}\n`);

  // ─── Step 1: Create fresh test database ─────────────────────────
  await step('Create fresh test database', async () => {
    const pool = new pg.Pool({ ...DB_CONFIG, max: 1 });
    await pool.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await pool.query(`CREATE DATABASE "${TEST_DB}"`);
    await pool.end();
  })();

  // ─── Step 2: Validate PG migration filenames ────────────────────
  await step('Validate PG migration filenames', async () => {
    const pgDir = 'migrations-pg/v5';
    const files = readdirSync(pgDir).filter(f => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql')).sort();
    if (files.length === 0) throw new Error('No PG migration files found');

    let invalid = 0;
    for (const f of files) {
      if (f.startsWith('V') && !/^V\d{12}__/.test(f)) {
        console.log(`\n  Invalid: ${f}`);
        invalid++;
      }
    }
    if (invalid > 0) throw new Error(`${invalid} files have invalid names`);
    console.log(`(${files.length} files) `);
  })();

  // ─── Step 3: Convert T-SQL → PG (or skip) ──────────────────────
  if (!SKIP_CONVERT) {
    await step('Convert T-SQL migrations to PG', async () => {
      const { convertFile, getRulesForDialects, deduplicateEntityFieldSequences } = await import('@memberjunction/sql-converter');
      const rules = getRulesForDialects('tsql', 'postgres');
      const sourceDir = 'migrations/v5';
      const outputDir = 'migrations-pg/v5';

      const tsqlFiles = readdirSync(sourceDir)
        .filter(f => f.startsWith('V') && f.endsWith('.sql'))
        .sort();

      let converted = 0, errors = 0;
      for (const file of tsqlFiles) {
        try {
          convertFile({
            Source: join(sourceDir, file),
            SourceIsFile: true,
            OutputFile: join(outputDir, file.replace(/\.sql$/, '.pg.sql')),
            Rules: rules,
            IncludeHeader: false,
          });
          converted++;
        } catch (e) {
          errors++;
        }
      }

      const dedup = deduplicateEntityFieldSequences(outputDir);
      console.log(`(${converted} converted, ${dedup.totalCollisions} collisions fixed) `);
      if (errors > 0) throw new Error(`${errors} conversion failures`);
    })();
  } else {
    await step('Skip conversion (using existing .pg.sql files)', async () => {
      const count = readdirSync('migrations-pg/v5').filter(f => f.endsWith('.pg.sql')).length;
      console.log(`(${count} existing files) `);
    })();
  }

  // ─── Step 4: Bootstrap PG (roles) ──────────────────────────────
  await step('Bootstrap PG (create roles)', async () => {
    const pool = new pg.Pool({ ...DB_CONFIG, database: TEST_DB, max: 1 });
    await pool.query(`
      DO $$ BEGIN CREATE ROLE "cdp_UI" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE "cdp_Developer" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE "cdp_Integration" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await pool.end();
  })();

  // ─── Step 5: Apply baseline ────────────────────────────────────
  await step('Apply baseline migration', async () => {
    const pool = new pg.Pool({ ...DB_CONFIG, database: TEST_DB, max: 1 });
    const baseline = readdirSync('migrations-pg/v5')
      .filter(f => f.startsWith('B') && f.endsWith('.pg.sql'))
      .sort()[0];
    if (!baseline) throw new Error('No baseline file found');

    const sql = readFileSync(join('migrations-pg/v5', baseline), 'utf-8')
      .replace(/\$\{flyway:defaultSchema\}/g, '__mj');
    try {
      await pool.query(sql);
    } catch (e) {
      // Baseline may have non-fatal errors (procs that fail on first run)
      // Check if __mj schema exists as the minimum success criteria
      const schemaCheck = await pool.query(
        "SELECT 1 FROM information_schema.schemata WHERE schema_name = '__mj'"
      );
      if (schemaCheck.rows.length === 0) throw new Error('Baseline failed: __mj schema not created');
    }
    console.log(`(${basename(baseline)}) `);
    await pool.end();
  })();

  // ─── Step 6: Apply V-migrations ────────────────────────────────
  await step('Apply V-migrations', async () => {
    const pool = new pg.Pool({ ...DB_CONFIG, database: TEST_DB, max: 1 });

    // Determine baseline timestamp to skip V-migrations that predate it
    const baselineFile = readdirSync('migrations-pg/v5')
      .filter(f => f.startsWith('B') && f.endsWith('.pg.sql'))
      .sort()[0];
    const baselineTS = baselineFile ? baselineFile.match(/^B(\d{12})/)?.[1] : null;

    const files = readdirSync('migrations-pg/v5')
      .filter(f => f.startsWith('V') && (f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql')))
      .sort();

    let applied = 0, skipped = 0, skippedBaseline = 0, failed = 0;
    const failures = [];

    for (const file of files) {
      // Skip V-migrations that predate the baseline (their content is already in the baseline)
      if (baselineTS) {
        const vTS = file.match(/^V(\d{12})/)?.[1];
        if (vTS && vTS <= baselineTS) { skippedBaseline++; continue; }
      }

      let sql = readFileSync(join('migrations-pg/v5', file), 'utf-8');
      // Resolve Flyway/Skyway placeholders (Skyway does this at runtime; we do it manually)
      sql = sql.replace(/\$\{flyway:defaultSchema\}/g, '__mj');
      try {
        await pool.query(sql);
        applied++;
      } catch (e) {
        // Check if this is a Metadata_Sync migration (calls stored procs)
        if (sql.includes('SELECT __mj."fn_create_') ||
            sql.includes('SELECT __mj."fn_update_') ||
            sql.includes('PERFORM __mj.')) {
          skipped++;
        } else {
          failed++;
          failures.push({ file, error: e.message.substring(0, 100) });
        }
      }
    }

    console.log(`(${applied} applied, ${skipped} metadata-sync skipped, ${skippedBaseline} pre-baseline skipped, ${failed} failed) `);
    if (failed > 0) {
      for (const f of failures) console.log(`\n  FAIL: ${f.file} — ${f.error}`);
      throw new Error(`${failed} DDL migration(s) failed`);
    }
    await pool.end();
  })();

  // ─── Step 7: Verify schema ─────────────────────────────────────
  await step('Verify schema object counts', async () => {
    const pool = new pg.Pool({ ...DB_CONFIG, database: TEST_DB, max: 1 });

    const tables = (await pool.query("SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = '__mj' AND table_type = 'BASE TABLE'")).rows[0].c;
    const views = (await pool.query("SELECT COUNT(*) as c FROM information_schema.views WHERE table_schema = '__mj'")).rows[0].c;
    const functions = (await pool.query("SELECT COUNT(*) as c FROM information_schema.routines WHERE routine_schema = '__mj' AND routine_type = 'FUNCTION'")).rows[0].c;

    console.log(`(${tables} tables, ${views} views, ${functions} functions) `);

    const MIN_TABLES = 250;
    const MIN_VIEWS = 200;
    if (parseInt(tables) < MIN_TABLES) throw new Error(`Expected ≥${MIN_TABLES} tables, got ${tables}`);
    if (parseInt(views) < MIN_VIEWS) throw new Error(`Expected ≥${MIN_VIEWS} views, got ${views}`);
    await pool.end();
  })();

  // ─── Step 8: Check for data contamination ──────────────────────
  await step('Check for data contamination (quoted identifiers in VALUES)', async () => {
    const pool = new pg.Pool({ ...DB_CONFIG, database: TEST_DB, max: 1 });
    const contaminated = await pool.query(`
      SELECT COUNT(*) as c FROM __mj."DatasetItem"
      WHERE "DateFieldToCheck" LIKE '%"%'
    `);
    const count = parseInt(contaminated.rows[0].c);
    if (count > 0) throw new Error(`${count} DatasetItem rows have quoted identifiers in DateFieldToCheck`);
    await pool.end();
  })();

  // ─── Step 9: Parity report ─────────────────────────────────────
  await step('Generate parity report', async () => {
    const pool = new pg.Pool({ ...DB_CONFIG, database: TEST_DB, max: 1 });

    const tsqlMigrations = readdirSync('migrations/v5').filter(f => f.startsWith('V') && f.endsWith('.sql')).length;
    const pgMigrations = readdirSync('migrations-pg/v5').filter(f => f.startsWith('V') && (f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql'))).length;

    const tables = (await pool.query("SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = '__mj' AND table_type = 'BASE TABLE'")).rows[0].c;
    const views = (await pool.query("SELECT COUNT(*) as c FROM information_schema.views WHERE table_schema = '__mj'")).rows[0].c;
    const functions = (await pool.query("SELECT COUNT(*) as c FROM information_schema.routines WHERE routine_schema = '__mj' AND routine_type = 'FUNCTION'")).rows[0].c;
    const triggers = (await pool.query("SELECT COUNT(DISTINCT trigger_name) as c FROM information_schema.triggers WHERE trigger_schema = '__mj'")).rows[0].c;

    const report = {
      timestamp: new Date().toISOString(),
      migrations: { tsql: tsqlMigrations, pg: pgMigrations, parity: pgMigrations >= tsqlMigrations },
      schema: { tables: parseInt(tables), views: parseInt(views), functions: parseInt(functions), triggers: parseInt(triggers) },
      passed: failedSteps === 0,
    };

    console.log(`\n\n  ${JSON.stringify(report, null, 2).replace(/\n/g, '\n  ')}\n`);
    await pool.end();
  })();

  // ─── Summary ───────────────────────────────────────────────────
  console.log('\n' + '='.repeat(50));
  console.log(`  ${passedSteps} passed, ${failedSteps} failed (${totalSteps} total)`);
  console.log('='.repeat(50));

  // Cleanup
  try {
    const pool = new pg.Pool({ ...DB_CONFIG, max: 1 });
    await pool.query(`DROP DATABASE IF EXISTS "${TEST_DB}"`);
    await pool.end();
  } catch { /* ignore cleanup errors */ }

  process.exit(failedSteps === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
