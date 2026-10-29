/**
 * Verifies that `DatabaseProviderBase.Save()` invokes `OnSaveCompleted` on the
 * `TransactionGroup` path (matching the direct-save lifecycle), merges returned
 * patches (e.g. geocoding coordinates) onto the transaction result before
 * `BaseEntity.finalizeSave()` hydrates from it, and rolls back via
 * `RollbackGroupTransaction()` if `OnSaveCompleted` throws.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
    BaseEntity,
    DatabaseProviderBase,
    DeleteSQLResult,
    EntityDeleteOptions,
    EntityInfo,
    EntityMergeOptions,
    EntityMergeResult,
    EntityPermissionType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    EntitySaveOptions,
    ExecuteSQLOptions,
    IMetadataProvider,
    Metadata,
    PotentialDuplicateRequest,
    PotentialDuplicateResponse,
    QueryInfo,
    RunQuerySQLFilterManager,
    SaveContext,
    SaveSQLResult,
    TransactionGroupBase,
    TransactionResult,
    UserInfo,
} from '../index';

type RowValue = string | number | boolean | null | undefined;
type RowMap = Record<string, RowValue>;

class LifecycleTrackingGroup extends TransactionGroupBase {
    public readonly Events: string[] = [];
    private _open = false;

    protected override BeginGroupTransaction(): Promise<void> {
        this._open = true;
        this.Events.push('begin');
        return Promise.resolve();
    }

    protected override async HandleSubmit(): Promise<TransactionResult[]> {
        this.Events.push('execute');
        return this.PendingTransactions.map(
            (t) => new TransactionResult(t, { ID: 'rec-1', Name: 'Widget A' }, true),
        );
    }

    protected override async CommitGroupTransaction(): Promise<void> {
        if (this._open) {
            this._open = false;
            this.Events.push('commit');
        }
    }

    protected override async RollbackGroupTransaction(): Promise<void> {
        if (this._open) {
            this._open = false;
            this.Events.push('rollback');
        }
    }

    public get IsOpen(): boolean {
        return this._open;
    }
}

class TestTransactionSaveProvider extends DatabaseProviderBase {
    public readonly Group = new LifecycleTrackingGroup();
    public OnSaveCompletedPatches: RowMap | null = null;
    public OnSaveCompletedError: Error | null = null;
    public AllowCreateRLS = true;
    public OnSaveCompletedSawOpenTx = false;
    public OnSaveCompletedCalls = 0;

    private static readonly _uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    private static readonly _defaultPattern = /^\s*\(?\s*(newid|newsequentialid)\s*\(\s*\)\s*\)?\s*$/i;

    protected get UUIDPattern(): RegExp {
        return TestTransactionSaveProvider._uuidPattern;
    }
    protected get DBDefaultPattern(): RegExp {
        return TestTransactionSaveProvider._defaultPattern;
    }
    public get InstanceConnectionString(): string {
        return 'test://tx-group';
    }
    protected get AllowRefresh(): boolean {
        return true;
    }
    public get ConfigData(): { TrustLocalCacheCompletely: boolean } {
        return { TrustLocalCacheCompletely: false };
    }

    public override QuoteIdentifier(name: string): string {
        return `[${name}]`;
    }
    public override QuoteSchema(sql: string): string {
        return sql;
    }
    protected override GetQuerySQLFilterManager(): RunQuerySQLFilterManager {
        throw new Error('Not implemented');
    }
    public override async ExecuteSQL<T>(
        _sql?: string,
        _params?: RowValue[],
        _options?: ExecuteSQLOptions,
        _contextUser?: UserInfo,
    ): Promise<Array<T>> {
        return [];
    }
    public override async BeginTransaction(): Promise<void> {}
    public override async CommitTransaction(): Promise<void> {}
    public override async RollbackTransaction(): Promise<void> {}

    public override async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        return this.Group;
    }

    protected override GenerateSaveSQL(
        _entity: BaseEntity,
        _isNew: boolean,
        _user: UserInfo,
    ): Promise<SaveSQLResult> {
        return Promise.resolve({
            fullSQL: 'EXEC spCreateWidget',
            simpleSQL: 'EXEC spCreateWidget',
        });
    }

    protected override GenerateDeleteSQL(_entity: BaseEntity, _user: UserInfo): DeleteSQLResult {
        return { fullSQL: 'EXEC spDeleteWidget' };
    }

    protected override async CheckCreateRLS(
        _entity: BaseEntity,
        _user: UserInfo,
    ): Promise<boolean> {
        return this.AllowCreateRLS;
    }

    protected override async CheckRecordRLS(
        _entity: BaseEntity,
        _user: UserInfo,
        _type: EntityPermissionType,
    ): Promise<boolean> {
        return true;
    }

    protected override async OnSaveCompleted(
        entity: BaseEntity,
        sqlDetails: SaveSQLResult,
        user: UserInfo,
        options: EntitySaveOptions,
        context: SaveContext,
    ): Promise<RowMap | null> {
        await super.OnSaveCompleted(entity, sqlDetails, user, options, context);
        this.OnSaveCompletedCalls++;
        this.OnSaveCompletedSawOpenTx = this.Group.IsOpen;
        this.Group.Events.push('onSaveCompleted');
        if (this.OnSaveCompletedError) {
            throw this.OnSaveCompletedError;
        }
        return this.OnSaveCompletedPatches;
    }

    protected async GetCurrentMetadataVersion(): Promise<{ VersionNumber: number }> {
        return { VersionNumber: 1 };
    }
    protected async LoadAllMetadata(): Promise<void> {}
    public async GetEntityRecordName(
        _input: EntityRecordNameInput,
        _contextUser?: UserInfo,
    ): Promise<EntityRecordNameResult> {
        return { EntityName: '', RecordID: '', RecordName: '', Success: false };
    }
    public async GetEntityRecordNames(
        _info: EntityRecordNameInput[],
        _contextUser?: UserInfo,
    ): Promise<EntityRecordNameResult[]> {
        return [];
    }
    public async MergeRecords(
        _request: EntityMergeOptions,
        _contextUser?: UserInfo,
        _options?: EntityMergeOptions,
    ): Promise<EntityMergeResult> {
        throw new Error('Not implemented');
    }
    public async GetRecordDuplicates(
        _params: PotentialDuplicateRequest,
        _contextUser?: UserInfo,
    ): Promise<PotentialDuplicateResponse> {
        throw new Error('Not implemented');
    }
    protected async InternalRunView(): Promise<{ Results: []; TotalRowCount: number }> {
        return { Results: [], TotalRowCount: 0 };
    }
    protected async InternalRunViews(): Promise<{ Results: []; TotalRowCount: number }[]> {
        return [];
    }
    protected async InternalRunQuery(_params: { Query?: QueryInfo }): Promise<{ Results: [] }> {
        return { Results: [] };
    }
    protected async InternalRunQueries(): Promise<{ Results: [] }[]> {
        return [];
    }
}

function makeFakeWidgetEntity(provider: TestTransactionSaveProvider, user: UserInfo): BaseEntity {
    const entityInfo = new EntityInfo({
        ID: '11111111-1111-1111-1111-111111111111',
        Name: 'Widgets',
        Status: 'Active',
        BaseTable: 'Widget',
        BaseTableCodeName: 'Widget',
        BaseView: 'vwWidgets',
        SchemaName: 'dbo',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: [
            {
                ID: 'f-1',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: 'ID',
                Type: 'uniqueidentifier',
                Length: 16,
                IsPrimaryKey: true,
                IsUnique: true,
                AllowsNull: false,
                AllowUpdateAPI: false,
                Status: 'Active',
                Sequence: 1,
            },
            {
                ID: 'f-2',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: 'Name',
                Type: 'nvarchar',
                Length: 200,
                IsPrimaryKey: false,
                AllowsNull: false,
                AllowUpdateAPI: true,
                Status: 'Active',
                Sequence: 2,
            },
            {
                ID: 'f-3',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: '__mj_Latitude',
                Type: 'decimal',
                Precision: 9,
                Scale: 6,
                IsPrimaryKey: false,
                AllowsNull: true,
                IsVirtual: true,
                AllowUpdateAPI: false,
                Status: 'Active',
                Sequence: 3,
            },
            {
                ID: 'f-4',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: '__mj_Longitude',
                Type: 'decimal',
                Precision: 9,
                Scale: 6,
                IsPrimaryKey: false,
                AllowsNull: true,
                IsVirtual: true,
                AllowUpdateAPI: false,
                Status: 'Active',
                Sequence: 4,
            },
        ],
    });
    Metadata.Provider = provider as object as IMetadataProvider;
    BaseEntity.Provider = provider;
    const entity = new (class extends BaseEntity {
        public constructor() {
            super(entityInfo);
        }
        public override CheckPermissions(): boolean {
            return true;
        }
    })();
    entity.ContextCurrentUser = user;
    entity.NewRecord();
    entity.Set('ID', '22222222-2222-2222-2222-222222222222');
    entity.Set('Name', 'Widget A');
    return entity;
}

describe('DatabaseProviderBase.Save — TransactionGroup OnSaveCompleted lifecycle (1.3)', () => {
    const previousMetadataProvider = Metadata.Provider;
    const previousEntityProvider = BaseEntity.Provider;
    const testUser = { ID: 'user-1', Email: 'test@example.com', UserRoles: [] } as object as UserInfo;

    afterEach(() => {
        Metadata.Provider = previousMetadataProvider;
        BaseEntity.Provider = previousEntityProvider;
    });

    it('runs OnSaveCompleted while the group transaction is still open and merges patches before finalizeSave', async () => {
        const provider = new TestTransactionSaveProvider();
        provider.OnSaveCompletedPatches = {
            __mj_Latitude: 30.2672,
            __mj_Longitude: -97.7431,
        };

        const entity = makeFakeWidgetEntity(provider, testUser);
        const tg = await provider.CreateTransactionGroup();
        entity.TransactionGroup = tg;

        const queued = await entity.Save();
        expect(entity.LatestResult?.CompleteMessage ?? '').toBe('');
        expect(queued).toBe(true);
        expect(provider.OnSaveCompletedCalls).toBe(0);

        const submitted = await tg.Submit();
        expect(submitted).toBe(true);
        expect(provider.OnSaveCompletedCalls).toBe(1);
        expect(provider.OnSaveCompletedSawOpenTx).toBe(true);
        expect(provider.Group.Events).toEqual([
            'begin',
            'execute',
            'onSaveCompleted',
            'commit',
        ]);
        expect(entity.Get('__mj_Latitude')).toBe(30.2672);
        expect(entity.Get('__mj_Longitude')).toBe(-97.7431);
    });

    it('rolls back the group transaction if OnSaveCompleted throws instead of committing partial work', async () => {
        const provider = new TestTransactionSaveProvider();
        provider.OnSaveCompletedError = new Error('Sibling propagation failed');

        const entity = makeFakeWidgetEntity(provider, testUser);
        const tg = await provider.CreateTransactionGroup();
        entity.TransactionGroup = tg;

        await entity.Save();
        const submitted = await tg.Submit();

        expect(submitted).toBe(false);
        expect(tg.Status).toBe('Failed');
        expect(provider.Group.Events).toEqual([
            'begin',
            'execute',
            'onSaveCompleted',
            'rollback',
        ]);
    });

    it('never deadlocks TransactionGroup.Submit() when pre-save RLS fails before AddTransaction', async () => {
        const provider = new TestTransactionSaveProvider();
        provider.AllowCreateRLS = false;

        const entity = makeFakeWidgetEntity(provider, testUser);
        const tg = await provider.CreateTransactionGroup();
        entity.TransactionGroup = tg;

        const queued = await entity.Save();
        expect(queued).toBe(false);
        expect(tg.PreprocessingComplete()).toBe(true);
        expect(await tg.Submit()).toBe(true);
        expect(tg.Status).toBe('Pending');
    });
});
