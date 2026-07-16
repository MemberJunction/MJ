#!/usr/bin/env node
// scripts/dual-derive-v2-schema-stem.mjs
//
// DUAL INDEPENDENT DERIVATION (P8) for constant-contact — SECOND, INDEPENDENT parser.
//
// STRATEGY (deliberately DIFFERENT from a path/tag-first walk):
//   "$ref-chased response/request SCHEMA-IDENTITY clustering, ignoring the vendor's own
//   OpenAPI `tags`."
//
//   1. Fully resolve every operation's request-body and per-status response schemas by
//      chasing `$ref` pointers into `definitions` and flattening `allOf` compositions into
//      one property map (a real dereferencer, not a textual/path-name heuristic).
//   2. Cluster raw Swagger definition names into RESOURCE STEMS by stripping a curated
//      suffix vocabulary (PostRequest/PutRequest/Resource/Dto/Delete/Response/Input/...)
//      repeatedly — this collapses the ~3.6x DTO-variant multiplicity the vendor's spec
//      exhibits (ContactDto/ContactResource/ContactPostRequest/ContactPutRequest/
//      ContactCreateOrUpdateInput/ContactCreateOrUpdateResponse/ContactDelete -> "Contact")
//      down to one resource identity per stem — WITHOUT ever consulting `tags`.
//   3. Build the record-type universe from PATH STRUCTURE alone (collapse an item path
//      `/x/{id}` into its collection parent `/x` when the parent exists with operations;
//      otherwise the path stands alone) — again never reading `tags`.
//   4. Independently re-derive, from the resolved schemas, per emitted-object: field set,
//      PK candidate (path-param name == property name on the family's single-get op),
//      FK candidates + FK-misclassification (object/array-typed relations wrongly marked
//      IsForeignKey), pagination shape (`_links.next` cursor vs `limit`/`offset`/`page`),
//      incremental-watermark candidate (`updated_after`/`created_after`/`since`-shaped
//      query params), per-operation write-path presence, body shape (flat vs wrapped),
//      and create-ID location (body vs header `Location`).
//   5. Diff that independent re-derivation against what is ACTUALLY EMITTED in
//      metadata/integrations/constant-contact/.constant-contact.integration.json — the
//      metadata file is opened ONLY here, in this diff step.
//
// This script reads ONLY the pinned SOURCES.json + the raw OpenAPI artifact it points at.
// It does NOT read the extractor's script, its EXTRACTION_REPORT, its matrix, or any prior
// dual-derivation output.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CONNECTOR_DIR, '../../../..');
const RUN_ID = 'connector-constant-contact-1783806258859-0be0453e';
const RUN_OUTPUT_DIR = path.join(CONNECTOR_DIR, 'runs', RUN_ID, 'output');
const METADATA_PATH = path.join(
    REPO_ROOT,
    'metadata/integrations/constant-contact/.constant-contact.integration.json',
);

