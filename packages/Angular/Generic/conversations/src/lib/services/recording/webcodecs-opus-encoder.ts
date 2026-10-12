import { RECORDING_SAMPLE_RATE } from '@memberjunction/ai-core-plus';
import type { IOpusPacketEncoder } from './opus-packet-encoder';

/** The recording's Opus configuration for WebCodecs: mono 48 kHz, 32 kbps, 20 ms frames. */
export const WEBCODECS_OPUS_CONFIG: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate: RECORDING_SAMPLE_RATE,
    numberOfChannels: 1,
    bitrate: 32000,
    opus: { frameDuration: 20000 },
};

/** The slice of a WebCodecs `AudioEncoder` instance this wrapper drives. */
export type AudioEncoderLike = Pick<AudioEncoder, 'configure' | 'encode' | 'flush' | 'close' | 'state'>;

/** The WebCodecs `AudioEncoder` constructor shape (the real global satisfies it). */
export interface AudioEncoderConstructor {
    new (init: AudioEncoderInit): AudioEncoderLike;
    // case-violation-ok-legacy-back-compat: mirrors the WebCodecs static so the real `AudioEncoder` global satisfies this interface
    isConfigSupported(config: AudioEncoderConfig): Promise<AudioEncoderSupport>;
}

/** The WebCodecs `AudioData` constructor shape (the real global satisfies it). */
export interface AudioDataConstructor {
    new (init: AudioDataInit): AudioData;
}

/**
 * Opus encoding through the browser's native WebCodecs `AudioEncoder`.
 *
 * Each 48 kHz block becomes one `AudioData` whose timestamp comes from the running sample count
 * (never the wall clock), so the encoder sees one gap-free stream. The encoder emits one
 * `EncodedAudioChunk` per 20 ms packet; each is copied out immediately because a chunk's bytes are
 * only guaranteed while the callback runs.
 */
export class WebCodecsOpusEncoder implements IOpusPacketEncoder {
    public readonly Kind = 'webcodecs';
    private readonly encoder: AudioEncoderLike;
    private packets: Uint8Array[] = [];
    private samplesFed = 0;
    /** Set by the encoder's error callback or a throwing encode: later input is dropped, packets kept. */
    private failed = false;
    private closed = false;

    /** Creates and configures the encoder. Throws if `configure` does (the selector falls back to WASM). */
    constructor(audioEncoder: AudioEncoderConstructor, private readonly audioData: AudioDataConstructor) {
        this.encoder = new audioEncoder({
            output: (chunk: EncodedAudioChunk) => {
                const bytes = new Uint8Array(chunk.byteLength);
                chunk.copyTo(bytes);
                this.packets.push(bytes);
            },
            error: (error: DOMException) => {
                // The recorder keeps the packets it already has; a broken encoder must never end the call.
                console.warn(`[WebCodecsOpusEncoder] Encoder failed after ${this.samplesFed} samples — the rest of this call is not recorded:`, error);
                this.failed = true;
            },
        });
        this.encoder.configure(WEBCODECS_OPUS_CONFIG);
    }

    public Encode(pcm48k: Float32Array): void {
        if (this.failed || this.closed || pcm48k.length === 0) {
            return;
        }
        const data = new this.audioData({
            format: 'f32',
            sampleRate: RECORDING_SAMPLE_RATE,
            numberOfFrames: pcm48k.length,
            numberOfChannels: 1,
            timestamp: Math.round((this.samplesFed * 1_000_000) / RECORDING_SAMPLE_RATE),
            // AudioData needs an ArrayBuffer-backed view (not a SharedArrayBuffer one); it copies anyway.
            data: pcm48k.buffer instanceof ArrayBuffer ? (pcm48k as Float32Array<ArrayBuffer>) : new Float32Array(pcm48k),
        });
        this.samplesFed += pcm48k.length;
        try {
            this.encoder.encode(data);
        } catch (error) {
            console.warn(`[WebCodecsOpusEncoder] encode() threw at sample ${this.samplesFed} — the rest of this call is not recorded:`, error);
            this.failed = true;
        } finally {
            data.close();
        }
    }

    public async Flush(): Promise<void> {
        if (this.failed || this.closed) {
            return;
        }
        try {
            await this.encoder.flush();
        } catch (error) {
            console.warn(`[WebCodecsOpusEncoder] flush() failed after ${this.samplesFed} samples — the final packets may be missing:`, error);
        }
    }

    public TakePackets(): Uint8Array[] {
        const packets = this.packets;
        this.packets = [];
        return packets;
    }

    public Close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.encoder.state === 'closed') {
            return;
        }
        try {
            this.encoder.close();
        } catch (error) {
            console.warn('[WebCodecsOpusEncoder] close() failed:', error);
        }
    }
}
