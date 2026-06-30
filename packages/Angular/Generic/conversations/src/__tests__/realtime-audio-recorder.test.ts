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

    beforeEach(() => {
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
            public createMediaStreamSource() {
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
});
