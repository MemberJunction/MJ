import { describe, it, expect, vi } from 'vitest';
import {
    BaseEntity, BaseEntityResult, CompositeKey, DatabaseProviderBase, EntityFieldInfo, EntityInfo, RunViewResult, UserInfo,
    type EntityTransactionScope, type IEntityDataProvider, type RunViewParams,
} from '@memberjunction/core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';
import { MJGlobal } from '@memberjunction/global';
import { TagEngine } from '@memberjunction/tag-engine';
import { ApplyOutputMapping, OutputMappingWriter, type HumanValueGuard, type OutputMappingConfig } from '../writeBack';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';
import { DatabaseProviderStub, EntitiesOnlyProvider } from '@memberjunction/unit-testing';

const USER = new UserInfo();
const record: RecordRef = { EntityID: 'ENT-P', RecordID: 'person-1', Record: {} };

/**
 * A real `BaseEntity` whose field values live in a plain map: write-back reads and writes config-named fields through
 * Get/Set, as the real class allows. Saves and deletes are recorded in `order` under the row's label; nothing reaches a
 * database. The parent row is a People row, every other row a Person Job Functions row.
 */
class Row extends BaseEntity {
    public Saved = 0;
    public Deleted = false;
    public Values: Record<string, unknown>;
    private readonly writeOrder: string[];
    private readonly rowLabel: string;
    private readonly failSave: boolean;
    constructor(values: Record<string, unknown>, order: string[], label: string, failSave = false) {
        super(entityOf(label === 'parent' ? 'People' : 'Person Job Functions'));
        this.Values = values;
        this.writeOrder = order;
        this.rowLabel = label;
        this.failSave = failSave;
    }
    public override get LatestResult(): BaseEntityResult { return new BaseEntityResult(false, 'UQ_PersonJobFunction_Person_JobFunction'); }
    public override get PrimaryKey(): CompositeKey { return CompositeKey.FromKeyValuePair('ID', String(this.Values.ID || `new-${this.rowLabel}`)); }
    public override Get(f: string): unknown { return this.Values[f]; }
    public override Set(f: string, v: unknown): void { this.Values[f] = v; }
    public override NewRecord(): boolean { return true; }
    public override async InnerLoad(): Promise<boolean> { return true; }
    public override async Save(): Promise<boolean> { this.writeOrder.push(this.rowLabel); this.Saved++; return !this.failSave; }
    public override async Delete(): Promise<boolean> { this.writeOrder.push(`delete:${this.rowLabel}`); this.Deleted = true; return true; }
}

/** Field metadata as the database declares it (PersonJobFunction: Confidence is decimal(5,4)). */
const field = (Name: string, Type: string, Scale: number | null = null): EntityFieldInfo => new EntityFieldInfo({ Name, Type, Scale });
const PEOPLE_FIELDS = [field('ID', 'uniqueidentifier'), field('SeniorityLevelID', 'uniqueidentifier'), field('Nickname', 'nvarchar'), field('LastReviewedAt', 'datetimeoffset')];
const PJF_FIELDS = [field('ID', 'uniqueidentifier'), field('PersonID', 'uniqueidentifier'), field('JobFunctionID', 'uniqueidentifier'),
    field('Sequence', 'int'), field('Confidence', 'decimal', 4), field('Source', 'nvarchar')];

/** An entity as metadata declares it, from the field lists above; ID is the primary key. */
function entityOf(name: string): EntityInfo {
    const fields = name === 'People' ? PEOPLE_FIELDS : PJF_FIELDS;
    return new EntityInfo({
        ID: 'ENT-' + name, Name: name,
        Fields: fields.map((f) => ({ Name: f.Name, Type: f.Type, Scale: f.Scale, IsPrimaryKey: f.Name === 'ID' })),
    });
}

/**
 * A client-side provider double: a real `ProviderBase` (not a `DatabaseProviderBase`), so write-back runs on it
 * directly, inside the entity transaction it opens. Its People object is the harness parent; every other entity
 * object is a new child row; its views answer through `ViewRead`.
 */
class ClientWriteBackProvider extends EntitiesOnlyProvider {
    public readonly Scope = { IsNested: false, Commit: vi.fn(async (): Promise<void> => undefined), Rollback: vi.fn(async (): Promise<void> => undefined) };
    public readonly ViewRead = vi.fn(async (_params: RunViewParams): Promise<RunViewResult<Row>> => viewResult(true, []));
    public readonly Created: Row[] = [];
    constructor(public readonly Parent: Row, private readonly order: string[], private readonly failChildSave: boolean) {
        super([entityOf('People'), entityOf('Person Job Functions')]);
    }
    public override get SupportsEntityTransactions(): boolean { return true; }
    public async BeginEntityTransaction(): Promise<EntityTransactionScope> { return this.Scope; }
    public override EntityByID(): EntityInfo { return entityOf('People'); }
    public override EntityByName(n: string): EntityInfo { return entityOf(n); }
    /** The parent for People, else a new child row. `as T`: the generic return every provider implementation makes. */
    public override async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
        const row: BaseEntity = entityName === 'People' ? this.Parent : this.NewChild();
        return row as T;
    }
    /** A new child row, recorded in `Created`. */
    protected NewChild(): Row {
        const row = new Row({}, this.order, `child${this.Created.length}`, this.failChildSave);
        this.Created.push(row);
        return row;
    }
    /** `as` the caller's row type: the generic return every provider implementation makes. */
    public override async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        return (await this.ViewRead(params)) as RunViewResult<T>;
    }
}

function harness(existingChildren: Row[], opts: { failChildSave?: boolean } = {}) {
    const order: string[] = [];
    const parent = new Row({ ID: 'person-1', SeniorityLevelID: null }, order, 'parent');
    const provider = new ClientWriteBackProvider(parent, order, opts.failChildSave === true);
    provider.ViewRead.mockResolvedValue(viewResult(true, existingChildren));
    return { order, scope: provider.Scope, parent, created: provider.Created, provider, runView: provider.ViewRead };
}

