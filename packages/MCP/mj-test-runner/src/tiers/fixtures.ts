/**
 * Fixture loader for the offline tiers (T5 mock-HTTP, T6 SQLite).
 *
 * A connector's recorded fixtures live at:
 *   `connectors-registry/<connector>/fixtures/`
 *
 * They describe — without any live credentials — what the vendor would return,
 * so an offline tier can drive the connector's abstract methods against them.
 *
 * **SHAPE-AGNOSTIC FIXTURE FORMAT.** A fixture is transport-aware so the SAME
 * loader serves both a REST connector and a file-feed connector:
 *
 *   - `transport: "http"` — the connector reads a base URL from its
 *     `Configuration` and issues HTTP calls. The fixture maps URL path segments
 *     to recorded JSON response bodies; T5 boots a `node:http` server that serves
 *     them and points the connector's base URL at it.
 *
 *   - `transport: "file"` — the connector reads a local file path from its
 *     `Configuration` (file-feed: list + download). The fixture supplies the raw
 *     file CONTENT (e.g. CSV text); T5/T6 writes it to a temp file and points the
 *     connector's `storagePath` at it. This mocks the file-feed `list`+`download`
 *     leg with the same harness the REST routes use.
 *
 * The format is intentionally small and declarative. There is exactly one
 * `fixtures.json` manifest per connector; large recorded bodies may be inlined or
 * referenced by relative file path within the `fixtures/` dir.
 *
 * If no fixtures exist, the loader returns `null` and the caller MUST surface a
 * visible `no-fixtures` failure — NOT a silent skip.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGISTRY_ROOT } from './childRunner.js';

/** Transport a fixture describes — REST routes vs. a local file feed. */
export type FixtureTransport = 'http' | 'file';

/** One recorded HTTP response keyed to a request path (and optional method). */
export interface HttpRoute {
    /** URL path to match, e.g. `/contacts` or `/crm/v3/objects/contacts`. Matched by exact path then prefix. */
    Path: string;
    /** HTTP method to match (default: any). */
    Method?: string;
    /** Single-endpoint transports (GraphQL): match when the REQUEST BODY contains this substring (e.g. the door/query name). Path-matched routes without BodyContains act as the fallback. */
    BodyContains?: string;
    /** HTTP status to return (default: 200). */
    Status?: number;
    /**
     * Response body. Either an inline JSON value, or `{ "$file": "relative/path.json" }`
     * to load a recorded body from a sibling file under `fixtures/`.
     */
    Body?: unknown;
    /** Optional response headers (e.g. content-type override). */
    Headers?: Record<string, string>;
}

/** A single object's expected records, for T6 apply-and-assert. */
export interface FixtureObject {
    /** External object name (matches what DiscoverObjects returns). */
    Name: string;
    /**
     * Field name carrying the stable monotonic ordering key (e.g. file-feed
     * `microtime`, REST `updated_at`). T6 asserts ordering is respected. Optional.
     */
    OrderingField?: string;
}

/**
 * A delta pass T6 replays AFTER the initial pull, to prove create / update /
 * delete semantics. Records are raw vendor-shaped rows; `Deletes` are external IDs
 * to tombstone. This is transport-independent — it is applied through the same
 * fetch+apply path as the first pass.
 */
export interface FixtureDeltaPass {
    /** Object the delta applies to. */
    Object: string;
    /** HTTP route bodies to swap in for this pass (http transport). */
    Routes?: HttpRoute[];
    /** Replacement file content for this pass (file transport). */
    FileContent?: string;
    /** External IDs the connector should report as deleted this pass (for assert). */
    ExpectedDeletes?: string[];
    /** External IDs expected to be present (created or surviving) after this pass. */
    ExpectedPresent?: string[];
    /** External ID → expected field value pairs proving an UPDATE overwrote the prior row. */
    ExpectedUpdates?: Array<{ ExternalID: string; Field: string; Value: unknown }>;
}

