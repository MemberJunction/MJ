import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RealtimePcmPlayback } from '../audio/pcmPlayback';
import type { IPlaybackClock } from '../media/playbackClock';

/** A source node that records when it was started. */
class FakeSource {
    public buffer: unknown = null;
    public onended: (() => void) | null = null;
    public StartedAt: number | null = null;
    public connect(): void {}
    public start(when: number): void {
        this.StartedAt = when;
    }
    public stop(): void {}
}

let context: FakeClockContext | null = null;

/** An audio context whose clock and output latency a test sets. */
class FakeClockContext {
    public currentTime = 0;
    public outputLatency: number | undefined = undefined;
    public baseLatency: number | undefined = undefined;
    public destination = {};
    public Sources: FakeSource[] = [];

    constructor() {
        context = this;
    }
    public createGain(): { connect: () => void } {
        return { connect: () => undefined };
    }
    public createBuffer(_channels: number, length: number, rate: number): unknown {
        return { duration: length / rate, copyToChannel: () => undefined };
    }
    public createBufferSource(): FakeSource {
        const source = new FakeSource();
        this.Sources.push(source);
        return source;
    }
    public async close(): Promise<void> {}
}

/** A PCM16 chunk that plays for `ms` at 24 kHz. */
function pcm(ms: number): ArrayBuffer {
    return new Int16Array(Math.round((ms / 1000) * 24000)).fill(1000).buffer;
}

/** Moves the fake context's clock to `seconds`. */
function at(seconds: number): void {
    (context as FakeClockContext).currentTime = seconds;
}

describe('RealtimePcmPlayback as the playback clock', () => {
    const original = (globalThis as { AudioContext?: unknown }).AudioContext;
    let playback: RealtimePcmPlayback;

    beforeEach(() => {
        (globalThis as { AudioContext?: unknown }).AudioContext = FakeClockContext;
        playback = new RealtimePcmPlayback(24000);
    });
    afterEach(() => {
        (globalThis as { AudioContext?: unknown }).AudioContext = original;
    });

    it('is an IPlaybackClock that reads nothing while nothing is queued', () => {
        const clock: IPlaybackClock = playback;
        expect(clock.CurrentTimeMs).toBeNull();
    });

    it('reads the media time of the audio playing now, across chunks scheduled back to back', () => {
        at(1);
        playback.Enqueue(pcm(100), 5000);
        playback.Enqueue(pcm(100), 5100);
        expect(context?.Sources.map((source) => source.StartedAt)).toEqual([1, 1.1]);

        at(1.05);
        expect(playback.CurrentTimeMs).toBeCloseTo(5050, 6);
        at(1.15);
        expect(playback.CurrentTimeMs).toBeCloseTo(5150, 6);
        at(1.21);
        expect(playback.CurrentTimeMs).toBeNull();
    });

    it('reads the time of a chunk scheduled ahead only once it plays', () => {
        at(2);
        playback.Enqueue(pcm(200), 0);
        playback.Enqueue(pcm(200), 900);
        at(2.1);
        expect(playback.CurrentTimeMs).toBeCloseTo(100, 6);
        at(2.25);
        expect(playback.CurrentTimeMs).toBeCloseTo(950, 6);
    });

    it('carries an untimed chunk on from the timed chunk before it', () => {
        at(0);
        playback.Enqueue(pcm(100), 2000);
        playback.Enqueue(pcm(100));
        at(0.15);
        expect(playback.CurrentTimeMs).toBeCloseTo(2150, 6);
    });

    it('reads nothing for untimed audio with no timed audio before it, as for drivers that time nothing', () => {
        at(0);
        playback.Enqueue(pcm(100));
        playback.Enqueue(pcm(100), Number.NaN);
        at(0.05);
        expect(playback.CurrentTimeMs).toBeNull();
        at(0.15);
        expect(playback.CurrentTimeMs).toBeNull();
    });

    it('reads nothing in a gap between chunks, and the next chunk where it was scheduled', () => {
        at(0);
        playback.Enqueue(pcm(100), 0);
        at(0.3);
        playback.Enqueue(pcm(100), 100);
        at(0.2);
        expect(playback.CurrentTimeMs).toBeNull();
        at(0.35);
        expect(playback.CurrentTimeMs).toBeCloseTo(150, 6);
    });

    it('subtracts the output latency the browser reports: what is heard now was rendered that long ago', () => {
        at(0);
        playback.Enqueue(pcm(200), 1000);
        at(0.15);
        (context as FakeClockContext).outputLatency = 0.04;
        (context as FakeClockContext).baseLatency = 0.01;
        expect(playback.CurrentTimeMs).toBeCloseTo(1100, 6);
        (context as FakeClockContext).outputLatency = Number.NaN;
        (context as FakeClockContext).baseLatency = -1;
        expect(playback.CurrentTimeMs).toBeCloseTo(1150, 6);
        (context as FakeClockContext).outputLatency = Number.POSITIVE_INFINITY;
        expect(playback.CurrentTimeMs).toBeCloseTo(1150, 6);
    });

    it('reads nothing after Flush, and times new chunks after it', () => {
        at(0);
        playback.Enqueue(pcm(500), 3000);
        at(0.1);
        playback.Flush();
        expect(playback.CurrentTimeMs).toBeNull();
        playback.Enqueue(pcm(100));
        expect(playback.CurrentTimeMs).toBeNull();
        playback.Enqueue(pcm(100), 0);
        at(0.25);
        expect(playback.CurrentTimeMs).toBeCloseTo(50, 6);
    });
});
