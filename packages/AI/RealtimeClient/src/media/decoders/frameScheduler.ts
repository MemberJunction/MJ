/**
 * @fileoverview FRAME SCHEDULER: shows decoded pictures on a {@link StreamCanvas} when their presentation time comes,
 * for the decoders that aren't MSE (WebCodecs chunks, images). MSE paces itself on the element's clock.
 *
 * - **On the voice's clock, when the player has one** ({@link FrameSchedulerOptions.Clock}): the meeting bot's rules, on
 *   media time. A picture shows when the clock reaches its time; one more than {@link MAX_CLOCK_LATE_MS} behind the clock
 *   is dropped, never shown; one ahead of it waits, and one more than {@link MAX_LEAD_MS} ahead is dropped (it belongs to
 *   a stream the voice has left). A picture timed before the last one shown starts a new stream: it waits while the clock
 *   still plays the old stream, instead of counting as late.
 * - **When the clock reads nothing.** After a reading, pictures carry on by their own times from the clock's last reading,
 *   as if the voice went on (the tail of a turn whose video outlasts its voice, or idle video between turns); a new stream
 *   then waits for its voice. Before any reading (at the start, or after a barge-in) pictures wait up to
 *   {@link CLOCK_WAIT_MS} for the voice to start, then go by their own times.
 * - **By their own times, without a clock.** The first timed picture after a start, a flush or a new stream anchors media
 *   time to the wall clock; each later picture shows when its time comes. When several are due, the newest shows and the
 *   older ones are dropped. A picture shown more than {@link MAX_LATE_MS} late anchors the pacing again; so does a
 *   picture timed before the last one shown, or more than {@link MAX_LEAD_MS} ahead.
 * - **Untimed pictures** (an image that carries no time) show as soon as they arrive.
 * - **Bounded.** The decoders hold encoded frames back while {@link FrameScheduler.Size} pictures wait, and the scheduler
 *   calls back each time it shows one, so a decoder never holds many decoded pictures (a browser decoder stalls when its
 *   output frames aren't closed).
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import type { IPlaybackClock } from '../playbackClock';
import type { StreamCanvas, StreamPicture } from './streamCanvas';

/** Without a clock, a picture shown this much later than its time anchors the pacing again, in milliseconds. */
export const MAX_LATE_MS = 250;

/** A picture due this much ahead starts a new stream (without a clock) or is dropped (on the clock), in milliseconds. */
export const MAX_LEAD_MS = 2000;

/** On the voice's clock, a picture this far behind it is dropped rather than shown, in milliseconds. */
export const MAX_CLOCK_LATE_MS = 500;

/** How long pictures wait for a clock that has read nothing yet before they go by their own times, in milliseconds. */
export const CLOCK_WAIT_MS = 500;

/** How often waiting pictures look at the clock again, at most, in milliseconds. */
export const CLOCK_POLL_MS = 20;

/** A picture waiting to be shown, with its presentation time when it has one. */
interface ScheduledPicture {
    Picture: StreamPicture;
    TimeMs?: number;
}

/** Where a point of media time falls on the wall clock. */
interface ClockAnchor {
    WallMs: number;
    MediaMs: number;
}

/** What a scheduler paces by, besides the pictures' own times. */
export interface FrameSchedulerOptions {
    /** The voice's playback clock: pictures show when it reaches their times. */
    Clock?: IPlaybackClock;
    /** The wall clock in milliseconds; injectable for tests. */
    Now?: () => number;
}

