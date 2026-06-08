/**
 * Validation harness — runs convertMigration over the real v5 backlog and reports
 * status breakdown, the actual transpiler-input reduction, and any error/TODO
 * markers in the generated PG output.
 *
 *   npx tsx packages/SQLConverter/scripts/convert-validate.mts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convertMigration, type ConversionStatus } from '../src/MigrationConverter.js';

const DIR = join(process.cwd(), 'migrations', 'v5');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql') && !/^B\d/.test(f)).sort();

const status: Record<ConversionStatus, number> = {
  converted: 0,
  'reseed-or-regen-only': 0,
  'needs-hand-authoring': 0,
};
let totalFileLines = 0;
let transpilerInputLines = 0; // lines actually fed to the rule pipeline (converted files' hand region)
const withTodo: string[] = [];
const withError: string[] = [];

for (const f of files) {
  const sql = readFileSync(join(DIR, f), 'utf8');
  const r = convertMigration(sql, f);
  status[r.status]++;
  totalFileLines += sql.split('\n').length;

  if (r.status === 'converted') {
    transpilerInputLines += r.split.handAuthored.split('\n').length;
    if (/--\s*TODO/i.test(r.pgSQL)) withTodo.push(f);
    if (r.conversionStats && (r.conversionStats as { Errors?: unknown[] }).Errors?.length) withError.push(f);
  }
}

console.log(`\n=== convertMigration over ${files.length} versioned migrations ===\n`);
console.log('Status:');
console.log(`  converted              ${status.converted}`);
console.log(`  reseed-or-regen-only   ${status['reseed-or-regen-only']}`);
console.log(`  needs-hand-authoring   ${status['needs-hand-authoring']}`);
console.log(`\nTranspiler input reduction:`);
console.log(`  total migration lines        ${totalFileLines.toLocaleString()}`);
console.log(`  fed to the rule pipeline      ${transpilerInputLines.toLocaleString()}  (${((transpilerInputLines / totalFileLines) * 100).toFixed(1)}%)`);
console.log(`  NOT translated (regen+reseed) ${(totalFileLines - transpilerInputLines).toLocaleString()}  (${(((totalFileLines - transpilerInputLines) / totalFileLines) * 100).toFixed(1)}%)`);
console.log(`\nOutput health:`);
console.log(`  files with TODO markers   ${withTodo.length}${withTodo.length ? ' → ' + withTodo.join(', ') : ''}`);
console.log(`  files with rule errors    ${withError.length}${withError.length ? ' → ' + withError.join(', ') : ''}`);
console.log('');
