#!/usr/bin/env node
// dual-derivation-p2.mjs
//
// INDEPENDENT SECOND DERIVATION (P8 dual-derivation gate) for the Blackbaud connector.
//
// STRATEGY (deliberately distinct from a naive path-first walk):
//   RESPONSE-SCHEMA-FIRST, $ref-CHASED derivation. Instead of iterating path segments /
// operationId naming / tags (the "first-pass" style), this script:
//     1. Builds a full $ref resolution index per swagger file (definitions graph).
//     2. Walks every GET operation's 200 response schema, and $ref-CHASES through
//        wrapper/envelope schemas (the "ApiCollectionOf<X>Read" pattern in these Swagger 2.0
//        specs) down to the terminal item schema - that terminal schema's properties are the
//        field-name ground truth for the object, NOT the path segment name and NOT the
//        Create/Edit/Add DTO (which is a different, often narrower, write-shape schema).
//     3. Cross-references the *write* operations (POST/PATCH/PUT/DELETE) by matching their
//        request-body $ref schema name against the same object's read-schema name prefix
//        (e.g. "ConstituentApi.AddressAdd" / "ConstituentApi.AddressEdit" share the
//        "ConstituentApi.Address" stem with "ConstituentApi.AddressRead") - a schema-STEM
//        join, not a path join. This independently confirms write-capability + body shape
//        without ever walking the path tree for it.
//     4. PK candidates are derived from the terminal read-schema's own "id"-ish property
//        AND independently corroborated by scanning path templates for a `{..._id}` segment
//        whose stripped name matches a property in the schema (two independent signals,
//        gathered via two different code paths, then merged).
//     5. Nesting/access-path is derived by finding, for each terminal schema, the SHORTEST
//        GET path whose last non-parameterized segment's singular/plural form matches the
//        schema's stem - independent of any parent/child registry the extractor may have built.
//
// This script does NOT read the extractor's script, its EXTRACTION_REPORT, its matrix, or
// the target metadata file except in its own diff step below (never inspected by the human).
//
// Usage: node dual-derivation-p2.mjs <openapiDir> <metadataFile> <outputJsonPath>

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const openapiDir = process.argv[2];
const metadataFile = process.argv[3];
const outputPath = process.argv[4];

