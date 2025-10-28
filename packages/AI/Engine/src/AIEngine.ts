import { BaseLLM, BaseModel, BaseResult, ChatParams, ChatMessage, ChatMessageRole,
         ParallelChatCompletionsCallbacks, GetAIAPIKey,
         EmbedTextResult,
         EmbedTextParams,
         BaseEmbeddings} from "@memberjunction/ai";
import { SummarizeResult } from "@memberjunction/ai";
import { ClassifyResult } from "@memberjunction/ai";
import { ChatResult } from "@memberjunction/ai";
import { BaseEntity, BaseEntityEvent, LogError, Metadata, UserInfo, RunView } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import { AIActionEntity, AIModelEntityExtended, ActionEntity, AIAgentNoteEntity, AIAgentExampleEntity } from "@memberjunction/core-entities";
import { AIEngineBase, LoadBaseAIEngine } from "@memberjunction/ai-engine-base";
import { SimpleVectorService } from "@memberjunction/ai-vectors-memory";
import { AgentEmbeddingService } from "./services/AgentEmbeddingService";
import { ActionEmbeddingService } from "./services/ActionEmbeddingService";
import { AgentEmbeddingMetadata, AgentMatchResult } from "./types/AgentMatchResult";
import { ActionEmbeddingMetadata, ActionMatchResult } from "./types/ActionMatchResult";
import { NoteEmbeddingMetadata, NoteMatchResult } from "./types/NoteMatchResult";
import { ExampleEmbeddingMetadata, ExampleMatchResult } from "./types/ExampleMatchResult";


/**
 * @deprecated AI Actions are deprecated. Use AIPromptRunner with the new AI Prompt system instead.
 */
export class AIActionParams {
    actionId: string
    modelId: string
    modelName?: string
    systemPrompt?: string
    userPrompt?: string
}

/**
 * @deprecated Entity AI Actions are deprecated. Use AIPromptRunner with the new AI Prompt system instead.
 */
export class EntityAIActionParams extends AIActionParams {
    entityAIActionId: string
    entityRecord: BaseEntity
}

/**
 * Subclass of AIEngineBase that provides methods for interacting with AI models and executing
 * AI model tasks. 
 * @description ONLY USE ON SERVER-SIDE. For metadata only, use the AIEngineBase class which can be used anywhere.
 */
export class AIEngine extends AIEngineBase {
    public readonly EmbeddingModelTypeName: string = 'Embeddings';
    public readonly LocalEmbeddingModelVendorName: string = 'LocalEmbeddings';

    // Vector service for agent embeddings - initialized during AdditionalLoading
    private _agentVectorService: SimpleVectorService<AgentEmbeddingMetadata> | null = null;

    // Vector service for action embeddings - initialized during AdditionalLoading
    private _actionVectorService: SimpleVectorService<ActionEmbeddingMetadata> | null = null;

    // Vector service for note embeddings - initialized during AdditionalLoading
    private _noteVectorService: SimpleVectorService<NoteEmbeddingMetadata> | null = null;

    // Vector service for example embeddings - initialized during AdditionalLoading
    private _exampleVectorService: SimpleVectorService<ExampleEmbeddingMetadata> | null = null;

    // Actions loaded from database
    private _actions: ActionEntity[] = [];

    public static get Instance(): AIEngine {
        return super.getInstance<AIEngine>();
    }

    /**
     * Get the agent vector service for semantic search.
     * Initialized during AdditionalLoading - will be null before AIEngine.Config() completes.
     */
    public get AgentVectorService(): SimpleVectorService<AgentEmbeddingMetadata> | null {
        return this._agentVectorService;
    }

    /**
     * Get the action vector service for semantic search.
     * Initialized during AdditionalLoading - will be null before AIEngine.Config() completes.
     */
    public get ActionVectorService(): SimpleVectorService<ActionEmbeddingMetadata> | null {
        return this._actionVectorService;
    }

    /**
     * Get all available actions loaded from the database.
     * Loaded during Config() - will be empty before AIEngine.Config() completes.
     * NOTE: This returns ActionEntity (MJ Action system), not the deprecated AIActionEntity.
     * For deprecated AI Actions, see the inherited Actions property.
     */
    public get SystemActions(): ActionEntity[] {
        return this._actions;
    }

