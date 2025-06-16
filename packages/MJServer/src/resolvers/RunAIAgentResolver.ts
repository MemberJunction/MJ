import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine, Subscription, Root, ResolverFilterData, ID } from 'type-graphql';
import { UserPayload } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
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

    @Field(() => [AgentExecutionStepSummary])
    executionChain: AgentExecutionStepSummary[];

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
            
            // Use AIEngine to get cached agent data
            const { AIEngine } = await import('@memberjunction/ai');
            await AIEngine.Instance.Config(false, currentUser);
            
            // Find agent in cached collection
            const agentEntity = AIEngine.Instance.Agents.find(a => a.ID === agentId);
            
            if (!agentEntity) {
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
                onProgress: (progress) => {
                    // Publish progress updates
                    const progressMsg: AgentExecutionStreamMessage = {
                        sessionId,
                        agentRunId: currentAgentRunId,
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
                    pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, { agentExecutionStream: progressMsg });
                },
                onStreaming: (chunk) => {
                    // Publish streaming content
                    const streamMsg: AgentExecutionStreamMessage = {
                        sessionId,
                        agentRunId: currentAgentRunId,
                        type: 'streaming',
                        streaming: {
                            content: chunk.content,
                            isPartial: !chunk.isComplete,
                            stepName: chunk.stepType,
                            agentName: chunk.modelName
                        },
                        timestamp: new Date()
                    };
                    pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, { agentExecutionStream: streamMsg });
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
                    currentStep: result.executionChain.length > 0 
                        ? result.executionChain[result.executionChain.length - 1].stepEntity.StepName
                        : 'Initializing',
                    executionChain: result.executionChain.map(step => ({
                        stepId: step.stepEntity.ID,
                        stepName: step.stepEntity.StepName,
                        agentName: undefined, // AIAgentRunStepEntity doesn't have AgentName field
                        agentType: step.executionType,
                        startTime: step.stepEntity.StartedAt,
                        endTime: step.stepEntity.CompletedAt || undefined,
                        status: step.stepEntity.Status,
                        result: step.stepEntity.OutputData || undefined
                    })),
                    partialOutput: result.returnValue || undefined
                };

                const partialMsg: AgentExecutionStreamMessage = {
                    sessionId,
                    agentRunId: result.agentRun.ID,
                    type: 'partial_result',
                    partialResult,
                    timestamp: new Date()
                };
                pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, { agentExecutionStream: partialMsg });
            }

            // Publish completion
            const completeMsg: AgentExecutionStreamMessage = {
                sessionId,
                agentRunId: result.agentRun?.ID || 'unknown',
                type: 'complete',
                timestamp: new Date()
            };
            pubSub.publish(AGENT_EXECUTION_STREAM_TOPIC, { agentExecutionStream: completeMsg });

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