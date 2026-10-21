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
    AutotagBaseEngine,
    AutotagKeyword,
    BuildContentAutotagPromptData,
    GetContentAutotagPrompt,
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
        // Attribute prompts come from the autotagger's cache, the taxonomy from TagEngine's. The
        // taxonomy is best-effort: without one the model classifies into a fresh one.
        await AutotagBaseEngine.Instance.Config(false, request.ContextUser, request.Provider);
        await TagEngine.Instance.Config(false, request.ContextUser).catch((e: unknown) =>
            LogStatus(`ManagedPromptClassifier: no taxonomy context (${e instanceof Error ? e.message : String(e)})`),
        );
        const data = {
            ...BuildContentAutotagPromptData({
                ContentSourceTypeID: source.ContentSourceTypeID,
                ContentTypeID: contentType.ID,
                MinTags: contentType.MinTags,
                MaxTags: contentType.MaxTags,
                AttributePrompt: AutotagBaseEngine.Instance.GetAdditionalContentTypePrompt(contentType.ID),
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
        const result = await RunContentAutotagPrompt<{ keywords?: unknown; isValidContent?: boolean }>(
            GetContentAutotagPrompt(),
            data,
            request.ContextUser,
        );
        if (!result.success) {
            throw new Error(`The 'Content Autotagging' prompt failed: ${result.errorMessage ?? 'unknown error'}`);
        }
        const isValidContent = result.result?.isValidContent !== false;
        const keywords = isValidContent ? NormalizeAutotagKeywords(result.result?.keywords) : [];
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
            Extensions: { keywords },
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
