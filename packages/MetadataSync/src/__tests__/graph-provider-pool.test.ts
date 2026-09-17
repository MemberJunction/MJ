import { describe, it, expect, beforeEach } from 'vitest';
import { GraphProviderPool, type GraphProviderLike } from '../lib/graph-provider-pool';

class FakeProvider implements GraphProviderLike {
    static created = 0;
    TransactionDepth = 0;
    commits = 0;
    rollbacks = 0;
    releases = 0;
    commitShouldThrow = false;
    independentShouldThrow = false;
    /** Depth assigned to each newly created independent instance. */
    leftoverDepth = 1;

    async CreateIndependentInstance(): Promise<GraphProviderLike> {
        if (this.independentShouldThrow) {
            throw new Error('does not implement CreateIndependentInstance');
        }
        FakeProvider.created++;
        const child = new FakeProvider();
        child.leftoverDepth = this.leftoverDepth;
        child.TransactionDepth = this.leftoverDepth;
        return child;
    }
    async CommitTransaction(): Promise<void> {
        if (this.commitShouldThrow) throw new Error('commit failed');
        this.commits++;
        this.TransactionDepth = 0;
    }
    async RollbackTransaction(): Promise<void> {
        this.rollbacks++;
        this.TransactionDepth = 0;
    }
    async ReleaseIndependentInstance(): Promise<void> {
        this.releases++;
    }
}

