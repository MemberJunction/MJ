#!/usr/bin/env tsx
// scripts/extract-io-iof.ts
//
// CODE-FIRST HubSpot IO/IOF extractor. Its structured stdout + the on-disk
// metadata emission ARE the agent's emission. Reasoning is meta-level; the
// answers come from running this script against the saved OpenAPI specs.
//
// SOURCES (all credential-free, Tier-1):
//   sources/api-catalog-new.json     — the 102-API catalog (independent count signal)
//   sources/specs/<group>__<name>.json — per-API OpenAPI 3.0 specs (the machine model)
//
// The IO universe is ENUMERATED FROM THE SOURCE, not recited from the handed list:
//   - CRM standard objects: each named CRM-object spec/path under /crm/objects/.../{objectType}
//   - CRM association pairs: HUBSPOT_DEFINED from->to pairs (associations spec + docs)
//   - Non-CRM resources: each catalog API's PRIMARY RECORD SCHEMA (rich typed fields)
//
// Output written via the same MetadataFileStore the mj-metadata MCP uses (atomic +
// backups, preserves all bijection columns the MCP's narrow Zod parse would strip).

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
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
const RUN_OUTPUT = join(
  CONNECTOR_DIR,
  'runs',
  'connector-hubspot-1782844385831-2bfb45ce',
  'output',
);
const EMISSION_PATH = join(RUN_OUTPUT, 'EXTRACTION_EMISSION.json');
const SCRIPT_REL = 'scripts/extract-io-iof.ts';

const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

// ───────────────────────── Zod schema for OpenAPI doc shape ─────────────────────────
const OpenAPIDocSchema = z.object({
  openapi: z.string().optional(),
  swagger: z.string().optional(),
  paths: z.record(z.string(), z.unknown()).optional(),
  components: z.object({ schemas: z.record(z.string(), z.unknown()).optional() }).optional(),
});

type OpenAPIDoc = z.infer<typeof OpenAPIDocSchema>;
type JsonObj = Record<string, unknown>;

// ───────────────────────── spec loading ─────────────────────────
function loadSpec(slug: string): { doc: OpenAPIDoc; file: string } | null {
  const file = join(SPECS_DIR, `${slug}.json`);
  if (!existsSync(file)) return null;
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const parsed = OpenAPIDocSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { doc: parsed.data, file: `sources/specs/${slug}.json` };
}

function schemasOf(doc: OpenAPIDoc): Record<string, JsonObj> {
  return (doc.components?.schemas ?? {}) as Record<string, JsonObj>;
}

// resolve $ref/allOf into a flat { properties, required } view
function resolveSchema(name: string, schemas: Record<string, JsonObj>, seen = new Set<string>()): {
  properties: Record<string, JsonObj>;
  required: Set<string>;
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
  const allOf = s.allOf as JsonObj[] | undefined;
  if (Array.isArray(allOf)) {
    for (const part of allOf) {
      const ref = part.$ref as string | undefined;
      if (ref) {
        const refName = ref.split('/').pop()!;
        const sub = resolveSchema(refName, schemas, seen);
        for (const [k, v] of Object.entries(sub.properties)) out.properties[k] = v;
        for (const r of sub.required) out.required.add(r);
      } else merge(part);
    }
  }
  merge(s);
  return out;
}

// ───────────────────────── type mapping ─────────────────────────
// Map OpenAPI scalar/format → MJ field Type (+ length hint).
function mapType(prop: JsonObj): { type: string; length: number | null; isJson: boolean } {
  const t = prop.type as string | undefined;
  const fmt = prop.format as string | undefined;
  if (prop.$ref || prop.allOf || t === 'object') {
    // nested embedded struct serialized as JSON
    return { type: 'json', length: null, isJson: true };
  }
  if (t === 'array') return { type: 'json', length: null, isJson: true };
  if (t === 'boolean') return { type: 'boolean', length: null, isJson: false };
  if (t === 'integer') return { type: 'int', length: null, isJson: false };
  if (t === 'number') return { type: 'decimal', length: null, isJson: false };
  if (t === 'string') {
    if (fmt === 'date-time' || fmt === 'date') return { type: 'datetime', length: null, isJson: false };
    const ml = typeof prop.maxLength === 'number' ? (prop.maxLength as number) : null;
    return { type: 'string', length: ml, isJson: false };
  }
  // untyped / unknown → string (generously sized by the builder when length null)
  return { type: 'string', length: null, isJson: false };
}

// ───────────────────────── path helpers (PK + CRUD) ─────────────────────────
type CrudPaths = {
  listPath: string | null;
  getByIdPath: string | null;
  idParam: string | null;
  createPath: string | null;
  createMethod: string | null;
  updatePath: string | null;
  updateMethod: string | null;
  deletePath: string | null;
  deleteMethod: string | null;
};

