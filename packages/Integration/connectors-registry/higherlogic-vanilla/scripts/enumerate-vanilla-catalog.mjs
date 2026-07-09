#!/usr/bin/env node
// enumerate-vanilla-catalog.mjs — DETERMINISTIC object-catalog enumerator for the Higher Logic
// Vanilla API v2 OpenAPI v3 spec captured live (unauthenticated) from open.vanillaforums.com.
//
// Rule (source-auditor discipline): the object universe is COMPUTED by walking the saved raw
// source file in code, never hand-typed from an in-context read. This script is that walk.
//
// Method:
//   1. Group all `paths` by their top-level path segment (the "door", e.g. /discussions).
//   2. For each door, scan every path+method under it for: a LIST GET (200 response is an
//      array — via bare items.$ref, items.allOf, an inline object schema, or a `{data:[...]}`
//      envelope), a single-GET, a CREATE POST, an UPDATE PATCH/PUT, a DELETE.
//   3. Resolve the primary record schema's declared PK (a `<name>ID`/`<name>UUID` property, or a
//      documented string business-key such as `apiName`) and scalar FK properties (`<x>ID`
//      properties that are not the PK and resolve to a sibling object by stripping the ID suffix).
//   4. Merge doors that resolve to the IDENTICAL primary schema (vendor path quirks — e.g. the
//      singular `/product-message/{id}` vs plural `/product-messages` list — are the SAME record
//      type reached by two path prefixes) — this is a documented "container-folded" merge, not a
//      dropped object.
//   5. Classify each surviving unit as COVERABLE (an independently addressable record set with a
//      resolvable identity field) or INFORMATIONAL/UTILITY (pure action/search/config endpoints,
//      or endpoints whose "list" is a virtual union over already-coverable objects).
//
// Usage: node enumerate-vanilla-catalog.mjs <path-to-openapi.v3.json>
// Output: JSON to stdout — { doors, coverable, informational, counts }

import { readFileSync } from 'node:fs';

