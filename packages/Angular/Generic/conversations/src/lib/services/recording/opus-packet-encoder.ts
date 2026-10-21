import { RECORDING_SAMPLE_RATE } from '@memberjunction/ai-core-plus';
import { WasmOpusEncoder } from './wasm-opus-encoder';
import {
    AudioDataConstructor,
    AudioEncoderConstructor,
    WEBCODECS_OPUS_CONFIG,
    WebCodecsOpusEncoder,
} from './webcodecs-opus-encoder';

/**
 * One continuous Opus encoder for a whole call: mono, 48 kHz, 32 kbps, 20 ms (960-sample) packets.
 *
 * Every packet it emits is one raw Opus packet (no container), in capture order. The runtime cuts
 * that stream into `MJOPUS1` shards and the server decodes all packets with one libopus decoder,
 * which is why the call must keep a single encoder from start to finish: encoder state carries
 * across packets, so switching encoders mid-call would corrupt the join.
 */
export interface IOpusPacketEncoder {
    /** Which implementation this is, for logs and tests. */
    readonly Kind: 'webcodecs' | 'wasm';
    /**
     * Queues 48 kHz mono samples for encoding. Any length; the encoder frames them into 960-sample
     * packets itself. The caller keeps ownership of `pcm48k` (the encoder copies what it needs).
     * Never throws: an encoder fault is logged and later input is dropped.
     */
    Encode(pcm48k: Float32Array): void;
    /**
     * Encodes everything queued, padding a final partial frame with silence, and resolves once those
     * packets are available to {@link TakePackets}. Never rejects; a fault or timeout is logged.
     */
    Flush(): Promise<void>;
    /** Returns the packets produced since the previous call and forgets them. Works after {@link Close}. */
    TakePackets(): Uint8Array[];
    /** Releases the encoder. Idempotent; packets already produced stay available to {@link TakePackets}. */
    Close(): void;
}

/** The platform pieces {@link SelectOpusPacketEncoder} chooses between. Injectable for tests. */
export interface OpusEncoderEnvironment {
    /** The WebCodecs `AudioEncoder` constructor, or `null` where the platform has none. */
    AudioEncoder: AudioEncoderConstructor | null;
    /** The WebCodecs `AudioData` constructor, or `null` where the platform has none. */
    AudioData: AudioDataConstructor | null;
    /** Starts the libopus WebAssembly encoder (the fallback). */
    CreateWasmEncoder: () => Promise<IOpusPacketEncoder>;
}

/** The real browser environment: WebCodecs globals when present, the libopus Worker otherwise. */
export function BrowserOpusEncoderEnvironment(): OpusEncoderEnvironment {
    return {
        AudioEncoder: typeof AudioEncoder === 'undefined' ? null : AudioEncoder,
        AudioData: typeof AudioData === 'undefined' ? null : AudioData,
        CreateWasmEncoder: () => WasmOpusEncoder.Create(),
    };
}

/**
 * Picks the call's encoder, once, at recording start.
 *
 * WebCodecs is preferred (native, no 440 KB download) but only when the browser says it can encode
 * exactly our configuration: `AudioEncoder` existing is not enough, because Safari shipped
 * `AudioEncoder` long before it supported Opus in it. Anything else — no WebCodecs, an unsupported
 * config, a support probe or configure that throws — falls back to libopus in a Worker. A failure
 * of the fallback rejects, and the recorder treats that as "recording off" for the call.
 */
export async function SelectOpusPacketEncoder(env: OpusEncoderEnvironment = BrowserOpusEncoderEnvironment()): Promise<IOpusPacketEncoder> {
    const webCodecs = await tryCreateWebCodecsEncoder(env);
    return webCodecs ?? env.CreateWasmEncoder();
}

async function tryCreateWebCodecsEncoder(env: OpusEncoderEnvironment): Promise<IOpusPacketEncoder | null> {
    if (!env.AudioEncoder || !env.AudioData) {
        return null;
    }
    try {
        const support = await env.AudioEncoder.isConfigSupported(WEBCODECS_OPUS_CONFIG);
        if (support.supported !== true) {
            return null;
        }
        return new WebCodecsOpusEncoder(env.AudioEncoder, env.AudioData);
    } catch (error) {
        console.warn(
            `[OpusPacketEncoder] WebCodecs Opus at ${RECORDING_SAMPLE_RATE} Hz could not be set up — using the libopus WebAssembly encoder instead:`,
            error,
        );
        return null;
    }
}
