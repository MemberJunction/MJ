#!/usr/bin/env node
// scripts/p8-independent-derivation.mjs
//
// DUAL INDEPENDENT DERIVATION (P8) — the SECOND, INDEPENDENT parser for the Zendesk connector.
//
// STRATEGY (deliberately different from a naive path-first walk): this is a
// SCHEMA-FIRST, $ref-CHASED derivation. Instead of deriving resource identity from
// URL path segments (a "path-first" walk — the likely strategy of the first-pass
// extractor), this script:
//
//   1. Enumerates every OpenAPI component schema whose name matches the vendor's own
//      "<Base>Object" naming convention (Zendesk's own canonical-record marker — e.g.
//      TicketObject, UserObject, TicketCommentObject). This is the schema-pointer walk.
//   2. For each such schema, CHASES $ref pointers the OTHER direction: it scans every
//      other schema in the document looking for an array property whose `items.$ref`
//      (or a singular property whose `$ref`) points AT that schema. The property NAME
//      found this way (e.g. "tickets", "audits", "comments") is the vendor's own
//      authoritative plural/singular key — never guessed via naive pluralization.
//   3. It then reverse-maps that WRAPPER schema to the actual GET path(s) that return
//      it, which is how APIPath / list-vs-single / create/update/delete paths are
//      derived — schema identity FIRST, path SECOND (the inverse of a path-first walk).
//   4. allOf compositions are merged (mergeAllOf) so a schema built via composition
//      still yields its full flattened property set.
//
// This never reads the extractor's script, its EXTRACTION_REPORT, or its matrix, and
// never reads the connector's own source code. It reads ONLY:
//   - the pinned SOURCES.json-referenced OpenAPI artifacts under sources/*.json
//   - the floor's enumerate-catalog.mjs (run as a subprocess, informational baseline)
//   - the ALREADY-WRITTEN metadata file, and ONLY in the diff step below.
//
// All findings are computed by this script and printed as its own stdout (P9: a
// finding is script output, never an eyeballed inventory).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(CONNECTOR_DIR, '../../../..');
const METADATA_FILE = path.join(REPO_ROOT, 'metadata/integrations/zendesk/.zendesk.integration.json');
const FLOOR_ENUMERATOR = path.join(REPO_ROOT, 'packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs');
const RUN_OUTPUT_DIR = path.join(CONNECTOR_DIR, 'runs/connector-zendesk-1783120273097-639b6951/output');
const ARTIFACT_PATH = path.join(RUN_OUTPUT_DIR, 'DUAL_DERIVATION.json');

const SOURCE_SPECS = [
    { label: 'ticketing', file: path.join(CONNECTOR_DIR, 'sources/ticketing-oas.json') },
    { label: 'helpcenter', file: path.join(CONNECTOR_DIR, 'sources/helpcenter-oas.json') },
];

// ────────────────────────────── $ref resolution ──────────────────────────────

function resolveRef(spec, ref) {
    if (!ref || !ref.startsWith('#/')) return null;
    const parts = ref
        .slice(2)
        .split('/')
        .map((p) => decodeURIComponent(p.replace(/~1/g, '/').replace(/~0/g, '~')));
    let node = spec;
    for (const p of parts) {
        node = node?.[p];
        if (node === undefined) return null;
    }
    return node;
}

function schemaRefName(ref) {
    const m = /^#\/components\/schemas\/(.+)$/.exec(ref || '');
    return m ? m[1] : null;
}

// Merge allOf compositions + follow a single top-level $ref one level. Returns a
// flattened { properties, required } shape. Does NOT deep-expand nested object
// properties — only the schema's own direct property set.
function mergeAllOf(spec, schema, seen = new Set()) {
    if (!schema) return { properties: {}, required: [] };
    if (schema.$ref) {
        if (seen.has(schema.$ref)) return { properties: {}, required: [] };
        seen.add(schema.$ref);
        return mergeAllOf(spec, resolveRef(spec, schema.$ref), seen);
    }
    // allOf = composition (all members present); anyOf/oneOf here are treated as a
    // best-effort UNION of member shapes (e.g. Zendesk's UserObject = anyOf
    // [UserForAdmin, UserForEndUser], a role-based field-visibility split) — for
    // field-set derivation purposes we want the aggregate superset, not a 0-field
    // result from failing to recurse into the union at all.
    const branches = schema.allOf || schema.anyOf || schema.oneOf;
    if (Array.isArray(branches)) {
        const merged = { properties: {}, required: [] };
        for (const sub of branches) {
            const r = mergeAllOf(spec, sub, seen);
            merged.properties = { ...merged.properties, ...r.properties };
            merged.required = [...merged.required, ...(r.required || [])];
        }
        // allOf's own required list is authoritative (intersection semantics don't
        // apply the same way to anyOf/oneOf); only allOf accumulates required here.
        if (!schema.allOf) merged.required = [];
        return merged;
    }
    return { properties: schema.properties || {}, required: schema.required || [] };
}

