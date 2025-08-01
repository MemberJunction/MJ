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
         TransactionGroupBase, TransactionItem, TransactionResult, DatasetItemFilterType, DatasetResultType, DatasetStatusResultType, EntityRecordNameInput,
         EntityRecordNameResult, IRunReportProvider, RunReportResult, RunReportParams, RecordDependency, RecordMergeRequest, RecordMergeResult,
         IRunQueryProvider, RunQueryResult, PotentialDuplicateRequest, PotentialDuplicateResponse, CompositeKey, EntityDeleteOptions,
         RunQueryParams, BaseEntityResult,
         KeyValuePair } from "@memberjunction/core";
import { UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities'

import { gql, GraphQLClient } from 'graphql-request'
import { openDB, DBSchema, IDBPDatabase } from '@tempfix/idb';
import { Observable } from 'rxjs';
import { Client, createClient } from 'graphql-ws';
import { FieldMapper } from './FieldMapper';
import { v4 as uuidv4 } from 'uuid';
import { GraphQLTransactionGroup } from "./graphQLTransactionGroup";

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
     */
    constructor(token: string,
                url: string,
                wsurl: string,
                refreshTokenFunction: RefreshTokenFunction,
                MJCoreSchemaName?: string,
                includeSchemas?: string[],
                excludeSchemas?: string[],
                mjAPIKey?: string) {
        super(
                {
                    Token: token,
                    URL: url,
                    WSURL: wsurl,
                    MJAPIKey: mjAPIKey,
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
export class GraphQLDataProvider extends ProviderBase implements IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider, IRunQueryProvider {
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

    public get ConfigData(): GraphQLProviderConfigData { 
        return this._configData; 
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
    public async Config(configData: GraphQLProviderConfigData, separateConnection?: boolean, forceRefreshSessionId?: boolean): Promise<boolean> {
        try {
            if (separateConnection) {
                this._configData = configData;
                // Get UUID after setting the configData, so that it can be used to get any stored session ID
                this._sessionId = await this.GetPreferredUUID(forceRefreshSessionId);;

                this._client = this.CreateNewGraphQLClient(configData.URL, configData.Token, this._sessionId, configData.MJAPIKey);
                // Store the session ID for this connection
                await this.SaveStoredSessionID(this._sessionId);
            }
            else {
                GraphQLDataProvider.Instance._configData = configData;

                if (GraphQLDataProvider.Instance._sessionId === undefined) {
                    GraphQLDataProvider.Instance._sessionId = await this.GetPreferredUUID(forceRefreshSessionId);;
                }
    
                // now create the new client, if it isn't already created
                if (!GraphQLDataProvider.Instance._client)
                    GraphQLDataProvider.Instance._client = this.CreateNewGraphQLClient(configData.URL, configData.Token, GraphQLDataProvider.Instance._sessionId, configData.MJAPIKey);    
                
                // Store the session ID for the global instance
                await GraphQLDataProvider.Instance.SaveStoredSessionID(GraphQLDataProvider.Instance._sessionId);
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
    public async RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
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

    /**************************************************************************/
    // END ---- IRunReportProvider
    /**************************************************************************/



    /**************************************************************************/
    // START ---- IRunViewProvider
    /**************************************************************************/
    public async RunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
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

                if (params.ViewID) {
                    qName = `Run${e.ClassName}ViewByID`;
                    paramType = 'RunViewByIDInput';
                    innerParams.ViewID = params.ViewID;
                }
                else if (params.ViewName) {
                    qName = `Run${e.ClassName}ViewByName`;
                    paramType = 'RunViewByNameInput';
                    innerParams.ViewName = params.ViewName;
                }
                else {
                    dynamicView = true;
                    qName = `Run${e.ClassName}DynamicView`;
                    paramType = 'RunDynamicViewInput';
                    innerParams.EntityName = params.EntityName;
                }
                innerParams.ExtraFilter = params.ExtraFilter ? params.ExtraFilter : '';
                innerParams.OrderBy = params.OrderBy ? params.OrderBy : '';
                innerParams.UserSearchString = params.UserSearchString ? params.UserSearchString : '';
                innerParams.Fields = params.Fields; // pass it straight through, either null or array of strings
                innerParams.IgnoreMaxRows = params.IgnoreMaxRows ? params.IgnoreMaxRows : false;
                innerParams.MaxRows = params.MaxRows ? params.MaxRows : 0;
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

                const fieldList = this.getViewRunTimeFieldList(e, viewEntity, params, dynamicView);
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
                        ErrorMessage
                    }
                }`

                const viewData = await this.ExecuteGQL(query, {input: innerParams} );
                if (viewData && viewData[qName]) {
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
                    return viewData[qName];
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

    public async RunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
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

                    if (param.ViewID) {
                        qName = `Run${e.ClassName}ViewByID`;
                        paramType = 'RunViewByIDInput';
                        innerParam.ViewID = param.ViewID;
                    }
                    else if (param.ViewName) {
                        qName = `Run${e.ClassName}ViewByName`;
                        paramType = 'RunViewByNameInput';
                        innerParam.ViewName = param.ViewName;
                    }
                    else {
                        dynamicView = true;
                        qName = `Run${e.ClassName}DynamicView`;
                        paramType = 'RunDynamicViewInput';
                        innerParam.EntityName = param.EntityName;
                    }

                    innerParam.ExtraFilter = param.ExtraFilter || '';
                    innerParam.OrderBy = param.OrderBy || '';
                    innerParam.UserSearchString = param.UserSearchString || '';
                    // pass it straight through, either null or array of strings
                    innerParam.Fields = param.Fields;
                    innerParam.IgnoreMaxRows = param.IgnoreMaxRows || false;
                    innerParam.MaxRows = param.MaxRows || 0;
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

                    innerParams.push(innerParam);
                    fieldList.push(...this.getViewRunTimeFieldList(e, viewEntity, param, dynamicView));
            }

            const query = gql`
                query RunViewsQuery ($input: [RunViewGenericInput!]!) {
                RunViews(input: $input) {
                    Results {
                        ID
                        EntityID
                        Data
                    }
                    UserViewRunID
                    RowCount
                    TotalRowCount
                    ExecutionTime
                    Success
                    ErrorMessage
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

            const mutationName = `${type}${entity.EntityInfo.ClassName}`

            // only pass along writable fields, AND the PKEY value if this is an update
            const filteredFields = entity.Fields.filter(f => !f.ReadOnly || (f.IsPrimaryKey && entity.IsSaved));
            const mapper = new FieldMapper();
            const inner = `                ${mutationName}(input: $input) {
                ${entity.Fields.map(f => mapper.MapFieldName(f.CodeName)).join("\n                    ")}
            }`
            const outer = gql`mutation ${type}${entity.EntityInfo.ClassName} ($input: ${mutationName}Input!) {
                ${inner}
            }
            `
            for (let i = 0; i < filteredFields.length; i++) {
                const f = filteredFields[i];
                let val = f.Value;
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
                if (d && d[type + entity.EntityInfo.ClassName]) {
                    result.Success = true;
                    result.EndedAt = new Date();
                    result.NewValues = this.ConvertBackToMJFields(d[type + entity.EntityInfo.ClassName]);
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

            const mapper = new FieldMapper();
            const query = gql`query Single${entity.EntityInfo.ClassName}${rel.length > 0 ? 'Full' : ''} (${pkeyOuterParamString}) {
                ${entity.EntityInfo.ClassName}(${pkeyInnerParamString}) {
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
            if (d && d[entity.EntityInfo.ClassName]) {
                // the resulting object has all the values in it, but we need to convert any elements that start with _mj__ back to __mj_
                return this.ConvertBackToMJFields(d[entity.EntityInfo.ClassName]);
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

            const queryName: string = 'Delete' + entity.EntityInfo.ClassName;
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

    public async GetEntityRecordName(entityName: string, primaryKey: CompositeKey): Promise<string> {
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

    public async GetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
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
        if (data && data.GetEntityRecordNames)
            return data.GetEntityRecordNames;
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
        if (this._configData.Data.RefreshTokenFunction) {
            const newToken = await this._configData.Data.RefreshTokenFunction();
            if (newToken) {
                this._configData.Token = newToken; // update the token
                this._client = this.CreateNewGraphQLClient(this._configData.URL,
                                                           this._configData.Token,
                                                           this._sessionId,
                                                           this._configData.MJAPIKey);  
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

    protected CreateNewGraphQLClient(url: string, token: string, sessionId: string, mjAPIKey: string): GraphQLClient {
        const headers: Record<string, string> = { 
            'x-session-id': sessionId,
        };
        if (token)
            headers.authorization = 'Bearer ' + token;
        if (mjAPIKey)
            headers['x-mj-api-key'] = mjAPIKey;

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
        if (!this._localStorageProvider)
            this._localStorageProvider = new BrowserIndexedDBStorageProvider();

        return this._localStorageProvider;
    }


    /**************************************************************************/
    // END ---- IMetadataProvider
    /**************************************************************************/
    protected get Metadata(): IMetadataProvider {
        return this;
    }

    private _wsClient: Client = null;
    private _pushStatusRequests: {sessionId: string, observable: Observable<string>}[] = [];
    
    /**
     * Generic subscription method for GraphQL subscriptions
     * @param subscription The GraphQL subscription query
     * @param variables Variables to pass to the subscription
     * @returns Observable that emits subscription data
     */
    public subscribe(subscription: string, variables?: any): Observable<any> {
        // Ensure websocket client is initialized
        if (!this._wsClient) {
            this._wsClient = createClient({
                url: this.ConfigData.WSURL,
                connectionParams: {
                    Authorization: 'Bearer ' + this.ConfigData.Token,
                },
            });
        }

        return new Observable((observer) => {
            const unsubscribe = this._wsClient.subscribe(
                { query: subscription, variables },
                {
                    next: (data) => {
                        observer.next(data.data);
                    },
                    error: (error) => {
                        observer.error(error);
                    },
                    complete: () => {
                        observer.complete();
                    },
                }
            );

            // Return cleanup function
            return () => {
                unsubscribe();
            };
        });
    }
    
    public PushStatusUpdates(sessionId: string = null): Observable<string> {
        if (!sessionId)
            sessionId = this.sessionId;

        if (!this._wsClient)
            this._wsClient = createClient({
                url: this.ConfigData.WSURL,
                connectionParams: {
                    Authorization: 'Bearer ' + this.ConfigData.Token,
                },
            });

        const existingRequest = this._pushStatusRequests.find(r => r.sessionId === sessionId);
        if (existingRequest)
            return existingRequest.observable;

        const SUBSCRIBE_TO_STATUS = gql`subscription StatusUpdates($sessionId: String!) {
            statusUpdates(sessionId: $sessionId) {
                date
                message
                sessionId
            }
        }
        `;

        const newObservable = new Observable<string>((observer) => {
            const unsubscribe = this._wsClient.subscribe(
              { query: SUBSCRIBE_TO_STATUS, variables: { sessionId } },
              {
                next: (data) => {
                    return observer.next(<string>data.data.statusUpdates)
                },
                error: (error) => {
                    return observer.error(error)
                },
                complete: () => {
                    return observer.complete()
                },
              }
            );

            return () => {
              // Cleanup logic
              console.log('would unsub here')
              //unsubscribe();
            };
        });
        this._pushStatusRequests.push({sessionId, observable: newObservable});
        return newObservable;
    }
}


// this class implements a simple in-memory only storage as a fallback if the browser doesn't support local storage
class BrowserStorageProviderBase implements ILocalStorageProvider {
    private _localStorage: { [key: string]: string } = {};

    public async GetItem(key: string): Promise<string | null> {
        return new Promise((resolve) => {
            if (this._localStorage.hasOwnProperty(key))
                resolve(this._localStorage[key]);
            else
                resolve(null);
        });
    }

    public async SetItem(key: string, value: string): Promise<void> {
        return new Promise((resolve) => {
            this._localStorage[key] = value;
            resolve();
        });
    }

    public async Remove(key: string): Promise<void> {
        return new Promise((resolve) => {
            if (this._localStorage.hasOwnProperty(key)) {
                delete this._localStorage[key];
            }
            resolve();
        });
    }
}


// This implementation just wraps the browser local storage and if for some reason the browser doesn't
// have a localStorage object, we just use a simple object to store the data in memory.
class BrowserLocalStorageProvider extends BrowserStorageProviderBase  {
    public async getItem(key: string): Promise<string | null> {
        if (localStorage)
            return localStorage.getItem(key);
        else
            return await super.GetItem(key)
    }

    public async setItem(key: string, value: string): Promise<void> {
        if (localStorage)
            localStorage.setItem(key, value);
        else
            await super.SetItem(key, value)
    }

    public async remove(key: string): Promise<void> {
        if (localStorage)
            localStorage.removeItem(key);
        else
            await super.Remove(key)
    }
}



const IDB_DB_NAME = 'MJ_Metadata';
const IDB_DB_ObjectStoreName = 'Metadata_KVPairs';

interface MJ_MetadataDB extends DBSchema {
    'Metadata_KVPairs': {
        key: string;
        value: any;
    };
}

class BrowserIndexedDBStorageProvider extends BrowserStorageProviderBase {
    private dbPromise: Promise<IDBPDatabase<MJ_MetadataDB>>;

    constructor() {
        super();

        this.dbPromise = openDB<MJ_MetadataDB>(IDB_DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(IDB_DB_ObjectStoreName)) {
                    db.createObjectStore(IDB_DB_ObjectStoreName);
                }
            },
        });
    }

    async setItem(key: string, value: any): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction(IDB_DB_ObjectStoreName, 'readwrite');
        await tx.objectStore(IDB_DB_ObjectStoreName).put(value, key);
        await tx.done;
    }

    async getItem(key: string): Promise<any> {
        const db = await this.dbPromise;
        const value = await db.transaction(IDB_DB_ObjectStoreName).objectStore(IDB_DB_ObjectStoreName).get(key);
        return value;
    }

    async remove(key: string): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction(IDB_DB_ObjectStoreName, 'readwrite');
        await tx.objectStore(IDB_DB_ObjectStoreName).delete(key);
        await tx.done;
    }
}
