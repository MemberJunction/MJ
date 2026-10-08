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
import { MJAIAgentEntity, MJAIAgentSessionEntity } from '@memberjunction/core-entities';
import { RecoverRealtimeRecordingFromSegments, ResolveRecordingStorageAccountID } from '@memberjunction/ai-agents';
import { GetHostInstanceID, GetHostNamePrefix } from './HostInstance.js';
import { SessionManager, SessionCloseReason } from './SessionManager.js';

/** Entity name for session rows (kept in sync with {@link SessionManager}). */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';

/** Rows fetched per keyset page during a sweep. Small enough to bound memory on a large backlog. */
const SWEEP_PAGE_SIZE = 200;

/** Entity name for agent rows (the recording storage account is configured on the agent). */
const AGENT_ENTITY = 'MJ: AI Agents';

/** A session whose recording recovery has failed this many times is given up on for the life of the process. */
const MAX_RECOVERY_ATTEMPTS = 8;

/** Recovery attempts (calls into the recovery routine) per sweep; bounds the I/O one tick can trigger. */
const MAX_RECOVERIES_PER_SWEEP = 5;

/** Backoff after the k-th failed recovery is `2^k * base`, capped at the max. */
const RECOVERY_BACKOFF_BASE_MS = 5 * 60_000;
const RECOVERY_BACKOFF_MAX_MS = 6 * 60 * 60_000;

/** Tuning knobs for the janitor. All durations in their named units. */
export interface SessionJanitorConfig {
    /** A non-`Closed` session whose `LastActiveAt` is older than this is force-closed by the global sweep. */
    closeThresholdMinutes: number;
    /** How often the periodic staleness sweep runs once {@link SessionJanitor.Start} is called. */
    sweepIntervalMs: number;
    /**
     * How long after `ClosedAt` a recording-less session waits before recording recovery rebuilds it.
     * Sessions are closed BEFORE the browser uploads the recording (#5195), so a fresh close without a
     * recording is normal; recovery must not race the upload that is about to arrive.
     */
    recordingRecoveryGraceMinutes: number;
    /** Sessions closed longer ago than this are no longer considered by recording recovery. */
    recordingRecoveryLookbackHours: number;
}

const DEFAULT_CONFIG: SessionJanitorConfig = {
    closeThresholdMinutes: 15,
    sweepIntervalMs: 60_000,
    recordingRecoveryGraceMinutes: 10,
    recordingRecoveryLookbackHours: 168,
};

/** Per-session recovery retry state (process-local). */
interface RecoveryBackoff {
    Failures: number;
    /** Epoch ms before which the session is not retried; `Infinity` once given up. */
    NextAttemptAt: number;
}

/** Per-sweep working state shared by every candidate in one recovery pass. */
interface RecoverySweepContext {
    provider: IMetadataProvider;
    systemUser: UserInfo;
    /** Per-agent storage resolution this sweep, by lowercase agent id, so each agent costs one load + one resolve. */
    storage: Map<string, RecoveryStorage>;
}

/** Outcome of resolving where an agent's recordings live. */
type RecoveryStorage =
    | { Kind: 'Resolved'; AccountID: string }
    | { Kind: 'NoAccount' }
    | { Kind: 'AgentUnavailable' };

/** What one candidate cost the sweep: `Attempted` = the recovery routine was called (counts against the cap). */
interface RecoveryVisit {
    Attempted: boolean;
    Recovered: boolean;
}