    /**
     * Prepares standard chat parameters with system and user messages.
     * 
     * @param userPrompt The user message/query to send to the model
     * @param systemPrompt Optional system prompt to set context/persona for the model
     * @returns Array of properly formatted chat messages
     */
    public PrepareChatMessages(userPrompt: string, systemPrompt?: string): ChatMessage[] {
        const messages: ChatMessage[] = [];
        if (systemPrompt && systemPrompt.length > 0) {
            messages.push({ role: ChatMessageRole.system, content: systemPrompt });
        }
        messages.push({ role: ChatMessageRole.user, content: userPrompt });
        return messages;
    }
    
    /**
     * Prepares an LLM model instance with the appropriate parameters.
     * This method handles common tasks needed before calling an LLM:
     * - Loading AI metadata if needed
     * - Selecting the appropriate model (user-provided or highest power)
     * - Getting the correct API key
     * - Creating the LLM instance
     * 
     * @param contextUser The user context for authentication and permissions
     * @param model Optional specific model to use, otherwise uses highest power LLM
     * @param apiKey Optional API key to use with the model
     * @returns Object containing the prepared model instance and model information
     */
    public async PrepareLLMInstance(
        contextUser: UserInfo, 
        model?: AIModelEntityExtended, 
        apiKey?: string
    ): Promise<{
        modelInstance: BaseLLM,
        modelToUse: AIModelEntityExtended
    }> {
        await AIEngine.Instance.Config(false, contextUser);
        const modelToUse = model ? model : await this.GetHighestPowerLLM(null, contextUser);
        const apiKeyToUse = apiKey ? apiKey : GetAIAPIKey(modelToUse.DriverClass);   
        const modelInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, modelToUse.DriverClass, apiKeyToUse);

