/**
 * PR 5 milestone B1 — attack 12 (concurrent writers, F-011), unit half. Two `RecordFeatureValues` calls for one record
 * and feature run at once, each in its own transaction; the in-memory table's lock Query refuses (`Success: false`, as
 * SQL Server's NOWAIT reports through `RunQuery`) while another transaction holds the identity, and the lock is held
 * until that transaction ends. The database half (two real SQL Server transactions) is the TruthSuite DB file (D5-B1-1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, RunQueryParams, RunViewParams, UserInfo } from '@memberjunction/core';
import { FeatureValueCacheService, type RecordFeatureValuesParams } from '../cache/FeatureValueCacheService';

const { table, FakeRunView, FakeRunQuery, fakeTransaction } = vi.hoisted(() => {
    type HoistedRow = Record<string, unknown> & { ID: string | null };
    // A hoisted block cannot read the file's imports, so node:async_hooks is loaded here: the transaction id follows
    // each call's async chain.
    const { AsyncLocalStorage } = process.getBuiltinModule('node:async_hooks');
    const tx = new AsyncLocalStorage<number>();
    const rows: HoistedRow[] = [];
    /** Identity → the transaction holding its lock. */
    const locks = new Map<string, number>();
    let nextID = 1;
    let nextTx = 1;
    const key = (v: unknown): string => (v === null || v === undefined ? '∅' : String(v).toLowerCase());
    const isOpen = (r: HoistedRow, source: string): boolean => (r.EffectiveTo === null || r.EffectiveTo === undefined) && r.Source === source && r.Role === 'Champion';
    const identity = (r: HoistedRow): string => [r.RecordProcessID, r.EntityID, r.RecordID, r.FeatureName, r.PipelineVersion].map(key).join('|');
    const literal = (s: string): string => s.trim().replace(/^N?'(.*)'$/s, '$1').replace(/''/g, "'");
    const predicate = (conjunct: string): ((r: HoistedRow) => boolean) => {
        const c = conjunct.replace(/[[\]]/g, '').trim();
        const isNull = /^(\w+) IS NULL$/.exec(c);
        if (isNull) return (r) => r[isNull[1]] === null || r[isNull[1]] === undefined;
        const inList = /^(\w+) IN \((.*)\)$/s.exec(c);
        if (inList) {
            const values = inList[2].split(',').map(literal).map((v) => v.toLowerCase());
            return (r) => values.includes(key(r[inList[1]]));
        }
        const eqNum = /^(\w+) ?= ?(-?\d+)$/.exec(c);
        if (eqNum) return (r) => r[eqNum[1]] !== null && Number(r[eqNum[1]]) === Number(eqNum[2]);
        const eq = /^(\w+) ?= ?(N?'(?:[^']|'')*')$/s.exec(c);
        if (eq) return (r) => key(r[eq[1]]) === literal(eq[2]).toLowerCase();
        throw new Error(`fake table: unsupported predicate '${conjunct}'`);
    };

    class FakeFeatureValue {
        [column: string]: unknown;
        public ID: string | null = null;
        public LatestResult: { CompleteMessage: string } | null = null;
        public EntityInfo = { Name: 'MJ: Feature Values' };
        public NewRecord(): void { this.ID = null; this.EffectiveTo = null; }
        public get IsSaved(): boolean { return this.ID !== null; }
        public async Save(): Promise<boolean> {
            await Promise.resolve();
            const row = this as HoistedRow;
            if (isOpen(row, 'Pipeline') && rows.some((r) => r !== row && isOpen(r, 'Pipeline') && identity(r) === identity(row))) {
                this.LatestResult = { CompleteMessage: "Cannot insert duplicate key row in object 'FeatureValue' with unique index 'UQ_FeatureValue_OpenPipeline'." };
                return false;
            }
            if (this.ID === null) {
                this.ID = String(nextID++);
                rows.push(row);
            }
            return true;
        }
    }

    class FakeRunView {
        public static FromMetadataProvider(): FakeRunView { return new FakeRunView(); }
        public async RunView(params: RunViewParams) {
            await Promise.resolve();
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            try {
                const tests = filter.trim() === '' ? [] : filter.split(' AND ').map(predicate);
                const found = rows.filter((r) => tests.every((t) => t(r)));
                const ordered = params.OrderBy ? [...found].sort((a, b) => Number(b.ID) - Number(a.ID)) : found;
                return { Success: true, Results: typeof params.MaxRows === 'number' && params.MaxRows > 0 ? ordered.slice(0, params.MaxRows) : ordered, TotalRowCount: found.length };
            } catch (e) {
                return { Success: false, Results: [], ErrorMessage: e instanceof Error ? e.message : String(e), TotalRowCount: 0 };
            }
        }
        public async RunViews(params: RunViewParams[]) { return Promise.all(params.map((p) => this.RunView(p))); }
    }

    /** The lock Query: refused while another transaction holds the identity's lock; held until this transaction ends. */
    class FakeRunQuery {
        public async RunQuery(params: RunQueryParams) {
            await Promise.resolve();
            const p = (params.Parameters || {}) as Record<string, string | string[]>;
            const names = Array.isArray(p.FeatureNames) ? p.FeatureNames : [String(p.FeatureNames)];
            const me = tx.getStore() ?? 0;
            const ids = names.map((n) => `${params.QueryName}|${[p.RecordProcessID, p.EntityID, p.RecordID, n].map(key).join('|')}`);
            if (ids.some((id) => locks.has(id) && locks.get(id) !== me)) {
                return { Success: false, Results: [], ErrorMessage: 'Lock request time out period exceeded.' };
            }
            ids.forEach((id) => locks.set(id, me));
            const source = String(params.QueryName).includes('Human') ? 'Human' : 'Pipeline';
            const found = rows.filter((r) => isOpen(r, source) && key(r.RecordProcessID) === key(p.RecordProcessID) && key(r.EntityID) === key(p.EntityID)
                && key(r.RecordID) === key(p.RecordID) && names.map((n) => n.toLowerCase()).includes(String(r.FeatureName).toLowerCase()));
            return { Success: true, Results: found.map((r) => ({ ID: r.ID, FeatureName: String(r.FeatureName), PipelineVersion: (r.PipelineVersion as number | null) ?? null })), ErrorMessage: '' };
        }
    }

    const release = (me: number): void => {
        for (const [id, holder] of [...locks]) if (holder === me) locks.delete(id);
    };
    const fakeTransaction = async <T,>(_p: unknown, work: () => Promise<T>): Promise<T> => {
        const me = nextTx++;
        return tx.run(me, async () => {
            try {
                return await work();
            } finally {
                release(me);
            }
        });
    };

    return {
        FakeRunView, FakeRunQuery, fakeTransaction,
        table: {
            NewRow: (): FakeFeatureValue => new FakeFeatureValue(),
            Rows: (): HoistedRow[] => [...rows],
            Reset: (): void => { rows.length = 0; locks.clear(); },
        },
    };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, RunView: FakeRunView, RunQuery: FakeRunQuery, RunInEntityTransaction: fakeTransaction };
});

