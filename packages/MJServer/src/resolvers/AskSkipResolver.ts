import { Arg, Ctx, Field, Int, ObjectType, PubSub, PubSubEngine, Query, Resolver } from 'type-graphql';
import { SkipAnalyzeData, SkipExplainQuery } from '@memberjunction/aiengine';
import { Metadata } from '@memberjunction/core';
import { AppContext } from '../types';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import axios from 'axios';

import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver';
import { ConversationDetailEntity, ConversationEntity, UserNotificationEntity } from '@memberjunction/core-entities';

@ObjectType()
export class AskSkipResultType {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string; // required

  @Field(() => String)
  Result: string;

  @Field(() => Int)
  ConversationId: number;

  @Field(() => Int)
  UserMessageConversationDetailId: number;

  @Field(() => Int)
  AIMessageConversationDetailId: number;
}

class SubProcessResponse {
  status: "success" | "error";
  resultType: "data" | "plot" | "html" | null;
  tableData: any[] | null; // any array of objects
  plotData: { data: any[]; layout: any } | null; // Compatible with Plotly
  htmlReport: string | null;
  analysis: string | null; // analysis of the data from the sub-process
  errorMessage: string | null;
}
class SkipAPIResponse {
  success: boolean;
  executionResults: SubProcessResponse | null;
  userExplanation: string;
  techExplanation: string;
  suggestedQuestions: string[] | null;
  reportTitle: string | null;
  analysis: string | null;
  scriptText: string | null;
}

@Resolver(AskSkipResultType)
export class AskSkipResolver {
  private static _defaultNewChatName = 'New Chat';


