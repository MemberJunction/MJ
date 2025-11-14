import { AdvancedGenerationFeature, configInfo } from "../Config/config";
import { LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams, AIPromptRunResult } from "@memberjunction/ai-core-plus";
import { AIPromptEntityExtended } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";

export type EntityNameResult = { entityName: string, tableName: string }
export type EntityDescriptionResult = { entityDescription: string, tableName: string }
export type CheckConstraintParserResult = { Description: string, Code: string, MethodName: string, ModelID: string }

export type SmartFieldIdentificationResult = {
    nameField: string;
    nameFieldReason: string;
    defaultInView: string[];
    defaultInViewReason: string;
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
    categoryIcons?: Record<string, string>;
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
    private async getPromptEntity(promptName: string, contextUser: UserInfo): Promise<AIPromptEntityExtended> {
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
            LogError('AdvancedGeneration', `Prompt execution failed: ${error}`);
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
                LogError('AdvancedGeneration', `Smart field identification failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in identifyFields: ${error}`);
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
                LogError('AdvancedGeneration', `Transitive join analysis failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in analyzeTransitiveJoin: ${error}`);
            return null;
        }
    }

    /**
     * Extract existing category information from an entity
     * This looks at ALL fields that have categories assigned, not just locked ones,
     * so the LLM can see and reuse existing categories when categorizing new fields
     */
    private getExistingCategoryInfo(entity: any): {
        categories: string[];
        fieldsByCategory: Record<string, string[]>;
        icons: Record<string, string> | null;
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

        // Load category icons from EntitySettings
        let icons: Record<string, string> | null = null;
        const iconSetting = entity.Settings?.find(
            (s: any) => s.Name === 'FieldCategoryIcons'
        );
        if (iconSetting?.Value) {
            try {
                icons = JSON.parse(iconSetting.Value);
            } catch (e) {
                // Invalid JSON, ignore
            }
        }

        return { categories, fieldsByCategory, icons };
    }

    /**
     * Form Layout Generation - create semantic field categories with icons
     * Also analyzes entity importance for default visibility in applications
     */
    public async generateFormLayout(
        entity: any,
        contextUser: UserInfo
    ): Promise<FormLayoutResult | null> {
        if (!this.featureEnabled('FormLayoutGeneration')) {
            return null;
        }

        try {
            const prompt = await this.getPromptEntity('CodeGen: Form Layout Generation', contextUser);

            // Extract existing category information
            const existingInfo = this.getExistingCategoryInfo(entity);
            const hasExistingCategories = existingInfo.categories.length > 0;

            const params = new AIPromptParams();
            params.prompt = prompt;
            params.data = {
                entityName: entity.Name,
                entityDescription: entity.Description,
                schemaName: entity.SchemaName,
                virtualEntity: entity.VirtualEntity ?? false,
                trackRecordChanges: entity.TrackRecordChanges ?? false,
                auditRecordAccess: entity.AuditRecordAccess ?? false,
                userFormGenerated: entity.UserFormGenerated ?? false,
                fields: entity.Fields.map((f: any) => ({
                    Name: f.Name,
                    Type: f.Type,
                    IsNullable: f.AllowsNull,
                    IsPrimaryKey: f.IsPrimaryKey,
                    IsForeignKey: f.EntityIDFieldName != null,
                    RelatedEntity: f.RelatedEntityName,
                    Description: f.Description,
                    // Include existing category information for ALL fields
                    ExistingCategory: f.Category || null,
                    // HasExistingCategory=true means locked (don't update), false means can update
                    HasExistingCategory: !f.AutoUpdateCategory && f.Category != null,
                    IsNewField: f.AutoUpdateCategory === true && !f.Category
                })),
                // Pass existing category metadata
                existingCategories: existingInfo.categories,
                fieldsByCategory: existingInfo.fieldsByCategory,
                hasExistingCategories: hasExistingCategories
            };
            params.contextUser = contextUser;

            const result = await this.executePrompt<FormLayoutResult>(params);

            if (result.success && result.result) {
                // Merge icons instead of replacing - preserve existing custom icons
                if (result.result.categoryIcons && existingInfo.icons) {
                    result.result.categoryIcons = {
                        ...existingInfo.icons,  // Preserve existing
                        ...result.result.categoryIcons  // Add new (overwrites if same key)
                    };
                }

                // Log entity importance analysis if available
                if (result.result.entityImportance) {
                    // LogStatus(
                    //     `Entity importance for ${entity.Name}: ${result.result.entityImportance.entityCategory} ` +
                    //     `(defaultForNewUser: ${result.result.entityImportance.defaultForNewUser}, ` +
                    //     `confidence: ${result.result.entityImportance.confidence})`
                    // );
                }

                return result.result;
            } else {
                LogError('AdvancedGeneration', `Form layout generation failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in generateFormLayout: ${error}`);
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
                LogError('AdvancedGeneration', `Entity name generation failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in generateEntityName: ${error}`);
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
                LogError('AdvancedGeneration', `Entity description generation failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in generateEntityDescription: ${error}`);
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
                    LogError('AdvancedGeneration', 'Model ID not found');
                    return null;
                }
                else {
                    return {
                        ...result.result,
                        ModelID: modelId
                    };
                }
            } else {
                LogError('AdvancedGeneration', `CHECK constraint parsing failed: ${result.errorMessage}`);
                return null;
            }
        } catch (error) {
            LogError('AdvancedGeneration', `Error in parseCheckConstraint: ${error}`);
            return null;
        }
    }
}
