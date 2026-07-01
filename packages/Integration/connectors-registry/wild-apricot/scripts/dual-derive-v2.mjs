#!/usr/bin/env node
/**
 * DUAL DERIVATION SCRIPT — Wild Apricot (Second, Independent Parser)
 *
 * STRATEGY: $ref-chased component-schema-pointer walk
 *   Instead of naively walking paths top-to-bottom (the first-parser approach),
 *   this script:
 *   1. Starts from `components.schemas` and chases every $ref to build a
 *      fully-resolved schema registry.
 *   2. Finds "list-response" schemas by resolving allOf chains — identifies which
 *      schemas carry array properties that point to record types.
 *   3. Builds a record-type universe bottom-up from schema structure, then
 *      cross-references with path operations.
 *   4. For each record type, derives fields by walking the fully-resolved schema
 *      (including allOf inheritance), PK from GET-by-ID path params, FK from
 *      scalar-ref vs object-ref distinction.
 *   5. Diffs that universe against the emitted metadata.
 *
 * This contrasts with a path-first naive walk because:
 *   - We resolve aliases before iterating (no double-counting via $ref chains)
 *   - We discover list wrappers by chasing allOf → properties, not just path responses
 *   - PKs are derived from path parameter names and readOnly+integer patterns
 *   - FKs are classified as scalar (integer/string pointing at PK) vs edge (object/array)
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const REGISTRY_DIR = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/wild-apricot';
const METADATA_FILE = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/wildapricot/.wildapricot.integration.json';
const OUTPUT_FILE = path.join(REGISTRY_DIR, 'runs/connector-wildapricot-1782844331649-0a8d294b/output/DUAL_DERIVATION.json');
const ADMIN_SPEC_PATH = path.join(REGISTRY_DIR, 'sources/openapi.admin.9.14.0.json');
const PUBLIC_SPEC_PATH = path.join(REGISTRY_DIR, 'sources/openapi.public-access.9.08.0.yaml');

// ─── LOAD SPECS ──────────────────────────────────────────────────────────────

function loadSpecs() {
  const adminSpec = JSON.parse(fs.readFileSync(ADMIN_SPEC_PATH, 'utf8'));
  const publicSpec = yaml.load(fs.readFileSync(PUBLIC_SPEC_PATH, 'utf8'));
  return { adminSpec, publicSpec };
}

// ─── $REF RESOLUTION ─────────────────────────────────────────────────────────

function getByPointer(obj, pointer) {
  const parts = pointer.replace(/^#\//, '').split('/');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))];
  }
  return cur;
}

function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  return getByPointer(spec, ref) ?? null;
}

// Fully resolve a schema node, chasing $refs (with cycle guard)
function resolveSchema(spec, schema, visitedRefs = new Set()) {
  if (!schema) return null;
  if (schema['$ref']) {
    if (visitedRefs.has(schema['$ref'])) return { type: 'object', 'x-circular': true, _circular: true };
    const nextVisited = new Set(visitedRefs);
    nextVisited.add(schema['$ref']);
    const resolved = resolveRef(spec, schema['$ref']);
    if (!resolved) return { type: 'unknown' };
    return resolveSchema(spec, { ...resolved, _resolvedFrom: schema['$ref'] }, nextVisited);
  }
  return schema;
}

function schemaNameFromRef(ref) {
  if (!ref) return null;
  return ref.split('/').pop() ?? null;
}

// ─── BUILD FULLY-RESOLVED SCHEMA REGISTRY ────────────────────────────────────

// Build a map from schema name → resolved schema (allOf flattened, $refs chased)
function buildSchemaRegistry(spec) {
  const schemas = spec?.components?.schemas ?? {};
  const registry = {};
  for (const [name, rawSchema] of Object.entries(schemas)) {
    registry[name] = flattenAllOf(spec, rawSchema, new Set([`#/components/schemas/${name}`]));
    registry[name]._schemaName = name;
  }
  return registry;
}

// Flatten allOf by merging properties from all parts
function flattenAllOf(spec, schema, visitedRefs = new Set()) {
  if (!schema) return {};
  if (schema['$ref']) {
    if (visitedRefs.has(schema['$ref'])) return { type: 'object', _circular: true };
    const resolved = resolveRef(spec, schema['$ref']);
    if (!resolved) return {};
    const nv = new Set(visitedRefs);
    nv.add(schema['$ref']);
    return flattenAllOf(spec, resolved, nv);
  }

  const result = { ...schema };
  const allOf = schema.allOf ?? [];
  if (allOf.length > 0) {
    const mergedProps = { ...result.properties };
    const mergedRequired = [...(result.required ?? [])];
    for (const part of allOf) {
      const flat = flattenAllOf(spec, part, visitedRefs);
      if (flat.properties) Object.assign(mergedProps, flat.properties);
      if (flat.required) mergedRequired.push(...flat.required);
    }
    result.properties = mergedProps;
    result.required = [...new Set(mergedRequired)];
    delete result.allOf;
  }

  if (schema.type === 'array' && schema.items) {
    result.items = resolveSchema(spec, schema.items);
  }

  return result;
}

// ─── ENUMERATE RECORD TYPES (schema-pointer strategy) ────────────────────────

/**
 * Enumerate record types using the component-schema-pointer strategy:
 *   1. Walk every path's GET response schema.
 *   2. Resolve the response schema (may be a list-response wrapper via allOf).
 *   3. Find array properties in the resolved schema → their item type is a record type.
 *   4. Direct array responses also yield record types.
 *   5. Build info: listPath, writeOps, pagination params, PK, watermark.
 */
