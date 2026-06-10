import { BaseSingleton, ShutdownRegistry, IShutdownable } from '@memberjunction/global';
import {
    IMetadataProvider,
    UserInfo,
    CompositeKey,
    RunView,
    RunViewParams,
    LogError,
    LogStatus,
} from '@memberjunction/core';
import { MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { GetHostInstanceID, GetHostNamePrefix } from './HostInstance.js';
import { SessionManager, SessionCloseReason } from './SessionManager.js';

/** Entity name for session rows (kept in sync with {@link SessionManager}). */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';

/** Rows fetched per keyset page during a sweep. Small enough to bound memory on a large backlog. */
const SWEEP_PAGE_SIZE = 200;

/** Tuning knobs for the janitor. All durations in their named units. */
export interface SessionJanitorConfig {
    /** A non-`Closed` session whose `LastActiveAt` is older than this is force-closed by the global sweep. */
    closeThresholdMinutes: number;
    /** How often the periodic staleness sweep runs once {@link SessionJanitor.Start} is called. */
    sweepIntervalMs: number;
}

const DEFAULT_CONFIG: SessionJanitorConfig = {
    closeThresholdMinutes: 15,
    sweepIntervalMs: 60_000,
};

/**
 * `BaseSingleton` background reconciler that keeps the durable `AIAgentSession` state from drifting
 * away from volatile process reality. A crash/redeploy vaporizes a host's in-memory sockets but
 * leaves its session rows reading `Active`/`Idle` forever; the janitor force-closes those orphans.
 *
 * Two sweeps, both writing through {@link SessionManager.CloseSession} so Record Changes captures
 * each transition and channel rows are disconnected consistently:
 *
 * 1. **Own-host recovery ({@link RunStartupRecovery})** — run once at boot. Closes any `Active`/`Idle`
 *    session whose `HostInstanceID` belongs to a *previous* boot of *this* host (same hostname prefix,
 *    different `bootId`). Primary defense against the "Active forever" leak after a restart.
 * 2. **Global staleness sweep ({@link RunStalenessSweep})** — run periodically on every instance.
 *    Closes any `Active`/`Idle` session whose `LastActiveAt` is older than `closeThresholdMinutes`,
 *    regardless of host. Catches sessions whose owner died without a clean reboot (OOM, scaled-down pod).
 *
 * Both sweeps stamp `CloseReason = 'Janitor'`. A third, shutdown-time path —
 * {@link RunShutdownDrain}, invoked from {@link Shutdown} during the graceful ShutdownRegistry
 * drain — closes this exact host instance's own live sessions with `CloseReason = 'Shutdown'`.
 *
 * Both sweeps are **idempotent and safe to run concurrently** on every instance: closing an
 * already-`Closed` session is a no-op, and the close path is last-writer-wins. Both page with keyset
 * (`AfterKey`) pagination per the deep-pagination guide so a large backlog can't blow up memory.
 */
export class SessionJanitor extends BaseSingleton<SessionJanitor> implements IShutdownable {
    private _config: SessionJanitorConfig = DEFAULT_CONFIG;
    private _sweepTimer: ReturnType<typeof setInterval> | null = null;
    private _sweepRunning = false;
    private _registered = false;
    private _provider: IMetadataProvider | null = null;
    private _systemUser: UserInfo | null = null;
    private readonly sessionManager = new SessionManager();

    protected constructor() {
        super();
    }

    /** Process-wide singleton accessor (Global Object Store backed via {@link BaseSingleton}). */
    public static get Instance(): SessionJanitor {
        return super.getInstance<SessionJanitor>();
    }

    /** Identifier surfaced in graceful-shutdown logs. */
    public readonly ShutdownName = 'SessionJanitor';

    /** Overrides default tuning. Safe to call before or after {@link Start}. */
    public Configure(config: Partial<SessionJanitorConfig>): void {
        this._config = { ...this._config, ...config };
    }

    /**
     * Run own-host startup recovery once, then schedule the periodic staleness sweep. Idempotent:
     * a second call does not stack a second timer. Captures the provider + system user so the timer
     * callback can run without re-supplying them.
     */
    public async Start(provider: IMetadataProvider, systemUser: UserInfo, intervalMs?: number): Promise<void> {
        this._provider = provider;
        this._systemUser = systemUser;
        if (intervalMs != null) {
            this._config = { ...this._config, sweepIntervalMs: intervalMs };
        }
        this.ensureRegistered();
        await this.RunStartupRecovery(provider, systemUser);
        this.scheduleSweep();
    }

    /** Stops the periodic sweep timer. Idempotent. Part of {@link IShutdownable}. */
    public Stop(): void {
        if (this._sweepTimer) {
            clearInterval(this._sweepTimer);
            this._sweepTimer = null;
        }
    }

    /**
     * {@link IShutdownable}: clear the timer, then drain this host's own live sessions so a
     * graceful stop never strands `Active`/`Idle` rows for the next boot's janitor to mop up.
     * Drained sessions are stamped `CloseReason = 'Shutdown'` (vs. `'Janitor'` for crash orphans),
     * so the dashboards can tell a clean redeploy from a reconciled crash. Never throws; the drain
     * is skipped when {@link Start} was never called (no captured provider/user).
     */
    public async Shutdown(): Promise<void> {
        this.Stop();
        if (this._provider && this._systemUser) {
            try {
                await this.RunShutdownDrain(this._provider, this._systemUser);
            } catch (err) {
                LogError(`SessionJanitor shutdown drain failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Close every `Active`/`Idle` session owned by **this exact host instance** (current boot),
     * stamping `CloseReason = 'Shutdown'`. Invoked from {@link Shutdown} during the graceful
     * shutdown drain; exposed publicly for tests and for hosts that want to drain explicitly.
     * Returns the number of sessions closed.
     */
    public async RunShutdownDrain(provider: IMetadataProvider, systemUser: UserInfo): Promise<number> {
        const current = GetHostInstanceID().replace(/'/g, "''");
        const filter = `Status IN ('Active','Idle') AND HostInstanceID = '${current}'`;
        const closed = await this.sweepAndClose(filter, provider, systemUser, 'Shutdown');
        if (closed > 0) {
            LogStatus(`[SessionJanitor] Shutdown drain closed ${closed} live session(s) owned by this host instance`);
        }
        return closed;
    }

    /**
     * Force-close any `Active`/`Idle` session left behind by a *previous boot of this host*
     * (matching hostname prefix, differing `bootId`). Returns the number of sessions closed.
     */
    public async RunStartupRecovery(provider: IMetadataProvider, systemUser: UserInfo): Promise<number> {
        const prefix = GetHostNamePrefix().replace(/'/g, "''");
        const current = GetHostInstanceID().replace(/'/g, "''");
        const filter =
            `Status IN ('Active','Idle') ` +
            `AND HostInstanceID LIKE '${prefix}%' ` +
            `AND HostInstanceID <> '${current}'`;
        const closed = await this.sweepAndClose(filter, provider, systemUser, 'Janitor');
        if (closed > 0) {
            LogStatus(`[SessionJanitor] Startup recovery closed ${closed} orphaned session(s) from a prior boot of this host`);
        }
        return closed;
    }

    /**
     * Force-close any `Active`/`Idle` session whose `LastActiveAt` is older than the configured
     * close threshold, regardless of host. Idempotent and concurrency-safe. Returns the count closed.
     */
    public async RunStalenessSweep(provider: IMetadataProvider, systemUser: UserInfo): Promise<number> {
        const cutoffIso = new Date(Date.now() - this._config.closeThresholdMinutes * 60_000).toISOString();
        const filter = `Status IN ('Active','Idle') AND LastActiveAt < '${cutoffIso}'`;
        const closed = await this.sweepAndClose(filter, provider, systemUser, 'Janitor');
        if (closed > 0) {
            LogStatus(`[SessionJanitor] Staleness sweep closed ${closed} stale session(s) (>${this._config.closeThresholdMinutes}m idle)`);
        }
        return closed;
    }

    // ----- internals -------------------------------------------------------------------------

    /** Register for graceful shutdown exactly once. */
    private ensureRegistered(): void {
        if (!this._registered) {
            ShutdownRegistry.Instance.Register(this);
            this._registered = true;
        }
    }

    /** Schedule the periodic staleness sweep, exactly once. Timer is unref'd so it never blocks exit. */
    private scheduleSweep(): void {
        if (this._sweepTimer) {
            return;
        }
        this._sweepTimer = setInterval(() => void this.periodicSweep(), this._config.sweepIntervalMs);
        this._sweepTimer.unref?.();
    }

    /** Timer tick: run the staleness sweep under the captured provider/user, guarding overlap. */
    private async periodicSweep(): Promise<void> {
        if (this._sweepRunning || !this._provider || !this._systemUser) {
            return;
        }
        this._sweepRunning = true;
        try {
            await this.RunStalenessSweep(this._provider, this._systemUser);
        } catch (err) {
            LogError(`SessionJanitor periodic sweep failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this._sweepRunning = false;
        }
    }

    /**
     * Page through every session matching `filter` with keyset (`AfterKey`) pagination and close each
     * via {@link SessionManager.CloseSession}, stamping `closeReason` on every row it transitions.
     * Returns the number successfully closed. A `Closed`-by-now row (raced by another instance) is a
     * harmless no-op that keeps its original reason.
     */
    private async sweepAndClose(
        filter: string,
        provider: IMetadataProvider,
        systemUser: UserInfo,
        closeReason: SessionCloseReason,
    ): Promise<number> {
        let closedCount = 0;
        let afterKey: CompositeKey | undefined;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const page = await this.fetchPage(filter, afterKey, provider, systemUser);
            if (page == null) {
                break; // load failure already logged
            }
            if (page.length === 0) {
                break;
            }
            for (const session of page) {
                const closed = await this.sessionManager.CloseSession(session.ID, systemUser, provider, closeReason);
                if (closed) {
                    closedCount++;
                }
            }
            if (page.length < SWEEP_PAGE_SIZE) {
                break; // partial page => end of data
            }
            afterKey = CompositeKey.FromID(page[page.length - 1].ID);
        }
        return closedCount;
    }

    /** Fetch one keyset page of matching sessions, or null on a load failure (logged). */
    private async fetchPage(
        filter: string,
        afterKey: CompositeKey | undefined,
        provider: IMetadataProvider,
        systemUser: UserInfo,
    ): Promise<MJAIAgentSessionEntity[] | null> {
        const params: RunViewParams = {
            EntityName: SESSION_ENTITY,
            ExtraFilter: filter,
            AfterKey: afterKey,
            MaxRows: SWEEP_PAGE_SIZE,
            ResultType: 'entity_object',
        };
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJAIAgentSessionEntity>(params, systemUser);
        if (!result.Success) {
            LogError(`SessionJanitor sweep load failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results;
    }
}
