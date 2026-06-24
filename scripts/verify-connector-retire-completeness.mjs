#!/usr/bin/env node
/**
 * Connector-retirement completeness gate — NOTHING VANISHES.
 *
 * Records that leave MJ core (the whole connector catalog: Case-A get a deleteRecord, Case-C are
 * removed outright) are only safe to remove if the SAME metadata lives in the MemberJunction/
 * Integrations repo. This gate reconciles, PER CONNECTOR, the Integration Object / Object Field
 * inventory in a clean `next` checkout against the connector's metadata in the Integrations repo.
 *
 * Matching is by NATURAL KEY (Integration Name, then IO Name), NOT primaryKey.ID: the 5.42-added
 * per-vendor metadata was authored WITHOUT primary keys (mj-sync assigns them on first push), so an
 * id-based match is impossible. The gate asserts each retired connector has a home in the repo and
 * the repo carries at least the same IO/IOF counts. Exit 1 on any shortfall.
 *
 *   NEXT_METADATA_DIR=/clean/next/metadata \
 *   INTEGRATIONS_REPO=/path/to/Integrations \
 *   node scripts/verify-connector-retire-completeness.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const NEXT_META = process.env.NEXT_METADATA_DIR;
const INTEGRATIONS_REPO = process.env.INTEGRATIONS_REPO;
if (!NEXT_META || !INTEGRATIONS_REPO) {
  console.error('Set NEXT_METADATA_DIR (clean next metadata) and INTEGRATIONS_REPO (Integrations checkout).');
  process.exit(2);
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** From an Integration metadata blob, return { name -> {io, iof, del} } summarised per Integration. */
function summarize(raw) {
  const out = new Map();
  for (const integ of (Array.isArray(raw) ? raw : [raw])) {
    if (!integ?.fields?.ClassName) continue;
    const ios = integ.relatedEntities?.['MJ: Integration Objects'] ?? [];
    let iof = 0;
    for (const io of ios) iof += (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).length;
    out.set(norm(integ.fields.Name), { name: integ.fields.Name, io: ios.length, iof, del: integ.deleteRecord?.delete === true });
  }
  return out;
}

/** Merge a per-Integration summary map into an accumulator (sum counts; OR the del flag). */
function mergeInto(acc, m) {
  for (const [k, v] of m) {
    const cur = acc.get(k) ?? { name: v.name, io: 0, iof: 0, del: false };
    acc.set(k, { name: v.name, io: cur.io + v.io, iof: cur.iof + v.iof, del: cur.del || v.del });
  }
}

/** All Integration summaries found under a metadata/integrations dir (root files + per-vendor subdirs). */
function summarizeIntegrationsDir(dir) {
  const acc = new Map();
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isFile() && f.startsWith('.') && f.endsWith('.json') && !['.integrations.json', '.mj-sync.json'].includes(f)) {
      try { mergeInto(acc, summarize(JSON.parse(readFileSync(p, 'utf-8')))); } catch { /* skip */ }
    } else if (st.isDirectory()) {
      for (const x of readdirSync(p)) if (x.endsWith('.integration.json')) {
        try { mergeInto(acc, summarize(JSON.parse(readFileSync(join(p, x), 'utf-8')))); } catch { /* skip */ }
      }
    }
  }
  return acc;
}

/** Walk the Integrations repo and summarise every connector's integration metadata by Integration Name. */
function summarizeRepo(repoRoot) {
  const acc = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) { if (['node_modules', '.git', 'dist'].includes(e)) continue; walk(p); continue; }
      if (e.endsWith('.integration.json')) {
        try { mergeInto(acc, summarize(JSON.parse(readFileSync(p, 'utf-8')))); } catch { /* skip */ }
      }
    }
  };
  walk(repoRoot);
  return acc;
}

const core = summarizeIntegrationsDir(join(NEXT_META, 'integrations'));
const repo = summarizeRepo(INTEGRATIONS_REPO);

const problems = [];
let checked = 0;
for (const [key, c] of core) {
  // Case-B connectors (already deleteRecord-tagged, e.g. Betty) stay in core and are NOT moved → skip.
  if (c.del) continue;
  checked++;
  const r = repo.get(key);
  if (!r) { problems.push(`MISSING connector in repo: "${c.name}" (core has IO ${c.io}, IOF ${c.iof})`); continue; }
  if (r.io < c.io) problems.push(`IO shortfall for "${c.name}": core ${c.io} > repo ${r.io}`);
  if (r.iof < c.iof) problems.push(`IOF shortfall for "${c.name}": core ${c.iof} > repo ${r.iof}`);
}

console.log(`Core connectors checked (excl. Case-B): ${checked}`);
console.log(`Integrations repo connectors found: ${repo.size}`);
console.log('\nPer-connector reconciliation (core next → repo):');
for (const [key, c] of [...core].sort()) {
  if (c.del) { console.log(`  [skip Case-B] ${c.name}`); continue; }
  const r = repo.get(key);
  const mark = !r ? '✗ MISSING' : (r.io < c.io || r.iof < c.iof) ? '✗ SHORTFALL' : '✓';
  console.log(`  ${mark}  ${c.name.padEnd(34)} core IO ${String(c.io).padStart(4)} IOF ${String(c.iof).padStart(6)}  |  repo IO ${r ? String(r.io).padStart(4) : '   -'} IOF ${r ? String(r.iof).padStart(6) : '     -'}`);
}

if (problems.length) {
  console.error(`\n✗ COMPLETENESS GATE FAILED (${problems.length}):`);
  for (const p of problems) console.error('    ' + p);
  process.exit(1);
}
console.log('\n✓ COMPLETENESS GATE PASSED — every retired connector has a home in the Integrations repo with full IO/IOF coverage.');
