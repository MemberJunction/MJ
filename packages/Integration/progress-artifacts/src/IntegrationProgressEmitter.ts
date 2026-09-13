import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CountsContributeToAggregate } from './types.js';
import { DefaultRunArtifactRoot } from './RunArtifactRoot.js';
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
    /**
     * Root directory containing per-run subdirs. Defaults to {@link DefaultRunArtifactRoot} —
     * `MJ_INTEGRATION_RUN_ARTIFACT_ROOT` when set, else `<cwd>/logs/integration-runs`.
     */
    rootDir?: string;
    /** Optional human-facing console mirror (default false — file is the primary record). */
    consoleMirror?: boolean;
    /**
     * Max number of per-run subdirs to retain under rootDir. On each new run, run dirs beyond this
     * count are pruned so the logs directory never grows unbounded across runs. See
     * {@link IntegrationProgressEmitter.pruneOldRuns} for WHICH runs go: finished ones first, oldest
     * by run start time. Defaults to MJ_INTEGRATION_MAX_RUN_DIRS env or 200. Set 0 to disable pruning.
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
 * Everything a resumed emitter has to inherit from the journal of the run it is re-attaching to.
 *
 * Built by {@link IntegrationProgressEmitter.Resume} BEFORE the emitter is constructed — never
 * inside `bootstrap()`. `emit()` takes `++this.seq` synchronously, so a caller that emits in the
 * same tick as construction would otherwise race the async seeding and restart the sequence at 1,
 * which is precisely the invisibility bug resume exists to avoid.
 */
interface ResumedRunState {
    /** Highest `seq` present in the journal; the resumed emitter's first event is this + 1. */
    lastSeq: number;
    /** Applied-count aggregate re-derived from the pre-restart journal. */
    aggregateCounts: { processed: number; succeeded: number; failed: number; skipped: number };
    /** Errors already recorded pre-restart, so the terminal result carries the whole run. */
    errors: NonNullable<IntegrationRunResult['errors']>;
    /** Warnings already recorded pre-restart, same reason. */
    warnings: SyncWarning[];
    /** Latest checkpoint sequence seen pre-restart (kept unless a later checkpoint supersedes it). */
    latestCheckpointSeq?: number;
    /** Original run start, so `durationMs` spans the whole run rather than the resumed tail. */
    startMs: number;
    /** Events already in the journal, so the terminal record's `eventCount` covers the whole run. */
    eventCount: number;
    /** Highest-sequence event already in the journal, so the terminal record's `latestEvent` is real. */
    latestEvent?: IntegrationProgressEvent;
}

