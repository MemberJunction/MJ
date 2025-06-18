import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import { UserPayload } from '../types.js';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { AIPromptEntity } from '@memberjunction/core-entities';
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';
import { ResolverBase } from '../generic/ResolverBase.js';

@ObjectType()
export class AIPromptRunResult {
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
    promptRunId?: string;

    @Field({ nullable: true })
    rawResult?: string;

    @Field({ nullable: true })
    validationResult?: string;
}

@Resolver()
export class RunAIPromptResolver extends ResolverBase {
    @Mutation(() => AIPromptRunResult)
    async RunAIPrompt(
        @Arg('promptId') promptId: string,
        @Ctx() { userPayload }: { userPayload: UserPayload },
        @Arg('data', { nullable: true }) data?: string,
        @Arg('modelId', { nullable: true }) modelId?: string,
        @Arg('vendorId', { nullable: true }) vendorId?: string,
        @Arg('configurationId', { nullable: true }) configurationId?: string,
        @Arg('skipValidation', { nullable: true }) skipValidation?: boolean,
        @Arg('templateData', { nullable: true }) templateData?: string,
        @Arg('responseFormat', { nullable: true }) responseFormat?: string,
        @Arg('temperature', { nullable: true }) temperature?: number,
        @Arg('topP', { nullable: true }) topP?: number,
        @Arg('topK', () => Int, { nullable: true }) topK?: number,
        @Arg('minP', { nullable: true }) minP?: number,
        @Arg('frequencyPenalty', { nullable: true }) frequencyPenalty?: number,
        @Arg('presencePenalty', { nullable: true }) presencePenalty?: number,
        @Arg('seed', () => Int, { nullable: true }) seed?: number,
        @Arg('stopSequences', () => [String], { nullable: true }) stopSequences?: string[],
        @Arg('includeLogProbs', { nullable: true }) includeLogProbs?: boolean,
        @Arg('topLogProbs', () => Int, { nullable: true }) topLogProbs?: number,
        @Arg('messages', { nullable: true }) messages?: string
    ): Promise<AIPromptRunResult> {
        const startTime = Date.now();
        
        try {
            LogStatus(`=== RUNNING AI PROMPT FOR ID: ${promptId} ===`);

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
            
            // Load the AI prompt entity
            const promptEntity = await md.GetEntityObject<AIPromptEntity>('AI Prompts', currentUser);
            await promptEntity.Load(promptId);
            
            if (!promptEntity.IsSaved) {
                return {
                    success: false,
                    error: `AI Prompt with ID ${promptId} not found`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Check if prompt is active
            if (promptEntity.Status !== 'Active') {
                return {
                    success: false,
                    error: `AI Prompt "${promptEntity.Name}" is not active (Status: ${promptEntity.Status})`,
                    executionTimeMs: Date.now() - startTime
                };
            }

            // Create AI prompt runner and execute
            const promptRunner = new AIPromptRunner();
            
            // Build execution parameters
            const promptParams = new AIPromptParams();
            promptParams.prompt = promptEntity;
            promptParams.data = parsedData;
            promptParams.templateData = parsedTemplateData;
            promptParams.modelId = modelId;
            promptParams.vendorId = vendorId;
            promptParams.configurationId = configurationId;
            promptParams.contextUser = currentUser;
            promptParams.skipValidation = skipValidation || false;
            
            // Parse and set conversation messages if provided
            if (messages) {
                try {
                    promptParams.conversationMessages = JSON.parse(messages);
                } catch (parseError) {
                    // If parsing fails, treat as a simple user message
                    promptParams.conversationMessages = [{
                        role: 'user',
                        content: messages
                    }];
                }
            }
            
            // If responseFormat is provided, override the prompt's default response format
            if (responseFormat) {
                // We'll need to override the prompt's response format setting
                // This will be handled in the AIPromptRunner when it builds the ChatParams
                promptEntity.ResponseFormat = responseFormat as any;
            }

            // Build additional parameters for chat-specific settings
            const additionalParams: Record<string, any> = {};
            if (temperature != null) additionalParams.temperature = temperature;
            if (topP != null) additionalParams.topP = topP;
            if (topK != null) additionalParams.topK = topK;
            if (minP != null) additionalParams.minP = minP;
            if (frequencyPenalty != null) additionalParams.frequencyPenalty = frequencyPenalty;
            if (presencePenalty != null) additionalParams.presencePenalty = presencePenalty;
            if (seed != null) additionalParams.seed = seed;
            if (stopSequences != null) additionalParams.stopSequences = stopSequences;
            if (includeLogProbs != null) additionalParams.includeLogProbs = includeLogProbs;
            if (topLogProbs != null) additionalParams.topLogProbs = topLogProbs;

            // Only set additionalParameters if we have any
            if (Object.keys(additionalParams).length > 0) {
                promptParams.additionalParameters = additionalParams;
            }

            // Execute the prompt
            const result = await promptRunner.ExecutePrompt(promptParams);

            const executionTime = Date.now() - startTime;

            if (result.success) {
                LogStatus(`=== AI PROMPT RUN COMPLETED FOR: ${promptEntity.Name} (${executionTime}ms) ===`);
                
                return {
                    success: true,
                    output: result.rawResult,
                    parsedResult: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
                    rawResult: result.rawResult,
                    executionTimeMs: executionTime,
                    tokensUsed: result.tokensUsed,
                    promptRunId: result.promptRun?.ID,
                    validationResult: result.validationResult ? JSON.stringify(result.validationResult) : undefined
                };
            } else {
                LogError(`AI Prompt run failed for ${promptEntity.Name}: ${result.errorMessage}`);
                return {
                    success: false,
                    error: result.errorMessage,
                    executionTimeMs: executionTime,
                    promptRunId: result.promptRun?.ID
                };
            }

        } catch (error) {
            const executionTime = Date.now() - startTime;
            LogError(`AI Prompt run failed:`, undefined, error);
            return {
                success: false,
                error: (error as Error).message || 'Unknown error occurred',
                executionTimeMs: executionTime
            };
        }
    }
}