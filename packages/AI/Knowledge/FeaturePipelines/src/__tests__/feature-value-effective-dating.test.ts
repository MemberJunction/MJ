/**
 * PR 5 milestone B1 — effective-dated Feature Value writes (attack list, unit half).
 *
 * The service runs against an in-memory `MJ: Feature Values` table that enforces the three filtered unique indexes of
 * migration section B1 (`UQ_FeatureValue_OpenPipeline`, `UQ_FeatureValue_OpenHuman`, `UQ_FeatureValue_ValueKey` on open
 * rows only), the two stored lock Queries (run through `RunQuery`) and the write's entity transaction (a thrown error
 * restores every row). The database half of the attacks (the migration on PR 1 data, real concurrent transactions, the
 * guard over GraphQL, the lock timeout and the query plans) is
 * `packages/AI/PredictiveStudio/TruthSuite/src/__tests__/feature-value-effective-dating.adversarial.db.test.ts` (D5-B1-1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, RunQueryParams, RunViewParams, UserInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';
import {
    FeatureValueCacheService,
    FeatureValueSaveError,
    type FeatureValueOutputItem,
    type RecordFeatureValuesParams,
    type TypedFeatureValue,
} from '../cache/FeatureValueCacheService';
import { FeatureValueEffectiveDating } from '../cache/effective-dating';
import { FeatureValueWriteAuthorisations } from '../cache/feature-value-write-authorisations';
import { FEATURE_VALUE_LOCK_QUERIES } from '../cache/feature-value-locks';

/** A row of the in-memory table: the entity's columns by name. */
type Row = Record<string, unknown> & { ID: string | null };

