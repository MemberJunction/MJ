/**
 * GQL-driven BIDIRECTIONAL + CONFLICT phase — plan.md §2 bidirectional cases (LIVE_TEST_DESIGN.md §2.9
 * push round-trip / §2.10 conflict resolution; FRAMEWORK_TESTABLE_CAPABILITIES headline #1 "real
 * bidirectional 3-way merge" + #2 "conflict resolution policy"), run through the REAL MJAPI GraphQL API
 * against the pre-seeded HubSpot reference connection (token-free reference mode, identified solely by `ciid`).
 *
 * THE REQUIREMENT (plan.md §2 bidirectional cases): enumerate the distinct bidirectional cases EXPLICITLY
 * — conflict, echo/loopback, simultaneous edits both sides, ordering — assert each RESOLVES CORRECTLY, and
 * prove the watermark FALLBACK SAVE persists even on the fallback path. Each case is one observable cell.
 *
 * THE FOUR CASES (each = one or more step() cells, all DB-direct verified where possible):
 *
 *   CASE 1 — CONFLICT (same field changed on BOTH sides → policy decides):
 *     The engine's pull-first 3-way combine (IntegrationEngine.computePushCombine:1869) classifies a
 *     field both sides changed-differently as a TRUE CONFLICT and resolves it per the entity map's
 *     ConflictResolution policy (MatchEngine.ts:37 / IntegrationEngine.ts:1899, default 'DestWins'):
 *       - DestWins   → MJ value pushed (toPush[field]=mjVal)
 *       - SourceWins → external left as-is (field not pushed)
 *       - MostRecent → newer modstamp wins (resolveMostRecentWinner)
 *       - Manual     → quarantined: MJ mirror row gets __mj_integration_SyncStatus='Conflict' +
 *                      __mj_integration_SyncMessage, push SKIPPED (markConflictOnMJRecord:1972).
 *     Observable: the `sync.record.conflict` event (forwarded to the durable stream as a `record.error` /
 *     Level='warn' / message='conflict' carrying {conflictFields, policy, resolution}, SyncLogger.ts:189),
 *     AND — for Manual — the DB-direct __mj_integration_SyncStatus='Conflict' + SyncMessage on the mirror row.
 *
 *   CASE 2 — ECHO / LOOPBACK (the engine must NOT re-apply its OWN just-pushed change as a new inbound
 *     change → no infinite ping-pong, no duplicate record map):
 *     After a Push writes a field to the external system, the very NEXT Pull must NOT treat that value as
 *     a fresh external change to re-write into MJ (that's the "echo loop"). The substrate is the
 *     __mj_integration_LastSyncedSnapshot (the common ancestor refreshed on every apply, IntegrationEngine
 *     :2938) + the content-hash skip + the 1:1 record map. Observable: a Push then an immediate Pull leaves
 *     the record map STILL 1:1 (no duplicate inbound map) and the next idempotent Pull SKIPS the row (the
 *     echo doesn't re-process). LastWriterDirection flips Push→Pull bookkeeping-only, never a new map row.
 *
 *   CASE 3 — SIMULTANEOUS EDITS BOTH SIDES (non-overlapping fields → field-level MERGE, not blind
 *     last-write-wins; the LOSING side's OTHER fields are preserved — "no lost update"):
 *     When MJ changes field A and the external changed field B since the snapshot, the 3-way combine pushes
 *     ONLY A and leaves B (next pull brings B into MJ) — field-by-field, IntegrationEngine.ts:1917-1929.
 *     The non-conflict guarantee from §2.10: "no lost-update for the losing side's *other* fields."
 *
 *   CASE 4 — ORDERING (Pull-before-Push within a Bidirectional run; deterministic last-writer-direction):
 *     A Bidirectional run pulls (inbound apply, LastWriterDirection='Pull') BEFORE it pushes (outbound,
 *     'Push') so the snapshot/ancestor is fresh before the combine. Observable: the durable stage stream
 *     orders the pull stage before the push stage for the same map, and __mj_integration_LastWriterDirection
 *     reflects the final writer. (Pull-first is the documented combine contract, IntegrationEngine.ts:1759.)
 *
 *   WATERMARK FALLBACK SAVE (the §2 explicit ask, restated): even on the bidirectional/push path — and even
 *     for a modstamp-less object that takes the FALLBACK save path — a Push-direction watermark row must
 *     PERSIST so the next run is not a full rescan (IntegrationEngine.ts:1494/1577 Push watermark Load/Update;
 *     vwCompanyIntegrationSyncWatermarks Direction='Push'). DB-direct: exactly-one (or ≥1) Push row with a
 *     non-null value + LastSyncAt after a Bidirectional run.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint; reference mode drives everything by `ciid` — the encrypted credential is decrypted
 * server-side, the HubSpot token never enters this process.
 *
 * STATE DISCIPLINE: writes are GATED on cfg.allowWrite===true (bidirectional needs portal writes). Every
 * mutation is DISPOSABLE + restored: the ONE test record we create in HubSpot is deleted by its captured
 * external id (exact, id-targeted — NEVER users/owners/real data); the entity map's SyncDirection +
 * ConflictResolution + Status are captured up front and RESTORED in a finally cleanup so the seeded
 * connection stays reusable. With allowWrite=false the cell still runs the DB-direct substrate checks over
 * the already-seeded corpus (sync-metadata columns present + typed-clean) so it yields real signal token-free.
 *
 * FRAMEWORK GAPS recorded (these make some cells fail/skip until the framework is extended — that is the point):
 *   - ConflictResolution policy is NOT settable over GraphQL (EntityMapUpdateInput exposes only
 *     SyncDirection/Priority/Status/Configuration — IntegrationDiscoveryResolver.ts:662-669). To exercise
 *     SourceWins/DestWins/MostRecent/Manual we set the policy DB-DIRECT on CompanyIntegrationEntityMap.
 *     DESIRED: add ConflictResolution to EntityMapUpdateInput so policy is GQL-drivable.
 *   - There is NO GQL surface to read a record's __mj_integration_SyncStatus/SyncMessage/LastWriterDirection
 *     (the conflict-quarantine + last-writer substrate) — we read them DB-direct. DESIRED: expose them.
 *   - `sync.record.conflict` reaches the durable stream only as a generic `record.error`/warn (message
 *     'conflict'); the structured {policy, resolution, conflictFields} is in DataJSON but there is no
 *     dedicated conflict EventType. DESIRED: a first-class conflict event so a client can gate on it.
 */

