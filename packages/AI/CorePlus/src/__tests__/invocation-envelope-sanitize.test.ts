/**
 * The invocation envelope has to survive being written down.
 *
 * R3-3 carried `ExecuteAgentParams.context` into the parent task's `InputPayload` verbatim. That
 * parameter is documented as possibly a CLASS INSTANCE holding "external service credentials or
 * connection information", so the first real agent run with a socket in its context died at submit
 * time with `Converting circular structure to JSON --> starting at object with constructor 'Socket'`
 * — before any step executed. The unit tests missed it because a test passes `{ approved: true }`,
 * and the live path passes a live object graph.
 */
import { describe, it, expect } from 'vitest';
import { SanitizeInvocationEnvelope } from '../task-graph/task-graph-submitter';

/**
 * The shape that actually killed the run.
 *
 * A CLASS instance, not an object literal — the production error names it exactly
 * ("starting at object with constructor 'Socket'"), and the distinction decides the outcome: a
 * class instance is refused whole, while a plain object keeps its serializable parts and loses only
 * the cycle. Both are covered below; getting the fixture wrong hid that.
 */
class SocketLike {
    public writable = true;
    public _readableState: { pipes: unknown[]; socket?: SocketLike } = { pipes: [] };
    constructor() {
        this._readableState.pipes.push(this);
        this._readableState.socket = this;
    }
}

function socketLikeContext(): Record<string, unknown> {
    return { db: new SocketLike(), tier: 'gold' };
}

describe('SanitizeInvocationEnvelope — what may be written down (R3-3 follow-up)', () => {
    it('survives the circular graph that JSON.stringify dies on', () => {
        const raw = { Data: { approved: true }, Context: socketLikeContext() };
        expect(() => JSON.stringify(raw)).toThrow(/circular/i);       // the production failure

        const sanitized = SanitizeInvocationEnvelope(raw);
        expect(() => JSON.stringify(sanitized.Envelope)).not.toThrow();
    });

    it('keeps the plain values conditions actually reference', () => {
        const sanitized = SanitizeInvocationEnvelope({
            Data: { approved: true, count: 3, tags: ['a', 'b'], nested: { deep: 'yes' } },
            Context: socketLikeContext(),
        });
        expect(sanitized.Envelope?.Data).toEqual({
            approved: true, count: 3, tags: ['a', 'b'], nested: { deep: 'yes' },
        });
        // `tier` is exactly the kind of thing a `context.tier === 'gold'` condition reads.
        expect((sanitized.Envelope?.Context as Record<string, unknown>).tier).toBe('gold');
    });

    it('drops the connection and SAYS which path it dropped', () => {
        const sanitized = SanitizeInvocationEnvelope({ Context: socketLikeContext() });
        expect((sanitized.Envelope?.Context as Record<string, unknown>).db).toBeUndefined();
        // Silence here is the defect this whole round is about: a dropped value reads to a condition
        // as absent data, which is a confident false, which is a branch nobody can explain later.
        expect(sanitized.DroppedPaths).toContain('context.db');
    });

    it('refuses a class instance rather than unwrapping its internals', () => {
        // The named real case is Skip's SkipAgentContext. Walking its own properties would "work"
        // and would persist whatever it holds — which is the leak, not the fix.
        class AgentContext {
            public readonly apiKey = 'super-secret';
            public readonly tier = 'gold';
        }
        const sanitized = SanitizeInvocationEnvelope({ Context: { session: new AgentContext() } });
        expect(JSON.stringify(sanitized.Envelope)).not.toContain('super-secret');
        expect(sanitized.DroppedPaths).toContain('context.session');
    });

    it('honours toJSON, because that is the object saying what it is worth persisting', () => {
        class Money { constructor(private readonly cents: number) {} toJSON() { return this.cents / 100; } }
        const sanitized = SanitizeInvocationEnvelope({ Data: { price: new Money(1250) } });
        expect((sanitized.Envelope?.Data as Record<string, unknown>).price).toBe(12.5);
    });

    it('an envelope with nothing persistable left is NO envelope, not an empty one', () => {
        // `{}` would tell the dispatcher the roots exist and are empty — so `data.x` reads as
        // absent data and takes a branch. Absent is the honest answer when nothing was carried.
        const sanitized = SanitizeInvocationEnvelope({ Context: new (class { hold() {} })() });
        expect(sanitized.Envelope).toBeUndefined();
    });

    it('a value referenced twice by siblings is not a cycle', () => {
        const shared = { region: 'us-east' };
        const sanitized = SanitizeInvocationEnvelope({ Data: { primary: shared, backup: shared } });
        expect(sanitized.Envelope?.Data).toEqual({ primary: { region: 'us-east' }, backup: { region: 'us-east' } });
        expect(sanitized.DroppedPaths).toEqual([]);
    });

    it('a PLAIN object with a cycle keeps its serializable siblings and loses only the cycle', () => {
        // Not every circular value is a class. Refusing the whole object here would throw away
        // `region`, which a condition may legitimately read.
        const node: Record<string, unknown> = { region: 'us-east' };
        node.self = node;
        const sanitized = SanitizeInvocationEnvelope({ Context: { routing: node } });
        expect(sanitized.Envelope?.Context).toEqual({ routing: { region: 'us-east' } });
        expect(sanitized.DroppedPaths).toContain('context.routing.self');
    });

    it('drops NaN rather than letting it serialize to null', () => {
        // JSON.stringify turns NaN into null, which a condition reads as a present, empty value.
        const sanitized = SanitizeInvocationEnvelope({ Data: { score: Number.NaN } });
        expect((sanitized.Envelope?.Data as Record<string, unknown>).score).toBeUndefined();
        expect(sanitized.DroppedPaths).toContain('data.score');
    });
});
