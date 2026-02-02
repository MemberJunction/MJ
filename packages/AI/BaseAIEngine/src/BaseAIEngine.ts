import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { AIActionEntity, AIAgentActionEntity, AIAgentNoteEntity, AIAgentNoteTypeEntity,
         AIModelActionEntity,
         AIPromptModelEntity, AIPromptTypeEntity, AIResultCacheEntity, AIVendorTypeDefinitionEntity,
         ArtifactTypeEntity, EntityAIActionEntity, VectorDatabaseEntity,
         AIAgentPromptEntity,
         AIAgentTypeEntity,
         AIVendorEntity,
         AIModelVendorEntity,
         AIModelTypeEntity,
         AIModelCostEntity,
         AIModelPriceTypeEntity,
         AIModelPriceUnitTypeEntity,
         AIConfigurationEntity,
         AIConfigurationParamEntity,
         AIAgentStepEntity,
         AIAgentStepPathEntity,
         AIAgentRelationshipEntity,
         AIAgentPermissionEntity,
         AIAgentDataSourceEntity,
         AIAgentConfigurationEntity,
         AIAgentExampleEntity,
         AICredentialBindingEntity,
         AIModalityEntity,
         AIAgentModalityEntity,
         AIModelModalityEntity} from "@memberjunction/core-entities";
import { AIAgentPermissionHelper, EffectiveAgentPermissions } from "./AIAgentPermissionHelper";
import { TemplateEngineBase } from "@memberjunction/templates-base-types";
import { AIPromptEntityExtended, AIPromptCategoryEntityExtended, AIModelEntityExtended, AIAgentEntityExtended } from "@memberjunction/ai-core-plus";
import { IStartupSink, RegisterForStartup } from "@memberjunction/core";

/**
 * Represents the effective limits for a specific modality (e.g., Image, Audio).
 * These limits are resolved using the precedence chain: Agent → Model → System → Defaults.
 */
export interface ModalityLimits {
    /** Maximum size in bytes for this modality. Null means no limit. */
    maxSizeBytes: number | null;
    /** Maximum count of items per message for this modality. Null means no limit. */
    maxCountPerMessage: number | null;
    /** Maximum dimension (width/height for images). Only applicable for image modality. Null means no limit. */
    maxDimension: number | null;
    /** Supported formats as a comma-delimited string (e.g., "image/png, image/jpeg"). Null means all formats. */
    supportedFormats: string | null;
    /** Indicates whether this modality is allowed/supported. */
    isAllowed: boolean;
    /** The source of the limits ('Agent', 'Model', 'System', or 'Default') */
    source: 'Agent' | 'Model' | 'System' | 'Default';
}

/**
 * Aggregated attachment limits for an agent, combining all relevant input modalities.
 */
export interface AgentAttachmentLimits {
    /** Whether attachments are enabled for this agent */
    enabled: boolean;
    /** Maximum total attachments per message across all modalities */
    maxAttachments: number;
    /** Maximum size in bytes for any single attachment */
    maxAttachmentSizeBytes: number;
    /** Accepted file types as a pattern (e.g., "image/*" or "image/*,audio/*") */
    acceptedFileTypes: string;
    /** Individual modality limits */
    modalities: Map<string, ModalityLimits>;
}

// Default fallback values when no metadata is configured
const DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const DEFAULT_MAX_COUNT_PER_MESSAGE = 10;
const DEFAULT_MAX_DIMENSION = 4096;

// this class handles execution of AI Actions
@RegisterForStartup()
export class AIEngineBase extends BaseEngine<AIEngineBase> {
    private _models: AIModelEntityExtended[] = [];
    private _modelTypes: AIModelTypeEntity[] = [];
    private _vectorDatabases: VectorDatabaseEntity[] = [];
    private _prompts: AIPromptEntityExtended[] = [];
    private _promptModels: AIPromptModelEntity[] = [];
    private _promptTypes: AIPromptTypeEntity[] = [];
    private _promptCategories: AIPromptCategoryEntityExtended[] = [];
    private _agentActions: AIAgentActionEntity[] = [];
    private _agentPrompts: AIAgentPromptEntity[] = [];
    private _agentNoteTypes: AIAgentNoteTypeEntity[] = [];
    private _agentNotes: AIAgentNoteEntity[] = [];
    private _agentExamples: AIAgentExampleEntity[] = [];
    private _agentDataSources: AIAgentDataSourceEntity[] = [];
    private _agents: AIAgentEntityExtended[] = [];
    private _agentRelationships: AIAgentRelationshipEntity[] = [];
    private _agentTypes: AIAgentTypeEntity[] = [];
    private _artifactTypes: ArtifactTypeEntity[] = [];
    private _vendorTypeDefinitions: AIVendorTypeDefinitionEntity[] = [];
    private _vendors: AIVendorEntity[] = [];
    private _modelVendors: AIModelVendorEntity[] = [];
    private _modelCosts: AIModelCostEntity[] = [];
    private _modelPriceTypes: AIModelPriceTypeEntity[] = [];
    private _modelPriceUnitTypes: AIModelPriceUnitTypeEntity[] = [];
    private _configurations: AIConfigurationEntity[] = [];
    private _configurationParams: AIConfigurationParamEntity[] = [];
    private _agentSteps: AIAgentStepEntity[] = [];
    private _agentStepPaths: AIAgentStepPathEntity[] = [];
    private _agentPermissions: AIAgentPermissionEntity[] = [];
    private _agentConfigurations: AIAgentConfigurationEntity[] = [];
    private _credentialBindings: AICredentialBindingEntity[] = [];
    private _modalities: AIModalityEntity[] = [];
    private _agentModalities: AIAgentModalityEntity[] = [];
    private _modelModalities: AIModelModalityEntity[] = [];

