/**
 * GenerateSaveSQL not-loaded skip.
 *
 * A field whose hydration source omitted it (EntityField.NotLoaded) must be OMITTED from the
 * save SP call entirely: every generated param has a default, the update procs'
 * `ISNULL(@p, [Col])` merge preserves the stored value, and — because RenderSaveCallBinding
 * derives everything (including `_Clear` companions) from the fieldValueMap this skip keeps
 * the field out of — the not-loaded field can never wipe its column via its own construction
 * state. Proven here by capturing the map the binding hook receives.
 */

import { describe, it, expect, vi } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    BaseEntity,
    Metadata,
    ProviderType,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
    IEntityDataProvider,
} from '@memberjunction/core';
import type { RunQueryResult } from '@memberjunction/core';
import { CompositeKey } from '@memberjunction/core';
import { RecordMergeResult } from '@memberjunction/core';
import { TransactionGroupBase } from '@memberjunction/core';
import { QueryExecutionSpec } from '@memberjunction/core';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn(),
                Encrypt: vi.fn(),
                IsEncrypted: vi.fn().mockReturnValue(false),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
}));

// ---------------------------------------------------------------------------
// Provider whose binding hook CAPTURES the fieldValues map GenerateSaveSQL built.
// ---------------------------------------------------------------------------
class SaveSkipTestProvider extends GenericDatabaseProvider {
    public capturedFieldValues: Map<EntityFieldInfo, unknown> | null = null;

    public async buildSaveSQL(entity: BaseEntity, isNew: boolean, user: UserInfo): Promise<SaveSQLResult> {
        return this['GenerateSaveSQL'](entity, isNew, user);
    }

    protected override CoerceSaveFieldValue(
        _field: EntityFieldInfo,
        value: unknown,
        _isUpdate: boolean,
    ): { kind: 'use'; value: unknown } | { kind: 'skip' } {
        return { kind: 'use', value };
    }

    protected override RenderSaveCallBinding(
        _entity: BaseEntity,
        fieldValues: Map<EntityFieldInfo, unknown>,
        _isUpdate: boolean,
        _spName: string,
    ): { kind: 'exec'; sql: string } {
        this.capturedFieldValues = fieldValues;
        return { kind: 'exec', sql: '-- test binding' } as never;
    }

    protected override WrapSaveCallForResult(): { sql: string } {
        return { sql: '-- test save' } as never;
    }

    protected override WrapSaveCallWithRecordChange(): { sql: string } {
        return { sql: '-- test save+rc' } as never;
    }

    // --- Abstract-member implementations (type-system satisfaction only) ---
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    protected get UUIDFunctionPattern(): RegExp { return SaveSkipTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return SaveSkipTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    public async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<{ EntityID: string; PrimaryKey: CompositeKey; RecordName: string }[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey; }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] } as unknown as PotentialDuplicateResponse;
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false } as unknown as RecordMergeResult;
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false } as unknown as DatasetResultType;
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false } as unknown as DatasetStatusResultType;
    }
    public get InstanceConnectionString(): string { return 'save-skip-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
}

// ---------------------------------------------------------------------------
// Real EntityInfo + BaseEntity — the flag under test lives on the real classes.
// ---------------------------------------------------------------------------

const ENTITY_ID = 'entity-employees';
const employeesInit: Record<string, unknown> = {
    ID: ENTITY_ID,
    Name: 'Employees',
    SchemaName: 'dbo',
    BaseTable: 'Employee',
    BaseView: 'vwEmployees',
    IncludeInAPI: true,
    AllowUpdateAPI: true,
    TrackRecordChanges: false,
    Permissions: [],
    Fields: [
        { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false },
        { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
        { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 3, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', Length: 400, AllowsNull: true, AllowUpdateAPI: true },
        { ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 4, Name: 'Salary', Entity: 'Employees', Type: 'money', AllowsNull: true, AllowUpdateAPI: true },
    ],
};

class MJTestEntity extends BaseEntity {}
const PK = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';

function setup(): { provider: SaveSkipTestProvider; entity: MJTestEntity; user: UserInfo } {
    const entityInfo = new EntityInfo(employeesInit);
    const provider = new SaveSkipTestProvider();
    const mockMd = {
        Entities: [entityInfo],
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
        SetCachedRecordName: () => { /* noop */ },
        GetCachedRecordName: () => null,
    } as unknown as IMetadataProvider & IEntityDataProvider;
    Metadata.Provider = mockMd as never;
    BaseEntity.Provider = mockMd;
    const entity = new MJTestEntity(entityInfo);
    const user = new UserInfo();
    user.ID = 'u-1';
    return { provider, entity, user };
}

describe('GenerateSaveSQL — not-loaded fields are omitted from the SP call', () => {
    it('a hydration-omitted field never reaches the binding; loaded fields do', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' }); // Salary omitted → NotLoaded

        await provider.buildSaveSQL(entity, false, user);

        const boundNames = [...provider.capturedFieldValues!.keys()].map(f => f.Name);
        expect(boundNames).not.toContain('Salary');
        expect(boundNames).toContain('Name');
        expect(boundNames).toContain('Notes');
    });

    it('an explicit (blind) set on the omitted field brings it back into the SP call', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });
        entity.Set('Salary', 95000); // write-only case: blind set clears NotLoaded

        await provider.buildSaveSQL(entity, false, user);

        const boundNames = [...provider.capturedFieldValues!.keys()].map(f => f.Name);
        expect(boundNames).toContain('Salary');
        expect(provider.capturedFieldValues!.get(
            [...provider.capturedFieldValues!.keys()].find(f => f.Name === 'Salary')!
        )).toBe(95000);
    });

    it('a fully hydrated entity binds every SP-parameter field (no over-skipping)', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1', Salary: 90000 });

        await provider.buildSaveSQL(entity, false, user);

        const boundNames = [...provider.capturedFieldValues!.keys()].map(f => f.Name);
        expect(boundNames).toEqual(expect.arrayContaining(['Name', 'Notes', 'Salary']));
    });

    it('a NEW record binds its fields normally — defaults are INSERT state, never not-loaded', async () => {
        const { provider, entity, user } = setup();
        entity.NewRecord();
        entity.Set('Name', 'Grace');

        await provider.buildSaveSQL(entity, true, user);

        const boundNames = [...provider.capturedFieldValues!.keys()].map(f => f.Name);
        expect(boundNames).toContain('Name');
        expect(boundNames).toContain('Salary'); // null, but bound — spCreate decides defaults
    });
});
