import { BaseLLM, BaseModel, BaseResult, ChatParams, ChatMessage, ChatMessageRole,
         ParallelChatCompletionsCallbacks, GetAIAPIKey,
         EmbedTextResult,
         EmbedTextParams,
         BaseEmbeddings} from "@memberjunction/ai";
import { SummarizeResult } from "@memberjunction/ai";
import { ClassifyResult } from "@memberjunction/ai";
import { ChatResult } from "@memberjunction/ai";
import { BaseEntity, LogError, Metadata, UserInfo, IMetadataProvider } from "@memberjunction/core";
import { BaseSingleton, MJGlobal } from "@memberjunction/global";
import { AIActionEntity, ActionEntity,
         AIAgentActionEntity, AIAgentNoteEntity, AIAgentNoteTypeEntity,
         AIModelActionEntity, AIPromptModelEntity, AIPromptTypeEntity,
         AIResultCacheEntity, AIVendorTypeDefinitionEntity, ArtifactTypeEntity,
         EntityAIActionEntity, VectorDatabaseEntity, AIAgentPromptEntity,
         AIAgentTypeEntity, AIVendorEntity, AIModelVendorEntity, AIModelTypeEntity,
         AIModelCostEntity, AIModelPriceTypeEntity, AIModelPriceUnitTypeEntity,
         AIConfigurationEntity, AIConfigurationParamEntity, AIAgentStepEntity,
         AIAgentStepPathEntity, AIAgentRelationshipEntity, AIAgentPermissionEntity,
         AIAgentDataSourceEntity, AIAgentConfigurationEntity, AIAgentExampleEntity,
         AICredentialBindingEntity, AIModalityEntity, AIAgentModalityEntity,
         AIModelModalityEntity } from "@memberjunction/core-entities";
import { AIEngineBase } from "@memberjunction/ai-engine-base";
import { SimpleVectorService } from "@memberjunction/ai-vectors-memory";
import { AgentEmbeddingService } from "./services/AgentEmbeddingService";
import { ActionEmbeddingService } from "./services/ActionEmbeddingService";
import { AgentEmbeddingMetadata, AgentMatchResult } from "./types/AgentMatchResult";
import { ActionEmbeddingMetadata, ActionMatchResult } from "./types/ActionMatchResult";
import { NoteEmbeddingMetadata, NoteMatchResult } from "./types/NoteMatchResult";
import { ExampleEmbeddingMetadata, ExampleMatchResult } from "./types/ExampleMatchResult";
import { ActionEngineBase } from "@memberjunction/actions-base";
import { AIAgentEntityExtended, AIModelEntityExtended, AIPromptEntityExtended, AIPromptCategoryEntityExtended } from "@memberjunction/ai-core-plus";
import { EffectiveAgentPermissions } from "@memberjunction/ai-engine-base";


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
 * Server-side AI Engine that wraps AIEngineBase and adds server-only capabilities.
 *
 * This class uses composition (containment) rather than inheritance to avoid duplicate
 * data loading. It delegates all base functionality to AIEngineBase.Instance while
 * adding server-specific features like embeddings, vector search, and LLM execution.
 *
 * @description ONLY USE ON SERVER-SIDE. For metadata only, use the AIEngineBase class which can be used anywhere.
 */
export class AIEngine extends BaseSingleton<AIEngine> {
    public readonly EmbeddingModelTypeName: string = 'Embeddings';
    public readonly LocalEmbeddingModelVendorName: string = 'LocalEmbeddings';

    // Vector service for agent embeddings - initialized during Config
    private _agentVectorService: SimpleVectorService<AgentEmbeddingMetadata> | null = null;

    // Vector service for action embeddings - initialized during Config
    private _actionVectorService: SimpleVectorService<ActionEmbeddingMetadata> | null = null;

    // Vector service for note embeddings - initialized during Config
    private _noteVectorService: SimpleVectorService<NoteEmbeddingMetadata> | null = null;

    // Vector service for example embeddings - initialized during Config
    private _exampleVectorService: SimpleVectorService<ExampleEmbeddingMetadata> | null = null;

    // Actions loaded from database
    private _actions: ActionEntity[] = [];

    // Embedding caches to track which items have embeddings generated
    private _agentEmbeddingsCache: Map<string, boolean> = new Map();
    private _actionEmbeddingsCache: Map<string, boolean> = new Map();
    private _embeddingsGenerated: boolean = false;

    // Loading state management
    private _loaded: boolean = false;
    private _loading: boolean = false;
    private _loadingPromise: Promise<void> | null = null;
    private _contextUser: UserInfo | undefined;

    public static get Instance(): AIEngine {
        return super.getInstance<AIEngine>();
    }

    // ========================================================================
    // Delegated Properties from AIEngineBase
    // All base metadata is accessed through AIEngineBase.Instance
    // ========================================================================

    /** Access to the underlying AIEngineBase instance */
    protected get Base(): AIEngineBase {
        return AIEngineBase.Instance;
    }

    /** Returns true if both the base engine and server capabilities are loaded */
    public get Loaded(): boolean {
        return this._loaded && this.Base.Loaded;
    }

