/**
 * Self-test for the GQL live harness ORCHESTRATION (no creds, no MJAPI, no DB).
 *
 * The harness takes its IO injected, so we drive runLiveTest/tailRunToCompletion/etc. against a mock
 * GraphQL world + mock DB and assert the framework-test machinery is correct: the right op sequence,
 * the tail-to-completion poll loop, the completeness/record-map assertion math, the read-only vs
 * write gating, exact-cleanup of created records, and that teardown always runs (even on failure).
 *
 * Run: node packages/Integration/connectors/test/gql-live-harness.selftest.mjs   (exit 0 = pass)
 */
import assert from 'node:assert/strict';
import {
    runLiveTest, tailRunToCompletion, triggerAndResolveRun, runSyncObserved, allStepsOk,
} from './gql-live-harness.mjs';

let passed = 0;
function ok(name) { passed++; console.log(`  ✓ ${name}`); }

// ── Mock world ───────────────────────────────────────────────────────────────
function makeWorld(overrides = {}) {
    const objects = overrides.objects ?? ['contacts', 'companies', 'deals', 'assoc_contacts_companies'];
    const entityNameFor = (o) => `HubSpot ${o}`;
    const world = {
        ciid: 'ci-mock-1', credId: 'cred-mock-1', objects, entityNameFor,
        startSyncReturnsRunId: overrides.startSyncReturnsRunId ?? true,
        deleteConnectionFails: overrides.deleteConnectionFails ?? false,
        runSeq: 0, lastRunId: null, runs: {}, // each StartSync gets a distinct id; run 1 (full)=142 processed, later=0
        calls: { createConnection: [], startSync: [], write: [], deleteMaps: [], deleteConn: [] },
        tailPolls: {}, credDeleted: null, dbClosed: false,
        // per-object simulated state
        rowCounts: overrides.rowCounts ?? { 'HubSpot contacts': 42, 'HubSpot companies': 10, 'HubSpot deals': 5, 'HubSpot assoc_contacts_companies': 7 },
        rmStats: overrides.rmStats ?? {
            'HubSpot contacts': { total: 42, distinctExternal: 42 },
            'HubSpot companies': { total: 10, distinctExternal: 10 },
            'HubSpot deals': { total: 5, distinctExternal: 5 },
            'HubSpot assoc_contacts_companies': { total: 7, distinctExternal: 7 },
        },
        hubspotTotals: overrides.hubspotTotals ?? { contacts: 42, companies: 10, deals: 5 },
    };
    return world;
}

