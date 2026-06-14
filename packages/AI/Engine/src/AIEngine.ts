import { BaseLLM, BaseModel, BaseResult, ChatParams, ChatMessage, ChatMessageRole,
         ParallelChatCompletionsCallbacks, GetAIAPIKey,
         EmbedTextResult,
         EmbedTextParams,
         BaseEmbeddings} from "@memberjunction/ai";
import { SummarizeResult } from "@memberjunction/ai";
import { ClassifyResult } from "@memberjunction/ai";
import { ChatResult } from "@memberjunction/ai";
import { BaseEntity, BaseEntityEvent, LogError, Metadata, UserInfo, IMetadataProvider, IStartupSink, RegisterForStartup } from "@memberjunction/core";
import { BaseSingleton, MJGlobal, MJEventType, MJLruCache, UUIDsEqual } from "@memberjunction/global";
import { createHash } from "crypto";
import { MJAIActionEntity, MJActionEntity,
         MJAIAgentActionEntity, MJAIAgentNoteEntity, MJAIAgentNoteTypeEntity,
         MJAIModelActionEntity, MJAIPromptModelEntity, MJAIPromptTypeEntity,
         MJAIResultCacheEntity, MJAIVendorTypeDefinitionEntity, MJArtifactTypeEntity,
         MJEntityAIActionEntity, MJVectorDatabaseEntity, MJAIAgentPromptEntity,
         MJAIAgentTypeEntity, MJAIVendorEntity, MJAIModelVendorEntity, MJAIModelTypeEntity,
         MJAIModelCostEntity, MJAIModelPriceTypeEntity, MJAIModelPriceUnitTypeEntity,
         MJAIConfigurationEntity, MJAIConfigurationParamEntity, MJAIAgentStepEntity,
         MJAIAgentStepPathEntity, MJAIAgentRelationshipEntity, MJAIAgentPermissionEntity,
         MJAIAgentDataSourceEntity, MJAIAgentConfigurationEntity, MJAIAgentExampleEntity,
         MJAICredentialBindingEntity, MJAIModalityEntity, MJAIAgentModalityEntity,
         MJAIModelModalityEntity, MJAIClientToolDefinitionEntity,
         MJAIAgentClientToolEntity, MJAIAgentCategoryEntity } from "@memberjunction/core-entities";
import { AIEngineBase } from "@memberjunction/ai-engine-base";
import { SimpleVectorService } from "@memberjunction/ai-vectors-memory";
import { AgentEmbeddingService } from "./services/AgentEmbeddingService";
import { ActionEmbeddingService } from "./services/ActionEmbeddingService";
import { AgentEmbeddingMetadata, AgentMatchResult } from "./types/AgentMatchResult";
import { ActionEmbeddingMetadata, ActionMatchResult } from "./types/ActionMatchResult";
import { NoteEmbeddingMetadata, NoteMatchResult } from "./types/NoteMatchResult";
import { ExampleEmbeddingMetadata, ExampleMatchResult } from "./types/ExampleMatchResult";
import { ActionEngineBase } from "@memberjunction/actions-base";
import { MJAIAgentEntityExtended, MJAIModelEntityExtended, MJAIPromptEntityExtended, MJAIPromptCategoryEntityExtended } from "@memberjunction/ai-core-plus";
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
@RegisterForStartup({
    deferred: true,
    deferredDelay: 15000,
    description: "Server-side AI Engine and Embeddings Pre-Warming"
})
export class AIEngine extends BaseSingleton<AIEngine> implements IStartupSink {
    public readonly EmbeddingModelTypeName: string = 'Embeddings';
    public readonly LocalEmbeddingModelVendorName: string = 'LocalEmbeddings';

    private _provider: IMetadataProvider | null = null;