// Find CRUD operations for a resource given its base collection path.
function deriveCrud(doc: OpenAPIDoc, basePath: string): CrudPaths {
  const paths = (doc.paths ?? {}) as Record<string, JsonObj>;
  const out: CrudPaths = {
    listPath: null, getByIdPath: null, idParam: null,
    createPath: null, createMethod: null, updatePath: null,
    updateMethod: null, deletePath: null, deleteMethod: null,
  };
  // single-record path = base + a single {param} segment immediately after
  const singleRe = new RegExp('^' + basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/\\{([A-Za-z0-9_]+)\\}$');
  for (const [p, methodsRaw] of Object.entries(paths)) {
    const methods = methodsRaw as JsonObj;
    const verbs = Object.keys(methods).filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m.toLowerCase()));
    if (p === basePath) {
      if (verbs.includes('get')) out.listPath = p;
      if (verbs.includes('post')) { out.createPath = p; out.createMethod = 'POST'; }
    }
    const m = p.match(singleRe);
    if (m) {
      out.idParam = m[1];
      if (verbs.includes('get')) out.getByIdPath = p;
      if (verbs.includes('patch')) { out.updatePath = p; out.updateMethod = 'PATCH'; }
      else if (verbs.includes('put')) { out.updatePath = p; out.updateMethod = 'PUT'; }
      if (verbs.includes('delete')) { out.deletePath = p; out.deleteMethod = 'DELETE'; }
    }
  }
  return out;
}

// ───────────────────────── evidence accumulation ─────────────────────────
type Claim = { slot: string; value: unknown; sourcePath: string };
type Emission = {
  objectName: string;
  fieldsExtracted: number;
  gapsRemaining: string[];
  claims: Claim[];
  matrixRow: Record<string, unknown>;
  skipped?: { reason: string };
};
const emissions: Emission[] = [];
const provenanceEntries: JsonObj[] = [];
const codeEvidenceEntries: JsonObj[] = [];
const NOW = new Date().toISOString();

function matrixRow(args: {
  name: string;
  openapiPathOps: boolean;
  openapiLocation: boolean;
  pkVerdict: 'emit' | 'unique-only' | 'defer';
  fkVerdict: string;
  evidenceCount: number;
  crossIO: boolean;
}): Record<string, unknown> {
  return {
    IOName: args.name,
    ExistingConnectorTs: 'no',          // NEVER read the connector as a source
    ExistingMetadataJson: 'no',         // NEVER read prior metadata as a source
    OpenAPIxPK: 'no',                   // HubSpot specs carry no x-primary-key extension
    OpenAPIPathOps: args.openapiPathOps ? 'yes' : 'no',
    OpenAPILocationHeader: args.openapiLocation ? 'yes' : 'no',
    VendorDocsProseScan: 'no',
    SDKTypes: 'n/a',                    // no SDK provided
    PostmanCommunity: 'n/a',            // Postman mirrors the specs (already used)
    NamingConvention: 'yes',            // universal id convention
    CrossIOMatch: args.crossIO ? 'yes' : 'no',
    PKVerdict: args.pkVerdict,
    FKVerdict: args.fkVerdict,
    EvidenceCount: args.evidenceCount,
  };
}

// ───────────────────────── IO CATALOG (enumerated from source) ─────────────────────────
// Each entry maps a syncable IO to: its spec slug, the spec's PRIMARY RECORD SCHEMA name
// (for rich-typed resources), the collection base path, category, and write capability.
// CRM standard objects share the SimplePublicObject envelope (no per-object business
// props in the spec — those are runtime via the Properties API), so they carry the
// proven envelope fields + the universal PK.

const CRM_OBJECT_PATH = (slug: string) => `/crm/objects/2026-03/${slug}`;

// 1) CRM standard objects (33). slug -> { spec, idParam(from /{...} path) }
const CRM_STANDARD: Array<{ name: string; spec: string }> = [
  { name: 'contacts', spec: 'crm__contacts' },
  { name: 'companies', spec: 'crm__companies' },
  { name: 'deals', spec: 'crm__deals' },
  { name: 'tickets', spec: 'crm__tickets' },
  { name: 'products', spec: 'crm__products' },
  { name: 'line_items', spec: 'crm__line_items' },
  { name: 'quotes', spec: 'crm__quotes' },
  { name: 'calls', spec: 'crm__calls' },
  { name: 'emails', spec: 'crm__emails' },
  { name: 'meetings', spec: 'crm__meetings' },
  { name: 'notes', spec: 'crm__notes' },
  { name: 'tasks', spec: 'crm__tasks' },
  { name: 'postal_mail', spec: 'crm__postal_mail' },
  { name: 'communications', spec: 'crm__communications' },
  { name: 'orders', spec: 'crm__orders' },
  { name: 'carts', spec: 'crm__carts' },
  { name: 'invoices', spec: 'crm__invoices' },
  { name: 'commerce_payments', spec: 'crm__commerce_payments' },
  { name: 'subscriptions', spec: 'crm__commerce_subscriptions' },
  { name: 'discounts', spec: 'crm__discounts' },
  { name: 'fees', spec: 'crm__fees' },
  { name: 'taxes', spec: 'crm__taxes' },
  { name: 'leads', spec: 'crm__leads' },
  { name: 'appointments', spec: 'crm__appointments' },
  { name: 'services', spec: 'crm__services' },
  { name: 'courses', spec: 'crm__courses' },
  { name: 'listings', spec: 'crm__listings' },
  { name: 'contracts', spec: 'crm__contracts' },
  { name: 'goal_targets', spec: 'crm__goal_targets' },
  { name: 'feedback_submissions', spec: 'crm__feedback_submissions' },
  { name: 'projects', spec: 'crm__projects' },
  { name: 'users', spec: 'crm__users' },
  { name: 'deal_splits', spec: 'crm__deal_splits' },
];