    // Delegate all AIEngineBase public getters
    public get Agents(): AIAgentEntityExtended[] { return this.Base.Agents; }
    public get AgentRelationships(): AIAgentRelationshipEntity[] { return this.Base.AgentRelationships; }
    public get AgentTypes(): AIAgentTypeEntity[] { return this.Base.AgentTypes; }
    public get AgentActions(): AIAgentActionEntity[] { return this.Base.AgentActions; }
    public get AgentPrompts(): AIAgentPromptEntity[] { return this.Base.AgentPrompts; }
    public get AgentConfigurations(): AIAgentConfigurationEntity[] { return this.Base.AgentConfigurations; }
    public get AgentNoteTypes(): AIAgentNoteTypeEntity[] { return this.Base.AgentNoteTypes; }
    public get AgentPermissions(): AIAgentPermissionEntity[] { return this.Base.AgentPermissions; }
    public get AgentNotes(): AIAgentNoteEntity[] { return this.Base.AgentNotes; }
    public get AgentExamples(): AIAgentExampleEntity[] { return this.Base.AgentExamples; }
    public get VendorTypeDefinitions(): AIVendorTypeDefinitionEntity[] { return this.Base.VendorTypeDefinitions; }
    public get Vendors(): AIVendorEntity[] { return this.Base.Vendors; }
    public get ModelVendors(): AIModelVendorEntity[] { return this.Base.ModelVendors; }
    public get CredentialBindings(): AICredentialBindingEntity[] { return this.Base.CredentialBindings; }
    public GetCredentialBindingsForTarget(
        bindingType: 'Vendor' | 'ModelVendor' | 'PromptModel',
        targetId: string
    ): AICredentialBindingEntity[] {
        return this.Base.GetCredentialBindingsForTarget(bindingType, targetId);
    }
    public HasCredentialBindings(
        bindingType: 'Vendor' | 'ModelVendor' | 'PromptModel',
        targetId: string
    ): boolean {
        return this.Base.HasCredentialBindings(bindingType, targetId);
    }
    public get ModelTypes(): AIModelTypeEntity[] { return this.Base.ModelTypes; }
    public get Prompts(): AIPromptEntityExtended[] { return this.Base.Prompts; }
    public get PromptModels(): AIPromptModelEntity[] { return this.Base.PromptModels; }
    public get PromptTypes(): AIPromptTypeEntity[] { return this.Base.PromptTypes; }
    public get PromptCategories(): AIPromptCategoryEntityExtended[] { return this.Base.PromptCategories; }
    public get Models(): AIModelEntityExtended[] { return this.Base.Models; }
    public get ArtifactTypes(): ArtifactTypeEntity[] { return this.Base.ArtifactTypes; }
    public get LanguageModels(): AIModelEntityExtended[] { return this.Base.LanguageModels; }
    public get VectorDatabases(): VectorDatabaseEntity[] { return this.Base.VectorDatabases; }
    public get ModelCosts(): AIModelCostEntity[] { return this.Base.ModelCosts; }
    public get ModelPriceTypes(): AIModelPriceTypeEntity[] { return this.Base.ModelPriceTypes; }
    public get ModelPriceUnitTypes(): AIModelPriceUnitTypeEntity[] { return this.Base.ModelPriceUnitTypes; }
    public get Configurations(): AIConfigurationEntity[] { return this.Base.Configurations; }
    public get ConfigurationParams(): AIConfigurationParamEntity[] { return this.Base.ConfigurationParams; }
    public get AgentDataSources(): AIAgentDataSourceEntity[] { return this.Base.AgentDataSources; }
    public get AgentSteps(): AIAgentStepEntity[] { return this.Base.AgentSteps; }
    public get AgentStepPaths(): AIAgentStepPathEntity[] { return this.Base.AgentStepPaths; }
    public get ModelActions(): AIModelActionEntity[] { return this.Base.ModelActions; }
    /** @deprecated Use the new Action system instead */
    public get Actions(): AIActionEntity[] { return this.Base.Actions; }
    /** @deprecated Use the new Action system instead */
    public get EntityAIActions(): EntityAIActionEntity[] { return this.Base.EntityAIActions; }

    // Modality getters - delegated from AIEngineBase
    public get Modalities(): AIModalityEntity[] { return this.Base.Modalities; }
    public get AgentModalities(): AIAgentModalityEntity[] { return this.Base.AgentModalities; }
    public get ModelModalities(): AIModelModalityEntity[] { return this.Base.ModelModalities; }

    // Modality helper methods - delegated from AIEngineBase
    public GetModalityByName(name: string): AIModalityEntity | undefined {
        return this.Base.GetModalityByName(name);
    }
    public GetAgentModalitiesByDirection(agentId: string, direction: 'Input' | 'Output'): AIModalityEntity[] {
        return this.Base.GetAgentModalities(agentId, direction);
    }
    public GetModelModalitiesByDirection(modelId: string, direction: 'Input' | 'Output'): AIModalityEntity[] {
        return this.Base.GetModelModalities(modelId, direction);
    }
    public AgentSupportsModality(agentId: string, modalityName: string, direction: 'Input' | 'Output'): boolean {
        return this.Base.AgentSupportsModality(agentId, modalityName, direction);
    }
    public ModelSupportsModality(modelId: string, modalityName: string, direction: 'Input' | 'Output'): boolean {
        return this.Base.ModelSupportsModality(modelId, modalityName, direction);
    }
    public AgentSupportsAttachments(agentId: string): boolean {
        return this.Base.AgentSupportsAttachments(agentId);
    }
    public GetAgentSupportedInputModalities(agentId: string): string[] {
        return this.Base.GetAgentSupportedInputModalities(agentId);
    }

