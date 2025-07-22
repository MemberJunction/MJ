import { BaseEntity, EntitySaveOptions, LogError, Metadata, RunView } from "@memberjunction/core";
import { QueryEntity, QueryParameterEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";

interface ExtractedParameter {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array';
    isRequired: boolean;
    description: string;
    usage: string[];
    defaultValue: string | null;
}

interface ParameterExtractionResult {
    parameters: ExtractedParameter[];
}

@RegisterClass(BaseEntity, 'Queries')
export class QueryEntityExtended extends QueryEntity {
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const provider = Metadata.Provider as SQLServerDataProvider;
        
        // Start a database transaction
        await provider.BeginTransaction();
        
        try {
            // Check if this is a new record or if SQL has changed
            const sqlField = this.GetFieldByName('SQL');
            const shouldExtractParams = !this.IsSaved || sqlField.Dirty;
            
            // Save the query first
            const saveResult = await super.Save(options);
            
            if (!saveResult) {
                await provider.RollbackTransaction();
                return false;
            }
            
            // Extract and sync parameters if needed
            if (shouldExtractParams && this.SQL && this.SQL.trim().length > 0) {
                await this.extractAndSyncParameters();
            } else if (!this.SQL || this.SQL.trim().length === 0) {
                // If SQL is empty, ensure UsesTemplate is false and remove any existing parameters
                this.UsesTemplate = false;
                await this.removeAllQueryParameters();
            }
            
            // Commit the transaction
            await provider.CommitTransaction();
            return true;
        } catch (e) {
            // Rollback on any error
            await provider.RollbackTransaction();
            LogError('Failed to save query and extract parameters:', e);
            throw e;
        }
    }
    
    private async extractAndSyncParameters(): Promise<void> {
        try {
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);
            
            // Find the Template Parameter Extraction prompt (we'll reuse it for SQL)
            const aiPrompt = AIEngine.Instance.Prompts.find(p => 
                p.Name === 'Template Parameter Extraction' && 
                p.Category === 'MJ: System'
            );
            
            if (!aiPrompt) {
                // Prompt not configured, non-fatal, just warn and return
                console.warn('AI prompt for Template Parameter Extraction not found. Skipping parameter extraction.');
                return;
            }
            
            // Prepare prompt data - we'll send the SQL as templateText since the prompt
            // is designed to extract Nunjucks parameters from any template content
            const promptData = {
                templateText: this.SQL
            };
            
            // Execute the prompt using AIPromptRunner
            const promptRunner = new AIPromptRunner();
            const params = new AIPromptParams();
            params.prompt = aiPrompt;
            params.data = promptData;
            params.contextUser = this.ContextCurrentUser;
            
            const result = await promptRunner.ExecutePrompt<ParameterExtractionResult>(params);
            
            if (!result.success || !result.result) {
                LogError('Failed to extract query parameters:', result.errorMessage);
                // Set UsesTemplate to false if extraction fails
                this.UsesTemplate = false;
                return;
            }
            
            // Process the extracted parameters
            await this.syncQueryParameters(result.result.parameters);
            
            // Update UsesTemplate flag based on whether parameters were found
            this.UsesTemplate = result.result.parameters.length > 0;
            
        } catch (e) {
            LogError('Error extracting query parameters:', e);
            // Set UsesTemplate to false on error
            this.UsesTemplate = false;
            // Don't throw here - we don't want to fail the save if parameter extraction fails
            // The user can still manually manage parameters if needed
        }
    }
    
    private async syncQueryParameters(extractedParams: ExtractedParameter[]): Promise<void> {
        const md = new Metadata();
        
        try {
            // Get existing query parameters
            const rv = new RunView();
            const existingParamsResult = await rv.RunView<QueryParameterEntity>({
                EntityName: 'Query Parameters',
                ExtraFilter: `QueryID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);
            
            if (!existingParamsResult.Success) {
                throw new Error(`Failed to load existing query parameters: ${existingParamsResult.ErrorMessage}`);
            }
            
            const existingParams = existingParamsResult.Results || [];
            
            // Convert extracted param names to lowercase for comparison
            const extractedParamNames = extractedParams.map(p => p.name.toLowerCase());
            
            // Find parameters to add, update, or remove
            const paramsToAdd = extractedParams.filter(p => 
                !existingParams.some(ep => ep.Name.toLowerCase() === p.name.toLowerCase())
            );
            
            const paramsToUpdate = existingParams.filter(ep =>
                extractedParams.some(p => p.name.toLowerCase() === ep.Name.toLowerCase())
            );
            
            const paramsToRemove = existingParams.filter(ep =>
                !extractedParamNames.includes(ep.Name.toLowerCase())
            );
            
            // Prepare all save/delete operations
            const promises: Promise<boolean>[] = [];
            
            // Add new parameters
            for (const param of paramsToAdd) {
                const newParam = await md.GetEntityObject<QueryParameterEntity>('Query Parameters', this.ContextCurrentUser);
                newParam.QueryID = this.ID;
                newParam.Name = param.name;
                newParam.Type = param.type;
                newParam.IsRequired = false; // Like templates, make all optional to avoid breaking queries
                newParam.DefaultValue = param.defaultValue;
                newParam.Description = param.description;
                newParam.DetectionMethod = 'AI'; // Indicate this was found via AI
                promises.push(newParam.Save());
            }
            
            // Update existing parameters if properties changed
            for (const existingParam of paramsToUpdate) {
                const extractedParam = extractedParams.find(p => p.name.toLowerCase() === existingParam.Name.toLowerCase());
                if (extractedParam) {
                    let hasChanges = false;
                    
                    // Check each property for changes
                    if (existingParam.Type !== extractedParam.type) {
                        existingParam.Type = extractedParam.type;
                        hasChanges = true;
                    }
                    if (existingParam.IsRequired !== extractedParam.isRequired) {
                        existingParam.IsRequired = false; // Keep all optional like templates
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
                    if (existingParam.DetectionMethod !== 'AI') {
                        existingParam.DetectionMethod = 'AI';
                        hasChanges = true;
                    }
                    
                    if (hasChanges) {
                        promises.push(existingParam.Save());
                    }
                }
            }
            
            // Remove parameters that are no longer in the SQL
            for (const paramToRemove of paramsToRemove) {
                promises.push(paramToRemove.Delete());
            }
            
            // Execute all operations in parallel
            if (promises.length > 0) {
                await Promise.all(promises);
            }
            
        } catch (e) {
            LogError('Failed to sync query parameters:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
    
    private async removeAllQueryParameters(): Promise<void> {
        try {
            // Get all existing query parameters
            const rv = new RunView();
            const existingParamsResult = await rv.RunView<QueryParameterEntity>({
                EntityName: 'Query Parameters',
                ExtraFilter: `QueryID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);
            
            if (!existingParamsResult.Success) {
                throw new Error(`Failed to load existing query parameters: ${existingParamsResult.ErrorMessage}`);
            }
            
            const existingParams = existingParamsResult.Results || [];
            
            // Delete all existing parameters
            const deletePromises = existingParams.map(param => param.Delete());
            
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
            
        } catch (e) {
            LogError('Failed to remove query parameters:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
}

export function LoadQueryEntityServerSubClass() {}