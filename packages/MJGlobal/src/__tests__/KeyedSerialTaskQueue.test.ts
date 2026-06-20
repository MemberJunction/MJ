import { describe, it, expect } from 'vitest';
import { KeyedSerialTaskQueue } from '../KeyedSerialTaskQueue';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('KeyedSerialTaskQueue', () => {
    it('serializes tasks for the same key in enqueue order', async () => {
        const q = new KeyedSerialTaskQueue();
        const key = {};
        const order: number[] = [];
        q.enqueue(key, async () => { await delay(20); order.push(1); });
        q.enqueue(key, async () => { await delay(5); order.push(2); });
        q.enqueue(key, async () => { order.push(3); });
        await q.flush();
        expect(order).toEqual([1, 2, 3]);
    });

    it('runs tasks for different keys concurrently', async () => {
        const q = new KeyedSerialTaskQueue();
        const order: string[] = [];
        q.enqueue({}, async () => { await delay(30); order.push('slow'); });
        q.enqueue({}, async () => { order.push('fast'); });
        await q.flush();
        // Different keys → concurrent → the fast one finishes first despite enqueuing second.
        expect(order).toEqual(['fast', 'slow']);
    });

    it('is fire-and-forget — a thrown task resolves undefined, never rejects', async () => {
        const q = new KeyedSerialTaskQueue();
        await expect(q.enqueue({}, async () => { throw new Error('boom'); })).resolves.toBeUndefined();
    });

    it('resolves the task value on success and undefined on isOk-falsy', async () => {
        const q = new KeyedSerialTaskQueue();
        await expect(q.enqueue({}, async () => 'val', { isOk: () => true })).resolves.toBe('val');
        await expect(q.enqueue({}, async () => false, { isOk: (v) => v === true })).resolves.toBeUndefined();
    });

    it('flush reports failures (reject OR isOk-falsy) and rejections (threw) + routes to onError', async () => {
        const errors: unknown[] = [];
        const q = new KeyedSerialTaskQueue({ onError: (e) => errors.push(e) });
        q.enqueue({}, async () => 'ok');
        q.enqueue({}, async () => { throw new Error('boom'); });
        q.enqueue({}, async () => false, { isOk: (v) => v === true });
        const res = await q.flush();
        expect(res).toEqual({ failures: 2, rejections: 1 });
        expect(errors.length).toBe(2);
    });

    it('drains on re-flush — a second flush only counts tasks enqueued after the first', async () => {
        const q = new KeyedSerialTaskQueue();
        q.enqueue({}, async () => { throw new Error('a'); });
        expect(await q.flush()).toEqual({ failures: 1, rejections: 1 });
        q.enqueue({}, async () => 'ok');
        expect(await q.flush()).toEqual({ failures: 0, rejections: 0 });
    });

    it('flush with nothing pending resolves to zero counts', async () => {
        const q = new KeyedSerialTaskQueue();
        expect(await q.flush()).toEqual({ failures: 0, rejections: 0 });
    });

    it('a failed task does not break the chain for its key', async () => {
        const q = new KeyedSerialTaskQueue();
        const key = {};
        const order: number[] = [];
        q.enqueue(key, async () => { throw new Error('boom'); });
        q.enqueue(key, async () => { order.push(2); });
        await q.flush();
        expect(order).toEqual([2]);
    });
});
