import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { DatabaseProviderBase, type DeleteSQLResult, type SaveSQLResult } from '../generic/databaseProviderBase';
import {
    DocumentNumberingEngine,
    InMemoryDocumentSequenceStore,
    SqlTableDocumentSequenceStore,
    type IDocumentNumberPolicy,
} from '../generic/documentNumberingEngine';
import { EntityFieldInfo, EntityInfo, EntityPermissionType, RecordDependency, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
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
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';

class NumberedOrderEntity extends BaseEntity {
    public get ID(): string {
        return this.GetFieldByName('ID')?.Value as string;
    }
    public set ID(value: string) {
        const f = this.GetFieldByName('ID');
        if (f) f.Value = value;
    }

    public get OrderNumber(): string | null {
        return (this.GetFieldByName('OrderNumber')?.Value as string | null) ?? null;
    }
    public set OrderNumber(value: string | null) {
        const f = this.GetFieldByName('OrderNumber');
        if (f) f.Value = value;
    }

    public get CompanyID(): string | null {
        return (this.GetFieldByName('CompanyID')?.Value as string | null) ?? null;
    }
    public set CompanyID(value: string | null) {
        const f = this.GetFieldByName('CompanyID');
        if (f) f.Value = value;
    }

    public get AppScope(): string | null {
        return (this.GetFieldByName('AppScope')?.Value as string | null) ?? null;
    }
    public set AppScope(value: string | null) {
        const f = this.GetFieldByName('AppScope');
        if (f) f.Value = value;
    }

    public get OrderDate(): Date | null {
        return (this.GetFieldByName('OrderDate')?.Value as Date | null) ?? null;
    }
    public set OrderDate(value: Date | null) {
        const f = this.GetFieldByName('OrderDate');
        if (f) f.Value = value;
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

class TransactionalSequenceTestProvider extends DatabaseProviderBase {
    private readonly _entities: EntityInfo[];
    private _txDepth = 0;
    private readonly _counterSnapshots: Array<Map<string, number>> = [];
    public readonly LiveCounters = new Map<string, number>();
    public FailNextEntitySaveSql = false;
    public CommitCount = 0;
    public RollbackCount = 0;
    public readonly ExecutedSqlLog: Array<{ sql: string; parameters?: Array<string | number> }> = [];
    public SimulatedPlatform: DatabasePlatform = 'sqlserver';

    constructor(entities: EntityInfo[]) {
        super();
        this._entities = entities;
    }

    public override get PlatformKey(): DatabasePlatform {
        return this.SimulatedPlatform;
    }

    public override get MJCoreSchemaName(): string {
        return '__mj';
    }

    public override get ProviderType(): ProviderType {
        return ProviderType.Database;
    }

    public override get DatabaseConnection(): object {
        return {};
    }

    public override get InstanceConnectionString(): string {
        return 'test://document-numbering';
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
        this._counterSnapshots.push(new Map(this.LiveCounters));
        this._txDepth++;
    }

    public override async CommitTransaction(): Promise<void> {
        if (this._txDepth > 0) {
            this._txDepth--;
            this._counterSnapshots.pop();
            this.CommitCount++;
        }
    }

    public override async RollbackTransaction(): Promise<void> {
        if (this._txDepth > 0) {
            this._txDepth--;
            const snap = this._counterSnapshots.pop();
            if (snap) {
                this.LiveCounters.clear();
                for (const [k, v] of snap.entries()) {
                    this.LiveCounters.set(k, v);
                }
            }
            this.RollbackCount++;
        }
    }

    public override async GetEntityObject<T extends BaseEntity = BaseEntity>(
        entityName: string,
        contextUser?: UserInfo,
    ): Promise<T> {
        const info = this._entities.find((e) => e.Name.toLowerCase() === entityName.toLowerCase());
        if (!info) {
            throw new Error(`Entity '${entityName}' not found`);
        }
        const instance = new NumberedOrderEntity(info, this);
        if (contextUser) {
            instance.ContextCurrentUser = contextUser;
        }
        return instance as object as T;
    }

    public override async ExecuteSQL<T>(
        query: string,
        parameters?: Array<string | number>,
        _options?: ExecuteSQLOptions,
        _contextUser?: UserInfo,
    ): Promise<Array<T>> {
        this.ExecutedSqlLog.push({ sql: query, parameters });

        if (query.includes('DocumentSequenceCounter')) {
            // Simulate atomic counter allocation on LiveCounters (rolled back on RollbackTransaction)
            let incrementBy: number;
            let seqKey: string;
            let scopeKey: string;
            let startAt: number;
            if (this.SimulatedPlatform === 'postgresql') {
                seqKey = String(parameters?.[0] ?? '');
                scopeKey = String(parameters?.[1] ?? '');
                startAt = Number(parameters?.[2] ?? 1);
                incrementBy = Number(parameters?.[3] ?? 1);
            } else {
                incrementBy = Number(parameters?.[0] ?? 1);
                seqKey = String(parameters?.[1] ?? '');
                scopeKey = String(parameters?.[2] ?? '');
                startAt = Number(parameters?.[3] ?? 1);
            }
            const composite = `${seqKey}::${scopeKey}`;
            const cur = this.LiveCounters.get(composite);
            const nextVal = cur === undefined ? startAt : cur + incrementBy;
            this.LiveCounters.set(composite, nextVal);
            return [{ AllocatedValue: nextVal } as object as T];
        }

        if (this.FailNextEntitySaveSql) {
            this.FailNextEntitySaveSql = false;
            throw new Error('Simulated downstream unique index failure on entity INSERT');
        }

        // Parse JSON payload embedded by GenerateSaveSQL so the saved row echoes allocated OrderNumber
        const jsonPayload = query.slice('SAVE_ENTITY::'.length);
        const row = JSON.parse(jsonPayload) as T;
        return [row];
    }

    protected override async GenerateSaveSQL(
        entity: BaseEntity,
        _newRecord: boolean,
        _user: UserInfo,
        _options?: EntitySaveOptions,
    ): Promise<SaveSQLResult> {
        const snapshot = entity.GetAll();
        return {
            fullSQL: `SAVE_ENTITY::${JSON.stringify(snapshot)}`,
            simpleSQL: 'SAVE_ENTITY',
        };
    }

    protected override GenerateDeleteSQL(): DeleteSQLResult {
        return { fullSQL: 'DELETE_ENTITY' };
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

    protected async InternalRunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    }

    protected async InternalRunViews<T>(_params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        return [];
    }

    protected async InternalRunQuery(): Promise<RunQueryResult> {
        return { QueryID: '', QueryName: '', Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    }

    protected async InternalRunQueries(): Promise<RunQueryResult[]> {
        return [];
    }

    public async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        throw new Error('Not needed in this test');
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
        return new UserInfo(null, { ID: 'u-1', Name: 'Test', Email: 't@example.com' });
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

function buildOrderEntityInfo(policy?: IDocumentNumberPolicy): EntityInfo {
    const id = '22222222-3333-4444-5555-666666666666';
    return new EntityInfo({
        ID: id,
        Name: 'Test Numbered Orders',
        BaseTable: 'NumberedOrder',
        BaseView: 'vwNumberedOrders',
        SchemaName: 'orders',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        Configuration: policy ? JSON.stringify({ AutoNumber: policy }) : null,
        EntityFields: [
            {
                ID: 'fo-id',
                EntityID: id,
                Name: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                Sequence: 1,
            },
            {
                ID: 'fo-num',
                EntityID: id,
                Name: 'OrderNumber',
                Type: 'varchar',
                Length: 20,
                AllowsNull: false,
                AllowUpdateAPI: true,
                Sequence: 2,
            },
            {
                ID: 'fo-co',
                EntityID: id,
                Name: 'CompanyID',
                Type: 'varchar',
                Length: 50,
                AllowsNull: true,
                AllowUpdateAPI: true,
                Sequence: 3,
            },
            {
                ID: 'fo-app',
                EntityID: id,
                Name: 'AppScope',
                Type: 'varchar',
                Length: 50,
                AllowsNull: true,
                AllowUpdateAPI: true,
                Sequence: 4,
            },
            {
                ID: 'fo-dt',
                EntityID: id,
                Name: 'OrderDate',
                Type: 'datetimeoffset',
                AllowsNull: true,
                AllowUpdateAPI: true,
                Sequence: 5,
            },
        ],
    });
}

function buildTenantUser(tenantId: string = 'TENANT-ACME'): UserInfo {
    const user = new UserInfo(null, {
        ID: 'user-num-1',
        Name: 'Order Ops',
        Email: 'ops@example.com',
        IsActive: true,
    });
    user.TenantContext = {
        TenantID: tenantId,
        Source: 'jwt',
    };
    return user;
}

describe('DocumentNumberingEngine & SqlTableDocumentSequenceStore (3.3)', () => {
    beforeEach(() => {
        DocumentNumberingEngine.Instance.ClearProgrammaticPolicies();
        DocumentNumberingEngine.Instance.SetSequenceStore(new SqlTableDocumentSequenceStore());
    });

    afterEach(() => {
        DocumentNumberingEngine.Instance.ClearProgrammaticPolicies();
        DocumentNumberingEngine.Instance.SetSequenceStore(new SqlTableDocumentSequenceStore());
    });

    it('exempts blank auto-numbered NOT NULL fields on unsaved records while still enforcing MaxLength, reserved-namespace collision, and post-create immutability', async () => {
        const entityInfo = buildOrderEntityInfo({
            targetField: 'OrderNumber',
            pattern: '{PREFIX}-{YYYY}-{SEQ:4}',
            prefix: 'ORD',
            resetPeriod: 'CalendarYear',
            manualValueMode: 'AllowNonColliding',
        });
        expect(entityInfo.AutoNumberPolicies).toHaveLength(1);

        const user = buildTenantUser();
        const provider = new TransactionalSequenceTestProvider([entityInfo]);
        const order = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', user);
        order.NewRecord();
        order.ID = 'ord-1';
        order.OrderNumber = null;

        // 1. Blank NOT NULL field passes Validate() on unsaved record
        const blankNewVal = order.Validate();
        expect(blankNewVal.Success).toBe(true);

        // 2. Manual value matching reserved system sequence format ('ORD-2026-0042') is rejected!
        order.OrderNumber = 'ORD-2026-0042';
        const collidingVal = order.Validate();
        expect(collidingVal.Success).toBe(false);
        expect(collidingVal.Errors.some((e) => e.Source === 'OrderNumber' && e.Message.includes('reserved system sequence'))).toBe(
            true,
        );

        // 3. Distinct external migration value ('LEGACY-IMP-99') is permitted, while MaxLength (20) still runs
        order.OrderNumber = 'LEGACY-IMP-99';
        expect(order.Validate().Success).toBe(true);

        order.OrderNumber = 'LEGACY-IMPORT-WAY-TOO-LONG-FOR-20-CHARS';
        const maxLenVal = order.Validate();
        expect(maxLenVal.Success).toBe(false);
        expect(maxLenVal.Errors.some((e) => e.Message.includes('longer than 20 characters'))).toBe(true);

        // 4. Leave blank and Save() -> allocates 'ORD-<YYYY>-0001'
        order.OrderNumber = null;
        order.OrderDate = new Date('2026-07-15T12:00:00Z');
        expect(await order.Save()).toBe(true);
        expect(order.OrderNumber).toBe('ORD-2026-0001');

        // 5. Saved record enforces post-create immutability AND NOT NULL
        order.OrderNumber = 'ORD-2026-9999';
        const immutVal = order.Validate();
        expect(immutVal.Success).toBe(false);
        expect(immutVal.Errors.some((e) => e.Message.includes('cannot be modified after creation'))).toBe(true);

        order.OrderNumber = null;
        const nullSavedVal = order.Validate();
        expect(nullSavedVal.Success).toBe(false);
        expect(nullSavedVal.Errors.some((e) => e.Message.includes('cannot be null'))).toBe(true);
    });

    it('partitions counters independently across tenant, scopeFields, fiscal year, and field transforms', async () => {
        const memStore = new InMemoryDocumentSequenceStore();
        DocumentNumberingEngine.Instance.SetSequenceStore(memStore);

        const entityInfo = buildOrderEntityInfo({
            targetField: 'OrderNumber',
            pattern: '{TenantID}-{Field:AppScope:UPPER:ISS}-FY{FY}-{SEQ:3}',
            scopeByTenant: true,
            scopeFields: ['CompanyID', 'AppScope'],
            scopeFieldFallbacks: { AppScope: 'iss' },
            dateSourceField: 'OrderDate',
            resetPeriod: 'FiscalYear',
            fiscalYearStartMonth: 7, // July 1 starts next fiscal year
        });
        const provider = new TransactionalSequenceTestProvider([entityInfo]);
        const acmeUser = buildTenantUser('ACME');
        const betaUser = buildTenantUser('BETA');

        // Order 1: ACME, Co-A, AppScope='crm', June 2026 -> FY 2026 -> 001
        const o1 = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', acmeUser);
        o1.NewRecord();
        o1.ID = 'o-1';
        o1.CompanyID = 'Co-A';
        o1.AppScope = ' crm ';
        o1.OrderDate = new Date('2026-06-10T00:00:00Z');
        expect(await o1.Save()).toBe(true);
        expect(o1.OrderNumber).toBe('ACME-CRM-FY2026-001');

        // Order 2: Same tenant + company + AppScope + FY2026 -> 002
        const o2 = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', acmeUser);
        o2.NewRecord();
        o2.ID = 'o-2';
        o2.CompanyID = 'Co-A';
        o2.AppScope = 'crm';
        o2.OrderDate = new Date('2026-06-20T00:00:00Z');
        expect(await o2.Save()).toBe(true);
        expect(o2.OrderNumber).toBe('ACME-CRM-FY2026-002');

        // Order 3: July 2026 crosses fiscal year boundary -> FY2027 resets to 001!
        const o3 = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', acmeUser);
        o3.NewRecord();
        o3.ID = 'o-3';
        o3.CompanyID = 'Co-A';
        o3.AppScope = 'crm';
        o3.OrderDate = new Date('2026-07-02T00:00:00Z');
        expect(await o3.Save()).toBe(true);
        expect(o3.OrderNumber).toBe('ACME-CRM-FY2027-001');

        // Order 4: Different tenant BETA + blank AppScope (falls back to ISS) -> 001
        const o4 = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', betaUser);
        o4.NewRecord();
        o4.ID = 'o-4';
        o4.CompanyID = 'Co-A';
        o4.AppScope = null;
        o4.OrderDate = new Date('2026-06-15T00:00:00Z');
        expect(await o4.Save()).toBe(true);
        expect(o4.OrderNumber).toBe('BETA-ISS-FY2026-001');
    });

    it('emits trigger-safe SQL Server UPDLOCK/HOLDLOCK + OUTPUT INTO and PostgreSQL ON CONFLICT DO UPDATE RETURNING SQL', () => {
        const sqlStore = new SqlTableDocumentSequenceStore();

        const mssql = sqlStore.BuildAllocateStatement('sqlserver', '__mj', 'Orders.OrderNumber', 'YYYY=2026', 1000, 1);
        expect(mssql.sql).toContain('DECLARE @allocated TABLE');
        expect(mssql.sql).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(mssql.sql).toContain('OUTPUT inserted.[CurrentValue] INTO @allocated(AllocatedValue)');
        expect(mssql.parameters).toEqual([1, 'Orders.OrderNumber', 'YYYY=2026', 1000]);

        const pg = sqlStore.BuildAllocateStatement('postgresql', '__mj', 'Orders.OrderNumber', 'YYYY=2026', 1000, 1);
        expect(pg.sql).toContain('INSERT INTO "__mj"."DocumentSequenceCounter"');
        expect(pg.sql).toContain('ON CONFLICT ("SequenceKey", "ScopeKey")');
        expect(pg.sql).toContain('RETURNING "CurrentValue" AS "AllocatedValue"');
        expect(pg.parameters).toEqual(['Orders.OrderNumber', 'YYYY=2026', 1000, 1]);

        expect(() =>
            sqlStore.BuildAllocateStatement('sqlserver', '__mj]; DROP TABLE x;--', 'k', 's', 1, 1),
        ).toThrow(/invalid schema identifier/);
    });

    it('allocates unique gap-free numbers under Promise.all and rolls back sequence counter when DatabaseProviderBase.Save() fails downstream', async () => {
        const entityInfo = buildOrderEntityInfo({
            targetField: 'OrderNumber',
            pattern: 'INV-{SEQ:4}',
            startAt: 1,
        });
        const user = buildTenantUser();
        const provider = new TransactionalSequenceTestProvider([entityInfo]);

        // 1. Save 1 succeeds -> INV-0001
        const first = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', user);
        first.NewRecord();
        first.ID = 'inv-1';
        expect(await first.Save()).toBe(true);
        expect(first.OrderNumber).toBe('INV-0001');
        expect(provider.CommitCount).toBe(1);

        // 2. Save 2 allocates INV-0002 inside autoNumberTxScope, then fails downstream SQL -> rolls back counter!
        provider.FailNextEntitySaveSql = true;
        const doomed = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', user);
        doomed.NewRecord();
        doomed.ID = 'inv-doomed';
        expect(await doomed.Save()).toBe(false);
        expect(provider.RollbackCount).toBe(1);

        // 3. Save 3 gets INV-0002 (ZERO sequence gap!)
        const third = await provider.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', user);
        third.NewRecord();
        third.ID = 'inv-2';
        expect(await third.Save()).toBe(true);
        expect(third.OrderNumber).toBe('INV-0002');

        // 4. 25 concurrent allocations via InMemoryDocumentSequenceStore produce 25 strictly unique numbers
        const memStore = new InMemoryDocumentSequenceStore();
        DocumentNumberingEngine.Instance.SetSequenceStore(memStore);
        const concurrentOrders = await Promise.all(
            Array.from({ length: 25 }, async (_, idx) => {
                const p = new TransactionalSequenceTestProvider([entityInfo]);
                const ord = await p.GetEntityObject<NumberedOrderEntity>('Test Numbered Orders', user);
                ord.NewRecord();
                ord.ID = `conc-${idx}`;
                await ord.Save();
                return ord.OrderNumber!;
            }),
        );
        const uniqueAssigned = new Set(concurrentOrders);
        expect(uniqueAssigned.size).toBe(25);
        expect(uniqueAssigned.has('INV-0001')).toBe(true);
        expect(uniqueAssigned.has('INV-0025')).toBe(true);
    });
});
