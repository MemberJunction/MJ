import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine, Subscription, Root, ResolverFilterData, ID, Int } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { DatabaseProviderBase, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJConversationDetailEntity, MJConversationDetailAttachmentEntity, MJAIAgentRequestEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, ExecuteAgentResult, ConversationUtility, AttachmentData } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ChatMessage } from '@memberjunction/ai';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GetReadWriteProvider } from '../util.js';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { getAttachmentService } from '@memberjunction/aiengine';
import { NotificationEngine } from '@memberjunction/notifications';

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

    @Field({ nullable: true })
    hierarchicalStep?: string;
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

    // Not a GraphQL field - used for completion routing to correct conversation detail
    conversationDetailId?: string;
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
            cancellationReason: result.agentRun?.CancellationReason,
            feedbackRequestId: result.feedbackRequestId
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
     * Extract the user message from the messages array
     * Looks for the last user message in the conversation
     */
    private extractUserMessage(messages: any[]): string | undefined {
        if (!Array.isArray(messages) || messages.length === 0) {
            return undefined;
        }

        // Find the last user message in the array
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg && msg.role === 'user' && msg.content) {
                return msg.content;
            }
        }

        return undefined;
    }

    /**
     * Validate the agent entity
     */
    private async validateAgent(agentId: string, currentUser: any): Promise<MJAIAgentEntityExtended> {
        // Use AIEngine to get cached agent data
        await AIEngine.Instance.Config(false, currentUser);
        
        // Find agent in cached collection
        const agentEntity = AIEngine.Instance.GetAgentByID(agentId);
        
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
                    stepCount: (progress.metadata as any)?.stepCount || undefined,
                    hierarchicalStep: (progress.metadata as any)?.hierarchicalStep || undefined
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

            // Extract user message from messages array (needed when conversationDetailId not provided)
            const userMessage = this.extractUserMessage(parsedMessages);

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
                userMessage: userMessage, // Provide user message when conversationDetailId not provided
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

            // Sync feedback request if this is a continuation run (user responded via conversation)
            if (lastRunId && result.agentRun?.ID) {
                await this.syncFeedbackRequestFromConversation(
                    lastRunId,
                    result.agentRun.ID,
                    userMessage,
                    currentUser
                );
            }

            // Send notification if agent created a feedback request (Chat step)
            if (result.feedbackRequestId) {
                await this.sendFeedbackRequestNotification(result, currentUser, pubSub, userPayload);
            }

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

            // Publish final events with enriched result data for fire-and-forget clients
            this.publishFinalEvents(pubSub, sessionId, userPayload, result, returnResult);

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
     * Publish final streaming events (partial result and completion).
     * The completion event includes the full result JSON so clients using
     * fire-and-forget mode can receive the result via WebSocket.
     */
    private publishFinalEvents(
        pubSub: PubSubEngine,
        sessionId: string,
        userPayload: UserPayload,
        result: ExecuteAgentResult,
        resultJson?: string
    ) {
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

        // Publish completion with conversationDetailId for client-side routing.
        // Include result data so fire-and-forget clients can receive the full result via WebSocket.
        const completionData: Record<string, unknown> = {
            sessionId,
            agentRunId: result.agentRun?.ID || 'unknown',
            type: 'complete',
            timestamp: new Date(),
            conversationDetailId: result.agentRun?.ConversationDetailID,
            success: result.success,
            errorMessage: result.agentRun?.ErrorMessage || undefined,
            result: resultJson || undefined
        };
        this.PublishStreamingUpdate(pubSub, completionData, userPayload);
    }

    /**
     * Public mutation for regular users to run AI agents with authentication.
     * Supports fire-and-forget mode to avoid Azure proxy timeouts on long-running agent executions.
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
        @Arg('sourceArtifactVersionId', { nullable: true }) sourceArtifactVersionId?: string,
        @Arg('fireAndForget', { nullable: true }) fireAndForget?: boolean
    ): Promise<AIAgentRunResult> {
        // Check API key scope authorization for agent execution
        await this.CheckAPIKeyScopeAuthorization('agent:execute', agentId, userPayload);

        const p = GetReadWriteProvider(providers);

        if (fireAndForget) {
            // Fire-and-forget mode: start execution in background, return immediately.
            // The client will receive the result via WebSocket PubSub completion event.
            this.executeAgentInBackground(
                p, dataSource, agentId, userPayload, messagesJson, sessionId, pubSub,
                data, payload, lastRunId, autoPopulateLastRunPayload, configurationId,
                conversationDetailId, createArtifacts || false, createNotification || false,
                sourceArtifactId, sourceArtifactVersionId
            );

            LogStatus(`🔥 Fire-and-forget: Agent ${agentId} execution started in background for session ${sessionId}`);

            return {
                success: true,
                result: JSON.stringify({ accepted: true, fireAndForget: true })
            };
        }

        // Synchronous mode (default): wait for execution to complete
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
        agentRun: MJAIAgentRunEntityExtended,
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
            const agent = AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, agentRun.AgentID));
            const agentName = agent?.Name || 'Agent';

            // Load conversation detail to get conversation info
            const detail = await md.GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                contextUser
            );
            if (!(await detail.Load(conversationDetailId))) {
                throw new Error(`Failed to load conversation detail ${conversationDetailId}`);
            }

            // Build conversation URL for email/SMS templates
            const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4201';
            const conversationUrl = `${baseUrl}/conversations/${detail.ConversationID}?artifact=${artifactInfo.artifactId}`;

            // Craft message based on versioning
            const message = artifactInfo.versionNumber > 1
                ? `${agentName} has finished processing and created version ${artifactInfo.versionNumber}`
                : `${agentName} has finished processing and created a new artifact`;

            // Use unified notification engine (Config called to ensure loaded)
            const notificationEngine = NotificationEngine.Instance;
            await notificationEngine.Config(false, contextUser);
            const result = await notificationEngine.SendNotification({
                userId: contextUser.ID,
                typeNameOrId: 'Agent Completion',
                title: `${agentName} completed your request`,
                message: message,
                resourceConfiguration: {
                    type: 'conversation',
                    conversationId: detail.ConversationID,
                    messageId: conversationDetailId,
                    artifactId: artifactInfo.artifactId,
                    versionId: artifactInfo.versionId,
                    versionNumber: artifactInfo.versionNumber
                },
                templateData: {
                    agentName: agentName,
                    artifactTitle: artifactInfo.artifactId,
                    conversationUrl: conversationUrl,
                    versionNumber: artifactInfo.versionNumber > 1 ? artifactInfo.versionNumber : undefined
                }
            }, contextUser);

            if (result.success && result.inAppNotificationId) {
                const channels = [];
                if (result.deliveryChannels.inApp) channels.push('InApp');
                if (result.deliveryChannels.email) channels.push('Email');
                if (result.deliveryChannels.sms) channels.push('SMS');
                const channelList = channels.length > 0 ? channels.join(', ') : 'None';
                LogStatus(`📬 Notification sent via ${channelList} (ID: ${result.inAppNotificationId})`);

                // Publish real-time notification event so client updates immediately
                pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
                    userPayload: JSON.stringify(userPayload),
                    message: JSON.stringify({
                        type: 'notification',
                        notificationId: result.inAppNotificationId,
                        action: 'create',
                        title: `${agentName} completed your request`,
                        message: message
                    })
                });

                LogStatus(`📡 Published notification event to client`);
            } else if (!result.success) {
                LogError(`Notification failed: ${result.errors?.join(', ')}`);
            }

        } catch (error) {
            LogError(`Failed to create completion notification: ${(error as Error).message}`);
            // Don't throw - notification failure shouldn't fail the agent run
        }
    }

    /**
     * When a continuation run completes (lastRunId was provided), sync the corresponding
     * AIAgentRequest by marking it as responded. This keeps the dashboard accurate when
     * users respond to Chat steps via the conversation UI.
     *
     * Called server-side in the resolver so the conversation UI doesn't need any changes.
     */
    private async syncFeedbackRequestFromConversation(
        lastRunId: string,
        newRunId: string,
        userMessage: string | undefined,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJAIAgentRequestEntity>({
                EntityName: 'MJ: AI Agent Requests',
                ExtraFilter: `OriginatingAgentRunID='${lastRunId}' AND Status='Requested'`,
                MaxRows: 1,
                ResultType: 'entity_object'
            }, contextUser);

            if (!result.Success || !result.Results || result.Results.length === 0) {
                return; // No pending request for this run — normal for non-Chat continuations
            }

            const request = result.Results[0];
            request.Status = 'Responded';
            request.RespondedAt = new Date();
            request.ResponseByUserID = contextUser.ID;
            request.ResumingAgentRunID = newRunId;
            if (userMessage) {
                request.Response = userMessage;
            }

            const saved = await request.Save();
            if (saved) {
                LogStatus(`📋 Synced feedback request ${request.ID} → Responded (via conversation)`);
            } else {
                LogError(`Failed to save feedback request sync for ${request.ID}`);
            }
        } catch (error) {
            // Don't let sync failure break the agent execution
            LogError(`Error syncing feedback request: ${(error as Error).message}`);
        }
    }

    /**
     * Sends a notification when an agent creates a feedback request (Chat step).
     * Called after execution completes if the result contains a feedbackRequestId.
     */
    private async sendFeedbackRequestNotification(
        result: ExecuteAgentResult,
        contextUser: UserInfo,
        pubSub: PubSubEngine,
        userPayload: UserPayload
    ): Promise<void> {
        if (!result.feedbackRequestId) {
            return;
        }

        try {
            // Get agent name
            await AIEngine.Instance.Config(false, contextUser);
            const agent = AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, result.agentRun?.AgentID));
            const agentName = agent?.Name || 'Agent';

            // Truncate message for notification
            const message = result.agentRun?.Message || 'Agent needs your input';
            const truncatedMessage = message.length > 200 ? message.substring(0, 197) + '...' : message;

            const notificationEngine = NotificationEngine.Instance;
            await notificationEngine.Config(false, contextUser);
            const notifResult = await notificationEngine.SendNotification({
                userId: contextUser.ID,
                typeNameOrId: 'Agent Feedback Request',
                title: `${agentName} needs your input`,
                message: truncatedMessage,
                resourceConfiguration: {
                    type: 'agent-request',
                    requestId: result.feedbackRequestId
                }
            }, contextUser);

            if (notifResult.success && notifResult.inAppNotificationId) {
                LogStatus(`📬 Feedback request notification sent (ID: ${notifResult.inAppNotificationId})`);

                // Publish real-time notification event
                pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
                    userPayload: JSON.stringify(userPayload),
                    message: JSON.stringify({
                        type: 'notification',
                        notificationId: notifResult.inAppNotificationId,
                        action: 'create',
                        title: `${agentName} needs your input`,
                        message: truncatedMessage
                    })
                });
            } else if (!notifResult.success) {
                LogError(`Feedback request notification failed: ${notifResult.errors?.join(', ')}`);
            }
        } catch (error) {
            LogError(`Error sending feedback request notification: ${(error as Error).message}`);
        }
    }

    /**
     * Optimized mutation that loads conversation history server-side.
     * This avoids sending large attachment data from client to server.
     *
     * @param conversationDetailId - The conversation detail ID (user's message already saved)
     * @param agentId - The agent to execute
     * @param maxHistoryMessages - Maximum number of history messages to include (default: 20)
     */
    @Mutation(() => AIAgentRunResult)
    async RunAIAgentFromConversationDetail(
        @Arg('conversationDetailId') conversationDetailId: string,
        @Arg('agentId') agentId: string,
        @Ctx() { userPayload, providers, dataSource }: AppContext,
        @Arg('sessionId') sessionId: string,
        @PubSub() pubSub: PubSubEngine,
        @Arg('maxHistoryMessages', () => Int, { nullable: true }) maxHistoryMessages?: number,
        @Arg('data', { nullable: true }) data?: string,
        @Arg('payload', { nullable: true }) payload?: string,
        @Arg('lastRunId', { nullable: true }) lastRunId?: string,
        @Arg('autoPopulateLastRunPayload', { nullable: true }) autoPopulateLastRunPayload?: boolean,
        @Arg('configurationId', { nullable: true }) configurationId?: string,
        @Arg('createArtifacts', { nullable: true }) createArtifacts?: boolean,
        @Arg('createNotification', { nullable: true }) createNotification?: boolean,
        @Arg('sourceArtifactId', { nullable: true }) sourceArtifactId?: string,
        @Arg('sourceArtifactVersionId', { nullable: true }) sourceArtifactVersionId?: string,
        @Arg('fireAndForget', { nullable: true }) fireAndForget?: boolean
    ): Promise<AIAgentRunResult> {
        // Check API key scope authorization for agent execution
        await this.CheckAPIKeyScopeAuthorization('agent:execute', agentId, userPayload);

        const p = GetReadWriteProvider(providers);
        const currentUser = this.GetUserFromPayload(userPayload);

        if (!currentUser) {
            return {
                success: false,
                errorMessage: 'Unable to determine current user',
                result: JSON.stringify({ success: false, errorMessage: 'Unable to determine current user' })
            };
        }

        try {
            // Load conversation history with attachments from DB
            const messages = await this.loadConversationHistoryWithAttachments(
                conversationDetailId,
                currentUser,
                maxHistoryMessages || 20
            );

            // Convert to JSON string for the existing executeAIAgent method
            const messagesJson = JSON.stringify(messages);

            if (fireAndForget) {
                // Fire-and-forget mode: start execution in background, return immediately.
                // The client will receive the result via WebSocket PubSub completion event.
                this.executeAgentInBackground(
                    p, dataSource, agentId, userPayload, messagesJson, sessionId, pubSub,
                    data, payload, lastRunId, autoPopulateLastRunPayload, configurationId,
                    conversationDetailId, createArtifacts || false, createNotification || false,
                    sourceArtifactId, sourceArtifactVersionId
                );

                LogStatus(`🔥 Fire-and-forget: Agent ${agentId} execution started in background for session ${sessionId}`);

                return {
                    success: true,
                    result: JSON.stringify({ accepted: true, fireAndForget: true })
                };
            }

            // Synchronous mode (default): wait for execution to complete
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
                undefined, // templateData
                lastRunId,
                autoPopulateLastRunPayload,
                configurationId,
                conversationDetailId,
                createArtifacts || false,
                createNotification || false,
                sourceArtifactId,
                sourceArtifactVersionId
            );
        } catch (error) {
            const errorMessage = (error as Error).message || 'Unknown error loading conversation history';
            LogError(`RunAIAgentFromConversationDetail failed: ${errorMessage}`, undefined, error);
            return {
                success: false,
                errorMessage,
                result: JSON.stringify({ success: false, errorMessage })
            };
        }
    }

    /**
     * Respond to a pending AIAgentRequest from the dashboard or API.
     * Updates the request record with the response and optionally spawns a
     * new agent run to resume execution with the human's input.
     */
    @Mutation(() => AIAgentRunResult)
    async RespondToAgentRequest(
        @Arg('requestId') requestId: string,
        @Arg('status') status: string,
        @Ctx() { userPayload, providers, dataSource }: AppContext,
        @Arg('response', { nullable: true }) response?: string,
        @Arg('responseData', { nullable: true }) responseData?: string,
        @Arg('resumeAgent', { nullable: true }) resumeAgent?: boolean
    ): Promise<AIAgentRunResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                throw new Error('Unable to determine current user');
            }

            const md = new Metadata();
            const request = await md.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                currentUser
            );
            if (!(await request.Load(requestId))) {
                throw new Error(`Agent request ${requestId} not found`);
            }

            if (request.Status !== 'Requested') {
                throw new Error(`Request ${requestId} is already ${request.Status}, cannot respond`);
            }

            // Validate status
            const validStatuses = ['Approved', 'Rejected', 'Responded'];
            if (!validStatuses.includes(status)) {
                throw new Error(`Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}`);
            }

            // Update the request
            request.Status = status as 'Approved' | 'Rejected' | 'Responded';
            request.Response = response || null;
            request.ResponseData = responseData || null;
            request.RespondedAt = new Date();
            request.ResponseByUserID = currentUser.ID;

            const saved = await request.Save();
            if (!saved) {
                throw new Error(`Failed to save response for request ${requestId}`);
            }

            LogStatus(`📋 Agent request ${requestId} → ${status} by ${currentUser.Email || currentUser.ID}`);

            const executionTime = Date.now() - startTime;
            return {
                success: true,
                executionTimeMs: executionTime,
                result: JSON.stringify({
                    success: true,
                    requestId: requestId,
                    status: status,
                    resumed: false
                })
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = (error as Error).message || 'Unknown error';
            LogError(`RespondToAgentRequest failed: ${errorMessage}`, undefined, error);
            return {
                success: false,
                errorMessage,
                executionTimeMs: executionTime,
                result: JSON.stringify({ success: false, errorMessage })
            };
        }
    }

    /**
     * Reassign an agent request to a different user.
     * Updates RequestForUserID and sends a notification to the new assignee.
     */
    @Mutation(() => AIAgentRunResult)
    async ReassignAgentRequest(
        @Arg('requestId') requestId: string,
        @Arg('newUserID') newUserID: string,
        @Ctx() { userPayload }: AppContext,
        @Arg('note', { nullable: true }) note?: string
    ): Promise<AIAgentRunResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                throw new Error('Unable to determine current user');
            }

            const md = new Metadata();
            const request = await md.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                currentUser
            );
            if (!(await request.Load(requestId))) {
                throw new Error(`Agent request ${requestId} not found`);
            }

            if (request.Status !== 'Requested') {
                throw new Error(`Request ${requestId} is ${request.Status} and cannot be reassigned`);
            }

            const previousUserID = request.RequestForUserID;
            request.RequestForUserID = newUserID;

            // Append reassignment note to Comments
            if (note || previousUserID) {
                const timestamp = new Date().toISOString();
                const reassignEntry = `[${timestamp} by ${currentUser.Email || currentUser.ID}] Reassigned from ${previousUserID || '(unassigned)'} to ${newUserID}${note ? ` — "${note}"` : ''}`;
                request.Comments = request.Comments
                    ? `${request.Comments}\n${reassignEntry}`
                    : reassignEntry;
            }

            const saved = await request.Save();
            if (!saved) {
                throw new Error(`Failed to save reassignment for request ${requestId}`);
            }

            // Send notification to new assignee
            try {
                await AIEngine.Instance.Config(false, currentUser);
                const agent = AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, request.AgentID));
                const agentName = agent?.Name || 'Agent';
                const truncatedRequest = request.Request.length > 200
                    ? request.Request.substring(0, 197) + '...'
                    : request.Request;

                const notificationEngine = NotificationEngine.Instance;
                await notificationEngine.Config(false, currentUser);
                await notificationEngine.SendNotification({
                    userId: newUserID,
                    typeNameOrId: 'Agent Feedback Request',
                    title: `${agentName} request assigned to you`,
                    message: truncatedRequest,
                    resourceConfiguration: {
                        type: 'agent-request',
                        requestId: requestId
                    }
                }, currentUser);
            } catch (notifError) {
                LogError(`Failed to send reassignment notification: ${(notifError as Error).message}`);
            }

            LogStatus(`📋 Agent request ${requestId} reassigned to ${newUserID}`);

            const executionTime = Date.now() - startTime;
            return {
                success: true,
                executionTimeMs: executionTime,
                result: JSON.stringify({
                    success: true,
                    requestId,
                    newUserID,
                    reassigned: true
                })
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorMessage = (error as Error).message || 'Unknown error';
            LogError(`ReassignAgentRequest failed: ${errorMessage}`, undefined, error);
            return {
                success: false,
                errorMessage,
                executionTimeMs: executionTime,
                result: JSON.stringify({ success: false, errorMessage })
            };
        }
    }

    /**
     * Execute agent in background (fire-and-forget).
     * Handles errors by publishing error completion events via PubSub,
     * so the client receives them via WebSocket even though the HTTP response
     * has already been sent.
     */
    private executeAgentInBackground(
        p: DatabaseProviderBase,
        dataSource: unknown,
        agentId: string,
        userPayload: UserPayload,
        messagesJson: string,
        sessionId: string,
        pubSub: PubSubEngine,
        data?: string,
        payload?: string,
        lastRunId?: string,
        autoPopulateLastRunPayload?: boolean,
        configurationId?: string,
        conversationDetailId?: string,
        createArtifacts: boolean = false,
        createNotification: boolean = false,
        sourceArtifactId?: string,
        sourceArtifactVersionId?: string
    ): void {
        // Execute in background - errors are handled within, not propagated
        this.executeAIAgent(
            p, dataSource, agentId, userPayload, messagesJson, sessionId, pubSub,
            data, payload, undefined, lastRunId, autoPopulateLastRunPayload,
            configurationId, conversationDetailId, createArtifacts, createNotification,
            sourceArtifactId, sourceArtifactVersionId
        ).catch((error: unknown) => {
            // Background execution failed unexpectedly (executeAIAgent has its own try-catch,
            // so this would only fire for truly unexpected errors).
            const errorMessage = (error instanceof Error) ? error.message : 'Unknown background execution error';
            LogError(`🔥 Fire-and-forget background execution failed: ${errorMessage}`, undefined, error);

            // Publish error completion event so the client knows the agent failed
            const errorCompletionData: Record<string, unknown> = {
                sessionId,
                agentRunId: 'unknown',
                type: 'complete',
                timestamp: new Date(),
                conversationDetailId,
                success: false,
                errorMessage,
                result: JSON.stringify({ success: false, errorMessage })
            };
            this.PublishStreamingUpdate(pubSub, errorCompletionData, userPayload);
        });
    }

    /**
     * Load conversation history with attachments from database.
     * Builds ChatMessage[] with multimodal content blocks for attachments.
     */
    private async loadConversationHistoryWithAttachments(
        conversationDetailId: string,
        contextUser: UserInfo,
        maxMessages: number
    ): Promise<ChatMessage[]> {
        const md = new Metadata();
        const rv = new RunView();
        const attachmentService = getAttachmentService();

        // Load the current conversation detail to get the conversation ID
        const currentDetail = await md.GetEntityObject<MJConversationDetailEntity>(
            'MJ: Conversation Details',
            contextUser
        );
        if (!await currentDetail.Load(conversationDetailId)) {
            throw new Error(`Conversation detail ${conversationDetailId} not found`);
        }

        const conversationId = currentDetail.ConversationID;

        // Load recent conversation details (messages) for this conversation
        const detailsResult = await rv.RunView<MJConversationDetailEntity>({
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ConversationID='${conversationId}'`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: maxMessages,
            ResultType: 'entity_object'
        }, contextUser);

        if (!detailsResult.Success || !detailsResult.Results) {
            throw new Error('Failed to load conversation history');
        }

        // Reverse to get chronological order (oldest first)
        const details = detailsResult.Results.reverse();

        // Get all message IDs for batch loading attachments
        const messageIds = details.map(d => d.ID);

        // Batch load all attachments for these messages
        const attachmentsByDetailId = await attachmentService.getAttachmentsBatch(messageIds, contextUser);

        // Build ChatMessage array with attachments
        const messages: ChatMessage[] = [];

        for (const detail of details) {
            const role = this.mapDetailRoleToMessageRole(detail.Role);
            const attachments = attachmentsByDetailId.get(detail.ID) || [];

            // Get attachment data with content URLs (handles both inline and FileID storage)
            const attachmentDataPromises = attachments.map(att =>
                attachmentService.getAttachmentData(att, contextUser)
            );
            const attachmentDataResults = await Promise.all(attachmentDataPromises);

            // Filter out nulls and convert to AttachmentData format
            const validAttachments: AttachmentData[] = attachmentDataResults
                .filter((result): result is NonNullable<typeof result> => result !== null)
                .map(result => ({
                    type: ConversationUtility.GetAttachmentTypeFromMime(result.attachment.MimeType),
                    mimeType: result.attachment.MimeType,
                    fileName: result.attachment.FileName ?? undefined,
                    sizeBytes: result.attachment.FileSizeBytes ?? undefined,
                    width: result.attachment.Width ?? undefined,
                    height: result.attachment.Height ?? undefined,
                    durationSeconds: result.attachment.DurationSeconds ?? undefined,
                    content: result.contentUrl
                }));

            // Build message content (with or without attachments)
            let content: string | ReturnType<typeof ConversationUtility.BuildChatMessageContent>;

            if (validAttachments.length > 0) {
                // Use ConversationUtility to build multimodal content blocks
                content = ConversationUtility.BuildChatMessageContent(
                    detail.Message || '',
                    validAttachments
                );
            } else {
                content = detail.Message || '';
            }

            messages.push({
                role,
                content
            });
        }

        return messages;
    }

    /**
     * Map ConversationDetail Role to ChatMessage role
     */
    private mapDetailRoleToMessageRole(role: string): 'user' | 'assistant' | 'system' {
        const roleLower = (role || '').toLowerCase();
        if (roleLower === 'user') return 'user';
        if (roleLower === 'assistant' || roleLower === 'agent' || roleLower === 'ai') return 'assistant';
        if (roleLower === 'system') return 'system';
        return 'user'; // Default to user
    }

}