const user = { ID: 'user-1' } as Partial<UserInfo> as UserInfo;
const provider = { GetEntityObject: vi.fn(async () => table.NewRow()), RunQuery: vi.fn() } as Partial<IMetadataProvider> as IMetadataProvider;
const svc = FeatureValueCacheService.Instance;

function Write(recordID: string, value: string, inputHash: string): RecordFeatureValuesParams {
    return {
        recordProcessID: 'rp-1', entityID: 'ent-1', recordID, outputs: [{ featureName: 'JobTitleLevel', value }], promptID: 'prompt-1',
        promptVersionHash: 'pvh-1', pipelineVersion: 1, aiModelID: 'model-1', parametersHash: 'ph-1', inputHash, source: 'Pipeline',
        contextUser: user, provider,
    };
}

const openRows = (recordID: string) => table.Rows().filter((r) => r.RecordID === recordID && (r.EffectiveTo === null || r.EffectiveTo === undefined));

describe('attack 12: concurrent writers (F-011)', () => {
    beforeEach(() => table.Reset());

    it('two calls for one record and feature with different values: one open, one closed, neither raises', async () => {
        const [a, b] = await Promise.all([svc.RecordFeatureValues(Write('p1', 'Director', 'in-1')), svc.RecordFeatureValues(Write('p1', 'Manager', 'in-2'))]);
        expect(openRows('p1')).toHaveLength(1);
        expect(table.Rows().filter((r) => r.RecordID === 'p1')).toHaveLength(2);
        expect(a.Upserted + b.Upserted).toBe(2);
        expect(a.Closed + b.Closed).toBe(1);
    }, 15_000);

    it('with the same value: one row, the second Unchanged', async () => {
        const [a, b] = await Promise.all([svc.RecordFeatureValues(Write('p1', 'Director', 'in-1')), svc.RecordFeatureValues(Write('p1', 'Director', 'in-1'))]);
        expect(table.Rows().filter((r) => r.RecordID === 'p1')).toHaveLength(1);
        expect([a.Upserted + b.Upserted, a.Unchanged + b.Unchanged]).toEqual([1, 1]);
    }, 15_000);

    it('a run overlapping a second run of the same pipeline over the same records: ≤ 1 open row per identity', async () => {
        const records = ['p1', 'p2', 'p3', 'p4'];
        const run = (suffix: string) => Promise.all(records.map((r) => svc.RecordFeatureValues(Write(r, `${r}-${suffix}`, `in-${r}-${suffix}`))));
        await Promise.all([run('a'), run('b')]);
        for (const r of records) expect(openRows(r)).toHaveLength(1);
    }, 30_000);
});
