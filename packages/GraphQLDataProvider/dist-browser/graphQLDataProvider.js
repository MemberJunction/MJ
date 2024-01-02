/**************************************************************************************************************
 * The graphQLDataProvider provides a data provider for the entities framework that uses GraphQL to communicate
 * with the server.
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it.
**************************************************************************************************************/
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "@memberjunction/core", "@memberjunction/core-entities", "graphql-request", "./graphQLTransactionGroup", "idb", "rxjs", "graphql-ws"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GraphQLDataProvider = exports.GraphQLProviderConfigData = void 0;
    const core_1 = require("@memberjunction/core");
    const core_entities_1 = require("@memberjunction/core-entities");
    const graphql_request_1 = require("graphql-request");
    const graphQLTransactionGroup_1 = require("./graphQLTransactionGroup");
    const idb_1 = require("idb");
    const rxjs_1 = require("rxjs");
    const graphql_ws_1 = require("graphql-ws");
    class GraphQLProviderConfigData extends core_1.ProviderConfigDataBase {
        get Token() { return this.Data.Token; }
        get URL() { return this.Data.URL; }
        get WSURL() { return this.Data.WSURL; }
        /**
         * wsurl is the URL to the GraphQL websocket endpoint. This is used for subscriptions, if you are not using subscriptions, pass in a blank string for this
         */
        constructor(token, url, wsurl, MJCoreSchemaName, includeSchemas, excludeSchemas) {
            super({
                Token: token,
                URL: url,
                WSURL: wsurl,
            }, MJCoreSchemaName, includeSchemas, excludeSchemas);
        }
    }
    exports.GraphQLProviderConfigData = GraphQLProviderConfigData;
    // The GraphQLDataProvider implements both the IEntityDataProvider and IMetadataProvider interfaces.
    class GraphQLDataProvider extends core_1.ProviderBase {
        constructor() {
            super(...arguments);
            this._allLatestMetadataUpdatesQuery = (0, graphql_request_1.gql) `query mdUpdates {
        AllLatestMetadataUpdates {
            ID
            Type
            UpdatedAt
        }    
    }
    `;
            this._innerAllEntitiesQueryString = `AllEntities {
            ${this.entityInfoString()}
        }`;
            this._innerAllEntityFieldsQueryString = `AllEntityFields {
            ${this.entityFieldInfoString()}
        }`;
            this._innerAllEntityRelationshipsQueryString = `AllEntityRelationships {
            ${this.entityRelationshipInfoString()}
        }`;
            this._innerAllEntityPermissionsQueryString = `AllEntityPermissions {
            ${this.entityPermissionInfoString()}
        }`;
            this._innerAllApplicationsQueryString = `AllApplications {
        ${this.applicationInfoString()}
        ApplicationEntities {
            ${this.applicationEntityInfoString()}
        }
    }
    `;
            this._innerCurrentUserQueryString = `CurrentUser {
        ${this.userInfoString()}
        UserRolesArray {
            ${this.userRoleInfoString()}
        }
    }
    `;
            this._allApplicationsQuery = (0, graphql_request_1.gql) `
        ${this._innerAllApplicationsQueryString}
    `;
            this._innerAllRolesQueryString = `AllRoles {
        ${this.roleInfoString()}
    }
    `;
            this._innerAllRowLevelSecurityFiltersQueryString = `AllRowLevelSecurityFilters {
        ${this.rowLevelSecurityFilterInfoString()}
    }
    `;
            this._innerAllAuditLogTypesQueryString = `AllAuditLogTypes {
        ${this.auditLogTypeInfoString()}
    }
    `;
            this._innerAllAuthorizationsQueryString = `AllAuthorizations {
        ${this.authorizationInfoString()}
    }
    `;
            this._allMetaDataQuery = (0, graphql_request_1.gql) `query AllApplicationsAndEntities {
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
    }`;
            this._currentUserQuery = (0, graphql_request_1.gql) `query CurrentUserAndRoles {
        ${this._innerCurrentUserQueryString}    
    }`;
            this._wsClient = null;
            this._pushStatusRequests = [];
        }
        get ConfigData() { return super.ConfigData; }
        GenerateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            });
        }
        async Config(configData) {
            try {
                // FIRST, set up the GraphQL client
                this._sessionId = this.GenerateUUID();
                this._url = configData.URL;
                this._token = configData.Token;
                // now create the new client, if it isn't alreayd created
                if (!GraphQLDataProvider._client)
                    GraphQLDataProvider._client = new graphql_request_1.GraphQLClient(configData.URL, {
                        headers: {
                            authorization: 'Bearer ' + configData.Token,
                            'x-session-id': this._sessionId
                        }
                    });
                return super.Config(configData); // now parent class can do it's config
            }
            catch (e) {
                (0, core_1.LogError)(e);
                throw (e);
            }
        }
        get sessionId() {
            return this._sessionId;
        }
        AllowRefresh() {
            return true; // this provider doesn't have any issues with allowing refreshes at any time
        }
        async GetCurrentUser() {
            const d = await GraphQLDataProvider.ExecuteGQL(this._currentUserQuery, null);
            if (d) {
                return new core_1.UserInfo(this, { ...d.CurrentUser, UserRoles: d.CurrentUser.UserRolesArray }); // need to pass in the UserRoles as a separate property that is what is expected here
            }
        }
        /**************************************************************************/
        // START ---- IRunReportProvider
        /**************************************************************************/
        async RunReport(params, contextUser) {
            const query = (0, graphql_request_1.gql) `
        query GetReportDataQuery ($ReportID: Int!) {
            GetReportData(ReportID: $ReportID) {
                Success
                Results
                RowCount
                ExecutionTime
                ErrorMessage
            }
        }`;
            const result = await GraphQLDataProvider.ExecuteGQL(query, { ReportID: params.ReportID });
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
        async RunView(params, contextUser) {
            try {
                let qName = '';
                let paramType = '';
                if (params) {
                    const innerParams = {};
                    let entity, viewEntity;
                    if (params.ViewEntity) {
                        viewEntity = params.ViewEntity;
                        entity = viewEntity.Entity;
                    }
                    else {
                        const { entityName, v } = await this.getEntityNameAndUserView(params, contextUser);
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
                    const query = (0, graphql_request_1.gql) `
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
                }`;
                    const viewData = await GraphQLDataProvider.ExecuteGQL(query, { input: innerParams });
                    if (viewData && viewData[qName])
                        return viewData[qName];
                }
                else
                    throw ("No parameters passed to RunView");
                return null;
            }
            catch (e) {
                (0, core_1.LogError)(e);
                throw (e);
            }
        }
        async getEntityNameAndUserView(params, contextUser) {
            let entityName;
            let v;
            if (!params.EntityName) {
                if (params.ViewID) {
                    v = await core_entities_1.ViewInfo.GetViewEntity(params.ViewID, contextUser);
                    entityName = v.Entity;
                }
                else if (params.ViewName) {
                    v = await core_entities_1.ViewInfo.GetViewEntityByName(params.ViewName, contextUser);
                    entityName = v.Entity;
                }
                else
                    throw new Error(`No EntityName, ViewID or ViewName passed to RunView`);
            }
            else
                entityName = params.EntityName;
            return { entityName, v };
        }
        getViewRunTimeFieldList(e, v, params, dynamicView) {
            const fieldList = [];
            if (params.Fields) {
                if (params.Fields.find(f => f.trim().toLowerCase() === 'ID') === undefined)
                    fieldList.push('ID'); // always include ID field
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
                        if (f.Name.trim().toLowerCase() !== 'ID')
                            fieldList.push(f.Name);
                        else
                            fieldList.push('ID'); // always include ID field and include it as upper case in all instances
                    });
                }
                else {
                    // NOTE: in the below, c.EntityField SHOULD always exist, however there is a possibility that at some point a VIEW was created that used fields
                    // and those fields are NO LONGER part of an entity, in that situation we should just remove them, rather than letting the whole view blow up which
                    // would happen if we dno't check for c.EntityField? in the below
                    // first make sure we have ID in the view column list, always should, but make sure
                    if (v.Columns.find(c => c.EntityField?.Name?.trim().toLowerCase() === 'ID' && c.hidden === false) === undefined)
                        fieldList.push('ID'); // always include ID field in the result data, don't need to display the data, but we need to always provide record ID to the caller
                    // Now: include the fields that are part of the view definition
                    v.Columns.forEach(c => {
                        if (c.hidden === false && c.EntityField && c.EntityField.Name.trim().toLowerCase() !== 'ID') // don't include hidden fields and don't include ID again
                            fieldList.push(c.EntityField.Name);
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
        get ProviderType() {
            return core_1.ProviderType.Network;
        }
        async GetRecordChanges(entityName, recordId) {
            try {
                const p = {
                    EntityName: 'Record Changes',
                    ExtraFilter: `RecordID = ${recordId} AND Entity = '${entityName}'`,
                    //OrderBy: 'ChangedAt DESC',
                };
                const result = await this.RunView(p);
                if (result) {
                    // sort the results client side because, for now, the RunViewParams doesn't support OrderBy dynamically like we tried. Later change this to do via the SQL query 
                    return result.Results.sort((a, b) => {
                        return (a.ChangedAt > b.ChangedAt) ? -1 : 1; // sort descending on the date.... GraphQL passes back the date as time since base date
                    });
                }
                else
                    return null;
            }
            catch (e) {
                (0, core_1.LogError)(e);
                throw (e);
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
        async GetRecordDependencies(entityName, recordId) {
            try {
                // execute the gql query to get the dependencies
                const query = (0, graphql_request_1.gql) `query GetRecordDependenciesQuery ($entityName: String!, $recordId: Int!) {
                GetRecordDependencies(entityName: $entityName, recordId: $recordId) {
                    EntityName
                    RelatedEntityName
                    FieldName
                    RecordID 
                }
            }`;
                // now we have our query built, execute it
                const data = await GraphQLDataProvider.ExecuteGQL(query, { entityName: entityName, recordId: recordId });
                return data?.GetRecordDependencies; // shape of the result should exactly match the RecordDependency type
            }
            catch (e) {
                (0, core_1.LogError)(e);
                throw (e);
            }
        }
        async MergeRecords(request) {
            try {
                // execute the gql query to get the dependencies
                const mutation = (0, graphql_request_1.gql) `mutation MergeRecordsMutation ($request: RecordMergeRequest!) {
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
            }`;
                // now we have our query built, execute it
                const data = await GraphQLDataProvider.ExecuteGQL(mutation, { request: request });
                return data?.MergeRecords; // shape of the result should exactly match the RecordDependency type
            }
            catch (e) {
                (0, core_1.LogError)(e);
                throw (e);
            }
        }
        async Save(entity, user, options) {
            try {
                const vars = { input: {} };
                const type = (entity.ID) ? "Update" : "Create";
                // Create the query for the mutation first, we will provide the specific
                // input values later in the loop below. Here we are just setting up the mutation
                // and the fields that will be returned since the mutation returns back the latest
                // values for the entity and we need to have those values to update the entity after the
                // save
                const mutationName = `${type}${entity.EntityInfo.ClassName}`;
                const inner = `                ${mutationName}(input: $input) {
                ${entity.Fields.map(f => f.Name).join("\n                    ")}
            }`;
                const outer = (0, graphql_request_1.gql) `mutation ${type}${entity.EntityInfo.ClassName} ($input: ${mutationName}Input!) {
                ${inner}
            }
            `;
                for (let i = 0; i < entity.Fields.length; i++) {
                    const f = entity.Fields[i];
                    if (f.SQLType.trim().toLowerCase() !== 'uniqueidentifier' &&
                        (f.ReadOnly == false || (f.Name == 'ID' && entity.ID))) {
                        // only pass along writable fields, AND the ID value if this is an update
                        let val = f.Value;
                        if (val && f.EntityFieldInfo.TSType === core_1.EntityFieldTSType.Date)
                            val = val.getTime();
                        if (val && f.EntityFieldInfo.TSType === core_1.EntityFieldTSType.Boolean && typeof val !== 'boolean')
                            val = parseInt(val) === 0 ? false : true; // convert to boolean
                        if (val == null && f.EntityFieldInfo.AllowsNull == false) {
                            if (f.EntityFieldInfo.DefaultValue != null) {
                                // no value, but there is a default value, so use that, since field does NOT allow NULL
                                val = f.EntityFieldInfo.DefaultValue;
                            }
                            else {
                                // no default value, null value and field doesn't allow nulls, so set to either 0 or empty string
                                if (f.FieldType == core_1.EntityFieldTSType.Number || f.FieldType == core_1.EntityFieldTSType.Boolean)
                                    val = 0;
                                else
                                    val = '';
                            }
                        }
                        vars.input[f.Name] = val;
                    }
                }
                if (entity.TransactionGroup) {
                    return new Promise((resolve, reject) => {
                        // we are part of a transaction group, so just add our query to the list
                        // and when the transaction is committed, we will send all the queries at once
                        entity.TransactionGroup.AddTransaction(new core_1.TransactionItem(inner, vars, { mutationName,
                            mutationInputType: mutationName + 'Input!' }, (results, success) => {
                            // we get here whenever the transaction group does gets around to committing
                            // our query. We need to update our entity with the values that were returned
                            // from the mutation if it was successful.
                            if (success && results) {
                                // got our data, send it back to the caller, which is the entity object
                                // and that object needs to update itself from this data.
                                resolve(results);
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
                    const d = await GraphQLDataProvider.ExecuteGQL(outer, vars);
                    if (d && d[type + entity.EntityInfo.ClassName]) {
                        return d[type + entity.EntityInfo.ClassName];
                    }
                    else
                        return null;
                }
            }
            catch (e) {
                (0, core_1.LogError)(e);
                return null;
            }
        }
        async Load(entity, RecordID, EntityRelationshipsToLoad = null, user) {
            try {
                const rel = EntityRelationshipsToLoad && EntityRelationshipsToLoad.length > 0 ? this.getRelatedEntityString(entity.EntityInfo, EntityRelationshipsToLoad) : '';
                const query = (0, graphql_request_1.gql) `query Single${entity.EntityInfo.ClassName}${rel.length > 0 ? 'Full' : ''} ($ID: Int!) {
                ${entity.EntityInfo.ClassName}(ID: $ID) {
                    ${entity.Fields.map(f => f.Name).join("\n                    ")}
                    ${rel}
                }
            }
            `;
                const d = await GraphQLDataProvider.ExecuteGQL(query, { ID: RecordID });
                if (d && d[entity.EntityInfo.ClassName]) {
                    return d[entity.EntityInfo.ClassName];
                }
                else
                    return null;
            }
            catch (e) {
                (0, core_1.LogError)(e);
                return null;
            }
        }
        getRelatedEntityString(entityInfo, EntityRelationshipsToLoad) {
            let rel = '';
            for (let i = 0; i < entityInfo.RelatedEntities.length; i++) {
                if (EntityRelationshipsToLoad.indexOf(entityInfo.RelatedEntities[i].RelatedEntity) >= 0) {
                    const r = entityInfo.RelatedEntities[i];
                    const re = this.Entities.find(e => e.ID === r.RelatedEntityID);
                    rel += `
                ${re.CodeName} {
                    ${re.Fields.map(f => f.Name).join("\n                    ")}
                }
                `;
                }
            }
            return rel;
        }
        async Delete(entity, user) {
            try {
                const vars = { ID: entity.ID };
                const queryName = 'Delete' + entity.EntityInfo.ClassName;
                const query = (0, graphql_request_1.gql) `mutation ${queryName} ($ID: Int!) {
                ${queryName}(ID: $ID)
            }
            `;
                if (entity.TransactionGroup) {
                    // we have a transaction group, need to play nice and be part of it
                    return new Promise((resolve, reject) => {
                        // we are part of a transaction group, so just add our query to the list
                        // and when the transaction is committed, we will send all the queries at once
                        entity.TransactionGroup.AddTransaction(new core_1.TransactionItem(query, vars, { mutationName: queryName,
                            mutationInputType: 'Int!' }, (results, success) => {
                            // we get here whenever the transaction group does gets around to committing
                            // our query.  
                            if (success && results) {
                                // success indicated by the entity.ID matching the return value of the mutation
                                resolve(entity.ID === results);
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
                    const d = await GraphQLDataProvider.ExecuteGQL(query, vars);
                    if (d && d[queryName])
                        return entity.ID === d[queryName]; // returns the ID of the deleted record if SP is successful
                    else
                        return false;
                }
            }
            catch (e) {
                (0, core_1.LogError)(e);
                return false;
            }
        }
        /**************************************************************************/
        // END ---- IEntityDataProvider
        /**************************************************************************/
        /**************************************************************************/
        // START ---- IMetadataProvider
        /**************************************************************************/
        async GetDatasetByName(datasetName, itemFilters) {
            const query = (0, graphql_request_1.gql) `query GetDatasetByName($DatasetName: String!, $ItemFilters: [DatasetItemFilterTypeGQL!]) {
            GetDatasetByName(DatasetName: $DatasetName, ItemFilters: $ItemFilters) {
                DatasetID
                DatasetName
                Success
                Status
                LatestUpdateDate
                Results
            }
        }`;
            const data = await GraphQLDataProvider.ExecuteGQL(query, { DatasetName: datasetName, ItemFilters: itemFilters });
            if (data && data.GetDatasetByName && data.GetDatasetByName.Success) {
                return {
                    DatasetID: data.GetDatasetByName.DatasetID,
                    DatasetName: data.GetDatasetByName.DatasetName,
                    Success: data.GetDatasetByName.Success,
                    Status: data.GetDatasetByName.Status,
                    LatestUpdateDate: new Date(data.GetDatasetByName.LatestUpdateDate),
                    Results: JSON.parse(data.GetDatasetByName.Results)
                };
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
        async GetDatasetStatusByName(datasetName, itemFilters) {
            const query = (0, graphql_request_1.gql) `query GetDatasetStatusByName($DatasetName: String!, $ItemFilters: [DatasetItemFilterTypeGQL!]) {
            GetDatasetStatusByName(DatasetName: $DatasetName, ItemFilters: $ItemFilters) {
                DatasetID
                DatasetName
                Success
                Status
                LatestUpdateDate
                EntityUpdateDates
            }
        }`;
            const data = await GraphQLDataProvider.ExecuteGQL(query, { DatasetName: datasetName, ItemFilters: itemFilters });
            if (data && data.GetDatasetStatusByName && data.GetDatasetStatusByName.Success) {
                return {
                    DatasetID: data.GetDatasetStatusByName.DatasetID,
                    DatasetName: data.GetDatasetStatusByName.DatasetName,
                    Success: data.GetDatasetStatusByName.Success,
                    Status: data.GetDatasetStatusByName.Status,
                    LatestUpdateDate: new Date(data.GetDatasetStatusByName.LatestUpdateDate),
                    EntityUpdateDates: JSON.parse(data.GetDatasetStatusByName.EntityUpdateDates)
                };
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
        async CreateTransactionGroup() {
            return new graphQLTransactionGroup_1.GraphQLTransactionGroup();
        }
        async GetRecordFavoriteStatus(userId, entityName, recordId) {
            const e = this.Entities.find(e => e.Name === entityName);
            if (!e)
                throw new Error(`Entity ${entityName} not found in metadata`);
            const query = (0, graphql_request_1.gql) `query GetRecordFavoriteStatus($params: UserFavoriteSearchParams!) {
            GetRecordFavoriteStatus(params: $params) {
                Success
                IsFavorite
            }
        }`;
            const data = await GraphQLDataProvider.ExecuteGQL(query, { params: { UserID: userId, EntityID: e.ID, RecordID: recordId } });
            if (data && data.GetRecordFavoriteStatus && data.GetRecordFavoriteStatus.Success)
                return data.GetRecordFavoriteStatus.IsFavorite;
        }
        async SetRecordFavoriteStatus(userId, entityName, recordId, isFavorite, contextUser) {
            const e = this.Entities.find(e => e.Name === entityName);
            if (!e)
                throw new Error(`Entity ${entityName} not found in metadata`);
            const query = (0, graphql_request_1.gql) `mutation SetRecordFavoriteStatus($params: UserFavoriteSetParams!) {
            SetRecordFavoriteStatus(params: $params){
                Success
            }
        }`;
            const data = await GraphQLDataProvider.ExecuteGQL(query, { params: { UserID: userId, EntityID: e.ID, RecordID: recordId, IsFavorite: isFavorite } });
            if (data && data.SetRecordFavoriteStatus !== null)
                return data.SetRecordFavoriteStatus.Success;
        }
        async GetEntityRecordName(entityName, recordId) {
            if (!entityName || !recordId)
                return null;
            const query = (0, graphql_request_1.gql) `query GetEntityRecordNameQuery ($EntityName: String!, $RecordID: Int!) {
            GetEntityRecordName(EntityName: $EntityName, RecordID: $RecordID) {
                Success
                Status
                RecordName
            }
        }`;
            const data = await GraphQLDataProvider.ExecuteGQL(query, { EntityName: entityName, RecordID: recordId });
            if (data && data.GetEntityRecordName && data.GetEntityRecordName.Success)
                return data.GetEntityRecordName.RecordName;
        }
        async GetEntityRecordNames(info) {
            if (!info)
                return null;
            const query = (0, graphql_request_1.gql) `query GetEntityRecordNamesQuery ($info: [EntityRecordNameInput!]!) {
            GetEntityRecordNames(info: $info) {
                Success
                Status
                RecordID
                EntityName
                RecordName
            }
        }`;
            const data = await GraphQLDataProvider.ExecuteGQL(query, { info: info });
            if (data && data.GetEntityRecordNames)
                return data.GetEntityRecordNames;
        }
        static async ExecuteGQL(query, variables) {
            try {
                const data = await this._client.request(query, variables);
                return data;
            }
            catch (e) {
                (0, core_1.LogError)(e);
                throw e; // force the caller to handle the error
            }
        }
        roleInfoString() {
            return this.infoString(new core_1.RoleInfo(null));
        }
        userInfoString() {
            return this.infoString(new core_1.UserInfo(null, null));
        }
        userRoleInfoString() {
            return this.infoString(new core_1.UserRoleInfo(null));
        }
        rowLevelSecurityFilterInfoString() {
            return this.infoString(new core_1.RowLevelSecurityFilterInfo(null));
        }
        auditLogTypeInfoString() {
            return this.infoString(new core_1.AuditLogTypeInfo(null));
        }
        authorizationInfoString() {
            return this.infoString(new core_1.AuthorizationInfo(null));
        }
        applicationInfoString() {
            return this.infoString(new core_1.ApplicationInfo(null, null));
        }
        applicationEntityInfoString() {
            return this.infoString(new core_1.ApplicationEntityInfo(null));
        }
        entityInfoString() {
            return this.infoString(new core_1.EntityInfo(null));
        }
        entityFieldInfoString() {
            return this.infoString(new core_1.EntityFieldInfo(null));
        }
        entityRelationshipInfoString() {
            return this.infoString(new core_1.EntityRelationshipInfo(null));
        }
        entityPermissionInfoString() {
            return this.infoString(new core_1.EntityPermissionInfo(null));
        }
        infoString(object) {
            let sOutput = '';
            const keys = Object.keys(object);
            for (let i = 0; i < keys.length; i++) {
                if (keys[i].substring(0, 1) != '_')
                    sOutput += keys[i] + '\n            ';
            }
            return sOutput;
        }
        get LocalStorageProvider() {
            if (!this._localStorageProvider)
                this._localStorageProvider = new BrowserIndexedDBStorageProvider();
            return this._localStorageProvider;
        }
        /**************************************************************************/
        // END ---- IMetadataProvider
        /**************************************************************************/
        get Metadata() {
            return this;
        }
        PushStatusUpdates(sessionId = null) {
            if (!sessionId)
                sessionId = this.sessionId;
            if (!this._wsClient)
                this._wsClient = (0, graphql_ws_1.createClient)({
                    url: this.ConfigData.WSURL,
                    connectionParams: {
                        Authorization: 'Bearer ' + this.ConfigData.Token,
                    },
                });
            const existingRequest = this._pushStatusRequests.find(r => r.sessionId === sessionId);
            if (existingRequest)
                return existingRequest.observable;
            const SUBSCRIBE_TO_STATUS = (0, graphql_request_1.gql) `subscription StatusUpdates($sessionId: String!) {
            statusUpdates(sessionId: $sessionId) {
                date
                message
                sessionId
            }
        }
        `;
            const newObservable = new rxjs_1.Observable((observer) => {
                const unsubscribe = this._wsClient.subscribe({ query: SUBSCRIBE_TO_STATUS, variables: { sessionId } }, {
                    next: (data) => {
                        return observer.next(data.data.statusUpdates);
                    },
                    error: (error) => {
                        return observer.error(error);
                    },
                    complete: () => {
                        return observer.complete();
                    },
                });
                return () => {
                    // Cleanup logic
                    console.log('would unsub here');
                    //unsubscribe();
                };
            });
            this._pushStatusRequests.push({ sessionId, observable: newObservable });
            return newObservable;
        }
    }
    exports.GraphQLDataProvider = GraphQLDataProvider;
    // this class implements a simple in-memory only storage as a fallback if the browser doesn't support local storage
    class BrowserStorageProviderBase {
        constructor() {
            this._localStorage = {};
        }
        async getItem(key) {
            return new Promise((resolve) => {
                if (this._localStorage.hasOwnProperty(key))
                    resolve(this._localStorage[key]);
                else
                    resolve(null);
            });
        }
        async setItem(key, value) {
            return new Promise((resolve) => {
                this._localStorage[key] = value;
                resolve();
            });
        }
        async remove(key) {
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
    class BrowserLocalStorageProvider extends BrowserStorageProviderBase {
        async getItem(key) {
            if (localStorage)
                return localStorage.getItem(key);
            else
                return await super.getItem(key);
        }
        async setItem(key, value) {
            if (localStorage)
                localStorage.setItem(key, value);
            else
                await super.setItem(key, value);
        }
        async remove(key) {
            if (localStorage)
                localStorage.removeItem(key);
            else
                await super.remove(key);
        }
    }
    const IDB_DB_NAME = 'MJ_Metadata';
    const IDB_DB_ObjectStoreName = 'Metadata_KVPairs';
    class BrowserIndexedDBStorageProvider extends BrowserStorageProviderBase {
        constructor() {
            super();
            this.dbPromise = (0, idb_1.openDB)(IDB_DB_NAME, 1, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(IDB_DB_ObjectStoreName)) {
                        db.createObjectStore(IDB_DB_ObjectStoreName);
                    }
                },
            });
        }
        async setItem(key, value) {
            const db = await this.dbPromise;
            const tx = db.transaction(IDB_DB_ObjectStoreName, 'readwrite');
            await tx.objectStore(IDB_DB_ObjectStoreName).put(value, key);
            await tx.done;
        }
        async getItem(key) {
            const db = await this.dbPromise;
            const value = await db.transaction(IDB_DB_ObjectStoreName).objectStore(IDB_DB_ObjectStoreName).get(key);
            return value;
        }
        async remove(key) {
            const db = await this.dbPromise;
            const tx = db.transaction(IDB_DB_ObjectStoreName, 'readwrite');
            await tx.objectStore(IDB_DB_ObjectStoreName).delete(key);
            await tx.done;
        }
    }
});
//# sourceMappingURL=graphQLDataProvider.js.map