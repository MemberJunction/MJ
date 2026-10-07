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

import { LogError, LogStatus } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { TagEngine } from '@memberjunction/tag-engine';
import {
    BaseContentClassifier,
    ClassifiedTag,
    ClassifyRequest,
    ClassifyResult,
} from '@memberjunction/content-pipeline-base';

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
        params.data = {
            text: request.Text,
            title: request.Title ?? '',
            // The vocabulary the deployment already governs. Without it the model invents its own
            // tags every run and the taxonomy grows a synonym for everything it already has.
            taxonomy: await this.taxonomy(request),
            ...request.Parameters,
        };
        params.skipValidation = false;
        params.attemptJSONRepair = true;
        // Classification should be reproducible: the same document on two runs should not land in
        // two different parts of the taxonomy.
        params.additionalParameters = { temperature: 0.0 };

        const result = await new AIPromptRunner().ExecutePrompt<{ keywords?: unknown }>(params);
        if (!result.success) {
            throw new Error(`The '${MANAGED_PROMPT_NAME}' prompt failed: ${result.errorMessage ?? 'unknown error'}`);
        }
        const tags = this.toTags(result.result?.keywords);
        request.ReportProgress(`the model returned ${tags.length} tag(s)`);
        return {
            Tags: tags,
            Extensions: { PromptRunID: result.promptRun?.ID ?? null },
        };
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
            tags.push({
                Name: name,
                Score: typeof entry.weight === 'number' ? Math.max(0, Math.min(1, entry.weight)) : 0.5,
            });
        }
        return tags;
    }
}
