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
 *  before ever interpolating into SQL so the IN-list can never become an injection vector. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The one MJ entity whose runs this watchdog guards. */
const AGENT_RUN_ENTITY = 'MJ: AI Agent Runs';

/**
 * Process-wide watchdog that guarantees no `AIAgentRun` is left stuck in `Status='Running'`
 * after the owning process dies (restart, crash, OOM) or its terminal-state write fails.
 *
 * Three cooperating mechanisms, all anchored to the **database clock** so they remain correct
 * across multiple MJAPI instances behind a load balancer (no instance trusts its own clock):
 *
 * 1. **Heartbeat** — while a run is in flight, the owning process stamps `LastHeartbeatAt`
 *    every {@link AgentRunWatchdogConfig.heartbeatIntervalMs}. Liveness is *proven*, never assumed.
 * 2. **Sweep** — {@link SweepOrphanedRuns} force-fails any `Running` run whose heartbeat has
 *    gone stale. Run once on boot (closes restart-orphans) and on a timer (closes mid-life
 *    orphans). The `UPDATE ... WHERE Status='Running' AND <stale>` is atomic and idempotent,
 *    so concurrent sweeps from multiple instances are harmless.
 * 3. **Graceful shutdown** — on SIGTERM/SIGINT (via {@link ShutdownRegistry}) this process marks
 *    the runs *it* owns `Cancelled`, closing the deploy case instantly without waiting for staleness.
 *
 * Every statement filters `Status='Running'` only — `Paused` and `AwaitingFeedback` are
 * legitimately-not-progressing states and are never touched. All SQL is built through the
 * provider's {@link SQLDialect}, so it runs unmodified on SQL Server and PostgreSQL.
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
     * so it doesn't linger as a phantom `Running` row until the next sweep. Idempotent and
     * never throws — a failed cancel just falls through to the staleness sweep later.
     */
    public async Shutdown(): Promise<void> {
        this.stopTimers();
        const ids = this.trackedIdList();
        this._trackedRuns.clear();
        if (!ids || !this._provider) {
            return;
        }
        const d = this._provider.Dialect;
        const table = this.resolveTable(this._provider);
        if (!table) {
            return;
        }
        const reason = d.QuoteStringLiteral('[watchdog] Run orphaned by graceful process shutdown');
        const sql =
            `UPDATE ${table} SET ${d.QuoteIdentifier('Status')} = 'Cancelled', ` +
            `${d.QuoteIdentifier('CompletedAt')} = ${d.CurrentTimestampUTC()}, ` +
            `${d.QuoteIdentifier('ErrorMessage')} = ${d.Coalesce(d.QuoteIdentifier('ErrorMessage'), reason)} ` +
            `WHERE ${d.QuoteIdentifier('Status')} = 'Running' AND ${d.QuoteIdentifier('ID')} IN (${ids});`;
        try {
            await this._provider.ExecuteSQL(sql, undefined, { isMutation: true, description: 'AgentRunWatchdog graceful-shutdown cancel' }, this._contextUser ?? undefined);
        } catch (err) {
            LogError(`AgentRunWatchdog.Shutdown failed to cancel in-flight run(s): ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Force-fail any `Running` agent run whose liveness heartbeat has gone stale (or that never
     * beat and was started long ago). Safe to run on every boot and on a timer, on every instance:
     * the predicate is staleness-based (never "fail all Running"), so it cannot touch a run that a
     * healthy instance is still heart-beating. Returns the number of rows failed.
     */
    public static async SweepOrphanedRuns(
        provider: DatabaseProviderBase,
        contextUser: UserInfo,
        config?: Partial<AgentRunWatchdogConfig>,
    ): Promise<number> {
        const threshold = config?.staleThresholdMinutes ?? DEFAULT_CONFIG.staleThresholdMinutes;
        const table = AgentRunWatchdog.resolveTableStatic(provider);
        if (!table) {
            LogError('AgentRunWatchdog.SweepOrphanedRuns: could not resolve the AIAgentRun table from metadata; skipping sweep');
            return 0;
        }
        const d = provider.Dialect;
        // The cutoff is computed in JS and compared against DB-clock heartbeats. The only skew is
        // sweeper-process-vs-DB (NTP-synced, sub-second) against a minutes-wide threshold — immaterial.
        // Heartbeats themselves stay DB-clock, so heartbeats from different instances never disagree.
        const cutoffIso = new Date(Date.now() - threshold * 60_000).toISOString();
        const predicate = AgentRunWatchdog.stalePredicate(d, cutoffIso);
        try {
            // Count first (dialect-portable) so the log line is accurate without relying on
            // @@ROWCOUNT / RETURNING, which differ across platforms.
            const matches = await provider.ExecuteSQL<{ ID: string }>(
                `SELECT ${d.QuoteIdentifier('ID')} FROM ${table} WHERE ${predicate};`,
                undefined, { description: 'AgentRunWatchdog stale-run scan' }, contextUser);
            const failCount = Array.isArray(matches) ? matches.length : 0;
            if (failCount === 0) {
                return 0;
            }
            const reason = d.QuoteStringLiteral(`[watchdog] Run force-failed: no liveness heartbeat for over ${threshold} minute(s) (owning process presumed dead)`);
            const update =
                `UPDATE ${table} SET ${d.QuoteIdentifier('Status')} = 'Failed', ` +
                `${d.QuoteIdentifier('CompletedAt')} = ${d.CurrentTimestampUTC()}, ` +
                `${d.QuoteIdentifier('ErrorMessage')} = ${d.Coalesce(d.QuoteIdentifier('ErrorMessage'), reason)} ` +
                `WHERE ${predicate};`;
            await provider.ExecuteSQL(update, undefined, { isMutation: true, description: 'AgentRunWatchdog stale-run sweep' }, contextUser);
            LogStatus(`[AgentRunWatchdog] Swept ${failCount} orphaned agent run(s) -> Failed (no heartbeat for >${threshold}m)`);
            return failCount;
        } catch (err) {
            LogError(`AgentRunWatchdog.SweepOrphanedRuns failed: ${err instanceof Error ? err.message : String(err)}`);
            return 0;
        }
    }

    // ----- internals -------------------------------------------------------------------------

    /** The shared `Status='Running' AND <heartbeat stale>` predicate used by scan + update. */
    private static stalePredicate(d: Dialect, cutoffIso: string): string {
        const cutoff = d.QuoteStringLiteral(cutoffIso);
        const hb = d.QuoteIdentifier('LastHeartbeatAt');
        const started = d.QuoteIdentifier('StartedAt');
        return (
            `${d.QuoteIdentifier('Status')} = 'Running' AND (` +
            `${hb} < ${cutoff} OR (${hb} IS NULL AND ${started} < ${cutoff}))`
        );
    }

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

    /** Stamp LastHeartbeatAt for every run this process is guarding. Never throws (runs on a timer). */
    private async heartbeat(): Promise<void> {
        const ids = this.trackedIdList();
        if (!ids || !this._provider) {
            return;
        }
        const d = this._provider.Dialect;
        const table = this.resolveTable(this._provider);
        if (!table) {
            return;
        }
        const sql =
            `UPDATE ${table} SET ${d.QuoteIdentifier('LastHeartbeatAt')} = ${d.CurrentTimestampUTC()} ` +
            `WHERE ${d.QuoteIdentifier('Status')} = 'Running' AND ${d.QuoteIdentifier('ID')} IN (${ids});`;
        try {
            await this._provider.ExecuteSQL(sql, undefined, { isMutation: true, ignoreLogging: true, description: 'AgentRunWatchdog heartbeat' }, this._contextUser ?? undefined);
        } catch (err) {
            LogError(`AgentRunWatchdog heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
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
     * over a long-lived process. A single SELECT of the still-running subset; the rest are pruned.
     */
    private async pruneTerminalRuns(): Promise<void> {
        const ids = this.trackedIdList();
        if (!ids || !this._provider) {
            return;
        }
        const d = this._provider.Dialect;
        const table = this.resolveTable(this._provider);
        if (!table) {
            return;
        }
        try {
            const rows = await this._provider.ExecuteSQL<{ ID: string }>(
                `SELECT ${d.QuoteIdentifier('ID')} FROM ${table} ` +
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

    /** Comma-joined, quoted, validated UUID list for an `ID IN (...)` clause, or '' if none. */
    private trackedIdList(): string {
        return Array.from(this._trackedRuns)
            .filter(id => UUID_RE.test(id))
            .map(id => `'${id}'`)
            .join(',');
    }

    private resolveTable(provider: DatabaseProviderBase): string | null {
        return AgentRunWatchdog.resolveTableStatic(provider);
    }

    private static resolveTableStatic(provider: DatabaseProviderBase): string | null {
        const entity = provider.EntityByName(AGENT_RUN_ENTITY);
        if (!entity || !entity.BaseTable) {
            return null;
        }
        const d = provider.Dialect;
        return entity.SchemaName ? d.QuoteSchema(entity.SchemaName, entity.BaseTable) : d.QuoteIdentifier(entity.BaseTable);
    }
}
