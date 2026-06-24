#!/usr/bin/env node
/**
 * RELEASE B (subtractive) generator — VERSION-AWARE.
 *
 * Retires the seeded vendor connector metadata from MJ core, following the precise per-RECORD rule,
 * classified against the `v5.41.0` git tag (the "before 5.42.0" snapshot):
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
 * SCOPE — "anything specific to an integration", not just IO/IOF. This generator retires the
 * connector-specific DB records across THREE entity families (each a separate top-level delete dir,
 * sequenced in reverse-FK order via the root directoryOrder):
 *
 *   1. MJ: Integrations / Integration Objects / Integration Object Fields  (the IO/IOF catalog)
 *   2. MJ: Actions / Action Params / Action Result Codes                   (the auto-generated
 *        integration actions — `DriverClass = 'IntegrationActionExecutor'`)
 *   3. MJ: Credential Types                                                (ONLY the vendor-specific
 *        types a connector OWNS — see ownership rule below; generic primitives stay in core)
 *
 * NOT handled here (by design):
 *   - `metadata/integrations/additionalSchemaInfo.json` is NOT an mj-sync DB record (a single
 *     config object keyed by vendor slug; its plain filename doesn't match the mj-sync dotfile
 *     glob, so it was never seeded as rows). It is MOVE-ONLY: its per-vendor slice relocates to
 *     each connector in MemberJunction/Integrations, and the core file is simply deleted. No
 *     deleteRecord is possible or needed.
 *   - Per-vendor MJ: Action Categories (e.g. "HubSpot") are left in place — they live in mixed
 *     category files and an orphaned category is harmless. Retiring them is a separate, optional pass.
 *
 * CREDENTIAL-TYPE OWNERSHIP (provable, never guessed). A credential type is connector-owned —
 * and therefore retired — IFF ALL of:
 *   (a) it is referenced by >=1 connector Integration's `CredentialTypeID`, AND
 *   (b) it is referenced by NO non-connector metadata (no ai-vendors, signature-providers, etc.), AND
 *   (c) its Name is not a generic primitive (API Key, OAuth2 *, Basic Auth, AWS IAM, Azure Service
 *       Principal, Database Connection, MCP OAuth Token, API Key with Endpoint).
 * This keeps shared primitives (API Key/Azure SP also used by ai-vendors) and non-connector vendor
 * types (DocuSign, Twilio, Box.com, Dropbox Sign, PandaDoc, Google Cloud Platform) in core.
 *
 * IMPORTANT: a single metadata file can contain BOTH Case A and Case C records. Classification is
 * per-record by ID, NOT per-file — only Case A records become deleteRecord entries; Case C records
 * are simply dropped when the source file is removed.
 *
 * The committed top-level deleteRecord files ARE the durable mechanism (a deploy-time `mj sync push`
 * applies them on both fresh and existing installs). No forward-fix migration is emitted.
 *
 * Reads the connector metadata from a CLEAN `next` checkout (this worktree removes its own copy):
 *   NEXT_METADATA_DIR=/path/to/clean/next/metadata  node scripts/generate-connector-retire.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const META = join(REPO_ROOT, 'metadata');
const BOUNDARY_TAG = process.env.BOUNDARY_TAG || 'v5.41.0';
const NEXT_META = process.env.NEXT_METADATA_DIR || join(META); // default: this repo's metadata (must be clean)
const DRY_RUN = process.argv.includes('--dry-run'); // classify + report only; write nothing
const REMOVE_SOURCE = process.argv.includes('--remove-source'); // also strip connector-owned source from core

// Generic credential-type primitives that always stay in core (never connector-owned).
const GENERIC_CREDENTIAL_TYPES = new Set([
  'API Key', 'API Key with Endpoint', 'OAuth2 Client Credentials', 'OAuth2 Password Grant',
  'Basic Auth', 'AWS IAM', 'Azure Service Principal', 'Database Connection', 'MCP OAuth Token',
]);

const writeJson = (p, obj) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8'); };
const delRec = (name, id) => ({ fields: { Name: name ?? null }, primaryKey: { ID: id }, deleteRecord: { delete: true } });
const gitShow = (ref, fp) => JSON.parse(execFileSync('git', ['show', `${ref}:${fp}`], { cwd: REPO_ROOT, maxBuffer: 1 << 30 }).toString());
const gitLsTree = (ref, path) => execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', path], { cwd: REPO_ROOT }).toString().split('\n').filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// 1. INTEGRATIONS  (MJ: Integrations / Integration Objects / Integration Object Fields)
// ─────────────────────────────────────────────────────────────────────────────

/** Yield every record (level, ID, hasDeleteRecord, name) from an Integration metadata blob. */
function* integrationRecords(raw) {
  const recs = Array.isArray(raw) ? raw : [raw];
  for (const integ of recs) {
    if (!integ || typeof integ !== 'object' || !integ.fields?.ClassName) continue;
    yield { level: 'INT', id: integ.primaryKey?.ID, del: integ.deleteRecord?.delete === true, name: integ.fields?.Name };
    for (const io of integ.relatedEntities?.['MJ: Integration Objects'] ?? []) {
      yield { level: 'IO', id: io.primaryKey?.ID, del: io.deleteRecord?.delete === true, name: io.fields?.Name };
      for (const iof of io.relatedEntities?.['MJ: Integration Object Fields'] ?? []) {
        yield { level: 'IOF', id: iof.primaryKey?.ID, del: iof.deleteRecord?.delete === true, name: iof.fields?.Name };
      }
    }
  }
}