function makeMockGql(world) {
    const tail = (vars) => {
        const key = vars.runID;
        const n = (world.tailPolls[key] = (world.tailPolls[key] ?? 0) + 1);
        if (n === 1) {
            return {
                Success: true, Message: 'ok', LatestSeq: 3, IsInFlight: true,
                Events: [
                    { Ts: 't', Seq: 1, EventType: 'records.batch.complete', Counts: { Processed: 100, Succeeded: 100, Failed: 0, Skipped: 0, TotalKnown: 142 }, DataJSON: null, ResumableStateJSON: null },
                    { Ts: 't', Seq: 2, EventType: 'external.call.retry', Level: 'info', Message: '429 backoff', DataJSON: '{"retryAfterMs":1000}' },
                    { Ts: 't', Seq: 3, EventType: 'checkpoint', ResumableStateJSON: '{"afterKey":"100"}' },
                ],
            };
        }
        return {
            Success: true, Message: 'ok', LatestSeq: 5, IsInFlight: false,
            Events: [
                { Ts: 't', Seq: 4, EventType: 'warning', Level: 'warn', Stage: 'assoc', Message: 'ZERO_PARENTS', DataJSON: '{"code":"ZERO_PARENTS"}' },
                { Ts: 't', Seq: 5, EventType: 'records.batch.complete', Counts: { Processed: 42, Succeeded: 42, Failed: 0, Skipped: 0, TotalKnown: 142 } },
            ],
        };
    };
    const getRun = (vars) => {
        const proc = world.runs[vars.runID]?.processed ?? 142; // full pull=142, incremental=0
        return {
            RunID: vars.runID, IsInFlight: false, Success: true, ExitReason: 'completed', DurationMs: 123,
            WarningCount: 1, Warnings: ['[ZERO_PARENTS] assoc: ZERO_PARENTS'],
            Counts: { Processed: proc, Succeeded: proc, Failed: 0, Skipped: 0, TotalKnown: 142 }, LatestEventType: 'run.complete', LatestMessage: 'done',
        };
    };
    return async (query, vars) => {
        if (query.includes('IntegrationCreateConnection')) { world.calls.createConnection.push(vars); return { IntegrationCreateConnection: { Success: true, Message: 'ok', CompanyIntegrationID: world.ciid, CredentialID: world.credId, ConnectionTestSuccess: true, ConnectionTestMessage: 'ok', SchemaRefresh: { RunID: 'sr-1', ObjectsCreated: world.objects.length, FieldsCreated: 12, UnresolvedObjects: [] } } }; }
        if (query.includes('IntegrationListSourceObjects')) return { IntegrationListSourceObjects: { Success: true, Message: 'ok', Objects: world.objects.map((o, i) => ({ Name: o, Label: o, AlreadyPersisted: true, IntegrationObjectID: `io-${i}`, SupportsIncrementalSync: true, SupportsWrite: false })) } };
        if (query.includes('IntegrationApplyAll')) return { IntegrationApplyAll: { Success: true, Message: 'ok', Warnings: [], Steps: [], EntityMapsCreated: world.objects.map((o, i) => ({ EntityMapID: `em-${i}`, EntityName: world.entityNameFor(o), SourceObjectName: o, FieldMapCount: 5 })) } };
        if (query.includes('IntegrationListEntityMaps')) return { IntegrationListEntityMaps: { Success: true, Message: 'ok', EntityMaps: world.objects.map((o, i) => ({ ID: `em-${i}`, Entity: world.entityNameFor(o), EntityID: `eid-${i}`, ExternalObjectName: o, SyncDirection: 'Pull', Status: 'Active', Priority: i })) } };
        if (query.includes('IntegrationStartSync')) {
            world.calls.startSync.push(vars);
            world.lastRunId = `run-${++world.runSeq}`;
            world.runs[world.lastRunId] = { processed: world.runSeq === 1 ? 142 : 0 }; // 1st=full, later=incremental
            return { IntegrationStartSync: { Success: true, Message: 'started', RunID: world.startSyncReturnsRunId ? world.lastRunId : null } };
        }
        if (query.includes('IntegrationListRuns')) return { IntegrationListRuns: { Success: true, Message: 'ok', Runs: [{ RunID: world.lastRunId, IsInFlight: true, RunKind: 'sync', StartedAt: 'now', Counts: null }] } };
        if (query.includes('IntegrationTailRunEvents')) return { IntegrationTailRunEvents: tail(vars) };
        if (query.includes('IntegrationGetRun')) return { IntegrationGetRun: { Success: true, Message: 'ok', Errors: [], Run: getRun(vars) } };
        if (query.includes('IntegrationWriteRecord')) {
            world.calls.write.push(vars);
            if (vars.operation === 'create') return { IntegrationWriteRecord: { Success: true, Message: 'created', ExternalID: 'ext-new-1', StatusCode: 201 } };
            return { IntegrationWriteRecord: { Success: true, Message: vars.operation, ExternalID: vars.externalID, StatusCode: 200 } };
        }
        if (query.includes('IntegrationDeleteEntityMaps')) { world.calls.deleteMaps.push(vars); return { IntegrationDeleteEntityMaps: { Success: true, Message: 'deleted' } }; }
        if (query.includes('IntegrationDeleteConnection')) { world.calls.deleteConn.push(vars); return { IntegrationDeleteConnection: { Success: !world.deleteConnectionFails, Message: world.deleteConnectionFails ? 'delete failed' : 'deleted', EntityMapsDeleted: world.objects.length, FieldMapsDeleted: 20, SchedulesDeleted: 0 } }; }
        throw new Error('unmocked GQL op: ' + query.slice(0, 80));
    };
}

