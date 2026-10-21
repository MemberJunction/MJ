import {
    DatabaseProviderBase,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type DeleteSQLResult,
    type EntityRecordNameResult,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PostCommitToken,
    type PotentialDuplicateResponse,
    type ProviderType,
    type RecordDependency,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewResult,
    type SaveSQLResult,
    type ScoredCandidate,
    type TransactionGroupBase,
} from '@memberjunction/core';

/** The error every member a test does not exercise throws, so a test that reaches one fails loudly. */
function notUsed(): Error {
    return new Error('DatabaseProviderStub: not used by these tests');
}

/**
 * A real `DatabaseProviderBase` for code that checks `instanceof DatabaseProviderBase`, with no cast. It models the
 * transaction a caller opens on it: `BeginTransaction`/`CommitTransaction`/`RollbackTransaction` count `Depth`, and
 * the caller belongs to that transaction unless `CallerIsMember` is false (another scope's transaction on a shared
 * provider). Every data operation throws; subclass it and override what the code under test calls.
 */
export class DatabaseProviderStub extends DatabaseProviderBase {
    /** Nesting depth of the transaction open on this instance; 0 = none. */
    protected Depth = 0;
    /** Whether the calling scope is part of the open transaction. */
    public CallerIsMember = true;

    protected override get CurrentTransactionDepth(): number { return this.Depth; }
    public override CapturePostCommitToken(): PostCommitToken {
        return this.Depth > 0 && this.CallerIsMember ? { Epoch: 1, FrameIds: [this.Depth] } : { Epoch: null, FrameIds: [] };
    }
    public async BeginTransaction(): Promise<void> { this.Depth++; }
    public async CommitTransaction(): Promise<void> { this.Depth--; }
    public async RollbackTransaction(): Promise<void> { this.Depth--; }

    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): null { return null; }
    public get InstanceConnectionString(): string { return ''; }
    public get LocalStorageProvider(): ILocalStorageProvider { throw notUsed(); }
    protected get AllowRefresh(): boolean { return false; }
    protected get Metadata(): IMetadataProvider { return this; }
    protected async InternalGetEntityRecordName(): Promise<string> { throw notUsed(); }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { throw notUsed(); }
    public async GetRecordFavoriteStatus(): Promise<boolean> { throw notUsed(); }
    public async SetRecordFavoriteStatus(): Promise<void> { throw notUsed(); }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> { throw notUsed(); }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { throw notUsed(); }
    protected async InternalRunQuery(): Promise<RunQueryResult> { throw notUsed(); }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { throw notUsed(); }
    protected async searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> { throw notUsed(); }
    protected async GetCurrentUser(): Promise<UserInfo> { throw notUsed(); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { throw notUsed(); }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { throw notUsed(); }
    public async MergeRecords(): Promise<RecordMergeResult> { throw notUsed(); }
    public async GetDatasetByName(): Promise<DatasetResultType> { throw notUsed(); }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { throw notUsed(); }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { throw notUsed(); }
    public async ExecuteSQL<T>(_query: string): Promise<Array<T>> { throw notUsed(); }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, name: string): string { return `[${schema}].[${name}]`; }
    protected async InternalExecuteQueryFromSpec(): Promise<RunQueryResult> { throw notUsed(); }
    protected BuildChildDiscoverySQL(): string { throw notUsed(); }
    protected BuildHardLinkDependencySQL(): string { throw notUsed(); }
    protected BuildSoftLinkDependencySQL(): string { throw notUsed(); }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { throw notUsed(); }
    protected GenerateDeleteSQL(): DeleteSQLResult { throw notUsed(); }
    protected get UUIDFunctionPattern(): RegExp { return /^newid\(\)$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^getdate\(\)$/i; }
    protected async CheckRecordRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckCreateRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckUpdateRLSPostImage(): Promise<boolean> { throw notUsed(); }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { throw notUsed(); }
    protected BuildSiblingRecordChangeSQL(): string { throw notUsed(); }
}
