/**
 * T7_OpenAPIValidation — when an OpenAPI/Swagger spec exists for the connector,
 * validate the requests the connector would issue against it.
 *
 * The connector's read requests are declared in its persisted integration
 * metadata as per-object `APIPath`s (and per-operation write paths). T7:
 *   1. locates an OpenAPI/Swagger spec under the connector's `source-cache/` or
 *      `sources/` dir (or a path referenced in metadata),
 *   2. parses the spec's `paths` (with `{param}` templating) and the HTTP methods
 *      each path supports,
 *   3. asserts every API path the connector declares resolves to a known spec
 *      path template that supports the corresponding HTTP method (GET for read
 *      `APIPath`; POST/PATCH/PUT/DELETE for the write paths when declared).
 *
 * A declared path with no matching spec route, or a route that doesn't support
 * the needed method, is a request the connector would issue that the vendor spec
 * doesn't sanction → Fail with the offending paths.
 *
 * **NOT-APPLICABLE, not not-implemented.** If no spec is present, T7 returns
 * `Skipped` with reason `no-openapi-spec` — a legitimate "this connector has no
 * machine-readable spec to validate against", distinct from a stubbed tier.
 *
 * **CREDENTIAL-FREE / OFFLINE.** Pure file parsing; no connector instantiation,
 * no network. Shape-agnostic in that a connector with no REST API paths (e.g. a
 * pure file-feed) declares none and there is nothing to validate — which is also
 * surfaced honestly (Skipped: `no-api-paths`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGISTRY_ROOT, type ConnectorIdentity } from './childRunner.js';

/** Portion of a TierResult an individual tier handler returns. */
interface TierHandlerResult {
    Status: 'Pass' | 'Fail' | 'Skipped';
    Output: string;
    Errors: string[];
    Details?: Record<string, unknown>;
}

/** A request the connector would issue, derived from its metadata. */
interface DeclaredRequest {
    Object: string;
    Path: string;
    Method: string;
}

/** A spec path template + the methods it supports. */
interface SpecRoute {
    Template: string;
    Methods: Set<string>;
}

/** Run T7: skip-when-no-spec; else validate declared requests against the spec. */
export function runT7OpenApi(connector: string, identity: ConnectorIdentity): TierHandlerResult {
    const specPaths = findOpenApiSpecs(connector);
    if (specPaths.length === 0) {
        return {
            Status: 'Skipped',
            Output: '',
            Errors: ['no-openapi-spec'],
            Details: { connector, class: identity.ClassName, reason: 'no-openapi-spec' },
        };
    }

    const routes = loadSpecRoutes(specPaths);
    if (routes.length === 0) {
        return {
            Status: 'Fail',
            Output: '',
            Errors: [`Found ${specPaths.length} spec file(s) but none parsed to any valid OpenAPI paths.`],
            Details: { connector, class: identity.ClassName, specFiles: specPaths.map(shortPath) },
        };
    }

    const declared = loadDeclaredRequests(connector);
    if (declared.length === 0) {
        return {
            Status: 'Skipped',
            Output: '',
            Errors: ['no-api-paths'],
            Details: {
                connector,
                class: identity.ClassName,
                reason: 'no-api-paths',
                detail: 'OpenAPI spec present but the connector declares no API paths to validate (e.g. file-feed connector).',
                specFiles: specPaths.map(shortPath),
            },
        };
    }

    return validateRequests(connector, identity, declared, routes, specPaths);
}

