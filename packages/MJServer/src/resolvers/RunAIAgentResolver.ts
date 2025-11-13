import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine, Subscription, Root, ResolverFilterData, ID } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { DatabaseProviderBase, LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { AIAgentEntityExtended, ConversationDetailEntity, UserNotificationEntity, AIAgentRunEntityExtended } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GetReadWriteProvider } from '../util.js';
import { SafeJSONParse } from '@memberjunction/global';

@ObjectType()
export class AIAgentRunResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    errorMessage?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;

    @Field()
    result: string; // JSON serialized ExecuteAgentResult with scalars only
}

@ObjectType()
export class AgentExecutionProgress {
    @Field()
    currentStep: string;

    @Field({ nullable: true })
    percentage?: number;

    @Field()
    message: string;

    @Field({ nullable: true })
    agentName?: string;

    @Field({ nullable: true })
    agentType?: string;

    @Field({ nullable: true })
    stepCount?: number;
}

@ObjectType()
export class AgentStreamingContent {
    @Field()
    content: string;

    @Field()
    isPartial: boolean;

    @Field({ nullable: true })
    stepName?: string;

    @Field({ nullable: true })
    agentName?: string;
}

@ObjectType()
export class AgentExecutionStepSummary {
    @Field()
    stepId: string;

    @Field()
    stepName: string;

    @Field({ nullable: true })
    agentName?: string;

    @Field({ nullable: true })
    agentType?: string;

    @Field()
    startTime: Date;

    @Field({ nullable: true })
    endTime?: Date;

    @Field()
    status: string;

    @Field({ nullable: true })
    result?: string;
}

@ObjectType()
export class AgentPartialResult {
    @Field()
    currentStep: string;

    @Field({ nullable: true })
    partialOutput?: string;
}

@ObjectType()
export class AgentExecutionStreamMessage {
    @Field(() => ID)
    sessionId: string;

    @Field(() => ID)
    agentRunId: string;

    @Field()
    type: 'progress' | 'streaming' | 'partial_result' | 'complete';

    @Field({ nullable: true })
    progress?: AgentExecutionProgress;

    @Field({ nullable: true })
    streaming?: AgentStreamingContent;

    @Field({ nullable: true })
    partialResult?: AgentPartialResult;

    @Field()
    timestamp: Date;
    
    // Not a GraphQL field - used internally for streaming
    agentRun?: any;
}





@Resolver()
export class RunAIAgentResolver extends ResolverBase {
    /**
     * Sanitize ExecuteAgentResult for JSON serialization
     * Removes circular references and non-serializable objects
     */
    private sanitizeAgentResult(result: ExecuteAgentResult): any {
        const sanitized: any = {
            success: result.success,
            payload: result.payload,
            responseForm: result.responseForm,
            actionableCommands: result.actionableCommands,
            automaticCommands: result.automaticCommands,
            errorMessage: result.agentRun?.ErrorMessage,
            finalStep: result.agentRun?.FinalStep,
            cancelled: result.agentRun?.Status === 'Cancelled',
            cancellationReason: result.agentRun?.CancellationReason
        };

        // Safely extract agent run data using GetAll() for proper serialization
        if (result.agentRun && typeof result.agentRun.GetAll === 'function') {
            // Use GetAll() to get the full serialized object including extended properties
            sanitized.agentRun = result.agentRun.GetAll();
        }
        else {
            // shouldn't ever get here
            console.error('❌ Unexpected agent run structure:', result.agentRun);
        }

        return sanitized;
    }


    /**
     * Parse and validate JSON input
     */
    private parseJsonInput(jsonString: string | undefined, fieldName: string): any {
        if (!jsonString) return {};
        
        try {
            return JSON.parse(jsonString);
        } catch (parseError) {
            throw new Error(`Invalid JSON in ${fieldName}: ${(parseError as Error).message}`);
        }
    }