    /**
     * Cache for configuration inheritance chains.
     * Key: configurationId, Value: array of AIConfigurationEntity from child to root
     */
    private _configurationChainCache: Map<string, AIConfigurationEntity[]> = new Map();

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const params: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                PropertyName: '_models',
                EntityName: 'AI Models',
                CacheLocal: true
                
            },
            {
                PropertyName: '_modelTypes',
                EntityName: 'AI Model Types',
                CacheLocal: true
            },
            {
                PropertyName: '_prompts',
                EntityName: 'AI Prompts',
                CacheLocal: true
            },
            {
                PropertyName: '_promptModels',
                EntityName: 'MJ: AI Prompt Models',
                CacheLocal: true
            },
            {
                PropertyName: '_promptTypes',
                EntityName: 'AI Prompt Types',
                CacheLocal: true
            },
            {
                PropertyName: '_promptCategories',
                EntityName: 'AI Prompt Categories',
                CacheLocal: true
            },
            {
                PropertyName: '_vectorDatabases',
                EntityName: 'Vector Databases',
                CacheLocal: true
            },
            {
                PropertyName: '_agentActions',
                EntityName: 'AI Agent Actions',
                CacheLocal: true
            },
            {
                PropertyName: '_agentNoteTypes',
                EntityName: 'AI Agent Note Types',
                CacheLocal: true
            },
            {
                PropertyName: '_agentNotes',
                EntityName: 'AI Agent Notes',
                CacheLocal: true
            },
            {
                PropertyName: '_agentExamples',
                EntityName: 'MJ: AI Agent Examples',
                CacheLocal: true
            },
            {
                PropertyName: '_agents',
                EntityName: 'AI Agents',
                CacheLocal: true
            },
            {
                PropertyName: '_agentRelationships',
                EntityName: 'MJ: AI Agent Relationships',
                CacheLocal: true
            },
            {
                PropertyName: '_agentTypes',
                EntityName: 'MJ: AI Agent Types',
                CacheLocal: true
            },
            {
                PropertyName: '_artifactTypes',
                EntityName: 'MJ: Artifact Types',
                CacheLocal: true
            },
            {
                PropertyName: '_vendorTypeDefinitions',
                EntityName: 'MJ: AI Vendor Type Definitions',
                CacheLocal: true
            }, 
            {
                PropertyName: '_vendors',
                EntityName: 'MJ: AI Vendors',
                CacheLocal: true
            }, 
            {
                PropertyName: '_modelVendors',
                EntityName: 'MJ: AI Model Vendors',
                CacheLocal: true
            }, 
            {
                PropertyName: '_agentPrompts',
                EntityName: 'MJ: AI Agent Prompts',
                CacheLocal: true
            },
            {
                PropertyName: '_modelCosts',
                EntityName: 'MJ: AI Model Costs',
                CacheLocal: true
            },
            {
                PropertyName: '_modelPriceTypes',
                EntityName: 'MJ: AI Model Price Types',
                CacheLocal: true
            },
            {
                PropertyName: '_modelPriceUnitTypes',
                EntityName: 'MJ: AI Model Price Unit Types',
                CacheLocal: true
            },
            {
                PropertyName: '_configurations',
                EntityName: 'MJ: AI Configurations',
                CacheLocal: true
            },
            {
                PropertyName: '_configurationParams',
                EntityName: 'MJ: AI Configuration Params',
                CacheLocal: true
            },
            {
                PropertyName: '_agentSteps',
                EntityName: 'MJ: AI Agent Steps',
                CacheLocal: true
            },
            {
                PropertyName: '_agentStepPaths',
                EntityName: 'MJ: AI Agent Step Paths',
                CacheLocal: true
            },
            {
                PropertyName: '_agentPermissions',
                EntityName: 'MJ: AI Agent Permissions',
                CacheLocal: true
            },
            {
                PropertyName: '_agentDataSources',
                EntityName: 'MJ: AI Agent Data Sources',
                CacheLocal: true
            },
            {
                PropertyName: '_agentConfigurations',
                EntityName: 'MJ: AI Agent Configurations',
                CacheLocal: true
            },
            {
                PropertyName: '_credentialBindings',
                EntityName: 'MJ: AI Credential Bindings',
                CacheLocal: true
            },
            {
                PropertyName: '_modalities',
                EntityName: 'MJ: AI Modalities',
                CacheLocal: true
            },
            {
                PropertyName: '_agentModalities',
                EntityName: 'MJ: AI Agent Modalities',
                CacheLocal: true
            },
            {
                PropertyName: '_modelModalities',
                EntityName: 'MJ: AI Model Modalities',
                CacheLocal: true
            }
        ];

        // make sure template engine base is loaded up
        await TemplateEngineBase.Instance.Config(false, contextUser);
        
        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // Clear the configuration chain cache when data is reloaded
        this._configurationChainCache.clear();

        // handle associating prompts with prompt categories
        //here we're using the underlying data (i.e _promptCategories and _prompts)
        //rather than the getter methods because the engine's Loaded property is still false
        for(const PromptCategory of this._promptCategories){
            this._prompts.filter((prompt: AIPromptEntityExtended) => {
                return prompt.CategoryID === PromptCategory.ID;
            }).forEach((prompt: AIPromptEntityExtended) => {
                PromptCategory.Prompts.push(prompt);
            });
        }

        // handle association agent actions, models, and notes with agents
        for(const agent of this._agents){
            this._agentActions.filter((action: AIAgentActionEntity) => {
                return action.AgentID === agent.ID;
            }).forEach((action: AIAgentActionEntity) => {
                agent.Actions.push(action);
            });

            this._agentNotes.filter((note: AIAgentNoteEntity) => {
                return note.AgentID === agent.ID;
            }).forEach((note: AIAgentNoteEntity) => {
                agent.Notes.push(note);
            });
        }

        for (const model of this._models) {
            this._modelVendors.filter(mv => mv.ModelID === model.ID)
            .forEach((mv: AIModelVendorEntity) => {
                model.ModelVendors.push(mv);
            });
        }
    }

    /**
     * Convenience method to returns the highest power model for a given vendor and model type. Loads the metadata if not already loaded.
     * @param vendorName - if set to null, undefined, or an empty string, then all models of the specified type are considered
     * @param modelType - the type of model to consider
     * @param contextUser required on the server side
     * @returns 
     */
    public async GetHighestPowerModel(vendorName: string, modelType: string, contextUser?: UserInfo): Promise<AIModelEntityExtended> {
        try {
            await AIEngineBase.Instance.Config(false, contextUser); // most of the time this is already loaded, but just in case it isn't we will load it here
            const models = AIEngineBase.Instance.Models.filter(m => {
                // Guard against AIModelType/Vendor being non-string (defensive coding for data issues)
                const mModelType = typeof m.AIModelType === 'string' ? m.AIModelType.trim().toLowerCase() : '';
                const mVendor = typeof m.Vendor === 'string' ? m.Vendor.trim().toLowerCase() : '';
                const targetType = modelType.trim().toLowerCase();
                const targetVendor = vendorName && vendorName.length > 0 ? vendorName.trim().toLowerCase() : '';

                return mModelType === targetType &&
                       (targetVendor === '' || mVendor === targetVendor);
            });
            // next, sort the models by the PowerRank field so that the highest power rank model is the first array element
            models.sort((a, b) => b.PowerRank - a.PowerRank); // highest power rank first
            return models[0];
        }
        catch (e) {
            LogError(e); // force logging to help debug scenario here
            throw e;
        }
    }

    /**
     * Convenience method to return the highest power LLM model for a given vendor. Loads the metadata if not already loaded.
     * @param vendorName - if provided, filters to only consider models from the specified vendor, otherwise considers all models
     * @param contextUser 
     * @returns 
     */
    public async GetHighestPowerLLM(vendorName?: string, contextUser?: UserInfo): Promise<AIModelEntityExtended> {
        return await this.GetHighestPowerModel(vendorName, 'LLM', contextUser);
    }

    /**
     * Gets the active cost configuration for a specific model and vendor combination
     * @param modelID - The ID of the AI model
     * @param vendorID - The ID of the vendor
     * @param processingType - 'Realtime' or 'Batch' (defaults to 'Realtime')
     * @returns The active AIModelCostEntity or null if none found
     */
    public GetActiveModelCost(modelID: string, vendorID: string, processingType: 'Realtime' | 'Batch' = 'Realtime'): AIModelCostEntity | null {
        const now = new Date();
        const activeCosts = this._modelCosts.filter(cost => 
            cost.ModelID === modelID && 
            cost.VendorID === vendorID &&
            cost.ProcessingType === processingType &&
            cost.Status === 'Active' &&
            (!cost.StartedAt || new Date(cost.StartedAt) <= now) &&
            (!cost.EndedAt || new Date(cost.EndedAt) > now)
        );
        
        // If multiple active costs exist, return the most recently started one
        if (activeCosts.length > 0) {
            return activeCosts.sort((a, b) => {
                const aStart = a.StartedAt ? new Date(a.StartedAt).getTime() : 0;
                const bStart = b.StartedAt ? new Date(b.StartedAt).getTime() : 0;
                return bStart - aStart;
            })[0];
        }
        
        return null;
    }
 

    public get Agents(): AIAgentEntityExtended[] {
        return this._agents;
    }

    public get AgentRelationships(): AIAgentRelationshipEntity[] {
        return this._agentRelationships;
    }

    /**
     * Returns the sub-agents for a given agent ID, optionally filtering by status.
     * Includes both child agents (ParentID relationship) and related agents (AgentRelationships).
     *
     * @param agentID - The ID of the parent agent to get sub-agents for
     * @param status - Optional status to filter sub-agents by (e.g., 'Active', 'Inactive'). If not provided, all sub-agents are returned.
     * @param relationshipStatus - Optional status to filter agent relationships by. Defaults to 'Active' if not provided.
     * @returns AIAgentEntityExtended[] - Array of sub-agent entities matching the criteria (deduplicated by ID).
     * @memberof
     */
    public GetSubAgents(
        agentID: string,
        status?: AIAgentEntityExtended['Status'],
        relationshipStatus?: AIAgentRelationshipEntity['Status']
    ): AIAgentEntityExtended[] {
        // Get child agents (ParentID relationship)
        const childAgents = this._agents.filter(a =>
            a.ParentID === agentID &&
            (!status || a.Status === status)
        );

        // Get related agents (AgentRelationships)
        const relStatus = relationshipStatus ?? 'Active'; // Default to Active for relationships
        const activeRelationships = this._agentRelationships.filter(ar =>
            ar.AgentID === agentID &&
            ar.Status === relStatus
        );

        // Get the actual agent entities for related agents
        const relatedAgents = activeRelationships
            .map(ar => this._agents.find(a => a.ID === ar.SubAgentID))
            .filter(a => a != null && (!status || a.Status === status));

        // Combine and deduplicate by ID
        const uniqueAgentIDs = new Set<string>();
        const allSubAgents: AIAgentEntityExtended[] = [];

        for (const agent of [...childAgents, ...relatedAgents]) {
            if (!uniqueAgentIDs.has(agent.ID)) {
                uniqueAgentIDs.add(agent.ID);
                allSubAgents.push(agent);
            }
        }

        return allSubAgents;
    }

    public get AgentTypes(): AIAgentTypeEntity[] {
        return this._agentTypes;
    }

    public GetAgentByName(agentName: string): AIAgentEntityExtended {
        return this._agents.find(a => a.Name.trim().toLowerCase() === agentName.trim().toLowerCase());
    }

    public get AgentActions(): AIAgentActionEntity[] {
        return this._agentActions;
    }

    public get AgentPrompts(): AIAgentPromptEntity[] {
        return this._agentPrompts;
    }

    /**
     * Cached array of AI Agent Configurations loaded from the database.
     * These define semantic presets for agents (e.g., "Fast", "High Quality").
     */
    public get AgentConfigurations(): AIAgentConfigurationEntity[] {
        return this._agentConfigurations;
    }

    /**
     * Gets all configuration presets for a specific agent
     * @param agentId The agent ID
     * @param activeOnly If true, only returns Active status presets (default: true)
     * @returns Array of configuration presets sorted by Priority
     */
    public GetAgentConfigurationPresets(agentId: string, activeOnly: boolean = true): AIAgentConfigurationEntity[] {
        let presets = this._agentConfigurations.filter(ac => ac.AgentID === agentId);

        if (activeOnly) {
            presets = presets.filter(ac => ac.Status === 'Active');
        }

        return presets.sort((a, b) => a.Priority - b.Priority);
    }

    /**
     * Gets the default configuration preset for an agent
     * @param agentId The agent ID
     * @returns The default preset, or undefined if none exists
     */
    public GetDefaultAgentConfigurationPreset(agentId: string): AIAgentConfigurationEntity | undefined {
        const presets = this.GetAgentConfigurationPresets(agentId, true);
        return presets.find(ac => ac.IsDefault);
    }

    /**
     * Gets a specific configuration preset by agent ID and preset name
     * @param agentId The agent ID
     * @param presetName The preset name (e.g., "Fast", "HighQuality")
     * @returns The configuration preset, or undefined if not found
     */
    public GetAgentConfigurationPresetByName(agentId: string, presetName: string): AIAgentConfigurationEntity | undefined {
        return this._agentConfigurations.find(
            ac => ac.AgentID === agentId &&
                  ac.Name === presetName &&
                  ac.Status === 'Active'
        );
    }

    public get AgentNoteTypes(): AIAgentNoteTypeEntity[] {
        return this._agentNoteTypes;
    }

    public get AgentPermissions(): AIAgentPermissionEntity[] {
        return this._agentPermissions;
    }

    public AgenteNoteTypeIDByName(agentNoteTypeName: string): string {
        return this._agentNoteTypes.find(a => a.Name.trim().toLowerCase() === agentNoteTypeName.trim().toLowerCase())?.ID;
    }

    public get AgentNotes(): AIAgentNoteEntity[] {
        return this._agentNotes;
    }
    public set AgentNotes(notes: AIAgentNoteEntity[]) {
        this._agentNotes = notes;
    }

    public get AgentExamples(): AIAgentExampleEntity[] {
        return this._agentExamples;
    }
    public set AgentExamples(examples: AIAgentExampleEntity[]) {
        this._agentExamples = examples;
    }

    public get VendorTypeDefinitions(): AIVendorTypeDefinitionEntity[] {
        return this._vendorTypeDefinitions;
    }

    public get Vendors(): AIVendorEntity[] {
        return this._vendors;
    }

    public get ModelVendors(): AIModelVendorEntity[] {
        return this._modelVendors;
    }

    public get CredentialBindings(): AICredentialBindingEntity[] {
        return this._credentialBindings;
    }

    /**
     * Gets credential bindings for a specific target, filtered by binding type and sorted by priority.
     * Only returns active bindings.
     * @param bindingType - The type of binding: 'Vendor', 'ModelVendor', or 'PromptModel'
     * @param targetId - The ID of the target entity (AIVendorID, AIModelVendorID, or AIPromptModelID)
     * @returns Array of active credential bindings sorted by Priority (lower = higher priority)
     */
    public GetCredentialBindingsForTarget(
        bindingType: 'Vendor' | 'ModelVendor' | 'PromptModel',
        targetId: string
    ): AICredentialBindingEntity[] {
        return this._credentialBindings
            .filter(b => {
                if (!b.IsActive) return false;
                if (b.BindingType !== bindingType) return false;

                switch (bindingType) {
                    case 'Vendor':
                        return b.AIVendorID === targetId;
                    case 'ModelVendor':
                        return b.AIModelVendorID === targetId;
                    case 'PromptModel':
                        return b.AIPromptModelID === targetId;
                    default:
                        return false;
                }
            })
            .sort((a, b) => a.Priority - b.Priority);
    }

    /**
     * Checks if any credential bindings exist for a specific target.
     * @param bindingType - The type of binding: 'Vendor', 'ModelVendor', or 'PromptModel'
     * @param targetId - The ID of the target entity
     * @returns True if at least one active binding exists
     */
    public HasCredentialBindings(
        bindingType: 'Vendor' | 'ModelVendor' | 'PromptModel',
        targetId: string
    ): boolean {
        return this.GetCredentialBindingsForTarget(bindingType, targetId).length > 0;
    }

    public get ModelTypes(): AIModelTypeEntity[] {
        return this._modelTypes;
    }

    public get Prompts(): AIPromptEntityExtended[] {
        return this._prompts;
    }

    public get PromptModels(): AIPromptModelEntity[] {
        return this._promptModels;
    }

    public get PromptTypes(): AIPromptTypeEntity[] {
        return this._promptTypes;
    }

    public get PromptCategories(): AIPromptCategoryEntityExtended[] {
        return this._promptCategories;
    }

    public get Models(): AIModelEntityExtended[] {
        return this._models;
    }

    public get ArtifactTypes(): ArtifactTypeEntity[] {
        return this._artifactTypes;
    }

    /**
     * Convenience method to return only the Language Models. Loads the metadata if not already loaded.
     */
    public get LanguageModels(): AIModelEntityExtended[] {  
        return this._models.filter(m => m.AIModelType.trim().toLowerCase() === 'llm');
    }

    public get VectorDatabases(): VectorDatabaseEntity[] {
        return this._vectorDatabases;
    }

    public get ModelCosts(): AIModelCostEntity[] {
        return this._modelCosts;
    }

    public get ModelPriceTypes(): AIModelPriceTypeEntity[] {
        return this._modelPriceTypes;
    }

    public get ModelPriceUnitTypes(): AIModelPriceUnitTypeEntity[] {
        return this._modelPriceUnitTypes;
    }

    public get Configurations(): AIConfigurationEntity[] {
        return this._configurations;
    }

    public get ConfigurationParams(): AIConfigurationParamEntity[] {
        return this._configurationParams;
    }

    /**
     * Gets configuration parameters for a specific configuration
     * @param configurationId - The ID of the configuration
     * @returns Array of configuration parameters for the specified configuration
     */
    public GetConfigurationParams(configurationId: string): AIConfigurationParamEntity[] {
        return this._configurationParams.filter(p => p.ConfigurationID === configurationId);
    }

    /**
     * Gets a specific configuration parameter value
     * @param configurationId - The ID of the configuration
     * @param paramName - The name of the parameter
     * @returns The parameter entity or null if not found
     */
    public GetConfigurationParam(configurationId: string, paramName: string): AIConfigurationParamEntity | null {
        return this._configurationParams.find(p =>
            p.ConfigurationID === configurationId &&
            p.Name.toLowerCase() === paramName.toLowerCase()
        ) || null;
    }

    /**
     * Returns the inheritance chain for a configuration, starting with the specified
     * configuration and walking up through parent configurations to the root.
     *
     * The chain is ordered from most-specific (the requested configuration) to
     * least-specific (the root parent with no ParentID).
     *
     * Results are cached for performance. Cache is invalidated when configurations
     * are reloaded via Config().
     *
     * @param configurationId - The ID of the configuration to get the chain for
     * @returns Array of AIConfigurationEntity objects representing the inheritance chain,
     *          or empty array if the configuration is not found
     * @throws Error if a circular reference is detected in the configuration hierarchy
     *
     * @example
     * // Single configuration with no parent
     * const chain = AIEngine.Instance.GetConfigurationChain('config-a');
     * // Returns: [ConfigA]
     *
     * @example
     * // Child -> Parent -> Grandparent chain
     * const chain = AIEngine.Instance.GetConfigurationChain('child-config');
     * // Returns: [ChildConfig, ParentConfig, GrandparentConfig]
     *
     * @example
     * // Usage in model selection - first config in chain with a match wins
     * const chain = AIEngine.Instance.GetConfigurationChain(configId);
     * for (const config of chain) {
     *   const models = promptModels.filter(pm => pm.ConfigurationID === config.ID);
     *   if (models.length > 0) return models;
     * }
     * // Fall back to null-config models if no match in chain
     */
    public GetConfigurationChain(configurationId: string): AIConfigurationEntity[] {
        // Check cache first
        if (this._configurationChainCache.has(configurationId)) {
            return this._configurationChainCache.get(configurationId)!;
        }

        const chain: AIConfigurationEntity[] = [];
        const visitedIds = new Set<string>();
        let currentId: string | null = configurationId;

        while (currentId) {
            // Cycle detection
            if (visitedIds.has(currentId)) {
                const chainNames = chain.map(c => c.Name).join(' -> ');
                throw new Error(
                    `Circular reference detected in AI Configuration hierarchy. ` +
                    `Configuration ID "${currentId}" appears multiple times in the chain: ` +
                    `${chainNames} -> [CYCLE]`
                );
            }

            const config = this._configurations.find(c => c.ID === currentId);
            if (!config) break;

            visitedIds.add(currentId);
            chain.push(config);
            currentId = config.ParentID; // Will be null for root configs
        }

        // Cache the result
        this._configurationChainCache.set(configurationId, chain);

        return chain;
    }

    /**
     * Returns all configuration parameters for a configuration, including inherited
     * parameters from parent configurations. Child parameters override parent parameters
     * with the same name (case-insensitive match).
     *
     * The inheritance chain is walked from root to child, so child values take precedence
     * over parent values for parameters with the same name.
     *
     * @param configurationId - The ID of the configuration to get parameters for
     * @returns Array of AIConfigurationParamEntity objects, with child overrides applied.
     *          Returns empty array if configuration is not found.
     *
     * @example
     * // Parent has: temperature=0.7, maxTokens=4000
     * // Child has: temperature=0.9
     * // Result: temperature=0.9 (child), maxTokens=4000 (inherited from parent)
     * const params = AIEngine.Instance.GetConfigurationParamsWithInheritance('child-config-id');
     */
    public GetConfigurationParamsWithInheritance(configurationId: string): AIConfigurationParamEntity[] {
        const chain = this.GetConfigurationChain(configurationId);

        if (chain.length === 0) {
            return [];
        }

        // Use a map to track params by name (lowercase for case-insensitive matching)
        // Walk chain in reverse (root first, child last) so child overwrites parent
        const paramMap = new Map<string, AIConfigurationParamEntity>();

        for (let i = chain.length - 1; i >= 0; i--) {
            const configParams = this._configurationParams.filter(
                p => p.ConfigurationID === chain[i].ID
            );
            for (const param of configParams) {
                paramMap.set(param.Name.toLowerCase(), param);
            }
        }

        return Array.from(paramMap.values());
    }

    public get AgentDataSources(): AIAgentDataSourceEntity[] {
        return this._agentDataSources;
    }

    public get AgentSteps(): AIAgentStepEntity[] {
        return this._agentSteps;
    }

    public get AgentStepPaths(): AIAgentStepPathEntity[] {
        return this._agentStepPaths;
    }

    // ==========================================
    // Modality Accessors and Helper Methods
    // ==========================================

    /**
     * Gets all AI modalities (Text, Image, Audio, Video, File, Embedding, etc.)
     */
    public get Modalities(): AIModalityEntity[] {
        return this._modalities;
    }

    /**
     * Gets all agent-modality mappings
     */
    public get AgentModalities(): AIAgentModalityEntity[] {
        return this._agentModalities;
    }

    /**
     * Gets all model-modality mappings
     */
    public get ModelModalities(): AIModelModalityEntity[] {
        return this._modelModalities;
    }

    /**
     * Gets a modality by name (case-insensitive)
     * @param name - The modality name (e.g., 'Text', 'Image', 'Audio', 'Video', 'File')
     * @returns The modality entity or undefined if not found
     */
    public GetModalityByName(name: string): AIModalityEntity | undefined {
        return this._modalities.find(m => m.Name.toLowerCase() === name.toLowerCase());
    }

    /**
     * Gets all modalities supported by an agent for a given direction
     * @param agentId - The agent ID
     * @param direction - 'Input' or 'Output'
     * @returns Array of modality entities the agent supports
     */
    public GetAgentModalities(agentId: string, direction: 'Input' | 'Output'): AIModalityEntity[] {
        const agentModalityRecords = this._agentModalities.filter(
            am => am.AgentID === agentId && am.Direction === direction
        );

        return agentModalityRecords
            .map(am => this._modalities.find(m => m.ID === am.ModalityID))
            .filter((m): m is AIModalityEntity => m !== undefined);
    }

    /**
     * Gets all modalities supported by a model for a given direction
     * @param modelId - The model ID
     * @param direction - 'Input' or 'Output'
     * @returns Array of modality entities the model supports
     */
    public GetModelModalities(modelId: string, direction: 'Input' | 'Output'): AIModalityEntity[] {
        const modelModalityRecords = this._modelModalities.filter(
            mm => mm.ModelID === modelId && mm.Direction === direction
        );

        return modelModalityRecords
            .map(mm => this._modalities.find(m => m.ID === mm.ModalityID))
            .filter((m): m is AIModalityEntity => m !== undefined);
    }

    /**
     * Checks if an agent supports a specific modality for a given direction.
     * If no agent modalities are configured, defaults to text-only.
     * @param agentId - The agent ID
     * @param modalityName - The modality name (e.g., 'Image', 'Audio')
     * @param direction - 'Input' or 'Output'
     * @returns True if the agent supports this modality
     */
    public AgentSupportsModality(agentId: string, modalityName: string, direction: 'Input' | 'Output'): boolean {
        // Check if agent has explicit modality records
        const agentModalities = this.GetAgentModalities(agentId, direction);

        if (agentModalities.length > 0) {
            // Agent has explicit modality configuration - check it
            return agentModalities.some(m => m.Name.toLowerCase() === modalityName.toLowerCase());
        }

        // No explicit agent modalities configured - default to text-only
        return modalityName.toLowerCase() === 'text';
    }

    /**
     * Checks if a model supports a specific modality for a given direction
     * @param modelId - The model ID
     * @param modalityName - The modality name (e.g., 'Image', 'Audio')
     * @param direction - 'Input' or 'Output'
     * @returns True if the model supports this modality
     */
    public ModelSupportsModality(modelId: string, modalityName: string, direction: 'Input' | 'Output'): boolean {
        const modelModalities = this.GetModelModalities(modelId, direction);

        if (modelModalities.length > 0) {
            return modelModalities.some(m => m.Name.toLowerCase() === modalityName.toLowerCase());
        }

        // No explicit model modalities - assume text-only (default for LLMs)
        return modalityName.toLowerCase() === 'text';
    }

    /**
     * Checks if an agent supports any non-text input modalities (images, audio, video, files).
     * This is used to determine if attachment upload should be enabled in the UI.
     * @param agentId - The agent ID
     * @returns True if the agent supports at least one non-text input modality
     */
    public AgentSupportsAttachments(agentId: string): boolean {
        const nonTextModalities = ['image', 'audio', 'video', 'file'];
        return nonTextModalities.some(modalityName =>
            this.AgentSupportsModality(agentId, modalityName, 'Input')
        );
    }

    /**
     * Gets all input modality names supported by an agent (for UI display/filtering)
     * @param agentId - The agent ID
     * @returns Array of modality names the agent accepts as input
     */
    public GetAgentSupportedInputModalities(agentId: string): string[] {
        // Check explicit agent modalities
        const agentModalities = this.GetAgentModalities(agentId, 'Input');

        if (agentModalities.length > 0) {
            return agentModalities.map(m => m.Name);
        }

        // No explicit modalities configured - default to text-only
        return ['Text'];
    }

    // ==========================================
    // Modality Limit Resolution Methods
    // ==========================================

    /**
     * Resolves the effective limits for a specific modality for an agent.
     * Uses precedence chain: Agent → Model → System → Defaults.
     *
     * @param agentId - The ID of the agent
     * @param modalityName - The modality name (e.g., 'Image', 'Audio', 'Video', 'File')
     * @param modelId - Optional model ID to check model-specific limits (falls back to system defaults if not provided)
     * @returns The resolved modality limits with source information
     */
    public GetAgentModalityLimits(agentId: string, modalityName: string, modelId?: string): ModalityLimits {
        // Get the base modality record
        const modality = this.GetModalityByName(modalityName);
        if (!modality) {
            // Modality doesn't exist - return defaults indicating not allowed
            return {
                maxSizeBytes: null,
                maxCountPerMessage: null,
                maxDimension: null,
                supportedFormats: null,
                isAllowed: false,
                source: 'Default'
            };
        }

        // Check agent-specific modality settings first (highest priority)
        const agentModality = this._agentModalities.find(
            am => am.AgentID === agentId && am.ModalityID === modality.ID && am.Direction === 'Input'
        );

        if (agentModality) {
            // Agent has explicit modality configuration
            return {
                maxSizeBytes: agentModality.MaxSizeBytes,
                maxCountPerMessage: agentModality.MaxCountPerMessage,
                maxDimension: null, // Agent modality doesn't have MaxDimension
                supportedFormats: null, // Agent modality doesn't have SupportedFormats
                isAllowed: agentModality.IsAllowed,
                source: 'Agent'
            };
        }

        // Check model-specific modality settings (second priority)
        if (modelId) {
            const modelLimits = this.GetModelModalityLimits(modelId, modalityName);
            if (modelLimits.source === 'Model') {
                return modelLimits;
            }
        }

        // Fall back to system-wide modality defaults
        return {
            maxSizeBytes: modality.DefaultMaxSizeBytes,
            maxCountPerMessage: modality.DefaultMaxCountPerMessage,
            maxDimension: null, // System modality doesn't have MaxDimension
            supportedFormats: null, // System modality doesn't have SupportedFormats by default
            isAllowed: true, // If modality exists at system level, it's generally allowed
            source: 'System'
        };
    }

    /**
     * Resolves the effective limits for a specific modality for a model.
     * Uses precedence chain: Model → System → Defaults.
     *
     * @param modelId - The ID of the model
     * @param modalityName - The modality name (e.g., 'Image', 'Audio', 'Video', 'File')
     * @returns The resolved modality limits with source information
     */
    public GetModelModalityLimits(modelId: string, modalityName: string): ModalityLimits {
        // Get the base modality record
        const modality = this.GetModalityByName(modalityName);
        if (!modality) {
            return {
                maxSizeBytes: null,
                maxCountPerMessage: null,
                maxDimension: null,
                supportedFormats: null,
                isAllowed: false,
                source: 'Default'
            };
        }

        // Check model-specific modality settings
        const modelModality = this._modelModalities.find(
            mm => mm.ModelID === modelId && mm.ModalityID === modality.ID && mm.Direction === 'Input'
        );

        if (modelModality && modelModality.IsSupported) {
            return {
                maxSizeBytes: modelModality.MaxSizeBytes,
                maxCountPerMessage: modelModality.MaxCountPerMessage,
                maxDimension: modelModality.MaxDimension,
                supportedFormats: modelModality.SupportedFormats,
                isAllowed: modelModality.IsSupported,
                source: 'Model'
            };
        }

        // Fall back to system-wide modality defaults
        return {
            maxSizeBytes: modality.DefaultMaxSizeBytes,
            maxCountPerMessage: modality.DefaultMaxCountPerMessage,
            maxDimension: null,
            supportedFormats: null,
            isAllowed: true,
            source: 'System'
        };
    }

    /**
     * Gets aggregated attachment limits for an agent, suitable for passing to UI components.
     * Combines limits from all supported input modalities (Image, Audio, Video, File).
     * Uses the most restrictive limits across all modalities for the aggregate values.
     *
     * @param agentId - The ID of the agent
     * @param modelId - Optional model ID to include model-specific limits in the resolution
     * @returns Aggregated attachment limits ready for UI component configuration
     */
    public GetAgentAttachmentLimits(agentId: string, modelId?: string): AgentAttachmentLimits {
        const attachmentModalityNames = ['Image', 'Audio', 'Video', 'File'];
        const modalityLimitsMap = new Map<string, ModalityLimits>();

        let hasAnyAllowed = false;
        let minMaxSize = DEFAULT_MAX_SIZE_BYTES;
        let minMaxCount = DEFAULT_MAX_COUNT_PER_MESSAGE;
        const acceptedTypes: string[] = [];

        for (const modalityName of attachmentModalityNames) {
            const limits = this.GetAgentModalityLimits(agentId, modalityName, modelId);
            modalityLimitsMap.set(modalityName, limits);

            if (limits.isAllowed) {
                hasAnyAllowed = true;

                // Track the most restrictive size limit
                if (limits.maxSizeBytes != null && limits.maxSizeBytes < minMaxSize) {
                    minMaxSize = limits.maxSizeBytes;
                }

                // Track the most restrictive count limit
                if (limits.maxCountPerMessage != null && limits.maxCountPerMessage < minMaxCount) {
                    minMaxCount = limits.maxCountPerMessage;
                }

                // Build accepted file types based on allowed modalities
                const mimePattern = this.getModalityMimePattern(modalityName, limits.supportedFormats);
                if (mimePattern) {
                    acceptedTypes.push(mimePattern);
                }
            }
        }

        return {
            enabled: hasAnyAllowed,
            maxAttachments: minMaxCount,
            maxAttachmentSizeBytes: minMaxSize,
            acceptedFileTypes: acceptedTypes.length > 0 ? acceptedTypes.join(',') : 'image/*',
            modalities: modalityLimitsMap
        };
    }

    /**
     * Helper to get MIME type pattern for a modality
     */
    private getModalityMimePattern(modalityName: string, supportedFormats: string | null): string | null {
        // If specific formats are provided, use them
        if (supportedFormats) {
            return supportedFormats;
        }

        // Default MIME patterns by modality
        switch (modalityName.toLowerCase()) {
            case 'image':
                return 'image/*';
            case 'audio':
                return 'audio/*';
            case 'video':
                return 'video/*';
            case 'file':
                return '*/*'; // Accept all file types
            default:
                return null;
        }
    }

    /**
     * Gets agent steps for a specific agent, optionally filtered by status
     * @param agentId - The ID of the agent
     * @param status - Optional status filter ('Active', 'Pending', 'Disabled')
     * @returns Array of agent steps
     */
    public GetAgentSteps(agentId: string, status?: string): AIAgentStepEntity[] {
        return this._agentSteps.filter(step => 
            step.AgentID === agentId && 
            (!status || step.Status === status)
        );
    }

    /**
     * Gets a specific agent step by ID
     * @param stepId - The ID of the step
     * @returns The step or null if not found
     */
    public GetAgentStepByID(stepId: string): AIAgentStepEntity | null {
        return this._agentSteps.find(step => step.ID === stepId) || null;
    }

    /**
     * Gets paths originating from a specific step
     * @param stepId - The ID of the origin step
     * @returns Array of paths from the step
     */
    public GetPathsFromStep(stepId: string): AIAgentStepPathEntity[] {
        return this._agentStepPaths.filter(path => path.OriginStepID === stepId);
    }

    /**
     * @deprecated AI Model Actions are deprecated. Returns an empty array.
     */
    public get ModelActions(): AIModelActionEntity[] {
        return [];
    }

    /**
     * @deprecated AI Actions are deprecated. Returns an empty array.
     */
    public get Actions(): AIActionEntity[] {
        return [];
    }

    /**
     * @deprecated Entity AI Actions are deprecated. Returns an empty array.
     */
    public get EntityAIActions(): EntityAIActionEntity[] {
        return [];
    }

    public static get Instance(): AIEngineBase {
        return super.getInstance<AIEngineBase>();
    }

    protected static checkMetadataLoaded(): void {
        if (!AIEngineBase.Instance.Loaded)
            throw new Error("AI Metadata not loaded, call AIEngineBase.Config() first.");
    }
 

    /**
     * This method will check the result cache for the given params and return the result if it exists, otherwise it will return null if the request is not cached.
     * @param prompt - the fully populated prompt to check the cache for
     */
    public async CheckResultCache(prompt: string): Promise<AIResultCacheEntity | null> {
        try {
            const rv = new RunView();
            const escapedPrompt = prompt.replace(/'/g, "''");
            const result = await rv.RunView({
                EntityName: 'AI Result Cache',
                ExtraFilter: `PromptText = '${escapedPrompt}' AND Status='Active'`,
                OrderBy: 'RunAt DESC',
                MaxRows: 1, // get only the latest one
                ResultType: 'entity_object'
            }, this.ContextUser);
            if (result && result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0];
            }
            else
                return null;
        }
        catch (err) {
            LogError(err);
            return null;
        }
    }

    /**
     * Utility method that will cache the result of a prompt in the AI Result Cache entity
     */
    public async CacheResult(model: AIModelEntityExtended, prompt: AIPromptEntityExtended, promptText: string, resultText: string): Promise<boolean> {
        const md = new Metadata();
        const cacheItem = await md.GetEntityObject<AIResultCacheEntity>('AI Result Cache', this.ContextUser);
        cacheItem.AIModelID = model.ID;
        cacheItem.AIPromptID = prompt.ID;
        cacheItem.PromptText = promptText;
        cacheItem.ResultText = resultText;
        cacheItem.Status = 'Active';
        cacheItem.RunAt = new Date();
        return await cacheItem.Save();
    }

    // ==========================================
    // AI Agent Permission Helper Methods
    // ==========================================

    /**
     * Checks if a user has permission to view an agent.
     * @param agentId - The ID of the agent to check
     * @param user - The user to check permissions for
     * @returns True if the user can view the agent
     */
    public async CanUserViewAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return await AIAgentPermissionHelper.HasPermission(agentId, user, 'view');
    }

    /**
     * Checks if a user has permission to run an agent.
     * @param agentId - The ID of the agent to check
     * @param user - The user to check permissions for
     * @returns True if the user can run the agent
     */
    public async CanUserRunAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return await AIAgentPermissionHelper.HasPermission(agentId, user, 'run');
    }

    /**
     * Checks if a user has permission to edit an agent.
     * @param agentId - The ID of the agent to check
     * @param user - The user to check permissions for
     * @returns True if the user can edit the agent
     */
    public async CanUserEditAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return await AIAgentPermissionHelper.HasPermission(agentId, user, 'edit');
    }

    /**
     * Checks if a user has permission to delete an agent.
     * @param agentId - The ID of the agent to check
     * @param user - The user to check permissions for
     * @returns True if the user can delete the agent
     */
    public async CanUserDeleteAgent(agentId: string, user: UserInfo): Promise<boolean> {
        return await AIAgentPermissionHelper.HasPermission(agentId, user, 'delete');
    }

    /**
     * Gets all effective permissions a user has for a specific agent.
     * @param agentId - The ID of the agent
     * @param user - The user to check permissions for
     * @returns Object containing all permission flags and ownership status
     */
    public async GetUserAgentPermissions(agentId: string, user: UserInfo): Promise<EffectiveAgentPermissions> {
        return await AIAgentPermissionHelper.GetEffectivePermissions(agentId, user);
    }

    /**
     * Gets all agents a user has access to with a specific permission level.
     * @param user - The user to check permissions for
     * @param permission - The minimum permission level required ('view', 'run', 'edit', or 'delete')
     * @returns Array of agents the user can access
     */
    public async GetAccessibleAgents(user: UserInfo, permission: 'view' | 'run' | 'edit' | 'delete'): Promise<AIAgentEntityExtended[]> {
        return await AIAgentPermissionHelper.GetAccessibleAgents(user, permission) as AIAgentEntityExtended[];
    }

    /**
     * Clears the agent permissions cache. Call this after modifying permissions.
     */
    public ClearAgentPermissionsCache(): void {
        AIAgentPermissionHelper.ClearCache();
    }

    /**
     * Refreshes the permissions cache for a specific agent.
     * @param agentId - The ID of the agent to refresh
     * @param user - The user context for server-side operations
     */
    public async RefreshAgentPermissionsCache(agentId: string, user: UserInfo): Promise<void> {
        await AIAgentPermissionHelper.RefreshCache(user);
    }
}