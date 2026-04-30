/**
 * @fileoverview AI-powered Entity Document template suggestion engine.
 *
 * Uses the "Entity Document Suggestion" AI prompt to analyze entity schemas
 * and suggest optimal Nunjucks templates for duplicate detection, search,
 * or classification use cases.
 *
 * @module @memberjunction/ai-vector-sync
 */

import { EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

/** The name of the AI prompt stored in the database */
const SUGGESTION_PROMPT_NAME = 'Entity Document Suggestion';

/** Supported use cases for document suggestion */
export type DocumentSuggestionUseCase = 'duplicate detection' | 'search' | 'classification';

/** A relationship descriptor passed to the AI prompt */
export interface RelationshipDescriptor {
    Name: string;
    RelatedEntity: string;
    Fields: string[];
    ForeignKeyField: string;
}

/** A field descriptor passed to the AI prompt */
export interface FieldDescriptor {
    Name: string;
    Type: string;
    IsPrimaryKey: boolean;
    IsUnique: boolean;
    MaxLength: number | null;
    AllowsNull: boolean;
    Description: string;
}

/** The structured JSON response from the AI prompt */
export interface DocumentSuggestionResult {
    template: string;
    selectedFields: string[];
    selectedRelationships: { name: string; fields: string[] }[];
    potentialMatchThreshold: number;
    absoluteMatchThreshold: number;
    reasoning: string;
}

/** Full response from the suggestion engine */
export interface SuggestDocumentResponse {
    Success: boolean;
    ErrorMessage: string;
    Suggestion: DocumentSuggestionResult | null;
}

/**
 * Suggests Entity Document templates by analyzing entity schemas with AI.
 *
 * Uses the `AIPromptRunner` directly (not via Actions) per CLAUDE.md design philosophy.
 */
export class EntityDocumentSuggester {
    /** Optional provider override; falls back to Metadata.Provider when not set. */
    private _provider?: IMetadataProvider;

    /** Returns the active provider — explicit override if set, otherwise the global default. */
    protected get ProviderToUse(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Analyze an entity's schema and suggest an Entity Document template.
     *
     * @param entityName - The name of the entity to analyze
     * @param useCase - The intended use case (defaults to 'duplicate detection')
     * @param contextUser - The authenticated user context
     * @returns A suggestion with template, selected fields, and threshold recommendations
     */
    public async SuggestDocument(
        entityName: string,
        useCase: DocumentSuggestionUseCase,
        contextUser: UserInfo
    ): Promise<SuggestDocumentResponse> {
        try {
            await AIEngine.Instance.Config(false, contextUser);
            const entity = this.resolveEntity(entityName);
            const fields = this.buildFieldDescriptors(entity);
            const relationships = this.buildRelationshipDescriptors(entity);
            const prompt = this.findSuggestionPrompt();

            const result = await this.executeSuggestionPrompt(prompt, entity, fields, relationships, useCase, contextUser);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`EntityDocumentSuggester.SuggestDocument failed: ${message}`);
            return { Success: false, ErrorMessage: message, Suggestion: null };
        }
    }

    /** Resolve entity metadata by name */
    private resolveEntity(entityName: string): EntityInfo {
        const md = this.ProviderToUse;
        const entity = md.EntityByName(entityName);
        if (!entity) {
            throw new Error(`Entity "${entityName}" not found in metadata`);
        }
        return entity;
    }

    /** Build field descriptors from entity metadata */
    private buildFieldDescriptors(entity: EntityInfo): FieldDescriptor[] {
        return entity.Fields.map(f => ({
            Name: f.Name,
            Type: f.Type,
            IsPrimaryKey: f.IsPrimaryKey,
            IsUnique: f.IsUnique,
            MaxLength: f.MaxLength,
            AllowsNull: f.AllowsNull,
            Description: f.Description || '',
        }));
    }

    /** Build relationship descriptors from entity metadata */
    private buildRelationshipDescriptors(entity: EntityInfo): RelationshipDescriptor[] {
        const md = this.ProviderToUse;
        return entity.RelatedEntities
            .filter(r => r.Type === 'One to Many' || r.Type === 'Many to One')
            .slice(0, 20) // Limit to prevent oversized prompts
            .map(r => {
                const relatedEntityInfo = md.EntityByName(r.RelatedEntity);
                const sampleFields = relatedEntityInfo
                    ? relatedEntityInfo.Fields
                        .filter(f => !f.IsPrimaryKey && f.Type !== 'datetimeoffset')
                        .map(f => f.Name)
                    : [];
                return {
                    Name: r.RelatedEntityJoinField || r.RelatedEntity,
                    RelatedEntity: r.RelatedEntity,
                    Fields: sampleFields,
                    ForeignKeyField: r.RelatedEntityJoinField || '',
                };
            });
    }

    /** Find the suggestion prompt from AIEngine */
    private findSuggestionPrompt(): MJAIPromptEntityExtended {
        const prompt = AIEngine.Instance.Prompts.find(
            (p: MJAIPromptEntityExtended) => p.Name === SUGGESTION_PROMPT_NAME
        );
        if (!prompt) {
            throw new Error(
                `AI Prompt "${SUGGESTION_PROMPT_NAME}" not found. ` +
                `Run 'npx mj sync push --dir=metadata --include=prompts' to install it.`
            );
        }
        return prompt;
    }

    /** Execute the AI prompt and parse the response */
    private async executeSuggestionPrompt(
        prompt: MJAIPromptEntityExtended,
        entity: EntityInfo,
        fields: FieldDescriptor[],
        relationships: RelationshipDescriptor[],
        useCase: DocumentSuggestionUseCase,
        contextUser: UserInfo
    ): Promise<SuggestDocumentResponse> {
        const runner = new AIPromptRunner();
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.contextUser = contextUser;
        params.data = {
            EntityName: entity.Name,
            FieldsJSON: JSON.stringify(fields, null, 2),
            RelationshipsJSON: JSON.stringify(relationships, null, 2),
            UseCase: useCase,
            TemplateStyle: 'The template MUST generate natural language sentences that read like a human-written description. ' +
                'Do NOT simply concatenate field values. Instead, compose prose that naturally incorporates the entity data. ' +
                'For example, instead of "{{Name}} - {{Description}}" generate "{{Name}} is a {{Type}} that {{Description}}. ' +
                'It was created on {{CreatedAt}} and is currently {{Status}}."',
        };

        LogStatus(`Generating Entity Document suggestion for "${entity.Name}" (${useCase})`);

        const result = await runner.ExecutePrompt<DocumentSuggestionResult>(params);

        if (!result.success) {
            return {
                Success: false,
                ErrorMessage: `AI prompt execution failed: ${result.rawResult || 'unknown error'}`,
                Suggestion: null,
            };
        }

        if (!result.result) {
            return {
                Success: false,
                ErrorMessage: 'AI prompt returned no structured result',
                Suggestion: null,
            };
        }

        LogStatus(`Suggestion generated: ${result.result.selectedFields.length} fields, ${result.result.selectedRelationships.length} relationships`);

        return {
            Success: true,
            ErrorMessage: '',
            Suggestion: result.result,
        };
    }
}
