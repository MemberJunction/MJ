import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { ExecuteAgentParams, ExecuteAgentResult } from "@memberjunction/ai-core-plus";
import { SafeJSONParse } from "@memberjunction/global";

/**
 * Client for executing AI operations through GraphQL.
 * This class provides an easy way to execute AI prompts and agents from a client application.
 * 
 * The GraphQLAIClient follows the same naming convention as other GraphQL clients
 * in the MemberJunction ecosystem, such as GraphQLActionClient and GraphQLSystemUserClient.
 * 
 * @example
 * ```typescript
 * // Create the client
 * const aiClient = new GraphQLAIClient(graphQLProvider);
 * 
 * // Run an AI prompt
 * const promptResult = await aiClient.RunAIPrompt({
 *   promptId: "prompt-id",
 *   data: { context: "user data" },
 *   temperature: 0.7
 * });
 * 
 * // Run an AI agent
 * const agentResult = await aiClient.RunAIAgent({
 *   agentId: "agent-id",
 *   messages: [{ role: "user", content: "Hello" }],
 *   sessionId: "session-123"
 * });
 * ```
 */
export class GraphQLAIClient {
    /**
     * The GraphQLDataProvider instance used to execute GraphQL requests
     * @private
     */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLAIClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Run an AI prompt with the specified parameters.
     * 
     * This method invokes an AI prompt on the server through GraphQL and returns the result.
     * Parameters are automatically serialized as needed, and results are parsed for consumption.
     * 
     * @param params The parameters for running the AI prompt
     * @returns A Promise that resolves to a RunAIPromptResult object
     * 
     * @example
     * ```typescript
     * const result = await aiClient.RunAIPrompt({
     *   promptId: "prompt-id",
     *   data: { key: "value" },
     *   temperature: 0.7,
     *   topP: 0.9
     * });
     * 
     * if (result.success) {
     *   console.log('Output:', result.output);
     *   console.log('Parsed Result:', result.parsedResult);
     * } else {
     *   console.error('Error:', result.error);
     * }
     * ```
     */
    public async RunAIPrompt(params: RunAIPromptParams): Promise<RunAIPromptResult> {
        try {
            // Build the mutation with all possible parameters
            const mutation = gql`
                mutation RunAIPrompt(
                    $promptId: String!,
                    $data: String,
                    $overrideModelId: String,
                    $overrideVendorId: String,
                    $configurationId: String,
                    $skipValidation: Boolean,
                    $templateData: String,
                    $responseFormat: String,
                    $temperature: Float,
                    $topP: Float,
                    $topK: Int,
                    $minP: Float,
                    $frequencyPenalty: Float,
                    $presencePenalty: Float,
                    $seed: Int,
                    $stopSequences: [String!],
                    $includeLogProbs: Boolean,
                    $topLogProbs: Int,
                    $messages: String,
                    $rerunFromPromptRunID: String,
                    $systemPromptOverride: String
                ) {
                    RunAIPrompt(
                        promptId: $promptId,
                        data: $data,
                        overrideModelId: $overrideModelId,
                        overrideVendorId: $overrideVendorId,
                        configurationId: $configurationId,
                        skipValidation: $skipValidation,
                        templateData: $templateData,
                        responseFormat: $responseFormat,
                        temperature: $temperature,
                        topP: $topP,
                        topK: $topK,
                        minP: $minP,
                        frequencyPenalty: $frequencyPenalty,
                        presencePenalty: $presencePenalty,
                        seed: $seed,
                        stopSequences: $stopSequences,
                        includeLogProbs: $includeLogProbs,
                        topLogProbs: $topLogProbs,
                        messages: $messages,
                        rerunFromPromptRunID: $rerunFromPromptRunID,
                        systemPromptOverride: $systemPromptOverride
                    ) {
                        success
                        output
                        parsedResult
                        error
                        executionTimeMs
                        tokensUsed
                        promptRunId
                        rawResult
                        validationResult
                        chatResult
                    }
                }
            `;

            // Prepare variables, serializing complex objects to JSON strings
            const variables = this.preparePromptVariables(params);

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            // Process and return the result
            return this.processPromptResult(result);
        } catch (e) {
            return this.handlePromptError(e);
        }
    }

