/**
 * @fileoverview Per-session timers that assemble a client-direct realtime recording from its shard ledger
 * off the request path.
 *
 * The recording REST routes only record shards and the terminal signal; they never decode. When a route
 * learns a session is ready (every expected shard present) it asks for an assembly now; when shards are
 * missing it asks for one after the grace period, forced to `Partial`. This scheduler turns those requests
 * into at most one pending timer and at most one running assembly per session in this process.
 *
 * Correctness across processes does not depend on it: every run starts with the ledger's atomic
 * `ClaimAssembly`, so of two instances (or two timers) only the claim winner assembles. The per-session
 * guard here only avoids wasted claims. A run that dies with the process leaves the session `Assembling`,
 * and the session janitor's stale re-claim is the backstop for that and for any request dropped here.
 *
 * @module @memberjunction/server/realtimeSessions
 */
import { DatabaseProviderBase, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { BaseSingleton, IShutdownable, ShutdownRegistry } from '@memberjunction/global';
import {
    AssembleRealtimeRecordingFromLedger, AssembleRealtimeRecordingInput, AssembleRealtimeRecordingOutcome,
    IRealtimeRecordingLedger, SqlRealtimeRecordingLedger,
} from '@memberjunction/ai-agents';

/** A cancellable one-shot timer. */
export interface RecordingAssemblyTimer {
    Cancel(): void;
}

/** Time source of the scheduler; injectable so tests can drive it. */
export interface RecordingAssemblyClock {
    /** Milliseconds since the epoch. */
    Now(): number;
    /** Runs `callback` once after `delayMs`. The timer must not keep the process alive. */
    StartTimer(callback: () => void, delayMs: number): RecordingAssemblyTimer;
}

/** The narrow scheduling contract the recording routes depend on. */
export interface IRecordingAssemblyScheduler {
    /**
     * Requests an assembly of `sessionID` after `delayMs`. `forcePartial` assembles what exists even when
     * shards are missing (the grace period ran out). See {@link RecordingAssemblyScheduler.ScheduleAssembly}.
     */
    ScheduleAssembly(sessionID: string, delayMs: number, forcePartial: boolean): void;
}

/** What {@link RecordingAssemblyScheduler.Start} needs. */
export interface RecordingAssemblySchedulerOptions {
    /** The server's own provider; assembly is server-owned background work, not a request. */
    Provider: DatabaseProviderBase;
    /** The user assembly runs as (the system user). */
    SystemUser: UserInfo;
    /** Grace before a `Deferred` (incomplete) assembly is retried as forced `Partial`. */
    GraceMs: () => number;
    /** Defaults to {@link SqlRealtimeRecordingLedger}. */
    CreateLedger?: (provider: DatabaseProviderBase, contextUser: UserInfo) => IRealtimeRecordingLedger;
    /** Defaults to {@link AssembleRealtimeRecordingFromLedger}. */
    Assemble?: (input: AssembleRealtimeRecordingInput) => Promise<AssembleRealtimeRecordingOutcome>;
    /** Defaults to `Date.now` and unref'd `setTimeout`. */
    Clock?: RecordingAssemblyClock;
}

interface PendingAssembly {
    DueAt: number;
    ForcePartial: boolean;
    Timer: RecordingAssemblyTimer;
}

const NODE_CLOCK: RecordingAssemblyClock = {
    Now: () => Date.now(),
    StartTimer: (callback, delayMs) => {
        const handle = setTimeout(callback, delayMs);
        handle.unref?.();
        return { Cancel: () => clearTimeout(handle) };
    },
};

/**
 * Process-wide scheduler of recording assemblies (see the file overview). Call {@link Start} once at
 * server startup; requests made before it (or after {@link Shutdown}) are logged and dropped, leaving the
 * session to the janitor.
 */
export class RecordingAssemblyScheduler extends BaseSingleton<RecordingAssemblyScheduler> implements IShutdownable, IRecordingAssemblyScheduler {
    private _options: Required<RecordingAssemblySchedulerOptions> | null = null;
    private _registered = false;
    /** Pending timers keyed by lowercase session id. */
    private readonly pending = new Map<string, PendingAssembly>();
    /** Lowercase ids of sessions with an assembly running in this process. */
    private readonly running = new Set<string>();
    /** Sessions asked for again while running, with the ForcePartial to re-run with. */
    private readonly rerun = new Map<string, boolean>();

    protected constructor() {
        super();
    }

    /** Process-wide singleton accessor. */
    public static get Instance(): RecordingAssemblyScheduler {
        return super.getInstance<RecordingAssemblyScheduler>();
    }

    /** Identifier surfaced in graceful-shutdown logs. */
    public readonly ShutdownName = 'RecordingAssemblyScheduler';

    /** Configures the scheduler and enables it; calling again replaces the configuration. */
    public Start(options: RecordingAssemblySchedulerOptions): void {
        this._options = {
            CreateLedger: (provider, contextUser) => new SqlRealtimeRecordingLedger(provider, contextUser),
            Assemble: AssembleRealtimeRecordingFromLedger,
            Clock: NODE_CLOCK,
            ...options,
        };
        if (!this._registered) {
            ShutdownRegistry.Instance.Register(this);
            this._registered = true;
        }
    }

    /**
     * Requests an assembly of `sessionID` after `delayMs`. One pending timer per session: a request
     * replaces the pending one only when it would fire sooner (at the same time, the merged request keeps
     * `forcePartial` if either had it). A timer that fires while the session's previous run is still going
     * is remembered and run right after it, never alongside it.
     *
     * Trade-off: a sooner un-forced request replaces a pending forced one. If that run comes back
     * `Deferred` (still incomplete), the forced `Partial` is re-scheduled a full grace from then, so a
     * forced Partial can land up to ~2× the grace after the first terminal signal. Accepted: the sooner
     * run completes the recording outright whenever the missing shards did arrive.
     */
    public ScheduleAssembly(sessionID: string, delayMs: number, forcePartial: boolean): void {
        const options = this._options;
        if (!options) {
            LogError(`RecordingAssemblyScheduler: not running; dropped the assembly request for session ${sessionID} (the session janitor will assemble it)`);
            return;
        }
        const key = sessionID.toLowerCase();
        const dueAt = options.Clock.Now() + Math.max(0, delayMs);
        const existing = this.pending.get(key);
        if (existing && existing.DueAt < dueAt) {
            return;
        }
        if (existing && existing.DueAt === dueAt) {
            existing.ForcePartial = existing.ForcePartial || forcePartial;
            return;
        }
        existing?.Timer.Cancel();
        const timer = options.Clock.StartTimer(() => this.onTimer(key, sessionID), dueAt - options.Clock.Now());
        this.pending.set(key, { DueAt: dueAt, ForcePartial: forcePartial, Timer: timer });
    }

    /**
     * Cancels every pending timer and stops accepting requests until the next {@link Start}. A running
     * assembly is not awaited: if the process exits under it, the session stays `Assembling` and the
     * janitor's stale re-claim finishes it. Idempotent.
     */
    public Shutdown(): void {
        for (const entry of this.pending.values()) {
            entry.Timer.Cancel();
        }
        this.pending.clear();
        this.rerun.clear();
        this._options = null;
    }

    private onTimer(key: string, sessionID: string): void {
        const entry = this.pending.get(key);
        if (!entry) {
            return;
        }
        this.pending.delete(key);
        if (this.running.has(key)) {
            this.rerun.set(key, (this.rerun.get(key) ?? false) || entry.ForcePartial);
            return;
        }
        void this.runUntilSettled(key, sessionID, entry.ForcePartial);
    }

    /** Runs the session's assembly, then any re-run requested meanwhile. Never rejects. */
    private async runUntilSettled(key: string, sessionID: string, forcePartial: boolean): Promise<void> {
        this.running.add(key);
        try {
            let next: boolean | undefined = forcePartial;
            while (next !== undefined) {
                await this.runOnce(sessionID, next);
                next = this.rerun.get(key);
                this.rerun.delete(key);
            }
        } finally {
            this.running.delete(key);
        }
    }

    /** One claim + assembly. Logs every failure with the session id; never throws. */
    private async runOnce(sessionID: string, forcePartial: boolean): Promise<void> {
        const options = this._options;
        if (!options) {
            LogStatus(`RecordingAssemblyScheduler: shut down before session ${sessionID} could assemble; the session janitor will assemble it`);
            return;
        }
        try {
            const ledger = options.CreateLedger(options.Provider, options.SystemUser);
            const version = await ledger.ClaimAssembly(sessionID, null);
            if (version === null) {
                LogStatus(`RecordingAssemblyScheduler: session ${sessionID} not claimable (assembled, assembling elsewhere, or failed); skipping`);
                return;
            }
            const outcome = await options.Assemble({
                SessionID: sessionID, Version: version, Ledger: ledger,
                ContextUser: options.SystemUser, Provider: options.Provider, ForcePartial: forcePartial,
            });
            this.handleOutcome(sessionID, version, outcome, options);
        } catch (error) {
            LogError(`RecordingAssemblyScheduler: assembly of session ${sessionID} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private handleOutcome(
        sessionID: string,
        version: number,
        outcome: AssembleRealtimeRecordingOutcome,
        options: Required<RecordingAssemblySchedulerOptions>,
    ): void {
        if (outcome === 'Deferred') {
            // Incomplete and not forced: give missing shards the grace period, then assemble what exists.
            LogStatus(`RecordingAssemblyScheduler: session ${sessionID} (version ${version}) is missing shards; assembling as Partial after the grace period`);
            this.ScheduleAssembly(sessionID, options.GraceMs(), true);
            return;
        }
        if (outcome === 'Retry') {
            LogError(`RecordingAssemblyScheduler: assembly of session ${sessionID} (version ${version}) hit a transient error; the session janitor re-claims it later`);
            return;
        }
        LogStatus(`RecordingAssemblyScheduler: session ${sessionID} (version ${version}) assembly finished: ${outcome}`);
    }
}
