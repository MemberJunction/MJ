/**************************************************************************************************************
 * The graphQLDataProvider provides a data provider for the entities framework that uses GraphQL to communicate
 * with the server.
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it. 
**************************************************************************************************************/

import { BaseEntity, IEntityDataProvider, IMetadataProvider, IRunViewProvider, ProviderConfigDataBase, RunViewResult, 
         EntityInfo, EntityFieldInfo, EntityRelationshipInfo, EntityPermissionInfo, EntityFieldTSType,
         ApplicationInfo, ApplicationEntityInfo, RunViewParams, ProviderBase, ProviderType, RoleInfo, UserInfo, UserRoleInfo, RecordChange, 
         ILocalStorageProvider, RowLevelSecurityFilterInfo, AuditLogTypeInfo, AuthorizationInfo, EntitySaveOptions, LogError,
         TransactionGroupBase, TransactionItem, DatasetItemFilterType, DatasetResultType, DatasetStatusResultType, EntityRecordNameInput, 
         EntityRecordNameResult, IRunReportProvider, RunReportResult, RunReportParams, RecordDependency, RecordMergeRequest, RecordMergeResult, PrimaryKeyValue  } from "@memberjunction/core";
import { UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities'


import { gql, GraphQLClient } from 'graphql-request'
import { GraphQLTransactionGroup } from "./graphQLTransactionGroup";
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Observable } from 'rxjs';
import { Client, createClient } from 'graphql-ws';


export class GraphQLProviderConfigData extends ProviderConfigDataBase {
    get Token(): string { return this.Data.Token }
    get URL(): string { return this.Data.URL }
    get WSURL(): string { return this.Data.WSURL }

    /**
     * wsurl is the URL to the GraphQL websocket endpoint. This is used for subscriptions, if you are not using subscriptions, pass in a blank string for this
     */
    constructor(token: string,
                url: string,
                wsurl: string,
                MJCoreSchemaName?: string, 
                includeSchemas?: string[], 
                excludeSchemas?: string[]) {
        super(
                {
                    Token: token,
                    URL: url,
                    WSURL: wsurl,
                }, 
                MJCoreSchemaName,
                includeSchemas,
                excludeSchemas
            );
    }
}



// The GraphQLDataProvider implements both the IEntityDataProvider and IMetadataProvider interfaces.
export class GraphQLDataProvider extends ProviderBase implements IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider {
    private _url: string;
    private _token: string;
    private static _client: GraphQLClient;
    private _sessionId: string;
    public get ConfigData(): GraphQLProviderConfigData { return <GraphQLProviderConfigData>super.ConfigData; }


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
            this._sessionId = this.GenerateUUID();
            this._url = configData.URL;
            this._token = configData.Token;

            // now create the new client, if it isn't alreayd created
            if (!GraphQLDataProvider._client)
                GraphQLDataProvider._client = new GraphQLClient(configData.URL, {
                    headers: { 
                        authorization: 'Bearer ' + configData.Token,
                        'x-session-id': this._sessionId 
                    }
                });

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

