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
import {
    RecoverRealtimeRecordingFromSegments,
    ResolveRecordingStorageAccountID,
    type RecoverRealtimeRecordingInput,
    type RecoverRealtimeRecordingResult,
} from '@memberjunction/ai-agents';
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

/**
 * Abandoned (timed-out, still running) recovery attempts allowed at once. Each keeps its socket and any
 * shard buffers it had read (up to the 384 MiB recovery cap) until it settles, so recovery pauses at this
 * many instead of adding one more every timeout while storage keeps hanging.
 */
const MAX_ABANDONED_RECOVERIES = 2;

/** Backoff after the k-th failed recovery is `2^k * base`, capped at the max. */
const RECOVERY_BACKOFF_BASE_MS = 5 * 60_000;
const RECOVERY_BACKOFF_MAX_MS = 6 * 60 * 60_000;

/**
 * How long {@link SessionJanitor.Shutdown} waits for an in-flight recording recovery pass. A pass can
 * spend minutes on large downloads/uploads, and graceful shutdown must not hang on it indefinitely.
 */
const RECOVERY_SHUTDOWN_WAIT_MS = 10_000;

/** Tuning knobs for the janitor. All durations in their named units. */
export interface SessionJanitorConfig {
    /** A non-`Closed` session whose `LastActiveAt` is older than this is force-closed by the global sweep. */
    closeThresholdMinutes: number;
    /** How often the periodic tick (close sweeps, then recording recovery) runs once {@link SessionJanitor.Start} is called. */
    sweepIntervalMs: number;
    /**
     * How long after `ClosedAt` a recording-less session waits before recording recovery rebuilds it.
     * Sessions are closed BEFORE the browser uploads the recording (#5195), so a fresh close without a
     * recording is normal; recovery must not race the upload that is about to arrive.
     */
    recordingRecoveryGraceMinutes: number;
    /** Sessions closed longer ago than this are no longer considered by recording recovery. */
    recordingRecoveryLookbackHours: number;
    /**
     * How long one session's recovery may run before the sweep abandons it and moves on. Storage clients
     * can wait forever on a connection that stops answering (the S3 driver sets no request timeout), and
     * one such call must not hold the single recovery pass for the life of the process.
     */
    recordingRecoveryAttemptTimeoutMinutes: number;
}

const DEFAULT_CONFIG: SessionJanitorConfig = {
    closeThresholdMinutes: 15,
    sweepIntervalMs: 60_000,
    recordingRecoveryGraceMinutes: 10,
    recordingRecoveryLookbackHours: 168,
    recordingRecoveryAttemptTimeoutMinutes: 10,
};

/** Every knob {@link SessionJanitor.Configure} accepts; each must be a finite number greater than zero. */
const CONFIG_KEYS: ReadonlyArray<keyof SessionJanitorConfig> = [
    'closeThresholdMinutes',
    'sweepIntervalMs',
    'recordingRecoveryGraceMinutes',
    'recordingRecoveryLookbackHours',
    'recordingRecoveryAttemptTimeoutMinutes',
];