/** A fully-loaded, validated fixture manifest. */
export interface FixtureManifest {
    Transport: FixtureTransport;
    /**
     * For `http`: the Configuration JSON keys the connector reads for its base URL
     * are filled by T5 with the mock server URL. Any EXTRA static config the
     * connector needs (e.g. an `ApiKey` placeholder) goes here and is merged in.
     * For `file`: extra config merged with the temp `storagePath`.
     */
    Configuration?: Record<string, unknown>;
    /**
     * Configuration key that should receive the mock base URL (http) or temp file
     * path (file). Defaults: http → `BaseURL`, file → `storagePath`.
     */
    ConfigUrlKey?: string;
    /** http transport: recorded routes. */
    Routes?: HttpRoute[];
    /** file transport: raw initial file content. */
    FileContent?: string;
    /** Objects to fetch + apply (T6). When omitted, T6 uses DiscoverObjects output. */
    Objects?: FixtureObject[];
    /** Optional delta passes for T6 create/update/delete assertions. */
    DeltaPasses?: FixtureDeltaPass[];
}

/** Result of attempting to load a connector's fixtures. */
export interface FixtureLoadResult {
    /** Loaded manifest, or null when no `fixtures/` manifest exists. */
    Manifest: FixtureManifest | null;
    /** Absolute path to the `fixtures/` dir (whether or not it exists). */
    FixturesDir: string;
    /** Non-fatal validation messages (e.g. a `$file` body that failed to load). */
    Warnings: string[];
}

/**
 * Load + resolve a connector's fixture manifest. Resolves any `{ "$file": "..." }`
 * body references against the `fixtures/` dir so the returned manifest is fully
 * inlined and self-contained for the child runner.
 *
 * @param connector registry directory name
 * @returns the resolved manifest (or `Manifest: null` when none exists)
 */
export function loadFixtures(connector: string): FixtureLoadResult {
    const fixturesDir = resolve(REGISTRY_ROOT, connector, 'fixtures');
    const manifestPath = resolve(fixturesDir, 'fixtures.json');
    const warnings: string[] = [];

    if (!existsSync(manifestPath)) {
        return { Manifest: null, FixturesDir: fixturesDir, Warnings: warnings };
    }

    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as FixtureManifest;
    const transport: FixtureTransport = raw.Transport === 'file' ? 'file' : 'http';

    const manifest: FixtureManifest = {
        Transport: transport,
        Configuration: raw.Configuration ?? {},
        ConfigUrlKey: raw.ConfigUrlKey ?? (transport === 'file' ? 'storagePath' : 'BaseURL'),
        Routes: (raw.Routes ?? []).map((r) => resolveRouteBody(r, fixturesDir, warnings)),
        FileContent: raw.FileContent,
        Objects: raw.Objects ?? [],
        DeltaPasses: (raw.DeltaPasses ?? []).map((d) => ({
            ...d,
            Routes: (d.Routes ?? []).map((r) => resolveRouteBody(r, fixturesDir, warnings)),
        })),
    };

    return { Manifest: manifest, FixturesDir: fixturesDir, Warnings: warnings };
}

/** Where a synthesized/loaded manifest came from (reported by the tier). */
export type FixtureSource = 'fixtures' | 'postman' | 'openapi' | 'none';

/** {@link loadFixtures} plus a recorded provenance of where the manifest came from. */
export interface FixtureLoadResultWithSource extends FixtureLoadResult {
    Source: FixtureSource;
}

/**
 * Load a connector's fixtures, falling back to SYNTHESIZING a mock from credential-free
 * docs when no hand-written `fixtures/fixtures.json` exists:
 *   1. `fixtures/fixtures.json` (authored fixtures) — preferred.
 *   2. a published **Postman collection** (`*.postman_collection.json` under sources/) →
 *      Routes from each request's saved example responses.
 *   3. an **OpenAPI/Swagger spec** → Routes from `paths.*.<method>.responses.*.content.*.example(s)`.
 * The synthesized manifest reuses the exact {@link FixtureManifest} shape, so T5's replay
 * engine + T6's apply engine consume it unchanged. Returns `Source:'none'` when nothing exists.
 */
