import { Arg, Ctx, Field, Int, ObjectType, PubSub, PubSubEngine, Query, Resolver } from 'type-graphql';
import { LogError, LogStatus, Metadata, RunQuery, RunQueryParams, RunView, UserInfo } from '@memberjunction/core';
import { AppContext, UserPayload } from '../types';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { SkipDataContext, SkipDataContextItem, SkipAPIRequest, SkipAPIResponse, SkipMessage, SkipAPIAnalysisCompleteResponse, SkipAPIDataRequestResponse, SkipAPIClarifyingQuestionResponse } from '@memberjunction/skip-types';
import axios from 'axios';
import zlib from 'zlib';
import { promisify } from 'util';
// Convert zlib.gzip into a promise-returning function
const gzip = promisify(zlib.gzip);

import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver';
import { ConversationDetailEntity, ConversationEntity, DataContextEntity, DataContextItemEntity, UserNotificationEntity, UserViewEntityExtended } from '@memberjunction/core-entities';
import { DataSource } from 'typeorm';
import { ___skipAPIOrgId, ___skipAPIurl } from '../config';


import { registerEnumType } from "type-graphql";


enum SkipResponsePhase {
  ClarifyingQuestion = "clarifying_question",
  DataRequest = "data_request",
  AnalysisComplete = "analysis_complete",
}

registerEnumType(SkipResponsePhase, {
  name: "SkipResponsePhase", 
  description: "The phase of the respons: clarifying_question, data_request, or analysis_complete",  
});


@ObjectType()
export class AskSkipResultType {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Status: string; // required

  @Field(() => SkipResponsePhase)
  ResponsePhase: SkipResponsePhase;

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
  private static _maxHistoricalMessages = 8;


  @Query(() => AskSkipResultType)
  async ExecuteAskSkipAnalysisQuery(
    @Arg('UserQuestion', () => String) UserQuestion: string,
    @Arg('ConversationId', () => Int) ConversationId: number,
    @Ctx() { dataSource, userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine,
    @Arg('DataContextId', () => Int, { nullable: true }) DataContextId?: number
  ) {
    const md = new Metadata();
    const user = UserCache.Instance.Users.find((u) => u.Email === userPayload.email);
    if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);

    const {convoEntity, dataContextEntity, convoDetailEntity, dataContext} = await this.HandleSkipInitialObjectLoading(dataSource, ConversationId, UserQuestion, user, userPayload, md, DataContextId);

    const OrganizationId = ___skipAPIOrgId;

    // now load up the messages. We will load up ALL of the messages for this conversation, and then pass them to the Skip API
    const messages: SkipMessage[] = await this.LoadConversationDetailsIntoSkipMessages(dataSource, convoEntity.ID, AskSkipResolver._maxHistoricalMessages);

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

    return this.HandleSkipRequest(input, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, md, convoEntity, convoDetailEntity, dataContext, dataContextEntity);
  }


