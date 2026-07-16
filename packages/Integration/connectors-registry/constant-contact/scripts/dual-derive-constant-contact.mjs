#!/usr/bin/env node
// dual-derive-constant-contact.mjs — INDEPENDENT second-parser derivation for constant-contact (P8).
//
// STRATEGY (deliberately DIFFERENT from the extractor's presumed path-first / tag-grouping walk,
// per SOURCES.json's own note that enumerate-taxonomy.mjs is a "bespoke path-by-tag walker"):
//
//   This script is a RESPONSE-SCHEMA-ANCHORED, $REF-CHASED walker:
//     1. It NEVER groups by OpenAPI `tags`. Resource identity is derived by resolving each
//        operation's 2xx/201 response schema through the Swagger `$ref` graph to a concrete
//        `definitions/<Name>` node (chasing wrapper-object -> array-property -> items.$ref one
//        or more hops deep), then normalizing that resolved definition name (stripping
//        Resource/Dto/Response/Page/CreateOrUpdate suffixes) to a canonical resource identity.
//     2. Paths are grouped into "resource families" purely by STATIC path-segment shape (every
//        `{param}` normalized to a positional `{id}` placeholder, and a trailing `/{id}` collapsed
//        into its parent collection path) — never by human-readable tag/path-segment text.
//     3. The full record-type universe is derived TWO ways and both are reported: (a) the shared
//        floor/enumerate-catalog.mjs deterministic definition-count (all Swagger `definitions` that
//        are object-shaped — includes create/update/delete DTO variants), and (b) an independent
//        BFS strictly anchored at RESPONSE schemas only (excludes request-only DTO variants),
//        descending into every nested array-of-$ref / bare-$ref property to also catch embedded
//        sub-resource types (PhoneNumber, StreetAddress, Note, SmsChannelConsentDetails, ...).
//
// The metadata file (the extractor's emission) is read ONLY in the final diff step below — this
// script never reads the extractor's own script, EXTRACTION_REPORT, or matrix.
//
// Usage: node dual-derive-constant-contact.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..'); // MJ/
const VENDOR_DIR = join(__dirname, '..');
const SPEC_PATH = join(VENDOR_DIR, 'sources', 'openapi.json');
const METADATA_PATH = join(REPO_ROOT, 'metadata', 'integrations', 'constant-contact', '.constant-contact.integration.json');
const RUN_DIR = join(VENDOR_DIR, 'runs', 'connector-constant-contact-1783806258859-0be0453e', 'output');
const OUT_ARTIFACT = join(RUN_DIR, 'DUAL_DERIVATION.json');
const ENUMERATOR_SCRIPT = join(REPO_ROOT, 'packages', 'Integration', 'connector-builder-workshop', 'floor', 'enumerate-catalog.mjs');

// ─────────────────────────────────────────────────────────────────────────────
// 0. Load spec
// ─────────────────────────────────────────────────────────────────────────────
const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const definitions = spec.definitions || {};
const paths = spec.paths || {};

