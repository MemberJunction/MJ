/**
 * GQL-driven LIFECYCLE harness — the §15 lifecycle-operations test, run through the REAL MJAPI
 * GraphQL API against the pre-seeded HubSpot reference connection (token-free reference mode).
 *
 * Where gql-live-harness.mjs proves the forward/backward DATA path and gql-matrix-harness.mjs proves
 * the incremental-efficiency + ordering MECHANICS, THIS module proves the LIFECYCLE-control surface
 * of IntegrationDiscoveryResolver as source-grounded by ENGINE_MECHANICS_MAP.json's
 * `lifecycle-resolver-ops` subsystem: Deactivate/Reactivate, Cancel, deselect/reselect entity maps,
 * the full read-only op smoke (§15f), and the DESTRUCTIVE DeleteConnection cascade.
 *
 * ASSERTION PHILOSOPHY: every step asserts the DESIRED/correct behavior, so step.ok=false EXPOSES a
 * real framework bug (we fix it next). Each step carries `observed` (what happened) and a `note` that
 * names the bug if it fails. The CONFIRMED bugs (per the mechanics map) that these tests are EXPECTED
 * to surface until fixed:
 *   - DEACTIVATE IS COSMETIC: an IsActive=false connection still syncs when triggered.
 *   - CANCEL-STATUS BUG: a user-cancelled run persists as Status='Success'/ExitReason='completed'.
 *   - DELETECONNECTION ORPHANS THE CREDENTIAL: the linked MJ:Credentials row is never deleted.
 *   - DELETECONNECTION leaves the CI row / children depending on cascade correctness.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint (plans.mjs), which dereferences secrets and scrubs the result. Reference mode drives the
 * connection purely by CompanyIntegrationID — the encrypted credential is decrypted server-side; the
 * HubSpot token never enters this process.
 *
 * STATE DISCIPLINE: runLifecycleOps is NON-DESTRUCTIVE — it operates on the seeded reusable CIID and
 * RESTORES every mutated piece of state (reactivates, re-activates the deals map, resets) so the
 * seeded connection stays reusable. runDeleteCascade is DESTRUCTIVE and only ever runs against a
 * DISPOSABLE throwaway CIID (NEVER the main seeded one) — it deletes that connection and asserts the
 * cascade's completeness.
 */

// GQL (op strings incl. startSync/listRuns/getRun/tailRunEvents), runSyncObserved (trigger→tail→GetRun),
// triggerAndResolveRun (race-free run-id), and phaseSetup (reference-mode ApplyAll → { ciid, maps }) are
// reused from the existing harness so the lifecycle module never re-derives the core sync drivers.
import { GQL, runSyncObserved, triggerAndResolveRun, phaseSetup } from './gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle GraphQL op strings (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts — MutationResultOutput {Success,Message} :537;
// IntegrationDeactivateConnection :2414; IntegrationReactivateConnection :2437;
// IntegrationCancelSync :3298; IntegrationGetStatus → IntegrationStatusOutput :661/:3866;
// IntegrationGetSyncHistory(limit defaultValue 20) → SyncHistoryOutput/SyncRunSummaryOutput :702/:3928;
// IntegrationUpdateEntityMaps(updates:[EntityMapUpdateInput]) → MutationResultOutput :3700;
// IntegrationListEntityMaps → ListEntityMapsOutput/EntityMapSummaryOutput :654/:3644;
// IntegrationDeleteConnection(deleteData defaultValue false) → DeleteConnectionOutput :189/:4602;
// IntegrationListConnections(activeOnly default true) → ListConnectionsOutput :824/:2168;
// IntegrationListFieldMaps(entityMapID) → ListFieldMapsOutput :255/:3672;
// IntegrationListSchedules → ListSchedulesOutput :624/:3603;
// IntegrationGetConnectorCapabilities → ConnectorCapabilitiesOutput :215/:4158;
// IntegrationListRuns(all args nullable) → IntegrationListRunsOutput :783/:3966.)
// ─────────────────────────────────────────────────────────────────────────────

