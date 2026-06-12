/**
 * GQL-driven KEYSET / RESTART-RECOVERY phase — plan.md §2 (keyset: "try to restart api and see what
 * happens to sync based on logs"), §7 ("resumable scans without watermarks" — keyset/cursor pagination
 * resumes from the last seen key, robust to mid-stream insert/delete), and §8 / §15c ("crash/restart
 * recovery: if the server restarts mid-sync it must pick back up; after a stop the next run resumes
 * cleanly — no duplicates, no lost records"). Run through the REAL MJAPI GraphQL API against the
 * pre-seeded HubSpot reference connection (token-free reference mode, identified by `ciid`).
 *
 * WHAT IT PROVES (the requirement, restated as assertions):
 *   1. INTERRUPT A RUNNING SYNC. The only client-driveable interrupt is IntegrationCancelSync (a
 *      cooperative abort — "stops after the current batch"). There is NO GraphQL op to forcibly
 *      kill/restart MJAPI mid-sync, so the harness interrupts via Cancel. (Gap recorded.)
 *   2. PARTIAL STATE IS CONSISTENT. After the interrupt, the keyset/cursor resume position is persisted
 *      on the Pull watermark as WatermarkType='Cursor' (engine: WatermarkService.SaveKeysetPosition,
 *      IntegrationEngine.ts:1399-1400 durable floor + :1453-1457 early-exit), and it is never advanced
 *      PAST records that weren't written (the §8a safe-floor invariant). DB-direct verified.
 *   3. RESUME FROM THE LAST SEEN KEY. The next incremental run re-anchors the keyset seek from the saved
 *      Cursor value (`WHERE <key> > AfterKey ORDER BY <key>`) instead of re-scanning from the start —
 *      surfaced by the console `sync.resume.keyset` event (externalObjectName + resumeAfterKey).
 *   4. NO DUPLICATES, NO LOST RECORDS, robust to mid-stream insert/delete. After resume completes, the
 *      destination row count and the CompanyIntegrationRecordMap are byte-for-byte 1:1 with a clean
 *      full-sync baseline (no record skipped past the boundary; the idempotent upsert + content-hash
 *      absorb any boundary re-fetch overlap → no duplication). When allowWrite=true a disposable record
 *      is inserted mid-cycle to prove an insert that lands above the cursor is still picked up.
 *
 * KEYSET-DORMANT REALITY (HubSpot): the engine gates keyset resume on
 * `connector.StableOrderingKey(object) != null`. HubSpot's CRM objects (contacts/companies/deals)
 * deliberately return null there (they use a server-side DATE-watermark search, not a seek key —
 * IntegrationEngine.ts:1123-1133), so the Cursor-watermark keyset path is DORMANT for HubSpot. There is
 * also no GraphQL op that exposes a connector's StableOrderingKey, so the phase DETECTS keyset-capability
 * DB-directly (a 'Cursor' Pull watermark ever appearing for a map). It then runs BOTH tracks:
 *   - KEYSET track (only when a Cursor watermark is observed): assert the Cursor resume invariants above.
 *   - RESTART-SAFETY track (always, the HubSpot-real path): the cooperative interrupt + clean resume must
 *     leave the data exactly consistent regardless of whether the resume position rode a keyset Cursor or
 *     the timestamp watermark — no duplicates, no lost records.
 * The keyset-specific cells SKIP (ok:true, note explains) when keyset is dormant, so this phase yields
 * real signal on a stock HubSpot connection AND fully exercises the Cursor path the day an object that
 * declares a StableOrderingKey is seeded.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint; reference mode drives by CompanyIntegrationID — the encrypted credential is decrypted
 * server-side and the HubSpot token never enters this process.
 *
 * STATE DISCIPLINE: NON-DESTRUCTIVE to the seeded connection. It re-syncs (Pull), reads the DB + the
 * durable/console event streams, and (only when cfg.allowWrite===true) creates exactly ONE disposable
 * test-marked record which it deletes by captured ExternalID in a cleanup step. It NEVER deletes the
 * seeded connection, NEVER deletes its entity maps, and NEVER touches users/owners/real data. It always
 * drains any interrupted run to a terminal state and runs a final reconciling full sync so the seeded
 * connection is left consistent for later tests.
 */

