import { Resolver, Mutation, Arg, Ctx, ObjectType, Field } from 'type-graphql';
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
        @Arg('templateData', { nullable: true }) templateData?: string
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