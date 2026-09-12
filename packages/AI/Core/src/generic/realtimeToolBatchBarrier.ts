/**
 * Coordinates batched tool-call completions for realtime sessions that require
 * a single turn-continuation trigger (e.g. OpenAI Live `response.create`) per
 * batch of parallel tool calls, rather than firing per tool result.
 *
 * Requirements (§4.2 / §4.3 of plans/realtime/gpt-live-1.md):
 * - Multiple parallel tool calls arrive in a single turn.
 * - Each tool output must be appended (e.g. `response.item.create`).
 * - Exactly ONE `response.create` must be sent when the outstanding set drains.
 * - A safety timeout ensures a lost or unreturned tool call does not wedge the session indefinitely.
 * - Unknown or duplicate results for already closed calls never re-fire response.create.
 */
export class RealtimeToolBatchBarrier {
    private _outstanding = new Set<string>();
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _onTimeoutFlush?: () => void;
    private _timeoutMs: number;

    /**
     * @param defaultTimeoutMs Maximum time in milliseconds to wait for remaining tool results before flushing (default 15s).
     */
    constructor(defaultTimeoutMs: number = 15000) {
        this._timeoutMs = defaultTimeoutMs;
    }

    /**
     * Records an outstanding tool call ID that must be answered.
     * @param callId The tool call identifier.
     * @param onTimeoutFlush Optional callback to invoke if the batch times out waiting for remaining results.
     */
    public Opened(callId: string, onTimeoutFlush?: () => void): void {
        if (!callId) {
            return;
        }
        this._outstanding.add(callId);
        if (onTimeoutFlush) {
            this._onTimeoutFlush = onTimeoutFlush;
        }
        this.resetTimeout();
    }

    /**
     * Alias for Opened.
     */
    public TrackPendingCall(callId: string, onTimeoutFlush?: () => void): void {
        this.Opened(callId, onTimeoutFlush);
    }

    /**
     * Returns true when THIS result drains the batch and the caller should send response.create.
     * If the call was not in the outstanding set (unknown or duplicate), returns false.
     *
     * @param callId The tool call identifier.
     */
    public Closed(callId: string): boolean {
        if (!this._outstanding.delete(callId)) {
            return false; // unknown or duplicate result — never re-fire
        }
        if (this._outstanding.size === 0) {
            this.clearTimeout();
            return true;
        }
        this.resetTimeout();
        return false;
    }

    /**
     * Alias for Closed.
     */
    public RecordResult(callId: string): boolean {
        return this.Closed(callId);
    }

    /**
     * Returns true if there are no outstanding tool calls.
     */
    public get IsEmpty(): boolean {
        return this._outstanding.size === 0;
    }

    /**
     * Number of tool calls still awaiting results in the current batch.
     */
    public get PendingCount(): number {
        return this._outstanding.size;
    }

    /**
     * Arms or re-arms the timeout with a custom duration and callback.
     */
    public ArmTimeout(ms: number, onTimeoutFlush: () => void): void {
        this._timeoutMs = ms;
        this._onTimeoutFlush = onTimeoutFlush;
        this.resetTimeout();
    }

    /**
     * Resets the barrier state and cancels any pending timeout (alias for Clear).
     */
    public Reset(): void {
        this.Clear();
    }

    /**
     * Clears all pending tool calls and cancels any active timeout (e.g. on user interruption,
     * error, or session close).
     */
    public Clear(): void {
        this._outstanding.clear();
        this.clearTimeout();
    }

    private resetTimeout(): void {
        this.clearTimeout();
        if (this._outstanding.size > 0 && this._onTimeoutFlush) {
            this._timer = setTimeout(() => {
                this._timer = null;
                if (this._outstanding.size > 0) {
                    this._outstanding.clear();
                    this._onTimeoutFlush?.();
                }
            }, this._timeoutMs);
        }
    }

    private clearTimeout(): void {
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
    }
}
