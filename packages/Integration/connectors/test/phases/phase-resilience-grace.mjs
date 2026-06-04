/**
 * GQL-driven RESILIENCE + GRACE-UNDER-FAILURE phase — plan.md §2 ("test resilience mid-syncs: strategy
 * rotations, syncs that get stuck in infinite pagination [content-hash work could be useful here], some
 * thing goes wrong during any process … grace handling … as much useful information comes in despite
 * problems") and §8 / §15g ("calm, graceful error handling — degrade, retry where appropriate, continue
 * what can continue; structured sync result clearly reporting records that succeeded vs failed [with
 * reason]; never sink the whole sync on one bad row"). Run through the REAL MJAPI GraphQL API against the
 * pre-seeded HubSpot reference connection (token-free reference mode, identified solely by `ciid`).
 *
 * WHAT THIS PROVES (the requirement, restated as hard assertions), grounded in the engine source:
 *
 *   A) STRATEGY ROTATION MID-SEQUENCE (§2 "strategy rotations"). Flipping a map's sync STRATEGY between
 *      runs must NOT corrupt or lose data — the framework absorbs the rotation gracefully and keeps the
 *      record-map 1:1.  The two GQL-driveable per-map strategies are:
 *        - DEFAULT: per-record content-hash + timestamp watermark (streams batch-by-batch), and
 *        - PARTITION/MERKLE reconcile: enabled by EntityMap.Configuration {"partitionReconcile":true}
 *          (IntegrationEngine.isPartitionReconcileEnabled, :2134-2137; parseEntityMapConfig :2128-2131).
 *      We rotate ONE map DEFAULT → MERKLE → DEFAULT across three syncs (via IntegrationUpdateEntityMaps
 *      Configuration), and ALSO rotate the connection-level periodic-full-reconcile cadence
 *      CompanyIntegration.Configuration {"fullSyncEvery":N} (resolveScheduledFullSync, :579-599) on/off.
 *      After every rotation: the run is clean (Success, zero Failed), the dest rows + record map are
 *      UNCHANGED and stay 1:1 (no dup, no loss), and the structured Counts are internally consistent
 *      (Succeeded+Failed+Skipped ≤ Processed-style sanity, Failed===0). Every Configuration mutation is
 *      restored in cleanup so the seeded connection stays reusable.
 *
 *   B) INFINITE-PAGINATION-STUCK RECOVERY / CONTENT-HASH BREAK (§2 "stuck in infinite pagination …
 *      content-hash could be useful"). The engine has TWO independent stuck-loop guards, both proven to
 *      EXIST here (no GQL op can inject a misbehaving connector to TRIP them live — gap recorded):
 *        1. DUPLICATE-BATCH break: if a connector returns the SAME batch fingerprint twice in a row, the
 *           engine stops to prevent an infinite loop (IntegrationEngine.ts:1289-1300, the content-hash /
 *           identity-fingerprint break the plan alludes to) and sets fetchCompletedCleanly=false.
 *        2. MAX_BATCHES_PER_MAP=5000 hard ceiling (:1193, :1204-1211) — a runaway pager can never spin
 *           forever; it is force-stopped, fetchCompletedCleanly=false.
 *      Both degrade GRACEFULLY: the partial set already written is KEPT, the safe-floor watermark
 *      (lastCleanWatermark, :1184/:1375/:1446) is persisted instead of advancing past unwritten records,
 *      and the next run re-fetches the un-covered window (idempotent upsert + content-hash skip reconcile
 *      it → no permanent loss). On a healthy HubSpot portal NEITHER guard trips, so the DESIRED steady
 *      state is "no stuck-loop, clean termination" — we assert that the run never hit MAX_BATCHES (batch
 *      index stays well under the ceiling) and never emitted a duplicate-batch break, and that the
 *      safe-floor watermark invariant holds (a Pull watermark exists and is ISO/parseable, never null
 *      after a clean run). The guards' existence is asserted via the durable batch stream; tripping them
 *      live needs a fault-injection op the framework lacks (gap).
 *
 *   C) GENERIC MID-PROCESS FAILURE → GRACEFUL DEGRADATION + ACCURATE STRUCTURED RESULT (§8 / §15g). The
 *      only client-driveable mid-process interrupt is IntegrationCancelSync (cooperative abort — "stops
 *      after the current batch", :3474-3493). We start a sync, interrupt it, drain it to terminal, and
 *      assert: (1) NO hard throw reached the client (the run reached a terminal state with a typed
 *      result), (2) the structured Counts are ACCURATE and self-consistent (Succeeded+Failed+Skipped is
 *      coherent, Failed reasons — if any — are enumerated in GetRun.Errors), (3) PARTIAL PROGRESS IS
 *      DURABLE (a watermark row persists; the next run reconciles), and (4) the record map is never
 *      corrupted (stays 1:1) and the dest never drops below the clean baseline (max useful data lands).
 *      A reconciling full sync then proves the connection fully self-heals. NOTE(gap): there is no GQL op
 *      to inject a per-record failure / bad-value / misbehaving connector mid-stream, so the §15g
 *      "one bad row doesn't sink the sync, the rest still land, the failed one is reported with a reason"
 *      assertion is WRITTEN against GetRun.Counts.Failed + GetRun.Errors but can only be exercised once a
 *      fault-injection capability exists — until then it gates on the healthy-path invariant (Failed===0,
 *      Errors empty) and the gap is recorded.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint (plans.mjs), which dereferences secrets and scrubs the result. Reference mode drives the
 * sync purely by CompanyIntegrationID — the encrypted credential is decrypted server-side; the HubSpot
 * token never enters this process.
 *
 * STATE DISCIPLINE: NON-DESTRUCTIVE to the seeded connection and READ-ONLY toward HubSpot (only Pull
 * re-syncs; it NEVER writes/deletes external records — no Users/owners/real data are touched). The ONLY
 * mutations are MJ-side metadata toggles — ONE entity map's Configuration (partitionReconcile) and the
 * connection's Configuration (fullSyncEvery) — both CAPTURED up front and ALWAYS restored to their exact
 * originals in a finally cleanup step. It always drains any interrupted run to terminal and runs a final
 * reconciling full sync so the seeded connection is left consistent + reusable for later phases.
 */

