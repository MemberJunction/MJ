import { BaseEntity, CompositeKey, EntitySaveOptions, IMetadataProvider, LogError, Metadata, QueryEntityInfo, QueryFieldInfo, QueryInfo, QueryParameterInfo, QueryPermissionInfo, SimpleEmbeddingResult, SQLDialectInfo, TypeScriptTypeFromSQLType } from "@memberjunction/core";
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
import { SQLParser } from "@memberjunction/sql-parser";
import type { MJParameterInfo, SQLSelectColumn } from "@memberjunction/sql-parser";

interface ExtractedParameter {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
    isRequired: boolean;
    description: string;
    usage: string[];
    defaultValue: string | null;
    sampleValue: string | null;
}

/**
 * Metadata inherited from a dependency query's parameter for passthrough parameters.
 * Used as a fallback source for description and sampleValue when LLM enrichment is unavailable.
 */
interface PassthroughParamContext {
    /** Description from the dependency query's parameter (may be null if not set) */
    description: string | null;
    /** Sample value from the dependency query's parameter */
    sampleValue: string | null;
    /** Name of the dependency query */
    depQueryName: string;
    /** Parameter name in the dependency query */
    depParamName: string;
}

/**
 * A fully resolved composition reference. Produced once by `resolveCompositionReferences()`,
 * then consumed by both dependency sync and passthrough parameter extraction.
 */
interface ResolvedCompositionReference {
    /** The resolved dependency query from metadata */
    depQuery: QueryInfo;
    /** Full path as written in the composition token (e.g., "Demos/Active Users") */
    referencePath: string;
    /** SQL alias following the token (e.g., "base" in `{{query:"Q"}} base`) */
    alias: string | null;
    /** Parameter mapping: depParamName → static value or @passthroughName */
    parameterMapping: Record<string, string> | null;
    /** Passthrough parameter mappings from this composition ref */
    passthroughMappings: Array<{
        /** Variable name in the parent/outer query */
        parentParamName: string;
        /** Parameter name in the dependency query */
        depParamName: string;
    }>;
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
    // Deterministic SQL type overrides — set when resolved from dependency query fields or entity metadata.
    // When present, these take priority over the generic type→SQL mapping in syncQueryFields.
    sqlBaseType?: string | null;       // e.g., "nvarchar", "int", "decimal"
    sqlFullType?: string | null;       // e.g., "nvarchar(100)", "int", "decimal(18,2)"
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
            if (!this.SQL) {
                this.UsesTemplate = false;
                return;
            }

            // ── Deterministic analysis via SQLParser (source of truth) ──
            const analysis = SQLParser.Analyze(this.SQL);
            const deterministicParams = SQLParser.ExtractParameterInfo(this.SQL);

            // ── Composition reference resolution (single pass) ──
            // Resolves all {{query:"..."}} tokens, validates existence and Reusable flag,
            // and extracts passthrough parameter mappings. Throws on invalid references.
            const resolvedRefs = this.resolveCompositionReferences(this.SQL);
            const { params: passthroughParams, contextMap: passthroughContext } = this.buildPassthroughParams(resolvedRefs);
            const allDeterministicParams = this.mergePassthroughParams(deterministicParams, passthroughParams);

            const hasParameters = allDeterministicParams.length > 0;

            // Extract entity metadata deterministically (for LLM context and entity sync)
            const entityMetadata = await this.extractEntityMetadataFromSQL();

            // ── LLM enrichment (descriptions and sample values only) ──
            const llmResult = await this.runLLMEnrichment(entityMetadata);

            // ── Merge: deterministic structure + LLM descriptions ──
            const syncPromises: Promise<void>[] = [];

            // Parameters: SQLParser provides name, type, isRequired, defaultValue.
            // Passthrough params inherit metadata from the dependency query's parameters.
            // LLM provides description and sampleValue as enrichment.
            if (hasParameters) {
                const enrichedParams = this.mergeParametersWithLLM(allDeterministicParams, llmResult, passthroughContext);
                syncPromises.push(this.syncQueryParameters(enrichedParams));
            } else {
                syncPromises.push(this.removeAllQueryParameters());
            }