/** Per-session recovery retry state (process-local). */
interface RecoveryBackoff {
    Failures: number;
    /** Epoch ms before which the session is not retried; `Infinity` once given up. */
    NextAttemptAt: number;
    /** True while the session waits on configuration (no storage account), which is not a failure. */
    Deferred: boolean;
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
 * Three close sweeps, all writing through {@link SessionManager.CloseSession} so Record Changes captures
 * each transition and channel rows are disconnected consistently:
 *
 * 1. **Own-host recovery ({@link RunStartupRecovery})** — run once at boot. Closes any `Active`/`Idle`
 *    session whose `HostInstanceID` belongs to a *previous* boot of *this* host (same hostname prefix,
 *    different `bootId`). Primary defense against the "Active forever" leak after a restart.
 * 2. **Global staleness sweep ({@link RunStalenessSweep})** — run on every periodic tick, on every
 *    instance. Closes any `Active`/`Idle` session whose `LastActiveAt` is older than
 *    `closeThresholdMinutes`, regardless of host. Catches sessions whose owner died without a clean
 *    reboot (OOM, scaled-down pod).
 * 3. **Max-duration sweep ({@link RunMaxDurationSweep})** — run on every periodic tick after the
 *    staleness sweep. Closes any session past its stored hard deadline (the public voice cost cap).
 *
 * The close sweeps stamp `CloseReason = 'Janitor'`. A shutdown-time path — {@link RunShutdownDrain},
 * invoked from {@link Shutdown} during the graceful ShutdownRegistry drain — closes this exact host
 * instance's own live sessions with `CloseReason = 'Shutdown'`.
 *
 * Separately from closing, {@link RunRecordingRecoverySweep} runs after the close sweeps on every
 * periodic tick, without blocking them, and rebuilds the recording of already-`Closed` sessions whose
 * end-of-call upload never arrived (it closes nothing).
 *
 * The close sweeps are **idempotent and safe to run concurrently** on every instance: closing an
 * already-`Closed` session is a no-op, and the close path is last-writer-wins. Recording recovery is not
 * strictly so: two instances can recover the same session at once (there is no claim column). Each
 * attempt uploads its own file and defers to an already-stamped recording on a best-effort basis, so
 * the cost is duplicate work and an extra file, not a lost recording. The extra file is an orphan when the
 * second attempt's re-check sees the first stamp; when both re-checks pass first, both files are stamped in
 * turn and both are linked to the session (the later stamp wins `RecordingFileID`). Every sweep pages with keyset
 * (`AfterKey`) pagination per the deep-pagination guide so a large backlog can't blow up memory.
 */
export class SessionJanitor extends BaseSingleton<SessionJanitor> implements IShutdownable {
    private _config: SessionJanitorConfig = DEFAULT_CONFIG;
    private _sweepTimer: ReturnType<typeof setInterval> | null = null;
    private _sweepRunning = false;
    /**
     * The in-flight recording recovery pass, or null. Separate from {@link _sweepRunning}: slow recovery
     * must never block the close sweeps. Kept as a promise so {@link Shutdown} can wait for it.
     */
    private _recoveryPass: Promise<void> | null = null;
    /** Set by {@link Stop}, cleared by {@link Start}: no new recovery pass starts while stopped. */
    private _stopped = false;
    private _registered = false;
    private _provider: IMetadataProvider | null = null;
    private _systemUser: UserInfo | null = null;
    private readonly sessionManager = new SessionManager();
    /** Recovery retry state keyed by lowercase session id. Process-local: a restart gets fresh attempts. */
    private readonly recoveryBackoff = new Map<string, RecoveryBackoff>();
    /**
     * Lowercase ids of sessions whose recovery attempt timed out but has not settled. Skipped by later
     * sweeps so a second attempt never runs alongside the abandoned one; removed when it settles.
     */
    private readonly abandonedRecoveries = new Set<string>();
    /** True once the "recovery paused" error has been logged for the current pause; reset when it lifts. */
    private _recoveryPauseLogged = false;

    protected constructor() {
        super();
    }

    /** Process-wide singleton accessor (Global Object Store backed via {@link BaseSingleton}). */
    public static get Instance(): SessionJanitor {
        return super.getInstance<SessionJanitor>();
    }

    /** Identifier surfaced in graceful-shutdown logs. */
    public readonly ShutdownName = 'SessionJanitor';

    /**
     * Overrides default tuning. Safe to call before or after {@link Start}. Every value given must be a
     * finite number greater than zero: a NaN or non-positive duration would otherwise build an invalid
     * cutoff date and make every later sweep throw. All-or-nothing: on an invalid value it throws, naming
     * the field and value, and applies nothing. `undefined` values are ignored.
     */
    public Configure(config: Partial<SessionJanitorConfig>): void {
        const next: SessionJanitorConfig = { ...this._config };
        for (const key of CONFIG_KEYS) {
            const value = config[key];
            if (value === undefined) {
                continue;
            }
            if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
                throw new Error(`SessionJanitor.Configure: ${key} must be a finite number greater than 0, got ${String(value)}`);
            }
            next[key] = value;
        }
        this._config = next;
    }

    /**
     * Run own-host startup recovery once, then schedule the periodic tick (staleness and max-duration
     * close sweeps, then recording recovery). Idempotent: a second call does not stack a second timer.
     * Captures the provider + system user so the timer callback can run without re-supplying them, and
     * re-enables recording recovery after a {@link Stop}. Throws, before doing any work, when
     * `intervalMs` is invalid (see {@link Configure}).
     */
    public async Start(provider: IMetadataProvider, systemUser: UserInfo, intervalMs?: number): Promise<void> {
        if (intervalMs != null) {
            this.Configure({ sweepIntervalMs: intervalMs });
        }
        this._provider = provider;
        this._systemUser = systemUser;
        this._stopped = false;
        this.ensureRegistered();
        await this.RunStartupRecovery(provider, systemUser);
        this.scheduleSweep();
    }

    /**
     * Stops the periodic tick and keeps any new recording recovery pass from starting until the next
     * {@link Start}, including one a tick already in progress would have started. A pass that is already
     * running is not interrupted ({@link Shutdown} waits for it). Idempotent. Part of {@link IShutdownable}.
     */
    public Stop(): void {
        this._stopped = true;
        if (this._sweepTimer) {
            clearInterval(this._sweepTimer);
            this._sweepTimer = null;
        }
    }