/** A RunView result over the given rows. */
function viewResult(success: boolean, rows: Row[], errorMessage = ''): RunViewResult<Row> {
    return { Success: success, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: errorMessage };
}

const mapping: OutputMappingConfig = {
    fields: { SeniorityLevelID: '$.SeniorityLevel' },
    childRecords: [{
        entity: 'Person Job Functions', parentField: 'PersonID', fanOutRef: '$.Functions',
        map: { JobFunctionID: '$.JobFunctionID', Sequence: '$.Sequence', Confidence: '$.Confidence', Source: 'static:Derived' },
        reconcile: { keyFields: ['JobFunctionID'], sourceField: 'Source', derivedSourceValue: 'Derived', deleteStale: true },
    }],
};
const result = {
    SeniorityLevel: '11111111-1111-1111-1111-111111111111',
    Functions: [
        { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000001', Sequence: 1, Confidence: 0.9 },
        { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000002', Sequence: 2, Confidence: 0.4 },
    ],
};

describe('ApplyOutputMapping reconcile', () => {
    it('writes children before the parent field, inside one committed transaction', async () => {
        const h = harness([]);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider });
        expect(h.order).toEqual(['child0', 'child1', 'parent']);
        expect(h.scope.Commit).toHaveBeenCalledTimes(1);
        expect(out.createdChildIDs).toHaveLength(2);
        expect(h.created[0].Values.Source).toBe('Derived');
        expect(out.changed).toBe(true);
    });

    it('is a no-op on a re-run over identical rows (key compared case-insensitively): nothing inserted or saved', async () => {
        const order: string[] = [];
        const existing = [
            new Row({ ID: 'pjf-1', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Confidence: 0.9, Source: 'Derived' }, order, 'e1'),
            new Row({ ID: 'pjf-2', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000002', Sequence: 2, Confidence: 0.4, Source: 'Derived' }, order, 'e2'),
        ];
        const h = harness(existing);
        h.parent.Values.SeniorityLevelID = '11111111-1111-1111-1111-111111111111';
        const out = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider });
        expect(h.created).toHaveLength(0);
        expect(existing.every((r) => r.Saved === 0)).toBe(true);
        expect(h.parent.Saved).toBe(0);
        expect(out.unchangedChildIDs).toEqual(['pjf-1', 'pjf-2']);
        expect(out.changed).toBe(false);
    });

    it('previews no change for an identical re-run', async () => {
        const existing = [
            new Row({ ID: 'pjf-1', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Confidence: 0.9, Source: 'Derived' }, [], 'e1'),
            new Row({ ID: 'pjf-2', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000002', Sequence: 2, Confidence: 0.4, Source: 'Derived' }, [], 'e2'),
        ];
        const h = harness(existing);
        h.parent.Values.SeniorityLevelID = '11111111-1111-1111-1111-111111111111';
        const out = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider, dryRun: true });
        expect(out.previewFields).toEqual({});
        expect(out.previewChildren).toBeUndefined();
        expect(out.PreviewErrors).toBeUndefined();
        expect(existing.every((r) => r.Saved === 0)).toBe(true);
    });

    it('deletes pipeline rows the new answer dropped, and never touches human rows', async () => {
        const order: string[] = [];
        const stale = new Row({ ID: 'pjf-3', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000003', Sequence: 3, Source: 'Derived' }, order, 'stale');
        const human = new Row({ ID: 'pjf-4', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Source: 'Manual' }, order, 'human');
        // A human row the new answer does not propose: stale by key, yet a person owns it, so it stays.
        const humanDropped = new Row({ ID: 'pjf-5', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000005', Sequence: 5, Source: 'Manual' }, order, 'humanDropped');
        const h = harness([stale, human, humanDropped]);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider });
        expect(stale.Deleted).toBe(true);
        expect(human.Deleted).toBe(false);
        expect(humanDropped.Deleted).toBe(false);
        expect(out.deletedChildIDs).toEqual(['pjf-3']);
        expect(human.Saved).toBe(0);
        expect(out.preservedHumanChildIDs).toEqual(['pjf-4']);
        expect(h.created).toHaveLength(1); // function 2 only; function 1 belongs to the human row
    });

    it('updates a human row only when the run sets overwriteHumanValues', async () => {
        const order: string[] = [];
        const human = new Row({ ID: 'pjf-4', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Source: 'Manual' }, order, 'human');
        const h = harness([human]);
        await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider, overwriteHumanValues: true });
        expect(human.Saved).toBe(1);
        expect(human.Values.Source).toBe('Derived');
    });

    it('keeps stale pipeline rows when the mapping sets deleteStale: false', async () => {
        const stale = new Row({ ID: 'pjf-3', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000003', Sequence: 3, Source: 'Derived' }, [], 'stale');
        const h = harness([stale]);
        const keep: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], reconcile: { ...mapping.childRecords![0].reconcile!, deleteStale: false } }] };
        const out = await ApplyOutputMapping({ outputMapping: keep, result, record, contextUser: USER, provider: h.provider });
        expect(stale.Deleted).toBe(false);
        expect(out.deletedChildIDs).toBeUndefined();
    });

    it('refuses a parentField that is not a plain identifier before reading any row', async () => {
        const h = harness([]);
        const bad: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], parentField: "PersonID' OR 1=1 --" }] };
        await expect(ApplyOutputMapping({ outputMapping: bad, result, record, contextUser: USER, provider: h.provider }))
            .rejects.toThrow(/invalid parentField identifier/);
        expect(h.runView).not.toHaveBeenCalled();
    });

    it('fails (and rolls back) when the existing rows cannot be read, instead of inserting blind', async () => {
        const h = harness([]);
        h.runView.mockResolvedValue(viewResult(false, [], 'view read failed'));
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider }))
            .rejects.toThrow(/reading existing 'Person Job Functions' rows failed: view read failed/);
        expect(h.created).toHaveLength(0);
        expect(h.scope.Rollback).toHaveBeenCalledTimes(1);
    });

    it('rolls back and leaves the parent untouched when a child write fails', async () => {
        const h = harness([], { failChildSave: true });
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider }))
            .rejects.toThrow(/UQ_PersonJobFunction_Person_JobFunction/);
        expect(h.parent.Saved).toBe(0);
        expect(h.scope.Rollback).toHaveBeenCalledTimes(1);
        expect(h.scope.Commit).not.toHaveBeenCalled();
    });
});

