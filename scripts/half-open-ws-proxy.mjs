#!/usr/bin/env node
/**
 * Half-open WebSocket proxy — manual reproduction harness for MJ #4222.
 *
 * WHAT IT REPRODUCES
 * A conference-wifi style outage where a TCP connection stops carrying bytes in both
 * directions but neither end sends FIN or RST. The client's socket stays "open" forever,
 * so graphql-ws never fires `closed`, never retries, and every recovery path downstream of
 * that event stays asleep. The agent run completes and persists normally; only the
 * notification is lost.
 *
 * WHY NOT SOMETHING SIMPLER
 *   - DevTools' offline toggle sends a clean close frame. The client sees `closed`, retries,
 *     and recovers — the bug is masked.
 *   - Killing the tab, stopping MJAPI, or `block return` pf rules all send RST. Same masking.
 *   - `sudo pfctl` with `block drop` IS faithful, but needs root, is macOS-only, and takes
 *     down HTTP along with the socket — which hides whether reconcile-over-HTTP recovered.
 * This proxy needs no privileges, works anywhere Node runs, and black-holes ONLY the
 * WebSocket, leaving HTTP healthy so recovery is observable in isolation.
 *
 * USAGE
 *   node scripts/half-open-ws-proxy.mjs                    # listen 14001 -> MJAPI 14000
 *   node scripts/half-open-ws-proxy.mjs --listen 9001 --target 4000 --control 9002
 *
 * Point ONLY the WebSocket at the proxy — leave HTTP pointed straight at MJAPI
 * (packages/MJExplorer/src/environments/environment.development.ts):
 *   'GRAPHQL_URI':    'http://localhost:14000/'   // unchanged
 *   'GRAPHQL_WS_URI': 'ws://localhost:14001/'     // through this proxy
 *
 * CONTROL
 *   curl -XPOST localhost:14002/blackhole   # start dropping, keep sockets open
 *   curl -XPOST localhost:14002/restore     # resume forwarding
 *   curl       localhost:14002/status       # { blackholed, pairs, droppedBytes }
 *
 * REPRO
 *   1. Start MJAPI, this proxy, and Explorer (WS pointed here).
 *   2. Send a message to an agent whose run takes ~20s.
 *   3. Mid-run: curl -XPOST localhost:14002/blackhole
 *   4. Watch: status updates stop, the elapsed timer keeps climbing, no error appears.
 *   5. curl -XPOST localhost:14002/restore
 *   6. BEFORE the fix: still stuck; only a page refresh reveals the completed response.
 *      AFTER Tier 0+1: the socket terminates within ~20s of the blackhole, reconnects,
 *      reconciles, and the message completes with no refresh.
 */
import net from 'node:net';
import http from 'node:http';

function parseArgs(argv) {
    const opts = { listen: 14001, target: 14000, host: '127.0.0.1', control: 14002 };
    for (let i = 2; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        const value = argv[i + 1];
        if (value === undefined) {
            throw new Error(`Missing value for --${key}`);
        }
        if (key === 'host') {
            opts.host = value;
        } else if (key in opts) {
            opts[key] = Number(value);
            if (!Number.isInteger(opts[key]) || opts[key] <= 0) {
                throw new Error(`--${key} must be a positive integer, got "${value}"`);
            }
        } else {
            throw new Error(`Unknown option --${key}`);
        }
    }
    return opts;
}

const opts = parseArgs(process.argv);

/** While true, every byte in both directions is DROPPED and both sockets are held open. */
let blackholed = false;
/** Bytes discarded since the last restore — proves the blackhole is actually biting. */
let droppedBytes = 0;
/** Live client/upstream socket pairs. */
const pairs = new Set();

/**
 * Bytes are DROPPED, not buffered for later replay. Replaying on restore would model a
 * brief stall, not an outage — and would hand the client a completion the real failure
 * loses. By the time a real link returns, MJAPI's own 12s keepalive has already terminated
 * the subscription and published the completion into a topic with no subscriber.
 */
function forward(from, to, label) {
    from.on('data', (chunk) => {
        if (blackholed) {
            droppedBytes += chunk.length;
            return;
        }
        // Respect backpressure so a slow peer cannot balloon memory.
        if (!to.write(chunk)) {
            from.pause();
            to.once('drain', () => from.resume());
        }
    });
    from.on('error', (err) => {
        if (!blackholed) {
            console.error(`[proxy] ${label} error: ${err.message}`);
        }
    });
}

const server = net.createServer((client) => {
    const upstream = net.connect(opts.target, opts.host);
    const pair = { client, upstream };
    pairs.add(pair);

    const teardown = (reason) => {
        // The heart of the simulation: while black-holed we suppress teardown entirely.
        // A real black hole delivers no FIN and no RST, so the peer must NOT learn the
        // link died — that ignorance is the whole bug. Propagating a close here would
        // hand the client exactly the `closed` event it is missing in production.
        if (blackholed) {
            return;
        }
        if (pairs.delete(pair)) {
            console.log(`[proxy] connection closed (${reason}); ${pairs.size} live`);
        }
        client.destroy();
        upstream.destroy();
    };

    forward(client, upstream, 'client->upstream');
    forward(upstream, client, 'upstream->client');

    client.on('close', () => teardown('client'));
    upstream.on('close', () => teardown('upstream'));
    upstream.on('connect', () => {
        console.log(`[proxy] connection opened; ${pairs.size} live`);
    });
    upstream.on('error', (err) => {
        if (!blackholed) {
            console.error(`[proxy] upstream connect failed: ${err.message}`);
        }
    });
});

server.listen(opts.listen, () => {
    console.log(`[proxy] ws://localhost:${opts.listen} -> ${opts.host}:${opts.target}`);
    console.log(`[proxy] control: curl -XPOST localhost:${opts.control}/blackhole | /restore | GET /status`);
});

const control = http.createServer((req, res) => {
    const reply = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    };

    if (req.url === '/blackhole' && req.method === 'POST') {
        blackholed = true;
        droppedBytes = 0;
        console.log(`[proxy] BLACKHOLE ON — dropping both directions across ${pairs.size} connection(s), sockets held open`);
        return reply(200, { blackholed, pairs: pairs.size });
    }

    if (req.url === '/restore' && req.method === 'POST') {
        blackholed = false;
        console.log(`[proxy] BLACKHOLE OFF — forwarding resumed after dropping ${droppedBytes} byte(s)`);
        // Sweep pairs whose far end died during the outage. Their teardown was suppressed
        // while black-holed, so retire them now — this is the reset a real link delivers
        // when connectivity returns and the stale connection is finally found to be dead.
        for (const pair of [...pairs]) {
            if (pair.upstream.destroyed || pair.client.destroyed) {
                pairs.delete(pair);
                pair.client.destroy();
                pair.upstream.destroy();
            }
        }
        return reply(200, { blackholed, pairs: pairs.size, droppedBytes });
    }

    if (req.url === '/status') {
        return reply(200, { blackholed, pairs: pairs.size, droppedBytes });
    }

    return reply(404, { error: 'POST /blackhole, POST /restore, or GET /status' });
});

control.listen(opts.control);

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        console.log('\n[proxy] shutting down');
        server.close();
        control.close();
        for (const pair of pairs) {
            pair.client.destroy();
            pair.upstream.destroy();
        }
        process.exit(0);
    });
}
