import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine, Subscription, Root, ResolverFilterData, ID } from 'type-graphql';
import { UserPayload } from '../types.js';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { AIAgentEntity, AIAgentRunEntity, AIAgentRunStepEntity } from '@memberjunction/core-entities';
import { AgentRunner, ExecuteAgentResult } from '@memberjunction/ai-agents';
import { ResolverBase } from '../generic/ResolverBase.js';

// Topic for agent execution streaming
export const AGENT_EXECUTION_STREAM_TOPIC = 'AGENT_EXECUTION_STREAM';

@ObjectType()
export class AIAgentRunResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    returnValue?: string;

    @Field({ nullable: true })
    errorMessage?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;

    @Field({ nullable: true })
    agentRunId?: string;

    @Field({ nullable: true })
    finalStep?: string;

    @Field({ nullable: true })
    cancelled?: boolean;

    @Field({ nullable: true })
    cancellationReason?: string;
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

@ObjectType()
export class AgentExecutionProgress {
    @Field()
    step: string;

    @Field()
    percentage: number;

    @Field()
    message: string;

    @Field({ nullable: true })
    metadata?: string; // JSON stringified metadata
}

@ObjectType()
export class AgentStreamingContent {
    @Field()
    content: string;

    @Field()
    isComplete: boolean;

    @Field({ nullable: true })
    stepType?: string;

    @Field({ nullable: true })
    stepEntityId?: string;

    @Field({ nullable: true })
    modelName?: string;
}

@ObjectType()
export class AgentPartialResult {
    @Field(() => ID)
    agentRunId: string;

    @Field()
    status: string;

    @Field()
    currentStepCount: number;

    @Field({ nullable: true })
    currentMessage?: string;

    @Field(() => [AgentExecutionStepSummary])
    executionSteps: AgentExecutionStepSummary[];
}

@ObjectType()
export class AgentExecutionStepSummary {
    @Field(() => ID)
    stepId: string;

    @Field()
    stepType: string;

    @Field()
    stepName: string;

    @Field()
    status: string;

    @Field({ nullable: true })
    startedAt?: Date;

    @Field({ nullable: true })
    completedAt?: Date;

    @Field({ nullable: true })
    durationMs?: number;
}

@Resolver()
export class RunAIAgentResolver extends ResolverBase {
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

