/**
 * Health SUPERVISOR for the MJ regression suite (DR-G4).
 *
 * The previous monitor rewrote a single growing diagnostics.json every 10s
 * (O(n²) bytes over a 7.8h run), measured its OWN process memory instead of
 * system/cgroup pressure, acted on nothing, and — worst — orphaned itself for
 * 10+ hours after an OOM (it kept probing a dead stack). This rewrite:
 *
 *   - APPENDS one NDJSON line per cycle to diagnostics.ndjson (bounded write),
 *     and keeps a small, rewritten diagnostics.json SUMMARY (counts + last
 *     sample only — no growing array).
 *   - Samples the RUNNER's own cgroup memory + Chromium process count/RSS —
 *     the leading suspect for the unattributed 19GB decline — so attribution is
 *     answerable from one run's data. (Sibling-container stats need the Docker
 *     socket / a host-side supervisor — plan Open Question 2 — and are deferred.)
 *   - Probes SQL Server reachability in addition to MJAPI/nginx/socat.
 *   - Writes health-state.json ({state, recommendedWorkers, reasons}) — consumed
 *     by `status` (DR-F3) today and admission control (DR-D3) next.
 *   - PARENT-WATCHES: exits the instant its parent (the entrypoint) dies, so it
 *     can never orphan again.
 *
 * Env: RUN_DIR (required), PROBE_INTERVAL (s, default 10), MJAPI_URL, PROXY_URL,
 *      DB_HOST (default sqlserver), DB_PORT (default 1433),
 *      PER_WORKER_MEM_MB (default 1500 — DR-A4 sizing basis).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { probeHttp, probeTcp } = require('./lib/probes.cjs');

const PER_WORKER_MEM_MB = parseInt(process.env.PER_WORKER_MEM_MB || '1500', 10);
const FIXED_OVERHEAD_MB = 2048; // node CLI + mj sync headroom before workers

/** Read this container's cgroup memory (v2 then v1), or null when unavailable. */
function readCgroupMemory() {
    const tryRead = (p) => { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } };
    // cgroup v2
    const curV2 = tryRead('/sys/fs/cgroup/memory.current');
    const maxV2 = tryRead('/sys/fs/cgroup/memory.max');
    if (curV2 != null && maxV2 != null) {
        const current = parseInt(curV2, 10);
        const max = maxV2 === 'max' ? null : parseInt(maxV2, 10);
        return normalizeMem(current, max);
    }
    // cgroup v1
    const curV1 = tryRead('/sys/fs/cgroup/memory/memory.usage_in_bytes');
    const maxV1 = tryRead('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    if (curV1 != null && maxV1 != null) {
        const current = parseInt(curV1, 10);
        const maxRaw = parseInt(maxV1, 10);
        // v1 "unlimited" is a huge sentinel (~ >= total RAM); treat as no cap.
        const max = maxRaw >= os.totalmem() ? null : maxRaw;
        return normalizeMem(current, max);
    }
    return null;
}

function normalizeMem(currentBytes, maxBytesOrNull) {
    const currentMB = Math.round(currentBytes / 1024 / 1024);
    if (maxBytesOrNull == null) {
        return { currentMB, maxMB: null, pct: null };
    }
    const maxMB = Math.round(maxBytesOrNull / 1024 / 1024);
    const pct = maxMB > 0 ? Math.round((currentMB / maxMB) * 100) : null;
    return { currentMB, maxMB, pct };
}

/** Count Chromium processes and sum their RSS via /proc (this container only). */
function readChromiumStats() {
    const pageSize = 4096;
    let procCount = 0;
    let rssBytes = 0;
    let pids;
    try {
        pids = fs.readdirSync('/proc').filter(n => /^\d+$/.test(n));
    } catch {
        return { procCount: 0, rssMB: 0, available: false };
    }
    for (const pid of pids) {
        let comm;
        try {
            comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
        } catch {
            continue; // process gone / not readable
        }
        if (!/chrome|chromium|headless_shell/i.test(comm)) continue;
        procCount++;
        try {
            const statm = fs.readFileSync(`/proc/${pid}/statm`, 'utf8').trim().split(/\s+/);
            rssBytes += (parseInt(statm[1], 10) || 0) * pageSize; // field 2 = resident pages
        } catch {
            /* process exited between readdir and read */
        }
    }
    return { procCount, rssMB: Math.round(rssBytes / 1024 / 1024), available: true };
}

/**
 * Derive an overall health state + a worker recommendation from the sampled
 * signals. Ordered: a hard probe failure is `critical` (env is down) regardless
 * of memory; otherwise memory pressure drives degraded/critical. Pure + exported
 * so the thresholds are unit-testable.
 */
function computeHealthState({ probesHealthy, cgroup, systemFreeMB, systemTotalMB }) {
    const reasons = [];
    let state = 'green';

    if (!probesHealthy) {
        reasons.push('one or more connectivity probes failing');
        state = 'critical';
    }

    // Memory pct: prefer the cgroup (per-container truth) over system (the VM).
    const pct = cgroup && cgroup.pct != null
        ? cgroup.pct
        : (systemTotalMB > 0 ? Math.round((1 - systemFreeMB / systemTotalMB) * 100) : null);
    if (pct != null) {
        if (pct >= 90) { state = 'critical'; reasons.push(`memory ${pct}% (>=90 critical)`); }
        else if (pct >= 75 && state !== 'critical') { state = 'degraded'; reasons.push(`memory ${pct}% (>=75 degraded)`); }
    }

    // Recommended workers from available headroom.
    const availableMB = cgroup && cgroup.maxMB != null
        ? cgroup.maxMB - cgroup.currentMB
        : systemFreeMB;
    let recommendedWorkers = Math.floor((availableMB - FIXED_OVERHEAD_MB) / PER_WORKER_MEM_MB);
    if (!Number.isFinite(recommendedWorkers) || recommendedWorkers < 1) recommendedWorkers = 1;

    if (reasons.length === 0) reasons.push('nominal');
    return { state, recommendedWorkers, reasons };
}