  protected async HandleSkipInitialObjectLoading(dataSource: DataSource, 
                                                 ConversationId: number, 
                                                 UserQuestion: string, 
                                                 user: UserInfo,
                                                 userPayload: UserPayload, 
                                                 md: Metadata,
                                                 DataContextId: number): Promise<{convoEntity: ConversationEntity, 
                                                                         dataContextEntity: DataContextEntity, 
                                                                         convoDetailEntity: ConversationDetailEntity, 
                                                                         dataContext: SkipDataContext}> {
    const convoEntity = <ConversationEntity>await md.GetEntityObject('Conversations', user);
    let dataContextEntity: DataContextEntity;

    if (!ConversationId || ConversationId <= 0) {
      // create a new conversation id
      convoEntity.NewRecord();
      if (user) {
        convoEntity.UserID = user.ID;
        convoEntity.Name = AskSkipResolver._defaultNewChatName;

        dataContextEntity = await md.GetEntityObject<DataContextEntity>('Data Contexts', user);
        if (!DataContextId || DataContextId <= 0) {
          dataContextEntity.NewRecord();
          dataContextEntity.UserID = user.ID;
          dataContextEntity.Name = 'Data Context for Skip Conversation';
          if (!await dataContextEntity.Save())
            throw new Error(`Creating a new data context failed`);
        }
        else {
          await dataContextEntity.Load(DataContextId);
        }
        convoEntity.DataContextID = dataContextEntity.ID;
        if (await convoEntity.Save()) {
          ConversationId = convoEntity.ID;
          if (!DataContextId || dataContextEntity.ID <= 0) {
            // only do this if we created a new data context for this conversation
            dataContextEntity.Name += ` ${ConversationId}`;
            await dataContextEntity.Save();  
          }
        }
        else 
          throw new Error(`Creating a new conversation failed`);
      } 
      else { 
        throw new Error(`User ${userPayload.email} not found in UserCache`);
      }
    } else {
      await convoEntity.Load(ConversationId); // load the existing conversation, will need it later
      dataContextEntity = await md.GetEntityObject<DataContextEntity>('Data Contexts', user);

      // note - we ignore the parameter DataContextId if it is passed in, we will use the data context from the conversation that is saved. If a user wants to change the data context for a convo, they can do that elsewhere
      if (DataContextId && DataContextId > 0 && DataContextId !== convoEntity.DataContextID) 
        console.log(`AskSkipResolver: DataContextId ${DataContextId} was passed in but it was ignored because it was different than the DataContextID in the conversation ${convoEntity.DataContextID}`);

      await dataContextEntity.Load(convoEntity.DataContextID);
    }


    // now, create a conversation detail record for the user message
    const convoDetailEntity = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', user);
    convoDetailEntity.NewRecord();
    convoDetailEntity.ConversationID = ConversationId;
    convoDetailEntity.Message = UserQuestion;
    convoDetailEntity.Role = 'User';
    convoDetailEntity.Set('Sequence', 1); // using weakly typed here because we're going to get rid of this field soon
    await convoDetailEntity.Save();

    const dataContext: SkipDataContext = new SkipDataContext();
    const dciEntityInfo = md.Entities.find((e) => e.Name === 'Data Context Items');
    if (!dciEntityInfo)
      throw new Error(`Data Context Items entity not found`);

    const sql = `SELECT * FROM ${dciEntityInfo.SchemaName}.${dciEntityInfo.BaseView} WHERE DataContextID = ${dataContextEntity.ID}`;
    const result = await dataSource.query(sql);
    if (!result) 
      throw new Error(`Error running SQL: ${sql}`);
    else {
      for (const r of result) {
        const item = new SkipDataContextItem();
        item.Type = r.Type;
        item.RecordID = r.RecordID;
        item.RecordName = r.RecordName;
        item.Data = r.Data && r.Data.length > 0 ? JSON.parse(r.Data) : item.Data; // parse the stored data if it was saved, otherwise leave it to whatever the object's default is
        item.AdditionalDescription = r.AdditionalDescription;
        item.DataContextItemID = r.ID;
        dataContext.Items.push(item);
      }
    }

    // // now if we don't already have this view in our data context, we will add it
    // if (ViewId && !dataContext.Items.find(i => i.Type === 'view' && i.RecordID === ViewId))
    //   dataContext.Items.push(
    //     {
    //       Type: 'view',
    //       RecordID: ViewId,
    //       Data: await this.getViewData(ViewId, user),
    //     } as SkipDataContextItem
    //   );    

    return {dataContext, convoEntity, dataContextEntity, convoDetailEntity};
  }