const { store, FakeRunView, FakeRunQuery, fakeTransaction } = vi.hoisted(() => {
    type HoistedRow = Record<string, unknown> & { ID: string | null };
    const rows: HoistedRow[] = [];
    const lockCalls: string[] = [];
    let nextID = 1;
    let failNextInsert: string | null = null;
    let lockFailures = 0;
    /** The rows of other entities a read of the record's stamp sees (the record itself, its Record Changes). */
    const literal = (s: string): string => s.trim().replace(/^N?'(.*)'$/s, '$1').replace(/''/g, "'");
    const same = (stored: unknown, wanted: string): boolean => {
        if (stored instanceof Date) {
            return stored.getTime() === new Date(wanted).getTime();
        }
        return stored !== null && stored !== undefined && String(stored).toLowerCase() === wanted.toLowerCase();
    };
    const predicate = (conjunct: string): ((r: HoistedRow) => boolean) => {
        const c = conjunct.replace(/[[\]]/g, '').trim();
        const isNull = /^(\w+) IS NULL$/.exec(c);
        if (isNull) {
            return (r) => r[isNull[1]] === null || r[isNull[1]] === undefined;
        }
        const notNull = /^(\w+) IS NOT NULL$/.exec(c);
        if (notNull) {
            return (r) => r[notNull[1]] !== null && r[notNull[1]] !== undefined;
        }
        const inList = /^(\w+) IN \((.*)\)$/s.exec(c);
        if (inList) {
            const values = inList[2].split(',').map(literal);
            return (r) => values.some((v) => same(r[inList[1]], v));
        }
        const eqNum = /^(\w+) ?= ?(-?\d+)$/.exec(c);
        if (eqNum) {
            return (r) => r[eqNum[1]] !== null && Number(r[eqNum[1]]) === Number(eqNum[2]);
        }
        const eq = /^(\w+) ?= ?(N?'(?:[^']|'')*')$/s.exec(c);
        if (eq) {
            return (r) => same(r[eq[1]], literal(eq[2]));
        }
        throw new Error(`fake store: unsupported predicate '${conjunct}'`);
    };
    const matching = (filter: string): HoistedRow[] => {
        if (filter.trim() === '') {
            return [...rows];
        }
        const tests = filter.split(' AND ').map((c) => predicate(c));
        return rows.filter((r) => tests.every((t) => t(r)));
    };
    const time = (v: unknown): number => (v instanceof Date ? v.getTime() : v ? new Date(String(v)).getTime() : 0);
    const newestFirst = (list: HoistedRow[]): HoistedRow[] => [...list].sort((a, b) =>
        time(b.ComputedAt) - time(a.ComputedAt) || Number(b.ID) - Number(a.ID));
    const key = (v: unknown): string => (v === null || v === undefined ? '∅' : String(v).toLowerCase());
    const isOpenChampion = (r: HoistedRow, source: string): boolean =>
        (r.EffectiveTo === null || r.EffectiveTo === undefined) && r.Source === source && r.Role === 'Champion';
    /** The filtered unique index a row would break, or null. */
    const violatedIndex = (row: HoistedRow): string | null => {
        const others = rows.filter((r) => r !== row);
        if (isOpenChampion(row, 'Pipeline')) {
            const id = (r: HoistedRow): string => [r.RecordProcessID, r.EntityID, r.RecordID, r.FeatureName, r.PipelineVersion].map(key).join('|');
            if (others.some((r) => isOpenChampion(r, 'Pipeline') && id(r) === id(row))) return 'UQ_FeatureValue_OpenPipeline';
        }
        if (isOpenChampion(row, 'Human')) {
            const id = (r: HoistedRow): string => [r.RecordProcessID, r.MLModelScoringBindingID, r.EntityID, r.RecordID, r.FeatureName].map(key).join('|');
            if (others.some((r) => isOpenChampion(r, 'Human') && id(r) === id(row))) return 'UQ_FeatureValue_OpenHuman';
        }
        const open = (r: HoistedRow): boolean => r.ValueKeyHash !== null && r.ValueKeyHash !== undefined && (r.EffectiveTo === null || r.EffectiveTo === undefined);
        if (open(row) && others.some((r) => open(r) && key(r.RecordProcessID) === key(row.RecordProcessID) && r.ValueKeyHash === row.ValueKeyHash)) {
            return 'UQ_FeatureValue_ValueKey';
        }
        return null;
    };

    class FakeFeatureValue {
        [column: string]: unknown;
        public ID: string | null = null;
        public LatestResult: { CompleteMessage: string } | null = null;
        public EntityInfo = { Name: 'MJ: Feature Values' };
        public NewRecord(): void {
            this.ID = null;
            this.EffectiveTo = null;
            this.EffectiveAsOf = null;
            this.InputAsOf = null;
            this.SourceUserID = null;
        }
        public get IsSaved(): boolean {
            return this.ID !== null;
        }
        public async Save(): Promise<boolean> {
            const inserting = this.ID === null;
            if (inserting && failNextInsert !== null) {
                this.LatestResult = { CompleteMessage: failNextInsert };
                failNextInsert = null;
                return false;
            }
            const violated = violatedIndex(this as HoistedRow);
            if (violated) {
                this.LatestResult = { CompleteMessage: `Cannot insert duplicate key row in object 'FeatureValue' with unique index '${violated}'.` };
                return false;
            }
            if (inserting) {
                this.ID = String(nextID++);
                rows.push(this as HoistedRow);
            }
            return true;
        }
        public async Delete(): Promise<boolean> {
            rows.splice(rows.indexOf(this as HoistedRow), 1);
            return true;
        }
    }

    class FakeRunView {
        public static FromMetadataProvider(): FakeRunView { return new FakeRunView(); }
        public async RunView(params: RunViewParams): Promise<{ Success: boolean; Results: HoistedRow[]; ErrorMessage?: string; TotalRowCount: number }> {
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            try {
                const found = params.OrderBy ? newestFirst(matching(filter)) : matching(filter);
                const limited = typeof params.MaxRows === 'number' && params.MaxRows > 0 ? found.slice(0, params.MaxRows) : found;
                return { Success: true, Results: limited, TotalRowCount: found.length };
            } catch (e) {
                return { Success: false, Results: [], ErrorMessage: e instanceof Error ? e.message : String(e), TotalRowCount: 0 };
            }
        }
        public async RunViews(params: RunViewParams[]) {
            return Promise.all(params.map((p) => this.RunView(p)));
        }
    }

    /** The stored lock Queries: the open Champion rows of the identity, in the order they were asked for. */
    class FakeRunQuery {
        public async RunQuery(params: RunQueryParams): Promise<{ Success: boolean; Results: Record<string, string | number | null>[]; ErrorMessage: string }> {
            const name = params.QueryName || '';
            lockCalls.push(name);
            if (lockFailures > 0) {
                lockFailures--;
                return { Success: false, Results: [], ErrorMessage: 'Lock request time out period exceeded.' };
            }
            const p = (params.Parameters || {}) as Record<string, string | string[]>;
            const source = name.includes('Human') ? 'Human' : 'Pipeline';
            const names = (Array.isArray(p.FeatureNames) ? p.FeatureNames : [String(p.FeatureNames)]).map((n) => n.toLowerCase());
            const found = rows.filter((r) => isOpenChampion(r, source)
                && key(r.RecordProcessID) === key(p.RecordProcessID || null)
                && key(r.EntityID) === key(p.EntityID) && key(r.RecordID) === key(p.RecordID)
                && names.includes(String(r.FeatureName).toLowerCase()));
            return { Success: true, Results: found.map((r) => ({ ID: r.ID, FeatureName: String(r.FeatureName), PipelineVersion: (r.PipelineVersion as number | null) ?? null })), ErrorMessage: '' };
        }
    }

    /** The write's entity transaction: a thrown error restores every row's columns and the row list. */
    const fakeTransaction = async <T,>(_provider: unknown, work: () => Promise<T>): Promise<T> => {
        const snapshot = rows.map((r) => ({ row: r, columns: { ...r } }));
        try {
            return await work();
        } catch (e) {
            rows.length = 0;
            for (const s of snapshot) {
                Object.assign(s.row, s.columns);
                rows.push(s.row);
            }
            throw e;
        }
    };

    return {
        FakeRunView,
        FakeRunQuery,
        fakeTransaction,
        store: {
            NewRow: (): FakeFeatureValue => new FakeFeatureValue(),
            All: (): HoistedRow[] => [...rows],
            Rows: (source: string): HoistedRow[] => rows.filter((r) => r.Source === source),
            Seed: (columns: Record<string, unknown>): HoistedRow => {
                const row = Object.assign(new FakeFeatureValue(), {
                    RecordProcessID: 'rp-1', MLModelScoringBindingID: null, EntityID: 'ent-1', RecordID: 'r1', Role: 'Champion',
                    ComputedAt: new Date('2026-01-01T00:00:00Z'), EffectiveAsOf: new Date('2026-01-01T00:00:00Z'), EffectiveTo: null,
                    ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null,
                }, columns, { ID: String(nextID++) });
                rows.push(row as HoistedRow);
                return row as HoistedRow;
            },
            FailNextInsert: (message: string): void => { failNextInsert = message; },
            FailLocks: (n: number): void => { lockFailures = n; },
            LockCalls: (): string[] => [...lockCalls],
            Reset: (): void => {
                rows.length = 0;
                lockCalls.length = 0;
                failNextInsert = null;
                lockFailures = 0;
            },
        },
    };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, RunView: FakeRunView, RunQuery: FakeRunQuery, RunInEntityTransaction: fakeTransaction };
});

