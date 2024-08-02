import { Arg, Ctx, Field, Int, ObjectType, PubSub, PubSubEngine, Query, Resolver } from 'type-graphql';
import { LogError, LogStatus, Metadata, KeyValuePair, RunView, UserInfo, CompositeKey } from '@memberjunction/core';
import { AppContext, UserPayload } from '../types.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { DataContext } from '@memberjunction/data-context';
import { LoadDataContextItemsServer } from '@memberjunction/data-context-server';
LoadDataContextItemsServer(); // prevent tree shaking since the DataContextItemServer class is not directly referenced in this file or otherwise statically instantiated, so it could be removed by the build process

import {
  SkipAPIRequest,
  SkipAPIResponse,
  SkipMessage,
  SkipAPIAnalysisCompleteResponse,
  SkipAPIDataRequestResponse,
  SkipAPIClarifyingQuestionResponse,
  SkipEntityInfo,
  SkipQueryInfo,
  SkipAPIRunScriptRequest,
  SkipAPIRequestAPIKey,
  SkipRequestPhase,
} from '@memberjunction/skip-types';

import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import {
  ConversationDetailEntity,
  ConversationEntity,
  DataContextEntity,
  DataContextItemEntity,
  UserNotificationEntity,
} from '@memberjunction/core-entities';
import { DataSource } from 'typeorm';
import { ___skipAPIOrgId, ___skipAPIurl, configInfo, mj_core_schema } from '../config.js';

import { registerEnumType } from 'type-graphql';
import { MJGlobal, CopyScalarsAndArrays } from '@memberjunction/global';
import { sendPostRequest } from '../util.js';
import { GetAIAPIKey } from '@memberjunction/ai';
import { CompositeKeyInputType } from '../generic/KeyInputOutputTypes.js';

enum SkipResponsePhase {
  ClarifyingQuestion = 'clarifying_question',
  DataRequest = 'data_request',
  AnalysisComplete = 'analysis_complete',
}