    /**
     * Optional metadata provider override. Callers should set
     * `AIEngine.Instance.Provider = providerToUse` before invoking entity-AI execution methods
     * in multi-provider contexts. Falls back to the global default provider when unset.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider | null) {
        this._provider = value;
    }

    // Vector service for agent embeddings - initialized during Config
    private _agentVectorService: SimpleVectorService<AgentEmbeddingMetadata> | null = null;

    // Vector service for action embeddings - initialized during Config
    private _actionVectorService: SimpleVectorService<ActionEmbeddingMetadata> | null = null;

    // Vector service for note embeddings - initialized during Config
    private _noteVectorService: SimpleVectorService<NoteEmbeddingMetadata> | null = null;

    // Vector service for example embeddings - initialized during Config
    private _exampleVectorService: SimpleVectorService<ExampleEmbeddingMetadata> | null = null;

    // Actions loaded from database
    private _actions: MJActionEntity[] = [];

    // Embedding caches to track which items have embeddings generated
    private _agentEmbeddingsCache: Map<string, boolean> = new Map();
    private _actionEmbeddingsCache: Map<string, boolean> = new Map();
    private _embeddingsGenerated: boolean = false;

    /**
     * In-memory query embedding cache.
     *
     * - LRU eviction (5000-entry default) — keeps hot queries warm across bursts.
     * - Stores the in-flight `Promise<EmbedTextResult>` so concurrent callers
     *   for the same key share one inference rather than racing.
     * - Cache keys are `${modelID}|sha256(text)` so a 50KB text doesn't pin
     *   its full string in the Map.
     * - Failed promises are evicted via `Delete` so we don't trap negative
     *   results.
     */
    private _embeddingCache: MJLruCache<string, Promise<EmbedTextResult | null>> = new MJLruCache({ maxSize: 5000 });

    /**
     * Clears all cached text embeddings.
     */
    public ClearEmbeddingCache(): void {
        this._embeddingCache.Clear();
    }

    /**
     * Builds a bounded, collision-resistant cache key for a (model, text) pair.
     * Hashing the text keeps Map memory bounded regardless of text size.
     */
    private buildEmbeddingCacheKey(modelId: string, text: string): string {
        const hash = createHash('sha256').update(text).digest('hex');
        return `${modelId}|${hash}`;
    }

    // Loading state management
    private _loaded: boolean = false;
    private _loading: boolean = false;
    private _loadingPromise: Promise<void> | null = null;
    private _contextUser: UserInfo | undefined;

    // ========================================================================
    // Agent base-catalog cache (perf — server-only)
    // ========================================================================
    // Caches the "base" prompt-template catalog for an agent (resolved sub-agents + actions and
    // their formatted markdown) which is INVARIANT across runs/steps for a given agent. BaseAgent
    // rebuilt all of this on every prompt step; this lets the no-override fast path reuse it.
    // The cache lives here (server-only AIEngine) rather than AIEngineBase because the catalog
    // holds action/sub-agent domain objects and AIEngineBase is client+server (no actions dep).
    // The VALUE shape is owned by BaseAgent — stored loosely as `object` and read back via a
    // caller-supplied generic to avoid a cross-package type edge (and without using `any`).
    private _agentBaseCatalogCache: Map<string, object> = new Map();
    private _agentCatalogListenerSetUp: boolean = false;
    /** Entities whose change must coarse-invalidate the agent base-catalog cache (lowercased). */
    private static readonly AgentCatalogInvalidatingEntities: ReadonlySet<string> = new Set([
        'ai agents',
        'mj: ai agent actions',
        'mj: ai agent relationships',
        'mj: ai agent types',
    ]);

    /**
     * Returns the cached base catalog for an agent, or undefined if not yet built / invalidated.
     * The shape is defined and typed by the caller (BaseAgent) — pass the concrete type as `T`.
     */
    public GetAgentBaseCatalog<T extends object>(agentID: string): T | undefined {
        this.ensureAgentCatalogListener();
        return this._agentBaseCatalogCache.get(agentID) as T | undefined;
    }

    /** Stores the base catalog for an agent (built once, reused across runs until invalidated). */
    public SetAgentBaseCatalog(agentID: string, catalog: object): void {
        this.ensureAgentCatalogListener();
        this._agentBaseCatalogCache.set(agentID, catalog);
    }

    /** Wipes the entire agent base-catalog cache. Called on relevant entity changes and on reload. */
    public ClearAgentBaseCatalogCache(): void {
        this._agentBaseCatalogCache.clear();
    }

