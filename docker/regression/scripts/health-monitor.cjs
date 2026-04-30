/**
 * Background health monitor for the MJ regression test suite.
 *
 * Runs alongside the test suite, periodically probing:
 *   - MJAPI /healthcheck (direct)
 *   - MJAPI GraphQL (via nginx reverse proxy)
 *   - socat localhost proxy (TCP check)
 *   - MJExplorer static assets (nginx)
 *   - Process + system memory usage
 *
 * Writes a growing JSON file at $RUN_DIR/diagnostics.json that accumulates
 * probe results with timestamps. On any failure it also captures a snapshot
 * for quick triage.
 *
 * Usage (from test-runner-entrypoint.sh):
 *   node scripts/health-monitor.cjs &
 *   MONITOR_PID=$!
 *   ... run tests ...
 *   kill $MONITOR_PID 2>/dev/null
 *
 * Environment variables:
 *   RUN_DIR         — output directory for diagnostics.json (required)
 *   PROBE_INTERVAL  — seconds between probes (default: 10)
 *   MJAPI_URL       — direct MJAPI URL (default: http://mjapi:4000)
 *   PROXY_URL       — localhost proxy URL (default: http://localhost:4200)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { probeHttp, probeTcp } = require('./lib/probes.cjs');

const RUN_DIR = process.env.RUN_DIR;
if (!RUN_DIR) {
    console.error('[health-monitor] RUN_DIR not set — exiting');
    process.exit(1);
}

const PROBE_INTERVAL_S = parseInt(process.env.PROBE_INTERVAL || '10', 10);
const MJAPI_URL = process.env.MJAPI_URL || 'http://mjapi:4000';
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:4200';

const diagnosticsPath = path.join(RUN_DIR, 'diagnostics.json');

const diagnostics = {
    startedAt: new Date().toISOString(),
    probeIntervalSeconds: PROBE_INTERVAL_S,
    probes: [],
    failures: [],
    summary: {
        totalProbes: 0,
        mjapiFailures: 0,
        proxyFailures: 0,
        nginxFailures: 0,
        socatFailures: 0,
    },
};

function writeDiagnostics() {
    try {
        diagnostics.lastUpdated = new Date().toISOString();
        fs.writeFileSync(diagnosticsPath, JSON.stringify(diagnostics, null, 2));
    } catch (err) {
        console.error('[health-monitor] Failed to write diagnostics:', err.message);
    }
}

function getMemoryInfo() {
    const mem = process.memoryUsage();
    return {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        system: {
            freeMemMB: Math.round(os.freemem() / 1024 / 1024),
            totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
        },
    };
}

async function runProbe() {
    const ts = new Date().toISOString();
    const probe = { timestamp: ts, checks: {} };

    probe.checks.mjapiHealth = await probeHttp('mjapi-health', `${MJAPI_URL}/healthcheck`, { timeoutMs: 5000 });
    probe.checks.graphqlProxy = await probeHttp('graphql-proxy', `${PROXY_URL}/api/`, {
        method: 'POST',
        body: { query: '{ __schema { queryType { name } } }' },
        timeoutMs: 10000,
    });
    probe.checks.nginxStatic = await probeHttp('nginx-static', `${PROXY_URL}/`, { timeoutMs: 5000 });
    probe.checks.socatProxy = await probeTcp('socat-proxy', 'localhost', 4200, { timeoutMs: 3000 });
    probe.checks.memory = getMemoryInfo();

    const failed = [];
    if (!probe.checks.mjapiHealth.ok) failed.push('mjapi-health');
    if (!probe.checks.graphqlProxy.ok) failed.push('graphql-proxy');
    if (!probe.checks.nginxStatic.ok) failed.push('nginx-static');
    if (!probe.checks.socatProxy.ok) failed.push('socat-proxy');

    probe.healthy = failed.length === 0;
    probe.failedChecks = failed;

    diagnostics.summary.totalProbes++;
    if (!probe.checks.mjapiHealth.ok) diagnostics.summary.mjapiFailures++;
    if (!probe.checks.graphqlProxy.ok) diagnostics.summary.proxyFailures++;
    if (!probe.checks.nginxStatic.ok) diagnostics.summary.nginxFailures++;
    if (!probe.checks.socatProxy.ok) diagnostics.summary.socatFailures++;

    diagnostics.probes.push(probe);

    if (!probe.healthy) {
        diagnostics.failures.push({
            timestamp: ts,
            failedChecks: failed,
            details: probe.checks,
        });
        console.error(`[health-monitor] ${ts} UNHEALTHY: ${failed.join(', ')}`);
    }

    writeDiagnostics();
}

// ─── Main Loop ─────────────────────────────────────────────

console.log(`[health-monitor] Starting (interval=${PROBE_INTERVAL_S}s, output=${diagnosticsPath})`);
writeDiagnostics();

runProbe().then(() => {
    const interval = setInterval(() => {
        runProbe().catch(err => {
            console.error('[health-monitor] Probe error:', err.message);
        });
    }, PROBE_INTERVAL_S * 1000);

    const shutdown = () => {
        clearInterval(interval);
        diagnostics.stoppedAt = new Date().toISOString();
        writeDiagnostics();
        console.log('[health-monitor] Stopped');
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
});
