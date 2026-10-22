#!/usr/bin/env node
// provision.mjs — provision the pstruth test schema and its entity opt-ins (or run scoped CodeGen once with --codegen).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LoadDbConfig } from '@memberjunction/testing-integration';
import sql from 'mssql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mjRoot = path.resolve(root, '..', '..', '..', '..');
const mjCli = path.join(mjRoot, 'packages', 'MJCLI', 'bin', 'run.js');
const dbCfg = LoadDbConfig();

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

function findNewestCodeGenSql(dir) {
  const hits = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^CodeGen_Run_.*\.sql$/.test(entry.name)) {
        hits.push({ full, mtimeMs: statSync(full).mtimeMs });
      }
    }
  };
  walk(dir);
  hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return hits[0]?.full || null;
}

async function openPool() {
  return sql.connect({
    server: dbCfg.host,
    port: dbCfg.port,
    user: dbCfg.user,
    password: dbCfg.password,
    database: dbCfg.database,
    options: {
      trustServerCertificate: dbCfg.trustServerCertificate,
    },
  });
}

if (process.argv.includes('--codegen')) {
  const codegenDir = path.join(root, '.run', 'codegen');
  mkdirSync(codegenDir, { recursive: true });
  copyFileSync(
    path.join(root, 'codegen', 'truth-codegen.config.cjs'),
    path.join(codegenDir, 'mj.config.cjs'),
  );
  run(process.execPath, [mjCli, 'codegen', '--skipfiles'], codegenDir, {
    TRUTH_MJ_ROOT: mjRoot,
  });
  const sqlFile = findNewestCodeGenSql(codegenDir);
  if (!sqlFile) {
    console.error(`No CodeGen_Run_*.sql written under ${codegenDir}`);
    process.exit(1);
  }
  console.log(sqlFile);
  process.exit(0);
}

const dbName = dbCfg.database || process.env.DB_DATABASE || '';
if (!/^MJ_PS_PR\d+_|^test$/.test(dbName) && process.env.TRUTH_ALLOW_PROVISION_DB !== '1') {
  console.error(
    `Refusing to run truth:provision against DB_DATABASE='${dbName}': only MJ_PS_PR<n>_<agent> or the CI 'test' database (set TRUTH_ALLOW_PROVISION_DB=1 to override).`,
  );
  process.exit(1);
}

const prePool = await openPool();
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

const pool = await openPool();
try {
  const totalRes = await pool
    .request()
    .query("SELECT COUNT(*) AS cnt FROM __mj.Entity WHERE SchemaName = 'pstruth'");
  const n = Number(totalRes.recordset[0]?.cnt ?? 0);
  console.log(`pstruth: ${n} entities`);
  if (n === 0) {
    await pool.close();
    process.exit(1);
  }

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

  const sanctionedRes = await pool
    .request()
    .query(
      "SELECT COUNT(*) AS cnt FROM __mj.Entity WHERE SchemaName = 'pstruth' AND AllowDirectSQLInsert = 1 AND AllowDirectSQLUpdate = 1 AND AllowDirectSQLDelete = 1",
    );
  const m = Number(sanctionedRes.recordset[0]?.cnt ?? 0);
  console.log(`pstruth: ${n} entities, direct SQL sanctioned on ${m}`);
  await pool.close();
  if (m !== n) {
    process.exit(1);
  }
} catch (err) {
  await pool.close();
  throw err;
}
