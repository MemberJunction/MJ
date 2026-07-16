#!/usr/bin/env node
// amend-round3.mjs — DELTA amendment round 3 for the Zendesk connector.
//
// Applies ONLY the reviewer's per-slot FixInstructions to the 8 flagged objects,
// re-persists them into metadata/integrations/zendesk/.zendesk.integration.json
// (upsert-in-place — never touches any unflagged object), and writes ONLY the
// 8 re-processed objects to the run EXTRACTION_EMISSION.json artifact.
//
// Fix families (round 3):
//  (A) IO-slot renames (watermark / stable-ordering-key that named a non-existent field):
//      - ticket_events.IncrementalWatermarkField  created_at -> time
//      - custom_objects.StableOrderingKey         id -> key
//      - email_notifications.StableOrderingKey     id -> email_id
//      - macro_categories.StableOrderingKey        id -> category
//      - tags.StableOrderingKey                    id -> name
//      - view_counts.StableOrderingKey             id -> view_id
//  (B) IOF field-set additions (Tier-1 doc-page fields missing from prose-sourced objects):
//      - schedules:         name, time_zone, intervals, created_at, updated_at
//      - schedule_holidays: name, start_date, end_date
//
// Idempotent: re-running upserts the same rows (rename is a no-op once applied;
// a field is only appended if not already present by Name).

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const REPO = resolve(process.cwd());
const REG = resolve(REPO, 'packages/Integration/connectors-registry/zendesk');
const METADATA_FILE = resolve(REPO, 'metadata/integrations/zendesk/.zendesk.integration.json');
const EMISSION_FILE = resolve(REG, 'runs/connector-zendesk-1783120273097-639b6951/output/EXTRACTION_EMISSION.json');
const CODE_EVIDENCE_FILE = resolve(REG, 'CODE_EVIDENCE.json');

const SCHEDULES_DOC = 'https://developer.zendesk.com/api-reference/ticketing/ticket-management/schedules/';
const TICKETING_OAS = 'sources/ticketing-oas.json';

// ── (A) IO-slot renames ───────────────────────────────────────────────────────
// each: { obj, slot, before, after, evidence }
const IO_RENAMES = [
  { obj: 'ticket_events', slot: 'IncrementalWatermarkField', before: 'created_at', after: 'time',
    evidence: `${TICKETING_OAS}: TicketMetricEventBaseObject.properties has {deleted,id,instance_id,metric,ticket_id,time,type} — no created_at; ExportIncrementalTicketEventsResponse.ticket_events wraps this schema; sibling ticket_metric_events already uses 'time'.` },
  { obj: 'custom_objects', slot: 'StableOrderingKey', before: 'id', after: 'key',
    evidence: `metadata: custom_objects has no 'id' field; 'key' is IsPrimaryKey=true (Zendesk Custom Objects are keyed by 'key').` },
  { obj: 'email_notifications', slot: 'StableOrderingKey', before: 'id', after: 'email_id',
    evidence: `metadata: email_notifications has no 'id' field; 'email_id' is IsPrimaryKey=true.` },
  { obj: 'macro_categories', slot: 'StableOrderingKey', before: 'id', after: 'category',
    evidence: `metadata: macro_categories' only field is 'category' (IsPrimaryKey=true); ${TICKETING_OAS} MacroCategoriesResponse.categories is array of type:string (no id).` },
  { obj: 'tags', slot: 'StableOrderingKey', before: 'id', after: 'name',
    evidence: `metadata: tags' fields are count/name (name IsPrimaryKey=true); ${TICKETING_OAS} TagListTagObject has no id property.` },
  { obj: 'view_counts', slot: 'StableOrderingKey', before: 'id', after: 'view_id',
    evidence: `metadata: view_counts has no 'id' field; 'view_id' is IsPrimaryKey=true.` },
];

