/**
 * Wave 4.3a Slice 1 Tests:
 * 1. TransactionGroupBase.Submit() keeps in-transaction callbacks (OnSaveCompleted / durable outbox)
 *    inside the open group transaction, then calls CommitGroupTransaction() strictly BEFORE
 *    TransactionNotifications$ (finalizeSave / PostSave hooks) and LocalCacheManager.EndEntityEventBatch
 *    (shared-cache / Redis distributed lock maintenance) execute.
 * 2. TransactionGroupBase.Submit() calls RollbackGroupTransaction() BEFORE cache invalidation when
 *    an item fails or throws, never holding DB locks across cache maintenance.
 * 3. Redundant 2nd CheckCreateRLS check in Save() is skipped when BeforeSave leaves fields unchanged,
 *    and still runs on primitive mutations, case-only string mutations, and in-place object mutations.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
    BaseEntity,
    DatabaseProviderBase,
    DeleteSQLResult,
    EntityInfo,
    EntityMergeOptions,
    EntityMergeResult,
    EntityPermissionType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    EntitySaveOptions,
    ExecuteSQLOptions,
    IMetadataProvider,
    LocalCacheManager,
    Metadata,
    PotentialDuplicateRequest,
    PotentialDuplicateResponse,
    QueryInfo,
    RunQuerySQLFilterManager,
    RunViewParams,
    SaveContext,
    SaveSQLResult,
    TransactionGroupBase,
    TransactionItem,
    TransactionResult,
    UserInfo,
} from '../index';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

type RowValue = string | number | boolean | object | null | undefined;
type RowMap = Record<string, RowValue>;

class WaveLifecycleTrackingGroup extends TransactionGroupBase {
    public readonly Events: string[] = [];
    public FailOnHandleSubmit = false;
    public PlannedSuccess = true;
    private _open = false;

    protected override BeginGroupTransaction(): Promise<void> {
        this._open = true;
        this.Events.push('begin');
        return Promise.resolve();
    }

    protected override async HandleSubmit(): Promise<TransactionResult[]> {
        this.Events.push('execute');
        if (this.FailOnHandleSubmit) {
            throw new Error('Database statement execution failed');
        }
        return this.PendingTransactions.map(
            (t) => new TransactionResult(t, { ID: '22222222-2222-2222-2222-222222222222', Name: 'Widget Test' }, this.PlannedSuccess),
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

class WaveTestProvider extends DatabaseProviderBase {
    public Group = new WaveLifecycleTrackingGroup();
    public OnSaveCompletedPatches: RowMap | null = null;
    public OnSaveCompletedSawOpenTx = false;
    public OnSaveCompletedCalls = 0;

    public CheckCreateRLSCalls = 0;
    public AllowCreateRLS = true;
    public FailSecondCreateRLS = false;

    public HookToRunOnBeforeSave: ((entity: BaseEntity) => Promise<void> | void) | null = null;

    private static readonly _uuidPattern =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    private static readonly _defaultPattern = /^\s*\(?\s*(newid|newsequentialid)\s*\(\s*\)\s*\)?\s*$/i;

    protected get UUIDPattern(): RegExp {
        return WaveTestProvider._uuidPattern;
    }
    protected get DBDefaultPattern(): RegExp {
        return WaveTestProvider._defaultPattern;
    }
    public get InstanceConnectionString(): string {
        return 'test://wave4-tx-group';
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
        return [{ ID: 'direct-rec-1', Name: 'Direct Saved Widget' } as unknown as T];
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
        this.CheckCreateRLSCalls++;
        if (this.CheckCreateRLSCalls > 1 && this.FailSecondCreateRLS) {
            return false;
        }
        return this.AllowCreateRLS;
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

    protected override async OnBeforeSaveExecute(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions,
        _context: SaveContext,
    ): Promise<void> {
        if (this.HookToRunOnBeforeSave) {
            await this.HookToRunOnBeforeSave(entity);
        }
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

function createTestWidget(provider: WaveTestProvider, user: UserInfo): BaseEntity {
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
        AllowCaching: true,
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
                Name: 'MetadataPayload',
                Type: 'nvarchar',
                Length: -1,
                IsPrimaryKey: false,
                AllowsNull: true,
                AllowUpdateAPI: true,
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
    entity.Set('Name', 'Initial Widget');
    return entity;
}

describe('Wave 4.3a — TransactionGroup Lock-Release Before Cache/PostSave & RLS Check Skipping', () => {
    const previousMetadataProvider = Metadata.Provider;
    const previousEntityProvider = BaseEntity.Provider;
    const testUser = { ID: 'user-wave-1', Email: 'wave@example.com', UserRoles: [] } as object as UserInfo;

    afterEach(() => {
        Metadata.Provider = previousMetadataProvider;
        BaseEntity.Provider = previousEntityProvider;
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    });

    describe('1. TransactionGroupBase.Submit() commits DB before notifications & cache batch flush', () => {
        it('keeps OnSaveCompleted in-transaction, then calls CommitGroupTransaction() strictly BEFORE TransactionNotifications$ and EndEntityEventBatch', async () => {
            delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
            const cache = LocalCacheManager.Instance;
            const storage = new MockCacheStorageProvider();
            await cache.Initialize(storage);
            await cache.SetRunViewResult(
                'Widgets|_|_|-1|0|_|_',
                { EntityName: 'Widgets' } as RunViewParams,
                [{ ID: '11111111-1111-1111-1111-111111111111', Name: 'Existing' }],
                '',
            );

            const provider = new WaveTestProvider();
            provider.OnSaveCompletedPatches = {
                __mj_Latitude: 37.7749,
            };

            const originalEndBatch = cache.EndEntityEventBatch.bind(cache);
            vi.spyOn(cache, 'EndEntityEventBatch').mockImplementation(async (owner: object, succeeded: boolean) => {
                provider.Group.Events.push(`endBatch:succeeded=${succeeded}:txOpen=${provider.Group.IsOpen}`);
                return originalEndBatch(owner, succeeded);
            });

            const entity = createTestWidget(provider, testUser);
            const tg = await provider.CreateTransactionGroup();
            tg.TransactionNotifications$.subscribe(() => {
                provider.Group.Events.push(`notify:txOpen=${provider.Group.IsOpen}`);
            });
            entity.TransactionGroup = tg;

            expect(await entity.Save()).toBe(true);
            expect(await tg.Submit()).toBe(true);
            expect(tg.Status).toBe('Complete');

            // In-transaction hooks stay atomic (txOpen=true), while notifications & EndEntityEventBatch run AFTER commit (txOpen=false)
            expect(provider.OnSaveCompletedSawOpenTx).toBe(true);
            expect(provider.Group.Events).toEqual([
                'begin',
                'execute',
                'onSaveCompleted',
                'commit',
                'notify:txOpen=false',
                'endBatch:succeeded=true:txOpen=false',
            ]);
            expect(entity.Get('__mj_Latitude')).toBe(37.7749);
        });
    });

    describe('2. TransactionGroupBase.Submit() rolls back BEFORE cache invalidation on failure', () => {
        it('calls RollbackGroupTransaction() BEFORE EndEntityEventBatch when an item fails', async () => {
            delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
            const cache = LocalCacheManager.Instance;
            const storage = new MockCacheStorageProvider();
            await cache.Initialize(storage);

            const provider = new WaveTestProvider();
            provider.Group.PlannedSuccess = false;

            const originalEndBatch = cache.EndEntityEventBatch.bind(cache);
            vi.spyOn(cache, 'EndEntityEventBatch').mockImplementation(async (owner: object, succeeded: boolean) => {
                provider.Group.Events.push(`endBatch:succeeded=${succeeded}:txOpen=${provider.Group.IsOpen}`);
                return originalEndBatch(owner, succeeded);
            });

            const entity = createTestWidget(provider, testUser);
            const tg = await provider.CreateTransactionGroup();
            entity.TransactionGroup = tg;
            tg.AddTransaction(
                new TransactionItem(entity, 'Create', 'EXEC spTest', null, {}, (_res, success) => {
                    provider.Group.Events.push(`itemCallback:success=${success}:txOpen=${provider.Group.IsOpen}`);
                }),
            );

            await entity.Save();
            expect(await tg.Submit()).toBe(false);
            expect(tg.Status).toBe('Failed');
            expect(provider.Group.Events).toEqual([
                'begin',
                'execute',
                'rollback',
                'itemCallback:success=false:txOpen=false',
                'endBatch:succeeded=false:txOpen=false',
            ]);
        });

        it('calls RollbackGroupTransaction() and does NOT commit when HandleSubmit() throws', async () => {
            const provider = new WaveTestProvider();
            provider.Group.FailOnHandleSubmit = true;

            const entity = createTestWidget(provider, testUser);
            const tg = await provider.CreateTransactionGroup();
            entity.TransactionGroup = tg;

            let callbackInvoked = false;
            let callbackSuccess = true;
            tg.AddTransaction(
                new TransactionItem(entity, 'Create', 'EXEC spTest', null, {}, (_result, success) => {
                    callbackInvoked = true;
                    callbackSuccess = success;
                }),
            );

            const submitted = await tg.Submit();

            expect(submitted).toBe(false);
            expect(tg.Status).toBe('Failed');
            expect(provider.Group.Events).toEqual(['begin', 'execute', 'rollback']);
            expect(callbackInvoked).toBe(true);
            expect(callbackSuccess).toBe(false);
        });
    });

    describe('3. Duplicate Save() RLS check optimization', () => {
        it('skips the redundant 2nd CheckCreateRLS when BeforeSave leaves fields unchanged', async () => {
            const provider = new WaveTestProvider();
            provider.HookToRunOnBeforeSave = null;

            const entity = createTestWidget(provider, testUser);
            expect(await entity.Save()).toBe(true);
            expect(provider.CheckCreateRLSCalls).toBe(1);
        });

        it('runs the 2nd CheckCreateRLS when BeforeSave mutates a primitive field value', async () => {
            const provider = new WaveTestProvider();
            provider.HookToRunOnBeforeSave = (ent: BaseEntity) => {
                ent.Set('Name', 'Name Mutated In Hook');
            };

            const entity = createTestWidget(provider, testUser);
            expect(await entity.Save()).toBe(true);
            expect(provider.CheckCreateRLSCalls).toBe(2);
        });

        it('runs the 2nd CheckCreateRLS when BeforeSave performs a case-only string mutation', async () => {
            const provider = new WaveTestProvider();
            provider.HookToRunOnBeforeSave = (ent: BaseEntity) => {
                ent.Set('Name', 'initial widget'); // differs only in casing from 'Initial Widget'
            };

            const entity = createTestWidget(provider, testUser);
            expect(await entity.Save()).toBe(true);
            expect(provider.CheckCreateRLSCalls).toBe(2);
        });

        it('runs the 2nd CheckCreateRLS when BeforeSave mutates an object field in-place', async () => {
            const provider = new WaveTestProvider();
            const sharedPayload: { orgId: string } = { orgId: 'org-allowed' };
            const entity = createTestWidget(provider, testUser);
            entity.Fields.find((f) => f.Name === 'MetadataPayload')!.Value = sharedPayload;

            provider.HookToRunOnBeforeSave = () => {
                sharedPayload.orgId = 'org-escalated'; // in-place mutation without calling Set()
            };

            expect(await entity.Save()).toBe(true);
            expect(provider.CheckCreateRLSCalls).toBe(2);
        });

        it('fails with security error when BeforeSave mutates a field and the 2nd CheckCreateRLS fails', async () => {
            const provider = new WaveTestProvider();
            provider.FailSecondCreateRLS = true;
            provider.HookToRunOnBeforeSave = (ent: BaseEntity) => {
                ent.Set('Name', 'Disallowed Name Mutated By Hook');
            };

            const entity = createTestWidget(provider, testUser);

            expect(await entity.Save()).toBe(false);
            expect(provider.CheckCreateRLSCalls).toBe(2);
            expect(entity.LatestResult?.Message).toMatch(
                /a before-save hook produced field values that no longer pass row-level security/,
            );
        });
    });
});
