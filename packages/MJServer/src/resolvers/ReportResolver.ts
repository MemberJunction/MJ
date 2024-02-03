import { RunReport } from '@memberjunction/core';
import { Arg, Ctx, Field, Int, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types';

@ObjectType()
export class RunReportResultType {
  @Field()
  ReportID: number;

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

@Resolver(RunReportResultType)
export class ReportResolver {
  @Query(() => RunReportResultType)
  async GetReportData(@Arg('ReportID', () => Int) ReportID: number, @Ctx() {}: AppContext): Promise<RunReportResultType> {
    const runReport = new RunReport();
    const result = await runReport.RunReport({ ReportID: ReportID });
    return {
      ReportID: ReportID,
      Success: result.Success,
      Results: JSON.stringify(result.Results),
      RowCount: result.RowCount,
      ExecutionTime: result.ExecutionTime,
      ErrorMessage: result.ErrorMessage,
    };
  }
}
