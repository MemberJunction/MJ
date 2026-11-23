import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';
import {
    FeatureValueCacheService,
    FeatureValueKeyError,
    FeatureValueSaveError,
    type FeatureValueRecordRef,
    type ModelValueRow,
    type RecordModelValuesParams,
    type TypedFeatureValue,
} from '../cache/FeatureValueCacheService';

/** The `MJ: Feature Values` columns the in-memory store keeps. */
type StoredColumns = Pick<MJFeatureValueEntity,
    'ID' | 'RecordProcessID' | 'EntityID' | 'RecordID' | 'FeatureName' | 'Source' | 'Role' | 'ValueKeyHash'
    | 'ValueText' | 'ValueNumeric' | 'ValueBoolean' | 'ValueDate' | 'ValueJSON' | 'Confidence' | 'Reasoning'
    | 'MLModelID' | 'MLModelScoringBindingID' | 'MLScoringRunID' | 'EffectiveAsOf' | 'InTraining' | 'ProcessRunID'
    | 'ComputedAt' | 'PipelineVersion' | 'PromptID' | 'PromptVersionHash' | 'ConstraintHash' | 'AIModelID'
    | 'ParametersHash' | 'InputHash' | 'ProcessRunDetailID' | 'AIPromptRunID' | 'FeatureValueCacheID'>;

/**
 * An in-memory `MJ: Feature Values` table and its RunView: rows are entity-shaped objects with `NewRecord`, `Save` and
 * `Delete`, and a view evaluates the `AND`-joined `=`, `IS NULL` and `IN` predicates the service emits (an unknown
 * predicate fails the read, so a test never passes on a filter the fake ignored). Text compares case-insensitively, as
 * SQL Server's default collation does.
 */
const { store, views, FakeRunView } = vi.hoisted(() => {
    type Row = Record<string, unknown> & { ID: string | null; ComputedAt: Date | null };
    const rows: Row[] = [];
    let nextID = 1;
    const filters: string[] = [];
    let failNextSave: string | null = null;
    const literal = (s: string): string => s.trim().replace(/^'(.*)'$/s, '$1').replace(/''/g, "'");
    const same = (stored: unknown, wanted: string): boolean => {
        if (stored instanceof Date) {
            return stored.getTime() === new Date(wanted).getTime();
        }
        return stored !== null && stored !== undefined && String(stored).toLowerCase() === wanted.toLowerCase();
    };
    const predicate = (conjunct: string): ((r: Row) => boolean) => {
        const isNull = /^(\w+) IS NULL$/.exec(conjunct);
        if (isNull) {
            return (r) => r[isNull[1]] === null || r[isNull[1]] === undefined;
        }
        const inList = /^(\w+) IN \((.*)\)$/s.exec(conjunct);
        if (inList) {
            const values = inList[2].split(',').map(literal);
            return (r) => values.some((v) => same(r[inList[1]], v));
        }
        const eq = /^(\w+) = ('(?:[^']|'')*')$/s.exec(conjunct);
        if (eq) {
            return (r) => same(r[eq[1]], literal(eq[2]));
        }
        throw new Error(`fake store: unsupported predicate '${conjunct}'`);
    };
    const matching = (filter: string): Row[] => {
        const tests = filter.split(' AND ').map((c) => predicate(c.trim()));
        return rows.filter((r) => tests.every((t) => t(r)));
    };
    /** Newest ComputedAt first, ties broken by insertion order (the real order's __mj_CreatedAt, then ID). */
    const newestFirst = (list: Row[]): Row[] => [...list].sort((a, b) =>
        (b.ComputedAt?.getTime() || 0) - (a.ComputedAt?.getTime() || 0) || Number(b.ID) - Number(a.ID));

    class FakeFeatureValue {
        [column: string]: unknown;
        public ID: string | null = null;
        public ComputedAt: Date | null = null;
        public LatestResult: { CompleteMessage: string } | null = null;
        public NewRecord(): void {
            this.ID = null;
        }
        public async Save(): Promise<boolean> {
            if (failNextSave !== null) {
                this.LatestResult = { CompleteMessage: failNextSave };
                failNextSave = null;
                return false;
            }
            if (this.ID === null) {
                this.ID = String(nextID++);
                rows.push(this as Row);
            }
            return true;
        }
        public async Delete(): Promise<boolean> {
            rows.splice(rows.indexOf(this as Row), 1);
            return true;
        }
    }

    class FakeRunView {
        public static FromMetadataProvider(): FakeRunView { return new FakeRunView(); }
        public async RunView(params: RunViewParams): Promise<{ Success: boolean; Results: Row[]; ErrorMessage?: string }> {
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            filters.push(filter);
            try {
                const found = params.OrderBy ? newestFirst(matching(filter)) : matching(filter);
                return { Success: true, Results: typeof params.MaxRows === 'number' && params.MaxRows > 0 ? found.slice(0, params.MaxRows) : found };
            } catch (e) {
                return { Success: false, Results: [], ErrorMessage: e instanceof Error ? e.message : String(e) };
            }
        }
        public async RunViews(params: RunViewParams[]) {
            return Promise.all(params.map((p) => this.RunView(p)));
        }
    }

    return {
        FakeRunView,
        views: {
            /** Every ExtraFilter the service read with. */
            Filters: (): string[] => [...filters],
        },
        store: {
            /** A new, empty row, as `GetEntityObject` returns one. */
            NewRow: (): FakeFeatureValue => new FakeFeatureValue(),
            /** The stored rows of one source, in insertion order. */
            Rows: (source: string): Row[] => rows.filter((r) => r.Source === source),
            /** Stores a row with the defaults of a Pipeline value of record r1 in the test pipeline. */
            Seed: (columns: Record<string, unknown>): void => {
                const row = Object.assign(new FakeFeatureValue(), {
                    RecordProcessID: 'rp-1', EntityID: 'ent-1', RecordID: 'r1', Role: 'Champion', ComputedAt: new Date(),
                    ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null,
                }, columns, { ID: String(nextID++) });
                rows.push(row as Row);
            },
            /** Makes the next row save fail with the provider message given. */
            FailNextSave: (message: string): void => {
                failNextSave = message;
            },
            Reset: (): void => {
                rows.length = 0;
                filters.length = 0;
                failNextSave = null;
            },
        },
    };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, RunView: FakeRunView };
});

