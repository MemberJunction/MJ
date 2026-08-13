/**
 * The shared "safe to write down" rules.
 *
 * Three writes take an object the CALLER built and stringify it into a row — an agent run's `Data`
 * and `StartingPayload`, and a task graph's invocation envelope — and all three take it from
 * `ExecuteAgentParams`, documented as possibly a class instance holding connections and
 * credentials. One of the three was guarded; these pin the rules for all of them.
 */
import { describe, it, expect } from 'vitest';
import { SanitizeForPersistence, StringifyForPersistence } from '../safe-persist';

/** A class instance that contains itself — the production shape, whose error names its constructor. */
class SocketLike {
    public writable = true;
    public _readableState: { pipes: unknown[]; socket?: SocketLike } = { pipes: [] };
    constructor() {
        this._readableState.pipes.push(this);
        this._readableState.socket = this;
    }
}

describe('SanitizeForPersistence', () => {
    it('makes a value stringifiable that JSON.stringify dies on', () => {
        const value = { db: new SocketLike(), tier: 'gold' };
        expect(() => JSON.stringify(value)).toThrow(/circular/i);

        expect(() => JSON.stringify(SanitizeForPersistence(value).Value)).not.toThrow();
    });

    it('keeps the plain data a reader actually wants', () => {
        const { Value } = SanitizeForPersistence({
            approved: true, count: 3, tags: ['a', 'b'], nested: { deep: 'yes' }, when: new Date('2026-08-13T12:00:00Z'),
        });
        expect(Value).toEqual({
            approved: true, count: 3, tags: ['a', 'b'], nested: { deep: 'yes' }, when: '2026-08-13T12:00:00.000Z',
        });
    });

    it('refuses a class instance instead of unwrapping its internals', () => {
        // Walking its own properties would "work" and would persist whatever it holds. That is the
        // leak this exists to prevent, and it is silent — unlike the crash.
        class AgentContext {
            public readonly apiKey = 'super-secret';
            public readonly tier = 'gold';
        }
        const { Value, DroppedPaths } = SanitizeForPersistence({ session: new AgentContext() }, 'context');
        expect(JSON.stringify(Value)).not.toContain('super-secret');
        expect(DroppedPaths).toContain('context.session');
    });

    it('reports every drop by path', () => {
        const { DroppedPaths } = SanitizeForPersistence({ db: new SocketLike(), fn: () => 1 }, 'data');
        expect(DroppedPaths).toEqual(expect.arrayContaining(['data.db', 'data.fn']));
    });

    it('honours toJSON, because that is the object saying what it is worth', () => {
        class Money { constructor(private readonly cents: number) {} toJSON() { return this.cents / 100; } }
        expect(SanitizeForPersistence({ price: new Money(1250) }).Value).toEqual({ price: 12.5 });
    });

    it('treats a value referenced twice by siblings as data, not a cycle', () => {
        const shared = { region: 'us-east' };
        const { Value, DroppedPaths } = SanitizeForPersistence({ primary: shared, backup: shared });
        expect(Value).toEqual({ primary: { region: 'us-east' }, backup: { region: 'us-east' } });
        expect(DroppedPaths).toEqual([]);
    });

    it('keeps array positions when an entry is dropped', () => {
        // Shifting later indices would be a wrong answer that looks like a right one.
        const { Value } = SanitizeForPersistence({ items: ['a', new SocketLike(), 'c'] });
        expect((Value as { items: unknown[] }).items).toEqual(['a', null, 'c']);
    });

    it('drops NaN rather than letting it serialize to null', () => {
        const { Value, DroppedPaths } = SanitizeForPersistence({ score: Number.NaN }, 'data');
        expect((Value as Record<string, unknown>).score).toBeUndefined();
        expect(DroppedPaths).toContain('data.score');
    });
});

describe('StringifyForPersistence', () => {
    it('returns null when nothing survived, so a column stays NULL', () => {
        // "{}" would claim the writer had an empty object rather than nothing to write.
        expect(StringifyForPersistence(new SocketLike(), 'payload').JSON).toBeNull();
    });

    it('returns ordinary JSON when everything survived', () => {
        expect(StringifyForPersistence({ ok: true }).JSON).toBe('{"ok":true}');
    });
});