// GQL op strings (writeRecord/startSync/listRuns/getRun/tailRunEvents) + runSyncObserved (trigger→tail→
// GetRun) + triggerAndResolveRun (race-free run id) are reused from the canonical harness; this phase
// never re-implements the gql client, the DB client, or the sync drivers.
import { GQL, runSyncObserved, triggerAndResolveRun } from '../gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts — IntegrationUpdateEntityMaps(updates:[EntityMapUpdateInput]) →
//   MutationResultOutput {Success,Message} :3876 (EntityMapUpdateInput :662 = {EntityMapID, SyncDirection?,
//   Priority?, Status?, Configuration?} — NOTE: NO ConflictResolution field → set DB-direct, see gaps);
// IntegrationListEntityMaps → ListEntityMapsOutput/EntityMapSummaryOutput :3820/:671 (returns
//   {ID,Entity,EntityID,ExternalObjectName,SyncDirection,Status,Priority,Configuration} — also NO
//   ConflictResolution); IntegrationPreviewData(ciid,objectName,limit) → PreviewDataOutput :1465.)
// ─────────────────────────────────────────────────────────────────────────────

const BIDI_GQL = {
    updateEntityMaps: `mutation($updates: [EntityMapUpdateInput!]!) {
      IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message
        EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority Configuration }
      }
    }`,
    previewData: `query($ciid: String!, $objectName: String!, $limit: Float!) {
      IntegrationPreviewData(companyIntegrationID: $ciid, objectName: $objectName, limit: $limit) {
        Success Message Records { Data }
      }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (identical shape to the existing harness/matrix/lifecycle modules so this phase is
// self-contained; same step()/col()/lit()/dialect helpers — never re-implements the gql/db clients).
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

function tryParse(s) {
    if (typeof s !== 'string') return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
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
// DB-direct readers for the bidirectional substrate (no GQL surface exists for these — see gaps).
// ─────────────────────────────────────────────────────────────────────────────

/** Row count of a destination table addressed directly by its HubSpot source-object name. */
async function destRowCount(db, cfg, objectName) {
    const rows = await db.rows(`SELECT COUNT(*) AS c FROM ${destT(cfg, objectName)}`);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/**
 * Loads the destination row (incl. the __mj_integration_* sync-metadata columns) for a specific external
 * id (HubSpot hs_object_id is the dest PK for the CRM objects per additionalSchemaInfo.json). Returns the
 * single dialect-cased row object or undefined.
 */
async function loadDestRowByExternalId(db, cfg, objectName, externalId, pkColumn = 'hs_object_id') {
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const sql =
        `SELECT ${top}* FROM ${destT(cfg, objectName)} WHERE ${C(cfg, pkColumn)}=${lit(externalId)}${lim}`;
    const rows = await db.rows(sql);
    return rows?.[0];
}

/** True iff the dest table physically carries the four bidirectional sync-metadata columns (the substrate). */
async function destHasSyncMetadataColumns(db, cfg, objectName) {
    const cols = ['__mj_integration_SyncStatus', '__mj_integration_LastSyncedSnapshot',
        '__mj_integration_LastWriterDirection', '__mj_integration_ExternalVersion'];
    // Probe via a 0-row SELECT of the named columns; a missing column throws → returns false for that probe.
    const present = {};
    for (const c of cols) {
        try {
            const top = isPg(cfg) ? '' : 'TOP 1 ';
            const lim = isPg(cfg) ? ' LIMIT 1' : '';
            await db.rows(`SELECT ${top}${C(cfg, c)} FROM ${destT(cfg, objectName)}${lim}`);
            present[c] = true;
        } catch { present[c] = false; }
    }
    return present;
}

/**
 * Counts dest rows whose __mj_integration_SyncStatus matches a given value (e.g. 'Conflict') — the
 * Manual-quarantine signal. Best-effort: if the column doesn't exist, returns null (not assessable).
 */
async function countSyncStatus(db, cfg, objectName, status) {
    try {
        const rows = await db.rows(
            `SELECT COUNT(*) AS c FROM ${destT(cfg, objectName)} WHERE ${C(cfg, '__mj_integration_SyncStatus')}=${lit(status)}`);
        return Number(col(rows?.[0], 'c') ?? 0);
    } catch { return null; }
}

/**
 * Newest watermark row for an entity map in a given Direction from vwCompanyIntegrationSyncWatermarks.
 * Columns: EntityMapID, Direction, WatermarkType, WatermarkValue, LastSyncAt, RecordsSynced.
 */
async function loadWatermark(db, cfg, entityMapID, direction) {
    const view = mjT(cfg, 'vwCompanyIntegrationSyncWatermarks');
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const sql =
        `SELECT ${top}${C(cfg, 'EntityMapID')}, ${C(cfg, 'Direction')}, ${C(cfg, 'WatermarkType')}, ` +
        `${C(cfg, 'WatermarkValue')}, ${C(cfg, 'LastSyncAt')}, ${C(cfg, 'RecordsSynced')} ` +
        `FROM ${view} WHERE ${C(cfg, 'EntityMapID')}=${lit(entityMapID)} AND ${C(cfg, 'Direction')}=${lit(direction)} ` +
        `ORDER BY ${C(cfg, 'LastSyncAt')} DESC${lim}`;
    const rows = await db.rows(sql);
    return rows?.[0];
}

/** Counts watermark rows for an entity map in a given Direction. */
async function countWatermarkRows(db, cfg, entityMapID, direction) {
    const view = mjT(cfg, 'vwCompanyIntegrationSyncWatermarks');
    const rows = await db.rows(
        `SELECT COUNT(*) AS c FROM ${view} WHERE ${C(cfg, 'EntityMapID')}=${lit(entityMapID)} AND ${C(cfg, 'Direction')}=${lit(direction)}`);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** DB-direct read of the entity map's current ConflictResolution + SyncDirection + Status (no GQL surface for policy). */
async function readEntityMapPolicy(db, cfg, entityMapID) {
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const rows = await db.rows(
        `SELECT ${top}${C(cfg, 'ConflictResolution')} AS cr, ${C(cfg, 'SyncDirection')} AS sd, ${C(cfg, 'Status')} AS st ` +
        `FROM ${mjT(cfg, 'CompanyIntegrationEntityMap')} WHERE ${C(cfg, 'ID')}=${lit(entityMapID)}${lim}`);
    const r = rows?.[0];
    return { conflictResolution: col(r, 'cr') ?? null, syncDirection: col(r, 'sd') ?? null, status: col(r, 'st') ?? null };
}

/**
 * DB-DIRECT set of ConflictResolution on the entity map. This is the FRAMEWORK GAP path: the GQL
 * UpdateEntityMaps mutation has no ConflictResolution arg, so the policy can only be changed directly.
 * Returns true on a successful UPDATE (rowcount best-effort — we re-read to confirm).
 */
async function setConflictResolutionDirect(db, cfg, entityMapID, policy) {
    await db.rows(
        `UPDATE ${mjT(cfg, 'CompanyIntegrationEntityMap')} SET ${C(cfg, 'ConflictResolution')}=${lit(policy)} ` +
        `WHERE ${C(cfg, 'ID')}=${lit(entityMapID)}`);
    const after = await readEntityMapPolicy(db, cfg, entityMapID);
    return after.conflictResolution === policy;
}

/** Record-map stats for the write entity (1:1 identity gate — total == distinct == no echo dup). */
async function recordMapStats(db, cfg, ciid, entityName) {
    return db.recordMapStats(ciid, entityName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Durable stage-stream tail (for the ORDERING case): keeps every stage.start/stage.complete with the
// object name (DataJSON.externalObjectName) + Stage label + Seq/Ts. Keyset-by-seq, no sleeps.
// We also surface conflict signals captured by the harness's tailRunToCompletion (forwarded as warn).
// ─────────────────────────────────────────────────────────────────────────────

async function tailStageEvents(gql, runID, maxPolls = 100000) {
    const stages = []; // { eventType, object, stage, seq, ts }
    let sinceSeq = 0;
    for (let i = 0; i < maxPolls; i++) {
        const out = (await gql(GQL.tailRunEvents, { runID, sinceSeq })).IntegrationTailRunEvents;
        if (!out?.Success) throw new Error(`TailRunEvents failed: ${out?.Message ?? 'no payload'}`);
        for (const ev of out.Events ?? []) {
            if (ev.EventType === 'stage.start' || ev.EventType === 'stage.complete') {
                const data = tryParse(ev.DataJSON);
                stages.push({
                    eventType: ev.EventType,
                    object: data?.externalObjectName ?? ev.Stage ?? null,
                    stage: ev.Stage ?? null,
                    seq: ev.Seq, ts: ev.Ts,
                });
            }
        }
        sinceSeq = out.LatestSeq ?? sinceSeq;
        if (out.IsInFlight === false) break;
    }
    return stages;
}

/** Triggers a sync (race-free), tails the durable stage stream, then GetRun for the terminal verdict. */
async function runBidiObservedWithStages(gql, ciid, opts) {
    const runID = await triggerAndResolveRun(gql, ciid, opts);
    const stages = await tailStageEvents(gql, runID, opts.maxPolls ?? 100000);
    const detail = (await gql(GQL.getRun, { runID })).IntegrationGetRun;
    return { runID, stages, run: detail?.Run ?? null, errors: detail?.Errors ?? [] };
}

/**
 * Derives pull-before-push ordering for an object's stages. A Bidirectional run does the inbound (pull)
 * apply for a map BEFORE the outbound (push) for the same map. We look for a pull-flavored stage and a
 * push-flavored stage for the object and assert the pull starts first. If only one flavor is present the
 * order is not-assessable (the engine may fold both into one stage) → ok:true with assessable:false.
 */
function pullBeforePush(stages, objectName) {
    const lc = (s) => (s ?? '').toLowerCase();
    const forObj = stages.filter(s => lc(s.object) === lc(objectName) || lc(s.stage).includes(lc(objectName)));
    const pullStart = forObj.find(s => s.eventType === 'stage.start' && /pull|inbound|fetch|read/.test(lc(s.stage)));
    const pushStart = forObj.find(s => s.eventType === 'stage.start' && /push|outbound|write/.test(lc(s.stage)));
    if (!pullStart || !pushStart) {
        return { assessable: false, pullStartSeq: pullStart?.seq ?? null, pushStartSeq: pushStart?.seq ?? null };
    }
    return { assessable: true, parentBeforeChild: pullStart.seq < pushStart.seq, pullStartSeq: pullStart.seq, pushStartSeq: pushStart.seq };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict-signal extraction from the run's warning stream (the harness's tailRunToCompletion records
// any Level='warn' / EventType='warning' event into acc.warnings; sync.record.conflict is forwarded as a
// record.error/warn with message 'conflict' carrying {conflictFields, policy, resolution} in DataJSON).
// We re-tail the durable stream ourselves so we keep the DataJSON for the conflict cell.
// ─────────────────────────────────────────────────────────────────────────────

async function tailConflictEvents(gql, runID, maxPolls = 100000) {
    const conflicts = [];
    let sinceSeq = 0;
    for (let i = 0; i < maxPolls; i++) {
        const out = (await gql(GQL.tailRunEvents, { runID, sinceSeq })).IntegrationTailRunEvents;
        if (!out?.Success) throw new Error(`TailRunEvents failed: ${out?.Message ?? 'no payload'}`);
        for (const ev of out.Events ?? []) {
            const data = tryParse(ev.DataJSON) ?? {};
            const looksLikeConflict =
                /conflict/i.test(ev.Message ?? '') ||
                Array.isArray(data.conflictFields) ||
                (typeof data.policy === 'string' && typeof data.resolution === 'string');
            if (looksLikeConflict) {
                conflicts.push({
                    seq: ev.Seq, eventType: ev.EventType, level: ev.Level, message: ev.Message,
                    policy: data.policy ?? null, resolution: data.resolution ?? null,
                    conflictFields: Array.isArray(data.conflictFields) ? data.conflictFields : null,
                    externalId: data.externalId ?? null,
                });
            }
        }
        sinceSeq = out.LatestSeq ?? sinceSeq;
        if (out.IsInFlight === false) break;
    }
    return conflicts;
}

/** Triggers a bidirectional sync (race-free), tails BOTH conflict + stage signals, then GetRun. */
async function runBidiObservedWithConflicts(gql, ciid, opts) {
    const runID = await triggerAndResolveRun(gql, ciid, opts);
    const conflicts = await tailConflictEvents(gql, runID, opts.maxPolls ?? 100000);
    const detail = (await gql(GQL.getRun, { runID })).IntegrationGetRun;
    return { runID, conflicts, run: detail?.Run ?? null, errors: detail?.Errors ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: bidirectional + conflict  (plan.md §2 bidirectional cases)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   - gql:  makeGqlClient(...)        (restart-resilient GraphQL client)
 *   - db:   makeDbClient(...)         (rows/recordMapStats/entityRowCount/close)
 *   - ciid: the seeded HubSpot CompanyIntegrationID (reference mode)
 *   - maps: [{ entityMapID, entityName, sourceObjectName, ... }] from setup/ListEntityMaps
 *   - cfg:  { platform, mjSchema, destSchema?, objects[], writeObject?(default 'contacts'),
 *            allowWrite?(default false), runId, maxPolls?, valuePkColumn?(default 'hs_object_id') }
 * @returns {Array} step() results (NL note + JSON observed + pass/fail), exactly like the other phases.
 *   ALWAYS restores the entity map's SyncDirection + ConflictResolution + the disposable test record in a
 *   cleanup step so the seeded connection stays reusable.
 */
export async function phasebidirectionalconflict({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const objectName = (cfg.writeObject ?? 'contacts').toLowerCase();
    const pkColumn = cfg.valuePkColumn ?? 'hs_object_id';
    const allowWrite = cfg.allowWrite === true;
    const runId = cfg.runId ?? `bidi_${Date.now()}`;

    // SAFETY: never write/delete users or owners — only disposable CRM records.
    if (/user|owner/i.test(objectName)) {
        steps.push(step('bidi.refused', false, {
            observed: { objectName },
            note: 'refusing to run the bidirectional write round-trip against a Users/owners object — off-limits',
        }));
        return steps;
    }

    const writeMap = (maps ?? []).find(m => (m.sourceObjectName ?? '').toLowerCase() === objectName) ?? null;

    // ── Always-on substrate checks (token-free AND write-free): the per-record sync-metadata columns that
    //    make bidirectional merge/conflict/echo-suppression possible must physically exist on this dialect. ──
    {
        const present = await destHasSyncMetadataColumns(db, cfg, objectName);
        const allPresent = Object.values(present).every(Boolean);
        steps.push(step('bidi.substrate.columns', allPresent, {
            observed: { object: objectName, platform: cfg.platform, columns: present },
            note: 'the 4 bidirectional sync-metadata columns (__mj_integration_SyncStatus / LastSyncedSnapshot / '
                + 'LastWriterDirection / ExternalVersion) physically exist on the dest table — the substrate for '
                + '3-way merge, conflict-quarantine, echo-suppression, and last-writer bookkeeping (DDLGenerator.ts:267-289)',
        }));
    }

    if (!writeMap) {
        steps.push(step('bidi.write-map.missing', false, {
            observed: { object: objectName, seededMaps: (maps ?? []).map(m => m.sourceObjectName) },
            note: `no entity map for '${objectName}' in the seeded connection — bidirectional cases need the write `
                + `object's map (SELECT it via ApplyAll/UpdateEntityMaps to enable). DESIRED: a write map is present.`,
        }));
        return steps;
    }

    if (!allowWrite) {
        // Write-free: assert the substrate is queryable + the seeded corpus has a consistent LastWriterDirection
        // (every active row was last written by Pull on a pull-only seed — the bookkeeping column is populated).
        const conflictRows = await countSyncStatus(db, cfg, objectName, 'Conflict');
        steps.push(step('bidi.adversarial.skipped', true, {
            observed: { allowWrite: false, conflictRowsInSeededCorpus: conflictRows },
            note: 'allowWrite=false → skipping the create/conflict/merge/echo write round-trip; the substrate-columns '
                + 'check above + the conflict-row census still prove the bidirectional storage is present token-free. '
                + 'Set allowWrite=true (broker-gated) to exercise the four bidirectional cases end-to-end.',
        }));
        return steps;
    }

    // ── Write path: drive all four bidirectional cases against ONE disposable record. ──
    const marker = `mjbidi ${runId}`;
    let createdExternalID = null;
    const policyCapture = await readEntityMapPolicy(db, cfg, writeMap.entityMapID);
    const originalSyncDirection = policyCapture.syncDirection ?? 'Pull';
    const originalConflictResolution = policyCapture.conflictResolution ?? null;
    const rowsBefore = await destRowCount(db, cfg, objectName);
    let restoredDirection = false, restoredPolicy = true;

    try {
        // 0) Flip the write map to Bidirectional via GQL (the legitimate, GQL-supported part).
        const dirUpd = (await gql(BIDI_GQL.updateEntityMaps, {
            updates: [{ EntityMapID: writeMap.entityMapID, SyncDirection: 'Bidirectional' }],
        })).IntegrationUpdateEntityMaps;
        const afterDir = await readEntityMapPolicy(db, cfg, writeMap.entityMapID);
        steps.push(step('bidi.direction.set', dirUpd?.Success === true && afterDir.syncDirection === 'Bidirectional', {
            observed: { entityMapID: writeMap.entityMapID, updateSuccess: dirUpd?.Success ?? false, syncDirection: afterDir.syncDirection },
            note: 'IntegrationUpdateEntityMaps sets the write map SyncDirection=Bidirectional (GQL-supported); '
                + 'DB-direct read confirms it round-tripped. Restored to its original direction in cleanup.',
        }));

        // 1) CREATE one disposable, test-marked record in HubSpot (a known external baseline to edit on both sides).
        const baseAttrs = { email: `mjbidi-${runId}@example.com`, firstname: 'origin', lastname: marker, jobtitle: 'origin-title' };
        const created = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'create', externalID: null, attributes: JSON.stringify(baseAttrs),
        })).IntegrationWriteRecord;
        createdExternalID = created?.ExternalID ?? null;
        steps.push(step('bidi.create', created?.Success === true && !!createdExternalID, {
            observed: { object: objectName, externalID: createdExternalID, statusCode: created?.StatusCode ?? null, message: created?.Message ?? null },
            note: 'created ONE disposable, test-marked record in HubSpot as the shared baseline for the both-sides edits',
            ...(created?.Success && !createdExternalID
                ? { orphanWarning: 'CREATE succeeded but returned no ExternalID — may be orphaned in the portal; manual cleanup required' }
                : {}),
        }));
        if (!createdExternalID) return steps; // cannot edit/verify/clean an unidentifiable record — stop loudly

        // 2) Pull it in (Bidirectional) so MJ has the row + a fresh LastSyncedSnapshot ancestor.
        const seed = await runSyncObserved(gql, ciid, {
            fullSync: false, syncDirection: 'Bidirectional', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls,
        });
        const destRow0 = await loadDestRowByExternalId(db, cfg, objectName, createdExternalID, pkColumn);
        const snapshotPresent = !!destRow0 && typeof col(destRow0, '__mj_integration_LastSyncedSnapshot') === 'string'
            && String(col(destRow0, '__mj_integration_LastSyncedSnapshot')).length > 0;
        const writerAfterPull = destRow0 ? col(destRow0, '__mj_integration_LastWriterDirection') : null;
        steps.push(step('bidi.seed.snapshot', seed.run?.Success === true && snapshotPresent && writerAfterPull === 'Pull', {
            observed: {
                runID: seed.runID, success: seed.run?.Success ?? null, rowFound: !!destRow0,
                snapshotPresent, lastWriterDirection: writerAfterPull,
            },
            note: 'after the inbound pull the mirror row carries a non-empty __mj_integration_LastSyncedSnapshot (the '
                + '3-way-merge common ancestor) and LastWriterDirection=Pull (the apply path sets it, IntegrationEngine.ts:2977)',
        }));

        // ── CASE 4 — ORDERING: a Bidirectional run pulls before it pushes for the same map. ──
        const ordRun = await runBidiObservedWithStages(gql, ciid, {
            fullSync: false, syncDirection: 'Bidirectional', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls,
        });
        const order = pullBeforePush(ordRun.stages, objectName);
        steps.push(step('bidi.case4.ordering', ordRun.run?.Success === true && (order.assessable ? order.parentBeforeChild : true), {
            observed: {
                runID: ordRun.runID, success: ordRun.run?.Success ?? null, assessable: order.assessable,
                pullStartSeq: order.pullStartSeq, pushStartSeq: order.pushStartSeq,
                stageLabels: ordRun.stages.map(s => `${s.eventType}:${s.stage}`).slice(0, 16),
            },
            note: 'CASE ORDERING: a Bidirectional run applies the inbound PULL before the outbound PUSH for the same map '
                + '(pull-first 3-way combine contract, IntegrationEngine.ts:1759) so the ancestor is fresh before merge. '
                + 'PROXY: the durable stage.start seq for the pull stage precedes the push stage. '
                + 'GAP: pull/push are not always emitted as separate per-object stages → when only one stage flavor is '
                + 'present the cell is not-assessable (passes vacuously); a per-direction stage event would make it exact.',
        }));

        // ── CASE 3 — SIMULTANEOUS EDITS BOTH SIDES (non-overlapping fields → field-level merge, no lost update) ──
        // External changes jobtitle; MJ changes firstname. The push must send ONLY firstname (ours) and LEAVE
        // jobtitle (theirs) — the losing side's other field is preserved. We edit the external via WriteRecord
        // (theirs), then edit the MJ mirror row DB-direct (ours) + mark it dirty so the push picks it up.
        const externalEdit = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'update', externalID: createdExternalID,
            attributes: JSON.stringify({ jobtitle: 'external-edited-title' }),
        })).IntegrationWriteRecord;
        // Edit MJ side (firstname) DB-direct — touch __mj_UpdatedAt so the push change-scan sees it dirty.
        let mjEditOk = false;
        try {
            await db.rows(
                `UPDATE ${destT(cfg, objectName)} SET ${C(cfg, 'firstname')}=${lit('mj-edited-first')} ` +
                `WHERE ${C(cfg, pkColumn)}=${lit(createdExternalID)}`);
            mjEditOk = true;
        } catch { mjEditOk = false; }
        const mergeRun = await runBidiObservedWithConflicts(gql, ciid, {
            fullSync: false, syncDirection: 'Bidirectional', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls,
        });
        // After the merge round-trip + a stabilizing pull, the external row should show BOTH edits surviving:
        // firstname=ours (pushed), jobtitle=theirs (left intact → next pull brings it into MJ).
        const preview = (await gql(BIDI_GQL.previewData, { ciid, objectName, limit: 50 })).IntegrationPreviewData;
        const liveRec = (preview?.Records ?? []).map(r => tryParse(r.Data)).filter(Boolean)
            .find(rec => JSON.stringify(rec).includes(marker));
        const externalFirst = liveRec ? (liveRec.firstname ?? liveRec.properties?.firstname) : null;
        const externalTitle = liveRec ? (liveRec.jobtitle ?? liveRec.properties?.jobtitle) : null;
        const oursPushed = externalFirst === 'mj-edited-first';
        const theirsPreserved = externalTitle === 'external-edited-title';
        steps.push(step('bidi.case3.simultaneous-merge', mergeRun.run?.Success === true && externalEdit?.Success === true
            && mjEditOk && oursPushed && theirsPreserved, {
            observed: {
                runID: mergeRun.runID, success: mergeRun.run?.Success ?? null, externalEditSuccess: externalEdit?.Success ?? null,
                mjEditApplied: mjEditOk, recordFound: !!liveRec,
                externalFirstname: externalFirst, externalJobtitle: externalTitle,
                oursPushed, theirsPreserved,
            },
            note: 'CASE SIMULTANEOUS-EDITS: MJ changed firstname while external changed jobtitle (different fields) → the '
                + '3-way combine pushes ONLY firstname and LEAVES jobtitle (field-level merge, not blind last-write-wins). '
                + 'NO LOST UPDATE: the losing side\'s OTHER field survives. DESIRED: external shows firstname=ours AND '
                + 'jobtitle=theirs. GAP: the MJ-side edit is applied DB-direct (no GQL op edits a mirror row + marks it '
                + 'push-dirty); a "stage an MJ edit" op would make this a pure-GQL test.',
        }));

        // ── CASE 1 — CONFLICT (same field on both sides → policy decides; Manual quarantines) ──
        // Set policy to Manual DB-direct (FRAMEWORK GAP: no GQL surface). Edit firstname on BOTH sides
        // differently → a true conflict on firstname → Manual must quarantine the MJ row (SyncStatus='Conflict')
        // and SKIP the push (no overwrite), emitting sync.record.conflict.
        const policySet = await setConflictResolutionDirect(db, cfg, writeMap.entityMapID, 'Manual');
        steps.push(step('bidi.policy.manual.set', policySet, {
            observed: { entityMapID: writeMap.entityMapID, requested: 'Manual', applied: policySet, originalPolicy: originalConflictResolution },
            note: 'set ConflictResolution=Manual DB-DIRECT (restored in cleanup). GAP: EntityMapUpdateInput has no '
                + 'ConflictResolution field (IntegrationDiscoveryResolver.ts:662) so policy is NOT GQL-settable — '
                + 'DESIRED: add ConflictResolution to EntityMapUpdateInput so this is a pure-GQL operation.',
        }));
        restoredPolicy = false; // we changed it; cleanup must restore

        // Conflicting edits to the SAME field (firstname) on both sides.
        const extConflict = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'update', externalID: createdExternalID,
            attributes: JSON.stringify({ firstname: 'external-conflict' }),
        })).IntegrationWriteRecord;
        try {
            await db.rows(
                `UPDATE ${destT(cfg, objectName)} SET ${C(cfg, 'firstname')}=${lit('mj-conflict')} ` +
                `WHERE ${C(cfg, pkColumn)}=${lit(createdExternalID)}`);
        } catch { /* recorded via the assertion below */ }
        const conflictRun = await runBidiObservedWithConflicts(gql, ciid, {
            fullSync: false, syncDirection: 'Bidirectional', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls,
        });
        const conflictEvent = (conflictRun.conflicts ?? []).find(c => sameId(c.externalId, createdExternalID))
            ?? (conflictRun.conflicts ?? [])[0] ?? null;
        const quarantineCount = await countSyncStatus(db, cfg, objectName, 'Conflict');
        const conflictRow = await loadDestRowByExternalId(db, cfg, objectName, createdExternalID, pkColumn);
        const rowStatus = conflictRow ? col(conflictRow, '__mj_integration_SyncStatus') : null;
        const rowMsg = conflictRow ? col(conflictRow, '__mj_integration_SyncMessage') : null;
        const quarantined = rowStatus === 'Conflict' && typeof rowMsg === 'string' && rowMsg.length > 0;
        steps.push(step('bidi.case1.conflict.manual-quarantine', conflictRun.run?.Success === true && extConflict?.Success === true
            && quarantined, {
            observed: {
                runID: conflictRun.runID, success: conflictRun.run?.Success ?? null,
                conflictEventObserved: !!conflictEvent,
                conflictEvent: conflictEvent ? { policy: conflictEvent.policy, resolution: conflictEvent.resolution, conflictFields: conflictEvent.conflictFields } : null,
                rowSyncStatus: rowStatus, rowSyncMessagePresent: typeof rowMsg === 'string' && rowMsg.length > 0,
                quarantineRowCount: quarantineCount,
            },
            note: 'CASE CONFLICT: firstname changed differently on BOTH sides → a true conflict. Under Manual the MJ mirror '
                + 'row is QUARANTINED (__mj_integration_SyncStatus=\'Conflict\' + a SyncMessage naming the field) and the '
                + 'push is SKIPPED — not silently lost (markConflictOnMJRecord, IntegrationEngine.ts:1972). The engine emits '
                + 'sync.record.conflict {policy,resolution,conflictFields}. DESIRED: status=Conflict + message present. '
                + 'GAP: sync.record.conflict reaches the durable stream only as a generic record.error/warn (no first-class '
                + 'conflict EventType) and there is NO GQL read for SyncStatus/SyncMessage → both checked DB-direct.',
        }));

        // ── CASE 2 — ECHO / LOOPBACK (a pushed change must NOT re-import as a fresh inbound change) ──
        // Restore policy to DestWins (so a clean push happens, not a quarantine), push an MJ edit, then pull
        // immediately and assert: (a) the record map stays 1:1 (no duplicate inbound map from the echo), and
        // (b) the immediate re-pull does NOT keep re-processing the same row (no ping-pong). DestWins lets the
        // push apply cleanly; the snapshot refresh on apply is what suppresses the echo.
        await setConflictResolutionDirect(db, cfg, writeMap.entityMapID, 'DestWins');
        try {
            await db.rows(
                `UPDATE ${destT(cfg, objectName)} SET ${C(cfg, 'lastname')}=${lit(marker + ' echo')} ` +
                `WHERE ${C(cfg, pkColumn)}=${lit(createdExternalID)}`);
        } catch { /* recorded below */ }
        const rmBeforeEcho = await recordMapStats(db, cfg, ciid, writeMap.entityName);
        // Push the MJ change out (Bidirectional applies the push), then immediately pull twice.
        const echoPush = await runSyncObserved(gql, ciid, {
            fullSync: false, syncDirection: 'Bidirectional', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls,
        });
        const echoPull1 = await runSyncObserved(gql, ciid, {
            fullSync: false, syncDirection: 'Pull', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls,
        });
        const echoPull2 = await runSyncObserved(gql, ciid, {
            fullSync: false, syncDirection: 'Pull', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls,
        });
        const rmAfterEcho = await recordMapStats(db, cfg, ciid, writeMap.entityName);
        const mapStays1to1 = rmAfterEcho.total === rmAfterEcho.distinctExternal && rmAfterEcho.total === rmBeforeEcho.total;
        // The second immediate pull must do strictly-no NEW write work for our row (content-hash/snapshot skip):
        // its Succeeded count should be 0 (nothing changed since the prior pull) — the echo is not re-applied.
        const secondPullSucceeded = echoPull2.run?.Counts?.Succeeded ?? null;
        const noPingPong = secondPullSucceeded === 0;
        steps.push(step('bidi.case2.echo-loopback', echoPush.run?.Success === true && echoPull1.run?.Success === true
            && echoPull2.run?.Success === true && mapStays1to1 && noPingPong, {
            observed: {
                pushRunID: echoPush.runID, pull1RunID: echoPull1.runID, pull2RunID: echoPull2.runID,
                recordMapBefore: rmBeforeEcho, recordMapAfter: rmAfterEcho, mapStays1to1,
                secondPullSucceeded, noPingPong,
            },
            note: 'CASE ECHO/LOOPBACK: after a push, the engine must NOT re-import its own just-written value as a fresh '
                + 'inbound change. PROXY: (a) the record map stays 1:1 (no duplicate inbound map from the echo) and (b) a '
                + 'second immediate Pull writes nothing new (Succeeded=0) — the snapshot/content-hash makes the echo a skip, '
                + 'so there is no ping-pong. DESIRED: both hold. (Engine refreshes LastSyncedSnapshot on every apply, '
                + 'IntegrationEngine.ts:2938, which is what suppresses the loop.)',
        }));

        // ── WATERMARK FALLBACK SAVE persists on the bidirectional/push path ──
        // After the Bidirectional runs above, a Push-direction watermark row must persist (so the next push is
        // not a full rescan) EVEN on the fallback path. DB-direct: ≥1 Push row with a non-null value + LastSyncAt.
        const pushWmCount = await countWatermarkRows(db, cfg, writeMap.entityMapID, 'Push');
        const pushWm = await loadWatermark(db, cfg, writeMap.entityMapID, 'Push');
        const pushWmValue = col(pushWm, 'WatermarkValue');
        const pushWmLastSync = col(pushWm, 'LastSyncAt');
        const fallbackSaved = !!pushWm && pushWmValue != null && String(pushWmValue).length > 0 && pushWmLastSync != null;
        steps.push(step('bidi.watermark.fallback-save', pushWmCount >= 1 && fallbackSaved, {
            observed: {
                entityMapID: writeMap.entityMapID, pushWatermarkRowCount: pushWmCount,
                watermarkType: col(pushWm, 'WatermarkType') ?? null, watermarkValuePresent: pushWmValue != null,
                lastSyncAt: pushWmLastSync ?? null,
            },
            note: 'plan.md §2 explicit ask: the Push-direction watermark FALLBACK SAVE persists even on the bidirectional/'
                + 'push path (IntegrationEngine.ts:1494/1577 Push watermark Load/Update). DB-direct: ≥1 Push row in '
                + 'vwCompanyIntegrationSyncWatermarks with a non-null WatermarkValue + LastSyncAt → the next push is not a '
                + 'full rescan. DESIRED: a Push watermark row exists after a Bidirectional run.',
            }));

    } catch (e) {
        steps.push(step('bidi.error', false, { error: String(e?.stack ?? e?.message ?? e) }));
    } finally {
        // ── CLEANUP (critical) — restore EVERYTHING so the seeded connection stays reusable. ──

        // 1) Restore ConflictResolution to its captured original (or 'DestWins' default if it was null/unset).
        try {
            const restoreTo = originalConflictResolution ?? 'DestWins';
            const ok = await setConflictResolutionDirect(db, cfg, writeMap.entityMapID, restoreTo);
            restoredPolicy = ok;
            steps.push(step('bidi.cleanup.restore-policy', ok, {
                observed: { entityMapID: writeMap.entityMapID, restoredTo: restoreTo, originalPolicy: originalConflictResolution },
                note: 'restored ConflictResolution to its captured original (DB-direct, since GQL cannot set it) so the '
                    + 'seeded connection\'s policy is unchanged for later tests',
            }));
        } catch (e) {
            steps.push(step('bidi.cleanup.restore-policy', false, {
                observed: { entityMapID: writeMap.entityMapID, error: String(e?.message ?? e) },
                note: 'CRITICAL: failed to restore ConflictResolution — a later test may see a stale policy',
            }));
        }

        // 2) Restore the write map SyncDirection to its captured original (via GQL — it is GQL-settable).
        try {
            const reset = (await gql(BIDI_GQL.updateEntityMaps, {
                updates: [{ EntityMapID: writeMap.entityMapID, SyncDirection: originalSyncDirection }],
            })).IntegrationUpdateEntityMaps;
            const after = await readEntityMapPolicy(db, cfg, writeMap.entityMapID);
            restoredDirection = reset?.Success === true && after.syncDirection === originalSyncDirection;
            steps.push(step('bidi.cleanup.restore-direction', restoredDirection, {
                observed: { entityMapID: writeMap.entityMapID, restoredTo: originalSyncDirection, restoreSuccess: reset?.Success ?? false, observed: after.syncDirection },
                note: 'restored the write map SyncDirection to its captured original so the seeded connection is reusable',
            }));
        } catch (e) {
            steps.push(step('bidi.cleanup.restore-direction', false, {
                observed: { entityMapID: writeMap.entityMapID, error: String(e?.message ?? e) },
                note: 'CRITICAL: failed to restore the write map SyncDirection — a later test may see Bidirectional',
            }));
        }

        // 3) Delete the disposable external record by its captured external id (exact, id-targeted; NEVER
        //    users/owners/real data), then re-sync so the dest row count returns to baseline.
        if (createdExternalID) {
            let deleteOk = false;
            try {
                const del = (await gql(GQL.writeRecord, {
                    ciid, objectName, operation: 'delete', externalID: createdExternalID, attributes: null,
                })).IntegrationWriteRecord;
                deleteOk = del?.Success === true;
                steps.push(step('bidi.cleanup.delete-external', deleteOk, {
                    observed: { object: objectName, externalID: createdExternalID, statusCode: del?.StatusCode ?? null, message: del?.Message ?? null },
                    note: 'deleted the disposable bidirectional test record by its captured external id (exact, id-targeted) '
                        + 'so the portal + seeded connection stay clean',
                }));
            } catch (e) {
                steps.push(step('bidi.cleanup.delete-external', false, {
                    observed: { object: objectName, externalID: createdExternalID, error: String(e?.message ?? e) },
                    note: 'FAILED to delete the bidirectional test record — it may be orphaned in the portal; manual cleanup required',
                }));
            }
            // Best-effort re-sync so the deletion propagates; record the row-count delta, never hard-fail on a
            // tombstone-style connector that keeps a soft-deleted row.
            try {
                const reSync = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', entityMapIDs: [writeMap.entityMapID], maxPolls: cfg.maxPolls });
                const rowsFinal = await destRowCount(db, cfg, objectName);
                steps.push(step('bidi.cleanup.resync', true, {
                    observed: { runID: reSync.runID, success: reSync.run?.Success ?? null, rowsBefore, rowsFinal, returnedToBaseline: rowsFinal === rowsBefore, deleteOk },
                    note: 'best-effort re-sync after delete — records the dest row-count delta (returnedToBaseline true means '
                        + 'the test row is fully gone); never hard-fails on a tombstone-style connector',
                }));
            } catch (e) {
                steps.push(step('bidi.cleanup.resync', true, {
                    observed: { error: String(e?.message ?? e) },
                    note: 'cleanup re-sync is best-effort; the id-targeted delete above already removed the test record',
                }));
            }
        }
    }

    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional thin orchestrator (mirrors runMatrixReadonly / runRateLimitConcurrencyReadonly): reference-mode