// ─── Runtime (only when invoked directly) ────────────────────────────────────

function runSupervisor() {
    const RUN_DIR = process.env.RUN_DIR;
    if (!RUN_DIR) {
        console.error('[health-supervisor] RUN_DIR not set — exiting');
        process.exit(1);
    }
    const intervalS = parseInt(process.env.PROBE_INTERVAL || '10', 10);
    const MJAPI_URL = process.env.MJAPI_URL || 'http://mjapi:4000';
    const PROXY_URL = process.env.PROXY_URL || 'http://localhost:4200';
    const DB_HOST = process.env.DB_HOST || 'sqlserver';
    const DB_PORT = parseInt(process.env.DB_PORT || '1433', 10);

    const ndjsonPath = path.join(RUN_DIR, 'diagnostics.ndjson');
    const summaryPath = path.join(RUN_DIR, 'diagnostics.json');
    const healthStatePath = path.join(RUN_DIR, 'health-state.json');

    const summary = {
        startedAt: new Date().toISOString(),
        probeIntervalSeconds: intervalS,
        totalProbes: 0,
        failures: { mjapi: 0, proxy: 0, nginx: 0, socat: 0, sqlserver: 0 },
        last: null,
    };
    const initialPpid = process.ppid;

    const writeSummary = () => {
        summary.lastUpdated = new Date().toISOString();
        try { fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2)); } catch { /* best-effort */ }
    };
    const appendNdjson = (row) => {
        try { fs.appendFileSync(ndjsonPath, JSON.stringify(row) + '\n'); } catch { /* best-effort */ }
    };
    const writeHealthState = (hs) => {
        try {
            const tmp = healthStatePath + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify({ ...hs, updatedAt: new Date().toISOString() }, null, 2));
            fs.renameSync(tmp, healthStatePath);
        } catch { /* best-effort */ }
    };

    async function cycle() {
        const ts = new Date().toISOString();
        const checks = {
            mjapiHealth: await probeHttp('mjapi', `${MJAPI_URL}/healthcheck`, { timeoutMs: 5000 }),
            graphqlProxy: await probeHttp('graphql', `${PROXY_URL}/api/`, { method: 'POST', body: { query: '{ __schema { queryType { name } } }' }, timeoutMs: 10000 }),
            nginxStatic: await probeHttp('nginx', `${PROXY_URL}/`, { timeoutMs: 5000 }),
            socatProxy: await probeTcp('socat', 'localhost', 4200, { timeoutMs: 3000 }),
            sqlserver: await probeTcp('sqlserver', DB_HOST, DB_PORT, { timeoutMs: 3000 }),
        };
        const cgroup = readCgroupMemory();
        const chromium = readChromiumStats();
        const failed = Object.entries(checks).filter(([, v]) => v && v.ok === false).map(([k]) => k);
        const probesHealthy = failed.length === 0;

        const health = computeHealthState({
            probesHealthy,
            cgroup,
            systemFreeMB: Math.round(os.freemem() / 1024 / 1024),
            systemTotalMB: Math.round(os.totalmem() / 1024 / 1024),
        });

        summary.totalProbes++;
        if (!checks.mjapiHealth.ok) summary.failures.mjapi++;
        if (!checks.graphqlProxy.ok) summary.failures.proxy++;
        if (!checks.nginxStatic.ok) summary.failures.nginx++;
        if (!checks.socatProxy.ok) summary.failures.socat++;
        if (!checks.sqlserver.ok) summary.failures.sqlserver++;
        summary.last = { timestamp: ts, healthy: probesHealthy, failedChecks: failed, state: health.state };

        appendNdjson({
            ts,
            healthy: probesHealthy,
            failedChecks: failed,
            state: health.state,
            recommendedWorkers: health.recommendedWorkers,
            cgroupMB: cgroup,
            chromium,
            systemFreeMB: Math.round(os.freemem() / 1024 / 1024),
        });
        writeSummary();
        writeHealthState(health);

        if (!probesHealthy || health.state !== 'green') {
            console.error(`[health-supervisor] ${ts} ${health.state.toUpperCase()}: ${health.reasons.join('; ')}${failed.length ? ` [failing: ${failed.join(', ')}]` : ''}`);
        }
    }

    console.log(`[health-supervisor] Starting (interval=${intervalS}s → ${ndjsonPath})`);
    writeSummary();

    let stopped = false;
    const shutdown = (why) => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        clearInterval(parentWatch);
        summary.stoppedAt = new Date().toISOString();
        summary.stopReason = why;
        writeSummary();
        console.log(`[health-supervisor] Stopped (${why})`);
        process.exit(0);
    };

    const timer = setInterval(() => { cycle().catch(e => console.error('[health-supervisor] cycle error:', e.message)); }, intervalS * 1000);
    // Parent-watch: if the entrypoint dies, we get reparented to PID 1 (init).
    // Exit immediately so we can never orphan (the §3.2 10-hour-probe failure).
    const parentWatch = setInterval(() => {
        if (process.ppid !== initialPpid || process.ppid === 1) shutdown('parent-exited');
    }, 2000);

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    cycle().catch(e => console.error('[health-supervisor] initial cycle error:', e.message));
}

module.exports = { readCgroupMemory, normalizeMem, readChromiumStats, computeHealthState };

if (require.main === module) {
    runSupervisor();
}
