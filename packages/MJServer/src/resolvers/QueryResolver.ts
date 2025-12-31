import { Arg, Ctx, ObjectType, Query, Resolver, Field, Int, InputType } from 'type-graphql';
import { RunQuery, QueryInfo, IRunQueryProvider, IMetadataProvider, RunQueryParams, LogError, RunQueryWithCacheCheckParams, RunQueriesWithCacheCheckResponse, RunQueryWithCacheCheckResult } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GraphQLJSONObject } from 'graphql-type-json';
import { Metadata } from '@memberjunction/core';
import { GetReadOnlyProvider } from '../util.js';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

/**
 * Input type for batch query execution - allows running multiple queries in a single network call
 */
@InputType()
export class RunQueryInput {
  @Field(() => String, { nullable: true, description: 'Query ID to run - either QueryID or QueryName must be provided' })
  QueryID?: string;

  @Field(() => String, { nullable: true, description: 'Query Name to run - either QueryID or QueryName must be provided' })
  QueryName?: string;

  @Field(() => String, { nullable: true, description: 'Category ID to help disambiguate queries with the same name' })
  CategoryID?: string;

  @Field(() => String, { nullable: true, description: 'Category path to help disambiguate queries with the same name' })
  CategoryPath?: string;

  @Field(() => GraphQLJSONObject, { nullable: true, description: 'Parameters to pass to the query' })
  Parameters?: Record<string, unknown>;

  @Field(() => Int, { nullable: true, description: 'Maximum number of rows to return' })
  MaxRows?: number;

  @Field(() => Int, { nullable: true, description: 'Starting row offset for pagination' })
  StartRow?: number;

  @Field(() => Boolean, { nullable: true, description: 'Force audit logging regardless of query settings' })
  ForceAuditLog?: boolean;

  @Field(() => String, { nullable: true, description: 'Description to use in audit log' })
  AuditLogDescription?: string;
}

@ObjectType()
export class RunQueryResultType {
  @Field()
  QueryID: string;

  @Field()
  QueryName: string;

  @Field()
  Success: boolean;

  @Field()
  Results: string;

  @Field()
  RowCount: number;

  @Field()
  TotalRowCount: number;

  @Field()
  ExecutionTime: number;

  @Field()
  ErrorMessage: string;

  @Field(() => String, { nullable: true })
  AppliedParameters?: string;

  @Field(() => Boolean, { nullable: true })
  CacheHit?: boolean;

  @Field(() => Int, { nullable: true })
  CacheTTLRemaining?: number;
}

//****************************************************************************
// INPUT/OUTPUT TYPES for RunQueriesWithCacheCheck
//****************************************************************************

@InputType()
export class RunQueryCacheStatusInput {
  @Field(() => String, { description: 'The maximum __mj_UpdatedAt value from cached results' })
  maxUpdatedAt: string;

  @Field(() => Int, { description: 'The number of rows in cached results' })
  rowCount: number;
}

@InputType()
export class RunQueryWithCacheCheckInput {
  @Field(() => RunQueryInput, { description: 'The RunQuery parameters' })
  params: RunQueryInput;

  @Field(() => RunQueryCacheStatusInput, {
    nullable: true,
    description: 'Optional cache status - if provided, server will check if cache is current'
  })
  cacheStatus?: RunQueryCacheStatusInput;
}

@ObjectType()
export class RunQueryWithCacheCheckResultOutput {
  @Field(() => Int, { description: 'The index of this query in the batch request' })
  queryIndex: number;

  @Field(() => String, { description: 'The query ID' })
  queryId: string;

  @Field(() => String, { description: "'current', 'stale', 'no_validation', or 'error'" })
  status: string;

  @Field(() => String, {
    nullable: true,
    description: 'JSON-stringified results - only populated when status is stale or no_validation'
  })
  Results?: string;

  @Field(() => String, { nullable: true, description: 'Max __mj_UpdatedAt from results when stale' })
  maxUpdatedAt?: string;

  @Field(() => Int, { nullable: true, description: 'Row count of results when stale' })
  rowCount?: number;

  @Field(() => String, { nullable: true, description: 'Error message if status is error' })
  errorMessage?: string;
}

@ObjectType()
export class RunQueriesWithCacheCheckOutput {
  @Field(() => Boolean, { description: 'Whether the overall operation succeeded' })
  success: boolean;