function makeMockDb(world) {
    return {
        async entityRowCount(en) { return world.rowCounts[en] ?? 0; },
        async recordMapStats(_ci, en) { return world.rmStats[en] ?? { total: 0, distinctExternal: 0 }; },
        async deleteCredential(id) { world.credDeleted = id; },
        async close() { world.dbClosed = true; },
    };
}

function baseCfg(world) {
    return {
        runId: 't1', platform: 'sqlserver', companyID: 'co-1', integrationID: 'int-1', credentialTypeID: 'ct-1',
        token: 'SECRET_TOKEN', objects: world.objects, maxPolls: 20,
        writeObject: 'contacts', writeAttributes: { email: 'mj-live@x.invalid', firstname: 'MJ', lastname: 'Live' },
    };
}

function ioFor(world) {
    return { gql: makeMockGql(world), db: makeMockDb(world), hubspotTotal: async (o) => world.hubspotTotals[o] ?? null };
}

// ── Tests ────────────────────────────────────────────────────────────────────
async function testTailLoop() {
    console.log('tailRunToCompletion');
    const world = makeWorld();
    const acc = await tailRunToCompletion(makeMockGql(world), 'run-1', { maxPolls: 20 });
    assert.equal(acc.terminal, true, 'reaches terminal IsInFlight=false');
    assert.equal(world.tailPolls['run-1'], 2, 'polls exactly twice');
    assert.equal(acc.batches.length, 2, 'collects both batch.complete snapshots');
    assert.equal(acc.retryEvents, 1, 'counts the external.call.retry (rate-limit signal)');
    assert.equal(acc.checkpoints.length, 1, 'captures the checkpoint resumable state');
    assert.deepEqual(acc.checkpoints[0], { afterKey: '100' }, 'parses ResumableStateJSON');
    assert.equal(acc.warnings.length, 1, 'captures the structured warning');
    assert.equal(acc.warnings[0].code, 'ZERO_PARENTS', 'parses warning code from DataJSON');
    ok('tails to completion, accumulating batches/warnings/retries/checkpoints');
}

async function testRunIdFallback() {
    console.log('triggerAndResolveRun');
    const world = makeWorld({ startSyncReturnsRunId: false });
    const runId = await triggerAndResolveRun(makeMockGql(world), world.ciid, { fullSync: true, syncDirection: 'Pull' });
    assert.equal(runId, 'run-1', 'falls back to ListRuns(inFlightOnly) when StartSync.RunID is null');
    ok('resolves run id race-free via ListRuns fallback');
}

async function testForwardPass() {
    console.log('runLiveTest — forward read-only (parity + record-map 1:1 pass)');
    const world = makeWorld();
    const res = await runLiveTest(ioFor(world), baseCfg(world), /* allowWrite */ false);
    assert.equal(res.ok, true, 'overall ok when parity + 1:1 hold');
    assert.ok(res.steps.setup.ok, 'setup ok');
    const completeness = res.steps.forward.filter(s => s.name === 'forward.completeness');
    assert.equal(completeness.length, 3, 'completeness asserted for the 3 CRM objects');
    assert.ok(completeness.every(s => s.ok), 'every completeness check passed');
    assert.ok(completeness.find(s => s.object === 'contacts' && s.countParity === true && s.recordMapOneToOne === true), 'contacts parity+1:1 true');
    assert.equal(world.calls.startSync.length, 2, 'full + incremental pulls triggered');
    assert.equal(world.calls.startSync[0].fullSync, true, 'first pull is full');
    assert.equal(world.calls.startSync[1].fullSync, false, 'second pull is incremental');
    const narrowed = res.steps.forward.find(s => s.name === 'forward.incremental.narrowed');
    assert.ok(narrowed?.ok, 'incremental narrowed assertion is REAL and passes (142 full > 0 incremental)');
    assert.equal(narrowed.fullProcessed, 142, 'captured full processed');
    assert.equal(narrowed.incrProcessed, 0, 'captured incremental processed');
    assert.equal(world.calls.write.length, 0, 'read-only: NO writes performed');
    assert.ok(res.steps.backward[0].name === 'backward.skipped', 'backward skipped in read-only mode');
    // teardown ran
    assert.equal(world.calls.deleteMaps.length, 1, 'entity maps deleted');
    assert.equal(world.calls.deleteConn.length, 1, 'connection deleted');
    assert.equal(world.credDeleted, world.credId, 'credential row deleted (engine-direct gap)');
    assert.equal(world.dbClosed, true, 'db connection closed');
    ok('forward read-only: parity+1:1 assertions, full+incremental, no writes, full teardown');
}