    /**
     * {@link IShutdownable}: stop the timer, then drain this host's own live sessions so a
     * graceful stop never strands `Active`/`Idle` rows for the next boot's janitor to mop up, then wait
     * (at most {@link RECOVERY_SHUTDOWN_WAIT_MS}) for an in-flight recording recovery pass.
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
        await this.waitForRecoveryPass();
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
        if (this.isRecoveryPausedForAbandonedAttempts()) {
            return 0;
        }
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
                if (this.isRecoveryBackedOff(session.ID) || this.abandonedRecoveries.has(session.ID.toLowerCase())) {
                    continue;
                }
                if (attempts >= MAX_RECOVERIES_PER_SWEEP || this.abandonedRecoveries.size >= MAX_ABANDONED_RECOVERIES) {
                    return false; // per-sweep cap, or too many abandoned attempts still running: stop paging
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
     * max-duration cost cap and make every later tick return early. Each tick skips recovery while a pass
     * is still running; because every session's attempt is bounded by
     * `recordingRecoveryAttemptTimeoutMinutes`, a hung storage call delays later passes, never stops them.
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

    /**
     * Fire-and-forget recording recovery, skipped when the previous pass is still running or the janitor
     * has been stopped (a tick that was mid-close-sweep when {@link Stop} ran must not start one).
     */
    private startRecoveryPass(provider: IMetadataProvider, systemUser: UserInfo): void {
        if (this._stopped || this._recoveryPass) {
            return;
        }
        this._recoveryPass = this.RunRecordingRecoverySweep(provider, systemUser)
            .then(
                () => undefined,
                err => {
                    LogError(`SessionJanitor recording recovery sweep failed: ${err instanceof Error ? err.message : String(err)}`);
                },
            )
            .finally(() => {
                this._recoveryPass = null;
            });
    }

