/**
 * @fileoverview Client-side voice abuse ceilings. Voice is the biggest cost/abuse
 * surface on a PUBLIC endpoint (plan W4 §"Voice abuse controls"), so the widget caps
 * each session locally as defense-in-depth — the authoritative limits are also
 * enforced server-side (SessionJanitor TTL + model-cost ceiling). This guard is pure
 * and unit-tested; the controller polls it and aborts when it trips.
 *
 * @module @memberjunction/realtime-widget
 */

/** Configurable ceilings for one voice session. */
export interface VoiceAbuseLimits {
    /** Hard cap on a single voice session's wall-clock duration (minutes). */
    maxSessionMinutes: number;
    /** Optional cap on total output tokens (a proxy for model spend) before aborting. */
    maxOutputTokens?: number;
}

/** Why a voice session was aborted by the guard. */
export type VoiceAbortReason = 'max-minutes' | 'max-cost';

/** Default limits used when a widget instance doesn't specify its own. */
export const DEFAULT_VOICE_LIMITS: VoiceAbuseLimits = {
    maxSessionMinutes: 10,
    maxOutputTokens: 50_000,
};

/**
 * Tracks elapsed time + accumulated usage for one voice session and decides when to
 * abort. Stateful but trivially testable (inject `now`/usage; no timers inside).
 */
export class VoiceAbuseGuard {
    private startedAtMs: number | null = null;
    private outputTokens = 0;

    constructor(private readonly limits: VoiceAbuseLimits = DEFAULT_VOICE_LIMITS) {}

    /** Marks the session start. */
    public Start(nowMs: number): void {
        this.startedAtMs = nowMs;
        this.outputTokens = 0;
    }

    /** Accumulates reported output-token usage. */
    public AddUsage(outputTokens: number | undefined): void {
        if (outputTokens && outputTokens > 0) {
            this.outputTokens += outputTokens;
        }
    }

    /** Returns an abort reason if a ceiling has been crossed, else null. */
    public ShouldAbort(nowMs: number): VoiceAbortReason | null {
        if (this.startedAtMs === null) {
            return null;
        }
        const elapsedMin = (nowMs - this.startedAtMs) / 60_000;
        if (elapsedMin >= this.limits.maxSessionMinutes) {
            return 'max-minutes';
        }
        if (this.limits.maxOutputTokens != null && this.outputTokens >= this.limits.maxOutputTokens) {
            return 'max-cost';
        }
        return null;
    }

    /** A user-facing message for an abort reason. */
    public static MessageFor(reason: VoiceAbortReason): string {
        return reason === 'max-minutes'
            ? 'Voice session time limit reached. Please start a new session or continue by text.'
            : 'Voice session usage limit reached. Please continue by text.';
    }
}