export function loadFixturesOrSynthesize(connector: string): FixtureLoadResultWithSource {
    const direct = loadFixtures(connector);
    if (direct.Manifest) return { ...direct, Source: 'fixtures' };

    const fromPostman = synthesizeFromPostman(connector);
    if (fromPostman.Manifest) return { ...fromPostman, Source: 'postman' };

    const fromOpenApi = synthesizeFromOpenAPI(connector);
    if (fromOpenApi.Manifest) return { ...fromOpenApi, Source: 'openapi' };

    return { ...direct, Source: 'none' };
}

/** Directories under a connector's registry dir where docs/specs/collections are cached. */
function specSearchDirs(connector: string): string[] {
    return [
        resolve(REGISTRY_ROOT, connector, 'sources'),
        resolve(REGISTRY_ROOT, connector, 'source-cache'),
        resolve(REGISTRY_ROOT, connector),
    ];
}

/** Find the first file in the search dirs whose name matches a predicate. */
function findSpecFile(connector: string, match: (name: string) => boolean): string | null {
    for (const dir of specSearchDirs(connector)) {
        if (!existsSync(dir)) continue;
        let entries: string[] = [];
        try { entries = readdirSync(dir); } catch { continue; }
        const hit = entries.find((n) => match(n.toLowerCase()));
        if (hit) return resolve(dir, hit);
    }
    return null;
}

/** Build a `{Routes}` http manifest from a published Postman collection's saved responses. */
function synthesizeFromPostman(connector: string): FixtureLoadResult {
    const fixturesDir = resolve(REGISTRY_ROOT, connector, 'fixtures');
    const warnings: string[] = [];
    const file = findSpecFile(connector, (n) => n.endsWith('.postman_collection.json') || n === 'postman.json');
    if (!file) return { Manifest: null, FixturesDir: fixturesDir, Warnings: warnings };

    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(file, 'utf-8')); } catch { warnings.push(`Postman collection ${file} is not valid JSON.`); return { Manifest: null, FixturesDir: fixturesDir, Warnings: warnings }; }

    const routes: HttpRoute[] = [];
    const visit = (items: unknown): void => {
        if (!Array.isArray(items)) return;
        for (const it of items as Array<Record<string, unknown>>) {
            if (Array.isArray(it.item)) { visit(it.item); continue; } // folder
            const req = it.request as Record<string, unknown> | undefined;
            if (!req) continue;
            const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
            const path = postmanUrlPath(req.url);
            if (!path) continue;
            const responses = Array.isArray(it.response) ? (it.response as Array<Record<string, unknown>>) : [];
            const saved = responses.find((r) => r && r.body != null);
            const status = saved && typeof saved.code === 'number' ? (saved.code as number) : 200;
            let body: unknown = [];
            if (saved && typeof saved.body === 'string') { try { body = JSON.parse(saved.body); } catch { body = saved.body; } }
            routes.push({ Path: path, Method: method, Status: status, Body: body });
        }
    };
    visit((parsed as Record<string, unknown>).item);
    if (routes.length === 0) { warnings.push('Postman collection had no resolvable request paths.'); return { Manifest: null, FixturesDir: fixturesDir, Warnings: warnings }; }

    return {
        Manifest: { Transport: 'http', Configuration: {}, ConfigUrlKey: 'BaseURL', Routes: routes, Objects: [], DeltaPasses: [] },
        FixturesDir: fixturesDir,
        Warnings: warnings,
    };
}