const LIFE_GQL = {
    deactivate: `mutation($ciid: String!) {
      IntegrationDeactivateConnection(companyIntegrationID: $ciid) { Success Message }
    }`,
    reactivate: `mutation($ciid: String!) {
      IntegrationReactivateConnection(companyIntegrationID: $ciid) { Success Message }
    }`,
    cancelSync: `mutation($ciid: String!) {
      IntegrationCancelSync(companyIntegrationID: $ciid) { Success Message }
    }`,
    getStatus: `query($ciid: String!) {
      IntegrationGetStatus(companyIntegrationID: $ciid) {
        Success Message IsActive IntegrationName TotalEntityMaps ActiveEntityMaps
        LastRunStatus LastRunStartedAt LastRunEndedAt ScheduleEnabled
      }
    }`,
    // limit has defaultValue 20 in the resolver → nullable in the schema; declared nullable Float here
    // and always passed explicitly so the op is deterministic regardless of the server default.
    getSyncHistory: `query($ciid: String!, $limit: Float) {
      IntegrationGetSyncHistory(companyIntegrationID: $ciid, limit: $limit) {
        Success Message Runs { ID Status StartedAt EndedAt TotalRecords }
      }
    }`,
    updateEntityMaps: `mutation($updates: [EntityMapUpdateInput!]!) {
      IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority }
      }
    }`,
    deleteConnection: `mutation($ciid: String!, $deleteData: Boolean!) {
      IntegrationDeleteConnection(companyIntegrationID: $ciid, deleteData: $deleteData) {
        Success Message EntityMapsDeleted FieldMapsDeleted SchedulesDeleted
      }
    }`,
    // Smoke ops (read-only) — args mirror the resolver: ListConnections(activeOnly,companyID?),
    // ListFieldMaps(entityMapID), ListSchedules(ciid), GetConnectorCapabilities(ciid),
    // ListRuns(ciid?,runKind?,inFlightOnly?,limit?).
    listConnections: `query($activeOnly: Boolean) {
      IntegrationListConnections(activeOnly: $activeOnly) {
        Success Message Connections { ID IntegrationName IntegrationID IsActive ScheduleEnabled }
      }
    }`,
    listFieldMaps: `query($entityMapID: String!) {
      IntegrationListFieldMaps(entityMapID: $entityMapID) {
        Success Message FieldMaps { ID EntityMapID SourceFieldName DestinationFieldName Status }
      }
    }`,
    listSchedules: `query($ciid: String!) {
      IntegrationListSchedules(companyIntegrationID: $ciid) {
        Success Message Schedules { ID Name Status CronExpression }
      }
    }`,
    getConnectorCapabilities: `query($ciid: String!) {
      IntegrationGetConnectorCapabilities(companyIntegrationID: $ciid) {
        Success Message SupportsGet SupportsCreate SupportsUpdate SupportsDelete SupportsSearch
      }
    }`,
    listRunsSmoke: `query($ciid: String, $limit: Float) {
      IntegrationListRuns(companyIntegrationID: $ciid, limit: $limit) {
        Success Message Runs { RunID IsInFlight RunKind StartedAt }
      }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (mirrors of the harness's so this module is self-contained; identical shape).
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

/** Case-insensitive UUID/string compare (SQL Server returns upper, pg lower, GQL may vary). */
function sameId(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

/** Reads a value off a row regardless of dialect casing (mssql=PascalCase, pg=lowercased). */
function col(row, name) {
    if (row == null) return undefined;
    if (name in row) return row[name];
    const lower = name.toLowerCase();
    if (lower in row) return row[lower];
    for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
    return undefined;
}

const isPg = (cfg) => cfg.platform === 'postgresql';

/** Qualified table/view reference for the MJ core schema. */
function mjT(cfg, name) {
    const s = cfg.mjSchema ?? '__mj';
    return isPg(cfg) ? `"${s}"."${name}"` : `[${s}].[${name}]`;
}

/** Column reference (quoted on pg, bare on mssql). */
function C(cfg, name) {
    return isPg(cfg) ? `"${name}"` : name;
}

/** A safe single-quoted SQL string literal (doubles embedded quotes). The ONLY interpolated values are
 *  harness UUIDs + fixed identifiers — never untrusted input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

/** COUNT(*) of a __mj table filtered by a single column = a UUID literal. */
async function countMjBy(db, cfg, table, colName, value) {
    const sql = `SELECT COUNT(*) AS c FROM ${mjT(cfg, table)} WHERE ${C(cfg, colName)}=${lit(value)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

const isCrm = (name) => ['contacts', 'companies', 'deals'].includes((name ?? '').toLowerCase());

/** Maps the resolver's EntityMap shape to the lightweight {entityMapID, sourceObjectName, entityName}. */
function mapFromSummary(e) {
    return {
        entityMapID: e.ID,
        sourceObjectName: e.ExternalObjectName,
        entityName: e.Entity,
        status: e.Status,
    };
}

/** Loads the seeded connection's entity maps via GQL (source of truth for the lifecycle ops). */
async function listMaps(gql, ciid) {
    const out = (await gql(LIFE_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
    if (out?.Success !== true) throw new Error(`ListEntityMaps failed: ${out?.Message ?? 'no payload'}`);
    return (out.EntityMaps ?? []).map(mapFromSummary);
}

/** GetStatus convenience that throws on a non-Success envelope (it's a read we always expect to work). */
async function getStatus(gql, ciid) {
    const out = (await gql(LIFE_GQL.getStatus, { ciid })).IntegrationGetStatus;
    if (out?.Success !== true) throw new Error(`GetStatus failed: ${out?.Message ?? 'no payload'}`);
    return out;
}

/** Sync-history run count (limit 50) — the "new run appeared" proxy for deactivate enforcement. */
async function historyRunCount(gql, ciid, limit = 50) {
    const out = (await gql(LIFE_GQL.getSyncHistory, { ciid, limit })).IntegrationGetSyncHistory;
    if (out?.Success !== true) throw new Error(`GetSyncHistory failed: ${out?.Message ?? 'no payload'}`);
    return (out.Runs ?? []).length;
}

/** Sets one entity map's Status (Active|Inactive) via UpdateEntityMaps; returns the GQL envelope. */
async function setMapStatus(gql, entityMapID, status) {
    return (await gql(LIFE_GQL.updateEntityMaps, { updates: [{ EntityMapID: entityMapID, Status: status }] })).IntegrationUpdateEntityMaps;
}

/** Best-effort cancel — never throws (used on the restore path; a finished sync can't be cancelled). */
async function bestEffortCancel(gql, ciid) {
    try { return (await gql(LIFE_GQL.cancelSync, { ciid })).IntegrationCancelSync; }
    catch (e) { return { Success: false, Message: String(e?.message ?? e) }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: deactivate-enforcement (+ reactivate restore)  — confirmed "deactivate is cosmetic" bug.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * a) Deactivate must flip IsActive=false (the deactivate itself works).
 * b/c) DESIRED: a deactivated connection must NOT start a sync. We capture the history run count,
 *      StartSync(fullSync:false), and observe whether a NEW run appeared (history grew, or StartSync
 *      returned a RunID). The enforcement step PASSES only if the sync was REJECTED. Per the mechanics
 *      map this is the confirmed "deactivate is cosmetic" bug → EXPECTED to FAIL until fixed.
 * d) Restore: best-effort cancel any run that started, then Reactivate (IsActive=true) — keeps the
 *    seeded connection reusable.
 */
export async function phaseDeactivateEnforcement({ gql, ciid }) {
    const steps = [];

    // a) Deactivate → IsActive=false.
    const deact = (await gql(LIFE_GQL.deactivate, { ciid })).IntegrationDeactivateConnection;
    const afterDeact = await getStatus(gql, ciid);
    steps.push(step('lifecycle.deactivate.applied', deact?.Success === true && afterDeact.IsActive === false, {
        observed: { deactivateSuccess: deact?.Success ?? false, isActive: afterDeact.IsActive ?? null },
        message: deact?.Message ?? null,
        note: 'Deactivate flips CompanyIntegration.IsActive=false (the deactivate itself is expected to work)',
    }));

    // b) Capture baseline, then attempt to start a sync on the DEACTIVATED connection.
    const historyBefore = await historyRunCount(gql, ciid, 50);
    const lastStatusBefore = afterDeact.LastRunStatus ?? null;
    const started = (await gql(GQL.startSync, { ciid, fullSync: false, syncDirection: 'Pull', entityMapIDs: null })).IntegrationStartSync;
    const startSyncSuccess = started?.Success === true;
    const runID = started?.RunID ?? null;

    // Did a NEW run actually appear? history grew OR a RunID was minted OR LastRunStatus advanced.
    const historyAfter = await historyRunCount(gql, ciid, 50);
    const statusAfter = await getStatus(gql, ciid);
    const newRunAppeared = historyAfter > historyBefore || !!runID
        || (statusAfter.LastRunStatus != null && statusAfter.LastRunStatus !== lastStatusBefore && statusAfter.LastRunStartedAt !== afterDeact.LastRunStartedAt);

    // c) DESIRED: the sync is REJECTED (no new run). EXPECTED to FAIL — deactivate is cosmetic.
    steps.push(step('lifecycle.deactivate.enforced', !startSyncSuccess && !newRunAppeared, {
        observed: { startSyncSuccess, runID, newRunAppeared, historyBefore, historyAfter, lastStatusBefore, lastStatusAfter: statusAfter.LastRunStatus ?? null },
        note: 'BUG(deactivate-cosmetic): a deactivated (IsActive=false) connection STILL syncs when triggered — '
            + 'no IsActive gate in RunSync/executeSyncInternal/LoadRunConfiguration. DESIRED: StartSync rejected, no new run.',
    }));

    // d) Restore: cancel any run that started (best-effort), then Reactivate so the connection is reusable.
    if (startSyncSuccess) {
        const cancelled = await bestEffortCancel(gql, ciid);
        steps.push(step('lifecycle.deactivate.cleanup-cancel', true, {
            observed: { cancelRequested: true, cancelSuccess: cancelled?.Success ?? false, message: cancelled?.Message ?? null },
            note: 'best-effort cancel of the (bug-)started run so it does not linger; never fails the cell (cooperative cancel race)',
        }));
    }
    const react = (await gql(LIFE_GQL.reactivate, { ciid })).IntegrationReactivateConnection;
    const afterReact = await getStatus(gql, ciid);
    steps.push(step('lifecycle.reactivate', react?.Success === true && afterReact.IsActive === true, {
        observed: { reactivateSuccess: react?.Success ?? false, isActive: afterReact.IsActive ?? null },
        message: react?.Message ?? null,
        note: 'Reactivate restores IsActive=true so the seeded connection stays reusable',
    }));

    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: deselect / reselect entity maps  (the Status='Inactive' deselect mechanism).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * a) Deselect: Set the deals map Status='Inactive' → GetStatus.ActiveEntityMaps decrements by 1.
 * b) Excluded: a full sync must EXCLUDE deals (its dest row count is unchanged while a parent that IS
 *    selected changes — proxy: deals record-map total unchanged after the run; deals not synced).
 * c) Reselect: restore deals Status='Active', re-sync, assert deals is included again (record map present
 *    and the map is Active). RESTORES state so the seeded connection is reusable.
 */
export async function phaseDeselectReselect({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const dealsMap = maps.find(m => (m.sourceObjectName ?? '').toLowerCase() === 'deals');
    if (!dealsMap) {
        steps.push(step('lifecycle.deselect.skipped', true, { note: 'no deals entity map in seeded connection — deselect/reselect cell skipped' }));
        return steps;
    }
    let restored = false;
    try {
        const statusBefore = await getStatus(gql, ciid);
        const activeBefore = statusBefore.ActiveEntityMaps ?? null;

        // a) Deselect deals (Status='Inactive') → ActiveEntityMaps decrements by exactly 1.
        const deselect = await setMapStatus(gql, dealsMap.entityMapID, 'Inactive');
        const statusAfterDeselect = await getStatus(gql, ciid);
        const activeAfter = statusAfterDeselect.ActiveEntityMaps ?? null;
        const decremented = activeBefore != null && activeAfter != null && activeAfter === activeBefore - 1;
        steps.push(step('lifecycle.deselect.status', deselect?.Success === true && decremented, {
            observed: { updateSuccess: deselect?.Success ?? false, activeBefore, activeAfter },
            note: 'UpdateEntityMaps Status=Inactive is the soft deselect; ActiveEntityMaps must drop by exactly 1',
        }));

        // b) Full sync → deals EXCLUDED. Proxy: deals record-map total is unchanged across the run while a
        //    selected CRM parent (contacts) is still synced. The engine filters maps by Status='Active'.
        const dealsRmBefore = await db.recordMapStats(ciid, dealsMap.entityName);
        const run = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const dealsRmAfter = await db.recordMapStats(ciid, dealsMap.entityName);
        const dealsUntouched = dealsRmAfter.total === dealsRmBefore.total;
        steps.push(step('lifecycle.deselect.excluded', run.run?.Success === true && dealsUntouched, {
            observed: {
                runID: run.runID, runSuccess: run.run?.Success ?? null,
                dealsRecordMapBefore: dealsRmBefore.total, dealsRecordMapAfter: dealsRmAfter.total,
            },
            note: 'DESIRED: an Inactive (deselected) map is skipped — deals record-map total unchanged by the run '
                + '(engine LoadRunConfiguration filters SyncEnabled=1 AND Status=\'Active\')',
        }));

        // c) Reselect deals (Status='Active'), re-sync, assert deals is included again.
        const reselect = await setMapStatus(gql, dealsMap.entityMapID, 'Active');
        restored = reselect?.Success === true;
        const statusAfterReselect = await getStatus(gql, ciid);
        const activeRestored = (statusAfterReselect.ActiveEntityMaps ?? null) === activeBefore;
        const reRun = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const dealsRmReRun = await db.recordMapStats(ciid, dealsMap.entityName);
        const dealsIncludedAgain = dealsRmReRun.total >= dealsRmBefore.total && dealsRmReRun.total === dealsRmReRun.distinctExternal;
        steps.push(step('lifecycle.reselect', reselect?.Success === true && activeRestored && reRun.run?.Success === true && dealsIncludedAgain, {
            observed: {
                reselectSuccess: reselect?.Success ?? false, activeRestored,
                reRunID: reRun.runID, dealsRecordMapAfterReRun: dealsRmReRun.total,
                dealsRecordMapDistinct: dealsRmReRun.distinctExternal,
            },
            note: 'reactivating the map re-includes deals in the sync; record map repopulated + stays 1:1',
        }));
    } finally {
        // RESTORE: guarantee deals is Active even if an assertion above threw, so the seeded connection
        // is reusable by later tests.
        if (!restored) {
            try {
                const reset = await setMapStatus(gql, dealsMap.entityMapID, 'Active');
                steps.push(step('lifecycle.deselect.restore', reset?.Success === true, {
                    observed: { restoreSuccess: reset?.Success ?? false },
                    note: 'failsafe restore: deals map Status reset to Active so the seeded connection stays reusable',
                }));
            } catch (e) {
                steps.push(step('lifecycle.deselect.restore', false, { error: String(e?.message ?? e) }));
            }
        }
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: cancel-status  (best-effort — cancel is cooperative; a fast sync may finish first).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * a) StartSync(fullSync:true) → capture RunID, IMMEDIATELY CancelSync(ciid).
 * b) If CancelSync.Success===false (sync already finished) → the cooperative cancel lost the race on a
 *    fast 56-record sync; record signal-path reachable (ok:true), do NOT hard-fail.
 * c) If CancelSync.Success===true → wait for the run terminal (IntegrationGetRun until IsInFlight=false),
 *    then assert run Status DISTINGUISHES a cancelled run. Per the map this is the confirmed
 *    "cancel recorded as Success" bug → EXPECTED to FAIL (Status='Success', ExitReason='completed').
 */
export async function phaseCancelStatus({ gql, ciid, cfg }) {
    const steps = [];

    // a) Start a full sync and try to cancel it immediately (race-free run-id resolution).
    let runID;
    try {
        runID = await triggerAndResolveRun(gql, ciid, { fullSync: true, syncDirection: 'Pull' });
    } catch (e) {
        steps.push(step('lifecycle.cancel.signal', false, { error: String(e?.message ?? e), note: 'could not start a sync to cancel' }));
        return steps;
    }
    const cancel = (await gql(LIFE_GQL.cancelSync, { ciid })).IntegrationCancelSync;
    const cancelSuccess = cancel?.Success === true;

    if (!cancelSuccess) {
        // b) Cooperative cancel lost the race — the sync finished before the abort landed. Signal-path OK.
        steps.push(step('lifecycle.cancel.signal', true, {
            observed: { runID, cancelSuccess: false, message: cancel?.Message ?? null },
            note: 'sync completed before cancel landed (cooperative cancel; non-deterministic on a fast 56-record sync) — '
                + 'CancelSync returns Success:false "No active sync found for this connector"; signal path reachable',
        }));
        // Drain to terminal so the connection is idle for later tests (no assertion on the status here).
        await runSyncObservedTerminal(gql, runID, cfg);
        return steps;
    }

    // Cancel signalled — record the signal step, then wait for the run to reach a terminal state.
    steps.push(step('lifecycle.cancel.signal', true, {
        observed: { runID, cancelSuccess: true, message: cancel?.Message ?? null },
        note: 'CancelSync returned Success "Sync cancellation signalled — will stop after current batch completes"',
    }));

    // c) Wait for terminal, then DESIRED: the run status distinguishes a cancelled run from a clean one.
    const detail = await runSyncObservedTerminal(gql, runID, cfg);
    const status = detail.run?.Success === true ? 'Success' : (detail.run?.Success === false ? 'Failed' : null);
    const exitReason = detail.run?.ExitReason ?? null;
    // The artifact's terminal verdict is the only GQL-visible run status here (IntegrationGetRun exposes
    // Success + ExitReason; the persisted CompanyIntegrationRun.Status enum has no 'Cancelled' value).
    const distinguishesCancel = exitReason === 'aborted' || status === 'Cancelled' || status === 'Failed';
    steps.push(step('lifecycle.cancel.status', distinguishesCancel, {
        observed: { runID, status, exitReason, success: detail.run?.Success ?? null, counts: detail.run?.Counts ?? null },
        note: 'BUG(cancel-status): a user-cancelled run is persisted Status=\'Success\' / artifact ExitReason=\'completed\' '
            + '(FinalizeRun keys Status only off RecordsErrored>0 and ignores aggregate.ErrorMessage=\'Sync cancelled by user\'; '
            + 'exitReason:\'aborted\' exists in the type union but is emitted by NO code path). '
            + 'DESIRED: ExitReason=\'aborted\' (or a Cancelled/Failed status) so a cancelled run is distinguishable.',
    }));

    return steps;
}

/** Polls IntegrationGetRun until IsInFlight=false (no sleeps — a microtask yields between polls). */
async function runSyncObservedTerminal(gql, runID, cfg) {
    const maxPolls = cfg?.maxPolls ?? 100000;
    let detail = null;
    for (let i = 0; i < maxPolls; i++) {
        const out = (await gql(GQL.getRun, { runID })).IntegrationGetRun;
        detail = out;
        if (out?.Run && out.Run.IsInFlight === false) break;
        await Promise.resolve(); // yield, re-poll immediately
    }
    return { runID, run: detail?.Run ?? null, errors: detail?.Errors ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: full-op smoke (§15f) — every SAFE/read-only op returns a well-formed Success:true.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls each SAFE/read-only op once and asserts it returns a well-formed Success:true (no hard error).
 * Proves "a client is unlikely to hit a hard error on any of these." One step per op.
 */
export async function phaseSmoke({ gql, ciid, maps }) {
    const steps = [];
    const firstMapID = maps?.[0]?.entityMapID ?? null;

    /** Runs one op, records lifecycle.smoke.<name> with ok = response.Success===true (never throws). */
    const smoke = async (name, query, vars, rootField) => {
        try {
            const out = (await gql(query, vars))[rootField];
            steps.push(step(`lifecycle.smoke.${name}`, out?.Success === true, {
                observed: { success: out?.Success ?? null, message: out?.Message ?? null },
                note: `${rootField} must return a well-formed Success:true envelope`,
            }));
        } catch (e) {
            steps.push(step(`lifecycle.smoke.${name}`, false, {
                observed: { error: String(e?.message ?? e) },
                note: `${rootField} threw a hard error (a client should never hit this)`,
            }));
        }
    };

    await smoke('getStatus', LIFE_GQL.getStatus, { ciid }, 'IntegrationGetStatus');
    await smoke('listConnections', LIFE_GQL.listConnections, { activeOnly: false }, 'IntegrationListConnections');
    await smoke('listEntityMaps', LIFE_GQL.listEntityMaps, { ciid }, 'IntegrationListEntityMaps');
    if (firstMapID) {
        await smoke('listFieldMaps', LIFE_GQL.listFieldMaps, { entityMapID: firstMapID }, 'IntegrationListFieldMaps');
    } else {
        steps.push(step('lifecycle.smoke.listFieldMaps', true, { observed: { skipped: 'no entity maps to enumerate field maps for' } }));
    }
    await smoke('listSchedules', LIFE_GQL.listSchedules, { ciid }, 'IntegrationListSchedules');
    await smoke('listRuns', LIFE_GQL.listRunsSmoke, { ciid, limit: 10 }, 'IntegrationListRuns');
    await smoke('getSyncHistory', LIFE_GQL.getSyncHistory, { ciid, limit: 10 }, 'IntegrationGetSyncHistory');
    await smoke('getConnectorCapabilities', LIFE_GQL.getConnectorCapabilities, { ciid }, 'IntegrationGetConnectorCapabilities');

    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator: runLifecycleOps (NON-DESTRUCTIVE — reuses the seeded CIID, restores all state).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NON-DESTRUCTIVE lifecycle orchestrator. Reference mode only: it operates on the seeded reusable CIID
 * (cfg.companyIntegrationID) and RESTORES every mutation (reactivate, re-activate the deals map) so the
 * connection stays reusable. ApplyAll is NOT needed — it reuses existing maps via ListEntityMaps; only
 * if the CIID has ZERO entity maps does it call phaseSetup once (reference mode) to create them.
 *
 * @param {object} io  { gql(query,vars), db (recordMapStats/rows/close) }
 * @param {object} cfg { platform, mjSchema, objects[], companyIntegrationID, maxPolls? }
 * @returns {{ ok, platform, steps: { setup, deactivate, deselect, cancel, smoke } }}
 */
export async function runLifecycleOps({ gql, db }, cfg) {
    const result = { ok: false, platform: cfg.platform, steps: {} };
    try {
        if (!cfg.companyIntegrationID) {
            throw new Error('runLifecycleOps is reference-mode only: cfg.companyIntegrationID (HS_LIVE_CIID) is required');
        }
        const ciid = cfg.companyIntegrationID;

        // Reuse existing maps; only build them (once, reference mode) if the seeded CIID has none.
        let maps = await listMaps(gql, ciid);
        if (maps.length === 0) {
            const setup = await phaseSetup({ gql, cfg });
            maps = (setup.maps ?? []).map(m => ({ entityMapID: m.entityMapID, sourceObjectName: m.sourceObjectName, entityName: m.entityName }));
            result.steps.setup = step('setup', maps.length > 0, {
                ciid, builtMaps: true, mapCount: maps.length,
                maps: maps.map(m => ({ object: m.sourceObjectName, entity: m.entityName })),
                note: 'seeded CIID had zero entity maps — built them once via reference-mode ApplyAll (they persist)',
            });
        } else {
            result.steps.setup = step('setup', true, {
                ciid, builtMaps: false, mapCount: maps.length,
                maps: maps.map(m => ({ object: m.sourceObjectName, entity: m.entityName, status: m.status })),
                note: 'reused the seeded connection\'s existing entity maps (no ApplyAll needed)',
            });
        }

        result.steps.deactivate = await phaseDeactivateEnforcement({ gql, ciid });
        result.steps.deselect = await phaseDeselectReselect({ gql, db, ciid, maps, cfg });
        result.steps.cancel = await phaseCancelStatus({ gql, ciid, cfg });
        result.steps.smoke = await phaseSmoke({ gql, ciid, maps });

        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        result.ok = !result.error && allStepsOk(result.steps);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator: runDeleteCascade (DESTRUCTIVE — deletes a DISPOSABLE throwaway CIID).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DESTRUCTIVE delete-cascade orchestrator. Runs ONLY against a disposable throwaway CIID
 * (cfg.companyIntegrationID) — NEVER the main seeded one. Captures the linked CredentialID, deletes the
 * connection (deleteData:false), then asserts the cascade's DESIRED completeness: credential deleted,
 * CI row deleted, child rows (entity maps / field maps / watermarks / record maps) cleaned. Per the
 * mechanics map the credential-orphan (and likely CI-row + children) checks are EXPECTED to FAIL until
 * the cascade is fixed.
 *
 * @param {object} io  { gql(query,vars), db (rows/close) }
 * @param {object} cfg { platform, mjSchema, companyIntegrationID }
 * @returns {{ ok, platform, steps }}
 */
export async function runDeleteCascade({ gql, db }, cfg) {
    const result = { ok: false, platform: cfg.platform, steps: {} };
    const steps = [];
    result.steps.cascade = steps;
    try {
        const ciid = cfg.companyIntegrationID;
        if (!ciid) {
            throw new Error('runDeleteCascade requires cfg.companyIntegrationID (the DISPOSABLE throwaway CIID) — none set');
        }

        // 1) Capture the CI's CredentialID + the IDs of its child entity maps BEFORE deleting (we need
        //    the EntityMap IDs to check field-map/watermark cleanup, and the CredentialID for the orphan check).
        const credRows = await db.rows(
            `SELECT ${C(cfg, 'CredentialID')} AS cred FROM ${mjT(cfg, 'CompanyIntegration')} WHERE ${C(cfg, 'ID')}=${lit(ciid)}`);
        const credentialID = col(credRows?.[0], 'cred') ?? null;

        const mapRows = await db.rows(
            `SELECT ${C(cfg, 'ID')} AS id FROM ${mjT(cfg, 'CompanyIntegrationEntityMap')} WHERE ${C(cfg, 'CompanyIntegrationID')}=${lit(ciid)}`);
        const mapIDs = (mapRows ?? []).map(r => String(col(r, 'id'))).filter(Boolean);

        steps.push(step('cascade.preflight', true, {
            observed: { ciid, credentialID, entityMapCount: mapIDs.length },
            note: 'captured CredentialID + child entity-map IDs before the destructive delete',
        }));

        // 2) Delete the connection (deleteData:false) → assert Success + record the reported cascade counts.
        const del = (await gql(LIFE_GQL.deleteConnection, { ciid, deleteData: false })).IntegrationDeleteConnection;
        steps.push(step('cascade.delete', del?.Success === true, {
            observed: {
                deleteSuccess: del?.Success ?? false, message: del?.Message ?? null,
                entityMapsDeleted: del?.EntityMapsDeleted ?? null,
                fieldMapsDeleted: del?.FieldMapsDeleted ?? null,
                schedulesDeleted: del?.SchedulesDeleted ?? null,
            },
            note: 'IntegrationDeleteConnection(deleteData:false) must report Success + cascade counts',
        }));

        // 3) Credential orphan check (the confirmed bug). DESIRED: the linked Credential row is GONE.
        if (credentialID != null) {
            const credAfter = await countMjBy(db, cfg, 'Credential', 'ID', credentialID);
            steps.push(step('cascade.credential-deleted', credAfter === 0, {
                observed: { credentialID, credentialStillExists: credAfter > 0, credentialRowCount: credAfter },
                note: 'BUG(delete-orphans-credential): the cascade never deletes the linked MJ:Credentials row '
                    + '(ci.CredentialID) — it is orphaned. DESIRED: the credential is deleted with the connection.',
            }));
        } else {
            steps.push(step('cascade.credential-deleted', true, {
                observed: { credentialID: null },
                note: 'the throwaway CI had no linked CredentialID — nothing to orphan; check vacuously passes',
            }));
        }

        // 4) CI-row check: does the row itself survive the "delete"? DESIRED: the CI row is GONE.
        const ciAfter = await countMjBy(db, cfg, 'CompanyIntegration', 'ID', ciid);
        steps.push(step('cascade.ci-row-deleted', ciAfter === 0, {
            observed: { ciid, ciRowStillExists: ciAfter > 0, ciRowCount: ciAfter },
            note: 'DESIRED: the CompanyIntegration row itself is deleted. A surviving row explains accumulating orphan CI rows.',
        }));

        // 5) Child-cleanup check: entity maps + field maps + watermarks + record maps for this CIID are gone.
        const emAfter = await countMjBy(db, cfg, 'CompanyIntegrationEntityMap', 'CompanyIntegrationID', ciid);
        let fmAfter = 0, wmAfter = 0;
        for (const mid of mapIDs) {
            fmAfter += await countMjBy(db, cfg, 'CompanyIntegrationFieldMap', 'EntityMapID', mid);
            wmAfter += await countMjBy(db, cfg, 'CompanyIntegrationSyncWatermark', 'EntityMapID', mid);
        }
        const rmAfter = await countMjBy(db, cfg, 'CompanyIntegrationRecordMap', 'CompanyIntegrationID', ciid);
        const childrenClean = emAfter === 0 && fmAfter === 0 && wmAfter === 0 && rmAfter === 0;
        steps.push(step('cascade.children-cleaned', childrenClean, {
            observed: {
                entityMapsRemaining: emAfter, fieldMapsRemaining: fmAfter,
                watermarksRemaining: wmAfter, recordMapsRemaining: rmAfter,
            },
            note: 'DESIRED: all entity maps / field maps / watermarks / record maps for the CIID are deleted by the cascade',
        }));

        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        result.ok = !result.error && allStepsOk(result.steps);
    }
}
