import { BaseEntity, CompositeKey, EntitySaveOptions, IMetadataProvider, LogError, Metadata, QueryEntityInfo, QueryFieldInfo, QueryParameterInfo, QueryPermissionInfo, RunView } from "@memberjunction/core";
import { QueryEntity, QueryParameterEntity, QueryFieldEntity, QueryEntityEntity, QueryPermissionEntity } from "@memberjunction/core-entities";
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

interface ExtractedField {
    name: string;
    dynamicName?: boolean;
    description: string;
    type: 'number' | 'string' | 'date' | 'boolean';
    optional: boolean;
}

interface ExtractedEntity {
    schemaName: string;
    baseViewOrTable: string;
    alias?: string;
}

interface ParameterExtractionResult {
    parameters: ExtractedParameter[];
    selectClause?: ExtractedField[];
    fromClause?: ExtractedEntity[];
}

@RegisterClass(BaseEntity, 'Queries')
export class QueryEntityExtended extends QueryEntity {
    private _queryEntities: QueryEntityInfo[] = [];
    private _queryFields: QueryFieldInfo[] = [];
    private _queryParameters: QueryParameterInfo[] = [];
    private _queryPermissions: QueryPermissionInfo[] = [];

    public get QueryEntities(): QueryEntityInfo[] {
        return this._queryEntities;
    }

    public get QueryFields(): QueryFieldInfo[] {
        return this._queryFields;
    }

    public get QueryParameters(): QueryParameterInfo[] {
        return this._queryParameters;
    }

