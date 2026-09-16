/**
 * @fileoverview SHARED CHANNEL INBOUND VIDEO BRIDGE (Phase F5).
 *
 * Single shared implementation used by both Whiteboard and Remote Browser channels
 * to source inbound video frames into a realtime session when the model supports it.
 *
 * Enforces:
 *  1. Model capability & track gate: if the session has not established an inbound video track,
 *     falls back to tool-only behaviour — NO frames sent and NO errors raised.
 *  2. Cadence throttling: capped at 1 frame per second maximum (1 fps ceiling per Live API capabilities guide).
 *  3. Clean teardown on Stop().
 *
 * @module @memberjunction/ai-realtime-client
 * @author MemberJunction.com
 */

import type { BaseRealtimeClient } from '../generic/baseRealtimeClient';

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
    /** Target frame rate in fps (capped at 1 fps maximum). Defaults to 1. */
    Rate?: number;
    /** Output MIME type. Defaults to 'image/jpeg'. */
    MimeType?: string;
}

/**
 * Shared bridge connecting a visual channel surface to the session's inbound video track.
 */
export class ChannelInboundVideoBridge {
    private timer: ReturnType<typeof setInterval> | null = null;
    private active = false;
    private frameErrorLogged = false;

    constructor(
        private readonly clientOrGetter: BaseRealtimeClient | (() => BaseRealtimeClient | null | undefined) | null | undefined,
        private readonly provider: IChannelFrameProvider,
        private readonly options: ChannelInboundVideoBridgeOptions = {}
    ) {}

    private get client(): BaseRealtimeClient | null | undefined {
        return typeof this.clientOrGetter === 'function' ? this.clientOrGetter() : this.clientOrGetter;
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
        if (!this.client || !this.client.IsTrackEstablished('video', 'inbound')) {
            // Non-video model or unrequested video track: graceful fallback with no error
            return false;
        }
        this.active = true;
        const rate = Math.min(Math.max(this.options.Rate ?? 1, 0.1), 1);
        const intervalMs = Math.floor(1000 / rate);
        this.timer = setInterval(() => {
            void this.pumpFrame();
        }, intervalMs);
        return true;
    }

    /**
     * Directly sends a frame through the client when the inbound video track is established
     * and the client implements `SendVideoFrame`.
     *
     * @returns `true` if dispatched to the client; `false` otherwise.
     */
    private sendFrameDirect(base64Jpeg: string): boolean {
        if (!this.client || !this.client.IsTrackEstablished('video', 'inbound')) {
            return false;
        }
        if (typeof this.client.SendVideoFrame !== 'function') {
            return false;
        }
        return Boolean(this.client.SendVideoFrame(base64Jpeg, this.options.MimeType ?? 'image/jpeg'));
    }

    /**
     * Pushes an event-driven frame (e.g. screencast push from RemoteBrowser or stroke completion).
     * Dispatches directly to the client's authoritative throttle gate.
     *
     * @param base64Jpeg The base64-encoded image frame.
     * @returns `true` if the frame was sent; `false` if dropped (throttled, track unestablished, or driver lacks video support).
     */
    public PushFrame(base64Jpeg: string): boolean {
        return this.sendFrameDirect(base64Jpeg);
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
     * Stops the bridge and clears any active polling timer.
     */
    public Stop(): void {
        this.active = false;
        this.frameErrorLogged = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /** Whether the video bridge is currently actively pumping frames. */
    public get IsActive(): boolean {
        return this.active;
    }
}
