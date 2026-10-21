import { BaseSingleton, ShutdownRegistry, IShutdownable } from '@memberjunction/global';
import { DatabaseProviderBase, UserInfo, LogError, LogStatus, RunView } from '@memberjunction/core';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';

/** The provider's SQL dialect, referenced via indexed access so we don't take a direct
 *  dependency on `@memberjunction/sql-dialect` just to name the type. */
type Dialect = DatabaseProviderBase['Dialect'];

/**
 * Tuning for the agent-run watchdog. All durations are in their named units. Defaults are
 * deliberately conservative: the stale threshold is many heartbeat intervals wide, so a
 * momentarily-slow-but-alive process is never mistaken for a dead one.
 */
export interface AgentRunWatchdogConfig {
    /** How often the owning process stamps a liveness heartbeat for its in-flight runs. */
    heartbeatIntervalMs: number;
    /** How often this process re-scans for orphaned runs (mid-life, without waiting for a restart). */
    sweepIntervalMs: number;
    /** A Running run whose heartbeat is older than this (or NULL with an older StartedAt) is force-failed. */
    staleThresholdMinutes: number;
    /**
     * How often this process checks whether one of its in-flight runs was marked `Cancelled` from
     * outside (the Stop button writes the row; see {@link AgentRunWatchdog.Track}). Bounds how long
     * a stop takes to reach the running agent, so it is deliberately much shorter than the heartbeat.
     */
    cancellationPollIntervalMs: number;
}

const DEFAULT_CONFIG: AgentRunWatchdogConfig = {
    heartbeatIntervalMs: 30_000,
    sweepIntervalMs: 5 * 60_000,
    staleThresholdMinutes: 5,
    cancellationPollIntervalMs: 3_000,
};

/** The row shape the cancellation poll reads back from the AI Agent Runs view. */
interface CancelledRunRow {
    ID: string;
    CancellationReason: string | null;
}

/** Matches a canonical UUID. Tracked IDs come from provider-generated PKs, but we validate
 *  before ever interpolating into SQL so a proc argument can never become an injection vector. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The one MJ entity whose runs this watchdog guards. */
const AGENT_RUN_ENTITY = 'MJ: AI Agent Runs';

/** Dedicated maintenance stored procedures (see the watchdog sprocs migration). The runtime DB
 *  user has EXECUTE on these + SELECT on the base view, but no direct table access — so all of
 *  the watchdog's writes go through these procs and its reads go through the view. */
const SP_HEARTBEAT = 'spStampAIAgentRunHeartbeat';
const SP_SWEEP = 'spSweepStaleAIAgentRuns';
const SP_CANCEL = 'spCancelAIAgentRun';

/**
 * Process-wide watchdog that guarantees no `AIAgentRun` is left stuck in `Status='Running'`
 * after the owning process dies (restart, crash, OOM) or its terminal-state write fails.
 *
 * Three cooperating mechanisms, all anchored to the **database clock** so they remain correct
 * across multiple MJAPI instances behind a load balancer (no instance trusts its own clock):
 *
 * 1. **Heartbeat** — while a run is in flight, the owning process stamps `LastHeartbeatAt`
 *    every {@link AgentRunWatchdogConfig.heartbeatIntervalMs} via {@link SP_HEARTBEAT}.
 * 2. **Sweep** — {@link SweepOrphanedRuns} force-fails any `Running` run whose heartbeat has
 *    gone stale, via {@link SP_SWEEP} (one atomic, set-based `UPDATE … WHERE Status='Running'
 *    AND <stale>` inside the proc — so concurrent sweeps from multiple instances are harmless
 *    and a run another instance is still heart-beating can't be caught mid-sweep). Run once on
 *    boot (closes restart-orphans) and on a timer (closes mid-life orphans).
 * 3. **Graceful shutdown** — on SIGTERM/SIGINT (via {@link ShutdownRegistry}) this process marks
 *    the runs *it* owns `Cancelled` via {@link SP_CANCEL}, closing the deploy case instantly.
 * 4. **Stop relay** — the database row is also the control channel in the OTHER direction. A Stop
 *    button (or anything else) marks a Running row `Cancelled`; every
 *    {@link AgentRunWatchdogConfig.cancellationPollIntervalMs} this process reads back which of
 *    ITS runs were cancelled and aborts the `AbortController` the owning agent registered with
 *    {@link Track}. BaseAgent already checks that signal throughout its loop and forwards it into
 *    prompts and actions, so the in-flight step ends and the run finalizes as Cancelled. Because
 *    the row is the channel, the replica that owns the run is the one that reacts, with no
 *    cross-process messaging.
 *
 * Every proc filters `Status='Running'` only — `Paused` and `AwaitingFeedback` are
 * legitimately-not-progressing states and are never touched. The watchdog accesses the DB only
 * through these stored procedures (writes) and the base view (reads) — never the base table —
 * so it works as the regular runtime DB user, not just the elevated CodeGen user. Proc calls are
 * built through the provider's {@link Dialect.ProcedureCallSyntax}, so they run on SQL Server and
 * PostgreSQL unchanged.
 */
