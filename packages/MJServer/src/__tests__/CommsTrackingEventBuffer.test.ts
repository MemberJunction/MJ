/**
 * Unit tests for the in-memory buffer the open and click tracking routes publish through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShutdownRegistry } from '@memberjunction/global';
import {
    CommsTrackingEventBuffer,
    DEFAULT_TRACKING_FLUSH_INTERVAL_MS,
} from '../rest/CommsTrackingEventBuffer.js';

describe('CommsTrackingEventBuffer', () => {
    let batches: string[][];
    let publish: (items: string[]) => Promise<void>;

    beforeEach(() => {
        vi.useFakeTimers();
        ShutdownRegistry.Instance.ResetForTests();
        batches = [];
        publish = async (items) => {
            batches.push([...items]);
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        ShutdownRegistry.Instance.ResetForTests();
    });

    it('publishes nothing until the flush interval passes, then everything in one batch', async () => {
        const buffer = new CommsTrackingEventBuffer<string>(publish);
        buffer.Add('a');
        buffer.Add('b');
        buffer.Add('c');

        await vi.advanceTimersByTimeAsync(DEFAULT_TRACKING_FLUSH_INTERVAL_MS - 1);
        expect(batches).toEqual([]);
        expect(buffer.PendingCount).toBe(3);

        await vi.advanceTimersByTimeAsync(1);
        expect(batches).toEqual([['a', 'b', 'c']]);
        expect(buffer.PendingCount).toBe(0);
    });

    it('publishes at once when a batch fills, without waiting for the interval', async () => {
        const buffer = new CommsTrackingEventBuffer<string>(publish, { MaxBatchSize: 2 });
        buffer.Add('a');
        buffer.Add('b');
        await buffer.Flush();

        expect(batches).toEqual([['a', 'b']]);
    });

    it('splits what it holds into batches of at most MaxBatchSize', async () => {
        const gate = deferred();
        const slow = async (items: string[]) => {
            batches.push([...items]);
            await gate.promise;
        };
        const buffer = new CommsTrackingEventBuffer<string>(slow, { MaxBatchSize: 2 });
        for (const item of ['a', 'b', 'c', 'd', 'e']) buffer.Add(item);
        gate.resolve();
        await buffer.Flush();

        expect(batches).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    });

    it('publishes a hit that arrives while an earlier batch is still being published', async () => {
        const gate = deferred();
        let first = true;
        const buffer = new CommsTrackingEventBuffer<string>(async (items) => {
            batches.push([...items]);
            if (first) {
                first = false;
                await gate.promise;
            }
        });
        buffer.Add('a');
        const flushing = buffer.Flush();
        buffer.Add('late');
        gate.resolve();
        await flushing;
        await vi.advanceTimersByTimeAsync(DEFAULT_TRACKING_FLUSH_INTERVAL_MS);

        expect(batches.flat()).toEqual(['a', 'late']);
        expect(buffer.PendingCount).toBe(0);
    });

    it('drops a batch the publisher rejects, keeps going, and never rejects itself', async () => {
        let calls = 0;
        const buffer = new CommsTrackingEventBuffer<string>(async (items) => {
            calls++;
            if (calls === 1) throw new Error('queue unavailable');
            batches.push([...items]);
        }, { MaxBatchSize: 1 });
        buffer.Add('lost');
        buffer.Add('kept');

        await expect(buffer.Flush()).resolves.toBeUndefined();
        expect(batches).toEqual([['kept']]);
        expect(buffer.PendingCount).toBe(0);
    });

    it('drops new hits once MaxBufferedEvents are waiting, so an outage cannot grow it without limit', async () => {
        const gate = deferred();
        const buffer = new CommsTrackingEventBuffer<string>(async (items) => {
            await gate.promise;
            batches.push([...items]);
        }, { MaxBatchSize: 2, MaxBufferedEvents: 2 });
        buffer.Add('a');
        buffer.Add('b'); // fills a batch; its publish is now stuck behind the gate
        buffer.Add('c');
        buffer.Add('d'); // the buffer holds two again
        buffer.Add('overflow');

        expect(buffer.PendingCount).toBe(2);
        gate.resolve();
        await buffer.Flush();
        expect(batches.flat()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('registers for shutdown, and Shutdown publishes what is still held', async () => {
        const buffer = new CommsTrackingEventBuffer<string>(publish);
        buffer.Add('a');

        expect(ShutdownRegistry.Instance.List()).toContain(buffer);
        await ShutdownRegistry.Instance.ShutdownAll();
        expect(batches).toEqual([['a']]);
    });

    it('does not leave a timer running when it holds nothing', async () => {
        const buffer = new CommsTrackingEventBuffer<string>(publish);
        buffer.Add('a');
        await buffer.Flush();

        expect(vi.getTimerCount()).toBe(0);
    });
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}
