/**
 * Real IO wiring for the connector-agnostic e2e harness (connector-e2e-harness.mjs).
 * Kept separate so the orchestration stays pure/injectable.
 *
 * Builds the `mock` object the harness consumes. There are two core-safe ways to
 * point a SERVER-SIDE connector (running inside MJAPI) at the local mock — chosen
 * by the connector's HTTP shape, declared in its `fixtures.json`:
 *
 *   A) CONFIG-DRIVEN base URL (the clean default; majority of connectors —
 *      Aptify / iMIS / NetForum / NetSuite / NimbleAMS / GrowthZone / file-feed …):
 *      the connector reads its base URL from the persisted `Configuration`. The
 *      harness boots a plain HTTP origin (mock-vendor-server.startOrigin) and the
 *      PLAN seeds the connection's `Configuration[ConfigUrlKey]` at that origin
 *      when it creates the connection (mode:create) — NO proxy, NO TLS, fully clean.
 *      For these, `buildMock` returns `{ mode:'mock', kind:'origin', baseURL, configPatch, setRoutes, close }`
 *      and the plan merges `configPatch` into CredentialValues/Configuration.
 *
 *   B) HARDCODED base URL (e.g. HubSpot `https://api.hubapi.com`): the connector
 *      cannot be redirected via config. The harness boots a forward proxy
 *      (mock-vendor-server.startForwardProxy) and the MJAPI PROCESS must be launched
 *      with `HTTP_PROXY`/`HTTPS_PROXY` pointed at it + `NODE_USE_ENV_PROXY=1`
 *      (Node 24 native-fetch env-proxy) and, for HTTPS, `NODE_EXTRA_CA_CERTS` trusting
 *      the proxy's MITM cert. That is ENV configuration of the MJAPI process — NOT a
 *      code change — so the redirect stays 100% core-safe. `buildMock` returns
 *      `{ mode:'mock', kind:'proxy', proxyURL, tlsRequired, proxyEnvExpected, setRoutes, close }`
 *      so the operator/agent can VERIFY the MJAPI process is wired to this proxy.
 *
 * In LIVE mode `buildMock` returns an inert mock ({ mode:'live', setRoutes:noop,
 * close:noop }) — the harness skips delta passes (we never mutate the live vendor).
 *
 * CREDENTIAL-FREE: nothing here reads or needs a secret. The plan supplies a dummy
 * credential field only if CreateConnection structurally requires one.
 */
import { loadFixtures, startOrigin, startForwardProxy, materializeFileFeed } from './mock-vendor-server.mjs';
import { readFileSync, existsSync } from 'node:fs';

/**
 * Build the `mock` object for the harness from a connector's fixtures + mode.
 *
 * @param {object} args
 * @param {'mock'|'live'} args.mode
 * @param {string} args.fixturesDir   absolute path to the connector's `fixtures/` dir (mock mode)
 * @param {{cert?:string,key?:string}} [args.tls]  PEM file paths for HTTPS-MITM proxy mode
 * @returns {Promise<object>} the mock object + (mock mode) the loaded manifest & config patch
 */