function enumerateRecordTypes(spec, registry) {
  const records = {}; // schemaName → RecordInfo

  const paths = spec.paths ?? {};

  // PASS 1: find list paths (GET responses)
  for (const [pathStr, pathItem] of Object.entries(paths)) {
    const getOp = pathItem.get;
    if (!getOp) continue;

    const respSchema = getGetResponseSchema(spec, getOp);
    if (!respSchema) continue;

    // Direct array response
    if (respSchema.type === 'array' && respSchema.items) {
      const itemRef = respSchema.items['$ref'] ?? respSchema.items._resolvedFrom;
      const itemName = itemRef ? schemaNameFromRef(itemRef) : null;
      if (itemName && registry[itemName]) {
        recordListPath(records, itemName, pathStr, getOp, 'direct-array');
      }
    }

    // Object with allOf → flatten → find array properties
    const flat = flattenAllOf(spec, respSchema);
    if (flat.properties) {
      for (const [propName, propVal] of Object.entries(flat.properties)) {
        const resolvedProp = resolveSchema(spec, propVal);
        if (!resolvedProp) continue;
        if (resolvedProp.type === 'array' && resolvedProp.items) {
          const itemRef = resolvedProp.items['$ref'] ?? resolvedProp.items._resolvedFrom;
          const itemName = itemRef ? schemaNameFromRef(itemRef) : null;
          if (itemName && registry[itemName]) {
            recordListPath(records, itemName, pathStr, getOp, `wrapped.${propName}`);
          }
        }
      }
    }

    // Type=array at top level (e.g. EventRegistrationTypeResponse, TendersResponse, etc.)
    if (!respSchema.type && !respSchema.allOf && !respSchema.properties) {
      // Try to resolve via ref
      const rawResp = getRawGetResponseSchema(spec, getOp);
      if (rawResp?.['$ref']) {
        const refName = schemaNameFromRef(rawResp['$ref']);
        const refSchema = registry[refName];
        if (refSchema) {
          if (refSchema.type === 'array' && refSchema.items) {
            const itemRef = refSchema.items['$ref'] ?? refSchema.items._resolvedFrom;
            const itemName = itemRef ? schemaNameFromRef(itemRef) : null;
            if (itemName && registry[itemName]) {
              recordListPath(records, itemName, pathStr, getOp, `array-via-${refName}`);
            }
          }
        }
      }
    }
  }

  // PASS 2: collect write operations and associate with record types
  for (const [pathStr, pathItem] of Object.entries(paths)) {
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const op = pathItem[method];
      if (!op) continue;

      // Find which record type this write operation targets
      const targetSchema = getWriteOpTargetSchema(spec, op, registry);

      // Also try to match path → existing record type by stripping the path param
      const matchedByPath = findRecordTypeByPath(pathStr, records);

      const targets = new Set();
      if (targetSchema) targets.add(targetSchema);
      if (matchedByPath) targets.add(matchedByPath);

      for (const target of targets) {
        if (!records[target]) continue;
        const rec = records[target];
        rec.writeOps = rec.writeOps ?? [];
        const methodUpper = method.toUpperCase();

        if (!rec.writeOps.find(w => w.method === methodUpper && w.path === pathStr)) {
          rec.writeOps.push({ method: methodUpper, path: pathStr });
        }

        if (method === 'post' && !rec.createPath) {
          rec.createPath = pathStr;
          rec.createMethod = 'POST';
          rec.createBodyShape = detectBodyShape(spec, op, target, registry);
          rec.createIDLocation = detectIDLocation(spec, op);
        }
        if ((method === 'put' || method === 'patch') && !rec.updatePath) {
          rec.updatePath = pathStr;
          rec.updateMethod = methodUpper;
          rec.updateBodyShape = detectBodyShape(spec, op, target, registry);
        }
        if (method === 'delete' && !rec.deletePath) {
          rec.deletePath = pathStr;
          rec.deleteMethod = 'DELETE';
        }
      }
    }
  }

  return records;
}

