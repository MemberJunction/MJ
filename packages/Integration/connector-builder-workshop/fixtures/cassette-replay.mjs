/**
 * Deterministic replay engine over recorded (request→response) cassettes.
 *
 * Why this exists (the circular-fixture problem it breaks):
 *   Today the credential-free mock is synthesized from the connector's OWN metadata, so a green run only
 *   proves the connector is self-consistent with the metadata that produced it — it never proves the
 *   connector handles what the REAL vendor actually returns. A cassette is a recorded slice of real vendor
 *   traffic: a `{request, response}` pair captured from a live call (PII-scrubbed). Replaying the
 *   connector's own discovery / CRUD / pagination against cassettes proves request shape + response parsing
 *   against the vendor's ACTUAL bytes, with zero live credential, breaking the self-consistency loop.
 *
 * A cassette:
 *   {
 *     request:  { method, path, query?: { ... }, bodyContains?: string },
 *     response: { status, body }
 *   }
 *
 * Match rules (see `matchCassette`): method equal (case-insensitive); path equal; if the cassette declares
 * a `query`, every key/value in it must be present + equal in the incoming request's `query`; if it
 * declares `bodyContains`, the stringified request body must include that substring. Among all matches the
 * MOST SPECIFIC wins (a cassette constraining query and/or bodyContains beats a bare path+method one) — so
 * a narrowly-recorded interaction is preferred over a catch-all.
 *
 * Pure: a request + a cassette array in → the matched `response` (or `null`) out. No I/O. The CLI at the
 * bottom is the standalone gate; `buildReplayHandler` turns a cassette set into a `(request) => response`
 * function a test harness can use as a drop-in vendor.
 */

/**
 * Stringify a request body for `bodyContains` matching. A string body is used verbatim; anything else is
 * JSON-stringified so object bodies can be substring-probed deterministically. `undefined`/`null` → ''.
 *
 * @param {unknown} body
 * @returns {string}
 */
function stringifyBody(body) {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    try {
        return JSON.stringify(body);
    } catch {
        return String(body);
    }
}

/**
 * Does the incoming request's `query` contain every key/value the cassette's `query` declares (with equal,
 * stringified values)? An undeclared cassette query is a no-op (matches anything).
 *
 * @param {Record<string, unknown>|undefined} cassetteQuery
 * @param {Record<string, unknown>|undefined} requestQuery
 * @returns {boolean}
 */
function queryMatches(cassetteQuery, requestQuery) {
    if (!cassetteQuery || typeof cassetteQuery !== 'object') return true;
    const rq = requestQuery && typeof requestQuery === 'object' ? requestQuery : {};
    for (const key of Object.keys(cassetteQuery)) {
        if (!Object.prototype.hasOwnProperty.call(rq, key)) return false;
        // Compare stringified so 1 and '1' (HTTP query values are strings on the wire) match.
        if (String(rq[key]) !== String(cassetteQuery[key])) return false;
    }
    return true;
}

/**
 * How specific is a cassette's request matcher? Higher = more constraining. One point each for a declared
 * `query` (with ≥1 key) and a declared `bodyContains`. Used to prefer the narrowest matching cassette.
 *
 * @param {{ query?: Record<string, unknown>, bodyContains?: string }} cassetteRequest
 * @returns {number}
 */
function specificity(cassetteRequest) {
    let score = 0;
    if (cassetteRequest.query && typeof cassetteRequest.query === 'object' && Object.keys(cassetteRequest.query).length > 0) {
        score += 1;
    }
    if (typeof cassetteRequest.bodyContains === 'string' && cassetteRequest.bodyContains.length > 0) {
        score += 1;
    }
    return score;
}

/**
 * Find the cassette whose request matches the incoming request and return its `response`, or `null` if none
 * match. Method comparison is case-insensitive; path must be exactly equal; query + bodyContains are checked
 * per the rules above. When several cassettes match, the most specific one wins.
 *
 * @param {{ method?: string, path?: string, query?: Record<string, unknown>, body?: unknown }} request
 * @param {Array<{ request: { method?: string, path?: string, query?: Record<string, unknown>, bodyContains?: string }, response: { status: number, body: unknown } }>} cassettes
 * @returns {{ status: number, body: unknown } | null}
 */
export function matchCassette(request, cassettes) {
    if (!request || typeof request !== 'object') return null;
    if (!Array.isArray(cassettes)) return null;

    const reqMethod = String(request.method ?? '').toLowerCase();
    const reqPath = request.path;
    const reqBodyStr = stringifyBody(request.body);

    let best = null;
    let bestScore = -1;

    for (const cassette of cassettes) {
        if (!cassette || typeof cassette !== 'object' || !cassette.request || !cassette.response) continue;
        const cr = cassette.request;

        if (String(cr.method ?? '').toLowerCase() !== reqMethod) continue;
        if (cr.path !== reqPath) continue;
        if (!queryMatches(cr.query, request.query)) continue;
        if (typeof cr.bodyContains === 'string' && cr.bodyContains.length > 0) {
            if (!reqBodyStr.includes(cr.bodyContains)) continue;
        }

        const score = specificity(cr);
        if (score > bestScore) {
            best = cassette;
            bestScore = score;
        }
    }

    return best ? best.response : null;
}

/**
 * Build a replay handler over a fixed cassette set: a function `(request) => response` that returns the
 * matched cassette's response, or a synthetic 404 `{status:404, body:{error:'no cassette'}}` when nothing
 * matches. This is the drop-in "vendor" a credential-free harness drives the connector against.
 *
 * @param {Array<{ request: object, response: { status: number, body: unknown } }>} cassettes
 * @returns {(request: object) => { status: number, body: unknown }}
 */
export function buildReplayHandler(cassettes) {
    return (request) => {
        const matched = matchCassette(request, cassettes);
        return matched ?? { status: 404, body: { error: 'no cassette' } };
    };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isMain = (() => {
    try {
        return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const positional = args.filter((a) => !a.startsWith('--'));

    if (positional.length < 2) {
        process.stderr.write('usage: node cassette-replay.mjs <cassettes.json> <request.json> [--json]\n');
        process.exit(2);
    }

    const [cassettesPath, requestPath] = positional;

    let cassettes;
    let request;
    try {
        cassettes = JSON.parse(readFileSync(resolve(cassettesPath), 'utf8'));
    } catch (e) {
        process.stderr.write(`cannot read cassettes file: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }
    try {
        request = JSON.parse(readFileSync(resolve(requestPath), 'utf8'));
    } catch (e) {
        process.stderr.write(`cannot read request file: ${String(e && e.message ? e.message : e)}\n`);
        process.exit(2);
    }

    const response = matchCassette(request, cassettes);

    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify({
            request,
            matched: response !== null,
            response: response ?? { status: 404, body: { error: 'no cassette' } },
        }));
        process.exit(0);
    }

    if (response === null) {
        process.stdout.write('✗ cassette-replay: no cassette matched the request\n');
        process.stdout.write(`    ${JSON.stringify(request)}\n`);
        process.exit(1);
    }
    process.stdout.write('✓ cassette-replay: matched\n');
    process.stdout.write(`    ${JSON.stringify(response)}\n`);
    process.exit(0);
}
