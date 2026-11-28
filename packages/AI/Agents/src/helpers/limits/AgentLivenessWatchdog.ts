/**
 * @fileoverview Sliding forward-progress liveness watchdog for MemberJunction AI Agents (`Slice s12 / A7b`).
 *
 * Replaces blunt wall-clock `setTimeout` kills with a two-tier liveness guard:
 * 1. **Sliding inactivity timer (`InactivityTimeoutMs`)** — reset whenever the agent makes
 *    observable forward progress (LLM streaming chunks, completed steps, action progress,
 *    or sub-agent heartbeats), and suspended during deliberate external waits (CI checks,
 *    human feedback, paused workflow waits).
 * 2. **Outer wall-clock safety ceiling (`OuterMaxWallClockMs`)** — absolute upper bound
 *    (72h default when no tighter explicit run/policy/workflow cap is set), chained across
 *    Node's 32-bit `setTimeout` max delay so multi-week runs never hit `TimeoutOverflowWarning`.
 *
 * @module @memberjunction/ai-agents
 */

import { LimitsConfigResolver, type MJLimitsLivenessConfig } from '@memberjunction/core';

/**
 * ProtocolLimit: Node/V8 `setTimeout` clamps signed 32-bit delays above `2^31 - 1` ms (~24.85 days) to 1ms.
 * Chaining delays at this ceiling guarantees multi-week runs never prematurely fire on timer overflow.
 */
const MAX_SAFE_TIMER_DELAY_MS = 2_147_483_647;

/** Forward-progress signal categories recognized by {@link AgentLivenessWatchdog}. */
export type LivenessProgressKind =
    | 'run-start'
    | 'llm-stream-chunk'
    | 'step-complete'
    | 'action-progress'
    | 'sub-agent-heartbeat'
    | 'external-wait-resumed';

/** Structured progress signal passed to {@link AgentLivenessWatchdog.RecordProgress}. */
export interface LivenessProgressSignal {
    /** Source category of forward progress. */
    Kind: LivenessProgressKind;
    /** Optional epoch timestamp (ms); defaults to `Date.now()`. */
    TimestampMs?: number;
    /** Optional `AIAgentRunStep.ID` associated with this progress signal. */
    StepEntityId?: string;
    /** Optional payload byte/char delta (e.g., streamed chunk length). */
    Bytes?: number;
    /** Optional short human-readable diagnostic detail. */
    Detail?: string;
}

/** Configuration inputs for constructing an {@link AgentLivenessWatchdog}. */
export interface AgentLivenessWatchdogOptions {
    /** Agent display name included in abort messages. */
    AgentName: string;
    /** Whether the sliding inactivity timer is enabled (defaults to `LimitsConfigResolver` `Liveness.Enabled`). */
    Enabled?: boolean;
    /** Sliding inactivity window (ms) before aborting a stalled run. */
    InactivityTimeoutMs?: number;
    /** Absolute outer wall-clock ceiling (ms). Explicit run/policy/workflow caps supply a tighter value here. */
    OuterMaxWallClockMs?: number;
    /** Minimum interval (ms) between timer resets for high-frequency `'llm-stream-chunk'` signals. */
    StreamChunkTouchThrottleMs?: number;
    /** Prefix used when aborting due to sliding inactivity timeout. */
    InactivityAbortReasonPrefix: string;
    /** Prefix used when aborting due to outer wall-clock ceiling breach. */
    TimeoutAbortReasonPrefix: string;
    /** Optional callback invoked when the watchdog fires an abort (useful for telemetry/tests). */
    OnAbort?: (reason: string, source: 'inactivity' | 'outer-ceiling') => void;
    /** Optional clock function (defaults to `Date.now`) for deterministic testing. */
    Now?: () => number;
}

/** Point-in-time diagnostic snapshot of an {@link AgentLivenessWatchdog}. */
export interface AgentLivenessWatchdogSnapshot {
    Active: boolean;
    Enabled: boolean;
    StartedAtMs: number;
    LastProgressAtMs: number;
    LastProgressKind: LivenessProgressKind;
    ProgressCount: number;
    StreamChunkCount: number;
    SuspendedWaitCount: number;
    ActiveWaitIds: readonly string[];
    AbortedBy: 'none' | 'inactivity' | 'outer-ceiling';
    InactivityTimeoutMs: number;
    OuterMaxWallClockMs: number;
}

/**
 * Per-run sliding forward-progress liveness watchdog bridging into an `AbortController`.
 */
export class AgentLivenessWatchdog {
    private readonly _agentName: string;
    private readonly _enabled: boolean;
    private readonly _inactivityTimeoutMs: number;
    private readonly _outerMaxWallClockMs: number;
    private readonly _streamChunkTouchThrottleMs: number;
    private readonly _inactivityAbortPrefix: string;
    private readonly _timeoutAbortPrefix: string;
    private readonly _onAbort?: (reason: string, source: 'inactivity' | 'outer-ceiling') => void;
    private readonly _now: () => number;

