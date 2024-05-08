 /**************************************************************************************************************
 * The SQLServerDataProvider provides a data provider for the entities framework that uses SQL Server directly
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it. 
**************************************************************************************************************/

import { BaseEntity, IEntityDataProvider, IMetadataProvider, IRunViewProvider, ProviderConfigDataBase, RunViewResult, MetadataInfo,
         EntityInfo, EntityFieldInfo, ApplicationInfo, RunViewParams, ProviderBase,
         TypeScriptTypeFromSQLType, EntityFieldTSType, ProviderType, UserInfo, RoleInfo, RecordChange, UserRoleInfo, ILocalStorageProvider, RowLevelSecurityFilterInfo,
         AuditLogTypeInfo, AuthorizationInfo, TransactionGroupBase, TransactionItem, EntityPermissionType, EntitySaveOptions, LogError, RunReportParams,
         DatasetItemFilterType, DatasetResultType, DatasetStatusEntityUpdateDateType, DatasetStatusResultType, EntityRecordNameInput, EntityRecordNameResult, IRunReportProvider, RunReportResult,
         StripStopWords, RecordDependency, RecordMergeRequest, RecordMergeResult, RecordMergeDetailResult, EntityDependency, KeyValuePair, IRunQueryProvider, RunQueryResult, PotentialDuplicateRequest, PotentialDuplicateResponse, LogStatus,
         CompositeKey} from "@memberjunction/core";

