/**
 * Self-test for the CONNECTOR-AGNOSTIC e2e harness ORCHESTRATION (no creds, no MJAPI,
 * no DB, no mock server). The harness takes its IO injected, so we drive
 * runConnectorE2E / phaseDelta / phaseIdempotent / makeVerify against a mock GraphQL
 * world + a mock DB whose destination store is advanced by each simulated sync from
 * the mock's CURRENT routes — exactly how the real engine would apply the fixtures.
 *
 * It asserts the machinery is correct: setup → forward → delta (create/update/delete
 * VERIFIED against the dest store) → idempotent (0 work / 0 row delta) → teardown;
 * that delta is mock-only (live mode skips it); and that a delta/idempotent regression
 * turns the run red.
 *
 * Run: node packages/Integration/connectors/test/connector-e2e-harness.selftest.mjs  (exit 0 = pass)
 */
import assert from 'node:assert/strict';
import { runConnectorE2E, phaseDelta, phaseIdempotent, makeVerify } from './connector-e2e-harness.mjs';

let passed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }

// ── A simulated "vendor + engine + DB" world ─────────────────────────────────
// The mock holds the CURRENT route bodies (what the vendor would return). A
// StartSync "applies" those bodies into the dest store: upsert by external id,
// and delete any external id absent from the current body for an object that has
// previously synced (full-snapshot delete reconciliation — what ExpectedDeletes
// asserts the real engine does).
function makeWorld(overrides = {}) {
    const objects = overrides.objects ?? ['Contacts', 'Campaigns'];
    const entityNameFor = (o) => `PropFuel ${o}`;
    // initial vendor state (what the mock serves before any delta swap)
    const initial = overrides.initial ?? {
        Contacts: [
            { id: 'c1', name: 'Ada Lovelace', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'c2', name: 'Alan Turing', updated_at: '2026-01-02T00:00:00Z' },
            { id: 'c3', name: 'Grace Hopper', updated_at: '2026-01-03T00:00:00Z' },
        ],
        Campaigns: [
            { id: 'cmp1', name: 'Welcome', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'cmp2', name: 'Renewal', updated_at: '2026-01-02T00:00:00Z' },
        ],
    };
    return {
        ciid: 'ci-e2e-1', credId: 'cred-e2e-1', objects, entityNameFor,
        // mock "current" routes, by object name → array of vendor rows
        current: JSON.parse(JSON.stringify(initial)),
        // dest store: entityName → Map(externalId → row{ID, ...fields})
        dest: new Map(),
        synced: new Set(),       // objects that have synced at least once (for delete reconciliation)
        lastRunProcessed: 0,
        runSeq: 0, lastRunId: null,
        calls: { startSync: [], deleteMaps: [], deleteConn: [], setRoutes: 0 },
        credDeleted: null, dbClosed: false, mockClosed: false,
        idempotentBreaks: overrides.idempotentBreaks ?? false,
        disableAbsenceDelete: overrides.disableAbsenceDelete ?? false, // simulate a tombstone-only engine
    };
}

/** Apply the world's CURRENT routes into the dest store (upsert + absence-delete). */
function applySync(world) {
    let processed = 0;
    for (const obj of world.objects) {
        const entity = world.entityNameFor(obj);
        if (!world.dest.has(entity)) world.dest.set(entity, new Map());
        const store = world.dest.get(entity);
        const rows = world.current[obj] ?? [];
        const seenIds = new Set();
        for (const r of rows) {
            const id = String(r.id);
            seenIds.add(id);
            const prior = store.get(id);
            const changed = !prior || JSON.stringify({ ...r, id: undefined }) !== prior.__hash;
            if (changed) processed++;
            store.set(id, { ID: `pk-${entity}-${id}`, ...r, __ext: id, __hash: JSON.stringify({ ...r, id: undefined }) });
        }
        // Full-snapshot delete reconciliation: drop dest rows no longer in the feed.
        if (world.synced.has(obj) && !world.disableAbsenceDelete) {
            for (const id of [...store.keys()]) if (!seenIds.has(id)) { store.delete(id); processed++; }
        }
        world.synced.add(obj);
    }
    // idempotent-break simulation: pretend a phantom record keeps getting processed.
    if (world.idempotentBreaks) processed += 1;
    world.lastRunProcessed = processed;
}

