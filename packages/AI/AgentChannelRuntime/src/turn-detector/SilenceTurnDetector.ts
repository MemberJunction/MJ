/**
 * Trivial silence-based turn detector.
 *
 * Strategy: when VAD emits `speech-end`, mark the timestamp and enter a
 * post-speech state. The next time we observe a VAD event, if the gap since
 * `speech-end` exceeds `TurnEndSilenceMs` and the user hasn't resumed
 * speaking, emit `turn-end`. If the user resumes speaking (`speech-start`)
 * within the window, emit `continuation` and reset.
 *
 * See `plans/audio-agent-architecture.md` section 4.5.
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseTurnDetector, TurnDetectorConfig, TurnEvent } from './BaseTurnDetector';
import { VADEvent } from '../vad/BaseVAD';

@RegisterClass(BaseTurnDetector, 'SilenceTurnDetector')
export class SilenceTurnDetector extends BaseTurnDetector {
    constructor(config?: TurnDetectorConfig) {
        super(config);
    }

    public async *DetectTurns(vadEvents: AsyncIterable<VADEvent>): AsyncIterable<TurnEvent> {
        const turnEndSilenceMs = this.config.TurnEndSilenceMs ?? 800;
        let lastSpeechEndAtMs: number | null = null;
        let turnEmitted = false;

        for await (const event of vadEvents) {
            if (event.Kind === 'speech-end') {
                lastSpeechEndAtMs = event.AtMs;
                turnEmitted = false;
            } else if (event.Kind === 'speech-start') {
                if (lastSpeechEndAtMs !== null && !turnEmitted) {
                    const gap = event.AtMs - lastSpeechEndAtMs;
                    if (gap < turnEndSilenceMs) {
                        yield { Kind: 'continuation', AtMs: event.AtMs };
                    }
                }
                lastSpeechEndAtMs = null;
                turnEmitted = false;
            } else if (event.Kind === 'speech-frame') {
                if (
                    lastSpeechEndAtMs !== null &&
                    !turnEmitted &&
                    event.AtMs - lastSpeechEndAtMs >= turnEndSilenceMs
                ) {
                    yield { Kind: 'turn-end', AtMs: event.AtMs };
                    turnEmitted = true;
                    lastSpeechEndAtMs = null;
                }
            }
        }
    }
}
