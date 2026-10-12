import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealtimeAudioRecorder } from '../lib/services/realtime-audio-recorder';
import type { IOpusPacketEncoder } from '../lib/services/recording/opus-packet-encoder';

/**
 * Recorder behavior in a Node test environment (no real Web Audio, no real encoder). Two regimes:
 *  - globals ABSENT  → the recorder disables itself gracefully (the live call must never break).
 *  - globals STUBBED → synchronous IsRecording stamping, 48 kHz sample clock, encoder hand-off,
 *    idempotent Stop, and the async-setup generation guard.
 */

/** A fake mic/remote stream with the given number of audio tracks. */
function fakeStream(audioTracks: number): MediaStream {
    const tracks = Array.from({ length: audioTracks }, () => ({}));
    return { getAudioTracks: () => tracks } as unknown as MediaStream;
}

/** An encoder spy: records what it was fed and hands back one fake packet per Encode call. */
class SpyEncoder implements IOpusPacketEncoder {
    public readonly Kind = 'wasm';
    public Fed: Float32Array[] = [];
    public FlushCalls = 0;
    public CloseCalls = 0;
    private packets: Uint8Array[] = [];
    public Encode(pcm48k: Float32Array): void {
        this.Fed.push(pcm48k);
        this.packets.push(new Uint8Array([this.Fed.length]));
    }
    public async Flush(): Promise<void> {
        this.FlushCalls++;
        this.packets.push(new Uint8Array([255])); // the padded final frame
    }
    public TakePackets(): Uint8Array[] {
        const out = this.packets;
        this.packets = [];
        return out;
    }
    public Close(): void {
        this.CloseCalls++;
    }
    public get FedSamples(): number {
        return this.Fed.reduce((n, f) => n + f.length, 0);
    }
}

/** Drives the private capture path with a synthetic frame (the stubbed graph never emits audio). */
function capture(recorder: RealtimeAudioRecorder, frame: Float32Array): void {
    (recorder as unknown as { captureFrame(f: Float32Array): void }).captureFrame(frame);
}

describe('RealtimeAudioRecorder — disabled when Web Audio is unavailable', () => {
    const originalAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;

    beforeEach(() => {
        delete (globalThis as { AudioContext?: unknown }).AudioContext;
    });
    afterEach(() => {
        if (originalAudioContext !== undefined) {
            (globalThis as { AudioContext?: unknown }).AudioContext = originalAudioContext;
        }
    });

    it('stays disabled, never selects an encoder, and resolves 0 from Stop when AudioContext is absent', async () => {
        const select = vi.fn(async () => new SpyEncoder());
        const recorder = new RealtimeAudioRecorder(select);
        recorder.Start(fakeStream(1), null);
        expect(recorder.IsRecording).toBe(false);
        expect(recorder.TakeEncodedPackets()).toEqual([]);
        await expect(recorder.Stop()).resolves.toBe(0);
        expect(select).not.toHaveBeenCalled();
    });
});

