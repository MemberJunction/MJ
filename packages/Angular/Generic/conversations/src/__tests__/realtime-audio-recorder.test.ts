import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealtimeAudioRecorder } from '../lib/services/realtime-audio-recorder';

/**
 * Recorder behavior in a Node test environment (no real Web Audio). Two regimes:
 *  - globals ABSENT  → the recorder disables itself gracefully (the live call must never break).
 *  - globals STUBBED → synchronous IsRecording stamping, MimeType='audio/wav', bounded peaks.
 */

/** A fake mic/remote stream with the given number of audio tracks. */
function fakeStream(audioTracks: number): MediaStream {
    const tracks = Array.from({ length: audioTracks }, () => ({}));
    return { getAudioTracks: () => tracks } as unknown as MediaStream;
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

    it('stays disabled and resolves null from Stop when AudioContext is absent', async () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        expect(recorder.IsRecording).toBe(false);
        expect(recorder.MimeType).toBe('');
        expect(recorder.GetPeaks()).toEqual([]);
        await expect(recorder.Stop()).resolves.toBeNull();
    });
});

describe('RealtimeAudioRecorder — with stubbed Web Audio', () => {
    const g = globalThis as Record<string, unknown>;
    const saved: Record<string, unknown> = {};
    /** Streams handed to createMediaStreamSource, in call order. */
    let sourceCalls: MediaStream[] = [];
    /** When set, createMediaStreamSource throws a cross-rate NotSupportedError for exactly this stream. */
    let throwForStream: MediaStream | null = null;

    beforeEach(() => {
        sourceCalls = [];
        throwForStream = null;
        for (const key of ['AudioContext', 'AudioWorkletNode', 'Blob', 'URL']) {
            saved[key] = g[key];
        }

        // Minimal AudioContext that reports a sample rate and a no-op graph. The worklet path is
        // intentionally disabled (no audioWorklet) so neither capture node actually wires up — the
        // test only needs the SYNCHRONOUS Start() stamping + MimeType + peaks contract, not real audio.
        class FakeAudioContext {
            public state = 'running';
            public sampleRate = 48000;
            public audioWorklet = undefined; // forces script-processor fallback attempt
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
        g['Blob'] = class FakeBlob {
            public size: number;
            public type: string;
            constructor(parts: Array<ArrayBuffer | Uint8Array>, opts?: { type?: string }) {
                this.size = parts.reduce((n, p) => n + (p as { byteLength: number }).byteLength, 0);
                this.type = opts?.type ?? '';
            }
        };
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

    it('stamps IsRecording synchronously and reports the WAV mime type', () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        // Synchronous contract — the session service checks IsRecording immediately after Start().
        expect(recorder.IsRecording).toBe(true);
        expect(recorder.MimeType).toBe('audio/wav');
        expect(recorder.StartedAtMs).toBeGreaterThan(0);
    });

    it('GetPeaks is bounded and starts empty (no audio captured yet)', () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        const peaks = recorder.GetPeaks();
        expect(Array.isArray(peaks)).toBe(true);
        expect(peaks.length).toBeLessThanOrEqual(1200); // <= 2x the 600-bucket target
    });

    it('captured PCM frames produce a non-empty WAV blob and bounded normalized peaks at Stop', async () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);

        // Drive the private capture path directly with synthetic PCM frames (the stubbed graph never
        // emits real audio). This exercises accumulation + the streaming peak accumulator.
        const captureFrame = (recorder as unknown as { captureFrame(f: Float32Array): void }).captureFrame.bind(recorder);
        const frame = new Float32Array(256);
        for (let i = 0; i < frame.length; i++) {
            frame[i] = Math.sin(i / 8) * 0.8;
        }
        for (let n = 0; n < 100; n++) {
            captureFrame(frame);
        }

        const blob = await recorder.Stop();
        expect(blob).not.toBeNull();
        expect(blob!.type).toBe('audio/wav');
        expect(blob!.size).toBeGreaterThan(44); // header + data

        const peaks = recorder.GetPeaks(); // survives Stop via the snapshot
        expect(peaks.length).toBeGreaterThan(0);
        expect(peaks.length).toBeLessThanOrEqual(1200);
        expect(Math.max(...peaks)).toBeCloseTo(1, 6);
        for (const p of peaks) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    it('SnapshotNewSegment returns raw PCM bytes since the last flush, then null when nothing new', async () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        const captureFrame = (recorder as unknown as { captureFrame(f: Float32Array): void }).captureFrame.bind(recorder);
        const frame = new Float32Array(128).fill(0.5);
        captureFrame(frame);

        const seg = recorder.SnapshotNewSegment();
        expect(seg).not.toBeNull();
        expect(seg!.size).toBe(128 * 2); // PCM16 = 2 bytes/sample
        // Nothing new since the last snapshot.
        expect(recorder.SnapshotNewSegment()).toBeNull();
        await recorder.Stop();
    });

    it('AttachRemoteStream is idempotent and ignores track-less streams (does not throw)', () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        expect(() => recorder.AttachRemoteStream(fakeStream(0))).not.toThrow();
        expect(() => recorder.AttachRemoteStream(fakeStream(1))).not.toThrow();
        expect(() => recorder.AttachRemoteStream(fakeStream(1))).not.toThrow(); // double-attach guarded
    });

    it('AttachRemoteStream connects immediately once the audio graph is ready (graph-ready path)', async () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        // Let the async startMixedRecording() finish so the capture node + context exist.
        await Promise.resolve();
        await Promise.resolve();

        recorder.AttachRemoteStream(fakeStream(1));
        const internals = recorder as unknown as { remoteAttached: boolean; pendingRemoteStream: MediaStream | null };
        expect(internals.remoteAttached).toBe(true); // wired into the live mix now
        expect(internals.pendingRemoteStream).toBeNull(); // not stashed
        await recorder.Stop();
    });

    it('AttachRemoteStream stashes the stream when called before the audio graph is ready (pre-setup path)', () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        // Synchronously after Start(): startMixedRecording() is still pending (audioContext not yet
        // assigned), so the stream must be stashed for connection at setup — NOT attached yet.
        const remote = fakeStream(1);
        recorder.AttachRemoteStream(remote);
        const internals = recorder as unknown as { remoteAttached: boolean; pendingRemoteStream: MediaStream | null };
        expect(internals.remoteAttached).toBe(false);
        expect(internals.pendingRemoteStream).toBe(remote);
    });

    it('a stashed remote stream is connected (and the stash cleared) once setup completes', async () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        recorder.AttachRemoteStream(fakeStream(1)); // stashed pre-setup
        // Drain the microtasks for the async graph setup, which connects the pending stream.
        await Promise.resolve();
        await Promise.resolve();
        const internals = recorder as unknown as { remoteAttached: boolean; pendingRemoteStream: MediaStream | null };
        expect(internals.remoteAttached).toBe(true);
        expect(internals.pendingRemoteStream).toBeNull();
        await recorder.Stop();
    });

    describe('ReplaceMicrophone', () => {
        /** Makes the stubbed context record each source node: the stream it reads and whether it was disconnected. */
        function recordSources(): Array<{ Stream: MediaStream; Disconnected: boolean }> {
            const sources: Array<{ Stream: MediaStream; Disconnected: boolean }> = [];
            const context = g['AudioContext'] as { prototype: { createMediaStreamSource(stream: MediaStream): object } };
            context.prototype.createMediaStreamSource = (stream: MediaStream) => {
                const source = { Stream: stream, Disconnected: false, connect: () => undefined, disconnect: () => (source.Disconnected = true) };
                sources.push(source);
                return source;
            };
            return sources;
        }

        /** Lets the async graph setup started by Start() finish. */
        async function settleSetup(): Promise<void> {
            await Promise.resolve();
            await Promise.resolve();
        }

        it('records the new stream once the graph is ready, and drops the old source', async () => {
            const sources = recordSources();
            const first = fakeStream(1);
            const second = fakeStream(1);
            const recorder = new RealtimeAudioRecorder();
            recorder.Start(first, null);
            await settleSetup();

            recorder.ReplaceMicrophone(second);
            expect(sources.map((s) => s.Stream)).toEqual([first, second]);
            expect(sources.map((s) => s.Disconnected)).toEqual([true, false]);
            await recorder.Stop();
        });

        it('a replacement during setup is the microphone the graph connects', async () => {
            const sources = recordSources();
            const second = fakeStream(1);
            const recorder = new RealtimeAudioRecorder();
            recorder.Start(fakeStream(1), null);
            recorder.ReplaceMicrophone(second);
            await settleSetup();

            expect(sources.map((s) => s.Stream)).toEqual([second]);
            await recorder.Stop();
        });

        it('keeps the current source when the new stream has no audio track', async () => {
            const sources = recordSources();
            const first = fakeStream(1);
            const recorder = new RealtimeAudioRecorder();
            recorder.Start(first, null);
            await settleSetup();

            recorder.ReplaceMicrophone(fakeStream(0));
            expect(sources.map((s) => s.Stream)).toEqual([first]);
            expect(sources[0].Disconnected).toBe(false);
            await recorder.Stop();
        });

        it('does nothing when not recording', () => {
            const sources = recordSources();
            const recorder = new RealtimeAudioRecorder();
            expect(() => recorder.ReplaceMicrophone(fakeStream(1))).not.toThrow();
            expect(sources).toEqual([]);
        });
    });

    it('closes its AudioContext and wires no mic when Stop lands while the context is still resuming', async () => {
        // Browsers usually create the context suspended; a call that ends inside that await used to
        // leave the context open and connect the mic into a recorder that had already stopped.
        const Base = g['AudioContext'] as new () => object;
        let releaseResume: () => void = () => undefined;
        class SuspendedAudioContext extends Base {
            public state = 'suspended';
            public Closed = false;
            public resume(): Promise<void> {
                return new Promise<void>((resolve) => { releaseResume = resolve; });
            }
            public close(): Promise<void> {
                this.Closed = true;
                return Promise.resolve();
            }
        }
        const contexts: SuspendedAudioContext[] = [];
        g['AudioContext'] = class extends SuspendedAudioContext {
            constructor() {
                super();
                contexts.push(this);
            }
        };
        const mic = fakeStream(1);
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(mic, null);

        await recorder.Stop();
        releaseResume();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(contexts).toHaveLength(1);
        expect(contexts[0].Closed).toBe(true);
        expect(sourceCalls).not.toContain(mic);
    });

    it('wires no mic when Stop lands while the capture worklet is still loading', async () => {
        const Base = g['AudioContext'] as new () => object;
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
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(mic, null);
        // Precondition: setup has reached the worklet load and is parked inside it.
        await vi.waitFor(() => expect(releaseModule).not.toBeNull());

        await recorder.Stop();
        releaseModule!();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(sourceCalls).not.toContain(mic);
    });

    it('MimeType reverts to empty after Stop (recording flag cleared)', async () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        expect(recorder.MimeType).toBe('audio/wav');
        await recorder.Stop();
        expect(recorder.MimeType).toBe(''); // no longer recording
    });

    it('cleanup (via Stop) resets all capture state for reuse', async () => {
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(fakeStream(1), null);
        recorder.AttachRemoteStream(fakeStream(1)); // stash something to confirm it clears
        const captureFrame = (recorder as unknown as { captureFrame(f: Float32Array): void }).captureFrame.bind(recorder);
        captureFrame(new Float32Array(64).fill(0.3));

        await recorder.Stop(); // calls cleanup()

        const internals = recorder as unknown as {
            pcmFrames: Float32Array[];
            totalSamples: number;
            flushedSampleCount: number;
            sampleRate: number;
            remoteAttached: boolean;
            pendingRemoteStream: MediaStream | null;
        };
        expect(internals.pcmFrames).toEqual([]);
        expect(internals.totalSamples).toBe(0);
        expect(internals.flushedSampleCount).toBe(0);
        expect(internals.sampleRate).toBe(0);
        expect(internals.remoteAttached).toBe(false);
        expect(internals.pendingRemoteStream).toBeNull();
        expect(recorder.IsRecording).toBe(false);
        expect(recorder.SnapshotNewSegment()).toBeNull(); // no leftover unflushed segment
    });
    describe('remote stream that cannot be mixed in', () => {
        const captureOne = (recorder: RealtimeAudioRecorder): void => {
            (recorder as unknown as { captureFrame(f: Float32Array): void }).captureFrame(new Float32Array(128).fill(0.5));
        };

        it('Start(mic, remote) keeps recording mic-only and warns when the remote connect throws', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const remote = fakeStream(1);
            throwForStream = remote;
            const recorder = new RealtimeAudioRecorder();
            recorder.Start(fakeStream(1), remote);
            await vi.waitFor(() => expect(sourceCalls).toContain(remote));

            expect(recorder.IsRecording).toBe(true);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('agent stream'), expect.any(DOMException));
            captureOne(recorder);
            const blob = await recorder.Stop();
            expect(blob).not.toBeNull();
            expect(blob!.size).toBeGreaterThan(44);
        });

        it('AttachRemoteStream after setup keeps recording mic-only and warns when the connect throws', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const recorder = new RealtimeAudioRecorder();
            recorder.Start(fakeStream(1), null);
            await vi.waitFor(() => expect(sourceCalls.length).toBe(1)); // mic connected => graph ready
            const remote = fakeStream(1);
            throwForStream = remote;

            expect(() => recorder.AttachRemoteStream(remote)).not.toThrow();
            expect(recorder.IsRecording).toBe(true);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('agent stream'), expect.any(DOMException));
            captureOne(recorder);
            const blob = await recorder.Stop();
            expect(blob).not.toBeNull();
            expect(blob!.size).toBeGreaterThan(44);
        });

        it('connects the same remote stream exactly once when Start(mic, remote) is followed by AttachRemoteStream(remote)', async () => {
            const remote = fakeStream(1);
            const recorder = new RealtimeAudioRecorder();
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
            const recorder = new RealtimeAudioRecorder();
            recorder.Start(fakeStream(1), remote);
            recorder.AttachRemoteStream(remote);
            await vi.waitFor(() => expect(sourceCalls).toContain(remote));
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sourceCalls.filter((s) => s === remote)).toHaveLength(1);
            await recorder.Stop();
        });
    });
});
