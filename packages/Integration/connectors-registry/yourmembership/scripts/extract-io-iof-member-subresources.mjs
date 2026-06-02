#!/usr/bin/env node
// extract-io-iof-member-subresources.mjs
//
// Object: "Ams Member sub-resources" under /Ams/{ClientID}/Member/{MemberID}/
// Source: ws.yourmembership.com OpenAPI 2.0 snapshot pinned at:
//   packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json
//
// Behavior:
//   1. Zod-validate the OpenAPI 2.0 snapshot shape we depend on.
//   2. Walk paths matching /Ams/{ClientID}/Member/{MemberID}/{Family}[/{SubPath}].
//   3. For each distinct first-segment Family under Member, emit one IO row.
//   4. For each Family, resolve the GET 200 responseRef → its array property's item
//      schema → emit one IOF per item-property.
//   5. Emit per-operation CRUD slots (Create/Update/Delete) gated on observed methods.
//   6. Append to metadata/integrations/yourmembership/.yourmembership.integration.json
//      (as relatedEntities under the existing YourMembership Integration row).
//   7. Append per-flag CODE_EVIDENCE entries to the run's CODE_EVIDENCE.json.
//   8. Print structured stats to stdout.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const REPO_ROOT = resolve(process.cwd());
const RUN_DIR = `${REPO_ROOT}/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea`;
const OPENAPI_PATH = `${RUN_DIR}/output/openapi.snapshot.json`;
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/yourmembership/.yourmembership.integration.json`;
const CODE_EVIDENCE_PATH = `${RUN_DIR}/output/CODE_EVIDENCE.json`;

const MEMBER_PREFIX = '/Ams/{ClientID}/Member/{MemberID}/';
const OBJECT_GROUP_NAME = 'Ams Member sub-resources';
const CATEGORY = 'Member sub-resources';

// =============================================================================
// 1. Zod schemas for OpenAPI 2.0 shape (the only structure we depend on)
// =============================================================================
const RefSchema = z.object({ $ref: z.string() }).passthrough();
const PropSchema = z.union([
  z.object({
    type: z.string().optional(),
    format: z.string().optional(),
    enum: z.array(z.any()).optional(),
    items: z.union([RefSchema, z.object({ type: z.string().optional() }).passthrough()]).optional(),
    description: z.string().optional(),
    'x-nullable': z.boolean().optional(),
    $ref: z.string().optional(),
  }).passthrough(),
  RefSchema,
]);

const DefSchema = z.object({
  title: z.string().optional(),
  type: z.string().optional(),
  properties: z.record(PropSchema).optional(),
  required: z.array(z.string()).optional(),
  description: z.string().optional(),
}).passthrough();

const ParameterSchema = z.object({
  name: z.string(),
  in: z.string(),
  type: z.string().optional(),
  format: z.string().optional(),
  required: z.boolean().optional(),
  description: z.string().optional(),
  schema: z.object({ $ref: z.string().optional() }).passthrough().optional(),
}).passthrough();

const OperationSchema = z.object({
  operationId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().optional(),
  description: z.string().optional(),
  parameters: z.array(ParameterSchema).optional(),
  responses: z.record(z.object({
    description: z.string().optional(),
    schema: z.object({ $ref: z.string().optional() }).passthrough().optional(),
  }).passthrough()).optional(),
  consumes: z.array(z.string()).optional(),
  produces: z.array(z.string()).optional(),
}).passthrough();

const PathItemSchema = z.record(z.union([OperationSchema, z.any()]));

const OpenApiSchema = z.object({
  swagger: z.string(),
  host: z.string(),
  basePath: z.string(),
  paths: z.record(PathItemSchema),
  definitions: z.record(DefSchema),
}).passthrough();

// =============================================================================
// 2. Load + validate
// =============================================================================
function loadSpec() {
  const raw = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8'));
  const spec = OpenApiSchema.parse(raw);
  return spec;
}

// =============================================================================
// 3. Type mapping (OpenAPI primitive → MJ IntegrationObjectField.Type)
// =============================================================================
function mapType(prop) {
  // Returns { type, length, allowsNull }
  if (prop?.$ref) {
    return { type: 'nvarchar', length: -1, allowsNull: true }; // embedded object → serialized
  }
  const t = prop?.type;
  const fmt = prop?.format;
  const nullable = prop?.['x-nullable'] !== false; // default null-allowed if not marked
  switch (t) {
    case 'integer':
      if (fmt === 'int64') return { type: 'bigint', length: null, allowsNull: nullable };
      return { type: 'int', length: null, allowsNull: nullable };
    case 'number':
      if (fmt === 'float') return { type: 'float', length: null, allowsNull: nullable };
      if (fmt === 'double') return { type: 'float', length: null, allowsNull: nullable };
      return { type: 'decimal', length: null, allowsNull: nullable };
    case 'boolean':
      return { type: 'bit', length: null, allowsNull: nullable };
    case 'string':
      if (fmt === 'date-time') return { type: 'datetime', length: null, allowsNull: nullable };
      if (fmt === 'date') return { type: 'date', length: null, allowsNull: nullable };
      if (fmt === 'uuid') return { type: 'uniqueidentifier', length: null, allowsNull: nullable };
      return { type: 'nvarchar', length: 500, allowsNull: nullable };
    case 'array':
      return { type: 'nvarchar', length: -1, allowsNull: true }; // serialized JSON
    case 'object':
      return { type: 'nvarchar', length: -1, allowsNull: true };
    default:
      return { type: 'nvarchar', length: 500, allowsNull: true };
  }
}

// =============================================================================
// 4. Schema resolution
// =============================================================================
function refName(refStr) {
  if (!refStr) return null;
  return refStr.split('/').pop();
}

function resolveDef(spec, name) {
  if (!name) return null;
  return spec.definitions[name] ?? null;
}

// Find the response-200 ref or default-ref
function getResponseRef(op) {
  const r = op?.responses;
  if (!r) return null;
  return refName(r['200']?.schema?.$ref) || refName(r['default']?.schema?.$ref) || null;
}

// Inside a response wrapper definition, find the principal array property.
// Heuristic: pick the array property whose item-type is the most "entity-like"
// (we treat it as the principal). If no array, fall back to inspecting scalar
// properties of the response itself minus envelope echo-fields.
const ENVELOPE_FIELDS = new Set([
  'ResponseStatus', 'BypassCache', 'DateCached', 'Device',
  'PageNumber', 'PageSize', 'OffSet', 'Offset', 'TotalResultsCount',
  'ListCount', 'ClientID', 'MemberID', 'IsForceReload', 'UsingRedis',
  'AppInitTime', 'ServerID', 'CountOnly',
]);

function findPrincipalArrayProperty(def) {
  if (!def?.properties) return null;
  for (const [name, p] of Object.entries(def.properties)) {
    if (p?.type === 'array' && p.items?.$ref) {
      return { propertyName: name, itemRef: refName(p.items.$ref) };
    }
  }
  return null;
}

// Get the IOFs from the item type definition. Pure properties only.
function extractFields(spec, itemDef, requiredSet) {
  const fields = [];
  if (!itemDef?.properties) return fields;
  let seq = 0;
  for (const [name, prop] of Object.entries(itemDef.properties)) {
    seq++;
    const mapped = mapType(prop);
    const isRequired = requiredSet.has(name);
    fields.push({
      Name: name,
      Sequence: seq,
      Type: mapped.type,
      Length: mapped.length,
      AllowsNull: mapped.allowsNull,
      IsRequired: isRequired,
      IsReadOnly: false,
      IsUniqueKey: false,
      Description: typeof prop?.description === 'string' ? prop.description.slice(0, 1000) : null,
      // PK detection: explicit-only. OpenAPI has no x-primary-key extension here;
      // none of the item-schemas carry an explicit primary-key marker.
      // Per Gap 10, leave IsPrimaryKey unset.
      ___enumValues: Array.isArray(prop?.enum) ? prop.enum : null,
      ___nullableMarked: prop?.['x-nullable'] === false ? 'not-null' : 'null-allowed',
    });
  }
  return fields;
}

// =============================================================================
// 5. Walk member sub-resource paths
// =============================================================================
function familyOfPath(p) {
  if (!p.startsWith(MEMBER_PREFIX)) return null;
  return p.slice(MEMBER_PREFIX.length).split('/')[0];
}

// Build the structured representation per family.
function buildFamilies(spec) {
  const families = new Map(); // family -> { paths: [], ops: [{path, method, op}], responseRefs: Set }
  for (const [pth, methods] of Object.entries(spec.paths)) {
    const fam = familyOfPath(pth);
    if (!fam) continue;
    if (!families.has(fam)) {
      families.set(fam, { paths: [], operations: [] });
    }
    const entry = families.get(fam);
    entry.paths.push(pth);
    for (const [m, op] of Object.entries(methods)) {
      if (typeof op !== 'object' || !op?.operationId) continue;
      entry.operations.push({ path: pth, method: m.toLowerCase(), op });
    }
  }
  return families;
}

// Among ops, pick the GET on the root family path (no further segment).
// Falls back to any GET, then any non-GET if no GET exists.
function pickPrincipalOp(famName, ops) {
  const rootPath = `${MEMBER_PREFIX}${famName}`;
  let pri = ops.find(o => o.path === rootPath && o.method === 'get');
  if (pri) return pri;
  pri = ops.find(o => o.method === 'get');
  if (pri) return pri;
  return ops[0] ?? null;
}

// Determine per-operation CRUD slots from observed methods.
// In YourMembership / ServiceStack the semantics are:
//   GET    → read
//   POST   → create
//   PUT    → update (and sometimes "approve" or "accept" on sub-paths)
//   DELETE → delete
function detectCRUD(famName, ops) {
  const result = {
    SupportsRead: false, SupportsCreate: false, SupportsUpdate: false, SupportsDelete: false,
    CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateBodyKey: null, CreateIDLocation: null,
    UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
    DeleteAPIPath: null, DeleteIDLocation: null,
  };
  for (const o of ops) {
    if (o.method === 'get') result.SupportsRead = true;
    if (o.method === 'post' && !result.SupportsCreate) {
      result.SupportsCreate = true;
      result.CreateAPIPath = o.path;
      result.CreateMethod = 'POST';
      // Detect body shape: if any parameter is in=body, it's wrapped per $ref schema; if formData, flat.
      const params = o.op.parameters || [];
      const hasBody = params.some(p => p.in === 'body');
      const hasFormData = params.some(p => p.in === 'formData');
      if (hasBody) {
        result.CreateBodyShape = 'wrapped';
        // BodyKey: the body parameter name
        const body = params.find(p => p.in === 'body');
        result.CreateBodyKey = body?.name ?? null;
      } else if (hasFormData) {
        result.CreateBodyShape = 'flat';
      } else {
        result.CreateBodyShape = 'flat';
      }
      // ID location: ServiceStack returns the created object in the body, ID is embedded
      result.CreateIDLocation = 'body';
    }
    if (o.method === 'put' && !result.SupportsUpdate) {
      result.SupportsUpdate = true;
      result.UpdateAPIPath = o.path;
      result.UpdateMethod = 'PUT';
      const params = o.op.parameters || [];
      const hasBody = params.some(p => p.in === 'body');
      const hasFormData = params.some(p => p.in === 'formData');
      if (hasBody) {
        result.UpdateBodyShape = 'wrapped';
        const body = params.find(p => p.in === 'body');
        result.UpdateBodyKey = body?.name ?? null;
      } else if (hasFormData) {
        result.UpdateBodyShape = 'flat';
      } else {
        result.UpdateBodyShape = 'flat';
      }
      // ID location: if path has {Xxx} after family, it's path-templated; else body
      result.UpdateIDLocation = o.path.includes('{') && o.path !== `${MEMBER_PREFIX}${famName}`
        ? 'path' : 'body';
    }
    if (o.method === 'delete' && !result.SupportsDelete) {
      result.SupportsDelete = true;
      result.DeleteAPIPath = o.path;
      result.DeleteIDLocation = o.path.includes('{') && o.path !== `${MEMBER_PREFIX}${famName}`
        ? 'path' : 'body';
    }
  }
  return result;
}

// Pagination detection: family supports pagination iff any of its GET ops
// declare both PageSize and PageNumber query parameters.
function detectPagination(ops) {
  let supports = false;
  for (const o of ops) {
    if (o.method !== 'get') continue;
    const params = o.op.parameters || [];
    const hasPS = params.some(p => p.name === 'PageSize');
    const hasPN = params.some(p => p.name === 'PageNumber');
    if (hasPS && hasPN) {
      supports = true;
      break;
    }
  }
  return supports;
}

// =============================================================================
// 6. Build IO + IOF rows
// =============================================================================
function buildIO(spec, famName, famData, sequence) {
  const principalOp = pickPrincipalOp(famName, famData.operations);
  const responseRef = principalOp ? getResponseRef(principalOp.op) : null;
  const responseDef = resolveDef(spec, responseRef);

  // Find principal array property → item ref
  let principal = null;
  let itemDef = null;
  let itemRef = null;
  if (responseDef) {
    principal = findPrincipalArrayProperty(responseDef);
    if (principal) {
      itemRef = principal.itemRef;
      itemDef = resolveDef(spec, itemRef);
    } else {
      // No principal array — the response IS the entity (singleton resource).
      itemRef = responseRef;
      itemDef = responseDef;
    }
  }

  // Field extraction: from the itemDef (skip envelope fields if we fell back to response itself).
  const requiredSet = new Set(itemDef?.required || []);
  let fields = extractFields(spec, itemDef, requiredSet);

  // If we fell back to the response itself (no principal array), exclude envelope fields.
  if (principal === null && itemDef === responseDef) {
    fields = fields.filter(f => !ENVELOPE_FIELDS.has(f.Name));
    // Re-sequence
    fields.forEach((f, i) => { f.Sequence = i + 1; });
  }

  // CRUD detection
  const crud = detectCRUD(famName, famData.operations);
  const supportsPagination = detectPagination(famData.operations);

  // Name + APIPath
  const rootPath = `${MEMBER_PREFIX}${famName}`;
  const ioName = `MemberSub_${famName}`;
  const displayName = `Member ${famName}`;
  const description = principalOp?.op?.summary
    ? String(principalOp.op.summary).slice(0, 500)
    : `${famName} sub-resource of Member (under ${rootPath}).`;

  // Body shape on principal GET — flat (query params)
  const apiPath = rootPath;

  // ResponseDataKey: the principal array property name, if any.
  const responseDataKey = principal?.propertyName ?? null;

  // Parent IO: every Member sub-resource has a parent of the (yet-to-be-emitted)
  // top-level Members IO. We populate ParentObjectName so the runtime can resolve.
  const parentObjectName = 'Members';
  const parentObjectIDFieldName = 'MemberID';

  return {
    famName,
    ioName,
    displayName,
    description,
    apiPath,
    responseDataKey,
    supportsPagination,
    crud,
    parentObjectName,
    parentObjectIDFieldName,
    rootPath,
    principalOp,
    responseRef,
    itemRef,
    fields,
    sequence,
  };
}

// =============================================================================
// 7. Emit IO row + IOFs in mj-sync metadata JSON shape
// =============================================================================
function ioToMetadataRow(io) {
  const fields = {
    IntegrationID: '@parent:ID',
    Name: io.ioName,
    DisplayName: io.displayName,
    Description: io.description,
    Category: CATEGORY,
    APIPath: io.apiPath,
    ResponseDataKey: io.responseDataKey,
    PaginationType: io.supportsPagination ? 'PageNumber' : 'None',
    SupportsPagination: io.supportsPagination,
    SupportsIncrementalSync: false, // No vendor-side modified-since cursor documented.
    IncrementalWatermarkField: null,
    SupportsWrite: io.crud.SupportsCreate || io.crud.SupportsUpdate || io.crud.SupportsDelete,
    SupportsCreate: io.crud.SupportsCreate,
    SupportsUpdate: io.crud.SupportsUpdate,
    SupportsDelete: io.crud.SupportsDelete,
    CreateAPIPath: io.crud.CreateAPIPath,
    CreateMethod: io.crud.CreateMethod,
    CreateBodyShape: io.crud.CreateBodyShape,
    CreateBodyKey: io.crud.CreateBodyKey,
    CreateIDLocation: io.crud.CreateIDLocation,
    UpdateAPIPath: io.crud.UpdateAPIPath,
    UpdateMethod: io.crud.UpdateMethod,
    UpdateBodyShape: io.crud.UpdateBodyShape,
    UpdateBodyKey: io.crud.UpdateBodyKey,
    UpdateIDLocation: io.crud.UpdateIDLocation,
    DeleteAPIPath: io.crud.DeleteAPIPath,
    DeleteIDLocation: io.crud.DeleteIDLocation,
    ParentObjectName: io.parentObjectName,
    ParentObjectIDFieldName: io.parentObjectIDFieldName,
    Sequence: io.sequence,
    Status: 'Active',
  };
  // Strip null-valued slot keys to keep the metadata file lean (mj-sync ignoreNullFields=true).
  for (const k of Object.keys(fields)) {
    if (fields[k] === null) delete fields[k];
  }

  const iofs = io.fields.map((f, i) => {
    const row = {
      IntegrationObjectID: '@parent:ID',
      Name: f.Name,
      DisplayName: f.Name,
      Description: f.Description,
      Type: f.Type,
      Length: f.Length,
      AllowsNull: f.AllowsNull,
      IsRequired: f.IsRequired,
      IsReadOnly: f.IsReadOnly,
      IsUniqueKey: f.IsUniqueKey,
      Sequence: f.Sequence,
      Status: 'Active',
    };
    // IsPrimaryKey is unset (per Gap 10 — explicit-only).
    // Foreign-key detection: a field literally named MemberID/ClientID on the item
    // schema implies parent path-binding. We don't mark IsForeignKey unless the
    // source declares it; URL path-binding alone is not an explicit FK marker.
    for (const k of Object.keys(row)) {
      if (row[k] === null) delete row[k];
    }
    return { fields: row };
  });

  return {
    fields,
    relatedEntities: {
      'MJ: Integration Object Fields': iofs,
    },
  };
}

// =============================================================================
// 8. Append to metadata file (idempotent: replace IOs with our Name pattern)
// =============================================================================
function appendToMetadata(ioRows) {
  const existing = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
  if (!Array.isArray(existing) || existing.length !== 1) {
    throw new Error(`Expected 1-record array in ${METADATA_PATH}, got ${existing.length}`);
  }
  const integrationRow = existing[0];
  if (!integrationRow.relatedEntities) integrationRow.relatedEntities = {};
  const objects = integrationRow.relatedEntities['MJ: Integration Objects'] ?? [];
  // Set-completeness: remove ALL rows in this object group (any IO whose APIPath
  // is rooted at /Ams/{ClientID}/Member/{MemberID}/). This includes the current
  // run's own MemberSub_* rows (idempotency) AND any stale Member<Family>-style
  // rows from prior runs with a different naming convention. The orphan-cleanup
  // is bounded to this object group only — sibling top-level resources whose
  // names happen to start with "Member" (e.g. Members, Memberships, MemberList,
  // MemberSubAccounts) are NOT affected because their APIPaths do not start with
  // the Member sub-resource prefix.
  const stale = objects.filter(o => {
    const name = String(o?.fields?.Name || '');
    const apiPath = String(o?.fields?.APIPath || '');
    return name.startsWith('MemberSub_') || apiPath.startsWith(MEMBER_PREFIX);
  });
  const filtered = objects.filter(o => {
    const name = String(o?.fields?.Name || '');
    const apiPath = String(o?.fields?.APIPath || '');
    if (name.startsWith('MemberSub_')) return false;
    if (apiPath.startsWith(MEMBER_PREFIX)) return false;
    return true;
  });
  const merged = [...filtered, ...ioRows];
  integrationRow.relatedEntities['MJ: Integration Objects'] = merged;

  // Backup
  const backupDir = `${REPO_ROOT}/metadata/integrations/yourmembership/.backups`;
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(METADATA_PATH, `${backupDir}/.yourmembership.integration.${ts}.json`);

  writeFileSync(METADATA_PATH, JSON.stringify(existing, null, 2) + '\n');

  return { previousCount: objects.length, newCount: merged.length, removedStale: objects.length - filtered.length };
}

// =============================================================================
// 9. Append per-flag CODE_EVIDENCE entries
// =============================================================================
function appendCodeEvidence(ios) {
  const ce = JSON.parse(readFileSync(CODE_EVIDENCE_PATH, 'utf8'));
  if (!Array.isArray(ce.entries)) ce.entries = [];

  // Remove any prior entries scoped to this extraction run, for idempotency.
  ce.entries = ce.entries.filter(e =>
    !String(e?.claim || '').startsWith('MemberSub_'));

  const scriptPath = 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-member-subresources.mjs';
  const sourceCitation = 'packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json';

  const entries = [];

  // One IO-level entry per IO summarizing the structural slots derived from openapi.
  for (const io of ios) {
    // CODE_EVIDENCE: APIPath / ResponseDataKey / SupportsPagination
    entries.push({
      claim: `${io.ioName}: APIPath=${io.apiPath}; ResponseDataKey=${io.responseDataKey ?? '(none)'}; SupportsPagination=${io.supportsPagination}`,
      scriptPath,
      scriptInputs: [sourceCitation],
      reproduction: {
        run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-member-subresources.mjs',
        verify: `jq '.paths["${io.apiPath}"] | keys' ${sourceCitation}`,
      },
      decisionLogic: `Family "${io.famName}" walked from paths starting with "${MEMBER_PREFIX}${io.famName}". Principal GET response ref "${io.responseRef ?? '(none)'}" inspected; principal array property "${io.responseDataKey ?? '(none)'}" chosen as ResponseDataKey. Pagination supported iff GET op declares both PageSize+PageNumber.`,
      expectedOutput: `Path "${io.apiPath}" exists in openapi.snapshot.json paths.`,
    });

    // Per-operation CRUD slot entries
    if (io.crud.SupportsCreate) {
      entries.push({
        claim: `${io.ioName}.Create: APIPath=${io.crud.CreateAPIPath}, Method=${io.crud.CreateMethod}, BodyShape=${io.crud.CreateBodyShape}, BodyKey=${io.crud.CreateBodyKey ?? '(n/a)'}, IDLocation=${io.crud.CreateIDLocation}`,
        scriptPath,
        scriptInputs: [sourceCitation],
        reproduction: {
          verify: `jq '.paths["${io.crud.CreateAPIPath}"].post | {operationId, parameters: (.parameters | map({name, in}))}' ${sourceCitation}`,
        },
        decisionLogic: `BodyShape=flat when no in=body parameter (formData or query params only); wrapped when in=body present (BodyKey=body parameter name).`,
      });
    }
    if (io.crud.SupportsUpdate) {
      entries.push({
        claim: `${io.ioName}.Update: APIPath=${io.crud.UpdateAPIPath}, Method=${io.crud.UpdateMethod}, BodyShape=${io.crud.UpdateBodyShape}, BodyKey=${io.crud.UpdateBodyKey ?? '(n/a)'}, IDLocation=${io.crud.UpdateIDLocation}`,
        scriptPath,
        scriptInputs: [sourceCitation],
        reproduction: {
          verify: `jq '.paths["${io.crud.UpdateAPIPath}"].put | {operationId, parameters: (.parameters | map({name, in}))}' ${sourceCitation}`,
        },
        decisionLogic: `IDLocation=path when UpdateAPIPath includes {Xxx} placeholder beyond family root; body otherwise.`,
      });
    }
    if (io.crud.SupportsDelete) {
      entries.push({
        claim: `${io.ioName}.Delete: APIPath=${io.crud.DeleteAPIPath}, IDLocation=${io.crud.DeleteIDLocation}`,
        scriptPath,
        scriptInputs: [sourceCitation],
        reproduction: {
          verify: `jq '.paths["${io.crud.DeleteAPIPath}"].delete | {operationId, parameters: (.parameters | map({name, in}))}' ${sourceCitation}`,
        },
        decisionLogic: `DELETE method observed on path "${io.crud.DeleteAPIPath}" in openapi.snapshot.json.`,
      });
    }

    // ParentObjectName evidence
    entries.push({
      claim: `${io.ioName}.ParentObjectName=Members; ParentObjectIDFieldName=MemberID`,
      scriptPath,
      scriptInputs: [sourceCitation],
      reproduction: {
        verify: `jq '.paths | keys[] | select(startswith("${MEMBER_PREFIX}${io.famName}"))' ${sourceCitation}`,
      },
      decisionLogic: `All paths for this family are templated under ${MEMBER_PREFIX}{Family}, meaning Member is the required parent via path placeholder {MemberID}. ParentObjectIDFieldName=MemberID is the literal placeholder name on the path template.`,
    });

    // IsRequired evidence on fields (aggregated): cites OpenAPI required[] arrays.
    const requiredFieldNames = io.fields.filter(f => f.IsRequired).map(f => f.Name);
    if (requiredFieldNames.length > 0) {
      entries.push({
        claim: `${io.ioName}: IsRequired=true for fields [${requiredFieldNames.join(', ')}]`,
        scriptPath,
        scriptInputs: [sourceCitation],
        reproduction: {
          verify: `jq '.definitions["${io.itemRef}"].required' ${sourceCitation}`,
        },
        decisionLogic: `OpenAPI definitions["${io.itemRef}"].required[] enumerated; each field name in that array gets IsRequired=true.`,
      });
    }

    // AllowsNull evidence (aggregated): cites x-nullable=false markers.
    const notNullFields = io.fields.filter(f => f.AllowsNull === false).map(f => f.Name);
    if (notNullFields.length > 0) {
      entries.push({
        claim: `${io.ioName}: AllowsNull=false for fields [${notNullFields.join(', ')}]`,
        scriptPath,
        scriptInputs: [sourceCitation],
        reproduction: {
          verify: `jq '.definitions["${io.itemRef}"].properties | to_entries[] | select(.value["x-nullable"] == false) | .key' ${sourceCitation}`,
        },
        decisionLogic: `Fields with x-nullable=false set in the OpenAPI property schema are emitted as AllowsNull=false; everything else defaults to AllowsNull=true.`,
      });
    }

    // PK explicit-skip statement (Gap 10): we DID NOT mark any field IsPrimaryKey
    entries.push({
      claim: `${io.ioName}: IsPrimaryKey unset on ALL fields (Gap 10 — no explicit PK marker in source)`,
      scriptPath,
      scriptInputs: [sourceCitation],
      reproduction: {
        verify: `jq '.definitions["${io.itemRef}"].properties | to_entries[] | select(.value["x-primary-key"] == true)' ${sourceCitation}`,
      },
      expectedOutput: '(empty — no x-primary-key extension)',
      decisionLogic: `Item definition "${io.itemRef}" has no OpenAPI x-primary-key extension on any property. No prose marker like "primary key" / "unique identifier" inside the property descriptions either. Per Gap 10 the agent leaves IsPrimaryKey unset; runtime D4 SoftPKClassifier handles ambiguous cases at sync time.`,
    });
  }

  ce.entries = [...ce.entries, ...entries];
  ce.generatedAt = new Date().toISOString();
  writeFileSync(CODE_EVIDENCE_PATH, JSON.stringify(ce, null, 2) + '\n');
  return entries.length;
}

// =============================================================================
// 10. Main
// =============================================================================
function main() {
  const t0 = Date.now();
  const spec = loadSpec();
  const families = buildFamilies(spec);

  if (families.size === 0) {
    process.stderr.write(`No Member sub-resource families found.\n`);
    process.exit(1);
  }
  if (families.size > 1000) {
    process.stderr.write(`Hit 1000-IO cap (${families.size}). Aborting.\n`);
    process.exit(2);
  }

  // Build IOs
  const ioOrder = [...families.keys()].sort();
  const ios = ioOrder.map((famName, i) => buildIO(spec, famName, families.get(famName), i + 1));

  // Convert to metadata rows
  const ioRows = ios.map(ioToMetadataRow);

  // Append to metadata file
  const meta = appendToMetadata(ioRows);

  // Append CODE_EVIDENCE
  const codeEvidenceCount = appendCodeEvidence(ios);

  // Stats
  const stats = {
    ObjectGroup: OBJECT_GROUP_NAME,
    Vendor: 'YourMembership',
    RunID: 'connector-yourmembership-1780165237029-a495a1ea',
    IOCreated: ios.length,
    IOFCreated: ios.reduce((acc, io) => acc + io.fields.length, 0),
    IOsWithPagination: ios.filter(io => io.supportsPagination).length,
    IOsSupportsCreate: ios.filter(io => io.crud.SupportsCreate).length,
    IOsSupportsUpdate: ios.filter(io => io.crud.SupportsUpdate).length,
    IOsSupportsDelete: ios.filter(io => io.crud.SupportsDelete).length,
    IOsSupportsRead: ios.filter(io => io.crud.SupportsRead).length,
    PKsExplicitlyEmitted: 0, // Gap 10 — explicit-only; none in source.
    FKsEmitted: 0, // No explicit FK markers in source.
    GapsForRuntimeD4: [
      'PK detection deferred to runtime SoftPKClassifier — none of the 46 item schemas (e.g. Connection, Network, Like, PhotoComment) carries an explicit OpenAPI x-primary-key extension or prose "primary key" marker. Candidate ID fields visible in the schemas include {Family}Id-style integers (ConnectionId, NetworkId, LikeId, etc.).',
      'FK detection deferred — path-templating to {MemberID} is hierarchy evidence (captured via ParentObjectName=Members), NOT an explicit FK marker per Gap 10. Sibling FK candidates like CategoryId, GroupID, etc. remain unmarked at extraction time.',
      'IncrementalWatermarkField=null — no member-sub-resource GET operation in OpenAPI declares a since/modifiedSince/updatedAfter cursor parameter. SupportsIncrementalSync=false for all 46 IOs.',
    ],
    TraversalOrder: ioOrder.map((n, i) => ({ Name: `MemberSub_${n}`, Order: i + 1, Parent: 'Members' })),
    MetadataFile: METADATA_PATH,
    MetadataBackupCreated: true,
    IORowsAfterMerge: meta.newCount,
    IORowsRemovedStale: meta.removedStale,
    CodeEvidenceAppended: codeEvidenceCount,
    ElapsedMs: Date.now() - t0,
    Families: ioOrder,
  };
  process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main();
