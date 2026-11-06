/**
 * @fileoverview Classifies a content item with MJ's managed `Content Autotagging` prompt, built from
 * the same inputs the autotagger gives it.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogStatus, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJContentSourceEntity, MJContentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    AutotagKeyword,
    BuildContentAutotagPromptData,
    GetContentAutotagPrompt,
    GetContentTypeAttributePrompt,
    NormalizeAutotagKeywords,
    ResolveItemClassificationContext,
    RunContentAutotagPrompt,
} from '@memberjunction/content-autotagging';
import { TagEngine } from '@memberjunction/tag-engine';
import {
    BaseContentClassifier,
    ClassifiedTag,
    ClassifyRequest,
    ClassifyResult,
    FatalStageError,
} from '@memberjunction/content-pipeline-base';

/** The default classifier registration key. */
export const MANAGED_PROMPT_CLASSIFIER = 'ManagedPrompt';

/** Prompt response keys handled directly by the classifier rather than stored as custom Content Item Attributes. */
const RESERVED_PROMPT_KEYS = new Set([
    'keywords',
    'isValidContent',
    'title',
    'description',
    'processStartTime',
    'processEndTime',
    'contentItemID',
    '__aiPromptRunID',
]);

/** What the prompt concluded about one item. */
export interface ManagedPromptClassification {
    Keywords: AutotagKeyword[];
    PromptRunID: string | null;
    /** False when the model judged the text not to be the configured content type. */
    IsValidContent: boolean;
}

/**
 * The default {@link BaseContentClassifier}: runs MJ's managed `Content Autotagging` prompt with the
 * same inputs the autotagger gives it.
 */
@RegisterClass(BaseContentClassifier, MANAGED_PROMPT_CLASSIFIER)
export class ManagedPromptClassifier extends BaseContentClassifier {
    public readonly Key = MANAGED_PROMPT_CLASSIFIER;

    /** Classify one item's text. */
    public async Classify(request: ClassifyRequest): Promise<ClassifyResult> {
        const { source, contentType } = await this.resolveContentType(
            request.ContentSourceID ?? null,
            request.ContextUser,
            request.Provider,
        );
        const data = await this.buildPromptData(request, source, contentType);
        const result = await RunContentAutotagPrompt<Record<string, unknown>>(
            GetContentAutotagPrompt(),
            data,
            request.ContextUser,
            contentType.AIModelID || undefined,
        );
        if (!result.success) {
            throw new Error(`The 'Content Autotagging' prompt failed: ${result.errorMessage ?? 'unknown error'}`);
        }
        const isValidContent = result.result?.isValidContent !== false;
        const keywords = isValidContent ? NormalizeAutotagKeywords(result.result?.keywords) : [];
        const attributes = isValidContent ? this.extractCustomAttributes(result.result) : {};
        const tags: ClassifiedTag[] = keywords.map((k) => ({
            Name: k.Tag,
            Score: k.Weight,
            ...(k.ParentTag ? { Parent: k.ParentTag } : {}),
            ...(k.Reasoning ? { Reasoning: k.Reasoning } : {}),
        }));
        return {
            Tags: tags,
            PromptRunID: result.promptRun?.ID ?? null,
            IsValidContent: isValidContent,
            Extensions: {
                keywords,
                ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
            },
        };
    }

    private extractCustomAttributes(raw: Record<string, unknown> | undefined): Record<string, string> {
        if (!raw || typeof raw !== 'object') {
            return {};
        }
        const attributes: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw)) {
            if (!RESERVED_PROMPT_KEYS.has(key) && value != null) {
                attributes[key] = typeof value === 'string' ? value : String(value);
            }
        }
        return attributes;
    }

    private async buildPromptData(
        request: ClassifyRequest,
        source: MJContentSourceEntity,
        contentType: MJContentTypeEntity,
    ): Promise<Record<string, unknown>> {
        // Attribute prompts come from the Knowledge Hub cache, the taxonomy from TagEngine's. The
        // taxonomy is best-effort: without one the model classifies into a fresh one.
        await TagEngine.Instance.Config(false, request.ContextUser).catch((e: unknown) =>
            LogStatus(`ManagedPromptClassifier: no taxonomy context (${e instanceof Error ? e.message : String(e)})`),
        );
        return {
            ...BuildContentAutotagPromptData({
                ContentSourceTypeID: source.ContentSourceTypeID,
                ContentTypeID: contentType.ID,
                MinTags: contentType.MinTags,
                MaxTags: contentType.MaxTags,
                AttributePrompt: GetContentTypeAttributePrompt(contentType.ID),
                ClassificationContext: await ResolveItemClassificationContext(
                    source.ID,
                    contentType.ID,
                    request.ContextUser,
                    request.Provider,
                ),
                ContentText: request.Text,
            }),
            title: request.Title ?? '',
            ...request.Parameters,
        };
    }

    /**
     * The item's source and content type from the Knowledge Hub cache, refreshed once on a miss (a
     * worker may predate the source). Fatal after that: there are no tag bounds to classify with.
     */
    private async resolveContentType(
        contentSourceID: string | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<{ source: MJContentSourceEntity; contentType: MJContentTypeEntity }> {
        if (!contentSourceID) {
            throw new FatalStageError('Classification needs the Content Source the item belongs to, and none was given');
        }
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        const lookup = () => {
            const source = knowledge.GetContentSourceByID(contentSourceID);
            return { source, contentType: source ? knowledge.GetContentTypeByID(source.ContentTypeID) : undefined };
        };
        await knowledge.Config(false, contextUser, provider);
        let found = lookup();
        if (!found.source || !found.contentType) {
            await knowledge.Config(true, contextUser, provider);
            found = lookup();
        }
        if (!found.source || !found.contentType) {
            throw new FatalStageError(
                `Content Source '${contentSourceID}' or its Content Type is not in metadata, so there are no tag bounds to classify with`,
            );
        }
        return { source: found.source, contentType: found.contentType };
    }
}
