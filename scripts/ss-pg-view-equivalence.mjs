/**
 * SS↔PG view semantic-equivalence harness.
 *
 * Verifies that the views a PostgreSQL MJ database actually serves are
 * semantically equivalent to the SQL Server CodeGen-emitted definitions
 * committed in migrations/v5. This catches the class of bug that name-level
 * parity checks cannot: a view that EXISTS on both platforms but behaves
 * differently (e.g. INNER vs LEFT JOIN dropping rows, DESC vs DESC NULLS LAST
 * selecting a different "latest" row).
 *
 * Method (two stages, both run by this script):
 *   1. Extract the latest T-SQL definition of every vw* view from the newest
 *      T-SQL baseline + later V-files, transpile each through the MJ sqlglot
 *      dialect (packages/SQLGlotTS/src/python/mj_postgres.py).
 *   2. Install each transpiled view into a scratch schema (ss_xcheck) on the
 *      target PG database, then compare pg_get_viewdef() canonical forms of
 *      the scratch view vs the native __mj view. PostgreSQL itself acts as
 *      the normalizer, so a text diff after canonicalization is a semantic
 *      diff (modulo identifier quoting/case, which is classified separately).
 *
 * Buckets reported:
 *   identical     — byte-equal canonical definitions
 *   cosmeticOnly  — differ only in identifier quoting/case (alias style)
 *   realDiffers   — SEMANTIC divergence: investigate every one of these
 *   createFailed  — transpiled SQL didn't apply (mostly OUTER APPLY/LATERAL
 *                   and sys.* catalog views — paths production never
 *                   transpiles, since CodeGen views are regenerated natively)
 *
 * Usage:
 *   EQUIV_DB=pg_build4 node scripts/ss-pg-view-equivalence.mjs
 *
 * Env:
 *   EQUIV_DB       target PG database (required)
 *   PG_CONTAINER   docker container name   (default: postgres-claude)
 *   PG_USER        psql user               (default: mj_admin)
 *   PG_PASSWORD    psql password           (default: Claude2Pg99)
 *   SQLGLOT_PYTHON python with sqlglot     (default: /tmp/sqlglot-venv/bin/python3)
 *
 * Output: summary JSON to stdout; full report (incl. each diff's two
 * definitions) to /tmp/ss-pg-view-equiv-report.json.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = process.cwd();
const MIG = join(REPO, 'migrations/v5');
const PY = process.env.SQLGLOT_PYTHON || '/tmp/sqlglot-venv/bin/python3';
const DIALECT = join(REPO, 'packages/SQLGlotTS/src/python/mj_postgres.py');
const DB = process.env.EQUIV_DB;
const CONTAINER = process.env.PG_CONTAINER || 'postgres-claude';
const PG_USER = process.env.PG_USER || 'mj_admin';
const PG_PASSWORD = process.env.PG_PASSWORD || 'Claude2Pg99';
const REPORT_PATH = '/tmp/ss-pg-view-equiv-report.json';

if (!DB) {
  console.error('EQUIV_DB env var is required (target PG database name)');
  process.exit(2);
}

function psql(sql) {
  return execFileSync('docker', [
    'exec', '-i', '-e', `PGPASSWORD=${PG_PASSWORD}`, CONTAINER,
    'psql', '-U', PG_USER, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq',
  ], { input: sql, maxBuffer: 64 * 1024 * 1024 }).toString();
}

// ── Stage 1: harvest + transpile ────────────────────────────────────────────

const files = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
const baselines = files.filter(f => /^B\d/.test(f));
const baseline = baselines[baselines.length - 1];
if (!baseline) {
  console.error('no T-SQL baseline found in migrations/v5');
  process.exit(2);
}
const vFilesAfterBaseline = files.filter(f => f.startsWith('V') && f > baseline.replace(/^B/, 'V'));

const defs = new Map(); // view name -> latest T-SQL definition

function harvest(text, source) {
  const norm = text
    .replace(/\[\$\{flyway:defaultSchema\}\]/g, '[__mj]')
    .replace(/\$\{flyway:defaultSchema\}/g, '__mj');
  for (const batch of norm.split(/^\s*GO\s*$/m)) {
    const m = batch.match(/CREATE\s+(?:OR\s+ALTER\s+)?VIEW\s+\[?__mj\]?\.\[?(vw[A-Za-z0-9_]+)\]?/i);
    if (!m) continue;
    const start = batch.search(/CREATE\s+(?:OR\s+ALTER\s+)?VIEW/i);
    defs.set(m[1], { tsql: batch.slice(start).trim(), source });
  }
}

harvest(readFileSync(join(MIG, baseline), 'utf8'), baseline);
for (const f of vFilesAfterBaseline) harvest(readFileSync(join(MIG, f), 'utf8'), f);
console.error(`harvested ${defs.size} SS view definitions (${baseline} + ${vFilesAfterBaseline.length} V-files)`);

const names = [...defs.keys()].sort();
const transpiled = [];
const CHUNK = 25;
for (let i = 0; i < names.length; i += CHUNK) {
  const chunk = names.slice(i, i + CHUNK);
  const input = chunk.map(n => defs.get(n).tsql).join('\nGO\n');
  let res;
  try {
    res = JSON.parse(execFileSync(PY, [DIALECT], { input, maxBuffer: 256 * 1024 * 1024 }).toString());
  } catch (e) {
    for (const n of chunk) transpiled.push({ name: n, error: 'transpile-batch-failed: ' + String(e).slice(0, 200) });
    continue;
  }
  const byName = new Map();
  for (const s of res.sql) {
    const m = s.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+"?__mj"?\."?(vw[A-Za-z0-9_]+)"?/i);
    if (m) byName.set(m[1], s);
  }
  for (const n of chunk) {
    if (byName.has(n)) transpiled.push({ name: n, source: defs.get(n).source, pgSql: byName.get(n) });
    else transpiled.push({ name: n, source: defs.get(n).source, error: 'no-output-from-transpiler' });
  }
  console.error(`transpiled ${Math.min(i + CHUNK, names.length)}/${names.length}`);
}

// ── Stage 2: install into scratch schema + canonical compare ────────────────

psql('DROP SCHEMA IF EXISTS ss_xcheck CASCADE; CREATE SCHEMA ss_xcheck;');

const report = { identical: [], differs: [], createFailed: [], transpileFailed: [], missingNative: [] };
const norm = s => s.replace(/\s+/g, ' ').trim();
const deepNorm = s => s.replace(/"/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

for (const v of transpiled) {
  if (!v.pgSql) { report.transpileFailed.push(v.name); continue; }
  const nat = psql(`SELECT count(*) FROM information_schema.views WHERE table_schema='__mj' AND table_name='${v.name}';`).trim();
  if (nat !== '1') { report.missingNative.push(v.name); continue; }
  const scratchSql = v.pgSql.replace(/CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+"?__mj"?\./i, 'CREATE VIEW ss_xcheck.');
  try {
    psql(`SET search_path TO __mj, public;\n${scratchSql}${scratchSql.trim().endsWith(';') ? '' : ';'}`);
  } catch (e) {
    report.createFailed.push({ name: v.name, error: String(e.stderr || e).split('\n').filter(l => l.includes('ERROR')).join(' ').slice(0, 300) });
    continue;
  }
  const ssDef = psql(`SELECT pg_get_viewdef('ss_xcheck."${v.name}"'::regclass, true);`);
  const pgDef = psql(`SELECT pg_get_viewdef('__mj."${v.name}"'::regclass, true);`);
  if (norm(ssDef) === norm(pgDef)) report.identical.push(v.name);
  else report.differs.push({ name: v.name, ss: ssDef, pg: pgDef });
}

psql('DROP SCHEMA IF EXISTS ss_xcheck CASCADE;');

report.cosmetic = report.differs.filter(d => deepNorm(d.ss) === deepNorm(d.pg)).map(d => d.name);
report.realDiffers = report.differs.filter(d => deepNorm(d.ss) !== deepNorm(d.pg)).map(d => d.name);

writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));
console.log(JSON.stringify({
  identical: report.identical.length,
  cosmeticOnly: report.cosmetic.length,
  realDiffers: report.realDiffers,
  createFailed: report.createFailed.length,
  transpileFailed: report.transpileFailed.length,
  missingNative: report.missingNative.length,
  fullReport: REPORT_PATH,
}, null, 1));

process.exit(report.realDiffers.length > 0 ? 1 : 0);
