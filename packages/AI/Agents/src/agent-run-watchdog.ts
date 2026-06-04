import { BaseSingleton, ShutdownRegistry, IShutdownable } from '@memberjunction/global';
import { DatabaseProviderBase, UserInfo, LogError, LogStatus } from '@memberjunction/core';

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
}

const DEFAULT_CONFIG: AgentRunWatchdogConfig = {
    heartbeatIntervalMs: 30_000,
    sweepIntervalMs: 5 * 60_000,
    staleThresholdMinutes: 5,
};

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
 *
 * Every proc filters `Status='Running'` only — `Paused` and `AwaitingFeedback` are
 * legitimately-not-progressing states and are never touched. The watchdog accesses the DB only
 * through these stored procedures (writes) and the base view (reads) — never the base table —
 * so it works as the regular runtime DB user, not just the elevated CodeGen user. Proc calls are
 * built through the provider's {@link Dialect.ProcedureCallSyntax}, so they run on SQL Server and
 * PostgreSQL unchanged.
 */
export class AgentRunWatchdog extends BaseSingleton<AgentRunWatchdog> implements IShutdownable {
    private _config: AgentRunWatchdogConfig = DEFAULT_CONFIG;
    private _trackedRuns = new Set<string>();
    private _provider: DatabaseProviderBase | null = null;
    private _contextUser: UserInfo | null = null;
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _sweepTimer: ReturnType<typeof setInterval> | null = null;
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
     * (so it has a stable ID). Idempotent per run ID. Capturing the provider/user lets the
     * central heartbeat + shutdown statements run without each run re-supplying them.
     */
    public Track(runID: string, provider: DatabaseProviderBase, contextUser: UserInfo): void {
        if (!runID || !UUID_RE.test(runID)) {
            return;
        }
        this._provider = provider;
        this._contextUser = contextUser;
        this._trackedRuns.add(runID.toLowerCase());
        this.ensureStarted();
    }

    /** Stop guarding a run. Optional — the periodic prune drops terminal runs automatically — but
     *  callers may invoke it for prompt cleanup right after writing a terminal state. */
    public Untrack(runID: string): void {
        if (runID) {
            this._trackedRuns.delete(runID.toLowerCase());
        }
    }

    /** Number of runs this process is currently guarding (primarily for tests/diagnostics). */
    public get TrackedCount(): number {
        return this._trackedRuns.size;
    }

    /**
     * IShutdownable: on graceful shutdown, mark every run this process still owns as `Cancelled`
     * (via {@link SP_CANCEL}) so it doesn't linger as a phantom `Running` row until the next sweep.
     * Idempotent and never throws — a failed cancel just falls through to the staleness sweep later.
     */
    public async Shutdown(): Promise<void> {
        this.stopTimers();
        const ids = this.trackedIds();
        this._trackedRuns.clear();
        if (!ids.length || !this._provider) {
            return;
        }
        const schema = AgentRunWatchdog.schemaOf(this._provider);
        if (!schema) {
            return;
        }
        const d = this._provider.Dialect;
        // One batched round-trip (one EXEC per id, newline-separated) rather than a call per run.
        const sql = AgentRunWatchdog.buildProcBatch(d, schema, SP_CANCEL, ids);
        try {
            await this._provider.ExecuteSQL(sql, undefined, { isMutation: true, description: 'AgentRunWatchdog graceful-shutdown cancel' }, this._contextUser ?? undefined);
        } catch (err) {
            LogError(`AgentRunWatchdog.Shutdown failed to cancel runs [${ids.join(', ')}]: ${err instanceof Error ? err.message : String(err)}`);
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
    }

    /** Stamp LastHeartbeatAt for every run this process is guarding, via {@link SP_HEARTBEAT}.
     *  Never throws (runs on a timer); a per-run failure is logged and the rest still beat. */
    private async heartbeat(): Promise<void> {
        if (!this._provider) {
            return;
        }
        const ids = this.trackedIds();
        if (!ids.length) {
            return;
        }
        const schema = AgentRunWatchdog.schemaOf(this._provider);
        if (!schema) {
            return;
        }
        const d = this._provider.Dialect;
        // One batched round-trip (one EXEC per id, newline-separated) rather than a call per run.
        const sql = AgentRunWatchdog.buildProcBatch(d, schema, SP_HEARTBEAT, ids);
        try {
            await this._provider.ExecuteSQL(sql, undefined, { isMutation: true, ignoreLogging: true, description: 'AgentRunWatchdog heartbeat' }, this._contextUser ?? undefined);
        } catch (err) {
            LogError(`AgentRunWatchdog heartbeat failed for runs [${ids.join(', ')}]: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Periodic tick: force-fail orphans, then prune any terminal runs out of the tracked set. */
    private async periodicSweep(): Promise<void> {
        if (!this._provider || !this._contextUser) {
            return;
        }
        await AgentRunWatchdog.SweepOrphanedRuns(this._provider, this._contextUser, this._config);
        await this.pruneTerminalRuns();
    }

    /**
     * Drop any tracked run that is no longer `Running` so the in-memory set can't grow unbounded
     * over a long-lived process. A single SELECT (against the base VIEW — the runtime user has no
     * table access) of the still-running subset; the rest are pruned.
     */
    private async pruneTerminalRuns(): Promise<void> {
        const ids = this.trackedIdList();
        if (!ids || !this._provider) {
            return;
        }
        const view = AgentRunWatchdog.viewOf(this._provider);
        if (!view) {
            return;
        }
        const d = this._provider.Dialect;
        try {
            const rows = await this._provider.ExecuteSQL<{ ID: string }>(
                `SELECT ${d.QuoteIdentifier('ID')} FROM ${view} ` +
                `WHERE ${d.QuoteIdentifier('Status')} = 'Running' AND ${d.QuoteIdentifier('ID')} IN (${ids});`,
                undefined, { ignoreLogging: true, description: 'AgentRunWatchdog tracked-set prune' }, this._contextUser ?? undefined);
            const stillRunning = new Set<string>();
            if (Array.isArray(rows)) {
                for (const row of rows) {
                    if (typeof row?.ID === 'string') {
                        stillRunning.add(row.ID.toLowerCase());
                    }
                }
            }
            for (const tracked of Array.from(this._trackedRuns)) {
                if (!stillRunning.has(tracked)) {
                    this._trackedRuns.delete(tracked);
                }
            }
        } catch (err) {
            LogError(`AgentRunWatchdog prune failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Validated, lowercased UUIDs this process is guarding (for per-run proc calls). */
    private trackedIds(): string[] {
        return Array.from(this._trackedRuns).filter(id => UUID_RE.test(id));
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
        return this.trackedIds().map(id => `'${id}'`).join(',');
    }

    /** Schema that owns the AIAgentRun objects (for qualifying proc calls), or null if unresolved. */
    private static schemaOf(provider: DatabaseProviderBase): string | null {
        const entity = provider.EntityByName(AGENT_RUN_ENTITY);
        return entity?.SchemaName || null;
    }

    /** Fully-qualified, dialect-quoted base VIEW for AIAgentRun reads, or null if unresolved. */
    private static viewOf(provider: DatabaseProviderBase): string | null {
        const entity = provider.EntityByName(AGENT_RUN_ENTITY);
        if (!entity || !entity.BaseView) {
            return null;
        }
        const d = provider.Dialect;
        return entity.SchemaName ? d.QuoteSchema(entity.SchemaName, entity.BaseView) : d.QuoteIdentifier(entity.BaseView);
    }
}
