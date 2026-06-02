// IOIOF extractor — YourMembership AMS Resource Families (the primary coverable taxonomy).
//
// Scope (per task brief + SOURCE_STUDY.md §3.1):
//   The first-segment families under /Ams/{ClientID}/X.
//
// Explicitly NOT in scope of THIS script (owned by sibling extractors):
//   - Member sub-resources /Ams/{ClientID}/Member/{MemberID}/X
//       → extract-io-iof-member-subresources.mjs (emits MemberSub_*)
//   - Event sub-resources /Ams/{ClientID}/Event/{EventId|EventID}/X
//       → extract-io-iof-event-subresources.mjs (emits AmsEvent_*)
//   - Cross-vendor integration hooks
//       → extract-io-iof-crossvendor.mjs (QuickBooks, Zoom, Informz, etc.)
//   - OAuth / JWKS / session-auth endpoints
//       → extract-io-iof-oauth.mjs, extract-io-iof-jwks-jwtissuer.mjs,
//         extract-io-iof-session-auth.mjs
//   - YMCareers (/Ymc/*) endpoints
//       → extract-io-iof-ymc-career.mjs
//   - Response-envelope DTO
//       → extract-io-iof-response-envelope.mjs
//
// Excluded per SOURCE_STUDY.md §3.7 (internal scaffolding):
//   Ping, HassAcessTestFolder, HelpTopic, BrandingConfig.css, Custom.css,
//   HtmlSanitization, MarkupRender, WebScraper.
//
// Output: stdout = structured JSON for the workflow + side-effect writes to:
//   - metadata/integrations/yourmembership/.yourmembership.integration.json
//     (preserves sibling-emitted IOs; appends/replaces only OUR named IOs)
//   - packages/.../runs/<run>/output/CODE_EVIDENCE.json  (entries appended)
//
// Source: cached Swagger 2.0 snapshot at
//   packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json
// (fetched 2026-05-30 from https://ws.yourmembership.com/openapi)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

const SNAPSHOT_PATH = resolve(
  REPO_ROOT,
  'packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json'
);
const METADATA_JSON_PATH = resolve(REPO_ROOT, 'metadata/integrations/yourmembership/.yourmembership.integration.json');
const CODE_EVIDENCE_PATH = resolve(
  REPO_ROOT,
  'packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/CODE_EVIDENCE.json'
);

const SCRIPT_REL_PATH = 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-ams.mjs';

const MAX_IOS = 1000;
const MAX_WALL_CLOCK_MS = 10 * 60 * 1000;
const startedAt = Date.now();

// Internal/test scaffolding excluded per SOURCE_STUDY §3.7
const EXCLUDED_SCAFFOLDING = new Set([
  'Ping',
  'HassAcessTestFolder', // sic — vendor typo
  'HelpTopic',
  'BrandingConfig.css',
  'Custom.css',
  'HtmlSanitization',
  'MarkupRender',
  'WebScraper',
]);

// Excluded — covered by sibling cross-vendor script (cross-vendor integrations)
const EXCLUDED_CROSSVENDOR = new Set([
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
]);

// Excluded — covered by sibling auth scripts (OAuth + JWKS + session-auth)
// These are mostly NOT under /Ams/{ClientID}/ — recorded for transparency.
const EXCLUDED_AUTH = new Set([
  'Auth',
  'Authenticate',
  'CheckPassword',
  'CheckUsername',
  'MemberPasswordReset',
  'FinalizeLogin',
  'FraudPrevention',
  'OAuthClientApps',
  'OAuthClientAppAPISetting',
  'OAuthClientAppName',
  'OAuthScopes',
]);

// ServiceStack response envelope fields — present on nearly every response
// shape because the vendor mixes BaseDto into every DTO. These are
// infrastructure, not data fields, and should not appear as IOFs.
const ENVELOPE_FIELDS = new Set([
  'ResponseStatus',
  'IsForceReload',
  'UsingRedis',
  'AppInitTime',
  'ServerID',
  'BypassCache',
  'DateCached',
  'Device',
  'PageSize',
  'PageNumber',
  'ListCount',
  'OrderBy',
  'OrderByDirection',
  'Origin',
]);