            // Parse messages (required)
            let parsedMessages;
            try {
                parsedMessages = JSON.parse(messagesJson);
                if (!Array.isArray(parsedMessages)) {
                    throw new Error('Messages must be an array');
                }
            } catch (parseError) {
                return {
                    success: false,
                    errorMessage: `Invalid JSON in messages: ${(parseError as Error).message}`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Parse data contexts (JSON strings)
            let parsedData = {};
            let parsedTemplateData = {};
            
            if (data) {
                try {
                    parsedData = JSON.parse(data);
                } catch (parseError) {
                    return {
                        success: false,
                        errorMessage: `Invalid JSON in data: ${(parseError as Error).message}`,
                        executionTimeMs: Date.now() - startTime
                    };
                }
            }

            if (templateData) {
                try {
                    parsedTemplateData = JSON.parse(templateData);
                } catch (parseError) {
                    return {
                        success: false,
                        errorMessage: `Invalid JSON in template data: ${(parseError as Error).message}`,
                        executionTimeMs: Date.now() - startTime
                    };
                }
            }

            // Get current user from payload
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return {
                    success: false,
                    errorMessage: 'Unable to determine current user',
                    executionTimeMs: Date.now() - startTime
                };
            }
            
            const md = new Metadata();
            
            // Load the AI agent entity
            const agentEntity = await md.GetEntityObject<AIAgentEntity>('AI Agents', currentUser);
            await agentEntity.Load(agentId);
            
            if (!agentEntity.IsSaved) {
                return {
                    success: false,
                    errorMessage: `AI Agent with ID ${agentId} not found`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Check if agent is active
            if (agentEntity.Status !== 'Active') {
                return {
                    success: false,
                    errorMessage: `AI Agent "${agentEntity.Name}" is not active (Status: ${agentEntity.Status})`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Create AI agent runner and execute
            const agentRunner = new AgentRunner();
            
            // Track agent run ID for streaming
            let currentAgentRunId = 'pending';

            // Execute the agent with streaming callbacks that publish to GraphQL subscriptions
            const result = await agentRunner.RunAgent({
                agent: agentEntity,
                conversationMessages: parsedMessages,
                contextUser: currentUser,
                data: parsedData,
                templateData: parsedTemplateData,
                onProgress: (progress) => {
                    // Publish progress updates
                    pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, {
                        sessionId,
                        agentRunId: currentAgentRunId,
                        type: 'progress',
                        progress: {
                            step: progress.step,
                            percentage: progress.percentage,
                            message: progress.message,
                            metadata: progress.metadata ? JSON.stringify(progress.metadata) : undefined
                        },
                        timestamp: new Date()
                    } as AgentExecutionStreamMessage);
                },
                onStreaming: (chunk) => {
                    // Publish streaming content
                    pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, {
                        sessionId,
                        agentRunId: currentAgentRunId,
                        type: 'streaming',
                        streaming: {
                            content: chunk.content,
                            isComplete: chunk.isComplete,
                            stepType: chunk.stepType,
                            stepEntityId: chunk.stepEntityId,
                            modelName: chunk.modelName
                        },
                        timestamp: new Date()
                    } as AgentExecutionStreamMessage);
                }
            });

            // Update agent run ID once available
            if (result.agentRun) {
                currentAgentRunId = result.agentRun.ID;
            }

            const executionTime = Date.now() - startTime;

            // Publish partial results periodically (this would be done inside BaseAgent in a real implementation)
            if (result.agentRun) {
                const partialResult: AgentPartialResult = {
                    agentRunId: result.agentRun.ID,
                    status: result.agentRun.Status,
                    currentStepCount: result.executionChain.length,
                    currentMessage: result.executionChain.length > 0 
                        ? `Executing step ${result.executionChain.length}: ${result.executionChain[result.executionChain.length - 1].stepEntity.StepName}`
                        : 'Initializing...',
                    executionSteps: result.executionChain.map(step => ({
                        stepId: step.stepEntity.ID,
                        stepType: step.executionType,
                        stepName: step.stepEntity.StepName,
                        status: step.stepEntity.Status,
                        startedAt: step.stepEntity.StartedAt,
                        completedAt: step.stepEntity.CompletedAt,
                        durationMs: step.durationMs
                    }))
                };

                pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, {
                    sessionId,
                    agentRunId: result.agentRun.ID,
                    type: 'partial_result',
                    partialResult,
                    timestamp: new Date()
                } as AgentExecutionStreamMessage);
            }

            // Publish completion
            pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, {
                sessionId,
                agentRunId: result.agentRun?.ID || 'unknown',
                type: 'complete',
                timestamp: new Date()
            } as AgentExecutionStreamMessage);

            if (result.success) {
                LogStatus(`=== AI AGENT RUN COMPLETED FOR: ${agentEntity.Name} (${executionTime}ms) ===`);
                
                return {
                    success: true,
                    returnValue: typeof result.returnValue === 'string' ? result.returnValue : JSON.stringify(result.returnValue),
                    errorMessage: result.errorMessage,
                    executionTimeMs: executionTime,
                    agentRunId: result.agentRun?.ID,
                    finalStep: result.finalStep,
                    cancelled: result.cancelled,
                    cancellationReason: result.cancellationReason
                };
            } else {
                LogError(`AI Agent run failed for ${agentEntity.Name}: ${result.errorMessage}`);
                return {
                    success: false,
                    errorMessage: result.errorMessage,
                    executionTimeMs: executionTime,
                    agentRunId: result.agentRun?.ID,
                    finalStep: result.finalStep,
                    cancelled: result.cancelled,
                    cancellationReason: result.cancellationReason
                };
            }

        } catch (error) {
            const executionTime = Date.now() - startTime;
            LogError(`AI Agent run failed:`, undefined, error);
            return {
                success: false,
                errorMessage: (error as Error).message || 'Unknown error occurred',
                executionTimeMs: executionTime
            };
        }
    }

    @Subscription(() => AgentExecutionStreamMessage, {
        topics: AGENT_EXECUTION_STREAM_TOPIC,
        filter: ({ payload, args }: ResolverFilterData<AgentExecutionStreamMessage, { sessionId: string }>) => {
            return payload.sessionId === args.sessionId;
        }
    })
    agentExecutionStream(
        @Root() message: AgentExecutionStreamMessage,
        @Arg('sessionId') sessionId: string
    ): AgentExecutionStreamMessage {
        return message;
    }
}