function recordListPath(records, schemaName, pathStr, getOp, kind) {
  if (!records[schemaName]) {
    records[schemaName] = {
      schemaName,
      listPath: pathStr,
      listKind: kind,
      writeOps: [],
    };
  }
  // Capture pagination params
  const params = (getOp.parameters ?? []).map(p => {
    if (p['$ref']) {
      // resolve component param
      return p;
    }
    return p;
  });
  records[schemaName].paginationParams = records[schemaName].paginationParams ?? [];
  records[schemaName].hasFilterParam = records[schemaName].hasFilterParam ?? false;
}

function getGetResponseSchema(spec, getOp) {
  const resp = getOp.responses?.['200'] ?? getOp.responses?.default;
  if (!resp) return null;
  const content = resp.content;
  if (!content) return null;
  const jsonContent = content['application/json'] ?? content['*/*'];
  if (!jsonContent?.schema) return null;
  return resolveSchema(spec, jsonContent.schema);
}

function getRawGetResponseSchema(spec, getOp) {
  const resp = getOp.responses?.['200'] ?? getOp.responses?.default;
  if (!resp) return null;
  const content = resp.content;
  if (!content) return null;
  const jsonContent = content['application/json'] ?? content['*/*'];
  return jsonContent?.schema ?? null;
}

function getWriteOpTargetSchema(spec, op, registry) {
  if (!op.requestBody) return null;
  const content = op.requestBody.content;
  if (!content) return null;
  const jsonContent = content['application/json'] ?? content['*/*'];
  if (!jsonContent?.schema) return null;
  const schema = jsonContent.schema;
  if (schema['$ref']) {
    const name = schemaNameFromRef(schema['$ref']);
    if (registry[name]) return name;
  }
  return null;
}

function findRecordTypeByPath(pathStr, records) {
  // Remove trailing {param} to get base path, then check if any record has that as listPath
  const withoutParam = pathStr.replace(/\/\{[^}]+\}$/, '');
  for (const [name, info] of Object.entries(records)) {
    if (info.listPath === withoutParam || info.listPath === pathStr) {
      return name;
    }
  }
  return null;
}

function detectBodyShape(spec, op, targetSchemaName, registry) {
  if (!op.requestBody) return 'flat';
  const content = op.requestBody.content;
  if (!content) return 'flat';
  const jsonContent = content['application/json'] ?? content['*/*'];
  if (!jsonContent?.schema) return 'flat';

  const schema = jsonContent.schema;
  if (schema['$ref']) {
    const name = schemaNameFromRef(schema['$ref']);
    if (name === targetSchemaName) return 'flat';
    // Check if it's a wrapper
    const wrapper = registry[name];
    if (wrapper?.properties) {
      for (const [propName, propVal] of Object.entries(wrapper.properties)) {
        const resolved = resolveSchema(spec, propVal);
        if (resolved?._resolvedFrom) {
          const innerName = schemaNameFromRef(resolved._resolvedFrom);
          if (innerName === targetSchemaName) return `wrapped:${propName}`;
        }
      }
    }
  }
  return 'flat';
}

function detectIDLocation(spec, op) {
  const resp201 = op.responses?.['201'];
  if (resp201?.headers) {
    if (resp201.headers['Location'] || resp201.headers['location']) return 'header';
  }
  // Check response body for Id
  const respSchema = getGetResponseSchema(spec, op);
  if (respSchema?.properties?.Id || respSchema?.properties?.id) return 'body';
  return 'body';
}

// ─── RESOLVE PAGINATION PARAMS (follow $ref to component params) ──────────────