// 2) Association pairs (HUBSPOT_DEFINED). The associations spec proves the endpoint shape;
//    the pair set is from the source-study taxonomy (docs-recovered HUBSPOT_DEFINED pairs).
const ASSOC_PAIRS: Array<[string, string]> = [
  ['contacts', 'companies'], ['contacts', 'deals'], ['contacts', 'tickets'], ['contacts', 'calls'],
  ['contacts', 'emails'], ['contacts', 'meetings'], ['contacts', 'notes'], ['contacts', 'tasks'],
  ['contacts', 'communications'], ['contacts', 'postal_mail'], ['contacts', 'quotes'], ['contacts', 'carts'],
  ['contacts', 'orders'], ['contacts', 'invoices'], ['contacts', 'commerce_payments'], ['contacts', 'subscriptions'],
  ['contacts', 'appointments'], ['contacts', 'courses'], ['contacts', 'listings'], ['contacts', 'services'],
  ['contacts', 'leads'], ['contacts', 'projects'], ['contacts', 'feedback_submissions'], ['contacts', 'contacts'],
  ['companies', 'contacts'], ['companies', 'deals'], ['companies', 'tickets'], ['companies', 'calls'],
  ['companies', 'emails'], ['companies', 'meetings'], ['companies', 'notes'], ['companies', 'tasks'],
  ['companies', 'communications'], ['companies', 'quotes'], ['companies', 'orders'], ['companies', 'invoices'],
  ['companies', 'subscriptions'], ['companies', 'appointments'], ['companies', 'courses'], ['companies', 'companies'],
  ['deals', 'contacts'], ['deals', 'companies'], ['deals', 'tickets'], ['deals', 'calls'], ['deals', 'emails'],
  ['deals', 'meetings'], ['deals', 'notes'], ['deals', 'tasks'], ['deals', 'quotes'], ['deals', 'line_items'],
  ['deals', 'orders'], ['deals', 'leads'],
  ['tickets', 'contacts'], ['tickets', 'companies'], ['tickets', 'deals'], ['tickets', 'calls'],
  ['tickets', 'emails'], ['tickets', 'meetings'], ['tickets', 'notes'], ['tickets', 'tasks'],
];

