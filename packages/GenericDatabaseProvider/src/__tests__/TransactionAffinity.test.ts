import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { TransactionAffinity } from '../TransactionAffinity';

const tick = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 1));

/** Mirrors GenericDatabaseProvider.BeginTransaction: claim synchronously, bind after an await. */
async function begin(affinity: TransactionAffinity, outermost: boolean): Promise<void> {
    const membership = affinity.Claim();
    await tick();
    if (outermost) {
        affinity.OpenEpoch();
    }
    affinity.Bind(membership);
}

describe('TransactionAffinity (#4786)', () => {
    it('the caller that began is a member after awaiting the begin', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        expect(a.IsCallerMember).toBe(true);
    });

    it('an unrelated caller whose context predates the begin is not a member', async () => {
        const a = new TransactionAffinity();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const unrelated = (async () => { await gate; return a.IsCallerMember; })();
        await begin(a, true);
        release();
        expect(await unrelated).toBe(false);
        expect(a.IsCallerMember).toBe(true);
    });

    it('work spawned inside the member scope is a member (nested save joins)', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        const child = (async () => { await tick(); return a.IsCallerMember; })();
        expect(await child).toBe(true);
    });

    it('closing the epoch makes every membership stale, including descendants still running', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const lateDescendant = (async () => { await gate; return a.IsCallerMember; })();
        a.CloseEpoch();
        release();
        expect(await lateDescendant).toBe(false);
        expect(a.IsCallerMember).toBe(false);
    });

    it('a stale membership never counts for a later transaction begun elsewhere', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const staleDescendant = (async () => { await gate; return a.IsCallerMember; })();
        a.CloseEpoch();
        // Simpler variant per ruling: a new transaction exists (bound to nobody) rather than a
        // full nested begin() — the invariant under test is only that staleDescendant resolves
        // false once a new epoch has been opened by someone else.
        a.OpenEpoch();
        release();
        expect(await staleDescendant).toBe(false);
    });

    it('a nested begin in the member scope reuses the same membership', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        const first = a.Claim();
        const second = a.Claim();
        expect(second).toBe(first);
        expect(first.Epoch).toBe(a.CurrentEpoch);
    });

    it('claiming from a stale scope creates a fresh, unbound membership', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        const old = a.Claim();
        a.CloseEpoch();
        const fresh = a.Claim();
        expect(fresh).not.toBe(old);
        expect(fresh.Epoch).toBeNull();
    });

    it('RunAsMember makes any caller a member of the open transaction, and only for fn', async () => {
        const a = new TransactionAffinity();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        const unrelated = (async () => {
            await gate;
            const inside = await a.RunAsMember(async () => a.IsCallerMember);
            return { inside, after: a.IsCallerMember };
        })();
        await begin(a, true);
        release();
        expect(await unrelated).toEqual({ inside: true, after: false });
    });

    it('RunDetached drops membership for fn only', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        expect(await a.RunDetached(async () => a.IsCallerMember)).toBe(false);
        expect(a.IsCallerMember).toBe(true);
    });

    it('membership is per owner: being a member on one provider says nothing about another', async () => {
        const a = new TransactionAffinity();
        const b = new TransactionAffinity();
        await begin(a, true);
        b.OpenEpoch();
        expect(a.IsCallerMember).toBe(true);
        expect(b.IsCallerMember).toBe(false);
    });

    it('Bind with no open epoch throws — a bind can only follow a successful physical begin', () => {
        const a = new TransactionAffinity();
        expect(() => a.Bind(a.Claim())).toThrow(/no open transaction/i);
    });

    it('Bind rejects a membership claimed on another owner — it would be bound to the wrong epoch sequence', () => {
        const a = new TransactionAffinity();
        const b = new TransactionAffinity();
        const claimedOnB = b.Claim();
        a.OpenEpoch();
        expect(() => a.Bind(claimedOnB)).toThrow(/another TransactionAffinity/i);
        expect(claimedOnB.Epoch).toBeNull();
    });

    it('LIMIT: a begin reached after an await inside a helper does not make the helper\'s caller a member', async () => {
        const a = new TransactionAffinity();
        async function openAfterAwait(): Promise<void> { await tick(); await begin(a, true); }
        await openAfterAwait();
        expect(a.IsCallerMember).toBe(false);
    });

    it('LIMIT: an un-awaited call that claims synchronously makes the LAUNCHER a member', async () => {
        // Async context flows down into a call and back up out of its synchronous prefix, so the
        // claim lands in the launcher's context even though the launcher never awaits the begin.
        const a = new TransactionAffinity();
        void begin(a, true);
        await tick();
        await tick();
        expect(a.CurrentEpoch).not.toBeNull();
        expect(a.IsCallerMember).toBe(true);
    });

    it('LIMIT: an event listener that claims synchronously makes the EMITTER a member', async () => {
        const a = new TransactionAffinity();
        const emitter = new EventEmitter();
        emitter.on('saved', () => { void begin(a, true); });
        emitter.emit('saved');
        await tick();
        await tick();
        expect(a.IsCallerMember).toBe(true);
    });

    it('a claim inside a callback the launcher only scheduled, or inside RunDetached, stays in that scope', async () => {
        const scheduled = new TransactionAffinity();
        setImmediate(() => { void begin(scheduled, true); });
        const detached = new TransactionAffinity();
        void detached.RunDetached(() => begin(detached, true));
        await tick();
        await tick();
        expect(scheduled.CurrentEpoch).not.toBeNull();
        expect(scheduled.IsCallerMember).toBe(false);
        expect(detached.CurrentEpoch).not.toBeNull();
        expect(detached.IsCallerMember).toBe(false);
    });

    it('Release makes a pending claim dead: the scope\'s next Claim is fresh and the dead one never matches', async () => {
        const a = new TransactionAffinity();
        const failed = a.Claim();
        a.Release(failed);
        const fresh = a.Claim();
        expect(fresh).not.toBe(failed);
        a.OpenEpoch();
        a.Bind(fresh);
        expect(a.IsCallerMember).toBe(true);
        expect(failed.Epoch).not.toBe(a.CurrentEpoch);
    });

    it('Release leaves a membership already bound to the open transaction alone', async () => {
        const a = new TransactionAffinity();
        await begin(a, true);
        const bound = a.Claim();
        a.Release(bound);
        expect(a.IsCallerMember).toBe(true);
        expect(a.Claim()).toBe(bound);
    });

    it('Release rejects a membership claimed on another owner', () => {
        const a = new TransactionAffinity();
        const b = new TransactionAffinity();
        expect(() => a.Release(b.Claim())).toThrow(/another TransactionAffinity/i);
    });
});