export class AgentRunWatchdog extends BaseSingleton<AgentRunWatchdog> implements IShutdownable {
    /**
     * The abort reason the stop relay raises when a run's row was marked `Cancelled` with
     * `CancellationReason = 'User Request'` (the Stop button). BaseAgent maps it back to the same
     * reason on the run it finalizes, so the row the UI wrote and the row the agent writes agree.
     */
    public static readonly UserCancelAbortReason = 'Cancelled by user request';

    /** The abort reason the stop relay raises for a row cancelled with any other reason. */
    public static readonly ExternalCancelAbortReason = 'Cancelled externally';

    private _config: AgentRunWatchdogConfig = DEFAULT_CONFIG;
    /** Guarded runs keyed by lowercased run ID, storing each run's own provider and contextUser for multi-tenant isolation. */
    private _trackedRuns = new Map<string, { provider: DatabaseProviderBase; contextUser: UserInfo }>();
    /** The abort controller each tracked run registered, keyed by lowercased run ID. */
    private _abortControllers = new Map<string, AbortController>();
    private _provider: DatabaseProviderBase | null = null;
    private _contextUser: UserInfo | null = null;
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _sweepTimer: ReturnType<typeof setInterval> | null = null;
    private _cancellationPollTimer: ReturnType<typeof setInterval> | null = null;
    private _cancellationPollInFlight = false;
    private _registered = false;

    protected constructor() {
        super();
    }

    public static get Instance(): AgentRunWatchdog {
        return super.getInstance<AgentRunWatchdog>();
    }

    public readonly ShutdownName = 'AgentRunWatchdog';

    /** Overrides the default tuning. Safe to call before or after runs start tracking. */
    public Configure(config: Partial<AgentRunWatchdogConfig>): void {
        this._config = { ...this._config, ...config };
    }

    /**
     * Begin guarding a run. The owning agent calls this immediately after the run row is saved
     * (so it has a stable ID). Idempotent per run ID. Capturing the provider/user per run lets the
     * central heartbeat + shutdown statements run against each run's own tenant provider and user.
     *
     * @param abortController The run's own abort controller. When supplied, the stop relay aborts
     *   it as soon as the run's row is seen marked `Cancelled` by someone else (the Stop button),
     *   with {@link UserCancelAbortReason} when the row says `User Request`. Without it the run
     *   is still heart-beaten and swept, but a stop cannot reach it.
     */
    public Track(runID: string, provider: DatabaseProviderBase, contextUser: UserInfo, abortController?: AbortController): void {
        if (!runID || !UUID_RE.test(runID)) {
            return;
        }
        const key = runID.toLowerCase();
        this._provider = provider;
        this._contextUser = contextUser;
        this._trackedRuns.set(key, { provider, contextUser });
        if (abortController) {
            this._abortControllers.set(key, abortController);
        }
        this.ensureStarted();
    }

    /** Stop guarding a run. Optional — the periodic prune drops terminal runs automatically — but
     *  callers may invoke it for prompt cleanup right after writing a terminal state. */
    public Untrack(runID: string): void {
        if (runID) {
            const key = runID.toLowerCase();
            this._trackedRuns.delete(key);
            this._abortControllers.delete(key);
            this.pauseActiveRunTimersIfIdle();
        }
    }