        return { modelInstance, modelToUse };
    }

    /**
     * Executes a simple completion task using the provided parameters. The underlying code uses the MJ AI BaseLLM and related class infrastructure to execute the task. 
     * This is simply a convenience method to make it easier to execute a completion task without having to deal with the underlying infrastructure. For more control,
     * use the underlying classes directly.
     * 
     * @param userPrompt The user message/query to send to the model
     * @param contextUser The user context for authentication and permissions
     * @param systemPrompt Optional system prompt to set context/persona for the model
     * @param model Optional specific model to use, otherwise uses highest power LLM
     * @param apiKey Optional API key to use with the model
     * @returns The text response from the LLM
     * @throws Error if user prompt is not provided or if there are issues with model creation
     */
    public async SimpleLLMCompletion(userPrompt: string, contextUser: UserInfo, systemPrompt?: string, model?: AIModelEntityExtended, apiKey?: string): Promise<string> {
        try {
            if (!userPrompt || userPrompt.length === 0) {
                throw new Error('User prompt not provided.');
            }
            
            const { modelInstance, modelToUse } = await this.PrepareLLMInstance(
                contextUser, model, apiKey
            );

            // Prepare the chat messages
            const messages = this.PrepareChatMessages(userPrompt, systemPrompt);

            // Set up the chat parameters
            const params = new ChatParams();
            params.messages = messages;
            params.model = modelToUse.APIName;

            // Execute the LLM call
            const result = await modelInstance.ChatCompletion(params);

            if (result && result.success) {
                return result.data.choices[0].message.content;
            }
            else
                throw new Error(`Error executing LLM model ${modelToUse.Name} : ${result.errorMessage}`);
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Override AdditionalLoading to load Actions and compute embeddings.
     * Called automatically during AIEngine initialization after base loading completes.
     * @param contextUser - User context for any additional operations
     */
    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // Call parent first (sets up prompt-category associations, agent relationships, etc.)
        await super.AdditionalLoading(contextUser);

        // now load all the related embeddings and we can do this all in parallel as well
        // since they are independent of each other
        const promises = [];
        // Load Actions from database
        promises.push(this.loadActions(contextUser));

        // Compute agent embeddings using agents already loaded by base class
        promises.push(this.loadAgentEmbeddings());

        // Compute action embeddings using actions we just loaded
        promises.push(this.loadActionEmbeddings());

        // Load note embeddings
        promises.push(this.loadNoteEmbeddings(contextUser));

        // Load example embeddings
        promises.push(this.loadExampleEmbeddings(contextUser));

        await Promise.all(promises);
    }

    /**
     * Load embeddings for all agents.
     * Uses agents already loaded by AIEngineBase - no database round trip needed.
     * @private
     */
    private async loadAgentEmbeddings(): Promise<void> {
        const startTime = Date.now();
        console.log('AIEngine: Loading agent embeddings...');

        try {
            // Use agents already loaded by base class
            const agents = this.Agents;  // Already filtered, cached, ready!

            if (!agents || agents.length === 0) {
                console.log('AIEngine: No agents found to generate embeddings for');
                return;
            }

            // Generate embeddings using static utility method
            const entries = await AgentEmbeddingService.GenerateAgentEmbeddings(
                agents,
                (text) => this.EmbedTextLocal(text)  // Pass our own embed method
            );

            // Load into vector service
            this._agentVectorService = new SimpleVectorService();
            this._agentVectorService.LoadVectors(entries);

            const duration = Date.now() - startTime;
            console.log(`AIEngine: Loaded embeddings for ${entries.length} agents in ${duration}ms`);

        } catch (error) {
            console.error(`Failed to load agent embeddings: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw - allow AIEngine to continue loading even if embeddings fail
        }
    }

    /**
     * Load Actions from database.
     * Called during AdditionalLoading to populate the Actions list.
     * @private
     */
    private async loadActions(contextUser?: UserInfo): Promise<void> {
        const startTime = Date.now();
        console.log('AIEngine: Loading actions...');

        try {
            const rv = new RunView();
            const result = await rv.RunView<ActionEntity>({
                EntityName: 'Actions',
                ExtraFilter: "Status = 'Active'",
                OrderBy: 'Name',
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results) {
                this._actions = result.Results;
                const duration = Date.now() - startTime;
                console.log(`AIEngine: Loaded ${this._actions.length} actions in ${duration}ms`);
            } else {
                console.error(`Failed to load actions: ${result.ErrorMessage || 'Unknown error'}`);
                this._actions = [];
            }

        } catch (error) {
            console.error(`Error loading actions: ${error instanceof Error ? error.message : String(error)}`);
            this._actions = [];
        }
    }

    /**
     * Load embeddings for all actions.
     * Uses actions loaded in loadActions() - no additional database round trip needed.
     * @private
     */
    private async loadActionEmbeddings(): Promise<void> {
        const startTime = Date.now();
        console.log('AIEngine: Loading action embeddings...');

        try {
            // Use actions loaded in loadActions()
            const actions = this._actions;

            if (!actions || actions.length === 0) {
                console.log('AIEngine: No actions found to generate embeddings for');
                return;
            }

            // Generate embeddings using static utility method
            const entries = await ActionEmbeddingService.GenerateActionEmbeddings(
                actions,
                (text) => this.EmbedTextLocal(text)  // Pass our own embed method
            );

            // Load into vector service
            this._actionVectorService = new SimpleVectorService();
            this._actionVectorService.LoadVectors(entries);

            const duration = Date.now() - startTime;
            console.log(`AIEngine: Loaded embeddings for ${entries.length} actions in ${duration}ms`);

        } catch (error) {
            console.error(`Failed to load action embeddings: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw - allow AIEngine to continue loading even if embeddings fail
        }
    }

    /**
     * Load note embeddings from database and build vector service.
     * Only loads active notes with embeddings already generated.
     * @private
     */
    private async loadNoteEmbeddings(contextUser?: UserInfo): Promise<void> {
        const startTime = Date.now();
        console.log('AIEngine: Loading note embeddings...');

        try {
            const rv = this.RunViewProviderToUse;
            const result = await rv.RunView<AIAgentNoteEntity>({
                EntityName: 'AI Agent Notes',
                ExtraFilter: `Status='Active' AND EmbeddingVector IS NOT NULL`,
                ResultType: 'entity_object'
            }, contextUser);

            if (!result.Success) {
                console.error('Failed to load agent notes:', result.ErrorMessage);
                return;
            }

            const notes = result.Results || [];
            if (notes.length === 0) {
                console.log('AIEngine: No notes with embeddings found');
                return;
            }

            const entries = notes.map(note => ({
                key: note.ID,
                vector: JSON.parse(note.EmbeddingVector!),
                metadata: {
                    id: note.ID,
                    agentId: note.AgentID,
                    userId: note.UserID,
                    companyId: note.CompanyID,
                    type: note.Type,
                    noteText: note.Note!,
                    noteEntity: note
                }
            }));

            this._noteVectorService = new SimpleVectorService();
            this._noteVectorService.LoadVectors(entries);

            const duration = Date.now() - startTime;
            console.log(`AIEngine: Loaded embeddings for ${entries.length} notes in ${duration}ms`);

        } catch (error) {
            console.error(`Failed to load note embeddings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Load example embeddings from database and build vector service.
     * Only loads active examples with embeddings already generated.
     * @private
     */
    private async loadExampleEmbeddings(contextUser?: UserInfo): Promise<void> {
        const startTime = Date.now();
        console.log('AIEngine: Loading example embeddings...');

        try {
            const rv = this.RunViewProviderToUse;
            const result = await rv.RunView<AIAgentExampleEntity>({
                EntityName: 'AI Agent Examples',
                ExtraFilter: `Status='Active' AND EmbeddingVector IS NOT NULL`,
                ResultType: 'entity_object'
            }, contextUser);

            if (!result.Success) {
                console.error('Failed to load agent examples:', result.ErrorMessage);
                return;
            }

            const examples = result.Results || [];
            if (examples.length === 0) {
                console.log('AIEngine: No examples with embeddings found');
                return;
            }

            const entries = examples.map(example => ({
                key: example.ID,
                vector: JSON.parse(example.EmbeddingVector!),
                metadata: {
                    id: example.ID,
                    agentId: example.AgentID,
                    userId: example.UserID,
                    companyId: example.CompanyID,
                    type: example.Type,
                    exampleInput: example.ExampleInput,
                    exampleOutput: example.ExampleOutput,
                    successScore: example.SuccessScore,
                    exampleEntity: example
                }
            }));

            this._exampleVectorService = new SimpleVectorService();
            this._exampleVectorService.LoadVectors(entries);

            const duration = Date.now() - startTime;
            console.log(`AIEngine: Loaded embeddings for ${entries.length} examples in ${duration}ms`);

        } catch (error) {
            console.error(`Failed to load example embeddings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Override ProcessEntityEvent to refresh note/example embeddings when they change.
     * Uses 15 second debounce configured in AdditionalLoading.
     */
    protected override async ProcessEntityEvent(event: BaseEntityEvent): Promise<void> {
        // Call base implementation first
        await super.ProcessEntityEvent(event);

        // Refresh embeddings if notes/examples changed
        const entityName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();

        if (entityName === 'ai agent notes') {
            await this.loadNoteEmbeddings(this.ContextUser);
        } else if (entityName === 'ai agent examples') {
            await this.loadExampleEmbeddings(this.ContextUser);
        }
    }

    /**
     * Find agents similar to a task description using semantic search.
     * Convenience method that uses the cached agent vector service.
     *
     * @param taskDescription - The task description to match against agent capabilities
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching agents sorted by similarity score (highest first)
     * @throws Error if agent embeddings not loaded or task description empty
     */
    public async FindSimilarAgents(
        taskDescription: string,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): Promise<AgentMatchResult[]> {
        if (!this._agentVectorService) {
            throw new Error('Agent embeddings not loaded. Ensure AIEngine.Config() has completed.');
        }

        return AgentEmbeddingService.FindSimilarAgents(
            this._agentVectorService,
            taskDescription,
            (text) => this.EmbedTextLocal(text),
            topK,
            minSimilarity
        );
    }

    /**
     * Find actions similar to a task description using semantic search.
     * Convenience method that uses the cached action vector service.
     *
     * @param taskDescription - The task description to match against action capabilities
     * @param topK - Maximum number of results to return (default: 10)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching actions sorted by similarity score (highest first)
     * @throws Error if action embeddings not loaded or task description empty
     */
    public async FindSimilarActions(
        taskDescription: string,
        topK: number = 10,
        minSimilarity: number = 0.5
    ): Promise<ActionMatchResult[]> {
        if (!this._actionVectorService) {
            throw new Error('Action embeddings not loaded. Ensure AIEngine.Config() has completed.');
        }

        return ActionEmbeddingService.FindSimilarActions(
            this._actionVectorService,
            taskDescription,
            (text) => this.EmbedTextLocal(text),
            topK,
            minSimilarity
        );
    }

    /**
     * Find notes similar to query text using semantic search.
     * Searches across agent notes and returns matches filtered by scope.
     *
     * @param queryText - The text to search for similar notes
     * @param agentId - Optional agent ID to filter results
     * @param userId - Optional user ID to filter results
     * @param companyId - Optional company ID to filter results
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching notes sorted by similarity score (highest first)
     * @throws Error if note embeddings not loaded or query text empty
     */
    public async FindSimilarAgentNotes(
        queryText: string,
        agentId?: string,
        userId?: string,
        companyId?: string,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): Promise<NoteMatchResult[]> {
        if (!this._noteVectorService) {
            return []; // this is a valid state, we don't create the vector service unless there are notes in the DB
        }

        if (!queryText || queryText.trim().length === 0) {
            throw new Error('queryText cannot be empty');
        }

        // Generate query embedding
        const queryEmbedding = await this.EmbedTextLocal(queryText);
        if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
            throw new Error('Failed to generate embedding for query text');
        }

        // Search with extra headroom, then filter
        const results = this._noteVectorService.FindNearest(
            queryEmbedding.result.vector,
            topK * 3,
            minSimilarity
        );

        // Filter by scope and similarity
        const filtered = results
            .filter(r => r.score >= minSimilarity)
            .filter(r => {
                // Apply scoping filters - null means "matches anything"
                if (agentId && r.metadata.agentId && r.metadata.agentId !== agentId) return false;
                if (userId && r.metadata.userId && r.metadata.userId !== userId) return false;
                if (companyId && r.metadata.companyId && r.metadata.companyId !== companyId) return false;
                return true;
            })
            .slice(0, topK);

        return filtered.map(r => ({
            note: r.metadata.noteEntity,
            similarity: r.score
        }));
    }

    /**
     * Find examples similar to query text using semantic search.
     * Searches across agent examples and returns matches filtered by scope.
     *
     * @param queryText - The text to search for similar examples
     * @param agentId - Optional agent ID to filter results
     * @param userId - Optional user ID to filter results
     * @param companyId - Optional company ID to filter results
     * @param topK - Maximum number of results to return (default: 3)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching examples sorted by similarity score (highest first)
     * @throws Error if example embeddings not loaded or query text empty
     */
    public async FindSimilarAgentExamples(
        queryText: string,
        agentId?: string,
        userId?: string,
        companyId?: string,
        topK: number = 3,
        minSimilarity: number = 0.5
    ): Promise<ExampleMatchResult[]> {
        if (!this._exampleVectorService) {
            return []; // this is a valid state, we don't create the vector service unless there are examples in the DB
        }

        if (!queryText || queryText.trim().length === 0) {
            throw new Error('queryText cannot be empty');
        }

        // Generate query embedding
        const queryEmbedding = await this.EmbedTextLocal(queryText);
        if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
            throw new Error('Failed to generate embedding for query text');
        }

        // Search with extra headroom, then filter
        const results = this._exampleVectorService.FindNearest(
            queryEmbedding.result.vector,
            topK * 3,
            minSimilarity
        );

        // Filter by scope and similarity
        const filtered = results
            .filter(r => r.score >= minSimilarity)
            .filter(r => {
                // Apply scoping filters
                if (agentId && r.metadata.agentId !== agentId) return false;
                if (userId && r.metadata.userId && r.metadata.userId !== userId) return false;
                if (companyId && r.metadata.companyId && r.metadata.companyId !== companyId) return false;
                return true;
            })
            .slice(0, topK);

        return filtered.map(r => ({
            example: r.metadata.exampleEntity,
            similarity: r.score
        }));
    }

    /**
     * Executes multiple parallel chat completions with the same model but potentially different parameters.
     * This is useful for:
     * - Generating multiple variations with different parameters (temperature, etc.)
     * - Getting multiple responses to compare or select from
     * - Improving reliability by sending the same request multiple times
     * 
     * @param userPrompt The user's message/question to send to the model
     * @param contextUser The user context for authentication and logging
     * @param systemPrompt Optional system prompt to set the context/persona
     * @param iterations Number of parallel completions to run (default: 3)
     * @param temperatureIncrement The amount to increment temperature for each iteration (default: 0.1)
     * @param baseTemperature The starting temperature value (default: 0.7)
     * @param model Optional specific model to use, otherwise uses highest power LLM
     * @param apiKey Optional API key to use with the model
     * @param callbacks Optional callbacks for monitoring progress
     * @returns Array of ChatResult objects, one for each parallel completion
     * @throws Error if user prompt is not provided, iterations < 1, or if there are issues with model creation
     */
    public async ParallelLLMCompletions(
        userPrompt: string, 
        contextUser: UserInfo, 
        systemPrompt?: string,
        iterations: number = 3,
        temperatureIncrement: number = 0.1,
        baseTemperature: number = 0.7,
        model?: AIModelEntityExtended,
        apiKey?: string,
        callbacks?: ParallelChatCompletionsCallbacks
    ): Promise<ChatResult[]> {
        try {
            if (!userPrompt || userPrompt.length === 0) {
                throw new Error('User prompt not provided.');
            }
            
            if (iterations < 1) {
                throw new Error('Iterations must be at least 1');
            }

            // Get the model instance
            const { modelInstance, modelToUse } = await this.PrepareLLMInstance(
                contextUser, model, apiKey
            );

            // Prepare the messages that will be common to all requests
            const messages = this.PrepareChatMessages(userPrompt, systemPrompt);

            // Create parameter arrays for each completion with varying temperatures
            const paramsArray: ChatParams[] = Array(iterations).fill(0).map((_, i) => {
                const params = new ChatParams();
                params.messages = [...messages]; // Clone the messages array
                params.model = modelToUse.APIName;
                params.temperature = baseTemperature + (i * temperatureIncrement);
                return params;
            });

            // Run all completions in parallel
            return await modelInstance.ChatCompletions(paramsArray, callbacks);
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Returns an array of the local embedding models, sorted with the highest power models first
     */
    public get LocalEmbeddingModels(): AIModelEntityExtended[] {
        // Find an embedding model - prioritize models with AIModelType = 'Embedding'
        const embeddingModels = AIEngine.Instance.Models.filter(m =>
            m.AIModelType?.trim().toLowerCase() === AIEngine.Instance.EmbeddingModelTypeName.toLowerCase() &&
            m.Vendor && m.Vendor.trim().toLowerCase() === AIEngine.Instance.LocalEmbeddingModelVendorName.toLowerCase() // Only use local embedding models
        );
        // Sort by PowerRank (higher is better) and select the most powerful embedding model
        const sortedModels = embeddingModels.sort((a, b) => (b.PowerRank || 0) - (a.PowerRank || 0));

        return sortedModels;
    }

    /**
     * Returns the highest power local embedding model
     */
    public get HighestPowerLocalEmbeddingModel(): AIModelEntityExtended {
        const models = this.LocalEmbeddingModels;
        return models && models.length > 0 ? models[0] : null;
    }

    /**
     * Helper method that generates an embedding for the given text using the highest power local embedding model.
     * @param text 
     * @returns 
     */
    public async EmbedTextLocal(text: string): Promise<{result: EmbedTextResult, model: AIModelEntityExtended}> {
        const model = this.HighestPowerLocalEmbeddingModel;
        if (!model) {
            console.warn('No local embedding model found. Cannot generate embedding.');
            return null;
        }
        const result = await this.EmbedText(model, text);
        return { result, model };
    }

    /**
     * Helper method to instantiate a class instance for the given model and calculate an embedding
     * vector from the provided text.
     * @param model 
     * @param text 
     * @param apiKey Optional parameter, used only for remote models, local models generally don't require an API key
     * @returns 
     */
    public async EmbedText(model: AIModelEntityExtended, text: string, apiKey?: string): Promise<EmbedTextResult> {
        // Implementation for embedding text using the specified model
            // Generate the embedding for the description
        const params: EmbedTextParams = {
            text: text,
            model: model.APIName
        };

        // Create the embedding class instance
        const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
            BaseEmbeddings, 
            model.DriverClass, 
            apiKey 
        );
        
        if (!embedding) {
            console.warn(`Failed to create embedding instance for model ${model.Name}. Skipping embedding generation.`);
            return null;
        }

        const result = await embedding.EmbedText(params);
        return result;
    }
 

    /**
     * Returns the lowest power local embedding model
     */
    public get LowestPowerLocalEmbeddingModel(): AIModelEntityExtended {
        const models = this.LocalEmbeddingModels;
        return models && models.length > 0 ? models[models.length - 1] : null;
    }

    /**
     * @deprecated Entity AI Actions are deprecated. Use AIPromptRunner with the new AI Prompt system instead.
     * This method will be removed in a future version.
     */
    public async ExecuteEntityAIAction(params: EntityAIActionParams): Promise<BaseResult> {
        const startTime = new Date();
        try {
            // this method will execute the requested action but it will preprocess and post process based on the entity record provided and the
            // instructions within the entity AI Action record
            const entityAction = AIEngine.Instance.EntityAIActions.find(ea => ea.ID === params.entityAIActionId);
            if (!entityAction)
                throw new Error(`Entity AI Action ${params.entityAIActionId} not found.`);

            const action = AIEngine.Instance.Actions.find(a => a.ID === entityAction.AIActionID);
            if (!action)
                throw new Error(`Action ${entityAction.AIActionID} not found, from the EntityAIAction ${params.entityAIActionId}.`);

            if (entityAction.SkipIfOutputFieldNotEmpty && 
                entityAction.OutputType.trim().toLowerCase() === 'field') {
                const val = params.entityRecord.Get(entityAction.OutputField);
                if (val && val.length > 0)
                    return null; // if the output field is already populated, then we skip the action
            }

            // first, pre-process the entity AI Action
            const entityPrompt = params.systemPrompt ? params.systemPrompt : 
                                    (entityAction.Prompt && entityAction.Prompt.length > 0 ? entityAction.Prompt : action.DefaultPrompt); 
                                    // use the prompt provided in the inputParams if that exists as first priority
                                    // if not, get entity specific prompt if provided, otherwise use the default prompt from the action

            const userMessage = params.userPrompt ? params.userPrompt : this.markupUserMessage(params.entityRecord, entityAction.UserMessage);
                                    // if the caller provided a custom user message, use that, otherwise do what we are doing with a markup here

            const modelId = entityAction.AIModelID || action.DefaultModelID; // use the provided model if specified, otherwise use the dfault model
            const model = AIEngine.Instance.Models.find(m => m.ID === modelId);

            // now, before we execute the action, we need to build the params object that will be passed to the entity object for any pre-processing
            const entityParams = {
                name: entityAction.Name,
                actionId: entityAction.AIActionID,
                modelId: modelId,
                systemPrompt: entityPrompt,
                userMessage: userMessage,
                apiKey: GetAIAPIKey(model.DriverClass),
                result: null
            }
            if (!await params.entityRecord.BeforeEntityAIAction(entityParams))
                return null; // if the entity record BeforeEntityAIAction() call returns false, then we don't execute the action

            // now we can execute the action, and use the values that come OUT of the BeforeEntityAIAction() call because the entity record may have 
            // modified the values in its pre-procesing logic
            const results = await this.ExecuteAIAction({
                actionId: entityParams.actionId,
                modelId: entityParams.modelId,
                systemPrompt: entityParams.systemPrompt,
                userPrompt: entityParams.userMessage,
                modelName: model.Name
            });
            
            // post process the results
            if (results) {
                // the "output" is dependent on the type of action
                // so we need to process it a bit first depending on the type
                const sOutput = this.GetStringOutputFromActionResults(action, results);

                // NOW, give the entity record a chance to process the results with its AfterEntityAIAction() call
                entityParams.result = results; // pass this in, which will allow post-processing to modify the values if desired
                if (!await params.entityRecord.AfterEntityAIAction(entityParams))
                    return results; // if the entity record AfterEntityAIAction() call returns false, then we don't FURTHER process the results
                                    // this is NOT a failure condition, this means that the AfterEntityAIAction() call has already done what it needs to do
                                    // so we should not process further here. If the AfterEntityAIAction() call has failed it will throw an exception


                // now we need to do something with the results, depending on the setup of the Entity AI Action record
                if (entityAction.OutputType.trim().toLowerCase() === 'field') {
                    // simply drop the value into the entity record
                    params.entityRecord.Set(entityAction.OutputField, sOutput);
                    if (entityAction.TriggerEvent.trim().toLowerCase() === 'after save') {
                        // save the entity record now
                        await params.entityRecord.Save({
                            SkipEntityAIActions: true, // skip entity AI actions on save since we are INSIDE an Entity AI Action
                            IgnoreDirtyState: false
                        });
                    }
                }
                else if (entityAction.OutputType.trim().toLowerCase() === 'entity') {
                    // our job here is to create a new entity record of the specified type and populate it with the results
                    const md = new Metadata();
                    const newRecord = await md.GetEntityObject(entityAction.OutputEntity);
                    newRecord.NewRecord();
                    newRecord.Set('EntityID', params.entityRecord.EntityInfo.ID);
                    newRecord.Set('RecordID', params.entityRecord.FirstPrimaryKey.Value);
                    newRecord.Set(entityAction.OutputField, sOutput);
                    await newRecord.Save();
                }
            }

            // finally, return the results
            return results;
        }
        catch (err) {
            console.error(err);
            return {
                success: false,
                startTime: startTime,
                endTime: new Date(),
                timeElapsed: new Date().getTime() - startTime.getTime(),
                errorMessage: err.message,
                exception: err
            }
        }
    }

    protected markupUserMessage(entityRecord: BaseEntity, userMessage: string): string {
        // this method handles marking up the user message with the entity record values
        // the user message can contain tokens like {FirstName} which will be replaced with the actual value from the entity record
        // if the token is not found, it will be replaced with an empty string
        // if the token is found, but the value is null, it will be replaced with an empty string

        // first, loop through the userMessage to find markup tokens
        let temp = userMessage
        const markupTokens = temp.match(/{[a-zA-Z0-9]+}/g);
        if (markupTokens && markupTokens.length > 0) {
            // now loop through the tokens and replace them with the actual values
            markupTokens.forEach(token => {
                const fieldName = token.replace('{','').replace('}','');
                const fieldValue = entityRecord.Get(fieldName);
                temp = temp.replace(token, fieldValue ? fieldValue : '');
            });
        }

        return temp;
    }

    /**
     * @deprecated AI Actions are deprecated. Use AIPromptRunner with the new AI Prompt system instead.
     * This method will be removed in a future version.
     */
    public async ExecuteAIAction(params: AIActionParams): Promise<BaseResult> {
        const action = AIEngine.Instance.Actions.find(a => a.ID === params.actionId);
        if (!action)
            throw new Error(`Action ${params.actionId} not found.`);
        if (action.IsActive === false)
            throw new Error(`Action ${params.actionId} is not active.`);

        const model = AIEngine.Instance.Models.find(m => m.ID === params.modelId);
        if (!model)
            throw new Error(`Model ${params.modelId} not found.`);
        if (model.IsActive === false)
            throw new Error(`Model ${params.modelId} is not active.`);

        // figure out the driver for the requested model
        const driver: BaseModel = await this.getDriver(model, GetAIAPIKey(model.DriverClass));
        if (driver) {
            const modelParams = <ChatParams>{
                model: params.modelName,
                messages: [ 
                    {
                        role: 'system',
                        content: params.systemPrompt
                    },
                    {
                        role: 'user',
                        content: params.userPrompt
                    },
                ],
            }
            switch (action.Name.trim().toLowerCase()) {
                case 'classify':
                    const classifyResult = await (<BaseLLM>driver).ClassifyText(modelParams);
                    return classifyResult; 
                case 'summarize':
                    const summarizeResult = await (<BaseLLM>driver).SummarizeText(modelParams);
                    return summarizeResult;
                case 'chat':
                    const chatResult = await (<BaseLLM>driver).ChatCompletion(modelParams);
                    return chatResult;
                default:
                    throw new Error(`Action ${action.Name} not supported.`);
            }
        }
        else 
            throw new Error(`Driver ${model.DriverClass} not found or couldn't be loaded.`);
    }

    /**
     * @deprecated This method is related to deprecated AI Actions. Use AIPromptRunner instead.
     * This method will be removed in a future version.
     */
    protected GetStringOutputFromActionResults(action: AIActionEntity, result: BaseResult): string {
        switch (action.Name.trim().toLowerCase()) {
            case 'classify':
                const classifyResult = <ClassifyResult>result;
                return classifyResult.tags.map(t => t.tag).join(', ');
            case 'summarize':
                const summarizeResult = <SummarizeResult>result;
                return summarizeResult.summaryText;
            case 'chat':
                const chatResult = <ChatResult>result;
                return chatResult.data.choices[0].message.content;
            default:
                throw new Error(`Action ${action.Get('Name') .Name} not supported.`);
        }
    }

    protected async getDriver(model: AIModelEntityExtended, apiKey: string): Promise<BaseModel> {
        const driverClassName = model.DriverClass;
        const driverModuleName = model.DriverImportPath;
        try {
            if (driverModuleName && driverModuleName.length > 0) {
                const driverModule = await import(driverModuleName);
                if (!driverModule)
                    throw new Error(`Error loading driver module '${driverModuleName}'`);
            }
            // now the module is loaded (or wasn't specified, so assumed to be loaded already)
            // so just use ClassFactory as we would in any other case
            return MJGlobal.Instance.ClassFactory.CreateInstance<BaseModel>(BaseModel, driverClassName, apiKey);
        }
        catch (e) {
            throw new Error(`Error loading driver '${driverModuleName}' / '${driverClassName}' : ${e.message}`);
        }
    }
}

export function LoadAIEngine() {
    // This function exists to prevent tree shaking from removing the AIEngine class
    LoadBaseAIEngine();
}