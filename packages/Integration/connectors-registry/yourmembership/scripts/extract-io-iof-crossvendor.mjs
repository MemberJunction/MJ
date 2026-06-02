// IOIOF extractor — YourMembership Cross-Vendor Integration Hooks family
//
// Scope (per user request):
//   QuickBooksOnlineOAuth, ZoomOAuth, ZoomEventListener, ZoomEventListenerOAuth,
//   SocialOAuth, DomainAuthentication, Informz* family (HasInformz,
//   InformzBulkUpload* x7, InformzFindGroup).
//
// Source: cached Swagger 2.0 spec at /tmp/ym-evidence/openapi.json
//         (fetched 2026-05-30 from https://ws.yourmembership.com/openapi).
// All decisions are derived from the spec; no vendor names hardcoded
// beyond the cluster-membership list which itself came from
// SOURCE_STUDY.md §3.6 (provenance-anchored).
//
// Emission discipline:
//   - One IO per first-segment Ams resource family in this cluster, only when
//     the OpenAPI declares at least one operation we can lawfully classify
//     (GET => Read; POST/PUT/PATCH => Create/Update; DELETE => Delete).
//   - Path-matching is CASE-INSENSITIVE on the `{ClientID}` token because
//     YM's spec mixes `/Ams/{ClientID}/X` and `/Ams/{clientId}/X`.
//   - Pre-auth resources whose path is `/Ams/{Family}` or `/Ams/{Family}/...`
//     (no ClientID segment — e.g., OAuth callback init) are also accepted
//     because they're still part of the same vendor cluster.
//   - For each verb we pick the SHORTEST path — that's typically the root
//     form. Longer paths are usually deeper variants (refresh-token,
//     ID-scoped operations) carried in evidence but not as the primary path.
//   - IOFs are emitted from $ref-resolved response schemas only.
//     If only request schemas exist (no GET / no schema response, e.g.
//     SocialOAuth returns the generic `Object` definition), no IOFs are
//     emitted for that family. Write-only request fields are captured
//     via CreateBodyShape (and the verifier can audit via the schema name).
//   - ServiceStack envelope fields are skipped (ResponseStatus,
//     IsForceReload, UsingRedis, AppInitTime, ServerID, BypassCache,
//     DateCached, Device, ClientID) — these are infra, not data.
//   - PK detection: EXPLICIT ONLY. We only mark IsPrimaryKey=true if the
//     spec has a description containing "primary key", "unique identifier",
//     or "system ID". Otherwise unset (false). Per Gap 10 of conventions.
//   - FK detection: only when the path declares a parent parameter that
//     names an existing resource family. The cross-vendor cluster paths
//     don't carry such parent params (they're pre-auth or use `{ClientID}`
//     which is always the implicit tenant scope), so no FKs are emitted.
//
// Output side-effects:
//   - Appends the discovered IOs (with nested IOFs) to
//       metadata/integrations/yourmembership/.yourmembership.integration.json
//     under relatedEntities["MJ: Integration Objects"], using @parent:ID
//     references — matching the convention in
//       metadata/integrations/.your-membership.json.
//   - Appends per-flag CODE_EVIDENCE entries to
//       packages/Integration/connectors-registry/yourmembership/runs/
//         connector-yourmembership-1780165237029-a495a1ea/output/CODE_EVIDENCE.json
//
// stdout: a structured stats blob the workflow reads. The full IO/IOF body
// is NOT in stdout — too noisy for the verify-claim composition. The file
// writes are the canonical emission.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SPEC_PATH = '/tmp/ym-evidence/openapi.json';
const INTEGRATION_FILE = 'metadata/integrations/yourmembership/.yourmembership.integration.json';
const CODE_EVIDENCE_FILE = 'packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/CODE_EVIDENCE.json';
const SCRIPT_PATH = 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-crossvendor.mjs';

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

// The cluster the user asked for, per SOURCE_STUDY.md §3.6.
const CLUSTER = [
  'QuickBooksOnlineOAuth',
  'ZoomOAuth',
  'ZoomEventListener',
  'ZoomEventListenerOAuth',
  'SocialOAuth',
  'DomainAuthentication',
  'HasInformz',
  'InformzBulkUploadBySearchGuid',
  'InformzBulkUploadEventRegistrants',
  'InformzBulkUploadForDues',
  'InformzBulkUploadForDuesBySearchId',
  'InformzBulkUploadForOrders',
  'InformzBulkUploadForOrdersBySearchId',
  'InformzBulkUploadForReports',
  'InformzFindGroup',
];