  @Field(() => [RunQueryWithCacheCheckResultOutput], { description: 'Results for each query in the batch' })
  results: RunQueryWithCacheCheckResultOutput[];

  @Field(() => String, { nullable: true, description: 'Overall error message if success is false' })
  errorMessage?: string;
}

@Resolver()
export class RunQueryResolver {
  private async findQuery(md: IMetadataProvider, QueryID: string, QueryName?: string, CategoryID?: string, CategoryPath?: string, refreshMetadataIfNotFound: boolean = false): Promise<QueryInfo | null> {
    // Filter queries based on provided criteria
    const queries = md.Queries.filter(q => {
      if (QueryID) {
        return q.ID.trim().toLowerCase() === QueryID.trim().toLowerCase();
      } else if (QueryName) {
        let matches = q.Name.trim().toLowerCase() === QueryName.trim().toLowerCase();
        if (CategoryID) {
          matches = matches && q.CategoryID?.trim().toLowerCase() === CategoryID.trim().toLowerCase();
        }
        if (CategoryPath) {
          matches = matches && q.Category?.trim().toLowerCase() === CategoryPath.trim().toLowerCase();
        }
        return matches;
      }
      return false;
    });

    if (queries.length === 0) {
      if (refreshMetadataIfNotFound) {
        // If we didn't find the query, refresh metadata and try again
        await md.Refresh();
        return this.findQuery(md, QueryID, QueryName, CategoryID, CategoryPath, false); // change the refresh flag to false so we don't loop infinitely
      } 
      else {
        return null; // No query found and not refreshing metadata
      }
    }
    else {
      return queries[0];
    }
  }
  @Query(() => RunQueryResultType)
  async GetQueryData(@Arg('QueryID', () => String) QueryID: string, 
                     @Ctx() context: AppContext,
                     @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                     @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                     @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                     @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                     @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                     @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                     @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string): Promise<RunQueryResultType> {
    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const md = provider as unknown as IMetadataProvider;
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);
    console.log('GetQueryData called with:', { QueryID, Parameters, MaxRows, StartRow, ForceAuditLog, AuditLogDescription });
    const result = await rq.RunQuery(
      { 
        QueryID: QueryID,
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription
      }, 
      context.userPayload.userRecord);
    console.log('RunQuery result:', { 
      Success: result.Success, 
      ErrorMessage: result.ErrorMessage,
      AppliedParameters: result.AppliedParameters 
    });
    
    // If QueryName is not populated by the provider, use efficient lookup
    let queryName = result.QueryName;
    if (!queryName) {
      try {
        const queryInfo = await this.findQuery(md, QueryID, undefined, CategoryID, CategoryPath, true);
        if (queryInfo) {
          queryName = queryInfo.Name;
        }
      } catch (error) {
        console.error('Error finding query to get name:', error);
      }
    }
    