    /**
     * Abort a run this process owns, right now, without waiting for the poll. The in-process
     * counterpart of the row-driven relay: a caller that already knows the run was cancelled (a
     * resolver on the same replica, a test) can fire the signal directly.
     *
     * @returns true when a controller was registered for the run and had not already fired.
     */
    public RequestCancel(runID: string, reason: string = AgentRunWatchdog.UserCancelAbortReason): boolean {
        const controller = runID ? this._abortControllers.get(runID.toLowerCase()) : undefined;
        if (!controller || controller.signal.aborted) {
            return false;
        }
        controller.abort(reason);
        this.Untrack(runID);
        return true;
    }

    /** Whether a stop can reach this run from this process (a controller is registered for it). */
    public IsStoppable(runID: string): boolean {
        return !!runID && this._abortControllers.has(runID.toLowerCase());
    }

    /** Number of runs this process is currently guarding (primarily for tests/diagnostics). */
    public get TrackedCount(): number {
        return this._trackedRuns.size;
    }

    /**
     * Returns true when the heartbeat and cancellation-poll timers are currently active.
     * Exposed for diagnostics and tests verifying idle-timer suspension.
     */
    public get HasActiveRunTimers(): boolean {
        return this._heartbeatTimer !== null || this._cancellationPollTimer !== null;
    }

