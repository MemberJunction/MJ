import { describe, it, expect } from 'vitest';
import {
    BaseEntity,
    DatabaseProviderBase,
    EntityInfo,
    EntitySaveOptions,
    EntityTransactionScope,
    ExecuteSQLOptions,
    ProviderConfigDataBase,
    ProviderType,
    RunQueryParams,
    RunQueryResult,
    RunViewParams,
    RunViewResult,
    SaveContext,
    SaveSQLResult,
    TransactionGroupBase,
    TransactionItem,
    TransactionResult,
    UserInfo,
} from '../index';

class EnlistmentTestProvider extends DatabaseProviderBase {
    public EnlistSave = false;
    public FailDurableHook = false;
    public readonly Events: string[] = [];
    public ObservedPkInDurableHook: string | null = null;
    private txDepth = 0;

    protected get ProviderType(): ProviderType { return ProviderType.Database; }
    protected get AllowRefresh(): boolean { return false; }
    public override get InstanceConnectionString(): string { return 'test://durable'; }
    protected async ConfigCheck(): Promise<boolean> { return true; }

    public override async BeginTransaction(): Promise<void> {
        this.txDepth++;
        this.Events.push(`begin:${this.txDepth}`);
    }
    public override async CommitTransaction(): Promise<void> {
        this.Events.push(`commit:${this.txDepth}`);
        this.txDepth--;
    }
    public override async RollbackTransaction(): Promise<void> {
        this.Events.push(`rollback:${this.txDepth}`);
        this.txDepth--;
    }

