/**
 * Tests for the unified provider transaction scope (`BeginEntityTransaction`).
 *
 * WHAT THIS PROTECTS
 *
 * Before 6.2, MemberJunction had two transaction mechanisms that were blind to each other:
 * `DatabaseProviderBase.BeginTransaction()` (depth-counted, savepoint-aware, re-entrant) and
 * `BeginISATransaction()` (four lines that opened a brand-new physical transaction on the pool with
 * no depth awareness). An entity that hit both wrote into two independent transactions on the same
 * pool; rolling one back left the other committed, with no error raised.
 *
 * The fix routes every participant through one provider-arbitrated primitive. These tests pin the
 * contract that makes that safe:
 *   - the scope delegates to the provider's depth-counted begin/commit/rollback
 *   - it is settle-once, so `try { work; Commit() } catch { Rollback() }` cannot double-settle
 *   - it reports nesting accurately (captured BEFORE begin, or it would always read "nested")
 *   - `RunInEntityTransaction` degrades to plain execution on providers that cannot transact,
 *     rather than throwing or silently claiming atomicity
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import { RunInEntityTransaction } from '../generic/entityTransactionScope';
import * as Logging from '../generic/logging';

/**
 * A minimal DatabaseProviderBase that records transaction calls and emulates the real depth
 * counting, so nesting behaviour is exercised rather than assumed.
 */
class RecordingProvider {
    public Calls: string[] = [];
    private depth = 0;

    public get SupportsEntityTransactions(): boolean {
        return true;
    }

    public get IsInTransaction(): boolean {
        // SQL Server leaves this false so RunMaybeSerial can fan out.
        return false;
    }

    public get CurrentTransactionDepth(): number {
        return this.depth;
    }

    public async BeginTransaction(): Promise<void> {
        this.depth++;
        this.Calls.push(`begin:${this.depth}`);
    }

    public async CommitTransaction(): Promise<void> {
        this.Calls.push(`commit:${this.depth}`);
        this.depth--;
    }

    public async RollbackTransaction(): Promise<void> {
        this.Calls.push(`rollback:${this.depth}`);
        this.depth--;
    }

    /** Borrow the real implementation under test rather than re-implementing it. */
    public BeginEntityTransaction = DatabaseProviderBase.prototype.BeginEntityTransaction;
}

describe('DatabaseProviderBase.BeginEntityTransaction', () => {
    let provider: RecordingProvider;

    beforeEach(() => {
        provider = new RecordingProvider();
    });

    it('delegates begin and commit to the provider transaction methods', async () => {
        const scope = await provider.BeginEntityTransaction();
        await scope.Commit();

        expect(provider.Calls).toEqual(['begin:1', 'commit:1']);
    });

    it('delegates rollback to the provider', async () => {
        const scope = await provider.BeginEntityTransaction();
        await scope.Rollback();

        expect(provider.Calls).toEqual(['begin:1', 'rollback:1']);
    });

    it('reports IsNested=false for the outermost scope and true for an inner one', async () => {
        const outer = await provider.BeginEntityTransaction();
        const inner = await provider.BeginEntityTransaction();

        expect(outer.IsNested).toBe(false);
        expect(inner.IsNested).toBe(true);

        await inner.Commit();
        await outer.Commit();
    });

    it('JOINS an in-flight transaction instead of opening a second physical one', async () => {
        // This is the regression the whole abstraction exists for: two participants that know
        // nothing about each other must end up in ONE transaction, not two.
        const first = await provider.BeginEntityTransaction();
        const second = await provider.BeginEntityTransaction();
        await second.Commit();
        await first.Commit();

        // Depth reached 2 (a savepoint in the real provider), never two separate depth-1 begins.
        expect(provider.Calls).toEqual(['begin:1', 'begin:2', 'commit:2', 'commit:1']);
    });

    it('is settle-once: a second Commit or Rollback is a no-op', async () => {
        const scope = await provider.BeginEntityTransaction();
        await scope.Commit();
        await scope.Commit();
        await scope.Rollback();

        // Exactly one settle reached the provider.
        expect(provider.Calls).toEqual(['begin:1', 'commit:1']);
    });

    it('is settle-once across mixed outcomes: rollback after commit does not double-settle', async () => {
        // The shape that makes `try { work; Commit() } catch { Rollback() }` safe when the work
        // itself already rolled back on the way out.
        const scope = await provider.BeginEntityTransaction();
        await scope.Rollback();
        await scope.Commit();

        expect(provider.Calls).toEqual(['begin:1', 'rollback:1']);
    });

    it('IsNested follows CurrentTransactionDepth even when IsInTransaction is false', async () => {
        const outer = await provider.BeginEntityTransaction();
        const inner = await provider.BeginEntityTransaction();
        expect(outer.IsNested).toBe(false);
        expect(inner.IsNested).toBe(true);
        expect(provider.CurrentTransactionDepth).toBe(2);
        await inner.Commit();
        await outer.Commit();
    });

    it('logs when a scope settles at a different depth than it began', async () => {
        const spy = vi.spyOn(Logging, 'LogError');
        const first = await provider.BeginEntityTransaction();
        const second = await provider.BeginEntityTransaction();
        await first.Commit();
        await second.Commit();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});

describe('RunInEntityTransaction', () => {
    it('commits when the work succeeds and returns its value', async () => {
        const provider = new RecordingProvider();

        const result = await RunInEntityTransaction(provider, async () => 'done');

        expect(result).toBe('done');
        expect(provider.Calls).toEqual(['begin:1', 'commit:1']);
    });

    it('rolls back and re-throws when the work throws', async () => {
        const provider = new RecordingProvider();

        await expect(
            RunInEntityTransaction(provider, async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');

        expect(provider.Calls).toEqual(['begin:1', 'rollback:1']);
    });

    it('still runs the work on a provider that cannot transact (client tier)', async () => {
        // GraphQLDataProvider reports SupportsEntityTransactions === false. The work must still run
        // — the caller is responsible for having decided non-atomic execution is acceptable, or for
        // routing the unit of work to the server instead.
        const clientProvider = { SupportsEntityTransactions: false };
        let ran = false;

        const result = await RunInEntityTransaction(clientProvider, async () => {
            ran = true;
            return 42;
        });

        expect(ran).toBe(true);
        expect(result).toBe(42);
    });

    it('runs the work when the provider is null or undefined', async () => {
        await expect(RunInEntityTransaction(null, async () => 'ok')).resolves.toBe('ok');
        await expect(RunInEntityTransaction(undefined, async () => 'ok')).resolves.toBe('ok');
    });
});
