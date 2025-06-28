import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine, Subscription, Root, ResolverFilterData, ID } from 'type-graphql';
import { UserPayload } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ExecuteAgentResult } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { ResolverBase } from '../generic/ResolverBase.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

@ObjectType()
export class AIAgentRunResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    errorMessage?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;

    @Field()
    payload: string; // JSON serialized ExecuteAgentResult with scalars only
}

@ObjectType()
export class AgentExecutionProgress {
    @Field()
    currentStep: string;

    @Field()
    percentage: number;

    @Field()
    message: string;

    @Field({ nullable: true })
    agentName?: string;

    @Field({ nullable: true })
    agentType?: string;
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
            returnValue: result.payload,
            errorMessage: result.agentRun?.ErrorMessage,
            finalStep: result.agentRun?.FinalStep,
            cancelled: result.agentRun?.Status === 'Cancelled',
            cancellationReason: result.agentRun?.CancellationReason
        };

        // Safely extract agent run data using GetAll() for proper serialization
        if (result.agentRun) {
            // Use GetAll() to get the full serialized object including extended properties
            sanitized.agentRun = result.agentRun.GetAll();
        }

        // Note: executionTree is no longer part of ExecuteAgentResult
        // Step information is available through agentRun.Steps

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
    private async validateAgent(agentId: string, currentUser: any): Promise<AIAgentEntity> {
        // Use AIEngine to get cached agent data
        await AIEngine.Instance.Config(false, currentUser);
        
        // Find agent in cached collection
        const agentEntity = AIEngine.Instance.Agents.find((a: AIAgentEntity) => a.ID === agentId);
        
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
    private createProgressCallback(pubSub: PubSubEngine, sessionId: string, userPayload: UserPayload, agentRunIdRef: { id: string }) {
        return (progress: any) => {
            // Only publish progress for significant steps (not initialization noise)
            const significantSteps = ['prompt_execution', 'action_execution', 'subagent_execution', 'decision_processing'];
            if (!significantSteps.includes(progress.step)) {
                console.log(`🔇 Skipping noise progress: ${progress.step}`);
                return;
            }
            
            console.log('📡 Publishing progress update:', {
                step: progress.step,
                percentage: progress.percentage,
                message: progress.message,
                sessionId,
                agentRunId: agentRunIdRef.id
            });
            
            // Publish progress updates
            const progressMsg: AgentExecutionStreamMessage = {
                sessionId,
                agentRunId: agentRunIdRef.id,
                type: 'progress',
                progress: {
                    currentStep: progress.step,
                    percentage: progress.percentage,
                    message: progress.message,
                    agentName: (progress.metadata as any)?.agentName || undefined,
                    agentType: (progress.metadata as any)?.agentType || undefined
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
    private createStreamingCallback(pubSub: PubSubEngine, sessionId: string, userPayload: UserPayload, agentRunIdRef: { id: string }) {
        return (chunk: any) => {
            console.log('💬 Publishing streaming content:', {
                content: chunk.content.substring(0, 50) + '...',
                isComplete: chunk.isComplete,
                stepType: chunk.stepType,
                sessionId,
                agentRunId: agentRunIdRef.id
            });
            
            // Publish streaming content
            const streamMsg: AgentExecutionStreamMessage = {
                sessionId,
                agentRunId: agentRunIdRef.id,
                type: 'streaming',
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

    @Mutation(() => AIAgentRunResult)
    async RunAIAgent(
        @Arg('agentId') agentId: string,
        @Ctx() { userPayload }: { userPayload: UserPayload },
        @Arg('messages') messagesJson: string,
        @Arg('sessionId') sessionId: string,
        @PubSub() pubSub: PubSubEngine,
        @Arg('data', { nullable: true }) data?: string,
        @Arg('templateData', { nullable: true }) templateData?: string
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

            // Create AI agent runner
            const agentRunner = new AgentRunner();
            
            // Track agent run ID for streaming (use ref to update later)
            const agentRunIdRef = { id: 'pending' };

            console.log(`🚀 Starting agent execution with sessionId: ${sessionId}`);

            // Execute the agent with streaming callbacks
            const result = await agentRunner.RunAgent({
                agent: agentEntity,
                conversationMessages: parsedMessages,
                contextUser: currentUser,
                onProgress: this.createProgressCallback(pubSub, sessionId, userPayload, agentRunIdRef),
                onStreaming: this.createStreamingCallback(pubSub, sessionId, userPayload, agentRunIdRef)
            });

            // Update agent run ID once available
            if (result.agentRun) {
                agentRunIdRef.id = result.agentRun.ID;
            }

            const executionTime = Date.now() - startTime;

            // Publish final events
            this.publishFinalEvents(pubSub, sessionId, userPayload, result);

            // Create sanitized payload for JSON serialization
            const sanitizedResult = this.sanitizeAgentResult(result);
            const payload = JSON.stringify(sanitizedResult);

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
                payload
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
                payload: JSON.stringify(errorResult)
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
 
}