// Queries are MemberJunction primitive operations that are used to retrieve data from the server from any stored query
import { RunQuery } from '@memberjunction/core';
import { Arg, Ctx, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';

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
}

@Resolver(RunQueryResultType)
export class ReportResolver {
  @Query(() => RunQueryResultType)
  async GetQueryData(@Arg('QueryID', () => String) QueryID: string, @Ctx() {}: AppContext): Promise<RunQueryResultType> {
    const runQuery = new RunQuery();
    const result = await runQuery.RunQuery({ QueryID: QueryID });
    return {
      QueryID: QueryID,
      QueryName: result.QueryName,
      Success: result.Success,
      Results: JSON.stringify(result.Results),
      RowCount: result.RowCount,
      ExecutionTime: result.ExecutionTime,
      ErrorMessage: result.ErrorMessage,
    };
  }

  @Query(() => RunQueryResultType)
  async GetQueryDataByName(@Arg('QueryName', () => String) QueryName: string, @Ctx() {}: AppContext): Promise<RunQueryResultType> {
    const runQuery = new RunQuery();
    const result = await runQuery.RunQuery({ QueryName: QueryName });
    return {
      QueryID: result.QueryID,
      QueryName: QueryName,
      Success: result.Success,
      Results: JSON.stringify(result.Results),
      RowCount: result.RowCount,
      ExecutionTime: result.ExecutionTime,
      ErrorMessage: result.ErrorMessage,
    };
  }
}