            // Fields: deterministic for SELECT *, LLM for explicit column lists.
            // Enrich with deterministic SQL types from:
            //   1. Composition ref fields (for composed queries)
            //   2. Entity view/table metadata (for base queries referencing entity views)
            // Composition enrichment runs first; entity enrichment fills remaining gaps.
            const selectStarFields = this.buildFieldsForSelectStar();
            if (selectStarFields) {
                const enriched = this.enrichFieldTypesFromEntityMetadata(
                    this.enrichFieldTypesFromCompositions(selectStarFields, resolvedRefs)
                );
                syncPromises.push(this.syncQueryFields(enriched));
            } else if (llmResult?.selectClause && Array.isArray(llmResult.selectClause) && llmResult.selectClause.length > 0) {
                const enriched = this.enrichFieldTypesFromEntityMetadata(
                    this.enrichFieldTypesFromCompositions(llmResult.selectClause, resolvedRefs)
                );
                syncPromises.push(this.syncQueryFields(enriched));
            }

            // Entities: deterministic SQL parsing (more reliable than LLM)
            if (entityMetadata.length > 0) {
                syncPromises.push(this.syncQueryEntities(entityMetadata));
            }

            // Dependencies: sync from already-resolved composition references
            syncPromises.push(this.syncResolvedDependencies(resolvedRefs));

            await Promise.all(syncPromises);

