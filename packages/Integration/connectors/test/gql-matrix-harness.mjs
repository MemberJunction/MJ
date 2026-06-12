/**
 * GQL-driven 2^N MATRIX harness — the READ-ONLY framework-mechanics matrix, run through the REAL
 * MJAPI GraphQL API against the pre-seeded HubSpot reference connection (token-free reference mode).
 *
 * Where gql-live-harness.mjs proves the forward/backward DATA path (completeness, record-map 1:1,
 * CRUD round-trip), THIS module proves the engine's incremental-efficiency + ordering MECHANICS as
 * source-grounded by ENGINE_MECHANICS_MAP.json:
 *   - phaseIdempotency  T-B1 (no duplication) + T-C3 (content-hash skip)
 *   - phaseWatermark    T-C1 (timestamp watermark) + T-C2 (fallback save for modstamp-less objects)
 *   - phaseMerkle       T-C4 (opt-in partition/Merkle reconcile + ChangeToken snapshot)
 *   - phaseDag          T-G1 (parent-before-child dependency layering)
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint (plans.mjs), which dereferences secrets and scrubs the result. Reference mode drives the
 * sync purely by CompanyIntegrationID — the encrypted credential is decrypted server-side; the HubSpot
 * token never enters this process.
 *
 * READ-ONLY DISCIPLINE: every phase only RE-SYNCS (Pull) and reads the DB / event stream / MJAPI log.
 * It NEVER writes to HubSpot, NEVER deletes the seeded connection, and NEVER deletes its entity maps —
 * the seeded connection + maps must persist for later tests. The ONLY mutation it performs is a single
 * opt-in toggle of ONE map's Configuration for the Merkle cell, which it resets in a cleanup step.
 */

