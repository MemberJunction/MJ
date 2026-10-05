/**
 * @fileoverview Tracks live telephony bridge sessions by carrier call id so they can be ended from outside
 * the media path, and caps how long any one call may last.
 *
 * Three things end a phone session without the media socket cooperating, and all of them need the same
 * plumbing — "find the bridge session for this call id and stop it":
 *
 * - the carrier's **status callback** reports a terminal state (busy / no-answer / failed / canceled /
 *   completed) — an unanswered outbound call never opens a media socket, so nothing else would end it;
 * - **answering-machine detection** decides the callee is a machine and the operator wants a hang-up;
 * - the **maximum call length** elapses (`telephony.maxCallSeconds`).
 *
 * The engine only knows sessions by their bridge-row id, and a call id is unknown until the carrier
 * responds, so this tracker is the call-id → session map. It also closes a race: a status callback can
 * arrive while the session is still starting (the answer webhooks no longer wait for it), so a request to
 * end an in-flight call is remembered and honoured the moment the session attaches.
 *
 * Every timer it creates is cleared on every exit path ({@link Release}, {@link Fail}, expiry, a stop
 * request) and is `unref`'d, so it can neither leak nor hold the process open.
 *
 * @module @memberjunction/telephony-adapters
 */

import { IMetadataProvider, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import type { BridgeDisconnectReason } from '@memberjunction/ai-bridge-base';

/** Default maximum length of one phone call, in seconds. */
export const DEFAULT_MAX_CALL_SECONDS = 1800;

/**
 * How long a call may sit in the "starting" state (session being created) before the tracker forgets it. A
 * start that never attaches (it failed, or the process lost it) must not leave an entry behind forever.
 */
const START_DEADLINE_MS = 60_000;

/** The pieces of a live bridge session needed to stop it. */
export interface TrackedSession {
    /** The `MJ: AI Agent Session Bridges` row id the engine knows the session by. */
    SessionBridgeID: string;
    /** The user the session runs as (the engine writes the teardown rows as them). */
    ContextUser: UserInfo;
    /** The metadata provider the session runs under. */
    Provider: IMetadataProvider;
}

/** Stops a bridge session — in production `AIBridgeEngine.StopBridgeSession`. */
export type StopSessionFn = (session: TrackedSession, reason: BridgeDisconnectReason) => Promise<boolean>;

/** Why an outside party is asking for a call to end (log text only). */
export type CallEndRequestReason = 'carrier-status' | 'answering-machine' | 'max-duration' | 'media-connect-timeout';

/** Lifecycle of a tracked call. */
type CallState = 'starting' | 'live' | 'end-requested';

interface TrackedCall {
    State: CallState;
    Session?: TrackedSession;
    Timer?: ReturnType<typeof setTimeout>;
    /** The reason to stop with, remembered when the end was requested before the session attached. */
    PendingStopReason?: BridgeDisconnectReason;
}

/**
 * Maps carrier call ids to their live bridge session, ends calls on request, and enforces the call cap.
 */
export class CallLifecycleTracker {
    private readonly calls = new Map<string, TrackedCall>();
    private readonly maxCallMs: number;

    /**
     * @param stopSession How to stop a session (inject a fake in tests).
     * @param maxCallSeconds Maximum call length; a non-positive or non-finite value uses the default.
     */
    constructor(
        private readonly stopSession: StopSessionFn,
        maxCallSeconds: number = DEFAULT_MAX_CALL_SECONDS,
    ) {
        this.maxCallMs = (Number.isFinite(maxCallSeconds) && maxCallSeconds > 0 ? maxCallSeconds : DEFAULT_MAX_CALL_SECONDS) * 1000;
    }

    /**
     * Marks a call as starting (its bridge session is being created) and starts the start-deadline timer.
     * Idempotent. Registering the call BEFORE the session exists is what lets a terminal carrier status that
     * races the session start be remembered rather than dropped.
     */
    public Begin(callKey: string): void {
        if (this.calls.has(callKey)) {
            return;
        }
        const call: TrackedCall = { State: 'starting' };
        call.Timer = setTimeout(() => {
            call.Timer = undefined;
            if (call.State !== 'live') {
                LogError(`[Telephony] call ${callKey} never produced a live session within ${START_DEADLINE_MS / 1000}s; forgetting it.`);
                this.calls.delete(callKey);
            }
        }, START_DEADLINE_MS);
        (call.Timer as { unref?: () => void }).unref?.();
        this.calls.set(callKey, call);
    }

    /**
     * Attaches the live session to its call and arms the max-duration timer. If an end was requested while the
     * session was still starting, the session is stopped immediately instead.
     */
    public async Attach(callKey: string, session: TrackedSession): Promise<void> {
        const call = this.calls.get(callKey) ?? { State: 'starting' as CallState };
        this.calls.set(callKey, call);
        if (call.Timer) {
            clearTimeout(call.Timer); // the start-deadline timer — superseded by the max-duration timer below
            call.Timer = undefined;
        }
        call.Session = session;
        if (call.State === 'end-requested') {
            await this.stopAndForget(callKey, call, call.PendingStopReason ?? 'HostEnded');
            return;
        }
        call.State = 'live';
        this.armMaxDurationTimer(callKey, call);
    }

    /**
     * Asks for a call to end (carrier status, machine detection, connect timeout). A live session is stopped
     * now; a still-starting one is stopped as soon as it attaches; an unknown call is ignored (it already ended).
     *
     * @returns `true` when a live or starting call was found.
     */
    public async RequestEnd(callKey: string, why: CallEndRequestReason, stopReason: BridgeDisconnectReason = 'HostEnded'): Promise<boolean> {
        const call = this.calls.get(callKey);
        if (!call || call.State === 'end-requested') {
            return false;
        }
        LogStatus(`[Telephony] ending call ${callKey} (${why}).`);
        if (call.State === 'starting') {
            call.State = 'end-requested';
            call.PendingStopReason = stopReason;
            return true;
        }
        await this.stopAndForget(callKey, call, stopReason);
        return true;
    }

    /** The session ended by some other route (hang-up, remote end): forget the call and cancel its timer. */
    public Release(callKey: string): void {
        const call = this.calls.get(callKey);
        if (call?.Timer) {
            clearTimeout(call.Timer);
        }
        this.calls.delete(callKey);
    }

    /** The session failed to start: forget the call and cancel its timer. */
    public Fail(callKey: string): void {
        this.Release(callKey);
    }

    /** Whether a call is currently tracked (any state). */
    public IsTracking(callKey: string): boolean {
        return this.calls.has(callKey);
    }

    /** Cancels every timer and forgets every call (service shutdown). */
    public Dispose(): void {
        for (const call of this.calls.values()) {
            if (call.Timer) {
                clearTimeout(call.Timer);
            }
        }
        this.calls.clear();
    }

    // ── internals ────────────────────────────────────────────────────────────────

    /** Arms the one-shot timer that ends the call at the cap. Always cleared via {@link Release}. */
    private armMaxDurationTimer(callKey: string, call: TrackedCall): void {
        call.Timer = setTimeout(() => {
            call.Timer = undefined;
            void this.RequestEnd(callKey, 'max-duration').catch((err) =>
                LogError(`[Telephony] max-duration stop failed for call ${callKey}: ${err instanceof Error ? err.message : String(err)}`),
            );
        }, this.maxCallMs);
        (call.Timer as { unref?: () => void }).unref?.();
    }

    /** Stops the session and forgets the call. The timer is cleared first so it cannot fire again. */
    private async stopAndForget(callKey: string, call: TrackedCall, reason: BridgeDisconnectReason): Promise<void> {
        if (call.Timer) {
            clearTimeout(call.Timer);
            call.Timer = undefined;
        }
        this.calls.delete(callKey);
        if (!call.Session) {
            return;
        }
        try {
            await this.stopSession(call.Session, reason);
        } catch (err) {
            LogError(`[Telephony] failed to stop the session for call ${callKey}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
