#!/usr/bin/env node
/**
 * Verify a BigSchemaDemo database + CodeGen emit after a pass.
 *
 * Reads DB_* from the worktree .env (never a sibling checkout). Uses sqlcmd.
 * Writes a JSON report next to --out (default Demos/BigSchemaDemo/generated).
 *
 *   node verify.mjs --expect-schemas 24 --expect-tables 2880
 *   node verify.mjs --expect-schemas 3 --expect-tables 36 --skip-codegen
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

function parseArgs(argv) {
  const args = {
    expectSchemas: null,
    expectTables: null,
    skipCodegen: false,
    envFile: path.join(REPO_ROOT, '.env'),
    out: path.join(HERE, 'generated'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--expect-schemas') args.expectSchemas = Number(argv[++i]);
    else if (argv[i] === '--expect-tables') args.expectTables = Number(argv[++i]);
    else if (argv[i] === '--skip-codegen') args.skipCodegen = true;
    else if (argv[i] === '--env-file') args.envFile = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function sqlQuery(env, database, query) {
  const result = spawnSync(
    'sqlcmd',
    ['-S', `${env.DB_HOST},${env.DB_PORT || '1433'}`, '-U', env.DB_USERNAME, '-P', env.DB_PASSWORD, '-C', '-b', '-h', '-1', '-W', '-d', database, '-Q', query],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`sqlcmd failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return (result.stdout || '').trim();
}

function firstInt(text) {
  const match = text.match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function listGeneratedTs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        const stat = fs.statSync(full);
        out.push({
          path: path.relative(dir, full),
          bytes: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function isBarrel(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const text = fs.readFileSync(filePath, 'utf8');
  return text.includes('export * from ') && !text.includes('export class ');
}

const args = parseArgs(process.argv.slice(2));
const env = loadEnv(args.envFile);
const failures = [];
const report = {
  checkedAt: new Date().toISOString(),
  database: env.DB_DATABASE,
  db: {},
  codegen: {},
  failures,
};

const hasMj = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT CASE WHEN OBJECT_ID(N'__mj.Entity', N'U') IS NULL THEN 0 ELSE 1 END;"));
report.db.hasMjCatalog = hasMj === 1;
report.db.bsdSchemas = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT COUNT(DISTINCT s.name) FROM sys.schemas s JOIN sys.tables t ON t.schema_id = s.schema_id WHERE s.name LIKE 'bsd_%';"));
report.db.bsdTables = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT COUNT(*) FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name LIKE 'bsd_%';"));
report.db.bsdForeignKeys = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT COUNT(*) FROM sys.foreign_keys fk JOIN sys.schemas s ON s.schema_id = fk.schema_id WHERE s.name LIKE 'bsd_%';"));
report.db.bsdSeedRows = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT SUM(p.rows) FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1) WHERE s.name LIKE 'bsd_%';"));

if (args.expectSchemas != null && report.db.bsdSchemas !== args.expectSchemas) {
  failures.push(`schemas: expected ${args.expectSchemas}, got ${report.db.bsdSchemas}`);
}
if (args.expectTables != null && report.db.bsdTables !== args.expectTables) {
  failures.push(`tables: expected ${args.expectTables}, got ${report.db.bsdTables}`);
}
if (report.db.bsdTables && report.db.bsdForeignKeys < report.db.bsdTables) {
  failures.push(`foreign keys look thin: ${report.db.bsdForeignKeys} FKs for ${report.db.bsdTables} tables`);
}
if (report.db.bsdSeedRows != null && report.db.bsdSeedRows < (report.db.bsdTables || 0)) {
  failures.push(`seed rows ${report.db.bsdSeedRows} < table count ${report.db.bsdTables}`);
}

if (report.db.hasMjCatalog) {
  report.db.mjEntities = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT COUNT(*) FROM [__mj].[Entity];"));
  report.db.bsdEntities = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT COUNT(*) FROM [__mj].[Entity] WHERE SchemaName LIKE 'bsd_%';"));
  report.db.mjEntityFields = firstInt(sqlQuery(env, env.DB_DATABASE, "SELECT COUNT(*) FROM [__mj].[EntityField];"));
  if (report.db.bsdEntities !== report.db.bsdTables) {
    failures.push(`metadata: ${report.db.bsdEntities} bsd_* entities vs ${report.db.bsdTables} tables`);
  }
}

if (!args.skipCodegen) {
  const entityDir = path.join(HERE, 'generated/entities');
  const graphqlDir = path.join(HERE, 'generated/graphql');
  report.codegen.entityFiles = listGeneratedTs(entityDir);
  report.codegen.graphqlFiles = listGeneratedTs(graphqlDir);
  const barrel = path.join(entityDir, 'entity_subclasses.ts');
  report.codegen.entityBarrelIsReexport = isBarrel(barrel);
  if (report.codegen.entityFiles.length === 0) {
    failures.push('no generated entity .ts files under Demos/BigSchemaDemo/generated/entities');
  } else if (!report.codegen.entityBarrelIsReexport) {
    failures.push('entity_subclasses.ts is not a per-schema barrel');
  }
  const leakedCore = path.join(REPO_ROOT, 'packages/MJCoreEntities/src/generated/entities/bsd_crm.ts');
  report.codegen.leakedIntoCoreEntities = fs.existsSync(leakedCore);
  if (report.codegen.leakedIntoCoreEntities) {
    failures.push('bsd_crm leaked into packages/MJCoreEntities — schemaOutput failed');
  }
}

fs.mkdirSync(args.out, { recursive: true });
const reportPath = path.join(args.out, `verify-${Date.now()}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: failures.length === 0, reportPath, ...report.db, failures }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
