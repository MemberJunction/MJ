/**************************************************************************************************************
 * The graphQLDataProvider provides a data provider for the entities framework that uses GraphQL to communicate
 * with the server.
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it.
**************************************************************************************************************/

import { BaseEntity, IEntityDataProvider, IMetadataProvider, IRunViewProvider, ProviderConfigDataBase, RunViewResult,
         EntityInfo, EntityFieldInfo, EntityFieldTSType,
         RunViewParams, ProviderBase, ProviderType, UserInfo, UserRoleInfo, RecordChange,
         ILocalStorageProvider, EntitySaveOptions, EntityMergeOptions, LogError,
         TransactionGroupBase, TransactionItem, DatasetItemFilterType, DatasetResultType, DatasetStatusResultType, EntityRecordNameInput,
         EntityRecordNameResult, IRunReportProvider, RunReportResult, RunReportParams, RecordDependency, RecordMergeRequest, RecordMergeResult,
         RunQueryResult, PotentialDuplicateRequest, PotentialDuplicateResponse, CompositeKey, EntityDeleteOptions,
         RunQueryParams, BaseEntityResult,
         RunViewWithCacheCheckParams, RunViewsWithCacheCheckResponse, RunViewWithCacheCheckResult,
         RunQueryWithCacheCheckParams, RunQueriesWithCacheCheckResponse, RunQueryWithCacheCheckResult,
         KeyValuePair, getGraphQLTypeNameBase, AggregateExpression, InMemoryLocalStorageProvider } from "@memberjunction/core";
import { UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities'

import { gql, GraphQLClient } from 'graphql-request'
import { Observable, Subject, Subscription } from 'rxjs';
import { Client, createClient } from 'graphql-ws';
import { FieldMapper } from './FieldMapper';
import { v4 as uuidv4 } from 'uuid';
import { GraphQLTransactionGroup } from "./graphQLTransactionGroup";
import { GraphQLAIClient } from "./graphQLAIClient";
import { BrowserIndexedDBStorageProvider } from "./storage-providers";

// define the shape for a RefreshToken function that can be called by the GraphQLDataProvider whenever it receives an exception that the JWT it has already is expired
export type RefreshTokenFunction = () => Promise<string>;

/**
 * The GraphQLProviderConfigData class is used to configure the GraphQLDataProvider. It is passed to the Config method of the GraphQLDataProvider
 */
export class GraphQLProviderConfigData extends ProviderConfigDataBase {
    /**
     * Token is the JWT token that is used to authenticate the user with the server
     */
    get Token(): string { return this.Data.Token }

    set Token(token: string) { this.Data.Token = token}

    /**
     * This optional parameter is used when using a shared secret key that is static and provided by the publisher of the MJAPI server. Providing this value will result in
     * a special header x-mj-api-key being set with this value in the HTTP request to the server. This is useful when the server is configured to require this key for certain requests.
     *
     * WARNING: This should NEVER BE USED IN A CLIENT APP like a browser. The only suitable use for this is if you are using GraphQLDataProvider on the server side from another MJAPI, or
     * some other secure computing environment where the key can be kept secure.
     */
    get MJAPIKey(): string { return this.Data.MJAPIKey }
    set MJAPIKey(key: string) { this.Data.MJAPIKey = key }

    /**
     * This optional parameter is used when authenticating with a MemberJunction user API key (format: mj_sk_*).
     * When provided, it will be sent in the X-API-Key header. This authenticates as the specific user who owns the API key.
     *
     * Unlike MJAPIKey (system key), this is a user-specific key that can be used for automated access on behalf of a user.
     * Use this when you want to make API calls as a specific user without requiring OAuth authentication.
     */
    get UserAPIKey(): string { return this.Data.UserAPIKey }
    set UserAPIKey(key: string) { this.Data.UserAPIKey = key }

    /**
     * URL is the URL to the GraphQL endpoint
     */
    get URL(): string { return this.Data.URL }
    /**
     * WSURL is the URL to the GraphQL websocket endpoint. This is used for subscriptions, if you are not using subscriptions, you can pass in a blank string for this
     */
    get WSURL(): string { return this.Data.WSURL }

    /**
     * RefreshTokenFunction is a function that can be called by the GraphQLDataProvider whenever it receives an exception that the JWT it has already is expired
     */
    get RefreshTokenFunction(): RefreshTokenFunction { return this.Data.RefreshFunction }


    /**
     *
     * @param token Token is the JWT token that is used to authenticate the user with the server
     * @param url the URL to the GraphQL endpoint
     * @param wsurl the URL to the GraphQL websocket endpoint. This is used for subscriptions, if you are not using subscriptions, you can pass in a blank string for this
     * @param refreshTokenFunction is a function that can be called by the GraphQLDataProvider whenever it receives an exception that the JWT it has already is expired
     * @param MJCoreSchemaName the name of the MJ Core schema, if it is not the default name of __mj
     * @param includeSchemas optional, an array of schema names to include in the metadata. If not passed, all schemas are included
     * @param excludeSchemas optional, an array of schema names to exclude from the metadata. If not passed, no schemas are excluded
     * @param mjAPIKey optional, a shared secret key that is static and provided by the publisher of the MJAPI server.
     * @param userAPIKey optional, a user-specific API key (mj_sk_* format) for authenticating as a specific user
     */
    constructor(token: string,
                url: string,
                wsurl: string,
                refreshTokenFunction: RefreshTokenFunction,
                MJCoreSchemaName?: string,
                includeSchemas?: string[],
                excludeSchemas?: string[],
                mjAPIKey?: string,
                userAPIKey?: string) {
        super(
                {
                    Token: token,
                    URL: url,
                    WSURL: wsurl,
                    MJAPIKey: mjAPIKey,
                    UserAPIKey: userAPIKey,
                    RefreshTokenFunction: refreshTokenFunction,
                },
                MJCoreSchemaName,
                includeSchemas,
                excludeSchemas
            );
    }
}



// The GraphQLDataProvider implements both the IEntityDataProvider and IMetadataProvider interfaces.
/**
 * The GraphQLDataProvider class is a data provider for MemberJunction that implements the IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider, IRunQueryProvider interfaces and connects to the
 * MJAPI server using GraphQL. This class is used to interact with the server to get and save data, as well as to get metadata about the entities and fields in the system.
 */
export class GraphQLDataProvider extends ProviderBase implements IEntityDataProvider, IMetadataProvider, IRunReportProvider {
    private static _instance: GraphQLDataProvider;
    public static get Instance(): GraphQLDataProvider {
        return GraphQLDataProvider._instance;
    }

    constructor() {
        super();
        if (!GraphQLDataProvider._instance)
            GraphQLDataProvider._instance = this;
    }

    private _client: GraphQLClient;
    private _configData: GraphQLProviderConfigData;
    private _sessionId: string;
    private _aiClient: GraphQLAIClient;
    private _refreshPromise: Promise<void> | null = null;

    public get ConfigData(): GraphQLProviderConfigData {
        return this._configData;
    }


    /**
     * Gets the AI client for executing AI operations through GraphQL.
     * The client is lazily initialized on first access.
     * @returns The GraphQLAIClient instance
     */
    public get AI(): GraphQLAIClient {
        if (!this._aiClient) {
            this._aiClient = new GraphQLAIClient(this);
        }
        return this._aiClient;
    }

    /**
     * This getter is not implemented for the GraphQLDataProvider class.
     */
    public get DatabaseConnection(): any {
        throw new Error("DatabaseConnection not implemented for the GraphQLDataProvider");
    }

    /**
     * The connection string for each GraphQLProvider instance is simply the URL for the GraphQL endpoint. This is because each GraphQLDataProvider instance can be configured with a different URL and each URL
     * is a unique combination of host/port/etc.
     */
    public get InstanceConnectionString(): string {
        return this._configData.URL
    }

    public GenerateUUID() {
        return uuidv4();
    }

    /**
     * The GraphQLDataProvider uses a prefix for local storage that is equal to the URL of the GraphQL endpoint. This is because the GraphQLDataProvider can be configured multiple times with different URLs and each
     * configuration will have its own local storage. This is useful when you want to have multiple connections to different servers and you don't want the local storage to be shared between them. The URL is 
     * normalized to remove special characters and replace anything other than alphanumeric characters with an underscore.
     */
    protected override get LocalStoragePrefix(): string {
        if (this._configData === undefined || this._configData.URL === undefined) {
            throw new Error("GraphQLDataProvider: ConfigData is not set. Please call Config() first.");
        }

        const replacementString = this._configData.URL.replace(/[^a-zA-Z0-9]/g, '_');
        return replacementString + "."; // add a period at the end to separate the prefix from the key
    }

    /**
     * Retrieves the stored session ID from the LocalStorageProvider if available.
     * If no session ID is found, returns null.
     * The session ID is stored using the same storage mechanism as other persistent data
     * with a key specific to the current URL to ensure uniqueness across different 
     * server connections.
     * 
     * @returns The stored session ID or null if not found
     */
    public async GetStoredSessionID(): Promise<string> {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                const key = this.LocalStoragePrefix + "sessionId";
                const storedSession = await ls.GetItem(key);
                return storedSession;
            }
            return null;
        } catch (e) {
            // If any error occurs, return null
            console.error("Error retrieving session ID from local storage:", e);
            return null;
        }
    }

    /**
     * Stores the session ID using the configured LocalStorageProvider for persistence.
     * Uses the same URL-specific key pattern as other storage methods to ensure
     * proper isolation between different server connections.
     * 
     * @param sessionId The session ID to store
     */
    private async SaveStoredSessionID(sessionId: string): Promise<void> {
        try {
            const ls = this.LocalStorageProvider;
            if (ls) {
                const key = this.LocalStoragePrefix + "sessionId";
                await ls.SetItem(key, sessionId);
            }
        } catch (e) {
            // Silently fail if storage is not available
        }
    }

    public async GetPreferredUUID(forceRefreshSessionId?: boolean): Promise<string> {
        // Try to get the stored session ID
        const oldUUID = await this.GetStoredSessionID();
        const UUID = forceRefreshSessionId || !oldUUID ? this.GenerateUUID() : oldUUID;
        return UUID;
    }


    /**
     * This method configures the class instance. If separateConnection is false or not provided, the global/static variables are set that means that the Config() call
     * will affect all callers to the GraphQLDataProvider including via wrappers like the Metadata class. If separateConnection is true, then the instance variables are set
     * and only this instance of the GraphQLDataProvider will be affected by the Config() call.
     * @important If separateConnection is true, metadata for the provider will be loaded but will NOT affect the Metadata class/singleton. 
     * This is because the Metadata class is a singleton that binds to the first Config() call in the process where separateConnection is falsy. 
     * @param configData 
     * @param separateConnection 
     * @returns 
     */
    public async Config(configData: GraphQLProviderConfigData, providerToUse?: IMetadataProvider, separateConnection?: boolean, forceRefreshSessionId?: boolean): Promise<boolean> {
        try {
            // Enhanced logging to diagnose token issues
            // const tokenPreview = configData.Token ? `${configData.Token.substring(0, 20)}...${configData.Token.substring(configData.Token.length - 10)}` : 'NO TOKEN';
            // console.log('[GraphQL] Config called with token:', {
            //     tokenPreview,
            //     tokenLength: configData.Token?.length,
            //     separateConnection,
            //     hasRefreshFunction: !!configData.Data?.RefreshTokenFunction
            // });

            // CRITICAL: Always set this instance's _configData first
            // This ensures BuildDatasetFilterFromConfig() can access ConfigData.IncludeSchemas
            this._configData = configData;

            if (separateConnection) {
                // Get UUID after setting the configData, so that it can be used to get any stored session ID
                this._sessionId = await this.GetPreferredUUID(forceRefreshSessionId);;

                this._client = this.CreateNewGraphQLClient(configData.URL, configData.Token, this._sessionId, configData.MJAPIKey, configData.UserAPIKey);
                // Store the session ID for this connection
                await this.SaveStoredSessionID(this._sessionId);
            }
            else {
                // Update the singleton instance
                GraphQLDataProvider.Instance._configData = configData;

                if (GraphQLDataProvider.Instance._sessionId === undefined) {
                    GraphQLDataProvider.Instance._sessionId = await this.GetPreferredUUID(forceRefreshSessionId);;
                }

                // now create the new client, if it isn't already created
                if (!GraphQLDataProvider.Instance._client)
                    GraphQLDataProvider.Instance._client = this.CreateNewGraphQLClient(configData.URL, configData.Token, GraphQLDataProvider.Instance._sessionId, configData.MJAPIKey, configData.UserAPIKey);

                // Store the session ID for the global instance
                await GraphQLDataProvider.Instance.SaveStoredSessionID(GraphQLDataProvider.Instance._sessionId);

                // CRITICAL: Sync this instance with the singleton
                // This ensures ExecuteGQL() can use this._client.request()
                this._sessionId = GraphQLDataProvider.Instance._sessionId;
                this._client = GraphQLDataProvider.Instance._client;
            }
            return super.Config(configData); // now parent class can do it's config
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    public get sessionId(): string {
        return this._sessionId;
    }

    protected get AllowRefresh(): boolean {
        return true; // this provider doesn't have any issues with allowing refreshes at any time
    }

    protected async GetCurrentUser(): Promise<UserInfo> {
        const d = await this.ExecuteGQL(this._currentUserQuery, null);
        if (d) {
            // convert the user and the user roles _mj__*** fields back to __mj_***
            const u = this.ConvertBackToMJFields(d.CurrentUser);
            const roles = u.UserRoles_UserIDArray.map(r => this.ConvertBackToMJFields(r));
            u.UserRoles_UserIDArray = roles;
            return new UserInfo(this, {...u, UserRoles: roles}) // need to pass in the UserRoles as a separate property that is what is expected here
        }
    }


    /**************************************************************************/
    // START ---- IRunReportProvider
    /**************************************************************************/
    public async RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult> {
        const query = gql`
        query GetReportDataQuery ($ReportID: String!) {
            GetReportData(ReportID: $ReportID) {
                Success
                Results
                RowCount
                ExecutionTime
                ErrorMessage
            }
        }`

        const result = await this.ExecuteGQL(query, {ReportID: params.ReportID} );
        if (result && result.GetReportData)
            return {
                ReportID: params.ReportID,
                Success: result.GetReportData.Success,
                Results: JSON.parse(result.GetReportData.Results),
                RowCount: result.GetReportData.RowCount,
                ExecutionTime: result.GetReportData.ExecutionTime,
                ErrorMessage: result.GetReportData.ErrorMessage,
            };
    }
    /**************************************************************************/
    // END ---- IRunReportProvider
    /**************************************************************************/

    /**************************************************************************/
    // START ---- IRunQueryProvider
    /**************************************************************************/
    protected async InternalRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        // This is the internal implementation - pre/post processing is handled by ProviderBase.RunQuery()
        if (params.QueryID) {
            return this.RunQueryByID(params.QueryID, params.CategoryID, params.CategoryPath, contextUser, params.Parameters, params.MaxRows, params.StartRow);
        }
        else if (params.QueryName) {
            return this.RunQueryByName(params.QueryName, params.CategoryID, params.CategoryPath, contextUser, params.Parameters, params.MaxRows, params.StartRow);
        }
        else {
            throw new Error("No QueryID or QueryName provided to RunQuery");
        }
    }

    protected async InternalRunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]> {
        // This is the internal implementation - pre/post processing is handled by ProviderBase.RunQueries()
        // Make a single batch GraphQL call for efficiency (single network roundtrip)
        const query = gql`
            query RunQueriesBatch($input: [RunQueryInput!]!) {
                RunQueries(input: $input) {
                    ${this.QueryReturnFieldList}
                }
            }
        `;

        // Convert params to the input format expected by the GraphQL resolver
        const input = params.map(p => ({
            QueryID: p.QueryID,
            QueryName: p.QueryName,
            CategoryID: p.CategoryID,
            CategoryPath: p.CategoryPath,
            Parameters: p.Parameters,
            MaxRows: p.MaxRows,
            StartRow: p.StartRow,
            ForceAuditLog: p.ForceAuditLog,
            AuditLogDescription: p.AuditLogDescription
        }));

        const result = await this.ExecuteGQL(query, { input });
        if (result && result.RunQueries) {
            // Transform each result in the batch
            return result.RunQueries.map((r: unknown) => this.TransformQueryPayload(r));
        }
        return [];
    }

    public async RunQueryByID(QueryID: string, CategoryID?: string, CategoryPath?: string, contextUser?: UserInfo, Parameters?: Record<string, any>, MaxRows?: number, StartRow?: number): Promise<RunQueryResult> {
        const query = gql`
            query GetQueryDataQuery($QueryID: String!, $CategoryID: String, $CategoryPath: String, $Parameters: JSONObject, $MaxRows: Int, $StartRow: Int) {
                GetQueryData(QueryID: $QueryID, CategoryID: $CategoryID, CategoryPath: $CategoryPath, Parameters: $Parameters, MaxRows: $MaxRows, StartRow: $StartRow) {
                    ${this.QueryReturnFieldList}
                }
            }
        `;
    
        // Build the variables object, adding optional parameters if defined.
        const variables: { QueryID: string; CategoryID?: string; CategoryPath?: string; Parameters?: Record<string, any>; MaxRows?: number; StartRow?: number } = { QueryID };
        if (CategoryID !== undefined) {
            variables.CategoryID = CategoryID;
        }
        if (CategoryPath !== undefined) {
            variables.CategoryPath = CategoryPath;
        }
        if (Parameters !== undefined) {
            variables.Parameters = Parameters;
        }
        if (MaxRows !== undefined) {
            variables.MaxRows = MaxRows;
        }
        if (StartRow !== undefined) {
            variables.StartRow = StartRow;
        }
    
        const result = await this.ExecuteGQL(query, variables);
        if (result && result.GetQueryData) {
            return this.TransformQueryPayload(result.GetQueryData);
        }
    }
    
    public async RunQueryByName(QueryName: string, CategoryID?: string, CategoryPath?: string, contextUser?: UserInfo, Parameters?: Record<string, any>, MaxRows?: number, StartRow?: number): Promise<RunQueryResult> {
        const query = gql`
            query GetQueryDataByNameQuery($QueryName: String!, $CategoryID: String, $CategoryPath: String, $Parameters: JSONObject, $MaxRows: Int, $StartRow: Int) {
                GetQueryDataByName(QueryName: $QueryName, CategoryID: $CategoryID, CategoryPath: $CategoryPath, Parameters: $Parameters, MaxRows: $MaxRows, StartRow: $StartRow) {
                    ${this.QueryReturnFieldList}
                }
            }
        `;
    
        // Build the variables object, adding optional parameters if defined.
        const variables: { QueryName: string; CategoryID?: string; CategoryPath?: string; Parameters?: Record<string, any>; MaxRows?: number; StartRow?: number } = { QueryName };
        if (CategoryID !== undefined) {
            variables.CategoryID = CategoryID;
        }
        if (CategoryPath !== undefined) {
            variables.CategoryPath = CategoryPath;
        }
        if (Parameters !== undefined) {
            variables.Parameters = Parameters;
        }
        if (MaxRows !== undefined) {
            variables.MaxRows = MaxRows;
        }
        if (StartRow !== undefined) {
            variables.StartRow = StartRow;
        }
    
        const result = await this.ExecuteGQL(query, variables);
        if (result && result.GetQueryDataByName) {
            return this.TransformQueryPayload(result.GetQueryDataByName);
        }
    }

    protected get QueryReturnFieldList(): string {
        return `
                Success
                QueryID
                QueryName
                Results
                RowCount
                TotalRowCount
                ExecutionTime
                ErrorMessage
                AppliedParameters`
    }
    protected TransformQueryPayload(data: any): RunQueryResult {
        try {
            return {
                QueryID: data.QueryID,
                QueryName: data.QueryName,
                Success: data.Success,
                Results: JSON.parse(data.Results),
                RowCount: data.RowCount,
                TotalRowCount: data.TotalRowCount,
                ExecutionTime: data.ExecutionTime,
                ErrorMessage: data.ErrorMessage,
                AppliedParameters: data.AppliedParameters ? JSON.parse(data.AppliedParameters) : undefined
            };    
        }
        catch (e) {
            LogError(`Error transforming query payload: ${e}`);
            return null;
        }
    }

    /**
     * RunQueriesWithCacheCheck - Smart cache validation for batch RunQueries.
     * For each query, if cacheStatus is provided, the server checks if the cache is current
     * using the Query's CacheValidationSQL. If current, returns status='current' with no data.
     * If stale, returns status='stale' with fresh data.
     *
     * @param params - Array of RunQuery requests with optional cache status
     * @param contextUser - Optional user context
     * @returns Response containing results for each query in the batch
     */
    public async RunQueriesWithCacheCheck<T = unknown>(
        params: RunQueryWithCacheCheckParams[],
        contextUser?: UserInfo
    ): Promise<RunQueriesWithCacheCheckResponse<T>> {
        try {
            // Build the GraphQL input
            const input = params.map(item => ({
                params: {
                    QueryID: item.params.QueryID || null,
                    QueryName: item.params.QueryName || null,
                    CategoryID: item.params.CategoryID || null,
                    CategoryPath: item.params.CategoryPath || null,
                    Parameters: item.params.Parameters || null,
                    MaxRows: item.params.MaxRows ?? null,
                    StartRow: item.params.StartRow ?? null,
                    ForceAuditLog: item.params.ForceAuditLog || false,
                    AuditLogDescription: item.params.AuditLogDescription || null,
                },
                cacheStatus: item.cacheStatus ? {
                    maxUpdatedAt: item.cacheStatus.maxUpdatedAt,
                    rowCount: item.cacheStatus.rowCount,
                } : null,
            }));

            const query = gql`
                query RunQueriesWithCacheCheckQuery($input: [RunQueryWithCacheCheckInput!]!) {
                    RunQueriesWithCacheCheck(input: $input) {
                        success
                        errorMessage
                        results {
                            queryIndex
                            queryId
                            status
                            Results
                            maxUpdatedAt
                            rowCount
                            errorMessage
                        }
                    }
                }
            `;

            const responseData = await this.ExecuteGQL(query, { input });
            const response = responseData?.['RunQueriesWithCacheCheck'] as {
                success: boolean;
                errorMessage?: string;
                results: Array<{
                    queryIndex: number;
                    queryId: string;
                    status: string;
                    Results?: string;
                    maxUpdatedAt?: string;
                    rowCount?: number;
                    errorMessage?: string;
                }>;
            };

            if (!response) {
                return {
                    success: false,
                    results: [],
                    errorMessage: 'No response from server',
                };
            }

            // Transform results - deserialize Results for stale/no_validation results
            const transformedResults: RunQueryWithCacheCheckResult<T>[] = response.results.map(result => {
                if ((result.status === 'stale' || result.status === 'no_validation') && result.Results) {
                    // Deserialize the Results JSON string
                    const deserializedResults: T[] = JSON.parse(result.Results);

                    return {
                        queryIndex: result.queryIndex,
                        queryId: result.queryId,
                        status: result.status as 'current' | 'stale' | 'no_validation' | 'error',
                        results: deserializedResults,
                        maxUpdatedAt: result.maxUpdatedAt,
                        rowCount: result.rowCount,
                        errorMessage: result.errorMessage,
                    };
                }

                return {
                    queryIndex: result.queryIndex,
                    queryId: result.queryId,
                    status: result.status as 'current' | 'stale' | 'no_validation' | 'error',
                    maxUpdatedAt: result.maxUpdatedAt,
                    rowCount: result.rowCount,
                    errorMessage: result.errorMessage,
                };
            });

            return {
                success: response.success,
                results: transformedResults,
                errorMessage: response.errorMessage,
            };
        } catch (e) {
            LogError(`Error in RunQueriesWithCacheCheck: ${e}`);
            return {
                success: false,
                results: [],
                errorMessage: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**************************************************************************/
    // END ---- IRunQueryProvider
    /**************************************************************************/



    /**************************************************************************/
    // START ---- IRunViewProvider
    /**************************************************************************/
    protected async InternalRunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        // This is the internal implementation - pre/post processing is handled by ProviderBase.RunView()
        try {
            let qName: string = ''
            let paramType: string = ''
            if (params) {
                const innerParams: any = {}
                let entity: string, viewEntity: any;
                if (params.ViewEntity) {
                    viewEntity = params.ViewEntity
                    entity = viewEntity.Entity
                }
                else {
                    const {entityName, v} = await this.getEntityNameAndUserView(params, contextUser)
                    viewEntity = v;
                    entity = entityName;
                }

                // get entity metadata
                const e = this.Entities.find(e => e.Name === entity);
                if (!e)
                    throw new Error(`Entity ${entity} not found in metadata`);

                let dynamicView = false;
                const graphQLTypeName = getGraphQLTypeNameBase(e);

                if (params.ViewID) {
                    qName = `Run${graphQLTypeName}ViewByID`;
                    paramType = 'RunViewByIDInput';
                    innerParams.ViewID = params.ViewID;
                }
                else if (params.ViewName) {
                    qName = `Run${graphQLTypeName}ViewByName`;
                    paramType = 'RunViewByNameInput';
                    innerParams.ViewName = params.ViewName;
                }
                else {
                    dynamicView = true;
                    qName = `Run${graphQLTypeName}DynamicView`;
                    paramType = 'RunDynamicViewInput';
                    innerParams.EntityName = params.EntityName;
                }
                innerParams.ExtraFilter = params.ExtraFilter ? params.ExtraFilter : '';
                innerParams.OrderBy = params.OrderBy ? params.OrderBy : '';
                innerParams.UserSearchString = params.UserSearchString ? params.UserSearchString : '';
                innerParams.Fields = params.Fields; // pass it straight through, either null or array of strings
                innerParams.IgnoreMaxRows = params.IgnoreMaxRows ? params.IgnoreMaxRows : false;
                if (params.MaxRows !== undefined)
                    innerParams.MaxRows = params.MaxRows;
                if (params.StartRow !== undefined)
                    innerParams.StartRow = params.StartRow; // Add StartRow parameter
                innerParams.ForceAuditLog = params.ForceAuditLog ? params.ForceAuditLog : false;
                innerParams.ResultType = params.ResultType ? params.ResultType : 'simple';
                if (params.AuditLogDescription && params.AuditLogDescription.length > 0)
                    innerParams.AuditLogDescription = params.AuditLogDescription;

                if (!dynamicView) {
                    innerParams.ExcludeUserViewRunID = params.ExcludeUserViewRunID ? params.ExcludeUserViewRunID : "";
                    innerParams.ExcludeDataFromAllPriorViewRuns = params.ExcludeDataFromAllPriorViewRuns ? params.ExcludeDataFromAllPriorViewRuns : false;
                    innerParams.OverrideExcludeFilter = params.OverrideExcludeFilter ? params.OverrideExcludeFilter : '';
                    innerParams.SaveViewResults = params.SaveViewResults ? params.SaveViewResults : false;
                }

                // Include Aggregates if provided
                if (params.Aggregates && params.Aggregates.length > 0) {
                    innerParams.Aggregates = params.Aggregates.map((a: AggregateExpression) => ({
                        expression: a.expression,
                        alias: a.alias
                    }));
                }

                const fieldList = this.getViewRunTimeFieldList(e, viewEntity, params, dynamicView);

                // Build aggregate fields for response if aggregates requested
                const aggregateResponseFields = params.Aggregates && params.Aggregates.length > 0
                    ? `
                        AggregateResults {
                            alias
                            expression
                            value
                            error
                        }
                        AggregateExecutionTime`
                    : '';

                const query = gql`
                    query RunViewQuery ($input: ${paramType}!) {
                    ${qName}(input: $input) {
                        Results {
                            ${fieldList.join("\n                        ")}
                        }
                        UserViewRunID
                        RowCount
                        TotalRowCount
                        ExecutionTime
                        Success
                        ErrorMessage${aggregateResponseFields}
                    }
                }`

                // Log aggregate request for debugging
                if (innerParams.Aggregates?.length > 0) {
                    console.log('[GraphQLDataProvider] Sending RunView with aggregates:', {
                        entityName: entity,
                        queryName: qName,
                        aggregateCount: innerParams.Aggregates.length,
                        aggregates: innerParams.Aggregates
                    });
                }

                const viewData = await this.ExecuteGQL(query, {input: innerParams} );
                if (viewData && viewData[qName]) {
                    // Log aggregate response for debugging
                    const responseAggregates = viewData[qName].AggregateResults;
                    if (innerParams.Aggregates?.length > 0) {
                        console.log('[GraphQLDataProvider] Received aggregate results:', {
                            entityName: entity,
                            aggregateResultCount: responseAggregates?.length || 0,
                            aggregateResults: responseAggregates,
                            aggregateExecutionTime: viewData[qName].AggregateExecutionTime
                        });
                    }

                    // now, if we have any results in viewData that are for the CodeName, we need to convert them to the Name
                    // so that the caller gets back what they expect
                    const results = viewData[qName].Results;
                    if (results && results.length > 0) {
                        const codeNameDiffFields = e.Fields.filter(f => f.CodeName !== f.Name && f.CodeName !== undefined);
                        results.forEach(r => {
                            // for _mj__ results, we need to convert them back to the Name
                            this.ConvertBackToMJFields(r);
                            codeNameDiffFields.forEach(f => {
                                r[f.Name] = r[f.CodeName];
                                // delete r[f.CodeName];  // Leave the CodeName in the results, it is useful to have both
                            })
                        })
                    }
                    const result = viewData[qName];

                    return result;
                }
            }
            else
                throw ("No parameters passed to RunView");

            return null;
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    protected async InternalRunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {

        try {
            let innerParams: any[] = [];
            let entityInfos: EntityInfo[] = [];
            let fieldList: string[] = [];

            for(const param of params){
                    let qName: string = ''
                    let paramType: string = ''
                    const innerParam: any = {}
                    let entity: string | null = null;
                    let viewEntity: UserViewEntityExtended | null = null;
                    if (param.ViewEntity) {
                        viewEntity = param.ViewEntity as UserViewEntityExtended;
                        entity = viewEntity.Get("Entity");
                    }
                    else {
                        const {entityName, v} = await this.getEntityNameAndUserView(param, contextUser)
                        viewEntity = v;
                        entity = entityName;
                    }

                    // get entity metadata
                    const e = this.Entities.find(e => e.Name === entity);
                    if (!e){
                        throw new Error(`Entity ${entity} not found in metadata`);
                    }

                    entityInfos.push(e);
                    let dynamicView: boolean = false;
                    const graphQLTypeName = getGraphQLTypeNameBase(e);

                    if (param.ViewID) {
                        qName = `Run${graphQLTypeName}ViewByID`;
                        paramType = 'RunViewByIDInput';
                        innerParam.ViewID = param.ViewID;
                    }
                    else if (param.ViewName) {
                        qName = `Run${graphQLTypeName}ViewByName`;
                        paramType = 'RunViewByNameInput';
                        innerParam.ViewName = param.ViewName;
                    }
                    else {
                        dynamicView = true;
                        qName = `Run${graphQLTypeName}DynamicView`;
                        paramType = 'RunDynamicViewInput';
                        innerParam.EntityName = param.EntityName;
                    }

                    innerParam.ExtraFilter = param.ExtraFilter || '';
                    innerParam.OrderBy = param.OrderBy || '';
                    innerParam.UserSearchString = param.UserSearchString || '';
                    // pass it straight through, either null or array of strings
                    innerParam.Fields = param.Fields;
                    innerParam.IgnoreMaxRows = param.IgnoreMaxRows || false;
                    if (param.MaxRows !== undefined)
                        innerParam.MaxRows = param.MaxRows;
                    if (param.StartRow !== undefined)
                        innerParam.StartRow = param.StartRow; // Add StartRow parameter
                    innerParam.ForceAuditLog = param.ForceAuditLog || false;
                    innerParam.ResultType = param.ResultType || 'simple';
                    if (param.AuditLogDescription && param.AuditLogDescription.length > 0){
                        innerParam.AuditLogDescription = param.AuditLogDescription;
                    }

                    if (!dynamicView) {
                        innerParam.ExcludeUserViewRunID = param.ExcludeUserViewRunID || "";
                        innerParam.ExcludeDataFromAllPriorViewRuns = param.ExcludeDataFromAllPriorViewRuns || false;
                        innerParam.OverrideExcludeFilter = param.OverrideExcludeFilter || '';
                        innerParam.SaveViewResults = param.SaveViewResults || false;
                    }

                    // Include Aggregates if provided
                    if (param.Aggregates && param.Aggregates.length > 0) {
                        innerParam.Aggregates = param.Aggregates.map((a: AggregateExpression) => ({
                            expression: a.expression,
                            alias: a.alias
                        }));
                    }

                    innerParams.push(innerParam);
                    fieldList.push(...this.getViewRunTimeFieldList(e, viewEntity, param, dynamicView));
            }

            // Check if any view in the batch has aggregates
            const hasAnyAggregates = params.some(p => p.Aggregates && p.Aggregates.length > 0);
            const aggregateResponseFields = hasAnyAggregates
                ? `
                    AggregateResults {
                        alias
                        expression
                        value
                        error
                    }
                    AggregateExecutionTime`
                : '';

            const query = gql`
                query RunViewsQuery ($input: [RunViewGenericInput!]!) {
                RunViews(input: $input) {
                    Results {
                        PrimaryKey {
                            FieldName
                            Value
                        }
                        EntityID
                        Data
                    }
                    UserViewRunID
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    Success
                    ErrorMessage${aggregateResponseFields}
                }
            }`;

            const viewData: unknown = await this.ExecuteGQL(query, {input: innerParams} );
            if (viewData && viewData["RunViews"]) {
                // now, if we have any results in viewData that are for the CodeName, we need to convert them to the Name
                // so that the caller gets back what they expect
                const results: RunViewResult[] = viewData["RunViews"];
                for(const [index, result] of results.entries()){
                    //const codeNameDiffFields = entityInfos[index].Fields.filter(f => f.CodeName !== f.Name && f.CodeName !== undefined);
                    result.Results = result.Results.map((data: unknown) => {
                        let deserializeData: Record<string, unknown> = JSON.parse(data["Data"]);
                        // for _mj__ results, we need to convert them back to the Name
                        this.ConvertBackToMJFields(deserializeData);
                        /*
                        codeNameDiffFields.forEach(f => {
                            deserializeData[f.Name] = deserializeData[f.CodeName];
                            // delete r[f.CodeName];  // Leave the CodeName in the results, it is useful to have both
                        });
                        */
                       return deserializeData;
                    });
                }

                return results;
            }

            return null;

        }
        catch (e) {
            LogError(e);
            throw (e);
        }
    }

    /**
     * RunViewsWithCacheCheck - Smart cache validation for batch RunViews.
     * For each view, if cacheStatus is provided, the server checks if the cache is current.
     * If current, returns status='current' with no data. If stale, returns status='stale' with fresh data.
     *
     * @param params - Array of RunView requests with optional cache status
     * @param contextUser - Optional user context
     * @returns Response containing results for each view in the batch
     */
    public async RunViewsWithCacheCheck<T = unknown>(
        params: RunViewWithCacheCheckParams[],
        contextUser?: UserInfo
    ): Promise<RunViewsWithCacheCheckResponse<T>> {
        try {
            // Build the GraphQL input
            const input = params.map(item => ({
                params: {
                    EntityName: item.params.EntityName || '',
                    ExtraFilter: item.params.ExtraFilter || '',
                    OrderBy: item.params.OrderBy || '',
                    Fields: item.params.Fields,
                    UserSearchString: item.params.UserSearchString || '',
                    IgnoreMaxRows: item.params.IgnoreMaxRows || false,
                    MaxRows: item.params.MaxRows,
                    StartRow: item.params.StartRow,
                    ForceAuditLog: item.params.ForceAuditLog || false,
                    AuditLogDescription: item.params.AuditLogDescription || '',
                    ResultType: item.params.ResultType || 'simple',
                },
                cacheStatus: item.cacheStatus ? {
                    maxUpdatedAt: item.cacheStatus.maxUpdatedAt,
                    rowCount: item.cacheStatus.rowCount,
                } : null,
            }));

            const query = gql`
                query RunViewsWithCacheCheckQuery($input: [RunViewWithCacheCheckInput!]!) {
                    RunViewsWithCacheCheck(input: $input) {
                        success
                        errorMessage
                        results {
                            viewIndex
                            status
                            maxUpdatedAt
                            rowCount
                            errorMessage
                            Results {
                                PrimaryKey {
                                    FieldName
                                    Value
                                }
                                EntityID
                                Data
                            }
                            differentialData {
                                updatedRows {
                                    PrimaryKey {
                                        FieldName
                                        Value
                                    }
                                    EntityID
                                    Data
                                }
                                deletedRecordIDs
                            }
                        }
                    }
                }
            `;

            const responseData = await this.ExecuteGQL(query, { input });
            const response = responseData?.['RunViewsWithCacheCheck'] as {
                success: boolean;
                errorMessage?: string;
                results: Array<{
                    viewIndex: number;
                    status: string;
                    maxUpdatedAt?: string;
                    rowCount?: number;
                    errorMessage?: string;
                    Results?: Array<{ PrimaryKey: Array<{ FieldName: string; Value: string }>; EntityID: string; Data: string }>;
                    differentialData?: {
                        updatedRows: Array<{ PrimaryKey: Array<{ FieldName: string; Value: string }>; EntityID: string; Data: string }>;
                        deletedRecordIDs: string[];
                    };
                }>;
            };

            if (!response) {
                return {
                    success: false,
                    results: [],
                    errorMessage: 'No response from server',
                };
            }

            // Transform results - deserialize Data fields for stale/differential results
            const transformedResults: RunViewWithCacheCheckResult<T>[] = response.results.map((result, index) => {
                const inputItem = params[index];

                if (result.status === 'differential' && result.differentialData) {
                    // Deserialize the differential data
                    const deserializedUpdatedRows: T[] = result.differentialData.updatedRows.map(r => {
                        const data = JSON.parse(r.Data);
                        this.ConvertBackToMJFields(data);
                        return data as T;
                    });

                    return {
                        viewIndex: result.viewIndex,
                        status: result.status as 'current' | 'stale' | 'differential' | 'error',
                        results: undefined,
                        differentialData: {
                            updatedRows: deserializedUpdatedRows,
                            deletedRecordIDs: result.differentialData.deletedRecordIDs,
                        },
                        maxUpdatedAt: result.maxUpdatedAt,
                        rowCount: result.rowCount,
                        errorMessage: result.errorMessage,
                    };
                }

                if (result.status === 'stale' && result.Results) {
                    // Deserialize the Data field and convert back MJ fields
                    const deserializedResults: T[] = result.Results.map(r => {
                        const data = JSON.parse(r.Data);
                        this.ConvertBackToMJFields(data);
                        return data as T;
                    });

                    return {
                        viewIndex: result.viewIndex,
                        status: result.status as 'current' | 'stale' | 'differential' | 'error',
                        results: deserializedResults,
                        maxUpdatedAt: result.maxUpdatedAt,
                        rowCount: result.rowCount,
                        errorMessage: result.errorMessage,
                    };
                }

                return {
                    viewIndex: result.viewIndex,
                    status: result.status as 'current' | 'stale' | 'differential' | 'error',
                    results: undefined,
                    maxUpdatedAt: result.maxUpdatedAt,
                    rowCount: result.rowCount,
                    errorMessage: result.errorMessage,
                };
            });

            return {
                success: response.success,
                results: transformedResults,
                errorMessage: response.errorMessage,
            };
        } catch (e) {
            LogError(e);
            return {
                success: false,
                results: [],
                errorMessage: e instanceof Error ? e.message : String(e),
            };
        }
    }

    protected async getEntityNameAndUserView(params: RunViewParams, contextUser?: UserInfo): Promise<{entityName: string, v: UserViewEntityExtended}> {
        let entityName: string;
        let v: UserViewEntityExtended;

        if (!params.EntityName) {
            if (params.ViewID) {
                v = await ViewInfo.GetViewEntity(params.ViewID, contextUser)
                entityName = v.Entity
            }
            else if (params.ViewName) {
                v = await ViewInfo.GetViewEntityByName(params.ViewName, contextUser);
                entityName = v.Entity
            }
            else
                throw new Error(`No EntityName, ViewID or ViewName passed to RunView`)
        }
        else
            entityName = params.EntityName

        return {entityName, v}
    }

    protected getViewRunTimeFieldList(e: EntityInfo, v: UserViewEntityExtended, params: RunViewParams, dynamicView: boolean): string[] {
        const fieldList = [];
        const mapper = new FieldMapper();
        if (params.Fields) {
            for (const kv of e.PrimaryKeys) {
                if (params.Fields.find(f => f.trim().toLowerCase() === kv.Name.toLowerCase()) === undefined)
                    fieldList.push(kv.Name); // always include the primary key fields in view run time field list
            }

            // now add any other fields that were passed in
            params.Fields.forEach(f => {
              fieldList.push(mapper.MapFieldName(f))
            });
        }
        else {
            // no fields were passed in. So, let's check to see if we are running an dynamic view.
            // If so, we need to include all fields since the caller didn't specify the fields they want
            // otherwise, we include the fields that are part of the view definition.
            if (dynamicView) {
                // include all fields since no fields were passed in
                e.Fields.forEach(f => {
                    if (!f.IsBinaryFieldType) {
                      fieldList.push(mapper.MapFieldName(f.CodeName));
                    }
                });
            }
            else {
                // NOTE: in the below, c.EntityField SHOULD always exist, however there is a possibility that at some point a VIEW was created that used fields
                // and those fields are NO LONGER part of an entity, in that situation we should just remove them, rather than letting the whole view blow up which
                // would happen if we dno't check for c.EntityField? in the below

                // first make sure we have the primary key field in the view column list, always should, but make sure
                for (const kv of e.PrimaryKeys) {
                    if (fieldList.find(f => f.trim().toLowerCase() === kv.Name.toLowerCase()) === undefined)
                        fieldList.push(kv.Name); // always include the primary key fields in view run time field list
                }

                // Now: include the fields that are part of the view definition
                v.Columns.forEach(c => {
                    if (c.hidden === false && !fieldList.find(item => item.trim().toLowerCase() === c.EntityField?.Name.trim().toLowerCase())) { // don't include hidden fields and don't include the pkey field again
                        if (!c.EntityField) {
                            // this can happen if a field was previously included in a view, but is no longer part of the entity
                            // simply don't include it in the field list
                        }
                        else
                            fieldList.push(mapper.MapFieldName(c.EntityField.CodeName));
                    }
                });
            }
        }
        return fieldList;
    }
    /**************************************************************************/
    // END ---- IRunViewProvider
    /**************************************************************************/


    /**************************************************************************/
    // START ---- IEntityDataProvider
    /**************************************************************************/
    public get ProviderType(): ProviderType {
        return ProviderType.Network;
    }

    public async GetRecordChanges(entityName: string, primaryKey: CompositeKey): Promise<RecordChange[]> {
        try {
            const p: RunViewParams = {
                EntityName: 'Record Changes',
                ExtraFilter: `RecordID = '${primaryKey.Values()}' AND Entity = '${entityName}'`,
                //OrderBy: 'ChangedAt DESC',
            }
            const result = await this.RunView(p);
            if (result) {
                // sort the results client side because, for now, the RunViewParams doesn't support OrderBy dynamically like we tried. Later change this to do via the SQL query
                return result.Results.sort((a: RecordChange, b: RecordChange) => {
                    return (a.ChangedAt > b.ChangedAt) ? -1 : 1 // sort descending on the date.... GraphQL passes back the date as time since base date
                 });
            }
            else
                return null;
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }


    /**
     * Returns a list of dependencies - records that are linked to the specified Entity/KeyValuePairs combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param KeyValuePairs the KeyValuePairs of the record to check
     */
    public async GetRecordDependencies(entityName: string, primaryKey: CompositeKey): Promise<RecordDependency[]> {
        try {
            // execute the gql query to get the dependencies
            const query = gql`query GetRecordDependenciesQuery ($entityName: String!, $CompositeKey: CompositeKeyInputType!) {
                GetRecordDependencies(entityName: $entityName, CompositeKey: $CompositeKey) {
                    EntityName
                    RelatedEntityName
                    FieldName
                    CompositeKey {
                        KeyValuePairs {
                            FieldName
                            Value
                        }
                    }
                }
            }`

            // now we have our query built, execute it
            const vars = {
                entityName: entityName,
                CompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(primaryKey.KeyValuePairs)}
            };
            const data = await this.ExecuteGQL(query, vars);

            return data?.GetRecordDependencies; // shape of the result should exactly match the RecordDependency type
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    protected ensureKeyValuePairValueIsString(kvps: KeyValuePair[]): {FieldName: string, Value: string}[] {
        return kvps.map(kv => {
            return {FieldName: kv.FieldName, Value: kv.Value.toString()}
        })
    }

    public async GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse>
    {
        if(!params){
            return null;
        }

        const query: string = gql`query GetRecordDuplicatesQuery ($params: PotentialDuplicateRequestType!) {
            GetRecordDuplicates(params: $params) {
                Status
                ErrorMessage
                PotentialDuplicateResult {
                    EntityID
                    DuplicateRunDetailMatchRecordIDs
                    RecordPrimaryKeys {
                        KeyValuePairs {
                            FieldName
                            Value
                    }
                }
                    Duplicates {
                        ProbabilityScore
                        KeyValuePairs {
                            FieldName
                            Value
                        }
                    }
                }
            }
        }`

        let request = {
            EntityID: params.EntityID,
            EntityDocumentID: params.EntityDocumentID,
            ListID: params.ListID,
            ProbabilityScore: params.ProbabilityScore,
            Options: params.Options,
            RecordIDs: params.RecordIDs.map(recordID => {
                return recordID.Copy();
            })
        }
        const data = await this.ExecuteGQL(query, {params: request});

        if(data && data.GetRecordDuplicates){
            return data.GetRecordDuplicates;
        }
    }

    public async MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, options?: EntityMergeOptions): Promise<RecordMergeResult> {
        const e = this.Entities.find(e=>e.Name.trim().toLowerCase() === request.EntityName.trim().toLowerCase());
        if (!e || !e.AllowRecordMerge)
            throw new Error(`Entity ${request.EntityName} does not allow record merging, check the AllowRecordMerge property in the entity metadata`);

        try {
            // execute the gql query to get the dependencies
            const mutation = gql`mutation MergeRecordsMutation ($request: RecordMergeRequest!) {
                MergeRecords(request: $request) {
                    Success
                    OverallStatus
                    RecordMergeLogID
                    RecordStatus {
                        CompositeKey {
                            KeyValuePairs {
                                FieldName
                                Value
                            }
                        }
                        Success
                        RecordMergeDeletionLogID
                        Message
                    }
                }
            }`

            // create a new request that is compatible with the server's expectations where field maps and also the primary key values are all strings
            const newRequest = {
                EntityName: request.EntityName,
                SurvivingRecordCompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(request.SurvivingRecordCompositeKey.KeyValuePairs)},
                FieldMap: request.FieldMap?.map(fm => {
                    return {
                        FieldName: fm.FieldName,
                        Value: fm.Value.toString() // turn the value into a string, since that is what the server expects
                    }
                }),
                RecordsToMerge: request.RecordsToMerge.map(r => {
                    return r.Copy();
                })
            }

            // now we have our query built, execute it
            const data = await this.ExecuteGQL(mutation, {request: newRequest});

            return data?.MergeRecords; // shape of the result should exactly match the RecordDependency type
        }
        catch (e) {
            LogError(e);
            return {
                Success: false,
                OverallStatus: e && e.message ? e.message : e,
                RecordStatus: [],
                RecordMergeLogID: "",
                Request: request,
            }
            throw (e)
        }
    }

    public async Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions) : Promise<{}> {
        // IS-A parent entity save: the full ORM pipeline (permissions, validation, events)
        // already ran in BaseEntity._InnerSave(). Skip the network call — the leaf entity's
        // mutation will include all chain fields. Return current entity state.
        if (options?.IsParentEntitySave) {
            const result = new BaseEntityResult();
            result.StartedAt = new Date();
            result.EndedAt = new Date();
            result.Type = entity.IsSaved ? 'update' : 'create';
            result.Success = true;
            result.NewValues = entity.GetAll();
            entity.ResultHistory.push(result);
            return result.NewValues;
        }

        const result = new BaseEntityResult();
        try {
            entity.RegisterTransactionPreprocessing(); // as of the time of writing, this isn't technically needed because we are not doing any async preprocessing, but it is good to have it here for future use in case something is added with async between here and the TransactionItem being added.

            const vars = { input: {} };
            const type: string = entity.IsSaved ? "Update" : "Create";

            result.StartedAt = new Date();
            result.Type = entity.IsSaved ? 'update' : 'create';
            result.OriginalValues = entity.Fields.map(f => { return {FieldName: f.CodeName, Value: f.Value} });
            entity.ResultHistory.push(result); // push the new result as we have started a process

            // Create the query for the mutation first, we will provide the specific
            // input values later in the loop below. Here we are just setting up the mutation
            // and the fields that will be returned since the mutation returns back the latest
            // values for the entity and we need to have those values to update the entity after the
            // save

            const graphQLTypeName = getGraphQLTypeNameBase(entity.EntityInfo);
            const mutationName = `${type}${graphQLTypeName}`

            // only pass along writable fields, AND the PKEY value if this is an update
            const filteredFields = entity.Fields.filter(f => !f.ReadOnly || (f.IsPrimaryKey && entity.IsSaved));
            const mapper = new FieldMapper();
            const inner = `                ${mutationName}(input: $input) {
                ${entity.Fields.map(f => mapper.MapFieldName(f.CodeName)).join("\n                    ")}
            }`
            const outer = gql`mutation ${type}${graphQLTypeName} ($input: ${mutationName}Input!) {
                ${inner}
            }
            `
            for (let i = 0; i < filteredFields.length; i++) {
                const f = filteredFields[i];
                // use entity.Get() instead of f.Value
                // in case there is an IsA relationship where parent entity 
                // is where the value is. f.Value would still be old value
                let val = entity.Get(f.Name); 
                if (val) {
                    // type conversions as needed for GraphQL
                    switch(f.EntityFieldInfo.TSType) {
                        case EntityFieldTSType.Date:
                            val = val.getTime();
                            break;
                        case EntityFieldTSType.Boolean:
                            if (typeof val !== 'boolean') {
                                val = parseInt(val) === 0 ? false : true; // convert to boolean
                            }
                            break;
                        case EntityFieldTSType.Number:
                            if (typeof val !== 'number') {
                                const numValue = Number(val);
                                if (!isNaN(numValue)) {
                                  val = numValue;
                                }      
                            }
                            break;
                    }
                }

                if (val === null && f.EntityFieldInfo.AllowsNull === false) {
                    // no value, field doesn't allow nulls, so set to default value, if available and then fall back to either 0 or empty string depending on type
                    if (f.EntityFieldInfo.DefaultValue !== null) {
                        // no value, but there is a default value, so use that, since field does NOT allow NULL
                        val = f.EntityFieldInfo.DefaultValue;
                    }
                    else {
                        // no default value, null value and field doesn't allow nulls, so set to either 0 or empty string
                        if (f.FieldType === EntityFieldTSType.Number || f.FieldType === EntityFieldTSType.Boolean)
                            val = 0;
                        else
                            val = '';
                    }
                }
                vars.input[f.CodeName] = val;
            }

            // now add an OldValues prop to the vars IF the type === 'update' and the options.SkipOldValuesCheck === false
            if (type.trim().toLowerCase() === 'update' &&
                options.SkipOldValuesCheck === false) {
                const ov = [];
                entity.Fields.forEach(f => {
                    let val = null;
                    if (f.OldValue !== null && f.OldValue !== undefined) {
                        if (f.EntityFieldInfo.TSType === EntityFieldTSType.Date) 
                            val = f.OldValue.getTime().toString();
                        else if (f.EntityFieldInfo.TSType === EntityFieldTSType.Boolean)
                            val = f.OldValue === true ? "1" : "0";
                        else if (typeof f.OldValue !== "string")
                            val = f.OldValue.toString();
                        else
                            val = f.OldValue;
                    }
                    ov.push({Key: f.CodeName, Value: val }); // pass ALL old values to server, slightly inefficient but we want full record
                });
                vars.input['OldValues___'] = ov; // add the OldValues prop to the input property that is part of the vars already
            }

            if (entity.TransactionGroup) {
                const mutationInputTypes = [
                    {
                        varName: 'input',
                        inputType: mutationName + 'Input!'
                    }
                ];

                entity.RaiseReadyForTransaction(); // let the entity know we're ready to be part of the transaction

                // we are part of a transaction group, so just add our query to the list
                // and when the transaction is committed, we will send all the queries at once
                entity.TransactionGroup.AddTransaction(new TransactionItem(        entity, 
                                                                                   result.Type === 'create' ? 'Create' : 'Update', 
                                                                                   inner, vars, 
                                                                                   {
                                                                                      mutationName,
                                                                                      mutationInputTypes: mutationInputTypes
                                                                                   },
                                                                                   (results: any, success: boolean) => {
                    // we get here whenever the transaction group does gets around to committing
                    // our query. We need to update our entity with the values that were returned
                    // from the mutation if it was successful.
                    result.EndedAt = new Date();
                    if (success && results) {
                        // got our data, send it back to the caller, which is the entity object
                        // and that object needs to update itself from this data.
                        result.Success = true;
                        result.NewValues = this.ConvertBackToMJFields(results);
                    }
                    else {
                        // the transaction failed, nothing to update, but we need to call Reject so the
                        // promise resolves with a rejection so our outer caller knows
                        result.Success = false;
                        result.Message = 'Transaction failed';
                    }
                }));

                return true; // part of a TG always return true after we setup the transaction group item above
            }
            else {
                // not part of a transaction group, so just go for it and send across our GQL
                const d = await this.ExecuteGQL(outer, vars)
                if (d && d[mutationName]) {
                    result.Success = true;
                    result.EndedAt = new Date();
                    result.NewValues = this.ConvertBackToMJFields(d[mutationName]);
                    return result.NewValues;
                }
                else
                    throw new Error(`Save failed for ${entity.EntityInfo.ClassName}`);
            }
        }
        catch (e) {
            result.Success = false;
            result.EndedAt = new Date();
            result.Message = e.response?.errors?.length > 0 ? e.response.errors[0].message : e.message;
            LogError(e);
            return null;
        }
    }
    public async Load(entity: BaseEntity, primaryKey: CompositeKey, EntityRelationshipsToLoad: string[] = null, user: UserInfo) : Promise<{}> {
        try {
            const vars = {};
            let pkeyInnerParamString: string = '';
            let pkeyOuterParamString: string = '';

            for (let i = 0; i < primaryKey.KeyValuePairs.length; i++) {
                const field: EntityFieldInfo = entity.Fields.find(f => f.Name.trim().toLowerCase() === primaryKey.KeyValuePairs[i].FieldName.trim().toLowerCase()).EntityFieldInfo;
                const val = primaryKey.GetValueByIndex(i);
                const pkeyGraphQLType: string = field.GraphQLType;

                // build up the param string for the outer query definition
                if (pkeyOuterParamString.length > 0)
                    pkeyOuterParamString += ', ';
                pkeyOuterParamString += `$${field.CodeName}: ${pkeyGraphQLType}!`;

                // build up the param string for the inner query call
                if (pkeyInnerParamString.length > 0)
                    pkeyInnerParamString += ', ';
                pkeyInnerParamString += `${field.CodeName}: $${field.CodeName}`;

                // build up the variables we are passing along to the query
                if (field.TSType === EntityFieldTSType.Number) {
                    if (isNaN(primaryKey.GetValueByIndex(i)))
                        throw new Error(`Primary Key value ${val} (${field.Name}) is not a valid number`);
                    vars[field.CodeName] =  parseInt(val); // converting to number here for graphql type to work properly
                }
                else
                    vars[field.CodeName] = val;
            }

            const rel = EntityRelationshipsToLoad && EntityRelationshipsToLoad.length > 0 ? this.getRelatedEntityString(entity.EntityInfo, EntityRelationshipsToLoad) : '';

            const graphQLTypeName = getGraphQLTypeNameBase(entity.EntityInfo);
            const mapper = new FieldMapper();
            const query = gql`query Single${graphQLTypeName}${rel.length > 0 ? 'Full' : ''} (${pkeyOuterParamString}) {
                ${graphQLTypeName}(${pkeyInnerParamString}) {
                                    ${entity.Fields.filter((f) => !f.EntityFieldInfo.IsBinaryFieldType)
                                      .map((f) => {
                                        if (f.EntityFieldInfo.Name.trim().toLowerCase().startsWith('__mj_')) {
                                          // fields that start with __mj_ need to be converted to _mj__ for the GraphQL query
                                          return f.CodeName.replace('__mj_', '_mj__');
                                        } else {
                                          return f.CodeName;
                                        }
                                      })
                                      .join('\n                    ')}
                    ${rel}
                }
            }
            `;

            const d = await this.ExecuteGQL(query, vars)
            if (d && d[graphQLTypeName]) {
                // the resulting object has all the values in it, but we need to convert any elements that start with _mj__ back to __mj_
                return this.ConvertBackToMJFields(d[graphQLTypeName]);
            }
            else
                return null;
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }

    /**
     * This method will convert back any fields that start with _mj__ back to __mj_ so that the entity object can properly update itself with the data that was returned from the server
     * @param ret
     * @returns
     */
    protected ConvertBackToMJFields(ret: any): any {
        const mapper = new FieldMapper();
        mapper.ReverseMapFields(ret);
        return ret; // clean object to pass back here
    }

    protected getRelatedEntityString(entityInfo: EntityInfo, EntityRelationshipsToLoad: string[]): string {
        let rel = '';
        for (let i = 0; i < entityInfo.RelatedEntities.length; i++) {
            if (EntityRelationshipsToLoad.indexOf(entityInfo.RelatedEntities[i].RelatedEntity) >= 0) {
                const r = entityInfo.RelatedEntities[i];
                const re = this.Entities.find(e => e.ID === r.RelatedEntityID);
                let uniqueCodeName: string = '';
                if (r.Type.toLowerCase().trim() === 'many to many') {
                    uniqueCodeName = `${r.RelatedEntityCodeName}_${r.JoinEntityJoinField.replace(/\s/g, '')}`;
                }
                else {
                    uniqueCodeName = `${r.RelatedEntityCodeName}_${r.RelatedEntityJoinField.replace(/\s/g, '')}`;
                }
                rel += `
                ${uniqueCodeName} {
                    ${re.Fields.map(f => f.CodeName).join("\n                    ")}
                }
                `;
            }
        }
        return rel;
    }

    public async Delete(entity: BaseEntity, options: EntityDeleteOptions, user: UserInfo) : Promise<boolean> {
        const result = new BaseEntityResult();
        try {
            entity.RegisterTransactionPreprocessing();

            result.StartedAt = new Date();
            result.Type = 'delete';
            result.OriginalValues = entity.Fields.map(f => { return {FieldName: f.CodeName, Value: f.Value} });
            entity.ResultHistory.push(result); // push the new result as we have started a process

            const vars = {};
            const mutationInputTypes = [];
            let pkeyInnerParamString: string = '';
            let pkeyOuterParamString: string = '';
            let returnValues: string = '';
            for (let kv of entity.PrimaryKey.KeyValuePairs) {
                const pk = entity.Fields.find(f => f.Name.trim().toLowerCase() === kv.FieldName.trim().toLowerCase()); // get the field for the primary key field
                vars[pk.CodeName] = pk.Value;
                mutationInputTypes.push({varName: pk.CodeName, inputType: pk.EntityFieldInfo.GraphQLType + '!'}); // only used when doing a transaction group, but it is easier to do in this main loop
                if (pkeyInnerParamString.length > 0)
                    pkeyInnerParamString += ', ';
                pkeyInnerParamString += `${pk.CodeName}: $${pk.CodeName}`;

                if (pkeyOuterParamString.length > 0)
                    pkeyOuterParamString += ', ';
                pkeyOuterParamString += `$${pk.CodeName}: ${pk.EntityFieldInfo.GraphQLType}!`;

                if (returnValues.length > 0)
                    returnValues += '\n                    ';
                returnValues += `${pk.CodeName}`;
            }

            mutationInputTypes.push({varName: "options___", inputType: 'DeleteOptionsInput!'}); // only used when doing a transaction group, but it is easier to do in this main loop
            vars["options___"] = options ? options : {SkipEntityAIActions: false, SkipEntityActions: false};

            const graphQLTypeName = getGraphQLTypeNameBase(entity.EntityInfo);
            const queryName: string = 'Delete' + graphQLTypeName;
            const inner = gql`${queryName}(${pkeyInnerParamString}, options___: $options___) {
                ${returnValues}
            }
            `
            const query = gql`mutation ${queryName} (${pkeyOuterParamString}, $options___: DeleteOptionsInput!) {
                ${inner}
            }
            `

            if (entity.TransactionGroup) {
                // we have a transaction group, need to play nice and be part of it
                entity.RaiseReadyForTransaction();
                // we are part of a transaction group, so just add our query to the list
                // and when the transaction is committed, we will send all the queries at once
                entity.TransactionGroup.AddTransaction(new TransactionItem(entity, 'Delete', inner, vars, {mutationName: queryName,
                                                                                            mutationInputTypes: mutationInputTypes},
                                                                                        (results: any, success: boolean) => {
                    // we get here whenever the transaction group does gets around to committing
                    // our query.
                    result.EndedAt = new Date(); // done processing
                    if (success && results) {
                        // success indicated by the entity.PrimaryKey.Value matching the return value of the mutation
                        let success: boolean = true;
                        for (const pk of entity.PrimaryKey.KeyValuePairs) {
                            // check each primary key value to see if it matches the return value of the mutation
                            if (pk.Value !== results[pk.FieldName]) {
                                success = false;
                            }
                        }
                        if (success) {
                            result.Success = true;
                        }
                        else {
                            // the transaction failed, nothing to update, but we need to call Reject so the
                            // promise resolves with a rejection so our outer caller knows
                            result.Success = false;
                            result.Message = 'Transaction failed to commit'
                        }
                    }
                    else {
                        // the transaction failed, nothing to update, but we need to call Reject so the
                        // promise resolves with a rejection so our outer caller knows
                        result.Success = false;
                        result.Message = 'Transaction failed to commit'
                    }
                }));
                return true;
            }
            else {
                // no transaction just go for it
                const d = await this.ExecuteGQL(query, vars)
                if (d && d[queryName]) {
                    const data = d[queryName];
                    for (let key of entity.PrimaryKey.KeyValuePairs) {
                        // we want to now compare key.Value against data[key.FieldName]
                        let returnedVal = data[key.FieldName];
                        let originalVal = key.Value;
                        // we want to ignore types so we should convert numbers to strings for the comparison
                        if (typeof originalVal === 'number')
                            originalVal = originalVal.toString();
                        if (typeof returnedVal === 'number')
                            returnedVal = returnedVal.toString();
                        // now compare the two values
                        if (originalVal !== returnedVal) {
                            throw new Error (`Primary key value mismatch in server Delete response. Field: ${key.FieldName}, Original: ${originalVal}, Returned: ${returnedVal}`);
                        }
                    }
                    result.Success = true;
                    result.EndedAt = new Date(); // done processing
                    return true; // all of the return values match the primary key values, so we are good and delete worked
                }
                else
                    throw new Error(`Delete failed for ${entity.EntityInfo.Name}: ${entity.PrimaryKey.ToString()} `);
            }
        }
        catch (e) {
            result.EndedAt = new Date(); // done processing
            result.Success = false;
            result.Message = e.response?.errors?.length > 0 ? e.response.errors[0].message : e.message;
            LogError(e);

            return false;
        }
    }
    /**************************************************************************/
    // END ---- IEntityDataProvider
    /**************************************************************************/


    /**************************************************************************/
    // START ---- IMetadataProvider
    /**************************************************************************/
    /**
     * Returns a dataset by name
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType> {
        const query = gql`query GetDatasetByName($DatasetName: String!, $ItemFilters: [DatasetItemFilterTypeGQL!]) {
            GetDatasetByName(DatasetName: $DatasetName, ItemFilters: $ItemFilters) {
                DatasetID
                DatasetName
                Success
                Status
                LatestUpdateDate
                Results
            }
        }`
        const data = await this.ExecuteGQL(query,  {DatasetName: datasetName, ItemFilters: itemFilters });
        if (data && data.GetDatasetByName && data.GetDatasetByName.Success) {
            return {
                DatasetID: data.GetDatasetByName.DatasetID,
                DatasetName: data.GetDatasetByName.DatasetName,
                Success: data.GetDatasetByName.Success,
                Status: data.GetDatasetByName.Status,
                LatestUpdateDate: new Date(data.GetDatasetByName.LatestUpdateDate),
                Results: JSON.parse(data.GetDatasetByName.Results)
            }
        }
        else {
            return {
                DatasetID: "",
                DatasetName: datasetName,
                Success: false,
                Status: 'Unknown',
                LatestUpdateDate: null,
                Results: null
            };
        }
    }

    public async GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetStatusResultType> {
        const query = gql`query GetDatasetStatusByName($DatasetName: String!, $ItemFilters: [DatasetItemFilterTypeGQL!]) {
            GetDatasetStatusByName(DatasetName: $DatasetName, ItemFilters: $ItemFilters) {
                DatasetID
                DatasetName
                Success
                Status
                LatestUpdateDate
                EntityUpdateDates
            }
        }`
        const data = await this.ExecuteGQL(query,  {DatasetName: datasetName, ItemFilters: itemFilters});
        if (data && data.GetDatasetStatusByName && data.GetDatasetStatusByName.Success) {
            return {
                DatasetID: data.GetDatasetStatusByName.DatasetID,
                DatasetName: data.GetDatasetStatusByName.DatasetName,
                Success: data.GetDatasetStatusByName.Success,
                Status: data.GetDatasetStatusByName.Status,
                LatestUpdateDate: new Date(data.GetDatasetStatusByName.LatestUpdateDate),
                EntityUpdateDates: JSON.parse(data.GetDatasetStatusByName.EntityUpdateDates)
            }
        }
        else {
            return {
                DatasetID: "",
                DatasetName: datasetName,
                Success: false,
                Status: 'Unknown',
                LatestUpdateDate: null,
                EntityUpdateDates: null
            };
        }
    }

    public async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        return new GraphQLTransactionGroup(this);
    }

    public async GetRecordFavoriteStatus(userId: string, entityName: string, primaryKey: CompositeKey): Promise<boolean> {
        const valResult = primaryKey.Validate();
        if (!valResult.IsValid)
            return false;

        const e = this.Entities.find(e => e.Name === entityName)
        if (!e)
            throw new Error(`Entity ${entityName} not found in metadata`);

        const query = gql`query GetRecordFavoriteStatus($params: UserFavoriteSearchParams!) {
            GetRecordFavoriteStatus(params: $params) {
                Success
                IsFavorite
            }
        }`

        const data = await this.ExecuteGQL(query,  {params: {
                                                                            UserID: userId,
                                                                            EntityID: e.ID,
                                                                            CompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(primaryKey.KeyValuePairs)}
                                                                            }
                                                                  }
                                                         );
        if (data && data.GetRecordFavoriteStatus && data.GetRecordFavoriteStatus.Success)
            return data.GetRecordFavoriteStatus.IsFavorite;
    }

    public async SetRecordFavoriteStatus(userId: string, entityName: string, primaryKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo): Promise<void> {
        const e = this.Entities.find(e => e.Name === entityName)
        if (!e){
            throw new Error(`Entity ${entityName} not found in metadata`);
        }

        const query = gql`mutation SetRecordFavoriteStatus($params: UserFavoriteSetParams!) {
            SetRecordFavoriteStatus(params: $params){
                Success
            }
        }`

        const data = await this.ExecuteGQL(query,  { params: {
                                                                                UserID: userId,
                                                                                EntityID: e.ID,
                                                                                CompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(primaryKey.KeyValuePairs)},
                                                                                IsFavorite: isFavorite}
                                                                 }
                                                         );
        if (data && data.SetRecordFavoriteStatus !== null)
            return data.SetRecordFavoriteStatus.Success;
    }

    protected async InternalGetEntityRecordName(entityName: string, primaryKey: CompositeKey): Promise<string> {
        if (!entityName || !primaryKey || primaryKey.KeyValuePairs?.length === 0){
            return null;
        }

        const query = gql`query GetEntityRecordNameQuery ($EntityName: String!, $CompositeKey: CompositeKeyInputType!) {
            GetEntityRecordName(EntityName: $EntityName, CompositeKey: $CompositeKey) {
                Success
                Status
                RecordName
            }
        }`

        const data = await this.ExecuteGQL(query, {
                                                                    EntityName: entityName,
                                                                    CompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(primaryKey.KeyValuePairs)}
                                                                });
        if (data && data.GetEntityRecordName && data.GetEntityRecordName.Success)
            return data.GetEntityRecordName.RecordName;
    }

    protected async InternalGetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
        if (!info)
            return null;

        const query = gql`query GetEntityRecordNamesQuery ($info: [EntityRecordNameInput!]!) {
            GetEntityRecordNames(info: $info) {
                Success
                Status
                CompositeKey {
                    KeyValuePairs {
                        FieldName
                        Value
                    }
                }
                EntityName
                RecordName
            }
        }`

        const data = await this.ExecuteGQL(query,  {info: info.map(i => {
            return {
                     EntityName: i.EntityName,
                     CompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(i.CompositeKey.KeyValuePairs)}
                    }
                })});
        if (data && data.GetEntityRecordNames) {
            // Convert plain CompositeKey objects from GraphQL response to real CompositeKey instances
            return data.GetEntityRecordNames.map((result: EntityRecordNameResult) => ({
                ...result,
                CompositeKey: new CompositeKey(result.CompositeKey.KeyValuePairs)
            }));
        }
    }

    /**
     * Retrieves all of the data context data for the specified data context ID.
     * @param dataContextID 
     * @returns 
     */
    public async GetDataContextData(dataContextID: string) {
        try {
            const query = gql`query GetDataContextData ($DataContextID: String!) {
                GetDataContextData(DataContextID: $DataContextID) {
                    Success
                    ErrorMessages
                    Results
                }
            }`
    
            const data = await this.ExecuteGQL(query,  {DataContextID: dataContextID});
            if (data && data.GetDataContextData) {
                if (data.GetDataContextData.Success) {
                    return data.GetDataContextData.Results.map((item: any) => {
                        return JSON.parse(item);
                    });
                }
                else {
                    throw new Error(data.GetDataContextData.ErrorMessages.join(', '));
                }
            }
            else {
                throw new Error('GraphQL query failed');
            }    
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Retrieves the data context item data for the specified data context item ID.
     * @param dataContextItemID 
     * @returns 
     */
    public async GetDataContextItemData(dataContextItemID: string) {
        try {
            const query = gql`query GetDataContextItemData ($DataContextItemID: String!) {
                GetDataContextItemData(DataContextItemID: $DataContextItemID) {
                    Success
                    ErrorMessage
                    Result
                }
            }`
    
            const data = await this.ExecuteGQL(query,  {DataContextItemID: dataContextItemID});
            if (data && data.GetDataContextItemData) {
                if (data.GetDataContextItemData.Success) {
                    return JSON.parse(data.GetDataContextItemData.Result);
                }
                else {
                    throw new Error(data.GetDataContextItemData.ErrorMessage);
                }
            }
            else {
                throw new Error('GraphQL query failed');
            }    
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Static version of the ExecuteGQL method that will use the global instance of the GraphQLDataProvider and execute the specified query with the provided variables. 
     * If the token is expired, it will attempt to refresh the token and then re-execute the query. If the token is expired and the refresh fails, it will throw an error.
     * @param query 
     * @param variables 
     * @param refreshTokenIfNeeded 
     * @returns 
     */
    public static async ExecuteGQL(query: string, variables: any, refreshTokenIfNeeded: boolean = true): Promise<any> {
        return GraphQLDataProvider.Instance.ExecuteGQL(query, variables, refreshTokenIfNeeded);
    }

    /**
     * Executes the GQL query with the provided variables. If the token is expired, it will attempt to refresh the token and then re-execute the query. If the token is expired and the refresh fails, it will throw an error.
     * @param query 
     * @param variables 
     * @param refreshTokenIfNeeded 
     * @returns 
     */
    public async ExecuteGQL(query: string, variables: any, refreshTokenIfNeeded: boolean = true): Promise<any> {
        try {
            const data = await this._client.request(query, variables);
            return data;
        }
        catch (e) {
            // Enhanced error logging to diagnose 500 errors
            console.error('[GraphQL] ExecuteGQL error caught:', {
                hasResponse: !!e?.response,
                hasErrors: !!e?.response?.errors,
                errorCount: e?.response?.errors?.length,
                firstError: e?.response?.errors?.[0],
                errorCode: e?.response?.errors?.[0]?.extensions?.code,
                errorMessage: e?.response?.errors?.[0]?.message,
                fullError: e
            });

            if (e && e.response && e.response.errors?.length > 0) {//e.code === 'JWT_EXPIRED') {
                const error = e.response.errors[0];
                const code = error?.extensions?.code?.toUpperCase().trim()
                if (code === 'JWT_EXPIRED') {
                    if (refreshTokenIfNeeded) {
                        // token expired, so we need to refresh it and try again
                        await this.RefreshToken();
                        return await this.ExecuteGQL(query, variables, false/*don't attempt to refresh again*/);
                    }
                    else {
                        // token expired but the caller doesn't want a refresh, so just return the error
                        LogError(`JWT_EXPIRED and refreshTokenIfNeeded is false`);
                        throw e;
                    }
                }
                else
                    throw e;
            }
            else {
                LogError(e);
                throw e; // force the caller to handle the error
            }
        }
    }

    public async RefreshToken(): Promise<void> {
        // Check if we're in singleton mode
        const isInstanceSingleton = GraphQLDataProvider.Instance &&
                                    GraphQLDataProvider.Instance._configData === this._configData;

        // If singleton has a refresh in progress, wait for it
        if (isInstanceSingleton && GraphQLDataProvider.Instance._refreshPromise) {
            return GraphQLDataProvider.Instance._refreshPromise;
        }

        // If this instance has a refresh in progress, wait for it
        if (this._refreshPromise) {
            return this._refreshPromise;
        }

        // Start a new refresh
        console.log('[GraphQL] Starting token refresh...');
        this._refreshPromise = this.performTokenRefresh();

        // Also store on singleton if in singleton mode
        if (isInstanceSingleton) {
            GraphQLDataProvider.Instance._refreshPromise = this._refreshPromise;
        }

        try {
            await this._refreshPromise;
            console.log('[GraphQL] Token refresh completed successfully');
        } finally {
            // Clear the promise when done
            this._refreshPromise = null;
            if (isInstanceSingleton && GraphQLDataProvider.Instance) {
                GraphQLDataProvider.Instance._refreshPromise = null;
            }
        }
    }

    private async performTokenRefresh(): Promise<void> {
        if (this._configData.Data.RefreshTokenFunction) {
            const newToken = await this._configData.Data.RefreshTokenFunction();
            if (newToken) {
                this._configData.Token = newToken; // update the token
                const newClient = this.CreateNewGraphQLClient(this._configData.URL,
                                                              this._configData.Token,
                                                              this._sessionId,
                                                              this._configData.MJAPIKey,
                                                              this._configData.UserAPIKey);

                // Update this instance's client
                this._client = newClient;

                // CRITICAL: Also update the singleton's client if we're in singleton mode
                // Check if this._configData is the same reference as Instance._configData
                if (GraphQLDataProvider.Instance &&
                    GraphQLDataProvider.Instance._configData === this._configData) {
                    GraphQLDataProvider.Instance._client = newClient;
                }
            }
            else {
                throw new Error('Refresh token function returned null or undefined token');
            }
        }
        else {
            throw new Error('No refresh token function provided');
        }
    }

    public static async RefreshToken(): Promise<void> {
        return GraphQLDataProvider.Instance.RefreshToken();
    }

    protected CreateNewGraphQLClient(url: string, token: string, sessionId: string, mjAPIKey: string, userAPIKey?: string): GraphQLClient {
        // Enhanced logging to diagnose token issues
        // const tokenPreview = token ? `${token.substring(0, 20)}...${token.substring(token.length - 10)}` : 'NO TOKEN';
        // console.log('[GraphQL] Creating new client:', {
        //     url,
        //     tokenPreview,
        //     tokenLength: token?.length,
        //     sessionId,
        //     hasMJAPIKey: !!mjAPIKey,
        //     hasUserAPIKey: !!userAPIKey
        // });

        const headers: Record<string, string> = {
            'x-session-id': sessionId,
        };
        if (token)
            headers.authorization = 'Bearer ' + token;
        if (mjAPIKey)
            headers['x-mj-api-key'] = mjAPIKey;
        if (userAPIKey)
            headers['x-api-key'] = userAPIKey;

        return new GraphQLClient(url, {
            headers
        });
    }

    private _innerCurrentUserQueryString = `CurrentUser {
        ${this.userInfoString()}
        UserRoles_UserIDArray {
            ${this.userRoleInfoString()}
        }
    }
    `


    private _currentUserQuery = gql`query CurrentUserAndRoles {
        ${this._innerCurrentUserQueryString}
    }`



    private userInfoString(): string {
        return this.infoString(new UserInfo(null, null))
    }
    private userRoleInfoString(): string {
        return this.infoString(new UserRoleInfo(null))
    }
    private infoString(object: any): string {
        let sOutput: string = '';
        const keys = Object.keys(object)
        for (const k of keys) {
            if (k.startsWith('__mj_')) {
                sOutput += k.replace('__mj_', '_mj__') + '\n            '
            }
            else if (!k.startsWith('_')) {
                sOutput += k + '\n            '
            }
        }
        return sOutput
    }


    private _localStorageProvider: ILocalStorageProvider;
    get LocalStorageProvider(): ILocalStorageProvider {
        if (!this._localStorageProvider) {
            // Use BrowserIndexedDBStorageProvider in browser environments where indexedDB is available,
            // otherwise fall back to InMemoryLocalStorageProvider for Node.js/server environments
            if (typeof indexedDB !== 'undefined') {
                this._localStorageProvider = new BrowserIndexedDBStorageProvider();
            } else {
                this._localStorageProvider = new InMemoryLocalStorageProvider();
            }
        }

        return this._localStorageProvider;
    }


    /**************************************************************************/
    // END ---- IMetadataProvider
    /**************************************************************************/
    protected get Metadata(): IMetadataProvider {
        return this;
    }

    private _wsClient: Client = null;
    private _wsClientCreatedAt: number = null;
    private _pushStatusSubjects: Map<string, {
        subject: Subject<string>,
        subscription: Subscription,
        createdAt: number,
        lastRequestedAt: number,
        lastEmissionAt: number,
        activeSubscribers: number
    }> = new Map();
    // Tracks total WebSocket subscriptions (not component subscribers)
    // Used to prevent disposing client when subscriptions are active
    private _activeSubscriptionCount = 0;
    private readonly WS_CLIENT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
    private readonly SUBSCRIPTION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private readonly SUBSCRIPTION_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    private _subscriptionCleanupTimer: NodeJS.Timeout = null;
    private _isCleaningUp = false; // Prevent concurrent cleanup

    /**
     * Gets or creates a WebSocket client with health checking and automatic cleanup
     * @returns Active WebSocket client
     */
    private getOrCreateWSClient(): Client {
        const now = Date.now();

        // Check if existing client is too old and should be recreated
        if (this._wsClient && this._wsClientCreatedAt) {
            const age = now - this._wsClientCreatedAt;
            if (age > this.WS_CLIENT_MAX_AGE_MS && this._activeSubscriptionCount === 0) {
                // Client is old and no active subscriptions, recreate it
                this.disposeWSClient();
            }
        }

        // Create new client if needed
        if (!this._wsClient) {
            this._wsClient = createClient({
                url: this.ConfigData.WSURL,
                connectionParams: {
                    Authorization: 'Bearer ' + this.ConfigData.Token,
                },
                keepAlive: 30000, // Send keepalive ping every 30 seconds
                retryAttempts: 3,
                shouldRetry: () => true,
            });
            this._wsClientCreatedAt = now;

            // Start cleanup timer if not already running
            if (!this._subscriptionCleanupTimer) {
                this._subscriptionCleanupTimer = setInterval(() => {
                    this.cleanupStaleSubscriptions();
                }, this.SUBSCRIPTION_CLEANUP_INTERVAL_MS);
            }
        }

        return this._wsClient;
    }

    /**
     * Disposes of the WebSocket client
     * Does NOT complete subjects - caller should handle that separately to avoid double-cleanup
     */
    private disposeWSClient(): void {
        if (this._wsClient) {
            try {
                this._wsClient.dispose();
            } catch (e) {
                console.error('[GraphQLDataProvider] Error disposing WebSocket client:', e);
            }
            this._wsClient = null;
            this._wsClientCreatedAt = null;
        }
    }

    /**
     * Completes all subjects and clears the cache
     * Separate from disposeWSClient to avoid double-cleanup
     */
    private completeAllSubjects(): void {
        this._pushStatusSubjects.forEach((entry, sessionId) => {
            try {
                entry.subject.complete();
                entry.subscription.unsubscribe();
            } catch (e) {
                console.error(`[GraphQLDataProvider] Error cleaning up subject for ${sessionId}:`, e);
            }
        });
        this._pushStatusSubjects.clear();
    }

    /**
     * Cleans up stale subscription subjects that haven't been used recently
     * Uses cleanup flag to prevent concurrent execution
     * Uses Map snapshot to avoid concurrent modification issues
     */
    private cleanupStaleSubscriptions(): void {
        // Prevent concurrent cleanup
        if (this._isCleaningUp) {
            return;
        }
        this._isCleaningUp = true;

        try {
            const now = Date.now();
            const initialCount = this._pushStatusSubjects.size;

            // Create snapshot to avoid concurrent modification during iteration
            const entries = Array.from(this._pushStatusSubjects.entries());
            const toRemove: string[] = [];

            // Identify stale subscriptions (must have no active subscribers AND be idle)
            entries.forEach(([sessionId, value]) => {
                const timeSinceRequested = now - value.lastRequestedAt;
                const timeSinceEmission = now - value.lastEmissionAt;

                // Clean up if ALL conditions are true:
                // 1. No active subscribers (no component is listening)
                // 2. Not requested recently (no component has requested it)
                // 3. Not receiving data (no active server communication)
                const shouldCleanup = value.activeSubscribers === 0 &&
                    timeSinceRequested >= this.SUBSCRIPTION_IDLE_TIMEOUT_MS &&
                    timeSinceEmission >= this.SUBSCRIPTION_IDLE_TIMEOUT_MS;

                if (shouldCleanup) {
                    console.log(`[GraphQLDataProvider] Marking session ${sessionId} for cleanup: ` +
                        `activeSubscribers=${value.activeSubscribers}, ` +
                        `timeSinceRequested=${Math.round(timeSinceRequested/1000)}s, ` +
                        `timeSinceEmission=${Math.round(timeSinceEmission/1000)}s`);
                    toRemove.push(sessionId);
                }
            });

            // Complete subjects and unsubscribe from WebSocket
            toRemove.forEach(sessionId => {
                const entry = this._pushStatusSubjects.get(sessionId);
                if (entry) {
                    try {
                        entry.subject.complete(); // Completes for ALL subscribers
                        entry.subscription.unsubscribe(); // Closes WebSocket subscription
                        this._pushStatusSubjects.delete(sessionId);
                        console.log(`[GraphQLDataProvider] Cleaned up stale subscription for session: ${sessionId}`);
                    } catch (e) {
                        console.error(`[GraphQLDataProvider] Error cleaning up subscription for ${sessionId}:`, e);
                    }
                }
            });

            if (toRemove.length > 0) {
                console.log(`[GraphQLDataProvider] Cleaned up ${toRemove.length} stale subscription(s)`);
            }

            // If no subscriptions remain and client is old, dispose of it
            if (this._pushStatusSubjects.size === 0 && this._wsClient && this._wsClientCreatedAt) {
                const clientAge = now - this._wsClientCreatedAt;
                if (clientAge > this.WS_CLIENT_MAX_AGE_MS) {
                    console.log('[GraphQLDataProvider] Disposing of idle WebSocket client');
                    this.disposeWSClient();
                }
            }
        } finally {
            this._isCleaningUp = false;
        }
    }

    /**
     * Generic subscription method for GraphQL subscriptions
     * @param subscription The GraphQL subscription query
     * @param variables Variables to pass to the subscription
     * @returns Observable that emits subscription data
     */
    public subscribe(subscription: string, variables?: any): Observable<any> {
        return new Observable((observer) => {
            const client = this.getOrCreateWSClient();
            this._activeSubscriptionCount++;

            const unsubscribe = client.subscribe(
                { query: subscription, variables },
                {
                    next: (data) => {
                        observer.next(data.data);
                    },
                    error: async (error: unknown) => {
                        // Check if error is JWT_EXPIRED
                        const errorObj = error as { extensions?: { code?: string }, message?: string };
                        const isTokenExpired =
                            errorObj?.extensions?.code === 'JWT_EXPIRED' ||
                            errorObj?.message?.includes('token has expired') ||
                            errorObj?.message?.includes('JWT_EXPIRED');

                        if (isTokenExpired) {
                            console.log('[GraphQLDataProvider] WebSocket JWT token expired, refreshing and reconnecting...');
                            try {
                                // Refresh the token
                                await this.RefreshToken();

                                // Dispose old WebSocket client
                                this.disposeWSClient();

                                // Observer will be completed, and caller should re-subscribe
                                // which will create a new WebSocket connection with the new token
                                observer.complete();
                            } catch (refreshError) {
                                console.error('[GraphQLDataProvider] Failed to refresh token for WebSocket:', refreshError);
                                observer.error(refreshError);
                            }
                        } else {
                            observer.error(error);
                        }
                    },
                    complete: () => {
                        observer.complete();
                    },
                }
            );

            // Return cleanup function - this is ALWAYS called when subscription ends
            // whether by error, completion, or manual unsubscribe
            return () => {
                this._activeSubscriptionCount--;
                unsubscribe();
            };
        });
    }

    public PushStatusUpdates(sessionId: string = null): Observable<string> {
        if (!sessionId)
            sessionId = this.sessionId;

        const now = Date.now();

        // Check for existing subject
        const existing = this._pushStatusSubjects.get(sessionId);
        if (existing) {
            // Update last requested time
            existing.lastRequestedAt = now;
            // Wrap with defer to increment on subscribe and finalize to decrement on unsubscribe
            return new Observable<string>((observer) => {
                // Increment subscriber count when Observable is subscribed to
                existing.activeSubscribers++;

                // Subscribe to the underlying Subject
                const subscription = existing.subject.subscribe(observer);

                // Return teardown function that decrements count
                return () => {
                    const entry = this._pushStatusSubjects.get(sessionId);
                    if (entry && entry.activeSubscribers > 0) {
                        entry.activeSubscribers--;
                    }
                    subscription.unsubscribe();
                };
            });
        }

        const SUBSCRIBE_TO_STATUS = gql`subscription StatusUpdates($sessionId: String!) {
            statusUpdates(sessionId: $sessionId) {
                date
                message
                sessionId
            }
        }
        `;

        // Create new Subject for status updates (no buffering - status updates are ephemeral)
        const subject = new Subject<string>();
        const client = this.getOrCreateWSClient();

        // Subscribe to WebSocket and pipe data to Subject
        const subscription = new Subscription();
        subscription.add(
            new Observable((observer) => {
                const unsubscribe = client.subscribe(
                    { query: SUBSCRIBE_TO_STATUS, variables: { sessionId } },
                    {
                        next: (data: any) => {
                            // Update last emission time
                            const entry = this._pushStatusSubjects.get(sessionId);
                            if (entry) {
                                entry.lastEmissionAt = Date.now();
                            }
                            // Extract the message and emit to subject
                            observer.next(data.data.statusUpdates.message);
                        },
                        error: async (error: unknown) => {
                            // Check if error is JWT_EXPIRED
                            const errorObj = error as { extensions?: { code?: string }, message?: string };
                            const isTokenExpired =
                                errorObj?.extensions?.code === 'JWT_EXPIRED' ||
                                errorObj?.message?.includes('token has expired') ||
                                errorObj?.message?.includes('JWT_EXPIRED');

                            if (isTokenExpired) {
                                console.log('[GraphQLDataProvider] PushStatusUpdates JWT token expired, refreshing and reconnecting...');
                                try {
                                    // Refresh the token
                                    await this.RefreshToken();

                                    // Dispose old WebSocket client
                                    this.disposeWSClient();

                                    // Complete the subscription - components will auto-reconnect via RxJS retry logic
                                    observer.complete();
                                } catch (refreshError) {
                                    console.error('[GraphQLDataProvider] Failed to refresh token for PushStatusUpdates:', refreshError);
                                    observer.error(refreshError);
                                }
                            } else {
                                observer.error(error);
                            }
                        },
                        complete: () => {
                            observer.complete();
                        },
                    }
                );

                // Increment AFTER successful subscription setup
                this._activeSubscriptionCount++;

                return () => {
                    this._activeSubscriptionCount--;
                    unsubscribe();
                };
            }).subscribe({
                next: (message: string) => subject.next(message),
                error: (error) => {
                    // On error, complete subject and remove from cache
                    subject.error(error);
                    this._pushStatusSubjects.delete(sessionId);
                },
                complete: () => {
                    // On completion, complete subject and remove from cache
                    subject.complete();
                    this._pushStatusSubjects.delete(sessionId);
                }
            })
        );

        // Store subject with tracking data
        this._pushStatusSubjects.set(sessionId, {
            subject,
            subscription,
            createdAt: now,
            lastRequestedAt: now,
            lastEmissionAt: now,
            activeSubscribers: 0  // Will be incremented when first component subscribes
        });

        // Wrap return Observable to track subscribers
        return new Observable<string>((observer) => {
            // Increment subscriber count when Observable is subscribed to
            const entry = this._pushStatusSubjects.get(sessionId);
            if (entry) {
                entry.activeSubscribers++;
            }

            // Subscribe to the underlying Subject
            const sub = subject.subscribe(observer);

            // Return teardown function that decrements count
            return () => {
                const entry = this._pushStatusSubjects.get(sessionId);
                if (entry && entry.activeSubscribers > 0) {
                    entry.activeSubscribers--;
                }
                sub.unsubscribe();
            };
        });
    }

    /**
     * Public method to dispose of WebSocket resources
     * Call this when shutting down the provider or on logout
     */
    public disposeWebSocketResources(): void {
        // Stop cleanup timer
        if (this._subscriptionCleanupTimer) {
            clearInterval(this._subscriptionCleanupTimer);
            this._subscriptionCleanupTimer = null;
        }

        // Complete all subjects and clear cache
        this.completeAllSubjects();

        // Reset counters
        this._activeSubscriptionCount = 0;

        // Dispose WebSocket client
        this.disposeWSClient();
    }

    /**************************************************************************
     * IS-A Child Entity Discovery
     *
     * Discovers which IS-A child entity, if any, has a record with the given
     * primary key. Calls the server-side FindISAChildEntity GraphQL query
     * which executes a single UNION ALL for efficiency.
     **************************************************************************/

    /**
     * Discovers which IS-A child entity has a record matching the given PK.
     * Calls the server-side FindISAChildEntity resolver via GraphQL.
     *
     * @param entityInfo The parent entity to check children for
     * @param recordPKValue The primary key value to search for in child tables
     * @param contextUser Optional context user (unused on client, present for interface parity)
     * @returns The child entity name if found, or null if no child record exists
     */
    public async FindISAChildEntity(
        entityInfo: EntityInfo,
        recordPKValue: string,
        contextUser?: UserInfo
    ): Promise<{ ChildEntityName: string } | null> {
        if (!entityInfo.IsParentType) return null;

        const gql = `query FindISAChildEntity($EntityName: String!, $RecordID: String!) {
            FindISAChildEntity(EntityName: $EntityName, RecordID: $RecordID) {
                Success
                ChildEntityName
                ErrorMessage
            }
        }`;

        try {
            const result = await this.ExecuteGQL(gql, {
                EntityName: entityInfo.Name,
                RecordID: recordPKValue
            });

            if (result?.FindISAChildEntity?.Success && result.FindISAChildEntity.ChildEntityName) {
                return { ChildEntityName: result.FindISAChildEntity.ChildEntityName };
            }
            return null;
        }
        catch (e) {
            LogError(`FindISAChildEntity failed for ${entityInfo.Name}: ${e}`);
            return null;
        }
    }
}