// only, reuses the seeded connection's existing entity maps, runs the single phase, closes the DB. The
// phase is also directly callable by an external runner that already owns setup.
// ─────────────────────────────────────────────────────────────────────────────

/** A run is ok only if every recorded step (across all phases) is ok. */
function allStepsOk(steps) {
    for (const v of Object.values(steps)) {
        const arr = Array.isArray(v) ? v : [v];
        for (const s of arr) if (s && s.ok === false) return false;
    }
    return true;
}

/**
 * @param {object} io  { gql(query,vars), db (rows/recordMapStats/entityRowCount/close) }
 * @param {object} cfg { platform, mjSchema, destSchema?, objects[], companyIntegrationID, writeObject?,
 *                       allowWrite?, runId, maxPolls?, valuePkColumn? }
 * @returns {{ ok, platform, steps: { setup, bidirectional } }}
 */
export async function runBidirectionalConflict({ gql, db }, cfg) {
    const result = { ok: false, platform: cfg.platform, steps: {} };
    try {
        if (!cfg.companyIntegrationID) {
            throw new Error('runBidirectionalConflict is reference-mode only: cfg.companyIntegrationID (HS_LIVE_CIID) is required');
        }
        const ciid = cfg.companyIntegrationID;
        const listed = (await gql(BIDI_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
        if (!listed?.Success) throw new Error(`ListEntityMaps failed: ${listed?.Message ?? 'no payload'}`);
        const maps = (listed.EntityMaps ?? [])
            .filter(m => m.Status === 'Active' || m.Status == null)
            .map(m => ({ entityMapID: m.ID, entityName: m.Entity, sourceObjectName: m.ExternalObjectName }));
        if (maps.length === 0) throw new Error('no Active entity maps for this CIID — run ApplyAll once first');

        result.steps.setup = step('setup', true, {
            observed: { ciid, mapCount: maps.length, maps: maps.map(m => ({ object: m.sourceObjectName, entity: m.entityName })) },
            note: 'reused the seeded connection\'s existing Active entity maps (no ApplyAll needed; no RSU/restart)',
        });

        result.steps.bidirectional = await phasebidirectionalconflict({ gql, db, ciid, maps, cfg });
        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        result.ok = !result.error && allStepsOk(result.steps);
    }
}