// ─────────────────────────────────────────────────────────────────────────────
// 0. Load pinned sources
// ─────────────────────────────────────────────────────────────────────────────
const sourcesJson = JSON.parse(readFileSync(path.join(CONNECTOR_DIR, 'SOURCES.json'), 'utf8'));
const openapiPath = path.join(CONNECTOR_DIR, 'sources/openapi.json');
const spec = JSON.parse(readFileSync(openapiPath, 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────
// 1. $ref resolver + allOf flattener (Swagger 2.0: refs are always `#/definitions/X`)
// ─────────────────────────────────────────────────────────────────────────────
const definitions = spec.definitions ?? {};

function refName(ref) {
    if (typeof ref !== 'string') return null;
    const m = ref.match(/^#\/definitions\/(.+)$/);
    return m ? m[1] : null;
}

// Resolve a schema node to { name, properties: Map<string, rawPropSchema>, required: Set<string> }
// `name` is the leaf definition name if the node (or its allOf head) came from a single $ref,
// else null (e.g. an inline array/object with no named definition).
function resolveSchema(node, seen = new Set()) {
    if (!node || typeof node !== 'object') return { name: null, properties: new Map(), required: new Set() };

    if (node.$ref) {
        const name = refName(node.$ref);
        if (!name || seen.has(name)) return { name: name ?? null, properties: new Map(), required: new Set() };
        const def = definitions[name];
        if (!def) return { name, properties: new Map(), required: new Set() };
        const inner = resolveSchema(def, new Set([...seen, name]));
        return { name, properties: inner.properties, required: inner.required };
    }

    if (Array.isArray(node.allOf)) {
        const properties = new Map();
        const required = new Set();
        let name = null;
        for (const sub of node.allOf) {
            const r = resolveSchema(sub, seen);
            if (r.name && !name) name = r.name;
            for (const [k, v] of r.properties) properties.set(k, v);
            for (const req of r.required) required.add(req);
        }
        return { name, properties, required };
    }

    const properties = new Map();
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    if (node.properties && typeof node.properties === 'object') {
        for (const [k, v] of Object.entries(node.properties)) properties.set(k, v);
    }
    return { name: null, properties, required };
}

// Resolve an "array of X" or "wrapper object containing exactly one array-of-X property"
// response shape -> { kind: 'array'|'object'|'wrapper', itemSchemaName, wrapperArrayProp }
function resolveResponseShape(schemaNode) {
    if (!schemaNode) return null;
    if (schemaNode.type === 'array') {
        const item = resolveSchema(schemaNode.items ?? {});
        return { kind: 'array', itemSchemaName: item.name, wrapperArrayProp: null, resolved: item };
    }
    const resolved = resolveSchema(schemaNode);
    // wrapper-collection pattern: exactly one property typed array-of-$ref, plus paging/meta noise
    let arrayProps = [];
    for (const [propName, propSchema] of resolved.properties) {
        if (propSchema && propSchema.type === 'array' && propSchema.items) {
            const itemRes = resolveSchema(propSchema.items);
            arrayProps.push({ propName, itemSchemaName: itemRes.name });
        }
    }
    if (arrayProps.length === 1) {
        return {
            kind: 'wrapper',
            itemSchemaName: arrayProps[0].itemSchemaName,
            wrapperArrayProp: arrayProps[0].propName,
            resolved,
        };
    }
    return { kind: 'object', itemSchemaName: resolved.name, wrapperArrayProp: null, resolved };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Schema-stem clustering (collapses DTO-variant multiplicity WITHOUT using tags)
// ─────────────────────────────────────────────────────────────────────────────
const STEM_SUFFIXES = [
    'CreateOrUpdateResponse', 'CreateOrUpdateInput',
    'PostRequest', 'PutRequest', 'PatchRequest', 'DeleteRequest', 'GetResponse',
    'PutResp', 'PutPost', 'PutProfileDto', 'PostProfileDto',
    'Resource', 'Request', 'Response', 'Input', 'Output',
    'Dto', 'DTO', 'Delete', 'Array', 'Collection',
];

function stemOf(defName) {
    if (!defName) return null;
    let s = defName;
    let changed = true;
    while (changed) {
        changed = false;
        for (const suf of STEM_SUFFIXES) {
            if (s.length > suf.length + 2 && s.endsWith(suf)) {
                s = s.slice(0, -suf.length);
                changed = true;
                break;
            }
        }
    }
    return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Structural path-family grouping (no tags consulted, ever)
// ─────────────────────────────────────────────────────────────────────────────
const OUT_OF_SCOPE_PREFIXES = ['/partner/']; // Technology Partners program — human-gated per
// SOURCES.json Source #8 (partners_overview.html): partner-request signup + review, "may take
// several weeks" — not self-serve. Structural evidence, not a read of the extractor's script.

const allPathEntries = Object.entries(spec.paths ?? {})
    .map(([p, ops]) => {
        const verbs = ['get', 'post', 'put', 'patch', 'delete'].filter((v) => ops && ops[v] && ops[v].operationId);
        return { p, ops, verbs };
    })
    .filter((e) => e.verbs.length > 0) // drop the 7 empty `/billing/*` stub paths (0 operations = not a real endpoint)
    .filter((e) => !OUT_OF_SCOPE_PREFIXES.some((pre) => e.p.startsWith(pre)));

const pathSet = new Set(allPathEntries.map((e) => e.p));

function familyOf(p) {
    const m = p.match(/^(.*)\/\{[A-Za-z_]+\}$/);
    if (m && pathSet.has(m[1])) return m[1];
    return p;
}

const families = new Map(); // familyKey -> { paths: Set, ops: [{path, verb, op}] }
for (const { p, ops, verbs } of allPathEntries) {
    const fam = familyOf(p);
    if (!families.has(fam)) families.set(fam, { paths: new Set(), ops: [] });
    const entry = families.get(fam);
    entry.paths.add(p);
    for (const v of verbs) entry.ops.push({ path: p, verb: v, op: ops[v] });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Per-family independent re-derivation
// ─────────────────────────────────────────────────────────────────────────────
const WATERMARK_PARAM_RE = /^(updated_after|created_after|modified_after|since|updated_since|created_since)$/i;
const PAGING_LINK_STEM_RE = /links$/i;

function paramsOf(op) {
    return Array.isArray(op.parameters) ? op.parameters : [];
}

function findBodyParam(op) {
    return paramsOf(op).find((pp) => pp.in === 'body');
}

function pathParamNames(pathStr) {
    return [...pathStr.matchAll(/\{([A-Za-z_]+)\}/g)].map((m) => m[1]);
}

function isScalarType(propSchema) {
    if (!propSchema) return false;
    if (propSchema.$ref) return false; // ref to another object = not scalar
    return ['string', 'integer', 'number', 'boolean'].includes(propSchema.type);
}

function isObjectOrArrayOfObjectType(propSchema) {
    if (!propSchema) return false;
    if (propSchema.$ref) return true;
    if (propSchema.type === 'object') return true;
    if (propSchema.type === 'array' && propSchema.items) {
        const it = propSchema.items;
        return !!it.$ref || it.type === 'object';
    }
    return false;
}

const derivedObjects = [];

for (const [famKey, fam] of families) {
    const familyName = famKey;
    const opsByVerb = { get: [], post: [], put: [], patch: [], delete: [] };
    for (const o of fam.ops) opsByVerb[o.verb].push(o);

    // Identify the "list" GET (on the family root path itself, no extra trailing param) vs
    // "single-get" GET (on a path with a trailing param merged into this family). A sole GET
    // whose response resolves to a WRAPPER collection (e.g. a reporting/tracking endpoint scoped
    // by an ancestor {id} in its own path, like /reports/.../{campaign_activity_id}/tracking/sends)
    // is NOT a "get one record by its own PK" door — only treat the fallback single-GET as a real
    // item door when its response is a bare object/array, never a wrapper-of-many.
    function respShapeKind(op) {
        const okResp = op.responses?.['200'] ?? op.responses?.['201'];
        if (!okResp?.schema) return null;
        return resolveResponseShape(okResp.schema)?.kind ?? null;
    }
    const listGetEntry = opsByVerb.get.find((o) => o.path === famKey);
    const soleGet = opsByVerb.get.length === 1 ? opsByVerb.get[0] : null;
    const singleGetEntry =
        opsByVerb.get.find((o) => o.path !== famKey) ||
        (soleGet && respShapeKind(soleGet.op) !== 'wrapper' ? soleGet : null);

    const createEntry = opsByVerb.post.find((o) => o.path === famKey) || opsByVerb.post[0] || null;
    const updateEntry =
        opsByVerb.put.find((o) => o.path !== famKey) ||
        opsByVerb.patch.find((o) => o.path !== famKey) ||
        opsByVerb.put[0] || opsByVerb.patch[0] || null;
    const deleteEntry = opsByVerb.delete.find((o) => o.path !== famKey) || opsByVerb.delete[0] || null;

    // ── field-set re-derivation: union of resolved GET response schema(s) + request body schema ──
    const fieldSet = new Map(); // name -> { readOnly, type, isFKcandidate, isObjectRel }
    let itemSchemaName = null;

    function ingestResolved(resolvedProps) {
        for (const [propName, propSchema] of resolvedProps) {
            const existing = fieldSet.get(propName) || {};
            fieldSet.set(propName, {
                readOnly: existing.readOnly || !!(propSchema && propSchema.readOnly),
                type: existing.type || (propSchema ? propSchema.type ?? (propSchema.$ref ? 'ref' : 'unknown') : 'unknown'),
                scalar: (existing.scalar ?? true) && isScalarType(propSchema),
                objectRel: existing.objectRel || isObjectOrArrayOfObjectType(propSchema),
                format: existing.format || (propSchema ? propSchema.format : undefined),
                maxLength: existing.maxLength ?? (propSchema ? propSchema.maxLength : undefined),
            });
        }
    }

    for (const entry of [listGetEntry, singleGetEntry].filter(Boolean)) {
        const okResp = entry.op.responses?.['200'] ?? entry.op.responses?.['201'];
        if (!okResp?.schema) continue;
        const shape = resolveResponseShape(okResp.schema);
        if (!shape) continue;
        if (!itemSchemaName) itemSchemaName = shape.itemSchemaName;
        const itemResolved = shape.itemSchemaName ? resolveSchema({ $ref: `#/definitions/${shape.itemSchemaName}` }) : shape.resolved;
        ingestResolved(itemResolved.properties);
    }
    if (createEntry) {
        const bodyParam = findBodyParam(createEntry.op);
        if (bodyParam?.schema) {
            const bodyResolved = resolveSchema(bodyParam.schema);
            ingestResolved(bodyResolved.properties);
            if (!itemSchemaName) itemSchemaName = bodyResolved.name;
        }
    }

    const rederivedFields = [...fieldSet.keys()].sort();

    // ── PK candidate: path-param name on the single-get/update/delete path == a field name ──
    const idParamCandidates = new Set();
    for (const entry of [singleGetEntry, updateEntry, deleteEntry].filter(Boolean)) {
        for (const pn of pathParamNames(entry.path)) idParamCandidates.add(pn.toLowerCase());
    }
    const pkCandidates = rederivedFields.filter((f) => idParamCandidates.has(f.toLowerCase()));

    // ── FK candidates: scalar *_id / *_ids fields (not the PK itself) ──
    const fkCandidates = rederivedFields.filter((f) => {
        const info = fieldSet.get(f);
        if (!info || !info.scalar) return false;
        if (pkCandidates.includes(f)) return false;
        return /_id$|_ids$/i.test(f);
    });

    // ── object/array-of-object relation fields (candidates for FK-misclassification check) ──
    const objectRelationFields = rederivedFields.filter((f) => fieldSet.get(f)?.objectRel);

    // ── pagination shape ──
    let expectedPagination = null;
    let watermarkCandidate = null;
    if (listGetEntry) {
        const qparams = paramsOf(listGetEntry.op).filter((pp) => pp.in === 'query');
        const hasLimit = qparams.some((pp) => pp.name === 'limit');
        const okResp = listGetEntry.op.responses?.['200'];
        const shape = okResp?.schema ? resolveResponseShape(okResp.schema) : null;
        const hasLinksNext = shape && shape.kind === 'wrapper' &&
            [...shape.resolved.properties.keys()].some((k) => PAGING_LINK_STEM_RE.test(k));
        const hasOffset = qparams.some((pp) => /^(offset|start)$/i.test(pp.name));
        const hasPageNum = qparams.some((pp) => /^(page|page_number)$/i.test(pp.name));
        if (hasLinksNext) expectedPagination = 'Cursor';
        else if (hasOffset) expectedPagination = 'Offset';
        else if (hasPageNum) expectedPagination = 'PageNumber';
        else if (hasLimit) expectedPagination = 'Cursor'; // limit-only + no offset/page => cursor-style (CC convention)
        else expectedPagination = 'None';

        const wmParam = qparams.find((pp) => WATERMARK_PARAM_RE.test(pp.name));
        if (wmParam) watermarkCandidate = wmParam.name;
    }

    // ── write-ops presence (structural, from the spec) ──
    const sourceWriteOps = {
        Create: !!createEntry,
        Update: !!updateEntry,
        Delete: !!deleteEntry,
    };

    // ── body shape + ID location for Create ──
    let createBodyShape = null;
    let createIDLocation = null;
    if (createEntry) {
        const bodyParam = findBodyParam(createEntry.op);
        if (bodyParam?.schema) {
            const resolved = resolveSchema(bodyParam.schema);
            // wrapped iff the top-level schema has exactly one property whose OWN schema is itself
            // an object/$ref carrying the "real" attributes (rare for this vendor; default flat).
            const wrapKeys = [...resolved.properties.entries()].filter(
                ([, v]) => v && (v.$ref || v.type === 'object'),
            );
            createBodyShape = wrapKeys.length === 1 && resolved.properties.size === 1 ? 'wrapped' : 'flat';
        } else {
            createBodyShape = 'flat';
        }
        const okResp = createEntry.op.responses?.['201'] ?? createEntry.op.responses?.['200'];
        const hasLocationHeader = !!okResp?.headers?.Location;
        createIDLocation = hasLocationHeader ? 'header' : 'body';
    }

    // ── canonical API path ──
    const apiPath = famKey;

    derivedObjects.push({
        familyKey: famKey,
        apiPath,
        itemSchemaName,
        stem: stemOf(itemSchemaName),
        rederivedFields,
        pkCandidates,
        fkCandidates,
        objectRelationFields,
        expectedPagination,
        watermarkCandidate,
        sourceWriteOps,
        createBodyShape,
        createIDLocation,
        hasListGet: !!listGetEntry,
        hasSingleGet: !!singleGetEntry,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Independent slug derivation (family path -> snake_case object-name guess) so the
//    object-set diff has a fighting chance of aligning with the extractor's naming.
// ─────────────────────────────────────────────────────────────────────────────
function slugify(famKey) {
    return famKey
        .replace(/^\//, '')
        .replace(/\{[A-Za-z_]+\}/g, '')
        .replace(/[/\-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .toLowerCase();
}

for (const obj of derivedObjects) obj.slug = slugify(obj.familyKey);

const enumeratedCount = derivedObjects.length;

// ─────────────────────────────────────────────────────────────────────────────
// 6. Load the metadata file — ONLY HERE, for the diff step.
// ─────────────────────────────────────────────────────────────────────────────
if (!existsSync(METADATA_PATH)) {
    console.error(`Metadata file not found at ${METADATA_PATH}`);
    process.exit(1);
}
const metadataRaw = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));

// Generic recursive walk: find every record whose `fields` object looks like an
// Integration Object row (has Name + APIPath-ish keys) and every record that looks like
// an Integration Object Field row (has Name + Type), regardless of the exact
// relatedEntities key casing used in this file.
function walkRecords(node, parentIOFields, acc) {
    if (Array.isArray(node)) {
        for (const item of node) walkRecords(item, parentIOFields, acc);
        return;
    }
    if (!node || typeof node !== 'object') return;

    const f = node.fields;
    if (f && typeof f === 'object' && typeof f.Name === 'string') {
        const looksLikeIOF =
            'Type' in f && ('IsPrimaryKey' in f || 'IsForeignKey' in f || 'IsRequired' in f || 'IsReadOnly' in f);
        const looksLikeIO =
            'APIPath' in f ||
            'SupportsCreate' in f ||
            'SupportsPagination' in f ||
            'PaginationType' in f ||
            'CreateAPIPath' in f;

        if (looksLikeIOF && parentIOFields) {
            parentIOFields.push(f);
        } else if (looksLikeIO) {
            const ioFields = [];
            acc.push({ io: f, iof: ioFields });
            if (node.relatedEntities) {
                for (const [, v] of Object.entries(node.relatedEntities)) walkRecords(v, ioFields, acc);
            }
            return; // don't also descend generically below (avoid double-walk)
        } else if (looksLikeIOF && !parentIOFields) {
            // an IOF encountered outside an IO context we're tracking (top-level array) — ignore, it
            // will be picked up when its parent IO's relatedEntities are walked.
        }
    }

    if (node.relatedEntities) {
        for (const [, v] of Object.entries(node.relatedEntities)) walkRecords(v, parentIOFields, acc);
    }
    for (const [k, v] of Object.entries(node)) {
        if (k === 'fields' || k === 'relatedEntities') continue;
        if (v && typeof v === 'object') walkRecords(v, parentIOFields, acc);
    }
}

const emittedAcc = [];
walkRecords(metadataRaw, null, emittedAcc);

const emittedObjects = emittedAcc.map(({ io, iof }) => ({
    name: io.Name,
    apiPath: io.APIPath ?? null,
    paginationType: io.PaginationType ?? null,
    supportsPagination: io.SupportsPagination ?? null,
    incrementalWatermarkField: io.IncrementalWatermarkField ?? null,
    supportsCreate: !!io.SupportsCreate,
    supportsUpdate: !!io.SupportsUpdate,
    supportsDelete: !!io.SupportsDelete,
    createAPIPath: io.CreateAPIPath ?? null,
    createMethod: io.CreateMethod ?? null,
    createBodyShape: io.CreateBodyShape ?? null,
    createBodyKey: io.CreateBodyKey ?? null,
    createIDLocation: io.CreateIDLocation ?? null,
    updateAPIPath: io.UpdateAPIPath ?? null,
    deleteAPIPath: io.DeleteAPIPath ?? null,
    fields: iof.map((f) => ({
        name: f.Name,
        type: f.Type,
        isPrimaryKey: !!f.IsPrimaryKey,
        isForeignKey: !!f.IsForeignKey,
        isRequired: !!f.IsRequired,
        isReadOnly: !!f.IsReadOnly,
        maxLength: f.MaxLength ?? null,
    })),
}));

console.error(`[diag] emitted objects found in metadata file: ${emittedObjects.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// 7. Object-set diff (the "11-of-1,694" check) — normalize both sides to a comparable
//    slug space so plural/casing differences don't create false positives.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeSlug(s) {
    return String(s ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

// Per-token depluralization (not whole-string) so word-order-independent naming variants
// (e.g. "reports_stats_email_campaigns" vs "email_reports_stats_campaigns", or
// "activities_add_list_memberships" vs "activities_list_memberships_add") still compare
// as the same underlying resource. `ss`-ending tokens (address) are left alone.
function tokenSet(slug) {
    return new Set(
        slug
            .split('_')
            .filter(Boolean)
            .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t)),
    );
}

function jaccard(setA, setB) {
    let inter = 0;
    for (const x of setA) if (setB.has(x)) inter++;
    const union = setA.size + setB.size - inter;
    return union === 0 ? 0 : inter / union;
}

const MATCH_THRESHOLD = 0.34;

const derivedList = derivedObjects.map((obj) => ({ obj, norm: normalizeSlug(obj.slug), tokens: tokenSet(normalizeSlug(obj.slug)) }));
const emittedList = emittedObjects.map((eo) => ({ eo, norm: normalizeSlug(eo.name), tokens: tokenSet(normalizeSlug(eo.name)) }));

// Build every candidate pair's similarity, then greedily assign highest-similarity pairs
// first (one-to-one on both sides) — a simple, deterministic approximation of maximum
// bipartite weighted matching, sufficient for a few dozen candidates per side.
const pairs = [];
for (const d of derivedList) {
    for (const e of emittedList) {
        // exact/substring match short-circuits to similarity 1 (handles differing token
        // granularity, e.g. "contact_lists_list_id_xrefs" vs "contact_lists_xrefs").
        let sim;
        if (d.norm === e.norm) sim = 1;
        else if (d.norm.includes(e.norm) || e.norm.includes(d.norm)) sim = Math.max(0.9, jaccard(d.tokens, e.tokens));
        else sim = jaccard(d.tokens, e.tokens);
        if (sim >= MATCH_THRESHOLD) pairs.push({ d, e, sim });
    }
}
pairs.sort((a, b) => b.sim - a.sim);

const derivedMatched = new Map(); // derived obj -> emitted eo
const emittedMatched = new Map(); // emitted eo -> derived obj
const derivedTaken = new Set();
const emittedTaken = new Set();
for (const { d, e, sim } of pairs) {
    if (derivedTaken.has(d.obj) || emittedTaken.has(e.eo)) continue;
    derivedMatched.set(d.obj, e.eo);
    emittedMatched.set(e.eo, d.obj);
    derivedTaken.add(d.obj);
    emittedTaken.add(e.eo);
}

function findEmittedMatch(_derivedSlugNorm, obj) {
    return derivedMatched.get(obj) ?? null;
}
function findDerivedMatch(_emittedNorm, eo) {
    return emittedMatched.get(eo) ?? null;
}

const objectsMissing = [];
for (const obj of derivedObjects) {
    if (!derivedMatched.has(obj)) objectsMissing.push(obj.slug);
}

const objectsExtra = [];
for (const eo of emittedObjects) {
    if (!emittedMatched.has(eo)) objectsExtra.push(eo.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Per-object attribute diff (only for objects that DID match on both sides)
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

function normalizePathTemplate(p) {
    if (!p) return null;
    return p.replace(/\{[A-Za-z_]+\}/g, '{}').replace(/\/+$/, '');
}

for (const obj of derivedObjects) {
    const eo = findEmittedMatch(normalizeSlug(obj.slug), obj);
    if (!eo) continue; // already captured in objectsMissing

    const emittedFieldNames = new Set(eo.fields.map((f) => f.name));
    const rederivedSet = new Set(obj.rederivedFields);

    const missingFields = obj.rederivedFields.filter((f) => !emittedFieldNames.has(f));
    const extraFields = eo.fields.map((f) => f.name).filter((f) => !rederivedSet.has(f));

    // path mismatch
    let pathMismatch;
    if (obj.apiPath && eo.apiPath) {
        const a = normalizePathTemplate(obj.apiPath);
        const b = normalizePathTemplate(eo.apiPath);
        if (a !== b) pathMismatch = `rederived='${obj.apiPath}' emitted='${eo.apiPath}'`;
    }

    // PK mismatch: emitted IsPrimaryKey fields vs rederived pkCandidates
    const emittedPKs = eo.fields.filter((f) => f.isPrimaryKey).map((f) => f.name);
    let pkMismatch;
    if (obj.pkCandidates.length > 0) {
        const emittedPKSet = new Set(emittedPKs);
        const rederivedPKSet = new Set(obj.pkCandidates);
        const onlyRederived = obj.pkCandidates.filter((f) => !emittedPKSet.has(f));
        const onlyEmitted = emittedPKs.filter((f) => !rederivedPKSet.has(f));
        if (onlyRederived.length > 0 || onlyEmitted.length > 0) {
            pkMismatch = `rederived=[${obj.pkCandidates.join(',')}] emitted=[${emittedPKs.join(',')}]`;
        }
    }

    // write-ops missing: source has the write capability structurally, emitted lacks the columns
    const writeOpsMissing = [];
    if (obj.sourceWriteOps.Create && !(eo.supportsCreate && eo.createAPIPath && eo.createMethod)) {
        writeOpsMissing.push('Create');
    }
    if (obj.sourceWriteOps.Update && !(eo.supportsUpdate && eo.updateAPIPath)) {
        writeOpsMissing.push('Update');
    }
    if (obj.sourceWriteOps.Delete && !(eo.supportsDelete && eo.deleteAPIPath)) {
        writeOpsMissing.push('Delete');
    }

    // FK misclassification: emitted IsForeignKey=true on a field that our resolved schema shows
    // as an object/array-of-object relation (a nesting/access-path edge, not a scalar FK).
    const objectRelSet = new Set(obj.objectRelationFields);
    const fkMisclassified = eo.fields
        .filter((f) => f.isForeignKey && objectRelSet.has(f.name))
        .map((f) => f.name);

    // pagination mismatch
    let paginationMismatch;
    if (obj.expectedPagination && eo.paginationType && obj.expectedPagination !== eo.paginationType) {
        // 'None' rederived-side just means "no list-get in this family" — don't flag against an
        // emitted value in that case (nothing to compare structurally).
        if (obj.hasListGet) {
            paginationMismatch = `rederived='${obj.expectedPagination}' emitted='${eo.paginationType}'`;
        }
    }

    // watermark mismatch
    let watermarkMismatch;
    if (obj.watermarkCandidate && eo.incrementalWatermarkField && obj.watermarkCandidate !== eo.incrementalWatermarkField) {
        watermarkMismatch = `rederived='${obj.watermarkCandidate}' emitted='${eo.incrementalWatermarkField}'`;
    } else if (obj.watermarkCandidate && !eo.incrementalWatermarkField) {
        watermarkMismatch = `rederived='${obj.watermarkCandidate}' emitted=null`;
    }

    // body shape mismatch
    let bodyShapeMismatch;
    if (obj.createBodyShape && eo.createBodyShape && obj.createBodyShape !== eo.createBodyShape) {
        bodyShapeMismatch = `rederived='${obj.createBodyShape}' emitted='${eo.createBodyShape}'`;
    }

    // type mismatches (best-effort — only where we have a scalar type opinion)
    const typeMismatches = [];
    // (kept conservative/best-effort: Swagger 2.0 primitive types don't map 1:1 to SQL types
    // without the framework's own type-mapping table, so we only flag gross scalar/object clashes)

    const diverged =
        missingFields.length > 0 ||
        extraFields.length > 0 ||
        typeMismatches.length > 0 ||
        fkMisclassified.length > 0 ||
        writeOpsMissing.length > 0 ||
        !!pkMismatch ||
        !!pathMismatch ||
        !!paginationMismatch ||
        !!watermarkMismatch ||
        !!bodyShapeMismatch;

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
        object: eo.name,
        diverged,
        rederivedFieldCount: obj.rederivedFields.length,
        emittedFieldCount: eo.fields.length,
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

const objectsDivergedCount = perObjectFull.filter((o) => o.diverged).length;

// ─────────────────────────────────────────────────────────────────────────────
// 9. Write full lossless artifact
// ─────────────────────────────────────────────────────────────────────────────
const artifactPath = path.join(RUN_OUTPUT_DIR, 'DUAL_DERIVATION.json');
const artifact = {
    Vendor: 'constant-contact',
    GeneratedAt: new Date().toISOString(),
    Strategy:
        '$ref-chased OpenAPI response/request schema resolution + allOf flattening, clustered by ' +
        'stemmed Swagger-definition identity (DTO-variant collapsing), with a structural path-family ' +
        'grouping (collection+item path collapse) that NEVER consults the vendor\'s own OpenAPI `tags` ' +
        '— independent of the extractor\'s presumed tag-grouped walker.',
    Source: {
        SOURCES_JSON: 'packages/Integration/connectors-registry/constant-contact/SOURCES.json',
        OpenAPISpec: 'packages/Integration/connectors-registry/constant-contact/sources/openapi.json',
        SpecPathsCount: Object.keys(spec.paths ?? {}).length,
        SpecDefinitionsCount: Object.keys(definitions).length,
        OutOfScopePrefixesExcluded: OUT_OF_SCOPE_PREFIXES,
        SOURCES_JSON_FullUniverseAccounting: sourcesJson.FullUniverseAccounting ?? null,
    },
    EnumeratedCount: enumeratedCount,
    EmittedObjectCount: emittedObjects.length,
    ObjectsMissing: objectsMissing,
    ObjectsExtra: objectsExtra,
    ObjectsDivergedCount: objectsDivergedCount,
    DivergenceHistogram: histogram,
    DerivedObjects: derivedObjects.map((o) => ({
        familyKey: o.familyKey,
        slug: o.slug,
        apiPath: o.apiPath,
        itemSchemaName: o.itemSchemaName,
        stem: o.stem,
        rederivedFieldCount: o.rederivedFields.length,
        pkCandidates: o.pkCandidates,
        fkCandidates: o.fkCandidates,
        objectRelationFields: o.objectRelationFields,
        expectedPagination: o.expectedPagination,
        watermarkCandidate: o.watermarkCandidate,
        sourceWriteOps: o.sourceWriteOps,
        createBodyShape: o.createBodyShape,
        createIDLocation: o.createIDLocation,
    })),
    PerObject: perObjectFull,
};
writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// 10. Compact, actionable-only stdout summary
// ─────────────────────────────────────────────────────────────────────────────
const ACTIONABLE_KEYS = [
    'missingFields',
    'fkMisclassified',
    'writeOpsMissing',
    'pkMismatch',
    'pathMismatch',
    'bodyShapeMismatch',
    'paginationMismatch',
    'watermarkMismatch',
];

function isActionable(o) {
    return (
        (o.missingFields && o.missingFields.length > 0) ||
        (o.fkMisclassified && o.fkMisclassified.length > 0) ||
        (o.writeOpsMissing && o.writeOpsMissing.length > 0) ||
        !!o.pkMismatch ||
        !!o.pathMismatch ||
        !!o.bodyShapeMismatch ||
        !!o.paginationMismatch ||
        !!o.watermarkMismatch
    );
}

const actionableSample = perObjectFull
    .filter((o) => o.diverged && isActionable(o))
    .slice(0, 40)
    .map((o) => ({
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
    artifact: path.relative(REPO_ROOT, artifactPath),
    strategy: artifact.Strategy,
    enumeratedCount,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram: histogram,
    perObject: actionableSample,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