import { AuditLogEntity, DuplicateRunEntity, ListEntity, RecordMergeDeletionLogEntity, RecordMergeLogEntity, UserFavoriteEntity, UserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities'
import { AIEngine, EntityAIActionParams } from "@memberjunction/aiengine";
import { QueueManager } from '@memberjunction/queue'

import { DataSource, QueryRunner } from 'typeorm';
import { SQLServerTransactionGroup } from "./SQLServerTransactionGroup";

import { UserCache } from "./UserCache";
import { RunQueryParams } from "@memberjunction/core/dist/generic/runQuery";
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';

export class SQLServerProviderConfigData extends ProviderConfigDataBase {
    get DataSource(): any { return this.Data.DataSource }
    get CurrentUserEmail(): string { return this.Data.CurrentUserEmail }
    get CheckRefreshIntervalSeconds(): number { return this.Data.CheckRefreshIntervalSeconds }

    constructor(dataSource: any, 
                currentUserEmail: string, 
                MJCoreSchemaName?: string,
                checkRefreshIntervalSeconds: number = 90 /*default to 90 seconds between checks*/, 
                includeSchemas?: string[], 
                excludeSchemas?: string[]) {
        super({
                DataSource: dataSource, 
                CurrentUserEmail: currentUserEmail,
                CheckRefreshIntervalSeconds: checkRefreshIntervalSeconds
              },
              MJCoreSchemaName,
              includeSchemas,
              excludeSchemas
            );
    }
}

// Implements both the IEntityDataProvider and IMetadataProvider interfaces.
export class SQLServerDataProvider extends ProviderBase implements IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider, IRunQueryProvider {
    private _dataSource: DataSource;
    private _queryRunner: QueryRunner;
    private _currentUserEmail: string;
    private _localStorageProvider: ILocalStorageProvider;
    private _bAllowRefresh: boolean = true;
    private _recordDupeDetector: DuplicateRecordDetector;

    public get ConfigData(): SQLServerProviderConfigData { return <SQLServerProviderConfigData>super.ConfigData; }

    public async Config(configData: SQLServerProviderConfigData): Promise<boolean> {
        try {
            this._dataSource = configData.DataSource;
            this._currentUserEmail = configData.CurrentUserEmail;

            return super.Config(configData);// now parent class can do it's config
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    protected AllowRefresh(): boolean {
        return this._bAllowRefresh;
    }

    public get MJCoreSchemaName(): string {
        return this.ConfigData.MJCoreSchemaName;
    }

    /**************************************************************************/
    // START ---- IRunReportProvider
    /**************************************************************************/
    public async RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult> {
        const ReportID = params.ReportID;
        // run the sql and return the data
        const sqlReport = `SELECT ReportSQL FROM [${this.MJCoreSchemaName}].vwReports WHERE ID =${ReportID}`;
        const reportInfo = await this.ExecuteSQL(sqlReport);
        if (reportInfo && reportInfo.length > 0) {
            const start = new Date().getTime();
            const sql = reportInfo[0].ReportSQL;
            const result = await this.ExecuteSQL(sql);
            const end = new Date().getTime();
            if (result)
                return {Success: true, ReportID: ReportID, Results: result, RowCount: result.length, ExecutionTime: end-start, ErrorMessage: ''};
            else
                return {Success: false, ReportID: ReportID, Results: [], RowCount: 0, ExecutionTime: end - start, ErrorMessage: 'Error running report SQL'};
        }
        else
            return {Success: false, ReportID: ReportID, Results: [], RowCount: 0, ExecutionTime: 0, ErrorMessage: 'Report not found'};
    }
    /**************************************************************************/
    // END ---- IRunReportProvider
    /**************************************************************************/



    /**************************************************************************/
    // START ---- IRunQueryProvider
    /**************************************************************************/
    public async RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        try {
            const QueryID = params.QueryID;
            // run the sql and return the data
            const sqlQuery = `SELECT SQL FROM [${this.MJCoreSchemaName}].vwQueries WHERE ID =${QueryID}`;
            const queryInfo = await this.ExecuteSQL(sqlQuery);
            if (queryInfo && queryInfo.length > 0) {
                const start = new Date().getTime();
                const sql = queryInfo[0].SQL;
                const result = await this.ExecuteSQL(sql);
                const end = new Date().getTime();
                if (result)
                    return {Success: true, QueryID: QueryID, Results: result, RowCount: result.length, ExecutionTime: end-start, ErrorMessage: ''};
                else
                    return {Success: false, QueryID: QueryID, Results: [], RowCount: 0, ExecutionTime: end - start, ErrorMessage: 'Error running query SQL'};
            }
            else
                return {Success: false, QueryID: QueryID, Results: [], RowCount: 0, ExecutionTime: 0, ErrorMessage: 'Query not found'};    
        }
        catch (e) {
            LogError(e);
            return {Success: false, QueryID: params.QueryID, Results: [], RowCount: 0, ExecutionTime: 0, ErrorMessage: e.message};
        }
    }
    /**************************************************************************/
    // END ---- IRunQueryProvider
    /**************************************************************************/



    /**************************************************************************/
    // START ---- IRunViewProvider
    /**************************************************************************/
    public async RunView(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult> {
        const startTime = new Date();
        try {
            if (params) {
                const user = contextUser ? contextUser : this.CurrentUser;
                if (!user)
                    throw new Error(`User ${this._currentUserEmail} not found in metadata and no contextUser provided to RunView()`);

                let viewEntity: any = null, entityInfo: EntityInfo = null;
                if (params.ViewEntity) 
                    viewEntity = params.ViewEntity;
                else if (params.ViewID && params.ViewID > 0) 
                    viewEntity = await ViewInfo.GetViewEntity(params.ViewID, contextUser);
                else if (params.ViewName && params.ViewName.length > 0) 
                    viewEntity = await ViewInfo.GetViewEntityByName(params.ViewName, contextUser);
                
                if (!viewEntity) {
                    // if we don't have viewEntity, that means it is a dynamic view, so we need EntityName at a minimum
                    if (!params.EntityName || params.EntityName.length === 0)
                        throw new Error(`EntityName is required when ViewID or ViewName is not provided`);
                    
                    entityInfo = this.Entities.find((e) => e.Name === params.EntityName);
                    if (!entityInfo)
                        throw new Error(`Entity ${params.EntityName} not found in metadata`);
                }
                else {
                    entityInfo = this.Entities.find((e) => e.ID === viewEntity.EntityID);
                    if (!entityInfo)
                        throw new Error(`Entity ID: ${viewEntity.EntityID} not found in metadata`);
                }

                // check permissions now, this call will throw an error if the user doesn't have permission
                this.CheckUserReadPermissions(entityInfo.Name, user);

                // get other variaables from params
                const extraFilter: string = params.ExtraFilter
                const userSearchString: string = params.UserSearchString;
                const excludeUserViewRunID: number = params.ExcludeUserViewRunID;
                const overrideExcludeFilter: string = params.OverrideExcludeFilter;
                const saveViewResults: boolean = params.SaveViewResults;

                let topSQL: string = '';
                if (params.IgnoreMaxRows === true) {
                    // do nothing, leave it blank, this structure is here to make the code easier to read
                }
                else if (params.MaxRows && params.MaxRows > 0) {
                    // user provided a max rows, so we use that
                    topSQL = 'TOP ' + params.MaxRows;
                }
                else if (entityInfo.UserViewMaxRows && entityInfo.UserViewMaxRows > 0) {
                    topSQL = 'TOP ' + entityInfo.UserViewMaxRows;
                }

                const fields: string = this.getRunTimeViewFieldString(params, viewEntity)

                let viewSQL: string = `SELECT ${topSQL} ${fields} FROM [${entityInfo.SchemaName}].${entityInfo.BaseView}`;
                let countSQL = topSQL && topSQL.length > 0 ? `SELECT COUNT(*) AS TotalRowCount FROM [${entityInfo.SchemaName}].${entityInfo.BaseView}` : null;
                let whereSQL: string = '';
                let bHasWhere: boolean = false;
                let userViewRunID: number = 0;

                // The view may have a where clause that is part of the view definition. If so, we need to add it to the SQL
                if (viewEntity?.WhereClause && viewEntity?.WhereClause.length > 0) {
                    whereSQL = `(${viewEntity.WhereClause})`;
                    bHasWhere = true;
                }

                // a developer calling the function can provide an additional Extra Filter which is any valid SQL exprssion that can be added to the WHERE clause
                if (extraFilter && extraFilter.length > 0) {
                    // extra filter is simple- we just AND it to the where clause if it exists, or we add it as a where clause if there was no prior WHERE
                    if (!this.validateUserProvidedSQLClause(extraFilter))
                        throw new Error(`Invalid Extra Filter: ${extraFilter}, contains one more for forbidden keywords`);

                    if (bHasWhere) {
                        whereSQL += ` AND (${extraFilter})`;
                    } else {
                        whereSQL = `(${extraFilter})`;
                        bHasWhere = true;
                    }
                }

                // check for a user provided search string and generate SQL as needed if provided
                if (userSearchString && userSearchString.length > 0) {
                    if (!this.validateUserProvidedSQLClause(userSearchString))
                        throw new Error(`Invalid User Search SQL clause: ${userSearchString}, contains one more for forbidden keywords`);

                    const sUserSearchSQL: string = this.createViewUserSearchSQL(entityInfo, userSearchString);

                    if (sUserSearchSQL.length > 0) {
                        if (bHasWhere) {
                            whereSQL += ` AND (${sUserSearchSQL})`;
                        } else {
                            whereSQL = `(${sUserSearchSQL})`;
                            bHasWhere = true;
                        }
                    }
                }
                
                // now, check for an exclude UserViewRunID, or exclusion of ALL prior runs
                // if provided, we need to exclude the records that were part of that run (or all prior runs)
                if ((excludeUserViewRunID && excludeUserViewRunID > 0) || 
                    (params.ExcludeDataFromAllPriorViewRuns === true) ) {
                    
                    let sExcludeSQL: string = `ID NOT IN (SELECT RecordID FROM [${this.MJCoreSchemaName}].vwUserViewRunDetails WHERE EntityID=${viewEntity.EntityID} AND` 
                    if (params.ExcludeDataFromAllPriorViewRuns === true)
                        sExcludeSQL += ` UserViewID=${viewEntity.ID})`; // exclude ALL prior runs for this view, we do NOT need to also add the UserViewRunID even if it was provided because this will automatically filter that out too
                    else
                        sExcludeSQL += `UserViewRunID=${excludeUserViewRunID})`; // exclude just the run that was provided

                    if (overrideExcludeFilter && overrideExcludeFilter.length > 0) {
                        if (!this.validateUserProvidedSQLClause(overrideExcludeFilter))
                            throw new Error(`Invalid OverrideExcludeFilter: ${overrideExcludeFilter}, contains one more for forbidden keywords`);
                                                                                
                        // add in the OVERRIDE filter with an OR statement, this results in those rows that match the Exclude filter to be included
                        // even if they're in the UserViewRunID that we're excluding
                        sExcludeSQL += ' OR (' + overrideExcludeFilter + ')';
                    }
                    if (bHasWhere) {
                        whereSQL += ` AND (${sExcludeSQL})`;
                    } else {
                        whereSQL = `(${sExcludeSQL})`;
                        bHasWhere = true;
                    }
                }

                // NEXT, apply Row Level Security (RLS)  
                if (!entityInfo.UserExemptFromRowLevelSecurity(user, EntityPermissionType.Read)) {
                    // user is NOT exempt from RLS, so we need to apply it
                    const rlsWhereClause: string = entityInfo.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');

                    if (rlsWhereClause && rlsWhereClause.length > 0) {
                        if (bHasWhere) {
                            whereSQL += ` AND (${rlsWhereClause})`;
                        } else {
                            whereSQL = `(${rlsWhereClause})`;
                            bHasWhere = true;
                        }
                    }
                }
                if (bHasWhere) {
                    viewSQL += ` WHERE ${whereSQL}`;
                    if (countSQL)
                        countSQL += ` WHERE ${whereSQL}`;
                }

                // figure out the sorting for the view
                // first check params.OrderBy, that takes first priority
                // if that's not provided, then we check the view definition for its SortState
                // if that's not provided we do NOT sort
                const orderBy: string = params.OrderBy ? params.OrderBy : (viewEntity ? viewEntity.OrderByClause : '');

                // if we're saving the view results, we need to wrap the entire SQL statement
                if (viewEntity?.ID && viewEntity?.ID > 0 && saveViewResults && user) {
                    const {executeViewSQL, runID} = await this.executeSQLForUserViewRunLogging(viewEntity.ID, viewEntity.EntityBaseView, whereSQL, orderBy, user);
                    viewSQL = executeViewSQL;
                    userViewRunID = runID;
                }
                else if (orderBy && orderBy.length > 0) {
                    // we only add order by if we're not doing run logging. This is becuase the run logging will 
                    // add the order by to its SELECT query that pulls from the list of records that were returned
                    // there is no point in ordering the rows as they are saved into an audit list anyway so no order-by above
                    // just here for final step before we execute it.
                    if (!this.validateUserProvidedSQLClause(orderBy))
                        throw new Error(`Invalid Order By clause: ${orderBy}, contains one more for forbidden keywords`);

                    viewSQL += ` ORDER BY ${orderBy}`;
                }

                // now we can run the viewSQL, but only do this if the ResultType !== 'count_only', otherwise we don't need to run the viewSQL
                const retData = params.ResultType === 'count_only' ? [] : await this._dataSource.query(viewSQL);

                // finally, if we have a countSQL, we need to run that to get the row count
                // but only do that if the # of rows returned is equal to the max rows, otherwise we know we have all the rows
                // OR do that if we are doing a count_only
                let rowCount = null;
                if (countSQL && (params.ResultType === 'count_only' || retData.length === entityInfo.UserViewMaxRows)) {
                    const countResult = await this._dataSource.query(countSQL);
                    if (countResult && countResult.length > 0) {
                        rowCount = countResult[0].TotalRowCount;
                    }
                }                       
                const stopTime = new Date();

                if (params.ForceAuditLog || (viewEntity?.ID && (extraFilter === undefined || extraFilter === null || extraFilter?.trim().length === 0) && entityInfo.AuditViewRuns)) {
                    // ONLY LOG TOP LEVEL VIEW EXECUTION - this would be for views with an ID, and don't have ExtraFilter as ExtraFilter
                    // is only used in the system on a tab or just for ad hoc view execution

                    // we do NOT want to wait for this, so no await, 
                    this.createAuditLogRecord(user,'Run View','Run View', 'Success', JSON.stringify({   
                                                                                                        ViewID: viewEntity?.ID, 
                                                                                                        ViewName: viewEntity?.Name, 
                                                                                                        Description: params.AuditLogDescription,
                                                                                                        RowCount: retData.length,
                                                                                                        SQL: viewSQL 
                                                                                                    }), 
                                                                                                    entityInfo.ID, null, params.AuditLogDescription)
                }

                return { 
                        RowCount: params.ResultType === 'count_only' ? rowCount : retData.length, /*this property should be total row count if the ResultType='count_only' otherwise it should be the row count of the returned rows */
                        TotalRowCount: rowCount ? rowCount : retData.length,
                        Results: retData, 
                        UserViewRunID: userViewRunID,
                        ExecutionTime: stopTime.getTime()-startTime.getTime(),
                        Success: true,
                        ErrorMessage: null
                    };
            }
            else
                return null;
        }
        catch (e) {
            const exceptionStopTime = new Date();
            LogError(e);
            return {
                RowCount: 0,
                TotalRowCount: 0,
                Results: [],
                UserViewRunID: 0,
                ExecutionTime: exceptionStopTime.getTime()-startTime.getTime(),
                Success: false,
                ErrorMessage: e.message
            }
        }
    }

    protected validateUserProvidedSQLClause(clause: string): boolean {
        // convert the clause to lower case to make the keyword search case-insensitive
        const lowerClause = clause.toLowerCase();
    
        // check for forbidden keywords and characters
        const forbiddenPatterns = [
            'insert', 
            'update', 
            'delete', 
            'exec', 
            'execute',
            'drop',
            '--',
            '/*',
            '*/',
            'union', 
            'cast',
            'xp_',
            ';'
        ];
    
        for (const pattern of forbiddenPatterns) {
            if (lowerClause.includes(pattern)) {
                return false;
            }
        }
    
        return true;
    }
    
    protected getRunTimeViewFieldString(params: RunViewParams, viewEntity: UserViewEntityExtended): string {
        const fieldList = this.getRunTimeViewFieldArray(params, viewEntity);
        // pass this back as a comma separated list, put square brackets around field names to make sure if they are reserved words or have spaces, that they'll still work.
        if (fieldList.length === 0)
            return '*';
        else
            return fieldList.map(f => {
                const asString: string = f.CodeName === f.Name ? '' : ` AS [${f.CodeName}]`;
                return `[${f.Name}]${asString}`;
            }).join(',');
    }

    protected getRunTimeViewFieldArray(params: RunViewParams, viewEntity: UserViewEntityExtended): EntityFieldInfo[] {
        const fieldList: EntityFieldInfo[] = []

        let entityInfo: EntityInfo = null;
        if (viewEntity) {
            entityInfo = viewEntity.ViewEntityInfo;
        }
        else {
            entityInfo = this.Entities.find((e) => e.Name === params.EntityName);
        }
        const pKeyField = entityInfo.PrimaryKey;

        if (params.Fields) {
            // fields provided, if primary key isn't included, add it first
            if (params.Fields.find((f) => f.trim().toLowerCase() === pKeyField.Name.toLowerCase()) === undefined)
                fieldList.push(pKeyField)
            
            // now add the rest of the param.Fields to fields
            params.Fields.forEach((f) => {
                const field = entityInfo.Fields.find((field) => field.Name.trim().toLowerCase() === f.trim().toLowerCase());
                fieldList.push(field);
            });
        }
        else {
            // fields weren't provided by the caller. So, let's do the following
            // * if this is a defined view, using a View Name or View ID, we use the fields that are used wtihin the View and always return the ID
            // * if this is an dynamic view, we return ALL fields in the entity using *
            if (viewEntity) {
                // saved view, figure out it's field list
                viewEntity.Columns.forEach((c) => {
                    if (!c.hidden) // only return the non-hidden fields
                        fieldList.push(c.EntityField);
                });
                if (fieldList.find((f) => f.Name.trim().toLowerCase() === pKeyField.Name.toLowerCase()) === undefined)
                    fieldList.push(pKeyField) // this should never happen, all views should always have primary key in them, but just in case we do this here to ensure it
            }
        }
        return fieldList; // sometimes nothing is in the list and the caller will just use *
    }

    protected async executeSQLForUserViewRunLogging(viewId: number, entityBaseView: string, whereSQL: string, orderBySQL: string, user: UserInfo): Promise<{ executeViewSQL: string, runID: number }> {
        const entityInfo = this.Entities.find((e) => e.BaseView.trim().toLowerCase() === entityBaseView.trim().toLowerCase());
        const sSQL = `
            DECLARE @ViewIDList TABLE ( ID NVARCHAR(255) );
            INSERT INTO @ViewIDList (ID) (SELECT ${entityInfo.PrimaryKey.Name} FROM [${entityInfo.SchemaName}].${entityBaseView} WHERE (${whereSQL}))
            EXEC [${this.MJCoreSchemaName}].spCreateUserViewRunWithDetail(${viewId},${user.Email}, @ViewIDLIst)
            `
        const runIDResult = await this._dataSource.query(sSQL);
        const runID: number = runIDResult[0].UserViewRunID;
        const sRetSQL: string = `SELECT * FROM [${entityInfo.SchemaName}].${entityBaseView} WHERE ${entityInfo.PrimaryKey.Name} IN 
                                    (SELECT RecordID FROM [${this.MJCoreSchemaName}].vwUserViewRunDetails WHERE UserViewRunID=${runID})
                                 ${orderBySQL && orderBySQL.length > 0 ? ' ORDER BY ' + orderBySQL : ''}`
        return { executeViewSQL: sRetSQL, runID: runID };
    }

    protected createViewUserSearchSQL(entityInfo: EntityInfo, userSearchString: string) {
        // we have a user search string. 
        // if we have full text search, we use that.
        // Otherwise, we need to manually construct the additional filter associated with this. The user search string is just text from the user
        // we need to apply it to one or more fields that are part of the entity that support being part of a user search.
        // we need to get the list of fields that are part of the entity that support being part of a user search.

        let sUserSearchSQL = '';
        if (entityInfo.FullTextSearchEnabled) {
            // we have full text search, so we use that, do as subquery but that gets optimized into JOIN by SQL Server, so we can keep our situation logially simpler
            // in the context of overall filtering by doing as a SUBQUERY here.
            
            // if we have a user search string that includes AND, OR, or NOT, we leave it alone
            // otherwise, we check to see if the userSearchString is a single word, if so, we also leave it alone
            // if the userSearchString doesn't have AND OR or NOT in it, and has multiple words, we convert the spaces to
            // AND so that we can do a full text search on all the words
            let u = userSearchString;
            const uUpper = u.toUpperCase();
            if (uUpper.includes('AND') || uUpper.includes('OR') || uUpper.includes('NOT')) {
                // do nothing, leave it alone, this structure is here to make the code easier to read
            }
            else if (u.includes(' ')) {
                if ( u.startsWith('"') && u.endsWith('"') ) {
                    // do nothing because we start AND end with a quote, so we have a phrase search
                }
                else {
                    // we have multiple words, so we need to convert the spaces to AND
                    // but first, let's strip the stopwords out of the string
                    u = StripStopWords(userSearchString);
                    // next, include "AND" between all the words so that we have a full text search on all the words
                    u = u.replace(/ /g, ' AND ');
                }
            }

            sUserSearchSQL = `${entityInfo.PrimaryKey.Name} IN (SELECT ${entityInfo.PrimaryKey.Name} FROM ${entityInfo.SchemaName}.${entityInfo.FullTextSearchFunction}('${u}'))`;            
        }
        else {
            const entityFields = entityInfo.Fields;

            for (const field of entityFields) {
                if (field.IncludeInUserSearchAPI) {
                    let sParam = '';
                    if (sUserSearchSQL.length > 0) 
                        sUserSearchSQL += ' OR ';

                    if (field.UserSearchParamFormatAPI && field.UserSearchParamFormatAPI.length > 0) 
                    // we have a search param format. we need to apply it to the user search string
                        sParam = field.UserSearchParamFormatAPI.replace('{0}', userSearchString);
                    else 
                        sParam = ` LIKE '%${userSearchString}%'`;
                    
                    sUserSearchSQL += `(${field.Name} ${sParam})`;
                }
            }
            if (sUserSearchSQL.length > 0) 
                sUserSearchSQL = '(' + sUserSearchSQL + ')'; // wrap the entire search string in parens
        }


        return sUserSearchSQL;
    }

    
    public async createAuditLogRecord(user: UserInfo, authorizationName: string | null, auditLogTypeName: string, status: string, details: string | null, entityId: number, recordId: any | null, auditLogDescription: string | null): Promise<AuditLogEntity> {
        try {
            const authorization = authorizationName ? this.Authorizations.find((a) => a?.Name?.trim().toLowerCase() === authorizationName.trim().toLowerCase()) : null;
            const auditLogType = auditLogTypeName ? this.AuditLogTypes.find((a) => a?.Name?.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase()) : null;

            if (!user)
                throw new Error(`User is a required parameter`);
            if (!auditLogType)
                throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);

            const auditLog = await this.GetEntityObject<AuditLogEntity>('Audit Logs', user); // must pass user context on back end as we're not authenticated the same way as the front end
            auditLog.NewRecord();
            auditLog.UserID = user.ID;
            auditLog.Set('AuditLogTypeName', auditLogType.Name) // weak typing to get around read-only property
            if (status?.trim().toLowerCase() === 'success')
                auditLog.Status = 'Success'
            else    
                auditLog.Status = 'Failed'

            auditLog.EntityID = entityId;
            auditLog.RecordID = recordId;

            if (authorization)
                auditLog.AuthorizationName = authorization.Name;

            if (details)
                auditLog.Details = details;

            if (auditLogDescription)
                auditLog.Description = auditLogDescription

            if (await auditLog.Save())
                return auditLog;
            else
                throw new Error(`Error saving audit log record`);
        }
        catch (err) {
            LogError(err);
            return null;
        }
    }

    protected CheckUserReadPermissions(entityName: string, contextUser: UserInfo) { 
        const entityInfo = this.Entities.find((e) => e.Name === entityName);
        if (!contextUser) 
            throw new Error(`contextUser is null`);
        
        // first check permissions, the logged in user must have read permissions on the entity to run the view
        if (entityInfo) {
            const userPermissions = entityInfo.GetUserPermisions(contextUser)
            if (!userPermissions.CanRead)
                throw new Error(`User ${contextUser.Email} does not have read permissions on ${entityInfo.Name}`);
        }
        else
            throw new Error(`Entity not found in metadata`);
    }

    /**************************************************************************/
    // END ---- IRunViewProvider
    /**************************************************************************/

    
    /**************************************************************************/
    // START ---- IEntityDataProvider
    /**************************************************************************/
    public get ProviderType(): ProviderType {
        return ProviderType.Database;
    }

    public async GetRecordFavoriteStatus(userId: number, entityName: string, KeyValuePairs: KeyValuePair[]): Promise<boolean> {
        const id = await this.GetRecordFavoriteID(userId, entityName, KeyValuePairs);
        return id !== null;
    }

    public async GetRecordFavoriteID(userId: number, entityName: string, KeyValuePairs: KeyValuePair[]): Promise<number | null> {
        try {
            const sSQL = `SELECT ID FROM [${this.MJCoreSchemaName}].vwUserFavorites WHERE UserID=${userId} AND Entity='${entityName}' AND RecordID='${KeyValuePairs.map(pkv => pkv.Value).join(',')}'`
            const result = await this.ExecuteSQL(sSQL);
            if (result && result.length > 0)
                return result[0].ID;
            else
                return null;
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    public async SetRecordFavoriteStatus(userId: number, entityName: string, KeyValuePairs: KeyValuePair[], isFavorite: boolean, contextUser: UserInfo): Promise<void> {
        try {
            const currentFavoriteId = await this.GetRecordFavoriteID(userId, entityName, KeyValuePairs);
            if ((currentFavoriteId === null && isFavorite === false) ||
                (currentFavoriteId !== null && isFavorite === true)) 
                return; // no change

            // if we're here that means we need to invert the status, which either means creating a record or deleting a record
            const e = this.Entities.find((e) => e.Name === entityName);
            const ufEntity = <UserFavoriteEntity>await this.GetEntityObject('User Favorites', contextUser || this.CurrentUser);
            if (currentFavoriteId !== null) {
                // delete the record since we are setting isFavorite to FALSE
                await ufEntity.Load(currentFavoriteId);
                if (await ufEntity.Delete())
                    return;
                else
                    throw new Error(`Error deleting user favorite`);
            }
            else {
                // create the record since we are setting isFavorite to TRUE
                ufEntity.NewRecord();
                ufEntity.Set('EntityID', e.ID)
                ufEntity.Set('RecordID', KeyValuePairs.map(pkv => pkv.Value).join(',')); // this is a comma separated list of primary key values, which is fine as the primary key is a string
                ufEntity.Set('UserID', userId);
                if(await ufEntity.Save())
                    return;
                else
                    throw new Error(`Error saving user favorite`);    
            }
        }
        catch (e) {
            LogError(e);
            throw (e)
        }        
    }

    public async GetRecordChanges(entityName: string, KeyValuePair: any): Promise<RecordChange[]> {
        try {
            const sSQL = `SELECT * FROM [${this.MJCoreSchemaName}].vwRecordChanges WHERE Entity='${entityName}' AND RecordID='${KeyValuePair}' ORDER BY ChangedAt DESC`
            return this.ExecuteSQL(sSQL)                                      
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
     * @param KeyValuePairs the primary key(s) to check - only send multiple if you have an entity with a composite primary key
     */
    public async GetRecordDependencies(entityName: string, KeyValuePairs: KeyValuePair[]): Promise<RecordDependency[]> {
        try {
            // first, get the entity dependencies for this entity
            const entityDependencies = await this.GetEntityDependencies(entityName);
            // now, we have to construct a query that will return the dependencies for this record
            let sSQL = '';
            for (const entityDependency of entityDependencies) {
                const entityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === entityDependency.EntityName?.trim().toLowerCase());
                const relatedEntityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === entityDependency.RelatedEntityName?.trim().toLowerCase());
                if (sSQL.length > 0)
                    sSQL += ' UNION ALL '
                sSQL += `SELECT 
                            '${entityDependency.EntityName}' AS EntityName, 
                            '${entityDependency.RelatedEntityName}' AS RelatedEntityName, 
                            ${entityInfo.PrimaryKeys.map(pk => pk.Name).join(',')/*Add in all pkeys, often just one, but this handles N primary keys*/}, 
                            '${entityDependency.FieldName}' AS FieldName 
                        FROM 
                            [${relatedEntityInfo.SchemaName}].${relatedEntityInfo.BaseView} 
                        WHERE 
                            ${entityDependency.FieldName} = ${this.GetRecordDependencyLinkSQL(entityDependency, entityInfo, relatedEntityInfo, KeyValuePairs)}`
            }
            // now, execute the query
            const result = await this.ExecuteSQL(sSQL);
            // now we go through the results and create the RecordDependency objects
            const recordDependencies: RecordDependency[] = [];
            for (const r of result) {
                const entityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === r.EntityName?.trim().toLowerCase());
                // future, if we support foreign keys that are composite keys, we'll need to enable this code
                // const pkeyValues: KeyValuePair[] = [];
                // entityInfo.PrimaryKeys.forEach((pk) => {
                //     pkeyValues.push({FieldName: pk.Name, Value: r[pk.Name]}) // add all of the primary keys, which often is as simple as just "ID", but this is generic way to do it
                // })
                
                // for now, we only support foreign keys that are single fields, so we can do this
                const pkVal = r[entityInfo.PrimaryKey.Name];
                const recordDependency: RecordDependency = {
                    EntityName: r.EntityName,
                    RelatedEntityName: r.RelatedEntityName,
                    FieldName: r.FieldName,
                    KeyValuePair: pkVal
                }
                recordDependencies.push(recordDependency);
            }
            return recordDependencies;
        } 
        catch (e) {
            // log and throw
            LogError(e);
            throw (e)
        }
    }

    protected GetRecordDependencyLinkSQL(dep: EntityDependency, entity: EntityInfo, relatedEntity: EntityInfo, KeyValuePairs: KeyValuePair[]): string {
        const f = relatedEntity.Fields.find((f) => f.Name.trim().toLowerCase() === dep.FieldName?.trim().toLowerCase());
        if (!f) 
            throw new Error(`Field ${dep.FieldName} not found in Entity ${relatedEntity.Name}`);

        if (f.RelatedEntityFieldName?.trim().toLowerCase() === 'id')  {
            // simple link to first primary key, most common scenario for linkages
            return KeyValuePairs[0].Value; 
        }
        else {
            // linking to something else, so we need to use that field in a sub-query
            // NOTICE - we are only using the FIRST primary key in our current implementation, this is because we don't yet support composite foreign keys
            // if we do start to support composite foreign keys, we'll need to update this code to handle that
            const quotes = entity.PrimaryKey.NeedsQuotes ? "'" : '';
            return `(SELECT ${f.RelatedEntityFieldName} FROM [${entity.SchemaName}].${entity.BaseView} WHERE ${entity.PrimaryKey.Name}=${quotes}${KeyValuePairs[0].Value}${quotes})`
        }
    }

    public async GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse>
    {
        if(!contextUser){
            throw new Error("User context is required to get record duplicates.");
        }

        const listEntity: ListEntity = await this.GetEntityObject<ListEntity>('Lists');
        listEntity.ContextCurrentUser = contextUser;
        let success = await listEntity.Load(params.ListID);
        if(!success){
            throw new Error(`List with ID ${params.ListID} not found.`);
        }

        let duplicateRun: DuplicateRunEntity = await this.GetEntityObject<DuplicateRunEntity>('Duplicate Runs');
        duplicateRun.NewRecord();
        duplicateRun.EntityID = params.EntityID;
        duplicateRun.StartedByUserID = contextUser.ID;
        duplicateRun.StartedAt = new Date();
        duplicateRun.ProcessingStatus = 'In Progress';
        duplicateRun.ApprovalStatus = 'Pending';
        duplicateRun.SourceListID = listEntity.ID;
        duplicateRun.ContextCurrentUser = contextUser;
        
        const saveResult = await duplicateRun.Save();
        if(!saveResult){
            throw new Error(`Failed to save Duplicate Run Entity`);
        }

        let response: PotentialDuplicateResponse = {
            Status: 'Inprogress',
            PotentialDuplicateResult: []
        };

        return response;
    }

    public async MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo): Promise<RecordMergeResult> {
        const result: RecordMergeResult = {
            Success: false,
            RecordMergeLogID: null,
            RecordStatus: [],
            Request: request,
            OverallStatus: null,
        }  
        const mergeRecordLog: RecordMergeLogEntity = await this.StartMergeLogging(request, result, contextUser);
        try {
            /*
                we will follow this process... 
                * 1. Begin Transaction
                * 2. The surviving record is loaded and fields are updated from the field map, if provided, and the record is saved. If a FieldMap not provided within the request object, this step is skipped.
                * 3. For each of the records that will be merged INTO the surviving record, we call the GetEntityDependencies() method and get a list of all other records in the database are linked to the record to be deleted. We then go through each of those dependencies and update the link to point to the SurvivingRecordID and save the record.
                * 4. The record to be deleted is then deleted.
                * 5. Commit or Rollback Transaction
             */

            // Step 1 - begin transaction
            await this.BeginTransaction();

            // Step 2 - update the surviving record, but only do this if we were provided a field map
            if (request.FieldMap && request.FieldMap.length > 0) {
                const survivor: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser)
                let compositeKey: CompositeKey = new CompositeKey();
                compositeKey.KeyValuePairs = request.SurvivingRecordKeyValuePairs;
                await survivor.InnerLoad(compositeKey);
                for (const fieldMap of request.FieldMap) {
                    survivor.Set(fieldMap.FieldName, fieldMap.Value);
                }
                if (!await survivor.Save()) {
                    result.OverallStatus = 'Error saving survivor record with values from provided field map.'
                    throw new Error(result.OverallStatus);
                }
            }

            // Step 3 - update the dependencies for each of the records we will delete
            for (const pksToDelete of request.RecordsToMerge) {
                const newRecStatus: RecordMergeDetailResult = {
                    KeyValuePairs: pksToDelete,
                    Success: false,
                    RecordMergeDeletionLogID: null,
                    Message: null,
                }
                result.RecordStatus.push(newRecStatus)

                const dependencies = await this.GetRecordDependencies(request.EntityName, pksToDelete);
                // now, loop through the dependencies and update the link to point to the surviving record
                for (const dependency of dependencies) {
                    const reInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === dependency.RelatedEntityName.trim().toLowerCase());
                    const relatedEntity: BaseEntity = await this.GetEntityObject(dependency.RelatedEntityName, contextUser);
                    let reInfoCompositeKey: CompositeKey = new CompositeKey();
                    reInfoCompositeKey.KeyValuePairs = [{FieldName: reInfo.PrimaryKey.Name, Value: dependency.KeyValuePair}];
                    await relatedEntity.InnerLoad(reInfoCompositeKey);
                    relatedEntity.Set(dependency.FieldName, request.SurvivingRecordKeyValuePairs[0].Value); // only support single field foreign keys for now
                    /*
                    if we later support composite foreign keys, we'll need to do this instead, at the moment this code will break as dependency.KeyValuePair is a single value, not an array

                    for (let pkv of dependency.KeyValuePairs) {
                        relatedEntity.Set(dependency.FieldName, pkv.Value);
                    }
                     */
                    if (!await relatedEntity.Save()) {
                        newRecStatus.Success = false;
                        newRecStatus.Message = `Error updating dependency record ${dependency.KeyValuePair.FieldName} : ${dependency.KeyValuePair.Value} for entity ${dependency.RelatedEntityName} to point to surviving record ${request.SurvivingRecordKeyValuePairs[0].Value}`
                        throw new Error(newRecStatus.Message);
                    }
                }
                // if we get here, that means that all of the dependencies were updated successfully, so we can now delete the records to be merged
                const recordToDelete: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser);
                let compositeKey: CompositeKey = new CompositeKey();
                compositeKey.KeyValuePairs = pksToDelete;
                await recordToDelete.InnerLoad(compositeKey);
                if (!await recordToDelete.Delete()) {
                    newRecStatus.Message = `Error deleting record ${compositeKey.ToString()} for entity ${request.EntityName}`;
                    throw new Error(newRecStatus.Message);
                }
                else 
                    newRecStatus.Success = true;
            }

            result.Success = true;
            await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);

            // Step 5 - commit transaction
            await this.CommitTransaction();

            result.Success = true;

            return result;
        }
        catch (e) {
            LogError(e);

            await this.RollbackTransaction();
            // attempt to persist the status to the DB, although that might fail
            await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);
            throw (e)
        }
    }
    

    protected async StartMergeLogging(request: RecordMergeRequest, result: RecordMergeResult, contextUser: UserInfo): Promise<RecordMergeLogEntity> {
        try {
            // create records in the Record Merge Logs entity and Record Merge Deletion Logs entity
            const recordMergeLog = <RecordMergeLogEntity>await this.GetEntityObject('Record Merge Logs', contextUser);
            const entity = this.Entities.find((e) => e.Name === request.EntityName);
            if (!entity)
                throw new Error(`Entity ${result.Request.EntityName} not found in metadata`);
            if (!contextUser && !this.CurrentUser)
                throw new Error(`contextUser is null and no CurrentUser is set`);

            recordMergeLog.NewRecord();
            recordMergeLog.EntityID = entity.ID;
            recordMergeLog.SurvivingRecordID = request.SurvivingRecordKeyValuePairs.map(pk => pk.Value).join(','); // this would join together all of the primary key values, which is fine as the primary key is a string    
            recordMergeLog.InitiatedByUserID = contextUser ? contextUser.ID : this.CurrentUser?.ID;
            recordMergeLog.ApprovalStatus = 'Approved';
            recordMergeLog.ApprovedByUserID = contextUser ? contextUser.ID : this.CurrentUser?.ID;
            recordMergeLog.ProcessingStatus = 'Started'
            recordMergeLog.ProcessingStartedAt = new Date();
            if (await recordMergeLog.Save()) {
                result.RecordMergeLogID = recordMergeLog.ID;
                return recordMergeLog;
            }
            else
                throw new Error(`Error saving record merge log`);
        }
        catch (e) {
            LogError(e);
            throw (e)
        }
    }

    protected async CompleteMergeLogging(recordMergeLog: RecordMergeLogEntity, result: RecordMergeResult, contextUser?: UserInfo) {
        try {
            // create records in the Record Merge Logs entity and Record Merge Deletion Logs entity
            if (!contextUser && !this.CurrentUser)
                throw new Error(`contextUser is null and no CurrentUser is set`);

            recordMergeLog.ProcessingStatus = result.Success ? 'Complete' : 'Error'
            recordMergeLog.ProcessingEndedAt = new Date();
            if (!result.Success) // only create the log record if the merge failed, otherwise it is wasted space
                recordMergeLog.ProcessingLog = result.OverallStatus  
            if (await recordMergeLog.Save()) {
                // top level saved, now let's create the deletion detail records for each of the records that were merged
                for (const d of result.RecordStatus) {
                    const recordMergeDeletionLog = <RecordMergeDeletionLogEntity>await this.GetEntityObject('Record Merge Deletion Logs', contextUser);
                    recordMergeDeletionLog.NewRecord();
                    recordMergeDeletionLog.RecordMergeLogID = recordMergeLog.ID;
                    recordMergeDeletionLog.DeletedRecordID = d.KeyValuePairs.map(pk => pk.Value).join(','); // this would join together all of the primary key values, which is fine as the primary key is a string
                    recordMergeDeletionLog.Status = d.Success ? 'Complete' : 'Error';
                    recordMergeDeletionLog.ProcessingLog = d.Success ? null : d.Message; // only save the message if it failed
                    if (!await recordMergeDeletionLog.Save())
                        throw new Error(`Error saving record merge deletion log`);
                }
            }
            else
                throw new Error(`Error saving record merge log`);
        }
        catch (e)  {
            // do nothing here because we often will get here since some conditions lead to no DB updates possible...
            LogError(e)
            // don't bubble up the error here as we're sometimes already in an exception block in caller
        }
    }

    protected GetSaveSQL(entity: BaseEntity, bNewRecord: boolean, spName: string, user: UserInfo): string {
        const sSimpleSQL: string = `EXEC [${entity.EntityInfo.SchemaName}].${spName} ${this.generateSPParams(entity, !bNewRecord)}`;
        const recordChangesEntityInfo = this.Entities.find(e => e.Name === 'Record Changes');
        let sSQL: string = '';
        if (entity.EntityInfo.TrackRecordChanges) {
            let oldData = null;

            if (!bNewRecord) 
                oldData = entity.GetAll(true); // get all the OLD values, only do for existing records, for new records, not relevant
            
            sSQL = `
                    DECLARE @ResultTable TABLE (
                        ${this.getAllEntityColumnsSQL(entity.EntityInfo)}
                    )

                    INSERT INTO @ResultTable
                    ${sSimpleSQL}

                    DECLARE @ID NVARCHAR(255)
                    SELECT @ID = ${entity.PrimaryKey.Name} FROM @ResultTable
                    IF @ID IS NOT NULL 
                    BEGIN
                        DECLARE @ResultChangesTable TABLE (
                            ${this.getAllEntityColumnsSQL(recordChangesEntityInfo)}                            
                        )                              

                        INSERT INTO @ResultChangesTable
                        ${this.GetLogRecordChangeSQL(entity.GetAll(false), oldData, entity.EntityInfo.Name, '@ID', entity.EntityInfo, user, false)}
                    END

                    SELECT * FROM @ResultTable`
        }  
        else {
            // not doing track changes for this entity, keep it simple
            sSQL = sSimpleSQL;
       }
        return sSQL;
    }

    protected GetEntityAIActions(entityInfo: EntityInfo, before: boolean): any {
        return AIEngine.EntityAIActions.filter((a) => a.EntityID === entityInfo.ID && 
                                                      a.TriggerEvent.toLowerCase().trim() === (before ? 'before save' : 'after save'));
    }

    protected async HandleEntityAIActions(entity: BaseEntity, before: boolean, user: UserInfo) {
        // Make sure AI Metadata is loaded here...
        await AIEngine.LoadAIMetadata(user);
        
        const actions = this.GetEntityAIActions(entity.EntityInfo, before); // get the actions we need to do for this entity
        if (actions && actions.length > 0) {
            const ai = new AIEngine();
            for (let i = 0; i < actions.length; i++) {
                const a = actions[i];
                const p: EntityAIActionParams = {
                    entityAIActionId: a.ID,
                    entityRecord: entity,
                    actionId: a.AIActionID,
                    modelId: a.AIModelID
                }
                if (before) {
                    // do it with await so we're blocking, as it needs to complete before the record save continues
                    await ai.ExecuteEntityAIAction(p)
                }
                else {
                    // just add a task and move on, we are doing 'after save' so we don't wait
                    try {
                        QueueManager.AddTask('Entity AI Action', p, null, user);
                    }
                    catch (e) {
                        LogError(e.message);
                    }
                }

            }
        }
    }

    public async Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions) : Promise<{}> {
        try {
            const pkeyName = entity.PrimaryKey.Name;
            const pkeyVal = entity.PrimaryKey.Value;
            if (pkeyVal && !entity.EntityInfo.AllowUpdateAPI) {
                // existing record and not allowed to update
                throw new Error(`UPDATE not allowed for entity ${entity.EntityInfo.Name}`);
            }
            else if ( (!pkeyVal) && !entity.EntityInfo.AllowCreateAPI) {
                // new record and not allowed to create
                throw new Error(`CREATE not allowed for entity ${entity.EntityInfo.Name}`);
            }
            else { 
                // getting here means we are good to save, now check to see if we're dirty and need to save
                // REMEMBER - this is the provider and the BaseEntity/subclasses handle user-level permission checking already, we just make sure API was turned on for the operation
                if ( entity.Dirty || (options && options.IgnoreDirtyState) ) {
                    const bNewRecord = pkeyVal ? false : true;
                    const spName = bNewRecord ? (entity.EntityInfo.spCreate && entity.EntityInfo.spCreate.length > 0 ? entity.EntityInfo.spCreate : 'spCreate' + entity.EntityInfo.BaseTable) : 
                                                (entity.EntityInfo.spUpdate && entity.EntityInfo.spUpdate.length > 0 ? entity.EntityInfo.spUpdate : 'spUpdate' + entity.EntityInfo.BaseTable);

                    if (!options /*no options set*/ || 
                         options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/ ) {
                        // process any Entity AI actions that are set to trigger BEFORE the save, these are generally a really bad idea to do before save
                        // but they are supported (for now)
                        await this.HandleEntityAIActions(entity, true, user);
                    }

                    const sSQL = this.GetSaveSQL(entity, bNewRecord, spName, user);

                    if (entity.TransactionGroup) {
                        // we have a transaction group, need to play nice and be part of it
                        return new Promise((resolve, reject) => {
                            // we are part of a transaction group, so just add our query to the list
                            // and when the transaction is committed, we will send all the queries at once
                            this._bAllowRefresh = false; // stop refreshes of metadata while we're doing work
                            entity.TransactionGroup.AddTransaction(new TransactionItem(sSQL, null, {dataSource: this._dataSource}, (results: any, success: boolean) => {
                                // we get here whenever the transaction group does gets around to committing
                                // our query.  
                                this._bAllowRefresh = true; // allow refreshes again
                                if (success && results)  {
                                    // process any Entity AI actions that are set to trigger AFTER the save
                                    // these are fired off but are NOT part of the transaction group, so if they fail,
                                    // the transaction group will still commit, but the AI action will not be executed
                                    if (!options /*no options set*/ || 
                                        options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/ ) 
                                        this.HandleEntityAIActions(entity, false, user);
    
                                    resolve (results[0])
                                }
                                else
                                    // the transaction failed, nothing to update, but we need to call Reject so the 
                                    // promise resolves with a rejection so our outer caller knows
                                    reject(results);
                            }));
                        });                        
                    }
                    else {
                        // no transaction group, just execute this immediately...
                        this._bAllowRefresh = false; // stop refreshes of metadata while we're doing work

                        const result = await this.ExecuteSQL(sSQL);

                        this._bAllowRefresh = true; // allow refreshes now

                        if (result && result.length > 0) {
                            if (!options /*no options set*/ || 
                                 options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/ ) 
                                this.HandleEntityAIActions(entity, false, user); // fire off any AFTER SAVE AI actions, but don't wait for them

                            return result[0]; 
                        }
                        else
                            throw new Error(`SQL Error: No result row returned from SQL: ` + sSQL);
                    }
                }
                else
                    return entity; // nothing to save, just return the entity
            }
        }
        catch (e) {
            this._bAllowRefresh = true; // allow refreshes again if we get a failure here
            LogError(e);
            throw e; // rethrow the error
        }
    }

    private getAllEntityColumnsSQL(entityInfo: EntityInfo): string {
        let sRet: string = '', outputCount: number = 0;
        for (let i = 0; i < entityInfo.Fields.length; i++) {
            const f = entityInfo.Fields[i];
            if (outputCount !== 0)
                sRet += ',\n';
            sRet += '[' + f.Name + '] ' + f.SQLFullType + ' ' + (f.AllowsNull ? 'NULL' : 'NOT NULL');
            outputCount++;
        }
        return sRet;
    }

    private generateSPParams(entity: BaseEntity, isUpdate: boolean): string {
        let sRet: string = '', bFirst: boolean = true;
        for (let i = 0; i < entity.EntityInfo.Fields.length; i++) {
            const f = entity.EntityInfo.Fields[i];
            if (f.AllowUpdateAPI) {
                if (!f.SkipValidation) {
                    // DO NOT INCLUDE any fields where we skip validation, these are fields that are not editable by the user/object 
                    // model/api because they're special fields like ID, CreatedAt, etc. or they're virtual or auto-increment, etc.
                    let value = entity.Get(f.Name)
                    if (f.Type.trim().toLowerCase() === 'datetimeoffset') {
                        value = new Date(value).toISOString();
                    }
                    sRet += this.generateSingleSPParam(f, value, bFirst);
                    bFirst = false;
                }
            }
        }
        if (isUpdate && bFirst === false) {
            // this is an update and we have other fields, so we need to add all of the pkeys to the end of the SP call
            for (let pkey of entity.PrimaryKeys) {
                const pkeyQuotes = pkey.NeedsQuotes ? "'" : '';
                sRet += `, @${pkey.CodeName} = ` + pkeyQuotes + pkey.Value + pkeyQuotes  // add pkey to update SP at end, but only if other fields included
            }
            bFirst = false;
        }

        return sRet;
    }
    
    private generateSingleSPParam(f: EntityFieldInfo, value: string, isFirst: boolean): string {
        let sRet: string = '';
        let quotes: string = '';
        let val: any = value;

        switch  ( f.TSType ) {
            case EntityFieldTSType.String:
                quotes = "'";
                break;
            case EntityFieldTSType.Date:
                quotes = "'";
                if (val !== null && val !== undefined) {
                    if (typeof val === 'number' ) {
                        // we have a timestamp - milliseconds since Unix Epoch
                        // convert to a date
                        val = new Date(val);
                    }
                    else if (typeof val === 'string' ) {
                        // we have a string, attempt to convert it to a date object
                        val = new Date(val);
                    }
                    val = val.toISOString(); // convert the date to ISO format for storage in the DB
                }
                break;
            default:
                break;
        }
        if (!isFirst) 
            sRet += ',\n                ';
    
        sRet += `@${f.CodeName}=${this.packageSPParam(val, quotes)}`
    
        return sRet;
    }

    protected packageSPParam(paramValue: any, quoteString: string) {
        let pVal: any;
        if (typeof paramValue === 'string') {
            if (quoteString == "'")
                pVal = paramValue.toString().replace(/'/g, "''");
            else if (quoteString == '"')
                pVal = paramValue.toString().replace(/"/g, '""');
            else
                pVal = paramValue;
        }
        else
            pVal = paramValue;

        return (paramValue === null || paramValue === undefined) ? "NULL" : quoteString + pVal + quoteString
    }
    
    protected GetLogRecordChangeSQL(newData: any, oldData: any, entityName: string, recordID: any, entityInfo: EntityInfo, user: UserInfo, wrapRecordIdInQuotes: boolean) {
        const fullRecordJSON: string = JSON.stringify(this.escapeQuotesInProperties(newData ? newData : oldData, "'")); // stringify old data if we don't have new - means we are DELETING A RECORD
        const changes: any = this.DiffObjects(oldData, newData, entityInfo, "'");
        const changesKeys = changes ? Object.keys(changes) : [];
        if (changesKeys.length > 0 || oldData === null /*new record*/ || newData === null /*deleted record*/) {
            const changesJSON: string = changes !== null ? JSON.stringify(changes) : '';
            const quotes = wrapRecordIdInQuotes ? "'" : '';
            const sSQL = `EXEC [${this.MJCoreSchemaName}].spCreateRecordChange @EntityName='${entityName}', 
                                                                               @RecordID=${quotes}${recordID}${quotes}, 
                                                                               @UserID=${user.ID},
                                                                               @ChangesJSON='${changesJSON}', 
                                                                               @ChangesDescription='${oldData && newData ? this.CreateUserDescription(changes) : !oldData ? 'Record Created' : 'Record Deleted'}', 
                                                                               @FullRecordJSON='${fullRecordJSON}', 
                                                                               @Status='Complete', 
                                                                               @Comments=null`
            return sSQL;                                    
        }
        else
            return null;
    }
    protected async LogRecordChange(newData: any, oldData: any, entityName: string, recordID: any, entityInfo: EntityInfo, user: UserInfo) {
        const sSQL = this.GetLogRecordChangeSQL(newData, oldData, entityName, recordID, entityInfo, user, true);
        if (sSQL) {
            const result = await this.ExecuteSQL(sSQL);
            return result;
        }
    }
    protected CreateUserDescription(changesObject: any, maxValueLength: number = 200): string {
        let sRet = '';
        let keys = Object.keys(changesObject);
        for (let i = 0; i < keys.length; i++) {
            const change = changesObject[keys[i]];
            if (sRet.length > 0) {
                sRet += '\n';
            }
            if (change.oldValue && change.newValue) // both old and new values set, show change
                sRet += `${change.field} changed from ${this.trimString(change.oldValue, maxValueLength, '...')} to ${this.trimString(change.newValue, maxValueLength, '...')}`
            else if (change.newValue) // old value was blank, new value isn't
                sRet += `${change.field} set to ${this.trimString(change.newValue, maxValueLength, '...')}`
            else if (change.oldValue) // new value is blank, old value wasn't
                sRet += `${change.field} cleared from ${this.trimString(change.oldValue, maxValueLength, '...')}`

        }
        return sRet.replace(/'/g, "''")
    }

    protected trimString(value: any, maxLength: number, trailingChars: string) {
        if (value && typeof value === 'string' && value.length > maxLength) {
            value = value.substring(0, maxLength) + trailingChars;
        }
        return value;
    }

    protected escapeQuotesInProperties(obj: any, quoteToEscape: string): any {
        const sRet: any = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const element = obj[key];
                if (typeof element === 'string') {
                    const reg = new RegExp(quoteToEscape, 'g');
                    sRet[key] = element.replace(reg, quoteToEscape + quoteToEscape);
                }
                else
                    sRet[key] = element;
            }
        }
        return sRet;
    }
    protected DiffObjects(oldData: any, newData: any, entityInfo: EntityInfo, quoteToEscape: string): any {
        if (!oldData || !newData)
            return null;
        else {
            const changes: any = {};
            for (const key in newData) {
                const f = entityInfo.Fields.find(f => f.Name.toLowerCase() === key.toLowerCase());
                let bDiff: boolean = false;
                if (f.ReadOnly)
                    bDiff = false; // read only fields are never different, they can change in the database, but we don't consider them to be a change for record changes purposes.
                else if ((oldData[key] == undefined || oldData[key] == null) && 
                    (newData[key] == undefined || newData[key] == null))
                    bDiff = false; // this branch of logic ensures that undefined and null are treated the same
                else {
                    switch (f.TSType) {
                        case EntityFieldTSType.String:
                            bDiff = oldData[key] !== newData[key];
                            break;
                        case EntityFieldTSType.Date:
                            bDiff = (new Date(oldData[key]).getTime() !== new Date(newData[key]).getTime()); 
                            break;
                        case EntityFieldTSType.Number:
                        case EntityFieldTSType.Boolean:
                            bDiff = oldData[key] !== newData[key];
                            break;
                    }
                }
                if (bDiff) {
                    // make sure we escape things properly
                    const r = new RegExp(quoteToEscape, 'g');
                    const o = (oldData[key] && typeof oldData[key] === 'string') ? 
                                    oldData[key].replace(r, quoteToEscape + quoteToEscape) : oldData[key];
                    const n = (newData[key] && typeof newData[key] === 'string') ? 
                                    newData[key].replace(r, quoteToEscape + quoteToEscape) : newData[key];

                    changes[key] = {
                        field: key,
                        oldValue: o,
                        newValue: n
                    };
                }
            }

            return changes;
        }
    }
    

    public async Load(entity: BaseEntity, KeyValuePairs: KeyValuePair[], EntityRelationshipsToLoad: string[] = null, user: UserInfo) : Promise<{}> {
        const where = KeyValuePairs.map((val) => {
            const pk = entity.EntityInfo.PrimaryKeys.find((pk) => pk.Name.trim().toLowerCase() === val.FieldName.trim().toLowerCase());
            if (!pk)
                throw new Error(`Primary key ${val.FieldName} not found in entity ${entity.EntityInfo.Name}`);
            const quotes = pk.NeedsQuotes ? "'" : '';
            return `[${pk.CodeName}]=${quotes}${val.Value}${quotes}`
        }).join(' AND ');
 
        const sql = `SELECT * FROM [${entity.EntityInfo.SchemaName}].${entity.EntityInfo.BaseView} WHERE ${where}`
        const d = await this.ExecuteSQL(sql);
        if (d && d.length > 0) {
            // got the record, now process the relationships if there are any
            const ret = d[0];
            if (EntityRelationshipsToLoad && EntityRelationshipsToLoad.length > 0) {
                for (let i = 0; i < EntityRelationshipsToLoad.length; i++) {
                    const rel = EntityRelationshipsToLoad[i];
                    const relInfo = entity.EntityInfo.RelatedEntities.find(r => r.RelatedEntity == rel);
                    if (relInfo) {
                        let relSql: string = '';
                        const relEntitySchemaName = this.Entities.find(e => e.Name.trim().toLowerCase() === relInfo.RelatedEntity.trim().toLowerCase())?.SchemaName;
                        const quotes = entity.PrimaryKey.NeedsQuotes ? "'" : '';
                        if (relInfo.Type.trim().toLowerCase() === 'one to many') 
                            // one to many - simple query
                            relSql = `  SELECT 
                                            * 
                                        FROM 
                                            [${relEntitySchemaName}].[${relInfo.RelatedEntityBaseView}] 
                                        WHERE 
                                            [${relInfo.RelatedEntityJoinField}] = ${quotes}${ret[entity.PrimaryKey.Name]}${quotes}` // don't yet support composite foreign keys
                        else 
                            // many to many - need to use join view
                            relSql = `  SELECT 
                                            _theview.* 
                                        FROM 
                                            [${relEntitySchemaName}].[${relInfo.RelatedEntityBaseView}] _theview 
                                        INNER JOIN 
                                            [${relEntitySchemaName}].[${relInfo.JoinView}] _jv ON _theview.[${relInfo.RelatedEntityJoinField}] = _jv.[${relInfo.JoinEntityInverseJoinField}] 
                                        WHERE 
                                            _jv.${relInfo.JoinEntityJoinField} = ${quotes}${ret[entity.PrimaryKey.Name]}${quotes}` // don't yet support composite foreign keys
                        
                        const relData = await this.ExecuteSQL(relSql);
                        if (relData && relData.length > 0) {
                            ret[rel] = relData;
                        }
                    }
                }
            }
            return ret;
        }
        // if we get here, something didn't go right
        return null;
    }

    protected GetDeleteSQL(entity: BaseEntity, user: UserInfo) : string {
        let sSQL: string = '';
        const spName: string = entity.EntityInfo.spDelete ? entity.EntityInfo.spDelete : `spDelete${entity.EntityInfo.ClassName}`;
        const sParams = entity.PrimaryKeys.map((pk) => {
            const quotes = pk.NeedsQuotes ? "'" : '';
            return `@${pk.CodeName}=${quotes}${pk.Value}${quotes}`
        }).join(', ');
        const sSimpleSQL: string = `EXEC [${entity.EntityInfo.SchemaName}].[${spName}] ${sParams}`;
        const recordChangesEntityInfo = this.Entities.find(e => e.Name === 'Record Changes');

        if (entity.EntityInfo.TrackRecordChanges) {
            const oldData = entity.GetAll(true); // get all the OLD values
            const sTableDeclare: string = entity.PrimaryKeys.map((pk) => {
                return `${pk.CodeName} ${pk.EntityFieldInfo.SQLFullType}`
            }).join(', ');
            const sVariableDeclare: string = entity.PrimaryKeys.map((pk) => {
                return `@${pk.CodeName} ${pk.EntityFieldInfo.SQLFullType}`
            }).join(', ');
            const sSelectDeclare: string = entity.PrimaryKeys.map((pk) => {
                return `@${pk.CodeName}=${pk.CodeName}` 
            }).join(', ');
            const sIF: string = entity.PrimaryKeys.map((pk) => {
                return `@${pk.CodeName} IS NOT NULL` 
            }).join(' AND ');
            const sCombinedPrimaryKey: string = entity.PrimaryKeys.map((pk) => pk.Value).join(',');
            const sReturnList: string = entity.PrimaryKeys.map((pk) => {
                return `@${pk.CodeName} AS [${pk.Name}]` 
            }).join(', ');
            sSQL = `
                    IF OBJECT_ID('tempdb..#ResultTable') IS NOT NULL
                        DROP TABLE #ResultTable

                    DECLARE @ResultTable TABLE (
                        ${sTableDeclare}
                    )

                    INSERT INTO @ResultTable
                    ${sSimpleSQL}

                    DECLARE ${sVariableDeclare}
                    SELECT ${sSelectDeclare} FROM @ResultTable
                    IF ${sIF} 
                    BEGIN
                        DECLARE @ResultChangesTable TABLE (
                            ${this.getAllEntityColumnsSQL(recordChangesEntityInfo)}                            
                        )                              

                        INSERT INTO @ResultChangesTable
                        ${this.GetLogRecordChangeSQL(null /*pass in null for new data for deleted records*/, oldData, entity.EntityInfo.Name, sCombinedPrimaryKey, entity.EntityInfo, user, true)}
                    END

                    SELECT ${sReturnList}`;
        }
        else {
            // no record change tracking
            // just delete the record
            sSQL = sSimpleSQL;
        }
        return sSQL;
    }

    public async Delete(entity: BaseEntity, user: UserInfo) : Promise<boolean> {
        try {
            if (!entity.PrimaryKey?.Value)
                // existing record and not allowed to update
                throw new Error(`Delete() isn't callable for records that haven't yet been saved - ${entity.EntityInfo.Name}`);
            if (!entity.EntityInfo.AllowDeleteAPI) 
                // not allowed to delete
                throw new Error(`Delete() isn't callable for ${entity.EntityInfo.Name} as AllowDeleteAPI is false`);

            // REMEMBER - this is the provider and the BaseEntity/subclasses handle user-level permission checking already, we just make sure API was turned on for the operation
            // if we get here we can delete, so build the SQL and then handle appropriately either as part of TransGroup or directly...

            const sSQL = this.GetDeleteSQL(entity, user);
       
            if (entity.TransactionGroup) {
                // we have a transaction group, need to play nice and be part of it
                return new Promise((resolve, reject) => {
                    // we are part of a transaction group, so just add our query to the list
                    // and when the transaction is committed, we will send all the queries at once
                    entity.TransactionGroup.AddTransaction(new TransactionItem(sSQL, null, {dataSource: this._dataSource}, (results: any, success: boolean) => {
                        // we get here whenever the transaction group does gets around to committing
                        // our query.  
                        if (success && results) 
                            resolve (entity.PrimaryKey.Value === results[0][entity.PrimaryKey.Name])
                        else 
                            // the transaction failed, nothing to update, but we need to call Reject so the 
                            // promise resolves with a rejection so our outer caller knows
                            reject(results);
                    }));
                });    
            }
            else {
                return this._dataSource.transaction(async () => {
                    const d = await this.ExecuteSQL(sSQL);
    
                    if (d && d[0]) {
                        // SP executed, now make sure the return value matches up as that is how we know the SP was succesfully internally
                        for (let key of entity.PrimaryKeys) {
                            if (key.Value !== d[0][key.Name]) 
                                return false;
                        }
                        return true
                    }
                    else
                        return false;
                });
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
        const sSQL = `SELECT 
                        d.ID DatasetID,
                        di.*,
                        e.BaseView EntityBaseView,
                        e.SchemaName EntitySchemaName
                    FROM 
                        [${this.MJCoreSchemaName}].vwDatasets d 
                    INNER JOIN 
                        [${this.MJCoreSchemaName}].vwDatasetItems di 
                    ON
                        d.Name = di.DatasetName
                    INNER JOIN 
                        [${this.MJCoreSchemaName}].vwEntities e 
                    ON
                        di.EntityID = e.ID
                    WHERE 
                        d.Name = @0`;

        const items = await this.ExecuteSQL(sSQL, [datasetName]);
        // now we have the dataset and the items, we need to get the update date from the items underlying entities

        if (items && items.length > 0) {
            // loop through each of the items and get the data from the underlying entity
            const results = [];
            let bSuccess: boolean = true;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                let filterSQL = '';
                if (itemFilters && itemFilters.length > 0) {
                    const filter = itemFilters.find(f => f.ItemCode === item.Code);
                    if (filter) 
                        filterSQL = (item.WhereClause ? ' AND ' : ' WHERE ') + '(' + filter.Filter + ')';
                }

                const itemSQL = `SELECT * FROM [${item.EntitySchemaName}].[${item.EntityBaseView}] ${item.WhereClause ? 'WHERE ' + item.WhereClause : ''}${filterSQL}`
                const itemData = await this.ExecuteSQL(itemSQL);
                results.push({
                    EntityID: item.EntityID, 
                    EntityName: item.Entity, 
                    Code: item.Code,
                    Results: itemData
                });
                if (itemData === null || itemData === undefined) 
                    bSuccess = false; // previously we returned false here if we had zero length in itemData.length, but that is not correct, we can have zero length and still be successful
            }

            const status = await this.GetDatasetStatusByName(datasetName);

            return {
                DatasetID: items[0].DatasetID,
                DatasetName: items[0].DatasetName,
                Success: bSuccess,
                Status: '',
                LatestUpdateDate: status.LatestUpdateDate,
                Results: results
            }
        }
        else {
            return { 
                DatasetID: 0,
                DatasetName: '',
                Success: false,
                Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
                LatestUpdateDate: null, 
                Results: null,
            }                                
        }
    }
    public async GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetStatusResultType> {
        const sSQL = `
            SELECT 
                d.ID DatasetID,
                di.*,
                e.BaseView EntityBaseView,
                e.SchemaName EntitySchemaName 
            FROM 
                [${this.MJCoreSchemaName}].vwDatasets d 
            INNER JOIN 
                [${this.MJCoreSchemaName}].vwDatasetItems di 
            ON
                d.Name = di.DatasetName
            INNER JOIN
                [${this.MJCoreSchemaName}].vwEntities e
            ON
                di.EntityID = e.ID
            WHERE 
                d.Name = @0`;

        const items = await this.ExecuteSQL(sSQL, [datasetName]);
        // now we have the dataset and the items, we need to get the update date from the items underlying entities

        if (items && items.length > 0) {
            // loop through each of the items and get the update date from the underlying entity
            const updateDates: DatasetStatusEntityUpdateDateType[] = [];
            let latestUpdateDate = new Date(1900, 1, 1);
            let bSuccess: boolean = true;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                let filterSQL = '';
                if (itemFilters && itemFilters.length > 0) {
                    const filter = itemFilters.find(f => f.ItemCode === item.Code);
                    if (filter) 
                        filterSQL = ' WHERE ' + filter.Filter;
                }
                const itemSQL = `SELECT MAX(${item.DateFieldToCheck}) AS UpdateDate FROM [${item.EntitySchemaName}].[${item.EntityBaseView}]${filterSQL}`
                const itemUpdateDate = await this.ExecuteSQL(itemSQL);
                if (itemUpdateDate && itemUpdateDate.length > 0) {
                    const updateDate = itemUpdateDate[0].UpdateDate;
                    updateDates.push({
                        EntityID: item.EntityID, 
                        EntityName: item.Entity, 
                        UpdateDate: updateDate
                    });

                    if (updateDate > latestUpdateDate)
                        latestUpdateDate = updateDate;    
                }
            }

            // at the end of the loop we have the latest update date for the dataset, package it up with the individual entity update dates
            return {
                DatasetID: items[0].DatasetID,
                DatasetName: items[0].DatasetName,
                Success: bSuccess,
                Status: '',
                LatestUpdateDate: latestUpdateDate,
                EntityUpdateDates: updateDates
            }
        }
        else {
            return { 
                DatasetID: 0,
                DatasetName: '',
                Success: false,
                Status: 'No Dataset or Items found for DatasetName: ' + datasetName, 
                EntityUpdateDates: null,
                LatestUpdateDate: null
            }
        }
    }
     
    protected async GetApplicationMetadata(): Promise<ApplicationInfo[]> {
        const apps = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwApplications`, null);
        const appEntities = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwApplicationEntities ORDER BY ApplicationName`)
        const ret: ApplicationInfo[] = [];
        for (let i = 0; i < apps.length; i++) {
            ret.push (new ApplicationInfo(this, 
                {
                    ...apps[i],
                    ApplicationEntities: appEntities.filter (ae => ae.ApplicationName.trim().toLowerCase() === apps[i].Name.trim().toLowerCase())
                }
            ));
        }
        return ret;
    }

    protected async GetAuditLogTypeMetadata(): Promise<AuditLogTypeInfo[]> {
        const alts = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuditLogTypes`, null);
        const ret: AuditLogTypeInfo[] = [];
        for (let i = 0; i < alts.length; i++) {
            const alt = new AuditLogTypeInfo(alts[i])
            ret.push(alt);
        }
        return ret;
    }

    protected async GetUserMetadata(): Promise<UserInfo[]> {
        const users = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUsers`, null);
        const userRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUserRoles ORDER BY UserID`)
        const ret: UserInfo[] = [];
        for (let i = 0; i < users.length; i++) {
            ret.push (new UserInfo(this, 
                {
                    ...users[i],
                    UserRoles: userRoles.filter (ur => ur.UserID === users[i].ID)
                }
            ));
        }
        return ret;
    }

    protected async GetAuthorizationMetadata(): Promise<AuthorizationInfo[]> {
        const auths = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuthorizations`, null);
        const authRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuthorizationRoles ORDER BY AuthorizationName`)
        const ret: AuthorizationInfo[] = [];
        for (let i = 0; i < auths.length; i++) {
            ret.push (new AuthorizationInfo(this, 
                {
                    ...auths[i],
                    AuthorizationRoles: authRoles.filter (ar => ar.AuthorizationName.trim().toLowerCase() === auths[i].Name.trim().toLowerCase())
                }
            ));
        }
        return ret;
    }

    protected async GetCurrentUser(): Promise<UserInfo> {
        if (this.CurrentUser)
            return this.CurrentUser
        else if (this._currentUserEmail && this._currentUserEmail.length > 0) {
            // attempt to lookup current user from email since this.CurrentUser is null for some reason (unexpected)
            if (UserCache && UserCache.Users)
                return UserCache.Users.find(u => u.Email.trim().toLowerCase() === this._currentUserEmail.trim().toLowerCase())
        }
        // if we get here we can't get the current user
        return null;    
    }

    protected async GetCurrentUserMetadata(): Promise<UserInfo> {
        const user = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUsers WHERE Email='${this._currentUserEmail}'`);
        if (user && user.length === 1) {
            const userRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUserRoles WHERE UserID=${user[0].ID}`)
            return new UserInfo(this, 
                {
                    ...user[0],
                    UserRoles: userRoles ? userRoles : []
                }
            );
        }
        else
            return null;                
    }

    protected async GetRoleMetadata(): Promise<RoleInfo[]> {
        const roles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwRoles`, null);
        const ret: RoleInfo[] = [];
        for (let i = 0; i < roles.length; i++) {
            const ri = new RoleInfo(roles[i])
            ret.push(ri);
        }
        return ret;
    }

    protected async GetUserRoleMetadata(): Promise<UserRoleInfo[]> {
        const userRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUserRoles`, null);
        const ret: UserRoleInfo[] = [];
        for (let i = 0; i < userRoles.length; i++) {
            const uri = new UserRoleInfo(userRoles[i])
            ret.push(uri);
        }
        return ret;
    }

    protected async GetRowLevelSecurityFilterMetadata(): Promise<RowLevelSecurityFilterInfo[]> {
        const filters = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwRowLevelSecurityFilters`, null);
        const ret: RowLevelSecurityFilterInfo[] = [];
        for (let i = 0; i < filters.length; i++) {
            const rlsfi = new RowLevelSecurityFilterInfo(filters[i])
            ret.push(rlsfi);
        }
        return ret;
    }


    protected async ExecuteSQL(query: string, parameters: any = null): Promise<any> {
        try {
            if (this._queryRunner) {
                const data = await this._queryRunner.query(query, parameters);
                return data;
            }
            else {
                const data = await this._dataSource.query(query, parameters);
                return data;
            }
        }
        catch (e) {
            LogError(e);
            throw e; // force caller to handle
        }
    }

    protected async BeginTransaction() {
        try {
            if (!this._queryRunner)
            this._queryRunner = this._dataSource.createQueryRunner();

            await this._queryRunner.startTransaction();
        }
        catch (e) {
            LogError(e);
            throw e; // force caller to handle
        }
    }

    protected async CommitTransaction() {
        try {
            await this._queryRunner.commitTransaction();
        }
        catch (e) {
            LogError(e);
            throw e; // force caller to handle
        }
    }

    protected async RollbackTransaction() {
        try {
            await this._queryRunner.rollbackTransaction();
        }
        catch (e) {
            LogError(e);
            throw e; // force caller to handle
        }
    }

    get LocalStorageProvider(): ILocalStorageProvider {
        if (!this._localStorageProvider)
            this._localStorageProvider = new NodeLocalStorageProvider();

        return this._localStorageProvider;
    }

    public async GetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
        const result: EntityRecordNameResult[] = [];
        for (let i = 0; i < info.length; i++) {
            const r = await this.GetEntityRecordName(info[i].EntityName, info[i].KeyValuePairs);
            result.push({ EntityName: info[i].EntityName, KeyValuePairs: info[i].KeyValuePairs, RecordName: r, Success: r ? true : false, Status: r ? 'Success' : 'Error' });
        }
        return result;
    }

    public async GetEntityRecordName(entityName: string, KeyValuePairs: KeyValuePair[]): Promise<string> {
        try {
            const sql = this.GetEntityRecordNameSQL(entityName, KeyValuePairs);
            if (sql) {
                const data = await this.ExecuteSQL(sql);
                if (data && data.length === 1) {
                    const fields = Object.keys(data[0]);
                    return data[0][fields[0]]; // return first field
                }
                else {
                    LogError(`Entity ${entityName} record ${KeyValuePairs.map(pkv => pkv.FieldName + ':' + pkv.Value)} not found, returning null`)
                    return null;
                }
            }
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }

    protected GetEntityRecordNameSQL(entityName: string, KeyValuePairs: KeyValuePair[]): string {
        const e = this.Entities.find(e => e.Name === entityName);
        if (!e)
            throw new Error(`Entity ${entityName} not found`);
        else {
            let f = e.Fields.find(f => f.IsNameField);
            if (!f)
                f = e.Fields.find(f => f.Name === 'Name');
            if (!f) {
                LogError(`Entity ${entityName} does not have an IsNameField or a field with the column name of Name, returning null, use recordId`)
                return null
            }
            else {
                // got our field, create a SQL Query
                let sql: string = `SELECT ${f.Name} FROM [${e.SchemaName}].[${e.BaseView}] WHERE `
                let where: string = '';
                for (let pkv of KeyValuePairs) {
                    const pk = e.PrimaryKeys.find(pk => pk.Name === pkv.FieldName);
                    const quotes = pk.NeedsQuotes ? "'" : '';
                    if (where.length > 0)
                        where += ' AND ';
                    where += `${pkv.FieldName}=${quotes}${pkv.Value}${quotes}`;
                }
                return sql + where;
            }
        }
    }

    public async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        return new SQLServerTransactionGroup();
    }


    /**************************************************************************/
    // END ---- IMetadataProvider
    /**************************************************************************/
    protected get Metadata(): IMetadataProvider {
        return this;
    }
}

// This implementation is purely in memory and doesn't bother to persist to a file. It is fine to load it once per server instance load
class NodeLocalStorageProvider implements ILocalStorageProvider {
    private _localStorage: any = {};

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
            if (this._localStorage.hasOwnProperty(key)) 
                delete this._localStorage[key];
            resolve();
        });
    }
}