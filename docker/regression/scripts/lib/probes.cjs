/**
 * Shared connectivity probes used by preflight-checks.cjs (one-shot startup
 * diagnostics) and health-monitor.cjs (background loop during the suite).
 *
 * Both scripts care about the same network surface — MJAPI healthcheck,
 * GraphQL via nginx, the socat localhost proxy, MJExplorer static — so they
 * share the same probe primitives.
 */

const net = require('net');

/**
 * HTTP/HTTPS probe with a timeout.
 *
 * Returns { ok, status, ms, bodySnippet?, error? }. By default `ok` is true
 * for 2xx/3xx and any 4xx (the server answered). Set `treat4xxAsOk=false` to
 * require strict 2xx/3xx — the preflight checker uses that for stricter
 * pre-launch validation, while health-monitor accepts 4xx because the
 * GraphQL endpoint returns 401 to its unauthenticated probe (which still
 * proves the server is up).
 */
async function probeHttp(label, url, opts = {}) {
    const {
        method = 'GET',
        body,
        headers,
        timeoutMs = 10000,
        treat4xxAsOk = true,
        log = false,
    } = opts;

    const start = performance.now();
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const fetchOpts = { method, signal: controller.signal };
        if (body) {
            fetchOpts.headers = { 'Content-Type': 'application/json', ...(headers || {}) };
            fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
        } else if (headers) {
            fetchOpts.headers = headers;
        }

        const resp = await fetch(url, fetchOpts);
        clearTimeout(timer);
        const text = await resp.text().catch(() => '');
        const ms = Math.round(performance.now() - start);

        const ok = treat4xxAsOk ? resp.status < 500 : resp.ok;
        if (log) {
            console.log(`  ${ok ? '✓' : '✗'} [${label}] ${resp.status} (${ms}ms)`);
        }
        return { label, ok, status: resp.status, ms, bodySnippet: text.substring(0, 300) };
    } catch (e) {
        const ms = Math.round(performance.now() - start);
        const error = e.name === 'AbortError' ? 'timeout' : e.message;
        if (log) {
            console.log(`  ✗ [${label}] FAILED: ${error} (${ms}ms)`);
        }
        return { label, ok: false, status: 0, ms, error };
    }
}

/**
 * TCP connectivity check (used for the socat localhost:4200 proxy probe).
 */
function probeTcp(label, host, port, opts = {}) {
    const { timeoutMs = 5000, log = false } = opts;
    return new Promise(resolve => {
        const start = performance.now();
        const socket = new net.Socket();
        const timer = setTimeout(() => {
            socket.destroy();
            const ms = Math.round(performance.now() - start);
            if (log) console.log(`  ✗ [${label}] TCP timeout (${ms}ms)`);
            resolve({ label, ok: false, ms, error: 'timeout' });
        }, timeoutMs);

        socket.connect(port, host, () => {
            clearTimeout(timer);
            socket.destroy();
            const ms = Math.round(performance.now() - start);
            if (log) console.log(`  ✓ [${label}] TCP connected (${ms}ms)`);
            resolve({ label, ok: true, ms });
        });

        socket.on('error', err => {
            clearTimeout(timer);
            socket.destroy();
            const ms = Math.round(performance.now() - start);
            if (log) console.log(`  ✗ [${label}] TCP error: ${err.message} (${ms}ms)`);
            resolve({ label, ok: false, ms, error: err.message });
        });
    });
}

module.exports = { probeHttp, probeTcp };
