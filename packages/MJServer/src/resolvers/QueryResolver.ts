import { Arg, Ctx, ObjectType, Query, Resolver, Field, Int, InputType } from 'type-graphql';
import { RunQuery, QueryInfo, IRunQueryProvider, IMetadataProvider, RunQueryParams } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GraphQLJSONObject } from 'graphql-type-json';
import { Metadata } from '@memberjunction/core';
import { GetReadOnlyProvider } from '../util.js';

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
}