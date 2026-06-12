/**
 * GQL-driven live integration test harness — the canonical framework-functionality test,
 * exercised through the REAL MJAPI GraphQL API against REAL data (HubSpot as the vehicle).
 *
 * What it proves (framework, not connector): record-map identity 1:1, data completeness
 * ("all data gets synced in"), watermark + content-hash incremental, the keyset re-anchor on
 * real data, associations/DAG order, push round-trip, structured emissions, rate-limit behavior
 * — on both SQL Server and Postgres. See LIVE_TEST_DESIGN.md for the full assertion catalog.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. The credential-safe runner dereferences
 * secrets and the plan entrypoints (plans.mjs) build the IO adapters; the orchestration here takes
 * { gql, db, hubspotTotal } INJECTED, so it is fully unit-testable with mocks (gql-live-harness.test)
 * and carries no secret. The HubSpot token enters the system exactly once — as the encrypted
 * CredentialValues on IntegrationCreateConnection — and never appears on any later GQL op.
 *
 * ORDERING / SAFETY: forward (pull) runs first and read-only. Backward (push/CRUD) runs only when
 * allowWrite=true (broker-gated), creates only test-marked records, and deletes every one it created
 * in a finally block. It never touches Users/owners or pre-existing data.
 */

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL operation strings (exact field names verified against the live resolver
// source — schema.graphql is stale for the §11 run-observe trio).
// ─────────────────────────────────────────────────────────────────────────────

export const GQL = {
    createConnection: `mutation($input: CreateConnectionInput!, $testConnection: Boolean!, $runSchemaRefresh: Boolean!) {
      IntegrationCreateConnection(input: $input, testConnection: $testConnection, runSchemaRefresh: $runSchemaRefresh) {
        Success Message CompanyIntegrationID CredentialID ConnectionTestSuccess ConnectionTestMessage
        SchemaRefresh { RunID ObjectsCreated FieldsCreated UnresolvedObjects }
      }
    }`,
    listSourceObjects: `query($ciid: String!) {
      IntegrationListSourceObjects(companyIntegrationID: $ciid) {
        Success Message Objects { Name Label AlreadyPersisted IntegrationObjectID SupportsIncrementalSync SupportsWrite }
      }
    }`,
    applyAll: `mutation($input: ApplyAllInput!, $platform: String!, $skipGitCommit: Boolean!, $skipRestart: Boolean!) {
      IntegrationApplyAll(input: $input, platform: $platform, skipGitCommit: $skipGitCommit, skipRestart: $skipRestart) {
        Success Message
        EntityMapsCreated { EntityMapID EntityName SourceObjectName FieldMapCount }
        Warnings Steps { Name Status DurationMs Message }
      }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority }
      }
    }`,
    startSync: `mutation($ciid: String!, $fullSync: Boolean!, $syncDirection: String, $entityMapIDs: [String!]) {
      IntegrationStartSync(companyIntegrationID: $ciid, fullSync: $fullSync, syncDirection: $syncDirection, entityMapIDs: $entityMapIDs) {
        Success Message RunID
      }
    }`,
    listRuns: `query($ciid: String, $inFlightOnly: Boolean, $limit: Float) {
      IntegrationListRuns(companyIntegrationID: $ciid, inFlightOnly: $inFlightOnly, limit: $limit) {
        Success Message Runs { RunID IsInFlight RunKind StartedAt Counts { Processed Succeeded Failed Skipped TotalKnown } }
      }
    }`,
    tailRunEvents: `query($runID: String!, $sinceSeq: Float) {
      IntegrationTailRunEvents(runID: $runID, sinceSeq: $sinceSeq) {
        Success Message LatestSeq IsInFlight
        Events { Ts Seq EventType Level Stage Message Counts { Processed Succeeded Failed Skipped TotalKnown } DataJSON ResumableStateJSON }
      }
    }`,
    getRun: `query($runID: String!) {
      IntegrationGetRun(runID: $runID) {
        Success Message Errors
        Run { RunID IsInFlight Success ExitReason DurationMs WarningCount Warnings LatestEventType LatestMessage Counts { Processed Succeeded Failed Skipped TotalKnown } }
      }
    }`,
    writeRecord: `mutation($ciid: String!, $objectName: String!, $operation: String!, $externalID: String, $attributes: String) {
      IntegrationWriteRecord(companyIntegrationID: $ciid, objectName: $objectName, operation: $operation, externalID: $externalID, attributes: $attributes) {
        Success Message ExternalID StatusCode
      }
    }`,
    deleteEntityMaps: `mutation($ids: [String!]!) {
      IntegrationDeleteEntityMaps(entityMapIDs: $ids) { Success Message }
    }`,
    deleteConnection: `mutation($ciid: String!, $deleteData: Boolean!) {
      IntegrationDeleteConnection(companyIntegrationID: $ciid, deleteData: $deleteData) {
        Success Message EntityMapsDeleted FieldMapsDeleted SchedulesDeleted
      }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

/** Throws if a GQL op's `Success` is false, surfacing the server Message. */
function expectGqlSuccess(opName, payload) {
    if (!payload || payload.Success !== true) {
        throw new Error(`${opName} failed: ${payload?.Message ?? 'no payload'}`);
    }
    return payload;
}

/**
 * Tails a run's structured event stream to completion (IsInFlight=false), accumulating the
 * framework-observable signals the assertions need. Keyset-by-seq over the event stream — re-polls
 * immediately (no sleeps); a small await yields the event loop between polls.
 */
export async function tailRunToCompletion(gql, runID, opts = {}) {
    const maxPolls = opts.maxPolls ?? 100000;
    const acc = {
        runID,
        batches: [],            // per-batch Counts snapshots
        warnings: [],           // Level='warn' / EventType='warning' events
        retryEvents: 0,         // 'external.call.retry' — rate-limit/backoff signal
        checkpoints: [],        // ResumableStateJSON from 'checkpoint' events (keyset/resume)
        keysetReanchors: 0,     // batch events whose Message/DataJSON shows a keyset re-anchor
        eventTypes: {},         // histogram of EventType
        lastCounts: null,
        terminal: false,
    };
    let sinceSeq = 0;
    // Wait between polls so `maxPolls` is a real TIME budget, not "N back-to-back ~3ms round-trips".
    // Without this, a long real sync (tens of thousands of records, minutes of wall-clock) blows through
    // maxPolls in seconds and the harness reads the run mid-flight (Processed:0, Success:false) while data
    // is still streaming. A small interval (default 1s) makes maxPolls cover minutes with gentle polling.
    const pollIntervalMs = opts.pollIntervalMs ?? 1000;
    for (let i = 0; i < maxPolls; i++) {
        const data = await gql(GQL.tailRunEvents, { runID, sinceSeq });
        const out = data.IntegrationTailRunEvents;
        if (!out?.Success) throw new Error(`TailRunEvents failed: ${out?.Message ?? 'no payload'}`);
        for (const ev of out.Events ?? []) {
            acc.eventTypes[ev.EventType] = (acc.eventTypes[ev.EventType] ?? 0) + 1;
            if (ev.Counts) { acc.lastCounts = ev.Counts; if (ev.EventType === 'records.batch.complete') acc.batches.push(ev.Counts); }
            if (ev.Level === 'warn' || ev.EventType === 'warning') {
                acc.warnings.push({ code: tryParse(ev.DataJSON)?.code, stage: ev.Stage, message: ev.Message });
            }
            if (ev.EventType === 'external.call.retry') acc.retryEvents++;
            if (ev.EventType === 'checkpoint' && ev.ResumableStateJSON) acc.checkpoints.push(tryParse(ev.ResumableStateJSON));
            if (/keyset|re-?anchor/i.test(ev.Message ?? '') || tryParse(ev.DataJSON)?.keysetReanchor) acc.keysetReanchors++;
        }
        sinceSeq = out.LatestSeq ?? sinceSeq;
        if (out.IsInFlight === false) { acc.terminal = true; break; }
        await new Promise(r => setTimeout(r, pollIntervalMs));
    }
    return acc;
}

function tryParse(s) {
    if (typeof s !== 'string') return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
}

/** Triggers a sync and resolves the run id race-free (StartSync.RunID can be null). */
export async function triggerAndResolveRun(gql, ciid, { fullSync = false, syncDirection, entityMapIDs } = {}) {
    // Snapshot the latest run BEFORE we trigger, so a newer one is unambiguously "this run".
    const beforeRuns = (await gql(GQL.listRuns, { ciid, inFlightOnly: false, limit: 1 })).IntegrationListRuns;
    const beforeID = beforeRuns?.Runs?.[0]?.RunID ?? null;

    const started = expectGqlSuccess('StartSync',
        (await gql(GQL.startSync, { ciid, fullSync, syncDirection: syncDirection ?? null, entityMapIDs: entityMapIDs ?? null })).IntegrationStartSync);
    if (started.RunID) return started.RunID;

    // Fallback 1: the in-flight run for this connector.
    const inflight = (await gql(GQL.listRuns, { ciid, inFlightOnly: true, limit: 1 })).IntegrationListRuns;
    let id = inflight?.Runs?.[0]?.RunID;
    // Fallback 2: a fast sync (e.g. advancedGen off + already-synced data) can COMPLETE before we
    // can observe it in-flight. Take the most-recent run as long as it's newer than the pre-trigger one.
    if (!id) {
        const recent = (await gql(GQL.listRuns, { ciid, inFlightOnly: false, limit: 1 })).IntegrationListRuns;
        const recentID = recent?.Runs?.[0]?.RunID ?? null;
        if (recentID && recentID !== beforeID) id = recentID;
    }
    if (!id) throw new Error('Could not resolve run id after StartSync (no RunID and no in-flight run)');
    return id;
}

/** Runs one sync end-to-end: trigger → tail to completion → authoritative GetRun aggregate. */
export async function runSyncObserved(gql, ciid, opts) {
    const runID = await triggerAndResolveRun(gql, ciid, opts);
    const tail = await tailRunToCompletion(gql, runID, opts);
    const detail = (await gql(GQL.getRun, { runID })).IntegrationGetRun;
    return { runID, tail, run: detail?.Run ?? null, errors: detail?.Errors ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phases (IO injected: gql, db, hubspotTotal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * P0 — stand up the connection (or reference a pre-seeded one), tables, and entity/field maps.
 *
 * REFERENCE MODE (cfg.companyIntegrationID set): the connection + ENCRYPTED credential already exist
 * (seeded out-of-band by someone who had the token). The token NEVER enters this process — the server
 * decrypts it internally on every sync; we drive purely by the CompanyIntegrationID. This is the
 * "use it, never read it" path. ApplyAll/StartSync below need no token (they work from the persisted
 * schema + the encrypted credential), so the whole run is token-free.
 *
 * TOKEN MODE (cfg.token set, no CIID): create the connection, which encrypts the plaintext token into
 * the Credential. Only for an out-of-band seeding step run by someone who holds the token.
 *
 * Returns { ciid, credentialID, maps, referenceMode }.
 */
export async function phaseSetup({ gql, cfg }) {
    const referenceMode = !!cfg.companyIntegrationID;
    let ciid, credentialID = null, schemaRefresh = null, connectionTest = null;

    if (referenceMode) {
        ciid = cfg.companyIntegrationID;
    } else {
        if (!cfg.token) throw new Error('phaseSetup: no companyIntegrationID (reference mode) and no token (create mode) — nothing to connect with');
        const input = {
            CompanyID: cfg.companyID,
            IntegrationID: cfg.integrationID,
            CredentialTypeID: cfg.credentialTypeID,
            CredentialName: cfg.credentialName ?? `hs-live-${cfg.runId}`,
            CredentialValues: JSON.stringify({ apiKey: cfg.token }),
        };
        const conn = expectGqlSuccess('CreateConnection',
            (await gql(GQL.createConnection, { input, testConnection: true, runSchemaRefresh: true })).IntegrationCreateConnection);
        ciid = conn.CompanyIntegrationID;
        if (!ciid) throw new Error('CreateConnection returned no CompanyIntegrationID');
        credentialID = conn.CredentialID;
        schemaRefresh = conn.SchemaRefresh ?? null;
        connectionTest = { ok: conn.ConnectionTestSuccess, message: conn.ConnectionTestMessage };
    }

    const applied = expectGqlSuccess('ApplyAll', (await gql(GQL.applyAll, {
        input: {
            CompanyIntegrationID: ciid,
            SourceObjects: cfg.objects.map(name => ({ SourceObjectName: name })),
            DefaultSyncDirection: 'Pull',
            StartSync: false,
            FullSync: false,
            SyncScope: 'created',
        },
        platform: cfg.platform,
        skipGitCommit: true,
        skipRestart: true,   // CRITICAL: keep the map IDs in the GQL response (no PM2 handoff)
    })).IntegrationApplyAll);

    const maps = (applied.EntityMapsCreated ?? []).map(m => ({
        entityMapID: m.EntityMapID, entityName: m.EntityName, sourceObjectName: m.SourceObjectName, fieldMapCount: m.FieldMapCount,
    }));
    // Cross-check via the list query.
    const listed = expectGqlSuccess('ListEntityMaps', (await gql(GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps);
    return { ciid, credentialID, maps, listedMaps: listed.EntityMaps ?? [], connectionTest, schemaRefresh, referenceMode };
}

/**
 * P1+P2 — forward full pull then incremental, with the core framework assertions per object:
 * completeness (count parity), record-map 1:1 integrity, and incremental watermark/content-hash.
 */
export async function phaseForward({ gql, db, hubspotTotal, ciid, maps, cfg }) {
    const steps = [];

    // P1: full pull (all maps).
    const full = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    const fullProcessed = full.run?.Counts?.Processed ?? full.run?.Counts?.TotalKnown ?? null;
    steps.push(step('forward.full.run', !!full.run?.Success, {
        runID: full.runID, counts: full.run?.Counts ?? null, warnings: full.tail.warnings,
        retryEvents: full.tail.retryEvents, keysetReanchors: full.tail.keysetReanchors, exitReason: full.run?.ExitReason ?? null,
        errors: full.errors,
    }));
    // Completeness backbone (works token-free): a clean full run with ZERO failed records means the
    // connector fetched its full set and every fetched record was persisted (no silent drops). Paired
    // with the per-object record-map 1:1 below, this proves "all data synced in" without needing the
    // token to call HubSpot directly. Token mode additionally cross-checks rows vs the live API total.
    steps.push(step('forward.full.clean', full.run?.Success === true && (full.run?.Counts?.Failed ?? 0) === 0, {
        succeeded: full.run?.Counts?.Succeeded ?? null, failed: full.run?.Counts?.Failed ?? null,
        totalKnown: full.run?.Counts?.TotalKnown ?? null, errors: full.errors,
    }));

    // Per-object completeness + record-map integrity (DB-direct; the dynamic entities aren't in the
    // running MJAPI's GQL schema under skipRestart).
    for (const m of maps) {
        if (/assoc/i.test(m.sourceObjectName)) {
            // Associations: parity vs the API total isn't a single endpoint; assert rows landed + maps 1:1.
            const rows = await db.entityRowCount(m.entityName);
            const rm = await db.recordMapStats(ciid, m.entityName);
            steps.push(step('forward.assoc.populated', rows >= 0 && rm.total === rm.distinctExternal, {
                object: m.sourceObjectName, rows, recordMap: rm,
            }));
            continue;
        }
        // hubspotTotal is null in reference (token-less) mode → external parity is skipped; the
        // internal record-map 1:1 (rows == map total == distinct) is the drift-free completeness gate.
        const apiTotal = hubspotTotal ? await hubspotTotal(m.sourceObjectName) : null;
        const rows = await db.entityRowCount(m.entityName);
        const rm = await db.recordMapStats(ciid, m.entityName);
        const parity = apiTotal != null ? rows === apiTotal : null;
        const oneToOne = rm.total === rm.distinctExternal && rm.total === rows;
        steps.push(step('forward.completeness', (parity !== false) && oneToOne, {
            object: m.sourceObjectName, entity: m.entityName,
            hubspotTotal: apiTotal, destRows: rows, recordMap: rm,
            countParity: parity, recordMapOneToOne: oneToOne,
        }));
    }

    // P2: immediate incremental — the watermark + content-hash must make this do strictly LESS work
    // than the full pull (the whole efficiency claim). REAL assertion (was previously a no-op true):
    // incremental must process fewer records than the full re-fetch. On an empty portal (full
    // processed 0) there is nothing to narrow, so that degenerate case passes.
    // NOTE: IntegrationRunCountsOutput exposes only {Processed, Succeeded, Failed, Skipped, TotalKnown}
    // — there is no Updated/Created field, so we gate on Processed (work done), not a write delta.
    const incr = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    const incrProcessed = incr.run?.Counts?.Processed ?? 0;
    const incrSucceeded = incr.run?.Counts?.Succeeded ?? 0;
    // "Did the 2nd sync do no REDUNDANT work?" has TWO valid forms, and the conventions credit both:
    //  (a) WATERMARK narrowing — a stream with an IncrementalWatermarkField fetches FEWER records
    //      (incrProcessed < fullProcessed); on the degenerate empty-portal case there's nothing to narrow.
    //  (b) CONTENT-HASH idempotency — an insert-only / no-watermark stream legitimately RE-fetches the
    //      same set but WRITES NOTHING on unchanged data (incrSucceeded === 0). PropFuel's opens/clicks
    //      declare no watermark by design, so this is the correct axis for them (see connector-test-conventions §3.1).
    // Either one proves the incremental pass landed no redundant rows.
    const narrowed = (fullProcessed == null || fullProcessed === 0)
        ? true
        : (incrProcessed < fullProcessed || incrSucceeded === 0);
    steps.push(step('forward.incremental.narrowed', narrowed, {
        runID: incr.runID, fullProcessed, incrProcessed, incrSucceeded,
        mode: incrProcessed < fullProcessed ? 'watermark-narrowed' : (incrSucceeded === 0 ? 'content-hash-skip' : 'NEITHER'),
        counts: incr.run?.Counts ?? null,
        note: 'incremental must either narrow the fetch (watermark) OR write nothing on unchanged data (content-hash)',
    }));

    return steps;
}

/**
 * P4 — backward CRUD round-trip via single-record writes (most surgical, fully cleanup-controlled).
 * Creates a test-marked record, updates it, verifies it round-trips on pull, then the caller's
 * teardown deletes it. GATED: only runs when allowWrite=true. NEVER touches Users.
 */
export async function phaseBackwardCRUD({ gql, ciid, cfg, createdSink }) {
    const steps = [];
    const objectName = cfg.writeObject ?? 'contacts';
    if (/user|owner/i.test(objectName)) throw new Error(`refusing to write to '${objectName}' — Users/owners are off-limits`);

    // CREATE. Cleanup is by the captured ExternalID (createdSink), NOT a custom HubSpot property —
    // unknown properties are rejected on create. cfg.writeAttributes bakes a recognizable value into a
    // STANDARD field (e.g. a unique runId-stamped email for contacts) purely for human traceability.
    const attrs = { ...(cfg.writeAttributes ?? {}) };
    const created = expectGqlSuccess('WriteRecord(create)',
        (await gql(GQL.writeRecord, { ciid, objectName, operation: 'create', externalID: null, attributes: JSON.stringify(attrs) })).IntegrationWriteRecord);
    const extID = created.ExternalID;
    if (extID) createdSink.push({ objectName, externalID: extID }); // track for guaranteed exact cleanup
    steps.push(step('backward.create', !!created.Success && !!extID, {
        object: objectName, externalID: extID, statusCode: created.StatusCode,
        // A success with no id means a record was created in the portal that we cannot clean up by id.
        ...(created.Success && !extID
            ? { orphanWarning: 'CREATE succeeded but returned no ExternalID — a record may be orphaned in the portal; manual cleanup required' }
            : {}),
    }));
    if (created.Success && !extID) return steps; // cannot update/clean an unidentifiable record — stop here, loudly

    // UPDATE
    if (extID) {
        const upd = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'update', externalID: extID,
            attributes: JSON.stringify({ ...(cfg.writeUpdateAttributes ?? {}) }),
        })).IntegrationWriteRecord;
        steps.push(step('backward.update', !!upd?.Success, { externalID: extID, statusCode: upd?.StatusCode, message: upd?.Message }));
    }
    return steps;
}

/**
 * P6 — teardown. Always deletes every test-created external record (cleanup discipline) and the entity
 * maps this run created. In REFERENCE mode the pre-seeded connection + ENCRYPTED credential are
 * preserved (we didn't create them and must not destroy the reusable, never-readable credential); only
 * TOKEN mode (where we created the connection) tears the connection + credential down. Always runs
 * (caller invokes in finally).
 */
export async function phaseTeardown({ gql, db, ciid, mapIDs, credentialID, createdSink, referenceMode }) {
    const steps = [];
    // 1) delete created HubSpot records (needs the live connection) — exact, captured-id set only.
    for (const rec of createdSink) {
        try {
            const del = (await gql(GQL.writeRecord, { ciid, objectName: rec.objectName, operation: 'delete', externalID: rec.externalID, attributes: null })).IntegrationWriteRecord;
            steps.push(step('teardown.delete-external', !!del?.Success, { ...rec, statusCode: del?.StatusCode }));
        } catch (e) {
            steps.push(step('teardown.delete-external', false, { ...rec, error: String(e?.message ?? e) }));
        }
    }
    // 2) entity maps we created this run (cascade field maps/watermarks/record maps).
    if (mapIDs?.length) {
        try {
            const dm = (await gql(GQL.deleteEntityMaps, { ids: mapIDs })).IntegrationDeleteEntityMaps;
            steps.push(step('teardown.delete-entity-maps', !!dm?.Success, { count: mapIDs.length, message: dm?.Message }));
        } catch (e) { steps.push(step('teardown.delete-entity-maps', false, { error: String(e?.message ?? e) })); }
    }
    // 3) connection + 4) credential — ONLY when we created them (token mode). Reference mode leaves the
    // pre-seeded connection + encrypted credential intact for reuse (the whole point of "use, never read").
    if (!referenceMode && ciid) {
        try {
            const dc = (await gql(GQL.deleteConnection, { ciid, deleteData: false })).IntegrationDeleteConnection;
            steps.push(step('teardown.delete-connection', !!dc?.Success, { entityMapsDeleted: dc?.EntityMapsDeleted, fieldMapsDeleted: dc?.FieldMapsDeleted }));
        } catch (e) { steps.push(step('teardown.delete-connection', false, { error: String(e?.message ?? e) })); }
        if (credentialID && db.deleteCredential) {
            try { await db.deleteCredential(credentialID); steps.push(step('teardown.delete-credential', true, { credentialID })); }
            catch (e) { steps.push(step('teardown.delete-credential', false, { credentialID, error: String(e?.message ?? e) })); }
        }
    } else if (referenceMode) {
        steps.push(step('teardown.connection-preserved', true, { ciid, note: 'reference mode — pre-seeded connection + encrypted credential left intact for reuse' }));
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level orchestration (IO injected → unit-testable with mocks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} io  { gql(query,vars), db (entityRowCount/recordMapStats/deleteCredential/close), hubspotTotal(objectName) }
 * @param {object} cfg { runId, platform, companyID, integrationID, credentialTypeID, token, objects[], maxPolls?, ... }
 * @param {boolean} allowWrite  gate for the backward/CRUD phases (broker-enforced upstream)
 */
export async function runLiveTest({ gql, db, hubspotTotal }, cfg, allowWrite) {
    const result = { ok: false, platform: cfg.platform, runId: cfg.runId, steps: {} };
    const createdSink = [];
    let setup = null;
    try {
        setup = await phaseSetup({ gql, cfg });
        result.steps.setup = step('setup', true, {
            ciid: setup.ciid, mapCount: setup.maps.length,
            maps: setup.maps.map(m => ({ object: m.sourceObjectName, entity: m.entityName, fieldMaps: m.fieldMapCount })),
            connectionTest: setup.connectionTest,
        });

        result.steps.forward = await phaseForward({ gql, db, hubspotTotal, ciid: setup.ciid, maps: setup.maps, cfg });

        if (allowWrite) {
            result.steps.backward = await phaseBackwardCRUD({ gql, ciid: setup.ciid, cfg, createdSink });
        } else {
            result.steps.backward = [step('backward.skipped', true, { reason: 'allowWrite=false (read-only run)' })];
        }
        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (setup) {
            try {
                result.steps.teardown = await phaseTeardown({
                    gql, db, ciid: setup.ciid, mapIDs: setup.maps.map(m => m.entityMapID),
                    credentialID: setup.credentialID, createdSink, referenceMode: setup.referenceMode,
                });
            } catch (e) { result.steps.teardown = [step('teardown', false, { error: String(e?.message ?? e) })]; }
        }
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        // Final verdict AFTER teardown: a failed cleanup (orphaned records/maps/connection/credential)
        // must turn the run red, not pass silently. Folds every phase incl. teardown + the error path.
        result.ok = !result.error && allStepsOk(result.steps);
    }
}

/** A run is ok only if every recorded step is ok (across all phases). */
export function allStepsOk(steps) {
    for (const v of Object.values(steps)) {
        const arr = Array.isArray(v) ? v : [v];
        for (const s of arr) if (s && s.ok === false) return false;
    }
    return true;
}
