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

    it('refuses a class instance EVEN IF it defines toJSON — the review case', () => {
        // This assertion used to be the opposite, and the test was the bug's accomplice: it asserted
        // `toJSON` deference using the one shape where deference is harmless (a value object
        // returning a scalar), which locked the hole in as "tested". The `{...this}` idiom is the
        // common one, and it unwrapped the exact class the module names as its motivating example.
        class SkipCtx {
            public readonly apiKey = 'sk-SECRET';
            public readonly endpoint = 'https://internal';
            toJSON() { return { ...this }; }
        }
        const { Value, DroppedPaths } = SanitizeForPersistence({ context: new SkipCtx(), tier: 'gold' }, 'data');

        expect(JSON.stringify(Value)).not.toContain('sk-SECRET');
        expect(Value).toEqual({ tier: 'gold' });          // the plain sibling still survives
        expect(DroppedPaths).toContain('data.context');   // and the refusal is REPORTED, not silent
    });

    it('still converts Date, the one deference that survives', () => {
        // Handled above the prototype check on purpose: it is the legitimate `toJSON` that actually
        // shows up, and dropping every timestamp would make the module useless for ordinary data.
        expect(SanitizeForPersistence({ when: new Date('2026-08-13T12:00:00Z') }).Value)
            .toEqual({ when: '2026-08-13T12:00:00.000Z' });
    });

    it('a value object with toJSON is dropped LOUDLY rather than silently unwrapped', () => {
        // The cost of the decision, stated: a legitimate Money no longer persists as 12.5. The path
        // is reported so a caller who wants it converts it to plain data and can see where.
        class Money { constructor(private readonly cents: number) {} toJSON() { return this.cents / 100; } }
        const { Value, DroppedPaths } = SanitizeForPersistence({ price: new Money(1250) }, 'data');

        expect(Value).toEqual({});
        expect(DroppedPaths).toEqual(['data.price']);
    });

    it('never throws when toJSON or a getter does — the crash it exists to prevent', () => {
        // A sanitizer that throws is the bug, not the fix, and this one is reachable from all three
        // write paths. A getter over a closed connection is exactly the shape being guarded against.
        expect(() => SanitizeForPersistence({ ctx: { toJSON() { throw new Error('live handle'); } } })).not.toThrow();
        expect(() => SanitizeForPersistence({ ctx: { get creds(): string { throw new Error('closed'); } } })).not.toThrow();
    });

    it('a throwing getter loses its own property, not the object around it', () => {
        // `Object.entries` READS every value, so one throwing getter took the whole object down and
        // reported the parent's path — losing a sibling that serialized perfectly well. Keys are
        // inert; each value is read inside its own guard.
        const { Value, DroppedPaths } = SanitizeForPersistence(
            { ctx: { get creds(): string { throw new Error('closed'); }, ok: 1 } }, 'data',
        );

        expect(Value).toEqual({ ctx: { ok: 1 } });
        expect(DroppedPaths).toEqual(['data.ctx.creds']);
    });

    it('bounds what actually lands in the row, not just how nested it is', () => {
        // The node cap counts CONTAINERS, so a single huge string sailed through — 9.54 MB in a row
        // that claimed it could not become a memory dump. Dropped whole rather than truncated: half
        // a value is one nobody can trust.
        const { Value, DroppedPaths } = SanitizeForPersistence({ blob: 'x'.repeat(10_000_000), keep: 'yes' }, 'data');

        expect(Value).toEqual({ keep: 'yes' });
        expect(DroppedPaths).toEqual(['data.blob']);
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
