/**
 * Record Change snapshots are full width, whoever saves.
 *
 * The audit trail stores whole payloads and projects them per reader, so the payload a save
 * writes must describe the whole record. A restricted user's entity object never holds the
 * fields they cannot read (they are `NotLoaded`), so a payload built from that object alone
 * would drop those columns from `FullRecordJSON` and from the update's old-values side.
 * `GenerateSaveSQL` therefore reads the stored row (provider-internal, full width) when the
 * saving object is narrower than the entity, and widens both snapshots from it — without
 * changing what `ChangesJSON` records. A full-width object costs no extra query.
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
    ExecuteSQLOptions,
    EntityDeleteOptions,
} from '@memberjunction/core';
import type { RunQueryResult, RecordChangePayload } from '@memberjunction/core';
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

interface ExecutedStatement {
    sql: string;
    options?: ExecuteSQLOptions;
}

// ---------------------------------------------------------------------------
// Provider whose record-change hook CAPTURES the payload GenerateSaveSQL built, and whose
// ExecuteSQL answers with a configurable stored row while recording every statement.
// ---------------------------------------------------------------------------
class SnapshotTestProvider extends GenericDatabaseProvider {
    public capturedPayload: RecordChangePayload | null = null;
    public executed: ExecutedStatement[] = [];
    public storedRow: Record<string, unknown> | null = null;

    public async buildSaveSQL(entity: BaseEntity, isNew: boolean, user: UserInfo): Promise<SaveSQLResult> {
        return this['GenerateSaveSQL'](entity, isNew, user);
    }

    /** The delete-path pair `Delete()` runs: capture before the orchestration, read in GenerateDeleteSQL. */
    public async deleteSnapshot(entity: BaseEntity, user: UserInfo, options?: EntityDeleteOptions): Promise<Record<string, unknown>> {
        await this['captureDeleteSnapshot'](entity, options, user);
        return this.RecordChangeDeleteSnapshot(entity, entity.GetAll(true));
    }

    protected override CoerceSaveFieldValue(
        _field: EntityFieldInfo,
        value: unknown,
        _isUpdate: boolean,
    ): { kind: 'use'; value: unknown } | { kind: 'skip' } {
        return { kind: 'use', value };
    }

    protected override RenderSaveCallBinding(): { kind: 'exec'; sql: string } {
        return { kind: 'exec', sql: '-- test binding' } as never;
    }

    protected override WrapSaveCallForResult(): { sql: string } {
        return { sql: '-- test save' } as never;
    }

    protected override ProjectSaveCallToDatestamps(): { sql: string } {
        return { sql: '-- test save datestamps' } as never;
    }

    protected override WrapSaveCallWithRecordChange(
        _saveSQL: unknown,
        _binding: unknown,
        payload: RecordChangePayload,
    ): { sql: string } {
        this.capturedPayload = payload;
        return { sql: '-- test save+rc' } as never;
    }

    public override async ExecuteSQL<T>(sql: string, _parameters?: unknown[], options?: ExecuteSQLOptions): Promise<Array<T>> {
        this.executed.push({ sql, options });
        return (this.storedRow ? [{ ...this.storedRow }] : []) as Array<T>;
    }

    // --- Abstract-member implementations (type-system satisfaction only) ---
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;
    protected get UUIDFunctionPattern(): RegExp { return SnapshotTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return SnapshotTestProvider._defaultPattern; }
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
    public get InstanceConnectionString(): string { return 'record-change-snapshot-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
}

// ---------------------------------------------------------------------------
// Real EntityInfo + BaseEntity — NotLoaded / CreateSuppressed live on the real classes.
// ---------------------------------------------------------------------------

const ENTITY_ID = 'entity-employees';
const HR_ROLE = 'role-hr';
const STAFF_ROLE = 'role-staff';

/** Rules opening a field to `roles`: Salary is open to HR only, every other field to both roles. */
function openTo(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId) => ({ ID: `p-${fieldId}-${roleId}`, EntityFieldID: fieldId, RoleID: roleId, ReadAccess: 'Allow', UpdateAccess: 'Allow', CreateAccess: 'Allow' }));
}
const BOTH = [HR_ROLE, STAFF_ROLE];
/** Staff may write Salary without reading it. */
const staffMayWriteSalaryBlind = { ID: 'p-salary-staff', EntityFieldID: 'f-salary', RoleID: STAFF_ROLE, ReadAccess: 'Deny', UpdateAccess: 'Allow', CreateAccess: 'Allow' };

