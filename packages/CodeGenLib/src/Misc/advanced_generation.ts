import { AdvancedGenerationFeature, configInfo } from "../Config/config";
import { LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams, AIPromptRunResult } from "@memberjunction/ai-core-plus";
import { AIPromptEntityExtended } from "@memberjunction/core-entities";

export type EntityNameResult = { entityName: string, tableName: string }
export type EntityDescriptionResult = { entityDescription: string, tableName: string }
export type CheckConstraintParserResult = { Description: string, Code: string, MethodName: string }

export type SmartFieldIdentificationResult = {
    nameField: string;
    nameFieldReason: string;
    defaultInView: string;
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

export type FormLayoutResult = {
    fieldCategories: Array<{
        fieldName: string;
        category: string;
        reason: string;
    }>;
}

/**
 * Enhanced Advanced Generation system using MJ's AI Prompts architecture.
 * All prompts are now stored in the database as AI Prompt entities with proper model configuration.
 */
export class AdvancedGeneration {
    private _metadata: Metadata;
    private _promptRunner: AIPromptRunner;
    private _promptCache: Map<string, AIPromptEntityExtended> = new Map();

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
        if (this._promptCache.has(promptName)) {
            return this._promptCache.get(promptName)!;
        }

        const prompt = await this._metadata.GetEntityObject<AIPromptEntityExtended>(
            'AI Prompts',
            contextUser
        );

        const loaded = await prompt.Load(promptName, ['MJ: AI Prompt Models']);
        if (!loaded) {
            throw new Error(`Prompt '${promptName}' not found in database. Ensure the prompt metadata has been synced.`);
        }

        this._promptCache.set(promptName, prompt);
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
                LogStatus(`Smart field identification for ${entity.Name}: ${result.result.nameField} (confidence: ${result.result.confidence})`);
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
     * Form Layout Generation - create semantic field categories with icons
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
                    IsForeignKey: f.EntityIDFieldName != null,
                    RelatedEntity: f.RelatedEntityName,
                    Description: f.Description
                }))
            };
            params.contextUser = contextUser;

            const result = await this.executePrompt<FormLayoutResult>(params);

            if (result.success && result.result) {
                LogStatus(`Form layout generated for ${entity.Name}: ${result.result.fieldCategories.length} field categories`);
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
                LogStatus(`CHECK constraint parsed successfully`);
                return result.result;
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
