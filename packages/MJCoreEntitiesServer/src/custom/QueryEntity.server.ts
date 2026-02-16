import { BaseEntity, CompositeKey, EntitySaveOptions, IMetadataProvider, LogError, Metadata, QueryEntityInfo, QueryFieldInfo, QueryParameterInfo, QueryPermissionInfo, RunView, SimpleEmbeddingResult } from "@memberjunction/core";
import { MJQueryEntity, MJQueryParameterEntity, MJQueryFieldEntity, MJQueryEntityEntity } from "@memberjunction/core-entities";
import { RegisterClass, MJGlobal } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { BaseEmbeddings, EmbedTextParams, GetAIAPIKey } from "@memberjunction/ai";
import { EmbedTextLocalHelper } from "./util";
import { SQLParser } from "./sql-parser";

interface ExtractedParameter {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
    isRequired: boolean;
    description: string;
    usage: string[];
    defaultValue: string | null;
    sampleValue: string | null;
}

interface ExtractedField {
    name: string;
    dynamicName?: boolean;
    description: string;
    type: 'number' | 'string' | 'date' | 'boolean';
    optional: boolean;
    // Source entity tracking - identifies where the field data originates
    sourceEntity?: string | null;      // Entity name this field comes from (null if computed/aggregated)
    sourceFieldName?: string | null;   // Original field name on the source entity (null if computed/aggregated)
    isComputed?: boolean;              // True if field is an expression/calculation (not direct column)
    isSummary?: boolean;               // True if field uses aggregate function (SUM, COUNT, AVG, etc.)
    computationDescription?: string;   // Explanation of how the field is computed (if applicable)
}

interface ParameterExtractionResult {
    parameters: ExtractedParameter[];
    selectClause?: ExtractedField[];
}

