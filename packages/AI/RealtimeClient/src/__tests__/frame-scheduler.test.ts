import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CLOCK_POLL_MS, CLOCK_WAIT_MS, FrameScheduler, MAX_CLOCK_LATE_MS, MAX_LATE_MS, MAX_LEAD_MS } from '../media/decoders/frameScheduler';
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
        scheduler = new FrameScheduler(new StreamCanvas(), () => shownCallbacks++, { Now: () => clock });
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

describe('FrameScheduler on the voice clock', () => {
    let scheduler: FrameScheduler;
    /** The wall clock (ms) the scheduler reads. */
    let wall: number;
    /** What the voice's clock reads, and how many times it was read. */
    const voice = {
        Reading: null as number | null,
        Reads: 0,
        get CurrentTimeMs(): number | null {
            this.Reads++;
            return this.Reading;
        },
    };

    function advance(ms: number): void {
        wall += ms;
        vi.advanceTimersByTime(ms);
    }

    const shown = (): string[] => FakeTrackGenerator.Instances[0].Written.map((frame) => frame.Label);
    const push = (label: string, timeMs?: number): FakeVideoFrame => {
        const frame = picture(label);
        scheduler.Push(AsPicture(frame), timeMs);
        return frame;
    };

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        InstallFakeWebCodecs();
        wall = 0;
        voice.Reading = null;
        voice.Reads = 0;
        scheduler = new FrameScheduler(new StreamCanvas(), () => undefined, { Clock: voice, Now: () => wall });
    });

    afterEach(() => {
        scheduler.Dispose();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('shows a picture when the voice reaches its time, not when its own time comes', () => {
        voice.Reading = 1000;
        push('a', 1000);
        push('b', 1040);
        expect(shown()).toEqual(['a']);

        advance(40); // the wall clock says b is due; the voice is behind
        expect(shown()).toEqual(['a']);
        voice.Reading = 1040;
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['a', 'b']);
    });

    it(`drops a picture more than ${MAX_CLOCK_LATE_MS} ms behind the voice, and shows one within that`, () => {
        voice.Reading = 2000;
        const tooLate = push('too-late', 1400);
        expect(shown()).toEqual([]);
        expect(tooLate.Closed).toBe(true);
        push('late', 1600);
        expect(shown()).toEqual(['late']);
    });

    it('shows only the newest of the pictures the voice has passed, closing the others', () => {
        voice.Reading = 1500;
        const passed = push('a', 1600);
        push('b', 1700);
        voice.Reading = 1800; // the voice jumped ahead of both
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['b']);
        expect(passed.Closed).toBe(true);
    });

    it(`drops a picture more than ${MAX_LEAD_MS} ms ahead of the voice: it belongs to a stream the voice has left`, () => {
        voice.Reading = 100;
        const stale = push('old-tail', 100 + MAX_LEAD_MS + 1);
        push('near', 140);
        voice.Reading = 140;
        advance(40);
        expect(stale.Closed).toBe(true);
        expect(shown()).toEqual(['near']);
    });

    it('looks at the voice every 10 to 40 ms while a picture waits: within a frame at 25 fps, and never in a busy loop', () => {
        voice.Reading = 0;
        push('a', 0);
        push('b', 1000);
        voice.Reads = 0;
        advance(400);
        expect(voice.Reads).toBeGreaterThanOrEqual(400 / 40);
        expect(voice.Reads).toBeLessThanOrEqual(400 / 10);
    });

    it('wakes when the voice should reach the next picture, sooner than a poll', () => {
        voice.Reading = 0;
        push('a', 0);
        push('b', 5);
        voice.Reading = 5;
        advance(5);
        expect(shown()).toEqual(['a', 'b']);
    });

    it(`waits up to ${CLOCK_WAIT_MS} ms for a voice that hasn't started, then goes by the pictures' own times`, () => {
        push('a', 0);
        push('b', 40);
        advance(CLOCK_WAIT_MS - CLOCK_POLL_MS);
        expect(shown()).toEqual([]);
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['a']);
        advance(40);
        expect(shown()).toEqual(['a', 'b']);
    });

    it('follows the voice once it starts within the wait', () => {
        push('a', 0);
        push('b', 40);
        advance(100);
        voice.Reading = 40;
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['b']);
    });

    it("carries on by the pictures' own times from the voice's last reading when the voice stops", () => {
        voice.Reading = 1000;
        push('a', 1000);
        push('tail', 1100);
        voice.Reading = null; // the turn's voice ended at about 1000
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['a']);
        advance(100 - CLOCK_POLL_MS - 1);
        expect(shown()).toEqual(['a']);
        advance(1);
        expect(shown()).toEqual(['a', 'tail']);
    });

    it("holds a new stream's pictures while the voice still plays the old stream, and shows them when it starts over", () => {
        voice.Reading = 5000;
        push('old', 5000);
        const restart = push('new', 0);
        advance(200);
        voice.Reading = 5200;
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['old']);
        expect(restart.Closed).toBe(false);

        voice.Reading = 0;
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['old', 'new']);
    });

    it("waits for a new stream's voice after the old voice stopped, then goes by its own times", () => {
        voice.Reading = 5000;
        push('old', 5000);
        voice.Reading = null;
        advance(CLOCK_POLL_MS);
        push('new', 0);
        advance(CLOCK_WAIT_MS - CLOCK_POLL_MS);
        expect(shown()).toEqual(['old']);
        advance(CLOCK_POLL_MS);
        expect(shown()).toEqual(['old', 'new']);
    });

    it('waits for the voice again after Clear (a barge-in), however it was pacing before', () => {
        voice.Reading = 1000;
        push('a', 1000);
        scheduler.Clear();
        voice.Reading = null;
        push('next-turn', 0);
        advance(CLOCK_WAIT_MS - CLOCK_POLL_MS);
        expect(shown()).toEqual(['a']);

        advance(CLOCK_POLL_MS); // no voice came: by its own time
        expect(shown()).toEqual(['a', 'next-turn']);
        scheduler.Clear();
        push('after-second-clear', 0);
        advance(CLOCK_WAIT_MS - CLOCK_POLL_MS);
        expect(shown()).toEqual(['a', 'next-turn']);
    });

    it("re-anchors a new stream at once when pacing by its own times after a wait, even if it once carried on from the voice", () => {
        voice.Reading = 1000;
        push('a', 1000);
        push('tail', 1100);
        voice.Reading = null;
        advance(CLOCK_POLL_MS); // the voice stopped while the tail waited: carrying on from it
        scheduler.Clear();
        push('b', 500);
        advance(CLOCK_WAIT_MS); // no voice came: by its own time
        expect(shown()).toEqual(['a', 'b']);
        push('restart', 100);
        expect(shown()).toEqual(['a', 'b', 'restart']);
    });

    it('shows an untimed picture at once, whatever the voice reads', () => {
        voice.Reading = 9000;
        scheduler.Push(AsPicture(new FakeImageBitmap('still')));
        expect(shown()).toEqual(['still']);
    });
});