// Classify a (possibly $ref'd) property schema into a coarse kind used for
// scalar-vs-object/array FK-misclassification checks and type comparison.
function propKind(spec, propSchema) {
    let s = propSchema;
    if (!s) return { kind: 'unknown' };
    if (s.$ref) {
        const resolved = resolveRef(spec, s.$ref);
        s = resolved || s;
    }
    // allOf/anyOf/oneOf all get merged the same way here: in this vendor's spec every
    // observed anyOf/oneOf composes OBJECT subtypes (e.g. UserInput = anyOf
    // [UserCreateInput, UserMergeInput]), never a scalar-vs-object union — so
    // resolving them to their merged property set (rather than a generic 'union'
    // that downstream object/array-vs-scalar checks don't recognize) is what makes
    // FK-misclassification and body-wrap detection work for these compositions.
    if (Array.isArray(s.allOf) || Array.isArray(s.anyOf) || Array.isArray(s.oneOf)) {
        const merged = mergeAllOf(spec, s);
        if (Object.keys(merged.properties).length > 0) {
            s = { type: 'object', properties: merged.properties };
        }
    }
    if (s.type === 'array') {
        const itemsKind = propKind(spec, s.items);
        return { kind: itemsKind.kind === 'object' ? 'array-object' : 'array-scalar', openApiType: 'array' };
    }
    if (s.type === 'object' || (s.properties && !s.type)) return { kind: 'object', openApiType: 'object' };
    if (s.oneOf || s.anyOf) return { kind: 'union', openApiType: 'union' };
    return { kind: 'scalar', openApiType: s.type || 'unknown', format: s.format, nullable: !!s.nullable, readOnly: !!s.readOnly };
}

// ────────────────────────────── schema-first resource derivation ──────────────────────────────

function findObjectSchemas(spec) {
    const schemas = spec.components?.schemas || {};
    return Object.keys(schemas).filter((n) => /Object$/.test(n) && n !== 'Object');
}

// Reverse-scan every schema for a property that references `targetSchemaName` — either
// as an array-of-items (plural wrapper) or a direct $ref (singular wrapper). Returns the
// wrapper schema name + the property key (the vendor's own authoritative name).
//
// CRITICAL: a "wrapper" only counts as a genuine top-level RESOURCE wrapper if the
// wrapper schema itself is actually returned by some HTTP response (`responseIndex`
// has it). Without this filter, nested config/value sub-objects (e.g. every property
// of AccountSettingsObject pointing at AccountSettingsXxxObject sub-schemas) are
// misidentified as independently-syncable resources — these are inline attributes of
// a single settings singleton, never separately listed/CRUD-able. This is precisely
// the class of false positive a schema-only (no-response-reachability) walk produces.
// Returns ALL candidate wrappers (not just the first alphabetically-encountered one).
// A record type is frequently wrapped by SEVERAL response schemas (a canonical list
// response plus specialized variants — e.g. Zendesk's incremental-export responses
// `CursorBasedExportIncrementalTicketsResponse` / `TimeBasedExportIncrementalTicketsResponse`
// also carry a `tickets` array alongside the canonical `TicketsResponse`). Picking only
// the first name encountered (declaration order) can lock onto a specialized variant
// instead of the canonical one; the caller instead searches ACROSS every candidate's
// mapped endpoints and picks the globally shortest/most-generic path.
function findWrappers(spec, targetSchemaName, responseIndex) {
    const targetRef = `#/components/schemas/${targetSchemaName}`;
    const schemas = spec.components?.schemas || {};
    const arrayWrappers = [];
    const singularWrappers = [];
    for (const [wrapperName, wrapperSchema] of Object.entries(schemas)) {
        if (!responseIndex.has(wrapperName)) continue; // must be response-reachable
        // Many list-response wrappers compose a shared pagination shape via allOf
        // (e.g. `allOf: [OffsetPaginationObject, {properties: {brands: [...]}}]`) —
        // merge it so the array/singular property isn't invisible to a flat scan.
        const merged = Array.isArray(wrapperSchema?.allOf) ? mergeAllOf(spec, wrapperSchema) : { properties: wrapperSchema?.properties || {} };
        const props = merged.properties || {};
        for (const [propName, propSchema] of Object.entries(props)) {
            if (!propSchema) continue;
            if (propSchema.type === 'array' && propSchema.items?.$ref === targetRef) {
                arrayWrappers.push({ wrapperName, propName });
            } else if (propSchema.$ref === targetRef) {
                singularWrappers.push({ wrapperName, propName });
            }
        }
    }
    return { arrayWrappers, singularWrappers };
}