/** Thrown when a run cannot be resumed. Carries a machine-checkable reason. */
export class IntegrationRunResumeError extends Error {
    constructor(
        message: string,
        /** `'not-found'` — no manifest; `'already-terminal'` — result.json exists. */
        public readonly Reason: 'not-found' | 'already-terminal'
    ) {
        super(message);
        this.name = 'IntegrationRunResumeError';
    }
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
    private warnings: SyncWarning[] = [];
    private latestCheckpointSeq?: number;
    /**
     * The run's journal line count and its highest-sequence event, tracked as events are written so
     * {@link writeTerminal} can persist both. Without them a reader has to open the whole journal to
     * count its lines and to recover its last line — two of the four full-file reads that made a run
     * listing O(runs x filesize) (MJ-RUN-5/21).
     */
    private eventsWritten = 0;
    private lastEvent?: IntegrationProgressEvent;
    private readonly startMs: number;
    /** True when this emitter re-attached to an existing run (see {@link Resume}). */
    private readonly resumed: boolean;
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
        opts: EmitterOptions = {},
        /**
         * Internal — supplied only by {@link Resume}. Its presence switches the emitter into
         * resume mode: the manifest is left exactly as it is on disk and retention pruning is
         * skipped (see {@link bootstrap}).
         */
        resumeState?: ResumedRunState
    ) {
        this.root = opts.rootDir ?? DefaultRunArtifactRoot();
        this.runDir = join(this.root, this.manifest.runID);
        this.progressPath = join(this.runDir, 'progress.jsonl');
        this.manifestPath = join(this.runDir, 'manifest.json');
        this.resultPath = join(this.runDir, 'result.json');
        this.consoleMirror = opts.consoleMirror ?? false;
        this.maxRunDirs = opts.maxRunDirs ?? DEFAULT_MAX_RUN_DIRS;
        this.resumed = resumeState !== undefined;
        this.startMs = resumeState?.startMs ?? Date.now();
        if (resumeState) {
            // Seeded synchronously, before anything can call emit(). See ResumedRunState.
            this.seq = resumeState.lastSeq;
            this.aggregateCounts = { ...resumeState.aggregateCounts };
            this.errors = [...resumeState.errors];
            this.warnings = [...resumeState.warnings];
            this.latestCheckpointSeq = resumeState.latestCheckpointSeq;
            this.eventsWritten = resumeState.eventCount;
            this.lastEvent = resumeState.latestEvent;
        }
        this.writeChain = this.bootstrap();
    }

    /** The run this emitter writes to. */
    public get RunID(): string {
        return this.manifest.runID;
    }

    /**
     * The highest sequence number emitted so far. A client tailing with `sinceSeq` only sees events
     * ABOVE its cursor, so a resumed emitter must continue from here — this getter is what lets a
     * caller (and a test) assert it did.
     */
    public get LatestSeq(): number {
        return this.seq;
    }

    /** Whether this emitter re-attached to an existing run rather than opening a new one. */
    public get IsResumed(): boolean {
        return this.resumed;
    }

    /**
     * Re-attach to an existing, still-in-flight run and continue writing to its artifacts.
     *
     * Why this exists: the RSU pipeline restarts the API process as one of its own steps. The
     * emitter dies mid-run, its `run.end` handler never fires, and the run stays flagged in-flight
     * forever. The work that finishes the pipeline then happens in a NEW process, which — without
     * this — could only open a brand-new run, invisible to every client already tailing the old one
     * (the reader returns strictly `seq > cursor`, and a fresh emitter restarts at 1, so those
     * events sort BELOW the client's cursor and are unrecoverable through that interface; worse,
     * the resolver echoes the unchanged cursor back and the client polls forever receiving nothing).
     *
     * Three invariants make it safe:
     *  1. **The manifest is preserved, never rewritten.** The normal write is truncate-or-create,
     *     and the reader treats a missing/unparseable manifest as "run does not exist" — so a
     *     concurrent read during that write makes the run VANISH rather than degrade.
     *  2. **The sequence continues from the journal's last line**, so a tailing client's cursor
     *     keeps advancing and it sees the post-restart events.
     *  3. **A run that already has a `result.json` is refused**, so a terminal record can never be
     *     written twice or overwritten by a late re-attachment.
     *
     * The append-only journal is what makes all of this possible: it is never truncated, so its
     * last line is an authoritative high-water mark for the sequence.
     *
     * @throws {IntegrationRunResumeError} when the run has no manifest, or is already terminal.
     */
    public static async Resume(runID: string, opts: EmitterOptions = {}): Promise<IntegrationProgressEmitter> {
        const root = opts.rootDir ?? DefaultRunArtifactRoot();
        const runDir = join(root, runID);

        const manifestRaw = await fs.readFile(join(runDir, 'manifest.json'), 'utf-8').catch(() => undefined);
        if (manifestRaw === undefined) {
            throw new IntegrationRunResumeError(`Cannot resume run '${runID}': no manifest`, 'not-found');
        }
        let manifest: IntegrationRunManifest;
        try {
            manifest = JSON.parse(manifestRaw) as IntegrationRunManifest;
        } catch {
            throw new IntegrationRunResumeError(`Cannot resume run '${runID}': manifest is not valid JSON`, 'not-found');
        }

        // Terminal runs are off limits. Resuming one would either double-write result.json or
        // reopen a run a client has already been told is finished.
        const alreadyTerminal = await fs.readFile(join(runDir, 'result.json'), 'utf-8').then(() => true).catch(() => false);
        if (alreadyTerminal) {
            throw new IntegrationRunResumeError(`Cannot resume run '${runID}': it is already terminal`, 'already-terminal');
        }

        const state = await IntegrationProgressEmitter.replayJournal(join(runDir, 'progress.jsonl'), manifest);
        return new IntegrationProgressEmitter(manifest, opts, state);
    }

    /**
     * Rebuilds the emitter-side state a run accumulated before it was killed, by replaying its
     * append-only journal. Applies exactly the same aggregation rules `emit()` does, so a resumed
     * run's terminal result covers the WHOLE run rather than only the post-restart tail.
     */
    private static async replayJournal(path: string, manifest: IntegrationRunManifest): Promise<ResumedRunState> {
        const parsedStart = Date.parse(manifest.startedAt);
        const state: ResumedRunState = {
            lastSeq: 0,
            aggregateCounts: { processed: 0, succeeded: 0, failed: 0, skipped: 0 },
            errors: [],
            warnings: [],
            startMs: Number.isFinite(parsedStart) ? parsedStart : Date.now(),
            eventCount: 0,
        };
        const raw = await fs.readFile(path, 'utf-8').catch(() => undefined);
        if (raw === undefined) return state;

        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            state.eventCount++;
            let ev: IntegrationProgressEvent;
            try {
                ev = JSON.parse(line) as IntegrationProgressEvent;
            } catch {
                continue; // a torn last line (killed mid-append) must not block resumption
            }
            // MAX, not "last line": a torn tail can leave the highest seq anywhere in the file, and
            // handing back anything lower would mint a duplicate sequence number.
            if (typeof ev.seq === 'number' && ev.seq > state.lastSeq) state.lastSeq = ev.seq;
            if (state.latestEvent === undefined || ev.seq >= state.latestEvent.seq) state.latestEvent = ev;
            if (ev.counts && CountsContributeToAggregate(ev.eventType)) {
                state.aggregateCounts.processed += ev.counts.processed ?? 0;
                state.aggregateCounts.succeeded += ev.counts.succeeded ?? 0;
                state.aggregateCounts.failed += ev.counts.failed ?? 0;
                state.aggregateCounts.skipped += ev.counts.skipped ?? 0;
            }
            if (ev.eventType === 'stage.error' || ev.eventType === 'record.error' || ev.eventType === 'run.fail') {
                const code = typeof ev.data?.code === 'string' ? ev.data.code : undefined;
                state.errors.push({ stage: ev.stage, message: ev.message ?? `${ev.eventType} (no message)`, code });
            }
            if (ev.eventType === 'warning') {
                const { code, ...rest } = ev.data ?? {};
                state.warnings.push({
                    code: typeof code === 'string' ? code : 'UNKNOWN',
                    stage: ev.stage ?? '',
                    message: ev.message ?? '',
                    data: Object.keys(rest).length > 0 ? rest : undefined,
                });
            }
            if (ev.eventType === 'checkpoint') state.latestCheckpointSeq = ev.seq;
        }
        return state;
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
        // Journal accounting, kept here because this is the one place a line is written. Persisted
        // by writeTerminal so a finished run never has to be re-read to be summarised.
        this.eventsWritten++;
        this.lastEvent = event;
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

    /** Convenience helpers — sugared `emit()` for the common cases. */
    public runStart(message?: string): void {
        this.emit('run.start', { message, level: 'info' });
    }
    /**
     * Announce that this process picked a killed run back up. Emits the already-declared
     * `'run.resumed'` event carrying the already-declared `'Restart'` trigger type — deliberately
     * NOT a new event type, and deliberately in the event's `data` rather than on the manifest,
     * because the manifest must not be rewritten (see {@link Resume}).
     *
     * `resumedFromSeq` is the sequence the pre-restart process reached; a client can use it to tell
     * "these events are the continuation" from "these are a fresh run".
     */
    public runResumed(message?: string, data?: Record<string, unknown>): void {
        this.emit('run.resumed', {
            message,
            level: 'info',
            data: { triggerType: 'Restart', resumedFromSeq: this.seq, ...(data ?? {}) },
        });
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
    /**
     * Emit a non-fatal warning. Carries a structured {stage, code, message, data}
     * payload that the reader aggregates into the run result's `warnings[]` rollup.
     * Unlike `stageError`, a warning never fails the run.
     */
    public warning(stage: string, code: string, message: string, data?: Record<string, unknown>): void {
        this.emit('warning', {
            stage,
            message,
            level: 'warn',
            data: { code, ...(data ?? {}) },
        });
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

    /**
     * Terminate the run as CANCELLED (a user/system abort stopped it mid-flight, not a failure and not a
     * clean completion). Emits exitReason='aborted' so a cancelled run is distinguishable from one that
     * finished — the persisted CompanyIntegrationRun has no 'Cancelled' status, so the artifact's
     * ExitReason is the GQL-visible signal that the run was stopped early (partial state is still durable).
     */
    public async cancel(message?: string): Promise<void> {
        if (this.terminated) return;
        this.emit('run.cancel', { message: message ?? 'Sync cancelled by user', level: 'warn' });
        await this.writeTerminal({
            success: false,
            exitReason: 'aborted',
        });
    }

    /** Await all pending writes. */
    public async flush(): Promise<void> {
        await this.writeChain;
    }

    // ── Internals ──────────────────────────────────────────────────────

    private async bootstrap(): Promise<void> {
        await fs.mkdir(this.runDir, { recursive: true });
        if (this.resumed) {
            // TWO deliberate omissions, both load-bearing:
            //
            // 1. The manifest is NOT rewritten. `writeFile` truncates-or-creates, and the reader
            //    treats a missing/unparseable manifest as "run does not exist" — so a client
            //    polling GetRun/Tail during that write would see the run VANISH mid-restart,
            //    which is strictly worse than the stale data it would have shown.
            // 2. Retention pruning is NOT run. A resumed run is by definition an OLD dir, so
            //    pruning here would evict other runs on the strength of a run that is not new.
            //    (`pruneOldRuns` now also exempts the current dir and every result-less run, so it
            //    could no longer delete the run being resumed — but it is still not this moment's
            //    job to decide what else goes.)
            //
            // One thing IS repaired: a journal that does not end in a newline was torn by the kill
            // mid-append. Appending straight onto it would splice the first resumed event into the
            // broken line and lose BOTH — a silently missing event at exactly the moment the client
            // is waiting for one. Terminating the torn line costs one byte and confines the damage
            // to the fragment that was already lost.
            await this.terminateTornJournalLine();
            return;
        }
        await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
        // Retention: prune oldest run dirs so logs/ never grows unbounded across runs. Best-effort —
        // a pruning failure must never break the run (the new run dir is already created above).
        await this.pruneOldRuns().catch(() => { /* best-effort retention */ });
    }

    /**
     * Closes off a journal whose final line was truncated by the kill, so the first resumed event
     * starts on a line of its own. Best-effort: a missing or unreadable journal simply means there
     * is nothing to repair.
     */
    private async terminateTornJournalLine(): Promise<void> {
        try {
            const raw = await fs.readFile(this.progressPath, 'utf-8');
            if (raw.length > 0 && !raw.endsWith('\n')) {
                await fs.appendFile(this.progressPath, '\n', 'utf-8');
            }
        } catch { /* no journal yet, or unreadable — nothing to repair */ }
    }

    /**
     * Enforces the retention cap on run dirs under the root, sacrificing the runs whose evidence is
     * worth least. Disabled when maxRunDirs <= 0; best-effort throughout.
     *
     * Two rules, and neither is cosmetic:
     *
     *  1. **Order by run START time, read from each manifest — never by mtime.** A run that stranded
     *     stops being written to, so its mtime freezes at the moment it stranded. Under the previous
     *     newest-first-by-mtime rule that sorted it to the BACK of the list, which made the evidence
     *     for the one failure an operator most needs to explain the FIRST thing deleted. A start time
     *     never moves. (The old doc comment claimed pruning "never removes the current run dir (it's
     *     the newest)" — true of a live run, and exactly wrong about a stranded one.)
     *  2. **A run with no `result.json` is sacrificed last.** No terminal record means the run is
     *     either still in flight — including THIS one — or stranded; in both cases nothing else
     *     records what it did, whereas a finished run's outcome is durable in its own `result.json`.
     *     The cap stays a hard bound: when only result-less runs remain to delete, the oldest of them
     *     go, so a fleet that strands runs cannot grow the directory without limit.
     *
     * The current run's own dir is exempt outright. Rule 2 already covers it (it has no result yet),
     * but saying so makes the guarantee independent of what any manifest claims its start time is.
     *
     * Retention consequence worth stating plainly: a finished run's artifacts are now shorter-lived
     * than they were, and an unfinished one's longer-lived. That is the trade — a completed run's
     * numbers survive in its `result.json` and in the database; a stranded run's journal is the only
     * account of it that exists.
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
        const described = await Promise.all(dirs.map(async d => {
            const p = join(this.root, d.name);
            const [startMs, finished] = await Promise.all([
                IntegrationProgressEmitter.runStartMs(p),
                IntegrationProgressEmitter.hasTerminalRecord(p),
            ]);
            return { p, startMs, finished, isSelf: p === this.runDir };
        }));
        // Sacrifice order: finished before unfinished, oldest start first within each group.
        const sacrificial = described
            .filter(d => !d.isSelf)
            .sort((a, b) => (a.finished === b.finished ? a.startMs - b.startMs : (a.finished ? -1 : 1)));
        const toDelete = sacrificial.slice(0, described.length - this.maxRunDirs);
        await Promise.all(toDelete.map(d =>
            fs.rm(d.p, { recursive: true, force: true }).catch(() => { /* best-effort */ })
        ));
    }

    /**
     * A run's start time, from its manifest. Falls back to the directory's mtime when the manifest is
     * missing or unreadable — which is what a dir another process created moments ago looks like, and
     * a fresh mtime keeps it at the safe end of the sacrifice order rather than deleting it as
     * "oldest". Only then 0, meaning "nothing is known about this dir".
     */
    private static async runStartMs(runDir: string): Promise<number> {
        try {
            const raw = await fs.readFile(join(runDir, 'manifest.json'), 'utf-8');
            const parsed = Date.parse((JSON.parse(raw) as IntegrationRunManifest).startedAt);
            if (Number.isFinite(parsed)) return parsed;
        } catch { /* fall through to mtime */ }
        try { return (await fs.stat(runDir)).mtimeMs; } catch { return 0; }
    }

    /** Whether a run dir holds a terminal record — i.e. the run finished and said so. */
    private static async hasTerminalRecord(runDir: string): Promise<boolean> {
        return fs.access(join(runDir, 'result.json')).then(() => true).catch(() => false);
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
            eventCount: this.eventsWritten,
            latestEvent: this.lastEvent,
        };
        // `wx` — create-only. The terminal record is written exactly ONCE per run, ever. The
        // in-instance `terminated` flag cannot cover the case resume introduces: two emitters, in
        // two processes, pointing at the same run dir. `Resume` refuses an already-terminal run, and
        // this is the second lock on the same door — an EEXIST here means someone already wrote the
        // run's outcome and that record wins, because it is the one clients have already read.
        try {
            await fs.writeFile(this.resultPath, JSON.stringify(result, null, 2), { encoding: 'utf-8', flag: 'wx' });
        } catch (err: unknown) {
            const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: unknown }).code : undefined;
            if (code !== 'EEXIST') throw err;
        }
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

    public static newRunID(prefix?: string): string {
        const hi = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        const lo = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        return `${prefix ?? 'run'}-${Date.now()}-${hi}${lo}`;
    }
}
