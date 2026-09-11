/**
 * @fileoverview The second half of an RSU run's progress stream — the half that happens in a
 * different process from the first.
 *
 * The RSU pipeline restarts the API as one of its own steps. Everything after that restart —
 * creating the entity maps and field maps, then starting the first sync — runs in the NEW process,
 * from the durable pending-work queue. Until now none of it was observable: the pre-restart process
 * died mid-run, so its emitter never wrote a terminal result and the run stayed flagged in-flight
 * forever, while the post-restart work reported nothing at all. A client watching the setup journey
 * saw the stream stop at "restart instance" and had no way to learn whether the connector ever
 * became live.
 *
 * This module re-attaches to that same run and finishes it. Re-attaching (rather than opening a new
 * run) is the entire point: the tail API returns strictly `seq > cursor`, and a fresh emitter
 * restarts its sequence at 1 — so a brand-new run's events would sort BELOW the cursor of every
 * client already tailing, permanently invisible to them, while the resolver echoed their unchanged
 * cursor back and they polled forever receiving nothing.
 *
 * Correlation is by MANIFEST, not by checkpoint. The manifest is written when the run opens, minutes
 * before the restart; the checkpoint is written in the last moments before the kill signal. Keying
 * off the durable artifact and treating the checkpoint as enrichment means a lost checkpoint costs
 * step numbers, not the whole re-attachment.
 */
import {
    IntegrationProgressEmitter,
    IntegrationProgressReader,
    IntegrationRunResumeError,
} from '@memberjunction/integration-progress-artifacts';
import type { EmitterOptions, IntegrationProgressEvent, IntegrationRunSnapshot } from '@memberjunction/integration-progress-artifacts';
import { RuntimeSchemaManager } from '@memberjunction/schema-engine';
import { LogError, LogStatus } from '@memberjunction/core';
import { RESTART_STAGE } from './RSUProgressBridge.js';

/** The two stages this module owns, in order. Named by the pipeline so the halves cannot drift. */
const [ENTITY_MAPS_STAGE, START_SYNC_STAGE] = RuntimeSchemaManager.EXPECTED_STEPS_POST_RESTART;

/**
 * How many in-flight RSU runs to consider for a single connection before giving up.
 *
 * More than one can exist only when an earlier run's post-restart work never completed (its process
 * died again, or its pending-work rows were consumed on a boot that then crashed). The newest is the
 * one this pending-work item belongs to; the window is small so a pathological backlog cannot turn
 * one item's re-attachment into a directory scan of the whole run history.
 */
const CANDIDATE_RUN_WINDOW = 25;

/** Step position carried across the restart, when the checkpoint survived. */
interface RestartPosition {
    /** 1-based index of `RestartMJAPI`; the post-restart steps follow it. */
    stepIndex?: number;
    stepTotal?: number;
}

/**
 * One re-attached RSU run. Emits the two post-restart stages into the run the pre-restart process
 * opened, and terminates it exactly once.
 *
 * Obtained from {@link RSUPostRestartProgressSession}, never constructed directly — the session is
 * what guarantees a run is attached (and terminated) once even when several pending-work items in
 * one sweep belong to the same batch.
 */
export class RSUPostRestartProgress {
    private entityMapsOpen = false;
    private syncOpen = false;
    private failed = false;
    private readonly failures: string[] = [];

    /** @internal — use {@link RSUPostRestartProgressSession.For}. */
    public constructor(
        private readonly emitter: IntegrationProgressEmitter,
        private readonly position: RestartPosition
    ) {}

    /** The run being continued, so a caller can log or hand it to a client. */
    public get RunID(): string {
        return this.emitter.RunID;
    }

    /**
     * "step 12 of 14" for a post-restart step, or undefined when the checkpoint did not survive.
     *
     * `offset` is the step's position AFTER `RestartMJAPI` (1 for CreateEntityMaps, 2 for StartSync).
     * Derived from the checkpoint rather than recomputed, because the pipeline skips steps
     * conditionally (`SkipGitCommit`) and a recomputed index would disagree with the one the client
     * has already been shown.
     */
    private positionLabel(offset: number): string | undefined {
        const { stepIndex, stepTotal } = this.position;
        if (stepIndex == null || stepTotal == null) return undefined;
        return `step ${stepIndex + offset} of ${stepTotal}`;
    }

    /** Opens the `CreateEntityMaps` stage for one pending-work item. */
    public BeginEntityMaps(objectCount: number): void {
        this.emitter.stageStart(ENTITY_MAPS_STAGE, this.positionLabel(1));
        this.entityMapsOpen = true;
        this.emitter.heartbeat(ENTITY_MAPS_STAGE, `Mapping ${objectCount} object(s)`, { processed: 0, totalKnown: objectCount });
    }

