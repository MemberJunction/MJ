/**
 * Census tool — runs the MigrationSplitter over the real v5 migration backlog and
 * prints a routing breakdown plus the files that need human PG authoring.
 *
 * Run from repo root:  npx tsx packages/SQLConverter/scripts/migration-census.mts
 * Validates the split-and-regenerate taxonomy against actual data and produces the
 * evidence cited in plans/pg-migration-architecture/SPLIT_AND_REGENERATE_PROPOSAL.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitMigration, type FileRouting } from '../src/MigrationSplitter.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations', 'v5');

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// Baselines (B*) are squashed full-schema snapshots that already have committed
// .pg.sql counterparts — they are NOT part of the go-forward per-migration flow.
// Report them separately so they don't distort the versioned-migration numbers.
const isBaseline = (f: string) => /^B\d/.test(f);
const versioned = files.filter((f) => !isBaseline(f));
const baselines = files.filter(isBaseline);

const routingCounts: Record<FileRouting, number> = {
  'transpile-only': 0,
  'transpile-plus-reseed': 0,
  'needs-hand-authoring': 0,
};
const boundaryCounts: Record<string, number> = {};
let codeGenBlockLines = 0; // regenerated natively — zero translation
let reseedHandLines = 0;   // mj-sync metadata — re-seeded, not sqlglot-translated
let sqlglotSurfaceLines = 0; // the actual regular-DDL translation surface
const needsHand: { file: string; evidence: string; line: number }[] = [];

for (const f of versioned) {
  const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
  const r = splitMigration(sql, f);
  routingCounts[r.routing]++;
  boundaryCounts[r.boundaryMethod] = (boundaryCounts[r.boundaryMethod] ?? 0) + 1;

  codeGenBlockLines += r.codeGenBlock ? r.codeGenBlock.split('\n').length : 0;
  const handLines = r.handAuthored.split('\n').length;
  if (r.routing === 'transpile-plus-reseed') reseedHandLines += handLines;
  else sqlglotSurfaceLines += handLines; // transpile-only + the DDL part of hand-authoring files

  if (r.routing === 'needs-hand-authoring') {
    const proc = r.handAuthoredRegions.find((x) => x.kind === 'hand-procedural')!;
    needsHand.push({ file: f, evidence: proc.evidence, line: proc.line });
  }
}

const n = versioned.length;
const pct = (c: number) => `${((c / n) * 100).toFixed(0)}%`;
const totalLines = codeGenBlockLines + reseedHandLines + sqlglotSurfaceLines;
const lpct = (c: number) => `${((c / totalLines) * 100).toFixed(1)}%`;

console.log(`\n=== Migration census: ${n} versioned (V*) migrations  [+ ${baselines.length} baselines reported separately] ===\n`);
console.log('Routing (versioned only):');
console.log(`  transpile-only        ${routingCounts['transpile-only']}  (${pct(routingCounts['transpile-only'])})  — regular DDL, fully automatable`);
console.log(`  transpile-plus-reseed ${routingCounts['transpile-plus-reseed']}  (${pct(routingCounts['transpile-plus-reseed'])})  — mj-sync metadata, re-seed/narrow-transpile`);
console.log(`  needs-hand-authoring  ${routingCounts['needs-hand-authoring']}  (${pct(routingCounts['needs-hand-authoring'])})  — hand-written procedural SQL`);
console.log('\nBoundary method (versioned only):');
for (const [m, c] of Object.entries(boundaryCounts)) console.log(`  ${m.padEnd(24)} ${c}`);
console.log('\nLine accounting (versioned only, by treatment):');
console.log(`  regenerated natively (codegen block)      ${codeGenBlockLines.toLocaleString().padStart(10)}  (${lpct(codeGenBlockLines)})`);
console.log(`  re-seeded via mj-sync (metadata blocks)   ${reseedHandLines.toLocaleString().padStart(10)}  (${lpct(reseedHandLines)})`);
console.log(`  sqlglot translation surface (regular DDL) ${sqlglotSurfaceLines.toLocaleString().padStart(10)}  (${lpct(sqlglotSurfaceLines)})`);
console.log(`\nFiles needing hand-authored .pg.sql (${needsHand.length} of ${n} versioned):`);
for (const h of needsHand) console.log(`  ${h.file}  — ${h.evidence} @ line ${h.line}`);
console.log('');
