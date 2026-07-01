#!/usr/bin/env node
/**
 * DUAL DERIVATION SCRIPT — Wild Apricot (v2, Independent Parser)
 *
 * STRATEGY: COMPONENT-SCHEMA-GRAPH TRAVERSAL (schema-first, back-linked to paths)
 *
 * Instead of path-first enumeration, this script:
 *   1. Starts from #/components/schemas — builds the complete schema universe
 *   2. Classifies each schema as record-type vs auxiliary/enum/param via $ref-chased allOf resolution
 *   3. Back-links from schemas to paths (inverse of path-first) to assign list paths, operations
 *   4. For each emitted object: re-derives fields, PKs, paths, write ops, pagination from the schema graph
 *
 * The key difference: we treat ALL schemas as candidates (not just those reachable from paths),
 * then check which ones also have paths. This catches schemas that are only referenced as nested
 * components but the extractor DID emit as IOs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_SPEC_PATH = path.resolve(__dirname, '../sources/openapi.admin.9.14.0.json');
const METADATA_PATH = path.resolve(__dirname, '../../../../../metadata/integrations/wildapricot/.wildapricot.integration.json');
const OUTPUT_PATH = path.resolve(__dirname, '../runs/connector-wildapricot-1782844331649-0a8d294b/output/DUAL_DERIVATION.json');

// ============================================================
// LOAD
// ============================================================
const specRaw = fs.readFileSync(ADMIN_SPEC_PATH, 'utf-8');
const spec = JSON.parse(specRaw);
const metaRaw = fs.readFileSync(METADATA_PATH, 'utf-8');
const metadata = JSON.parse(metaRaw);

const schemas = spec.components?.schemas || {};
const paths = spec.paths || {};

// ============================================================
// SCHEMA RESOLUTION HELPERS (schema-graph traversal core)
// ============================================================

/** Resolve a JSON Pointer $ref against the spec */
function resolveRef(ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  const parts = ref.replace('#/', '').split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur = spec;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = cur[p];
  }
  return cur;
}

/** Get the schema name from a $ref string */
function refName(ref) {
  if (!ref) return null;
  return ref.split('/').pop();
}

/**
 * Walk allOf/properties/$ref chains and collect all leaf properties.
 * Returns { propName -> propertySchema } (raw schema for that property).
 * Depth-limited to avoid cycles.
 */
function collectProperties(schema, depth = 0, visited = new Set()) {
  if (!schema || depth > 6) return {};

  // Follow $ref
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (visited.has(name)) return {};
    visited = new Set([...visited, name]);
    const resolved = resolveRef(schema.$ref);
    return collectProperties(resolved, depth + 1, visited);
  }

  const result = {};

  // allOf: merge all sub-schemas
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      Object.assign(result, collectProperties(sub, depth + 1, visited));
    }
  }

  // Direct properties
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [k, v] of Object.entries(schema.properties)) {
      result[k] = v;
    }
  }

  return result;
}

/**
 * Determine if a schema is a "record type" (data entity vs enum/param/wrapper)
 * We classify by: has object-like properties AND is not a pure enum/primitive/response-container
 */
function classifySchema(name, schema) {
  // Pure enums (no properties)
  if (schema.enum && !(schema.properties || schema.allOf)) return 'enum';

  // Pure scalar
  if (['string', 'integer', 'number', 'boolean'].includes(schema.type) && !schema.properties && !schema.allOf) return 'scalar';

  // Pure arrays without properties
  if (schema.type === 'array' && !schema.properties && !schema.allOf) return 'array';

  const props = collectProperties(schema);
  if (Object.keys(props).length === 0) return 'empty';

  // Response containers (IdsResponse, ListResponse, CountResponse, etc.) — often just wrappers
  // But we include them since the extractor may have chosen to emit them
  return 'record';
}

// Build schema classification map
const schemaClassMap = {};
for (const [name, schema] of Object.entries(schemas)) {
  schemaClassMap[name] = classifySchema(name, schema);
}