    private _controller: AbortController | null = null;
    private _active = false;
    private _startedAtMs = 0;
    private _lastProgressAtMs = 0;
    private _lastInactivityArmAtMs = 0;
    private _lastProgressKind: LivenessProgressKind = 'run-start';
    private _progressCount = 0;
    private _streamChunkCount = 0;
    private _abortedBy: 'none' | 'inactivity' | 'outer-ceiling' = 'none';
    private _inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    private _outerCeilingTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly _suspendedWaits = new Map<string, string>();

    public constructor(options: AgentLivenessWatchdogOptions) {
        const defaults: MJLimitsLivenessConfig = LimitsConfigResolver.Resolve().Limits.Liveness;
        this._agentName = options.AgentName || 'Agent';
        this._enabled = options.Enabled ?? defaults.Enabled;
        this._inactivityTimeoutMs = options.InactivityTimeoutMs ?? defaults.InactivityTimeoutMs;
        this._outerMaxWallClockMs = options.OuterMaxWallClockMs ?? defaults.OuterMaxWallClockMs;
        this._streamChunkTouchThrottleMs = options.StreamChunkTouchThrottleMs ?? defaults.StreamChunkTouchThrottleMs;
        this._inactivityAbortPrefix = options.InactivityAbortReasonPrefix;
        this._timeoutAbortPrefix = options.TimeoutAbortReasonPrefix;
        this._onAbort = options.OnAbort;
        this._now = options.Now ?? (() => Date.now());
    }

    /** True while the watchdog is actively monitoring an in-flight run. */
    public get IsRunning(): boolean {
        return this._active;
    }

    /** True when the sliding inactivity timer is actively enabled for this run. */
    public get IsLivenessEnabled(): boolean {
        return this._enabled;
    }

    /** Effective outer wall-clock ceiling (ms) armed for this run. */
    public get OuterMaxWallClockMs(): number {
        return this._outerMaxWallClockMs;
    }

    /** Effective sliding inactivity window (ms) armed for this run. */
    public get InactivityTimeoutMs(): number {
        return this._inactivityTimeoutMs;
    }

    /** Starts monitoring `controller`, arming both the sliding inactivity timer and outer ceiling. */
    public Start(controller: AbortController): void {
        if (this._active) {
            this.Stop();
        }
        const now = this._now();
        this._controller = controller;
        this._active = true;
        this._startedAtMs = now;
        this._lastProgressAtMs = now;
        this._lastInactivityArmAtMs = now;
        this._lastProgressKind = 'run-start';
        this._progressCount = 0;
        this._streamChunkCount = 0;
        this._abortedBy = 'none';
        this._suspendedWaits.clear();

        if (this._enabled && this._inactivityTimeoutMs > 0 && Number.isFinite(this._inactivityTimeoutMs)) {
            this.armInactivityTimer(this._inactivityTimeoutMs);
        }
        if (this._outerMaxWallClockMs > 0 && Number.isFinite(this._outerMaxWallClockMs)) {
            this.armOuterCeilingTimer(this._startedAtMs + this._outerMaxWallClockMs);
        }
    }

    /**
     * Records a forward-progress signal and resets the sliding inactivity timer.
     * High-frequency `'llm-stream-chunk'` signals throttle timer re-arming by `StreamChunkTouchThrottleMs`
     * while immediately advancing `LastProgressAtMs` so the watchdog never mistakes active streaming for a stall.
     */
    public RecordProgress(signal: LivenessProgressSignal): void {
        if (!this._active || this._controller?.signal.aborted) {
            return;
        }
        const now = signal.TimestampMs ?? this._now();
        this._lastProgressAtMs = Math.max(this._lastProgressAtMs, now);
        this._lastProgressKind = signal.Kind;
        this._progressCount++;
        if (signal.Kind === 'llm-stream-chunk') {
            this._streamChunkCount++;
        }

        if (!this._enabled || this._suspendedWaits.size > 0) {
            return;
        }
        if (
            signal.Kind === 'llm-stream-chunk' &&
            this._streamChunkTouchThrottleMs > 0 &&
            this._inactivityTimer !== null &&
            now - this._lastInactivityArmAtMs < this._streamChunkTouchThrottleMs
        ) {
            return;
        }

        this._lastInactivityArmAtMs = now;
        this.armInactivityTimer(this._inactivityTimeoutMs);
    }

    /**
     * Suspends the sliding inactivity timer while awaiting an external system or human (e.g., CI check,
     * feedback request, external workflow task). The outer wall-clock safety ceiling stays active.
     */
    public SuspendForExternalWait(waitId: string, reason: string = 'external-wait'): void {
        if (!this._active || !waitId) {
            return;
        }
        this._suspendedWaits.set(waitId, reason);
        this.clearInactivityTimer();
    }