function makeMockGql(world) {
    const tail = () => ({ Success: true, Message: 'ok', LatestSeq: 1, IsInFlight: false, Events: [{ Ts: 't', Seq: 1, EventType: 'records.batch.complete', Counts: { Processed: world.lastRunProcessed, Succeeded: world.lastRunProcessed, Failed: 0, Skipped: 0, TotalKnown: world.lastRunProcessed } }] });
    const getRun = (vars) => ({ RunID: vars.runID, IsInFlight: false, Success: true, ExitReason: 'completed', DurationMs: 5, WarningCount: 0, Warnings: [], Counts: { Processed: world.lastRunProcessed, Succeeded: world.lastRunProcessed, Failed: 0, Skipped: 0, TotalKnown: world.lastRunProcessed }, LatestEventType: 'run.complete', LatestMessage: 'done' });
    return async (query, vars) => {
        if (query.includes('IntegrationCreateConnection')) return { IntegrationCreateConnection: { Success: true, Message: 'ok', CompanyIntegrationID: world.ciid, CredentialID: world.credId, ConnectionTestSuccess: true, ConnectionTestMessage: 'ok', SchemaRefresh: { RunID: 'sr', ObjectsCreated: world.objects.length, FieldsCreated: 9, UnresolvedObjects: [] } } };
        if (query.includes('IntegrationApplyAll')) return { IntegrationApplyAll: { Success: true, Message: 'ok', Warnings: [], Steps: [], EntityMapsCreated: world.objects.map((o, i) => ({ EntityMapID: `em-${i}`, EntityName: world.entityNameFor(o), SourceObjectName: o, FieldMapCount: 3 })) } };
        if (query.includes('IntegrationListEntityMaps')) return { IntegrationListEntityMaps: { Success: true, Message: 'ok', EntityMaps: world.objects.map((o, i) => ({ ID: `em-${i}`, Entity: world.entityNameFor(o), EntityID: `eid-${i}`, ExternalObjectName: o, SyncDirection: 'Pull', Status: 'Active', Priority: i })) } };
        if (query.includes('IntegrationStartSync')) { world.calls.startSync.push(vars); applySync(world); world.lastRunId = `run-${++world.runSeq}`; return { IntegrationStartSync: { Success: true, Message: 'started', RunID: world.lastRunId } }; }
        if (query.includes('IntegrationListRuns')) return { IntegrationListRuns: { Success: true, Message: 'ok', Runs: [{ RunID: world.lastRunId, IsInFlight: false, RunKind: 'sync', StartedAt: 'now', Counts: null }] } };
        if (query.includes('IntegrationTailRunEvents')) return { IntegrationTailRunEvents: tail(vars) };
        if (query.includes('IntegrationGetRun')) return { IntegrationGetRun: { Success: true, Message: 'ok', Errors: [], Run: getRun(vars) } };
        if (query.includes('IntegrationDeleteEntityMaps')) { world.calls.deleteMaps.push(vars); return { IntegrationDeleteEntityMaps: { Success: true, Message: 'deleted' } }; }
        if (query.includes('IntegrationDeleteConnection')) { world.calls.deleteConn.push(vars); return { IntegrationDeleteConnection: { Success: true, Message: 'deleted', EntityMapsDeleted: world.objects.length, FieldMapsDeleted: 9, SchedulesDeleted: 0 } }; }
        throw new Error('unmocked GQL op: ' + query.slice(0, 80));
    };
}

// Mock DB whose rows()/entityRowCount()/recordMapStats() read from world.dest.
function makeMockDb(world) {
    const entityIdToName = new Map(world.objects.map((o, i) => [`eid-${i}`, world.entityNameFor(o)]));
    return {
        async entityRowCount(entityName) { return world.dest.get(entityName)?.size ?? 0; },
        async recordMapStats(_ci, entityName) { const n = world.dest.get(entityName)?.size ?? 0; return { total: n, distinctExternal: n }; },
        async deleteCredential(id) { world.credDeleted = id; },
        async close() { world.dbClosed = true; },
        // makeVerify uses db.rows() for entity meta + dest-row-by-external-id joins.
        async rows(sql) {
            // entity meta lookup: "... FROM __mj.Entity WHERE Name = 'PropFuel Contacts' ..."
            const metaMatch = sql.match(/Entity.*?Name\s*=\s*'([^']+)'/s);
            if (/FROM\s+[`"\[]?__mj[`"\]]?.*Entity/i.test(sql) && metaMatch) {
                const name = metaMatch[1];
                const idx = world.objects.findIndex((o) => world.entityNameFor(o) === name);
                if (idx < 0) return [];
                return [{ s: 'propfuel', t: world.objects[idx].toLowerCase(), id: `eid-${idx}` }];
            }
            // row-by-external-id: "... WHERE m.EntityID='eid-0' ... ExternalSystemRecordID='c2'"
            const eidMatch = sql.match(/EntityID\s*=\s*'([^']+)'/);
            const extMatch = sql.match(/ExternalSystemRecordID\s*=\s*'([^']+)'/);
            if (eidMatch && extMatch) {
                const entityName = entityIdToName.get(eidMatch[1]);
                const row = world.dest.get(entityName)?.get(extMatch[1]);
                return row ? [row] : [];
            }
            return [];
        },
    };
}