// Full enumerated record-type universe (schema-graph first)
const derivedRecordTypes = Object.keys(schemas).filter(n => schemaClassMap[n] === 'record');

// ============================================================
// BUILD INVERSE PATH INDEX (schema → paths that use it)
// ============================================================

/**
 * For each schema name, collect the paths + operations that reference it
 * (as request body or as response body — direct ref or array items)
 */
const schemaPathIndex = {}; // schemaName -> { listPaths: [], singlePaths: [], operations: { GET, POST, PUT, PATCH, DELETE } }

function ensureEntry(name) {
  if (!schemaPathIndex[name]) {
    schemaPathIndex[name] = { listPaths: [], singlePaths: [], operations: new Set() };
  }
}

for (const [pathStr, pathItem] of Object.entries(paths)) {
  const pathParams = (pathStr.match(/\{[^}]+\}/g) || []).length;
  const endsWithParam = pathStr.endsWith('}');

  for (const [method, operation] of Object.entries(pathItem)) {
    if (typeof operation !== 'object' || !operation || ['parameters', 'summary', 'description', 'servers'].includes(method)) continue;

    const m = method.toUpperCase();

    // Collect schema refs from response bodies
    const responses = operation.responses || {};
    for (const [status, resp] of Object.entries(responses)) {
      if (!['200', '201', '206'].includes(status)) continue;
      const content = resp.content || {};
      for (const [, mt] of Object.entries(content)) {
        const s = mt?.schema;
        if (!s) continue;

        // Direct ref
        if (s.$ref) {
          const n = refName(s.$ref);
          ensureEntry(n);
          schemaPathIndex[n].operations.add(m);
          if (m === 'GET') {
            if (!endsWithParam && pathParams === 0) schemaPathIndex[n].listPaths.push(pathStr);
            else if (endsWithParam) schemaPathIndex[n].singlePaths.push(pathStr);
            else schemaPathIndex[n].listPaths.push(pathStr);
          }

          // Also check if the referenced schema has an 'Items' or similar collection property
          const resolved = resolveRef(s.$ref);
          if (resolved) {
            const props = collectProperties(resolved);
            for (const [pk, pv] of Object.entries(props)) {
              if (pv?.type === 'array' && pv.items?.$ref) {
                const itemName = refName(pv.items.$ref);
                ensureEntry(itemName);
                schemaPathIndex[itemName].operations.add(m);
                if (m === 'GET') {
                  schemaPathIndex[itemName].listPaths.push(pathStr);
                }
              }
            }
          }
        }

        // Array items ref
        if (s.type === 'array' && s.items?.$ref) {
          const n = refName(s.items.$ref);
          ensureEntry(n);
          schemaPathIndex[n].operations.add(m);
          if (m === 'GET') schemaPathIndex[n].listPaths.push(pathStr);
        }
      }
    }

    // Collect schema refs from request bodies
    const reqBody = operation.requestBody;
    if (reqBody) {
      for (const [, mt] of Object.entries(reqBody.content || {})) {
        const s = mt?.schema;
        if (s?.$ref) {
          const n = refName(s.$ref);
          ensureEntry(n);
          schemaPathIndex[n].operations.add(m);
        }
      }
    }
  }
}

// ============================================================
// DERIVE BEST LIST PATH for a schema name
// ============================================================
function deriveBestListPath(schemaName) {
  const entry = schemaPathIndex[schemaName];
  if (!entry) return null;

  // Prefer the shortest list path (fewest template params)
  const candidates = [...entry.listPaths];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const pa = (a.match(/\{[^}]+\}/g) || []).length;
    const pb = (b.match(/\{[^}]+\}/g) || []).length;
    if (pa !== pb) return pa - pb;
    return a.length - b.length;
  });

  return candidates[0];
}