    /**
     * Prepares variables for the AI prompt mutation
     * @param params The prompt parameters
     * @returns The prepared variables for GraphQL
     * @private
     */
    private preparePromptVariables(params: RunAIPromptParams): Record<string, any> {
        const variables: Record<string, any> = {
            promptId: params.promptId
        };

        // Serialize complex objects to JSON strings
        if (params.data !== undefined) {
            variables.data = typeof params.data === 'object' ? JSON.stringify(params.data) : params.data;
        }
        if (params.templateData !== undefined) {
            variables.templateData = typeof params.templateData === 'object' ? JSON.stringify(params.templateData) : params.templateData;
        }
        if (params.messages !== undefined) {
            variables.messages = JSON.stringify(params.messages);
        }

        // Add optional scalar parameters
        if (params.overrideModelId !== undefined) variables.overrideModelId = params.overrideModelId;
        if (params.overrideVendorId !== undefined) variables.overrideVendorId = params.overrideVendorId;
        if (params.configurationId !== undefined) variables.configurationId = params.configurationId;
        if (params.skipValidation !== undefined) variables.skipValidation = params.skipValidation;
        if (params.responseFormat !== undefined) variables.responseFormat = params.responseFormat;
        if (params.temperature !== undefined) variables.temperature = params.temperature;
        if (params.topP !== undefined) variables.topP = params.topP;
        if (params.topK !== undefined) variables.topK = params.topK;
        if (params.minP !== undefined) variables.minP = params.minP;
        if (params.frequencyPenalty !== undefined) variables.frequencyPenalty = params.frequencyPenalty;
        if (params.presencePenalty !== undefined) variables.presencePenalty = params.presencePenalty;
        if (params.seed !== undefined) variables.seed = params.seed;
        if (params.stopSequences !== undefined) variables.stopSequences = params.stopSequences;
        if (params.includeLogProbs !== undefined) variables.includeLogProbs = params.includeLogProbs;
        if (params.topLogProbs !== undefined) variables.topLogProbs = params.topLogProbs;
        if (params.rerunFromPromptRunID !== undefined) variables.rerunFromPromptRunID = params.rerunFromPromptRunID;
        if (params.systemPromptOverride !== undefined) variables.systemPromptOverride = params.systemPromptOverride;

        return variables;
    }

    /**
     * Processes the result from the AI prompt mutation
     * @param result The raw GraphQL result
     * @returns The processed RunAIPromptResult
     * @private
     */
    private processPromptResult(result: any): RunAIPromptResult {
        if (!result?.RunAIPrompt) {
            throw new Error("Invalid response from server");
        }

        const promptResult = result.RunAIPrompt;

        // Parse JSON results if they exist
        let parsedResult: any;
        let validationResult: any;
        let chatResult: any;

        try {
            if (promptResult.parsedResult) {
                parsedResult = JSON.parse(promptResult.parsedResult);
            }
        } catch (e) {
            // Keep as string if parsing fails
            parsedResult = promptResult.parsedResult;
        }

        try {
            if (promptResult.validationResult) {
                validationResult = JSON.parse(promptResult.validationResult);
            }
        } catch (e) {
            validationResult = promptResult.validationResult;
        }

        try {
            if (promptResult.chatResult) {
                chatResult = JSON.parse(promptResult.chatResult);
            }
        } catch (e) {
            chatResult = promptResult.chatResult;
        }

        return {
            success: promptResult.success,
            output: promptResult.output,
            parsedResult,
            error: promptResult.error,
            executionTimeMs: promptResult.executionTimeMs,
            tokensUsed: promptResult.tokensUsed,
            promptRunId: promptResult.promptRunId,
            rawResult: promptResult.rawResult,
            validationResult,
            chatResult
        };
    }

