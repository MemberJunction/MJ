import { Arg, Ctx, ObjectType, Query, Resolver, Field, Int } from 'type-graphql';
import { RunQuery, QueryInfo } from '@memberjunction/core';
import { AppContext } from '../types.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GraphQLJSONObject } from 'graphql-type-json';
import { QueryEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';

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
  ExecutionTime: number;

  @Field()
  ErrorMessage: string;

  @Field(() => String, { nullable: true })
  AppliedParameters?: string;
}

@Resolver()
export class RunQueryResolver {
  private async findQuery(QueryID: string, QueryName?: string, CategoryID?: string, CategoryName?: string, refreshMetadataIfNotFound: boolean = false): Promise<QueryInfo | null> {
    const md = new Metadata();
    
    // Filter queries based on provided criteria
    const queries = md.Queries.filter(q => {
      if (QueryID) {
        return q.ID.trim().toLowerCase() === QueryID.trim().toLowerCase();
      } else if (QueryName) {
        let matches = q.Name.trim().toLowerCase() === QueryName.trim().toLowerCase();
        if (CategoryID) {
          matches = matches && q.CategoryID?.trim().toLowerCase() === CategoryID.trim().toLowerCase();
        }
        if (CategoryName) {
          matches = matches && q.Category?.trim().toLowerCase() === CategoryName.trim().toLowerCase();
        }
        return matches;
      }
      return false;
    });

    if (queries.length === 0) {
      if (refreshMetadataIfNotFound) {
        // If we didn't find the query, refresh metadata and try again
        await md.Refresh();
        return this.findQuery(QueryID, QueryName, CategoryID, CategoryName, false); // change the refresh flag to false so we don't loop infinitely
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
                     @Arg('CategoryName', () => String, {nullable: true}) CategoryName?: string,
                     @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>): Promise<RunQueryResultType> {
    const runQuery = new RunQuery();
    console.log('GetQueryData called with:', { QueryID, Parameters });
    const result = await runQuery.RunQuery(
      { 
        QueryID: QueryID,
        CategoryID: CategoryID,
        CategoryName: CategoryName,
        Parameters: Parameters 
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
        const queryInfo = await this.findQuery(QueryID, undefined, CategoryID, CategoryName, true);
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
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined
    };
  }

  @Query(() => RunQueryResultType)
  async GetQueryDataByName(@Arg('QueryName', () => String) QueryName: string, 
                           @Ctx() context: AppContext,
                           @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                           @Arg('CategoryName', () => String, {nullable: true}) CategoryName?: string,
                           @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>): Promise<RunQueryResultType> {
    const runQuery = new RunQuery();
    const result = await runQuery.RunQuery(
      { 
        QueryName: QueryName, 
        CategoryID: CategoryID,
        CategoryName: CategoryName,
        Parameters: Parameters
      },
      context.userPayload.userRecord);
      
    return {
      QueryID: result.QueryID || '',
      QueryName: QueryName,
      Success: result.Success ?? false,
      Results: JSON.stringify(result.Results ?? null),
      RowCount: result.RowCount ?? 0,
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined
    };
  }

  @RequireSystemUser()
  @Query(() => RunQueryResultType)
  async GetQueryDataSystemUser(@Arg('QueryID', () => String) QueryID: string, 
                               @Ctx() context: AppContext,
                               @Arg('CategoryID', () => String, {nullable: true}) CategoryID?: string,
                               @Arg('CategoryName', () => String, {nullable: true}) CategoryName?: string,
                               @Arg('Parameters', () => GraphQLJSONObject, {nullable: true}) Parameters?: Record<string, any>): Promise<RunQueryResultType> {
    const runQuery = new RunQuery();
    const result = await runQuery.RunQuery(
      { 
        QueryID: QueryID,
        CategoryID: CategoryID,
        CategoryName: CategoryName,
        Parameters: Parameters 
      }, 
      context.userPayload.userRecord);
    
    // If QueryName is not populated by the provider, use efficient lookup
    let queryName = result.QueryName;
    if (!queryName) {
      try {
        const queryInfo = await this.findQuery(QueryID, undefined, CategoryID, CategoryName, true);
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
      ExecutionTime: result.ExecutionTime ?? 0,
      ErrorMessage: result.ErrorMessage || '',
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined
    };
  }
}