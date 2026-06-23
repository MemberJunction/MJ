#!/usr/bin/env node
/**
 * RELEASE B (subtractive) generator — VERSION-AWARE.
 *
 * Retires the seeded vendor connector metadata from MJ core, following the precise per-RECORD rule
 * (a record = an Integration, IntegrationObject, or IntegrationObjectField), classified against the
 * `v5.41.0` git tag (the "before 5.42.0" snapshot):
 *
 *   - Case A  (present at v5.41.0, NOT already deleteRecord-tagged):
 *        moved to MemberJunction/Integrations AND tagged here with a top-level deleteRecord
 *        (so it is removed from existing customer DBs that seeded it before 5.42.0).
 *   - Case B  (present at v5.41.0, ALREADY deleteRecord-tagged, e.g. Betty):
 *        left exactly as-is. Not moved, not re-tagged.
 *   - Case C  (added in 5.42.0 — NOT present at v5.41.0):
 *        moved to MemberJunction/Integrations and its source REMOVED here — but NEVER tagged
 *        deleteRecord and NEVER deleted via migration (it was never shipped to a customer DB).
 *
 * IMPORTANT: a single metadata file can contain BOTH Case A and Case C records (e.g. an Integration
 * row that existed at v5.41.0 whose IO/IOF were all built out in 5.42.0). Classification is therefore
 * per-record by ID, NOT per-file — only the Case A records become deleteRecord entries; the file's
 * Case C records are simply dropped when the source file is removed.
 *
 * The committed top-level deleteRecord files ARE the durable mechanism (a deploy-time `mj sync push`
 * applies them on both fresh and existing installs). No forward-fix migration is emitted — a migration
 * would delete by a coarser key and risk touching Case C rows, which this rule forbids.
 *
 * Reads the connector metadata from a CLEAN `next` checkout (this worktree removes its own copy):
 *   NEXT_METADATA_DIR=/path/to/clean/next/metadata  node scripts/generate-connector-retire.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const META = join(REPO_ROOT, 'metadata');
const BOUNDARY_TAG = process.env.BOUNDARY_TAG || 'v5.41.0';
const NEXT_META = process.env.NEXT_METADATA_DIR || join(META); // default: this repo's metadata (must be clean)

/** Yield every record (level, ID, hasDeleteRecord, fieldsName) from an Integration metadata blob. */
function* records(raw) {
  const recs = Array.isArray(raw) ? raw : [raw];
  for (const integ of recs) {
    if (!integ || typeof integ !== 'object' || !integ.fields?.ClassName) continue;
    yield { level: 'INT', id: integ.primaryKey?.ID, del: integ.deleteRecord?.delete === true, name: integ.fields?.Name, node: integ };
    for (const io of integ.relatedEntities?.['MJ: Integration Objects'] ?? []) {
      yield { level: 'IO', id: io.primaryKey?.ID, del: io.deleteRecord?.delete === true, name: io.fields?.Name, node: io };
      for (const iof of io.relatedEntities?.['MJ: Integration Object Fields'] ?? []) {
        yield { level: 'IOF', id: iof.primaryKey?.ID, del: iof.deleteRecord?.delete === true, name: iof.fields?.Name, node: iof };
      }
    }
  }
}

/** All record IDs present in the integration metadata at the boundary tag (the "before 5.42.0" set). */
function boundaryIds() {
  const list = execFileSync('git', ['ls-tree', '-r', '--name-only', BOUNDARY_TAG, '--', 'metadata/integrations'], { cwd: REPO_ROOT })
    .toString().split('\n').filter(Boolean);
  const ids = new Set();
  for (const fp of list) {
    if (!fp.endsWith('.json') || fp.includes('additionalSchemaInfo') || fp.endsWith('.mj-sync.json') || fp.endsWith('.integrations.json')) continue;
    let raw;
    try { raw = JSON.parse(execFileSync('git', ['show', `${BOUNDARY_TAG}:${fp}`], { cwd: REPO_ROOT, maxBuffer: 1 << 30 }).toString()); }
    catch { continue; }
    for (const r of records(raw)) if (r.id) ids.add(r.id.toUpperCase());
  }
  return ids;
}

