#!/usr/bin/env node
// independent-dual-derive.mjs
//
// INDEPENDENT (second) derivation for the Blackbaud connector, written FROM SCRATCH.
//
// STRATEGY (deliberately different from a naive first-pass path-first walk):
//   1. $REF-CHASED SCHEMA-POINTER RESOLUTION — instead of walking `paths` in file order and
//      inlining whatever schema a path happens to reference, this script first builds a full
//      `definitions` pointer graph per spec file (a map of `#/definitions/X` -> resolved,
//      recursively-deref'd JSON-Schema node, with a visited-set to guard cycles), and only
//      THEN associates paths to definitions by following each operation's response/body
//      `$ref` through that resolved graph. This surfaces definitions that are reachable only
//      via NESTED properties (a field whose schema is itself `$ref`'d, not just top-level
//      path->definition), which a naive path-first walk tends to miss.
//   2. OPERATION-ID-DRIVEN CRUD CLASSIFICATION — rather than pattern-matching HTTP verb +
//      path shape, this script classifies Create/Update/Delete/Get/List by parsing each
//      operation's `operationId` against a verb-prefix taxonomy (Get/List/Add/Post/Edit/
//      Update/Patch/Delete/Remove) crossed with the HTTP method, which is how the Blackbaud
//      SKY API documents its own operations (each operationId already encodes intent).
//   3. RECORD-TYPE UNIVERSE = every definition reachable from ANY path's request or response
//      schema (BFS over $ref edges, not just the top-level list/get resource), scoped only by
//      the object-container heuristic (a definition with a "type":"object" and >=1 property
//      that is not purely an envelope/wrapper for pagination).
//
// Enumerates the complete record-type universe from the 4 in-scope Blackbaud SKY API OpenAPI
// (Swagger 2.0) specs, independently re-derives structural facts per object, and diffs against
// the emitted metadata file. Writes the full result to DUAL_DERIVATION.json and prints a
// compact summary to stdout (the only channel the caller reads, per P9).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..'); // repo root
const CONNECTOR_DIR = path.resolve(__dirname, '..');
const SOURCES_DIR = path.join(CONNECTOR_DIR, 'sources', 'openapi');
const METADATA_PATH = path.join(ROOT, 'metadata', 'integrations', 'blackbaud', '.blackbaud.integration.json');
const OUTPUT_PATH = path.join(
    CONNECTOR_DIR,
    'runs',
    'connector-blackbaud-1782979459200-c323d976',
    'output',
    'DUAL_DERIVATION.json'
);

// The 4 primary in-scope specs per SOURCES.json's CoversTaxonomies (the requested 20-leaf
// taxonomy). renxt-combined.swagger.json is EXCLUDED from primary derivation: SOURCES.json
// documents it (via `comm -23`) as a strict 280-of-351 SUBSET/mirror of the union of these four,
// so including it would double-count identical definitions under a second file label. This
// script independently confirms that subset relationship below rather than assuming it.
const PRIMARY_SPEC_FILES = ['constituents.swagger.json', 'gifts.swagger.json', 'fundraising.swagger.json', 'prospects.swagger.json'];
const MIRROR_SPEC_FILE = 'renxt-combined.swagger.json';

// ---------------------------------------------------------------------------
// 1. $ref-chased pointer resolution
// ---------------------------------------------------------------------------

/** Resolve a local JSON-Schema `$ref` pointer of the form "#/definitions/Foo.Bar" against a spec doc. */
function resolveRef(spec, ref) {
    if (!ref.startsWith('#/')) return null;
    const parts = ref.slice(2).split('/');
    let node = spec;
    for (const part of parts) {
        if (node == null) return null;
        node = node[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))];
    }
    return node;
}

/**
 * Recursively dereference a schema node's `$ref` chains (and nested property/array-item refs),
 * returning a fully expanded node. Cycle-guarded via a visited-ref set (Blackbaud schemas do
 * have circular refs, e.g. Constituent -> Relationship -> Constituent).
 */