    /**
     * IShutdownable: on graceful shutdown, mark every run this process still owns as `Cancelled`
     * (via {@link SP_CANCEL}) so it doesn't linger as a phantom `Running` row until the next sweep.
     * Idempotent and never throws — a failed cancel just falls through to the staleness sweep later.
     */
    public async Shutdown(): Promise<void> {
        this.stopTimers();
        const groups = this.groupRunsByProvider(this.trackedIds());
        this._trackedRuns.clear();
        this._abortControllers.clear();
        for (const group of groups) {
            const schema = AgentRunWatchdog.schemaOf(group.provider);
            if (!schema) {
                continue;
            }
            const d = group.provider.Dialect;
            // One batched round-trip per provider (one EXEC per id, newline-separated) rather than a call per run.
            const sql = AgentRunWatchdog.buildProcBatch(d, schema, SP_CANCEL, group.ids);
            try {
                await group.provider.ExecuteSQL(sql, undefined, { isMutation: true, description: 'AgentRunWatchdog graceful-shutdown cancel' }, group.contextUser);
            } catch (err) {
                LogError(`AgentRunWatchdog.Shutdown failed to cancel runs [${group.ids.join(', ')}]: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Force-fail any `Running` agent run whose liveness heartbeat has gone stale (or that never
     * beat and was started long ago), via the dedicated {@link SP_SWEEP} proc. The proc does the
     * whole thing as one atomic, set-based `UPDATE` and returns the count, so it's safe to run on
     * every boot and on a timer, on every instance: the predicate is staleness-based (never "fail
     * all Running") and re-evaluated at write time, so it cannot touch a run a healthy instance is
     * still heart-beating. Returns the number of rows failed.
     */
    public static async SweepOrphanedRuns(
        provider: DatabaseProviderBase,
        contextUser: UserInfo,
        config?: Partial<AgentRunWatchdogConfig>,
    ): Promise<number> {
        const threshold = config?.staleThresholdMinutes ?? DEFAULT_CONFIG.staleThresholdMinutes;
        const schema = AgentRunWatchdog.schemaOf(provider);
        if (!schema) {
            LogError('AgentRunWatchdog.SweepOrphanedRuns: could not resolve the AIAgentRun schema from metadata; skipping sweep');
            return 0;
        }
        const d = provider.Dialect;
        try {
            // The proc runs the atomic UPDATE on the DB clock and returns RunsFailed.
            const sql = d.ProcedureCallSyntax(schema, SP_SWEEP, [String(Math.trunc(threshold))]) + ';';
            const rows = await provider.ExecuteSQL<{ RunsFailed: number }>(
                sql, undefined, { isMutation: true, description: 'AgentRunWatchdog stale-run sweep' }, contextUser);
            const failCount = (Array.isArray(rows) && rows[0] && typeof rows[0].RunsFailed === 'number') ? rows[0].RunsFailed : 0;
            if (failCount > 0) {
                LogStatus(`[AgentRunWatchdog] Swept ${failCount} orphaned agent run(s) -> Failed (no heartbeat for >${threshold}m)`);
            }
            return failCount;
        } catch (err) {
            LogError(`AgentRunWatchdog.SweepOrphanedRuns failed: ${err instanceof Error ? err.message : String(err)}`);
            return 0;
        }
    }

    // ----- internals -------------------------------------------------------------------------

    /** Start the heartbeat + sweep timers and register for graceful shutdown, exactly once. */
    private ensureStarted(): void {
        if (!this._registered) {
            ShutdownRegistry.Instance.Register(this);
            this._registered = true;
        }
        if (!this._heartbeatTimer) {
            this._heartbeatTimer = setInterval(() => void this.heartbeat(), this._config.heartbeatIntervalMs);
            // Don't keep the event loop alive solely for the watchdog.
            this._heartbeatTimer.unref?.();
        }
        if (!this._sweepTimer) {
            // The periodic sweep is an always-on in-process timer rather than an MJ Scheduled Job
            // (MJ: Scheduled Jobs / SchedulingEngine) on purpose. This is a reliability floor for
            // orphaned runs, and ScheduledJobsService is gated by `scheduledJobs.enabled` in config
            // — moving the sweep there would silently disable it in any deployment that runs with
            // scheduled jobs off, exactly where the safety net still needs to work. A Scheduled Job
            // could be added on top later as an observability/audit layer (it would call the same
            // idempotent SweepOrphanedRuns), but it must not be the only thing that runs it.
            this._sweepTimer = setInterval(() => void this.periodicSweep(), this._config.sweepIntervalMs);
            this._sweepTimer.unref?.();
        }
        if (!this._cancellationPollTimer && this._abortControllers.size > 0) {
            this._cancellationPollTimer = setInterval(() => void this.pollCancellations(), this._config.cancellationPollIntervalMs);
            this._cancellationPollTimer.unref?.();
        }
    }

    /**
     * Stop the high-frequency heartbeat and cancellation-poll timers when no runs are active
     * so idle servers don't wake up on 3s / 30s intervals. Calling `Track()` restarts them.
     */
    private pauseActiveRunTimersIfIdle(): void {
        if (this._abortControllers.size === 0 && this._cancellationPollTimer) {
            clearInterval(this._cancellationPollTimer);
            this._cancellationPollTimer = null;
        }
        if (this._trackedRuns.size === 0 && this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }

    private stopTimers(): void {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
        if (this._sweepTimer) {
            clearInterval(this._sweepTimer);
            this._sweepTimer = null;
        }
        if (this._cancellationPollTimer) {
            clearInterval(this._cancellationPollTimer);
            this._cancellationPollTimer = null;
        }
    }

    /** Stamp LastHeartbeatAt for every run this process is guarding, via {@link SP_HEARTBEAT}.
     *  Never throws (runs on a timer); a per-run failure is logged and the rest still beat. */
    private async heartbeat(): Promise<void> {
        const groups = this.groupRunsByProvider(this.trackedIds());
        for (const group of groups) {
            const schema = AgentRunWatchdog.schemaOf(group.provider);
            if (!schema) {
                continue;
            }
            const d = group.provider.Dialect;
            // One batched round-trip per provider (one EXEC per id, newline-separated) rather than a call per run.
            const sql = AgentRunWatchdog.buildProcBatch(d, schema, SP_HEARTBEAT, group.ids);
            try {
                await group.provider.ExecuteSQL(sql, undefined, { isMutation: true, ignoreLogging: true, description: 'AgentRunWatchdog heartbeat' }, group.contextUser);
            } catch (err) {
                LogError(`AgentRunWatchdog heartbeat failed for runs [${group.ids.join(', ')}]: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /** Periodic tick: force-fail orphans, then prune any terminal runs out of the tracked set. */
    private async periodicSweep(): Promise<void> {
        const groups = this.groupRunsByProvider(this.trackedIds());
        if (groups.length > 0) {
            for (const group of groups) {
                await AgentRunWatchdog.SweepOrphanedRuns(group.provider, group.contextUser, this._config);
            }
        } else if (this._provider && this._contextUser) {
            await AgentRunWatchdog.SweepOrphanedRuns(this._provider, this._contextUser, this._config);
        }
        await this.pruneTerminalRuns();
    }

    /**
     * The stop relay's read side. One RunView per (provider, contextUser) over the AI Agent Runs entity
     * for the tracked runs that have a registered controller and whose row is now `Cancelled`; each one
     * has its controller aborted with a reason derived from the row's `CancellationReason`, and leaves the
     * tracked set (the agent's own cancelled-result save follows). Runs without a controller are
     * left to the prune. Never throws (runs on a timer); overlapping ticks are skipped rather than
     * stacked.
     */
    private async pollCancellations(): Promise<void> {
        if (this._cancellationPollInFlight || this._abortControllers.size === 0) {
            return;
        }
        const groups = this.groupRunsByProviderAndUser(Array.from(this._abortControllers.keys()));
        if (groups.length === 0) {
            return;
        }
        this._cancellationPollInFlight = true;
        try {
            for (const group of groups) {
                const ids = AgentRunWatchdog.idList(group.ids);
                if (!ids) {
                    continue;
                }
                const rows = await this.readTrackedRunsForContext<CancelledRunRow>(
                    group.provider,
                    group.contextUser,
                    MJAIAgentRunEntityExtended.CancelledStatus,
                    ids,
                    ['ID', 'CancellationReason'],
                    'AgentRunWatchdog cancellation poll'
                );
                for (const row of rows) {
                    if (typeof row?.ID !== 'string') {
                        continue;
                    }
                    const reason = AgentRunWatchdog.abortReasonFor(row.CancellationReason);
                    if (this.RequestCancel(row.ID, reason)) {
                        LogStatus(`[AgentRunWatchdog] Run ${row.ID} was marked Cancelled (${row.CancellationReason ?? 'no reason'}); aborting the in-flight agent`);
                    }
                }
            }
        } catch (err) {
            LogError(`AgentRunWatchdog cancellation poll failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this._cancellationPollInFlight = false;
        }
    }

    /**
     * The tracked runs (among `ids`) whose row carries `status`, read through RunView against the
     * entity so the read goes where every other entity read goes: the entity's view, under the
     * tracked user's read permission, with the fields named. `ids` is the quoted, UUID-validated
     * list from {@link idList}. Reads the database, not the cache: the rows this looks for were
     * written moments ago by a Stop button or by the finishing agent.
     */
    private async readTrackedRunsForContext<T>(
        provider: DatabaseProviderBase,
        contextUser: UserInfo,
        status: string,
        ids: string,
        fields: string[],
        description: string
    ): Promise<T[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<T>({
            EntityName: AGENT_RUN_ENTITY,
            ExtraFilter: `Status='${status}' AND ID IN (${ids})`,
            Fields: fields,
            ResultType: 'simple',
            IgnoreMaxRows: true,
            BypassCache: true,
        }, contextUser);
        if (!result.Success) {
            throw new Error(result.ErrorMessage || `${description}: RunView failed`);
        }
        return Array.isArray(result.Results) ? result.Results : [];
    }

    /** Maps a run row's `CancellationReason` to the abort reason the owning agent will see. */
    private static abortReasonFor(cancellationReason: string | null): string {
        return cancellationReason === MJAIAgentRunEntityExtended.UserRequestCancellationReason ? AgentRunWatchdog.UserCancelAbortReason : AgentRunWatchdog.ExternalCancelAbortReason;
    }

    /**
     * Drop any tracked run that is no longer `Running` so the in-memory set can't grow unbounded
     * over a long-lived process. One RunView per (provider, contextUser) of the still-running subset;
     * the rest are pruned.
     */
    private async pruneTerminalRuns(): Promise<void> {
        const groups = this.groupRunsByProviderAndUser(this.trackedIds());
        if (groups.length === 0) {
            return;
        }
        try {
            for (const group of groups) {
                const ids = AgentRunWatchdog.idList(group.ids);
                if (!ids) {
                    continue;
                }
                const rows = await this.readTrackedRunsForContext<{ ID: string }>(
                    group.provider,
                    group.contextUser,
                    'Running',
                    ids,
                    ['ID'],
                    'AgentRunWatchdog tracked-set prune'
                );
                const stillRunning = new Set<string>();
                for (const row of rows) {
                    if (typeof row?.ID === 'string') {
                        stillRunning.add(row.ID.toLowerCase());
                    }
                }
                for (const tracked of group.ids) {
                    if (!stillRunning.has(tracked)) {
                        this._trackedRuns.delete(tracked);
                        this._abortControllers.delete(tracked);
                    }
                }
            }
            this.pauseActiveRunTimersIfIdle();
        } catch (err) {
            LogError(`AgentRunWatchdog prune failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Validated, lowercased UUIDs this process is guarding (for per-run proc calls). */
    private trackedIds(): string[] {
        return Array.from(this._trackedRuns.keys()).filter(id => UUID_RE.test(id));
    }

    /** Groups run IDs by their tracked `DatabaseProviderBase` so per-tenant DB connections stay isolated. */
    private groupRunsByProvider(runIds: string[]): Array<{ provider: DatabaseProviderBase; contextUser: UserInfo; ids: string[] }> {
        const groups = new Map<DatabaseProviderBase, { provider: DatabaseProviderBase; contextUser: UserInfo; ids: string[] }>();
        for (const id of runIds) {
            const entry = this._trackedRuns.get(id);
            if (!entry) continue;
            let group = groups.get(entry.provider);
            if (!group) {
                group = { provider: entry.provider, contextUser: entry.contextUser, ids: [] };
                groups.set(entry.provider, group);
            }
            group.ids.push(id);
        }
        return Array.from(groups.values());
    }

    /** Groups run IDs by `(provider, contextUser)` so `RunView` permission checks use each run's own user and provider. */
    private groupRunsByProviderAndUser(runIds: string[]): Array<{ provider: DatabaseProviderBase; contextUser: UserInfo; ids: string[] }> {
        const groups: Array<{ provider: DatabaseProviderBase; contextUser: UserInfo; ids: string[] }> = [];
        for (const id of runIds) {
            const entry = this._trackedRuns.get(id);
            if (!entry) continue;
            let group = groups.find(g => g.provider === entry.provider && g.contextUser === entry.contextUser);
            if (!group) {
                group = { provider: entry.provider, contextUser: entry.contextUser, ids: [] };
                groups.push(group);
            }
            group.ids.push(id);
        }
        return groups;
    }

    /**
     * Build a single batched SQL string of one proc call per id, newline-separated, so a set of
     * per-run writes goes to the DB as one round-trip instead of N. Each id is already a validated
     * UUID and is quoted as a string literal before interpolation. Runs unchanged on SQL Server and
     * PostgreSQL because the call form comes from {@link Dialect.ProcedureCallSyntax}.
     */
    private static buildProcBatch(d: Dialect, schema: string, proc: string, ids: string[]): string {
        return ids.map(id => d.ProcedureCallSyntax(schema, proc, [d.QuoteStringLiteral(id)]) + ';').join('\n');
    }

    /** Comma-joined, quoted, validated UUID list for an `ID IN (...)` clause, or '' if none. */
    private trackedIdList(): string {
        return AgentRunWatchdog.idList(this.trackedIds());
    }

    /** `ids` as a quoted SQL list, keeping only well-formed UUIDs: the values reach a filter string. */
    private static idList(ids: string[]): string {
        return ids.filter(id => UUID_RE.test(id)).map(id => `'${id}'`).join(',');
    }

    /** Schema that owns the AIAgentRun objects (for qualifying proc calls), or null if unresolved. */
    private static schemaOf(provider: DatabaseProviderBase): string | null {
        const entity = provider.EntityByName(AGENT_RUN_ENTITY);
        return entity?.SchemaName || null;
    }
}