function resolvePathPaginationParams(spec, getOp) {
  const paramNames = [];
  for (const paramOrRef of (getOp.parameters ?? [])) {
    let param = paramOrRef;
    if (paramOrRef['$ref']) {
      param = resolveRef(spec, paramOrRef['$ref']) ?? paramOrRef;
    }
    if (param.name) paramNames.push(param.name);
  }
  return paramNames;
}

function derivePaginationType(paramNames) {
  const lower = paramNames.map(n => n.toLowerCase());
  if (lower.includes('$skip') || lower.includes('skip')) return 'Offset';
  if (lower.includes('resultid')) return 'Cursor'; // Wild Apricot ResultId pagination
  if (lower.includes('pageindex') || lower.includes('pagesize')) return 'PageNumber';
  return 'None';
}

// ─── PK DETECTION ────────────────────────────────────────────────────────────

/**
 * Strategy:
 * 1. GET-by-ID path: /resource/{Id} → the path param name maps to a schema field
 * 2. ReadOnly integer field named "Id" → conventional PK
 * 3. Integer field named "Id" → weakest signal, last resort
 */
function detectPKs(spec, schemaName, schemaFields, listPath) {
  const paths = spec.paths ?? {};
  const candidates = [];

  // Strategy 1: GET-by-ID path
  if (listPath) {
    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (!pathStr.startsWith(listPath) || !pathStr.match(/\/\{[^}]+\}$/) || !pathItem.get) continue;
      const m = pathStr.match(/\/\{([^}]+)\}$/);
      if (!m) continue;
      const paramName = m[1];
      // Check if this GET-by-ID returns our schema
      const respSchema = getRawGetResponseSchema(spec, pathItem.get);
      if (!respSchema) continue;
      const respRef = respSchema['$ref'] ? schemaNameFromRef(respSchema['$ref']) : null;
      if (respRef !== schemaName) continue;

      // Find field matching param
      const matchField = schemaFields.find(f =>
        f.name.toLowerCase() === paramName.toLowerCase() ||
        f.name === 'Id'
      );
      if (matchField) {
        candidates.push({ field: matchField.name, source: 'get-by-id-path', strength: 1 });
      }
    }
  }

  // Strategy 2: readOnly integer field named Id
  if (candidates.length === 0) {
    const idField = schemaFields.find(f => f.name === 'Id' && f.readOnly && (f.type === 'integer' || f.type === 'Int'));
    if (idField) candidates.push({ field: 'Id', source: 'readonly-int-Id', strength: 2 });
  }

  // Strategy 3: any integer field named Id
  if (candidates.length === 0) {
    const idField = schemaFields.find(f => f.name === 'Id');
    if (idField) candidates.push({ field: 'Id', source: 'id-field-name', strength: 3 });
  }

  return [...new Set(candidates.map(c => c.field))];
}

// ─── FIELD EXTRACTION (schema-pointer walk) ───────────────────────────────────

function extractFields(spec, schemaName, registry) {
  const schema = registry[schemaName];
  if (!schema) return [];

  // Flatten allOf first
  const flat = flattenAllOf(spec, registry[schemaName] ?? {});
  const props = flat.properties ?? {};
  const required = new Set(flat.required ?? []);

  const fields = [];
  for (const [name, rawProp] of Object.entries(props)) {
    if (name.startsWith('_')) continue; // internal markers

    const prop = resolveSchema(spec, rawProp) ?? rawProp;
    if (!prop) continue;

    const isArray = prop.type === 'array';
    const isObject = (prop.type === 'object') || (!prop.type && (prop.properties || prop.allOf));
    const refTarget = rawProp['$ref'] ? schemaNameFromRef(rawProp['$ref']) : null;
    let arrayItemRef = null;
    if (isArray && prop.items) {
      const items = resolveSchema(spec, prop.items);
      const itemsRaw = prop.items;
      arrayItemRef = itemsRaw['$ref'] ? schemaNameFromRef(itemsRaw['$ref']) : null;
    }

    fields.push({
      name,
      type: deriveFieldType(prop),
      readOnly: prop.readOnly === true,
      nullable: prop.nullable !== false, // default nullable
      required: required.has(name),
      isArray,
      isObject: isObject && !isArray,
      isComplexRef: !!refTarget && (registry[refTarget]?.properties || registry[refTarget]?.allOf),
      refTarget,
      arrayItemRef,
      maxLength: prop.maxLength ?? null,
      format: prop.format ?? null,
      description: prop.description ?? '',
    });
  }
  return fields;
}

