/**
 * @fileoverview FRAME SCHEDULER: shows decoded pictures on a {@link StreamCanvas} when their presentation time comes,
 * for the decoders that aren't MSE (WebCodecs chunks, images). MSE paces itself on the element's clock.
 *
 * - **Timed pictures play by their own times.** The first timed picture after a start, a flush or a new stream anchors
 *   media time to the wall clock; each later picture shows when its time comes.
 * - **Late pictures catch up.** When several pictures are due, the newest shows and the older ones are dropped. A
 *   picture shown more than {@link MAX_LATE_MS} late anchors the clock again, so the pictures after it are paced from now.
 * - **A new stream anchors again:** a picture timed before the last one shown, or more than {@link MAX_LEAD_MS} ahead.
 * - **Untimed pictures** (an image that carries no time) show as soon as they arrive.
 * - **Bounded.** The decoders hold encoded frames back while {@link FrameScheduler.Size} pictures wait, and the scheduler
 *   calls back each time it shows one, so a decoder never holds many decoded pictures (a browser decoder stalls when its
 *   output frames aren't closed).
 *
 * @module @memberjunction/ai-realtime-client/media
 */
import type { StreamCanvas, StreamPicture } from './streamCanvas';

/** A picture shown this much later than its time anchors the clock again, in milliseconds. */
export const MAX_LATE_MS = 250;

/** A picture due this much ahead of the clock starts a new stream, in milliseconds. */
export const MAX_LEAD_MS = 2000;

/** A picture waiting to be shown, with its presentation time when it has one. */
interface ScheduledPicture {
    Picture: StreamPicture;
    TimeMs?: number;
}

/** Where media time 0 of the current stream falls on the wall clock. */
interface ClockAnchor {
    WallMs: number;
    MediaMs: number;
}

/** Shows pictures on a stream canvas at their presentation times. */
export class FrameScheduler {
    private readonly queue: ScheduledPicture[] = [];
    private anchor: ClockAnchor | null = null;
    /** The time of the last timed picture shown, to see a stream restart. */
    private lastShownMs: number | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    /**
     * @param canvas Where pictures show.
     * @param onShown Called after each picture shown, so the decoder can decode more.
     * @param now The wall clock in milliseconds; injectable for tests.
     */
    constructor(
        private readonly canvas: StreamCanvas,
        private readonly onShown: () => void,
        private readonly now: () => number = () => performance.now()
    ) {}

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

    /** Drops every waiting picture and forgets the clock: the next timed picture anchors it again. The last picture shown stays. */
    public Clear(): void {
        this.cancelTimer();
        for (const scheduled of this.queue.splice(0)) {
            scheduled.Picture.close();
        }
        this.anchor = null;
        this.lastShownMs = null;
    }

    /** Clears, and closes every picture pushed later. */
    public Dispose(): void {
        this.disposed = true;
        this.Clear();
    }

    /** Shows the newest picture whose time has come (dropping older due ones), then waits for the next. */
    private tick(): void {
        this.timer = null;
        const now = this.now();
        let due: { Scheduled: ScheduledPicture; DueMs: number } | null = null;
        while (this.queue.length > 0) {
            const dueMs = this.dueAt(this.queue[0], now);
            if (dueMs > now) {
                break;
            }
            due?.Scheduled.Picture.close();
            due = { Scheduled: this.queue.shift() as ScheduledPicture, DueMs: dueMs };
        }
        if (due) {
            this.show(due.Scheduled, due.DueMs, now);
        }
        this.scheduleNext(now);
        if (due) {
            this.onShown();
        }
    }

    /** When a picture is due on the wall clock. A first picture, or one that starts a new stream, anchors the clock to now. */
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

    /** A picture timed before the last one shown, or far ahead of the clock, belongs to a new stream. */
    private startsNewStream(timeMs: number, now: number): boolean {
        const anchor = this.anchor as ClockAnchor;
        const backwards = this.lastShownMs !== null && timeMs < this.lastShownMs;
        return backwards || anchor.WallMs + (timeMs - anchor.MediaMs) - now > MAX_LEAD_MS;
    }

    private show(scheduled: ScheduledPicture, dueMs: number, now: number): void {
        this.canvas.Show(scheduled.Picture);
        if (scheduled.TimeMs === undefined) {
            return;
        }
        this.lastShownMs = scheduled.TimeMs;
        if (now - dueMs > MAX_LATE_MS) {
            this.anchor = { WallMs: now, MediaMs: scheduled.TimeMs };
        }
    }

    private scheduleNext(now: number): void {
        if (this.queue.length === 0 || this.timer !== null) {
            return;
        }
        const delay = Math.max(0, this.dueAt(this.queue[0], now) - now);
        this.timer = setTimeout(() => this.tick(), delay);
    }

    private cancelTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