/** All integration metadata files in the (clean) next checkout. */
function nextFiles() {
  const dir = join(NEXT_META, 'integrations');
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f.startsWith('.') && f.endsWith('.json') && !['.integrations.json', '.mj-sync.json'].includes(f)) out.push(p);
    else if (!f.startsWith('.') && statSync(p).isDirectory()) {
      const m = readdirSync(p).find((x) => x.endsWith('.integration.json'));
      if (m) out.push(join(p, m));
    }
  }
  return out;
}

const v541 = boundaryIds();
const delRec = (name, id) => ({ fields: { Name: name ?? null }, primaryKey: { ID: id }, deleteRecord: { delete: true } });
const A = { INT: [], IO: [], IOF: [] };
const counts = { A: { INT: 0, IO: 0, IOF: 0 }, B: { INT: 0, IO: 0, IOF: 0 }, C: { INT: 0, IO: 0, IOF: 0 } };

for (const file of nextFiles()) {
  for (const r of records(JSON.parse(readFileSync(file, 'utf-8')))) {
    const inV541 = r.id ? v541.has(r.id.toUpperCase()) : false;
    const cls = r.del ? 'B' : (inV541 ? 'A' : 'C');
    counts[cls][r.level]++;
    if (cls === 'A' && r.id) A[r.level].push(delRec(r.name, r.id)); // only pre-5.42, untagged → deleteRecord
  }
}

const writeJson = (p, obj) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8'); };

// Top-level deleteRecord files, one entity per dir (reverse-FK order via root directoryOrder).
const iofDir = join(META, 'integration-object-field-deletes');
const ioDir = join(META, 'integration-object-deletes');
const intDir = join(META, 'integration-deletes');
writeJson(join(iofDir, '.connector-iof.deletes.json'), A.IOF);
writeJson(join(ioDir, '.connector-io.deletes.json'), A.IO);
writeJson(join(intDir, '.connector-integration.deletes.json'), A.INT);
if (!existsSync(join(iofDir, '.mj-sync.json'))) writeJson(join(iofDir, '.mj-sync.json'), { entity: 'MJ: Integration Object Fields', filePattern: '**/.*.json', defaults: {} });
if (!existsSync(join(intDir, '.mj-sync.json'))) writeJson(join(intDir, '.mj-sync.json'), { entity: 'MJ: Integrations', filePattern: '**/.*.json', defaults: {} });

// Ensure the delete dirs are in the root directoryOrder (after 'integrations').
const rootSyncPath = join(META, '.mj-sync.json');
const rootSync = JSON.parse(readFileSync(rootSyncPath, 'utf-8'));
if (Array.isArray(rootSync.directoryOrder)) {
  const want = ['integration-object-field-deletes', 'integration-object-deletes', 'integration-deletes'];
  const missing = want.filter((d) => !rootSync.directoryOrder.includes(d));
  if (missing.length) {
    rootSync.directoryOrder.splice(rootSync.directoryOrder.indexOf('integrations') + 1, 0, ...missing);
    writeJson(rootSyncPath, rootSync);
  }
}

const line = (c) => `INT ${counts[c].INT}  IO ${counts[c].IO}  IOF ${counts[c].IOF}`;
console.log(`Boundary ${BOUNDARY_TAG}: ${v541.size} record IDs`);
console.log(`Case A (pre-5.42 → deleteRecord): ${line('A')}`);
console.log(`Case B (already deleted → stays): ${line('B')}`);
console.log(`Case C (added in 5.42 → remove only, NO deleteRecord): ${line('C')}`);
console.log(`\nWrote deleteRecord files for Case A only (${A.INT.length} INT / ${A.IO.length} IO / ${A.IOF.length} IOF). No migration emitted.`);