const METHOD_TO_CRUD = {
  get: 'read', post: 'create', put: 'update', patch: 'update', delete: 'delete',
};

function refToDefName(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/^#\/definitions\/(.+)$/);
  return m ? m[1] : null;
}
function getDef(name) { return spec.definitions?.[name] || null; }

function flattenSchema(schema, depth = 0) {
  if (!schema || depth > 2) return [];
  if (schema.$ref) {
    const def = getDef(refToDefName(schema.$ref));
    return def ? flattenSchema(def, depth + 1) : [];
  }
  if (schema.type === 'array' && schema.items) return flattenSchema(schema.items, depth + 1);
  const fields = [];
  const required = new Set(schema.required || []);
  for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
    let type = propSchema.type;
    let refTarget = null;
    if (propSchema.$ref) { refTarget = refToDefName(propSchema.$ref); type = 'object'; }
    if (propSchema.type === 'array') {
      type = 'array';
      if (propSchema.items?.$ref) refTarget = refToDefName(propSchema.items.$ref);
      else if (propSchema.items?.type) refTarget = propSchema.items.type;
    }
    fields.push({
      name: propName,
      type: type || 'string',
      format: propSchema.format,
      description: propSchema.description,
      required: required.has(propName),
      isReadOnly: !!propSchema.readOnly,
      refTarget,
      enum: propSchema.enum,
      maxLength: propSchema.maxLength,
    });
  }
  return fields;
}

// Map Swagger 2.0 type + format to MJ IntegrationObjectField Type tokens.
// SQL-style tokens to match metadata/integrations/.your-membership.json.
function mapType(field) {
  const t = (field.type || '').toLowerCase();
  const f = (field.format || '').toLowerCase();
  if (t === 'integer') {
    if (f === 'int64') return { Type: 'bigint', Length: 8 };
    return { Type: 'int', Length: 4 };
  }
  if (t === 'number') {
    if (f === 'double') return { Type: 'decimal', Length: 8 };
    if (f === 'float') return { Type: 'decimal', Length: 4 };
    return { Type: 'decimal', Length: null };
  }
  if (t === 'boolean') return { Type: 'bit', Length: 1 };
  if (t === 'string') {
    if (f === 'date-time' || f === 'date') return { Type: 'datetime', Length: null };
    if (f === 'uuid' || f === 'guid') return { Type: 'nvarchar', Length: 36 };
    return { Type: 'nvarchar', Length: field.maxLength ?? null };
  }
  if (t === 'array') return { Type: 'nvarchar(max)', Length: null };
  if (t === 'object') return { Type: 'nvarchar(max)', Length: null };
  return { Type: 'nvarchar', Length: null };
}

function detectExplicitPK(field) {
  if (!field) return false;
  const d = (field.description || '').toLowerCase();
  if (d.includes('primary key')) return true;
  if (d.includes('unique identifier')) return true;
  if (d.includes('system id')) return true;
  return false;
}

function getSuccessResponseSchema(op) {
  if (!op?.responses) return null;
  for (const code of ['200', '201', '202']) {
    if (op.responses[code]?.schema) return op.responses[code].schema;
  }
  return null;
}
function getRequestBodySchema(op) {
  const bodyParam = (op?.parameters || []).find(p => p.in === 'body');
  return bodyParam?.schema || null;
}

