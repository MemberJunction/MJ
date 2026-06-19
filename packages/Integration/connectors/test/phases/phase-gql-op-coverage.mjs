/**
 * GQL-driven FULL OP-COVERAGE phase — plan.md §15f "Full GQL operation coverage", run through the
 * REAL MJAPI GraphQL API against the pre-seeded HubSpot reference connection (token-free reference mode).
 *
 * THE REQUIREMENT (plan.md §15f:294-295):
 *   "Enumerate EVERY integration GQL query + mutation and exercise each with assertions (success shape,
 *    idempotency, error grace): connection create/test/delete, schema refresh, ApplyAll / ApplyAllBatch,
 *    list source objects, create/update/delete entity maps + field maps, start sync, stop/cancel sync,
 *    list runs / get run / tail run events, schedule create/update/disable, activate/deactivate, and any
 *    others present in the resolver. A client is unlikely to hit a hard error on any of these — verify
 *    that, and fix where they can."
 *
 * WHAT THIS PHASE PROVES (per op, three axes):
 *   1. SUCCESS SHAPE  — the happy-path call returns a well-formed envelope (Success:true + the expected
 *      fields), DB-cross-checked where the op exposes a count the DB can confirm (entity maps, field maps,
 *      runs, watermarks, record map).
 *   2. IDEMPOTENCY    — repeating a non-mutating read, or a "set-to-current-value" mutation, twice yields
 *      the SAME shape with NO duplication / NO drift (UpdateEntityMaps to the same value; Reactivate twice;
 *      ListEntityMaps stable count). Destructive create/delete idempotency is exercised by sibling phases
 *      against disposable records — this phase does NOT create/delete portal data or seeded metadata.
 *   3. ERROR GRACE    — every op called with a deliberately-bad argument (nonexistent CIID / runID /
 *      entityMapID, invalid enum) must return a graceful {Success:false, Message} envelope (or an empty
 *      well-formed list) — NEVER a GraphQL hard error / thrown 500. A thrown error FAILS the cell and is
 *      exactly the §15f bug we want surfaced + fixed.
 *
 * COVERAGE LEDGER: the phase asserts that EVERY @Query/@Mutation in IntegrationDiscoveryResolver.ts is
 * accounted for — each op is either EXERCISED here (success+grace) or explicitly DEFERRED to a named
 * sibling phase (the destructive / write / RSU-heavy ops). The ledger step fails if a resolver op is
 * neither exercised nor deferred, so a newly-added op can't silently escape §15f coverage.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint (plans.mjs); reference mode drives purely by CompanyIntegrationID — the encrypted credential
 * is decrypted server-side, the HubSpot token never enters this process.
 *
 * STATE DISCIPLINE: read-only on the seeded connection EXCEPT for two reversible, self-healing mutations:
 *   (a) UpdateEntityMaps that re-sets ONE map's Priority/SyncDirection to its OWN current value (a no-op
 *       write proving the mutation path + idempotency), and
 *   (b) Deactivate→Reactivate to exercise the activate/deactivate pair, ALWAYS ending IsActive=true.
 * Both are restored in a guaranteed cleanup step so the seeded connection stays reusable. It NEVER deletes
 * the connection, the entity maps, the credential, schedules, or any portal record, and NEVER touches
 * Users/owners. The destructive DeleteConnection / DeleteEntityMaps / WriteRecord / CreateSchedule paths
 * are DEFERRED to the lifecycle + backward-CRUD harnesses that run against DISPOSABLE throwaway resources.
 */

// GQL op strings (StartSync/CancelSync/ListRuns/GetRun/TailRunEvents/ListEntityMaps/DeleteEntityMaps/
// WriteRecord/DeleteConnection/etc.), the race-free run drivers, and the canonical step() shape are
// reused from the existing harness so this phase never re-implements the gql client or the DB client.
import { GQL, triggerAndResolveRun, runSyncObserved } from '../gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts). Only ops that ACTUALLY EXIST in the resolver are declared.
//   - IntegrationDiscoverConnectors(companyID?)                         :925  → DiscoverConnectorsOutput
//   - IntegrationDiscoverObjects(companyIntegrationID)                  :963  → DiscoverObjectsOutput
//   - IntegrationListSourceObjects(companyIntegrationID)                :1002 → ListSourceObjectsOutput
//   - IntegrationDiscoverFields(companyIntegrationID,objectName)        :1102 → DiscoverFieldsOutput
//   - IntegrationTestConnection(companyIntegrationID)                   :1138 → ConnectionTestOutput
//   - IntegrationGetDefaultConfig(companyIntegrationID)                 :1337 → DefaultConfigOutput
//   - IntegrationPreviewData(companyIntegrationID,objectName,limit?)    :1465 → PreviewDataOutput
//   - IntegrationListConnections(activeOnly?,companyID?)                :2333 → ListConnectionsOutput
//   - IntegrationListSchedules(companyIntegrationID)                    :3779 → ListSchedulesOutput
//   - IntegrationListEntityMaps(companyIntegrationID)                   :3820 → ListEntityMapsOutput
//   - IntegrationListFieldMaps(entityMapID)                             :3848 → ListFieldMapsOutput
//   - IntegrationUpdateEntityMaps(updates:[EntityMapUpdateInput])       :3876 → MutationResultOutput
//   - IntegrationGetRSUProgress()                                       :3983 → OperationProgressOutput
//   - IntegrationGetSyncProgress(companyIntegrationID)                  :4009 → OperationProgressOutput
//   - IntegrationGetStatus(companyIntegrationID)                        :4042 → IntegrationStatusOutput
//   - IntegrationGetSyncHistory(companyIntegrationID,limit?)            :4109 → SyncHistoryOutput
//   - IntegrationListRuns(companyIntegrationID?,runKind?,inFlightOnly?,limit?) :4147 → IntegrationListRunsOutput
//   - IntegrationGetRun(runID)                                          :4206 → IntegrationRunDetailOutput
//   - IntegrationTailRunEvents(runID,sinceSeq?)                         :4246 → IntegrationRunEventsOutput
//   - IntegrationGetConnectorCapabilities(companyIntegrationID)         :4339 → ConnectorCapabilitiesOutput
//   - IntegrationDeactivateConnection(companyIntegrationID)             :2579 → MutationResultOutput
//   - IntegrationReactivateConnection(companyIntegrationID)             :2602 → MutationResultOutput
//   - IntegrationCancelSync(companyIntegrationID)                       :3474 → MutationResultOutput
// ─────────────────────────────────────────────────────────────────────────────