    protected AllowRefresh(): boolean {
        return true; // this provider doesn't have any issues with allowing refreshes at any time
    }

npm 
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
    // START ---- IRunViewProvider
    /**************************************************************************/
    public async RunView(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> {
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
                innerParams.ForceAuditLog = params.ForceAuditLog ? params.ForceAuditLog : false;
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
        const pkeyName = e.PrimaryKey.CodeName;
        if (params.Fields) {
            if (params.Fields.find(f => f.trim().toLowerCase() === pkeyName.toLowerCase()) === undefined)
                fieldList.push(pkeyName); // always include the primary key in view run time field list

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
                fieldList.push(pkeyName); // always include the primary key field in the result data, don't need to display the data, but we need to always provide record pkey to the caller
                
                // Now: include the fields that are part of the view definition
                v.Columns.forEach(c => {
                    if (c.hidden === false && c.EntityField?.Name.trim().toLowerCase() !== pkeyName.toLowerCase()) // don't include hidden fields and don't include the pkey field again
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

    public async GetRecordChanges(entityName: string, primaryKeyValue: any): Promise<RecordChange[]> {
        try {
            const p: RunViewParams = {
                EntityName: 'Record Changes',
                ExtraFilter: `RecordID = '${primaryKeyValue}' AND Entity = '${entityName}'`,
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
     * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param recordId the recordId to check
     */
    public async GetRecordDependencies(entityName: string, primaryKeyValue: any): Promise<RecordDependency[]> { 
        try {
            // execute the gql query to get the dependencies
            const query = gql`query GetRecordDependenciesQuery ($entityName: String!, $recordId: Int!) {
                GetRecordDependencies(entityName: $entityName, recordId: $recordId) {
                    EntityName
                    RelatedEntityName
                    FieldName
                    RecordID 
                }
            }`

            // now we have our query built, execute it
            const pkeyName = this.Entities.find(e => e.Name === entityName).PrimaryKey.Name;
            const vars = {
                entityName: entityName
            };
            vars[pkeyName] = primaryKeyValue
            const data = await GraphQLDataProvider.ExecuteGQL(query, vars);

            return data?.GetRecordDependencies; // shape of the result should exactly match the RecordDependency type
        }
        catch (e) {
            LogError(e);
            throw (e)
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
                        RecordID
                        Success
                        RecordMergeDeletionLogID
                        Message
                    }
                }
            }`

            // now we have our query built, execute it
            const data = await GraphQLDataProvider.ExecuteGQL(mutation, {request: request});

            return data?.MergeRecords; // shape of the result should exactly match the RecordDependency type
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    public async Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions) : Promise<{}> {
        try {
            const pKeyValue: any = entity.PrimaryKey.Value;
            const vars = { input: {} };
            const type: string = (pKeyValue) ? "Update" : "Create";

            // Create the query for the mutation first, we will provide the specific
            // input values later in the loop below. Here we are just setting up the mutation
            // and the fields that will be returned since the mutation returns back the latest
            // values for the entity and we need to have those values to update the entity after the
            // save

            const mutationName = `${type}${entity.EntityInfo.ClassName}`

            // only pass along writable fields, AND the PKEY value if this is an update
            const filteredFields = entity.Fields.filter(f => f.SQLType.trim().toLowerCase() !== 'uniqueidentifier' && (f.ReadOnly === false || (f.IsPrimaryKey && pKeyValue) ));

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
            
            if (entity.TransactionGroup) {
                return new Promise((resolve, reject) => {
                    const mutationInputTypes = [{varName: 'input', inputType: mutationName + 'Input!'}]
                    // we are part of a transaction group, so just add our query to the list
                    // and when the transaction is committed, we will send all the queries at once
                    entity.TransactionGroup.AddTransaction(new TransactionItem(inner, vars, {mutationName, 
                                                                                             mutationInputTypes: mutationInputTypes}, 
                                                                                            (results: any, success: boolean) => {
                        // we get here whenever the transaction group does gets around to committing
                        // our query. We need to update our entity with the values that were returned
                        // from the mutation if it was successful.
                        if (success && results) { 
                            // got our data, send it back to the caller, which is the entity object
                            // and that object needs to update itself from this data.
                            resolve (results)
                        }
                        else {
                            // the transaction failed, nothing to update, but we need to call Reject so the 
                            // promise resolves with a rejection so our outer caller knows
                            reject();
                        }
                    }));
                });
            }
            else {
                // not part of a transaction group, so just go for it and send across our GQL
                const d = await GraphQLDataProvider.ExecuteGQL(outer, vars)
                if (d && d[type + entity.EntityInfo.ClassName]) {
                    return  d[type + entity.EntityInfo.ClassName];
                }
                else
                    return null;
            }
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }
    public async Load(entity: BaseEntity, PrimaryKeyValues: PrimaryKeyValue[], EntityRelationshipsToLoad: string[] = null, user: UserInfo) : Promise<{}> {
        try {
            const vars = {};
            let pkeyInnerParamString: string = '';
            let pkeyOuterParamString: string = '';

            for (let i = 0; i < PrimaryKeyValues.length; i++) {
                const field: EntityFieldInfo = entity.Fields.find(f => f.Name.trim().toLowerCase() === PrimaryKeyValues[i].FieldName.trim().toLowerCase()).EntityFieldInfo;
                const val = PrimaryKeyValues[i].Value;
                const pkeyGraphQLType: string = entity.PrimaryKey.EntityFieldInfo.GraphQLType;

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
                    if (isNaN(PrimaryKeyValues[i].Value))
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

    public async Delete(entity: BaseEntity, user: UserInfo) : Promise<boolean> {
        try {
            const vars = {};
            const mutationInputTypes = [];
            let pkeyInnerParamString: string = '';
            let pkeyOuterParamString: string = '';
            let returnValues: string = '';
            for (let pk of entity.PrimaryKeys) {
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

            const queryName: string = 'Delete' + entity.EntityInfo.ClassName;
            const query = gql`mutation ${queryName} (${pkeyOuterParamString}) {
                ${queryName}(${pkeyInnerParamString}) {
                    ${returnValues}
                }
            }
            `

            if (entity.TransactionGroup) {
                // we have a transaction group, need to play nice and be part of it
                return new Promise((resolve, reject) => {

                    // we are part of a transaction group, so just add our query to the list
                    // and when the transaction is committed, we will send all the queries at once
                    entity.TransactionGroup.AddTransaction(new TransactionItem(query, vars, {mutationName: queryName, 
                                                                                             mutationInputTypes: mutationInputTypes}, 
                                                                                            (results: any, success: boolean) => {
                        // we get here whenever the transaction group does gets around to committing
                        // our query.  
                        if (success && results) { 
                            // success indicated by the entity.PrimaryKey.Value matching the return value of the mutation
                            resolve (entity.PrimaryKey.Value === results)
                        }
                        else {
                            // the transaction failed, nothing to update, but we need to call Reject so the 
                            // promise resolves with a rejection so our outer caller knows
                            reject();
                        }
                    }));
                });
            }
            else {
                // no transaction just go for it
                const d = await GraphQLDataProvider.ExecuteGQL(query, vars)
                if (d && d[queryName]) {
                    for (let key of entity.PrimaryKeys) {
                        if (key.Value !== d[queryName][key.Name]) 
                            return false;
                    }
                    return true; // all of the return values match the primary key values, so we are good and delete worked
                }
                else
                    return false;    
            }
        }
        catch (e) {
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

    public async GetRecordFavoriteStatus(userId: number, entityName: string, primaryKeyValue: any): Promise<boolean> {
        const e = this.Entities.find(e => e.Name === entityName)
        if (!e)
            throw new Error(`Entity ${entityName} not found in metadata`);

        const query = gql`query GetRecordFavoriteStatus($params: UserFavoriteSearchParams!) {
            GetRecordFavoriteStatus(params: $params) {
                Success
                IsFavorite
            }
        }` 
        const data = await GraphQLDataProvider.ExecuteGQL(query,  {params: {UserID: userId, EntityID: e.ID, PrimaryKeyValue: primaryKeyValue.toString()} });
        if (data && data.GetRecordFavoriteStatus && data.GetRecordFavoriteStatus.Success)
            return data.GetRecordFavoriteStatus.IsFavorite;        
    }

    public async SetRecordFavoriteStatus(userId: number, entityName: string, primaryKeyValue: any, isFavorite: boolean, contextUser: UserInfo): Promise<void> {
        const e = this.Entities.find(e => e.Name === entityName)
        if (!e)
            throw new Error(`Entity ${entityName} not found in metadata`);

        const query = gql`mutation SetRecordFavoriteStatus($params: UserFavoriteSetParams!) {
            SetRecordFavoriteStatus(params: $params){
                Success
            }
        }` 
        const data = await GraphQLDataProvider.ExecuteGQL(query,  {params: {UserID: userId, EntityID: e.ID, PrimaryKeyValue: primaryKeyValue.toString(), IsFavorite: isFavorite} });
        if (data && data.SetRecordFavoriteStatus !== null)
            return data.SetRecordFavoriteStatus.Success;        
    }

    public async GetEntityRecordName(entityName: string, primaryKeyValue: any): Promise<string> {
        if (!entityName || !primaryKeyValue)
            return null;

        const query = gql`query GetEntityRecordNameQuery ($EntityName: String!, $RecordID: String!) {
            GetEntityRecordName(EntityName: $EntityName, RecordID: $RecordID) {
                Success
                Status
                RecordName
            }
        }` 
        const data = await GraphQLDataProvider.ExecuteGQL(query,  {EntityName: entityName, RecordID: primaryKeyValue.toString()});
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
                RecordID
                EntityName
                RecordName
            }
        }` 
        const data = await GraphQLDataProvider.ExecuteGQL(query,  {info: info.map(i => {return {EntityName: i.EntityName, RecordID: i.PrimaryKeyValue.toString()}})});
        if (data && data.GetEntityRecordNames)
            return data.GetEntityRecordNames;
    }
 
    public static async ExecuteGQL(query: string, variables: any): Promise<any> {
        try {
            const data = await this._client.request(query, variables);
            return data;    
        }
        catch (e) {
            LogError(e);
            throw e; // force the caller to handle the error
        }
    }

    private _allLatestMetadataUpdatesQuery = gql`query mdUpdates {
        AllLatestMetadataUpdates {
            ID
            Type
            UpdatedAt
        }    
    }
    `

    private _innerAllEntitiesQueryString = `AllEntities {
            ${this.entityInfoString()}
        }`

    private _innerAllEntityFieldsQueryString = `AllEntityFields {
            ${this.entityFieldInfoString()}
        }`
    private _innerAllEntityRelationshipsQueryString = `AllEntityRelationships {
            ${this.entityRelationshipInfoString()}
        }`
    private _innerAllEntityPermissionsQueryString = `AllEntityPermissions {
            ${this.entityPermissionInfoString()}
        }`

    private _innerAllApplicationsQueryString = `AllApplications {
        ${this.applicationInfoString()}
        ApplicationEntities {
            ${this.applicationEntityInfoString()}
        }
    }
    `
    private _innerCurrentUserQueryString = `CurrentUser {
        ${this.userInfoString()}
        UserRolesArray {
            ${this.userRoleInfoString()}
        }
    }
    `

    private _allApplicationsQuery = gql`
        ${this._innerAllApplicationsQueryString}
    `
    private _innerAllRolesQueryString = `AllRoles {
        ${this.roleInfoString()}
    }
    `
    private _innerAllRowLevelSecurityFiltersQueryString = `AllRowLevelSecurityFilters {
        ${this.rowLevelSecurityFilterInfoString()}
    }
    `

    private _innerAllAuditLogTypesQueryString = `AllAuditLogTypes {
        ${this.auditLogTypeInfoString()}
    }
    `

    private _innerAllAuthorizationsQueryString = `AllAuthorizations {
        ${this.authorizationInfoString()}
    }
    `

    private _allMetaDataQuery = gql`query AllApplicationsAndEntities {
        ${this._innerAllApplicationsQueryString}
        ${this._innerAllEntitiesQueryString}    
        ${this._innerAllEntityFieldsQueryString}    
        ${this._innerAllEntityPermissionsQueryString}    
        ${this._innerAllEntityRelationshipsQueryString}    
        ${this._innerCurrentUserQueryString}    
        ${this._innerAllRolesQueryString}    
        ${this._innerAllRowLevelSecurityFiltersQueryString}
        ${this._innerAllAuditLogTypesQueryString}
        ${this._innerAllAuthorizationsQueryString}
    }`

    private _currentUserQuery = gql`query CurrentUserAndRoles {
        ${this._innerCurrentUserQueryString}    
    }`



    private roleInfoString(): string {
        return this.infoString(new RoleInfo(null))
    }
    private userInfoString(): string {
        return this.infoString(new UserInfo(null, null))
    }
    private userRoleInfoString(): string {
        return this.infoString(new UserRoleInfo(null))
    }
    private rowLevelSecurityFilterInfoString(): string {
        return this.infoString(new RowLevelSecurityFilterInfo(null))
    }
    private auditLogTypeInfoString(): string {
        return this.infoString(new AuditLogTypeInfo(null))
    }
    private authorizationInfoString(): string {
        return this.infoString(new AuthorizationInfo(null))
    }
    private applicationInfoString(): string {
        return this.infoString(new ApplicationInfo(null, null))
    }
    private applicationEntityInfoString(): string {
        return this.infoString(new ApplicationEntityInfo(null))
    }
    private entityInfoString(): string {
        return this.infoString(new EntityInfo(null))
    }
    private entityFieldInfoString(): string {
        return this.infoString(new EntityFieldInfo(null))
    }
    private entityRelationshipInfoString(): string {
        return this.infoString(new EntityRelationshipInfo(null))
    }
    private entityPermissionInfoString(): string {
        return this.infoString(new EntityPermissionInfo(null))
    }
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

 