/**
 * Self-test for the HYBRID e2e ORCHESTRATION (no creds, no MJAPI, no DB, no mock server).
 *
 * Hybrid takes its IO injected (gql, db, mockLive, mockFixtures), so we drive
 * runConnectorE2EHybrid / partitionByScope / classifyProbeResult against a simulated
 * "vendor + engine + DB" world whose IntegrationPreviewData probe returns a configurable
 * per-object scope verdict (2xx in-scope / 403 / object-401 / insufficient_scope / 500 /
 * timeout). The simulated engine ApplyAll honors the per-sub-pass object set so we can
 * assert EXACTLY which objects each sub-pass verified.
 *
 * It asserts the machinery is correct:
 *   - classifyProbeResult: 2xx→in-scope; 403/401/insufficient_scope/forbidden→out-of-scope;
 *     5xx/timeout/malformed/other→error (a real failure, never a silent mock fallback).
 *   - partitionByScope routes objects to the right bucket.
 *   - in-scope objects go to the LIVE sub-pass, out-of-scope-with-fixture to the MOCK sub-pass.
 *   - out-of-scope WITHOUT a fixture → a VISIBLE mock-fallback-no-fixture warning (skip), not red.
 *   - a non-403 probe error keeps the run RED.
 *   - a failing fallback sub-pass (e.g. a delta regression) keeps the run RED.
 *   - the merged per-object report + summary reflect the source/verdict of every object.
 *
 * Run: node packages/Integration/connectors/test/connector-e2e-hybrid.selftest.mjs  (exit 0 = pass)
 */
import assert from 'node:assert/strict';
import {
    runConnectorE2EHybrid, partitionByScope, classifyProbeResult, probeObjectScope,
} from './connector-e2e-hybrid.mjs';

let passed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }

// ── A simulated "vendor + engine + DB" world (hybrid-aware) ──────────────────
// `scope` maps object → 'ok' | { status } | { phrase } | { throw } controlling how the
// IntegrationPreviewData probe answers. The engine's ApplyAll honors the SUB-PASS object
// set (vars.input.SourceObjects), so each sub-pass only "creates" + verifies its own set.
function makeWorld(overrides = {}) {
    const objects = overrides.objects ?? ['Contacts', 'Campaigns', 'Invoices', 'Secrets'];
    const entityNameFor = (o) => `Acme ${o}`;
    const initial = overrides.initial ?? {
        Contacts: [
            { id: 'c1', name: 'Ada', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'c2', name: 'Alan', updated_at: '2026-01-02T00:00:00Z' },
        ],
        Campaigns: [{ id: 'cmp1', name: 'Welcome', updated_at: '2026-01-01T00:00:00Z' }],
        Invoices: [{ id: 'inv1', total: '100', updated_at: '2026-01-01T00:00:00Z' }],
        Secrets: [{ id: 's1', value: 'x', updated_at: '2026-01-01T00:00:00Z' }],
    };
    return {
        ciid: 'ci-hybrid-1', credId: 'cred-hybrid-1', objects, entityNameFor,
        current: JSON.parse(JSON.stringify(initial)),
        dest: new Map(),
        synced: new Set(),
        // scope verdict per object for the probe (default all in-scope)
        scope: overrides.scope ?? Object.fromEntries(objects.map((o) => [o, 'ok'])),
        lastRunProcessed: 0, runSeq: 0, lastRunId: null,
        // record which objects each sub-pass applied (keyed by inferred mode: 'live' for in-scope,
        // 'mock' for out-of-scope — the two sets are disjoint, so the ApplyAll object set identifies it)
        appliedByMode: { live: [], mock: [] },
        // the active entity maps PER sub-pass, keyed by the ApplyAll object set's first object
        mapsBySet: new Map(),
        calls: { startSync: [], deleteMaps: [], setRoutes: 0, preview: [] },
        dbClosed: false, mockLiveClosed: false, mockFixturesClosed: false,
        disableAbsenceDelete: overrides.disableAbsenceDelete ?? false,
        idempotentBreaks: overrides.idempotentBreaks ?? false,
    };
}

