/**
 * Shared infrastructure for the credential-free, offline connector tiers
 * (T2/T3/T5/T6) and reused by the read-only live tier (T8).
 *
 * **WHY A CHILD PROCESS.** A connector's source imports `@memberjunction/*`
 * workspace packages and is authored in TypeScript. The only way to drive its
 * ABSTRACT methods (`TestConnection` / `DiscoverObjects` / `DiscoverFields` /
 * `FetchChanges`) faithfully — without a build step and with the workspace deps
 * resolvable — is to spawn a short-lived `tsx` child INSIDE the real connectors
 * package, exactly as T8 does. The mock HTTP server (T5) and the SQLite backend
 * (T6) therefore also live inside that child, because the connector's real
 * `fetch()` calls must hit `127.0.0.1:<port>` in the same process and the SQLite
 * apply happens right after the fetch.
 *
 * **SHAPE-AGNOSTIC.** Nothing here assumes REST. The child only ever calls the
 * connector's abstract methods through an in-memory `CompanyIntegration`. A
 * file-feed connector (config → local file path) is driven by the same harness
 * as a REST connector (config → mock base URL) — the only difference is what the
 * fixture puts in the `Configuration` JSON, which the tier decides, not the harness.
 *
 * **CREDENTIAL-FREE.** None of the tiers built on this module pass a credential
 * file; the in-memory `Configuration` is synthesised from fixtures / a mock URL /
 * a temp file path. Only T8 (in `tierRunner.ts`) injects real credential bytes.
 *
 * @see ../tierRunner.ts (T8 — the read-only live tier that established this pattern)
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ── Registry / package roots (shared with tierRunner) ────────────────

/** The connectors-registry root (per-connector metadata, fixtures, sources, specs). */
export const REGISTRY_ROOT =
    process.env.MJ_CONNECTORS_REGISTRY ?? resolve(process.cwd(), 'packages/Integration/connectors-registry');

/** Repo root, derived from the registry root (registry → Integration → packages → repo). */
export const REPO_ROOT = resolve(REGISTRY_ROOT, '..', '..', '..');

/** The REAL connectors package whose source the tiers drive via `tsx`. */
export const CONNECTORS_PKG_DIR = resolve(REPO_ROOT, 'packages', 'Integration', 'connectors');

/** Connector `.ts` source lives here (`<ClassName>.ts`). */
export const CONNECTORS_SRC_DIR = resolve(CONNECTORS_PKG_DIR, 'src');

// ── Connector identity resolution (shared with T4/T8) ────────────────

/** Resolved connector identity used by every tier that instantiates the connector. */
export interface ConnectorIdentity {
    /** The connector class name, e.g. `PropFuelConnector`. */
    ClassName: string;
    /** Absolute path to `<ClassName>.ts` in the real connectors package. */
    SourcePath: string;
    /** The canonical integration name from registry metadata, if known. */
    IntegrationName?: string;
}

/** Minimal registry-metadata read of `fields.ClassName` + `fields.Name`. */
interface RegistryIdentity {
    ClassName?: string;
    IntegrationName?: string;
}

/**
 * Resolve a registry connector name (e.g. `propfuel`) to its connector class +
 * source path in the REAL connectors package. Identical strategy to the resolver
 * the live tier uses: registry metadata `fields.ClassName` first, then a
 * case-insensitive `<connector>Connector.ts` filename fallback.
 */
export function resolveConnectorIdentity(connector: string): ConnectorIdentity | null {
    const fromMeta = readClassNameFromRegistry(connector);
    if (fromMeta?.ClassName) {
        const sourcePath = resolve(CONNECTORS_SRC_DIR, `${fromMeta.ClassName}.ts`);
        if (existsSync(sourcePath)) {
            return { ClassName: fromMeta.ClassName, SourcePath: sourcePath, IntegrationName: fromMeta.IntegrationName };
        }
    }

    const matchedFile = findConnectorSourceByName(connector);
    if (matchedFile) {
        return {
            ClassName: matchedFile.replace(/\.ts$/, ''),
            SourcePath: resolve(CONNECTORS_SRC_DIR, matchedFile),
            IntegrationName: fromMeta?.IntegrationName,
        };
    }
    return null;
}