// ============================================================
// DERIVE PK CANDIDATES (schema-graph approach)
// ============================================================
function derivePKCandidates(schemaName, props) {
  const candidates = new Set();

  // 1. If 'Id' is a direct property → strong signal (WA convention)
  if ('Id' in props) candidates.add('Id');

  // 2. Find GET-single paths for this schema and extract the last path param
  const entry = schemaPathIndex[schemaName];
  if (entry) {
    for (const singlePath of entry.singlePaths) {
      const params = singlePath.match(/\{([^}]+)\}/g) || [];
      if (params.length > 0) {
        const lastParam = params[params.length - 1].slice(1, -1);
        // Map param name conventions to field names
        if (lastParam.toLowerCase() === 'id' || lastParam.toLowerCase().endsWith('id')) {
          // WA uses 'Id' as the standard PK field name
          if ('Id' in props) candidates.add('Id');
        }
      }
    }
  }

  return [...candidates];
}

// ============================================================
// DETECT WRITE OPERATIONS from paths
// ============================================================
function detectWriteOps(schemaName) {
  const ops = {};
  const entry = schemaPathIndex[schemaName];
  if (!entry) return ops;

  // Also scan all paths more broadly
  for (const [pathStr, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (typeof operation !== 'object' || !operation) continue;
      if (['parameters', 'summary', 'description', 'servers'].includes(method)) continue;

      const m = method.toUpperCase();
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) continue;

      // Check if this operation is related to this schema
      let related = entry.operations.has(m);

      // Also check: request body schema matches this schema name or
      // a related edit/create params schema
      const reqBody = operation.requestBody;
      if (reqBody) {
        for (const [, mt] of Object.entries(reqBody.content || {})) {
          const s = mt?.schema;
          if (s?.$ref) {
            const rName = refName(s.$ref);
            if (rName === schemaName ||
                rName === `Edit${schemaName}Params` ||
                rName === `Create${schemaName}Params` ||
                rName === `Update${schemaName}Params`) {
              related = true;
            }
          }
        }
      }

      // Check response schema
      const responses = operation.responses || {};
      for (const [status, resp] of Object.entries(responses)) {
        if (!['200', '201'].includes(status)) continue;
        for (const [, mt] of Object.entries(resp.content || {})) {
          if (mt?.schema?.$ref && refName(mt.schema.$ref) === schemaName) related = true;
        }
      }

      if (!related) continue;

      if (m === 'POST' && !ops.create) {
        // Check for 201 + Location header
        const resp201 = operation.responses?.['201'];
        let idLocation = 'body';
        if (resp201?.headers?.Location) idLocation = 'header';

        // Detect body shape
        let bodyShape = 'flat';
        let bodyKey = null;
        if (reqBody) {
          for (const [, mt] of Object.entries(reqBody.content || {})) {
            const s = mt?.schema;
            if (s?.$ref) {
              const rName = refName(s.$ref);
              const rSchema = resolveRef(s.$ref);
              if (rSchema?.properties) {
                const propKeys = Object.keys(rSchema.properties);
                // If there's a single property that contains the data → wrapped
                if (propKeys.length === 1) {
                  bodyShape = 'wrapped';
                  bodyKey = propKeys[0];
                }
              }
            }
          }
        }

        ops.create = { path: pathStr, method: 'POST', bodyShape, bodyKey, idLocation };
      }

      if ((m === 'PUT' || m === 'PATCH') && !ops.update) {
        ops.update = { path: pathStr, method: m };
      }

      if (m === 'DELETE' && !ops.delete) {
        ops.delete = { path: pathStr, method: 'DELETE' };
      }
    }
  }

  return ops;
}

