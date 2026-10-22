/**
 * @fileoverview SHARED CHANNEL INBOUND VIDEO BRIDGE (Phase F5).
 *
 * Single shared implementation used by the Whiteboard, Remote Browser and any other channel that
 * shows the model pixels. It no longer writes to the model directly: it REGISTERS its channel as a
 * source with the session's {@link VideoSourceArbiter} and pushes frames to it, so the arbiter stays
 * the single writer of inbound video and decides which source the model sees when several are live.
 *
 * Enforces:
 *  1. Model capability & track gate: if the session has not established an inbound video track,
 *     falls back to tool-only behaviour — NO frames sent and NO errors raised.
 *  2. Cadence: the poller (when used) runs at the NEGOTIATED inbound rate, read from the client;
 *     there is no rate constant here. The arbiter and the driver enforce the same rate as a spacing.
 *  3. Clean teardown on Stop(), which also unregisters the source.
 *
 * An owner that sends frames only when its picture changes learns from {@link ChannelInboundVideoBridge.OnSourceActivated}
 * when the arbiter starts sending its source to the model again, so it can send the picture the model missed.
 *
 * @module @memberjunction/ai-realtime-client
 * @author MemberJunction.com
 */

import { NominalVideoFrameIntervalMs } from './videoPacing';
import { VideoSourceArbiter, type IVideoFrameSink, type VideoSourceKind } from './videoSourceArbiter';

/**
 * Provider implemented by a channel or surface to produce visual frames.
 */
export interface IChannelFrameProvider {
    /**
     * Returns the latest visual scene as a base64-encoded JPEG image, or null when
     * no frame is available or the surface hasn't changed.
     */
    GetLatestFrame(): Promise<string | null> | string | null;
}

/**
 * Options for the inbound channel video bridge.
 */
export interface ChannelInboundVideoBridgeOptions {
    /**
     * Target poll rate in fps for {@link ChannelInboundVideoBridge.Start}.
     *
     * @deprecated The poll follows the rate the inbound video track NEGOTIATED (the model's own
     *   ceiling), read from the client. When set, the poll runs at the lower of this and the negotiated
     *   rate; it is no longer clamped to a constant 1 fps.
     */
    Rate?: number;
    /** Output MIME type. Defaults to 'image/jpeg'. */
    MimeType?: string;
    /**
     * The id this source registers under. Defaults to a unique generated id. A channel passes a stable
     * one (`<channel>#<instance>`) so the UI can address the source.
     */
    SourceID?: string;
    /** Human-readable name used in notes to the model and in the UI's "agent can see" list. Defaults to the source id. */
    Label?: string;
    /** What kind of source this is. Defaults to `'surface'` (a channel surface, not a user capture). */
    Kind?: VideoSourceKind;
    /** The channel this source belongs to, so the UI can map it to the user's persisted per-channel choice. */
    ChannelKey?: string;
    /**
     * The arbiter to register with. Defaults to the one for the session's client
     * ({@link VideoSourceArbiter.ForSink}), which is what makes it a single writer. Override for tests.
     */
    Arbiter?: VideoSourceArbiter;
}

/** Counter behind the generated source ids. */
let generatedSourceCounter = 0;

/**
 * Shared bridge connecting a visual channel surface to the session's inbound video track, by way of
 * the session's {@link VideoSourceArbiter}.
 */
export class ChannelInboundVideoBridge {
    private timer: ReturnType<typeof setInterval> | null = null;
    private active = false;
    private frameErrorLogged = false;
    private readonly sourceId: string;
    /** The arbiter this bridge is currently registered with; `null` when it is not registered. */
    private registeredWith: VideoSourceArbiter | null = null;
    /** Whether the owner switched this source off (exposure policy or the user). Survives re-registration. */
    private sourceEnabled = true;
    /** The owner's handlers for {@link OnSourceActivated}. They survive re-registration. */
    private readonly activatedHandlers = new Set<() => void>();
    /** Stops following the arbiter's changes; `null` while not following (not registered, or no handler). */
    private stopFollowingArbiter: (() => void) | null = null;
    /** Whether the arbiter was sending this source to the model as of its last change. */
    private forwarded = false;

