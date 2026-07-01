/**
 * T9_EndpointReality — CREDENTIAL-FREE, observe-only network probe of the connector's OWN
 * declared endpoints. Proves the host + paths + auth scheme the connector targets are REAL,
 * without ever sending a credential.
 *
 * Reads the connector's persisted integration metadata (base URL from `Configuration` /
 * `NavigationBaseURL`, read `APIPath`s from each `MJ: Integration Objects` row), builds the
 * concrete URLs the connector would hit, and issues an UNAUTHENTICATED `GET` to each:
 *   - `401` / `403`  → the endpoint + auth-scheme are real and correctly auth-gated (strong +).
 *   - `405`          → the path exists, wrong verb for a bare GET (still +).
 *   - `400/409/415/422/429` → the server reached + processed the request → endpoint real (+).
 *   - `2xx`          → real, public/open endpoint (+).
 *   - `404` / `410`  → declared path does not exist on the host (−).
 *   - DNS failure on the host → the declared base URL host is bogus (Fail `host-unresolvable`).
 *   - connection refused / timeout / only-5xx → can't conclude → honest `Skipped`.
 * Also introspects `WWW-Authenticate` (auth scheme) and `X-RateLimit-*` / `Retry-After`
 * (rate-limit policy) — the headers the connector must honor.
 *
 * Sends NO credentials and never mutates. Honest statuses only: `Pass` (≥1 endpoint proven
 * real), `Fail` (all reached paths 404 / host unresolvable), `Skipped` (templated per-account
 * host, no declared endpoints, or host unreachable — legitimate not-applicables, never a stub).
 *
 * @see .claude/rules/connector-credential-testing.md § PATH 2 (#1 endpoint reality, #2 header introspection)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { REGISTRY_ROOT, type ConnectorIdentity } from './childRunner.js';

/** Portion of a TierResult an individual tier handler returns. */
interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

/** Outcome of probing one URL. */
interface ProbeResult {
    url: string;
    object: string;
    status?: number;
    wwwAuthenticate?: string;
    rateHeaders?: Record<string, string>;
    networkError?: string;
    errorCode?: string;
}

/** Subset of the integration metadata file T9 reads. */
interface MetaFile {
    fields?: { NavigationBaseURL?: string | null; Configuration?: unknown };
    relatedEntities?: {
        'MJ: Integration Objects'?: Array<{ fields?: { Name?: string; APIPath?: string | null } }>;
    };
}

// Endpoint-is-real evidence; an unauthenticated GET reaching these means host+path+auth are live.
const POSITIVE_STATUSES = new Set([200, 201, 202, 203, 204, 206, 400, 401, 403, 405, 409, 415, 422, 429]);
const PATH_WRONG_STATUSES = new Set([404, 410]);
const DNS_ERROR_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const MAX_CANDIDATES = 12;
const PROBE_TIMEOUT_MS = 8_000;

/** Run T9: probe the connector's declared endpoints with no credentials. */
export async function runT9EndpointReality(connector: string, identity: ConnectorIdentity): Promise<TierHandlerResult> {
    const file = loadMetaFile(connector);
    if (!file) {
        return skip(connector, identity, 'no-metadata', 'no persisted integration metadata found to derive endpoints from');
    }

    const baseUrl = resolveBaseUrl(file);
    if (baseUrl && hasTemplatedAuthority(baseUrl)) {
        return skip(connector, identity, 'templated-host', `base URL "${baseUrl}" has a per-connection templated host — not probeable credential-free`);
    }

    const candidates = buildCandidates(baseUrl, file);
    if (candidates.length === 0) {
        return skip(connector, identity, 'no-endpoints', 'connector declares no HTTP endpoints to probe (e.g. file-feed) or no resolvable base URL');
    }

    const results = await Promise.all(candidates.map((c) => probeUrl(c.url, c.object)));
    return classify(connector, identity, baseUrl, results);
}

// ── Verdict ──────────────────────────────────────────────────────────

