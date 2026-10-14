/**
 * CreateUserDescriptionOfChanges must treat 0, false and '' as real values; only null/undefined
 * mean "absent". Truthiness tests silently dropped those changes from the RecordChange description.
 */
import { describe, it, expect } from 'vitest';
import { DatabaseProviderBase, FieldChange, SaveSQLResult, DeleteSQLResult } from '../generic/databaseProviderBase';
import {
    ProviderType, RunQueryResult, RunViewResult, EntityRecordNameResult, RecordDependency, RecordMergeResult,
    PotentialDuplicateResponse, DatasetResultType, DatasetStatusResultType, TransactionGroupBase,
    ILocalStorageProvider, IMetadataProvider, UserInfo,
} from '../index';

/** Minimal concrete provider: only the pure description logic is exercised; every I/O member is unsupported. */
class DescriptionTestProvider extends DatabaseProviderBase {
    private Unsupported(): never { throw new Error('Not supported'); }
    protected get UUIDFunctionPattern(): RegExp { return /^\s*newid\s*\(\s*\)$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^\s*getdate\s*\(\s*\)$/i; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected async InternalExecuteQueryFromSpec(): Promise<RunQueryResult> { return this.Unsupported(); }
    protected async CheckRecordRLS(): Promise<boolean> { return true; }
    protected async CheckCreateRLS(): Promise<boolean> { return true; }
    protected async CheckUpdateRLSPostImage(): Promise<boolean> { return true; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return ProviderType.Database; }
    public get DatabaseConnection(): unknown { return null; }
    protected async InternalGetEntityRecordName(): Promise<string> { return this.Unsupported(); }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { return this.Unsupported(); }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return this.Unsupported(); }
    public async SetRecordFavoriteStatus(): Promise<void> { return this.Unsupported(); }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> { return this.Unsupported(); }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return this.Unsupported(); }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return this.Unsupported(); }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return this.Unsupported(); }
    protected async searchEntitiesSemanticPass(): Promise<never> { return this.Unsupported(); }
    protected async GetCurrentUser(): Promise<UserInfo> { return this.Unsupported(); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return this.Unsupported(); }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { return this.Unsupported(); }
    public async MergeRecords(): Promise<RecordMergeResult> { return this.Unsupported(); }
    public async GetDatasetByName(): Promise<DatasetResultType> { return this.Unsupported(); }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return this.Unsupported(); }
    public get InstanceConnectionString(): string { return ''; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return this.Unsupported(); }
    get LocalStorageProvider(): ILocalStorageProvider { return this.Unsupported(); }
    protected get Metadata(): IMetadataProvider { return this.Unsupported(); }
}

function describeChange(field: string, oldValue: unknown, newValue: unknown): string {
    const change: FieldChange = { field, oldValue, newValue };
    return new DescriptionTestProvider().CreateUserDescriptionOfChanges({ [field]: change });
}

describe('CreateUserDescriptionOfChanges falsy-but-present values', () => {
    it('reports null -> 0 as set', () => {
        expect(describeChange('Temperature', null, 0)).toBe('Temperature set to 0');
    });
    it('reports undefined -> false as set', () => {
        expect(describeChange('IsActive', undefined, false)).toBe('IsActive set to false');
    });
    it("reports null -> '' as set", () => {
        expect(describeChange('Notes', null, '')).toBe('Notes set to ');
    });
    it('reports 0 -> null as cleared', () => {
        expect(describeChange('Temperature', 0, null)).toBe('Temperature cleared from 0');
    });
    it('reports false -> undefined as cleared', () => {
        expect(describeChange('IsActive', false, undefined)).toBe('IsActive cleared from false');
    });
    it("reports '' -> null as cleared", () => {
        expect(describeChange('Notes', '', null)).toBe('Notes cleared from ');
    });
    it('reports 0 -> 5 and 5 -> 0 as changed', () => {
        expect(describeChange('Temperature', 0, 5)).toBe('Temperature changed from 0 to 5');
        expect(describeChange('Temperature', 5, 0)).toBe('Temperature changed from 5 to 0');
    });
    it('reports true -> false and false -> true as changed', () => {
        expect(describeChange('IsActive', true, false)).toBe('IsActive changed from true to false');
        expect(describeChange('IsActive', false, true)).toBe('IsActive changed from false to true');
    });
    it("reports 'a' -> '' and '' -> 'a' as changed", () => {
        expect(describeChange('Notes', 'a', '')).toBe('Notes changed from a to ');
        expect(describeChange('Notes', '', 'a')).toBe('Notes changed from  to a');
    });
    it('reports 0 -> false as changed', () => {
        expect(describeChange('Flag', 0, false)).toBe('Flag changed from 0 to false');
    });
    it('omits a change where both sides are absent', () => {
        expect(describeChange('X', null, undefined)).toBe('');
    });
});
