/**
 * @fileoverview {@link LiveKitAudioMeter} — a tiny, pure, DOM-free smoother that turns a stream of raw
 * 0..1 audio levels (e.g. `participant.audioLevel`) into a smoothed level plus a set of bar bins for a
 * voice visualizer. UI layers call {@link LiveKitAudioMeter.Next} on each animation frame; keeping the
 * math here (not in a component) makes it framework-agnostic and unit-testable.
 *
 * @module @memberjunction/livekit-room-core
 */

/** The number of visualizer bars produced by {@link LiveKitAudioMeter}. */
export const AUDIO_METER_BIN_COUNT = 7;

/** Below this level the meter is treated as silent (clamps idle noise to a flat baseline). */
export const AUDIO_METER_SILENCE_FLOOR = 0.04;

/** One smoothed frame of audio-visual data. */
export interface LiveKitAudioMeterFrame {
    /** Smoothed level, 0..1. */
    Level: number;
    /** Smoothed bar bins, each 0..1, for a symmetric visualizer. */
    Bins: number[];
    /** Whether the source is effectively silent this frame. */
    IsSilent: boolean;
}

/**
 * Exponential-smoothing audio meter. Attack (rising) is faster than decay (falling) so the meter feels
 * responsive when speech starts but settles gently — the standard VU-meter feel.
 */
export class LiveKitAudioMeter {
    private smoothed = 0;
    private readonly bins: number[] = new Array(AUDIO_METER_BIN_COUNT).fill(0);

    /**
     * @param attack Smoothing factor when the level is rising, 0..1 (higher = snappier). Default 0.6.
     * @param decay Smoothing factor when the level is falling, 0..1 (lower = slower fall). Default 0.18.
     */
    constructor(
        private readonly attack = 0.6,
        private readonly decay = 0.18,
    ) {}

    /**
     * Folds the latest raw level into the smoothed state and returns the current frame.
     *
     * @param rawLevel The latest raw audio level, 0..1.
     * @returns The smoothed meter frame.
     */
    public Next(rawLevel: number): LiveKitAudioMeterFrame {
        const clamped = Math.max(0, Math.min(1, rawLevel));
        const factor = clamped > this.smoothed ? this.attack : this.decay;
        this.smoothed += (clamped - this.smoothed) * factor;

        const isSilent = this.smoothed < AUDIO_METER_SILENCE_FLOOR;
        this.updateBins(isSilent ? 0 : this.smoothed);
        return { Level: isSilent ? 0 : this.smoothed, Bins: [...this.bins], IsSilent: isSilent };
    }

    /** Resets the meter to silence. */
    public Reset(): void {
        this.smoothed = 0;
        this.bins.fill(0);
    }

    /** Updates the bar bins with a center-weighted shape scaled by the smoothed level. */
    private updateBins(level: number): void {
        const center = (AUDIO_METER_BIN_COUNT - 1) / 2;
        for (let i = 0; i < AUDIO_METER_BIN_COUNT; i++) {
            // Center bars taller than edges; add a little per-bin variation for an organic look.
            const distance = Math.abs(i - center) / center;
            const shape = 1 - distance * 0.55;
            const jitter = 0.85 + 0.15 * Math.sin(i * 1.7 + level * 6);
            const target = level * shape * jitter;
            this.bins[i] += (target - this.bins[i]) * (target > this.bins[i] ? this.attack : this.decay);
        }
    }
}
