/**
 * Direct Skyway PG-migrate invocation against mj_pg_codegen_test.
 *
 * Bypasses MJCLI's config loader — reads credentials from our PG test DB directly.
 * Uses migrations-pg/v5 as the source (the actual committed PG migrations, no
 * conversion step). Reports exactly which migration applied/failed and why.
 */

import { Skyway } from '@memberjunction/skyway-core';
import { PostgresProvider } from '@memberjunction/skyway-postgres';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_CONFIG = {
  Dialect: 'postgresql',
  Server: 'localhost',
  Port: 5432,
  Database: 'mj_pg_dev',
  User: 'postgres',
  Password: 'z2qXgNvvstcc',
};

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations-pg', 'v5');

async function main() {
  console.log('=== Direct Skyway PG migrate ===');
  console.log(`  DB: ${DB_CONFIG.Database} @ ${DB_CONFIG.Server}:${DB_CONFIG.Port}`);
  console.log(`  Source: ${MIGRATIONS_DIR}\n`);

  const provider = new PostgresProvider(DB_CONFIG);
  const skyway = new Skyway({
    Database: DB_CONFIG,
    Provider: provider,
    Migrations: {
      Locations: [MIGRATIONS_DIR],
      DefaultSchema: '__mj',
      BaselineOnMigrate: true,
      OutOfOrder: true,
    },
    Placeholders: { 'flyway:defaultSchema': '__mj' },
    TransactionMode: 'per-migration',
  });

  const applied = [];
  const failed = [];
  const log = [];

  skyway.OnProgress({
    OnLog: (msg) => { log.push(msg); console.log(`  [log] ${msg}`); },
    OnMigrationStart: (m) => {
      console.log(`→ Applying: ${m.Version ?? '(R)'} — ${m.Description}`);
    },
    OnMigrationEnd: (r) => {
      if (r.Success) {
        applied.push(r);
        console.log(`  OK (${r.ExecutionTimeMS}ms)`);
      } else {
        failed.push(r);
        console.log(`  FAIL — ${r.Error?.message ?? 'unknown'}`);
      }
    },
  });

  let result;
  try {
    result = await skyway.Migrate();
  } catch (err) {
    console.log('\n!!! Skyway Migrate threw:', err?.message ?? err);
    console.log('\nRelevant log lines:');
    for (const l of log.filter(x => /error|fail|rolled/i.test(x))) console.log(`  ${l}`);
    await skyway.Close();
    process.exit(1);
  }

  console.log('\n=== Result ===');
  console.log(`  Success: ${result.Success}`);
  console.log(`  Applied: ${result.MigrationsApplied}`);
  console.log(`  Version: ${result.CurrentVersion ?? '(none)'}`);
  console.log(`  Time: ${(result.TotalExecutionTimeMS / 1000).toFixed(1)}s`);
  if (result.ErrorMessage) console.log(`  Error: ${result.ErrorMessage}`);

  if (failed.length > 0) {
    console.log('\n=== Failures ===');
    for (const f of failed) {
      console.log(`\n  ${f.Migration.Filename}`);
      console.log(`    Version: ${f.Migration.Version ?? '(R)'}`);
      console.log(`    Path: ${f.Migration.FilePath}`);
      if (f.Error) {
        console.log(`    Error: ${f.Error.message}`);
        if (f.Error.stack) {
          const firstStackLine = f.Error.stack.split('\n').slice(1, 3).join('\n      ');
          console.log(`    Stack:\n      ${firstStackLine}`);
        }
      }
    }
  }

  await skyway.Close();
  process.exit(result.Success ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
