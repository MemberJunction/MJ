import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type {
    IntegrationProgressEvent,
    IntegrationProgressEventType,
    IntegrationProgressLevel,
    IntegrationRunKind,
    IntegrationRunManifest,
    IntegrationRunResult,
} from './types.js';

export interface EmitterOptions {
    /** Root directory containing per-run subdirs. Defaults to ./logs/integration-runs. */
    rootDir?: string;
    /** Optional human-facing console mirror (default false — file is the primary record). */
    consoleMirror?: boolean;
}

/**
 * Writes structured progress artifacts to `<rootDir>/<runID>/`:
 * - manifest.json (written once at start)
 * - progress.jsonl (append-only event stream; checkpoint events carry resumableState)
 * - result.json (written once at terminate)
 *
 * Sequence numbers monotonic per emitter instance. Disk I/O is async and serialized
 * via an internal promise chain — callers don't await; the emitter guarantees ordered
 * writes. A flush() method awaits the queue when needed (test teardown, run completion).
 */
export class IntegrationProgressEmitter {
    private readonly runDir: string;
    private readonly progressPath: string;
    private readonly manifestPath: string;
    private readonly resultPath: string;
    private readonly consoleMirror: boolean;
    private writeChain: Promise<void> = Promise.resolve();
    private seq = 0;
    private terminated = false;
    private aggregateCounts = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    private errors: NonNullable<IntegrationRunResult['errors']> = [];
    private latestCheckpointSeq?: number;
    private readonly startMs = Date.now();

    constructor(
        private readonly manifest: IntegrationRunManifest,
        opts: EmitterOptions = {}
    ) {
        const root = opts.rootDir ?? join(process.cwd(), 'logs', 'integration-runs');
        this.runDir = join(root, this.manifest.runID);
        this.progressPath = join(this.runDir, 'progress.jsonl');
        this.manifestPath = join(this.runDir, 'manifest.json');
        this.resultPath = join(this.runDir, 'result.json');
        this.consoleMirror = opts.consoleMirror ?? false;
        this.writeChain = this.bootstrap();
    }

    /** Emit a generic event. */
    public emit(
        eventType: IntegrationProgressEventType,
        partial: Partial<Omit<IntegrationProgressEvent, 'ts' | 'seq' | 'eventType'>> = {}
    ): void {
        if (this.terminated) return;
        const event: IntegrationProgressEvent = {
            ts: new Date().toISOString(),
            seq: ++this.seq,
            eventType,
            ...partial,
        };
        if (eventType === 'checkpoint') this.latestCheckpointSeq = event.seq;
        if (partial.counts) {
            this.aggregateCounts.processed += partial.counts.processed ?? 0;
            this.aggregateCounts.succeeded += partial.counts.succeeded ?? 0;
            this.aggregateCounts.failed += partial.counts.failed ?? 0;
            this.aggregateCounts.skipped += partial.counts.skipped ?? 0;
        }
        if (eventType === 'stage.error' || eventType === 'record.error' || eventType === 'run.fail') {
            const code = typeof event.data?.code === 'string' ? event.data.code : undefined;
            this.errors.push({
                stage: event.stage,
                message: event.message ?? `${eventType} (no message)`,
                code,
            });
        }
        const line = JSON.stringify(event) + '\n';
        if (this.consoleMirror) {
            this.mirrorToConsole(event);
        }
        this.writeChain = this.writeChain.then(() => fs.appendFile(this.progressPath, line, 'utf-8'));
    }

    /** Convenience helpers — sugared `emit()` for the common cases. */
    public runStart(message?: string): void {
        this.emit('run.start', { message, level: 'info' });
    }
    public stageStart(stage: string, message?: string): void {
        this.emit('stage.start', { stage, message, level: 'info' });
    }
    public stageComplete(stage: string, counts?: IntegrationProgressEvent['counts']): void {
        this.emit('stage.complete', { stage, counts, level: 'info' });
    }
    public stageError(stage: string, message: string, data?: Record<string, unknown>): void {
        this.emit('stage.error', { stage, message, level: 'error', data });
    }
    public heartbeat(stage: string, message: string, counts?: IntegrationProgressEvent['counts']): void {
        this.emit('progress.heartbeat', { stage, message, counts, level: 'info' });
    }
    /**
     * Write a resumable checkpoint. resumableState should carry enough subsystem-
     * specific data for the originating service to resume from this point.
     */
    public checkpoint(stage: string, resumableState: Record<string, unknown>): void {
        this.emit('checkpoint', { stage, resumableState, level: 'debug' });
    }