    /**
     * @param clientOrGetter The session's client, or a getter for it (a reconnect replaces the client). Any
     *   {@link IVideoFrameSink} works; a `BaseRealtimeClient` is one.
     * @param provider Produces the frames.
     * @param options Source identity, MIME type and the deprecated rate cap.
     */
    constructor(
        private readonly clientOrGetter: IVideoFrameSink | (() => IVideoFrameSink | null | undefined) | null | undefined,
        private readonly provider: IChannelFrameProvider,
        private readonly options: ChannelInboundVideoBridgeOptions = {}
    ) {
        this.sourceId = options.SourceID ?? `channel-video-${++generatedSourceCounter}`;
    }

    private get client(): IVideoFrameSink | null | undefined {
        return typeof this.clientOrGetter === 'function' ? this.clientOrGetter() : this.clientOrGetter;
    }

    /** The id this bridge's source is registered under. */
    public get SourceID(): string {
        return this.sourceId;
    }

    /** The arbiter for the current client, or `null` when there is no client yet. */
    private resolveArbiter(): VideoSourceArbiter | null {
        if (this.options.Arbiter) {
            return this.options.Arbiter;
        }
        const client = this.client;
        return client ? VideoSourceArbiter.ForSink(client) : null;
    }

    /**
     * Registers this bridge's source with the session's arbiter (idempotent). A new session means a new
     * client and so a new arbiter: the source is re-registered there and removed from the old one, so a
     * reconnect never leaves a ghost source behind.
     *
     * @returns The arbiter, or `null` when there is no client to register with.
     */
    private ensureRegistered(): VideoSourceArbiter | null {
        const arbiter = this.resolveArbiter();
        if (!arbiter) {
            return null;
        }
        if (this.registeredWith !== arbiter) {
            this.unfollowArbiter();
            this.registeredWith?.UnregisterSource(this.sourceId);
            arbiter.RegisterSource({
                SourceID: this.sourceId,
                Label: this.options.Label ?? this.sourceId,
                Kind: this.options.Kind ?? 'surface',
                ChannelKey: this.options.ChannelKey,
            });
            this.registeredWith = arbiter;
            if (!this.sourceEnabled) {
                arbiter.SetSourceEnabled(this.sourceId, false, false);
            }
            // Followed from here, once registered as it will stay: the registration itself is not an activation.
            this.followArbiter();
        }
        return arbiter;
    }

    /**
     * Calls `handler` each time the arbiter starts sending this source to the model after it was not: another source
     * that held the model's only stream stopped or was set aside, or this source was switched back on. The source's
     * first registration does not count. A frame offered while the source was not sent never reached the model, so an
     * owner that sends frames only when its picture changes sends its current picture here.
     *
     * The handler is kept across a re-registration (a reconnect's new client) and called until removed.
     *
     * @param handler Called synchronously from the arbiter's change event; it should not throw.
     * @returns A function that removes the handler.
     */
    public OnSourceActivated(handler: () => void): () => void {
        this.activatedHandlers.add(handler);
        this.followArbiter();
        return () => {
            this.activatedHandlers.delete(handler);
            if (this.activatedHandlers.size === 0) {
                this.unfollowArbiter();
            }
        };
    }

    /** Starts following the arbiter this source is registered with, when an owner asked to hear of activations. */
    private followArbiter(): void {
        const arbiter = this.registeredWith;
        if (!arbiter || this.stopFollowingArbiter || this.activatedHandlers.size === 0) {
            return;
        }
        this.forwarded = arbiter.GetActiveSourceIDs().includes(this.sourceId);
        this.stopFollowingArbiter = arbiter.OnChange(() => {
            const forwarded = arbiter.GetActiveSourceIDs().includes(this.sourceId);
            const activated = forwarded && !this.forwarded;
            this.forwarded = forwarded;
            if (activated) {
                this.notifyActivated();
            }
        });
    }

    /** Stops following the arbiter's changes. */
    private unfollowArbiter(): void {
        this.stopFollowingArbiter?.();
        this.stopFollowingArbiter = null;
        this.forwarded = false;
    }

    /** Calls each activation handler, containing a handler that throws. */
    private notifyActivated(): void {
        for (const handler of [...this.activatedHandlers]) {
            try {
                handler();
            } catch (err) {
                console.error('[ChannelInboundVideoBridge] Error in a source-activated handler:', err);
            }
        }
    }

    /**
     * Registers this bridge's source with the session's arbiter now, without starting any poll — so the
     * source is LISTED (and can be switched on or off) before it has pushed a frame. A source that is
     * switched off never pushes one, so without this it could never be switched back on.
     *
     * @returns `true` if registered; `false` when there is no client or no inbound video track (nothing to register with).
     */
    public Register(): boolean {
        const client = this.client;
        if (!client || !client.IsTrackEstablished('video', 'inbound')) {
            return false;
        }
        return this.ensureRegistered() !== null;
    }

