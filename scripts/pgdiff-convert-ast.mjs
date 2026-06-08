/**
 * Full "our way" conversion: TS classification (drop codegen/metadata, keep DDL+comments)
 * → Python AST dialect (mj_postgres.py) transpile. Writes .pg.sql to the output dir.
 *   node scripts/pgdiff-convert-ast.mjs <sourceDir> <outDir>
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { extractKeptTSQL } from '@memberjunction/sql-converter';

const [, , srcDir, outDir] = process.argv;
const PY = '/tmp/sqlglot-venv/bin/python3';
const DIALECT = join(process.cwd(), 'packages/SQLGlotTS/src/python/mj_postgres.py');
mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir).filter(f => f.endsWith('.sql') && !f.endsWith('.pg.sql') && !f.endsWith('.pg-only.sql')).sort();
const stats = { converted: 0, reseed: 0, needsHand: 0, unhandledTotal: 0 };
const needsHand = [];

for (const f of files) {
  const kept = extractKeptTSQL(readFileSync(join(srcDir, f), 'utf8'), f);
  const out = join(outDir, f.replace(/\.sql$/, '.pg.sql'));
  if (kept.handProcedural.length) { stats.needsHand++; needsHand.push(`${f}: ${kept.handProcedural.slice(0,5).join(', ')}`); }

  if (!kept.tsql.trim()) {
    writeFileSync(out, `-- ${f}: regen/reseed-only (mj codegen + mj sync push)\n`);
    stats.reseed++;
    continue;
  }
  // Transpile the kept T-SQL through the AST dialect (Python).
  const res = JSON.parse(execFileSync(PY, [DIALECT], { input: kept.tsql, maxBuffer: 256 * 1024 * 1024 }).toString());
  stats.unhandledTotal += res.unhandled.length;
  const header = '-- Generated via MJ AST dialect (split-and-regenerate)\nCREATE EXTENSION IF NOT EXISTS "pgcrypto";\nCREATE SCHEMA IF NOT EXISTS __mj;\nSET search_path TO __mj, public;\n\n';
  writeFileSync(out, header + res.sql.map(s => s.trim().endsWith(';') ? s : s + ';').join('\n') + '\n');
  stats.converted++;
}
console.log('=== AST-path conversion ===', JSON.stringify(stats, null, 0));
if (needsHand.length) { console.log(`needs-hand (${needsHand.length}):`); needsHand.slice(0, 15).forEach(h => console.log('  ' + h)); }