// ============================================================
// DETECT PAGINATION PARAMS
// ============================================================
function detectPaginationParams(schemaName) {
  for (const [pathStr, pathItem] of Object.entries(paths)) {
    const getOp = pathItem.get;
    if (!getOp) continue;

    // Check if this GET returns our schema
    let isOurPath = false;
    for (const [status, resp] of Object.entries(getOp.responses || {})) {
      if (!['200', '206'].includes(status)) continue;
      for (const [, mt] of Object.entries(resp.content || {})) {
        const s = mt?.schema;
        if (!s) continue;
        if (s.$ref && refName(s.$ref) === schemaName) isOurPath = true;
        if (s.type === 'array' && s.items?.$ref && refName(s.items.$ref) === schemaName) isOurPath = true;
        // Check container schema
        if (s.$ref) {
          const resolved = resolveRef(s.$ref);
          if (resolved) {
            const props = collectProperties(resolved);
            for (const pv of Object.values(props)) {
              if (pv?.type === 'array' && pv.items?.$ref && refName(pv.items.$ref) === schemaName) isOurPath = true;
            }
          }
        }
      }
    }

    if (!isOurPath) continue;

    // Collect parameter names
    const params = (getOp.parameters || []).map(p => {
      if (p.$ref) {
        const resolved = resolveRef(p.$ref);
        return resolved?.name;
      }
      return p.name;
    }).filter(Boolean);

    return { path: pathStr, parameters: params };
  }
  return null;
}

// ============================================================
// FIELD TYPE INFERENCE (schema-graph: follow $ref chains)
// ============================================================
function inferFieldType(fieldSchema) {
  if (!fieldSchema) return 'nvarchar';
  if (fieldSchema.$ref) {
    const resolved = resolveRef(fieldSchema.$ref);
    if (!resolved) return 'nvarchar';
    return inferFieldType(resolved);
  }

  if (fieldSchema.type === 'integer') return 'int';
  if (fieldSchema.type === 'number') return 'decimal';
  if (fieldSchema.type === 'boolean') return 'bit';
  if (fieldSchema.format === 'date-time') return 'datetime';
  if (fieldSchema.format === 'date') return 'date';
  if (fieldSchema.type === 'array') return 'nvarchar'; // serialized
  if (fieldSchema.enum && fieldSchema.type !== 'integer') return 'nvarchar';
  if (fieldSchema.allOf || fieldSchema.anyOf || fieldSchema.oneOf) return 'nvarchar';
  if (fieldSchema.type === 'object' || fieldSchema.properties) return 'nvarchar';

  const ml = fieldSchema.maxLength;
  if (ml && ml <= 4000) return `nvarchar(${ml})`;

  return 'nvarchar';
}

// ============================================================
// FK MISCLASSIFICATION CHECK (path-LMS class)
// ============================================================
/**
 * Returns true if this field is a scalar FK (integer/string ID that references another object's PK),
 * false if it's an embedded object, array, or connection-typed relationship (→ access-path, NOT FK).
 */
function isScalarFK(fieldName, fieldSchema) {
  if (!fieldSchema) return false;

  // Resolve $ref
  let schema = fieldSchema;
  if (schema.$ref) {
    const name = refName(schema.$ref);
    const resolved = resolveRef(schema.$ref);
    // If it resolves to a record-type schema → embedded object, NOT scalar FK
    if (resolved && schemaClassMap[name] === 'record') return false;
    schema = resolved || schema;
  }

  // Arrays → collection, NOT scalar FK
  if (schema?.type === 'array') return false;

  // Object with properties → embedded object
  if (schema?.type === 'object' || (schema?.properties && Object.keys(schema.properties).length > 0)) return false;

  // allOf resolving to a complex object → NOT scalar FK
  if (schema?.allOf) {
    const merged = collectProperties(schema);
    if (Object.keys(merged).length > 1) return false;
  }

  // Must be a scalar integer or string
  if (schema?.type === 'integer' || schema?.type === 'string') {
    return true;
  }

  return false;
}

// ============================================================
// PARSE EMITTED METADATA
// ============================================================
const integration = Array.isArray(metadata) ? metadata[0] : metadata;
const emittedIOList = integration?.relatedEntities?.['MJ: Integration Objects'] || [];

