/**
 * Full PG test cycle: fresh DB → apply migrations → patch node_modules → run CodeGen → start MJAPI.
 *
 * Usage: PG_PASSWORD=<pass> node scripts/full-pg-test-cycle.mjs
 */

import pg from 'pg';
import { readFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const PG = {
  host: process.env.PG_HOST ?? 'localhost',
  port: parseInt(process.env.PG_PORT ?? '5432', 10),
  user: process.env.PG_USERNAME ?? 'postgres',
  password: process.env.PG_PASSWORD ?? '',
};
const DB_NAME = 'mj_pg_fresh';
const PG_DIR = 'migrations-pg/v5';
const FRESH_INSTALL = 'C:/Dev/mj-testing/fresh-install';

async function run(label, fn) {
  process.stdout.write(`\n[${label}] `);
  const start = Date.now();
  try {
    await fn();
    console.log(`✓ (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`✗ FAIL (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    console.error(`  ${e.message}`);
    throw e;
  }
}

async function main() {
  console.log('=== Full PG Test Cycle ===\n');

  // Step 1: Create fresh database
  await run('Create fresh DB', async () => {
    const pool = new pg.Pool({ ...PG, database: 'postgres', max: 1 });
    // Terminate existing connections
    await pool.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()`).catch(() => {});
    await pool.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
    await pool.query(`CREATE DATABASE "${DB_NAME}"`);
    await pool.end();
  });

  // Step 2: Bootstrap (roles)
  await run('Bootstrap roles', async () => {
    const pool = new pg.Pool({ ...PG, database: DB_NAME, max: 1 });
    await pool.query(`
      DO $$ BEGIN CREATE ROLE "cdp_UI" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE "cdp_Developer" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE "cdp_Integration" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public TO "cdp_UI", "cdp_Developer", "cdp_Integration";
    `);
    await pool.end();
  });

  // Step 3: Apply baseline
  await run('Apply baseline', async () => {
    const pool = new pg.Pool({ ...PG, database: DB_NAME, max: 1, statement_timeout: 120000 });
    const baseline = readdirSync(PG_DIR).filter(f => f.startsWith('B') && f.endsWith('.pg.sql')).sort()[0];
    let sql = readFileSync(join(PG_DIR, baseline), 'utf-8');
    sql = sql.replaceAll('${flyway:defaultSchema}', '__mj');
    await pool.query(sql).catch(() => {});  // baseline has non-fatal proc errors
    // Verify schema exists
    const check = await pool.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = '__mj'");
    if (check.rows.length === 0) throw new Error('__mj schema not created');
    console.log(`(${baseline}) `);
    await pool.end();
  });

  // Step 4: Apply V-migrations
  await run('Apply V-migrations', async () => {
    const pool = new pg.Pool({ ...PG, database: DB_NAME, max: 1, statement_timeout: 60000 });
    const baselineFile = readdirSync(PG_DIR).filter(f => f.startsWith('B') && f.endsWith('.pg.sql')).sort()[0];
    const baselineTS = baselineFile?.match(/^B(\d{12})/)?.[1];

    const files = readdirSync(PG_DIR)
      .filter(f => f.startsWith('V') && (f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql')))
      .sort();

    let applied = 0, skipped = 0, skippedBaseline = 0, failed = 0;
    for (const file of files) {
      // Skip pre-baseline
      if (baselineTS) {
        const vTS = file.match(/^V(\d{12})/)?.[1];
        if (vTS && vTS <= baselineTS) { skippedBaseline++; continue; }
      }

      let sql = readFileSync(join(PG_DIR, file), 'utf-8');
      sql = sql.replaceAll('${flyway:defaultSchema}', '__mj');

      try {
        await pool.query(sql);
        applied++;
      } catch (e) {
        if (sql.includes('SELECT __mj."fn_create_') || sql.includes('SELECT __mj."fn_update_') || sql.includes('PERFORM __mj.')) {
          skipped++;
        } else {
          failed++;
          console.log(`\n    FAIL: ${file} — ${e.message.substring(0, 80)}`);
        }
      }
    }
    console.log(`(${applied} applied, ${skipped} sync-skipped, ${skippedBaseline} pre-baseline, ${failed} failed) `);
    if (failed > 0) throw new Error(`${failed} DDL migration(s) failed`);
    await pool.end();
  });

  // Step 5: Run bootstrap helpers (procs + user + index)
  await run('Bootstrap helpers + user', async () => {
    const pool = new pg.Pool({ ...PG, database: DB_NAME, max: 1 });
    const helperSQL = readFileSync('scripts/pg-bootstrap-helpers.sql', 'utf-8');
    await pool.query(helperSQL);

    // Seed test user
    await pool.query(`
      INSERT INTO __mj."User" ("ID", "Name", "FirstName", "LastName", "Email", "Type", "IsActive", "LinkedRecordType")
      VALUES ('77e5eb52-e97f-41f9-bdbc-90693edcdd47', 'josue.garcia@bluecypress.io', 'Josue', 'Garcia', 'josue.garcia@bluecypress.io', 'User', TRUE, 'None')
      ON CONFLICT ("ID") DO UPDATE SET "IsActive" = TRUE
    `);
    // Assign roles
    const uiRole = await pool.query("SELECT \"ID\" FROM __mj.\"Role\" WHERE \"Name\" = 'UI' LIMIT 1");
    const devRole = await pool.query("SELECT \"ID\" FROM __mj.\"Role\" WHERE \"Name\" = 'Developer' LIMIT 1");
    const userId = '77e5eb52-e97f-41f9-bdbc-90693edcdd47';
    for (const role of [uiRole, devRole]) {
      if (role.rows[0]) {
        await pool.query("INSERT INTO __mj.\"UserRole\" (\"ID\", \"UserID\", \"RoleID\") VALUES (gen_random_uuid(), $1, $2) ON CONFLICT DO NOTHING", [userId, role.rows[0].ID]).catch(() => {});
      }
    }

    // Unique index on User.Email
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_User_Email" ON __mj."User" ("Email")');

    // Fix DatasetItem quote contamination (if old baseline)
    const fixed = await pool.query(`UPDATE __mj."DatasetItem" SET "DateFieldToCheck" = REPLACE("DateFieldToCheck", '"', '') WHERE "DateFieldToCheck" LIKE '%"%'`);
    if (fixed.rowCount > 0) console.log(`(fixed ${fixed.rowCount} DatasetItem rows) `);

    await pool.end();
  });

  // Step 6: Patch fresh-install node_modules with our built code
  await run('Patch fresh-install node_modules', async () => {
    const patches = [
      {
        src: 'packages/CodeGenLib/dist/Database/providers/postgresql/PostgreSQLCodeGenProvider.js',
        dst: `${FRESH_INSTALL}/node_modules/@memberjunction/codegen-lib/dist/Database/providers/postgresql/PostgreSQLCodeGenProvider.js`,
      },
      {
        src: 'packages/CodeGenLib/dist/Database/sql_codegen.js',
        dst: `${FRESH_INSTALL}/node_modules/@memberjunction/codegen-lib/dist/Database/sql_codegen.js`,
      },
      {
        src: 'packages/CodeGenLib/dist/Database/manage-metadata.js',
        dst: `${FRESH_INSTALL}/node_modules/@memberjunction/codegen-lib/dist/Database/manage-metadata.js`,
      },
      {
        src: 'packages/PostgreSQLDataProvider/dist/PostgreSQLDataProvider.js',
        dst: `${FRESH_INSTALL}/node_modules/@memberjunction/postgresql-dataprovider/dist/PostgreSQLDataProvider.js`,
      },
    ];

    for (const p of patches) {
      if (!existsSync(p.src)) throw new Error(`Source not found: ${p.src}`);
      if (!existsSync(p.dst)) throw new Error(`Dest not found: ${p.dst}`);
      copyFileSync(p.src, p.dst);
      console.log(`\n    Patched: ${p.dst.split('node_modules/')[1]}`);
    }

    // Also patch the LENGTH keyword in the published _SQL_KEYWORDS set
    const pgProvider = readFileSync(patches[0].dst, 'utf-8');
    if (!pgProvider.includes("'LENGTH'")) {
      const patched = pgProvider.replace("'LEN', 'DATALENGTH'", "'LEN', 'LENGTH', 'DATALENGTH'");
      const { writeFileSync } = await import('node:fs');
      writeFileSync(patches[0].dst, patched);
      console.log(`\n    Also patched LENGTH keyword in _SQL_KEYWORDS`);
    }
  });

  // Step 7: Update .env to point at the fresh DB
  await run('Update .env for fresh DB', async () => {
    const envPath = `${FRESH_INSTALL}/.env`;
    let env = readFileSync(envPath, 'utf-8');
    env = env.replace(/DB_DATABASE=.*/, `DB_DATABASE='${DB_NAME}'`);
    env = env.replace(/PG_DATABASE=.*/, `PG_DATABASE=${DB_NAME}`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(envPath, env);
    // Also copy to MJAPI
    copyFileSync(envPath, `${FRESH_INSTALL}/apps/MJAPI/.env`);
    console.log(`(${DB_NAME}) `);
  });

  // Step 8: Schema verification
  await run('Verify schema', async () => {
    const pool = new pg.Pool({ ...PG, database: DB_NAME, max: 1 });
    const tables = (await pool.query("SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema = '__mj' AND table_type = 'BASE TABLE'")).rows[0].c;
    const views = (await pool.query("SELECT COUNT(*) as c FROM information_schema.views WHERE table_schema = '__mj'")).rows[0].c;
    const functions = (await pool.query("SELECT COUNT(*) as c FROM information_schema.routines WHERE routine_schema = '__mj' AND routine_type = 'FUNCTION'")).rows[0].c;
    console.log(`(${tables} tables, ${views} views, ${functions} functions) `);
    await pool.end();
  });

  console.log('\n=== Migration phase complete ===');
  console.log(`\nNext steps:`);
  console.log(`  1. cd ${FRESH_INSTALL}`);
  console.log(`  2. node node_modules/@memberjunction/cli/bin/run.js codegen`);
  console.log(`  3. cd apps/MJAPI && npm start`);
  console.log(`  4. Open http://localhost:4200/ in browser`);
}

main().catch(e => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
