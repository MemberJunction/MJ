import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return { Config: vi.fn(), Encrypt: vi.fn(), IsEncrypted: vi.fn().mockReturnValue(false), GetKeyByID: vi.fn() };
        },
    },
}));

import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import type { SaveCoercedValue, SaveCallBinding, SaveSQLFragment } from '../saveTypes.js';
import {
    CompositeKey,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type DeleteSQLResult,
    type EntityInfo,
    type EntityRecordNameResult,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateResponse,
    type ProviderType,
    type QueryExecutionSpec,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewParams,
    type RunViewResult,
    type SaveSQLResult,
    type TransactionGroupBase,
} from '@memberjunction/core';

class SingleFlightTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    public readonly ExecutedSQL: string[] = [];
    public ActiveSQLCount = 0;
    public MaxActiveSQLCount = 0;
    public SimulatedDelayMs = 15;
    public SimulatedInTransaction = false;

    constructor(
        private readonly testEntities: EntityInfo[],
        private readonly connString: string = 'single-flight-test',
    ) {
        super();
    }

    public override get Entities(): EntityInfo[] {
        return this.testEntities;
    }

    public override EntityByName(entityName: string): EntityInfo | undefined {
        const lower = entityName?.trim().toLowerCase();
        return this.testEntities.find(e => e.Name.trim().toLowerCase() === lower);
    }

    public override EntityByID(entityID: string): EntityInfo | undefined {
        return this.testEntities.find(e => e.ID === entityID);
    }

    protected override get HasPhysicalTransaction(): boolean {
        return this.SimulatedInTransaction;
    }

    protected override IsCallerInAmbientTransaction(): boolean {
        return this.SimulatedInTransaction;
    }

    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        this.ActiveSQLCount++;
        if (this.ActiveSQLCount > this.MaxActiveSQLCount) {
            this.MaxActiveSQLCount = this.ActiveSQLCount;
        }
        try {
            await new Promise((resolve) => setTimeout(resolve, this.SimulatedDelayMs));
            return [
                { ID: 'row-1', Name: 'Alpha', SQL: sql },
                { ID: 'row-2', Name: 'Beta', SQL: sql },
            ] as unknown as T[];
        } finally {
            this.ActiveSQLCount--;
        }
    }

    public RunSingleView<T = Record<string, unknown>>(params: RunViewParams, user: UserInfo): Promise<RunViewResult<T>> {
        return this.InternalRunView<T>(params, user);
    }

    public RunBatchViews<T = Record<string, unknown>>(params: RunViewParams[], user: UserInfo): Promise<RunViewResult<T>[]> {
        return this.InternalRunViews<T>(params, user);
    }

    protected get UUIDFunctionPattern(): RegExp { return SingleFlightTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return SingleFlightTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    protected CoerceSaveFieldValue(): SaveCoercedValue { throw new Error('Not supported in this test double'); }
    protected RenderSaveCallBinding(): SaveCallBinding { throw new Error('Not supported in this test double'); }
    protected WrapSaveCallForResult(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
    protected ProjectSaveCallToDatestamps(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
    protected WrapSaveCallWithRecordChange(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] } as unknown as RunQueryResult; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { return {} as PotentialDuplicateResponse; }
    public async MergeRecords(): Promise<RecordMergeResult> { return {} as RecordMergeResult; }
    public async GetDatasetByName(): Promise<DatasetResultType> { return {} as DatasetResultType; }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return {} as DatasetStatusResultType; }
    public get InstanceConnectionString(): string { return this.connString; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

function createReadableEntity(name: string): EntityInfo {
    const idField = { Name: 'ID', CodeName: 'ID', AllowSelectInView: true };
    const nameField = { Name: 'Name', CodeName: 'Name', AllowSelectInView: true };
    return {
        ID: `ENT-${name}`,
        Name: name,
        SchemaName: '__mj',
        BaseView: `vw${name}`,
        Fields: [idField, nameField],
        PrimaryKeys: [idField],
        FirstPrimaryKey: idField,
        FieldByName: (n: string) => {
            const lower = n.trim().toLowerCase();
            if (lower === 'id') return idField;
            if (lower === 'name') return nameField;
            return undefined;
        },
        DatetimeFields: [],
        BinaryFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: false,
        AuditViewRuns: false,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

describe('GenericDatabaseProvider Single-Flight RunView Coalescing & Bounded Concurrency', () => {
    const defaultMaxConcurrent = GenericDatabaseProvider.MaxConcurrentViewsPerBatch;

    beforeEach(() => {
        GenericDatabaseProvider.MaxConcurrentViewsPerBatch = 8;
    });

    afterEach(() => {
        GenericDatabaseProvider.MaxConcurrentViewsPerBatch = defaultMaxConcurrent;
    });

    it('coalesces 20 concurrent identical InternalRunView calls into 1 ExecuteSQL query across per-request provider instances', async () => {
        const entities = [createReadableEntity('Users')];
        const providers = Array.from({ length: 20 }, () => new SingleFlightTestProvider(entities, 'shared-conn-1'));
        const user = new UserInfo(null as unknown as IMetadataProvider, {
            ID: 'U-1',
            Email: 'u1@example.com',
            UserRoles: [{ RoleID: 'role-ui' }],
        });

        const results = await Promise.all(
            providers.map((p) =>
                p.RunSingleView<{ ID: string; Name: string }>(
                    { EntityName: 'Users', ExtraFilter: "Name='Alpha'", ResultType: 'simple' },
                    user,
                ),
            ),
        );

        const totalExecutions = providers.reduce((sum, p) => sum + p.ExecutedSQL.length, 0);
        expect(totalExecutions).toBe(1);
        expect(GenericDatabaseProvider.InFlightRunViewCount).toBe(0);

        for (const r of results) {
            expect(r.Success).toBe(true);
            expect(r.Results).toHaveLength(2);
            expect(r.Results[0].Name).toBe('Alpha');
        }
    });

    it('isolates each caller with its own Results array and shallow-cloned row objects', async () => {
        const entities = [createReadableEntity('Dashboards')];
        const provider = new SingleFlightTestProvider(entities, 'shared-conn-2');
        const user = new UserInfo(null as unknown as IMetadataProvider, {
            ID: 'U-1',
            Email: 'u1@example.com',
            UserRoles: [{ RoleID: 'role-ui' }],
        });

        const [resA, resB] = await Promise.all([
            provider.RunSingleView<{ ID: string; Name: string }>({ EntityName: 'Dashboards', ResultType: 'simple' }, user),
            provider.RunSingleView<{ ID: string; Name: string }>({ EntityName: 'Dashboards', ResultType: 'simple' }, user),
        ]);

        expect(provider.ExecutedSQL).toHaveLength(1);
        expect(resA).not.toBe(resB);
        expect(resA.Results).not.toBe(resB.Results);
        expect(resA.Results[0]).not.toBe(resB.Results[0]);

        // Mutating caller A's row or array must not affect caller B
        resA.Results[0].Name = 'MUTATED_BY_A';
        resA.Results.pop();

        expect(resB.Results).toHaveLength(2);
        expect(resB.Results[0].Name).toBe('Alpha');
    });

    it('bypasses single-flight coalescing when inside an active transaction', async () => {
        const entities = [createReadableEntity('Invoices')];
        const provider = new SingleFlightTestProvider(entities, 'shared-conn-tx');
        provider.SimulatedInTransaction = true;
        const user = new UserInfo(null as unknown as IMetadataProvider, {
            ID: 'U-1',
            Email: 'u1@example.com',
            UserRoles: [{ RoleID: 'role-ui' }],
        });

        await Promise.all([
            provider.RunSingleView({ EntityName: 'Invoices', ResultType: 'simple' }, user),
            provider.RunSingleView({ EntityName: 'Invoices', ResultType: 'simple' }, user),
        ]);

        expect(provider.ExecutedSQL).toHaveLength(2);
    });

    it('bypasses single-flight coalescing for ResultType: entity_object and never collides with ResultType: simple', async () => {
        const entities = [createReadableEntity('Orders')];
        const provider = new SingleFlightTestProvider(entities, 'shared-conn-entity-object');
        const user = new UserInfo(null as unknown as IMetadataProvider, {
            ID: 'U-1',
            Email: 'u1@example.com',
            UserRoles: [{ RoleID: 'role-ui' }],
        });

        // Verify canCoalesceRunViewInFlight returns false for entity_object
        const canCoalesce = (provider as unknown as {
            canCoalesceRunViewInFlight(p: RunViewParams): boolean;
            buildSingleFlightRunViewKey(p: RunViewParams, u: UserInfo): string | null;
        });
        expect(canCoalesce.canCoalesceRunViewInFlight({ EntityName: 'Orders', ResultType: 'entity_object' })).toBe(false);
        expect(canCoalesce.canCoalesceRunViewInFlight({ EntityName: 'Orders', ResultType: 'simple' })).toBe(true);
        expect(canCoalesce.canCoalesceRunViewInFlight({ EntityName: 'Orders', ResultType: 'count_only' })).toBe(true);

        // Verify single-flight keys distinguish ResultType values
        const simpleKey = canCoalesce.buildSingleFlightRunViewKey({ EntityName: 'Orders', ResultType: 'simple' }, user);
        const entityObjKey = canCoalesce.buildSingleFlightRunViewKey({ EntityName: 'Orders', ResultType: 'entity_object' }, user);
        expect(simpleKey).toContain('|rt:simple|');
        expect(entityObjKey).toContain('|rt:entity_object|');
        expect(simpleKey).not.toBe(entityObjKey);

        // Concurrent entity_object calls must each execute independently (not coalesced or shallow-cloned via {...row})
        await Promise.all([
            provider.RunSingleView({ EntityName: 'Orders', ResultType: 'entity_object' }, user),
            provider.RunSingleView({ EntityName: 'Orders', ResultType: 'entity_object' }, user),
            provider.RunSingleView({ EntityName: 'Orders', ResultType: 'simple' }, user),
            provider.RunSingleView({ EntityName: 'Orders', ResultType: 'simple' }, user),
        ]);

        // 2 executions for the 2 entity_object calls + 1 coalesced execution for the 2 simple calls = 3 total
        expect(provider.ExecutedSQL).toHaveLength(3);
    });

    it('enforces MaxConcurrentViewsPerBatch = 8 on a 24-view batch while preserving exact result ordering', async () => {
        const entities = Array.from({ length: 24 }, (_, idx) => createReadableEntity(`Entity_${idx}`));
        const provider = new SingleFlightTestProvider(entities, 'batch-conn-24');
        provider.SimulatedDelayMs = 10;
        const user = new UserInfo(null as unknown as IMetadataProvider, {
            ID: 'U-1',
            Email: 'u1@example.com',
            UserRoles: [{ RoleID: 'role-ui' }],
        });

        const batchParams: RunViewParams[] = entities.map((e, idx) => ({
            EntityName: e.Name,
            ExtraFilter: `Idx=${idx}`,
            ResultType: 'simple',
        }));

        const results = await provider.RunBatchViews<{ ID: string; Name: string; SQL: string }>(batchParams, user);

        expect(results).toHaveLength(24);
        expect(provider.ExecutedSQL).toHaveLength(24);
        expect(provider.MaxActiveSQLCount).toBeLessThanOrEqual(8);
        expect(provider.MaxActiveSQLCount).toBeGreaterThanOrEqual(2);

        for (let i = 0; i < 24; i++) {
            expect(results[i].Success).toBe(true);
            expect(results[i].Results[0].SQL).toContain(`[vwEntity_${i}]`);
            expect(results[i].Results[0].SQL).toContain(`Idx=${i}`);
        }
    });
});
