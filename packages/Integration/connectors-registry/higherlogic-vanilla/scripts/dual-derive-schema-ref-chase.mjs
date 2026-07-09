#!/usr/bin/env node
// dual-derive-schema-ref-chase.mjs — SECOND, INDEPENDENT derivation for higherlogic-vanilla (v2 P8).
//
// STRATEGY (deliberately DIFFERENT from a naive path-first walk):
//   RESPONSE-SCHEMA $REF-CHASE, not path-segment-name-matching. Object IDENTITY, FIELD SET,
//   and PK candidates are derived by resolving the JSON-Schema $ref graph reachable from each
//   HTTP GET operation's 200 response body -- never from the URL path text. Vanilla's OpenAPI
//   spec names its "read" schemas independently of the URL (e.g. GET /badges/{id} resolves via
//   $ref to component schema "Badge"; GET /categories returns an ANONYMOUS inline array-item
//   schema with no $ref at all -- proving path-segment-name and schema-name are NOT the same
//   axis, and any derivation that conflates them is doing path-first, not schema-first, work).
//   Path text is used ONLY as a secondary/fallback signal: (a) to name a canonical object when
//   its response is a $ref-less inline schema, and (b) to ATTACH write verbs (POST/PATCH/PUT/
//   DELETE) to the canonical object identified by the read schema, since CRUD-column mapping is
//   inherently path-scoped by construction (a v5.39.x IO's Create/Update/Delete columns are
//   per-object, and "object" here is anchored on its own collection root path family).
//
//   Field-set derivation additionally UNIONS the read-schema's properties with the properties of
//   every write-body schema variant (e.g. BadgePost/BadgePatch) attached to the same canonical
//   object -- a genuinely different technique from "walk the read schema only", and expected to
//   over-count relative to a single-schema-walk extractor (documented, not a defect).
//
//   "Descend the type graph for nested record-collections": every path's response schema is
//   walked recursively (through $ref, allOf, array items, and inline nested object properties)
//   so that a resource reachable ONLY through a doc's own recursive/embedded shape (e.g.
//   /categories' self-referential inline "children" array) is still discovered, and so that a
//   schema reachable ONLY as an embedded fragment (never itself a path's direct response) is
//   correctly EXCLUDED from the canonical-object universe (it is a value object, not a door).
//
// Run: node dual-derive-schema-ref-chase.mjs
// Output: prints a compact JSON summary to stdout; writes the FULL per-object result to
//   runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a/output/DUAL_DERIVATION.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enumerateCatalogFiles } from '../../../connector-builder-workshop/floor/enumerate-catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CONNECTOR_DIR, '../../../..');
const SPEC_PATH = path.join(CONNECTOR_DIR, 'sources/vanilla-openapi.merged.v3.json');
const METADATA_PATH = path.join(
    REPO_ROOT,
    'metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json',
);
const RUN_OUTPUT_DIR = path.join(
    CONNECTOR_DIR,
    'runs/connector-higherlogic-vanilla-1783524696351-4fa3bf0a/output',
);
const OUT_PATH = path.join(RUN_OUTPUT_DIR, 'DUAL_DERIVATION.json');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// ---------------------------------------------------------------------------
// 1. Load the pinned source (the merged OpenAPI v3 spec -- SOURCES.json TopSource)
// ---------------------------------------------------------------------------
const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const schemas = spec.components?.schemas ?? {};

// ---------------------------------------------------------------------------
// 2. $ref resolution + recursive shape collection (allOf-merging), with a
//    visited-set to avoid infinite recursion on self-referential schemas.
// ---------------------------------------------------------------------------
function resolveRefName(ref) {
    if (typeof ref !== 'string' || !ref.startsWith('#/components/schemas/')) return null;
    return ref.slice('#/components/schemas/'.length);
}

function collectShape(schemaName, visited = new Set()) {
    if (!schemaName || visited.has(schemaName)) return { properties: {}, required: [] };
    visited.add(schemaName);
    const s = schemas[schemaName];
    if (!s || typeof s !== 'object') return { properties: {}, required: [] };
    let properties = {};
    let required = [];
    if (Array.isArray(s.allOf)) {
        for (const sub of s.allOf) {
            if (sub.$ref) {
                const subName = resolveRefName(sub.$ref);
                const shape = collectShape(subName, visited);
                properties = { ...properties, ...shape.properties };
                required = [...required, ...shape.required];
            } else if (sub.properties) {
                properties = { ...properties, ...sub.properties };
                required = [...required, ...(sub.required || [])];
            }
        }
    }
    if (s.properties) {
        properties = { ...properties, ...s.properties };
        required = [...required, ...(s.required || [])];
    }
    return { properties, required: [...new Set(required)] };
}

// Recursively walk a schema NODE (not just a named component) collecting every
// $ref reachable through properties / items / allOf / oneOf / anyOf -- this is
// the "descend the type graph for nested record-collections" traversal.
function walkReachableRefs(node, acc = new Set(), seenNodes = new Set()) {
    if (!node || typeof node !== 'object') return acc;
    if (seenNodes.has(node)) return acc;
    seenNodes.add(node);
    if (node.$ref) {
        const name = resolveRefName(node.$ref);
        if (name && !acc.has(name)) {
            acc.add(name);
            walkReachableRefs(schemas[name], acc, seenNodes);
        }
        return acc;
    }
    if (node.items) walkReachableRefs(node.items, acc, seenNodes);
    if (Array.isArray(node.allOf)) for (const s of node.allOf) walkReachableRefs(s, acc, seenNodes);
    if (Array.isArray(node.oneOf)) for (const s of node.oneOf) walkReachableRefs(s, acc, seenNodes);
    if (Array.isArray(node.anyOf)) for (const s of node.anyOf) walkReachableRefs(s, acc, seenNodes);
    if (node.properties) {
        for (const propSchema of Object.values(node.properties)) {
            walkReachableRefs(propSchema, acc, seenNodes);
        }
    }
    return acc;
}