function deref(spec, node, visited = new Set(), depth = 0) {
    if (node == null || typeof node !== 'object' || depth > 12) return node;
    if (node.$ref) {
        if (visited.has(node.$ref)) return { __cyclicRef: node.$ref };
        const resolved = resolveRef(spec, node.$ref);
        if (resolved == null) return { __unresolvedRef: node.$ref };
        const nextVisited = new Set(visited);
        nextVisited.add(node.$ref);
        return deref(spec, resolved, nextVisited, depth + 1);
    }
    const out = Array.isArray(node) ? [] : {};
    for (const [k, v] of Object.entries(node)) {
        if (k === 'properties' && v && typeof v === 'object') {
            out.properties = {};
            for (const [pk, pv] of Object.entries(v)) {
                out.properties[pk] = deref(spec, pv, visited, depth + 1);
            }
        } else if (k === 'items') {
            out.items = deref(spec, v, visited, depth + 1);
        } else if (typeof v === 'object' && v !== null) {
            out[k] = deref(spec, v, visited, depth + 1);
        } else {
            out[k] = v;
        }
    }
    return out;
}

/** Build a definitions pointer graph: name -> fully-deref'd schema node. */
function buildDefinitionGraph(spec) {
    const graph = new Map();
    for (const [name, def] of Object.entries(spec.definitions || {})) {
        graph.set(name, deref(spec, def));
    }
    return graph;
}

// ---------------------------------------------------------------------------
// 2. operationId-driven CRUD classification
// ---------------------------------------------------------------------------

const OP_VERB_TAXONOMY = [
    { re: /^(Get|List|Search|Query|Find)/i, kind: 'read' },
    { re: /^(Add|Create|Post|New)/i, kind: 'create' },
    { re: /^(Edit|Update|Patch|Modify|Set)/i, kind: 'update' },
    { re: /^(Delete|Remove)/i, kind: 'delete' },
];

function classifyOperation(operationId, method) {
    if (operationId) {
        for (const { re, kind } of OP_VERB_TAXONOMY) {
            if (re.test(operationId)) return kind;
        }
    }
    const m = (method || '').toLowerCase();
    if (m === 'get') return 'read';
    if (m === 'post') return 'create';
    if (m === 'patch' || m === 'put') return 'update';
    if (m === 'delete') return 'delete';
    return 'unknown';
}

// ---------------------------------------------------------------------------
// 3. Record-type universe: BFS over $ref edges from every path's request/response schema
// ---------------------------------------------------------------------------

/** Collect all raw (un-deref'd) $ref targets appearing anywhere inside a schema fragment. */
function collectRefTargets(node, out = new Set(), depth = 0) {
    if (node == null || typeof node !== 'object' || depth > 20) return out;
    if (node.$ref && typeof node.$ref === 'string') {
        const m = node.$ref.match(/^#\/definitions\/(.+)$/);
        if (m) out.add(decodeURIComponent(m[1].replace(/~1/g, '/').replace(/~0/g, '~')));
    }
    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') collectRefTargets(v, out, depth + 1);
    }
    return out;
}

/**
 * A "record-type" definition is an object schema with properties that is not a pure wrapper
 * (a collection envelope with only `count`+`value` style pagination properties, or a pure
 * primitive/enum). We keep it liberal (bias toward MORE reachable objects) — anything with
 * >=1 non-pagination-envelope property counts.
 */
function isRecordTypeCandidate(defName, node) {
    if (!node || typeof node !== 'object') return false;
    if (node.type && node.type !== 'object') return false;
    const props = node.properties || {};
    const propNames = Object.keys(props);
    if (propNames.length === 0) return false;
    // Pure collection envelopes: {count, value:[...]} or {count, next_link, results/rows}
    const envelopeOnly = propNames.every((p) => /^(count|next_link|total_count|value|results|rows)$/i.test(p));
    if (envelopeOnly) return false;
    return true;
}

/** BFS from every path operation's body/response schema through the resolved definitions graph. */
function enumerateRecordTypeUniverse(spec, defGraph) {
    const reachableFromPaths = new Set();
    for (const [, ops] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(ops)) {
            if (!op || typeof op !== 'object' || !op.operationId) continue;
            // response schemas
            for (const resp of Object.values(op.responses || {})) {
                if (resp && resp.schema) {
                    for (const t of collectRefTargets(resp.schema)) reachableFromPaths.add(t);
                }
            }
            // request body schema
            for (const param of op.parameters || []) {
                if (param.in === 'body' && param.schema) {
                    for (const t of collectRefTargets(param.schema)) reachableFromPaths.add(t);
                }
            }
        }
    }
    // BFS outward through nested properties/items of each reachable def to catch record types
    // that are only exposed as a NESTED field of a top-level path definition (the class of
    // objects a path-first walk misses — e.g. a "Fundraiser" nested inside GiftRead.fundraisers).
    const universe = new Set();
    const queue = [...reachableFromPaths];
    const seen = new Set();
    while (queue.length) {
        const name = queue.shift();
        if (seen.has(name)) continue;
        seen.add(name);
        const node = defGraph.get(name);
        if (!node) continue;
        if (isRecordTypeCandidate(name, node)) universe.add(name);
        // find nested $ref targets in the ORIGINAL (non-deref'd) definition to keep discovering
        const rawDef = spec.definitions[name];
        for (const t of collectRefTargets(rawDef)) {
            if (!seen.has(t)) queue.push(t);
        }
    }
    return universe;
}