const specPath = process.argv[2];
if (!specPath) {
    process.stderr.write('usage: node enumerate-vanilla-catalog.mjs <openapi.v3.json>\n');
    process.exit(2);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const schemas = spec.components?.schemas ?? {};
const paramDefs = spec.components?.parameters ?? {};

function resolveParamName(p) {
    if (p.name) return p.name;
    if (p['$ref']) {
        const rn = p['$ref'].split('/').pop();
        return paramDefs[rn]?.name ?? rn;
    }
    return null;
}
function refName(ref) { return ref ? ref.split('/').pop() : null; }

// Resolve a schema node (possibly $ref/allOf/inline) to a flattened {props, required, refName}.
function resolveSchemaNode(node) {
    if (!node) return { props: {}, required: [], refName: null };
    if (node['$ref']) {
        const rn = refName(node['$ref']);
        const target = schemas[rn];
        const flat = flattenNamed(target);
        return { ...flat, refName: rn };
    }
    if (node.allOf) {
        let props = {}, required = [];
        let firstRef = null;
        for (const part of node.allOf) {
            const r = resolveSchemaNode(part);
            props = { ...props, ...r.props };
            required = [...required, ...r.required];
            if (!firstRef && r.refName) firstRef = r.refName;
        }
        return { props, required, refName: firstRef };
    }
    // `oneOf` (polymorphic variants, e.g. UserNote = BasicUserNote | UserWarning): union every
    // member's fields so PK/FK detection sees the full field surface across variants — this is a
    // real record family reached by ONE door, not a virtual cross-door aggregation like /posts.
    if (node.oneOf) {
        // An INLINE (unwrapped) oneOf has no single owning schema name — e.g. /posts' item is
        // `oneOf: [Discussion, Comment]` directly, and each member already has its OWN independent
        // door/schema. Returning one member's name here would wrongly merge two distinct doors
        // (the Discussion/Posts bug this comment replaces). Union the fields for shape-inspection
        // but deliberately report refName:null — a `$ref`-wrapped oneOf (e.g. UserNote, whose
        // members are ONLY reachable through this one door) still gets its name from the `$ref`
        // branch above, which runs BEFORE this branch and is unaffected.
        let props = {};
        for (const part of node.oneOf) {
            const r = resolveSchemaNode(part);
            props = { ...props, ...r.props };
        }
        return { props, required: [], refName: null };
    }
    if (node.properties) return { props: node.properties, required: node.required ?? [], refName: null };
    return { props: {}, required: [], refName: null };
}
function flattenNamed(schema) {
    if (!schema) return { props: {}, required: [] };
    if (schema.properties) return { props: schema.properties, required: schema.required ?? [] };
    if (schema.allOf) {
        let props = {}, required = [];
        for (const part of schema.allOf) {
            const r = resolveSchemaNode(part);
            props = { ...props, ...r.props };
            required = [...required, ...r.required];
        }
        return { props, required };
    }
    if (schema.oneOf) {
        let props = {};
        for (const part of schema.oneOf) {
            const r = resolveSchemaNode(part);
            props = { ...props, ...r.props };
        }
        return { props, required: [] };
    }
    return { props: {}, required: [] };
}

// Classify a response-body schema node → { kind: 'array'|'object'|'none', itemNode, dataKey }
function classifyResponseSchema(schemaNode) {
    if (!schemaNode) return { kind: 'none' };
    // Some vendor-published operations omit the `type: array` marker but still carry `items` (a
    // spec-authoring omission, e.g. GET /events) — treat presence of `.items` alone as sufficient
    // array evidence rather than requiring the explicit `type` tag too.
    if (schemaNode.items) {
        return { kind: 'array', itemNode: schemaNode.items, dataKey: null };
    }
    if (schemaNode['$ref']) {
        const rn = refName(schemaNode['$ref']);
        return { kind: 'object', itemNode: schemaNode, refName: rn };
    }
    if (schemaNode.allOf) {
        return { kind: 'object', itemNode: schemaNode };
    }
    // `{ type: object, properties: { data: { type: array, items: ... } } }` envelope
    if (schemaNode.type === 'object' && schemaNode.properties?.data?.type === 'array') {
        return { kind: 'array', itemNode: schemaNode.properties.data.items, dataKey: 'data' };
    }
    return { kind: 'other' };
}
function getResponseSchemaClass(op) {
    if (!op || !op.responses) return null;
    for (const code of ['200', '201', '202']) {
        const content = op.responses[code]?.content?.['application/json']?.schema;
        if (content) return classifyResponseSchema(content);
    }
    return null;
}

const allPaths = Object.keys(spec.paths);
const doorsMap = new Map();
for (const p of allPaths) {
    const seg = p.split('/').filter(Boolean)[0];
    if (!doorsMap.has(seg)) doorsMap.set(seg, []);
    doorsMap.get(seg).push(p);
}

function isSingleItemDirectPath(door, p) {
    const rest = p.slice(door.length + 2);
    const segs = rest.split('/');
    const firstSeg = segs[0] ?? '';
    const isParam = /^[{:]/.test(firstSeg);
    return isParam && segs.length === 1;
}

function extractPathParamName(door, p) {
    const rest = p.slice(door.length + 2);
    const firstSeg = (rest.split('/')[0] ?? '').replace(/^[{:]/, '').replace(/[}]$/, '');
    return firstSeg || null;
}

function singularize(s) {
    return s.replace(/ies$/i, 'y').replace(/(ss)$/i, '$1').replace(/s$/i, '').replace(/-/g, '');
}

const ID_RE = /^([a-zA-Z]+)(ID|UUID)$/;
// NOTE: `(ID|UUID)$` greedy-backtracking always finds the 2-char "ID" suffix before ever trying
// the 4-char "UUID" suffix (regex backtracks group1 one character at a time, so "mediaUUID" splits
// as "mediaUU"+"ID" rather than "media"+"UUID") — alternation order does not fix this. Resolve the
// suffix explicitly, longest-first, by string test rather than a single greedy-backtracked regex.
function fkTargetFromFieldName(fieldName) {
    let base = null;
    if (/UUID$/.test(fieldName)) base = fieldName.slice(0, -4);
    else if (/ID$/.test(fieldName)) base = fieldName.slice(0, -2);
    else return null;
    if (!base) return null;
    if (/^(insert|update|last|dismiss|bookmark|participated|assignee|approve|reject|spoof)?[Uu]ser$/.test(base)) return 'User';
    return base.charAt(0).toUpperCase() + base.slice(1);
}
// Known actor/FK-shaped ID fields that must NEVER be picked as a resource's own PK by fallback.
const ACTOR_ID_RE = /^(insert|update|last|dismiss|bookmark|participated|assignee|assigned|approve|reject|spoof|lastComment)[A-Z]\w*(User)?ID$/;

function findPKField(props, required, doorSingular, pathParamName) {
    const names = Object.keys(props);
    const idish = names.filter((n) => ID_RE.test(n));
    // Tier-1 signal: the OpenAPI path parameter name on the GetById/{id}/PATCH/DELETE path IS the
    // vendor's own declared identifier for this resource (extractor-conventions "OpenAPI GetById
    // path parameter == field"). Trust it outright when it's a real, non-generic, declared field —
    // this is what correctly resolves ReactionType->urlCode and Escalation->escalationID even when
    // the response schema itself omits/deprioritizes that property.
    if (pathParamName && pathParamName.toLowerCase() !== 'id' && names.includes(pathParamName)) {
        return pathParamName;
    }
    // name-match against the door's singular resource name — regardless of `required` — beats a
    // `required`-only fallback (fixes cases like emailTemplatesID being non-required while a
    // required-but-unrelated actor FK like insertUserID would otherwise win by accident).
    let pk = idish.find((n) => n.toLowerCase().startsWith(doorSingular.toLowerCase()) && !ACTOR_ID_RE.test(n));
    if (pk) return pk;
    if (pathParamName && names.includes(pathParamName)) return pathParamName; // generic {id} param that IS a real field
    // a required id-ish field that is not a known actor/FK shape
    pk = idish.find((n) => required.includes(n) && !ACTOR_ID_RE.test(n));
    if (pk) return pk;
    // documented string business-keys (non "...ID" shaped PKs)
    const stringKeyCandidates = ['apiName', 'urlCode', 'accessToken'];
    pk = stringKeyCandidates.find((n) => names.includes(n));
    if (pk) return pk;
    // last resort: any non-actor id-ish field, else any id-ish field at all
    return idish.find((n) => !ACTOR_ID_RE.test(n)) ?? idish[0] ?? null;
}

const doors = [];
for (const [door, doorPaths] of doorsMap.entries()) {
    const bare = `/${door}`;
    const bareOps = spec.paths[bare] ?? null;

    let listCls = null, listPath = null, listParams = [];
    let singleRefInfo = null, singlePath = null;
    let createPath = null, createMethod = null, createRefInfo = null;
    let updatePath = null, updateMethod = null;
    let deletePath = null, deleteMethod = null;

    if (bareOps?.get) {
        const cls = getResponseSchemaClass(bareOps.get);
        if (cls?.kind === 'array') { listCls = cls; listPath = bare; listParams = (bareOps.get.parameters ?? []).map(resolveParamName).filter(Boolean); }
    }
    if (bareOps?.post) {
        const cls = getResponseSchemaClass(bareOps.post);
        createPath = bare; createMethod = 'POST'; createRefInfo = cls;
    }
    if (!listCls) {
        for (const p of doorPaths) {
            const ops = spec.paths[p];
            if (ops?.get) {
                const cls = getResponseSchemaClass(ops.get);
                if (cls?.kind === 'array') { listCls = cls; listPath = p; listParams = (ops.get.parameters ?? []).map(resolveParamName).filter(Boolean); break; }
            }
        }
    }
    let pathParamName = null;
    for (const p of doorPaths) {
        if (!isSingleItemDirectPath(door, p)) continue;
        const ops = spec.paths[p];
        if (!pathParamName) pathParamName = extractPathParamName(door, p);
        if (ops.get && !singleRefInfo) { const cls = getResponseSchemaClass(ops.get); if (cls?.kind === 'object') { singleRefInfo = cls; singlePath = p; } }
        if (ops.patch && !updatePath) { updatePath = p; updateMethod = 'PATCH'; }
        if (ops.put && !updatePath) { updatePath = p; updateMethod = 'PUT'; }
        if (ops.delete && !deletePath) { deletePath = p; deleteMethod = 'DELETE'; }
    }

    // Resolve BOTH the list-item schema and the single-GET schema independently (a vendor
    // convention on this API: list endpoints often return a lighter named variant of the same
    // record — e.g. /articles returns items of `ArticleSimple` while /articles/{id} returns the
    // richer `Article`). Union their fields (never-shrink) and pick the SINGLE-GET's ref name as
    // the canonical unit name whenever it differs from the list's — the single-record endpoint is
    // the authoritative full-record shape; the list's name is frequently a lighter/legacy alias.
    const listResolved = listCls?.itemNode ? resolveSchemaNode(listCls.itemNode) : null;
    const singleResolved = singleRefInfo?.itemNode ? resolveSchemaNode(singleRefInfo.itemNode) : null;
    const createResolved = createRefInfo?.itemNode ? resolveSchemaNode(createRefInfo.itemNode) : null;
    const resolved = {
        props: { ...(listResolved?.props ?? {}), ...(singleResolved?.props ?? {}), ...(createResolved?.props ?? {}) },
        required: [...new Set([...(listResolved?.required ?? []), ...(singleResolved?.required ?? []), ...(createResolved?.required ?? [])])],
    };
    const primaryRef = singleResolved?.refName ?? listResolved?.refName ?? createResolved?.refName ?? null;

    doors.push({
        door, pathCount: doorPaths.length,
        listPath, listParams, listDataKey: listCls?.dataKey ?? null,
        singlePath, createPath, createMethod, updatePath, updateMethod, deletePath, deleteMethod,
        primaryRef, props: resolved.props, required: resolved.required, pathParamName,
        hasSchema: Object.keys(resolved.props).length > 0,
    });
}

// Merge doors resolving to an identical NAMED primaryRef (vendor singular/plural path-prefix quirks).
const byRef = new Map();
const unnamed = [];
for (const d of doors) {
    if (d.primaryRef) {
        if (!byRef.has(d.primaryRef)) byRef.set(d.primaryRef, []);
        byRef.get(d.primaryRef).push(d);
    } else {
        unnamed.push(d);
    }
}

const mergedUnits = [];
const containerFolds = [];
for (const [ref, group] of byRef.entries()) {
    if (group.length > 1) {
        containerFolds.push({ primaryRef: ref, foldedDoors: group.map((g) => g.door) });
    }
    // pick the richest (most fields / has list) as canonical, union path info
    const canonical = group.reduce((a, b) => (Object.keys(b.props).length > Object.keys(a.props).length ? b : a));
    const listOwner = group.find((g) => g.listPath) ?? canonical;
    const createOwner = group.find((g) => g.createPath) ?? canonical;
    const updateOwner = group.find((g) => g.updatePath) ?? canonical;
    const deleteOwner = group.find((g) => g.deletePath) ?? canonical;
    const pathParamOwner = group.find((g) => g.pathParamName) ?? canonical;
    mergedUnits.push({
        unitName: ref,
        doors: group.map((g) => g.door),
        listPath: listOwner.listPath, listParams: listOwner.listParams, listDataKey: listOwner.listDataKey,
        createPath: createOwner.createPath, createMethod: createOwner.createMethod,
        updatePath: updateOwner.updatePath, updateMethod: updateOwner.updateMethod,
        deletePath: deleteOwner.deletePath, deleteMethod: deleteOwner.deleteMethod,
        props: canonical.props, required: canonical.required, pathParamName: pathParamOwner.pathParamName ?? null,
    });
}
for (const d of unnamed) {
    mergedUnits.push({
        unitName: null, doors: [d.door],
        listPath: d.listPath, listParams: d.listParams, listDataKey: d.listDataKey,
        createPath: d.createPath, createMethod: d.createMethod,
        updatePath: d.updatePath, updateMethod: d.updateMethod,
        deletePath: d.deletePath, deleteMethod: d.deleteMethod,
        props: d.props, required: d.required, pathParamName: d.pathParamName ?? null,
    });
}

// Doors whose "list" is a virtual/computed UNION or aggregation over other doors' own record
// schemas — informational: /posts is oneOf(Discussion,Comment); /search is a cross-object ranked
// result set (recordType+recordID pointing at whichever table actually owns the row).
const UNION_DOORS = new Set(['posts', 'search']);
// Fixed, GET-only, vendor-defined TYPE catalogs keyed by a type discriminator (recordType, etc.)
// rather than an independently-lifecycled instance identity — no create/update/delete, small closed
// enumeration (built-in record types), informational the same way AuthenticatorTypeInfo is.
const TYPE_CATALOG_DOORS = new Set(['resources']);

const coverable = [];
const informational = [];
for (const u of mergedUnits) {
    const doorLabel = u.doors[0];
    const doorSingular = singularize(u.unitName ?? doorLabel);
    const propNames = Object.keys(u.props);
    const hasSchema = propNames.length > 0;
    const isUnion = u.doors.some((d) => UNION_DOORS.has(d));
    const isTypeCatalog = u.doors.some((d) => TYPE_CATALOG_DOORS.has(d)) && !u.createPath;
    const pkField = hasSchema ? findPKField(u.props, u.required, doorSingular, u.pathParamName) : null;
    const fkFields = propNames
        .filter((n) => ID_RE.test(n) && n !== pkField)
        .map((n) => ({ field: n, target: fkTargetFromFieldName(n) }))
        .filter((x) => x.target);

    const canonicalName = u.unitName ?? (doorLabel.charAt(0).toUpperCase() + doorLabel.slice(1)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    const record = {
        name: canonicalName,
        doors: u.doors,
        pkField, fkFields,
        listPath: u.listPath, listParams: u.listParams, listDataKey: u.listDataKey,
        createPath: u.createPath, createMethod: u.createMethod,
        updatePath: u.updatePath, updateMethod: u.updateMethod,
        deletePath: u.deletePath, deleteMethod: u.deleteMethod,
        hasDateUpdated: propNames.includes('dateUpdated'),
        hasDateInserted: propNames.includes('dateInserted'),
        fieldCount: propNames.length,
    };

    if (isUnion) {
        informational.push({ name: canonicalName, doors: u.doors, reason: 'virtual union list over already-coverable sibling objects (oneOf), not an independent record type' });
    } else if (isTypeCatalog) {
        informational.push({ name: canonicalName, doors: u.doors, reason: 'fixed GET-only vendor type catalog keyed by a type discriminator, no create/update/delete — not an independently-lifecycled record set' });
    } else if (!hasSchema) {
        informational.push({ name: canonicalName, doors: u.doors, reason: 'pure action/utility endpoint — no record schema resolvable from any GET/POST response' });
    } else if (!pkField) {
        informational.push({ name: canonicalName, doors: u.doors, reason: 'schema resolvable but no independent identity field (ID/UUID/business-key) found — settings/preferences singleton or type catalog' });
    } else if (!u.listPath && !u.createPath) {
        informational.push({ name: canonicalName, doors: u.doors, reason: 'has an identity field but no list or create endpoint reachable — not an independently syncable collection' });
    } else {
        coverable.push(record);
    }
}

const out = {
    totalDoors: doors.length,
    totalPaths: allPaths.length,
    totalComponentSchemas: Object.keys(schemas).length,
    containerFolds,
    coverableCount: coverable.length,
    informationalCount: informational.length,
    coverable: coverable.sort((a, b) => a.name.localeCompare(b.name)),
    informational: informational.sort((a, b) => a.name.localeCompare(b.name)),
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