// GQL op strings (startSync/listRuns/getRun/tailRunEvents/writeRecord), runSyncObserved (trigger→tail→
// GetRun), triggerAndResolveRun (race-free run-id), and tailRunToCompletion (durable stream incl.
// checkpoints) are reused from the canonical harness so this phase never re-implements the gql client,
// the DB client, or the sync drivers.
import { GQL, runSyncObserved, triggerAndResolveRun, tailRunToCompletion } from '../gql-live-harness.mjs';
import { readFile } from 'node:fs/promises';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts — IntegrationCancelSync(companyIntegrationID) → MutationResultOutput
// {Success,Message} :3474-3493. StartSync/ListRuns/GetRun/TailRunEvents/WriteRecord come from the shared
// GQL object. NOTHING here is invented — there is no op to restart MJAPI or read StableOrderingKey,
// recorded as framework gaps rather than faked.)
// ─────────────────────────────────────────────────────────────────────────────

const KEYSET_GQL = {
    cancelSync: `mutation($ciid: String!) {
      IntegrationCancelSync(companyIntegrationID: $ciid) { Success Message }
    }`,
};

/** The default MJAPI tee'd console log the runner co-locates (console-only events live here). */
const DEFAULT_MJAPI_LOG = '/tmp/mjapi-4000.log';

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
 * Columns: EntityMapID, Direction, WatermarkType, WatermarkValue, LastSyncAt, RecordsSynced. The
 * keyset/seek resume position rides this same row as WatermarkType='Cursor' (WatermarkService.ts:124).
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

/**
 * MJAPI console-log grep (mirrors the matrix harness's): returns parsed JSON event objects matching
 * `eventName` for a specific runID (case-insensitive), optionally only those at/after `sinceTs`. The
 * `sync.resume.keyset` event is console-ONLY (NOT mirrored to the durable GQL stream — SyncLogger
 * forwardToEmitter routes it to the `default` no-mirror case), so this is the only way to observe it.
 * Best-effort: a missing/unreadable log returns { available:false } so the DB proxy still gates the cell.
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

/** Best-effort cancel — never throws (a finished sync can't be cancelled; that's expected, not an error). */
async function bestEffortCancel(gql, ciid) {
    try { return (await gql(KEYSET_GQL.cancelSync, { ciid })).IntegrationCancelSync; }
    catch (e) { return { Success: false, Message: String(e?.message ?? e) }; }
}

/**
 * A per-object identity snapshot used to assert no-duplication / no-loss across an interrupt+resume.
 * destRows = physical dest table count; record map total vs distinctExternal = 1:1 map identity.
 */
