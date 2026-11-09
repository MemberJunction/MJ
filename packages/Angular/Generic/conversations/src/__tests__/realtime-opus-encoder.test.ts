import { describe, it, expect, vi, afterEach } from 'vitest';
import { ParseRecordingShard, RECORDING_FRAME_SAMPLES } from '@memberjunction/ai-core-plus';
// RecordingShardWindow is the runtime's real shard cutter; the package exports only its type, so the
// test reaches into the built module to push our packets through exactly what production uses.
import { RecordingShardWindow } from '@memberjunction/realtime-runtime/dist/session/RecordingShardWindow';
import type { RecordingShard } from '@memberjunction/realtime-runtime';
import {
    BrowserOpusEncoderEnvironment,
    IOpusPacketEncoder,
    OpusEncoderEnvironment,
    SelectOpusPacketEncoder,
} from '../lib/services/recording/opus-packet-encoder';
import { BrowserWorkerPort, WasmOpusEncoder, WASM_OPUS_FLUSH_TIMEOUT_MS, WASM_OPUS_READY_TIMEOUT_MS, type WorkerLike } from '../lib/services/recording/wasm-opus-encoder';
import {
    AudioDataConstructor,
    AudioEncoderConstructor,
    AudioEncoderLike,
    WEBCODECS_OPUS_CONFIG,
} from '../lib/services/recording/webcodecs-opus-encoder';
import {
    CreateLibopusDecoder,
    CreateLibopusFrameEncoder,
    LibopusWasmBytes,
    StartInProcessOpusWorker,
    Tone,
    UnevenChunks,
} from './helpers/libopus-test-harness';

/** 2.37 s at 48 kHz: deliberately not a whole number of 20 ms frames. */
const INPUT_SAMPLES = Math.round(2.37 * 48000);

/** Feeds the chunks, pulling packets into the runtime's window as the runtime would mid-call, then flushes and seals. */
async function recordThroughWindow(encoder: IOpusPacketEncoder, chunks: Float32Array[]): Promise<RecordingShard[]> {
    const window = new RecordingShardWindow();
    const shards: RecordingShard[] = [];
    for (let n = 0; n < chunks.length; n++) {
        encoder.Encode(chunks[n]);
        if (n % 17 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            shards.push(...window.Append(encoder.TakePackets()));
        }
    }
    await encoder.Flush();
    shards.push(...window.Append(encoder.TakePackets()));
    const tail = window.SealTail(INPUT_SAMPLES);
    if (tail) shards.push(tail);
    encoder.Close();
    return shards;
}

/** Parses every shard as the server does and decodes every packet with one libopus decoder. */
async function decodeLikeTheServer(shards: RecordingShard[]): Promise<{ decodedSamples: number; declaredSamples: number }> {
    const decoder = await CreateLibopusDecoder();
    let decodedSamples = 0;
    let declaredSamples = 0;
    let expectedStart = 0;
    shards.forEach((shard, index) => {
        const parsed = ParseRecordingShard(shard.Bytes);
        expect(parsed.ShardIndex).toBe(index);
        expect(parsed.StartSample).toBe(expectedStart);
        expect(parsed.Packets).toHaveLength(parsed.PacketCount);
        expectedStart += parsed.SampleCount;
        declaredSamples += parsed.SampleCount;
        for (const packet of parsed.Packets) decodedSamples += decoder.Decode(packet);
    });
    return { decodedSamples, declaredSamples };
}

/** A WebCodecs `AudioData` stand-in that keeps a copy of its samples. */
class FakeAudioData {
    public static Created: FakeAudioData[] = [];
    public readonly Samples: Float32Array;
    public readonly Timestamp: number;
    public Closed = false;
    constructor(init: AudioDataInit) {
        expect(init.format).toBe('f32');
        expect(init.sampleRate).toBe(48000);
        expect(init.numberOfChannels).toBe(1);
        this.Samples = (init.data as Float32Array).slice();
        expect(this.Samples.length).toBe(init.numberOfFrames);
        this.Timestamp = init.timestamp;
        FakeAudioData.Created.push(this);
    }
    public close(): void {
        this.Closed = true;
    }
}

