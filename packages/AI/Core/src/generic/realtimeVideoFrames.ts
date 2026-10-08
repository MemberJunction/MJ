/**
 * @fileoverview The frame math every sender of still video frames shares: how often a frame may go to the model, and
 * how large it is.
 *
 * Two senders turn video into still frames for a realtime model: the browser's frame sampler (a call) and an agent's
 * bot in a meeting. The rate comes from the model (its negotiated inbound video rate) and the size cap from the sender;
 * these functions turn both into numbers once, so the two senders can't drift apart. `@memberjunction/ai-realtime-client`
 * keeps its own names for them (`ScaleToMaxDimension`, `NominalVideoFrameIntervalMs`, `MinVideoFrameSpacingMs`) as thin
 * wrappers.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

/** The rate assumed when none was negotiated: 1 frame per second, the Live API ceiling today. */
export const REALTIME_DEFAULT_INBOUND_VIDEO_RATE = 1;

/**
 * The share of the nominal frame interval a pacer enforces as a MINIMUM spacing. Pacers upstream of the driver run on
 * timers that jitter; enforcing exactly `1000 / rate` would drop a frame that arrived a few milliseconds early. At 1 fps
 * this is the 750 ms backstop the Gemini driver has always applied.
 */
export const REALTIME_VIDEO_FRAME_JITTER_HEADROOM = 0.75;

/** A video frame's size in pixels. */
export interface RealtimeVideoFrameSize {
    /** Width in pixels. */
    Width: number;
    /** Height in pixels. */
    Height: number;
}

/**
 * The nominal interval between frames, in milliseconds, for a rate in frames per second. An absent, zero, negative or
 * non-finite rate falls back to {@link REALTIME_DEFAULT_INBOUND_VIDEO_RATE}.
 *
 * @param rate The negotiated inbound video rate, if any.
 */
export function RealtimeVideoFrameIntervalMs(rate: number | undefined | null): number {
    const effective = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : REALTIME_DEFAULT_INBOUND_VIDEO_RATE;
    return Math.floor(1000 / effective);
}

/**
 * The minimum spacing, in milliseconds, a pacer enforces between two frames to the model: the nominal interval less
 * jitter headroom ({@link REALTIME_VIDEO_FRAME_JITTER_HEADROOM}).
 *
 * @param rate The negotiated inbound video rate, if any.
 */
export function RealtimeMinVideoFrameSpacingMs(rate: number | undefined | null): number {
    return Math.floor(RealtimeVideoFrameIntervalMs(rate) * REALTIME_VIDEO_FRAME_JITTER_HEADROOM);
}

/**
 * The size a frame is sent at: its own size, or scaled down so the longer side is at most `maxDimension` pixels. Never
 * enlarges, and never returns a side smaller than 1.
 *
 * @param size The frame's own size.
 * @param maxDimension The cap on the longer side; `undefined` or a non-positive value means no cap.
 */
export function ScaleRealtimeVideoFrame(size: RealtimeVideoFrameSize, maxDimension?: number): RealtimeVideoFrameSize {
    const longer = Math.max(size.Width, size.Height);
    if (!maxDimension || maxDimension <= 0 || longer <= maxDimension) {
        return { Width: size.Width, Height: size.Height };
    }
    const scale = maxDimension / longer;
    return {
        Width: Math.max(1, Math.round(size.Width * scale)),
        Height: Math.max(1, Math.round(size.Height * scale)),
    };
}
