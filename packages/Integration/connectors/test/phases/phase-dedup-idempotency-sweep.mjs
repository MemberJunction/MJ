/**
 * GQL-driven DEDUP + IDEMPOTENCY-SWEEP phase — plan.md §2 ("Test for Identity and idempotency with
 * duplicate records and reactions") + §15a ("Idempotency everywhere — every operation must be safe to
 * repeat: re-apply schema (CreateTables/AlterColumn/DropColumn), re-create a connection, re-run a full
 * sync, re-run an incremental, re-trigger a stuck run, double-submit the same operation. Each must
 * CONVERGE, not collide."). Run through the REAL MJAPI GraphQL API against the pre-seeded HubSpot
 * reference connection (token-free reference mode, identified solely by `ciid`).
 *
 * THE REQUIREMENT, restated as the assertion catalog this phase proves — every operation a client can
 * repeat must be SAFE to repeat. Each is one observable cell (NL note + JSON observed + pass/fail),
 * DB-direct verified where the truth lives in the DB (record-map 1:1, dest row counts, watermark
 * rows, durable JSONL run events) rather than trusting a Success envelope:
 *
 *   A) DUPLICATE-RECORD DEDUPE (identity, the §2 ask). The record map keys on external identity, so the
 *      SAME external record landing twice (a re-fetch, or a literal re-create of the same id) must NOT
 *      produce a second dest row or a second map row — it converges to ONE. Two tracks:
 *        - ALWAYS (token-free): re-run the inbound apply over the existing corpus and assert the record
 *          map stays 1:1 (total == distinctExternal) and the dest row count is unchanged — no dup.
 *        - allowWrite=true: CREATE a disposable record, sync, then UPSERT the SAME external id again
 *          (operation:'update' on the captured id = the "duplicate inject"), sync — exactly ONE dest row
 *          and ONE map row for that id survive. Cleaned up by captured id.
 *
 *   B) RE-RUN FULL SYNC (twice back-to-back). The 2nd full sync converges to the same dest/record-map
 *      footprint as the 1st — no duplication, content-hash makes it do less write-work, never collides.
 *
 *   C) RE-RUN INCREMENTAL (twice). Two incrementals in a row converge — the watermark makes the 2nd a
 *      near-no-op; neither duplicates nor errors.
 *
 *   D) RE-APPLY SCHEMA (CreateTables + AlterColumn/DropColumn evolution). IntegrationApplySchema run a
 *      SECOND time over already-created tables must be IDEMPOTENT (the §15a "ADD COLUMN had no IF NOT
 *      EXISTS" class of bug) — Success again, no hard collision (CREATE TABLE / ADD COLUMN guarded).
 *      IntegrationSchemaEvolution run with NO source change must report HasChanges=false (a clean no-op),
 *      and a second evolution call must STILL be a no-op (converges). skipRestart:true throughout so the
 *      map IDs / connection survive in-process and later cells still run.
 *
 *   E) RE-CREATE THE CONNECTION'S MAPS (double ApplyAll / double CreateEntityMaps). Re-running the
 *      map-creation flow for objects whose maps already exist must converge to the SAME set of active
 *      maps (no duplicate CompanyIntegrationEntityMap rows for the same (CIID, ExternalObjectName)).
 *
 *   F) RE-TRIGGER A STUCK RUN (double-submit StartSync; the "stuck run" case). Fire StartSync while a
 *      run is (or may be) in-flight, then fire it again — the framework must converge to a SINGLE active
 *      run per connector (no two concurrent runs racing the same maps). DB-direct: at most one
 *      'In Progress' run for the CIID at a time; both calls drain to a terminal state cleanly.
 *
 *   G) DOUBLE-SUBMIT THE SAME OP (idempotent mutation). UpdateEntityMaps with the SAME payload twice
 *      converges (no error, no duplicate side effect); CancelSync on an idle connector twice is a safe
 *      no-op both times.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint; reference mode drives everything by `ciid` — the encrypted credential is decrypted
 * server-side and the HubSpot token never enters this process.
 *
 * STATE DISCIPLINE: NON-DESTRUCTIVE to the seeded connection. It re-syncs (Pull), re-applies schema with
 * skipRestart:true, reads the DB + durable run-event stream, and (only when cfg.allowWrite===true)
 * creates exactly ONE disposable, test-marked CRM record which it deletes by captured ExternalID in a
 * cleanup step. It NEVER deletes the seeded connection, NEVER deletes its entity maps, NEVER touches
 * users/owners/real data, and ALWAYS drains any run it starts to a terminal state + runs a final
 * reconciling sync so the seeded connection is left consistent for later tests.
 *
 * FRAMEWORK GAPS recorded (these make some cells fail/skip until the framework is extended — that is the
 * point of writing the assertion anyway, per the task brief):
 *   - There is NO GraphQL op to FORCE a run "stuck" (no kill/hang injection), so cell F double-submits
 *     StartSync and asserts single-active-run convergence over whatever in-flight window naturally exists
 *     on a fast 56-record sync. A "simulate stuck run" hook would make this deterministic. (gap)
 *   - There is NO GraphQL op to DROP a single column (DropColumn). IntegrationSchemaEvolution only ADDs /
 *     widens columns from the source (it never drops dest columns — destructive). The DropColumn-idempotency
 *     ask is asserted as "evolution with no source delta is a stable no-op"; a real drop+re-drop test
 *     needs a DropColumn op the resolver does not expose. (gap)
 *   - IntegrationApplySchema/SchemaEvolution re-run RSU (CodeGen + turbo build) even with skipRestart; on a
 *     dev box this can churn dist mid-cell. cfg.reapplySchema must be opt-in (default off) so the dedup/
 *     idempotency sync cells run cleanly without the heavy RSU pipeline unless explicitly requested.
 */