const RP = 'rp-1';
const RP2 = 'rp-2';
const T0 = new Date('2026-03-01T09:00:00.000Z');
const T1 = new Date('2026-04-01T09:00:00.000Z');
const user = { ID: 'user-1', Email: 'test@example.com' } as Partial<UserInfo> as UserInfo;
const provider = {
    GetEntityObject: vi.fn(async () => store.NewRow()),
    RunQuery: vi.fn(),
} as Partial<IMetadataProvider> as IMetadataProvider;
const svc = FeatureValueCacheService.Instance;

/** One output of feature `name` with value `value`. */
function Out(name: string, value: FeatureValueOutputItem['value']): FeatureValueOutputItem {
    return { featureName: name, value };
}

/** A pipeline write of record `recordID` in RP at version 1, with input hash `inputHash`. */
function PipelineWrite(recordID: string, outputs: FeatureValueOutputItem[], inputHash: string, overrides: Partial<RecordFeatureValuesParams> = {}): RecordFeatureValuesParams {
    return {
        recordProcessID: RP, entityID: 'ent-1', recordID, outputs, promptID: 'prompt-1', promptVersionHash: 'pvh-1',
        pipelineVersion: 1, aiModelID: 'model-1', parametersHash: 'ph-1', inputHash, source: 'Pipeline',
        contextUser: user, provider, ...overrides,
    };
}