    /**
     * Handles errors in the AI prompt execution
     * @param e The error
     * @returns An error result
     * @private
     */
    private handlePromptError(e: unknown): RunAIPromptResult {
        const error = e as Error;
        LogError(`Error running AI prompt: ${error}`);
        return {
            success: false,
            error: error.message || 'Unknown error occurred'
        };
    }

    /**
     * Run an AI agent with the specified parameters.
     *
     * This method invokes an AI agent on the server through GraphQL and returns the result.
     * The agent can maintain conversation context across multiple interactions.
     *
     * If a progress callback is provided in params.onProgress, this method will subscribe
     * to real-time progress updates from the GraphQL server and forward them to the callback.
     *
     * @param params The parameters for running the AI agent
     * @returns A Promise that resolves to a RunAIAgentResult object
     *
     * @example
     * ```typescript
     * const result = await aiClient.RunAIAgent({
     *   agentId: "agent-id",
     *   messages: [
     *     { role: "user", content: "What's the weather like?" }
     *   ],
     *   sessionId: "session-123",
     *   data: { location: "New York" },
     *   onProgress: (progress) => {
     *     console.log(`Progress: ${progress.message} (${progress.percentage}%)`);
     *   }
     * });
     *
     * if (result.success) {
     *   console.log('Response:', result.payload);
     *   console.log('Execution time:', result.executionTimeMs, 'ms');
     * } else {
     *   console.error('Error:', result.errorMessage);
     * }
     * ```
     */
    public async RunAIAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
        let subscription: any;