describe('ApplyOutputMapping reconcile — answers', () => {
    const stalePipelineRow = (): Row => new Row({ ID: 'pjf-3', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000003', Sequence: 3, Source: 'Derived' }, [], 'stale');
    const humanRow = (): Row => new Row({ ID: 'pjf-5', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000005', Sequence: 5, Source: 'Manual' }, [], 'human');

    it('an explicit empty answer deletes the stale pipeline rows and keeps human rows', async () => {
        const stale = stalePipelineRow();
        const human = humanRow();
        const h = harness([stale, human]);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result: { ...result, Functions: [] }, record, contextUser: USER, provider: h.provider });
        expect(stale.Deleted).toBe(true);
        expect(human.Deleted).toBe(false);
        expect(out.deletedChildIDs).toEqual(['pjf-3']);
        expect(h.created).toHaveLength(0);
        expect(out.changed).toBe(true);
    });

    it.each([
        ['missing', { SeniorityLevel: result.SeniorityLevel }],
        ['null', { SeniorityLevel: result.SeniorityLevel, Functions: null }],
    ])('a %s answer changes no child row', async (_label, answer) => {
        const stale = stalePipelineRow();
        const h = harness([stale]);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result: answer, record, contextUser: USER, provider: h.provider });
        expect(stale.Deleted).toBe(false);
        expect(h.runView).not.toHaveBeenCalled();
        expect(h.created).toHaveLength(0);
        expect(out.deletedChildIDs).toBeUndefined();
    });
});

describe('ApplyOutputMapping reconcile — config and answer checks', () => {
    it('refuses an answer that proposes one key twice, before writing anything', async () => {
        const h = harness([]);
        const twice = { ...result, Functions: [result.Functions[0], { ...result.Functions[0], JobFunctionID: result.Functions[0].JobFunctionID.toLowerCase() }] };
        await expect(ApplyOutputMapping({ outputMapping: mapping, result: twice, record, contextUser: USER, provider: h.provider }))
            .rejects.toThrow(/proposes the reconcile key 'aaaaaaaa-0000-0000-0000-000000000001' more than once/);
        expect(h.created).toHaveLength(0);
        expect(h.scope.Rollback).toHaveBeenCalledTimes(1);
    });

    it('refuses a key field the map does not set', async () => {
        const h = harness([]);
        const bad: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], reconcile: { ...mapping.childRecords![0].reconcile!, keyFields: ['FunctionCode'] } }] };
        await expect(ApplyOutputMapping({ outputMapping: bad, result, record, contextUser: USER, provider: h.provider }))
            .rejects.toThrow(/reconcile key field\(s\) FunctionCode of 'Person Job Functions' are not set by its map/);
        expect(h.runView).not.toHaveBeenCalled();
    });

    it('refuses deleteStale without a source field (every row would count as the pipeline\'s), but allows it with deleteStale: false', async () => {
        const noSource = (deleteStale: boolean): OutputMappingConfig => ({ childRecords: [{ ...mapping.childRecords![0], reconcile: { keyFields: ['JobFunctionID'], deleteStale } }] });
        const h = harness([]);
        await expect(ApplyOutputMapping({ outputMapping: noSource(true), result, record, contextUser: USER, provider: h.provider }))
            .rejects.toThrow(/needs sourceField and derivedSourceValue/);
        const ok = harness([]);
        const out = await ApplyOutputMapping({ outputMapping: noSource(false), result, record, contextUser: USER, provider: ok.provider });
        expect(out.createdChildIDs).toHaveLength(2);
    });
});

describe('ApplyOutputMapping reconcile — several mappings', () => {
    it('reconciles alongside the legacy single childRecord, reporting its insert as createdChildID', async () => {
        const h = harness([]);
        const both: OutputMappingConfig = {
            childRecord: { entity: 'Person Notes', parentField: 'PersonID', map: { Note: 'static:classified' } },
            childRecords: mapping.childRecords,
        };
        const out = await ApplyOutputMapping({ outputMapping: both, result, record, contextUser: USER, provider: h.provider });
        expect(h.created.map((r) => r.Values.Note || r.Values.JobFunctionID)).toEqual(['classified', result.Functions[0].JobFunctionID, result.Functions[1].JobFunctionID]);
        expect(out.createdChildID).toBe('new-child0');
        expect(out.createdChildIDs).toEqual(['new-child0', 'new-child1', 'new-child2']);
    });

    it('reconciles two mappings independently, each against its own key', async () => {
        const h = harness([]);
        const two: OutputMappingConfig = { childRecords: [mapping.childRecords![0], { ...mapping.childRecords![0], fanOutRef: '$.Secondary' }] };
        const out = await ApplyOutputMapping({ outputMapping: two, result: { ...result, Secondary: [result.Functions[0]] }, record, contextUser: USER, provider: h.provider });
        expect(h.runView).toHaveBeenCalledTimes(2);
        expect(out.createdChildIDs).toHaveLength(3);
    });
});