    /**
     * Subscribes (once) to MJGlobal BaseEntity events and coarse-wipes the agent base-catalog
     * cache whenever an AI Agent / Agent Action / Agent Relationship / Agent Type row is
     * saved, deleted, or remote-invalidated. A global wipe is intentional — rebuilds are cheap
     * and these entities change rarely, so fine-grained per-agent invalidation isn't worth it.
     */
    private ensureAgentCatalogListener(): void {
        if (this._agentCatalogListenerSetUp) return;
        this._agentCatalogListenerSetUp = true;
        try {
            MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
                if (event.event === MJEventType.ComponentEvent && event.eventCode === BaseEntity.BaseEventCode) {
                    const e = event.args as BaseEntityEvent;
                    if (e?.type === 'save' || e?.type === 'delete' || e?.type === 'remote-invalidate') {
                        const name = e.baseEntity?.EntityInfo?.Name?.toLowerCase().trim();
                        if (name && AIEngine.AgentCatalogInvalidatingEntities.has(name)) {
                            this.ClearAgentBaseCatalogCache();
                        }
                    }
                }
            });
        } catch (err) {
            LogError(err);
        }
    }

    public static get Instance(): AIEngine {
        return super.getInstance<AIEngine>();
    }

    /**
     * Executes the background startup sequence. This method is called automatically
     * by the StartupManager. It runs AIEngine configuration and pre-warms the local
     * embedding models and vector caches.
     *
     * @param contextUser The authenticated user context (system/boot user context)
     * @param provider Optional metadata provider override
     */
    public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        // Load the AI configuration and base metadata
        await this.Config(false, contextUser, provider);

        // Pre-generate agent, action, and other local embeddings in the background
        await this.ensureEmbeddingsGenerated();
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
    public get Agents(): MJAIAgentEntityExtended[] { return this.Base.Agents; }
    public get AgentRelationships(): MJAIAgentRelationshipEntity[] { return this.Base.AgentRelationships; }
    public get AgentTypes(): MJAIAgentTypeEntity[] { return this.Base.AgentTypes; }
    public get AgentCategories(): MJAIAgentCategoryEntity[] { return this.Base.AgentCategories; }
    public get AgentActions(): MJAIAgentActionEntity[] { return this.Base.AgentActions; }
    public get AgentPrompts(): MJAIAgentPromptEntity[] { return this.Base.AgentPrompts; }
    public get AgentConfigurations(): MJAIAgentConfigurationEntity[] { return this.Base.AgentConfigurations; }
    public get AgentNoteTypes(): MJAIAgentNoteTypeEntity[] { return this.Base.AgentNoteTypes; }
    public get AgentPermissions(): MJAIAgentPermissionEntity[] { return this.Base.AgentPermissions; }
    public get AgentNotes(): MJAIAgentNoteEntity[] { return this.Base.AgentNotes; }
    public get AgentExamples(): MJAIAgentExampleEntity[] { return this.Base.AgentExamples; }
    public get VendorTypeDefinitions(): MJAIVendorTypeDefinitionEntity[] { return this.Base.VendorTypeDefinitions; }
    public get Vendors(): MJAIVendorEntity[] { return this.Base.Vendors; }
    public get ModelVendors(): MJAIModelVendorEntity[] { return this.Base.ModelVendors; }
    public get CredentialBindings(): MJAICredentialBindingEntity[] { return this.Base.CredentialBindings; }
    public get ClientToolDefinitions(): MJAIClientToolDefinitionEntity[] { return this.Base.ClientToolDefinitions; }
    public get AgentClientTools(): MJAIAgentClientToolEntity[] { return this.Base.AgentClientTools; }
    public GetClientToolsForAgent(agentId: string): MJAIClientToolDefinitionEntity[] { return this.Base.GetClientToolsForAgent(agentId); }
    public GetCredentialBindingsForTarget(
        bindingType: 'Vendor' | 'ModelVendor' | 'PromptModel',
        targetId: string
    ): MJAICredentialBindingEntity[] {
        return this.Base.GetCredentialBindingsForTarget(bindingType, targetId);
    }
    public HasCredentialBindings(
        bindingType: 'Vendor' | 'ModelVendor' | 'PromptModel',
        targetId: string
    ): boolean {
        return this.Base.HasCredentialBindings(bindingType, targetId);
    }
    public get ModelTypes(): MJAIModelTypeEntity[] { return this.Base.ModelTypes; }
    public get Prompts(): MJAIPromptEntityExtended[] { return this.Base.Prompts; }
    public get PromptModels(): MJAIPromptModelEntity[] { return this.Base.PromptModels; }
    public get PromptTypes(): MJAIPromptTypeEntity[] { return this.Base.PromptTypes; }
    public get PromptCategories(): MJAIPromptCategoryEntityExtended[] { return this.Base.PromptCategories; }
    public get Models(): MJAIModelEntityExtended[] { return this.Base.Models; }
    public get ArtifactTypes(): MJArtifactTypeEntity[] { return this.Base.ArtifactTypes; }
    public get LanguageModels(): MJAIModelEntityExtended[] { return this.Base.LanguageModels; }
    public get VectorDatabases(): MJVectorDatabaseEntity[] { return this.Base.VectorDatabases; }
    public get ModelCosts(): MJAIModelCostEntity[] { return this.Base.ModelCosts; }
    public get ModelPriceTypes(): MJAIModelPriceTypeEntity[] { return this.Base.ModelPriceTypes; }
    public get ModelPriceUnitTypes(): MJAIModelPriceUnitTypeEntity[] { return this.Base.ModelPriceUnitTypes; }
    public get Configurations(): MJAIConfigurationEntity[] { return this.Base.Configurations; }
    public get ConfigurationParams(): MJAIConfigurationParamEntity[] { return this.Base.ConfigurationParams; }
    public get AgentDataSources(): MJAIAgentDataSourceEntity[] { return this.Base.AgentDataSources; }
    public get AgentSteps(): MJAIAgentStepEntity[] { return this.Base.AgentSteps; }
    public get AgentStepPaths(): MJAIAgentStepPathEntity[] { return this.Base.AgentStepPaths; }
    public get ModelActions(): MJAIModelActionEntity[] { return this.Base.ModelActions; }
    /** @deprecated Use the new Action system instead */
    public get Actions(): MJAIActionEntity[] { return this.Base.Actions; }
    /** @deprecated Use the new Action system instead */
    public get EntityAIActions(): MJEntityAIActionEntity[] { return this.Base.EntityAIActions; }

    // Modality getters - delegated from AIEngineBase
    public get Modalities(): MJAIModalityEntity[] { return this.Base.Modalities; }
    public get AgentModalities(): MJAIAgentModalityEntity[] { return this.Base.AgentModalities; }
    public get ModelModalities(): MJAIModelModalityEntity[] { return this.Base.ModelModalities; }

    // Modality helper methods - delegated from AIEngineBase
    public GetModalityByName(name: string): MJAIModalityEntity | undefined {
        return this.Base.GetModalityByName(name);
    }
    public GetAgentModalitiesByDirection(agentId: string, direction: 'Input' | 'Output'): MJAIModalityEntity[] {
        return this.Base.GetAgentModalities(agentId, direction);
    }
    public GetModelModalitiesByDirection(modelId: string, direction: 'Input' | 'Output'): MJAIModalityEntity[] {
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
    public async GetHighestPowerModel(vendorName: string, modelType: string, contextUser?: UserInfo): Promise<MJAIModelEntityExtended> {
        return this.Base.GetHighestPowerModel(vendorName, modelType, contextUser);
    }
    public async GetHighestPowerLLM(vendorName?: string, contextUser?: UserInfo): Promise<MJAIModelEntityExtended> {
        return this.Base.GetHighestPowerLLM(vendorName, contextUser);
    }
    public GetActiveModelCost(modelID: string, vendorID: string, processingType: 'Realtime' | 'Batch' = 'Realtime'): MJAIModelCostEntity | null {
        return this.Base.GetActiveModelCost(modelID, vendorID, processingType);
    }
    public GetSubAgents(
        agentID: string,
        status?: MJAIAgentEntityExtended['Status'],
        relationshipStatus?: MJAIAgentRelationshipEntity['Status']
    ): MJAIAgentEntityExtended[] {
        return this.Base.GetSubAgents(agentID, status, relationshipStatus);
    }
    public GetAgentByName(agentName: string): MJAIAgentEntityExtended {
        return this.Base.GetAgentByName(agentName);
    }
    public GetAgentByID(agentId: string): MJAIAgentEntityExtended {
        return this.Base.GetAgentByID(agentId);
    }
    public GetAgentConfigurationPresets(agentId: string, activeOnly: boolean = true): MJAIAgentConfigurationEntity[] {
        return this.Base.GetAgentConfigurationPresets(agentId, activeOnly);
    }
    public GetDefaultAgentConfigurationPreset(agentId: string): MJAIAgentConfigurationEntity | undefined {
        return this.Base.GetDefaultAgentConfigurationPreset(agentId);
    }
    public GetAgentConfigurationPresetByName(agentId: string, presetName: string): MJAIAgentConfigurationEntity | undefined {
        return this.Base.GetAgentConfigurationPresetByName(agentId, presetName);
    }
    public AgenteNoteTypeIDByName(agentNoteTypeName: string): string {
        return this.Base.AgenteNoteTypeIDByName(agentNoteTypeName);
    }
    public GetConfigurationParams(configurationId: string): MJAIConfigurationParamEntity[] {
        return this.Base.GetConfigurationParams(configurationId);
    }
    public GetConfigurationParam(configurationId: string, paramName: string): MJAIConfigurationParamEntity | null {
        return this.Base.GetConfigurationParam(configurationId, paramName);
    }
    /**
     * Returns the inheritance chain for a configuration, starting with the specified
     * configuration and walking up through parent configurations to the root.
     * Delegates to AIEngineBase.GetConfigurationChain.
     *
     * @param configurationId - The ID of the configuration to get the chain for
     * @returns Array of MJAIConfigurationEntity objects representing the inheritance chain
     * @throws Error if a circular reference is detected in the configuration hierarchy
     */
    public GetConfigurationChain(configurationId: string): MJAIConfigurationEntity[] {
        return this.Base.GetConfigurationChain(configurationId);
    }
    /**
     * Returns all configuration parameters for a configuration, including inherited
     * parameters from parent configurations. Child parameters override parent parameters.
     * Delegates to AIEngineBase.GetConfigurationParamsWithInheritance.
     *
     * @param configurationId - The ID of the configuration to get parameters for
     * @returns Array of MJAIConfigurationParamEntity objects, with child overrides applied
     */
    public GetConfigurationParamsWithInheritance(configurationId: string): MJAIConfigurationParamEntity[] {
        return this.Base.GetConfigurationParamsWithInheritance(configurationId);
    }
    public GetAgentSteps(agentId: string, status?: string): MJAIAgentStepEntity[] {
        return this.Base.GetAgentSteps(agentId, status);
    }
    public GetAgentStepByID(stepId: string): MJAIAgentStepEntity | null {
        return this.Base.GetAgentStepByID(stepId);
    }
    public GetPathsFromStep(stepId: string): MJAIAgentStepPathEntity[] {
        return this.Base.GetPathsFromStep(stepId);
    }
    public async CheckResultCache(prompt: string): Promise<MJAIResultCacheEntity | null> {
        return this.Base.CheckResultCache(prompt);
    }
    public async CacheResult(model: MJAIModelEntityExtended, prompt: MJAIPromptEntityExtended, promptText: string, resultText: string): Promise<boolean> {
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
    public async GetAccessibleAgents(user: UserInfo, permission: 'view' | 'run' | 'edit' | 'delete'): Promise<MJAIAgentEntityExtended[]> {
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
     * NOTE: This returns MJActionEntity (MJ Action system), not the deprecated MJAIActionEntity.
     * For deprecated AI Actions, see the inherited Actions property.
     */
    public get SystemActions(): MJActionEntity[] {
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
     * Ensures AIEngine is fully loaded (both base metadata and server-specific
     * capabilities like vector services) before the caller reads engine state.
     * Idempotent: if already loaded, returns immediately. If a load is in flight
     * (e.g. the deferred startup or another consumer triggered it), returns the
     * same in-progress promise.
     *
     * Mirrors BaseEngine.EnsureLoaded — added here because AIEngine extends
     * BaseSingleton (not BaseEngine) and has its own load orchestration to
     * cover server-specific setup (`RefreshServerSpecificMetadata`).
     *
     * Use at any consumption point that touches AIEngine state, especially
     * given AIEngineBase is registered as deferred at startup.
     */
    public async EnsureLoaded(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (this._loaded) return;
        await this.Config(false, contextUser, provider);
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

            // Agent/action metadata may have changed on reload — drop the agent base-catalog cache.
            this.ClearAgentBaseCatalogCache();

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

        // Embedding generation is deferred to first use (FindSimilar* calls).
        // This avoids loading the ~50MB local embedding model during Config(),
        // which is expensive in short-lived CLI processes that never need search.
        this._embeddingsGenerated = false;
    }

    /**
     * Ensures embeddings are generated, loading the model if needed.
     * Called lazily from FindSimilar* methods on first use.
     */
    private _embeddingsPromise: Promise<void> | null = null;

    private async ensureEmbeddingsGenerated(): Promise<void> {
        if (this._embeddingsGenerated) return;
        if (!this._embeddingsPromise) {
            this._embeddingsPromise = (async () => {
                try {
                    await Promise.all([
                        this.RefreshAgentEmbeddings(),
                        this.RefreshActionEmbeddings(),
                        this.RefreshNoteEmbeddings(this._contextUser),
                        this.RefreshExampleEmbeddings(this._contextUser)
                    ]);
                    this._embeddingsGenerated = true;
                } finally {
                    // Always clear the in-flight promise so the next caller can retry
                    // after a transient failure (e.g., model download flake). Without
                    // this, a single failed load would poison every subsequent
                    // FindSimilar* call for the lifetime of the process.
                    this._embeddingsPromise = null;
                }
            })();
        }
        await this._embeddingsPromise;
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
    protected packageNoteMetadata(note: MJAIAgentNoteEntity): NoteEmbeddingMetadata {
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
    public AddOrUpdateSingleNoteEmbedding(note: MJAIAgentNoteEntity) {
        if (this._noteVectorService) {
            this._noteVectorService.AddOrUpdateVector(note.ID, JSON.parse(note.EmbeddingVector),  this.packageNoteMetadata(note));
        }
        else {
            throw new Error('note vector service not initialized, error state')
        }
    }

    /**
     * Drops a note from the in-memory vector service. Called by the server-side entity
     * subclass when a note is saved with a non-Active Status or is deleted, so subsequent
     * FindSimilarAgentNotes calls cannot return it. Silently no-ops if the vector service
     * isn't initialized yet (e.g., during early startup before Config has run).
     * @param noteId
     */
    public RemoveSingleNoteEmbedding(noteId: string): void {
        this._noteVectorService?.RemoveVector(noteId);
    }

    /**
     * Takes in an example and packages up the metadata for the vector service
     * @param example
     */
    protected packageExampleMetadata(example: MJAIAgentExampleEntity): ExampleEmbeddingMetadata {
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
    public AddOrUpdateSingleExampleEmbedding(example: MJAIAgentExampleEntity) {
        if (this._exampleVectorService) {
            this._exampleVectorService.AddOrUpdateVector(example.ID, JSON.parse(example.EmbeddingVector), this.packageExampleMetadata(example));
        }
        else {
            throw new Error('example vector service not initialized, error state')
        }
    }

    /**
     * Drops an example from the in-memory vector service. Called by the server-side entity
     * subclass when an example is saved with a non-Active Status or is deleted, so subsequent
     * FindSimilarAgentExamples calls cannot return it. Silently no-ops if the vector service
     * isn't initialized yet (e.g., during early startup before Config has run).
     * @param exampleId
     */
    public RemoveSingleExampleEmbedding(exampleId: string): void {
        this._exampleVectorService?.RemoveVector(exampleId);
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
        model?: MJAIModelEntityExtended,
        apiKey?: string
    ): Promise<{
        modelInstance: BaseLLM,
        modelToUse: MJAIModelEntityExtended
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
    public async SimpleLLMCompletion(userPrompt: string, contextUser: UserInfo, systemPrompt?: string, model?: MJAIModelEntityExtended, apiKey?: string): Promise<string> {
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
        model?: MJAIModelEntityExtended,
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
    public get LocalEmbeddingModels(): MJAIModelEntityExtended[] {
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
    public get HighestPowerLocalEmbeddingModel(): MJAIModelEntityExtended | null {
        const models = this.LocalEmbeddingModels;
        return models && models.length > 0 ? models[0] : null;
    }

    /**
     * Returns the lowest power local embedding model
     */
    public get LowestPowerLocalEmbeddingModel(): MJAIModelEntityExtended | null {
        const models = this.LocalEmbeddingModels;
        return models && models.length > 0 ? models[models.length - 1] : null;
    }

    /**
     * Helper method that generates an embedding for the given text using the highest power local embedding model.
     */
    public async EmbedTextLocal(text: string): Promise<{result: EmbedTextResult, model: MJAIModelEntityExtended} | null> {
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
     *
     * Includes an LRU cache (see `_embeddingCache`) that dedupes concurrent calls for the same
     * (model, text) pair — the in-flight Promise is shared until it settles.
     *
     * @param options.bypassCache when true, skips the cache read but still populates it on success
     * @param options.noCache    when true, neither reads nor writes the cache (also forfeits
     *                            promise dedup — a `noCache` caller always re-infers, even if
     *                            an equivalent inference is already in flight)
     *
     * Empty/whitespace `text` short-circuits to `null` without invoking the embedding provider.
     */
    public async EmbedText(
        model: MJAIModelEntityExtended,
        text: string,
        apiKey?: string,
        options?: { bypassCache?: boolean; noCache?: boolean }
    ): Promise<EmbedTextResult | null> {
        if (!text || text.trim().length === 0) {
            return null;
        }

        const bypassCache = options?.bypassCache ?? false;
        const noCache = options?.noCache ?? false;
        const cacheKey = this.buildEmbeddingCacheKey(model.ID, text);

        if (!bypassCache && !noCache) {
            const cached = this._embeddingCache.Get(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // Inference promise — installed in the cache *before* awaiting so concurrent
        // callers can share it (avoids redundant CPU-bound ONNX inference under load).
        const inferencePromise = (async (): Promise<EmbedTextResult | null> => {
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

            return await embedding.EmbedText(params);
        })();

        if (!noCache) {
            this._embeddingCache.Set(cacheKey, inferencePromise);
            // Evict failed/empty results so we don't trap a bad cached entry.
            // Check-then-delete so we don't evict a newer entry that replaced
            // ours (e.g. a later `bypassCache` caller overwrote the slot, or LRU
            // rotated us out and a fresh inference took the key).
            const evictIfStillOurs = () => {
                if (this._embeddingCache.Get(cacheKey) === inferencePromise) {
                    this._embeddingCache.Delete(cacheKey);
                }
            };
            inferencePromise
                .then(result => {
                    if (!result || !result.vector || result.vector.length === 0) {
                        evictIfStillOurs();
                    }
                })
                .catch(evictIfStillOurs);
        }

        return await inferencePromise;
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
        await this.ensureEmbeddingsGenerated();
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
        await this.ensureEmbeddingsGenerated();
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
        minSimilarity: number = 0.5,
        additionalFilter?: (metadata: NoteEmbeddingMetadata) => boolean
    ): Promise<NoteMatchResult[]> {
        await this.ensureEmbeddingsGenerated();
        if (!this._noteVectorService) {
            LogError('FindSimilarAgentNotes: Note vector service not initialized. Falling back to cached notes without semantic ranking.');
            return this.fallbackGetNotesFromCache(agentId, userId, companyId, topK, additionalFilter);
        }

        if (!queryText || queryText.trim().length === 0) {
            throw new Error('queryText cannot be empty');
        }

        const queryEmbedding = await this.EmbedTextLocal(queryText);
        if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
            LogError('FindSimilarAgentNotes: Failed to generate embedding for query text. Falling back to cached notes.');
            return this.fallbackGetNotesFromCache(agentId, userId, companyId, topK, additionalFilter);
        }

        const composedFilter = this.composeNoteFilters(agentId, userId, companyId, additionalFilter);

        const results = this._noteVectorService.FindNearest(
            queryEmbedding.result.vector,
            topK,
            minSimilarity,
            undefined,
            composedFilter
        );

        return results.map(r => ({
            note: r.metadata.noteEntity,
            similarity: r.score
        }));
    }

    /**
     * Compose base scope filters (agentId/userId/companyId) with an optional additional filter
     * into a single filter callback for use with FindNearest.
     *
     * Status filtering is NOT performed here. The invariant the retrieval path relies on is:
     * `_noteVectorService` contains an entry for a note iff its persisted Status is `'Active'`.
     * That invariant is maintained write-side by `MJAIAgentNoteEntityServer.Save()`, which calls
     * `AddOrUpdateSingleNoteEmbedding` on Active saves and `RemoveSingleNoteEmbedding` on
     * non-Active saves. Deletes are handled by the same subclass's `Delete()` override.
     *
     * This avoids a subtle bug the earlier Status-check-at-retrieval approach had: BaseAIEngine
     * overrides `AdditionalLoading()`, which disables BaseEngine's immediate-mutation path for
     * `_agentNotes`. Newly-created notes don't appear in `this.AgentNotes` until the next
     * `Config(true)` — so any retrieval-time lookup against that cache returned `undefined` for
     * post-startup notes and rejected everything.
     */
    protected composeNoteFilters(
        agentId?: string,
        userId?: string,
        companyId?: string,
        additionalFilter?: (metadata: NoteEmbeddingMetadata) => boolean
    ): ((metadata: NoteEmbeddingMetadata) => boolean) {
        const baseFilter = (metadata: NoteEmbeddingMetadata): boolean => {
            if (agentId && metadata.agentId && !UUIDsEqual(metadata.agentId, agentId)) return false;
            if (userId && metadata.userId && !UUIDsEqual(metadata.userId, userId)) return false;
            if (companyId && metadata.companyId && !UUIDsEqual(metadata.companyId, companyId)) return false;
            return true;
        };

        if (additionalFilter) {
            return (metadata: NoteEmbeddingMetadata): boolean =>
                baseFilter(metadata) && additionalFilter(metadata);
        }
        return baseFilter;
    }

    /**
     * Fallback method to get notes from cache when vector service is unavailable.
     * Returns notes filtered by scope, sorted by creation date.
     */
    private fallbackGetNotesFromCache(
        agentId?: string,
        userId?: string,
        companyId?: string,
        topK: number = 5,
        additionalFilter?: (metadata: NoteEmbeddingMetadata) => boolean
    ): NoteMatchResult[] {
        const notes = this.AgentNotes.filter(n => {
            if (n.Status !== 'Active') return false;
            if (agentId && !UUIDsEqual(n.AgentID, agentId) && n.AgentID !== null) return false;
            if (userId && !UUIDsEqual(n.UserID, userId) && n.UserID !== null) return false;
            if (companyId && !UUIDsEqual(n.CompanyID, companyId) && n.CompanyID !== null) return false;
            if (additionalFilter && !additionalFilter(this.packageNoteMetadata(n))) return false;
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
        minSimilarity: number = 0.5,
        additionalFilter?: (metadata: ExampleEmbeddingMetadata) => boolean
    ): Promise<ExampleMatchResult[]> {
        await this.ensureEmbeddingsGenerated();
        if (!this._exampleVectorService) {
            LogError('FindSimilarAgentExamples: Example vector service not initialized. Falling back to cached examples without semantic ranking.');
            return this.fallbackGetExamplesFromCache(agentId, userId, companyId, topK, additionalFilter);
        }

        if (!queryText || queryText.trim().length === 0) {
            throw new Error('queryText cannot be empty');
        }

        const queryEmbedding = await this.EmbedTextLocal(queryText);
        if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
            LogError('FindSimilarAgentExamples: Failed to generate embedding for query text. Falling back to cached examples.');
            return this.fallbackGetExamplesFromCache(agentId, userId, companyId, topK, additionalFilter);
        }

        const composedFilter = this.composeExampleFilters(agentId, userId, companyId, additionalFilter);

        const results = this._exampleVectorService.FindNearest(
            queryEmbedding.result.vector,
            topK,
            minSimilarity,
            undefined,
            composedFilter
        );

        return results.map(r => ({
            example: r.metadata.exampleEntity,
            similarity: r.score
        }));
    }

    /**
     * Compose base scope filters (agentId/userId/companyId) with an optional additional filter
     * into a single filter callback for use with FindNearest on examples.
     *
     * Mirrors `composeNoteFilters`: Status filtering is NOT performed here. The vector store
     * is kept in sync with persisted Status by `MJAIAgentExampleEntityServer.Save()` /
     * `Delete()`, which call `AddOrUpdateSingleExampleEmbedding` / `RemoveSingleExampleEmbedding`
     * based on the example's current Status.
     */
    protected composeExampleFilters(
        agentId?: string,
        userId?: string,
        companyId?: string,
        additionalFilter?: (metadata: ExampleEmbeddingMetadata) => boolean
    ): ((metadata: ExampleEmbeddingMetadata) => boolean) {
        const baseFilter = (metadata: ExampleEmbeddingMetadata): boolean => {
            if (agentId && metadata.agentId && !UUIDsEqual(metadata.agentId, agentId)) return false;
            if (userId && metadata.userId && !UUIDsEqual(metadata.userId, userId)) return false;
            if (companyId && metadata.companyId && !UUIDsEqual(metadata.companyId, companyId)) return false;
            return true;
        };

        if (additionalFilter) {
            return (metadata: ExampleEmbeddingMetadata): boolean =>
                baseFilter(metadata) && additionalFilter(metadata);
        }
        return baseFilter;
    }

    /**
     * Fallback method to get examples from cache when vector service is unavailable.
     * Returns examples filtered by scope, sorted by success score then creation date.
     */
    private fallbackGetExamplesFromCache(
        agentId?: string,
        userId?: string,
        companyId?: string,
        topK: number = 3,
        additionalFilter?: (metadata: ExampleEmbeddingMetadata) => boolean
    ): ExampleMatchResult[] {
        const examples = this.AgentExamples.filter(e => {
            if (e.Status !== 'Active') return false;
            if (agentId && !UUIDsEqual(e.AgentID, agentId)) return false;
            if (userId && !UUIDsEqual(e.UserID, userId) && e.UserID !== null) return false;
            if (companyId && !UUIDsEqual(e.CompanyID, companyId) && e.CompanyID !== null) return false;
            if (additionalFilter && !additionalFilter(this.packageExampleMetadata(e))) return false;
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
            const entityAction = this.EntityAIActions.find(ea => UUIDsEqual(ea.ID, params.entityAIActionId));
            if (!entityAction)
                throw new Error(`Entity AI Action ${params.entityAIActionId} not found.`);

            const action = this.Actions.find(a => UUIDsEqual(a.ID, entityAction.AIActionID));
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
            const model = this.Models.find(m => UUIDsEqual(m.ID, modelId));

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
                    const md = this.Provider;
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
        const action = this.Actions.find(a => UUIDsEqual(a.ID, params.actionId));
        if (!action)
            throw new Error(`Action ${params.actionId} not found.`);
        if (action.IsActive === false)
            throw new Error(`Action ${params.actionId} is not active.`);

        const model = this.Models.find(m => UUIDsEqual(m.ID, params.modelId));
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
    protected GetStringOutputFromActionResults(action: MJAIActionEntity, result: BaseResult): string {
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

    protected async getDriver(model: MJAIModelEntityExtended, apiKey: string): Promise<BaseModel> {
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

