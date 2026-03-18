import { BaseEntity, CompositeKey, EntitySaveOptions, IMetadataProvider, LogError, Metadata, QueryEntityInfo, QueryFieldInfo, QueryParameterInfo, QueryPermissionInfo, RunView, SimpleEmbeddingResult, SQLDialectInfo, TypeScriptTypeFromSQLType } from "@memberjunction/core";
import { QueryCompositionEngine } from "@memberjunction/generic-database-provider";
import { MJQueryEntity, MJQueryParameterEntity, MJQueryFieldEntity, MJQueryEntityEntity, MJQuerySQLEntity, MJQueryDependencyEntity } from "@memberjunction/core-entities";
import { RegisterClass, MJGlobal, UUIDsEqual } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { BaseEmbeddings, EmbedTextParams, GetAIAPIKey } from "@memberjunction/ai";
import {
    removeNPrefix,
    convertIdentifiers,
    convertCommonFunctions,
    convertDateFunctions,
    convertCharIndex,
    convertStuff,
    convertIIF,
    convertConvertFunction,
    convertCastTypes,
    convertTopToLimit,
    convertStringConcat,
    removeCollate,
} from "@memberjunction/sql-converter";
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
export class MJQueryEntityServer extends MJQueryEntity {
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

    /**
     * Generates an embedding from composite text (Name + UserQuestion + Description) for richer semantic search.
     * Stores the vector in EmbeddingVector and the model reference in EmbeddingModelID.
     */
    protected async GenerateCompositeEmbedding(): Promise<void> {
        const parts = [
            this.Name || '',
            this.UserQuestion || '',
            this.Description || ''
        ].filter(p => p.trim().length > 0);

        if (parts.length === 0) {
            this.EmbeddingVector = null;
            this.EmbeddingModelID = null;
            return;
        }

        const compositeText = parts.join(' | ');
        const result = await this.EmbedTextLocal(compositeText);
        if (result && result.vector && result.vector.length > 0) {
            this.EmbeddingVector = JSON.stringify(result.vector);
            this.EmbeddingModelID = result.modelID;
        }
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            // Check if this is a new record or if SQL/Description has changed
            const sqlField = this.GetFieldByName('SQL');
            const nameField = this.GetFieldByName('Name');
            const descriptionField = this.GetFieldByName('Description');
            const userQuestionField = this.GetFieldByName('UserQuestion');
            const shouldExtractData = !this.IsSaved || sqlField.Dirty;
            const shouldGenerateEmbedding = !this.IsSaved || nameField.Dirty || descriptionField.Dirty || userQuestionField.Dirty;

            // Generate embedding from composite text (Name + UserQuestion + Description) for better semantic search
            if (shouldGenerateEmbedding) {
                await this.GenerateCompositeEmbedding();
            } else if (!this.Description || this.Description.trim().length === 0) {
                // Clear embedding if description is empty
                this.EmbeddingVector = null;
                this.EmbeddingModelID = null;
            }

            // Auto-set Reusable=true for queries in Golden-Queries/ categories.
            // Golden Queries are composable building blocks, so they should always be reusable.
            if (this.CategoryID) {
                const categoryPath = this.buildCategoryPathFromID(this.CategoryID);
                if (categoryPath.toLowerCase().startsWith('golden-queries/') || categoryPath.toLowerCase() === 'golden-queries') {
                    this.Reusable = true;
                }
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
                // Auto-convert SQL to other dialects if configured
                await this.autoConvertDialectsAsync();
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
     * Builds a category path string from a CategoryID by walking up the category hierarchy.
     * Returns a path like "Golden-Queries/Sales" or "Golden-Queries".
     */
    private buildCategoryPathFromID(categoryID: string): string {
        const categories = Metadata.Provider.QueryCategories;
        const segments: string[] = [];
        let currentID: string | null = categoryID;

        while (currentID) {
            const cat = categories.find(c => c.ID.toLowerCase() === currentID!.toLowerCase());
            if (!cat) break;
            segments.unshift(cat.Name);
            currentID = cat.ParentID;
        }

        return segments.join('/');
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
                this.removeAllQueryEntities(),
                this.removeAllQuerySQLRecordsAsync()
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
            // Strip out {{query:"..."}} composition tokens first — they are NOT Nunjucks parameters
            const sqlWithoutCompositionTokens = this.SQL ? this.SQL.replace(/\{\{query:"[^"]+"\}\}/g, '') : '';
            const hasNunjucksSyntax = sqlWithoutCompositionTokens && (
                sqlWithoutCompositionTokens.includes('{{') ||
                sqlWithoutCompositionTokens.includes('{%') ||
                sqlWithoutCompositionTokens.includes('{#')
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

            // For SELECT * queries, use deterministic field extraction from entity metadata
            // instead of the AI (which can't enumerate all columns from *)
            // For SELECT * queries, use deterministic field extraction from entity metadata
            // instead of the AI (which can't enumerate all columns from *)
            const selectStarFields = this.buildFieldsForSelectStar();
            if (selectStarFields) {
                syncPromises.push(this.syncQueryFields(selectStarFields));
            } else if (result.result.selectClause && Array.isArray(result.result.selectClause) && result.result.selectClause.length > 0) {
                syncPromises.push(this.syncQueryFields(result.result.selectClause));
            }

            // Use deterministic SQL parsing for entity extraction instead of LLM
            // entityMetadata is already extracted above and is more reliable than LLM extraction
            if (entityMetadata.length > 0) {
                syncPromises.push(this.syncQueryEntities(entityMetadata));
            }

            // Sync query dependencies from {{query:"..."}} composition tokens (deterministic, no LLM)
            syncPromises.push(this.extractAndSyncQueryDependencies());

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
        // Filter out any parameter named "query" that came from {{query:"..."}} composition tokens.
        // The AI extraction prompt should skip these, but this is a safety net.
        const compositionTokenRegex = /\{\{query:"[^"]+"\}\}/;
        const filteredParams = extractedParams.filter(p => {
            if (p.name === 'query' && this.SQL && compositionTokenRegex.test(this.SQL)) {
                return false;
            }
            return true;
        });
        extractedParams = filteredParams;

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
     * Detects if the SQL uses SELECT * and if so, builds the complete field list deterministically
     * from entity metadata without relying on the AI (which can't enumerate * columns).
     * Returns null if the SQL doesn't use SELECT * or if entities can't be resolved.
     */
    private buildFieldsForSelectStar(): ExtractedField[] | null {
        if (!this.SQL) return null;

        // Check if SELECT clause contains * (possibly with table alias like "a.*")
        // Use a simple regex that matches SELECT ... * ... FROM (ignoring subqueries)
        const selectStarRegex = /\bSELECT\s+(?:(?:TOP\s+\d+|DISTINCT)\s+)?(\*|[\w.]+\.\*)\s+FROM\b/i;
        if (!selectStarRegex.test(this.SQL)) return null;

        const md = this.ProviderToUse as unknown as IMetadataProvider;

        try {
            const parseResult = SQLParser.ParseWithTemplatePreprocessing(this.SQL);
            const expandedFields: ExtractedField[] = [];

            for (const tableRef of parseResult.Tables) {
                const matchingEntity = md.Entities.find(e =>
                    (e.BaseView.toLowerCase() === tableRef.TableName.toLowerCase() ||
                     e.BaseTable.toLowerCase() === tableRef.TableName.toLowerCase()) &&
                    e.SchemaName.toLowerCase() === tableRef.SchemaName.toLowerCase()
                );

                if (matchingEntity) {
                    for (const entityField of matchingEntity.Fields) {
                        if (!expandedFields.some(f => f.name === entityField.Name)) {
                            expandedFields.push({
                                name: entityField.Name,
                                description: entityField.Description || `${entityField.Name} field from ${matchingEntity.Name}`,
                                type: TypeScriptTypeFromSQLType(entityField.Type).toLowerCase() as ExtractedField['type'],
                                optional: false,
                                sourceEntity: matchingEntity.Name,
                                sourceFieldName: entityField.Name,
                                isComputed: false,
                                isSummary: false
                            });
                        }
                    }
                }
            }

            // Also check for {{query:"..."}} composition tokens in FROM clause
            if (expandedFields.length === 0) {
                const compositionTokenRegex = /\{\{query:"([^"]+)"\}\}/g;
                let match: RegExpExecArray | null;

                while ((match = compositionTokenRegex.exec(this.SQL)) !== null) {
                    const tokenContent = match[1];
                    const parenIdx = tokenContent.indexOf('(');
                    const pathPart = parenIdx >= 0 ? tokenContent.substring(0, parenIdx) : tokenContent;
                    const segments = pathPart.split('/');
                    const queryName = segments[segments.length - 1].trim();

                    const referencedQuery = Metadata.Provider.Queries.find(q =>
                        q.Name.toLowerCase() === queryName.toLowerCase()
                    );

                    if (referencedQuery && referencedQuery.Fields.length > 0) {
                        for (const qField of referencedQuery.Fields) {
                            if (!expandedFields.some(f => f.name === qField.Name)) {
                                expandedFields.push({
                                    name: qField.Name,
                                    description: qField.Description || `${qField.Name} from query "${referencedQuery.Name}"`,
                                    type: TypeScriptTypeFromSQLType(qField.SQLBaseType).toLowerCase() as ExtractedField['type'],
                                    optional: false,
                                    sourceEntity: qField.SourceEntityID ? md.Entities.find(e => UUIDsEqual(e.ID, qField.SourceEntityID))?.Name || null : null,
                                    sourceFieldName: qField.SourceFieldName || null,
                                    isComputed: qField.IsComputed || false,
                                    isSummary: qField.IsSummary || false
                                });
                            }
                        }
                    }
                }
            }

            return expandedFields.length > 0 ? expandedFields : null;
        } catch (error) {
            console.warn(`Query "${this.Name}" - Error in buildFieldsForSelectStar:`, error);
            return null;
        }
    }

    /**
     * Finds an entity by name, checking both Name (which may have "MJ: " prefix) and DisplayName.
     * The AI often returns entity names without the "MJ: " prefix, so we need to match both.
     */
    private findEntityByName(md: IMetadataProvider, name: string): ReturnType<typeof md.Entities.find> {
        const lower = name.toLowerCase();
        return md.Entities.find(e =>
            e.Name.toLowerCase() === lower || (e.DisplayName && e.DisplayName.toLowerCase() === lower)
        );
    }

    /**
     * Expands wildcard (*) entries in the extracted fields list.
     * When AI returns a field with name="*" or sourceFieldName="*", we expand it into
     * individual field entries by looking up the source from metadata.
     * If the AI didn't provide a sourceEntity, we parse the SQL's FROM clause to find it.
     */
    private expandWildcardFields(extractedFields: ExtractedField[], md: IMetadataProvider): ExtractedField[] {
        // Check if any field is a wildcard that needs expansion
        const hasWildcard = extractedFields.some(f => f.name === '*' || f.sourceFieldName === '*');
        if (!hasWildcard) return extractedFields;

        const expandedFields: ExtractedField[] = [];

        for (const field of extractedFields) {
            const isWildcard = field.name === '*' || field.sourceFieldName === '*';
            if (!isWildcard) {
                expandedFields.push(field);
                continue;
            }

            // If we have a sourceEntity, try to resolve from it
            if (field.sourceEntity) {
                const sourceEntityInfo = this.findEntityByName(md, field.sourceEntity!);

                if (sourceEntityInfo) {
                    for (const entityField of sourceEntityInfo.Fields) {
                        expandedFields.push({
                            name: entityField.Name,
                            description: entityField.Description || `${entityField.Name} field from ${sourceEntityInfo.Name}`,
                            type: TypeScriptTypeFromSQLType(entityField.Type).toLowerCase() as ExtractedField['type'],
                            optional: field.optional,
                            sourceEntity: sourceEntityInfo.Name,
                            sourceFieldName: entityField.Name,
                            isComputed: false,
                            isSummary: false
                        });
                    }
                    continue;
                }

                // sourceEntity didn't match an entity — try as a query name
                const composedQuery = Metadata.Provider.Queries.find(q =>
                    q.Name.toLowerCase() === field.sourceEntity!.toLowerCase()
                );
                if (composedQuery && composedQuery.Fields.length > 0) {
                    for (const qField of composedQuery.Fields) {
                        expandedFields.push({
                            name: qField.Name,
                            description: qField.Description || `${qField.Name} from query "${composedQuery.Name}"`,
                            type: TypeScriptTypeFromSQLType(qField.SQLBaseType).toLowerCase() as ExtractedField['type'],
                            optional: field.optional,
                            sourceEntity: qField.SourceEntityID ? md.Entities.find(e => UUIDsEqual(e.ID, qField.SourceEntityID))?.Name || null : null,
                            sourceFieldName: qField.SourceFieldName || null,
                            isComputed: qField.IsComputed || false,
                            isSummary: qField.IsSummary || false
                        });
                    }
                    continue;
                }

                expandedFields.push(field);
                continue;
            }

            // No sourceEntity and no match — keep the raw entry as-is
            expandedFields.push(field);
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
                    // Look up entity ID from entity name (check both Name and DisplayName for "MJ: " prefix)
                    const sourceEntityInfo = this.findEntityByName(md, field.sourceEntity);
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
                        const sourceEntityInfo = this.findEntityByName(md, extractedField.sourceEntity);
                        if (sourceEntityInfo && !UUIDsEqual(existingField.SourceEntityID, sourceEntityInfo.ID)) {
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
                !existingEntities.some(ee => UUIDsEqual(ee.EntityID, mapping!.entityID))
            );
            
            const entitiesToRemove = existingEntities.filter(ee =>
                !entityMappings.some(mapping => UUIDsEqual(mapping!.entityID, ee.EntityID))
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

    /**
     * Deterministically extracts {{query:"..."}} composition references from this query's SQL
     * and syncs the QueryDependency records accordingly. No LLM needed — uses regex parsing.
     */
    private async extractAndSyncQueryDependencies(): Promise<void> {
        const compositionEngine = new QueryCompositionEngine();
        const sql = this.SQL;

        if (!sql || !compositionEngine.HasCompositionTokens(sql)) {
            // No composition tokens — remove any stale dependency records
            await this.removeAllQueryDependencies();
            return;
        }

        // Parse all {{query:"..."}} tokens
        const tokens = compositionEngine.ParseCompositionTokens(sql);
        if (tokens.length === 0) {
            await this.removeAllQueryDependencies();
            return;
        }

        // Resolve each token to a QueryInfo to get its ID
        const extractedDeps = this.resolveTokensToQueryDependencies(tokens);

        // Check for cycles before syncing
        const cycleError = await this.detectDependencyCycles(extractedDeps);
        if (cycleError) {
            LogError(`Query "${this.Name}" creates circular dependency: ${cycleError}. Dependencies will not be synced.`);
            return;
        }

        await this.syncQueryDependencies(extractedDeps);
    }

    /**
     * Resolves parsed composition tokens to dependency records with QueryIDs.
     */
    private resolveTokensToQueryDependencies(tokens: ReturnType<QueryCompositionEngine['ParseCompositionTokens']>): Array<{
        dependsOnQueryID: string;
        referencePath: string;
        alias: string | null;
        parameterMapping: Record<string, string> | null;
    }> {
        const allQueries = Metadata.Provider.Queries;
        const deps: Array<{
            dependsOnQueryID: string;
            referencePath: string;
            alias: string | null;
            parameterMapping: Record<string, string> | null;
        }> = [];

        for (const token of tokens) {
            const queryName = token.QueryName.toLowerCase();

            // Try category-qualified lookup first
            let matchedQuery: typeof allQueries[number] | undefined;
            if (token.CategorySegments.length > 0) {
                const expectedPath = `/${token.CategorySegments.join('/')}/`;
                matchedQuery = allQueries.find(q =>
                    q.Name.toLowerCase() === queryName &&
                    q.CategoryPath.toLowerCase() === expectedPath.toLowerCase()
                );
            }

            // Fall back to name-only
            if (!matchedQuery) {
                const nameMatches = allQueries.filter(q => q.Name.toLowerCase() === queryName);
                if (nameMatches.length === 1) {
                    matchedQuery = nameMatches[0];
                }
            }

            if (!matchedQuery) {
                LogError(`Query "${this.Name}": Referenced query not found: "${token.FullPath}". Dependency will not be tracked.`);
                continue;
            }

            // Validate the referenced query is marked Reusable
            if (!matchedQuery.Reusable) {
                throw new Error(
                    `Query "${this.Name}" references "${token.FullPath}" via composition syntax, ` +
                    `but "${matchedQuery.Name}" is not marked as Reusable. ` +
                    `Set Reusable=true on "${matchedQuery.Name}" before using it in {{query:"..."}} references.`
                );
            }

            // Extract alias from SQL context (look for the token followed by whitespace + identifier)
            const alias = this.extractAliasFromSQL(token.FullToken);

            // Build parameter mapping
            let parameterMapping: Record<string, string> | null = null;
            if (token.Parameters.length > 0) {
                parameterMapping = {};
                for (const param of token.Parameters) {
                    if (param.StaticValue !== null) {
                        parameterMapping[param.Name] = param.StaticValue;
                    } else if (param.PassThroughName !== null) {
                        parameterMapping[param.Name] = `@${param.PassThroughName}`;
                    }
                }
            }

            deps.push({
                dependsOnQueryID: matchedQuery.ID,
                referencePath: token.FullPath,
                alias,
                parameterMapping
            });
        }

        return deps;
    }

    /**
     * Extracts the SQL alias following a {{query:"..."}} token from this query's SQL.
     */
    private extractAliasFromSQL(fullToken: string): string | null {
        if (!this.SQL) return null;

        const tokenIndex = this.SQL.indexOf(fullToken);
        if (tokenIndex < 0) return null;

        const afterToken = this.SQL.substring(tokenIndex + fullToken.length);
        const aliasMatch = /^\s+(\w+)/i.exec(afterToken);

        // Make sure it's not a SQL keyword
        if (aliasMatch) {
            const keywords = new Set(['ON', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'GROUP', 'ORDER', 'HAVING', 'UNION', 'EXCEPT', 'INTERSECT', 'LIMIT', 'OFFSET', 'FETCH']);
            if (!keywords.has(aliasMatch[1].toUpperCase())) {
                return aliasMatch[1];
            }
        }

        return null;
    }

    /**
     * Detects circular dependencies by walking the dependency graph.
     * Returns a descriptive error string if a cycle is found, or null if clean.
     */
    private async detectDependencyCycles(
        proposedDeps: Array<{ dependsOnQueryID: string }>
    ): Promise<string | null> {
        const allDependencies = Metadata.Provider.QueryDependencies;

        const visited = new Set<string>();
        const stack = new Set<string>();

        const hasCycle = (queryID: string, path: string[]): string | null => {
            if (stack.has(queryID)) {
                const queryName = Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, queryID))?.Name || queryID;
                return [...path, queryName].join(' → ');
            }
            if (visited.has(queryID)) return null;

            visited.add(queryID);
            stack.add(queryID);
            const queryName = Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, queryID))?.Name || queryID;
            path.push(queryName);

            // Get existing dependencies for this query
            const deps = allDependencies.filter(d => d.QueryID === queryID);
            for (const dep of deps) {
                const result = hasCycle(dep.DependsOnQueryID, [...path]);
                if (result) return result;
            }

            stack.delete(queryID);
            return null;
        };

        // Check each proposed dependency
        for (const dep of proposedDeps) {
            // Simulate: dep.dependsOnQueryID → (its dependencies) → ... → back to this.ID?
            const visited2 = new Set<string>();
            const stack2 = new Set<string>([this.ID]);

            const checkFromDep = (queryID: string, path: string[]): string | null => {
                if (UUIDsEqual(queryID, this.ID)) {
                    return [...path, this.Name].join(' → ');
                }
                if (visited2.has(queryID)) return null;
                visited2.add(queryID);

                const queryName = Metadata.Provider.Queries.find(q => UUIDsEqual(q.ID, queryID))?.Name || queryID;
                path.push(queryName);

                const deps = allDependencies.filter(d => d.QueryID === queryID);
                for (const d of deps) {
                    const result = checkFromDep(d.DependsOnQueryID, [...path]);
                    if (result) return result;
                }

                return null;
            };

            const result = checkFromDep(dep.dependsOnQueryID, [this.Name]);
            if (result) return result;
        }

        return null;
    }

    /**
     * Syncs extracted query dependencies against existing QueryDependency records.
     * Follows the same add/update/delete pattern as syncQueryParameters/Fields/Entities.
     */
    private async syncQueryDependencies(extractedDeps: Array<{
        dependsOnQueryID: string;
        referencePath: string;
        alias: string | null;
        parameterMapping: Record<string, string> | null;
    }>): Promise<void> {
        const md = new Metadata();

        try {
            const existingDeps: MJQueryDependencyEntity[] = [];
            if (this.IsSaved) {
                const rv = this.RunViewProviderToUse;
                const existingResult = await rv.RunView<MJQueryDependencyEntity>({
                    EntityName: 'MJ: Query Dependencies',
                    ExtraFilter: `QueryID='${this.ID}'`,
                    ResultType: 'entity_object'
                }, this.ContextCurrentUser);

                if (!existingResult.Success) {
                    throw new Error(`Failed to load existing query dependencies: ${existingResult.ErrorMessage}`);
                }
                existingDeps.push(...(existingResult.Results || []));
            }

            // Compare: match on DependsOnQueryID + ReferencePath for uniqueness
            const depsToAdd = extractedDeps.filter(d =>
                !existingDeps.some(ed =>
                    UUIDsEqual(ed.DependsOnQueryID, d.dependsOnQueryID) &&
                    ed.ReferencePath === d.referencePath
                )
            );

            const depsToUpdate = existingDeps.filter(ed =>
                extractedDeps.some(d =>
                    UUIDsEqual(ed.DependsOnQueryID, d.dependsOnQueryID) &&
                    ed.ReferencePath === d.referencePath
                )
            );

            const depsToRemove = existingDeps.filter(ed =>
                !extractedDeps.some(d =>
                    UUIDsEqual(ed.DependsOnQueryID, d.dependsOnQueryID) &&
                    ed.ReferencePath === d.referencePath
                )
            );

            const promises: Promise<boolean>[] = [];

            // Add new dependencies
            for (const dep of depsToAdd) {
                const newDep = await md.GetEntityObject<MJQueryDependencyEntity>('MJ: Query Dependencies', this.ContextCurrentUser);
                newDep.QueryID = this.ID;
                newDep.DependsOnQueryID = dep.dependsOnQueryID;
                newDep.ReferencePath = dep.referencePath;
                newDep.Alias = dep.alias;
                newDep.ParameterMapping = dep.parameterMapping ? JSON.stringify(dep.parameterMapping) : null;
                newDep.DetectionMethod = 'Auto';
                promises.push(newDep.Save());
            }

            // Update existing dependencies (check for changes)
            for (const existingDep of depsToUpdate) {
                const extractedDep = extractedDeps.find(d =>
                    UUIDsEqual(existingDep.DependsOnQueryID, d.dependsOnQueryID) &&
                    existingDep.ReferencePath === d.referencePath
                );
                if (extractedDep) {
                    let hasChanges = false;

                    if (existingDep.Alias !== extractedDep.alias) {
                        existingDep.Alias = extractedDep.alias;
                        hasChanges = true;
                    }

                    const newMapping = extractedDep.parameterMapping ? JSON.stringify(extractedDep.parameterMapping) : null;
                    if (existingDep.ParameterMapping !== newMapping) {
                        existingDep.ParameterMapping = newMapping;
                        hasChanges = true;
                    }

                    if (hasChanges) {
                        promises.push(existingDep.Save());
                    }
                }
            }

            // Remove stale dependencies
            for (const depToRemove of depsToRemove) {
                promises.push(depToRemove.Delete());
            }

            if (promises.length > 0) {
                await Promise.all(promises);
            }

        } catch (e) {
            LogError(`Query "${this.Name}" - Failed to sync dependencies:`, e);
            throw e;
        }
    }

    /**
     * Removes all QueryDependency records for this query.
     */
    private async removeAllQueryDependencies(): Promise<void> {
        try {
            if (!this.IsSaved) return;

            const rv = this.RunViewProviderToUse;
            const existingResult = await rv.RunView({
                EntityName: 'MJ: Query Dependencies',
                ExtraFilter: `QueryID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            if (!existingResult.Success) {
                throw new Error(`Failed to load existing query dependencies: ${existingResult.ErrorMessage}`);
            }

            const existingDeps = existingResult.Results || [];
            const deletePromises = existingDeps.map(dep => dep.Delete());

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
        } catch (e) {
            LogError('Failed to remove query dependencies:', e);
            throw e;
        }
    }

    /**
     * Auto-converts the query's SQL to other dialects based on the queryDialects
     * configuration stored in GlobalObjectStore. Best-effort: failures never block the save.
     */
    private async autoConvertDialectsAsync(): Promise<void> {
        try {
            // Read config from GlobalObjectStore (set by MJServer at startup)
            const config = MJGlobal.Instance.GetGlobalObjectStore()?.['queryDialects'] as
                { autoConvertOnSave?: boolean; targetPlatforms?: string[] } | undefined;

            if (!config?.autoConvertOnSave || !config.targetPlatforms?.length) {
                return; // Auto-convert disabled or no targets configured
            }

            if (!this.SQL || this.SQL.trim().length === 0) {
                return; // Nothing to convert
            }

            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const dialects = md.SQLDialects;

            // Determine source dialect from query's SQLDialectID
            const sourceDialect = this.SQLDialectID
                ? dialects.find(d => UUIDsEqual(d.ID, this.SQLDialectID))
                : dialects.find(d => d.PlatformKey === 'sqlserver'); // Default to T-SQL

            if (!sourceDialect) {
                console.warn(`Query "${this.Name}" - Could not determine source dialect, skipping auto-convert`);
                return;
            }

            // Process each target platform independently
            for (const targetPlatformKey of config.targetPlatforms) {
                try {
                    // Skip if target is same as source
                    if (targetPlatformKey === sourceDialect.PlatformKey) {
                        continue;
                    }

                    const targetDialect = dialects.find(d => d.PlatformKey === targetPlatformKey);
                    if (!targetDialect) {
                        console.warn(`Query "${this.Name}" - Target dialect "${targetPlatformKey}" not found, skipping`);
                        continue;
                    }

                    // Currently only T-SQL → PostgreSQL is supported
                    if (sourceDialect.PlatformKey !== 'sqlserver' || targetPlatformKey !== 'postgresql') {
                        console.warn(`Query "${this.Name}" - Conversion from "${sourceDialect.PlatformKey}" to "${targetPlatformKey}" not yet supported`);
                        continue;
                    }

                    const convertedSQL = this.convertTSQLToPostgreSQL(this.SQL);
                    await this.upsertQuerySQLRecord(targetDialect, convertedSQL, md);

                } catch (platformError) {
                    // Per-platform isolation: failing on one target doesn't affect others
                    console.warn(`Query "${this.Name}" - Auto-convert to "${targetPlatformKey}" failed:`, platformError);
                }
            }
        } catch (e) {
            // Best-effort: never block the save
            console.warn(`Query "${this.Name}" - Auto-convert dialects failed:`, e);
        }
    }

    /**
     * Converts T-SQL to PostgreSQL using SQLConverter ExpressionHelper transforms.
     * Applies the standard transform pipeline for statement-level conversions.
     */
    private convertTSQLToPostgreSQL(sql: string): string {
        let result = sql;
        result = removeNPrefix(result);
        result = convertIdentifiers(result);
        result = convertCommonFunctions(result);
        result = convertDateFunctions(result);
        result = convertCharIndex(result);
        result = convertStuff(result);
        result = convertIIF(result);
        result = convertConvertFunction(result);
        result = convertCastTypes(result);
        result = convertTopToLimit(result);
        result = convertStringConcat(result);
        result = removeCollate(result);
        return result;
    }

    /**
     * Creates or updates a QuerySQL record for the given dialect.
     */
    private async upsertQuerySQLRecord(
        targetDialect: SQLDialectInfo,
        convertedSQL: string,
        md: IMetadataProvider
    ): Promise<void> {
        const rv = this.RunViewProviderToUse;

        // Look for existing QuerySQL record for this query + dialect
        const existingResult = await rv.RunView<MJQuerySQLEntity>({
            EntityName: 'MJ: Query SQLs',
            ExtraFilter: `QueryID='${this.ID}' AND SQLDialectID='${targetDialect.ID}'`,
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);

        if (!existingResult.Success) {
            console.warn(`Query "${this.Name}" - Failed to look up existing QuerySQL record: ${existingResult.ErrorMessage}`);
            return;
        }

        let record: MJQuerySQLEntity;
        if (existingResult.Results?.length > 0) {
            // Update existing
            record = existingResult.Results[0];
        } else {
            // Create new
            record = await md.GetEntityObject<MJQuerySQLEntity>('MJ: Query SQLs', this.ContextCurrentUser);
            record.QueryID = this.ID;
            record.SQLDialectID = targetDialect.ID;
        }

        record.SQL = convertedSQL;

        const saved = await record.Save();
        if (!saved) {
            console.warn(`Query "${this.Name}" - Failed to save QuerySQL record for dialect "${targetDialect.Name}"`);
        }
    }

    /**
     * Removes all QuerySQL records for this query. Called during cleanup operations.
     */
    private async removeAllQuerySQLRecordsAsync(): Promise<void> {
        try {
            if (!this.IsSaved) return;

            const rv = this.RunViewProviderToUse;
            const result = await rv.RunView<MJQuerySQLEntity>({
                EntityName: 'MJ: Query SQLs',
                ExtraFilter: `QueryID='${this.ID}'`,
                ResultType: 'entity_object'
            }, this.ContextCurrentUser);

            if (!result.Success) {
                console.warn(`Query "${this.Name}" - Failed to load QuerySQL records for cleanup: ${result.ErrorMessage}`);
                return;
            }

            const deletePromises = (result.Results || []).map(r => r.Delete());
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
            }
        } catch (e) {
            console.warn(`Query "${this.Name}" - Failed to remove QuerySQL records:`, e);
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
        this._queryPermissions = md.QueryPermissions.filter(p => UUIDsEqual(p.QueryID, this.ID));
        this._queryEntities = md.QueryEntities.filter(e => UUIDsEqual(e.QueryID, this.ID));
        this._queryFields = md.QueryFields.filter(f => UUIDsEqual(f.QueryID, this.ID));
        this._queryParameters = md.QueryParameters.filter(p => UUIDsEqual(p.QueryID, this.ID));
    }

}