/**
 * @fileoverview Classifies a content item with MJ's managed `Content Autotagging` prompt, built from
 * the same inputs the autotagger gives it.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogStatus } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJContentSourceEntity, MJContentTypeEntity } from '@memberjunction/core-entities';
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
import { FatalStageError, StageContext } from '@memberjunction/content-pipeline-base';

/** What the prompt concluded about one item. */
export interface ManagedPromptClassification {
    Keywords: AutotagKeyword[];
    PromptRunID: string | null;
    /** False when the model judged the text not to be the configured content type. */
    IsValidContent: boolean;
}

/** The Tag stage's classifier: the managed prompt, with the autotagger's inputs. */
export class ManagedPromptClassifier {
    /** Classify one item's text. */
    public async Classify(text: string, title: string | null, contentSourceID: string | null, context: StageContext): Promise<ManagedPromptClassification> {
        const { source, contentType } = await this.resolveContentType(contentSourceID, context);
        // Attribute prompts come from the autotagger's cache, the taxonomy from TagEngine's. The
        // taxonomy is best-effort: without one the model classifies into a fresh one.
        await AutotagBaseEngine.Instance.Config(false, context.ContextUser, context.Provider);
        await TagEngine.Instance.Config(false, context.ContextUser).catch((e: unknown) =>
            LogStatus(`ManagedPromptClassifier: no taxonomy context (${e instanceof Error ? e.message : String(e)})`),
        );
        const data = {
            ...BuildContentAutotagPromptData({
                ContentSourceTypeID: source.ContentSourceTypeID,
                ContentTypeID: contentType.ID,
                MinTags: contentType.MinTags,
                MaxTags: contentType.MaxTags,
                AttributePrompt: AutotagBaseEngine.Instance.GetAdditionalContentTypePrompt(contentType.ID),
                ClassificationContext: await ResolveItemClassificationContext(source.ID, contentType.ID, context.ContextUser, context.Provider),
                ContentText: text,
            }),
            title: title ?? '',
            ...(context.Configuration.Parameters as Record<string, string> | undefined),
        };
        const result = await RunContentAutotagPrompt<{ keywords?: unknown; isValidContent?: boolean }>(GetContentAutotagPrompt(), data, context.ContextUser);
        if (!result.success) {
            throw new Error(`The 'Content Autotagging' prompt failed: ${result.errorMessage ?? 'unknown error'}`);
        }
        const isValidContent = result.result?.isValidContent !== false;
        return {
            Keywords: isValidContent ? NormalizeAutotagKeywords(result.result?.keywords) : [],
            PromptRunID: result.promptRun?.ID ?? null,
            IsValidContent: isValidContent,
        };
    }

    /**
     * The item's source and content type from the Knowledge Hub cache, refreshed once on a miss (a
     * worker may predate the source). Fatal after that: there are no tag bounds to classify with.
     */
    private async resolveContentType(contentSourceID: string | null, context: StageContext): Promise<{ source: MJContentSourceEntity; contentType: MJContentTypeEntity }> {
        if (!contentSourceID) {
            throw new FatalStageError('Classification needs the Content Source the item belongs to, and none was given');
        }
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        const lookup = () => {
            const source = knowledge.GetContentSourceByID(contentSourceID);
            return { source, contentType: source ? knowledge.GetContentTypeByID(source.ContentTypeID) : undefined };
        };
        await knowledge.Config(false, context.ContextUser, context.Provider);
        let found = lookup();
        if (!found.source || !found.contentType) {
            await knowledge.Config(true, context.ContextUser, context.Provider);
            found = lookup();
        }
        if (!found.source || !found.contentType) {
            throw new FatalStageError(`Content Source '${contentSourceID}' or its Content Type is not in metadata, so there are no tag bounds to classify with`);
        }
        return { source: found.source, contentType: found.contentType };
    }
}