describe('OutputMappingWriter.NormalizeKeyPart', () => {
    const text = field('Code', 'nvarchar');
    const uuid = PJF_FIELDS[2];

    it('ignores trailing whitespace and case (case-insensitive collation), keeps leading whitespace significant', () => {
        expect(OutputMappingWriter.NormalizeKeyPart(text, 'Sales  ')).toBe(OutputMappingWriter.NormalizeKeyPart(text, 'sales'));
        expect(OutputMappingWriter.NormalizeKeyPart(text, ' sales')).not.toBe(OutputMappingWriter.NormalizeKeyPart(text, 'sales'));
        expect(OutputMappingWriter.NormalizeKeyPart(text, null)).toBe('');
    });

    it('normalises a uniqueidentifier in either case', () => {
        expect(OutputMappingWriter.NormalizeKeyPart(uuid, 'AAAAAAAA-0000-0000-0000-000000000001')).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    });
});

describe('OutputMappingWriter.ValuesEqual — equality by field type', () => {
    const [, , nickname, reviewedAt] = PEOPLE_FIELDS;
    const [, , jobFunction, sequence, confidence] = PJF_FIELDS;

    it.each([
        ['text exactly (case counts)', nickname, 'bob', 'Bob', false],
        ['text exactly (empty is not null)', nickname, '', null, false],
        ['dates by instant', reviewedAt, new Date('2026-10-13T12:00:00Z'), '2026-10-13T14:00:00+02:00', true],
        ['decimals at the column scale (decimal(5,4): 0.12345 stores as 0.1235)', confidence, 0.1235, 0.12345, true],
        ['an int without scale rounding', sequence, 1, 1.00001, false],
        ['uniqueidentifiers case-insensitively', jobFunction, 'aaaaaaaa-0000-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-000000000001', true],
    ])('compares %s', (_what, f, stored, proposed, equal) => {
        expect(OutputMappingWriter.ValuesEqual(f, stored, proposed)).toBe(equal);
    });

    it('keeps a row whose stored decimal is the proposed one rounded to the column scale', async () => {
        const stored = new Row({ ID: 'pjf-1', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Confidence: 0.1235, Source: 'Derived' }, [], 'e1');
        const h = harness([stored]);
        const one = { ...result, Functions: [{ ...result.Functions[0], Confidence: 0.12345 }] };
        const out = await ApplyOutputMapping({ outputMapping: { childRecords: mapping.childRecords }, result: one, record, contextUser: USER, provider: h.provider });
        expect(stored.Saved).toBe(0);
        expect(out.unchangedChildIDs).toEqual(['pjf-1']);
        expect(out.changed).toBe(false);
    });
});

/**
 * The database provider double write-back runs on: a real `DatabaseProviderBase` (see `DatabaseProviderStub`), so it
 * passes write-back's `instanceof DatabaseProviderBase` checks as the real server provider does. Each double below
 * overrides only what write-back calls.
 */
class WriteBackTestProvider extends DatabaseProviderStub {
    /** A row this provider's `GetEntityObject` made (the base class's real factory path, see {@link TestRow}). */
    public RowCreated(_row: TestRow): void {}
    /** Loads a row's values by its key, as the database would. */
    public async LoadRow(_row: TestRow, _key: CompositeKey): Promise<boolean> { return true; }
    /** Saves a row, as the database would answer. */
    public async SaveRow(_row: TestRow): Promise<boolean> { return true; }
    /** A row's primary key. */
    public RowKey(row: TestRow): CompositeKey { return CompositeKey.FromKeyValuePair('ID', String(row.Values.ID)); }
}

/**
 * A real `BaseEntity` over a real `EntityInfo` whose field values live in a plain map: write-back reads and writes
 * config-named fields through Get/Set. Loads, saves and keys are answered by the provider it is bound to (a
 * {@link WriteBackTestProvider}), never by a database. Registered with the class factory for the entities below, so
 * the providers' real `GetEntityObject` makes it.
 */
class TestRow extends BaseEntity {
    public Values: Record<string, unknown> = {};
    public Saved = 0;
    public Deleted = false;
    /** The key the row was loaded by (empty for a new row). */
    public LoadedID = '';
    constructor(entity: EntityInfo, provider: IEntityDataProvider | null = null) {
        super(entity, provider);
        if (provider instanceof WriteBackTestProvider) {
            provider.RowCreated(this);
        }
    }
    /** The test provider the row is bound to. */
    protected get Owner(): WriteBackTestProvider | null {
        const provider = this.BoundProvider;
        return provider instanceof WriteBackTestProvider ? provider : null;
    }
    public override get PrimaryKey(): CompositeKey { return this.Owner?.RowKey(this) || CompositeKey.FromKeyValuePair('ID', String(this.Values.ID)); }
    public override get LatestResult(): BaseEntityResult { return new BaseEntityResult(false, 'UQ_PersonJobFunction_Person_JobFunction'); }
    public override Get(fieldName: string): unknown { return this.Values[fieldName]; }
    public override Set(fieldName: string, value: unknown): void { this.Values[fieldName] = value; }
    public override NewRecord(): boolean { return true; }
    public override async InnerLoad(key: CompositeKey): Promise<boolean> {
        this.LoadedID = String(key.KeyValuePairs[0].Value);
        return this.Owner ? this.Owner.LoadRow(this, key) : true;
    }
    public override async Save(): Promise<boolean> {
        this.Saved++;
        return this.Owner ? this.Owner.SaveRow(this) : true;
    }
    public override async Delete(): Promise<boolean> { this.Deleted = true; return true; }
}
for (const entityName of ['People', 'Person Job Functions']) {
    MJGlobal.Instance.ClassFactory.Register(BaseEntity, TestRow, entityName, 1000);
}

/** The fields an entity definition declares; `ID` is its primary key. */
interface PreviewEntity { Name: string; SchemaName?: string; BaseTable?: string; Fields: EntityFieldInfo[] }

/** A real `EntityInfo` from a definition: each field keeps its metadata (type, related entity and column, soft flag). */
function EntityOf(def: PreviewEntity): EntityInfo {
    return new EntityInfo({
        ID: `ENT-${def.Name}`, Name: def.Name, SchemaName: def.SchemaName || 'app', BaseTable: def.BaseTable || def.Name.replace(/\W/g, ''),
        Fields: def.Fields.map((f, i) => ({ ...f, Sequence: i + 1, Entity: def.Name, IsPrimaryKey: f.Name === 'ID' })),
    });
}

