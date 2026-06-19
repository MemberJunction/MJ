/**
 * HYBRID mode for the connector-agnostic e2e harness (connector-e2e-harness.mjs).
 *
 * The two existing modes are binary:
 *   - 'mock' ignores the live token entirely (fixtures replay only),
 *   - 'live' hard-fails any object the token can't reach (403 / 401 / insufficient_scope).
 *
 * A real broker token frequently has LIMITED SCOPES: some discovered objects return
 * 403/401/insufficient_scope while others succeed. Under 'live' those scope gaps are
 * FALSE REDS; under 'mock' the live data is never exercised. Hybrid gives FULL
 * per-object coverage by routing each object to the source that can actually verify it:
 *
 *   1. SCOPE-PROBE every object with a cheap, READ-ONLY live call
 *      (IntegrationPreviewData → connector.FetchChanges, one small page). Classify:
 *        - IN-SCOPE      : the probe succeeded (2xx) → verify with REAL live data,
 *        - OUT-OF-SCOPE  : 403 / object-level 401 / insufficient_scope / forbidden
 *                          → fall back to mock/fixtures (a PASS-eligible path),
 *        - ERROR         : a NON-scope failure (5xx / timeout / malformed) → a REAL
 *                          failure, surfaced red, NEVER silently downgraded to mock.
 *   2. LIVE sub-pass : runConnectorE2E in 'live' mode over the IN-SCOPE object set.
 *   3. MOCK sub-pass : runConnectorE2E in 'mock' mode (fixtures) over the OUT-OF-SCOPE set.
 *   4. MERGE         : combine both sub-passes' DB verification into one verdict, plus a
 *      per-object report ({ object, source:'live'|'mock-fallback', verdict }) and a
 *      summary ({ live, mockFallback, failed, ... }).
 *
 * Out-of-scope → mock fallback is NEVER a red. Only a genuine connector error (ERROR
 * classification, or a sub-pass step that fails on its merits) is red. An out-of-scope
 * object that has NO fixture is a VISIBLE 'mock-fallback-no-fixture' warning (skip),
 * not a silent pass.
 *
 * This is a TEST-LAYER addition. It reaches core ONLY through the existing public
 * GraphQL op IntegrationPreviewData (read-only) and the existing runConnectorE2E
 * orchestration — it modifies no engine, schema-builder, or connector code. IO is
 * INJECTED so the partition + merge logic is unit-testable offline
 * (connector-e2e-hybrid.selftest.mjs) with no creds / MJAPI / DB / mock server.
 *
 * @see connector-e2e-harness.mjs — runConnectorE2E (reused twice here)
 * @see IntegrationPreviewData     — the read-only per-object probe op (MJServer resolver)
 */
import { runConnectorE2E } from './connector-e2e-harness.mjs';

/** GraphQL op for the cheap, read-only per-object scope probe (one small FetchChanges page). */
export const PROBE_GQL = {
    previewData: `query($ciid: String!, $objectName: String!, $limit: Float!) {
      IntegrationPreviewData(companyIntegrationID: $ciid, objectName: $objectName, limit: $limit) {
        Success Message Records { Data }
      }
    }`,
};

/** Structured step record (same shape the sibling harnesses use). */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope classification
//
// A probe returns { Success, Message }. The connector surfaces an HTTP failure as a
// thrown Error whose message is echoed into the resolver's Message (formatError =
// e.message). We classify SOLELY on that message — never assume.
//   - OUT-OF-SCOPE  : an authZ/scope signal — 403, an object-level 401, or an explicit
//                     insufficient_scope / forbidden / not authorized / access denied /
//                     permission marker. These are the limited-token gaps hybrid fills.
//   - ERROR         : any OTHER failure (5xx, timeout, malformed, network) — a REAL
//                     connector fault that MUST stay red, not be downgraded to mock.
//   - IN-SCOPE      : Success === true.
// ─────────────────────────────────────────────────────────────────────────────

/** Matches an HTTP status code N in the message forms connectors actually emit. */
function hasStatus(message, code) {
    const c = String(code);
    // `HTTP 403`, `(403)`, `403:`, `status 403`, ` 403 `, `403 —`, end-of-string `403`
    const re = new RegExp(`(?:^|[^0-9])${c}(?:[^0-9]|$)`);
    return re.test(message);
}

