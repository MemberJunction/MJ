import { describe, it, expect, beforeEach } from 'vitest';
import {
    GraphProviderPool,
    probeIndependentInstances,
    type GraphProviderLike,
    type GraphSettleOutcome,
} from '../lib/graph-provider-pool';

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

    it('keeps leftover-depth graphs live across levels and releases at last level', async () => {
        const host = new FakeProvider();
        host.leftoverDepth = 1;
        const pool = new GraphProviderPool(host, { mode: 'independent' });
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
        const pool = new GraphProviderPool(host, { mode: 'independent' });
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
        const pool = new GraphProviderPool(host, { mode: 'independent' });
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
        const pool = new GraphProviderPool(host, { mode: 'independent' });
        pool.noteLevels([[{ graphId: 'A' }]]);

        const a = (await pool.obtain('A')) as FakeProvider;
        a.commitShouldThrow = true;
        const err = await pool.drainBatch(['A'], 0);
        expect(err).toBeInstanceOf(Error);
        expect(err?.message).toMatch(/commit failed/);
        expect(a.releases).toBe(1);
        expect(a.rollbacks).toBe(1);
    });

    it('throws when CreateIndependentInstance fails, and never falls back to the host', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host, { mode: 'independent' });
        pool.noteLevels([[{ graphId: 'A' }, { graphId: 'B' }, { graphId: 'C' }]]);

        const a = await pool.obtain('A');
        const b = await pool.obtain('B');
        expect(a).not.toBe(host);
        expect(b).not.toBe(host);

        host.independentShouldThrow = true;
        await expect(pool.obtain('C')).rejects.toThrow(/Refusing to run this graph on the host provider/);
        // Earlier graphs stay independent — the mix never starts
        expect(await pool.obtain('A')).toBe(a);
        expect(FakeProvider.created).toBe(2);
    });

    it('releaseAll rolls back remaining graphs after a thrown failure', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host, { mode: 'independent' });
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
    it('reports committed for graphs whose Save already committed, even after a failure', async () => {
        const host = new FakeProvider();
        host.leftoverDepth = 0;
        const outcomes: Array<[string, GraphSettleOutcome]> = [];
        const pool = new GraphProviderPool(host, {
            mode: 'independent',
            onGraphSettled: (id, outcome) => outcomes.push([id, outcome]),
        });
        pool.noteLevels([[{ graphId: 'A' }, { graphId: 'B' }]]);
        await pool.obtain('A');
        await pool.obtain('B');
        pool.markFailed();
        await pool.releaseAll();
        // Depth 0 means each Save committed on its own; a failure elsewhere cannot undo that.
        expect(outcomes).toEqual([['A', 'committed'], ['B', 'committed']]);
    });

    it('reports rolledBack for leftover depth after a failure, and committed after a clean commit', async () => {
        const host = new FakeProvider();
        const outcomes: Array<[string, GraphSettleOutcome]> = [];
        const pool = new GraphProviderPool(host, {
            mode: 'independent',
            onGraphSettled: (id, outcome) => outcomes.push([id, outcome]),
        });
        pool.noteLevels([[{ graphId: 'A' }], [{ graphId: 'B' }]]);
        await pool.obtain('A');
        await pool.drainBatch(['A'], 0);
        await pool.obtain('B');
        pool.markFailed();
        await pool.drainBatch(['B'], 1);
        expect(outcomes).toEqual([['A', 'committed'], ['B', 'rolledBack']]);
    });
});

describe('GraphProviderPool in host mode', () => {
    beforeEach(() => {
        FakeProvider.created = 0;
    });

    it('hands every graph the host and never creates an independent instance', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host, { mode: 'host' });
        pool.noteLevels([[{ graphId: 'A' }, { graphId: 'B' }]]);

        expect(await pool.obtain('A')).toBe(host);
        await pool.drainBatch(['A'], 0);
        expect(await pool.obtain('B')).toBe(host);
        await pool.drainBatch(['B'], 0);

        expect(FakeProvider.created).toBe(0);
        expect(pool.Mode).toBe('host');
    });

    it('refuses to hand the host to a second graph while another graph holds it', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host, { mode: 'host' });
        pool.noteLevels([[{ graphId: 'A' }, { graphId: 'B' }]]);

        await pool.obtain('A');
        await expect(pool.obtain('B')).rejects.toThrow(/still holds it/);
        // The holder itself may ask again (a graph's records run one after another).
        expect(await pool.obtain('A')).toBe(host);
    });

    it('never commits, rolls back, or releases the host — the push transaction owns it', async () => {
        const host = new FakeProvider();
        host.TransactionDepth = 1;
        const settled: string[] = [];
        const pool = new GraphProviderPool(host, { mode: 'host', onGraphSettled: (id) => settled.push(id) });
        pool.noteLevels([[{ graphId: 'A' }]]);

        await pool.obtain('A');
        pool.markFailed();
        expect(await pool.drainBatch(['A'], 0)).toBeUndefined();
        expect(await pool.releaseAll()).toBeUndefined();

        expect(host.commits).toBe(0);
        expect(host.rollbacks).toBe(0);
        expect(host.releases).toBe(0);
        expect(settled).toEqual([]);
    });

    it('frees the host after releaseAll so the next file can use it', async () => {
        const host = new FakeProvider();
        const pool = new GraphProviderPool(host, { mode: 'host' });
        await pool.obtain('A');
        await pool.releaseAll();
        expect(await pool.obtain('B')).toBe(host);
    });
});

describe('probeIndependentInstances', () => {
    it('returns undefined and releases the probe instance when independents work', async () => {
        const host = new FakeProvider();
        const created: FakeProvider[] = [];
        const original = host.CreateIndependentInstance.bind(host);
        host.CreateIndependentInstance = async () => {
            const child = (await original()) as FakeProvider;
            created.push(child);
            return child;
        };
        expect(await probeIndependentInstances(host)).toBeUndefined();
        expect(created).toHaveLength(1);
        expect(created[0].releases).toBe(1);
    });

    it('returns the reason when CreateIndependentInstance throws', async () => {
        const host = new FakeProvider();
        host.independentShouldThrow = true;
        expect(await probeIndependentInstances(host)).toMatch(/does not implement/);
    });
});