export async function buildMock({ mode, fixturesDir, tls }) {
    if (mode === 'live') {
        return { mode: 'live', manifest: null, configPatch: {}, setRoutes() {}, setFileContent() {}, close: async () => {} };
    }

    const { manifest, warnings } = loadFixtures(fixturesDir);
    if (!manifest) {
        throw new Error(`connector-e2e mock mode: no fixtures.json under ${fixturesDir}. Author fixtures (see CONNECTOR_E2E.md) — mock mode replays them; with none present there is nothing to run.`);
    }

    // FILE transport (file-feed connectors): materialize content to a temp file and
    // hand back the config patch pointing the connector's storage path at it.
    if (manifest.Transport === 'file') {
        const feed = materializeFileFeed(manifest);
        return {
            mode: 'mock', kind: 'file', manifest, warnings,
            configPatch: { [manifest.ConfigUrlKey]: feed.filePath },
            setRoutes() {},
            setFileContent(text) { feed.setFileContent(text); },
            close: async () => {},
        };
    }

    // HTTP transport. UpstreamHost present ⇒ the connector HARDCODES its base URL ⇒
    // proxy mode (MJAPI process must be proxied at us). Otherwise ⇒ config-driven ⇒
    // origin mode (the plan seeds Configuration[ConfigUrlKey] at our origin).
    if (manifest.UpstreamHost) {
        const tlsPem = readTlsPem(tls);
        const proxy = await startForwardProxy(manifest, tlsPem);
        return {
            mode: 'mock', kind: 'proxy', manifest, warnings,
            proxyURL: proxy.proxyURL,
            tlsRequired: proxy.tlsRequired,
            // What the operator/agent must have set on the MJAPI process for the redirect to work.
            proxyEnvExpected: {
                HTTP_PROXY: proxy.proxyURL, HTTPS_PROXY: proxy.proxyURL,
                NODE_USE_ENV_PROXY: '1',
                ...(proxy.tlsRequired ? {} : { NODE_EXTRA_CA_CERTS: '<path to the proxy MITM CA cert>' }),
            },
            configPatch: {}, // hardcoded-base connectors take no config redirect
            setRoutes(routes) { proxy.setRoutes(routes); },
            setFileContent() {},
            close: async () => { await proxy.close(); },
        };
    }

    // OAuth/token connectors run a token round-trip during Authenticate() BEFORE any data fetch.
    // The fixture authors token/instance URLs against the placeholder origin (http://127.0.0.1:9)
    // because the real mock port is only known at runtime. So (1) ALWAYS serve a token response for
    // the common token paths, and (2) rewrite every Configuration value that points at the
    // placeholder origin to the real mock origin — otherwise the connector POSTs to the dead
    // placeholder port and every object fails with "fetch failed". General across OAuth connectors.
    const TOKEN_ROUTES = [...mockTokenRoutes(), ...mockDiscoveryRoutes(), ...mockSoqlTerminators()];
    const origin = await startOrigin({ ...manifest, Routes: [...(manifest.Routes || []), ...TOKEN_ROUTES] });
    const realOrigin = origin.baseURL;
    const configPatch = rewriteConfigToOrigin(manifest.Configuration || {}, realOrigin);
    // Always force the connector's config-driven base URL (ConfigUrlKey) at the real origin.
    configPatch[manifest.ConfigUrlKey] = realOrigin;
    // Wrap setRoutes so phase-specific route swaps NEVER drop the always-on token routes.
    const setRoutesWithToken = (routes) => origin.setRoutes([...(routes || []), ...TOKEN_ROUTES]);
    return {
        mode: 'mock', kind: 'origin', manifest, warnings,
        baseURL: realOrigin,
        configPatch,
        setRoutes(routes) { setRoutesWithToken(routes); },
        setFileContent() {},
        getRequests() { return origin.getRequests(); },     // protocol-level capture (C1 watermark / I3 pagination)
        clearRequests() { origin.clearRequests(); },
        close: async () => { await origin.close(); },
    };
}

/** Common OAuth2 token endpoint paths a connector might POST to. The mock serves a valid
 *  client-credentials/password token body on ANY of these so Authenticate() succeeds, and the
 *  `{{MOCK_ORIGIN}}` placeholder lets response-derived bases (Salesforce instance_url) reach us. */
function mockTokenRoutes() {
    const body = JSON.stringify({
        access_token: 'mock-access-token', token_type: 'Bearer', expires_in: 3600,
        refresh_token: 'mock-refresh-token', scope: 'all', instance_url: '{{MOCK_ORIGIN}}',
        id: '{{MOCK_ORIGIN}}/id/mock', issued_at: String(Date.now()),
    });
    const paths = [
        '/token', '/oauth2/token', '/ea/oauth2/token', '/oauth/token', '/api/oauth/token',
        '/services/oauth2/token', '/auth/token', '/oauth/v2/token', '/connect/token',
        '/api/token', '/api/v1/oauth/token', '/identity/token',
        '/api/v1/getToken', '/asiScheduler/token', '/getToken',  // Path LMS / iMIS legacy
    ];
    return paths.map((Path) => ({ Path, Method: 'POST', Status: 200, Body: body, Headers: { 'content-type': 'application/json' } }));
}

/** Benign discovery/schema/catalog endpoints a connector may hit during connection setup
 *  (DiscoverObjects). Several connectors THROW if a metadata/catalog fetch returns non-2xx, so the
 *  mock serves a 200 with an empty-collection body (all common collection keys present + empty) — the
 *  connector then falls back to its Declared metadata baseline rather than failing setup. These are
 *  the structural-discovery doors ONLY; object DATA routes stay strictly matched (a missing data route
 *  still 404s, so a 0-row sync can never masquerade as a pass). */
function mockDiscoveryRoutes() {
    // An object carrying every common empty collection key so any parse path finds [] (never a throw).
    const emptyCatalog = JSON.stringify({ items: [], data: [], value: [], results: [], records: [], Items: [], links: [] });
    // Keep these SPECIFIC to known catalog endpoints — broad paths like /schema or /describe would
    // PREFIX-shadow a connector's real data routes (e.g. Salesforce/Fonteva sobjects describe), so do
    // NOT add generic short paths here.
    const paths = [
        '/services/rest/record/v1/metadata-catalog',   // NetSuite metadata catalog
    ];
    return paths.map((Path) => ({ Path, Method: 'GET', Status: 200, Body: emptyCatalog, Headers: { 'content-type': 'application/json' } }));
}