@RegisterClass(BaseEntity, 'MJ: Queries')
export class QueryEntityExtended extends MJQueryEntity {
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
            // Check if SQL contains Nunjucks syntax (determines if query uses templates/parameters)
            const hasNunjucksSyntax = this.SQL && (
                this.SQL.includes('{{') ||
                this.SQL.includes('{%') ||
                this.SQL.includes('{#')
            );

            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser, this.ProviderToUse as any as IMetadataProvider);

            // Find the SQL Query Parameter Extraction prompt
            const aiPrompt = AIEngine.Instance.Prompts.find(p =>
                p.Name === 'SQL Query Parameter Extraction' &&
                p.Category === 'MJ: System'
            );

            if (!aiPrompt) {
                // Prompt not configured, non-fatal, just warn and return
                console.warn('AI prompt for SQL Query Parameter Extraction not found. Skipping query metadata extraction.');
                this.UsesTemplate = false;
                return;
            }

            // First, do a quick parse to identify entities from the SQL
            // We'll use this to provide entity metadata to the LLM for better type inference
            const entityMetadata = await this.extractEntityMetadataFromSQL();

            // Prepare prompt data - we'll send the SQL as templateText since the prompt
            // is designed to extract both parameters (if any) and query fields/entities
            const promptData = {
                templateText: this.SQL,
                entities: entityMetadata
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
                console.warn(`Query "${this.Name}" - AI query metadata extraction failed:`, {
                    success: result.success,
                    status: result.status,
                    errorMessage: result.errorMessage,
                    hasResult: !!result.result
                });
                this.UsesTemplate = false;
                return;
            }

            // Process the extracted data in parallel
            const syncPromises: Promise<void>[] = [];

            // Sync parameters if we have Nunjucks syntax and parameters were extracted
            // For non-templated queries, ensure any stale parameters are removed
            if (hasNunjucksSyntax && result.result.parameters && Array.isArray(result.result.parameters)) {
                syncPromises.push(this.syncQueryParameters(result.result.parameters));
            } else {
                // No Nunjucks syntax - remove any existing parameters
                syncPromises.push(this.removeAllQueryParameters());
            }

            // Always sync query fields if we got a selectClause back
            if (result.result.selectClause && Array.isArray(result.result.selectClause) && result.result.selectClause.length > 0) {
                syncPromises.push(this.syncQueryFields(result.result.selectClause));
            }

            // Use deterministic SQL parsing for entity extraction instead of LLM
            // entityMetadata is already extracted above and is more reliable than LLM extraction
            if (entityMetadata.length > 0) {
                syncPromises.push(this.syncQueryEntities(entityMetadata));
            }

            await Promise.all(syncPromises);

            // Update UsesTemplate flag based on whether Nunjucks syntax exists and parameters were found
            this.UsesTemplate = hasNunjucksSyntax &&
                result.result.parameters &&
                Array.isArray(result.result.parameters) &&
                result.result.parameters.length > 0;

        } catch (e) {
            // Unexpected error during extraction - log for debugging but don't fail the save
            LogError(`Query "${this.Name}" AI extraction error:`, e);
            this.UsesTemplate = false;
        }
    }
    
    /**
     * Extracts entity metadata from the SQL to provide context to the LLM for parameter type inference.
     * Uses node-sql-parser for robust SQL parsing after pre-processing Nunjucks templates.
     */
    private async extractEntityMetadataFromSQL(): Promise<Array<{
        name: string;
        schemaName: string;
        baseView: string;
        fields: Array<{ name: string; type: string; isPrimaryKey: boolean }>;
    }>> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const results: Array<{
            name: string;
            schemaName: string;
            baseView: string;
            fields: Array<{ name: string; type: string; isPrimaryKey: boolean }>;
        }> = [];

        if (!this.SQL) return results;

        try {
            // Use the shared SQLParser with Nunjucks preprocessing
            const parseResult = SQLParser.ParseWithTemplatePreprocessing(this.SQL);

            // Cross-reference parsed tables against entity metadata
            for (const tableRef of parseResult.Tables) {
                const matchingEntity = md.Entities.find(e =>
                    (e.BaseView.toLowerCase() === tableRef.TableName.toLowerCase() ||
                     e.BaseTable.toLowerCase() === tableRef.TableName.toLowerCase()) &&
                    e.SchemaName.toLowerCase() === tableRef.SchemaName.toLowerCase()
                );

                if (matchingEntity) {
                    // Filter to fields that are actually referenced in the SQL
                    const relevantFields = matchingEntity.Fields
                        .filter(f => {
                            const fieldLower = f.Name.toLowerCase();
                            for (const colRef of parseResult.Columns) {
                                const colLower = colRef.ColumnName.toLowerCase();
                                if (colLower === fieldLower) return true;
                                // Check if column qualifier matches table alias or name
                                if (colRef.TableQualifier) {
                                    const qualLower = colRef.TableQualifier.toLowerCase();
                                    if ((qualLower === tableRef.Alias.toLowerCase() ||
                                         qualLower === tableRef.TableName.toLowerCase()) &&
                                        colLower === fieldLower) {
                                        return true;
                                    }
                                }
                            }
                            // Also include primary keys as they're always useful context
                            return f.IsPrimaryKey;
                        })
                        .slice(0, 20)
                        .map(f => ({
                            name: f.Name,
                            type: f.Type,
                            isPrimaryKey: f.IsPrimaryKey
                        }));

                    if (relevantFields.length > 0) {
                        results.push({
                            name: matchingEntity.Name,
                            schemaName: matchingEntity.SchemaName,
                            baseView: matchingEntity.BaseView,
                            fields: relevantFields
                        });
                    }
                }
            }

            return results;
        } catch (error) {
            console.warn(`Error in extractEntityMetadataFromSQL: ${error}`);
            return results;
        }
    }

    private async syncQueryParameters(extractedParams: ExtractedParameter[]): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        // Use same casting pattern as RefreshRelatedMetadata method
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            // Get existing query parameters
            const rv = this.RunViewProviderToUse
            const existingParams: MJQueryParameterEntity[] = [];
            if (this.IsSaved) {
                const existingParamsResult = await rv.RunView<MJQueryParameterEntity>({
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
                const newParam = await md.GetEntityObject<MJQueryParameterEntity>('MJ: Query Parameters', this.ContextCurrentUser);
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
                newParam.SampleValue = param.sampleValue;
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
                    if (existingParam.SampleValue !== extractedParam.sampleValue) {
                        existingParam.SampleValue = extractedParam.sampleValue;
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
                const existingParamsResult = await rv.RunView<MJQueryParameterEntity>({
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
    
    /**
     * Expands wildcard (*) entries in the extracted fields list.
     * When AI returns a field with sourceFieldName="*", it indicates a SELECT table.* pattern.
     * We expand this into individual field entries by looking up the entity's fields from metadata.
     */
    private expandWildcardFields(extractedFields: ExtractedField[], md: IMetadataProvider): ExtractedField[] {
        const expandedFields: ExtractedField[] = [];

        for (const field of extractedFields) {
            // Check if this is a wildcard entry: sourceFieldName is "*" and sourceEntity is set
            if (field.sourceFieldName === '*' && field.sourceEntity) {
                // Look up the entity in metadata
                const sourceEntityInfo = md.Entities.find(e =>
                    e.Name.toLowerCase() === field.sourceEntity!.toLowerCase()
                );

                if (sourceEntityInfo) {
                    // Expand the wildcard into individual fields from the entity
                    for (const entityField of sourceEntityInfo.Fields) {
                        // Map SQL type to our simplified type system
                        let fieldType: 'number' | 'string' | 'date' | 'boolean' = 'string';
                        const sqlTypeLower = entityField.Type.toLowerCase();
                        if (sqlTypeLower.includes('int') || sqlTypeLower.includes('decimal') ||
                            sqlTypeLower.includes('numeric') || sqlTypeLower.includes('float') ||
                            sqlTypeLower.includes('real') || sqlTypeLower.includes('money')) {
                            fieldType = 'number';
                        } else if (sqlTypeLower.includes('date') || sqlTypeLower.includes('time')) {
                            fieldType = 'date';
                        } else if (sqlTypeLower.includes('bit')) {
                            fieldType = 'boolean';
                        }

                        expandedFields.push({
                            name: entityField.Name, // SQL Server returns original column names for *
                            description: entityField.Description || `${entityField.Name} field from ${field.sourceEntity}`,
                            type: fieldType,
                            optional: field.optional, // Inherit from the wildcard entry
                            sourceEntity: field.sourceEntity,
                            sourceFieldName: entityField.Name,
                            isComputed: false,
                            isSummary: false
                        });
                    }
                } else {
                    // Entity not found in metadata - keep the original entry as-is
                    // but log a warning
                    console.warn(`Query "${this.Name}" - Could not expand wildcard for entity "${field.sourceEntity}" - entity not found in metadata`);
                    expandedFields.push(field);
                }
            } else {
                // Not a wildcard entry - keep as-is
                expandedFields.push(field);
            }
        }

        return expandedFields;
    }

    private async syncQueryFields(extractedFields: ExtractedField[]): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        // Use same casting pattern as RefreshRelatedMetadata method
        const md = this.ProviderToUse as any as IMetadataProvider;

        // Expand any wildcard (*) entries before processing
        const fieldsToSync = this.expandWildcardFields(extractedFields, md);

        try {
            const existingFields: MJQueryFieldEntity[] = [];
            if (this.IsSaved) {
                // Get existing query fields
                const rv = this.RunViewProviderToUse
                const existingFieldsResult = await rv.RunView<MJQueryFieldEntity>({
                    EntityName: 'MJ: Query Fields',
                    ExtraFilter: `QueryID='${this.ID}'`,
                    ResultType: 'entity_object'
                }, this.ContextCurrentUser);

                if (!existingFieldsResult.Success) {
                    throw new Error(`Failed to load existing query fields: ${existingFieldsResult.ErrorMessage}`);
                }

                existingFields.push(...existingFieldsResult.Results || []);
            }

            // Convert field names to lowercase for comparison (using expanded fieldsToSync)
            const fieldNamesToSync = fieldsToSync.map(f => f.name.toLowerCase());

            // Find fields to add, update, or remove
            const fieldsToAdd = fieldsToSync.filter(f =>
                !existingFields.some(ef => ef.Name.toLowerCase() === f.name.toLowerCase())
            );

            const fieldsToUpdate = existingFields.filter(ef =>
                fieldsToSync.some(f => f.name.toLowerCase() === ef.Name.toLowerCase())
            );

            const fieldsToRemove = existingFields.filter(ef =>
                !fieldNamesToSync.includes(ef.Name.toLowerCase())
            );
            
            // Prepare all save/delete operations
            const promises: Promise<boolean>[] = [];
            
            // Add new fields
            for (let i = 0; i < fieldsToAdd.length; i++) {
                const field = fieldsToAdd[i];
                const newField = await md.GetEntityObject<MJQueryFieldEntity>('MJ: Query Fields', this.ContextCurrentUser);
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
                
                // Set computed/summary flags
                newField.IsComputed = field.isComputed || field.dynamicName || false;
                newField.IsSummary = field.isSummary || false;
                if (field.computationDescription) {
                    newField.ComputationDescription = field.computationDescription;
                }

                // Set source entity tracking
                if (field.sourceEntity) {
                    // Look up entity ID from entity name
                    const sourceEntityInfo = md.Entities.find(e =>
                        e.Name.toLowerCase() === field.sourceEntity!.toLowerCase()
                    );
                    if (sourceEntityInfo) {
                        newField.SourceEntityID = sourceEntityInfo.ID;
                    }
                }
                newField.SourceFieldName = field.sourceFieldName || (field.dynamicName ? field.name : null);

                promises.push(newField.Save());
            }
            
            // Update existing fields if properties changed
            for (const existingField of fieldsToUpdate) {
                const extractedField = fieldsToSync.find(f => f.name.toLowerCase() === existingField.Name.toLowerCase());
                if (extractedField) {
                    let hasChanges = false;

                    if (existingField.Description !== extractedField.description) {
                        existingField.Description = extractedField.description;
                        hasChanges = true;
                    }

                    const newIsComputed = extractedField.isComputed || extractedField.dynamicName || false;
                    if (existingField.IsComputed !== newIsComputed) {
                        existingField.IsComputed = newIsComputed;
                        hasChanges = true;
                    }

                    const newIsSummary = extractedField.isSummary || false;
                    if (existingField.IsSummary !== newIsSummary) {
                        existingField.IsSummary = newIsSummary;
                        hasChanges = true;
                    }

                    if (extractedField.computationDescription && existingField.ComputationDescription !== extractedField.computationDescription) {
                        existingField.ComputationDescription = extractedField.computationDescription;
                        hasChanges = true;
                    }

                    // Update source entity tracking
                    if (extractedField.sourceEntity) {
                        const sourceEntityInfo = md.Entities.find(e =>
                            e.Name.toLowerCase() === extractedField.sourceEntity!.toLowerCase()
                        );
                        if (sourceEntityInfo && existingField.SourceEntityID !== sourceEntityInfo.ID) {
                            existingField.SourceEntityID = sourceEntityInfo.ID;
                            hasChanges = true;
                        }
                    } else if (existingField.SourceEntityID != null) {
                        existingField.SourceEntityID = null;
                        hasChanges = true;
                    }

                    const newSourceFieldName = extractedField.sourceFieldName || (extractedField.dynamicName ? extractedField.name : null);
                    if (existingField.SourceFieldName !== newSourceFieldName) {
                        existingField.SourceFieldName = newSourceFieldName;
                        hasChanges = true;
                    }

                    if (existingField.Sequence !== fieldsToSync.indexOf(extractedField) + 1) {
                        existingField.Sequence = fieldsToSync.indexOf(extractedField) + 1;
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
    
    private async syncQueryEntities(extractedEntities: Array<{
        name: string;
        schemaName: string;
        baseView: string;
        fields: Array<{ name: string; type: string; isPrimaryKey: boolean }>;
    }>): Promise<void> {
        // Use the entity's provider instead of creating new Metadata instance
        // Use same casting pattern as RefreshRelatedMetadata method
        const md = this.ProviderToUse as any as IMetadataProvider;

        try {
            // Get existing query entities
            const existingEntities: MJQueryEntityEntity[] = [];
            if (this.IsSaved) {
                const rv = this.RunViewProviderToUse
                const existingEntitiesResult = await rv.RunView<MJQueryEntityEntity>({
                    EntityName: 'MJ: Query Entities',
                    ExtraFilter: `QueryID='${this.ID}'`,
                    ResultType: 'entity_object'
                }, this.ContextCurrentUser);

                if (!existingEntitiesResult.Success) {
                    throw new Error(`Failed to load existing query entities: ${existingEntitiesResult.ErrorMessage}`);
                }

                existingEntities.push(...existingEntitiesResult.Results || []);
            }
            // Look up MJ entity IDs for the extracted entities using pre-loaded metadata
            // Since extractEntityMetadataFromSQL already matched entities, we just need to find them by name
            const entityMappings = extractedEntities.map(extracted => {
                // Find matching entity in metadata by name (already matched during extraction)
                const matchingEntity = md.Entities.find(e =>
                    e.Name === extracted.name &&
                    e.SchemaName.toLowerCase() === extracted.schemaName.toLowerCase()
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
                    const newEntity = await md.GetEntityObject<MJQueryEntityEntity>('MJ: Query Entities', this.ContextCurrentUser);
                    newEntity.QueryID = this.ID;
                    newEntity.EntityID = mapping.entityID;
                    newEntity.DetectionMethod = 'AI'; // Using 'AI' as it's the closest match to automated detection
                    newEntity.AutoDetectConfidenceScore = 1.0; // 100% confidence since we're using deterministic SQL parsing
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
            const existingFieldsResult = await rv.RunView<MJQueryFieldEntity>({
                EntityName: 'MJ: Query Fields',
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
            const existingEntitiesResult = await rv.RunView<MJQueryEntityEntity>({
                EntityName: 'MJ: Query Entities',
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