function classifyPathFamily(pth) {
  const stripped = pth.replace(/^\/Ams\//, '');
  if (stripped === pth) return null;
  const noClient = stripped.replace(/^\{[Cc]lient[Ii][Dd]\}\//, '');
  return noClient.split('/')[0] || null;
}

// Collect per-family operations.
const familyOps = new Map();
for (const [pth, methods] of Object.entries(spec.paths || {})) {
  const family = classifyPathFamily(pth);
  if (!family || !CLUSTER.includes(family)) continue;
  for (const [method, op] of Object.entries(methods)) {
    if (typeof op !== 'object' || !op) continue;
    if (!METHOD_TO_CRUD[method]) continue;
    if (!familyOps.has(family)) familyOps.set(family, []);
    familyOps.get(family).push({ path: pth, method, op });
  }
}

const ENVELOPE_FIELDS = new Set([
  'ResponseStatus', 'IsForceReload', 'UsingRedis', 'AppInitTime',
  'ServerID', 'BypassCache', 'DateCached', 'Device', 'ClientID',
]);

const emittedIOs = []; // for relatedEntities
const evidenceEntries = [];
const stats = {
  ClustersSeen: CLUSTER.length,
  IOsEmitted: 0,
  IOFsEmitted: 0,
  PKsExplicitlyEmitted: 0,
  FKsEmitted: 0,
  ClustersWithNoOps: [],
  ClustersWithNoResponseSchema: [],
  TraversalOrder: [],
};

let seq = 1; // sequence for IOs within the integration

for (const family of CLUSTER) {
  const ops = familyOps.get(family) || [];
  if (ops.length === 0) {
    stats.ClustersWithNoOps.push(family);
    continue;
  }

  // Group ops by verb; pick shortest path per verb.
  const byVerb = { read: [], create: [], update: [], delete: [] };
  for (const o of ops) {
    const crud = METHOD_TO_CRUD[o.method];
    if (byVerb[crud]) byVerb[crud].push(o);
  }
  for (const k of Object.keys(byVerb)) byVerb[k].sort((a, b) => a.path.length - b.path.length);
  const readOp = byVerb.read[0] || null;
  const createOp = byVerb.create[0] || null;
  const updateOp = byVerb.update[0] || null;
  const deleteOp = byVerb.delete[0] || null;

  const apiPath = readOp?.path || ops[0].path;

  let respSchema = null;
  if (readOp) respSchema = getSuccessResponseSchema(readOp.op);
  if (!respSchema) {
    for (const o of ops) {
      const s = getSuccessResponseSchema(o.op);
      if (s) { respSchema = s; break; }
    }
  }
  const responseFields = respSchema ? flattenSchema(respSchema) : [];
  if (responseFields.length === 0) stats.ClustersWithNoResponseSchema.push(family);

  const summaries = ops.map(o => o.op.summary).filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 3);
  const uniquePaths = [...new Set(ops.map(o => o.path))];
  const description = summaries.length > 0
    ? `Cross-vendor integration hook: ${family}. ${summaries.join(' / ')} Source: OpenAPI ${uniquePaths.join(', ')}.`
    : `Cross-vendor integration hook: ${family}. Source: OpenAPI ${uniquePaths.join(', ')}.`;

  let supportsPagination = false;
  let paginationType = null;
  if (readOp) {
    const params = readOp.op.parameters || [];
    const hasPagSize = params.some(p => p.name?.toLowerCase() === 'pagesize');
    const hasPagNum = params.some(p => p.name?.toLowerCase() === 'pagenumber');
    if (hasPagSize && hasPagNum) { supportsPagination = true; paginationType = 'PageNumber'; }
  }

  let responseDataKey = null;
  if (respSchema) {
    const refName = refToDefName(respSchema.$ref) || refToDefName(respSchema.items?.$ref);
    if (refName) {
      const def = getDef(refName);
      if (def?.properties) {
        if (def.properties[family]) responseDataKey = family;
        else {
          for (const [pn, ps] of Object.entries(def.properties)) {
            if (ENVELOPE_FIELDS.has(pn) || ['PageSize','PageNumber','ListCount'].includes(pn)) continue;
            if (ps.type === 'array') { responseDataKey = pn; break; }
          }
        }
      }
    }
  }

  // Build the IO row (nested-style — uses @parent:ID)
  const ioFields = {
    IntegrationID: '@parent:ID',
    Name: family,
    DisplayName: family,
    Description: description,
    Category: 'CrossVendorIntegrationHooks',
    APIPath: apiPath,
    ResponseDataKey: responseDataKey,
    PaginationType: paginationType,
    SupportsPagination: supportsPagination,
    SupportsIncrementalSync: false,
    IncrementalWatermarkField: null,
    SupportsRead: !!readOp,
    SupportsCreate: !!createOp,
    SupportsUpdate: !!updateOp,
    SupportsDelete: !!deleteOp,
    SupportsWrite: !!(createOp || updateOp || deleteOp),
    Sequence: seq,
    Status: 'Active',
  };

  if (createOp) {
    const bodySchema = getRequestBodySchema(createOp.op);
    const bodyDef = bodySchema ? refToDefName(bodySchema.$ref) : null;
    ioFields.CreateAPIPath = createOp.path;
    ioFields.CreateMethod = createOp.method.toUpperCase();
    ioFields.CreateBodyShape = bodyDef || (bodySchema ? 'inline' : null);
    ioFields.CreateBodyKey = null;
    ioFields.CreateIDLocation = null;
    evidenceEntries.push({
      claim: `${family}.CreateAPIPath/Method/BodyShape`,
      scriptPath: SCRIPT_PATH,
      structuralSignal: `OpenAPI path '${createOp.path}' declares method '${createOp.method.toUpperCase()}' with bodyParam ref => '${bodyDef || 'inline-or-none'}'`,
    });
  }
  if (updateOp) {
    const bodySchema = getRequestBodySchema(updateOp.op);
    const bodyDef = bodySchema ? refToDefName(bodySchema.$ref) : null;
    ioFields.UpdateAPIPath = updateOp.path;
    ioFields.UpdateMethod = updateOp.method.toUpperCase();
    ioFields.UpdateBodyShape = bodyDef || (bodySchema ? 'inline' : null);
    ioFields.UpdateBodyKey = null;
    const pathParams = updateOp.path.match(/\{([^}]+)\}/g) || [];
    ioFields.UpdateIDLocation = pathParams.length > 1 ? 'path' : null;
    evidenceEntries.push({
      claim: `${family}.UpdateAPIPath/Method/BodyShape`,
      scriptPath: SCRIPT_PATH,
      structuralSignal: `OpenAPI path '${updateOp.path}' declares method '${updateOp.method.toUpperCase()}' with bodyParam ref => '${bodyDef || 'inline-or-none'}'`,
    });
  }
  if (deleteOp) {
    ioFields.DeleteAPIPath = deleteOp.path;
    ioFields.DeleteMethod = deleteOp.method.toUpperCase();
    ioFields.DeleteBodyShape = null;
    ioFields.DeleteBodyKey = null;
    const pathParams = deleteOp.path.match(/\{([^}]+)\}/g) || [];
    ioFields.DeleteIDLocation = pathParams.length > 1 ? 'path' : null;
    evidenceEntries.push({
      claim: `${family}.DeleteAPIPath/Method`,
      scriptPath: SCRIPT_PATH,
      structuralSignal: `OpenAPI path '${deleteOp.path}' declares method 'DELETE'`,
    });
  }

  // Emit IOFs (nested, with @parent:ID)
  const iofRows = [];
  let fieldSeq = 1;
  for (const f of responseFields) {
    if (ENVELOPE_FIELDS.has(f.name)) continue;
    if (['PageSize','PageNumber','ListCount'].includes(f.name)) continue;
    const { Type, Length } = mapType(f);
    const isPK = detectExplicitPK(f);
    if (isPK) stats.PKsExplicitlyEmitted++;
    iofRows.push({
      fields: {
        IntegrationObjectID: '@parent:ID',
        Name: f.name,
        DisplayName: f.name,
        Description: f.description || null,
        Type,
        Length: Length ?? null,
        AllowsNull: !f.required,
        IsRequired: !!f.required,
        IsReadOnly: !!f.isReadOnly,
        IsUniqueKey: false,
        IsPrimaryKey: isPK,
        IsForeignKey: false,
        RelatedIntegrationObjectID: null,
        Sequence: fieldSeq++,
        Status: 'Active',
      },
    });
    stats.IOFsEmitted++;
    if (isPK) {
      evidenceEntries.push({
        claim: `${family}.${f.name}.IsPrimaryKey=true`,
        scriptPath: SCRIPT_PATH,
        structuralSignal: `Field description explicitly contains PK marker: "${(f.description || '').slice(0, 120)}"`,
      });
    }
    if (f.required) {
      evidenceEntries.push({
        claim: `${family}.${f.name}.IsRequired=true`,
        scriptPath: SCRIPT_PATH,
        structuralSignal: `Field appears in 'required' array of response schema for family ${family}`,
      });
    }
    if (f.isReadOnly) {
      evidenceEntries.push({
        claim: `${family}.${f.name}.IsReadOnly=true`,
        scriptPath: SCRIPT_PATH,
        structuralSignal: `Field declares readOnly=true in OpenAPI schema`,
      });
    }
  }

  evidenceEntries.push({
    claim: `${family}.APIPath / SupportsRead/Create/Update/Delete`,
    scriptPath: SCRIPT_PATH,
    structuralSignal: `Operations observed: ${ops.map(o => `${o.method.toUpperCase()} ${o.path}`).join('; ')}. Chosen APIPath=${apiPath} (shortest among GET, else first).`,
  });
  evidenceEntries.push({
    claim: `${family}.PaginationType=${paginationType ?? 'null'} SupportsPagination=${supportsPagination}`,
    scriptPath: SCRIPT_PATH,
    structuralSignal: readOp
      ? `Read op parameters: ${(readOp.op.parameters || []).map(p => p.name).join(', ') || '(none)'}`
      : `No GET op exists for this family — pagination N/A. Decision derives from absence of PageSize+PageNumber params on any read op.`,
  });

  const ioRow = {
    fields: ioFields,
    relatedEntities: {
      'MJ: Integration Object Fields': iofRows,
    },
  };
  emittedIOs.push(ioRow);
  stats.IOsEmitted++;
  stats.TraversalOrder.push(family);
  seq++;
}

