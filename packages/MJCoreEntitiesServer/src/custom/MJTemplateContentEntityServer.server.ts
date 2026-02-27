import { BaseEntity, EntitySaveOptions, LogError, Metadata, RunView, IMetadataProvider } from "@memberjunction/core";
import { MJTemplateContentEntity, MJTemplateParamEntity, MJTemplateEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";

interface ExtractedParameter {
    name: string;
    type: 'Scalar' | 'Array' | 'Object';
    isRequired: boolean;
    description: string;
    usage: string[];
    defaultValue: string | null;
}

interface ParameterExtractionResult {
    parameters: ExtractedParameter[];
}

@RegisterClass(BaseEntity, 'MJ: Template Contents')
export class MJTemplateContentEntityServer extends MJTemplateContentEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const provider = Metadata.Provider as SQLServerDataProvider;
        
        // Start a database transaction
        await provider.BeginTransaction();
        
        try {
            // Check if this is a new record or if TemplateText has changed
            const templateTextField = this.GetFieldByName('TemplateText');
            const shouldExtractParams = !this.IsSaved || templateTextField.Dirty;
            
            // Save the template content first
            const saveResult = await super.Save(options);
            
            if (!saveResult) {
                await provider.RollbackTransaction();
                return false;
            }
            
            // Extract and sync parameters if needed
            if (shouldExtractParams && this.TemplateText && this.TemplateText.trim().length > 0) {
                await this.extractAndSyncParameters();
            }
            
            // Commit the transaction
            await provider.CommitTransaction();
            return true;
        } catch (e) {
            // Rollback on any error
            await provider.RollbackTransaction();
            LogError('Failed to save template content and extract parameters:', e);
            throw e;
        }
    }
    
    private async extractAndSyncParameters(): Promise<void> {
        try {
            if (this.Template === "Template Parameter Extraction") {
                return; // Skip extraction for this special case - this is ourselves!
            }
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);
            
            // Find the Template Parameter Extraction prompt
            const aiPrompt = AIEngine.Instance.Prompts.find(p => 
                p.Name === 'Template Parameter Extraction' && 
                p.Category === 'MJ: System'
            );
            
            if (!aiPrompt) {
                // prompt not configured, non-fatl, just warn and return
                console.warn('AI prompt for Template Parameter Extraction not found. Skipping parameter extraction.');
                return;
            }
            
            // Prepare prompt data
            const promptData = {
                templateText: this.TemplateText
            };
            
            // Execute the prompt using AIPromptRunner
            const promptRunner = new AIPromptRunner();
            const params = new AIPromptParams();
            params.prompt = aiPrompt;
            params.data = promptData;
            params.contextUser = this.ContextCurrentUser;
            
            const result = await promptRunner.ExecutePrompt<ParameterExtractionResult>(params);
            
            if (!result.success || !result.result) {
                LogError('Failed to extract template parameters:', result.errorMessage);
                return;
            }
            
            // Process the extracted parameters
            await this.syncTemplateParameters(result.result.parameters);
            
        } catch (e) {
            LogError('Error extracting template parameters:', e);
            // Don't throw here - we don't want to fail the save if parameter extraction fails
            // The user can still manually manage parameters if needed
        }
    }
    
    private normalizeParameterType(type: string): 'Scalar' | 'Array' | 'Object' | 'Record' | 'Entity' {
        // Normalize LLM output to match database constraint values
        const normalized = type.toLowerCase();
        switch (normalized) {
            case 'scalar':
            case 'string':
            case 'number':
            case 'boolean':
            case 'date':
                return 'Scalar';
            case 'array':
            case 'list':
                return 'Array';
            case 'object':
            case 'dict':
            case 'dictionary':
                return 'Object';
            case 'record':
                return 'Record';
            case 'entity':
                return 'Entity';
            default:
                console.warn(`Unknown parameter type '${type}', defaulting to 'Scalar'`);
                return 'Scalar';
        }
    }

    private async syncTemplateParameters(extractedParams: ExtractedParameter[]): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            // Get existing template parameters
            const rv = this.RunViewProviderToUse;
            const existingParamsResult = await rv.RunView<MJTemplateParamEntity>({
                EntityName: 'MJ: Template Params',
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);
            
            if (!existingParamsResult.Success) {
                throw new Error(`Failed to load existing template parameters: ${existingParamsResult.ErrorMessage}`);
            }
            
            const existingParams = existingParamsResult.Results || [];
            
            // Determine if we're in single or multiple template content scenario
            const templateContentsResult = await rv.RunView({
                EntityName: 'MJ: Template Contents',
                ExtraFilter: `TemplateID='${this.TemplateID}'`,
                ResultType: 'simple'
            }, this.ContextCurrentUser);
            
            const isMultipleContents = templateContentsResult.Success && 
                                     templateContentsResult.Results && 
                                     templateContentsResult.Results.length > 1;
            
            // For single template content, all params have TemplateContentID = NULL
            // For multiple contents, we need to be more careful about global vs content-specific params
            const templateContentID = isMultipleContents ? this.ID : null;
            
            // Filter existing params relevant to this content
            const relevantExistingParams = existingParams.filter(p => 
                isMultipleContents ? p.TemplateContentID === this.ID : p.TemplateContentID == null
            );
            
            // Convert extracted param names to lowercase for comparison
            const extractedParamNames = extractedParams.map(p => p.name.toLowerCase());
            
            // Find parameters to add, update, or remove
            const paramsToAdd = extractedParams.filter(p => 
                !relevantExistingParams.some(ep => ep.Name.toLowerCase() === p.name.toLowerCase())
            );
            
            const paramsToUpdate = relevantExistingParams.filter(ep =>
                extractedParams.some(p => p.name.toLowerCase() === ep.Name.toLowerCase())
            );
            
            const paramsToRemove = relevantExistingParams.filter(ep =>
                !extractedParamNames.includes(ep.Name.toLowerCase())
            );
            
            // Prepare all save/delete operations
            const promises: Promise<boolean>[] = [];
            
            // Add new parameters
            for (const param of paramsToAdd) {
                const newParam = await md.GetEntityObject<MJTemplateParamEntity>('MJ: Template Params', this.ContextCurrentUser);
                newParam.TemplateID = this.TemplateID;
                newParam.TemplateContentID = templateContentID;
                newParam.Name = param.name;
                newParam.Type = this.normalizeParameterType(param.type);
                newParam.IsRequired = false; // LLM has been unreliable here, make them ALL optional so we don't break template rendering in case it picks up stuff that is NOT really a param... param.isRequired;
                newParam.DefaultValue = param.defaultValue;
                newParam.Description = param.description;
                promises.push(newParam.Save());
            }
            
            // Update existing parameters if properties changed
            for (const existingParam of paramsToUpdate) {
                const extractedParam = extractedParams.find(p => p.name.toLowerCase() === existingParam.Name.toLowerCase());
                if (extractedParam) {
                    let hasChanges = false;

                    // Check each property for changes
                    const normalizedType = this.normalizeParameterType(extractedParam.type);
                    if (existingParam.Type !== normalizedType) {
                        existingParam.Type = normalizedType;
                        hasChanges = true;
                    }
                    if (existingParam.IsRequired !== extractedParam.isRequired) {
                        existingParam.IsRequired = false; // SEE ABOVE - make not required in all cases....  extractedParam.isRequired;
                        hasChanges = true;
                    }
                    if (existingParam.DefaultValue !== extractedParam.defaultValue) {
                        existingParam.DefaultValue = extractedParam.defaultValue;
                        hasChanges = true;
                    }
                    if (existingParam.Description !== extractedParam.description) {
                        existingParam.Description = extractedParam.description;
                        hasChanges = true;
                    }
                    
                    if (hasChanges) {
                        promises.push(existingParam.Save());
                    }
                }
            }
            
            // Remove parameters that are no longer in the template
            for (const paramToRemove of paramsToRemove) {
                promises.push(paramToRemove.Delete());
            }
            
            // Execute all operations in parallel
            if (promises.length > 0) {
                await Promise.all(promises); // saving these is non-critical
            }
            
            // If this is multiple contents scenario, we might need to handle global params
            // This is a more complex scenario that would require analyzing all template contents
            // For now, we're handling content-specific params only
            
        } catch (e) {
            LogError('Failed to sync template parameters:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
}