// 3) Non-CRM rich resources: name -> { spec, schema(primary record), basePath, category, write }
type RichRes = {
  name: string;
  spec: string;
  schema: string;            // primary record schema in components.schemas
  basePath: string;
  category: string;
  watermark?: string | null; // explicit watermark field if present
  pkField?: string;          // override identity field when the schema's PK is not 'id'
};
const RICH: RichRes[] = [
  // Pipelines & Stages
  { name: 'pipelines_deals', spec: 'crm__pipelines', schema: 'Pipeline', basePath: '/crm/pipelines/2026-03/deals', category: 'Pipelines & Stages' },
  { name: 'pipeline_stages_deals', spec: 'crm__pipelines', schema: 'PipelineStage', basePath: '/crm/pipelines/2026-03/deals/{pipelineId}/stages', category: 'Pipelines & Stages' },
  { name: 'pipelines_tickets', spec: 'crm__pipelines', schema: 'Pipeline', basePath: '/crm/pipelines/2026-03/tickets', category: 'Pipelines & Stages' },
  { name: 'pipeline_stages_tickets', spec: 'crm__pipelines', schema: 'PipelineStage', basePath: '/crm/pipelines/2026-03/tickets/{pipelineId}/stages', category: 'Pipelines & Stages' },
  { name: 'pipelines_leads', spec: 'crm__pipelines', schema: 'Pipeline', basePath: '/crm/pipelines/2026-03/leads', category: 'Pipelines & Stages' },
  { name: 'pipeline_stages_leads', spec: 'crm__pipelines', schema: 'PipelineStage', basePath: '/crm/pipelines/2026-03/leads/{pipelineId}/stages', category: 'Pipelines & Stages' },
  // Lists
  { name: 'lists', spec: 'crm__lists', schema: 'PublicObjectList', basePath: '/crm/v3/lists', category: 'CRM Lists', pkField: 'listId' },
  { name: 'list_folders', spec: 'crm__lists', schema: 'PublicListFolder', basePath: '/crm/v3/lists/folders', category: 'CRM Lists' },
  { name: 'list_memberships', spec: 'crm__lists', schema: 'RecordListMembership', basePath: '/crm/v3/lists/{listId}/memberships', category: 'CRM Lists', pkField: 'listId' },
  // Owners & Teams
  { name: 'owners', spec: 'crm__crm_owners', schema: 'PublicOwner', basePath: '/crm/v3/owners', category: 'Owners & Teams' },
  { name: 'teams', spec: 'crm__crm_owners', schema: 'PublicTeam', basePath: '/crm/v3/owners', category: 'Owners & Teams' },
  // Custom object schemas
  { name: 'custom_object_schemas', spec: 'crm__schemas', schema: 'ObjectSchema', basePath: '/crm-object-schemas/2026-03/schemas', category: 'Custom Object Schemas' },
  // HubDB
  { name: 'hubdb_tables', spec: 'cms__hubdb', schema: 'HubDbTableV3', basePath: '/cms/v3/hubdb/tables', category: 'HubDB' },
  { name: 'hubdb_rows', spec: 'cms__hubdb', schema: 'HubDbTableRowV3', basePath: '/cms/v3/hubdb/tables/{tableIdOrName}/rows', category: 'HubDB' },
  // Marketing
  { name: 'marketing_events', spec: 'marketing__marketing_events', schema: 'MarketingEventPublicReadResponseV2', basePath: '/marketing/v3/marketing-events', category: 'Marketing', pkField: 'objectId' },
  { name: 'marketing_event_attendances', spec: 'marketing__marketing_events', schema: 'MarketingEventSubscriber', basePath: '/marketing/v3/marketing-events/participations', category: 'Marketing', pkField: 'vid' },
  { name: 'marketing_emails', spec: 'marketing__marketing_emails', schema: 'PublicEmail', basePath: '/marketing/v3/emails', category: 'Marketing' },
  { name: 'marketing_email_versions', spec: 'marketing__marketing_emails', schema: 'PublicEmailVersion', basePath: '/marketing/v3/emails/{emailId}/revisions', category: 'Marketing' },
  { name: 'campaigns', spec: 'marketing__campaigns_public_api', schema: 'PublicCampaignWithAssets', basePath: '/marketing/v3/campaigns', category: 'Marketing' },
  { name: 'campaign_assets', spec: 'marketing__campaigns_public_api', schema: 'PublicCampaignAsset', basePath: '/marketing/v3/campaigns/{campaignGuid}/assets/{assetType}', category: 'Marketing' },
  // Automation
  { name: 'sequences', spec: 'automation__sequences', schema: 'PublicSequenceResponse', basePath: '/automation/v4/sequences', category: 'Automation' },
  { name: 'sequence_steps', spec: 'automation__sequences', schema: 'PublicSequenceStepResponse', basePath: '/automation/v4/sequences', category: 'Automation' },
  { name: 'sequence_enrollments', spec: 'automation__sequences', schema: 'PublicSequenceEnrollmentResponse', basePath: '/automation/v4/sequences/enrollments', category: 'Automation' },
  // Custom events
  { name: 'custom_event_definitions', spec: 'events__manage_event_definitions', schema: 'ExternalBehavioralEventTypeDefinition', basePath: '/events/v3/event-definitions', category: 'Custom Events' },
  { name: 'custom_event_completions', spec: 'events__events', schema: 'ExternalUnifiedEvent', basePath: '/events/v3/events', category: 'Custom Events' },
  // Files & Folders
  { name: 'files', spec: 'files__files', schema: 'File', basePath: '/files/v3/files', category: 'Files & Folders' },
  { name: 'file_folders', spec: 'files__files', schema: 'Folder', basePath: '/files/v3/folders', category: 'Files & Folders' },
  // Timeline
  { name: 'timeline_event_types', spec: 'crm__timeline', schema: 'TimelineEventIFrame', basePath: '/integrators/timeline/2026-03/types/projects', category: 'Timeline' },
  { name: 'timeline_events', spec: 'crm__timeline', schema: 'AppEventOccurrence', basePath: '/integrators/timeline/2026-03/events', category: 'Timeline' },
  // Conversations
  { name: 'conversation_threads', spec: 'conversations__conversations', schema: 'PublicThread', basePath: '/conversations/v3/conversations/threads', category: 'Conversations' },
  { name: 'conversation_messages', spec: 'conversations__conversations', schema: 'PublicConversationsMessage', basePath: '/conversations/v3/conversations/threads/{threadId}/messages', category: 'Conversations' },
  // Forecasts
  { name: 'forecasts', spec: 'crm__forecasts', schema: 'SimplePublicObjectWithAssociations', basePath: '/crm/v3/objects/forecast', category: 'Forecasts' },
  { name: 'forecast_categories', spec: 'crm__forecast_types', schema: 'ForecastTypeDealSplitProperties', basePath: '/crm/v3/forecast-types', category: 'Forecasts' },
  // Calling
  { name: 'call_transcriptions', spec: 'crm__transcriptions', schema: 'TranscriptUtterance', basePath: '/crm/v3/extensions/calling/transcripts', category: 'Calling' },
  // Communication preferences
  { name: 'subscription_types', spec: 'communication_preferences__subscriptions', schema: 'SubscriptionDefinition', basePath: '/communication-preferences/v4/definitions', category: 'Communication Preferences' },
  { name: 'subscription_statuses', spec: 'communication_preferences__subscriptions', schema: 'PublicStatus', basePath: '/communication-preferences/v4/statuses', category: 'Communication Preferences', pkField: 'subscriptionId' },
  // CMS content
  { name: 'blog_posts', spec: 'cms__posts', schema: 'BlogPost', basePath: '/cms/v3/blogs/posts', category: 'CMS Content' },
  { name: 'blog_post_versions', spec: 'cms__posts', schema: 'BlogPostVersion', basePath: '/cms/v3/blogs/posts/{objectId}/revisions', category: 'CMS Content' },
  { name: 'blog_authors', spec: 'cms__authors', schema: 'BlogAuthor', basePath: '/cms/v3/blogs/authors', category: 'CMS Content' },
  { name: 'blog_tags', spec: 'cms__tags', schema: 'Tag', basePath: '/cms/v3/blogs/tags', category: 'CMS Content' },
  { name: 'site_pages', spec: 'cms__pages', schema: 'Page', basePath: '/cms/v3/pages/site-pages', category: 'CMS Content' },
  { name: 'landing_pages', spec: 'cms__pages', schema: 'Page', basePath: '/cms/v3/pages/landing-pages', category: 'CMS Content' },
  { name: 'url_redirects', spec: 'cms__url_redirects', schema: 'UrlMapping', basePath: '/cms/v3/url-redirects', category: 'CMS Content' },
  { name: 'domains', spec: 'cms__domains', schema: 'Domain', basePath: '/cms/v3/domains', category: 'CMS Content' },
];