// Build a map: schemaName (as referenced in a 2xx JSON response) -> [{path, method}]
function buildResponseSchemaIndex(spec) {
    const index = new Map();
    for (const [p, pathItem] of Object.entries(spec.paths || {})) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
            const op = pathItem[method];
            if (!op) continue;
            for (const [status, resp] of Object.entries(op.responses || {})) {
                if (!/^2\d\d$/.test(status)) continue;
                const schema = resp.content?.['application/json']?.schema;
                if (!schema) continue;
                let ref = schema.$ref;
                if (!ref && schema.oneOf?.length) ref = schema.oneOf[0].$ref;
                const name = schemaRefName(ref);
                if (!name) continue;
                if (!index.has(name)) index.set(name, []);
                index.get(name).push({ path: p, method, status, hasLocationHeader: !!resp.headers?.Location });
            }
        }
    }
    return index;
}

function resolveParam(spec, paramOrRef) {
    if (paramOrRef.$ref) return resolveRef(spec, paramOrRef.$ref) || paramOrRef;
    return paramOrRef;
}

function collectParams(spec, pathItem, op) {
    const raw = [...(pathItem.parameters || []), ...(op?.parameters || [])];
    return raw.map((p) => resolveParam(spec, p));
}

function classifyPagination(spec, pathItem, op) {
    const params = collectParams(spec, pathItem, op).map((p) => p.name).filter(Boolean);
    const hasDeepObjectPage = params.includes('page'); // Zendesk's dual page param (oneOf int | {after,before,size})
    const hasPerPage = params.includes('per_page');
    const hasCursorSort = params.includes('sort') || params.includes('sort_by');
    if (hasDeepObjectPage && (hasPerPage || hasCursorSort)) return 'dual';
    if (hasDeepObjectPage) return 'offset-or-dual';
    if (hasPerPage) return 'offset';
    return 'none';
}

function findIncrementalEvidence(spec, objectKey) {
    // A genuinely distinct Zendesk API family: /incremental/<resource>[/cursor]
    const paths = Object.keys(spec.paths || {});
    const candidates = [`/api/v2/incremental/${objectKey}`, `/api/v2/incremental/${objectKey.replace(/s$/, '')}`];
    for (const c of candidates) {
        if (paths.includes(c)) {
            const pathItem = spec.paths[c];
            const params = collectParams(spec, pathItem, pathItem.get).map((p) => p.name);
            const watermarkParam = params.find((n) => /start_time|since|updated_since/i.test(n || ''));
            return { hasIncrementalEndpoint: true, path: c, watermarkParam: watermarkParam || null };
        }
    }
    return { hasIncrementalEndpoint: false, path: null, watermarkParam: null };
}

function pickShortestPath(entries, method) {
    const filtered = entries.filter((e) => e.method === method);
    if (!filtered.length) return null;
    filtered.sort((a, b) => a.path.length - b.path.length);
    return filtered[0];
}

function singularCandidates(objectKey) {
    const out = new Set([objectKey]);
    out.add(objectKey.replace(/ies$/, 'y'));
    out.add(objectKey.replace(/ses$/, 's'));
    out.add(objectKey.replace(/s$/, ''));
    return [...out];
}

function deriveBodyShape(spec, op, objectKey) {
    if (!op?.requestBody) return { present: false };
    const schema = op.requestBody.content?.['application/json']?.schema;
    if (!schema) return { present: false };
    const resolved = mergeAllOf(spec, schema);
    const propNames = Object.keys(resolved.properties || {});
    // Prefer the property whose name is a plausible singular of the resource's own
    // key (e.g. "ticket" for objectKey "tickets") — a request body MAY carry an
    // additional sibling property (Zendesk's TicketCreateRequest also has an
    // internal-only "system_metadata" field alongside "ticket"), so requiring
    // EXACTLY one property is too strict and misclassifies a genuinely wrapped body
    // as flat whenever a sibling property exists.
    const candidates = objectKey ? singularCandidates(objectKey) : [];
    const namedWrap = propNames.find((n) => candidates.includes(n) && propKind(spec, resolved.properties[n]).kind === 'object');
    if (namedWrap) return { present: true, shape: 'wrapped', bodyKey: namedWrap };
    if (propNames.length === 1) {
        const only = resolved.properties[propNames[0]];
        const kind = propKind(spec, only);
        if (kind.kind === 'object') return { present: true, shape: 'wrapped', bodyKey: propNames[0] };
    }
    return { present: true, shape: 'flat', bodyKey: null };
}

