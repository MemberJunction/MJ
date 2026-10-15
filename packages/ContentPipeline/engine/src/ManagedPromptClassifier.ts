/**
 * @fileoverview The default content classifier: MJ's managed autotagging prompt.
 *
 * Tag shipped a contract and no implementation, so a configured Tag stage ran, reported success and
 * produced nothing. The contract is worth keeping — classification is a genuinely pluggable decision
 * and MJ has no registry for it — but it needed a default that works out of the box.
 *
 * That default is the `Content Autotagging` prompt MJ already manages, run through `AIPromptRunner`,
 * with the existing tag taxonomy injected as context so the model answers in the vocabulary the
 * deployment already governs rather than inventing a parallel one. The governance that follows —
 * promoting a returned keyword into a real `MJ: Tags` row, honouring auto-grow rules, linking the
 * tagged item — is the autotagger's taxonomy bridge, reused rather than reimplemented.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError, LogStatus, RunView } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ClassificationContextResolver, IContentSourceClassificationConfiguration } from '@memberjunction/content-autotagging';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { TagEngine } from '@memberjunction/tag-engine';
import {
    BaseContentClassifier,
    FatalStageError,
    ClassifiedTag,
    ClassifyRequest,
    ClassifyResult,
} from '@memberjunction/content-pipeline-base';
import { WhereEqual } from './Filters.js';

/** The registered key, and the name of the prompt MJ manages for this. */
export const MANAGED_PROMPT_CLASSIFIER = 'ContentAutotagging';
const MANAGED_PROMPT_NAME = 'Content Autotagging';

/** One keyword as the prompt may return it. */
interface ReturnedKeyword {
    tag?: string;
    keyword?: string;
    weight?: number;
    parentTag?: string;
    reasoning?: string;
    rationale?: string;
}

@RegisterClass(BaseContentClassifier, MANAGED_PROMPT_CLASSIFIER)
export class ManagedPromptClassifier extends BaseContentClassifier {
    public readonly Key = MANAGED_PROMPT_CLASSIFIER;

    public async Classify(request: ClassifyRequest): Promise<ClassifyResult> {
        await AIEngine.Instance.Config(false, request.ContextUser, request.Provider);
        const prompt = AIEngine.Instance.Prompts?.find((p) => p.Name === MANAGED_PROMPT_NAME);
        if (!prompt) {
            throw new Error(
                `The '${MANAGED_PROMPT_NAME}' prompt is not in metadata, so there is nothing to classify with. ` +
                    'Push the AI prompt metadata, or register a classifier of your own.',
            );
        }

        const params = new AIPromptParams();
        params.prompt = prompt;
        params.contextUser = request.ContextUser;
        // The template's own variable names. Passing `text` / `taxonomy` meant the model never saw
        // the document — `contentText` rendered empty — and classified nothing at all.
        params.data = {
            ...(await this.promptContext(request)),
            contentText: request.Text,
            title: request.Title ?? '',
            // The vocabulary the deployment already governs. Without it the model invents its own
            // tags every run and the taxonomy grows a synonym for everything it already has.
            existingTaxonomy: (await this.taxonomy(request)) || undefined,
            ...request.Parameters,
        };
        params.skipValidation = false;
        params.attemptJSONRepair = true;
        // Classification should be reproducible: the same document on two runs should not land in
        // two different parts of the taxonomy.
        params.additionalParameters = { temperature: 0.0 };

        const result = await new AIPromptRunner().ExecutePrompt<{ keywords?: unknown; isValidContent?: boolean }>(params);
        if (!result.success) {
            throw new Error(`The '${MANAGED_PROMPT_NAME}' prompt failed: ${result.errorMessage ?? 'unknown error'}`);
        }
        if (result.result?.isValidContent === false) {
            // The template's own escape hatch: the text is not the content type it claims to be.
            request.ReportProgress('the model judged this not to be the configured content type');
            return { Tags: [], Extensions: { PromptRunID: result.promptRun?.ID ?? null, IsValidContent: false } };
        }
        const tags = this.toTags(result.result?.keywords);
        request.ReportProgress(`the model returned ${tags.length} tag(s)`);
        return {
            Tags: tags,
            Extensions: { PromptRunID: result.promptRun?.ID ?? null },
        };
    }

    /**
     * What the source and its content type say about classifying this item — the same inputs the
     * autotagger gives the same prompt, so one prompt behaves the same under either caller.
     *
     * The tag-count bounds come from the content type and nowhere else. `MinTags` / `MaxTags` are
     * required columns and every source names a content type, so changing them is an edit to a
     * Content Type row — there is no default in code to drift from it.
     */
    private async promptContext(request: ClassifyRequest): Promise<Record<string, unknown>> {
        const { source, contentType } = await this.resolveContentType(request);
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        const sourceType = knowledge.GetContentSourceTypeByID(source.ContentSourceTypeID);
        // A source type can declare that its content has no meaningful "type" to validate against.
        const requiresContentType =
            (sourceType?.ConfigurationObject as { RequiresContentType?: boolean } | null)?.RequiresContentType !== false;

        return {
            contentSourceType: sourceType?.Name ?? 'content source',
            contentType: requiresContentType ? contentType.Name : undefined,
            minTags: contentType.MinTags,
            maxTags: contentType.MaxTags,
            additionalAttributePrompts: await this.attributePrompts(contentType.ID, request),
            classificationContext: await this.classificationContext(source.ConfigurationObject ?? null, contentType.ID, request),
        };
    }