function employeesInit(trackRecordChanges: boolean): Record<string, unknown> {
    return {
        ID: ENTITY_ID,
        Name: 'Employees',
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        AllowUpdateAPI: true,
        TrackRecordChanges: trackRecordChanges,
        EnableFieldLevelSecurity: true,
        Permissions: [],
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false, EntityFieldPermissions: openTo('f-id', BOTH) },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Employees', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true, EntityFieldPermissions: openTo('f-name', BOTH) },
            { ID: 'f-notes', EntityID: ENTITY_ID, Sequence: 3, Name: 'Notes', Entity: 'Employees', Type: 'nvarchar', Length: 400, AllowsNull: true, AllowUpdateAPI: true, EntityFieldPermissions: openTo('f-notes', BOTH) },
            { ID: 'f-salary', EntityID: ENTITY_ID, Sequence: 4, Name: 'Salary', Entity: 'Employees', Type: 'money', AllowsNull: true, AllowUpdateAPI: true, EntityFieldPermissions: [...openTo('f-salary', [HR_ROLE]), staffMayWriteSalaryBlind] },
        ],
    };
}

class MJTestEntity extends BaseEntity {}
const PK = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
const STORED_ROW = { ID: PK, Name: 'Ada', Notes: 'n1', Salary: 123456 };

function userWithRole(roleId: string): UserInfo {
    return new UserInfo(undefined, { ID: 'u-1', Name: 'T', Email: 't@t', IsActive: true, UserRoles: [{ UserID: 'u-1', RoleID: roleId, Role: roleId }] });
}

/**
 * The saving user defaults to staff, who may not read Salary: a staff object never holds it, so
 * it is the field a snapshot must widen. Pass `HR_ROLE` for a user denied nothing.
 */
function setup(trackRecordChanges = true, roleId: string = STAFF_ROLE): { provider: SnapshotTestProvider; entity: MJTestEntity; user: UserInfo } {
    const entityInfo = new EntityInfo(employeesInit(trackRecordChanges));
    const provider = new SnapshotTestProvider();
    provider.storedRow = { ...STORED_ROW };
    const user = userWithRole(roleId);
    const mockMd = {
        Entities: [entityInfo],
        CurrentUser: user,
        SetCachedRecordName: () => { /* noop */ },
        GetCachedRecordName: () => null,
    } as unknown as IMetadataProvider & IEntityDataProvider;
    Metadata.Provider = mockMd as never;
    BaseEntity.Provider = mockMd;
    const entity = new MJTestEntity(entityInfo);
    return { provider, entity, user };
}

function parse(json: string | undefined): Record<string, unknown> {
    return JSON.parse(json ?? '{}') as Record<string, unknown>;
}

describe('GenerateSaveSQL — Record Change snapshot of a narrowed (restricted) object', () => {
    it("FullRecordJSON carries the stored value of a field the saver's object never held", async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' }); // Salary omitted → NotLoaded
        entity.Set('Notes', 'n2');

        await provider.buildSaveSQL(entity, false, user);

        const full = parse(provider.capturedPayload?.fullRecordJSON);
        expect(full.Salary).toBe(123456);
        expect(full.Notes).toBe('n2'); // the user's change overlays the stored row
        expect(full.Name).toBe('Ada');
        expect(Object.keys(full)).toEqual(['ID', 'Name', 'Notes', 'Salary']); // entity field order
    });

    it('ChangesJSON lists only the fields the save changed', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });
        entity.Set('Notes', 'n2');

        await provider.buildSaveSQL(entity, false, user);

        const changes = parse(provider.capturedPayload?.changesJSON);
        expect(Object.keys(changes)).toEqual(['Notes']);
        expect(changes.Notes).toEqual({ field: 'Notes', oldValue: 'n1', newValue: 'n2' });
    });

    it('reads the stored row once, by primary key, only the missing columns and out of the SQL log', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });
        entity.Set('Notes', 'n2');

        await provider.buildSaveSQL(entity, false, user);

        expect(provider.executed).toHaveLength(1);
        const read = provider.executed[0];
        expect(read.sql).toBe(`SELECT [Salary] FROM [dbo].[vwEmployees] WHERE [ID]='${PK}'`);
        expect(read.options?.ignoreLogging).toBe(true);
    });

    it('reads on the connection the save is generated for, when one is named', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });
        entity.Set('Notes', 'n2');
        const transaction = { name: 'the group transaction' };

        await provider['GenerateSaveSQLReadingOn'](entity, false, user, transaction);

        expect(provider.executed).toHaveLength(1);
        expect(provider.executed[0].options?.connectionSource).toBe(transaction);
        expect(parse(provider.capturedPayload?.fullRecordJSON).Salary).toBe(123456);
        // The connection belongs to that one save: a later save of the same object reads on its own.
        await provider.buildSaveSQL(entity, false, user);
        expect(provider.executed[1].options?.connectionSource).toBeUndefined();
    });

    it('a blind write onto a not-loaded field records the stored value as its old value', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });
        entity.SetMany({ Salary: 150000 }); // write-only (the resolver-apply path): the saver never saw the stored 123456

        await provider.buildSaveSQL(entity, false, user);

        const changes = parse(provider.capturedPayload?.changesJSON);
        expect(changes.Salary).toEqual({ field: 'Salary', oldValue: 123456, newValue: 150000 });
        expect(parse(provider.capturedPayload?.fullRecordJSON).Salary).toBe(150000);
    });

    it('falls back to the object-width snapshot when the stored row is gone', async () => {
        const { provider, entity, user } = setup();
        provider.storedRow = null;
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });
        entity.Set('Notes', 'n2');

        await provider.buildSaveSQL(entity, false, user);

        const full = parse(provider.capturedPayload?.fullRecordJSON);
        expect(full).toEqual({ ID: PK, Name: 'Ada', Notes: 'n2' });
    });
});

