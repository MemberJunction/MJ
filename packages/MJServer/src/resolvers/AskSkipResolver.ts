import { Arg, Ctx, Field, Mutation, ObjectType, PubSub, PubSubEngine, Query, Resolver } from 'type-graphql';
import { LogError, LogStatus, Metadata, RunView, UserInfo, CompositeKey, EntityFieldInfo, EntityInfo, EntityRelationshipInfo } from '@memberjunction/core';
import { AppContext, UserPayload, MJ_SERVER_EVENT_CODE } from '../types.js';
import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { DataContext } from '@memberjunction/data-context';
import { LoadDataContextItemsServer } from '@memberjunction/data-context-server';
import { LearningCycleScheduler } from '../scheduler/LearningCycleScheduler.js';
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
  SkipAPIAgentNote,
  SkipAPIAgentNoteType,
  SkipEntityFieldInfo,
  SkipEntityRelationshipInfo,
  SkipEntityFieldValueInfo,
  SkipAPILearningCycleRequest,
  SkipAPILearningCycleResponse,
  SkipLearningCycleNoteChange,
  SkipConversation,
  SkipAPIArtifact,
  SkipAPIAgentRequest,
  SkipAPIArtifactRequest,
  SkipAPIArtifactType,
  SkipAPIArtifactVersion,
} from '@memberjunction/skip-types';

import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

import {
  AIAgentLearningCycleEntity,
  AIAgentNoteEntity,
  AIAgentRequestEntity,
  ArtifactTypeEntity,
  ConversationArtifactEntity,
  ConversationArtifactVersionEntity,
  ConversationDetailEntity,
  ConversationEntity,
  DataContextEntity,
  DataContextItemEntity,
  UserNotificationEntity,
} from '@memberjunction/core-entities';
import { DataSource } from 'typeorm';
import { apiKey, baseUrl, configInfo, graphqlPort, mj_core_schema } from '../config.js';

import { registerEnumType } from 'type-graphql';
import { MJGlobal, CopyScalarsAndArrays } from '@memberjunction/global';
import { sendPostRequest } from '../util.js';
import { GetAIAPIKey } from '@memberjunction/ai';
import { CompositeKeyInputType } from '../generic/KeyInputOutputTypes.js';
import { AIAgentEntityExtended, AIEngine } from '@memberjunction/aiengine';
import { deleteAccessToken, GetDataAccessToken, registerAccessToken, tokenExists } from './GetDataResolver.js';
import e from 'express';
import { Skip } from '@graphql-tools/utils';

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

  @Field(() => String)
  ConversationId: string;

  @Field(() => String)
  UserMessageConversationDetailId: string;

  @Field(() => String)
  AIMessageConversationDetailId: string;
}

@ObjectType()
export class ManualLearningCycleResultType {
  @Field(() => Boolean)
  Success: boolean;

  @Field(() => String)
  Message: string;
}

@ObjectType()
export class CycleDetailsType {
  @Field(() => String)
  LearningCycleId: string;
  
  @Field(() => String)
  StartTime: string;
  
  @Field(() => Number)
  RunningForMinutes: number;
}

@ObjectType()
export class RunningOrganizationType {
  @Field(() => String)
  OrganizationId: string;
  
  @Field(() => String)
  LearningCycleId: string;
  
  @Field(() => String)
  StartTime: string;
  
  @Field(() => Number)
  RunningForMinutes: number;
}

@ObjectType()
export class LearningCycleStatusType {
  @Field(() => Boolean)
  IsSchedulerRunning: boolean;
  
  @Field(() => String, { nullable: true })
  LastRunTime: string;
  
  @Field(() => [RunningOrganizationType], { nullable: true })
  RunningOrganizations: RunningOrganizationType[];
}

@ObjectType()
export class StopLearningCycleResultType {
  @Field(() => Boolean)
  Success: boolean;
  
  @Field(() => String)
  Message: string;
  
  @Field(() => Boolean)
  WasRunning: boolean;
  
  @Field(() => CycleDetailsType, { nullable: true })
  CycleDetails: CycleDetailsType;
}

/**
 * This function initializes the Skip learning cycle scheduler. It sets up an event listener for the server's setup complete event and starts the scheduler if learning cycles are enabled and a valid API endpoint is configured.
 */
function initializeSkipLearningCycleScheduler() {
  try {
    // Set up event listener for server initialization
    const eventListener = MJGlobal.Instance.GetEventListener(true);
    eventListener.subscribe(event => {
      // Filter for our server's setup complete event
      if (event.eventCode === MJ_SERVER_EVENT_CODE && event.args?.type === 'setupComplete') {
        try {
          const skipConfigInfo = configInfo.askSkip;
          if (!skipConfigInfo) {
            LogStatus('Skip AI Learning Cycle Scheduler not started: Skip configuration not found');
            return;
          }
          if (!skipConfigInfo.learningCycleEnabled) {
            LogStatus('Skip AI Learning Cycles not enabled in configuration');
            return;
          }
          
          // Check if we have a valid endpoint when cycles are enabled
          if (!skipConfigInfo.learningCycleURL || skipConfigInfo.learningCycleURL.trim().length === 0) {
            LogError('Skip AI Learning cycle scheduler not started: Learning cycles are enabled but no Learning Cycle API endpoint is configured');
            return;
          }
          
          const dataSources = event.args.dataSources;
          if (dataSources && dataSources.length > 0) {
            // Initialize the scheduler
            const scheduler = LearningCycleScheduler.Instance;
            
            // Set the data sources for the scheduler
            scheduler.setDataSources(dataSources);
            
            // Default is 60 minutes, if the interval is not set in the config, use 60 minutes
            const interval = skipConfigInfo.learningCycleIntervalInMinutes ?? 60;
            //scheduler.start(interval);
            scheduler.runLearningCycle(); // runs a test cycle immediately
          } else {
            LogError('Cannot initialize Skip learning cycle scheduler: No data sources available');
          }
        } catch (error) {
          LogError(`Error initializing Skip learning cycle scheduler: ${error}`);
        }
      }
    });
  } catch (error) {
    // Handle any errors from the static initializer
    LogError(`Failed to initialize Skip learning cycle scheduler: ${error}`);
  }
}
// now call the function to initialize the scheduler
initializeSkipLearningCycleScheduler();

/**
 * Internally used type
 */
type BaseSkipRequest = {
  entities: SkipEntityInfo[],
  queries: SkipQueryInfo[],
  notes: SkipAPIAgentNote[],
  noteTypes: SkipAPIAgentNoteType[],
  requests: SkipAPIAgentRequest[], 
  accessToken: GetDataAccessToken,
  organizationID: string,
  organizationInfo: any,
  apiKeys: SkipAPIRequestAPIKey[],
  callingServerURL: string,
  callingServerAPIKey: string,
  callingServerAccessToken: string
}
@Resolver(AskSkipResultType)
export class AskSkipResolver {
  private static _defaultNewChatName = 'New Chat';
  
  private static _maxHistoricalMessages = 30;

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
    let messages: SkipMessage[] = [];
    if (ConversationId && ConversationId.length > 0) {
      messages = await this.LoadConversationDetailsIntoSkipMessages(
        dataSource,
        ConversationId,
        AskSkipResolver._maxHistoricalMessages
      );  
    }

    const md = new Metadata();
    const { convoEntity, dataContextEntity, convoDetailEntity, dataContext } = await this.HandleSkipChatInitialObjectLoading(
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

    const input = await this.buildSkipChatAPIRequest(messages, ConversationId, dataContext, 'chat_with_a_record', false, false, false, false, user, dataSource, false, false);
    messages.push({
      content: UserQuestion,
      role: 'user',
      conversationDetailID: convoDetailEntity.ID,
    });

    return this.handleSimpleSkipChatPostRequest(input, convoEntity.ID, convoDetailEntity.ID, true, user);
  }

