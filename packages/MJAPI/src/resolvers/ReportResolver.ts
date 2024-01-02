import { RunReport } from '@memberjunction/core';
import { AppContext, Arg, Ctx, Field, Int, ObjectType, Query, Resolver } from '@memberjunction/server';

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
    // // run the sql and return the data
    // const sqlReport = "SELECT GeneratedSQLText FROM vwReports WHERE ID = " + ReportID;
    // const reportInfo = await dataSource.query(sqlReport);
    // if (reportInfo && reportInfo.length > 0) {
    //     const start = new Date().getTime();
    //     const sql = reportInfo[0].GeneratedSQLText;
    //     const result = await dataSource.query(sql);
    //     const end = new Date().getTime();
    //     if (result)
    //         return {Success: true, ReportID: ReportID, Results: JSON.stringify(result), RowCount: result.length, ExecutionTime: end-start, ErrorMessage: ''};
    //     else
    //         return {Success: false, ReportID: ReportID, Results: '[]', RowCount: 0, ExecutionTime: end - start, ErrorMessage: 'Error running report SQL'};
    // }
    // else
    //     return {Success: false, ReportID: ReportID, Results: '[]', RowCount: 0, ExecutionTime: 0, ErrorMessage: 'Report not found'};
  }
}