  @Query(() => AskSkipResultType)
  async ExecuteAskSkipAnalysisQuery(
    @Arg('UserQuestion', () => String) UserQuestion: string,
    @Arg('ViewId', () => Int) ViewId: number,
    @Arg('ConversationId', () => Int) ConversationId: number,
    @Ctx() { dataSource, userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    const md = new Metadata();
    const user = UserCache.Instance.Users.find((u) => u.Email === userPayload.email);
    if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);

    const convoEntity = <ConversationEntity>await md.GetEntityObject('Conversations', user);
    if (!ConversationId || ConversationId <= 0) {
      // create a new conversation id
      convoEntity.NewRecord();
      if (user) {
        convoEntity.UserID = user.ID;
        convoEntity.Name = AskSkipResolver._defaultNewChatName;
        if (await convoEntity.Save()) ConversationId = convoEntity.ID;
        else throw new Error(`Creating a new conversation failed`);
      } else throw new Error(`User ${userPayload.email} not found in UserCache`);
    } else {
      await convoEntity.Load(ConversationId); // load the existing conversation, will need it later
    }

    // now, create a conversation detail record for the user message
    const convoDetailEntity = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', user);
    convoDetailEntity.NewRecord();
    convoDetailEntity.ConversationID = ConversationId;
    convoDetailEntity.Message = UserQuestion;
    convoDetailEntity.Role = 'User';
    convoDetailEntity.Set('Sequence', 1); // using weakly typed here because we're going to get rid of this field soon
    await convoDetailEntity.Save();

    //const OrganizationId = 2 //HG 8/1/2023 TODO: Pull this from an environment variable
    const OrganizationId = process.env.BOT_SCHEMA_ORGANIZATION_ID;

    const input = { 
                    userInput: UserQuestion, 
                    conversationID: ConversationId, 
                    viewID: ViewId, 
                    organizationID: OrganizationId };
    const url = 'http://localhost:8000' 
    //      const url = process.env.BOT_EXTERNAL_API_URL;
    // TEMP - call the separate server, we'll move this to real skip server soon!!!!!


    pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
      message: JSON.stringify({
        type: 'AskSkip',
        status: 'OK',
        message: 'Sure, I can help with that, I\'ll get right on it!',
      }),
      sessionId: userPayload.sessionId,
    });

    const response = await axios({
      method: 'post',
      url: url,
      data: input,
    });

    if (response.status === 200) {
      pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
        message: JSON.stringify({
          type: 'AskSkip',
          status: 'OK',
          message: 'View Analysis successful, updating the conversation...',
        }),
        sessionId: userPayload.sessionId,
      });
      const apiResponse = <SkipAPIResponse>response.data;
      const sTitle = apiResponse.reportTitle; 
      const sResult = JSON.stringify(apiResponse);

      // now, create a conversation detail record for the Skip response
      const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
      convoDetailEntityAI.NewRecord();
      convoDetailEntityAI.ConversationID = ConversationId;
      convoDetailEntityAI.Message = sResult;
      convoDetailEntityAI.Role = 'AI';
      convoDetailEntityAI.Set('Sequence', 2); // using weakly typed here because we're going to get rid of this field soon
      await convoDetailEntityAI.Save();

      // finally update the convo name if it is still the default
      if (convoEntity.Name === AskSkipResolver._defaultNewChatName && sTitle) {
        convoEntity.Name = sTitle; // use the title from the response
        await convoEntity.Save();
      }

      // now create a notification for the user
      const userNotification = <UserNotificationEntity>await md.GetEntityObject('User Notifications', user);
      userNotification.NewRecord();
      userNotification.UserID = user.ID;
      userNotification.Title = 'Report Created: ' + sTitle;
      userNotification.Message = `Good news! Skip finished creating a report for you, click on this notification to jump back into the conversation.`;
      userNotification.Unread = true;
      userNotification.ResourceConfiguration = JSON.stringify({
        type: 'askskip',
        conversationId: ConversationId,
      });
      await userNotification.Save();
      pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
        message: JSON.stringify({
          type: 'UserNotifications',
          status: 'OK',
          details: {
            action: 'create',
            recordId: userNotification.ID,
          },
        }),
        sessionId: userPayload.sessionId,
      });

      return {
        Success: true,
        Status: 'OK',
        ConversationId: ConversationId,
        UserMessageConversationDetailId: convoDetailEntity.ID,
        AIMessageConversationDetailId: convoDetailEntityAI.ID,
        Result: JSON.stringify(response.data)
      };
    }
    else {
      pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
        message: JSON.stringify({
          type: 'AskSkip',
          status: 'Error',
          message: 'Analysis failed to run, please try again later and if this continues, contact your support desk.',
        }),
        sessionId: userPayload.sessionId,
      });

      return {
        Success: false,
        Status: 'Error',
        Result: `User Question ${UserQuestion} didn't work!`,
        ConversationId: ConversationId,
        UserMessageConversationDetailId: 0,
        AIMessageConversationDetailId: 0,
      };
    }
  }

  // @Query(() => AskSkipResultType)
  // async ExecuteAskSkipQuery(
  //   @Arg('UserQuestion', () => String) UserQuestion: string,
  //   @Arg('ConversationId', () => Int) ConversationId: number,
  //   @Ctx() { dataSource, userPayload }: AppContext,
  //   @PubSub() pubSub: PubSubEngine
  // ) {
  //   try {
  //     const md = new Metadata();
  //     const user = UserCache.Instance.Users.find((u) => u.Email === userPayload.email);
  //     if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);

  //     const convoEntity = <ConversationEntity>await md.GetEntityObject('Conversations', user);
  //     if (!ConversationId || ConversationId <= 0) {
  //       // create a new conversation id
  //       convoEntity.NewRecord();
  //       if (user) {
  //         convoEntity.UserID = user.ID;
  //         convoEntity.Name = AskSkipResolver._defaultNewChatName;
  //         if (await convoEntity.Save()) ConversationId = convoEntity.ID;
  //         else throw new Error(`Creating a new conversation failed`);
  //       } else throw new Error(`User ${userPayload.email} not found in UserCache`);
  //     } else {
  //       await convoEntity.Load(ConversationId); // load the existing conversation, will need it later
  //     }

  //     // now, create a conversation detail record for the user message
  //     const convoDetailEntity = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
  //     convoDetailEntity.NewRecord();
  //     convoDetailEntity.ConversationID = ConversationId;
  //     convoDetailEntity.Message = UserQuestion;
  //     convoDetailEntity.Role = 'User';
  //     convoDetailEntity.Set('Sequence', 1); // using weakly typed here because we're going to get rid of this field soon
  //     await convoDetailEntity.Save();

  //     //const OrganizationId = 2 //HG 8/1/2023 TODO: Pull this from an environment variable
  //     const OrganizationId = process.env.BOT_SCHEMA_ORGANIZATION_ID;

  //     const input = { userInput: UserQuestion, conversationID: ConversationId, organizationID: OrganizationId };
  //     const url = process.env.BOT_EXTERNAL_API_URL;

  //     pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
  //       message: JSON.stringify({
  //         type: 'AskSkip',
  //         status: 'OK',
  //         message: 'Sure, I can help with that, just give me a second and I will think about the best way to complete your request.',
  //       }),
  //       sessionId: userPayload.sessionId,
  //     });

  //     const response = await axios({
  //       method: 'post',
  //       url: url,
  //       data: input,
  //     });
  //     if (response.status === 200) {
  //       pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
  //         message: JSON.stringify({
  //           type: 'AskSkip',
  //           status: 'OK',
  //           message: 'I created the report structure, now I will get the data for you and analyze the results... Back to ya soon!',
  //         }),
  //         sessionId: userPayload.sessionId,
  //       });

  //       // it worked, run the SQL and return the results
  //       const sql = response.data.params.sql;
  //       const [{ result, analysis }, explanation] = await Promise.all([
  //         this.getSkipDataAndAnalysis(dataSource, UserQuestion, sql),
  //         this.getReportExplanation(UserQuestion, sql),
  //       ]);

  //       const sTitle = response.data.params.reportTitle || response.data.params.chartTitle;
  //       const sResult = JSON.stringify({
  //         SQLResults: {
  //           results: result,
  //           sql: sql,
  //           columns: response.data.params.columns,
  //         },
  //         UserMessage: '',
  //         ReportExplanation: explanation,
  //         Analysis: analysis,
  //         ReportTitle: sTitle,
  //         DisplayType: response.data.type,
  //         DrillDownView: response.data.params.drillDownView,
  //         DrillDownBaseViewField: response.data.params.drillDownBaseViewField,
  //         DrillDownReportValueField: response.data.params.drillDownReportValueField,
  //         ChartOptions: {
  //           xAxis: response.data.params.xAxis,
  //           xLabel: response.data.params.xLabel,
  //           yAxis: response.data.params.yAxis,
  //           yLabel: response.data.params.yLabel,
  //           color: response.data.params.color,
  //           yFormat: response.data.params.yFormat,
  //         },
  //       });

  //       // now, create a conversation detail record for the Skip response
  //       const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
  //       convoDetailEntityAI.NewRecord();
  //       convoDetailEntityAI.ConversationID = ConversationId;
  //       convoDetailEntityAI.Message = sResult;
  //       convoDetailEntityAI.Role = 'AI';
  //       convoDetailEntityAI.Set('Sequence', 2); // using weakly typed here because we're going to get rid of this field soon
  //       await convoDetailEntityAI.Save();

  //       // finally update the convo name if it is still the default
  //       if (convoEntity.Name === AskSkipResolver._defaultNewChatName) {
  //         convoEntity.Name = response.data.params.reportTitle || response.data.params.chartTitle || AskSkipResolver._defaultNewChatName;
  //         await convoEntity.Save();
  //       }

  //       // now create a notification for the user
  //       const userNotification = <UserNotificationEntity>await md.GetEntityObject('User Notifications', user);
  //       userNotification.NewRecord();
  //       userNotification.UserID = user.ID;
  //       userNotification.Title = 'Report Created: ' + sTitle;
  //       userNotification.Message = `Good news! Skip finished creating a report for you, click on this notification to jump back into the conversation.`;
  //       userNotification.Unread = true;
  //       userNotification.ResourceConfiguration = JSON.stringify({
  //         type: 'askskip',
  //         conversationId: ConversationId,
  //       });
  //       await userNotification.Save();
  //       pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
  //         message: JSON.stringify({
  //           type: 'UserNotifications',
  //           status: 'OK',
  //           details: {
  //             action: 'create',
  //             recordId: userNotification.ID,
  //           },
  //         }),
  //         sessionId: userPayload.sessionId,
  //       });

  //       return {
  //         Success: true,
  //         Status: 'OK',
  //         ConversationId: ConversationId,
  //         UserMessageConversationDetailId: convoDetailEntity.ID,
  //         AIMessageConversationDetailId: convoDetailEntityAI.ID,
  //         Result: sResult,
  //       };
  //     } else return { Success: false, Status: 'Error', Result: `User Question ${UserQuestion} didn't work!` };
  //   } catch (error) {
  //     console.error(`Error occurred: ${error}`);
  //     if (error.response) {
  //       // The request was made and the server responded with a status code
  //       // that falls out of the range of 2xx
  //       console.log(error.response.data);
  //       console.log(error.response.status);
  //       console.log(error.response.headers);
  //     } else if (error.request) {
  //       // The request was made but no response was received
  //       // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
  //       // http.ClientRequest in node.js
  //       console.log(error.request);
  //     } else {
  //       // Something happened in setting up the request that triggered an Error
  //       console.log('Error', error.message);
  //     }
  //     console.log(error.config);
  //     return {
  //       Success: false,
  //       Status: 'Error',
  //       Result: `User Question ${UserQuestion} didn't work!`,
  //       ConversationId: ConversationId,
  //       UserMessageConversationDetailId: 0,
  //       AIMessageConversationDetailId: 0,
  //     };
  //   }
  // }

  // protected async getSkipDataAndAnalysis(dataSource: any, userQuestion: string, sql: string): Promise<{ result: any[]; analysis: string }> {
  //   const result = await dataSource.query(sql);
  //   const stringResult = JSON.stringify(result);
  //   // next get average string length of each row in result
  //   const maxStringLength = 2000;
  //   const avgRowStringLength = stringResult.length / result.length;
  //   // next get the subset we actually want to use, either entire result
  //   // of if too long, then a subset of the rows from the result
  //   let sampleDataJSON = stringResult;
  //   if (stringResult.length > maxStringLength) {
  //     const rowsToUse = result.length / (maxStringLength / avgRowStringLength);
  //     const subsetResult = result.slice(0, rowsToUse);
  //     sampleDataJSON = JSON.stringify(subsetResult);
  //   }
  //   // now get the analysis since we have the sample data
  //   const analysis = await this.getAnalysis(userQuestion, sql, sampleDataJSON);
  //   return { result, analysis };
  // }

  // protected async getAnalysis(userQuestion: string, sql: string, sampleDataJSON: string): Promise<string> {
  //   return await SkipAnalyzeData(userQuestion, sql, sampleDataJSON);
  // }

  // protected async getReportExplanation(userQuestion: string, sql: string): Promise<string> {
  //   return await SkipExplainQuery(userQuestion, sql);
  // }
}

export default AskSkipResolver;