/** Shows pictures on a stream canvas at their presentation times: on the voice's clock when there is one. */
export class FrameScheduler {
    private readonly queue: ScheduledPicture[] = [];
    private readonly clock: IPlaybackClock | undefined;
    private readonly now: () => number;
    /** Own-time pacing: where the current stream's media time sits on the wall clock. */
    private anchor: ClockAnchor | null = null;
    /** The time of the last timed picture shown, to see a stream restart. */
    private lastShownMs: number | null = null;
    /** The clock's last reading and when it was taken, until the clock stops reading. */
    private lastReading: ClockAnchor | null = null;
    /** Whether own-time pacing carries on from the clock's last reading (the voice stopped). */
    private continuing = false;
    /** When the pictures began waiting for the voice's clock to read. */
    private waitingSince: number | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    /**
     * @param canvas Where pictures show.
     * @param onShown Called after each picture shown, so the decoder can decode more.
     * @param options The voice's clock, and a wall clock for tests.
     */
    constructor(
        private readonly canvas: StreamCanvas,
        private readonly onShown: () => void,
        options: FrameSchedulerOptions = {}
    ) {
        this.clock = options.Clock;
        this.now = options.Now ?? (() => performance.now());
    }

    /** How many pictures wait to be shown. */
    public get Size(): number {
        return this.queue.length;
    }

    /**
     * Queues a picture: it shows when its time comes, or at once when it has no time.
     *
     * @param picture The decoded picture; the scheduler closes it, shown or dropped.
     * @param timeMs Its presentation time on the stream's timeline, when it has one.
     */
    public Push(picture: StreamPicture, timeMs?: number): void {
        if (this.disposed) {
            picture.close();
            return;
        }
        this.queue.push({ Picture: picture, TimeMs: timeMs });
        if (this.timer === null) {
            this.tick();
        }
    }

    /** Drops every waiting picture and forgets both clocks: the pacing starts over. The last picture shown stays. */
    public Clear(): void {
        this.cancelTimer();
        for (const scheduled of this.queue.splice(0)) {
            scheduled.Picture.close();
        }
        this.anchor = null;
        this.lastShownMs = null;
        this.lastReading = null;
        this.continuing = false;
        this.waitingSince = null;
    }

    /** Clears, and closes every picture pushed later. */
    public Dispose(): void {
        this.disposed = true;
        this.Clear();
    }

    /** Shows the picture that is due now, if any, by the voice's clock or by the pictures' own times; then waits for the next. */
    private tick(): void {
        this.timer = null;
        const now = this.now();
        const clockMs = this.clock?.CurrentTimeMs ?? null;
        let shown = false;
        if (clockMs !== null) {
            this.lastReading = { WallMs: now, MediaMs: clockMs };
            shown = this.showByClock(clockMs);
        } else if (this.holdForClock(now)) {
            this.schedule(CLOCK_POLL_MS);
            return;
        } else {
            shown = this.showByOwnTime(now);
        }
        if (this.queue.length > 0) {
            this.schedule(clockMs === null ? this.ownTimeDelay(now) : this.clockDelay(clockMs));
        }
        if (shown) {
            this.onShown();
        }
    }

    /**
     * Whether the pictures wait for the voice's clock, which reads nothing now. A clock that read before stopped: pacing
     * carries on from its last reading, but a picture that starts a new stream waits for its voice. Pictures wait up to
     * {@link CLOCK_WAIT_MS}, then go by their own times. Never without a clock.
     */
    private holdForClock(now: number): boolean {
        if (!this.clock) {
            return false;
        }
        if (this.lastReading) {
            this.anchor = this.lastReading;
            this.lastReading = null;
            this.continuing = true;
        }
        if (this.continuing && this.headStartsNewStream()) {
            this.anchor = null;
            this.continuing = false;
            this.waitingSince = now;
        }
        if (this.anchor) {
            return false;
        }
        this.waitingSince ??= now;
        return now - this.waitingSince < CLOCK_WAIT_MS;
    }

    /** Whether the next picture is timed before the last one shown: it starts a new stream. */
    private headStartsNewStream(): boolean {
        const time = this.queue[0]?.TimeMs;
        return time !== undefined && this.lastShownMs !== null && time < this.lastShownMs;
    }

    /** Shows the newest picture the clock has reached, dropping the stale ones before it ({@link clockVerdict}). */
    private showByClock(clockMs: number): boolean {
        let due: ScheduledPicture | null = null;
        while (this.queue.length > 0) {
            const verdict = this.clockVerdict(this.queue[0].TimeMs, clockMs);
            if (verdict === 'wait') {
                break;
            }
            const head = this.queue.shift() as ScheduledPicture;
            if (verdict === 'drop') {
                head.Picture.close();
                continue;
            }
            due?.Picture.close();
            due = head;
        }
        if (due) {
            this.show(due);
        }
        return due !== null;
    }