/** Apply the world's CURRENT routes into the dest store for a GIVEN object set (upsert + absence-delete). */
function applySync(world, objectsForRun) {
    let processed = 0;
    for (const obj of objectsForRun) {
        const entity = world.entityNameFor(obj);
        if (!world.dest.has(entity)) world.dest.set(entity, new Map());
        const store = world.dest.get(entity);
        const rows = world.current[obj] ?? [];
        const seenIds = new Set();
        for (const r of rows) {
            const id = String(r.id);
            seenIds.add(id);
            const hash = JSON.stringify({ ...r, id: undefined });
            const prior = store.get(id);
            if (!prior || prior.__hash !== hash) processed++;
            store.set(id, { ID: `pk-${entity}-${id}`, ...r, __ext: id, __hash: hash });
        }
        if (world.synced.has(obj) && !world.disableAbsenceDelete) {
            for (const id of [...store.keys()]) if (!seenIds.has(id)) { store.delete(id); processed++; }
        }
        world.synced.add(obj);
    }
    if (world.idempotentBreaks) processed += 1;
    world.lastRunProcessed = processed;
}

/** Build the probe response for one object from its configured scope verdict. */
function probeResponse(world, objectName) {
    const v = world.scope[objectName];
    world.calls.preview.push(objectName);
    if (v === 'ok' || v == null) return { IntegrationPreviewData: { Success: true, Message: 'Fetched 1 preview records', Records: [{ Data: '{}' }] } };
    if (typeof v === 'object' && v.throw) throw new Error(String(v.throw));
    const msg = typeof v === 'object' && v.message
        ? v.message
        : typeof v === 'object' && v.status
            ? `[Acme] FetchChanges on ${objectName} failed (HTTP ${v.status}): ${v.body ?? 'denied'}`
            : `[Acme] FetchChanges on ${objectName}: ${String(v)}`;
    return { IntegrationPreviewData: { Success: false, Message: msg } };
}

function makeMockGql(world) {
    const objectsFromApplyInput = (vars) => (vars?.input?.SourceObjects ?? []).map((s) => s.SourceObjectName);
    // The in-scope set is exactly the objects whose probe verdict is 'ok' — the live sub-pass.
    const inScopeSet = new Set(world.objects.filter((o) => (world.scope[o] ?? 'ok') === 'ok'));
    // Mode of a sub-pass = 'live' if ALL its objects are in-scope, else 'mock' (the sets are disjoint).
    const modeFor = (objs) => objs.every((o) => inScopeSet.has(o)) ? 'live' : 'mock';
    const tail = () => ({ Success: true, Message: 'ok', LatestSeq: 1, IsInFlight: false, Events: [{ Ts: 't', Seq: 1, EventType: 'records.batch.complete', Counts: { Processed: world.lastRunProcessed, Succeeded: world.lastRunProcessed, Failed: 0, Skipped: 0, TotalKnown: world.lastRunProcessed } }] });
    const getRun = (vars) => ({ RunID: vars.runID, IsInFlight: false, Success: true, ExitReason: 'completed', DurationMs: 5, WarningCount: 0, Warnings: [], Counts: { Processed: world.lastRunProcessed, Succeeded: world.lastRunProcessed, Failed: 0, Skipped: 0, TotalKnown: world.lastRunProcessed }, LatestEventType: 'run.complete', LatestMessage: 'done' });
    return async (query, vars) => {
        if (query.includes('IntegrationPreviewData')) return probeResponse(world, vars.objectName);
        if (query.includes('IntegrationApplyAll')) {
            const objs = objectsFromApplyInput(vars);
            const mode = modeFor(objs);
            world.activeMode = mode;            // the current (sequential) sub-pass
            world.activeObjects = objs.slice();
            world.appliedByMode[mode] = objs.slice();
            return { IntegrationApplyAll: { Success: true, Message: 'ok', Warnings: [], Steps: [], EntityMapsCreated: objs.map((o, i) => ({ EntityMapID: `em-${mode}-${i}`, EntityName: world.entityNameFor(o), SourceObjectName: o, FieldMapCount: 3 })) } };
        }
        if (query.includes('IntegrationListEntityMaps')) {
            const objs = world.activeObjects ?? [];
            return { IntegrationListEntityMaps: { Success: true, Message: 'ok', EntityMaps: objs.map((o, i) => ({ ID: `em-${world.activeMode}-${i}`, Entity: world.entityNameFor(o), EntityID: `eid-${o}`, ExternalObjectName: o, SyncDirection: 'Pull', Status: 'Active', Priority: i })) } };
        }
        if (query.includes('IntegrationStartSync')) { world.calls.startSync.push(vars); applySync(world, world.activeObjects ?? []); world.lastRunId = `run-${++world.runSeq}`; return { IntegrationStartSync: { Success: true, Message: 'started', RunID: world.lastRunId } }; }
        if (query.includes('IntegrationListRuns')) return { IntegrationListRuns: { Success: true, Message: 'ok', Runs: [{ RunID: world.lastRunId, IsInFlight: false, RunKind: 'sync', StartedAt: 'now', Counts: null }] } };
        if (query.includes('IntegrationTailRunEvents')) return { IntegrationTailRunEvents: tail(vars) };
        if (query.includes('IntegrationGetRun')) return { IntegrationGetRun: { Success: true, Message: 'ok', Errors: [], Run: getRun(vars) } };
        if (query.includes('IntegrationDeleteEntityMaps')) { world.calls.deleteMaps.push(vars); return { IntegrationDeleteEntityMaps: { Success: true, Message: 'deleted' } }; }
        throw new Error('unmocked GQL op: ' + query.slice(0, 80));
    };
}

