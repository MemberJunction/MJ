/**
 * DR-G1 — Failure-signature clustering (COARSE tier).
 *
 * Pure, dependency-free grouping of FAILING test results into signature
 * clusters, so a 44-failure run reads as "3 tests failed in /app/settings" —
 * one expandable cluster — instead of three disconnected rows. The recheck's
 * decisive insight was that failures cluster by whole feature area; this
 * mechanizes it. Consumed identically by generate-summary.cjs (→
 * summary.json.failureClusters), generate-md-report.cjs, and
 * generate-html-report.cjs so all three reports agree.
 *
 * Signature = `<category> @ <route-prefix>`, where:
 *   - category = the driver's failureClass, else the test status. This mirrors
 *     generate-summary.cjs's category expression EXACTLY (actualOutput.failureClass
 *     → failureClass → status), so a cluster's category never drifts from
 *     summary.json's `categories` tally. (Note: the canonical engine field is
 *     `failureCategory` (DR-D2), which summary.cjs does not yet read either —
 *     matching summary.cjs keeps the two consistent; widening both is a separate
 *     change.)
 *   - route-prefix = the first ROUTE_PREFIX_DEPTH path segments of the test's
 *     final URL, id-normalized (see normalizeRoutePrefix). MJ Explorer routes
 *     are /app/<app>/<resource>, so depth 2 collapses every record/resource
 *     within one app into a single feature-area cluster.
 *
 * A cluster with >= SUSPECTED_APP_DEFECT_MIN failures that share a real route
 * prefix is auto-flagged `suspectedAppDefect` — the "don't retry, file a bug"
 * signal. Clusters with no resolvable route are never flagged (there is no
 * feature to name).
 *
 * COARSE by design (per the plan's guidance). NOT built here: cross-run stable
 * signature IDs (needs the archive DB — a blocked carve-out) and perceptual
 * screenshot hashing.
 *
 * `clusterFailures` / `normalizeRoutePrefix` / `extractFinalUrl` / `categoryOf`
 * are PURE (no I/O). `enrichRoutesFromSteps` is the one impure companion: on
 * real runs the failing tests' oracle details usually lack `finalUrl` (the
 * MaxStepsReached shape carries only judge text), but the per-test
 * `screenshots/<test>/steps.json` records the last-visited URL — so this reads
 * that file to attach a `lastUrl` the pure extractor then uses.
 */

const fs = require('fs');
const path = require('path');

/** First N path segments used as the feature-area key. MJ = /app/<appname>. */
const ROUTE_PREFIX_DEPTH = 2;
/** Cluster size at/above which a shared-route cluster is a suspected app defect. */
const SUSPECTED_APP_DEFECT_MIN = 3;
/** Route label used when no URL can be resolved from a test result. */
const NO_ROUTE = '(unknown-route)';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for genuine failures — excludes Passed and (intentionally-not-run) Skipped. */
function isFailing(test) {
    const s = String(test && test.status);
    return s !== 'Passed' && s !== 'Skipped';
}

/**
 * The failure category for a test. Mirrors generate-summary.cjs so clusters and
 * summary.json's `categories` tally stay in lockstep.
 */
function categoryOf(test) {
    const status = String(test.status || 'Unknown');
    return (test.actualOutput && test.actualOutput.failureClass) || test.failureClass || status;
}

/**
 * Best-effort raw final-URL for a test result. Checks convenient top-level /
 * actualOutput fields first (future-proof + fixture-friendly), then the real
 * location in current results.json: the goal-completion oracle's
 * details.finalUrl (see ComputerUseTestDriver.buildActualOutput). Returns a
 * trimmed string or null.
 */
function extractFinalUrl(test) {
    if (!test || typeof test !== 'object') return null;
    const direct = test.finalUrl || test.lastUrl || test.url || test.route
        || (test.actualOutput && test.actualOutput.finalUrl);
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    for (const o of test.oracleResults || []) {
        const d = o && o.details;
        if (d && typeof d === 'object') {
            const u = d.finalUrl || d.lastUrl || d.url;
            if (typeof u === 'string' && u.trim()) return u.trim();
        }
    }
    return null;
}

/** Collapse an id-like path segment (UUID, MJ composite key, pure number) to :id. */
function normalizeSegment(seg) {
    if (UUID_RE.test(seg)) return ':id';
    if (/^\d+$/.test(seg)) return ':id';
    if (seg.includes('|') && UUID_RE.test(seg.split('|').pop() || '')) return ':id';
    return seg;
}

