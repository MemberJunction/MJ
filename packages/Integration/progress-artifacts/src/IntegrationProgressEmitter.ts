import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CountsContributeToAggregate } from './types.js';
import type {
    IntegrationProgressEvent,
    IntegrationProgressEventType,
    IntegrationProgressLevel,
    IntegrationRunKind,
    IntegrationRunManifest,
    IntegrationRunResult,
    SyncWarning,
} from './types.js';

export interface EmitterOptions {
    /** Root directory containing per-run subdirs. Defaults to ./logs/integration-runs. */
    rootDir?: string;
    /** Optional human-facing console mirror (default false — file is the primary record). */
    consoleMirror?: boolean;
    /**
     * Max number of per-run subdirs to retain under rootDir. On each new run, older run dirs beyond
     * this count (by mtime) are pruned so the logs directory never grows unbounded across runs.
     * Defaults to MJ_INTEGRATION_MAX_RUN_DIRS env or 200. Set 0 to disable pruning.
     */
    maxRunDirs?: number;
}

/** Default retained run-dir count; env-overridable. Prevents unbounded logs/ growth over many runs. */
const DEFAULT_MAX_RUN_DIRS = (() => {
    const n = Number(process.env.MJ_INTEGRATION_MAX_RUN_DIRS);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
})();

/**
 * Side-channel hook invoked for EVERY emitted event. The server layer registers this once at
 * startup to fan events onto a live GraphQL subscription topic (plan.md §11) WITHOUT this package
 * depending on the server (inversion of control). The durable JSONL artifact + the pollable
 * tail query remain the source of truth; this is the additive push path. Best-effort — a throwing
 * hook never breaks the sync or the durable write.
 */
