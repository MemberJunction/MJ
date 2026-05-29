/**
 * Multicast bus for inbound `AudioFrame`s used by `CascadedChannelEngine`.
 *
 * Why this exists: transports (`WebRTCTransport`, `WebSocketTransport`) back
 * `AudioFramesIn` with a single-consumer `AsyncQueue`. The cascaded engine
 * needs to feed inbound audio to BOTH the VAD pipeline AND a per-turn STT
 * stream concurrently — if each iterated the transport iterable directly,
 * frames would be split between them and neither would receive the full
 * stream. The bus solves that by subscribing once to the transport and
 * fanning frames out to N subscribers.
 *
 * Semantics:
 *  - New subscribers see ONLY frames pushed after `Subscribe()` returns. No
 *    backlog / replay — for live voice that's the correct choice (we never
 *    want to feed stale audio into a fresh STT stream).
 *  - `Unsubscribe()` is required for per-turn consumers; otherwise their
 *    queues grow unbounded after the consumer's loop exits.
 *  - `Close()` ends iteration on all current subscribers and rejects future
 *    subscribers (they get an empty stream).
 *  - The pump task started by `PumpFrom` is owned by the bus; the caller
 *    should await the returned promise on teardown to avoid orphaning it.
 *
 * Not exported from `src/index.ts` — internal to the cascaded engine.
 */
import type { AudioFrame } from '@memberjunction/ai';
import { LogError } from '@memberjunction/core';

/**
 * A single subscription to an `AudioFrameBus`. Iterating yields every frame
 * the bus receives from the moment `Subscribe()` was called until either the
 * subscriber calls `Unsubscribe()` or the bus is closed.
 */
export interface AudioFrameSubscription extends AsyncIterable<AudioFrame> {
    /** Stop receiving frames and release the bus slot. Idempotent. */
    Unsubscribe(): void;
}

export class AudioFrameBus {
    private subscribers = new Set<AudioFrameQueue>();
    private closed = false;

    /** Subscribe to all future frames. Caller MUST `Unsubscribe()` to release. */
    public Subscribe(): AudioFrameSubscription {
        const queue = new AudioFrameQueue();
        if (this.closed) {
            queue.Close();
            return this.toSubscription(queue);
        }
        this.subscribers.add(queue);
        return this.toSubscription(queue);
    }

    /**
     * Pump frames from a single-consumer iterable into all subscribers. Runs
     * as a background task; the returned promise resolves when the source
     * iterable ends or `Close()` is called.
     */
    public PumpFrom(source: AsyncIterable<AudioFrame>): Promise<void> {
        return this.runPump(source);
    }

    /** Close the bus. All current subscribers see iteration end. Idempotent. */
    public Close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const sub of this.subscribers) {
            sub.Close();
        }
        this.subscribers.clear();
    }

    private async runPump(source: AsyncIterable<AudioFrame>): Promise<void> {
        try {
            for await (const frame of source) {
                if (this.closed) return;
                for (const sub of this.subscribers) {
                    sub.Push(frame);
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`AudioFrameBus: pump failed: ${msg}`);
        } finally {
            this.Close();
        }
    }

    private toSubscription(queue: AudioFrameQueue): AudioFrameSubscription {
        const bus = this;
        return {
            [Symbol.asyncIterator](): AsyncIterator<AudioFrame> {
                return queue[Symbol.asyncIterator]();
            },
            Unsubscribe(): void {
                bus.subscribers.delete(queue);
                queue.Close();
            },
        };
    }
}

/**
 * Per-subscriber bounded queue. Same shape as the transports' internal
 * `AsyncQueue`; inlined here to keep the bus self-contained.
 */
class AudioFrameQueue implements AsyncIterable<AudioFrame> {
    private items: AudioFrame[] = [];
    private waiters: Array<(value: IteratorResult<AudioFrame>) => void> = [];
    private closed = false;

    public Push(frame: AudioFrame): void {
        if (this.closed) return;
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value: frame, done: false });
        } else {
            this.items.push(frame);
        }
    }

    public Close(): void {
        if (this.closed) return;
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) {
                w({ value: undefined as never, done: true });
            }
        }
    }

    public [Symbol.asyncIterator](): AsyncIterator<AudioFrame> {
        const self = this;
        return {
            next(): Promise<IteratorResult<AudioFrame>> {
                if (self.items.length > 0) {
                    const value = self.items.shift() as AudioFrame;
                    return Promise.resolve({ value, done: false });
                }
                if (self.closed) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<AudioFrame>>((resolve) => {
                    self.waiters.push(resolve);
                });
            },
        };
    }
}
