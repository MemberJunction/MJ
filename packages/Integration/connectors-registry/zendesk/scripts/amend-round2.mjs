#!/usr/bin/env node
// amend-round2.mjs — DELTA amendment round 2 for the Zendesk connector.
//
// Applies ONLY the reviewer's per-slot FixInstructions to the flagged objects,
// re-persists them into metadata/integrations/zendesk/.zendesk.integration.json
// (upsert-in-place — never touches unflagged objects), and writes ONLY the
// re-processed objects to the run EXTRACTION_EMISSION.json artifact.
//
// Fix families:
//  (A) 61 objects with no page/cursor/offset param: PaginationType PageNumber->None,
//      SupportsPagination true->false, DefaultPageSize 100->null.
//  (B) custom_object_records: PaginationType PageNumber->Cursor (page[before]/[after]/[size]).
//  (C) 7 FK corrections (clear / retarget) on individual IOFs.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';

const REPO = resolve(process.cwd());
const REG = resolve(REPO, 'packages/Integration/connectors-registry/zendesk');
const METADATA_FILE = resolve(REPO, 'metadata/integrations/zendesk/.zendesk.integration.json');
const EMISSION_FILE = resolve(REG, 'runs/connector-zendesk-1783120273097-639b6951/output/EXTRACTION_EMISSION.json');

// ── the 61 objects whose GET has no page/cursor/offset param → unpaginated ──
const NONE_PAGINATION = [
  'approval_requests','article_attachments','article_labels','articles','asset_types','assets',
  'audits','bookmarks','community_posts','community_topics','compliance_deletion_statuses',
  'custom_field_options','custom_object_access_rules','custom_object_fields',
  'custom_object_permission_policies','custom_object_record_attachments','custom_objects',
  'custom_roles','custom_statuses','deletion_schedules','email_notifications','group_sla_policies',
  'help_center_votes','itam_asset_fields','itam_asset_statuses','locations','macro_attachments',
  'macro_categories','monitored_twitter_handles','omnichannel_routing_queues','organization_merges',
  'organization_subscriptions','post_subscriptions','remote_authentications','routing_attribute_values',
  'routing_attributes','routing_instance_values','satisfaction_reasons','saved_searches','sections',
  'service_catalog_items','sharing_agreements','skips','sla_policies','target_failures','targets',
  'task_list_templates','task_lists','tasks','ticket_comments','ticket_content_pins','ticket_events',
  'ticket_form_statuses','ticket_metric_events','translations','trigger_revisions','user_identities',
  'user_segments','user_subscriptions','view_counts','workspaces',
];

// ── FK corrections. lookup(target) builds the @lookup pointer string. ────────
const lookup = (t) => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;
// each: { obj, field, op:'clear'|'retarget', target? }
const FK_FIXES = [
  // clear — no valid in-run target exists / not an FK
  { obj: 'articles', field: 'permission_group_id', op: 'clear' },
  { obj: 'remote_authentications', field: 'update_external_ids', op: 'clear' },
  // retarget hard @lookup edges (also fix Configuration.ReferencedType to match)
  { obj: 'triggers', field: 'category_id', op: 'retarget', target: 'trigger_categories' },
  { obj: 'satisfaction_ratings', field: 'reason_id', op: 'retarget', target: 'satisfaction_reasons' },
  // retarget soft-FK (Configuration.ReferencedType only — no @lookup present)
  { obj: 'requests', field: 'collaborator_ids', op: 'retarget', target: 'users' },
  { obj: 'requests', field: 'email_cc_ids', op: 'retarget', target: 'users' },
  { obj: 'ticket_forms', field: 'restricted_brand_ids', op: 'retarget', target: 'brands' },
];

// ── flagged set (re-processed objects) = union of every touched object ───────
const FLAGGED = new Set([...NONE_PAGINATION, 'custom_object_records', 'triggers', 'satisfaction_ratings', 'requests', 'ticket_forms']);

// ── load metadata ────────────────────────────────────────────────────────────
if (!existsSync(METADATA_FILE)) { console.error('metadata file missing'); process.exit(1); }
const data = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
const root = Array.isArray(data) ? data[0] : data;
const ios = root.relatedEntities?.['MJ: Integration Objects'];
if (!Array.isArray(ios)) { console.error('no IO array'); process.exit(1); }
const byName = new Map(ios.map((io) => [io.fields.Name, io]));

const applied = [];       // audit of every slot change
function record(slot, before, after) { applied.push({ slot, before, after }); }

// (A) unpaginated fixes
for (const name of NONE_PAGINATION) {
  const io = byName.get(name);
  if (!io) { console.error(`MISSING IO ${name}`); process.exit(1); }
  const f = io.fields;
  record(`io.${name}.PaginationType`, f.PaginationType, 'None'); f.PaginationType = 'None';
  record(`io.${name}.SupportsPagination`, f.SupportsPagination, false); f.SupportsPagination = false;
  record(`io.${name}.DefaultPageSize`, f.DefaultPageSize, null); f.DefaultPageSize = null;
}