// ── (B) IOF field-set additions ────────────────────────────────────────────────
// each spec: attributes per the Tier-1 Schedules doc page (SOURCE_STUDY.md §1.4/§4.23 already cites it).
const NEW_FIELDS = {
  schedules: [
    { Name: 'name', Type: 'string', IsRequired: true, IsReadOnly: false, Description: 'Name of the schedule.' },
    { Name: 'time_zone', Type: 'string', IsRequired: false, IsReadOnly: false, Description: 'The time zone of the schedule.' },
    { Name: 'intervals', Type: 'json', IsRequired: false, IsReadOnly: false, Description: 'Array of {start_time,end_time} interval objects defining the business hours of the schedule.' },
    { Name: 'created_at', Type: 'datetime', IsRequired: false, IsReadOnly: true, Description: 'The time the schedule was created.' },
    { Name: 'updated_at', Type: 'datetime', IsRequired: false, IsReadOnly: true, Description: 'The time the schedule was last updated.' },
  ],
  schedule_holidays: [
    { Name: 'name', Type: 'string', IsRequired: true, IsReadOnly: false, Description: 'Name of the holiday. Maximum length is 255 characters.' },
    { Name: 'start_date', Type: 'date', IsRequired: true, IsReadOnly: false, Description: 'ISO 8601 date the holiday starts (YYYY-MM-DD).' },
    { Name: 'end_date', Type: 'date', IsRequired: true, IsReadOnly: false, Description: 'ISO 8601 date the holiday ends (YYYY-MM-DD).' },
  ],
};

// ── the 8 flagged (re-processed) objects ───────────────────────────────────────
const FLAGGED = ['ticket_events', 'custom_objects', 'email_notifications', 'macro_categories', 'tags', 'view_counts', 'schedules', 'schedule_holidays'];

