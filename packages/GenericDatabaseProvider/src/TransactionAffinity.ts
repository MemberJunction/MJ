import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * One logical caller's claim on one provider's ambient transaction. `Epoch` is null while the begin
 * that created it is still in flight, names the transaction once that begin succeeds, and is
 * {@link RELEASED_EPOCH} once a begin that never bound it failed.
 */
export interface TransactionMembership {
    readonly Owner: TransactionAffinity;
    Epoch: number | null;
}

/**
 * Epoch of a claim whose begin failed. Real epochs start at 1 and the open epoch is never 0, so a
 * released membership matches no transaction and `Claim()` never reuses it.
 */
const RELEASED_EPOCH = 0;

/**
 * Process-wide, keyed by owner inside the store: an async context can be inside transactions on
 * several providers at once (a per-request provider and the global one), and one AsyncLocalStorage
 * per provider instance would be one per GraphQL request.
 */
const memberships = new AsyncLocalStorage<readonly TransactionMembership[]>();

/**
 * Which async scope a provider's ambient transaction belongs to (#4786).
 *
 * A provider instance is shared — the global `Metadata.Provider` most of all — so "a transaction is
 * open on this instance" does not mean "this caller is part of it". Routing every query to the open
 * handle captured unrelated callers: their reads ran inside someone else's transaction, their writes
 * were rolled back with it, and reads queued behind its COMMIT failed. Membership is therefore carried
 * by the async context of the code that began the transaction — descendants inherit it, everything
 * else runs on the pool.
 *
 * The transaction is identified by an epoch that is replaced on every outermost begin and cleared when
 * the transaction ends, so a membership outlives its transaction harmlessly: it simply stops matching.
 *
 * Limits: `Claim()` must run in the synchronous prefix of the call the caller awaits — a begin reached
 * after an `await` inside a helper does not make the helper's caller a member. Conversely, a claim
 * in the synchronous prefix of work the caller does NOT await (a fire-and-forget call, a synchronous
 * event listener) lands in the caller's context too, making the launcher (the emitter) a member.
 * Work the provider launches itself runs under {@link RunDetached}, which contains it.
 */
export class TransactionAffinity {
    private _epoch: number | null = null;
    private _lastEpoch = 0;

    /** The open transaction's epoch, or null when none is open. */
    public get CurrentEpoch(): number | null {
        return this._epoch;
    }

    /** True when the current async context began, or descends from the scope that began, the open transaction. */
    public get IsCallerMember(): boolean {
        return this._epoch !== null && this.findMembership()?.Epoch === this._epoch;
    }

    /**
     * The calling scope's membership, creating one if it has none that is pending or current. MUST be
     * called synchronously before the begin's first `await`: `enterWith` in the synchronous prefix of an
     * awaited call is what makes the membership visible to the caller once its `await` resumes.
     */
    public Claim(): TransactionMembership {
        const existing = this.findMembership();
        if (existing && (existing.Epoch === null || existing.Epoch === this._epoch)) {
            return existing;
        }
        const fresh: TransactionMembership = { Owner: this, Epoch: null };
        memberships.enterWith([...this.otherOwnersMemberships(), fresh]);
        return fresh;
    }

    /** An outermost physical BEGIN succeeded: a new transaction that no existing membership belongs to. */
    public OpenEpoch(): void {
        this._epoch = ++this._lastEpoch;
    }

    /** The transaction ended — committed, rolled back or abandoned — so every membership in it is stale. */
    public CloseEpoch(): void {
        this._epoch = null;
    }

    /**
     * Make a claimed membership part of the open transaction (as its opener, or joining it). A begin
     * that claimed the same pending membership before another begin released it (two begins queued
     * from one scope) still binds it: that scope did ask for a transaction.
     */
    public Bind(membership: TransactionMembership): void {
        this.assertOwned(membership, 'Bind');
        if (this._epoch === null) {
            throw new Error('TransactionAffinity.Bind: there is no open transaction to bind the membership to');
        }
        membership.Epoch = this._epoch;
    }

    /**
     * A begin failed: kill the claim it made if nothing bound it. A pending membership is shared by
     * reference with everything the claiming scope forked since the claim (pollers, timers), so left
     * pending it would be reused by that scope's next begin and retroactively make all of that work
     * part of a transaction it never asked for. A membership already bound to the open transaction
     * is left alone: a member whose nested begin failed is still a member.
     */
    public Release(membership: TransactionMembership): void {
        this.assertOwned(membership, 'Release');
        if (membership.Epoch === null) {
            membership.Epoch = RELEASED_EPOCH;
        }
    }

    /**
     * Run `fn` as a member of the open transaction whatever scope called it. For the provider's own
     * transaction-control SQL (savepoints), which may legitimately be issued from another scope — a
     * pool that settles graphs after `Promise.all`, `ReleaseIndependentInstance` — and must still reach
     * the handle.
     */
    public RunAsMember<T>(fn: () => Promise<T>): Promise<T> {
        if (this._epoch === null) {
            return fn();
        }
        return memberships.run([...this.otherOwnersMemberships(), { Owner: this, Epoch: this._epoch }], fn);
    }

    /** Run `fn` with no membership on this owner — work that must not ride the caller's transaction. */
    public RunDetached<T>(fn: () => Promise<T>): Promise<T> {
        return memberships.run(this.otherOwnersMemberships(), fn);
    }

    private assertOwned(membership: TransactionMembership, operation: string): void {
        if (membership.Owner !== this) {
            throw new Error(`TransactionAffinity.${operation}: the membership was claimed on another TransactionAffinity`);
        }
    }

    private findMembership(): TransactionMembership | undefined {
        return memberships.getStore()?.find((m) => m.Owner === this);
    }

    private otherOwnersMemberships(): TransactionMembership[] {
        return (memberships.getStore() ?? []).filter((m) => m.Owner !== this);
    }
}