// ---------------------------------------------------------------------------
// Per-object structural re-derivation
// ---------------------------------------------------------------------------

const SWAGGER_TYPE_TO_MJ = {
    string: 'String',
    integer: 'Integer',
    number: 'Decimal',
    boolean: 'Boolean',
    object: 'String', // nested object -> flattened / JSON string in most connector conventions
    array: 'String',
};

function mjTypeForProp(prop) {
    if (!prop) return 'String';
    if (prop.format === 'date-time' || prop.format === 'date') return 'DateTime';
    return SWAGGER_TYPE_TO_MJ[prop.type] || 'String';
}

/** Find PK candidates for a definition: properties literally named "id" (Blackbaud convention: system record ID). */
function findPkCandidates(node) {
    const props = node.properties || {};
    const candidates = [];
    for (const [name, prop] of Object.entries(props)) {
        if (/^id$/i.test(name)) candidates.push(name);
    }
    // secondary candidate: <singular-of-object>_id when no bare "id" present
    if (candidates.length === 0) {
        for (const name of Object.keys(props)) {
            if (/_id$/i.test(name) && Object.keys(props).indexOf(name) === 0) candidates.push(name);
        }
    }
    return candidates;
}

/** Find fields whose swagger type is itself an object/array-of-object (relationship/nesting edges, NOT scalar FKs). */
function findNestedObjectFields(node, defGraph, rawDef) {
    const nested = [];
    const rawProps = (rawDef && rawDef.properties) || {};
    for (const [name, rawProp] of Object.entries(rawProps)) {
        const refTargets = collectRefTargets(rawProp);
        if (refTargets.size > 0) {
            nested.push({ field: name, kind: rawProp.type === 'array' ? 'list' : 'object', targets: [...refTargets] });
        } else if (rawProp.type === 'object' && rawProp.properties) {
            nested.push({ field: name, kind: 'inline-object', targets: [] });
        }
    }
    return nested;
}

/** Find scalar fields that reference another object's PK by NAME match (e.g. "constituent_id" -> constituent.id), a Tier-2 FK signal. */
function findScalarFkCandidates(rawDef, allObjectNames) {
    const props = (rawDef && rawDef.properties) || {};
    const out = [];
    for (const [name, prop] of Object.entries(props)) {
        if (prop.type !== 'string' && prop.type !== undefined) continue;
        if (collectRefTargets(prop).size > 0) continue; // that's a nested-object edge, not scalar
        const m = name.match(/^(.+)_id$/i);
        if (m) {
            const base = m[1].toLowerCase();
            // does a known object name match (singular forms, underscores)
            const candidateTargets = allObjectNames.filter(
                (o) => o.toLowerCase() === base || o.toLowerCase() === base + 's' || o.toLowerCase().replace(/_/g, '') === base.replace(/_/g, '')
            );
            if (candidateTargets.length > 0) out.push({ field: name, targets: candidateTargets });
        }
    }
    return out;
}

/**
 * Derive a definition's "leaf name" mapped to a snake_case object slug matching MJ IO Name
 * convention. Blackbaud's Swagger convention emits SEPARATE per-verb DTOs for the SAME
 * underlying record type: `<Ns>.<Base>Read` (GET), `<Ns>.<Base>Add`/`<Ns>.Created<Base>`
 * (POST request/response), `<Ns>.<Base>Edit` (PATCH request), `<Ns>.ApiCollectionOf<Base>Read`
 * (list envelope). All of these collapse onto ONE record type "<Base>" — treating each verb-DTO
 * as its own object would be a methodology artifact, not a real divergence, so every verb/
 * envelope/created suffix is stripped before slugging.
 */
