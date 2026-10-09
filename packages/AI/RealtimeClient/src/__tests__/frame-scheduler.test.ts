import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FrameScheduler, MAX_LATE_MS, MAX_LEAD_MS } from '../media/decoders/frameScheduler';
import { StreamCanvas } from '../media/decoders/streamCanvas';
import { AsPicture, FakeImageBitmap, FakeTrackGenerator, FakeVideoFrame, InstallFakeWebCodecs, OpenPictures } from './helpers/fake-webcodecs';

/** A decoded picture; the scheduler reads the time it is pushed with. */
function picture(label: string): FakeVideoFrame {
    return new FakeVideoFrame(label, { timestamp: 0 });
}

describe('FrameScheduler', () => {
    let scheduler: FrameScheduler;
    let shownCallbacks: number;
    /** The wall clock the scheduler reads, in ms. A test moves it with {@link advance}, or alone to play a late timer. */
    let clock: number;

    /** Moves the clock and runs the timers due by then. */
    function advance(ms: number): void {
        clock += ms;
        vi.advanceTimersByTime(ms);
    }

    /** The labels of the pictures shown, in order. */
    const shown = (): string[] => FakeTrackGenerator.Instances[0].Written.map((frame) => frame.Label);

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        InstallFakeWebCodecs();
        clock = 0;
        shownCallbacks = 0;
        scheduler = new FrameScheduler(new StreamCanvas(), () => shownCallbacks++, () => clock);
    });

    afterEach(() => {
        scheduler.Dispose();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('shows the first timed picture at once, and each later one when its time comes', () => {
        scheduler.Push(AsPicture(picture('a')), 0);
        scheduler.Push(AsPicture(picture('b')), 40);
        scheduler.Push(AsPicture(picture('c')), 80);
        expect(shown()).toEqual(['a']);
        expect(scheduler.Size).toBe(2);

        advance(39);
        expect(shown()).toEqual(['a']);
        advance(1);
        expect(shown()).toEqual(['a', 'b']);
        advance(40);
        expect(shown()).toEqual(['a', 'b', 'c']);
        expect(shownCallbacks).toBe(3);
    });

    it('shows only the newest of the pictures due when its timer runs late, closing the others', () => {
        scheduler.Push(AsPicture(picture('a')), 0);
        const waiting = [picture('b'), picture('c'), picture('d')];
        waiting.forEach((frame, i) => scheduler.Push(AsPicture(frame), 40 * (i + 1)));

        clock = 200; // the page was busy: the timer for b runs at 200 ms
        vi.advanceTimersByTime(40);
        expect(shown()).toEqual(['a', 'd']);
        expect(waiting.map((frame) => frame.Closed)).toEqual([true, true, true]);
        // Only the stream canvas's copy of the last picture shown stays open: it is what an element attached later shows.
        expect(OpenPictures.Count).toBe(1);
    });

    it(`anchors the clock again after a picture shown more than ${MAX_LATE_MS} ms late`, () => {
        scheduler.Push(AsPicture(picture('a')), 0);
        clock = 1000;
        scheduler.Push(AsPicture(picture('b')), 40);
        scheduler.Push(AsPicture(picture('c')), 80);
        expect(shown()).toEqual(['a', 'b']);

        // Paced from b, shown at 1000 ms: c is due 40 ms later, not at once.
        advance(39);
        expect(shown()).toEqual(['a', 'b']);
        advance(1);
        expect(shown()).toEqual(['a', 'b', 'c']);
    });

    it('keeps the clock for a picture shown a little late', () => {
        scheduler.Push(AsPicture(picture('a')), 0);
        clock = 100;
        scheduler.Push(AsPicture(picture('b')), 40);
        scheduler.Push(AsPicture(picture('c')), 200);
        // b was 60 ms late; c stays due at 200 ms.
        advance(99);
        expect(shown()).toEqual(['a', 'b']);
        advance(1);
        expect(shown()).toEqual(['a', 'b', 'c']);
    });

    it('starts a new stream at a picture timed before the last one shown', () => {
        scheduler.Push(AsPicture(picture('a')), 5000);
        scheduler.Push(AsPicture(picture('b')), 5040);
        advance(40);
        // The stream restarts 40 ms back: it is paced from now, not from the old anchor.
        scheduler.Push(AsPicture(picture('restart')), 5000);
        scheduler.Push(AsPicture(picture('next')), 5040);
        expect(shown()).toEqual(['a', 'b', 'restart']);
        advance(39);
        expect(shown()).toEqual(['a', 'b', 'restart']);
        advance(1);
        expect(shown()).toEqual(['a', 'b', 'restart', 'next']);
    });

    it(`starts a new stream at a picture more than ${MAX_LEAD_MS} ms ahead, and waits for one within reach`, () => {
        scheduler.Push(AsPicture(picture('a')), 0);
        scheduler.Push(AsPicture(picture('near')), 1500);
        advance(1499);
        expect(shown()).toEqual(['a']);
        advance(1);
        scheduler.Push(AsPicture(picture('far')), 1500 + MAX_LEAD_MS + 1);
        expect(shown()).toEqual(['a', 'near', 'far']);
    });

    it('shows a picture without a time as soon as it arrives', () => {
        scheduler.Push(AsPicture(new FakeImageBitmap('still')));
        expect(shown()).toEqual(['still']);
        expect(shownCallbacks).toBe(1);
    });

    it('Clear closes the pictures waiting and forgets the clock; the last one shown stays', () => {
        scheduler.Push(AsPicture(picture('a')), 0);
        const waiting = picture('b');
        scheduler.Push(AsPicture(waiting), 40);
        scheduler.Clear();
        expect(waiting.Closed).toBe(true);
        expect(scheduler.Size).toBe(0);

        advance(100);
        expect(shown()).toEqual(['a']);
        scheduler.Push(AsPicture(picture('c')), 500);
        expect(shown()).toEqual(['a', 'c']);
    });

    it('closes pictures pushed after Dispose, and shows none', () => {
        scheduler.Dispose();
        const late = picture('late');
        scheduler.Push(AsPicture(late), 0);
        expect(late.Closed).toBe(true);
        expect(shown()).toEqual([]);
    });
});