// --- Write side-effects ---

// 1) Append IOs to the integration JSON.
const integrationJson = JSON.parse(readFileSync(INTEGRATION_FILE, 'utf8'));
const root = integrationJson[0];
if (!root.relatedEntities) root.relatedEntities = {};
const existingIOs = root.relatedEntities['MJ: Integration Objects'] || [];

// Idempotency: replace any existing IOs in our CLUSTER (by Name), keep others.
const clusterSet = new Set(CLUSTER);
const preservedIOs = existingIOs.filter(io => !clusterSet.has(io.fields?.Name));
const replacedCount = existingIOs.length - preservedIOs.length;

// Renumber Sequence so appended IOs continue after preserved.
const startSeq = preservedIOs.reduce((m, io) => Math.max(m, io.fields?.Sequence || 0), 0) + 1;
emittedIOs.forEach((io, i) => { io.fields.Sequence = startSeq + i; });

root.relatedEntities['MJ: Integration Objects'] = [...preservedIOs, ...emittedIOs];
writeFileSync(INTEGRATION_FILE, JSON.stringify(integrationJson, null, 2) + '\n');

// 2) Append evidence entries to CODE_EVIDENCE.json.
const ce = existsSync(CODE_EVIDENCE_FILE)
  ? JSON.parse(readFileSync(CODE_EVIDENCE_FILE, 'utf8'))
  : { entries: [] };
