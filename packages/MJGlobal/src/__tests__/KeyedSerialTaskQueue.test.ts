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

    it('passes the label to onError', async () => {
        const seen: Array<string | undefined> = [];
        const q = new KeyedSerialTaskQueue({ onError: (_e, label) => seen.push(label) });
        q.enqueue({}, async () => { throw new Error('boom'); }, { label: 'my-task' });
        await q.flush();
        expect(seen).toEqual(['my-task']);
    });

    it('flush awaits tasks enqueued before it began, not ones enqueued after', async () => {
        const q = new KeyedSerialTaskQueue();
        const done: string[] = [];
        q.enqueue({}, async () => { done.push('first'); });        // fast — in the flush snapshot
        const flushed = q.flush();                                  // snapshots only 'first'
        q.enqueue({}, async () => { await delay(30); done.push('second'); }); // slow, after flush began
        await flushed;
        expect(done).toEqual(['first']);        // flush awaited only 'first'; 'second' is still running
        await q.flush();                         // next window awaits 'second'
        expect(done).toEqual(['first', 'second']);
    });

    it('is self-bounding — many settled tasks do not accumulate (flush still awaits in-flight)', async () => {
        const q = new KeyedSerialTaskQueue();
        for (let i = 0; i < 50; i++) {
            q.enqueue({}, async () => { /* resolves immediately */ });
        }
        // All settle; a flush after they've drained reports zero and resolves promptly.
        await delay(5);
        expect(await q.flush()).toEqual({ failures: 0, rejections: 0 });
    });

    // ── opts.after (cross-key dependency gate) ──────────────────────────────

    it('opts.after gates child task until the dependency key settles', async () => {
        const q = new KeyedSerialTaskQueue();
        const parent = {};
        const child = {};
        const order: string[] = [];

        // Parent task takes 30ms.
        q.enqueue(parent, async () => { await delay(30); order.push('parent'); });
        // Child task is instant but depends on parent — must not start until parent settles.
        q.enqueue(child, async () => { order.push('child'); }, { after: parent });

        await q.flush();
        expect(order).toEqual(['parent', 'child']);
    });

    it('opts.after resolves immediately when dependency key has no pending tasks', async () => {
        const q = new KeyedSerialTaskQueue();
        const parent = {};
        const child = {};
        const order: string[] = [];

        // No tasks enqueued on parent — dependency gate is a resolved promise.
        q.enqueue(child, async () => { order.push('child'); }, { after: parent });
        await q.flush();
        expect(order).toEqual(['child']);
    });

    it('opts.after does not block unrelated keys', async () => {
        const q = new KeyedSerialTaskQueue();
        const parent = {};
        const child = {};
        const unrelated = {};
        const order: string[] = [];

        // Parent is slow.
        q.enqueue(parent, async () => { await delay(40); order.push('parent'); });
        // Child waits for parent.
        q.enqueue(child, async () => { order.push('child'); }, { after: parent });
        // Unrelated key has no dependency — runs concurrently with parent.
        q.enqueue(unrelated, async () => { order.push('unrelated'); });

        await q.flush();
        // Unrelated finishes first (instant, no gate), then parent (40ms), then child (after parent).
        expect(order).toEqual(['unrelated', 'parent', 'child']);
    });

    it('opts.after still serializes with same-key prior tasks', async () => {
        const q = new KeyedSerialTaskQueue();
        const parent = {};
        const child = {};
        const order: string[] = [];

        // Parent is slow.
        q.enqueue(parent, async () => { await delay(20); order.push('parent'); });
        // First child task on child key (no dependency).
        q.enqueue(child, async () => { order.push('child-1'); });
        // Second child task on child key depends on parent — waits for BOTH child-1 AND parent.
        q.enqueue(child, async () => { order.push('child-2'); }, { after: parent });

        await q.flush();
        // child-1 runs immediately (no gate), parent takes 20ms, child-2 waits for both.
        expect(order).toEqual(['child-1', 'parent', 'child-2']);
    });

    it('opts.after still works when the dependency task fails', async () => {
        const q = new KeyedSerialTaskQueue();
        const parent = {};
        const child = {};
        const order: string[] = [];

        // Parent throws — chain must not break.
        q.enqueue(parent, async () => { await delay(15); throw new Error('boom'); });
        // Child depends on parent — should still run after parent settles (even on failure).
        q.enqueue(child, async () => { order.push('child'); }, { after: parent });

        await q.flush();
        expect(order).toEqual(['child']);
    });
});
