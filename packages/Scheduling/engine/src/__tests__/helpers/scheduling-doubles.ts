/**
 * @fileoverview Typed test doubles for scheduled-job drivers: a scheduled job and run that keep their values in memory,
 * a database provider that hands out prepared entities and rows, a metadata-only provider, and a builder for a real
 * {@link ScheduledJobExecutionContext}. Members a driver test does not use throw, so a test that reaches past them
 * fails loudly.
 */
import {
    BaseEntity,
    BaseEntityResult,
    CompositeKey,
    DatabaseProviderBase,
    EntityInfo,
    ProviderBase,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type DeleteSQLResult,
    type EntityRecordNameResult,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateResponse,
    type ProviderType,
    type QueryExecutionSpec,
    type RecordDependency,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewResult,
    type SaveSQLResult,
    type ScoredCandidate,
    type TransactionGroupBase,
} from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import type { ScheduledJobExecutionContext } from '../../BaseScheduledJob';

function notUsed(): Error {
    return new Error('not used by these tests');
}

/** The values a {@link TestScheduledJob} starts with. */
export interface TestScheduledJobValues {
    ID?: string;
    Name?: string;
    Configuration?: string | null;
    Status?: MJScheduledJobEntity['Status'];
    LockToken?: string | null;
}

/**
 * A scheduled job whose fields live in memory. `Save`/`Load` record their calls and return the configured results;
 * `SaveFailure` becomes the message of the job's latest result after a failed save.
 */
export class TestScheduledJob extends MJScheduledJobEntity {
    private readonly values: Required<TestScheduledJobValues>;
    public SaveResult = true;
    public SaveCount = 0;
    public LoadResult = true;
    public LoadedIDs: string[] = [];
    public SaveFailure = '';

    constructor(values: TestScheduledJobValues = {}) {
        super(new EntityInfo());
        this.values = {
            ID: 'J1',
            Name: 'Sync',
            Configuration: JSON.stringify({ ActionID: 'A1', Params: [] }),
            Status: 'Active',
            LockToken: null,
            ...values,
        };
    }

    override get ID(): string { return this.values.ID; }
    override set ID(value: string) { this.values.ID = value; }
    override get Name(): string { return this.values.Name; }
    override set Name(value: string) { this.values.Name = value; }
    override get Configuration(): string | null { return this.values.Configuration; }
    override set Configuration(value: string | null) { this.values.Configuration = value; }
    override get Status(): MJScheduledJobEntity['Status'] { return this.values.Status; }
    override set Status(value: MJScheduledJobEntity['Status']) { this.values.Status = value; }
    override get LockToken(): string | null { return this.values.LockToken; }
    override set LockToken(value: string | null) { this.values.LockToken = value; }

    override get LatestResult(): BaseEntityResult {
        return new BaseEntityResult(this.SaveFailure === '', this.SaveFailure);
    }

    override async Save(): Promise<boolean> {
        this.SaveCount++;
        return this.SaveResult;
    }

    override async Load(ID: string): Promise<boolean> {
        this.LoadedIDs.push(ID);
        return this.LoadResult;
    }
}

/** A scheduled-job run with an in-memory ID. */
export class TestScheduledJobRun extends MJScheduledJobRunEntity {
    private runID: string;

    constructor(id = 'run-1') {
        super(new EntityInfo());
        this.runID = id;
    }

    override get ID(): string { return this.runID; }
    override set ID(value: string) { this.runID = value; }
}

/**
 * Narrows a prepared entity to the type the caller of GetEntityObject asked for. The double hands out exactly what
 * the test prepared, so the caller's type is the test's promise, not something the double can check.
 */
function isRequestedEntity<T extends BaseEntity>(_entity: BaseEntity): _entity is T {
    return true;
}

/** Narrows prepared rows to the row type the caller of ExecuteSQL asked for (the test's promise, as above). */
function isRequestedRow<T>(_row: unknown): _row is T {
    return true;
}

/**
 * A database provider that hands out prepared entities from GetEntityObject (in order) and runs SQL by recording the
 * call and returning the prepared rows, or throwing `SQLFailure` when it is set.
 */
export class TestDatabaseProvider extends DatabaseProviderBase {
    public EntityObjects: BaseEntity[] = [];
    public EntityObjectRequests: Array<{ EntityName: string; ContextUser: UserInfo | undefined }> = [];
    public SQLRows: Record<string, unknown>[] = [];
    public SQLFailure: Error | null = null;
    public SQLCalls: Array<{ SQL: string; Parameters: unknown[] | undefined; ContextUser: UserInfo | undefined }> = [];

    public override async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
    public override async GetEntityObject<T extends BaseEntity>(entityName: string, loadKey: CompositeKey, contextUser?: UserInfo): Promise<T>;
    public override async GetEntityObject<T extends BaseEntity>(
        entityName: string,
        loadKeyOrContextUser?: CompositeKey | UserInfo,
        contextUser?: UserInfo
    ): Promise<T> {
        const user = loadKeyOrContextUser instanceof UserInfo ? loadKeyOrContextUser : contextUser;
        this.EntityObjectRequests.push({ EntityName: entityName, ContextUser: user });
        const entity = this.EntityObjects.shift();
        if (!entity || !isRequestedEntity<T>(entity)) {
            throw new Error(`No prepared entity for '${entityName}'`);
        }
        return entity;
    }