if (!openapiDir || !metadataFile || !outputPath) {
    console.error('Usage: node dual-derivation-p2.mjs <openapiDir> <metadataFile> <outputJsonPath>');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Load every swagger file into a per-family spec map.
// ---------------------------------------------------------------------------
const files = readdirSync(openapiDir).filter(f => f.endsWith('.swagger.json'));
/** @type {Record<string, any>} */
const specs = {};
for (const f of files) {
    const family = f.replace('.swagger.json', '');
    try {
        specs[family] = JSON.parse(readFileSync(join(openapiDir, f), 'utf8'));
    } catch (e) {
        console.error(`WARN: failed to parse ${f}: ${e.message}`);
    }
}

// ---------------------------------------------------------------------------
// 2. Build a $ref resolver per family (definitions graph), and a helper to
//    chase a $ref chain through wrapper/envelope schemas down to a terminal
//    object schema (one with real "properties", not just a "value" array).
// ---------------------------------------------------------------------------
function refName(ref) {
    // "#/definitions/Foo.Bar" -> "Foo.Bar"
    const m = /^#\/definitions\/(.+)$/.exec(ref || '');
    return m ? m[1] : null;
}

function resolveSchema(family, schema, seen = new Set()) {
    if (!schema) return null;
    if (schema.$ref) {
        const name = refName(schema.$ref);
        if (!name || seen.has(name)) return null; // cycle guard
        const defs = specs[family].definitions || {};
        const target = defs[name];
        if (!target) return null;
        seen.add(name);
        return { name, schema: target };
    }
    return { name: null, schema };
}

// Chase a response schema down to the terminal "item" schema:
//   - if schema has `properties.value` that is an array of $ref items -> chase into that ref
//   - else if schema itself is a $ref -> resolve once, repeat
//   - stop when we hit a schema with real (non-envelope) properties
function chaseToTerminal(family, schema, depth = 0) {
    if (!schema || depth > 8) return null;
    let current = resolveSchema(family, schema);
    if (!current) return null;

    // envelope detection: has "value" property that's an array of $ref
    const props = current.schema.properties || {};
    if (props.value && props.value.type === 'array' && props.value.items && props.value.items.$ref) {
        const inner = chaseToTerminal(family, props.value.items, depth + 1);
        if (inner) return inner;
    }
    // allOf composition: merge all $ref branches' properties (rare in these specs, but handled)
    if (Array.isArray(current.schema.allOf)) {
        const merged = { properties: {}, required: [] };
        for (const branch of current.schema.allOf) {
            const r = resolveSchema(family, branch);
            if (r) {
                Object.assign(merged.properties, r.schema.properties || {});
                merged.required.push(...(r.schema.required || []));
            } else if (branch.properties) {
                Object.assign(merged.properties, branch.properties);
            }
        }
        return { name: current.name, schema: merged };
    }
    return current;
}

// ---------------------------------------------------------------------------
// 3. Walk every family's GET operations, chase to terminal read-schema,
//    and build the object universe purely from response-schema resolution
//    (independent of path-segment naming).
// ---------------------------------------------------------------------------

/**
 * objectKey -> {
 *   family, terminalSchemaName, stem, properties: {name: propSchema},
 *   listPaths: [{family, path, method, params}],
 *   getOnePaths: [...], createPaths: [...], updatePaths: [...], deletePaths: [...],
 * }
 */
const derivedObjects = new Map();

function stemOf(schemaName) {
    // "ConstituentApi.AddressRead" -> "ConstituentApi.Address"
    // "GiftApi.GiftRead" -> "GiftApi.Gift"
    return schemaName.replace(/(Read|Add|Edit|Create|Update|View|Summary)$/, '');
}

function lastPathSegment(path) {
    const segs = path.split('/').filter(Boolean);
    for (let i = segs.length - 1; i >= 0; i--) {
        if (!segs[i].startsWith('{')) return segs[i];
    }
    return segs[segs.length - 1] || '';
}

function pathParamNames(path) {
    const out = [];
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(path))) out.push(m[1]);
    return out;
}

for (const [family, spec] of Object.entries(specs)) {
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
        for (const [method, op] of Object.entries(methods)) {
            if (!op || typeof op !== 'object' || !op.operationId) continue;
            const verb = method.toUpperCase();

            if (verb === 'GET') {
                const resp200 = op.responses?.['200'];
                const schemaRef = resp200?.schema;
                const terminal = chaseToTerminal(family, schemaRef);
                if (!terminal || !terminal.name) continue;
                const stem = stemOf(terminal.name);
                const key = `${family}::${stem}`;
                if (!derivedObjects.has(key)) {
                    derivedObjects.set(key, {
                        family,
                        terminalSchemaNames: new Set(),
                        stem,
                        properties: {},
                        required: new Set(),
                        listPaths: [],
                        getOnePaths: [],
                        createPaths: [],
                        updatePaths: [],
                        deletePaths: [],
                        allParamsSeen: new Set(),
                    });
                }
                const rec = derivedObjects.get(key);
                rec.terminalSchemaNames.add(terminal.name);
                Object.assign(rec.properties, terminal.schema.properties || {});
                for (const r of terminal.schema.required || []) rec.required.add(r);

                const params = (op.parameters || []).filter(p => p.in === 'query' || p.in === 'path').map(p => p.name);
                for (const p of params) rec.allParamsSeen.add(p);

                const isCollection = !!(resp200?.schema && resp200.schema.$ref && specs[family].definitions[refName(resp200.schema.$ref)]?.properties?.value);
                const bucket = isCollection ? rec.listPaths : rec.getOnePaths;
                bucket.push({ path, method: verb, operationId: op.operationId, params, pathParams: pathParamNames(path) });
            }
        }
    }
}

