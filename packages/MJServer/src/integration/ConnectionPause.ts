/**
 * ConnectionPause — what "pause this connection" has to mean, beyond a flag.
 *
 * `IntegrationDeactivateConnection` used to set `IsActive = false` and stop. The engine reads
 * that flag before a sync, so syncs did stop — but nothing else did:
 *
 *   - The SCHEDULED jobs kept firing. A sync schedule woke on cron, was refused, and wrote a
 *     failed run. Every cron tick, for as long as the connection stayed paused, so a paused
 *     connector's history filled with failures it did not cause.
 *   - The DISCOVERY schedule kept firing and was NOT refused, because nothing gated discovery
 *     on IsActive. A paused connection went on rescanning the vendor on a timer — spending the
 *     customer's rate budget, and rewriting the very catalog the pause was meant to freeze.
 *   - An IN-FLIGHT sync ran to completion. "Paused" arrived only after the thing the operator
 *     was watching had finished.
 *
 * So pause has to touch three things, and resume has to put back exactly what pause took —
 * which is the part that needs state rather than a rule.
 *
 * WHY THE PRIOR STATE IS RECORDED RATHER THAN INFERRED. "Resume = set every schedule Active" is
 * wrong: a connection can legitimately be paused while one of its two schedules was ALREADY off
 * because the operator turned it off weeks ago. Inferring would silently re-enable it, and the
 * first symptom is a sync nobody asked for. So pause records which jobs it actually moved, and
 * resume restores only those.
 *
 * WHY PAUSE IS IDEMPOTENT AT THE RECORD, NOT AT THE WRITE. Deactivating an already-deactivated
 * connection finds every job already Paused, so the set it "moved" is empty. Writing that empty
 * set over the real record is the bug that loses the state — resume would then restore nothing
 * and both schedules would stay off forever, with no error anywhere. {@link decidePauseWrite}
 * is the guard: the FIRST pause's record stands until a resume consumes it.
 *
 * Everything here is a pure function over plain values. The resolver owns the reads and writes.
 */

/** The two schedule kinds a connection can own. Mirrors ScheduledJob's DriverClass split. */
export type PausedScheduleKind = 'sync' | 'discovery';

/** One schedule that PAUSE moved from Active to Paused, and that RESUME should move back. */
export interface PausedScheduleRecord {
    /** ScheduledJob.ID */
    ID: string;
    /** Recorded for the operator-facing message only; restoration keys on ID. */
    Kind: PausedScheduleKind;
}

/** Minimal shape this module needs from a ScheduledJob row. */
export interface ScheduleJobState {
    ID: string;
    Status: string | null;
    Kind: PausedScheduleKind;
}

/** Key under CompanyIntegration.Configuration where the record lives. */
export const PAUSED_SCHEDULES_KEY = 'pausedSchedules';

/**
 * Which schedules a pause should move, and the record to remember them by.
 *
 * Only jobs that are currently `Active` are moved. A job already `Paused`, or in any other
 * status, is left exactly as found and is deliberately absent from the record — that absence
 * is what stops resume from turning it on.
 */
export function decideSchedulesToPause(jobs: ReadonlyArray<ScheduleJobState>): PausedScheduleRecord[] {
    return jobs
        .filter(j => j.Status === 'Active')
        .map(j => ({ ID: j.ID, Kind: j.Kind }));
}

/**
 * Whether this pause's record should be written, given whatever record is already stored.
 *
 * Returns the record to persist, or `null` to leave the stored one untouched. A second pause of
 * an already-paused connection moves nothing, and must not overwrite the first pause's record
 * with its own empty one — see the class comment.
 */
export function decidePauseWrite(
    stored: ReadonlyArray<PausedScheduleRecord>,
    newlyPaused: ReadonlyArray<PausedScheduleRecord>
): PausedScheduleRecord[] | null {
    if (stored.length > 0) return null;           // already paused; the first record is authoritative
    if (newlyPaused.length === 0) return null;    // nothing moved and nothing stored — write nothing
    return [...newlyPaused];
}

/**
 * Which schedules a resume should re-activate.
 *
 * A recorded job is restored only when it STILL EXISTS and is STILL `Paused`. Both guards matter:
 * a job deleted while the connection was paused must not be resurrected, and a job someone has
 * already moved back to Active must not be written again for no reason. Jobs absent from the
 * record are never touched, however they look now.
 */
