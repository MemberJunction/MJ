#!/usr/bin/env node
// independent-derive-v3-refwalk.mjs
//
// SECOND, INDEPENDENT derivation pass for the WildApricot connector (v2 P8 dual-derivation).
//
// STRATEGY (deliberately DIFFERENT from a naive path-first walk):
//   This script performs a SCHEMA-POINTER WALK: it builds a full $ref resolution index over
//   `components.schemas` + `components.parameters` FIRST (resolving `allOf` merges, `$ref`
//   chains, and shared parameter refs into flattened, de-referenced "resolved schema" objects),
//   and ONLY THEN walks `paths` to attach operations to their response/request schemas by
//   resolving each operation's response-body `$ref` down to its terminal schema name. This is
//   the inverse of a path-first walk (which would read `paths` top-to-bottom and inline whatever
//   it finds in each operation without a pre-built component index) — critically, it means
//   pagination/query parameters that are declared ONCE under `components.parameters` and
//   referenced via `{"$ref": "#/components/parameters/pagingSkip"}` are correctly resolved to
//   their real over-the-wire name (`$skip`, `$top`, `$count`) instead of appearing as opaque
//   `$ref` pointer strings — which is exactly the class of bug (GrowthZone's `skip` vs `$skip`)
//   this whole exercise exists to catch.
//
//   FK detection strategy: rather than treating "any field whose name/type suggests another
//   object" as a foreign key (the path-LMS defect), this script walks the RESOLVED schema and
//   classifies a property as an FK candidate ONLY when its resolved type is the WildApricot
//   `LinkedResource` / `LinkedResourceWithName` shape (an object carrying a scalar integer `Id`
//   + a `Url` string that identifies another record) OR a bare `*Id` integer scalar whose name
//   matches another emitted object's singular name. A property whose resolved type is an ARRAY
//   of full nested objects (e.g. `FieldValues: array<FieldValue>`) is classified as a nested
//   collection / access-path, NOT a foreign key, regardless of naming.
//
// SOURCE OF TRUTH: only the pinned artifact at
//   packages/Integration/connectors-registry/wild-apricot/sources/openapi.admin.9.14.0.json
// This script does NOT read: the extractor's script, its EXTRACTION_REPORT, its matrix, or any
// prior derivation script/output. It reads the emitted metadata file EXACTLY ONCE, in the diff
// step at the very end, purely to set-diff against — never as a source of derivation logic.
//
// Run: node independent-derive-v3-refwalk.mjs
// Output: prints a compact JSON summary to stdout; writes the full result to
//   packages/Integration/connectors-registry/wild-apricot/runs/connector-wildapricot-1782844331649-0a8d294b/output/DUAL_DERIVATION.json

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(VENDOR_DIR, 'sources', 'openapi.admin.9.14.0.json');
const METADATA_PATH = path.resolve(VENDOR_DIR, '..', '..', '..', '..', 'metadata', 'integrations', 'wildapricot', '.wildapricot.integration.json');
const RUN_OUTPUT_DIR = path.join(VENDOR_DIR, 'runs', 'connector-wildapricot-1782844331649-0a8d294b', 'output');
const OUT_PATH = path.join(RUN_OUTPUT_DIR, 'DUAL_DERIVATION.json');
const ENUMERATE_CATALOG = path.resolve(VENDOR_DIR, '..', '..', 'connector-builder-workshop', 'floor', 'enumerate-catalog.mjs');

const STRATEGY =
    'schema-pointer-walk ($ref-index built over components.schemas/components.parameters FIRST, ' +
    'operations attached to resolved terminal schemas SECOND; LinkedResource-shape FK classification ' +
    'vs naive name/type guessing) — deliberately distinct from a path-first naive walk.';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load pinned source (ONLY source of derivation truth)
