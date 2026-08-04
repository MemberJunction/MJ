/**
 * Pre-flight diagnostics — run before launching the test suite to surface
 * any broken plumbing immediately rather than 30 minutes into a hanging run.
 *
 * Probes:
 *   1. MJAPI healthcheck (direct, no proxy)
 *   2. GraphQL via the nginx proxy (the path the browser actually uses)
 *   3. socat TCP proxy (localhost:4200 → mjexplorer:4200)
 *   4. nginx static file (MJExplorer index.html)
 *   5. Auth0 OIDC discovery endpoint (if configured)
 *   6. WebSocket upgrade through nginx
 *   7. Memory snapshot
 *
 * Writes /tmp/preflight.json (caller moves it into $RUN_DIR after creating
 * the run directory). Exits 0 even on failures so the caller can decide
 * whether to abort — failures are reported in stdout + the JSON artifact.
 */

const fs = require('fs');
const os = require('os');
const { probeHttp, probeTcp } = require('./lib/probes.cjs');

(async () => {
    const results = {};
    const gqlBody = { query: '{ __schema { queryType { name } } }' };

    results.mjapiHealth = await probeHttp('MJAPI healthcheck', 'http://mjapi:4000/healthcheck', { log: true });
    results.graphqlProxy = await probeHttp('GraphQL via nginx', 'http://localhost:4200/api/', {
        method: 'POST',
        body: gqlBody,
        log: true,
    });
    results.socatProxy = await probeTcp('socat proxy', 'localhost', 4200, { log: true });
    results.nginxStatic = await probeHttp('MJExplorer static', 'http://localhost:4200/', { log: true });

    const auth0Domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_CLIENT_ID;
    if (auth0Domain) {
        results.auth0 = await probeHttp(
            'Auth0 domain',
            `https://${auth0Domain}/.well-known/openid-configuration`,
            { log: true }
        );
    }

    results.wsUpgrade = await probeHttp('WebSocket upgrade', 'http://localhost:4200/api/', {
        headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Version': '13',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        },
        timeoutMs: 5000,
        log: true,
    });

    results.memory = {
        freeMemMB: Math.round(os.freemem() / 1024 / 1024),
        totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
        usagePercent: Math.round((1 - os.freemem() / os.totalmem()) * 100),
    };
    console.log(`  ℹ Memory: ${results.memory.freeMemMB}MB free / ${results.memory.totalMemMB}MB total (${results.memory.usagePercent}% used)`);

    const checks = [results.mjapiHealth, results.graphqlProxy, results.socatProxy, results.nginxStatic];
    const allOk = checks.every(c => c && c.ok);
    results.healthy = allOk;
    results.timestamp = new Date().toISOString();
    console.log('');
    console.log(`  Pre-flight: ${allOk ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED — tests may hang or fail'}`);

    fs.writeFileSync('/tmp/preflight.json', JSON.stringify(results, null, 2));
})();