function deriveIDLocation(entry) {
    // Rule (per task spec): wrapper key present -> wrapped; 201 Location header present -> IDLocation=header.
    return entry?.hasLocationHeader ? 'header' : 'body';
}

function deriveResourceCandidates(spec, specLabel) {
    const objectSchemas = findObjectSchemas(spec);
    const responseIndex = buildResponseSchemaIndex(spec);
    const candidates = new Map();
    const unreachable = [];

    for (const schemaName of objectSchemas) {
        const { arrayWrappers, singularWrappers } = findWrappers(spec, schemaName, responseIndex);
        if (!arrayWrappers.length && !singularWrappers.length) {
            unreachable.push(schemaName);
            continue;
        }
        const objectKey = arrayWrappers[0]?.propName || singularWrappers[0]?.propName;

        // Search ACROSS every candidate wrapper's mapped endpoints for the globally
        // shortest/most-generic GET path — see findWrappers' comment for why picking
        // only the first-declared wrapper name can lock onto a specialized variant
        // (e.g. an /incremental/... export path) instead of the canonical list route.
        const listEntriesAll = arrayWrappers.flatMap((w) => responseIndex.get(w.wrapperName) || []);
        const singleEntriesAll = singularWrappers.flatMap((w) => responseIndex.get(w.wrapperName) || []);

        const listGet = pickShortestPath(listEntriesAll, 'get');
        const singleGet = pickShortestPath(singleEntriesAll, 'get');
        const apiPath = listGet?.path || singleGet?.path || null;
        const singlePath = singleGet?.path || null;

        // A wrapper that is response-reachable in the abstract but has NO actual GET
        // operation anywhere (e.g. it's only ever a request-body / write-only shape,
        // or reachable solely via a POST/PUT response with no corresponding read) is
        // not a syncable top-level resource — skip rather than emit a phantom object.
        if (!apiPath) {
            unreachable.push(`${schemaName}(no-GET-path)`);
            continue;
        }

        const listPathItem = apiPath ? spec.paths[apiPath] : null;
        const singlePathItem = singlePath ? spec.paths[singlePath] : null;

        const createOp = listPathItem?.post || null;
        const updateOp = singlePathItem?.put || singlePathItem?.patch || null;
        const deleteOp = singlePathItem?.delete || null;

        const createResponses = createOp
            ? Object.entries(createOp.responses || {}).filter(([s]) => /^2\d\d$/.test(s))
            : [];
        const createHasLocation = createResponses.some(([, r]) => !!r.headers?.Location);

        const resolved = mergeAllOf(spec, { $ref: `#/components/schemas/${schemaName}` });
        const fields = Object.entries(resolved.properties || {}).map(([name, propSchema]) => {
            const kind = propKind(spec, propSchema);
            return {
                name,
                kind: kind.kind,
                openApiType: kind.openApiType,
                readOnly: !!propSchema?.readOnly || !!kind.readOnly,
                nullable: !!propSchema?.nullable || !!kind.nullable,
                required: (resolved.required || []).includes(name),
                isIdSuffixed: /_id$/.test(name) && name !== 'id',
            };
        });

        const pkCandidate = fields.find((f) => f.name === 'id') ? 'id' : null;

        const paginationEvidence = listPathItem ? classifyPagination(spec, listPathItem, listPathItem.get) : 'none';
        const incrementalEvidence = findIncrementalEvidence(spec, objectKey);

        candidates.set(objectKey, {
            objectKey,
            specLabel,
            schemaName,
            apiPath,
            singlePath,
            hasListEndpoint: !!listGet,
            pkCandidate,
            fields,
            supportsCreate: !!createOp,
            supportsUpdate: !!updateOp,
            supportsDelete: !!deleteOp,
            createBodyShape: deriveBodyShape(spec, createOp, objectKey),
            updateBodyShape: deriveBodyShape(spec, updateOp, objectKey),
            createIDLocation: createOp ? deriveIDLocation({ hasLocationHeader: createHasLocation }) : null,
            paginationEvidence,
            incrementalEvidence,
        });
    }
    return { candidates, unreachable };
}

