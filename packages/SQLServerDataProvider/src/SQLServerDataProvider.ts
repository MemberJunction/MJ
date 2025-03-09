/**************************************************************************************************************
 * The SQLServerDataProvider provides a data provider for the entities framework that uses SQL Server directly
 * In practice - this FILE will NOT exist in the entities library, we need to move to its own separate project
 * so it is only included by the consumer of the entities library if they want to use it.
 **************************************************************************************************************/

import {
  BaseEntity,
  IEntityDataProvider,
  IMetadataProvider,
  IRunViewProvider,
  ProviderConfigDataBase,
  RunViewResult,
  MetadataInfo,
  EntityInfo,
  EntityFieldInfo,
  ApplicationInfo,
  RunViewParams,
  ProviderBase,
  EntityFieldTSType,
  ProviderType,
  UserInfo,
  RoleInfo,
  RecordChange,
  UserRoleInfo,
  ILocalStorageProvider,
  RowLevelSecurityFilterInfo,
  AuditLogTypeInfo,
  AuthorizationInfo,
  TransactionGroupBase,
  TransactionItem,
  EntityPermissionType,
  EntitySaveOptions,
  LogError,
  RunReportParams,
  DatasetItemFilterType,
  DatasetResultType,
  DatasetStatusEntityUpdateDateType,
  DatasetStatusResultType,
  EntityRecordNameInput,
  EntityRecordNameResult,
  IRunReportProvider,
  RunReportResult,
  StripStopWords,
  RecordDependency,
  RecordMergeRequest,
  RecordMergeResult,
  RecordMergeDetailResult,
  EntityDependency,
  KeyValuePair,
  IRunQueryProvider,
  RunQueryResult,
  PotentialDuplicateRequest,
  PotentialDuplicateResponse,
  LogStatus,
  CompositeKey,
  EntityDeleteOptions,
  BaseEntityResult,
  Metadata,
  DatasetItemResultType,
} from '@memberjunction/core';

import {
  AuditLogEntity,
  DuplicateRunEntity,
  EntityAIActionEntity,
  ListEntity,
  RecordMergeDeletionLogEntity,
  RecordMergeLogEntity,
  UserFavoriteEntity,
  UserViewEntityExtended,
  ViewInfo,
} from '@memberjunction/core-entities';
import { AIEngine, EntityAIActionParams } from '@memberjunction/aiengine';
import { QueueManager } from '@memberjunction/queue';

import { DataSource, QueryRunner } from 'typeorm';
import { SQLServerTransactionGroup } from './SQLServerTransactionGroup';

import { UserCache } from './UserCache';
import { RunQueryParams } from '@memberjunction/core/dist/generic/runQuery';
import { DuplicateRecordDetector } from '@memberjunction/ai-vector-dupe';
import { EntityActionEngineServer } from '@memberjunction/actions';
import { ActionResult } from '@memberjunction/actions-base';

export class SQLServerProviderConfigData extends ProviderConfigDataBase {
  get DataSource(): any {
    return this.Data.DataSource;
  }
  get CurrentUserEmail(): string {
    return this.Data.CurrentUserEmail;
  }
  get CheckRefreshIntervalSeconds(): number {
    return this.Data.CheckRefreshIntervalSeconds;
  }

  constructor(
    dataSource: any,
    currentUserEmail: string,
    MJCoreSchemaName?: string,
    checkRefreshIntervalSeconds: number = 0 /*default to disabling auto refresh */,
    includeSchemas?: string[],
    excludeSchemas?: string[]
  ) {
    super(
      {
        DataSource: dataSource,
        CurrentUserEmail: currentUserEmail,
        CheckRefreshIntervalSeconds: checkRefreshIntervalSeconds,
      },
      MJCoreSchemaName,
      includeSchemas,
      excludeSchemas
    );
  }
}