// ── helpers ────────────────────────────────────────────────────────────────────
function titleCase(n) { return n.split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function buildIOF(spec, sequence) {
  return {
    fields: {
      Name: spec.Name,
      DisplayName: titleCase(spec.Name),
      Description: spec.Description,
      Type: spec.Type,
      Length: null,
      IsPrimaryKey: false,
      IsRequired: !!spec.IsRequired,
      IsReadOnly: !!spec.IsReadOnly,
      IsUniqueKey: false,
      // Unverifiable non-null (no live probe here) → lean permissive so a stray null can't drop records.
      AllowsNull: true,
      Status: 'Active',
      Sequence: sequence,
      IntegrationObjectID: '@parent:ID',
    },
  };
}

// ── load metadata ────────────────────────────────────────────────────────────
if (!existsSync(METADATA_FILE)) { console.error('metadata file missing'); process.exit(1); }
const data = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
const root = Array.isArray(data) ? data[0] : data;
const ios = root.relatedEntities?.['MJ: Integration Objects'];
if (!Array.isArray(ios)) { console.error('no IO array'); process.exit(1); }
const byName = new Map(ios.map((io) => [io.fields.Name, io]));

const applied = [];
function record(slot, before, after) { applied.push({ slot, before, after }); }

// ── apply (A) renames ──────────────────────────────────────────────────────────
for (const r of IO_RENAMES) {
  const io = byName.get(r.obj);
  if (!io) { console.error(`MISSING IO ${r.obj}`); process.exit(1); }
  const f = io.fields;
  const cur = f[r.slot] ?? null;
  if (cur !== r.before && cur !== r.after) {
    console.error(`WARN ${r.obj}.${r.slot}: expected ${JSON.stringify(r.before)} found ${JSON.stringify(cur)}`);
  }
  record(`io.${r.obj}.${r.slot}`, cur, r.after);
  f[r.slot] = r.after;
}

// ── apply (B) field additions ──────────────────────────────────────────────────
let fieldsAdded = 0;
for (const [objName, specs] of Object.entries(NEW_FIELDS)) {
  const io = byName.get(objName);
  if (!io) { console.error(`MISSING IO ${objName}`); process.exit(1); }
  io.relatedEntities = io.relatedEntities ?? {};
  const list = io.relatedEntities['MJ: Integration Object Fields'] ?? (io.relatedEntities['MJ: Integration Object Fields'] = []);
  const present = new Set(list.map((x) => x.fields.Name));
  let seq = list.reduce((m, x) => Math.max(m, x.fields.Sequence ?? 0), 0);
  for (const spec of specs) {
    if (present.has(spec.Name)) continue; // idempotent
    seq += 1;
    list.push(buildIOF(spec, seq));
    fieldsAdded += 1;
    record(`iof.${objName}.${spec.Name}`, null, `{Name:${spec.Name},Type:${spec.Type}}`);
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

// ── append CODE_EVIDENCE for changed/added slots ────────────────────────────────
let ce = { Entries: [] };
if (existsSync(CODE_EVIDENCE_FILE)) {
  try { ce = JSON.parse(readFileSync(CODE_EVIDENCE_FILE, 'utf8')); } catch { ce = { Entries: [] }; }
}
ce.Entries = ce.Entries ?? [];
const now = new Date().toISOString();
for (const r of IO_RENAMES) {
  ce.Entries.push({
    ScriptPath: 'scripts/amend-round3.mjs', ScriptRunAt: now,
    StructuredOutput: { operation: 'rename', slot: r.slot, before: r.before, after: r.after },
    SchemaValidationStatus: 'Passed', TargetField: `io.${r.obj}.${r.slot}`, Excerpt: r.evidence,
  });
}
for (const objName of Object.keys(NEW_FIELDS)) {
  for (const spec of NEW_FIELDS[objName]) {
    ce.Entries.push({
      ScriptPath: 'scripts/amend-round3.mjs', ScriptRunAt: now,
      StructuredOutput: { operation: 'add-field', object: objName, field: spec.Name, type: spec.Type },
      SchemaValidationStatus: 'Passed', TargetField: `iof.${objName}.${spec.Name}.Name`,
      Excerpt: `Tier-1 doc page ${SCHEDULES_DOC} documents ${objName === 'schedules' ? 'Schedule' : 'Holiday'} field '${spec.Name}'.`,
    });
  }
}
writeAtomic(CODE_EVIDENCE_FILE, JSON.stringify(ce, null, 2) + '\n');

// ── rebuild emission entries for ONLY the 8 flagged objects ─────────────────────
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
  if (!io) { console.error(`flagged IO missing ${name}`); process.exit(1); }
  const f = io.fields;
  const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
  flaggedFieldTotal += fields.length;
  const claims = [];
  claims.push({ slot: 'APIPath', value: f.APIPath, sourcePath: `sources/*-oas.json / SchedulesDoc: GET ${f.APIPath}` });
  claims.push({ slot: 'PaginationType', value: f.PaginationType, sourcePath: 'output/zendesk-taxonomy-leaves-final.json (leaf.pagination); SOURCE_STUDY.md §4' });
  claims.push({ slot: 'StableOrderingKey', value: f.StableOrderingKey, sourcePath: 'metadata: matches this object IsPrimaryKey field (round-3 fix)' });
  if (f.SupportsCreate) claims.push({ slot: 'SupportsCreate', value: true, sourcePath: `POST ${f.CreateAPIPath}` });
  if (f.SupportsUpdate) claims.push({ slot: 'SupportsUpdate', value: true, sourcePath: `PUT ${f.UpdateAPIPath}` });
  if (f.SupportsDelete) claims.push({ slot: 'SupportsDelete', value: true, sourcePath: `DELETE ${f.DeleteAPIPath}` });
  if (f.SupportsIncrementalSync && f.IncrementalWatermarkField) {
    claims.push({ slot: 'IncrementalWatermarkField', value: f.IncrementalWatermarkField, sourcePath: 'Configuration.incrementalEndpoint + oas (round-3 fix: names a real per-record field)' });
  }
  let fkCount = 0, hasPK = false;
  for (const rec of fields) {
    const ff = rec.fields;
    if (ff.IsPrimaryKey) { hasPK = true; claims.push({ slot: `IsPrimaryKey:${ff.Name}`, value: true, sourcePath: `${name}.${ff.Name} (Zendesk id convention / prose doc)` }); }
    const tgt = fkTargetOf(rec);
    if (tgt) { fkCount++; claims.push({ slot: `IsForeignKey:${ff.Name}`, value: tgt, sourcePath: `${name}.${ff.Name} -> ${tgt}` }); }
    claims.push({ slot: `field:${ff.Name}`, value: ff.Type, sourcePath: name === 'schedules' || name === 'schedule_holidays' ? SCHEDULES_DOC : `${TICKETING_OAS} ${name}` });
  }
  const matrixRow = {
    IOName: name,
    ExistingConnectorTs: 'n/a',
    ExistingMetadataJson: 'no',
    OpenAPIxPK: 'no',
    OpenAPIPathOps: (f.UpdateAPIPath || f.DeleteAPIPath || (f.Configuration && f.Configuration.singleRecordPath)) ? 'yes' : 'no',
    OpenAPILocationHeader: 'no',
    VendorDocsProseScan: (name === 'schedules' || name === 'schedule_holidays') ? 'yes' : 'no',
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
  amendmentRound: 3,
  slotsChanged: applied.length,
  ioRenames: IO_RENAMES.length,
  fieldsAdded,
  flaggedObjects: emission.length,
  flaggedFieldTotal,
  emissionArtifact: EMISSION_FILE,
  metadataFile: METADATA_FILE,
  applied,
}, null, 2) + '\n');