// Mock DB whose rows()/entityRowCount()/recordMapStats() read from world.dest.
function makeMockDb(world) {
    return {
        async entityRowCount(entityName) { return world.dest.get(entityName)?.size ?? 0; },
        async recordMapStats(_ci, entityName) { const n = world.dest.get(entityName)?.size ?? 0; return { total: n, distinctExternal: n }; },
        async deleteCredential() { /* reference mode never deletes the credential */ },
        async close() { world.dbClosed = true; },
        async rows(sql) {
            const metaMatch = sql.match(/Entity.*?Name\s*=\s*'([^']+)'/s);
            if (/FROM\s+[`"\[]?__mj[`"\]]?.*Entity/i.test(sql) && metaMatch) {
                const name = metaMatch[1];
                const obj = world.objects.find((o) => world.entityNameFor(o) === name);
                if (!obj) return [];
                return [{ s: 'acme', t: obj.toLowerCase(), id: `eid-${obj}` }];
            }
            const eidMatch = sql.match(/EntityID\s*=\s*'eid-([^']+)'/);
            const extMatch = sql.match(/ExternalSystemRecordID\s*=\s*'([^']+)'/);
            if (eidMatch && extMatch) {
                const entityName = world.entityNameFor(eidMatch[1]);
                const row = world.dest.get(entityName)?.get(extMatch[1]);
                return row ? [row] : [];
            }
            return [];
        },
    };
}

// Mock fixtures "mock" object: swapping routes mutates world.current (mode:'mock' shape).
function makeFixturesMock(world) {
    return {
        mode: 'mock', kind: 'origin', manifest: { Objects: world.objects.map((o) => ({ Name: o })) }, warnings: [],
        setRoutes(routes) {
            world.calls.setRoutes++;
            for (const r of routes) {
                const obj = world.objects.find((o) => r.Path === `/${o.toLowerCase()}`);
                if (obj && Array.isArray(r.Body)) world.current[obj] = r.Body;
            }
        },
        setFileContent() {},
        async close() { world.mockFixturesClosed = true; },
    };
}
function makeLiveMock(world) {
    return { mode: 'live', setRoutes() {}, setFileContent() {}, async close() { world.mockLiveClosed = true; } };
}

function baseCfg(world, overrides = {}) {
    return {
        runId: 'hyb1', platform: 'sqlserver', connector: 'acme', integrationName: 'Acme',
        companyID: 'co-1', integrationID: 'int-1', credentialTypeID: 'ct-1',
        companyIntegrationID: world.ciid, // reference mode (broker-seeded)
        objects: world.objects, mjSchema: '__mj', maxPolls: 20, probeLimit: 1,
        ...overrides,
    };
}

// Build the injected IO. The mock GQL infers each sub-pass's mode from its ApplyAll object set
// (in-scope objects ⇒ live sub-pass, out-of-scope ⇒ mock sub-pass), so no external state-flipping
// is needed — it mirrors how the real two sub-passes run sequentially over disjoint object sets.
function makeHybridIo(world) {
    return { gql: makeMockGql(world), db: makeMockDb(world), mockLive: makeLiveMock(world), mockFixtures: makeFixturesMock(world) };
}