    public override async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        await this.BeginTransaction();
        let settled = false;
        return {
            IsNested: this.txDepth > 1,
            Commit: async () => {
                if (!settled) {
                    settled = true;
                    await this.CommitTransaction();
                }
            },
            Rollback: async () => {
                if (!settled) {
                    settled = true;
                    await this.RollbackTransaction();
                }
            },
        };
    }

    protected override async ShouldEnlistSaveInTransaction(): Promise<boolean> {
        return this.EnlistSave;
    }

    protected override async OnDurableAfterSaveExecute(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions,
        _context: SaveContext,
    ): Promise<void> {
        this.ObservedPkInDurableHook = entity.PrimaryKey.ToConcatenatedString();
        this.Events.push(`durable-after-save:tx=${this.txDepth}`);
        if (this.FailDurableHook) {
            throw new Error('durable outbox write failed');
        }
    }

    protected override OnAfterSaveExecute(): void {
        this.Events.push(`inline-after-save:tx=${this.txDepth}`);
    }

    protected override async GenerateSaveSQL(): Promise<SaveSQLResult> {
        return { fullSQL: 'INSERT INTO Orders OUTPUT INSERTED.* VALUES (@p0)', parameters: ['val'] };
    }

    protected override GenerateDeleteSQL(): { fullSQL: string } {
        return { fullSQL: 'DELETE FROM Orders' };
    }

    protected override async CheckRecordRLS(): Promise<boolean> { return true; }
    protected override async CheckCreateRLS(): Promise<boolean> { return true; }
    protected override async CheckUpdateRLSPostImage(): Promise<boolean> { return true; }
    public override QuoteIdentifier(name: string): string { return `[${name}]`; }
    public override QuoteSchemaAndView(schemaName: string, objectName: string): string { return `[${schemaName}].[${objectName}]`; }
    protected override get UUIDFunctionPattern(): RegExp { return /^NEWID\(\)$/i; }
    protected override get DBDefaultFunctionPattern(): RegExp { return /^GETUTCDATE\(\)$/i; }
    protected override async InternalExecuteQueryFromSpec(): Promise<RunQueryResult> {
        return { QueryID: '', QueryName: '', Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }
    protected override BuildChildDiscoverySQL(): string { return ''; }
    protected override BuildHardLinkDependencySQL(): string { return ''; }
    protected override BuildSoftLinkDependencySQL(): string { return ''; }
    protected override BuildRecordChangeSQL(): { sql: string; parameters?: string[] } | null { return null; }
    protected override BuildSiblingRecordChangeSQL(): string { return ''; }

    public override async ExecuteSQL<T>(
        _sql?: string,
        _parameters?: string[] | number[] | boolean[] | null,
        _options?: ExecuteSQLOptions,
        _contextUser?: UserInfo,
    ): Promise<Array<T>> {
        this.Events.push(`sql:tx=${this.txDepth}`);
        const row: Record<string, string> = { ID: 'db-generated-id-99', Name: 'Saved Order' };
        return [row as T];
    }

    public override async ExecuteSQLBatch(): Promise<Record<string, string>[][]> { return []; }
    protected async InternalRunView<T>(_params: RunViewParams, _contextUser?: UserInfo): Promise<RunViewResult<T>> {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(_params: RunViewParams[], _contextUser?: UserInfo): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(_params: RunQueryParams, _contextUser?: UserInfo): Promise<RunQueryResult> {
        return { QueryID: '', QueryName: '', Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }
    protected async InternalRunQueries(_params: RunQueryParams[], _contextUser?: UserInfo): Promise<RunQueryResult[]> { return []; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { throw new Error('unused'); }
    public async ExecuteTransaction(_items: TransactionItem[]): Promise<TransactionResult[]> { return []; }
    public async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(this, { ID: 'u1', Name: 'Test', Email: 't@e.com', UserRoles: [] }); }
    protected createConfigData(): ProviderConfigDataBase { return new ProviderConfigDataBase({}, '__mj'); }
}

class FakeOrderEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

function createFakeNewEntity(provider: DatabaseProviderBase): BaseEntity {
    const entityInfo = new EntityInfo({
        ID: 'ent-orders',
        Name: 'Orders',
        BaseTable: 'Order',
        BaseView: 'vwOrders',
        SchemaName: '__mj',
        TrackRecordChanges: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: [
            { ID: 'f1', EntityID: 'ent-orders', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, AllowsNull: false },
            { ID: 'f2', EntityID: 'ent-orders', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2, AllowsNull: false },
        ],
    });
    const entity = new FakeOrderEntity(entityInfo, provider);
    const nameField = entity.GetFieldByName('Name');
    if (nameField) {
        nameField.Value = 'Draft Order';
    }
    return entity;
}

describe('DatabaseProviderBase durable after-save transactional enlistment', () => {
    it('skips BeginEntityTransaction when ShouldEnlistSaveInTransaction returns false', async () => {
        const provider = new EnlistmentTestProvider();
        provider.EnlistSave = false;
        const user = new UserInfo(provider, { ID: 'u1', Name: 'Admin', Email: 'admin@example.com', UserRoles: [] });
        const entity = createFakeNewEntity(provider);

        await provider.Save(entity, user, new EntitySaveOptions());
        expect(provider.Events).toEqual(['sql:tx=0', 'inline-after-save:tx=0']);
    });

    it('wraps ExecuteSQL and OnDurableAfterSaveExecute inside BeginEntityTransaction and populates DB-generated PKs before durable submission', async () => {
        const provider = new EnlistmentTestProvider();
        provider.EnlistSave = true;
        const user = new UserInfo(provider, { ID: 'u1', Name: 'Admin', Email: 'admin@example.com', UserRoles: [] });
        const entity = createFakeNewEntity(provider);

        await provider.Save(entity, user, new EntitySaveOptions());
        expect(provider.Events).toEqual([
            'begin:1',
            'sql:tx=1',
            'durable-after-save:tx=1',
            'commit:1',
            'inline-after-save:tx=0',
        ]);
        expect(provider.ObservedPkInDurableHook).toBe('ID|db-generated-id-99');
    });

    it('rolls back the entity transaction when OnDurableAfterSaveExecute throws', async () => {
        const provider = new EnlistmentTestProvider();
        provider.EnlistSave = true;
        provider.FailDurableHook = true;
        const user = new UserInfo(provider, { ID: 'u1', Name: 'Admin', Email: 'admin@example.com', UserRoles: [] });
        const entity = createFakeNewEntity(provider);

        await expect(provider.Save(entity, user, new EntitySaveOptions())).rejects.toThrow('durable outbox write failed');
        expect(provider.Events).toEqual([
            'begin:1',
            'sql:tx=1',
            'durable-after-save:tx=1',
            'rollback:1',
        ]);
    });
});