/** Validate each declared request against the spec routes. */
function validateRequests(
    connector: string,
    identity: ConnectorIdentity,
    declared: DeclaredRequest[],
    routes: SpecRoute[],
    specPaths: string[],
): TierHandlerResult {
    const failures: string[] = [];
    let matched = 0;

    for (const req of declared) {
        const route = matchRoute(req.Path, routes);
        if (!route) {
            failures.push(`${req.Object}: declared path "${req.Path}" matches no path in the OpenAPI spec.`);
            continue;
        }
        if (!route.Methods.has(req.Method.toLowerCase())) {
            failures.push(`${req.Object}: spec path "${route.Template}" does not support method ${req.Method} (supports: ${[...route.Methods].join(',').toUpperCase() || 'none'}).`);
            continue;
        }
        matched++;
    }

    // Bijective coverage (spec → declared): which documented GET routes the connector
    // does NOT declare. ADVISORY only — a deliberately-scoped connector (e.g. a file-feed
    // slice of a larger REST product) legitimately leaves spec routes uncovered; the real
    // completeness gate is the workshop's compute-source-diff against the SCOPED universe.
    const coverage = computeBijectiveCoverage(declared, routes);
    const sdk = detectSdkCoverage(connector, declared);

    const advisories: string[] = [];
    if (coverage.orphanGetRoutes.length > 0) {
        advisories.push(`bijective-coverage (advisory): ${coverage.coveredGetRoutes}/${coverage.totalGetRoutes} documented GET routes are declared by the connector; ${coverage.orphanGetRoutes.length} documented route(s) are NOT modeled (expected if the connector scopes a subset): ${coverage.orphanGetRoutes.slice(0, 8).join(', ')}${coverage.orphanGetRoutes.length > 8 ? ' …' : ''}`);
    }
    if (sdk.sdkPresent) {
        advisories.push(`sdk-diff (advisory): SDK/types file ${sdk.sdkFile} present; ${sdk.matchedObjects}/${declared.length} declared object name(s) found referenced in the SDK types${sdk.unmatched.length ? `; not found: ${sdk.unmatched.slice(0, 8).join(', ')}` : ''}`);
    }

    const summary = `Validated ${declared.length} declared request(s) against ${routes.length} spec route(s) from ${specPaths.length} spec file(s): ${matched} matched. ` +
        `Bijective GET coverage ${coverage.coveredGetRoutes}/${coverage.totalGetRoutes}.${sdk.sdkPresent ? ` SDK present (${sdk.matchedObjects}/${declared.length} objs referenced).` : ''}`;
    const details = {
        connector, class: identity.ClassName, declared: declared.length, matched,
        specFiles: specPaths.map(shortPath), bijectiveCoverage: coverage, sdk,
    };
    if (failures.length > 0) {
        return { Status: 'Fail', Output: summary, Errors: failures, Details: details };
    }
    return { Status: 'Pass', Output: summary, Errors: advisories, Details: details };
}

/** Spec→declared coverage: documented GET routes vs. the connector's declared GET paths. */
function computeBijectiveCoverage(declared: DeclaredRequest[], routes: SpecRoute[]): {
    totalGetRoutes: number; coveredGetRoutes: number; orphanGetRoutes: string[];
} {
    const getRoutes = routes.filter((r) => r.Methods.has('get'));
    const declaredPaths = declared.map((d) => d.Path);
    const orphan: string[] = [];
    let covered = 0;
    for (const r of getRoutes) {
        // A spec GET route is "covered" if some declared path matches its template.
        const isCovered = declaredPaths.some((p) => matchRoute(p, [r]) !== null);
        if (isCovered) covered++; else orphan.push(r.Template);
    }
    return { totalGetRoutes: getRoutes.length, coveredGetRoutes: covered, orphanGetRoutes: orphan };
}

/** Best-effort SDK/types coverage: when a vendor SDK/types file exists, how many declared
 * object names are referenced in it. ADVISORY (structural-name level, not a full type diff). */
