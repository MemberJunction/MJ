/**
 * Binary entity fields (SQL Server varbinary / binary / image, PostgreSQL bytea).
 *
 * MemberJunction holds a binary value as a base64 string everywhere above the database providers.
 * These tests pin down the metadata and RunView pieces of that contract:
 *
 *   - EntityInfo knows which fields are binary and what "every field" means for a RunView;
 *   - RunView leaves binary fields out unless the caller sets IncludeBinaryFields or names one
 *     in Fields, and the cache fingerprint keeps the two widths in separate slots;
 *   - BaseEntity validation rejects a value that is not base64, and checks a fixed-size column's
 *     decoded byte length.
 */

import { describe, it, expect } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { ProviderBase } from '../generic/providerBase';
import {
    RunViewResult,
    ProviderType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { EntityFieldInfo, EntityInfo, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { EntityField } from '../generic/baseEntity';
import { RunViewParams } from '../views/runView';
import { SQLMaxByteLength } from '../generic/util';

const ENTITY_ID = 'entity-documents';

/** An entity with two binary columns, one unbounded (varbinary(MAX)) and one fixed (binary(4)). */
function documentEntityInit(): Record<string, unknown> {
    return {
        ID: ENTITY_ID,
        Name: 'Documents',
        SchemaName: 'dbo',
        BaseTable: 'Document',
        BaseView: 'vwDocuments',
        IncludeInAPI: true,
        AllowCaching: true,
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Documents', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Documents', Type: 'nvarchar', Length: 200 },
            { ID: 'f-vector', EntityID: ENTITY_ID, Sequence: 3, Name: 'VectorBinary', Entity: 'Documents', Type: 'varbinary', Length: -1, AllowsNull: true, AllowUpdateAPI: true },
            { ID: 'f-hash', EntityID: ENTITY_ID, Sequence: 4, Name: 'Hash', Entity: 'Documents', Type: 'binary', Length: 4, AllowsNull: true, AllowUpdateAPI: true },
            { ID: 'f-json', EntityID: ENTITY_ID, Sequence: 5, Name: 'VectorJSON', Entity: 'Documents', Type: 'nvarchar', Length: -1, AllowsNull: true },
        ],
    };
}

/** An entity with no binary columns, to prove nothing changes for the common case. */
function plainEntityInit(): Record<string, unknown> {
    return {
        ID: 'entity-plain',
        Name: 'Plain',
        SchemaName: 'dbo',
        BaseTable: 'Plain',
        BaseView: 'vwPlain',
        IncludeInAPI: true,
        AllowCaching: true,
        Fields: [
            { ID: 'p-id', EntityID: 'entity-plain', Sequence: 1, Name: 'ID', Entity: 'Plain', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'p-name', EntityID: 'entity-plain', Sequence: 2, Name: 'Name', Entity: 'Plain', Type: 'nvarchar', Length: 200 },
        ],
    };
}

/** Exposes the protected RunView helpers; everything else is an inert stub. */
class TestProvider extends ProviderBase {
    private _localStorage: ILocalStorageProvider = {
        async GetItem() { return null; },
        async SetItem() { /* noop */ },
        async Remove() { /* noop */ },
        async ClearCategory() { /* noop */ },
        async GetCategoryKeys() { return []; },
    };
    private _entities: EntityInfo[] = [new EntityInfo(documentEntityInit()), new EntityInfo(plainEntityInit())];

