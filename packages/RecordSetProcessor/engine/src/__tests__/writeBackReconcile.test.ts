import { describe, it, expect, vi } from 'vitest';
import { CompositeKey, DatabaseProviderBase, EntityFieldInfo, EntityInfo, type IEntityDataProvider, IMetadataProvider, type IRunViewProvider, RunViewResult, UserInfo } from '@memberjunction/core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';
import { ApplyOutputMapping, OutputMappingWriter, type OutputMappingConfig } from '../writeBack';

const USER = {} as UserInfo;
const record: RecordRef = { EntityID: 'ENT-P', RecordID: 'person-1', Record: {} };

/** A BaseEntity double: write-back reads and writes config-named fields through Get/Set, as the real class allows. */
class Row {
    public Saved = 0;
    public Deleted = false;
    constructor(public Values: Record<string, unknown>, private readonly order: string[], private readonly label: string, private readonly failSave = false) {}
    public readonly LatestResult = { CompleteMessage: 'UQ_PersonJobFunction_Person_JobFunction' };
    public get PrimaryKey(): CompositeKey { return CompositeKey.FromKeyValuePair('ID', String(this.Values.ID || `new-${this.label}`)); }
    public get FirstPrimaryKey(): { Value: unknown } { return { Value: this.Values.ID || `new-${this.label}` }; }
    public Get(f: string): unknown { return this.Values[f]; }
    public Set(f: string, v: unknown): void { this.Values[f] = v; }
    public NewRecord(): boolean { return true; }
    public async InnerLoad(): Promise<boolean> { return true; }
    public async Save(): Promise<boolean> { this.order.push(this.label); this.Saved++; return !this.failSave; }
    public async Delete(): Promise<boolean> { this.order.push(`delete:${this.label}`); this.Deleted = true; return true; }
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

function harness(existingChildren: Row[], opts: { failChildSave?: boolean } = {}) {
    const order: string[] = [];
    const scope = { IsNested: false, Commit: vi.fn().mockResolvedValue(undefined), Rollback: vi.fn().mockResolvedValue(undefined) };
    const parent = new Row({ ID: 'person-1', SeniorityLevelID: null }, order, 'parent');
    const created: Row[] = [];
    const runView = vi.fn().mockResolvedValue(viewResult(true, existingChildren));
    // Test double: only the IMetadataProvider members write-back calls, narrowed to the full interface.
    const members: Pick<IMetadataProvider, 'EntityByID' | 'EntityByName' | 'GetEntityObject'>
        & Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'> & Pick<IRunViewProvider, 'RunView'> = {
        SupportsEntityTransactions: true,
        BeginEntityTransaction: vi.fn().mockResolvedValue(scope),
        EntityByID: () => entityOf('People'),
        EntityByName: (n: string) => entityOf(n),
        GetEntityObject: vi.fn().mockImplementation(async (name: string) => {
            if (name === 'People') return parent;
            const r = new Row({}, order, `child${created.length}`, opts.failChildSave === true);
            created.push(r);
            return r;
        }),
        RunView: runView,
    };
    const provider: IMetadataProvider = members as IMetadataProvider & IEntityDataProvider & IRunViewProvider;
    return { order, scope, parent, created, provider, runView };
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

describe('ApplyOutputMapping reconcile — config and answer checks (m2, m3)', () => {
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

describe('ApplyOutputMapping reconcile — several mappings (m5)', () => {
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

describe('OutputMappingWriter.NormalizeKeyPart (m-c)', () => {
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

/**
 * A provider double modelling MJ's ambient transaction: the transaction is a field of the provider INSTANCE — a nested
 * begin joins it as a savepoint, a nested rollback truncates the write log to its savepoint, the outermost commit makes
 * the log durable — and every statement run through an instance with an open transaction lands inside it. All
 * instances share one durable store (the database). `CreateIndependentInstance` mints a sibling with its own
 * transaction state, as `DatabaseProviderBase` does. Every save yields first, so concurrent writes interleave.
 */
class AmbientTransactionProvider {
    public get SupportsEntityTransactions(): boolean { return true; }
    private log: string[] = [];
    private depth = 0;
    /** Called when record B's failing save runs (B's transaction is open at that moment). */
    public OnFailingSave: () => void = () => undefined;

    /** Statements and transaction begins run through this instance. */
    public Calls = 0;

    constructor(public readonly Durable: string[] = [], public readonly Minted: AmbientTransactionProvider[] = []) {}

    /** As `DatabaseProviderBase.TransactionDepth`: 0 = no open transaction on this instance. */
    public get TransactionDepth(): number {
        return this.depth;
    }

    public async BeginEntityTransaction(): Promise<{ IsNested: boolean; Commit(): Promise<void>; Rollback(): Promise<void> }> {
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

    public async CreateIndependentInstance(): Promise<AmbientTransactionProvider> {
        const unit = new AmbientTransactionProvider(this.Durable, this.Minted);
        unit.OnFailingSave = () => this.OnFailingSave();
        this.Minted.push(unit);
        return unit;
    }

    public Released = false;
    public async ReleaseIndependentInstance(): Promise<void> {
        this.Released = true;
    }

    public EntityByID(): object { return { Name: 'People', Fields: PEOPLE_FIELDS, PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' } }; }
    public EntityByName(n: string): object { return { ID: 'ENT-' + n, Name: n, Fields: PJF_FIELDS, PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID' } }; }
    public async GetEntityObject(): Promise<TxRow> { this.Calls++; return new TxRow(this); }
    public async RunView(): Promise<RunViewResult<Row>> { this.Calls++; return viewResult(true, []); }
}

// Write-back isolates units only on a DatabaseProviderBase (an `instanceof` check). The double implements every member
// write-back calls itself; putting the abstract base's prototype under it makes it a DatabaseProviderBase for that check
// without implementing the base's many abstract members, which write-back never calls.
Object.setPrototypeOf(AmbientTransactionProvider.prototype, DatabaseProviderBase.prototype);

/** A row bound to the provider instance that created it, labelled by its record so the test can tell whose writes survived. */
class TxRow {
    public Values: Record<string, unknown> = {};
    private loadedID = '';
    public readonly LatestResult = { CompleteMessage: 'UQ_PersonJobFunction_Person_JobFunction' };
    constructor(private readonly tx: AmbientTransactionProvider) {}
    public get PrimaryKey(): CompositeKey { return CompositeKey.FromKeyValuePair('ID', `${String(this.Values.PersonID || this.loadedID)}:${String(this.Values.JobFunctionID || 'parent')}`); }
    public Get(f: string): unknown { return this.Values[f]; }
    public Set(f: string, v: unknown): void { this.Values[f] = v; }
    public NewRecord(): boolean { return true; }
    public async InnerLoad(key: CompositeKey): Promise<boolean> { this.loadedID = String(key.KeyValuePairs[0].Value); return true; }
    public async Save(): Promise<boolean> {
        await Promise.resolve();
        await Promise.resolve();
        const person = String(this.Values.PersonID || this.loadedID);
        if (person === 'person-B') {
            this.tx.OnFailingSave();
            return false; // record B's child write fails on the unique key
        }
        this.tx.Write(`${person}:${String(this.Values.JobFunctionID || 'SeniorityLevelID')}`);
        return true;
    }
}

describe('ApplyOutputMapping transaction isolation', () => {
    const recordA: RecordRef = { EntityID: 'ENT-P', RecordID: 'person-A', Record: {} };
    const recordB: RecordRef = { EntityID: 'ENT-P', RecordID: 'person-B', Record: {} };
    const A_WRITES = ['person-A:AAAAAAAA-0000-0000-0000-000000000001', 'person-A:AAAAAAAA-0000-0000-0000-000000000002', 'person-A:SeniorityLevelID'];
    // The double's prototype chain runs through DatabaseProviderBase (see above), so the instanceof check narrows it.
    const asProvider = (p: AmbientTransactionProvider): IMetadataProvider => {
        if (p instanceof DatabaseProviderBase) {
            return p;
        }
        throw new Error('AmbientTransactionProvider must be a DatabaseProviderBase');
    };

    it('with two records in flight on one provider, B failing rolls back only B; A stays committed and succeeds', async () => {
        const shared = new AmbientTransactionProvider();
        const [a, b] = await Promise.allSettled([
            ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: asProvider(shared) }),
            ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: asProvider(shared) }),
        ]);
        expect(a.status).toBe('fulfilled');
        expect(b.status).toBe('rejected');
        expect(shared.Durable).toEqual(A_WRITES);
    });

    it('a tracker write on the shared provider while a write-back is open survives that write-back rolling back', async () => {
        const shared = new AmbientTransactionProvider();
        // The run tracker records record A's detail row through the shared provider while record B's write-back is open.
        shared.OnFailingSave = () => shared.Write('ProcessRunDetail:person-A');
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: asProvider(shared) }))
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
        await ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: asProvider(shared) });
        expect(shared.Minted).toHaveLength(1);
        expect(shared.Calls).toBe(0);
        expect(shared.Durable).toEqual(A_WRITES);
    });

    it('when the caller holds a transaction, joins it (no second instance) and the caller owns atomicity', async () => {
        const shared = new AmbientTransactionProvider();
        const caller = await shared.BeginEntityTransaction();
        shared.Write('caller:own-write');
        await ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: asProvider(shared) });
        expect(shared.Minted).toHaveLength(0);
        expect(shared.Durable).toEqual([]); // nothing durable until the caller commits
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: asProvider(shared) })).rejects.toThrow();
        await caller.Commit();
        // B rolled back to its savepoint only: the caller's write and A's joined writes commit with the caller.
        expect(shared.Durable).toEqual(['caller:own-write', ...A_WRITES]);
    });

    it('fails loudly when a database provider cannot mint an instance, running nothing on the shared provider', async () => {
        // A DatabaseProviderBase subclass that never implemented CreateIndependentInstance: it inherits the base's, which throws.
        class NoMintProvider extends AmbientTransactionProvider {}
        Object.defineProperty(NoMintProvider.prototype, 'CreateIndependentInstance', { value: DatabaseProviderBase.prototype.CreateIndependentInstance });
        const shared = new NoMintProvider();
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: asProvider(shared) }))
            .rejects.toThrow(/NoMintProvider does not implement CreateIndependentInstance/);
        expect(shared.Calls).toBe(0);
        expect(shared.Durable).toEqual([]);
    });

    it('writes on a minted instance and releases it, on success and on failure', async () => {
        const shared = new AmbientTransactionProvider();
        await ApplyOutputMapping({ outputMapping: mapping, result, record: recordA, contextUser: USER, provider: asProvider(shared) });
        await expect(ApplyOutputMapping({ outputMapping: mapping, result, record: recordB, contextUser: USER, provider: asProvider(shared) })).rejects.toThrow();
        expect(shared.Minted).toHaveLength(2);
        expect(shared.Minted.every((m) => m.Released)).toBe(true);
        expect(shared.Released).toBe(false);
    });
});