const INVOICES_DELTA = {
    Object: 'Invoices',
    Routes: [{ Path: '/invoices', Method: 'GET', Status: 200, Body: [
        { id: 'inv1', total: '150', updated_at: '2026-02-01T00:00:00Z' },
        { id: 'inv2', total: '200', updated_at: '2026-02-02T00:00:00Z' },
    ] }],
    ExpectedPresent: ['inv1', 'inv2'],
    ExpectedUpdates: [{ ExternalID: 'inv1', Field: 'total', Value: '150' }],
    ExpectedDeletes: [],
};

// ── Tests ────────────────────────────────────────────────────────────────────
function testClassify() {
    console.log('classifyProbeResult — scope vs real-error classification');
    assert.equal(classifyProbeResult(true, 'Fetched 5'), 'in-scope', '2xx success → in-scope');
    assert.equal(classifyProbeResult(false, 'HTTP 403: forbidden'), 'out-of-scope', '403 → out-of-scope');
    assert.equal(classifyProbeResult(false, 'FetchChanges failed (HTTP 401): token'), 'out-of-scope', 'object-level 401 → out-of-scope');
    assert.equal(classifyProbeResult(false, 'OAuth error: insufficient_scope'), 'out-of-scope', 'insufficient_scope → out-of-scope');
    assert.equal(classifyProbeResult(false, 'Access denied for object'), 'out-of-scope', 'access denied phrase → out-of-scope');
    assert.equal(classifyProbeResult(false, 'HTTP 500: internal error'), 'error', '5xx → real error (NOT a scope fallback)');
    assert.equal(classifyProbeResult(false, 'request timed out after 30s'), 'error', 'timeout → real error');
    assert.equal(classifyProbeResult(false, 'ECONNREFUSED 127.0.0.1'), 'error', 'connection refused → real error');
    assert.equal(classifyProbeResult(false, 'HTTP 404: not found'), 'error', '404 → real error (not a known scope gap)');
    assert.equal(classifyProbeResult(false, 'unexpected token < in JSON'), 'error', 'malformed body → real error');
    // a 5xx must not be downgraded even if a 401-ish token appears in the body text
    assert.equal(classifyProbeResult(false, 'HTTP 502 bad gateway (upstream returned 401 page)'), 'error', '5xx wins over a stray 401 in the body');
    ok('classifyProbeResult separates scope gaps (403/401/insufficient_scope) from real errors (5xx/timeout)');
}

async function testPartition() {
    console.log('partitionByScope — routes objects by probe verdict');
    const world = makeWorld({ scope: { Contacts: 'ok', Campaigns: 'ok', Invoices: { status: 403 }, Secrets: { status: 401, body: 'insufficient_scope' } } });
    const part = await partitionByScope({ gql: makeMockGql(world), ciid: world.ciid, objects: world.objects, probeLimit: 1 });
    assert.deepEqual(part.inScope, ['Contacts', 'Campaigns'], 'in-scope = 2xx objects');
    assert.deepEqual(part.outOfScope, ['Invoices', 'Secrets'], 'out-of-scope = 403/401 objects');
    assert.equal(part.errors.length, 0, 'no real errors');
    assert.equal(world.calls.preview.length, 4, 'probed every object once (cheap)');
    ok('partitionByScope buckets in-scope / out-of-scope correctly');
}

async function testProbeThrowIsError() {
    console.log('probeObjectScope — a thrown transport error classifies as error (red)');
    const world = makeWorld({ scope: { Contacts: { throw: 'socket hang up' } } });
    const p = await probeObjectScope({ gql: makeMockGql(world), ciid: world.ciid, object: 'Contacts', probeLimit: 1 });
    assert.equal(p.classification, 'error', 'a thrown transport error is a real error, not a scope gap');
    ok('a thrown probe (transport) error is classified red, never silently mocked');
}