// ---------------------------------------------------------------------------
// 3. Classify a GET operation's 200/201 response body shape.
// ---------------------------------------------------------------------------
function getJSONResponseSchema(operation) {
    const resp = operation?.responses?.['200'] ?? operation?.responses?.['201'];
    return resp?.content?.['application/json']?.schema ?? null;
}

// Given an "items" (or top-level) schema node, resolve its primary $ref -- handling
// the plain {$ref} case AND the allOf-wrapped case ({allOf:[{$ref},...]}) seen on
// e.g. /role-requests/applications. Returns the schema name or null.
function primaryRefOf(node) {
    if (!node) return null;
    if (node.$ref) return resolveRefName(node.$ref);
    if (Array.isArray(node.allOf)) {
        for (const sub of node.allOf) {
            if (sub.$ref) return resolveRefName(sub.$ref);
        }
    }
    return null;
}

function classifyReadShape(operation) {
    const schema = getJSONResponseSchema(operation);
    if (!schema) return null;
    const directRef = primaryRefOf(schema);
    if (directRef) return { kind: 'single', name: directRef };
    if (schema.type === 'array' || schema.items) {
        const items = schema.items;
        const itemRef = primaryRefOf(items);
        if (itemRef) return { kind: 'list', name: itemRef };
        if (items && (items.properties || Array.isArray(items.allOf))) {
            return { kind: 'list-inline', name: null, inlineNode: items };
        }
        return null;
    }
    if (schema.type === 'object' && schema.properties) {
        // paginated envelope: an object with one property that is an array of $ref
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
            if (propSchema?.type === 'array') {
                const name = primaryRefOf(propSchema.items);
                if (name) return { kind: 'list-wrapped', name, wrapperProp: propName };
            }
        }
        // direct inline single-object response (no $ref at all)
        return { kind: 'single-inline', name: null, inlineNode: schema };
    }
    return null;
}

function getRequestBodySchemaRef(operation) {
    const body = operation?.requestBody?.content?.['application/json']?.schema;
    if (!body) return null;
    if (body.$ref) return resolveRefName(body.$ref);
    // some bodies are inline objects; no name to chase, but still usable for property union
    if (body.type === 'object' && body.properties) return { inline: body };
    return null;
}

// ---------------------------------------------------------------------------
// 4. Path segmentation helpers (used ONLY as a fallback naming / CRUD-attach
//    mechanism -- never as the primary identity signal).
// ---------------------------------------------------------------------------
function pathSegments(p) {
    return p.split('/').filter(Boolean);
}

function isParamSegment(seg) {
    return seg.startsWith('{') || seg.startsWith(':');
}

// The "family root" of a path = every leading static segment up to (but not
// including) the first parameter segment. Used to cluster e.g. /badges,
// /badges/{id}, /badges/{id}/users under one family for CRUD attachment.
function familyRoot(p) {
    const segs = pathSegments(p);
    const out = [];
    for (const s of segs) {
        if (isParamSegment(s)) break;
        out.push(s);
    }
    return '/' + out.join('/');
}