    // Delegate AIEngineBase public methods
    public async GetHighestPowerModel(vendorName: string, modelType: string, contextUser?: UserInfo): Promise<AIModelEntityExtended> {
        return this.Base.GetHighestPowerModel(vendorName, modelType, contextUser);
    }
    public async GetHighestPowerLLM(vendorName?: string, contextUser?: UserInfo): Promise<AIModelEntityExtended> {
        return this.Base.GetHighestPowerLLM(vendorName, contextUser);
    }
    public GetActiveModelCost(modelID: string, vendorID: string, processingType: 'Realtime' | 'Batch' = 'Realtime'): AIModelCostEntity | null {
        return this.Base.GetActiveModelCost(modelID, vendorID, processingType);
    }
    public GetSubAgents(
        agentID: string,
        status?: AIAgentEntityExtended['Status'],
        relationshipStatus?: AIAgentRelationshipEntity['Status']
    ): AIAgentEntityExtended[] {
        return this.Base.GetSubAgents(agentID, status, relationshipStatus);
    }
    public GetAgentByName(agentName: string): AIAgentEntityExtended {
        return this.Base.GetAgentByName(agentName);
    }
    public GetAgentConfigurationPresets(agentId: string, activeOnly: boolean = true): AIAgentConfigurationEntity[] {
        return this.Base.GetAgentConfigurationPresets(agentId, activeOnly);
    }
    public GetDefaultAgentConfigurationPreset(agentId: string): AIAgentConfigurationEntity | undefined {
        return this.Base.GetDefaultAgentConfigurationPreset(agentId);
    }
    public GetAgentConfigurationPresetByName(agentId: string, presetName: string): AIAgentConfigurationEntity | undefined {
        return this.Base.GetAgentConfigurationPresetByName(agentId, presetName);
    }
    public AgenteNoteTypeIDByName(agentNoteTypeName: string): string {
        return this.Base.AgenteNoteTypeIDByName(agentNoteTypeName);
    }
    public GetConfigurationParams(configurationId: string): AIConfigurationParamEntity[] {
        return this.Base.GetConfigurationParams(configurationId);
    }
    public GetConfigurationParam(configurationId: string, paramName: string): AIConfigurationParamEntity | null {
        return this.Base.GetConfigurationParam(configurationId, paramName);
    }
    /**
     * Returns the inheritance chain for a configuration, starting with the specified
     * configuration and walking up through parent configurations to the root.
     * Delegates to AIEngineBase.GetConfigurationChain.
     *
     * @param configurationId - The ID of the configuration to get the chain for
     * @returns Array of AIConfigurationEntity objects representing the inheritance chain
     * @throws Error if a circular reference is detected in the configuration hierarchy
     */
    public GetConfigurationChain(configurationId: string): AIConfigurationEntity[] {
        return this.Base.GetConfigurationChain(configurationId);
    }
    /**
     * Returns all configuration parameters for a configuration, including inherited
     * parameters from parent configurations. Child parameters override parent parameters.
     * Delegates to AIEngineBase.GetConfigurationParamsWithInheritance.
     *
     * @param configurationId - The ID of the configuration to get parameters for
     * @returns Array of AIConfigurationParamEntity objects, with child overrides applied
     */
    public GetConfigurationParamsWithInheritance(configurationId: string): AIConfigurationParamEntity[] {
        return this.Base.GetConfigurationParamsWithInheritance(configurationId);
    }
    public GetAgentSteps(agentId: string, status?: string): AIAgentStepEntity[] {
        return this.Base.GetAgentSteps(agentId, status);
    }
    public GetAgentStepByID(stepId: string): AIAgentStepEntity | null {
        return this.Base.GetAgentStepByID(stepId);
    }
    public GetPathsFromStep(stepId: string): AIAgentStepPathEntity[] {
        return this.Base.GetPathsFromStep(stepId);
    }
    public async CheckResultCache(prompt: string): Promise<AIResultCacheEntity | null> {
        return this.Base.CheckResultCache(prompt);
    }
    public async CacheResult(model: AIModelEntityExtended, prompt: AIPromptEntityExtended, promptText: string, resultText: string): Promise<boolean> {
        return this.Base.CacheResult(model, prompt, promptText, resultText);
    }
    public async CanUserViewAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return this.Base.CanUserViewAgent(agentId, user);
    }
    public async CanUserRunAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return this.Base.CanUserRunAgent(agentId, user);
    }
    public async CanUserEditAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return this.Base.CanUserEditAgent(agentId, user);
    }
    public async CanUserDeleteAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return this.Base.CanUserDeleteAgent(agentId, user);
    }
    public async GetUserAgentPermissions(agentId: string, user: UserInfo): Promise<EffectiveAgentPermissions> {
        return this.Base.GetUserAgentPermissions(agentId, user);
    }
    public async GetAccessibleAgents(user: UserInfo, permission: 'view' | 'run' | 'edit' | 'delete'): Promise<AIAgentEntityExtended[]> {
        return this.Base.GetAccessibleAgents(user, permission);
    }
    public ClearAgentPermissionsCache(): void {
        return this.Base.ClearAgentPermissionsCache();
    }
    public async RefreshAgentPermissionsCache(agentId: string, user: UserInfo): Promise<void> {
        return this.Base.RefreshAgentPermissionsCache(agentId, user);
    }

    // ========================================================================
    // Server-Only Properties
    // ========================================================================

    /**
     * Get the agent vector service for semantic search.
     * Initialized during Config - will be null before AIEngine.Config() completes.
     */
    public get AgentVectorService(): SimpleVectorService<AgentEmbeddingMetadata> | null {
        return this._agentVectorService;
    }

    /**
     * Get the action vector service for semantic search.
     * Initialized during Config - will be null before AIEngine.Config() completes.
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

    // ========================================================================
    // Config - Main Entry Point
    // ========================================================================

    /**
     * Configures the AIEngine by first ensuring AIEngineBase is configured,
     * then loading server-specific capabilities (embeddings, actions, etc.).
     *
     * This method is safe to call from multiple places concurrently - it will
     * return the same promise to all callers during loading.
     *
     * @param forceRefresh - If true, forces a full reload even if already loaded
     * @param contextUser - User context for server-side operations (required)
     * @param provider - Optional metadata provider override
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        // If already loaded and not forcing refresh, return immediately
        if (this._loaded && !forceRefresh) {
            return;
        }

        // If currently loading, return the existing promise so all callers wait together
        if (this._loading && this._loadingPromise) {
            return this._loadingPromise;
        }

        // Start loading
        this._loading = true;
        this._loadingPromise = this.innerLoad(forceRefresh, contextUser, provider);

        try {
            await this._loadingPromise;
        } finally {
            this._loading = false;
            this._loadingPromise = null;
        }
    }

    /**
     * Internal loading logic - separated for clean promise management
     */
    private async innerLoad(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        try {
            this._contextUser = contextUser;

            // First, ensure AIEngineBase is configured
            // This is where all the metadata loading happens - we share that data
            await AIEngineBase.Instance.Config(forceRefresh ?? false, contextUser, provider);

            // Now load server-specific capabilities
            await this.RefreshServerSpecificMetadata(contextUser);

            this._loaded = true;
        } catch (error) {
            LogError(error);
            throw error;
        }
    }

    /**
     * Refreshes the server metadata including active actions. 
     * Refreshes the embeddings in the engine's vector service for  
     *  - Agents (dynamic recalc of embeddings)
     *  - Actions (dynamic recalc of embeddings)
     *  - Notes (parsed from DB)
     *  - Examples (parsed from DB)
     * 
     * If you only need to refresh specific elements noted above, call the individual methods:
     *  - RefreshActions (refreshes just the server side action metadata - e.g. 'Active' Actions)
     *  - RefreshActionEmbeddings (dynamic recalc of embedings from stored data)
     *  - RefreshAgentEmbeddings (dynamic recalc of embeddings from stored data)
     *  - RefreshNoteEmbeddings
     *  - RefreshExampleEmbeddings
     */
    public async RefreshServerSpecificMetadata(contextUser?: UserInfo): Promise<void> {
        // Load actions from the Action system
        await this.RefreshActions(contextUser);

        // Load all embeddings in parallel since they are independent
        await Promise.all([
            this.RefreshAgentEmbeddings(),
            this.RefreshActionEmbeddings(),
            this.RefreshNoteEmbeddings(contextUser),
            this.RefreshExampleEmbeddings(contextUser)
        ]);

        this._embeddingsGenerated = true;
    }

    // ========================================================================
    // Embedding Generation Methods
    // ========================================================================

    /**
     * Force regeneration of all embeddings for agents and actions.
     *
     * Use this method when:
     * - Switching to a different embedding model
     * - Agent or Action descriptions have been significantly updated
     * - You want to ensure embeddings are up-to-date after bulk changes
     * - Troubleshooting embedding-related issues
     *
     * Note: This is an expensive operation and should not be called frequently.
     * Normal auto-refresh operations will NOT regenerate embeddings to avoid performance issues.
     *
     * @param contextUser - User context for database operations (required on server-side)
     */
    public async RegenerateEmbeddings(contextUser?: UserInfo): Promise<void> {
        try {
            // Clear the caches
            this._agentEmbeddingsCache.clear();
            this._actionEmbeddingsCache.clear();
            this._embeddingsGenerated = false;

            // Clear the vector services
            this._agentVectorService = null;
            this._actionVectorService = null;

            // Reload actions and regenerate embeddings
            await this.RefreshActions(contextUser);
            await this.RefreshAgentEmbeddings();
            await this.RefreshActionEmbeddings();
            this._embeddingsGenerated = true;

        } catch (error) {
            LogError('AIEngine: Failed to regenerate embeddings', undefined, error instanceof Error ? error : undefined);
            throw error;
        }
    }

    /**
     * Refreshes Agent embeddings - agents are pre-loaded at this point, but we need
     * to generate, dynamically, embeddings from the text stored in the agent. This is not a
     * cheap operation, use it sparingly.
     */
    public async RefreshAgentEmbeddings(): Promise<void> {
        try {
            // Use agents already loaded by base class
            const agents = this.Agents;  // Delegates to AIEngineBase

            if (!agents || agents.length === 0) {
                return;
            }

            // Filter out restricted agents - they should not be discoverable
            const nonRestrictedAgents = agents.filter(agent => !agent.IsRestricted);

            // Filter to only agents that don't have embeddings yet
            const agentsNeedingEmbeddings = nonRestrictedAgents.filter(agent =>
                !this._agentEmbeddingsCache.has(agent.ID)
            );

            if (agentsNeedingEmbeddings.length === 0) {
                return;
            }

            // Generate embeddings using static utility method
            const entries = await AgentEmbeddingService.GenerateAgentEmbeddings(
                agentsNeedingEmbeddings,
                (text) => this.EmbedTextLocal(text)
            );

            // Mark these agents as having embeddings
            for (const agent of agentsNeedingEmbeddings) {
                this._agentEmbeddingsCache.set(agent.ID, true);
            }

            // Load into vector service (create if needed, or add to existing)
            if (!this._agentVectorService) {
                this._agentVectorService = new SimpleVectorService();
            }
            this._agentVectorService.LoadVectors(entries);

        } catch (error) {
            LogError(`AIEngine: Failed to load agent embeddings: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw - allow AIEngine to continue loading even if embeddings fail
        }
    }

    /**
     * Loads Active actions from the base engine (contained within this class). Does **not** refresh from the database, simply
     * pulls the latest `Active` actions from the base class into its server side only array.
     */
    public async RefreshActions(contextUser?: UserInfo): Promise<void> {
        try {
            await ActionEngineBase.Instance.Config(false, contextUser);
            const actions = ActionEngineBase.Instance.Actions.filter(a => a.Status === 'Active');

            if (actions && actions.length > 0) {
                this._actions = actions;
            } else {
                LogError('AIEngine: No active actions found during load');
                this._actions = [];
            }

        } catch (error) {
            LogError(`AIEngine: Error loading actions: ${error instanceof Error ? error.message : String(error)}`);
            this._actions = [];
        }
    }

    /**
     * Dynamically calculation of embeddings for all `Active` actions. Assumes that the internal Actions array is up to date, call
     * @see RefreshActions first if you do not think they are already.
     * 
     * This operation dynamically calculates embeddings from the text in the Action metadata and is an expensive operation, use it
     * sparingly.
     */
    public async RefreshActionEmbeddings(): Promise<void> {
        try {
            const actions = this._actions;

            if (!actions || actions.length === 0) {
                return;
            }

            // Filter to only actions that don't have embeddings yet
            const actionsNeedingEmbeddings = actions.filter(action =>
                !this._actionEmbeddingsCache.has(action.ID)
            );

            if (actionsNeedingEmbeddings.length === 0) {
                return;
            }

            // Generate embeddings using static utility method
            const entries = await ActionEmbeddingService.GenerateActionEmbeddings(
                actionsNeedingEmbeddings,
                (text) => this.EmbedTextLocal(text)
            );

            // Mark these actions as having embeddings
            for (const action of actionsNeedingEmbeddings) {
                this._actionEmbeddingsCache.set(action.ID, true);
            }

            // Load into vector service (create if needed, or add to existing)
            if (!this._actionVectorService) {
                this._actionVectorService = new SimpleVectorService();
            }
            this._actionVectorService.LoadVectors(entries);

        } catch (error) {
            LogError(`AIEngine: Failed to load action embeddings: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw - allow AIEngine to continue loading even if embeddings fail
        }
    }

    /**
     * Refresh the vector service with the latest persisted vectors that are stored in the Agent Notes
     * table. This does **not** calculate embeddings, that is done by the AI Agent Note sub-class upon save 
     * as needed. This method simply uses the stored vectors and parses them from their JSON serialized format into
     * vectors that are used by the vector service.
     */
    public async RefreshNoteEmbeddings(contextUser?: UserInfo): Promise<void> {
        try {
            const notes = this.AgentNotes.filter(n => n.Status === 'Active' && n.EmbeddingVector);

            if (notes.length === 0) {
                return;
            }

            const entries = notes.map(note => ({
                key: note.ID,
                vector: JSON.parse(note.EmbeddingVector!),
                metadata: this.packageNoteMetadata(note)
            }));

            this._noteVectorService = new SimpleVectorService();
            this._noteVectorService.LoadVectors(entries);
        } catch (error) {
            LogError(`AIEngine: Failed to load note embeddings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Takes in a note and packages up the metadata for the vector service
     * @param note 
     */
    protected packageNoteMetadata(note: AIAgentNoteEntity): NoteEmbeddingMetadata {
        return {
            id: note.ID,
            agentId: note.AgentID,
            userId: note.UserID,
            companyId: note.CompanyID,
            type: note.Type,
            noteText: note.Note!,
            noteEntity: note
        }
    }

    /**
     * Updates the vector service to the latest vector containd within the specified agent note that is passed in
     * @param note 
     */
    public AddOrUpdateSingleNoteEmbedding(note: AIAgentNoteEntity) {
        if (this._noteVectorService) {
            this._noteVectorService.AddOrUpdateVector(note.ID, JSON.parse(note.EmbeddingVector),  this.packageNoteMetadata(note));
        }
        else {
            throw new Error('note vector service not initialized, error state')
        }
    }

    /**
     * Takes in an example and packages up the metadata for the vector service
     * @param example
     */
    protected packageExampleMetadata(example: AIAgentExampleEntity): ExampleEmbeddingMetadata {
        return {
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
    }

    /**
     * Updates the vector service to the latest vector contained within the specified agent example that is passed in
     * @param example
     */
    public AddOrUpdateSingleExampleEmbedding(example: AIAgentExampleEntity) {
        if (this._exampleVectorService) {
            this._exampleVectorService.AddOrUpdateVector(example.ID, JSON.parse(example.EmbeddingVector), this.packageExampleMetadata(example));
        }
        else {
            throw new Error('example vector service not initialized, error state')
        }
    }

    /**
     * Refresh the vector service with the latest persisted vectors that are stored in the Agent Examples
     * table. This does **not** calculate embeddings, that is done by the AI Agent Example sub-class upon save 
     * as needed. This method simply uses the stored vectors and parses them from their JSON serialized format into
     * vectors that are used by the vector service.
     */
    public async RefreshExampleEmbeddings(contextUser?: UserInfo): Promise<void> {
        try {
            const examples = this.AgentExamples.filter(e => e.Status === 'Active' && e.EmbeddingVector);

            if (examples.length === 0) {
                return;
            }

            const entries = examples.map(example => ({
                key: example.ID,
                vector: JSON.parse(example.EmbeddingVector!),
                metadata: this.packageExampleMetadata(example)
            }));

            this._exampleVectorService = new SimpleVectorService();
            this._exampleVectorService.LoadVectors(entries);
        } catch (error) {
            LogError(`AIEngine: Failed to load example embeddings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
 
    // ========================================================================
    // LLM Utility Methods
    // ========================================================================

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
        const modelToUse = model ? model : await this.GetHighestPowerLLM(undefined, contextUser);
        const apiKeyToUse = apiKey ? apiKey : GetAIAPIKey(modelToUse.DriverClass);
        const modelInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, modelToUse.DriverClass, apiKeyToUse);

        return { modelInstance, modelToUse };
    }

    /**
     * Executes a simple completion task using the provided parameters.
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

            const messages = this.PrepareChatMessages(userPrompt, systemPrompt);
            const params = new ChatParams();
            params.messages = messages;
            params.model = modelToUse.APIName;

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
     * Executes multiple parallel chat completions with the same model but potentially different parameters.
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

            const { modelInstance, modelToUse } = await this.PrepareLLMInstance(
                contextUser, model, apiKey
            );

            const messages = this.PrepareChatMessages(userPrompt, systemPrompt);

            const paramsArray: ChatParams[] = Array(iterations).fill(0).map((_, i) => {
                const params = new ChatParams();
                params.messages = [...messages];
                params.model = modelToUse.APIName;
                params.temperature = baseTemperature + (i * temperatureIncrement);
                return params;
            });

            return await modelInstance.ChatCompletions(paramsArray, callbacks);
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    // ========================================================================
    // Embedding Methods
    // ========================================================================

    /**
     * Returns an array of the local embedding models, sorted with the highest power models first
     */
    public get LocalEmbeddingModels(): AIModelEntityExtended[] {
        const embeddingModels = this.Models.filter(m => {
            // Guard against AIModelType being non-string (defensive coding for data issues)
            const modelType = typeof m.AIModelType === 'string' ? m.AIModelType.trim().toLowerCase() : '';
            const vendor = typeof m.Vendor === 'string' ? m.Vendor.trim().toLowerCase() : '';
            return modelType === this.EmbeddingModelTypeName.toLowerCase() &&
                   vendor === this.LocalEmbeddingModelVendorName.toLowerCase();
        });
        return embeddingModels.sort((a, b) => (b.PowerRank || 0) - (a.PowerRank || 0));
    }

    /**
     * Returns the highest power local embedding model
     */
    public get HighestPowerLocalEmbeddingModel(): AIModelEntityExtended | null {
        const models = this.LocalEmbeddingModels;
        return models && models.length > 0 ? models[0] : null;
    }

    /**
     * Returns the lowest power local embedding model
     */
    public get LowestPowerLocalEmbeddingModel(): AIModelEntityExtended | null {
        const models = this.LocalEmbeddingModels;
        return models && models.length > 0 ? models[models.length - 1] : null;
    }

    /**
     * Helper method that generates an embedding for the given text using the highest power local embedding model.
     */
    public async EmbedTextLocal(text: string): Promise<{result: EmbedTextResult, model: AIModelEntityExtended} | null> {
        const model = this.HighestPowerLocalEmbeddingModel;
        if (!model) {
            LogError('AIEngine: No local embedding model found. Cannot generate embedding.');
            return null;
        }
        const result = await this.EmbedText(model, text);
        return { result, model };
    }

    /**
     * Helper method to instantiate a class instance for the given model and calculate an embedding
     * vector from the provided text.
     */
    public async EmbedText(model: AIModelEntityExtended, text: string, apiKey?: string): Promise<EmbedTextResult | null> {
        const params: EmbedTextParams = {
            text: text,
            model: model.APIName
        };

        const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
            BaseEmbeddings,
            model.DriverClass,
            apiKey
        );

        if (!embedding) {
            LogError(`AIEngine: Failed to create embedding instance for model ${model.Name}. Skipping embedding generation.`);
            return null;
        }

        const result = await embedding.EmbedText(params);
        return result;
    }

    // ========================================================================
    // Semantic Search Methods
    // ========================================================================

    /**
     * Find agents similar to a task description using semantic search.
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
     * Falls back to returning notes from cache if vector service is unavailable.
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
            // Vector service not available - fall back to returning notes from cache filtered by scope
            LogError('FindSimilarAgentNotes: Note vector service not initialized. Falling back to cached notes without semantic ranking.');
            return this.fallbackGetNotesFromCache(agentId, userId, companyId, topK);
        }

        if (!queryText || queryText.trim().length === 0) {
            throw new Error('queryText cannot be empty');
        }

        const queryEmbedding = await this.EmbedTextLocal(queryText);
        if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
            LogError('FindSimilarAgentNotes: Failed to generate embedding for query text. Falling back to cached notes.');
            return this.fallbackGetNotesFromCache(agentId, userId, companyId, topK);
        }

        const needsFiltering = agentId || userId || companyId;
        const filter = needsFiltering ? (metadata: NoteEmbeddingMetadata) => {
            if (agentId && metadata.agentId && metadata.agentId !== agentId) return false;
            if (userId && metadata.userId && metadata.userId !== userId) return false;
            if (companyId && metadata.companyId && metadata.companyId !== companyId) return false;
            return true;
        } : undefined;

        const results = this._noteVectorService.FindNearest(
            queryEmbedding.result.vector,
            topK,
            minSimilarity,
            undefined,
            filter
        );

        return results.map(r => ({
            note: r.metadata.noteEntity,
            similarity: r.score
        }));
    }

    /**
     * Fallback method to get notes from cache when vector service is unavailable.
     * Returns notes filtered by scope, sorted by creation date.
     */
    private fallbackGetNotesFromCache(
        agentId?: string,
        userId?: string,
        companyId?: string,
        topK: number = 5
    ): NoteMatchResult[] {
        const notes = this.AgentNotes.filter(n => {
            if (n.Status !== 'Active') return false;
            if (agentId && n.AgentID !== agentId && n.AgentID !== null) return false;
            if (userId && n.UserID !== userId && n.UserID !== null) return false;
            if (companyId && n.CompanyID !== companyId && n.CompanyID !== null) return false;
            return true;
        });

        // Sort by creation date (most recent first) and take topK
        const sorted = notes
            .sort((a, b) => (b.__mj_CreatedAt?.getTime() || 0) - (a.__mj_CreatedAt?.getTime() || 0))
            .slice(0, topK);

        // Return with similarity of 0 to indicate no semantic ranking was applied
        return sorted.map(note => ({
            note,
            similarity: 0
        }));
    }

    /**
     * Find examples similar to query text using semantic search.
     * Falls back to returning examples from cache if vector service is unavailable.
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
            // Vector service not available - fall back to returning examples from cache filtered by scope
            LogError('FindSimilarAgentExamples: Example vector service not initialized. Falling back to cached examples without semantic ranking.');
            return this.fallbackGetExamplesFromCache(agentId, userId, companyId, topK);
        }

        if (!queryText || queryText.trim().length === 0) {
            throw new Error('queryText cannot be empty');
        }

        const queryEmbedding = await this.EmbedTextLocal(queryText);
        if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
            LogError('FindSimilarAgentExamples: Failed to generate embedding for query text. Falling back to cached examples.');
            return this.fallbackGetExamplesFromCache(agentId, userId, companyId, topK);
        }

        const needsFiltering = agentId || userId || companyId;
        const filter = needsFiltering ? (metadata: ExampleEmbeddingMetadata) => {
            if (agentId && metadata.agentId && metadata.agentId !== agentId) return false;
            if (userId && metadata.userId && metadata.userId !== userId) return false;
            if (companyId && metadata.companyId && metadata.companyId !== companyId) return false;
            return true;
        } : undefined;

        const results = this._exampleVectorService.FindNearest(
            queryEmbedding.result.vector,
            topK,
            minSimilarity,
            undefined,
            filter
        );

        return results.map(r => ({
            example: r.metadata.exampleEntity,
            similarity: r.score
        }));
    }

    /**
     * Fallback method to get examples from cache when vector service is unavailable.
     * Returns examples filtered by scope, sorted by success score then creation date.
     */
    private fallbackGetExamplesFromCache(
        agentId?: string,
        userId?: string,
        companyId?: string,
        topK: number = 3
    ): ExampleMatchResult[] {
        const examples = this.AgentExamples.filter(e => {
            if (e.Status !== 'Active') return false;
            if (agentId && e.AgentID !== agentId) return false;
            if (userId && e.UserID !== userId && e.UserID !== null) return false;
            if (companyId && e.CompanyID !== companyId && e.CompanyID !== null) return false;
            return true;
        });

        // Sort by success score (highest first), then by creation date (most recent first)
        const sorted = examples
            .sort((a, b) => {
                const scoreA = a.SuccessScore ?? 0;
                const scoreB = b.SuccessScore ?? 0;
                if (scoreB !== scoreA) return scoreB - scoreA;
                return (b.__mj_CreatedAt?.getTime() || 0) - (a.__mj_CreatedAt?.getTime() || 0);
            })
            .slice(0, topK);

        // Return with similarity of 0 to indicate no semantic ranking was applied
        return sorted.map(example => ({
            example,
            similarity: 0
        }));
    }

    // ========================================================================
    // Deprecated AI Action Methods
    // ========================================================================

    /**
     * @deprecated Entity AI Actions are deprecated. Use AIPromptRunner with the new AI Prompt system instead.
     */
    public async ExecuteEntityAIAction(params: EntityAIActionParams): Promise<BaseResult> {
        const startTime = new Date();
        try {
            const entityAction = this.EntityAIActions.find(ea => ea.ID === params.entityAIActionId);
            if (!entityAction)
                throw new Error(`Entity AI Action ${params.entityAIActionId} not found.`);

            const action = this.Actions.find(a => a.ID === entityAction.AIActionID);
            if (!action)
                throw new Error(`Action ${entityAction.AIActionID} not found, from the EntityAIAction ${params.entityAIActionId}.`);

            if (entityAction.SkipIfOutputFieldNotEmpty &&
                entityAction.OutputType.trim().toLowerCase() === 'field') {
                const val = params.entityRecord.Get(entityAction.OutputField);
                if (val && val.length > 0)
                    return null as unknown as BaseResult;
            }

            const entityPrompt = params.systemPrompt ? params.systemPrompt :
                                    (entityAction.Prompt && entityAction.Prompt.length > 0 ? entityAction.Prompt : action.DefaultPrompt);

            const userMessage = params.userPrompt ? params.userPrompt : this.markupUserMessage(params.entityRecord, entityAction.UserMessage);

            const modelId = entityAction.AIModelID || action.DefaultModelID;
            const model = this.Models.find(m => m.ID === modelId);

            const entityParams = {
                name: entityAction.Name,
                actionId: entityAction.AIActionID,
                modelId: modelId,
                systemPrompt: entityPrompt,
                userMessage: userMessage,
                apiKey: GetAIAPIKey(model!.DriverClass),
                result: null as BaseResult | null
            }
            if (!await params.entityRecord.BeforeEntityAIAction(entityParams))
                return null as unknown as BaseResult;

            const results = await this.ExecuteAIAction({
                actionId: entityParams.actionId,
                modelId: entityParams.modelId,
                systemPrompt: entityParams.systemPrompt,
                userPrompt: entityParams.userMessage,
                modelName: model!.Name
            });

            if (results) {
                const sOutput = this.GetStringOutputFromActionResults(action, results);

                entityParams.result = results;
                if (!await params.entityRecord.AfterEntityAIAction(entityParams))
                    return results;

                if (entityAction.OutputType.trim().toLowerCase() === 'field') {
                    params.entityRecord.Set(entityAction.OutputField, sOutput);
                    if (entityAction.TriggerEvent.trim().toLowerCase() === 'after save') {
                        await params.entityRecord.Save({
                            SkipEntityAIActions: true,
                            IgnoreDirtyState: false
                        });
                    }
                }
                else if (entityAction.OutputType.trim().toLowerCase() === 'entity') {
                    const md = new Metadata();
                    const newRecord = await md.GetEntityObject(entityAction.OutputEntity);
                    newRecord.NewRecord();
                    newRecord.Set('EntityID', params.entityRecord.EntityInfo.ID);
                    // Use concatenated key format to properly support both single and composite primary keys
                    newRecord.Set('RecordID', params.entityRecord.PrimaryKey.ToConcatenatedString());
                    newRecord.Set(entityAction.OutputField, sOutput);
                    await newRecord.Save();
                }
            }

            return results;
        }
        catch (err) {
            LogError('AIEngine: ExecuteEntityAIAction failed', undefined, err instanceof Error ? err : undefined);
            return {
                success: false,
                startTime: startTime,
                endTime: new Date(),
                timeElapsed: new Date().getTime() - startTime.getTime(),
                errorMessage: (err as Error).message,
                exception: err
            }
        }
    }

    protected markupUserMessage(entityRecord: BaseEntity, userMessage: string): string {
        let temp = userMessage
        const markupTokens = temp.match(/{[a-zA-Z0-9]+}/g);
        if (markupTokens && markupTokens.length > 0) {
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
     */
    public async ExecuteAIAction(params: AIActionParams): Promise<BaseResult> {
        const action = this.Actions.find(a => a.ID === params.actionId);
        if (!action)
            throw new Error(`Action ${params.actionId} not found.`);
        if (action.IsActive === false)
            throw new Error(`Action ${params.actionId} is not active.`);

        const model = this.Models.find(m => m.ID === params.modelId);
        if (!model)
            throw new Error(`Model ${params.modelId} not found.`);
        if (model.IsActive === false)
            throw new Error(`Model ${params.modelId} is not active.`);

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
                throw new Error(`Action ${action.Name} not supported.`);
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
            return MJGlobal.Instance.ClassFactory.CreateInstance<BaseModel>(BaseModel, driverClassName, apiKey);
        }
        catch (e) {
            throw new Error(`Error loading driver '${driverModuleName}' / '${driverClassName}' : ${(e as Error).message}`);
        }
    }
}