const emittedObjects = {};
for (const io of emittedIOList) {
  const f = io.fields || {};
  const name = f.Name;
  if (!name) continue;

  const iofList = io.relatedEntities?.['MJ: Integration Object Fields'] || [];
  const emittedFields = {};
  const pkFields = [];
  const fkFields = [];

  for (const iof of iofList) {
    const ff = iof.fields || {};
    const fname = ff.Name;
    if (!fname) continue;
    emittedFields[fname] = {
      Type: ff.Type,
      IsPrimaryKey: ff.IsPrimaryKey,
      IsForeignKey: ff.IsForeignKey,
      IsRequired: ff.IsRequired,
      IsReadOnly: ff.IsReadOnly,
      IsUniqueKey: ff.IsUniqueKey,
      MaxLength: ff.MaxLength,
    };
    if (ff.IsPrimaryKey === true) pkFields.push(fname);
    if (ff.IsForeignKey === true) fkFields.push(fname);
  }

  emittedObjects[name] = {
    APIPath: f.APIPath || null,
    PaginationType: f.PaginationType || null,
    SupportsIncrementalSync: f.SupportsIncrementalSync,
    IncrementalWatermarkField: f.IncrementalWatermarkField || null,
    SupportsCreate: f.SupportsCreate,
    SupportsUpdate: f.SupportsUpdate,
    SupportsDelete: f.SupportsDelete,
    CreateAPIPath: f.CreateAPIPath || null,
    CreateMethod: f.CreateMethod || null,
    CreateBodyShape: f.CreateBodyShape || null,
    CreateBodyKey: f.CreateBodyKey || null,
    CreateIDLocation: f.CreateIDLocation || null,
    UpdateAPIPath: f.UpdateAPIPath || null,
    UpdateMethod: f.UpdateMethod || null,
    DeleteAPIPath: f.DeleteAPIPath || null,
    DeleteMethod: f.DeleteMethod || null,
    fields: emittedFields,
    pkFields,
    fkFields,
  };
}

const emittedNames = new Set(Object.keys(emittedObjects));

// ============================================================
// OBJECT-SET DIFF
// ============================================================
// "Derived universe" = all record-type schemas in the spec
const derivedUniverse = new Set(derivedRecordTypes);

// objectsMissing: in derived universe but NOT emitted
const objectsMissing = [...derivedUniverse].filter(n => !emittedNames.has(n));

// objectsExtra: emitted but NOT derivable from spec schemas
const objectsExtra = [...emittedNames].filter(n => !derivedUniverse.has(n));

const enumeratedCount = derivedUniverse.size;

process.stderr.write(`[INFO] Schema-graph enumerated record types: ${enumeratedCount}\n`);
process.stderr.write(`[INFO] Emitted objects: ${emittedNames.size}\n`);
process.stderr.write(`[INFO] objectsMissing (in spec, not emitted): ${objectsMissing.length}\n`);
process.stderr.write(`[INFO] objectsExtra (emitted, not in spec schemas): ${objectsExtra.length}\n`);

// ============================================================
// PER-OBJECT FIELD DIFF
// ============================================================

// WA 2025 pagination params (from docs: https://gethelp.wildapricot.com/en/categories/314-api-updates-in-2025)
const WA_PAGINATION_PARAMS = new Set(['$skip', '$top', '$count', 'skip', 'top', 'idsOnly', '$filter', 'savedSearch']);

const perObject = [];