/**
 * Read the connector's integration-metadata file from the registry and pull out
 * `fields.ClassName` + `fields.Name`. Tries the same candidate paths as the T1
 * invariant loader and normalises an array-wrapped root (mj-sync push convention).
 */
function readClassNameFromRegistry(connector: string): RegistryIdentity | null {
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
            const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
            const root = Array.isArray(raw) ? raw[0] : raw;
            const fields = (root as { fields?: { ClassName?: unknown; Name?: unknown } } | undefined)?.fields;
            const className = typeof fields?.ClassName === 'string' ? fields.ClassName : undefined;
            const name = typeof fields?.Name === 'string' ? fields.Name : undefined;
            if (className || name) return { ClassName: className, IntegrationName: name };
        } catch {
            // Malformed metadata — fall through to the filename fallback.
        }
    }
    return null;
}

/**
 * Case-insensitively find `<connector>Connector.ts` among the real connectors
 * source files (e.g. `propfuel` → `PropFuelConnector.ts`).
 */
function findConnectorSourceByName(connector: string): string | undefined {
    if (!existsSync(CONNECTORS_SRC_DIR)) return undefined;
    const target = `${connector}connector.ts`.toLowerCase();
    return readdirSync(CONNECTORS_SRC_DIR).find((f) => f.toLowerCase() === target);
}

/** Locate the `tsx` runner under the repo-root `node_modules/.bin`. */
export function resolveTsxBin(): string | null {
    const bin = resolve(REPO_ROOT, 'node_modules', '.bin', 'tsx');
    return existsSync(bin) ? bin : null;
}

// ── Child-runner spawn + sentinel parsing ────────────────────────────

/** Sentinel prefix the offline-tier children emit on the single stdout result line. */
export const OFFLINE_RESULT_SENTINEL = '__MJ_TIER_RESULT__';

/**
 * Non-secret result the offline-tier children emit. Each tier interprets the
 * `data` payload against its own contract; `ok:false` always means the harness
 * could not even set the connector up (import / instantiate / fixture wiring).
 */
export interface ChildResult<TData = Record<string, unknown>> {
    ok: boolean;
    reason?: string;
    integrationName?: string;
    data?: TData;
}

/** Inputs for spawning a `tsx` child runner from a tier. */
export interface SpawnChildOptions {
    /** Resolved connector identity (class + source path). */
    identity: ConnectorIdentity;
    /** TypeScript source of the child runner script (an ESM `.mts` module). */
    childSource: string;
    /**
     * Extra environment passed to the child. Values must be strings and must
     * NEVER contain credential bytes (these tiers are credential-free).
     */
    env: Record<string, string>;
    /** Wall-clock timeout for the child in ms. */
    timeoutMs?: number;
    /**
     * Connector registry slug (e.g. `growthzone`). When provided, the spawn resolves the
     * connector's Declared metadata file and passes it to the child as MJ_TIER_METADATA_FILE;
     * the child preamble then SEEDS IntegrationEngineBase from it — so METADATA-DRIVEN
     * connectors (whose discovery/fetch/capability getters resolve IOs from the engine cache)
     * run their REAL paths in the replay tiers instead of silently no-opping (the v1
     * harness-reality gap; ARCHITECTURE_REFACTOR.md).
     */
    connector?: string;
}