function deriveFieldType(prop) {
  if (!prop) return 'String';
  if (prop._circular) return 'Object';
  if (prop.type === 'integer') return 'Int';
  if (prop.type === 'number') return 'Float';
  if (prop.type === 'boolean') return 'Boolean';
  if (prop.type === 'array') return 'Array';
  if (prop.type === 'object') return 'Object';
  if (prop.type === 'string') {
    if (prop.format === 'date-time' || prop.format === 'date') return 'Date';
    if (prop.maxLength) return `String(${prop.maxLength})`;
    return 'String';
  }
  if (prop.properties || prop.allOf) return 'Object';
  return 'String';
}

// ─── FK CLASSIFICATION ────────────────────────────────────────────────────────

/**
 * For each emitted field with RelatedIntegrationObjectID set (FK-like),
 * check whether the source schema field is actually a scalar or an object/array edge.
 * Object/array edges are fkMisclassified per the connector conventions.
 */
function checkFKMisclassified(spec, schemaName, emittedFieldsWithRelated, derivedFields, registry) {
  const misclassified = [];

  for (const ef of emittedFieldsWithRelated) {
    if (!ef.relatedIntegrationObjectID) continue;

    const derived = derivedFields.find(f => f.name === ef.name);
    if (!derived) continue;

    // If the source field is an object or array → it's a relationship edge, not a scalar FK
    if (derived.isObject || derived.isArray) {
      misclassified.push(ef.name);
      continue;
    }

    // If the source field has a $ref to a complex schema (not a primitive)
    if (derived.isComplexRef && derived.refTarget) {
      const refSchema = registry[derived.refTarget];
      if (refSchema && (refSchema.properties || refSchema.allOf)) {
        misclassified.push(ef.name);
      }
    }
  }
  return [...new Set(misclassified)];
}

// ─── WATERMARK DERIVATION ─────────────────────────────────────────────────────

function deriveWatermark(spec, schemaName, listPath) {
  if (!listPath) return null;
  const pathItem = spec.paths?.[listPath];
  if (!pathItem?.get) return null;

  const params = resolvePathPaginationParams(spec, pathItem.get);
  const lower = params.map(p => p.toLowerCase());

  if (lower.includes('$filter') || lower.includes('filter')) return '$filter';
  if (params.some(p => p.toLowerCase() === 'updatedsince')) return 'UpdatedSince';
  if (params.some(p => p.toLowerCase() === 'createdsince')) return 'CreatedSince';

  return null;
}

// ─── LOAD METADATA ────────────────────────────────────────────────────────────

