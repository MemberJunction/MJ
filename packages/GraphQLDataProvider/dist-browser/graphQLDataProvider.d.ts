/**************************************************************************************************************
 * The graphQLDataProvider provides a data provider for the entities framework that uses GraphQL to communicate
 * with the server.
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it.
**************************************************************************************************************/
import { BaseEntity, IEntityDataProvider, IMetadataProvider, IRunViewProvider, ProviderConfigDataBase, RunViewResult, EntityInfo, RunViewParams, ProviderBase, ProviderType, UserInfo, RecordChange, ILocalStorageProvider, EntitySaveOptions, TransactionGroupBase, DatasetItemFilterType, DatasetResultType, DatasetStatusResultType, EntityRecordNameInput, EntityRecordNameResult, IRunReportProvider, RunReportResult, RunReportParams, RecordDependency, RecordMergeRequest, RecordMergeResult } from "@memberjunction/core";
import { UserViewEntityExtended } from '@memberjunction/core-entities';
import { Observable } from 'rxjs';
export declare class GraphQLProviderConfigData extends ProviderConfigDataBase {
    get Token(): string;
    get URL(): string;
    get WSURL(): string;
    /**
     * wsurl is the URL to the GraphQL websocket endpoint. This is used for subscriptions, if you are not using subscriptions, pass in a blank string for this
     */
    constructor(token: string, url: string, wsurl: string, MJCoreSchemaName?: string, includeSchemas?: string[], excludeSchemas?: string[]);
}
export declare class GraphQLDataProvider extends ProviderBase implements IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider {
    private _url;
    private _token;
    private static _client;
    private _sessionId;
    get ConfigData(): GraphQLProviderConfigData;
    GenerateUUID(): string;
    Config(configData: GraphQLProviderConfigData): Promise<boolean>;
    get sessionId(): string;
    protected AllowRefresh(): boolean;
    npm: any;
    protected GetCurrentUser(): Promise<UserInfo>;
    /**************************************************************************/
    /**************************************************************************/
    RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult>;
    /**************************************************************************/
    /**************************************************************************/
    /**************************************************************************/
    /**************************************************************************/
    RunView(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult>;
    protected getEntityNameAndUserView(params: RunViewParams, contextUser?: UserInfo): Promise<{
        entityName: string;
        v: UserViewEntityExtended;
    }>;
    protected getViewRunTimeFieldList(e: EntityInfo, v: UserViewEntityExtended, params: RunViewParams, dynamicView: boolean): string[];
    /**************************************************************************/
    /**************************************************************************/
    /**************************************************************************/
    /**************************************************************************/
    get ProviderType(): ProviderType;
    GetRecordChanges(entityName: string, recordId: number): Promise<RecordChange[]>;
    /**
     * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param recordId the recordId to check
     */
    GetRecordDependencies(entityName: string, recordId: number): Promise<RecordDependency[]>;
    MergeRecords(request: RecordMergeRequest): Promise<RecordMergeResult>;
    Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions): Promise<{}>;
    Load(entity: BaseEntity, RecordID: number, EntityRelationshipsToLoad: string[], user: UserInfo): Promise<{}>;
    protected getRelatedEntityString(entityInfo: EntityInfo, EntityRelationshipsToLoad: string[]): string;
    Delete(entity: BaseEntity, user: UserInfo): Promise<boolean>;
    /**************************************************************************/
    /**************************************************************************/
    /**************************************************************************/
    /**************************************************************************/
    GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType>;
    GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetStatusResultType>;
    CreateTransactionGroup(): Promise<TransactionGroupBase>;
    GetRecordFavoriteStatus(userId: number, entityName: string, recordId: number): Promise<boolean>;
    SetRecordFavoriteStatus(userId: number, entityName: string, recordId: number, isFavorite: boolean, contextUser: UserInfo): Promise<void>;
    GetEntityRecordName(entityName: string, recordId: number): Promise<string>;
    GetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]>;
    static ExecuteGQL(query: string, variables: any): Promise<any>;
    private _allLatestMetadataUpdatesQuery;
    private _innerAllEntitiesQueryString;
    private _innerAllEntityFieldsQueryString;
    private _innerAllEntityRelationshipsQueryString;
    private _innerAllEntityPermissionsQueryString;
    private _innerAllApplicationsQueryString;
    private _innerCurrentUserQueryString;
    private _allApplicationsQuery;
    private _innerAllRolesQueryString;
    private _innerAllRowLevelSecurityFiltersQueryString;
    private _innerAllAuditLogTypesQueryString;
    private _innerAllAuthorizationsQueryString;
    private _allMetaDataQuery;
    private _currentUserQuery;
    private roleInfoString;
    private userInfoString;
    private userRoleInfoString;
    private rowLevelSecurityFilterInfoString;
    private auditLogTypeInfoString;
    private authorizationInfoString;
    private applicationInfoString;
    private applicationEntityInfoString;
    private entityInfoString;
    private entityFieldInfoString;
    private entityRelationshipInfoString;
    private entityPermissionInfoString;
    private infoString;
    private _localStorageProvider;
    get LocalStorageProvider(): ILocalStorageProvider;
    /**************************************************************************/
    /**************************************************************************/
    protected get Metadata(): IMetadataProvider;
    private _wsClient;
    private _pushStatusRequests;
    PushStatusUpdates(sessionId?: string): Observable<string>;
}