            // UsesTemplate is true when the query needs parameter values at execution time.
            // This includes direct template expressions AND passthrough parameters from compositions.
            this.UsesTemplate = hasParameters;

        } catch (e) {
            LogError(`Query "${this.Name}" extraction error:`, e);
            this.UsesTemplate = false;
        }
    }

    /**
     * Runs the LLM enrichment prompt to get descriptions and sample values.
     * Returns null if the LLM is unavailable or fails (non-fatal).
     */
    private async runLLMEnrichment(
        entityMetadata: Array<{ name: string; schemaName: string; baseView: string; fields: Array<{ name: string; type: string; isPrimaryKey: boolean }> }>
    ): Promise<ParameterExtractionResult | null> {
        try {
            await AIEngine.Instance.Config(false, this.ContextCurrentUser, this.ProviderToUse as unknown as IMetadataProvider);

            const aiPrompt = AIEngine.Instance.Prompts.find(p =>
                p.Name === 'SQL Query Parameter Extraction' &&
                p.Category === 'MJ: System'
            );

            if (!aiPrompt) {
                console.warn('AI prompt for SQL Query Parameter Extraction not found. Descriptions will use heuristics.');
                return null;
            }

            const promptRunner = new AIPromptRunner();
            const params = new AIPromptParams();
            params.prompt = aiPrompt;
            params.data = { templateText: this.SQL, entities: entityMetadata };
            params.contextUser = this.ContextCurrentUser;

            const result = await promptRunner.ExecutePrompt<ParameterExtractionResult>(params);

            if (!result.success || !result.result) {
                console.warn(`Query "${this.Name}" - LLM enrichment failed, using heuristic descriptions.`);
                return null;
            }

            return result.result;
        } catch (e) {
            console.warn(`Query "${this.Name}" - LLM enrichment error, using heuristic descriptions:`, e);
            return null;
        }
    }

    /**
     * Merges deterministic parameter extraction (SQLParser) with LLM enrichment.
     *
     * Priority chain for description and sampleValue:
     *   1. LLM enrichment (best quality when available)
     *   2. Inherited from dependency query parameter (for passthrough params)
     *   3. Heuristic fallback (generated from type/name)
     *
     * SQLParser is the authority for: name, type, isRequired, defaultValue
     */
    private mergeParametersWithLLM(
        deterministicParams: MJParameterInfo[],
        llmResult: ParameterExtractionResult | null,
        passthroughContext: Map<string, PassthroughParamContext> = new Map()
    ): ExtractedParameter[] {
        const llmParams = llmResult?.parameters ?? [];

        return deterministicParams.map(dp => {
            // Find matching LLM parameter by name (case-insensitive)
            const llmMatch = llmParams.find(lp => lp.name.toLowerCase() === dp.name.toLowerCase());

            // For passthrough params, use inherited description/sampleValue as mid-tier fallback
            const ptContext = passthroughContext.get(dp.name.toLowerCase());
            const inheritedDescription = ptContext
                ? this.buildPassthroughDescription(dp, ptContext)
                : null;

            return {
                name: dp.name,
                type: dp.type === 'unknown' ? (llmMatch?.type ?? 'string') : dp.type,
                isRequired: dp.isRequired,
                description: llmMatch?.description ?? inheritedDescription ?? this.generateParameterDescription(dp),
                usage: llmMatch?.usage ?? dp.usageLocations,
                defaultValue: dp.defaultValue !== null ? String(dp.defaultValue) : (llmMatch?.defaultValue ?? null),
                sampleValue: llmMatch?.sampleValue ?? ptContext?.sampleValue ?? this.generateSampleValue(dp),
            };
        });
    }

    /**
     * Generates a deterministic description for a parameter when LLM is unavailable.
     * Uses the parameter name, type, and filter information to create a meaningful description.
     */
    private generateParameterDescription(param: MJParameterInfo): string {
        const typeDescriptions: Record<string, string> = {
            'string': 'text value',
            'number': 'numeric value',
            'date': 'date value',
            'boolean': 'true/false flag',
            'array': 'list of values',
        };

        const typeDesc = typeDescriptions[param.type] || 'value';
        const requiredDesc = param.isRequired ? 'Required' : 'Optional';
        const humanName = param.name.replace(/([A-Z])/g, ' $1').trim();
        const defaultDesc = param.defaultValue !== null ? ` (default: ${param.defaultValue})` : '';

        return `${requiredDesc} ${typeDesc} for ${humanName}${defaultDesc}`;
    }

    /**
     * Builds a description for a passthrough parameter by inheriting from the dependency
     * query's parameter description and adding composition context.
     */
    private buildPassthroughDescription(param: MJParameterInfo, context: PassthroughParamContext): string {
        const suffix = ` (passed through to "${context.depQueryName}" as "${context.depParamName}")`;

        // If the dependency param has a description, use it with passthrough context
        if (context.description) {
            return `${context.description}${suffix}`;
        }

        // Otherwise generate a type-based description with passthrough context
        return `${this.generateParameterDescription(param)}${suffix}`;
    }

    /**
     * Generates a deterministic sample value based on the parameter type.
     */
    private generateSampleValue(param: MJParameterInfo): string | null {
        if (param.defaultValue !== null) return String(param.defaultValue);

        switch (param.type) {
            case 'string': return 'Example';
            case 'number': return '10';
            case 'date': return '2024-01-01';
            case 'boolean': return 'true';
            case 'array': return 'Value1,Value2';
            default: return null;
        }
    }

    // ─── Composition Reference Resolution ─────────────────────────────────────

    /**
     * Resolves all {{query:"..."}} composition references in the SQL to their QueryInfo targets.
     *
     * This is the **single entry point** for composition resolution. Both dependency syncing
     * and passthrough parameter extraction consume the results of this method.
     *
     * Throws if:
     *  - A referenced query does not exist in the metadata cache
     *  - A referenced query is not marked Reusable
     */
    private resolveCompositionReferences(sql: string): ResolvedCompositionReference[] {
        const compositionEngine = new QueryCompositionEngine();
        if (!compositionEngine.HasCompositionTokens(sql)) return [];

        const tokens = compositionEngine.ParseCompositionTokens(sql);
        if (tokens.length === 0) return [];

        const allQueries = Metadata.Provider.Queries;
        const resolved: ResolvedCompositionReference[] = [];

        for (const token of tokens) {
            const depQuery = this.resolveQueryByNameAndCategory(token.QueryName, token.CategorySegments, allQueries);

            if (!depQuery) {
                throw new Error(
                    `Query "${this.Name}" references "${token.FullPath}" via {{query:"..."}} syntax, ` +
                    `but no matching query was found in the metadata. ` +
                    `Ensure the referenced query exists and has been saved before using it in composition.`
                );
            }

            if (!depQuery.Reusable) {
                throw new Error(
                    `Query "${this.Name}" references "${token.FullPath}" via composition syntax, ` +
                    `but "${depQuery.Name}" is not marked as Reusable. ` +
                    `Set Reusable=true on "${depQuery.Name}" before using it in {{query:"..."}} references.`
                );
            }

            const alias = this.extractAliasFromSQL(token.FullToken);
            const { parameterMapping, passthroughMappings } = this.buildParameterMappings(token.Parameters);

            resolved.push({
                depQuery,
                referencePath: token.FullPath,
                alias,
                parameterMapping,
                passthroughMappings,
            });
        }

        return resolved;
    }

    /**
     * Resolves a query by name and optional category path segments from the metadata cache.
     * Tries category-qualified lookup first, then falls back to name-only (if unambiguous).
     */
    private resolveQueryByNameAndCategory(
        queryName: string,
        categorySegments: string[],
        allQueries: QueryInfo[]
    ): QueryInfo | undefined {
        const queryNameLower = queryName.toLowerCase();

        // Try category-qualified lookup first
        if (categorySegments.length > 0) {
            const expectedPath = `/${categorySegments.join('/')}/`;
            const match = allQueries.find(q =>
                q.Name.toLowerCase() === queryNameLower &&
                q.CategoryPath.toLowerCase() === expectedPath.toLowerCase()
            );
            if (match) return match;
        }

        // Fall back to name-only (unambiguous match)
        const nameMatches = allQueries.filter(q => q.Name.toLowerCase() === queryNameLower);
        return nameMatches.length === 1 ? nameMatches[0] : undefined;
    }

    /**
     * Builds the parameter mapping and extracts passthrough mappings from parsed composition parameters.
     */
    private buildParameterMappings(params: Array<{ Name: string; StaticValue: string | null; PassThroughName: string | null }>): {
        parameterMapping: Record<string, string> | null;
        passthroughMappings: Array<{ parentParamName: string; depParamName: string }>;
    } {
        if (params.length === 0) return { parameterMapping: null, passthroughMappings: [] };

        const parameterMapping: Record<string, string> = {};
        const passthroughMappings: Array<{ parentParamName: string; depParamName: string }> = [];

        for (const param of params) {
            if (param.StaticValue !== null) {
                parameterMapping[param.Name] = param.StaticValue;
            } else if (param.PassThroughName !== null) {
                parameterMapping[param.Name] = `@${param.PassThroughName}`;
                passthroughMappings.push({
                    parentParamName: param.PassThroughName,
                    depParamName: param.Name,
                });
            }
        }

        return {
            parameterMapping: Object.keys(parameterMapping).length > 0 ? parameterMapping : null,
            passthroughMappings,
        };
    }

    /**
     * Extracts passthrough MJParameterInfo entries and PassthroughParamContext from resolved refs.
     * Inherits type, isRequired, defaultValue, description, and sampleValue from the dependency
     * query's parameter metadata when available.
     */
    private buildPassthroughParams(resolvedRefs: ResolvedCompositionReference[]): {
        params: MJParameterInfo[];
        contextMap: Map<string, PassthroughParamContext>;
    } {
        const passthroughParams: MJParameterInfo[] = [];
        const contextMap = new Map<string, PassthroughParamContext>();
        const seenParamNames = new Set<string>();

        for (const ref of resolvedRefs) {
            for (const mapping of ref.passthroughMappings) {
                const nameLower = mapping.parentParamName.toLowerCase();
                if (seenParamNames.has(nameLower)) continue;
                seenParamNames.add(nameLower);

                const depParam = ref.depQuery.Parameters.find(
                    p => p.Name.toLowerCase() === mapping.depParamName.toLowerCase()
                );

                passthroughParams.push({
                    name: mapping.parentParamName,
                    type: depParam ? this.mapQueryParamTypeToParserType(depParam.Type) : 'string',
                    isRequired: depParam ? depParam.IsRequired : true,
                    defaultValue: depParam?.DefaultValue ?? null,
                    filters: [],
                    usageLocations: [ref.referencePath],
                });

                contextMap.set(nameLower, {
                    description: depParam?.Description ?? null,
                    sampleValue: depParam?.SampleValue ?? null,
                    depQueryName: ref.depQuery.Name,
                    depParamName: mapping.depParamName,
                });
            }
        }

        return { params: passthroughParams, contextMap };
    }

    /**
     * Merges passthrough parameters into the deterministic parameter list,
     * skipping any that are already detected as direct template expressions.
     */
    private mergePassthroughParams(
        deterministicParams: MJParameterInfo[],
        passthroughParams: MJParameterInfo[]
    ): MJParameterInfo[] {
        if (passthroughParams.length === 0) return deterministicParams;

        const existingNames = new Set(deterministicParams.map(p => p.name.toLowerCase()));
        const merged = [...deterministicParams];

        for (const pt of passthroughParams) {
            if (!existingNames.has(pt.name.toLowerCase())) {
                merged.push(pt);
                existingNames.add(pt.name.toLowerCase());
            }
        }

        return merged;
    }

    /**
     * Maps a QueryParameterInfo.Type value to the MJParameterInfo type union.
     */
    private mapQueryParamTypeToParserType(
        type: 'string' | 'number' | 'date' | 'boolean' | 'array'
    ): MJParameterInfo['type'] {
        const validTypes: Set<MJParameterInfo['type']> = new Set(['string', 'number', 'date', 'boolean', 'array']);
        return validTypes.has(type as MJParameterInfo['type']) ? (type as MJParameterInfo['type']) : 'string';
    }

    // ─── Field Type Resolution from Composition References ────────────────────────

    /**
     * Enriches extracted fields with deterministic SQL types from composed query field metadata.
     *
     * For queries that reference other queries via {{query:"..."}}, we resolve field types
     * by matching field names against the dependency query's QueryFieldInfo. This gives us
     * the exact types that the dependency query publishes, rather than relying on LLM guesses.
     *
     * Uses SQLParser.ExtractSelectColumns() for deterministic SELECT clause parsing,
     * which handles direct columns and AS aliases via AST parsing.
     */
    private enrichFieldTypesFromCompositions(
        fields: ExtractedField[],
        resolvedRefs: ResolvedCompositionReference[]
    ): ExtractedField[] {
        if (resolvedRefs.length === 0 || fields.length === 0 || !this.SQL) return fields;

        // Build alias → resolved ref map
        const aliasToRef = new Map<string, ResolvedCompositionReference>();
        for (const ref of resolvedRefs) {
            if (ref.alias) {
                aliasToRef.set(ref.alias.toLowerCase(), ref);
            }
        }

        // Parse SELECT columns once via SQLParser (handles AS aliases deterministically)
        const selectColumns = SQLParser.ExtractSelectColumns(this.SQL);
        // Build outputName → select column map for quick lookup
        const outputNameToSelectCol = new Map<string, SQLSelectColumn>();
        for (const col of selectColumns) {
            outputNameToSelectCol.set(col.OutputName.toLowerCase(), col);
        }

        // Collect all dependency query fields into a flat lookup for unqualified fallback
        const allDepFields = this.buildDependencyFieldLookup(resolvedRefs);

        return fields.map(field => {
            if (field.sqlBaseType && field.sqlFullType) return field;

            const matchedField = this.resolveFieldFromSelectColumns(
                field.name, outputNameToSelectCol, aliasToRef
            ) ?? allDepFields.get(field.name.toLowerCase());

            if (matchedField) {
                return {
                    ...field,
                    sqlBaseType: matchedField.SQLBaseType,
                    sqlFullType: matchedField.SQLFullType,
                    sourceEntity: field.sourceEntity ?? (matchedField.SourceEntityID ? this.findEntityNameByID(matchedField.SourceEntityID) : null),
                    sourceFieldName: field.sourceFieldName ?? matchedField.SourceFieldName,
                    isComputed: field.isComputed ?? matchedField.IsComputed ?? false,
                    isSummary: field.isSummary ?? matchedField.IsSummary ?? false,
                };
            }

            return field;
        });
    }

    /**
     * Resolves a field's output name to a QueryFieldInfo by using the parsed SELECT columns.
     *
     * Uses the SQLParser-extracted SELECT column map to find the source column and table qualifier,
     * then matches against the composition ref's dependency query fields.
     *
     * Handles:
     *   - Direct: `u.Name` → OutputName="Name", SourceColumn="Name", TableQualifier="u"
     *   - AS alias: `e.Name AS EntityName` → OutputName="EntityName", SourceColumn="Name", TableQualifier="e"
     */
    private resolveFieldFromSelectColumns(
        fieldName: string,
        selectColumnMap: Map<string, SQLSelectColumn>,
        aliasToRef: Map<string, ResolvedCompositionReference>
    ): QueryFieldInfo | undefined {
        const selectCol = selectColumnMap.get(fieldName.toLowerCase());
        if (!selectCol || selectCol.IsExpression) return undefined;

        // If the select column has a table qualifier, look up the composition ref by alias
        if (selectCol.TableQualifier) {
            const ref = aliasToRef.get(selectCol.TableQualifier.toLowerCase());
            if (ref) {
                return ref.depQuery.Fields.find(
                    f => f.Name.toLowerCase() === selectCol.SourceColumn.toLowerCase()
                );
            }
        }

        // No table qualifier — try all composition refs
        for (const ref of aliasToRef.values()) {
            const match = ref.depQuery.Fields.find(
                f => f.Name.toLowerCase() === selectCol.SourceColumn.toLowerCase()
            );
            if (match) return match;
        }

        return undefined;
    }

    /**
     * Builds a flat field name → QueryFieldInfo lookup across all dependency queries.
     * Used as a fallback when alias-qualified matching doesn't succeed.
     * If the same field name exists in multiple dependencies, the first match wins.
     */
    private buildDependencyFieldLookup(
        resolvedRefs: ResolvedCompositionReference[]
    ): Map<string, QueryFieldInfo> {
        const lookup = new Map<string, QueryFieldInfo>();

        for (const ref of resolvedRefs) {
            for (const field of ref.depQuery.Fields) {
                const nameLower = field.Name.toLowerCase();
                if (!lookup.has(nameLower)) {
                    lookup.set(nameLower, field);
                }
            }
        }

        return lookup;
    }

    /**
     * Finds an entity name by its ID from the metadata cache.
     */
    private findEntityNameByID(entityID: string): string | null {
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const entity = md.Entities.find(e => UUIDsEqual(e.ID, entityID));
        return entity?.Name ?? null;
    }

    /**
     * Enriches extracted fields with deterministic SQL types from entity view/table metadata.
     *
     * For queries that directly reference entity views (e.g., `FROM __mj.vwUsers u`),
     * we resolve field types by matching field names against the entity's field metadata.
     * This is the source of truth for base queries — entity metadata provides exact SQL types
     * (e.g., `nvarchar(100)`) rather than the generic LLM fallback (`nvarchar(MAX)`).
     *
     * Uses SQLParser.ExtractSelectColumns() for deterministic SELECT clause parsing
     * and SQLParser.ExtractTableRefs() for entity view resolution.
     */
    private enrichFieldTypesFromEntityMetadata(fields: ExtractedField[]): ExtractedField[] {
        if (fields.length === 0 || !this.SQL) return fields;

        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const tableRefs = SQLParser.ExtractTableRefs(this.SQL);
        if (tableRefs.length === 0) return fields;

        // Build alias → entity map from table refs
        const aliasToEntity = new Map<string, { entity: typeof md.Entities[number] }>();
        for (const tableRef of tableRefs) {
            const matchingEntity = md.Entities.find(e =>
                (e.BaseView.toLowerCase() === tableRef.TableName.toLowerCase() ||
                 e.BaseTable.toLowerCase() === tableRef.TableName.toLowerCase()) &&
                e.SchemaName.toLowerCase() === tableRef.SchemaName.toLowerCase()
            );
            if (matchingEntity) {
                aliasToEntity.set(tableRef.Alias.toLowerCase(), { entity: matchingEntity });
            }
        }

        if (aliasToEntity.size === 0) return fields;

        // Parse SELECT columns via SQLParser for deterministic alias resolution
        const selectColumns = SQLParser.ExtractSelectColumns(this.SQL);
        const outputNameToSelectCol = new Map<string, SQLSelectColumn>();
        for (const col of selectColumns) {
            outputNameToSelectCol.set(col.OutputName.toLowerCase(), col);
        }

        // Build flat unqualified lookup (first entity wins for ambiguous names)
        const flatLookup = new Map<string, { field: typeof md.Entities[number]['Fields'][number]; entityName: string }>();
        for (const { entity } of aliasToEntity.values()) {
            for (const f of entity.Fields) {
                const nameLower = f.Name.toLowerCase();
                if (!flatLookup.has(nameLower)) {
                    flatLookup.set(nameLower, { field: f, entityName: entity.Name });
                }
            }
        }

        return fields.map(field => {
            if (field.sqlBaseType && field.sqlFullType) return field;

            // Use parsed SELECT column to find the source column and table qualifier
            const selectCol = outputNameToSelectCol.get(field.name.toLowerCase());
            let matched: { field: typeof md.Entities[number]['Fields'][number]; entityName: string } | undefined;

            if (selectCol && !selectCol.IsExpression) {
                // Try alias-qualified match via the parsed SELECT column's table qualifier
                if (selectCol.TableQualifier) {
                    const entityEntry = aliasToEntity.get(selectCol.TableQualifier.toLowerCase());
                    if (entityEntry) {
                        const entityField = entityEntry.entity.Fields.find(
                            f => f.Name.toLowerCase() === selectCol.SourceColumn.toLowerCase()
                        );
                        if (entityField) {
                            matched = { field: entityField, entityName: entityEntry.entity.Name };
                        }
                    }
                }

                // No table qualifier or no entity match — try unqualified by source column name
                if (!matched) {
                    matched = flatLookup.get(selectCol.SourceColumn.toLowerCase());
                }
            }

            // Final fallback: try unqualified by output name directly
            if (!matched) {
                matched = flatLookup.get(field.name.toLowerCase());
            }

            if (matched) {
                return {
                    ...field,
                    sqlBaseType: matched.field.Type,
                    sqlFullType: matched.field.SQLFullType,
                    sourceEntity: field.sourceEntity ?? matched.entityName,
                    sourceFieldName: field.sourceFieldName ?? matched.field.Name,
                };
            }

            return field;
        });
    }

    // ─── End Field Type Resolution ───────────────────────────────────────────────

    /**
     * Extracts entity metadata from the SQL to provide context to the LLM for parameter type inference.
     * Uses SQLParser for robust SQL parsing with MJ template support.
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
            const tableRefs = SQLParser.ExtractTableRefs(this.SQL);
            const columnRefs = SQLParser.ExtractColumnRefs(this.SQL);

            for (const tableRef of tableRefs) {
                const matchingEntity = md.Entities.find(e =>
                    (e.BaseView.toLowerCase() === tableRef.TableName.toLowerCase() ||
                     e.BaseTable.toLowerCase() === tableRef.TableName.toLowerCase()) &&
                    e.SchemaName.toLowerCase() === tableRef.SchemaName.toLowerCase()
                );

                if (matchingEntity) {
                    const relevantFields = matchingEntity.Fields
                        .filter(f => {
                            const fieldLower = f.Name.toLowerCase();
                            for (const colRef of columnRefs) {
                                const colLower = colRef.ColumnName.toLowerCase();
                                if (colLower === fieldLower) return true;
                                if (colRef.TableQualifier) {
                                    const qualLower = colRef.TableQualifier.toLowerCase();
                                    if ((qualLower === tableRef.Alias.toLowerCase() ||
                                         qualLower === tableRef.TableName.toLowerCase()) &&
                                        colLower === fieldLower) {
                                        return true;
                                    }
                                }
                            }
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
                newParam.DetectionMethod = 'AI'; // Structure from SQLParser AST, descriptions enriched by LLM
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
        const selectStarRegex = /\bSELECT\s+(?:(?:TOP\s+\d+|DISTINCT)\s+)?(\*|[\w.]+\.\*)\s+FROM\b/i;
        if (!selectStarRegex.test(this.SQL)) return null;

        const md = this.ProviderToUse as unknown as IMetadataProvider;

        try {
            const tableRefs = SQLParser.ExtractTableRefs(this.SQL);
            const expandedFields: ExtractedField[] = [];

            for (const tableRef of tableRefs) {
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
                const compositionRefs = SQLParser.ExtractCompositionRefs(this.SQL);
                for (const ref of compositionRefs) {
                    const referencedQuery = Metadata.Provider.Queries.find(q =>
                        q.Name.toLowerCase() === ref.queryName.toLowerCase()
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
                
                // Use deterministic SQL types when available (from dependency query fields
                // or entity metadata), otherwise fall back to generic type mapping.
                if (field.sqlBaseType && field.sqlFullType) {
                    newField.SQLBaseType = field.sqlBaseType;
                    newField.SQLFullType = field.sqlFullType;
                } else {
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

                    // Update SQL types if deterministic types are available
                    if (extractedField.sqlBaseType && extractedField.sqlFullType) {
                        if (existingField.SQLBaseType !== extractedField.sqlBaseType) {
                            existingField.SQLBaseType = extractedField.sqlBaseType;
                            hasChanges = true;
                        }
                        if (existingField.SQLFullType !== extractedField.sqlFullType) {
                            existingField.SQLFullType = extractedField.sqlFullType;
                            hasChanges = true;
                        }
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
     * Syncs QueryDependency records from already-resolved composition references.
     * Performs cycle detection before writing to the database.
     * Removes stale dependencies if no composition references exist.
     */
    private async syncResolvedDependencies(resolvedRefs: ResolvedCompositionReference[]): Promise<void> {
        if (resolvedRefs.length === 0) {
            await this.removeAllQueryDependencies();
            return;
        }

        // Map resolved refs to the shape expected by syncQueryDependencies
        const extractedDeps = resolvedRefs.map(ref => ({
            dependsOnQueryID: ref.depQuery.ID,
            referencePath: ref.referencePath,
            alias: ref.alias,
            parameterMapping: ref.parameterMapping,
        }));

        // Check for cycles before syncing
        const cycleError = await this.detectDependencyCycles(extractedDeps);
        if (cycleError) {
            throw new Error(
                `Query "${this.Name}" creates circular dependency: ${cycleError}.`
            );
        }

        await this.syncQueryDependencies(extractedDeps);
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