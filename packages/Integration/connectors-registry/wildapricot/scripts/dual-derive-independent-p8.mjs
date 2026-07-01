#!/usr/bin/env node
// dual-derive-wildapricot.mjs — INDEPENDENT second-parser derivation for the WildApricot connector.
//
// STRATEGY (deliberately different from a naive path-first walk):
//   SCHEMA-FIRST with full $ref-chain resolution, THEN a REVERSE INDEX from
//   response-body schema references back to the paths that return them.
//
//   1. Load components.schemas. For every schema, recursively resolve $ref and
//      allOf composition into a single FLATTENED property map (name -> {type, ref}).
//      This is the opposite of a path-first walk, which would read paths in
//      declaration order and inline whatever schema each path happens to reference
//      without first building a canonical, de-duplicated property registry.
//   2. Build a REVERSE INDEX: for every path+method, resolve the 2xx response
//      schema down to its underlying "item" schema (unwrapping array-of-ref and
//      object-wrapper-with-single-array-of-ref shapes), and record which
//      (path, method) pairs are associated with which canonical entity schema.
//   3. For each canonical entity schema with a GET-list association, derive:
//        - APIPath (the list-returning GET path, collection form preferred over
//          the single-item form),
//        - field set (from the flattened property map),
//        - PK candidate(s) (property named "Id" AND referenced as a path param
//          in the corresponding GET-single path, OR flagged 'readOnly' + name
//          ending in "Id"),
//        - write ops (POST/PUT/DELETE on the same path family, matched by
//          request-body schema NAME AFFINITY -- stripping Create/Edit/Update/
//          Params/Post/Put suffixes and comparing to the entity schema name --
//          NOT by walking the same path object CodeGen-style),
//        - pagination params actually declared on the GET-list operation
//          ($skip/$top or otherwise),
//        - incremental filter param existence ($filter, StartDate/EndDate, etc).
//   4. Independently enumerate the COMPLETE record-type universe via
//      enumerate-catalog.mjs over BOTH pinned OpenAPI specs (admin + public-access).
//   5. Diff re-derived per-object facts against the emitted metadata file.
//
// Output: JSON to stdout with a SUMMARY only; full per-object array written to
// the DUAL_DERIVATION.json artifact path given as argv[2].

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SOURCES_DIR = path.join(REPO_ROOT, 'packages/Integration/connectors-registry/wild-apricot/sources');
const ADMIN_SPEC_PATH = path.join(SOURCES_DIR, 'openapi.admin.9.14.0.json');
const PUBLIC_SPEC_PATH = path.join(SOURCES_DIR, 'openapi.public-access.9.08.0.yaml');
const METADATA_PATH = path.join(REPO_ROOT, 'metadata/integrations/wildapricot/.wildapricot.integration.json');
const ENUMERATE_SCRIPT = path.join(REPO_ROOT, 'packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs');
const OUTPUT_PATH = process.argv[2] || path.join(
    REPO_ROOT,
    'packages/Integration/connectors-registry/wildapricot/runs/connector-wildapricot-1782844331649-0a8d294b/output/DUAL_DERIVATION.json'
);

// ─────────────────────────────────────────────────────────────────────────
// 1. Load + minimal YAML handling for the public-access spec (best-effort;
//    only used for object-set cross-check, not primary field derivation —
//    the admin spec is JSON and is the primary source for per-object facts
//    since ALL emitted IOs in metadata map to the ADMIN api base URL).
// ─────────────────────────────────────────────────────────────────────────
function loadJSON(p) {
    return JSON.parse(readFileSync(p, 'utf8'));
}

const adminSpec = loadJSON(ADMIN_SPEC_PATH);

// ─────────────────────────────────────────────────────────────────────────
// 2. $ref resolution + flattening (schema-first pass)
// ─────────────────────────────────────────────────────────────────────────
const schemas = adminSpec.components?.schemas ?? {};
const parameters = adminSpec.components?.parameters ?? {};
const responses = adminSpec.components?.responses ?? {};

