/**************************************************************************************************************
 * The graphQLDataProvider provides a data provider for the entities framework that uses GraphQL to communicate
 * with the server.
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it. 
**************************************************************************************************************/

import { BaseEntity, IEntityDataProvider, IMetadataProvider, IRunViewProvider, ProviderConfigDataBase, RunViewResult, 
         EntityInfo, EntityFieldInfo, EntityFieldTSType,
         RunViewParams, ProviderBase, ProviderType, UserInfo, UserRoleInfo, RecordChange, 
         ILocalStorageProvider, EntitySaveOptions, LogError,
         TransactionGroupBase, TransactionItem, DatasetItemFilterType, DatasetResultType, DatasetStatusResultType, EntityRecordNameInput, 
         EntityRecordNameResult, IRunReportProvider, RunReportResult, RunReportParams, RecordDependency, RecordMergeRequest, RecordMergeResult, 
         IRunQueryProvider, RunQueryResult, PotentialDuplicateRequest, PotentialDuplicateResponse, CompositeKey, EntityDeleteOptions, 
         RunQueryParams, BaseEntityResult,
         KeyValuePair} from "@memberjunction/core";
import { UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities'


import { gql, GraphQLClient } from 'graphql-request'
import { GraphQLTransactionGroup } from "./graphQLTransactionGroup";
import { openDB, DBSchema, IDBPDatabase } from '@tempfix/idb';
import { Observable } from 'rxjs';
import { Client, createClient } from 'graphql-ws';

// define the shape for a RefreshToken function that can be called by the GraphQLDataProvider whenever it receives an exception that the JWT it has already is expired
export type RefreshTokenFunction = () => Promise<string>;

export class GraphQLProviderConfigData extends ProviderConfigDataBase {
    /**
     * Token is the JWT token that is used to authenticate the user with the server
     */
    get Token(): string { return this.Data.Token }

    set Token(token: string) { this.Data.Token = token}

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
     */
    constructor(token: string,
                url: string,
                wsurl: string,
                refreshTokenFunction: RefreshTokenFunction,
                MJCoreSchemaName?: string, 
                includeSchemas?: string[], 
                excludeSchemas?: string[]) {
        super(
                {
                    Token: token,
                    URL: url,
                    WSURL: wsurl,
                    RefreshTokenFunction: refreshTokenFunction,
                }, 
                MJCoreSchemaName,
                includeSchemas,
                excludeSchemas
            );
    }
}



// The GraphQLDataProvider implements both the IEntityDataProvider and IMetadataProvider interfaces.
export class GraphQLDataProvider extends ProviderBase implements IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider, IRunQueryProvider {
    private static _client: GraphQLClient;
    private static _configData: GraphQLProviderConfigData;
    private static _sessionId: string;
    public get ConfigData(): GraphQLProviderConfigData { return GraphQLDataProvider._configData; }


    public GenerateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0,
            v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    }
    
    public async Config(configData: GraphQLProviderConfigData): Promise<boolean> {
        try {
            // FIRST, set up the GraphQL client
            if (GraphQLDataProvider._sessionId === undefined)
                GraphQLDataProvider._sessionId = this.GenerateUUID();

            GraphQLDataProvider._configData = configData;

            // now create the new client, if it isn't alreayd created
            if (!GraphQLDataProvider._client)
                GraphQLDataProvider._client = GraphQLDataProvider.CreateNewGraphQLClient(configData.URL, configData.Token, GraphQLDataProvider._sessionId);

            return super.Config(configData); // now parent class can do it's config
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    public get sessionId(): string {
        return GraphQLDataProvider._sessionId;
    }

    protected get AllowRefresh(): boolean {
        return true; // this provider doesn't have any issues with allowing refreshes at any time
    }

    protected async GetCurrentUser(): Promise<UserInfo> {
        const d = await GraphQLDataProvider.ExecuteGQL(this._currentUserQuery, null);
        if (d) {
            return new UserInfo(this, {...d.CurrentUser, UserRoles: d.CurrentUser.UserRolesArray}) // need to pass in the UserRoles as a separate property that is what is expected here
        }
    }


    /**************************************************************************/
    // START ---- IRunReportProvider
    /**************************************************************************/
    public async RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult> {
        const query = gql`
        query GetReportDataQuery ($ReportID: Int!) {
            GetReportData(ReportID: $ReportID) {
                Success
                Results
                RowCount
                ExecutionTime
                ErrorMessage
            }
        }`

        const result = await GraphQLDataProvider.ExecuteGQL(query, {ReportID: params.ReportID} );
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
        const query = gql`
        query GetQueryDataQuery ($QueryID: Int!) {
            GetQueryData(QueryID: $QueryID) {
                Success
                Results
                RowCount
                ExecutionTime
                ErrorMessage
            }
        }`

        const queryId = typeof params.QueryID === 'string' ? parseInt(params.QueryID) : params.QueryID;
        const result = await GraphQLDataProvider.ExecuteGQL(query, {QueryID: queryId} );
        if (result && result.GetQueryData)
            return {
                QueryID: params.QueryID,
                Success: result.GetQueryData.Success,
                Results: JSON.parse(result.GetQueryData.Results),
                RowCount: result.GetQueryData.RowCount,
                ExecutionTime: result.GetQueryData.ExecutionTime,
                ErrorMessage: result.GetQueryData.ErrorMessage,
            };
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
                    innerParams.ExcludeUserViewRunID = params.ExcludeUserViewRunID ? params.ExcludeUserViewRunID : -1;
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

                const viewData = await GraphQLDataProvider.ExecuteGQL(query, {input: innerParams} );
                if (viewData && viewData[qName]) {
                    // now, if we have any results in viewData that are for the CodeName, we need to convert them to the Name
                    // so that the caller gets back what they expect
                    const results = viewData[qName].Results;
                    if (results && results.length > 0) {
                        const fields = e.Fields.filter(f => f.CodeName !== f.Name);
                        if (fields.length > 0) {
                            results.forEach(r => {
                                fields.forEach(f => {
                                    if (r[f.CodeName] !== undefined) {
                                        r[f.Name] = r[f.CodeName];
                                        // delete r[f.CodeName];  // Leave the CodeName in the results, it is useful to have both
                                    }
                                })
                            })
                        }
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
        if (params.Fields) {
            for (const kv of e.PrimaryKeys) {
                if (params.Fields.find(f => f.trim().toLowerCase() === kv.Name.toLowerCase()) === undefined)
                    fieldList.push(kv.Name); // always include the primary key fields in view run time field list
            }

            // now add any other fields that were passed in
            params.Fields.forEach(f => fieldList.push(f));
        }
        else {
            // no fields were passed in. So, let's check to see if we are running an dynamic view. 
            // If so, we need to include all fields since the caller didn't specify the fields they want
            // otherwise, we include the fields that are part of the view definition.
            if (dynamicView) {
                // include all fields since no fields were passed in                
                e.Fields.forEach(f => {
                    if (!f.IsBinaryFieldType)
                        fieldList.push(f.CodeName)
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
                    if (c.hidden === false && !fieldList.find(item => item.trim().toLowerCase() === c.EntityField?.Name.trim().toLowerCase())) // don't include hidden fields and don't include the pkey field again
                        fieldList.push(c.EntityField.CodeName)
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
            const data = await GraphQLDataProvider.ExecuteGQL(query, vars);

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
        const data = await GraphQLDataProvider.ExecuteGQL(query, {params: request});

        if(data && data.GetRecordDuplicates){
            return data.GetRecordDuplicates;
        }
    }
    
    public async MergeRecords(request: RecordMergeRequest): Promise<RecordMergeResult> {
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
            const data = await GraphQLDataProvider.ExecuteGQL(mutation, {request: newRequest});

            return data?.MergeRecords; // shape of the result should exactly match the RecordDependency type
        }
        catch (e) {
            LogError(e);
            return {
                Success: false,
                OverallStatus: e && e.message ? e.message : e,
                RecordStatus: [],
                RecordMergeLogID: -1,
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
            const filteredFields = entity.Fields.filter(f => f.SQLType.trim().toLowerCase() !== 'uniqueidentifier' && (f.ReadOnly === false || (f.IsPrimaryKey && entity.IsSaved) ));
            const inner = `                ${mutationName}(input: $input) {
                ${entity.Fields.map(f => f.CodeName).join("\n                    ")}
            }`
            const outer = gql`mutation ${type}${entity.EntityInfo.ClassName} ($input: ${mutationName}Input!) {
                ${inner}
            }
            `
            for (let i = 0; i < filteredFields.length; i++) {
                const f = filteredFields[i];
                let val = f.Value;
                if (val && f.EntityFieldInfo.TSType === EntityFieldTSType.Date) 
                    val = val.getTime();
                if (val && f.EntityFieldInfo.TSType === EntityFieldTSType.Boolean && typeof val !== 'boolean')
                    val = parseInt(val) === 0 ? false : true; // convert to boolean

                if (val == null && f.EntityFieldInfo.AllowsNull == false) {
                    if (f.EntityFieldInfo.DefaultValue != null) {
                        // no value, but there is a default value, so use that, since field does NOT allow NULL
                        val = f.EntityFieldInfo.DefaultValue;
                    }
                    else {
                        // no default value, null value and field doesn't allow nulls, so set to either 0 or empty string
                        if (f.FieldType == EntityFieldTSType.Number || f.FieldType == EntityFieldTSType.Boolean)
                            val = 0;
                        else
                            val = '';
                    }
                }
                vars.input[f.CodeName] = val;
            }

            // now add an OldValues prop to the vars IF the type === 'update'
            if (type.trim().toLowerCase() === 'update') {
                const ov = [];
                entity.Fields.forEach(f => {
                    const val = f.OldValue ? (typeof f.OldValue === 'string' ? f.OldValue : f.OldValue.toString()) : null;
                    ov.push({Key: f.CodeName, Value: val }); // pass ALL old values to server, slightly inefficient but we want full record
                });
                vars.input['OldValues___'] = ov; // add the OldValues prop to the input property that is part of the vars already
            }
            
            if (entity.TransactionGroup) {
                return new Promise((resolve, reject) => {
                    const mutationInputTypes = [
                        {
                            varName: 'input', 
                            inputType: mutationName + 'Input!'
                        }
                    ];

                    entity.RaiseReadyForTransaction(); // let the entity know we're ready to be part of the transaction

                    // we are part of a transaction group, so just add our query to the list
                    // and when the transaction is committed, we will send all the queries at once
                    entity.TransactionGroup.AddTransaction(new TransactionItem(entity, inner, vars, {mutationName, 
                                                                                             mutationInputTypes: mutationInputTypes}, 
                                                                                            (results: any, success: boolean) => {
                        // we get here whenever the transaction group does gets around to committing
                        // our query. We need to update our entity with the values that were returned
                        // from the mutation if it was successful.
                        result.EndedAt = new Date();
                        if (success && results) { 
                            // got our data, send it back to the caller, which is the entity object
                            // and that object needs to update itself from this data.
                            result.Success = true;
                            resolve (results)
                        }
                        else {
                            // the transaction failed, nothing to update, but we need to call Reject so the 
                            // promise resolves with a rejection so our outer caller knows
                            result.Success = false;
                            result.Message = 'Transaction failed';
                            reject();
                        }
                    }));
                });
            }
            else {
                // not part of a transaction group, so just go for it and send across our GQL
                const d = await GraphQLDataProvider.ExecuteGQL(outer, vars)
                if (d && d[type + entity.EntityInfo.ClassName]) {
                    result.Success = true;
                    result.EndedAt = new Date();
                    return  d[type + entity.EntityInfo.ClassName];
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

            const query = gql`query Single${entity.EntityInfo.ClassName}${rel.length > 0 ? 'Full' : ''} (${pkeyOuterParamString}) {
                ${entity.EntityInfo.ClassName}(${pkeyInnerParamString}) {
                    ${entity.Fields.filter(f => !f.EntityFieldInfo.IsBinaryFieldType).map(f => f.CodeName).join("\n                    ")}
                    ${rel}
                }
            }
            `

            const d = await GraphQLDataProvider.ExecuteGQL(query, vars)
            if (d && d[entity.EntityInfo.ClassName]) {
                return  d[entity.EntityInfo.ClassName];
            }
            else
                return null;
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }

    protected getRelatedEntityString(entityInfo: EntityInfo, EntityRelationshipsToLoad: string[]): string {
        let rel = '';
        for (let i = 0; i < entityInfo.RelatedEntities.length; i++) {
            if (EntityRelationshipsToLoad.indexOf(entityInfo.RelatedEntities[i].RelatedEntity) >= 0) {
                const r = entityInfo.RelatedEntities[i];
                const re = this.Entities.find(e => e.ID === r.RelatedEntityID);
                rel += `
                ${re.CodeName} {
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
                return new Promise((resolve, reject) => {
                    // we are part of a transaction group, so just add our query to the list
                    // and when the transaction is committed, we will send all the queries at once
                    entity.TransactionGroup.AddTransaction(new TransactionItem(entity, inner, vars, {mutationName: queryName, 
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
                                resolve (true)
                            }
                            else {
                                // the transaction failed, nothing to update, but we need to call Reject so the 
                                // promise resolves with a rejection so our outer caller knows
                                result.Success = false;
                                result.Message = 'Transaction failed to commit'
                                reject();
                            }
                        }
                        else {
                            // the transaction failed, nothing to update, but we need to call Reject so the 
                            // promise resolves with a rejection so our outer caller knows
                            result.Success = false;
                            result.Message = 'Transaction failed to commit'
                            reject();
                        }
                    }));
                });
            }
            else {
                // no transaction just go for it
                const d = await GraphQLDataProvider.ExecuteGQL(query, vars)
                if (d && d[queryName]) {
                    for (let key of entity.PrimaryKey.KeyValuePairs) {
                        if (key.Value !== d[queryName][key.FieldName]) 
                            throw new Error ('Missing primary key value in server Delete response: ' + key.FieldName);
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
        const data = await GraphQLDataProvider.ExecuteGQL(query,  {DatasetName: datasetName, ItemFilters: itemFilters });
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
                DatasetID: 0,
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
        const data = await GraphQLDataProvider.ExecuteGQL(query,  {DatasetName: datasetName, ItemFilters: itemFilters});
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
                DatasetID: 0,
                DatasetName: datasetName,
                Success: false,
                Status: 'Unknown',
                LatestUpdateDate: null,
                EntityUpdateDates: null
            };
        }
    }

    public async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        return new GraphQLTransactionGroup();
    }

    public async GetRecordFavoriteStatus(userId: number, entityName: string, primaryKey: CompositeKey): Promise<boolean> {
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

        const data = await GraphQLDataProvider.ExecuteGQL(query,  {params: {
                                                                            UserID: userId, 
                                                                            EntityID: e.ID, 
                                                                            CompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(primaryKey.KeyValuePairs)}
                                                                            } 
                                                                  }
                                                         );
        if (data && data.GetRecordFavoriteStatus && data.GetRecordFavoriteStatus.Success)
            return data.GetRecordFavoriteStatus.IsFavorite;        
    }

    public async SetRecordFavoriteStatus(userId: number, entityName: string, primaryKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo): Promise<void> {
        const e = this.Entities.find(e => e.Name === entityName)
        if (!e){
            throw new Error(`Entity ${entityName} not found in metadata`);
        }

        const query = gql`mutation SetRecordFavoriteStatus($params: UserFavoriteSetParams!) {
            SetRecordFavoriteStatus(params: $params){
                Success
            }
        }` 

        const data = await GraphQLDataProvider.ExecuteGQL(query,  { params: {
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

        const data = await GraphQLDataProvider.ExecuteGQL(query, {
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
 
        const data = await GraphQLDataProvider.ExecuteGQL(query,  {info: info.map(i => { 
            return { 
                     EntityName: i.EntityName, 
                     CompositeKey: {KeyValuePairs: this.ensureKeyValuePairValueIsString(i.CompositeKey.KeyValuePairs)}
                    } 
                })});
        if (data && data.GetEntityRecordNames)
            return data.GetEntityRecordNames;
    }
 
    public static async ExecuteGQL(query: string, variables: any, refreshTokenIfNeeded: boolean = true): Promise<any> {
        try {
            const data = await GraphQLDataProvider._client.request(query, variables);
            return data;    
        }
        catch (e) {
            if (e && e.response && e.response.errors?.length > 0) {//e.code === 'JWT_EXPIRED') {
                const error = e.response.errors[0];
                const code = error?.extensions?.code?.toUpperCase().trim()
                if (code === 'JWT_EXPIRED') {
                    if (refreshTokenIfNeeded) {
                        // token expired, so we need to refresh it and try again
                        await GraphQLDataProvider.RefreshToken();
                        return await GraphQLDataProvider.ExecuteGQL(query, variables, false/*don't attempt to refresh again*/);
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

    public static async RefreshToken(): Promise<void> {
        if (GraphQLDataProvider._configData.Data.RefreshTokenFunction) {
            const newToken = await GraphQLDataProvider._configData.Data.RefreshTokenFunction();
            if (newToken) {
                GraphQLDataProvider._configData.Token = newToken; // update the token
                GraphQLDataProvider._client = this.CreateNewGraphQLClient(GraphQLDataProvider._configData.URL, 
                                                                          GraphQLDataProvider._configData.Token, 
                                                                          GraphQLDataProvider._sessionId);
            }
            else {
                throw new Error('Refresh token function returned null or undefined token');
            }
        }
        else {
            throw new Error('No refresh token function provided');
        }
    }

    protected static CreateNewGraphQLClient(url: string, token: string, sessionId: string): GraphQLClient {
        return new GraphQLClient(url, {
            headers: { 
                authorization: 'Bearer ' + token,
                'x-session-id': sessionId
            }
        });
    }

    // private _allLatestMetadataUpdatesQuery = gql`query mdUpdates {
    //     AllLatestMetadataUpdates {
    //         ID
    //         Type
    //         UpdatedAt
    //     }    
    // }
    // `

    // private _innerAllEntitiesQueryString = `AllEntities {
    //         ${this.entityInfoString()}
    //     }`

    // private _innerAllEntityFieldsQueryString = `AllEntityFields {
    //         ${this.entityFieldInfoString()}
    //     }`
    // private _innerAllEntityRelationshipsQueryString = `AllEntityRelationships {
    //         ${this.entityRelationshipInfoString()}
    //     }`
    // private _innerAllEntityPermissionsQueryString = `AllEntityPermissions {
    //         ${this.entityPermissionInfoString()}
    //     }`

    // private _innerAllApplicationsQueryString = `AllApplications {
    //     ${this.applicationInfoString()}
    //     ApplicationEntities {
    //         ${this.applicationEntityInfoString()}
    //     }
    // }
    // `
    private _innerCurrentUserQueryString = `CurrentUser {
        ${this.userInfoString()}
        UserRolesArray {
            ${this.userRoleInfoString()}
        }
    }
    `

    // private _allApplicationsQuery = gql`
    //     ${this._innerAllApplicationsQueryString}
    // `
    // private _innerAllRolesQueryString = `AllRoles {
    //     ${this.roleInfoString()}
    // }
    // `
    // private _innerAllRowLevelSecurityFiltersQueryString = `AllRowLevelSecurityFilters {
    //     ${this.rowLevelSecurityFilterInfoString()}
    // }
    // `

    // private _innerAllAuditLogTypesQueryString = `AllAuditLogTypes {
    //     ${this.auditLogTypeInfoString()}
    // }
    // `

    // private _innerAllAuthorizationsQueryString = `AllAuthorizations {
    //     ${this.authorizationInfoString()}
    // }
    // `

    // private _innerAllQueriesQueryString = `AllQueries {
    //     ${this.queryInfoString()}
    // }
    // `

    // private _innerAllQueryCategoriesQueryString = `AllQueryCategories {
    //     ${this.queryCategoryInfoString()}
    // }
    // `

    // private _allMetaDataQuery = gql`query AllApplicationsAndEntities {
    //     ${this._innerAllApplicationsQueryString}
    //     ${this._innerAllEntitiesQueryString}    
    //     ${this._innerAllEntityFieldsQueryString}    
    //     ${this._innerAllEntityPermissionsQueryString}    
    //     ${this._innerAllEntityRelationshipsQueryString}    
    //     ${this._innerCurrentUserQueryString}    
    //     ${this._innerAllRolesQueryString}    
    //     ${this._innerAllRowLevelSecurityFiltersQueryString}
    //     ${this._innerAllAuditLogTypesQueryString}
    //     ${this._innerAllAuthorizationsQueryString}
    //     ${this._innerAllQueriesQueryString}
    //     ${this._innerAllQueryCategoriesQueryString}
    // }`

    private _currentUserQuery = gql`query CurrentUserAndRoles {
        ${this._innerCurrentUserQueryString}    
    }`



    // private roleInfoString(): string {
    //     return this.infoString(new RoleInfo(null))
    // }
    private userInfoString(): string {
        return this.infoString(new UserInfo(null, null))
    }
    private userRoleInfoString(): string {
        return this.infoString(new UserRoleInfo(null))
    }
    // private rowLevelSecurityFilterInfoString(): string {
    //     return this.infoString(new RowLevelSecurityFilterInfo(null))
    // }
    // private auditLogTypeInfoString(): string {
    //     return this.infoString(new AuditLogTypeInfo(null))
    // }
    // private authorizationInfoString(): string {
    //     return this.infoString(new AuthorizationInfo(null))
    // }
    // private queryInfoString(): string {
    //     return this.infoString(new QueryInfo(null))
    // }
    // private queryCategoryInfoString(): string {
    //     return this.infoString(new QueryCategoryInfo(null))
    // }
    // private applicationInfoString(): string {
    //     return this.infoString(new ApplicationInfo(null, null))
    // }
    // private applicationEntityInfoString(): string {
    //     return this.infoString(new ApplicationEntityInfo(null))
    // }
    // private entityInfoString(): string {
    //     return this.infoString(new EntityInfo(null))
    // }
    // private entityFieldInfoString(): string {
    //     return this.infoString(new EntityFieldInfo(null))
    // }
    // private entityRelationshipInfoString(): string {
    //     return this.infoString(new EntityRelationshipInfo(null))
    // }
    // private entityPermissionInfoString(): string {
    //     return this.infoString(new EntityPermissionInfo(null))
    // }
    private infoString(object: any): string {
        let sOutput: string = '';
        const keys = Object.keys(object)
        for (let i = 0; i < keys.length; i++) {
            if (keys[i].substring(0,1) !=   '_')
                sOutput += keys[i] + '\n            '
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

    public async getItem(key: string): Promise<string | null> {
        return new Promise((resolve) => {
            if (this._localStorage.hasOwnProperty(key)) 
                resolve(this._localStorage[key]);
            else 
                resolve(null);
        });
    }

    public async setItem(key: string, value: string): Promise<void> {
        return new Promise((resolve) => {
            this._localStorage[key] = value;
            resolve();
        });
    }

    public async remove(key: string): Promise<void> {
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
            return await super.getItem(key)
    }

    public async setItem(key: string, value: string): Promise<void> {
        if (localStorage)
            localStorage.setItem(key, value);
        else
            await super.setItem(key, value)
    }

    public async remove(key: string): Promise<void> {
        if (localStorage)
            localStorage.removeItem(key);
        else 
            await super.remove(key)
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

 