  @Mutation(() => AskSkipResultType)
  async ExecuteAskSkipLearningCycle(
    @Ctx() { dataSource, userPayload }: AppContext,
    @Arg('ForceEntityRefresh', () => Boolean, { nullable: true }) ForceEntityRefresh?: boolean
  ) {
      const skipConfigInfo = configInfo.askSkip;
      // First check if learning cycles are enabled in configuration
      if (!skipConfigInfo.learningCycleEnabled) {
        return {
          success: false,
          error: 'Learning cycles are not enabled in configuration',
          elapsedTime: 0,
          noteChanges: [],
          queryChanges: [],
          requestChanges: []
        };
      }
      
      // Check if we have a valid endpoint when cycles are enabled
      if (!skipConfigInfo.learningCycleURL || skipConfigInfo.learningCycleURL.trim().length === 0) {
        return {
          success: false,
          error: 'Learning cycle API endpoint is not configured',
          elapsedTime: 0,
          noteChanges: [],
          queryChanges: [],
          requestChanges: []
        };
      }
      
      const startTime = new Date();
      // First, get the user from the cache
      const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase());
      if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);

      // if already configured this does nothing, just makes sure we're configured
      await AIEngine.Instance.Config(false, user); 

      // Check if this organization is already running a learning cycle using their organization ID
      const organizationId = skipConfigInfo.orgID;
      const scheduler = LearningCycleScheduler.Instance;
      const runningStatus = scheduler.isOrganizationRunningCycle(organizationId);
      
      if (runningStatus.isRunning) {
        LogStatus(`Learning cycle already in progress for organization ${organizationId}, started at ${runningStatus.startTime.toISOString()}`);
        return {
          success: false,
          error: `Learning cycle already in progress for this organization (started ${Math.round(runningStatus.runningForMinutes)} minutes ago)`,
          elapsedTime: 0,
          noteChanges: [],
          queryChanges: [],
          requestChanges: []
        };
      }

      // Get the Skip agent ID
      const md = new Metadata();
      const skipAgent = AIEngine.Instance.GetAgentByName('Skip');
      if (!skipAgent) {
        throw new Error("Skip agent not found in AIEngine");
      }

      const agentID = skipAgent.ID;

      // Get last complete learning cycle start date for this agent
      const lastCompleteLearningCycleDate = await this.GetLastCompleteLearningCycleDate(agentID, user);

      // Create a new learning cycle record for this run
      const learningCycleEntity = await md.GetEntityObject<AIAgentLearningCycleEntity>('AI Agent Learning Cycles', user);
      learningCycleEntity.NewRecord();
      learningCycleEntity.AgentID = skipAgent.ID;
      learningCycleEntity.Status = 'In-Progress';
      learningCycleEntity.StartedAt = startTime;

      if (!(await learningCycleEntity.Save())) {
        throw new Error(`Failed to create learning cycle record: ${learningCycleEntity.LatestResult.Error}`);
      }

      const learningCycleId = learningCycleEntity.ID;
      LogStatus(`Created new learning cycle with ID: ${learningCycleId}`);

      // Register this organization as running a learning cycle
      scheduler.registerRunningCycle(organizationId, learningCycleId);
      
      try {
        // Build the request to Skip learning API
        LogStatus(`Building Skip Learning API request`);
        const input = await this.buildSkipLearningAPIRequest(learningCycleId, lastCompleteLearningCycleDate, true, true, true, false, dataSource, user, ForceEntityRefresh || false);

        // Make the API request
        const response = await this.handleSimpleSkipLearningPostRequest(input, user, learningCycleId, agentID);

        // Update learning cycle to completed
        const endTime = new Date();
        const elapsedTimeMs = endTime.getTime() - startTime.getTime();

        LogStatus(`Learning cycle finished with status: ${response.success ? 'Success' : 'Failed'} in ${elapsedTimeMs / 1000} seconds`);

        learningCycleEntity.Status = response.success ? 'Complete' : 'Failed';
        learningCycleEntity.EndedAt = endTime;

        if (!(await learningCycleEntity.Save())) {
          LogError(`Failed to update learning cycle record: ${learningCycleEntity.LatestResult.Error}`);
        }
        
        // Unregister the organization after completion
        scheduler.unregisterRunningCycle(organizationId);
        
        return response;
      } catch (error) {
        // Make sure to update the learning cycle record as failed
        learningCycleEntity.Status = 'Failed';
        learningCycleEntity.EndedAt = new Date();
        
        try {
          await learningCycleEntity.Save();
        } catch (saveError) {
          LogError(`Failed to update learning cycle record after error: ${saveError}`);
        }
        
        // Unregister the organization on error
        scheduler.unregisterRunningCycle(organizationId);
        
        // Re-throw the original error
        throw error;
      }
  }

  protected async handleSimpleSkipLearningPostRequest(
    input: SkipAPILearningCycleRequest, 
    user: UserInfo, 
    learningCycleId: string,
    agentID: string
  ): Promise<SkipAPILearningCycleResponse> {
    const skipConfigInfo = configInfo.askSkip;
    LogStatus(`   >>> HandleSimpleSkipLearningPostRequest Sending request to Skip API: ${skipConfigInfo.learningCycleURL}`);

    const response = await sendPostRequest(skipConfigInfo.learningCycleURL, input, true, null);

    if (response && response.length > 0) {
      // the last object in the response array is the final response from the Skip API
      const apiResponse = <SkipAPILearningCycleResponse>response[response.length - 1].value;
      LogStatus(`  Skip API response: ${apiResponse.success}`);

      // Process any note changes, if any
      if (apiResponse.noteChanges && apiResponse.noteChanges.length > 0) {
        await this.processLearningCycleNoteChanges(apiResponse.noteChanges, agentID, user);
      }

      // Not yet implemented

      // // Process any query changes, if any
      // if (apiResponse.queryChanges && apiResponse.queryChanges.length > 0) {
      //   await this.processLearningCycleQueryChanges(apiResponse.queryChanges, user);
      // }

      // // Process any request changes, if any
      // if (apiResponse.requestChanges && apiResponse.requestChanges.length > 0) {
      //   await this.processLearningCycleRequestChanges(apiResponse.requestChanges, user);
      // }
      
      return apiResponse;
    } else {
      return {
        success: false,
        error: 'Error',
        elapsedTime: 0,
        noteChanges: [],
        queryChanges: [],
        requestChanges: [],
      };

    }
  }

  protected async handleSimpleSkipChatPostRequest(
    input: SkipAPIRequest,
    conversationID: string = '',
    UserMessageConversationDetailId: string = '',
    createAIMessageConversationDetail: boolean = false,
    user: UserInfo = null
  ): Promise<AskSkipResultType> {
    const skipConfigInfo = configInfo.askSkip;
    LogStatus(`   >>> HandleSimpleSkipChatPostRequest Sending request to Skip API: ${skipConfigInfo.chatURL}`);

    const response = await sendPostRequest(skipConfigInfo.chatURL, input, true, null);

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

  /**
   * Processes note changes received from the Skip API learning cycle. 
   * @param noteChanges Changes to agent notes
   * @param user The user making the request
   */
  protected async processLearningCycleNoteChanges(
    noteChanges: SkipLearningCycleNoteChange[], 
    agentID: string,
    user: UserInfo
    ): Promise<void> {
      const md = new Metadata();

      // Filter out any operations on "Human" notes
      const validNoteChanges = noteChanges.filter(change => {
        // Check if the note is of type "Human"
        if (change.note.agentNoteType === "Human") {
          LogStatus(`WARNING: Ignoring ${change.changeType} operation on Human note with ID ${change.note.id}. Human notes cannot be modified by the
    learning cycle.`);
          return false;
        }
        return true;
      });
      
      // Process all valid note changes in parallel
      await Promise.all(validNoteChanges.map(async (change) => {
        try {
          if (change.changeType === 'add' || change.changeType === 'update') {
            await this.processAddOrUpdateSkipNote(change, agentID, user);
          } else if (change.changeType === 'delete') {
            await this.processDeleteSkipNote(change, user);
          }
        } catch (e) {
          LogError(`Error processing note change: ${e}`);
        }
      }));
  }

  protected async processAddOrUpdateSkipNote(change: SkipLearningCycleNoteChange, agentID: string, user: UserInfo): Promise<boolean> {
    try {  
      // Get the note entity object
      const md = new Metadata();
      const noteEntity = await md.GetEntityObject<AIAgentNoteEntity>('AI Agent Notes', user);
      
      if (change.changeType === 'update') {
        // Load existing note
        const loadResult = await noteEntity.Load(change.note.id);
        if (!loadResult) {
          LogError(`Could not load note with ID ${change.note.id}`);
          return false;
        }
      } else {
        // Create a new note
        noteEntity.NewRecord();
        noteEntity.AgentID = agentID;
      }
      noteEntity.AgentNoteTypeID = this.getAgentNoteTypeIDByName('AI'); // always set to AI
      noteEntity.Note = change.note.note;
      noteEntity.Type = change.note.type;

      if (change.note.type === 'User') {
        noteEntity.UserID = change.note.userId;
      }

      // Save the note
      if (!(await noteEntity.Save())) {
        LogError(`Error saving AI Agent Note: ${noteEntity.LatestResult.Error}`);
        return false;
      }

      return true;
    } catch (e) {
      LogError(`Error processing note change: ${e}`);
      return false;
    }
  }

  protected async processDeleteSkipNote(change: SkipLearningCycleNoteChange, user: UserInfo): Promise<boolean> {
    // Get the note entity object
    const md = new Metadata();
    const noteEntity = await md.GetEntityObject<AIAgentNoteEntity>('AI Agent Notes', user);

    // Load the note first
    const loadResult = await noteEntity.Load(change.note.id);

    if (!loadResult) {
      LogError(`Could not load note with ID ${change.note.id} for deletion`);
      return false;
    }

    // Double-check if the loaded note is of type "Human"
    if (change.note.agentNoteType === "Human") {
      LogStatus(`WARNING: Ignoring delete operation on Human note with ID ${change.note.id}. Human notes cannot be deleted by the learning
cycle.`);
      return false;
    }

    // Proceed with deletion
    if (!(await noteEntity.Delete())) {
      LogError(`Error deleting AI Agent Note: ${noteEntity.LatestResult.Error}`);
      return false;
    }

    return true;
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

  /**
   * Builds the base Skip API request with common fields and data
   * @param contextUser The user making the request
   * @param dataSource The data source to use
   * @param includeEntities Whether to include entities in the request
   * @param includeQueries Whether to include queries in the request
   * @param includeNotes Whether to include agent notes in the request
   * @param forceEntitiesRefresh Whether to force refresh of entities
   * @param includeCallBackKeyAndAccessToken Whether to include a callback key and access token
   * @param additionalTokenInfo Additional info to include in the access token
   * @returns Base request data that can be used by specific request builders
   */
  protected async buildBaseSkipRequest(
    contextUser: UserInfo,
    dataSource: DataSource,
    includeEntities: boolean,
    includeQueries: boolean,
    includeNotes: boolean,
    includeRequests: boolean,
    forceEntitiesRefresh: boolean = false,
    includeCallBackKeyAndAccessToken: boolean = false,
    additionalTokenInfo: any = {}
  ): Promise<BaseSkipRequest> {
    const skipConfigInfo = configInfo.askSkip;
    const entities = includeEntities ? await this.BuildSkipEntities(dataSource, forceEntitiesRefresh) : [];
    const queries = includeQueries ? this.BuildSkipQueries() : [];
    const {notes, noteTypes} = includeNotes ? await this.BuildSkipAgentNotes(contextUser) : {notes: [], noteTypes: []};
    const requests = includeRequests ? await this.BuildSkipRequests(contextUser) : [];
    
    // Setup access token if needed
    let accessToken: GetDataAccessToken;
    if (includeCallBackKeyAndAccessToken) {
      const tokenInfo = {
        type: 'skip_api_request',
        userEmail: contextUser.Email,
        userName: contextUser.Name,
        userID: contextUser.ID,
        ...additionalTokenInfo
      };
      
      accessToken = registerAccessToken(
        undefined,
        1000 * 60 * 10 /*10 minutes*/, 
        tokenInfo
      );
    }
    
    return {
      entities,
      queries,
      notes,
      noteTypes,
      requests, 
      accessToken,
      organizationID: skipConfigInfo.orgID,
      organizationInfo: configInfo?.askSkip?.organizationInfo,
      apiKeys: this.buildSkipAPIKeys(),
      callingServerURL: accessToken ? `${baseUrl}:${graphqlPort}` : undefined,
      callingServerAPIKey: accessToken ? apiKey : undefined,
      callingServerAccessToken: accessToken ? accessToken.Token : undefined
    };
  }

  /**
   * Builds the learning API request for Skip
   */
  protected async buildSkipLearningAPIRequest(
    learningCycleId: string,
    lastLearningCycleDate: Date,
    includeEntities: boolean,
    includeQueries: boolean,
    includeNotes: boolean,
    includeRequests: boolean,
    dataSource: DataSource,
    contextUser: UserInfo,
    forceEntitiesRefresh: boolean = false,
    includeCallBackKeyAndAccessToken: boolean = false
  ) {
    // Build base Skip request data
    const baseRequest = await this.buildBaseSkipRequest(
      contextUser,
      dataSource,
      includeEntities,
      includeQueries,
      includeNotes,
      includeRequests,
      forceEntitiesRefresh,
      includeCallBackKeyAndAccessToken
    );
    
    // Get data specific to learning cycle
    const newConversations = await this.BuildSkipLearningCycleNewConversations(lastLearningCycleDate, dataSource, contextUser);

    // Create the learning-specific request object
    const input: SkipAPILearningCycleRequest = {
      organizationId: baseRequest.organizationID,
      organizationInfo: baseRequest.organizationInfo,
      learningCycleId,
      lastLearningCycleDate,
      newConversations,
      entities: baseRequest.entities,
      queries: baseRequest.queries,
      notes: baseRequest.notes,
      noteTypes: baseRequest.noteTypes,
      requests: baseRequest.requests,
      apiKeys: baseRequest.apiKeys
    };

    return input;
  }

  /**
   * Loads the conversations that have have an updated or new conversation detail since the last learning cycle
   * @param dataSource the data source to use
   * @param lastLearningCycleDate the date of the last learning cycle
   * @param contextUser the user context
   */ 
  protected async BuildSkipLearningCycleNewConversations(
    lastLearningCycleDate: Date,
    dataSource: DataSource,
    contextUser: UserInfo
  ): Promise<SkipConversation[]> {
    try {
      const rv = new RunView();

      // Get all conversations with a conversation detail that has been updated (modified or added) since the last learning cycle
      const conversationsSinceLastLearningCycle = await rv.RunView<ConversationEntity>({
        EntityName: 'Conversations',
        ExtraFilter: `ID IN (SELECT ConversationID FROM __mj.vwConversationDetails WHERE __mj_UpdatedAt >= '${lastLearningCycleDate.toISOString()}')`,
        ResultType: 'entity_object',
      }, contextUser);

      if (!conversationsSinceLastLearningCycle.Success || conversationsSinceLastLearningCycle.Results.length === 0) {
        return [];
      }

      // Now we map the conversations to SkipConversations and return 
      return await Promise.all(conversationsSinceLastLearningCycle.Results.map(async (c) => {
        return {
          id: c.ID,
          name: c.Name,
          userId: c.UserID,
          user: c.User,
          description: c.Description,
          messages: await this.LoadConversationDetailsIntoSkipMessages(dataSource, c.ID),
          createdAt: c.__mj_CreatedAt,
          updatedAt: c.__mj_UpdatedAt
        };
      }));
    }
    catch (e) {
      LogError(`Error loading conversations since last learning cycle: ${e}`);
      return [];
    }
  }

  /**
   * Builds an array of agent requests 
   * @param contextUser the user context to load the requests
   * @returns Array of SkipAPIAgentRequest objects
   */
  protected async BuildSkipRequests(
    contextUser: UserInfo
  ): Promise<SkipAPIAgentRequest[]> {
    try {
      const md = new Metadata();
      const requestEntity = await md.GetEntityObject<AIAgentRequestEntity>('AI Agent Requests', contextUser);
      const allRequests = await requestEntity.GetAll();

      const requests = allRequests.map((r) => {
        return {
          id: r.ID,
          agentId: r.AIAgentID,
          agnet: r.AIAgent,
          requestedAt: r.RequestedAt,
          requestForUserId: r.RequestedForUserID,
          requestForUser: r.RequestedForUser,
          status: r.Status,
          request: r.Request,
          response: r.Response,
          responseByUserId: r.ResponseByUserID,
          responseByUser: r.ResponseByUser,
          respondedAt: r.RespondedAt,
          comments: r.Comments, 
          createdAt: r.__mj_CreatedAt,
          updatedAt: r.__mj_UpdatedAt,
        };
      });
      return requests;

    } catch (e) {
      LogError(`Error loading requests: ${e}`);
      return [];
    }
  }

  protected async GetLastCompleteLearningCycleDate(agentID: string, user: UserInfo): Promise<Date> {
    const md = new Metadata();
    const rv = new RunView();

    const lastLearningCycleRV = await rv.RunView<AIAgentLearningCycleEntity>({
      EntityName: 'AI Agent Learning Cycles',
      ExtraFilter: `AgentID = '${agentID}' AND Status = 'Complete'`,
      ResultType: 'entity_object',
      OrderBy: 'StartedAt DESC',
      MaxRows: 1,
    }, user);

    const lastLearningCycle = lastLearningCycleRV.Results[0];

    if (lastLearningCycle) {
      return lastLearningCycle.StartedAt;
    }
    else {
      // if no lerarning cycle found, return the epoch date
      return new Date(0);
    }
  }

  /**
   * Builds the chat API request for Skip
   */
  protected async buildSkipChatAPIRequest(
    messages: SkipMessage[],
    conversationId: string,
    dataContext: DataContext,
    requestPhase: SkipRequestPhase,
    includeEntities: boolean,
    includeQueries: boolean,
    includeNotes: boolean,
    includeRequests: boolean,
    contextUser: UserInfo,
    dataSource: DataSource,
    forceEntitiesRefresh: boolean = false,
    includeCallBackKeyAndAccessToken: boolean = false
  ): Promise<SkipAPIRequest> {
    // Additional token info specific to chat requests
    const additionalTokenInfo = {
      conversationId,
      requestPhase,
    };
    
    // Get base request data
    const baseRequest = await this.buildBaseSkipRequest(
      contextUser,
      dataSource,
      includeEntities,
      includeQueries,
      includeNotes,
      includeRequests,
      forceEntitiesRefresh,
      includeCallBackKeyAndAccessToken,
      additionalTokenInfo
    );

    const artifacts: SkipAPIArtifact[] = await this.buildSkipAPIArtifacts(contextUser, dataSource, conversationId);

    // Create the chat-specific request object
    const input: SkipAPIRequest = {
      ...baseRequest,
      messages,
      conversationID: conversationId.toString(),
      dataContext: <DataContext>CopyScalarsAndArrays(dataContext), // we are casting this to DataContext as we're pushing this to the Skip API, and we don't want to send the real DataContext object, just a copy of the scalar and array properties
      requestPhase,
      artifacts: artifacts
    };
    
    return input;
  }

  /**
   * Builds up an array of SkipAPIArtifact types to send across information about the artifacts associated with this particular
   * conversation.
   * @param contextUser 
   * @param dataSource 
   * @param conversationId 
   * @returns 
   */
  protected async buildSkipAPIArtifacts(contextUser: UserInfo, dataSource: DataSource, conversationId: string): Promise<SkipAPIArtifact[]> {
    const md = new Metadata();
    const ei = md.EntityByName('MJ: Conversation Artifacts');
    const rv = new RunView();
    const results = await rv.RunViews([
      {
        EntityName: "MJ: Conversation Artifacts",
        ExtraFilter: `ConversationID='${conversationId}'`, // get artifacts linked to this convo
        OrderBy: "__mj_CreatedAt"
      },
      {
        EntityName: "MJ: Artifact Types", // get all artifact types
        OrderBy: "Name"
      },
      {
        EntityName: "MJ: Conversation Artifact Versions",
        ExtraFilter: `ConversationArtifactID IN (SELECT ID FROM [${ei.SchemaName}].[${ei.BaseView}] WHERE ConversationID='${conversationId}')`,
        OrderBy: 'ConversationArtifactID, __mj_CreatedAt'
      }
    ], contextUser);
    if (results && results.length > 0 && results.every((r) => r.Success)) {
      const types: SkipAPIArtifactType[] = results[1].Results.map((a: ArtifactTypeEntity) => {
        const retVal: SkipAPIArtifactType = {
          id: a.ID,
          name: a.Name,
          description: a.Description,
          contentType: a.ContentType,
          enabled: a.IsEnabled,
          createdAt: a.__mj_CreatedAt,
          updatedAt: a.__mj_UpdatedAt
        }
        return retVal;
      });
      const allConvoArtifacts = results[0].Results.map((a: ConversationArtifactEntity) => {
        const rawVersions: ConversationArtifactVersionEntity[] = results[2].Results as ConversationArtifactVersionEntity[];
        const thisArtifactsVersions = rawVersions.filter(rv => rv.ConversationArtifactID === a.ID);
        const versionsForThisArtifact: SkipAPIArtifactVersion[] = thisArtifactsVersions.map((v: ConversationArtifactVersionEntity) => {
          const versionRetVal: SkipAPIArtifactVersion = {
            id: v.ID,
            artifactId: v.ConversationArtifactID,
            version: v.Version,
            configuration: v.Configuration,
            content: v.Content,
            comments: v.Comments,
            createdAt: v.__mj_CreatedAt,
            updatedAt: v.__mj_UpdatedAt
          };
          return versionRetVal;
        });
        const artifactRetVal: SkipAPIArtifact = {
          id: a.ID,
          name: a.Name,
          description: a.Description,
          comments: a.Comments,
          sharingScope: a.SharingScope as 'None' |'SpecificUsers' |'Everyone' |'Public',
          versions: versionsForThisArtifact,
          conversationId: a.ConversationID,
          artifactType: types.find((t => t.id === a.ArtifactTypeID)),
          createdAt: a.__mj_CreatedAt,
          updatedAt: a.__mj_UpdatedAt
        };
        return artifactRetVal;
      });

      return allConvoArtifacts;
    }
    else {
      return [];
    }
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
    const input = <SkipAPIRunScriptRequest>await this.buildSkipChatAPIRequest([], '', dataContext, 'run_existing_script', false, false, false, false, user, dataSource, false, false);
    input.scriptText = ScriptText;
    return this.handleSimpleSkipChatPostRequest(input);
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
    @Arg('DataContextId', () => String, { nullable: true }) DataContextId?: string,
    @Arg('ForceEntityRefresh', () => Boolean, { nullable: true }) ForceEntityRefresh?: boolean
  ) {
    const md = new Metadata();
    const user = UserCache.Instance.Users.find((u) => u.Email.trim().toLowerCase() === userPayload.email.trim().toLowerCase());
    if (!user) throw new Error(`User ${userPayload.email} not found in UserCache`);

    const { convoEntity, dataContextEntity, convoDetailEntity, dataContext } = await this.HandleSkipChatInitialObjectLoading(
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

    const conversationDetailCount = 1
    const input = await this.buildSkipChatAPIRequest(messages, ConversationId, dataContext, 'initial_request', true, true, true, false, user, dataSource, ForceEntityRefresh === undefined ? false : ForceEntityRefresh, true);

    return this.HandleSkipChatRequest(
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
      dataContextEntity,
      conversationDetailCount,
    );
  }

  /**
   * Packages up the Approved queries from the metadata
   * @returns 
   */
  protected BuildSkipQueries(status: "Pending" | "In-Review" | "Approved" | "Rejected" | "Obsolete" = 'Approved'): SkipQueryInfo[] {
    const md = new Metadata();
    const approvedQueries = md.Queries.filter((q) => q.Status === status);
    return approvedQueries.map((q) => {
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

  /**
   * Builds up the array of notes that are applicable for Skip to receive from MJAPI
   */
  protected async BuildSkipAgentNotes(contextUser: UserInfo): Promise<{notes: SkipAPIAgentNote[], noteTypes: SkipAPIAgentNoteType[]}> {
    try {
      // if already configured this does nothing, just makes sure we're configured
      await AIEngine.Instance.Config(false, contextUser); 

      const agent: AIAgentEntityExtended = AIEngine.Instance.GetAgentByName('Skip');
      if (agent) {
        let notes: SkipAPIAgentNote[] = [];
        let noteTypes: SkipAPIAgentNoteType[] = [];
        
        notes = agent.Notes.map((r) => {
          return {
            id: r.ID,
            agentNoteTypeId: r.AgentNoteTypeID,
            agentNoteType: r.AgentNoteType, 
            note: r.Note,
            type: r.Type,
            userId: r.UserID,
            user: r.User,
            createdAt: r.__mj_CreatedAt,
            updatedAt: r.__mj_UpdatedAt,
          }
        });

        noteTypes = AIEngine.Instance.AgentNoteTypes.map((r) => {
          return {
            id: r.ID,
            name: r.Name,
            description: r.Description
          }
        });

        // now return the notes and note types
        return {notes, noteTypes};
      }
      else {
        console.warn(`No AI Agent found with the name 'Skip' in the AI Engine, so no notes will be sent to Skip`);
        return {notes: [], noteTypes: []}; // no agent found, so nothing to do
      }
    }
    catch (e) {
      LogError(`AskSkipResolver::BuildSkipAgentNotes: ${e}`);
      return {notes: [], noteTypes: []}; // non- fatal error just return empty arrays
    }
  }

  protected async PackEntityRows(e: EntityInfo, dataSource: DataSource): Promise<any[]> {
    try {
      if (e.RowsToPackWithSchema === 'None')
        return [];

      // only include columns that have a scopes including either All and/or AI or have Null for ScopeDefault
      const fields = e.Fields.filter((f) => {
        const scopes = f.ScopeDefault?.split(',').map((s) => s.trim().toLowerCase());
        return !scopes || scopes.length === 0 || scopes.includes('all') || scopes.includes('ai');
      }).map(f => `[${f.Name}]`).join(',');

      // now run the query based on the row packing method
      let sql: string = '';
      switch (e.RowsToPackWithSchema) {
        case 'All':
          sql = `SELECT ${fields} FROM ${e.SchemaName}.${e.BaseView}`;
          break;
        case 'Sample':
          switch (e.RowsToPackSampleMethod) {
            case 'random':
              sql = `SELECT TOP ${e.RowsToPackSampleCount} ${fields} FROM [${e.SchemaName}].[${e.BaseView}] ORDER BY newid()`; // SQL Server newid() function returns a new uniqueidentifier value for each row and when sorted it will be random
              break;
            case 'top n':
              const orderBy = e.RowsToPackSampleOrder ? ` ORDER BY [${e.RowsToPackSampleOrder}]` : '';
              sql = `SELECT TOP ${e.RowsToPackSampleCount} ${fields} FROM [${e.SchemaName}].[${e.BaseView}]${orderBy}`;
              break;
            case 'bottom n':
              const firstPrimaryKey = e.FirstPrimaryKey.Name;
              const innerOrderBy = e.RowsToPackSampleOrder ? `[${e.RowsToPackSampleOrder}]` : `[${firstPrimaryKey}] DESC`;
              sql = `SELECT * FROM (
                        SELECT TOP ${e.RowsToPackSampleCount} ${fields} 
                        FROM [${e.SchemaName}].[${e.BaseView}]
                        ORDER BY ${innerOrderBy}
                    ) sub
                    ORDER BY [${firstPrimaryKey}] ASC;`;
              break;
          }
      }
      const result = await dataSource.query(sql);
      if (!result) {
        return [];
      }
      else {
        return result;
      }
    }
    catch (e) {
      LogError(`AskSkipResolver::PackEntityRows: ${e}`);
      return [];
    }
  }

  protected async PackFieldPossibleValues(f: EntityFieldInfo, dataSource: DataSource): Promise<SkipEntityFieldValueInfo[]> {
    try {
      if (f.ValuesToPackWithSchema === 'None') {
        return []; // don't pack anything
      }
      else if (f.ValuesToPackWithSchema === 'All') {
        // wants ALL of the distinct values
        return await this.GetFieldDistinctValues(f, dataSource);
      }
      else if (f.ValuesToPackWithSchema === 'Auto') {
        // default setting - pack based on the ValueListType
        if (f.ValueListTypeEnum === 'List') {
          // simple list of values in the Entity Field Values table
          return f.EntityFieldValues.map((v) => {
            return {value: v.Value, displayValue: v.Value};
          });
        }
        else if (f.ValueListTypeEnum === 'ListOrUserEntry') {
          // could be a user provided value, OR the values in the list of possible values. 
          // get the distinct list of values from the DB and concat that with the f.EntityFieldValues array - deduped and return
          const values = await this.GetFieldDistinctValues(f, dataSource);
          if (!values || values.length === 0) {
            // no result, just return the EntityFieldValues
            return f.EntityFieldValues.map((v) => {
              return {value: v.Value, displayValue: v.Value};
            });
          }
          else {
            return [...new Set([...f.EntityFieldValues.map((v) => {
              return {value: v.Value, displayValue: v.Value};
            }), ...values])];
          }
        }
      }
      return []; // if we get here, nothing to pack
    }
    catch (e) {
      LogError(`AskSkipResolver::PackFieldPossibleValues: ${e}`);
      return [];
    }
  }

  protected async GetFieldDistinctValues(f: EntityFieldInfo, dataSource: DataSource): Promise<SkipEntityFieldValueInfo[]> {
    try {
      const sql = `SELECT DISTINCT ${f.Name} FROM ${f.SchemaName}.${f.BaseView}`;
      const result = await dataSource.query(sql);
      if (!result) {
        return [];
      }
      else {
        return result.map((r) => {
          return {
            value: r[f.Name], 
            displayValue: r[f.Name]
          };  
        });
      }
    }
    catch (e) {
      LogError(`AskSkipResolver::GetFieldDistinctValues: ${e}`);
      return [];      
    }
  }


  // SKIP ENTITIES CACHING
  // Static variables shared across all instances
  private static __skipEntitiesCache$: BehaviorSubject<Promise<SkipEntityInfo[]> | null> = new BehaviorSubject<Promise<SkipEntityInfo[]> | null>(null);
  private static __lastRefreshTime: number = 0;

  private async refreshSkipEntities(dataSource: DataSource): Promise<SkipEntityInfo[]> {
    try {
      const md = new Metadata();
      const skipSpecialIncludeEntities = (configInfo.askSkip?.entitiesToSend?.includeEntitiesFromExcludedSchemas ?? [])
        .map((e) => e.trim().toLowerCase());
  
      // get the list of entities
      const entities = md.Entities.filter((e) => {
        if (e.SchemaName !== mj_core_schema || skipSpecialIncludeEntities.includes(e.Name.trim().toLowerCase())) {
          const sd = e.ScopeDefault?.trim();
          if (sd && sd.length > 0) {
            const scopes = sd.split(',').map((s) => s.trim().toLowerCase()) ?? ['all'];
            return !scopes || scopes.length === 0 || scopes.includes('all') || scopes.includes('ai') || skipSpecialIncludeEntities.includes(e.Name.trim().toLowerCase());
          }
          else {
            return true; // no scope, so include it
          }
        }
        return false;
      });
  
      // now we have our list of entities, pack em up
      const result = await Promise.all(entities.map((e) => this.PackSingleSkipEntityInfo(e, dataSource)));
  
      AskSkipResolver.__lastRefreshTime = Date.now(); // Update last refresh time
      return result;        
    }
    catch (e) {
      LogError(`AskSkipResolver::refreshSkipEntities: ${e}`);
      return [];
    }
  }

  public async BuildSkipEntities(dataSource: DataSource, forceRefresh: boolean = false, refreshIntervalMinutes: number = 15): Promise<SkipEntityInfo[]> {
    try {
      const now = Date.now();
      const cacheExpired = (now - AskSkipResolver.__lastRefreshTime) > (refreshIntervalMinutes * 60 * 1000);
  
      // If force refresh is requested OR cache expired OR cache is empty, refresh
      if (forceRefresh || cacheExpired || AskSkipResolver.__skipEntitiesCache$.value === null) {
        console.log(`Forcing Skip Entities refresh: ${forceRefresh}, Cache Expired: ${cacheExpired}`);
        const newData = this.refreshSkipEntities(dataSource);
        AskSkipResolver.__skipEntitiesCache$.next(newData);
      }
  
      return AskSkipResolver.__skipEntitiesCache$.pipe(take(1)).toPromise();  
    }
    catch (e) {
      LogError(`AskSkipResolver::BuildSkipEntities: ${e}`);
      return [];
    }
  }

  protected async PackSingleSkipEntityInfo(e: EntityInfo, dataSource: DataSource): Promise<SkipEntityInfo> {
    try {
      const ret: SkipEntityInfo = {
        id: e.ID,
        name: e.Name,
        schemaName: e.SchemaName,
        baseView: e.BaseView,
        description: e.Description,
  
        fields: await Promise.all(e.Fields.filter(f => {
          // we want to check the scopes for the field level and make sure it is either All or AI or has both
          const scopes = f.ScopeDefault?.split(',').map((s) => s.trim().toLowerCase());
          return !scopes || scopes.length === 0 || scopes.includes('all') || scopes.includes('ai');
        }).map(f => {
          return this.PackSingleSkipEntityField(f, dataSource);
        })),
  
        relatedEntities: e.RelatedEntities.map((r) => {
          return this.PackSingleSkipEntityRelationship(r);
        }),
  
        rowsPacked: e.RowsToPackWithSchema,
        rowsSampleMethod: e.RowsToPackSampleMethod,
        rows: await this.PackEntityRows(e, dataSource)
      };
      return ret;
    }
    catch (e) {
      LogError(`AskSkipResolver::PackSingleSkipEntityInfo: ${e}`);
      return null;
    }
  }

  protected PackSingleSkipEntityRelationship(r: EntityRelationshipInfo): SkipEntityRelationshipInfo {
    try {
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
    }
    catch (e) {
      LogError(`AskSkipResolver::PackSingleSkipEntityRelationship: ${e}`);
      return null;
    }
  }

  protected async PackSingleSkipEntityField(f: EntityFieldInfo, dataSource: DataSource): Promise<SkipEntityFieldInfo> {
    try {
      return {
        //id: f.ID,
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
        possibleValues: await this.PackFieldPossibleValues(f, dataSource),
      };
    }
    catch (e) {
      LogError(`AskSkipResolver::PackSingleSkipEntityField: ${e}`);
      return null;
    }
  }

  protected async HandleSkipChatInitialObjectLoading(
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
          dataContextEntity.Name = 'Data Context for Skip Conversation ';
          if (!(await dataContextEntity.Save())) {
            LogError(`Creating a new data context failed`, undefined, dataContextEntity.LatestResult);
            throw new Error(`Creating a new data context failed`);
          }
        } 
        else {
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
        } 
        else {
          LogError(`Creating a new conversation failed`, undefined, convoEntity.LatestResult);
          throw new Error(`Creating a new conversation failed`);
        }
      } 
      else {
        throw new Error(`User ${userPayload.email} not found in UserCache`);
      }
    } 
    else {
      await convoEntity.Load(ConversationId); // load the existing conversation, will need it later
      dataContextEntity = await md.GetEntityObject<DataContextEntity>('Data Contexts', user);

      // check to see if the DataContextId is passed in and if it is different than the DataContextID in the conversation
      if (DataContextId && DataContextId.length > 0 && DataContextId !== convoEntity.DataContextID) {
        if (convoEntity.DataContextID === null) {
          // use the DataContextId passed in if the conversation doesn't have a DataContextID
          convoEntity.DataContextID = DataContextId;
          const convoEntitySaveResult: boolean = await convoEntity.Save();
          if (!convoEntitySaveResult) {
            LogError(`Error saving conversation entity for conversation: ${ConversationId}`, undefined, convoEntity.LatestResult);
          }
        } 
        else {
          // note - we ignore the parameter DataContextId if it is passed in, we will use the data context from the conversation that is saved. 
          // If a user wants to change the data context for a convo, they can do that elsewhere
          console.warn(
            `AskSkipResolver: DataContextId ${DataContextId} was passed in but it was ignored because it was different than the DataContextID in the conversation ${convoEntity.DataContextID}`
          );
        }
        // only load if we have a data context here, otherwise we have a new record in the dataContext entity
        if (convoEntity.DataContextID)
          await dataContextEntity.Load(convoEntity.DataContextID);
      }
      else if ((!DataContextId || DataContextId.length === 0) && (!convoEntity.DataContextID || convoEntity.DataContextID.length === 0)) {
        // in this branch of the logic we don't have a passed in DataContextId and we don't have a DataContextID in the conversation, so we need to save the data context, get the ID,
        // update the conversation and save it as well
        dataContextEntity.NewRecord();
        dataContextEntity.UserID = user.ID;
        dataContextEntity.Name = 'Data Context for Skip Conversation ' + ConversationId;
        if (await dataContextEntity.Save()) {
          DataContextId = convoEntity.DataContextID;
          convoEntity.DataContextID = dataContextEntity.ID;
          if (!await convoEntity.Save()) {
            LogError(`Error saving conversation entity for conversation: ${ConversationId}`, undefined, convoEntity.LatestResult);
          }
        } 
        else
          LogError(`Error saving DataContextEntity for conversation: ${ConversationId}`, undefined, dataContextEntity.LatestResult);
      }
      else {
        // finally in this branch we get here if we have a DataContextId passed in and it is the same as the DataContextID in the conversation, in this case simply load the data context
        await dataContextEntity.Load(convoEntity.DataContextID);
      }
    }

    // now, create a conversation detail record for the user message
    const convoDetailEntity = await md.GetEntityObject<ConversationDetailEntity>('Conversation Details', user);
    convoDetailEntity.NewRecord();
    convoDetailEntity.ConversationID = ConversationId;
    convoDetailEntity.Message = UserQuestion;
    convoDetailEntity.Role = 'User';
    convoDetailEntity.HiddenToUser = false;
    let convoDetailSaveResult: boolean = await convoDetailEntity.Save();
    if (!convoDetailSaveResult) {
      LogError(`Error saving conversation detail entity for user message: ${UserQuestion}`, undefined, convoDetailEntity.LatestResult);
    }

    const dataContext = MJGlobal.Instance.ClassFactory.CreateInstance<DataContext>(DataContext);  
    await dataContext.Load(dataContextEntity.ID, dataSource, false, false, 0, user);
    return { dataContext, convoEntity, dataContextEntity, convoDetailEntity };
  }

  protected async LoadConversationDetailsIntoSkipMessages(
    dataSource: DataSource,
    ConversationId: string,
    maxHistoricalMessages?: number
  ): Promise<SkipMessage[]> {
    try {
      if (!ConversationId || ConversationId.length === 0) {
        throw new Error(`ConversationId is required`);
      }

      // load up all the conversation details from the database server
      const md = new Metadata();
      const e = md.Entities.find((e) => e.Name === 'Conversation Details');
      const sql = `SELECT
                      ${maxHistoricalMessages ? 'TOP ' + maxHistoricalMessages : ''} *
                   FROM
                      ${e.SchemaName}.${e.BaseView}
                   WHERE
                      ConversationID = '${ConversationId}'
                   ORDER
                      BY __mj_CreatedAt DESC`;
      const result = await dataSource.query(sql);
      if (!result) 
        throw new Error(`Error running SQL: ${sql}`);
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
            conversationDetailID: r.ID,
            hiddenToUser: r.HiddenToUser,
            userRating: r.UserRating,
            userFeedback: r.UserFeedback,
            reflectionInsights: r.ReflectionInsights,
            summaryOfEarlierConveration: r.SummaryOfEarlierConversation,
            createdAt: r.__mj_CreatedAt,
            updatedAt: r.__mj_UpdatedAt,
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

  protected async HandleSkipChatRequest(
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
    dataContextEntity: DataContextEntity, 
    conversationDetailCount: number
  ): Promise<AskSkipResultType> {
    const skipConfigInfo = configInfo.askSkip;
    LogStatus(`   >>> HandleSkipRequest: Sending request to Skip API: ${skipConfigInfo.chatURL}`);

    if (conversationDetailCount > 10) {
      // At this point it is likely that we are stuck in a loop, so we stop here
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
        Result: `Exceeded maximum attempts to answer the question ${UserQuestion}`,
        ResponsePhase: SkipResponsePhase.AnalysisComplete,
        ConversationId: ConversationId,
        UserMessageConversationDetailId: '',
        AIMessageConversationDetailId: '',
      };
    }

    const response = await sendPostRequest(
      skipConfigInfo.chatURL,
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
          dataContextEntity, 
          conversationDetailCount
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

    // if we created an access token, it will expire soon anyway but let's remove it for extra safety now
    if (apiRequest.callingServerAccessToken && tokenExists(apiRequest.callingServerAccessToken)) {
      deleteAccessToken(apiRequest.callingServerAccessToken);
    }

    const { AIMessageConversationDetailID } = await this.FinishConversationAndNotifyUser(
      apiResponse,
      dataContext,
      dataContextEntity,
      md,
      user,
      convoEntity,
      pubSub,
      userPayload,
      dataSource
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
    dataContextEntity: DataContextEntity, 
    conversationDetailCount: number
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
        conversationDetailID: convoDetailEntity.ID,
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
          executionErrors.push({
            dataRequest: dr,
            errorMessage: e && typeof e === 'object' && 'message' in e && e.message ? e.message : e.toString(),
          });
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
            conversationDetailID: convoDetailEntity.ID,
          });
        }
      } else {
        await dataContext.SaveItems(user, false); // save the data context items
        // replace the data context copy that is in the apiRequest.
        apiRequest.dataContext = <DataContext>CopyScalarsAndArrays(dataContext); // we are casting this to DataContext as we're pushing this to the Skip API, and we don't want to send the real DataContext object, just a copy of the scalar and array properties
        apiRequest.requestPhase = 'data_gathering_response';
      }
      conversationDetailCount++;
      // we have all of the data now, add it to the data context and then submit it back to the Skip API
      return this.HandleSkipChatRequest(
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
        dataContextEntity, 
        conversationDetailCount
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
    userPayload: UserPayload,
    dataSource: DataSource
  ): Promise<{ AIMessageConversationDetailID: string }> {
    const sTitle = apiResponse.reportTitle;
    const sResult = JSON.stringify(apiResponse);

    // first up, let's see if Skip asked us to create an artifact or add a new version to an existing artifact, or NOT
    // use artifacts at all...
    let artifactId: string = null;
    let artifactVersionId: string = null;

    if (apiResponse.artifactRequest?.action === 'new_artifact' || apiResponse.artifactRequest?.action === 'new_artifact_version') {
      // Skip has requested that we create a new artifact or add a new version to an existing artifact
      artifactId = apiResponse.artifactRequest.artifactId; // will only be populated if action == new_artifact_version
      let newVersion: number = 0;
      if (apiResponse.artifactRequest?.action === 'new_artifact') {
        const artifactEntity = await md.GetEntityObject<ConversationArtifactEntity>('MJ: Conversation Artifacts', user);
        // create the new artifact here
        artifactEntity.NewRecord();
        artifactEntity.ConversationID = convoEntity.ID;
        artifactEntity.Name = apiResponse.artifactRequest.name;
        artifactEntity.Description = apiResponse.artifactRequest.description;
        // make sure AI Engine is configured.
        await AIEngine.Instance.Config(false, user)
        artifactEntity.ArtifactTypeID = AIEngine.Instance.ArtifactTypes.find((t) => t.Name === 'Report')?.ID;
        artifactEntity.SharingScope = 'None';

        if (await artifactEntity.Save()) {
          // saved, grab the new ID
          artifactId = artifactEntity.ID;
        }
        else {
          LogError(`Error saving artifact entity for conversation: ${convoEntity.ID}`, undefined, artifactEntity.LatestResult);
        }
        newVersion = 1;
      }
      else {
        // we are updating an existing artifact with a new vesrion so we need to get the old max version and increment it
        const ei = md.EntityByName("MJ: Conversation Artifact Versions");        
        const sSQL = `SELECT ISNULL(MAX(Version),0) AS MaxVersion FROM [${ei.SchemaName}].[${ei.BaseView}] WHERE ConversationArtifactID = '${artifactId}'`;
        try {
          const result = await dataSource.query(sSQL);
          if (result && result.length > 0) {
            newVersion = result[0].MaxVersion + 1;
          } 
          else {
            LogError(`Error getting max version for artifact ID: ${artifactId}`, undefined, result);
          }
        }
        catch (e) {
          LogError(`Error getting max version for artifact ID: ${artifactId}`, undefined, e);
        }
      }
      if (artifactId && newVersion > 0) {
        // only do this if we were provided an artifact ID or we saved a new one above successfully
        const artifactVersionEntity = await md.GetEntityObject<ConversationArtifactVersionEntity>('MJ: Conversation Artifact Versions', user);
        // create the new artifact version here
        artifactVersionEntity.NewRecord();
        artifactVersionEntity.ConversationArtifactID = artifactId;
        artifactVersionEntity.Version = newVersion;
        artifactVersionEntity.Configuration = sResult; // store the full response here
        if (await artifactVersionEntity.Save()) {
          // success saving the new version, set the artifactVersionId
          artifactVersionId = artifactVersionEntity.ID;
        }
        else {
          LogError(`Error saving Artifact Version record`)
        }
      }
    }

    // Create a conversation detail record for the Skip response
    const convoDetailEntityAI = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details', user);
    convoDetailEntityAI.NewRecord();
    convoDetailEntityAI.ConversationID = convoEntity.ID;
    convoDetailEntityAI.Message = sResult;
    convoDetailEntityAI.Role = 'AI';
    convoDetailEntityAI.HiddenToUser = false;
    if (artifactId && artifactId.length > 0) {
      // bind the new convo detail record to the artifact + version for this response
      convoDetailEntityAI.ArtifactID = artifactId;
      if (artifactVersionId && artifactVersionId.length > 0) {
        convoDetailEntityAI.ArtifactVersionID = artifactVersionId;
      }
    }    
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

    // check to see if Skip retrieved additional data on his own outside of the DATA_REQUEST phase/process. It is possible for Skip to call back
    // to the MJAPI in the instance using the GetData() query in the MJAPI. If Skip did this, we need to save the data context items here.
    if (apiResponse.newDataItems) {
      apiResponse.newDataItems.forEach((skipItem) => {
        const newItem = dataContext.AddDataContextItem();
        newItem.Type = 'sql';
        newItem.SQL = skipItem.text;
        newItem.AdditionalDescription = skipItem.description;
      });
    }

    // Save the data context items...
    // FOR NOW, we don't want to store the data in the database, we will just load it from the data context when we need it
    // we need a better strategy to persist because the cost of storage and retrieval/parsing is higher than just running the query again in many/most cases
    await dataContext.SaveItems(user, false);

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

  protected getAgentNoteTypeIDByName(name: string, defaultNoteType: string = 'AI'): string {
    const noteTypeID = AIEngine.Instance.AgentNoteTypes.find(nt => nt.Name.trim().toLowerCase() === name.trim().toLowerCase())?.ID;
    if (noteTypeID) { 
      return noteTypeID;
    }
    else{ 
      // default  
      const defaultNoteTypeID = AIEngine.Instance.AgentNoteTypes.find(nt => nt.Name.trim().toLowerCase() === defaultNoteType.trim().toLowerCase())?.ID;
      return defaultNoteTypeID;
    }
  }

  protected async getViewData(ViewId: string, user: UserInfo): Promise<any> {
    const rv = new RunView();
    const result = await rv.RunView({ ViewID: ViewId, IgnoreMaxRows: true }, user);
    if (result && result.Success) return result.Results;
    else throw new Error(`Error running view ${ViewId}`);
  }

  /**
   * Manually executes the Skip AI learning cycle.
   * @param OrganizationId Optional organization ID to register for this run
   */
  @Mutation(() => ManualLearningCycleResultType)
  async ManuallyExecuteSkipLearningCycle(
    @Arg('OrganizationId', () => String, { nullable: true }) OrganizationId?: string
  ): Promise<ManualLearningCycleResultType> {
    try {
      LogStatus('Manual execution of Skip learning cycle requested via API');
      const skipConfigInfo = configInfo.askSkip;
      // First check if learning cycles are enabled in configuration
      if (!skipConfigInfo.learningCycleEnabled) {
        return {
          Success: false,
          Message: 'Learning cycles are not enabled in configuration'
        };
      }
      
      // Check if we have a valid endpoint when cycles are enabled
      if (!skipConfigInfo.learningCycleURL || skipConfigInfo.learningCycleURL.trim().length === 0) {
        return {
          Success: false,
          Message: 'Learning cycle API endpoint is not configured'
        };
      }
      
      // Use the organization ID from config if not provided
      const orgId = OrganizationId || skipConfigInfo.orgID;
      
      // Call the scheduler's manual execution method with org ID
      const result = await LearningCycleScheduler.Instance.manuallyExecuteLearningCycle(orgId);
      
      return {
        Success: result,
        Message: result 
          ? `Learning cycle was successfully executed manually for organization ${orgId}` 
          : `Learning cycle execution failed for organization ${orgId}. Check server logs for details.`
      };
    }
    catch (e) {
      LogError(`Error in ManuallyExecuteSkipLearningCycle: ${e}`);
      return {
        Success: false,
        Message: `Error executing learning cycle: ${e}`
      };
    }
  }
  
  /**
   * Gets the current status of the learning cycle scheduler
   */
  @Query(() => LearningCycleStatusType)
  async GetLearningCycleStatus(): Promise<LearningCycleStatusType> {
    try {
      const status = LearningCycleScheduler.Instance.getStatus();
      
      return {
        IsSchedulerRunning: status.isSchedulerRunning,
        LastRunTime: status.lastRunTime ? status.lastRunTime.toISOString() : null,
        RunningOrganizations: status.runningOrganizations ? status.runningOrganizations.map(org => ({
          OrganizationId: org.organizationId,
          LearningCycleId: org.learningCycleId,
          StartTime: org.startTime.toISOString(),
          RunningForMinutes: org.runningForMinutes
        })) : []
      };
    }
    catch (e) {
      LogError(`Error in GetLearningCycleStatus: ${e}`);
      return {
        IsSchedulerRunning: false,
        LastRunTime: null,
        RunningOrganizations: []
      };
    }
  }
  
  /**
   * Checks if a specific organization is running a learning cycle
   * @param OrganizationId The organization ID to check
   */
  @Query(() => RunningOrganizationType, { nullable: true })
  async IsOrganizationRunningLearningCycle(
    @Arg('OrganizationId', () => String) OrganizationId: string
  ): Promise<RunningOrganizationType | null> {
    try {
      const skipConfigInfo = configInfo.askSkip;
      // Use the organization ID from config if not provided
      const orgId = OrganizationId || skipConfigInfo.orgID;
      
      const status = LearningCycleScheduler.Instance.isOrganizationRunningCycle(orgId);
      
      if (!status.isRunning) {
        return null;
      }
      
      return {
        OrganizationId: orgId,
        LearningCycleId: status.learningCycleId,
        StartTime: status.startTime.toISOString(),
        RunningForMinutes: status.runningForMinutes
      };
    }
    catch (e) {
      LogError(`Error in IsOrganizationRunningLearningCycle: ${e}`);
      return null;
    }
  }
  
  /**
   * Stops a running learning cycle for a specific organization
   * @param OrganizationId The organization ID to stop the cycle for
   */
  @Mutation(() => StopLearningCycleResultType)
  async StopLearningCycleForOrganization(
    @Arg('OrganizationId', () => String) OrganizationId: string
  ): Promise<StopLearningCycleResultType> {
    try {
      // Use the organization ID from config if not provided
      const orgId = OrganizationId || configInfo.askSkip.orgID;
      
      const result = LearningCycleScheduler.Instance.stopLearningCycleForOrganization(orgId);
      
      // Transform the result to match our GraphQL type
      return {
        Success: result.success,
        Message: result.message,
        WasRunning: result.wasRunning,
        CycleDetails: result.cycleDetails ? {
          LearningCycleId: result.cycleDetails.learningCycleId,
          StartTime: result.cycleDetails.startTime.toISOString(),
          RunningForMinutes: result.cycleDetails.runningForMinutes
        } : null
      };
    }
    catch (e) {
      LogError(`Error in StopLearningCycleForOrganization: ${e}`);
      return {
        Success: false,
        Message: `Error stopping learning cycle: ${e}`,
        WasRunning: false,
        CycleDetails: null
      };
    }
  }
}

export default AskSkipResolver;