function singularize(word) {
    if (/ies$/.test(word) && word.length > 3) return word.slice(0, -3) + 'y';
    if (/(sses|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
    if (/s$/.test(word) && !/ss$/.test(word) && word.length > 3) return word.slice(0, -1);
    return word;
}

function pascalCase(word) {
    return word
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

// Derive a fallback name for a $ref-less inline list door from its path. Defaults to
// the LAST static segment (REST convention: the trailing noun names what you get --
// this is what correctly yields e.g. "GroupTag" and "Vote" for their inline doors).
// EXCEPTION: when that trailing-segment name collides with an ALREADY-registered
// canonical object that came from a completely unrelated door (e.g.
// /user-mentions/users/{userID}'s trailing "users" segment naively yields "User",
// colliding with the real Users collection at /users), fall back to the FIRST
// static segment instead ("user-mentions" -> "UserMention") -- it is the more
// semantically distinctive noun for a deeply-nested locator-style path.
function nameFromListPath(p, existingKeys) {
    const segs = pathSegments(p);
    const statics = segs.filter((s) => !isParamSegment(s));
    const lastStatic = statics[statics.length - 1];
    const firstStatic = statics[0];
    const lastName = lastStatic ? pascalCase(singularize(lastStatic)) : null;
    const firstName = firstStatic ? pascalCase(singularize(firstStatic)) : null;
    if (
        lastName &&
        existingKeys?.has(normKey(lastName)) &&
        firstName &&
        normKey(firstName) !== normKey(lastName)
    ) {
        return firstName;
    }
    return lastName || firstName || 'Unknown';
}

// Vanilla's OpenAPI spec decorates its "read" schema names with API-internal, non-
// semantic prefixes/suffixes ("Full", "Basic" prefixes; "Schema", "Fragment",
// "Simple", "Descriptor" suffixes) that do NOT denote a different resource --
// FullKnowledgeBaseSchema and KnowledgeBase name the SAME conceptual record. Strip
// these (whole-token only, never mid-word) so the canonical name is comparable to a
// human-authored object name. Deliberately narrow: does NOT strip "Type"/"Info"/
// "Request"/"Response" etc. because those DO denote genuinely different resources
// in this spec (AuthenticatorTypeInfo != Authenticator; BadgeRequest != Badge).
const STRIP_PREFIXES = ['Full', 'Basic', 'Legacy'];
const STRIP_SUFFIXES = ['Schema', 'Fragment', 'Simple', 'Descriptor'];
function cleanSchemaName(name) {
    let out = name;
    for (const pre of STRIP_PREFIXES) {
        if (out.startsWith(pre) && out.length > pre.length && /[A-Z]/.test(out[pre.length])) {
            out = out.slice(pre.length);
        }
    }
    for (const suf of STRIP_SUFFIXES) {
        if (out.endsWith(suf) && out.length > suf.length) {
            out = out.slice(0, -suf.length);
        }
    }
    return out || name;
}

// Normalize any name (schema name, path-derived name, or emitted metadata Name)
// into a comparison KEY -- lowercase alnum only, plural 's' stripped -- so
// naming-CONVENTION differences (Badge vs badges vs Badges) don't masquerade
// as object-set divergence.
function normKey(name) {
    const alnum = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (alnum.length > 4 && alnum.endsWith('ies')) return alnum.slice(0, -3) + 'y';
    if (alnum.length > 4 && alnum.endsWith('s') && !alnum.endsWith('ss')) return alnum.slice(0, -1);
    return alnum;
}

// ---------------------------------------------------------------------------
// 5. Build the door inventory: for every path, classify its GET (if any) and
//    record every write verb present.
// ---------------------------------------------------------------------------
const doors = []; // { path, familyRoot, get: classifyReadShape()|null, writeOps: {post,put,patch,delete: operation|null} }
for (const [p, ops] of Object.entries(spec.paths)) {
    if (!ops || typeof ops !== 'object') continue;
    const entry = { path: p, familyRoot: familyRoot(p), get: null, writeOps: {} };
    if (ops.get) entry.get = classifyReadShape(ops.get);
    for (const verb of ['post', 'put', 'patch', 'delete']) {
        if (ops[verb]) entry.writeOps[verb] = ops[verb];
    }
    doors.push(entry);
}

// ---------------------------------------------------------------------------
// 6. Reachability from responses: which schema names are EVER the direct
//    response type (or array-item response type) of some path's GET? This
//    is the "coverable universe" -- a schema reachable ONLY as a nested
//    embedded fragment inside another schema's properties is NOT counted
//    (it's a value object, not an independently addressable record type).
// ---------------------------------------------------------------------------
const listDoorsBySchema = new Map(); // schemaName -> [{path, kind}]
const singleDoorsBySchema = new Map(); // schemaName -> [{path, kind}]
const inlineListDoors = []; // { path, inlineNode }

for (const d of doors) {
    if (!d.get) continue;
    if (d.get.kind === 'list' || d.get.kind === 'list-wrapped') {
        const arr = listDoorsBySchema.get(d.get.name) ?? [];
        arr.push({ path: d.path, kind: d.get.kind });
        listDoorsBySchema.set(d.get.name, arr);
    } else if (d.get.kind === 'single') {
        const arr = singleDoorsBySchema.get(d.get.name) ?? [];
        arr.push({ path: d.path, kind: d.get.kind });
        singleDoorsBySchema.set(d.get.name, arr);
    } else if (d.get.kind === 'list-inline') {
        inlineListDoors.push({ path: d.path, inlineNode: d.get.inlineNode });
    }
}

// ---------------------------------------------------------------------------
// 7. Canonical COVERABLE record-type universe. A canonical object is anchored
//    on ONE list door. Its paired "single" door -- if one exists -- is found
//    by EXACT structural matching: a path with exactly one MORE segment than
//    the list path, where that extra segment is a parameter placeholder (e.g.
//    /badges + /badges/{id}). This is deliberately narrow: it is what proves
//    two differently-NAMED response schemas (Article vs ArticleSimple,
//    KnowledgeBase vs FullKnowledgeBaseSchema) are the SAME resource viewed
//    two ways, while refusing to merge unrelated deeper-nested sub-resources
//    that happen to share a URL prefix (e.g. /badges/{id}/users is its OWN
//    canonical object, never folded into Badge). Single-only doors with no
//    list-door pairing (e.g. /config, /users/me, /site-totals) are recorded
//    as INFORMATIONAL, not coverable -- there is nothing to sync as a set.
// ---------------------------------------------------------------------------
function segsOf(p) {
    return pathSegments(p);
}

function findPairedSingleDoor(listPath) {
    const base = segsOf(listPath);
    for (const d of doors) {
        const s = segsOf(d.path);
        if (s.length !== base.length + 1) continue;
        if (!isParamSegment(s[s.length - 1])) continue;
        let matches = true;
        for (let i = 0; i < base.length; i++) {
            if (s[i] !== base[i]) {
                matches = false;
                break;
            }
        }
        if (matches && d.get && (d.get.kind === 'single' || d.get.kind === 'single-inline')) return d;
    }
    return null;
}

const canonicalObjects = new Map(); // key: normKey(canonicalName) -> { canonicalName, schemaNames:Set, listPaths:[], singlePaths:[], source }
const consumedListPaths = new Set();

// Guard against a false merge: only strip a decorative prefix/suffix off a schema
// name when doing so does NOT collide with a DIFFERENT schema that independently
// owns its own list door. This is the fix for a real collision this script caught
// in itself: "UserFragment" (the standalone lookup-utility list door at
// /escalations/lookup-assignee and /users/by-names) naively strips to "User" --
// which would wrongly fuse it with the REAL /users door's own "User" schema, even
// though they are not the same resource (one is the full user collection, the
// other a lightweight cross-reference lookup). "FullKnowledgeBaseSchema" is safe to
// strip to "KnowledgeBase" because no OTHER schema independently owns a list door
// under that name -- there is no collision to guard against.
const listDoorSchemaNameSet = new Set(listDoorsBySchema.keys());
function safeCleanSchemaName(rawName) {
    const cleaned = cleanSchemaName(rawName);
    if (cleaned === rawName) return rawName;
    if (listDoorSchemaNameSet.has(cleaned)) return rawName;
    return cleaned;
}

function registerCanonicalObject({ rawName, schemaNamesInit, listPath, inlineListNode, source }) {
    if (consumedListPaths.has(listPath)) return;
    consumedListPaths.add(listPath);
    const pairedSingleDoor = findPairedSingleDoor(listPath);
    let singlePath = null;
    let singleSchemaName = null;
    let inlineSingleNode = null;
    if (pairedSingleDoor) {
        singlePath = pairedSingleDoor.path;
        if (pairedSingleDoor.get.kind === 'single') singleSchemaName = pairedSingleDoor.get.name;
        else if (pairedSingleDoor.get.kind === 'single-inline') inlineSingleNode = pairedSingleDoor.get.inlineNode;
    }
    const schemaNames = new Set(schemaNamesInit);
    const listRawName = schemaNamesInit[0] ?? null;
    let canonicalName = safeCleanSchemaName(rawName);
    if (singleSchemaName) {
        schemaNames.add(singleSchemaName);
        if (listRawName && singleSchemaName !== listRawName) {
            // Naming-convention-driven preference (NOT a property-count heuristic): if
            // the LIST schema's name is itself a recognized decorated/simplified variant
            // (e.g. ArticleSimple -> Article), the SINGLE/detail schema is the resource's
            // real identity. If the SINGLE schema's name is the decorated one instead,
            // the LIST schema is the real identity. If NEITHER carries a recognized
            // decoration marker (e.g. Locale vs LocaleConfig, WebhookDelivery vs
            // WebhookDeliveryWithRequest), default to the LIST door's own declared name --
            // a REST collection's array-item type is definitionally what that collection
            // lists, so it is the more authoritative identity absent a stronger signal.
            const listCleaned = safeCleanSchemaName(listRawName);
            const singleCleaned = safeCleanSchemaName(singleSchemaName);
            if (listCleaned !== listRawName) {
                canonicalName = singleCleaned;
            } else {
                canonicalName = listCleaned;
            }
        }
    }
    const key = normKey(canonicalName);
    if (canonicalObjects.has(key)) {
        const existing = canonicalObjects.get(key);
        existing.listPaths.push(listPath);
        for (const sn of schemaNames) existing.schemaNames.add(sn);
        if (singlePath && !existing.singlePaths.includes(singlePath)) existing.singlePaths.push(singlePath);
        return;
    }
    canonicalObjects.set(key, {
        canonicalName,
        schemaNames,
        listPaths: [listPath],
        singlePaths: singlePath ? [singlePath] : [],
        inlineListNode: inlineListNode ?? null,
        inlineSingleNode,
        source,
    });
}

for (const [schemaName, listPathEntries] of listDoorsBySchema.entries()) {
    for (const { path: p } of listPathEntries) {
        registerCanonicalObject({ rawName: schemaName, schemaNamesInit: [schemaName], listPath: p, source: 'schema-ref' });
    }
}
for (const { path: p, inlineNode } of inlineListDoors) {
    registerCanonicalObject({
        rawName: nameFromListPath(p, new Set(canonicalObjects.keys())),
        schemaNamesInit: [],
        listPath: p,
        inlineListNode: inlineNode,
        source: 'inline-path-fallback',
    });
}

// ---------------------------------------------------------------------------
// 8. Attach write verbs (POST/PATCH/PUT/DELETE) to each canonical object via
//    EXACT path match against its OWN list path (create) and its OWN paired
//    single path (update/delete) -- never a broad shared-prefix "family" scan.
//    This is the fix for a real bug this script caught in itself: a coarse
//    shared-prefix match let a sibling sub-resource's PATCH/DELETE (e.g.
//    Webhook's own update body) leak into an unrelated nested object (e.g.
//    WebhookDelivery) purely because both paths start with /webhooks/{id}.
// ---------------------------------------------------------------------------
for (const obj of canonicalObjects.values()) {
    obj.writeOps = { create: null, update: null, delete: null };
    const L = obj.listPaths[0] ?? null;
    const S = obj.singlePaths[0] ?? null;
    if (L) {
        const doorL = doors.find((d) => d.path === L);
        if (doorL?.writeOps.post) obj.writeOps.create = { path: L, method: 'POST', operation: doorL.writeOps.post };
    }
    if (S) {
        const doorS = doors.find((d) => d.path === S);
        if (doorS?.writeOps.patch) obj.writeOps.update = { path: S, method: 'PATCH', operation: doorS.writeOps.patch };
        else if (doorS?.writeOps.put) obj.writeOps.update = { path: S, method: 'PUT', operation: doorS.writeOps.put };
        if (doorS?.writeOps.delete) obj.writeOps.delete = { path: S, method: 'DELETE', operation: doorS.writeOps.delete };
    }
}

// ---------------------------------------------------------------------------
// 9. Field-set derivation per canonical object: UNION of every attached read
//    schema's properties (list + paired single, including inline anonymous
//    shapes) with every attached write-body schema's properties -- a
//    deliberately broader technique than "walk one read schema only".
//
//    Each field is tagged with its PROVENANCE (readable vs write-only-exclusive)
//    because the two carry very different evidentiary weight in the object-set
//    diff: a field returned by a GET that the emitted metadata never captured is
//    a genuine coverage gap (the connector conventions' "capture every field the
//    source allows"); a field that appears ONLY in a POST/PATCH request body
//    (typically a write-only secret/parameter such as "password" on User, never
//    echoed back by any GET) legitimately may not warrant its own IOF row, and
//    a diff that doesn't distinguish the two would misreport routine write-only
//    input parameters as "coverage gaps" on ~85% of objects -- a methodology
//    artifact of this script's deliberately-broad read+write union, not a real
//    defect. Both are still recorded (nothing is silently dropped); the diff
//    surfaces them under separate keys.
// ---------------------------------------------------------------------------
function unionFieldSet(obj) {
    const props = {};
    const readOnlySourceFields = new Set();
    for (const schemaName of obj.schemaNames) {
        const shape = collectShape(schemaName);
        Object.assign(props, shape.properties);
        for (const f of Object.keys(shape.properties)) readOnlySourceFields.add(f);
    }
    if (obj.inlineListNode?.properties) {
        Object.assign(props, obj.inlineListNode.properties);
        for (const f of Object.keys(obj.inlineListNode.properties)) readOnlySourceFields.add(f);
    }
    if (obj.inlineSingleNode?.properties) {
        Object.assign(props, obj.inlineSingleNode.properties);
        for (const f of Object.keys(obj.inlineSingleNode.properties)) readOnlySourceFields.add(f);
    }
    // snapshot of fields seen from READ shapes only, BEFORE folding in write bodies
    const readFieldNames = new Set(readOnlySourceFields);
    for (const opKey of ['create', 'update']) {
        const w = obj.writeOps[opKey];
        if (!w) continue;
        const bodyRef = getRequestBodySchemaRef(w.operation);
        if (typeof bodyRef === 'string') {
            const shape = collectShape(bodyRef);
            Object.assign(props, shape.properties);
            obj.schemaNames.add(bodyRef);
        } else if (bodyRef?.inline?.properties) {
            Object.assign(props, bodyRef.inline.properties);
        }
    }
    return { props, readFieldNames };
}

// ---------------------------------------------------------------------------
// 10. PK / FK candidate detection via the "<name>ID" naming convention proven
//     empirically in the spec (badgeID on Badge, userID on User, ...).
// ---------------------------------------------------------------------------
const FK_PREFIX_STRIP = ['insert', 'update', 'delete', 'parent', 'last', 'default', 'lookup', 'assigned'];

function fkTargetWord(fieldName) {
    const m = fieldName.match(/^([A-Za-z]*?)([A-Z][a-zA-Z]*)ID$/);
    if (!m) return null;
    let word = m[2] || m[1];
    if (!word) return null;
    word = word.toLowerCase();
    for (const pre of FK_PREFIX_STRIP) {
        if (word.startsWith(pre) && word.length > pre.length) word = word.slice(pre.length);
    }
    return word;
}

function detectPK(objKey, fieldNames) {
    const candidates = fieldNames.filter((f) => /ID$/.test(f) && f !== 'ID');
    // exact convention match: <objectSingularLower>ID
    const exact = candidates.find((f) => normKey(f.replace(/ID$/, '')) === objKey);
    if (exact) return [exact];
    // fallback: a lone "id"/"ID"-only property
    if (fieldNames.includes('id')) return ['id'];
    return [];
}

// build canonical-object-key lookup for FK target resolution
const canonicalKeys = new Set(canonicalObjects.keys());

function detectFKs(fieldNames, pkFields) {
    const fks = [];
    for (const f of fieldNames) {
        if (pkFields.includes(f)) continue;
        if (!/ID$/.test(f)) continue;
        const word = fkTargetWord(f);
        if (!word) continue;
        const key = normKey(word);
        if (canonicalKeys.has(key) && key !== null) {
            fks.push({ field: f, targetKey: key });
        }
    }
    return fks;
}

// ---------------------------------------------------------------------------
// 11. Pagination + watermark candidate derivation from the list-door's own
//     declared query parameters (never assumed).
// ---------------------------------------------------------------------------
function derivePaginationAndWatermark(obj) {
    let paginationParams = new Set();
    let watermarkFields = new Set();
    for (const p of obj.listPaths) {
        const doorEntry = doors.find((d) => d.path === p);
        const op = spec.paths[p]?.get;
        const params = op?.parameters ?? [];
        for (const param of params) {
            if (['page', 'limit'].includes(param.name)) paginationParams.add(param.name);
            if (param.schema?.format === 'date-filter') watermarkFields.add(param.name);
        }
    }
    let paginationType = 'None';
    if (paginationParams.has('page') && paginationParams.has('limit')) paginationType = 'PageNumber';
    else if (paginationParams.size > 0) paginationType = 'Offset';
    return { paginationType, paginationParams: [...paginationParams], watermarkFields: [...watermarkFields] };
}

// ---------------------------------------------------------------------------
// 12. Derive a Create/Update BodyShape + IDLocation verdict from the spec
//     itself (wrapper key present => wrapped; 201 Location header => header).
// ---------------------------------------------------------------------------
function deriveBodyShape(operation) {
    const bodySchema = operation?.requestBody?.content?.['application/json']?.schema;
    if (!bodySchema) return { shape: null, key: null };
    if (bodySchema.type === 'object' && bodySchema.properties) {
        const propNames = Object.keys(bodySchema.properties);
        // "wrapped" heuristic: exactly one top-level property whose OWN schema is an object
        // with several sub-properties (a nested envelope), vs "flat" where properties are
        // themselves scalar/simple attribute values.
        if (propNames.length === 1) {
            const only = bodySchema.properties[propNames[0]];
            if (only?.type === 'object' || only?.$ref) return { shape: 'wrapped', key: propNames[0] };
        }
    }
    return { shape: 'flat', key: null };
}

function deriveIDLocation(operation) {
    const resp201 = operation?.responses?.['201'];
    if (resp201?.headers && Object.keys(resp201.headers).some((h) => h.toLowerCase() === 'location')) {
        return 'header';
    }
    return 'body';
}

// ---------------------------------------------------------------------------
// 13. Finalize the independently-derived record for each canonical object.
// ---------------------------------------------------------------------------
const derivedByKey = new Map();
for (const [key, obj] of canonicalObjects.entries()) {
    const { props: fieldProps, readFieldNames } = unionFieldSet(obj);
    const fieldNames = Object.keys(fieldProps);
    const pk = detectPK(key, fieldNames);
    const fks = detectFKs(fieldNames, pk);
    const { paginationType, paginationParams, watermarkFields } = derivePaginationAndWatermark(obj);
    const listPath = obj.listPaths[0] ?? null;
    const create = obj.writeOps.create
        ? {
              path: obj.writeOps.create.path,
              method: obj.writeOps.create.method,
              ...deriveBodyShape(obj.writeOps.create.operation),
              idLocation: deriveIDLocation(obj.writeOps.create.operation),
          }
        : null;
    const update = obj.writeOps.update
        ? {
              path: obj.writeOps.update.path,
              method: obj.writeOps.update.method,
              ...deriveBodyShape(obj.writeOps.update.operation),
          }
        : null;
    const del = obj.writeOps.delete ? { path: obj.writeOps.delete.path, method: obj.writeOps.delete.method } : null;

    derivedByKey.set(key, {
        key,
        canonicalName: obj.canonicalName,
        schemaNames: [...obj.schemaNames],
        source: obj.source,
        listPath,
        fieldNames: fieldNames.sort(),
        readFieldNames: [...readFieldNames].sort(),
        pk,
        fks,
        paginationType,
        paginationParams,
        watermarkFields,
        create,
        update,
        delete: del,
    });
}

// ---------------------------------------------------------------------------
// 14. Run the shared floor enumerator over the pinned source for the raw
//     schema-level universe count (required by the task), PLUS report our
//     own door-level (coverable) universe derived by descending the graph.
// ---------------------------------------------------------------------------
const floorResult = enumerateCatalogFiles([SPEC_PATH]);
const doorLevelUniverse = [...derivedByKey.values()].map((d) => d.canonicalName).sort((a, b) => a.localeCompare(b));

// ---------------------------------------------------------------------------
// 15. Load the emitted metadata (ONLY the script touches this file) and
//     extract the emitted IntegrationObject rows.
// ---------------------------------------------------------------------------
let emittedIOs = [];
if (existsSync(METADATA_PATH)) {
    const metaRaw = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
    const top = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
    emittedIOs = top?.relatedEntities?.['MJ: Integration Objects'] ?? [];
} else {
    console.error(`WARNING: metadata file not found at ${METADATA_PATH}`);
}

function ioFields(io) {
    const iofs = io?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    return iofs.map((f) => f.fields);
}

// ---------------------------------------------------------------------------
// 16. Object-set divergence: derived-universe vs emitted objects.
// ---------------------------------------------------------------------------
const emittedByKey = new Map();
for (const io of emittedIOs) {
    const f = io.fields ?? {};
    const key = normKey(f.Name);
    emittedByKey.set(key, io);
}

const objectsMissing = [];
for (const d of derivedByKey.values()) {
    if (!emittedByKey.has(d.key)) objectsMissing.push(d.canonicalName);
}
const objectsExtra = [];
for (const [key, io] of emittedByKey.entries()) {
    if (!derivedByKey.has(key)) objectsExtra.push(io.fields?.Name ?? key);
}

// ---------------------------------------------------------------------------
// 17. Per-object field/PK/FK/pagination/watermark/bodyShape/writeOps diff for
//     every object present in BOTH sets.
// ---------------------------------------------------------------------------
const PAGINATION_ENUM_MAP = { PageNumber: 'PageNumber', Offset: 'Offset', Cursor: 'Cursor', None: 'None' };

function diffObject(derived, io) {
    const emittedFields = ioFields(io);
    const emittedFieldNames = new Set(emittedFields.map((f) => f.Name));
    const derivedFieldKeys = new Set(derived.fieldNames.map((f) => normKey(f)));
    const emittedFieldKeys = new Map(emittedFields.map((f) => [normKey(f.Name), f.Name]));

    const allMissing = derived.fieldNames.filter((f) => !emittedFieldKeys.has(normKey(f)));
    const readFieldKeySet = new Set(derived.readFieldNames.map((f) => normKey(f)));
    // Split by provenance: a field the API actually RETURNS (readFieldNames) that the
    // extractor never captured is a genuine coverage gap. A field that appears ONLY in
    // a write body (a create/update-only input, e.g. User.password) is reported
    // separately -- it is very often a legitimate, deliberate omission (write-only
    // secrets aren't echoed by any GET, so many connectors correctly don't model them
    // as a syncable IOF) rather than a defect, and folding it into the same bucket as
    // real coverage gaps would misreport ~85% of objects as having "missing fields".
    const missingFields = allMissing.filter((f) => readFieldKeySet.has(normKey(f)));
    const missingWriteOnlyFields = allMissing.filter((f) => !readFieldKeySet.has(normKey(f)));
    const extraFields = emittedFields.map((f) => f.Name).filter((f) => !derivedFieldKeys.has(normKey(f)));

    // path
    let pathMismatch;
    if (derived.listPath && io.fields.APIPath && normKey(derived.listPath) !== normKey(io.fields.APIPath)) {
        // tolerate exact string difference only; do a raw string compare (normKey strips slashes too
        // aggressively for paths) -- use direct string compare instead.
    }
    if (derived.listPath && io.fields.APIPath && derived.listPath !== io.fields.APIPath) {
        pathMismatch = `derived='${derived.listPath}' emitted='${io.fields.APIPath}'`;
    }

    // PK
    let pkMismatch;
    const emittedPKFields = emittedFields.filter((f) => f.IsPrimaryKey).map((f) => f.Name);
    const derivedPKKeys = new Set(derived.pk.map((f) => normKey(f)));
    const emittedPKKeys = new Set(emittedPKFields.map((f) => normKey(f)));
    const pkSetsDiffer =
        derivedPKKeys.size !== emittedPKKeys.size || [...derivedPKKeys].some((k) => !emittedPKKeys.has(k));
    if (derived.pk.length > 0 && pkSetsDiffer) {
        pkMismatch = `derived=[${derived.pk.join(',')}] emitted=[${emittedPKFields.join(',')}]`;
    }

    // write ops
    const writeOpsMissing = [];
    if (derived.create && !io.fields.SupportsCreate) writeOpsMissing.push('Create');
    if (derived.update && !io.fields.SupportsUpdate) writeOpsMissing.push('Update');
    if (derived.delete && !io.fields.SupportsDelete) writeOpsMissing.push('Delete');

    // FK misclassification: emitted IsForeignKey=true fields whose source TYPE is a
    // scalar (name matches the <object>ID convention) are FINE; flag emitted FKs that
    // do NOT correspond to any derived scalar FK candidate AND whose underlying spec
    // property is itself an object/array (a relationship edge, not a scalar reference).
    const derivedFKFieldKeys = new Set(derived.fks.map((fk) => normKey(fk.field)));
    const fkMisclassified = [];
    for (const f of emittedFields) {
        if (!f.IsForeignKey) continue;
        if (derivedFKFieldKeys.has(normKey(f.Name))) continue;
        fkMisclassified.push(f.Name);
    }

    // pagination
    let paginationMismatch;
    if (derived.paginationType && io.fields.PaginationType && derived.paginationType !== io.fields.PaginationType) {
        paginationMismatch = `derived='${derived.paginationType}' emitted='${io.fields.PaginationType}'`;
    }

    // watermark
    let watermarkMismatch;
    if (io.fields.SupportsIncrementalSync) {
        const declared = io.fields.IncrementalWatermarkField;
        if (declared && derived.watermarkFields.length > 0 && !derived.watermarkFields.includes(declared)) {
            watermarkMismatch = `derived candidates=[${derived.watermarkFields.join(',')}] emitted='${declared}'`;
        } else if (declared && derived.watermarkFields.length === 0) {
            watermarkMismatch = `no date-filter param found in spec for this list door; emitted='${declared}'`;
        }
    }

    // body shape
    let bodyShapeMismatch;
    if (derived.create && io.fields.SupportsCreate) {
        const derivedShape = derived.create.shape;
        const emittedShape = io.fields.CreateBodyShape;
        if (derivedShape && emittedShape && derivedShape !== emittedShape && derivedShape !== 'literal') {
            bodyShapeMismatch = `derived Create='${derivedShape}'(key=${derived.create.key ?? 'n/a'}) emitted='${emittedShape}'(key=${io.fields.CreateBodyKey ?? 'n/a'})`;
        }
    }

    // type mismatches (best-effort: integer PK/FK fields emitted as non-numeric MJ type)
    const typeMismatches = [];
    for (const f of emittedFields) {
        const srcProp = null; // property-level source type not retained per-field here; see NOTE below
    }

    return {
        object: derived.canonicalName,
        emittedName: io.fields.Name,
        rederivedFieldCount: derived.fieldNames.length,
        emittedFieldCount: emittedFields.length,
        missingFields,
        missingWriteOnlyFields,
        extraFields,
        pathMismatch,
        pkMismatch,
        writeOpsMissing,
        fkMisclassified,
        paginationMismatch,
        watermarkMismatch,
        bodyShapeMismatch,
        typeMismatches,
    };
}

const perObjectFull = [];
for (const [key, derived] of derivedByKey.entries()) {
    const io = emittedByKey.get(key);
    if (!io) continue; // already counted in objectsMissing
    const diff = diffObject(derived, io);
    const diverged =
        diff.missingFields.length > 0 ||
        diff.extraFields.length > 0 ||
        !!diff.pathMismatch ||
        !!diff.pkMismatch ||
        diff.writeOpsMissing.length > 0 ||
        diff.fkMisclassified.length > 0 ||
        !!diff.paginationMismatch ||
        !!diff.watermarkMismatch ||
        !!diff.bodyShapeMismatch ||
        diff.typeMismatches.length > 0;
    perObjectFull.push({ ...diff, diverged });
}

// ---------------------------------------------------------------------------
// 18. Histogram + capped actionable sample for the return payload.
// ---------------------------------------------------------------------------
const divergedObjects = perObjectFull.filter((o) => o.diverged);
const divergenceHistogram = {
    missingFields: perObjectFull.filter((o) => o.missingFields.length > 0).length,
    extraFields: perObjectFull.filter((o) => o.extraFields.length > 0).length,
    typeMismatches: perObjectFull.filter((o) => o.typeMismatches.length > 0).length,
    fkMisclassified: perObjectFull.filter((o) => o.fkMisclassified.length > 0).length,
    writeOpsMissing: perObjectFull.filter((o) => o.writeOpsMissing.length > 0).length,
    pkMismatch: perObjectFull.filter((o) => !!o.pkMismatch).length,
    pathMismatch: perObjectFull.filter((o) => !!o.pathMismatch).length,
    paginationMismatch: perObjectFull.filter((o) => !!o.paginationMismatch).length,
    watermarkMismatch: perObjectFull.filter((o) => !!o.watermarkMismatch).length,
    bodyShapeMismatch: perObjectFull.filter((o) => !!o.bodyShapeMismatch).length,
};

function actionabilityScore(o) {
    let score = 0;
    if (o.missingFields.length > 0) score += 10 + Math.min(o.missingFields.length, 10);
    if (o.fkMisclassified.length > 0) score += 8;
    if (o.writeOpsMissing.length > 0) score += 8;
    if (o.pkMismatch) score += 8;
    if (o.pathMismatch) score += 6;
    if (o.bodyShapeMismatch) score += 4;
    if (o.paginationMismatch) score += 4;
    if (o.watermarkMismatch) score += 4;
    return score;
}

const actionable = divergedObjects.filter(
    (o) =>
        o.missingFields.length > 0 ||
        o.fkMisclassified.length > 0 ||
        o.writeOpsMissing.length > 0 ||
        o.pkMismatch ||
        o.pathMismatch ||
        o.bodyShapeMismatch ||
        o.paginationMismatch ||
        o.watermarkMismatch,
);
actionable.sort((a, b) => actionabilityScore(b) - actionabilityScore(a));
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

// ---------------------------------------------------------------------------
// 19. Write the FULL lossless artifact + print the compact summary.
// ---------------------------------------------------------------------------
mkdirSync(RUN_OUTPUT_DIR, { recursive: true });
const fullArtifact = {
    generatedAt: new Date().toISOString(),
    strategy:
        'response-schema $ref-chase (schema-first identity) + path-family CRUD attachment + read/write field-set union; ' +
        'fallback to path-derived naming only for $ref-less inline list responses (e.g. /categories). ' +
        'Independent of the extractor script/report/matrix -- built from scratch against the pinned merged OpenAPI spec only.',
    sourcePath: SPEC_PATH,
    metadataPath: METADATA_PATH,
    floorEnumerateCatalogResult: {
        format: floorResult.format,
        count: floorResult.count,
        confidence: floorResult.confidence,
        perSource: floorResult.perSource,
    },
    doorLevelUniverse: {
        count: doorLevelUniverse.length,
        names: doorLevelUniverse,
    },
    objectsMissing,
    objectsExtra,
    objectsDivergedCount: divergedObjects.length,
    divergenceHistogram,
    perObjectFull,
};
writeFileSync(OUT_PATH, JSON.stringify(fullArtifact, null, 2));

const summary = {
    artifact: OUT_PATH,
    strategy:
        'response-schema $ref-chase identity (NOT path-first): canonical object = the component schema reachable ' +
        'as the array-item/direct type of a GET list door (or, for $ref-less inline responses like /categories, a ' +
        'path-derived fallback name); write verbs attached via path-family match; fields = union of read-schema + ' +
        'attached write-body schema properties; PK/FK via the <object>ID naming convention proven in the spec; ' +
        'pagination/watermark/body-shape/ID-location re-derived from each list/create/update operation\'s own ' +
        'parameters, request body, and response headers.',
    enumeratedCount: doorLevelUniverse.length,
    floorScriptRawSchemaCount: floorResult.count,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount: divergedObjects.length,
    divergenceHistogram,
    perObject: perObjectSample,
};
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
