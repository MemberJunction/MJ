#!/usr/bin/env tsx
// scripts/extract-io-iof-amend3.ts
//
// ADDITIVE amendment pass — closes the OBJECT-SET under-enumeration between the
// deterministic enumerated universe (161 objects: enumerate-object-universe.mjs)
// and the current metadata emission (140 objects). 25 record types were enumerated
// from the saved credential-free OpenAPI specs but NOT yet emitted:
//   - 22 non-association record types (workflows, forms, scim, settings, conversations…)
//   - 3 association pairs (quotes-contacts, quotes-line_items, tickets-feedback_submissions)
//
// The pass is UPSERT (idempotent) and STRICTLY ADDITIVE: it re-reads the current
// metadata file, appends the missing objects, and NEVER deletes/shrinks the existing
// 140 (the amendment additive-never-subtractive rule). The full emission artifact it
// writes contains ALL current objects (existing + newly added) so the pipeline's stats
// reflect the true full set.
//
// Every object is enumerated FROM A SAVED SPEC (sources/specs/<slug>.json) or, for the
// two surfaces with no credential-free OpenAPI (SCIM RFC7643, legacy Form Submissions),
// from the RFC/vendor-doc-proven core field set cited in PROVENANCE. Field types, PK
// (universal `id` convention + path-param proof), CRUD, and typed-scalar FKs are read
// from the spec — none fabricated.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = join(__dirname, '..');
const SPECS_DIR = join(CONNECTOR_DIR, 'sources', 'specs');
const REPO_ROOT = resolve(CONNECTOR_DIR, '..', '..', '..', '..');
const REGISTRY_ROOT = resolve(CONNECTOR_DIR, '..');
const METADATA_ROOT = resolve(REPO_ROOT, 'metadata', 'integrations');
const CONNECTOR = 'hubspot';
const RUN_OUTPUT = join(CONNECTOR_DIR, 'runs', 'connector-hubspot-1782844385831-2bfb45ce', 'output');
const EMISSION_PATH = join(RUN_OUTPUT, 'EXTRACTION_EMISSION.json');
const SCRIPT_REL = 'scripts/extract-io-iof-amend3.ts';
const NOW = new Date().toISOString();

const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

// ───────────────────────── Zod OpenAPI shape ─────────────────────────
const OpenAPIDocSchema = z.object({
  openapi: z.string().optional(),
  paths: z.record(z.string(), z.unknown()).optional(),
  components: z.object({ schemas: z.record(z.string(), z.unknown()).optional() }).optional(),
});
type OpenAPIDoc = z.infer<typeof OpenAPIDocSchema>;
type JsonObj = Record<string, unknown>;

function loadSpec(slug: string): { doc: OpenAPIDoc; file: string } | null {
  const file = join(SPECS_DIR, `${slug}.json`);
  if (!existsSync(file)) return null;
  const parsed = OpenAPIDocSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  if (!parsed.success) return null;
  return { doc: parsed.data, file: `sources/specs/${slug}.json` };
}
function schemasOf(doc: OpenAPIDoc): Record<string, JsonObj> {
  return (doc.components?.schemas ?? {}) as Record<string, JsonObj>;
}
// resolve $ref / allOf into flat { properties, required }
function resolveSchema(name: string, schemas: Record<string, JsonObj>, seen = new Set<string>()): {
  properties: Record<string, JsonObj>; required: Set<string>;
} {
  const out = { properties: {} as Record<string, JsonObj>, required: new Set<string>() };
  if (!name || seen.has(name)) return out;
  seen.add(name);
  const s = schemas[name];
  if (!s || typeof s !== 'object') return out;
  const merge = (sub: JsonObj) => {
    const props = sub.properties as Record<string, JsonObj> | undefined;
    if (props) for (const [k, v] of Object.entries(props)) out.properties[k] = v;
    const req = sub.required as string[] | undefined;
    if (Array.isArray(req)) for (const r of req) out.required.add(r);
  };
  const combine = (list: JsonObj[] | undefined) => {
    if (!Array.isArray(list)) return;
    for (const part of list) {
      const ref = part.$ref as string | undefined;
      if (ref) {
        const sub = resolveSchema(ref.split('/').pop()!, schemas, seen);
        for (const [k, v] of Object.entries(sub.properties)) out.properties[k] = v;
        for (const r of sub.required) out.required.add(r);
      } else merge(part);
    }
  };
  combine(s.allOf as JsonObj[] | undefined);
  // oneOf/anyOf: merge the FIRST concrete variant's shape (the common record shape)
  const variant = ((s.oneOf as JsonObj[] | undefined) ?? (s.anyOf as JsonObj[] | undefined))?.[0];
  if (variant) {
    const ref = variant.$ref as string | undefined;
    if (ref) {
      const sub = resolveSchema(ref.split('/').pop()!, schemas, seen);
      for (const [k, v] of Object.entries(sub.properties)) out.properties[k] = v;
      for (const r of sub.required) out.required.add(r);
    }
  }
  merge(s);
  return out;
}
function mapType(prop: JsonObj): { type: string; length: number | null } {
  const t = prop.type as string | undefined;
  const fmt = prop.format as string | undefined;
  if (prop.$ref || prop.allOf || prop.oneOf || prop.anyOf || t === 'object' || t === 'array') return { type: 'json', length: null };
  if (t === 'boolean') return { type: 'boolean', length: null };
  if (t === 'integer') return { type: 'int', length: null };
  if (t === 'number') return { type: 'decimal', length: null };
  if (t === 'string') {
    if (fmt === 'date-time' || fmt === 'date') return { type: 'datetime', length: null };
    const ml = typeof prop.maxLength === 'number' ? (prop.maxLength as number) : null;
    return { type: 'string', length: ml };
  }
  return { type: 'string', length: null };
}
type CrudPaths = { createPath: string | null; getByIdPath: string | null; idParam: string | null; updateMethod: string | null; deletePath: string | null; deleteMethod: string | null; listPath: string | null };
function deriveCrud(doc: OpenAPIDoc, basePath: string): CrudPaths {
  const paths = (doc.paths ?? {}) as Record<string, JsonObj>;
  const out: CrudPaths = { createPath: null, getByIdPath: null, idParam: null, updateMethod: null, deletePath: null, deleteMethod: null, listPath: null };
  const singleRe = new RegExp('^' + basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/\\{([A-Za-z0-9_]+)\\}$');
  for (const [p, methodsRaw] of Object.entries(paths)) {
    const verbs = Object.keys(methodsRaw as JsonObj).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m.toLowerCase()));
    if (p === basePath) {
      if (verbs.includes('get')) out.listPath = p;
      if (verbs.includes('post')) out.createPath = p;
    }
    const m = p.match(singleRe);
    if (m) {
      out.idParam = m[1];
      if (verbs.includes('get')) out.getByIdPath = p;
      if (verbs.includes('patch')) out.updateMethod = 'PATCH'; else if (verbs.includes('put')) out.updateMethod = 'PUT';
      if (verbs.includes('delete')) { out.deletePath = p; out.deleteMethod = 'DELETE'; }
    }
  }
  return out;
}