        try {
            // Subscribe to progress updates if callback provided
            if (params.onProgress) {
                subscription = this._dataProvider.PushStatusUpdates(this._dataProvider.sessionId)
                    .subscribe((message: string) => {
                        try {
                            console.log('[GraphQLAIClient] Received statusUpdate message:', message);
                            const parsed = JSON.parse(message);
                            console.log('[GraphQLAIClient] Parsed message:', parsed);

                            // Filter for ExecutionProgress messages from RunAIAgentResolver
                            if (parsed.resolver === 'RunAIAgentResolver' &&
                                parsed.type === 'ExecutionProgress' &&
                                parsed.status === 'ok' &&
                                parsed.data?.progress) {

                                console.log('[GraphQLAIClient] Forwarding progress to callback:', parsed.data.progress);
                                // Forward progress to callback with agentRunId in metadata
                                const progressWithRunId = {
                                    ...parsed.data.progress,
                                    metadata: {
                                        ...(parsed.data.progress.metadata || {}),
                                        agentRunId: parsed.data.agentRunId
                                    }
                                };
                                params.onProgress!(progressWithRunId);
                            } else {
                                console.log('[GraphQLAIClient] Message does not match filter criteria:', {
                                    resolver: parsed.resolver,
                                    type: parsed.type,
                                    status: parsed.status,
                                    hasProgress: !!parsed.data?.progress
                                });
                            }
                        } catch (e) {
                            // Log parsing errors for debugging
                            console.error('[GraphQLAIClient] Failed to parse progress message:', e, 'Raw message:', message);
                        }
                    });
            }

            // Build the mutation
            const mutation = gql`
                mutation RunAIAgent(
                    $agentId: String!,
                    $messages: String!,
                    $sessionId: String!,
                    $data: String,
                    $templateData: String,
                    $lastRunId: String,
                    $autoPopulateLastRunPayload: Boolean,
                    $configurationId: String,
                    $conversationDetailId: String
                ) {
                    RunAIAgent(
                        agentId: $agentId,
                        messages: $messages,
                        sessionId: $sessionId,
                        data: $data,
                        templateData: $templateData,
                        lastRunId: $lastRunId,
                        autoPopulateLastRunPayload: $autoPopulateLastRunPayload,
                        configurationId: $configurationId,
                        conversationDetailId: $conversationDetailId
                    ) {
                        success
                        errorMessage
                        executionTimeMs
                        result
                    }
                }
            `;

            // Prepare variables
            const variables = this.prepareAgentVariables(params);

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            // Process and return the result
            return this.processAgentResult(result.RunAIAgent?.result);
        } catch (e) {
            return this.handleAgentError(e);
        } finally {
            // Always clean up subscription
            if (subscription) {
                subscription.unsubscribe();
            }
        }
    }

    /**
     * Prepares variables for the AI agent mutation
     * @param params The agent parameters
     * @returns The prepared variables for GraphQL
     * @private
     */
    private prepareAgentVariables(params: ExecuteAgentParams): Record<string, any> {
        const variables: Record<string, any> = {
            agentId: params.agent.ID,
            messages: JSON.stringify(params.conversationMessages),
            sessionId: this._dataProvider.sessionId
        };

        // Serialize optional complex objects to JSON strings
        if (params.data !== undefined) {
            variables.data = typeof params.data === 'object' ? JSON.stringify(params.data) : params.data;
        } 

        // Add optional scalar parameters
        if (params.lastRunId !== undefined) variables.lastRunId = params.lastRunId;
        if (params.autoPopulateLastRunPayload !== undefined) variables.autoPopulateLastRunPayload = params.autoPopulateLastRunPayload;
        if (params.configurationId !== undefined) variables.configurationId = params.configurationId;
        if (params.conversationDetailId !== undefined) variables.conversationDetailId = params.conversationDetailId;

        return variables;
    }

    /**
     * Processes the result from the AI agent mutation
     * @param result The raw GraphQL result
     * @returns The processed RunAIAgentResult
     * @private
     */
    private processAgentResult(result: string): ExecuteAgentResult {
        return SafeJSONParse(result) as ExecuteAgentResult;        
    }

    /**
     * Handles errors in the AI agent execution
     * @param e The error
     * @returns An error result
     * @private
     */
    private handleAgentError(e: unknown): ExecuteAgentResult {
        const error = e as Error;
        LogError(`Error running AI agent: ${error}`);
        return {
            success: false,
            agentRun: undefined
        };
    }

    /**
     * Execute a simple prompt without requiring a stored AI Prompt entity.
     * This method is designed for interactive components that need quick AI responses.
     * 
     * @param params The parameters for the simple prompt execution
     * @returns A Promise that resolves to a SimplePromptResult object
     * 
     * @example
     * ```typescript
     * const result = await aiClient.ExecuteSimplePrompt({
     *   systemPrompt: "You are a helpful assistant",
     *   messages: [
     *     { message: "What's the weather?", role: "user" }
     *   ],
     *   modelPower: "medium"
     * });
     * 
     * if (result.success) {
     *   console.log('Response:', result.result);
     *   if (result.resultObject) {
     *     console.log('Parsed JSON:', JSON.parse(result.resultObject));
     *   }
     * }
     * ```
     */
    public async ExecuteSimplePrompt(params: ExecuteSimplePromptParams): Promise<SimplePromptResult> {
        try {
            const mutation = gql`
                mutation ExecuteSimplePrompt(
                    $systemPrompt: String!,
                    $messages: String,
                    $preferredModels: [String!],
                    $modelPower: String,
                    $responseFormat: String
                ) {
                    ExecuteSimplePrompt(
                        systemPrompt: $systemPrompt,
                        messages: $messages,
                        preferredModels: $preferredModels,
                        modelPower: $modelPower,
                        responseFormat: $responseFormat
                    ) {
                        success
                        result
                        resultObject
                        modelName
                        error
                        executionTimeMs
                    }
                }
            `;

            // Prepare variables
            const variables: Record<string, any> = {
                systemPrompt: params.systemPrompt
            };

            // Convert messages array to JSON string if provided
            if (params.messages && params.messages.length > 0) {
                variables.messages = JSON.stringify(params.messages);
            }

            if (params.preferredModels) {
                variables.preferredModels = params.preferredModels;
            }

            if (params.modelPower) {
                variables.modelPower = params.modelPower;
            }

            if (params.responseFormat) {
                variables.responseFormat = params.responseFormat;
            }

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.ExecuteSimplePrompt) {
                throw new Error("Invalid response from server");
            }

            const promptResult = result.ExecuteSimplePrompt;

            // Parse resultObject if it exists
            let resultObject: any;
            if (promptResult.resultObject) {
                try {
                    resultObject = JSON.parse(promptResult.resultObject);
                } catch (e) {
                    resultObject = promptResult.resultObject;
                }
            }

            return {
                success: promptResult.success,
                result: promptResult.result,
                resultObject,
                modelName: promptResult.modelName,
                error: promptResult.error,
                executionTimeMs: promptResult.executionTimeMs
            };

        } catch (e) {
            const error = e as Error;
            LogError(`Error executing simple prompt: ${error}`);
            return {
                success: false,
                modelName: 'Unknown',
                error: error.message || 'Unknown error occurred'
            };
        }
    }

    /**
     * Generate embeddings for text using local embedding models.
     * This method is designed for interactive components that need fast similarity calculations.
     * 
     * @param params The parameters for embedding generation
     * @returns A Promise that resolves to an EmbedTextResult object
     * 
     * @example
     * ```typescript
     * const result = await aiClient.EmbedText({
     *   textToEmbed: ["Hello world", "How are you?"],
     *   modelSize: "small"
     * });
     * 
     * console.log('Embeddings:', result.embeddings);
     * console.log('Model used:', result.modelName);
     * console.log('Dimensions:', result.vectorDimensions);
     * ```
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        try {
            const mutation = gql`
                mutation EmbedText(
                    $textToEmbed: [String!]!,
                    $modelSize: String!
                ) {
                    EmbedText(
                        textToEmbed: $textToEmbed,
                        modelSize: $modelSize
                    ) {
                        embeddings
                        modelName
                        vectorDimensions
                        error
                    }
                }
            `;

            // Prepare variables - handle both single string and array
            const textArray = Array.isArray(params.textToEmbed) 
                ? params.textToEmbed 
                : [params.textToEmbed];

            const variables = {
                textToEmbed: textArray,
                modelSize: params.modelSize
            };

            // Execute the mutation
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);

            if (!result?.EmbedText) {
                throw new Error("Invalid response from server");
            }

            const embedResult = result.EmbedText;

            // Return single embedding or array based on input
            const returnEmbeddings = Array.isArray(params.textToEmbed)
                ? embedResult.embeddings
                : embedResult.embeddings[0];

            return {
                embeddings: returnEmbeddings,
                modelName: embedResult.modelName,
                vectorDimensions: embedResult.vectorDimensions,
                error: embedResult.error
            };

        } catch (e) {
            const error = e as Error;
            LogError(`Error generating embeddings: ${error}`);
            return {
                embeddings: Array.isArray(params.textToEmbed) ? [] : [],
                modelName: 'Unknown',
                vectorDimensions: 0,
                error: error.message || 'Unknown error occurred'
            };
        }
    }
}

/**
 * Parameters for executing a simple prompt
 */