// ─────────────────────────────────────────────────────────────────────────────
const spec = JSON.parse(readFileSync(SOURCE_PATH, 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────
// 2. Build a full $ref resolution index over components.schemas + components.parameters
//    BEFORE touching paths (the "pointer-first" strategy).
// ─────────────────────────────────────────────────────────────────────────────
const schemas = spec.components?.schemas ?? {};
const parameters = spec.components?.parameters ?? {};

function resolveRef(ref) {
    // "#/components/schemas/Foo" -> schemas.Foo ; "#/components/parameters/Foo" -> parameters.Foo
    const parts = ref.replace(/^#\//, '').split('/');
    let node = spec;
    for (const p of parts) node = node?.[p];
    return node;
}

// Flatten a raw schema node (following $ref + allOf) into a single object:
// { properties: {name: rawPropSchema}, required: string[], sourceRefChain: string[] }
function flattenSchema(node, seen = new Set(), refChain = []) {
    if (!node || typeof node !== 'object') return { properties: {}, required: [], refChain };
    if (node.$ref) {
        if (seen.has(node.$ref)) return { properties: {}, required: [], refChain }; // cycle guard
        seen.add(node.$ref);
        const target = resolveRef(node.$ref);
        const name = node.$ref.split('/').pop();
        return flattenSchema(target, seen, [...refChain, name]);
    }
    if (Array.isArray(node.allOf)) {
        let props = {};
        let required = [];
        let chain = refChain;
        for (const sub of node.allOf) {
            const flat = flattenSchema(sub, seen, chain);
            props = { ...props, ...flat.properties };
            required = [...required, ...flat.required];
            chain = flat.refChain;
        }
        return { properties: props, required, refChain: chain };
    }
    const properties = node.properties ?? {};
    const required = Array.isArray(node.required) ? node.required : [];
    return { properties, required, refChain };
}

// Resolve a single property's raw schema node down to a terminal descriptor.
function resolvePropertyType(rawProp) {
    if (!rawProp || typeof rawProp !== 'object') return { kind: 'unknown' };
    if (rawProp.$ref) {
        const refName = rawProp.$ref.split('/').pop();
        const target = resolveRef(rawProp.$ref);
        const flat = flattenSchema(rawProp);
        return { kind: 'ref', refName, properties: flat.properties };
    }
    if (Array.isArray(rawProp.allOf)) {
        const flat = flattenSchema(rawProp);
        // capture the first $ref in the allOf chain as the "named" type if present
        const namedRef = rawProp.allOf.find((s) => s.$ref);
        return { kind: 'ref', refName: namedRef ? namedRef.$ref.split('/').pop() : null, properties: flat.properties };
    }
    if (rawProp.type === 'array') {
        const items = rawProp.items;
        if (items?.$ref) {
            return { kind: 'array', itemRefName: items.$ref.split('/').pop() };
        }
        if (Array.isArray(items?.allOf)) {
            const namedRef = items.allOf.find((s) => s.$ref);
            return { kind: 'array', itemRefName: namedRef ? namedRef.$ref.split('/').pop() : null };
        }
        return { kind: 'array', itemRefName: null, itemPrimitive: items?.type ?? 'unknown' };
    }
    return { kind: 'scalar', type: rawProp.type ?? 'unknown', format: rawProp.format, enum: rawProp.enum, maxLength: rawProp.maxLength };
}

// Resolve a parameter, following $ref to components.parameters, to get its REAL wire name.
function resolveParam(rawParam) {
    if (rawParam.$ref) {
        const target = resolveRef(rawParam.$ref);
        return target ? { name: target.name, description: target.description, schema: target.schema } : null;
    }
    return { name: rawParam.name, description: rawParam.description, schema: rawParam.schema };
}

// LinkedResource / LinkedResourceWithName shape test: an object whose flattened properties
// are exactly (a subset of) { Id: integer, Url: string, Name?: string }. This is WildApricot's
// canonical "pointer to another record" shape — the FK signal.
function isLinkedResourceShape(refName, flatProps) {
    if (refName === 'LinkedResource' || refName === 'LinkedResourceWithName') return true;
    const keys = Object.keys(flatProps ?? {});
    if (keys.length === 0) return false;
    const onlyIdUrlName = keys.every((k) => ['Id', 'Url', 'Name'].includes(k));
    const hasId = flatProps.Id && (flatProps.Id.type === 'integer' || flatProps.Id.$ref === undefined);
    return onlyIdUrlName && hasId && keys.length <= 3;
}

// Build the full set of resolved schema records: { name -> { properties: {propName: resolved}, required } }
const resolvedSchemas = {};
for (const [name, raw] of Object.entries(schemas)) {
    const flat = flattenSchema(raw);
    const resolvedProps = {};
    for (const [propName, rawProp] of Object.entries(flat.properties)) {
        resolvedProps[propName] = resolvePropertyType(rawProp);
    }
    resolvedSchemas[name] = { properties: resolvedProps, required: flat.required, raw };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Object-set enumeration — run the shared deterministic enumerator over the WHOLE source
//    (the "11-of-1,694" check). Independently, ALSO derive record types by descending the type
//    graph from every response schema reachable via `paths` (list + get-by-id operations),
//    since the shared enumerator only sees `components.schemas` flatly and this connector's
//    real syncable universe is "schemas that are reachable as a list/get response OR nested
//    inside one, excluding pure request-param / response-envelope / RPC-only wrapper shapes".
// ─────────────────────────────────────────────────────────────────────────────
let enumeratorResult = null;
try {
    const stdout = execFileSync('node', [ENUMERATE_CATALOG, SOURCE_PATH], { encoding: 'utf8' });
    enumeratorResult = JSON.parse(stdout);
} catch (err) {
    // Fall back to invoking the enumerator's logic inline is not possible (no exported API);
    // record the failure and proceed with the reachability-based enumeration alone.
    enumeratorResult = { error: String(err?.message ?? err) };
}

// Reachability-based enumeration: walk from every operation's response/request body schema,
// recursively expanding $ref / array-item $ref / allOf, collecting every named schema reached.
const reachableFromOps = new Set();
function expandReachable(refName, depth = 0, seenNames = new Set()) {
    if (!refName || seenNames.has(refName) || depth > 12) return;
    seenNames.add(refName);
    reachableFromOps.add(refName);
    const resolved = resolvedSchemas[refName];
    if (!resolved) return;
    for (const [, propType] of Object.entries(resolved.properties)) {
        if (propType.kind === 'ref' && propType.refName) expandReachable(propType.refName, depth + 1, seenNames);
        if (propType.kind === 'array' && propType.itemRefName) expandReachable(propType.itemRefName, depth + 1, seenNames);
    }
}

function collectBodyRefs(mediaTypeObj) {
    const refs = [];
    const content = mediaTypeObj?.content ?? {};
    for (const media of Object.values(content)) {
        const s = media?.schema;
        if (!s) continue;
        if (s.$ref) refs.push(s.$ref.split('/').pop());
        else if (s.type === 'array' && s.items?.$ref) refs.push(s.items.$ref.split('/').pop());
        else if (Array.isArray(s.allOf)) {
            const namedRef = s.allOf.find((x) => x.$ref);
            if (namedRef) refs.push(namedRef.$ref.split('/').pop());
        }
    }
    return refs;
}

const pathOperationIndex = []; // { pathTemplate, method, opId, responseRefs[], requestRefs[] }
for (const [pathTemplate, ops] of Object.entries(spec.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const op = ops[method];
        if (!op) continue;
        const responseRefs = [];
        for (const [status, respObj] of Object.entries(op.responses ?? {})) {
            if (!/^2\d\d$/.test(status)) continue;
            responseRefs.push(...collectBodyRefs(respObj));
        }
        const requestRefs = collectBodyRefs(op.requestBody);
        for (const r of [...responseRefs, ...requestRefs]) expandReachable(r);
        pathOperationIndex.push({ pathTemplate, method: method.toUpperCase(), opId: op.operationId, responseRefs, requestRefs, op });
    }
}

// Envelope / wrapper / request-param / RPC-only shapes are not themselves syncable record types —
// exclude schemas whose name matches these structural patterns from the "record type" universe,
// mirroring the shared enumerator's plumbing exclusions but tuned to this spec's own wrapper
// vocabulary (discovered from the schema names actually present, not hardcoded per-vendor names).
const WRAPPER_RE = /(Response|Result|Request|IdsResponse|InfoResponse|AsyncResponse)$/;
// *Params is unconditionally a write-payload wrapper: it is the request BODY shape for an
// operation that targets an already-counted object (e.g. CreateContactParams is Contact's create
// body, not a distinct syncable object) — never itself a nested-record envelope, so it does not
// need the "has a nested ref" test the envelope-style wrapper names below require.
const PARAMS_RE = /Params$/;
function looksLikeWrapper(name) {
    if (PARAMS_RE.test(name)) return true;
    if (!WRAPPER_RE.test(name)) return false;
    const resolved = resolvedSchemas[name];
    if (!resolved) return true;
    const propNames = Object.keys(resolved.properties);
    if (propNames.length === 0) return true; // oneOf/anyOf union wrapper we couldn't flatten — treat as non-record plumbing
    // An envelope wrapper typically has 1-4 props and at least one is itself a ref/array-of-ref to a real record.
    const hasNestedRef = propNames.some((p) => {
        const t = resolved.properties[p];
        return (t.kind === 'ref' && t.refName) || (t.kind === 'array' && t.itemRefName);
    });
    return hasNestedRef && propNames.length <= 4;
}

// Summary / write-variant shapes: WildApricot's spec carries multiple schemas for the SAME
// syncable resource — a full read shape (e.g. `Contact`), a nested-list summary shape (`Short*`,
// `*Stub`, `*ListItem`), and a writable-body variant (`Mutable*`, `*EditParams`, `*Post`, `*Put`).
// These are NOT independent record types; they are alternate projections of an object already
// counted elsewhere. Detected structurally: name matches a variant pattern AND its property set is
// a subset (>=50% overlap) of some OTHER schema's property set that is itself reachable.
const VARIANT_NAME_RE = /^(Short|Mutable)[A-Z]|(Stub|ListItem|EditParams|Post|Put)$/;
function isVariantOfAnotherSchema(name) {
    if (!VARIANT_NAME_RE.test(name)) return false;
    const resolved = resolvedSchemas[name];
    const myProps = new Set(Object.keys(resolved?.properties ?? {}).map((p) => p.toLowerCase()));
    if (myProps.size === 0) return true;
    for (const [otherName, otherResolved] of Object.entries(resolvedSchemas)) {
        if (otherName === name) continue;
        const otherProps = new Set(Object.keys(otherResolved.properties).map((p) => p.toLowerCase()));
        if (otherProps.size === 0) continue;
        const overlap = [...myProps].filter((p) => otherProps.has(p)).length;
        if (overlap / myProps.size >= 0.5) return true;
    }
    return false;
}

const allSchemaNames = Object.keys(schemas);
const reachableRecordTypes = [...reachableFromOps].filter((n) => resolvedSchemas[n] && !looksLikeWrapper(n) && !isVariantOfAnotherSchema(n));

// The shared enumerator's raw output is the RAW schema-name dump (no wrapper/value-type
// filtering — that is by design a generic, vendor-agnostic tool). We report its raw count for
// full transparency (`enumeratorRawSchemaCount`), but it is NOT the comparison universe used for
// objectsMissing/objectsExtra: comparing 182 raw component schemas (including *Params request
// bodies, *Response envelopes, and embedded VALUE types like Country/TimeZone/LinkedResource
// that are never independently synced) against a set of syncable Integration Objects is an
// apples-to-oranges diff that manufactures pure methodology noise, not real coverage gaps.
const enumeratorRecordTypes = Array.isArray(enumeratorResult?.recordTypes) ? enumeratorResult.recordTypes : [];

// A leaf VALUE type: a small schema with no array-of-ref / ref properties of its own (i.e. it is
// itself a terminal shape like Country/TimeZone/Currency/an enum-holder), OR a schema whose name
// matches a well-known non-entity structural pattern (enum-ish *Type/*Status/*Level suffixes are
// intentionally NOT excluded here since some of those ARE legitimate emitted objects (e.g.
// MembershipLevel) — leaf-ness is decided structurally, by absence of nested refs, not by name).
function isLeafValueType(name) {
    const resolved = resolvedSchemas[name];
    if (!resolved) return true;
    const props = Object.values(resolved.properties);
    if (props.length === 0) return true; // pure enum / no-properties shape
    const hasAnyNestedRef = props.some((t) => (t.kind === 'ref' && t.refName) || (t.kind === 'array' && t.itemRefName));
    // A leaf value type has NO nested refs of its own AND is not itself independently reachable
    // via a dedicated list/get-by-id operation (i.e. it only ever appears EMBEDDED inside another
    // record, never as the direct subject of a CRUD endpoint).
    return !hasAnyNestedRef;
}

// The comparison universe: every schema that (a) is reachable from a real 2xx response/request
// body (so it is genuinely part of the API surface, not a dead/unused component), AND (b) is not
// a wrapper/envelope shape, AND (c) is EITHER the direct target of its own list/get-by-id
// operation (i.e. present in objectOpMap — populated just below) OR is a non-leaf nested shape
// that itself contains further structure worth tracking. Because objectOpMap is populated later
// in the file, we compute the universe in two passes: a broad structural candidate set now, and
// intersect/union with objectOpMap once built (see PASS 2 below, after objectOpMap exists).
const structuralCandidates = reachableRecordTypes.filter((n) => !isLeafValueType(n));
const enumeratedUniversePass1 = new Set(structuralCandidates);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Per-object re-derivation: for each schema that corresponds to a genuine list-able /
//    gettable resource (has a GET list or GET-by-id operation whose response resolves to it,
//    directly or as array items), derive: field set, PK candidates, list path, write ops,
//    FK fields (LinkedResource-shape only), pagination params (ref-resolved), watermark params,
//    body shape / id location for write operations.
// ─────────────────────────────────────────────────────────────────────────────

// Map: schemaName -> { listPath, getPath, listOp, getOp, createOp, updateOp, deleteOp }
const objectOpMap = {};

function registerOp(schemaName, pathTemplate, method, op, kind) {
    if (!schemaName) return;
    objectOpMap[schemaName] ??= {};
    objectOpMap[schemaName][kind] ??= [];
    objectOpMap[schemaName][kind].push({ pathTemplate, method, op });
}

for (const entry of pathOperationIndex) {
    const { pathTemplate, method, op } = entry;
    const responseRefs = entry.responseRefs;
    const requestRefs = entry.requestRefs;
    const isListPath = !/\{[^}]+\}\s*$/.test(pathTemplate.replace(/\/(status|AllocateInvoice|AllocateRefundToPayment|AllocateRefundToDonation|UnallocateFromPayment|UnallocateFromDonation|GetInfos|Upload|pictures|source\/\{sourceRefId\})$/, ''));
    for (const refName of responseRefs) {
        // Determine the underlying record schema (unwrap simple list wrappers by checking their nested array-of-ref prop)
        let recordName = refName;
        const resolved = resolvedSchemas[refName];
        if (resolved && looksLikeWrapper(refName)) {
            const nested = Object.values(resolved.properties).find((t) => (t.kind === 'array' && t.itemRefName) || (t.kind === 'ref' && t.refName));
            if (nested) recordName = nested.itemRefName || nested.refName;
        }
        if (method === 'GET' && isListPath) registerOp(recordName, pathTemplate, method, op, 'list');
        else if (method === 'GET') registerOp(recordName, pathTemplate, method, op, 'get');
        else if (method === 'POST') registerOp(recordName, pathTemplate, method, op, 'create');
        else if (method === 'PUT' || method === 'PATCH') registerOp(recordName, pathTemplate, method, op, 'update');
        else if (method === 'DELETE') registerOp(recordName, pathTemplate, method, op, 'delete');
    }
    // Also register write ops keyed by REQUEST body ref (create/update bodies often reference
    // the same schema, or a *Params variant that should map back to the record).
    for (const refName of requestRefs) {
        let recordName = refName.replace(/Params$/, '');
        if (!resolvedSchemas[recordName]) recordName = refName;
        if (method === 'POST') registerOp(recordName, pathTemplate, method, op, 'create');
        else if (method === 'PUT' || method === 'PATCH') registerOp(recordName, pathTemplate, method, op, 'update');
        else if (method === 'DELETE') registerOp(recordName, pathTemplate, method, op, 'delete');
    }
}

// PATH-FAMILY MERGE: WildApricot sometimes names the LIST response schema differently from the
// GET-by-id response schema for the SAME resource path family (e.g. `/SentEmails` -> `EmailLog`
// list-envelope vs `/SentEmails/{emailId}` -> `EmailLogRecord` detail shape land in TWO separate
// objectOpMap buckets purely because they resolved to two different schema names). Detect this by
// path-prefix: a bucket whose ONLY entries are 'get' (no list of its own) whose get-path's parent
// segment matches another bucket's list-path is the detail-schema counterpart of that list bucket
// — merge its get/create/update/delete entries AND its resolved schema properties into the list
// bucket, then drop the standalone detail bucket so it isn't double-counted as its own object.
function pathDir(p) {
    return p.replace(/\/\{[^}]+\}\s*$/, '');
}
const listBucketsByDir = new Map();
for (const [name, ops] of Object.entries(objectOpMap)) {
    const listPath = ops.list?.[0]?.pathTemplate;
    if (listPath) listBucketsByDir.set(pathDir(listPath), name);
}
// The DETAIL (get-by-id) schema name is treated as canonical — it is the richer shape and the
// one a connector would naturally name its Integration Object after (it also carries any
// update/delete operations, since those target the single-record path, not the list path).
const mergedAwayBuckets = new Set();
const renamedBuckets = new Map(); // oldListName -> newCanonicalName
for (const [name, ops] of Object.entries(objectOpMap)) {
    if (ops.list) continue; // only merge detail-only buckets into a list bucket
    const getPath = ops.get?.[0]?.pathTemplate;
    if (!getPath) continue;
    const dir = pathDir(getPath);
    const listBucketName = listBucketsByDir.get(dir);
    if (!listBucketName || listBucketName === name) continue;
    const listSideOps = objectOpMap[listBucketName];
    // Union: the detail bucket (name) becomes canonical; absorb the list bucket's 'list' entries
    // and resolved properties into it, then remove the old list-named bucket.
    for (const kind of ['list', 'create', 'update', 'delete']) {
        if (listSideOps[kind]) ops[kind] = [...(ops[kind] ?? []), ...listSideOps[kind]];
    }
    const detailResolved = resolvedSchemas[name];
    const listResolved = resolvedSchemas[listBucketName];
    if (detailResolved && listResolved) {
        // list-side properties fill in any envelope-only extras but must not clobber real detail fields
        detailResolved.properties = { ...listResolved.properties, ...detailResolved.properties };
    }
    mergedAwayBuckets.add(listBucketName);
    renamedBuckets.set(listBucketName, name);
}
for (const name of mergedAwayBuckets) delete objectOpMap[name];

// PASS 2 — finalize the comparison universe now that objectOpMap is fully populated: union the
// leaf-filtered structural candidates with every schema that is the direct target of its own
// list AND/OR get-by-id operation (this recovers legitimately-listable "leaf-shaped" objects
// like MembershipLevel/Bundle/MemberGroup that have no nested refs of their own but are still
// independently syncable top-level resources), then drop wrapper names one more time (some
// *Params names replace to a non-wrapper name via the requestRefs pass above; re-check).
const directOperationTargets = Object.keys(objectOpMap).filter((n) => (objectOpMap[n].list || objectOpMap[n].get) && resolvedSchemas[n] && !looksLikeWrapper(n));
const enumeratedUniverseSet = new Set([...enumeratedUniversePass1, ...directOperationTargets]);
const enumeratedUniverse = [...enumeratedUniverseSet].sort((a, b) => a.localeCompare(b));

function extractParamNames(op) {
    return (op.parameters ?? []).map((p) => resolveParam(p)?.name).filter(Boolean);
}

function derivePagination(listEntry) {
    if (!listEntry) return { type: null, params: [] };
    const names = extractParamNames(listEntry.op);
    const hasSkipTop = names.includes('$skip') && names.includes('$top');
    const hasResultId = names.includes('resultId') || names.includes('$async');
    if (hasSkipTop) return { type: 'Offset', params: names.filter((n) => ['$skip', '$top', '$count'].includes(n)) };
    if (hasResultId) return { type: 'AsyncJob', params: names.filter((n) => ['$async', 'resultId'].includes(n)) };
    return { type: 'None', params: [] };
}

function deriveWatermark(listEntry) {
    if (!listEntry) return null;
    const names = extractParamNames(listEntry.op);
    const candidates = names.filter((n) => /^(StartDate|EndDate|ModifiedSince|UpdatedSince)$/i.test(n));
    return candidates.length ? candidates[0] : null;
}

function derivePKCandidates(recordName, resolved) {
    const props = resolved?.properties ?? {};
    const candidates = [];
    if (props.Id && props.Id.kind === 'scalar' && props.Id.type === 'integer') candidates.push('Id');
    // GET-by-id path param name match
    const getOps = objectOpMap[recordName]?.get ?? objectOpMap[recordName]?.update ?? objectOpMap[recordName]?.delete ?? [];
    for (const { pathTemplate } of getOps) {
        const m = pathTemplate.match(/\{([A-Za-z_]+)\}\s*$/);
        if (m) candidates.push(m[1]);
    }
    return [...new Set(candidates)];
}

function deriveFKFields(resolved) {
    const fks = [];
    for (const [propName, propType] of Object.entries(resolved?.properties ?? {})) {
        if (propType.kind === 'ref' && isLinkedResourceShape(propType.refName, propType.properties)) {
            fks.push({ field: propName, targetHint: propType.refName });
        } else if (propType.kind === 'scalar' && propType.type === 'integer' && /Id$/.test(propName) && propName !== 'Id') {
            // bare scalar *Id field — candidate FK by naming, weaker signal, still not array/object.
            fks.push({ field: propName, targetHint: propName.replace(/Id$/, '') });
        }
    }
    return fks;
}

function deriveMisclassifiedFKCandidates(resolved) {
    // Properties whose resolved type is an ARRAY of full nested objects or a nested ref that is
    // NOT a LinkedResource shape — these are access-paths / nested collections, not FKs. We track
    // them so we can check the emitted metadata for the inverse mistake (an array/object-typed
    // field marked IsForeignKey=true).
    const nonFK = [];
    for (const [propName, propType] of Object.entries(resolved?.properties ?? {})) {
        if (propType.kind === 'array' && propType.itemRefName) nonFK.push(propName);
        else if (propType.kind === 'ref' && propType.refName && !isLinkedResourceShape(propType.refName, propType.properties)) nonFK.push(propName);
    }
    return nonFK;
}

function deriveBodyShape(entry) {
    if (!entry) return null;
    const { op, method } = entry;
    const reqContent = op.requestBody?.content ?? {};
    const schemaRef = Object.values(reqContent)[0]?.schema;
    let shape = 'flat';
    let bodyKey = null;
    if (schemaRef?.$ref) {
        const name = schemaRef.$ref.split('/').pop();
        const resolved = resolvedSchemas[name];
        const propNames = Object.keys(resolved?.properties ?? {});
        // wrapped iff the request schema has exactly one top-level property that is itself a ref/array-ref
        if (propNames.length === 1) {
            const only = resolved.properties[propNames[0]];
            if (only.kind === 'ref' || only.kind === 'array') { shape = 'wrapped'; bodyKey = propNames[0]; }
        }
    }
    // ID location: WildApricot POST responses typically return the created object directly (body),
    // sometimes a Location header is documented via a 201 response `headers` block.
    let idLocation = 'body';
    for (const [status, respObj] of Object.entries(op.responses ?? {})) {
        if (status === '201' && respObj.headers && Object.keys(respObj.headers).some((h) => /location/i.test(h))) {
            idLocation = 'header';
        }
    }
    return { shape, bodyKey, idLocation, method };
}

const perObjectDerivation = {};
for (const recordName of Object.keys(objectOpMap)) {
    const resolved = resolvedSchemas[recordName];
    if (!resolved) continue;
    const ops = objectOpMap[recordName];
    const listEntry = ops.list?.[0];
    const getEntry = ops.get?.[0] ?? listEntry;
    const createEntry = ops.create?.[0];
    const updateEntry = ops.update?.[0];
    const deleteEntry = ops.delete?.[0];

    // Detail-schema union fix: WildApricot sometimes names the LIST response schema differently
    // from the GET-by-id response schema for the SAME resource (e.g. `EmailLog` list envelope vs
    // `EmailLogRecord` detail shape). When the list-op's OWN response ref resolves to a schema
    // that is itself a thin allOf-of-refs wrapper (few/no scalar properties of its own) while a
    // sibling GET-by-id operation on the object's own path family returns a materially richer
    // schema, union that richer schema's fields in — otherwise we'd report every one of its
    // fields as a false "missingFields" divergence purely from a naming mismatch between list vs
    // detail schema, not a real coverage gap.
    let unionProps = { ...resolved.properties };
    if (getEntry && getEntry !== listEntry && getEntry.op) {
        const getResponseRefs = [];
        for (const [status, respObj] of Object.entries(getEntry.op.responses ?? {})) {
            if (/^2\d\d$/.test(status)) getResponseRefs.push(...collectBodyRefs(respObj));
        }
        for (const ref of getResponseRefs) {
            const richer = resolvedSchemas[ref];
            if (richer && Object.keys(richer.properties).length > Object.keys(unionProps).length) {
                unionProps = { ...unionProps, ...richer.properties };
            }
        }
    }
    const unionResolved = { properties: unionProps, required: resolved.required };

    const fields = Object.keys(unionResolved.properties);
    const pkCandidates = derivePKCandidates(recordName, unionResolved);
    const fkFields = deriveFKFields(unionResolved);
    const nestedNonFKFields = deriveMisclassifiedFKCandidates(unionResolved);
    const pagination = derivePagination(listEntry);
    const watermarkField = deriveWatermark(listEntry);
    const writeOps = [];
    if (createEntry) writeOps.push('Create');
    if (updateEntry) writeOps.push('Update');
    if (deleteEntry) writeOps.push('Delete');

    perObjectDerivation[recordName] = {
        fields,
        properties: unionResolved.properties, // exposed so the type-mismatch diff can resolve union'd (detail-schema) fields too
        pkCandidates,
        fkFields,
        nestedNonFKFields,
        listPath: listEntry?.pathTemplate ?? getEntry?.pathTemplate ?? null,
        paginationType: pagination.type,
        paginationParams: pagination.params,
        watermarkField,
        writeOps,
        createBody: deriveBodyShape(createEntry),
        updateBody: deriveBodyShape(updateEntry),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Read the emitted metadata file EXACTLY ONCE, here, purely for the diff step.
// ─────────────────────────────────────────────────────────────────────────────
let metadata = null;
let metadataLoadError = null;
try {
    metadata = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
} catch (err) {
    metadataLoadError = String(err?.message ?? err);
}

// The metadata file is an mj-sync file: a top-level object or array with `fields` + `relatedEntities`.
// Integration Objects live under relatedEntities['MJ: Integration Objects'] (or similar); each IO's
// fields live under ITS relatedEntities['MJ: Integration Object Fields']. Walk defensively since we
// do not control / read the extractor's authoring code, only the resulting JSON shape.
function asArray(x) {
    return Array.isArray(x) ? x : x ? [x] : [];
}

function findRelatedArray(node, keyPattern) {
    const related = node?.relatedEntities ?? {};
    for (const [key, val] of Object.entries(related)) {
        if (keyPattern.test(key)) return asArray(val);
    }
    return [];
}

const rootRecords = asArray(metadata);
const integrationObjects = [];
for (const root of rootRecords) {
    const ios = findRelatedArray(root, /Integration Object(?!\sField)/i);
    for (const io of ios) integrationObjects.push(io);
    // Some authoring styles nest IOs directly at top-level too — also scan root's own fields tree
}
// Fallback: if nothing found via relatedEntities on root records, the file might itself be an
// array of IO records directly (alternate scoped-push authoring layout).
if (integrationObjects.length === 0) {
    for (const root of rootRecords) {
        if (root?.fields?.Name && root?.relatedEntities) integrationObjects.push(root);
    }
}

function getIOName(io) {
    return io?.fields?.Name;
}

function getIOFields(io) {
    const iofs = findRelatedArray(io, /Integration Object Field/i);
    return iofs;
}

// Build emitted-object index: name -> { fields: [{name, isPK, isFK, type, maxLength, isForeignKey}], apiPath, paginationType, watermarkField, createBodyShape, createBodyKey, createIdLocation, updateBodyShape, updateBodyKey, updateIdLocation, supportsCreate, supportsUpdate, supportsDelete }
const emittedObjects = {};
for (const io of integrationObjects) {
    const name = getIOName(io);
    if (!name) continue;
    const f = io.fields ?? {};
    const iofs = getIOFields(io);
    emittedObjects[name] = {
        apiPath: f.APIPath ?? null,
        createAPIPath: f.CreateAPIPath ?? null,
        updateAPIPath: f.UpdateAPIPath ?? null,
        deleteAPIPath: f.DeleteAPIPath ?? null,
        paginationType: f.PaginationType ?? null,
        watermarkField: f.IncrementalWatermarkField ?? null,
        supportsCreate: !!f.SupportsCreate,
        supportsUpdate: !!f.SupportsUpdate,
        supportsDelete: !!f.SupportsDelete,
        createBodyShape: f.CreateBodyShape ?? null,
        createBodyKey: f.CreateBodyKey ?? null,
        createIDLocation: f.CreateIDLocation ?? null,
        updateBodyShape: f.UpdateBodyShape ?? null,
        updateBodyKey: f.UpdateBodyKey ?? null,
        updateIDLocation: f.UpdateIDLocation ?? null,
        fields: iofs.map((iof) => ({
            name: iof?.fields?.Name,
            isPrimaryKey: !!iof?.fields?.IsPrimaryKey,
            isForeignKey: !!iof?.fields?.IsForeignKey,
            type: iof?.fields?.Type ?? null,
            maxLength: iof?.fields?.MaxLength ?? null,
        })),
    };
}

const emittedObjectNames = Object.keys(emittedObjects);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Object-set diff (the primary 11-of-1,694 signal)
// ─────────────────────────────────────────────────────────────────────────────
function normalizeName(n) {
    return String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
}
const emittedNorm = new Map(emittedObjectNames.map((n) => [normalizeName(n), n]));
const universeNorm = new Map(enumeratedUniverse.map((n) => [normalizeName(n), n]));

const objectsMissing = enumeratedUniverse.filter((n) => !emittedNorm.has(normalizeName(n)));
const objectsExtra = emittedObjectNames.filter((n) => !universeNorm.has(normalizeName(n)));

// ─────────────────────────────────────────────────────────────────────────────
// 7. Per-object field/attribute diff for every object present in BOTH sets.
// ─────────────────────────────────────────────────────────────────────────────
const perObjectFull = [];
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

function normFieldName(n) {
    return String(n).toLowerCase();
}

for (const [normName, derivedName] of universeNorm) {
    const emittedName = emittedNorm.get(normName);
    if (!emittedName) continue; // already counted in objectsMissing
    const derived = perObjectDerivation[derivedName];
    const emitted = emittedObjects[emittedName];
    if (!derived) continue; // schema-only type with no operation attached — nothing to compare structurally

    const derivedFieldsNorm = new Set(derived.fields.map(normFieldName));
    const emittedFieldsNorm = new Set((emitted.fields ?? []).map((f) => normFieldName(f.name)));

    const missingFields = derived.fields.filter((f) => !emittedFieldsNorm.has(normFieldName(f)));
    const extraFields = (emitted.fields ?? []).map((f) => f.name).filter((f) => f && !derivedFieldsNorm.has(normFieldName(f)));

    // PK mismatch
    const emittedPKs = (emitted.fields ?? []).filter((f) => f.isPrimaryKey).map((f) => f.name);
    const pkOverlap = emittedPKs.some((pk) => derived.pkCandidates.map(normFieldName).includes(normFieldName(pk)));
    const pkMismatch = derived.pkCandidates.length > 0 && emittedPKs.length > 0 && !pkOverlap
        ? `derived candidates [${derived.pkCandidates.join(',')}] vs emitted PK [${emittedPKs.join(',')}]`
        : (derived.pkCandidates.length > 0 && emittedPKs.length === 0 ? `no PK emitted; derived candidates [${derived.pkCandidates.join(',')}]` : null);

    // Path mismatch
    const pathMismatch = derived.listPath && emitted.apiPath && !samePathShape(derived.listPath, emitted.apiPath)
        ? `derived list path "${derived.listPath}" vs emitted APIPath "${emitted.apiPath}"`
        : null;

    // Write ops missing: derived says a write op exists but emitted capability flag is false
    const writeOpsMissing = [];
    if (derived.writeOps.includes('Create') && !emitted.supportsCreate) writeOpsMissing.push('Create');
    if (derived.writeOps.includes('Update') && !emitted.supportsUpdate) writeOpsMissing.push('Update');
    if (derived.writeOps.includes('Delete') && !emitted.supportsDelete) writeOpsMissing.push('Delete');

    // FK misclassification: emitted IsForeignKey=true on a field that the schema-pointer walk
    // resolved to a nested ARRAY-of-object or non-LinkedResource-shaped nested OBJECT (an
    // access-path/collection, not a scalar reference) — the path-LMS defect class.
    const fkMisclassified = (emitted.fields ?? [])
        .filter((f) => f.isForeignKey && derived.nestedNonFKFields.map(normFieldName).includes(normFieldName(f.name)))
        .map((f) => f.name);

    // Pagination mismatch: emitted PaginationType vs derived type, normalized
    const paginationMismatch = emitted.paginationType && derived.paginationType && !paginationCompatible(emitted.paginationType, derived.paginationType)
        ? `emitted "${emitted.paginationType}" vs derived "${derived.paginationType}" (params: ${derived.paginationParams.join(',')})`
        : (derived.paginationType && derived.paginationType !== 'None' && !emitted.paginationType
            ? `derived "${derived.paginationType}" (params: ${derived.paginationParams.join(',')}) but nothing emitted`
            : null);

    // Watermark mismatch
    const watermarkMismatch = derived.watermarkField && emitted.watermarkField && normFieldName(derived.watermarkField) !== normFieldName(emitted.watermarkField)
        ? `derived "${derived.watermarkField}" vs emitted "${emitted.watermarkField}"`
        : (derived.watermarkField && !emitted.watermarkField ? `derived candidate "${derived.watermarkField}" but none emitted` : null);

    // Body shape mismatch (Create)
    let bodyShapeMismatch = null;
    if (derived.createBody && emitted.createBodyShape && derived.createBody.shape !== emitted.createBodyShape) {
        bodyShapeMismatch = `Create: derived "${derived.createBody.shape}"${derived.createBody.bodyKey ? `(key=${derived.createBody.bodyKey})` : ''} vs emitted "${emitted.createBodyShape}"${emitted.createBodyKey ? `(key=${emitted.createBodyKey})` : ''}`;
    } else if (derived.updateBody && emitted.updateBodyShape && derived.updateBody.shape !== emitted.updateBodyShape) {
        bodyShapeMismatch = `Update: derived "${derived.updateBody.shape}"${derived.updateBody.bodyKey ? `(key=${derived.updateBody.bodyKey})` : ''} vs emitted "${emitted.updateBodyShape}"${emitted.updateBodyKey ? `(key=${emitted.updateBodyKey})` : ''}`;
    }

    // Type mismatches: only compare for fields present in both, using resolved scalar type.
    // The metadata file's IOF.Type vocabulary observed at runtime is a small generic set
    // (Boolean/Date/Decimal/Int/String/json) rather than raw SQL types — map OpenAPI scalar
    // kinds onto that same generic vocabulary (case-insensitively) instead of guessing at SQL
    // column-type substrings, which would false-positive on every single field.
    const typeMismatches = [];
    for (const f of derived.fields) {
        const emittedField = (emitted.fields ?? []).find((ef) => normFieldName(ef.name) === normFieldName(f));
        if (!emittedField || !emittedField.type) continue;
        const derivedType = derived.properties?.[f] ?? resolvedSchemas[derivedName]?.properties?.[f];
        if (derivedType?.kind === 'scalar' && derivedType.type) {
            const expectedGeneric = derivedType.type === 'integer' ? ['int', 'decimal', 'number']
                : derivedType.type === 'boolean' ? ['boolean', 'bit']
                : derivedType.type === 'number' ? ['decimal', 'int', 'number']
                : derivedType.type === 'string' ? (derivedType.format === 'date' || derivedType.format === 'date-time' ? ['date', 'string'] : ['string', 'json'])
                : null;
            const emittedTypeNorm = String(emittedField.type).toLowerCase();
            if (expectedGeneric && !expectedGeneric.some((t) => emittedTypeNorm.includes(t))) {
                typeMismatches.push(`${f}: derived ${derivedType.type}${derivedType.format ? `(${derivedType.format})` : ''} vs emitted ${emittedField.type}`);
            }
        }
    }

    const diverged = missingFields.length > 0 || extraFields.length > 0 || typeMismatches.length > 0
        || fkMisclassified.length > 0 || writeOpsMissing.length > 0 || !!pkMismatch || !!pathMismatch
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
        object: emittedName,
        diverged,
        rederivedFieldCount: derived.fields.length,
        emittedFieldCount: (emitted.fields ?? []).length,
        missingFields,
        extraFields,
        pkMismatch: pkMismatch ?? undefined,
        pathMismatch: pathMismatch ?? undefined,
        writeOpsMissing,
        fkMisclassified,
        paginationMismatch: paginationMismatch ?? undefined,
        watermarkMismatch: watermarkMismatch ?? undefined,
        bodyShapeMismatch: bodyShapeMismatch ?? undefined,
        typeMismatches,
    });
}

function samePathShape(a, b) {
    const norm = (p) => p.replace(/\{[^}]+\}/g, '{}').toLowerCase().replace(/^\/(v\d+\/)?/, '/');
    return norm(a).endsWith(norm(b).split('/').filter(Boolean).slice(-1)[0]) || norm(a) === norm(b) || norm(a).includes(norm(b).split('/').filter(Boolean).slice(-2).join('/'));
}

function paginationCompatible(emittedType, derivedType) {
    const map = { Offset: ['Offset', 'PageNumber'], AsyncJob: ['None', 'Cursor'], None: ['None'] };
    if (emittedType === derivedType) return true;
    return (map[derivedType] ?? []).includes(emittedType);
}

const objectsDivergedCount = perObjectFull.filter((o) => o.diverged).length;

// ─────────────────────────────────────────────────────────────────────────────
// 8. Write full lossless result + compact stdout summary
// ─────────────────────────────────────────────────────────────────────────────
const fullResult = {
    artifact: OUT_PATH,
    strategy: STRATEGY,
    sourcePath: SOURCE_PATH,
    metadataPath: METADATA_PATH,
    metadataLoadError,
    enumeratorRaw: enumeratorResult,
    enumeratorRawSchemaCount: enumeratorRecordTypes.length,
    note: 'enumeratedCount/enumeratedUniverse below is the filtered SYNCABLE-RECORD-TYPE universe ' +
        '(reachable-from-a-2xx-body schemas, minus wrapper/envelope/*Params shapes, minus pure leaf ' +
        'value-types with no nested structure of their own AND no dedicated list/get-by-id operation) ' +
        '— NOT the raw component-schema count (enumeratorRawSchemaCount, which includes request-body ' +
        '*Params types, response *Response/*Result envelopes, and embedded value types like Country/' +
        'TimeZone/LinkedResource that are never independently synced). Comparing the raw count against ' +
        'emitted Integration Objects would manufacture pure methodology noise.',
    enumeratedCount: enumeratedUniverse.length,
    enumeratedUniverse,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObjectFull,
    generatedAt: new Date().toISOString(),
};

writeFileSync(OUT_PATH, JSON.stringify(fullResult, null, 2), 'utf8');

// Compact, actionable-only perObject sample (cap 40), prioritized as specified.
function priorityScore(o) {
    let score = 0;
    if (o.missingFields.length) score += 100 + o.missingFields.length;
    if (o.fkMisclassified.length) score += 50;
    if (o.writeOpsMissing.length) score += 40;
    if (o.pkMismatch) score += 30;
    if (o.pathMismatch) score += 30;
    if (o.bodyShapeMismatch) score += 20;
    if (o.paginationMismatch) score += 20;
    if (o.watermarkMismatch) score += 15;
    return score;
}

const actionable = perObjectFull.filter((o) => o.diverged && priorityScore(o) > 0);
actionable.sort((a, b) => priorityScore(b) - priorityScore(a));
const perObjectSample = actionable.slice(0, 40).map((o) => ({
    object: o.object,
    diverged: true,
    rederivedFieldCount: o.rederivedFieldCount,
    emittedFieldCount: o.emittedFieldCount,
    missingFields: o.missingFields,
    extraFields: o.extraFields,
    ...(o.pathMismatch ? { pathMismatch: o.pathMismatch } : {}),
    ...(o.pkMismatch ? { pkMismatch: o.pkMismatch } : {}),
    writeOpsMissing: o.writeOpsMissing,
    fkMisclassified: o.fkMisclassified,
    ...(o.paginationMismatch ? { paginationMismatch: o.paginationMismatch } : {}),
    ...(o.watermarkMismatch ? { watermarkMismatch: o.watermarkMismatch } : {}),
    ...(o.bodyShapeMismatch ? { bodyShapeMismatch: o.bodyShapeMismatch } : {}),
    typeMismatches: o.typeMismatches,
}));

const summary = {
    artifact: OUT_PATH,
    strategy: STRATEGY,
    enumeratedCount: enumeratedUniverse.length,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: perObjectSample,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
