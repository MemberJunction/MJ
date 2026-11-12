/**
 * Adversarial lifecycle tests for `TransactionGroupBase` and `DatabaseProviderBase`
 * `TransactionGroup` save/delete callbacks:
 *  - Partial-failure (`overallSuccess === false` without throw) rolls back rather than committing
 *    and suppresses post-save callbacks/hooks on earlier items.
 *  - `ValidateDeleteResult` failure (`[{ ID: null }]`) inside a `TransactionGroup` delete throws
 *    and rolls back the group instead of committing partial work.
 *  - `bNewRecord` DB-generated primary keys are hydrated before `OnSaveCompleted` and
 *    `OnAfterSaveExecute`, and `OnSaveCompleted` executes before `OnAfterSaveExecute` (so a
 *    throwing `OnSaveCompleted` prevents fire-and-forget post-save hooks from firing).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
    BaseEntity,
    BaseEntityResult,
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

interface PlannedOutcome {
    Row: RowMap;
    Success: boolean;
}

class ProgrammableTransactionGroup extends TransactionGroupBase {
    public readonly Events: string[] = [];
    public PlannedOutcomes: PlannedOutcome[] = [];
    private _open = false;

    protected override BeginGroupTransaction(): Promise<void> {
        this._open = true;
        this.Events.push('begin');
        return Promise.resolve();
    }

    protected override async HandleSubmit(): Promise<TransactionResult[]> {
        this.Events.push('execute');
        return this.PendingTransactions.map((t, index) => {
            const outcome = this.PlannedOutcomes[index] ?? {
                Row: { ID: `gen-id-${index}`, Name: `Widget ${index}` },
                Success: true,
            };
            return new TransactionResult(t, { ...outcome.Row }, outcome.Success);
        });
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

class LifecycleTestProvider extends DatabaseProviderBase {
    public Group = new ProgrammableTransactionGroup();
    public readonly HookCalls: Array<{ Hook: string; PrimaryKeyValue: RowValue }> = [];
    public OnSaveCompletedError: Error | null = null;

    private static readonly _uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    private static readonly _defaultPattern = /^\s*\(?\s*(newid|newsequentialid)\s*\(\s*\)\s*\)?\s*$/i;

    protected get UUIDPattern(): RegExp {
        return LifecycleTestProvider._uuidPattern;
    }
    protected get DBDefaultPattern(): RegExp {
        return LifecycleTestProvider._defaultPattern;
    }
    public get InstanceConnectionString(): string {
        return 'test://tx-group-lifecycle';
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
            fullSQL: 'EXEC spSaveWidget',
            simpleSQL: 'EXEC spSaveWidget',
        });
    }

    protected override GenerateDeleteSQL(_entity: BaseEntity, _user: UserInfo): DeleteSQLResult {
        return { fullSQL: 'EXEC spDeleteWidget' };
    }

    protected override async CheckCreateRLS(): Promise<boolean> {
        return true;
    }

    protected override async CheckRecordRLS(
        _entity: BaseEntity,
        _user: UserInfo,
        _type: EntityPermissionType,
    ): Promise<boolean> {
        return true;
    }

    protected override async CheckUpdateRLSPostImage(
        _entity: BaseEntity,
        _user: UserInfo,
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
        const pkValue = entity.PrimaryKey.KeyValuePairs[0]?.Value as RowValue;
        this.HookCalls.push({ Hook: 'OnSaveCompleted', PrimaryKeyValue: pkValue });
        this.Group.Events.push('onSaveCompleted');
        if (this.OnSaveCompletedError) {
            throw this.OnSaveCompletedError;
        }
        return null;
    }

    protected override OnAfterSaveExecute(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions,
        _context: SaveContext,
    ): void {
        const pkValue = entity.PrimaryKey.KeyValuePairs[0]?.Value as RowValue;
        this.HookCalls.push({ Hook: 'OnAfterSaveExecute', PrimaryKeyValue: pkValue });
        this.Group.Events.push('onAfterSaveExecute');
    }

    protected override OnAfterDeleteExecute(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntityDeleteOptions,
    ): void {
        const pkValue = entity.PrimaryKey.KeyValuePairs[0]?.Value as RowValue;
        this.HookCalls.push({ Hook: 'OnAfterDeleteExecute', PrimaryKeyValue: pkValue });
        this.Group.Events.push('onAfterDeleteExecute');
    }

    protected async GetCurrentMetadataVersion(): Promise<{ VersionNumber: number }> {
        return { VersionNumber: 1 };
    }
    protected async LoadAllMetadata(): Promise<void> {}
    public async GetEntityRecordName(_input: EntityRecordNameInput): Promise<EntityRecordNameResult> {
        return { EntityName: '', RecordID: '', RecordName: '', Success: false };
    }
    public async GetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
        return [];
    }
    public async MergeRecords(_request: EntityMergeOptions): Promise<EntityMergeResult> {
        throw new Error('Not implemented');
    }
    public async GetRecordDuplicates(_params: PotentialDuplicateRequest): Promise<PotentialDuplicateResponse> {
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

class TestWidgetEntity extends BaseEntity {
    public constructor(entityInfo: EntityInfo) {
        super(entityInfo);
    }
    public override CheckPermissions(): boolean {
        return true;
    }
    public get ID(): string | null {
        const f = this.Fields.find((field) => field.Name === 'ID');
        return (f?.Value as string | null) ?? null;
    }
    public set ID(val: string | null) {
        const f = this.Fields.find((field) => field.Name === 'ID');
        if (f) {
            f.Value = val;
        }
    }
    public get Name(): string | null {
        const f = this.Fields.find((field) => field.Name === 'Name');
        return (f?.Value as string | null) ?? null;
    }
    public set Name(val: string | null) {
        const f = this.Fields.find((field) => field.Name === 'Name');
        if (f) {
            f.Value = val;
        }
    }
}

function makeWidgetEntityInfo(dbAutoAssignPk = false): EntityInfo {
    return new EntityInfo({
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
        TrackRecordChanges: true,
        EntityFields: [
            {
                ID: 'f-1',
                EntityID: '11111111-1111-1111-1111-111111111111',
                Name: 'ID',
                Type: dbAutoAssignPk ? 'int' : 'uniqueidentifier',
                Length: dbAutoAssignPk ? 4 : 16,
                AutoIncrement: dbAutoAssignPk,
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
        ],
    });
}

describe('TransactionGroupBase & DatabaseProviderBase TransactionGroup lifecycle guarantees', () => {
    const previousMetadataProvider = Metadata.Provider;
    const previousEntityProvider = BaseEntity.Provider;
    const testUser = { ID: 'user-1', Email: 'test@example.com', UserRoles: [] } as object as UserInfo;

    afterEach(() => {
        Metadata.Provider = previousMetadataProvider;
        BaseEntity.Provider = previousEntityProvider;
    });

    it('rolls back (and never commits or fires post-save hooks on Item 0) when Item 1 returns Success=false without throwing', async () => {
        const provider = new LifecycleTestProvider();
        Metadata.Provider = provider as object as IMetadataProvider;
        BaseEntity.Provider = provider;

        const info = makeWidgetEntityInfo(false);
        const item0 = new TestWidgetEntity(info);
        item0.ContextCurrentUser = testUser;
        item0.NewRecord();
        item0.ID = '22222222-2222-2222-2222-222222222222';
        item0.Name = 'Item Zero';

        const item1 = new TestWidgetEntity(info);
        item1.ContextCurrentUser = testUser;
        await item1.LoadFromData({ ID: '33333333-3333-3333-3333-333333333333', Name: 'Stale Row' }, true);
        item1.Name = 'Updated Row';

        const tg = await provider.CreateTransactionGroup();
        provider.Group.PlannedOutcomes = [
            { Row: { ID: '22222222-2222-2222-2222-222222222222', Name: 'Item Zero' }, Success: true },
            { Row: {}, Success: false },
        ];

        item0.TransactionGroup = tg;
        item1.TransactionGroup = tg;
        expect(await item0.Save()).toBe(true);
        expect(await item1.Save()).toBe(true);
        expect(tg.PendingTransactions).toHaveLength(2);

        const ok = await tg.Submit();

        expect(ok).toBe(false);
        expect(tg.Status).toBe('Failed');
        expect(provider.Group.Events).toEqual(['begin', 'execute', 'rollback']);
        expect(provider.Group.Events).not.toContain('commit');
        expect(provider.HookCalls).toEqual([]);
        expect(item0.LatestResult?.Success).toBe(false);
        expect(item1.LatestResult?.Success).toBe(false);
    });

    it('throws on ValidateDeleteResult failure (e.g. SELECT NULL AS [ID]) inside a TransactionGroup and rolls back the entire group', async () => {
        const provider = new LifecycleTestProvider();
        Metadata.Provider = provider as object as IMetadataProvider;
        BaseEntity.Provider = provider;

        const info = makeWidgetEntityInfo(false);
        const savedSibling = new TestWidgetEntity(info);
        savedSibling.ContextCurrentUser = testUser;
        savedSibling.NewRecord();
        savedSibling.ID = '44444444-4444-4444-4444-444444444444';
        savedSibling.Name = 'Sibling Insert';

        const missingDelete = new TestWidgetEntity(info);
        missingDelete.ContextCurrentUser = testUser;
        await missingDelete.LoadFromData({
            ID: '55555555-5555-5555-5555-555555555555',
            Name: 'Already Gone',
        });

        const tg = await provider.CreateTransactionGroup();
        provider.Group.PlannedOutcomes = [
            { Row: { ID: '44444444-4444-4444-4444-444444444444', Name: 'Sibling Insert' }, Success: true },
            // Simulates SQL Server TrackRecordChanges 0-row delete returning [{ ID: null }] with Success=true
            { Row: { ID: null }, Success: true },
        ];

        savedSibling.TransactionGroup = tg;
        missingDelete.TransactionGroup = tg;
        await savedSibling.Save();
        await missingDelete.Delete();

        const ok = await tg.Submit();

        expect(ok).toBe(false);
        expect(tg.Status).toBe('Failed');
        expect(provider.Group.Events).toContain('rollback');
        expect(provider.Group.Events).not.toContain('commit');
        expect(provider.HookCalls.some((c) => c.Hook === 'OnAfterDeleteExecute')).toBe(false);
        expect(missingDelete.LatestResult?.Success).toBe(false);
    });

    it('hydrates DB-generated PKs on bNewRecord before OnSaveCompleted and runs OnSaveCompleted before OnAfterSaveExecute', async () => {
        const provider = new LifecycleTestProvider();
        Metadata.Provider = provider as object as IMetadataProvider;
        BaseEntity.Provider = provider;

        const info = makeWidgetEntityInfo(true);
        const newAutoPkEntity = new TestWidgetEntity(info);
        newAutoPkEntity.ContextCurrentUser = testUser;
        newAutoPkEntity.NewRecord();
        newAutoPkEntity.Name = 'Server Assigned PK';
        expect(newAutoPkEntity.PrimaryKey.KeyValuePairs[0]?.Value).toBeNull();

        const tg = await provider.CreateTransactionGroup();
        provider.Group.PlannedOutcomes = [
            { Row: { ID: '9001', Name: 'Server Assigned PK' }, Success: true },
        ];

        newAutoPkEntity.TransactionGroup = tg;
        await newAutoPkEntity.Save();

        const ok = await tg.Submit();

        expect(ok).toBe(true);
        expect(tg.Status).toBe('Complete');
        expect(provider.HookCalls).toEqual([
            { Hook: 'OnSaveCompleted', PrimaryKeyValue: '9001' },
            { Hook: 'OnAfterSaveExecute', PrimaryKeyValue: '9001' },
        ]);
        expect(provider.Group.Events).toEqual([
            'begin',
            'execute',
            'onSaveCompleted',
            'onAfterSaveExecute',
            'commit',
        ]);
    });

    it('does not launch OnAfterSaveExecute when OnSaveCompleted throws inside a TransactionGroup callback', async () => {
        const provider = new LifecycleTestProvider();
        provider.OnSaveCompletedError = new Error('In-transaction post-save failure');
        Metadata.Provider = provider as object as IMetadataProvider;
        BaseEntity.Provider = provider;

        const info = makeWidgetEntityInfo(true);
        const entity = new TestWidgetEntity(info);
        entity.ContextCurrentUser = testUser;
        entity.NewRecord();
        entity.Name = 'Rollback Before FireAndForget';

        const tg = await provider.CreateTransactionGroup();
        provider.Group.PlannedOutcomes = [
            { Row: { ID: '9002', Name: 'Rollback Before FireAndForget' }, Success: true },
        ];
        entity.TransactionGroup = tg;
        await entity.Save();

        const ok = await tg.Submit();

        expect(ok).toBe(false);
        expect(tg.Status).toBe('Failed');
        expect(provider.HookCalls).toEqual([
            { Hook: 'OnSaveCompleted', PrimaryKeyValue: '9002' },
        ]);
        expect(provider.Group.Events).toEqual([
            'begin',
            'execute',
            'onSaveCompleted',
            'rollback',
        ]);
    });
});

/**
 * A provider whose queued-update concurrency check is scripted per entity name value, recording
 * when each check is prepared and run relative to the group's lifecycle events.
 */