    /**
     * Reports one object's entity map + field maps as done.
     *
     * A heartbeat rather than a `records.batch.complete`: heartbeat counts are explicitly excluded
     * from the run's applied aggregate, so per-object liveness cannot double-count against the
     * stage rollup that follows.
     */
    public ObjectMapped(objectName: string, processed: number, totalKnown: number): void {
        this.emitter.heartbeat(ENTITY_MAPS_STAGE, `Mapped ${objectName} (${processed}/${totalKnown})`, { processed, totalKnown });
    }

    /**
     * Closes `CreateEntityMaps` with the applied quartet, in OBJECTS.
     *
     * The run's aggregate is in objects, not migrations, for a resumed run: the migration quartet is
     * emitted by `run.end`, which a restarting run by definition never reaches. Emitting both here
     * would sum two different units into one number (2 migrations + 12 objects reported as
     * "processed: 14"), so the migration counts stay in the terminal message instead.
     */
    public CompleteEntityMaps(processed: number, succeeded: number, failed: number): void {
        if (!this.entityMapsOpen) return;
        this.entityMapsOpen = false;
        this.emitter.stageComplete(ENTITY_MAPS_STAGE, { processed, succeeded, failed, totalKnown: processed });
    }

    /**
     * Closes `CreateEntityMaps` as an ERROR, naming the objects that were never mapped.
     *
     * Naming them is the requirement, not a nicety: when this half fails, those objects have tables
     * in the database and no way to sync into them, and the operator's only signal that something
     * needs re-applying is this message.
     */
    public FailEntityMaps(message: string, unmappedObjects: string[]): void {
        this.entityMapsOpen = false;
        this.failed = true;
        const named = unmappedObjects.length > 0
            ? ` Objects never mapped: ${unmappedObjects.slice(0, 20).join(', ')}${unmappedObjects.length > 20 ? ` (+${unmappedObjects.length - 20} more)` : ''}.`
            : '';
        const full = `${message}${named}`;
        this.failures.push(full);
        this.emitter.stageError(ENTITY_MAPS_STAGE, full, {
            code: 'RSU_POST_RESTART_ENTITY_MAPS_FAILED',
            unmappedObjects,
        });
    }

    /** Opens the `StartSync` stage. */
    public BeginStartSync(): void {
        this.emitter.stageStart(START_SYNC_STAGE, this.positionLabel(2));
        this.syncOpen = true;
    }

    /**
     * Closes `StartSync`, carrying the sync run's ID so a client can hop from this stream to the
     * sync's own.
     *
     * Deliberately carries NO `counts`: the records belong to the sync run, and counting them here
     * would add another unit to this run's aggregate. `syncRunID` may be null when the sync was
     * launched but its run row was not yet readable — the stage still completes, because the sync
     * did start; the client simply has to find the run itself.
     */
    public CompleteStartSync(syncRunID: string | null): void {
        if (!this.syncOpen) return;
        this.syncOpen = false;
        this.emitter.emit('stage.complete', {
            stage: START_SYNC_STAGE,
            level: 'info',
            message: syncRunID ? `Sync started — run ${syncRunID}` : 'Sync started',
            data: { syncRunID },
        });
    }

    /** Closes `StartSync` as skipped — the caller asked for no initial sync. */
    public SkipStartSync(reason: string): void {
        if (!this.syncOpen) return;
        this.syncOpen = false;
        this.emitter.emit('stage.complete', {
            stage: START_SYNC_STAGE,
            level: 'info',
            message: `Sync not started — ${reason}`,
            data: { syncRunID: null, skipped: true, reason },
        });
    }

    /** Closes `StartSync` as an error — the sync could not be launched. */
    public FailStartSync(message: string): void {
        this.syncOpen = false;
        this.failed = true;
        this.failures.push(message);
        this.emitter.stageError(START_SYNC_STAGE, message, { code: 'RSU_POST_RESTART_SYNC_START_FAILED' });
    }

    /** Records a failure that happened outside either stage (connector resolution, for example). */
    public RecordFailure(stage: string, message: string): void {
        this.failed = true;
        this.failures.push(message);
        this.emitter.stageError(stage, message, { code: 'RSU_POST_RESTART_FAILED' });
    }

    /**
     * Terminates the run. Idempotent — the emitter refuses a second terminal write, and the result
     * file is created-not-truncated, so a duplicate call cannot rewrite an outcome a client has
     * already read.
     */
    public async Finish(): Promise<void> {
        // An unclosed stage would leave a client's stepper stuck on it forever; a run must never end
        // with a stage still open.
        if (this.entityMapsOpen) this.FailEntityMaps('Post-restart processing ended with entity-map creation still open', []);
        if (this.syncOpen) this.FailStartSync('Post-restart processing ended with sync start still open');
        if (this.failed) {
            await this.emitter.fail(
                `RSU post-restart work failed — ${this.failures.join(' | ')}`,
                'rsu-post-restart-failed'
            );
        } else {
            await this.emitter.complete('RSU pipeline complete — entity maps created and sync started');
        }
    }
}