async function testHybridFullPass() {
    console.log('runConnectorE2EHybrid — in-scope→live, out-of-scope→mock-fallback, merged green');
    // Contacts/Campaigns in-scope (live), Invoices/Secrets out-of-scope (mock). All have fixtures.
    const world = makeWorld({ scope: { Contacts: 'ok', Campaigns: 'ok', Invoices: { status: 403 }, Secrets: { status: 403 } } });
    const io = makeHybridIo(world);
    const res = await runConnectorE2EHybrid(io, baseCfg(world, { deltaPasses: [INVOICES_DELTA] }), false);
    assert.equal(res.ok, true, `overall ok (got error=${res.error ?? ''}; failed=${JSON.stringify(res.summary)})`);
    // partition recorded
    assert.deepEqual(res.partition.inScope, ['Contacts', 'Campaigns'], 'partition in-scope');
    assert.deepEqual(res.partition.outOfScope, ['Invoices', 'Secrets'], 'partition out-of-scope');
    // sub-pass object routing: live got ONLY in-scope, mock got ONLY out-of-scope
    assert.deepEqual(world.appliedByMode.live, ['Contacts', 'Campaigns'], 'live sub-pass applied only in-scope objects');
    assert.deepEqual(world.appliedByMode.mock, ['Invoices', 'Secrets'], 'mock sub-pass applied only out-of-scope objects');
    // per-object report sources
    const bySource = (s) => res.report.filter((r) => r.source === s).map((r) => r.object).sort();
    assert.deepEqual(bySource('live'), ['Campaigns', 'Contacts'], 'live-sourced objects');
    assert.deepEqual(bySource('mock-fallback'), ['Invoices', 'Secrets'], 'mock-fallback-sourced objects');
    assert.ok(res.report.every((r) => r.verdict === 'pass'), 'all objects pass');
    // summary
    assert.equal(res.summary.live, 2, 'summary live=2');
    assert.equal(res.summary.mockFallback, 2, 'summary mockFallback=2');
    assert.equal(res.summary.failed, 0, 'summary failed=0');
    // delta verified on the mock fallback (Invoices)
    const mockSub = res.steps.mock.subResult;
    const upd = mockSub.steps.delta.find((s) => s.name.endsWith('.update'));
    assert.ok(upd?.ok && upd.actual === '150', 'mock-fallback delta update verified against dest store');
    // cleanup
    assert.equal(world.dbClosed, true, 'shared db closed once');
    assert.equal(world.mockLiveClosed, true, 'live mock closed');
    assert.equal(world.mockFixturesClosed, true, 'fixtures mock closed');
    ok('hybrid: in-scope verified live + out-of-scope verified via mock fallback, merged green');
}

async function testNoFixtureWarning() {
    console.log('runConnectorE2EHybrid — out-of-scope object with NO fixture → visible warning (skip, not red)');
    // Secrets is out-of-scope AND not in the fixtures set → no-fixture warning.
    const world = makeWorld({ scope: { Contacts: 'ok', Campaigns: 'ok', Invoices: { status: 403 }, Secrets: { status: 403 } } });
    const io = makeHybridIo(world);
    // fixtureObjects EXCLUDES Secrets → it has no fixture to fall back to.
    const res = await runConnectorE2EHybrid(io, baseCfg(world, { fixtureObjects: ['Contacts', 'Campaigns', 'Invoices'] }), false);
    assert.equal(res.ok, true, 'a no-fixture out-of-scope object does NOT redden the run');
    const warn = res.steps.noFixtureWarnings.find((s) => s.name === 'mock-fallback-no-fixture.Secrets');
    assert.ok(warn && warn.ok && /no fixture/i.test(warn.warning), 'Secrets surfaces a visible no-fixture warning');
    const sec = res.report.find((r) => r.object === 'Secrets');
    assert.equal(sec.source, 'mock-fallback-no-fixture', 'Secrets report source is no-fixture');
    assert.equal(sec.verdict, 'skip', 'Secrets verdict is skip (visible, not a silent pass)');
    assert.deepEqual(world.appliedByMode.mock, ['Invoices'], 'mock sub-pass applied only the fixtured out-of-scope object');
    assert.equal(res.summary.noFixture, 1, 'summary records 1 no-fixture');
    ok('out-of-scope without a fixture is a visible skip-warning, never a silent pass or a red');
}