function detectSdkCoverage(connector: string, declared: DeclaredRequest[]): {
    sdkPresent: boolean; sdkFile: string | null; matchedObjects: number; unmatched: string[];
} {
    const dirs = [resolve(REGISTRY_ROOT, connector, 'sources'), resolve(REGISTRY_ROOT, connector, 'source-cache')];
    let sdkFile: string | null = null;
    for (const dir of dirs) {
        if (!existsSync(dir)) continue;
        let entries: string[] = [];
        try { entries = readdirSync(dir); } catch { continue; }
        const hit = entries.find((n) => /\.d\.ts$|\.sdk\.(ts|json)$|sdk.*\.(ts|json)$|types?\.(ts|json)$/i.test(n));
        if (hit) { sdkFile = resolve(dir, hit); break; }
    }
    if (!sdkFile) return { sdkPresent: false, sdkFile: null, matchedObjects: 0, unmatched: [] };

    let text = '';
    try { text = readFileSync(sdkFile, 'utf-8').toLowerCase(); } catch { return { sdkPresent: false, sdkFile: shortPath(sdkFile), matchedObjects: 0, unmatched: [] }; }
    const objNames = [...new Set(declared.map((d) => d.Object.toLowerCase()))];
    const matched: string[] = []; const unmatched: string[] = [];
    for (const n of objNames) {
        // singular/plural tolerant: match the object name or its de-pluralized stem.
        const stem = n.replace(/s$/, '');
        if (text.includes(n) || (stem.length > 2 && text.includes(stem))) matched.push(n); else unmatched.push(n);
    }
    return { sdkPresent: true, sdkFile: shortPath(sdkFile), matchedObjects: matched.length, unmatched };
}

// ── Spec discovery + parsing ─────────────────────────────────────────

/**
 * Locate OpenAPI/Swagger spec files for a connector. Scans `source-cache/` and
 * `sources/` for `*.openapi.json` / `*.swagger.json` / `openapi.json` /
 * `swagger.json` / `*.openapi.yaml` (json only — we parse JSON natively, and
 * recorded specs in this registry are JSON).
 */
function findOpenApiSpecs(connector: string): string[] {
    const dirs = [
        resolve(REGISTRY_ROOT, connector, 'source-cache'),
        resolve(REGISTRY_ROOT, connector, 'sources'),
    ];
    const out: string[] = [];
    for (const dir of dirs) {
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
            const lower = f.toLowerCase();
            // Name-based match first (fast): any JSON whose name advertises an OpenAPI/Swagger spec,
            // including vendor-prefixed/versioned names like `openwater-openapi-v2.json` (the agent
            // must NOT silently skip a present spec just because it isn't named exactly `openapi.json`).
            const nameLooksLikeSpec =
                lower.endsWith('.json') && (lower.includes('openapi') || lower.includes('swagger'));
            if (nameLooksLikeSpec) {
                out.push(resolve(dir, f));
                continue;
            }
            // Content-based fallback: any other .json that actually parses to an OpenAPI/Swagger
            // document (has an `openapi`/`swagger` version key AND a `paths` object) is a real spec
            // regardless of filename — so a vendor contract is never missed on a naming quirk.
            if (lower.endsWith('.json')) {
                try {
                    const doc = JSON.parse(readFileSync(resolve(dir, f), 'utf-8')) as Record<string, unknown>;
                    if ((doc.openapi || doc.swagger) && doc.paths && typeof doc.paths === 'object') {
                        out.push(resolve(dir, f));
                    }
                } catch {
                    /* not JSON / unreadable — not a spec */
                }
            }
        }
    }
    return out;
}

/** Parse all spec files and merge their path templates + supported methods. */
function loadSpecRoutes(specPaths: string[]): SpecRoute[] {
    const byTemplate = new Map<string, Set<string>>();
    const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options']);

    for (const path of specPaths) {
        let spec: { paths?: Record<string, Record<string, unknown>> };
        try {
            spec = JSON.parse(readFileSync(path, 'utf-8')) as typeof spec;
        } catch {
            continue; // unparseable spec — skip it
        }
        const paths = spec.paths ?? {};
        for (const [template, ops] of Object.entries(paths)) {
            const methods = byTemplate.get(template) ?? new Set<string>();
            for (const method of Object.keys(ops ?? {})) {
                if (HTTP_METHODS.has(method.toLowerCase())) methods.add(method.toLowerCase());
            }
            byTemplate.set(template, methods);
        }
    }

    return [...byTemplate.entries()].map(([Template, Methods]) => ({ Template, Methods }));
}