/**
 * A WebCodecs `AudioEncoder` stand-in whose packets come from the same real libopus build: it frames
 * input into 960-sample frames and emits one chunk per frame asynchronously, as browsers do.
 */
function fakeAudioEncoderClass(frameEncoder: { EncodeFrame(frame: Float32Array): Uint8Array }, supported = true) {
    return class FakeAudioEncoder implements AudioEncoderLike {
        public static Configs: AudioEncoderConfig[] = [];
        public static isConfigSupported = vi.fn(async (config: AudioEncoderConfig): Promise<AudioEncoderSupport> => ({ supported, config }));
        public state: CodecState = 'unconfigured';
        private readonly frame = new Float32Array(960);
        private filled = 0;
        private outputs: Promise<void> = Promise.resolve();
        constructor(private readonly init: AudioEncoderInit) {}
        public configure(config: AudioEncoderConfig): void {
            FakeAudioEncoder.Configs.push(config);
            this.state = 'configured';
        }
        public encode(data: AudioData): void {
            const samples = (data as unknown as FakeAudioData).Samples;
            for (let i = 0; i < samples.length; i++) {
                this.frame[this.filled++] = samples[i];
                if (this.filled === 960) this.emit();
            }
        }
        public async flush(): Promise<void> {
            if (this.filled > 0) {
                this.frame.fill(0, this.filled);
                this.emit();
            }
            await this.outputs;
        }
        public close(): void {
            this.state = 'closed';
        }
        private emit(): void {
            const bytes = frameEncoder.EncodeFrame(this.frame);
            this.filled = 0;
            const chunk = { byteLength: bytes.length, copyTo: (dest: Uint8Array) => dest.set(bytes) } as unknown as EncodedAudioChunk;
            this.outputs = this.outputs.then(() => this.init.output(chunk));
        }
    };
}

function wasmStub(): IOpusPacketEncoder {
    return { Kind: 'wasm', Encode: () => undefined, Flush: async () => undefined, TakePackets: () => [], Close: () => undefined };
}

describe('SelectOpusPacketEncoder', () => {
    afterEach(() => vi.restoreAllMocks());

    it('selects the WASM encoder when WebCodecs AudioEncoder is unavailable', async () => {
        const createWasm = vi.fn(async () => wasmStub());
        const encoder = await SelectOpusPacketEncoder({ AudioEncoder: null, AudioData: null, CreateWasmEncoder: createWasm });
        expect(encoder.Kind).toBe('wasm');
        expect(createWasm).toHaveBeenCalledTimes(1);
    });

    it('selects the WASM encoder when the browser does not support our Opus config', async () => {
        const Fake = fakeAudioEncoderClass(await CreateLibopusFrameEncoder(), false);
        const createWasm = vi.fn(async () => wasmStub());
        const encoder = await SelectOpusPacketEncoder({
            AudioEncoder: Fake as unknown as AudioEncoderConstructor,
            AudioData: FakeAudioData as unknown as AudioDataConstructor,
            CreateWasmEncoder: createWasm,
        });
        expect(encoder.Kind).toBe('wasm');
        expect(Fake.isConfigSupported).toHaveBeenCalledWith(WEBCODECS_OPUS_CONFIG);
    });

    it('selects the WASM encoder (and logs) when the support probe throws', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const Throwing = { isConfigSupported: async () => { throw new TypeError('bad config'); } };
        const encoder = await SelectOpusPacketEncoder({
            AudioEncoder: Throwing as unknown as AudioEncoderConstructor,
            AudioData: FakeAudioData as unknown as AudioDataConstructor,
            CreateWasmEncoder: async () => wasmStub(),
        });
        expect(encoder.Kind).toBe('wasm');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('libopus WebAssembly'), expect.any(TypeError));
    });

    it('selects WebCodecs, configured as mono 48 kHz 32 kbps 20 ms Opus, when it is available and supported', async () => {
        const Fake = fakeAudioEncoderClass(await CreateLibopusFrameEncoder());
        const createWasm = vi.fn(async () => wasmStub());
        const encoder = await SelectOpusPacketEncoder({
            AudioEncoder: Fake as unknown as AudioEncoderConstructor,
            AudioData: FakeAudioData as unknown as AudioDataConstructor,
            CreateWasmEncoder: createWasm,
        });
        expect(encoder.Kind).toBe('webcodecs');
        expect(createWasm).not.toHaveBeenCalled();
        expect(Fake.Configs).toEqual([
            { codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000, opus: { frameDuration: 20000 } },
        ]);
        encoder.Close();
    });

    it('the browser environment reports no WebCodecs where the globals are missing (Node)', () => {
        const env: OpusEncoderEnvironment = BrowserOpusEncoderEnvironment();
        expect(env.AudioEncoder).toBeNull();
        expect(env.AudioData).toBeNull();
    });
});

