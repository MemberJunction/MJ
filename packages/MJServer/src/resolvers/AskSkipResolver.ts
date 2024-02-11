import { Arg, Ctx, Field, Int, ObjectType, PubSub, PubSubEngine, Query, Resolver } from 'type-graphql';
import { LogError, Metadata, RunQuery, RunQueryParams, RunView, UserInfo } from '@memberjunction/core';
import { AppContext, UserPayload } from '../types';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { SkipDataContext, SkipDataContextItem, SkipAPIRequest, SkipAPIResponse, SkipMessage, SkipAPIAnalysisCompleteResponse, SkipAPIDataRequestResponse } from '@memberjunction/skip-types';
import axios from 'axios';
import zlib from 'zlib';
import { promisify } from 'util';
// Convert zlib.gzip into a promise-returning function
const gzip = promisify(zlib.gzip);

import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver';
import { ConversationDetailEntity, ConversationEntity, UserNotificationEntity, UserViewEntityExtended } from '@memberjunction/core-entities';
import { DataSource } from 'typeorm';


const ___skipAPIurl = 'http://localhost:8000' 
//      const url = process.env.BOT_EXTERNAL_API_URL;
// TEMP - call the separate server, we'll move this to real skip server soon!!!!!



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
    const dataContext: SkipDataContext = new SkipDataContext();
    dataContext.Items.push(
      {
        Type: 'view',
        RecordID: ViewId,
        Data: await this.getViewData(ViewId, user),
      } as SkipDataContextItem
    );    

    const messages: SkipMessage[] = [
      {
        content: UserQuestion,
        role: 'user'
      }
    ];

    const input: SkipAPIRequest = { 
                    messages: messages, 
                    conversationID: ConversationId.toString(), 
                    dataContext: dataContext, 
                    organizationID: !isNaN(parseInt(OrganizationId)) ? parseInt(OrganizationId) : 0,
                    requestPhase: 'initial_request'
                  };

    pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
      message: JSON.stringify({
        type: 'AskSkip',
        status: 'OK',
        message: 'I will be happy to help and will start by analyzing your request...',
      }),
      sessionId: userPayload.sessionId,
    });

    return this.HandleSkipRequest(input, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, md, convoEntity, convoDetailEntity);
  }


  protected async HandleSkipRequest(input: SkipAPIRequest, UserQuestion: string, user: UserInfo, dataSource: DataSource, 
                                    ConversationId: number, userPayload: UserPayload, pubSub: PubSubEngine, md: Metadata, 
                                    convoEntity: ConversationEntity, convoDetailEntity: ConversationDetailEntity): Promise<AskSkipResultType> {
    // Convert JSON payload to a Buffer and compress it
    const compressedPayload = await gzip(Buffer.from(JSON.stringify(input)));

    // Send the compressed payload with Axios
    const response = await axios.post(___skipAPIurl, compressedPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip'
      }
    });

    // const response = await axios({
    //   method: 'post',
    //   url: ___skipAPIurl,
    //   data: input,
    // });

    if (response.status === 200) {
      const apiResponse = <SkipAPIResponse>response.data;
      let sUserMessage: string = '';
      switch (apiResponse.responsePhase) {
        case 'data_request':
          sUserMessage = 'We need to gather some more data, I will do that next and update you soon.';
          break;
        case 'analysis_complete':
          sUserMessage = 'I have completed the analysis, the results will be available momentarily.';
          break;
        case 'clarifying_question':
          sUserMessage = 'I have a clarifying question for you, please see review our chat so you can provide me a little more info.';
          break;
      }

      // update the UI
      pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
        message: JSON.stringify({
          type: 'AskSkip',
          status: 'OK',
          message: sUserMessage,
        }),
        sessionId: userPayload.sessionId,
      });

      // now, based on the result type, we will either wait for the next phase or we will process the results
      if (apiResponse.responsePhase === 'data_request') {
        return await this.HandleDataRequestPhase(input, <SkipAPIDataRequestResponse>apiResponse, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, convoEntity, convoDetailEntity);
      }
      else if (apiResponse.responsePhase === 'clarifying_question') {
        // need to send the request back to the user for a clarifying question
        // TO-DO implement this
        throw new Error('Clarifying question not implemented yet');
      }
      else { // apiResponse.responsePhase === 'analysis_complete'
        // analysis is complete
        // all done, wrap things up
        const {AIMessageConversationDetailID} = await this.FinishConversationAndNotifyUser(apiResponse, md, user, convoEntity, pubSub, userPayload);

        return {
          Success: true,
          Status: 'OK',
          ConversationId: ConversationId,
          UserMessageConversationDetailId: convoDetailEntity.ID,
          AIMessageConversationDetailId: AIMessageConversationDetailID,
          Result: JSON.stringify(response.data)
        };
      }
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

  protected async HandleDataRequestPhase(apiRequest: SkipAPIRequest, apiResponse: SkipAPIDataRequestResponse, UserQuestion: string, user: UserInfo, dataSource: DataSource, 
                                         ConversationId: number, userPayload: UserPayload, pubSub: PubSubEngine, convoEntity: ConversationEntity, convoDetailEntity: ConversationDetailEntity): Promise<AskSkipResultType> {
    // our job in this method is to go through each of the data requests from the Skip API, get the data, and then go back to the Skip API again and to the next phase
    try {  
      const md = new Metadata();
      for (const dr of apiResponse.dataRequest) {
        switch (dr.type) {
          case "sql":
            const sql = dr.text;
            const result = await dataSource.query(sql);
            if (!result) 
              throw new Error(`Error running SQL: ${sql}`);

            const item = new SkipDataContextItem();
            item.Type = 'sql';
            item.Data = result;
            item.RecordName = dr.text;
            item.AdditionalDescription = dr.description;
            apiRequest.dataContext.Items.push(item);
            break;
          case "stored_query":
            const queryName = dr.text;
            const query = md.Queries.find((q) => q.Name === queryName);
            if (query) {
              const rq = new RunQuery();
              const result = await rq.RunQuery({QueryID: query.ID}, user)  
              if (result && result.Success) {
                const item = new SkipDataContextItem();
                item.Type = 'query';
                item.Data = result.Results;
                item.RecordID = query.ID;
                item.RecordName = query.Name;
                item.AdditionalDescription = dr.description;
                apiRequest.dataContext.Items.push(item);    
              }
              else
                throw new Error(`Error running query ${queryName}`);
            }
            else
              throw new Error(`Query ${queryName} not found.`);
            break;
        }
      }

      // we have all of the data now, add it to the data context and then submit it back to the Skip API
      apiRequest.requestPhase = 'data_gathering_response';
      return this.HandleSkipRequest(apiRequest, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, md, convoEntity, convoDetailEntity);
    }
    catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**
   * This method will handle the process for an end of request where a user is notified of an AI message. The AI message is either the finished report or a clarifying question.
   * @param apiResponse 
   * @param md 
   * @param user 
   * @param convoEntity 
   * @param pubSub 
   * @param userPayload 
   * @returns 
   */
  protected async FinishConversationAndNotifyUser(apiResponse: SkipAPIAnalysisCompleteResponse, md: Metadata, user: UserInfo, convoEntity: ConversationEntity, pubSub: PubSubEngine, userPayload: UserPayload): Promise<{AIMessageConversationDetailID: number}> {
    const sTitle = apiResponse.reportTitle; 
    const sResult = JSON.stringify(apiResponse);

    // now, create a conversation detail record for the Skip response
    const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
    convoDetailEntityAI.NewRecord();
    convoDetailEntityAI.ConversationID = convoEntity.ID;
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
      conversationId: convoEntity.ID,
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
      AIMessageConversationDetailID: convoDetailEntityAI.ID
    };
  }

  protected async getViewData(ViewId: number, user: UserInfo): Promise<any> {
    const rv = new RunView();
    const result = await rv.RunView({ViewID: ViewId, IgnoreMaxRows: true}, user);
    if (result && result.Success)
      return result.Results;
    else
      throw new Error(`Error running view ${ViewId}`);
  }
}

export default AskSkipResolver;