/** Explicit (status-independent) authorization/scope phrases connectors / vendors emit. */
const SCOPE_PHRASE_RE = /insufficient[_\s-]?scope|forbidden|not\s+authorized|unauthorized\s+scope|access\s+denied|permission\s+denied|missing\s+scope|scope[s]?\s+(?:required|missing)/i;

/** A 5xx / transport phrase that is a REAL failure even if a 4xx-ish token appears elsewhere. */
const HARD_FAIL_PHRASE_RE = /timed?\s*out|timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up|network|getaddrinfo|invalid json|unexpected token|malformed/i;

/**
 * Classify a probe result.
 * @param {boolean} success  the probe op's Success
 * @param {string}  message  the probe op's Message (connector error text on failure)
 * @returns {'in-scope'|'out-of-scope'|'error'}
 */
export function classifyProbeResult(success, message) {
    if (success === true) return 'in-scope';
    const msg = String(message ?? '');

    // A clear transport/5xx signal is ALWAYS a real error — even if a stray "401"-like
    // token appears in an error body, a timeout/5xx is never "the token lacks scope".
    if (HARD_FAIL_PHRASE_RE.test(msg)) return 'error';
    if (hasStatus(msg, 500) || hasStatus(msg, 502) || hasStatus(msg, 503) || hasStatus(msg, 504)) return 'error';

    // Scope/authZ signals → out-of-scope (mock-fallback eligible).
    if (hasStatus(msg, 403) || hasStatus(msg, 401)) return 'out-of-scope';
    if (SCOPE_PHRASE_RE.test(msg)) return 'out-of-scope';

    // Any other failure (e.g. 400/404/no message) is a REAL failure, not a scope gap —
    // we don't know the token can't reach it, so we don't silently fall back to mock.
    return 'error';
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope probe + partition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Probe ONE object's scope via the read-only IntegrationPreviewData op.
 * @param {object} args { gql, ciid, object, probeLimit }
 * @returns {Promise<{object:string, classification:string, success:boolean, message:string}>}
 */
export async function probeObjectScope({ gql, ciid, object, probeLimit = 1 }) {
    let success = false, message = '';
    try {
        const out = (await gql(PROBE_GQL.previewData, { ciid, objectName: object, limit: probeLimit }))?.IntegrationPreviewData;
        success = out?.Success === true;
        message = out?.Message ?? '';
    } catch (e) {
        // A thrown GQL/transport error here is itself a probe failure; classify by its text.
        success = false;
        message = String(e?.message ?? e);
    }
    return { object, classification: classifyProbeResult(success, message), success, message };
}

/**
 * Probe every object and partition into { inScope, outOfScope, errors }.
 * Probes run sequentially (cheap single-page reads; a limited token + many objects
 * shouldn't burst the vendor). Returns the raw probe records too for the report.
 *
 * @param {object} args { gql, ciid, objects[], probeLimit }
 * @returns {Promise<{inScope:string[], outOfScope:string[], errors:Array<{object,message}>, probes:Array}>}
 */
export async function partitionByScope({ gql, ciid, objects, probeLimit = 1 }) {
    const inScope = [], outOfScope = [], errors = [], probes = [];
    for (const object of objects) {
        const p = await probeObjectScope({ gql, ciid, object, probeLimit });
        probes.push(p);
        if (p.classification === 'in-scope') inScope.push(object);
        else if (p.classification === 'out-of-scope') outOfScope.push(object);
        else errors.push({ object, message: p.message });
    }
    return { inScope, outOfScope, errors, probes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-pass IO isolation
//
// runConnectorE2E closes db + mock in its finally. We run it TWICE over the same
// shared db, so each sub-pass gets a db whose close() is a no-op; hybrid closes the
// real db once at the end. The gql client is stateless and reused as-is.
// ─────────────────────────────────────────────────────────────────────────────

/** Wrap a db client so the inner sub-pass cannot close the SHARED connection. */
function nonClosingDb(db) {
    return new Proxy(db, {
        get(target, prop, receiver) {
            if (prop === 'close') return async () => { /* hybrid owns the real close */ };
            return Reflect.get(target, prop, receiver);
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-object report + merge
// ─────────────────────────────────────────────────────────────────────────────

/** True iff every step across a runConnectorE2E result's phases is ok (mirrors allStepsOk). */
function subPassOk(res) {
    if (!res || res.error) return false;
    for (const v of Object.values(res.steps ?? {})) {
        for (const s of (Array.isArray(v) ? v : [v])) if (s && s.ok === false) return false;
    }
    return true;
}

/**
 * Map a runConnectorE2E result's setup maps to per-object verdicts. We attribute a
 * sub-pass's verdict per object from its setup map list (each object that got an
 * entity map participated in that sub-pass's verification). A sub-pass with a global
 * failure (e.g. a forward/idempotent regression) marks ALL its objects failed.
 *
 * @param {object} res     a runConnectorE2E result
 * @param {'live'|'mock-fallback'} source
 * @returns {Array<{object:string, source:string, verdict:'pass'|'fail'}>}
 */
function objectVerdictsFromSubPass(res, source) {
    const passed = subPassOk(res);
    const setupMaps = res?.steps?.setup?.maps ?? [];
    return setupMaps.map((m) => ({ object: m.object, source, verdict: passed ? 'pass' : 'fail' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level hybrid orchestration (IO injected → unit-testable with mocks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the hybrid e2e: scope-probe + partition, then a live sub-pass over the in-scope
 * objects and a mock sub-pass over the out-of-scope objects, then merge into one verdict.
 *
 * @param {object} io
 *   @param {(q:string,v:object)=>Promise<object>} io.gql       MJAPI GraphQL client
 *   @param {object} io.db                                      gql-live-adapters DB client (closed here, once)
 *   @param {object} io.mockLive                                inert live mock (buildMock mode:'live')
 *   @param {object} io.mockFixtures                            fixtures mock (buildMock mode:'mock'); may be null
 * @param {object} cfg  connector-agnostic config (see plans.mjs connectorE2eCfgFromEnv).
 *   MUST include companyIntegrationID (hybrid is reference-mode: broker pre-seeded CIID,
 *   token used by-reference only) and objects[]. Optional: probeLimit, deltaPasses,
 *   fixtureObjects[] (the set the fixtures mock can serve, for the no-fixture warning).
 * @param {boolean} allowWrite  forwarded to the LIVE sub-pass only (mock has no live store).
 */
export async function runConnectorE2EHybrid({ gql, db, mockLive, mockFixtures }, cfg, allowWrite) {
    const result = {
        ok: false, mode: 'hybrid', connector: cfg.connector, platform: cfg.platform, runId: cfg.runId,
        partition: null, report: [], summary: null, steps: {},
    };
    const probeLimit = cfg.probeLimit ?? 1;
    const ciid = cfg.companyIntegrationID;

    try {
        if (!ciid) throw new Error('hybrid mode requires a pre-seeded companyIntegrationID (reference mode — broker supplies it; the token is used by-reference, never read)');
        const objects = cfg.objects ?? [];
        if (!objects.length) throw new Error('hybrid mode: no objects to probe (set E2E_OBJECTS or provide fixtures Objects[])');

        // 1) SCOPE-PROBE + PARTITION (read-only).
        const part = await partitionByScope({ gql, ciid, objects, probeLimit });
        result.partition = part;
        result.steps.probe = part.probes.map((p) => step(`probe.${p.object}`, p.classification !== 'error', {
            object: p.object, classification: p.classification, message: p.message,
        }));

        // The fixture-serveable set (for the no-fixture visible warning). Defaults to all
        // out-of-scope objects when the caller doesn't declare the fixtures' Objects[].
        const fixtureSet = new Set((cfg.fixtureObjects ?? part.outOfScope).map((o) => String(o).toLowerCase()));
        const fallbackWithFixture = part.outOfScope.filter((o) => fixtureSet.has(String(o).toLowerCase()));
        const fallbackNoFixture = part.outOfScope.filter((o) => !fixtureSet.has(String(o).toLowerCase()));

        // 2) LIVE sub-pass over the IN-SCOPE set (real data; reuses runConnectorE2E live mode).
        let liveRes = null;
        if (part.inScope.length) {
            liveRes = await runConnectorE2E(
                { gql, db: nonClosingDb(db), mock: mockLive },
                { ...cfg, mode: 'live', objects: part.inScope, deltaPasses: [] },
                allowWrite,
            );
            result.steps.live = step('live.subpass', subPassOk(liveRes), { objects: part.inScope, subResult: liveRes });
        } else {
            result.steps.live = step('live.subpass.none', true, { note: 'no in-scope objects — nothing to verify against live data' });
        }

        // 3) MOCK sub-pass over the OUT-OF-SCOPE-WITH-FIXTURE set (fixtures replay).
        let mockRes = null;
        if (fallbackWithFixture.length) {
            if (!mockFixtures || mockFixtures.mode !== 'mock') {
                throw new Error(`hybrid: ${fallbackWithFixture.length} object(s) need a fixtures fallback but no mock-mode fixtures server was provided`);
            }
            // Only replay delta passes for objects in this sub-pass's set.
            const deltaPasses = (cfg.deltaPasses ?? []).filter((d) =>
                fallbackWithFixture.some((o) => String(o).toLowerCase() === String(d.Object).toLowerCase()));
            mockRes = await runConnectorE2E(
                { gql, db: nonClosingDb(db), mock: mockFixtures },
                { ...cfg, mode: 'mock', objects: fallbackWithFixture, deltaPasses },
                false, // mock has no live store → never write
            );
            result.steps.mock = step('mock.subpass', subPassOk(mockRes), { objects: fallbackWithFixture, subResult: mockRes });
        } else {
            result.steps.mock = step('mock.subpass.none', true, { note: 'no out-of-scope objects with fixtures — nothing to fall back to mock' });
        }

        // Out-of-scope WITHOUT a fixture: a VISIBLE warning (skip), not a silent pass — ok:true
        // (it does not redden the run) but recorded so coverage gaps are obvious.
        result.steps.noFixtureWarnings = fallbackNoFixture.map((o) => step(`mock-fallback-no-fixture.${o}`, true, {
            object: o, warning: 'out-of-scope (token lacks access) AND no fixture to fall back to — object UNVERIFIED. Author a fixture for full coverage.',
        }));

        // 4) MERGE — per-object report + summary.
        const report = [
            ...objectVerdictsFromSubPass(liveRes, 'live'),
            ...objectVerdictsFromSubPass(mockRes, 'mock-fallback'),
            ...fallbackNoFixture.map((o) => ({ object: o, source: 'mock-fallback-no-fixture', verdict: 'skip' })),
            // A real probe ERROR is a failed object regardless of any sub-pass.
            ...part.errors.map((e) => ({ object: e.object, source: 'probe-error', verdict: 'fail' })),
        ];
        result.report = report;
        result.summary = {
            total: objects.length,
            live: report.filter((r) => r.source === 'live').length,
            mockFallback: report.filter((r) => r.source === 'mock-fallback').length,
            noFixture: fallbackNoFixture.length,
            probeErrors: part.errors.length,
            failed: report.filter((r) => r.verdict === 'fail').length,
        };
        result.steps.probeErrors = part.errors.map((e) => step(`probe-error.${e.object}`, false, { object: e.object, message: e.message }));

        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        // Close the SHARED db + both mocks ONCE here (sub-passes were given non-closing dbs).
        if (db?.close) { try { await db.close(); } catch { /* best-effort */ } }
        if (mockLive?.close) { try { await mockLive.close(); } catch { /* best-effort */ } }
        if (mockFixtures?.close) { try { await mockFixtures.close(); } catch { /* best-effort */ } }
        // Verdict: red on any thrown error, any failed step (incl. probe errors / failed sub-passes),
        // or any object whose merged verdict is 'fail'. Out-of-scope→mock and no-fixture skips are NOT red.
        const stepsOk = allHybridStepsOk(result.steps);
        const noFailedObjects = (result.report ?? []).every((r) => r.verdict !== 'fail');
        result.ok = !result.error && stepsOk && noFailedObjects;
    }
}

/** A hybrid run's steps are ok only if every recorded step (flattened) is ok. */
export function allHybridStepsOk(steps) {
    for (const v of Object.values(steps ?? {})) {
        for (const s of (Array.isArray(v) ? v : [v])) if (s && s.ok === false) return false;
    }
    return true;
}