export function decideSchedulesToResume(
    stored: ReadonlyArray<PausedScheduleRecord>,
    jobs: ReadonlyArray<ScheduleJobState>
): string[] {
    const live = new Map(jobs.map(j => [j.ID, j]));
    return stored
        .filter(r => live.get(r.ID)?.Status === 'Paused')
        .map(r => r.ID);
}

/** Reads the stored record out of a CompanyIntegration.Configuration JSON blob. */
export function readPausedSchedules(configuration: string | null | undefined): PausedScheduleRecord[] {
    if (!configuration) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(configuration);
    } catch {
        // A Configuration we cannot parse is not an error to raise here: pause/resume is not the
        // operation that owns that blob. Report "no record" and let the rest of the flow proceed.
        return [];
    }
    if (typeof parsed !== 'object' || parsed === null) return [];
    const raw = (parsed as Record<string, unknown>)[PAUSED_SCHEDULES_KEY];
    if (!Array.isArray(raw)) return [];
    const out: PausedScheduleRecord[] = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null) continue;
        const rec = item as Record<string, unknown>;
        const id = rec.ID;
        const kind = rec.Kind;
        if (typeof id !== 'string' || id.length === 0) continue;
        out.push({ ID: id, Kind: kind === 'discovery' ? 'discovery' : 'sync' });
    }
    return out;
}

/**
 * Returns the Configuration JSON with the record set (or cleared, when `record` is empty).
 *
 * Preserves every other key. An unparseable Configuration is REPLACED rather than merged — the
 * alternative is refusing to pause because of unrelated corruption, and losing one broken blob
 * is the better failure.
 */
export function writePausedSchedules(
    configuration: string | null | undefined,
    record: ReadonlyArray<PausedScheduleRecord>
): string {
    let base: Record<string, unknown> = {};
    if (configuration) {
        try {
            const parsed = JSON.parse(configuration);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                base = parsed as Record<string, unknown>;
            }
        } catch {
            base = {};
        }
    }
    if (record.length === 0) {
        delete base[PAUSED_SCHEDULES_KEY];
    } else {
        base[PAUSED_SCHEDULES_KEY] = record.map(r => ({ ID: r.ID, Kind: r.Kind }));
    }
    return JSON.stringify(base);
}

/**
 * How far a cancel request actually reaches — reported to the caller so the UI can say something
 * TRUE rather than something reassuring.
 *
 * `durable`      the request is recorded where the owning process will observe it, whichever
 *                process that is. "Stopping after the current batch" is honest.
 * `this-process` a sync is running HERE and was signalled in-process. Honest, but only because
 *                this happens to be the owner.
 * `unknown`      a run is live and we could neither record the request durably nor find it in
 *                this process. It will finish. What pause still guarantees is that no NEW sync
 *                starts — say that, and do not claim the running one is stopping.
 * `none`         nothing was running. There is nothing to say.
 */
export type CancelScope = 'durable' | 'this-process' | 'unknown' | 'none';

/**
 * Classifies the cancel from observable facts, not from which API was called.
 *
 * Deliberately derived rather than hardcoded per lineage: the durable path needs a run-row column
 * that only exists on newer tenants, so the SAME code has to tell the truth on a tenant where
 * that column is absent and the in-process registry is the only signal there is.
 */
export function describeCancelScope(facts: {
    liveRunPresent: boolean;
    durableRequestRecorded: boolean;
    runningInThisProcess: boolean;
}): CancelScope {
    if (!facts.liveRunPresent) return 'none';
    if (facts.durableRequestRecorded) return 'durable';
    if (facts.runningInThisProcess) return 'this-process';
    return 'unknown';
}

/** Operator-facing sentence for a cancel scope. Never claims a stop it cannot deliver. */
export function describeCancelOutcome(scope: CancelScope): string {
    switch (scope) {
        case 'durable':
        case 'this-process':
            return 'A sync was running — it will stop after the current batch.';
        case 'unknown':
            return 'A sync is running in another process and will finish; no new sync will start.';
        case 'none':
            return '';
    }
}

/** Operator-facing sentence for what pause did to the schedules. */
export function describePauseOutcome(paused: ReadonlyArray<PausedScheduleRecord>, alreadyPaused: boolean): string {
    if (alreadyPaused) return 'Schedules were already paused.';
    if (paused.length === 0) return 'No active schedules to pause.';
    const kinds = paused.map(p => p.Kind);
    const parts: string[] = [];
    if (kinds.includes('sync')) parts.push('data sync');
    if (kinds.includes('discovery')) parts.push('schema refresh');
    return `Paused the ${parts.join(' and ')} schedule${parts.length > 1 ? 's' : ''}.`;
}