describe('GenerateSaveSQL — no extra query when nothing needs widening', () => {
    it('a full-width object saves without reading the stored row; payload unchanged', async () => {
        const { provider, entity, user } = setup(true, HR_ROLE);
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1', Salary: 90000 });
        entity.Set('Notes', 'n2');

        await provider.buildSaveSQL(entity, false, user);

        expect(provider.executed).toHaveLength(0);
        expect(parse(provider.capturedPayload?.fullRecordJSON)).toEqual({ ID: PK, Name: 'Ada', Notes: 'n2', Salary: 90000 });
        expect(Object.keys(parse(provider.capturedPayload?.changesJSON))).toEqual(['Notes']);
    });

    it('an unrestricted save of an object loaded without a column reads nothing (a binary column a list load left out)', async () => {
        const { provider, entity, user } = setup(true, HR_ROLE);
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' }); // Salary not loaded, but HR may read it
        entity.Set('Notes', 'n2');

        await provider.buildSaveSQL(entity, false, user);

        expect(provider.executed).toHaveLength(0);
        expect(parse(provider.capturedPayload?.fullRecordJSON)).not.toHaveProperty('Salary');
    });

    it('an unrestricted delete of an object loaded without a column reads nothing', async () => {
        const { provider, entity, user } = setup(true, HR_ROLE);
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });

        await provider.deleteSnapshot(entity, user);

        expect(provider.executed).toHaveLength(0);
    });

    it('an entity that does not track record changes never reads the stored row', async () => {
        const { provider, entity, user } = setup(false);
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });
        entity.Set('Notes', 'n2');

        await provider.buildSaveSQL(entity, false, user);

        expect(provider.executed).toHaveLength(0);
        expect(provider.capturedPayload).toBeNull();
    });
});

describe('GenerateSaveSQL — Record Change snapshot of a create', () => {
    it('a field the INSERT omits (create-suppressed) is not recorded with a value it never got', async () => {
        const { provider, entity, user } = setup(true, HR_ROLE);
        entity.NewRecord();
        entity.Set('ID', PK);
        entity.Set('Name', 'Grace');
        entity.Set('Salary', 999999); // the user typed it, but may not supply it on create
        entity.GetFieldByName('Salary')!.SetCreateSuppressed(true);

        await provider.buildSaveSQL(entity, true, user);

        const full = parse(provider.capturedPayload?.fullRecordJSON);
        expect(full).not.toHaveProperty('Salary');
        expect(full.Name).toBe('Grace');
        expect(provider.executed).toHaveLength(0); // no stored row exists before an INSERT
    });

    it('an unrestricted create records every field and reads nothing', async () => {
        const { provider, entity, user } = setup(true, HR_ROLE);
        entity.NewRecord();
        entity.Set('ID', PK);
        entity.Set('Name', 'Grace');
        entity.Set('Salary', 80000);

        await provider.buildSaveSQL(entity, true, user);

        const full = parse(provider.capturedPayload?.fullRecordJSON);
        expect(full).toMatchObject({ ID: PK, Name: 'Grace', Salary: 80000 });
        expect(provider.executed).toHaveLength(0);
    });
});

describe('Delete — Record Change snapshot of a narrowed (restricted) object', () => {
    it("the delete snapshot carries the stored value of a field the deleter's object never held", async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' }); // Salary omitted → NotLoaded

        const snapshot = await provider.deleteSnapshot(entity, user);

        expect(snapshot).toEqual(STORED_ROW);
        expect(provider.executed).toHaveLength(1);
    });

    it('a full-width object deletes without reading the stored row', async () => {
        const { provider, entity, user } = setup(true, HR_ROLE);
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1', Salary: 90000 });

        const snapshot = await provider.deleteSnapshot(entity, user);

        expect(snapshot).toEqual({ ID: PK, Name: 'Ada', Notes: 'n1', Salary: 90000 });
        expect(provider.executed).toHaveLength(0);
    });

    it('a delete that skips record changes never reads the stored row', async () => {
        const { provider, entity, user } = setup();
        entity.Hydrate({ ID: PK, Name: 'Ada', Notes: 'n1' });

        await provider.deleteSnapshot(entity, user, { SkipRecordChanges: true } as EntityDeleteOptions);

        expect(provider.executed).toHaveLength(0);
    });
});
