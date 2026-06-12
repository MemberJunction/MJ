/**
 * Local credential-free MOCK VENDOR server for the connector e2e harness.
 *
 * It replays a connector's recorded `fixtures.json` (the SAME shape the offline
 * tiers consume — `@memberjunction/mcp-mj-test-runner` `fixtures.ts`:
 * Transport / Routes / FileContent / Objects / DeltaPasses), so ONE canonical
 * fixtures file backs both the t5/t6 offline tiers AND this real-engine e2e.
 *
 * It exposes the vendor's recorded responses two core-safe ways, so the connector
 * — which runs SERVER-SIDE inside MJAPI — can reach it without any connector or
 * core code change:
 *
 *   1. ORIGIN mode (`startOrigin`): a plain `http://127.0.0.1:<port>` server that
 *      serves the recorded routes directly. Used for CONFIG-DRIVEN connectors
 *      (Aptify / iMIS / NetForum / NetSuite / NimbleAMS / GrowthZone / file-feed …)
 *      whose base URL comes from the persisted `Configuration` — the harness simply
 *      seeds the connection's `Configuration` BaseURL at this origin. NO proxy, no
 *      TLS, fully clean.
 *
 *   2. PROXY mode (`startForwardProxy`): a forward HTTP proxy (handles both plain
 *      `GET http://host/path` absolute-form requests AND `CONNECT host:443`
 *      tunnels) that answers EVERY upstream request from the fixtures instead of
 *      dialing the real vendor. Used for HARDCODED-base connectors (e.g. HubSpot
 *      `https://api.hubapi.com`). The MJAPI PROCESS is pointed at this proxy via
 *      `HTTP_PROXY` / `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` (Node 24 native-fetch
 *      env-proxy support) — that is ENV configuration of the MJAPI process, not a
 *      code change, so the redirect stays 100% core-safe. The CONNECT tunnel is
 *      terminated with a throwaway self-signed cert; the MJAPI process must trust
 *      it via `NODE_EXTRA_CA_CERTS` (workbench setup — documented, see CONNECTOR_E2E.md).
 *
 * Route matching mirrors the offline tiers exactly (`matchRoute`): exact path
 * first, then longest-prefix. Delta passes are applied by swapping the active
 * route set (`setRoutes`) — identical to how t5/t6 replay a DeltaPass.
 *
 * CREDENTIAL-FREE: the mock never sees, needs, or stores any secret. It ignores
 * Authorization headers entirely (a connector may send a dummy token; the mock
 * does not validate it). READ-ONLY semantics from the vendor's perspective — it
 * only ever REPLAYS recorded reads; it has no real backing store to mutate.
 */
