import { BaseEntity, CompositeKey, EntitySaveOptions, IMetadataProvider, LogError, Metadata, QueryEntityInfo, QueryFieldInfo, QueryParameterInfo, QueryPermissionInfo, RunView, SimpleEmbeddingResult } from "@memberjunction/core";
import { QueryEntity, QueryParameterEntity, QueryFieldEntity, QueryEntityEntity } from "@memberjunction/core-entities";
import { RegisterClass, MJGlobal } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { BaseEmbeddings, EmbedTextParams, GetAIAPIKey } from "@memberjunction/ai";
import { EmbedTextLocalHelper } from "./util";

interface ExtractedParameter {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
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

    /**
     * Simple proxy to local helper method for embeddings. Needed for BaseEntity sub-classes that want to use embeddings built into BaseEntity
     * @param textToEmbed 
     * @returns 
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }
    
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if this is a new record or if SQL/Description has changed
            const sqlField = this.GetFieldByName('SQL');
            const descriptionField = this.GetFieldByName('Description');
            const shouldExtractData = !this.IsSaved || sqlField.Dirty;
            const shouldGenerateEmbedding = !this.IsSaved || descriptionField.Dirty;

            // Generate embedding for Description if needed, before saving
            if (shouldGenerateEmbedding) {
                await this.GenerateEmbeddingByFieldName("Description", "EmbeddingVector", "EmbeddingModelID");
            } else if (!this.Description || this.Description.trim().length === 0) {
                // Clear embedding if description is empty
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            // Save the query first without AI processing (no transaction needed for basic save)
            const saveResult = await super.Save(options);
            if (!saveResult) {
                return false;
            }

            // Extract and sync parameters AFTER saving, outside of any transaction
            // This prevents connection pool exhaustion from long-running AI operations
            if (shouldExtractData && this.SQL && this.SQL.trim().length > 0) {
                await this.extractAndSyncDataAsync();
                await this.RefreshRelatedMetadata(true); // sync the related metadata so this entity is correct
            } else if (!this.SQL || this.SQL.trim().length === 0) {
                // If SQL is empty, ensure UsesTemplate is false and remove all related data
                // This can also happen asynchronously since it's cleanup work
                this.UsesTemplate = false;
                await this.cleanupEmptyQueryAsync();
                await this.RefreshRelatedMetadata(true); // sync the related metadata so this entity is correct
            }

            return true;
        } catch (e) {
            LogError('Failed to save query:', e);
            this.LatestResult?.Errors.push(e);
            return false;
        }
    }

    override async Delete(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Perform the actual delete operation
            const deleteResult = await super.Delete(options);
            if (!deleteResult) {
                return false;
            }

            // CRITICAL: Refresh metadata cache after deletion to prevent stale query references
            // This ensures that MJAPI and any other services using cached metadata
            // immediately see that this query no longer exists
            await this.RefreshRelatedMetadata(true);

            return true;
        } catch (e) {
            LogError('Failed to delete query:', e);
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
            // This ensures the query is still usable even if AI extraction fails
            this.UsesTemplate = false;
            try {
                await super.Save();
            } catch (saveError) {
                LogError('Failed to save query after AI processing error:', saveError);
            }
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
            // Pre-check: Skip AI call if SQL doesn't contain Nunjucks syntax
            const hasNunjucksSyntax = this.SQL && (
                this.SQL.includes('{{') ||
                this.SQL.includes('{%') ||
                this.SQL.includes('{#')
            );

            if (!hasNunjucksSyntax) {
                // No Nunjucks syntax found - skip AI processing to save tokens/time
                this.UsesTemplate = false;
                return;
            }

            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser, this.ProviderToUse as any as IMetadataProvider);

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
                // AI extraction failed - log details for debugging
                console.warn(`Query "${this.Name}" - AI parameter extraction failed:`, {
                    success: result.success,
                    status: result.status,
                    errorMessage: result.errorMessage,
                    hasResult: !!result.result
                });
                this.UsesTemplate = false;
                return;
            }

            // Validate that result.result has the expected structure
            if (!result.result.parameters || !Array.isArray(result.result.parameters)) {
                // AI returned malformed result - log for debugging
                console.warn(`Query "${this.Name}" - AI returned malformed result:`, {
                    hasParameters: !!result.result.parameters,
                    isArray: Array.isArray(result.result.parameters),
                    resultKeys: Object.keys(result.result)
                });
                this.UsesTemplate = false;
                return;
            }

            // Process the extracted data in parallel
            const syncPromises: Promise<void>[] = [
                this.syncQueryParameters(result.result.parameters)
            ];

            if (result.result.selectClause && Array.isArray(result.result.selectClause) && result.result.selectClause.length > 0) {
                syncPromises.push(this.syncQueryFields(result.result.selectClause));
            }

            if (result.result.fromClause && Array.isArray(result.result.fromClause) && result.result.fromClause.length > 0) {
                syncPromises.push(this.syncQueryEntities(result.result.fromClause));
            }

            await Promise.all(syncPromises);

            // Update UsesTemplate flag based on whether parameters were found
            this.UsesTemplate = result.result.parameters.length > 0;
            
        } catch (e) {
            // Unexpected error during extraction - log for debugging but don't fail the save
            LogError(`Query "${this.Name}" AI extraction error:`, e);
            this.UsesTemplate = false;
        }
    }
    
    private async syncQueryParameters(extractedParams: ExtractedParameter[]): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        // Use same casting pattern as RefreshRelatedMetadata method
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            // Get existing query parameters
            const rv = this.RunViewProviderToUse
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

                // Normalize type to lowercase for case-insensitive matching
                const normalizedType = param.type?.toLowerCase();
                switch (normalizedType) {
                    case "array":
                    case "boolean":
                    case "string":
                    case "date":
                    case "number":
                        newParam.Type = normalizedType;
                        break;
                    case "object":
                        // Object type is supported in Nunjucks/RunQuery but not yet in database schema
                        // Store as string for now - the actual validation happens at runtime
                        console.log(`Query "${this.Name}" - Parameter "${param.name}" is type "object", storing as "string" (runtime will handle object validation)`);
                        newParam.Type = 'string';
                        break;
                    default:
                        console.warn(`Query "${this.Name}" - Unknown parameter type "${param.type}" for parameter "${param.name}", defaulting to "string"`);
                        newParam.Type = 'string';
                }

                newParam.IsRequired = param.isRequired;
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

                    // Normalize type to lowercase for case-insensitive comparison
                    const normalizedType = extractedParam.type?.toLowerCase();
                    const validTypes: Array<'array' | 'boolean' | 'string' | 'date' | 'number'> = ['array', 'boolean', 'string', 'date', 'number'];
                    const isValidType = validTypes.includes(normalizedType as any);

                    let targetType: 'array' | 'boolean' | 'string' | 'date' | 'number';
                    if (isValidType) {
                        targetType = normalizedType as any;
                    } else if (normalizedType === 'object') {
                        // Object type is supported in Nunjucks/RunQuery but not yet in database schema
                        console.log(`Query "${this.Name}" - Parameter "${extractedParam.name}" is type "object", storing as "string" (runtime will handle object validation)`);
                        targetType = 'string';
                    } else {
                        console.warn(`Query "${this.Name}" - Unknown parameter type "${extractedParam.type}" for parameter "${extractedParam.name}", defaulting to "string"`);
                        targetType = 'string';
                    }

                    // Check each property for changes
                    if (existingParam.Type !== targetType) {
                        existingParam.Type = targetType;
                        hasChanges = true;
                    }
                    if (existingParam.IsRequired !== extractedParam.isRequired) {
                        existingParam.IsRequired = extractedParam.isRequired;
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
            LogError(`Query "${this.Name}" - Failed to sync parameters:`, e);
            throw e;
        }
    }
    
    private async removeAllQueryParameters(): Promise<void> {
        try {
            if (this.IsSaved) {
                // Get all existing query parameters
                const rv = this.RunViewProviderToUse
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
        // Use the entity's provider instead of creating new Metadata instance
        // Use same casting pattern as RefreshRelatedMetadata method
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            const existingFields: QueryFieldEntity[] = [];
            if (this.IsSaved) {
                // Get existing query fields
                const rv = this.RunViewProviderToUse
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
            LogError(`Query "${this.Name}" - Failed to sync fields:`, e);
            throw e;
        }
    }
    
    private async syncQueryEntities(extractedEntities: ExtractedEntity[]): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        // Use same casting pattern as RefreshRelatedMetadata method
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            // Get existing query entities
            const existingEntities: QueryEntityEntity[] = [];
            if (this.IsSaved) {
                const rv = this.RunViewProviderToUse
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
            LogError(`Query "${this.Name}" - Failed to sync entities:`, e);
            throw e;
        }
    }
    
    private async removeAllQueryFields(): Promise<void> {
        try {
            if (!this.IsSaved) return; // Nothing to remove if not saved

            const rv = this.RunViewProviderToUse
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
            
            const rv = this.RunViewProviderToUse
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
            await globalMetadataProvider.Refresh(md); // we pass in our metadata provider because that is the connection we want to use if we are in the midst of a transaction
            if (globalMetadataProvider !== md) {
                // If the global metadata provider is different, we need to refresh it
                await md.Refresh(); // will refresh FROM the global provider, meaning we do NOT hit the DB again, we just copy the data into our MD instance that is part of our trans scope
            }
        }
        this._queryPermissions = md.QueryPermissions.filter(p => p.QueryID === this.ID);
        this._queryEntities = md.QueryEntities.filter(e => e.QueryID === this.ID);
        this._queryFields = md.QueryFields.filter(f => f.QueryID === this.ID);
        this._queryParameters = md.QueryParameters.filter(p => p.QueryID === this.ID);
    }

}

export function LoadQueryEntityServerSubClass() {}