/** Terminal catch-all SOQL routes: a Salesforce-family connector (Fonteva/Salesforce/Nimble) pages a
 *  SOQL `queryAll`/`query` endpoint and continues until the response says `done:true`. If a fixture's
 *  per-object query route does NOT match the connector's runtime SOQL (table-name/where-clause skew),
 *  the request would otherwise fall through to a 404 and the connector keeps paging empty-but-HasMore
 *  forever (the 5000-batch BusinessGroup hang). These no-Match routes are iterated LAST (appended after
 *  the fixture routes), so a fixture's matching per-object Match-route still wins; only a NON-matching
 *  SOQL query hits this and gets `{done:true, records:[]}` → the connector terminates immediately (a
 *  fast, honest 0-row result instead of a 17-minute spin). The fixture's real per-object routes are
 *  unaffected. */
function mockSoqlTerminators() {
    const done = JSON.stringify({ totalSize: 0, done: true, records: [] });
    const paths = [
        '/services/data/v61.0/queryAll', '/services/data/v61.0/query',
        '/services/data/v60.0/queryAll', '/services/data/v60.0/query',
        '/services/data/v59.0/queryAll', '/services/data/v59.0/query',
    ];
    return paths.map((Path) => ({ Path, Method: 'GET', Status: 200, Body: done, Headers: { 'content-type': 'application/json' } }));
}

/** Rewrite any Configuration value that contains the placeholder origin (http://127.0.0.1:9) to the
 *  real runtime mock origin. Covers BaseURL / TokenURL / TokenEndpoint / InstanceURL / etc. */
function rewriteConfigToOrigin(configuration, realOrigin) {
    const PLACEHOLDER = 'http://127.0.0.1:9';
    const out = {};
    for (const [k, v] of Object.entries(configuration)) {
        out[k] = (typeof v === 'string' && v.includes(PLACEHOLDER)) ? v.split(PLACEHOLDER).join(realOrigin) : v;
    }
    return out;
}

/** Read PEM cert/key file paths into buffers for the HTTPS-MITM proxy, if supplied. */
function readTlsPem(tls) {
    if (!tls || !tls.cert || !tls.key) return {};
    if (!existsSync(tls.cert) || !existsSync(tls.key)) return {};
    return { tlsCert: readFileSync(tls.cert), tlsKey: readFileSync(tls.key) };
}

/**
 * Derive the harness `cfg.deltaPasses` (the verification spec) from the loaded
 * manifest's DeltaPasses. Pass-through with normalization so the harness phase code
 * stays manifest-shape-agnostic. Returns [] when none.
 */
export function deltaPassesFromManifest(manifest) {
    return (manifest?.DeltaPasses ?? []).map((d) => ({
        Object: d.Object,
        Routes: d.Routes ?? [],
        FileContent: d.FileContent,
        ExpectedPresent: d.ExpectedPresent ?? [],
        ExpectedUpdates: d.ExpectedUpdates ?? [],
        ExpectedDeletes: d.ExpectedDeletes ?? [],
    }));
}

/**
 * Derive the object list to apply from the manifest. Prefers the explicit
 * `Objects[]` (their `Name`); the plan can override via cfg.objects.
 */
export function objectsFromManifest(manifest) {
    return (manifest?.Objects ?? []).map((o) => o.Name).filter(Boolean);
}

/**
 * Derive the optional matrix-cell specs the new mock-mode phases consume from the manifest:
 *   - DiscoverySupported     → cfg.discoverable: the connector has runtime discovery (cell 10/11 are
 *                              exercisable; absent ⇒ those cells honestly stub).
 *   - DiscoverNarrowedRoutes → cfg.discoverNarrowedRoutes: a discovery response that OMITS one object,
 *                              used to stage the absent-object deactivation overlay (cell 10).
 *   - WriteRoundTrip         → cfg.writeRoundTrip: the create→read-back→update→delete spec + the mock
 *                              CRUD routes (capability g). Absent ⇒ bidirectional honestly stubs.
 * All are OPTIONAL — a fixture that declares none yields undefined and the phases stub-with-reason.
 */
export function matrixSpecsFromManifest(manifest) {
    return {
        discoverable: manifest?.DiscoverySupported === true,
        discoverNarrowedRoutes: Array.isArray(manifest?.DiscoverNarrowedRoutes) && manifest.DiscoverNarrowedRoutes.length
            ? manifest.DiscoverNarrowedRoutes : null,
        writeRoundTrip: manifest?.WriteRoundTrip ?? null,
    };
}