    public override get Entities(): EntityInfo[] { return this._entities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this._entities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }
    public fetchFields(entity: EntityInfo, params?: RunViewParams): string[] {
        return this['ComputeRunViewFetchFields'](entity, params);
    }
    public resolveIncludeBinary(params: RunViewParams, entity: EntityInfo): boolean {
        return this['ResolveIncludeBinaryFields'](params, entity);
    }
    public preProcessRunView(params: RunViewParams): Promise<void> {
        return this['PreProcessRunView'](params);
    }

    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_i: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], TotalRowCount: 0, ExecutionTime: 0, RowCount: 0, UserViewRunID: '', Filtered: false, ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [], Fields: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_s: QueryExecutionSpec, _u?: UserInfo): Promise<RunQueryResult> { throw new Error('n/a'); }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public get InstanceConnectionString(): string { return 'binary-fields-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

const documents = (): EntityInfo => new EntityInfo(documentEntityInit());

describe('EntityFieldInfo.IsBinaryFieldType', () => {
    function fieldOfType(type: string): EntityFieldInfo {
        return new EntityFieldInfo({ ID: 'x', EntityID: 'e', Name: 'X', Type: type, Sequence: 1 });
    }

    it.each(['binary', 'varbinary', 'image', 'bytea', ' VarBinary '])('is true for %j', type => {
        expect(fieldOfType(type).IsBinaryFieldType).toBe(true);
    });

    it.each(['nvarchar', 'varchar', 'text', 'uniqueidentifier', 'timestamp', 'rowversion', 'int'])('is false for %j', type => {
        expect(fieldOfType(type).IsBinaryFieldType).toBe(false);
    });
});

describe('EntityInfo binary helpers', () => {
    it('lists the binary fields, in field order, and caches the list', () => {
        const entity = documents();
        expect(entity.BinaryFields.map(f => f.Name)).toEqual(['VectorBinary', 'Hash']);
        expect(entity.BinaryFields).toBe(entity.BinaryFields);
        expect(entity.HasBinaryFields).toBe(true);
    });

    it('reports no binary fields on a plain entity', () => {
        const entity = new EntityInfo(plainEntityInit());
        expect(entity.BinaryFields).toEqual([]);
        expect(entity.HasBinaryFields).toBe(false);
    });

});

describe('RunView binary field selection', () => {
    it('widens to every non-binary field by default', () => {
        const provider = new TestProvider();
        const entity = provider.EntityByName('Documents')!;
        expect(provider.fetchFields(entity)).toEqual(['ID', 'Name', 'VectorJSON']);
        expect(provider.fetchFields(entity, { EntityName: 'Documents' })).toEqual(['ID', 'Name', 'VectorJSON']);
    });

    it('widens to every field when IncludeBinaryFields is set', () => {
        const provider = new TestProvider();
        const entity = provider.EntityByName('Documents')!;
        expect(provider.fetchFields(entity, { EntityName: 'Documents', IncludeBinaryFields: true }))
            .toEqual(['ID', 'Name', 'VectorBinary', 'Hash', 'VectorJSON']);
    });

    it('returns a fresh array each time, so a caller cannot corrupt the cached list', () => {
        const provider = new TestProvider();
        const entity = provider.EntityByName('Documents')!;
        const first = provider.fetchFields(entity);
        first.push('Injected');
        expect(provider.fetchFields(entity)).toEqual(['ID', 'Name', 'VectorJSON']);
    });

    it('treats naming a binary field in Fields as asking for binary fields', () => {
        const provider = new TestProvider();
        const entity = provider.EntityByName('Documents')!;
        const params: RunViewParams = { EntityName: 'Documents', Fields: ['ID', 'vectorbinary'] };
        expect(provider.resolveIncludeBinary(params, entity)).toBe(true);
        expect(params.IncludeBinaryFields).toBe(true);
    });

    it('leaves IncludeBinaryFields unset when no binary field is named', () => {
        const provider = new TestProvider();
        const entity = provider.EntityByName('Documents')!;
        const params: RunViewParams = { EntityName: 'Documents', Fields: ['ID', 'Name'] };
        expect(provider.resolveIncludeBinary(params, entity)).toBe(false);
        expect(params.IncludeBinaryFields).toBeUndefined();
    });

    it('keeps an explicit IncludeBinaryFields: true', () => {
        const provider = new TestProvider();
        const entity = provider.EntityByName('Documents')!;
        const params: RunViewParams = { EntityName: 'Documents', IncludeBinaryFields: true };
        expect(provider.resolveIncludeBinary(params, entity)).toBe(true);
    });

    it('hydrates entity_object results without binary fields unless asked (PreProcessRunView)', async () => {
        const provider = new TestProvider();
        const params: RunViewParams = { EntityName: 'Documents', ResultType: 'entity_object', Fields: ['Name'] };
        await provider.preProcessRunView(params);
        expect(params.Fields).toEqual(['ID', 'Name', 'VectorJSON']);
    });

    it('hydrates entity_object results with binary fields when a binary field is named', async () => {
        const provider = new TestProvider();
        const params: RunViewParams = { EntityName: 'Documents', ResultType: 'entity_object', Fields: ['Hash'] };
        await provider.preProcessRunView(params);
        expect(params.Fields).toEqual(['ID', 'Name', 'VectorBinary', 'Hash', 'VectorJSON']);
        expect(params.IncludeBinaryFields).toBe(true);
    });
});

describe('RunViewParams.Equals and IncludeBinaryFields', () => {
    it('treats undefined and false as equal', () => {
        expect(RunViewParams.Equals({ EntityName: 'Documents' }, { EntityName: 'Documents', IncludeBinaryFields: false })).toBe(true);
    });

    it('treats a toggle to true as a change', () => {
        expect(RunViewParams.Equals({ EntityName: 'Documents' }, { EntityName: 'Documents', IncludeBinaryFields: true })).toBe(false);
        expect(RunViewParams.Equals({ EntityName: 'Documents', IncludeBinaryFields: true }, { EntityName: 'Documents', IncludeBinaryFields: true })).toBe(true);
    });
});

describe('RunView cache fingerprint and IncludeBinaryFields', () => {
    const cache = LocalCacheManager.Instance;

    it('keeps the default fingerprint byte-identical, so existing slots stay valid', () => {
        const without = cache.GenerateRunViewFingerprint({ EntityName: 'Documents', ExtraFilter: "Name='a'" });
        const withFalse = cache.GenerateRunViewFingerprint({ EntityName: 'Documents', ExtraFilter: "Name='a'", IncludeBinaryFields: false });
        expect(withFalse).toBe(without);
        expect(without).not.toContain('bin:');
    });

    it('gives a binary-inclusive request its own slot', () => {
        const narrow = cache.GenerateRunViewFingerprint({ EntityName: 'Documents' });
        const wide = cache.GenerateRunViewFingerprint({ EntityName: 'Documents', IncludeBinaryFields: true });
        expect(wide).not.toBe(narrow);
        expect(wide).toContain('bin:1');
    });
});

describe('EntityField validation of binary values', () => {
    const entity = documents();
    const vectorField = entity.Fields.find(f => f.Name === 'VectorBinary')!;
    const hashField = entity.Fields.find(f => f.Name === 'Hash')!;

    function validate(field: EntityFieldInfo, value: unknown) {
        const ef = new EntityField(field);
        ef.Value = value;
        return ef.Validate();
    }

    it('accepts base64, including the empty string and unpadded input', () => {
        expect(validate(vectorField, 'AAAAAA==').Success).toBe(true);
        expect(validate(vectorField, 'AAAAAA').Success).toBe(true);
        expect(validate(vectorField, null).Success).toBe(true);
    });

    it('rejects a value that is not base64, naming the field', () => {
        const result = validate(vectorField, 'not base64!');
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('VectorBinary');
        expect(result.Errors[0].Message).toContain('must be a base64-encoded string');
    });

    it('rejects a data URI: the field holds raw bytes, not a URI', () => {
        expect(validate(vectorField, 'data:image/png;base64,AAAA').Success).toBe(false);
    });

    it('rejects a byte array: callers must encode first', () => {
        expect(validate(vectorField, new Uint8Array([1, 2])).Success).toBe(false);
    });

    it('checks the decoded byte length of a fixed-size column, not the base64 length', () => {
        // 4 bytes encode to 8 base64 characters: within binary(4) even though 8 > 4.
        expect(validate(hashField, 'AQIDBA==').Success).toBe(true);
        const tooLong = validate(hashField, 'AQIDBAU=');
        expect(tooLong.Success).toBe(false);
        expect(tooLong.Errors[0].Message).toContain('cannot be longer than 4 bytes. Current value is 5 bytes');
    });

    it('applies no length check to an unbounded (MAX) column', () => {
        expect(validate(vectorField, 'A'.repeat(4000)).Success).toBe(true);
    });
});

describe('RunView binary field selection — edge cases', () => {
    const provider = new TestProvider();
    const docs = (): EntityInfo => provider.EntityByName('Documents')!;
    const plain = (): EntityInfo => provider.EntityByName('Plain')!;

    it('treats IncludeBinaryFields: false like unset when widening', () => {
        expect(provider.fetchFields(docs(), { EntityName: 'Documents', IncludeBinaryFields: false }))
            .toEqual(['ID', 'Name', 'VectorJSON']);
    });

    it('widens a plain entity to every field either way', () => {
        expect(provider.fetchFields(plain())).toEqual(['ID', 'Name']);
        expect(provider.fetchFields(plain(), { EntityName: 'Plain', IncludeBinaryFields: true })).toEqual(['ID', 'Name']);
    });

    it('matches a named binary field after trimming whitespace', () => {
        const params: RunViewParams = { EntityName: 'Documents', Fields: ['  Hash  '] };
        expect(provider.resolveIncludeBinary(params, docs())).toBe(true);
        expect(params.IncludeBinaryFields).toBe(true);
    });

    it('upgrades an explicit IncludeBinaryFields: false when a binary field is named', () => {
        const params: RunViewParams = { EntityName: 'Documents', IncludeBinaryFields: false, Fields: ['VectorBinary'] };
        expect(provider.resolveIncludeBinary(params, docs())).toBe(true);
        expect(params.IncludeBinaryFields).toBe(true);
    });

    it('keeps an explicit false when no binary field is named', () => {
        const params: RunViewParams = { EntityName: 'Documents', IncludeBinaryFields: false, Fields: ['Name'] };
        expect(provider.resolveIncludeBinary(params, docs())).toBe(false);
        expect(params.IncludeBinaryFields).toBe(false);
    });

    it('does nothing for an empty Fields list or no Fields', () => {
        const empty: RunViewParams = { EntityName: 'Documents', Fields: [] };
        expect(provider.resolveIncludeBinary(empty, docs())).toBe(false);
        expect(empty.IncludeBinaryFields).toBeUndefined();
        const none: RunViewParams = { EntityName: 'Documents' };
        expect(provider.resolveIncludeBinary(none, docs())).toBe(false);
        expect(none.IncludeBinaryFields).toBeUndefined();
    });

    it('never flips the flag on an entity without binary fields, whatever is named', () => {
        const params: RunViewParams = { EntityName: 'Plain', Fields: ['ID', 'Name', 'VectorBinary'] };
        expect(provider.resolveIncludeBinary(params, plain())).toBe(false);
        expect(params.IncludeBinaryFields).toBeUndefined();
    });

    it('ignores non-string entries in Fields without throwing', () => {
        const params: RunViewParams = { EntityName: 'Documents', Fields: [null, 42, 'Name'] as unknown as string[] };
        expect(provider.resolveIncludeBinary(params, docs())).toBe(false);
    });

    it('hydrates an unnamed-field entity_object request without binary fields', async () => {
        const params: RunViewParams = { EntityName: 'Documents', ResultType: 'entity_object' };
        await provider.preProcessRunView(params);
        expect(params.IncludeBinaryFields).toBeUndefined();
        expect(params.Fields).toEqual(['ID', 'Name', 'VectorJSON']);
    });

    it('hydrates an entity_object request with binary fields when IncludeBinaryFields is set', async () => {
        const params: RunViewParams = { EntityName: 'Documents', ResultType: 'entity_object', IncludeBinaryFields: true };
        await provider.preProcessRunView(params);
        expect(params.IncludeBinaryFields).toBe(true);
        expect(params.Fields).toEqual(['ID', 'Name', 'VectorBinary', 'Hash', 'VectorJSON']);
    });
});

describe('binary byte caps follow the column type, not the raw catalog length', () => {
    function fieldOf(type: string, length: number): EntityFieldInfo {
        return new EntityFieldInfo({ ID: 'f', EntityID: 'e', Entity: 'Legacy', Name: 'Photo', Type: type, Length: length, Sequence: 1, AllowsNull: true, AllowUpdateAPI: true });
    }
    function validateBytes(field: EntityFieldInfo, bytes: number) {
        const ef = new EntityField(field);
        ef.Value = Buffer.alloc(bytes, 7).toString('base64');
        return ef.Validate();
    }

    it('SQLMaxByteLength: fixed binary columns cap, MAX / image / bytea do not', () => {
        expect(SQLMaxByteLength('varbinary', 512)).toBe(512);
        expect(SQLMaxByteLength('binary', 16)).toBe(16);
        expect(SQLMaxByteLength('varbinary', -1)).toBe(0);
        expect(SQLMaxByteLength('image', 16)).toBe(0);   // sys.columns reports the 16-byte text pointer
        expect(SQLMaxByteLength('bytea', 0)).toBe(0);
        expect(SQLMaxByteLength(' VarBinary ', 8)).toBe(8);
    });

    it('MaxByteLength is exposed on the field info', () => {
        expect(fieldOf('image', 16).MaxByteLength).toBe(0);
        expect(fieldOf('varbinary', 512).MaxByteLength).toBe(512);
    });

    it('an image column accepts a value far larger than the 16 the catalog reports', () => {
        expect(validateBytes(fieldOf('image', 16), 100).Success).toBe(true);
        expect(validateBytes(fieldOf('image', 16), 1_000_000).Success).toBe(true);
    });

    it('a fixed-size binary column still rejects an oversized value, naming the cap', () => {
        const r = validateBytes(fieldOf('binary', 16), 17);
        expect(r.Success).toBe(false);
        expect(r.Errors[0].Message).toContain('cannot be longer than 16 bytes. Current value is 17 bytes');
    });
});
