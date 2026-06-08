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
    | 'sync.resume.keyset'
    | 'sync.partition.reconcile'
    | 'sync.fetch.batch.start'
    | 'sync.fetch.batch.complete'
    | 'sync.fetch.retry'
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
    | 'sync.run.cancelled'
    | 'sync.schema_update'
    | 'sync.warning';

import type { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';

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
    private emitter?: IntegrationProgressEmitter;

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

    /**
     * Attach a durable progress-artifact emitter. Once attached, the grep-friendly
     * console events are ALSO forwarded (selectively, at stage/batch/error
     * granularity — never per-record, to keep the stream queryable) to the run's
     * append-only JSONL artifact so the sync is visible over GraphQL and survives an
     * MJAPI restart. Terminal run.complete/run.fail are owned by the caller (which
     * awaits the emitter's async terminal write), so they are NOT forwarded here.
     */
    public attachEmitter(emitter: IntegrationProgressEmitter): void {
        this.emitter = emitter;
    }

    /**
     * Persist a resumable CHECKPOINT (the sync position after a committed batch) into the durable
     * progress artifact (plan.md §8a). On crash/restart the latest checkpoint's resumableState
     * (watermark / keyset AfterKey / cursor / batchIndex) lets the run pick back up. Best-effort —
     * no emitter attached → no-op.
     */
    public checkpoint(stage: string, resumableState: Record<string, unknown>): void {
        this.emitter?.checkpoint(stage, resumableState);
    }

    /**
     * Emit a non-fatal STRUCTURED WARNING. Unlike record/fetch errors (which mark the run
     * failed), a warning records a notable-but-non-fatal condition — the canonical case being a
     * second-layer/association object that fetched zero records because its parents weren't
     * available (the silent-empty). Forwarded to the durable artifact as a SyncWarning so the
     * condition is visible over GraphQL instead of a swallowed console.warn, WITHOUT affecting
     * run success. Goes to console.warn so it's also greppable in the tee'd log.
     */
    public warning(stage: string, code: string, message: string, data?: Record<string, unknown>): void {
        this.emit('sync.warning', { stage, code, message, warningData: data });
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
        const line = JSON.stringify(entry);
        if (event === 'sync.run.fail' || event === 'sync.record.error') {
            console.error(line);
        } else if (event === 'sync.warning') {
            console.warn(line);
        } else {
            console.log(line);
        }
        this.forwardToEmitter(event, data);
    }

    /**
     * Best-effort mirror of a sync event into the durable artifact stream. Any
     * failure here is swallowed — structured logging must never break a sync.
     */
    private forwardToEmitter(event: SyncLogEvent, data: Record<string, unknown>): void {
        const emitter = this.emitter;
        if (!emitter) return;
        try {
            const stage = this.stageLabel(data);
            switch (event) {
                case 'sync.entity-map.start':
                    emitter.stageStart(stage, `Syncing ${stage}`);
                    break;
                case 'sync.fetch.batch.complete':
                    emitter.emit('records.batch.complete', {
                        stage,
                        counts: { processed: this.num(data.recordCount) },
                        data,
                    });
                    break;
                case 'sync.record.error':
                    emitter.emit('record.error', {
                        stage,
                        level: 'error',
                        message: typeof data.error === 'string' ? data.error : 'record error',
                        data,
                    });
                    break;
                case 'sync.record.conflict':
                    emitter.emit('record.error', { stage, level: 'warn', message: 'conflict', data });
                    break;
                case 'sync.warning':
                    emitter.warning(
                        typeof data.stage === 'string' ? data.stage : stage,
                        typeof data.code === 'string' ? data.code : 'WARNING',
                        typeof data.message === 'string' ? data.message : '',
                        this.asRecord(data.warningData),
                    );
                    break;
                case 'sync.entity-map.complete':
                    emitter.stageComplete(stage, {
                        processed: this.num(data.recordsProcessed),
                        succeeded: this.num(data.recordsCreated) + this.num(data.recordsUpdated),
                        failed: this.num(data.recordsErrored),
                        skipped: this.num(data.recordsSkipped),
                    });
                    break;
                case 'sync.push.response':
                    emitter.emit('external.call.complete', { stage, level: 'debug', data });
                    break;
                default:
                    // run.start / config.loaded / connector.* / fetch.start / record.decision|saved /
                    // push.candidates|record / terminal events are intentionally not mirrored — the
                    // caller owns run lifecycle, and per-record events would bloat the stream.
                    break;
            }
        } catch {
            /* structured-artifact mirroring is best-effort — never break a sync */
        }
    }

    private stageLabel(data: Record<string, unknown>): string {
        const s = data.externalObjectName ?? data.entityMap ?? data.entity ?? data.objectName;
        return typeof s === 'string' && s.length > 0 ? s : 'sync';
    }

    private num(v: unknown): number {
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }

    /** Narrows an unknown to a plain record (or undefined) without a lazy `any` cast. */
    private asRecord(v: unknown): Record<string, unknown> | undefined {
        return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
    }
}