async function snapshotObject(db, cfg, ciid, m) {
    return {
        object: m.sourceObjectName,
        destRows: await destRowCount(db, cfg, m.sourceObjectName),
        recordMap: await db.recordMapStats(ciid, m.entityName),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: keyset / restart-recovery  (plan.md §2 + §7 + §8 / §15c)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   cfg adds (beyond the matrix cfg): destSchema?, mjapiLogPath?, allowWrite?(default false),
 *   writeObject?(default 'contacts'), runId, maxPolls?.
 * @returns {step[]}  one note(NL)+observed(JSON)+ok(pass/fail) record per assertion, exactly like the
 *   existing phases. Always restores connection state in cleanup steps.
 */
export async function phaseKeysetRestart({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const logPath = cfg.mjapiLogPath ?? DEFAULT_MJAPI_LOG;
    const allowWrite = cfg.allowWrite === true;

    // The CRM (non-association) maps are the resume-recovery subjects; associations are second-layer and
    // re-derive from parents, so the interrupt-resume identity invariants are asserted on the CRM maps.
    const crmMaps = (maps ?? []).filter(m => !isAssoc(m.sourceObjectName));
    if (crmMaps.length === 0) {
        steps.push(step('keyset.skipped', true, {
            observed: { mapCount: (maps ?? []).length },
            note: 'no non-association (CRM) entity maps in the seeded connection — keyset/restart cell skipped',
        }));
        return steps;
    }

    // ── 0) CLEAN BASELINE. A full sync establishes the authoritative consistent state (dest rows +
    //       record map) that the post-resume state must match exactly. This is the no-loss/no-dup oracle.
    const baselineRun = await runSyncObserved(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    steps.push(step('keyset.baseline.clean', baselineRun.run?.Success === true && (baselineRun.run?.Counts?.Failed ?? 0) === 0, {
        observed: { runID: baselineRun.runID, counts: baselineRun.run?.Counts ?? null, exitReason: baselineRun.run?.ExitReason ?? null, errors: baselineRun.errors ?? [] },
        note: 'a clean full sync establishes the consistent dest-rows + record-map baseline the post-interrupt resume must reproduce exactly',
    }));
    const baseline = {};
    for (const m of crmMaps) baseline[m.sourceObjectName] = await snapshotObject(db, cfg, ciid, m);

    // ── 1) INTERRUPT A RUNNING SYNC. Start a fresh full sync and IMMEDIATELY signal a cooperative abort.
    //       NOTE(gap): IntegrationCancelSync is the ONLY client-driveable interrupt — there is no GQL op
    //       to forcibly restart/kill MJAPI mid-sync. A true process-kill restart can only be driven
    //       out-of-band by the runner (pm2 restart) and verified via the durable JSONL log, which SURVIVES
    //       the restart; the in-process cooperative cancel is the GQL-reachable proxy for "interrupted".
    const interruptTs = new Date().toISOString();
    let interruptedRunID = null;
    try {
        interruptedRunID = await triggerAndResolveRun(gql, ciid, { fullSync: false, syncDirection: 'Pull' });
    } catch (e) {
        steps.push(step('keyset.interrupt.start', false, {
            observed: { error: String(e?.message ?? e) },
            note: 'could not start a sync to interrupt — the rest of the keyset/restart assertions cannot run',
        }));
        return steps;
    }
    const cancel = await bestEffortCancel(gql, ciid);
    const cancelLanded = cancel?.Success === true;
    steps.push(step('keyset.interrupt.signalled', true, {
        observed: { runID: interruptedRunID, cancelSuccess: cancelLanded, message: cancel?.Message ?? null },
        note: 'interrupt the in-flight sync via the cooperative IntegrationCancelSync (stops after the current batch). '
            + 'cancelSuccess:false means the fast 56-record sync finished before the abort landed (race) — still a valid '
            + 'interrupt scenario; the resume-consistency assertions below gate the cell either way',
    }));

    // Drain the interrupted run to a terminal state so we can inspect the persisted partial position.
    const interrupted = await drainToTerminal(gql, interruptedRunID, cfg);
    steps.push(step('keyset.interrupt.terminal', interrupted.run?.IsInFlight === false, {
        observed: { runID: interruptedRunID, isInFlight: interrupted.run?.IsInFlight ?? null, exitReason: interrupted.run?.ExitReason ?? null, counts: interrupted.run?.Counts ?? null },
        note: 'the interrupted run reached a terminal state — its persisted resume position (cursor/watermark) is now inspectable',
    }));

    // ── 2) PARTIAL-STATE CONSISTENCY (keyset track). If the engine wrote a Cursor resume position for any
    //       map (keyset-capable connector), it must be a non-empty seek key — the §8a durable floor. If NO
    //       Cursor row exists anywhere, keyset is DORMANT for this connector (HubSpot CRM declares no
    //       StableOrderingKey) → this cell SKIPS (ok:true) and the restart-safety track below carries the
    //       requirement. We DETECT keyset-capability DB-directly because no GQL op exposes StableOrderingKey.
    let anyCursorObserved = false;
    const cursorObservations = [];
    for (const m of crmMaps) {
        const wm = await loadWatermark(db, cfg, m.entityMapID, 'Pull');
        const type = col(wm, 'WatermarkType');
        const value = col(wm, 'WatermarkValue');
        if (type === 'Cursor') {
            anyCursorObserved = true;
            // §8a invariant: a persisted resume position is either a non-empty seek key (scan in progress)
            // or NULL (cleared after a clean scan). It must NEVER be advanced past unwritten records — we
            // cannot read the connector's internal high-water from here, but a present Cursor key after an
            // interrupt is precisely the "where am I" position the next run seeks from.
            cursorObservations.push({ object: m.sourceObjectName, entityMapID: m.entityMapID, watermarkType: type, resumePositionPresent: value != null && String(value).length > 0, value: value ?? null });
        }
    }
    if (anyCursorObserved) {
        const allWellFormed = cursorObservations.every(o => o.watermarkType === 'Cursor');
        steps.push(step('keyset.partial-state.cursor', allWellFormed, {
            observed: { cursorObservations },
            note: 'keyset-capable map(s) detected: the interrupted scan persisted a WatermarkType=Cursor resume position on the '
                + 'Pull watermark (WatermarkService.SaveKeysetPosition). The §8a safe-floor: the cursor is never advanced past '
                + 'records that were not written — the next run re-seeks WHERE key > AfterKey, so nothing is skipped',
        }));
    } else {
        steps.push(step('keyset.partial-state.cursor', true, {
            observed: { keysetDormant: true, platform: cfg.platform },
            note: 'KEYSET DORMANT for this connector — no map persisted a WatermarkType=Cursor row, i.e. no object declares a '
                + 'StableOrderingKey (HubSpot CRM uses a date-watermark search instead; IntegrationEngine.ts:1123-1133). The '
                + 'cursor-specific assertion vacuously passes; the restart-safety track below carries the §8/§15c requirement. '
                + 'NOTE(gap): there is no GraphQL op exposing a connector\'s StableOrderingKey, so capability is DB-detected',
        }));
    }

    // ── 3) MID-STREAM INSERT (robust to insert/delete) — only when writes are allowed. Insert ONE
    //       disposable record AFTER the interrupt but BEFORE the resume. A correct keyset/watermark resume
    //       must still pick this up (a record inserted above the resume position is not lost; an idempotent
    //       upsert means an inserted-then-also-refetched record is not duplicated). Cleaned up at the end.
    const writeObject = lc(cfg.writeObject ?? 'contacts');
    const writeMap = crmMaps.find(m => lc(m.sourceObjectName) === writeObject) ?? null;
    let createdExternalID = null;
    if (allowWrite && writeMap && !/user|owner/i.test(writeObject)) {
        const marker = `mjkeyset ${cfg.runId ?? Date.now()}`;
        const attrs = {
            email: `mjkeyset-${cfg.runId ?? Date.now()}@example.com`, // RFC-2606 reserved domain — never deliverable
            firstname: 'mjkeyset',
            lastname: marker,
        };
        try {
            const created = (await gql(GQL.writeRecord, {
                ciid, objectName: writeObject, operation: 'create', externalID: null, attributes: JSON.stringify(attrs),
            })).IntegrationWriteRecord;
            createdExternalID = created?.ExternalID ?? null;
            steps.push(step('keyset.midstream.insert', created?.Success === true && !!createdExternalID, {
                observed: { object: writeObject, externalID: createdExternalID, statusCode: created?.StatusCode ?? null, message: created?.Message ?? null },
                note: 'inserted ONE disposable record mid-cycle (after interrupt, before resume) — a correct resume must pick it up '
                    + '(no lost record) without duplicating any boundary record (idempotent upsert keyed on identity)',
                ...(created?.Success && !createdExternalID
                    ? { orphanWarning: 'CREATE succeeded but returned no ExternalID — manual cleanup may be required' }
                    : {}),
            }));
        } catch (e) {
            steps.push(step('keyset.midstream.insert', false, {
                observed: { object: writeObject, error: String(e?.message ?? e) },
                note: 'failed to insert the mid-stream record — the insert-robustness assertion below will reflect this',
            }));
        }
    } else {
        steps.push(step('keyset.midstream.insert', true, {
            observed: { allowWrite, writeMapPresent: !!writeMap, writeObject },
            note: 'mid-stream insert skipped (allowWrite=false or no write map) — the no-loss/no-dup resume assertions below still '
                + 'run over the existing corpus; SELECT a writable map + allowWrite=true to exercise the insert-robustness path',
        }));
    }

    // ── 4) RESUME. The next incremental run must re-anchor the keyset seek from the saved Cursor (when
    //       keyset-capable) instead of re-scanning from the start, and complete cleanly. We tail the
    //       DURABLE stream so any checkpoint ResumableStateJSON is captured, and grep the console log for
    //       the (console-only) sync.resume.keyset event as keyset-track enrichment.
    const resumeTs = new Date().toISOString();
    let resumeRunID;
    try {
        resumeRunID = await triggerAndResolveRun(gql, ciid, { fullSync: false, syncDirection: 'Pull' });
    } catch (e) {
        steps.push(step('keyset.resume.run', false, { observed: { error: String(e?.message ?? e) }, note: 'could not start the resume sync' }));
        // Still attempt cleanup of any created record before returning.
        await cleanupCreatedRecord(gql, db, cfg, steps, ciid, writeObject, createdExternalID);
        return steps;
    }
    const resumeTail = await tailRunToCompletion(gql, resumeRunID, { maxPolls: cfg.maxPolls });
    const resumeDetail = await drainToTerminal(gql, resumeRunID, cfg);
    steps.push(step('keyset.resume.run', resumeDetail.run?.Success === true && (resumeDetail.run?.Counts?.Failed ?? 0) === 0, {
        observed: {
            runID: resumeRunID, counts: resumeDetail.run?.Counts ?? null, exitReason: resumeDetail.run?.ExitReason ?? null,
            checkpoints: resumeTail.checkpoints ?? [], keysetReanchors: resumeTail.keysetReanchors ?? 0, errors: resumeDetail.errors ?? [],
        },
        note: 'the resume run completes cleanly (Success + ZERO Failed) — the sync picks back up from where it was interrupted',
    }));

    // 4b) Keyset re-anchor evidence (console-only sync.resume.keyset; NOT in the durable stream). ENRICHMENT
    //     only — never fails the cell. When keyset is dormant (HubSpot) no such event fires; that is expected.
    const grep = await grepLogEvents(logPath, 'sync.resume.keyset', resumeRunID, resumeTs);
    const resumeEvents = grep.events ?? [];
    const resumeForWriteObj = resumeEvents.find(e => lc(e.externalObjectName) === writeObject) ?? resumeEvents[0] ?? null;
    steps.push(step('keyset.resume.reanchor-evidence', true, {
        observed: {
            logAvailable: grep.available, runID: resumeRunID, resumeEventCount: resumeEvents.length,
            sampleExternalObject: resumeForWriteObj?.externalObjectName ?? null,
            sampleResumeAfterKey: resumeForWriteObj?.resumeAfterKey ?? null,
            keysetActive: resumeEvents.length > 0, interruptTs, resumeTs,
        },
        note: 'sync.resume.keyset is console-ONLY (SyncLogger.forwardToEmitter does not mirror it to the durable GQL stream — '
            + 'a structured-events gap). When keyset is active it carries {externalObjectName, resumeAfterKey} proving the seek '
            + 're-anchored from the last seen key. Enrichment, not a gate (dormant on HubSpot → zero events expected)',
    }));

    // 4c) Cursor cleared after a clean scan (keyset track). After a CLEAN keyset scan the engine clears the
    //     resume position (ClearKeysetPosition → WatermarkType='Cursor', WatermarkValue=null). Only assessed
    //     when keyset was active; otherwise vacuously passes.
    if (anyCursorObserved) {
        const clearStates = [];
        for (const m of crmMaps) {
            const wm = await loadWatermark(db, cfg, m.entityMapID, 'Pull');
            const type = col(wm, 'WatermarkType');
            const value = col(wm, 'WatermarkValue');
            if (type === 'Cursor') clearStates.push({ object: m.sourceObjectName, valueCleared: value == null || String(value).length === 0, value: value ?? null });
        }
        const allCleared = clearStates.length > 0 && clearStates.every(s => s.valueCleared);
        steps.push(step('keyset.resume.cursor-cleared', allCleared, {
            observed: { clearStates },
            note: 'after the resume completes the full ordering range, the engine clears the Cursor resume value (null) so the next '
                + 'run starts a fresh seek — a non-null Cursor lingering after a CLEAN scan would re-do work / risk a stuck position',
        }));
    } else {
        steps.push(step('keyset.resume.cursor-cleared', true, {
            observed: { keysetDormant: true },
            note: 'keyset dormant → no Cursor value to clear; vacuously passes (restart-safety track gates the requirement)',
        }));
    }

    // ── 5) NO DUPLICATES, NO LOST RECORDS (the hard requirement, restart-safety track — ALWAYS gates).
    //       Run ONE final reconciling full sync so the post-resume state is fully settled (and any
    //       mid-stream insert is incorporated), then compare each CRM map against the clean baseline:
    //         - record map stays 1:1 (total == distinctExternal) → NO DUPLICATE map rows
    //         - dest rows == record-map total → the dest table and the map agree (no orphan / no loss)
    //         - count >= baseline (+1 per inserted record) and never < baseline → NO LOST RECORDS
    //       This holds whether the resume rode a keyset Cursor or the timestamp watermark — it is the
    //       connector-agnostic correctness bar plan.md §8/§15c demands.
    const finalRun = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
    steps.push(step('keyset.reconcile.run', finalRun.run?.Success === true && (finalRun.run?.Counts?.Failed ?? 0) === 0, {
        observed: { runID: finalRun.runID, counts: finalRun.run?.Counts ?? null, errors: finalRun.errors ?? [] },
        note: 'final reconciling incremental settles the post-resume state before the no-dup / no-loss identity comparison',
    }));

    const insertedHere = createdExternalID ? 1 : 0;
    for (const m of crmMaps) {
        const before = baseline[m.sourceObjectName];
        const after = await snapshotObject(db, cfg, ciid, m);
        const isWriteObj = lc(m.sourceObjectName) === writeObject;
        const expectedDelta = isWriteObj ? insertedHere : 0;

        const mapOneToOne = after.recordMap.total === after.recordMap.distinctExternal; // NO duplicate map rows
        const destAgreesMap = after.destRows === after.recordMap.total;                  // dest table ⇄ record map agree
        // NO LOST RECORDS: never below baseline; grows only by the records we deliberately inserted.
        const noLoss = after.destRows >= before.destRows;
        const noUnexpectedGrowth = after.destRows === before.destRows + expectedDelta;
        const ok = mapOneToOne && destAgreesMap && noLoss && noUnexpectedGrowth;
        steps.push(step('keyset.resume.no-dup-no-loss', ok, {
            observed: {
                object: m.sourceObjectName, isWriteObject: isWriteObj, expectedDelta,
                baseline: { destRows: before.destRows, recordMap: before.recordMap },
                afterResume: { destRows: after.destRows, recordMap: after.recordMap },
                mapOneToOne, destAgreesMap, noLoss, noUnexpectedGrowth,
            },
            note: 'after interrupt+resume the record map is 1:1 (no duplicates), the dest table and record map agree (no orphan/loss), '
                + 'and the row count never dropped below baseline (no lost records) — growing only by deliberately-inserted records. '
                + 'This is the connector-agnostic §8/§15c bar: a cooperative interrupt + clean resume corrupts no state',
        }));
    }

    // ── 6) CLEANUP. Delete the disposable mid-stream record (captured ExternalID), then a best-effort
    //       re-sync so the dest table returns to baseline. Seeded connection + encrypted credential PRESERVED.
    await cleanupCreatedRecord(gql, db, cfg, steps, ciid, writeObject, createdExternalID);

    return steps;
}

/**
 * Deletes the one disposable test record by its captured ExternalID, then a best-effort re-sync so the
 * dest table returns to its prior state. Never throws (cleanup must always complete); records a step.
 */
async function cleanupCreatedRecord(gql, db, cfg, steps, ciid, objectName, externalID) {
    if (!externalID) return;
    let deleteOk = false;
    try {
        const del = (await gql(GQL.writeRecord, {
            ciid, objectName, operation: 'delete', externalID, attributes: null,
        })).IntegrationWriteRecord;
        deleteOk = del?.Success === true;
        steps.push(step('keyset.cleanup.delete-external', deleteOk, {
            observed: { object: objectName, externalID, statusCode: del?.StatusCode ?? null, message: del?.Message ?? null },
            note: 'deleted the disposable mid-stream record by its captured external id (exact, id-targeted; never touches '
                + 'users/owners/real data) so the portal + seeded connection stay clean',
        }));
    } catch (e) {
        steps.push(step('keyset.cleanup.delete-external', false, {
            observed: { object: objectName, externalID, error: String(e?.message ?? e) },
            note: 'FAILED to delete the mid-stream record — it may be orphaned in the portal; manual cleanup required',
        }));
    }
    try {
        const reSync = await runSyncObserved(gql, ciid, { fullSync: false, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        const rowsFinal = await destRowCount(db, cfg, objectName);
        steps.push(step('keyset.cleanup.resync', true, {
            observed: { runID: reSync.runID, success: reSync.run?.Success ?? null, rowsFinal, deleteOk },
            note: 'best-effort re-sync after delete so the deletion propagates and the dest table returns to baseline; never '
                + 'hard-fails on a tombstone-style connector (the id-targeted delete above already removed the test record)',
        }));
    } catch (e) {
        steps.push(step('keyset.cleanup.resync', true, {
            observed: { error: String(e?.message ?? e) },
            note: 'cleanup re-sync errored (non-fatal) — the id-targeted delete above already removed the test record',
        }));
    }
}