import http from 'node:http';
import tls from 'node:tls';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture loading (shape-identical to mj-test-runner fixtures.ts — kept in sync
// by the contract documented in CONNECTOR_E2E.md; this is a self-contained .mjs
// reader so the harness has no TS build dependency).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load + resolve a connector's `fixtures.json`, inlining any `{ "$file": "x" }`
 * route bodies from sibling files. Returns a normalized manifest plus warnings.
 *
 * @param {string} fixturesDir  absolute path to the connector's `fixtures/` dir
 * @returns {{ manifest: object|null, fixturesDir: string, warnings: string[] }}
 */
export function loadFixtures(fixturesDir) {
    const manifestPath = resolve(fixturesDir, 'fixtures.json');
    const warnings = [];
    if (!existsSync(manifestPath)) return { manifest: null, fixturesDir, warnings };

    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const transport = raw.Transport === 'file' ? 'file' : 'http';
    const manifest = {
        Transport: transport,
        Configuration: raw.Configuration ?? {},
        ConfigUrlKey: raw.ConfigUrlKey ?? (transport === 'file' ? 'storagePath' : 'BaseURL'),
        UpstreamHost: raw.UpstreamHost ?? null,          // e.g. 'api.hubapi.com' (proxy mode target)
        Routes: (raw.Routes ?? []).map((r) => resolveRouteBody(r, fixturesDir, warnings)),
        FileContent: raw.FileContent,
        Objects: raw.Objects ?? [],
        DeltaPasses: (raw.DeltaPasses ?? []).map((d) => ({
            ...d,
            Routes: (d.Routes ?? []).map((r) => resolveRouteBody(r, fixturesDir, warnings)),
        })),
    };
    return { manifest, fixturesDir, warnings };
}

/** Resolve a route's `{ $file }` body reference to inline JSON (or raw text). */
function resolveRouteBody(route, fixturesDir, warnings) {
    const ref = route.Body;
    if (ref && typeof ref === 'object' && typeof ref.$file === 'string') {
        const bodyPath = resolve(fixturesDir, ref.$file);
        if (!existsSync(bodyPath)) {
            warnings.push(`Route ${route.Path}: $file body "${ref.$file}" not found under fixtures/.`);
            return { ...route, Body: null };
        }
        const text = readFileSync(bodyPath, 'utf-8');
        try { return { ...route, Body: JSON.parse(text) }; }
        catch { return { ...route, Body: text }; }
    }
    return route;
}

// ─────────────────────────────────────────────────────────────────────────────

// ─── GraphQL operation-name matching (for /graphql POST routes with 'Match' field) ──

/** Extract the operation name from a GraphQL query string. */
function extractGraphQLOperationName(queryStr) {
    if (!queryStr || typeof queryStr !== 'string') return null;
    const match = queryStr.match(/^\s*query\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (!match) return null;
    const fullName = match[1];
    // Handle PathLMS_<opName> or similar prefix patterns: return the part after underscore
    const parts = fullName.split('_');
    return parts.length > 1 ? parts[parts.length - 1] : fullName;
}

/** Check if a route's Match field matches the given GraphQL operation name. */
function matchesGraphQLFilter(matchStr, opName) {
    if (!matchStr || !opName) return false;
    if (matchStr.startsWith('operationName:')) {
        const expected = matchStr.substring('operationName:'.length);
        return opName === expected;
    }
    return false;
}

// Route matching + response serialization (mirrors offline-tier CHILD_TRANSPORT)
// ─────────────────────────────────────────────────────────────────────────────

/** Exact-path then longest-prefix match, with optional GraphQL operation-name filtering. */
export function matchRoute(routes, urlPath, method, body) {
    let exact = null, prefix = null;
    
    for (const r of routes) {
        if (r.Method && method && r.Method.toUpperCase() !== method.toUpperCase()) continue;
        
        // GraphQL operation-name filtering when body is provided and Match is specified
        if (body && urlPath === '/graphql' && r.Match) {
            let opName = null;
            try {
                const parsed = typeof body === 'string' ? JSON.parse(body) : body;
                if (parsed.query) opName = extractGraphQLOperationName(parsed.query);
            } catch { /* ignore; fall back to path-only */ }
            
            // If operation name matches, include this route in candidate set
            if (opName && matchesGraphQLFilter(r.Match, opName)) {
                if (r.Path === urlPath) { exact = r; break; }
                if (urlPath.startsWith(r.Path)) {
                    if (!prefix || r.Path.length > prefix.Path.length) prefix = r;
                }
            }
            // If Match is set but doesn't match, skip this route
            continue;
        }
        
        // Standard path-based matching (non-GraphQL or no body provided)
        if (r.Path === urlPath) { exact = r; break; }
        if (urlPath.startsWith(r.Path)) {
            if (!prefix || r.Path.length > prefix.Path.length) prefix = r;
        }
    }
    
    return exact || prefix;
}

/** Write the matched route (or a 404) onto a Node ServerResponse. */
function serveRoute(routes, urlPath, method, res, body) {
    const route = matchRoute(routes, urlPath, method, body);
    res.setHeader('content-type', 'application/json');
    if (!route) { res.statusCode = 404; res.end(JSON.stringify({ error: `no fixture for ${urlPath}` })); return; }
    res.statusCode = route.Status || 200;
    for (const [k, v] of Object.entries(route.Headers || {})) res.setHeader(k, v);
    res.end(typeof route.Body === 'string' ? route.Body : JSON.stringify(route.Body == null ? [] : route.Body));
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTPS-MITM tunnel cert policy
//
// `node:crypto` cannot mint an X.509 cert without a hand-rolled ASN.1 writer
// (error-prone), so the mock does NOT auto-generate one. HTTPS CONNECT-tunnel
// (MITM) proxy mode therefore REQUIRES a pre-supplied PEM cert/key (workbench
// generates one with `openssl` once — see CONNECTOR_E2E.md) passed via
// `startForwardProxy(manifest, { tlsCert, tlsKey })`, and the MJAPI process trusts
// it via NODE_EXTRA_CA_CERTS. Config-driven connectors use ORIGIN mode and need no
// cert at all — that is the clean default and covers the majority of connectors.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1) ORIGIN mode — plain http server for config-driven connectors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Boot a plain HTTP origin that serves the manifest's routes. The connector is
 * pointed here by seeding its Configuration BaseURL (no proxy / no TLS).
 *
 * @param {object} manifest  loaded fixture manifest (http transport)
 * @returns {Promise<{ baseURL:string, setRoutes(routes:Array):void, close():Promise<void> }>}
 */
export async function startOrigin(manifest) {
    let routes = manifest.Routes || [];
    const server = http.createServer((req, res) => {
        const u = new URL(req.url || '/', 'http://127.0.0.1');
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            serveRoute(routes, u.pathname, req.method, res, body || undefined);
        });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    return {
        baseURL: `http://127.0.0.1:${port}`,
        setRoutes(next) { routes = next || []; },
        close: () => new Promise((r) => server.close(() => r())),
    };
}

/**
 * Materialize a file-feed manifest's content to a temp file and return its path,
 * so a config-driven file connector can be pointed at it (mirrors t5/t6 `file`).
 *
 * @param {object} manifest  loaded fixture manifest (file transport)
 * @returns {{ filePath:string, setFileContent(text:string):void }}
 */
export function materializeFileFeed(manifest) {
    const dir = mkdtempSync(resolve(tmpdir(), 'mj-e2e-file-'));
    const filePath = resolve(dir, 'feed.dat');
    writeFileSync(filePath, manifest.FileContent != null ? String(manifest.FileContent) : '', 'utf-8');
    return {
        filePath,
        setFileContent(text) { writeFileSync(filePath, text != null ? String(text) : '', 'utf-8'); },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) PROXY mode — forward proxy that answers from fixtures (hardcoded-base connectors)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Boot a forward HTTP proxy whose every upstream answer comes from the fixtures.
 *
 * Handles:
 *   - absolute-form plain requests:  `GET http://api.host/path` → served from routes
 *   - `CONNECT api.host:443` tunnels: terminated with the supplied TLS cert, then
 *     the inner HTTPS request is served from routes (MITM, local-only).
 *
 * The MJAPI process points at this via HTTP_PROXY/HTTPS_PROXY + NODE_USE_ENV_PROXY=1.
 *
 * @param {object} manifest  loaded fixture manifest (http transport)
 * @param {object} [opts]    { tlsCert?:string|Buffer, tlsKey?:string|Buffer } PEM for the MITM leaf
 * @returns {Promise<{ proxyURL:string, setRoutes(routes:Array):void, tlsRequired:boolean, close():Promise<void> }>}
 */
export async function startForwardProxy(manifest, opts = {}) {
    let routes = manifest.Routes || [];
    const haveTls = !!(opts.tlsCert && opts.tlsKey);

    // Plain absolute-form proxying: req.url is a full URL; serve from routes by its pathname.
    const proxy = http.createServer((req, res) => {
        let pathname = '/';
        try { pathname = new URL(req.url, 'http://placeholder').pathname; } catch { /* keep '/' */ }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            serveRoute(routes, pathname, req.method, res, body || undefined);
        });
    });

    // CONNECT tunnels (HTTPS). Terminate TLS locally and serve the inner request.
    proxy.on('connect', (req, clientSocket, head) => {
        if (!haveTls) {
            // No cert to MITM with — refuse cleanly so the failure is visible, not a hang.
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            clientSocket.end('mock proxy has no TLS cert for CONNECT (set tlsCert/tlsKey)');
            return;
        }
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        // An HTTP server that serves the inner (decrypted) request from the fixtures.
        const inner = http.createServer((ireq, ires) => {
            const u = new URL(ireq.url || '/', 'https://placeholder');
            let body = '';
            ireq.on('data', chunk => { body += chunk; });
            ireq.on('end', () => {
                serveRoute(routes, u.pathname, ireq.method, ires, body || undefined);
            });
        });
        // Terminate TLS on the tunneled client socket, then hand the cleartext stream
        // to the inner HTTP server. Push back any bytes already buffered with CONNECT.
        if (head && head.length) clientSocket.unshift(head);
        const tlsSocket = new tls.TLSSocket(clientSocket, {
            isServer: true,
            cert: opts.tlsCert,
            key: opts.tlsKey,
        });
        tlsSocket.on('error', () => { try { clientSocket.destroy(); } catch { /* best-effort */ } });
        inner.emit('connection', tlsSocket);
    });

    await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
    const port = proxy.address().port;
    return {
        proxyURL: `http://127.0.0.1:${port}`,
        tlsRequired: !haveTls, // true ⇒ a HARDCODED-https connector cannot be MITM'd without a cert
        setRoutes(next) { routes = next || []; },
        close: () => new Promise((r) => proxy.close(() => r())),
    };
}
