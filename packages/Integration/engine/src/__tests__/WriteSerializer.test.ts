/**
 * The provider holds ONE transaction on ONE connection, so a write issued while that transaction is
 * open joins it. Serializing every engine write behind a single provider-wide chain made that
 * impossible — at the cost of queueing unrelated entity maps behind each other even when no
 * transaction existed.
 *
 * The property that must never break: while an exclusive section (the one that opens the provider
 * transaction) is running, NOTHING else writes. Everything else here is throughput.
 */
import { describe, it, expect } from 'vitest';
import { WriteSerializer } from '../WriteSerializer.js';

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/** Records an interleaving so tests can assert on overlap rather than on timing. */
function tracker() {
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    return {
        order,
        get peak() { return peak; },
        run: (label: string, ms = 5) => async () => {
            active++; peak = Math.max(peak, active);
            order.push(`+${label}`);
            await tick(ms);
            order.push(`-${label}`);
            active--;
            return label;
        },
    };
}

describe('WriteSerializer', () => {
    it('runs different keys concurrently — the whole point', async () => {
        const s = new WriteSerializer();
        const t = tracker();
        await Promise.all([s.RunKeyed('mapA', t.run('a')), s.RunKeyed('mapB', t.run('b')), s.RunKeyed('mapC', t.run('c'))]);
        expect(t.peak).toBe(3);
    });

    it('keeps SAME-key work ordered, so one map never races its own writes', async () => {
        const s = new WriteSerializer();
        const t = tracker();
        await Promise.all([s.RunKeyed('mapA', t.run('1')), s.RunKeyed('mapA', t.run('2')), s.RunKeyed('mapA', t.run('3'))]);
        expect(t.peak).toBe(1);
        expect(t.order).toEqual(['+1', '-1', '+2', '-2', '+3', '-3']);
    });

    it('NOTHING overlaps an exclusive section — the transaction-safety invariant', async () => {
        const s = new WriteSerializer();
        const t = tracker();
        const all = [
            s.RunKeyed('mapA', t.run('a', 10)),
            s.RunExclusive(t.run('X', 10)),
            s.RunKeyed('mapB', t.run('b', 10)),
            s.RunKeyed('mapC', t.run('c', 10)),
        ];
        await Promise.all(all);
        const start = t.order.indexOf('+X');
        const end = t.order.indexOf('-X');
        expect(start).toBeGreaterThanOrEqual(0);
        // Nothing may start or finish between the exclusive section's own start and end.
        expect(t.order.slice(start + 1, end)).toEqual([]);
    });

    it('an exclusive section waits for keyed work already in flight', async () => {
        const s = new WriteSerializer();
        const t = tracker();
        const keyed = s.RunKeyed('mapA', t.run('a', 20));
        const exclusive = s.RunExclusive(t.run('X', 1));
        await Promise.all([keyed, exclusive]);
        expect(t.order).toEqual(['+a', '-a', '+X', '-X']);
    });

    it('a rejection never deadlocks later writers', async () => {
        const s = new WriteSerializer();
        await expect(s.RunKeyed('mapA', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        await expect(s.RunExclusive(async () => { throw new Error('bang'); })).rejects.toThrow('bang');
        // Both chains must still be usable.
        await expect(s.RunKeyed('mapA', async () => 'ok')).resolves.toBe('ok');
        await expect(s.RunExclusive(async () => 'fine')).resolves.toBe('fine');
    });

    it('two exclusive sections never overlap each other', async () => {
        const s = new WriteSerializer();
        const t = tracker();
        await Promise.all([s.RunExclusive(t.run('X', 10)), s.RunExclusive(t.run('Y', 10))]);
        expect(t.peak).toBe(1);
    });

    it('does not leak a key per entity map across a long run', async () => {
        const s = new WriteSerializer();
        for (let i = 0; i < 50; i++) await s.RunKeyed(`map${i}`, async () => i);
        await tick(0); // cleanup runs a microtask after the caller's promise settles
        expect(s.TrackedKeyCount).toBe(0);
    });

    it('returns the callback value and propagates rejection', async () => {
        const s = new WriteSerializer();
        await expect(s.RunKeyed('k', async () => 42)).resolves.toBe(42);
        await expect(s.RunExclusive(async () => 7)).resolves.toBe(7);
    });
});
