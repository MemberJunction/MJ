/**
 * First-class barge-in / cancellation signal hub.
 *
 * Concrete (not skeleton) because engines, VAD, transports, and `BaseAgent`
 * cancellation tokens all need a shared signal type from day one. The runtime
 * constructs one `InterruptChannel` per `ChannelSession` and threads it through
 * `ChannelRunContext`.
 *
 * Semantics:
 *  - `Fire()` is idempotent in the sense that the first call wins for `LastReason`,
 *    but every call notifies subscribers (so a `user-text` interrupt after a
 *    `user-speech-start` interrupt still wakes listeners that care about text).
 *  - `Reset()` is meant for engines that recycle a session across turns.
 *
 * See `plans/audio-agent-architecture.md` section 3.1 / 4 (duplex cancel).
 */

/**
 * Why an in-flight assistant turn is being interrupted.
 */
export type InterruptReason =
    | { Kind: 'user-speech-start' }
    | { Kind: 'user-text' }
    | { Kind: 'caller-hangup' }
    | { Kind: 'manual' };

export class InterruptChannel {
    private listeners: Array<(reason: InterruptReason) => void> = [];
    private isFired = false;
    private lastReason: InterruptReason | undefined;

    /** True once `Fire()` has been called at least once. */
    public get IsFired(): boolean {
        return this.isFired;
    }

    /** Reason recorded by the first `Fire()` call (subsequent fires also notify but don't overwrite). */
    public get LastReason(): InterruptReason | undefined {
        return this.lastReason;
    }

    /**
     * Trigger an interrupt. All current subscribers are notified; the first call
     * sets `IsFired` and `LastReason`.
     */
    public Fire(reason: InterruptReason): void {
        if (!this.isFired) {
            this.isFired = true;
            this.lastReason = reason;
        }
        // Iterate a snapshot so handlers that unsubscribe during dispatch don't skip siblings.
        const snapshot = this.listeners.slice();
        for (const l of snapshot) {
            l(reason);
        }
    }

    /**
     * Subscribe to interrupt notifications. Returns a disposer that removes the
     * handler.
     */
    public On(handler: (reason: InterruptReason) => void): () => void {
        this.listeners.push(handler);
        return () => {
            const i = this.listeners.indexOf(handler);
            if (i >= 0) this.listeners.splice(i, 1);
        };
    }

    /**
     * Clear fired state — used by engines that reuse one `InterruptChannel`
     * across multiple turns within a single session.
     */
    public Reset(): void {
        this.isFired = false;
        this.lastReason = undefined;
    }
}