function baseCfg(world, overrides = {}) {
    return {
        runId: 'e2e1', platform: 'sqlserver', mode: 'mock', connector: 'propfuel', integrationName: 'PropFuel',
        companyID: 'co-1', integrationID: 'int-1', credentialTypeID: 'ct-1',
        companyIntegrationID: world.ciid, // reference mode (connection already created by the plan)
        objects: world.objects, mjSchema: '__mj', maxPolls: 20,
        deltaPasses: overrides.deltaPasses ?? [],
        ...overrides,
    };
}

// A mock "mock" object the harness consumes: swapping routes mutates world.current.
function makeMock(world, mode = 'mock') {
    return {
        mode,
        setRoutes(routes) {
            world.calls.setRoutes++;
            // routes carry a Body per object path; map them back into world.current by Path → object.
            for (const r of routes) {
                const obj = world.objects.find((o) => r.Path === `/${o.toLowerCase()}`);
                if (obj && Array.isArray(r.Body)) world.current[obj] = r.Body;
            }
        },
        async close() { world.mockClosed = true; },
    };
}

const CONTACTS_DELTA = {
    Object: 'Contacts',
    Routes: [{ Path: '/contacts', Method: 'GET', Status: 200, Body: [
        { id: 'c1', name: 'Ada Lovelace', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'c2', name: 'Alan M. Turing', updated_at: '2026-02-01T00:00:00Z' },
        { id: 'c4', name: 'Edsger Dijkstra', updated_at: '2026-02-02T00:00:00Z' },
    ] }],
    ExpectedPresent: ['c1', 'c2', 'c4'],
    ExpectedUpdates: [{ ExternalID: 'c2', Field: 'name', Value: 'Alan M. Turing' }],
    ExpectedDeletes: ['c3'],
};

// ── Tests ────────────────────────────────────────────────────────────────────
async function testMakeVerify() {
    console.log('makeVerify — row-by-external-id over the dest store');
    const world = makeWorld();
    applySync(world); // populate the dest store from the initial feed
    const verify = makeVerify(makeMockDb(world), 'sqlserver', '__mj');
    assert.equal(await verify.rowCount('PropFuel Contacts'), 3, 'rowCount reads dest store');
    assert.equal(await verify.existsByExternalId(world.ciid, 'PropFuel Contacts', 'c2'), true, 'exists by external id');
    const row = await verify.rowByExternalId(world.ciid, 'PropFuel Contacts', 'c2');
    assert.equal(row?.name, 'Alan Turing', 'fetches the dest row fields by external id');
    assert.equal(await verify.existsByExternalId(world.ciid, 'PropFuel Contacts', 'nope'), false, 'absent id → false');
    ok('makeVerify resolves entity meta + reads dest rows by external id');
}

async function testFullE2EMockPass() {
    console.log('runConnectorE2E — full mock pass (setup→forward→delta→idempotent→teardown)');
    const world = makeWorld();
    const io = { gql: makeMockGql(world), db: makeMockDb(world), mock: makeMock(world) };
    const res = await runConnectorE2E(io, baseCfg(world, { deltaPasses: [CONTACTS_DELTA] }), false);
    assert.equal(res.ok, true, `overall ok (got: ${res.error ?? JSON.stringify(failedSteps(res))})`);
    // setup + forward
    assert.ok(res.steps.setup.ok, 'setup ok');
    assert.ok(res.steps.forward.every(s => s.ok), 'forward completeness/record-map all pass');
    // delta: create c4, update c2, delete c3 — all verified against the dest store
    const present = res.steps.delta.filter(s => s.name.endsWith('.present'));
    assert.ok(present.length === 3 && present.every(s => s.ok), 'all ExpectedPresent verified (incl. created c4)');
    const upd = res.steps.delta.find(s => s.name.endsWith('.update'));
    assert.ok(upd?.ok && upd.actual === 'Alan M. Turing', 'update overwrote c2.name in the dest store');
    const del = res.steps.delta.find(s => s.name.endsWith('.delete'));
    assert.ok(del?.ok, 'delete removed c3 from the dest store (full-snapshot reconciliation)');
    // idempotent: re-run over UNCHANGED (delta) state → 0 processed + rows stable
    const zero = res.steps.idempotent.find(s => s.name === 'idempotent.no-redundant-writes');
    assert.equal(zero.processed, 0, 'idempotent re-run processed 0');
    assert.ok(res.steps.idempotent.filter(s => s.name === 'idempotent.rows-stable').every(s => s.ok), 'row counts stable on re-run');
    // teardown ran
    assert.equal(world.calls.deleteMaps.length, 1, 'entity maps deleted');
    assert.equal(world.dbClosed, true, 'db closed');
    assert.equal(world.mockClosed, true, 'mock server closed');
    ok('full mock e2e: real-engine create/update/delete verified + idempotent + teardown');
}