/**
 * Match a concrete request path against spec path templates. A template segment
 * `{param}` matches any single concrete segment. Prefers an exact (no-param)
 * match, then a templated match. Also tolerates a connector base-path prefix
 * difference by matching on path suffix when no full match exists.
 */
function matchRoute(requestPath: string, routes: SpecRoute[]): SpecRoute | null {
    const reqSegs = splitPath(requestPath);

    // 1) Exact / templated full-length match.
    let templated: SpecRoute | null = null;
    for (const route of routes) {
        const tplSegs = splitPath(route.Template);
        if (tplSegs.length !== reqSegs.length) continue;
        const kind = segmentsMatch(tplSegs, reqSegs);
        if (kind === 'exact') return route;
        if (kind === 'templated' && !templated) templated = route;
    }
    if (templated) return templated;

    // 2) Suffix match — connector APIPath may omit a shared base prefix the spec carries.
    for (const route of routes) {
        const tplSegs = splitPath(route.Template);
        if (tplSegs.length < reqSegs.length) continue;
        const tail = tplSegs.slice(tplSegs.length - reqSegs.length);
        if (segmentsMatch(tail, reqSegs) !== null) return route;
    }
    return null;
}

/** Split a URL path into non-empty segments (query string stripped). */
function splitPath(path: string): string[] {
    const noQuery = path.split('?')[0];
    return noQuery.split('/').filter((s) => s.length > 0);
}

/** Compare template segments to concrete segments. Returns the match kind or null. */
function segmentsMatch(tplSegs: string[], reqSegs: string[]): 'exact' | 'templated' | null {
    let templated = false;
    for (let i = 0; i < tplSegs.length; i++) {
        const t = tplSegs[i];
        const r = reqSegs[i];
        if (t.startsWith('{') && t.endsWith('}')) { templated = true; continue; }
        if (t.toLowerCase() !== r.toLowerCase()) return null;
    }
    return templated ? 'templated' : 'exact';
}

// ── Declared-request loader (from persisted integration metadata) ────

/** Root integration metadata shape (subset T7 reads). */
interface MetaFile {
    relatedEntities?: {
        'MJ: Integration Objects'?: Array<{
            fields?: {
                Name?: string;
                APIPath?: string | null;
                CreateAPIPath?: string | null;
                UpdateAPIPath?: string | null;
                DeleteAPIPath?: string | null;
            };
        }>;
    };
}

/**
 * Build the list of requests the connector would issue from its persisted IO
 * metadata: the read `APIPath` (GET) plus any declared write paths with their
 * HTTP methods. Paths with template vars left literal (`{var}`) are matched
 * against templated spec routes.
 */
function loadDeclaredRequests(connector: string): DeclaredRequest[] {
    const file = loadMetaFile(connector);
    if (!file) return [];
    const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];
    const out: DeclaredRequest[] = [];
    for (const io of ios) {
        const f = io.fields ?? {};
        const name = f.Name ?? '<unnamed>';
        if (f.APIPath) out.push({ Object: name, Path: f.APIPath, Method: 'GET' });
        if (f.CreateAPIPath) out.push({ Object: name, Path: f.CreateAPIPath, Method: 'POST' });
        if (f.UpdateAPIPath) out.push({ Object: name, Path: f.UpdateAPIPath, Method: 'PATCH' });
        if (f.DeleteAPIPath) out.push({ Object: name, Path: f.DeleteAPIPath, Method: 'DELETE' });
    }
    return out;
}

/** Load + normalise the integration metadata file (array-wrapped → first root). */
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
        const raw = JSON.parse(readFileSync(path, 'utf-8')) as MetaFile | MetaFile[];
        return Array.isArray(raw) ? (raw.length > 0 ? raw[0] : null) : raw;
    }
    return null;
}

/** Shorten an absolute path to a registry-relative form for non-secret details. */
function shortPath(p: string): string {
    const idx = p.indexOf('connectors-registry');
    return idx >= 0 ? p.slice(idx) : p;
}