// (B) custom_object_records → Cursor
{
  const io = byName.get('custom_object_records');
  if (!io) { console.error('MISSING custom_object_records'); process.exit(1); }
  record('io.custom_object_records.PaginationType', io.fields.PaginationType, 'Cursor');
  io.fields.PaginationType = 'Cursor';
}

// (C) FK fixes
function findField(objName, fieldName) {
  const io = byName.get(objName);
  if (!io) return null;
  const list = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
  return list.find((x) => x.fields.Name === fieldName) ?? null;
}
for (const fx of FK_FIXES) {
  const rec = findField(fx.obj, fx.field);
  if (!rec) { console.error(`MISSING FIELD ${fx.obj}.${fx.field}`); process.exit(1); }
  const f = rec.fields;
  if (fx.op === 'clear') {
    // fully de-FK: remove the @lookup pointer, field-name hint, and ReferencedType hint.
    record(`iof.${fx.obj}.${fx.field}.RelatedIntegrationObjectID`, f.RelatedIntegrationObjectID ?? null, null);
    delete f.RelatedIntegrationObjectID;
    delete f.RelatedIntegrationObjectFieldName;
    delete f.IsForeignKey;
    if (f.Configuration && 'ReferencedType' in f.Configuration) {
      record(`iof.${fx.obj}.${fx.field}.Configuration.ReferencedType`, f.Configuration.ReferencedType, null);
      delete f.Configuration.ReferencedType;
      if (Object.keys(f.Configuration).length === 0) delete f.Configuration;
    }
  } else if (fx.op === 'retarget') {
    if (typeof f.RelatedIntegrationObjectID === 'string') {
      // hard @lookup edge → retarget the pointer
      record(`iof.${fx.obj}.${fx.field}.RelatedIntegrationObjectID`, f.RelatedIntegrationObjectID, lookup(fx.target));
      f.RelatedIntegrationObjectID = lookup(fx.target);
    }
    // Configuration.ReferencedType must always agree with the resolved target (runtime re-derivation hint)
    f.Configuration = f.Configuration ?? {};
    record(`iof.${fx.obj}.${fx.field}.Configuration.ReferencedType`, f.Configuration.ReferencedType ?? null, fx.target);
    f.Configuration.ReferencedType = fx.target;
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

// ── rebuild emission entries for ONLY the flagged objects ────────────────────
function titleCase(n) { return n.split(/[_\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
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
  // IO-level slot claims
  claims.push({ slot: 'APIPath', value: f.APIPath, sourcePath: `sources/*-oas.json: GET ${f.APIPath}` });
  claims.push({ slot: 'PaginationType', value: f.PaginationType, sourcePath: 'output/zendesk-taxonomy-leaves-final.json (leaf.pagination); SOURCE_STUDY.md §4' });
  claims.push({ slot: 'SupportsPagination', value: f.SupportsPagination, sourcePath: 'output/zendesk-taxonomy-leaves-final.json (leaf.pagination); SOURCE_STUDY.md §4' });
  if (f.SupportsCreate) claims.push({ slot: 'SupportsCreate', value: true, sourcePath: `oas: POST ${f.CreateAPIPath}` });
  if (f.SupportsUpdate) claims.push({ slot: 'SupportsUpdate', value: true, sourcePath: `oas: PUT ${f.UpdateAPIPath}` });
  if (f.SupportsDelete) claims.push({ slot: 'SupportsDelete', value: true, sourcePath: `oas: DELETE ${f.DeleteAPIPath}` });
  if (f.SupportsIncrementalSync && f.IncrementalWatermarkField) {
    claims.push({ slot: 'IncrementalWatermarkField', value: f.IncrementalWatermarkField, sourcePath: 'Configuration.incrementalEndpoint + oas' });
  }
  // field-level PK / FK claims
  let fkCount = 0, hasPK = false;
  for (const rec of fields) {
    const ff = rec.fields;
    if (ff.IsPrimaryKey) { hasPK = true; claims.push({ slot: `IsPrimaryKey:${ff.Name}`, value: true, sourcePath: `oas: ${name}.${ff.Name} (Zendesk universal id convention)` }); }
    const tgt = fkTargetOf(rec);
    if (tgt) { fkCount++; claims.push({ slot: `IsForeignKey:${ff.Name}`, value: tgt, sourcePath: `oas: ${name}.${ff.Name} -> ${tgt}` }); }
  }
  const matrixRow = {
    IOName: name,
    ExistingConnectorTs: 'n/a',
    ExistingMetadataJson: 'no',
    OpenAPIxPK: 'no',
    OpenAPIPathOps: (f.UpdateAPIPath || f.DeleteAPIPath || (f.Configuration && f.Configuration.singleRecordPath)) ? 'yes' : 'no',
    OpenAPILocationHeader: 'no',
    VendorDocsProseScan: 'yes',
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
  amendmentRound: 2,
  slotsChanged: applied.length,
  flaggedObjects: emission.length,
  flaggedFieldTotal,
  paginationNoneFixed: NONE_PAGINATION.length,
  fkFixes: FK_FIXES.length,
  emissionArtifact: EMISSION_FILE,
  metadataFile: METADATA_FILE,
}, null, 2) + '\n');