/** Extract a path (leading-slash) from a Postman `url` field (string or {path:[...]}/{raw}). */
function postmanUrlPath(url: unknown): string | null {
    if (typeof url === 'string') { try { return new URL(url).pathname; } catch { return url.startsWith('/') ? url : null; } }
    if (url && typeof url === 'object') {
        const u = url as Record<string, unknown>;
        if (Array.isArray(u.path)) return '/' + (u.path as unknown[]).map((s) => String(s)).join('/');
        if (typeof u.raw === 'string') { try { return new URL(u.raw).pathname; } catch { return null; } }
    }
    return null;
}

/** Build a `{Routes}` http manifest from an OpenAPI/Swagger spec's response examples. */
function synthesizeFromOpenAPI(connector: string): FixtureLoadResult {
    const fixturesDir = resolve(REGISTRY_ROOT, connector, 'fixtures');
    const warnings: string[] = [];
    const file = findSpecFile(connector, (n) => n.endsWith('.openapi.json') || n.endsWith('.swagger.json') || n === 'openapi.json' || n === 'swagger.json');
    if (!file) return { Manifest: null, FixturesDir: fixturesDir, Warnings: warnings };

    let spec: Record<string, unknown>;
    try { spec = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>; } catch { warnings.push(`OpenAPI spec ${file} is not valid JSON.`); return { Manifest: null, FixturesDir: fixturesDir, Warnings: warnings }; }

    const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
    const routes: HttpRoute[] = [];
    for (const [p, ops] of Object.entries(paths)) {
        for (const [method, op] of Object.entries(ops)) {
            if (!['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) continue;
            const example = extractOpenApiExample(op as Record<string, unknown>);
            if (example === undefined) continue;
            routes.push({ Path: p.replace(/\{[^}]+\}/g, '0'), Method: method.toUpperCase(), Status: 200, Body: example });
        }
    }
    if (routes.length === 0) { warnings.push('OpenAPI spec had no response examples to synthesize from.'); return { Manifest: null, FixturesDir: fixturesDir, Warnings: warnings }; }

    return {
        Manifest: { Transport: 'http', Configuration: {}, ConfigUrlKey: 'BaseURL', Routes: routes, Objects: [], DeltaPasses: [] },
        FixturesDir: fixturesDir,
        Warnings: warnings,
    };
}

/** Pull the first 2xx response example out of an OpenAPI operation object. */
function extractOpenApiExample(op: Record<string, unknown>): unknown {
    const responses = (op.responses ?? {}) as Record<string, Record<string, unknown>>;
    for (const code of ['200', '201', '2XX', 'default']) {
        const resp = responses[code];
        if (!resp) continue;
        const content = (resp.content ?? {}) as Record<string, Record<string, unknown>>;
        for (const media of Object.values(content)) {
            if (media.example !== undefined) return media.example;
            const examples = media.examples as Record<string, { value?: unknown }> | undefined;
            if (examples) { const first = Object.values(examples)[0]; if (first && first.value !== undefined) return first.value; }
            const schema = media.schema as Record<string, unknown> | undefined;
            if (schema && schema.example !== undefined) return schema.example;
        }
    }
    return undefined;
}

/** Marker for a body stored in a sibling file under `fixtures/`. */
interface FileBodyRef { $file: string; }

/** Resolve a route's `{ $file }` body reference to inline JSON content. */
function resolveRouteBody(route: HttpRoute, fixturesDir: string, warnings: string[]): HttpRoute {
    const ref = route.Body as FileBodyRef | undefined;
    if (ref && typeof ref === 'object' && typeof ref.$file === 'string') {
        const bodyPath = resolve(fixturesDir, ref.$file);
        if (!existsSync(bodyPath)) {
            warnings.push(`Route ${route.Path}: $file body "${ref.$file}" not found under fixtures/.`);
            return { ...route, Body: null };
        }
        try {
            return { ...route, Body: JSON.parse(readFileSync(bodyPath, 'utf-8')) };
        } catch {
            // Not JSON — serve as raw text body.
            return { ...route, Body: readFileSync(bodyPath, 'utf-8') };
        }
    }
    return route;
}