/** The Champion Pipeline rows of a record and feature, oldest first. */
function PipelineRows(recordID: string, feature: string, rp: string = RP): Row[] {
    return store.Rows('Pipeline').filter((r) => r.RecordID === recordID && r.FeatureName === feature && r.RecordProcessID === rp && r.Role === 'Champion');
}

const open = (r: Row): boolean => r.EffectiveTo === null || r.EffectiveTo === undefined;
const text = (v: string): TypedFeatureValue => ({ ValueText: v, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null });

describe('B1 — effective-dated Feature Value writes (unit half)', () => {
    beforeEach(() => {
        store.Reset();
        vi.restoreAllMocks();
    });

    describe('FeatureValueEffectiveDating', () => {
        it('EffectiveAsOf is the input instant when given, else the computation time', () => {
            expect(FeatureValueEffectiveDating.EffectiveAsOf(T0, T1)).toEqual(T0);
            expect(FeatureValueEffectiveDating.EffectiveAsOf(null, T1)).toEqual(T1);
        });

        it('OpenIdentity: a Pipeline value is (Record Process, entity, record, feature, version); pin attributes are not part of it', () => {
            const base = { RecordProcessID: 'RP-1', MLModelScoringBindingID: null, EntityID: 'ENT-1', RecordID: 'r1', FeatureName: 'JobTitleLevel', PipelineVersion: 1, Source: 'Pipeline' as const };
            expect(FeatureValueEffectiveDating.OpenIdentity(base)).toBe(FeatureValueEffectiveDating.OpenIdentity({ ...base, RecordProcessID: 'rp-1', FeatureName: 'jobtitlelevel' }));
            expect(FeatureValueEffectiveDating.OpenIdentity(base)).not.toBe(FeatureValueEffectiveDating.OpenIdentity({ ...base, PipelineVersion: 2 }));
            expect(FeatureValueEffectiveDating.OpenIdentity(base)).not.toBe(FeatureValueEffectiveDating.OpenIdentity({ ...base, RecordProcessID: RP2 }));
            expect(FeatureValueEffectiveDating.OpenIdentity(base)).not.toBe(FeatureValueEffectiveDating.OpenIdentity({ ...base, Source: 'Human', PipelineVersion: null }));
        });

        it('OpenIdentity: a Human value is (Record Process, binding, entity, record, feature)', () => {
            const human = { RecordProcessID: null, MLModelScoringBindingID: 'B-1', EntityID: 'E', RecordID: 'r1', FeatureName: 'F', PipelineVersion: null, Source: 'Human' as const };
            expect(FeatureValueEffectiveDating.OpenIdentity(human)).not.toBe(FeatureValueEffectiveDating.OpenIdentity({ ...human, MLModelScoringBindingID: 'B-2' }));
        });

        it('Decide: no open row → open; the same input hash and typed value → unchanged; anything else → close-and-open', () => {
            const openRow = { ...text('Director'), InputHash: 'in-1' } as Partial<MJFeatureValueEntity> as MJFeatureValueEntity;
            expect(FeatureValueEffectiveDating.Decide(undefined, text('Director'), 'in-1')).toBe('open');
            expect(FeatureValueEffectiveDating.Decide(openRow, text('Director'), 'in-1')).toBe('unchanged');
            expect(FeatureValueEffectiveDating.Decide(openRow, text('Manager'), 'in-1')).toBe('close-and-open');
            expect(FeatureValueEffectiveDating.Decide(openRow, text('Director'), 'in-2')).toBe('close-and-open');
        });
    });

    it('attack 1: a changed input closes one row and opens one; every other record writes nothing', async () => {
        for (const r of ['p1', 'p2', 'p3']) {
            await svc.RecordFeatureValues(PipelineWrite(r, [Out('JobTitleLevel', 'Director')], `in-${r}`));
        }
        const before = store.All().length;
        const outcomes = [];
        for (const r of ['p1', 'p2', 'p3']) {
            const changed = r === 'p2';
            outcomes.push(await svc.RecordFeatureValues(PipelineWrite(r, [Out('JobTitleLevel', changed ? 'Manager' : 'Director')], changed ? 'in-p2-new' : `in-${r}`)));
        }
        expect(store.All().length).toBe(before + 1);
        const p2 = PipelineRows('p2', 'JobTitleLevel');
        expect(p2.map((r) => [r.ValueText, open(r)])).toEqual([['Director', false], ['Manager', true]]);
        expect(p2[0].EffectiveTo).toEqual(p2[1].EffectiveAsOf);
        expect(PipelineRows('p1', 'JobTitleLevel')).toHaveLength(1);
        expect(PipelineRows('p3', 'JobTitleLevel')).toHaveLength(1);
        expect(outcomes.map((o) => [o.Upserted, o.Unchanged, o.Closed])).toEqual([[0, 1, 0], [1, 0, 1], [0, 1, 0]]);
    });

    it('attack 2: the same input twice is Unchanged, writes 0 rows and leaves EffectiveAsOf alone', async () => {
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1', { inputAsOf: T0 }));
        const first = PipelineRows('p1', 'JobTitleLevel')[0];
        const effective = first.EffectiveAsOf;
        const again = await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1', { inputAsOf: T1 }));
        expect([again.Upserted, again.Unchanged, again.Closed]).toEqual([0, 1, 0]);
        expect(PipelineRows('p1', 'JobTitleLevel')).toHaveLength(1);
        expect(PipelineRows('p1', 'JobTitleLevel')[0].EffectiveAsOf).toEqual(effective);
    });

    it('attack 3: a pipeline write never closes the record\'s open Human value (D-017)', async () => {
        const human = store.Seed({ Source: 'Human', RecordID: 'p1', FeatureName: 'JobTitleLevel', ValueText: 'VP', PipelineVersion: null });
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-2'));
        expect(open(human)).toBe(true);
        expect(store.Rows('Human')).toHaveLength(1);
    });

    it('attack 4: a version-2 write leaves every version-1 row\'s EffectiveTo as it was', async () => {
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-2'));
        const v1 = PipelineRows('p1', 'JobTitleLevel').map((r) => [r.ID, r.EffectiveTo]);
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Senior Manager')], 'in-3', { pipelineVersion: 2, promptVersionHash: 'pvh-2' }));
        expect(PipelineRows('p1', 'JobTitleLevel').filter((r) => r.PipelineVersion === 1).map((r) => [r.ID, r.EffectiveTo])).toEqual(v1);
        expect(PipelineRows('p1', 'JobTitleLevel').filter((r) => r.PipelineVersion === 2 && open(r))).toHaveLength(1);
    });

    it('attack 6: an insert refused after the close rolls the close back (one transaction; the open row stays open)', async () => {
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
        store.FailNextInsert('The INSERT statement conflicted with the CHECK constraint');
        await expect(svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-2'))).rejects.toBeInstanceOf(FeatureValueSaveError);
        const rows = PipelineRows('p1', 'JobTitleLevel');
        expect(rows.map((r) => [r.ValueText, open(r)])).toEqual([['Director', true]]);
    });

    it('attack 7: every row the service writes carries EffectiveAsOf (PR 3\'s reader selects only dated rows)', async () => {
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-2'));
        await svc.RecordHumanValue({ RecordProcessID: RP, EntityID: 'ent-1', RecordID: 'p1', FeatureName: 'JobTitleLevel', Value: 'VP', ContextUser: user, Provider: provider });
        expect(store.All().every((r) => r.EffectiveAsOf instanceof Date)).toBe(true);
    });

    it('attack 8 (service half): EffectiveAsOf and InputAsOf are the caller\'s inputAsOf, else the computation time', async () => {
        await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1', { inputAsOf: T0 }));
        const before = Date.now();
        await svc.RecordFeatureValues(PipelineWrite('p2', [Out('JobTitleLevel', 'Director')], 'in-2'));
        const [p1] = PipelineRows('p1', 'JobTitleLevel');
        const [p2] = PipelineRows('p2', 'JobTitleLevel');
        expect([p1.EffectiveAsOf, p1.InputAsOf]).toEqual([T0, T0]);
        expect((p2.EffectiveAsOf as Date).getTime()).toBeGreaterThanOrEqual(before);
        expect(p2.InputAsOf).toBeNull();
    });

    describe('attack 9: dated history the old key refused (F-002, F-009)', () => {
        it('A → B → A on one version: three rows, two closed, the last open, no FeatureValueSaveError', async () => {
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-A'));
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-B'));
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-A'));
            const rows = PipelineRows('p1', 'JobTitleLevel');
            expect(rows.map((r) => [r.ValueText, open(r)])).toEqual([['Director', false], ['Manager', false], ['Director', true]]);
            expect(rows[0].ValueKeyHash).toBe(rows[2].ValueKeyHash);
        });

        it('the same input re-derived to a new value: one closed, one open', async () => {
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
            const outcome = await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-1'));
            expect(outcome.Closed).toBe(1);
            expect(PipelineRows('p1', 'JobTitleLevel').map((r) => [r.ValueText, open(r)])).toEqual([['Director', false], ['Manager', true]]);
        });

        it('two Human edits of one record and feature: two Human rows, the first closed', async () => {
            const ref = { RecordProcessID: RP, EntityID: 'ent-1', RecordID: 'p1', FeatureName: 'JobTitleLevel', ContextUser: user, Provider: provider };
            await svc.RecordHumanValue({ ...ref, Value: 'VP' });
            await svc.RecordHumanValue({ ...ref, Value: 'SVP' });
            const human = store.Rows('Human');
            expect(human.map((r) => [r.ValueText, open(r)])).toEqual([['VP', false], ['SVP', true]]);
        });

        it('the same Human value observed again writes nothing', async () => {
            const ref = { RecordProcessID: RP, EntityID: 'ent-1', RecordID: 'p1', FeatureName: 'JobTitleLevel', ContextUser: user, Provider: provider };
            await svc.RecordHumanValue({ ...ref, Value: 'VP' });
            await svc.RecordHumanValue({ ...ref, Value: 'VP' });
            expect(store.Rows('Human')).toHaveLength(1);
        });

        it('RetireHumanValue closes the Human row instead of deleting it', async () => {
            const ref = { RecordProcessID: RP, EntityID: 'ent-1', RecordID: 'p1', FeatureName: 'JobTitleLevel', ContextUser: user, Provider: provider };
            await svc.RecordHumanValue({ ...ref, Value: 'VP' });
            expect(await svc.RetireHumanValue(ref)).toBe(1);
            const human = store.Rows('Human');
            expect(human).toHaveLength(1);
            expect(open(human[0])).toBe(false);
            expect(await svc.GetLatestValue({ ...ref, Source: 'Human' })).toBeNull();
        });

        it('a historyOnly row is written already closed and never takes the open slot', async () => {
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', null)], 'in-2', { historyOnly: true }));
            const rows = PipelineRows('p1', 'JobTitleLevel');
            expect(rows.map((r) => [r.ValueText, open(r)])).toEqual([['Director', true], [null, false]]);
            expect(rows[1].EffectiveTo).toEqual(rows[1].EffectiveAsOf);
        });
    });

    describe('attack 11: one identity under fallback and shared names (F-010)', () => {
        it('two Record Processes on one entity emitting one feature at version 1 keep their own open rows', async () => {
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-1', { recordProcessID: RP2 }));
            expect(PipelineRows('p1', 'JobTitleLevel', RP).filter(open)).toHaveLength(1);
            expect(PipelineRows('p1', 'JobTitleLevel', RP2).filter(open)).toHaveLength(1);
        });

        it('a value of the pinned version answered by a fallback model is stored with the pin\'s model and closes the same open row', async () => {
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1', { aiPromptRunID: 'run-primary' }));
            // the fallback-answered prompt run: same pin (aiModelID is the pin's), a different prompt run
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-2', { aiPromptRunID: 'run-fallback' }));
            const rows = PipelineRows('p1', 'JobTitleLevel');
            expect(rows.map((r) => [r.AIModelID, open(r)])).toEqual([['model-1', false], ['model-1', true]]);
        });
    });

    describe('attack 13: write-back is never Human (F-015), service half', () => {
        it('a Human value is dated at the record\'s __mj_UpdatedAt and carries the editing user', async () => {
            const stamp = vi.spyOn(FeatureValueCacheService.prototype as unknown as { ReadRecordStamp: () => Promise<{ UpdatedAt: Date | null; UserID: string | null }> }, 'ReadRecordStamp')
                .mockResolvedValue({ UpdatedAt: T0, UserID: 'editor-1' });
            await svc.RecordHumanValue({ RecordProcessID: RP, EntityID: 'ent-1', RecordID: 'p1', FeatureName: 'JobTitleLevel', Value: 'VP', ContextUser: user, Provider: provider });
            expect(stamp).toHaveBeenCalled();
            const [human] = store.Rows('Human');
            expect([human.EffectiveAsOf, human.SourceUserID]).toEqual([T0, 'editor-1']);
        });

        it('a record with no stamp dates the Human value at the computation time', async () => {
            vi.spyOn(FeatureValueCacheService.prototype as unknown as { ReadRecordStamp: () => Promise<{ UpdatedAt: Date | null; UserID: string | null }> }, 'ReadRecordStamp')
                .mockResolvedValue({ UpdatedAt: null, UserID: null });
            const before = Date.now();
            await svc.RecordHumanValue({ RecordProcessID: RP, EntityID: 'ent-1', RecordID: 'p1', FeatureName: 'JobTitleLevel', Value: 'VP', ContextUser: user, Provider: provider });
            const [human] = store.Rows('Human');
            expect((human.EffectiveAsOf as Date).getTime()).toBeGreaterThanOrEqual(before);
            expect(human.SourceUserID).toBeNull();
        });
    });

    describe('attack 15 (service half): the lock order and a failed lock result', () => {
        it('takes the Pipeline lock before the Human lock, both before any read of the open rows', async () => {
            await svc.RecordHumanValue({ RecordProcessID: RP, EntityID: 'ent-1', RecordID: 'p1', FeatureName: 'JobTitleLevel', Value: 'VP', ContextUser: user, Provider: provider });
            expect(store.LockCalls()).toEqual([FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline, FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman]);
        });

        it('a pipeline write takes the Pipeline lock', async () => {
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
            expect(store.LockCalls()[0]).toBe(FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline);
            expect(store.LockCalls().indexOf(FEATURE_VALUE_LOCK_QUERIES.LockOpenHuman)).toBe(-1);
        });

        it('a lock result with Success: false is never read as "no open row": one retry, then one close-and-open', async () => {
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
            store.FailLocks(1);
            const outcome = await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-2'));
            expect(store.LockCalls().filter((n) => n === FEATURE_VALUE_LOCK_QUERIES.LockOpenPipeline)).toHaveLength(3);
            expect(outcome.Closed).toBe(1);
            expect(PipelineRows('p1', 'JobTitleLevel').filter(open)).toHaveLength(1);
        }, 10_000);
    });

    describe('attack 5/14 (service half): every range write goes through the instance-keyed authorisation', () => {
        it('every save the service makes is authorised for the instance it saves', async () => {
            const saves = vi.spyOn(FeatureValueWriteAuthorisations, 'Save');
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Director')], 'in-1'));
            await svc.RecordFeatureValues(PipelineWrite('p1', [Out('JobTitleLevel', 'Manager')], 'in-2'));
            // the first insert, then the close and the second insert
            expect(saves).toHaveBeenCalledTimes(3);
        });
    });
});