/** Resolve the connector's Declared metadata file: registry candidates first, then the repo metadata tree. */
export function resolveMetadataFilePath(connector: string): string | null {
    const connectorDir = resolve(REGISTRY_ROOT, connector);
    const candidates = [
        resolve(connectorDir, 'metadata/integrations', `.${connector}.json`),
        resolve(connectorDir, 'metadata/integrations', `.${connector}.integration.json`),
        resolve(connectorDir, 'metadata/integrations', connector, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.integration.json`),
        resolve(connectorDir, `.${connector}.json`),
        // The repo's canonical metadata tree (what mj-sync deploys from).
        resolve(REPO_ROOT, 'metadata/integrations', connector, `.${connector}.integration.json`),
        resolve(REPO_ROOT, 'metadata/integrations', `.${connector}.json`),
    ];
    for (const path of candidates) {
        if (existsSync(path)) return path;
    }
    return null;
}

/** Outcome of a child spawn, before tier-specific interpretation. */
export interface SpawnChildOutcome<TData = Record<string, unknown>> {
    /** The parsed sentinel result, or null if the child emitted none. */
    parsed: ChildResult<TData> | null;
    /** Raw stdout (sentinel line stripped of secrets — there are none here). */
    stdout: string;
    /** Raw stderr (already credential-free; clipped by callers). */
    stderr: string;
    /** Child exit status. */
    status: number | null;
}

/**
 * Write the child runner source to a temp `.mts`, spawn it via `tsx` inside the
 * real connectors package (so workspace deps resolve), and return the parsed
 * sentinel result. Cleans up the temp script regardless of outcome.
 */
export function spawnChildRunner<TData = Record<string, unknown>>(
    opts: SpawnChildOptions,
): SpawnChildOutcome<TData> {
    const tsx = resolveTsxBin();
    if (!tsx) {
        return {
            parsed: { ok: false, reason: `tsx runner not found under ${REPO_ROOT}/node_modules/.bin` },
            stdout: '',
            stderr: '',
            status: null,
        };
    }
    const scriptDir = mkdtempSync(resolve(tmpdir(), 'mj-tier-'));
    const scriptPath = resolve(scriptDir, 'runner.mts');
    try {
        writeFileSync(scriptPath, opts.childSource, 'utf-8');
        const result = spawnSync(tsx, [scriptPath], {
            cwd: CONNECTORS_PKG_DIR,
            encoding: 'utf-8',
            timeout: opts.timeoutMs ?? 60_000,
            maxBuffer: 32 * 1024 * 1024,
            env: {
                ...process.env,
                MJ_TIER_CONNECTOR_SOURCE: opts.identity.SourcePath,
                MJ_TIER_CONNECTOR_CLASS: opts.identity.ClassName,
                MJ_TIER_INTEGRATION_NAME: opts.identity.IntegrationName ?? opts.identity.ClassName,
                MJ_TIER_RESULT_SENTINEL: OFFLINE_RESULT_SENTINEL,
                ...(opts.connector
                    ? (() => { const p = resolveMetadataFilePath(opts.connector); return p ? { MJ_TIER_METADATA_FILE: p } : {}; })()
                    : {}),
                ...opts.env,
            },
        });
        return {
            parsed: extractSentinelResult<TData>(result.stdout ?? ''),
            stdout: result.stdout ?? '',
            stderr: result.stderr ?? '',
            status: result.status,
        };
    } finally {
        try { rmSync(scriptDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

/** Find the last sentinel-prefixed line in stdout and JSON-parse it. */
function extractSentinelResult<TData>(stdout: string): ChildResult<TData> | null {
    const lines = stdout.split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i--) {
        const idx = lines[i].indexOf(OFFLINE_RESULT_SENTINEL);
        if (idx < 0) continue;
        try {
            return JSON.parse(lines[i].slice(idx + OFFLINE_RESULT_SENTINEL.length)) as ChildResult<TData>;
        } catch {
            return null;
        }
    }
    return null;
}

/** Clip stderr to a bounded, single-paragraph string for surfacing in tier errors. */
export function clipStderr(stderr: string, max = 500): string {
    return stderr.trim().replace(/\s+/g, ' ').slice(0, max);
}

// ── Shared child-runner source fragment ──────────────────────────────

/**
 * A JS source fragment, embedded verbatim at the top of every offline child
 * runner, that:
 *   - reads the connector source/class/integration-name from env,
 *   - dynamically imports + instantiates the connector,
 *   - builds an IN-MEMORY `CompanyIntegration` whose `Configuration` is supplied
 *     by the tier (mock URL, temp file path, etc.) — and which also exposes the
 *     `.Get()` / `.Set()` / `.GetAll()` BaseEntity-style accessors some connectors
 *     use (e.g. FileFeed / QuickBooks / Wicket read `companyIntegration.Get('Configuration')`),
 *   - exposes `emit()` / `clip()` helpers and a `SENTINEL`.
 *
 * It defines `loadConnector(configuration)` returning `{ connector, companyIntegration, contextUser }`
 * and never assumes the connector is REST. The tier-specific tail (appended after
 * this fragment) does the actual driving and calls `emit({ ok, data })`.
 */
export const CHILD_PREAMBLE = `/* eslint-disable */
// Auto-generated offline connector tier runner. CREDENTIAL-FREE — no credential bytes are ever present.
const SENTINEL = process.env.MJ_TIER_RESULT_SENTINEL;
const SOURCE = process.env.MJ_TIER_CONNECTOR_SOURCE;
const CLASS = process.env.MJ_TIER_CONNECTOR_CLASS;
const INTEGRATION_NAME = process.env.MJ_TIER_INTEGRATION_NAME;

function emit(obj) { process.stdout.write('\\n' + SENTINEL + JSON.stringify(obj) + '\\n'); }
function clip(v, n) { const s = v == null ? String(v) : String(v); return s.length > n ? s.slice(0, n) : s; }

// In-memory CompanyIntegration: a plain object with the fields connectors read
// directly (Configuration / CredentialID / Name) PLUS the BaseEntity-style
// accessors some connectors call (.Get/.Set/.GetAll). CredentialID is null so the
// connector never touches the MJ metadata provider / database.
function makeCompanyIntegration(configuration) {
  const ci = {
    ID: 'tier-test', IntegrationID: 'tier-test', Name: INTEGRATION_NAME || CLASS,
    CredentialID: null, Configuration: configuration,
    Get(field) { return this[field]; },
    Set(field, value) { this[field] = value; },
    GetAll() { return { ID: this.ID, IntegrationID: this.IntegrationID, Name: this.Name, CredentialID: this.CredentialID, Configuration: this.Configuration }; },
  };
  return ci;
}

// Seed IntegrationEngineBase from the connector's Declared metadata file (v2 harness fix —
// ARCHITECTURE_REFACTOR.md). Metadata-driven connectors resolve their IOs/IOFs/capabilities
// from the engine cache; without seeding they silently no-op in the replay tiers (discover 0
// objects / throw on GetCachedObject). Best-effort: no metadata file → no seed → unchanged
// behaviour for config-driven connectors. Same-process singleton (BaseSingleton global store)
// guarantees the connector sees the seeded instance.
async function seedEngineCache(companyIntegration) {
  const file = process.env.MJ_TIER_METADATA_FILE;
  if (!file) return false;
  try {
    const { readFileSync } = await import('node:fs');
    const raw = JSON.parse(readFileSync(file, 'utf-8'));
    const root = Array.isArray(raw) ? raw[0] : raw;
    if (!root || !root.fields) return false;
    // Offline @lookup/@parent refs can't resolve — null them (FK pointers etc.), but keep the
    // structural parent wiring via the synthetic IDs below.
    const scrubRefs = (row) => {
      for (const k of Object.keys(row)) {
        const v = row[k];
        if (typeof v === 'string' && (v.startsWith('@lookup:') || v.startsWith('@parent:'))) row[k] = null;
      }
      return row;
    };
    const integ = scrubRefs({ ...root.fields });
    integ.ID = companyIntegration.IntegrationID; // align with the in-memory CI so GetCachedObject resolves
    const ios = []; const iofs = [];
    const ioRecs = (root.relatedEntities && root.relatedEntities['MJ: Integration Objects']) || [];
    let i = 0;
    for (const ioRec of ioRecs) {
      i++;
      const io = scrubRefs({ ...((ioRec && ioRec.fields) || {}) });
      io.ID = 'seed-io-' + i;
      io.IntegrationID = integ.ID;
      ios.push(io);
      const iofRecs = (ioRec && ioRec.relatedEntities && ioRec.relatedEntities['MJ: Integration Object Fields']) || [];
      let j = 0;
      for (const fr of iofRecs) {
        j++;
        const iof = scrubRefs({ ...((fr && fr.fields) || {}) });
        iof.ID = 'seed-iof-' + i + '-' + j;
        iof.IntegrationObjectID = io.ID;
        iofs.push(iof);
      }
    }
    // The child script lives in a temp dir, so a BARE specifier can't resolve from here —
    // resolve the package FROM THE CONNECTOR SOURCE's location (same node_modules the
    // connector itself uses, which also guarantees the SAME singleton instance).
    const { createRequire } = await import('node:module');
    const req = createRequire(SOURCE);
    const ebPath = req.resolve('@memberjunction/integration-engine-base');
    const { IntegrationEngineBase } = await import(ebPath);
    IntegrationEngineBase.Instance.SeedForTesting({
      Integrations: [integ],
      IntegrationObjects: ios,
      IntegrationObjectFields: iofs,
      CompanyIntegrations: [companyIntegration],
    });
    return true;
  } catch (e) {
    // Seeding is best-effort; a malformed metadata file must not mask the tier's real result.
    process.stderr.write('seedEngineCache skipped: ' + clip(e && e.message ? e.message : e, 160) + '\\n');
    return false;
  }
}

async function loadConnector(configuration) {
  if (!SOURCE || !CLASS) throw new Error('missing connector source/class env');
  const mod = await import(SOURCE);
  const Ctor = mod[CLASS];
  if (typeof Ctor !== 'function') throw new Error('class ' + CLASS + ' not exported from source');
  const connector = new Ctor();
  const companyIntegration = makeCompanyIntegration(configuration);
  const contextUser = { ID: 'tier-test', Email: 'tier-test@local', Name: 'tier-test' };
  const cacheSeeded = await seedEngineCache(companyIntegration);
  return { connector, companyIntegration, contextUser, cacheSeeded };
}
`;

/**
 * A SECOND embeddable JS fragment that provides the shared TRANSPORT layer used by
 * the tiers that drive the connector against recorded fixtures (T2/T3/T5/T6).
 * Append it AFTER {@link CHILD_PREAMBLE} (it depends on `clip`). It requires the
 * child to `import http from 'node:http'` and the fs/os/path helpers at the top of
 * its own source (kept explicit per-tier so a tier that doesn't need them doesn't
 * import them).
 *
 * `setupTransport(manifest)` returns:
 *   - `configuration` — the Configuration JSON to pass to `loadConnector`, with the
 *     URL key filled with the mock base URL (http) or temp file path (file),
 *   - `baseURL` — the mock base URL (http only; null for file),
 *   - `transport` — `'http' | 'file'`,
 *   - `setRoutes(routes)` — swap mock responses (http delta passes),
 *   - `setFileContent(text)` — rewrite the temp file (file delta passes),
 *   - `wireBaseURL(connector)` — override `connector.GetBaseURL` so connectors with a
 *     hardcoded base are redirected to the mock (http only); returns the original or null,
 *   - `teardown()` — close the mock server / leave the temp dir for the OS to reap.
 *
 * Shape-agnostic: the assert logic in each tier never branches on transport — it
 * just calls the connector's abstract methods against whatever `setupTransport`
 * wired up.
 */
export const CHILD_TRANSPORT = `
function _matchRoute(routes, urlPath, method) {
  let exact = null, prefix = null;
  for (const r of routes) {
    if (r.Method && method && r.Method.toUpperCase() !== method.toUpperCase()) continue;
    if (r.Path === urlPath) { exact = r; break; }
    if (urlPath.startsWith(r.Path)) { if (!prefix || r.Path.length > prefix.Path.length) prefix = r; }
  }
  return exact || prefix;
}

async function setupTransport(manifest) {
  const transport = manifest.Transport === 'file' ? 'file' : 'http';
  const urlKey = manifest.ConfigUrlKey || (transport === 'file' ? 'storagePath' : 'BaseURL');
  const extra = manifest.Configuration || {};

  if (transport === 'file') {
    const dir = _mkdtempSync(_pathResolve(_tmpdir(), 'mj-tier-file-'));
    const filePath = _pathResolve(dir, 'feed.dat');
    _writeFileSync(filePath, manifest.FileContent != null ? String(manifest.FileContent) : '', 'utf-8');
    return {
      transport, baseURL: null,
      configuration: JSON.stringify({ ...extra, [urlKey]: filePath }),
      setRoutes() {},
      setFileContent(text) { _writeFileSync(filePath, text != null ? String(text) : '', 'utf-8'); },
      wireBaseURL() { return null; },
      teardown() {},
    };
  }

  let routes = manifest.Routes || [];
  const server = await new Promise((resolveServer) => {
    const s = _http.createServer((req, res) => {
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      // Read the request body first: single-endpoint transports (GraphQL — every door POSTs the
      // SAME /graphql path) need BODY-aware route selection. A route may declare BodyContains; among
      // path-matched routes, the first whose BodyContains substring appears in the request body wins
      // (a path-matched route WITHOUT BodyContains is the fallback). Path-only fixtures unchanged.
      let bodyChunks = [];
      req.on('data', (c) => bodyChunks.push(c));
      req.on('end', () => {
        const reqBody = Buffer.concat(bodyChunks).toString('utf-8');
        const pathMatches = routes.filter((r) => u.pathname === r.Path || u.pathname.startsWith(r.Path));
        let route = pathMatches.find((r) => r.BodyContains && reqBody.includes(r.BodyContains))
            ?? pathMatches.find((r) => !r.BodyContains);
        if (route == null && pathMatches.length === 0) route = _matchRoute(routes, u.pathname, req.method);
        res.setHeader('content-type', 'application/json');
        if (!route) { res.statusCode = 404; res.end(JSON.stringify({ error: 'no fixture for ' + u.pathname })); return; }
        res.statusCode = route.Status || 200;
        const headers = route.Headers || {};
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        res.end(typeof route.Body === 'string' ? route.Body : JSON.stringify(route.Body == null ? [] : route.Body));
      });
    });
    s.listen(0, '127.0.0.1', () => resolveServer(s));
  });
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  // ConfigUrlTemplates: additional Configuration keys whose values reference the mock base URL via
  // a {BASE} placeholder (e.g. {"tokenUrl": "{BASE}/oauth/token"} for connectors whose token
  // endpoint is a FULL URL on a different host than the data plane — ORCID's client_credentials).
  const urlTemplates = manifest.ConfigUrlTemplates || {};
  const templatedCfg = { ...extra, [urlKey]: baseURL };
  for (const [tk, tv] of Object.entries(urlTemplates)) templatedCfg[tk] = String(tv).split('{BASE}').join(baseURL);
  return {
    transport, baseURL,
    configuration: JSON.stringify(templatedCfg),
    setRoutes(next) { routes = next || []; },
    setFileContent() {},
    wireBaseURL(connector) {
      if (typeof connector.GetBaseURL === 'function') { const orig = connector.GetBaseURL; connector.GetBaseURL = function () { return baseURL; }; return orig; }
      return null;
    },
    teardown() { try { server.close(); } catch (e) {} },
  };
}
`;