    public get QueryPermissions(): QueryPermissionInfo[] {
        return this._queryPermissions;
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if this is a new record or if SQL has changed
            const sqlField = this.GetFieldByName('SQL');
            const shouldExtractData = !this.IsSaved || sqlField.Dirty;
            
            // Save the query first without AI processing (no transaction needed for basic save)
            const saveResult = await super.Save(options);
            if (!saveResult) {
                return false;
            }

            // Extract and sync parameters AFTER saving, outside of any transaction
            // This prevents connection pool exhaustion from long-running AI operations
            if (shouldExtractData && this.SQL && this.SQL.trim().length > 0) {
                // AI processing happens asynchronously after the main save operation
                // This ensures the connection is released quickly for the primary operation
                await this.extractAndSyncDataAsync();
                // setImmediate(() => {
                //     this.extractAndSyncDataAsync().catch(e => {
                //         LogError('Background AI processing failed for query:', e);
                //     });
                // });
            } else if (!this.SQL || this.SQL.trim().length === 0) {
                // If SQL is empty, ensure UsesTemplate is false and remove all related data
                // This can also happen asynchronously since it's cleanup work
                this.UsesTemplate = false;
                await this.cleanupEmptyQueryAsync();
                // setImmediate(() => {
                //     this.cleanupEmptyQueryAsync().catch(e => {
                //         LogError('Background cleanup failed for query:', e);
                //     });
                // });
            }

            await this.RefreshRelatedMetadata(true); // sync the related metadata so this entity is correct

            return true;
        } catch (e) {
            LogError('Failed to save query:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }
    
    /**
     * Asynchronous version of extractAndSyncData that runs outside the main save operation
     * to prevent connection pool exhaustion
     */
    private async extractAndSyncDataAsync(): Promise<void> {
        try {
            await this.extractAndSyncData();
            
            // Save the query again to update the UsesTemplate flag and any changes from AI processing
            // This is a separate, fast operation that doesn't involve AI
            const updateResult = await super.Save();
            if (!updateResult) {
                LogError('Failed to save query after AI processing completed');
            }
        } catch (e) {
            LogError('Error in async AI processing:', e);
            // Set UsesTemplate to false on error and save
            this.UsesTemplate = false;
            await super.Save().catch(saveError => {
                LogError('Failed to save query after AI processing error:', saveError);
            });
        }
    }
    
    /**
     * Asynchronous cleanup for empty queries
     */
    private async cleanupEmptyQueryAsync(): Promise<void> {
        try {
            await Promise.all([
                this.removeAllQueryParameters(),
                this.removeAllQueryFields(),
                this.removeAllQueryEntities()
            ]);
            
            // Save the updated UsesTemplate flag
            const updateResult = await super.Save();
            if (!updateResult) {
                LogError('Failed to save query after cleanup');
            }
        } catch (e) {
            LogError('Error in async cleanup:', e);
        }
    }
    
    private async extractAndSyncData(): Promise<void> {
        try {
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);
            
            // Find the Template Parameter Extraction prompt (we'll reuse it for SQL)
            const aiPrompt = AIEngine.Instance.Prompts.find(p => 
                p.Name === 'SQL Query Parameter Extraction' && 
                p.Category === 'MJ: System'
            );
            
            if (!aiPrompt) {
                // Prompt not configured, non-fatal, just warn and return
                console.warn('AI prompt for SQL Query Parameter Extraction not found. Skipping parameter extraction.');
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
            
            // Process the extracted data in parallel
            const syncPromises: Promise<void>[] = [
                this.syncQueryParameters(result.result.parameters)
            ];
            
            if (result.result.selectClause) {
                syncPromises.push(this.syncQueryFields(result.result.selectClause));
            }
            
            if (result.result.fromClause) {
                syncPromises.push(this.syncQueryEntities(result.result.fromClause));
            }
            
            await Promise.all(syncPromises);
            
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
            const existingParams: QueryParameterEntity[] = [];
            if (this.IsSaved) {
                const existingParamsResult = await rv.RunView<QueryParameterEntity>({
                    EntityName: 'MJ: Query Parameters',
                    ExtraFilter: `QueryID='${this.ID}'`,
                    ResultType: 'entity_object'
                }, this.ContextCurrentUser);
                
                if (!existingParamsResult.Success) {
                    throw new Error(`Failed to load existing query parameters: ${existingParamsResult.ErrorMessage}`);
                }
                
                existingParams.push (...existingParamsResult.Results || []);
            }
            
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
                const newParam = await md.GetEntityObject<QueryParameterEntity>('MJ: Query Parameters', this.ContextCurrentUser);
                newParam.QueryID = this.ID;
                newParam.Name = param.name;
                switch (param.type) {
                    case "array":
                    case "boolean":
                    case "string":
                    case "date":
                    case "number":
                        newParam.Type = param.type;
                        break;
                    default: 
                        newParam.Type = 'string'; // Default to string if unknown
                }
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
            if (this.IsSaved) {
                // Get all existing query parameters
                const rv = new RunView();
                const existingParamsResult = await rv.RunView<QueryParameterEntity>({
                    EntityName: 'MJ: Query Parameters',
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
            }            
        } catch (e) {
            LogError('Failed to remove query parameters:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
    
    private async syncQueryFields(extractedFields: ExtractedField[]): Promise<void> {
        const md = new Metadata();
        
        try {
            const existingFields: QueryFieldEntity[] = [];
            if (this.IsSaved) {
                // Get existing query fields
                const rv = new RunView();
                const existingFieldsResult = await rv.RunView<QueryFieldEntity>({
                    EntityName: 'Query Fields',
                    ExtraFilter: `QueryID='${this.ID}'`,
                    ResultType: 'entity_object'
                }, this.ContextCurrentUser);
                
                if (!existingFieldsResult.Success) {
                    throw new Error(`Failed to load existing query fields: ${existingFieldsResult.ErrorMessage}`);
                }
                
                existingFields.push(...existingFieldsResult.Results || []);
            }            

            // Convert extracted field names to lowercase for comparison
            const extractedFieldNames = extractedFields.map(f => f.name.toLowerCase());
            
            // Find fields to add, update, or remove
            const fieldsToAdd = extractedFields.filter(f => 
                !existingFields.some(ef => ef.Name.toLowerCase() === f.name.toLowerCase())
            );
            
            const fieldsToUpdate = existingFields.filter(ef =>
                extractedFields.some(f => f.name.toLowerCase() === ef.Name.toLowerCase())
            );
            
            const fieldsToRemove = existingFields.filter(ef =>
                !extractedFieldNames.includes(ef.Name.toLowerCase())
            );
            
            // Prepare all save/delete operations
            const promises: Promise<boolean>[] = [];
            
            // Add new fields
            for (let i = 0; i < fieldsToAdd.length; i++) {
                const field = fieldsToAdd[i];
                const newField = await md.GetEntityObject<QueryFieldEntity>('Query Fields', this.ContextCurrentUser);
                newField.QueryID = this.ID;
                newField.Name = field.name;
                newField.Description = field.description;
                newField.Sequence = i + 1;
                
                // Map type to SQL types
                switch (field.type) {
                    case 'number':
                        newField.SQLBaseType = 'decimal';
                        newField.SQLFullType = 'decimal(18,2)';
                        break;
                    case 'date':
                        newField.SQLBaseType = 'datetime';
                        newField.SQLFullType = 'datetime';
                        break;
                    case 'boolean':
                        newField.SQLBaseType = 'bit';
                        newField.SQLFullType = 'bit';
                        break;
                    default:
                        newField.SQLBaseType = 'nvarchar';
                        newField.SQLFullType = 'nvarchar(MAX)';
                }
                
                newField.IsComputed = field.dynamicName || false;
                if (field.dynamicName) {
                    newField.SourceFieldName = field.name;
                }
                
                promises.push(newField.Save());
            }
            
            // Update existing fields if properties changed
            for (const existingField of fieldsToUpdate) {
                const extractedField = extractedFields.find(f => f.name.toLowerCase() === existingField.Name.toLowerCase());
                if (extractedField) {
                    let hasChanges = false;
                    
                    if (existingField.Description !== extractedField.description) {
                        existingField.Description = extractedField.description;
                        hasChanges = true;
                    }
                    
                    const isDynamic = extractedField.dynamicName || false;
                    if (existingField.IsComputed !== isDynamic) {
                        existingField.IsComputed = isDynamic;
                        hasChanges = true;
                    }

                    if (existingField.Sequence !== extractedFields.indexOf(extractedField) + 1) {
                        existingField.Sequence = extractedFields.indexOf(extractedField) + 1;
                        hasChanges = true;
                    }
                    
                    if (hasChanges) {
                        promises.push(existingField.Save());
                    }
                }
            }
            
            // Remove fields that are no longer in the SQL
            for (const fieldToRemove of fieldsToRemove) {
                promises.push(fieldToRemove.Delete());
            }
            
            // Execute all operations in parallel
            if (promises.length > 0) {
                await Promise.all(promises);
            }
            
        } catch (e) {
            LogError('Failed to sync query fields:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
    
    private async syncQueryEntities(extractedEntities: ExtractedEntity[]): Promise<void> {
        const md = new Metadata();
        
        try {
            // Get existing query entities
            const existingEntities: QueryEntityEntity[] = [];
            if (this.IsSaved) {
                const rv = new RunView();
                const existingEntitiesResult = await rv.RunView<QueryEntityEntity>({
                    EntityName: 'Query Entities',
                    ExtraFilter: `QueryID='${this.ID}'`,
                    ResultType: 'entity_object'
                }, this.ContextCurrentUser);
                
                if (!existingEntitiesResult.Success) {
                    throw new Error(`Failed to load existing query entities: ${existingEntitiesResult.ErrorMessage}`);
                }
                
                existingEntities.push(...existingEntitiesResult.Results || []);
            }
            // Look up MJ entity IDs for the extracted base views using pre-loaded metadata
            const entityMappings = extractedEntities.map(extracted => {
                // Find matching entity in metadata
                const matchingEntity = md.Entities.find(e => 
                    ( 
                        e.BaseView.trim().toLowerCase() === extracted.baseViewOrTable?.trim().toLowerCase() || // match on the view
                        e.BaseTable.trim().toLowerCase() === extracted.baseViewOrTable?.trim().toLowerCase()   // OR the base table
                    )
                    && 
                    (e.SchemaName.trim().toLowerCase() === extracted.schemaName?.trim().toLowerCase() || 
                     (!extracted.schemaName || extracted.schemaName.trim().length === 0) && e.SchemaName.trim().toLowerCase() === 'dbo') // match on schema, OR if no schema specified, match dbo if the entity is in dbo
                );
                
                if (matchingEntity) {
                    return {
                        extracted,
                        entityID: matchingEntity.ID,
                        entityName: matchingEntity.Name
                    };
                }
                return null;
            }).filter(m => m !== null);
            
            // Find entities to add or remove
            const entitiesToAdd = entityMappings.filter(mapping => 
                !existingEntities.some(ee => ee.EntityID === mapping!.entityID)
            );
            
            const entitiesToRemove = existingEntities.filter(ee =>
                !entityMappings.some(mapping => mapping!.entityID === ee.EntityID)
            );
            
            // Prepare all save/delete operations
            const promises: Promise<boolean>[] = [];
            
            // Add new query entity relationships
            for (const mapping of entitiesToAdd) {
                if (mapping) {
                    const newEntity = await md.GetEntityObject<QueryEntityEntity>('Query Entities', this.ContextCurrentUser);
                    newEntity.QueryID = this.ID;
                    newEntity.EntityID = mapping.entityID;
                    newEntity.DetectionMethod = 'AI';
                    newEntity.AutoDetectConfidenceScore = 0.95; // High confidence since we're matching exact base view names
                    promises.push(newEntity.Save());
                }
            }
            
            // Remove entities that are no longer in the SQL
            for (const entityToRemove of entitiesToRemove) {
                promises.push(entityToRemove.Delete());
            }
            
            // Execute all operations in parallel
            if (promises.length > 0) {
                await Promise.all(promises);
            }
            
        } catch (e) {
            LogError('Failed to sync query entities:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
    
    private async removeAllQueryFields(): Promise<void> {
        try {
            if (!this.IsSaved) return; // Nothing to remove if not saved

            const rv = new RunView();
            const existingFieldsResult = await rv.RunView<QueryFieldEntity>({
                EntityName: 'Query Fields',
                ExtraFilter: `QueryID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);
            
            if (!existingFieldsResult.Success) {
                throw new Error(`Failed to load existing query fields: ${existingFieldsResult.ErrorMessage}`);
            }
            
            const existingFields = existingFieldsResult.Results || [];
            const deletePromises = existingFields.map(field => field.Delete());
            
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
            
        } catch (e) {
            LogError('Failed to remove query fields:', e);
            throw e;
        }
    }
    
    private async removeAllQueryEntities(): Promise<void> {
        try {
            if (!this.IsSaved) return; // Nothing to remove if not saved
            
            const rv = new RunView();
            const existingEntitiesResult = await rv.RunView<QueryEntityEntity>({
                EntityName: 'Query Entities',
                ExtraFilter: `QueryID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);
            
            if (!existingEntitiesResult.Success) {
                throw new Error(`Failed to load existing query entities: ${existingEntitiesResult.ErrorMessage}`);
            }
            
            const existingEntities = existingEntitiesResult.Results || [];
            const deletePromises = existingEntities.map(entity => entity.Delete());
            
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
            
        } catch (e) {
            LogError('Failed to remove query entities:', e);
            throw e;
        }
    }

    override async Load(ID: string, EntityRelationshipsToLoad?: string[]): Promise<boolean> {                
        const result = await super.Load(ID, EntityRelationshipsToLoad);        
        await this.RefreshRelatedMetadata(false);
        return result;
    }

    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        const result = await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad);
        await this.RefreshRelatedMetadata(false);
        return result;
    }

    override async LoadFromData(data: any, _replaceOldValues?: boolean): Promise<boolean> {
        const result = await super.LoadFromData(data, _replaceOldValues);
        await this.RefreshRelatedMetadata(false);
        return result;
    }

    /**
     * Refreshes this record's related metadata from the provider, refreshing
     * all the way up from the database if refreshFromDB is true, otherwise from
     * cache.
     * @param refreshFromDB 
     */
    public async RefreshRelatedMetadata(refreshFromDB: boolean) {
        const md = this.ProviderToUse as any as IMetadataProvider;
        if (refreshFromDB) {
            const globalMetadataProvider = Metadata.Provider;
            await globalMetadataProvider.Refresh();
            if (globalMetadataProvider !== md) {
                // If the global metadata provider is different, we need to refresh it
                await md.Refresh(); // will refresh from the global provider
            }
        }
        this._queryPermissions = md.QueryPermissions.filter(p => p.QueryID === this.ID);
        this._queryEntities = md.QueryEntities.filter(e => e.QueryID === this.ID);
        this._queryFields = md.QueryFields.filter(f => f.QueryID === this.ID);
        this._queryParameters = md.QueryParameters.filter(p => p.QueryID === this.ID);
    }

}

export function LoadQueryEntityServerSubClass() {}