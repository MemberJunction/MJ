import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
import { UserPayload } from '../types.js';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ResolverBase } from '../generic/ResolverBase.js';

@ObjectType()
export class AIAgentRunResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    output?: string;

    @Field({ nullable: true })
    parsedResult?: string;

    @Field({ nullable: true })
    error?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;

    @Field({ nullable: true })
    tokensUsed?: number;

    @Field({ nullable: true })
    agentRunId?: string;

    @Field({ nullable: true })
    rawResult?: string;

    @Field({ nullable: true })
    nextStep?: string;
}

@Resolver()
export class RunAIAgentResolver extends ResolverBase {
    @Mutation(() => AIAgentRunResult)
    async RunAIAgent(
        @Arg('agentId') agentId: string,
        @Ctx() { userPayload }: { userPayload: UserPayload },
        @Arg('messages') messagesJson: string,
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
                    error: `Invalid JSON in messages: ${(parseError as Error).message}`,
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
                        error: `Invalid JSON in data: ${(parseError as Error).message}`,
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
                        error: `Invalid JSON in template data: ${(parseError as Error).message}`,
                        executionTimeMs: Date.now() - startTime
                    };
                }
            }

            // Get current user from payload
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return {
                    success: false,
                    error: 'Unable to determine current user',
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
                    error: `AI Agent with ID ${agentId} not found`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Check if agent is active
            if (agentEntity.Status !== 'Active') {
                return {
                    success: false,
                    error: `AI Agent "${agentEntity.Name}" is not active (Status: ${agentEntity.Status})`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Create AI agent runner and execute
            const agentRunner = new AgentRunner();
            
            // Execute the agent with the parsed messages and optional data
            const result = await agentRunner.RunAgent({
                agent: agentEntity,
                conversationMessages: parsedMessages,
                contextUser: currentUser,
                ...(Object.keys(parsedData).length > 0 && { data: parsedData }),
                ...(Object.keys(parsedTemplateData).length > 0 && { templateData: parsedTemplateData })
            });

            const executionTime = Date.now() - startTime;

            if (result.nextStep !== 'failed') {
                LogStatus(`=== AI AGENT RUN COMPLETED FOR: ${agentEntity.Name} (${executionTime}ms) ===`);
                
                return {
                    success: true,
                    output: result.rawResult,
                    parsedResult: typeof result.returnValue === 'string' ? result.returnValue : JSON.stringify(result.returnValue),
                    rawResult: result.rawResult,
                    executionTimeMs: executionTime,
                    nextStep: result.nextStep
                };
            } else {
                LogError(`AI Agent run failed for ${agentEntity.Name}: ${result.errorMessage}`);
                return {
                    success: false,
                    error: result.errorMessage,
                    executionTimeMs: executionTime,
                    nextStep: result.nextStep
                };
            }

        } catch (error) {
            const executionTime = Date.now() - startTime;
            LogError(`AI Agent run failed:`, undefined, error);
            return {
                success: false,
                error: (error as Error).message || 'Unknown error occurred',
                executionTimeMs: executionTime
            };
        }
    }
}