function resolveRef(ref) {
    // "#/components/schemas/Foo" -> schemas.Foo
    const parts = ref.replace(/^#\//, '').split('/');
    let node = adminSpec;
    for (const p of parts) node = node?.[p];
    return node;
}

function refName(ref) {
    return ref.split('/').pop();
}

// Flatten a schema node (following $ref + allOf) into { properties: Map<name,{type,ref,readOnly}>, required:Set }
function flattenSchema(nodeOrRef, seen = new Set()) {
    let node = nodeOrRef;
    let refChain = [];
    while (node && node.$ref) {
        const rn = refName(node.$ref);
        if (seen.has(rn)) break; // cycle guard
        seen.add(rn);
        refChain.push(rn);
        node = resolveRef(node.$ref);
    }
    const properties = new Map();
    const required = new Set();
    if (!node) return { properties, required, refChain };

    if (Array.isArray(node.allOf)) {
        for (const sub of node.allOf) {
            const flat = flattenSchema(sub, seen);
            for (const [k, v] of flat.properties) properties.set(k, v);
            for (const r of flat.required) required.add(r);
        }
    }
    if (node.properties) {
        for (const [pname, pschema] of Object.entries(node.properties)) {
            let type = pschema.type;
            let itemRef = null;
            let ref = pschema.$ref ? refName(pschema.$ref) : null;
            if (pschema.type === 'array' && pschema.items) {
                itemRef = pschema.items.$ref ? refName(pschema.items.$ref) : null;
                type = 'array';
            }
            properties.set(pname, {
                type: type ?? (ref ? 'object' : pschema.enum ? 'enum' : 'unknown'),
                ref,
                itemRef,
                format: pschema.format,
                maxLength: pschema.maxLength,
                readOnly: !!pschema.readOnly,
                nullable: !!pschema.nullable,
                enum: pschema.enum ?? null,
            });
        }
    }
    if (Array.isArray(node.required)) {
        for (const r of node.required) required.add(r);
    }
    return { properties, required, refChain };
}

// Build the full flattened registry for every schema
const flatRegistry = new Map();
for (const name of Object.keys(schemas)) {
    flatRegistry.set(name, flattenSchema({ $ref: `#/components/schemas/${name}` }));
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Reverse index: response schema -> [{path, method}]
//    Also record request-body schema -> [{path, method}] for write-op matching.
// ─────────────────────────────────────────────────────────────────────────
const paths = adminSpec.paths ?? {};

// Unwrap a response schema to find the underlying "item" entity schema name,
// and whether this operation returns a LIST (array) or a SINGLE item.
function unwrapResponseSchema(schemaNode) {
    if (!schemaNode) return null;
    if (schemaNode.type === 'array' && schemaNode.items) {
        if (schemaNode.items.$ref) return { entity: refName(schemaNode.items.$ref), isList: true, wrapper: null };
    }
    if (schemaNode.$ref) {
        const rn = refName(schemaNode.$ref);
        // Case A: the ref itself resolves to a bare `type: array, items: $ref` schema
        // (e.g. EventRegistrationsResponse = array of EventRegistration). Must check
        // the RAW resolved node (not the flattened property map, which only models
        // object-shaped schemas) before falling through to the object-wrapper case.
        const rawResolved = resolveRef(schemaNode.$ref);
        if (rawResolved && rawResolved.type === 'array' && rawResolved.items?.$ref) {
            return { entity: refName(rawResolved.items.$ref), isList: true, wrapper: rn };
        }
        // Case B: object wrapper (incl. WildApricot's allOf-of-many-shapes "union"
        // pattern e.g. ContactsResponse = allOf[AsyncResponse, IdsResponse,
        // CountResponse, ListResponse]) carrying EXACTLY ONE array-of-ref property
        // among its (possibly many, allOf-merged) properties. GATED on the
        // wrapper's own schema NAME following WildApricot's consistent
        // *Response/*Result/*List naming convention (ContactsListResponse,
        // ContactsResponse, EventRegistrationsResponse, AuditItemsListResult,
        // EmailDraftListResult, ...) -- WITHOUT this gate, a genuine rich entity
        // that merely happens to have exactly one nested array property (e.g.
        // "Contact" has exactly one array prop, FieldValues: ContactFieldValue[])
        // would be wrongly unwrapped to its nested item type instead of being
        // treated as the entity itself.
        const WRAPPER_NAME_RE = /(Response|Result|ListResult|ListResponse|Records|List)$/;
        const flat = flatRegistry.get(rn);
        if (WRAPPER_NAME_RE.test(rn) && flat && flat.properties.size >= 1) {
            const arrayProps = [...flat.properties.entries()].filter(([, v]) => v.type === 'array' && v.itemRef);
            if (arrayProps.length === 1) {
                return { entity: arrayProps[0][1].itemRef, isList: true, wrapper: rn };
            }
        }
        return { entity: rn, isList: false, wrapper: null };
    }
    return null;
}

// responseIndex: entity name -> array of { path, method, isList, statusCode }
const responseIndex = new Map();
// requestBodyIndex: entity name (of request schema) -> array of {path, method, schemaName}
const requestBodyIndex = new Map();

function pushIndex(map, key, val) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(val);
}

const WRITE_METHODS = new Set(['post', 'put', 'delete', 'patch']);
const READ_METHODS = new Set(['get']);

// SPEC DEFECT WORKAROUND: the admin spec has at least one path item
// (/accounts/{accountId}/donations) where "responses" is a STRAY SIBLING key
// of "get"/"post" at the path-item level, instead of nested inside "get".
// This is a genuine vendor OpenAPI authoring defect (both an ideal extractor
// and this independent derivation must special-case it or silently lose the
// GET-list association). Recorded here as a distinct signal, not folded
// silently into the normal walk.
const specDefects = [];
for (const [p, ops] of Object.entries(paths)) {
    if (ops.responses && ops.get && !ops.get.responses) {
        specDefects.push({ path: p, issue: 'responses key is a sibling of get/post instead of nested under get', appliedFallback: true });
        ops.get.responses = ops.responses;
    }
}

for (const [p, ops] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(ops)) {
        if (!READ_METHODS.has(method) && !WRITE_METHODS.has(method)) continue;
        if (typeof op !== 'object' || Array.isArray(op) || !op) continue;
        // responses
        const okResp = op.responses?.['200'] ?? op.responses?.['201'];
        let respSchema = null;
        if (okResp?.content) {
            const content = okResp.content['application/json'] ?? Object.values(okResp.content)[0];
            respSchema = content?.schema ?? null;
        } else if (okResp?.$ref) {
            const resolved = resolveRef(okResp.$ref);
            const content = resolved?.content?.['application/json'];
            respSchema = content?.schema ?? null;
        }
        if (respSchema && READ_METHODS.has(method)) {
            const unwrapped = unwrapResponseSchema(respSchema);
            if (unwrapped?.entity) {
                pushIndex(responseIndex, unwrapped.entity, { path: p, method, isList: unwrapped.isList });
            }
        }
        // request bodies (write ops)
        if (WRITE_METHODS.has(method) && op.requestBody?.content) {
            const content = op.requestBody.content['application/json'] ?? Object.values(op.requestBody.content)[0];
            const rbSchema = content?.schema;
            if (rbSchema?.$ref) {
                const rn = refName(rbSchema.$ref);
                pushIndex(requestBodyIndex, rn, { path: p, method, schemaName: rn });
            }
        }
        // also index write ops with NO body (DELETE) directly by path pattern
        if (method === 'delete') {
            pushIndex(requestBodyIndex, `__DELETE__${p}`, { path: p, method, schemaName: null });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. Name-affinity matcher: strip Create/Update/Edit/Params/Post/Put/List/
//    Response suffixes/prefixes to associate a request-body schema with its
//    canonical entity schema. This is the DISTINCT heuristic vs. a path-first
//    walk which would just look at what path the write op is under.
// ─────────────────────────────────────────────────────────────────────────
const WRITE_SCHEMA_PREFIX_RE = /^(Create|Edit|Update|Mutable)/i;
const WRITE_SCHEMA_SUFFIX_RE = /(EditParams|CreateParams|UpdateParams|Params|EditModel|CreateModel|UpdateModel|Model|EditItem|Post|Put)$/i;

function canonicalize(name) {
    return name.replace(WRITE_SCHEMA_PREFIX_RE, '').replace(WRITE_SCHEMA_SUFFIX_RE, '').toLowerCase();
}

// A "bare" entity name carries NEITHER a write-op prefix NOR suffix -- this is the
// canonical response-side entity schema (e.g. "Payment"), as opposed to a
// request-only DTO ("CreatePaymentModel", "UpdatePaymentParams").
function isBareEntityName(name) {
    return !WRITE_SCHEMA_PREFIX_RE.test(name) && !WRITE_SCHEMA_SUFFIX_RE.test(name);
}

const entityNames = [...flatRegistry.keys()];
const canonicalToEntity = new Map();
for (const n of entityNames) {
    const c = canonicalize(n);
    if (!canonicalToEntity.has(c)) canonicalToEntity.set(c, []);
    canonicalToEntity.get(c).push(n);
}

function findEntityForRequestSchema(schemaName) {
    const c = canonicalize(schemaName);
    const matches = canonicalToEntity.get(c);
    if (matches && matches.length >= 1) {
        // Prefer the BARE response-side entity schema over any write-DTO sibling
        // that happens to share the same canonical bucket (e.g. prefer "Payment"
        // over "CreatePaymentModel"/"UpdatePaymentParams"). If the bucket contains
        // NO bare entity at all (every member is itself a write-DTO, e.g. the
        // "contactfield" bucket = {CreateContactFieldParams, EditContactFieldParams,
        // UpdateContactFieldParams}), fall through to the substring-containment
        // fallback below rather than wrongly returning a non-bare DTO name.
        const bare = matches.filter(isBareEntityName);
        if (bare.length >= 1) return bare[0];
    }
    // Fallback: substring-containment match against bare entity names. Handles
    // cases where the entity's response schema carries an additional descriptive
    // suffix the write-DTO's name doesn't repeat (e.g. write DTOs
    // "CreateContactFieldParams"/"EditContactFieldParams" canonicalize to
    // "contactfield", while the actual response entity is
    // "ContactFieldDescription" -- a strict canonical-bucket match misses it,
    // but "contactfield" is a prefix of "contactfielddescription").
    const bareCandidates = entityNames.filter(isBareEntityName);
    // Prefer the direction where the ENTITY name extends the write-DTO's stripped
    // name (entity = DTO-stem + descriptive suffix, e.g. "contactfield" ->
    // "contactfielddescription") over the reverse (DTO-stem extends a shorter
    // entity name, e.g. "contactfield" would also match bare "contact" -- wrong).
    const forwardMatches = bareCandidates.filter((n) => canonicalize(n).startsWith(c) && canonicalize(n) !== c);
    if (forwardMatches.length >= 1) {
        // Prefer a candidate that is itself independently known to be
        // GET-list-reachable (present in our own responseIndex, built in step 3
        // from the reverse-index walk) -- this is still a self-derived signal,
        // not a read of the metadata file, but it disambiguates families like
        // {ContactFieldValue, ContactFieldAccessLevel, ContactFieldDescription}
        // where plain string length is not a reliable tie-break.
        const listReachable = forwardMatches.filter((n) => responseIndex.has(n) && responseIndex.get(n).some((o) => o.isList));
        const pool = listReachable.length >= 1 ? listReachable : forwardMatches;
        pool.sort((a, b) => a.length - b.length);
        return pool[0];
    }
    const exactMatches = bareCandidates.filter((n) => canonicalize(n) === c);
    if (exactMatches.length >= 1) return exactMatches[0];
    const reverseMatches = bareCandidates.filter((n) => c.startsWith(canonicalize(n)));
    if (reverseMatches.length >= 1) {
        reverseMatches.sort((a, b) => b.length - a.length); // longest reverse match = closest fit
        return reverseMatches[0];
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 5. Enumerate the COMPLETE record-type universe via the shared enumerator,
//    over BOTH pinned specs (admin JSON + public-access YAML).
// ─────────────────────────────────────────────────────────────────────────
function runEnumerator(sourcePath) {
    try {
        const out = execFileSync('node', [ENUMERATE_SCRIPT, sourcePath], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        return JSON.parse(out);
    } catch (e) {
        return { error: String(e && e.message || e), recordTypes: [], count: 0 };
    }
}

const adminEnum = runEnumerator(ADMIN_SPEC_PATH);
const publicEnum = runEnumerator(PUBLIC_SPEC_PATH);

// Union of both enumerations = the complete universe reachable from either pinned spec.
const universeSet = new Set([...(adminEnum.recordTypes || []), ...(publicEnum.recordTypes || [])]);

// Exclude pure request/params/list-response/wrapper schemas from the "syncable object" universe:
// a syncable OBJECT is an entity that appears as (or is unwrapped from) a GET response --
// i.e. present in responseIndex as a canonical entity. This mirrors the metadata's own
// definition of an IntegrationObject (one that supports READ via GET), independently derived
// from the reverse index built in step 3, NOT from reading the metadata file.
const SUFFIX_EXCLUDE_RE = /(Params|Response|ListResponse|CountResponse|IdsResponse|AsyncResponse|EditParams|CreateParams|UpdateParams|ListResult|ListItem)$/;

const syncableUniverse = new Set();
for (const name of universeSet) {
    if (SUFFIX_EXCLUDE_RE.test(name)) continue;
    // must be reachable via a GET response somewhere (directly or as unwrap target)
    if (responseIndex.has(name)) syncableUniverse.add(name);
}
// Any schema referenced in responseIndex but NOT in the raw enumerator output (e.g. would
// happen if enumerate-catalog's own object/array heuristic differs) is still added --
// the reverse index is the authoritative "reachable via GET" signal.
for (const name of responseIndex.keys()) {
    if (!SUFFIX_EXCLUDE_RE.test(name)) syncableUniverse.add(name);
}

// ─────────────────────────────────────────────────────────────────────────
// 6. Load emitted metadata
// ─────────────────────────────────────────────────────────────────────────
const metaRaw = loadJSON(METADATA_PATH);
const metaRoot = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
const emittedIOs = metaRoot?.relatedEntities?.['MJ: Integration Objects'] ?? [];

// map emitted IO name -> its fields + IOFs
const emittedByName = new Map();
for (const io of emittedIOs) {
    const f = io.fields;
    const iofs = (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map((x) => x.fields);
    emittedByName.set(f.Name, { io: f, iofs });
}

// ─────────────────────────────────────────────────────────────────────────
// 7. Object-set diff (the 11-of-1,694 check)
// ─────────────────────────────────────────────────────────────────────────
// Case-insensitive matching since WildApricot schema names vary in case
// (e.g. "contactExtendedMembershipInfo" vs emitted "Contact").
function norm(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const emittedNormMap = new Map();
for (const name of emittedByName.keys()) emittedNormMap.set(norm(name), name);

const syncableNormMap = new Map();
for (const name of syncableUniverse) syncableNormMap.set(norm(name), name);

const objectsMissing = [];
for (const [n, orig] of syncableNormMap) {
    if (!emittedNormMap.has(n)) objectsMissing.push(orig);
}
const objectsExtra = [];
for (const [n, orig] of emittedNormMap) {
    if (!syncableNormMap.has(n)) objectsExtra.push(orig);
}

// ─────────────────────────────────────────────────────────────────────────
// 8. Per-object re-derivation + diff, for every EMITTED object we can match
//    back into our independently-built response index (i.e. every object
//    both sides agree exists).
// ─────────────────────────────────────────────────────────────────────────
function derivePKCandidates(entityName, flat, getSingleOps) {
    const candidates = [];
    for (const [pname, pinfo] of flat.properties) {
        if (pname.toLowerCase() === 'id') {
            candidates.push(pname);
            continue;
        }
    }
    // cross-check: does a GET-single path use a param name matching this field?
    for (const op of getSingleOps) {
        const m = op.path.match(/\{([A-Za-z]+)\}$/);
        if (m) {
            const paramName = m[1];
            // normalize e.g. "contactId" -> "id"
            if (/id$/i.test(paramName) && !candidates.some((c) => norm(c) === 'id')) {
                candidates.push('Id (inferred from path param)');
            }
        }
    }
    return [...new Set(candidates)];
}

function findPaginationParams(op) {
    if (!op) return null;
    const params = paths[op.path]?.[op.method]?.parameters ?? [];
    const resolved = params.map((p) => (p.$ref ? resolveRef(p.$ref) : p)).filter(Boolean);
    const names = resolved.map((p) => p.name);
    const hasSkipTop = names.includes('$skip') && names.includes('$top');
    const hasOffsetLimit = names.some((n) => /offset/i.test(n)) && names.some((n) => /limit/i.test(n));
    return { names, hasSkipTop, hasOffsetLimit };
}

function findIncrementalParam(op) {
    if (!op) return null;
    const params = paths[op.path]?.[op.method]?.parameters ?? [];
    const resolved = params.map((p) => (p.$ref ? resolveRef(p.$ref) : p)).filter(Boolean);
    const names = resolved.map((p) => p.name);
    const candidates = names.filter((n) => /filter|start.?date|end.?date|since|updated|modified/i.test(n));
    return candidates;
}

const perObjectAll = [];
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

// Type-mapping: OpenAPI type -> our expected emitted Type (best-effort mirror, independently written)
function mapOpenAPIType(pinfo) {
    if (!pinfo) return 'unknown';
    if (pinfo.ref) return 'json'; // nested object ref -> json in our emission convention
    switch (pinfo.type) {
        case 'integer':
            return 'Int';
        case 'number':
            return 'Decimal';
        case 'boolean':
            return 'Boolean';
        case 'string':
            return pinfo.format === 'date-time' ? 'DateTime' : 'String';
        case 'array':
            return 'json';
        case 'object':
            return 'json';
        default:
            return 'unknown';
    }
}

for (const [emittedName, { io, iofs }] of emittedByName) {
    // find matching entity in our independently-built response index by normalized name
    const n = norm(emittedName);
    let matchedEntity = null;
    for (const candidate of responseIndex.keys()) {
        if (norm(candidate) === n) {
            matchedEntity = candidate;
            break;
        }
    }
    if (!matchedEntity) {
        // try flatRegistry direct name match even without a GET response (edge case)
        for (const candidate of flatRegistry.keys()) {
            if (norm(candidate) === n) {
                matchedEntity = candidate;
                break;
            }
        }
    }
    if (!matchedEntity) continue; // can't independently re-derive -> not counted here (captured by objectsMissing/Extra instead)

    const flat = flatRegistry.get(matchedEntity);
    const ops = responseIndex.get(matchedEntity) ?? [];
    const getList = ops.find((o) => o.isList);
    const getSingle = ops.filter((o) => !o.isList);

    const rederivedFields = [...flat.properties.keys()];
    const emittedFields = iofs.map((f) => f.Name);

    const rederivedFieldSet = new Set(rederivedFields.map(norm));
    const emittedFieldSet = new Set(emittedFields.map(norm));

    const missingFields = rederivedFields.filter((f) => !emittedFieldSet.has(norm(f)));
    const extraFields = emittedFields.filter((f) => !rederivedFieldSet.has(norm(f)));

    // path mismatch
    let pathMismatch;
    if (getList) {
        const rederivedPath = getList.path.replace(/\{accountId\}/, '{accountId}');
        const emittedPath = io.APIPath;
        // normalize both by stripping {accountId} prefix segment for comparison
        const stripAcct = (s) => s.replace('/accounts/{accountId}', '');
        if (emittedPath && stripAcct(rederivedPath) !== stripAcct(emittedPath)) {
            pathMismatch = `rederived='${rederivedPath}' vs emitted='${emittedPath}'`;
        }
    }

    // PK mismatch
    const pkCandidates = derivePKCandidates(matchedEntity, flat, getSingle);
    const emittedPKs = iofs.filter((f) => f.IsPrimaryKey).map((f) => f.Name);
    let pkMismatch;
    const pkCandidateNorm = new Set(pkCandidates.map((c) => norm(c.replace(' (inferred from path param)', ''))));
    const emittedPKNorm = new Set(emittedPKs.map(norm));
    if (pkCandidateNorm.size > 0 && emittedPKNorm.size > 0) {
        const overlap = [...pkCandidateNorm].some((c) => emittedPKNorm.has(c));
        if (!overlap) {
            pkMismatch = `rederived=[${pkCandidates.join(',')}] vs emitted=[${emittedPKs.join(',')}]`;
        }
    } else if (pkCandidateNorm.size > 0 && emittedPKNorm.size === 0) {
        pkMismatch = `rederived=[${pkCandidates.join(',')}] vs emitted=[] (no PK emitted)`;
    }

    // FK misclassification: emitted IsForeignKey=true fields whose rederived type is a
    // non-scalar object/array ref (relationship edge), not a scalar id reference.
    const fkMisclassified = [];
    for (const f of iofs) {
        if (f.IsForeignKey) {
            const pinfo = flat.properties.get(
                [...flat.properties.keys()].find((k) => norm(k) === norm(f.Name)) ?? ''
            );
            if (pinfo && (pinfo.type === 'array' || (pinfo.type === 'object' && pinfo.ref))) {
                fkMisclassified.push(f.Name);
            }
        }
    }

    // write ops
    const writeOpsMissing = [];
    if (io.SupportsCreate) {
        const createOps = [...requestBodyIndex.entries()].filter(([schemaName]) => findEntityForRequestSchema(schemaName) === matchedEntity)
            .flatMap(([, arr]) => arr).filter((o) => o.method === 'post');
        if (createOps.length === 0) writeOpsMissing.push('Create');
        else if (io.CreateAPIPath) {
            const stripAcct = (s) => s.replace('/accounts/{accountId}', '');
            const match = createOps.some((o) => stripAcct(o.path) === stripAcct(io.CreateAPIPath));
            if (!match) writeOpsMissing.push(`Create (path mismatch: rederived=[${createOps.map(o=>o.path).join(',')}] vs emitted=${io.CreateAPIPath})`);
        }
    }
    if (io.SupportsUpdate) {
        const updateOps = [...requestBodyIndex.entries()].filter(([schemaName]) => findEntityForRequestSchema(schemaName) === matchedEntity)
            .flatMap(([, arr]) => arr).filter((o) => o.method === 'put' || o.method === 'patch');
        if (updateOps.length === 0) writeOpsMissing.push('Update');
    }
    if (io.SupportsDelete) {
        // delete ops indexed by __DELETE__<path>; look for a delete path sharing the collection prefix
        const deleteKeys = [...requestBodyIndex.keys()].filter((k) => k.startsWith('__DELETE__'));
        const collectionPrefix = getList ? getList.path : null;
        const hasDelete = collectionPrefix
            ? deleteKeys.some((k) => k.replace('__DELETE__', '').startsWith(collectionPrefix))
            : deleteKeys.length > 0;
        if (!hasDelete) writeOpsMissing.push('Delete');
    }

    // pagination mismatch
    let paginationMismatch;
    if (getList) {
        const pag = findPaginationParams(getList);
        if (io.SupportsPagination) {
            if (io.PaginationType === 'Offset' && !pag.hasSkipTop && !pag.hasOffsetLimit) {
                paginationMismatch = `emitted PaginationType=Offset but rederived GET params=[${pag.names.join(',')}] show no $skip/$top or offset/limit pair`;
            }
        }
    }

    // watermark mismatch
    let watermarkMismatch;
    if (io.SupportsIncrementalSync) {
        const incr = getList ? findIncrementalParam(getList) : [];
        if (incr.length === 0) {
            watermarkMismatch = `emitted SupportsIncrementalSync=true, IncrementalWatermarkField='${io.IncrementalWatermarkField}' but no filter/date param found on rederived GET-list op`;
        }
    }

    // body shape mismatch
    let bodyShapeMismatch;
    if (io.SupportsCreate && io.CreateBodyShape) {
        const createReqSchemas = [...requestBodyIndex.entries()].filter(([schemaName]) => findEntityForRequestSchema(schemaName) === matchedEntity && schemaName !== `__DELETE__`);
        if (createReqSchemas.length > 0) {
            const [schemaName] = createReqSchemas[0];
            const reqFlat = flatRegistry.get(schemaName);
            // wrapped heuristic: request schema has single property whose value is itself an object matching entity fields
            const isWrapped = reqFlat && reqFlat.properties.size === 1;
            const rederivedShape = isWrapped ? 'wrapped' : 'flat';
            if (rederivedShape !== io.CreateBodyShape) {
                bodyShapeMismatch = `rederived='${rederivedShape}' vs emitted='${io.CreateBodyShape}'`;
            }
        }
    }

    // type mismatches (sampled, only for fields present on both sides)
    const typeMismatches = [];
    for (const f of iofs) {
        const matchKey = [...flat.properties.keys()].find((k) => norm(k) === norm(f.Name));
        if (!matchKey) continue;
        const pinfo = flat.properties.get(matchKey);
        const rederivedType = mapOpenAPIType(pinfo);
        if (rederivedType !== 'unknown' && f.Type && rederivedType !== f.Type) {
            // tolerate Int/Decimal <-> String swaps as no-ops (loose format tolerance), only report hard mismatches
            const looseOk =
                (rederivedType === 'Decimal' && f.Type === 'Int') ||
                (rederivedType === 'Int' && f.Type === 'Decimal');
            if (!looseOk) typeMismatches.push(`${f.Name}: rederived=${rederivedType} emitted=${f.Type}`);
        }
    }

    const diverged = !!(
        missingFields.length ||
        extraFields.length ||
        pathMismatch ||
        pkMismatch ||
        fkMisclassified.length ||
        writeOpsMissing.length ||
        paginationMismatch ||
        watermarkMismatch ||
        bodyShapeMismatch ||
        typeMismatches.length
    );

    if (diverged) {
        objectsDivergedCount++;
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

    perObjectAll.push({
        object: emittedName,
        matchedSourceSchema: matchedEntity,
        diverged,
        rederivedFieldCount: rederivedFields.length,
        emittedFieldCount: emittedFields.length,
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

// ─────────────────────────────────────────────────────────────────────────
// 9. Write full artifact + compact stdout summary
// ─────────────────────────────────────────────────────────────────────────
mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

const fullArtifact = {
    strategy: 'schema-first-$ref-chase-with-response-reverse-index (vs. presumed path-first extractor walk)',
    generatedAt: new Date().toISOString(),
    sourceSpecs: { admin: ADMIN_SPEC_PATH, publicAccess: PUBLIC_SPEC_PATH },
    enumeratorResults: { admin: { count: adminEnum.count, confidence: adminEnum.confidence }, publicAccess: { count: publicEnum.count, confidence: publicEnum.confidence } },
    sourceSpecDefectsFound: specDefects,
    syncableUniverseCount: syncableUniverse.size,
    syncableUniverse: [...syncableUniverse].sort(),
    emittedObjectCount: emittedByName.size,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: perObjectAll,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(fullArtifact, null, 2));

// Compact, actionable-only perObject sample (<=40), prioritized
const PRIORITY_KEYS = ['missingFields', 'fkMisclassified', 'writeOpsMissing', 'pkMismatch', 'pathMismatch', 'bodyShapeMismatch', 'paginationMismatch', 'watermarkMismatch'];
function isActionable(o) {
    return (
        (o.missingFields && o.missingFields.length) ||
        (o.fkMisclassified && o.fkMisclassified.length) ||
        (o.writeOpsMissing && o.writeOpsMissing.length) ||
        o.pkMismatch ||
        o.pathMismatch ||
        o.bodyShapeMismatch ||
        o.paginationMismatch ||
        o.watermarkMismatch
    );
}

const actionable = perObjectAll.filter(isActionable);
// sort by "severity" -- objects with more actionable dimensions first
actionable.sort((a, b) => {
    const score = (o) => PRIORITY_KEYS.reduce((s, k) => s + (Array.isArray(o[k]) ? (o[k].length > 0 ? 1 : 0) : o[k] ? 1 : 0), 0);
    return score(b) - score(a);
});
const cappedSample = actionable.slice(0, 40).map((o) => ({
    object: o.object,
    diverged: true,
    rederivedFieldCount: o.rederivedFieldCount,
    emittedFieldCount: o.emittedFieldCount,
    missingFields: o.missingFields,
    extraFields: [], // suppressed per instructions (advisory-only, already in histogram)
    pathMismatch: o.pathMismatch,
    pkMismatch: o.pkMismatch,
    writeOpsMissing: o.writeOpsMissing,
    fkMisclassified: o.fkMisclassified,
    paginationMismatch: o.paginationMismatch,
    watermarkMismatch: o.watermarkMismatch,
    bodyShapeMismatch: o.bodyShapeMismatch,
    typeMismatches: [], // suppressed per instructions (advisory-only, already in histogram)
}));

const summary = {
    artifact: OUTPUT_PATH,
    strategy: fullArtifact.strategy,
    enumeratedCount: Math.max(adminEnum.count || 0, universeSet.size),
    syncableUniverseCount: syncableUniverse.size,
    emittedObjectCount: emittedByName.size,
    matchedObjectCount: perObjectAll.length,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: cappedSample,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