    /**
     * Waits for the in-flight recovery pass, if any, for at most {@link RECOVERY_SHUTDOWN_WAIT_MS}; logs
     * once when it gives up. Never throws: the pass promise already logs and absorbs its own errors.
     */
    private async waitForRecoveryPass(): Promise<void> {
        const pass = this._recoveryPass;
        if (!pass) {
            return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<'timeout'>(resolve => {
            timer = setTimeout(() => resolve('timeout'), RECOVERY_SHUTDOWN_WAIT_MS);
        });
        try {
            const outcome = await Promise.race([pass.then(() => 'finished' as const), timedOut]);
            if (outcome === 'timeout') {
                LogError(
                    `SessionJanitor shutdown (host instance ${GetHostInstanceID()}): recording recovery pass still running after ` +
                    `${RECOVERY_SHUTDOWN_WAIT_MS} ms; shutting down without it. A session it had not yet stamped is retried by a later sweep.`,
                );
            }
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Recovers one candidate's recording and updates its backoff. Never throws: any exception is logged
     * with the session id and counted as a failure.
     */
    private async recoverSessionRecording(candidate: MJAIAgentSessionEntity, context: RecoverySweepContext): Promise<RecoveryVisit> {
        let attempted = false;
        // The sweep filter requires RecordingStartedAt, so this only fires on drifted data; recovery would
        // otherwise stamp a recording with no t0. Counted as a failure so it backs off rather than logging every tick.
        const startedAt = candidate.RecordingStartedAt;
        if (!startedAt) {
            LogError(`[SessionJanitor] Recording recovery skipped for session ${candidate.ID}: RecordingStartedAt is empty`);
            return this.recordRecoveryFailure(candidate.ID, false);
        }
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
            if (storage.Kind === 'NoAccount') {
                return this.deferRecovery(candidate.ID, `no recording storage account for agent ${candidate.AgentID}`);
            }
            if (storage.Kind === 'AgentUnavailable') {
                LogStatus(`[SessionJanitor] Recording recovery skipped for session ${candidate.ID}: agent ${candidate.AgentID} could not be loaded`);
                return this.recordRecoveryFailure(candidate.ID, false);
            }
            const accountID = storage.AccountID;
            attempted = true;
            const result = await this.recoverWithinTimeout({
                SessionID: candidate.ID,
                StorageAccountID: accountID,
                StartedAt: startedAt,
                ContextUser: context.systemUser,
                Provider: context.provider,
            });
            if (result === 'TimedOut') {
                LogError(
                    `[SessionJanitor] Recording recovery for session ${candidate.ID} did not finish within ` +
                    `${this._config.recordingRecoveryAttemptTimeoutMinutes} minutes; abandoning this attempt (its storage call may ` +
                    `still complete) and continuing the sweep. The session is not retried until that call settles.`,
                );
                return this.recordRecoveryFailure(candidate.ID, true);
            }
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
                    // Retried with backoff: a storage outage can also read as an empty folder (drivers that swallow
                    // list errors), but a session that never has shards is not an error when checking stops.
                    return this.recordRecoveryFailure(candidate.ID, true, 'NoSegments');
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
     * Runs one session's recovery, giving up on waiting after `recordingRecoveryAttemptTimeoutMinutes`.
     * A call cannot be cancelled, so a timed-out one keeps running: the session is marked abandoned until
     * it settles (later sweeps skip it), and its late outcome is logged then.
     */
    private async recoverWithinTimeout(input: RecoverRealtimeRecordingInput): Promise<RecoverRealtimeRecordingResult | 'TimedOut'> {
        const key = input.SessionID.toLowerCase();
        const attempt = RecoverRealtimeRecordingFromSegments(input);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timedOut = new Promise<'TimedOut'>(resolve => {
            timer = setTimeout(() => resolve('TimedOut'), this._config.recordingRecoveryAttemptTimeoutMinutes * 60_000);
            timer.unref?.();
        });
        try {
            const outcome = await Promise.race([attempt, timedOut]);
            if (outcome === 'TimedOut') {
                this.abandonedRecoveries.add(key);
                attempt.then(
                    late => LogStatus(`[SessionJanitor] Abandoned recording recovery for session ${input.SessionID} finished late: ${late.Outcome}`),
                    err => LogError(`[SessionJanitor] Abandoned recording recovery for session ${input.SessionID} failed late: ${err instanceof Error ? err.message : String(err)}`),
                ).finally(() => this.abandonedRecoveries.delete(key));
            }
            return outcome;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * True while {@link MAX_ABANDONED_RECOVERIES} timed-out attempts are still running: no new attempt
     * starts until one settles. Logs one `LogError` per pause.
     */
    private isRecoveryPausedForAbandonedAttempts(): boolean {
        if (this.abandonedRecoveries.size < MAX_ABANDONED_RECOVERIES) {
            this._recoveryPauseLogged = false;
            return false;
        }
        if (!this._recoveryPauseLogged) {
            LogError(
                `[SessionJanitor] Recording recovery paused: ${this.abandonedRecoveries.size} abandoned attempts are still waiting on storage ` +
                `(sessions ${[...this.abandonedRecoveries].join(', ')}); no new attempt starts until one of them settles`,
            );
            this._recoveryPauseLogged = true;
        }
        return true;
    }

    /**
     * Defers a session that cannot be recovered until configuration changes (its agent has no recording
     * storage account). That is not a failed attempt, so it never counts toward the give-up: the session
     * is re-checked every {@link RECOVERY_BACKOFF_MAX_MS} and logged only the first time.
     */
    private deferRecovery(sessionID: string, reason: string): RecoveryVisit {
        const key = sessionID.toLowerCase();
        const state = this.recoveryBackoff.get(key);
        if (!state?.Deferred) {
            LogStatus(`[SessionJanitor] Recording recovery skipped for session ${sessionID}: ${reason}; re-checked every ${RECOVERY_BACKOFF_MAX_MS / 3_600_000} h`);
        }
        this.recoveryBackoff.set(key, { Failures: state?.Failures ?? 0, NextAttemptAt: Date.now() + RECOVERY_BACKOFF_MAX_MS, Deferred: true });
        return { Attempted: false, Recovered: false };
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
     * Counts one more unsuccessful recovery for a session and schedules its next attempt
     * (`min(2^k * 5 min, 6 h)`); at {@link MAX_RECOVERY_ATTEMPTS} it stops checking the session for this
     * process with a single log line: a `LogError` when the last attempt failed, a `LogStatus` when it
     * simply found no shards (nothing to recover is not an error).
     */
    private recordRecoveryFailure(sessionID: string, attempted: boolean, kind: 'Failed' | 'NoSegments' = 'Failed'): RecoveryVisit {
        const key = sessionID.toLowerCase();
        const failures = (this.recoveryBackoff.get(key)?.Failures ?? 0) + 1;
        if (failures >= MAX_RECOVERY_ATTEMPTS) {
            this.recoveryBackoff.set(key, { Failures: failures, NextAttemptAt: Infinity, Deferred: false });
            if (kind === 'NoSegments') {
                LogStatus(`[SessionJanitor] Session ${sessionID} had no recoverable segments in ${failures} checks; not checking it again until restart`);
            } else {
                LogError(`[SessionJanitor] Giving up on recording recovery for session ${sessionID} after ${failures} failed attempts`);
            }
        } else {
            const waitMs = Math.min(2 ** failures * RECOVERY_BACKOFF_BASE_MS, RECOVERY_BACKOFF_MAX_MS);
            this.recoveryBackoff.set(key, { Failures: failures, NextAttemptAt: Date.now() + waitMs, Deferred: false });
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
