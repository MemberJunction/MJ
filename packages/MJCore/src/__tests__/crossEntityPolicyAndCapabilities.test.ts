import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    AppCapabilityRegistry,
    DefineCapabilityContract,
    RegisterAppCapability,
    type AppCapabilityExecutionContext,
    type IAppCapabilityProvider,
} from '../generic/appCapabilityRegistry';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import {
    CrossEntityPolicyEngine,
    type IDeclarativeParentStateLockPolicy,
} from '../generic/crossEntityPolicyEngine';
import { ClearAllDataHooks, RegisterDataHook } from '../generic/dataHooks';
import { DatabaseProviderBase, type DeleteSQLResult, type SaveSQLResult } from '../generic/databaseProviderBase';
import { EntityFieldInfo, EntityInfo, RecordDependency, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import {
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    EntityMergeOptions,
    EntityRecordNameInput,
    EntityRecordNameResult,
    EntitySaveOptions,
    ExecuteSQLOptions,
    ILocalStorageProvider,
    PotentialDuplicateRequest,
    PotentialDuplicateResponse,
    ProviderType,
    RunQueryResult,
    RunViewResult,
} from '../generic/interfaces';
import { DatabasePlatform } from '../generic/platformSQL';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { ScoredCandidate } from '../generic/scoring/ReciprocalRankFusion';
import { UserInfo } from '../generic/securityInfo';
import { TransactionGroupBase, TransactionResult } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';

class MockParentOrderEntity extends BaseEntity {
    public get ID(): string {
        return this.GetFieldByName('ID')?.Value as string;
    }
    public set ID(val: string) {
        const f = this.GetFieldByName('ID');
        if (f) f.Value = val;
    }

    public get Status(): string {
        return this.GetFieldByName('Status')?.Value as string;
    }
    public set Status(val: string) {
        const f = this.GetFieldByName('Status');
        if (f) f.Value = val;
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

class MockOrderLineEntity extends BaseEntity {
    public get ID(): string {
        return this.GetFieldByName('ID')?.Value as string;
    }
    public set ID(val: string) {
        const f = this.GetFieldByName('ID');
        if (f) f.Value = val;
    }

    public get OrderID(): string {
        return this.GetFieldByName('OrderID')?.Value as string;
    }
    public set OrderID(val: string) {
        const f = this.GetFieldByName('OrderID');
        if (f) f.Value = val;
    }

    public get Quantity(): number {
        return Number(this.GetFieldByName('Quantity')?.Value ?? 0);
    }
    public set Quantity(val: number) {
        const f = this.GetFieldByName('Quantity');
        if (f) f.Value = val;
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

class InMemoryBatchTransactionGroup extends TransactionGroupBase {
    public HandleSubmitCalled = 0;

    protected override async HandleSubmit(): Promise<TransactionResult[]> {
        this.HandleSubmitCalled++;
        return this.PendingTransactions.map(
            (item) => new TransactionResult(item, item.BaseEntity.GetAll(), true),
        );
    }
}

class CrossPolicyTestProvider extends DatabaseProviderBase {
    private readonly _entities: EntityInfo[];
    private _txDepth = 0;
    public RunViewCallCount = 0;
    public readonly ParentOrderRows = new Map<string, { ID: string; Status: string }>();

    constructor(entities: EntityInfo[]) {
        super();
        this._entities = entities;
    }

    public override get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    public override get ProviderType(): ProviderType {
        return ProviderType.Database;
    }

    public override get DatabaseConnection(): object {
        return {};
    }

    public override get InstanceConnectionString(): string {
        return 'test://cross-entity-policy';
    }

    public override get Entities(): EntityInfo[] {
        return this._entities;
    }

    public override get CurrentTransactionDepth(): number {
        return this._txDepth;
    }

    public override get IsInTransaction(): boolean {
        return this._txDepth > 0;
    }

    public override async BeginTransaction(): Promise<void> {
        this._txDepth++;
    }

    public override async CommitTransaction(): Promise<void> {
        if (this._txDepth > 0) {
            this._txDepth--;
        }
    }

    public override async RollbackTransaction(): Promise<void> {
        if (this._txDepth > 0) {
            this._txDepth--;
        }
    }

    public override async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        return new InMemoryBatchTransactionGroup();
    }

    public override async GetEntityObject<T extends BaseEntity = BaseEntity>(
        entityName: string,
        contextUser?: UserInfo,
    ): Promise<T> {
        const info = this._entities.find((e) => e.Name.toLowerCase() === entityName.toLowerCase());
        if (!info) {
            throw new Error(`Entity '${entityName}' not found`);
        }
        const instance =
            info.Name === 'Mock Parent Orders'
                ? new MockParentOrderEntity(info, this)
                : new MockOrderLineEntity(info, this);
        if (contextUser) {
            instance.ContextCurrentUser = contextUser;
        }
        return instance as object as T;
    }

    protected override async InternalRunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
        this.RunViewCallCount++;
        // Small microtask yield so concurrent Promise.all callers overlap while in flight
        await Promise.resolve();
        const results: Array<{ ID: string; Status: string }> = [];
        const filter = params.ExtraFilter ?? '';
        for (const row of this.ParentOrderRows.values()) {
            if (filter.includes(`'${row.ID}'`)) {
                results.push({ ...row });
            }
        }
        return {
            Success: true,
            Results: results as object as T[],
            RowCount: results.length,
            TotalRowCount: results.length,
            ExecutionTime: 1,
            ErrorMessage: '',
            UserViewRunID: '',
        };
    }

    public override async ExecuteSQL<T>(
        query: string,
        _parameters?: Array<string | number>,
        _options?: ExecuteSQLOptions,
    ): Promise<Array<T>> {
        if (query.startsWith('SAVE::')) {
            const payload = JSON.parse(query.slice('SAVE::'.length)) as Record<string, string | number | null>;
            if ('Status' in payload && typeof payload.ID === 'string' && typeof payload.Status === 'string') {
                this.ParentOrderRows.set(payload.ID, { ID: payload.ID, Status: payload.Status });
            }
            return [payload as object as T];
        }
        if (query.startsWith('DELETE::')) {
            const payload = JSON.parse(query.slice('DELETE::'.length)) as T;
            return [payload];
        }
        return [];
    }

    protected override async GenerateSaveSQL(
        entity: BaseEntity,
        _newRecord: boolean,
        _user: UserInfo,
        _options?: EntitySaveOptions,
    ): Promise<SaveSQLResult> {
        return {
            fullSQL: `SAVE::${JSON.stringify(entity.GetAll())}`,
            simpleSQL: 'SAVE',
        };
    }

    protected override GenerateDeleteSQL(entity: BaseEntity): DeleteSQLResult {
        return {
            fullSQL: `DELETE::${JSON.stringify(entity.GetAll())}`,
            simpleSQL: 'DELETE',
        };
    }

    protected override async CheckCreateRLS(): Promise<boolean> {
        return true;
    }

    protected override async CheckRecordRLS(): Promise<boolean> {
        return true;
    }

    protected override async CheckUpdateRLSPostImage(): Promise<boolean> {
        return true;
    }

    protected override QuoteIdentifier(name: string): string {
        return `[${name}]`;
    }

    protected override QuoteSchema(sql: string): string {
        return sql;
    }

    protected override BuildChildDiscoverySQL(): string {
        return '';
    }

    protected override BuildHardLinkDependencySQL(): string {
        return '';
    }

    protected override BuildSoftLinkDependencySQL(): string {
        return '';
    }

    protected override BuildSiblingRecordIDSQL(): string {
        return '';
    }

    protected override get UUIDFunction(): string {
        return 'NEWID()';
    }

    protected override get DBTimestampFunction(): string {
        return 'GETUTCDATE()';
    }

    protected override async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec): Promise<RunQueryResult> {
        return { QueryID: '', QueryName: '', Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }

    protected get AllowRefresh(): boolean {
        return false;
    }

    public async Load(): Promise<Record<string, string | number | null>> {
        return {};
    }

    public BeginSaveExecute(): boolean {
        return true;
    }

    public BeginDeleteExecute(): boolean {
        return true;
    }

    public RefreshIfNeeded(): Promise<void> {
        return Promise.resolve();
    }

    protected async InternalGetEntityRecordName(): Promise<string> {
        return '';
    }

    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
        return [];
    }

    protected async searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> {
        return [];
    }

    protected async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        return Promise.all(params.map((p) => this.InternalRunView<T>(p)));
    }

    protected async InternalRunQuery(): Promise<RunQueryResult> {
        return { QueryID: '', QueryName: '', Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }

    protected async InternalRunQueries(): Promise<RunQueryResult[]> {
        return [];
    }

    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { DatasetID: '', DatasetName: '', Success: false, Status: '', LatestUpdateDate: new Date(), Results: [] };
    }

    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { DatasetID: '', DatasetName: '', Success: false, Status: '', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }

    public async GetAndCacheDatasetByName(): Promise<DatasetResultType> {
        return this.GetDatasetByName();
    }

    public async IsDatasetCacheUpToDate(): Promise<boolean> {
        return true;
    }

    public async ClearDatasetCache(_datasetName: string, _datasetFilter?: DatasetItemFilterType[]): Promise<void> {}

    protected async GetCurrentUser(): Promise<UserInfo> {
        return new UserInfo(null, { ID: 'u-cross', Name: 'Cross User', Email: 'cross@example.com' });
    }

    public get LocalStorageProvider(): ILocalStorageProvider {
        return null as object as ILocalStorageProvider;
    }

    public async GetRecordDependencies(): Promise<RecordDependency[]> {
        return [];
    }

    public async MergeRecords(_request: RecordMergeRequest, _contextUser?: UserInfo, _options?: EntityMergeOptions): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', Request: _request, RecordStatus: [] };
    }

    public async GetRecordDuplicates(_params: PotentialDuplicateRequest): Promise<PotentialDuplicateResponse> {
        return { Status: 'Success', PotentialDuplicateResult: [] };
    }

    public async GetRecordFavoriteStatus(_userId: string, _entityName: string, _compositeKey: CompositeKey): Promise<boolean> {
        return false;
    }

    public async SetRecordFavoriteStatus(): Promise<void> {}

    protected async GetMetadataEntityList(): Promise<EntityInfo[]> {
        return this._entities;
    }

    protected async GetMetadataEntityFields(): Promise<EntityFieldInfo[]> {
        return [];
    }
}