/** Turn the raw probe results into an honest Pass/Fail/Skipped verdict. */
function classify(connector: string, identity: ConnectorIdentity, baseUrl: string | null, results: ProbeResult[]): TierHandlerResult {
    const positives = results.filter((r) => r.status !== undefined && POSITIVE_STATUSES.has(r.status));
    const pathWrong = results.filter((r) => r.status !== undefined && PATH_WRONG_STATUSES.has(r.status));
    const reachable = results.filter((r) => r.status !== undefined);
    const dnsFailed = results.filter((r) => r.errorCode && DNS_ERROR_CODES.has(r.errorCode));

    const authScheme = positives.find((r) => r.wwwAuthenticate)?.wwwAuthenticate ?? null;
    const rateHeaders = collectRateHeaders(results);
    const details: Record<string, unknown> = {
        connector, class: identity.ClassName, baseUrl,
        probed: results.length, positives: positives.length, notFound: pathWrong.length, unreachable: results.length - reachable.length,
        authScheme, rateLimitHeaders: rateHeaders,
        statuses: results.map((r) => ({ object: r.object, url: shortUrl(r.url), status: r.status ?? null, error: r.errorCode ?? r.networkError ?? null })),
    };

    if (positives.length > 0) {
        const summary = `${positives.length}/${results.length} declared endpoint(s) proven real (HTTP responses ${[...new Set(positives.map((p) => p.status))].join(',')})` +
            `${authScheme ? `; auth scheme: ${authScheme}` : ''}${Object.keys(rateHeaders).length ? `; rate-limit headers present` : ''}.`;
        const advisories = pathWrong.map((r) => `declared path returned 404/410 (path may be wrong): ${shortUrl(r.url)}`);
        return { Status: 'Pass', Output: summary, Errors: advisories, Details: details };
    }
    if (reachable.length > 0 && pathWrong.length === reachable.length) {
        return { Status: 'Fail', Output: '', Errors: [`all ${reachable.length} reached endpoint(s) returned 404/410 — the connector's declared paths do not exist on ${baseUrl ?? 'the host'}.`], Details: details };
    }
    if (reachable.length === 0 && dnsFailed.length > 0) {
        return { Status: 'Fail', Output: '', Errors: [`host did not resolve (${[...new Set(dnsFailed.map((d) => d.errorCode))].join(',')}) — the declared base URL host appears bogus: ${baseUrl ?? '(none)'}.`], Details: details };
    }
    return skip(connector, identity, 'endpoints-unreachable', `no endpoint returned a conclusive HTTP status (host unreachable / transient errors / only 5xx). Probed ${results.length}.`, details);
}

/** Merge rate-limit / retry headers observed across all probes. */
function collectRateHeaders(results: ProbeResult[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of results) {
        if (!r.rateHeaders) continue;
        for (const [k, v] of Object.entries(r.rateHeaders)) if (!(k in out)) out[k] = v;
    }
    return out;
}

// ── Probe ────────────────────────────────────────────────────────────

/** Issue ONE unauthenticated GET; resolve with status + the auth/rate headers, never throw. */
function probeUrl(rawUrl: string, object: string): Promise<ProbeResult> {
    return new Promise<ProbeResult>((resolveP) => {
        let url: URL;
        try { url = new URL(rawUrl); }
        catch { resolveP({ url: rawUrl, object, networkError: 'invalid-url', errorCode: 'EINVALIDURL' }); return; }

        const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
        const req = requestFn(url, { method: 'GET', headers: { 'User-Agent': 'mj-endpoint-reality-probe', Accept: '*/*' } }, (res) => {
            const headers = res.headers;
            res.destroy(); // status + headers are all we need; do not buffer the body
            resolveP({
                url: rawUrl, object, status: res.statusCode,
                wwwAuthenticate: typeof headers['www-authenticate'] === 'string' ? headers['www-authenticate'] : undefined,
                rateHeaders: extractRateHeaders(headers),
            });
        });
        req.setTimeout(PROBE_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
        req.on('error', (err: NodeJS.ErrnoException) => resolveP({ url: rawUrl, object, networkError: err.message, errorCode: err.code ?? (/timeout/i.test(err.message) ? 'ETIMEDOUT' : undefined) }));
        req.end();
    });
}

/** Pull the rate-limit / retry headers out of a response header bag (lower-cased keys). */
function extractRateHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        if (v === undefined) continue;
        if (/^(x-)?rate-?limit/i.test(k) || /^retry-after$/i.test(k) || /^x-ratelimit/i.test(k)) {
            out[k] = Array.isArray(v) ? v.join(', ') : v;
        }
    }
    return out;
}

// ── Endpoint derivation from metadata ────────────────────────────────