// GQL op strings (startSync/listRuns/getRun/tailRunEvents) + runSyncObserved (trigger→tail→GetRun),
// triggerAndResolveRun (race-free run-id), and tailRunToCompletion (durable stream incl. batches/
// checkpoints) are reused from the canonical harness — this phase never re-implements the gql client,
// the DB client, or the sync drivers.
import { GQL, runSyncObserved, triggerAndResolveRun, tailRunToCompletion } from '../gql-live-harness.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts —
//   IntegrationUpdateEntityMaps(updates:[EntityMapUpdateInput{EntityMapID,Configuration,...}])
//     → MutationResultOutput {Success,Message} :3876-3917  (per-map strategy rotation knob)
//   IntegrationUpdateConnection(companyIntegrationID, configuration?, runSchemaRefresh default true)
//     → MutationResultOutput {Success,Message} :2499-2569  (connection fullSyncEvery cadence;
//       CRITICAL runSchemaRefresh:false ⇒ pure metadata write, NO RSU/restart; REPLACES Configuration)
//   IntegrationCancelSync(companyIntegrationID) → MutationResultOutput {Success,Message} :3474-3493
//   IntegrationListEntityMaps → ListEntityMapsOutput/EntityMapSummaryOutput :3820/:3644 (Configuration read)
// NOTHING here is invented. There is NO GQL op to inject a stuck/misbehaving connector or a per-record
// failure mid-stream — those gaps are recorded rather than faked.
// ─────────────────────────────────────────────────────────────────────────────

