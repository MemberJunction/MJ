import { describe, it, expect } from 'vitest';
import { ListenerSet, PublishListenerSet } from '../engine/PublishListenerSet';

describe('ListenerSet', () => {
    it('carries typed events, so the engine can fan out dead-letter notifications', () => {
        const set = new ListenerSet<{ DeliveryID: string; Reason: string }>('dead-letter');
        const seen: string[] = [];
        set.Add(event => seen.push(`${event.DeliveryID}:${event.Reason}`));
        set.Notify({ DeliveryID: 'd1', Reason: 'MaxAttemptsExceeded' });
        expect(seen).toEqual(['d1:MaxAttemptsExceeded']);
    });
});

describe('PublishListenerSet', () => {
    it('notifies every listener and supports unsubscribe', () => {
        const set = new PublishListenerSet();
        const seen: string[] = [];
        const off = set.Add(name => seen.push(`a:${name}`));
        set.Add(name => seen.push(`b:${name}`));
        set.Notify('email.events');
        off();
        set.Notify('import.ready');
        expect(seen).toEqual(['a:email.events', 'b:email.events', 'b:import.ready']);
        expect(set.Count).toBe(1);
    });

    it('isolates a throwing listener from the others', () => {
        const set = new PublishListenerSet();
        const seen: string[] = [];
        set.Add(() => { throw new Error('boom'); });
        set.Add(name => seen.push(name));
        expect(() => set.Notify('t')).not.toThrow();
        expect(seen).toEqual(['t']);
    });
});