async function testLiveSkipsDelta() {
    console.log('runConnectorE2E — live mode skips delta passes');
    const world = makeWorld();
    const io = { gql: makeMockGql(world), db: makeMockDb(world), mock: makeMock(world, 'live') };
    const res = await runConnectorE2E(io, baseCfg(world, { mode: 'live', deltaPasses: [CONTACTS_DELTA] }), false);
    assert.equal(res.ok, true, 'live forward+idempotent pass');
    assert.ok(res.steps.delta[0].name === 'delta.skipped', 'delta skipped in live mode');
    assert.equal(world.calls.setRoutes, 0, 'no route swaps in live mode (never mutate the live vendor)');
    ok('live mode runs forward+idempotent, skips mock-only delta passes');
}

async function testDeleteRegressionFailsRed() {
    console.log('runConnectorE2E — engine that does NOT delete on absence fails the delete assert');
    const world = makeWorld({ disableAbsenceDelete: true }); // simulate a tombstone-only engine
    const io = { gql: makeMockGql(world), db: makeMockDb(world), mock: makeMock(world) };
    const res = await runConnectorE2E(io, baseCfg(world, { deltaPasses: [CONTACTS_DELTA] }), false);
    const del = res.steps.delta.find(s => s.name.endsWith('.delete'));
    assert.equal(del.ok, false, 'delete assertion flags red when c3 survives (engine did not propagate delete)');
    assert.equal(res.ok, false, 'overall run red — a missed delete is not silently green');
    ok('a delete-on-absence regression is detected and fails the run');
}

async function testIdempotentRegressionFailsRed() {
    console.log('runConnectorE2E — non-idempotent re-run fails red');
    const world = makeWorld({ idempotentBreaks: true });
    const io = { gql: makeMockGql(world), db: makeMockDb(world), mock: makeMock(world) };
    const res = await runConnectorE2E(io, baseCfg(world), false); // no deltas; just forward + idempotent
    const zero = res.steps.idempotent.find(s => s.name === 'idempotent.no-redundant-writes');
    assert.equal(zero.ok, false, 'zero-processed assertion fails when the re-run keeps processing');
    assert.equal(res.ok, false, 'overall run red on a non-idempotent re-run');
    ok('a non-idempotent re-run (watermark/content-hash not skipping) is detected and fails');
}

async function testPhaseDeltaNoneAdvisory() {
    console.log('phaseDelta — no DeltaPasses → advisory pass (not a silent skip)');
    const world = makeWorld();
    const verify = makeVerify(makeMockDb(world), 'sqlserver', '__mj');
    const maps = world.objects.map((o, i) => ({ entityMapID: `em-${i}`, entityName: world.entityNameFor(o), sourceObjectName: o }));
    const steps = await phaseDelta({ gql: makeMockGql(world), mock: makeMock(world), verify, ciid: world.ciid, maps, cfg: { deltaPasses: [], maxPolls: 5 } });
    assert.equal(steps.length, 1, 'one advisory step');
    assert.equal(steps[0].name, 'delta.none', 'records that no deltas were defined');
    assert.ok(steps[0].ok, 'advisory passes but is visible');
    ok('phaseDelta surfaces a visible advisory when no DeltaPasses are defined');
}

function failedSteps(res) {
    const out = [];
    for (const [phase, v] of Object.entries(res.steps ?? {})) {
        for (const s of (Array.isArray(v) ? v : [v])) if (s && s.ok === false) out.push(`${phase}:${s.name}`);
    }
    return out;
}

// ── Run ──────────────────────────────────────────────────────────────────────
const tests = [testMakeVerify, testFullE2EMockPass, testLiveSkipsDelta, testDeleteRegressionFailsRed, testIdempotentRegressionFailsRed, testPhaseDeltaNoneAdvisory];
let failed = 0;
for (const t of tests) {
    try { await t(); }
    catch (e) { failed++; console.error(`  ✗ FAILED: ${e.message}\n${e.stack?.split('\n').slice(1, 3).join('\n')}`); }
}
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} assertions, ${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
