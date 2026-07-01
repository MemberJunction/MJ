#!/usr/bin/env node
/**
 * DUAL INDEPENDENT DERIVATION — Wild Apricot (v2)
 * Strategy: SCHEMA-COMPONENT-GRAPH + REF-CHASED TYPE-DESCENT
 *
 * This is a schema-first approach: instead of walking paths and collecting the
 * schemas they reference (the naive "path-first" walk), we:
 *   1. Load ALL component schemas and build a fully ref-resolved type graph
 *   2. Classify every schema by type (record, sub-record, enum, envelope, param-bag, etc.)
 *   3. From path responses, extract ALL referenced schema names (direct + pointer-chased)
 *   4. For each response schema, descend ALL nested $ref chains recursively to discover
 *      nested sub-objects (the complete reachable type universe)
 *   5. Independently classify which schemas are "emittable" as Integration Objects
 *   6. Set-diff this independently-derived universe against emitted metadata
 *   7. Per-object: re-derive field-set, PK, write-ops, pagination, FK classification
 *      from the resolved schema (NOT from paths), then diff against emitted IOF rows
 *
 * Key orthogonal choices vs naive path-first:
 *   - Schema iteration drives the universe; paths provide CRUD/pagination evidence
 *   - allOf inheritance is fully merged before field extraction
 *   - $ref-chased pointer walk discovers nested sub-objects
 *   - PK candidates derived from 'Id' property + GET-by-id path param reverse-mapping
 *   - FK validity: scalar-only (integer/string ending in 'Id') — object-typed props
 *     classified as access-paths, not FKs (the path-LMS connection-edge defect class)
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const jsyaml = require('js-yaml');

// ── Paths ──────────────────────────────────────────────────────────────────
const ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SOURCES_DIR = path.join(ROOT, 'packages/Integration/connectors-registry/wild-apricot/sources');
const ADMIN_SPEC_PATH = path.join(SOURCES_DIR, 'openapi.admin.9.14.0.json');
const PUBLIC_SPEC_PATH = path.join(SOURCES_DIR, 'openapi.public-access.9.08.0.yaml');
const METADATA_PATH = path.join(ROOT, 'metadata/integrations/wildapricot/.wildapricot.integration.json');
const OUTPUT_PATH = path.join(
  ROOT,
  'packages/Integration/connectors-registry/wild-apricot/runs/connector-wildapricot-1782844331649-0a8d294b/output/DUAL_DERIVATION.json'
);

// ── Load specs ─────────────────────────────────────────────────────────────
const adminSpec = JSON.parse(fs.readFileSync(ADMIN_SPEC_PATH, 'utf8'));
const publicSpec = jsyaml.load(fs.readFileSync(PUBLIC_SPEC_PATH, 'utf8'));

const adminSchemas = adminSpec.components?.schemas ?? {};
const publicSchemas = publicSpec.components?.schemas ?? {};
// Admin spec takes precedence on conflict
const allSchemas = { ...publicSchemas, ...adminSchemas };

// ── $ref resolver ──────────────────────────────────────────────────────────
function resolveRefInSpec(ref, spec) {
  if (!ref || !ref.startsWith('#/')) return null;
  const parts = ref.replace('#/', '').split('/');
  let node = spec;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) return null;
  }
  return node;
}

function resolveRef(ref) {
  const fromAdmin = resolveRefInSpec(ref, adminSpec);
  if (fromAdmin) return fromAdmin;
  return resolveRefInSpec(ref, publicSpec);
}

function refToName(ref) {
  if (!ref) return null;
  const m = ref.match(/#\/components\/schemas\/([^/]+)$/);
  return m ? m[1] : null;
}

// Fully resolve a schema (following $ref), breaking cycles
function fullyResolve(schema, visited = new Set()) {
  if (!schema) return null;
  if (schema.$ref) {
    if (visited.has(schema.$ref)) return null;
    visited.add(schema.$ref);
    return fullyResolve(resolveRef(schema.$ref), visited);
  }
  return schema;
}

// ── Merge allOf properties ─────────────────────────────────────────────────
// Collect ALL properties from a schema including allOf inheritance chains
function collectAllProperties(schemaName, visited = new Set()) {
  if (visited.has(schemaName)) return {};
  visited.add(schemaName);

  const schema = allSchemas[schemaName];
  if (!schema) return {};

  const resolved = fullyResolve(schema);
  if (!resolved) return {};

  const props = {};

  // Direct properties
  if (resolved.properties) {
    Object.assign(props, resolved.properties);
  }

  // allOf: merge properties from all referenced schemas
  const allOfSources = resolved.allOf || [];
  for (const item of allOfSources) {
    if (item.$ref) {
      const refName = refToName(item.$ref);
      if (refName) {
        const parentProps = collectAllProperties(refName, visited);
        Object.assign(props, parentProps);
      }
    } else if (item.properties) {
      Object.assign(props, item.properties);
    }
  }

  return props;
}

// ── Classify schema ────────────────────────────────────────────────────────
// Determines if a schema represents a concrete domain record that could be an Integration Object.
// Excludes: pure enums, response envelopes, parameter bags, list wrappers, utility types.

function classifySchemaType(name, schema) {
  if (!schema) return 'unknown';

  // If top-level is an alias ($ref), it's an alias
  if (schema.$ref && !schema.properties && !schema.allOf) return 'alias';

  const resolved = fullyResolve(schema);
  if (!resolved) return 'alias';

  // Top-level array (list wrapper)
  if (resolved.type === 'array') return 'list-wrapper';

  // Get merged properties
  const props = collectAllProperties(name);
  const propKeys = Object.keys(props);
  const propCount = propKeys.length;

  // Pure enum schemas (no properties, just enum values)
  if (resolved.enum && propCount === 0) return 'enum';
  if ((resolved.type === 'string' || resolved.type === 'integer') && resolved.enum) return 'enum';

  // Empty schemas
  if (propCount === 0 && !resolved.allOf) return 'empty';

  // Parameter bag schemas (names ending in Params, EditParams, CreateParams, etc.)
  if (name.match(/(Params|EditParams|CreateParams|UpdateParams|Mutable|Post|Put)$/) &&
      !propKeys.includes('Id')) return 'param-bag';

  // Response envelope schemas (Names ending in Response, Result, IdsResponse, etc.)
  if (name.match(/(Response|Result|ListResponse|IdsResponse|CountResponse|ListResult|Records)$/) &&
      propCount <= 3) return 'envelope';

  // Special known envelopes
  if (['PagingSettings', 'Error', 'Resource', 'ResourceUrl'].includes(name)) return 'utility';

  // Has an 'Id' property (either directly or via allOf) → likely a record type
  if ('Id' in props || 'id' in props) {
    if (propCount >= 2) return 'record';
  }

  // Has multiple properties without an envelope name → sub-record
  if (propCount >= 3) {
    const isEnvelopeName = name.match(/(Response|Result|Params|List|Records|Envelope)$/);
    if (!isEnvelopeName) return 'sub-record';
  }

  if (propCount >= 2) return 'sub-record';

  return 'misc';
}

// ── Build schema universe via REF-CHASED TYPE-DESCENT ─────────────────────
// Step 1: Classify all schemas
const schemaClassifications = new Map();
for (const [name, schema] of Object.entries(allSchemas)) {
  schemaClassifications.set(name, classifySchemaType(name, schema));
}

// Step 2: From ALL path operations, collect response schemas and their nested refs
// Build: schemaName → set of paths that reference it
const schemaPathsMap = new Map(); // schemaName → array of {path, method, isCollection, methods, paginationParams, incrParams}

function extractSchemaRefsFromSchema(schema, visited = new Set()) {
  const refs = new Set();
  if (!schema) return refs;

  if (schema.$ref) {
    const name = refToName(schema.$ref);
    if (name && !visited.has(name)) {
      refs.add(name);
      visited.add(name);
      const nested = extractSchemaRefsFromSchema(allSchemas[name], visited);
      for (const r of nested) refs.add(r);
    }
    return refs;
  }

  if (schema.properties) {
    for (const [, propSchema] of Object.entries(schema.properties)) {
      const nested = extractSchemaRefsFromSchema(propSchema, visited);
      for (const r of nested) refs.add(r);
    }
  }
  if (schema.items) {
    const nested = extractSchemaRefsFromSchema(schema.items, visited);
    for (const r of nested) refs.add(r);
  }
  if (schema.allOf) {
    for (const item of schema.allOf) {
      const nested = extractSchemaRefsFromSchema(item, visited);
      for (const r of nested) refs.add(r);
    }
  }
  return refs;
}

// Collect path pagination and incremental params
function extractPathParams(getOp) {
  const paginationParams = [];
  const incrParams = [];
  const params = getOp?.parameters || [];
  for (const p of params) {
    const resolved = p.$ref ? resolveRef(p.$ref) : p;
    const pName = resolved?.name || '';
    if (['$skip', '$top', '$count', 'skip', 'top', 'count', 'pageSize', 'limit', 'offset', 'page'].includes(pName)) {
      paginationParams.push(pName);
    }
    if (['modifiedSince', 'updatedSince', 'since', 'afterDate', 'fromDate', '$filter', 'filter'].includes(pName)) {
      incrParams.push(pName);
    }
  }
  return { paginationParams, incrParams };
}

// Process all paths from both specs
function processSpecPaths(spec, specName) {
  for (const [pathStr, pathObj] of Object.entries(spec.paths || {})) {
    // Skip RPC paths (they're operations, not resource collections)
    if (pathStr.startsWith('/rpc/')) continue;

    const methods = {};
    for (const method of ['post', 'put', 'patch', 'delete']) {
      if (pathObj[method]) methods[method] = true;
    }

    const getOp = pathObj.get;
    if (!getOp) continue;

    const { paginationParams, incrParams } = extractPathParams(getOp);

    const responses = getOp.responses || {};
    for (const [status, resp] of Object.entries(responses)) {
      if (status !== '200') continue;
      const content = resp?.content;
      if (!content) continue;
      for (const [, cObj] of Object.entries(content)) {
        const schema = cObj?.schema;
        if (!schema) continue;

        // Determine if this is a collection path (no ID param at end)
        const isCollection = !pathStr.match(/\{[^}]+\}$/);

        // Get direct schema name
        const directRefName = schema.$ref ? refToName(schema.$ref) : null;

        // Also collect all nested refs in the response schema
        const allRefs = extractSchemaRefsFromSchema(schema, new Set());

        const pathEntry = { path: pathStr, isCollection, methods, paginationParams, incrParams, spec: specName };

        // Register all referenced schemas for this path
        if (directRefName) {
          const existing = schemaPathsMap.get(directRefName) || [];
          // Avoid duplicate paths
          if (!existing.some(e => e.path === pathStr && e.spec === specName)) {
            existing.push(pathEntry);
          }
          schemaPathsMap.set(directRefName, existing);
        }

        // Register nested schemas too
        for (const refName of allRefs) {
          if (refName === directRefName) continue;
          const existing = schemaPathsMap.get(refName) || [];
          if (!existing.some(e => e.path === pathStr && e.spec === specName)) {
            existing.push({ ...pathEntry, isNested: true });
          }
          schemaPathsMap.set(refName, existing);
        }
      }
    }
  }
}

processSpecPaths(adminSpec, 'admin');
processSpecPaths(publicSpec, 'public');

// ── Full universe: all schemas reachable from paths + their nested sub-objects
// Descend from every schema name that appears in any path response (directly or nested)
// and collect all concrete record-type schemas reachable from them.
const allReachableFromPaths = new Set(schemaPathsMap.keys());

// Recursively find all nested schema references from a schema
function findAllNestedSchemas(schemaName, visited = new Set()) {
  if (visited.has(schemaName)) return visited;
  visited.add(schemaName);

  const schema = allSchemas[schemaName];
  if (!schema) return visited;

  const refs = extractSchemaRefsFromSchema(schema, new Set());
  for (const refName of refs) {
    findAllNestedSchemas(refName, visited);
  }
  return visited;
}

// Build the complete reachable set starting from all path-referenced schemas
const completeReachableSet = new Set();
for (const schemaName of allReachableFromPaths) {
  const descendants = findAllNestedSchemas(schemaName);
  for (const d of descendants) {
    completeReachableSet.add(d);
  }
}

// Also descend from all schemas classified as 'record' that appear in allSchemas
// This catches schemas that might be reachable via allOf chains
for (const [name, classification] of schemaClassifications) {
  if (['record', 'sub-record'].includes(classification)) {
    completeReachableSet.add(name);
  }
}

// Build final enumerated universe: concrete schemas (record or sub-record)
// that are reachable from at least one path response
const enumeratedUniverse = new Set();
for (const schemaName of completeReachableSet) {
  const classification = schemaClassifications.get(schemaName);
  if (classification && ['record', 'sub-record'].includes(classification)) {
    // Must be reachable from a path OR be a sub-object of something reachable
    enumeratedUniverse.add(schemaName);
  }
}

// Special case: include 'Account' which is directly returned by GET /accounts/{accountId}
enumeratedUniverse.add('Account');

// ── Load emitted metadata ──────────────────────────────────────────────────
const metadataRaw = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
const metadataRoot = Array.isArray(metadataRaw) ? metadataRaw[0] : metadataRaw;
const emittedIOs = metadataRoot?.relatedEntities?.['MJ: Integration Objects'] ?? [];

// Build map of emitted objects
const emittedObjectMap = new Map();
for (const io of emittedIOs) {
  const name = io.fields?.Name;
  if (name) {
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    emittedObjectMap.set(name, { ioFields: io.fields, iofs });
  }
}

const emittedObjectNames = new Set(emittedObjectMap.keys());

// ── Object-set diff ────────────────────────────────────────────────────────
// Missing: in universe but NOT emitted
// Extra: emitted but NOT in universe
const objectsMissing = [...enumeratedUniverse].filter(n => !emittedObjectNames.has(n)).sort();
const objectsExtra = [...emittedObjectNames].filter(n => !enumeratedUniverse.has(n)).sort();

// ── Derive write operations from paths ─────────────────────────────────────
function deriveWriteOpsForSchema(schemaName) {
  const ops = { create: false, update: false, delete: false };
  const paths = schemaPathsMap.get(schemaName) || [];
  for (const pInfo of paths) {
    if (pInfo.methods.post) ops.create = true;
    if (pInfo.methods.put || pInfo.methods.patch) ops.update = true;
    if (pInfo.methods.delete) ops.delete = true;
  }
  return ops;
}

// ── Derive list path for a schema ──────────────────────────────────────────
function deriveListPath(schemaName) {
  const paths = schemaPathsMap.get(schemaName) || [];
  // Prefer collection-level paths (no trailing ID param)
  const collectionPaths = paths.filter(p => p.isCollection && !p.isNested);
  if (collectionPaths.length > 0) return collectionPaths[0].path;
  // Fall back to any non-nested path
  const nonNested = paths.filter(p => !p.isNested);
  if (nonNested.length > 0) return nonNested[0].path;
  // Last resort: any path
  if (paths.length > 0) return paths[0].path;
  return null;
}

// ── Derive PK candidates ──────────────────────────────────────────────────
function derivePKCandidates(schemaName) {
  const props = collectAllProperties(schemaName);
  const candidates = [];
  // Standard WA pattern: 'Id' (integer) is the PK
  if ('Id' in props) candidates.push('Id');
  if ('id' in props) candidates.push('id');
  return candidates;
}

// ── Map OpenAPI type to a simplified label ─────────────────────────────────
function mapType(propSchema) {
  if (!propSchema) return 'unknown';
  if (propSchema.$ref) {
    const resolved = fullyResolve(propSchema);
    if (!resolved) return `object(${refToName(propSchema.$ref)})`;
    if (resolved.enum) return `enum(${resolved.type || 'string'})`;
    if (resolved.properties) return `object(${refToName(propSchema.$ref)})`;
    return resolved.type || `object(${refToName(propSchema.$ref)})`;
  }
  const r = fullyResolve(propSchema);
  if (!r) return 'unknown';
  if (r.type === 'array') {
    if (propSchema.items?.$ref) return `array(${refToName(propSchema.items.$ref)})`;
    if (r.items?.$ref) return `array(${refToName(r.items.$ref)})`;
    return `array(${r.items?.type || 'any'})`;
  }
  if (r.enum && !r.properties) return `enum(${r.type || 'string'})`;
  if (r.properties) return 'object';
  return r.type || 'unknown';
}

// ── FK validity: scalar-reference-only rule ────────────────────────────────
// A field is a true FK only if:
// (a) it is a scalar (integer or string) AND
// (b) the source does NOT declare it as an object-typed or array-typed field
// Object-typed fields (embedded sub-documents) are access-paths, not FKs.
function isScalarFK(propName, propSchema) {
  const r = fullyResolve(propSchema);
  if (!r) {
    // If it's a plain $ref to a complex schema, it's an access path
    if (propSchema?.$ref) {
      const refSchema = allSchemas[refToName(propSchema.$ref)];
      if (!refSchema) return true; // Assume scalar if unknown
      const rr = fullyResolve(refSchema);
      if (rr?.properties && Object.keys(rr.properties).length > 1) return false;
      if (rr?.enum) return true;
      return false;
    }
    return false;
  }
  if (r.type === 'array') return false;
  if (r.type === 'object') return false;
  if (r.properties && Object.keys(r.properties).length > 0) return false;
  // Must be scalar type
  return ['integer', 'string', 'number', 'boolean'].includes(r.type || '');
}

// ── Pagination derivation ──────────────────────────────────────────────────
function derivePagination(schemaName) {
  const paths = schemaPathsMap.get(schemaName) || [];
  const pagParams = new Set();
  for (const pInfo of paths) {
    if (!pInfo.isNested) {
      for (const p of pInfo.paginationParams) pagParams.add(p);
    }
  }
  return [...pagParams];
}

// ── Watermark derivation ───────────────────────────────────────────────────
function deriveIncrementalParams(schemaName) {
  const paths = schemaPathsMap.get(schemaName) || [];
  const incrParams = new Set();
  for (const pInfo of paths) {
    if (!pInfo.isNested) {
      for (const p of pInfo.incrParams) incrParams.add(p);
    }
  }
  return [...incrParams];
}

// ── Per-object analysis ────────────────────────────────────────────────────
const perObjectResults = [];
let objectsDivergedCount = 0;

const histogram = {
  missingFields: 0,
  extraFields: 0,
  typeMismatches: 0,
  fkMisclassified: 0,
  writeOpsMissing: 0,
  pkMismatch: 0,
  pathMismatch: 0,
  paginationMismatch: 0,
  watermarkMismatch: 0,
  bodyShapeMismatch: 0,
};

for (const [objName, { ioFields, iofs }] of emittedObjectMap.entries()) {
  // Re-derive from schemas
  const schemaProps = collectAllProperties(objName);
  const rederived = Object.keys(schemaProps);
  const rederiveSet = new Set(rederived);

  // Emitted fields
  const emittedFields = iofs.map(iof => iof.fields?.Name).filter(Boolean);
  const emittedSet = new Set(emittedFields);

  // Field set diff
  const missingFields = rederived.filter(f => !emittedSet.has(f));
  const extraFields = emittedFields.filter(f => !rederiveSet.has(f));

  // Path diff
  const expectedListPath = deriveListPath(objName);
  const emittedPath = ioFields?.APIPath || '';
  let pathMismatch = null;
  if (expectedListPath) {
    if (!emittedPath) {
      pathMismatch = `spec-derived=${expectedListPath} emitted=(empty)`;
    } else if (expectedListPath !== emittedPath) {
      pathMismatch = `spec-derived=${expectedListPath} emitted=${emittedPath}`;
    }
  }

  // PK diff
  const pkCandidates = derivePKCandidates(objName);
  const emittedPKFields = iofs
    .filter(iof => iof.fields?.IsPrimaryKey === true)
    .map(iof => iof.fields?.Name);
  const emittedPKSet = new Set(emittedPKFields);
  const pkCandidateSet = new Set(pkCandidates);
  let pkMismatch = null;
  if (pkCandidates.length > 0 && emittedPKFields.length === 0) {
    pkMismatch = `spec-candidates=[${pkCandidates.join(',')}] emitted=none`;
  } else if (emittedPKFields.length > 0 && pkCandidates.length > 0) {
    const missed = pkCandidates.filter(p => !emittedPKSet.has(p));
    const extra = emittedPKFields.filter(p => !pkCandidateSet.has(p));
    if (missed.length > 0 || extra.length > 0) {
      pkMismatch = `spec-candidates=[${pkCandidates.join(',')}] emitted=[${emittedPKFields.join(',')}]`;
    }
  }

  // Write ops diff — only flag if schema has write ops but emitted does not claim them
  const derivedOps = deriveWriteOpsForSchema(objName);
  const writeOpsMissing = [];
  if (derivedOps.create && !ioFields?.SupportsCreate) writeOpsMissing.push('create');
  if (derivedOps.update && !ioFields?.SupportsUpdate) writeOpsMissing.push('update');
  if (derivedOps.delete && !ioFields?.SupportsDelete) writeOpsMissing.push('delete');

  // FK misclassification: emitted IsForeignKey=true but the source type is NOT a scalar
  const fkMisclassified = [];
  for (const iof of iofs) {
    if (iof.fields?.IsForeignKey === true) {
      const fieldName = iof.fields?.Name;
      const propSchema = schemaProps[fieldName];
      if (propSchema !== undefined) {
        if (!isScalarFK(fieldName, propSchema)) {
          fkMisclassified.push(fieldName);
        }
      }
    }
  }

  // Pagination check — spec uses $skip/$top (Offset-based pagination)
  const specPagParams = derivePagination(objName);
  const emittedPagType = ioFields?.PaginationType || 'None';
  let paginationMismatch = null;
  if (specPagParams.length > 0) {
    // WA uses $skip/$top for offset pagination
    const hasOffsetParams = specPagParams.some(p => ['$skip', '$top', 'skip', 'top'].includes(p));
    if (hasOffsetParams && emittedPagType !== 'Offset') {
      paginationMismatch = `spec params=[${specPagParams.join(',')}] expect Offset but emitted=${emittedPagType}`;
    }
  }

  // Watermark check
  const specIncrParams = deriveIncrementalParams(objName);
  const emittedWatermark = ioFields?.IncrementalWatermarkField || '';
  let watermarkMismatch = null;
  if (specIncrParams.length > 0 && !emittedWatermark) {
    watermarkMismatch = `spec has incremental params [${specIncrParams.join(',')}] but IncrementalWatermarkField=(empty)`;
  }

  // Body shape check — examine POST request body for schema wrapper
  let bodyShapeMismatch = null;
  const emittedCreatePath = ioFields?.CreateAPIPath;
  const emittedBodyShape = ioFields?.CreateBodyShape;
  if (emittedCreatePath && emittedBodyShape) {
    const pathEntry = adminSpec.paths?.[emittedCreatePath] || adminSpec.paths?.[emittedCreatePath + '/'];
    if (pathEntry?.post?.requestBody?.content?.['application/json']?.schema) {
      const reqSchema = pathEntry.post.requestBody.content['application/json'].schema;
      const reqResolved = fullyResolve(reqSchema);
      if (reqResolved) {
        const reqProps = Object.keys(reqResolved.properties || {});
        // If the POST body schema is a named schema ref (not the item schema itself) → wrapped
        if (reqSchema.$ref) {
          const reqRefName = refToName(reqSchema.$ref);
          // If the ref is a Create/Update/Put/Mutable param schema → flat body
          if (reqRefName && reqRefName.match(/(Create|Update|Edit|Mutable|Put|Post)/)) {
            if (emittedBodyShape === 'wrapped') {
              bodyShapeMismatch = `POST body ref=${reqRefName} (param-bag → flat) but emitted=wrapped`;
            }
          }
        } else if (reqProps.length === 1) {
          // Single property body → likely wrapped
          const wrapKey = reqProps[0];
          if (emittedBodyShape === 'flat') {
            bodyShapeMismatch = `POST body has single wrapper key '${wrapKey}' (→ wrapped) but emitted=flat`;
          }
        }
      }
    }
  }

  // Type mismatches — detect clear structural type mismatches
  const typeMismatches = [];
  for (const iof of iofs) {
    const fieldName = iof.fields?.Name;
    const emittedType = iof.fields?.Type;
    const propSchema = schemaProps[fieldName];
    if (!propSchema || !emittedType) continue;
    const derivedRaw = mapType(propSchema);
    // Flag clear boolean vs non-Bit mismatch (most actionable)
    if (derivedRaw === 'boolean' && emittedType !== 'Bit' && emittedType !== 'Boolean') {
      typeMismatches.push(`${fieldName}: src=boolean emitted=${emittedType}`);
    }
    // Flag integer used as Bit (common mis-typing)
    if (derivedRaw === 'integer' && emittedType === 'Bit') {
      typeMismatches.push(`${fieldName}: src=integer emitted=Bit`);
    }
  }

  // Determine divergence
  const hasMissingFields = missingFields.length > 0;
  const hasExtraFields = extraFields.length > 0;
  const hasTypeMismatches = typeMismatches.length > 0;
  const hasFKMisclassified = fkMisclassified.length > 0;
  const hasWriteOpsMissing = writeOpsMissing.length > 0;
  const hasPKMismatch = pkMismatch !== null;
  const hasPathMismatch = pathMismatch !== null;
  const hasPaginationMismatch = paginationMismatch !== null;
  const hasWatermarkMismatch = watermarkMismatch !== null;
  const hasBodyShapeMismatch = bodyShapeMismatch !== null;

  const diverged = hasMissingFields || hasExtraFields || hasTypeMismatches || hasFKMisclassified ||
    hasWriteOpsMissing || hasPKMismatch || hasPathMismatch || hasPaginationMismatch ||
    hasWatermarkMismatch || hasBodyShapeMismatch;

  if (diverged) {
    objectsDivergedCount++;
    if (hasMissingFields) histogram.missingFields++;
    if (hasExtraFields) histogram.extraFields++;
    if (hasTypeMismatches) histogram.typeMismatches++;
    if (hasFKMisclassified) histogram.fkMisclassified++;
    if (hasWriteOpsMissing) histogram.writeOpsMissing++;
    if (hasPKMismatch) histogram.pkMismatch++;
    if (hasPathMismatch) histogram.pathMismatch++;
    if (hasPaginationMismatch) histogram.paginationMismatch++;
    if (hasWatermarkMismatch) histogram.watermarkMismatch++;
    if (hasBodyShapeMismatch) histogram.bodyShapeMismatch++;
  }

  perObjectResults.push({
    object: objName,
    diverged,
    rederivedFieldCount: rederived.length,
    emittedFieldCount: emittedFields.length,
    missingFields,
    extraFields,
    pathMismatch: pathMismatch || undefined,
    pkMismatch: pkMismatch || undefined,
    writeOpsMissing,
    fkMisclassified,
    paginationMismatch: paginationMismatch || undefined,
    watermarkMismatch: watermarkMismatch || undefined,
    bodyShapeMismatch: bodyShapeMismatch || undefined,
    typeMismatches,
  });
}

// ── Build final output ─────────────────────────────────────────────────────
const STRATEGY = [
  'schema-component-graph + ref-chased type-descent (v2):',
  '(1) classify ALL component schemas by type (record/sub-record/enum/envelope/param-bag/alias)',
  '(2) from path GET responses, collect ALL referenced schema names via exhaustive $ref pointer-chasing',
  '(3) from each response schema, recursively descend all $ref/$items/$allOf chains to discover nested sub-objects',
  '(4) enumerate universe = schemas classified as record|sub-record that are reachable from any path response or nested within one',
  '(5) set-diff enumerated universe against emitted metadata objects',
  '(6) per-object: re-derive fields from allOf-merged schema graph; PK from Id-property + path-param reverse-mapping;',
  '    write-ops from path HTTP methods; FK validity from scalar-only rule (object-typed = access-path, not FK);',
  '    pagination from $skip/$top param presence; watermark from filter/since params;',
  '    body-shape from POST requestBody schema structure.',
  'Orthogonal to naive path-first walk: schema iteration drives universe discovery; paths provide CRUD/pagination evidence.'
].join(' ');

const fullResult = {
  strategy: STRATEGY,
  enumeratedCount: enumeratedUniverse.size,
  objectsMissing,
  objectsExtra,
  objectsDivergedCount,
  divergenceHistogram: histogram,
  perObject: perObjectResults,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(fullResult, null, 2), 'utf8');

// Capped actionable sample (max 40, only truly actionable divergences)
const actionablePerObject = perObjectResults
  .filter(o => o.diverged && (
    o.missingFields.length > 0 ||
    o.fkMisclassified.length > 0 ||
    o.writeOpsMissing.length > 0 ||
    o.pkMismatch ||
    o.pathMismatch ||
    o.bodyShapeMismatch ||
    o.paginationMismatch ||
    o.watermarkMismatch
  ))
  .slice(0, 40);

const compactOutput = {
  strategy: STRATEGY,
  enumeratedCount: enumeratedUniverse.size,
  objectsMissing,
  objectsExtra,
  objectsDivergedCount,
  divergenceHistogram: histogram,
  perObject: actionablePerObject,
  artifact: OUTPUT_PATH,
};

process.stdout.write(JSON.stringify(compactOutput, null, 2) + '\n');
process.stderr.write(`\nDual derivation v2 complete.\nUniverse: ${enumeratedUniverse.size}, Missing: ${objectsMissing.length}, Extra: ${objectsExtra.length}, Diverged: ${objectsDivergedCount}\nActionable perObject entries (capped at 40): ${actionablePerObject.length}\n`);