export interface ExecuteSimplePromptParams {
    /**
     * The system prompt to set context for the model
     */
    systemPrompt: string;
    
    /**
     * Optional message history
     */
    messages?: Array<{message: string, role: 'user' | 'assistant'}>;
    
    /**
     * Preferred model names to use
     */
    preferredModels?: string[];
    
    /**
     * Power level for model selection
     */
    modelPower?: 'lowest' | 'medium' | 'highest';
    
    /**
     * Response format (e.g., "json")
     */
    responseFormat?: string;
}

/**
 * Result from executing a simple prompt
 */
export interface SimplePromptResult {
    /**
     * Whether the execution was successful
     */
    success: boolean;
    
    /**
     * The text response from the model
     */
    result?: string;
    
    /**
     * Parsed JSON object if the response contained JSON
     */
    resultObject?: any;
    
    /**
     * Name of the model used
     */
    modelName: string;
    
    /**
     * Error message if execution failed
     */
    error?: string;
    
    /**
     * Execution time in milliseconds
     */
    executionTimeMs?: number;
}

/**
 * Parameters for generating text embeddings
 */
export interface EmbedTextParams {
    /**
     * Text or array of texts to embed
     */
    textToEmbed: string | string[];
    
    /**
     * Size of the embedding model to use
     */
    modelSize: 'small' | 'medium';
}

