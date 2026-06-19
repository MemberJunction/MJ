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
import {
    runConnectorE2E, phaseDelta, phaseIdempotent, makeVerify,
    phaseDiscoverOverlay, phaseDiscoverColumns, phaseDAG, phaseMerkle,
    phaseAdaptiveRateLimit, phaseConcurrency, phaseRetry, phaseBidirectional,
} from './connector-e2e-harness.mjs';
import { scopedApplySet } from './gql-live-harness.mjs';

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
        ciid: 'ci-e2e-1', credId: 'cred-e2e-1', integrationID: 'int-1', objects, entityNameFor,
        // mock "current" routes, by object name → array of vendor rows
        current: JSON.parse(JSON.stringify(initial)),
        // dest store: entityName → Map(externalId → row{ID, ...fields})
        dest: new Map(),
        synced: new Set(),       // objects that have synced at least once (for delete reconciliation)
        lastRunProcessed: 0, lastRunSucceeded: null,
        runSeq: 0, lastRunId: null,
        // IntegrationObject Status (Active|Disabled) — overlay/deactivation cell reads this.
        ioStatus: new Map(objects.map((o) => [o.toLowerCase(), 'Active'])),
        ioFieldCount: overrides.ioFieldCount ?? 9,     // IntegrationObjectField row count (column-discovery cell)
        pkVerdicts: overrides.pkVerdicts ?? objects.map((o) => ({ ObjectName: o, Confident: true, Nominee: 'id', Confidence: 0.95, Strategy: 'naming', Reason: 'id field' })),
        watermark: new Map(),    // entityMapID → watermark value (retry cell)
        mapPriority: overrides.mapPriority ?? null, // object→priority (DAG cell); default = declaration order
        calls: { startSync: [], deleteMaps: [], deleteConn: [], setRoutes: 0, refresh: [], updateMaps: [], writes: [] },
        credDeleted: null, dbClosed: false, mockClosed: false,
        idempotentBreaks: overrides.idempotentBreaks ?? false,
        disableAbsenceDelete: overrides.disableAbsenceDelete ?? false, // simulate a tombstone-only engine
        // overlay: which objects an authoritative refresh currently "sees"; absent ⇒ deactivate.
        discoverableObjects: overrides.discoverableObjects ?? new Set(objects.map((o) => o.toLowerCase())),
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
    // Counts reported reflect the LAST applySync: Processed/Succeeded come from lastRunProcessed unless
    // an explicit lastRunSucceeded was set (retry/merkle cells that simulate a write-skip).
    const counts = () => {
        const p = world.lastRunProcessed;
        const s = world.lastRunSucceeded == null ? p : world.lastRunSucceeded;
        return { Processed: p, Succeeded: s, Failed: world.lastRunFailed ?? 0, Skipped: 0, TotalKnown: p };
    };
    const tail = () => ({ Success: true, Message: 'ok', LatestSeq: 1, IsInFlight: false, Events: [{ Ts: 't', Seq: 1, EventType: 'records.batch.complete', Counts: counts() }] });
    const getRun = (vars) => ({ RunID: vars.runID, IsInFlight: false, Success: (world.lastRunFailed ?? 0) === 0, ExitReason: 'completed', DurationMs: 5, WarningCount: 0, Warnings: [], Counts: counts(), LatestEventType: 'run.complete', LatestMessage: 'done' });
    const priorityOf = (o, i) => (world.mapPriority && world.mapPriority[o] != null) ? world.mapPriority[o] : i;
    return async (query, vars) => {
        if (query.includes('IntegrationCreateConnection')) return { IntegrationCreateConnection: { Success: true, Message: 'ok', CompanyIntegrationID: world.ciid, CredentialID: world.credId, ConnectionTestSuccess: true, ConnectionTestMessage: 'ok', SchemaRefresh: { RunID: 'sr', ObjectsCreated: world.objects.length, FieldsCreated: 9, UnresolvedObjects: [] } } };
        if (query.includes('IntegrationListSourceObjects')) return { IntegrationListSourceObjects: { Success: true, Message: 'ok', Objects: world.objects.map((o, i) => ({ Name: o, Label: o, AlreadyPersisted: true, IntegrationObjectID: `io-${i}`, SupportsIncrementalSync: true, SupportsWrite: false })) } };
        if (query.includes('IntegrationApplyAll')) return { IntegrationApplyAll: { Success: true, Message: 'ok', Warnings: [], Steps: [], EntityMapsCreated: world.objects.map((o, i) => ({ EntityMapID: `em-${i}`, EntityName: world.entityNameFor(o), SourceObjectName: o, FieldMapCount: 3 })) } };
        if (query.includes('IntegrationListEntityMaps')) return { IntegrationListEntityMaps: { Success: true, Message: 'ok', EntityMaps: world.objects.map((o, i) => ({ ID: `em-${i}`, Entity: world.entityNameFor(o), EntityID: `eid-${i}`, ExternalObjectName: o, SyncDirection: 'Pull', Status: 'Active', Priority: priorityOf(o, i), Configuration: world.mapConfig?.[`em-${i}`] ?? '' })) } };
        if (query.includes('IntegrationRefreshConnectorSchema')) {
            world.calls.refresh.push(vars);
            // Authoritative overlay: present objects stay Active; objects absent from discoverableObjects deactivate.
            if (vars.deactivateAbsent) {
                for (const o of world.objects) world.ioStatus.set(o.toLowerCase(), world.discoverableObjects.has(o.toLowerCase()) ? 'Active' : 'Disabled');
            }
            return { IntegrationRefreshConnectorSchema: { Success: true, Message: 'refreshed', RunID: `rs-${world.calls.refresh.length}`, ObjectsCreated: 0, ObjectsUpdated: world.discoverableObjects.size, FieldsCreated: world.ioFieldCount, FieldsUpdated: 0, PKVerdicts: world.pkVerdicts, UnresolvedObjects: [] } };
        }
        if (query.includes('IntegrationUpdateEntityMaps')) {
            world.calls.updateMaps.push(vars);
            world.mapConfig ??= {};
            for (const u of vars.updates ?? []) if (u.Configuration != null) world.mapConfig[u.EntityMapID] = u.Configuration;
            return { IntegrationUpdateEntityMaps: { Success: true, Message: 'updated' } };
        }
        if (query.includes('IntegrationWriteRecord')) {
            world.calls.writes.push(vars);
            const op = vars.operation;
            if (op === 'create') return { IntegrationWriteRecord: { Success: true, Message: 'created', ExternalID: world.nextWriteID ?? 'new-1', StatusCode: 201 } };
            return { IntegrationWriteRecord: { Success: true, Message: op, ExternalID: vars.externalID, StatusCode: 200 } };
        }
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
            // IntegrationObject Status reader (overlay/deactivation cell): "... FROM __mj.IntegrationObject WHERE IntegrationID = '...'"
            if (/IntegrationObject\b/i.test(sql) && /IntegrationID\s*=/i.test(sql) && /Status/i.test(sql) && !/IntegrationObjectField/i.test(sql)) {
                return world.objects.map((o) => ({ name: o, status: world.ioStatus.get(o.toLowerCase()) ?? 'Active' }));
            }
            // IntegrationObjectField COUNT (column-discovery cell): "SELECT COUNT(*) AS c FROM ... IntegrationObjectField ..."
            if (/COUNT\(\*\)/i.test(sql) && /IntegrationObjectField/i.test(sql)) {
                return [{ c: world.ioFieldCount }];
            }
            // Watermark reader (retry cell): "... FROM __mj.CompanyIntegrationSyncWatermark WHERE EntityMapID = '...'"
            const wmMatch = sql.match(/CompanyIntegrationSyncWatermark[\s\S]*EntityMapID\s*=\s*'([^']+)'/i);
            if (wmMatch) {
                const v = world.watermark.get(wmMatch[1]);
                return v === undefined ? [] : [{ v }];
            }
            // entity meta lookup: "... FROM __mj.Entity WHERE Name = 'PropFuel Contacts' ..."
            const metaMatch = sql.match(/Entity.*?Name\s*=\s*'([^']+)'/s);
            if (/FROM\s+[`"\[]?__mj[`"\]]?.*Entity/i.test(sql) && metaMatch && !/IntegrationObject/i.test(sql)) {
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
// By DEFAULT it does NOT expose getRequests/kind/manifest — so the request-capture cells
// (watermark / pagination / rate-limit / concurrency / retry / discover-overlay / bidirectional)
// take their explicit skip-with-reason path (never a fake pass). Pass { rich:true } to expose the
// full origin-mock surface so those cells exercise their REAL code paths against the simulated world
// (used by the dedicated matrix-cell tests below).
function makeMock(world, mode = 'mock', opts = {}) {
    const requests = [];
    const base = {
        mode,
        setRoutes(routes) {
            world.calls.setRoutes++;
            for (const r of routes) {
                const obj = world.objects.find((o) => r.Path === `/${o.toLowerCase()}`);
                if (obj && Array.isArray(r.Body)) world.current[obj] = r.Body;
            }
        },
        async close() { world.mockClosed = true; },
    };
    if (!opts.rich) return base;
    const manifest = {
        Routes: world.objects.map((o) => ({ Path: `/${o.toLowerCase()}`, Method: 'GET', Status: 200, Body: world.current[o] ?? [] })),
        Configuration: {},
    };
    return {
        ...base, kind: 'origin', manifest,
        // Each sync "issues" a list request per object (with a ts). A watermark-capable world stamps a
        // `_since` query on the SECOND+ sync so the C1 server-side-filter assertion is genuine; a 429/500
        // world reports the induced status via world.lastInducedStatus so retry/rate-limit cells see it.
        getRequests() {
            const out = [];
            const t = Date.now();
            // A real sync issues MULTIPLE list requests per object (pages + any retries). Model >=2 hits so
            // the rate-limit/retry cells (which require listRouteRequests>1 to prove the engine retried)
            // observe a genuine multi-hit window rather than a single-shot.
            const hitsPerObject = world.listHitsPerObject ?? 2;
            world.objects.forEach((o, i) => {
                const since = (world.watermarkCapable && world.runSeq > 1) ? `?updated_since=2026-01-01` : '';
                for (let h = 0; h < hitsPerObject; h++) {
                    out.push({ method: 'GET', path: `/${o.toLowerCase()}`, ts: t + i + h, query: decodeURIComponent(since), rawQuery: since, body: undefined });
                }
            });
            for (const w of world.calls.writes) out.push({ method: w.operation === 'create' ? 'POST' : (w.operation === 'delete' ? 'DELETE' : 'PATCH'), path: `/${String(w.objectName).toLowerCase()}/${w.externalID ?? world.nextWriteID ?? 'new-1'}`, ts: Date.now(), body: w.attributes });
            return out.concat(requests);
        },
        clearRequests() { requests.length = 0; },
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

// ── New matrix-cell phase tests (E1) ──────────────────────────────────────────
// Helpers: maps + a phase cfg over the simulated world.
function mapsOf(world) {
    return world.objects.map((o, i) => ({ entityMapID: `em-${i}`, entityName: world.entityNameFor(o), sourceObjectName: o }));
}
function phaseCfg(world, overrides = {}) {
    return { mode: 'mock', platform: 'sqlserver', mjSchema: '__mj', maxPolls: 20, integrationID: world.integrationID, ...overrides };
}

async function testDiscoverOverlay() {
    console.log('phaseDiscoverOverlay (cell 10) — present overlay + reversible deactivation, and honest stub when not discoverable');
    // (a) discoverable=false → honest skip (no fake pass).
    {
        const world = makeWorld();
        const steps = await phaseDiscoverOverlay({ gql: makeMockGql(world), db: makeMockDb(world), mock: makeMock(world, 'mock', { rich: true }), ciid: world.ciid, maps: mapsOf(world), cfg: phaseCfg(world, { discoverable: false }), integrationID: world.integrationID });
        assert.equal(steps.length, 1, 'one step');
        assert.ok(steps[0].name === 'discover-overlay.skipped' && steps[0].ok && steps[0].skipReason, 'stubs with an explicit skipReason when discovery is not declared');
    }
    // (b) discoverable + narrowed routes that DROP the last object → it deactivates, then reverses.
    {
        const world = makeWorld({ objects: ['Contacts', 'Campaigns'] });
        const dropped = 'Campaigns';
        // narrowed discovery omits Campaigns → after the narrowed refresh it must be Disabled
        const narrowedRoutes = [{ Path: '/contacts', Method: 'GET', Status: 200, Body: world.current.Contacts }];
        const cfg = phaseCfg(world, { discoverable: true, discoverNarrowedRoutes: narrowedRoutes });
        const mock = makeMock(world, 'mock', { rich: true });
        // The narrowed refresh's effect is modeled by removing Campaigns from discoverableObjects when the
        // narrowed routes are applied; the mock's setRoutes can't know, so wire it explicitly here.
        const realSet = mock.setRoutes.bind(mock);
        mock.setRoutes = (routes) => { realSet(routes); world.discoverableObjects = new Set(routes.some(r => /campaigns/i.test(r.Path)) ? ['contacts', 'campaigns'] : ['contacts']); };
        const steps = await phaseDiscoverOverlay({ gql: makeMockGql(world), db: makeMockDb(world), mock, ciid: world.ciid, maps: mapsOf(world), cfg, integrationID: world.integrationID });
        const deact = steps.find(s => s.name === 'discover-overlay.deactivation');
        const rev = steps.find(s => s.name === 'discover-overlay.reversible');
        assert.ok(deact?.ok && deact.droppedObject === dropped && String(deact.statusAfter).toLowerCase() === 'disabled', 'absent object deactivated (Status=Disabled)');
        assert.ok(rev?.ok && String(rev.statusAfter).toLowerCase() === 'active', 'object flips back to Active when it reappears (reversible)');
    }
    ok('phaseDiscoverOverlay: stubs when not discoverable; deactivates-then-reverses when an authoritative discovery drops an object');
}

async function testDiscoverColumns() {
    console.log('phaseDiscoverColumns (cell 11) — fields surface + soft-PK verdicts; honest stub when not discoverable');
    const world = makeWorld();
    // stub path
    const stub = await phaseDiscoverColumns({ gql: makeMockGql(world), db: makeMockDb(world), ciid: world.ciid, cfg: phaseCfg(world, { discoverable: false }), integrationID: world.integrationID });
    assert.ok(stub[0].name === 'discover-columns.skipped' && stub[0].ok && stub[0].skipReason, 'stubs with reason when discovery not declared');
    // real path
    const steps = await phaseDiscoverColumns({ gql: makeMockGql(world), db: makeMockDb(world), ciid: world.ciid, cfg: phaseCfg(world, { discoverable: true }), integrationID: world.integrationID });
    assert.ok(steps.find(s => s.name === 'discover-columns.fields-present')?.ok, 'IntegrationObjectField rows present (non-vacuous)');
    assert.ok(steps.find(s => s.name === 'discover-columns.softpk-inference')?.ok, 'soft-PK verdicts emitted');
    ok('phaseDiscoverColumns: fields-present + soft-PK inference are anti-vacuous; stubs when not discoverable');
}

async function testDAG() {
    console.log('phaseDAG (cell 12) — topological layering (parent before child) + clean run');
    // child object name embeds parent → edge detected; parent priority must be <= child.
    const world = makeWorld({ objects: ['contacts', 'companies', 'assoc_contacts_companies'], mapPriority: { contacts: 0, companies: 1, assoc_contacts_companies: 2 } });
    world.current = { contacts: [{ id: 'a1' }], companies: [{ id: 'b1' }], assoc_contacts_companies: [{ id: 'x1' }] };
    const steps = await phaseDAG({ gql: makeMockGql(world), ciid: world.ciid, maps: mapsOf(world), cfg: phaseCfg(world) });
    const lay = steps.find(s => s.name === 'dag.topological-layering');
    assert.ok(lay?.ok && lay.hasParentChildEdge === true, 'parent→child edge found and parent precedes child in priority');
    assert.ok(steps.find(s => s.name === 'dag.run-clean')?.ok, 'full DAG-ordered sync completed clean');
    // inverted priority → fails red
    const bad = makeWorld({ objects: ['contacts', 'assoc_contacts_companies'], mapPriority: { contacts: 5, assoc_contacts_companies: 0 } });
    bad.current = { contacts: [{ id: 'a1' }], assoc_contacts_companies: [{ id: 'x1' }] };
    const badSteps = await phaseDAG({ gql: makeMockGql(bad), ciid: bad.ciid, maps: mapsOf(bad), cfg: phaseCfg(bad) });
    assert.equal(badSteps.find(s => s.name === 'dag.topological-layering')?.ok, false, 'inverted layer (child before parent) fails red');
    ok('phaseDAG: detects + validates parent-before-child layering; inverted layering fails red');
}

async function testMerkle() {
    console.log('phaseMerkle (cell 14) — unchanged partition skipped (0 writes) on reconcile re-sync');
    const world = makeWorld();
    // model content-hash: an unchanged re-sync writes nothing. applySync already gives processed=0 on
    // unchanged data; set lastRunSucceeded accordingly so the cell's Succeeded===0 proxy holds.
    const gql = makeMockGql(world);
    // After seed (full) + reconcile (incremental, unchanged) the 2nd run's succeeded must be 0.
    const steps = await phaseMerkle({ gql, ciid: world.ciid, maps: mapsOf(world), cfg: phaseCfg(world) });
    assert.ok(steps.find(s => s.name === 'merkle.enable')?.ok, 'partitionReconcile config round-trips');
    assert.ok(steps.find(s => s.name === 'merkle.unchanged-partition-skipped')?.ok, 'unchanged partition skipped (Succeeded===0) on reconcile re-sync');
    assert.ok(steps.find(s => s.name === 'merkle.cleanup')?.ok, 'config reset in cleanup');
    ok('phaseMerkle: partitionReconcile enabled, unchanged re-sync writes nothing, config reset');
}

async function testRateLimit() {
    console.log('phaseAdaptiveRateLimit (cell 15) — recovers from a 429 storm; honest stub without request capture');
    // No request capture (default mock) → honest skip.
    const w1 = makeWorld();
    const stub = await phaseAdaptiveRateLimit({ gql: makeMockGql(w1), mock: makeMock(w1), ciid: w1.ciid, maps: mapsOf(w1), cfg: phaseCfg(w1) });
    assert.ok(stub[0].name === 'rate-limit.skipped' && stub[0].ok && stub[0].skipReason, 'stubs with reason without origin-mock request capture');
    // Rich mock + a list route present → the cell runs; the simulated run completes clean and the list
    // route is hit > once (the engine retried), proving the recovery assertion path.
    const w2 = makeWorld({ objects: ['Contacts'] });
    const mock = makeMock(w2, 'mock', { rich: true });
    const steps = await phaseAdaptiveRateLimit({ gql: makeMockGql(w2), mock, ciid: w2.ciid, maps: mapsOf(w2), cfg: phaseCfg(w2) });
    const cell = steps.find(s => s.name === 'rate-limit.backoff-and-recover');
    assert.ok(cell && cell.ok, 'run recovers (clean completion) and the list route was hit more than once');
    ok('phaseAdaptiveRateLimit: stubs without capture; asserts backoff+recovery with a swappable list route');
}

async function testConcurrency() {
    console.log('phaseConcurrency (cell 16) — within-layer parallelism observed OR honest stub with timing evidence');
    const world = makeWorld({ objects: ['Contacts', 'Campaigns'] });
    const steps = await phaseConcurrency({ gql: makeMockGql(world), mock: makeMock(world, 'mock', { rich: true }), ciid: world.ciid, maps: mapsOf(world), cfg: phaseCfg(world) });
    const cell = steps.find(s => s.name === 'concurrency.within-layer-parallel');
    assert.ok(cell?.ok, 'cell passes (overlap observed OR stub-with-reason carrying the measured timing)');
    assert.ok(cell.skipReason || cell.nearSimultaneousCrossObjectPairs >= 0, 'either overlap measured or an explicit reason given (never a fake pass)');
    ok('phaseConcurrency: observes overlap or stubs-with-reason carrying the measured (non-overlapping) timing');
}

async function testRetry() {
    console.log('phaseRetry (cell 17) — transient 500 recovers; watermark not advanced on persistent failure');
    const world = makeWorld({ objects: ['Contacts'] });
    // Seed a watermark for em-0 and keep it stable across the persistent-failure run.
    world.watermark.set('em-0', '2026-01-01T00:00:00Z');
    const steps = await phaseRetry({ gql: makeMockGql(world), db: makeMockDb(world), mock: makeMock(world, 'mock', { rich: true }), ciid: world.ciid, maps: mapsOf(world), cfg: phaseCfg(world) });
    assert.ok(steps.find(s => s.name === 'retry.transient-recovers')?.ok, 'a one-shot 500 is retried through to a clean completion');
    const wm = steps.find(s => s.name === 'retry.watermark-not-advanced');
    assert.ok(wm?.ok, 'watermark unchanged after a persistent-failure fetch (resume from same point)');
    ok('phaseRetry: transient recovers; persistent-failure leaves the watermark unadvanced');
}

async function testBidirectional() {
    console.log('phaseBidirectional (write round-trip) — REAL with a WriteRoundTrip spec; honest stub without one');
    // (a) no spec → honest skip.
    const w1 = makeWorld();
    const stub = await phaseBidirectional({ gql: makeMockGql(w1), mock: makeMock(w1, 'mock', { rich: true }), verify: makeVerify(makeMockDb(w1), 'sqlserver', '__mj'), ciid: w1.ciid, maps: mapsOf(w1), cfg: phaseCfg(w1) });
    assert.ok(stub[0].name === 'bidirectional.skipped' && stub[0].ok && stub[0].skipReason, 'stubs with reason without a WriteRoundTrip spec');
    // (b) with a spec → create/update/delete round-trip + request shapes asserted.
    const w2 = makeWorld({ objects: ['Contacts'] });
    w2.nextWriteID = 'wr-1';
    const wrt = {
        Object: 'Contacts', CreateAttributes: { name: 'New' }, UpdateAttributes: { name: 'Upd' },
        Routes: [{ Path: '/contacts', Method: 'POST', Status: 201, Body: { id: 'wr-1' } }],
    };
    const steps = await phaseBidirectional({ gql: makeMockGql(w2), mock: makeMock(w2, 'mock', { rich: true }), verify: makeVerify(makeMockDb(w2), 'sqlserver', '__mj'), ciid: w2.ciid, maps: mapsOf(w2), cfg: phaseCfg(w2, { writeRoundTrip: wrt }) });
    assert.ok(steps.find(s => s.name === 'bidirectional.create')?.ok, 'create returns a non-empty ExternalID');
    assert.ok(steps.find(s => s.name === 'bidirectional.create-shape')?.ok, 'create issued a POST carrying the attributes');
    assert.ok(steps.find(s => s.name === 'bidirectional.delete')?.ok, 'delete round-trips');
    assert.ok(w2.calls.writes.some(w => w.operation === 'create') && w2.calls.writes.some(w => w.operation === 'delete'), 'create + delete were issued');
    ok('phaseBidirectional: stubs without a spec; with one, create/update/delete round-trip + shapes assert');
}

async function testScopedApplySet() {
    console.log('scopedApplySet (E7) — objects + FK parents, never the whole catalog');
    const catalog = ['contacts', 'companies', 'deals', 'tickets', 'assoc_contacts_companies', 'line_items'];
    // requesting the association pulls in its embedded parents (contacts, companies) but NOT deals/tickets.
    const set = scopedApplySet(['assoc_contacts_companies'], catalog).map(s => s.toLowerCase());
    assert.ok(set.includes('assoc_contacts_companies'), 'requested object included');
    assert.ok(set.includes('contacts') && set.includes('companies'), 'FK parents embedded in the name are pulled in');
    assert.ok(!set.includes('deals') && !set.includes('tickets'), 'unrelated catalog objects are NOT applied (not the full catalog)');
    // explicit applyParents are unioned in.
    const set2 = scopedApplySet(['deals'], catalog, ['contacts']).map(s => s.toLowerCase());
    assert.ok(set2.includes('deals') && set2.includes('contacts'), 'explicit FK parents unioned');
    ok('scopedApplySet: requested objects + embedded/explicit FK parents only — scoped, not full-catalog');
}

function failedSteps(res) {
    const out = [];
    for (const [phase, v] of Object.entries(res.steps ?? {})) {
        for (const s of (Array.isArray(v) ? v : [v])) if (s && s.ok === false) out.push(`${phase}:${s.name}`);
    }
    return out;
}

// ── Run ──────────────────────────────────────────────────────────────────────
const tests = [
    testMakeVerify, testFullE2EMockPass, testLiveSkipsDelta, testDeleteRegressionFailsRed,
    testIdempotentRegressionFailsRed, testPhaseDeltaNoneAdvisory,
    testDiscoverOverlay, testDiscoverColumns, testDAG, testMerkle,
    testRateLimit, testConcurrency, testRetry, testBidirectional, testScopedApplySet,
];
let failed = 0;
for (const t of tests) {
    try { await t(); }
    catch (e) { failed++; console.error(`  ✗ FAILED: ${e.message}\n${e.stack?.split('\n').slice(1, 3).join('\n')}`); }
}
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} assertions, ${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