registerEnumType(SkipResponsePhase, {
  name: 'SkipResponsePhase',
  description: 'The phase of the respons: clarifying_question, data_request, or analysis_complete',
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
  ConversationId: string;

  @Field(() => Int)
  UserMessageConversationDetailId: string;

  @Field(() => Int)
  AIMessageConversationDetailId: string;
}

@Resolver(AskSkipResultType)
export class AskSkipResolver {
  private static _defaultNewChatName = 'New Chat';
  private static _maxHistoricalMessages = 20;

  /**
   * Handles a simple chat request from a user to Skip, using a particular data record
   * @param UserQuestion the user's question
   * @param EntityName the name of the entity for the record the user is discussing
   * @param PrimaryKeys the primary keys of the record the user is discussing
   */
  @Query(() => AskSkipResultType)
  async ExecuteAskSkipRecordChat(
    @Arg('UserQuestion', () => String) UserQuestion: string,
    @Arg('ConversationId', () => String) ConversationId: string,
    @Arg('EntityName', () => String) EntityName: string,
    @Arg('CompositeKey', () => CompositeKeyInputType) compositeKey: CompositeKeyInputType,
    @Ctx() { dataSource, userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine
  ) {
    // In this function we're simply going to call the Skip API and pass along the message from the user

    // first, get the user from the cache
    const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase());
    if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);

    // now load up the messages. We will load up ALL of the messages for this conversation, and then pass them to the Skip API
    const messages: SkipMessage[] = await this.LoadConversationDetailsIntoSkipMessages(
      dataSource,
      ConversationId,
      AskSkipResolver._maxHistoricalMessages
    );

    const md = new Metadata();
    const { convoEntity, dataContextEntity, convoDetailEntity, dataContext } = await this.HandleSkipInitialObjectLoading(
      dataSource,
      ConversationId,
      UserQuestion,
      user,
      userPayload,
      md,
      null
    );

    // if we have a new conversation, update the data context to have an item for this record
    if (!ConversationId || ConversationId.length === 0) {
      const dci = await md.GetEntityObject<DataContextItemEntity>('Data Context Items', user);
      dci.DataContextID = dataContext.ID;
      dci.Type = 'single_record';
      dci.EntityID = md.Entities.find((e) => e.Name === EntityName)?.ID;
      const ck = new CompositeKey();
      ck.KeyValuePairs = compositeKey.KeyValuePairs;
      dci.RecordID = ck.Values();
      let dciSaveResult: boolean = await dci.Save();
      if (!dciSaveResult) {
        LogError(`Error saving DataContextItemEntity for record chat: ${EntityName} ${ck.Values()}`, undefined, dci.LatestResult);
      }

      await dataContext.Load(dataContext.ID, dataSource, false, true, 10, user); // load again because we added a new data context item
      await dataContext.SaveItems(user, true); // persist the data becuase the deep loading above with related data is expensive

      // also, in the situation for a new convo, we need to update the Conversation ID to have a LinkedEntity and LinkedRecord
      convoEntity.LinkedEntityID = dci.EntityID;
      convoEntity.LinkedRecordID = ck.Values();
      convoEntity.DataContextID = dataContext.ID;
      const convoEntitySaveResult: boolean = await convoEntity.Save();
      if (!convoEntitySaveResult) {
        LogError(`Error saving ConversationEntity for record chat: ${EntityName} ${ck.Values()}`, undefined, convoEntity.LatestResult);
      }
    }

    const input = this.buildSkipAPIRequest(messages, ConversationId, dataContext, 'chat_with_a_record', false, false);
    messages.push({
      content: UserQuestion,
      role: 'user',
    });

    return this.handleSimpleSkipPostRequest(input, convoEntity.ID, convoDetailEntity.ID, true, user);
  }

  protected async handleSimpleSkipPostRequest(
    input: SkipAPIRequest,
    conversationID: string = '',
    UserMessageConversationDetailId: string = '',
    createAIMessageConversationDetail: boolean = false,
    user: UserInfo = null
  ): Promise<AskSkipResultType> {
    LogStatus(`   >>> HandleSimpleSkipPostRequest Sending request to Skip API: ${___skipAPIurl}`);

    const response = await sendPostRequest(___skipAPIurl, input, true, null);

    if (response && response.length > 0) {
      // the last object in the response array is the final response from the Skip API
      const apiResponse = <SkipAPIResponse>response[response.length - 1].value;
      const AIMessageConversationDetailID = createAIMessageConversationDetail
        ? await this.CreateAIMessageConversationDetail(apiResponse, conversationID, user)
        : '';
      //      const apiResponse = <SkipAPIResponse>response.data;
      LogStatus(`  Skip API response: ${apiResponse.responsePhase}`);
      return {
        Success: true,
        Status: 'OK',
        ResponsePhase: SkipResponsePhase.AnalysisComplete,
        ConversationId: conversationID,
        UserMessageConversationDetailId: UserMessageConversationDetailId,
        AIMessageConversationDetailId: AIMessageConversationDetailID,
        Result: JSON.stringify(apiResponse),
      };
    } else {
      return {
        Success: false,
        Status: 'Error',
        Result: `Request failed`,
        ResponsePhase: SkipResponsePhase.AnalysisComplete,
        ConversationId: conversationID,
        UserMessageConversationDetailId: UserMessageConversationDetailId,
        AIMessageConversationDetailId: '',
      };
    }
  }

  protected async CreateAIMessageConversationDetail(apiResponse: SkipAPIResponse, conversationID: string, user: UserInfo): Promise<string> {
    const md = new Metadata();
    const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
    convoDetailEntityAI.NewRecord();
    convoDetailEntityAI.HiddenToUser = false;
    convoDetailEntityAI.ConversationID = conversationID;
    const systemMessages = apiResponse.messages.filter((m) => m.role === 'system');
    const lastSystemMessage = systemMessages[systemMessages.length - 1];
    convoDetailEntityAI.Message = lastSystemMessage?.content;
    convoDetailEntityAI.Role = 'AI';
    if (await convoDetailEntityAI.Save()) {
      return convoDetailEntityAI.ID;
    } else {
      LogError(
        `Error saving conversation detail entity for AI message: ${lastSystemMessage?.content}`,
        undefined,
        convoDetailEntityAI.LatestResult
      );
      return '';
    }
  }

  protected buildSkipAPIRequest(
    messages: SkipMessage[],
    conversationId: string,
    dataContext: DataContext,
    requestPhase: SkipRequestPhase,
    includeEntities: boolean,
    includeQueries: boolean
  ): SkipAPIRequest {
    const entities = includeEntities ? this.BuildSkipEntities() : [];
    const queries = includeQueries ? this.BuildSkipQueries() : [];
    const input: SkipAPIRequest = {
      apiKeys: this.buildSkipAPIKeys(),
      organizationInfo: configInfo?.askSkip?.organizationInfo,
      messages: messages,
      conversationID: conversationId.toString(),
      dataContext: <DataContext>CopyScalarsAndArrays(dataContext), // we are casting this to DataContext as we're pushing this to the Skip API, and we don't want to send the real DataContext object, just a copy of the scalar and array properties
      organizationID: ___skipAPIOrgId,
      requestPhase: requestPhase,
      entities: entities,
      queries: queries,
    };
    return input;
  }

  /**
   * Executes a script in the context of a data context and returns the results
   * @param pubSub
   * @param DataContextId
   * @param ScriptText
   */
  @Query(() => AskSkipResultType)
  async ExecuteAskSkipRunScript(
    @Ctx() { dataSource, userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine,
    @Arg('DataContextId', () => String) DataContextId: string,
    @Arg('ScriptText', () => String) ScriptText: string
  ) {
    const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase());
    if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);
    const dataContext: DataContext = new DataContext();
    await dataContext.Load(DataContextId, dataSource, true, false, 0, user);
    const input = this.buildSkipAPIRequest([], '', dataContext, 'run_existing_script', false, false);
    return this.handleSimpleSkipPostRequest(input);
  }

  protected buildSkipAPIKeys(): SkipAPIRequestAPIKey[] {
    return [
      {
        vendorDriverName: 'OpenAILLM',
        apiKey: GetAIAPIKey('OpenAILLM'),
      },
      {
        vendorDriverName: 'AnthropicLLM',
        apiKey: GetAIAPIKey('AnthropicLLM'),
      },
      {
        vendorDriverName: 'GeminiLLM',
        apiKey: GetAIAPIKey('GeminiLLM'),
      },
      {
        vendorDriverName: 'GroqLLM',
        apiKey: GetAIAPIKey('GroqLLM'),
      },
      {
        vendorDriverName: 'MistralLLM',
        apiKey: GetAIAPIKey('MistralLLM'),
      },
    ];
  }

  @Query(() => AskSkipResultType)
  async ExecuteAskSkipAnalysisQuery(
    @Arg('UserQuestion', () => String) UserQuestion: string,
    @Arg('ConversationId', () => String) ConversationId: string,
    @Ctx() { dataSource, userPayload }: AppContext,
    @PubSub() pubSub: PubSubEngine,
    @Arg('DataContextId', () => String, { nullable: true }) DataContextId?: string
  ) {
    const md = new Metadata();
    const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase());
    if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);

    const { convoEntity, dataContextEntity, convoDetailEntity, dataContext } = await this.HandleSkipInitialObjectLoading(
      dataSource,
      ConversationId,
      UserQuestion,
      user,
      userPayload,
      md,
      DataContextId
    );

    // now load up the messages. We will load up ALL of the messages for this conversation, and then pass them to the Skip API
    const messages: SkipMessage[] = await this.LoadConversationDetailsIntoSkipMessages(
      dataSource,
      convoEntity.ID,
      AskSkipResolver._maxHistoricalMessages
    );

    const input = this.buildSkipAPIRequest(messages, ConversationId, dataContext, 'initial_request', true, true);

    return this.HandleSkipRequest(
      input,
      UserQuestion,
      user,
      dataSource,
      ConversationId,
      userPayload,
      pubSub,
      md,
      convoEntity,
      convoDetailEntity,
      dataContext,
      dataContextEntity
    );
  }

  protected BuildSkipQueries(): SkipQueryInfo[] {
    const md = new Metadata();
    return md.Queries.map((q) => {
      return {
        id: q.ID,
        name: q.Name,
        description: q.Description,
        category: q.Category,
        sql: q.SQL,
        originalSQL: q.OriginalSQL,
        feedback: q.Feedback,
        status: q.Status,
        qualityRank: q.QualityRank,
        createdAt: q.__mj_CreatedAt,
        updatedAt: q.__mj_UpdatedAt,
        categoryID: q.CategoryID,
        fields: q.Fields.map((f) => {
          return {
            id: f.ID,
            queryID: f.QueryID,
            sequence: f.Sequence,
            name: f.Name,
            description: f.Description,
            sqlBaseType: f.SQLBaseType,
            sqlFullType: f.SQLFullType,
            sourceEntityID: f.SourceEntityID,
            sourceEntity: f.SourceEntity,
            sourceFieldName: f.SourceFieldName,
            isComputed: f.IsComputed,
            computationDescription: f.ComputationDescription,
            isSummary: f.IsSummary,
            summaryDescription: f.SummaryDescription,
            createdAt: f.__mj_CreatedAt,
            updatedAt: f.__mj_UpdatedAt,
          };
        }),
      };
    });
  }

  protected BuildSkipEntities(): SkipEntityInfo[] {
    // build the entity info for skip in its format which is
    // narrower in scope than our native MJ metadata
    // don't pass the mj_core_schema entities
    const md = new Metadata();
    return md.Entities.filter((e) => e.SchemaName !== mj_core_schema).map((e) => {
      const ret: SkipEntityInfo = {
        id: e.ID,
        name: e.Name,
        schemaName: e.SchemaName,
        baseView: e.BaseView,
        description: e.Description,
        fields: e.Fields.map((f) => {
          return {
            id: f.ID,
            entityID: f.EntityID,
            sequence: f.Sequence,
            name: f.Name,
            displayName: f.DisplayName,
            category: f.Category,
            type: f.Type,
            description: f.Description,
            isPrimaryKey: f.IsPrimaryKey,
            allowsNull: f.AllowsNull,
            isUnique: f.IsUnique,
            length: f.Length,
            precision: f.Precision,
            scale: f.Scale,
            sqlFullType: f.SQLFullType,
            defaultValue: f.DefaultValue,
            autoIncrement: f.AutoIncrement,
            valueListType: f.ValueListType,
            extendedType: f.ExtendedType,
            defaultInView: f.DefaultInView,
            defaultColumnWidth: f.DefaultColumnWidth,
            isVirtual: f.IsVirtual,
            isNameField: f.IsNameField,
            relatedEntityID: f.RelatedEntityID,
            relatedEntityFieldName: f.RelatedEntityFieldName,
            relatedEntity: f.RelatedEntity,
            relatedEntitySchemaName: f.RelatedEntitySchemaName,
            relatedEntityBaseView: f.RelatedEntityBaseView,
          };
        }),
        relatedEntities: e.RelatedEntities.map((r) => {
          return {
            entityID: r.EntityID,
            relatedEntityID: r.RelatedEntityID,
            type: r.Type,
            entityKeyField: r.EntityKeyField,
            relatedEntityJoinField: r.RelatedEntityJoinField,
            joinView: r.JoinView,
            joinEntityJoinField: r.JoinEntityJoinField,
            joinEntityInverseJoinField: r.JoinEntityInverseJoinField,
            entity: r.Entity,
            entityBaseView: r.EntityBaseView,
            relatedEntity: r.RelatedEntity,
            relatedEntityBaseView: r.RelatedEntityBaseView,
          };
        }),
      };
      return ret;
    });
  }

  protected async HandleSkipInitialObjectLoading(
    dataSource: DataSource,
    ConversationId: string,
    UserQuestion: string,
    user: UserInfo,
    userPayload: UserPayload,
    md: Metadata,
    DataContextId: string
  ): Promise<{
    convoEntity: ConversationEntity;
    dataContextEntity: DataContextEntity;
    convoDetailEntity: ConversationDetailEntity;
    dataContext: DataContext;
  }> {
    const convoEntity = <ConversationEntity>await md.GetEntityObject('Conversations', user);
    let dataContextEntity: DataContextEntity;

    if (!ConversationId || ConversationId.length === 0) {
      // create a new conversation id
      convoEntity.NewRecord();
      if (user) {
        convoEntity.UserID = user.ID;
        convoEntity.Name = AskSkipResolver._defaultNewChatName;

        dataContextEntity = await md.GetEntityObject<DataContextEntity>('Data Contexts', user);
        if (!DataContextId || DataContextId.length === 0) {
          dataContextEntity.NewRecord();
          dataContextEntity.UserID = user.ID;
          dataContextEntity.Name = 'Data Context for Skip Conversation';
          if (!(await dataContextEntity.Save())) {
            LogError(`Creating a new data context failed`, undefined, dataContextEntity.LatestResult);
            throw new Error(`Creating a new data context failed`);
          }
        } else {
          const dcLoadResult = await dataContextEntity.Load(DataContextId);
          if (!dcLoadResult) {
            throw new Error(`Loading DataContextEntity for DataContextId ${DataContextId} failed`);
          }
        }
        convoEntity.DataContextID = dataContextEntity.ID;
        if (await convoEntity.Save()) {
          ConversationId = convoEntity.ID;
          if (!DataContextId || dataContextEntity.ID.length === 0) {
            // only do this if we created a new data context for this conversation
            dataContextEntity.Name += ` ${ConversationId}`;
            const dciSaveResult: boolean = await dataContextEntity.Save();
            if (!dciSaveResult) {
              LogError(`Error saving DataContextEntity for conversation: ${ConversationId}`, undefined, dataContextEntity.LatestResult);
            }
          }
        } else {
          LogError(`Creating a new conversation failed`, undefined, convoEntity.LatestResult);
          throw new Error(`Creating a new conversation failed`);
        }
      } else {
        throw new Error(`User ${userPayload.email} not found in UserCache`);
      }
    } else {
      await convoEntity.Load(ConversationId); // load the existing conversation, will need it later
      dataContextEntity = await md.GetEntityObject<DataContextEntity>('Data Contexts', user);

      // note - we ignore the parameter DataContextId if it is passed in, we will use the data context from the conversation that is saved. If a user wants to change the data context for a convo, they can do that elsewhere
      if (DataContextId && DataContextId.length > 0 && DataContextId !== convoEntity.DataContextID) {
        if (convoEntity.DataContextID === null) {
          convoEntity.DataContextID = DataContextId;
          const convoEntitySaveResult: boolean = await convoEntity.Save();
          if (!convoEntitySaveResult) {
            LogError(`Error saving conversation entity for conversation: ${ConversationId}`, undefined, convoEntity.LatestResult);
          }
        } else
          console.warn(
            `AskSkipResolver: DataContextId ${DataContextId} was passed in but it was ignored because it was different than the DataContextID in the conversation ${convoEntity.DataContextID}`
          );
      }

      await dataContextEntity.Load(convoEntity.DataContextID);
    }

    // now, create a conversation detail record for the user message
    const convoDetailEntity = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', user);
    convoDetailEntity.NewRecord();
    convoDetailEntity.ConversationID = ConversationId;
    convoDetailEntity.Message = UserQuestion;
    convoDetailEntity.Role = 'User';
    convoDetailEntity.HiddenToUser = false;
    convoDetailEntity.Set('Sequence', 1); // using weakly typed here because we're going to get rid of this field soon
    let convoDetailSaveResult: boolean = await convoDetailEntity.Save();
    if (!convoDetailSaveResult) {
      LogError(`Error saving conversation detail entity for user message: ${UserQuestion}`, undefined, convoDetailEntity.LatestResult);
    }

    const dataContext = MJGlobal.Instance.ClassFactory.CreateInstance<DataContext>(DataContext); // await this.LoadDataContext(md, dataSource, dataContextEntity, user, false);
    await dataContext.Load(dataContextEntity.ID, dataSource, false, false, 0, user);
    return { dataContext, convoEntity, dataContextEntity, convoDetailEntity };
  }

  protected async LoadConversationDetailsIntoSkipMessages(
    dataSource: DataSource,
    ConversationId: string,
    maxHistoricalMessages?: number
  ): Promise<SkipMessage[]> {
    try {
      // load up all the conversation details from the database server
      const md = new Metadata();
      const e = md.Entities.find((e) => e.Name === 'Conversation Details');
      const sql = `SELECT
                      ${maxHistoricalMessages ? 'TOP ' + maxHistoricalMessages : ''} ID, Message, Role, __mj_CreatedAt
                   FROM
                      ${e.SchemaName}.${e.BaseView}
                   WHERE
                      ConversationID = '${ConversationId}'
                   ORDER
                      BY __mj_CreatedAt DESC`;
      const result = await dataSource.query(sql);
      if (!result) throw new Error(`Error running SQL: ${sql}`);
      else {
        // first, let's sort the result array into a local variable called returnData and in that we will sort by __mj_CreatedAt in ASCENDING order so we have the right chronological order
        // the reason we're doing a LOCAL sort here is because in the SQL query above, we're sorting in DESCENDING order so we can use the TOP clause to limit the number of records and get the
        // N most recent records. We want to sort in ASCENDING order because we want to send the messages to the Skip API in the order they were created.
        const returnData = result.sort((a: any, b: any) => {
          const aDate = new Date(a.__mj_CreatedAt);
          const bDate = new Date(b.__mj_CreatedAt);
          return aDate.getTime() - bDate.getTime();
        });

        // now, we will map the returnData into an array of SkipMessages
        return returnData.map((r: ConversationDetailEntity) => {
          // we want to limit the # of characters in the message to 5000, rough approximation for 1000 words/tokens
          // but we only do that for system messages
          const skipRole = this.MapDBRoleToSkipRole(r.Role);
          let outputMessage; // will be populated below for system messages
          if (skipRole === 'system') {
            let detail: SkipAPIResponse;
            try {
              detail = <SkipAPIResponse>JSON.parse(r.Message);
            } catch (e) {
              // ignore, sometimes we dont have a JSON message, just use the raw message
              detail = null;
              outputMessage = r.Message;
            }
            if (detail?.responsePhase === SkipResponsePhase.AnalysisComplete) {
              const analysisDetail = <SkipAPIAnalysisCompleteResponse>detail;
              outputMessage = JSON.stringify({
                responsePhase: SkipResponsePhase.AnalysisComplete,
                techExplanation: analysisDetail.techExplanation,
                userExplanation: analysisDetail.userExplanation,
                scriptText: analysisDetail.scriptText,
                tableDataColumns: analysisDetail.tableDataColumns,
              });
            } else if (detail?.responsePhase === SkipResponsePhase.ClarifyingQuestion) {
              const clarifyingQuestionDetail = <SkipAPIClarifyingQuestionResponse>detail;
              outputMessage = JSON.stringify({
                responsePhase: SkipResponsePhase.ClarifyingQuestion,
                clarifyingQuestion: clarifyingQuestionDetail.clarifyingQuestion,
              });
            } else if (detail) {
              // we should never get here, AI responses only fit the above
              // don't throw an exception, but log an error
              LogError(`Unknown response phase: ${detail.responsePhase}`);
            }
          }
          const m: SkipMessage = {
            content: skipRole === 'system' ? outputMessage : r.Message,
            role: skipRole,
          };
          return m;
        });
      }
    } catch (e) {
      LogError(e);
      throw e;
    }
  }

  protected MapDBRoleToSkipRole(role: string): 'user' | 'system' {
    switch (role.trim().toLowerCase()) {
      case 'ai':
      case 'system':
      case 'assistant':
        return 'system';
      default:
        return 'user';
    }
  }

  protected async HandleSkipRequest(
    input: SkipAPIRequest,
    UserQuestion: string,
    user: UserInfo,
    dataSource: DataSource,
    ConversationId: string,
    userPayload: UserPayload,
    pubSub: PubSubEngine,
    md: Metadata,
    convoEntity: ConversationEntity,
    convoDetailEntity: ConversationDetailEntity,
    dataContext: DataContext,
    dataContextEntity: DataContextEntity
  ): Promise<AskSkipResultType> {
    LogStatus(`   >>> HandleSkipRequest: Sending request to Skip API: ${___skipAPIurl}`);

    const response = await sendPostRequest(
      ___skipAPIurl,
      input,
      true,
      null,
      (message: {
        type: string;
        value: {
          success: boolean;
          error: string;
          responsePhase: string;
          messages: {
            role: string;
            content: string;
          }[];
        };
      }) => {
        LogStatus(JSON.stringify(message, null, 4));
        if (message.type === 'status_update') {
          pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
            message: JSON.stringify({
              type: 'AskSkip',
              status: 'OK',
              conversationID: ConversationId,
              ResponsePhase: message.value.responsePhase,
              message: message.value.messages[0].content,
            }),
            sessionId: userPayload.sessionId,
          });
        }
      }
    );

    if (response && response.length > 0) {
      // response.status === 200) {
      // the last object in the response array is the final response from the Skip API
      const apiResponse = <SkipAPIResponse>response[response.length - 1].value;
      //const apiResponse = <SkipAPIResponse>response.data;
      LogStatus(`  Skip API response: ${apiResponse.responsePhase}`);
      this.PublishApiResponseUserUpdateMessage(apiResponse, userPayload, ConversationId, pubSub);

      // now, based on the result type, we will either wait for the next phase or we will process the results
      if (apiResponse.responsePhase === 'data_request') {
        return await this.HandleDataRequestPhase(
          input,
          <SkipAPIDataRequestResponse>apiResponse,
          UserQuestion,
          user,
          dataSource,
          ConversationId,
          userPayload,
          pubSub,
          convoEntity,
          convoDetailEntity,
          dataContext,
          dataContextEntity
        );
      } else if (apiResponse.responsePhase === 'clarifying_question') {
        // need to send the request back to the user for a clarifying question
        return await this.HandleClarifyingQuestionPhase(
          input,
          <SkipAPIClarifyingQuestionResponse>apiResponse,
          UserQuestion,
          user,
          dataSource,
          ConversationId,
          userPayload,
          pubSub,
          convoEntity,
          convoDetailEntity
        );
      } else if (apiResponse.responsePhase === 'analysis_complete') {
        return await this.HandleAnalysisComplete(
          input,
          <SkipAPIAnalysisCompleteResponse>apiResponse,
          UserQuestion,
          user,
          dataSource,
          ConversationId,
          userPayload,
          pubSub,
          convoEntity,
          convoDetailEntity,
          dataContext,
          dataContextEntity
        );
      } else {
        // unknown response phase
        throw new Error(`Unknown Skip API response phase: ${apiResponse.responsePhase}`);
      }
    } else {
      pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
        message: JSON.stringify({
          type: 'AskSkip',
          status: 'Error',
          conversationID: ConversationId,
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
        UserMessageConversationDetailId: '',
        AIMessageConversationDetailId: '',
      };
    }
  }

  protected async PublishApiResponseUserUpdateMessage(
    apiResponse: SkipAPIResponse,
    userPayload: UserPayload,
    conversationID: string,
    pubSub: PubSubEngine
  ) {
    let sUserMessage: string = '';
    switch (apiResponse.responsePhase) {
      case 'data_request':
        sUserMessage = 'We need to gather some more data, I will do that next and update you soon.';
        break;
      case 'analysis_complete':
        sUserMessage = 'I have completed the analysis, the results will be available momentarily.';
        break;
      case 'clarifying_question':
        // don't send an update because the actual message will happen and show up in the UI, so this is redundant
        //sUserMessage = 'I have a clarifying question for you, please see review our chat so you can provide me a little more info.';
        break;
    }

    // update the UI
    pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
      message: JSON.stringify({
        type: 'AskSkip',
        status: 'OK',
        conversationID,
        message: sUserMessage,
      }),
      sessionId: userPayload.sessionId,
    });
  }

  protected async HandleAnalysisComplete(
    apiRequest: SkipAPIRequest,
    apiResponse: SkipAPIAnalysisCompleteResponse,
    UserQuestion: string,
    user: UserInfo,
    dataSource: DataSource,
    ConversationId: string,
    userPayload: UserPayload,
    pubSub: PubSubEngine,
    convoEntity: ConversationEntity,
    convoDetailEntity: ConversationDetailEntity,
    dataContext: DataContext,
    dataContextEntity: DataContextEntity
  ): Promise<AskSkipResultType> {
    // analysis is complete
    // all done, wrap things up
    const md = new Metadata();
    const { AIMessageConversationDetailID } = await this.FinishConversationAndNotifyUser(
      apiResponse,
      dataContext,
      dataContextEntity,
      md,
      user,
      convoEntity,
      pubSub,
      userPayload
    );
    const response: AskSkipResultType = {
      Success: true,
      Status: 'OK',
      ResponsePhase: SkipResponsePhase.AnalysisComplete,
      ConversationId: ConversationId,
      UserMessageConversationDetailId: convoDetailEntity.ID,
      AIMessageConversationDetailId: AIMessageConversationDetailID,
      Result: JSON.stringify(apiResponse),
    };
    return response;
  }

  protected async HandleClarifyingQuestionPhase(
    apiRequest: SkipAPIRequest,
    apiResponse: SkipAPIClarifyingQuestionResponse,
    UserQuestion: string,
    user: UserInfo,
    dataSource: DataSource,
    ConversationId: string,
    userPayload: UserPayload,
    pubSub: PubSubEngine,
    convoEntity: ConversationEntity,
    convoDetailEntity: ConversationDetailEntity
  ): Promise<AskSkipResultType> {
    // need to create a message here in the COnversation and then pass that id below
    const md = new Metadata();
    const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
    convoDetailEntityAI.NewRecord();
    convoDetailEntityAI.ConversationID = ConversationId;
    convoDetailEntityAI.Message = JSON.stringify(apiResponse); //.clarifyingQuestion;
    convoDetailEntityAI.Role = 'AI';
    convoDetailEntityAI.HiddenToUser = false;
    if (await convoDetailEntityAI.Save()) {
      return {
        Success: true,
        Status: 'OK',
        ResponsePhase: SkipResponsePhase.ClarifyingQuestion,
        ConversationId: ConversationId,
        UserMessageConversationDetailId: convoDetailEntity.ID,
        AIMessageConversationDetailId: convoDetailEntityAI.ID,
        Result: JSON.stringify(apiResponse),
      };
    } else {
      LogError(
        `Error saving conversation detail entity for AI message: ${apiResponse.clarifyingQuestion}`,
        undefined,
        convoDetailEntityAI.LatestResult
      );
      return {
        Success: false,
        Status: 'Error',
        ResponsePhase: SkipResponsePhase.ClarifyingQuestion,
        ConversationId: ConversationId,
        UserMessageConversationDetailId: convoDetailEntity.ID,
        AIMessageConversationDetailId: convoDetailEntityAI.ID,
        Result: JSON.stringify(apiResponse),
      };
    }
  }

  protected async HandleDataRequestPhase(
    apiRequest: SkipAPIRequest,
    apiResponse: SkipAPIDataRequestResponse,
    UserQuestion: string,
    user: UserInfo,
    dataSource: DataSource,
    ConversationId: string,
    userPayload: UserPayload,
    pubSub: PubSubEngine,
    convoEntity: ConversationEntity,
    convoDetailEntity: ConversationDetailEntity,
    dataContext: DataContext,
    dataContextEntity: DataContextEntity
  ): Promise<AskSkipResultType> {
    // our job in this method is to go through each of the data requests from the Skip API, get the data, and then go back to the Skip API again and to the next phase
    try {
      if (!apiResponse.success) {
        LogError(`Data request/gathering from Skip API failed: ${apiResponse.error}`);
        return {
          Success: false,
          Status: `The Skip API Server data gathering phase returned a non-recoverable error. Try again later and Skip might be able to handle this request.\n${apiResponse.error}`,
          ResponsePhase: SkipResponsePhase.DataRequest,
          ConversationId: ConversationId,
          UserMessageConversationDetailId: convoDetailEntity.ID,
          AIMessageConversationDetailId: '',
          Result: JSON.stringify(apiResponse),
        };
      }

      const _maxDataGatheringRetries = 5;
      const _dataGatheringFailureHeaderMessage = '***DATA GATHERING FAILURE***';
      const md = new Metadata();
      const executionErrors = [];
      let dataRequest = apiResponse.dataRequest;

      // first, in this situation we want to add a message to our apiRequest so that it is part of the message history with the server
      apiRequest.messages.push({
        content: `Skip API Requested Data as shown below
                  ${JSON.stringify(apiResponse.dataRequest)}`,
        role: 'system', // user role of system because this came from Skip, we are simplifying the message for the next round if we need to send it back
      });

      // check to see if apiResponse.dataRequest is an array, if not, see if it is a single item, and if not, then throw an error
      if (!Array.isArray(dataRequest)) {
        if (dataRequest) {
          dataRequest = [dataRequest];
        } else {
          const errorMessage = `Data request from Skip API is not an array and not a single item.`;
          LogError(errorMessage);
          executionErrors.push({ dataRequest: apiResponse.dataRequest, errorMessage: errorMessage });
          dataRequest = []; // make a blank array so we can continue
        }
      }

      for (const dr of dataRequest) {
        try {
          const item = dataContext.AddDataContextItem();
          switch (dr.type) {
            case 'sql':
              item.Type = 'sql';
              item.SQL = dr.text;
              item.AdditionalDescription = dr.description;
              if (!(await item.LoadData(dataSource, false, false, 0, user)))
                throw new Error(`SQL data request failed: ${item.DataLoadingError}`);
              break;
            case 'stored_query':
              const queryName = dr.text;
              const query = md.Queries.find((q) => q.Name === queryName);
              if (query) {
                item.Type = 'query';
                item.QueryID = query.ID;
                item.RecordName = query.Name;
                item.AdditionalDescription = dr.description;
                if (!(await item.LoadData(dataSource, false, false, 0, user)))
                  throw new Error(`SQL data request failed: ${item.DataLoadingError}`);
              } else throw new Error(`Query ${queryName} not found.`);
              break;
            default:
              throw new Error(`Unknown data request type: ${dr.type}`);
              break;
          }
        } catch (e) {
          LogError(e);
          executionErrors.push({ dataRequest: dr, errorMessage: e && e.message ? e.message : e.toString() });
        }
      }

      if (executionErrors.length > 0) {
        const dataGatheringFailedAttemptCount =
          apiRequest.messages.filter((m) => m.content.includes(_dataGatheringFailureHeaderMessage)).length + 1;
        if (dataGatheringFailedAttemptCount > _maxDataGatheringRetries) {
          // we have exceeded the max retries, so in this case we do NOT go back to Skip, instead we just send the errors back to the user
          LogStatus(
            `Execution errors for Skip data request occured, and we have exceeded the max retries${_maxDataGatheringRetries}, sending errors back to the user.`
          );
          return {
            Success: false,
            Status:
              'Error gathering data and we have exceedded the max retries. Try again later and Skip might be able to handle this request.',
            ResponsePhase: SkipResponsePhase.DataRequest,
            ConversationId: ConversationId,
            UserMessageConversationDetailId: convoDetailEntity.ID,
            AIMessageConversationDetailId: '',
            Result: JSON.stringify(apiResponse),
          };
        } else {
          LogStatus(`Execution errors for Skip data request occured, sending those errors back to the Skip API to get new instructions.`);
          apiRequest.requestPhase = 'data_gathering_failure';
          apiRequest.messages.push({
            content: `${_dataGatheringFailureHeaderMessage} #${dataGatheringFailedAttemptCount} of ${_maxDataGatheringRetries} attempts to gather data failed. Errors:
                      ${JSON.stringify(executionErrors)}
                    `,
            role: 'user', // use user role becuase to the Skip API what we send it is "user"
          });
        }
      } else {
        await dataContext.SaveItems(user, false); // save the data context items
        // replace the data context copy that is in the apiRequest.
        apiRequest.dataContext = <DataContext>CopyScalarsAndArrays(dataContext); // we are casting this to DataContext as we're pushing this to the Skip API, and we don't want to send the real DataContext object, just a copy of the scalar and array properties
        apiRequest.requestPhase = 'data_gathering_response';
      }
      // we have all of the data now, add it to the data context and then submit it back to the Skip API
      return this.HandleSkipRequest(
        apiRequest,
        UserQuestion,
        user,
        dataSource,
        ConversationId,
        userPayload,
        pubSub,
        md,
        convoEntity,
        convoDetailEntity,
        dataContext,
        dataContextEntity
      );
    } catch (e) {
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
  protected async FinishConversationAndNotifyUser(
    apiResponse: SkipAPIAnalysisCompleteResponse,
    dataContext: DataContext,
    dataContextEntity: DataContextEntity,
    md: Metadata,
    user: UserInfo,
    convoEntity: ConversationEntity,
    pubSub: PubSubEngine,
    userPayload: UserPayload
  ): Promise<{ AIMessageConversationDetailID: string }> {
    const sTitle = apiResponse.reportTitle;
    const sResult = JSON.stringify(apiResponse);

    // Create a conversation detail record for the Skip response
    const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
    convoDetailEntityAI.NewRecord();
    convoDetailEntityAI.ConversationID = convoEntity.ID;
    convoDetailEntityAI.Message = sResult;
    convoDetailEntityAI.Role = 'AI';
    convoDetailEntityAI.HiddenToUser = false;
    convoDetailEntityAI.Set('Sequence', 2); // using weakly typed here because we're going to get rid of this field soon
    const convoDetailSaveResult: boolean = await convoDetailEntityAI.Save();
    if (!convoDetailSaveResult) {
      LogError(`Error saving conversation detail entity for AI message: ${sResult}`, undefined, convoDetailEntityAI.LatestResult);
    }

    // finally update the convo name if it is still the default
    if (convoEntity.Name === AskSkipResolver._defaultNewChatName && sTitle && sTitle !== AskSkipResolver._defaultNewChatName) {
      convoEntity.Name = sTitle; // use the title from the response
      const convoEntitySaveResult: boolean = await convoEntity.Save();
      if (!convoEntitySaveResult) {
        LogError(`Error saving conversation entity for AI message: ${sResult}`, undefined, convoEntity.LatestResult);
      }
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

    const userNotificationSaveResult: boolean = await userNotification.Save();
    if (!userNotificationSaveResult) {
      LogError(`Error saving user notification entity for AI message: ${sResult}`, undefined, userNotification.LatestResult);
    }

    // Save the data context items...
    // FOR NOW, we don't want to store the data in the database, we will just load it from the data context when we need it
    // we need a better strategy to persist because the cost of storage and retrieval/parsing is higher than just running the query again in many/most cases
    dataContext.SaveItems(user, false);

    // send a UI update trhough pub-sub
    pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
      message: JSON.stringify({
        type: 'UserNotifications',
        status: 'OK',
        conversationID: convoEntity.ID,
        details: {
          action: 'create',
          recordId: userNotification.ID,
        },
      }),
      sessionId: userPayload.sessionId,
    });

    return {
      AIMessageConversationDetailID: convoDetailEntityAI.ID,
    };
  }

  protected async getViewData(ViewId: string, user: UserInfo): Promise<any> {
    const rv = new RunView();
    const result = await rv.RunView({ ViewID: ViewId, IgnoreMaxRows: true }, user);
    if (result && result.Success) return result.Results;
    else throw new Error(`Error running view ${ViewId}`);
  }
}

export default AskSkipResolver;
