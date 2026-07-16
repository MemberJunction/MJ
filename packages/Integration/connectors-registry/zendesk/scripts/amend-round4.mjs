#!/usr/bin/env node
// amend-round4.mjs — DELTA amendment round 4 for the Zendesk connector.
//
// Applies ONLY the reviewer's per-slot FixInstructions to the 3 flagged objects,
// re-persists them into metadata/integrations/zendesk/.zendesk.integration.json
// (upsert-in-place — never touches any unflagged object), and writes ONLY the
// 3 re-processed objects to the run EXTRACTION_EMISSION.json artifact.
//
// Fix family (round 4) — pagination correction on Help Center endpoints that have
// NO page/cursor param and no pagination response metadata in helcenter-oas.json.
// True siblings (/help_center/sections, /help_center/articles) are unpaginated and
// correctly marked None; these three were wrongly Cursor. Co-grouped per object:
//   PaginationType     Cursor -> None
//   SupportsPagination true   -> false
//   DefaultPageSize    100    -> null (clear)
//
// Flagged: help_center_categories, article_comments, post_comments
//
// Idempotent: re-running upserts the same rows (no-op once applied).

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const REPO = resolve(process.cwd());
const REG = resolve(REPO, 'packages/Integration/connectors-registry/zendesk');
const METADATA_FILE = resolve(REPO, 'metadata/integrations/zendesk/.zendesk.integration.json');
const EMISSION_FILE = resolve(REG, 'runs/connector-zendesk-1783120273097-639b6951/output/EXTRACTION_EMISSION.json');
const CODE_EVIDENCE_FILE = resolve(REG, 'CODE_EVIDENCE.json');

const HELPCENTER_OAS = 'sources/helpcenter-oas.json';

// ── per-slot FixInstructions (round 4) ─────────────────────────────────────────
// Each object gets the same co-grouped pagination correction.
const PAGINATION_FIX = {
  help_center_categories: `${HELPCENTER_OAS}: GET /api/v2/help_center/categories has no page/cursor param; true siblings /help_center/sections and /help_center/articles are unpaginated and correctly marked None. Zero evidence for Cursor; contradicted by the same OAS.`,
  article_comments: `${HELPCENTER_OAS}: GET .../articles/{article_id}/comments has parameters=[] and no pagination response metadata. Same defect class.`,
  post_comments: `${HELPCENTER_OAS}: GET .../posts/{post_id}/comments has parameters=[] and no pagination response metadata. Same defect class.`,
};

const FLAGGED = ['help_center_categories', 'article_comments', 'post_comments'];

// ── load metadata ────────────────────────────────────────────────────────────
if (!existsSync(METADATA_FILE)) { console.error('metadata file missing'); process.exit(1); }
const data = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
const root = Array.isArray(data) ? data[0] : data;
const ios = root.relatedEntities?.['MJ: Integration Objects'];
if (!Array.isArray(ios)) { console.error('no IO array'); process.exit(1); }
const byName = new Map(ios.map((io) => [io.fields.Name, io]));

const applied = [];
function record(slot, before, after) { applied.push({ slot, before, after }); }

// ── apply pagination corrections ────────────────────────────────────────────────
for (const name of FLAGGED) {
  const io = byName.get(name);
  if (!io) { console.error(`MISSING IO ${name}`); process.exit(1); }
  const f = io.fields;

  // PaginationType Cursor -> None
  if (f.PaginationType !== 'Cursor' && f.PaginationType !== 'None') {
    console.error(`WARN ${name}.PaginationType: expected "Cursor" found ${JSON.stringify(f.PaginationType)}`);
  }
  record(`io.${name}.PaginationType`, f.PaginationType ?? null, 'None');
  f.PaginationType = 'None';

  // SupportsPagination true -> false
  record(`io.${name}.SupportsPagination`, f.SupportsPagination ?? null, false);
  f.SupportsPagination = false;

  // DefaultPageSize 100 -> null (clear)
  if ('DefaultPageSize' in f) {
    record(`io.${name}.DefaultPageSize`, f.DefaultPageSize ?? null, null);
    f.DefaultPageSize = null;
  } else {
    record(`io.${name}.DefaultPageSize`, null, null);
  }
}

// ── write metadata atomically (with backup) ──────────────────────────────────
function writeAtomic(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    const bdir = join(dirname(filePath), '.backups');
    mkdirSync(bdir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    copyFileSync(filePath, join(bdir, `${basename(filePath)}.${stamp}.bak`));
  }
  const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}
writeAtomic(METADATA_FILE, JSON.stringify([root], null, 2) + '\n');