export type IntegrationProgressPublishHook = (manifest: IntegrationRunManifest, event: IntegrationProgressEvent) => void;

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
    private warnings: SyncWarning[] = [];
    private latestCheckpointSeq?: number;
    private readonly startMs = Date.now();
    private static _publishHook?: IntegrationProgressPublishHook;

    /**
     * Register (or clear, with no arg) the global publish hook. The server registers this at startup
     * so every emitted event also fans out to the live GraphQL subscription, in addition to the
     * durable JSONL artifact + the pollable tail query.
     */
    public static SetPublishHook(hook?: IntegrationProgressPublishHook): void {
        IntegrationProgressEmitter._publishHook = hook;
    }

    private readonly root: string;
    private readonly maxRunDirs: number;

    constructor(
        private readonly manifest: IntegrationRunManifest,
        opts: EmitterOptions = {}
    ) {
        this.root = opts.rootDir ?? join(process.cwd(), 'logs', 'integration-runs');
        this.runDir = join(this.root, this.manifest.runID);
        this.progressPath = join(this.runDir, 'progress.jsonl');
        this.manifestPath = join(this.runDir, 'manifest.json');
        this.resultPath = join(this.runDir, 'result.json');
        this.consoleMirror = opts.consoleMirror ?? false;
        this.maxRunDirs = opts.maxRunDirs ?? DEFAULT_MAX_RUN_DIRS;
        this.writeChain = this.bootstrap();
    }

    /** Emit a generic event. */
    public Emit(
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
        // Count accumulation — applied vs. fetched distinction (see counts shape in types.ts).
        // `stage.complete` (and the terminal `run.complete`) carry the authoritative APPLIED
        // quartet {processed,succeeded,failed,skipped} for a finished stage/run. By contrast,
        // `records.batch.complete` carries a FETCHED `processed` count for live per-batch
        // progress only — the SAME records are later reported again, applied, in `stage.complete`.
        // Summing both double-counts every record (a 56-record sync would report 112). So only
        // the applied-rollup events feed the run-level aggregate; batch/heartbeat counts stay in
        // the stream for progress bars but are NOT summed here.
        if (partial.counts && CountsContributeToAggregate(eventType)) {
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
        if (eventType === 'warning') {
            this.warnings.push(this.warningFromEvent(event));
        }
        const line = JSON.stringify(event) + '\n';
        if (this.consoleMirror) {
            this.mirrorToConsole(event);
        }
        // §11 push path: fan out to the live subscription via the registered hook. Best-effort —
        // never breaks the sync or the durable write (which remain the source of truth).
        const hook = IntegrationProgressEmitter._publishHook;
        if (hook) { try { hook(this.manifest, event); } catch { /* publish is best-effort */ } }
        this.writeChain = this.writeChain.then(() => fs.appendFile(this.progressPath, line, 'utf-8'));
    }

    /** @deprecated Use {@link Emit}. */
    public emit(
        eventType: IntegrationProgressEventType,
        partial: Partial<Omit<IntegrationProgressEvent, 'ts' | 'seq' | 'eventType'>> = {}
    ): void {
        return this.Emit(eventType, partial);
    }

    /** Convenience helpers — sugared `emit()` for the common cases. */
    public RunStart(message?: string): void {
        this.Emit('run.start', { message, level: 'info' });
    }

    /** @deprecated Use {@link RunStart}. */
    public runStart(message?: string): void {
        return this.RunStart(message);
    }
    public StageStart(stage: string, message?: string): void {
        this.Emit('stage.start', { stage, message, level: 'info' });
    }

    /** @deprecated Use {@link StageStart}. */
    public stageStart(stage: string, message?: string): void {
        return this.StageStart(stage, message);
    }
    public StageComplete(stage: string, counts?: IntegrationProgressEvent['counts']): void {
        this.Emit('stage.complete', { stage, counts, level: 'info' });
    }

    /** @deprecated Use {@link StageComplete}. */
    public stageComplete(stage: string, counts?: IntegrationProgressEvent['counts']): void {
        return this.StageComplete(stage, counts);
    }
    public StageError(stage: string, message: string, data?: Record<string, unknown>): void {
        this.Emit('stage.error', { stage, message, level: 'error', data });
    }

    /** @deprecated Use {@link StageError}. */
    public stageError(stage: string, message: string, data?: Record<string, unknown>): void {
        return this.StageError(stage, message, data);
    }
    /**
     * Emit a non-fatal warning. Carries a structured {stage, code, message, data}
     * payload that the reader aggregates into the run result's `warnings[]` rollup.
     * Unlike `stageError`, a warning never fails the run.
     */
    public Warning(stage: string, code: string, message: string, data?: Record<string, unknown>): void {
        this.Emit('warning', {
            stage,
            message,
            level: 'warn',
            data: { code, ...(data ?? {}) },
        });
    }

    /** @deprecated Use {@link Warning}. */
    public warning(stage: string, code: string, message: string, data?: Record<string, unknown>): void {
        return this.Warning(stage, code, message, data);
    }
    public Heartbeat(stage: string, message: string, counts?: IntegrationProgressEvent['counts']): void {
        this.Emit('progress.heartbeat', { stage, message, counts, level: 'info' });
    }

    /** @deprecated Use {@link Heartbeat}. */
    public heartbeat(stage: string, message: string, counts?: IntegrationProgressEvent['counts']): void {
        return this.Heartbeat(stage, message, counts);
    }
    /**
     * Write a resumable checkpoint. resumableState should carry enough subsystem-
     * specific data for the originating service to resume from this point.
     */
    public Checkpoint(stage: string, resumableState: Record<string, unknown>): void {
        this.Emit('checkpoint', { stage, resumableState, level: 'debug' });
    }

    /** @deprecated Use {@link Checkpoint}. */
    public checkpoint(stage: string, resumableState: Record<string, unknown>): void {
        return this.Checkpoint(stage, resumableState);
    }

    public ExternalCallStart(url: string, method: string, data?: Record<string, unknown>): void {
        this.Emit('external.call.start', { data: { url, method, ...(data ?? {}) }, level: 'debug' });
    }

    /** @deprecated Use {@link ExternalCallStart}. */
    public externalCallStart(url: string, method: string, data?: Record<string, unknown>): void {
        return this.ExternalCallStart(url, method, data);
    }
    public ExternalCallComplete(url: string, method: string, status: number, durationMs: number): void {
        this.Emit('external.call.complete', {
            data: { url, method, status, durationMs },
            level: status >= 400 ? 'warn' : 'debug',
        });
    }

    /** @deprecated Use {@link ExternalCallComplete}. */
    public externalCallComplete(url: string, method: string, status: number, durationMs: number): void {
        return this.ExternalCallComplete(url, method, status, durationMs);
    }

    public ObjectAdded(objectName: string, source: 'Declared' | 'Discovered' | 'Custom'): void {
        this.Emit('discovery.object.added', { data: { objectName, source }, level: 'info' });
    }

    /** @deprecated Use {@link ObjectAdded}. */
    public objectAdded(objectName: string, source: 'Declared' | 'Discovered' | 'Custom'): void {
        return this.ObjectAdded(objectName, source);
    }
    public FieldAdded(objectName: string, fieldName: string, source: 'Declared' | 'Discovered' | 'Custom'): void {
        this.Emit('discovery.field.added', { data: { objectName, fieldName, source }, level: 'debug' });
    }

    /** @deprecated Use {@link FieldAdded}. */
    public fieldAdded(objectName: string, fieldName: string, source: 'Declared' | 'Discovered' | 'Custom'): void {
        return this.FieldAdded(objectName, fieldName, source);
    }
    public PkClassifierInvoked(objectName: string): void {
        this.Emit('pk.classifier.invoked', { data: { objectName }, level: 'info' });
    }

    /** @deprecated Use {@link PkClassifierInvoked}. */
    public pkClassifierInvoked(objectName: string): void {
        return this.PkClassifierInvoked(objectName);
    }
    public PkClassifierResult(objectName: string, verdict: Record<string, unknown>): void {
        this.Emit('pk.classifier.result', { data: { objectName, ...verdict }, level: 'info' });
    }

    /** @deprecated Use {@link PkClassifierResult}. */
    public pkClassifierResult(objectName: string, verdict: Record<string, unknown>): void {
        return this.PkClassifierResult(objectName, verdict);
    }
    public EntityGenerated(objectName: string, mjEntityName: string): void {
        this.Emit('entity.generated', { data: { objectName, mjEntityName }, level: 'info' });
    }

    /** @deprecated Use {@link EntityGenerated}. */
    public entityGenerated(objectName: string, mjEntityName: string): void {
        return this.EntityGenerated(objectName, mjEntityName);
    }
    public EntitySkippedNoPK(objectName: string): void {
        this.Emit('entity.skipped-no-pk', { data: { objectName }, level: 'warn' });
    }

    /** @deprecated Use {@link EntitySkippedNoPK}. */
    public entitySkippedNoPK(objectName: string): void {
        return this.EntitySkippedNoPK(objectName);
    }

    /** Terminate the run as success. */
    public async Complete(message?: string): Promise<void> {
        if (this.terminated) return;
        this.Emit('run.complete', { message, level: 'info' });
        await this.writeTerminal({
            success: true,
            exitReason: 'completed',
        });
    }

    /** @deprecated Use {@link Complete}. */
    public async complete(message?: string): Promise<void> {
        return this.Complete(message);
    }

    /** Terminate the run as failure. */
    public async Fail(message: string, code?: string): Promise<void> {
        if (this.terminated) return;
        this.Emit('run.fail', { message, level: 'error', data: code ? { code } : undefined });
        await this.writeTerminal({
            success: false,
            exitReason: code === 'budget-exhausted' ? 'budget-exhausted' : 'failed',
        });
    }

    /** @deprecated Use {@link Fail}. */
    public async fail(message: string, code?: string): Promise<void> {
        return this.Fail(message, code);
    }

    /**
     * Terminate the run as CANCELLED (a user/system abort stopped it mid-flight, not a failure and not a
     * clean completion). Emits exitReason='aborted' so a cancelled run is distinguishable from one that
     * finished — the persisted CompanyIntegrationRun has no 'Cancelled' status, so the artifact's
     * ExitReason is the GQL-visible signal that the run was stopped early (partial state is still durable).
     */
    public async Cancel(message?: string): Promise<void> {
        if (this.terminated) return;
        this.Emit('run.cancel', { message: message ?? 'Sync cancelled by user', level: 'warn' });
        await this.writeTerminal({
            success: false,
            exitReason: 'aborted',
        });
    }

    /** @deprecated Use {@link Cancel}. */
    public async cancel(message?: string): Promise<void> {
        return this.Cancel(message);
    }

    /** Await all pending writes. */
    public async Flush(): Promise<void> {
        await this.writeChain;
    }

    /** @deprecated Use {@link Flush}. */
    public async flush(): Promise<void> {
        return this.Flush();
    }

    // ── Internals ──────────────────────────────────────────────────────

    private async bootstrap(): Promise<void> {
        await fs.mkdir(this.runDir, { recursive: true });
        await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
        // Retention: prune oldest run dirs so logs/ never grows unbounded across runs. Best-effort —
        // a pruning failure must never break the run (the new run dir is already created above).
        await this.pruneOldRuns().catch(() => { /* best-effort retention */ });
    }

    /**
     * Deletes the oldest per-run subdirs under the root, keeping the most recent `maxRunDirs` (by
     * mtime). Disabled when maxRunDirs <= 0. Never removes the current run dir (it's the newest).
     */
    private async pruneOldRuns(): Promise<void> {
        if (this.maxRunDirs <= 0) return;
        let entries: import('node:fs').Dirent[];
        try {
            entries = await fs.readdir(this.root, { withFileTypes: true });
        } catch {
            return; // root not readable yet — nothing to prune
        }
        const dirs = entries.filter(e => e.isDirectory());
        if (dirs.length <= this.maxRunDirs) return;
        // Stat each for mtime, newest-first; delete everything past the retention count.
        const withTime = await Promise.all(dirs.map(async d => {
            const p = join(this.root, d.name);
            try { return { p, mtime: (await fs.stat(p)).mtimeMs }; }
            catch { return { p, mtime: 0 }; }
        }));
        withTime.sort((a, b) => b.mtime - a.mtime);
        const toDelete = withTime.slice(this.maxRunDirs);
        await Promise.all(toDelete.map(d =>
            fs.rm(d.p, { recursive: true, force: true }).catch(() => { /* best-effort */ })
        ));
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
            warnings: this.warnings.length > 0 ? this.warnings : undefined,
            warningCount: this.warnings.length,
            resumableFromSeq: this.latestCheckpointSeq,
        };
        await fs.writeFile(this.resultPath, JSON.stringify(result, null, 2), 'utf-8');
    }

    /** Reconstruct a {@link SyncWarning} from an emitted `'warning'` event. */
    private warningFromEvent(event: IntegrationProgressEvent): SyncWarning {
        const { code, ...rest } = event.data ?? {};
        return {
            code: typeof code === 'string' ? code : 'UNKNOWN',
            stage: event.stage ?? '',
            message: event.message ?? '',
            data: Object.keys(rest).length > 0 ? rest : undefined,
        };
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

    public static NewRunID(prefix?: string): string {
        const hi = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        const lo = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        return `${prefix ?? 'run'}-${Date.now()}-${hi}${lo}`;
    }

    /** @deprecated Use {@link NewRunID}. */
    public static newRunID(prefix?: string): string {
        return this.NewRunID(prefix);
    }
}
