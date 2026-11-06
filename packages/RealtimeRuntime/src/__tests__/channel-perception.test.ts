import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JSONObject } from '@memberjunction/ai';
import { ChannelPerceptionCoalescer, DEFAULT_CHANNEL_PERCEPTION_OPTIONS } from '../channels/channel-perception';

function makeHost(initial: JSONObject) {
    const state = { current: initial };
    const notes: string[] = [];
    const errors: unknown[] = [];
    return {
        state,
        notes,
        errors,
        host: {
            ChannelKey: 'Board',
            InstanceId: '1',
            GetState: () => state.current,
            SendNote: (text: string) => notes.push(text),
            OnError: (error: unknown) => errors.push(error),
        },
    };
}

describe('ChannelPerceptionCoalescer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('coalesces a burst into ONE note after the debounce window', () => {
        const h = makeHost({ items: [] });
        const c = new ChannelPerceptionCoalescer(h.host);
        c.Record(1);
        c.Record(2);
        c.Record(3);
        expect(h.notes).toHaveLength(0);
        vi.advanceTimersByTime(DEFAULT_CHANNEL_PERCEPTION_OPTIONS.DebounceMs);
        expect(h.notes).toHaveLength(1);
        expect(h.notes[0]).toContain('"changes":3');
        expect(h.notes[0]).toContain('"changeId":3');
    });

    it('sends a full snapshot first, then deltas against what the model was last told', () => {
        const h = makeHost({ items: [1] });
        const c = new ChannelPerceptionCoalescer(h.host);
        c.Record(1);
        vi.advanceTimersByTime(1000);
        expect(h.notes[0]).toContain('"snapshot":{"items":[1]}');

        h.state.current = { items: [1], title: 'x' };
        c.Record(2);
        vi.advanceTimersByTime(1000);
        expect(h.notes[1]).toContain('"delta":{"changed":{"title":"x"},"removed":[]}');
        expect(h.notes[1]).not.toContain('snapshot');
    });

    it('sends nothing when a burst nets out to no change', () => {
        const h = makeHost({ a: 1 });
        const c = new ChannelPerceptionCoalescer(h.host);
        c.SetBaseline({ a: 1 });
        c.Record(1);
        vi.advanceTimersByTime(1000);
        expect(h.notes).toHaveLength(0);
    });

    it('does not starve under a continuous stream: the timer is not re-armed by later changes', () => {
        const h = makeHost({ a: 0 });
        const c = new ChannelPerceptionCoalescer(h.host, { DebounceMs: 100, MaxNoteChars: 4000 });
        c.SetBaseline({ a: 0 });
        for (let i = 1; i <= 5; i++) {
            h.state.current = { a: i };
            c.Record(i);
            vi.advanceTimersByTime(30);
        }
        // 150ms elapsed with changes arriving every 30ms: the first note must already have gone out at 100ms.
        expect(h.notes.length).toBeGreaterThanOrEqual(1);
    });

    it('degrades to changed paths when the full delta is too large', () => {
        const h = makeHost({ big: 'a' });
        const c = new ChannelPerceptionCoalescer(h.host, { DebounceMs: 10, MaxNoteChars: 80 });
        c.SetBaseline({ big: 'a' });
        h.state.current = { big: 'x'.repeat(500) };
        c.Record(1);
        vi.advanceTimersByTime(20);
        expect(h.notes[0]).toContain('"truncated":true');
        expect(h.notes[0]).toContain('"changedPaths":["big"]');
        expect(h.notes[0].length).toBeLessThan(200);
    });

    it('Flush sends the pending note immediately and is safe to call with nothing pending', () => {
        const h = makeHost({ a: 1 });
        const c = new ChannelPerceptionCoalescer(h.host);
        c.Flush();
        expect(h.notes).toHaveLength(0);
        c.Record(1);
        c.Flush();
        expect(h.notes).toHaveLength(1);
        vi.advanceTimersByTime(5000);
        expect(h.notes).toHaveLength(1); // the cancelled timer does not send a second one
    });

    it('Dispose cancels a pending note', () => {
        const h = makeHost({ a: 1 });
        const c = new ChannelPerceptionCoalescer(h.host);
        c.Record(1);
        c.Dispose();
        vi.advanceTimersByTime(5000);
        expect(h.notes).toHaveLength(0);
    });

    it('reports a state-read failure through OnError and never throws into the timer', () => {
        const h = makeHost({ a: 1 });
        h.host.GetState = () => {
            throw new Error('boom');
        };
        const c = new ChannelPerceptionCoalescer(h.host);
        c.Record(1);
        expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
        expect(h.errors).toHaveLength(1);
    });
});