const AMBIENT_PEOPLE = EntityOf({ Name: 'People', Fields: PEOPLE_FIELDS });

/** A successful view result over the given rows. */
function rowsResult<R>(rows: R[]): RunViewResult<R> {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
}

/**
 * A provider double modelling MJ's ambient transaction: the transaction is a field of the provider INSTANCE — a nested
 * begin joins it as a savepoint, a nested rollback truncates the write log to its savepoint, the outermost commit makes
 * the log durable — and every statement run through an instance with an open transaction lands inside it. All
 * instances share one durable store (the database). `CreateIndependentInstance` mints a sibling with its own
 * transaction state, as `DatabaseProviderBase` does. Every save yields first, so concurrent writes interleave.
 */
class AmbientTransactionProvider extends WriteBackTestProvider {
    private log: string[] = [];
    /** Called when record B's failing save runs (B's transaction is open at that moment). */
    public OnFailingSave: () => void = () => undefined;
    /** Statements and transaction begins run through this instance. */
    public Calls = 0;
    public Released = false;
    private readonly childEntities = new Map<string, EntityInfo>();

    constructor(public readonly Durable: string[] = [], public readonly Minted: AmbientTransactionProvider[] = []) {
        super();
    }

    /** Each entity object write-back gets runs through this instance. */
    public override RowCreated(): void {
        this.Calls++;
    }

    /**
     * A row's save: record B's child write fails on the unique key; any other lands in this instance's open
     * transaction, or durably. Yields first, so concurrent writes interleave.
     */
    public override async SaveRow(row: TestRow): Promise<boolean> {
        await Promise.resolve();
        await Promise.resolve();
        const person = String(row.Values.PersonID || row.LoadedID);
        if (person === 'person-B') {
            this.OnFailingSave();
            return false;
        }
        this.Write(`${person}:${String(row.Values.JobFunctionID || 'SeniorityLevelID')}`);
        return true;
    }

    /** Labelled by its record, so the test can tell whose writes survived. */
    public override RowKey(row: TestRow): CompositeKey {
        return CompositeKey.FromKeyValuePair('ID', `${String(row.Values.PersonID || row.LoadedID)}:${String(row.Values.JobFunctionID || 'parent')}`);
    }

    /** No existing child rows. */
    public override async RunView<T>(): Promise<RunViewResult<T>> {
        this.Calls++;
        return rowsResult<T>([]);
    }

    public override async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.Calls++;
        const savepoint = this.log.length;
        this.Depth++;
        let settled = false;
        return {
            IsNested: this.Depth > 1,
            Commit: async () => {
                if (settled) return;
                settled = true;
                this.Depth--;
                if (this.Depth === 0) {
                    this.Durable.push(...this.log);
                    this.log = [];
                }
            },
            Rollback: async () => {
                if (settled) return;
                settled = true;
                this.Depth--;
                this.log.length = this.Depth === 0 ? 0 : savepoint;
            },
        };
    }

    /** Runs one statement through this instance: inside its open transaction, or durably when none is open. */
    public Write(label: string): void {
        (this.Depth > 0 ? this.log : this.Durable).push(label);
    }

    public override async CreateIndependentInstance(): Promise<DatabaseProviderBase> {
        const unit = new AmbientTransactionProvider(this.Durable, this.Minted);
        unit.OnFailingSave = () => this.OnFailingSave();
        this.Minted.push(unit);
        return unit;
    }

    public override async ReleaseIndependentInstance(): Promise<void> {
        this.Released = true;
    }

    public override EntityByID(): EntityInfo { return AMBIENT_PEOPLE; }
    public override EntityByName(n: string): EntityInfo {
        if (n === 'People') {
            return AMBIENT_PEOPLE;
        }
        const known = this.childEntities.get(n) || EntityOf({ Name: n, Fields: PJF_FIELDS });
        this.childEntities.set(n, known);
        return known;
    }
}

describe('ApplyOutputMapping transaction isolation', () => {
    const recordA: RecordRef = { EntityID: 'ENT-P', RecordID: 'person-A', Record: {} };
    const recordB: RecordRef = { EntityID: 'ENT-P', RecordID: 'person-B', Record: {} };
    const A_WRITES = ['person-A:AAAAAAAA-0000-0000-0000-000000000001', 'person-A:AAAAAAAA-0000-0000-0000-000000000002', 'person-A:SeniorityLevelID'];

    it('with two records in flight on one provider, B failing rolls back only B; A stays committed and succeeds', async () => {
        const shared = new AmbientTransactionProvider();
        const [a, b] = await Promise.allSettled([
            ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: shared }),
            ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: shared }),
        ]);
        expect(a.status).toBe('fulfilled');
        expect(b.status).toBe('rejected');
        expect(shared.Durable).toEqual(A_WRITES);
    });

    it('when the caller holds a transaction, joins it (no second instance) and the caller owns atomicity', async () => {
        const shared = new AmbientTransactionProvider();
        const caller = await shared.BeginEntityTransaction();
        shared.Write('caller:own-write');
        await ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: shared });
        expect(shared.Minted).toHaveLength(0);
        expect(shared.Durable).toEqual([]); // nothing durable until the caller commits
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: shared })).rejects.toThrow();
        await caller.Commit();
        // B rolled back to its savepoint only: the caller's write and A's joined writes commit with the caller.
        expect(shared.Durable).toEqual(['caller:own-write', ...A_WRITES]);
    });

    it('runs on its own instance when the open transaction belongs to another scope', async () => {
        const shared = new AmbientTransactionProvider();
        await shared.BeginEntityTransaction();
        shared.CallerIsMember = false; // a transaction another unit of work opened on the shared provider
        await ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: shared });
        expect(shared.Minted).toHaveLength(1);
        expect(shared.Durable).toEqual(A_WRITES);
    });
});

