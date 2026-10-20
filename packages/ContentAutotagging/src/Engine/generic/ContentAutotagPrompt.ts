/**
 * @fileoverview The `Content Autotagging` prompt, run one way by every caller.
 *
 * The autotagger and the content pipeline's Tag stage classify with the same managed prompt, so they
 * share its lookup, its template variables, its run settings and the parsing of what it returns.
 *
 * @module @memberjunction/content-autotagging
 */

import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import type { AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { TagEngine } from '@memberjunction/tag-engine';
import { ClassificationContextResolver, IContentSourceClassificationConfiguration } from './ClassificationContextResolver';

/** The managed prompt's name. */
export const CONTENT_AUTOTAG_PROMPT_NAME = 'Content Autotagging';

/** One keyword the prompt returned, normalised. */
export interface AutotagKeyword {
    Tag: string;
    /** 0–1; 1 for a bare string, 0.5 when the prompt gave none. */
    Weight: number;
    ParentTag: string | null;
    Reasoning: string | null;
}

/** What a content item's prompt variables are built from. */
export interface ContentAutotagPromptInput {
    ContentSourceTypeID: string;
    ContentTypeID: string;
    MinTags: number;
    MaxTags: number;
    /** The content type's attribute prompts ({@link BuildAttributePrompt}). */
    AttributePrompt: string;
    ContentText: string;
    ClassificationContext?: string;
    /** Results accumulated from earlier chunks of the same item. */
    PreviousResults?: Record<string, unknown>;
}

/** The active `Content Autotagging` prompt from the AIEngine cache. Throws when missing or inactive. */
export function GetContentAutotagPrompt(): MJAIPromptEntityExtended {
    const prompt = AIEngine.Instance.Prompts.find((p) => p.Name === CONTENT_AUTOTAG_PROMPT_NAME);
    if (!prompt) {
        throw new Error(`AI Prompt "${CONTENT_AUTOTAG_PROMPT_NAME}" not found. Ensure the prompt metadata has been synced to the database.`);
    }
    if (prompt.Status !== 'Active') {
        throw new Error(`AI Prompt "${CONTENT_AUTOTAG_PROMPT_NAME}" is not active (Status: ${prompt.Status})`);
    }
    return prompt;
}

/** The prompt's template variables. Throws when the source type or content type is not cached. */
export function BuildContentAutotagPromptData(input: ContentAutotagPromptInput): Record<string, unknown> {
    const kh = KnowledgeHubMetadataEngine.Instance;
    const sourceType = kh.GetContentSourceTypeByID(input.ContentSourceTypeID);
    if (!sourceType) {
        throw new Error(`Content Source Type with ID ${input.ContentSourceTypeID} not found in cached metadata`);
    }
    const contentType = kh.GetContentTypeByID(input.ContentTypeID);
    if (!contentType) {
        throw new Error(`Content Type with ID ${input.ContentTypeID} not found in cached metadata`);
    }
    // A source type can declare that its content has no meaningful "type" to validate against.
    const requiresContentType = sourceType.ConfigurationObject?.RequiresContentType !== false;
    const hasPreviousResults = !!input.PreviousResults && Object.keys(input.PreviousResults).length > 0;
    return {
        contentType: requiresContentType ? contentType.Name : undefined,
        contentSourceType: sourceType.Name,
        minTags: input.MinTags,
        maxTags: input.MaxTags,
        additionalAttributePrompts: input.AttributePrompt,
        // Read live per item, so later items see tags earlier ones created.
        existingTaxonomy: TagEngine.Instance.GetTaxonomyMarkdown() || undefined,
        classificationContext: input.ClassificationContext ?? undefined,
        contentText: input.ContentText,
        previousResults: hasPreviousResults ? JSON.stringify(input.PreviousResults) : undefined,
    };
}

/** A content type's attribute prompts, phrased as the prompt expects. */
export function BuildAttributePrompt(attributes: readonly { Name: string; Prompt: string }[]): string {
    return attributes
        .map((attr) => `${attr.Prompt}. The data must be included in the above described JSON file in this key-value format:     { "${attr.Name}": (value of ${attr.Name} here)}`)
        .join('\n');
}

/** The org / content-type / source classification context for an item. Undefined (logged) on failure. */
export async function ResolveItemClassificationContext(
    contentSourceID: string | undefined,
    contentTypeID: string,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): Promise<string | undefined> {
    try {
        const kh = KnowledgeHubMetadataEngine.Instance;
        const source = contentSourceID ? kh.GetContentSourceByID(contentSourceID) : undefined;
        // The classification keys ride in the same Configuration JSON as the generated interface.
        const sourceConfig = (source?.ConfigurationObject as IContentSourceClassificationConfiguration | null | undefined) ?? null;
        return await ClassificationContextResolver.ResolveEffectiveContext(sourceConfig, contentTypeID, kh.ContentTypes, contextUser, provider);
    } catch (e) {
        LogError(`[Autotag] Failed to resolve classification context for source ${contentSourceID ?? '(none)'}: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
    }
}

/** Run the prompt: validated JSON, repaired if needed, temperature 0 so a document classifies the same twice. */
export function RunContentAutotagPrompt<T>(
    prompt: MJAIPromptEntityExtended,
    data: Record<string, unknown>,
    contextUser: UserInfo,
    modelID?: string,
): Promise<AIPromptRunResult<T>> {
    const params = new AIPromptParams();
    params.prompt = prompt;
    params.contextUser = contextUser;
    params.data = data;
    params.skipValidation = false;
    params.attemptJSONRepair = true;
    params.additionalParameters = { temperature: 0.0 };
    if (modelID) {
        params.override = { modelId: modelID };
    }
    return new AIPromptRunner().ExecutePrompt<T>(params);
}

/**
 * Normalise the prompt's `keywords`. Both shapes it has returned across versions are accepted: bare
 * strings, and `{ tag | keyword, weight, parentTag, reasoning | rationale }` objects.
 */
export function NormalizeAutotagKeywords(keywords: unknown): AutotagKeyword[] {
    if (!Array.isArray(keywords)) {
        return [];
    }
    const result: AutotagKeyword[] = [];
    for (const keyword of keywords) {
        if (typeof keyword === 'string') {
            if (keyword.trim()) result.push({ Tag: keyword.trim(), Weight: 1, ParentTag: null, Reasoning: null });
            continue;
        }
        const entry = (keyword ?? {}) as Record<string, unknown>;
        const tag = trimmed(entry.tag) || trimmed(entry.keyword);
        if (!tag) continue;
        result.push({
            Tag: tag,
            Weight: typeof entry.weight === 'number' ? Math.max(0, Math.min(1, entry.weight)) : 0.5,
            ParentTag: trimmed(entry.parentTag) || null,
            Reasoning: trimmed(entry.reasoning) || trimmed(entry.rationale) || null,
        });
    }
    return result;
}

function trimmed(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
