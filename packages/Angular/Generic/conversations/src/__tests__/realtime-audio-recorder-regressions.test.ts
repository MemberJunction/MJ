import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeAudioRecorder } from '../lib/services/realtime-audio-recorder';

class FakeTrack extends EventTarget implements MediaStreamTrack {
    public contentHint = '';
    public enabled = true;
    public readonly id = 'audio';
    public readonly kind = 'audio';
    public readonly label = 'audio';
    public readonly muted = false;
    public onended: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public onunmute: ((this: MediaStreamTrack, ev: Event) => void) | null = null;
    public readonly readyState: MediaStreamTrackState = 'live';
    public async applyConstraints(): Promise<void> {}
    public clone(): MediaStreamTrack { return this; }
    public getCapabilities(): MediaTrackCapabilities { return {}; }
    public getConstraints(): MediaTrackConstraints { return {}; }
    public getSettings(): MediaTrackSettings { return {}; }
    public stop(): void {}
}
class FakeStream extends EventTarget implements MediaStream {
    public readonly active = true;
    public readonly id = 'stream';
    public onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    public onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => void) | null = null;
    private tracks: MediaStreamTrack[] = [new FakeTrack()];
    public addTrack(track: MediaStreamTrack): void { this.tracks.push(track); }
    public clone(): MediaStream { return this; }
    public getAudioTracks(): MediaStreamTrack[] { return this.tracks; }
    public getTrackById(_id: string): MediaStreamTrack | null { return null; }
    public getTracks(): MediaStreamTrack[] { return this.tracks; }
    public getVideoTracks(): MediaStreamTrack[] { return []; }
    public removeTrack(_track: MediaStreamTrack): void {}
}
interface ProcessEvent { inputBuffer: { getChannelData(channel: number): Float32Array } }
class FakeCaptureNode {
    public onaudioprocess: ((event: ProcessEvent) => void) | null = null;
    public connect(): void {}
    public disconnect(): void {}
}
let contexts: FakeAudioContext[] = [];
let sourceCalls: MediaStream[] = [];
let throwForStream: MediaStream | null = null;
class FakeAudioContext {
    public state = 'running';
    public sampleRate = 48000;
    public Closed = false;
    public Capture = new FakeCaptureNode();
    constructor() { contexts.push(this); }
    public createMediaStreamDestination(): { stream: FakeStream } { return { stream: new FakeStream() }; }
    public createMediaStreamSource(stream: MediaStream): { connect(): void } {
        sourceCalls.push(stream);
        if (stream === throwForStream) throw new DOMException('cross-rate', 'NotSupportedError');
        return { connect: () => {} };
    }
    public createScriptProcessor(): FakeCaptureNode { return this.Capture; }
    public async resume(): Promise<void> {}
    public async close(): Promise<void> { this.Closed = true; }
}
const settle = async (): Promise<void> => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); };

describe('RealtimeAudioRecorder setup cancellation and remote audio', () => {
    beforeEach(() => {
        contexts = [];
        sourceCalls = [];
        throwForStream = null;
        vi.stubGlobal('AudioContext', FakeAudioContext);
        vi.stubGlobal('AudioWorkletNode', undefined);
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('closes the context and never wires the mic when stopped during resume', async () => {
        let releaseResume = (): void => {};
        vi.stubGlobal('AudioContext', class extends FakeAudioContext {
            public override state = 'suspended';
            public override resume(): Promise<void> {
                return new Promise<void>((resolve) => { releaseResume = resolve; });
            }
        });
        const mic = new FakeStream();
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(mic, null);
        await recorder.Stop();
        releaseResume();
        await settle();
        expect(contexts[0].Closed).toBe(true);
        expect(sourceCalls).not.toContain(mic);
    });

    it('never wires the mic when stopped during worklet loading', async () => {
        let releaseModule = (): void => {};
        vi.stubGlobal('AudioContext', class extends FakeAudioContext {
            public audioWorklet = { addModule: (): Promise<void> => new Promise<void>((resolve) => { releaseModule = resolve; }) };
        });
        vi.stubGlobal('AudioWorkletNode', class {
            public port = { onmessage: null };
            public connect(): void {}
            public disconnect(): void {}
        });
        const mic = new FakeStream();
        const recorder = new RealtimeAudioRecorder();
        recorder.Start(mic, null);
        await recorder.Stop();
        releaseModule();
        await settle();
        expect(contexts[0].Closed).toBe(true);
        expect(sourceCalls).not.toContain(mic);
    });

    for (const late of [false, true]) {
        it(`retains mic recording when ${late ? 'late' : 'initial'} remote attachment fails`, async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const remote = new FakeStream();
            throwForStream = remote;
            const recorder = new RealtimeAudioRecorder();
            recorder.Start(new FakeStream(), late ? null : remote);
            await settle();
            if (late) expect(() => recorder.AttachRemoteStream(remote)).not.toThrow();
            expect(recorder.IsRecording).toBe(true);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('agent stream'), expect.any(DOMException));
            contexts[0].Capture.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(128).fill(0.5) } });
            const blob = await recorder.Stop();
            expect(blob?.size).toBeGreaterThan(44);
        });
    }

    for (const immediate of [false, true]) {
        it(`mixes remote audio once when replay arrives ${immediate ? 'during' : 'after'} setup`, async () => {
            const recorder = new RealtimeAudioRecorder();
            const remote = new FakeStream();
            recorder.Start(new FakeStream(), remote);
            if (!immediate) await settle();
            recorder.AttachRemoteStream(remote);
            await settle();
            expect(sourceCalls.filter((stream) => stream === remote)).toHaveLength(1);
            await recorder.Stop();
        });
    }
});
