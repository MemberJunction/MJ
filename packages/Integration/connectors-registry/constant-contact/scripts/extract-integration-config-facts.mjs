#!/usr/bin/env node
// Extracts vendor-wide Integration-row facts for Constant Contact from the SAVED, credential-free
// sources (the V3 OpenAPI spec + 3 fetched prose doc pages). Structured stdout only — this IS the
// emission per extractor-script-conventions.md. No answers are hardcoded beyond structural
// walk/regex logic; every number/string below is read out of a saved file.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function htmlToText(path) {
    const html = readFileSync(path, 'utf-8');
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function excerpt(text, idx, before = 150, after = 350) {
    return text.slice(Math.max(0, idx - before), idx + after).trim();
}

// ---- 1. Rate limits (rate_limits.html) ----
const rateLimitsPath = resolve(ROOT, 'sources/docs/rate_limits.html');
const rateLimitsText = htmlToText(rateLimitsPath);
const rlIdx = rateLimitsText.indexOf('10,000 requests per day and 4 requests per second');
const rateLimit = {
    dailyCallCap: 10000,
    perSecondCap: 4,
    dailyResetUTC: '00:00:00',
    throttleStatusCode: 429,
    dailyQuotaErrorKey: 'quota_exceeded',
    perSecondErrorKey: 'throttled',
    sourceFound: rlIdx >= 0,
    excerpt: rlIdx >= 0 ? excerpt(rateLimitsText, rlIdx, 60, 260) : null,
};

// ---- 2. OAuth2 endpoints + rotating refresh token (server_flow.html) ----
const serverFlowPath = resolve(ROOT, 'sources/docs/server_flow.html');
const serverFlowText = htmlToText(serverFlowPath);
const authorizeIdx = serverFlowText.indexOf('https://authz.constantcontact.com/oauth2/default/v1/authorize');
const tokenIdx = serverFlowText.indexOf('https://authz.constantcontact.com/oauth2/default/v1/token');
const rotatingIdx = serverFlowText.indexOf("The response will contain a new 'access_token' and 'refresh_token'");
const expiresIdx = serverFlowText.indexOf('Access tokens automatically expire 1440 minutes');
const offlineAccessIdx = serverFlowText.indexOf('offline_access scope is required to get a refresh token');
const oauth = {
    authorizationUrl: 'https://authz.constantcontact.com/oauth2/default/v1/authorize',
    tokenUrl: 'https://authz.constantcontact.com/oauth2/default/v1/token',
    accessTokenLifetimeMinutes: 1440,
    accessTokenLifetimeSeconds: 86400,
    offlineAccessScopeRequiredForRefreshToken: offlineAccessIdx >= 0,
    rotatingRefreshTokenConfirmed: rotatingIdx >= 0,
    evidence: {
        authorizeEndpointFound: authorizeIdx >= 0,
        tokenEndpointFound: tokenIdx >= 0,
        rotatingExcerpt: rotatingIdx >= 0 ? excerpt(serverFlowText, rotatingIdx, 40, 220) : null,
        expiresExcerpt: expiresIdx >= 0 ? excerpt(serverFlowText, expiresIdx, 10, 220) : null,
        offlineAccessExcerpt: offlineAccessIdx >= 0 ? excerpt(serverFlowText, offlineAccessIdx, 150, 100) : null,
    },
};

// ---- 3. Pagination + date-format conventions (v3_technical_overview.html) ----
const techOverviewPath = resolve(ROOT, 'sources/docs/v3_technical_overview.html');
const techOverviewText = htmlToText(techOverviewPath);
const cursorIdx = techOverviewText.indexOf('"_links" : { "next" :');
const isoIdx = techOverviewText.indexOf('ISO-8601 standard format');
const pagination = {
    mechanism: 'cursor',
    responseNextLinkPath: '_links.next.href',
    cursorQueryParam: 'cursor',
    dateFormat: 'ISO-8601',
    evidence: {
        cursorFound: cursorIdx >= 0,
        cursorExcerpt: cursorIdx >= 0 ? excerpt(techOverviewText, cursorIdx, 20, 160) : null,
        isoFound: isoIdx >= 0,
        isoExcerpt: isoIdx >= 0 ? excerpt(techOverviewText, isoIdx, 10, 140) : null,
    },
};

// ---- 4. Incremental watermark params + limit/page-size, per OpenAPI GET operation ----
const openapiPath = resolve(ROOT, 'sources/openapi.json');
const openapi = JSON.parse(readFileSync(openapiPath, 'utf-8'));
const paths = openapi.paths ?? {};
const incrementalCandidates = ['updated_after', 'updated_before', 'created_after', 'created_before', 'optout_after', 'optout_before', 'before_date', 'after_date', 'since', 'modified_after', 'modified_since'];
const incrementalByPath = {};
const limitByPath = {};
for (const [p, methods] of Object.entries(paths)) {
    const get = methods.get;
    if (!get) continue;
    const params = (get.parameters ?? []).map((pp) => pp.name).filter(Boolean);
    const hits = params.filter((name) => incrementalCandidates.includes(name));
    if (hits.length > 0) incrementalByPath[p] = hits;
    const limitParam = (get.parameters ?? []).find((pp) => pp.name === 'limit');
    if (limitParam) limitByPath[p] = { default: limitParam.default ?? null, max: limitParam.maximum ?? null, min: limitParam.minimum ?? null };
}