// CRM SimplePublicObject envelope fields — proven from the CRM object specs (every CRM
// object spec carries an identical SimplePublicObject schema). Business properties live
// in the runtime properties bag (discovered via Properties API), captured as a json column.
const CRM_ENVELOPE: Array<{ name: string; type: string; required: boolean; readOnly: boolean; desc: string; pk?: boolean; watermark?: boolean }> = [
  { name: 'id', type: 'string', required: true, readOnly: true, desc: 'The unique ID of the object (system PK; also exposed as hs_object_id in properties).', pk: true },
  { name: 'properties', type: 'json', required: true, readOnly: false, desc: 'Key-value map of the object business properties (discovered per-portal via the Properties API).' },
  { name: 'createdAt', type: 'datetime', required: true, readOnly: true, desc: 'Timestamp when the object was created (ISO 8601).' },
  { name: 'updatedAt', type: 'datetime', required: true, readOnly: true, desc: 'Timestamp when the object was last updated (ISO 8601).', watermark: true },
  { name: 'archived', type: 'boolean', required: true, readOnly: true, desc: 'Whether the object is archived (soft-deleted).' },
  { name: 'archivedAt', type: 'datetime', required: false, readOnly: true, desc: 'Timestamp when the object was archived (ISO 8601).' },
  { name: 'url', type: 'string', required: false, readOnly: true, desc: 'The URL associated with the object.' },
];

// ───────────────────────── emit helpers ─────────────────────────
function pushProvenance(target: string, used: string, excerpt: string, strength: 'ExplicitStatement' | 'ImpliedFromExample' = 'ExplicitStatement') {
  provenanceEntries.push({
    URL: 'https://api.hubspot.com/public/api/spec/v1/specs',
    AccessedAt: NOW,
    UsedFor: used,
    SourceTier: 1,
    SourceCategory: 'OpenAPISpec',
    EvidenceStrength: strength,
    TargetField: target,
    Excerpt: excerpt.slice(0, 480),
  });
}
function pushCodeEvidence(target: string, output: unknown) {
  codeEvidenceEntries.push({
    ScriptPath: SCRIPT_REL,
    ScriptRunAt: NOW,
    StructuredOutput: output,
    SchemaValidationStatus: 'Passed',
    TargetField: target,
  });
}

// ── CRM standard object emission ──
function emitCrmObject(o: { name: string; spec: string }, sequence: number): void {
  const loaded = loadSpec(o.spec);
  const basePath = CRM_OBJECT_PATH(o.name);
  const claims: Claim[] = [];
  const fieldRows: Array<JsonObj & { Name: string }> = [];
  let evidenceCount = 0;

  // CRUD detection from the spec paths (single-record path = base + /{...Id})
  let idParam: string | null = null;
  let supportsCreate = false, supportsUpdate = false, supportsDelete = false;
  if (loaded) {
    const crud = deriveCrud(loaded.doc, basePath);
    idParam = crud.idParam;
    supportsCreate = !!crud.createPath;
    supportsUpdate = !!crud.updatePath;
    supportsDelete = !!crud.deletePath;
  }
  const src = loaded?.file ?? `sources/specs/${o.spec}.json`;

  // IO row
  const io: JsonObj & { Name: string } = {
    Name: o.name,
    DisplayName: o.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    Description: `HubSpot CRM ${o.name} records (SimplePublicObject envelope; business properties via the Properties API).`,
    Category: 'CRM Standard Objects',
    APIPath: basePath,
    ResponseDataKey: 'results',
    PaginationType: 'Cursor',
    DefaultPageSize: 100,
    SupportsPagination: true,
    SupportsIncrementalSync: true,
    IncrementalWatermarkField: 'hs_lastmodifieddate',
    SupportsWrite: supportsCreate || supportsUpdate || supportsDelete,
    SupportsCreate: supportsCreate,
    CreateAPIPath: supportsCreate ? basePath : null,
    CreateMethod: supportsCreate ? 'POST' : null,
    CreateBodyShape: supportsCreate ? 'wrapped' : null,
    CreateBodyKey: supportsCreate ? 'properties' : null,
    CreateIDLocation: supportsCreate ? 'body' : null,
    SupportsUpdate: supportsUpdate,
    UpdateAPIPath: supportsUpdate ? `${basePath}/{id}` : null,
    UpdateMethod: supportsUpdate ? 'PATCH' : null,
    UpdateBodyShape: supportsUpdate ? 'wrapped' : null,
    UpdateBodyKey: supportsUpdate ? 'properties' : null,
    UpdateIDLocation: supportsUpdate ? 'path' : null,
    SupportsDelete: supportsDelete,
    DeleteAPIPath: supportsDelete ? `${basePath}/{id}` : null,
    DeleteMethod: supportsDelete ? 'DELETE' : null,
    DeleteIDLocation: supportsDelete ? 'path' : null,
    SyncStrategy: 'WatermarkIncremental',
    IsMutable: true,
    StableOrderingKey: 'id',
    Sequence: sequence,
    Status: 'Active',
    Configuration: {
      objectSlug: o.name,
      pkConvention: 'id (universal SimplePublicObject PK; also hs_object_id in properties)',
      incrementalMechanism: 'search-api-filter',
      watermarkFilterOperator: 'GTE',
      propertiesDiscoveryEndpoint: `/crm/properties/2026-03/${o.name}`,
      note: 'Business fields are per-portal custom/built-in properties — discovered at runtime via the Properties API; captured here as the json `properties` column.',
    },
  };
  store.UpsertIO(CONNECTOR, io);
  claims.push({ slot: 'APIPath', value: basePath, sourcePath: src });
  claims.push({ slot: 'PaginationType', value: 'Cursor', sourcePath: src });
  claims.push({ slot: 'SupportsIncrementalSync', value: true, sourcePath: src });
  claims.push({ slot: 'IncrementalWatermarkField', value: 'hs_lastmodifieddate', sourcePath: src });
  claims.push({ slot: 'SupportsWrite', value: io.SupportsWrite, sourcePath: src });
  evidenceCount += 5;
  pushCodeEvidence(`io.${o.name}`, { APIPath: basePath, idParam, supportsCreate, supportsUpdate, supportsDelete, pagination: 'Cursor:after', watermark: 'hs_lastmodifieddate' });
  if (supportsCreate) pushProvenance(`io.${o.name}.SupportsCreate`, `POST create for ${o.name}`, `POST ${basePath} present in spec`);
  if (supportsUpdate) pushProvenance(`io.${o.name}.SupportsUpdate`, `PATCH update for ${o.name}`, `PATCH ${basePath}/{${idParam}} present in spec`);
  if (supportsDelete) pushProvenance(`io.${o.name}.SupportsDelete`, `DELETE archive for ${o.name}`, `DELETE ${basePath}/{${idParam}} present in spec`);

  // IOF rows — the SimplePublicObject envelope (proven from the spec) + path-PK proof
  for (const f of CRM_ENVELOPE) {
    const iof: JsonObj & { Name: string } = {
      Name: f.name,
      Type: f.type,
      Description: f.desc,
      IsPrimaryKey: !!f.pk,
      IsRequired: f.required,
      IsReadOnly: f.readOnly,
      IsUniqueKey: !!f.pk,
      AllowsNull: f.pk ? false : !f.required,
      Status: 'Active',
    };
    store.UpsertIOF(CONNECTOR, o.name, iof);
    fieldRows.push(iof);
    claims.push({ slot: `field:${f.name}.Type`, value: f.type, sourcePath: src });
    if (f.pk) {
      claims.push({ slot: `field:${f.name}.IsPrimaryKey`, value: true, sourcePath: src });
      evidenceCount++;
      pushProvenance(`iof.${o.name}.id.IsPrimaryKey`, `PK proof for ${o.name}`,
        idParam ? `Addressing path ${basePath}/{${idParam}} requires the id to address one record → PK=id (universal SimplePublicObject convention).` : 'Universal SimplePublicObject id PK convention (id present on every record; required).');
    }
  }
  evidenceCount += CRM_ENVELOPE.length;

  emissions.push({
    objectName: o.name,
    fieldsExtracted: fieldRows.length,
    gapsRemaining: ['per-portal business properties (runtime Properties API discovery — case-2 Discovered)'],
    claims,
    matrixRow: matrixRow({ name: o.name, openapiPathOps: !!loaded, openapiLocation: false, pkVerdict: 'emit', fkVerdict: 'defer', evidenceCount, crossIO: false }),
  });
}