    public externalCallStart(url: string, method: string, data?: Record<string, unknown>): void {
        this.emit('external.call.start', { data: { url, method, ...(data ?? {}) }, level: 'debug' });
    }
    public externalCallComplete(url: string, method: string, status: number, durationMs: number): void {
        this.emit('external.call.complete', {
            data: { url, method, status, durationMs },
            level: status >= 400 ? 'warn' : 'debug',
        });
    }

    public objectAdded(objectName: string, source: 'Declared' | 'Discovered' | 'Custom'): void {
        this.emit('discovery.object.added', { data: { objectName, source }, level: 'info' });
    }
    public fieldAdded(objectName: string, fieldName: string, source: 'Declared' | 'Discovered' | 'Custom'): void {
        this.emit('discovery.field.added', { data: { objectName, fieldName, source }, level: 'debug' });
    }
    public pkClassifierInvoked(objectName: string): void {
        this.emit('pk.classifier.invoked', { data: { objectName }, level: 'info' });
    }
    public pkClassifierResult(objectName: string, verdict: Record<string, unknown>): void {
        this.emit('pk.classifier.result', { data: { objectName, ...verdict }, level: 'info' });
    }
    public entityGenerated(objectName: string, mjEntityName: string): void {
        this.emit('entity.generated', { data: { objectName, mjEntityName }, level: 'info' });
    }
    public entitySkippedNoPK(objectName: string): void {
        this.emit('entity.skipped-no-pk', { data: { objectName }, level: 'warn' });
    }

    /** Terminate the run as success. */
    public async complete(message?: string): Promise<void> {
        if (this.terminated) return;
        this.emit('run.complete', { message, level: 'info' });
        await this.writeTerminal({
            success: true,
            exitReason: 'completed',
        });
    }

    /** Terminate the run as failure. */
    public async fail(message: string, code?: string): Promise<void> {
        if (this.terminated) return;
        this.emit('run.fail', { message, level: 'error', data: code ? { code } : undefined });
        await this.writeTerminal({
            success: false,
            exitReason: code === 'budget-exhausted' ? 'budget-exhausted' : 'failed',
        });
    }

    /** Await all pending writes. */
    public async flush(): Promise<void> {
        await this.writeChain;
    }

    // ── Internals ──────────────────────────────────────────────────────

    private async bootstrap(): Promise<void> {
        await fs.mkdir(this.runDir, { recursive: true });
        await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
    }

    private async writeTerminal(partial: { success: boolean; exitReason: IntegrationRunResult['exitReason'] }): Promise<void> {
        this.terminated = true;
        await this.writeChain;
        const result: IntegrationRunResult = {
            runID: this.manifest.runID,
            completedAt: new Date().toISOString(),
            success: partial.success,
            exitReason: partial.exitReason,
            durationMs: Date.now() - this.startMs,
            aggregateCounts: this.aggregateCounts,
            errors: this.errors.length > 0 ? this.errors : undefined,
            resumableFromSeq: this.latestCheckpointSeq,
        };
        await fs.writeFile(this.resultPath, JSON.stringify(result, null, 2), 'utf-8');
    }

    private mirrorToConsole(event: IntegrationProgressEvent): void {
        const level: IntegrationProgressLevel = event.level ?? 'info';
        const tag = `[${event.eventType}]${event.stage ? ` [${event.stage}]` : ''}`;
        const msg = event.message ?? '';
        switch (level) {
            case 'error': console.error(tag, msg); break;
            case 'warn': console.warn(tag, msg); break;
            case 'debug': console.debug(tag, msg); break;
            default: console.log(tag, msg);
        }
    }

    public static newRunID(prefix?: string): string {
        const hi = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        const lo = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        return `${prefix ?? 'run'}-${Date.now()}-${hi}${lo}`;
    }
}