const uuidField = (Name: string, RelatedEntity?: string, extra: Partial<EntityFieldInfo> = {}): EntityFieldInfo =>
    Object.assign(new EntityFieldInfo({ Name, Type: 'uniqueidentifier', RelatedEntity: RelatedEntity || null }), extra);
const relatedEntity = (Name: string, BaseTable: string, keyType = 'uniqueidentifier', extraFields: EntityFieldInfo[] = []): PreviewEntity =>
    ({ Name, SchemaName: 'app', BaseTable, Fields: [field('ID', keyType), ...extraFields] });

/**
 * A database provider double for dry-run previews. Related rows live in `Tables` (base table → rows); a view of a
 * related entity returns the rows whose filtered column holds one of the `IN (...)` values; a view of the child entity
 * returns `ExistingChildren`.
 */
class PreviewDbProvider extends WriteBackTestProvider {
    public FailRead = false;
    public readonly Known: EntityInfo[];
    /** The processed record's stored values; each load of it gets a copy. */
    public RecordValues: Record<string, unknown> = { ID: 'person-1', SeniorityLevelID: null };
    /** The processed-record objects loaded, in order. */
    public readonly LoadedRecords: TestRow[] = [];
    public ExistingChildren: TestRow[] = [];
    /** The views read, and the entity objects loaded, in order. */
    public readonly ViewRuns: RunViewParams[] = [];
    public readonly Loads: string[] = [];

    constructor(defs: PreviewEntity[], public readonly Tables: Record<string, Array<Record<string, string>>>) {
        super();
        this.Known = defs.map(EntityOf);
    }

    /** The reads of related entities (every view but the child rows'). */
    public get RelatedReads(): RunViewParams[] {
        return this.ViewRuns.filter((p) => p.EntityName !== 'Person Job Functions');
    }

    /** An existing child row of the processed record. */
    public Child(values: Record<string, unknown>): TestRow {
        const row = new TestRow(this.Defined('Person Job Functions'));
        row.Values = { ...values };
        return row;
    }

    public override RowCreated(row: TestRow): void {
        this.Loads.push(row.EntityInfo.Name);
    }

    /** The processed record loads its stored values. */
    public override async LoadRow(row: TestRow): Promise<boolean> {
        row.Values = { ...this.RecordValues };
        this.LoadedRecords.push(row);
        return true;
    }

    public override EntityByID(): EntityInfo { return this.Defined('People'); }
    /** Undefined for an entity the fixture does not define, as the real metadata answers an unknown name. */
    public override EntityByName(n: string): EntityInfo | undefined { return this.Known.find((e) => e.Name === n); }

    /** An entity the fixture must define; a missing one is a broken test. */
    protected Defined(name: string): EntityInfo {
        const entity = this.EntityByName(name);
        if (!entity) {
            throw new Error(`PreviewDbProvider: entity '${name}' is not in this fixture`);
        }
        return entity;
    }

    /** The child rows, or a related entity's rows holding the filtered values. `as T[]`: the generic return every provider makes. */
    public override async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.ViewRuns.push(params);
        if (params.EntityName === 'Person Job Functions') {
            return rowsResult(this.ExistingChildren as T[]);
        }
        if (this.FailRead) {
            return { ...rowsResult<T>([]), Success: false, ErrorMessage: 'read failed' };
        }
        const [, column, list] = /^(\w+) IN \((.*)\)$/.exec(typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '') || [];
        const wanted = [...(list || '').matchAll(/'([^']*)'/g)].map(([, v]) => v.toLowerCase());
        const table = this.EntityByName(params.EntityName || '')?.BaseTable || '';
        const rows = (this.Tables[table] || []).filter((row) => wanted.includes(String(row[column]).toLowerCase()));
        return rowsResult(rows.map((row) => ({ [column]: row[column] })) as T[]);
    }
}

const JOB_FUNCTION_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const MISSING_ID = '00000000-0000-0000-0000-00000000C0DE';
const PJF = (fields: EntityFieldInfo[] = []): PreviewEntity => ({ Name: 'Person Job Functions', Fields: [field('ID', 'uniqueidentifier'),
    uuidField('JobFunctionID', 'Job Functions'), uuidField('PersonID', 'People'), field('Sequence', 'int'), field('Source', 'nvarchar'), ...fields] });
const PEOPLE: PreviewEntity = { Name: 'People', SchemaName: 'app', BaseTable: 'Person', Fields: [field('ID', 'uniqueidentifier'), uuidField('SeniorityLevelID', 'Seniority Levels')] };
const JOB_FUNCTIONS = relatedEntity('Job Functions', 'JobFunction');
const LEVELS = relatedEntity('Seniority Levels', 'SeniorityLevel');
const childOnly: OutputMappingConfig = { childRecords: mapping.childRecords };
/** One proposed job function; the value is deliberately any shape, since the preview must judge non-key shapes too. */
const oneFunction = (JobFunctionID: string | number | Record<string, string>) => ({ Functions: [{ JobFunctionID, Sequence: 1, Confidence: 0.9 }] });
/** The write-back payload of a processed record. */
const writeBackOf = (r: { ResultPayload?: unknown }): { PreviewErrors?: string[] } =>
    (r.ResultPayload as { writeBack: { PreviewErrors?: string[] } }).writeBack; // the processor's payload shape at this seam

