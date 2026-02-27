import { AdvancedGenerationFeature, configInfo } from "../Config/config";
import { FieldCategoryInfo, LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams, AIPromptRunResult } from "@memberjunction/ai-core-plus";
import { MJAIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import { AIEngine } from "@memberjunction/aiengine";

export type EntityNameResult = { entityName: string, tableName: string }
export type EntityDescriptionResult = { entityDescription: string, tableName: string }
export type CheckConstraintParserResult = { Description: string, Code: string, MethodName: string, ModelID: string }

export type SmartFieldIdentificationResult = {
    nameField: string;
    nameFieldReason: string;
    defaultInView: string[];
    defaultInViewReason: string;
    searchableFields: string[];
    searchableFieldsReason: string;
    confidence: 'high' | 'medium' | 'low';
}

export type TransitiveJoinResult = {
    isJunctionTable: boolean;
    reason: string;
    additionalFields: Array<{
        fieldName: string;
        fieldType: 'virtual' | 'existing';
        includeInView: boolean;
        displayFields?: string[];
        reason: string;
    }>;
    confidence: 'high' | 'medium' | 'low';
}

export type EntityImportanceInfo = {
    defaultForNewUser: boolean;
    entityCategory: 'primary' | 'supporting' | 'reference' | 'junction' | 'system';
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
    recommendedSequence?: number;
}

/**
 * Result from LLM-assisted virtual entity field decoration.
 * Identifies PKs, FKs, field descriptions, and category assignments for constraint-less views.
 */
export type VirtualEntityDecorationResult = {
    primaryKeys: string[];
    foreignKeys: Array<{
        fieldName: string;
        relatedEntityName: string;
        relatedFieldName: string;
        confidence: 'high' | 'medium' | 'low';
    }>;
    fieldDescriptions: Array<{
        fieldName: string;
        description: string;
        extendedType: string | null;
        category: string | null;
        displayName: string | null;
        codeType: 'CSS' | 'HTML' | 'JavaScript' | 'SQL' | 'TypeScript' | 'Other' | null;
    }>;
    /** Font Awesome icon class for the entity (e.g. "fa-solid fa-chart-line") */
    entityIcon?: string;
    /** Per-category icon + description */
    categoryInfo?: Record<string, FieldCategoryInfo>;
    reasoning: string;
}

export type FormLayoutResult = {
    entityIcon?: string;
    fieldCategories: Array<{
        fieldName: string;
        category: string;
        reason: string;
        displayName: string;
        extendedType: 'Code' | 'Email' | 'FaceTime' | 'Geo' | 'MSTeams' | 'SIP' | 'SMS' | 'Skype' | 'Tel' | 'URL' | 'WhatsApp' | 'ZoomMtg' | null;
        codeType: 'CSS' | 'HTML' | 'JavaScript' | 'SQL' | 'TypeScript' | 'Other' | null;
    }>;
    /** @deprecated Use categoryInfo instead */
    categoryIcons?: Record<string, string>;
    /** New format: category name -> { icon, description } */
    categoryInfo?: Record<string, FieldCategoryInfo>;
    entityImportance?: EntityImportanceInfo;
}

/**
 * Enhanced Advanced Generation system using MJ's AI Prompts architecture.
 * All prompts are now stored in the database as AI Prompt entities with proper model configuration.
 */
export class AdvancedGeneration {
    private _metadata: Metadata;
    private _promptRunner: AIPromptRunner;

    constructor() {
        this._metadata = new Metadata();
        this._promptRunner = new AIPromptRunner();
    }

    public get enabled(): boolean {
        return configInfo.advancedGeneration?.enableAdvancedGeneration ?? false;
    }

    public features(): AdvancedGenerationFeature[] | undefined {
        return configInfo.advancedGeneration?.features;
    }

    public getFeature(featureName: string): AdvancedGenerationFeature | undefined {
        return this.features()?.find(f => f.name === featureName);
    }

    public featureEnabled(featureName: string): boolean {
        return this.enabled && this.getFeature(featureName)?.enabled === true;
    }

    /**
     * Load a prompt by name from metadata.
     * Prompts include their model configuration via the MJ: AI Prompt Models relationship.
     */
    private async getPromptEntity(promptName: string, contextUser: UserInfo): Promise<MJAIPromptEntityExtended> {
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name.trim().toLowerCase() === promptName?.trim().toLowerCase());

        if (!prompt) {
            throw new Error(`Prompt '${promptName}' not found in database. Ensure the prompt metadata has been synced.`);
        }

        return prompt;
    }

    /**
     * Execute a prompt using AIPromptRunner.
     * Model selection and failover is handled automatically by the prompt's configuration.
     */
    private async executePrompt<T>(
        params: AIPromptParams
    ): Promise<AIPromptRunResult<T>> {
        try {
            const result = await this._promptRunner.ExecutePrompt<T>(params);
            return result;
        } catch (error) {
            LogError(`AdvancedGeneration:Prompt execution failed: ${error}`);
            throw error;
        }
    }

    /**
     * Smart Field Identification - determine name field and default in view
     */
    public async identifyFields(
        entity: any,
        contextUser: UserInfo
    ): Promise<SmartFieldIdentificationResult | null> {
        if (!this.featureEnabled('SmartFieldIdentification')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Smart Field Identification', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                entityName: entity.Name,
                entityDescription: entity.Description,
                fields: entity.Fields.map((f: any) => ({
                    Name: f.Name,
                    Type: f.Type,
                    IsNullable: f.AllowsNull,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsUnique: f.IsUnique,
                    IsForeignKey: f.EntityIDFieldName != null || (f.RelatedEntityID && f.RelatedEntityID.length > 0),
                    RelatedEntity: f.RelatedEntity || null,
                    Description: f.Description
                })),
                relationships: entity.RelatedEntities?.map((r: any) => ({
                    Name: r.Name,
                    RelatedEntity: r.RelatedEntity
                })) || []
            };
            params.contextUser = contextUser;

            const result = await this.executePrompt<SmartFieldIdentificationResult>(params);

            if (result.success && result.result) {
                return result.result;
            } else {
                LogError(`AdvancedGeneration:Smart field identification failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError(`AdvancedGeneration:Error in identifyFields: ${error}`);
            return null; // Graceful fallback
        }
    }

    /**
     * Transitive Join Intelligence - detect junction tables and recommend additional fields
     */
    public async analyzeTransitiveJoin(
        sourceEntity: any,
        targetEntity: any,
        contextUser: UserInfo
    ): Promise<TransitiveJoinResult | null> {
        if (!this.featureEnabled('TransitiveJoinIntelligence')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Transitive Join Intelligence', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                sourceEntityName: sourceEntity.Name,
                targetEntityName: targetEntity.Name,
                targetEntityDescription: targetEntity.Description,
                targetFields: targetEntity.Fields.map((f: any) => ({
                    Name: f.Name,
                    Type: f.Type,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsForeignKey: f.EntityIDFieldName != null,
                    Description: f.Description
                })),
                targetRelationships: targetEntity.RelatedEntities?.map((r: any) => ({
                    FieldName: r.FieldName,
                    RelatedEntity: r.RelatedEntity,
                    RelatedEntityNameField: r.RelatedEntityNameField
                })) || []
            };
            params.contextUser = contextUser;

            const result = await this.executePrompt<TransitiveJoinResult>(params);

            if (result.success && result.result) {
                LogStatus(`Transitive join analysis for ${sourceEntity.Name} → ${targetEntity.Name}: Junction=${result.result.isJunctionTable}`);
                return result.result;
            } else {
                LogError(`AdvancedGeneration:Transitive join analysis failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError(`AdvancedGeneration:Error in analyzeTransitiveJoin: ${error}`);
            return null;
        }
    }

    /**
     * Extract existing category information from an entity
     * This looks at ALL fields that have categories assigned, not just locked ones,
     * so the LLM can see and reuse existing categories when categorizing new fields
     */
    private getExistingFieldCategoryInfo(entity: any): {
        categories: string[];
        fieldsByCategory: Record<string, string[]>;
        categoryInfo: Record<string, FieldCategoryInfo> | null;
    } {
        // Get ALL fields that have categories assigned (not just locked ones)
        // This ensures the LLM sees existing categories and reuses them
        const categorizedFields = entity.Fields.filter(
            (f: any) => f.Category != null && f.Category.trim() !== ''
        );

        // Extract unique category names
        const categorySet = new Set<string>();
        for (const field of categorizedFields) {
            if (field.Category) {
                categorySet.add(field.Category);
            }
        }
        const categories = Array.from(categorySet);

        // Group fields by category
        const fieldsByCategory: Record<string, string[]> = {};
        for (const field of categorizedFields) {
            if (!fieldsByCategory[field.Category]) {
                fieldsByCategory[field.Category] = [];
            }
            fieldsByCategory[field.Category].push(field.Name);
        }

        // Use the typed FieldCategories property (auto-populated from EntitySettings with legacy fallback)
        const categoryInfo: Record<string, FieldCategoryInfo> | null = entity.FieldCategories ?? null;

        return { categories, fieldsByCategory, categoryInfo };
    }

    /**
     * Calculate FK statistics for an entity to help LLM determine entity importance
     */
    private calculateFkStatistics(fields: Array<{ IsForeignKey?: boolean; IsPrimaryKey?: boolean; Name?: string }>): {
        totalFields: number;
        fkCount: number;
        nonFkCount: number;
        fkRatio: number;
    } {
        // Exclude system fields (__mj_*) and primary key from the ratio calculation
        const businessFields = fields.filter(
            (f) => !f.IsPrimaryKey && !f.Name?.startsWith('__mj')
        );

        const fkCount = businessFields.filter((f) => f.IsForeignKey).length;
        const nonFkCount = businessFields.length - fkCount;
        const fkRatio = businessFields.length > 0
            ? Math.round((fkCount / businessFields.length) * 100)
            : 0;

        return {
            totalFields: fields.length,
            fkCount,
            nonFkCount,
            fkRatio
        };
    }

    /**
     * Form Layout Generation - create semantic field categories with icons
     * Also analyzes entity importance for default visibility in applications (for NEW entities only)
     * @param entity The entity to generate form layout for
     * @param contextUser The user context
     * @param isNewEntity If true, this is a newly created entity; if false, entityImportance will be ignored
     */
    public async generateFormLayout(
        entity: any,
        contextUser: UserInfo,
        isNewEntity: boolean = false
    ): Promise<FormLayoutResult | null> {
        if (!this.featureEnabled('FormLayoutGeneration')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Form Layout Generation', contextUser);

            // Extract existing category information
            const existingInfo = this.getExistingFieldCategoryInfo(entity);
            const hasExistingCategories = existingInfo.categories.length > 0;

            // IS-A parent chain context (provided by manage-metadata for child entities)
            const parentChain: Array<{ entityID: string; entityName: string }> = entity.ParentChain || [];
            const isChildEntity = entity.IsChildEntity === true && parentChain.length > 0;

            // Map fields with FK flag for statistics calculation
            const mappedFields = entity.Fields.map((f: any) => ({
                Name: f.Name,
                Type: f.Type,
                IsNullable: f.AllowsNull,
                IsPrimaryKey: f.IsPrimaryKey,
                IsForeignKey: f.EntityIDFieldName != null,
                RelatedEntity: f.RelatedEntity,
                Description: f.Description,
                // Include existing category information for ALL fields
                ExistingCategory: f.Category || null,
                // HasExistingCategory=true means locked (don't update), false means can update
                HasExistingCategory: !f.AutoUpdateCategory && f.Category != null,
                IsNewField: f.AutoUpdateCategory === true && !f.Category,
                // IS-A inheritance: which parent entity this field was inherited from (null if own field)
                InheritedFromEntityName: f.InheritedFromEntityName || null,
                InheritedFromEntityID: f.InheritedFromEntityID || null
            }));

            // Calculate FK statistics for entity importance analysis
            const fkStats = this.calculateFkStatistics(mappedFields);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                entityName: entity.Name,
                entityDescription: entity.Description,
                schemaName: entity.SchemaName,
                // FK statistics for entity importance determination
                totalFields: fkStats.totalFields,
                fkCount: fkStats.fkCount,
                nonFkCount: fkStats.nonFkCount,
                fkRatio: fkStats.fkRatio,
                // Field data
                fields: mappedFields,
                // Pass existing category metadata
                existingCategories: existingInfo.categories,
                fieldsByCategory: existingInfo.fieldsByCategory,
                hasExistingCategories: hasExistingCategories,
                // Pass existing category info (icons + descriptions) so LLM can reference them
                existingFieldCategoryInfo: existingInfo.categoryInfo || {},
                // Flag to tell LLM whether to bother with entityImportance
                isExistingEntity: !isNewEntity,
                // IS-A entity inheritance context
                isChildEntity,
                parentChain
            };
            params.contextUser = contextUser;

            const result = await this.executePrompt<FormLayoutResult>(params);

            if (result.success && result.result) {
                // Merge category info - preserve ALL existing categories, only add new ones
                if (existingInfo.categoryInfo) {
                    const newFieldCategoryInfo = result.result.categoryInfo || {};
                    result.result.categoryInfo = {
                        ...newFieldCategoryInfo  // Only new categories from LLM
                    };
                    // Preserve existing - don't let LLM overwrite
                    for (const [category, info] of Object.entries(existingInfo.categoryInfo)) {
                        result.result.categoryInfo[category] = info;
                    }
                }

                // Handle legacy categoryIcons format for backwards compatibility
                if (result.result.categoryIcons && !result.result.categoryInfo) {
                    // Convert legacy format to new format
                    result.result.categoryInfo = {};
                    for (const [category, icon] of Object.entries(result.result.categoryIcons)) {
                        result.result.categoryInfo[category] = { icon, description: '' };
                    }
                }

                // Stamp inheritedFromEntityID on categories that have inheritedFromEntityName
                // The LLM provides the entity name; we resolve the ID from the parent chain
                if (isChildEntity && result.result.categoryInfo) {
                    for (const info of Object.values(result.result.categoryInfo)) {
                        if (info.inheritedFromEntityName && !info.inheritedFromEntityID) {
                            const matchingParent = parentChain.find(
                                p => p.entityName === info.inheritedFromEntityName
                            );
                            if (matchingParent) {
                                info.inheritedFromEntityID = matchingParent.entityID;
                            }
                        }
                    }
                }

                return result.result;
            } else {
                LogError(`AdvancedGeneration:Form layout generation failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError(`AdvancedGeneration:Error in generateFormLayout: ${error}`);
            return null;
        }
    }

    /**
     * Generate entity name from table name
     */
    public async generateEntityName(
        tableName: string,
        contextUser: UserInfo
    ): Promise<EntityNameResult | null> {
        if (!this.featureEnabled('EntityNames')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Entity Name Generation', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = { tableName };
            params.contextUser = contextUser;

            const result = await this.executePrompt<EntityNameResult>(params);

            if (result.success && result.result) {
                LogStatus(`Entity name generated for ${tableName}: ${result.result.entityName}`);
                return result.result;
            } else {
                LogError(`AdvancedGeneration:Entity name generation failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError(`AdvancedGeneration:Error in generateEntityName: ${error}`);
            return null;
        }
    }

    /**
     * Generate entity description
     */
    public async generateEntityDescription(
        entityName: string,
        tableName: string,
        fields: Array<{Name: string, Type: string}>,
        contextUser: UserInfo
    ): Promise<EntityDescriptionResult | null> {
        if (!this.featureEnabled('EntityDescriptions')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Entity Description Generation', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = { entityName, tableName, fields };
            params.contextUser = contextUser;

            const result = await this.executePrompt<EntityDescriptionResult>(params);

            if (result.success && result.result) {
                LogStatus(`Entity description generated for ${entityName}`);
                return result.result;
            } else {
                LogError(`AdvancedGeneration:Entity description generation failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError(`AdvancedGeneration:Error in generateEntityDescription: ${error}`);
            return null;
        }
    }

    /**
     * Parse CHECK constraint and generate TypeScript validation method
     */
    public async parseCheckConstraint(
        constraintText: string,
        entityFieldList: string,
        existingMethodName: string | null,
        contextUser: UserInfo
    ): Promise<CheckConstraintParserResult | null> {
        if (!this.featureEnabled('ParseCheckConstraints')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Check Constraint Parser', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                constraintText,
                entityFieldList,
                existingMethodName: existingMethodName || 'None - this is a new constraint'
            };
            params.contextUser = contextUser;

            const result = await this.executePrompt<CheckConstraintParserResult>(params);

            if (result.success && result.result) {
                const modelId = result.modelInfo?.modelId || result.modelSelectionInfo?.modelSelected?.ID;
                if (!modelId) {
                    // shuoldn't ever happen.
                    LogError('AdvancedGeneration: Model ID not found');
                    return null;
                }
                else {
                    return {
                        ...result.result,
                        ModelID: modelId
                    };
                }
            } else {
                LogError(`AdvancedGeneration:CHECK constraint parsing failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError(`AdvancedGeneration:Error in parseCheckConstraint: ${error}`);
            return null;
        }
    }

    /**
     * Decorates virtual entity fields using LLM analysis of the view definition.
     * Identifies primary keys, foreign keys, generates field descriptions,
     * assigns categories, and suggests entity icons for constraint-less views.
     *
     * @param entityName The virtual entity name
     * @param schemaName The schema containing the view
     * @param viewName The SQL view name
     * @param viewDefinition The SQL view definition text
     * @param entityDescription Optional entity description
     * @param fields Array of field info objects with Name, Type, Length, AllowsNull, IsPrimaryKey, RelatedEntityName
     * @param availableEntities Array of available entities for FK resolution
     * @param sourceEntities Enriched context from source entities referenced in the view SQL
     * @param contextUser The context user for AI operations
     * @returns Decoration result or null if feature disabled or LLM call fails
     */
    public async decorateVirtualEntityFields(
        entityName: string,
        schemaName: string,
        viewName: string,
        viewDefinition: string,
        entityDescription: string,
        fields: Array<{
            Name: string;
            Type: string;
            Length: number;
            AllowsNull: boolean;
            IsPrimaryKey: boolean;
            RelatedEntityName: string | null;
        }>,
        availableEntities: Array<{
            Name: string;
            SchemaName: string;
            BaseTable: string;
            PrimaryKeyField: string;
        }>,
        sourceEntities: Array<{
            Name: string;
            Description: string;
            Fields: Array<{
                Name: string;
                Type: string;
                Description: string;
                Category: string | null;
                IsPrimaryKey: boolean;
                IsForeignKey: boolean;
            }>;
        }>,
        contextUser: UserInfo
    ): Promise<VirtualEntityDecorationResult | null> {
        if (!this.featureEnabled('VirtualEntityFieldDecoration')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Virtual Entity Field Decoration', contextUser);

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                entityName,
                schemaName,
                viewName,
                viewDefinition,
                entityDescription: entityDescription || 'No description available',
                fields,
                availableEntities: availableEntities.slice(0, 200), // Limit to prevent token overflow
                sourceEntities
            };
            params.contextUser = contextUser;

            const result: AIPromptRunResult<VirtualEntityDecorationResult> =
                await this._promptRunner.ExecutePrompt<VirtualEntityDecorationResult>(params);

            if (result.success && result.result) {
                LogStatus(`      ${entityName}: ${result.result.primaryKeys?.length || 0} PKs, ${result.result.foreignKeys?.length || 0} FKs identified`);
                return result.result;
            } else {
                LogError(`AdvancedGeneration:Virtual entity field decoration failed for ${entityName}: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError(`AdvancedGeneration:Error in decorateVirtualEntityFields for ${entityName}: ${error}`);
            return null;
        }
    }
}