/**
 * `BaseSingleton` background reconciler that keeps the durable `AIAgentSession` state from drifting
 * away from volatile process reality. A crash/redeploy vaporizes a host's in-memory sockets but
 * leaves its session rows reading `Active`/`Idle` forever; the janitor force-closes those orphans.
 *
 * Two close sweeps, both writing through {@link SessionManager.CloseSession} so Record Changes captures
 * each transition and channel rows are disconnected consistently (a third, {@link RunMaxDurationSweep},
 * enforces the hard duration cap the same way):
 *
 * 1. **Own-host recovery ({@link RunStartupRecovery})** — run once at boot. Closes any `Active`/`Idle`
 *    session whose `HostInstanceID` belongs to a *previous* boot of *this* host (same hostname prefix,
 *    different `bootId`). Primary defense against the "Active forever" leak after a restart.
 * 2. **Global staleness sweep ({@link RunStalenessSweep})** — run periodically on every instance.
 *    Closes any `Active`/`Idle` session whose `LastActiveAt` is older than `closeThresholdMinutes`,
 *    regardless of host. Catches sessions whose owner died without a clean reboot (OOM, scaled-down pod).
 *
 * Separately from closing, {@link RunRecordingRecoverySweep} runs on every periodic tick and rebuilds
 * the recording of already-`Closed` sessions whose end-of-call upload never arrived (it closes nothing).
 *
 * The close sweeps stamp `CloseReason = 'Janitor'`. A third, shutdown-time path —
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
    /** Separate from {@link _sweepRunning}: slow recording recovery must never block the close sweeps. */
    private _recoveryRunning = false;
    private _registered = false;
    private _provider: IMetadataProvider | null = null;
    private _systemUser: UserInfo | null = null;
    private readonly sessionManager = new SessionManager();
    /** Recovery retry state keyed by lowercase session id. Process-local: a restart gets fresh attempts. */
    private readonly recoveryBackoff = new Map<string, RecoveryBackoff>();

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

    /**
     * Server-authoritative MAX-DURATION enforcement (public web-widget voice cap, public-web-widget.md
     * W4). Closes any `Active`/`Idle` session whose stored absolute deadline (`Config_.maxSessionDeadlineIso`)
     * has passed — a hard wall-clock ceiling that fires regardless of activity, so a public voice guest
     * cannot run a session indefinitely (cost-bombing) even if the client ignores its own abuse guard.
     *
     * Only sessions that CARRY a deadline are loaded (a cheap `Config_ LIKE` pre-filter), then the exact
     * ISO deadline is parsed and compared in JS (`Config_` is JSON, not a queryable column). Stamped
     * `CloseReason = 'Janitor'`, idempotent + concurrency-safe like the other sweeps. Returns the count closed.
     */
    public async RunMaxDurationSweep(provider: IMetadataProvider, systemUser: UserInfo): Promise<number> {
        const nowMs = Date.now();
        // Only consider sessions that carry a deadline marker — keeps this sweep cheap (it never touches
        // the far-more-common uncapped sessions) while the JS check below enforces the exact deadline.
        const filter = `Status IN ('Active','Idle') AND Config LIKE '%maxSessionDeadlineIso%'`;
        const isExpired = (session: MJAIAgentSessionEntity): boolean => {
            const deadlineMs = this.parseSessionDeadlineMs(session.Config_);
            return deadlineMs != null && deadlineMs <= nowMs;
        };
        const closed = await this.sweepAndClose(filter, provider, systemUser, 'Janitor', isExpired);
        if (closed > 0) {
            LogStatus(`[SessionJanitor] Max-duration sweep closed ${closed} session(s) past their hard duration cap`);
        }
        return closed;
    }

    /**
     * Rebuilds the recording of sessions whose end-of-call upload never arrived (browser died, tab
     * closed). A session is a candidate when it is `Closed`, has `RecordingStartedAt` (consent is implied:
     * recording only starts after the guest agreed), still has no `RecordingFileID`, and closed between
     * the lookback window and the grace period (see {@link SessionJanitorConfig.recordingRecoveryGraceMinutes}).
     *
     * Work is bounded: candidates are handled sequentially, at most {@link MAX_RECOVERIES_PER_SWEEP}
     * recovery attempts per call, and a failing session backs off exponentially (`min(2^k * 5 min, 6 h)`)
     * and is abandoned after {@link MAX_RECOVERY_ATTEMPTS} failures with one `LogError`. Backoff entries of
     * sessions that left the candidate set are pruned, but only after a pass that saw every candidate, so
     * a capped pass never forgets sessions it did not reach.
     *
     * Never throws for a single bad session. Returns the number of recordings recovered.
     */
    public async RunRecordingRecoverySweep(provider: IMetadataProvider, systemUser: UserInfo): Promise<number> {
        const nowMs = Date.now();
        const graceCutoff = new Date(nowMs - this._config.recordingRecoveryGraceMinutes * 60_000).toISOString();
        const lookbackCutoff = new Date(nowMs - this._config.recordingRecoveryLookbackHours * 3_600_000).toISOString();
        const filter =
            `Status = 'Closed' AND RecordingStartedAt IS NOT NULL AND RecordingFileID IS NULL ` +
            `AND ClosedAt < '${graceCutoff}' AND ClosedAt >= '${lookbackCutoff}'`;

        const context: RecoverySweepContext = { provider, systemUser, storage: new Map() };
        const seen = new Set<string>();
        let attempts = 0;
        let recovered = 0;

        const walk = await this.forEachSessionPage(filter, provider, systemUser, async page => {
            for (const session of page) {
                seen.add(session.ID.toLowerCase());
                if (this.isRecoveryBackedOff(session.ID)) {
                    continue;
                }
                if (attempts >= MAX_RECOVERIES_PER_SWEEP) {
                    return false; // cap reached: stop paging
                }
                const visit = await this.recoverSessionRecording(session, context);
                attempts += visit.Attempted ? 1 : 0;
                recovered += visit.Recovered ? 1 : 0;
            }
        });

        // Only a walk that reached the end saw every candidate. A capped or failed-load walk has an
        // incomplete `seen`; pruning on it would wipe backoff and give-up state for unseen sessions.
        if (walk === 'complete') {
            this.pruneRecoveryBackoff(seen);
        }
        if (recovered > 0) {
            LogStatus(`[SessionJanitor] Recording recovery rebuilt ${recovered} recording(s)`);
        }
        return recovered;
    }

    /** Parses the absolute deadline (ms) from a session's `Config_` JSON, or null when absent/malformed. */
    private parseSessionDeadlineMs(configJson: string | null | undefined): number | null {
        if (!configJson) {
            return null;
        }
        try {
            const parsed = JSON.parse(configJson) as { maxSessionDeadlineIso?: string };
            if (typeof parsed.maxSessionDeadlineIso !== 'string') {
                return null;
            }
            const ms = Date.parse(parsed.maxSessionDeadlineIso);
            return Number.isNaN(ms) ? null : ms;
        } catch {
            return null;
        }
    }

    // ----- internals -------------------------------------------------------------------------

    /** Register for graceful shutdown exactly once. */
    private ensureRegistered(): void {
        if (!this._registered) {
            ShutdownRegistry.Instance.Register(this);
            this._registered = true;
        }
    }

    /** Schedule the periodic sweep tick (close sweeps + recording recovery), exactly once. Timer is unref'd so it never blocks exit. */
    private scheduleSweep(): void {
        if (this._sweepTimer) {
            return;
        }
        this._sweepTimer = setInterval(() => void this.periodicSweep(), this._config.sweepIntervalMs);
        this._sweepTimer.unref?.();
    }

    /**
     * Timer tick: run the close sweeps (staleness, then max-duration) under the captured
     * provider/user, guarding overlap, then kick off recording recovery.
     *
     * Recovery is started WITHOUT awaiting and has its own overlap guard: it can spend minutes on
     * large downloads/uploads, and awaiting it under the close sweeps' guard would delay the
     * max-duration cost cap and make every later tick return early. A slow recovery therefore skips
     * only the next recovery pass.
     */
    private async periodicSweep(): Promise<void> {
        if (this._sweepRunning || !this._provider || !this._systemUser) {
            return;
        }
        this._sweepRunning = true;
        try {
            await this.RunStalenessSweep(this._provider, this._systemUser);
            // Hard wall-clock cap (public web-widget voice). Runs alongside the idle sweep so a capped
            // session is finalized within one sweep interval of its deadline even if it's still "active".
            await this.RunMaxDurationSweep(this._provider, this._systemUser);
        } catch (err) {
            LogError(`SessionJanitor periodic sweep failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this._sweepRunning = false;
        }
        this.startRecoveryPass(this._provider, this._systemUser);
    }

    /** Fire-and-forget recording recovery, skipped when the previous pass is still running. */
    private startRecoveryPass(provider: IMetadataProvider, systemUser: UserInfo): void {
        if (this._recoveryRunning) {
            return;
        }
        this._recoveryRunning = true;
        this.RunRecordingRecoverySweep(provider, systemUser)
            .catch(err => {
                LogError(`SessionJanitor recording recovery sweep failed: ${err instanceof Error ? err.message : String(err)}`);
            })
            .finally(() => {
                this._recoveryRunning = false;
            });
    }

    /**
     * Recovers one candidate's recording and updates its backoff. Never throws: any exception is logged
     * with the session id and counted as a failure.
     */
    private async recoverSessionRecording(candidate: MJAIAgentSessionEntity, context: RecoverySweepContext): Promise<RecoveryVisit> {
        let attempted = false;
        try {
            // Re-read: the late upload may have landed since the candidate page was fetched.
            const session = await context.provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, context.systemUser);
            if (!(await session.Load(candidate.ID))) {
                LogError(`[SessionJanitor] Recording recovery could not reload session ${candidate.ID}`);
                return this.recordRecoveryFailure(candidate.ID, false);
            }
            if (session.RecordingFileID) {
                return { Attempted: false, Recovered: false };
            }
            const storage = await this.resolveRecoveryStorage(candidate.AgentID, context);
            if (storage.Kind !== 'Resolved') {
                const why = storage.Kind === 'AgentUnavailable'
                    ? `agent ${candidate.AgentID} could not be loaded`
                    : `no recording storage account for agent ${candidate.AgentID}`;
                LogStatus(`[SessionJanitor] Recording recovery skipped for session ${candidate.ID}: ${why}`);
                return this.recordRecoveryFailure(candidate.ID, false);
            }
            const accountID = storage.AccountID;
            attempted = true;
            const result = await RecoverRealtimeRecordingFromSegments({
                SessionID: candidate.ID,
                StorageAccountID: accountID,
                StartedAt: candidate.RecordingStartedAt as Date, // non-null: the sweep filter requires RecordingStartedAt
                ContextUser: context.systemUser,
                Provider: context.provider,
            });
            switch (result.Outcome) {
                case 'Recovered':
                    this.recoveryBackoff.delete(candidate.ID.toLowerCase());
                    LogStatus(`[SessionJanitor] Recovered recording for session ${candidate.ID} from ${result.SegmentCount} segment(s) (file ${result.FileID})`);
                    return { Attempted: true, Recovered: true };
                case 'Superseded':
                    this.recoveryBackoff.delete(candidate.ID.toLowerCase());
                    LogStatus(`[SessionJanitor] Session ${candidate.ID} was given a recording by another writer; recovery left it alone`);
                    return { Attempted: true, Recovered: false };
                case 'NoSegments':
                    LogStatus(`[SessionJanitor] No recoverable segments for session ${candidate.ID} (agent ${candidate.AgentID}, storage account ${accountID})`);
                    return this.recordRecoveryFailure(candidate.ID, true);
                default:
                    LogError(`[SessionJanitor] Recording recovery failed for session ${candidate.ID}: ${result.ErrorMessage ?? 'unknown error'}`);
                    return this.recordRecoveryFailure(candidate.ID, true);
            }
        } catch (err) {
            LogError(`[SessionJanitor] Recording recovery threw for session ${candidate.ID}: ${err instanceof Error ? err.message : String(err)}`);
            return this.recordRecoveryFailure(candidate.ID, attempted);
        }
    }

    /**
     * Loads the agent carrying a session's recording storage config and resolves its storage account,
     * memoized per agent for the sweep: the resolve may force a storage-engine reload, so it must not
     * repeat for every session of the same agent.
     */
    private async resolveRecoveryStorage(agentID: string, context: RecoverySweepContext): Promise<RecoveryStorage> {
        const key = agentID.toLowerCase();
        const cached = context.storage.get(key);
        if (cached) {
            return cached;
        }
        const agent = await context.provider.GetEntityObject<MJAIAgentEntity>(AGENT_ENTITY, context.systemUser);
        let storage: RecoveryStorage;
        if (!(await agent.Load(agentID))) {
            LogError(`[SessionJanitor] Recording recovery could not load agent ${agentID}`);
            storage = { Kind: 'AgentUnavailable' };
        } else {
            const accountID = await ResolveRecordingStorageAccountID(agent, context.systemUser, context.provider);
            storage = accountID ? { Kind: 'Resolved', AccountID: accountID } : { Kind: 'NoAccount' };
        }
        context.storage.set(key, storage);
        return storage;
    }

    /** True while a session's backoff (or give-up) window has not elapsed. */
    private isRecoveryBackedOff(sessionID: string): boolean {
        const state = this.recoveryBackoff.get(sessionID.toLowerCase());
        return state != null && Date.now() < state.NextAttemptAt;
    }

    /**
     * Counts one more failed recovery for a session and schedules its next attempt
     * (`min(2^k * 5 min, 6 h)`); at {@link MAX_RECOVERY_ATTEMPTS} it abandons the session for this
     * process with a single `LogError`.
     */
    private recordRecoveryFailure(sessionID: string, attempted: boolean): RecoveryVisit {
        const key = sessionID.toLowerCase();
        const failures = (this.recoveryBackoff.get(key)?.Failures ?? 0) + 1;
        if (failures >= MAX_RECOVERY_ATTEMPTS) {
            this.recoveryBackoff.set(key, { Failures: failures, NextAttemptAt: Infinity });
            LogError(`[SessionJanitor] Giving up on recording recovery for session ${sessionID} after ${failures} failed attempts`);
        } else {
            const waitMs = Math.min(2 ** failures * RECOVERY_BACKOFF_BASE_MS, RECOVERY_BACKOFF_MAX_MS);
            this.recoveryBackoff.set(key, { Failures: failures, NextAttemptAt: Date.now() + waitMs });
        }
        return { Attempted: attempted, Recovered: false };
    }

    /** Drops backoff state for sessions that were not in the latest complete candidate set. */
    private pruneRecoveryBackoff(candidateKeys: ReadonlySet<string>): void {
        for (const key of this.recoveryBackoff.keys()) {
            if (!candidateKeys.has(key)) {
                this.recoveryBackoff.delete(key);
            }
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
        shouldClose?: (session: MJAIAgentSessionEntity) => boolean,
    ): Promise<number> {
        let closedCount = 0;
        await this.forEachSessionPage(filter, provider, systemUser, async fetched => {
            // Optional in-JS narrowing (e.g. exact deadline check the SQL pre-filter can't express).
            const page = shouldClose ? fetched.filter(shouldClose) : fetched;
            if (page.length === 0) {
                return;
            }
            // Batch-load every channel for this whole page of sessions in ONE query, then hand each
            // session its own slice to CloseSession — avoids the N+1 channel read (one RunView per
            // closing session) that tripped the sequential / multiple-same-entity telemetry.
            const channelsBySession = await this.sessionManager.LoadActiveChannelsBySession(
                page.map(s => s.ID),
                systemUser,
                provider,
            );
            for (const session of page) {
                const closed = await this.sessionManager.CloseSession(
                    session.ID,
                    systemUser,
                    provider,
                    closeReason,
                    channelsBySession.get(session.ID.toLowerCase()) ?? [],
                );
                if (closed) {
                    closedCount++;
                }
            }
        });
        return closedCount;
    }

    /**
     * Keyset-page (`AfterKey`) through every session matching `filter`, handing each full fetched page
     * to `visit`. Stops on a load failure (already logged), an empty page, a partial page, or when
     * `visit` returns `false`.
     *
     * `visit` receives the page exactly as the SQL filter matched it. The keyset advances from the
     * LAST FETCHED row, so any narrowing `visit` does in JS can never stall or skip pagination.
     *
     * Returns how the walk ended: `'complete'` (reached the end of the matching set), `'stopped'`
     * (`visit` returned `false`) or `'failed'` (a page failed to load). Callers that reason about the
     * WHOLE set (e.g. pruning state for absent rows) must act only on `'complete'`.
     */
    private async forEachSessionPage(
        filter: string,
        provider: IMetadataProvider,
        systemUser: UserInfo,
        visit: (page: MJAIAgentSessionEntity[]) => Promise<boolean | void>,
    ): Promise<'complete' | 'stopped' | 'failed'> {
        let afterKey: CompositeKey | undefined;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const fetched = await this.fetchPage(filter, afterKey, provider, systemUser);
            if (fetched == null) {
                return 'failed'; // load failure already logged
            }
            if (fetched.length === 0) {
                return 'complete';
            }
            // Advance from the last FETCHED row (before `visit` narrows anything): we must page by the
            // SQL-matched set, not a post-filtered subset, or pagination would stall/skip.
            const lastFetchedId = fetched[fetched.length - 1].ID;
            const fetchedCount = fetched.length;
            if ((await visit(fetched)) === false) {
                return 'stopped';
            }
            if (fetchedCount < SWEEP_PAGE_SIZE) {
                return 'complete'; // partial page (by the SQL-matched set) => end of data
            }
            afterKey = CompositeKey.FromID(lastFetchedId); // first-pk-ok: keyset AfterKey on SESSION_ENTITY = MJ: AI Agent Sessions, a core entity keyed by ID
        }
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
