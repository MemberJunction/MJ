#!/usr/bin/env node
// provision.mjs — provision the pstruth test schema: apply its DDL, register its entities with a scoped CodeGen run, and
// push their direct-SQL opt-ins. Run after `pnpm run build` (the pool comes from the built TruthConnection).
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { LoadDbConfig } from '@memberjunction/testing-integration';
import privateDatabase from '../codegen/private-database.cjs';
import { TruthConnection } from '../dist/db/connection.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mjRoot = path.resolve(root, '..', '..', '..', '..');
const mjCli = path.join(mjRoot, 'packages', 'MJCLI', 'bin', 'run.js');

// The repository root's .env, whatever the cwd (`pnpm run` runs from the package folder). dotenv never overrides a
// variable the shell already exports. Every child gets this resolved environment: the CodeGen child runs from
// .run/codegen, where MJCLI finds no .env of its own, and its config reads DB_DATABASE and CODEGEN_DB_* from it.
dotenv.config({ path: path.join(mjRoot, '.env'), quiet: true });
const childEnv = { ...process.env, TRUTH_MJ_ROOT: mjRoot };

/** Run a child process with the resolved environment; returns its exit status (never exits this process). */
function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: childEnv });
  return res.status ?? 1;
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

/**
 * The database-name refusal, checked before anything runs. The pool's database (LoadDbConfig) and DB_DATABASE (what
 * `mj migrate` and the scoped CodeGen config read) must both pass the same rule CodeGen checks, so migrate never runs
 * on a database CodeGen would then refuse.
 */
function refusalForDatabase(poolDatabase) {
  const envDatabase = process.env.DB_DATABASE;
  for (const name of [poolDatabase, envDatabase]) {
    if (!privateDatabase.IsPrivateTruthDatabase(name)) {
      return `Refusing to run truth:provision against database '${name}': only ${privateDatabase.PRIVATE_TRUTH_DATABASE_DESCRIPTION}.`;
    }
  }
  if (poolDatabase !== envDatabase) {
    return `Refusing to run truth:provision: the pool's database '${poolDatabase}' differs from DB_DATABASE '${envDatabase}'.`;
  }
  return null;
}

/** The refusal when the core __mj schema is missing or has failed migrations, else null. */
async function refusalForCoreSchema(dbName) {
  const pool = await TruthConnection.OpenPool();
  try {
    const res = await pool.request().query(`
      SELECT
        CASE WHEN OBJECT_ID(N'__mj.Entity', N'U') IS NULL THEN 0 ELSE 1 END AS hasEntityTable,
        CASE WHEN OBJECT_ID(N'__mj.flyway_schema_history', N'U') IS NULL THEN 0
             ELSE (SELECT COUNT(*) FROM __mj.flyway_schema_history WHERE success = 0) END AS failedMigrations
    `);
    const row = res.recordset[0];
    if (!row || Number(row.hasEntityTable) === 0 || Number(row.failedMigrations) > 0) {
      return `Refusing to run truth:provision against DB_DATABASE='${dbName}': core __mj schema is incomplete or has failed migrations (hasEntityTable=${row?.hasEntityTable ?? 0}, failedMigrations=${row?.failedMigrations ?? 0}). Run 'mj migrate' first.`;
    }
    return null;
  } finally {
    await pool.close();
  }
}

/** Push the entities' direct-SQL opt-ins, then strip the sync blocks the push wrote back; returns an exit status. */
function pushEntityMetadata() {
  let status = 1;
  try {
    status = run(process.execPath, [mjCli, 'sync', 'push', '--dir', path.join(root, 'metadata'), '--ci'], mjRoot);
  } finally {
    // Keep metadata/entities/.pstruth-entities.json and .pstruth-c1-entities.json free of sync blocks in the working tree,
    // whether or not the push worked.
    const rewrite = run(process.execPath, [path.join(root, 'scripts', 'gen-pstruth-ddl.mjs'), '--metadata'], root);
    if (rewrite !== 0) {
      console.error('Could not rewrite metadata/entities/.pstruth-entities.json and .pstruth-c1-entities.json without sync blocks: run `node scripts/gen-pstruth-ddl.mjs --metadata`.');
      status = status === 0 ? rewrite : status;
    }
  }
  return status;
}

async function main() {
  const dbName = (await LoadDbConfig()).Database;
  const refusal = refusalForDatabase(dbName) ?? (await refusalForCoreSchema(dbName));
  if (refusal) {
    console.error(refusal);
    return 1;
  }

  const migrated = run(process.execPath, [mjCli, 'migrate', '--schema', 'pstruth', '--dir', path.join(root, 'migrations')], mjRoot);
  if (migrated !== 0) return migrated;

  // Register the tables as entities: CodeGen scoped to pstruth, database work only (--skipfiles), run from a private
  // folder so it never writes into the source tree.
  const codegenDir = path.join(root, '.run', 'codegen');
  mkdirSync(codegenDir, { recursive: true });
  copyFileSync(path.join(root, 'codegen', 'truth-codegen.config.cjs'), path.join(codegenDir, 'mj.config.cjs'));
  copyFileSync(path.join(root, 'codegen', 'private-database.cjs'), path.join(codegenDir, 'private-database.cjs'));
  const generated = run(process.execPath, [mjCli, 'codegen', '--skipfiles'], codegenDir);
  if (generated !== 0) return generated;

  const pool = await TruthConnection.OpenPool();
  try {
    const { total: n } = await countEntities(pool);
    console.log(`pstruth: ${n} entities`);
    if (n === 0) return 1;
    const pushed = pushEntityMetadata();
    if (pushed !== 0) return pushed;
    const { sanctioned: m } = await countEntities(pool);
    console.log(`pstruth: ${n} entities, direct SQL sanctioned on ${m}`);
    return m === n ? 0 : 1;
  } finally {
    await pool.close();
  }
}

process.exitCode = await main();
