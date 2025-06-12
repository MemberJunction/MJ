import { Metadata, RunReport } from '@memberjunction/core';
import { Arg, Ctx, Field, Int, Mutation, ObjectType, Query, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { ConversationDetailEntity, ReportEntity } from '@memberjunction/core-entities';
import { SkipAPIAnalysisCompleteResponse } from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { z } from 'zod';
import mssql from 'mssql';

@ObjectType()
export class RunReportResultType {
  @Field()
  ReportID: string;

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

@ObjectType()
export class CreateReportResultType {
  @Field()
  ReportID: string;

  @Field()
  ReportName: string;

  @Field()
  Success: boolean;

  @Field()
  ErrorMessage: string;
}

@Resolver(RunReportResultType)
export class ReportResolverExtended {
  @Query(() => RunReportResultType)
  async GetReportData(@Arg('ReportID', () => String) ReportID: string, @Ctx() {}: AppContext): Promise<RunReportResultType> {
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

  /**
   * This mutation will create a new report from a conversation detail ID
   */
  @Mutation(() => CreateReportResultType)
  async CreateReportFromConversationDetailID(
    @Arg('ConversationDetailID', () => String) ConversationDetailID: string,
    @Ctx() { dataSource, userPayload }: AppContext
  ): Promise<CreateReportResultType> {
    try {
      const md = new Metadata();

      const u = UserCache.Users.find((u) => u.Email?.trim().toLowerCase() === userPayload?.email?.trim().toLowerCase());
      if (!u) throw new Error('Unable to find user');

      const cde = md.Entities.find((e) => e.Name === 'Conversation Details');
      if (!cde) throw new Error('Unable to find Conversation Details Entity metadata');

      const cd = md.Entities.find((e) => e.Name === 'Conversations');
      if (!cd) throw new Error('Unable to find Conversations Entity metadata');

      const sql = `SELECT
                      cd.Message, cd.ConversationID, c.DataContextID
                   FROM
                      ${cde.SchemaName}.${cde.BaseView} cd
                   INNER JOIN
                      ${cd.SchemaName}.${cd.BaseView} c
                   ON
                      cd.ConversationID = c.ID
                   WHERE
                      cd.ID='${ConversationDetailID}'`;

      const request = new mssql.Request(dataSource);
      const result = await request.query(sql);
      if (!result || !result.recordset || result.recordset.length === 0) throw new Error('Unable to retrieve converation details');
      const skipData = <SkipAPIAnalysisCompleteResponse>JSON.parse(result.recordset[0].Message);

      const report = await md.GetEntityObject<ReportEntity>('Reports', u);
      report.NewRecord();
      // support the legacy report title as old conversation details had a reportTitle property
      // but the new SkipData object has a title property, so favor the title property
      const title = skipData.title ? skipData.title : skipData.reportTitle ? skipData.reportTitle : 'Untitled Report';
      report.Name = title;
      report.Description = skipData.userExplanation ? skipData.userExplanation : '';
      report.ConversationID = result[0].ConversationID;
      report.ConversationDetailID = ConversationDetailID;

      const dc: DataContext = new DataContext();
      await dc.LoadMetadata(result[0].DataContextID, u);
      const newDataContext = await DataContext.Clone(dc, false, u);
      if (!newDataContext) throw new Error('Error cloning data context');
      report.DataContextID = newDataContext.ID;

      // next, strip out the messags from the SkipData object to put them into our Report Configuration as we dont need to store that information as we have a
      // link back to the conversation and conversation detail
      const newSkipData: SkipAPIAnalysisCompleteResponse = JSON.parse(JSON.stringify(skipData));
      newSkipData.messages = [];
      report.Configuration = JSON.stringify(newSkipData);

      report.SharingScope = 'None';
      report.UserID = u.ID;

      if (await report.Save()) {
        return {
          ReportID: report.ID,
          ReportName: report.Name,
          Success: true,
          ErrorMessage: '',
        };
      } else {
        return {
          ReportID: '',
          ReportName: '',
          Success: false,
          ErrorMessage: 'Unable to save new report',
        };
      }
    } catch (ex) {
      const err = z.object({ message: z.string() }).safeParse(ex);
      return {
        ReportID: '',
        ReportName: '',
        Success: false,
        ErrorMessage: 'Unable to create new report: ' + err.success ? err.data.message : String(ex),
      };
    }
  }
}