// ────────────────────────────── metadata diff step (ONLY place the metadata file is read) ──────────────────────────────

function loadMetadataIOs() {
    const raw = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    const top = raw[0];
    const ios = top.relatedEntities['MJ: Integration Objects'] || [];
    return ios.map((io) => {
        const f = io.fields;
        const iofs = (io.relatedEntities?.['MJ: Integration Object Fields'] || []).map((x) => x.fields);
        return { name: f.Name, io: f, fields: iofs };
    });
}

const TYPE_COMPAT = {
    integer: new Set(['int', 'integer', 'bigint']),
    number: new Set(['float', 'decimal', 'number', 'double']),
    boolean: new Set(['boolean', 'bool']),
    string: new Set(['string', 'datetime', 'date', 'email', 'text']),
    object: new Set(['json', 'object']),
    array: new Set(['json', 'array', 'string']),
    'array-object': new Set(['json', 'array', 'string']),
    'array-scalar': new Set(['json', 'array', 'string']),
};

function typeCompatible(openApiType, emittedType) {
    const set = TYPE_COMPAT[openApiType];
    if (!set) return true; // unknown OpenAPI type -> don't flag
    return set.has((emittedType || '').toLowerCase());
}

function aliasesFor(objectKey) {
    const set = new Set([objectKey]);
    const prefixes = [
        'ticket_', 'organization_', 'user_', 'group_', 'post_', 'article_', 'custom_object_',
        'routing_', 'community_', 'help_center_', 'omnichannel_', 'macro_', 'trigger_', 'itam_',
    ];
    for (const p of prefixes) {
        if (objectKey.startsWith(p)) set.add(objectKey.slice(p.length));
    }
    for (const p of prefixes) {
        if (!objectKey.startsWith(p)) set.add(`${p}${objectKey}`);
    }
    // Generic bidirectional pluralization — a schema-first walk recovers whichever
    // form the wrapper property happened to use (singular vs plural), which can
    // differ from the emitted IO's convention without indicating a real gap.
    const base = [...set];
    for (const k of base) {
        if (/s$/.test(k)) set.add(k.replace(/s$/, ''));
        else set.add(`${k}s`);
        if (/y$/.test(k)) set.add(k.replace(/y$/, 'ies'));
        if (/ies$/.test(k)) set.add(k.replace(/ies$/, 'y'));
    }
    return [...set];
}

function normalizePathForCompare(p) {
    return (p || '').replace(/\{[^}]+\}/g, '{param}');
}

