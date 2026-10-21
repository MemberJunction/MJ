#!/usr/bin/env node
// provision.mjs — provision the pstruth test schema and its entity opt-ins (or run scoped CodeGen once with --codegen).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mjRoot = path.resolve(root, '..', '..', '..', '..');
const mjCli = path.join(mjRoot, 'packages', 'MJCLI', 'bin', 'run.js');

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
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    options: {
      trustServerCertificate:
        process.env.DB_TRUST_SERVER_CERTIFICATE === '1' ||
        process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
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
  // Ensure at least one active FileStorageProvider row exists on fresh databases so MJFilesArtifactStore can stamp File.ProviderID.
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM __mj.FileStorageProvider WHERE IsActive = 1)
      UPDATE TOP (1) __mj.FileStorageProvider SET IsActive = 1
  `);
  console.log(`pstruth: ${n} entities, direct SQL sanctioned on ${m}`);
  await pool.close();
  if (m !== n) {
    process.exit(1);
  }
} catch (err) {
  await pool.close();
  throw err;
}