    /**
     * Resumes the sliding inactivity timer once an external wait concludes.
     * When all active waits have cleared, resets the inactivity window fresh from now.
     */
    public ResumeFromExternalWait(waitId: string): void {
        if (!this._active || !waitId) {
            return;
        }
        const removed = this._suspendedWaits.delete(waitId);
        if (removed && this._suspendedWaits.size === 0 && this._enabled && !this._controller?.signal.aborted) {
            const now = this._now();
            this._lastProgressAtMs = Math.max(this._lastProgressAtMs, now);
            this._lastProgressKind = 'external-wait-resumed';
            this._lastInactivityArmAtMs = now;
            this.armInactivityTimer(this._inactivityTimeoutMs);
        }
    }

    /** Stops the watchdog and clears all pending timers idempotently. */
    public Stop(): void {
        this._active = false;
        this.clearInactivityTimer();
        this.clearOuterCeilingTimer();
        this._suspendedWaits.clear();
        this._controller = null;
    }

    /** Returns an immutable point-in-time diagnostic snapshot. */
    public GetSnapshot(): AgentLivenessWatchdogSnapshot {
        return {
            Active: this._active,
            Enabled: this._enabled,
            StartedAtMs: this._startedAtMs,
            LastProgressAtMs: this._lastProgressAtMs,
            LastProgressKind: this._lastProgressKind,
            ProgressCount: this._progressCount,
            StreamChunkCount: this._streamChunkCount,
            SuspendedWaitCount: this._suspendedWaits.size,
            ActiveWaitIds: Array.from(this._suspendedWaits.keys()),
            AbortedBy: this._abortedBy,
            InactivityTimeoutMs: this._inactivityTimeoutMs,
            OuterMaxWallClockMs: this._outerMaxWallClockMs,
        };
    }

    private armInactivityTimer(remainingMs: number): void {
        this.clearInactivityTimer();
        if (!this._active || !Number.isFinite(remainingMs) || remainingMs <= 0) {
            return;
        }
        const delayMs = Math.min(remainingMs, MAX_SAFE_TIMER_DELAY_MS);
        const timer = setTimeout(() => {
            this._inactivityTimer = null;
            if (!this._active || this._suspendedWaits.size > 0 || !this._controller || this._controller.signal.aborted) {
                return;
            }
            const elapsedSinceProgress = this._now() - this._lastProgressAtMs;
            const left = this._inactivityTimeoutMs - elapsedSinceProgress;
            if (left > 0) {
                // Throttled streaming chunks advanced `_lastProgressAtMs` since last arm, or delay > 24.8d.
                this.armInactivityTimer(left);
                return;
            }
            const reason =
                `${this._inactivityAbortPrefix}: agent '${this._agentName}' had no forward progress for ` +
                `${this._inactivityTimeoutMs}ms (last signal: ${this._lastProgressKind})`;
            this._abortedBy = 'inactivity';
            this.clearOuterCeilingTimer();
            this._controller.abort(reason);
            this._onAbort?.(reason, 'inactivity');
        }, delayMs);
        timer.unref?.();
        this._inactivityTimer = timer;
    }

    private armOuterCeilingTimer(deadlineMs: number): void {
        this.clearOuterCeilingTimer();
        if (!this._active || !Number.isFinite(deadlineMs)) {
            return;
        }
        const remainingMs = Math.max(0, deadlineMs - this._now());
        const delayMs = Math.min(remainingMs, MAX_SAFE_TIMER_DELAY_MS);
        const timer = setTimeout(() => {
            this._outerCeilingTimer = null;
            if (!this._active || !this._controller || this._controller.signal.aborted) {
                return;
            }
            const left = deadlineMs - this._now();
            if (left > 0) {
                this.armOuterCeilingTimer(deadlineMs);
                return;
            }
            const reason = `${this._timeoutAbortPrefix}: agent '${this._agentName}' ran past ${this._outerMaxWallClockMs}ms`;
            this._abortedBy = 'outer-ceiling';
            this.clearInactivityTimer();
            this._controller.abort(reason);
            this._onAbort?.(reason, 'outer-ceiling');
        }, delayMs);
        timer.unref?.();
        this._outerCeilingTimer = timer;
    }

    private clearInactivityTimer(): void {
        if (this._inactivityTimer !== null) {
            clearTimeout(this._inactivityTimer);
            this._inactivityTimer = null;
        }
    }

    private clearOuterCeilingTimer(): void {
        if (this._outerCeilingTimer !== null) {
            clearTimeout(this._outerCeilingTimer);
            this._outerCeilingTimer = null;
        }
    }
}
