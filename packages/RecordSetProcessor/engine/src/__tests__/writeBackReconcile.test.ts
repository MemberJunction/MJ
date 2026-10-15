import { describe, it, expect, vi } from 'vitest';
import {
    BaseEntity, BaseEntityResult, CompositeKey, DatabaseProviderBase, EntityFieldInfo, EntityInfo, IMetadataProvider, RunViewResult, UserInfo,
    type DatasetResultType, type DatasetStatusResultType, type DeleteSQLResult, type EntityRecordNameResult, type EntityTransactionScope,
    type IEntityDataProvider, type ILocalStorageProvider, type PotentialDuplicateResponse, type ProviderType, type RecordDependency, type RecordMergeResult,
    type RunQueryResult, type RunViewParams, type SaveSQLResult, type ScoredCandidate, type TransactionGroupBase,
} from '@memberjunction/core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';
import { MJGlobal } from '@memberjunction/global';
import { TagEngine } from '@memberjunction/tag-engine';
import type { MJTagEntity, MJTaggedItemEntity } from '@memberjunction/core-entities';
import { ApplyOutputMapping, OutputMappingWriter, type HumanValueGuard, type OutputMappingConfig } from '../writeBack';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';

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
    const confidence = PJF_FIELDS[4];
    const jobFunction = PJF_FIELDS[2];
    const sequence = PJF_FIELDS[3];

    it('compares text exactly: case, whitespace and empty-vs-null all count', () => {
        expect(OutputMappingWriter.ValuesEqual(nickname, 'bob', 'Bob')).toBe(false);
        expect(OutputMappingWriter.ValuesEqual(nickname, 'bob', ' bob')).toBe(false);
        expect(OutputMappingWriter.ValuesEqual(nickname, '', null)).toBe(false);
        expect(OutputMappingWriter.ValuesEqual(nickname, 'bob', 'bob')).toBe(true);
        expect(OutputMappingWriter.ValuesEqual(nickname, null, undefined)).toBe(true);
    });

    it('compares dates by instant', () => {
        expect(OutputMappingWriter.ValuesEqual(reviewedAt, new Date('2026-10-13T12:00:00Z'), '2026-10-13T14:00:00+02:00')).toBe(true);
        expect(OutputMappingWriter.ValuesEqual(reviewedAt, new Date('2026-10-13T12:00:00Z'), '2026-10-13T12:00:01Z')).toBe(false);
    });

    it('compares decimals at the column scale (decimal(5,4): 0.12345 stores as 0.1235)', () => {
        expect(OutputMappingWriter.ValuesEqual(confidence, 0.1235, 0.12345)).toBe(true);
        expect(OutputMappingWriter.ValuesEqual(confidence, 0.9, 0.90001)).toBe(true);
        expect(OutputMappingWriter.ValuesEqual(confidence, 0.1235, 0.1237)).toBe(false);
        expect(OutputMappingWriter.ValuesEqual(sequence, 1, 1.00001)).toBe(false); // int: no scale rounding
    });

    it('compares uniqueidentifiers case-insensitively', () => {
        expect(OutputMappingWriter.ValuesEqual(jobFunction, 'aaaaaaaa-0000-0000-0000-000000000001', 'AAAAAAAA-0000-0000-0000-000000000001')).toBe(true);
        expect(OutputMappingWriter.ValuesEqual(jobFunction, 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002')).toBe(false);
    });

    it('writes a case-only change to a text field', async () => {
        const h = harness([]);
        h.parent.Values.Nickname = 'bob';
        const out = await ApplyOutputMapping({ outputMapping: { fields: { Nickname: '$.Nickname' } }, result: { Nickname: 'Bob' }, record, contextUser: USER, provider: h.provider });
        expect(h.parent.Saved).toBe(1);
        expect(out.updatedRecord).toBe(true);
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

/** A member of the provider base that write-back never calls. */
function notUsed(): Error {
    return new Error('not used by write-back');
}

/**
 * A real `DatabaseProviderBase` whose abstract members — none of which write-back calls — throw. Each double below
 * extends it and overrides only what write-back does call, so it passes write-back's `instanceof DatabaseProviderBase`
 * checks as the real server provider does, with no cast.
 */
class WriteBackTestProvider extends DatabaseProviderBase {
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): null { return null; }
    public get InstanceConnectionString(): string { return ''; }
    public get LocalStorageProvider(): ILocalStorageProvider { throw notUsed(); }
    protected get AllowRefresh(): boolean { return false; }
    protected get Metadata(): IMetadataProvider { return this; }
    protected async InternalGetEntityRecordName(): Promise<string> { throw notUsed(); }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { throw notUsed(); }
    public async GetRecordFavoriteStatus(): Promise<boolean> { throw notUsed(); }
    public async SetRecordFavoriteStatus(): Promise<void> { throw notUsed(); }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> { throw notUsed(); }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { throw notUsed(); }
    protected async InternalRunQuery(): Promise<RunQueryResult> { throw notUsed(); }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { throw notUsed(); }
    protected async searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> { throw notUsed(); }
    protected async GetCurrentUser(): Promise<UserInfo> { throw notUsed(); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { throw notUsed(); }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { throw notUsed(); }
    public async MergeRecords(): Promise<RecordMergeResult> { throw notUsed(); }
    public async GetDatasetByName(): Promise<DatasetResultType> { throw notUsed(); }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { throw notUsed(); }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { throw notUsed(); }
    public async ExecuteSQL<T>(_query: string): Promise<Array<T>> { throw notUsed(); }
    public async BeginTransaction(): Promise<void> { throw notUsed(); }
    public async CommitTransaction(): Promise<void> { throw notUsed(); }
    public async RollbackTransaction(): Promise<void> { throw notUsed(); }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, name: string): string { return `[${schema}].[${name}]`; }
    protected async InternalExecuteQueryFromSpec(): Promise<RunQueryResult> { throw notUsed(); }
    protected BuildChildDiscoverySQL(): string { throw notUsed(); }
    protected BuildHardLinkDependencySQL(): string { throw notUsed(); }
    protected BuildSoftLinkDependencySQL(): string { throw notUsed(); }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { throw notUsed(); }
    protected GenerateDeleteSQL(): DeleteSQLResult { throw notUsed(); }
    protected get UUIDFunctionPattern(): RegExp { return /^newid\(\)$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^getdate\(\)$/i; }
    protected async CheckRecordRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckCreateRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckUpdateRLSPostImage(): Promise<boolean> { throw notUsed(); }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { throw notUsed(); }
    protected BuildSiblingRecordChangeSQL(): string { throw notUsed(); }

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
    private depth = 0;
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

    /** As `DatabaseProviderBase.TransactionDepth`: 0 = no open transaction on this instance. */
    protected override get CurrentTransactionDepth(): number {
        return this.depth;
    }

    public override async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.Calls++;
        const savepoint = this.log.length;
        this.depth++;
        let settled = false;
        return {
            IsNested: this.depth > 1,
            Commit: async () => {
                if (settled) return;
                settled = true;
                this.depth--;
                if (this.depth === 0) {
                    this.Durable.push(...this.log);
                    this.log = [];
                }
            },
            Rollback: async () => {
                if (settled) return;
                settled = true;
                this.depth--;
                this.log.length = this.depth === 0 ? 0 : savepoint;
            },
        };
    }

    /** Runs one statement through this instance: inside its open transaction, or durably when none is open. */
    public Write(label: string): void {
        (this.depth > 0 ? this.log : this.Durable).push(label);
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

    it('a tracker write on the shared provider while a write-back is open survives that write-back rolling back', async () => {
        const shared = new AmbientTransactionProvider();
        // The run tracker records record A's detail row through the shared provider while record B's write-back is open.
        shared.OnFailingSave = () => shared.Write('ProcessRunDetail:person-A');
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: shared }))
            .rejects.toThrow(/UQ_PersonJobFunction_Person_JobFunction/);
        expect(shared.Durable).toEqual(['ProcessRunDetail:person-A']);
    });

    it('runs a provider that is not a DatabaseProviderBase (a client provider) on itself', async () => {
        const h = harness([]);
        await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider });
        expect(h.provider instanceof DatabaseProviderBase).toBe(false);
        expect(h.scope.Commit).toHaveBeenCalledTimes(1); // the transaction ran on the caller's provider
    });

    it('with no transaction open on the caller\'s provider, runs on a minted instance and commits it on its own', async () => {
        const shared = new AmbientTransactionProvider();
        await ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: shared });
        expect(shared.Minted).toHaveLength(1);
        expect(shared.Calls).toBe(0);
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

    it('fails loudly when a database provider cannot mint an instance, running nothing on the shared provider', async () => {
        // A DatabaseProviderBase subclass that never implemented CreateIndependentInstance: it inherits the base's, which throws.
        class NoMintProvider extends AmbientTransactionProvider {}
        Object.defineProperty(NoMintProvider.prototype, 'CreateIndependentInstance', { value: DatabaseProviderBase.prototype.CreateIndependentInstance });
        const shared = new NoMintProvider();
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: shared }))
            .rejects.toThrow(/NoMintProvider does not implement CreateIndependentInstance/);
        expect(shared.Calls).toBe(0);
        expect(shared.Durable).toEqual([]);
    });

    it('writes on a minted instance and releases it, on success and on failure', async () => {
        const shared = new AmbientTransactionProvider();
        await ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: shared });
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: shared })).rejects.toThrow();
        expect(shared.Minted).toHaveLength(2);
        expect(shared.Minted.every((m) => m.Released)).toBe(true);
        expect(shared.Released).toBe(false);
    });
});