for (const name of [...emittedNames]) {
  // Check if schema exists in spec
  const specSchema = schemas[name];
  if (!specSchema) {
    perObject.push({
      object: name,
      diverged: true,
      rederivedFieldCount: 0,
      emittedFieldCount: Object.keys(emittedObjects[name]?.fields || {}).length,
      missingFields: [],
      extraFields: Object.keys(emittedObjects[name]?.fields || {}),
      pathMismatch: 'NO_SCHEMA_IN_SPEC',
      pkMismatch: null,
      writeOpsMissing: [],
      fkMisclassified: [],
      paginationMismatch: null,
      watermarkMismatch: null,
      bodyShapeMismatch: null,
      typeMismatches: [],
    });
    continue;
  }

  const emitted = emittedObjects[name];

  // --- RE-DERIVE fields from schema graph ---
  const derivedProps = collectProperties(specSchema);
  const derivedFieldNames = new Set(Object.keys(derivedProps));
  const emittedFieldNames = new Set(Object.keys(emitted.fields));

  // Fields in spec but not emitted
  const missingFields = [...derivedFieldNames].filter(f => !emittedFieldNames.has(f));

  // Fields emitted but not in spec
  const extraFields = [...emittedFieldNames].filter(f => !derivedFieldNames.has(f));

  // --- RE-DERIVE PK ---
  const derivedPKs = derivePKCandidates(name, derivedProps);
  const emittedPKs = emitted.pkFields;

  let pkMismatch = null;
  if (derivedPKs.length > 0 && emittedPKs.length === 0) {
    pkMismatch = `Source signals PK=[${derivedPKs.join(',')}] but no PK emitted`;
  } else if (derivedPKs.length === 0 && emittedPKs.length > 0) {
    pkMismatch = `Emitted PK=[${emittedPKs.join(',')}] but no PK derivable from source`;
  } else if (derivedPKs.length > 0 && emittedPKs.length > 0) {
    const dSet = new Set(derivedPKs);
    const eDiff = emittedPKs.filter(p => !dSet.has(p));
    const dDiff = derivedPKs.filter(p => !new Set(emittedPKs).has(p));
    if (eDiff.length > 0 || dDiff.length > 0) {
      pkMismatch = `Derived PK=[${derivedPKs.join(',')}] vs emitted PK=[${emittedPKs.join(',')}]`;
    }
  }

  // --- RE-DERIVE list path ---
  const derivedListPath = deriveBestListPath(name);
  const emittedAPIPath = emitted.APIPath;

  let pathMismatch = null;
  if (derivedListPath && emittedAPIPath) {
    // Normalize: strip version prefix, lowercase, trailing slash
    const norm = (p) => p.replace(/^\/v\d+(\.\d+)?/, '').toLowerCase().replace(/\/$/, '');
    const nd = norm(derivedListPath);
    const ne = norm(emittedAPIPath);
    // Allow substring match (emitted may include account prefix)
    if (nd !== ne && !ne.endsWith(nd) && !nd.endsWith(ne)) {
      pathMismatch = `Derived=${derivedListPath} vs Emitted=${emittedAPIPath}`;
    }
  } else if (!emittedAPIPath && derivedListPath) {
    // Only flag if this is a top-level syncable object (has a direct path)
    if (emittedAPIPath !== undefined) {
      pathMismatch = `Derived has list path=${derivedListPath} but emitted APIPath is empty`;
    }
  }

  // --- WRITE OPS ---
  const derivedOps = detectWriteOps(name);
  const writeOpsMissing = [];

  if (derivedOps.create && emitted.SupportsCreate !== true) {
    writeOpsMissing.push('CREATE');
  }
  if (derivedOps.update && emitted.SupportsUpdate !== true) {
    writeOpsMissing.push('UPDATE');
  }
  if (derivedOps.delete && emitted.SupportsDelete !== true) {
    writeOpsMissing.push('DELETE');
  }

  // --- FK MISCLASSIFICATION ---
  const fkMisclassified = [];
  for (const fkField of emitted.fkFields) {
    const fieldSchema = derivedProps[fkField];
    if (!fieldSchema) continue; // Field not in spec; skip

    if (!isScalarFK(fkField, fieldSchema)) {
      // Emitted as IsForeignKey=true but it's an embedded object/array
      fkMisclassified.push(fkField);
    }
  }

  // --- PAGINATION MISMATCH ---
  let paginationMismatch = null;
  const paginationInfo = detectPaginationParams(name);
  if (paginationInfo) {
    const specParams = new Set(paginationInfo.parameters);
    const hasOffset = specParams.has('$skip') || specParams.has('skip') || specParams.has('$top') || specParams.has('top');
    const hasCursor = specParams.has('cursor') || specParams.has('after') || specParams.has('before');

    if (hasOffset && emitted.PaginationType === 'None') {
      paginationMismatch = `Spec has $skip/$top params at ${paginationInfo.path} but emitted PaginationType=None`;
    } else if (hasOffset && !emitted.PaginationType) {
      paginationMismatch = `Spec has $skip/$top params but emitted PaginationType is null`;
    } else if (hasCursor && emitted.PaginationType !== 'Cursor') {
      paginationMismatch = `Spec has cursor params but emitted PaginationType=${emitted.PaginationType}`;
    }
  }

  // --- WATERMARK MISMATCH ---
  let watermarkMismatch = null;
  if (emitted.IncrementalWatermarkField) {
    if (!derivedFieldNames.has(emitted.IncrementalWatermarkField)) {
      watermarkMismatch = `IncrementalWatermarkField=${emitted.IncrementalWatermarkField} not found as a property in source schema`;
    }
  }
  // Also check: if schema has a timestamp field but SupportsIncrementalSync=False
  if (!emitted.SupportsIncrementalSync) {
    const timestampFields = [...derivedFieldNames].filter(f =>
      f.toLowerCase().includes('modified') || f.toLowerCase().includes('updated') || f.toLowerCase().includes('changed')
    );
    // Not flagging this as a mismatch — just info, since WA doesn't explicitly support incremental for most objects
  }

  // --- BODY SHAPE MISMATCH ---
  let bodyShapeMismatch = null;
  if (emitted.SupportsCreate === true) {
    if (!emitted.CreateBodyShape) {
      bodyShapeMismatch = 'SupportsCreate=true but CreateBodyShape is null';
    } else if (!emitted.CreateIDLocation) {
      bodyShapeMismatch = 'SupportsCreate=true but CreateIDLocation is null';
    } else if (derivedOps.create?.idLocation) {
      // Check if spec signals Location header but emitted says body
      if (derivedOps.create.idLocation === 'header' && emitted.CreateIDLocation !== 'header') {
        bodyShapeMismatch = `Spec 201 has Location header suggesting IDLocation=header but emitted CreateIDLocation=${emitted.CreateIDLocation}`;
      }
    }
  }

  // --- TYPE MISMATCHES ---
  const typeMismatches = [];
  for (const [fname, femitted] of Object.entries(emitted.fields)) {
    const fspec = derivedProps[fname];
    if (!fspec) continue; // Extra field

    const derivedType = inferFieldType(fspec);
    const emittedType = femitted.Type;
    if (!emittedType) continue;

    // Significant semantic type mismatches only (not nvarchar vs nvarchar(N))
    const dBase = derivedType.replace(/\(\d+\)/, '').toLowerCase();
    const eBase = emittedType.replace(/\(\d+\)/, '').toLowerCase();

    const isNumD = ['int', 'decimal', 'bigint', 'float'].includes(dBase);
    const isNumE = ['int', 'decimal', 'bigint', 'float'].includes(eBase);
    const isBoolD = ['bit'].includes(dBase);
    const isBoolE = ['bit'].includes(eBase);
    const isDateD = ['datetime', 'date', 'datetimeoffset'].includes(dBase);
    const isDateE = ['datetime', 'date', 'datetimeoffset'].includes(eBase);

    // Flag numeric/bool/date misclassified as string, or vice versa
    if ((isNumD && !isNumE && !['nvarchar'].includes(eBase)) ||
        (isNumE && !isNumD && !['nvarchar'].includes(dBase)) ||
        (isBoolD && !isBoolE && !['nvarchar'].includes(eBase)) ||
        (isDateD && !isDateE && !['nvarchar'].includes(dBase))) {
      typeMismatches.push(`${fname}: derived=${derivedType} vs emitted=${emittedType}`);
    }
  }

  const isDiverged =
    missingFields.length > 0 ||
    pkMismatch !== null ||
    pathMismatch !== null ||
    writeOpsMissing.length > 0 ||
    fkMisclassified.length > 0 ||
    paginationMismatch !== null ||
    watermarkMismatch !== null ||
    bodyShapeMismatch !== null ||
    typeMismatches.length > 0;

  perObject.push({
    object: name,
    diverged: isDiverged,
    rederivedFieldCount: derivedFieldNames.size,
    emittedFieldCount: emittedFieldNames.size,
    missingFields,
    extraFields,
    pathMismatch,
    pkMismatch,
    writeOpsMissing,
    fkMisclassified,
    paginationMismatch,
    watermarkMismatch,
    bodyShapeMismatch,
    typeMismatches,
  });
}