    /**
     * What the clock says about a picture: it waits when it starts a new stream whose voice hasn't started, or is ahead of
     * the clock; it is dropped when more than {@link MAX_CLOCK_LATE_MS} behind the clock or more than {@link MAX_LEAD_MS}
     * ahead of it; otherwise it is due. An untimed picture is due at once.
     */
    private clockVerdict(timeMs: number | undefined, clockMs: number): 'show' | 'drop' | 'wait' {
        if (timeMs === undefined) {
            return 'show';
        }
        if (this.awaitsNewStream(timeMs, clockMs)) {
            return 'wait';
        }
        if (clockMs - timeMs > MAX_CLOCK_LATE_MS || timeMs - clockMs > MAX_LEAD_MS) {
            return 'drop';
        }
        return timeMs > clockMs ? 'wait' : 'show';
    }

    /**
     * Whether a picture starts a new stream whose voice hasn't started: it is timed before the last picture shown, and the
     * clock still reads the old stream (at or after that picture).
     */
    private awaitsNewStream(timeMs: number, clockMs: number): boolean {
        return this.lastShownMs !== null && timeMs < this.lastShownMs && clockMs >= this.lastShownMs;
    }

    /** Shows the newest picture whose own time has come (dropping older due ones). */
    private showByOwnTime(now: number): boolean {
        let due: { Scheduled: ScheduledPicture; DueMs: number } | null = null;
        while (this.queue.length > 0) {
            const dueMs = this.dueAt(this.queue[0], now);
            if (dueMs > now) {
                break;
            }
            due?.Scheduled.Picture.close();
            due = { Scheduled: this.queue.shift() as ScheduledPicture, DueMs: dueMs };
        }
        if (!due) {
            return false;
        }
        this.show(due.Scheduled);
        const time = due.Scheduled.TimeMs;
        if (time !== undefined && now - due.DueMs > MAX_LATE_MS) {
            this.anchor = { WallMs: now, MediaMs: time };
        }
        return true;
    }

    /** When a picture is due on the wall clock. A first picture, or one that starts a new stream, anchors the pacing to now. */
    private dueAt(scheduled: ScheduledPicture, now: number): number {
        const time = scheduled.TimeMs;
        if (time === undefined) {
            return now;
        }
        if (!this.anchor || this.startsNewStream(time, now)) {
            this.anchor = { WallMs: now, MediaMs: time };
        }
        return this.anchor.WallMs + (time - this.anchor.MediaMs);
    }

    /** A picture timed before the last one shown, or far ahead of the pacing, belongs to a new stream. */
    private startsNewStream(timeMs: number, now: number): boolean {
        const anchor = this.anchor as ClockAnchor;
        const backwards = this.lastShownMs !== null && timeMs < this.lastShownMs;
        return backwards || anchor.WallMs + (timeMs - anchor.MediaMs) - now > MAX_LEAD_MS;
    }

    private show(scheduled: ScheduledPicture): void {
        this.canvas.Show(scheduled.Picture);
        if (scheduled.TimeMs !== undefined) {
            this.lastShownMs = scheduled.TimeMs;
        }
    }

    /** By own time: until the next picture is due. */
    private ownTimeDelay(now: number): number {
        return Math.max(0, this.dueAt(this.queue[0], now) - now);
    }

    /** On the clock: until the clock should reach the next picture, but never longer than {@link CLOCK_POLL_MS}. */
    private clockDelay(clockMs: number): number {
        const time = this.queue[0].TimeMs;
        return time !== undefined && time > clockMs ? Math.min(CLOCK_POLL_MS, time - clockMs) : CLOCK_POLL_MS;
    }

    private schedule(delayMs: number): void {
        if (this.timer === null && !this.disposed) {
            this.timer = setTimeout(() => this.tick(), delayMs);
        }
    }

    private cancelTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