/**
 * Result from generating text embeddings
 */
export interface EmbedTextResult {
    /**
     * Single embedding vector or array of vectors
     */
    embeddings: number[] | number[][];
    
    /**
     * Name of the model used
     */
    modelName: string;
    
    /**
     * Number of dimensions in each vector
     */
    vectorDimensions: number;
    
    /**
     * Error message if generation failed
     */
    error?: string;
}

/**
 * Parameters for running an AI prompt
 */
export interface RunAIPromptParams {
    /**
     * The ID of the AI prompt to run
     */
    promptId: string;
    
    /**
     * Data context to pass to the prompt (will be JSON serialized)
     */
    data?: Record<string, any>;
    
    /**
     * Override the default model ID
     */
    overrideModelId?: string;
    
    /**
     * Override the default vendor ID
     */
    overrideVendorId?: string;
    
    /**
     * Configuration ID to use
     */
    configurationId?: string;
    
    /**
     * Skip validation of the prompt
     */
    skipValidation?: boolean;
    
    /**
     * Template data for prompt templating (will be JSON serialized)
     */
    templateData?: Record<string, any>;
    
    /**
     * Response format (e.g., "json", "text")
     */
    responseFormat?: string;
    
    /**
     * Temperature parameter for the model (0.0 to 1.0)
     */
    temperature?: number;
    
    /**
     * Top-p sampling parameter
     */
    topP?: number;
    
    /**
     * Top-k sampling parameter
     */
    topK?: number;
    
    /**
     * Min-p sampling parameter
     */
    minP?: number;
    
    /**
     * Frequency penalty parameter
     */
    frequencyPenalty?: number;
    
    /**
     * Presence penalty parameter
     */
    presencePenalty?: number;
    
    /**
     * Random seed for reproducible outputs
     */
    seed?: number;
    
    /**
     * Stop sequences for the model
     */
    stopSequences?: string[];
    
    /**
     * Include log probabilities in the response
     */
    includeLogProbs?: boolean;
    
    /**
     * Number of top log probabilities to include
     */
    topLogProbs?: number;
    
    /**
     * Conversation messages (will be JSON serialized)
     */
    messages?: Array<{ role: string; content: string }>;
    
    /**
     * ID of a previous prompt run to rerun from
     */
    rerunFromPromptRunID?: string;
    
    /**
     * Override the system prompt
     */
    systemPromptOverride?: string;
}

/**
 * Result from running an AI prompt
 */
export interface RunAIPromptResult {
    /**
     * Whether the prompt execution was successful
     */
    success: boolean;
    
    /**
     * The output from the prompt
     */
    output?: string;
    
    /**
     * Parsed result data (if applicable)
     */
    parsedResult?: any;
    
    /**
     * Error message if the execution failed
     */
    error?: string;
    
    /**
     * Execution time in milliseconds
     */
    executionTimeMs?: number;
    
    /**
     * Number of tokens used
     */
    tokensUsed?: number;
    
    /**
     * ID of the prompt run record
     */
    promptRunId?: string;
    
    /**
     * Raw result from the model
     */
    rawResult?: string;
    
    /**
     * Validation result data
     */
    validationResult?: any;
    
    /**
     * Chat completion result data
     */
    chatResult?: any;
}
 