// ============================================================
// DIVERGENCE HISTOGRAM
// ============================================================
const histogram = {
  missingFields: perObject.filter(o => o.missingFields?.length > 0).length,
  extraFields: perObject.filter(o => o.extraFields?.length > 0).length,
  typeMismatches: perObject.filter(o => o.typeMismatches?.length > 0).length,
  fkMisclassified: perObject.filter(o => o.fkMisclassified?.length > 0).length,
  writeOpsMissing: perObject.filter(o => o.writeOpsMissing?.length > 0).length,
  pkMismatch: perObject.filter(o => o.pkMismatch !== null).length,
  pathMismatch: perObject.filter(o => o.pathMismatch !== null).length,
  paginationMismatch: perObject.filter(o => o.paginationMismatch !== null).length,
  watermarkMismatch: perObject.filter(o => o.watermarkMismatch !== null).length,
  bodyShapeMismatch: perObject.filter(o => o.bodyShapeMismatch !== null).length,
};

const objectsDivergedCount = perObject.filter(o => o.diverged).length;

process.stderr.write(`[INFO] objectsDivergedCount: ${objectsDivergedCount}\n`);
process.stderr.write(`[INFO] Histogram: ${JSON.stringify(histogram)}\n`);

// ============================================================
// ACTIONABLE CAPPED SAMPLE (≤40 entries, most actionable first)
// ============================================================
const ACTIONABLE_WEIGHTS = o => (
  (o.missingFields?.length || 0) * 10 +
  (o.fkMisclassified?.length || 0) * 8 +
  (o.writeOpsMissing?.length || 0) * 6 +
  (o.pathMismatch ? 8 : 0) +
  (o.pkMismatch ? 6 : 0) +
  (o.bodyShapeMismatch ? 4 : 0) +
  (o.paginationMismatch ? 3 : 0) +
  (o.watermarkMismatch ? 2 : 0)
);

