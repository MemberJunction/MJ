#!/usr/bin/env node
// provision.mjs — provision the pstruth test schema: apply its DDL, register its entities with a scoped CodeGen run, and
// push their direct-SQL opt-ins. Run after `pnpm run build` (the pool comes from the built TruthConnection).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoadDbConfig } from '@memberjunction/testing-integration';
import { TruthConnection } from '../dist/db/connection.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mjRoot = path.resolve(root, '..', '..', '..', '..');
const mjCli = path.join(mjRoot, 'packages', 'MJCLI', 'bin', 'run.js');
const dbCfg = await LoadDbConfig();

function run(cmd, args, cwd, extraEnv = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

/** The pstruth entity count, and how many of them sanction direct-SQL insert, update and delete. */
async function countEntities(pool) {
  const res = await pool.request().query(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN AllowDirectSQLInsert = 1 AND AllowDirectSQLUpdate = 1 AND AllowDirectSQLDelete = 1 THEN 1 ELSE 0 END) AS sanctioned
    FROM __mj.Entity WHERE SchemaName = 'pstruth'`);
  const row = res.recordset[0];
  return { total: Number(row?.total ?? 0), sanctioned: Number(row?.sanctioned ?? 0) };
}

const dbName = dbCfg.Database;
if (!/^MJ_PS_PR\d+_|^test$/.test(dbName) && process.env.TRUTH_ALLOW_PROVISION_DB !== '1') {
  console.error(
    `Refusing to run truth:provision against DB_DATABASE='${dbName}': only MJ_PS_PR<n>_<agent> or the CI 'test' database (set TRUTH_ALLOW_PROVISION_DB=1 to override).`,
  );
  process.exit(1);
}

const prePool = await TruthConnection.OpenPool();
try {
  const preRes = await prePool.request().query(`
    SELECT
      CASE WHEN OBJECT_ID(N'__mj.Entity', N'U') IS NULL THEN 0 ELSE 1 END AS hasEntityTable,
      CASE WHEN OBJECT_ID(N'__mj.flyway_schema_history', N'U') IS NULL THEN 0
           ELSE (SELECT COUNT(*) FROM __mj.flyway_schema_history WHERE success = 0) END AS failedMigrations
  `);
  const row = preRes.recordset[0];
  if (!row || Number(row.hasEntityTable) === 0 || Number(row.failedMigrations) > 0) {
    console.error(
      `Refusing to run truth:provision against DB_DATABASE='${dbName}': core __mj schema is incomplete or has failed migrations (hasEntityTable=${row?.hasEntityTable ?? 0}, failedMigrations=${row?.failedMigrations ?? 0}). Run 'mj migrate' first.`,
    );
    process.exit(1);
  }
} finally {
  await prePool.close();
}

run(
  process.execPath,
  [mjCli, 'migrate', '--schema', 'pstruth', '--dir', path.join(root, 'migrations')],
  mjRoot,
);

// Register the tables as entities: CodeGen scoped to pstruth, database work only (--skipfiles), run from a private
// folder so it never writes into the source tree.
const codegenDir = path.join(root, '.run', 'codegen');
mkdirSync(codegenDir, { recursive: true });
copyFileSync(path.join(root, 'codegen', 'truth-codegen.config.cjs'), path.join(codegenDir, 'mj.config.cjs'));
run(process.execPath, [mjCli, 'codegen', '--skipfiles'], codegenDir, { TRUTH_MJ_ROOT: mjRoot });

const pool = await TruthConnection.OpenPool();
try {
  const { total: n } = await countEntities(pool);
  console.log(`pstruth: ${n} entities`);
  if (n === 0) {
    process.exitCode = 1;
  } else {
    try {
      run(
        process.execPath,
        [mjCli, 'sync', 'push', '--dir', path.join(root, 'metadata'), '--ci'],
        mjRoot,
      );
    } finally {
      // Keep metadata/entities/.pstruth-entities.json free of sync blocks in the working tree.
      spawnSync(process.execPath, [path.join(root, 'scripts', 'gen-pstruth-ddl.mjs'), '--metadata'], {
        cwd: root,
        stdio: 'ignore',
      });
    }
    const { sanctioned: m } = await countEntities(pool);
    console.log(`pstruth: ${n} entities, direct SQL sanctioned on ${m}`);
    if (m !== n) process.exitCode = 1;
  }
} finally {
  await pool.close();
}
