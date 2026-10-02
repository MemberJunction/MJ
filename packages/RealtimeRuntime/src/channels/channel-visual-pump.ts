/**
 * @fileoverview The **change-driven visual frame pump** — lifted out of the Whiteboard channel so
 * every channel that can show the model pixels does it the same, well-behaved way.
 *
 * The pump decides *when* a frame is worth sending, never *what* a frame looks like (that is the
 * channel's `GetLatestFrame`) and never *how* it reaches the model (that is the injected sink).
 * Its behavior is exactly what the Whiteboard shipped:
 *
 * - **Change-driven, no idle heartbeat.** A frame is produced only because state changed. A static
 *   surface costs nothing: no timer runs, no frame is rendered, no tokens are spent.
 * - **Negotiated cadence.** Frames are paced to the rate the inbound video track was negotiated at
 *   (a model-profile ceiling), clamped to a floor so a fast model never makes the channel spin.
 * - **Leading edge, then trailing settle.** The first change after quiet sends a frame immediately;
 *   changes inside the cooldown arm ONE trailing timer, so the model always ends up seeing the
 *   final resting state of a burst — not an intermediate frame it will never be corrected from.
 * - **Dedupe.** A frame identical to the last one sent is dropped (a user nudging a shape back to
 *   where it was costs nothing).
 * - **One confirmation frame after an agent edit**, with a note telling the model not to narrate
 *   its own change — the agent should *see* what it did without announcing it.
 *
 * Every frame pushed is reported with the **change id** of the state it was captured at, so a
 * consumer can verify that pixels and the state events describing the same moment agree.
 *
 * Standalone (injected clock-free: it reads `Date.now()` and `setTimeout`, both fakeable) so the
 * whole behavior is unit-testable with fake timers and no channel, session or DOM.
 *
 * @module @memberjunction/realtime-runtime
 */

/** Why a frame was pushed. */
export type VisualFrameReason = 'change' | 'settle' | 'confirmation';

/** The slice of the shared video bridge the pump writes to. */
export interface VisualFrameSink {
    /** Pushes one base64 JPEG frame; returns whether it was dispatched. */
    PushFrame(base64Jpeg: string): boolean;
}

/** How the pump reaches the channel and the session. */
export interface VisualPerceptionPumpHost {
    /** The sink frames are written to, creating it if needed; `null` when there is none (no session/client yet). */
    GetSink(): VisualFrameSink | null;
    /** Whether the session has an established inbound video track — without one the pump is inert. */
    IsInboundVideoEstablished(): boolean;
    /** The frame cadence the track negotiated, in ms (the caller clamps it to its floor). */
    GetCadenceMs(): number;
    /** Renders the current frame as a base64 JPEG, or `null` when none is available. */
    CaptureFrame(): Promise<string | null>;
    /** The id of the latest state change — read at capture time to tag the frame. */
    GetChangeId(): number;
    /** Reports a pushed frame (for `Events$`, diagnostics, tests). */
    OnFramePushed(frame: string, reason: VisualFrameReason, changeId: number): void;
    /** Sends the "do not narrate your own change" note after a confirmation frame. */
    SendConfirmationNote(changeId: number): void;
    /** Logs a problem; the pump never throws into a timer or an unawaited promise. */
    OnError(context: string, error: unknown): void;
}

/**
 * The change-driven pump. One per channel instance, created by `EnableVisualPerception`.
 */
export class VisualPerceptionPump {
    /** Epoch ms of the last frame pushed; 0 before the first. */
    private lastPushTimestamp = 0;
    /** The last frame pushed, for dedupe. */
    private lastPushedFrame: string | null = null;
    /** The trailing settle timer; non-null while armed. */
    private trailingTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly host: VisualPerceptionPumpHost) {}

    /**
     * A user-originated (or scene-replacing) change happened: push a frame, respecting the cadence.
     * Resolves once the decision has been carried out; never rejects.
     */
    public async OnChange(): Promise<void> {
        try {
            if (!this.canPush()) {
                return;
            }
            const elapsed = Date.now() - this.lastPushTimestamp;
            const cadenceMs = this.host.GetCadenceMs();
            if (elapsed >= cadenceMs) {
                this.cancelTrailing();
                await this.captureAndPush('change');
            } else {
                this.armTrailing(Math.max(0, cadenceMs - elapsed));
            }
        } catch (error) {
            this.host.OnError('change', error);
        }
    }

    /**
     * An AGENT change succeeded: push exactly one confirmation frame immediately (cancelling any
     * pending settle — the confirmation IS the settled state) and tell the model not to narrate it.
     * No frame, no note, when nothing could be captured.
     */
    public async Confirm(): Promise<void> {
        try {
            if (!this.canPush()) {
                return;
            }
            this.cancelTrailing();
            const changeId = this.host.GetChangeId();
            const frame = await this.host.CaptureFrame();
            if (frame) {
                this.push(frame, 'confirmation', changeId);
                this.host.SendConfirmationNote(changeId);
            }
        } catch (error) {
            this.host.OnError('confirmation', error);
        }
    }

    /** Cancels a pending trailing settle without forgetting the dedupe frame (used when a channel is re-initialized). */
    public CancelPending(): void {
        this.cancelTrailing();
    }

    /** Cancels the trailing timer and forgets the dedupe frame. Call at teardown. */
    public Dispose(): void {
        this.cancelTrailing();
        this.lastPushedFrame = null;
    }

    /** Whether a frame can be pushed right now (a sink exists and the video track is up). */
    private canPush(): boolean {
        return this.host.GetSink() !== null && this.host.IsInboundVideoEstablished();
    }

    /** Captures the current frame and pushes it unless it duplicates the last one. */
    private async captureAndPush(reason: VisualFrameReason): Promise<void> {
        const changeId = this.host.GetChangeId();
        const frame = await this.host.CaptureFrame();
        if (frame && frame !== this.lastPushedFrame) {
            this.push(frame, reason, changeId);
        }
    }

    /** Arms the single trailing settle timer if it is not already armed. */
    private armTrailing(delayMs: number): void {
        if (this.trailingTimer !== null) {
            return;
        }
        this.trailingTimer = setTimeout(() => {
            this.trailingTimer = null;
            void this.settle();
        }, delayMs);
    }

    /** The trailing settle: push the resting frame if the track is still up and it changed. */
    private async settle(): Promise<void> {
        try {
            if (!this.host.IsInboundVideoEstablished()) {
                return;
            }
            await this.captureAndPush('settle');
        } catch (error) {
            this.host.OnError('settle', error);
        }
    }

    private cancelTrailing(): void {
        if (this.trailingTimer !== null) {
            clearTimeout(this.trailingTimer);
            this.trailingTimer = null;
        }
    }

    /** Pushes a frame through the sink and records it. */
    private push(frame: string, reason: VisualFrameReason, changeId: number): void {
        this.lastPushTimestamp = Date.now();
        this.lastPushedFrame = frame;
        this.host.GetSink()?.PushFrame(frame);
        this.host.OnFramePushed(frame, reason, changeId);
    }
}
