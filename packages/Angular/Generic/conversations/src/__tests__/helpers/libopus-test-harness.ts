import { LIBOPUS_WASM_BASE64 } from '../../lib/services/recording/libopus-wasm-binary';
import { LIBOPUS_WORKER_SOURCE, OpusWorkerReply, OpusWorkerRequest } from '../../lib/services/recording/libopus-worker-source';
import type { OpusWorkerPort } from '../../lib/services/recording/wasm-opus-encoder';

/**
 * Test-side access to the REAL embedded libopus build: a decoder (what the server does with the
 * shards), a direct encoder (to back a fake WebCodecs `AudioEncoder`), and an in-process run of the
 * Worker source. Node has no Worker-from-Blob, so the worker body is evaluated with a fake `self`.
 */

const FRAME_SAMPLES = 960;
const MAX_PACKET_BYTES = 4000;
const MAX_DECODE_SAMPLES = 5760;

/** The libopus exports the tests call. */
interface LibopusExports {
    memory: WebAssembly.Memory;
    malloc(size: number): number;
    opus_encoder_get_size(channels: number): number;
    opus_encoder_init(state: number, rate: number, channels: number, application: number): number;
    opus_encoder_ctl_set(state: number, request: number, value: number): number;
    opus_encode(state: number, pcm: number, frameSize: number, out: number, maxBytes: number): number;
    opus_decoder_get_size(channels: number): number;
    opus_decoder_init(state: number, rate: number, channels: number): number;
    opus_decode(state: number, data: number, length: number, pcm: number, frameSize: number, fec: number): number;
}

/** A fresh copy of the embedded wasm bytes. */
export function LibopusWasmBytes(): ArrayBuffer {
    const bytes = Buffer.from(LIBOPUS_WASM_BASE64, 'base64');
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function instantiate(): Promise<LibopusExports> {
    const { instance } = await WebAssembly.instantiate(LibopusWasmBytes(), {
        wasi_snapshot_preview1: { fd_seek: () => 0, fd_write: () => 0, fd_close: () => 0, proc_exit: () => undefined },
        env: { emscripten_notify_memory_growth: () => undefined },
    });
    return instance.exports as unknown as LibopusExports;
}

/** One libopus decoder at 48 kHz mono; `Decode` returns the samples one packet decodes to. */
export async function CreateLibopusDecoder(): Promise<{ Decode(packet: Uint8Array): number }> {
    const lib = await instantiate();
    const state = lib.malloc(lib.opus_decoder_get_size(1));
    const rc = lib.opus_decoder_init(state, 48000, 1);
    if (rc !== 0) throw new Error(`opus_decoder_init returned ${rc}`);
    const inPtr = lib.malloc(MAX_PACKET_BYTES);
    const outPtr = lib.malloc(MAX_DECODE_SAMPLES * 2);
    return {
        Decode(packet: Uint8Array): number {
            new Uint8Array(lib.memory.buffer).set(packet, inPtr);
            const samples = lib.opus_decode(state, inPtr, packet.length, outPtr, MAX_DECODE_SAMPLES, 0);
            if (samples < 0) throw new Error(`opus_decode returned ${samples}`);
            return samples;
        },
    };
}

/** One libopus encoder with the recording's settings; `EncodeFrame` takes exactly 960 Float32 samples. */
export async function CreateLibopusFrameEncoder(): Promise<{ EncodeFrame(frame: Float32Array): Uint8Array }> {
    const lib = await instantiate();
    const state = lib.malloc(lib.opus_encoder_get_size(1));
    if (lib.opus_encoder_init(state, 48000, 1, 2048) !== 0) throw new Error('opus_encoder_init failed');
    if (lib.opus_encoder_ctl_set(state, 4002, 32000) !== 0) throw new Error('OPUS_SET_BITRATE failed');
    const pcmPtr = lib.malloc(FRAME_SAMPLES * 2);
    const outPtr = lib.malloc(MAX_PACKET_BYTES);
    return {
        EncodeFrame(frame: Float32Array): Uint8Array {
            // Same float → int16 conversion as the worker, so both paths produce identical packets.
            const view = new Int16Array(lib.memory.buffer, pcmPtr, FRAME_SAMPLES);
            for (let i = 0; i < FRAME_SAMPLES; i++) {
                const s = Math.min(1, Math.max(-1, frame[i]));
                view[i] = s < 0 ? s * 32768 : s * 32767;
            }
            const length = lib.opus_encode(state, pcmPtr, FRAME_SAMPLES, outPtr, MAX_PACKET_BYTES);
            if (length < 0) throw new Error(`opus_encode returned ${length}`);
            return new Uint8Array(lib.memory.buffer, outPtr, length).slice();
        },
    };
}

/** The fake worker global the source string runs against. */
interface FakeWorkerSelf {
    onmessage: ((event: { data: OpusWorkerRequest }) => void) | null;
    postMessage(message: OpusWorkerReply, transfer?: Transferable[]): void;
}

/**
 * Runs {@link LIBOPUS_WORKER_SOURCE} in this process and returns a port to it. Requests are delivered
 * on a microtask (like a real worker, never inside the caller's stack); `Requests` records them.
 */
export function StartInProcessOpusWorker(): OpusWorkerPort & { Requests: OpusWorkerRequest[]; Terminated: boolean } {
    const port = {
        OnReply: null as ((reply: OpusWorkerReply) => void) | null,
        Requests: [] as OpusWorkerRequest[],
        Terminated: false,
        Post(message: OpusWorkerRequest): void {
            port.Requests.push(message);
            queueMicrotask(() => {
                if (!port.Terminated) fakeSelf.onmessage?.({ data: message });
            });
        },
        Terminate(): void {
            port.Terminated = true;
        },
    };
    const fakeSelf: FakeWorkerSelf = {
        onmessage: null,
        postMessage(message: OpusWorkerReply): void {
            if (!port.Terminated) port.OnReply?.(message);
        },
    };
    new Function('self', LIBOPUS_WORKER_SOURCE)(fakeSelf);
    return port;
}

/** A 440 Hz tone at half scale, `count` samples long. */
export function Tone(count: number): Float32Array {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48000);
    return out;
}

/** Splits `samples` into uneven chunks (cycling through awkward sizes, like real capture callbacks). */
export function UnevenChunks(samples: Float32Array): Float32Array[] {
    const sizes = [128, 441, 4096, 1000, 7, 960, 2048, 333];
    const chunks: Float32Array[] = [];
    let offset = 0;
    for (let n = 0; offset < samples.length; n++) {
        const size = Math.min(sizes[n % sizes.length], samples.length - offset);
        chunks.push(samples.slice(offset, offset + size));
        offset += size;
    }
    return chunks;
}
