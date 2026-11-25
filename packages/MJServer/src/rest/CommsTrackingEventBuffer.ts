/**
 * @fileoverview In-memory buffer between the public open and click tracking routes and the
 * `comms.activity` work queue.
 *
 * The tracking routes answer without touching the database: they check a signature, hand the hit
 * to this buffer and return. The buffer publishes what it holds in batches, a moment later.
 *
 * The trade is deliberate. A hit that is still in the buffer when the process dies is lost, and a
 * batch the queue refuses is dropped, not retried. Open and click counts are engagement
 * statistics, so losing about one flush interval of them is acceptable. Anything that must not be
 * lost (unsubscribes, provider webhooks) is published directly and never goes through here.
 *
 * @module @memberjunction/server/rest/CommsTrackingEventBuffer
 */

import { LogError } from '@memberjunction/core';
import { IShutdownable, ShutdownRegistry } from '@memberjunction/global';

/** 1s between a hit arriving and its batch being published, when `FlushIntervalMs` is unset. This is also the most that a process crash loses. */
export const DEFAULT_TRACKING_FLUSH_INTERVAL_MS = 1000;

/** 500 hits per publish call when `MaxBatchSize` is unset: large enough to make one insert round trip worth it, small enough to stay well inside a queue transport's batch limits. */
export const DEFAULT_TRACKING_MAX_BATCH_SIZE = 500;

/** 50,000 buffered hits when `MaxBufferedEvents` is unset. Only reached when the queue is not accepting batches; past it new hits are dropped so an outage cannot exhaust the process's memory. */
export const DEFAULT_TRACKING_MAX_BUFFERED_EVENTS = 50_000;

/** Tuning for {@link CommsTrackingEventBuffer}. */
export interface CommsTrackingEventBufferOptions {
    /** Milliseconds a hit may wait before its batch is published. Default {@link DEFAULT_TRACKING_FLUSH_INTERVAL_MS}. */
    FlushIntervalMs?: number;
    /** Hits per publish call; reaching it publishes at once. Default {@link DEFAULT_TRACKING_MAX_BATCH_SIZE}. */
    MaxBatchSize?: number;
    /** Hits held while the queue is not accepting them; past it new hits are dropped. Default {@link DEFAULT_TRACKING_MAX_BUFFERED_EVENTS}. */
    MaxBufferedEvents?: number;
}

/**
 * Collects tracking hits in memory and publishes them in batches. `Add` is synchronous and never
 * throws, so a request handler can call it and answer immediately.
 *
 * Registers itself with `ShutdownRegistry`, so a graceful shutdown publishes what is still held.
 */
export class CommsTrackingEventBuffer<T> implements IShutdownable {
    public readonly ShutdownName = 'CommsTrackingEventBuffer';

    private readonly flushIntervalMs: number;
    private readonly maxBatchSize: number;
    private readonly maxBufferedEvents: number;
    private pending: T[] = [];
    private timer: ReturnType<typeof setTimeout> | undefined;
    private draining: Promise<void> | undefined;
    private overflowCount = 0;

    /**
     * @param publish - Publishes one batch. A rejection drops that batch.
     */
    public constructor(
        private readonly publish: (items: T[]) => Promise<void>,
        options: CommsTrackingEventBufferOptions = {},
    ) {
        this.flushIntervalMs = options.FlushIntervalMs ?? DEFAULT_TRACKING_FLUSH_INTERVAL_MS;
        this.maxBatchSize = Math.max(1, options.MaxBatchSize ?? DEFAULT_TRACKING_MAX_BATCH_SIZE);
        this.maxBufferedEvents = Math.max(
            this.maxBatchSize,
            options.MaxBufferedEvents ?? DEFAULT_TRACKING_MAX_BUFFERED_EVENTS,
        );
        ShutdownRegistry.Instance.Register(this);
    }

    /** Hits waiting to be published. */
    public get PendingCount(): number {
        return this.pending.length;
    }

    /** Queues a hit for the next batch. Drops it when the buffer is full. */
    public Add(item: T): void {
        if (this.pending.length >= this.maxBufferedEvents) {
            this.overflowCount++;
            return;
        }
        this.pending.push(item);
        if (this.pending.length >= this.maxBatchSize) {
            void this.Flush();
        }
        this.armTimer();
    }

    /** Publishes everything held. Resolves when the buffer is empty; never rejects. */
    public Flush(): Promise<void> {
        this.clearTimer();
        this.draining ??= this.drain().finally(() => {
            this.draining = undefined;
        });
        return this.draining;
    }

    /** Publishes what is held; called by `ShutdownRegistry` on a graceful shutdown. */
    public Shutdown(): Promise<void> {
        return this.Flush();
    }

    private armTimer(): void {
        if (this.timer || this.pending.length === 0) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.Flush();
        }, this.flushIntervalMs);
        // A waiting flush must not keep the process alive; shutdown flushes explicitly.
        this.timer.unref?.();
    }

    private clearTimer(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }

    private async drain(): Promise<void> {
        while (this.pending.length > 0) {
            const batch = this.pending.splice(0, this.maxBatchSize);
            try {
                await this.publish(batch);
            } catch (ex) {
                LogError(
                    `[CommsTracking] Dropped ${batch.length} open/click event(s); publishing failed: ${
                        ex instanceof Error ? ex.message : String(ex)
                    }`,
                );
            }
        }
        if (this.overflowCount > 0) {
            LogError(`[CommsTracking] Dropped ${this.overflowCount} open/click event(s); the buffer was full`);
            this.overflowCount = 0;
        }
    }
}
