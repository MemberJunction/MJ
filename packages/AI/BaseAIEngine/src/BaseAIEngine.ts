import { BaseEngine, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { AIActionEntity, AIAgentActionEntity, AIAgentModelEntity, AIAgentNoteEntity, AIAgentNoteTypeEntity, 
         AIModelActionEntity, AIModelEntity, AIModelEntityExtended, AIPromptCategoryEntity, AIPromptEntity, 
         AIPromptModelEntity, AIPromptTypeEntity, AIResultCacheEntity, AIVendorTypeDefinitionEntity, 
         ArtifactTypeEntity, EntityAIActionEntity, VectorDatabaseEntity,
         AIPromptCategoryEntityExtended, AIAgentEntityExtended, 
         AIAgentPromptEntity,
         AIAgentTypeEntity} from "@memberjunction/core-entities";
 
// this class handles execution of AI Actions
export class AIEngineBase extends BaseEngine<AIEngineBase> {
    private _models: AIModelEntityExtended[] = [];
    private _vectorDatabases: VectorDatabaseEntity[] = [];
    private _prompts: AIPromptEntity[] = [];
    private _promptModels: AIPromptModelEntity[] = [];
    private _promptTypes: AIPromptTypeEntity[] = [];
    private _promptCategories: AIPromptCategoryEntityExtended[] = [];
    private _agentActions: AIAgentActionEntity[] = [];
    private _agentPrompts: AIAgentPromptEntity[] = [];
    private _agentNoteTypes: AIAgentNoteTypeEntity[] = [];
    private _agentNotes: AIAgentNoteEntity[] = [];
    private _agents: AIAgentEntityExtended[] = [];
    private _agentTypes: AIAgentTypeEntity[] = [];
    private _artifactTypes: ArtifactTypeEntity[] = [];
    private _vendorTypeDefinitions: AIVendorTypeDefinitionEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const params = [
            {
                PropertyName: '_models',
                EntityName: 'AI Models'
            },
            {
                PropertyName: '_prompts',
                EntityName: 'AI Prompts'
            },
            {
                PropertyName: '_promptModels',
                EntityName: 'MJ: AI Prompt Models'
            },
            {
                PropertyName: '_promptTypes',
                EntityName: 'AI Prompt Types'
            },
            {
                PropertyName: '_promptCategories',
                EntityName: 'AI Prompt Categories'
            },
            {
                PropertyName: '_vectorDatabases',
                EntityName: 'Vector Databases'
            },
            {
                PropertyName: '_agentActions',
                EntityName: 'AI Agent Actions'
            },
            {
                PropertyName: '_agentNoteTypes',
                EntityName: 'AI Agent Note Types'
            },
            {
                PropertyName: '_agentNotes',
                EntityName: 'AI Agent Notes'
            },
            {
                PropertyName: '_agents',
                EntityName: 'AI Agents'
            },
            {
                PropertyName: '_agentTypes',
                EntityName: 'AI Agent Types'
            },
            {
                PropertyName: '_artifactTypes',
                EntityName: 'MJ: Artifact Types'
            },
            {
                PropertyName: '_vendorTypeDefinitions',
                EntityName: 'MJ: AI Vendor Type Definitions'
            }, 
            {
                PropertyName: '_agentPrompts',
                EntityName: 'MJ: AI Agent Prompts'
            }
        ];
        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    protected override async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // handle associating prompts with prompt categories
        //here we're using the underlying data (i.e _promptCategories and _prompts)
        //rather than the getter methods because the engine's Loaded property is still false
        for(const PromptCategory of this._promptCategories){
            this._prompts.filter((prompt: AIPromptEntity) => {
                return prompt.CategoryID === PromptCategory.ID;
            }).forEach((prompt: AIPromptEntity) => {
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
            const models = AIEngineBase.Instance.Models.filter(m => m.AIModelType?.trim().toLowerCase() === modelType.trim().toLowerCase() && 
                                                                (vendorName && vendorName.length > 0 ? m.Vendor?.trim().toLowerCase() === vendorName.trim().toLowerCase() : true)); // if vendorname is not provided, then we get all models of the specified type 
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
 

    public get Agents(): AIAgentEntityExtended[] {
        return this._agents;
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
        AIEngineBase.checkMetadataLoaded();
        return AIEngineBase.Instance._agentPrompts;
    }


    public get AgentNoteTypes(): AIAgentNoteTypeEntity[] {
        return this._agentNoteTypes;
    }

    public AgenteNoteTypeIDByName(agentNoteTypeName: string): string {
        return this._agentNoteTypes.find(a => a.Name.trim().toLowerCase() === agentNoteTypeName.trim().toLowerCase())?.ID;
    }

    public get AgentNotes(): AIAgentNoteEntity[] {
        return this._agentNotes;
    }

    public get VendorTypeDefinitions(): AIVendorTypeDefinitionEntity[] {
        return this._vendorTypeDefinitions;
    }

    public get Prompts(): AIPromptEntity[] {
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
    public async CacheResult(model: AIModelEntity, prompt: AIPromptEntity, promptText: string, resultText: string): Promise<boolean> {
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
}