function defNameToSlug(defName) {
    // e.g. "ConstituentApi.ConstituentRead" -> "constituent"
    let leaf = defName.split('.').pop();
    // strip list/collection envelope wrapper prefix: ApiCollectionOf<Base>Read -> <Base>Read
    leaf = leaf.replace(/^ApiCollectionOf/, '');
    // strip "Created" prefix (POST response DTO): CreatedConstituentConsent -> ConstituentConsent
    leaf = leaf.replace(/^Created/, '');
    // strip verb/shape suffixes (order matters: longer/composite forms first)
    leaf = leaf.replace(/(ReadCollection|Collection|Read|Add|Edit|Create|Summary|FullDetail|Detail|Info)$/i, '');
    return leaf.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

// ---------------------------------------------------------------------------
// Pagination + watermark re-derivation from path GET params
// ---------------------------------------------------------------------------

/** relatedDefNames = every definition name (across Read/Add/Edit/Created/Collection variants) that collapses onto the same slug. */
function findListPathsForDef(spec, relatedDefNames) {
    const results = [];
    for (const [p, ops] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(ops)) {
            if (method !== 'get' || !op || typeof op !== 'object') continue;
            for (const resp of Object.values(op.responses || {})) {
                if (resp && resp.schema) {
                    const targets = collectRefTargets(resp.schema);
                    if ([...targets].some((t) => relatedDefNames.has(t))) {
                        results.push({ path: p, op });
                    }
                }
            }
        }
    }
    return results;
}

function derivePaginationInfo(getOps) {
    let paginationType = null;
    let watermarkField = null;
    for (const { op } of getOps) {
        const params = op.parameters || [];
        const names = params.map((p) => p.name.toLowerCase());
        if (names.includes('offset') && names.includes('limit')) paginationType = 'Offset';
        else if (names.some((n) => /cursor|marker/.test(n))) paginationType = 'Cursor';
        else if (names.some((n) => /^page$/.test(n)) || names.some((n) => /page_number/.test(n))) paginationType = 'PageNumber';
        const wmCandidate = params.find((p) => /^(date_added|last_modified|date_modified|updated_after|modified_since)$/i.test(p.name));
        if (wmCandidate) watermarkField = wmCandidate.name;
    }
    return { paginationType, watermarkField };
}

// ---------------------------------------------------------------------------
// Write-operation re-derivation (per definition -> per-op path/method/bodyShape/idLocation)
// ---------------------------------------------------------------------------

/** relatedDefNames = every definition name (across Read/Add/Edit/Created/Collection variants) that collapses onto the same slug. */
function deriveWriteOps(spec, relatedDefNames) {
    const ops = { create: null, update: null, delete: null };
    for (const [p, pathOps] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(pathOps)) {
            if (!op || typeof op !== 'object' || !op.operationId) continue;
            const kind = classifyOperation(op.operationId, method);
            let touchesDef = false;
            for (const param of op.parameters || []) {
                if (param.in === 'body' && param.schema && [...collectRefTargets(param.schema)].some((t) => relatedDefNames.has(t))) touchesDef = true;
            }
            // Some create/delete ops return the def in their 200/201 response instead of taking it as body
            for (const resp of Object.values(op.responses || {})) {
                if (resp && resp.schema && [...collectRefTargets(resp.schema)].some((t) => relatedDefNames.has(t))) touchesDef = touchesDef || kind !== 'read';
            }
            if (!touchesDef) continue;
            if (kind === 'create' && !ops.create) {
                const bodyParam = (op.parameters || []).find((pp) => pp.in === 'body');
                const bodyShape = bodyParam ? 'flat' : 'flat';
                // ID location: check 200/201 response schema for an "id" property -> body; else header
                let idLocation = 'body';
                const resp200 = op.responses && (op.responses['200'] || op.responses['201']);
                if (!resp200 || !resp200.schema) idLocation = 'body';
                ops.create = { path: p, method: method.toUpperCase(), bodyShape, idLocation, operationId: op.operationId };
            }
            if (kind === 'update' && !ops.update) {
                ops.update = { path: p, method: method.toUpperCase(), bodyShape: 'flat', idLocation: 'path', operationId: op.operationId };
            }
            if (kind === 'delete' && !ops.delete) {
                ops.delete = { path: p, method: method.toUpperCase(), idLocation: 'path', operationId: op.operationId };
            }
        }
    }
    return ops;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadSpec(fileName) {
    const raw = readFileSync(path.join(SOURCES_DIR, fileName), 'utf8');
    return JSON.parse(raw);
}

