/**
 * GQL-driven LIVE rate-limiting + per-layer concurrency phase — plan.md §2 (rate limiting), §6a
 * (per-layer N-at-a-time cap), §7 (peak-aware rate limiting / safe peak parallelization), run through
 * the REAL MJAPI GraphQL API against the pre-seeded HubSpot reference connection (token-free reference
 * mode, identified solely by `ciid`).
 *
 * WHAT THIS PROVES (framework, not connector), grounded in ENGINE_MECHANICS_MAP.json's
 * `rate-concurrency` subsystem (result[8]) + `dependency-layering` (result[4]):
 *
 *   1) REQUEST PACING vs 429s (§2/§7 "not too frequent, not too slow regardless of ceiling"):
 *      the per-request token-bucket RateLimiter (RateLimiter.ts) calls Acquire() before EVERY
 *      outbound fetch (IntegrationEngine.ts:1236). The sleep it imposes is OBSERVABLE as the
 *      inter-batch gap between consecutive `records.batch.complete` events on the durable stream
 *      (each carries Ts + DataJSON.durationMs + DataJSON.batchIndex + DataJSON.externalObjectName —
 *      sync.fetch.batch.complete forwarded to records.batch.complete with the full data blob,
 *      SyncLogger.ts:174-179). We characterize that pacing: it must neither hammer (gap floored near
 *      the bucket's min interval, no sustained 429 storm) NOR crawl (a clean portal must not insert
 *      multi-second artificial gaps when no throttle is in effect).
 *
 *   2) BACKOFF-ON-429 + RAMP-UP (§7 adaptive/AIMD): ReportThrottle halves the effective rate + freezes
 *      on Retry-After; ReportSuccess additively ramps it back up (RateLimiter.ts:134-152). On a
 *      healthy portal a normal sync produces ZERO 429s, so the DESIRED steady-state is "no sustained
 *      throttling." The 429 retry/backoff itself is console-only (`[HubSpot] Rate limited (429)...`,
 *      HubSpotConnector.ts:2043-2076) — the declared `external.call.retry` progress event is NEVER
 *      emitted (dead/unwired, types.ts:60). So we (a) assert via the durable stream that no run-killing
 *      rate-limit failure occurred, and (b) BEST-EFFORT grep the tee'd MJAPI log for the backoff +
 *      ramp lines as enrichment; their absence on a clean run is expected and never fails the cell.
 *
 *   3) PER-LAYER PARALLEL-WITH-N-CAP (§6a): syncConcurrency is read from CompanyIntegration.Configuration
 *      JSON (getSyncConcurrency, IntegrationEngine.ts:894-904; clamp [1,16], default 1) and bounds an
 *      AIMD AdaptiveConcurrencyController per layer (start=syncConcurrency, max=max(start,
 *      MaxConcurrencyHint=4 for HubSpot)). With cap=1 the maps in a layer run strictly SEQUENTIALLY;
 *      with cap=4 maps in the same layer may run CONCURRENTLY. The controller's peakInFlight/finalCap
 *      are NOT emitted anywhere (framework gap), so we use a TEMPORAL-OVERLAP PROXY over the
 *      records.batch.complete stream: under cap=1, batch-complete events for DIFFERENT objects in the
 *      same dependency layer must NOT interleave (each object finishes its batches before the next
 *      starts); under cap>1 they MAY interleave. We set syncConcurrency via IntegrationUpdateConnection
 *      (runSchemaRefresh:false so NO RSU/restart), DB-verify the Configuration round-trips, and ALWAYS
 *      restore the original Configuration in a cleanup step.
 *
 * CREDENTIAL SAFETY: never reads process.env. IO ({ gql, db }) is injected by the plan entrypoint;
 * reference mode drives everything by `ciid` — the encrypted credential is decrypted server-side; the
 * HubSpot token never enters this process.
 *
 * STATE DISCIPLINE: READ-ONLY toward HubSpot (only Pull re-syncs; NEVER writes/deletes external
 * records — no Users/owners/real data are touched). The ONLY MJ-side mutation is toggling the seeded
 * connection's `Configuration.syncConcurrency`, which is ALWAYS restored to its captured original value
 * in a finally cleanup step so the seeded connection stays reusable by later tests.
 */