/** Build the concrete URLs the connector would hit: base root + each IO read APIPath. */
function buildCandidates(baseUrl: string | null, file: MetaFile): Array<{ url: string; object: string }> {
    const out: Array<{ url: string; object: string }> = [];
    const seen = new Set<string>();
    const push = (url: string, object: string) => {
        const key = `${object} ${url}`;
        if (!seen.has(key)) { seen.add(key); out.push({ url, object }); }
    };

    if (baseUrl) push(stripTrailingSlash(baseUrl), '(base root)');

    const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];
    for (const io of ios) {
        const path = io.fields?.APIPath;
        const name = io.fields?.Name ?? '<unnamed>';
        if (!path) continue;
        const concrete = fillTemplateVars(path);
        if (/^https?:\/\//i.test(concrete)) push(concrete, name);
        else if (baseUrl) push(joinUrl(baseUrl, concrete), name);
        if (out.length >= MAX_CANDIDATES) break;
    }
    return out.slice(0, MAX_CANDIDATES);
}

/** Resolve the connector's base URL from Configuration (object or JSON string) or NavigationBaseURL. */
function resolveBaseUrl(file: MetaFile): string | null {
    const cfg = parseConfiguration(file.fields?.Configuration);
    const keys = ['BaseURL', 'BaseUrl', 'baseUrl', 'APIBaseURL', 'ApiBaseURL', 'apiBaseUrl', 'Host', 'host'];
    for (const k of keys) {
        const v = cfg?.[k];
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) return v.trim();
    }
    const nav = file.fields?.NavigationBaseURL;
    if (typeof nav === 'string' && /^https?:\/\//i.test(nav)) return nav.trim();
    return null;
}

/** Configuration may be persisted as an object OR a JSON string — parse defensively. */
function parseConfiguration(cfg: unknown): Record<string, unknown> | null {
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) return cfg as Record<string, unknown>;
    if (typeof cfg === 'string' && cfg.trim().startsWith('{')) {
        try { const parsed = JSON.parse(cfg) as unknown; return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null; }
        catch { return null; }
    }
    return null;
}

/** True when the authority (host[:port]) carries a `{...}` / `<...>` per-connection template var. */
function hasTemplatedAuthority(baseUrl: string): boolean {
    const afterScheme = baseUrl.replace(/^https?:\/\//i, '');
    const authority = afterScheme.split('/')[0];
    return /[{}<>]/.test(authority);
}

/** Replace `{var}` / `<var>` / `:var` path template segments with a probe placeholder. */
function fillTemplateVars(path: string): string {
    return path
        .replace(/\{[^/}]+\}/g, '1')
        .replace(/<[^/>]+>/g, '1')
        .replace(/(^|\/):[^/]+/g, '$11');
}

function joinUrl(base: string, path: string): string {
    return `${stripTrailingSlash(base)}/${path.replace(/^\/+/, '')}`;
}

function stripTrailingSlash(s: string): string {
    return s.replace(/\/+$/, '');
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Load + normalise the integration metadata file (mirrors T7's candidate search). */
function loadMetaFile(connector: string): MetaFile | null {
    const connectorDir = resolve(REGISTRY_ROOT, connector);
    const candidates = [
        resolve(connectorDir, 'metadata/integrations', `.${connector}.json`),
        resolve(connectorDir, 'metadata/integrations', `.${connector}.integration.json`),
        resolve(connectorDir, 'metadata/integrations', connector, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.json`),
    ];
    for (const path of candidates) {
        if (!existsSync(path)) continue;
        try {
            const raw = JSON.parse(readFileSync(path, 'utf-8')) as MetaFile | MetaFile[];
            return Array.isArray(raw) ? (raw.length > 0 ? raw[0] : null) : raw;
        } catch { /* try next candidate */ }
    }
    return null;
}

/** Honest Skip with a real not-applicable reason. */
function skip(connector: string, identity: ConnectorIdentity, reason: string, detail: string, details?: Record<string, unknown>): TierHandlerResult {
    return {
        Status: 'Skipped',
        Output: detail,
        Errors: [reason],
        Details: details ?? { connector, class: identity.ClassName, reason },
    };
}

/** Trim a URL to a registry-safe short form for non-secret details. */
function shortUrl(u: string): string {
    return u.length > 120 ? `${u.slice(0, 117)}...` : u;
}