/**
 * Normalize a URL (absolute or root-relative) into a route prefix: origin,
 * query, and hash stripped; id-like segments collapsed to :id; first `depth`
 * segments joined. Returns null when the input isn't a usable URL/path.
 */
function normalizeRoutePrefix(rawUrl, depth = ROUTE_PREFIX_DEPTH) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
    let pathname;
    try {
        pathname = new URL(rawUrl).pathname;
    } catch {
        if (!rawUrl.startsWith('/')) return null; // not absolute and not a path
        pathname = rawUrl.split('?')[0].split('#')[0];
    }
    try { pathname = decodeURIComponent(pathname); } catch { /* keep encoded */ }
    const segs = pathname.split('/').filter(Boolean).map(normalizeSegment);
    if (segs.length === 0) return '/';
    return '/' + segs.slice(0, depth).join('/');
}

/**
 * Cluster failing test results by signature. Pure — depends only on the passed
 * array. Returns clusters sorted largest-first (ties broken by signature), each:
 *   { signature, category, route, count, testIds, testNames, suspectedAppDefect }
 *
 * @param {Array} testResults results.json testResults[] (any/empty is safe)
 * @param {{routePrefixDepth?:number, suspectedAppDefectMin?:number}} [opts]
 */
function clusterFailures(testResults, opts = {}) {
    const depth = opts.routePrefixDepth != null ? opts.routePrefixDepth : ROUTE_PREFIX_DEPTH;
    const minDefect = opts.suspectedAppDefectMin != null ? opts.suspectedAppDefectMin : SUSPECTED_APP_DEFECT_MIN;

    const bySignature = new Map();
    for (const t of testResults || []) {
        if (!isFailing(t)) continue;
        const category = categoryOf(t);
        const route = normalizeRoutePrefix(extractFinalUrl(t), depth) || NO_ROUTE;
        const signature = `${category} @ ${route}`;
        let cluster = bySignature.get(signature);
        if (!cluster) {
            cluster = { signature, category, route, count: 0, testIds: [], testNames: [] };
            bySignature.set(signature, cluster);
        }
        cluster.count++;
        if (t.testId) cluster.testIds.push(t.testId);
        cluster.testNames.push(t.testName || '(unnamed)');
    }

    const clusters = [...bySignature.values()].map((c) => ({
        ...c,
        suspectedAppDefect: c.count >= minDefect && c.route !== NO_ROUTE,
    }));
    clusters.sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
    return clusters;
}

/**
 * Best-effort last-visited URL for a test, read from its steps.json (the final
 * step records "Final page: <url>"). Returns a clean URL string or null. Never
 * throws; a missing dir/file is a plain null. IMPURE (reads the filesystem).
 */
function lastUrlFromSteps(runDir, testName) {
    if (!runDir || !testName) return null;
    const safeName = String(testName).replace(/[^a-zA-Z0-9_-]/g, '_');
    const stepsFile = path.join(runDir, 'screenshots', safeName, 'steps.json');
    let steps;
    try {
        if (!fs.existsSync(stepsFile)) return null;
        steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
    } catch { return null; }
    if (!Array.isArray(steps)) return null;
    for (let i = steps.length - 1; i >= 0; i--) {
        const u = steps[i] && steps[i].url;
        if (typeof u === 'string' && u.trim()) {
            const m = u.match(/https?:\/\/\S+/); // strip a "Final page: " label
            if (m) return m[0];
            if (u.trim().startsWith('/')) return u.trim();
        }
    }
    return null;
}

/**
 * Return a copy of `tests` with a best-effort `lastUrl` attached to each FAILING
 * test that lacks a URL already, sourced from steps.json — so route clustering
 * works on real runs whose oracle details omit finalUrl. Non-mutating,
 * never-throwing; a run with no screenshots/ dir is a no-op passthrough. IMPURE.
 */
function enrichRoutesFromSteps(tests, runDir) {
    return (tests || []).map((t) => {
        if (!isFailing(t) || t.finalUrl || t.lastUrl) return t;
        const lastUrl = lastUrlFromSteps(runDir, t.testName);
        return lastUrl ? { ...t, lastUrl } : t;
    });
}

module.exports = {
    clusterFailures,
    normalizeRoutePrefix,
    extractFinalUrl,
    categoryOf,
    isFailing,
    enrichRoutesFromSteps,
    lastUrlFromSteps,
    ROUTE_PREFIX_DEPTH,
    SUSPECTED_APP_DEFECT_MIN,
    NO_ROUTE,
};