function loadMetadata() {
  const raw = fs.readFileSync(METADATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  // Metadata is a list with one element
  const root = Array.isArray(parsed) ? parsed[0] : parsed;
  return root;
}

function extractEmittedObjects(root) {
  const ios = root?.relatedEntities?.['MJ: Integration Objects'] ?? [];
  return ios.map(io => {
    const f = io.fields ?? {};
    const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    return {
      name: f.Name,
      apiPath: f.APIPath ?? '',
      paginationType: f.PaginationType,
      supportsCreate: f.SupportsCreate === true,
      supportsUpdate: f.SupportsUpdate === true,
      supportsDelete: f.SupportsDelete === true,
      supportsWrite: f.SupportsWrite === true,
      supportsIncrementalSync: f.SupportsIncrementalSync === true,
      incrementalWatermarkField: f.IncrementalWatermarkField ?? null,
      createAPIPath: f.CreateAPIPath ?? null,
      createMethod: f.CreateMethod ?? null,
      createBodyShape: f.CreateBodyShape ?? null,
      createBodyKey: f.CreateBodyKey ?? null,
      createIDLocation: f.CreateIDLocation ?? null,
      updateAPIPath: f.UpdateAPIPath ?? null,
      updateMethod: f.UpdateMethod ?? null,
      updateBodyShape: f.UpdateBodyShape ?? null,
      deleteAPIPath: f.DeleteAPIPath ?? null,
      deleteMethod: f.DeleteMethod ?? null,
      iofList: iofs,
    };
  });
}

function parseEmittedFields(emittedObj) {
  return emittedObj.iofList.map(iof => {
    const f = iof.fields ?? {};
    return {
      name: f.Name,
      type: f.Type,
      isPrimaryKey: f.IsPrimaryKey === true,
      isRequired: f.IsRequired === true,
      isReadOnly: f.IsReadOnly === true,
      isUniqueKey: f.IsUniqueKey === true,
      allowsNull: f.AllowsNull,
      relatedIntegrationObjectID: f.RelatedIntegrationObjectID ?? null,
      maxLength: f.Length ?? f.MaxLength ?? null,
    };
  });
}

// ─── DIFF HELPERS ─────────────────────────────────────────────────────────────

function checkPathMismatch(emittedObj, derivedInfo) {
  const ep = emittedObj.apiPath;
  const dp = derivedInfo?.listPath;
  if (!dp || !ep) return null;
  if (dp.toLowerCase() !== ep.toLowerCase()) {
    return `emitted=${ep} derived=${dp}`;
  }
  return null;
}

function checkPKMismatch(emittedPKs, derivedPKs) {
  if (derivedPKs.length === 0) return null;
  const missing = derivedPKs.filter(pk => !emittedPKs.includes(pk));
  const extra = emittedPKs.filter(pk => !derivedPKs.includes(pk));
  if (missing.length > 0 || extra.length > 0) {
    return `emitted=[${emittedPKs.join(',')}] derived=[${derivedPKs.join(',')}]`;
  }
  return null;
}

function checkWriteOpsMissing(emittedObj, derivedInfo) {
  const missing = [];
  if (!derivedInfo) return missing;
  const ops = (derivedInfo.writeOps ?? []).map(w => w.method);

  // POST on the LIST path = SupportsCreate
  const hasPost = ops.some(o => o === 'POST');
  const hasPutOrPatch = ops.some(o => o === 'PUT' || o === 'PATCH');
  const hasDelete = ops.some(o => o === 'DELETE');

  if (hasPost && !emittedObj.supportsCreate) missing.push('POST→SupportsCreate');
  if (hasPutOrPatch && !emittedObj.supportsUpdate) {
    const verb = ops.find(o => o === 'PUT' || o === 'PATCH');
    missing.push(`${verb}→SupportsUpdate`);
  }
  if (hasDelete && !emittedObj.supportsDelete) missing.push('DELETE→SupportsDelete');

  return missing;
}

function checkPaginationMismatch(emittedObj, derivedInfo, spec) {
  if (!derivedInfo?.listPath) return null;

  const pathItem = spec.paths?.[derivedInfo.listPath];
  const getOp = pathItem?.get;
  if (!getOp) return null;

  const params = resolvePathPaginationParams(spec, getOp);
  const derivedPagType = derivePaginationType(params);
  const emittedPagType = emittedObj.paginationType;

  if (!emittedPagType) return null;

  // Check for $skip vs skip confusion
  const hasSkipDollar = params.includes('$skip');
  const hasSkipPlain = params.some(p => p.toLowerCase() === 'skip' && p !== '$skip');

  if (derivedPagType !== emittedPagType) {
    return `emitted=${emittedPagType} derived=${derivedPagType} params=[${params.filter(p => {
      const l = p.toLowerCase();
      return l.includes('skip') || l.includes('top') || l.includes('resultid') || l.includes('page');
    }).join(',')}]`;
  }

  return null;
}

function checkWatermarkMismatch(emittedObj, derivedWatermark) {
  if (!emittedObj.supportsIncrementalSync) return null;
  const ew = emittedObj.incrementalWatermarkField;
  if (!ew && !derivedWatermark) return null;
  if (ew !== derivedWatermark) {
    return `emitted=${ew ?? 'null'} derived=${derivedWatermark ?? 'null'}`;
  }
  return null;
}

function checkBodyShapeMismatch(emittedObj, derivedInfo) {
  if (!derivedInfo?.createPath || !emittedObj.createAPIPath) return null;
  const derivedShape = derivedInfo.createBodyShape ?? 'flat';
  const emittedShape = emittedObj.createBodyShape;
  if (!emittedShape) return null;

  if (derivedShape.startsWith('wrapped:')) {
    const key = derivedShape.split(':')[1];
    if (emittedShape !== 'wrapped') {
      return `derived=wrapped(key=${key}) emitted=${emittedShape}`;
    }
    if (emittedShape === 'wrapped' && emittedObj.createBodyKey && emittedObj.createBodyKey !== key) {
      return `wrapped-key: derived=${key} emitted=${emittedObj.createBodyKey}`;
    }
  } else if (derivedShape === 'flat' && emittedShape === 'wrapped') {
    return `derived=flat emitted=wrapped`;
  }

  return null;
}

function checkTypeMismatches(derivedFields, emittedFields) {
  const mismatches = [];
  const normalizeType = t => {
    if (!t) return 'string';
    const l = t.toLowerCase().replace(/\(\d+\)/, '');
    if (l === 'int' || l === 'bigint' || l === 'integer') return 'integer';
    if (l === 'float' || l === 'decimal' || l === 'number' || l === 'double') return 'number';
    if (l === 'boolean' || l === 'bit') return 'boolean';
    if (l === 'date' || l === 'datetime' || l === 'datetime2' || l === 'datetimeoffset') return 'datetime';
    if (l === 'nvarchar' || l === 'varchar' || l === 'text' || l === 'string' || l === 'char') return 'string';
    if (l === 'json' || l === 'object' || l === 'array') return 'json';
    return l;
  };

  for (const ef of emittedFields) {
    const df = derivedFields.find(f => f.name === ef.name);
    if (!df) continue;
    const normD = normalizeType(df.type);
    const normE = normalizeType(ef.type);
    if (normD !== normE) {
      mismatches.push(`${ef.name}: emitted=${ef.type} derived=${df.type}`);
    }
  }
  return mismatches;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  process.stderr.write('Loading specs...\n');
  const { adminSpec, publicSpec } = loadSpecs();

  process.stderr.write('Building schema registries ($ref-chased, allOf-flattened)...\n');
  const adminRegistry = buildSchemaRegistry(adminSpec);
  const publicRegistry = buildSchemaRegistry(publicSpec);

  process.stderr.write('Enumerating record types (component-schema-pointer walk)...\n');
  const adminRecords = enumerateRecordTypes(adminSpec, adminRegistry);

  // Merge public spec record types (admin wins)
  const publicRecords = enumerateRecordTypes(publicSpec, publicRegistry);
  for (const [name, info] of Object.entries(publicRecords)) {
    if (!adminRecords[name]) adminRecords[name] = info;
  }

  const derivedNames = Object.keys(adminRecords).sort();
  process.stderr.write(`Derived ${derivedNames.length} record types:\n`);
  for (const n of derivedNames) {
    process.stderr.write(`  - ${n} (listPath=${adminRecords[n].listPath})\n`);
  }

  process.stderr.write('\nLoading metadata...\n');
  const metadataRoot = loadMetadata();
  const emittedObjects = extractEmittedObjects(metadataRoot);
  process.stderr.write(`Found ${emittedObjects.length} emitted objects in metadata\n`);

  // OBJECT-SET DIFF
  const emittedNames = new Set(emittedObjects.map(o => o.name));
  const derivedNamesSet = new Set(derivedNames);
  const objectsMissing = derivedNames.filter(n => !emittedNames.has(n));
  const objectsExtra = emittedObjects.map(o => o.name).filter(n => !derivedNamesSet.has(n));

  process.stderr.write(`\nObject-set diff:\n`);
  process.stderr.write(`  Missing (source has, metadata lacks): [${objectsMissing.join(', ')}]\n`);
  process.stderr.write(`  Extra (metadata has, source lacks): [${objectsExtra.join(', ')}]\n`);

  // PER-OBJECT ANALYSIS
  const perObject = [];
  const histogram = {
    missingFields: 0, extraFields: 0, typeMismatches: 0, fkMisclassified: 0,
    writeOpsMissing: 0, pkMismatch: 0, pathMismatch: 0,
    paginationMismatch: 0, watermarkMismatch: 0, bodyShapeMismatch: 0,
  };

  for (const emittedObj of emittedObjects) {
    const objName = emittedObj.name;
    const derivedInfo = adminRecords[objName] ?? null;

    // Derive fields from schema
    const registry = adminRegistry[objName] ? adminRegistry : publicRegistry;
    const derivedFields = (adminRegistry[objName] || publicRegistry[objName])
      ? extractFields(adminSpec, objName, adminRegistry[objName] ? adminRegistry : publicRegistry)
      : [];

    const emittedFields = parseEmittedFields(emittedObj);
    const emittedFieldNames = new Set(emittedFields.map(f => f.name));
    const derivedFieldNames = new Set(derivedFields.map(f => f.name));

    const missingFields = derivedFields.filter(f => !emittedFieldNames.has(f.name)).map(f => f.name);
    const extraFields = emittedFields.filter(f => !derivedFieldNames.has(f.name)).map(f => f.name);

    // PK
    const derivedPKs = (adminRegistry[objName] || publicRegistry[objName])
      ? detectPKs(adminSpec, objName, derivedFields, derivedInfo?.listPath ?? null)
      : [];
    const emittedPKs = emittedFields.filter(f => f.isPrimaryKey).map(f => f.name);
    const pkMismatch = checkPKMismatch(emittedPKs, derivedPKs);

    // FK misclassification — fields with RelatedIntegrationObjectID set
    const emittedFieldsWithRelated = emittedFields.filter(f => f.relatedIntegrationObjectID);
    const fkMisclassified = checkFKMisclassified(
      adminSpec, objName, emittedFieldsWithRelated, derivedFields, adminRegistry
    );

    // Path mismatch
    const pathMismatch = checkPathMismatch(emittedObj, derivedInfo);

    // Write ops missing
    const writeOpsMissing = checkWriteOpsMissing(emittedObj, derivedInfo);

    // Pagination mismatch
    const paginationMismatch = checkPaginationMismatch(emittedObj, derivedInfo, adminSpec);

    // Watermark mismatch
    const derivedWatermark = deriveWatermark(adminSpec, objName, derivedInfo?.listPath ?? null);
    const watermarkMismatch = checkWatermarkMismatch(emittedObj, derivedWatermark);

    // Body shape mismatch
    const bodyShapeMismatch = checkBodyShapeMismatch(emittedObj, derivedInfo);

    // Type mismatches
    const typeMismatches = checkTypeMismatches(derivedFields, emittedFields);

    const diverged = missingFields.length > 0 || fkMisclassified.length > 0 ||
      writeOpsMissing.length > 0 || pkMismatch !== null || pathMismatch !== null ||
      paginationMismatch !== null || watermarkMismatch !== null || bodyShapeMismatch !== null ||
      extraFields.length > 0 || typeMismatches.length > 0;

    if (diverged) {
      if (missingFields.length > 0) histogram.missingFields++;
      if (extraFields.length > 0) histogram.extraFields++;
      if (typeMismatches.length > 0) histogram.typeMismatches++;
      if (fkMisclassified.length > 0) histogram.fkMisclassified++;
      if (writeOpsMissing.length > 0) histogram.writeOpsMissing++;
      if (pkMismatch) histogram.pkMismatch++;
      if (pathMismatch) histogram.pathMismatch++;
      if (paginationMismatch) histogram.paginationMismatch++;
      if (watermarkMismatch) histogram.watermarkMismatch++;
      if (bodyShapeMismatch) histogram.bodyShapeMismatch++;
    }

    perObject.push({
      object: objName,
      diverged,
      rederivedFieldCount: derivedFields.length,
      emittedFieldCount: emittedFields.length,
      missingFields,
      extraFields,
      pathMismatch: pathMismatch ?? undefined,
      pkMismatch: pkMismatch ?? undefined,
      writeOpsMissing,
      fkMisclassified,
      paginationMismatch: paginationMismatch ?? undefined,
      watermarkMismatch: watermarkMismatch ?? undefined,
      bodyShapeMismatch: bodyShapeMismatch ?? undefined,
      typeMismatches,
    });
  }

  const objectsDivergedCount = perObject.filter(o => o.diverged).length;

  const result = {
    strategy: 'ref-chased-component-schema-pointer-walk',
    enumeratedCount: derivedNames.length,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject,
  };

  // Write full result
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  process.stderr.write(`\nFull results written to: ${OUTPUT_FILE}\n`);

  // Build capped actionable sample (max 40 entries, only actionable divergences)
  const actionableSample = perObject
    .filter(o => o.diverged && (
      o.missingFields.length > 0 || o.fkMisclassified.length > 0 ||
      o.writeOpsMissing.length > 0 || o.pkMismatch || o.pathMismatch ||
      o.paginationMismatch || o.watermarkMismatch || o.bodyShapeMismatch
    ))
    .slice(0, 40);

  const summary = {
    artifact: OUTPUT_FILE,
    strategy: result.strategy,
    enumeratedCount: result.enumeratedCount,
    objectsMissing: result.objectsMissing,
    objectsExtra: result.objectsExtra,
    objectsDivergedCount: result.objectsDivergedCount,
    divergenceHistogram: result.divergenceHistogram,
    perObject: actionableSample,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`FATAL: ${err.stack ?? err}\n`);
  process.exit(1);
});