// Per-method CRUD classification
const METHOD_TO_CRUD = {
  get: 'read',
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'delete',
};

// ---------------------------------------------------------------------------
// LIGHTWEIGHT SCHEMA VALIDATION (replaces a full zod dependency for portability)
// ---------------------------------------------------------------------------

function validateSpec(spec) {
  if (typeof spec !== 'object' || !spec) {
    throw new Error('Spec is not an object');
  }
  if (spec.swagger !== '2.0') {
    throw new Error(`Expected Swagger 2.0, got swagger=${spec.swagger}`);
  }
  if (typeof spec.paths !== 'object' || !spec.paths) {
    throw new Error('Spec has no paths object');
  }
  if (typeof spec.definitions !== 'object' || !spec.definitions) {
    throw new Error('Spec has no definitions object');
  }
  if (spec.host !== 'ws.yourmembership.com') {
    throw new Error(`Unexpected host: ${spec.host}`);
  }
  return spec;
}

const spec = validateSpec(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')));

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function refToDefName(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/^#\/definitions\/(.+)$/);
  return m ? m[1] : null;
}

function getDef(name) {
  return spec.definitions?.[name] || null;
}

function getSuccessResponseSchema(op) {
  if (!op?.responses) return null;
  for (const code of ['200', '201', '202']) {
    if (op.responses[code]?.schema) return op.responses[code].schema;
  }
  return null;
}

function getRequestBodyShape(op) {
  const params = op?.parameters || [];
  const bodyParam = params.find(p => p.in === 'body');
  if (bodyParam?.schema) {
    const refName = refToDefName(bodyParam.schema.$ref);
    return refName || 'inline';
  }
  const formParams = params.filter(p => p.in === 'formData');
  if (formParams.length > 0) return 'form-data';
  return null;
}

// Map Swagger 2.0 type+format to MJ Integration Object Field SQL-style type tokens.
function mapType(field) {
  const t = (field.type || '').toLowerCase();
  const f = (field.format || '').toLowerCase();
  if (t === 'integer') {
    if (f === 'int64') return { Type: 'bigint', Length: 8 };
    return { Type: 'int', Length: 4 };
  }
  if (t === 'number') {
    if (f === 'double') return { Type: 'float', Length: 8 };
    if (f === 'float') return { Type: 'float', Length: 4 };
    return { Type: 'decimal', Length: null };
  }
  if (t === 'boolean') return { Type: 'bit', Length: null };
  if (t === 'string') {
    if (f === 'date-time' || f === 'date') return { Type: 'datetime', Length: null };
    if (f === 'uuid' || f === 'guid') return { Type: 'nvarchar', Length: 36 };
    return { Type: 'nvarchar', Length: field.maxLength ?? null };
  }
  if (t === 'array') return { Type: 'nvarchar', Length: null };
  if (t === 'object') return { Type: 'nvarchar', Length: null };
  return { Type: 'nvarchar', Length: null };
}

// Explicit PK signal — only if vendor wording is present in the description.
function detectExplicitPK(field) {
  if (!field) return false;
  const d = (field.description || '').toLowerCase();
  if (d.includes('primary key')) return true;
  if (d.includes('unique identifier')) return true;
  if (d.includes('system id')) return true;
  return false;
}

// Pull fields from a response schema, preferring the array-typed property
// (which holds the entity items) over the envelope-flattened properties.
// Returns: { fields: [...], arrayPropName: string|null }
function extractEntityFields(respSchema) {
  if (!respSchema) return { fields: [], arrayPropName: null };
  const refName = refToDefName(respSchema.$ref);
  const def = refName ? getDef(refName) : null;
  if (!def?.properties) return { fields: [], arrayPropName: null };

  // 1) Find an array-typed property whose name is not an envelope field.
  let arrayPropName = null;
  let itemDefName = null;
  for (const [pn, ps] of Object.entries(def.properties)) {
    if (ENVELOPE_FIELDS.has(pn)) continue;
    if (ps.type === 'array' && ps.items?.$ref) {
      arrayPropName = pn;
      itemDefName = refToDefName(ps.items.$ref);
      break;
    }
  }

  if (itemDefName) {
    const itemDef = getDef(itemDefName);
    if (itemDef?.properties) {
      return {
        fields: propsToFields(itemDef.properties, itemDef.required || []),
        arrayPropName,
      };
    }
  }

  // 2) Fall back to envelope-flattened entity fields on the response itself.
  return {
    fields: propsToFields(def.properties, def.required || []),
    arrayPropName: null,
  };
}

function propsToFields(properties, requiredList) {
  const required = new Set(requiredList || []);
  const out = [];
  for (const [pn, ps] of Object.entries(properties || {})) {
    if (ENVELOPE_FIELDS.has(pn)) continue;
    let type = ps.type;
    let refTarget = null;
    if (ps.$ref) {
      refTarget = refToDefName(ps.$ref);
      type = 'object';
    } else if (ps.type === 'array') {
      type = 'array';
      if (ps.items?.$ref) refTarget = refToDefName(ps.items.$ref);
      else if (ps.items?.type) refTarget = ps.items.type;
    }
    out.push({
      name: pn,
      type: type || 'string',
      format: ps.format,
      description: ps.description || null,
      required: required.has(pn),
      isReadOnly: !!ps.readOnly,
      refTarget,
      enum: ps.enum,
      maxLength: ps.maxLength,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CATEGORY DERIVATION (purely lexical, no vendor-name hardcoding)
// ---------------------------------------------------------------------------
function deriveCategory(name) {
  const n = name;
  if (/^Member([A-Z]|s$|s[A-Z]|$)/.test(n)) return 'Members';
  if (/^Event([A-Z]|s$|s[A-Z]|$)/.test(n)) return 'Events';
  if (/^Membership/.test(n)) return 'Memberships';
  if (/^People/.test(n)) return 'People';
  if (/^Campaign|^SMSCampaign|^CopyCampaign|^ResendCampaign|^AllCampaigns|^EmailSender|^EmailSuppression|^EmailVerification/.test(n)) return 'Campaigns';
  if (/^Donation/.test(n)) return 'Donations';
  if (/^Dues|^Invoice|^Finance|^GLCode|^PaymentProcessor|^TaxRate|^CustomTax|^QBClasses/.test(n)) return 'Finance';
  if (/^Order|^Product|^Store|^FindProducts|^ShippingMethods/.test(n)) return 'Commerce';
  if (/^Cert/.test(n)) return 'Certifications';
  if (/^CustomPage|^ContentArea|^Markup|^CustomForms|^Announcements|^OrganizationPosts|^LatestPosts|^Post|^CommunityPhotos|^RssBuilder|^ExternalLink|^Feeds|^PageMetaInfo|^Shares|^WallComments|^SponsorRotators|^Social$|^TopContributors|^TrendingPosts/.test(n)) return 'Content';
  if (/^Branding|^CBXClientConfig|^ClientConfig/.test(n)) return 'Branding';
  if (/^Group/.test(n)) return 'Groups';
  if (/^Notification/.test(n)) return 'Notifications';
  if (/^Career/.test(n)) return 'Careers';
  if (/^Countries|^TimeZones|^Locations|^FreestoneTypes|^MemberTypes|^FindMembers|^MemberList|^Ambassadors/.test(n)) return 'Lookups';
  if (/^SavedSearch|^DashboardData|^HasAccessPath|^FilesUpload|^ResouremanagerFilesUpload/.test(n)) return 'Utility';
  if (/^ConvertToMember/.test(n)) return 'Members';
  return 'Other';
}

// ---------------------------------------------------------------------------
// GROUP OPS BY LOGICAL FAMILY
// ---------------------------------------------------------------------------
// Logical family scheme:
//   /Ams/{ClientID}/Member/{MemberID}/X      → SKIPPED (sibling script owns it)
//   /Ams/{ClientID}/Event/{EventId|EventID}/X → SKIPPED (sibling script owns it)
//   /Ams/{ClientID}/Y                        → IO "Y"
//   /Ams/{ClientID}/Y/{...}/...              → folded into IO "Y" (deep variants share)

const families = new Map(); // familyKey -> { name, ops: [] }
const skippedByMemberSubresource = new Set();
const skippedByEventSubresource = new Set();
const skippedByCrossVendor = new Set();
const skippedByScaffolding = new Set();
const skippedByAuth = new Set();
const skippedByParametric = new Set();

function classifyPath(pth) {
  // Strip leading /Ams/{ClientID}/
  const m = pth.match(/^\/Ams\/\{ClientID\}\/(.+)$/);
  if (!m) return null;
  const rest = m[1];
  const segs = rest.split('/').filter(s => s.length > 0);

  if (segs.length === 0) return null;

  // Skip Member sub-resources: /Member/{MemberID}/X — sibling extractor owns.
  if (segs[0] === 'Member' && /^\{MemberID\}$/i.test(segs[1] || '') && segs[2]) {
    skippedByMemberSubresource.add(segs[2]);
    return null;
  }
  // Skip Event sub-resources: /Event/{EventId|EventID}/X — sibling extractor owns.
  if (segs[0] === 'Event' && /^\{Event(Id|ID)\}$/i.test(segs[1] || '') && segs[2]) {
    skippedByEventSubresource.add(segs[2]);
    return null;
  }
  // First-segment family
  const first = segs[0];
  if (first === '{clientId}') {
    skippedByParametric.add(first);
    return null;
  }
  if (EXCLUDED_SCAFFOLDING.has(first)) {
    skippedByScaffolding.add(first);
    return null;
  }
  if (EXCLUDED_CROSSVENDOR.has(first)) {
    skippedByCrossVendor.add(first);
    return null;
  }
  if (EXCLUDED_AUTH.has(first)) {
    skippedByAuth.add(first);
    return null;
  }
  // Standalone first-segment that happens to be exactly 'Member' / 'Event'
  // (no sub-paths) — these have no ops in the spec, so they would naturally
  // produce empty IOs anyway. Skip them defensively.
  if (first === 'Member' || first === 'Event') return null;

  return { familyKey: first, name: first };
}

for (const [pth, methods] of Object.entries(spec.paths)) {
  const cls = classifyPath(pth);
  if (!cls) continue;
  for (const [method, op] of Object.entries(methods)) {
    if (typeof op !== 'object' || !op || !METHOD_TO_CRUD[method]) continue;
    if (!op.tags || !op.tags.includes('Ams')) continue;
    if (!families.has(cls.familyKey)) {
      families.set(cls.familyKey, { name: cls.name, ops: [] });
    }
    families.get(cls.familyKey).ops.push({ path: pth, method, op });
  }
}

// ---------------------------------------------------------------------------
// EMIT IOs + IOFs
// ---------------------------------------------------------------------------

const IOs = [];
const evidence = [];
const stats = {
  IOsConsidered: 0,
  IOsEmitted: 0,
  IOFsEmitted: 0,
  PKsExplicitlyEmitted: 0,
  FKsEmitted: 0,
  FamiliesWithNoResponseSchema: [],
  FamiliesWithEmptyFieldSet: [],
  ExcludedScaffoldingObserved: [],
  ExcludedCrossVendorObserved: [],
  ExcludedAuthObserved: [],
  ExcludedMemberSubresourceObserved: [],
  ExcludedEventSubresourceObserved: [],
  TotalAmsTaggedOps: 0,
};

stats.ExcludedScaffoldingObserved = [...skippedByScaffolding];
stats.ExcludedCrossVendorObserved = [...skippedByCrossVendor];
stats.ExcludedAuthObserved = [...skippedByAuth];
stats.ExcludedMemberSubresourceObserved = [...skippedByMemberSubresource];
stats.ExcludedEventSubresourceObserved = [...skippedByEventSubresource];

// Count total Ams-tagged ops in spec for math-checking
for (const [, methods] of Object.entries(spec.paths)) {
  for (const [, op] of Object.entries(methods)) {
    if (typeof op === 'object' && op?.tags?.includes('Ams')) stats.TotalAmsTaggedOps++;
  }
}

const familyList = [...families.entries()].sort((a, b) => a[0].localeCompare(b[0]));
stats.IOsConsidered = familyList.length;

let seq = 1;
for (const [familyKey, fam] of familyList) {
  if (IOs.length >= MAX_IOS) throw new Error(`Hit MAX_IOS cap (${MAX_IOS})`);
  if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) throw new Error('Wall-clock cap hit');

  const ops = fam.ops;
  let readOp = null, createOp = null, updateOp = null, deleteOp = null;
  for (const o of ops) {
    const crud = METHOD_TO_CRUD[o.method];
    if (crud === 'read' && !readOp) readOp = o;
    else if (crud === 'create' && !createOp) createOp = o;
    else if (crud === 'update' && !updateOp) updateOp = o;
    else if (crud === 'delete' && !deleteOp) deleteOp = o;
  }
  if (!readOp && !createOp && !updateOp && !deleteOp) continue;

  // APIPath — prefer the shortest path among the read op's collection paths.
  const collectionPath = readOp?.path || ops[0].path;

  let respSchema = null;
  if (readOp) respSchema = getSuccessResponseSchema(readOp.op);
  if (!respSchema) {
    for (const o of ops) {
      const s = getSuccessResponseSchema(o.op);
      if (s) { respSchema = s; break; }
    }
  }
  if (!respSchema) stats.FamiliesWithNoResponseSchema.push(fam.name);
  const { fields: respFields, arrayPropName } = extractEntityFields(respSchema);

  // Pagination
  let supportsPagination = false;
  let paginationType = null;
  if (readOp) {
    const params = readOp.op.parameters || [];
    const hasPagSize = params.some(p => p.name?.toLowerCase() === 'pagesize');
    const hasPagNum = params.some(p => p.name?.toLowerCase() === 'pagenumber');
    if (hasPagSize && hasPagNum) {
      supportsPagination = true;
      paginationType = 'PageNumber';
    }
  }

  // Incremental sync — look for modified-since style params
  let incrementalWatermarkField = null;
  let supportsIncrementalSync = false;
  if (readOp) {
    const wcs = (readOp.op.parameters || []).filter(p => {
      const n = (p.name || '').toLowerCase();
      return n.includes('modifiedsince') || n.includes('lastmodified') || n.includes('updatedsince') || n.includes('changedsince') || n === 'datemodified';
    });
    if (wcs.length > 0) {
      supportsIncrementalSync = true;
      incrementalWatermarkField = wcs[0].name;
    }
  }

  const summaries = ops
    .map(o => o.op.summary)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3);
  const description = summaries.length > 0
    ? `${summaries.join(' / ')} (source: OpenAPI ${collectionPath}).`
    : `YourMembership AMS resource family ${fam.name}. Source: OpenAPI ${collectionPath}.`;

  const category = deriveCategory(fam.name);

  const ioFields = {
    IntegrationID: '@parent:ID',
    Name: fam.name,
    DisplayName: fam.name,
    Description: description,
    Category: category,
    APIPath: collectionPath,
    ResponseDataKey: arrayPropName,
    PaginationType: paginationType,
    SupportsPagination: supportsPagination,
    SupportsIncrementalSync: supportsIncrementalSync,
    IncrementalWatermarkField: incrementalWatermarkField,
    SupportsRead: !!readOp,
    SupportsCreate: !!createOp,
    SupportsUpdate: !!updateOp,
    SupportsDelete: !!deleteOp,
    SupportsWrite: !!(createOp || updateOp || deleteOp),
    Sequence: seq++,
    Status: 'Active',
  };

  // Per-operation CRUD slots (v5.39.x convention)
  if (createOp) {
    const bodyShape = getRequestBodyShape(createOp.op);
    ioFields.CreateAPIPath = createOp.path;
    ioFields.CreateMethod = createOp.method.toUpperCase();
    ioFields.CreateBodyShape = bodyShape;
    ioFields.CreateBodyKey = null;
    ioFields.CreateIDLocation = null;
    evidence.push({
      claim: `${fam.name}.CreateAPIPath/Method/BodyShape`,
      scriptPath: SCRIPT_REL_PATH,
      structuralSignal: `OpenAPI path '${createOp.path}' declares method '${createOp.method.toUpperCase()}' with bodyShape='${bodyShape}'`,
    });
  }
  if (updateOp) {
    const bodyShape = getRequestBodyShape(updateOp.op);
    ioFields.UpdateAPIPath = updateOp.path;
    ioFields.UpdateMethod = updateOp.method.toUpperCase();
    ioFields.UpdateBodyShape = bodyShape;
    ioFields.UpdateBodyKey = null;
    const pathParamMatch = updateOp.path.match(/\{([^}]+)\}/g) || [];
    ioFields.UpdateIDLocation = pathParamMatch.length > 1 ? 'path' : null;
    evidence.push({
      claim: `${fam.name}.UpdateAPIPath/Method/BodyShape`,
      scriptPath: SCRIPT_REL_PATH,
      structuralSignal: `OpenAPI path '${updateOp.path}' declares method '${updateOp.method.toUpperCase()}' with bodyShape='${bodyShape}'`,
    });
  }
  if (deleteOp) {
    ioFields.DeleteAPIPath = deleteOp.path;
    ioFields.DeleteMethod = deleteOp.method.toUpperCase();
    ioFields.DeleteBodyShape = null;
    ioFields.DeleteBodyKey = null;
    const pathParamMatch = deleteOp.path.match(/\{([^}]+)\}/g) || [];
    ioFields.DeleteIDLocation = pathParamMatch.length > 1 ? 'path' : null;
    evidence.push({
      claim: `${fam.name}.DeleteAPIPath/Method`,
      scriptPath: SCRIPT_REL_PATH,
      structuralSignal: `OpenAPI path '${deleteOp.path}' declares method 'DELETE'`,
    });
  }

  // Build IOFs.
  const iofRows = [];
  let iofSeq = 1;
  for (const f of respFields) {
    const { Type, Length } = mapType(f);
    const isPK = detectExplicitPK(f);

    // FK detection — name-based heuristic only for the parametric parent IDs.
    // We do NOT emit FKs to Member/Event because those IOs are owned by
    // sibling extractors (different naming, ID not resolvable from THIS script's
    // emission set). The sibling-owned IO sets carry their own FK logic.
    let isForeignKey = false;
    let relatedIntegrationObject = null;

    if (isPK) {
      stats.PKsExplicitlyEmitted++;
      evidence.push({
        claim: `${fam.name}.${f.name}.IsPrimaryKey=true`,
        scriptPath: SCRIPT_REL_PATH,
        structuralSignal: `Field description contains explicit PK marker: "${(f.description || '').slice(0, 120)}"`,
      });
    }
    if (f.required) {
      evidence.push({
        claim: `${fam.name}.${f.name}.IsRequired=true`,
        scriptPath: SCRIPT_REL_PATH,
        structuralSignal: `Field appears in 'required' array of response schema`,
      });
    }
    if (f.isReadOnly) {
      evidence.push({
        claim: `${fam.name}.${f.name}.IsReadOnly=true`,
        scriptPath: SCRIPT_REL_PATH,
        structuralSignal: `Field declares readOnly=true in OpenAPI schema`,
      });
    }

    iofRows.push({
      fields: {
        IntegrationObjectID: '@parent:ID',
        Name: f.name,
        DisplayName: f.name,
        Description: f.description || null,
        Type,
        Length: Length,
        AllowsNull: !f.required,
        IsRequired: !!f.required,
        IsReadOnly: !!f.isReadOnly,
        IsUniqueKey: false,
        IsPrimaryKey: isPK,
        IsForeignKey: isForeignKey,
        RelatedIntegrationObjectID: relatedIntegrationObject,
        Sequence: iofSeq++,
        Status: 'Active',
      },
    });
  }

  if (iofRows.length === 0) stats.FamiliesWithEmptyFieldSet.push(fam.name);

  evidence.push({
    claim: `${fam.name}.APIPath / SupportsRead/Create/Update/Delete`,
    scriptPath: SCRIPT_REL_PATH,
    structuralSignal: `Operations observed: ${ops.map(o => `${o.method.toUpperCase()} ${o.path}`).join('; ')}`,
  });
  evidence.push({
    claim: `${fam.name}.PaginationType=${paginationType ?? 'null'} SupportsPagination=${supportsPagination}`,
    scriptPath: SCRIPT_REL_PATH,
    structuralSignal: readOp
      ? `Read op parameter names: ${(readOp.op.parameters || []).map(p => p.name).join(', ') || '(none)'}`
      : 'No GET op exists for this family',
  });
  if (supportsIncrementalSync) {
    evidence.push({
      claim: `${fam.name}.SupportsIncrementalSync=true IncrementalWatermarkField=${incrementalWatermarkField}`,
      scriptPath: SCRIPT_REL_PATH,
      structuralSignal: `Read op declares modified-since-style parameter '${incrementalWatermarkField}'`,
    });
  }

  IOs.push({
    fields: ioFields,
    relatedEntities: {
      'MJ: Integration Object Fields': iofRows,
    },
  });
  stats.IOsEmitted++;
  stats.IOFsEmitted += iofRows.length;
}

// ---------------------------------------------------------------------------
// WRITE OUTPUTS
// ---------------------------------------------------------------------------

const integrationJson = JSON.parse(readFileSync(METADATA_JSON_PATH, 'utf8'));
if (!Array.isArray(integrationJson) || integrationJson.length === 0) {
  throw new Error('Integration JSON missing or empty');
}
const integrationRecord = integrationJson[0];
if (!integrationRecord.relatedEntities) integrationRecord.relatedEntities = {};
if (!integrationRecord.relatedEntities['MJ: Integration Objects']) {
  integrationRecord.relatedEntities['MJ: Integration Objects'] = [];
}

// Set-completeness rule (this run's emissions are this script's complete set):
//   - Replace any IO previously emitted by THIS script (same Name as one of OUR emissions).
//   - Preserve all sibling-emitted IOs (Names NOT in our set).
const existing = integrationRecord.relatedEntities['MJ: Integration Objects'];
const ourNames = new Set(IOs.map(io => io.fields.Name));
const preserved = existing.filter(io => !ourNames.has(io.fields?.Name));
integrationRecord.relatedEntities['MJ: Integration Objects'] = preserved.concat(IOs);

writeFileSync(METADATA_JSON_PATH, JSON.stringify(integrationJson, null, 2) + '\n', 'utf8');

// Append CODE_EVIDENCE entries.
let codeEvidence;
if (existsSync(CODE_EVIDENCE_PATH)) {
  codeEvidence = JSON.parse(readFileSync(CODE_EVIDENCE_PATH, 'utf8'));
} else {
  codeEvidence = { entries: [] };
}
if (!Array.isArray(codeEvidence.entries)) codeEvidence.entries = [];
// Idempotency: remove any prior entries from THIS script before appending fresh ones.
codeEvidence.entries = codeEvidence.entries.filter(e => e.scriptPath !== SCRIPT_REL_PATH);
codeEvidence.entries.push(...evidence.map(e => ({
  claim: e.claim,
  scriptPath: e.scriptPath,
  scriptInputs: [SNAPSHOT_PATH],
  reproduction: {
    run: `node ${SCRIPT_REL_PATH}`,
    verify: `Inspect stdout JSON.IOs / .IOFs for the named family`,
  },
  structuralSignal: e.structuralSignal,
})));
writeFileSync(CODE_EVIDENCE_PATH, JSON.stringify(codeEvidence, null, 2) + '\n', 'utf8');

// Structured stdout summary
console.log(JSON.stringify({
  IOCreated: stats.IOsEmitted,
  IOFCreated: stats.IOFsEmitted,
  PKsExplicitlyEmitted: stats.PKsExplicitlyEmitted,
  FKsEmitted: stats.FKsEmitted,
  GapsForRuntimeD4: stats.IOsEmitted - stats.PKsExplicitlyEmitted,
  TraversalOrderLength: stats.IOsEmitted, // flat — all top-level Ams families, no hierarchy in this scope
  IOsConsidered: stats.IOsConsidered,
  TotalAmsTaggedOps: stats.TotalAmsTaggedOps,
  FamiliesWithNoResponseSchema: stats.FamiliesWithNoResponseSchema,
  FamiliesWithEmptyFieldSet: stats.FamiliesWithEmptyFieldSet,
  ExcludedScaffoldingObserved: stats.ExcludedScaffoldingObserved,
  ExcludedCrossVendorObserved: stats.ExcludedCrossVendorObserved,
  ExcludedAuthObserved: stats.ExcludedAuthObserved,
  ExcludedMemberSubresourceCount: stats.ExcludedMemberSubresourceObserved.length,
  ExcludedEventSubresourceCount: stats.ExcludedEventSubresourceObserved.length,
  WallClockMs: Date.now() - startedAt,
}, null, 2));
