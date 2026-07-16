#!/usr/bin/env node
// dual-derivation-p8.mjs — INDEPENDENT second-parser derivation for the impexium connector (v2 P8).
//
// STRATEGY (deliberately different from a naive path-first / tag-grouping walk):
//   $REF-CHASED RESPONSE-SCHEMA BINDING, not path/tag string-matching.
//   For every operation in the pinned Swagger 2.0 source, this script resolves the operation's
//   response schema (chasing `$ref`, including the common `{ pageNumber, dataList: [ {$ref} ] }`
//   pagination-wrapper shape) to determine which of the 73 `definitions` schemas it actually
//   returns/writes. Objects are then identified from the RESOLVED SCHEMA GRAPH (schema-pointer
//   walk), and bound to operations via that resolved link — never by matching the path string or
//   the `tags` array (which is exactly the kind of grouping a first-pass extractor would likely use).
//   Object identity for cross-referencing against emitted IOs uses an ORDER-INDEPENDENT, SINGULARIZED
//   TOKEN-SET signature (camelCase tokenizer + generic technical-suffix stripping + naive
//   singularization), which is a genuinely different matching algorithm than substring/prefix
//   matching (it survives token-order differences like AwardRecipientIndividualData <->
//   AwardIndividualRecipients that a substring/prefix match would miss).
//
// SOURCE OF THE FULL RECORD-TYPE UNIVERSE: the shared, deterministic `enumerate-catalog.mjs`
// primitive (NOT the extractor's own script/report — it is a workshop-wide primitive referenced
// directly, per the task instructions) is invoked here exactly as specified, over the pinned
// swagger artifact.
//
// This script NEVER reads the extractor's script, its EXTRACTION_REPORT, or its matrix. It reads
// the metadata file `.impexium.integration.json` ONLY here, in its own diff step, to compute the
// object-set / field-set / attribute divergence. All findings are this script's stdout.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_DIR = path.resolve(__dirname, '..');
const SWAGGER_PATH = path.join(CONNECTOR_DIR, 'sources', 'apiDefinition.swagger.json');
const METADATA_PATH = path.resolve(CONNECTOR_DIR, '..', '..', '..', '..', 'metadata', 'integrations', 'impexium', '.impexium.integration.json');
const ENUMERATE_CATALOG_MJS = path.resolve(CONNECTOR_DIR, '..', '..', 'connector-builder-workshop', 'floor', 'enumerate-catalog.mjs');
const RUN_ID = 'connector-impexium-1783808479438-3654ffe5';
const OUTPUT_DIR = path.join(CONNECTOR_DIR, 'runs', RUN_ID, 'output');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'DUAL_DERIVATION.json');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load pinned source (swagger). This is the ONLY authored-content source read.
// ─────────────────────────────────────────────────────────────────────────────
const swagger = JSON.parse(readFileSync(SWAGGER_PATH, 'utf8'));
const definitions = swagger.definitions ?? {};
const paths = swagger.paths ?? {};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Full record-type universe via the shared, deterministic primitive (independent
//    invocation — run fresh against the pinned artifact, not read from any prior report).
// ─────────────────────────────────────────────────────────────────────────────
function runEnumerateCatalog(sourcePath) {
    const stdout = execFileSync(process.execPath, [ENUMERATE_CATALOG_MJS, sourcePath], { encoding: 'utf8' });
    return JSON.parse(stdout);
}
const catalogResult = runEnumerateCatalog(SWAGGER_PATH);
const enumeratedUniverse = catalogResult.recordTypes ?? [];
const enumeratedCount = catalogResult.count ?? enumeratedUniverse.length;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Token-set signature — the identity function used to cross-reference source
//    definitions against emitted IO names, independent of word-order / suffix noise.
// ─────────────────────────────────────────────────────────────────────────────
// NOTE: 'request'/'response' are deliberately NOT here — for THIS vendor "Request"/"Requests"
// (Customer Requests) is a real domain object, not a generic wrapper word. Stripping it collapsed
// RequestData's signature to empty and broke matching against the "CustomerRequests" IO — caught
// by manual inspection of a suspicious primary-binding result, fixed here rather than silently
// left in (a token-noise list is inherently vendor-adjacent judgment, not just plumbing).
const NOISE_TOKENS = new Set([
    'data', 'save', 'update', 'updated', 'create', 'created', 'result', 'payload', 'basic',
    'set', 'list', 'info', 'dto', 'detail', 'details', 'sub',
]);

function camelTokenize(name) {
    return String(name)
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((t) => t.toLowerCase());
}

function singularize(tok) {
    if (tok.length <= 3) return tok;
    if (/ies$/.test(tok)) return tok.replace(/ies$/, 'y');
    if (/(ss|us)$/.test(tok)) return tok; // Address, Status — don't strip trailing 's' here
    if (/s$/.test(tok)) tok = tok.replace(/s$/, '');
    // Light past-tense normalization (a generic suffix rule, not a per-vendor mapping): "purchased"
    // vs "purchase" is the same root differing only in tense, and a strict plural-only singularizer
    // misses it (proven empirically: PurchasedItemData vs "Purchases" failed to match without this).
    if (tok.length > 5 && /ed$/.test(tok)) tok = tok.slice(0, -1); // "purchased" -> "purchase" (keep the 'e')
    return tok;
}

function tokenSignature(name) {
    const tokens = camelTokenize(name)
        .filter((t) => !NOISE_TOKENS.has(t))
        .map(singularize);
    return [...new Set(tokens)].sort();
}

function sigKey(sig) {
    return sig.join('|');
}

function sigOverlap(a, b) {
    const sa = new Set(a);
    const sb = new Set(b);
    let inter = 0;
    for (const t of sa) if (sb.has(t)) inter++;
    return inter / Math.max(1, Math.min(sa.size, sb.size));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Resolve $ref chains for response / request-body schemas — the schema-pointer walk.
// ─────────────────────────────────────────────────────────────────────────────
function defNameFromRef(ref) {
    if (typeof ref !== 'string') return null;
    const m = ref.match(/^#\/definitions\/(.+)$/);
    return m ? m[1] : null;
}

// Resolve a response/request schema down to: { defName, wrapper, listKey }
//   wrapper: 'direct' (schema.$ref), 'array' (schema.items.$ref), 'paged-list' (object with a
//   property that is an array of $ref — the {pageNumber, dataList:[...]} shape), 'inline' (no
//   named definition — an anonymous object/array schema), or null (nothing usable).
function resolveSchemaBinding(schema) {
    if (!schema || typeof schema !== 'object') return null;
    if (schema.$ref) {
        const defName = defNameFromRef(schema.$ref);
        return defName ? { defName, wrapper: 'direct' } : null;
    }
    if (schema.type === 'array' && schema.items?.$ref) {
        const defName = defNameFromRef(schema.items.$ref);
        return defName ? { defName, wrapper: 'array' } : null;
    }
    if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
            if (propSchema?.type === 'array' && propSchema.items?.$ref) {
                const defName = defNameFromRef(propSchema.items.$ref);
                if (defName) return { defName, wrapper: 'paged-list', listKey: propName };
            }
            if (propSchema?.$ref) {
                const defName = defNameFromRef(propSchema.$ref);
                if (defName) return { defName, wrapper: 'wrapped-object', listKey: propName };
            }
        }
        return { defName: null, wrapper: 'inline' };
    }
    return null;
}

function firstSuccessResponse(op) {
    const responses = op.responses ?? {};
    for (const code of ['200', '201']) {
        if (responses[code]) return { code, response: responses[code] };
    }
    const anyCode = Object.keys(responses).find((c) => /^2\d\d$/.test(c));
    return anyCode ? { code: anyCode, response: responses[anyCode] } : null;
}

function requestBodySchema(op) {
    const bodyParam = (op.parameters ?? []).find((p) => p.in === 'body');
    return bodyParam?.schema ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Walk every operation; bind to definitions via resolved schema, both for READ (response)
//    and WRITE (request body) directions, and capture path/query parameters.
// ─────────────────────────────────────────────────────────────────────────────
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Per-definition aggregated evidence.
const defEvidence = new Map(); // defName -> { readOps:[], writeOps:[], deleteOps:[] }
function getDefEvidence(defName) {
    if (!defEvidence.has(defName)) {
        defEvidence.set(defName, { readOps: [], writeOps: [], deleteOps: [] });
    }
    return defEvidence.get(defName);
}

for (const [urlPath, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
        if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
        const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path');
        const queryParams = (op.parameters ?? []).filter((p) => p.in === 'query');
        const headerParams = (op.parameters ?? []).filter((p) => p.in === 'header');

        const succ = firstSuccessResponse(op);
        const responseBinding = succ ? resolveSchemaBinding(succ.response.schema) : null;
        const hasLocationHeader = !!succ?.response?.headers?.Location;

        const record = {
            method: method.toUpperCase(),
            path: urlPath,
            opId: op.operationId ?? null,
            tags: op.tags ?? [],
            pathParams: pathParams.map((p) => p.name),
            queryParams: queryParams.map((p) => p.name),
            responseWrapper: responseBinding?.wrapper ?? null,
            hasLocationHeader,
        };

        if (method.toLowerCase() === 'get' && responseBinding?.defName) {
            getDefEvidence(responseBinding.defName).readOps.push(record);
        } else if (['post', 'put', 'patch'].includes(method.toLowerCase())) {
            // Bind by response first (most reliable — the resolved return shape); fall back to
            // request-body $ref if the response is inline/untyped (some Add/Update ops return
            // only a bare 200 with no schema, or an inline ack object).
            const bodySchema = requestBodySchema(op);
            const bodyBinding = resolveSchemaBinding(bodySchema);
            const targetDef = responseBinding?.defName ?? bodyBinding?.defName ?? null;
            if (targetDef) {
                getDefEvidence(targetDef).writeOps.push({
                    ...record,
                    bodyShape: bodySchema
                        ? (bodySchema.$ref ? 'flat-ref' : bodySchema.type === 'object' ? 'flat-inline' : 'unknown')
                        : 'no-body',
                    bodyProps: bodySchema && !bodySchema.$ref ? Object.keys(bodySchema.properties ?? {}) : null,
                });
            }
        } else if (method.toLowerCase() === 'delete') {
            // Delete ops rarely carry a typed response; bind via path-param name matching in pass 2,
            // recorded here against every definition whose object family shares tokens with the path.
            getDefEvidence('__DELETE_OPS__').deleteOps.push(record);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Per-definition structural re-derivation: fields, PK candidates, FK candidates, types.
// ─────────────────────────────────────────────────────────────────────────────
function topLevelFields(defSchema) {
    const props = defSchema?.properties ?? {};
    return Object.entries(props).map(([name, schema]) => ({
        name,
        type: schema.type ?? (schema.$ref ? 'ref' : 'unknown'),
        format: schema.format ?? null,
        isNestedObject: schema.type === 'object',
        isNestedArray: schema.type === 'array',
    }));
}

function bucketForSwaggerType(type, format) {
    if (type === 'string') return format === 'date-time' || format === 'date' ? 'datetime' : 'string';
    if (type === 'integer' || type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';
    if (type === 'array' || type === 'object') return 'complex';
    return 'unknown';
}

function bucketForEmittedType(emittedType) {
    if (!emittedType) return 'unknown';
    const t = emittedType.toLowerCase();
    if (t.includes('bool')) return 'boolean';
    if (t.includes('int') || t.includes('number') || t.includes('float') || t.includes('decimal')) return 'number';
    if (t === 'datetime' || t.includes('date') || t.includes('time')) return 'datetime';
    if (t === 'json') return 'complex';
    if (t.includes('string')) return 'string';
    return 'unknown';
}

// Normalize a path-param / property name for PK cross-matching: lowercase, strip spaces/punct,
// drop generic qualifier words ("or", "the", "record", "number" kept since "recordnumber" is a
// real Impexium PK-ish field — only strip pure connective noise).
function normalizeIdentLoose(s) {
    return String(s)
        .toLowerCase()
        .replace(/\bor\b/g, '')
        .replace(/[^a-z0-9]/g, '');
}

const rootDefNames = Object.keys(definitions);
const rootSigIndex = rootDefNames.map((n) => ({ name: n, sig: tokenSignature(n) }));

const perDefDerived = {};
for (const defName of rootDefNames) {
    const schema = definitions[defName];
    const fields = topLevelFields(schema);
    const ev = defEvidence.get(defName) ?? { readOps: [], writeOps: [], deleteOps: [] };

    // PK candidates: Tier-1 = a GET single-record op (direct/wrapped-object wrapper, i.e. NOT a
    // list/array wrapper) bound to this def, whose path param name normalizes to match a property.
    const pkCandidates = new Set();
    const pkEvidence = [];
    for (const op of ev.readOps) {
        const isSingleRecordOp = op.responseWrapper === 'direct' || op.responseWrapper === 'wrapped-object';
        if (!isSingleRecordOp || op.pathParams.length === 0) continue;
        for (const pp of op.pathParams) {
            const normPP = normalizeIdentLoose(pp);
            for (const f of fields) {
                if (normalizeIdentLoose(f.name) === normPP || normPP.includes(normalizeIdentLoose(f.name))) {
                    pkCandidates.add(f.name);
                    pkEvidence.push({ field: f.name, viaPathParam: pp, op: `${op.method} ${op.path}`, tier: 1 });
                }
            }
        }
    }
    // Tier-2 fallback: a bare `id` property with no path-param corroboration.
    const idField = fields.find((f) => normalizeIdentLoose(f.name) === 'id');
    if (pkCandidates.size === 0 && idField) {
        pkCandidates.add(idField.name);
        pkEvidence.push({ field: idField.name, viaPathParam: null, tier: 2, note: 'bare id property, no path-param corroboration' });
    }

    // FK candidates: SCALAR (string/integer) fields whose name (minus a trailing Id/ID/Code)
    // token-signature-matches another root definition. Object/array-typed fields are explicitly
    // EXCLUDED — those are nested access-paths, not FK scalars (the path-LMS misclassification class).
    const fkCandidates = [];
    for (const f of fields) {
        if (f.isNestedObject || f.isNestedArray) continue; // never an FK — access path, not a scalar ref
        if (!/(id|code|number)$/i.test(f.name)) continue;
        const strippedName = f.name.replace(/(Id|ID|Code|Number)$/i, '');
        if (!strippedName || strippedName.length < 3) continue;
        const fSig = tokenSignature(strippedName);
        if (fSig.length === 0) continue;
        const match = rootSigIndex.find((r) => r.name !== defName && sigKey(r.sig) === sigKey(fSig));
        if (match) fkCandidates.push({ field: f.name, targetDef: match.name, tier: 2, basis: 'naming-convention token match' });
    }

    // List/CRUD path candidates.
    const listOps = ev.readOps.filter((o) => o.responseWrapper === 'array' || o.responseWrapper === 'paged-list');
    const singleOps = ev.readOps.filter((o) => o.responseWrapper === 'direct' || o.responseWrapper === 'wrapped-object');
    const createOps = ev.writeOps.filter((o) => o.method === 'POST');
    const updateOps = ev.writeOps.filter((o) => o.method === 'PUT' || o.method === 'PATCH');

    // Canonical list path = shortest path (fewest segments) among list ops, preferring one whose
    // ONLY path param is a page-number-shaped param (the "list all" door for this object).
    function shortestPath(ops) {
        if (ops.length === 0) return null;
        return [...ops].sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
    }
    const canonicalListOp = shortestPath(listOps);
    const canonicalCreateOp = createOps[0] ?? null;
    const canonicalUpdateOp = updateOps[0] ?? null;

    // Pagination: is pagination expressed as a PATH-templated page-number segment (Impexium's
    // actual convention, discovered structurally here) vs a query-string param ($skip/$top/page/cursor)?
    function paginationShapeOf(op) {
        if (!op) return null;
        const pagePathParam = op.pathParams.find((p) => /page/i.test(p));
        if (pagePathParam) return { kind: 'path-templated-page-number', param: pagePathParam };
        const pageQueryParam = op.queryParams.find((p) => /^(page|skip|top|limit|offset|cursor|\$skip|\$top)$/i.test(p));
        if (pageQueryParam) return { kind: 'query-param', param: pageQueryParam };
        return { kind: 'none-detected', param: null };
    }
    const paginationShape = paginationShapeOf(canonicalListOp);

    // Incremental watermark candidate: a query param on the list op suggesting a modified-since /
    // incremental filter.
    const watermarkParam = (canonicalListOp?.queryParams ?? []).find((p) =>
        /modif|updated?|changed?|since|lastsync|fromdate|startdate/i.test(p),
    ) ?? null;

    // Body shape / body key / ID location for create.
    let createBodyShape = null;
    let createBodyKey = null;
    let createIdLocation = null;
    if (canonicalCreateOp) {
        createBodyShape = canonicalCreateOp.bodyShape === 'flat-ref' || canonicalCreateOp.bodyShape === 'flat-inline' ? 'flat' : 'unknown';
        createBodyKey = null; // no wrapped-body shape observed structurally for this vendor (see note below)
        if (canonicalCreateOp.hasLocationHeader) createIdLocation = 'header';
        else if (canonicalCreateOp.responseWrapper === 'direct' || canonicalCreateOp.responseWrapper === 'wrapped-object') createIdLocation = 'body';
        else createIdLocation = 'n/a';
    }

    perDefDerived[defName] = {
        fields: fields.map((f) => f.name),
        fieldTypeBuckets: Object.fromEntries(fields.map((f) => [f.name, bucketForSwaggerType(f.type, f.format)])),
        pkCandidates: [...pkCandidates],
        pkEvidence,
        fkCandidates,
        listPath: canonicalListOp?.path ?? null,
        listOpCount: listOps.length,
        singleOpCount: singleOps.length,
        createPath: canonicalCreateOp?.path ?? null,
        createMethod: canonicalCreateOp?.method ?? null,
        updatePath: canonicalUpdateOp?.path ?? null,
        updateMethod: canonicalUpdateOp?.method ?? null,
        paginationShape,
        watermarkParam,
        createBodyShape,
        createBodyKey,
        createIdLocation,
        supportsWriteDerived: !!(canonicalCreateOp || canonicalUpdateOp),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Load emitted metadata (the ONLY place this file is opened — diff step only).
// ─────────────────────────────────────────────────────────────────────────────
const metadataRaw = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
const metadataTop = Array.isArray(metadataRaw) ? metadataRaw[0] : metadataRaw;
const emittedIOs = metadataTop?.relatedEntities?.['MJ: Integration Objects'] ?? [];

function emittedIOFields(io) {
    return io?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Object-set divergence — the primary "11-of-1,694" signal.
//    Match each source definition to an emitted IO via token-signature; fall back to a high
//    (>=0.7) token-overlap ratio to tolerate partial-name emissions.
// ─────────────────────────────────────────────────────────────────────────────
const emittedSigIndex = emittedIOs.map((io) => ({ io, name: io.fields.Name, sig: tokenSignature(io.fields.Name) }));

function normField(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Field-name Jaccard overlap between a derived definition and an emitted IO — used to pick a
// PRIMARY source definition when several definitions name-match the SAME emitted IO (this happens
// legitimately here: e.g. `IndividualData` [37 real fields] AND `IndividualPayload` [the generic
// 3-field webhook envelope {WebhookId,Properties,Notifications}] both token-signature to
// "Individuals"). Without this disambiguation a webhook-envelope schema would get diffed against
// the real record IO and manufacture bogus missingFields noise. This is a structural, computed
// tie-break — not a hardcoded per-vendor object table.
function fieldOverlapRatio(defName, io) {
    const derivedFields = new Set(perDefDerived[defName].fields.map(normField));
    const emittedFields = new Set(emittedIOFields(io).map((f) => normField(f.fields.Name)));
    if (derivedFields.size === 0) return 0;
    let inter = 0;
    for (const f of derivedFields) if (emittedFields.has(f)) inter++;
    return inter / derivedFields.size;
}

function findEmittedMatches(defSig) {
    // Returns ALL emitted IOs this definition's signature matches (exact key match, or >=0.7
    // order-independent token overlap) — used so we can see + resolve many-to-one collisions.
    const matches = [];
    for (const e of emittedSigIndex) {
        if (sigKey(e.sig) === sigKey(defSig)) { matches.push({ entry: e, score: 1 }); continue; }
        const score = sigOverlap(defSig, e.sig);
        if (score >= 0.7) matches.push({ entry: e, score });
    }
    return matches;
}

const objectsMissing = [];
const candidatesByIOName = new Map(); // ioName -> [{defName, score}]
for (const defName of rootDefNames) {
    const sig = tokenSignature(defName);
    if (sig.length === 0) continue;
    const matches = findEmittedMatches(sig);
    if (matches.length === 0) {
        objectsMissing.push(defName);
        continue;
    }
    for (const m of matches) {
        const ioName = m.entry.name;
        if (!candidatesByIOName.has(ioName)) candidatesByIOName.set(ioName, []);
        candidatesByIOName.get(ioName).push({ defName, sigScore: m.score });
    }
}

// Resolve one PRIMARY source definition per emitted IO: highest field-overlap ratio wins (ties
// broken by more derived fields, then by exact-signature score). Keyed by IO NAME (not defName) —
// a single definition can legitimately be the best-fit primary for more than one IO, so keying by
// defName would silently drop all-but-the-last such IO from the diff.
const primaryByIOName = new Map(); // ioName -> { defName, io }
const ioNameToIO = new Map(emittedIOs.map((io) => [io.fields.Name, io]));
for (const [ioName, candidates] of candidatesByIOName.entries()) {
    const io = ioNameToIO.get(ioName);
    const ranked = candidates
        .map((c) => ({ ...c, overlap: fieldOverlapRatio(c.defName, io) }))
        .sort((a, b) => b.overlap - a.overlap || perDefDerived[b.defName].fields.length - perDefDerived[a.defName].fields.length || b.sigScore - a.sigScore);
    // Confidence gate: a name-signature match whose winning candidate shares almost NO actual
    // fields with the emitted IO (overlap < 0.2) is not a trustworthy binding — it's typically a
    // short, generic single-token definition (e.g. `EventData`) winning by default because the
    // real match (e.g. `RegistrantCancellationData` for "EventCancellations") fell just under the
    // token-overlap threshold. Forcing that weak default would manufacture bogus missingFields
    // ("eventId is missing from EventCancellations!") instead of the honest signal: this second
    // parser found no confident source-definition binding. Leave the IO unmatched (-> objectsExtra)
    // rather than report a low-confidence field diff as if it were a real coverage gap.
    if (ranked[0].overlap < 0.2) continue;
    primaryByIOName.set(ioName, { defName: ranked[0].defName, io, matchConfidence: ranked[0].overlap >= 0.5 ? 'high' : 'low' });
}

const matchedIONames = new Set(primaryByIOName.keys());
const objectsExtra = emittedIOs
    .map((io) => io.fields.Name)
    .filter((name) => !matchedIONames.has(name));

// ─────────────────────────────────────────────────────────────────────────────
// 9. Per-object (matched pairs) field/attribute diff.
// ─────────────────────────────────────────────────────────────────────────────
const perObjectFull = [];
for (const { defName, io } of primaryByIOName.values()) {
    const derived = perDefDerived[defName];
    const emittedFields = emittedIOFields(io);
    const emittedFieldNames = emittedFields.map((f) => f.fields.Name);
    const emittedFieldNormSet = new Set(emittedFieldNames.map(normField));
    const derivedFieldNormSet = new Set(derived.fields.map(normField));

    const missingFields = derived.fields.filter((f) => !emittedFieldNormSet.has(normField(f)));
    const extraFields = emittedFieldNames.filter((f) => !derivedFieldNormSet.has(normField(f)));

    // Path mismatch: does the emitted APIPath share the same URL "shape" as the derived list path
    // (same static segments, ignoring the specific template-variable spelling)?
    const emittedAPIPath = io.fields.APIPath ?? null;
    function pathSkeleton(p) {
        if (!p) return null;
        return p.replace(/\{[^}]*\}/g, '{}').replace(/\/$/, '');
    }
    const pathMismatch =
        derived.listPath && emittedAPIPath && pathSkeleton(derived.listPath) !== pathSkeleton(emittedAPIPath)
            ? `derived='${derived.listPath}' vs emitted='${emittedAPIPath}'`
            : undefined;

    // PK mismatch: emitted IsPrimaryKey fields vs derived pkCandidates (normalized name compare).
    const emittedPKFields = emittedFields.filter((f) => f.fields.IsPrimaryKey).map((f) => f.fields.Name);
    const derivedPKNorm = new Set(derived.pkCandidates.map(normField));
    const emittedPKNorm = new Set(emittedPKFields.map(normField));
    const pkSetsDiffer = derivedPKNorm.size > 0 && (derivedPKNorm.size !== emittedPKNorm.size || [...derivedPKNorm].some((p) => !emittedPKNorm.has(p)));
    const pkMismatch = pkSetsDiffer
        ? `derived=[${derived.pkCandidates.join(',')}] vs emitted=[${emittedPKFields.join(',')}]`
        : undefined;

    // Write-ops missing: derived supports create/update but emitted SupportsCreate/SupportsUpdate is false.
    const writeOpsMissing = [];
    if (derived.createPath && !io.fields.SupportsCreate) writeOpsMissing.push('Create');
    if (derived.updatePath && !io.fields.SupportsUpdate) writeOpsMissing.push('Update');

    // FK misclassification: emitted IsForeignKey=true fields whose derived field type bucket is
    // 'complex' (object/array) rather than scalar — i.e. it's an access-path/nested field, not an FK.
    const fkMisclassified = [];
    for (const ef of emittedFields) {
        if (!ef.fields.IsForeignKey) continue;
        const bucket = derived.fieldTypeBuckets[
            derived.fields.find((f) => normField(f) === normField(ef.fields.Name)) ?? ''
        ];
        if (bucket === 'complex') fkMisclassified.push(ef.fields.Name);
    }

    // Pagination mismatch: derived pagination shape vs emitted PaginationType.
    let paginationMismatch;
    if (derived.paginationShape) {
        const derivedKind = derived.paginationShape.kind;
        const emittedType = io.fields.PaginationType;
        const expected =
            derivedKind === 'path-templated-page-number' ? 'PageNumber' :
            derivedKind === 'query-param' ? (['Offset', 'Cursor', 'PageNumber'].includes(emittedType) ? emittedType : 'Offset') :
            'None';
        if (derivedKind !== 'none-detected' && emittedType !== expected) {
            paginationMismatch = `derived-shape='${derivedKind}' (param='${derived.paginationShape.param}') vs emitted PaginationType='${emittedType}' (expected~'${expected}')`;
        }
    }

    // Watermark mismatch.
    let watermarkMismatch;
    if (io.fields.SupportsIncrementalSync) {
        const emittedWatermark = io.fields.IncrementalWatermarkField;
        if (!derived.watermarkParam) {
            watermarkMismatch = `emitted SupportsIncrementalSync=true + IncrementalWatermarkField='${emittedWatermark}' but no modified-since/incremental query param found on the derived list op`;
        } else if (normField(emittedWatermark ?? '') !== normField(derived.watermarkParam)) {
            watermarkMismatch = `derived watermark param='${derived.watermarkParam}' vs emitted IncrementalWatermarkField='${emittedWatermark}'`;
        }
    }

    // Body-shape mismatch (Create).
    let bodyShapeMismatch;
    if (derived.createPath && io.fields.SupportsCreate) {
        const emittedShape = io.fields.CreateBodyShape;
        if (derived.createBodyShape && emittedShape && derived.createBodyShape !== emittedShape) {
            bodyShapeMismatch = `derived='${derived.createBodyShape}' vs emitted='${emittedShape}'`;
        }
        if (derived.createIdLocation && io.fields.CreateIDLocation && derived.createIdLocation !== io.fields.CreateIDLocation) {
            bodyShapeMismatch = `${bodyShapeMismatch ? bodyShapeMismatch + '; ' : ''}IDLocation derived='${derived.createIdLocation}' vs emitted='${io.fields.CreateIDLocation}'`;
        }
    }

    // Type mismatches.
    const typeMismatches = [];
    for (const ef of emittedFields) {
        const matchDerivedName = derived.fields.find((f) => normField(f) === normField(ef.fields.Name));
        if (!matchDerivedName) continue;
        const derivedBucket = derived.fieldTypeBuckets[matchDerivedName];
        const emittedBucket = bucketForEmittedType(ef.fields.Type);
        if (derivedBucket !== 'unknown' && emittedBucket !== 'unknown' && derivedBucket !== emittedBucket) {
            typeMismatches.push(`${ef.fields.Name}: derived=${derivedBucket} vs emitted=${ef.fields.Type}(${emittedBucket})`);
        }
    }

    const diverged = !!(
        missingFields.length || pathMismatch || pkMismatch || writeOpsMissing.length ||
        fkMisclassified.length || paginationMismatch || watermarkMismatch || bodyShapeMismatch || typeMismatches.length
        // NOTE: extraFields / bare typeMismatches-only are handled by the caller's "actionable" filter;
        // diverged here counts ANY dimension (including extraFields) for the histogram/full-artifact.
        || extraFields.length
    );

    perObjectFull.push({
        object: io.fields.Name,
        sourceDefinition: defName,
        diverged,
        rederivedFieldCount: derived.fields.length,
        emittedFieldCount: emittedFieldNames.length,
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

// ─────────────────────────────────────────────────────────────────────────────
// 10. Aggregate: histogram + capped actionable sample.
// ─────────────────────────────────────────────────────────────────────────────
const objectsDivergedCount = perObjectFull.filter((o) => o.diverged).length;

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

function isActionable(o) {
    return !!(
        o.missingFields.length || o.fkMisclassified.length || o.writeOpsMissing.length ||
        o.pkMismatch || o.pathMismatch || o.bodyShapeMismatch || o.paginationMismatch || o.watermarkMismatch
    );
}

const actionableSorted = perObjectFull
    .filter(isActionable)
    .sort((a, b) => {
        // Prioritize objects with more distinct actionable dimensions, then more missing fields.
        const score = (o) =>
            (o.missingFields.length > 0 ? 1 : 0) + (o.fkMisclassified.length > 0 ? 1 : 0) +
            (o.writeOpsMissing.length > 0 ? 1 : 0) + (o.pkMismatch ? 1 : 0) + (o.pathMismatch ? 1 : 0) +
            (o.bodyShapeMismatch ? 1 : 0) + (o.paginationMismatch ? 1 : 0) + (o.watermarkMismatch ? 1 : 0);
        return score(b) - score(a) || b.missingFields.length - a.missingFields.length;
    });

const perObjectSample = actionableSorted.slice(0, 40).map((o) => ({
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

// ─────────────────────────────────────────────────────────────────────────────
// 11. Write the FULL lossless artifact; print the compact summary to stdout.
// ─────────────────────────────────────────────────────────────────────────────
mkdirSync(OUTPUT_DIR, { recursive: true });
const fullArtifact = {
    generatedAt: new Date().toISOString(),
    strategy: '$ref-chased response-schema binding (schema-pointer walk) + order-independent singularized token-set object-identity matching; enumeration via the shared enumerate-catalog.mjs primitive',
    sourcePath: SWAGGER_PATH,
    metadataPath: METADATA_PATH,
    enumeratedUniverse,
    enumeratedCount,
    catalogPrimitiveResult: catalogResult,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram,
    perObjectFull,
    perDefDerived,
};
writeFileSync(OUTPUT_PATH, JSON.stringify(fullArtifact, null, 2));

const summary = {
    artifact: OUTPUT_PATH,
    strategy: fullArtifact.strategy,
    enumeratedCount,
    objectsMissing,
    objectsExtra,
    objectsDivergedCount,
    divergenceHistogram,
    perObject: perObjectSample,
};
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