function refName(ref) {
    if (!ref || typeof ref !== 'string') return null;
    const m = ref.match(/#\/definitions\/(.+)$/);
    return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Shared deterministic enumerator (floor/enumerate-catalog.mjs) — run it for real, don't
//    reimplement it, so its count is authoritative and reproducible.
// ─────────────────────────────────────────────────────────────────────────────
async function runSharedEnumerator() {
    const mod = await import(ENUMERATOR_SCRIPT);
    // enumerate-catalog.mjs is a CLI script (no named export contract documented) — invoke via
    // child_process to use its own CLI entrypoint faithfully, exactly as `floor-check` would.
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, [ENUMERATOR_SCRIPT, SPEC_PATH], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Independent response-anchored BFS descent (nested record-collections)
// ─────────────────────────────────────────────────────────────────────────────
function collectSchemaRefs(schema, acc) {
    if (!schema || typeof schema !== 'object') return;
    if (schema.$ref) {
        const n = refName(schema.$ref);
        if (n) acc.push(n);
        return;
    }
    if (schema.type === 'array' && schema.items) {
        collectSchemaRefs(schema.items, acc);
        return;
    }
    // inline object with properties: descend into each property (handles inline wrapper shapes
    // that aren't themselves a top-level $ref, e.g. a response schema declared inline).
    if (schema.properties) {
        for (const p of Object.values(schema.properties)) collectSchemaRefs(p, acc);
    }
}

// Wrapper/plumbing definitions that are not themselves distinct "record types" — pagination
// link containers and generic error/status envelopes. Excluded from the response-anchored BFS
// count (but NOT from the shared enumerator's raw definition count above, which is intentionally
// unfiltered).
const PLUMBING_DEF_RE = /^(PagingLinks|Links|Error\w*|.*Links)$/;

function bfsFromResponses() {
    const visited = new Set();
    const queue = [];
    for (const [, methods] of Object.entries(paths)) {
        for (const [method, op] of Object.entries(methods)) {
            if (!op || typeof op !== 'object' || !op.responses) continue;
            for (const [code, resp] of Object.entries(op.responses)) {
                if (!/^(2\d\d)$/.test(code) || !resp.schema) continue;
                collectSchemaRefs(resp.schema, queue);
            }
        }
    }
    while (queue.length) {
        const name = queue.shift();
        if (visited.has(name)) continue;
        visited.add(name);
        const def = definitions[name];
        if (!def || !def.properties) continue;
        for (const prop of Object.values(def.properties)) collectSchemaRefs(prop, queue);
    }
    const recordVisited = [...visited].filter((n) => !PLUMBING_DEF_RE.test(n));
    return { all: [...visited].sort(), recordTypes: recordVisited.sort() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Type mapping (Swagger schema -> our canonical Type string)
// ─────────────────────────────────────────────────────────────────────────────
function mapPropType(prop) {
    if (!prop) return { type: 'string' };
    if (prop.$ref) return { type: 'json' }; // nested single object -> opaque blob (matches emitted convention)
    if (prop.type === 'array') return { type: 'json' };
    if (prop.type === 'object') return { type: 'json' };
    if (prop.type === 'string') {
        if (prop.format === 'uuid') return { type: 'uuid' };
        if (prop.format === 'date-time') return { type: 'datetime' };
        if (prop.format === 'date') return { type: 'date' };
        return { type: 'string', maxLength: prop.maxLength };
    }
    if (prop.type === 'integer') {
        if (prop.format === 'int64') return { type: 'bigint' };
        return { type: 'integer' };
    }
    if (prop.type === 'number') return { type: 'float' };
    if (prop.type === 'boolean') return { type: 'boolean' };
    return { type: 'string' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Resolve a response schema to its "item" definition (chase wrapper -> array -> $ref,
//    handling BOTH named ($ref'd) item types AND inline (unnamed) item object schemas — Swagger
//    2.0 allows array `items` to be an inline object with its own `properties`, no $ref).
// ─────────────────────────────────────────────────────────────────────────────
function derefTop(schema) {
    if (!schema) return null;
    if (schema.$ref) {
        const name = refName(schema.$ref);
        return { name, def: definitions[name] };
    }
    return { name: null, def: schema };
}

// `forItem: true` means this schema comes from a SINGLE-RECORD ("GET one") response — such a
// response IS the record; it must NEVER be unwrapped even if one of its OWN properties happens to
// be an array (e.g. DetailedRegistrationDto.contact / .tickets are legitimate sub-collections
// embedded IN one registration record, not a paginated wrapper AROUND many registrations). Applying
// the collection-wrapper heuristic there was a real bug this script hit (it swallowed the entire
// top-level record and substituted a nested sub-object's shape instead). Only a "GET many"
// (collection) response schema gets the wrapper-unwrap treatment.
function resolveResponseItemDef(schema, forItem = false) {
    const top = derefTop(schema);
    if (!top || !top.def) return null;
    const { def, name } = top;

    // Case A: the definition itself IS a bare array (e.g. `AccountEmails: {type:array, items:{...}}`).
    // This can only be a genuine collection response, never a single-item one.
    if (!forItem && def.type === 'array' && def.items) {
        const itemsResolved = def.items.$ref ? derefTop(def.items) : { name: null, def: def.items };
        if (itemsResolved?.def?.properties) return { name: itemsResolved.name, def: itemsResolved.def, wrapperName: name };
        return null;
    }

    // Case B (collection responses only): a wrapper object with one array-of-record property,
    // where the array items may be a named $ref OR an inline object schema.
    if (!forItem && def.properties) {
        for (const [key, prop] of Object.entries(def.properties)) {
            if (prop.type !== 'array' || !prop.items || /^_?links$/i.test(key)) continue;
            const itemsResolved = prop.items.$ref ? derefTop(prop.items) : (prop.items.properties ? { name: null, def: prop.items } : null);
            if (itemsResolved?.def?.properties) {
                return { name: itemsResolved.name, def: itemsResolved.def, wrapperName: name, arrayProp: key };
            }
        }
    }

    // Case C: the definition itself is the item — a direct single-record response
    // (`/contacts/{contact_id}` -> ContactResource, or any `forItem` call).
    if (def.properties) return { name, def };
    return null;
}

function canonicalizeDefName(name) {
    if (!name) return null;
    return name.replace(/(Resource|Response|Dto|DTO|Page|CreateOrUpdate.*|PostRequest|PutRequest|Input)$/i, '') || name;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Path normalization + resource-family grouping
// ─────────────────────────────────────────────────────────────────────────────
function normalizePath(p) {
    return p.replace(/\{[^}]+\}/g, '{id}');
}
function familyKeyForPath(p) {
    const norm = normalizePath(p);
    // collapse a trailing "/{id}" into its parent collection path
    return norm.replace(/\/\{id\}$/, '');
}

const families = new Map(); // familyKey -> { paths: Set, ops: [{path, method, op}] }
for (const [p, methods] of Object.entries(paths)) {
    const fk = familyKeyForPath(p);
    if (!families.has(fk)) families.set(fk, { paths: new Set(), ops: [] });
    const fam = families.get(fk);
    fam.paths.add(p);
    for (const [method, op] of Object.entries(methods)) {
        if (!op || typeof op !== 'object' || !op.tags) continue; // skip non-operation keys like "parameters"
        fam.ops.push({ path: p, method: method.toUpperCase(), op });
    }
}

// Out-of-scope tags (partner-only surface — not part of the standard sync taxonomy; matches
// SOURCES.json's "9 out-of-scope leaves" bucket derived independently by tag name).
const OUT_OF_SCOPE_TAGS = new Set(['Technology Partners', 'Technology Partners Webhooks']);
function familyIsOutOfScope(fam) {
    return fam.ops.length > 0 && fam.ops.every((o) => (o.op.tags || []).every((t) => OUT_OF_SCOPE_TAGS.has(t)));
}

// For each family, resolve its GET operation's response to determine field set + resource name.
function analyzeFamily(fk, fam) {
    const getOps = fam.ops.filter((o) => o.method === 'GET');
    // Prefer the single-item GET (fk + "/{id}") over the collection GET when BOTH exist: some
    // vendor APIs (e.g. Events registrations) expose a "Lite" summary shape on the list endpoint
    // and a fuller "Detailed" shape on the single-record endpoint — the fuller shape is the
    // canonical per-row field set a sync engine should hydrate. Falls back to the collection GET,
    // then any GET, when there is no dedicated item endpoint.
    const itemGetOp = getOps.find((o) => normalizePath(o.path) === fk + '/{id}');
    let chosenGet = itemGetOp || getOps.find((o) => o.path === fk) || getOps[0];
    let resolvedItem = null;
    let responseDataKey = null;
    if (chosenGet) {
        const resp = chosenGet.op.responses?.['200'] || chosenGet.op.responses?.['202'];
        if (resp && resp.schema) {
            resolvedItem = resolveResponseItemDef(resp.schema, chosenGet === itemGetOp);
            if (resolvedItem?.arrayProp) responseDataKey = resolvedItem.arrayProp;
        }
    }
    // No GET on this family at all (async "trigger an activity"-style POST-only endpoints):
    // the readable shape is the POST/PUT's own success response (job/activity-status object) —
    // always treated as a single-record ("forItem") shape, never unwrapped.
    if (!resolvedItem) {
        const writeOpForShape = fam.ops.find((o) => o.method === 'POST') || fam.ops.find((o) => o.method === 'PUT' || o.method === 'PATCH');
        if (writeOpForShape) {
            const code = Object.keys(writeOpForShape.op.responses || {}).find((c) => /^2/.test(c));
            const resp = writeOpForShape.op.responses?.[code];
            if (resp?.schema) resolvedItem = resolveResponseItemDef(resp.schema, true);
        }
    }

    const fieldMap = new Map(); // fieldName -> {type, maxLength, readOnly, sourceProp}
    if (resolvedItem?.def?.properties) {
        for (const [name, prop] of Object.entries(resolvedItem.def.properties)) {
            const mapped = mapPropType(prop);
            fieldMap.set(name, { ...mapped, readOnly: !!prop.readOnly, format: prop.format, rawProp: prop });
        }
    }

    // PK candidates: CONSERVATIVE, Tier-1-only signal — a field only qualifies as a PK candidate
    // when it is the trailing `{param}` of a genuine "GET one record of THIS family" item-path
    // (fk + '/{id}'). A path param that appears MID-path (e.g. `{contact_id}` scoping a nested
    // report/tracking collection, or `{campaign_activity_id}` scoping a per-campaign tracking list)
    // identifies the PARENT, not a row of THIS collection, and must NOT be treated as this
    // family's PK — that was the false-positive class this script hit on its first pass (19
    // report/tracking/social objects wrongly flagged as PK-divergent; naming-convention-only,
    // below the plan's significance bar for a structural claim).
    const pathParamNames = new Set();
    for (const p of fam.paths) {
        for (const m of p.matchAll(/\{([^}]+)\}/g)) pathParamNames.add(m[1]);
    }
    let itemPathParamName = null;
    const itemGetPath = getOps.find((o) => normalizePath(o.path) === fk + '/{id}')?.path;
    if (itemGetPath) {
        const m = itemGetPath.match(/\{([^}]+)\}$/);
        if (m) itemPathParamName = m[1];
    }
    const pkCandidates = [];
    if (itemPathParamName && fieldMap.has(itemPathParamName)) pkCandidates.push(itemPathParamName);

    // Write ops
    const createOp = fam.ops.find((o) => o.method === 'POST' && normalizePath(o.path) === fk);
    const updateOp = fam.ops.find((o) => (o.method === 'PUT' || o.method === 'PATCH'));
    const deleteOp = fam.ops.find((o) => o.method === 'DELETE');

    function analyzeWriteOp(writeOp) {
        if (!writeOp) return null;
        const bodyParam = (writeOp.op.parameters || []).find((p) => p.in === 'body');
        let bodyShape = 'flat';
        let bodyKey = null;
        if (bodyParam?.schema) {
            const resolved = resolveResponseItemDef(bodyParam.schema);
            // wrapped iff the top-level request schema's properties are NOT the resource's own
            // fields but instead a single object/array property wrapping them
            const topDef = bodyParam.schema.$ref ? definitions[refName(bodyParam.schema.$ref)] : bodyParam.schema;
            if (topDef?.properties) {
                const propNames = Object.keys(topDef.properties);
                const overlapsResourceFields = propNames.some((n) => fieldMap.has(n));
                // "wrapped" means the body is `{ outerKey: { ...resource-shaped fields } }` — a
                // single top-level property whose VALUE is itself an object mirroring the resource.
                // A single top-level property holding an ARRAY OF SCALARS (e.g. `{tag_ids:[...]}`,
                // `{order_ticket_keys:[...]}` on action/trigger endpoints) is still a FLAT body —
                // there is no extra object layer to unwrap. Conflating the two was a real bug this
                // script hit on every bulk-activity trigger endpoint.
                if (!overlapsResourceFields && propNames.length === 1) {
                    const soleProp = topDef.properties[propNames[0]];
                    const valueIsObject = soleProp?.$ref || soleProp?.type === 'object' ||
                        (soleProp?.type === 'array' && (soleProp.items?.$ref || soleProp.items?.type === 'object'));
                    if (valueIsObject) {
                        bodyShape = 'wrapped';
                        bodyKey = propNames[0];
                    }
                }
            }
        }
        const successCode = Object.keys(writeOp.op.responses || {}).find((c) => /^2/.test(c));
        const successResp = writeOp.op.responses?.[successCode];
        let idLocation = 'body';
        if (successResp?.headers && Object.keys(successResp.headers).some((h) => /location/i.test(h))) idLocation = 'header';
        else if (pathParamNames.size > 0 && normalizePath(writeOp.path).includes('{id}') === false && writeOp.method !== 'POST') idLocation = 'path';
        else if (writeOp.method !== 'POST') idLocation = 'path';
        return { path: writeOp.path, method: writeOp.method, bodyShape, bodyKey, idLocation };
    }

    // Pagination + watermark from the COLLECTION GET's query params specifically (an item-GET has
    // no pagination params by definition, so this must NOT reuse chosenGet if that resolved to the
    // item endpoint above).
    const collectionGet = getOps.find((o) => o.path === fk) || chosenGet;
    let paginationType = 'None';
    let watermarkField = null;
    if (collectionGet) {
        const queryParams = (collectionGet.op.parameters || []).filter((p) => p.in === 'query');
        const hasCursorParam = queryParams.some((p) => /^(next|cursor)$/i.test(p.name));
        const hasLimit = queryParams.some((p) => /^limit$/i.test(p.name));
        const hasOffset = queryParams.some((p) => /^offset$/i.test(p.name));
        const hasPageNum = queryParams.some((p) => /^(page|page_number)$/i.test(p.name));
        if (hasOffset) paginationType = 'Offset';
        else if (hasPageNum) paginationType = 'PageNumber';
        else if (hasCursorParam || hasLimit) paginationType = 'Cursor';
        const afterParam = queryParams.find((p) => /_after$|^after_date$|^since$/i.test(p.name));
        if (afterParam) watermarkField = afterParam.name;
    }

    return {
        familyKey: fk,
        paths: [...fam.paths],
        tags: [...new Set(fam.ops.flatMap((o) => o.op.tags || []))],
        resolvedDefName: resolvedItem?.name || null,
        canonicalName: canonicalizeDefName(resolvedItem?.name) || null,
        responseDataKey,
        fieldMap,
        pkCandidates,
        createOp: analyzeWriteOp(createOp),
        updateOp: analyzeWriteOp(updateOp),
        deleteOp: deleteOp ? { path: deleteOp.path, method: deleteOp.method } : null,
        paginationType,
        watermarkField,
        outOfScope: familyIsOutOfScope(fam),
    };
}

const analyzedFamilies = new Map();
for (const [fk, fam] of families.entries()) {
    analyzedFamilies.set(fk, analyzeFamily(fk, fam));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Load emitted metadata (the ONLY place this script reads the extractor's output)
// ─────────────────────────────────────────────────────────────────────────────
const metadataRaw = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
const root = metadataRaw[0];
const emittedIOs = root.relatedEntities['MJ: Integration Objects'];

function findFamilyByPath(p) {
    const fk = familyKeyForPath(p);
    if (analyzedFamilies.has(fk)) return analyzedFamilies.get(fk);
    // also try exact normalized match without trailing collapse (some declared APIPaths ARE
    // the item path with a literal static segment, e.g. /contacts/sms_engagement_history/{contact_id})
    const norm = normalizePath(p);
    for (const fam of analyzedFamilies.values()) {
        if (fam.paths.some((fp) => normalizePath(fp) === norm)) return fam;
    }
    return null;
}

// Returns the PRIMARY family (for field/PK/pagination comparison — keyed off the declared
// read APIPath) plus the FULL set of families touched by this IO's declared paths (so an
// action-style write endpoint living in its own separate path family, e.g. an async-export
// POST or a `/{id}/name` sub-path PATCH, is still credited as "matched" and not misreported
// as a missing object).
function findFamilyForIO(io) {
    return findFamilyByPath(io.fields.APIPath) || findFamilyByPath(io.fields.CreateAPIPath) ||
        findFamilyByPath(io.fields.UpdateAPIPath) || findFamilyByPath(io.fields.DeleteAPIPath);
}
function findAllFamiliesForIO(io) {
    const out = new Set();
    for (const p of [io.fields.APIPath, io.fields.CreateAPIPath, io.fields.UpdateAPIPath, io.fields.DeleteAPIPath].filter(Boolean)) {
        const fam = findFamilyByPath(p);
        if (fam) out.add(fam.familyKey);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Object-set divergence (the "11-of-1,694" primary check)
// ─────────────────────────────────────────────────────────────────────────────
const inScopeFamilyKeys = [...analyzedFamilies.entries()].filter(([, f]) => !f.outOfScope && f.tags.length > 0).map(([fk]) => fk);
const matchedFamilyKeys = new Set();
const objectsMissing = [];
const objectsExtra = [];

const perObjectResults = [];

for (const io of emittedIOs) {
    const fam = findFamilyForIO(io);
    if (!fam) {
        objectsExtra.push(io.fields.Name);
        continue;
    }
    for (const fk of findAllFamiliesForIO(io)) matchedFamilyKeys.add(fk);

    const emittedFields = (io.relatedEntities['MJ: Integration Object Fields'] || []).map((f) => f.fields);
    const emittedFieldNames = new Set(emittedFields.map((f) => f.Name));
    const rederivedFieldNames = new Set(fam.fieldMap.keys());

    const missingFields = [...rederivedFieldNames].filter((n) => !emittedFieldNames.has(n));
    const extraFields = [...emittedFieldNames].filter((n) => !rederivedFieldNames.has(n));

    // path mismatch
    let pathMismatch;
    const normEmittedAPIPath = normalizePath(io.fields.APIPath || '');
    const normFamilyPaths = fam.paths.map(normalizePath);
    if (io.fields.APIPath && !normFamilyPaths.includes(normEmittedAPIPath)) {
        pathMismatch = `emitted APIPath='${io.fields.APIPath}' not among re-derived family paths [${fam.paths.join(', ')}]`;
    }

    // PK mismatch
    const emittedPKFields = emittedFields.filter((f) => f.IsPrimaryKey).map((f) => f.Name);
    let pkMismatch;
    if (fam.pkCandidates.length > 0) {
        const missing = fam.pkCandidates.filter((n) => !emittedPKFields.includes(n));
        const extra = emittedPKFields.filter((n) => !fam.pkCandidates.includes(n));
        if (missing.length || extra.length) {
            pkMismatch = `re-derived PK candidates=[${fam.pkCandidates.join(',')}] vs emitted=[${emittedPKFields.join(',')}]`;
        }
    }

    // Write ops missing
    const writeOpsMissing = [];
    if (fam.createOp && !io.fields.SupportsCreate) writeOpsMissing.push('Create');
    if (fam.updateOp && !io.fields.SupportsUpdate) writeOpsMissing.push('Update');
    if (fam.deleteOp && !io.fields.SupportsDelete) writeOpsMissing.push('Delete');

    // FK misclassification
    const fkMisclassified = [];
    for (const f of emittedFields) {
        if (f.IsForeignKey) {
            const srcProp = fam.fieldMap.get(f.Name)?.rawProp;
            const isScalarRef = srcProp && !srcProp.$ref && srcProp.type !== 'array' && srcProp.type !== 'object';
            if (!isScalarRef) fkMisclassified.push(f.Name);
        }
    }

    // Pagination mismatch
    let paginationMismatch;
    if (fam.paginationType !== 'None' && io.fields.PaginationType !== fam.paginationType) {
        paginationMismatch = `re-derived='${fam.paginationType}' vs emitted='${io.fields.PaginationType}'`;
    }

    // Watermark mismatch
    let watermarkMismatch;
    if (fam.watermarkField && io.fields.IncrementalWatermarkField !== fam.watermarkField) {
        watermarkMismatch = `re-derived='${fam.watermarkField}' vs emitted='${io.fields.IncrementalWatermarkField || 'none'}'`;
    }

    // Body shape mismatch
    let bodyShapeMismatch;
    if (fam.createOp && io.fields.CreateBodyShape && fam.createOp.bodyShape !== io.fields.CreateBodyShape) {
        bodyShapeMismatch = `Create: re-derived='${fam.createOp.bodyShape}' vs emitted='${io.fields.CreateBodyShape}'`;
    }

    // Type mismatches
    const typeMismatches = [];
    for (const f of emittedFields) {
        const rd = fam.fieldMap.get(f.Name);
        if (rd && rd.type && f.Type && rd.type !== f.Type) {
            typeMismatches.push(`${f.Name}: re-derived='${rd.type}' vs emitted='${f.Type}'`);
        }
    }

    const diverged = !!(missingFields.length || extraFields.length || pathMismatch || pkMismatch ||
        writeOpsMissing.length || fkMisclassified.length || paginationMismatch || watermarkMismatch ||
        bodyShapeMismatch || typeMismatches.length);

    perObjectResults.push({
        object: io.fields.Name,
        diverged,
        rederivedFieldCount: rederivedFieldNames.size,
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

// families that are in-scope but never matched by any emitted IO -> objectsMissing
for (const fk of inScopeFamilyKeys) {
    if (!matchedFamilyKeys.has(fk)) {
        const fam = analyzedFamilies.get(fk);
        objectsMissing.push(`${fk} (tags=${fam.tags.join('/')}, resolvedDef=${fam.resolvedDefName || 'n/a'})`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Assemble output
// ─────────────────────────────────────────────────────────────────────────────
const sharedEnum = await runSharedEnumerator();
const responseBfs = bfsFromResponses();

const objectsDivergedCount = perObjectResults.filter((r) => r.diverged).length;
const divergenceHistogram = {
    missingFields: perObjectResults.filter((r) => r.missingFields.length).length,
    extraFields: perObjectResults.filter((r) => r.extraFields.length).length,
    typeMismatches: perObjectResults.filter((r) => r.typeMismatches.length).length,
    fkMisclassified: perObjectResults.filter((r) => r.fkMisclassified.length).length,
    writeOpsMissing: perObjectResults.filter((r) => r.writeOpsMissing.length).length,
    pkMismatch: perObjectResults.filter((r) => r.pkMismatch).length,
    pathMismatch: perObjectResults.filter((r) => r.pathMismatch).length,
    paginationMismatch: perObjectResults.filter((r) => r.paginationMismatch).length,
    watermarkMismatch: perObjectResults.filter((r) => r.watermarkMismatch).length,
    bodyShapeMismatch: perObjectResults.filter((r) => r.bodyShapeMismatch).length,
};

const fullOutput = {
    strategy: 'response-schema-anchored $ref-chased resource-family walk (path-shape grouping, NOT tag-grouping); ' +
        'PK/FK/pagination/watermark/body-shape all re-derived independently from Swagger operation+schema graph.',
    enumeratedCount: sharedEnum.count,
    enumeratedCountNote: `shared floor/enumerate-catalog.mjs raw Swagger-definitions count (includes create/update/delete DTO ` +
        `variants). Independent response-anchored BFS descent (this script, excludes request-only DTO variants, includes ` +
        `nested sub-resource types) reached ${responseBfs.recordTypes.length} record-bearing definitions ` +
        `(${responseBfs.all.length} incl. plumbing) — a strict subset, as expected since request-only *PostRequest/*PutRequest ` +
        `variants are unreachable from any response.`,
    responseAnchoredBFS: responseBfs,
    sharedEnumeratorRecordTypes: sharedEnum.recordTypes,
    familyCount: analyzedFamilies.size,
    inScopeFamilyCount: inScopeFamilyKeys.length,
    outOfScopeFamilies: [...analyzedFamilies.entries()].filter(([, f]) => f.outOfScope).map(([fk]) => fk),
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram,
    perObject: perObjectResults.map((r) => ({ ...r, fieldMap: undefined })),
};

mkdirSync(RUN_DIR, { recursive: true });
// strip non-serializable Map from fieldMap references leaking via closures (defensive)
writeFileSync(OUT_ARTIFACT, JSON.stringify(fullOutput, (k, v) => (v instanceof Map ? undefined : v), 2));

// ─────────────────────────────────────────────────────────────────────────────
// 9. Compact, actionable-only stdout summary
// ─────────────────────────────────────────────────────────────────────────────
const ACTIONABLE_KEYS = ['missingFields', 'fkMisclassified', 'writeOpsMissing', 'pkMismatch', 'pathMismatch', 'bodyShapeMismatch', 'paginationMismatch', 'watermarkMismatch'];
function isActionable(r) {
    return ACTIONABLE_KEYS.some((k) => {
        const v = r[k];
        return Array.isArray(v) ? v.length > 0 : !!v;
    });
}
const cappedPerObject = perObjectResults.filter(isActionable).slice(0, 40).map((r) => ({
    object: r.object,
    diverged: r.diverged,
    rederivedFieldCount: r.rederivedFieldCount,
    emittedFieldCount: r.emittedFieldCount,
    missingFields: r.missingFields,
    extraFields: r.extraFields,
    pathMismatch: r.pathMismatch,
    pkMismatch: r.pkMismatch,
    writeOpsMissing: r.writeOpsMissing,
    fkMisclassified: r.fkMisclassified,
    paginationMismatch: r.paginationMismatch,
    watermarkMismatch: r.watermarkMismatch,
    bodyShapeMismatch: r.bodyShapeMismatch,
    typeMismatches: r.typeMismatches,
}));

const summary = {
    artifact: OUT_ARTIFACT,
    strategy: fullOutput.strategy,
    enumeratedCount: fullOutput.enumeratedCount,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram,
    perObject: cappedPerObject,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