const actionableEntries = perObject
  .filter(o => o.diverged && ACTIONABLE_WEIGHTS(o) > 0) // exclude extraFields-only
  .sort((a, b) => ACTIONABLE_WEIGHTS(b) - ACTIONABLE_WEIGHTS(a))
  .slice(0, 40);

process.stderr.write(`[INFO] Actionable entries (capped at 40): ${actionableEntries.length}\n`);

// ============================================================
// OUTPUT
// ============================================================
const result = {
  strategy: 'COMPONENT-SCHEMA-GRAPH-TRAVERSAL: Schema-first enumeration from #/components/schemas using $ref-chased allOf property resolution; back-linked to paths to assign list endpoints, write operations, and PK signals. Opposite traversal order from path-first extraction — treats schemas as the primary universe and paths as annotations.',
  enumeratedCount,
  objectsMissing,
  objectsExtra,
  objectsDivergedCount,
  divergenceHistogram: histogram,
  perObject: actionableEntries,
  artifact: OUTPUT_PATH,
  // Full data for artifact file (all objects, not just actionable)
  _fullPerObject: perObject,
  _derivedRecordTypes: derivedRecordTypes,
  _allSchemaClassifications: schemaClassMap,
};

// Write artifact (full, lossless)
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
process.stderr.write(`[INFO] Artifact written to ${OUTPUT_PATH}\n`);

// Compact output for StructuredOutput
const output = {
  strategy: result.strategy,
  enumeratedCount,
  objectsMissing,
  objectsExtra,
  objectsDivergedCount,
  divergenceHistogram: histogram,
  perObject: actionableEntries,
  artifact: OUTPUT_PATH,
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