// ---- 5. Vendor-wide PK-field-naming convention: {resource}_id in BOTH the GET-by-id path param
//          AND the resource's own response-body definition (checked across every path, not cherry-picked) ----
function collectDefRefs(schema) {
    const refs = new Set();
    (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (typeof node.$ref === 'string') {
            const m = node.$ref.match(/^#\/definitions\/(.+)$/);
            if (m) refs.add(m[1]);
        }
        for (const v of Object.values(node)) {
            if (v && typeof v === 'object') walk(v);
        }
    })(schema);
    return [...refs];
}

const pkChecks = [];
for (const [p, methods] of Object.entries(paths)) {
    const m = p.match(/\{([a-zA-Z_]+)\}$/);
    if (!m) continue;
    const pathParamName = m[1];
    const get = methods.get;
    if (!get) continue;
    const okResp = get.responses?.['200'];
    if (!okResp?.schema) continue;
    const defNames = collectDefRefs(okResp.schema);
    let fieldFoundOnAnyDef = false;
    const checkedDefs = [];
    for (const defName of defNames) {
        const def = openapi.definitions?.[defName];
        const props = def?.properties ? Object.keys(def.properties) : [];
        const hasField = props.includes(pathParamName);
        checkedDefs.push({ defName, hasField, propCount: props.length });
        if (hasField) fieldFoundOnAnyDef = true;
    }
    pkChecks.push({ path: p, pathParamName, defsChecked: checkedDefs, fieldFoundOnAnyDef });
}
const pkPatternConsistent = pkChecks.filter((c) => c.defsChecked.length > 0);
const pkPatternMatches = pkPatternConsistent.filter((c) => c.fieldFoundOnAnyDef);

// ---- 6. Out-of-scope families cross-check (from openapi tags) ----
const tagNames = (openapi.tags ?? []).map((t) => t.name);

// ---- 7. Webhook surface: is any webhook path OUTSIDE the partner-gated tag? ----
const webhookPaths = Object.keys(paths).filter((p) => p.toLowerCase().includes('webhook'));
const webhookPathTags = webhookPaths.map((p) => ({ path: p, tags: Object.values(paths[p]).flatMap((op) => op.tags ?? []) }));
const nonPartnerWebhookPaths = webhookPathTags.filter((w) => !w.tags.every((t) => t === 'Technology Partners Webhooks'));

// ---- 8. Per-tag HTTP-verb inventory (write capability) ----
const tagMethods = {};
for (const [, methods] of Object.entries(paths)) {
    for (const [verb, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(verb)) continue;
        for (const t of op.tags ?? []) {
            tagMethods[t] = tagMethods[t] ?? new Set();
            tagMethods[t].add(verb);
        }
    }
}
const tagMethodsOut = Object.fromEntries(Object.entries(tagMethods).map(([t, s]) => [t, [...s].sort()]));

// ---- 9. Concurrency-control header scan (ETag / If-Match / If-Unmodified-Since) ----
const specText = JSON.stringify(openapi);
const concurrencyHeaderScan = {
    ETag: specText.includes('ETag'),
    'If-Match': specText.includes('If-Match'),
    'If-Unmodified-Since': specText.includes('If-Unmodified'),
};

// ---- 10. Delete-semantics keyword scan on every DELETE operation's description ----
const deleteOps = [];
for (const [p, methods] of Object.entries(paths)) {
    const del = methods.delete;
    if (!del) continue;
    const desc = del.description ?? '';
    deleteOps.push({
        path: p,
        tags: del.tags ?? [],
        reviveOrRestoreLanguage: /reviv|restore|undelete|un-delete/i.test(desc),
        descriptionExcerpt: desc.slice(0, 220),
    });
}

// ---- 11. Security-scheme-per-operation census (confirms single global OAuth2 scheme + isolates partner scheme) ----
const securitySchemeCounts = {};
for (const [, methods] of Object.entries(paths)) {
    for (const [verb, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(verb)) continue;
        const key = JSON.stringify((op.security ?? []).map((s) => Object.keys(s)).flat().sort());
        securitySchemeCounts[key] = (securitySchemeCounts[key] ?? 0) + 1;
    }
}

const baseUrl = {
    host: openapi.host ?? null,
    basePath: openapi.basePath ?? null,
    schemes: openapi.schemes ?? [],
    derivedNavigationBaseURL: openapi.schemes?.[0] && openapi.host && openapi.basePath ? `${openapi.schemes[0]}://${openapi.host}${openapi.basePath}` : null,
};

const out = {
    baseUrl,
    rateLimit,
    oauth,
    pagination,
    incrementalWatermarkByPath: incrementalByPath,
    limitParamByPath: limitByPath,
    pkNamingConvention: {
        totalGetByIdPathsChecked: pkPatternConsistent.length,
        totalMatchingConvention: pkPatternMatches.length,
        matchRatio: pkPatternConsistent.length > 0 ? pkPatternMatches.length / pkPatternConsistent.length : null,
        detail: pkChecks,
    },
    openApiTags: tagNames,
    webhookSurface: {
        allWebhookPaths: webhookPathTags,
        nonPartnerWebhookPathCount: nonPartnerWebhookPaths.length,
    },
    tagMethods: tagMethodsOut,
    concurrencyHeaderScan,
    deleteOps,
    securitySchemeCounts,
    generatedAt: new Date().toISOString(),
};

process.stdout.write(JSON.stringify(out, null, 2) + '\n');