describe('dry-run preview reports what the real write would fail on', () => {
    it('names a child value that does not exist in its related entity, reading each related entity once, and writes nothing', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], { JobFunction: [{ ID: JOB_FUNCTION_ID }] });
        const bad = { ...result, Functions: [
            { JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Confidence: 0.9 },
            { JobFunctionID: MISSING_ID, Sequence: 2, Confidence: 0.9 },
        ] };
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: bad, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.dryRun).toBe(true);
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.JobFunctionID' = '${MISSING_ID}' does not exist in 'Job Functions' (the real write fails on its foreign key)`]);
        expect(d.RelatedReads).toEqual([expect.objectContaining({ EntityName: 'Job Functions', Fields: ['ID'], ResultType: 'simple' })]);
        expect(d.Loads).toHaveLength(0);
    });

    it('reports a reconcile key proposed twice', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], { JobFunction: [{ ID: JOB_FUNCTION_ID }] });
        const twice = { ...result, Functions: [
            { JobFunctionID: JOB_FUNCTION_ID, Sequence: 1, Confidence: 0.9 },
            { JobFunctionID: JOB_FUNCTION_ID.toLowerCase(), Sequence: 2, Confidence: 0.5 },
        ] };
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: twice, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors?.join(' ')).toContain('twice');
    });

    it('fails a dry-run record whose real write would fail (WriteBackProcessor)', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], {});
        const inner = { ProcessRecord: async () => ({ Status: 'Succeeded' as const, ResultPayload: { Functions: [{ JobFunctionID: MISSING_ID, Sequence: 1 }] } }) };
        const wrapped = new WriteBackProcessor(inner, childOnly, true);
        const r = await wrapped.ProcessRecord(record, { contextUser: USER, provider: d, DryRun: true });
        expect(r.Status).toBe('Failed');
        expect(r.ErrorMessage).toContain('Dry run: the real write would fail:');
        expect(r.ErrorMessage).toContain(MISSING_ID);
    });

    it('fails the record of a real-run processor on a dry-run context whose preview found a failing write', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], {});
        const inner = { ProcessRecord: async () => ({ Status: 'Succeeded' as const, ResultPayload: { Functions: [{ JobFunctionID: MISSING_ID, Sequence: 1 }] } }) };
        const r = await new WriteBackProcessor(inner, childOnly, false).ProcessRecord(record, { contextUser: USER, provider: d, DryRun: true });
        expect(r.Status).toBe('Failed');
        expect(r.ErrorMessage).toContain(MISSING_ID);
        expect(r.DryRun).toBe(true);
        expect(r.Outcome).toBeUndefined();
        expect(d.LoadedRecords.every((row) => row.Saved === 0)).toBe(true);
    });

    it('reports a passing preview of a dry-run context as a dry run: Succeeded, DryRun, no Outcome', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], { JobFunction: [{ ID: JOB_FUNCTION_ID }] });
        const inner = { ProcessRecord: async () => ({ Status: 'Succeeded' as const, Outcome: 'Upserted' as const, ResultPayload: { Functions: [{ JobFunctionID: JOB_FUNCTION_ID, Sequence: 1 }] } }) };
        const r = await new WriteBackProcessor(inner, childOnly, false).ProcessRecord(record, { contextUser: USER, provider: d, DryRun: true });
        expect(r).toMatchObject({ Status: 'Succeeded', DryRun: true });
        expect(r.Outcome).toBeUndefined();
    });
});

describe('dry-run preview — the other checks a real write would fail', () => {
    it('reports nothing, and the dry-run record succeeds, when every written value exists', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS, LEVELS], { JobFunction: [{ ID: JOB_FUNCTION_ID }], SeniorityLevel: [{ ID: result.SeniorityLevel }] });
        const inner = { ProcessRecord: async () => ({ Status: 'Succeeded' as const, ResultPayload: { ...result, Functions: [result.Functions[0]] } }) };
        const r = await new WriteBackProcessor(inner, mapping, true).ProcessRecord(record, { contextUser: USER, provider: d });
        expect(r.Status).toBe('Succeeded');
        expect(writeBackOf(r).PreviewErrors).toBeUndefined();
        expect(d.RelatedReads).toHaveLength(2); // one read per related entity: job functions, seniority levels
        expect(d.LoadedRecords.every((r) => r.Saved === 0)).toBe(true);
    });

    it('names a record field key that does not exist in its related entity', async () => {
        const d = new PreviewDbProvider([PEOPLE, LEVELS], {});
        const out = await ApplyOutputMapping({ outputMapping: { fields: mapping.fields }, result, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'People.SeniorityLevelID' = '${result.SeniorityLevel}' does not exist in 'Seniority Levels' (the real write fails on its foreign key)`]);
    });

    it('reports a value that is not a key of the uniqueidentifier column without reading it', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], {});
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction('Sales'), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.JobFunctionID' = 'Sales' is not a valid key of 'Job Functions' (the real write fails converting it)`]);
        expect(d.RelatedReads).toHaveLength(0);
    });

    it('reports a value that is not a string or number', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], {});
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction({ Name: 'Sales' }), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.JobFunctionID' holds a value of type object, which cannot be a key of 'Job Functions'`]);
    });

    it('reports a failed read instead of passing the values', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], {});
        d.FailRead = true;
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction(JOB_FUNCTION_ID), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`checking 'Job Functions' for the written values failed: read failed`]);
    });

    it('reports a child entity that is not in metadata', async () => {
        const d = new PreviewDbProvider([PEOPLE, JOB_FUNCTIONS], {});
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction(JOB_FUNCTION_ID), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`child entity 'Person Job Functions' is not in metadata`]);
    });

    it('refuses a reconcile config the real write refuses, even for an empty answer', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], {});
        const noSource: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], reconcile: { keyFields: ['JobFunctionID'] } }] };
        await expect(ApplyOutputMapping({ outputMapping: noSource, result: { Functions: [] }, record, contextUser: USER, provider: d, dryRun: true }))
            .rejects.toThrow(/needs sourceField and derivedSourceValue/);
    });

    it('reports a taggedEntityName missing from metadata, which the real write refuses', async () => {
        const resolve = vi.spyOn(TagEngine.Instance, 'ResolveTag').mockResolvedValue(null);
        const config = vi.spyOn(TagEngine.Instance, 'Config').mockResolvedValue(undefined);
        const d = new PreviewDbProvider([PEOPLE], {});
        const out = await ApplyOutputMapping({ outputMapping: { tags: [{ ref: '$.tag', rootTagId: 'root-1', taggedEntityName: 'No Such Entity' }] },
            result: { tag: 'Sales' }, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`taggedEntityName 'No Such Entity' not found in metadata`]);
        resolve.mockRestore();
        config.mockRestore();
    });
});