  protected async LoadConversationDetailsIntoSkipMessages(dataSource: DataSource, ConversationId: number, maxHistoricalMessages?: number): Promise<SkipMessage[]> {
    try {
      // load up all the conversation details from the database server
      const md = new Metadata();
      const e = md.Entities.find((e) => e.Name === 'Conversation Details');
      const sql = `SELECT 
                      ${maxHistoricalMessages ? 'TOP ' + maxHistoricalMessages : ''} ID, Message, Role, CreatedAt 
                   FROM 
                      ${e.SchemaName}.${e.BaseView} 
                   WHERE 
                      ConversationID = ${ConversationId} 
                   ORDER 
                      BY CreatedAt DESC`;
      const result = await dataSource.query(sql);
      if (!result) 
        throw new Error(`Error running SQL: ${sql}`);
      else  {
        // first, let's sort the result array into a local variable called returnData and in that we will sort by CreatedAt in ASCENDING order so we have the right chronological order
        // the reason we're doing a LOCAL sort here is because in the SQL query above, we're sorting in DESCENDING order so we can use the TOP clause to limit the number of records and get the 
        // N most recent records. We want to sort in ASCENDING order because we want to send the messages to the Skip API in the order they were created.
        const returnData = result.sort((a: any, b: any) => {
          const aDate = new Date(a.CreatedAt);
          const bDate = new Date(b.CreatedAt);
          return aDate.getTime() - bDate.getTime();
        });

        // now, we will map the returnData into an array of SkipMessages
        return returnData.map((r: ConversationDetailEntity) => {
          // we want to limit the # of characters in the message to 5000, rough approximation for 1000 words/tokens
          // but we only do that for system messages
          const skipRole = this.MapDBRoleToSkipRole(r.Role);
          const m: SkipMessage = {
            content: skipRole === 'system' ? (r.Message.length > 5000 ? "PARTIAL CONTENT: " + r.Message.substring(0, 5000) : r.Message) : r.Message,
            role: skipRole,
          };
          return m;
        });
      }
    }
    catch (e) {
      LogError(e);
      throw e;
    }
  }

  protected MapDBRoleToSkipRole(role: string): "user" | "system" {
    switch (role.trim().toLowerCase()) {
      case 'ai': 
        return 'system';
      default: 
        return 'user';
    }
  }