// Implements both the IEntityDataProvider and IMetadataProvider interfaces.
export class SQLServerDataProvider
  extends ProviderBase
  implements IEntityDataProvider, IMetadataProvider, IRunViewProvider, IRunReportProvider, IRunQueryProvider
{
  private _dataSource: DataSource;
  private _queryRunner: QueryRunner;
  private _currentUserEmail: string;
  private _localStorageProvider: ILocalStorageProvider;
  private _bAllowRefresh: boolean = true;
  private _recordDupeDetector: DuplicateRecordDetector;

  public get ConfigData(): SQLServerProviderConfigData {
    return <SQLServerProviderConfigData>super.ConfigData;
  }

  public async Config(configData: SQLServerProviderConfigData): Promise<boolean> {
    try {
      this._dataSource = configData.DataSource;
      this._currentUserEmail = configData.CurrentUserEmail;

      return super.Config(configData); // now parent class can do it's config
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**
   * SQL Server Data Provider implementation of this getter returns a TypeORM DataSource object
   */
  public get DatabaseConnection(): any {
    return this._dataSource;
  }

  /**
   * For the SQLServerDataProvider the unique instance connection string which is used to identify, uniquely, a given connection is the following format:
   * type://host:port/instanceName?/database
   * instanceName is only inserted if it is provided in the options
   */
  public get InstanceConnectionString(): string {
    const dbOptions: any = this._dataSource.options;
    const options = {
      type: dbOptions.type || '',
      host: dbOptions.host || '',
      port: dbOptions.port || '',
      instanceName: dbOptions.instanceName ? '/' + dbOptions.instanceName : '',
      database: dbOptions.database || '',
    };
    return options.type + '://' + options.host + ':' + options.port + options.instanceName + '/' + options.database;
  }

  protected get AllowRefresh(): boolean {
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
        return {
          Success: true,
          ReportID: ReportID,
          Results: result,
          RowCount: result.length,
          ExecutionTime: end - start,
          ErrorMessage: '',
        };
      else
        return {
          Success: false,
          ReportID: ReportID,
          Results: [],
          RowCount: 0,
          ExecutionTime: end - start,
          ErrorMessage: 'Error running report SQL',
        };
    } else return { Success: false, ReportID: ReportID, Results: [], RowCount: 0, ExecutionTime: 0, ErrorMessage: 'Report not found' };
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
      const filter = params.QueryID ? `ID='${params.QueryID}'` : `Name = '${params.QueryName}'`;
      const sqlQuery = `SELECT ID, Name, SQL FROM [${this.MJCoreSchemaName}].vwQueries WHERE ${filter}`;
      const queryInfo = await this.ExecuteSQL(sqlQuery);
      if (queryInfo && queryInfo.length > 0) {
        const start = new Date().getTime();
        const sql = queryInfo[0].SQL;
        const result = await this.ExecuteSQL(sql);
        const end = new Date().getTime();
        if (result)
          return {
            Success: true,
            QueryID: queryInfo[0].ID,
            QueryName: queryInfo[0].Name,
            Results: result,
            RowCount: result.length,
            ExecutionTime: end - start,
            ErrorMessage: '',
          };
        else
          throw new Error('Error running query SQL');
      } 
      else {
        throw new Error('Query not found');
      }
    } 
    catch (e) {
      LogError(e);
      return { 
        Success: false, 
        QueryID: params.QueryID,
        QueryName: params.QueryName,
        Results: [], 
        RowCount: 0, 
        ExecutionTime: 0, 
        ErrorMessage: e.message 
      };
    }
  }
  /**************************************************************************/
  // END ---- IRunQueryProvider
  /**************************************************************************/

  /**
   * This method will check to see if the where clause for the view provided has any templating within it, and if it does
   * will replace the templating with the appropriate run-time values. This is done recursively with depth-first traversal
   * so that if there are nested templates, they will be replaced as well. We also maintain a stack to ensure that any
   * possible circular references are caught and an error is thrown if that is the case.
   * @param viewEntity
   * @param user
   */
  protected async RenderViewWhereClause(viewEntity: UserViewEntityExtended, user: UserInfo, stack: string[] = []): Promise<string> {
    try {
      let sWhere = viewEntity.WhereClause;
      if (sWhere && sWhere.length > 0) {
        // check for the existence of one or more templated values in the where clause which will follow the nunjucks format of {%variable%}
        const templateRegex = /{%([^%]+)%}/g;
        const matches = sWhere.match(templateRegex);
        if (matches) {
          for (const match of matches) {
            const variable = match.substring(2, match.length - 2); // remove the {% and %}

            // the variable has a name and a parameter value for example {%UserView "123456"%}
            // where UserView is the variable name and 123456 is the parameter value, in this case the View ID
            // we need to split the variable into its name and parameter value
            const parts = variable.split(' ');
            const variableName = parts[0];
            if (variableName.trim().toLowerCase() === 'userview') {
              let variableValue = parts.length > 1 ? parts[1] : null;
              // now strip the quotes from the variable value if they are there
              if (variableValue && variableValue.startsWith('"') && variableValue.endsWith('"'))
                variableValue = variableValue.substring(1, variableValue.length - 1);

              if (stack.includes(variable)) throw new Error(`Circular reference detected in view where clause for variable ${variable}`);
              else stack.push(variable); // add to the stack for circular reference detection

              // variable values is the view ID of the view that we want to get its WHERE CLAUSE, so we need to get the view entity
              const innerViewEntity = await ViewInfo.GetViewEntity(variableValue, user);
              if (innerViewEntity) {
                // we have the inner view, so now call this function recursively to get the where clause for the inner view
                const innerWhere = await this.RenderViewWhereClause(innerViewEntity, user, stack);
                const innerSQL = `SELECT [${innerViewEntity.ViewEntityInfo.FirstPrimaryKey.Name}] FROM [${innerViewEntity.ViewEntityInfo.SchemaName}].[${innerViewEntity.ViewEntityInfo.BaseView}] WHERE (${innerWhere})`;
                sWhere = sWhere.replace(match, innerSQL);
              } else throw new Error(`View ID ${variableValue} not found in metadata`);
            } else {
              // we don't know what this variable is, so throw an error
              throw new Error(`Unknown variable ${variableName} as part of template match ${match} in view where clause`);
            }
          }
        } else {
          // no matches, just a regular old SQL where clause, so we're done, do nothing here as the return process will be below
        }
      }
      return sWhere;
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**************************************************************************/
  // START ---- IRunViewProvider
  /**************************************************************************/
  public async RunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
    const startTime = new Date();
    try {
      if (params) {
        const user = contextUser ? contextUser : this.CurrentUser;
        if (!user) throw new Error(`User ${this._currentUserEmail} not found in metadata and no contextUser provided to RunView()`);

        let viewEntity: any = null,
          entityInfo: EntityInfo = null;
        if (params.ViewEntity) viewEntity = params.ViewEntity;
        else if (params.ViewID && params.ViewID.length > 0) viewEntity = await ViewInfo.GetViewEntity(params.ViewID, contextUser);
        else if (params.ViewName && params.ViewName.length > 0)
          viewEntity = await ViewInfo.GetViewEntityByName(params.ViewName, contextUser);

        if (!viewEntity) {
          // if we don't have viewEntity, that means it is a dynamic view, so we need EntityName at a minimum
          if (!params.EntityName || params.EntityName.length === 0)
            throw new Error(`EntityName is required when ViewID or ViewName is not provided`);

          entityInfo = this.Entities.find((e) => e.Name === params.EntityName);
          if (!entityInfo) throw new Error(`Entity ${params.EntityName} not found in metadata`);
        } else {
          entityInfo = this.Entities.find((e) => e.ID === viewEntity.EntityID);
          if (!entityInfo) throw new Error(`Entity ID: ${viewEntity.EntityID} not found in metadata`);
        }

        // check permissions now, this call will throw an error if the user doesn't have permission
        this.CheckUserReadPermissions(entityInfo.Name, user);

        // get other variaables from params
        const extraFilter: string = params.ExtraFilter;
        const userSearchString: string = params.UserSearchString;
        const excludeUserViewRunID: string = params.ExcludeUserViewRunID;
        const overrideExcludeFilter: string = params.OverrideExcludeFilter;
        const saveViewResults: boolean = params.SaveViewResults;

        let topSQL: string = '';
        if (params.IgnoreMaxRows === true) {
          // do nothing, leave it blank, this structure is here to make the code easier to read
        } else if (params.StartRow && params.StartRow > 0) {
          // do nothing, leave it blank, this structure is here to make the code easier to read
        } else if (params.MaxRows && params.MaxRows > 0) {
          // user provided a max rows, so we use that
          topSQL = 'TOP ' + params.MaxRows;
        } else if (entityInfo.UserViewMaxRows && entityInfo.UserViewMaxRows > 0) {
          topSQL = 'TOP ' + entityInfo.UserViewMaxRows;
        }

        const fields: string = this.getRunTimeViewFieldString(params, viewEntity);

        let viewSQL: string = `SELECT ${topSQL} ${fields} FROM [${entityInfo.SchemaName}].${entityInfo.BaseView}`;
        let countSQL =
          topSQL && topSQL.length > 0 ? `SELECT COUNT(*) AS TotalRowCount FROM [${entityInfo.SchemaName}].${entityInfo.BaseView}` : null;
        let whereSQL: string = '';
        let bHasWhere: boolean = false;
        let userViewRunID: string = '';

        // The view may have a where clause that is part of the view definition. If so, we need to add it to the SQL
        if (viewEntity?.WhereClause && viewEntity?.WhereClause.length > 0) {
          const renderedWhere = await this.RenderViewWhereClause(viewEntity, contextUser);
          whereSQL = `(${renderedWhere})`;
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
        if ((excludeUserViewRunID && excludeUserViewRunID.length > 0) || params.ExcludeDataFromAllPriorViewRuns === true) {
          let sExcludeSQL: string = `ID NOT IN (SELECT RecordID FROM [${this.MJCoreSchemaName}].vwUserViewRunDetails WHERE EntityID='${viewEntity.EntityID}' AND`;
          if (params.ExcludeDataFromAllPriorViewRuns === true)
            sExcludeSQL += ` UserViewID=${viewEntity.ID})`; // exclude ALL prior runs for this view, we do NOT need to also add the UserViewRunID even if it was provided because this will automatically filter that out too
          else sExcludeSQL += `UserViewRunID=${excludeUserViewRunID})`; // exclude just the run that was provided

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
          if (countSQL) countSQL += ` WHERE ${whereSQL}`;
        }

        // figure out the sorting for the view
        // first check params.OrderBy, that takes first priority
        // if that's not provided, then we check the view definition for its SortState
        // if that's not provided we do NOT sort
        const orderBy: string = params.OrderBy ? params.OrderBy : viewEntity ? viewEntity.OrderByClause : '';

        // if we're saving the view results, we need to wrap the entire SQL statement
        if (viewEntity?.ID && viewEntity?.ID.length > 0 && saveViewResults && user) {
          const { executeViewSQL, runID } = await this.executeSQLForUserViewRunLogging(
            viewEntity.ID,
            viewEntity.EntityBaseView,
            whereSQL,
            orderBy,
            user
          );
          viewSQL = executeViewSQL;
          userViewRunID = runID;
        } else if (orderBy && orderBy.length > 0) {
          // we only add order by if we're not doing run logging. This is becuase the run logging will
          // add the order by to its SELECT query that pulls from the list of records that were returned
          // there is no point in ordering the rows as they are saved into an audit list anyway so no order-by above
          // just here for final step before we execute it.
          if (!this.validateUserProvidedSQLClause(orderBy))
            throw new Error(`Invalid Order By clause: ${orderBy}, contains one more for forbidden keywords`);

          viewSQL += ` ORDER BY ${orderBy}`;
        }

        if (params.StartRow && params.StartRow > 0 && params.MaxRows && params.MaxRows > 0 && entityInfo.FirstPrimaryKey) {
          viewSQL += ` ORDER BY ${entityInfo.FirstPrimaryKey.Name} `;
          viewSQL += ` OFFSET ${params.StartRow} ROWS FETCH NEXT ${params.MaxRows} ROWS ONLY`;
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

        if (
          params.ForceAuditLog ||
          (viewEntity?.ID &&
            (extraFilter === undefined || extraFilter === null || extraFilter?.trim().length === 0) &&
            entityInfo.AuditViewRuns)
        ) {
          // ONLY LOG TOP LEVEL VIEW EXECUTION - this would be for views with an ID, and don't have ExtraFilter as ExtraFilter
          // is only used in the system on a tab or just for ad hoc view execution

          // we do NOT want to wait for this, so no await,
          this.createAuditLogRecord(
            user,
            'Run View',
            'Run View',
            'Success',
            JSON.stringify({
              ViewID: viewEntity?.ID,
              ViewName: viewEntity?.Name,
              Description: params.AuditLogDescription,
              RowCount: retData.length,
              SQL: viewSQL,
            }),
            entityInfo.ID,
            null,
            params.AuditLogDescription
          );
        }

        return {
          RowCount:
            params.ResultType === 'count_only'
              ? rowCount
              : retData.length /*this property should be total row count if the ResultType='count_only' otherwise it should be the row count of the returned rows */,
          TotalRowCount: rowCount ? rowCount : retData.length,
          Results: retData,
          UserViewRunID: userViewRunID,
          ExecutionTime: stopTime.getTime() - startTime.getTime(),
          Success: true,
          ErrorMessage: null,
        };
      } else return null;
    } catch (e) {
      const exceptionStopTime = new Date();
      LogError(e);
      return {
        RowCount: 0,
        TotalRowCount: 0,
        Results: [],
        UserViewRunID: '',
        ExecutionTime: exceptionStopTime.getTime() - startTime.getTime(),
        Success: false,
        ErrorMessage: e.message,
      };
    }
  }

  public async RunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
    const results: RunViewResult<T>[] = [];
    for (const p of params) {
      const result = await this.RunView<T>(p, contextUser);
      results.push(result);
    }

    return results;
  }

  protected validateUserProvidedSQLClause(clause: string): boolean {
    // convert the clause to lower case to make the keyword search case-insensitive
    const lowerClause = clause.toLowerCase();

    // Define forbidden keywords and characters as whole words using regular expressions
    const forbiddenPatterns: RegExp[] = [
      /\binsert\b/,
      /\bupdate\b/,
      /\bdelete\b/,
      /\bexec\b/,
      /\bexecute\b/,
      /\bdrop\b/,
      /--/,
      /\/\*/,
      /\*\//,
      /\bunion\b/,
      /\bcast\b/,
      /\bxp_/,
      /;/,
    ];

    // Check for forbidden patterns
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(lowerClause)) {
        return false;
      }
    }

    return true;
  }

  protected getRunTimeViewFieldString(params: RunViewParams, viewEntity: UserViewEntityExtended): string {
    const fieldList = this.getRunTimeViewFieldArray(params, viewEntity);
    // pass this back as a comma separated list, put square brackets around field names to make sure if they are reserved words or have spaces, that they'll still work.
    if (fieldList.length === 0) return '*';
    else
      return fieldList
        .map((f) => {
          const asString: string = f.CodeName === f.Name ? '' : ` AS [${f.CodeName}]`;
          return `[${f.Name}]${asString}`;
        })
        .join(',');
  }

  protected getRunTimeViewFieldArray(params: RunViewParams, viewEntity: UserViewEntityExtended): EntityFieldInfo[] {
    const fieldList: EntityFieldInfo[] = [];
    try {
      let entityInfo: EntityInfo = null;
      if (viewEntity) {
        entityInfo = viewEntity.ViewEntityInfo;
      } else {
        entityInfo = this.Entities.find((e) => e.Name === params.EntityName);
        if (!entityInfo) throw new Error(`Entity ${params.EntityName} not found in metadata`);
      }

      if (params.Fields) {
        // fields provided, if primary key isn't included, add it first
        for (const ef of entityInfo.PrimaryKeys) {
          if (params.Fields.find((f) => f.trim().toLowerCase() === ef.Name.toLowerCase()) === undefined) fieldList.push(ef); // always include the primary key fields in view run time field list
        }

        // now add the rest of the param.Fields to fields
        params.Fields.forEach((f) => {
          const field = entityInfo.Fields.find((field) => field.Name.trim().toLowerCase() === f.trim().toLowerCase());
          if (field) fieldList.push(field);
          else LogError(`Field ${f} not found in entity ${entityInfo.Name}`);
        });
      } else {
        // fields weren't provided by the caller. So, let's do the following
        // * if this is a defined view, using a View Name or View ID, we use the fields that are used wtihin the View and always return the ID
        // * if this is an dynamic view, we return ALL fields in the entity using *
        if (viewEntity) {
          // saved view, figure out it's field list
          viewEntity.Columns.forEach((c) => {
            if (!c.hidden) {
              // only return the non-hidden fields
              if (c.EntityField) {
                fieldList.push(c.EntityField);
              } else {
                LogError(
                  `View Field ${c.Name} doesn't match an Entity Field in entity ${entityInfo.Name}. This can happen if the view was saved with a field that no longer exists in the entity. It is best to update the view to remove this field.`
                );
              }
            }
          });
          // the below shouldn't happen as the pkey fields should always be included by now, but make SURE...
          for (const ef of entityInfo.PrimaryKeys) {
            if (fieldList.find((f) => f.Name?.trim().toLowerCase() === ef.Name?.toLowerCase()) === undefined) fieldList.push(ef); // always include the primary key fields in view run time field list
          }
        }
      }
    } catch (e) {
      LogError(e);
    } finally {
      return fieldList;
    }
  }

  protected async executeSQLForUserViewRunLogging(
    viewId: number,
    entityBaseView: string,
    whereSQL: string,
    orderBySQL: string,
    user: UserInfo
  ): Promise<{ executeViewSQL: string; runID: string }> {
    const entityInfo = this.Entities.find((e) => e.BaseView.trim().toLowerCase() === entityBaseView.trim().toLowerCase());
    const sSQL = `
            DECLARE @ViewIDList TABLE ( ID NVARCHAR(255) );
            INSERT INTO @ViewIDList (ID) (SELECT ${entityInfo.FirstPrimaryKey.Name} FROM [${entityInfo.SchemaName}].${entityBaseView} WHERE (${whereSQL}))
            EXEC [${this.MJCoreSchemaName}].spCreateUserViewRunWithDetail(${viewId},${user.Email}, @ViewIDLIst)
            `;
    const runIDResult = await this._dataSource.query(sSQL);
    const runID: string = runIDResult[0].UserViewRunID;
    const sRetSQL: string = `SELECT * FROM [${entityInfo.SchemaName}].${entityBaseView} WHERE ${entityInfo.FirstPrimaryKey.Name} IN
                                    (SELECT RecordID FROM [${this.MJCoreSchemaName}].vwUserViewRunDetails WHERE UserViewRunID=${runID})
                                 ${orderBySQL && orderBySQL.length > 0 ? ' ORDER BY ' + orderBySQL : ''}`;
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
      if (uUpper.includes(' AND ') || uUpper.includes(' OR ') || uUpper.includes(' NOT ')) {
        //replace all spaces with %, but add spaces inbetween the original and, or and not keywords
        u = uUpper.replace(/ /g, '%').replace(/%AND%/g, ' AND ').replace(/%OR%/g, ' OR ').replace(/%NOT%/g, ' NOT ');
      } else if (uUpper.includes('AND') || uUpper.includes('OR') || uUpper.includes('NOT')) {
        //leave the string alone, except replacing spaces with %
        u = u.replace(/ /g, '%');
      } else if (u.includes(' ')) {
        if (u.startsWith('"') && u.endsWith('"')) {
          // do nothing because we start AND end with a quote, so we have a phrase search
        } else {
          // we have multiple words, so we need to convert the spaces to AND
          // but first, let's strip the stopwords out of the string
          u = StripStopWords(userSearchString);
          // next, include "AND" between all the words so that we have a full text search on all the words
          u = u.replace(/ /g, ' AND ');
        }
      }

      sUserSearchSQL = `${entityInfo.FirstPrimaryKey.Name} IN (SELECT ${entityInfo.FirstPrimaryKey.Name} FROM ${entityInfo.SchemaName}.${entityInfo.FullTextSearchFunction}('${u}'))`;
    } else {
      const entityFields = entityInfo.Fields;

      for (const field of entityFields) {
        if (field.IncludeInUserSearchAPI) {
          let sParam = '';
          if (sUserSearchSQL.length > 0) sUserSearchSQL += ' OR ';

          if (field.UserSearchParamFormatAPI && field.UserSearchParamFormatAPI.length > 0)
            // we have a search param format. we need to apply it to the user search string
            sParam = field.UserSearchParamFormatAPI.replace('{0}', userSearchString);
          else sParam = ` LIKE '%${userSearchString}%'`;

          sUserSearchSQL += `(${field.Name} ${sParam})`;
        }
      }
      if (sUserSearchSQL.length > 0) sUserSearchSQL = '(' + sUserSearchSQL + ')'; // wrap the entire search string in parens
    }

    return sUserSearchSQL;
  }

  public async createAuditLogRecord(
    user: UserInfo,
    authorizationName: string | null,
    auditLogTypeName: string,
    status: string,
    details: string | null,
    entityId: string,
    recordId: any | null,
    auditLogDescription: string | null
  ): Promise<AuditLogEntity> {
    try {
      const authorization = authorizationName
        ? this.Authorizations.find((a) => a?.Name?.trim().toLowerCase() === authorizationName.trim().toLowerCase())
        : null;
      const auditLogType = auditLogTypeName
        ? this.AuditLogTypes.find((a) => a?.Name?.trim().toLowerCase() === auditLogTypeName.trim().toLowerCase())
        : null;

      if (!user) throw new Error(`User is a required parameter`);
      if (!auditLogType) throw new Error(`Audit Log Type ${auditLogTypeName} not found in metadata`);

      const auditLog = await this.GetEntityObject<AuditLogEntity>('Audit Logs', user); // must pass user context on back end as we're not authenticated the same way as the front end
      auditLog.NewRecord();
      auditLog.UserID = user.ID;
      auditLog.AuditLogTypeID = auditLogType.ID;
      if (status?.trim().toLowerCase() === 'success') auditLog.Status = 'Success';
      else auditLog.Status = 'Failed';

      auditLog.EntityID = entityId;
      auditLog.RecordID = recordId;

      if (authorization) auditLog.AuthorizationID = authorization.ID;

      if (details) auditLog.Details = details;

      if (auditLogDescription) auditLog.Description = auditLogDescription;

      if (await auditLog.Save()) return auditLog;
      else throw new Error(`Error saving audit log record`);
    } catch (err) {
      LogError(err);
      return null;
    }
  }

  protected CheckUserReadPermissions(entityName: string, contextUser: UserInfo) {
    const entityInfo = this.Entities.find((e) => e.Name === entityName);
    if (!contextUser) throw new Error(`contextUser is null`);

    // first check permissions, the logged in user must have read permissions on the entity to run the view
    if (entityInfo) {
      const userPermissions = entityInfo.GetUserPermisions(contextUser);
      if (!userPermissions.CanRead) throw new Error(`User ${contextUser.Email} does not have read permissions on ${entityInfo.Name}`);
    } else throw new Error(`Entity not found in metadata`);
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

  public async GetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey): Promise<boolean> {
    const id = await this.GetRecordFavoriteID(userId, entityName, CompositeKey);
    return id !== null;
  }

  public async GetRecordFavoriteID(userId: string, entityName: string, CompositeKey: CompositeKey): Promise<string | null> {
    try {
      const sSQL = `SELECT ID FROM [${this.MJCoreSchemaName}].vwUserFavorites WHERE UserID='${userId}' AND Entity='${entityName}' AND RecordID='${CompositeKey.Values()}'`;
      const result = await this.ExecuteSQL(sSQL);
      if (result && result.length > 0) return result[0].ID;
      else return null;
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  public async SetRecordFavoriteStatus(
    userId: string,
    entityName: string,
    CompositeKey: CompositeKey,
    isFavorite: boolean,
    contextUser: UserInfo
  ): Promise<void> {
    try {
      const currentFavoriteId = await this.GetRecordFavoriteID(userId, entityName, CompositeKey);
      if ((currentFavoriteId === null && isFavorite === false) || (currentFavoriteId !== null && isFavorite === true)) return; // no change

      // if we're here that means we need to invert the status, which either means creating a record or deleting a record
      const e = this.Entities.find((e) => e.Name === entityName);
      const ufEntity = <UserFavoriteEntity>await this.GetEntityObject('User Favorites', contextUser || this.CurrentUser);
      if (currentFavoriteId !== null) {
        // delete the record since we are setting isFavorite to FALSE
        await ufEntity.Load(currentFavoriteId);
        if (await ufEntity.Delete()) return;
        else throw new Error(`Error deleting user favorite`);
      } else {
        // create the record since we are setting isFavorite to TRUE
        ufEntity.NewRecord();
        ufEntity.Set('EntityID', e.ID);
        ufEntity.Set('RecordID', CompositeKey.Values()); // this is a comma separated list of primary key values, which is fine as the primary key is a string
        ufEntity.Set('UserID', userId);
        if (await ufEntity.Save()) return;
        else throw new Error(`Error saving user favorite`);
      }
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  public async GetRecordChanges(entityName: string, compositeKey: CompositeKey): Promise<RecordChange[]> {
    try {
      const sSQL = `SELECT * FROM [${this.MJCoreSchemaName}].vwRecordChanges WHERE Entity='${entityName}' AND RecordID='${compositeKey.ToConcatenatedString()}' ORDER BY ChangedAt DESC`;
      return this.ExecuteSQL(sSQL);
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**
   * This function will generate SQL statements for all of the possible soft links that are not traditional foreign keys but exist in entities
   * where there is a column that has the EntityIDFieldName set to a column name (not null). We need to get a list of all such soft link fields across ALL entities
   * and then generate queries for each possible soft link in the same format as the hard links
   * @param entityName
   * @param compositeKey
   */
  protected GetSoftLinkDependencySQL(entityName: string, compositeKey: CompositeKey): string {
    // we need to go through ALL of the entities in the system and find all of the EntityFields that have a non-null EntityIDFieldName
    // for each of these, we generate a SQL Statement that will return the EntityName, RelatedEntityName, FieldName, and the primary key values of the related entity
    let sSQL = '';
    this.Entities.forEach((entity) => {
      // we build a string that will concatenate all of the primary key values into a single string, this is because the primary key could be a composite key
      // we do this in SQL by combining the pirmary key name and value for each row using the default separator defined by the CompositeKey class
      // the output of this should be like the following 'Field1|Value1||Field2|Value2||Field3|Value3' where the || is the CompositeKey.DefaultFieldDelimiter and the | is the CompositeKey.DefaultValueDelimiter
      const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
      const primaryKeySelectString = `CONCAT(${entity.PrimaryKeys.map((pk) => `'${pk.Name}|', CAST(${pk.Name} AS NVARCHAR(MAX))`).join(`,'${CompositeKey.DefaultFieldDelimiter}',`)})`;

      // for this entity, check to see if it has any fields that are soft links, and for each of those, generate the SQL
      entity.Fields.filter((f) => f.EntityIDFieldName && f.EntityIDFieldName.length > 0).forEach((f) => {
        // each field in f must be processed
        if (sSQL.length > 0) sSQL += ' UNION ALL ';

        // there is a layer of indirection here because each ROW in each of the entity records for this entity/field combination could point to a DIFFERENT
        // entity. We find out which entity it is pointed to via the EntityIDFieldName in the field definition, so we have to filter the rows in the entity
        // based on that.
        sSQL += `SELECT
                            '${entityName}' AS EntityName,
                            '${entity.Name}' AS RelatedEntityName,
                            ${primaryKeySelectString} AS PrimaryKeyValue,
                            '${f.Name}' AS FieldName
                        FROM
                            [${entity.SchemaName}].[${entity.BaseView}]
                        WHERE
                            [${f.EntityIDFieldName}] = ${quotes}${entity.ID}${quotes} AND
                            [${f.Name}] = ${quotes}${compositeKey.GetValueByIndex(0)}${quotes}`; // we only use the first primary key value, this is because we don't yet support composite primary keys
      });
    });
    return sSQL;
  }

  protected GetHardLinkDependencySQL(entityDependencies: EntityDependency[], compositeKey: CompositeKey): string {
    let sSQL = '';
    for (const entityDependency of entityDependencies) {
      const entityInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === entityDependency.EntityName?.trim().toLowerCase());
      const quotes = entityInfo.FirstPrimaryKey.NeedsQuotes ? "'" : '';
      const relatedEntityInfo = this.Entities.find(
        (e) => e.Name.trim().toLowerCase() === entityDependency.RelatedEntityName?.trim().toLowerCase()
      );
      const primaryKeySelectString = `CONCAT(${entityInfo.PrimaryKeys.map((pk) => `'${pk.Name}|', CAST(${pk.Name} AS NVARCHAR(MAX))`).join(`,'${CompositeKey.DefaultFieldDelimiter}',`)})`;

      if (sSQL.length > 0) sSQL += ' UNION ALL ';
      sSQL += `SELECT
                        '${entityDependency.EntityName}' AS EntityName,
                        '${entityDependency.RelatedEntityName}' AS RelatedEntityName,
                        ${primaryKeySelectString} AS PrimaryKeyValue,
                        '${entityDependency.FieldName}' AS FieldName
                    FROM
                        [${relatedEntityInfo.SchemaName}].[${relatedEntityInfo.BaseView}]
                    WHERE
                        [${entityDependency.FieldName}] = ${this.GetRecordDependencyLinkSQL(entityDependency, entityInfo, relatedEntityInfo, compositeKey)}`;
    }
    return sSQL;
  }

  /**
   * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
   * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
   * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
   * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
   * @param entityName the name of the entity to check
   * @param KeyValuePairs the primary key(s) to check - only send multiple if you have an entity with a composite primary key
   */
  public async GetRecordDependencies(entityName: string, compositeKey: CompositeKey): Promise<RecordDependency[]> {
    try {
      const recordDependencies: RecordDependency[] = [];

      // first, get the entity dependencies for this entity
      const entityDependencies: EntityDependency[] = await this.GetEntityDependencies(entityName);
      if (entityDependencies.length === 0) {
        // no dependencies, exit early
        return recordDependencies;
      }

      // now, we have to construct a query that will return the dependencies for this record, both hard and soft links
      const sSQL: string =
        this.GetHardLinkDependencySQL(entityDependencies, compositeKey) + '\n' + this.GetSoftLinkDependencySQL(entityName, compositeKey);

      // now, execute the query
      const result = await this.ExecuteSQL(sSQL);
      if (!result || result.length === 0) {
        return recordDependencies;
      }

      // now we go through the results and create the RecordDependency objects
      for (const r of result) {
        const entityInfo: EntityInfo | undefined = this.Entities.find(
          (e) => e.Name.trim().toLowerCase() === r.EntityName?.trim().toLowerCase()
        );
        if (!entityInfo) {
          throw new Error(`Entity ${r.EntityName} not found in metadata`);
        }

        // future, if we support foreign keys that are composite keys, we'll need to enable this code
        // const pkeyValues: KeyValuePair[] = [];
        // entityInfo.PrimaryKeys.forEach((pk) => {
        //     pkeyValues.push({FieldName: pk.Name, Value: r[pk.Name]}) // add all of the primary keys, which often is as simple as just "ID", but this is generic way to do it
        // })

        let compositeKey: CompositeKey = new CompositeKey();
        // the row r will have a PrimaryKeyValue field that is a string that is a concatenation of the primary key field names and values
        // we need to parse that out so that we can then pass it to the CompositeKey object
        const pkeys = {};
        const keyValues = r.PrimaryKeyValue.split(CompositeKey.DefaultFieldDelimiter);
        keyValues.forEach((kv) => {
          const parts = kv.split(CompositeKey.DefaultValueDelimiter);
          pkeys[parts[0]] = parts[1];
        });
        compositeKey.LoadFromEntityInfoAndRecord(entityInfo, keyValues);

        const recordDependency: RecordDependency = {
          EntityName: r.EntityName,
          RelatedEntityName: r.RelatedEntityName,
          FieldName: r.FieldName,
          PrimaryKey: compositeKey,
        };

        recordDependencies.push(recordDependency);
      }
      return recordDependencies;
    } catch (e) {
      // log and throw
      LogError(e);
      throw e;
    }
  }

  protected GetRecordDependencyLinkSQL(
    dep: EntityDependency,
    entity: EntityInfo,
    relatedEntity: EntityInfo,
    CompositeKey: CompositeKey
  ): string {
    const f = relatedEntity.Fields.find((f) => f.Name.trim().toLowerCase() === dep.FieldName?.trim().toLowerCase());
    const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
    if (!f) {
      throw new Error(`Field ${dep.FieldName} not found in Entity ${relatedEntity.Name}`);
    }

    if (f.RelatedEntityFieldName?.trim().toLowerCase() === 'id') {
      // simple link to first primary key, most common scenario for linkages
      return `${quotes}${CompositeKey.GetValueByIndex(0)}${quotes}`;
    } else {
      // linking to something else, so we need to use that field in a sub-query
      // NOTICE - we are only using the FIRST primary key in our current implementation, this is because we don't yet support composite foreign keys
      // if we do start to support composite foreign keys, we'll need to update this code to handle that
      return `(SELECT ${f.RelatedEntityFieldName} FROM [${entity.SchemaName}].${entity.BaseView} WHERE ${entity.FirstPrimaryKey.Name}=${quotes}${CompositeKey.GetValueByIndex(0)}${quotes})`;
    }
  }

  public async GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {
    if (!contextUser) {
      throw new Error('User context is required to get record duplicates.');
    }

    const listEntity: ListEntity = await this.GetEntityObject<ListEntity>('Lists');
    listEntity.ContextCurrentUser = contextUser;
    let success = await listEntity.Load(params.ListID);
    if (!success) {
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
    if (!saveResult) {
      throw new Error(`Failed to save Duplicate Run Entity`);
    }

    let response: PotentialDuplicateResponse = {
      Status: 'Inprogress',
      PotentialDuplicateResult: [],
    };

    return response;
  }

  public async MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo): Promise<RecordMergeResult> {
    const e = this.Entities.find((e) => e.Name.trim().toLowerCase() === request.EntityName.trim().toLowerCase());
    if (!e || !e.AllowRecordMerge)
      throw new Error(
        `Entity ${request.EntityName} does not allow record merging, check the AllowRecordMerge property in the entity metadata`
      );

    const result: RecordMergeResult = {
      Success: false,
      RecordMergeLogID: null,
      RecordStatus: [],
      Request: request,
      OverallStatus: null,
    };
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
        const survivor: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser);
        await survivor.InnerLoad(request.SurvivingRecordCompositeKey);
        for (const fieldMap of request.FieldMap) {
          survivor.Set(fieldMap.FieldName, fieldMap.Value);
        }
        if (!(await survivor.Save())) {
          result.OverallStatus = 'Error saving survivor record with values from provided field map.';
          throw new Error(result.OverallStatus);
        }
      }

      // Step 3 - update the dependencies for each of the records we will delete
      for (const pksToDelete of request.RecordsToMerge) {
        const newRecStatus: RecordMergeDetailResult = {
          CompositeKey: pksToDelete,
          Success: false,
          RecordMergeDeletionLogID: null,
          Message: null,
        };
        result.RecordStatus.push(newRecStatus);
        const dependencies = await this.GetRecordDependencies(request.EntityName, pksToDelete);
        // now, loop through the dependencies and update the link to point to the surviving record
        for (const dependency of dependencies) {
          const reInfo = this.Entities.find((e) => e.Name.trim().toLowerCase() === dependency.RelatedEntityName.trim().toLowerCase());
          const relatedEntity: BaseEntity = await this.GetEntityObject(dependency.RelatedEntityName, contextUser);
          await relatedEntity.InnerLoad(dependency.PrimaryKey);
          relatedEntity.Set(dependency.FieldName, request.SurvivingRecordCompositeKey.GetValueByIndex(0)); // only support single field foreign keys for now
          /*
                    if we later support composite foreign keys, we'll need to do this instead, at the moment this code will break as dependency.KeyValuePair is a single value, not an array

                    for (let pkv of dependency.KeyValuePairs) {
                        relatedEntity.Set(dependency.FieldName, pkv.Value);
                    }
                     */
          if (!(await relatedEntity.Save())) {
            newRecStatus.Success = false;
            newRecStatus.Message = `Error updating dependency record ${dependency.PrimaryKey.ToString} for entity ${dependency.RelatedEntityName} to point to surviving record ${request.SurvivingRecordCompositeKey.ToString()}`;
            throw new Error(newRecStatus.Message);
          }
        }
        // if we get here, that means that all of the dependencies were updated successfully, so we can now delete the records to be merged
        const recordToDelete: BaseEntity = await this.GetEntityObject(request.EntityName, contextUser);
        await recordToDelete.InnerLoad(pksToDelete);
        if (!(await recordToDelete.Delete())) {
          newRecStatus.Message = `Error deleting record ${pksToDelete.ToString()} for entity ${request.EntityName}`;
          throw new Error(newRecStatus.Message);
        } else newRecStatus.Success = true;
      }

      result.Success = true;
      await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);

      // Step 5 - commit transaction
      await this.CommitTransaction();

      result.Success = true;

      return result;
    } catch (e) {
      LogError(e);

      await this.RollbackTransaction();
      // attempt to persist the status to the DB, although that might fail
      await this.CompleteMergeLogging(mergeRecordLog, result, contextUser);
      throw e;
    }
  }

  protected async StartMergeLogging(
    request: RecordMergeRequest,
    result: RecordMergeResult,
    contextUser: UserInfo
  ): Promise<RecordMergeLogEntity> {
    try {
      // create records in the Record Merge Logs entity and Record Merge Deletion Logs entity
      const recordMergeLog = <RecordMergeLogEntity>await this.GetEntityObject('Record Merge Logs', contextUser);
      const entity = this.Entities.find((e) => e.Name === request.EntityName);
      if (!entity) throw new Error(`Entity ${result.Request.EntityName} not found in metadata`);
      if (!contextUser && !this.CurrentUser) throw new Error(`contextUser is null and no CurrentUser is set`);

      recordMergeLog.NewRecord();
      recordMergeLog.EntityID = entity.ID;
      recordMergeLog.SurvivingRecordID = request.SurvivingRecordCompositeKey.Values(); // this would join together all of the primary key values, which is fine as the primary key is a string
      recordMergeLog.InitiatedByUserID = contextUser ? contextUser.ID : this.CurrentUser?.ID;
      recordMergeLog.ApprovalStatus = 'Approved';
      recordMergeLog.ApprovedByUserID = contextUser ? contextUser.ID : this.CurrentUser?.ID;
      recordMergeLog.ProcessingStatus = 'Started';
      recordMergeLog.ProcessingStartedAt = new Date();
      if (await recordMergeLog.Save()) {
        result.RecordMergeLogID = recordMergeLog.ID;
        return recordMergeLog;
      } else throw new Error(`Error saving record merge log`);
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  protected async CompleteMergeLogging(recordMergeLog: RecordMergeLogEntity, result: RecordMergeResult, contextUser?: UserInfo) {
    try {
      // create records in the Record Merge Logs entity and Record Merge Deletion Logs entity
      if (!contextUser && !this.CurrentUser) throw new Error(`contextUser is null and no CurrentUser is set`);

      recordMergeLog.ProcessingStatus = result.Success ? 'Complete' : 'Error';
      recordMergeLog.ProcessingEndedAt = new Date();
      if (!result.Success)
        // only create the log record if the merge failed, otherwise it is wasted space
        recordMergeLog.ProcessingLog = result.OverallStatus;
      if (await recordMergeLog.Save()) {
        // top level saved, now let's create the deletion detail records for each of the records that were merged
        for (const d of result.RecordStatus) {
          const recordMergeDeletionLog = <RecordMergeDeletionLogEntity>(
            await this.GetEntityObject('Record Merge Deletion Logs', contextUser)
          );
          recordMergeDeletionLog.NewRecord();
          recordMergeDeletionLog.RecordMergeLogID = recordMergeLog.ID;
          recordMergeDeletionLog.DeletedRecordID = d.CompositeKey.Values(); // this would join together all of the primary key values, which is fine as the primary key is a string
          recordMergeDeletionLog.Status = d.Success ? 'Complete' : 'Error';
          recordMergeDeletionLog.ProcessingLog = d.Success ? null : d.Message; // only save the message if it failed
          if (!(await recordMergeDeletionLog.Save())) throw new Error(`Error saving record merge deletion log`);
        }
      } else throw new Error(`Error saving record merge log`);
    } catch (e) {
      // do nothing here because we often will get here since some conditions lead to no DB updates possible...
      LogError(e);
      // don't bubble up the error here as we're sometimes already in an exception block in caller
    }
  }

  /**
   * This function generates the SQL Statement that will Save a record to the database, it is generally used by the Save() method of this class, but it is marked as public because
   * it is also used by the SQLServerTransactionGroup to regenerate Save SQL if any values were changed by the transaction group due to transaction variables being set into the object.
   */
  public GetSaveSQL(entity: BaseEntity, bNewRecord: boolean, spName: string, user: UserInfo): string {
    const sSimpleSQL: string = `EXEC [${entity.EntityInfo.SchemaName}].${spName} ${this.generateSPParams(entity, !bNewRecord)}`;
    const recordChangesEntityInfo = this.Entities.find((e) => e.Name === 'Record Changes');
    let sSQL: string = '';
    if (entity.EntityInfo.TrackRecordChanges && entity.EntityInfo.Name.trim().toLowerCase() !== 'record changes') {
      // don't track changes for the record changes entity
      let oldData = null;
      // use SQL Server CONCAT function to combine all of the primary key values and then combine them together
      // using the default field delimiter and default value delimiter as defined in the CompositeKey class
      const concatPKIDString = `CONCAT(${entity.EntityInfo.PrimaryKeys.map((pk) => `'${pk.CodeName}','${CompositeKey.DefaultValueDelimiter}',${pk.Name}`).join(`,'${CompositeKey.DefaultFieldDelimiter}',`)})`;

      if (!bNewRecord) oldData = entity.GetAll(true); // get all the OLD values, only do for existing records, for new records, not relevant

      sSQL = `
                    DECLARE @ResultTable TABLE (
                        ${this.getAllEntityColumnsSQL(entity.EntityInfo)}
                    )

                    INSERT INTO @ResultTable
                    ${sSimpleSQL}

                    DECLARE @ID NVARCHAR(MAX)
                    SELECT @ID = ${concatPKIDString} FROM @ResultTable
                    IF @ID IS NOT NULL
                    BEGIN
                        DECLARE @ResultChangesTable TABLE (
                            ${this.getAllEntityColumnsSQL(recordChangesEntityInfo)}
                        )

                        INSERT INTO @ResultChangesTable
                        ${this.GetLogRecordChangeSQL(entity.GetAll(false), oldData, entity.EntityInfo.Name, '@ID', entity.EntityInfo, bNewRecord ? 'Create' : 'Update', user, false)}
                    END

                    SELECT * FROM @ResultTable`; // NOTE - in the above, we call the T-SQL variable @ID for simplicity just as a variable name, even though for each entity the pkey could be something else. Entity pkeys are not always a field called ID could be something else including composite keys.
    } else {
      // not doing track changes for this entity, keep it simple
      sSQL = sSimpleSQL;
    }
    return sSQL;
  }

  protected GetEntityAIActions(entityInfo: EntityInfo, before: boolean): EntityAIActionEntity[] {
    return AIEngine.Instance.EntityAIActions.filter(
      (a) => a.EntityID === entityInfo.ID && a.TriggerEvent.toLowerCase().trim() === (before ? 'before save' : 'after save')
    );
  }

  protected async HandleEntityActions(
    entity: BaseEntity,
    baseType: 'save' | 'delete' | 'validate',
    before: boolean,
    user: UserInfo
  ): Promise<ActionResult[]> {
    // use the EntityActionEngine for this
    try {
      const engine = EntityActionEngineServer.Instance;
      await engine.Config(false, user);
      const newRecord = entity.IsSaved ? false : true;
      const baseTypeType = baseType === 'save' ? (newRecord ? 'Create' : 'Update') : 'Delete';
      const invocationType = baseType === 'validate' ? 'Validate' : before ? 'Before' + baseTypeType : 'After' + baseTypeType;
      const invocationTypeEntity = engine.InvocationTypes.find((i) => i.Name === invocationType);
      if (!invocationTypeEntity) {
        LogError(`Invocation Type ${invocationType} not found in metadata`);
        return [];
        //            throw new Error(`Invocation Type ${invocationType} not found in metadata`);
      }

      const activeActions = engine.GetActionsByEntityNameAndInvocationType(entity.EntityInfo.Name, invocationType, 'Active');
      const results: ActionResult[] = [];
      for (const a of activeActions) {
        const result = await engine.RunEntityAction({
          EntityAction: a,
          EntityObject: entity,
          InvocationType: invocationTypeEntity,
          ContextUser: user,
        });
        results.push(result);
      }
      return results;
    } catch (e) {
      LogError(e);
      return [];
    }
  }

  /**
   * Handles Entity AI Actions. Parameters are setup for a future support of delete actions, but currently that isn't supported so the baseType parameter
   * isn't fully functional. If you pass in delete, the function will just exit for now, and in the future calling code will start working when we support
   * Delete as a trigger event for Entity AI Actions...
   * @param entity
   * @param baseType
   * @param before
   * @param user
   */
  protected async HandleEntityAIActions(entity: BaseEntity, baseType: 'save' | 'delete', before: boolean, user: UserInfo) {
    try {
      // TEMP while we don't support delete
      if (baseType === 'delete') return;

      // Make sure AI Metadata is loaded here...
      await AIEngine.Instance.Config(false, user);

      const actions = this.GetEntityAIActions(entity.EntityInfo, before); // get the actions we need to do for this entity
      if (actions && actions.length > 0) {
        const ai = AIEngine.Instance;
        for (let i = 0; i < actions.length; i++) {
          const a = actions[i];
          if ((a.TriggerEvent === 'before save' && before) || (a.TriggerEvent === 'after save' && !before)) {
            const p: EntityAIActionParams = {
              entityAIActionId: a.ID,
              entityRecord: entity,
              actionId: a.AIActionID,
              modelId: a.AIModelID,
            };
            if (before) {
              // do it with await so we're blocking, as it needs to complete before the record save continues
              await ai.ExecuteEntityAIAction(p);
            } else {
              // just add a task and move on, we are doing 'after save' so we don't wait
              try {
                QueueManager.AddTask('Entity AI Action', p, null, user);
              } catch (e) {
                LogError(e.message);
              }
            }
          }
        }
      }
    } catch (e) {
      LogError(e);
    }
  }

  public async Save(entity: BaseEntity, user: UserInfo, options: EntitySaveOptions): Promise<{}> {
    const entityResult = new BaseEntityResult();
    try {
      entity.RegisterTransactionPreprocessing();

      const bNewRecord = !entity.IsSaved;
      if (!options) options = new EntitySaveOptions();
      const bReplay = !!options.ReplayOnly;
      if (!bReplay && !bNewRecord && !entity.EntityInfo.AllowUpdateAPI) {
        // existing record and not allowed to update
        throw new Error(`UPDATE not allowed for entity ${entity.EntityInfo.Name}`);
      } 
      else if (!bReplay && bNewRecord && !entity.EntityInfo.AllowCreateAPI) {
        // new record and not allowed to create
        throw new Error(`CREATE not allowed for entity ${entity.EntityInfo.Name}`);
      } 
      else {
        // getting here means we are good to save, now check to see if we're dirty and need to save
        // REMEMBER - this is the provider and the BaseEntity/subclasses handle user-level permission checking already, we just make sure API was turned on for the operation
        if (entity.Dirty || options.IgnoreDirtyState || options.ReplayOnly) {
          entityResult.StartedAt = new Date();
          entityResult.Type = bNewRecord ? 'create' : 'update';
          entityResult.OriginalValues = entity.Fields.map((f) => {
            return { FieldName: f.Name, Value: f.Value };
          }); // save the original values before we start the process
          entity.ResultHistory.push(entityResult); // push the new result as we have started a process

          // The assumption is that Validate() has already been called by the BaseEntity object that is invoking this provider.
          // However, we have an extra responsibility in this situation which is to fire off the EntityActions for the Validate invocation type and
          // make sure they clear. If they don't clear we throw an exception with the message provided.
          if (!bReplay) {
            const validationResult = await this.HandleEntityActions(entity, 'validate', false, user);
            if (validationResult && validationResult.length > 0) {
              // one or more actions executed, see the reults and if any failed, concat their messages and return as exception being thrown
              const message = validationResult
                .filter((v) => !v.Success)
                .map((v) => v.Message)
                .join('\n\n');
              if (message) {
                entityResult.Success = false;
                entityResult.EndedAt = new Date();
                entityResult.Message = message;
                return false;
              }
            }
          } else {
            // we are in replay mode we so do NOT need to do the validation stuff, skipping it...
          }

          const spName = this.GetCreateUpdateSPName(entity, bNewRecord);
          if (options.SkipEntityActions !== true /*options set, but not set to skip entity actions*/) {
            await this.HandleEntityActions(entity, 'save', true, user);
          }

          if (options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/) {
            // process any Entity AI actions that are set to trigger BEFORE the save, these are generally a really bad idea to do before save
            // but they are supported (for now)
            await this.HandleEntityAIActions(entity, 'save', true, user);
          }

          const sSQL = this.GetSaveSQL(entity, bNewRecord, spName, user);

          if (entity.TransactionGroup && !bReplay /*we never participate in a transaction if we're in replay mode*/) {
            // we have a transaction group, need to play nice and be part of it
            entity.RaiseReadyForTransaction(); // let the entity know we're ready to be part of the transaction
            // we are part of a transaction group, so just add our query to the list
            // and when the transaction is committed, we will send all the queries at once
            this._bAllowRefresh = false; // stop refreshes of metadata while we're doing work
            entity.TransactionGroup.AddTransaction(
              new TransactionItem(entity, entityResult.Type === 'create' ? 'Create' : 'Update', sSQL, null, { dataSource: this._dataSource }, (results: any, success: boolean) => {
                // we get here whenever the transaction group does gets around to committing
                // our query.
                this._bAllowRefresh = true; // allow refreshes again
                entityResult.EndedAt = new Date();
                if (success && results) {
                  // process any Entity AI actions that are set to trigger AFTER the save
                  // these are fired off but are NOT part of the transaction group, so if they fail,
                  // the transaction group will still commit, but the AI action will not be executed
                  if (options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/) {
                    this.HandleEntityAIActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY
                  }

                  // Same approach to Entity Actions as Entity AI Actions
                  if (options.SkipEntityActions !== true) {
                    this.HandleEntityActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY
                  }

                  entityResult.Success = true;
                  entityResult.NewValues = results[0];
                } 
                else {
                  // the transaction failed, nothing to update, but we need to call Reject so the
                  // promise resolves with a rejection so our outer caller knows
                  entityResult.Success = false;
                  entityResult.Message = 'Transaction Failed';
                }
              })
            );

            return true; // we're part of a transaction group, so we're done here
          } 
          else {
            // no transaction group, just execute this immediately...
            this._bAllowRefresh = false; // stop refreshes of metadata while we're doing work

            let result;
            if (bReplay) {
              result = [entity.GetAll()]; // just return the entity as it was before the save as we are NOT saving anything as we are in replay mode
            }
            else {
              result = await this.ExecuteSQL(sSQL);
            }

            this._bAllowRefresh = true; // allow refreshes now

            entityResult.EndedAt = new Date();
            if (result && result.length > 0) {
              // Entity AI Actions - fired off async, NO await on purpose
              if (options.SkipEntityAIActions !== true /*options set, but not set to skip entity AI actions*/)
                this.HandleEntityAIActions(entity, 'save', false, user); // fire off any AFTER SAVE AI actions, but don't wait for them

              // Entity Actions - fired off async, NO await on purpose
              if (options.SkipEntityActions !== true) this.HandleEntityActions(entity, 'save', false, user); // NO AWAIT INTENTIONALLY

              entityResult.Success = true;
              return result[0];
            } else throw new Error(`SQL Error: No result row returned from SQL: ` + sSQL);
          }
        } 
        else {
          return entity; // nothing to save, just return the entity
        }
      }
    } catch (e) {
      this._bAllowRefresh = true; // allow refreshes again if we get a failure here
      entityResult.EndedAt = new Date();
      entityResult.Message = e.message;
      LogError(e);
      throw e; // rethrow the error
    }
  }

  /**
   * Returns the stored procedure name to use for the given entity based on if it is a new record or an existing record.
   * @param entity 
   * @param bNewRecord 
   * @returns 
   */
  public GetCreateUpdateSPName(entity: BaseEntity, bNewRecord: boolean): string {
    const spName = bNewRecord
    ? entity.EntityInfo.spCreate?.length > 0
      ? entity.EntityInfo.spCreate
      : 'spCreate' + entity.EntityInfo.BaseTable
    : entity.EntityInfo.spUpdate?.length > 0
      ? entity.EntityInfo.spUpdate
      : 'spUpdate' + entity.EntityInfo.BaseTable;
    return spName;
  } 

  private getAllEntityColumnsSQL(entityInfo: EntityInfo): string {
    let sRet: string = '',
      outputCount: number = 0;
    for (let i = 0; i < entityInfo.Fields.length; i++) {
      const f = entityInfo.Fields[i];
      if (outputCount !== 0) sRet += ',\n';
      sRet += '[' + f.Name + '] ' + f.SQLFullType + ' ' + (f.AllowsNull || f.IsVirtual? 'NULL' : 'NOT NULL');
      outputCount++;
    }
    return sRet;
  }

  private generateSPParams(entity: BaseEntity, isUpdate: boolean): string {
    let sRet: string = '',
      bFirst: boolean = true;
    for (let i = 0; i < entity.EntityInfo.Fields.length; i++) {
      const f = entity.EntityInfo.Fields[i];
      if (f.AllowUpdateAPI) {
        if (!f.SkipValidation) {
          // DO NOT INCLUDE any fields where we skip validation, these are fields that are not editable by the user/object
          // model/api because they're special fields like ID, CreatedAt, etc. or they're virtual or auto-increment, etc.
          let value = entity.Get(f.Name);
          if (f.Type.trim().toLowerCase() === 'datetimeoffset') {
            value = new Date(value).toISOString();
          } else if (!isUpdate && f.Type.trim().toLowerCase() === 'uniqueidentifier') {
            // in the case of unique identifiers, for CREATE procs only,
            // we need to check to see if the value we have in the entity object is a function like newid() or newsquentialid()
            // in those cases we should just skip the parameter entirely because that means there is a default value that should be used
            // and that will be handled by the database not by us
            // instead of just checking for specific functions like newid(), we can instead check for any string that includes ()
            // this way we can handle any function that the database might support in the future
            if (typeof value === 'string' && value.includes('()')) {
              continue; // skip this field entirely by going to the next iteration of the loop
            }
          }

          // if we get here, we have a value that we need to include in the SP call
          sRet += this.generateSingleSPParam(f, value, bFirst);
          bFirst = false;
        }
      }
    }
    if (isUpdate && bFirst === false) {
      // this is an update and we have other fields, so we need to add all of the pkeys to the end of the SP call
      for (let pkey of entity.PrimaryKey.KeyValuePairs) {
        const f = entity.EntityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === pkey.FieldName.trim().toLowerCase());
        const pkeyQuotes = f.NeedsQuotes ? "'" : '';
        sRet += `, @${f.CodeName} = ` + pkeyQuotes + pkey.Value + pkeyQuotes; // add pkey to update SP at end, but only if other fields included
      }
      bFirst = false;
    }

    return sRet;
  }

  private generateSingleSPParam(f: EntityFieldInfo, value: string, isFirst: boolean): string {
    let sRet: string = '';
    let quotes: string = '';
    let val: any = value;

    switch (f.TSType) {
      case EntityFieldTSType.Boolean:
        // check to see if the value is a string and if it is equal to true, if so, set the value to 1
        if (typeof value === 'string' && value.trim().toLowerCase() === 'true') val = 1;
        else if (typeof value === 'string' && value.trim().toLowerCase() === 'false') val = 0;
        else val = value ? 1 : 0;
        break;
      case EntityFieldTSType.String:
        quotes = "'";
        break;
      case EntityFieldTSType.Date:
        quotes = "'";
        if (val !== null && val !== undefined) {
          if (typeof val === 'number') {
            // we have a timestamp - milliseconds since Unix Epoch
            // convert to a date
            val = new Date(val);
          } else if (typeof val === 'string') {
            // we have a string, attempt to convert it to a date object
            val = new Date(val);
          }
          val = val.toISOString(); // convert the date to ISO format for storage in the DB
        }
        break;
      default:
        break;
    }
    if (!isFirst) sRet += ',\n                ';

    sRet += `@${f.CodeName}=${this.packageSPParam(val, quotes)}`;

    return sRet;
  }

  protected packageSPParam(paramValue: any, quoteString: string) {
    let pVal: any;
    if (typeof paramValue === 'string') {
      if (quoteString === "'") pVal = paramValue.toString().replace(/'/g, "''");
      else if (quoteString === '"') pVal = paramValue.toString().replace(/"/g, '""');
      else pVal = paramValue;
    } else pVal = paramValue;

    return paramValue === null || paramValue === undefined ? 'NULL' : quoteString + pVal + quoteString;
  }

  protected GetLogRecordChangeSQL(
    newData: any,
    oldData: any,
    entityName: string,
    recordID: any,
    entityInfo: EntityInfo,
    type: 'Create' | 'Update' | 'Delete',
    user: UserInfo,
    wrapRecordIdInQuotes: boolean
  ) {
    const fullRecordJSON: string = JSON.stringify(this.escapeQuotesInProperties(newData ? newData : oldData, "'")); // stringify old data if we don't have new - means we are DELETING A RECORD
    const changes: any = this.DiffObjects(oldData, newData, entityInfo, "'");
    const changesKeys = changes ? Object.keys(changes) : [];
    if (changesKeys.length > 0 || oldData === null /*new record*/ || newData === null /*deleted record*/) {
      const changesJSON: string = changes !== null ? JSON.stringify(changes) : '';
      const quotes = wrapRecordIdInQuotes ? "'" : '';
      const sSQL = `EXEC [${this.MJCoreSchemaName}].spCreateRecordChange_Internal @EntityName='${entityName}',
                                                                                        @RecordID=${quotes}${recordID}${quotes},
                                                                                        @UserID='${user.ID}',
                                                                                        @Type='${type}',
                                                                                        @ChangesJSON='${changesJSON}',
                                                                                        @ChangesDescription='${oldData && newData ? this.CreateUserDescriptionOfChanges(changes) : !oldData ? 'Record Created' : 'Record Deleted'}',
                                                                                        @FullRecordJSON='${fullRecordJSON}',
                                                                                        @Status='Complete',
                                                                                        @Comments=null`;
      return sSQL;
    } else return null;
  }
  protected async LogRecordChange(
    newData: any,
    oldData: any,
    entityName: string,
    recordID: any,
    entityInfo: EntityInfo,
    type: 'Create' | 'Update' | 'Delete',
    user: UserInfo
  ) {
    const sSQL = this.GetLogRecordChangeSQL(newData, oldData, entityName, recordID, entityInfo, type, user, true);
    if (sSQL) {
      const result = await this.ExecuteSQL(sSQL);
      return result;
    }
  }

  /**
   * This method will create a human-readable string that describes the changes object that was created using the DiffObjects() method
   * @param changesObject JavaScript object that has properties for each changed field that in turn have field, oldValue and newValue as sub-properties
   * @param maxValueLength If not specified, default value of 200 characters applies where any values after the maxValueLength is cut off. The actual values are stored in the ChangesJSON and FullRecordJSON in the RecordChange table, this is only for the human-display
   * @param cutOffText If specified, and if maxValueLength applies to any of the values being included in the description, this cutOffText param will be appended to the end of the cut off string to indicate to the human reader that the value is partial.
   * @returns
   */
  public CreateUserDescriptionOfChanges(changesObject: any, maxValueLength: number = 200, cutOffText: string = '...'): string {
    let sRet = '';
    let keys = Object.keys(changesObject);
    for (let i = 0; i < keys.length; i++) {
      const change = changesObject[keys[i]];
      if (sRet.length > 0) {
        sRet += '\n';
      }
      if (change.oldValue && change.newValue)
        // both old and new values set, show change
        sRet += `${change.field} changed from ${this.trimString(change.oldValue, maxValueLength, cutOffText)} to ${this.trimString(change.newValue, maxValueLength, cutOffText)}`;
      else if (change.newValue)
        // old value was blank, new value isn't
        sRet += `${change.field} set to ${this.trimString(change.newValue, maxValueLength, cutOffText)}`;
      else if (change.oldValue)
        // new value is blank, old value wasn't
        sRet += `${change.field} cleared from ${this.trimString(change.oldValue, maxValueLength, cutOffText)}`;
    }
    return sRet.replace(/'/g, "''");
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
        } else sRet[key] = element;
      }
    }
    return sRet;
  }

  /**
   * This method will create a changes object by comparing two javascript objects. Each property of the object will be named by the
   * field name in the newData/oldData and will have a sub-object with the following properties:
   *  * field: the field name
   *  * oldValue: the old value
   *  * newValue: the new value
   * This is used to generate the object that will be saved into the ChangesJSON field in the Record Changes entity.
   */
  public DiffObjects(oldData: any, newData: any, entityInfo: EntityInfo, quoteToEscape: string): any {
    if (!oldData || !newData) return null;
    else {
      const changes: any = {};
      for (const key in newData) {
        const f = entityInfo.Fields.find((f) => f.Name.toLowerCase() === key.toLowerCase());
        let bDiff: boolean = false;
        if (f.ReadOnly)
          bDiff = false; // read only fields are never different, they can change in the database, but we don't consider them to be a change for record changes purposes.
        else if ((oldData[key] == undefined || oldData[key] == null) && (newData[key] == undefined || newData[key] == null))
          bDiff = false; // this branch of logic ensures that undefined and null are treated the same
        else {
          switch (f.TSType) {
            case EntityFieldTSType.String:
              bDiff = oldData[key] !== newData[key];
              break;
            case EntityFieldTSType.Date:
              bDiff = new Date(oldData[key]).getTime() !== new Date(newData[key]).getTime();
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
          const o =
            oldData[key] && typeof oldData[key] === 'string' ? oldData[key].replace(r, quoteToEscape + quoteToEscape) : oldData[key];
          const n =
            newData[key] && typeof newData[key] === 'string' ? newData[key].replace(r, quoteToEscape + quoteToEscape) : newData[key];

          changes[key] = {
            field: key,
            oldValue: o,
            newValue: n,
          };
        }
      }

      return changes;
    }
  }

  public async Load(
    entity: BaseEntity,
    CompositeKey: CompositeKey,
    EntityRelationshipsToLoad: string[] = null,
    user: UserInfo
  ): Promise<{}> {
    const where = CompositeKey.KeyValuePairs.map((val) => {
      const pk = entity.EntityInfo.PrimaryKeys.find((pk) => pk.Name.trim().toLowerCase() === val.FieldName.trim().toLowerCase());
      if (!pk) throw new Error(`Primary key ${val.FieldName} not found in entity ${entity.EntityInfo.Name}`);
      const quotes = pk.NeedsQuotes ? "'" : '';
      return `[${pk.CodeName}]=${quotes}${val.Value}${quotes}`;
    }).join(' AND ');

    const sql = `SELECT * FROM [${entity.EntityInfo.SchemaName}].${entity.EntityInfo.BaseView} WHERE ${where}`;
    const d = await this.ExecuteSQL(sql);
    if (d && d.length > 0) {
      // got the record, now process the relationships if there are any
      const ret = d[0];
      if (EntityRelationshipsToLoad && EntityRelationshipsToLoad.length > 0) {
        for (let i = 0; i < EntityRelationshipsToLoad.length; i++) {
          const rel = EntityRelationshipsToLoad[i];
          const relInfo = entity.EntityInfo.RelatedEntities.find((r) => r.RelatedEntity == rel);
          if (relInfo) {
            let relSql: string = '';
            const relEntitySchemaName = this.Entities.find(
              (e) => e.Name.trim().toLowerCase() === relInfo.RelatedEntity.trim().toLowerCase()
            )?.SchemaName;
            const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
            if (relInfo.Type.trim().toLowerCase() === 'one to many')
              // one to many - simple query
              relSql = `  SELECT
                                            *
                                        FROM
                                            [${relEntitySchemaName}].[${relInfo.RelatedEntityBaseView}]
                                        WHERE
                                            [${relInfo.RelatedEntityJoinField}] = ${quotes}${ret[entity.FirstPrimaryKey.Name]}${quotes}`;
            // don't yet support composite foreign keys
            // many to many - need to use join view
            else
              relSql = `  SELECT
                                            _theview.*
                                        FROM
                                            [${relEntitySchemaName}].[${relInfo.RelatedEntityBaseView}] _theview
                                        INNER JOIN
                                            [${relEntitySchemaName}].[${relInfo.JoinView}] _jv ON _theview.[${relInfo.RelatedEntityJoinField}] = _jv.[${relInfo.JoinEntityInverseJoinField}]
                                        WHERE
                                            _jv.${relInfo.JoinEntityJoinField} = ${quotes}${ret[entity.FirstPrimaryKey.Name]}${quotes}`; // don't yet support composite foreign keys

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

  protected GetDeleteSQL(entity: BaseEntity, user: UserInfo): string {
    let sSQL: string = '';
    const spName: string = entity.EntityInfo.spDelete ? entity.EntityInfo.spDelete : `spDelete${entity.EntityInfo.ClassName}`;
    const sParams = entity.PrimaryKey.KeyValuePairs.map((kv) => {
      const f = entity.EntityInfo.Fields.find((f) => f.Name.trim().toLowerCase() === kv.FieldName.trim().toLowerCase());
      const quotes = f.NeedsQuotes ? "'" : '';
      return `@${f.CodeName}=${quotes}${kv.Value}${quotes}`;
    }).join(', ');
    const sSimpleSQL: string = `EXEC [${entity.EntityInfo.SchemaName}].[${spName}] ${sParams}`;
    const recordChangesEntityInfo = this.Entities.find((e) => e.Name === 'Record Changes');

    if (entity.EntityInfo.TrackRecordChanges && entity.EntityInfo.Name.trim().toLowerCase() !== 'record changes') {
      // don't track changes for the record changes entity
      const oldData = entity.GetAll(true); // get all the OLD values
      const sTableDeclare: string = entity.PrimaryKeys.map((pk) => {
        return `${pk.CodeName} ${pk.EntityFieldInfo.SQLFullType}`;
      }).join(', ');
      const sVariableDeclare: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName} ${pk.EntityFieldInfo.SQLFullType}`;
      }).join(', ');
      const sSelectDeclare: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName}=${pk.CodeName}`;
      }).join(', ');
      const sIF: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName} IS NOT NULL`;
      }).join(' AND ');
      const sCombinedPrimaryKey: string = entity.PrimaryKey.ToConcatenatedString();
      const sReturnList: string = entity.PrimaryKeys.map((pk) => {
        return `@${pk.CodeName} AS [${pk.Name}]`;
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
                        ${this.GetLogRecordChangeSQL(null /*pass in null for new data for deleted records*/, oldData, entity.EntityInfo.Name, sCombinedPrimaryKey, entity.EntityInfo, 'Delete', user, true)}
                    END

                    SELECT ${sReturnList}`;
    } else {
      // no record change tracking
      // just delete the record
      sSQL = sSimpleSQL;
    }
    return sSQL;
  }

  public async Delete(entity: BaseEntity, options: EntityDeleteOptions, user: UserInfo): Promise<boolean> {
    const result = new BaseEntityResult();
    try {
      entity.RegisterTransactionPreprocessing();

      if (!options) options = new EntityDeleteOptions();

      const bReplay = options.ReplayOnly;

      if (!entity.IsSaved && !bReplay)
        // existing record and not allowed to update
        throw new Error(`Delete() isn't callable for records that haven't yet been saved - ${entity.EntityInfo.Name}`);
      if (!entity.EntityInfo.AllowDeleteAPI && !bReplay)
        // not allowed to delete
        throw new Error(`Delete() isn't callable for ${entity.EntityInfo.Name} as AllowDeleteAPI is false`);

      result.StartedAt = new Date();
      result.Type = 'delete';
      result.OriginalValues = entity.Fields.map((f) => {
        return { FieldName: f.Name, Value: f.Value };
      }); // save the original values before we start the process
      entity.ResultHistory.push(result); // push the new result as we have started a process

      // REMEMBER - this is the provider and the BaseEntity/subclasses handle user-level permission checking already, we just make sure API was turned on for the operation
      // if we get here we can delete, so build the SQL and then handle appropriately either as part of TransGroup or directly...

      const sSQL = this.GetDeleteSQL(entity, user);

      // Handle Entity and Entity AI Actions here w/ before and after handling
      if (false === options?.SkipEntityActions) await this.HandleEntityActions(entity, 'delete', true, user);
      if (false === options?.SkipEntityAIActions) await this.HandleEntityAIActions(entity, 'delete', true, user);

      if (entity.TransactionGroup && !bReplay) {
        // we have a transaction group, need to play nice and be part of it
        entity.RaiseReadyForTransaction();
        // we are part of a transaction group, so just add our query to the list
        // and when the transaction is committed, we will send all the queries at once
        entity.TransactionGroup.AddTransaction(
          new TransactionItem(entity, 'Delete', sSQL, null, { dataSource: this._dataSource }, (results: any, success: boolean) => {
            // we get here whenever the transaction group does gets around to committing
            // our query.
            result.EndedAt = new Date();
            if (success && results) {
              // Entity AI Actions and Actions - fired off async, NO await on purpose
              if (false === options?.SkipEntityActions) {
                this.HandleEntityActions(entity, 'delete', false, user);
              }
              if (false === options?.SkipEntityAIActions) {
                this.HandleEntityAIActions(entity, 'delete', false, user);
              }

              // Make sure the return value matches up as that is how we know the SP was succesfully internally
              for (let key of entity.PrimaryKeys) {
                if (key.Value !== results[0][key.Name]) {
                  result.Success = false;
                  result.Message = 'Transaction failed to commit';
                }
              }
              result.NewValues = results;
              result.Success = true;
            }
            else {
              // the transaction failed, nothing to update, but we need to call Reject so the
              // promise resolves with a rejection so our outer caller knows
              result.Success = false;
              result.Message = 'Transaction failed to commit';
            }
          })
        );

        return true; // we're part of a transaction group, so we're done here
      } 
      else {
        let d;
        if (bReplay)
          d = [entity.GetAll()]; // just return the entity as it was before the save as we are NOT saving anything as we are in replay mode
        else d = await this.ExecuteSQL(sSQL);

        if (d && d[0]) {
          // SP executed, now make sure the return value matches up as that is how we know the SP was succesfully internally
          for (let key of entity.PrimaryKeys) {
            if (key.Value !== d[0][key.Name]) return false;
          }

          // Entity AI Actions and Actions - fired off async, NO await on purpose
          this.HandleEntityActions(entity, 'delete', false, user);
          this.HandleEntityAIActions(entity, 'delete', false, user);

          result.EndedAt = new Date();
          return true;
        } 
        else {
          result.Message = 'No result returned from SQL';
          result.EndedAt = new Date();
          return false;
        }
      }
    } 
    catch (e) {
      result.Message = e.message;
      result.Success = false;
      result.EndedAt = new Date();
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
                        di.*,
                        e.BaseView EntityBaseView,
                        e.SchemaName EntitySchemaName,
                        di.__mj_UpdatedAt AS DatasetItemUpdatedAt,
                        d.__mj_UpdatedAt AS DatasetUpdatedAt
                    FROM
                        [${this.MJCoreSchemaName}].vwDatasets d
                    INNER JOIN
                        [${this.MJCoreSchemaName}].vwDatasetItems di
                    ON
                        d.ID = di.DatasetID
                    INNER JOIN
                        [${this.MJCoreSchemaName}].vwEntities e
                    ON
                        di.EntityID = e.ID
                    WHERE
                        d.Name = @0`;

    const items = await this.ExecuteSQL(sSQL, [datasetName]);
    // now we have the dataset and the items, we need to get the update date from the items underlying entities

    if (items && items.length > 0) {
      // fire off all of the item queries in parallel
      const promises = items.map((item) => {
        return this.GetDatasetItem(item, itemFilters, datasetName); // no await as Promise.All used below
      });

      // execute all promises in parallel
      const results = await Promise.all(promises);

      // determine overall success
      const bSuccess = results.every((result) => result.Success);

      // get the latest update date from all the results
      const latestUpdateDate = results.reduce(
        (acc, result) => {
          if (result.LatestUpdatedDate && result.LatestUpdatedDate > acc) {
            return result.LatestUpdatedDate;
          }
          return acc;
        },
        new Date(1900, 1, 1)
      );

      return {
        DatasetID: items[0].DatasetID,
        DatasetName: datasetName,
        Success: bSuccess,
        Status: '',
        LatestUpdateDate: latestUpdateDate,
        Results: results,
      };
    } else {
      return {
        DatasetID: '',
        DatasetName: datasetName,
        Success: false,
        Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
        LatestUpdateDate: null,
        Results: null,
      };
    }
  }

  protected async GetDatasetItem(item: any, itemFilters, datasetName): Promise<DatasetItemResultType> {
    let filterSQL = '';
    if (itemFilters && itemFilters.length > 0) {
      const filter = itemFilters.find((f) => f.ItemCode === item.Code);
      if (filter) filterSQL = (item.WhereClause ? ' AND ' : ' WHERE ') + '(' + filter.Filter + ')';
    }

    const itemUpdatedAt = new Date(item.DatasetItemUpdatedAt);
    const datasetUpdatedAt = new Date(item.DatasetUpdatedAt);
    const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime()));

    const columns = this.GetColumnsForDatasetItem(item, datasetName);
    if (!columns) {
      // failure condition within columns, return a failed result
      return {
        EntityID: item.EntityID,
        EntityName: item.Entity,
        Code: item.Code,
        Results: null,
        LatestUpdateDate: null,
        Status: 'Invalid columns specified for dataset item',
        Success: false,
      };
    }
    const itemSQL = `SELECT ${columns} FROM [${item.EntitySchemaName}].[${item.EntityBaseView}] ${item.WhereClause ? 'WHERE ' + item.WhereClause : ''}${filterSQL}`;
    const itemData = await this.ExecuteSQL(itemSQL);

    // get the latest update date
    let latestUpdateDate = new Date(1900, 1, 1);
    if (itemData && itemData.length > 0) {
      itemData.forEach((data) => {
        if (data[item.DateFieldToCheck] && new Date(data[item.DateFieldToCheck]) > latestUpdateDate) {
          latestUpdateDate = new Date(data[item.DateFieldToCheck]);
        }
      });
    }

    // finally, compare the latestUpdatedDate to the dataset max date, and use the latter if it is more recent
    if (datasetMaxUpdatedAt > latestUpdateDate) {
      latestUpdateDate = datasetMaxUpdatedAt;
    }

    return {
      EntityID: item.EntityID,
      EntityName: item.Entity,
      Code: item.Code,
      Results: itemData,
      LatestUpdateDate: latestUpdateDate,
      Success: itemData !== null && itemData !== undefined,
    };
  }

  /**
   * Gets column info for a dataset item, which might be * for all columns or if a Columns field was provided in the DatasetItem table,
   * attempts to use those columns assuming they are valid.
   * @param item
   * @param datasetName
   * @returns
   */
  protected GetColumnsForDatasetItem(item: any, datasetName: string): string {
    const specifiedColumns = item.Columns ? item.Columns.split(',').map((col) => col.trim()) : [];
    if (specifiedColumns.length > 0) {
      // validate that the columns specified are valid within the entity metadata
      const entity = this.Entities.find((e) => e.ID === item.EntityID);
      if (!entity && this.Entities.length > 0) {
        // we have loaded entities (e.g. Entites.length > 0) but the entity wasn't found, log an error and return a failed result
        // the reason we continue below if we have NOT loaded Entities is that when the system first bootstraps, DATASET gets loaded
        // FIRST before Entities are loaded to load the entity metadata so this would ALWAYS fail :)

        // entity not found, return a failed result, shouldn't ever get here  due to the foreign key constraint on the table
        LogError(`Entity not found for dataset item ${item.Code} in dataset ${datasetName}`);
        return null;
      } else {
        if (entity) {
          // have a valid entity, now make sure that all of the columns specified are valid
          // only do the column validity check if we have an entity, we can get here if the entity wasn't found IF we haven't loaded entities yet per above comment
          const invalidColumns: string[] = [];

          specifiedColumns.forEach((col) => {
            if (!entity.Fields.find((f) => f.Name.trim().toLowerCase() === col.trim().toLowerCase())) {
              invalidColumns.push(col);
            }
          });
          if (invalidColumns.length > 0) {
            LogError(`Invalid columns specified for dataset item ${item.Code} in dataset ${datasetName}: ${invalidColumns.join(', ')}`);
            return null;
          }
        }

        // check to see if the specified columns include the DateFieldToCheck
        // in the below we only check entity metadata if we have it, if we don't have it, we just add the special fields back in
        if (item.DateFieldToCheck && item.DateFieldToCheck.trim().length > 0 && specifiedColumns.indexOf(item.DateFieldToCheck) === -1) {
          // we only check the entity if we have it, otherwise we just add it back in
          if (!entity || entity.Fields.find((f) => f.Name.trim().toLowerCase() === item.DateFieldToCheck.trim().toLowerCase()))
            specifiedColumns.push(item.DateFieldToCheck);
        }
      }
    }
    return specifiedColumns.length > 0 ? specifiedColumns.map((colName) => `[${colName.trim()}]`).join(',') : '*';
  }

  public async GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetStatusResultType> {
    const sSQL = `
            SELECT
                di.*,
                e.BaseView EntityBaseView,
                e.SchemaName EntitySchemaName,
                d.__mj_UpdatedAt AS DatasetUpdatedAt,
                di.__mj_UpdatedAt AS DatasetItemUpdatedAt
            FROM
                [${this.MJCoreSchemaName}].vwDatasets d
            INNER JOIN
                [${this.MJCoreSchemaName}].vwDatasetItems di
            ON
                d.ID = di.DatasetID
            INNER JOIN
                [${this.MJCoreSchemaName}].vwEntities e
            ON
                di.EntityID = e.ID
            WHERE
                d.Name = @0`;

    const items = await this.ExecuteSQL(sSQL, [datasetName]);

    // now we have the dataset and the items, we need to get the update date from the items underlying entities
    if (items && items.length > 0) {
      // loop through each of the items and get the update date from the underlying entity by building a combined UNION ALL SQL statement
      let combinedSQL = '';
      const updateDates: DatasetStatusEntityUpdateDateType[] = [];

      items.forEach((item, index) => {
        let filterSQL = '';
        if (itemFilters && itemFilters.length > 0) {
          const filter = itemFilters.find((f) => f.ItemCode === item.Code);
          if (filter) filterSQL = ' WHERE ' + filter.Filter;
        }
        const itemUpdatedAt = new Date(item.DatasetItemUpdatedAt);
        const datasetUpdatedAt = new Date(item.DatasetUpdatedAt);
        const datasetMaxUpdatedAt = new Date(Math.max(itemUpdatedAt.getTime(), datasetUpdatedAt.getTime())).toISOString();

        const itemSQL = `SELECT
                                        CASE
                                            WHEN MAX(${item.DateFieldToCheck}) > '${datasetMaxUpdatedAt}' THEN MAX(${item.DateFieldToCheck})
                                            ELSE '${datasetMaxUpdatedAt}'
                                        END AS UpdateDate,
                                        COUNT(*) AS TheRowCount,
                                        '${item.EntityID}' AS EntityID,
                                        '${item.Entity}' AS EntityName
                                 FROM
                                    [${item.EntitySchemaName}].[${item.EntityBaseView}]${filterSQL}`;
        combinedSQL += itemSQL;
        if (index < items.length - 1) {
          combinedSQL += ' UNION ALL ';
        }
      });
      const itemUpdateDates = await this.ExecuteSQL(combinedSQL);

      if (itemUpdateDates && itemUpdateDates.length > 0) {
        let latestUpdateDate = new Date(1900, 1, 1);

        itemUpdateDates.forEach((itemUpdate) => {
          const updateDate = new Date(itemUpdate.UpdateDate);
          updateDates.push({
            EntityID: itemUpdate.EntityID,
            EntityName: itemUpdate.EntityName,
            RowCount: itemUpdate.TheRowCount,
            UpdateDate: updateDate,
          });

          if (updateDate > latestUpdateDate) {
            latestUpdateDate = updateDate;
          }
        });

        return {
          DatasetID: items[0].DatasetID,
          DatasetName: datasetName,
          Success: true,
          Status: '',
          LatestUpdateDate: latestUpdateDate,
          EntityUpdateDates: updateDates,
        };
      } else {
        return {
          DatasetID: items[0].DatasetID,
          DatasetName: datasetName,
          Success: false,
          Status: 'No update dates found for DatasetName: ' + datasetName,
          LatestUpdateDate: null,
          EntityUpdateDates: null,
        };
      }
    } else {
      return {
        DatasetID: '',
        DatasetName: datasetName,
        Success: false,
        Status: 'No Dataset or Items found for DatasetName: ' + datasetName,
        EntityUpdateDates: null,
        LatestUpdateDate: null,
      };
    }
  }

  protected async GetApplicationMetadata(): Promise<ApplicationInfo[]> {
    const apps = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwApplications`, null);
    const appEntities = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwApplicationEntities ORDER BY ApplicationName`);
    const ret: ApplicationInfo[] = [];
    for (let i = 0; i < apps.length; i++) {
      ret.push(
        new ApplicationInfo(this, {
          ...apps[i],
          ApplicationEntities: appEntities.filter((ae) => ae.ApplicationName.trim().toLowerCase() === apps[i].Name.trim().toLowerCase()),
        })
      );
    }
    return ret;
  }

  protected async GetAuditLogTypeMetadata(): Promise<AuditLogTypeInfo[]> {
    const alts = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuditLogTypes`, null);
    const ret: AuditLogTypeInfo[] = [];
    for (let i = 0; i < alts.length; i++) {
      const alt = new AuditLogTypeInfo(alts[i]);
      ret.push(alt);
    }
    return ret;
  }

  protected async GetUserMetadata(): Promise<UserInfo[]> {
    const users = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUsers`, null);
    const userRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUserRoles ORDER BY UserID`);
    const ret: UserInfo[] = [];
    for (let i = 0; i < users.length; i++) {
      ret.push(
        new UserInfo(this, {
          ...users[i],
          UserRoles: userRoles.filter((ur) => ur.UserID === users[i].ID),
        })
      );
    }
    return ret;
  }

  protected async GetAuthorizationMetadata(): Promise<AuthorizationInfo[]> {
    const auths = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuthorizations`, null);
    const authRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwAuthorizationRoles ORDER BY AuthorizationName`);
    const ret: AuthorizationInfo[] = [];
    for (let i = 0; i < auths.length; i++) {
      ret.push(
        new AuthorizationInfo(this, {
          ...auths[i],
          AuthorizationRoles: authRoles.filter((ar) => ar.AuthorizationName.trim().toLowerCase() === auths[i].Name.trim().toLowerCase()),
        })
      );
    }
    return ret;
  }

  protected async GetCurrentUser(): Promise<UserInfo> {
    if (this.CurrentUser) return this.CurrentUser;
    else if (this._currentUserEmail && this._currentUserEmail.length > 0) {
      // attempt to lookup current user from email since this.CurrentUser is null for some reason (unexpected)
      if (UserCache && UserCache.Users)
        return UserCache.Users.find((u) => u.Email.trim().toLowerCase() === this._currentUserEmail.trim().toLowerCase());
    }
    // if we get here we can't get the current user
    return null;
  }

  protected async GetCurrentUserMetadata(): Promise<UserInfo> {
    const user = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUsers WHERE Email='${this._currentUserEmail}'`);
    if (user && user.length === 1) {
      const userRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUserRoles WHERE UserID='${user[0].ID}'`);
      return new UserInfo(this, {
        ...user[0],
        UserRoles: userRoles ? userRoles : [],
      });
    } else return null;
  }

  protected async GetRoleMetadata(): Promise<RoleInfo[]> {
    const roles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwRoles`, null);
    const ret: RoleInfo[] = [];
    for (let i = 0; i < roles.length; i++) {
      const ri = new RoleInfo(roles[i]);
      ret.push(ri);
    }
    return ret;
  }

  protected async GetUserRoleMetadata(): Promise<UserRoleInfo[]> {
    const userRoles = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwUserRoles`, null);
    const ret: UserRoleInfo[] = [];
    for (let i = 0; i < userRoles.length; i++) {
      const uri = new UserRoleInfo(userRoles[i]);
      ret.push(uri);
    }
    return ret;
  }

  protected async GetRowLevelSecurityFilterMetadata(): Promise<RowLevelSecurityFilterInfo[]> {
    const filters = await this.ExecuteSQL(`SELECT * FROM [${this.MJCoreSchemaName}].vwRowLevelSecurityFilters`, null);
    const ret: RowLevelSecurityFilterInfo[] = [];
    for (let i = 0; i < filters.length; i++) {
      const rlsfi = new RowLevelSecurityFilterInfo(filters[i]);
      ret.push(rlsfi);
    }
    return ret;
  }

  /**
   * This method can be used to execute raw SQL statements outside of the MJ infrastructure.
   * *CAUTION* - use this method with great care.
   * @param query
   * @param parameters
   * @returns
   */
  public async ExecuteSQL(query: string, parameters: any = null): Promise<any> {
    try {
      if (this._queryRunner) {
        const data = await this._queryRunner.query(query, parameters);
        return data;
      } else {
        const data = await this._dataSource.query(query, parameters);
        return data;
      }
    } catch (e) {
      LogError(e);
      throw e; // force caller to handle
    }
  }

  protected async BeginTransaction() {
    try {
      if (!this._queryRunner) this._queryRunner = this._dataSource.createQueryRunner();

      await this._queryRunner.startTransaction();
    } catch (e) {
      LogError(e);
      throw e; // force caller to handle
    }
  }

  protected async CommitTransaction() {
    try {
      await this._queryRunner.commitTransaction();
    } catch (e) {
      LogError(e);
      throw e; // force caller to handle
    }
  }

  protected async RollbackTransaction() {
    try {
      await this._queryRunner.rollbackTransaction();
    } catch (e) {
      LogError(e);
      throw e; // force caller to handle
    }
  }

  get LocalStorageProvider(): ILocalStorageProvider {
    if (!this._localStorageProvider) this._localStorageProvider = new NodeLocalStorageProvider();

    return this._localStorageProvider;
  }

  public async GetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
    const result: EntityRecordNameResult[] = [];
    for (let i = 0; i < info.length; i++) {
      const r = await this.GetEntityRecordName(info[i].EntityName, info[i].CompositeKey);
      result.push({
        EntityName: info[i].EntityName,
        CompositeKey: info[i].CompositeKey,
        RecordName: r,
        Success: r ? true : false,
        Status: r ? 'Success' : 'Error',
      });
    }
    return result;
  }

  public async GetEntityRecordName(entityName: string, CompositeKey: CompositeKey): Promise<string> {
    try {
      const sql = this.GetEntityRecordNameSQL(entityName, CompositeKey);
      if (sql) {
        const data = await this.ExecuteSQL(sql);
        if (data && data.length === 1) {
          const fields = Object.keys(data[0]);
          return data[0][fields[0]]; // return first field
        } else {
          LogError(`Entity ${entityName} record ${CompositeKey.ToString()} not found, returning null`);
          return null;
        }
      }
    } catch (e) {
      LogError(e);
      return null;
    }
  }

  protected GetEntityRecordNameSQL(entityName: string, CompositeKey: CompositeKey): string {
    const e = this.Entities.find((e) => e.Name === entityName);
    if (!e) throw new Error(`Entity ${entityName} not found`);
    else {
      let f = e.Fields.find((f) => f.IsNameField);
      if (!f) f = e.Fields.find((f) => f.Name === 'Name');
      if (!f) {
        LogError(`Entity ${entityName} does not have an IsNameField or a field with the column name of Name, returning null, use recordId`);
        return null;
      } else {
        // got our field, create a SQL Query
        let sql: string = `SELECT [${f.Name}] FROM [${e.SchemaName}].[${e.BaseView}] WHERE `;
        let where: string = '';
        for (let pkv of CompositeKey.KeyValuePairs) {
          const pk = e.PrimaryKeys.find((pk) => pk.Name === pkv.FieldName);
          const quotes = pk.NeedsQuotes ? "'" : '';
          if (where.length > 0) where += ' AND ';
          where += `[${pkv.FieldName}]=${quotes}${pkv.Value}${quotes}`;
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
      if (this._localStorage.hasOwnProperty(key)) resolve(this._localStorage[key]);
      else resolve(null);
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
      if (this._localStorage.hasOwnProperty(key)) delete this._localStorage[key];
      resolve();
    });
  }
}