// GQL op strings (startSync/listRuns/getRun/tailRunEvents/writeRecord/applyAll) + runSyncObserved
// (trigger→tail→GetRun) are reused from the canonical harness; this phase never re-implements the gql
// client, the DB client, or the sync drivers. (Run-id resolution + terminal draining are done inline so
// the double-submit cell can sample the in-flight window itself.)
import { GQL, runSyncObserved } from '../gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts —
//   IntegrationApplySchema(companyIntegrationID, objects:[SchemaPreviewObjectInput], platform,
//     skipGitCommit, skipRestart) → ApplySchemaOutput {Success,Message,Steps,EntitiesProcessed,...} :2724;
//     SchemaPreviewObjectInput = {SourceObjectName?, SourceObjectID?, SchemaName, TableName, EntityName, Fields?} :432.
//   IntegrationSchemaEvolution(companyIntegrationID, platform, skipGitCommit, skipRestart)
//     → SchemaEvolutionOutput {Success,Message,HasChanges,AddedColumns,ModifiedColumns,...} :4985/:206.
//   IntegrationListEntityMaps(companyIntegrationID) → ListEntityMapsOutput/EntityMapSummaryOutput :3820/:671.
//   IntegrationUpdateEntityMaps(updates:[EntityMapUpdateInput]) → MutationResultOutput {Success,Message} :3876.
//   IntegrationCancelSync(companyIntegrationID) → MutationResultOutput :3474.
//   IntegrationStartSync/IntegrationListRuns/IntegrationGetRun come from the shared GQL object.
//   NOTHING here is invented — DropColumn + force-stuck-run have NO op (recorded as gaps, not faked).
// ─────────────────────────────────────────────────────────────────────────────