/**
 * Owns the re-attachments for ONE pass of the post-restart pending-work queue.
 *
 * A single RSU batch registers one pending-work row per input, so several rows in one sweep can
 * belong to the same run. Attaching per row would try to resume — and terminate — the same run
 * repeatedly; the second attempt would be refused as already-terminal and its work would go
 * unreported. Memoizing by run ID makes the run's stream a single coherent continuation, with one
 * `run.resumed` at the top and one terminal event at the bottom.
 */
export class RSUPostRestartProgressSession {
    private readonly byRunID = new Map<string, RSUPostRestartProgress>();
    private readonly byCompanyIntegrationID = new Map<string, RSUPostRestartProgress | null>();

    constructor(private readonly emitterOptions: EmitterOptions = {}) {}

    /**
     * The continuation handle for a connection's RSU run, or null when there is nothing to continue
     * (no in-flight run for that connection, or it was already finished).
     *
     * Null is a normal outcome, not an error: pending work can legitimately be processed on a boot
     * whose run artifact has been pruned, or after a retry that already closed the run. The caller
     * does its work either way — progress reporting never gates the work itself.
     */
    public async For(companyIntegrationID: string): Promise<RSUPostRestartProgress | null> {
        const cached = this.byCompanyIntegrationID.get(companyIntegrationID);
        if (cached !== undefined) return cached;

        const attached = await this.attach(companyIntegrationID);
        this.byCompanyIntegrationID.set(companyIntegrationID, attached);
        return attached;
    }

    /** Terminates every run this session re-attached to. Safe to call more than once. */
    public async FinishAll(): Promise<void> {
        for (const progress of this.byRunID.values()) {
            await progress.Finish().catch(err => LogError(`[RSU] post-restart terminal write failed for run ${progress.RunID}: ${err}`));
        }
    }

    private async attach(companyIntegrationID: string): Promise<RSUPostRestartProgress | null> {
        try {
            const reader = new IntegrationProgressReader(this.emitterOptions.rootDir);
            const candidates = await reader.ListRuns(
                { runKind: 'RSU', companyIntegrationID, inFlightOnly: true },
                CANDIDATE_RUN_WINDOW
            );
            // A run this session already picked up no longer LOOKS killed-at-the-restart — its latest
            // event is now the `run.resumed` this session wrote. So an already-attached run must be
            // matched first, or the second pending-work item of the same batch would find nothing to
            // report into and its work would go unobserved.
            const snapshot = candidates.find(s => this.byRunID.has(s.manifest.runID))
                ?? candidates.find(RSUPostRestartProgressSession.WasKilledAtRestart);
            if (!snapshot) return null;

            const runID = snapshot.manifest.runID;
            const existing = this.byRunID.get(runID);
            if (existing) return existing;

            const checkpoint = await reader.LatestCheckpoint(runID);
            const emitter = await IntegrationProgressEmitter.Resume(runID, this.emitterOptions);
            emitter.runResumed(
                `Resumed after the RSU restart — continuing with ${RuntimeSchemaManager.EXPECTED_STEPS_POST_RESTART.join(' then ')}`,
                { companyIntegrationID }
            );
            const progress = new RSUPostRestartProgress(emitter, RSUPostRestartProgressSession.PositionFrom(checkpoint));
            this.byRunID.set(runID, progress);
            LogStatus(`[RSU] Re-attached to run ${runID} for connection ${companyIntegrationID}`);
            return progress;
        } catch (err: unknown) {
            // A run that is already terminal, or has no manifest, is not an error condition worth
            // failing the actual work over — the work still has to happen, unobserved.
            if (err instanceof IntegrationRunResumeError) {
                LogStatus(`[RSU] Not resuming progress for ${companyIntegrationID}: ${err.message}`);
                return null;
            }
            LogError(`[RSU] Could not re-attach progress for ${companyIntegrationID}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Whether a run's stream stops at the restart — which is the signature of a run this process is
     * the continuation of.
     *
     * Checking the LAST stage, not the presence of the checkpoint, on purpose. The checkpoint is
     * written in the moments before the kill signal and can be lost; the `stage.start RestartMJAPI`
     * that precedes it cannot, because the pipeline waits on nothing between emitting it and dying.
     * Requiring the checkpoint would trade a recoverable loss of step numbers for an unrecoverable
     * loss of the whole continuation.
     */
    public static WasKilledAtRestart(snapshot: IntegrationRunSnapshot): boolean {
        return snapshot.latestEvent?.stage === RESTART_STAGE;
    }

    /** Reads the step position out of a restart checkpoint, tolerating a missing or partial one. */
    public static PositionFrom(checkpoint: IntegrationProgressEvent | undefined): RestartPosition {
        const state = checkpoint?.stage === RESTART_STAGE ? checkpoint.resumableState : undefined;
        if (!state) return {};
        const stepIndex = state.stepIndex;
        const stepTotal = state.stepTotal;
        return {
            stepIndex: typeof stepIndex === 'number' ? stepIndex : undefined,
            stepTotal: typeof stepTotal === 'number' ? stepTotal : undefined,
        };
    }
}
