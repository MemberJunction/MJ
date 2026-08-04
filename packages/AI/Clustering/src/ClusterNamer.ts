/**
 * @fileoverview Optional LLM-based cluster naming.
 *
 * Uses {@link AIPromptRunner} directly (never an Action-calls-Action pattern)
 * to ask an LLM for concise theme labels for each cluster, given a sample of
 * member labels. If the configured prompt is not present in metadata, naming is
 * skipped gracefully and default labels remain.
 */

import { UserInfo, LogError } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { ClusterInfo, ClusterPoint } from './types';

/** Name of the AI Prompt used to label clusters (resolved from metadata). */
export const CLUSTER_NAMING_PROMPT_NAME = 'Name Clusters';

/** Shape the engine expects the naming prompt to return. */
interface ClusterNamingResult {
    /** Labels keyed by cluster index. */
    labels: { clusterIndex: number; label: string }[];
}

/** A compact, LLM-friendly description of one cluster. */
interface ClusterSample {
    clusterIndex: number;
    memberCount: number;
    sampleLabels: string[];
}

/**
 * Generates human-readable labels for clusters using an LLM.
 */
export class ClusterNamer {
    private readonly maxSamplesPerCluster = 12;

    /**
     * Apply LLM-generated labels to the supplied clusters in place.
     * On any failure (prompt missing, LLM error, parse error) the clusters are
     * left untouched and the method resolves without throwing.
     *
     * @param clusters Cluster summaries to label (mutated in place).
     * @param points Projected points, used to sample member labels per cluster.
     * @param contextUser User context for prompt execution (required server-side).
     * @param promptName Optional override of the naming prompt name.
     */
    public async NameClusters(
        clusters: ClusterInfo[],
        points: ClusterPoint[],
        contextUser?: UserInfo,
        promptName: string = CLUSTER_NAMING_PROMPT_NAME,
    ): Promise<void> {
        if (clusters.length === 0) {
            return;
        }

        try {
            const prompt = await this.resolvePrompt(promptName, contextUser);
            if (!prompt) {
                LogError(`ClusterNamer: prompt "${promptName}" not found — skipping cluster naming.`);
                return;
            }

            const samples = this.buildSamples(clusters, points);
            const result = await this.runPrompt(prompt, samples, contextUser);
            if (result) {
                this.applyLabels(clusters, result);
            }
        } catch (e) {
            LogError(`ClusterNamer: naming failed — keeping default labels. ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Resolve the naming prompt from AIEngine metadata (cached). */
    private async resolvePrompt(promptName: string, contextUser?: UserInfo) {
        await AIEngineBase.Instance.Config(false, contextUser);
        return AIEngineBase.Instance.Prompts.find((p) => p.Name === promptName) ?? null;
    }

    /** Build a compact, ordered sample of member labels for each cluster. */
    private buildSamples(clusters: ClusterInfo[], points: ClusterPoint[]): ClusterSample[] {
        return clusters.map((c) => {
            const members = points.filter((p) => p.ClusterIndex === c.Index);
            return {
                clusterIndex: c.Index,
                memberCount: c.MemberCount,
                sampleLabels: members.slice(0, this.maxSamplesPerCluster).map((m) => m.Label),
            };
        });
    }

    /** Execute the naming prompt and return the parsed result, or null. */
    private async runPrompt(
        prompt: AIPromptParams['prompt'],
        samples: ClusterSample[],
        contextUser?: UserInfo,
    ): Promise<ClusterNamingResult | null> {
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.contextUser = contextUser;
        params.data = { clusters: samples };

        const runner = new AIPromptRunner();
        const result = await runner.ExecutePrompt<ClusterNamingResult>(params);
        if (!result.success || !result.result) {
            LogError(`ClusterNamer: prompt execution failed: ${result.errorMessage ?? 'unknown error'}`);
            return null;
        }
        return result.result;
    }

    /** Apply parsed labels to clusters, skipping user-edited ones. */
    private applyLabels(clusters: ClusterInfo[], result: ClusterNamingResult): void {
        if (!Array.isArray(result.labels)) {
            return;
        }
        const byIndex = new Map(result.labels.map((l) => [l.clusterIndex, l.label]));
        for (const cluster of clusters) {
            if (cluster.IsUserEdited) {
                continue;
            }
            const label = byIndex.get(cluster.Index);
            if (label && label.trim().length > 0) {
                cluster.Label = label.trim();
            }
        }
    }
}