class ConcurrencyCheckingProvider extends LifecycleTestProvider {
    /** Name value of an update whose check rejects; every other check passes. */
    public RejectName: string | null = null;
    public readonly Prepared: string[] = [];

    protected override PrepareQueuedUpdateConcurrencyCheck(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions,
        entityResult: BaseEntityResult,
    ): (() => Promise<boolean>) | null {
        const name = String(entity.Get('Name'));
        this.Prepared.push(name);
        return async () => {
            this.Group.Events.push(`check:${name}`);
            if (name !== this.RejectName) {
                return true;
            }
            entityResult.Success = false;
            entityResult.Message = `Concurrent modification conflict on Widgets for field(s): Name.`;
            entityResult.ConcurrencyConflict = { ConflictingFields: ['Name'] };
            return false;
        };
    }
}

describe('TransactionGroup pre-submit concurrency checks', () => {
    const previousMetadataProvider = Metadata.Provider;
    const previousEntityProvider = BaseEntity.Provider;
    const testUser = { ID: 'user-1', Email: 'test@example.com', UserRoles: [] } as object as UserInfo;

    afterEach(() => {
        Metadata.Provider = previousMetadataProvider;
        BaseEntity.Provider = previousEntityProvider;
    });

    function useProvider(): ConcurrencyCheckingProvider {
        const provider = new ConcurrencyCheckingProvider();
        Metadata.Provider = provider as object as IMetadataProvider;
        BaseEntity.Provider = provider;
        return provider;
    }

    async function loadedWidget(id: string, newName: string): Promise<TestWidgetEntity> {
        const widget = new TestWidgetEntity(makeWidgetEntityInfo(false));
        widget.ContextCurrentUser = testUser;
        await widget.LoadFromData({ ID: id, Name: 'Loaded Name' }, true);
        widget.Name = newName;
        return widget;
    }

    function newWidget(id: string, name: string): TestWidgetEntity {
        const widget = new TestWidgetEntity(makeWidgetEntityInfo(false));
        widget.ContextCurrentUser = testUser;
        widget.NewRecord();
        widget.ID = id;
        widget.Name = name;
        return widget;
    }

    it('prepares a check for queued updates only, and runs it inside the transaction before any statement', async () => {
        const provider = useProvider();
        const created = newWidget('22222222-2222-2222-2222-222222222222', 'Created');
        const updated = await loadedWidget('33333333-3333-3333-3333-333333333333', 'Updated');
        const tg = await provider.CreateTransactionGroup();
        created.TransactionGroup = tg;
        updated.TransactionGroup = tg;
        await created.Save();
        await updated.Save();

        expect(provider.Prepared).toEqual(['Updated']);
        expect(await tg.Submit()).toBe(true);
        expect(provider.Group.Events.slice(0, 3)).toEqual(['begin', 'check:Updated', 'execute']);
        expect(provider.Group.Events).toContain('commit');
    });

    it('rolls back without executing any statement when a check rejects, and keeps the conflict on that item', async () => {
        const provider = useProvider();
        provider.RejectName = 'Stale';
        const sibling = newWidget('44444444-4444-4444-4444-444444444444', 'Sibling');
        const stale = await loadedWidget('55555555-5555-5555-5555-555555555555', 'Stale');
        const tg = await provider.CreateTransactionGroup();
        sibling.TransactionGroup = tg;
        stale.TransactionGroup = tg;
        await sibling.Save();
        await stale.Save();

        expect(await tg.Submit()).toBe(false);
        expect(tg.Status).toBe('Failed');
        expect(provider.Group.Events).toEqual(['begin', 'check:Stale', 'rollback']);
        expect(provider.HookCalls).toEqual([]);
        expect(stale.LatestResult?.Success).toBe(false);
        expect(stale.LatestResult?.ConcurrencyConflict?.ConflictingFields).toEqual(['Name']);
        expect(stale.LatestResult?.Message).toContain('Concurrent modification conflict');
        expect(sibling.LatestResult?.Success).toBe(false);
        expect(sibling.LatestResult?.Message).toContain('another item in the group failed its pre-submit check');
    });

    it('runs every check even after one rejects, so each conflicting item reports its own reason', async () => {
        const provider = useProvider();
        provider.RejectName = 'First';
        const first = await loadedWidget('66666666-6666-6666-6666-666666666666', 'First');
        const second = await loadedWidget('77777777-7777-7777-7777-777777777777', 'Second');
        const tg = await provider.CreateTransactionGroup();
        first.TransactionGroup = tg;
        second.TransactionGroup = tg;
        await first.Save();
        await second.Save();

        expect(await tg.Submit()).toBe(false);
        expect(provider.Group.Events).toEqual(['begin', 'check:First', 'check:Second', 'rollback']);
    });
});
