/**
 * Structured logger for sync runs.
 *
 * Every meaningful step in `IntegrationEngine.RunSync()` emits ONE structured
 * JSON line through this helper so operators tailing the MJAPI log file can
 * grep + jq the event stream without parsing free-form prose.
 *
 * Vocabulary (the `event` field):
 *
 *   sync.run.start                — run dispatched; carries CompanyIntegration shape, config snapshot
 *   sync.config.loaded            — entity-map + field-map counts and names available for the run
 *   sync.connector.built          — connector instance constructed (class + import path)
 *   sync.connector.test           — TestConnection result (success + duration)
 *   sync.entity-map.start         — per-IO sync starting (direction, watermark, externalObjectName)
 *   sync.fetch.batch.start        — outbound API fetch about to fire (page/offset/cursor + URL hints)
 *   sync.fetch.batch.complete     — fetch returned (record count, duration, hasMore)
 *   sync.record.decision          — per-record action (Create/Update/Skip/Delete) + reason + matchKey
 *   sync.record.saved             — record persisted to MJ (action, mjEntity, mjID, durationMs)
 *   sync.record.error             — record failed (classified code, MJ-side or external-side, action)
 *   sync.push.candidates          — outbound push: count of changed records selected since last push
 *   sync.push.record              — outbound push: about to send to external (externalID, body keys)
 *   sync.push.response            — outbound push: response (status, externalIDReturned, durationMs)
 *   sync.entity-map.complete      — per-IO stats rollup + new watermark
 *   sync.run.complete             — run terminal: rollup + duration + status
 *   sync.run.fail                 — run terminal: error
 *   sync.run.cancelled            — run terminal: abort signal fired
 *
 * Each line is `{ ts, event, ...data }` — `ts` is ISO 8601.  All fields are
 * consistently namespaced so a grep / jq pipeline can extract what it needs.
 *
 * To filter the log file:
 *   tail -f /tmp/mjapi.log | grep '"event":"sync\.'                # all sync events
 *   tail -f /tmp/mjapi.log | grep '"event":"sync\.record\.'         # per-record only
 *   tail -f /tmp/mjapi.log | grep '"event":"sync\.fetch\.'          # only external fetches
 *   tail -f /tmp/mjapi.log | grep '"event":"sync\.push\.'           # only outbound writes
 *   tail -f /tmp/mjapi.log | grep '"event":"sync\..*\.error"'       # only errors
 */

export type SyncLogEvent =
    | 'sync.run.start'
    | 'sync.config.loaded'
    | 'sync.connector.built'
    | 'sync.connector.test'
    | 'sync.entity-map.start'
    | 'sync.fetch.batch.start'
    | 'sync.fetch.batch.complete'
    | 'sync.record.decision'
    | 'sync.record.saved'
    | 'sync.record.error'
    | 'sync.record.archived'
    | 'sync.record.conflict'
    | 'sync.push.candidates'
    | 'sync.push.record'
    | 'sync.push.response'
    | 'sync.entity-map.complete'
    | 'sync.run.complete'
    | 'sync.run.fail'
    | 'sync.run.cancelled';

export interface SyncLoggerContext {
    /** CompanyIntegration ID — the per-run anchor for filtering. */
    ciId: string;
    /** Integration name (HubSpot / YourMembership / …). */
    integration: string | null | undefined;
    /** Sync run ID for cross-correlation with run details rows. */
    runId?: string | null;
}

export interface SyncLogEntry {
    ts: string;
    event: SyncLogEvent;
    ciId: string;
    integration?: string | null;
    runId?: string | null;
    /** Free-form, event-specific structured data. */
    [key: string]: unknown;
}

/**
 * Light wrapper that prepends an ISO timestamp + the per-run context to every
 * line.  Writes to console.log (or console.error for fail events) so the line
 * lands in whatever stream the wrapper script is teeing to disk.
 */
export class SyncLogger {
    private readonly ctx: SyncLoggerContext;

    constructor(ctx: SyncLoggerContext) {
        this.ctx = ctx;
    }

    /** Update the runId once the run record has been created. */
    public attachRunId(runId: string): void {
        this.ctx.runId = runId;
    }

    /** Set the integration name once it's resolved from LoadRunConfiguration. */
    public attachIntegrationName(name: string | null | undefined): void {
        this.ctx.integration = name;
    }

    public emit(event: SyncLogEvent, data: Record<string, unknown> = {}): void {
        const entry: SyncLogEntry = {
            ts: new Date().toISOString(),
            event,
            ciId: this.ctx.ciId,
            integration: this.ctx.integration ?? null,
            runId: this.ctx.runId ?? null,
            ...data,
        };
        const isError = event === 'sync.run.fail' || event === 'sync.record.error';
        const line = JSON.stringify(entry);
        if (isError) {
            console.error(line);
        } else {
            console.log(line);
        }
    }
}