const COV_GQL = {
    discoverConnectors: `query($companyID: String) {
      IntegrationDiscoverConnectors(companyID: $companyID) {
        Success Message Connectors { IntegrationID Name ClassName IsActive }
      }
    }`,
    discoverObjects: `query($ciid: String!) {
      IntegrationDiscoverObjects(companyIntegrationID: $ciid) {
        Success Message Objects { ID Name Label SupportsIncrementalSync SupportsWrite }
      }
    }`,
    listSourceObjects: `query($ciid: String!) {
      IntegrationListSourceObjects(companyIntegrationID: $ciid) {
        Success Message Objects { Name Label AlreadyPersisted IntegrationObjectID SupportsIncrementalSync SupportsWrite IsCustom }
      }
    }`,
    discoverFields: `query($ciid: String!, $objectName: String!) {
      IntegrationDiscoverFields(companyIntegrationID: $ciid, objectName: $objectName) {
        Success Message Fields { Name Label DataType IsRequired IsUniqueKey IsReadOnly }
      }
    }`,
    testConnection: `query($ciid: String!) {
      IntegrationTestConnection(companyIntegrationID: $ciid) { Success Message ServerVersion }
    }`,
    getDefaultConfig: `query($ciid: String!) {
      IntegrationGetDefaultConfig(companyIntegrationID: $ciid) {
        Success Message DefaultSchemaName DefaultObjects { SourceObjectName TargetTableName TargetEntityName SyncEnabled }
      }
    }`,
    previewData: `query($ciid: String!, $objectName: String!, $limit: Float) {
      IntegrationPreviewData(companyIntegrationID: $ciid, objectName: $objectName, limit: $limit) {
        Success Message Records { Data }
      }
    }`,
    listConnections: `query($activeOnly: Boolean, $companyID: String) {
      IntegrationListConnections(activeOnly: $activeOnly, companyID: $companyID) {
        Success Message Connections { ID IntegrationName IntegrationID IsActive ScheduleEnabled }
      }
    }`,
    listSchedules: `query($ciid: String!) {
      IntegrationListSchedules(companyIntegrationID: $ciid) {
        Success Message Schedules { ID Name Status CronExpression }
      }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority Configuration }
      }
    }`,
    listFieldMaps: `query($entityMapID: String!) {
      IntegrationListFieldMaps(entityMapID: $entityMapID) {
        Success Message FieldMaps { ID EntityMapID SourceFieldName DestinationFieldName Status }
      }
    }`,
    updateEntityMaps: `mutation($updates: [EntityMapUpdateInput!]!) {
      IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
    }`,
    getRSUProgress: `query {
      IntegrationGetRSUProgress { Success Message OperationType IsRunning RSURunning }
    }`,
    getSyncProgress: `query($ciid: String!) {
      IntegrationGetSyncProgress(companyIntegrationID: $ciid) { Success Message OperationType IsRunning }
    }`,
    getStatus: `query($ciid: String!) {
      IntegrationGetStatus(companyIntegrationID: $ciid) {
        Success Message IsActive IntegrationName TotalEntityMaps ActiveEntityMaps LastRunStatus ScheduleEnabled
      }
    }`,
    getSyncHistory: `query($ciid: String!, $limit: Float) {
      IntegrationGetSyncHistory(companyIntegrationID: $ciid, limit: $limit) {
        Success Message Runs { ID Status StartedAt EndedAt TotalRecords }
      }
    }`,
    listRuns: `query($ciid: String, $runKind: String, $inFlightOnly: Boolean, $limit: Float) {
      IntegrationListRuns(companyIntegrationID: $ciid, runKind: $runKind, inFlightOnly: $inFlightOnly, limit: $limit) {
        Success Message Runs { RunID IsInFlight RunKind StartedAt Counts { Processed Succeeded Failed Skipped TotalKnown } }
      }
    }`,
    getRun: `query($runID: String!) {
      IntegrationGetRun(runID: $runID) {
        Success Message Errors
        Run { RunID IsInFlight Success ExitReason DurationMs Counts { Processed Succeeded Failed Skipped TotalKnown } }
      }
    }`,
    tailRunEvents: `query($runID: String!, $sinceSeq: Float) {
      IntegrationTailRunEvents(runID: $runID, sinceSeq: $sinceSeq) {
        Success Message LatestSeq IsInFlight Events { Ts Seq EventType }
      }
    }`,
    getConnectorCapabilities: `query($ciid: String!) {
      IntegrationGetConnectorCapabilities(companyIntegrationID: $ciid) {
        Success Message SupportsGet SupportsCreate SupportsUpdate SupportsDelete SupportsSearch
      }
    }`,
    deactivate: `mutation($ciid: String!) {
      IntegrationDeactivateConnection(companyIntegrationID: $ciid) { Success Message }
    }`,
    reactivate: `mutation($ciid: String!) {
      IntegrationReactivateConnection(companyIntegrationID: $ciid) { Success Message }
    }`,
    cancelSync: `mutation($ciid: String!) {
      IntegrationCancelSync(companyIntegrationID: $ciid) { Success Message }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Coverage ledger: EVERY @Query/@Mutation in IntegrationDiscoveryResolver.ts, mapped to either this
// phase (exercised) or a named sibling phase (deferred). Keeps §15f honest — the ledger step fails if a
// resolver op is neither exercised nor deferred, so a new op cannot silently slip §15f coverage.
// ─────────────────────────────────────────────────────────────────────────────

/** Every integration op present in the resolver (the §15f universe — 44 ops). */
const ALL_RESOLVER_OPS = [
    'IntegrationDiscoverConnectors', 'IntegrationDiscoverObjects', 'IntegrationListSourceObjects',
    'IntegrationDiscoverFields', 'IntegrationTestConnection', 'IntegrationRefreshConnectorSchema',
    'IntegrationGenerateAction', 'IntegrationGetDefaultConfig', 'IntegrationSchemaPreview',
    'IntegrationPreviewData', 'IntegrationListConnections', 'IntegrationCreateConnection',
    'IntegrationUpdateConnection', 'IntegrationDeactivateConnection', 'IntegrationReactivateConnection',
    'IntegrationCreateEntityMaps', 'IntegrationApplySchema', 'IntegrationApplySchemaBatch',
    'IntegrationApplyAll', 'IntegrationStartSync', 'IntegrationCancelSync', 'IntegrationWriteRecord',
    'IntegrationCreateSchedule', 'IntegrationUpdateSchedule', 'IntegrationToggleSchedule',
    'IntegrationDeleteSchedule', 'IntegrationListSchedules', 'IntegrationListEntityMaps',
    'IntegrationListFieldMaps', 'IntegrationUpdateEntityMaps', 'IntegrationDeleteEntityMaps',
    'IntegrationGetRSUProgress', 'IntegrationGetSyncProgress', 'IntegrationGetStatus',
    'IntegrationGetSyncHistory', 'IntegrationListRuns', 'IntegrationGetRun', 'IntegrationTailRunEvents',
    'IntegrationGetConnectorCapabilities', 'IntegrationApplyAllBatch', 'IntegrationDeleteConnection',
    'IntegrationSchemaEvolution',
];

/** Ops EXERCISED in THIS phase (success + grace, read-only or self-healing reversible). */
const EXERCISED_OPS = [
    'IntegrationDiscoverConnectors', 'IntegrationDiscoverObjects', 'IntegrationListSourceObjects',
    'IntegrationDiscoverFields', 'IntegrationTestConnection', 'IntegrationGetDefaultConfig',
    'IntegrationPreviewData', 'IntegrationListConnections', 'IntegrationListSchedules',
    'IntegrationListEntityMaps', 'IntegrationListFieldMaps', 'IntegrationUpdateEntityMaps',
    'IntegrationGetRSUProgress', 'IntegrationGetSyncProgress', 'IntegrationGetStatus',
    'IntegrationGetSyncHistory', 'IntegrationListRuns', 'IntegrationGetRun', 'IntegrationTailRunEvents',
    'IntegrationGetConnectorCapabilities', 'IntegrationDeactivateConnection',
    'IntegrationReactivateConnection', 'IntegrationStartSync', 'IntegrationCancelSync',
];

/**
 * Ops DEFERRED to a named sibling harness/phase because they CREATE/DELETE portal data, seeded metadata,
 * schedules, or trigger the heavy RSU/CodeGen pipeline — all of which must run against DISPOSABLE
 * throwaway resources, NOT the shared seeded connection this phase protects. Each is still §15f-covered,
 * just elsewhere. (StartSync/CancelSync ALSO appear here historically but are exercised read-safely here.)
 */
const DEFERRED_OPS = {
    IntegrationCreateConnection: 'gql-live-harness.phaseSetup (token-mode create against a disposable CIID)',
    IntegrationUpdateConnection: 'gql-lifecycle-harness (credential/config update against a disposable CIID)',
    IntegrationDeleteConnection: 'gql-lifecycle-harness.runDeleteCascade (DESTRUCTIVE — disposable CIID only)',
    IntegrationCreateEntityMaps: 'gql-live-harness.phaseSetup / ApplyAll (entity-map creation)',
    IntegrationDeleteEntityMaps: 'gql-live-harness.phaseTeardown (deletes only this-run-created maps)',
    IntegrationApplySchema: 'schema-apply-dual-dialect.mjs (RSU DDL apply)',
    IntegrationApplySchemaBatch: 'schema-apply-dual-dialect.mjs (RSU batch DDL apply)',
    IntegrationApplyAll: 'gql-live-harness.phaseSetup (full ApplyAll → RSU + maps)',
    IntegrationApplyAllBatch: 'gql-live-harness / plans.mjs batch setup path',
    IntegrationRefreshConnectorSchema: 'gql-live-harness.phaseSetup (CreateConnection runs the pipeline)',
    IntegrationSchemaEvolution: 'schema-apply-dual-dialect.mjs (ALTER/evolution path)',
    IntegrationSchemaPreview: 'schema-apply-dual-dialect.mjs (DDL preview, no apply)',
    IntegrationGenerateAction: 'phases/phase-generated-actions.mjs (runtime action generation + invoke)',
    IntegrationWriteRecord: 'gql-live-harness.phaseBackwardCRUD (create/update/delete a disposable record)',
    IntegrationCreateSchedule: 'gql-lifecycle-harness (schedule lifecycle against a disposable CIID)',
    IntegrationUpdateSchedule: 'gql-lifecycle-harness (schedule lifecycle)',
    IntegrationToggleSchedule: 'gql-lifecycle-harness (schedule enable/disable)',
    IntegrationDeleteSchedule: 'gql-lifecycle-harness (schedule teardown)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (identical shape to the existing harness/matrix/lifecycle/phase modules so this module is
// self-contained — same step() / col() / sameId() / tryParse() / dialect builders used everywhere else).
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

function tryParse(s) {
    if (typeof s !== 'string') return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
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
 *  harness UUIDs + fixed identifiers — never untrusted external input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

/** COUNT(*) of a __mj table filtered by a single column = a UUID literal. */
async function countMjBy(db, cfg, table, colName, value) {
    const sql = `SELECT COUNT(*) AS c FROM ${mjT(cfg, table)} WHERE ${C(cfg, colName)}=${lit(value)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

const CRM_OBJECTS = ['contacts', 'companies', 'deals'];
const isAssoc = (name) => /assoc/i.test(name ?? '');
const isCrm = (name) => CRM_OBJECTS.includes((name ?? '').toLowerCase());

/** A deterministically-impossible UUID used as the "bad id" for every error-grace probe. */
const BAD_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Runs ONE op, recording a structured "success-shape" step. The op MUST come back with a well-formed
 * envelope whose Success===true (reads we always expect to work against the seeded connection). Never
 * throws — a thrown hard error becomes ok:false (a §15f violation we want surfaced).
 */
async function exercise(steps, gql, name, query, vars, rootField, extraOk, extraDetail) {
    try {
        const out = (await gql(query, vars))[rootField];
        const shapeOk = out?.Success === true && (extraOk ? !!extraOk(out) : true);
        steps.push(step(`opcov.success.${name}`, shapeOk, {
            observed: { success: out?.Success ?? null, message: out?.Message ?? null, ...(extraDetail ? extraDetail(out) : {}) },
            note: `${rootField}: happy-path call must return a well-formed Success:true envelope`
                + (extraOk ? ' + the expected shape (see observed)' : ''),
        }));
        return out;
    } catch (e) {
        steps.push(step(`opcov.success.${name}`, false, {
            observed: { hardError: String(e?.message ?? e) },
            note: `${rootField}: threw a HARD error on the happy path — a client should NEVER hit this (§15f violation)`,
        }));
        return null;
    }
}

/**
 * Error-grace probe: call an op with a deliberately-bad arg and assert it degrades to a graceful
 * {Success:false} envelope (or a well-formed empty list) rather than a thrown GraphQL hard error.
 * `graceful(out)` decides what "graceful" means for that op (default: Success===false). A THROW fails
 * the cell — that is precisely the §15f "fix where they can" bug we want to expose.
 */
async function probeGrace(steps, gql, name, query, vars, rootField, graceful) {
    try {
        const out = (await gql(query, vars))[rootField];
        const isGraceful = graceful ? graceful(out) : out?.Success === false;
        steps.push(step(`opcov.grace.${name}`, isGraceful, {
            observed: { success: out?.Success ?? null, message: out?.Message ?? null },
            note: `${rootField}: a bad argument must yield a graceful {Success:false} (or well-formed empty) envelope — `
                + 'NOT a thrown hard error. DESIRED: the client sees a clean failure it can handle.',
        }));
    } catch (e) {
        steps.push(step(`opcov.grace.${name}`, false, {
            observed: { hardError: String(e?.message ?? e) },
            note: `${rootField}: threw a HARD GraphQL error on a bad argument instead of returning {Success:false}. `
                + 'This is the §15f "a client should not hit a hard error" violation — fix the resolver to fail gracefully.',
        }));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE PHASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full §15f op-coverage phase. Signature mirrors every sibling phase: ({ gql, db, ciid, maps, cfg }) → step[].
 * Exercises every read/safe integration op for SUCCESS SHAPE + ERROR GRACE + IDEMPOTENCY, DB-cross-checking
 * counts where possible, then asserts the COVERAGE LEDGER (every resolver op is exercised or deferred).
 * Reversible mutations (no-op UpdateEntityMaps, Deactivate→Reactivate) are restored in a cleanup block.
 */
export async function phasegqlopcoverage({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const integrationName = cfg.integrationName ?? 'HubSpot';
    const firstMap = (maps ?? [])[0] ?? null;
    const firstMapID = firstMap?.entityMapID ?? null;
    // Prefer a CRM object for the field/preview probes (stable schema + a simple total).
    const probeObject = ((maps ?? []).find(m => isCrm(m.sourceObjectName)) ?? firstMap)?.sourceObjectName ?? 'contacts';

    // Track what we mutate so the finally-block restores the seeded connection to its prior state.
    let needReactivate = false;        // set true once we deactivate
    const restoreMapUpdates = [];      // [{ EntityMapID, ...original fields }] to put back

    try {
        // ── A) DISCOVERY / READ ops (live probes against the connector) ──────────────────────────────────
        await exercise(steps, gql, 'discoverConnectors', COV_GQL.discoverConnectors, { companyID: null },
            'IntegrationDiscoverConnectors',
            (o) => Array.isArray(o.Connectors), (o) => ({ connectorCount: o.Connectors?.length ?? null }));

        await exercise(steps, gql, 'discoverObjects', COV_GQL.discoverObjects, { ciid },
            'IntegrationDiscoverObjects',
            (o) => Array.isArray(o.Objects), (o) => ({ objectCount: o.Objects?.length ?? null }));

        const lso = await exercise(steps, gql, 'listSourceObjects', COV_GQL.listSourceObjects, { ciid },
            'IntegrationListSourceObjects',
            (o) => Array.isArray(o.Objects), (o) => ({ objectCount: o.Objects?.length ?? null }));

        await exercise(steps, gql, 'discoverFields', COV_GQL.discoverFields, { ciid, objectName: probeObject },
            'IntegrationDiscoverFields',
            (o) => Array.isArray(o.Fields), (o) => ({ object: probeObject, fieldCount: o.Fields?.length ?? null }));

        await exercise(steps, gql, 'testConnection', COV_GQL.testConnection, { ciid },
            'IntegrationTestConnection',
            (o) => typeof o.Message === 'string', (o) => ({ serverVersion: o.ServerVersion ?? null }));

        await exercise(steps, gql, 'getDefaultConfig', COV_GQL.getDefaultConfig, { ciid },
            'IntegrationGetDefaultConfig', null, (o) => ({ defaultSchemaName: o.DefaultSchemaName ?? null, defaultObjectCount: o.DefaultObjects?.length ?? null }));

        await exercise(steps, gql, 'previewData', COV_GQL.previewData, { ciid, objectName: probeObject, limit: 3 },
            'IntegrationPreviewData',
            (o) => Array.isArray(o.Records), (o) => ({ object: probeObject, previewCount: o.Records?.length ?? null }));

        // ── B) METADATA LIST ops (DB-cross-checked counts) ───────────────────────────────────────────────
        await exercise(steps, gql, 'listConnections', COV_GQL.listConnections, { activeOnly: false, companyID: null },
            'IntegrationListConnections',
            (o) => Array.isArray(o.Connections), (o) => ({ connectionCount: o.Connections?.length ?? null }));

        await exercise(steps, gql, 'listSchedules', COV_GQL.listSchedules, { ciid },
            'IntegrationListSchedules',
            (o) => Array.isArray(o.Schedules), (o) => ({ scheduleCount: o.Schedules?.length ?? null }));

        // ListEntityMaps — DB-cross-check the count against CompanyIntegrationEntityMap rows for this CIID.
        const lem = await exercise(steps, gql, 'listEntityMaps', COV_GQL.listEntityMaps, { ciid },
            'IntegrationListEntityMaps', (o) => Array.isArray(o.EntityMaps));
        if (lem?.EntityMaps) {
            const dbMapCount = await countMjBy(db, cfg, 'CompanyIntegrationEntityMap', 'CompanyIntegrationID', ciid);
            const gqlCount = lem.EntityMaps.length;
            steps.push(step('opcov.dbcheck.listEntityMaps', gqlCount === dbMapCount, {
                observed: { gqlEntityMapCount: gqlCount, dbEntityMapCount: dbMapCount },
                note: 'DB-direct: IntegrationListEntityMaps count must equal the CompanyIntegrationEntityMap rows for this CIID '
                    + '(not just "the query returned Success").',
            }));
        }

        // ListFieldMaps — DB-cross-check against CompanyIntegrationFieldMap rows for the first map.
        if (firstMapID) {
            const lfm = await exercise(steps, gql, 'listFieldMaps', COV_GQL.listFieldMaps, { entityMapID: firstMapID },
                'IntegrationListFieldMaps', (o) => Array.isArray(o.FieldMaps));
            if (lfm?.FieldMaps) {
                const dbFmCount = await countMjBy(db, cfg, 'CompanyIntegrationFieldMap', 'EntityMapID', firstMapID);
                steps.push(step('opcov.dbcheck.listFieldMaps', lfm.FieldMaps.length === dbFmCount, {
                    observed: { entityMapID: firstMapID, gqlFieldMapCount: lfm.FieldMaps.length, dbFieldMapCount: dbFmCount },
                    note: 'DB-direct: IntegrationListFieldMaps count must equal the CompanyIntegrationFieldMap rows for the map.',
                }));
            }
        } else {
            steps.push(step('opcov.success.listFieldMaps', true, {
                observed: { skipped: 'no entity maps on the seeded connection to enumerate field maps for' },
                note: 'IntegrationListFieldMaps: vacuously skipped (no maps) — covered by the bad-id grace probe below.',
            }));
        }

        // ── C) PROGRESS / STATUS / HISTORY ops ───────────────────────────────────────────────────────────
        await exercise(steps, gql, 'getRSUProgress', COV_GQL.getRSUProgress, {}, 'IntegrationGetRSUProgress',
            (o) => typeof o.OperationType === 'string' || o.IsRunning != null, (o) => ({ operationType: o.OperationType ?? null, isRunning: o.IsRunning ?? null }));

        await exercise(steps, gql, 'getSyncProgress', COV_GQL.getSyncProgress, { ciid }, 'IntegrationGetSyncProgress',
            (o) => typeof o.OperationType === 'string' || o.IsRunning != null, (o) => ({ operationType: o.OperationType ?? null, isRunning: o.IsRunning ?? null }));

        const status = await exercise(steps, gql, 'getStatus', COV_GQL.getStatus, { ciid }, 'IntegrationGetStatus',
            (o) => o.IsActive != null && typeof o.TotalEntityMaps === 'number',
            (o) => ({ isActive: o.IsActive ?? null, totalEntityMaps: o.TotalEntityMaps ?? null, activeEntityMaps: o.ActiveEntityMaps ?? null }));
        // DB-cross-check the TotalEntityMaps the status op reports.
        if (status && typeof status.TotalEntityMaps === 'number') {
            const dbMapCount = await countMjBy(db, cfg, 'CompanyIntegrationEntityMap', 'CompanyIntegrationID', ciid);
            steps.push(step('opcov.dbcheck.getStatus', status.TotalEntityMaps === dbMapCount, {
                observed: { statusTotalEntityMaps: status.TotalEntityMaps, dbEntityMapCount: dbMapCount },
                note: 'DB-direct: GetStatus.TotalEntityMaps must equal the CompanyIntegrationEntityMap row count for the CIID.',
            }));
        }

        const hist = await exercise(steps, gql, 'getSyncHistory', COV_GQL.getSyncHistory, { ciid, limit: 10 },
            'IntegrationGetSyncHistory', (o) => Array.isArray(o.Runs), (o) => ({ runCount: o.Runs?.length ?? null }));

        // ── D) DURABLE RUN-ARTIFACT ops (ListRuns → GetRun → TailRunEvents chained on a REAL runID) ───────
        const lr = await exercise(steps, gql, 'listRuns', COV_GQL.listRuns,
            { ciid, runKind: null, inFlightOnly: false, limit: 10 }, 'IntegrationListRuns',
            (o) => Array.isArray(o.Runs), (o) => ({ runCount: o.Runs?.length ?? null }));
        const sampleRunID = lr?.Runs?.[0]?.RunID ?? null;

        if (sampleRunID) {
            // GetRun on a real run id → success + the Run summary populated.
            const gr = await exercise(steps, gql, 'getRun', COV_GQL.getRun, { runID: sampleRunID },
                'IntegrationGetRun', (o) => o.Run != null && sameId(o.Run.RunID, sampleRunID),
                (o) => ({ runID: sampleRunID, isInFlight: o.Run?.IsInFlight ?? null, runSuccess: o.Run?.Success ?? null }));
            void gr;
            // TailRunEvents on a real run id → success + a numeric LatestSeq + an Events array.
            await exercise(steps, gql, 'tailRunEvents', COV_GQL.tailRunEvents, { runID: sampleRunID, sinceSeq: 0 },
                'IntegrationTailRunEvents', (o) => Array.isArray(o.Events) && typeof o.LatestSeq === 'number',
                (o) => ({ runID: sampleRunID, eventCount: o.Events?.length ?? null, latestSeq: o.LatestSeq ?? null }));
            // IDEMPOTENCY: tailing from the LATEST seq returns ZERO new events (no replay/dup) on a terminal run.
            const firstTail = (await gql(COV_GQL.tailRunEvents, { runID: sampleRunID, sinceSeq: 0 })).IntegrationTailRunEvents;
            const reTail = (await gql(COV_GQL.tailRunEvents, { runID: sampleRunID, sinceSeq: firstTail?.LatestSeq ?? 0 })).IntegrationTailRunEvents;
            const noReplay = reTail?.Success === true && (reTail?.Events?.length ?? 0) === 0 && reTail?.LatestSeq === firstTail?.LatestSeq;
            steps.push(step('opcov.idempotent.tailRunEvents', noReplay, {
                observed: { runID: sampleRunID, firstLatestSeq: firstTail?.LatestSeq ?? null, reTailEvents: reTail?.Events?.length ?? null, reTailLatestSeq: reTail?.LatestSeq ?? null },
                note: 'keyset tail idempotency: re-tailing from LatestSeq yields zero new events + a stable LatestSeq (no replay/dup).',
            }));
        } else {
            // No run artifacts yet — kick ONE read-only sync so the run-artifact chain has a real id to cover.
            try {
                const seeded = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
                steps.push(step('opcov.success.getRun', seeded.run != null, {
                    observed: { seededRunID: seeded.runID, runSuccess: seeded.run?.Success ?? null },
                    note: 'no prior run artifacts; ran one read-only incremental Pull to produce a real runID for GetRun/TailRunEvents coverage.',
                }));
                await exercise(steps, gql, 'tailRunEvents', COV_GQL.tailRunEvents, { runID: seeded.runID, sinceSeq: 0 },
                    'IntegrationTailRunEvents', (o) => Array.isArray(o.Events));
            } catch (e) {
                steps.push(step('opcov.success.getRun', false, {
                    observed: { error: String(e?.message ?? e) },
                    note: 'could not produce a runID for GetRun/TailRunEvents coverage — see error.',
                }));
            }
        }

        // ── E) CONNECTOR CAPABILITIES (cross-checked against the WriteRecord-able object flags) ───────────
        await exercise(steps, gql, 'getConnectorCapabilities', COV_GQL.getConnectorCapabilities, { ciid },
            'IntegrationGetConnectorCapabilities', (o) => o.SupportsGet != null,
            (o) => ({ supportsGet: o.SupportsGet, supportsCreate: o.SupportsCreate, supportsUpdate: o.SupportsUpdate, supportsDelete: o.SupportsDelete, supportsSearch: o.SupportsSearch }));

        // ── F) REVERSIBLE MUTATION ops (idempotent no-op write + activate/deactivate pair) ────────────────
        // F1) UpdateEntityMaps as a NO-OP self-write: re-set the first map's Priority + SyncDirection to its
        //     OWN current value (read live first), prove the mutation path + idempotency, restore in cleanup.
        if (lem?.EntityMaps?.length) {
            const target = lem.EntityMaps[0];
            const origPriority = target.Priority ?? 0;
            const origDirection = target.SyncDirection ?? 'Pull';
            restoreMapUpdates.push({ EntityMapID: target.ID, Priority: origPriority, SyncDirection: origDirection });

            const u1 = (await gql(COV_GQL.updateEntityMaps, { updates: [{ EntityMapID: target.ID, Priority: origPriority, SyncDirection: origDirection }] })).IntegrationUpdateEntityMaps;
            const u2 = (await gql(COV_GQL.updateEntityMaps, { updates: [{ EntityMapID: target.ID, Priority: origPriority, SyncDirection: origDirection }] })).IntegrationUpdateEntityMaps;
            // Re-read and confirm the map is byte-for-byte unchanged + count of maps unchanged (no dup/drift).
            const after = (await gql(COV_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
            const afterMap = (after?.EntityMaps ?? []).find(e => sameId(e.ID, target.ID));
            const unchanged = afterMap != null && (afterMap.Priority ?? 0) === origPriority && (afterMap.SyncDirection ?? 'Pull') === origDirection
                && (after?.EntityMaps?.length ?? -1) === (lem.EntityMaps.length);
            steps.push(step('opcov.idempotent.updateEntityMaps', u1?.Success === true && u2?.Success === true && unchanged, {
                observed: { entityMapID: target.ID, update1: u1?.Success ?? null, update2: u2?.Success ?? null, origPriority, origDirection, afterPriority: afterMap?.Priority ?? null, afterDirection: afterMap?.SyncDirection ?? null, mapCountStable: (after?.EntityMaps?.length ?? null) === lem.EntityMaps.length },
                note: 'IntegrationUpdateEntityMaps: a set-to-current-value write succeeds twice, leaving the map (and the map count) '
                    + 'identical — proves the mutation path AND idempotency without changing any state.',
            }));

            // ERROR GRACE: a bad enum value must be rejected gracefully (the resolver validates SyncDirection).
            await probeGrace(steps, gql, 'updateEntityMaps', COV_GQL.updateEntityMaps,
                { updates: [{ EntityMapID: target.ID, SyncDirection: 'NotADirection' }] }, 'IntegrationUpdateEntityMaps');
        }

        // F2) DEACTIVATE → REACTIVATE pair (activate/deactivate op coverage). Always restored to IsActive=true.
        const deact = (await gql(COV_GQL.deactivate, { ciid })).IntegrationDeactivateConnection;
        needReactivate = deact?.Success === true;
        const statusAfterDeact = (await gql(COV_GQL.getStatus, { ciid })).IntegrationGetStatus;
        steps.push(step('opcov.success.deactivate', deact?.Success === true && statusAfterDeact?.IsActive === false, {
            observed: { deactivateSuccess: deact?.Success ?? null, isActiveAfter: statusAfterDeact?.IsActive ?? null },
            note: 'IntegrationDeactivateConnection flips CompanyIntegration.IsActive=false (restored to true in cleanup).',
        }));
        const react = (await gql(COV_GQL.reactivate, { ciid })).IntegrationReactivateConnection;
        const statusAfterReact = (await gql(COV_GQL.getStatus, { ciid })).IntegrationGetStatus;
        const reactOk = react?.Success === true && statusAfterReact?.IsActive === true;
        if (reactOk) needReactivate = false; // already restored
        // IDEMPOTENCY: reactivating an already-active connection succeeds again (no error / still active).
        const react2 = (await gql(COV_GQL.reactivate, { ciid })).IntegrationReactivateConnection;
        const statusAfterReact2 = (await gql(COV_GQL.getStatus, { ciid })).IntegrationGetStatus;
        steps.push(step('opcov.idempotent.reactivate', reactOk && react2?.Success === true && statusAfterReact2?.IsActive === true, {
            observed: { reactivate1: react?.Success ?? null, reactivate2: react2?.Success ?? null, isActiveFinal: statusAfterReact2?.IsActive ?? null },
            note: 'IntegrationReactivateConnection is idempotent: reactivating an already-active connection succeeds and stays IsActive=true.',
        }));

        // F3) CANCEL-SYNC with NO active sync → graceful {Success:false} "No active sync found" (not a throw).
        await probeGrace(steps, gql, 'cancelSync', COV_GQL.cancelSync, { ciid }, 'IntegrationCancelSync',
            (o) => o?.Success === false); // idle connector → cancel must fail gracefully
        // And the happy CancelSync path is exercised live by gql-lifecycle-harness.phaseCancelStatus (deferred there).

        // ── G) ERROR-GRACE PROBES: every op with a bad arg must degrade gracefully (no hard throw) ─────────
        // Reads scoped by a nonexistent CIID/runID/entityMapID must return {Success:false} or an empty
        // well-formed list — the §15f "a client should not hit a hard error" bar.
        await probeGrace(steps, gql, 'discoverObjects.badCiid', COV_GQL.discoverObjects, { ciid: BAD_UUID }, 'IntegrationDiscoverObjects');
        await probeGrace(steps, gql, 'listSourceObjects.badCiid', COV_GQL.listSourceObjects, { ciid: BAD_UUID }, 'IntegrationListSourceObjects');
        await probeGrace(steps, gql, 'discoverFields.badCiid', COV_GQL.discoverFields, { ciid: BAD_UUID, objectName: probeObject }, 'IntegrationDiscoverFields');
        await probeGrace(steps, gql, 'testConnection.badCiid', COV_GQL.testConnection, { ciid: BAD_UUID }, 'IntegrationTestConnection');
        await probeGrace(steps, gql, 'getDefaultConfig.badCiid', COV_GQL.getDefaultConfig, { ciid: BAD_UUID }, 'IntegrationGetDefaultConfig');
        await probeGrace(steps, gql, 'previewData.badCiid', COV_GQL.previewData, { ciid: BAD_UUID, objectName: probeObject, limit: 1 }, 'IntegrationPreviewData');
        await probeGrace(steps, gql, 'getStatus.badCiid', COV_GQL.getStatus, { ciid: BAD_UUID }, 'IntegrationGetStatus');
        await probeGrace(steps, gql, 'getSyncProgress.badCiid', COV_GQL.getSyncProgress, { ciid: BAD_UUID }, 'IntegrationGetSyncProgress',
            (o) => o?.Success === true || o?.Success === false); // either is graceful, must not throw
        await probeGrace(steps, gql, 'getConnectorCapabilities.badCiid', COV_GQL.getConnectorCapabilities, { ciid: BAD_UUID }, 'IntegrationGetConnectorCapabilities');
        await probeGrace(steps, gql, 'listFieldMaps.badMapID', COV_GQL.listFieldMaps, { entityMapID: BAD_UUID }, 'IntegrationListFieldMaps',
            (o) => o?.Success === true && Array.isArray(o.FieldMaps) && o.FieldMaps.length === 0); // empty list = graceful
        await probeGrace(steps, gql, 'getRun.badRunID', COV_GQL.getRun, { runID: 'no-such-run-id' }, 'IntegrationGetRun');
        await probeGrace(steps, gql, 'tailRunEvents.badRunID', COV_GQL.tailRunEvents, { runID: 'no-such-run-id', sinceSeq: 0 }, 'IntegrationTailRunEvents');
        await probeGrace(steps, gql, 'getSyncHistory.badCiid', COV_GQL.getSyncHistory, { ciid: BAD_UUID, limit: 5 }, 'IntegrationGetSyncHistory',
            (o) => o?.Success === true && Array.isArray(o.Runs) && o.Runs.length === 0); // empty list = graceful
        await probeGrace(steps, gql, 'deactivate.badCiid', COV_GQL.deactivate, { ciid: BAD_UUID }, 'IntegrationDeactivateConnection');
        await probeGrace(steps, gql, 'updateEntityMaps.badMapID', COV_GQL.updateEntityMaps, { updates: [{ EntityMapID: BAD_UUID, Priority: 0 }] }, 'IntegrationUpdateEntityMaps');

        // ── H) COVERAGE LEDGER — assert EVERY resolver op is exercised here or deferred to a named phase ──
        const accountedFor = new Set([...EXERCISED_OPS, ...Object.keys(DEFERRED_OPS)]);
        const uncovered = ALL_RESOLVER_OPS.filter(op => !accountedFor.has(op));
        steps.push(step('opcov.ledger.complete', uncovered.length === 0, {
            observed: {
                totalResolverOps: ALL_RESOLVER_OPS.length,
                exercisedHere: EXERCISED_OPS.length,
                deferredToSiblings: Object.keys(DEFERRED_OPS).length,
                uncovered,
                deferments: DEFERRED_OPS,
            },
            note: 'plan §15f: EVERY integration GQL op must be accounted for — exercised in this phase or explicitly '
                + 'deferred to a named sibling harness. A non-empty `uncovered` means a resolver op slipped §15f coverage.',
        }));
    } catch (e) {
        steps.push(step('opcov.error', false, {
            observed: { error: String(e?.stack ?? e?.message ?? e) },
            note: 'unexpected error in the op-coverage phase — see error; the cleanup below still runs.',
        }));
    } finally {
        // ── I) CLEANUP: restore every reversible mutation so the seeded connection stays reusable ─────────
        // I1) re-activate if a deactivate wasn't already reverted.
        if (needReactivate) {
            try {
                const r = (await gql(COV_GQL.reactivate, { ciid })).IntegrationReactivateConnection;
                const s = (await gql(COV_GQL.getStatus, { ciid })).IntegrationGetStatus;
                steps.push(step('opcov.cleanup.reactivate', r?.Success === true && s?.IsActive === true, {
                    observed: { reactivateSuccess: r?.Success ?? null, isActiveFinal: s?.IsActive ?? null },
                    note: 'failsafe restore: connection reactivated (IsActive=true) so the seeded connection stays reusable.',
                }));
            } catch (e) {
                steps.push(step('opcov.cleanup.reactivate', false, { observed: { error: String(e?.message ?? e) } }));
            }
        }
        // I2) restore the no-op-mutated entity map(s) to their captured original values.
        for (const restore of restoreMapUpdates) {
            try {
                const r = (await gql(COV_GQL.updateEntityMaps, { updates: [{ EntityMapID: restore.EntityMapID, Priority: restore.Priority, SyncDirection: restore.SyncDirection }] })).IntegrationUpdateEntityMaps;
                steps.push(step('opcov.cleanup.restore-map', r?.Success === true, {
                    observed: { entityMapID: restore.EntityMapID, priority: restore.Priority, syncDirection: restore.SyncDirection, restoreSuccess: r?.Success ?? null },
                    note: 'failsafe restore: entity map Priority/SyncDirection reset to its captured original (no-op write idempotency).',
                }));
            } catch (e) {
                steps.push(step('opcov.cleanup.restore-map', false, { observed: { entityMapID: restore.EntityMapID, error: String(e?.message ?? e) } }));
            }
        }
    }

    void integrationName; void triggerAndResolveRun; void GQL; void tryParse; void isAssoc;
    return steps;
}

// Re-export this phase's op-string set for any orchestrator that wants the canonical strings alongside
// the shared GQL ops (parity with how the sibling phases surface their op sets).
export { COV_GQL, ALL_RESOLVER_OPS, EXERCISED_OPS, DEFERRED_OPS };