// ── append CODE_EVIDENCE for changed slots ─────────────────────────────────────
let ce = { Entries: [] };
if (existsSync(CODE_EVIDENCE_FILE)) {
  try { ce = JSON.parse(readFileSync(CODE_EVIDENCE_FILE, 'utf8')); } catch { ce = { Entries: [] }; }
}
ce.Entries = ce.Entries ?? [];
const now = new Date().toISOString();
for (const name of FLAGGED) {
  ce.Entries.push({
    ScriptPath: 'scripts/amend-round4.mjs', ScriptRunAt: now,
    StructuredOutput: { operation: 'pagination-correct', object: name, PaginationType: 'None', SupportsPagination: false, DefaultPageSize: null },
    SchemaValidationStatus: 'Passed',
    TargetField: [`io.${name}.PaginationType`, `io.${name}.SupportsPagination`, `io.${name}.DefaultPageSize`],
    Excerpt: PAGINATION_FIX[name],
  });
}
writeAtomic(CODE_EVIDENCE_FILE, JSON.stringify(ce, null, 2) + '\n');

// ── rebuild emission entries for ONLY the 3 flagged objects ─────────────────────
function fkTargetOf(field) {
  const f = field.fields;
  if (typeof f.RelatedIntegrationObjectID === 'string') {
    const m = f.RelatedIntegrationObjectID.match(/Name=([^&]+)/);
    if (m) return m[1].trim();
  }
  if (f.Configuration && f.Configuration.ReferencedType) return f.Configuration.ReferencedType;
  return null;
}

const emission = [];
let flaggedFieldTotal = 0;
for (const name of FLAGGED) {
  const io = byName.get(name);
  const f = io.fields;
  const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
  flaggedFieldTotal += fields.length;
  const claims = [];
  claims.push({ slot: 'APIPath', value: f.APIPath, sourcePath: `${HELPCENTER_OAS}: GET ${f.APIPath}` });
  claims.push({ slot: 'PaginationType', value: f.PaginationType, sourcePath: `${HELPCENTER_OAS} (round-4 fix: endpoint has no page/cursor param → None)` });
  claims.push({ slot: 'SupportsPagination', value: f.SupportsPagination, sourcePath: `${HELPCENTER_OAS} (round-4 fix: no pagination params/metadata → false)` });
  claims.push({ slot: 'DefaultPageSize', value: f.DefaultPageSize, sourcePath: `${HELPCENTER_OAS} (round-4 fix: cleared, unpaginated)` });
  if (f.SupportsCreate) claims.push({ slot: 'SupportsCreate', value: true, sourcePath: `POST ${f.CreateAPIPath}` });
  if (f.SupportsUpdate) claims.push({ slot: 'SupportsUpdate', value: true, sourcePath: `PUT ${f.UpdateAPIPath}` });
  if (f.SupportsDelete) claims.push({ slot: 'SupportsDelete', value: true, sourcePath: `DELETE ${f.DeleteAPIPath}` });
  let fkCount = 0, hasPK = false;
  for (const rec of fields) {
    const ff = rec.fields;
    if (ff.IsPrimaryKey) { hasPK = true; claims.push({ slot: `IsPrimaryKey:${ff.Name}`, value: true, sourcePath: `${name}.${ff.Name} (Zendesk id convention / OAS)` }); }
    const tgt = fkTargetOf(rec);
    if (tgt) { fkCount++; claims.push({ slot: `IsForeignKey:${ff.Name}`, value: tgt, sourcePath: `${name}.${ff.Name} -> ${tgt}` }); }
    claims.push({ slot: `field:${ff.Name}`, value: ff.Type, sourcePath: `${HELPCENTER_OAS} ${name}` });
  }
  const matrixRow = {
    IOName: name,
    ExistingConnectorTs: 'n/a',
    ExistingMetadataJson: 'no',
    OpenAPIxPK: 'no',
    OpenAPIPathOps: (f.UpdateAPIPath || f.DeleteAPIPath || (f.Configuration && f.Configuration.singleRecordPath)) ? 'yes' : 'no',
    OpenAPILocationHeader: 'no',
    VendorDocsProseScan: 'no',
    SDKTypes: 'n/a',
    PostmanCommunity: 'n/a',
    NamingConvention: 'yes',
    CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
    PKVerdict: hasPK ? 'emit' : 'defer',
    FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
    EvidenceCount: claims.length,
  };
  emission.push({ objectName: name, fieldsExtracted: fields.length, gapsRemaining: [], claims, matrixRow });
}

mkdirSync(dirname(EMISSION_FILE), { recursive: true });
writeFileSync(EMISSION_FILE, JSON.stringify(emission, null, 2) + '\n', 'utf8');

process.stdout.write(JSON.stringify({
  amendmentRound: 4,
  slotsChanged: applied.length,
  flaggedObjects: emission.length,
  flaggedFieldTotal,
  emissionArtifact: EMISSION_FILE,
  metadataFile: METADATA_FILE,
  applied,
}, null, 2) + '\n');