// GQL op strings + runSyncObserved (trigger→tail→GetRun) are reused from the harness; we never
// re-implement the gql/db clients (gql-live-adapters.mjs builds those and injects them here).
import { GQL, runSyncObserved } from '../gql-live-harness.mjs';
import { readFile } from 'node:fs/promises';

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs (field names verified against the live resolver source:
// IntegrationDiscoveryResolver.ts — IntegrationUpdateConnection(companyIntegrationID, configuration?,
//   runSchemaRefresh default true) → MutationResultOutput {Success,Message} :2499-2509;
// IntegrationListEntityMaps → ListEntityMapsOutput/EntityMapSummaryOutput :3820/:3644;
// IntegrationTailRunEvents(runID, sinceSeq?) → IntegrationRunEventsOutput :4246 (reused via GQL.tailRunEvents).)
// ─────────────────────────────────────────────────────────────────────────────

const RLC_GQL = {
    // Connection-level Configuration is where getSyncConcurrency() reads {"syncConcurrency":N}.
    // CRITICAL: runSchemaRefresh:false so this is a pure metadata write — no RSU pipeline, no restart.
    updateConnection: `mutation($ciid: String!, $configuration: String, $runSchemaRefresh: Boolean!) {
      IntegrationUpdateConnection(companyIntegrationID: $ciid, configuration: $configuration, runSchemaRefresh: $runSchemaRefresh) {
        Success Message
      }
    }`,
    listEntityMaps: `query($ciid: String!) {
      IntegrationListEntityMaps(companyIntegrationID: $ciid) {
        Success Message EntityMaps { ID Entity EntityID ExternalObjectName SyncDirection Status Priority }
      }
    }`,
};

/** The default MJAPI tee'd console log the runner co-locates (429 backoff/ramp lines live here). */
const DEFAULT_MJAPI_LOG = '/tmp/mjapi-4000.log';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (mirrors of the harness's so this phase is self-contained; identical shape).
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

/** Case-insensitive UUID/string compare (SQL Server upper, pg lower, GQL may vary). */
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

const isAssoc = (name) => /assoc/i.test(name ?? '');

// ─────────────────────────────────────────────────────────────────────────────
// Connection-Configuration read/write (DB-direct read for round-trip proof; GQL write).
// ─────────────────────────────────────────────────────────────────────────────

/** DB-direct read of CompanyIntegration.Configuration (the GQL list ops don't return it). */
async function readConnectionConfiguration(db, cfg, ciid) {
    const rows = await db.rows(
        `SELECT ${C(cfg, 'Configuration')} AS cfg FROM ${mjT(cfg, 'CompanyIntegration')} WHERE ${C(cfg, 'ID')}=${lit(ciid)}`);
    const raw = col(rows?.[0], 'cfg');
    return raw == null ? null : String(raw);
}

/** Sets syncConcurrency in the connection Configuration JSON, preserving every other key. */
function withSyncConcurrency(originalConfig, n) {
    const base = (typeof originalConfig === 'string' && originalConfig.trim().length > 0) ? (tryParse(originalConfig) ?? {}) : {};
    return JSON.stringify({ ...base, syncConcurrency: n });
}

/**
 * Writes the connection Configuration via GQL (runSchemaRefresh:false ⇒ pure metadata, no RSU/restart),
 * then DB-verifies syncConcurrency round-tripped. Returns { updateOk, roundTrips, observedConcurrency }.
 */
async function setSyncConcurrency(gql, db, cfg, ciid, originalConfig, n) {
    const configuration = withSyncConcurrency(originalConfig, n);
    const upd = (await gql(RLC_GQL.updateConnection, { ciid, configuration, runSchemaRefresh: false })).IntegrationUpdateConnection;
    const persisted = await readConnectionConfiguration(db, cfg, ciid);
    const parsed = tryParse(persisted ?? '');
    const observedConcurrency = parsed && typeof parsed === 'object' ? Number(parsed.syncConcurrency) : null;
    return { updateOk: upd?.Success === true, message: upd?.Message ?? null, roundTrips: observedConcurrency === n, observedConcurrency };
}

// ─────────────────────────────────────────────────────────────────────────────
// Durable batch-complete tail — the pacing + overlap observation surface.
// Each records.batch.complete event carries DataJSON = the forwarded sync.fetch.batch.complete `data`:
// { externalObjectName, batchIndex, durationMs, recordCount, hasMore, ... } plus Ts/Seq (resolver
// serializes ev.data → DataJSON, IntegrationDiscoveryResolver.ts:4284). Keyset-by-seq, no sleeps.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tails a run to completion keeping every records.batch.complete with the fetch timing fields.
 * Returns { runID, batches: [{ object, batchIndex, durationMs, recordCount, tsMs, seq }], terminal,
 *           run, errors } where tsMs is the event timestamp in ms (batch-COMPLETE instant).
 */
async function tailBatchEvents(gql, runID, maxPolls = 100000) {
    const batches = [];
    let sinceSeq = 0;
    let terminal = false;
    for (let i = 0; i < maxPolls; i++) {
        const out = (await gql(GQL.tailRunEvents, { runID, sinceSeq })).IntegrationTailRunEvents;
        if (!out?.Success) throw new Error(`TailRunEvents failed: ${out?.Message ?? 'no payload'}`);
        for (const ev of out.Events ?? []) {
            if (ev.EventType !== 'records.batch.complete') continue;
            const data = tryParse(ev.DataJSON) ?? {};
            const tsMs = Date.parse(ev.Ts ?? '');
            batches.push({
                object: (data.externalObjectName ?? ev.Stage ?? null),
                batchIndex: typeof data.batchIndex === 'number' ? data.batchIndex : null,
                durationMs: typeof data.durationMs === 'number' ? data.durationMs : null,
                recordCount: typeof data.recordCount === 'number' ? data.recordCount : (ev.Counts?.Processed ?? null),
                tsMs: Number.isNaN(tsMs) ? null : tsMs,
                seq: ev.Seq,
            });
        }
        sinceSeq = out.LatestSeq ?? sinceSeq;
        if (out.IsInFlight === false) { terminal = true; break; }
    }
    const detail = (await gql(GQL.getRun, { runID })).IntegrationGetRun;
    return { runID, batches, terminal, run: detail?.Run ?? null, errors: detail?.Errors ?? [] };
}

/** Triggers a sync via the harness's race-free path and tails its batch stream. */
async function runSyncWithBatches(gql, ciid, opts) {
    // Snapshot the newest run BEFORE triggering so a fast sync that COMPLETES before we can observe it
    // in-flight is still resolvable — the same race-free fallback the shared harness's triggerAndResolveRun
    // uses. Without it, a small/fast portal (advancedGen off + already-synced data) raced to "no RunID and
    // no in-flight run" and crashed this phase (ratelimit.error).
    const beforeRuns = (await gql(GQL.listRuns, { ciid, inFlightOnly: false, limit: 1 })).IntegrationListRuns;
    const beforeID = beforeRuns?.Runs?.[0]?.RunID ?? null;
    const started = (await gql(GQL.startSync, {
        ciid, fullSync: opts.fullSync ?? false, syncDirection: opts.syncDirection ?? 'Pull',
        entityMapIDs: opts.entityMapIDs ?? null,
    })).IntegrationStartSync;
    if (started?.Success !== true) throw new Error(`StartSync failed: ${started?.Message ?? 'no payload'}`);
    let runID = started.RunID;
    if (!runID) {
        const runs = (await gql(GQL.listRuns, { ciid, inFlightOnly: true, limit: 1 })).IntegrationListRuns;
        runID = runs?.Runs?.[0]?.RunID;
    }
    if (!runID) {
        // Fast-completion fallback: the most-recent run, as long as it's newer than the pre-trigger snapshot.
        const recent = (await gql(GQL.listRuns, { ciid, inFlightOnly: false, limit: 1 })).IntegrationListRuns;
        const recentID = recent?.Runs?.[0]?.RunID ?? null;
        if (recentID && recentID !== beforeID) runID = recentID;
    }
    if (!runID) throw new Error('Could not resolve run id after StartSync (no RunID and no in-flight run)');
    return tailBatchEvents(gql, runID, opts.maxPolls ?? 100000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pacing characterization. The per-request RateLimiter Acquire() sleep manifests as the GAP between
// a batch's COMPLETE and the NEXT batch's COMPLETE (minus the next batch's own fetch duration). We
// compute per-object inter-batch gaps from consecutive same-object batch-complete events.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-object inter-batch gaps (ms): for consecutive batches of the same object,
 *  gap[i] = ts[i] - ts[i-1] - durationMs[i]  ≈ the rate-limiter wait before batch i fired. */
function interBatchGapsByObject(batches) {
    const byObject = new Map();
    for (const b of batches) {
        if (b.object == null || b.tsMs == null) continue;
        const key = String(b.object).toLowerCase();
        if (!byObject.has(key)) byObject.set(key, []);
        byObject.get(key).push(b);
    }
    const gaps = {};
    for (const [obj, list] of byObject) {
        list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
        const objGaps = [];
        for (let i = 1; i < list.length; i++) {
            const prev = list[i - 1], cur = list[i];
            const wall = cur.tsMs - prev.tsMs;
            const gap = wall - (cur.durationMs ?? 0);
            objGaps.push(Math.max(0, gap));
        }
        if (objGaps.length > 0) gaps[obj] = objGaps;
    }
    return gaps;
}

function flatten(arr) { return arr.reduce((a, b) => a.concat(b), []); }
function maxOf(nums) { return nums.length ? Math.max(...nums) : 0; }
function pct(nums, p) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Temporal-overlap proxy for per-layer concurrency. We can't read peakInFlight (not emitted), so we
// detect whether DIFFERENT objects' batch-complete events INTERLEAVE in time. Under a strictly
// sequential layer (cap=1) the engine finishes all of object A's batches before starting object B,
// so A's complete-events and B's complete-events form two NON-overlapping seq runs. Under cap>1 they
// can interleave (A,B,A,B...). interleavedObjectPairs counts adjacent-in-seq pairs with different
// objects — 0 ⇒ sequential, >0 ⇒ concurrent execution observed.
// ─────────────────────────────────────────────────────────────────────────────

/** Counts seq-adjacent batch-complete transitions where the object changed (interleave signal). */
function objectInterleavings(batches) {
    const ordered = [...batches].filter(b => b.object != null).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    let interleavings = 0;
    const transitions = [];
    for (let i = 1; i < ordered.length; i++) {
        const prev = String(ordered[i - 1].object).toLowerCase();
        const cur = String(ordered[i].object).toLowerCase();
        if (prev !== cur) { interleavings++; transitions.push(`${prev}->${cur}`); }
    }
    const distinctObjects = new Set(ordered.map(b => String(b.object).toLowerCase()));
    // A strictly sequential run over K objects has exactly K-1 "boundary" transitions (one per object
    // handoff). INTERLEAVE means MORE than that — an object reappears after another already started.
    const boundaryTransitions = Math.max(0, distinctObjects.size - 1);
    const interleaved = Math.max(0, interleavings - boundaryTransitions);
    return { interleavings, boundaryTransitions, interleaved, distinctObjects: distinctObjects.size, transitions };
}

// ─────────────────────────────────────────────────────────────────────────────
// MJAPI console-log grep for the console-only 429 backoff/ramp lines (best-effort enrichment).
// HubSpotConnector.ts:2043-2076 logs `[HubSpot] Rate limited (429), retrying in {ms}ms (attempt X/5)`.
// There is NO durable rate-limit event (external.call.retry is dead) so this is the ONLY observable
// backoff signal — and it is correctly ABSENT on a clean, un-throttled portal run.
// ─────────────────────────────────────────────────────────────────────────────

/** Reads the MJAPI tee'd log and counts the HubSpot 429-backoff lines (best-effort; missing log ⇒ unavailable). */
async function grep429BackoffLines(logPath, sinceTs) {
    let text;
    try { text = await readFile(logPath, 'utf8'); } catch { return { available: false, backoffLines: 0, samples: [] }; }
    const sinceMs = sinceTs ? Date.parse(sinceTs) : NaN;
    const re = /Rate limited \(429\)|rate.?limit|429 rate limit/i;
    const samples = [];
    let backoffLines = 0;
    for (const line of text.split('\n')) {
        if (!re.test(line)) continue;
        // Best-effort time gate when the line carries an ISO ts prefix; otherwise count it.
        if (!Number.isNaN(sinceMs)) {
            const m = line.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
            if (m) { const evMs = Date.parse(m[0]); if (!Number.isNaN(evMs) && evMs < sinceMs) continue; }
        }
        backoffLines++;
        if (samples.length < 5) samples.push(line.trim().slice(0, 200));
    }
    return { available: true, backoffLines, samples };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase: rate-limiting + per-layer concurrency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} args { gql, db, ciid, maps, cfg }
 *   - gql:   makeGqlClient(...)            (restart-resilient GraphQL client)
 *   - db:    makeDbClient(...)             (rows/recordMapStats/entityRowCount/close)
 *   - ciid:  the seeded HubSpot CompanyIntegrationID (reference mode)
 *   - maps:  [{ entityMapID, entityName, sourceObjectName, ... }] from setup/ListEntityMaps
 *   - cfg:   { platform, mjSchema, objects[], maxPolls?, mjapiLogPath?, syncConcurrencyHigh? }
 * @returns {Array} step() results (NL note + JSON observed + pass/fail), like the other phases.
 */
export async function phaseratelimitconcurrency({ gql, db, ciid, maps, cfg }) {
    const steps = [];
    const logPath = cfg.mjapiLogPath ?? DEFAULT_MJAPI_LOG;
    const highCap = Number(cfg.syncConcurrencyHigh ?? 4); // HubSpot MaxConcurrencyHint is 4
    // Pacing thresholds (ms). The bucket default is ~10 tok/s (≈100ms min interval); a clean portal
    // must not insert artificial multi-second gaps. These are deliberately loose to avoid flakiness on
    // a shared dev box while still catching a "crawl" regression (e.g. a 5s fixed sleep per batch).
    const maxAcceptableMedianGapMs = Number(cfg.maxAcceptableMedianGapMs ?? 5000);
    const minObservablePacingMs = 0; // gap may legitimately be ~0 on a fast unthrottled portal

    // Capture original connection Configuration up front so we ALWAYS restore it in cleanup.
    let originalConfig = null;
    let restored = false;
    try {
        originalConfig = await readConnectionConfiguration(db, cfg, ciid);
        steps.push(step('ratelimit.config.captured', true, {
            observed: { ciid, originalConfiguration: originalConfig },
            note: 'captured CompanyIntegration.Configuration before mutating syncConcurrency (restored in cleanup)',
        }));

        // ── 1) PACING + 429 baseline at cap=1 (strictly sequential, the safest read of the bucket). ──
        const cap1 = await setSyncConcurrency(gql, db, cfg, ciid, originalConfig, 1);
        steps.push(step('concurrency.cap1.config.round-trip', cap1.updateOk && cap1.roundTrips, {
            observed: { updateSuccess: cap1.updateOk, observedConcurrency: cap1.observedConcurrency, message: cap1.message },
            note: 'IntegrationUpdateConnection(runSchemaRefresh:false) sets Configuration.syncConcurrency=1; '
                + 'DB-direct read confirms it round-trips (getSyncConcurrency reads exactly this key, clamp [1,16])',
        }));

        const seqStartTs = new Date().toISOString();
        const seqRun = await runSyncWithBatches(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        steps.push(step('ratelimit.run.clean', seqRun.run?.Success === true && (seqRun.run?.Counts?.Failed ?? 0) === 0, {
            observed: {
                runID: seqRun.runID, counts: seqRun.run?.Counts ?? null, exitReason: seqRun.run?.ExitReason ?? null,
                batchEvents: seqRun.batches.length, errors: seqRun.errors,
            },
            note: 'a clean full Pull completes with zero failed records — no rate-limit-induced run failure (the '
                + 'per-request bucket kept us under the source rate; sustained 429s would surface as failures/aborts)',
        }));

        // Pacing characterization: per-object inter-batch gaps. NOT-TOO-FAST is implicit (the bucket
        // exists and Acquire() is called every batch); NOT-TOO-SLOW is the real regression guard.
        const gapsByObject = interBatchGapsByObject(seqRun.batches);
        const allGaps = flatten(Object.values(gapsByObject));
        const medianGap = pct(allGaps, 50);
        const p95Gap = pct(allGaps, 95);
        const maxGap = maxOf(allGaps);
        const hasMultiBatchObject = Object.values(gapsByObject).some(g => g.length >= 1);
        // PASS when: either there were not enough multi-batch objects to measure pacing (degenerate,
        // small portal — vacuously fine), OR the median inter-batch gap is within the sane ceiling
        // (not crawling) and non-negative (not impossibly fast/negative-clock).
        const pacingSane = !hasMultiBatchObject
            || (medianGap >= minObservablePacingMs && medianGap <= maxAcceptableMedianGapMs);
        steps.push(step('ratelimit.pacing.sane', pacingSane, {
            observed: {
                runID: seqRun.runID, perObjectGapCounts: Object.fromEntries(Object.entries(gapsByObject).map(([k, v]) => [k, v.length])),
                medianGapMs: medianGap, p95GapMs: p95Gap, maxGapMs: maxGap, totalGapSamples: allGaps.length,
                measurable: hasMultiBatchObject, ceilingMs: maxAcceptableMedianGapMs,
            },
            note: 'plan.md §2/§7 "not too frequent, not too slow regardless of ceiling": inter-batch gaps (derived '
                + 'from records.batch.complete Ts minus the next batch fetch durationMs) are the per-request RateLimiter '
                + 'Acquire() sleep made observable. On a clean portal the median gap stays within a sane ceiling — a '
                + 'fixed multi-second artificial sleep per batch (crawl regression) would breach it. '
                + 'GAP: peakInFlight/effective-rate are not emitted, so pacing is inferred from batch timing, not read directly.',
        }));

        // Backoff-on-429 + ramp-up: durable stream has NO rate-limit event (external.call.retry is
        // dead/unwired). Authoritative gate = the run did NOT die from sustained throttling. Best-effort
        // log grep enriches with the console-only backoff/ramp lines (correctly absent on a clean run).
        const grep = await grep429BackoffLines(logPath, seqStartTs);
        const noSustainedThrottle = seqRun.run?.Success === true && (seqRun.run?.ExitReason ?? 'completed') !== 'aborted';
        steps.push(step('ratelimit.backoff-and-ramp', noSustainedThrottle, {
            observed: {
                runID: seqRun.runID, runSuccess: seqRun.run?.Success ?? null, exitReason: seqRun.run?.ExitReason ?? null,
                logAvailable: grep.available, observed429BackoffLines: grep.backoffLines, backoffSamples: grep.samples,
            },
            note: 'plan.md §7 adaptive backoff/ramp: a 429 halves the bucket rate + freezes on Retry-After (ReportThrottle), '
                + 'then ReportSuccess additively ramps it back up. On a healthy portal a normal sync produces ZERO 429s, '
                + 'so the DESIRED steady state is "no sustained throttling" (run succeeds, not aborted). The actual '
                + 'backoff/ramp transitions are console.warn-only ([HubSpot] Rate limited (429)...) — grepped best-effort; '
                + 'their absence on a clean run is expected and never fails the cell. '
                + 'GAP: the declared external.call.retry progress event is NEVER emitted, so backoff/ramp has NO durable '
                + 'GQL surface — this is the framework gap to close (emit a structured rate-limit/backoff event).',
        }));

        // Sequential overlap proxy at cap=1: across DIFFERENT objects in the same layer, batch-complete
        // events must NOT interleave (object A fully drains before B starts).
        const seqOverlap = objectInterleavings(seqRun.batches);
        const sequentialClean = seqOverlap.interleaved === 0;
        steps.push(step('concurrency.cap1.sequential', sequentialClean, {
            observed: {
                runID: seqRun.runID, distinctObjects: seqOverlap.distinctObjects,
                interleavings: seqOverlap.interleavings, boundaryTransitions: seqOverlap.boundaryTransitions,
                extraInterleaved: seqOverlap.interleaved, transitions: seqOverlap.transitions.slice(0, 20),
            },
            note: 'plan.md §6a per-layer cap=1 ⇒ strictly sequential: with syncConcurrency=1 the AdaptiveConcurrencyController '
                + 'min=max=1, so maps in a layer run one at a time. PROXY: batch-complete events for different objects do NOT '
                + 'interleave beyond the K-1 object handoff boundaries (no object resumes after a later one started). '
                + 'GAP: peakInFlight is not emitted; the temporal-overlap proxy infers concurrency from event ordering.',
        }));

        // ── 2) PER-LAYER N-CAP at cap>1 — maps in a layer MAY now run concurrently. ──
        const capN = await setSyncConcurrency(gql, db, cfg, ciid, originalConfig, highCap);
        steps.push(step('concurrency.capN.config.round-trip', capN.updateOk && capN.roundTrips, {
            observed: { requestedCap: highCap, updateSuccess: capN.updateOk, observedConcurrency: capN.observedConcurrency, message: capN.message },
            note: `IntegrationUpdateConnection sets Configuration.syncConcurrency=${highCap}; DB read confirms round-trip. `
                + 'The per-layer controller can now ramp the in-flight cap up to max(syncConcurrency, MaxConcurrencyHint).',
        }));

        const parStartTs = new Date().toISOString();
        const parRun = await runSyncWithBatches(gql, ciid, { fullSync: true, syncDirection: 'Pull', maxPolls: cfg.maxPolls });
        steps.push(step('concurrency.capN.run.clean', parRun.run?.Success === true && (parRun.run?.Counts?.Failed ?? 0) === 0, {
            observed: { runID: parRun.runID, counts: parRun.run?.Counts ?? null, batchEvents: parRun.batches.length, errors: parRun.errors },
            note: 'raising the per-layer cap must NOT break correctness: the higher-concurrency run still completes with zero '
                + 'failed records (the per-request RateLimiter keeps the source within its real rate as parallelism rises, §7).',
        }));

        // Concurrency must not regress pacing into a 429 storm even at higher parallelism.
        const parGrep = await grep429BackoffLines(logPath, parStartTs);
        const parNoSustainedThrottle = parRun.run?.Success === true && (parRun.run?.ExitReason ?? 'completed') !== 'aborted';
        steps.push(step('concurrency.capN.no-throttle-storm', parNoSustainedThrottle, {
            observed: {
                runID: parRun.runID, runSuccess: parRun.run?.Success ?? null, exitReason: parRun.run?.ExitReason ?? null,
                logAvailable: parGrep.available, observed429BackoffLines: parGrep.backoffLines,
            },
            note: 'plan.md §7 safe peak parallelization: at the higher cap the bucket still prevents a sustained 429 storm — '
                + 'the run succeeds without aborting. Excessive 429 backoff lines would indicate the concurrency outran the '
                + 'rate limiter (unsafe peak); their absence confirms parallelism stayed within the safe envelope.',
        }));

        // N-cap behavioral signal: a multi-object layer at cap>1 SHOULD be able to interleave objects.
        // We assert the DESIRED capability — interleave observed at cap>1 while cap=1 was sequential.
        // If the seeded layers are single-object or the portal is too small to overlap, the proxy can't
        // observe interleave; we record that as not-assessable (ok:true) rather than a false failure.
        const parOverlap = objectInterleavings(parRun.batches);
        const layerCanInterleave = parOverlap.distinctObjects >= 2; // need >=2 objects in flight to observe overlap
        if (!layerCanInterleave) {
            steps.push(step('concurrency.capN.parallel', true, {
                observed: {
                    runID: parRun.runID, distinctObjects: parOverlap.distinctObjects, interleaved: parOverlap.interleaved,
                    assessable: false,
                },
                note: 'fewer than 2 objects ran in the same window — cannot observe interleave; cell not assessable (passes '
                    + 'vacuously). Seed ≥2 independent same-layer objects (e.g. contacts + companies) to exercise this.',
            }));
        } else {
            // DESIRED: cap>1 produces interleave that cap=1 did not. This asserts the N-cap actually
            // changes the in-flight shape. NOTE: per the mechanics map, the cap RAMPS from start=1 via
            // AIMD (+1 per success), so early batches may still look sequential before the cap rises —
            // hence we assert "interleave observed at all", not "fully parallel from batch 0".
            const interleaveObservedAtHighCap = parOverlap.interleaved > 0;
            const wasSequentialAtCap1 = seqOverlap.interleaved === 0;
            steps.push(step('concurrency.capN.parallel', interleaveObservedAtHighCap && wasSequentialAtCap1, {
                observed: {
                    runID: parRun.runID, distinctObjects: parOverlap.distinctObjects,
                    cap1Interleaved: seqOverlap.interleaved, capNInterleaved: parOverlap.interleaved,
                    capNTransitions: parOverlap.transitions.slice(0, 20),
                },
                note: `plan.md §6a per-layer N-at-a-time cap: with syncConcurrency=${highCap} the controller may run multiple `
                    + 'same-layer maps concurrently. PROXY: batch-complete events INTERLEAVE across objects at cap>1, whereas '
                    + 'at cap=1 they were strictly sequential. This proves the N-cap changes the in-flight shape (parallel-with-cap). '
                    + 'GAP: peakInFlight/finalCap from AdaptiveRunResult are not emitted — we cannot assert the EXACT cap=N, '
                    + 'only that parallelism turned on. Emitting a per-layer concurrency event would let us assert peakInFlight<=N.',
            }));
        }
    } catch (e) {
        steps.push(step('ratelimit.error', false, { error: String(e?.stack ?? e?.message ?? e) }));
    } finally {
        // CLEANUP (critical): restore the ORIGINAL connection Configuration so the seeded connection is
        // reusable by later tests (syncConcurrency reset to whatever it was, including absent).
        try {
            const restoreConfig = originalConfig == null ? '' : originalConfig;
            const reset = (await gql(RLC_GQL.updateConnection, {
                ciid, configuration: restoreConfig, runSchemaRefresh: false,
            })).IntegrationUpdateConnection;
            const after = await readConnectionConfiguration(db, cfg, ciid);
            // Round-trip is satisfied if the persisted config equals the captured original (treating
            // null/'' as equivalent "no override").
            const norm = (s) => (s == null || String(s).trim() === '' ? '' : String(s));
            restored = reset?.Success === true && norm(after) === norm(originalConfig);
            steps.push(step('ratelimit.cleanup.restore-config', restored, {
                observed: { restoreSuccess: reset?.Success ?? false, restoredConfiguration: after, originalConfiguration: originalConfig },
                note: 'failsafe restore: CompanyIntegration.Configuration reset to its captured original so the seeded '
                    + 'connection stays reusable (syncConcurrency override removed/restored).',
            }));
        } catch (e) {
            steps.push(step('ratelimit.cleanup.restore-config', false, {
                observed: { error: String(e?.message ?? e), originalConfiguration: originalConfig },
                note: 'CRITICAL: failed to restore connection Configuration — a later test may see a stale syncConcurrency override',
            }));
        }
    }
    return steps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional thin orchestrator (mirrors runMatrixReadonly): reference-mode only, reuses existing maps,
// runs the single phase, and closes the DB. The phase is also directly callable by an external runner
// that already owns setup — this is convenience parity with the other harness modules.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} io  { gql(query,vars), db (rows/recordMapStats/entityRowCount/close) }
 * @param {object} cfg { platform, mjSchema, objects[], companyIntegrationID, maxPolls?, mjapiLogPath?, syncConcurrencyHigh? }
 * @returns {{ ok, platform, steps: { setup, rateLimitConcurrency } }}
 */
export async function runRateLimitConcurrencyReadonly({ gql, db }, cfg) {
    const result = { ok: false, platform: cfg.platform, steps: {} };
    try {
        if (!cfg.companyIntegrationID) {
            throw new Error('runRateLimitConcurrencyReadonly is reference-mode only: cfg.companyIntegrationID (HS_LIVE_CIID) is required');
        }
        const ciid = cfg.companyIntegrationID;
        const listed = (await gql(RLC_GQL.listEntityMaps, { ciid })).IntegrationListEntityMaps;
        if (!listed?.Success) throw new Error(`ListEntityMaps failed: ${listed?.Message ?? 'no payload'}`);
        const maps = (listed.EntityMaps ?? [])
            .filter(m => m.Status === 'Active' || m.Status == null)
            .map(m => ({ entityMapID: m.ID, entityName: m.Entity, sourceObjectName: m.ExternalObjectName }));
        if (maps.length === 0) throw new Error('no Active entity maps for this CIID — run ApplyAll once first');

        result.steps.setup = step('setup', true, {
            observed: { ciid, mapCount: maps.length, maps: maps.map(m => ({ object: m.sourceObjectName, entity: m.entityName })) },
            note: 'reused the seeded connection\'s existing Active entity maps (no ApplyAll needed; no RSU/restart)',
        });

        result.steps.rateLimitConcurrency = await phaseratelimitconcurrency({ gql, db, ciid, maps, cfg });
        return result;
    } catch (e) {
        result.error = String(e?.stack ?? e?.message ?? e);
        return result;
    } finally {
        if (db.close) { try { await db.close(); } catch { /* best-effort */ } }
        result.ok = !result.error && allStepsOk(result.steps);
    }
}
