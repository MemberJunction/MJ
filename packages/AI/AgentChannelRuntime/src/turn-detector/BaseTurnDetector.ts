/**
 * Base class for turn-detection implementations.
 *
 * A turn detector consumes `VADEvent`s and emits higher-level `TurnEvent`s
 * that tell the channel engine "the user is done — time to respond" vs
 * "the user just paused mid-thought — keep waiting".
 *
 * Concrete implementations register with
 * `@RegisterClass(BaseTurnDetector, '<Name>')` so
 * `VoiceCascadedConfig.turnDetector.driverClass` can resolve them.
 *
 * See `plans/audio-agent-architecture.md` section 4.5.
 */
import { VADEvent } from '../vad/BaseVAD';

/**
 * `turn-end` — user finished speaking; channel engine should kick off LLM/TTS.
 * `continuation` — short pause but user is still in the same turn.
 */
export type TurnEvent =
    | { Kind: 'turn-end'; AtMs: number }
    | { Kind: 'continuation'; AtMs: number };

export interface TurnDetectorConfig {
    /**
     * Silence (ms) after a VAD `speech-end` before declaring the turn over.
     * Different from `VADConfig.SilenceTimeoutMs`, which determines when the
     * VAD itself decides speech has stopped; this is an additional grace
     * window on top, to absorb mid-sentence pauses.
     */
    TurnEndSilenceMs?: number;
}

export abstract class BaseTurnDetector {
    protected config: TurnDetectorConfig;

    constructor(config?: TurnDetectorConfig) {
        this.config = { TurnEndSilenceMs: 800, ...config };
    }

    /**
     * Consume a stream of VAD events and emit turn-level events.
     */
    public abstract DetectTurns(vadEvents: AsyncIterable<VADEvent>): AsyncIterable<TurnEvent>;

    /** Hook for the engine to reset internal state between turns. */
    public Reset(): void {
        /* default no-op */
    }
}