async function testMatrixWriteAndCleanup() {
    console.log('runLiveTest — matrix with writes (CRUD round-trip + exact cleanup)');
    const world = makeWorld();
    const res = await runLiveTest(ioFor(world), baseCfg(world), /* allowWrite */ true);
    assert.equal(res.ok, true, 'overall ok');
    const create = res.steps.backward.find(s => s.name === 'backward.create');
    assert.ok(create?.ok && create.externalID === 'ext-new-1', 'backward create captured the new ExternalID');
    const update = res.steps.backward.find(s => s.name === 'backward.update');
    assert.ok(update?.ok, 'backward update ok');
    // exact cleanup: the created record was deleted by captured id
    const deletes = world.calls.write.filter(w => w.operation === 'delete');
    assert.equal(deletes.length, 1, 'exactly one external delete (the created record)');
    assert.equal(deletes[0].externalID, 'ext-new-1', 'deleted the exact created ExternalID');
    assert.ok(!/user|owner/i.test(deletes[0].objectName), 'never targeted Users/owners');
    ok('matrix: CRUD round-trip + exact-by-id cleanup of the created record');
}

async function testRefusesUserWrites() {
    console.log('runLiveTest — refuses writing Users');
    const world = makeWorld();
    const cfg = { ...baseCfg(world), writeObject: 'users' };
    const res = await runLiveTest(ioFor(world), cfg, true);
    // The phase throws; runLiveTest catches → result.error set, teardown still runs.
    assert.ok(res.error && /Users\/owners are off-limits/.test(res.error), 'refuses Users write with a clear error');
    assert.equal(world.calls.deleteConn.length, 1, 'teardown still ran after the refusal');
    ok('refuses Users/owners writes and still tears down');
}

async function testFailureStillTearsDown() {
    console.log('runLiveTest — count mismatch fails loud but still cleans up');
    const world = makeWorld({ rowCounts: { 'HubSpot contacts': 41, 'HubSpot companies': 10, 'HubSpot deals': 5, 'HubSpot assoc_contacts_companies': 7 } }); // contacts off by one
    const res = await runLiveTest(ioFor(world), baseCfg(world), false);
    assert.equal(res.ok, false, 'overall NOT ok on a completeness mismatch');
    const contacts = res.steps.forward.find(s => s.name === 'forward.completeness' && s.object === 'contacts');
    assert.equal(contacts.ok, false, 'contacts completeness flagged false (41 rows vs 42 total)');
    assert.equal(contacts.countParity, false, 'parity false');
    assert.equal(world.calls.deleteConn.length, 1, 'teardown still ran despite the failure (finally)');
    assert.equal(world.dbClosed, true, 'db still closed');
    ok('completeness mismatch → ok:false, but teardown + db.close still happen');
}