const uuidField = (Name: string, RelatedEntity?: string, extra: Partial<EntityFieldInfo> = {}): EntityFieldInfo =>
    Object.assign(new EntityFieldInfo({ Name, Type: 'uniqueidentifier', RelatedEntity: RelatedEntity || null }), extra);
const relatedEntity = (Name: string, BaseTable: string, keyType = 'uniqueidentifier', extraFields: EntityFieldInfo[] = []): PreviewEntity =>
    ({ Name, SchemaName: 'app', BaseTable, Fields: [field('ID', keyType), ...extraFields] });

/** The SQL Server conversion of a sent text to a column type, as `TRY_CONVERT` does it (null: does not convert). */
function TryConvertLikeSqlServer(type: string, text: string): string | null {
    if (type === 'uniqueidentifier') {
        // A UUID, optionally in braces, at the start; leading whitespace fails and anything after it is ignored.
        const m = /^(?:\{([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\}|([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))/i.exec(text);
        return m ? (m[1] || m[2]).toLowerCase() : null;
    }
    if (type === 'int') {
        const m = /^ *([+-]?)(\d*) *$/.exec(text); // spaces, optional sign, optional digits (none is 0)
        return m ? String(Number(`${m[1]}${m[2] || '0'}`)) : null;
    }
    if (type === 'date') {
        const t = text.trim(); // ISO yyyy-mm-dd, a real calendar day
        const day = new Date(`${t}T00:00:00Z`);
        return /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(day.getTime()) && day.toISOString().startsWith(t) ? t : null;
    }
    const decimal = /^decimal\((\d+), (\d+)\)$/.exec(type);
    if (decimal) {
        const n = Number(text.trim());
        const integerDigits = Number(decimal[1]) - Number(decimal[2]);
        return text.trim() !== '' && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(text.trim()) && Math.abs(n) < 10 ** integerDigits ? n.toFixed(Number(decimal[2])) : null;
    }
    return text; // character types are compared as sent
}

/**
 * A database provider double for dry-run previews. Related rows live in `Tables` (base table → rows); its
 * `ExecuteSQL` answers the preview's judgement read from them for every user, as a database constraint sees every
 * row: it converts each sent value as `TRY_CONVERT` would, drops characters outside the code page from a literal
 * without the `N` prefix, and compares case-insensitively unless the column is in `CaseSensitiveColumns`. `RunView`
 * serves only the existing child rows: a user-filtered read of a related entity returns nothing, so a preview that read
 * related rows through it would report every value missing.
 */
class PreviewDbProvider extends WriteBackTestProvider {
    public FailRead = false;
    public readonly Known: EntityInfo[];
    /** The processed record's stored values; each load of it gets a copy. */
    public RecordValues: Record<string, unknown> = { ID: 'person-1', SeniorityLevelID: null };
    /** The processed-record objects loaded, in order. */
    public readonly LoadedRecords: TestRow[] = [];
    public ExistingChildren: TestRow[] = [];
    /** Columns compared case-sensitively (a `_CS_` collation); every other column compares as `_CI_` does. */
    public CaseSensitiveColumns = new Set<string>();
    /** The SQL statements run, the views read and the entity objects loaded, in order. */
    public readonly SqlRuns: string[] = [];
    public readonly ViewRuns: RunViewParams[] = [];
    /** The entity objects write-back got from this provider. */
    public readonly Loads: string[] = [];

    constructor(defs: PreviewEntity[], public readonly Tables: Record<string, Array<Record<string, string>>>) {
        super();
        this.Known = defs.map(EntityOf);
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

    /** The judgement read, answered from `Tables`. `as T[]` is the generic return every provider implementation makes. */
    public override async ExecuteSQL<T>(query: string): Promise<Array<T>> {
        this.SqlRuns.push(query);
        return this.Judge(query) as T[];
    }

    /** The processed record's existing child rows; every other view is empty (a user-filtered read). */
    public override async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.ViewRuns.push(params);
        return params.EntityName === 'Person Job Functions' ? rowsResult(this.ExistingChildren as T[]) : rowsResult<T>([]);
    }

    /** Answers the judgement read the way SQL Server does (see the class comment). */
    protected Judge(sql: string): Array<{ Value: string; Converts: number; Found: number }> {
        if (this.FailRead) {
            throw new Error('read failed');
        }
        const [, convertTo, table, column, list] = /^SELECT \[Sent\]\.\[Value\], CASE WHEN (?:TRY_CONVERT\(([^,]+(?:, \d+\))?), )?\[Sent\]\.\[Value\]\)? IS NULL THEN 0 ELSE 1 END AS \[Converts\], CASE WHEN EXISTS \(SELECT 1 FROM \[app\]\.\[(\w+)\] WHERE \[(\w+)\] = .*? THEN 1 ELSE 0 END AS \[Found\] FROM \(VALUES (.*)\) AS \[Sent\]\(\[Value\]\)$/.exec(sql) || [];
        const sent = [...(list || '').matchAll(/\((N?)'((?:[^']|'')*)'\)/g)].map(([, n, text]) => {
            const value = text.replace(/''/g, "'");
            return n === 'N' ? value : value.replace(/[^\x00-\xff]/g, '?'); // a plain literal loses what the code page lacks
        });
        const cs = this.CaseSensitiveColumns.has(column);
        const typeOf = (text: string): string | null => (convertTo ? TryConvertLikeSqlServer(convertTo, text) : text);
        const same = (stored: string, value: string): boolean => (cs ? stored.trimEnd() === value.trimEnd() : stored.trimEnd().toLowerCase() === value.trimEnd().toLowerCase());
        return sent.map((value) => {
            const converted = typeOf(value);
            const found = converted !== null && (this.Tables[table] || []).some((row) => { const stored = typeOf(row[column]); return stored !== null && same(stored, converted); });
            return { Value: value, Converts: converted === null ? 0 : 1, Found: found ? 1 : 0 };
        });
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
        expect(out.PreviewErrors).toHaveLength(1);
        expect(out.PreviewErrors?.[0]).toContain(MISSING_ID);
        expect(d.SqlRuns).toHaveLength(1);
        expect(d.ViewRuns).toHaveLength(1); // the existing child rows, read as the real write reads them
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
        expect(d.SqlRuns).toHaveLength(2); // one read per related entity: job functions, seniority levels
        expect(d.LoadedRecords.every((r) => r.Saved === 0)).toBe(true);
    });

    it('names a record field key that does not exist in its related entity', async () => {
        const d = new PreviewDbProvider([PEOPLE, LEVELS], {});
        const out = await ApplyOutputMapping({ outputMapping: { fields: mapping.fields }, result, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'People.SeniorityLevelID' = '${result.SeniorityLevel}' does not exist in 'Seniority Levels' (the real write fails on its foreign key)`]);
    });

    it('reports a value the uniqueidentifier key does not convert, judged by the database in the same read', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], {});
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction('Sales'), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.JobFunctionID' = 'Sales' is not a valid uniqueidentifier value for 'Job Functions.ID' (the real write fails converting it)`]);
        expect(d.SqlRuns).toHaveLength(1);
        expect(d.SqlRuns[0]).toContain('TRY_CONVERT(uniqueidentifier, [Sent].[Value])');
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
        expect(d.SqlRuns).toHaveLength(0);
    });

    it('does not check a relation only a fieldLookups entry names', async () => {
        const plainPeople: PreviewEntity = { ...PEOPLE, Fields: [field('ID', 'uniqueidentifier'), field('SeniorityLevelID', 'uniqueidentifier')] };
        const d = new PreviewDbProvider([plainPeople, LEVELS], {});
        const out = await ApplyOutputMapping({ outputMapping: { fields: mapping.fields, fieldLookups: { SeniorityLevelID: { relatedEntity: 'Seniority Levels' } } },
            result, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        expect(d.SqlRuns).toHaveLength(0); // no constraint to check
        expect(d.LoadedRecords.every((r) => r.Saved === 0)).toBe(true); // the record is loaded to decide its changes, never saved
    });

    it('compares on the related column the foreign key names, read from the base table without user filtering', async () => {
        const byCode = { ...PJF(), Fields: PJF().Fields.map((f) => (f.Name === 'JobFunctionID'
            ? Object.assign(new EntityFieldInfo({ Name: 'JobFunctionID', Type: 'nvarchar', RelatedEntity: 'Job Functions' }), { RelatedEntityFieldName: 'Code' }) : f)) };
        const functions = relatedEntity('Job Functions', 'JobFunction', 'uniqueidentifier', [field('Code', 'nvarchar')]);
        const d = new PreviewDbProvider([byCode, PEOPLE, functions], { JobFunction: [{ ID: JOB_FUNCTION_ID, Code: 'SALES' }] });
        const keyByCode: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], reconcile: { ...mapping.childRecords![0].reconcile!, keyFields: ['JobFunctionID'] } }] };
        const out = await ApplyOutputMapping({ outputMapping: keyByCode, result: oneFunction('sales  '), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        // A character column compares the text as sent: converting it would silently truncate.
        expect(d.SqlRuns[0]).toBe('SELECT [Sent].[Value], CASE WHEN [Sent].[Value] IS NULL THEN 0 ELSE 1 END AS [Converts], '
            + 'CASE WHEN EXISTS (SELECT 1 FROM [app].[JobFunction] WHERE [Code] = [Sent].[Value]) THEN 1 ELSE 0 END AS [Found] '
            + "FROM (VALUES ('sales  ')) AS [Sent]([Value])");
        expect(d.ViewRuns.map((p) => p.EntityName)).toEqual(['Person Job Functions']);
    });

    it('reports a value that cannot convert to an integer key, and still checks the others', async () => {
        const intChild = { ...PJF(), Fields: [...PJF().Fields, Object.assign(field('RegionID', 'int'), { RelatedEntity: 'Regions' })] };
        const regions = relatedEntity('Regions', 'Region', 'int');
        const d = new PreviewDbProvider([intChild, PEOPLE, JOB_FUNCTIONS, regions], { JobFunction: [{ ID: JOB_FUNCTION_ID }], Region: [{ ID: '7' }] });
        const withRegion: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], map: { ...mapping.childRecords![0].map, RegionID: '$.RegionID' } }] };
        const answer = { Functions: [{ JobFunctionID: JOB_FUNCTION_ID, Sequence: 1, RegionID: 'abc' },
            { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000002', Sequence: 2, RegionID: ' 7 ' }] };
        d.Tables.JobFunction.push({ ID: 'AAAAAAAA-0000-0000-0000-000000000002' });
        const out = await ApplyOutputMapping({ outputMapping: withRegion, result: answer, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.RegionID' = 'abc' is not a valid int value for 'Regions.ID' (the real write fails converting it)`]);
        const regionRead = d.SqlRuns.find((sql) => sql.includes('[app].[Region]')) || '';
        expect(regionRead).toContain(`WHERE [ID] = TRY_CONVERT(int, [Sent].[Value])`);
        expect(regionRead).toContain(`(VALUES ('abc'), (' 7 '))`); // sent as written, in one read
    });

    it('reports a decimal or date key value that does not convert, and still checks the others', async () => {
        const rateKey = new EntityFieldInfo({ Name: 'ID', Type: 'decimal', Precision: 5, Scale: 4 });
        const rates: PreviewEntity = { Name: 'Rates', BaseTable: 'Rate', Fields: [rateKey] };
        const days: PreviewEntity = relatedEntity('Days', 'Day', 'date');
        const child = { ...PJF(), Fields: [...PJF().Fields, new EntityFieldInfo({ Name: 'RateID', Type: 'decimal', Precision: 5, Scale: 4, RelatedEntity: 'Rates' }),
            new EntityFieldInfo({ Name: 'DayID', Type: 'date', RelatedEntity: 'Days' })] };
        const d = new PreviewDbProvider([child, PEOPLE, JOB_FUNCTIONS, rates, days], { JobFunction: [{ ID: JOB_FUNCTION_ID }], Rate: [{ ID: '0.1235' }], Day: [{ ID: '2026-10-13' }] });
        const insertOnly: OutputMappingConfig = { childRecords: [{ entity: 'Person Job Functions', parentField: 'PersonID', fanOutRef: '$.Rows', map: { RateID: '$.RateID', DayID: '$.DayID' } }] };
        const answer = { Rows: [{ RateID: '0.1235', DayID: '2026-10-13' }, { RateID: 'abc', DayID: 'not a date' }, { RateID: '12.5', DayID: '2026-02-30' }] };
        const out = await ApplyOutputMapping({ outputMapping: insertOnly, result: answer, record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([
            `'Person Job Functions.RateID' = 'abc' is not a valid decimal(5, 4) value for 'Rates.ID' (the real write fails converting it)`,
            `'Person Job Functions.RateID' = '12.5' is not a valid decimal(5, 4) value for 'Rates.ID' (the real write fails converting it)`,
            `'Person Job Functions.DayID' = 'not a date' is not a valid date value for 'Days.ID' (the real write fails converting it)`,
            `'Person Job Functions.DayID' = '2026-02-30' is not a valid date value for 'Days.ID' (the real write fails converting it)`,
        ]);
        expect(d.SqlRuns).toHaveLength(2); // one read per related column: rates, days
    });
});

describe('dry-run preview sends values as the write does and lets the database compare them', () => {
    /** The child entity with JobFunctionID referencing the related Code column, typed like it. */
    const byCode = (code: EntityFieldInfo): PreviewEntity => ({ ...PJF(), Fields: PJF().Fields.map((f) => (f.Name === 'JobFunctionID'
        ? Object.assign(new EntityFieldInfo({ Name: 'JobFunctionID', Type: code.Type, Length: code.Length, RelatedEntity: 'Job Functions' }), { RelatedEntityFieldName: 'Code' }) : f)) });
    const functionsByCode = (code: EntityFieldInfo): PreviewEntity => relatedEntity('Job Functions', 'JobFunction', 'uniqueidentifier', [code]);
    const nvarchar20 = new EntityFieldInfo({ Name: 'Code', Type: 'nvarchar', Length: 40 });

    it('sends text outside ASCII as a Unicode literal, so an existing value is found', async () => {
        const d = new PreviewDbProvider([byCode(nvarchar20), PEOPLE, functionsByCode(nvarchar20)], { JobFunction: [{ ID: JOB_FUNCTION_ID, Code: '日本' }] });
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction('日本'), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        expect(d.SqlRuns[0]).toContain(`(VALUES (N'日本'))`);
    });

    it('sends a UUID as written, not normalised', async () => {
        const d = new PreviewDbProvider([PJF(), PEOPLE, JOB_FUNCTIONS], { JobFunction: [{ ID: JOB_FUNCTION_ID.toLowerCase() }] });
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction(JOB_FUNCTION_ID), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toBeUndefined();
        expect(d.SqlRuns[0]).toContain(`(VALUES ('${JOB_FUNCTION_ID}'))`);
    });

    it('lets the column collation decide: a case-only difference on a case-sensitive column does not exist', async () => {
        const d = new PreviewDbProvider([byCode(nvarchar20), PEOPLE, functionsByCode(nvarchar20)], { JobFunction: [{ ID: JOB_FUNCTION_ID, Code: 'Sales' }] });
        d.CaseSensitiveColumns.add('Code');
        // Inserted without reconcile (a reconcile key would treat the two as one): both values go to the database in one read.
        const insertOnly: OutputMappingConfig = { childRecords: [{ entity: 'Person Job Functions', parentField: 'PersonID', fanOutRef: '$.Functions', map: { JobFunctionID: '$.JobFunctionID' } }] };
        const both = { Functions: [{ JobFunctionID: 'Sales' }, { JobFunctionID: 'sales' }] };
        const out = await ApplyOutputMapping({ outputMapping: insertOnly, result: both, record, contextUser: USER, provider: d, dryRun: true });
        expect(d.SqlRuns).toHaveLength(1);
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.JobFunctionID' = 'sales' does not exist in 'Job Functions' (the real write fails on its foreign key)`]);
    });

    it('reports text longer than the related column holds without sending it', async () => {
        const code5 = new EntityFieldInfo({ Name: 'Code', Type: 'nvarchar', Length: 10 });
        const d = new PreviewDbProvider([byCode(code5), PEOPLE, functionsByCode(code5)], { JobFunction: [{ ID: JOB_FUNCTION_ID, Code: 'SALES' }] });
        const out = await ApplyOutputMapping({ outputMapping: childOnly, result: oneFunction('SALES-EMEA'), record, contextUser: USER, provider: d, dryRun: true });
        expect(out.PreviewErrors).toEqual([`'Person Job Functions.JobFunctionID' = 'SALES-EMEA' is longer than 'Job Functions.Code' holds (the real write fails truncating it)`]);
        expect(d.SqlRuns).toHaveLength(0);
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
        expect(d.SqlRuns).toHaveLength(0);
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

describe('OutputMappingWriter.ExceedsColumnLength — text longer than a character column holds', () => {
    it('measures a character column in characters (Length is in bytes for n-types), and ignores other types and MAX', () => {
        const code10 = new EntityFieldInfo({ Name: 'Code', Type: 'nvarchar', Length: 20 });
        expect(OutputMappingWriter.ExceedsColumnLength(code10, '0123456789')).toBe(false);
        expect(OutputMappingWriter.ExceedsColumnLength(code10, '0123456789X')).toBe(true);
        expect(OutputMappingWriter.ExceedsColumnLength(new EntityFieldInfo({ Name: 'Code', Type: 'nvarchar', Length: -1 }), 'x'.repeat(5000))).toBe(false);
        expect(OutputMappingWriter.ExceedsColumnLength(field('ID', 'uniqueidentifier'), `${JOB_FUNCTION_ID}-and-more`)).toBe(false);
    });
});

/** What `TagEngine.FindTaggedItems` answers. */
type TaggedItemLookup = Awaited<ReturnType<TagEngine['FindTaggedItems']>>;

describe('the dry-run preview is the real write\'s decision', () => {
    const LEVEL = '11111111-1111-1111-1111-111111111111';
    const fieldMapping: OutputMappingConfig = {
        fields: { SeniorityLevelID: '$.Level', Nickname: '$.Nick', LastReviewedAt: '$.At' },
    };
    /** The record already holds: the level (upper case), an empty nickname, the review instant (as a Date). */
    const heldValues = { SeniorityLevelID: LEVEL.toUpperCase(), Nickname: '', LastReviewedAt: new Date('2026-10-13T10:00:00Z') };
    const answer = { Level: LEVEL, Nick: null, At: '2026-10-13T12:00:00+02:00' };

    /** The fields whose stored value changed after `run`. */
    async function changedFields(setup: () => ReturnType<typeof harness>, dryRun: boolean, guard?: HumanValueGuard) {
        const h = setup();
        Object.assign(h.parent.Values, heldValues);
        const before = { ...h.parent.Values };
        const out = await ApplyOutputMapping({ outputMapping: fieldMapping, result: answer, record, contextUser: USER, provider: h.provider, dryRun, humanGuard: guard });
        const changed = Object.keys(h.parent.Values).filter((f) => h.parent.Values[f] !== before[f]);
        return { out, changed, h };
    }

    it('lists the fields the real write saves: equal dates, ids and an empty-vs-null difference decided as the write decides', async () => {
        const dry = await changedFields(() => harness([]), true);
        const real = await changedFields(() => harness([]), false);

        expect(real.changed).toEqual(['Nickname']);
        expect(dry.out.previewFieldChanges).toEqual([{ Field: 'Nickname', OldValue: '', NewValue: null }]);
        expect(dry.out.previewFieldChanges?.map((c) => c.Field)).toEqual(real.changed);
        expect(dry.h.parent.Saved).toBe(0);
    });

    it('leaves out a field the real write keeps because a person entered it', async () => {
        const kept = { IsHumanOwned: vi.fn(async (q: { FieldName: string }) => q.FieldName === 'Nickname'), RecordPreserved: vi.fn(async () => undefined), RetireHumanValue: vi.fn(async () => false) };
        const heldNick = () => { const h = harness([]); return h; };
        const dryHarness = heldNick();
        Object.assign(dryHarness.parent.Values, { ...heldValues, Nickname: 'Bobby' });
        const dry = await ApplyOutputMapping({ outputMapping: fieldMapping, result: answer, record, contextUser: USER, provider: dryHarness.provider, dryRun: true, humanGuard: kept });
        const realHarness = heldNick();
        Object.assign(realHarness.parent.Values, { ...heldValues, Nickname: 'Bobby' });
        const real = await ApplyOutputMapping({ outputMapping: fieldMapping, result: answer, record, contextUser: USER, provider: realHarness.provider, humanGuard: kept });

        expect(real.preservedHumanFields).toEqual(['Nickname']);
        expect(real.updatedRecord).toBe(false);
        expect(dry.previewFieldChanges).toEqual([]);
    });

    it('previews nothing for an identical re-run, as the real write changes nothing', async () => {
        const order: string[] = [];
        const existing = [
            new Row({ ID: 'pjf-1', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Confidence: 0.9, Source: 'Derived' }, order, 'e1'),
            new Row({ ID: 'pjf-2', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000002', Sequence: 2, Confidence: 0.4, Source: 'Derived' }, order, 'e2'),
        ];
        const h = harness(existing);
        h.parent.Values.SeniorityLevelID = LEVEL;
        const dry = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider, dryRun: true });
        const real = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: h.provider });

        expect(real.changed).toBe(false);
        expect(dry.previewFieldChanges).toEqual([]);
        expect(dry.previewChildChanges?.map((c) => c.Action)).toEqual(['none', 'none']);
    });

    it('marks each child row insert, update, delete or none as the real write does, an update showing only the differing values', async () => {
        const order: string[] = [];
        const same = new Row({ ID: 'pjf-1', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000001', Sequence: 1, Confidence: 0.9, Source: 'Derived' }, order, 'e1');
        const differs = new Row({ ID: 'pjf-2', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000002', Sequence: 2, Confidence: 0.3, Source: 'Derived' }, order, 'e2');
        const stale = new Row({ ID: 'pjf-3', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000003', Sequence: 3, Source: 'Derived' }, order, 'e3');
        const human = new Row({ ID: 'pjf-4', PersonID: 'person-1', JobFunctionID: 'aaaaaaaa-0000-0000-0000-000000000004', Sequence: 4, Source: 'Manual' }, order, 'e4');
        const added = { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000005', Sequence: 5, Confidence: 0.5 };
        const humanProposed = { JobFunctionID: 'AAAAAAAA-0000-0000-0000-000000000004', Sequence: 4, Confidence: 0.5 };
        const proposal = { ...result, Functions: [...result.Functions, added, humanProposed] };

        const dryHarness = harness([same, differs, stale, human]);
        const dry = await ApplyOutputMapping({ outputMapping: mapping, result: proposal, record, contextUser: USER, provider: dryHarness.provider, dryRun: true });
        const realHarness = harness([same, differs, stale, human]);
        const real = await ApplyOutputMapping({ outputMapping: mapping, result: proposal, record, contextUser: USER, provider: realHarness.provider });

        const byAction = (action: string) => (dry.previewChildChanges ?? []).filter((c) => c.Action === action);
        expect(byAction('insert')).toHaveLength(real.createdChildIDs?.length ?? 0);
        expect(byAction('update')).toHaveLength(real.updatedChildIDs?.length ?? 0);
        expect(byAction('delete')).toHaveLength(real.deletedChildIDs?.length ?? 0);
        expect(byAction('none')).toHaveLength((real.unchangedChildIDs?.length ?? 0) + (real.preservedHumanChildIDs?.length ?? 0));
        expect(byAction('update')[0]).toMatchObject({ Entity: 'Person Job Functions', Values: { Confidence: 0.4 } });
        expect(Object.keys(byAction('update')[0].Values)).not.toContain('Sequence');
        expect(byAction('insert')[0]).toMatchObject({ Entity: 'Person Job Functions', Values: { JobFunctionID: added.JobFunctionID } });
        expect(dryHarness.created).toHaveLength(0);
    });

    /** Previews one tag whose lookup of existing links answers `lookup`; the real write's weight is 1. */
    async function previewTag(lookup: TaggedItemLookup) {
        const resolve = vi.spyOn(TagEngine.Instance, 'ResolveTag').mockResolvedValue(TAG);
        const byID = vi.spyOn(TagEngine.Instance, 'GetTagByID').mockReturnValue(TAG);
        const config = vi.spyOn(TagEngine.Instance, 'Config').mockResolvedValue(undefined);
        const find = vi.spyOn(TagEngine.Instance, 'FindTaggedItems').mockResolvedValue(lookup);
        try {
            const out = await ApplyOutputMapping({ outputMapping: { tags: [{ ref: '$.tag', rootTagId: 'root-1' }] }, result: { tag: 'Sales' }, record, contextUser: USER, provider: harness([]).provider, dryRun: true });
            return { out, calls: [...find.mock.calls] };
        } finally {
            resolve.mockRestore();
            byID.mockRestore();
            config.mockRestore();
            find.mockRestore();
        }
    }
    const TAG = { ID: 'tag-1', Name: 'Sales', ParentID: 'root-1' } as unknown as MJTagEntity;
    const linkWithWeight = (Weight: number) => ({ TagID: 'tag-1', Weight }) as unknown as MJTaggedItemEntity;

    it('marks a tag that is already linked at the real write\'s weight as no change', async () => {
        const { out, calls } = await previewTag({ Success: true, Items: [linkWithWeight(1)] });

        expect(out.previewTags?.[0]).toMatchObject({ alreadyLinked: true, reweighted: false });
        expect(calls).toEqual([['ENT-P', 'person-1', ['tag-1'], USER]]);
    });

    it('marks an existing link whose weight differs as a reweight, which the real write saves', async () => {
        const { out } = await previewTag({ Success: true, Items: [linkWithWeight(0.5)] });

        expect(out.previewTags?.[0]).toMatchObject({ alreadyLinked: true, reweighted: true });
    });

    it('marks a tag with no link as neither linked nor reweighted', async () => {
        const { out } = await previewTag({ Success: true, Items: [] });

        expect(out.previewTags?.[0]).toMatchObject({ alreadyLinked: false, reweighted: false });
    });

    it('reports a failed read of the existing links as a preview error, not as "not linked"', async () => {
        const { out } = await previewTag({ Success: false, ErrorMessage: 'view read failed', Items: [] });

        expect(out.PreviewErrors).toEqual(['checking the existing links of the record\'s tags failed: view read failed']);
    });

    it('reads the existing links of all the mapping\'s matched tags once', async () => {
        const resolve = vi.spyOn(TagEngine.Instance, 'ResolveTag').mockImplementation(async (text) => ({ ID: `tag-${text}`, Name: text, ParentID: 'root-1' } as unknown as MJTagEntity));
        const byID = vi.spyOn(TagEngine.Instance, 'GetTagByID').mockReturnValue(TAG);
        const config = vi.spyOn(TagEngine.Instance, 'Config').mockResolvedValue(undefined);
        const find = vi.spyOn(TagEngine.Instance, 'FindTaggedItems').mockResolvedValue({ Success: true, Items: [] });
        await ApplyOutputMapping({ outputMapping: { tags: [{ ref: '$.tags', rootTagId: 'root-1' }] }, result: { tags: ['a', 'b', 'c'] }, record, contextUser: USER, provider: harness([]).provider, dryRun: true });
        const calls = find.mock.calls.length;
        const ids = find.mock.calls[0]?.[2];
        resolve.mockRestore();
        byID.mockRestore();
        config.mockRestore();
        find.mockRestore();

        expect(calls).toBe(1);
        expect(ids).toEqual(['tag-a', 'tag-b', 'tag-c']);
    });

    it('previews exactly the stale rows the real write deletes, and none when deleteStale is off', async () => {
        const mk = (id: string, fn: string, source: string) => new Row({ ID: id, PersonID: 'person-1', JobFunctionID: fn, Sequence: 9, Source: source }, [], id);
        const rows = () => [
            mk('pjf-s1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Derived'),
            mk('pjf-s2', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'Derived'),
            mk('pjf-h', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'Manual'),
        ];
        const keep: OutputMappingConfig = { childRecords: [{ ...mapping.childRecords![0], reconcile: { ...mapping.childRecords![0].reconcile!, deleteStale: false } }] };
        for (const [config, expected] of [[mapping, ['pjf-s1', 'pjf-s2']], [keep, []]] as Array<[OutputMappingConfig, string[]]>) {
            const dry = await ApplyOutputMapping({ outputMapping: config, result, record, contextUser: USER, provider: harness(rows()).provider, dryRun: true });
            const real = await ApplyOutputMapping({ outputMapping: config, result, record, contextUser: USER, provider: harness(rows()).provider });

            expect(real.deletedChildIDs || []).toEqual(expected);
            expect((dry.previewChildChanges || []).filter((c) => c.Action === 'delete').map((c) => c.Values.JobFunctionID)).toEqual(expected.map((id) => id === 'pjf-s1' ? 'aaaaaaaa-0000-0000-0000-0000000000a1' : 'aaaaaaaa-0000-0000-0000-0000000000a2'));
        }
    });
});

describe('a dry run with a withheld (below-confidence) output reports exactly what the real write does', () => {
    const LEVEL = '11111111-1111-1111-1111-111111111111';
    const withheldLevel = { Fields: ['SeniorityLevelID'], ChildEntities: [] };
    const fieldOnly: OutputMappingConfig = { fields: { SeniorityLevelID: '$.SeniorityLevel' } };

    /** A guard double: the field's current value is a person's (`human`) or the pipeline's own; it records what it was asked to retire. */
    function ownerGuard(human: boolean) {
        const retired: string[] = [];
        const guard: HumanValueGuard = {
            IsHumanOwned: vi.fn(async () => human),
            RecordPreserved: vi.fn(async () => undefined),
            RetireHumanValue: vi.fn(async (f: string) => { retired.push(f); return true; }),
        };
        return { guard, retired };
    }

    /** One dry run and one real write of the same answer over the same record (the level held), each on its own harness. */
    async function dryAndReal(opts: { human: boolean; overwriteHumanValues?: boolean; provider?: (h: ReturnType<typeof harness>) => IMetadataProvider }) {
        const run = async (dryRun: boolean) => {
            const h = harness([]);
            h.parent.Values.SeniorityLevelID = LEVEL;
            const { guard, retired } = ownerGuard(opts.human);
            const out = await ApplyOutputMapping({ outputMapping: fieldOnly, result: { SeniorityLevel: 'ignored-by-the-floor' }, record, contextUser: USER,
                provider: opts.provider ? opts.provider(h) : h.provider, dryRun, humanGuard: guard, withheld: withheldLevel,
                overwriteHumanValues: opts.overwriteHumanValues === true });
            return { out, h, retired };
        };
        return { dry: await run(true), real: await run(false) };
    }

    it('a value the pipeline wrote: the preview\'s one change is the clear to null the real write saves', async () => {
        const { dry, real } = await dryAndReal({ human: false });

        expect(real.h.parent.Values.SeniorityLevelID).toBeNull();
        expect(real.h.parent.Saved).toBe(1);
        expect(dry.out.previewFieldChanges).toEqual([{ Field: 'SeniorityLevelID', OldValue: LEVEL, NewValue: null }]);
        expect(dry.h.parent.Saved).toBe(0);
        expect(dry.out.withheldFields).toEqual(real.out.withheldFields);
    });

    it('a person\'s value: no change in the preview and none in the real write, also on a run that overwrites human values', async () => {
        for (const overwriteHumanValues of [false, true]) {
            const { dry, real } = await dryAndReal({ human: true, overwriteHumanValues });

            expect(real.h.parent.Saved).toBe(0);
            expect(real.h.parent.Values.SeniorityLevelID).toBe(LEVEL);
            expect(real.retired).toEqual([]);
            expect(real.out.retiredHumanFields).toBeUndefined();
            expect(dry.out.previewFieldChanges).toEqual([]);
            expect(dry.out.withheldFields).toEqual(['SeniorityLevelID']);
        }
    });

    it('a column that does not allow null: no change in either, and both list it as withheld and kept', async () => {
        const strict = new EntityInfo({ ID: 'ENT-P', Name: 'People', Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { Name: 'SeniorityLevelID', Type: 'uniqueidentifier', AllowsNull: false }] });
        const strictProvider = (h: ReturnType<typeof harness>): IMetadataProvider => {
            vi.spyOn(h.provider, 'EntityByID').mockReturnValue(strict);
            return h.provider;
        };
        const { dry, real } = await dryAndReal({ human: false, provider: strictProvider });

        expect(real.h.parent.Saved).toBe(0);
        expect(real.h.parent.Values.SeniorityLevelID).toBe(LEVEL);
        expect(dry.out.previewFieldChanges).toEqual([]);
        for (const out of [dry.out, real.out]) {
            expect(out.withheldFields).toEqual(['SeniorityLevelID']);
            expect(out.withheldKeptFields).toEqual(['SeniorityLevelID']);
        }
    });

    it('a withheld child entity: no child change in the preview, and the real write neither writes nor deletes a stale row', async () => {
        const mk = (id: string, fn: string, source: string) => new Row({ ID: id, PersonID: 'person-1', JobFunctionID: fn, Sequence: 9, Source: source }, [], id);
        const rows = () => [mk('pjf-s1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Derived'), mk('pjf-h', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'Manual')];
        const withheldChildren = { Fields: [], ChildEntities: ['Person Job Functions'] };
        const dryHarness = harness(rows());
        const dry = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: dryHarness.provider, dryRun: true, withheld: withheldChildren });
        const realRows = rows();
        const realHarness = harness(realRows);
        const real = await ApplyOutputMapping({ outputMapping: mapping, result, record, contextUser: USER, provider: realHarness.provider, withheld: withheldChildren });

        expect(dry.previewChildChanges || []).toEqual([]);
        expect(dry.withheldChildEntities).toEqual(['Person Job Functions']);
        expect(real.withheldChildEntities).toEqual(['Person Job Functions']);
        expect(real.createdChildIDs || []).toEqual([]);
        expect(real.updatedChildIDs || []).toEqual([]);
        expect(real.deletedChildIDs || []).toEqual([]);
        expect(realHarness.created).toHaveLength(0);
        expect(realRows.some((r) => r.Deleted)).toBe(false);
        // the field mapping is not withheld, so both still decide it alike
        expect(dry.previewFieldChanges?.map((c) => c.Field)).toEqual(real.updatedRecord ? ['SeniorityLevelID'] : []);
    });
});
