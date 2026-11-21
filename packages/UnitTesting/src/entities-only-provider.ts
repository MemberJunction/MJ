import {
    EntityInfo,
    ProviderBase,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type EntityRecordNameResult,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateResponse,
    type ProviderType,
    type RecordDependency,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewResult,
    type ScoredCandidate,
    type TransactionGroupBase,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** The error every member a test does not exercise throws, so a test that reaches one fails loudly. */
function notUsed(): Error {
    return new Error('EntitiesOnlyProvider: not used by these tests');
}

/**
 * A real `ProviderBase` that knows only the entities it is given: a typed metadata-provider double for unit tests, so a
 * test hands code an `IMetadataProvider` without a cast. Entity lookups (`Entities`, `EntityByID`) and `CurrentUser`
 * work; every data operation throws. Spy on `RunView`/`RunViews` (`vi.spyOn(provider, 'RunView')`) to serve rows.
 */
export class EntitiesOnlyProvider extends ProviderBase {
    /**
     * @param entityList the entities the provider knows
     * @param currentUser the user `CurrentUser` returns
     */
    constructor(private readonly entityList: EntityInfo[], private readonly currentUser: UserInfo = new UserInfo()) {
        super();
    }
    public override get Entities(): EntityInfo[] {
        return this.entityList;
    }
    public override EntityByID(entityID: string): EntityInfo | undefined {
        return this.entityList.find((entity) => UUIDsEqual(entity.ID, entityID));
    }
    public override get CurrentUser(): UserInfo {
        return this.currentUser;
    }
    public get ProviderType(): ProviderType {
        return 'Database';
    }
    public get DatabaseConnection(): null {
        return null;
    }
    public get InstanceConnectionString(): string {
        return '';
    }
    public get LocalStorageProvider(): ILocalStorageProvider {
        throw notUsed();
    }
    protected get AllowRefresh(): boolean {
        return false;
    }
    protected get Metadata(): IMetadataProvider {
        return this;
    }
    protected InternalGetEntityRecordName(): Promise<string> {
        throw notUsed();
    }
    protected InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> {
        throw notUsed();
    }
    public GetRecordFavoriteStatus(): Promise<boolean> {
        throw notUsed();
    }
    public SetRecordFavoriteStatus(): Promise<void> {
        throw notUsed();
    }
    protected InternalRunView<T>(): Promise<RunViewResult<T>> {
        throw notUsed();
    }
    protected InternalRunViews<T>(): Promise<RunViewResult<T>[]> {
        throw notUsed();
    }
    protected InternalRunQuery(): Promise<RunQueryResult> {
        throw notUsed();
    }
    protected InternalRunQueries(): Promise<RunQueryResult[]> {
        throw notUsed();
    }
    protected searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> {
        throw notUsed();
    }
    protected InternalExecuteQueryFromSpec(): Promise<RunQueryResult> {
        throw notUsed();
    }
    protected GetCurrentUser(): Promise<UserInfo> {
        throw notUsed();
    }
    public GetRecordDependencies(): Promise<RecordDependency[]> {
        throw notUsed();
    }
    public GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        throw notUsed();
    }
    public MergeRecords(): Promise<RecordMergeResult> {
        throw notUsed();
    }
    public GetDatasetByName(): Promise<DatasetResultType> {
        throw notUsed();
    }
    public GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        throw notUsed();
    }
    public CreateTransactionGroup(): Promise<TransactionGroupBase> {
        throw notUsed();
    }
}