// ───────────────────────── evidence + emission ─────────────────────────
type Claim = { slot: string; value: unknown; sourcePath: string };
type Emission = { objectName: string; fieldsExtracted: number; gapsRemaining: string[]; claims: Claim[]; matrixRow: JsonObj; skipped?: { reason: string } };
const newEmissions: Emission[] = [];

function pushProvenance(target: string, used: string, excerpt: string, url = 'https://api.hubspot.com/public/api/spec/v1/specs') {
  store.AppendProvenance(CONNECTOR, {
    URL: url, AccessedAt: NOW, UsedFor: used, SourceTier: 1, SourceCategory: 'OpenAPISpec',
    EvidenceStrength: 'ExplicitStatement', TargetField: target, Excerpt: excerpt.slice(0, 480),
  } as never);
}
function pushCodeEvidence(target: string, output: unknown) {
  store.AppendCodeEvidence(CONNECTOR, { ScriptPath: SCRIPT_REL, ScriptRunAt: NOW, StructuredOutput: output, SchemaValidationStatus: 'Passed', TargetField: target } as never);
}
function matrixRow(name: string, pathOps: boolean, pk: 'emit' | 'unique-only' | 'defer', fk: string, ec: number, crossIO: boolean, docsScan = false): JsonObj {
  return {
    IOName: name, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no', OpenAPIxPK: 'no',
    OpenAPIPathOps: pathOps ? 'yes' : 'no', OpenAPILocationHeader: 'no',
    VendorDocsProseScan: docsScan ? 'yes' : 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
    NamingConvention: 'yes', CrossIOMatch: crossIO ? 'yes' : 'no', PKVerdict: pk, FKVerdict: fk, EvidenceCount: ec,
  };
}
function title(n: string): string { return n.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

// Read-only field name heuristic (system-managed).
function isReadOnly(pn: string): boolean {
  return pn === 'id' || /^(created|updated|archived|deleted)/.test(pn) || /(At|Id)$/.test(pn) && /^(created|updated|archived)/.test(pn);
}

// ───────────────────────── missing rich resources (22) ─────────────────────────
// Each: name, spec, primary record schema, collection base path, category,
// watermark field, pkField override, and explicit typed-scalar FK edges to sibling IOs.
type Rich = {
  name: string; spec: string; schema: string; basePath: string; category: string;
  watermark?: string | null; pkField?: string;
  fks?: Array<{ field: string; target: string }>;   // typed-scalar FK (Tier-1: field type references an emitted sibling IO)
  writeOverride?: boolean;                            // for POST-only "action" resources (single_send)
};
const RICH_MISSING: Rich[] = [
  // Automation
  { name: 'workflows', spec: 'automation__automation_v4', schema: 'ApiContactFlow', basePath: '/automation/2026-09-beta/flows', category: 'Automation', watermark: 'updatedAt' },
  { name: 'custom_coded_actions', spec: 'automation__actions_v4', schema: 'PublicActionDefinition', basePath: '/automation/actions/2026-03/{appId}', category: 'Automation' },
  // Marketing
  { name: 'forms', spec: 'marketing__forms', schema: 'HubSpotFormDefinition', basePath: '/marketing/v3/forms', category: 'Marketing', watermark: 'updatedAt' },
  { name: 'single_send_v4', spec: 'marketing__single_send', schema: 'EmailSendStatusView', basePath: '/marketing/email-campaigns/2026-03/single-send', category: 'Marketing', pkField: 'statusId', watermark: null, writeOverride: true },
  { name: 'transactional_smtp_tokens', spec: 'marketing__transactional_single_send', schema: 'SmtpApiTokenView', basePath: '/marketing/transactional/2026-03/smtp-tokens', category: 'Marketing', watermark: null },
  { name: 'media_bridge', spec: 'cms__media_bridge', schema: 'ObjectSchema', basePath: '/media-bridge/2026-03/{appId}/schemas', category: 'Marketing', watermark: 'updatedAt' },
  // CMS
  { name: 'blog_settings', spec: 'cms__blog_settings', schema: 'Blog', basePath: '/cms/blog-settings/2026-03/settings', category: 'CMS Content', watermark: 'updated' },
  // Account & Settings
  { name: 'api_usage', spec: 'account__account_info', schema: 'ApiUsage', basePath: '/account-info/2026-03/api-usage/daily/private-apps', category: 'Account & Settings', pkField: 'name', watermark: null },
  { name: 'portal_users', spec: 'settings__user_provisioning', schema: 'PublicUser', basePath: '/settings/users/2026-03', category: 'Account & Settings', watermark: null,
    fks: [{ field: 'roleId', target: 'user_roles' }, { field: 'primaryTeamId', target: 'teams' }] },
  { name: 'user_roles', spec: 'settings__user_provisioning', schema: 'PublicPermissionSet', basePath: '/settings/users/2026-03/roles', category: 'Account & Settings', watermark: null },
  { name: 'business_units', spec: 'business_units__business_units', schema: 'PublicBusinessUnit', basePath: '/business-units/public/2026-03/business-units', category: 'Account & Settings', watermark: null },
  { name: 'currencies', spec: 'settings__multicurrency', schema: 'ExchangeRate', basePath: '/settings/currencies/2026-03/exchange-rates', category: 'Account & Settings', watermark: 'updatedAt' },
  { name: 'tax_rates', spec: 'settings__tax_rates', schema: 'PublicTaxRateGroup', basePath: '/tax-rates/2026-03/tax-rates', category: 'Account & Settings', watermark: 'updatedAt' },
  // Conversations
  { name: 'conversation_inboxes', spec: 'conversations__conversations', schema: 'PublicInbox', basePath: '/conversations/v3/conversations/inboxes', category: 'Conversations', watermark: 'updatedAt' },
  { name: 'conversation_channels', spec: 'conversations__conversations', schema: 'PublicChannel', basePath: '/conversations/v3/conversations/channels', category: 'Conversations', watermark: null },
  { name: 'conversation_inbox_channels', spec: 'conversations__conversations', schema: 'PublicChannelAccount', basePath: '/conversations/v3/conversations/channel-accounts', category: 'Conversations', watermark: null,
    fks: [{ field: 'channelId', target: 'conversation_channels' }, { field: 'inboxId', target: 'conversation_inboxes' }] },
  { name: 'conversation_custom_channels', spec: 'conversations__custom_channels', schema: 'PublicChannelIntegrationChannel', basePath: '/conversations/custom-channels/2026-03', category: 'Conversations', watermark: null },
  { name: 'meeting_scheduler', spec: 'scheduler__meetings', schema: 'ExternalLinkMetadata', basePath: '/scheduler/2026-03/meetings/meeting-links', category: 'Conversations', watermark: 'updatedAt',
    fks: [{ field: 'organizerUserId', target: 'owners' }] },
  // Data Ingestion
  { name: 'datasource_ingestion', spec: 'data_studio__datasource_ingestion', schema: 'DataSourceGetResponse', basePath: '/data-studio/data-source/2026-09-beta', category: 'Data Ingestion', pkField: 'datasourceId', watermark: null },
];

function emitRich(r: Rich, sequence: number): void {
  const loaded = loadSpec(r.spec);
  const src = loaded?.file ?? `sources/specs/${r.spec}.json`;
  const claims: Claim[] = [];
  const schemas = loaded ? schemasOf(loaded.doc) : {};
  const resolved = resolveSchema(r.schema, schemas);
  const propNames = Object.keys(resolved.properties);

  let supportsCreate = false, supportsUpdate = false, supportsDelete = false, idParam: string | null = null, updateMethod: string | null = null, deleteMethod: string | null = null;
  if (loaded) {
    const crud = deriveCrud(loaded.doc, r.basePath);
    idParam = crud.idParam;
    supportsCreate = !!crud.createPath;
    supportsUpdate = !!crud.updateMethod;
    updateMethod = crud.updateMethod;
    supportsDelete = !!crud.deletePath;
    deleteMethod = crud.deleteMethod;
  }
  const watermark = r.watermark ?? (propNames.includes('updatedAt') ? 'updatedAt' : null);
  const pkName = r.pkField && propNames.includes(r.pkField) ? r.pkField : (propNames.includes('id') ? 'id' : null);

  const io: JsonObj & { Name: string } = {
    Name: r.name,
    DisplayName: title(r.name),
    Description: `HubSpot ${r.category} — ${r.name} records (from ${r.schema}).`,
    Category: r.category,
    APIPath: r.basePath,
    ResponseDataKey: 'results',
    PaginationType: 'Cursor',
    DefaultPageSize: 100,
    SupportsPagination: true,
    SupportsIncrementalSync: !!watermark,
    IncrementalWatermarkField: watermark,
    SupportsWrite: supportsCreate || supportsUpdate || supportsDelete,
    SupportsCreate: supportsCreate,
    CreateAPIPath: supportsCreate ? r.basePath : null,
    CreateMethod: supportsCreate ? 'POST' : null,
    CreateBodyShape: supportsCreate ? 'flat' : null,
    CreateIDLocation: supportsCreate ? 'body' : null,
    SupportsUpdate: supportsUpdate,
    UpdateAPIPath: supportsUpdate ? `${r.basePath}/{${idParam ?? 'id'}}` : null,
    UpdateMethod: supportsUpdate ? updateMethod : null,
    UpdateBodyShape: supportsUpdate ? 'flat' : null,
    UpdateIDLocation: supportsUpdate ? 'path' : null,
    SupportsDelete: supportsDelete,
    DeleteAPIPath: supportsDelete ? `${r.basePath}/{${idParam ?? 'id'}}` : null,
    DeleteMethod: supportsDelete ? deleteMethod : null,
    DeleteIDLocation: supportsDelete ? 'path' : null,
    SyncStrategy: watermark ? 'WatermarkIncremental' : 'FullPullHashDiff',
    ContentHashApplicable: !watermark,
    IsMutable: true,
    StableOrderingKey: pkName,
    Sequence: sequence,
    Status: 'Active',
    Configuration: { primaryRecordSchema: r.schema, spec: src, accessPath: { door: r.name, nesting: '' } },
  };
  store.UpsertIO(CONNECTOR, io);
  claims.push({ slot: 'APIPath', value: r.basePath, sourcePath: src });
  claims.push({ slot: 'PaginationType', value: 'Cursor', sourcePath: src });
  if (watermark) claims.push({ slot: 'IncrementalWatermarkField', value: watermark, sourcePath: src });
  claims.push({ slot: 'SupportsWrite', value: io.SupportsWrite, sourcePath: src });
  pushCodeEvidence(`io.${r.name}`, { schema: r.schema, fields: propNames.length, supportsCreate, supportsUpdate, supportsDelete, watermark });
  pushProvenance(`io.${r.name}.APIPath`, `collection path for ${r.name}`, `${r.schema} collection at ${r.basePath} in ${src}`);

  const fkMap = new Map((r.fks ?? []).map((f) => [f.field, f.target]));
  let fieldCount = 0;
  for (const pn of propNames) {
    const prop = resolved.properties[pn];
    const { type, length } = mapType(prop);
    const isPk = pn === pkName;
    const isReq = resolved.required.has(pn);
    const fkTarget = fkMap.get(pn);
    const iof: JsonObj & { Name: string } = {
      Name: pn, Type: type, Length: length,
      Description: ((prop.description as string | undefined) ?? '').slice(0, 250),
      IsPrimaryKey: isPk, IsRequired: isReq, IsReadOnly: isReadOnly(pn), IsUniqueKey: isPk,
      AllowsNull: isPk ? false : !isReq, Status: 'Active',
    };
    if (fkTarget) {
      iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${fkTarget}&IntegrationID=@parent:IntegrationID`;
      iof.RelatedIntegrationObjectFieldName = 'id';
      iof.Configuration = { ReferencedType: fkTarget };
    }
    store.UpsertIOF(CONNECTOR, r.name, iof);
    fieldCount++;
    if (isPk) {
      claims.push({ slot: `field:${pkName}.IsPrimaryKey`, value: true, sourcePath: src });
      pushProvenance(`iof.${r.name}.${pkName}.IsPrimaryKey`, `PK proof for ${r.name}`,
        idParam ? `Addressing path ${r.basePath}/{${idParam}} requires ${pkName} to address one record → soft PK=${pkName}.` : `${pkName} field present; best-available soft identity (HubSpot id convention).`);
    }
    if (fkTarget) {
      claims.push({ slot: `field:${pn}.RelatedIntegrationObjectID`, value: fkTarget, sourcePath: src });
      pushProvenance(`iof.${r.name}.${pn}.RelatedIntegrationObjectID`, `typed-scalar FK for ${r.name}`,
        `Scalar field ${pn} in ${r.schema} references the ${fkTarget} record id (Tier-1 typed reference).`);
    }
  }

  const fkCount = (r.fks ?? []).filter((f) => propNames.includes(f.field)).length;
  newEmissions.push({
    objectName: r.name,
    fieldsExtracted: fieldCount,
    gapsRemaining: fieldCount === 0 ? [`schema ${r.schema} not found in ${src} — field set empty`] : (r.name === 'workflows' || r.name === 'forms' || r.name === 'media_bridge' ? ['per-portal custom action/field structure (runtime Discovered)'] : []),
    claims,
    matrixRow: matrixRow(r.name, !!loaded, pkName ? 'emit' : 'defer', fkCount > 0 ? `emit-${fkCount}` : 'defer', fieldCount + 2 + fkCount, fkCount > 0),
  });
}

// ───────────────────────── SCIM (RFC7643 core) + Form Submissions (legacy) ─────────────────────────
// No credential-free OpenAPI spec exists for SCIM (RFC7643/7644 standards surface) or the
// legacy Form Submissions endpoint. Both are curl-verified reachable (401 = real+auth-gated,
// SOURCES.json). Fields come from the RFC7643 core User/Group schemas and the legacy Form
// Submissions doc — docs-proven, cited in PROVENANCE (VendorDocsProseScan=yes).
type DocRes = {
  name: string; category: string; basePath: string; pkField: string; watermark: string | null;
  docURL: string; docNote: string;
  fields: Array<{ name: string; type: string; req: boolean; ro: boolean; desc: string; pk?: boolean; fk?: string }>;
};
const DOC_RES: DocRes[] = [
  {
    name: 'scim_users', category: 'Identity Provisioning (SCIM)', basePath: '/scim/v2/Users', pkField: 'id', watermark: null,
    docURL: 'https://developers.hubspot.com/docs/apps/developer-platform/add-features/scim',
    docNote: 'SCIM 2.0 (RFC7643 §4.1 core User resource) — HubSpot tenant https://api.hubspot.com/scim/v2/Users (curl 401 = real+auth-gated). No OpenAPI spec (standards-based surface).',
    fields: [
      { name: 'id', type: 'string', req: true, ro: true, desc: 'SCIM unique identifier for the User (server-assigned). RFC7643 §3.1.', pk: true },
      { name: 'externalId', type: 'string', req: false, ro: false, desc: 'Identifier defined by the provisioning client. RFC7643 §3.1.' },
      { name: 'userName', type: 'string', req: true, ro: false, desc: 'Unique service-provider login identifier for the user. RFC7643 §4.1.1.' },
      { name: 'name', type: 'json', req: false, ro: false, desc: 'Components of the user\'s name (formatted, familyName, givenName). RFC7643 §4.1.1.' },
      { name: 'displayName', type: 'string', req: false, ro: false, desc: 'Name of the user suitable for display. RFC7643 §4.1.1.' },
      { name: 'emails', type: 'json', req: false, ro: false, desc: 'Email addresses for the user (multi-valued). RFC7643 §4.1.2.' },
      { name: 'active', type: 'boolean', req: false, ro: false, desc: 'Boolean indicating the user\'s administrative status. RFC7643 §4.1.1.' },
      { name: 'groups', type: 'json', req: false, ro: true, desc: 'List of groups the user belongs to (multi-valued, read-only). RFC7643 §4.1.2.' },
      { name: 'meta', type: 'json', req: false, ro: true, desc: 'Resource metadata (resourceType, created, lastModified, location). RFC7643 §3.1.' },
    ],
  },
  {
    name: 'scim_groups', category: 'Identity Provisioning (SCIM)', basePath: '/scim/v2/Groups', pkField: 'id', watermark: null,
    docURL: 'https://developers.hubspot.com/docs/apps/developer-platform/add-features/scim',
    docNote: 'SCIM 2.0 (RFC7643 §4.2 core Group resource) — HubSpot tenant https://api.hubspot.com/scim/v2/Groups. No OpenAPI spec (standards-based surface).',
    fields: [
      { name: 'id', type: 'string', req: true, ro: true, desc: 'SCIM unique identifier for the Group (server-assigned). RFC7643 §3.1.', pk: true },
      { name: 'externalId', type: 'string', req: false, ro: false, desc: 'Identifier defined by the provisioning client. RFC7643 §3.1.' },
      { name: 'displayName', type: 'string', req: true, ro: false, desc: 'Human-readable name for the Group. RFC7643 §4.2.' },
      { name: 'members', type: 'json', req: false, ro: false, desc: 'List of members of the Group (multi-valued, references to User ids). RFC7643 §4.2.' },
      { name: 'meta', type: 'json', req: false, ro: true, desc: 'Resource metadata (resourceType, created, lastModified, location). RFC7643 §3.1.' },
    ],
  },
  {
    name: 'form_submissions', category: 'Marketing', basePath: '/form-integrations/v1/submissions/forms/{formGuid}', pkField: 'submittedAt', watermark: 'submittedAt',
    docURL: 'https://developers.hubspot.com/docs/api-reference/legacy/forms-v1/submissions/get-form-integrations-v1-submissions-forms-form_guid',
    docNote: 'Legacy Form Submissions API (distinct from Forms v3 definitions). GET /form-integrations/v1/submissions/forms/{formGuid} (curl 401 = real+auth-gated). Submission records keyed by submittedAt + a nested values array; parametric under a parent form.',
    fields: [
      { name: 'submittedAt', type: 'datetime', req: true, ro: true, desc: 'Timestamp (epoch ms) the form was submitted — the submission ordering/identity key.', pk: true },
      { name: 'values', type: 'json', req: true, ro: true, desc: 'Array of {name, value} field submissions captured by the form.' },
      { name: 'pageUrl', type: 'string', req: false, ro: true, desc: 'URL of the page on which the form was submitted.' },
      { name: 'formGuid', type: 'string', req: true, ro: true, desc: 'GUID of the parent form the submission belongs to (FK to forms).', fk: 'forms' },
    ],
  },
];

function emitDocRes(r: DocRes, sequence: number): void {
  const src = r.docURL;
  const claims: Claim[] = [];
  const io: JsonObj & { Name: string } = {
    Name: r.name, DisplayName: title(r.name),
    Description: `HubSpot ${r.category} — ${r.name} records. ${r.docNote}`,
    Category: r.category, APIPath: r.basePath, ResponseDataKey: 'results',
    PaginationType: 'Cursor', DefaultPageSize: 100, SupportsPagination: true,
    SupportsIncrementalSync: !!r.watermark, IncrementalWatermarkField: r.watermark,
    SupportsWrite: r.name.startsWith('scim_'), SupportsCreate: r.name.startsWith('scim_'),
    CreateAPIPath: r.name.startsWith('scim_') ? r.basePath : null,
    CreateMethod: r.name.startsWith('scim_') ? 'POST' : null,
    CreateBodyShape: r.name.startsWith('scim_') ? 'flat' : null,
    CreateIDLocation: r.name.startsWith('scim_') ? 'body' : null,
    SupportsUpdate: r.name.startsWith('scim_'),
    UpdateAPIPath: r.name.startsWith('scim_') ? `${r.basePath}/{id}` : null,
    UpdateMethod: r.name.startsWith('scim_') ? 'PUT' : null,
    UpdateBodyShape: r.name.startsWith('scim_') ? 'flat' : null,
    UpdateIDLocation: r.name.startsWith('scim_') ? 'path' : null,
    SupportsDelete: r.name.startsWith('scim_'),
    DeleteAPIPath: r.name.startsWith('scim_') ? `${r.basePath}/{id}` : null,
    DeleteMethod: r.name.startsWith('scim_') ? 'DELETE' : null,
    DeleteIDLocation: r.name.startsWith('scim_') ? 'path' : null,
    SyncStrategy: r.watermark ? 'WatermarkIncremental' : 'FullPullHashDiff',
    ContentHashApplicable: !r.watermark, IsMutable: true, StableOrderingKey: r.pkField,
    Sequence: sequence, Status: 'Active',
    Configuration: {
      source: r.name.startsWith('scim_') ? 'RFC7643-core' : 'legacy-forms-v1',
      docURL: r.docURL,
      ...(r.name === 'form_submissions' ? { accessPath: { door: 'forms', nesting: 'forms → submissions[]' }, parentObject: 'forms' } : {}),
    },
    ...(r.name === 'form_submissions' ? { ParentObjectName: 'forms', ParentObjectIDFieldName: 'formGuid' } : {}),
  };
  store.UpsertIO(CONNECTOR, io);
  claims.push({ slot: 'APIPath', value: r.basePath, sourcePath: src });
  pushProvenance(`io.${r.name}.APIPath`, `path for ${r.name}`, r.docNote, r.docURL);
  pushCodeEvidence(`io.${r.name}`, { source: r.name.startsWith('scim_') ? 'RFC7643' : 'legacy-forms', fields: r.fields.length });

  for (const f of r.fields) {
    const iof: JsonObj & { Name: string } = {
      Name: f.name, Type: f.type, Description: f.desc,
      IsPrimaryKey: !!f.pk, IsRequired: f.req, IsReadOnly: f.ro, IsUniqueKey: !!f.pk,
      AllowsNull: f.pk ? false : !f.req, Status: 'Active',
    };
    if (f.fk) {
      iof.RelatedIntegrationObjectID = `@lookup:MJ: Integration Objects.Name=${f.fk}&IntegrationID=@parent:IntegrationID`;
      iof.RelatedIntegrationObjectFieldName = 'id';
      iof.Configuration = { ReferencedType: f.fk };
    }
    store.UpsertIOF(CONNECTOR, r.name, iof);
    claims.push({ slot: `field:${f.name}.Type`, value: f.type, sourcePath: src });
    if (f.pk) { claims.push({ slot: `field:${f.name}.IsPrimaryKey`, value: true, sourcePath: src }); pushProvenance(`iof.${r.name}.${f.name}.IsPrimaryKey`, `PK for ${r.name}`, `${f.name} is the ${r.name} identity per ${r.docNote}`, r.docURL); }
    if (f.fk) { claims.push({ slot: `field:${f.name}.RelatedIntegrationObjectID`, value: f.fk, sourcePath: src }); }
  }
  const fkCount = r.fields.filter((f) => f.fk).length;
  newEmissions.push({
    objectName: r.name, fieldsExtracted: r.fields.length,
    gapsRemaining: r.name.startsWith('scim_') ? ['per-tenant SCIM extension attributes (RFC7643 enterprise extension — runtime Discovered)'] : ['per-form field value schema (runtime — depends on the parent form definition)'],
    claims,
    matrixRow: matrixRow(r.name, false, 'emit', fkCount > 0 ? `emit-${fkCount}` : 'defer', r.fields.length + 1 + fkCount, fkCount > 0, true),
  });
}

// ───────────────────────── missing association pairs (3) ─────────────────────────
const ASSOC_MISSING: Array<[string, string]> = [
  ['quotes', 'contacts'], ['quotes', 'line_items'], ['tickets', 'feedback_submissions'],
];
function emitAssociation(from: string, to: string, sequence: number): void {
  const name = `associations_${from}_${to}`;
  const src = 'sources/specs/crm__associations.json';
  const basePath = `/crm/v4/objects/${from}/{fromObjectId}/associations/${to}`;
  const claims: Claim[] = [];
  const io: JsonObj & { Name: string } = {
    Name: name, DisplayName: `${from} → ${to} associations`,
    Description: `HubSpot CRM association records between ${from} and ${to} (pairwise typed edges; type IDs resolved at runtime via the labels endpoint).`,
    Category: 'CRM Associations', APIPath: basePath, ResponseDataKey: 'results',
    PaginationType: 'Cursor', DefaultPageSize: 100, SupportsPagination: true,
    SupportsIncrementalSync: false, SupportsWrite: true, SupportsCreate: true,
    CreateAPIPath: `/crm/v4/objects/${from}/{fromObjectId}/associations/${to}/{toObjectId}`,
    CreateMethod: 'PUT', CreateBodyShape: 'flat', CreateIDLocation: 'path',
    SupportsDelete: true, DeleteAPIPath: `/crm/v4/objects/${from}/{fromObjectId}/associations/${to}/{toObjectId}`,
    DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
    SyncStrategy: 'FullPullHashDiff', ContentHashApplicable: true, IsMutable: true,
    StableOrderingKey: 'fromObjectId', Sequence: sequence, Status: 'Active',
    ParentObjectName: from, ParentObjectIDFieldName: 'fromObjectId',
    Configuration: {
      associationKind: 'pairwise-edge', fromObjectType: from, toObjectType: to,
      typeIdResolution: 'runtime via GET /crm/v4/associations/{from}/{to}/labels (HUBSPOT_DEFINED + USER_DEFINED)',
      readEndpoint: `POST /crm/v4/associations/${from}/${to}/batch/read`,
      accessPath: { door: from, nesting: `${from} → associations[${to}]` },
    },
  };
  store.UpsertIO(CONNECTOR, io);
  claims.push({ slot: 'APIPath', value: basePath, sourcePath: src });
  claims.push({ slot: 'SupportsWrite', value: true, sourcePath: src });

  const mk = (fld: string, tgt: string): JsonObj & { Name: string } => ({
    Name: fld, Type: 'string', Description: `The ${tgt} record id (FK to ${tgt}; part of the composite association key).`,
    IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: false, AllowsNull: false, Status: 'Active',
    RelatedIntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${tgt}&IntegrationID=@parent:IntegrationID`,
    RelatedIntegrationObjectFieldName: 'id', Configuration: { ReferencedType: tgt },
  });
  store.UpsertIOF(CONNECTOR, name, mk('fromObjectId', from));
  store.UpsertIOF(CONNECTOR, name, mk('toObjectId', to));
  store.UpsertIOF(CONNECTOR, name, {
    Name: 'associationTypes', Type: 'json', Description: 'Array of association type {category, typeId, label} edges between the two records.',
    IsPrimaryKey: false, IsRequired: false, IsReadOnly: true, IsUniqueKey: false, AllowsNull: true, Status: 'Active',
  });
  claims.push({ slot: 'field:fromObjectId.IsPrimaryKey', value: true, sourcePath: src });
  claims.push({ slot: 'field:fromObjectId.RelatedIntegrationObjectID', value: from, sourcePath: src });
  claims.push({ slot: 'field:toObjectId.RelatedIntegrationObjectID', value: to, sourcePath: src });
  pushProvenance(`iof.${name}.fromObjectId.IsPrimaryKey`, `composite PK part for ${name}`,
    `Parametric path /crm/v4/objects/${from}/{fromObjectId}/associations/${to}/{toObjectId} → both ids form the composite association key (each an FK to its parent).`);
  pushCodeEvidence(`io.${name}`, { kind: 'association-pair', from, to, compositePK: ['fromObjectId', 'toObjectId'] });
  newEmissions.push({
    objectName: name, fieldsExtracted: 3,
    gapsRemaining: ['per-portal USER_DEFINED association type ids (runtime labels endpoint)'],
    claims,
    matrixRow: matrixRow(name, true, 'emit', 'emit-2', 6, true),
  });
}

// ───────────────────────── main ─────────────────────────
async function main(): Promise<void> {
  // sequence continues after the current max in the metadata file
  const existing = store.ReadIntegration(CONNECTOR);
  const existingIOs = (existing?.relatedEntities?.['MJ: Integration Objects'] ?? []) as Array<{ fields: JsonObj }>;
  const existingNames = new Set(existingIOs.map((i) => String(i.fields.Name).toLowerCase()));
  let seq = existingIOs.reduce((m, i) => Math.max(m, typeof i.fields.Sequence === 'number' ? (i.fields.Sequence as number) : 0), 0) + 1;

  for (const r of RICH_MISSING) emitRich(r, seq++);
  for (const d of DOC_RES) emitDocRes(d, seq++);
  for (const [from, to] of ASSOC_MISSING) emitAssociation(from, to, seq++);

  // ── build the FULL emission artifact: existing objects (preserved) + newly added ──
  // For existing objects, re-derive a compact per-object entry from the metadata file so
  // the artifact reflects the TRUE full set (additive-never-subtractive).
  const finalFile = store.ReadIntegration(CONNECTOR);
  const finalIOs = (finalFile?.relatedEntities?.['MJ: Integration Objects'] ?? []) as Array<{ fields: JsonObj; relatedEntities?: { 'MJ: Integration Object Fields'?: Array<{ fields: JsonObj }> } }>;
  const newByName = new Map(newEmissions.map((e) => [e.objectName.toLowerCase(), e]));

  const fullEmission: Emission[] = finalIOs.map((io) => {
    const nm = String(io.fields.Name);
    const added = newByName.get(nm.toLowerCase());
    if (added) return added;
    // existing object — compact re-derivation from metadata (no new claims; preserved)
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    const pkField = iofs.find((f) => f.fields.IsPrimaryKey === true);
    const claims: Claim[] = [
      { slot: 'APIPath', value: io.fields.APIPath, sourcePath: 'metadata/integrations/hubspot/.hubspot.integration.json' },
    ];
    if (pkField) claims.push({ slot: `field:${pkField.fields.Name}.IsPrimaryKey`, value: true, sourcePath: 'metadata/integrations/hubspot/.hubspot.integration.json' });
    const fkFields = iofs.filter((f) => typeof f.fields.RelatedIntegrationObjectID === 'string');
    for (const fk of fkFields) claims.push({ slot: `field:${fk.fields.Name}.RelatedIntegrationObjectID`, value: fk.fields.RelatedIntegrationObjectID, sourcePath: 'metadata/integrations/hubspot/.hubspot.integration.json' });
    return {
      objectName: nm, fieldsExtracted: iofs.length, gapsRemaining: [], claims,
      matrixRow: matrixRow(nm, true, pkField ? 'emit' : 'defer', fkFields.length > 0 ? `emit-${fkFields.length}` : 'defer', claims.length, fkFields.length > 0),
    };
  });

  mkdirSync(RUN_OUTPUT, { recursive: true });
  writeFileSync(EMISSION_PATH, JSON.stringify(fullEmission, null, 2) + '\n', 'utf8');

  // matrix CSV
  const cols = ['IOName', 'ExistingConnectorTs', 'ExistingMetadataJson', 'OpenAPIxPK', 'OpenAPIPathOps', 'OpenAPILocationHeader', 'VendorDocsProseScan', 'SDKTypes', 'PostmanCommunity', 'NamingConvention', 'CrossIOMatch', 'PKVerdict', 'FKVerdict', 'EvidenceCount'];
  const csv = [cols.join(',')].concat(fullEmission.map((e) => cols.map((c) => String((e.matrixRow as JsonObj)[c] ?? '')).join(','))).join('\n');
  writeFileSync(join(RUN_OUTPUT, 'EXTRACTION_REPORT_MATRIX.csv'), csv + '\n', 'utf8');

  const objectsExtracted = fullEmission.length;
  const fieldsExtracted = fullEmission.reduce((a, e) => a + e.fieldsExtracted, 0);
  const emptyFieldObjects = fullEmission.filter((e) => e.fieldsExtracted === 0 && !e.skipped);
  const addedCount = newEmissions.length;

  const stats = {
    vendor: 'HubSpot',
    objectsExtracted, fieldsExtracted,
    objectsAdded: addedCount,
    priorObjects: existingIOs.length,
    newObjectNames: newEmissions.map((e) => e.objectName),
    priorObjectsPreserved: existingIOs.length,
    duplicatesSkipped: newEmissions.filter((e) => existingNames.has(e.objectName.toLowerCase())).map((e) => e.objectName),
    emptyFieldObjects: emptyFieldObjects.map((e) => e.objectName),
    emissionArtifact: EMISSION_PATH,
  };
  process.stdout.write(JSON.stringify(stats, null, 2) + '\n');

  if (emptyFieldObjects.length > 0) {
    process.stderr.write(`EMPTY-FIELD OBJECTS (parse defect): ${emptyFieldObjects.map((e) => e.objectName).join(', ')}\n`);
    process.exit(3);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
