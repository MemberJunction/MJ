import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, PubSub, PubSubEngine, Subscription, Root, ResolverFilterData, ID } from 'type-graphql';
import { UserPayload } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ExecuteAgentResult } from '@memberjunction/aiengine';
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
    /**
     * Sanitize ExecuteAgentResult for JSON serialization
     * Removes circular references and non-serializable objects
     */
    private sanitizeAgentResult(result: ExecuteAgentResult): any {
        const sanitized: any = {
            success: result.success,
            returnValue: result.returnValue,
            errorMessage: result.errorMessage,
            finalStep: result.finalStep,
            cancelled: result.cancelled,
            cancellationReason: result.cancellationReason
        };

        // Safely extract agent run data
        if (result.agentRun) {
            sanitized.agentRun = {
                ID: result.agentRun.ID,
                Status: result.agentRun.Status,
                StartedAt: result.agentRun.StartedAt,
                CompletedAt: result.agentRun.CompletedAt,
                Success: result.agentRun.Success,
                ErrorMessage: result.agentRun.ErrorMessage,
                AgentID: result.agentRun.AgentID,
                Result: result.agentRun.Result,
                TotalTokensUsed: result.agentRun.TotalTokensUsed,
                TotalCost: result.agentRun.TotalCost
            };
        }

        // Safely extract all agent run steps
        if (result.agentRunSteps && Array.isArray(result.agentRunSteps)) {
            sanitized.agentRunSteps = result.agentRunSteps.map(step => ({
                ID: step.ID,
                AgentRunID: step.AgentRunID,
                StepNumber: step.StepNumber,
                StepType: step.StepType,
                StepName: step.StepName,
                TargetID: step.TargetID,
                Status: step.Status,
                StartedAt: step.StartedAt,
                CompletedAt: step.CompletedAt,
                Success: step.Success,
                ErrorMessage: step.ErrorMessage,
                InputData: step.InputData,
                OutputData: step.OutputData
            }));
        }

        // Safely extract sub-agent runs (recursive)
        if (result.subAgentRuns && Array.isArray(result.subAgentRuns)) {
            sanitized.subAgentRuns = result.subAgentRuns.map(subRun => 
                this.sanitizeAgentResult(subRun)
            );
        }

        // Safely extract execution chain
        if (result.executionChain && Array.isArray(result.executionChain)) {
            sanitized.executionChain = result.executionChain.map(step => ({
                executionType: step.executionType,
                stepEntity: step.stepEntity ? {
                    ID: step.stepEntity.ID,
                    AgentRunID: step.stepEntity.AgentRunID,
                    StepNumber: step.stepEntity.StepNumber,
                    StepType: step.stepEntity.StepType,
                    StepName: step.stepEntity.StepName,
                    TargetID: step.stepEntity.TargetID,
                    Status: step.stepEntity.Status,
                    StartedAt: step.stepEntity.StartedAt,
                    CompletedAt: step.stepEntity.CompletedAt,
                    Success: step.stepEntity.Success,
                    ErrorMessage: step.stepEntity.ErrorMessage,
                    InputData: step.stepEntity.InputData,
                    OutputData: step.stepEntity.OutputData
                } : null
            }));
        }

        // Safely extract execution tree (new hierarchical structure)
        if (result.executionTree && Array.isArray(result.executionTree)) {
            sanitized.executionTree = this.sanitizeExecutionTree(result.executionTree);
        }

        return sanitized;
    }

    /**
     * Sanitize execution tree for JSON serialization
     */
    private sanitizeExecutionTree(nodes: any[]): any[] {
        return nodes.map(node => ({
            step: node.step ? {
                ID: node.step.ID,
                AgentRunID: node.step.AgentRunID,
                StepNumber: node.step.StepNumber,
                StepType: node.step.StepType,
                StepName: node.step.StepName,
                TargetID: node.step.TargetID,
                Status: node.step.Status,
                StartedAt: node.step.StartedAt,
                CompletedAt: node.step.CompletedAt,
                Success: node.step.Success,
                ErrorMessage: node.step.ErrorMessage,
                InputData: node.step.InputData,
                OutputData: node.step.OutputData
            } : null,
            inputData: node.inputData,
            outputData: node.outputData,
            executionType: node.executionType,
            startTime: node.startTime,
            endTime: node.endTime,
            durationMs: node.durationMs,
            nextStepDecision: node.nextStepDecision,
            children: node.children && node.children.length > 0 
                ? this.sanitizeExecutionTree(node.children) 
                : [],
            depth: node.depth,
            parentStepId: node.parentStepId,
            agentHierarchy: node.agentHierarchy
        }));
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
                LogError(`AI Agent run failed for ${agentEntity.Name}: ${result.errorMessage}`);
            }

            return {
                success: result.success,
                errorMessage: result.errorMessage || undefined,
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
            // Publish partial result with execution chain
            const partialResult: AgentPartialResult = {
                currentStep: result.executionChain.length > 0 
                    ? result.executionChain[result.executionChain.length - 1].stepEntity.StepName
                    : 'Completed',
                executionChain: result.executionChain.map(step => ({
                    stepId: step.stepEntity.ID,
                    stepName: step.stepEntity.StepName,
                    agentName: undefined,
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