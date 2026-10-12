/**
 * @fileoverview Frame pacing derived from the NEGOTIATED inbound video rate.
 *
 * The rate a model accepts is per-model data (`MaxInboundVideoRate` in the provider's profile table),
 * carried into the live track descriptor by track negotiation. Every layer that paces frames — the
 * source arbiter, the driver's own backstop — asks THIS module what that rate means in milliseconds, so
 * there is one answer to "how often may a frame go out" rather than a constant per layer.
 *
 * Framework-neutral and dependency-free, so it can move into a `/media` subpath without a rewrite.
 *
 * @module @memberjunction/ai-realtime-client
 */

/**
 * The share of the nominal frame interval a pacer enforces as a MINIMUM spacing. Pacers upstream of
 * the driver run on timers that jitter; enforcing exactly `1000 / rate` would drop a frame that arrived a
 * few milliseconds early. At 1 fps this is the 750 ms backstop the Gemini driver has always applied.
 */
export const VIDEO_FRAME_JITTER_HEADROOM = 0.75;

/** The rate assumed when none was negotiated: 1 frame per second, the Live API ceiling today. */
export const DEFAULT_INBOUND_VIDEO_RATE = 1;

/**
 * The nominal interval between frames, in milliseconds, for a negotiated rate (frames per second).
 * An absent, zero, negative or non-finite rate falls back to {@link DEFAULT_INBOUND_VIDEO_RATE}.
 */
export function NominalVideoFrameIntervalMs(rate: number | undefined | null): number {
    const effective = typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_INBOUND_VIDEO_RATE;
    return Math.floor(1000 / effective);
}

/**
 * The minimum spacing, in milliseconds, a pacer should enforce between two frames to the model: the
 * nominal interval less jitter headroom ({@link VIDEO_FRAME_JITTER_HEADROOM}).
 */
export function MinVideoFrameSpacingMs(rate: number | undefined | null): number {
    return Math.floor(NominalVideoFrameIntervalMs(rate) * VIDEO_FRAME_JITTER_HEADROOM);
}