    async ExecuteSQL<T>(query: string, parameters?: unknown[], _options?: unknown, contextUser?: UserInfo): Promise<Array<T>> {
        this.SQLCalls.push({ SQL: query, Parameters: parameters, ContextUser: contextUser });
        if (this.SQLFailure) {
            throw this.SQLFailure;
        }
        return this.SQLRows.filter((row) => isRequestedRow<T>(row));
    }

    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): null { return null; }
    public get InstanceConnectionString(): string { return ''; }
    public get LocalStorageProvider(): ILocalStorageProvider { throw notUsed(); }
    protected get AllowRefresh(): boolean { return false; }
    protected get Metadata(): IMetadataProvider { return this; }
    protected InternalGetEntityRecordName(): Promise<string> { throw notUsed(); }
    protected InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { throw notUsed(); }
    public GetRecordFavoriteStatus(): Promise<boolean> { throw notUsed(); }
    public SetRecordFavoriteStatus(): Promise<void> { throw notUsed(); }
    protected InternalRunView<T>(): Promise<RunViewResult<T>> { throw notUsed(); }
    protected InternalRunViews<T>(): Promise<RunViewResult<T>[]> { throw notUsed(); }
    protected InternalRunQuery(): Promise<RunQueryResult> { throw notUsed(); }
    protected InternalRunQueries(): Promise<RunQueryResult[]> { throw notUsed(); }
    protected searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> { throw notUsed(); }
    protected GetCurrentUser(): Promise<UserInfo> { throw notUsed(); }
    public GetRecordDependencies(): Promise<RecordDependency[]> { throw notUsed(); }
    public GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { throw notUsed(); }
    public MergeRecords(): Promise<RecordMergeResult> { throw notUsed(); }
    public GetDatasetByName(): Promise<DatasetResultType> { throw notUsed(); }
    public GetDatasetStatusByName(): Promise<DatasetStatusResultType> { throw notUsed(); }
    public CreateTransactionGroup(): Promise<TransactionGroupBase> { throw notUsed(); }
    protected get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^$/; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, object: string): string { return `[${schema}].[${object}]`; }
    protected BuildChildDiscoverySQL(): string { throw notUsed(); }
    protected BuildHardLinkDependencySQL(): string { throw notUsed(); }
    protected BuildSoftLinkDependencySQL(): string { throw notUsed(); }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { throw notUsed(); }
    protected GenerateDeleteSQL(): DeleteSQLResult { throw notUsed(); }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { throw notUsed(); }
    protected BuildSiblingRecordChangeSQL(): string { throw notUsed(); }
    protected async CheckRecordRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckCreateRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckUpdateRLSPostImage(): Promise<boolean> { throw notUsed(); }
    async BeginTransaction(): Promise<void> { throw notUsed(); }
    async CommitTransaction(): Promise<void> { throw notUsed(); }
    async RollbackTransaction(): Promise<void> { throw notUsed(); }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw notUsed();
    }
}

/** A metadata provider that is not a database provider: it can hand out prepared entities but cannot run SQL. */
export class TestMetadataProvider extends ProviderBase {
    public EntityObjects: BaseEntity[] = [];

    public override async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
    public override async GetEntityObject<T extends BaseEntity>(entityName: string, loadKey: CompositeKey, contextUser?: UserInfo): Promise<T>;
    public override async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
        const entity = this.EntityObjects.shift();
        if (!entity || !isRequestedEntity<T>(entity)) {
            throw new Error(`No prepared entity for '${entityName}'`);
        }
        return entity;
    }

    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): null { return null; }
    public get InstanceConnectionString(): string { return ''; }
    public get LocalStorageProvider(): ILocalStorageProvider { throw notUsed(); }
    protected get AllowRefresh(): boolean { return false; }
    protected get Metadata(): IMetadataProvider { return this; }
    protected InternalGetEntityRecordName(): Promise<string> { throw notUsed(); }
    protected InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { throw notUsed(); }
    public GetRecordFavoriteStatus(): Promise<boolean> { throw notUsed(); }
    public SetRecordFavoriteStatus(): Promise<void> { throw notUsed(); }
    protected InternalRunView<T>(): Promise<RunViewResult<T>> { throw notUsed(); }
    protected InternalRunViews<T>(): Promise<RunViewResult<T>[]> { throw notUsed(); }
    protected InternalRunQuery(): Promise<RunQueryResult> { throw notUsed(); }
    protected InternalRunQueries(): Promise<RunQueryResult[]> { throw notUsed(); }
    protected searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> { throw notUsed(); }
    protected InternalExecuteQueryFromSpec(): Promise<RunQueryResult> { throw notUsed(); }
    protected GetCurrentUser(): Promise<UserInfo> { throw notUsed(); }
    public GetRecordDependencies(): Promise<RecordDependency[]> { throw notUsed(); }
    public GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { throw notUsed(); }
    public MergeRecords(): Promise<RecordMergeResult> { throw notUsed(); }
    public GetDatasetByName(): Promise<DatasetResultType> { throw notUsed(); }
    public GetDatasetStatusByName(): Promise<DatasetStatusResultType> { throw notUsed(); }
    public CreateTransactionGroup(): Promise<TransactionGroupBase> { throw notUsed(); }
}

/** A user for driver calls. */
export function TestUser(id = 'u'): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    return user;
}

/** A real execution context around `schedule`, on `provider` (a fresh database provider by default). */
export function TestContext(
    schedule: MJScheduledJobEntity,
    provider: IMetadataProvider = new TestDatabaseProvider()
): ScheduledJobExecutionContext {
    return { Schedule: schedule, Run: new TestScheduledJobRun(), ContextUser: TestUser(), Provider: provider };
}