    /**
     * Validate the agent entity
     */
    private async validateAgent(agentId: string, currentUser: any): Promise<AIAgentEntityExtended> {
        // Use AIEngine to get cached agent data
        await AIEngine.Instance.Config(false, currentUser);
        
        // Find agent in cached collection
        const agentEntity = AIEngine.Instance.Agents.find((a: AIAgentEntityExtended) => a.ID === agentId);
        
        if (!agentEntity) {
            throw new Error(`AI Agent with ID ${agentId} not found`);
        }

        // Check if agent is active
        if (agentEntity.Status !== 'Active') {
            throw new Error(`AI Agent "${agentEntity.Name}" is not active (Status: ${agentEntity.Status})`);
        }

        return agentEntity;
    }

    /**
     * Create streaming progress callback
     */
    private createProgressCallback(pubSub: PubSubEngine, sessionId: string, userPayload: UserPayload, agentRunRef: { current: any }) {
        return (progress: any) => {
            // Only publish progress for significant steps (not initialization noise)
            const significantSteps = ['prompt_execution', 'action_execution', 'subagent_execution', 'decision_processing'];
            if (!significantSteps.includes(progress.step)) {
                console.log(`🔇 Skipping noise progress: ${progress.step}`);
                return;
            }
            
            // Get the agent run from the progress metadata or use the ref
            const agentRun = progress.metadata?.agentRun || agentRunRef.current;
            if (!agentRun) {
                console.error('❌ No agent run available for progress callback');
                return;
            }
            
            console.log('📡 Publishing progress update:', {
                step: progress.step,
                percentage: progress.percentage,
                message: progress.message,
                sessionId,
                agentRunId: agentRun.ID
            });
            
            // Publish progress updates with the full serialized agent run
            const progressMsg: AgentExecutionStreamMessage = {
                sessionId,
                agentRunId: agentRun.ID,
                type: 'progress',
                agentRun: agentRun.GetAll(), // Serialize the full agent run
                progress: {
                    currentStep: progress.step,
                    percentage: progress.percentage,
                    message: progress.message,
                    agentName: (progress.metadata as any)?.agentName || undefined,
                    agentType: (progress.metadata as any)?.agentType || undefined,
                    stepCount: (progress.metadata as any)?.stepCount || undefined
                },
                timestamp: new Date()
            };
            this.PublishProgressUpdate(pubSub, progressMsg, userPayload);
        };
    }