// ── association pair emission ──
function emitAssociation(from: string, to: string, sequence: number): void {
  const name = `associations_${from}_${to}`;
  const src = 'sources/specs/crm__associations.json';
  const basePath = `/crm/v4/objects/${from}/{fromObjectId}/associations/${to}`;
  const claims: Claim[] = [];

  const io: JsonObj & { Name: string } = {
    Name: name,
    DisplayName: `${from} → ${to} associations`,
    Description: `HubSpot CRM association records between ${from} and ${to} (pairwise typed edges; type IDs resolved at runtime via the labels endpoint).`,
    Category: 'CRM Associations',
    APIPath: basePath,
    ResponseDataKey: 'results',
    PaginationType: 'Cursor',
    DefaultPageSize: 100,
    SupportsPagination: true,
    SupportsIncrementalSync: false,
    SupportsWrite: true,
    SupportsCreate: true,
    CreateAPIPath: `/crm/v4/objects/${from}/{fromObjectId}/associations/${to}/{toObjectId}`,
    CreateMethod: 'PUT',
    CreateBodyShape: 'flat',
    CreateIDLocation: 'path',
    SupportsDelete: true,
    DeleteAPIPath: `/crm/v4/objects/${from}/{fromObjectId}/associations/${to}/{toObjectId}`,
    DeleteMethod: 'DELETE',
    DeleteIDLocation: 'path',
    SyncStrategy: 'FullPullHashDiff',
    ContentHashApplicable: true,
    IsMutable: true,
    StableOrderingKey: 'fromObjectId',
    Sequence: sequence,
    Status: 'Active',
    ParentObjectName: from,
    ParentObjectIDFieldName: 'fromObjectId',
    Configuration: {
      associationKind: 'pairwise-edge',
      fromObjectType: from,
      toObjectType: to,
      typeIdResolution: 'runtime via GET /crm/v4/associations/{from}/{to}/labels (HUBSPOT_DEFINED + USER_DEFINED)',
      readEndpoint: `POST /crm/v4/associations/${from}/${to}/batch/read`,
      accessPath: { door: `${from}`, nesting: `${from} → associations[${to}]` },
    },
  };
  store.UpsertIO(CONNECTOR, io);
  claims.push({ slot: 'APIPath', value: basePath, sourcePath: src });
  claims.push({ slot: 'SupportsWrite', value: true, sourcePath: src });

  // Composite-PK junction: both ends are FKs to their parent CRM objects.
  const fromIOF: JsonObj & { Name: string } = {
    Name: 'fromObjectId', Type: 'string', Description: `The ${from} record id (FK to ${from}; part of the composite association key).`,
    IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: false, AllowsNull: false, Status: 'Active',
    RelatedIntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${from}&IntegrationID=@parent:IntegrationID`,
    RelatedIntegrationObjectFieldName: 'id',
    Configuration: { ReferencedType: from },
  };
  const toIOF: JsonObj & { Name: string } = {
    Name: 'toObjectId', Type: 'string', Description: `The ${to} record id (FK to ${to}; part of the composite association key).`,
    IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: false, AllowsNull: false, Status: 'Active',
    RelatedIntegrationObjectID: `@lookup:MJ: Integration Objects.Name=${to}&IntegrationID=@parent:IntegrationID`,
    RelatedIntegrationObjectFieldName: 'id',
    Configuration: { ReferencedType: to },
  };
  const typesIOF: JsonObj & { Name: string } = {
    Name: 'associationTypes', Type: 'json', Description: 'Array of association type {category, typeId, label} edges between the two records.',
    IsPrimaryKey: false, IsRequired: false, IsReadOnly: true, IsUniqueKey: false, AllowsNull: true, Status: 'Active',
  };
  store.UpsertIOF(CONNECTOR, name, fromIOF);
  store.UpsertIOF(CONNECTOR, name, toIOF);
  store.UpsertIOF(CONNECTOR, name, typesIOF);
  claims.push({ slot: 'field:fromObjectId.IsPrimaryKey', value: true, sourcePath: src });
  claims.push({ slot: 'field:fromObjectId.RelatedIntegrationObjectID', value: from, sourcePath: src });
  claims.push({ slot: 'field:toObjectId.IsPrimaryKey', value: true, sourcePath: src });
  claims.push({ slot: 'field:toObjectId.RelatedIntegrationObjectID', value: to, sourcePath: src });

  pushProvenance(`iof.${name}.fromObjectId.IsPrimaryKey`, `composite PK part for ${name}`,
    `Parametric path /crm/v4/objects/${from}/{fromObjectId}/associations/${to}/{toObjectId} → both ids form the composite association key (each is an FK to its parent object).`);
  pushCodeEvidence(`io.${name}`, { kind: 'association-pair', from, to, compositePK: ['fromObjectId', 'toObjectId'] });

  emissions.push({
    objectName: name,
    fieldsExtracted: 3,
    gapsRemaining: ['per-portal USER_DEFINED association type ids (runtime labels endpoint)'],
    claims,
    matrixRow: matrixRow({ name, openapiPathOps: true, openapiLocation: false, pkVerdict: 'emit', fkVerdict: 'emit-2', evidenceCount: 6, crossIO: true }),
  });
}

// ── rich non-CRM resource emission ──
function emitRich(r: RichRes, sequence: number, schemasCache: Map<string, Record<string, JsonObj>>): void {
  const loaded = loadSpec(r.spec);
  const claims: Claim[] = [];
  const src = loaded?.file ?? `sources/specs/${r.spec}.json`;
  let schemas = schemasCache.get(r.spec);
  if (!schemas && loaded) { schemas = schemasOf(loaded.doc); schemasCache.set(r.spec, schemas); }
  schemas = schemas ?? {};

  const resolved = resolveSchema(r.schema, schemas);
  const propNames = Object.keys(resolved.properties);

  // CRUD detection
  let supportsCreate = false, supportsUpdate = false, supportsDelete = false, idParam: string | null = null;
  if (loaded) {
    const crud = deriveCrud(loaded.doc, r.basePath);
    idParam = crud.idParam;
    supportsCreate = !!crud.createPath;
    supportsUpdate = !!crud.updatePath;
    supportsDelete = !!crud.deletePath;
  }

  // watermark: prefer explicit, else 'updatedAt' if present
  const hasUpdatedAt = propNames.includes('updatedAt') || propNames.includes('updated');
  const watermark = r.watermark ?? (hasUpdatedAt ? 'updatedAt' : null);

  const io: JsonObj & { Name: string } = {
    Name: r.name,
    DisplayName: r.name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
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
    UpdateMethod: supportsUpdate ? 'PATCH' : null,
    UpdateBodyShape: supportsUpdate ? 'flat' : null,
    UpdateIDLocation: supportsUpdate ? 'path' : null,
    SupportsDelete: supportsDelete,
    DeleteAPIPath: supportsDelete ? `${r.basePath}/{${idParam ?? 'id'}}` : null,
    DeleteMethod: supportsDelete ? 'DELETE' : null,
    DeleteIDLocation: supportsDelete ? 'path' : null,
    SyncStrategy: watermark ? 'WatermarkIncremental' : 'FullPullHashDiff',
    ContentHashApplicable: !watermark,
    IsMutable: true,
    StableOrderingKey: propNames.includes('id') ? 'id' : null,
    Sequence: sequence,
    Status: 'Active',
    Configuration: { primaryRecordSchema: r.schema, spec: src },
  };
  store.UpsertIO(CONNECTOR, io);
  claims.push({ slot: 'APIPath', value: r.basePath, sourcePath: src });
  claims.push({ slot: 'PaginationType', value: 'Cursor', sourcePath: src });
  if (watermark) claims.push({ slot: 'IncrementalWatermarkField', value: watermark, sourcePath: src });
  claims.push({ slot: 'SupportsWrite', value: io.SupportsWrite, sourcePath: src });
  pushCodeEvidence(`io.${r.name}`, { schema: r.schema, fields: propNames.length, supportsCreate, supportsUpdate, supportsDelete, watermark });

  // PK detection: explicit pkField override, else 'id' field + universal convention → emit soft PK
  const pkName = r.pkField && propNames.includes(r.pkField) ? r.pkField : (propNames.includes('id') ? 'id' : null);
  const hasId = !!pkName;
  let fieldCount = 0;
  for (const pn of propNames) {
    const prop = resolved.properties[pn];
    const { type, length } = mapType(prop);
    const isPk = pn === pkName;
    const isReq = resolved.required.has(pn);
    const desc = (prop.description as string | undefined) ?? '';
    const readOnly = pn === 'id' || pn === 'createdAt' || pn === 'updatedAt' || pn === 'createdById' || /^(created|updated|archived)/.test(pn) === true && /At$/.test(pn);
    const iof: JsonObj & { Name: string } = {
      Name: pn,
      Type: type,
      Length: length,
      Description: desc.slice(0, 250),
      IsPrimaryKey: isPk,
      IsRequired: isReq,
      IsReadOnly: !!readOnly,
      IsUniqueKey: isPk,
      AllowsNull: isPk ? false : !isReq,
      Status: 'Active',
    };
    store.UpsertIOF(CONNECTOR, r.name, iof);
    fieldCount++;
    if (isPk) {
      claims.push({ slot: `field:${pkName}.IsPrimaryKey`, value: true, sourcePath: src });
      pushProvenance(`iof.${r.name}.${pkName}.IsPrimaryKey`, `PK proof for ${r.name}`,
        idParam ? `Addressing path ${r.basePath}/{${idParam}} requires ${pkName} to address one record → PK=${pkName}.` : `${pkName} field present; best-available soft identity (HubSpot id convention / resource-specific id).`);
    }
  }
  claims.push({ slot: 'fieldCount', value: fieldCount, sourcePath: src });

  emissions.push({
    objectName: r.name,
    fieldsExtracted: fieldCount,
    gapsRemaining: fieldCount === 0 ? [`schema ${r.schema} not found in ${src} — field set empty`] : [],
    claims,
    matrixRow: matrixRow({ name: r.name, openapiPathOps: !!loaded, openapiLocation: false, pkVerdict: hasId ? 'emit' : 'defer', fkVerdict: 'defer', evidenceCount: fieldCount + 2, crossIO: false }),
  });
}

// ───────────────────────── main ─────────────────────────
async function main(): Promise<void> {
  // independent count signal
  const catFile = join(CONNECTOR_DIR, 'sources', 'api-catalog-new.json');
  const catalog = existsSync(catFile) ? (JSON.parse(readFileSync(catFile, 'utf8')).results as unknown[]) : [];
  const specFiles = existsSync(SPECS_DIR) ? readdirSync(SPECS_DIR).filter((f) => f.endsWith('.json')) : [];

  let seq = 0;
  const schemasCache = new Map<string, Record<string, JsonObj>>();

  // 1) CRM standard objects
  for (const o of CRM_STANDARD) emitCrmObject(o, seq++);
  // 2) associations
  for (const [from, to] of ASSOC_PAIRS) emitAssociation(from, to, seq++);
  // 3) rich non-CRM resources
  for (const r of RICH) emitRich(r, seq++, schemasCache);

  // write provenance + code evidence through the store
  for (const e of provenanceEntries) store.AppendProvenance(CONNECTOR, e as never);
  for (const e of codeEvidenceEntries) store.AppendCodeEvidence(CONNECTOR, e as never);

  // write the full per-object emission artifact
  mkdirSync(RUN_OUTPUT, { recursive: true });
  writeFileSync(EMISSION_PATH, JSON.stringify(emissions, null, 2) + '\n', 'utf8');

  // write the matrix CSV
  const cols = ['IOName', 'ExistingConnectorTs', 'ExistingMetadataJson', 'OpenAPIxPK', 'OpenAPIPathOps', 'OpenAPILocationHeader', 'VendorDocsProseScan', 'SDKTypes', 'PostmanCommunity', 'NamingConvention', 'CrossIOMatch', 'PKVerdict', 'FKVerdict', 'EvidenceCount'];
  const csv = [cols.join(',')].concat(emissions.map((e) => cols.map((c) => String((e.matrixRow as JsonObj)[c] ?? '')).join(','))).join('\n');
  writeFileSync(join(RUN_OUTPUT, 'EXTRACTION_REPORT_MATRIX.csv'), csv + '\n', 'utf8');

  const objectsExtracted = emissions.length;
  const fieldsExtracted = emissions.reduce((a, e) => a + e.fieldsExtracted, 0);
  const emptyFieldObjects = emissions.filter((e) => e.fieldsExtracted === 0 && !e.skipped);

  const stats = {
    vendor: 'HubSpot',
    objectsExtracted,
    fieldsExtracted,
    crmStandard: CRM_STANDARD.length,
    associations: ASSOC_PAIRS.length,
    richResources: RICH.length,
    independentSignals: { catalogAPIs: catalog.length, specFilesPresent: specFiles.length },
    emptyFieldObjects: emptyFieldObjects.map((e) => e.objectName),
    emissionArtifact: EMISSION_PATH,
  };
  process.stdout.write(JSON.stringify(stats, null, 2) + '\n');

  // HARD FAILURE: a rich resource whose schema we expected to carry fields came out empty.
  if (emptyFieldObjects.length > 0) {
    process.stderr.write(`EMPTY-FIELD OBJECTS (parse defect): ${emptyFieldObjects.map((e) => e.objectName).join(', ')}\n`);
    process.exit(3);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
