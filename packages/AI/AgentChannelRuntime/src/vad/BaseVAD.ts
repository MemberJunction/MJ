/**
 * Base class for voice-activity-detection (VAD) implementations.
 *
 * VAD is a stream-in / stream-out transform: consume an async iterable of
 * `AudioFrame` and yield typed `VADEvent`s. The cascaded channel engine uses
 * `speech-start` as a barge-in trigger and `speech-end` (after a silence
 * timeout) as input to the turn detector.
 *
 * Concrete implementations register with `@RegisterClass(BaseVAD, '<Name>')`
 * so `VoiceCascadedConfig.vad.driverClass` can resolve them at runtime.
 *
 * See `plans/audio-agent-architecture.md` section 4.5 — VAD / Turn detection.
 */
import { AudioFrame } from '@memberjunction/ai';

/**
 * Events emitted by a VAD over the inbound audio stream.
 *
 * `AtMs` is a monotonic timestamp from when the VAD observed the transition.
 * `speech-frame` is an optional pass-through so downstream consumers can chain
 * STT directly off the VAD output without re-subscribing to the raw bus.
 */
export type VADEvent =
    | { Kind: 'speech-start'; AtMs: number }
    | { Kind: 'speech-end'; AtMs: number }
    | { Kind: 'speech-frame'; AtMs: number; Frame: AudioFrame };

/**
 * Config common to all VAD implementations. Individual subclasses may add
 * impl-specific knobs via their own constructor args.
 */
export interface VADConfig {
    /** 0..1; impl-specific scaling. Higher = more sensitive to quieter sounds. */
    Sensitivity?: number;
    /** How long of continuous silence (ms) before emitting `speech-end`. */
    SilenceTimeoutMs?: number;
    /** Expected input sample rate; impls may downsample/resample as needed. */
    SampleRateHz?: number;
}

/**
 * Abstract VAD. Subclasses implement `DetectSpeech` as an async generator.
 */
export abstract class BaseVAD {
    protected config: VADConfig;

    constructor(config?: VADConfig) {
        this.config = {
            Sensitivity: 0.5,
            SilenceTimeoutMs: 700,
            SampleRateHz: 16000,
            ...config,
        };
    }

    /**
     * Consume an inbound frame stream and emit VAD events.
     *
     * Contract: yield `speech-start` when speech begins, then optionally
     * `speech-frame` for each frame during speech, then `speech-end` after
     * `SilenceTimeoutMs` of below-threshold input.
     */
    public abstract DetectSpeech(frames: AsyncIterable<AudioFrame>): AsyncIterable<VADEvent>;

    /** Hook for the engine to reset internal state between turns. */
    public Reset(): void {
        /* default no-op */
    }
}