describe('GraphProviderPool', () => {
    beforeEach(() => {
        FakeProvider.created = 0;
    });

    it('runs graph-complete work before the graph commits', async () => {
        const host = new FakeProvider();
        const order: string[] = [];
        const pool = new GraphProviderPool(host, () => undefined, async (graphId) => {
            order.push(`complete:${graphId}`);
        });
        pool.noteLevels([[{ graphId: 'A' }]]);

        const a = (await pool.obtain('A')) as FakeProvider;
        const origCommit = a.CommitTransaction.bind(a);
        a.CommitTransaction = async () => {
            order.push('commit:A');
            await origCommit();
        };

        expect(await pool.drainBatch(['A'], 0)).toBeUndefined();
        expect(order).toEqual(['complete:A', 'commit:A']);
    });

    it('rolls the graph back when graph-complete work throws, and reports the error', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host, () => undefined, async () => {
            throw new Error('deferred extraction failed');
        });
        pool.noteLevels([[{ graphId: 'A' }]]);

        const a = (await pool.obtain('A')) as FakeProvider;
        const settleError = await pool.drainBatch(['A'], 0);

        expect(settleError?.message).toBe('deferred extraction failed');
        expect(pool.hasFailed).toBe(true);
        expect(a.commits).toBe(0);
        expect(a.rollbacks).toBe(1);
        expect(a.releases).toBe(1);
    });

    it('skips graph-complete work for a file that has already failed', async () => {
        const host = new FakeProvider();
        let calls = 0;
        const pool = new GraphProviderPool(host, () => undefined, async () => {
            calls++;
        });
        pool.noteLevels([[{ graphId: 'A' }]]);

        await pool.obtain('A');
        pool.markFailed();
        await pool.drainBatch(['A'], 0);

        expect(calls).toBe(0);
    });

    it('keeps leftover-depth graphs live across levels and releases at last level', async () => {
        const host = new FakeProvider();
        host.leftoverDepth = 1;
        const pool = new GraphProviderPool(host);
        pool.noteLevels([
            [{ graphId: 'A' }, { graphId: 'B' }],
            [{ graphId: 'A' }, { graphId: 'B' }],
        ]);

        const a0 = await pool.obtain('A');
        const b0 = await pool.obtain('B');
        expect(FakeProvider.created).toBe(2);
        expect(await pool.obtain('A')).toBe(a0);

        // Leftover depth — stay live through level 0 even though lastLevel is 1
        await pool.drainBatch(['A', 'B'], 0);
        expect((a0 as FakeProvider).releases).toBe(0);
        expect((b0 as FakeProvider).releases).toBe(0);

        await pool.drainBatch(['A', 'B'], 1);
        expect((a0 as FakeProvider).commits).toBe(1);
        expect((b0 as FakeProvider).commits).toBe(1);
        expect((a0 as FakeProvider).releases).toBe(1);
        expect((b0 as FakeProvider).releases).toBe(1);
        expect((a0 as FakeProvider).rollbacks).toBe(0);
    });

    it('releases settled (depth 0) graphs at the current batch even if they have a later level', async () => {
        const host = new FakeProvider();
        host.leftoverDepth = 0;
        const pool = new GraphProviderPool(host);
        pool.noteLevels([
            [{ graphId: 'A' }, { graphId: 'B' }],
            [{ graphId: 'A' }, { graphId: 'B' }],
        ]);

        const a0 = await pool.obtain('A');
        const b0 = await pool.obtain('B');
        await pool.drainBatch(['A', 'B'], 0);
        expect((a0 as FakeProvider).releases).toBe(1);
        expect((b0 as FakeProvider).releases).toBe(1);
        expect((a0 as FakeProvider).commits).toBe(0); // depth was already 0

        // Next level gets a fresh instance — parent Save already committed
        const a1 = await pool.obtain('A');
        expect(a1).not.toBe(a0);
        expect(FakeProvider.created).toBe(3);
    });

    it('does not commit leftover depth when a record reported status: error', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host);
        pool.noteLevels([[{ graphId: 'A' }]]);

        const a = await pool.obtain('A');
        pool.markFailed();
        const err = await pool.drainBatch(['A'], 0);
        expect(err).toBeUndefined();
        expect((a as FakeProvider).commits).toBe(0);
        expect((a as FakeProvider).rollbacks).toBe(1);
        expect((a as FakeProvider).releases).toBe(1);
    });

    it('returns a commit failure and still releases the instance', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host);
        pool.noteLevels([[{ graphId: 'A' }]]);

        const a = (await pool.obtain('A')) as FakeProvider;
        a.commitShouldThrow = true;
        const err = await pool.drainBatch(['A'], 0);
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/commit failed/);
        expect(a.releases).toBe(1);
        expect(a.rollbacks).toBe(1);
    });

    it('memoizes CreateIndependentInstance failure and uses the host for every graph', async () => {
        const host = new FakeProvider();
        host.independentShouldThrow = true;
        const logs: string[] = [];
        const pool = new GraphProviderPool(host, (m) => logs.push(m));
        pool.noteLevels([[{ graphId: 'A' }, { graphId: 'B' }]]);

        const a = await pool.obtain('A');
        const b = await pool.obtain('B');
        expect(a).toBe(host);
        expect(b).toBe(host);
        expect(FakeProvider.created).toBe(0);
        expect(logs).toHaveLength(1);
        expect(logs[0]).toMatch(/ALL graphs in this file use the host provider/);

        // Host is not stored, so drain must not ReleaseIndependentInstance the host
        await pool.drainBatch(['A', 'B'], 0);
        expect(host.releases).toBe(0);
        expect(host.commits).toBe(0);
    });

    it('throws if CreateIndependentInstance fails after independents already exist', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host);
        pool.noteLevels([[{ graphId: 'A' }, { graphId: 'B' }, { graphId: 'C' }]]);

        const a = await pool.obtain('A');
        const b = await pool.obtain('B');
        expect(a).not.toBe(host);
        expect(b).not.toBe(host);

        host.independentShouldThrow = true;
        await expect(pool.obtain('C')).rejects.toThrow(/Refusing mixed host \+ independent topology/);
        // Earlier graphs stay independent — the mix never starts
        expect(await pool.obtain('A')).toBe(a);
        expect(FakeProvider.created).toBe(2);
    });

    it('releaseAll rolls back remaining graphs after a thrown failure', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host);
        pool.noteLevels([
            [{ graphId: 'A' }],
            [{ graphId: 'A' }],
        ]);
        const a = await pool.obtain('A');
        pool.markFailed();
        const err = await pool.releaseAll();
        expect(err).toBeUndefined();
        expect((a as FakeProvider).commits).toBe(0);
        expect((a as FakeProvider).rollbacks).toBe(1);
        expect((a as FakeProvider).releases).toBe(1);
    });
});
