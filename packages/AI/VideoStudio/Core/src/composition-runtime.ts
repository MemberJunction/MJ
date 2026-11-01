import type { VideoFormat } from './video-generation-spec.js';

/**
 * Runtime global injected into every composition page by the render worker preamble (§7.3).
 *
 * Motion Engineer compositions read frozen data, dimensions, and deterministic random numbers
 * from `window.MJVideo` instead of external network calls or unseeded `Math.random()`.
 */
export interface MJVideoRuntime {
    /** Deeply frozen copy of `RenderProjectBundle.DataSnapshot` (or `{}` when omitted). */
    readonly Data: Readonly<Record<string, unknown>>;
    /** Deterministic integer seed from `RenderProjectBundle.Seed`. */
    readonly Seed: number;
    /** Target aspect ratio format of the composition ('16:9', '9:16', or '1:1'). */
    readonly Format: VideoFormat;
    /** Composition viewport width in pixels. */
    readonly Width: number;
    /** Composition viewport height in pixels. */
    readonly Height: number;
    /** Target frame rate in frames per second. */
    readonly Fps: number;
    /** Optional total composition duration in seconds. */
    readonly DurationSeconds?: number;
    /**
     * Deterministic `mulberry32` PRNG seeded from `Seed` at load and reset to
     * `hash(Seed, Math.round(t * 1000))` before each frame's `OnFrame` dispatch.
     * Also replaces `Math.random`.
     */
    Random(): number;
    /**
     * Deterministic order-independent hash of `(Seed, ...keys)` into `[0, 1)`.
     */
    Noise(...keys: (string | number)[]): number;
    /**
     * Registers a per-frame callback invoked with the exact seek time in seconds before each frame is captured.
     */
    OnFrame(cb: (timeSeconds: number) => void): void;
}