/** Integration metadata files in a metadata dir (root `.<vendor>.json` + per-vendor subdirs). */
function integrationFiles(metaDir) {
  const dir = join(metaDir, 'integrations');
  const out = [];
  if (!existsSync(dir)) return out;
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

/** All Integration/IO/IOF record IDs present at the boundary tag. */
function integrationBoundaryIds() {
  const ids = new Set();
  for (const fp of gitLsTree(BOUNDARY_TAG, 'metadata/integrations')) {
    if (!fp.endsWith('.json') || fp.includes('additionalSchemaInfo') || fp.endsWith('.mj-sync.json') || fp.endsWith('.integrations.json')) continue;
    let raw; try { raw = gitShow(BOUNDARY_TAG, fp); } catch { continue; }
    for (const r of integrationRecords(raw)) if (r.id) ids.add(r.id.toUpperCase());
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INTEGRATION ACTIONS  (MJ: Actions / Action Params / Action Result Codes)
// ─────────────────────────────────────────────────────────────────────────────

const ACTIONS_SUBDIR = 'actions/integrations-auto-generated';

/** Yield every record from an actions file, ONLY for integration actions (IntegrationActionExecutor). */
function* actionRecords(raw) {
  const recs = Array.isArray(raw) ? raw : [raw];
  for (const a of recs) {
    if (!a || typeof a !== 'object' || a.fields?.DriverClass !== 'IntegrationActionExecutor') continue;
    yield { level: 'ACTION', id: a.primaryKey?.ID, del: a.deleteRecord?.delete === true, name: a.fields?.Name };
    for (const p of a.relatedEntities?.['MJ: Action Params'] ?? []) {
      yield { level: 'PARAM', id: p.primaryKey?.ID, del: p.deleteRecord?.delete === true, name: p.fields?.Name };
    }
    for (const rc of a.relatedEntities?.['MJ: Action Result Codes'] ?? []) {
      yield { level: 'RESULTCODE', id: rc.primaryKey?.ID, del: rc.deleteRecord?.delete === true, name: rc.fields?.ResultCode ?? rc.fields?.Name };
    }
  }
}

/** Auto-generated integration-action files in a metadata dir. */
function actionFiles(metaDir) {
  const dir = join(metaDir, ACTIONS_SUBDIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json').map((f) => join(dir, f));
}

/** All integration-action record IDs present at the boundary tag. */
function actionBoundaryIds() {
  const ids = new Set();
  for (const fp of gitLsTree(BOUNDARY_TAG, `metadata/${ACTIONS_SUBDIR}`)) {
    if (!fp.endsWith('.json') || fp.endsWith('.mj-sync.json')) continue;
    let raw; try { raw = gitShow(BOUNDARY_TAG, fp); } catch { continue; }
    for (const r of actionRecords(raw)) if (r.id) ids.add(r.id.toUpperCase());
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CREDENTIAL TYPES  (MJ: Credential Types) — connector-OWNED only (provable)
// ─────────────────────────────────────────────────────────────────────────────

const CREDTYPE_FILE = 'credential-types/.credential-types.json';
const credLookupRe = /Credential Types\.Name=([^"&]+)/;

/** Set of credential-type Names that a connector OWNS (referenced only by connector integrations). */
function connectorOwnedCredTypeNames(metaDir) {
  // (a) names referenced by connector integrations
  const connectorReferenced = new Set();
  for (const fp of integrationFiles(metaDir)) {
    let raw; try { raw = JSON.parse(readFileSync(fp, 'utf-8')); } catch { continue; }
    for (const integ of (Array.isArray(raw) ? raw : [raw])) {
      const cid = integ?.fields?.CredentialTypeID;
      const m = typeof cid === 'string' && cid.match(credLookupRe);
      if (m) connectorReferenced.add(m[1].trim());
    }
  }

  // (b) names referenced by NON-connector metadata (anything outside credential-types/ + integrations/)
  const referencedElsewhere = new Set();
  const scan = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) { if (e === '.backups' || e === 'node_modules') continue; scan(p); continue; }
      if (!e.endsWith('.json')) continue;
      const rel = p.slice(metaDir.length + 1);
      if (rel.startsWith('credential-types/') || rel.startsWith('integrations/')) continue;
      let text; try { text = readFileSync(p, 'utf-8'); } catch { continue; }
      for (const name of connectorReferenced) if (text.includes(`Credential Types.Name=${name}`)) referencedElsewhere.add(name);
    }
  };
  scan(metaDir);

  // owned = connector-referenced AND not referenced elsewhere AND not a generic primitive
  const owned = new Set();
  for (const name of connectorReferenced) {
    if (!referencedElsewhere.has(name) && !GENERIC_CREDENTIAL_TYPES.has(name)) owned.add(name);
  }
  return owned;
}

/** Credential-type records (filtered to owned names) from a credential-types blob. */
function* credTypeRecords(raw, ownedNames) {
  for (const r of (Array.isArray(raw) ? raw : [raw])) {
    if (!r?.fields?.Name || !ownedNames.has(r.fields.Name)) continue;
    yield { level: 'CREDTYPE', id: r.primaryKey?.ID, del: r.deleteRecord?.delete === true, name: r.fields.Name };
  }
}

/** Credential-type IDs (owned only) present at the boundary tag. */
function credTypeBoundaryIds(ownedNames) {
  const ids = new Set();
  let raw; try { raw = gitShow(BOUNDARY_TAG, `metadata/${CREDTYPE_FILE}`); } catch { return ids; }
  for (const r of credTypeRecords(raw, ownedNames)) if (r.id) ids.add(r.id.toUpperCase());
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFY + EMIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifies every record of one family and collects Case-A deleteRecord entries per level.
 * @returns { caseA: {level -> delRec[]}, counts: {A|B|C -> {level -> n}} }
 */
function classifyFamily(recordIterables, boundary, levels) {
  const caseA = Object.fromEntries(levels.map((l) => [l, []]));
  const counts = { A: {}, B: {}, C: {} };
  for (const c of ['A', 'B', 'C']) for (const l of levels) counts[c][l] = 0;
  for (const r of recordIterables) {
    const inBoundary = r.id ? boundary.has(r.id.toUpperCase()) : false;
    const cls = r.del ? 'B' : (inBoundary ? 'A' : 'C');
    counts[cls][r.level]++;
    if (cls === 'A' && r.id) caseA[r.level].push(delRec(r.name, r.id));
  }
  return { caseA, counts };
}

function* allFamilyRecords(files, recordFn, extra) {
  for (const f of files) {
    let raw; try { raw = JSON.parse(readFileSync(f, 'utf-8')); } catch { continue; }
    yield* recordFn(raw, extra);
  }
}

// --- Integrations ---
const intResult = classifyFamily(
  allFamilyRecords(integrationFiles(NEXT_META), integrationRecords),
  integrationBoundaryIds(),
  ['INT', 'IO', 'IOF'],
);

// --- Actions ---
const actResult = classifyFamily(
  allFamilyRecords(actionFiles(NEXT_META), actionRecords),
  actionBoundaryIds(),
  ['ACTION', 'PARAM', 'RESULTCODE'],
);

// --- Credential types ---
const ownedCredTypes = connectorOwnedCredTypeNames(NEXT_META);
const credFile = join(NEXT_META, CREDTYPE_FILE);
const credResult = classifyFamily(
  existsSync(credFile) ? credTypeRecords(JSON.parse(readFileSync(credFile, 'utf-8')), ownedCredTypes) : [],
  credTypeBoundaryIds(ownedCredTypes),
  ['CREDTYPE'],
);

// ─────────────────────────────────────────────────────────────────────────────
// WRITE top-level deleteRecord files (reverse-FK order via root directoryOrder)
// ─────────────────────────────────────────────────────────────────────────────

const deleteDir = (name) => join(META, name);
const ensureSync = (dir, entity) => { const p = join(deleteDir(dir), '.mj-sync.json'); if (!existsSync(p)) writeJson(p, { entity, filePattern: '**/.*.json', defaults: {} }); };

if (!DRY_RUN) {
// 1. Integrations
writeJson(join(deleteDir('integration-object-field-deletes'), '.connector-iof.deletes.json'), intResult.caseA.IOF);
writeJson(join(deleteDir('integration-object-deletes'), '.connector-io.deletes.json'), intResult.caseA.IO);
writeJson(join(deleteDir('integration-deletes'), '.connector-integration.deletes.json'), intResult.caseA.INT);
ensureSync('integration-object-field-deletes', 'MJ: Integration Object Fields');
ensureSync('integration-object-deletes', 'MJ: Integration Objects');
ensureSync('integration-deletes', 'MJ: Integrations');

// 2. Actions
writeJson(join(deleteDir('integration-action-param-deletes'), '.connector-action-param.deletes.json'), actResult.caseA.PARAM);
writeJson(join(deleteDir('integration-action-result-code-deletes'), '.connector-action-result-code.deletes.json'), actResult.caseA.RESULTCODE);
writeJson(join(deleteDir('integration-action-deletes'), '.connector-action.deletes.json'), actResult.caseA.ACTION);
ensureSync('integration-action-param-deletes', 'MJ: Action Params');
ensureSync('integration-action-result-code-deletes', 'MJ: Action Result Codes');
ensureSync('integration-action-deletes', 'MJ: Actions');

// 3. Credential types
writeJson(join(deleteDir('credential-type-deletes'), '.connector-credential-type.deletes.json'), credResult.caseA.CREDTYPE);
ensureSync('credential-type-deletes', 'MJ: Credential Types');

// Place ALL delete dirs in the root directoryOrder as one contiguous block right after
// 'integrations', in strict FK-safe order. The order matters: a row may only be deleted once
// nothing still references it.
//   - IOF → IO → Integration            (child-before-parent within the IO/IOF tree)
//   - Action Params / Result Codes → Action  (children before the parent Action)
//   - credential-type-deletes LAST       (Integration.CredentialTypeID FKs a Credential Type, so
//                                          every referencing connector Integration must be deleted
//                                          BEFORE its owned credential type)
const ORDERED_DELETE_DIRS = [
  'integration-object-field-deletes', 'integration-object-deletes', 'integration-deletes',
  'integration-action-param-deletes', 'integration-action-result-code-deletes', 'integration-action-deletes',
  'credential-type-deletes',
];
const rootSyncPath = join(META, '.mj-sync.json');
const rootSync = JSON.parse(readFileSync(rootSyncPath, 'utf-8'));
if (Array.isArray(rootSync.directoryOrder)) {
  // Rebuild deterministically: strip any existing delete-dir entries, then re-insert the full
  // ordered block after 'integrations'. This corrects any pre-existing out-of-order placement.
  const before = JSON.stringify(rootSync.directoryOrder);
  const stripped = rootSync.directoryOrder.filter((d) => !ORDERED_DELETE_DIRS.includes(d));
  const anchor = stripped.indexOf('integrations');
  stripped.splice(anchor + 1, 0, ...ORDERED_DELETE_DIRS);
  rootSync.directoryOrder = stripped;
  if (JSON.stringify(rootSync.directoryOrder) !== before) writeJson(rootSyncPath, rootSync);
}

// Optional: strip the connector-owned SOURCE from core (the records now live in the Integrations
// repo). Generic + non-connector-vendor credential types stay; only connector-OWNED vendor rows go.
if (REMOVE_SOURCE) {
  const coreCred = join(META, CREDTYPE_FILE);
  if (existsSync(coreCred)) {
    const raw = JSON.parse(readFileSync(coreCred, 'utf-8'));
    const rows = Array.isArray(raw) ? raw : [raw];
    const removed = rows.filter((r) => ownedCredTypes.has(r.fields?.Name));
    const kept = rows.filter((r) => !ownedCredTypes.has(r.fields?.Name));
    writeJson(coreCred, kept);
    // Remove each owned row's @file schema (keep the generics' schema files).
    for (const r of removed) {
      const m = String(r.fields?.FieldSchema ?? '').match(/^@file:(.+)$/);
      if (!m) continue;
      const schemaPath = join(META, 'credential-types', m[1].trim());
      if (existsSync(schemaPath)) rmSync(schemaPath);
    }
    console.log(`[remove-source] stripped ${removed.length} connector-owned credential type(s) + schema files from core (kept ${kept.length}).`);
  }
  // additionalSchemaInfo.json is move-only (relocates per-connector to the Integrations repo).
  const asi = join(META, 'integrations', 'additionalSchemaInfo.json');
  if (existsSync(asi)) { rmSync(asi); console.log('[remove-source] deleted metadata/integrations/additionalSchemaInfo.json (move-only → Integrations repo).'); }
}
} // end if (!DRY_RUN)

// ─────────────────────────────────────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────────────────────────────────────

const fam = (label, res, levels) => {
  const line = (c) => levels.map((l) => `${l} ${res.counts[c][l]}`).join('  ');
  console.log(`\n${label}`);
  console.log(`  Case A (pre-5.42 → deleteRecord): ${line('A')}`);
  console.log(`  Case B (already deleted → stays): ${line('B')}`);
  console.log(`  Case C (added 5.42 → remove only): ${line('C')}`);
};

console.log(`Boundary tag: ${BOUNDARY_TAG}   NEXT_METADATA_DIR: ${NEXT_META}`);
fam('Integrations (MJ: Integrations / Integration Objects / Integration Object Fields)', intResult, ['INT', 'IO', 'IOF']);
fam('Integration Actions (MJ: Actions / Action Params / Action Result Codes)', actResult, ['ACTION', 'PARAM', 'RESULTCODE']);
console.log(`\nConnector-owned credential types (${ownedCredTypes.size}): ${[...ownedCredTypes].sort().join(', ')}`);
fam('Credential Types (MJ: Credential Types)', credResult, ['CREDTYPE']);
console.log(`\nWrote Case-A deleteRecord files only. additionalSchemaInfo.json is move-only (not a DB record) and is handled separately. No migration emitted.`);