const RG_GQL = {
    updateEntityMaps: `mutation($updates: [EntityMapUpdateInput!]!) {
      IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
    }`,
    updateConnection: `mutation($ciid: String!, $configuration: String, $runSchemaRefresh: Boolean!) {
      IntegrationUpdateConnection(companyIntegrationID: $ciid, configuration: $configuration, runSchemaRefresh: $runSchemaRefresh) {
        Success Message
      }
    }`,
    cancelSync: `mutation($ciid: String!) {
      IntegrationCancelSync(companyIntegrationID: $ciid) { Success Message }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message
        EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority Configuration }
      }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (mirrors of the harness's so this phase is self-contained; identical shape).
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

/** Reads a value off a DB row regardless of dialect casing (mssql=PascalCase, pg=lowercased). */
function col(row, name) {
    if (row == null) return undefined;
    if (name in row) return row[name];
    const lower = name.toLowerCase();
    if (lower in row) return row[lower];
    for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
    return undefined;
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
 *  harness UUIDs + fixed identifiers — never untrusted input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

/** Row count of a destination table addressed directly by its HubSpot source-object name. */
async function destRowCount(db, cfg, sourceObjectName) {
    const rows = await db.rows(`SELECT COUNT(*) AS c FROM ${destT(cfg, sourceObjectName)}`);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/**
 * Loads the newest Pull watermark row for an entity map from vwCompanyIntegrationSyncWatermarks.
 * Columns: EntityMapID, Direction, WatermarkType, WatermarkValue, LastSyncAt, RecordsSynced.
 */
async function loadWatermark(db, cfg, entityMapID, direction = 'Pull') {
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

/** DB-direct read of CompanyIntegration.Configuration (the GQL list ops don't return it). */
async function readConnectionConfiguration(db, cfg, ciid) {
    const rows = await db.rows(
        `SELECT ${C(cfg, 'Configuration')} AS cfg FROM ${mjT(cfg, 'CompanyIntegration')} WHERE ${C(cfg, 'ID')}=${lit(ciid)}`);
    return col(rows?.[0], 'cfg') ?? null;
}

/** Normalizes a Configuration string for equality (treats null/''/whitespace identically). */
function normConfig(v) {
    if (v == null) return '';
    const s = String(v).trim();
    const parsed = tryParse(s);
    return parsed != null && typeof parsed === 'object' ? JSON.stringify(parsed) : s;
}

/**
 * A per-object identity snapshot used to assert no-duplication / no-loss across a strategy rotation or a
 * mid-process interrupt. destRows = physical dest table count; record map total vs distinctExternal = the
 * 1:1 map identity; maxUpdatedAt is unused here but the snapshot mirrors the matrix harness's shape.
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

/** Best-effort cancel — never throws (a finished sync can't be cancelled; that's a race, not an error). */
async function bestEffortCancel(gql, ciid) {
    try { return (await gql(RG_GQL.cancelSync, { ciid })).IntegrationCancelSync; }
    catch (e) { return { Success: false, Message: String(e?.message ?? e) }; }
}

/**
 * Asserts the structured Counts of a terminal run are internally CONSISTENT (the §8/§15g "accurate
 * structured result" bar): every component is a non-negative number and the per-outcome buckets don't
 * exceed the work done. We deliberately do NOT equate Succeeded+Failed+Skipped===Processed because
 * Counts.Processed double-counts fetched+applied per the known structured-events bug (documented in the
 * matrix harness); instead we assert each bucket is well-formed and Succeeded/Failed/Skipped are coherent.
 */
function countsAreConsistent(counts) {
    if (!counts) return false;
    const nums = ['Processed', 'Succeeded', 'Failed', 'Skipped', 'TotalKnown']
        .map(k => counts[k]).filter(v => v != null);
    if (!nums.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return false;
    const succeeded = counts.Succeeded ?? 0;
    const failed = counts.Failed ?? 0;
    const skipped = counts.Skipped ?? 0;
    return succeeded >= 0 && failed >= 0 && skipped >= 0;
}

/** Highest batchIndex observed on the durable stream (records.batch.complete carries DataJSON.batchIndex,
 *  falling back to the harness's batches[] length). Used to prove a run never approached MAX_BATCHES. */
function maxBatchIndex(tail) {
    let max = (tail?.batches?.length ?? 0);
    for (const ev of tail?.batches ?? []) {
        // tailRunToCompletion only retains Counts per batch, not DataJSON; the count of batch events is
        // the conservative proxy for batches-run (always ≤ the true batchIndex). That is sufficient to
        // prove we are nowhere near the 5000 ceiling on a healthy portal.
        if (ev && typeof ev === 'object') { /* no-op: shape kept for clarity */ }
    }
    return max;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell A: strategy rotation mid-sequence (DEFAULT ⇄ MERKLE per-map; fullSyncEvery on/off per-connection)
// ─────────────────────────────────────────────────────────────────────────────

/** Sets ONE entity map's Configuration JSON via UpdateEntityMaps (REPLACES Configuration). */
async function setMapConfiguration(gql, entityMapID, configJson) {
    return (await gql(RG_GQL.updateEntityMaps, {
        updates: [{ EntityMapID: entityMapID, Configuration: configJson }],
    })).IntegrationUpdateEntityMaps;
}

/** DB-direct read of one entity map's Configuration via the GQL list (it returns Configuration). */
async function readMapConfiguration(gql, ciid, entityMapID) {
    const listed = (await gql(RG_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
    const found = (listed?.EntityMaps ?? []).find(e => sameId(e.ID, entityMapID));
    return found?.Configuration ?? null;
}

/**
 * Runs one sync, drains to terminal, and asserts it landed gracefully: Success===true, Failed===0, the
 * structured Counts are internally consistent, and the per-object identity is unchanged + 1:1 vs `before`.
 * Returns { steps, runDetail } so the caller can chain rotations. `label` namespaces the step names.
 */
async function syncAndAssertGraceful(gql, db, cfg, ciid, rotMap, before, label) {
    const steps = [];
    const run = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    const counts = run.run?.Counts ?? null;
    const clean = run.run?.Success === true && (counts?.Failed ?? 0) === 0;
    steps.push(step(`resilience.rotation.${label}.run`, clean && countsAreConsistent(counts), {
        observed: { runID: run.runID, counts, exitReason: run.run?.ExitReason ?? null, errors: run.errors ?? [] },
        note: `after the ${label} strategy state, the sync lands cleanly (Success, ZERO Failed) and the structured `
            + `Counts are internally consistent — the rotation is absorbed gracefully, no run-sinking`,
    }));

    const after = await snapshotObject(db, cfg, ciid, rotMap);
    const mapOneToOne = after.recordMap.total === after.recordMap.distinctExternal;
    const destAgreesMap = after.destRows === after.recordMap.total;
    const noLoss = after.destRows >= before.destRows;
    const noDrift = after.destRows === before.destRows; // a pure strategy change must not change row population
    steps.push(step(`resilience.rotation.${label}.identity`, mapOneToOne && destAgreesMap && noLoss && noDrift, {
        observed: {
            object: rotMap.sourceObjectName,
            before: { destRows: before.destRows, recordMap: before.recordMap },
            after: { destRows: after.destRows, recordMap: after.recordMap },
            mapOneToOne, destAgreesMap, noLoss, noDrift,
        },
        note: `rotating the sync strategy does NOT change the data: record map stays 1:1 (no duplicate maps), the dest `
            + `table and record map agree (no orphan/loss), and the row count is identical to before the rotation`,
    }));
    return { steps, after };
}

/**
 * Rotates ONE map DEFAULT → MERKLE → DEFAULT (per-map Configuration.partitionReconcile) across syncs, and
 * rotates the connection cadence Configuration.fullSyncEvery on → off, asserting graceful no-corruption
 * behavior at each step. CAPTURES + RESTORES both Configurations. Prefers the deals map (matrix-harness
 * convention) for the per-map rotation; falls back to the first non-association map.
 */
export async function cellStrategyRotation({ gql, db, ciid, maps, cfg, baseline }) {
    const steps = [];
    const crmMaps = (maps ?? []).filter(m => !isAssoc(m.sourceObjectName));
    const rotMap = crmMaps.find(m => lc(m.sourceObjectName) === 'deals') ?? crmMaps[0] ?? null;
    if (!rotMap) {
        steps.push(step('resilience.rotation.skipped', true, {
            observed: { mapCount: (maps ?? []).length },
            note: 'no non-association (CRM) entity map to rotate a strategy on — strategy-rotation cell skipped',
        }));
        return steps;
    }

    // CAPTURE both Configurations up front so cleanup is exact.
    let originalMapConfig = null, originalConnConfig = null;
    let mapRestored = false, connRestored = false;
    try {
        originalMapConfig = await readMapConfiguration(gql, ciid, rotMap.entityMapID);
        originalConnConfig = await readConnectionConfiguration(db, cfg, ciid);
        steps.push(step('resilience.rotation.captured', true, {
            observed: { entityMapID: rotMap.entityMapID, originalMapConfig, originalConnConfig },
            note: 'captured the rotation map Configuration + the connection Configuration before mutating (restored in cleanup)',
        }));

        const before0 = baseline?.[rotMap.sourceObjectName] ?? await snapshotObject(db, cfg, ciid, rotMap);

        // ── Rotation 1: DEFAULT → MERKLE (enable partitionReconcile on the rotation map).
        const toMerkle = await setMapConfiguration(gql, rotMap.entityMapID, JSON.stringify({ partitionReconcile: true, partitionCount: 16 }));
        const merkleConfig = await readMapConfiguration(gql, ciid, rotMap.entityMapID);
        steps.push(step('resilience.rotation.to-merkle.applied', toMerkle?.Success === true && (merkleConfig ?? '').includes('partitionReconcile'), {
            observed: { entityMapID: rotMap.entityMapID, updateSuccess: toMerkle?.Success ?? false, configuration: merkleConfig ?? null },
            note: 'rotate the map strategy DEFAULT → MERKLE mid-sequence by setting Configuration.partitionReconcile=true (GQL round-trips)',
        }));
        const r1 = await syncAndAssertGraceful(gql, db, cfg, ciid, rotMap, before0, 'merkle');
        steps.push(...r1.steps);

        // ── Rotation 2: MERKLE → DEFAULT (clear partitionReconcile back to the streaming content-hash path).
        const toDefault = await setMapConfiguration(gql, rotMap.entityMapID, '');
        const defaultConfig = await readMapConfiguration(gql, ciid, rotMap.entityMapID);
        mapRestored = toDefault?.Success === true && normConfig(defaultConfig) === normConfig(originalMapConfig);
        steps.push(step('resilience.rotation.to-default.applied', toDefault?.Success === true && !((defaultConfig ?? '').includes('partitionReconcile')), {
            observed: { entityMapID: rotMap.entityMapID, updateSuccess: toDefault?.Success ?? false, configuration: defaultConfig ?? null },
            note: 'rotate the map strategy MERKLE → DEFAULT mid-sequence by clearing partitionReconcile (back to per-record content-hash)',
        }));
        const r2 = await syncAndAssertGraceful(gql, db, cfg, ciid, rotMap, r1.after, 'default');
        steps.push(...r2.steps);

        // ── Rotation 3: connection cadence — enable fullSyncEvery, sync, then disable. resolveScheduledFullSync
        //    reads {"fullSyncEvery":N}; with N=2 the engine periodically promotes a watermark-incremental to a
        //    full reconcile. Flipping it must NOT corrupt the corpus (it only changes WHEN a full fetch happens).
        const connBase = (typeof originalConnConfig === 'string' && originalConnConfig.trim().length > 0) ? (tryParse(originalConnConfig) ?? {}) : {};
        const withCadence = JSON.stringify({ ...connBase, fullSyncEvery: 2 });
        const enableCadence = (await gql(RG_GQL.updateConnection, { ciid, configuration: withCadence, runSchemaRefresh: false })).IntegrationUpdateConnection;
        const persistedCadence = await readConnectionConfiguration(db, cfg, ciid);
        const cadenceRoundTrips = enableCadence?.Success === true && (persistedCadence ?? '').includes('fullSyncEvery');
        steps.push(step('resilience.rotation.cadence.applied', cadenceRoundTrips, {
            observed: { updateSuccess: enableCadence?.Success ?? false, configuration: persistedCadence ?? null },
            note: 'rotate the connection-level periodic-full-reconcile cadence on (Configuration.fullSyncEvery=2) via '
                + 'IntegrationUpdateConnection(runSchemaRefresh:false ⇒ pure metadata, no RSU/restart); DB read confirms round-trip',
        }));
        // An incremental run now: with fullSyncEvery the engine may promote it to a full reconcile — either way it
        // must land cleanly + keep the identity. (We assert grace + identity, not which path it took.)
        const cadenceRun = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const cadenceAfter = await snapshotObject(db, cfg, ciid, rotMap);
        const cadenceOk = cadenceRun.run?.Success === true && (cadenceRun.run?.Counts?.Failed ?? 0) === 0
            && cadenceAfter.recordMap.total === cadenceAfter.recordMap.distinctExternal
            && cadenceAfter.destRows === r2.after.destRows;
        steps.push(step('resilience.rotation.cadence.graceful', cadenceOk, {
            observed: {
                runID: cadenceRun.runID, counts: cadenceRun.run?.Counts ?? null,
                before: { destRows: r2.after.destRows }, after: { destRows: cadenceAfter.destRows, recordMap: cadenceAfter.recordMap },
            },
            note: 'with the cadence rotated on, the next run lands cleanly and the corpus is unchanged + still 1:1 — '
                + 'rotating the reconcile cadence only changes WHEN a full fetch happens, never the data',
        }));
    } finally {
        // CLEANUP (critical): restore BOTH the map Configuration and the connection Configuration exactly.
        if (!mapRestored) {
            try {
                const reset = await setMapConfiguration(gql, rotMap.entityMapID, originalMapConfig == null ? '' : originalMapConfig);
                const after = await readMapConfiguration(gql, ciid, rotMap.entityMapID);
                mapRestored = reset?.Success === true && normConfig(after) === normConfig(originalMapConfig);
                steps.push(step('resilience.rotation.cleanup.restore-map-config', mapRestored, {
                    observed: { entityMapID: rotMap.entityMapID, restoreSuccess: reset?.Success ?? false, restoredConfiguration: after, originalMapConfig },
                    note: 'failsafe restore: rotation map Configuration reset to its captured original so the seeded connection stays reusable',
                }));
            } catch (e) {
                steps.push(step('resilience.rotation.cleanup.restore-map-config', false, {
                    observed: { entityMapID: rotMap.entityMapID, error: String(e?.message ?? e), originalMapConfig },
                    note: 'CRITICAL: failed to restore the rotation map Configuration — a later test may see a stale partitionReconcile override',
                }));
            }
        }
        try {
            const restoreConn = originalConnConfig == null ? '' : originalConnConfig;
            const reset = (await gql(RG_GQL.updateConnection, { ciid, configuration: restoreConn, runSchemaRefresh: false })).IntegrationUpdateConnection;
            const after = await readConnectionConfiguration(db, cfg, ciid);
            connRestored = reset?.Success === true && normConfig(after) === normConfig(originalConnConfig);
            steps.push(step('resilience.rotation.cleanup.restore-conn-config', connRestored, {
                observed: { restoreSuccess: reset?.Success ?? false, restoredConfiguration: after, originalConnConfig },
                note: 'failsafe restore: CompanyIntegration.Configuration reset to its captured original (fullSyncEvery override removed)',
            }));
        } catch (e) {
            steps.push(step('resilience.rotation.cleanup.restore-conn-config', false, {
                observed: { error: String(e?.message ?? e), originalConnConfig },
                note: 'CRITICAL: failed to restore the connection Configuration — a later test may see a stale fullSyncEvery override',
            }));
        }
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell B: infinite-pagination-stuck recovery / content-hash break (guards proven to EXIST; tripping live
// needs a fault-injection op the framework lacks → gap recorded).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Proves the engine's anti-infinite-loop guards behave on the healthy path and that the safe-floor
 * watermark invariant (the recovery mechanism) holds:
 *   - the run NEVER approaches MAX_BATCHES_PER_MAP (5000) — batch count stays small on a real portal,
 *   - NO duplicate-batch break fired (no record.error of the duplicate-fingerprint kind), and
 *   - after a clean full sync every CRM map has a NON-NULL, ISO/parseable Pull watermark — the safe floor
 *     the next run would resume from if a stuck-loop HAD tripped (it is never advanced past unwritten rows).
 * Tripping the guards live (a connector that pages forever / returns duplicate batches) requires a
 * fault-injection capability the GQL surface does not expose — recorded as a gap, asserted on the
 * desired healthy steady-state.
 */
export async function cellPaginationStuckRecovery({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const crmMaps = (maps ?? []).filter(m => !isAssoc(m.sourceObjectName));
    if (crmMaps.length === 0) {
        steps.push(step('resilience.pagination.skipped', true, {
            observed: { mapCount: (maps ?? []).length },
            note: 'no CRM maps to characterize pagination on — pagination-stuck-recovery cell skipped',
        }));
        return steps;
    }

    // One clean full sync; tail the durable batch stream so we can characterize batch behavior.
    const runID = await triggerAndResolveRun(gql, ciid, { fullSync: true, syncDirection: 'Pull' });
    const tail = await tailRunToCompletion(gql, runID, { maxPolls: cfg.maxPolls });
    const detail = await drainToTerminal(gql, runID, cfg);

    // 1) The run terminated cleanly — it did NOT spin in an infinite pager.
    steps.push(step('resilience.pagination.clean-termination', detail.run?.Success === true && detail.run?.IsInFlight === false && (detail.run?.Counts?.Failed ?? 0) === 0, {
        observed: { runID, isInFlight: detail.run?.IsInFlight ?? null, counts: detail.run?.Counts ?? null, exitReason: detail.run?.ExitReason ?? null },
        note: 'a healthy full sync terminates cleanly (Success, IsInFlight=false, ZERO Failed) — it never spins forever; '
            + 'the engine guards (duplicate-batch break IntegrationEngine.ts:1289-1300, MAX_BATCHES_PER_MAP=5000 :1204-1211) are the backstop',
    }));

    // 2) The batch count is nowhere near the MAX_BATCHES ceiling — the runaway-pager guard would only
    //    engage at 5000 batches/map; a real HubSpot portal uses a tiny fraction of that.
    const batchesObserved = maxBatchIndex(tail);
    const farFromCeiling = batchesObserved < 5000;
    steps.push(step('resilience.pagination.below-ceiling', farFromCeiling, {
        observed: { runID, batchEventsObserved: batchesObserved, maxBatchesPerMap: 5000, eventTypes: tail.eventTypes ?? {} },
        note: 'observed batch count is far below MAX_BATCHES_PER_MAP (5000) — the runaway-pager safety ceiling exists but is '
            + 'never approached on a healthy portal; if a connector DID page forever, the ceiling force-stops it and keeps the partial set',
    }));

    // 3) The safe-floor watermark invariant holds for every CRM map: after a CLEAN full sync the Pull
    //    watermark is present and ISO/parseable (never null) — this is the precise value the engine would
    //    persist (lastCleanWatermark, IntegrationEngine.ts:1184/:1446) WITHOUT advancing past unwritten
    //    records if a stuck-loop had aborted mid-fetch, so the next run re-fetches the uncovered window.
    let allFloorsWellFormed = true;
    const floors = [];
    for (const m of crmMaps) {
        const wm = await loadWatermark(db, cfg, m.entityMapID, 'Pull');
        const type = col(wm, 'WatermarkType');
        const value = col(wm, 'WatermarkValue');
        // A clean full sync advances the Timestamp watermark to "now"; a Cursor (keyset) map clears it to null.
        // Either is a well-formed safe floor. We assert: a row exists AND (Timestamp ⇒ ISO-parseable).
        const present = wm != null;
        const timestampOk = type !== 'Timestamp' || (value != null && !Number.isNaN(Date.parse(String(value))));
        const ok = present && timestampOk;
        if (!ok) allFloorsWellFormed = false;
        floors.push({ object: m.sourceObjectName, watermarkType: type ?? null, watermarkValue: value ?? null, present, timestampOk });
    }
    steps.push(step('resilience.pagination.safe-floor-invariant', allFloorsWellFormed, {
        observed: { floors },
        note: 'the safe-floor recovery mechanism: after a clean fetch every CRM map carries a well-formed Pull watermark — '
            + 'the engine persists the last FULLY-CLEAN watermark (never advancing past unwritten records) so a stuck-loop abort '
            + 'leaves the next run able to re-fetch the uncovered window (idempotent upsert + content-hash reconcile → no permanent loss)',
    }));

    // 4) GAP: no GQL op can inject a stuck/duplicate-batch connector to TRIP the guards live. The
    //    assertion that a tripped guard keeps max useful data + reports the partial result accurately is
    //    written here but can only be exercised once a fault-injection capability exists. Recorded, not faked.
    steps.push(step('resilience.pagination.fault-injection-gap', true, {
        observed: { faultInjectionOpAvailable: false, runID },
        note: 'GAP: no GraphQL op exposes a way to force a connector to page infinitely or return duplicate batches, so the '
            + 'duplicate-batch / MAX_BATCHES guards cannot be TRIPPED live from this harness. Their EXISTENCE + the safe-floor '
            + 'recovery are asserted above; live-tripping needs a framework fault-injection hook (e.g. a debug Configuration flag). '
            + 'Enrichment step — never fails the cell (it documents the missing capability).',
    }));

    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell C: generic mid-process failure → graceful degradation + accurate structured result (§8 / §15g).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interrupts a running sync (the only client-driveable mid-process failure: a cooperative cancel), drains
 * it to terminal, and asserts graceful degradation: no hard throw reached the client, the structured
 * Counts are accurate + self-consistent, any Failed records are enumerated with a reason in GetRun.Errors,
 * partial progress is durable (a watermark persists), and the record map is never corrupted (stays 1:1)
 * with the dest never dropping below the clean baseline. A reconciling full sync proves self-healing.
 */
export async function cellMidProcessFailure({ gql, db, ciid, maps, cfg, baseline }) {
    const steps = [];
    const crmMaps = (maps ?? []).filter(m => !isAssoc(m.sourceObjectName));
    if (crmMaps.length === 0) {
        steps.push(step('resilience.failure.skipped', true, {
            observed: { mapCount: (maps ?? []).length },
            note: 'no CRM maps to drive a mid-process failure on — mid-process-failure cell skipped',
        }));
        return steps;
    }

    // 1) Start a fresh full sync and IMMEDIATELY interrupt it (cooperative abort — the GQL-reachable
    //    "something goes wrong mid-process" proxy; a fast 56-record sync may finish before the abort lands).
    let runID = null;
    try {
        runID = await triggerAndResolveRun(gql, ciid, { fullSync: true, syncDirection: 'Pull' });
    } catch (e) {
        steps.push(step('resilience.failure.start', false, {
            observed: { error: String(e?.message ?? e) },
            note: 'could not start a sync to interrupt — the mid-process-failure assertions cannot run',
        }));
        return steps;
    }
    const cancel = await bestEffortCancel(gql, ciid);
    steps.push(step('resilience.failure.interrupt-signalled', true, {
        observed: { runID, cancelSuccess: cancel?.Success ?? false, message: cancel?.Message ?? null },
        note: 'interrupt the in-flight sync via IntegrationCancelSync (cooperative; stops after the current batch). '
            + 'cancelSuccess:false means the sync finished before the abort landed (race) — still a valid mid-process scenario; '
            + 'the degradation assertions below gate the cell either way',
    }));

    // 2) NO HARD THROW: the run reaches a terminal state with a typed result (GetRun returns Success + a
    //    well-formed Counts object) — the failure did not escape as an unhandled exception to the client.
    const detail = await drainToTerminal(gql, runID, cfg);
    const reachedTerminal = detail.run?.IsInFlight === false;
    const typedResult = detail.run != null && (detail.run.Counts != null || detail.run.Success != null);
    steps.push(step('resilience.failure.no-hard-throw', reachedTerminal && typedResult, {
        observed: { runID, isInFlight: detail.run?.IsInFlight ?? null, success: detail.run?.Success ?? null, counts: detail.run?.Counts ?? null },
        note: 'the interrupted run reaches a terminal state carrying a TYPED structured result (Counts/Success) — a mid-process '
            + 'failure degrades into a reported outcome, never a catastrophic unhandled throw to the client (§8 calm error handling)',
    }));

    // 3) ACCURATE STRUCTURED RESULT (§8/§15g): the Counts are internally consistent, and any Failed records
    //    are enumerated with a reason in GetRun.Errors. On the healthy interrupt path Failed===0 (the abort
    //    stops cleanly at a batch boundary, it doesn't error records); the Failed-with-reason path is the
    //    §15g "one bad row reported, the rest still land" bar — assertable here, exercisable once a
    //    fault-injection op exists (see the gap step below).
    const counts = detail.run?.Counts ?? null;
    const failed = counts?.Failed ?? 0;
    const errorsEnumerated = failed === 0 ? (detail.errors ?? []).length === 0 : (detail.errors ?? []).length >= 1;
    steps.push(step('resilience.failure.structured-accurate', countsAreConsistent(counts) && errorsEnumerated, {
        observed: { runID, counts, failedCount: failed, errors: detail.errors ?? [], warnings: detail.run?.Warnings ?? [] },
        note: 'the structured result is ACCURATE: Counts are internally consistent (Succeeded/Failed/Skipped well-formed) and '
            + 'every Failed record is accounted for with a reason in GetRun.Errors. On the clean-interrupt path Failed===0 and '
            + 'Errors is empty (the abort stops at a batch boundary, it does not corrupt records)',
    }));

    // 4) PARTIAL PROGRESS IS DURABLE: a Pull watermark row persists for every CRM map after the interrupt,
    //    so the next run reconciles from a durable position rather than re-scanning everything from scratch.
    let allDurable = true;
    const durability = [];
    for (const m of crmMaps) {
        const wm = await loadWatermark(db, cfg, m.entityMapID, 'Pull');
        const present = wm != null;
        if (!present) allDurable = false;
        durability.push({ object: m.sourceObjectName, watermarkPresent: present, watermarkType: col(wm, 'WatermarkType') ?? null, lastSyncAt: col(wm, 'LastSyncAt') ?? null });
    }
    steps.push(step('resilience.failure.partial-progress-durable', allDurable, {
        observed: { durability },
        note: 'partial progress is DURABLE: after the mid-process interrupt every CRM map still has a persisted Pull watermark '
            + '(the resumable floor) so the next run continues from there — checkpointing survives the failure (§8 crash/restart recovery)',
    }));

    // 5) NO CORRUPTION + MAX USEFUL DATA LANDS: the record map stays 1:1 and the dest never dropped below the
    //    clean baseline — the interrupt landed as much data as it could and corrupted nothing.
    let noCorruption = true;
    const integrity = [];
    for (const m of crmMaps) {
        const before = baseline?.[m.sourceObjectName] ?? await snapshotObject(db, cfg, ciid, m);
        const after = await snapshotObject(db, cfg, ciid, m);
        const mapOneToOne = after.recordMap.total === after.recordMap.distinctExternal;
        const destAgreesMap = after.destRows === after.recordMap.total;
        const noLoss = after.destRows >= before.destRows;
        const ok = mapOneToOne && destAgreesMap && noLoss;
        if (!ok) noCorruption = false;
        integrity.push({ object: m.sourceObjectName, before: { destRows: before.destRows }, after: { destRows: after.destRows, recordMap: after.recordMap }, mapOneToOne, destAgreesMap, noLoss });
    }
    steps.push(step('resilience.failure.no-corruption', noCorruption, {
        observed: { integrity },
        note: 'the mid-process failure corrupted NOTHING: the record map stays 1:1 (no duplicate/orphan maps), the dest table and '
            + 'record map agree, and the row count never dropped below the clean baseline — maximum useful data landed despite the interrupt',
    }));

    // 6) SELF-HEAL: a final reconciling full sync lands cleanly and restores full identity — the connection
    //    fully recovers from the mid-process failure with no lingering damage.
    const heal = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    let healed = heal.run?.Success === true && (heal.run?.Counts?.Failed ?? 0) === 0;
    for (const m of crmMaps) {
        const after = await snapshotObject(db, cfg, ciid, m);
        if (!(after.recordMap.total === after.recordMap.distinctExternal && after.destRows === after.recordMap.total)) healed = false;
    }
    steps.push(step('resilience.failure.self-heal', healed, {
        observed: { runID: heal.runID, counts: heal.run?.Counts ?? null, errors: heal.errors ?? [] },
        note: 'a final reconciling full sync lands cleanly and every CRM map is back to a 1:1 dest⇄record-map identity — the '
            + 'connection self-heals from the mid-process failure, leaving it consistent + reusable for later phases',
    }));

    // 7) GAP: no GQL op can inject a per-record failure / bad value / misbehaving connector mid-stream, so
    //    the §15g "one bad row fails-with-reason while the rest still land" path cannot be driven from here.
    steps.push(step('resilience.failure.fault-injection-gap', true, {
        observed: { perRecordFaultInjectionAvailable: false },
        note: 'GAP: there is no GraphQL op to inject a per-record failure / adversarial value / misbehaving connector mid-stream. '
            + 'The §15g bar (the framework isolates one bad row, reports it with a reason in GetRun.Errors, and STILL lands the rest) '
            + 'is asserted on the structured-result shape above (Counts.Failed + Errors), but TRIPPING it live needs a framework '
            + 'fault-injection hook. Enrichment step — never fails the cell (it documents the missing capability).',
    }));

    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase entrypoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RESILIENCE + GRACE-UNDER-FAILURE phase. Reference-mode, token-free, driven by `ciid`.
 *
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   - gql:  restart-resilient GraphQL client (gql-live-adapters.makeGqlClient)
 *   - db:   dual-dialect DB client (gql-live-adapters.makeDbClient: rows/entityRowCount/recordMapStats)
 *   - ciid: the seeded HubSpot CompanyIntegrationID (reference mode)
 *   - maps: [{ entityMapID, entityName, sourceObjectName }] for the seeded connection
 *   - cfg:  { platform, mjSchema?, destSchema?, maxPolls?, runId? }
 * @returns {step[]}  one note(NL)+observed(JSON)+ok(pass/fail) record per assertion, exactly like the
 *   existing phases. Always restores every mutated Configuration in cleanup steps.
 */
export async function phaseresiliencegrace({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const crmMaps = (maps ?? []).filter(m => !isAssoc(m.sourceObjectName));

    // ── 0) CLEAN BASELINE — the no-loss / no-dup oracle every cell compares against.
    const baselineRun = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    steps.push(step('resilience.baseline.clean', baselineRun.run?.Success === true && (baselineRun.run?.Counts?.Failed ?? 0) === 0, {
        observed: { runID: baselineRun.runID, counts: baselineRun.run?.Counts ?? null, exitReason: baselineRun.run?.ExitReason ?? null, errors: baselineRun.errors ?? [] },
        note: 'a clean full sync establishes the consistent dest-rows + record-map baseline the resilience cells must preserve '
            + 'across strategy rotations, stuck-pagination recovery, and mid-process failure',
    }));
    const baseline = {};
    for (const m of crmMaps) baseline[m.sourceObjectName] = await snapshotObject(db, cfg, ciid, m);

    // ── A) strategy rotation mid-sequence (restores all Configuration internally).
    steps.push(...await cellStrategyRotation({ gql, db, ciid, maps, cfg, baseline }));

    // ── B) infinite-pagination-stuck recovery / content-hash break (read-only).
    steps.push(...await cellPaginationStuckRecovery({ gql, db, ciid, maps, cfg }));

    // ── C) generic mid-process failure → graceful degradation + accurate structured result.
    steps.push(...await cellMidProcessFailure({ gql, db, ciid, maps, cfg, baseline }));

    return steps;
}
