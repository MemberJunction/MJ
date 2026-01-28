import { Resolver, Mutation, Query, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { DatabaseProviderBase, LogError, LogStatus, Metadata } from '@memberjunction/core';
import { AIPromptEntityExtended, AIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { AIEngine } from '@memberjunction/aiengine';
import { ChatParams, ChatMessage, ChatMessageRole, GetAIAPIKey, BaseLLM } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { GetReadWriteProvider } from '../util.js';

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

    @Field({ nullable: true })
    chatResult?: string;
}

@ObjectType()
export class SimplePromptResult {
    @Field()
    success: boolean;

    @Field({ nullable: true })
    result?: string;

    @Field({ nullable: true })
    resultObject?: string; // JSON stringified object

    @Field()
    modelName: string;

    @Field({ nullable: true })
    error?: string;

    @Field({ nullable: true })
    executionTimeMs?: number;
}

@ObjectType()
export class EmbedTextResult {
    @Field(() => [[Number]])
    embeddings: number[][];

    @Field()
    modelName: string;

    @Field(() => Int)
    vectorDimensions: number;

    @Field({ nullable: true })
    error?: string;
}

@Resolver()
export class RunAIPromptResolver extends ResolverBase {
    /**
     * Internal method that handles the core AI prompt execution logic.
     * This method is called by both the regular and system user resolvers.
     * @private
     */
    private async executeAIPrompt(
        p: DatabaseProviderBase,
        promptId: string,
        userPayload: UserPayload,
        data?: string,
        overrideModelId?: string,
        overrideVendorId?: string,
        configurationId?: string,
        skipValidation?: boolean,
        templateData?: string,
        responseFormat?: string,
        temperature?: number,
        topP?: number,
        topK?: number,
        minP?: number,
        frequencyPenalty?: number,
        presencePenalty?: number,
        seed?: number,
        stopSequences?: string[],
        includeLogProbs?: boolean,
        topLogProbs?: number,
        messages?: string,
        rerunFromPromptRunID?: string,
        systemPromptOverride?: string
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

            // Load the AI prompt entity
            const promptEntity = await p.GetEntityObject<AIPromptEntityExtended>('AI Prompts', currentUser);
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
            promptParams.configurationId = configurationId;
            promptParams.contextUser = currentUser;
            promptParams.skipValidation = skipValidation || false;
            promptParams.rerunFromPromptRunID = rerunFromPromptRunID;
            promptParams.systemPromptOverride = systemPromptOverride;
            
            // Set override if model or vendor ID provided
            if (overrideModelId || overrideVendorId) {
                promptParams.override = {
                    modelId: overrideModelId,
                    vendorId: overrideVendorId
                };
            }
            
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
                    validationResult: result.validationResult ? JSON.stringify(result.validationResult) : undefined,
                    chatResult: result.chatResult ? JSON.stringify(result.chatResult) : undefined
                };
            } else {
                LogError(`AI Prompt run failed for ${promptEntity.Name}: ${result.errorMessage}`);
                return {
                    success: false,
                    error: result.errorMessage,
                    executionTimeMs: executionTime,
                    promptRunId: result.promptRun?.ID,
                    chatResult: result.chatResult ? JSON.stringify(result.chatResult) : undefined
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

    /**
     * Public mutation for regular users to run AI prompts with authentication.
     */
    @Mutation(() => AIPromptRunResult)
    async RunAIPrompt(
        @Arg('promptId') promptId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('data', { nullable: true }) data?: string,
        @Arg('overrideModelId', { nullable: true }) overrideModelId?: string,
        @Arg('overrideVendorId', { nullable: true }) overrideVendorId?: string,
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
        @Arg('messages', { nullable: true }) messages?: string,
        @Arg('rerunFromPromptRunID', { nullable: true }) rerunFromPromptRunID?: string,
        @Arg('systemPromptOverride', { nullable: true }) systemPromptOverride?: string
    ): Promise<AIPromptRunResult> {
        // Check API key scope authorization for prompt execution
        await this.CheckAPIKeyScopeAuthorization('prompt:execute', promptId, userPayload);

        const p = GetReadWriteProvider(providers);
        return this.executeAIPrompt(
            p,
            promptId,
            userPayload,
            data,
            overrideModelId,
            overrideVendorId,
            configurationId,
            skipValidation,
            templateData,
            responseFormat,
            temperature,
            topP,
            topK,
            minP,
            frequencyPenalty,
            presencePenalty,
            seed,
            stopSequences,
            includeLogProbs,
            topLogProbs,
            messages,
            rerunFromPromptRunID,
            systemPromptOverride
        );
    }

    /**
     * System user query for running AI prompts with elevated privileges.
     * Requires the @RequireSystemUser decorator to ensure only system users can access.
     */
    @RequireSystemUser()
    @Query(() => AIPromptRunResult)
    async RunAIPromptSystemUser(
        @Arg('promptId') promptId: string,
        @Ctx() { userPayload, providers }: AppContext,
        @Arg('data', { nullable: true }) data?: string,
        @Arg('overrideModelId', { nullable: true }) overrideModelId?: string,
        @Arg('overrideVendorId', { nullable: true }) overrideVendorId?: string,
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
        @Arg('messages', { nullable: true }) messages?: string,
        @Arg('rerunFromPromptRunID', { nullable: true }) rerunFromPromptRunID?: string,
        @Arg('systemPromptOverride', { nullable: true }) systemPromptOverride?: string
    ): Promise<AIPromptRunResult> {
        const p = GetReadWriteProvider(providers);
        return this.executeAIPrompt(
            p,
            promptId,
            userPayload,
            data,
            overrideModelId,
            overrideVendorId,
            configurationId,
            skipValidation,
            templateData,
            responseFormat,
            temperature,
            topP,
            topK,
            minP,
            frequencyPenalty,
            presencePenalty,
            seed,
            stopSequences,
            includeLogProbs,
            topLogProbs,
            messages,
            rerunFromPromptRunID,
            systemPromptOverride
        );
    }

    /**
     * Helper method to select a model for simple prompt execution based on preferences or power level
     * @private
     */
    private async selectModelForSimplePrompt(
        preferredModels: string[] | undefined,
        modelPower: string,
        contextUser: any
    ): Promise<AIModelEntityExtended> {
        // Ensure AI Engine is configured
        await AIEngine.Instance.Config(false, contextUser);
        
        // Get all LLM models that have API keys
        const allModels = AIEngine.Instance.Models.filter(m => 
            m.AIModelType?.trim().toLowerCase() === 'llm' &&
            m.IsActive === true
        );
        
        // Filter to only models with valid API keys
        const modelsWithKeys: AIModelEntityExtended[] = [];
        for (const model of allModels) {
            const apiKey = GetAIAPIKey(model.DriverClass);
            if (apiKey && apiKey.trim().length > 0) {
                modelsWithKeys.push(model);
            }
        }
        
        if (modelsWithKeys.length === 0) {
            throw new Error('No AI models with valid API keys found');
        }
        
        // Try preferred models first if provided
        if (preferredModels && preferredModels.length > 0) {
            for (const preferred of preferredModels) {
                const model = modelsWithKeys.find(m => 
                    m.Name === preferred || 
                    m.APIName === preferred
                );
                if (model) {
                    LogStatus(`Selected preferred model: ${model.Name}`);
                    return model;
                }
            }
            LogStatus('No preferred models available, falling back to power selection');
        }
        
        // Sort by PowerRank for power-based selection
        modelsWithKeys.sort((a, b) => (b.PowerRank || 0) - (a.PowerRank || 0));
        
        let selectedModel: AIModelEntityExtended;
        switch (modelPower) {
            case 'lowest':
                selectedModel = modelsWithKeys[modelsWithKeys.length - 1];
                break;
            case 'highest':
                selectedModel = modelsWithKeys[0];
                break;
            case 'medium':
            default:
                const midIndex = Math.floor(modelsWithKeys.length / 2);
                selectedModel = modelsWithKeys[midIndex];
                break;
        }
        
        LogStatus(`Selected model by power (${modelPower || 'medium'}): ${selectedModel.Name}`);
        return selectedModel;
    }
    
    /**
     * Helper method to select an embedding model by size
     * @private
     */
    private selectEmbeddingModelBySize(modelSize: string): AIModelEntityExtended {
        const localModels = AIEngine.Instance.LocalEmbeddingModels;
        
        if (!localModels || localModels.length === 0) {
            throw new Error('No local embedding models available');
        }
        
        // Models are already sorted by PowerRank (highest first)
        switch (modelSize) {
            case 'small':
                return localModels[localModels.length - 1]; // Lowest power
            case 'medium':
            default:
                const midIndex = Math.floor(localModels.length / 2);
                return localModels[midIndex] || localModels[0];
        }
    }
    
    /**
     * Helper method to build chat messages from system prompt and optional message history
     * @private
     */
    private buildChatMessages(systemPrompt: string, messagesJson?: string): ChatMessage[] {
        const messages: ChatMessage[] = [];
        
        // Add system prompt
        if (systemPrompt && systemPrompt.trim().length > 0) {
            messages.push({
                role: ChatMessageRole.system,
                content: systemPrompt
            });
        }
        
        // Add message history if provided
        if (messagesJson) {
            try {
                const parsedMessages = JSON.parse(messagesJson);
                if (Array.isArray(parsedMessages)) {
                    for (const msg of parsedMessages) {
                        if (msg.message && msg.role) {
                            messages.push({
                                role: msg.role === 'user' ? ChatMessageRole.user : ChatMessageRole.assistant,
                                content: msg.message
                            });
                        }
                    }
                }
                else if (messagesJson?.length > 0) {
                    // messages maybe just has a simple string in it so add
                    // as a single message
                    messages.push({
                        role: ChatMessageRole.user,
                        content: messagesJson
                    });
                }
            } catch (e) {
                if (messagesJson?.length > 0) {
                    // messages maybe just has a simple string in it so add
                    // as a single message
                    messages.push({
                        role: ChatMessageRole.user,
                        content: messagesJson
                    });
                }
                LogError('Failed to parse messages JSON', undefined, e);
            }
        }
        
        return messages;
    }
    
    /**
     * Helper method to format simple prompt result
     * @private
     */
    private formatSimpleResult(chatResult: any, model: AIModelEntityExtended, executionTime: number): SimplePromptResult {
        if (!chatResult || !chatResult.success) {
            return {
                success: false,
                error: chatResult?.errorMessage || 'Unknown error occurred',
                modelName: model.Name,
                executionTimeMs: executionTime
            };
        }
        
        const resultContent = chatResult.data?.choices?.[0]?.message?.content || '';
        
        // Try to extract JSON from the result
        let resultObject: any = null;
        try {
            // First try to parse the entire result as JSON
            resultObject = JSON.parse(resultContent);
        } catch (e) {
            // Try to find JSON within the text
            const jsonMatch = resultContent.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
                try {
                    resultObject = JSON.parse(jsonMatch[0]);
                } catch (e2) {
                    // No valid JSON found
                }
            }
        }
        
        return {
            success: true,
            result: resultContent,
            resultObject: resultObject ? JSON.stringify(resultObject) : undefined,
            modelName: model.Name,
            executionTimeMs: executionTime
        };
    }
    
    /**
     * Execute a simple prompt without requiring a stored AI Prompt entity.
     * This is designed for interactive components that need quick AI responses.
     */
    @Mutation(() => SimplePromptResult)
    async ExecuteSimplePrompt(
        @Arg('systemPrompt') systemPrompt: string,
        @Ctx() { userPayload }: { userPayload: UserPayload },
        @Arg('messages', { nullable: true }) messages?: string,
        @Arg('preferredModels', () => [String], { nullable: true }) preferredModels?: string[],
        @Arg('modelPower', { nullable: true }) modelPower?: string,
        @Arg('responseFormat', { nullable: true }) responseFormat?: string
    ): Promise<SimplePromptResult> {
        // Check API key scope authorization for simple prompt execution
        await this.CheckAPIKeyScopeAuthorization('prompt:execute', '*', userPayload);

        const startTime = Date.now();

        try {
            LogStatus(`=== EXECUTING SIMPLE PROMPT ===`);
            
            // Get current user
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return {
                    success: false,
                    error: 'Unable to determine current user',
                    modelName: 'Unknown',
                    executionTimeMs: Date.now() - startTime
                };
            }
            
            // Select model based on preferences or power level
            const model = await this.selectModelForSimplePrompt(
                preferredModels,
                modelPower || 'medium',
                currentUser
            );
            
            // Build chat messages
            const chatMessages = this.buildChatMessages(systemPrompt, messages);
            
            if (chatMessages.length === 0) {
                return {
                    success: false,
                    error: 'No messages to send to model',
                    modelName: model.Name,
                    executionTimeMs: Date.now() - startTime
                };
            }
            
            // Create LLM instance
            const apiKey = GetAIAPIKey(model.DriverClass);
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
                BaseLLM,
                model.DriverClass,
                apiKey
            );
            
            if (!llm) {
                return {
                    success: false,
                    error: `Failed to create LLM instance for model ${model.Name}`,
                    modelName: model.Name,
                    executionTimeMs: Date.now() - startTime
                };
            }
            
            // Build chat parameters
            const chatParams = new ChatParams();
            chatParams.messages = chatMessages;
            chatParams.model = model.APIName;
            
            if (responseFormat) {
                // Cast to valid response format type
                chatParams.responseFormat = responseFormat as 'Any' | 'Text' | 'Markdown' | 'JSON' | 'ModelSpecific';
            }
            
            // Execute the chat completion
            const result = await llm.ChatCompletion(chatParams);
            
            const executionTime = Date.now() - startTime;
            LogStatus(`=== SIMPLE PROMPT COMPLETED (${executionTime}ms) ===`);
            
            // Format and return the result
            return this.formatSimpleResult(result, model, executionTime);
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            LogError('Simple prompt execution failed:', undefined, error);
            return {
                success: false,
                error: (error as Error).message || 'Unknown error occurred',
                modelName: 'Unknown',
                executionTimeMs: executionTime
            };
        }
    }
    
    /**
     * System user query for executing simple prompts with elevated privileges
     */
    @RequireSystemUser()
    @Query(() => SimplePromptResult)
    async ExecuteSimplePromptSystemUser(
        @Arg('systemPrompt') systemPrompt: string,
        @Ctx() { userPayload }: { userPayload: UserPayload },
        @Arg('messages', { nullable: true }) messages?: string,
        @Arg('preferredModels', () => [String], { nullable: true }) preferredModels?: string[],
        @Arg('modelPower', { nullable: true }) modelPower?: string,
        @Arg('responseFormat', { nullable: true }) responseFormat?: string
    ): Promise<SimplePromptResult> {
        // Reuse the same logic as the regular mutation
        return this.ExecuteSimplePrompt(systemPrompt, { userPayload }, messages, preferredModels, modelPower, responseFormat);
    }
    
    /**
     * Generate embeddings for text using local embedding models.
     * Designed for interactive components that need fast similarity calculations.
     */
    @Mutation(() => EmbedTextResult)
    async EmbedText(
        @Arg('textToEmbed', () => [String]) textToEmbed: string[],
        @Arg('modelSize') modelSize: string,
        @Ctx() { userPayload }: { userPayload: UserPayload }
    ): Promise<EmbedTextResult> {
        // Check API key scope authorization for embedding generation
        await this.CheckAPIKeyScopeAuthorization('embedding:generate', '*', userPayload);

        try {
            LogStatus(`=== GENERATING EMBEDDINGS for ${textToEmbed.length} text(s) ===`);
            
            // Get current user
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return {
                    embeddings: [],
                    modelName: 'Unknown',
                    vectorDimensions: 0,
                    error: 'Unable to determine current user'
                };
            }
            
            // Ensure AI Engine is configured
            await AIEngine.Instance.Config(false, currentUser);
            
            // Select embedding model by size
            const model = this.selectEmbeddingModelBySize(modelSize);
            
            LogStatus(`Using embedding model: ${model.Name}`);
            
            // Process embeddings
            const embeddings: number[][] = [];
            
            for (const text of textToEmbed) {
                if (!text || text.trim().length === 0) {
                    // Return zero vector for empty text
                    embeddings.push([]);
                    continue;
                }
                
                // Use AIEngine's EmbedText method
                const result = await AIEngine.Instance.EmbedText(model, text);
                
                if (result && result.vector && result.vector.length > 0) {
                    embeddings.push(result.vector);
                } else {
                    LogError(`Failed to generate embedding for text: ${text.substring(0, 50)}...`);
                    embeddings.push([]); // Add empty array for failed embeddings
                }
            }
            
            // Get vector dimensions from first successful embedding
            const vectorDimensions = embeddings.find(e => e.length > 0)?.length || 0;
            
            LogStatus(`=== EMBEDDINGS GENERATED: ${embeddings.length} vectors of ${vectorDimensions} dimensions ===`);
            
            return {
                embeddings,
                modelName: model.Name,
                vectorDimensions,
                error: undefined
            };
            
        } catch (error) {
            LogError('Embedding generation failed:', undefined, error);
            return {
                embeddings: [],
                modelName: 'Unknown',
                vectorDimensions: 0,
                error: (error as Error).message || 'Unknown error occurred'
            };
        }
    }
    
    /**
     * System user query for generating embeddings with elevated privileges
     */
    @RequireSystemUser()
    @Query(() => EmbedTextResult)
    async EmbedTextSystemUser(
        @Arg('textToEmbed', () => [String]) textToEmbed: string[],
        @Arg('modelSize') modelSize: string,
        @Ctx() { userPayload }: { userPayload: UserPayload }
    ): Promise<EmbedTextResult> {
        // Reuse the same logic as the regular mutation
        return this.EmbedText(textToEmbed, modelSize, { userPayload });
    }
}