function diffObject(candidate, emitted) {
    const emittedFieldNames = new Set(emitted.fields.map((f) => f.Name));
    const derivedFieldNames = new Set(candidate.fields.map((f) => f.name));

    const missingFields = candidate.fields.filter((f) => !emittedFieldNames.has(f.name)).map((f) => f.name);
    const extraFields = emitted.fields.filter((f) => !derivedFieldNames.has(f.Name)).map((f) => f.Name);

    let pathMismatch;
    if (candidate.apiPath) {
        const derivedNorm = normalizePathForCompare(candidate.apiPath);
        const emittedNorm = normalizePathForCompare(emitted.io.APIPath);
        if (derivedNorm !== emittedNorm) {
            pathMismatch = `derived='${candidate.apiPath}' emitted='${emitted.io.APIPath}'`;
        }
    }

    let pkMismatch;
    const emittedPKFields = emitted.fields.filter((f) => f.IsPrimaryKey).map((f) => f.Name);
    if (candidate.pkCandidate) {
        if (!emittedPKFields.includes(candidate.pkCandidate)) {
            pkMismatch = `derived PK='${candidate.pkCandidate}' emitted PKs=[${emittedPKFields.join(',')}]`;
        }
    }

    const writeOpsMissing = [];
    if (candidate.supportsCreate && !emitted.io.SupportsCreate) writeOpsMissing.push('Create');
    if (candidate.supportsUpdate && !emitted.io.SupportsUpdate) writeOpsMissing.push('Update');
    if (candidate.supportsDelete && !emitted.io.SupportsDelete) writeOpsMissing.push('Delete');

    const fkMisclassified = [];
    const fieldByName = new Map(candidate.fields.map((f) => [f.name, f]));
    for (const ef of emitted.fields) {
        if (!ef.IsForeignKey) continue;
        const derivedField = fieldByName.get(ef.Name);
        if (derivedField && (derivedField.kind === 'object' || derivedField.kind === 'array-object')) {
            fkMisclassified.push(ef.Name);
        }
    }

    // NOTE: absence of declared page/per_page/sort params on a given operation is
    // WEAK evidence (many Zendesk list endpoints rely on the platform-wide default
    // pagination convention without re-declaring it per-operation in the OAS) — so
    // 'none' evidence is deliberately NOT treated as a contradiction of a declared
    // SupportsPagination=true. Only flag a genuine, positively-evidenced contradiction.
    let paginationMismatch;
    if (candidate.paginationEvidence === 'dual' && emitted.io.PaginationType === 'None') {
        paginationMismatch = `spec declares an explicit dual cursor/offset 'page' param, emitted PaginationType='None'`;
    } else if (candidate.paginationEvidence === 'offset' && emitted.io.PaginationType === 'Cursor') {
        paginationMismatch = `spec shows only offset-style params (per_page, no dual 'page'), emitted PaginationType='Cursor'`;
    }

    // NOTE: only the SUPPORT boolean is compared here, not the specific watermark
    // FIELD name. `incr.watermarkParam` is the WIRE query-param name Zendesk's
    // time-based incremental-export endpoint accepts (always "start_time" across
    // every /incremental/<x> endpoint), which is a DIFFERENT concept from
    // `IncrementalWatermarkField` (the RECORD field the emitted metadata tracks for
    // comparison, e.g. "updated_at"/"created_at") — comparing the two directly
    // produced systematic false mismatches (every incremental object flagged, since
    // the wire param is always "start_time" while the tracked field legitimately
    // varies per object). Only a genuine capability contradiction is flagged.
    let watermarkMismatch;
    const incr = candidate.incrementalEvidence;
    if (incr.hasIncrementalEndpoint && !emitted.io.SupportsIncrementalSync) {
        watermarkMismatch = `spec has ${incr.path} incremental endpoint but emitted SupportsIncrementalSync=false`;
    } else if (!incr.hasIncrementalEndpoint && emitted.io.SupportsIncrementalSync) {
        watermarkMismatch = `no /incremental/${candidate.objectKey} endpoint found but emitted SupportsIncrementalSync=true (field=${emitted.io.IncrementalWatermarkField})`;
    }

    let bodyShapeMismatch;
    const bsIssues = [];
    if (candidate.createBodyShape.present && emitted.io.SupportsCreate) {
        if (candidate.createBodyShape.shape && candidate.createBodyShape.shape !== (emitted.io.CreateBodyShape || '').toLowerCase()) {
            bsIssues.push(`create: derived=${candidate.createBodyShape.shape} emitted=${emitted.io.CreateBodyShape}`);
        }
        if (candidate.createBodyShape.bodyKey && candidate.createBodyShape.bodyKey !== emitted.io.CreateBodyKey) {
            bsIssues.push(`createBodyKey: derived=${candidate.createBodyShape.bodyKey} emitted=${emitted.io.CreateBodyKey}`);
        }
        if (candidate.createIDLocation && candidate.createIDLocation !== (emitted.io.CreateIDLocation || '').toLowerCase()) {
            bsIssues.push(`createIDLocation: derived=${candidate.createIDLocation} emitted=${emitted.io.CreateIDLocation}`);
        }
    }
    if (bsIssues.length) bodyShapeMismatch = bsIssues.join('; ');

    const typeMismatches = [];
    for (const df of candidate.fields) {
        if (!emittedFieldNames.has(df.name)) continue;
        const ef = emitted.fields.find((f) => f.Name === df.name);
        if (!ef) continue;
        if (!typeCompatible(df.openApiType, ef.Type)) {
            typeMismatches.push(`${df.name}: derived=${df.openApiType} emitted=${ef.Type}`);
        }
    }

    const diverged =
        missingFields.length > 0 ||
        extraFields.length > 0 ||
        !!pathMismatch ||
        !!pkMismatch ||
        writeOpsMissing.length > 0 ||
        fkMisclassified.length > 0 ||
        !!paginationMismatch ||
        !!watermarkMismatch ||
        !!bodyShapeMismatch ||
        typeMismatches.length > 0;

    return {
        object: candidate.objectKey,
        diverged,
        rederivedFieldCount: candidate.fields.length,
        emittedFieldCount: emitted.fields.length,
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
    };
}