  protected async HandleSkipRequest(input: SkipAPIRequest, UserQuestion: string, user: UserInfo, dataSource: DataSource, 
                                    ConversationId: number, userPayload: UserPayload, pubSub: PubSubEngine, md: Metadata, 
                                    convoEntity: ConversationEntity, convoDetailEntity: ConversationDetailEntity,
                                    dataContext: SkipDataContext, dataContextEntity: DataContextEntity): Promise<AskSkipResultType> {
    LogStatus(`Sending request to Skip API: ${___skipAPIurl}`)

    // Convert JSON payload to a Buffer and compress it
    const compressedPayload = await gzip(Buffer.from(JSON.stringify(input)));

    // Send the compressed payload with Axios
    const response = await axios.post(___skipAPIurl, compressedPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip'
      }
    });

    if (response.status === 200) {
      const apiResponse = <SkipAPIResponse>response.data;
      LogStatus(`  Skip API response: ${apiResponse.responsePhase}`)
      this.PublishApiResponseUserUpdateMessage(apiResponse, userPayload, pubSub);

      // now, based on the result type, we will either wait for the next phase or we will process the results
      if (apiResponse.responsePhase === 'data_request') {
        return await this.HandleDataRequestPhase(input, <SkipAPIDataRequestResponse>apiResponse, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, convoEntity, convoDetailEntity, dataContext, dataContextEntity);
      }
      else if (apiResponse.responsePhase === 'clarifying_question') {
        // need to send the request back to the user for a clarifying question
        return await this.HandleClarifyingQuestionPhase(input, <SkipAPIClarifyingQuestionResponse>apiResponse, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, convoEntity, convoDetailEntity);
      }
      else if (apiResponse.responsePhase === 'analysis_complete') {
        return await this.HandleAnalysisComplete(input, <SkipAPIAnalysisCompleteResponse>apiResponse, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, convoEntity, convoDetailEntity, dataContext, dataContextEntity);
      }
      else {
        // unknown response phase
        throw new Error(`Unknown Skip API response phase: ${apiResponse.responsePhase}`);
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
        ResponsePhase: SkipResponsePhase.AnalysisComplete,
        ConversationId: ConversationId,
        UserMessageConversationDetailId: 0,
        AIMessageConversationDetailId: 0,
      };
    }
  }

  protected async PublishApiResponseUserUpdateMessage(apiResponse: SkipAPIResponse, userPayload: UserPayload, pubSub: PubSubEngine) {
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
  }

  protected async HandleAnalysisComplete(apiRequest: SkipAPIRequest, apiResponse: SkipAPIAnalysisCompleteResponse, UserQuestion: string, user: UserInfo, dataSource: DataSource, 
                                         ConversationId: number, userPayload: UserPayload, pubSub: PubSubEngine, convoEntity: ConversationEntity, convoDetailEntity: ConversationDetailEntity,
                                         dataContext: SkipDataContext, dataContextEntity: DataContextEntity): Promise<AskSkipResultType> {
    // analysis is complete
    // all done, wrap things up
    const md = new Metadata();
    const {AIMessageConversationDetailID} = await this.FinishConversationAndNotifyUser(apiResponse, dataContext, dataContextEntity, md, user, convoEntity, pubSub, userPayload);

    return {
      Success: true,
      Status: 'OK',
      ResponsePhase: SkipResponsePhase.AnalysisComplete,
      ConversationId: ConversationId,
      UserMessageConversationDetailId: convoDetailEntity.ID,
      AIMessageConversationDetailId: AIMessageConversationDetailID,
      Result: JSON.stringify(apiResponse)
    };
  }

  protected async HandleClarifyingQuestionPhase(apiRequest: SkipAPIRequest, apiResponse: SkipAPIClarifyingQuestionResponse, UserQuestion: string, user: UserInfo, dataSource: DataSource, 
                                                ConversationId: number, userPayload: UserPayload, pubSub: PubSubEngine, convoEntity: ConversationEntity, convoDetailEntity: ConversationDetailEntity): Promise<AskSkipResultType> {
    // need to create a message here in the COnversation and then pass that id below
    const md = new Metadata();
    const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
    convoDetailEntityAI.NewRecord();
    convoDetailEntityAI.ConversationID = ConversationId; 
    convoDetailEntityAI.Message = apiResponse.clarifyingQuestion;
    convoDetailEntityAI.Role = 'AI';
    if (await convoDetailEntityAI.Save()) {
      return {
        Success: true,
        Status: 'OK',
        ResponsePhase: SkipResponsePhase.ClarifyingQuestion,
        ConversationId: ConversationId,
        UserMessageConversationDetailId: convoDetailEntity.ID,
        AIMessageConversationDetailId: convoDetailEntityAI.ID,
        Result: JSON.stringify(apiResponse)
      };        
    }
    else {
      return {
        Success: false,
        Status: 'Error',
        ResponsePhase: SkipResponsePhase.ClarifyingQuestion,
        ConversationId: ConversationId,
        UserMessageConversationDetailId: convoDetailEntity.ID,
        AIMessageConversationDetailId: convoDetailEntityAI.ID,
        Result: JSON.stringify(apiResponse)
      };
    }
  }

  protected async HandleDataRequestPhase(apiRequest: SkipAPIRequest, apiResponse: SkipAPIDataRequestResponse, UserQuestion: string, user: UserInfo, dataSource: DataSource, 
                                         ConversationId: number, userPayload: UserPayload, pubSub: PubSubEngine, convoEntity: ConversationEntity, convoDetailEntity: ConversationDetailEntity,
                                         dataContext: SkipDataContext, dataContextEntity: DataContextEntity): Promise<AskSkipResultType> {
    // our job in this method is to go through each of the data requests from the Skip API, get the data, and then go back to the Skip API again and to the next phase
    try {  
      const _maxDataGatheringRetries = 5;
      const _dataGatheringFailureHeaderMessage = '***DATA GATHERING FAILURE***';
      const md = new Metadata();
      const executionErrors = [];

      // first, in this situation we want to add a message to our apiRequest so that it is part of the message history with the server
      apiRequest.messages.push({
        content: `Skip API Requested Data as shown below
                  ${JSON.stringify(apiResponse.dataRequest)}`, 
        role: 'system' // user role of system because this came from Skip, we are simplifying the message for the next round if we need to send it back
      });

      for (const dr of apiResponse.dataRequest) {
        try {
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
              dataContext.Items.push(item);
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
                  dataContext.Items.push(item);    
                }
                else
                  throw new Error(`Error running query ${queryName}`);
              }
              else
                throw new Error(`Query ${queryName} not found.`);
              break;
          }
        }
        catch (e) {
          LogError(e);
          executionErrors.push({dataRequest: dr, errorMessage: e && e.message ? e.message : e.toString()});
        }
      }

      if (executionErrors.length > 0) {
        const dataGatheringFailedAttemptCount = apiRequest.messages.filter((m) => m.content.includes(_dataGatheringFailureHeaderMessage)).length + 1;
        if (dataGatheringFailedAttemptCount > _maxDataGatheringRetries) {
          // we have exceeded the max retries, so in this case we do NOT go back to Skip, instead we just send the errors back to the user
          LogStatus(`Execution errors for Skip data request occured, and we have exceeded the max retries${_maxDataGatheringRetries}, sending errors back to the user.`);
          return {
            Success: false,
            Status: 'Error gathering data and we have exceedded the max retries. Try again later and Skip might be able to handle this request.',
            ResponsePhase: SkipResponsePhase.DataRequest,
            ConversationId: ConversationId,
            UserMessageConversationDetailId: convoDetailEntity.ID,
            AIMessageConversationDetailId: 0,
            Result: JSON.stringify(apiResponse)
          };    
        }
        else {
          LogStatus(`Execution errors for Skip data request occured, sending those errors back to the Skip API to get new instructions.`);
          apiRequest.requestPhase = 'data_gathering_failure';
          apiRequest.messages.push({
            content: `${_dataGatheringFailureHeaderMessage} #${dataGatheringFailedAttemptCount} of ${_maxDataGatheringRetries} attempts to gather data failed. Errors:
                      ${JSON.stringify(executionErrors)}
                    `, 
            role: 'user' // use user role becuase to the Skip API what we send it is "user"
          });
        }
      }
      else {
          apiRequest.requestPhase = 'data_gathering_response';
        }
      // we have all of the data now, add it to the data context and then submit it back to the Skip API
      return this.HandleSkipRequest(apiRequest, UserQuestion, user, dataSource, ConversationId, userPayload, pubSub, md, convoEntity, convoDetailEntity, dataContext, dataContextEntity);
    }
    catch (e) {
      LogError(e);
      throw e;
    }
  }

  /**
   * This method will handle the process for an end of successful request where a user is notified of an AI message. The AI message is either the finished report or a clarifying question.
   * @param apiResponse 
   * @param md 
   * @param user 
   * @param convoEntity 
   * @param pubSub 
   * @param userPayload 
   * @returns 
   */
  protected async FinishConversationAndNotifyUser(apiResponse: SkipAPIAnalysisCompleteResponse, dataContext: SkipDataContext, dataContextEntity: DataContextEntity, md: Metadata, user: UserInfo, convoEntity: ConversationEntity, pubSub: PubSubEngine, userPayload: UserPayload): Promise<{AIMessageConversationDetailID: number}> {
    const sTitle = apiResponse.reportTitle; 
    const sResult = JSON.stringify(apiResponse);

    // Create a conversation detail record for the Skip response
    const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
    convoDetailEntityAI.NewRecord();
    convoDetailEntityAI.ConversationID = convoEntity.ID;
    convoDetailEntityAI.Message = sResult;
    convoDetailEntityAI.Role = 'AI';
    convoDetailEntityAI.Set('Sequence', 2); // using weakly typed here because we're going to get rid of this field soon
    await convoDetailEntityAI.Save();

    // finally update the convo name if it is still the default
    if (convoEntity.Name === AskSkipResolver._defaultNewChatName && sTitle && sTitle !== AskSkipResolver._defaultNewChatName) {
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
    
    // now, persist the data context items, first let's get 
    for (const item of dataContext.Items) {
      const dciEntity = <DataContextItemEntity>await md.GetEntityObject('Data Context Items', user);
      if (item.DataContextItemID > 0) 
        await dciEntity.Load(item.DataContextItemID);
      else
        dciEntity.NewRecord();
      dciEntity.DataContextID = dataContextEntity.ID;
      dciEntity.Type = item.Type;
      dciEntity.RecordID = item.RecordID;
      if (item.Type === 'sql')
        dciEntity.SQL = item.RecordName; // the SQL field in the database is where we store the SQL, in the object model it ends up in the RecordName property, mapping it here
      dciEntity.DataJSON = JSON.stringify(item.Data);
      await dciEntity.Save();
    }

    // send a UI update trhough pub-sub
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
