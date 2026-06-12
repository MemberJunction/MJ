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

    const origin = await startOrigin(manifest);
    return {
        mode: 'mock', kind: 'origin', manifest, warnings,
        baseURL: origin.baseURL,
        configPatch: { [manifest.ConfigUrlKey]: origin.baseURL },
        setRoutes(routes) { origin.setRoutes(routes); },
        setFileContent() {},
        close: async () => { await origin.close(); },
    };
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