// ────────────────────────────── main ──────────────────────────────

function runFloorEnumerator(sourceFile) {
    try {
        const out = execFileSync('node', [FLOOR_ENUMERATOR, sourceFile], { encoding: 'utf8' });
        return JSON.parse(out);
    } catch (err) {
        return { format: 'error', recordTypes: [], count: 0, confidence: 'low', error: String(err.message || err) };
    }
}

function main() {
    mkdirSync(RUN_OUTPUT_DIR, { recursive: true });

    // Baseline informational cross-check (raw schema-level, high-confidence per-file).
    const floorBaselines = SOURCE_SPECS.map((s) => ({
        label: s.label,
        result: runFloorEnumerator(s.file),
    }));

    // Independent schema-first, $ref-chased resource derivation.
    const allCandidates = new Map();
    const allUnreachable = [];
    for (const s of SOURCE_SPECS) {
        const spec = JSON.parse(readFileSync(s.file, 'utf8'));
        const { candidates, unreachable } = deriveResourceCandidates(spec, s.label);
        for (const [k, v] of candidates) {
            if (!allCandidates.has(k)) allCandidates.set(k, v);
        }
        allUnreachable.push(...unreachable.map((n) => `${s.label}:${n}`));
    }

    const enumeratedCount = allCandidates.size;

    // ONLY place the metadata file is read — the diff step.
    const emittedIOs = loadMetadataIOs();
    const emittedByName = new Map(emittedIOs.map((io) => [io.name, io]));

    // Object-set diff with alias-tolerant matching (naming-convention divergence is
    // expected between independent parsers and is NOT itself a defect). A NON-exact
    // alias match (e.g. prefix-stripped/pluralized) is only accepted if the derived
    // and emitted field sets actually overlap meaningfully — otherwise a shared
    // prefix/suffix pattern (e.g. generic "attachment" vs "article_attachments") can
    // spuriously correlate two UNRELATED resources, fabricating a diff that is really
    // a matching bug, not a real divergence.
    // TWO-PASS, EXCLUSIVE matching: an emitted IO may be CLAIMED by at most one
    // derived candidate. Without this, a correct exact match (e.g.
    // "organization_subscriptions" -> "organization_subscriptions") and an UNRELATED
    // candidate's fuzzy alias fallback (e.g. generic "subscriptions" also generating
    // the alias "organization_subscriptions") could BOTH claim the same emitted IO —
    // which doesn't corrupt the object-set diff (the name is claimed either way) but
    // DOES fabricate a bogus per-object diff for the wrong candidate. Exact matches
    // are resolved first and reserve their emitted IO before any fuzzy pass runs.
    const claimed = new Set();
    const matchedPairs = [];
    const remaining = [];
    for (const [key, candidate] of allCandidates) {
        if (emittedByName.has(key) && !claimed.has(key)) {
            claimed.add(key);
            matchedPairs.push({ candidate, emitted: emittedByName.get(key) });
        } else {
            remaining.push([key, candidate]);
        }
    }

    const objectsMissing = [];
    for (const [key, candidate] of remaining) {
        const aliases = aliasesFor(key).filter((a) => a !== key);
        const derivedFieldNameSet = new Set(candidate.fields.map((f) => f.name));
        let matchName = null;
        for (const a of aliases) {
            if (!emittedByName.has(a) || claimed.has(a)) continue;
            // Fuzzy (non-exact) alias matching is only trusted when the candidate has
            // a genuine LIST endpoint. Single-record-only resources (e.g. a generic
            // /attachments/{id} fetch-by-id with no list) have small, generic field
            // sets ("id", "url", "content_type", "size"...) that spuriously overlap
            // with unrelated same-shaped resources — a real risk of mismatching two
            // genuinely different objects rather than finding a genuine naming alias.
            if (!candidate.hasListEndpoint) continue;
            const emittedCandidate = emittedByName.get(a);
            const overlap = emittedCandidate.fields.filter((f) => derivedFieldNameSet.has(f.Name)).length;
            const minSize = Math.min(candidate.fields.length, emittedCandidate.fields.length) || 1;
            if (overlap >= 3 && overlap / minSize >= 0.5) {
                matchName = a;
                break;
            }
        }
        if (matchName) {
            claimed.add(matchName);
            matchedPairs.push({ candidate, emitted: emittedByName.get(matchName) });
        } else {
            objectsMissing.push(key);
        }
    }

    const objectsExtra = [...emittedByName.keys()].filter((n) => !claimed.has(n));

    // Per-object diff for every matched pair.
    const allDiffs = matchedPairs.map(({ candidate, emitted }) => diffObject(candidate, emitted));
    const divergedDiffs = allDiffs.filter((d) => d.diverged);

    const divergenceHistogram = {
        missingFields: allDiffs.filter((d) => d.missingFields.length > 0).length,
        extraFields: allDiffs.filter((d) => d.extraFields.length > 0).length,
        typeMismatches: allDiffs.filter((d) => d.typeMismatches.length > 0).length,
        fkMisclassified: allDiffs.filter((d) => d.fkMisclassified.length > 0).length,
        writeOpsMissing: allDiffs.filter((d) => d.writeOpsMissing.length > 0).length,
        pkMismatch: allDiffs.filter((d) => d.pkMismatch).length,
        pathMismatch: allDiffs.filter((d) => d.pathMismatch).length,
        paginationMismatch: allDiffs.filter((d) => d.paginationMismatch).length,
        watermarkMismatch: allDiffs.filter((d) => d.watermarkMismatch).length,
        bodyShapeMismatch: allDiffs.filter((d) => d.bodyShapeMismatch).length,
    };

    // Actionable-only capped sample: prioritize structural/coverage divergences over
    // advisory noise (extraFields/typeMismatches alone, from second-parser under-count).
    const actionable = divergedDiffs.filter(
        (d) =>
            d.missingFields.length > 0 ||
            d.fkMisclassified.length > 0 ||
            d.writeOpsMissing.length > 0 ||
            d.pkMismatch ||
            d.pathMismatch ||
            d.bodyShapeMismatch ||
            d.paginationMismatch ||
            d.watermarkMismatch,
    );
    const perObject = actionable.slice(0, 40).map((d) => ({
        object: d.object,
        diverged: true,
        rederivedFieldCount: d.rederivedFieldCount,
        emittedFieldCount: d.emittedFieldCount,
        missingFields: d.missingFields,
        extraFields: d.extraFields,
        ...(d.pathMismatch ? { pathMismatch: d.pathMismatch } : {}),
        ...(d.pkMismatch ? { pkMismatch: d.pkMismatch } : {}),
        writeOpsMissing: d.writeOpsMissing,
        fkMisclassified: d.fkMisclassified,
        ...(d.paginationMismatch ? { paginationMismatch: d.paginationMismatch } : {}),
        ...(d.watermarkMismatch ? { watermarkMismatch: d.watermarkMismatch } : {}),
        ...(d.bodyShapeMismatch ? { bodyShapeMismatch: d.bodyShapeMismatch } : {}),
        typeMismatches: d.typeMismatches,
    }));

    const artifact = {
        vendor: 'zendesk',
        generatedAt: new Date().toISOString(),
        strategy:
            "Schema-first, $ref-chased derivation: enumerate OpenAPI component schemas matching Zendesk's own '<Base>Object' canonical-record naming convention, then reverse-scan all schemas for the wrapper (array-of-items or singular $ref) that references each Object schema to recover the vendor's own authoritative field key (list/single JSON key) — resource identity is derived from schema $ref graph structure, NOT from URL path segments (the likely first-pass path-first strategy). allOf compositions are merged for full property-set resolution. Wrapper schemas are then reverse-mapped to their GET/POST/PUT/PATCH/DELETE paths to recover APIPath, CRUD support, body shape, pagination params, and (via a distinct /incremental/<resource> path-family check) incremental-watermark evidence.",
        sourcesUsed: SOURCE_SPECS.map((s) => path.relative(REPO_ROOT, s.file)),
        floorEnumeratorBaselines: floorBaselines.map((b) => ({
            label: b.label,
            format: b.result.format,
            rawSchemaCount: b.result.count,
            confidence: b.result.confidence,
        })),
        unreachableObjectSchemas: allUnreachable,
        enumeratedCount,
        objectsMissing: objectsMissing.sort(),
        objectsExtra: objectsExtra.sort(),
        objectsDivergedCount: divergedDiffs.length,
        divergenceHistogram,
        matchedObjectCount: matchedPairs.length,
        allDiffs,
    };

    writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));

    const summary = {
        artifact: path.relative(REPO_ROOT, ARTIFACT_PATH),
        strategy: 'schema-first $ref-chased derivation (Object-schema convention + reverse wrapper scan), vs a path-first walk',
        enumeratedCount,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount: divergedDiffs.length,
        divergenceHistogram,
        perObject,
    };

    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main();
