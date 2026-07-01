import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine, Subscription, Root, ResolverFilterData, ID, Int } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { DatabaseProviderBase, LogError, LogStatus, Metadata, RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MJConversationDetailEntity, MJConversationDetailAttachmentEntity, MJConversationDetailArtifactEntity, MJArtifactVersionEntity, MJAIAgentRequestEntity, ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { RouteArtifact } from './artifact-routing.js';
import { AgentRunner, ArtifactToolManager } from '@memberjunction/ai-agents';
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended, ExecuteAgentResult, ConversationUtility, AttachmentData } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ChatMessage, ChatMessageContent } from '@memberjunction/ai';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { startLivenessPulse } from '../generic/FireAndForgetHeartbeat.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { GetReadWriteProvider } from '../util.js';
import { resolveWidgetGuestRunContext, elevateUserPayload } from '../realtimeWidget/widgetGuestElevation.js';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { GetAttachmentService } from '@memberjunction/aiengine';
import { NotificationEngine } from '@memberjunction/notifications';

/**
 * Absolute server-side cap for inline content blocks emitted to the LLM, in
 * bytes. Defense in depth: even if an Artifact Type is configured for Inline
 * delivery, anything past this size falls back to the tool dispatch path with
 * a visible annotation on the manifest. Single source of truth — replaces the
 * pre-existing per-call MAX_INLINE_ARTIFACT_CHARS / maxInlineChars constants.
 */