describe('RealtimeAudioRecorder — with stubbed Web Audio', () => {
    const g = globalThis as Record<string, unknown>;
    const saved: Record<string, unknown> = {};
    /** Streams handed to createMediaStreamSource, in call order. */
    let sourceCalls: MediaStream[] = [];
    /** When set, createMediaStreamSource throws a cross-rate NotSupportedError for exactly this stream. */
    let throwForStream: MediaStream | null = null;
    /** Options each AudioContext was constructed with. */
    let contextOptions: Array<AudioContextOptions | undefined> = [];
    /** The rate a context reports when constructed without an explicit one (the device rate). */
    let deviceRate = 48000;

    beforeEach(() => {
        sourceCalls = [];
        throwForStream = null;
        contextOptions = [];
        deviceRate = 48000;
        for (const key of ['AudioContext', 'AudioWorkletNode', 'Blob', 'URL']) {
            saved[key] = g[key];
        }

        // Minimal AudioContext with a no-op graph. The worklet path is disabled (no audioWorklet) so
        // the ScriptProcessor fallback wires up; frames are driven through captureFrame directly.
        class FakeAudioContext {
            public state = 'running';
            public sampleRate: number;
            public audioWorklet = undefined; // forces script-processor fallback attempt
            constructor(options?: AudioContextOptions) {
                contextOptions.push(options);
                this.sampleRate = options?.sampleRate ?? deviceRate;
            }
            public createMediaStreamDestination() {
                return { stream: {} };
            }
            public createMediaStreamSource(stream: MediaStream) {
                sourceCalls.push(stream);
                if (stream === throwForStream) {
                    throw new DOMException('cross-rate', 'NotSupportedError');
                }
                return { connect: () => undefined };
            }
            public createScriptProcessor() {
                return { connect: () => undefined, disconnect: () => undefined, onaudioprocess: null };
            }
            public resume() {
                return Promise.resolve();
            }
            public close() {
                return Promise.resolve();
            }
        }
        g['AudioContext'] = FakeAudioContext;
        g['AudioWorkletNode'] = undefined;
        g['URL'] = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => undefined };
    });

    afterEach(() => {
        for (const key of Object.keys(saved)) {
            if (saved[key] === undefined) {
                delete g[key];
            } else {
                g[key] = saved[key];
            }
        }
        vi.restoreAllMocks();
    });

    it('stamps IsRecording synchronously and asks for a 48 kHz context', async () => {
        const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
        recorder.Start(fakeStream(1), null);
        // Synchronous contract — the runtime checks IsRecording immediately after Start().
        expect(recorder.IsRecording).toBe(true);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        expect(contextOptions).toEqual([{ sampleRate: 48000 }]);
        await recorder.Stop();
    });

    it('feeds captured 48 kHz frames to the encoder and derives NowOffsetMs from the sample count', async () => {
        const encoder = new SpyEncoder();
        const recorder = new RealtimeAudioRecorder(async () => encoder);
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));

        for (let n = 0; n < 375; n++) capture(recorder, new Float32Array(128).fill(0.25)); // 48 000 samples
        expect(encoder.FedSamples).toBe(48000);
        expect(recorder.NowOffsetMs()).toBe(1000);
        expect(recorder.TakeEncodedPackets()).toHaveLength(375);
        expect(recorder.TakeEncodedPackets()).toEqual([]); // forgotten once taken
        await recorder.Stop();
    });

    it('copies each captured frame, because the audio engine reuses its buffers', async () => {
        const encoder = new SpyEncoder();
        const recorder = new RealtimeAudioRecorder(async () => encoder);
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        const reused = new Float32Array(128).fill(0.5);
        capture(recorder, reused);
        reused.fill(0);
        expect(encoder.Fed[0][0]).toBe(0.5);
        await recorder.Stop();
    });

    it('buffers audio captured while the encoder is still loading, then feeds it in order', async () => {
        const encoder = new SpyEncoder();
        let release: (e: IOpusPacketEncoder) => void = () => undefined;
        const recorder = new RealtimeAudioRecorder(() => new Promise<IOpusPacketEncoder>((resolve) => { release = resolve; }));
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        capture(recorder, new Float32Array(128).fill(0.1));
        capture(recorder, new Float32Array(64).fill(0.2));
        expect(recorder.NowOffsetMs()).toBe((192 * 1000) / 48000); // counted while buffered

        release(encoder);
        await vi.waitFor(() => expect(encoder.Fed).toHaveLength(2));
        expect(encoder.Fed.map((f) => [f.length, f[0]])).toEqual([[128, 0.1], [64, 0.2]].map(([n, v]) => [n, Math.fround(v)]));
        capture(recorder, new Float32Array(32));
        expect(encoder.Fed).toHaveLength(3);
        await recorder.Stop();
    });

    it('drops (and does not count) audio past 10 s while the encoder never becomes ready, warning once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const recorder = new RealtimeAudioRecorder(() => new Promise<IOpusPacketEncoder>(() => undefined));
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        for (let n = 0; n < 12; n++) capture(recorder, new Float32Array(48000));
        expect(recorder.NowOffsetMs()).toBe(10000);
        expect(warn.mock.calls.filter(([m]) => String(m).includes('still not ready'))).toHaveLength(1);
    });

    it('Stop flushes and closes the encoder once, resolves the captured samples, and is idempotent', async () => {
        const encoder = new SpyEncoder();
        const recorder = new RealtimeAudioRecorder(async () => encoder);
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        capture(recorder, new Float32Array(1000));
        capture(recorder, new Float32Array(500));

        const first = recorder.Stop();
        const second = recorder.Stop();
        await expect(first).resolves.toBe(1500);
        await expect(second).resolves.toBe(1500);
        await expect(recorder.Stop()).resolves.toBe(1500);
        expect(encoder.FlushCalls).toBe(1);
        expect(encoder.CloseCalls).toBe(1);
        expect(recorder.IsRecording).toBe(false);
        // The flushed final packet is still available after Stop.
        expect(recorder.TakeEncodedPackets()).toHaveLength(3);
        // Capture after Stop is ignored.
        capture(recorder, new Float32Array(128));
        expect(recorder.NowOffsetMs()).toBe((1500 * 1000) / 48000);
    });

    it('Stop before the encoder is ready waits for it and still encodes the buffered audio', async () => {
        const encoder = new SpyEncoder();
        let release: (e: IOpusPacketEncoder) => void = () => undefined;
        const recorder = new RealtimeAudioRecorder(() => new Promise<IOpusPacketEncoder>((resolve) => { release = resolve; }));
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        capture(recorder, new Float32Array(960));

        const stopped = recorder.Stop();
        release(encoder);
        await expect(stopped).resolves.toBe(960);
        expect(encoder.FedSamples).toBe(960);
        expect(encoder.FlushCalls).toBe(1);
    });

    it('Stop on a recorder that never started resolves 0', async () => {
        await expect(new RealtimeAudioRecorder(async () => new SpyEncoder()).Stop()).resolves.toBe(0);
    });

    it('turns recording off (and reports 0 samples) when no encoder can be created', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const recorder = new RealtimeAudioRecorder(async () => { throw new Error('worker blocked by CSP'); });
        recorder.Start(fakeStream(1), null);
        capture(recorder, new Float32Array(128));
        await vi.waitFor(() => expect(recorder.IsRecording).toBe(false));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('No Opus encoder'), expect.any(Error));
        await expect(recorder.Stop()).resolves.toBe(0);
    });

    it('resamples to 48 kHz when the browser hands back a context at another rate', async () => {
        g['AudioContext'] = class extends (g['AudioContext'] as new (o?: AudioContextOptions) => { sampleRate: number }) {
            constructor(options?: AudioContextOptions) {
                super(options);
                this.sampleRate = 44100; // ignores the requested rate
            }
        };
        const encoder = new SpyEncoder();
        const recorder = new RealtimeAudioRecorder(async () => encoder);
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        for (let n = 0; n < 441; n++) capture(recorder, new Float32Array(100)); // 1 s at 44.1 kHz
        await vi.waitFor(() => expect(encoder.Fed.length).toBeGreaterThan(0));
        const captured = await recorder.Stop();
        expect(Math.abs(captured - 48000)).toBeLessThanOrEqual(1);
        expect(encoder.FedSamples).toBe(captured);
    });

    it('falls back to the default context (with resampling) when a 48 kHz context is refused', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        deviceRate = 44100;
        g['AudioContext'] = class extends (g['AudioContext'] as new (o?: AudioContextOptions) => object) {
            constructor(options?: AudioContextOptions) {
                if (options?.sampleRate) throw new DOMException('rate not supported', 'NotSupportedError');
                super(options);
            }
        };
        const encoder = new SpyEncoder();
        const recorder = new RealtimeAudioRecorder(async () => encoder);
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));
        expect(contextOptions).toEqual([undefined]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('48 kHz AudioContext refused'), expect.any(DOMException));
        capture(recorder, new Float32Array(44100));
        expect(Math.abs((await recorder.Stop()) - 48000)).toBeLessThanOrEqual(1);
    });

    it('rebuilds at the device rate when the 48 kHz context rejects the microphone (Firefox)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        deviceRate = 44100;
        const mic = fakeStream(1);
        const remote = fakeStream(1);
        const Base = g['AudioContext'] as new (o?: AudioContextOptions) => { sampleRate: number; createMediaStreamSource(s: MediaStream): unknown };
        g['AudioContext'] = class extends Base {
            public createMediaStreamSource(stream: MediaStream) {
                if (this.sampleRate === 48000 && stream === mic) {
                    sourceCalls.push(stream);
                    throw new DOMException('different sample-rate', 'NotSupportedError');
                }
                return super.createMediaStreamSource(stream);
            }
        };
        const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
        recorder.Start(mic, null);
        recorder.AttachRemoteStream(remote); // stashed during setup; must survive the rebuild
        await vi.waitFor(() => expect(sourceCalls).toContain(remote));
        expect(contextOptions).toEqual([{ sampleRate: 48000 }, undefined]);
        expect(sourceCalls.filter((s) => s === mic)).toHaveLength(2);
        expect(recorder.IsRecording).toBe(true);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected the microphone'), expect.any(DOMException));
        capture(recorder, new Float32Array(44100));
        expect(Math.abs((await recorder.Stop()) - 48000)).toBeLessThanOrEqual(1);
    });

    it('AttachRemoteStream is idempotent and ignores track-less streams (does not throw)', async () => {
        const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
        recorder.Start(fakeStream(1), null);
        expect(() => recorder.AttachRemoteStream(fakeStream(0))).not.toThrow();
        expect(() => recorder.AttachRemoteStream(fakeStream(1))).not.toThrow();
        expect(() => recorder.AttachRemoteStream(fakeStream(1))).not.toThrow(); // double-attach guarded
        await recorder.Stop();
    });

    it('AttachRemoteStream connects immediately once the audio graph is ready (graph-ready path)', async () => {
        const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
        recorder.Start(fakeStream(1), null);
        await vi.waitFor(() => expect(sourceCalls).toHaveLength(1));

        recorder.AttachRemoteStream(fakeStream(1));
        const internals = recorder as unknown as { remoteAttached: boolean; pendingRemoteStream: MediaStream | null };
        expect(internals.remoteAttached).toBe(true); // wired into the live mix now
        expect(internals.pendingRemoteStream).toBeNull(); // not stashed
        await recorder.Stop();
    });

    it('AttachRemoteStream stashes the stream when called before the audio graph is ready, and setup connects it', async () => {
        const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
        recorder.Start(fakeStream(1), null);
        // Synchronously after Start(): setup is still pending, so the stream must be stashed.
        const remote = fakeStream(1);
        recorder.AttachRemoteStream(remote);
        const internals = recorder as unknown as { remoteAttached: boolean; pendingRemoteStream: MediaStream | null };
        expect(internals.remoteAttached).toBe(false);
        expect(internals.pendingRemoteStream).toBe(remote);
        await vi.waitFor(() => expect(sourceCalls).toContain(remote));
        expect(internals.remoteAttached).toBe(true);
        expect(internals.pendingRemoteStream).toBeNull();
        await recorder.Stop();
    });

    it('closes its AudioContext and wires no mic when Stop lands while the context is still resuming', async () => {
        // Browsers usually create the context suspended; a call that ends inside that await used to
        // leave the context open and connect the mic into a recorder that had already stopped.
        const Base = g['AudioContext'] as new (o?: AudioContextOptions) => object;
        let releaseResume: () => void = () => undefined;
        const contexts: Array<{ Closed: boolean }> = [];
        g['AudioContext'] = class extends Base {
            public state = 'suspended';
            public Closed = false;
            constructor(options?: AudioContextOptions) {
                super(options);
                contexts.push(this);
            }
            public resume(): Promise<void> {
                return new Promise<void>((resolve) => { releaseResume = resolve; });
            }
            public close(): Promise<void> {
                this.Closed = true;
                return Promise.resolve();
            }
        };
        const mic = fakeStream(1);
        const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
        recorder.Start(mic, null);

        await recorder.Stop();
        releaseResume();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(contexts).toHaveLength(1);
        expect(contexts[0].Closed).toBe(true);
        expect(sourceCalls).not.toContain(mic);
    });

    it('wires no mic when Stop lands while the capture worklet is still loading', async () => {
        const Base = g['AudioContext'] as new (o?: AudioContextOptions) => object;
        let releaseModule: (() => void) | null = null;
        g['AudioContext'] = class extends Base {
            public audioWorklet = {
                addModule: (): Promise<void> => new Promise<void>((resolve) => { releaseModule = resolve; }),
            };
        };
        g['AudioWorkletNode'] = class {
            public port = { onmessage: null };
            public connect(): void {}
            public disconnect(): void {}
        };
        const mic = fakeStream(1);
        const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
        recorder.Start(mic, null);
        // Precondition: setup has reached the worklet load and is parked inside it.
        await vi.waitFor(() => expect(releaseModule).not.toBeNull());

        await recorder.Stop();
        releaseModule!();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(sourceCalls).not.toContain(mic);
    });

    describe('remote stream that cannot be mixed in', () => {
        it('Start(mic, remote) keeps recording mic-only and warns when the remote connect throws', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const remote = fakeStream(1);
            throwForStream = remote;
            const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
            recorder.Start(fakeStream(1), remote);
            await vi.waitFor(() => expect(sourceCalls).toContain(remote));

            expect(recorder.IsRecording).toBe(true);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('agent stream'), expect.any(DOMException));
            capture(recorder, new Float32Array(128).fill(0.5));
            await expect(recorder.Stop()).resolves.toBe(128);
        });

        it('AttachRemoteStream after setup keeps recording mic-only and warns when the connect throws', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
            recorder.Start(fakeStream(1), null);
            await vi.waitFor(() => expect(sourceCalls.length).toBe(1)); // mic connected => graph ready
            const remote = fakeStream(1);
            throwForStream = remote;

            expect(() => recorder.AttachRemoteStream(remote)).not.toThrow();
            expect(recorder.IsRecording).toBe(true);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('agent stream'), expect.any(DOMException));
            capture(recorder, new Float32Array(128).fill(0.5));
            await expect(recorder.Stop()).resolves.toBe(128);
        });

        it('connects the same remote stream exactly once when Start(mic, remote) is followed by AttachRemoteStream(remote)', async () => {
            const remote = fakeStream(1);
            const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
            recorder.Start(fakeStream(1), remote);
            await vi.waitFor(() => expect(sourceCalls).toContain(remote));
            recorder.AttachRemoteStream(remote); // the post-Connect PCM case: handler fires with the same stream

            expect(sourceCalls.filter((s) => s === remote)).toHaveLength(1);
            await recorder.Stop();
        });

        it('connects the same remote stream exactly once when AttachRemoteStream(remote) arrives before setup finishes (the runtime order)', async () => {
            // RealtimeSessionRuntime.startRecording: Start(mic, remote), then OnRemoteMediaStream fires
            // synchronously with the same stream while the async graph setup is still pending.
            const remote = fakeStream(1);
            const recorder = new RealtimeAudioRecorder(async () => new SpyEncoder());
            recorder.Start(fakeStream(1), remote);
            recorder.AttachRemoteStream(remote);
            await vi.waitFor(() => expect(sourceCalls).toContain(remote));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sourceCalls.filter((s) => s === remote)).toHaveLength(1);
            await recorder.Stop();
        });
    });
});
