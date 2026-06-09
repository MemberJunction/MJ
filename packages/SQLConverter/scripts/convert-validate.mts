/**
 * Validation harness — runs the split-and-regenerate CLASSIFICATION over the real
 * v5 backlog and reports the status breakdown, the transpiler-input reduction, and
 * the needs-hand list. Classification-only (extractKeptTSQL): no Python runtime
 * needed. For full transpile + apply validation use `mj migrate convert --split`
 * or scripts/pgdiff-convert-ast.mjs.
 *
 *   npx tsx packages/SQLConverter/scripts/convert-validate.mts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractKeptTSQL, type ConversionStatus } from '../src/MigrationConverter.js';

const DIR = join(process.cwd(), 'migrations', 'v5');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql') && !/^B\d/.test(f)).sort();

const status: Record<ConversionStatus, number> = {
  converted: 0,
  'reseed-or-regen-only': 0,
  'needs-hand-authoring': 0,
};
let totalFileLines = 0;
let transpilerInputLines = 0; // lines actually fed to the AST transpiler
const needsHand: string[] = [];

for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8');
  const kept = extractKeptTSQL(sql, f);
  status[kept.status]++;
  totalFileLines += sql.split('\n').length;
  if (kept.tsql.trim()) transpilerInputLines += kept.tsql.split('\n').length;
  if (kept.status === 'needs-hand-authoring') {
    needsHand.push(`${f} — ${kept.handProcedural.slice(0, 3).join(', ')}`);
  }
}

console.log(`\n=== split-and-regenerate classification over ${files.length} versioned migrations ===\n`);
console.log('Status:');
console.log(`  converted              ${status.converted}`);
console.log(`  reseed-or-regen-only   ${status['reseed-or-regen-only']}`);
console.log(`  needs-hand-authoring   ${status['needs-hand-authoring']}`);
console.log(`\nTranspiler input reduction:`);
console.log(`  total migration lines         ${totalFileLines.toLocaleString()}`);
console.log(`  fed to the AST transpiler     ${transpilerInputLines.toLocaleString()}  (${((transpilerInputLines / totalFileLines) * 100).toFixed(1)}%)`);
console.log(`  NOT translated (regen+reseed) ${(totalFileLines - transpilerInputLines).toLocaleString()}  (${(((totalFileLines - transpilerInputLines) / totalFileLines) * 100).toFixed(1)}%)`);
if (needsHand.length > 0) {
  console.log(`\nNeeds hand-authoring (${needsHand.length}):`);
  for (const h of needsHand) console.log(`  ${h}`);
}
console.log('');
