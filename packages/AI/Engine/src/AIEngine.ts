import { BaseLLM, BaseModel, BaseParams, BaseResult, ChatParams, GetAIAPIKey } from "@memberjunction/ai";
import { SummarizeResult } from "@memberjunction/ai";
import { ClassifyResult } from "@memberjunction/ai";
import { ChatResult } from "@memberjunction/ai";
import { BaseEngine, BaseEntity, LogError, Metadata, RunView, UserInfo } from "@memberjunction/core";
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { AIActionEntity, AIModelActionEntity, AIModelEntity, AIModelEntityExtended, AIPromptCategoryEntity, AIPromptEntity, AIPromptTypeEntity, AIResultCacheEntity, EntityAIActionEntity, EntityDocumentEntity, EntityDocumentTypeEntity, VectorDatabaseEntity } from "@memberjunction/core-entities";
import { AIPromptCategoryEntityExtended } from "./AIPromptCategoryExtended";


export class AIActionParams {
    actionId: string
    modelId: string
    modelName?: string
    systemPrompt?: string
    userPrompt?: string
}

export class EntityAIActionParams extends AIActionParams {
    entityAIActionId: string
    entityRecord: BaseEntity
}


// this class handles execution of AI Actions
export class AIEngine extends BaseEngine<AIEngine> {
    private _models: AIModelEntityExtended[] = [];
    private _vectorDatabases: VectorDatabaseEntity[] = [];
    private _actions: AIActionEntity[] = [];
    private _entityActions: EntityAIActionEntity[] = [];
    private _modelActions: AIModelActionEntity[] = [];
    private _prompts: AIPromptEntity[] = [];
    private _promptTypes: AIPromptTypeEntity[] = [];
    private _promptCategories: AIPromptCategoryEntityExtended[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
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
                PropertyName: '_actions',
                EntityName: 'AI Actions'
            },
            {
                PropertyName: '_entityActions',
                EntityName: 'Entity AI Actions'
            },
            {
                PropertyName: '_modelActions',
                EntityName: 'AI Model Actions'
            }
        ];
        return await this.Load(params, forceRefresh, contextUser);
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
            await AIEngine.Instance.Config(false, contextUser); // most of the time this is already loaded, but just in case it isn't we will load it here
            const models = AIEngine.Instance.Models.filter(m => m.AIModelType.trim().toLowerCase() === modelType.trim().toLowerCase() && 
                                                                (vendorName && vendorName.length > 0 ? m.Vendor.trim().toLowerCase() === vendorName.trim().toLowerCase() : true)); // if vendorname is not provided, then we get all models of the specified type 
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
     * Executes a simple completion task using the provided parameters. The underlying code uses the MJ AI BaseLLM and related class infrastructure to execute the task. 
     * This is simply a convenience method to make it easier to execute a completion task without having to deal with the underlying infrastructure. For more control,
     * use the underlying classes directly.
     * @param userPrompt 
     * @param contextUser 
     * @param systemPrompt 
     * @param model - optional, if not provided, @GetHighestPowerLLM will be called to get the highest power LLM model
     * @param apiKey 
     * @returns 
     */
    public async SimpleLLMCompletion(userPrompt: string, contextUser: UserInfo, systemPrompt?: string, model?: AIModelEntityExtended, apiKey?: string): Promise<string> {
        try {
            if (!userPrompt || userPrompt.length === 0)
                throw new Error('User prompt not provided.');

            await AIEngine.Instance.Config(false, contextUser);
            const modelToUse = model ? model : await this.GetHighestPowerLLM(null, contextUser);
            const apiKeyToUse = apiKey ? apiKey : GetAIAPIKey(modelToUse.DriverClass);   
            const modelInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, modelToUse.DriverClass, apiKeyToUse)

            const messages = [];
            if (systemPrompt && systemPrompt.length > 0)
                messages.push({ role: 'system', content: systemPrompt });
            messages.push({ role: 'user', content: userPrompt });

            const result = await modelInstance.ChatCompletion({
                messages: messages,
                model: modelToUse.APIName
            })
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

    public get Prompts(): AIPromptEntity[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._prompts;
    }

    public get PromptTypes(): AIPromptTypeEntity[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._promptTypes;
    }

    public get PromptCategories(): AIPromptCategoryEntityExtended[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._promptCategories;
    }

    public get Models(): AIModelEntityExtended[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._models;
    }

    /**
     * Convenience method to return only the Language Models. Loads the metadata if not already loaded.
     */
    public get LanguageModels(): AIModelEntityExtended[] {  
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._models.filter(m => m.AIModelType.trim().toLowerCase() === 'llm');
    }

    public get VectorDatabases(): VectorDatabaseEntity[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._vectorDatabases;
    }

    public get ModelActions(): AIModelActionEntity[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._modelActions;
    }

    public get Actions(): AIActionEntity[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._actions;
    }

    public get EntityAIActions(): EntityAIActionEntity[] {
        AIEngine.checkMetadataLoaded();
        return AIEngine.Instance._entityActions;
    }

    public static get Instance(): AIEngine {
        return super.getInstance<AIEngine>();
    }

    protected static checkMetadataLoaded(): void {
        if (!AIEngine.Instance.Loaded)
            throw new Error("AI Metadata not loaded, call AIEngine.Config() first.");
    }

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