    private PublishProgressUpdate(pubSub: PubSubEngine, data: any, userPayload: UserPayload) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, { 
            message: JSON.stringify({
                resolver: 'RunAIAgentResolver',
                type: 'ExecutionProgress',
                status: 'ok',
                data,
            }),
            sessionId: userPayload.sessionId,
        });
    }


    private PublishStreamingUpdate(pubSub: PubSubEngine, data: any, userPayload: UserPayload) {
        pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, { 
            message: JSON.stringify({
                resolver: 'RunAIAgentResolver',
                type: 'StreamingContent',
                status: 'ok',
                data,
            }),
            sessionId: userPayload.sessionId,
        });
    }

    /**
     * Create streaming content callback
     */
    private createStreamingCallback(pubSub: PubSubEngine, sessionId: string, userPayload: UserPayload, agentRunRef: { current: any }) {
        return (chunk: any) => {
            // Use the agent run from the ref
            const agentRun = agentRunRef.current;
            if (!agentRun) {
                console.error('❌ No agent run available for streaming callback');
                return;
            }
            
            console.log('💬 Publishing streaming content:', {
                content: chunk.content.substring(0, 50) + '...',
                isComplete: chunk.isComplete,
                stepType: chunk.stepType,
                sessionId,
                agentRunId: agentRun.ID
            });
            
            // Publish streaming content with the full serialized agent run
            const streamMsg: AgentExecutionStreamMessage = {
                sessionId,
                agentRunId: agentRun.ID,
                type: 'streaming',
                agentRun: agentRun.GetAll(), // Include the full serialized agent run
                streaming: {
                    content: chunk.content,
                    isPartial: !chunk.isComplete,
                    stepName: chunk.stepType,
                    agentName: chunk.modelName
                },
                timestamp: new Date()
            };
            this.PublishStreamingUpdate(pubSub, streamMsg, userPayload);
        };
    }

    /**
     * Internal method that handles the core AI agent execution logic.
     * This method is called by both the regular and system user resolvers.
     * @private
     */
    private async executeAIAgent(
        p: DatabaseProviderBase,
        dataSource: any,
        agentId: string,
        userPayload: UserPayload,
        messagesJson: string,
        sessionId: string,
        pubSub: PubSubEngine,
        data?: string,
        payload?: string,
        templateData?: string,
        lastRunId?: string,
        autoPopulateLastRunPayload?: boolean,
        configurationId?: string,
        conversationDetailId?: string,
        createArtifacts: boolean = false,
        createNotification: boolean = false,
        sourceArtifactId?: string,
        sourceArtifactVersionId?: string
    ): Promise<AIAgentRunResult> {
        const startTime = Date.now();
        
        try {
            LogStatus(`=== RUNNING AI AGENT FOR ID: ${agentId} ===`);

            // Parse and validate messages
            const parsedMessages = this.parseJsonInput(messagesJson, 'messages');
            if (!Array.isArray(parsedMessages)) {
                throw new Error('Messages must be an array');
            }

            // Parse data contexts
            const parsedData = this.parseJsonInput(data, 'data');
            const parsedTemplateData = this.parseJsonInput(templateData, 'templateData');

            // Get and validate current user
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                throw new Error('Unable to determine current user');
            }
            
            // Validate agent
            const agentEntity = await this.validateAgent(agentId, currentUser);

            // @jordanfanapour IMPORTANT TO-DO for various engine classes (via base engine class) and here for AI Agent Runner and for AI Prompt Runner, need to be able to pass in a IMetadataProvider for it to use
            // for multi-user server environments like this one
            // Create AI agent runner
            const agentRunner = new AgentRunner();

            // Track agent run for streaming (use ref to update later)
            const agentRunRef = { current: null as any };

            console.log(`🚀 Starting agent execution with sessionId: ${sessionId}`);

            // Execute the agent in conversation context - handles conversation, artifacts, etc.
            const conversationResult = await agentRunner.RunAgentInConversation({
                agent: agentEntity,
                conversationMessages: parsedMessages,
                payload: payload ? SafeJSONParse(payload) : undefined,
                contextUser: currentUser,
                onProgress: this.createProgressCallback(pubSub, sessionId, userPayload, agentRunRef),
                onStreaming: this.createStreamingCallback(pubSub, sessionId, userPayload, agentRunRef),
                lastRunId: lastRunId,
                autoPopulateLastRunPayload: autoPopulateLastRunPayload,
                configurationId: configurationId,
                data: parsedData,
                context: {
                    dataSource: dataSource
                }
            }, {
                conversationDetailId: conversationDetailId, // Use existing if provided
                createArtifacts: createArtifacts || false,
                sourceArtifactId: sourceArtifactId
            });

            const result = conversationResult.agentResult;
            // Use agent response detail ID if available, otherwise fall back to user message detail ID
            const finalConversationDetailId = conversationResult.agentResponseDetailId || conversationResult.userMessageDetailId;
            const artifactInfo = conversationResult.artifactInfo;

            // Update agent run ref once available
            if (result.agentRun) {
                agentRunRef.current = result.agentRun;
            }

            const executionTime = Date.now() - startTime;

            // Publish final events
            this.publishFinalEvents(pubSub, sessionId, userPayload, result);

            // Create notification if enabled and artifact was created successfully
            if (createNotification && result.success && artifactInfo && artifactInfo.artifactId && artifactInfo.versionId && artifactInfo.versionNumber) {
                await this.createCompletionNotification(
                    result.agentRun,
                    {
                        artifactId: artifactInfo.artifactId,
                        versionId: artifactInfo.versionId,
                        versionNumber: artifactInfo.versionNumber
                    },
                    finalConversationDetailId,
                    currentUser,
                    pubSub,
                    userPayload
                );
            }

            // Create sanitized payload for JSON serialization
            const sanitizedResult = this.sanitizeAgentResult(result);
            const returnResult = JSON.stringify(sanitizedResult);

            // Log completion
            if (result.success) {
                LogStatus(`=== AI AGENT RUN COMPLETED FOR: ${agentEntity.Name} (${executionTime}ms) ===`);
            } else {
                LogError(`AI Agent run failed for ${agentEntity.Name}: ${result.agentRun?.ErrorMessage}`);
            }

            return {
                success: result.success,
                errorMessage: result.agentRun?.ErrorMessage || undefined,
                executionTimeMs: executionTime,
                result: returnResult
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            LogError(`AI Agent run failed:`, undefined, error);
            
            // Create error payload
            const errorResult = {
                success: false,
                errorMessage: (error as Error).message || 'Unknown error occurred',
                executionTimeMs: executionTime
            };
            
            return {
                success: false,
                errorMessage: errorResult.errorMessage,
                executionTimeMs: executionTime,
                result: JSON.stringify(errorResult)
            };
        }
    }

    /**
     * Publish final streaming events (partial result and completion)
     */
    private publishFinalEvents(pubSub: PubSubEngine, sessionId: string, userPayload: UserPayload, result: ExecuteAgentResult) {
        if (result.agentRun) {
            // Get the last step from agent run
            let lastStep = 'Completed';
            if (result.agentRun?.Steps && result.agentRun.Steps.length > 0) {
                // Get the last step from the Steps array
                const lastStepEntity = result.agentRun.Steps[result.agentRun.Steps.length - 1];
                lastStep = lastStepEntity?.StepName || 'Completed';
            }

            // Publish partial result
            const partialResult: AgentPartialResult = {
                currentStep: lastStep,
                partialOutput: result.payload || undefined
            };

            const partialMsg: AgentExecutionStreamMessage = {
                sessionId,
                agentRunId: result.agentRun.ID,
                type: 'partial_result',
                partialResult,
                timestamp: new Date()
            };
            this.PublishStreamingUpdate(pubSub, partialMsg, userPayload);
        }

        // Publish completion
        const completeMsg: AgentExecutionStreamMessage = {
            sessionId,
            agentRunId: result.agentRun?.ID || 'unknown',
            type: 'complete',
            timestamp: new Date()
        };
        this.PublishStreamingUpdate(pubSub, completeMsg, userPayload);
    }

    /**
     * Public mutation for regular users to run AI agents with authentication.
     */
    @Mutation(() => AIAgentRunResult)
    async RunAIAgent(
        @Arg('agentId') agentId: string,
        @Ctx() { userPayload, providers, dataSource }: AppContext,
        @Arg('messages') messagesJson: string,
        @Arg('sessionId') sessionId: string,
        @PubSub() pubSub: PubSubEngine,
        @Arg('data', { nullable: true }) data?: string,
        @Arg('payload', { nullable: true }) payload?: string,
        @Arg('templateData', { nullable: true }) templateData?: string,
        @Arg('lastRunId', { nullable: true }) lastRunId?: string,
        @Arg('autoPopulateLastRunPayload', { nullable: true }) autoPopulateLastRunPayload?: boolean,
        @Arg('configurationId', { nullable: true }) configurationId?: string,
        @Arg('conversationDetailId', { nullable: true }) conversationDetailId?: string,
        @Arg('createArtifacts', { nullable: true }) createArtifacts?: boolean,
        @Arg('createNotification', { nullable: true }) createNotification?: boolean,
        @Arg('sourceArtifactId', { nullable: true }) sourceArtifactId?: string,
        @Arg('sourceArtifactVersionId', { nullable: true }) sourceArtifactVersionId?: string
    ): Promise<AIAgentRunResult> {
        const p = GetReadWriteProvider(providers);
        return this.executeAIAgent(
            p,
            dataSource,
            agentId,
            userPayload,
            messagesJson,
            sessionId,
            pubSub,
            data,
            payload,
            templateData,
            lastRunId,
            autoPopulateLastRunPayload,
            configurationId,
            conversationDetailId,
            createArtifacts || false,
            createNotification || false,
            sourceArtifactId,
            sourceArtifactVersionId
        );
    }

    /**
     * System user query for running AI agents with elevated privileges.
     * Requires the @RequireSystemUser decorator to ensure only system users can access.
     */
    @RequireSystemUser()
    @Query(() => AIAgentRunResult)
    async RunAIAgentSystemUser(
        @Arg('agentId') agentId: string,
        @Ctx() { userPayload, providers, dataSource }: AppContext,
        @Arg('messages') messagesJson: string,
        @Arg('sessionId') sessionId: string,
        @PubSub() pubSub: PubSubEngine,
        @Arg('data', { nullable: true }) data?: string,
        @Arg('payload', { nullable: true }) payload?: string,
        @Arg('templateData', { nullable: true }) templateData?: string,
        @Arg('lastRunId', { nullable: true }) lastRunId?: string,
        @Arg('autoPopulateLastRunPayload', { nullable: true }) autoPopulateLastRunPayload?: boolean,
        @Arg('configurationId', { nullable: true }) configurationId?: string,
        @Arg('conversationDetailId', { nullable: true }) conversationDetailId?: string,
        @Arg('createArtifacts', { nullable: true }) createArtifacts?: boolean,
        @Arg('createNotification', { nullable: true }) createNotification?: boolean,
        @Arg('sourceArtifactId', { nullable: true }) sourceArtifactId?: string,
        @Arg('sourceArtifactVersionId', { nullable: true }) sourceArtifactVersionId?: string
    ): Promise<AIAgentRunResult> {
        const p = GetReadWriteProvider(providers);
        return this.executeAIAgent(
            p,
            dataSource,
            agentId,
            userPayload,
            messagesJson,
            sessionId,
            pubSub,
            data,
            payload,
            templateData,
            lastRunId,
            autoPopulateLastRunPayload,
            configurationId,
            conversationDetailId,
            createArtifacts || false,
            createNotification || false,
            sourceArtifactId,
            sourceArtifactVersionId
        );
    }

    /**
     * Create a user notification for agent completion with artifact
     * Notification includes navigation link back to the conversation
     */
    private async createCompletionNotification(
        agentRun: AIAgentRunEntityExtended,
        artifactInfo: { artifactId: string; versionId: string; versionNumber: number },
        conversationDetailId: string,
        contextUser: UserInfo,
        pubSub: PubSubEngine,
        userPayload: UserPayload
    ): Promise<void> {
        try {
            const md = new Metadata();

            // Get agent info for notification message
            await AIEngine.Instance.Config(false, contextUser);
            const agent = AIEngine.Instance.Agents.find(a => a.ID === agentRun.AgentID);
            const agentName = agent?.Name || 'Agent';

            // Load conversation detail to get conversation info
            const detail = await md.GetEntityObject<ConversationDetailEntity>(
                'Conversation Details',
                contextUser
            );
            if (!(await detail.Load(conversationDetailId))) {
                throw new Error(`Failed to load conversation detail ${conversationDetailId}`);
            }

            // Create notification entity
            const notification = await md.GetEntityObject<UserNotificationEntity>(
                'User Notifications',
                contextUser
            );

            notification.UserID = contextUser.ID;
            notification.Title = `${agentName} completed your request`;

            // Craft message based on versioning
            if (artifactInfo.versionNumber > 1) {
                notification.Message = `${agentName} has finished processing and created version ${artifactInfo.versionNumber}`;
            } else {
                notification.Message = `${agentName} has finished processing and created a new artifact`;
            }

            // Store navigation configuration as JSON
            // Client will parse this to navigate to the conversation with artifact visible
            notification.ResourceConfiguration = JSON.stringify({
                type: 'conversation',
                conversationId: detail.ConversationID,
                messageId: conversationDetailId,
                artifactId: artifactInfo.artifactId,
                versionNumber: artifactInfo.versionNumber
            });

            notification.Unread = true;  // Default unread
            // ResourceTypeID and ResourceRecordID left null - using custom navigation

            if (!(await notification.Save())) {
                throw new Error('Failed to save notification');
            }

            LogStatus(`📬 Created notification ${notification.ID} for user ${contextUser.ID}`);

            // Publish real-time notification event so client updates immediately
            pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
                userPayload: JSON.stringify(userPayload),
                message: JSON.stringify({
                    type: 'notification',
                    notificationId: notification.ID,
                    action: 'create',
                    title: notification.Title,
                    message: notification.Message
                })
            });

            LogStatus(`📡 Published notification event to client`);

        } catch (error) {
            LogError(`Failed to create completion notification: ${(error as Error).message}`);
            // Don't throw - notification failure shouldn't fail the agent run
        }
    }

}