async function testNonScopeProbeErrorRed() {
    console.log('runConnectorE2EHybrid — a non-403 probe error keeps the run RED');
    const world = makeWorld({ scope: { Contacts: 'ok', Campaigns: 'ok', Invoices: { status: 500 }, Secrets: { status: 403 } } });
    const io = makeHybridIo(world);
    const res = await runConnectorE2EHybrid(io, baseCfg(world), false);
    assert.equal(res.ok, false, 'a 5xx probe error reddens the whole run');
    assert.ok(res.partition.errors.some((e) => e.object === 'Invoices'), 'Invoices recorded as a probe error');
    const inv = res.report.find((r) => r.object === 'Invoices');
    assert.equal(inv.verdict, 'fail', 'Invoices verdict is fail (real error, not a mock fallback)');
    assert.equal(world.appliedByMode.mock.includes('Invoices'), false, 'a 5xx object is NEVER routed to mock fallback');
    assert.ok(res.summary.probeErrors >= 1, 'summary records the probe error');
    ok('a non-scope (5xx) probe error stays red and is never downgraded to mock');
}

async function testFailingFallbackSubpassRed() {
    console.log('runConnectorE2EHybrid — a failing mock-fallback sub-pass (delta regression) keeps the run RED');
    // Invoices out-of-scope → mock fallback; disableAbsenceDelete makes a delete-delta fail.
    const world = makeWorld({
        scope: { Contacts: 'ok', Campaigns: 'ok', Invoices: { status: 403 }, Secrets: 'ok' },
        disableAbsenceDelete: true,
    });
    const io = makeHybridIo(world);
    const deltaWithDelete = { ...INVOICES_DELTA, Routes: [{ Path: '/invoices', Method: 'GET', Status: 200, Body: [{ id: 'inv1', total: '150', updated_at: '2026-02-01T00:00:00Z' }] }], ExpectedDeletes: ['inv2'], ExpectedPresent: ['inv1'], ExpectedUpdates: [] };
    // pre-seed inv2 so the delete delta has something to (fail to) remove
    world.current.Invoices = [{ id: 'inv1', total: '100', updated_at: '2026-01-01T00:00:00Z' }, { id: 'inv2', total: '50', updated_at: '2026-01-02T00:00:00Z' }];
    const res = await runConnectorE2EHybrid(io, baseCfg(world, { deltaPasses: [deltaWithDelete] }), false);
    assert.equal(res.ok, false, 'a failing fallback sub-pass reddens the run');
    const inv = res.report.find((r) => r.object === 'Invoices');
    assert.equal(inv.source, 'mock-fallback', 'Invoices was a mock fallback');
    assert.equal(inv.verdict, 'fail', 'Invoices verdict is fail because its sub-pass failed');
    ok('a genuine connector error inside the mock-fallback sub-pass keeps the run red');
}

async function testAllInScopeNoMock() {
    console.log('runConnectorE2EHybrid — all objects in-scope → live only, no mock sub-pass');
    const world = makeWorld({ scope: Object.fromEntries(['Contacts', 'Campaigns', 'Invoices', 'Secrets'].map((o) => [o, 'ok'])) });
    const io = makeHybridIo(world);
    const res = await runConnectorE2EHybrid(io, baseCfg(world), false);
    assert.equal(res.ok, true, 'all-in-scope run is green');
    assert.equal(res.summary.mockFallback, 0, 'no mock fallbacks');
    assert.equal(world.calls.setRoutes, 0, 'fixtures mock never swapped routes (no fallback objects)');
    assert.equal(res.steps.mock.name, 'mock.subpass.none', 'mock sub-pass skipped when nothing is out-of-scope');
    ok('all-in-scope hybrid runs live only (no mock fallback)');
}

// ── Run ──────────────────────────────────────────────────────────────────────
const tests = [
    testClassify, testPartition, testProbeThrowIsError, testHybridFullPass,
    testNoFixtureWarning, testNonScopeProbeErrorRed, testFailingFallbackSubpassRed, testAllInScopeNoMock,
];
let failed = 0;
for (const t of tests) {
    try { await t(); }
    catch (e) { failed++; console.error(`  ✗ FAILED: ${e.message}\n${e.stack?.split('\n').slice(1, 4).join('\n')}`); }
}
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} assertions, ${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