    /**
     * Starts the periodic frame pump if the session has an established inbound video track.
     *
     * @returns `true` if video streaming was started; `false` if the model does not support
     *   inbound video (or track was not established), falling back to tool-only behaviour.
     */
    public Start(): boolean {
        if (this.active) {
            return true;
        }
        const client = this.client;
        if (!client || !client.IsTrackEstablished('video', 'inbound')) {
            // Non-video model or unrequested video track: graceful fallback with no error
            return false;
        }
        this.ensureRegistered();
        this.active = true;
        this.timer = setInterval(() => {
            void this.pumpFrame();
        }, this.pollIntervalMs(client));
        return true;
    }

    /** The poll interval: the negotiated rate, capped by the (deprecated) `Rate` option when one was given. */
    private pollIntervalMs(client: IVideoFrameSink): number {
        const negotiated = client.InboundVideoRate;
        const requested = this.options.Rate;
        const rate =
            typeof requested === 'number' && requested > 0
                ? Math.max(0.1, typeof negotiated === 'number' ? Math.min(requested, negotiated) : requested)
                : negotiated;
        return NominalVideoFrameIntervalMs(rate);
    }

    /**
     * Offers a frame to the arbiter, which forwards it only if this source is among those the model
     * should see (and enabled, and inside the negotiated pacing interval).
     *
     * @returns `true` if dispatched to the model; `false` otherwise.
     */
    private sendFrameDirect(base64Jpeg: string): boolean {
        const client = this.client;
        if (!client || !client.IsTrackEstablished('video', 'inbound')) {
            return false;
        }
        if (typeof client.SendVideoFrame !== 'function') {
            return false;
        }
        const arbiter = this.ensureRegistered();
        return arbiter ? arbiter.PushFrame(this.sourceId, base64Jpeg, this.options.MimeType ?? 'image/jpeg') : false;
    }

    /**
     * Pushes an event-driven frame (e.g. screencast push from RemoteBrowser or stroke completion).
     * Registers the source on first use, so a purely event-driven channel never needs {@link Start}.
     *
     * @param base64Jpeg The base64-encoded image frame.
     * @returns `true` if the frame was sent; `false` if dropped (throttled, not the source the model is
     *   viewing, turned off, track unestablished, or driver lacks video support).
     */
    public PushFrame(base64Jpeg: string): boolean {
        return this.sendFrameDirect(base64Jpeg);
    }

    /**
     * Turns this source on or off at the arbiter (a no-op before the first registration other than
     * remembering the choice). A disabled source is not a candidate and forwards nothing.
     *
     * @param enabled Whether the model may see this source.
     * @param notify Whether the arbiter tells the model. Pass `false` when the caller sends its own note.
     */
    public SetSourceEnabled(enabled: boolean, notify = true): void {
        this.sourceEnabled = enabled;
        this.registeredWith?.SetSourceEnabled(this.sourceId, enabled, notify);
    }

    /**
     * Periodic poll tick that fetches the latest frame from the provider and pushes it.
     * Uses `sendFrameDirect` so periodic polling paced by `setInterval` does not fight
     * the `PushFrame` delta guard when provider latency varies between ticks (Reviewer Item 25).
     */
    private async pumpFrame(): Promise<void> {
        if (!this.active) {
            return;
        }
        try {
            const frame = await this.provider.GetLatestFrame();
            this.frameErrorLogged = false;
            if (frame && frame.length > 0 && this.active) {
                this.sendFrameDirect(frame);
            }
        } catch (err) {
            if (!this.frameErrorLogged) {
                this.frameErrorLogged = true;
                console.error('[ChannelInboundVideoBridge] Error fetching frame from provider (suppressing repeats until next success):', err);
            }
        }
    }

    /**
     * Stops the bridge: clears the poll timer and removes this source from the arbiter. Activation handlers stay, and
     * are called again if the source registers again.
     */
    public Stop(): void {
        this.active = false;
        this.frameErrorLogged = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.unfollowArbiter();
        this.registeredWith?.UnregisterSource(this.sourceId);
        this.registeredWith = null;
    }

    /** Whether the video bridge is currently actively pumping frames. */
    public get IsActive(): boolean {
        return this.active;
    }
}
