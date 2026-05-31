/**
 * Simple RMS-energy threshold VAD. Default fallback when a heavier ML VAD
 * (e.g. SileroVAD) isn't available. Operates on signed 16-bit little-endian
 * PCM frames — that's the canonical raw format on the frame bus.
 *
 * Threshold derivation:
 *   threshold = 800 + (1 - Sensitivity) * 4000
 * giving roughly:
 *   Sensitivity=1.0 -> 800   (very sensitive, picks up quiet voices)
 *   Sensitivity=0.5 -> 2800  (default)
 *   Sensitivity=0.0 -> 4800  (only loud speech triggers)
 *
 * See `plans/audio-agent-architecture.md` section 4.5.
 */
import { RegisterClass } from '@memberjunction/global';
import { AudioFrame } from '@memberjunction/ai';
import { BaseVAD, VADConfig, VADEvent } from './BaseVAD';

@RegisterClass(BaseVAD, 'EnergyVAD')
export class EnergyVAD extends BaseVAD {
    constructor(config?: VADConfig) {
        super(config);
    }

    public async *DetectSpeech(frames: AsyncIterable<AudioFrame>): AsyncIterable<VADEvent> {
        const threshold = 800 + (1 - (this.config.Sensitivity ?? 0.5)) * 4000;
        const silenceTimeoutMs = this.config.SilenceTimeoutMs ?? 700;

        let inSpeech = false;
        let lastSpeechAtMs = 0;
        let clockMs = 0;

        for await (const frame of frames) {
            if (frame.mediaType !== 'audio/pcm') {
                throw new Error(
                    `EnergyVAD requires PCM frames (signed 16-bit LE); received '${frame.mediaType}'. Decode upstream in the transport adapter.`
                );
            }

            const rms = computeRms16(frame.data);
            const frameMs = frameDurationMs(frame);
            clockMs += frameMs;

            if (rms >= threshold) {
                if (!inSpeech) {
                    inSpeech = true;
                    yield { Kind: 'speech-start', AtMs: clockMs };
                }
                lastSpeechAtMs = clockMs;
                yield { Kind: 'speech-frame', AtMs: clockMs, Frame: frame };
            } else if (inSpeech && clockMs - lastSpeechAtMs >= silenceTimeoutMs) {
                inSpeech = false;
                yield { Kind: 'speech-end', AtMs: clockMs };
            }
        }
    }
}

/** Compute RMS of signed-16-bit little-endian PCM samples. Pure. */
function computeRms16(data: Uint8Array): number {
    const sampleCount = Math.floor(data.byteLength / 2);
    if (sampleCount === 0) return 0;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let sumSquares = 0;
    for (let i = 0; i < sampleCount; i++) {
        const sample = view.getInt16(i * 2, true);
        sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / sampleCount);
}

/** Duration of a PCM frame in ms, derived from byte length and sample rate. Pure. */
function frameDurationMs(frame: AudioFrame): number {
    const bytesPerSample = 2 * Math.max(1, frame.channelCount);
    const sampleCount = Math.floor(frame.data.byteLength / bytesPerSample);
    return (sampleCount / frame.sampleRateHz) * 1000;
}