describe('Opus encoders → runtime shards → server decode (real libopus)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('WASM worker: shards parse, cover exactly the input, and decode to the input length ±1 frame', async () => {
        const worker = StartInProcessOpusWorker();
        const encoder = new WasmOpusEncoder(worker, LibopusWasmBytes());
        const shards = await recordThroughWindow(encoder, UnevenChunks(Tone(INPUT_SAMPLES)));

        const { decodedSamples, declaredSamples } = await decodeLikeTheServer(shards);
        expect(declaredSamples).toBe(INPUT_SAMPLES);
        expect(Math.abs(decodedSamples - INPUT_SAMPLES)).toBeLessThanOrEqual(RECORDING_FRAME_SAMPLES);
        expect(decodedSamples).toBe(Math.ceil(INPUT_SAMPLES / RECORDING_FRAME_SAMPLES) * RECORDING_FRAME_SAMPLES);
        expect(worker.Terminated).toBe(true);
    });

    it('WebCodecs wrapper over the same libopus produces byte-identical shards to the WASM worker', async () => {
        const chunks = UnevenChunks(Tone(INPUT_SAMPLES));
        const wasmShards = await recordThroughWindow(new WasmOpusEncoder(StartInProcessOpusWorker(), LibopusWasmBytes()), chunks);

        FakeAudioData.Created = [];
        const Fake = fakeAudioEncoderClass(await CreateLibopusFrameEncoder());
        const encoder = await SelectOpusPacketEncoder({
            AudioEncoder: Fake as unknown as AudioEncoderConstructor,
            AudioData: FakeAudioData as unknown as AudioDataConstructor,
            CreateWasmEncoder: async () => wasmStub(),
        });
        const webCodecsShards = await recordThroughWindow(encoder, chunks);

        expect(webCodecsShards.map((s) => s.Bytes)).toEqual(wasmShards.map((s) => s.Bytes));
        const { decodedSamples } = await decodeLikeTheServer(webCodecsShards);
        expect(Math.abs(decodedSamples - INPUT_SAMPLES)).toBeLessThanOrEqual(RECORDING_FRAME_SAMPLES);
        // Timestamps follow the sample clock (µs), and every AudioData is closed after encode.
        let samples = 0;
        for (const data of FakeAudioData.Created) {
            expect(data.Timestamp).toBe(Math.round((samples * 1_000_000) / 48000));
            expect(data.Closed).toBe(true);
            samples += data.Samples.length;
        }
        expect(samples).toBe(INPUT_SAMPLES);
    });

    it('WebCodecs encoder error keeps the packets already produced and drops later input without throwing', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const Fake = fakeAudioEncoderClass(await CreateLibopusFrameEncoder());
        let init: AudioEncoderInit | null = null;
        const Capturing = class extends Fake {
            constructor(i: AudioEncoderInit) {
                super(i);
                init = i;
            }
        };
        const encoder = await SelectOpusPacketEncoder({
            AudioEncoder: Capturing as unknown as AudioEncoderConstructor,
            AudioData: FakeAudioData as unknown as AudioDataConstructor,
            CreateWasmEncoder: async () => wasmStub(),
        });
        encoder.Encode(Tone(960 * 3));
        await encoder.Flush();
        init!.error(new DOMException('codec reclaimed', 'EncodingError'));
        expect(() => encoder.Encode(Tone(960))).not.toThrow();
        await encoder.Flush();
        expect(encoder.TakePackets()).toHaveLength(3);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Encoder failed'), expect.any(DOMException));
    });

    it('WASM worker: a flush with nothing pending adds no padded frame', async () => {
        const encoder = new WasmOpusEncoder(StartInProcessOpusWorker(), LibopusWasmBytes());
        encoder.Encode(Tone(960 * 2));
        await encoder.Flush();
        expect(encoder.TakePackets()).toHaveLength(2);
        await encoder.Flush();
        expect(encoder.TakePackets()).toHaveLength(0);
        encoder.Close();
    });

    it(`WASM wrapper: Flush resolves (and warns) after ${WASM_OPUS_FLUSH_TIMEOUT_MS} ms when the worker never answers`, async () => {
        vi.useFakeTimers();
        try {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const silent = { OnReply: null, Post: vi.fn(), Terminate: vi.fn() };
            const encoder = new WasmOpusEncoder(silent, new ArrayBuffer(8));
            let done = false;
            void encoder.Flush().then(() => { done = true; });
            await vi.advanceTimersByTimeAsync(WASM_OPUS_FLUSH_TIMEOUT_MS - 1);
            expect(done).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            expect(done).toBe(true);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('did not confirm flush'));
        } finally {
            vi.useRealTimers();
        }
    });

    it('WASM worker: a broken wasm module reports an error and still answers flush', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const encoder = new WasmOpusEncoder(StartInProcessOpusWorker(), new Uint8Array([0, 1, 2, 3]).buffer);
        encoder.Encode(Tone(960));
        await encoder.Flush();
        expect(encoder.TakePackets()).toEqual([]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('libopus init failed'));
        encoder.Close();
    });

    describe('WasmOpusEncoder.Start waits for the worker to be ready', () => {
        it('resolves once libopus is instantiated in the worker', async () => {
            const encoder = await WasmOpusEncoder.Start(StartInProcessOpusWorker(), LibopusWasmBytes());
            expect(encoder.Kind).toBe('wasm');
            encoder.Close();
        });

        it('rejects (and stops the worker) when libopus cannot be instantiated, so selection fails visibly', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const port = StartInProcessOpusWorker();
            const onClose = vi.fn();
            await expect(WasmOpusEncoder.Start(port, new Uint8Array([0, 1, 2, 3]).buffer, onClose)).rejects.toThrow(/libopus init failed/);
            expect(port.Terminated).toBe(true);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it(`rejects after ${WASM_OPUS_READY_TIMEOUT_MS} ms when the worker never answers (e.g. a CSP that blocks it)`, async () => {
            vi.useFakeTimers();
            try {
                const silent = { OnReply: null, Post: vi.fn(), Terminate: vi.fn() };
                const started = WasmOpusEncoder.Start(silent, new ArrayBuffer(8));
                const outcome = started.then(() => 'resolved', (error: Error) => error.message);
                await vi.advanceTimersByTimeAsync(WASM_OPUS_READY_TIMEOUT_MS);
                await expect(outcome).resolves.toMatch(/did not start/);
                expect(silent.Terminate).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('BrowserWorkerPort', () => {
        it('turns a worker error event (e.g. a CSP that blocks the worker) into an error reply, so Start fails at once', async () => {
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const worker: WorkerLike = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
            const port = new BrowserWorkerPort(worker);
            const started = WasmOpusEncoder.Start(port, new ArrayBuffer(8));
            worker.onerror?.({ message: 'blocked by Content-Security-Policy' } as ErrorEvent);
            await expect(started).rejects.toThrow(/blocked by Content-Security-Policy/);
            expect(worker.terminate).toHaveBeenCalledTimes(1);
        });
    });
});