if (!ce.entries) ce.entries = [];

// Stamp a section header for this batch so reviewers can locate it.
ce.entries.push({
  claim: 'Cross-Vendor Integration Hooks family — IO/IOF extraction batch',
  scriptPath: SCRIPT_PATH,
  scriptInputs: [
    `${SPEC_PATH} — Swagger 2.0 spec cached from https://ws.yourmembership.com/openapi (2026-05-30)`,
  ],
  reproduction: {
    fetch: 'curl -sL -o /tmp/ym-evidence/openapi.json https://ws.yourmembership.com/openapi',
    run: `node ${SCRIPT_PATH}`,
    verify: `jq '.[0].relatedEntities["MJ: Integration Objects"][] | select(.fields.Category=="CrossVendorIntegrationHooks") | .fields.Name' ${INTEGRATION_FILE}`,
  },
  expectedOutput: `${stats.IOsEmitted} IOs in cluster: ${stats.TraversalOrder.join(', ')}`,
  decisionLogic: 'Cluster membership pulled from SOURCE_STUDY.md §3.6. Each family emits one IO iff at least one Ams operation matches by case-insensitive path prefix. APIPath = shortest GET path per family (else first op).',
});

for (const e of evidenceEntries) ce.entries.push(e);
writeFileSync(CODE_EVIDENCE_FILE, JSON.stringify(ce, null, 2) + '\n');

// 3) stdout — structured stats for the workflow harness.
const structured = {
  IOCreated: stats.IOsEmitted,
  IOFCreated: stats.IOFsEmitted,
  PKsExplicitlyEmitted: stats.PKsExplicitlyEmitted,
  FKsEmitted: stats.FKsEmitted,
  GapsForRuntimeD4: stats.ClustersWithNoResponseSchema.map(f =>
    `${f}: no response schema in OpenAPI (returns generic Object or has no schema-typed response); IOFs deferred to runtime introspection.`
  ),
  TraversalOrder: stats.TraversalOrder,
  ClustersWithNoOps: stats.ClustersWithNoOps,
  ReplacedExistingIOs: replacedCount,
  PreservedExistingIOs: preservedIOs.length,
};
console.log(JSON.stringify(structured, null, 2));