    return {
      QueryID: QueryID,
      QueryName: queryName || 'Unknown Query',
      Success: result.Success ?? false,
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  @Query(() => RunQueryResultType)
  async GetQueryDataByName(@Arg('QueryName', () => String) QueryName: string, 
                           @Ctx() context: AppContext,
                           @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                           @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                           @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                           @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                           @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                           @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                           @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string): Promise<RunQueryResultType> {
    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);
    const result = await rq.RunQuery(
      { 
        QueryName: QueryName, 
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription
      },
      context.userPayload.userRecord);
      
    return {
      QueryID: result.QueryID || '',
      QueryName: QueryName,
      Success: result.Success ?? false,
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  @RequireSystemUser()
  @Query(() => RunQueryResultType)
  async GetQueryDataSystemUser(@Arg('QueryID', () => String) QueryID: string, 
                               @Ctx() context: AppContext,
                               @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                               @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                               @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                               @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                               @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                               @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                               @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string): Promise<RunQueryResultType> {
    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const md = provider as unknown as IMetadataProvider;
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    const result = await rq.RunQuery(
      { 
        QueryID: QueryID,
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription
      }, 
      context.userPayload.userRecord);
    
    // If QueryName is not populated by the provider, use efficient lookup
    let queryName = result.QueryName;
    if (!queryName) {
      try {
        const queryInfo = await this.findQuery(md, QueryID, undefined, CategoryID, CategoryPath, true);
        if (queryInfo) {
          queryName = queryInfo.Name;
        }
      } catch (error) {
        console.error('Error finding query to get name:', error);
      }
    }
    
    return {
      QueryID: QueryID,
      QueryName: queryName || 'Unknown Query',
      Success: result.Success ?? false,
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  @RequireSystemUser()
  @Query(() => RunQueryResultType)
  async GetQueryDataByNameSystemUser(@Arg('QueryName', () => String) QueryName: string, 
                                     @Ctx() context: AppContext,
                                     @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                                     @Arg('CategoryPath', () => String, {nullable: true}) CategoryPath?: string,
                                     @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>,
                                     @Arg('MaxRows', () => Int, {nullable: true}) MaxRows?: number,
                                     @Arg('StartRow', () => Int, {nullable: true}) StartRow?: number,
                                     @Arg('ForceAuditLog', () => Boolean, {nullable: true}) ForceAuditLog?: boolean,
                                     @Arg('AuditLogDescription', () => String, {nullable: true}) AuditLogDescription?: string): Promise<RunQueryResultType> {
    const provider = GetReadOnlyProvider(context.providers, {allowFallbackToReadWrite: true});
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    const result = await rq.RunQuery(
      { 
        QueryName: QueryName,
        CategoryID: CategoryID,
        CategoryPath: CategoryPath,
        Parameters: Parameters,
        MaxRows: MaxRows,
        StartRow: StartRow,
        ForceAuditLog: ForceAuditLog,
        AuditLogDescription: AuditLogDescription
      }, 
      context.userPayload.userRecord);
    
    return {
      QueryID: result.QueryID || '',
      QueryName: QueryName,
      Success: result.Success ?? false,
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      TotalRowCount: result.TotalRowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
      CacheHit: (result as any).CacheHit,
      CacheTTLRemaining: (result as any).CacheTTLRemaining
    };
  }

  /**
   * Batch query execution - runs multiple queries in a single network call
   * This is more efficient than making multiple individual query calls
   */
  @Query(() => [RunQueryResultType])
  async RunQueries(
    @Arg('input', () => [RunQueryInput]) input: RunQueryInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueryResultType[]> {
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    // Convert input to RunQueryParams array
    const params: RunQueryParams[] = input.map(i => ({
      QueryID: i.QueryID,
      QueryName: i.QueryName,
      CategoryID: i.CategoryID,
      CategoryPath: i.CategoryPath,
      Parameters: i.Parameters,
      MaxRows: i.MaxRows,
      StartRow: i.StartRow,
      ForceAuditLog: i.ForceAuditLog,
      AuditLogDescription: i.AuditLogDescription
    }));

    // Execute all queries in parallel using the batch method
    const results = await rq.RunQueries(params, context.userPayload.userRecord);

    // Map results to output format
    return results.map((result, index) => {
      const inputItem = input[index];
      return {
        QueryID: result.QueryID || inputItem.QueryID || '',
        QueryName: result.QueryName || inputItem.QueryName || 'Unknown Query',
        Success: result.Success ?? false,
        Results: JSON.stringify(result.Results ?? null),
        RowCount: result.RowCount ?? 0,
        TotalRowCount: result.TotalRowCount ?? 0,
        ExecutionTime: result.ExecutionTime ?? 0,
        ErrorMessage: result.ErrorMessage || '',
        AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
        CacheHit: (result as Record<string, unknown>).CacheHit as boolean | undefined,
        CacheTTLRemaining: (result as Record<string, unknown>).CacheTTLRemaining as number | undefined
      };
    });
  }

  /**
   * Batch query execution with system user privileges
   */
  @RequireSystemUser()
  @Query(() => [RunQueryResultType])
  async RunQueriesSystemUser(
    @Arg('input', () => [RunQueryInput]) input: RunQueryInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueryResultType[]> {
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });
    const rq = new RunQuery(provider as unknown as IRunQueryProvider);

    // Convert input to RunQueryParams array
    const params: RunQueryParams[] = input.map(i => ({
      QueryID: i.QueryID,
      QueryName: i.QueryName,
      CategoryID: i.CategoryID,
      CategoryPath: i.CategoryPath,
      Parameters: i.Parameters,
      MaxRows: i.MaxRows,
      StartRow: i.StartRow,
      ForceAuditLog: i.ForceAuditLog,
      AuditLogDescription: i.AuditLogDescription
    }));

    // Execute all queries in parallel using the batch method
    const results = await rq.RunQueries(params, context.userPayload.userRecord);

    // Map results to output format
    return results.map((result, index) => {
      const inputItem = input[index];
      return {
        QueryID: result.QueryID || inputItem.QueryID || '',
        QueryName: result.QueryName || inputItem.QueryName || 'Unknown Query',
        Success: result.Success ?? false,
        Results: JSON.stringify(result.Results ?? null),
        RowCount: result.RowCount ?? 0,
        TotalRowCount: result.TotalRowCount ?? 0,
        ExecutionTime: result.ExecutionTime ?? 0,
        ErrorMessage: result.ErrorMessage || '',
        AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined,
        CacheHit: (result as Record<string, unknown>).CacheHit as boolean | undefined,
        CacheTTLRemaining: (result as Record<string, unknown>).CacheTTLRemaining as number | undefined
      };
    });
  }

  /**
   * RunQueriesWithCacheCheck - Smart cache validation for batch RunQueries.
   * For each query, if cacheStatus is provided, the server checks if the cache is current
   * using the Query's CacheValidationSQL. If current, returns status='current' with no data.
   * If stale, returns status='stale' with fresh data.
   * If the Query doesn't have CacheValidationSQL configured, returns 'no_validation' with data.
   */
  @Query(() => RunQueriesWithCacheCheckOutput)
  async RunQueriesWithCacheCheck(
    @Arg('input', () => [RunQueryWithCacheCheckInput]) input: RunQueryWithCacheCheckInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueriesWithCacheCheckOutput> {
    try {
      const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true });

      // Cast provider to SQLServerDataProvider to access RunQueriesWithCacheCheck method
      const sqlProvider = provider as unknown as SQLServerDataProvider;
      if (!sqlProvider.RunQueriesWithCacheCheck) {
        throw new Error('Provider does not support RunQueriesWithCacheCheck');
      }

      // Convert GraphQL input types to core types
      const coreParams: RunQueryWithCacheCheckParams[] = input.map(item => ({
        params: {
          QueryID: item.params.QueryID,
          QueryName: item.params.QueryName,
          CategoryID: item.params.CategoryID,
          CategoryPath: item.params.CategoryPath,
          Parameters: item.params.Parameters,
          MaxRows: item.params.MaxRows,
          StartRow: item.params.StartRow,
          ForceAuditLog: item.params.ForceAuditLog,
          AuditLogDescription: item.params.AuditLogDescription,
        },
        cacheStatus: item.cacheStatus ? {
          maxUpdatedAt: item.cacheStatus.maxUpdatedAt,
          rowCount: item.cacheStatus.rowCount,
        } : undefined,
      }));

      const response = await sqlProvider.RunQueriesWithCacheCheck(coreParams, context.userPayload.userRecord);

      // Transform results to GraphQL output format
      const transformedResults: RunQueryWithCacheCheckResultOutput[] = response.results.map(result => ({
        queryIndex: result.queryIndex,
        queryId: result.queryId,
        status: result.status,
        Results: result.results ? JSON.stringify(result.results) : undefined,
        maxUpdatedAt: result.maxUpdatedAt,
        rowCount: result.rowCount,
        errorMessage: result.errorMessage,
      }));

      return {
        success: response.success,
        results: transformedResults,
        errorMessage: response.errorMessage,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      LogError(err);
      return {
        success: false,
        results: [],
        errorMessage,
      };
    }
  }

  /**
   * RunQueriesWithCacheCheck with system user privileges
   */
  @RequireSystemUser()
  @Query(() => RunQueriesWithCacheCheckOutput)
  async RunQueriesWithCacheCheckSystemUser(
    @Arg('input', () => [RunQueryWithCacheCheckInput]) input: RunQueryWithCacheCheckInput[],
    @Ctx() context: AppContext
  ): Promise<RunQueriesWithCacheCheckOutput> {
    // Same implementation as regular version - RequireSystemUser handles auth
    return this.RunQueriesWithCacheCheck(input, context);
  }
}