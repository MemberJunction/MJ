#!/usr/bin/env node
// scripts/extract-integration-config-facts.mjs
//
// MetadataWriter evidence script (credential-free). Reads the ALREADY-FETCHED, ALREADY-SAVED
// merged OpenAPI v3 spec (sources/vanilla-openapi.merged.v3.json -- produced by the SourceAuditor
// from two independent live Vanilla-hosted communities; see SOURCES.json) and computes the
// vendor-wide Integration.Configuration facts a connector author needs: pagination param shapes
// + defaults, the common error-response schema, incremental (dateUpdated) filter-param coverage,
// vendor-wide write-capability counts, delete-semantics evidence (hard vs. status-based soft
// delete), webhook schema fields, concurrency-control header/field absence, and bulk/batch
// endpoint absence.
//
// This does NOT fetch anything live -- the spec file was already fetched credential-free by the
// SourceAuditor stage and is read from disk here, so re-running this script is fully offline and
// deterministic (verify-claim can re-run it without any network dependency).
//
// Usage: node scripts/extract-integration-config-facts.mjs [path-to-merged-spec.json]

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = process.argv[2] ?? resolve(__dirname, '../sources/vanilla-openapi.merged.v3.json');
const catalogPath = resolve(__dirname, '../sources/derived/enumerate-vanilla-catalog.output.json');

const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));

function resolveRef(ref) {
    // '#/components/parameters/DateUpdated' -> spec.components.parameters.DateUpdated
    const parts = ref.replace(/^#\//, '').split('/');
    let node = spec;
    for (const part of parts) node = node?.[part];
    return node;
}

function resolveParam(p) {
    return p && typeof p === 'object' && p.$ref ? resolveRef(p.$ref) : p;
}

// Many list-endpoint query params (dateUpdated/dateInserted/etc.) are shared
// #/components/parameters/<Name> refs, not inline objects -- resolve before matching by name.
function getParam(op, name) {
    return (op?.parameters ?? []).map(resolveParam).find((p) => p && p.name === name);
}

function paginationFactsFor(pathKey) {
    const op = spec.paths[pathKey]?.get;
    if (!op) return null;
    const limit = getParam(op, 'limit');
    const page = getParam(op, 'page');
    const sort = getParam(op, 'sort');
    return {
        path: pathKey,
        hasPage: !!page,
        hasLimit: !!limit,
        limitDefault: limit?.schema?.default ?? null,
        limitMax: limit?.schema?.maximum ?? null,
        limitMin: limit?.schema?.minimum ?? null,
        sortEnum: sort?.schema?.enum ?? null,
        hasFields: !!getParam(op, 'fields'),
        hasDateUpdatedFilter: !!getParam(op, 'dateUpdated'),
        hasDateInsertedFilter: !!getParam(op, 'dateInserted'),
    };
}

// ── Pagination spot-checks across a representative sample of coverable list endpoints ──
const paginationSample = ['/discussions', '/users', '/categories', '/comments', '/roles']
    .map(paginationFactsFor)
    .filter(Boolean);

// ── Error response schema (BasicError) reference count across 4xx/5xx responses ──
const errorRefCounts = {};
for (const [, methods] of Object.entries(spec.paths)) {
    for (const [, op] of Object.entries(methods)) {
        if (typeof op !== 'object' || op === null) continue;
        for (const [code, resp] of Object.entries(op.responses ?? {})) {
            if (!/^[45]/.test(code)) continue;
            for (const [, cval] of Object.entries(resp?.content ?? {})) {
                const ref = cval?.schema?.$ref;
                if (ref) errorRefCounts[ref] = (errorRefCounts[ref] ?? 0) + 1;
            }
        }
    }
}
const topErrorSchemaRef = Object.entries(errorRefCounts).sort((a, b) => b[1] - a[1])[0];
const basicErrorSchema = spec.components.schemas.BasicError;

// ── Vendor-wide write-capability counts (from the door-level catalog) ──
const coverable = catalog.coverable;
const writeStats = {
    totalCoverable: coverable.length,
    withCreate: coverable.filter((o) => o.createPath).length,
    withUpdate: coverable.filter((o) => o.updatePath).length,
    withDelete: coverable.filter((o) => o.deletePath).length,
    fullCRUD: coverable.filter((o) => o.createPath && o.updatePath && o.deletePath).length,
    readOnly: coverable.filter((o) => !o.createPath && !o.updatePath && !o.deletePath).map((o) => o.name),
    hasDateUpdatedWatermark: coverable.filter((o) => o.hasDateUpdated).length,
    insertOnlyWatermark: coverable.filter((o) => o.hasDateInserted && !o.hasDateUpdated).length,
};

// ── Delete-semantics evidence: real DELETE verb vs. status-field soft-delete (Article) ──
const articleStatusEnum = spec.components.schemas.Article?.properties?.status?.enum ?? null;
const hasArticleDeleteVerb = !!spec.paths['/articles/{id}']?.delete;
const sampleHardDeleteObjects = ['/discussions/{id}', '/comments/{id}', '/users/{id}', '/categories/{id}', '/groups/{id}']
    .map((p) => ({ path: p, hasDelete: !!spec.paths[p]?.delete }));

// ── Concurrency-control evidence (absence check across the whole raw spec text, WITH context so a
// false-positive substring hit -- e.g. a query-string cache-buster literally named "etag", or an
// unrelated media field called "eTag" -- isn't mistaken for a real If-Match/optimistic-lock signal).
const rawSpecText = JSON.stringify(spec);
function contextsFor(pattern) {
    return [...rawSpecText.matchAll(pattern)].map((m) => rawSpecText.slice(Math.max(0, m.index - 40), m.index + 40));
}
const concurrencyControlSignals = {
    ifMatchCount: (rawSpecText.match(/If-Match/g) ?? []).length,
    etagCount: (rawSpecText.match(/ETag/gi) ?? []).length,
    etagContexts: contextsFor(/etag/gi),
    ifUnmodifiedCount: (rawSpecText.match(/If-Unmodified/g) ?? []).length,
};

// ── Bulk/batch endpoint scan (narrow action endpoints vs. a general bulk-write mechanism) ──
const bulkLikePaths = Object.keys(spec.paths).filter((p) => /bulk|batch/i.test(p));

// ── Webhook schema fields (signature secret + event catalog shape) ──
const webhookSchema = spec.components.schemas.Webhook;
const webhookFields = webhookSchema ? Object.keys(webhookSchema.properties ?? {}) : [];
const webhookSecretDescription = webhookSchema?.properties?.secret?.description ?? null;

// ── Custom-field marker pattern check (ProfileField.apiName -- free-form, no prefix convention) ──
const profileFieldSchema = spec.components.schemas.ProfileField ?? spec.components.schemas.ProfileFieldSchema;
const profileFieldApiNameDescription = profileFieldSchema?.properties?.apiName?.description ?? null;

// ── API versioning: server URL path segment ──
const servers = spec.servers ?? [];

process.stdout.write(JSON.stringify({
    specVersion: spec.openapi,
    servers,
    paginationSample,
    errorSchema: { topErrorSchemaRef, refCount: topErrorSchemaRef?.[1] ?? 0, basicErrorSchema },
    writeStats,
    deleteSemantics: { articleStatusEnum, hasArticleDeleteVerb, sampleHardDeleteObjects },
    concurrencyControlSignals,
    bulkLikePaths,
    webhookFields,
    webhookSecretDescription,
    profileFieldApiNameDescription,
}, null, 2) + '\n');