const BIND = '9f1c2a7e-0b4d-4c55-8e21-3a6f0d9b7c11';
const MODEL = '2b7e1f40-6c3a-4d8e-9a15-7f0e4c2b9d33';
const RUN = '5d3a9c12-8e4f-4b07-a6c1-0e2f7b9d4a55';
const DAY1 = new Date('2026-11-16T00:00:00.000Z');
const DAY2 = new Date('2026-11-17T00:00:00.000Z');
const user = { ID: 'user-1', Email: 'test@example.com' } as Partial<UserInfo> as UserInfo;
const provider = { GetEntityObject: vi.fn(async () => store.NewRow()) } as Partial<IMetadataProvider> as IMetadataProvider;
const svc = FeatureValueCacheService.Instance;

/** A numeric prediction of one record. */
function Row(recordID: string, value: number): ModelValueRow {
    const typed: TypedFeatureValue = { ValueText: null, ValueNumeric: value, ValueBoolean: null, ValueDate: null, ValueJSON: null };
    return { RecordID: recordID, Value: typed, Confidence: null, InTraining: false };
}

/** The champion's write of a batch on the test binding, as of DAY1. */
function ModelRef(overrides: Partial<RecordModelValuesParams>): RecordModelValuesParams {
    return {
        MLModelScoringBindingID: BIND, EntityID: 'ent-1', FeatureName: 'ChurnRisk', Role: 'Champion', MLModelID: MODEL,
        MLScoringRunID: RUN, EffectiveAsOf: DAY1, ProcessRunID: null, Rows: [], ContextUser: user, Provider: provider,
        ...overrides,
    };
}

/** Record r1's ChurnRisk value in the test pipeline. */
function HumanRef(): FeatureValueRecordRef {
    return { RecordProcessID: 'rp-1', EntityID: 'ent-1', RecordID: 'r1', FeatureName: 'ChurnRisk', ContextUser: user, Provider: provider };
}

/** Record r1's value of a feature in the test pipeline. */
function PipelineRef(featureName: string): FeatureValueRecordRef {
    return { ...HumanRef(), FeatureName: featureName };
}

