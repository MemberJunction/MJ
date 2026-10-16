import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimePcmPlayback } from '../audio/pcmPlayback';
import { FakeMediaStream } from './fake-media-stream';

interface PlaybackBuffer {
    duration: number;
    copyToChannel(samples: Float32Array, channel: number): void;
}
class FakeNode {
    public Targets: Array<FakeNode | FakeDestination> = [];
    public buffer: PlaybackBuffer | null = null;
    public onended: (() => void) | null = null;
    public connect(target: FakeNode | FakeDestination): void { this.Targets.push(target); }
    public start(_when: number): void {}
    public stop(): void {}
}
interface FakeDestination { stream?: MediaStream }
const stream = new FakeMediaStream([]);
let lastContext: FakeAudioContext;
let withDestination = true;
let throwDestination = false;
class FakeAudioContext {
    public currentTime = 0;
    public destination: FakeDestination = {};
    public Gain = new FakeNode();
    public StreamDestination: FakeDestination = { stream };
    public Sources: FakeNode[] = [];
    public createMediaStreamDestination?: () => FakeDestination;
    constructor(_options?: AudioContextOptions) {
        lastContext = this;
        if (withDestination) {
            this.createMediaStreamDestination = () => {
                if (throwDestination) throw new Error('tap unavailable');
                return this.StreamDestination;
            };
        }
    }
    public createGain(): FakeNode { return this.Gain; }
    public createBuffer(_channels: number, length: number, rate: number): PlaybackBuffer {
        return { duration: length / rate, copyToChannel: () => {} };
    }
    public createBufferSource(): FakeNode {
        const source = new FakeNode();
        this.Sources.push(source);
        return source;
    }
    public async close(): Promise<void> {}
}
describe('RealtimePcmPlayback recording output', () => {
    beforeEach(() => {
        withDestination = true;
        throwDestination = false;
        vi.stubGlobal('AudioContext', FakeAudioContext);
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
    it('exposes a stream tap fed by the same gain as the speakers', () => {
        const playback = new RealtimePcmPlayback(24000);
        expect(playback.GetOutputStream()).toBe(stream);
        expect(lastContext.Gain.Targets).toEqual([lastContext.destination, lastContext.StreamDestination]);
        playback.Enqueue(new Int16Array([1000, -1000, 500]).buffer);
        expect(lastContext.Sources[0].Targets).toEqual([lastContext.Gain]);
    });
    it('keeps speaker playback available when stream destinations are unsupported', () => {
        withDestination = false;
        const playback = new RealtimePcmPlayback(24000);
        expect(playback.GetOutputStream()).toBeNull();
        expect(lastContext.Gain.Targets).toEqual([lastContext.destination]);
    });
    it('keeps speaker playback available and warns when recording tap creation fails', () => {
        throwDestination = true;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const playback = new RealtimePcmPlayback(24000);
        expect(playback.GetOutputStream()).toBeNull();
        expect(lastContext.Gain.Targets).toEqual([lastContext.destination]);
        expect(warn).toHaveBeenCalledOnce();
    });
});
