/**
 * @fileoverview Bridges RSU pipeline lifecycle events onto the integration progress artifact
 * stream, so a Runtime Schema Update is observable the same way a sync or a connector build is.
 *
 * The gap this closes: `IntegrationRunKind` has always included `'RSU'` and
 * `RUN_KIND_TO_TOPIC` has always mapped it to an `'RSU'` subscription channel — but nothing in
 * production ever constructed an emitter with that kind, so the channel carried no traffic and
 * `IntegrationTailRunEvents` had no RSU runs to tail. The only live signal was polling
 * `RuntimeSchemaUpdateStatus`, which reports the CURRENT step and nothing else: no history, no
 * durable record, and nothing at all to read after a mid-run API restart — which the RSU pipeline
 * does to itself, by design, as one of its own steps.
 *
 * Layering: `@memberjunction/schema-engine` must not depend on the progress artifacts package, so
 * it publishes plain {@link RSUObserverEvent}s and this module — one layer up, where both are
 * already dependencies — owns the emitter lifecycle.
 */
import { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';
import type { EmitterOptions } from '@memberjunction/integration-progress-artifacts';
import { RuntimeSchemaManager } from '@memberjunction/schema-engine';
import type { RSUObserverEvent } from '@memberjunction/schema-engine';
import { LogError } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';

/** The emitter stage name used for run-level (non-step) events. */
const RUN_STAGE = 'RSUPipeline';

/**
 * How often an in-flight step reports that it is still alive.
 *
 * RSU's expensive steps — CodeGen, TypeScript compile, npm install — run for minutes with no
 * intermediate observer event, so without this the stream goes silent for the entire step and a
 * watcher cannot tell "compiling" from "hung". 30s matches the interval the agent notification
 * conventions ask for on long phases.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Owns one emitter per RSU pipeline run and translates observer events into progress events.
 *
 * A {@link BaseSingleton} because the state here is inherently process-wide AND has to be readable
 * from elsewhere. `RuntimeSchemaManager` is itself a singleton and serializes its runs behind the
 * pipeline lock, so at most one RSU run is ever in flight and one current-emitter slot is sufficient
 * — but the reason for the singleton is {@link CurrentRunID}: a resolver that has just triggered an
 * RSU needs to hand its client a run to tail, and it can only do that if it can reach this instance.
 * Constructing the bridge and keeping the only reference inside the observer closure made that
 * accessor unreachable from any caller.
 *
 * NOT a `BaseEngine`: there is no metadata to load and nothing to `Config()`. The distinction is
 * "single shared instance" (this) versus "cached metadata with a load lifecycle" (that).
 */
export class RSUProgressBridge extends BaseSingleton<RSUProgressBridge> {
    private emitter: IntegrationProgressEmitter | null = null;
    private currentRunID: string | null = null;
    /** Liveness timer for the step currently in flight — see {@link HEARTBEAT_INTERVAL_MS}. */
    private heartbeat: ReturnType<typeof setInterval> | null = null;
    private emitterOptions: EmitterOptions = {};

    /** The one bridge for this process. */
    public static get Instance(): RSUProgressBridge {
        return super.getInstance<RSUProgressBridge>();
    }

    /**
     * Options passed through to each run's emitter. Set once, before the first run.
     *
     * The only field that matters in practice is `rootDir` — left unset in production so RSU runs
     * land in the same `logs/integration-runs/` tree as every other run kind and
     * `IntegrationTailRunEvents` finds them without configuration. Tests point it at a temp dir.
     *
     * A settable property rather than a constructor argument because `BaseSingleton.getInstance`
     * requires a zero-argument constructor.
     */
    public Configure(emitterOptions: EmitterOptions): void {
        this.emitterOptions = emitterOptions;
    }

    /**
     * The run ID of the in-flight RSU run, or null when idle. Lets a caller that triggered an RSU
     * hand a client something to tail via `IntegrationTailRunEvents` / the `RSU` subscription
     * channel.
     */
    public get CurrentRunID(): string | null {
        return this.currentRunID;
    }

    /**
     * Abandons any in-flight run state and stops its heartbeat, without emitting a terminal event.
     *
     * Needed because singleton state outlives a single caller: a test (or a server tearing down)
     * must be able to return the bridge to idle without the next run inheriting a stale emitter or
     * leaking an interval that keeps the process alive.
     */
    public Reset(): void {
        this.stopHeartbeat();
        this.emitter = null;
        this.currentRunID = null;
    }

    /** The observer to hand to {@link RuntimeSchemaManager.PipelineObserver}. */
    public readonly Observe = (event: RSUObserverEvent): void => {
        switch (event.Kind) {
            case 'run.start':
                return this.onRunStart(event);
            case 'step.start':
                return this.onStepStart(event);
            case 'step.end':
                return this.onStepEnd(event);
            case 'run.end':
                return this.onRunEnd(event);
        }
    };

    private onRunStart(event: Extract<RSUObserverEvent, { Kind: 'run.start' }>): void {
        // A retry re-enters RunPipelineBatch, so it legitimately starts a NEW run. If a previous
        // emitter is still open (a throw escaped before run.end), close it rather than leak it.
        if (this.emitter) this.closeCurrent('Superseded by a new RSU run');

        const runID = IntegrationProgressEmitter.newRunID('rsu');
        this.currentRunID = runID;
        this.emitter = new IntegrationProgressEmitter(
            {
                runID,
                runKind: 'RSU',
                triggerType: 'Pipeline',
                startedAt: new Date().toISOString(),
                context: {
                    itemCount: event.ItemCount,
                    descriptions: event.Descriptions,
                    affectedTables: event.AffectedTables,
                    stepTotal: event.StepTotal,
                },
            },
            this.emitterOptions,
        );
        this.emitter.runStart(
            `RSU pipeline started — ${event.ItemCount} migration(s), ${event.StepTotal} expected step(s): ` +
            event.Descriptions.join('; ')
        );
    }

    private onStepStart(event: Extract<RSUObserverEvent, { Kind: 'step.start' }>): void {
        if (!this.emitter) return;
        this.emitter.stageStart(event.Name, this.positionLabel(event.StepIndex, event.StepTotal));
        this.startHeartbeat(event.Name);
    }

    private onStepEnd(event: Extract<RSUObserverEvent, { Kind: 'step.end' }>): void {
        this.stopHeartbeat();
        if (!this.emitter) return;
        // A failed step is a stage error, not a stage completion — the run may still continue (a
        // per-item migration failure does not abort the batch), so this is deliberately not fatal.
        if (event.Status === 'failed') {
            this.emitter.stageError(event.Name, event.Message, { durationMs: event.DurationMs, code: 'RSU_STEP_FAILED' });
            return;
        }
        // Deliberately no `counts` here. Counts roll up into the run aggregate, and the countable
        // unit of an RSU run is MIGRATIONS, not steps — reporting "processed: 12" for a 12-step
        // single-migration run would read as 12 migrations. The run-level quartet is emitted once,
        // in onRunEnd. Step position lives in the stage name + the step.start message.
        this.emitter.stageComplete(event.Name);
    }

    private onRunEnd(event: Extract<RSUObserverEvent, { Kind: 'run.end' }>): void {
        this.stopHeartbeat();
        const emitter = this.emitter;
        if (!emitter) return;
        this.emitter = null;
        this.currentRunID = null;
        const summary = `${event.SuccessCount}/${event.TotalCount} migration(s) succeeded`;
        // The one authoritative applied quartet for the run, in migrations — this is what feeds
        // the reader's aggregateCounts.
        emitter.stageComplete(RUN_STAGE, {
            processed: event.TotalCount,
            succeeded: event.SuccessCount,
            failed: event.FailureCount,
            totalKnown: event.TotalCount,
        });
        // Terminal writes are async (they flush the JSONL + write result.json). The observer
        // contract is synchronous, so this is intentionally fire-and-forget with a logged catch —
        // a progress-artifact write must never surface as a pipeline failure.
        const terminal = event.Success
            ? emitter.complete(`RSU pipeline complete — ${summary}`)
            : emitter.fail(
                `RSU pipeline failed at '${event.ErrorStep ?? 'unknown step'}' — ${summary}: ` +
                `${event.ErrorMessage ?? 'no error message'}`,
                'rsu-pipeline-failed'
            );
        void terminal.catch(err => LogError(`RSUProgressBridge: terminal write failed — ${err}`));
    }

    /**
     * Starts reporting liveness for the step that just opened. Any previous timer is cleared first,
     * so a missed `step.end` can never leave two timers running.
     */
    private startHeartbeat(stage: string): void {
        this.stopHeartbeat();
        const startedAt = Date.now();
        this.heartbeat = setInterval(() => {
            const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
            this.emitter?.heartbeat(stage, `${stage} still running — ${elapsedSec}s elapsed`);
        }, HEARTBEAT_INTERVAL_MS);
        // Never hold the process open on a progress timer.
        this.heartbeat.unref?.();
    }

    /** Stops the liveness timer. Safe to call when none is running. */
    private stopHeartbeat(): void {
        if (!this.heartbeat) return;
        clearInterval(this.heartbeat);
        this.heartbeat = null;
    }

    /** Closes an orphaned emitter so a leaked run does not stay in-flight forever. */
    private closeCurrent(reason: string): void {
        this.stopHeartbeat();
        const emitter = this.emitter;
        this.emitter = null;
        this.currentRunID = null;
        void emitter?.fail(reason, 'rsu-run-abandoned')
            .catch(err => LogError(`RSUProgressBridge: abandon write failed — ${err}`));
    }

    /**
     * "step 4 of 12" — omitted entirely when the determinate counter isn't armed.
     *
     * Explicit null/undefined checks rather than truthiness: a 0 index is falsy, and silently
     * dropping the label for the first step of a 0-based counter would be a bug that only appears
     * if the pipeline's numbering ever changes.
     */
    private positionLabel(stepIndex?: number, stepTotal?: number): string | undefined {
        if (stepIndex == null || stepTotal == null) return undefined;
        return `step ${stepIndex} of ${stepTotal}`;
    }
}

/**
 * Attaches a fresh {@link RSUProgressBridge} to the RuntimeSchemaManager singleton. Call once at
 * server startup, after the progress publish hook is registered so the very first RSU event also
 * reaches live subscribers.
 *
 * @returns the bridge, so callers can read {@link RSUProgressBridge.CurrentRunID}.
 */
export function RegisterRSUProgressBridge(emitterOptions: EmitterOptions = {}): RSUProgressBridge {
    const bridge = RSUProgressBridge.Instance;
    bridge.Configure(emitterOptions);
    RuntimeSchemaManager.Instance.PipelineObserver = bridge.Observe;
    return bridge;
}