describe('FeatureValueCacheService model rows and binding-scoped Human rows', () => {
    beforeEach(() => {
        store.Reset();
    });

    it('writes one Model row per record keyed by binding, record, as-of instant and role', async () => {
        const out = await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7), Row('r2', 0.2)] }));
        expect(out).toEqual({ Inserted: 2, Replaced: 0 });
        expect(store.Rows('Model').map((r) => [r.RecordID, r.MLModelScoringBindingID, r.Role, r.ValueKeyHash])).toEqual([['r1', BIND, 'Champion', null], ['r2', BIND, 'Champion', null]]);
    });

    it('a same as-of re-run replaces the rows in place; a new as-of date adds rows', async () => {
        await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7)] }));
        expect(await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.9)] }))).toEqual({ Inserted: 0, Replaced: 1 });
        expect(await svc.RecordModelValues(ModelRef({ EffectiveAsOf: DAY2, Rows: [Row('r1', 0.4)] }))).toEqual({ Inserted: 1, Replaced: 0 });
        expect(store.Rows('Model').map((r) => r.ValueNumeric)).toEqual([0.9, 0.4]);
    });

    it('records a Human value on a binding with no Record Process and reads it back by binding', async () => {
        await svc.RecordHumanValue({ ...HumanRef(), RecordProcessID: null, MLModelScoringBindingID: BIND, Value: 0.5 });
        expect(store.Rows('Human')).toEqual([expect.objectContaining({ RecordProcessID: null, MLModelScoringBindingID: BIND })]);
        expect(await svc.GetLatestValue({ ...HumanRef(), RecordProcessID: null, MLModelScoringBindingID: BIND, Source: 'Human' })).toMatchObject({ ValueNumeric: 0.5 });
    });

    it('never filters on RecordProcessID = \'null\'', async () => {
        await svc.RetireHumanValue({ ...HumanRef(), RecordProcessID: null, MLModelScoringBindingID: BIND });
        expect(views.Filters().some((f) => f.includes("RecordProcessID = 'null'"))).toBe(false);
    });

    it('readers ignore Challenger rows', async () => {
        store.Seed({ Source: 'Pipeline', Role: 'Challenger', FeatureName: 'Tier', ValueText: 'Gold' });
        expect(await svc.GetLatestValue({ ...PipelineRef('Tier'), Source: 'Pipeline' })).toBeNull();
    });

    it('stores the prediction lineage, the as-of instant and the values on each Model row', async () => {
        const classified: ModelValueRow = {
            RecordID: 'r1', Confidence: 0.82, InTraining: true,
            Value: { ValueText: 'Churn', ValueNumeric: 0.82, ValueBoolean: null, ValueDate: null, ValueJSON: '{"Probabilities":{"Churn":0.82,"Stay":0.18}}' },
        };
        await svc.RecordModelValues(ModelRef({ Rows: [classified], ProcessRunID: 'prun-1' }));
        expect(store.Rows('Model')).toEqual([expect.objectContaining({
            RecordProcessID: null, EntityID: 'ent-1', FeatureName: 'ChurnRisk', MLModelID: MODEL, MLScoringRunID: RUN,
            EffectiveAsOf: DAY1, InTraining: true, ProcessRunID: 'prun-1', Confidence: 0.82, ValueText: 'Churn', ValueNumeric: 0.82,
            ValueJSON: '{"Probabilities":{"Churn":0.82,"Stay":0.18}}', PipelineVersion: null, PromptVersionHash: null, AIModelID: null,
        })]);
        expect(store.Rows('Model')[0].ComputedAt).toBeInstanceOf(Date);
    });

    it('reads the batch\'s existing rows once, by binding, entity, records, as-of instant and role', async () => {
        await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7), Row('r2', 0.2), Row('r3', 0.1)] }));
        const reads = views.Filters();
        expect(reads).toHaveLength(1);
        expect(reads[0]).toContain(`MLModelScoringBindingID = '${BIND}'`);
        expect(reads[0]).toContain("EntityID = 'ent-1'");
        expect(reads[0]).toContain("RecordID IN ('r1', 'r2', 'r3')");
        expect(reads[0]).toContain(`EffectiveAsOf = '${DAY1.toISOString()}'`);
        expect(reads[0]).toContain("Role = 'Champion'");
        expect(reads[0]).toContain("Source = 'Model'");
    });

    it('a re-run under a new model version and run replaces the row\'s lineage too', async () => {
        await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7)] }));
        await svc.RecordModelValues(ModelRef({ MLModelID: 'model-v2', MLScoringRunID: 'run-2', Rows: [{ ...Row('r1', 0.6), InTraining: true }] }));
        expect(store.Rows('Model')).toEqual([expect.objectContaining({ MLModelID: 'model-v2', MLScoringRunID: 'run-2', InTraining: true, ValueNumeric: 0.6 })]);
    });

    it('a Challenger row sits beside the Champion\'s on the same key and is replaced on its own', async () => {
        await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7)] }));
        expect(await svc.RecordModelValues(ModelRef({ Role: 'Challenger', MLModelID: 'challenger', Rows: [Row('r1', 0.3)] }))).toEqual({ Inserted: 1, Replaced: 0 });
        expect(await svc.RecordModelValues(ModelRef({ Role: 'Challenger', MLModelID: 'challenger', Rows: [Row('r1', 0.35)] }))).toEqual({ Inserted: 0, Replaced: 1 });
        expect(store.Rows('Model').map((r) => [r.Role, r.ValueNumeric])).toEqual([['Champion', 0.7], ['Challenger', 0.35]]);
    });

    it('writes and reads nothing for an empty batch', async () => {
        expect(await svc.RecordModelValues(ModelRef({ Rows: [] }))).toEqual({ Inserted: 0, Replaced: 0 });
        expect(views.Filters()).toEqual([]);
    });

    it('refuses a batch that names a record twice, writing nothing', async () => {
        await expect(svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7), Row('R1', 0.2)] }))).rejects.toThrow(FeatureValueKeyError);
        expect(store.Rows('Model')).toEqual([]);
    });

    it('throws FeatureValueSaveError naming the feature and record when a row cannot be saved', async () => {
        store.FailNextSave('UQ_FeatureValue_ModelRow violated');
        const err = await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7)] })).catch((e: Error) => e);
        expect(err).toBeInstanceOf(FeatureValueSaveError);
        expect(err).toMatchObject({ FeatureName: 'ChurnRisk', RecordID: 'r1', ProviderMessage: 'UQ_FeatureValue_ModelRow violated' });
    });

    // Two same-day runs of a binding: the other run inserts r1 on the key between this run's read and its insert (R5).
    describe('an insert that loses the race on UQ_FeatureValue_ModelRow', () => {
        const duplicate = "Cannot insert duplicate key row in object '__mj.FeatureValue' with unique index 'UQ_FeatureValue_ModelRow'. The duplicate key value is (...).";
        const OTHER_RUN = '7a1e0c33-2b9d-4f61-8c04-5e3d1a7b9f22';
        /** A provider whose new-row factory lets the other run commit r1 first, so this run's insert hits the key. */
        const racing = (seedOtherRun: boolean): IMetadataProvider => ({
            GetEntityObject: vi.fn(async () => {
                if (seedOtherRun) {
                    store.Seed({ RecordProcessID: null, Source: 'Model', MLModelScoringBindingID: BIND, RecordID: 'r1', FeatureName: 'ChurnRisk', EffectiveAsOf: DAY1, ValueNumeric: 0.1, MLScoringRunID: OTHER_RUN });
                }
                store.FailNextSave(duplicate);
                return store.NewRow();
            }),
        } as Partial<IMetadataProvider> as IMetadataProvider);

        it('replaces the row the other run inserted on the key with this run\'s value and lineage, counting it Replaced', async () => {
            const out = await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7)], Provider: racing(true) }));
            expect(out).toEqual({ Inserted: 0, Replaced: 1 });
            expect(store.Rows('Model').map((r) => [r.RecordID, r.ValueNumeric, r.MLScoringRunID])).toEqual([['r1', 0.7, RUN]]);
        });

        it('throws the save error when no row holds the key after all (the failure was not the race)', async () => {
            const err = await svc.RecordModelValues(ModelRef({ Rows: [Row('r1', 0.7)], Provider: racing(false) })).catch((e: Error) => e);
            expect(err).toBeInstanceOf(FeatureValueSaveError);
            expect(err).toMatchObject({ RecordID: 'r1', ProviderMessage: duplicate });
        });
    });

    it('refuses a RecordProcessID null without a binding ID before reading', async () => {
        await expect(svc.GetLatestValue({ ...HumanRef(), RecordProcessID: null, Source: 'Human' }))
            .rejects.toMatchObject({ name: 'FeatureValueKeyError', Field: 'MLModelScoringBindingID' });
        expect(views.Filters()).toEqual([]);
    });
});