// Second sweep: attach write operations (POST/PATCH/PUT/DELETE) by matching
// their body-schema stem against an already-derived object's stem (schema-STEM join,
// NOT a path join). This independently corroborates SupportsWrite + body shape.
for (const [family, spec] of Object.entries(specs)) {
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
        for (const [method, op] of Object.entries(methods)) {
            if (!op || typeof op !== 'object' || !op.operationId) continue;
            const verb = method.toUpperCase();
            if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(verb)) continue;

            const bodyParam = (op.parameters || []).find(p => p.in === 'body');
            let bodySchemaName = null;
            if (bodyParam?.schema?.$ref) bodySchemaName = refName(bodyParam.schema.$ref);

            // Determine 200/201 response for ID location
            const okResp = op.responses?.['200'] || op.responses?.['201'];
            let idLocationHint = null;
            if (okResp?.schema?.$ref) {
                const rSchema = specs[family].definitions[refName(okResp.schema.$ref)];
                if (rSchema?.properties && Object.keys(rSchema.properties).some(k => /^id$/i.test(k))) {
                    idLocationHint = 'body';
                }
            } else if (okResp?.headers?.Location) {
                idLocationHint = 'header';
            }

            let matchStem = null;
            if (bodySchemaName) {
                matchStem = stemOf(bodySchemaName);
            } else {
                // DELETE/no-body PATCH: match by last path segment against known stems
                matchStem = null;
            }

            // find candidate object records in this family whose stem matches, OR whose
            // last path segment matches the path-segment-derived object (fallback for DELETE)
            let matched = false;
            for (const [key, rec] of derivedObjects.entries()) {
                if (rec.family !== family) continue;
                const stemMatches = matchStem && (rec.stem === matchStem || rec.stem.endsWith(matchStem) || matchStem.endsWith(rec.stem));
                if (stemMatches) {
                    matched = true;
                    const entry = { path, method: verb, operationId: op.operationId, bodySchemaName, idLocationHint, pathParams: pathParamNames(path) };
                    if (verb === 'POST') rec.createPaths.push(entry);
                    else if (verb === 'PATCH' || verb === 'PUT') rec.updatePaths.push(entry);
                    else if (verb === 'DELETE') rec.deletePaths.push(entry);
                }
            }
            if (!matched && !bodySchemaName) {
                // DELETE with no body: match via last path segment singularized against stems
                const seg = lastPathSegment(path).toLowerCase();
                for (const [key, rec] of derivedObjects.entries()) {
                    if (rec.family !== family) continue;
                    const stemLeaf = rec.stem.split('.').pop().toLowerCase();
                    if (seg.includes(stemLeaf) || stemLeaf.includes(seg.replace(/s$/, ''))) {
                        const entry = { path, method: verb, operationId: op.operationId, bodySchemaName: null, idLocationHint, pathParams: pathParamNames(path) };
                        if (verb === 'DELETE') rec.deletePaths.push(entry);
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 4. PK candidate derivation - TWO independent signals merged:
//    (a) terminal schema's own "id"-shaped property (name === 'id' or ends with '_id'
//        AND type string/integer, found directly on the terminal schema - not inherited)
//    (b) a GET-one path parameter whose name (stripped of trailing "_id") matches
//        a property name on the terminal schema.
// ---------------------------------------------------------------------------
function derivePKCandidates(rec) {
    const candidates = new Set();
    // signal (a): direct 'id' property on the terminal (Read) schema
    if (rec.properties.id) candidates.add('id');
    for (const propName of Object.keys(rec.properties)) {
        if (/^id$/i.test(propName)) candidates.add(propName);
    }
    // signal (b): GET-one path param naming
    for (const p of rec.getOnePaths) {
        for (const pp of p.pathParams) {
            const stripped = pp.replace(/_id$/i, '');
            if (rec.properties[pp] || rec.properties['id']) {
                // the path param itself might be the semantic PK slot even if the property is just "id"
                candidates.add('id');
            }
        }
    }
    return [...candidates];
}

// ---------------------------------------------------------------------------
// 5. Access-path / nesting derivation: for each object, find the shortest GET
//    path whose FIRST param-templated ancestor segment gives a nesting parent,
//    independent of any parent/child registry.
// ---------------------------------------------------------------------------
function deriveAccessPath(rec) {
    const allPaths = [...rec.listPaths, ...rec.getOnePaths];
    if (allPaths.length === 0) return { type: 'unreachable' };
    // prefer a path with NO path params (top-level collection door)
    const topLevel = allPaths.find(p => p.pathParams.length === 0 && p.method === 'GET');
    if (topLevel) return { type: 'top-level', path: topLevel.path };
    // else shortest nested path
    const sorted = [...allPaths].sort((a, b) => a.path.length - b.path.length);
    return { type: 'nested', path: sorted[0].path, parentParams: sorted[0].pathParams };
}

// ---------------------------------------------------------------------------
// 6. Type-mapping (Swagger primitive -> our coarse type bucket) for typeMismatch detection.
// ---------------------------------------------------------------------------
function coarseType(propSchema) {
    if (!propSchema) return 'unknown';
    if (propSchema.$ref) return 'object-ref';
    const t = propSchema.type;
    const fmt = propSchema.format;
    if (t === 'string' && fmt === 'date-time') return 'datetime';
    if (t === 'string') return 'string';
    if (t === 'integer') return 'int';
    if (t === 'number') return 'decimal';
    if (t === 'boolean') return 'boolean';
    if (t === 'array') return 'array';
    if (t === 'object') return 'object';
    return t || 'unknown';
}

// ---------------------------------------------------------------------------
// 7. Build final derived-object records with resolved attributes.
// ---------------------------------------------------------------------------
const finalObjects = [];
for (const [key, rec] of derivedObjects.entries()) {
    const pkCandidates = derivePKCandidates(rec);
    const access = deriveAccessPath(rec);
    const watermarkParams = [...rec.allParamsSeen].filter(p => /date_added|last_modified|date_modified|updated|since|from_date|start_date/i.test(p));
    const fieldTypes = {};
    for (const [pName, pSchema] of Object.entries(rec.properties)) {
        fieldTypes[pName] = { coarse: coarseType(pSchema), maxLength: pSchema?.maxLength ?? null };
    }
    finalObjects.push({
        key,
        family: rec.family,
        stem: rec.stem,
        terminalSchemaNames: [...rec.terminalSchemaNames],
        fieldNames: Object.keys(rec.properties),
        fieldTypes,
        pkCandidates,
        access,
        listPaths: rec.listPaths.map(p => p.path),
        getOnePaths: rec.getOnePaths.map(p => p.path),
        createPaths: rec.createPaths.map(p => ({ path: p.path, bodySchemaName: p.bodySchemaName, idLocationHint: p.idLocationHint })),
        updatePaths: rec.updatePaths.map(p => ({ path: p.path, bodySchemaName: p.bodySchemaName })),
        deletePaths: rec.deletePaths.map(p => p.path),
        watermarkParams,
        supportsWrite: rec.createPaths.length > 0 || rec.updatePaths.length > 0 || rec.deletePaths.length > 0,
    });
}

// ---------------------------------------------------------------------------
// 8. Object-set universe: enumerate ALL distinct terminal read-schema stems
//    across ALL specs (not just the ones with a reachable GET) PLUS all
//    top-level `definitions` entries that look like domain objects (object type,
//    has properties, not an envelope/wrapper/Add/Edit-only DTO with no Read sibling)
//    -- this gives the broadest independent "enumerated universe" count, matching
//    the spirit of enumerate-catalog.mjs but derived independently here.
// ---------------------------------------------------------------------------
const allSchemaStems = new Set();
for (const [family, spec] of Object.entries(specs)) {
    const defs = spec.definitions || {};
    for (const [name, s] of Object.entries(defs)) {
        if (!s || typeof s !== 'object' || s.enum) continue;
        const isObj = s.type === 'object' || !!s.properties || Array.isArray(s.allOf);
        if (!isObj) continue;
        // skip pure envelope/wrapper schemas (only has 'count'/'value' props, no other domain fields)
        const propNames = Object.keys(s.properties || {});
        const isEnvelope = propNames.length > 0 && propNames.every(p => ['count', 'value', 'next_link'].includes(p));
        if (isEnvelope) continue;
        allSchemaStems.add(`${family}::${stemOf(name)}`);
    }
}

// ---------------------------------------------------------------------------
// 9. DIFF against the emitted metadata file.
// ---------------------------------------------------------------------------
let metadataRoot;
try {
    metadataRoot = JSON.parse(readFileSync(metadataFile, 'utf8'));
} catch (e) {
    console.error(`FATAL: cannot read/parse metadata file ${metadataFile}: ${e.message}`);
    process.exit(1);
}

const topRecord = Array.isArray(metadataRoot) ? metadataRoot[0] : metadataRoot;
const relatedEntities = topRecord?.relatedEntities || {};
const emittedIOs = relatedEntities['MJ: Integration Objects'] || [];

// Build a lookup: emitted IO name (lowercased, normalized) -> IO record
function normalizeName(n) {
    return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const emittedByNormName = new Map();
for (const io of emittedIOs) {
    const f = io.fields || {};
    emittedByNormName.set(normalizeName(f.Name), io);
}

// Build a lookup from derived stems -> normalized "object slug" candidates, so we can
// match our family::stem records against the emitted IO Name strings. Matching is
// EXACT-FIRST (normalized-equal) and only falls back to a bounded prefix/suffix
// containment check when the candidate token is long enough (>=6 normalized chars)
// to avoid short-token collisions (e.g. "rating" colliding with "rating_category" /
// "rating_source" / "rating" itself -- three distinct emitted IOs that all contain
// the substring "rating"). This keeps the diff signal to genuine structural gaps
// rather than an artifact of loose substring matching.
function stemToSlugCandidates(stem) {
    // "ConstituentApi.Address" -> ["address", "addresses"]
    const leaf = stem.split('.').pop().replace(/Api$/, '');
    // split camelCase into words
    const words = leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    const compact = words.replace(/\s+/g, '');
    return [compact, compact + 's', compact.replace(/y$/, 'ies')];
}

function namesMatch(ioNameNorm, candidates) {
    // 1) exact normalized equality against any candidate form (strongest, preferred signal)
    if (candidates.some(c => ioNameNorm === c)) return true;
    // 2) bounded containment - only for longer tokens (>=6 chars) to avoid short-word
    //    collisions like "rating" vs "ratingcategory" vs "ratingsource"
    return candidates.some(c => c.length >= 6 && (ioNameNorm === c + 'summary' || ioNameNorm === c + 'configuration'));
}

// ---- Object-set diff (the primary "11-of-1,694" signal) ----
// enumeratedCount: total distinct family::stem schema pairs found across all specs
const enumeratedCount = allSchemaStems.size;

// Which of our derived (reachable, GET-backed) objects have NO corresponding emitted IO?
const objectsMissing = [];
const objectsMatchedKeys = new Set();
for (const obj of finalObjects) {
    const candidates = stemToSlugCandidates(obj.stem);
    let found = null;
    for (const io of emittedIOs) {
        const ioNameNorm = normalizeName(io.fields?.Name);
        if (namesMatch(ioNameNorm, candidates)) {
            found = io;
            break;
        }
    }
    if (found) {
        objectsMatchedKeys.add(obj.key);
    } else {
        objectsMissing.push(`${obj.family}::${obj.stem} (schemas: ${obj.terminalSchemaNames.join(',')})`);
    }
}

// Which emitted IOs have NO corresponding re-derivable (GET-backed, reachable) object?
const objectsExtra = [];
for (const io of emittedIOs) {
    const ioNameNorm = normalizeName(io.fields?.Name);
    const matched = finalObjects.some(obj => namesMatch(ioNameNorm, stemToSlugCandidates(obj.stem)));
    if (!matched) objectsExtra.push(io.fields?.Name || '(unnamed)');
}

// ---- Per-object field/attribute diff, for objects that DID match ----
const perObjectFull = [];
const histogram = {
    missingFields: 0, extraFields: 0, typeMismatches: 0, fkMisclassified: 0,
    writeOpsMissing: 0, pkMismatch: 0, pathMismatch: 0, paginationMismatch: 0,
    watermarkMismatch: 0, bodyShapeMismatch: 0,
};

function normFieldName(n) {
    return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

for (const obj of finalObjects) {
    const candidates = stemToSlugCandidates(obj.stem);
    const io = emittedIOs.find(x => namesMatch(normalizeName(x.fields?.Name), candidates));
    if (!io) continue; // already captured in objectsMissing

    const ioFields = (io.relatedEntities?.['MJ: Integration Object Fields'] || []).map(x => x.fields || {});
    const emittedFieldNamesNorm = new Set(ioFields.map(f => normFieldName(f.Name)));
    const derivedFieldNamesNorm = new Map(obj.fieldNames.map(f => [normFieldName(f), f]));

    const missingFields = [];
    for (const [normName, origName] of derivedFieldNamesNorm.entries()) {
        if (!emittedFieldNamesNorm.has(normName)) missingFields.push(origName);
    }
    const extraFields = [];
    for (const f of ioFields) {
        if (!derivedFieldNamesNorm.has(normFieldName(f.Name))) extraFields.push(f.Name);
    }

    // PK mismatch: our derived PK candidates (normalized) vs emitted IsPrimaryKey fields
    const emittedPKFields = ioFields.filter(f => f.IsPrimaryKey).map(f => normFieldName(f.Name));
    const derivedPKNorm = obj.pkCandidates.map(normFieldName);
    let pkMismatch;
    if (derivedPKNorm.length > 0 && emittedPKFields.length > 0) {
        const overlap = derivedPKNorm.some(p => emittedPKFields.includes(p));
        if (!overlap) pkMismatch = `derived PK candidates [${obj.pkCandidates.join(',')}] vs emitted IsPrimaryKey [${ioFields.filter(f => f.IsPrimaryKey).map(f => f.Name).join(',')}]`;
    } else if (derivedPKNorm.length > 0 && emittedPKFields.length === 0) {
        pkMismatch = `derived PK candidates [${obj.pkCandidates.join(',')}] but emitted has NO IsPrimaryKey field`;
    }

    // Path mismatch: does the emitted APIPath appear among our derived list/getOne paths (loosely)?
    const emittedAPIPath = io.fields?.APIPath;
    let pathMismatch;
    if (emittedAPIPath) {
        const allDerivedPaths = [...obj.listPaths, ...obj.getOnePaths];
        const normEmitted = emittedAPIPath.replace(/\{[^}]+\}/g, '{}').toLowerCase();
        const anyMatch = allDerivedPaths.some(p => p.replace(/\{[^}]+\}/g, '{}').toLowerCase() === normEmitted
            || p.replace(/\{[^}]+\}/g, '{}').toLowerCase().endsWith(normEmitted)
            || normEmitted.endsWith(p.replace(/\{[^}]+\}/g, '{}').toLowerCase()));
        if (!anyMatch && allDerivedPaths.length > 0) {
            pathMismatch = `emitted APIPath="${emittedAPIPath}" not found among derived paths [${allDerivedPaths.slice(0, 5).join(' | ')}]`;
        }
    }

    // Write-ops missing: emitted SupportsCreate/Update/Delete vs our derived create/update/delete paths
    const writeOpsMissing = [];
    if (io.fields?.SupportsCreate && obj.createPaths.length === 0) writeOpsMissing.push('Create');
    if (io.fields?.SupportsUpdate && obj.updatePaths.length === 0) writeOpsMissing.push('Update');
    if (io.fields?.SupportsDelete && obj.deletePaths.length === 0) writeOpsMissing.push('Delete');

    // Pagination mismatch: declared PaginationType vs derived param names seen for the list path
    let paginationMismatch;
    const declaredPagType = io.fields?.PaginationType;
    if (declaredPagType && declaredPagType !== 'None') {
        const family = obj.family;
        const specParams = new Set();
        for (const p of obj.listPaths) {
            const methods = specs[family]?.paths?.[p] || {};
            const getOp = methods.get;
            for (const prm of getOp?.parameters || []) {
                if (prm.in === 'query') specParams.add(prm.name);
            }
        }
        const hasOffset = specParams.has('offset') || specParams.has('skip');
        const hasLimit = specParams.has('limit') || specParams.has('top');
        if (declaredPagType === 'Offset' && !(hasOffset && hasLimit) && obj.listPaths.length > 0) {
            paginationMismatch = `declared Offset pagination but spec query params for [${obj.listPaths.join(',')}] are [${[...specParams].join(',')}]`;
        }
        if (declaredPagType === 'Cursor' && ![...specParams].some(p => /cursor|next|continuation/i.test(p)) && obj.listPaths.length > 0) {
            paginationMismatch = `declared Cursor pagination but no cursor-shaped param found in [${[...specParams].join(',')}]`;
        }
    }

    // Watermark mismatch: declared IncrementalWatermarkField vs our derived watermark-shaped params
    let watermarkMismatch;
    const declaredWatermark = io.fields?.IncrementalWatermarkField;
    if (io.fields?.SupportsIncrementalSync) {
        if (!declaredWatermark) {
            watermarkMismatch = 'SupportsIncrementalSync=true but no IncrementalWatermarkField declared';
        } else if (obj.watermarkParams.length > 0 && !obj.watermarkParams.some(w => normFieldName(w) === normFieldName(declaredWatermark))) {
            watermarkMismatch = `declared watermark="${declaredWatermark}" not among derived watermark-shaped params [${obj.watermarkParams.join(',')}]`;
        }
    }

    // Body shape mismatch: declared CreateBodyShape/BodyKey/IDLocation vs derived
    let bodyShapeMismatch;
    if (io.fields?.SupportsCreate && obj.createPaths.length > 0) {
        const derivedCreate = obj.createPaths[0];
        const declaredShape = io.fields?.CreateBodyShape;
        const derivedIsWrapped = derivedCreate.bodySchemaName && /^[A-Za-z]+Api\.[A-Za-z]+(Add|Create)$/.test(derivedCreate.bodySchemaName) === false && false; // Swagger2 body schemas here are flat DTOs, not wrapped envelopes
        if (declaredShape === 'wrapped' && !io.fields?.CreateBodyKey) {
            bodyShapeMismatch = `declared CreateBodyShape=wrapped but no CreateBodyKey set`;
        }
        const declaredIDLoc = io.fields?.CreateIDLocation;
        if (declaredIDLoc && derivedCreate.idLocationHint && declaredIDLoc !== derivedCreate.idLocationHint) {
            bodyShapeMismatch = `declared CreateIDLocation="${declaredIDLoc}" but derived response shape suggests "${derivedCreate.idLocationHint}"`;
        }
    }

    // FK misclassification: any emitted IsForeignKey=true field whose SOURCE type (per our
    // schema walk) is itself an object/array/$ref (a nesting edge), not a scalar.
    const fkMisclassified = [];
    for (const f of ioFields) {
        if (!f.IsForeignKey) continue;
        const derivedType = obj.fieldTypes[obj.fieldNames.find(fn => normFieldName(fn) === normFieldName(f.Name)) || ''];
        if (derivedType && (derivedType.coarse === 'object-ref' || derivedType.coarse === 'array' || derivedType.coarse === 'object')) {
            fkMisclassified.push(`${f.Name} (source type=${derivedType.coarse}, not a scalar FK)`);
        }
    }

    // Type mismatches: coarse type bucket differs
    const typeMismatches = [];
    for (const f of ioFields) {
        const origName = obj.fieldNames.find(fn => normFieldName(fn) === normFieldName(f.Name));
        if (!origName) continue; // already counted as extraField if truly absent
        const derived = obj.fieldTypes[origName];
        if (!derived) continue;
        const emittedTypeNorm = String(f.Type || '').toLowerCase();
        const bucketMap = { string: ['string', 'nvarchar', 'varchar'], int: ['int', 'integer'], decimal: ['decimal', 'float', 'money', 'number'], boolean: ['boolean', 'bit'], datetime: ['datetime', 'date'], object: ['json'], array: ['json'], 'object-ref': ['json'] };
        const acceptable = bucketMap[derived.coarse] || [];
        if (acceptable.length > 0 && !acceptable.some(a => emittedTypeNorm.includes(a))) {
            typeMismatches.push(`${f.Name}: source=${derived.coarse} vs emitted=${f.Type}`);
        }
    }

    const diverged = missingFields.length > 0 || extraFields.length > 0 || typeMismatches.length > 0
        || !!pkMismatch || !!pathMismatch || writeOpsMissing.length > 0 || fkMisclassified.length > 0
        || !!paginationMismatch || !!watermarkMismatch || !!bodyShapeMismatch;

    if (diverged) {
        if (missingFields.length) histogram.missingFields++;
        if (extraFields.length) histogram.extraFields++;
        if (typeMismatches.length) histogram.typeMismatches++;
        if (fkMisclassified.length) histogram.fkMisclassified++;
        if (writeOpsMissing.length) histogram.writeOpsMissing++;
        if (pkMismatch) histogram.pkMismatch++;
        if (pathMismatch) histogram.pathMismatch++;
        if (paginationMismatch) histogram.paginationMismatch++;
        if (watermarkMismatch) histogram.watermarkMismatch++;
        if (bodyShapeMismatch) histogram.bodyShapeMismatch++;
    }

    perObjectFull.push({
        object: io.fields?.Name,
        derivedKey: obj.key,
        diverged,
        rederivedFieldCount: obj.fieldNames.length,
        emittedFieldCount: ioFields.length,
        missingFields,
        extraFields,
        pkMismatch,
        pathMismatch,
        writeOpsMissing,
        fkMisclassified,
        paginationMismatch,
        watermarkMismatch,
        bodyShapeMismatch,
        typeMismatches,
    });
}

const objectsDivergedCount = perObjectFull.filter(o => o.diverged).length;

// ---------------------------------------------------------------------------
// 10. Write full lossless artifact.
// ---------------------------------------------------------------------------
const fullResult = {
    strategy: 'response-schema-first $ref-chase (GET response -> envelope-chase -> terminal Read schema; write-ops joined by schema-STEM, not path; PK by direct id-property + path-param corroboration; access-path by shortest-reachable-GET)',
    enumeratedCount,
    enumeratedUniverse: [...allSchemaStems].sort(),
    derivedObjectCount: finalObjects.length,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: perObjectFull,
};

writeFileSync(outputPath, JSON.stringify(fullResult, null, 2), 'utf8');

// ---------------------------------------------------------------------------
// 11. Compact stdout summary (the compact-return contract for the caller).
// ---------------------------------------------------------------------------
const actionable = perObjectFull
    .filter(o => o.diverged && (o.missingFields.length > 0 || o.fkMisclassified.length > 0 || o.writeOpsMissing.length > 0 || o.pkMismatch || o.pathMismatch || o.bodyShapeMismatch || o.paginationMismatch || o.watermarkMismatch))
    .slice(0, 40)
    .map(o => ({
        object: o.object,
        diverged: true,
        rederivedFieldCount: o.rederivedFieldCount,
        emittedFieldCount: o.emittedFieldCount,
        missingFields: o.missingFields,
        extraFields: o.extraFields,
        pathMismatch: o.pathMismatch,
        pkMismatch: o.pkMismatch,
        writeOpsMissing: o.writeOpsMissing,
        fkMisclassified: o.fkMisclassified,
        paginationMismatch: o.paginationMismatch,
        watermarkMismatch: o.watermarkMismatch,
        bodyShapeMismatch: o.bodyShapeMismatch,
        typeMismatches: o.typeMismatches,
    }));

const summary = {
    artifact: outputPath,
    strategy: fullResult.strategy,
    enumeratedCount,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: actionable,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