function buildParentAndChildEntities(): { parentInfo: EntityInfo; lineInfo: EntityInfo } {
    const parentId = '33333333-1111-2222-3333-444444444444';
    const lineId = '33333333-5555-6666-7777-888888888888';

    const parentLock: IDeclarativeParentStateLockPolicy = {
        kind: 'ParentStateLock',
        foreignKeyField: 'OrderID',
        parentEntityName: 'Mock Parent Orders',
        parentKeyField: 'ID',
        parentStatusField: 'Status',
        allowedParentStates: ['Draft', 'Pending'],
        forbiddenParentStates: ['Posted', 'Cancelled'],
    };

    const parentInfo = new EntityInfo({
        ID: parentId,
        Name: 'Mock Parent Orders',
        BaseTable: 'MockOrder',
        BaseView: 'vwMockOrders',
        SchemaName: 'orders',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EntityFields: [
            { ID: 'po-id', EntityID: parentId, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 },
            { ID: 'po-st', EntityID: parentId, Name: 'Status', Type: 'varchar', Length: 50, AllowsNull: false, AllowUpdateAPI: true, Sequence: 2 },
        ],
    });

    const lineInfo = new EntityInfo({
        ID: lineId,
        Name: 'Mock Order Lines',
        BaseTable: 'MockOrderLine',
        BaseView: 'vwMockOrderLines',
        SchemaName: 'orders',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        Configuration: JSON.stringify({ CrossEntityPolicies: [parentLock] }),
        EntityFields: [
            { ID: 'ol-id', EntityID: lineId, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 },
            { ID: 'ol-oid', EntityID: lineId, Name: 'OrderID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true, Sequence: 2 },
            { ID: 'ol-qty', EntityID: lineId, Name: 'Quantity', Type: 'int', AllowsNull: false, AllowUpdateAPI: true, Sequence: 3 },
        ],
    });

    return { parentInfo, lineInfo };
}

describe('CrossEntityPolicyEngine, PreDelete DataHooks & AppCapabilityRegistry (3.4)', () => {
    const testUser = new UserInfo(null, {
        ID: 'u-policy-1',
        Name: 'Policy Tester',
        Email: 'policy@example.com',
        IsActive: true,
    });

    beforeEach(() => {
        CrossEntityPolicyEngine.Instance.ClearProgrammaticPolicies();
        AppCapabilityRegistry.Instance.Clear();
        ClearAllDataHooks('PreDelete');
    });

    afterEach(() => {
        CrossEntityPolicyEngine.Instance.ClearProgrammaticPolicies();
        AppCapabilityRegistry.Instance.Clear();
        ClearAllDataHooks('PreDelete');
    });

    it('collapses 200 sequential OR concurrent child saves inside an EntityTransactionScope into 1 single parent RunView and invalidates immediately when parent mutates intra-transaction', async () => {
        const { parentInfo, lineInfo } = buildParentAndChildEntities();
        expect(lineInfo.CrossEntityPolicies).toHaveLength(1);

        const provider = new CrossPolicyTestProvider([parentInfo, lineInfo]);
        provider.ParentOrderRows.set('ORD-100', { ID: 'ORD-100', Status: 'Draft' });

        // 1. 200 concurrent child saves inside one open transaction coalesce onto 1 single RunView!
        const txScope = await provider.BeginEntityTransaction();
        const saveOutcomes = await Promise.all(
            Array.from({ length: 200 }, async (_, idx) => {
                const line = await provider.GetEntityObject<MockOrderLineEntity>('Mock Order Lines', testUser);
                line.NewRecord();
                line.ID = `LINE-${idx + 1}`;
                line.OrderID = 'ORD-100';
                line.Quantity = idx + 1;
                return line.Save();
            }),
        );
        expect(saveOutcomes.every((s) => s === true)).toBe(true);
        expect(provider.RunViewCallCount).toBe(1);

        // 2. Intra-transaction mutation on the parent Order ('Draft' -> 'Posted') immediately evicts
        //    the cached parent snapshot so the very next child save/delete inside the SAME transaction
        //    re-queries and refuses the locked parent!
        const parentOrder = await provider.GetEntityObject<MockParentOrderEntity>('Mock Parent Orders', testUser);
        await parentOrder.LoadFromData({ ID: 'ORD-100', Status: 'Draft' });
        parentOrder.Status = 'Posted';
        expect(await parentOrder.Save()).toBe(true);

        const blockedLine = await provider.GetEntityObject<MockOrderLineEntity>('Mock Order Lines', testUser);
        blockedLine.NewRecord();
        blockedLine.ID = 'LINE-201';
        blockedLine.OrderID = 'ORD-100';
        blockedLine.Quantity = 5;
        expect(await blockedLine.Save()).toBe(false);
        expect(blockedLine.LatestResult?.Message).toContain("Mock Parent Orders Status is 'Posted'");
        expect(provider.RunViewCallCount).toBe(2);

        // Delete on existing line is also blocked when parent is Posted (cached from check above -> still 2 RunViews!)
        const existingLine = await provider.GetEntityObject<MockOrderLineEntity>('Mock Order Lines', testUser);
        await existingLine.LoadFromData({ ID: 'LINE-1', OrderID: 'ORD-100', Quantity: 1 });
        expect(await existingLine.Delete()).toBe(false);
        expect(existingLine.LatestResult?.Message).toContain("Mock Parent Orders Status is 'Posted'");
        expect(provider.RunViewCallCount).toBe(2);

        await txScope.Commit();

        // 3. After Commit(), transaction epoch advances so subsequent reads do NOT see stale transaction cache
        provider.ParentOrderRows.set('ORD-100', { ID: 'ORD-100', Status: 'Draft' });
        const afterReopen = await provider.GetEntityObject<MockOrderLineEntity>('Mock Order Lines', testUser);
        afterReopen.NewRecord();
        afterReopen.ID = 'LINE-202';
        afterReopen.OrderID = 'ORD-100';
        afterReopen.Quantity = 3;
        expect(await afterReopen.Save()).toBe(true);
        expect(provider.RunViewCallCount).toBe(3);
    });

    it('collapses 200 TransactionGroup enrollments + Submit() into 1 parent RunView and aborts Submit() if parent locks before HandleSubmit()', async () => {
        const { parentInfo, lineInfo } = buildParentAndChildEntities();
        const provider = new CrossPolicyTestProvider([parentInfo, lineInfo]);
        provider.ParentOrderRows.set('ORD-TG', { ID: 'ORD-TG', Status: 'Draft' });

        const tg = (await provider.CreateTransactionGroup()) as InMemoryBatchTransactionGroup;
        for (let i = 0; i < 200; i++) {
            const line = await provider.GetEntityObject<MockOrderLineEntity>('Mock Order Lines', testUser);
            line.NewRecord();
            line.ID = `TG-LINE-${i + 1}`;
            line.OrderID = 'ORD-TG';
            line.Quantity = 2;
            line.TransactionGroup = tg;
            expect(await line.Save()).toBe(true);
        }

        // All 200 enrollments shared the TransactionGroup scope -> exactly 1 RunView!
        expect(provider.RunViewCallCount).toBe(1);
        expect(await tg.Submit()).toBe(true);
        expect(tg.HandleSubmitCalled).toBe(1);

        // Now test a programmatic batch policy rejecting at Submit() before HandleSubmit() runs
        let failAtBatch = false;
        CrossEntityPolicyEngine.Instance.RegisterPolicy({
            PolicyKey: 'Orders.MaxBatchLinesGuard',
            TargetEntityNames: ['Mock Order Lines'],
            EvaluateBatch: async (items) => {
                const verdicts = new Map<BaseEntity, { Allowed: boolean; ErrorMessage?: string }>();
                if (failAtBatch) {
                    for (const item of items) {
                        verdicts.set(item.Entity, {
                            Allowed: false,
                            ErrorMessage: 'Batch rejected by MaxBatchLinesGuard before SQL execution.',
                        });
                    }
                }
                return verdicts;
            },
        });

        const tg2 = (await provider.CreateTransactionGroup()) as InMemoryBatchTransactionGroup;
        const l1 = await provider.GetEntityObject<MockOrderLineEntity>('Mock Order Lines', testUser);
        l1.NewRecord();
        l1.ID = 'TG2-LINE-1';
        l1.OrderID = 'ORD-TG';
        l1.Quantity = 10;
        l1.TransactionGroup = tg2;
        expect(await l1.Save()).toBe(true);

        failAtBatch = true;
        expect(await tg2.Submit()).toBe(false);
        expect(tg2.HandleSubmitCalled).toBe(0);
    });

    it('invokes registered PreDelete data hooks and vetoes Delete() on false or error string', async () => {
        const { parentInfo, lineInfo } = buildParentAndChildEntities();
        const provider = new CrossPolicyTestProvider([parentInfo, lineInfo]);
        provider.ParentOrderRows.set('ORD-HOOK', { ID: 'ORD-HOOK', Status: 'Draft' });

        let vetoReason: boolean | string = 'Cannot delete line with active warehouse pick ticket';
        RegisterDataHook('PreDelete', async (entity) => {
            if (entity.EntityInfo.Name === 'Mock Order Lines') {
                return vetoReason;
            }
            return true;
        });

        const line = await provider.GetEntityObject<MockOrderLineEntity>('Mock Order Lines', testUser);
        await line.LoadFromData({ ID: 'HOOK-L1', OrderID: 'ORD-HOOK', Quantity: 4 });

        expect(await line.Delete()).toBe(false);
        expect(line.LatestResult?.Message).toBe('Cannot delete line with active warehouse pick ticket');

        vetoReason = false;
        expect(await line.Delete()).toBe(false);
        expect(line.LatestResult?.Message).toBe('Delete rejected by pre-delete hook');

        vetoReason = true;
        expect(await line.Delete()).toBe(true);
    });

    it('registers, checks host-entity availability, selects highest-priority provider, and executes typed cross-app capabilities via AppCapabilityRegistry', async () => {
        interface CreateObligationInput {
            ContractID: string;
            Title: string;
            DueDays: number;
        }
        interface CreateObligationOutput {
            ObligationID: string;
            HandledBy: string;
        }

        const CreateObligationContract = DefineCapabilityContract<
            CreateObligationInput,
            CreateObligationOutput
        >('Contracts.CreateObligation', 1, 'Creates a tracked contract obligation when Contracts OpenApp is installed.');

        const { parentInfo, lineInfo } = buildParentAndChildEntities();
        const providerWithoutContracts = new CrossPolicyTestProvider([parentInfo, lineInfo]);

        const contractsEntityInfo = new EntityInfo({
            ID: '44444444-1111-2222-3333-444444444444',
            Name: 'Contract Obligations',
            BaseTable: 'ContractObligation',
            BaseView: 'vwContractObligations',
            SchemaName: 'contracts',
            EntityFields: [
                { ID: 'co-id', EntityID: '44444444-1111-2222-3333-444444444444', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 },
            ],
        });
        const providerWithContracts = new CrossPolicyTestProvider([parentInfo, lineInfo, contractsEntityInfo]);

        const ctxMissingEntities: AppCapabilityExecutionContext = {
            ContextUser: testUser,
            Provider: providerWithoutContracts,
        };
        const ctxReady: AppCapabilityExecutionContext = {
            ContextUser: testUser,
            Provider: providerWithContracts,
        };

        // 1. Before registration: ExecuteIfAvailable returns NotRegistered; ExecuteRequired throws
        const unregOutcome = await AppCapabilityRegistry.Instance.ExecuteIfAvailable(
            CreateObligationContract,
            { ContractID: 'C-1', Title: 'Renewal Notice', DueDays: 30 },
            ctxReady,
        );
        expect(unregOutcome.Executed).toBe(false);
        expect(unregOutcome.Reason).toBe('NotRegistered');

        await expect(
            AppCapabilityRegistry.Instance.ExecuteRequired(
                CreateObligationContract,
                { ContractID: 'C-1', Title: 'Renewal Notice', DueDays: 30 },
                ctxReady,
            ),
        ).rejects.toThrow(/NotRegistered/);

        // 2. Register default provider (priority 0) requiring 'Contract Obligations' entity
        @RegisterAppCapability(CreateObligationContract, {
            priority: 0,
            ownerApp: '@mj-biz-apps/contracts',
            requiredEntities: ['Contract Obligations'],
        })
        class DefaultObligationCapability implements IAppCapabilityProvider<CreateObligationInput, CreateObligationOutput> {
            public async Execute(input: CreateObligationInput): Promise<CreateObligationOutput> {
                return {
                    ObligationID: `OBL-DEFAULT-${input.ContractID}`,
                    HandledBy: 'default',
                };
            }
        }
        expect(DefaultObligationCapability).toBeDefined();

        // Missing required host entity -> Executed: false, Reason: 'HostEntitiesMissing'
        const missingEntitiesOutcome = await AppCapabilityRegistry.Instance.ExecuteIfAvailable(
            CreateObligationContract,
            { ContractID: 'C-1', Title: 'Renewal Notice', DueDays: 30 },
            ctxMissingEntities,
        );
        expect(missingEntitiesOutcome.Executed).toBe(false);
        expect(missingEntitiesOutcome.Reason).toBe('HostEntitiesMissing');

        // Ready host -> executes default provider
        const defaultExec = await AppCapabilityRegistry.Instance.ExecuteIfAvailable(
            CreateObligationContract,
            { ContractID: 'C-1', Title: 'Renewal Notice', DueDays: 30 },
            ctxReady,
        );
        expect(defaultExec.Executed).toBe(true);
        expect(defaultExec.Result?.ObligationID).toBe('OBL-DEFAULT-C-1');
        expect(defaultExec.OwnerApp).toBe('@mj-biz-apps/contracts');

        // 3. Higher-priority enterprise override wins deterministically
        @RegisterAppCapability(CreateObligationContract, {
            priority: 100,
            ownerApp: '@acme/enterprise-contracts',
            requiredEntities: ['Contract Obligations'],
        })
        class EnterpriseObligationCapability implements IAppCapabilityProvider<CreateObligationInput, CreateObligationOutput> {
            public async Execute(input: CreateObligationInput): Promise<CreateObligationOutput> {
                return {
                    ObligationID: `OBL-ENT-${input.ContractID}-${input.DueDays}`,
                    HandledBy: 'enterprise',
                };
            }
        }
        expect(EnterpriseObligationCapability).toBeDefined();

        const entResult = await AppCapabilityRegistry.Instance.ExecuteRequired(
            CreateObligationContract,
            { ContractID: 'C-99', Title: 'SOC2 Attestation', DueDays: 14 },
            ctxReady,
        );
        expect(entResult.ObligationID).toBe('OBL-ENT-C-99-14');
        expect(entResult.HandledBy).toBe('enterprise');
    });
});