describe('dry-run preview checks what the database constraint checks', () => {
    it('does not check a soft foreign key (no database constraint)', async () => {
        const soft = { ...PJF(), Fields: PJF().Fields.map((f) => (f.Name === 'JobFunctionID' ? uuidField('JobFunctionID', 'Job Functions', { IsSoftForeignKey: true }) : f)) };
        const d = new PreviewDbProvider([soft, PEOPLE, JOB_FUNCTIONS], {});
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction(MISSING_ID), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        expect(d.RelatedReads).toHaveLength(0);
    });

    it('does not check a relation only a fieldLookups entry names', async () => {
        const plainPeople: PreviewEntity = { ...PEOPLE, Fields: [field('ID', 'uniqueidentifier'), field('SeniorityLevelID', 'uniqueidentifier')] };
        const d = new PreviewDbProvider([plainPeople, LEVELS], {});
        const out = await ApplyOutputMapping({ outputMapping: { fields: mapping.fields, fieldLookups: { SeniorityLevelID: { relatedEntity: 'Seniority Levels' } } },
            result, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        expect(d.RelatedReads).toHaveLength(0); // no constraint to check
        expect(d.LoadedRecords.every((r) => r.Saved === 0)).toBe(true); // the record is loaded to decide its changes, never saved
    });

    it('reads the related column the foreign key names, and finds a value in any case', async () => {
        const byRef = { ...PJF(), Fields: PJF().Fields.map((f) => (f.Name === 'JobFunctionID'
            ? Object.assign(uuidField('JobFunctionID', 'Job Functions'), { RelatedEntityFieldName: 'RefID' }) : f)) };
        const functions = relatedEntity('Job Functions', 'JobFunction', 'uniqueidentifier', [field('RefID', 'uniqueidentifier')]);
        const d = new PreviewDbProvider([byRef, PEOPLE, functions], { JobFunction: [{ ID: MISSING_ID, RefID: JOB_FUNCTION_ID }] });
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction(JOB_FUNCTION_ID.toLowerCase()), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        expect(d.RelatedReads).toEqual([expect.objectContaining({ ExtraFilter: `RefID IN ('${JOB_FUNCTION_ID.toLowerCase()}')`, Fields: ['RefID'] })]);
    });
});

describe('dry-run preview checks only what the real write writes', () => {
    it('does not check a field whose human value the run keeps, and records nothing', async () => {
        const d = new PreviewDbProvider([PEOPLE, LEVELS], {});
        d.RecordValues.SeniorityLevelID = '22222222-2222-2222-2222-222222222222';
        const guard: HumanValueGuard = { IsHumanOwned: vi.fn().mockResolvedValue(true), RecordPreserved: vi.fn(), RetireHumanValue: vi.fn() };
        const out = await ApplyOutputMapping({ outputMapping: { fields: mapping.fields }, result: { SeniorityLevel: MISSING_ID }, record, contextUser: USER,
            provider: d, dryRun: true, humanGuard: guard });
        expect(out.PreviewErrors).toBeUndefined();
        expect(guard.IsHumanOwned).toHaveBeenCalledTimes(1);
        expect(guard.RecordPreserved).not.toHaveBeenCalled();
        expect(out.preservedHumanFields).toBeUndefined();
    });

    it('does not check a field that already holds the value', async () => {
        const d = new PreviewDbProvider([PEOPLE, LEVELS], {});
        d.RecordValues.SeniorityLevelID = MISSING_ID.toLowerCase();
        const out = await ApplyOutputMapping({ outputMapping: { fields: mapping.fields }, result: { SeniorityLevel: MISSING_ID }, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        expect(d.RelatedReads).toHaveLength(0);
    });

    it('checks an inserted row in full, an updated row by its differing fields, and a kept human row not at all', async () => {
        const levelChild = PJF([uuidField('LevelID', 'Seniority Levels')]);
        const d = new PreviewDbProvider([levelChild, PEOPLE, JOB_FUNCTIONS, LEVELS], {
            JobFunction: [{ ID: 'AAAAAAAA-0000-0000-0000-000000000001' }, { ID: 'AAAAAAAA-0000-0000-0000-000000000002' }, { ID: 'AAAAAAAA-0000-0000-0000-000000000003' }],
            SeniorityLevel: [],
        });
        const kept = '33333333-3333-3333-3333-333333333333';
        d.ExistingChildren = [
            d.Child({ ID: 'pjf-1', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Source: 'Manual', LevelID: kept }),
            d.Child({ ID: 'pjf-2', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000002', Sequence: 1, Source: 'Derived', LevelID: kept }),
        ];
        const withLevel: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], map: { JobFunctionID: '$.JobFunctionID', Sequence: '$.Sequence', Source: 'static:Derived', LevelID: '$.LevelID' } }] };
        const answer = { Functions: [
            { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000001', Sequence: 1, LevelID: '44444444-4444-4444-4444-444444444444' }, // human row kept: nothing written
            { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000002', Sequence: 2, LevelID: kept }, // update writes Sequence only
            { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000003', Sequence: 3, LevelID: '55555555-5555-5555-5555-555555555555' }, // insert writes every value
        ] };
        const out = await ApplyOutputMapping({ outputMapping: withLevel, result: answer, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.LevelID' = '55555555-5555-5555-5555-555555555555' does not exist in 'Seniority Levels' (the real write fails on its foreign key)`]);
        expect(d.ExistingChildren.every((r) => r.Saved === 0)).toBe(true);
    });
});