async function testRecordMapDupDetected() {
    console.log('runLiveTest — record-map duplicate detected');
    const world = makeWorld({ rmStats: { 'HubSpot contacts': { total: 43, distinctExternal: 42 }, 'HubSpot companies': { total: 10, distinctExternal: 10 }, 'HubSpot deals': { total: 5, distinctExternal: 5 }, 'HubSpot assoc_contacts_companies': { total: 7, distinctExternal: 7 } } });
    const res = await runLiveTest(ioFor(world), baseCfg(world), false);
    const contacts = res.steps.forward.find(s => s.name === 'forward.completeness' && s.object === 'contacts');
    assert.equal(contacts.recordMapOneToOne, false, 'duplicate record-map (43 total vs 42 distinct) flagged');
    assert.equal(res.ok, false, 'overall not ok');
    ok('record-map duplicate (total != distinct) is detected and fails the run');
}

async function testReferenceMode() {
    console.log('runLiveTest — reference mode (token-free, pre-seeded CIID, "use it never read it")');
    const world = makeWorld();
    const cfg = { ...baseCfg(world), companyIntegrationID: 'ci-preseeded', token: undefined };
    // token-free: hubspotTotal is null (the agent has NO HubSpot token in this mode)
    const io = { gql: makeMockGql(world), db: makeMockDb(world), hubspotTotal: null };
    const res = await runLiveTest(io, cfg, false);
    assert.equal(res.ok, true, 'reference-mode forward passes token-free');
    assert.equal(world.calls.createConnection.length, 0, 'NO CreateConnection — the token is never used by the agent');
    assert.ok(world.calls.startSync.length >= 1 && world.calls.startSync.every(s => s.ciid === 'ci-preseeded'), 'drives entirely by the pre-seeded CIID');
    const comp = res.steps.forward.find(s => s.name === 'forward.completeness' && s.object === 'contacts');
    assert.equal(comp.countParity, null, 'external API parity skipped (token-free)');
    assert.ok(comp.recordMapOneToOne, 'internal record-map 1:1 gate still holds');
    assert.ok(res.steps.forward.find(s => s.name === 'forward.full.clean')?.ok, 'clean-run completeness backbone holds token-free');
    assert.equal(world.calls.deleteConn.length, 0, 'pre-seeded connection is NOT torn down');
    assert.ok(res.steps.teardown.find(s => s.name === 'teardown.connection-preserved')?.ok, 'connection-preserved recorded');
    assert.ok(res.steps.teardown.find(s => s.name === 'teardown.delete-entity-maps'), 'maps created THIS run are still cleaned up');
    assert.equal(world.credDeleted, null, 'encrypted credential is preserved (never deleted in reference mode)');
    ok('reference mode: token never used, drives by CIID, internal completeness, connection+credential preserved');
}

async function testTeardownFailureFoldsOk() {
    console.log('runLiveTest — teardown failure turns the run red (post-finally verdict)');
    const world = makeWorld({ deleteConnectionFails: true });
    const res = await runLiveTest(ioFor(world), baseCfg(world), false);
    const td = res.steps.teardown.find(s => s.name === 'teardown.delete-connection');
    assert.equal(td.ok, false, 'delete-connection failure recorded in teardown steps');
    assert.equal(res.ok, false, 'result.ok=false even though forward passed — cleanup failure is not silently green');
    ok('a failed teardown (orphan risk) folds into result.ok=false');
}

async function testAllStepsOk() {
    console.log('allStepsOk helper');
    assert.equal(allStepsOk({ a: { ok: true }, b: [{ ok: true }, { ok: true }] }), true);
    assert.equal(allStepsOk({ a: { ok: true }, b: [{ ok: true }, { ok: false }] }), false);
    ok('allStepsOk folds nested step arrays correctly');
}

// ── Run ──────────────────────────────────────────────────────────────────────
const tests = [testTailLoop, testRunIdFallback, testForwardPass, testReferenceMode, testMatrixWriteAndCleanup, testRefusesUserWrites, testFailureStillTearsDown, testRecordMapDupDetected, testTeardownFailureFoldsOk, testAllStepsOk];
let failed = 0;
for (const t of tests) {
    try { await t(); }
    catch (e) { failed++; console.error(`  ✗ FAILED: ${e.message}\n${e.stack?.split('\n').slice(1, 3).join('\n')}`); }
}
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} assertions, ${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