const INLINE_SIZE_CAP = 100 * 1024;

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
            // Capture the agent run into the ref as soon as any progress event carries it (even
            // "noise" steps), so the fire-and-forget liveness pulse can read its id/status mid-run
            // rather than only after RunAgentInConversation returns.
            if (progress.metadata?.agentRun) {
                agentRunRef.current = progress.metadata.agentRun;
            }

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
        sourceArtifactVersionId?: string,
        /** LATENCY OPT #2: Pre-resolved conversationId avoids redundant DB load in AgentRunner */
        conversationId?: string,
        /** Optional external ref the caller can read to observe the agent run as it becomes available
         *  (used by the fire-and-forget liveness pulse to enrich heartbeats with the run id/status). */
        runRef?: { current: MJAIAgentRunEntityExtended | null },
        /** Per-request Plan Mode toggle — threaded into ExecuteAgentParams.planMode (root-agent HITL gate). */
        planMode?: boolean
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

            // Create AI agent runner with the per-request isolated provider so all agent DB operations
            // (AIAgentRun, AIAgentRunSteps, AIAgentRequests, AIPromptRuns) never share the global
            // singleton's transaction state with concurrent requests (e.g. conversation deletes).
            const agentRunner = new AgentRunner(p);

            // Track agent run for streaming (use ref to update later). Reuse the caller-supplied
            // ref when provided so the fire-and-forget liveness pulse can observe the run.
            const agentRunRef = runRef ?? { current: null as any };

            console.log(`🚀 Starting agent execution with sessionId: ${sessionId}`);

            // Execute the agent in conversation context - handles conversation, artifacts, etc.
            const conversationResult = await agentRunner.RunAgentInConversation({
                agent: agentEntity,
                conversationMessages: parsedMessages,
                payload: payload ? SafeJSONParse(payload) : undefined,
                contextUser: currentUser,
                sessionID: sessionId,
                onProgress: this.createProgressCallback(pubSub, sessionId, userPayload, agentRunRef),
                onStreaming: this.createStreamingCallback(pubSub, sessionId, userPayload, agentRunRef),
                lastRunId: lastRunId,
                autoPopulateLastRunPayload: autoPopulateLastRunPayload,
                configurationId: configurationId,
                planMode: planMode,
                data: parsedData,
                context: {
                    dataSource: dataSource
                }
            }, {
                conversationDetailId: conversationDetailId, // Use existing if provided
                conversationId: conversationId, // LATENCY OPT #2: pre-resolved to skip redundant load in AgentRunner
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

            // LATENCY OPTIMIZATION (Opt #6): These three post-execution operations are independent
            // of each other — none reads the output of another. Previously they ran sequentially,
            // adding their latencies together (~50ms total). Now they run in parallel via Promise.all,
            // so we only pay the cost of the slowest one.
            //
            // 1. syncFeedbackRequestFromConversation — links a prior Chat-step feedback request to
            //    the new agent run so the conversation thread stays coherent.
            // 2. sendFeedbackRequestNotification — sends an in-app/email/SMS notification when the
            //    agent paused for human input (Chat step).
            // 3. createCompletionNotification — sends an in-app/email/SMS notification that the
            //    agent finished and created an artifact.
            const postExecutionOps: Promise<void>[] = [];

            if (lastRunId && result.agentRun?.ID) {
                postExecutionOps.push(
                    this.syncFeedbackRequestFromConversation(lastRunId, result.agentRun.ID, userMessage, currentUser, p)
                );
            }

            if (result.feedbackRequestId) {
                postExecutionOps.push(
                    this.sendFeedbackRequestNotification(result, currentUser, pubSub, userPayload)
                );
            }

            if (createNotification && result.success && artifactInfo && artifactInfo.artifactId && artifactInfo.versionId && artifactInfo.versionNumber) {
                postExecutionOps.push(
                    this.createCompletionNotification(
                        result.agentRun,
                        {
                            artifactId: artifactInfo.artifactId,
                            versionId: artifactInfo.versionId,
                            versionNumber: artifactInfo.versionNumber
                        },
                        conversationResult.conversationId,
                        finalConversationDetailId,
                        currentUser,
                        pubSub,
                        userPayload
                    )
                );
            }

            if (postExecutionOps.length > 0) {
                await Promise.all(postExecutionOps);
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
    /**
     * LATENCY OPTIMIZATION (Opt #2): Now accepts conversationId directly instead of
     * conversationDetailId. Previously this method loaded a ConversationDetail entity
     * from the DB solely to extract its ConversationID field for building a URL — a
     * redundant ~50ms DB round-trip since the caller already resolved conversationId
     * when loading conversation history.
     */
    private async createCompletionNotification(
        agentRun: MJAIAgentRunEntityExtended,
        artifactInfo: { artifactId: string; versionId: string; versionNumber: number },
        conversationId: string,
        conversationDetailId: string,
        contextUser: UserInfo,
        pubSub: PubSubEngine,
        userPayload: UserPayload
    ): Promise<void> {
        try {
            // Get agent info for notification message
            await AIEngine.Instance.Config(false, contextUser);
            const agent = AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, agentRun.AgentID));
            const agentName = agent?.Name || 'Agent';

            // Build conversation URL for email/SMS templates
            const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4201';
            const conversationUrl = `${baseUrl}/conversations/${conversationId}?artifact=${artifactInfo.artifactId}`;

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
                    conversationId: conversationId,
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
                        message: message,
                        conversationId: conversationId
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
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<void> {
        try {
            const rv = RunView.FromMetadataProvider(provider);
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
        @Arg('fireAndForget', { nullable: true }) fireAndForget?: boolean,
        @Arg('planMode', { nullable: true }) planMode?: boolean
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

        // PUBLIC WEB-WIDGET PRIVILEGED DISPATCH (public-web-widget.md Phase 0): when the request is a
        // widget guest, the agent runs under a TRUSTED SERVER PRINCIPAL and the agent id is taken
        // AUTHORITATIVELY from the widget instance (never the client-supplied arg) — so a guest needs
        // no grants to WRITE the AI run entities and cannot run an arbitrary agent under elevation.
        // Conversation OWNERSHIP is still enforced under the guest principal below: the guest loads its
        // own ConversationDetail through the Widget Guest RLS filters, so a detail id from another
        // session resolves to "not found" before any elevated work happens.
        const widgetElevation = await resolveWidgetGuestRunContext(userPayload, p);
        const effectiveAgentId = widgetElevation ? widgetElevation.pinnedAgentId : agentId;
        const effectiveUserPayload = widgetElevation ? elevateUserPayload(userPayload, widgetElevation.elevatedUser) : userPayload;

        try {
            // LATENCY OPTIMIZATION (Opt #2 + #3): Load ConversationDetail once here to extract
            // conversationId, then pass it downstream. Previously this record was loaded multiple
            // times: once in loadConversationHistoryWithAttachments (just to get conversationId),
            // once in AgentRunner (same reason), and once in createCompletionNotification. Now we
            // load it a single time and thread conversationId through the call chain.
            const currentDetail = await p.GetEntityObject<MJConversationDetailEntity>(
                'MJ: Conversation Details',
                currentUser
            );
            if (!await currentDetail.Load(conversationDetailId)) {
                throw new Error(`Conversation detail ${conversationDetailId} not found`);
            }
            const conversationId = currentDetail.ConversationID;

            // Load conversation history with attachments from DB
            const messages = await this.loadConversationHistoryWithAttachments(
                conversationId,
                currentUser,
                maxHistoryMessages || 20,
                p
            );

            // Convert to JSON string for the existing executeAIAgent method
            const messagesJson = JSON.stringify(messages);

            if (fireAndForget) {
                // Fire-and-forget mode: start execution in background, return immediately.
                // The client will receive the result via WebSocket PubSub completion event.
                this.executeAgentInBackground(
                    p, dataSource, effectiveAgentId, effectiveUserPayload, messagesJson, sessionId, pubSub,
                    data, payload, lastRunId, autoPopulateLastRunPayload, configurationId,
                    conversationDetailId, createArtifacts || false, createNotification || false,
                    sourceArtifactId, sourceArtifactVersionId, conversationId, planMode
                );

                LogStatus(`🔥 Fire-and-forget: Agent ${effectiveAgentId} execution started in background for session ${sessionId}`);

                return {
                    success: true,
                    result: JSON.stringify({ accepted: true, fireAndForget: true })
                };
            }

            // Synchronous mode (default): wait for execution to complete
            return this.executeAIAgent(
                p,
                dataSource,
                effectiveAgentId,
                effectiveUserPayload,
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
                sourceArtifactVersionId,
                conversationId, // LATENCY OPT #2: pass pre-resolved conversationId
                undefined, // runRef
                planMode
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

            const p = GetReadWriteProvider(providers);
            const request = await p.GetEntityObject<MJAIAgentRequestEntity>(
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
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('note', { nullable: true }) note?: string
    ): Promise<AIAgentRunResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                throw new Error('Unable to determine current user');
            }

            const p = GetReadWriteProvider(providers);
            const request = await p.GetEntityObject<MJAIAgentRequestEntity>(
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
        sourceArtifactVersionId?: string,
        /** LATENCY OPT #2: Pre-resolved conversationId avoids redundant DB load in AgentRunner */
        conversationId?: string,
        /** Per-request Plan Mode toggle — threaded through to ExecuteAgentParams.planMode. */
        planMode?: boolean
    ): void {
        // Ref the liveness pulse reads to enrich heartbeats once the run is created.
        const runRef: { current: MJAIAgentRunEntityExtended | null } = { current: null };
        const pulse = startLivenessPulse({
            pubSub,
            sessionId,
            resolver: 'RunAIAgentResolver',
            readStatus: () => runRef.current
                ? { runId: runRef.current.ID, status: runRef.current.Status }
                : undefined,
        });

        // Execute in background - errors are handled within, not propagated
        this.executeAIAgent(
            p, dataSource, agentId, userPayload, messagesJson, sessionId, pubSub,
            data, payload, undefined, lastRunId, autoPopulateLastRunPayload,
            configurationId, conversationDetailId, createArtifacts, createNotification,
            sourceArtifactId, sourceArtifactVersionId, conversationId, runRef, planMode
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
        }).finally(() => pulse.stop());
    }

    /**
     * Load conversation history with attachments from database.
     * Builds ChatMessage[] with multimodal content blocks for attachments.
     *
     * LATENCY OPTIMIZATIONS (plans/agent-latency-optimization.md — Opts #3 and #8):
     *
     * Opt #3: This method now accepts conversationId directly instead of conversationDetailId.
     * Previously it loaded a ConversationDetail entity object just to extract its ConversationID
     * field — a redundant DB round-trip (~40ms) since the caller already has this information.
     * The caller (RunAIAgentFromConversationDetail) now loads the ConversationDetail once and
     * passes conversationId down.
     *
     * Opt #8: Switched from ResultType 'entity_object' to 'simple' with explicit Fields.
     * The history query only needs ID, Role, and Message from each ConversationDetail record.
     * Using 'entity_object' created full BaseEntity instances with getters/setters, dirty tracking,
     * and validation — none of which are needed for read-only history assembly. The 'simple' result
     * type returns plain JS objects, reducing per-record overhead (~30ms total savings).
     */
    private async loadConversationHistoryWithAttachments(
        conversationId: string,
        contextUser: UserInfo,
        maxMessages: number,
        provider: IMetadataProvider
    ): Promise<ChatMessage[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const attachmentService = GetAttachmentService();

        // Load recent conversation details (messages) for this conversation.
        // Only fetch the three fields we actually use — ID for attachment lookups,
        // Role for message routing, Message for content.
        const detailsResult = await rv.RunView<{ ID: string; Role: string; Message: string }>({
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ConversationID='${conversationId}'`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: maxMessages,
            Fields: ['ID', 'Role', 'Message'],
            ResultType: 'simple'
        }, contextUser);

        if (!detailsResult.Success || !detailsResult.Results) {
            throw new Error('Failed to load conversation history');
        }

        // Reverse to get chronological order (oldest first)
        const details = detailsResult.Results.reverse();

        // Get all message IDs for batch loading artifacts
        const messageIds = details.map(d => d.ID);

        // Batch load input artifacts for these messages. Since the backfill migration
        // (V202605271400__Backfill_Attachment_Artifacts) converted all legacy
        // ConversationDetailAttachment rows to artifact pairs, the artifact junction
        // is the single source of truth — no separate attachment query needed.
        const inputArtifactsByDetailId = await this.loadInputArtifactsBatch(messageIds, contextUser, provider);

        // Build ChatMessage array with attachments and input artifacts
        const messages: ChatMessage[] = [];

        for (const detail of details) {
            const role = this.mapDetailRoleToMessageRole(detail.Role);
            const validAttachments: AttachmentData[] = [];

            // Get input artifacts for this message — routing via RouteArtifact.
            const inputArtifacts = inputArtifactsByDetailId.get(detail.ID) || [];
            for (const artifactVersion of inputArtifacts) {
                const artifactMime = artifactVersion.MimeType || '';
                const fileName = artifactVersion.FileName ?? '';
                const ext = fileName.includes('.') ? fileName.split('.').pop() : undefined;
                const artifactType = ArtifactMetadataEngine.Instance.GetArtifactTypeByMimeType(artifactMime, ext);

                const decision = RouteArtifact({
                    typeDefault: artifactType?.DefaultDeliveryMode ?? 'ToolsOnly',
                    forceToolsOnly: artifactVersion.ForceToolsOnly,
                    mimeType: artifactMime,
                    sizeBytes: artifactVersion.ContentSizeBytes ?? 0,
                    inlineSizeCap: INLINE_SIZE_CAP,
                    modelSupportsModality: () => true,
                    modelName: '<resolver>',
                    artifactTypeName: artifactType?.Name ?? artifactMime,
                });

                if (artifactVersion.ContentMode === 'File' && artifactVersion.FileID) {
                    if (decision.delivery !== 'inline') {
                        if (decision.delivery === 'tools' && decision.annotation) {
                            LogStatus(`[RunAIAgentResolver] ${decision.annotation}`);
                        }
                        continue;
                    }
                    const fileContent = await this.downloadArtifactFileContent(artifactVersion, contextUser, provider);
                    if (fileContent) {
                        validAttachments.push({
                            type: ConversationUtility.GetAttachmentTypeFromMime(artifactMime),
                            mimeType: artifactMime || 'application/octet-stream',
                            fileName: artifactVersion.FileName || artifactVersion.Name || undefined,
                            sizeBytes: artifactVersion.ContentSizeBytes || undefined,
                            content: fileContent
                        });
                    }
                } else if (artifactVersion.Content) {
                    // Text-mode artifact (ContentMode = 'Text'). Honor the
                    // routing decision the same way as for file-mode.
                    if (decision.delivery !== 'inline') {
                        if (decision.delivery === 'tools' && decision.annotation) {
                            LogStatus(`[RunAIAgentResolver] ${decision.annotation}`);
                        }
                        continue;
                    }

                    const textContent = artifactVersion.Content;

                    // Media artifacts (image / audio / video) stored inline by
                    // the server hook arrive here as `Text` mode with a base64
                    // data URL in Content. We must route them as their native
                    // modality, not as text — otherwise the LLM sees the raw
                    // base64 as text content, can't process it, and either
                    // hallucinates or admits confusion. Use the artifact's
                    // declared MIME (not the wrapper string) so
                    // ConversationUtility builds the right content block type.
                    const mediaModality = artifactMime.startsWith('image/')
                        || artifactMime.startsWith('audio/')
                        || artifactMime.startsWith('video/');

                    if (mediaModality && textContent.startsWith('data:')) {
                        validAttachments.push({
                            type: ConversationUtility.GetAttachmentTypeFromMime(artifactMime),
                            mimeType: artifactMime,
                            fileName: artifactVersion.FileName || artifactVersion.Name || undefined,
                            sizeBytes: artifactVersion.ContentSizeBytes || undefined,
                            content: textContent,
                        });
                        continue;
                    }

                    const MAX_INLINE_ARTIFACT_CHARS = 10_000;
                    if (textContent.length > MAX_INLINE_ARTIFACT_CHARS) {
                        const preview = ArtifactToolManager.BuildInlinePreview(textContent, 5);
                        validAttachments.push({
                            type: 'Document' as AttachmentData['type'],
                            mimeType: 'text/plain',
                            fileName: undefined,
                            content: `[Artifact: ${artifactVersion.Name || 'Untitled'} — ${textContent.length.toLocaleString()} chars, accessible via artifact tools]\n\nPreview (first 5 rows per table):\n${preview}`
                        });
                    } else {
                        validAttachments.push({
                            type: 'Document' as AttachmentData['type'],
                            mimeType: 'text/plain',
                            fileName: artifactVersion.Name || 'artifact.txt',
                            content: `[Artifact: ${artifactVersion.Name || 'Untitled'}]\n\n${textContent}`
                        });
                    }
                }
            }

            // Build message content (with or without attachments)
            let content: ChatMessageContent;

            if (validAttachments.length > 0) {
                // Use ConversationUtility to build multimodal content blocks
                content = await ConversationUtility.BuildChatMessageContent(
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

    /**
     * Batch load input artifact versions for conversation details.
     * Returns a map of ConversationDetailID -> ArtifactVersion[]
     */
    private async loadInputArtifactsBatch(
        conversationDetailIds: string[],
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<Map<string, MJArtifactVersionEntity[]>> {
        const map = new Map<string, MJArtifactVersionEntity[]>();
        if (conversationDetailIds.length === 0) return map;

        const rv = RunView.FromMetadataProvider(provider);
        const idList = conversationDetailIds.map(id => `'${id}'`).join(',');

        // Load ConversationDetailArtifact links with Direction='Input'
        const linksResult = await rv.RunView<MJConversationDetailArtifactEntity>({
            EntityName: 'MJ: Conversation Detail Artifacts',
            ExtraFilter: `ConversationDetailID IN (${idList}) AND Direction = 'Input'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!linksResult.Success || !linksResult.Results || linksResult.Results.length === 0) {
            return map;
        }

        // Load the referenced artifact versions
        const versionIds = linksResult.Results.map(l => `'${l.ArtifactVersionID}'`).join(',');
        const versionsResult = await rv.RunView<MJArtifactVersionEntity>({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${versionIds})`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!versionsResult.Success || !versionsResult.Results) return map;

        // Build a lookup of version ID -> version entity
        const versionMap = new Map<string, MJArtifactVersionEntity>();
        for (const v of versionsResult.Results) {
            versionMap.set(v.ID, v);
        }

        // Group by conversation detail ID
        for (const link of linksResult.Results) {
            const version = versionMap.get(link.ArtifactVersionID);
            if (version) {
                const existing = map.get(link.ConversationDetailID) || [];
                existing.push(version);
                map.set(link.ConversationDetailID, existing);
            }
        }

        return map;
    }

    /**
     * Download file content from an artifact version's FileID.
     * Returns base64 data URL for extraction pipeline compatibility.
     * Uses the same downloadFileContent path as ConversationAttachmentService
     * to avoid Box driver path resolution issues.
     */
    private async downloadArtifactFileContent(
        artifactVersion: MJArtifactVersionEntity,
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<string | null> {
        if (!artifactVersion.FileID) return null;

        try {
            // Use the attachment service's downloadFileContent which uses GetObject directly
            const attachmentService = GetAttachmentService();
            const buffer = await attachmentService.DownloadFileContent(artifactVersion.FileID, contextUser, provider);
            if (!buffer) return null;

            const base64 = buffer.toString('base64');
            const mimeType = artifactVersion.MimeType || 'application/octet-stream';
            return `data:${mimeType};base64,${base64}`;
        } catch (err) {
            LogError(`Failed to download artifact file ${artifactVersion.FileID}: ${err}`);
            return null;
        }
    }

}