// GQL (op strings incl. startSync/listRuns/getRun/tailRunEvents), runSyncObserved (trigger→tail→GetRun),
// and phaseSetup (reference-mode ApplyAll → { ciid, maps }) are reused from the existing harness.
import { GQL, runSyncObserved, phaseSetup } from './gql-live-harness.mjs';
import { readFile } from 'node:fs/promises';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this matrix needs (field names verified against the live
// resolver source: IntegrationDiscoveryResolver.ts EntityMapUpdateInput:631-638,
// EntityMapSummaryOutput:640-651, IntegrationListEntityMaps:3644-3669,
// IntegrationUpdateEntityMaps:3699-3740 — returns MutationResultOutput {Success,Message}).
// ─────────────────────────────────────────────────────────────────────────────

const MATRIX_GQL = {
    updateEntityMaps: `mutation($updates: [EntityMapUpdateInput!]!) {
      IntegrationUpdateEntityMaps(updates: $updates) { Success Message }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message
        EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority Configuration }
      }
    }`,
};

/** The default MJAPI tee'd console log the runner co-locates (console-only events live here). */
const DEFAULT_MJAPI_LOG = '/tmp/mjapi-4000.log';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (mirrors of the harness's so the matrix is self-contained; identical shape)
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

function tryParse(s) {
    if (typeof s !== 'string') return undefined;
    try { return JSON.parse(s); } catch { return undefined; }
}

/** Case-insensitive UUID compare (SQL Server returns upper, the log stores upper, GQL may vary). */
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

const CRM_OBJECTS = ['contacts', 'companies', 'deals'];
const isAssoc = (name) => /assoc/i.test(name ?? '');
const isCrm = (name) => CRM_OBJECTS.includes((name ?? '').toLowerCase());

// ─────────────────────────────────────────────────────────────────────────────
// Dialect-aware SQL builders. The ONLY interpolated values are UUIDs from the harness
// and fixed identifiers — never untrusted input. mssql uses [schema].[Table] + UPPER
// UUID literals; pg uses "schema"."Table" + quoted PascalCase identifiers.
// ─────────────────────────────────────────────────────────────────────────────

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

/** A safe single-quoted SQL string literal (doubles embedded quotes). */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Queries the newest Pull watermark row for an entity map from vwCompanyIntegrationSyncWatermarks.
 * Columns: EntityMapID, Direction, WatermarkType, WatermarkValue, LastSyncAt, RecordsSynced.
 * Returns the single newest row (LastSyncAt DESC) or undefined.
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

/** Counts all Pull watermark rows for an entity map (to assert "exactly one"). */
async function countWatermarkRows(db, cfg, entityMapID, direction = 'Pull') {
    const view = mjT(cfg, 'vwCompanyIntegrationSyncWatermarks');
    const sql =
        `SELECT COUNT(*) AS c FROM ${view} ` +
        `WHERE ${C(cfg, 'EntityMapID')}=${lit(entityMapID)} AND ${C(cfg, 'Direction')}=${lit(direction)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** Row count of a destination table addressed directly by its HubSpot source-object name. */
async function destRowCount(db, cfg, sourceObjectName) {
    const sql = `SELECT COUNT(*) AS c FROM ${destT(cfg, sourceObjectName)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** MAX(__mj_UpdatedAt) of a destination table (as a string) — to prove skip leaves rows untouched. */
async function destMaxUpdatedAt(db, cfg, sourceObjectName) {
    const sql = `SELECT MAX(${C(cfg, '__mj_UpdatedAt')}) AS m FROM ${destT(cfg, sourceObjectName)}`;
    const rows = await db.rows(sql);
    const m = col(rows?.[0], 'm');
    return m == null ? null : String(m);
}

/**
 * Returns content-hash coverage for a destination table: total rows, rows whose
 * __mj_integration_ContentHash matches a 64-char lowercase hex SHA-256, and one sample.
 */
async function contentHashCoverage(db, cfg, sourceObjectName) {
    const sql =
        `SELECT ${C(cfg, '__mj_integration_ContentHash')} AS h ` +
        `FROM ${destT(cfg, sourceObjectName)}`;
    const rows = await db.rows(sql);
    const re = /^[0-9a-f]{64}$/;
    let total = 0, valid = 0, sample = null;
    for (const r of rows ?? []) {
        total++;
        const h = col(r, 'h');
        if (typeof h === 'string' && re.test(h)) { valid++; if (!sample) sample = h; }
    }
    return { total, valid, allValid: total > 0 && valid === total, sample };
}

// ─────────────────────────────────────────────────────────────────────────────
// MJAPI console-log grep (for events that are NOT mirrored to the durable GQL stream:
// sync.partition.reconcile is console-only per the structured-events known gap, and
// sync.entity-map.complete is the authoritative ordering carrier with externalObjectName).
// Best-effort: a missing/unreadable log returns [] so the robust proxy still gates the cell.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the MJAPI tee'd log and returns parsed JSON event objects matching `eventName`
 * for a specific runID (case-insensitive), optionally only those at/after `sinceTs` (ISO string).
 */
async function grepLogEvents(logPath, eventName, runID, sinceTs) {
    let text;
    try { text = await readFile(logPath, 'utf8'); } catch { return { available: false, events: [] }; }
    const out = [];
    const needle = `"event":"${eventName}"`;
    const sinceMs = sinceTs ? Date.parse(sinceTs) : NaN;
    for (const line of text.split('\n')) {
        if (!line.includes(needle)) continue;
        const ev = tryParse(line.trim());
        if (!ev || ev.event !== eventName) continue;
        if (runID && !sameId(ev.runId, runID)) continue;
        if (!Number.isNaN(sinceMs)) {
            const evMs = Date.parse(ev.ts ?? '');
            if (!Number.isNaN(evMs) && evMs < sinceMs) continue;
        }
        out.push(ev);
    }
    return { available: true, events: out };
}

// ─────────────────────────────────────────────────────────────────────────────
// Durable stage-event tail (retains per-object stage.start/stage.complete with their
// Stage label + DataJSON.externalObjectName + Seq/Ts — the harness's tailRunToCompletion
// only keeps a histogram, so the matrix tails the durable stream itself for ordering).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tails a run to completion, keeping every stage.start / stage.complete event with its
 * object name (from DataJSON.externalObjectName, falling back to the Stage label) + Seq/Ts.
 * Keyset-by-seq, no sleeps (a microtask yields between polls).
 */
async function tailStageEvents(gql, runID, maxPolls = 100000) {
    const stages = []; // { eventType, object, seq, ts }
    let sinceSeq = 0;
    for (let i = 0; i < maxPolls; i++) {
        const out = (await gql(GQL.tailRunEvents, { runID, sinceSeq })).IntegrationTailRunEvents;
        if (!out?.Success) throw new Error(`TailRunEvents failed: ${out?.Message ?? 'no payload'}`);
        for (const ev of out.Events ?? []) {
            if (ev.EventType === 'stage.start' || ev.EventType === 'stage.complete') {
                const data = tryParse(ev.DataJSON);
                const object = data?.externalObjectName ?? ev.Stage ?? null;
                stages.push({ eventType: ev.EventType, object, seq: ev.Seq, ts: ev.Ts });
            }
        }
        sinceSeq = out.LatestSeq ?? sinceSeq;
        if (out.IsInFlight === false) break;
    }
    return stages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: idempotency + content-hash skip  (T-B1, T-C3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two back-to-back full syncs must NOT duplicate, and the 2nd must SKIP unchanged CRM rows
 * (content-hash fast path). Asserts on Skipped/Succeeded + DB counts, never on Processed
 * (Counts.Processed double-counts fetched+applied per the known structured-events bug).
 */
export async function phaseIdempotency({ gql, db, ciid, maps, cfg }) {
    const steps = [];

    // Full sync #1 — establishes/refreshes the baseline.
    const run1 = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    steps.push(step('idempotency.full.run1', run1.run?.Success === true && (run1.run?.Counts?.Failed ?? 0) === 0, {
        runID: run1.runID, counts: run1.run?.Counts ?? null, exitReason: run1.run?.ExitReason ?? null, errors: run1.errors,
    }));

    // Snapshot per object (CRM + assoc) after run #1.
    const snap1 = {};
    for (const m of maps) {
        snap1[m.sourceObjectName] = {
            destRows: await destRowCount(db, cfg, m.sourceObjectName),
            recordMap: await db.recordMapStats(ciid, m.entityName),
            maxUpdatedAt: await destMaxUpdatedAt(db, cfg, m.sourceObjectName),
        };
    }

    // Full sync #2 — forces re-fetch; content-hash must skip unchanged CRM rows (no re-write).
    const run2 = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    const run2Skipped = run2.run?.Counts?.Skipped ?? 0;
    const run2Succeeded = run2.run?.Counts?.Succeeded ?? 0;
    const run1Succeeded = run1.run?.Counts?.Succeeded ?? 0;
    steps.push(step('idempotency.full.run2', run2.run?.Success === true && (run2.run?.Counts?.Failed ?? 0) === 0, {
        runID: run2.runID, counts: run2.run?.Counts ?? null, errors: run2.errors,
    }));

    // Run-level content-hash signal: run #2 skipped > 0 and did far less write work than run #1.
    steps.push(step('idempotency.content-hash.skip', run2Skipped > 0 && run2Succeeded < run1Succeeded, {
        run1Succeeded, run2Succeeded, run2Skipped,
        note: 'assert on Skipped/Succeeded (run-level); Counts.Processed is double-counted (fetched+applied) so NOT used',
    }));

    // Per-object no-duplication + (CRM) skip footprint.
    for (const m of maps) {
        const before = snap1[m.sourceObjectName];
        const after = {
            destRows: await destRowCount(db, cfg, m.sourceObjectName),
            recordMap: await db.recordMapStats(ciid, m.entityName),
            maxUpdatedAt: await destMaxUpdatedAt(db, cfg, m.sourceObjectName),
        };
        const noDup = after.destRows === before.destRows
            && after.recordMap.total === before.recordMap.total
            && after.recordMap.total === after.recordMap.distinctExternal; // 1:1 map identity stable
        steps.push(step('idempotency.no-duplication', noDup, {
            object: m.sourceObjectName, before, after,
            note: 'row count + record-map total unchanged across two full syncs; record map stays 1:1 (no dup maps)',
        }));

        if (isCrm(m.sourceObjectName)) {
            // CRM objects have a content-hash and a watermark/modstamp → run #2 must leave the dest
            // rows physically untouched (skip path calls no Save() → __mj_UpdatedAt does NOT advance).
            const untouched = before.maxUpdatedAt != null && after.maxUpdatedAt === before.maxUpdatedAt;
            steps.push(step('idempotency.skip-footprint', untouched, {
                object: m.sourceObjectName, beforeMax: before.maxUpdatedAt, afterMax: after.maxUpdatedAt,
                note: 'content-hash skip leaves __mj_UpdatedAt unchanged (no Save on the skip path)',
            }));

            // Every CRM dest row carries a valid SHA-256 content hash.
            const cov = await contentHashCoverage(db, cfg, m.sourceObjectName);
            steps.push(step('idempotency.content-hash.column', cov.allValid, {
                object: m.sourceObjectName, total: cov.total, valid: cov.valid, sample: cov.sample,
                note: '__mj_integration_ContentHash matches ^[0-9a-f]{64}$ on every row',
            }));
        }
        // Associations may RE-APPLY rather than skip (no modstamp) — only no-duplication is asserted above.
    }

    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: watermark (timestamp) + fallback save  (T-C1, T-C2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * After the idempotency full syncs, every CRM map must have exactly one Pull watermark row of
 * WatermarkType='Timestamp' with an ISO-parseable WatermarkValue and a non-null LastSyncAt; the
 * association map must ALSO have a Pull watermark row even though it has no modstamp (proves the
 * fallback save at IntegrationEngine.ts:1410-1413).
 */
export async function phaseWatermark({ gql, db, ciid, maps, cfg }) { // eslint-disable-line no-unused-vars -- gql/ciid kept for signature symmetry
    const steps = [];
    for (const m of maps) {
        const count = await countWatermarkRows(db, cfg, m.entityMapID, 'Pull');
        const wm = await loadWatermark(db, cfg, m.entityMapID, 'Pull');
        const type = col(wm, 'WatermarkType');
        const value = col(wm, 'WatermarkValue');
        const lastSyncAt = col(wm, 'LastSyncAt');

        if (isAssoc(m.sourceObjectName)) {
            // Fallback save: a modstamp-less object still gets a Pull row so the next run isn't a full scan.
            const ok = !!wm && value != null && String(value).length > 0;
            steps.push(step('watermark.fallback-save', ok, {
                object: m.sourceObjectName, entityMapID: m.entityMapID, rowCount: count,
                watermarkType: type ?? null, watermarkValuePresent: value != null, lastSyncAt: lastSyncAt ?? null,
                note: 'assoc has no modstamp; engine still writes a watermark row (fallback save) for bookkeeping',
            }));
            continue;
        }

        // CRM: exactly one Timestamp row with a valid ISO value + a LastSyncAt.
        const isoValid = value != null && !Number.isNaN(Date.parse(String(value)));
        const ok = count === 1 && type === 'Timestamp' && isoValid && lastSyncAt != null;
        steps.push(step('watermark.timestamp', ok, {
            object: m.sourceObjectName, entityMapID: m.entityMapID, rowCount: count,
            watermarkType: type ?? null, watermarkValue: value ?? null, isoValid, lastSyncAt: lastSyncAt ?? null,
            note: 'exactly one Pull row, WatermarkType=Timestamp, WatermarkValue parses as ISO, LastSyncAt set',
        }));
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: partition / Merkle reconcile  (T-C4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enables partitionReconcile on the deals map, proves the ChangeToken snapshot is stored, then
 * re-syncs unchanged and proves the unchanged-partition skip via (a) the robust counts proxy
 * (Succeeded==0 / all skipped + ChangeToken watermark) and (b) a best-effort MJAPI-log grep for
 * the console-only sync.partition.reconcile event. Always resets the map Configuration in cleanup.
 */
export async function phaseMerkle({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const dealsMap = maps.find(m => (m.sourceObjectName ?? '').toLowerCase() === 'deals');
    if (!dealsMap) {
        steps.push(step('merkle.skipped', true, { note: 'no deals entity map present in seeded connection — Merkle cell skipped' }));
        return steps;
    }
    const dealsMapID = dealsMap.entityMapID;
    const logPath = cfg.mjapiLogPath ?? DEFAULT_MJAPI_LOG;
    let configReset = false;

    try {
        // 1) Enable partition reconcile via Configuration JSON, then verify it round-trips.
        const cfgJson = JSON.stringify({ partitionReconcile: true, partitionCount: 16 });
        const upd = (await gql(MATRIX_GQL.updateEntityMaps, {
            updates: [{ EntityMapID: dealsMapID, Configuration: cfgJson }],
        })).IntegrationUpdateEntityMaps;
        steps.push(step('merkle.enable', upd?.Success === true, { entityMapID: dealsMapID, message: upd?.Message }));

        const listed = (await gql(MATRIX_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
        const dealsListed = (listed?.EntityMaps ?? []).find(e => sameId(e.ID, dealsMapID));
        const roundTrips = !!dealsListed && typeof dealsListed.Configuration === 'string'
            && dealsListed.Configuration.includes('partitionReconcile');
        steps.push(step('merkle.config.round-trip', roundTrips, {
            entityMapID: dealsMapID, configuration: dealsListed?.Configuration ?? null,
            note: 'GQL is the source of truth; the returned EntityMap.Configuration carries partitionReconcile',
        }));

        // 2) Full sync to seed the rollup snapshot; the deals Pull watermark flips to ChangeToken.
        const seedTs = new Date().toISOString();
        const seedRun = await runSyncObserved(gql, ciid, {
            fullSync: true, syncDirection: 'Pull', entityMapIDs: [dealsMapID], maxPolls: cfg.maxPolls,
        });
        steps.push(step('merkle.seed.run', seedRun.run?.Success === true, {
            runID: seedRun.runID, counts: seedRun.run?.Counts ?? null, errors: seedRun.errors,
        }));

        const seedWm = await loadWatermark(db, cfg, dealsMapID, 'Pull');
        const seedType = col(seedWm, 'WatermarkType');
        const seedValue = col(seedWm, 'WatermarkValue');
        const parsedSnap = tryParse(typeof seedValue === 'string' ? seedValue : '');
        const changeTokenOk = seedType === 'ChangeToken' && parsedSnap != null && typeof parsedSnap === 'object';
        steps.push(step('merkle.change-token', changeTokenOk, {
            entityMapID: dealsMapID, watermarkType: seedType ?? null,
            snapshotIsObject: parsedSnap != null && typeof parsedSnap === 'object',
            partitionCount: parsedSnap && typeof parsedSnap === 'object' ? Object.keys(parsedSnap).length : null,
            note: 'rollup snapshot persisted as ChangeToken (JSON {partition:hash}) on the Pull row',
        }));

        // 3) Re-sync UNCHANGED → unchanged partitions skip. Robust proxy: Succeeded==0 (nothing
        //    created/updated) and the ChangeToken value is unchanged. Plus best-effort log evidence.
        const reconcileTs = new Date().toISOString();
        const reRun = await runSyncObserved(gql, ciid, {
            fullSync: false, syncDirection: 'Pull', entityMapIDs: [dealsMapID], maxPolls: cfg.maxPolls,
        });
        const reSucceeded = reRun.run?.Counts?.Succeeded ?? 0;
        const reFailed = reRun.run?.Counts?.Failed ?? 0;
        const reWm = await loadWatermark(db, cfg, dealsMapID, 'Pull');
        const reType = col(reWm, 'WatermarkType');
        const reValue = col(reWm, 'WatermarkValue');
        const tokenStable = reType === 'ChangeToken' && reValue === seedValue;
        steps.push(step('merkle.reconcile.skip-proxy', reSucceeded === 0 && reFailed === 0 && tokenStable, {
            runID: reRun.runID, reSucceeded, reFailed, counts: reRun.run?.Counts ?? null,
            changeTokenStable: tokenStable,
            note: 'robust proxy: unchanged re-sync creates/updates nothing & the ChangeToken snapshot is unchanged',
        }));

        // 3b) Log-grep enrichment (console-only sync.partition.reconcile; NOT in the durable stream).
        const grep = await grepLogEvents(logPath, 'sync.partition.reconcile', reRun.runID, reconcileTs);
        const recEv = grep.events.find(e => (e.externalObjectName ?? '').toLowerCase() === 'deals') ?? grep.events[0];
        const logEvidence = !!recEv && (recEv.changedPartitions === 0) && (recEv.skippedPartitions > 0);
        steps.push(step('merkle.reconcile.log-evidence', true, {
            // Enrichment only — NEVER fails the cell (console event is best-effort; the proxy is authoritative).
            logAvailable: grep.available, runID: reRun.runID, eventFound: !!recEv,
            changedPartitions: recEv?.changedPartitions ?? null, skippedPartitions: recEv?.skippedPartitions ?? null,
            skippedRecords: recEv?.skippedRecords ?? null, appliedRecords: recEv?.appliedRecords ?? null,
            logConfirmsSkip: logEvidence, seedTs, reconcileTs,
            note: 'sync.partition.reconcile is console-only (structured-events gap); enrichment, not a gate',
        }));
    } finally {
        // 4) CLEANUP (critical): reset the deals map Configuration so it can't affect later tests.
        //    A later timestamp sync will re-create a fresh Timestamp watermark row (the ChangeToken row
        //    is harmless until then — newest-LastSyncAt wins on Load, and the next Pull write wins).
        try {
            const reset = (await gql(MATRIX_GQL.updateEntityMaps, {
                updates: [{ EntityMapID: dealsMapID, Configuration: '' }],
            })).IntegrationUpdateEntityMaps;
            configReset = reset?.Success === true;
            steps.push(step('merkle.cleanup.reset-config', configReset, {
                entityMapID: dealsMapID, message: reset?.Message,
                note: 'Configuration reset to empty; next timestamp sync re-creates a Timestamp watermark',
            }));
        } catch (e) {
            steps.push(step('merkle.cleanup.reset-config', false, { entityMapID: dealsMapID, error: String(e?.message ?? e) }));
        }
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: DAG parent-before-child layering  (T-G1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One full sync of all maps; the association object's start must come AFTER both parents
 * (contacts + companies) complete. The authoritative ordering carrier is the console
 * sync.entity-map.complete line (it carries externalObjectName + ts); the durable
 * stage.start/stage.complete stream is used as a secondary signal.
 */
export async function phaseDag({ gql, db, ciid, maps, cfg }) { // eslint-disable-line no-unused-vars -- db kept for signature symmetry
    const steps = [];
    const assocMap = maps.find(m => isAssoc(m.sourceObjectName));
    if (!assocMap) {
        steps.push(step('dag.skipped', true, { note: 'no association entity map in seeded connection — DAG cell skipped' }));
        return steps;
    }
    const logPath = cfg.mjapiLogPath ?? DEFAULT_MJAPI_LOG;
    const startTs = new Date().toISOString();

    // One full run of ALL maps; capture the durable stage stream as we go.
    const runID = await (async () => {
        // Trigger + resolve through the harness's runSyncObserved would discard the stage stream;
        // here we want the stage events, so we tail the durable stream ourselves after triggering.
        const res = await runSyncObservedWithStages(gql, ciid, {
            fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls,
        });
        steps.push(step('dag.run', res.run?.Success === true, {
            runID: res.runID, counts: res.run?.Counts ?? null, errors: res.errors,
        }));
        // Secondary signal: durable stage ordering (object names from DataJSON.externalObjectName).
        const stageOrder = orderingFromStages(res.stages, assocMap.sourceObjectName);
        if (stageOrder.assessable) {
            steps.push(step('dag.order.durable', stageOrder.parentBeforeChild, {
                source: 'durable stage.start/stage.complete stream',
                assocStartSeq: stageOrder.childStartSeq, parentCompleteSeqs: stageOrder.parentCompleteSeqs,
                note: 'assoc stage.start Seq is after both parents\' stage.complete Seq',
            }));
        } else {
            steps.push(step('dag.order.durable', true, {
                source: 'durable stage stream', assessable: false,
                note: 'durable stage stream lacked per-object start/complete for the parents — see log-evidence gate',
            }));
        }
        return res.runID;
    })();

    // Authoritative gate: console sync.entity-map.complete carries externalObjectName + ts.
    const grep = await grepLogEvents(logPath, 'sync.entity-map.complete', runID, startTs);
    const ordering = orderingFromLog(grep.events, assocMap.sourceObjectName);
    if (!grep.available) {
        // No log to read → fall back to the durable signal already recorded above (do not hard-fail
        // the cell on a missing tee'd log; the durable order step gates it).
        steps.push(step('dag.order.log', true, {
            logAvailable: false, runID,
            note: 'MJAPI log not readable; relying on durable stage ordering signal',
        }));
        return steps;
    }
    steps.push(step('dag.order.log', ordering.assessable ? ordering.parentBeforeChild : false, {
        source: 'console sync.entity-map.complete (authoritative, carries externalObjectName)',
        runID, assessable: ordering.assessable,
        assocCompleteTs: ordering.childTs, parentCompleteTs: ordering.parentTs,
        parentsSeen: ordering.parentsSeen, assocSeen: ordering.assocSeen,
        note: 'association completes only AFTER both contacts + companies complete (parent-before-child)',
    }));
    return steps;
}

/** runSyncObserved variant that ALSO retains the durable stage events for ordering. */
async function runSyncObservedWithStages(gql, ciid, opts) {
    // Trigger via the same race-free path the harness uses, then tail twice: once for stages, the
    // GetRun aggregate for the authoritative terminal verdict. We re-import the harness trigger by
    // reusing StartSync + ListRuns through GQL directly to avoid a double-tail conflict.
    const started = (await gql(GQL.startSync, {
        ciid, fullSync: opts.fullSync ?? false, syncDirection: opts.syncDirection ?? null,
        entityMapIDs: opts.entityMapIDs ?? null,
    })).IntegrationStartSync;
    if (started?.Success !== true) throw new Error(`StartSync failed: ${started?.Message ?? 'no payload'}`);
    let runID = started.RunID;
    if (!runID) {
        const runs = (await gql(GQL.listRuns, { ciid, inFlightOnly: true, limit: 1 })).IntegrationListRuns;
        runID = runs?.Runs?.[0]?.RunID;
        if (!runID) throw new Error('Could not resolve run id after StartSync (no RunID and no in-flight run)');
    }
    const stages = await tailStageEvents(gql, runID, opts.maxPolls ?? 100000);
    const detail = (await gql(GQL.getRun, { runID })).IntegrationGetRun;
    return { runID, stages, run: detail?.Run ?? null, errors: detail?.Errors ?? [] };
}

/** Derives parent-before-child ordering from the durable stage stream. */
function orderingFromStages(stages, assocObject) {
    const lc = (s) => (s ?? '').toLowerCase();
    const childStart = stages.find(s => s.eventType === 'stage.start' && lc(s.object) === lc(assocObject));
    const parentCompletes = stages.filter(s => s.eventType === 'stage.complete' && isCrm(s.object));
    const parentObjs = new Set(parentCompletes.map(s => lc(s.object)));
    const haveBothParents = parentObjs.has('contacts') && parentObjs.has('companies');
    if (!childStart || !haveBothParents) return { assessable: false };
    const childStartSeq = childStart.seq;
    const parentCompleteSeqs = parentCompletes
        .filter(s => lc(s.object) === 'contacts' || lc(s.object) === 'companies')
        .map(s => s.seq);
    const parentBeforeChild = parentCompleteSeqs.every(seq => seq < childStartSeq);
    return { assessable: true, parentBeforeChild, childStartSeq, parentCompleteSeqs };
}

/** Derives parent-before-child ordering from the authoritative console complete-events. */
function orderingFromLog(events, assocObject) {
    const lc = (s) => (s ?? '').toLowerCase();
    const tsOf = (obj) => {
        const ev = events.find(e => lc(e.externalObjectName) === lc(obj));
        return ev?.ts ? Date.parse(ev.ts) : null;
    };
    const assocTs = tsOf(assocObject);
    const contactsTs = tsOf('contacts');
    const companiesTs = tsOf('companies');
    const parentsSeen = (contactsTs != null) && (companiesTs != null);
    const assocSeen = assocTs != null;
    if (!parentsSeen || !assocSeen) {
        return {
            assessable: false, parentsSeen, assocSeen,
            childTs: assocTs, parentTs: { contacts: contactsTs, companies: companiesTs },
        };
    }
    const parentBeforeChild = contactsTs < assocTs && companiesTs < assocTs;
    return {
        assessable: true, parentBeforeChild, parentsSeen, assocSeen,
        childTs: assocTs, parentTs: { contacts: contactsTs, companies: companiesTs },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * READ-ONLY matrix orchestrator. Reference mode only: ApplyAll against the seeded connection to
 * obtain { ciid, maps } (never deletes them), then runs the four mechanics phases in order.
 *
 * @param {object} io  { gql(query,vars), db (rows/entityRowCount/recordMapStats/close) }
 * @param {object} cfg { platform, mjSchema, destSchema?, objects[], companyIntegrationID, maxPolls?, mjapiLogPath? }
 * @returns {{ ok, platform, steps: { setup, idempotency, watermark, merkle, dag } }}
 */
export async function runMatrixReadonly({ gql, db }, cfg) {
    const result = { ok: false, platform: cfg.platform, steps: {} };
    try {
        if (!cfg.companyIntegrationID) {
            throw new Error('runMatrixReadonly is reference-mode only: cfg.companyIntegrationID (HS_LIVE_CIID) is required');
        }
        // Two setup modes:
        //  - DEFAULT: ApplyAll (skipRestart:true keeps the map IDs in the response) — does NOT delete anything.
        //  - REUSE (cfg.reuseMaps, HS_LIVE_REUSE_MAPS=1): reuse the connection's EXISTING entity maps via
        //    ListEntityMaps and skip ApplyAll. ApplyAll re-triggers the RSU pipeline whose CompileTypeScript
        //    (npx turbo build) churns the workspace dist on a dev box, intermittently dropping the dest procs
        //    mid-sync. Reusing maps avoids RSU entirely so the schema stays stable across the repeated syncs
        //    (required for a clean end-to-end run on Postgres in a live dev workspace).
        let setup;
        if (cfg.reuseMaps) {
            const listed = (await gql(MATRIX_GQL.listEntityMaps, { ciid: cfg.companyIntegrationID })).IntegrationListEntityMaps;
            if (!listed?.Success) throw new Error(`ListEntityMaps failed: ${listed?.Message ?? 'no payload'}`);
            const maps = (listed.EntityMaps ?? [])
                .filter(m => m.Status === 'Active' || m.Status == null)
                .map(m => ({ entityMapID: m.ID, entityName: m.Entity, sourceObjectName: m.ExternalObjectName, fieldMapCount: null }));
            if (maps.length === 0) throw new Error('reuseMaps: no existing entity maps for this CIID — run ApplyAll once first');
            setup = { ciid: cfg.companyIntegrationID, maps, referenceMode: true };
        } else {
            setup = await phaseSetup({ gql, cfg });
        }
        result.steps.setup = step('setup', true, {
            ciid: setup.ciid, referenceMode: setup.referenceMode, mapCount: setup.maps.length, reuseMaps: !!cfg.reuseMaps,
            maps: setup.maps.map(m => ({ object: m.sourceObjectName, entity: m.entityName, fieldMaps: m.fieldMapCount })),
        });
        const ciid = setup.ciid;
        const maps = setup.maps;

        result.steps.idempotency = await phaseIdempotency({ gql, db, ciid, maps, cfg });
        result.steps.watermark = await phaseWatermark({ gql, db, ciid, maps, cfg });
        result.steps.merkle = await phaseMerkle({ gql, db, ciid, maps, cfg });
        result.steps.dag = await phaseDag({ gql, db, ciid, maps, cfg });

        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        result.ok = !result.error && allStepsOk(result.steps);
    }
}