    /**
     * The item's source and content type, from cached metadata.
     *
     * A miss refreshes the cache once — a worker that started before the source existed would
     * otherwise fail every item until restarted — and only then fails. Fatal, not retried: a source
     * with no resolvable content type will not grow one on the next attempt, and classifying it
     * against bounds nobody configured would be a guess presented as a decision.
     */
    private async resolveContentType(request: ClassifyRequest) {
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        await knowledge.Config(false, request.ContextUser, request.Provider);
        if (!request.ContentSourceID) {
            throw new FatalStageError('Classification needs the Content Source the item belongs to, and none was given');
        }
        const lookup = () => {
            const source = knowledge.GetContentSourceByID(request.ContentSourceID!);
            const contentType = source ? knowledge.GetContentTypeByID(source.ContentTypeID) : undefined;
            return { source, contentType };
        };
        let found = lookup();
        if (!found.source || !found.contentType) {
            await knowledge.Config(true, request.ContextUser, request.Provider);
            found = lookup();
        }
        if (!found.source || !found.contentType) {
            throw new FatalStageError(
                `Content Source '${request.ContentSourceID}' or its Content Type is not in metadata, so there are no tag bounds to classify with`,
            );
        }
        return { source: found.source, contentType: found.contentType };
    }

    /** The content type's extra extraction prompts, phrased exactly as the autotagger phrases them. */
    private async attributePrompts(contentTypeID: string, request: ClassifyRequest): Promise<string> {
        const result = await RunView.FromMetadataProvider(request.Provider).RunView<{ Name: string; Prompt: string }>(
            {
                EntityName: 'MJ: Content Type Attributes',
                ExtraFilter: WhereEqual({ ContentTypeID: contentTypeID }),
                Fields: ['Name', 'Prompt'],
                ResultType: 'simple',
            },
            request.ContextUser,
        );
        if (!result.Success) {
            return '';
        }
        return result.Results.map(
            (attr) =>
                `${attr.Prompt}. The data must be included in the above described JSON file in this key-value format:     { "${attr.Name}": (value of ${attr.Name} here)}`,
        ).join('\n');
    }

    /** The org / content-type / source classification context, through the shared resolver. */
    private async classificationContext(
        sourceConfig: unknown,
        contentTypeID: string,
        request: ClassifyRequest,
    ): Promise<string | undefined> {
        try {
            return await ClassificationContextResolver.ResolveEffectiveContext(
                (sourceConfig as IContentSourceClassificationConfiguration | null) ?? null,
                contentTypeID,
                KnowledgeHubMetadataEngine.Instance.ContentTypes,
                request.ContextUser,
                request.Provider,
            );
        } catch (error) {
            LogStatus(
                `ManagedPromptClassifier: no classification context (${error instanceof Error ? error.message : String(error)})`,
            );
            return undefined;
        }
    }

    /**
     * The existing taxonomy, as a markdown hierarchy.
     *
     * Best-effort: a deployment with no taxonomy yet classifies into a fresh one, which is the
     * ordinary first run and not a failure.
     */
    private async taxonomy(request: ClassifyRequest): Promise<string> {
        try {
            await TagEngine.Instance.Config(false, request.ContextUser);
            const tree = TagEngine.Instance.GetTaxonomyTree();
            return tree.length > 0 ? this.toMarkdown(tree) : '';
        } catch (error) {
            LogStatus(
                `ManagedPromptClassifier: no taxonomy context available (${error instanceof Error ? error.message : String(error)})`,
            );
            return '';
        }
    }

    /** Render the tag tree as nested headings, which is the shape the managed prompt expects. */
    private toMarkdown(nodes: readonly { Name: string; Children?: readonly unknown[] }[], depth = 1): string {
        const lines: string[] = [];
        for (const node of nodes) {
            lines.push(`${'#'.repeat(Math.min(depth, 6))} ${node.Name}`);
            const children = node.Children as readonly { Name: string; Children?: readonly unknown[] }[] | undefined;
            if (children?.length) {
                lines.push(this.toMarkdown(children, depth + 1));
            }
        }
        return lines.join('\n');
    }

    /**
     * Normalise whatever the prompt returned.
     *
     * Both shapes are accepted — a bare string, and an object with a weight — because the managed
     * prompt has returned both across its versions and a classifier that only understood the newer
     * one would silently drop every tag from a deployment still on the older.
     */
    private toTags(keywords: unknown): ClassifiedTag[] {
        if (!Array.isArray(keywords)) {
            LogError('ManagedPromptClassifier: the prompt returned no keywords array');
            return [];
        }
        const tags: ClassifiedTag[] = [];
        for (const keyword of keywords) {
            if (typeof keyword === 'string' && keyword.trim()) {
                tags.push({ Name: keyword.trim(), Score: 1 });
                continue;
            }
            const entry = keyword as ReturnedKeyword;
            const name = (entry?.tag ?? entry?.keyword ?? '').trim();
            if (!name) {
                continue;
            }
            const parent = (entry.parentTag ?? '').trim();
            tags.push({
                Name: name,
                Score: typeof entry.weight === 'number' ? Math.max(0, Math.min(1, entry.weight)) : 0.5,
                ...(parent ? { Parent: parent } : {}),
            });
        }
        return tags;
    }
}