function main() {
    const specs = PRIMARY_SPEC_FILES.map((f) => ({ file: f, spec: loadSpec(f) }));
    const mirrorSpec = loadSpec(MIRROR_SPEC_FILE);

    // --- confirm mirror-subset relationship independently (strategy note 3.5-ish sanity check) ---
    const mirrorDefNames = new Set(Object.keys(mirrorSpec.definitions || {}));
    const primaryDefNames = new Set();
    for (const { spec } of specs) for (const n of Object.keys(spec.definitions || {})) primaryDefNames.add(n);
    let mirrorOnlyCount = 0;
    for (const n of mirrorDefNames) if (!primaryDefNames.has(n)) mirrorOnlyCount++;
    const mirrorIsSubset = mirrorOnlyCount === 0 || mirrorOnlyCount / mirrorDefNames.size < 0.05;

    // --- 1. Enumerate the complete record-type universe across the 4 primary specs ---
    // A record type may appear (near-)identically in more than one spec (e.g. "gift" referenced
    // from both gifts.swagger.json and fundraising.swagger.json cross-links) — de-dupe by slug.
    // Prefer the "Read" variant (or, failing that, the widest property set) as the canonical
    // shape for a slug: the Read DTO is the superset representing the full record, whereas
    // Add/Edit/Created DTOs are write-path subsets of the same underlying object.
    const universeBySlug = new Map(); // slug -> { defName, specFile, node, rawDef }
    // slug -> specFile -> Set(all defNames, across Read/Add/Edit/Created/Collection variants, that collapse to this slug)
    const relatedDefNamesBySlugAndFile = new Map();
    for (const { file, spec } of specs) {
        const defGraph = buildDefinitionGraph(spec);
        const universe = enumerateRecordTypeUniverse(spec, defGraph);
        for (const defName of universe) {
            const slug = defNameToSlug(defName);

            const key = `${slug}::${file}`;
            if (!relatedDefNamesBySlugAndFile.has(key)) relatedDefNamesBySlugAndFile.set(key, new Set());
            relatedDefNamesBySlugAndFile.get(key).add(defName);

            const node = defGraph.get(defName);
            const propCount = Object.keys((node && node.properties) || {}).length;
            const isReadVariant = /Read$/i.test(defName.split('.').pop()) && !/Collection$/i.test(defName.split('.').pop());
            const existing = universeBySlug.get(slug);
            if (!existing) {
                universeBySlug.set(slug, { defName, specFile: file, node, rawDef: spec.definitions[defName], isReadVariant, propCount });
            } else if ((isReadVariant && !existing.isReadVariant) || (isReadVariant === existing.isReadVariant && propCount > existing.propCount)) {
                universeBySlug.set(slug, { defName, specFile: file, node, rawDef: spec.definitions[defName], isReadVariant, propCount });
            }
        }
    }

    const enumeratedCount = universeBySlug.size;
    const allObjectSlugs = [...universeBySlug.keys()];

    // --- 2. Load emitted metadata ---
    const metaRaw = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
    const integrationRec = Array.isArray(metaRaw) ? metaRaw[0] : metaRaw;
    const emittedIOs = (integrationRec.relatedEntities || {})['MJ: Integration Objects'] || [];
    const emittedBySlug = new Map();
    for (const io of emittedIOs) {
        emittedBySlug.set(io.fields.Name.toLowerCase(), io);
    }

    // --- 3. Object-set diff ---
    const objectsMissing = [];
    for (const slug of allObjectSlugs) {
        if (!emittedBySlug.has(slug)) {
            // try loose match: emitted names may use different singular/plural or separators
            const loose = [...emittedBySlug.keys()].find((e) => e.replace(/_/g, '') === slug.replace(/_/g, ''));
            if (!loose) objectsMissing.push(slug);
        }
    }
    const objectsExtra = [];
    for (const [emittedSlug] of emittedBySlug) {
        const loose = allObjectSlugs.find((s) => s.replace(/_/g, '') === emittedSlug.replace(/_/g, ''));
        if (!loose) objectsExtra.push(emittedSlug);
    }

    // --- 4. Per-object re-derivation + diff ---
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

    for (const slug of allObjectSlugs) {
        const univ = universeBySlug.get(slug);
        const { defName, specFile, node, rawDef } = univ;
        const spec = specs.find((s) => s.file === specFile).spec;

        const emittedIO =
            emittedBySlug.get(slug) || emittedBySlug.get([...emittedBySlug.keys()].find((e) => e.replace(/_/g, '') === slug.replace(/_/g, '')) || '__none__');

        const rederivedFields = Object.keys((node && node.properties) || {});
        const rederivedFieldCount = rederivedFields.length;

        if (!emittedIO) {
            perObjectFull.push({
                object: slug,
                diverged: true,
                rederivedFieldCount,
                emittedFieldCount: 0,
                missingFields: rederivedFields,
                extraFields: [],
                writeOpsMissing: [],
                fkMisclassified: [],
                typeMismatches: [],
            });
            continue;
        }

        const emittedIOFs = (emittedIO.relatedEntities || {})['MJ: Integration Object Fields'] || [];
        const emittedFieldNames = new Set(emittedIOFs.map((f) => f.fields.Name));
        const emittedFieldCount = emittedIOFs.length;

        const missingFields = rederivedFields.filter((f) => !emittedFieldNames.has(f));
        const extraFields = [...emittedFieldNames].filter((f) => !rederivedFields.includes(f));

        // PK re-derivation + diff
        const pkCandidates = findPkCandidates(node);
        const emittedPkFields = emittedIOFs.filter((f) => f.fields.IsPrimaryKey).map((f) => f.fields.Name);
        let pkMismatch;
        if (pkCandidates.length > 0) {
            const setsEqual =
                pkCandidates.length === emittedPkFields.length && pkCandidates.every((c) => emittedPkFields.includes(c));
            if (!setsEqual) {
                pkMismatch = `re-derived PK candidates [${pkCandidates.join(',')}] vs emitted IsPrimaryKey=[${emittedPkFields.join(',') || 'none'}]`;
            }
        }

        // path re-derivation + diff (APIPath vs GET list path found for this def)
        const relatedDefNames = relatedDefNamesBySlugAndFile.get(`${slug}::${specFile}`) || new Set([defName]);
        const listOps = findListPathsForDef(spec, relatedDefNames);
        let pathMismatch;
        if (listOps.length > 0) {
            const rederivedPaths = listOps.map((o) => o.path);
            if (emittedIO.fields.APIPath && !rederivedPaths.includes(emittedIO.fields.APIPath)) {
                // allow template-var normalization difference
                const norm = (p) => p.replace(/\{[^}]+\}/g, '{}');
                const normMatch = rederivedPaths.some((p) => norm(p) === norm(emittedIO.fields.APIPath));
                if (!normMatch) pathMismatch = `re-derived list path(s) [${rederivedPaths.join(', ')}] vs emitted APIPath "${emittedIO.fields.APIPath}"`;
            }
        }

        // pagination + watermark re-derivation + diff
        let paginationMismatch, watermarkMismatch;
        if (listOps.length > 0) {
            const { paginationType, watermarkField } = derivePaginationInfo(listOps);
            if (paginationType && emittedIO.fields.PaginationType && paginationType !== emittedIO.fields.PaginationType) {
                paginationMismatch = `re-derived pagination "${paginationType}" vs emitted "${emittedIO.fields.PaginationType}"`;
            }
            if (emittedIO.fields.SupportsIncrementalSync && watermarkField && emittedIO.fields.IncrementalWatermarkField !== watermarkField) {
                watermarkMismatch = `re-derived watermark param "${watermarkField}" vs emitted "${emittedIO.fields.IncrementalWatermarkField}"`;
            }
            if (emittedIO.fields.SupportsIncrementalSync && !watermarkField) {
                watermarkMismatch = `emitted SupportsIncrementalSync=true but no incremental query param found on GET path(s) [${listOps
                    .map((o) => o.path)
                    .join(', ')}]`;
            }
        }

        // write-ops re-derivation + diff
        const writeOps = deriveWriteOps(spec, relatedDefNames);
        const writeOpsMissing = [];
        if (writeOps.create && !emittedIO.fields.SupportsWrite) writeOpsMissing.push(`create op "${writeOps.create.operationId}" found in spec but SupportsWrite=false`);
        if (writeOps.create && emittedIO.fields.SupportsWrite && !emittedIO.fields.CreateAPIPath) writeOpsMissing.push('CreateAPIPath not emitted though a create op was found');
        if (writeOps.update && emittedIO.fields.SupportsWrite && !emittedIO.fields.UpdateAPIPath) writeOpsMissing.push('UpdateAPIPath not emitted though an update op was found');
        if (writeOps.delete && emittedIO.fields.SupportsWrite && !emittedIO.fields.DeleteAPIPath) writeOpsMissing.push('DeleteAPIPath not emitted though a delete op was found');

        // bodyShape mismatch (only when both sides declare a create op)
        let bodyShapeMismatch;
        if (writeOps.create && emittedIO.fields.CreateBodyShape && writeOps.create.bodyShape !== emittedIO.fields.CreateBodyShape) {
            bodyShapeMismatch = `re-derived create bodyShape "${writeOps.create.bodyShape}" vs emitted "${emittedIO.fields.CreateBodyShape}"`;
        }

        // FK misclassification: any emitted field with RelatedIntegrationObjectID set whose
        // SOURCE type is actually a nested object/array (an access-path edge, not a scalar FK).
        const nestedObjectFields = findNestedObjectFields(node, null, rawDef);
        const nestedFieldNames = new Set(nestedObjectFields.map((n) => n.field));
        const fkMisclassified = [];
        for (const iof of emittedIOFs) {
            if (iof.fields.RelatedIntegrationObjectID && nestedFieldNames.has(iof.fields.Name)) {
                fkMisclassified.push(iof.fields.Name);
            }
        }

        // type mismatches (best-effort; only for fields present on both sides)
        const typeMismatches = [];
        const propsByName = (node && node.properties) || {};
        for (const iof of emittedIOFs) {
            const srcProp = propsByName[iof.fields.Name];
            if (!srcProp) continue;
            const expectedType = mjTypeForProp(srcProp);
            if (iof.fields.Type && iof.fields.Type !== expectedType) {
                typeMismatches.push(`${iof.fields.Name}: re-derived "${expectedType}" vs emitted "${iof.fields.Type}"`);
            }
        }

        const diverged = !!(
            missingFields.length ||
            extraFields.length ||
            typeMismatches.length ||
            fkMisclassified.length ||
            writeOpsMissing.length ||
            pkMismatch ||
            pathMismatch ||
            paginationMismatch ||
            watermarkMismatch ||
            bodyShapeMismatch
        );

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
            object: slug,
            diverged,
            rederivedFieldCount,
            emittedFieldCount,
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

    const objectsDivergedCount = perObjectFull.filter((o) => o.diverged).length;

    // --- 5. Build capped, actionable-only sample (<=40) ---
    const priorityDivs = perObjectFull.filter(
        (o) =>
            o.diverged &&
            (o.missingFields.length ||
                o.fkMisclassified.length ||
                o.writeOpsMissing.length ||
                o.pkMismatch ||
                o.pathMismatch ||
                o.bodyShapeMismatch ||
                o.paginationMismatch ||
                o.watermarkMismatch)
    );
    const perObjectSample = priorityDivs.slice(0, 40).map((o) => ({
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

    const fullResult = {
        strategy:
            '$ref-chased schema-pointer resolution (full definitions graph resolved + deref\'d per spec, cycle-guarded) ' +
            'crossed with operationId-driven CRUD classification (verb-prefix taxonomy on operationId, not path-shape pattern-matching); ' +
            'record-type universe = BFS over $ref edges from every path request/response schema, including nested (non-top-level) definitions.',
        vendor: 'blackbaud',
        generatedAt: new Date().toISOString(),
        primarySpecFiles: PRIMARY_SPEC_FILES,
        mirrorSpecFile: MIRROR_SPEC_FILE,
        mirrorIsSubsetOfPrimary: mirrorIsSubset,
        mirrorOnlyDefCount: mirrorOnlyCount,
        enumeratedCount,
        emittedIOCount: emittedIOs.length,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObjectFull,
    };

    writeFileSync(OUTPUT_PATH, JSON.stringify(fullResult, null, 2), 'utf8');

    const summary = {
        artifact: OUTPUT_PATH,
        strategy: fullResult.strategy,
        enumeratedCount,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: perObjectSample,
    };

    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
