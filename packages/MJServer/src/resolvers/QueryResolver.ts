// Queries are MemberJunction primitive operations that are used to retrieve data from the server from any stored query
import { RunQuery } from '@memberjunction/core';
import { Arg, Ctx, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GraphQLJSONObject } from 'graphql-type-json';

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

@Resolver(RunQueryResultType)
export class RunQueryResolver {
  @Query(() => RunQueryResultType)
  async GetQueryData(@Arg('QueryID', () => String) QueryID: string, 
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
    
    return {
      QueryID: QueryID,
      QueryName: result.QueryName,
      Success: result.Success,
      Results: JSON.stringify(result.Results),
      RowCount: result.RowCount,
      ExecutionTime: result.ExecutionTime,
      ErrorMessage: result.ErrorMessage,
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
      QueryID: result.QueryID,
      QueryName: QueryName,
      Success: result.Success,
      Results: JSON.stringify(result.Results),
      RowCount: result.RowCount,
      ExecutionTime: result.ExecutionTime,
      ErrorMessage: result.ErrorMessage,
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
    
    return {
      QueryID: QueryID,
      QueryName: result.QueryName,
      Success: result.Success,
      Results: JSON.stringify(result.Results),
      RowCount: result.RowCount,
      ExecutionTime: result.ExecutionTime,
      ErrorMessage: result.ErrorMessage,
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined
    };
  }

  @RequireSystemUser()
  @Query(() => RunQueryResultType)
  async GetQueryDataByNameSystemUser(@Arg('QueryName', () => String) QueryName: string, 
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
      QueryID: result.QueryID,
      QueryName: QueryName,
      Success: result.Success,
      Results: JSON.stringify(result.Results),
      RowCount: result.RowCount,
      ExecutionTime: result.ExecutionTime,
      ErrorMessage: result.ErrorMessage,
      AppliedParameters: result.AppliedParameters ? JSON.stringify(result.AppliedParameters) : undefined
    };
  }
}
