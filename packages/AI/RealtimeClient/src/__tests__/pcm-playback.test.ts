import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RealtimePcmPlayback } from '../audio/pcmPlayback';

/** Records every `connect(target)` so tests can assert the audio graph's edges. */
class FakeNode {
    public Targets: unknown[] = [];
    public buffer: unknown = null;
    public onended: (() => void) | null = null;
    public connect(target: unknown): void {
        this.Targets.push(target);
    }
    public start(_when: number): void {}
    public stop(): void {}
}

const STREAM_SENTINEL = { id: 'tap-stream' } as unknown as MediaStream;
const DESTINATION_SENTINEL = { id: 'speakers' };

let lastContext: FakeAudioContext | null = null;
let withStreamDestination = true;

class FakeAudioContext {
    public currentTime = 0;
    public destination = DESTINATION_SENTINEL;
    public Gain = new FakeNode();
    public StreamDestination = { stream: STREAM_SENTINEL };
    public Sources: FakeNode[] = [];

    constructor(_options?: AudioContextOptions) {
        lastContext = this;
        if (withStreamDestination) {
            (this as unknown as { createMediaStreamDestination: () => unknown }).createMediaStreamDestination = () =>
                this.StreamDestination;
        }
    }
    public createGain(): FakeNode {
        return this.Gain;
    }
    public createBuffer(_channels: number, length: number, rate: number): unknown {
        return { duration: length / rate, copyToChannel: () => {} };
    }
    public createBufferSource(): FakeNode {
        const source = new FakeNode();
        this.Sources.push(source);
        return source;
    }
    public async close(): Promise<void> {}
}

describe('RealtimePcmPlayback output stream', () => {
    const original = (globalThis as { AudioContext?: unknown }).AudioContext;

    beforeEach(() => {
        lastContext = null;
        withStreamDestination = true;
        (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
    });
    afterEach(() => {
        (globalThis as { AudioContext?: unknown }).AudioContext = original;
    });

    it('GetOutputStream returns the stream destination node stream', () => {
        const playback = new RealtimePcmPlayback(24000);
        expect(playback.GetOutputStream()).toBe(STREAM_SENTINEL);
    });

    it('routes the master gain to both the speakers and the stream tap', () => {
        new RealtimePcmPlayback(24000);
        const targets = lastContext!.Gain.Targets;
        expect(targets).toContain(DESTINATION_SENTINEL);
        expect(targets).toContain(lastContext!.StreamDestination);
    });

    it('connects enqueued chunks to the master gain so the tap carries them', () => {
        const playback = new RealtimePcmPlayback(24000);
        playback.Enqueue(new Int16Array([1000, -1000, 500]).buffer);
        expect(lastContext!.Sources).toHaveLength(1);
        expect(lastContext!.Sources[0].Targets).toEqual([lastContext!.Gain]);
    });

    it('returns null and still constructs when the context has no createMediaStreamDestination', () => {
        withStreamDestination = false;
        const playback = new RealtimePcmPlayback(24000);
        expect(playback.GetOutputStream()).toBeNull();
        expect(lastContext!.Gain.Targets).toEqual([DESTINATION_SENTINEL]);
    });
});
