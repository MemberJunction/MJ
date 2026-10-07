/**
 * @fileoverview Coalesces a caller's individual key presses into one short note for the model.
 *
 * Carriers deliver keypad input one digit at a time. Handing each press to the model as its own context note
 * would flood it for a PIN or account number, so presses are gathered until the caller pauses and then flushed
 * together (`"1234"`). The timer is `unref`'d and cleared on {@link Dispose}.
 *
 * @module @memberjunction/ai-bridge-server
 */

/** How long the keypad must be quiet before the gathered digits are flushed. */
export const DTMF_QUIET_MS = 1500;

/** The most digits gathered before a flush is forced, so a held-down key cannot grow the buffer without bound. */
export const DTMF_MAX_BUFFERED_DIGITS = 64;

/** Gathers key presses and flushes them after a quiet period. */
export class DtmfCoalescer {
    private buffer = '';
    private timer: ReturnType<typeof setTimeout> | null = null;

    /**
     * @param onFlush Called with the gathered digits when the caller pauses.
     * @param quietMs How long the keypad must be quiet before flushing.
     */
    constructor(
        private readonly onFlush: (digits: string) => void,
        private readonly quietMs: number = DTMF_QUIET_MS,
    ) {}

    /** Adds presses to the buffer and (re)starts the quiet timer. */
    public Push(digits: string): void {
        if (!digits) {
            return;
        }
        this.buffer += digits;
        if (this.buffer.length >= DTMF_MAX_BUFFERED_DIGITS) {
            this.flush();
            return;
        }
        this.clearTimer();
        this.timer = setTimeout(() => this.flush(), this.quietMs);
        (this.timer as { unref?: () => void }).unref?.();
    }

    /** Discards anything buffered and cancels the timer (session teardown). */
    public Dispose(): void {
        this.clearTimer();
        this.buffer = '';
    }

    private flush(): void {
        this.clearTimer();
        const digits = this.buffer;
        this.buffer = '';
        if (digits) {
            this.onFlush(digits);
        }
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