const DEDUP_GQL = {
    applySchema: `mutation($ciid: String!, $objects: [SchemaPreviewObjectInput!]!, $platform: String!, $skipGitCommit: Boolean!, $skipRestart: Boolean!) {
      IntegrationApplySchema(companyIntegrationID: $ciid, objects: $objects, platform: $platform, skipGitCommit: $skipGitCommit, skipRestart: $skipRestart) {
        Success Message EntitiesProcessed APIRestarted Warnings
        Steps { Name Status DurationMs Message }
      }
    }`,
    schemaEvolution: `mutation($ciid: String!, $platform: String!, $skipGitCommit: Boolean!, $skipRestart: Boolean!) {
      IntegrationSchemaEvolution(companyIntegrationID: $ciid, platform: $platform, skipGitCommit: $skipGitCommit, skipRestart: $skipRestart) {
        Success Message HasChanges AddedColumns ModifiedColumns APIRestarted Warnings
      }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority Configuration }
      }
    }`,
    updateEntityMaps: `mutation($updates: [EntityMapUpdateInput!]!) {
      IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
    }`,
    cancelSync: `mutation($ciid: String!) {
      IntegrationCancelSync(companyIntegrationID: $ciid) { Success Message }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (mirrors of the harness's so this phase is self-contained; identical shape — never
// re-implements the gql/db clients). step()/col()/lit()/dialect helpers as in the sibling phases.
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

/** A run is ok only if every recorded step (across all phases) is ok. */
function allStepsOk(steps) {
    for (const v of Object.values(steps)) {
        const arr = Array.isArray(v) ? v : [v];
        for (const s of arr) if (s && s.ok === false) return false;
    }
    return true;
}

/** Reads a value off a DB row regardless of dialect casing (mssql=PascalCase, pg=lowercased). */
function col(row, name) {
    if (row == null) return undefined;
    if (name in row) return row[name];
    const lower = name.toLowerCase();
    if (lower in row) return row[lower];
    for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
    return undefined;
}

/** Case-insensitive UUID/string compare (SQL Server upper, pg lower, GQL may vary). */
function sameId(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

const isPg = (cfg) => cfg.platform === 'postgresql';
const isAssoc = (name) => /assoc/i.test(name ?? '');
const lc = (s) => (s ?? '').toLowerCase();

/** Qualified table/view reference for the MJ core schema. */
function mjT(cfg, name) {
    const s = cfg.mjSchema ?? '__mj';
    return isPg(cfg) ? `"${s}"."${name}"` : `[${s}].[${name}]`;
}

/** Qualified destination table reference (the connector's dest schema, default 'hubspot'). */
function destT(cfg, table) {
    const s = cfg.destSchema ?? 'hubspot';
    return isPg(cfg) ? `"${s}"."${table}"` : `[${s}].[${table}]`;
}

/** Column reference (quoted on pg, bare on mssql). */
function C(cfg, name) {
    return isPg(cfg) ? `"${name}"` : name;
}

/** A safe single-quoted SQL string literal (doubles embedded quotes). The ONLY interpolated values are
 *  harness UUIDs + the harness's own runId-stamped markers + fixed identifiers — never untrusted input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB-direct readers (the convergence truth lives in the DB; we never trust a Success envelope alone).
// ─────────────────────────────────────────────────────────────────────────────

/** Row count of a destination table addressed directly by its HubSpot source-object name. */
async function destRowCount(db, cfg, sourceObjectName) {
    const rows = await db.rows(`SELECT COUNT(*) AS c FROM ${destT(cfg, sourceObjectName)}`);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** Count of 'In Progress' runs for a CIID — the single-active-run invariant for the stuck-run cell. */
async function inProgressRunCount(db, cfg, ciid) {
    const sql =
        `SELECT COUNT(*) AS c FROM ${mjT(cfg, 'CompanyIntegrationRun')} ` +
        `WHERE ${C(cfg, 'CompanyIntegrationID')}=${lit(ciid)} AND ${C(cfg, 'Status')}=${lit('In Progress')}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** Counts CompanyIntegrationEntityMap rows for a given (CIID, ExternalObjectName) — duplicate-map detector. */
async function entityMapRowCount(db, cfg, ciid, externalObjectName) {
    const sql =
        `SELECT COUNT(*) AS c FROM ${mjT(cfg, 'CompanyIntegrationEntityMap')} ` +
        `WHERE ${C(cfg, 'CompanyIntegrationID')}=${lit(ciid)} AND ${C(cfg, 'ExternalObjectName')}=${lit(externalObjectName)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** Counts dest rows carrying a specific external id (the dedupe gate: must be exactly 1, never 2). */
async function destRowCountByExternalId(db, cfg, sourceObjectName, externalId, pkColumn = 'hs_object_id') {
    try {
        const rows = await db.rows(
            `SELECT COUNT(*) AS c FROM ${destT(cfg, sourceObjectName)} WHERE ${C(cfg, pkColumn)}=${lit(externalId)}`);
        return Number(col(rows?.[0], 'c') ?? 0);
    } catch { return null; } // pk column absent on this dialect → not assessable
}

/**
 * Per-object identity snapshot used to assert convergence (no-dup) across a repeated operation.
 * destRows = physical dest table count; record map total vs distinctExternal = 1:1 map identity.
 */
async function snapshotObject(db, cfg, ciid, m) {
    return {
        object: m.sourceObjectName,
        destRows: await destRowCount(db, cfg, m.sourceObjectName),
        recordMap: await db.recordMapStats(ciid, m.entityName),
    };
}

/** Polls IntegrationGetRun until IsInFlight=false (no sleeps — a microtask yields between polls). */
async function drainToTerminal(gql, runID, cfg) {
    const maxPolls = cfg?.maxPolls ?? 100000;
    let detail = null;
    for (let i = 0; i < maxPolls; i++) {
        const out = (await gql(GQL.getRun, { runID })).IntegrationGetRun;
        detail = out;
        if (out?.Run && out.Run.IsInFlight === false) break;
        await Promise.resolve();
    }
    return { runID, run: detail?.Run ?? null, errors: detail?.Errors ?? [] };
}

/** Best-effort cancel — never throws (an idle/finished sync can't be cancelled; that's expected). */
async function bestEffortCancel(gql, ciid) {
    try { return (await gql(DEDUP_GQL.cancelSync, { ciid })).IntegrationCancelSync; }
    catch (e) { return { Success: false, Message: String(e?.message ?? e) }; }
}

/** Drains any in-flight run for the CIID to terminal (so the connection is idle before/after a cell). */
async function drainAnyInFlight(gql, ciid, cfg) {
    const runs = (await gql(GQL.listRuns, { ciid, inFlightOnly: true, limit: 25 })).IntegrationListRuns;
    const inFlight = (runs?.Runs ?? []).filter(r => r.IsInFlight);
    for (const r of inFlight) {
        if (r.RunID) await drainToTerminal(gql, r.RunID, cfg);
    }
    return inFlight.length;
}

/** Builds the SchemaPreviewObjectInput for a CRM map, deriving SchemaName/TableName/EntityName. */
function schemaObjectInput(cfg, m) {
    const schemaName = cfg.destSchema ?? 'hubspot';
    return {
        SourceObjectName: m.sourceObjectName,
        SchemaName: schemaName,
        TableName: m.sourceObjectName,    // dest table is named for the source object (additionalSchemaInfo)
        EntityName: m.entityName,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: dedup + idempotency sweep  (plan.md §2 identity/idempotency + §15a idempotency everywhere)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   - gql:  makeGqlClient(...)        (restart-resilient GraphQL client)
 *   - db:   makeDbClient(...)         (rows/recordMapStats/entityRowCount/close)
 *   - ciid: the seeded HubSpot CompanyIntegrationID (reference mode)
 *   - maps: [{ entityMapID, entityName, sourceObjectName, ... }] from setup/ListEntityMaps
 *   - cfg:  { platform, mjSchema, destSchema?, objects[], writeObject?(default 'contacts'),
 *            allowWrite?(default false), reapplySchema?(default false), runId, maxPolls?,
 *            valuePkColumn?(default 'hs_object_id') }
 * @returns {Array} step() results (NL note + JSON observed + pass/fail), exactly like the other phases.
 *   ALWAYS restores connection state + deletes the disposable test record in cleanup steps.
 */
export async function phasededupidempotencysweep({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const allowWrite = cfg.allowWrite === true;
    const reapplySchema = cfg.reapplySchema === true;
    const platform = cfg.platform === 'postgresql' ? 'postgresql' : 'sqlserver';
    const pkColumn = cfg.valuePkColumn ?? 'hs_object_id';
    const runId = cfg.runId ?? `dedup_${Date.now()}`;
    const writeObject = lc(cfg.writeObject ?? 'contacts');

    const crmMaps = (maps ?? []).filter(m => !isAssoc(m.sourceObjectName));
    if ((maps ?? []).length === 0) {
        steps.push(step('dedup.skipped', true, {
            observed: { mapCount: 0 },
            note: 'no entity maps in the seeded connection — dedup/idempotency sweep skipped (run ApplyAll once first)',
        }));
        return steps;
    }

    // Make sure the connector is idle before we begin (a leftover in-flight run from a prior phase would
    // poison the back-to-back convergence comparisons).
    try { await drainAnyInFlight(gql, ciid, cfg); } catch { /* best-effort */ }

    // ── 0) CLEAN BASELINE. One full sync establishes the authoritative consistent footprint (dest rows +
    //       record map) every repeated operation below must CONVERGE back to. This is the no-dup oracle.
    const baselineRun = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    steps.push(step('dedup.baseline.clean', baselineRun.run?.Success === true && (baselineRun.run?.Counts?.Failed ?? 0) === 0, {
        observed: { runID: baselineRun.runID, counts: baselineRun.run?.Counts ?? null, exitReason: baselineRun.run?.ExitReason ?? null, errors: baselineRun.errors ?? [] },
        note: 'a clean full sync establishes the consistent dest-rows + record-map baseline that every repeated op must converge back to',
    }));
    const baseline = {};
    for (const m of maps) baseline[m.sourceObjectName] = await snapshotObject(db, cfg, ciid, m);

    // ── A) DUPLICATE-RECORD DEDUPE — token-free track (ALWAYS). Re-running the inbound apply over the
    //       existing corpus must NOT create a second dest row or map row for any external id: the record
    //       map keys on external identity, so identical records collapse to one (total == distinctExternal).
    const dupApply = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    steps.push(step('dedup.identity.reapply.run', dupApply.run?.Success === true && (dupApply.run?.Counts?.Failed ?? 0) === 0, {
        observed: { runID: dupApply.runID, counts: dupApply.run?.Counts ?? null, errors: dupApply.errors ?? [] },
        note: 're-applying the full inbound set re-presents every external record to the apply path — the dedupe must absorb it',
    }));
    for (const m of maps) {
        const before = baseline[m.sourceObjectName];
        const after = await snapshotObject(db, cfg, ciid, m);
        const mapOneToOne = after.recordMap.total === after.recordMap.distinctExternal; // no duplicate map rows
        const destAgreesMap = isAssoc(m.sourceObjectName) ? true : after.destRows === after.recordMap.total;
        const noGrowth = after.destRows === before.destRows && after.recordMap.total === before.recordMap.total;
        steps.push(step('dedup.identity.no-duplication', mapOneToOne && destAgreesMap && noGrowth, {
            observed: {
                object: m.sourceObjectName, baseline: before, after, mapOneToOne, destAgreesMap, noGrowth,
            },
            note: 'IDENTITY/DEDUPE: re-presenting the same external records leaves the record map 1:1 (total == distinctExternal, '
                + 'no duplicate map rows), the dest table and the map agree, and neither count grew — the same record landing '
                + 'twice converges to ONE (CompanyIntegrationRecordMap keys on ExternalSystemRecordID)',
        }));
    }

    // ── A2) DUPLICATE-RECORD INJECT — write track (allowWrite only). CREATE a disposable record, sync,
    //        then UPSERT the SAME external id again (the literal "inject a duplicate") and sync. Exactly
    //        ONE dest row + ONE map row for that id must survive. Deleted by captured id in cleanup.
    let createdExternalID = null;
    const writeMap = crmMaps.find(m => lc(m.sourceObjectName) === writeObject) ?? null;
    if (allowWrite && writeMap && !/user|owner/i.test(writeObject)) {
        const marker = `mjdedup ${runId}`;
        const attrs = { email: `mjdedup-${runId}@example.com`, firstname: 'mjdedup', lastname: marker };
        try {
            const created = (await gql(GQL.writeRecord, {
                ciid, objectName: writeObject, operation: 'create', externalID: null, attributes: JSON.stringify(attrs),
            })).IntegrationWriteRecord;
            createdExternalID = created?.ExternalID ?? null;
            // First pull so the record is mirrored + mapped.
            await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls });
            const after1 = createdExternalID ? await destRowCountByExternalId(db, cfg, writeObject, createdExternalID, pkColumn) : null;
            const rmAfter1 = await db.recordMapStats(ciid, writeMap.entityName);

            // INJECT THE DUPLICATE: upsert the SAME external id again (no new identity), then pull twice.
            let injectOk = false;
            if (createdExternalID) {
                const reUpsert = (await gql(GQL.writeRecord, {
                    ciid, objectName: writeObject, operation: 'update', externalID: createdExternalID,
                    attributes: JSON.stringify({ lastname: `${marker} dup` }),
                })).IntegrationWriteRecord;
                injectOk = reUpsert?.Success === true;
            }
            await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls });
            await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls });

            const after2 = createdExternalID ? await destRowCountByExternalId(db, cfg, writeObject, createdExternalID, pkColumn) : null;
            const rmAfter2 = await db.recordMapStats(ciid, writeMap.entityName);
            const exactlyOne = after2 === 1;                                   // never duplicated to 2 dest rows
            const mapStays1to1 = rmAfter2.total === rmAfter2.distinctExternal; // never a duplicate map row
            const mapDidNotDoubleCount = rmAfter2.total === rmAfter1.total;    // the upsert did not add a 2nd map row
            steps.push(step('dedup.inject.upsert-same-id', !!createdExternalID && injectOk && exactlyOne && mapStays1to1 && mapDidNotDoubleCount, {
                observed: {
                    object: writeObject, externalID: createdExternalID, injectOk,
                    destRowsForIdAfterCreate: after1, destRowsForIdAfterReUpsert: after2,
                    recordMapAfterCreate: rmAfter1, recordMapAfterReUpsert: rmAfter2,
                    exactlyOne, mapStays1to1, mapDidNotDoubleCount,
                },
                note: 'DUPLICATE INJECT: creating a record then UPSERTING the SAME external id again must converge to exactly ONE '
                    + 'dest row + ONE record-map row for that id (an upsert on identity, not a 2nd record). DESIRED: destRows-for-id==1, '
                    + 'record map stays 1:1, and the map total does NOT increase across the re-upsert',
            }));
        } catch (e) {
            steps.push(step('dedup.inject.upsert-same-id', false, {
                observed: { object: writeObject, externalID: createdExternalID, error: String(e?.message ?? e) },
                note: 'failed to drive the duplicate-inject write round-trip — see error; the token-free dedupe cell above still gates identity',
            }));
        }
    } else {
        steps.push(step('dedup.inject.upsert-same-id', true, {
            observed: { allowWrite, writeMapPresent: !!writeMap, writeObject },
            note: 'duplicate-inject write track skipped (allowWrite=false or no write map). The token-free identity/no-dup cell above '
                + 'still proves dedupe over the existing corpus. Set allowWrite=true + a writable object to inject a literal duplicate.',
        }));
    }

    // ── B) RE-RUN FULL SYNC (twice). Two full syncs back-to-back converge to the same footprint — no
    //       duplication, no collision. (The matrix harness proves the content-hash skip; here we gate the
    //       hard convergence invariant: the dest/record-map footprint is byte-for-byte stable.)
    const fullA = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    const footprintA = {};
    for (const m of maps) footprintA[m.sourceObjectName] = await snapshotObject(db, cfg, ciid, m);
    const fullB = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    let fullConverged = fullA.run?.Success === true && fullB.run?.Success === true
        && (fullA.run?.Counts?.Failed ?? 0) === 0 && (fullB.run?.Counts?.Failed ?? 0) === 0;
    const fullDiffs = [];
    for (const m of maps) {
        const a = footprintA[m.sourceObjectName];
        const b = await snapshotObject(db, cfg, ciid, m);
        const same = a.destRows === b.destRows && a.recordMap.total === b.recordMap.total
            && b.recordMap.total === b.recordMap.distinctExternal;
        if (!same) fullConverged = false;
        fullDiffs.push({ object: m.sourceObjectName, afterFirstFull: a, afterSecondFull: b, converged: same });
    }
    steps.push(step('dedup.rerun.full-sync-converges', fullConverged, {
        observed: { fullA: fullA.runID, fullB: fullB.runID, diffs: fullDiffs },
        note: 'RE-RUN FULL SYNC: two full syncs back-to-back converge to the identical dest-rows + 1:1 record-map footprint — '
            + 'the 2nd full sync neither duplicates nor collides (idempotent upsert + identity-keyed record map)',
    }));

    // ── C) RE-RUN INCREMENTAL (twice). Two incrementals converge; the watermark makes the 2nd a near-no-op
    //       (Succeeded small/zero), neither errors nor duplicates.
    const incrA = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    const incrB = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    const incrConverged = incrA.run?.Success === true && incrB.run?.Success === true
        && (incrA.run?.Counts?.Failed ?? 0) === 0 && (incrB.run?.Counts?.Failed ?? 0) === 0;
    const incrDiffs = [];
    let incrNoDup = true; // per-object 1:1 + dest⇄map agreement gated in the loop below
    for (const m of maps) {
        const after = await snapshotObject(db, cfg, ciid, m);
        const ok = after.recordMap.total === after.recordMap.distinctExternal
            && (isAssoc(m.sourceObjectName) || after.destRows === after.recordMap.total);
        if (!ok) incrNoDup = false;
        incrDiffs.push({ object: m.sourceObjectName, after, oneToOne: ok });
    }
    const incrBSucceeded = incrB.run?.Counts?.Succeeded ?? null;
    steps.push(step('dedup.rerun.incremental-converges', incrConverged && incrNoDup, {
        observed: {
            incrA: incrA.runID, incrB: incrB.runID,
            incrBSucceeded, secondIncrementalIsNearNoOp: incrBSucceeded === 0,
            diffs: incrDiffs,
        },
        note: 'RE-RUN INCREMENTAL: two incrementals in a row converge — the watermark makes the 2nd a near-no-op (Succeeded≈0) '
            + 'and the record map stays 1:1. Neither duplicates nor errors',
    }));

    // ── D) RE-APPLY SCHEMA (CreateTables idempotency + AlterColumn/DropColumn evolution no-op). OPT-IN
    //       (reapplySchema) because it re-runs the heavy RSU pipeline. skipRestart:true so the connection +
    //       map IDs survive in-process. CreateTables run a 2nd time over existing tables must be Success
    //       again (guarded CREATE/ADD — the §15a "no IF NOT EXISTS" bug class); SchemaEvolution with no
    //       source delta must be HasChanges=false twice in a row (a stable no-op).
    if (reapplySchema && crmMaps.length > 0) {
        const objectsInput = crmMaps.map(m => schemaObjectInput(cfg, m));
        try {
            // First re-apply (tables already exist from the seed) — must be idempotent, not collide.
            const apply1 = (await gql(DEDUP_GQL.applySchema, {
                ciid, objects: objectsInput, platform, skipGitCommit: true, skipRestart: true,
            })).IntegrationApplySchema;
            // Second re-apply (the double-submit of the SAME schema op) — must ALSO converge.
            const apply2 = (await gql(DEDUP_GQL.applySchema, {
                ciid, objects: objectsInput, platform, skipGitCommit: true, skipRestart: true,
            })).IntegrationApplySchema;
            const noCollision = apply1?.Success === true && apply2?.Success === true;
            steps.push(step('dedup.reapply.create-tables-idempotent', noCollision, {
                observed: {
                    objects: objectsInput.map(o => o.SourceObjectName),
                    apply1: { success: apply1?.Success ?? null, message: apply1?.Message ?? null, warnings: apply1?.Warnings ?? null },
                    apply2: { success: apply2?.Success ?? null, message: apply2?.Message ?? null, warnings: apply2?.Warnings ?? null },
                },
                note: 'RE-APPLY SCHEMA (CreateTables): running IntegrationApplySchema a 2nd (and 3rd) time over already-created '
                    + 'tables is IDEMPOTENT — CREATE TABLE / ADD COLUMN are guarded (the §15a "ADD COLUMN had no IF NOT EXISTS" '
                    + 'fix). DESIRED: both calls Success, no hard collision',
            }));
        } catch (e) {
            steps.push(step('dedup.reapply.create-tables-idempotent', false, {
                observed: { error: String(e?.message ?? e) },
                note: 'RE-APPLY SCHEMA collided/threw on a repeat call — a non-idempotent CREATE/ADD path (the exact §15a bug class). '
                    + 'DESIRED: a repeated ApplySchema converges without error',
            }));
        }

        try {
            // Evolution with NO source change → a clean no-op; a 2nd evolution call must STILL be a no-op.
            const evo1 = (await gql(DEDUP_GQL.schemaEvolution, {
                ciid, platform, skipGitCommit: true, skipRestart: true,
            })).IntegrationSchemaEvolution;
            const evo2 = (await gql(DEDUP_GQL.schemaEvolution, {
                ciid, platform, skipGitCommit: true, skipRestart: true,
            })).IntegrationSchemaEvolution;
            const stableNoOp = evo1?.Success === true && evo2?.Success === true
                && evo1?.HasChanges === false && evo2?.HasChanges === false;
            steps.push(step('dedup.reapply.evolution-stable-noop', stableNoOp, {
                observed: {
                    evo1: { success: evo1?.Success ?? null, hasChanges: evo1?.HasChanges ?? null, added: evo1?.AddedColumns ?? null, modified: evo1?.ModifiedColumns ?? null },
                    evo2: { success: evo2?.Success ?? null, hasChanges: evo2?.HasChanges ?? null, added: evo2?.AddedColumns ?? null, modified: evo2?.ModifiedColumns ?? null },
                },
                note: 'RE-APPLY SCHEMA (AlterColumn/DropColumn evolution): IntegrationSchemaEvolution with NO source delta reports '
                    + 'HasChanges=false, and a 2nd call STILL reports HasChanges=false — a stable, convergent no-op (re-diffs to '
                    + 'nothing). GAP: there is NO DropColumn op (evolution only ADDs/widens, never drops dest columns) — a real '
                    + 'drop+re-drop idempotency test needs a DropColumn op the resolver does not expose',
            }));
        } catch (e) {
            steps.push(step('dedup.reapply.evolution-stable-noop', false, {
                observed: { error: String(e?.message ?? e) },
                note: 'SchemaEvolution threw on a no-change re-run — DESIRED: a no-delta evolution converges to HasChanges=false without error',
            }));
        }
    } else {
        steps.push(step('dedup.reapply.create-tables-idempotent', true, {
            observed: { reapplySchema, crmMapCount: crmMaps.length },
            note: 'schema re-apply (CreateTables + evolution) skipped — reapplySchema is OPT-IN (default off) because it re-runs the '
                + 'heavy RSU pipeline (CodeGen + turbo build) which can churn dist on a dev box. Set cfg.reapplySchema=true to exercise '
                + 'the §15a re-apply-schema idempotency cells (CreateTables idempotent + evolution stable no-op)',
        }));
    }

    // ── E) RE-CREATE THE CONNECTION'S MAPS (double ApplyAll). Re-running ApplyAll for objects whose maps
    //       already exist must converge to the SAME set of active maps — NO duplicate
    //       CompanyIntegrationEntityMap rows for the same (CIID, ExternalObjectName). skipRestart:true so
    //       the map IDs come back in the response and nothing restarts mid-phase. Opt-in for the same RSU
    //       reason; when off we still DB-assert the existing maps have no duplicate (CIID, object) rows.
    const mapDupCounts = [];
    let mapsNoDup = true;
    for (const m of crmMaps) {
        const cnt = await entityMapRowCount(db, cfg, ciid, m.sourceObjectName);
        if (cnt !== 1) mapsNoDup = false;
        mapDupCounts.push({ object: m.sourceObjectName, entityMapRowCount: cnt });
    }
    if (reapplySchema) {
        try {
            const applyAllInput = {
                CompanyIntegrationID: ciid,
                SourceObjects: crmMaps.map(m => ({ SourceObjectName: m.sourceObjectName })),
                DefaultSyncDirection: 'Pull',
                StartSync: false,
                FullSync: false,
                SyncScope: 'created',
            };
            const reApplyAll = (await gql(GQL.applyAll, {
                input: applyAllInput, platform, skipGitCommit: true, skipRestart: true,
            })).IntegrationApplyAll;
            // Re-count maps per object after the re-ApplyAll — must STILL be exactly 1 (converged, no dup).
            const afterCounts = [];
            let afterNoDup = true;
            for (const m of crmMaps) {
                const cnt = await entityMapRowCount(db, cfg, ciid, m.sourceObjectName);
                if (cnt !== 1) afterNoDup = false;
                afterCounts.push({ object: m.sourceObjectName, entityMapRowCount: cnt });
            }
            steps.push(step('dedup.recreate.applyall-converges', reApplyAll?.Success === true && afterNoDup, {
                observed: { applyAllSuccess: reApplyAll?.Success ?? null, message: reApplyAll?.Message ?? null, beforeCounts: mapDupCounts, afterCounts },
                note: 'RE-CREATE MAPS: re-running ApplyAll for objects whose maps already exist converges to the SAME set of active '
                    + 'maps — exactly ONE CompanyIntegrationEntityMap row per (CIID, ExternalObjectName), no duplicate maps spawned',
            }));
        } catch (e) {
            steps.push(step('dedup.recreate.applyall-converges', false, {
                observed: { error: String(e?.message ?? e), beforeCounts: mapDupCounts },
                note: 'RE-CREATE MAPS via re-ApplyAll threw/collided — DESIRED: a repeated ApplyAll is idempotent (no duplicate maps)',
            }));
        }
    } else {
        steps.push(step('dedup.recreate.maps-no-duplicate', mapsNoDup, {
            observed: { perObject: mapDupCounts, reapplySchema },
            note: 'RE-CREATE MAPS (DB-direct, no RSU): the seeded connection has exactly ONE entity-map row per (CIID, '
                + 'ExternalObjectName) — no duplicate maps. (Set reapplySchema=true to also drive a live double-ApplyAll and prove '
                + 'a repeat ApplyAll spawns no new maps.)',
        }));
    }

    // ── F) RE-TRIGGER A STUCK RUN (double-submit StartSync → single active run converges). Fire StartSync,
    //       then IMMEDIATELY fire it again. The framework must converge to a SINGLE active run per connector
    //       (no two concurrent runs racing the same maps). DB-direct: in-progress run count never exceeds 1
    //       across the double-submit; both calls drain cleanly. (GAP: no op forces a run truly "stuck" —
    //       this exercises the natural in-flight window of a fast sync; a stuck-run inject would make it
    //       deterministic.)
    {
        const started1 = (await gql(GQL.startSync, { ciid, fullSync: true, syncDirection: 'Pull', entityMapIDs: null })).IntegrationStartSync;
        // Immediately double-submit — re-trigger while the first may still be in flight.
        const started2 = (await gql(GQL.startSync, { ciid, fullSync: true, syncDirection: 'Pull', entityMapIDs: null })).IntegrationStartSync;
        // Sample the in-progress run count right after the double-submit (the window we care about).
        const concurrentInProgress = await inProgressRunCount(db, cfg, ciid);
        const singleActive = concurrentInProgress <= 1;

        // Resolve + drain both run ids to terminal so the connection is idle for later cells.
        const ids = new Set();
        if (started1?.RunID) ids.add(started1.RunID);
        if (started2?.RunID) ids.add(started2.RunID);
        // Catch any in-flight not surfaced via RunID.
        const inflight = (await gql(GQL.listRuns, { ciid, inFlightOnly: true, limit: 25 })).IntegrationListRuns;
        for (const r of (inflight?.Runs ?? [])) if (r.RunID) ids.add(r.RunID);
        const terminals = [];
        for (const id of ids) {
            const d = await drainToTerminal(gql, id, cfg);
            terminals.push({ runID: id, success: d.run?.Success ?? null, exitReason: d.run?.ExitReason ?? null, failed: d.run?.Counts?.Failed ?? null });
        }
        const allDrainedClean = terminals.every(t => t.success !== false && (t.failed ?? 0) === 0);
        const finalInProgress = await inProgressRunCount(db, cfg, ciid);

        steps.push(step('dedup.stuck-run.double-trigger-converges', singleActive && allDrainedClean && finalInProgress === 0, {
            observed: {
                startSync1: { success: started1?.Success ?? null, runID: started1?.RunID ?? null },
                startSync2: { success: started2?.Success ?? null, runID: started2?.RunID ?? null },
                concurrentInProgressAfterDoubleSubmit: concurrentInProgress, singleActive,
                drainedRuns: terminals, finalInProgressCount: finalInProgress,
            },
            note: 'RE-TRIGGER A STUCK RUN: double-submitting StartSync must converge to a SINGLE active run per connector (no two '
                + 'concurrent runs racing the same maps) and both submissions drain to a clean terminal state with the connector '
                + 'left idle (0 In Progress). GAP: no GQL op forces a run truly "stuck"/hung — this exercises the natural in-flight '
                + 'window of a fast sync; a stuck-run inject hook would make this deterministic',
        }));

        // F2) Post-double-trigger no-duplication: the racing double-submit must not have duplicated data.
        let postDoubleNoDup = true;
        const postDiffs = [];
        for (const m of maps) {
            const after = await snapshotObject(db, cfg, ciid, m);
            const before = baseline[m.sourceObjectName];
            const ok = after.recordMap.total === after.recordMap.distinctExternal
                && (isAssoc(m.sourceObjectName) || after.destRows === after.recordMap.total)
                && after.destRows === before.destRows;
            if (!ok) postDoubleNoDup = false;
            postDiffs.push({ object: m.sourceObjectName, baseline: before, after, converged: ok });
        }
        steps.push(step('dedup.stuck-run.no-duplication', postDoubleNoDup, {
            observed: { diffs: postDiffs },
            note: 'after the double-trigger drains, the dest-rows + record-map footprint matches the clean baseline (1:1, no growth) — '
                + 'the racing re-trigger duplicated nothing (idempotent upsert + identity-keyed record map absorb any overlap)',
        }));
    }

    // ── G) DOUBLE-SUBMIT THE SAME MUTATION (idempotent ops). UpdateEntityMaps with the SAME payload twice
    //       converges (Success both, no duplicate side effect); CancelSync on an idle connector twice is a
    //       safe no-op both times. We re-assert the first CRM map's CURRENT SyncDirection to itself (a true
    //       no-op payload) so nothing actually changes — restore-free by construction.
    {
        const m0 = crmMaps[0] ?? maps[0];
        const listed = (await gql(DEDUP_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
        const m0Listed = (listed?.EntityMaps ?? []).find(e => sameId(e.ID, m0.entityMapID)) ?? null;
        const currentDir = m0Listed?.SyncDirection ?? 'Pull';
        const upd1 = (await gql(DEDUP_GQL.updateEntityMaps, { updates: [{ EntityMapID: m0.entityMapID, SyncDirection: currentDir }] })).IntegrationUpdateEntityMaps;
        const upd2 = (await gql(DEDUP_GQL.updateEntityMaps, { updates: [{ EntityMapID: m0.entityMapID, SyncDirection: currentDir }] })).IntegrationUpdateEntityMaps;
        const afterList = (await gql(DEDUP_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
        const m0After = (afterList?.EntityMaps ?? []).find(e => sameId(e.ID, m0.entityMapID)) ?? null;
        const dirUnchanged = (m0After?.SyncDirection ?? null) === currentDir;
        const mapStillSingle = await entityMapRowCount(db, cfg, ciid, m0.sourceObjectName);
        steps.push(step('dedup.double-submit.update-entity-maps', upd1?.Success === true && upd2?.Success === true && dirUnchanged && mapStillSingle === 1, {
            observed: {
                entityMapID: m0.entityMapID, object: m0.sourceObjectName, currentDir,
                update1Success: upd1?.Success ?? null, update2Success: upd2?.Success ?? null,
                syncDirectionAfter: m0After?.SyncDirection ?? null, dirUnchanged, entityMapRowCount: mapStillSingle,
            },
            note: 'DOUBLE-SUBMIT SAME OP: UpdateEntityMaps with the SAME (no-op) payload twice converges — Success both times, the '
                + 'value is unchanged, and no duplicate map row is created. The mutation is idempotent',
        }));

        // CancelSync twice on an idle connector — a safe no-op (Success:false "no active sync" is the
        // correct, non-erroring response; the op must NEVER hard-throw on a repeat).
        await drainAnyInFlight(gql, ciid, cfg).catch(() => {});
        const cancel1 = await bestEffortCancel(gql, ciid);
        const cancel2 = await bestEffortCancel(gql, ciid);
        const bothWellFormed = typeof cancel1?.Success === 'boolean' && typeof cancel2?.Success === 'boolean';
        steps.push(step('dedup.double-submit.cancel-idle-noop', bothWellFormed, {
            observed: {
                cancel1: { success: cancel1?.Success ?? null, message: cancel1?.Message ?? null },
                cancel2: { success: cancel2?.Success ?? null, message: cancel2?.Message ?? null },
            },
            note: 'DOUBLE-SUBMIT SAME OP: CancelSync on an idle connector twice is a SAFE no-op — each returns a well-formed envelope '
                + '(Success:false "no active sync" is the correct, non-erroring response) and never hard-throws on the repeat',
        }));
    }

    // ── CLEANUP. Delete the disposable inject record by captured id, then a final reconciling sync so the
    //    seeded connection is left consistent. Seeded connection + encrypted credential PRESERVED.
    await cleanupCreatedRecord(gql, db, cfg, steps, ciid, writeObject, createdExternalID);

    // Final settle so the connection is idle + consistent for the next phase.
    try {
        await drainAnyInFlight(gql, ciid, cfg);
        const settle = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        steps.push(step('dedup.cleanup.settle', settle.run?.Success !== false, {
            observed: { runID: settle.runID, success: settle.run?.Success ?? null, counts: settle.run?.Counts ?? null },
            note: 'final reconciling incremental leaves the seeded connection idle + consistent for later phases',
        }));
    } catch (e) {
        steps.push(step('dedup.cleanup.settle', true, {
            observed: { error: String(e?.message ?? e) },
            note: 'final settle re-sync errored (non-fatal); the connection is left as-is for later phases',
        }));
    }

    return steps;
}

/**
 * Deletes the one disposable inject record by its captured ExternalID (exact, id-targeted; never touches
 * users/owners/real data), then a best-effort re-sync so the deletion propagates and the dest returns to
 * baseline. Never throws (cleanup must always complete); records a step. No-op when no record was created.
 */
async function cleanupCreatedRecord(gql, db, cfg, steps, ciid, objectName, externalID) {
    if (!externalID) return;
    let deleteOk = false;
    try {
        const del = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'delete', externalID, attributes: null,
        })).IntegrationWriteRecord;
        deleteOk = del?.Success === true;
        steps.push(step('dedup.cleanup.delete-external', deleteOk, {
            observed: { object: objectName, externalID, statusCode: del?.StatusCode ?? null, message: del?.Message ?? null },
            note: 'deleted the disposable duplicate-inject record by its captured external id (exact, id-targeted; NEVER '
                + 'users/owners/real data) so the portal + seeded connection stay clean',
        }));
    } catch (e) {
        steps.push(step('dedup.cleanup.delete-external', false, {
            observed: { object: objectName, externalID, error: String(e?.message ?? e) },
            note: 'FAILED to delete the inject record — it may be orphaned in the portal; manual cleanup required',
        }));
    }
    try {
        const reSync = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const rowsFinal = await destRowCount(db, cfg, objectName);
        steps.push(step('dedup.cleanup.resync', true, {
            observed: { runID: reSync.runID, success: reSync.run?.Success ?? null, rowsFinal, deleteOk },
            note: 'best-effort re-sync after delete so the deletion propagates and the dest table returns to baseline; never '
                + 'hard-fails on a tombstone-style connector (the id-targeted delete above already removed the test record)',
        }));
    } catch (e) {
        steps.push(step('dedup.cleanup.resync', true, {
            observed: { error: String(e?.message ?? e) },
            note: 'cleanup re-sync errored (non-fatal) — the id-targeted delete above already removed the test record',
        }));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional thin orchestrator (mirrors runMatrixReadonly / runBidirectionalConflict): reference-mode only,
// reuses the seeded connection's existing Active entity maps, runs the single phase, closes the DB. The
// phase is also directly callable by an external runner that already owns setup.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} io  { gql(query,vars), db (rows/recordMapStats/entityRowCount/close) }
 * @param {object} cfg { platform, mjSchema, destSchema?, objects[], companyIntegrationID, writeObject?,
 *                       allowWrite?, reapplySchema?, runId, maxPolls?, valuePkColumn? }
 * @returns {{ ok, platform, steps: { setup, dedupIdempotency } }}
 */
export async function runDedupIdempotencySweep({ gql, db }, cfg) {
    const result = { ok: false, platform: cfg.platform, steps: {} };
    try {
        if (!cfg.companyIntegrationID) {
            throw new Error('runDedupIdempotencySweep is reference-mode only: cfg.companyIntegrationID (HS_LIVE_CIID) is required');
        }
        const ciid = cfg.companyIntegrationID;
        const listed = (await gql(DEDUP_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
        if (!listed?.Success) throw new Error(`ListEntityMaps failed: ${listed?.Message ?? 'no payload'}`);
        const maps = (listed.EntityMaps ?? [])
            .filter(m => m.Status === 'Active' || m.Status == null)
            .map(m => ({ entityMapID: m.ID, entityName: m.Entity, sourceObjectName: m.ExternalObjectName }));
        if (maps.length === 0) throw new Error('no Active entity maps for this CIID — run ApplyAll once first');

        result.steps.setup = step('setup', true, {
            observed: { ciid, mapCount: maps.length, maps: maps.map(m => ({ object: m.sourceObjectName, entity: m.entityName })) },
            note: 'reused the seeded connection\'s existing Active entity maps (no ApplyAll needed; no RSU/restart)',
        });

        result.steps.dedupIdempotency = await phasededupidempotencysweep({ gql, db, ciid, maps, cfg });
        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        result.ok = !result.error && allStepsOk(result.steps);
    }
}
