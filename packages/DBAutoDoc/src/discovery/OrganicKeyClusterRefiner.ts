/**
 * Organic Key Cluster Refiner
 *
 * Takes candidate clusters from {@link OrganicKeyClusterDetector} and uses an LLM
 * (via DBAutoDoc's existing BaseLLM abstraction) to:
 *   - Name the underlying concept (snake_case)
 *   - Eject members that don't belong
 *   - Split mixed clusters into coherent sub-clusters
 *   - Pick a normalization strategy
 *   - Score per-cluster confidence + reasoning
 *   - Decide whether the cluster is a *useful* organic key (vs. coherent-but-not-useful
 *     concepts like ModifiedDate audit timestamps)
 *
 * Follows the same LLM-invocation pattern as LLMDiscoveryValidator.
 */

import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { AIConfig } from '../types/config.js';
import { createLLMInstance } from '../utils/llm-factory.js';
import {
    OrganicKeyCluster,
    OrganicKeyClusterMember,
    OrganicKeyNormalizationStrategy,
} from '../types/organic-keys.js';

/** Result of refining a single cluster. */
export interface ClusterRefinementResult {
    outcome: 'keep' | 'split' | 'reject' | 'error';
    /** Tokens consumed by the LLM call. */
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
    /** For 'keep' — the refined cluster (with concept/normalization/confidence filled in and outliers removed). */
    refinedCluster?: OrganicKeyCluster;
    /** For 'split' — the coherent sub-clusters the LLM partitioned the input into. */
    subClusters?: OrganicKeyCluster[];
    /** For 'reject' — explanation. */
    rejectReason?: string;
    /** For 'error' — failure detail. */
    errorMessage?: string;
}

/** LLM response shape — what the JSON-mode call returns. */
interface LLMRefinementResponse {
    concept: string;
    isUsefulOrganicKey: boolean;
    normalization: OrganicKeyNormalizationStrategy;
    confidence: number;
    reasoning: string;
    outliers?: string[];
    subClusters?: Array<{
        concept: string;
        members: string[];
        normalization: OrganicKeyNormalizationStrategy;
        isUsefulOrganicKey: boolean;
        reasoning: string;
    }>;
}

const SYSTEM_PROMPT = `You are a database schema analyst evaluating candidate "organic key" clusters.

An organic key is a value-based matching rule between entities (NOT a foreign key). It lets the
UI show "related records" across tables by matching shared business values (email, phone, domain,
customer ID, etc.) even when no FK enforces the relationship.

You will be given a candidate cluster of columns that an embedding-based clusterer grouped together.
Your job is to evaluate whether this is one coherent concept, split it if mixed, eject members that
don't fit, and decide if the result is a useful organic key.

CRITERIA for a useful organic key:
- All members share the same semantic concept (e.g. all are email addresses, all are customer IDs)
- Values flow across entities in ways users would want to match on
- NOT useful: shared audit timestamps (e.g. ModifiedDate everywhere — same concept but no one matches records by it)
- NOT useful: distinct primary keys grouped because the names rhyme (ProductID, ProductCategoryID — semantically related but DIFFERENT identifiers)
- NOT useful: rowguid / replication GUIDs — system-generated, never user-matchable

Output STRICT JSON matching this schema:
{
  "concept": "snake_case_concept_name",
  "isUsefulOrganicKey": boolean,
  "normalization": "LowerCaseTrim" | "Trim" | "ExactMatch" | "Custom",
  "confidence": 0.0-1.0,
  "reasoning": "1-3 sentences explaining the decision",
  "outliers": ["Schema.Table.Column", ...],
  "subClusters": [
    {
      "concept": "snake_case_name",
      "members": ["Schema.Table.Column", ...],
      "normalization": "...",
      "isUsefulOrganicKey": boolean,
      "reasoning": "..."
    }
  ]
}

If the cluster is fine as-is, leave outliers and subClusters empty.
If the cluster should be entirely rejected, set isUsefulOrganicKey=false and leave subClusters empty.
If the cluster should be split, populate subClusters and leave the top-level concept general.

Output ONLY the JSON, no markdown fences.`;

export class OrganicKeyClusterRefiner {
    private llm: BaseLLM;

    /**
     * Construct a refiner using DBAutoDoc's standard BaseLLM factory pattern.
     * Tests may pass a pre-built `llm` instance to avoid the factory dispatch
     * (use {@link OrganicKeyClusterRefiner.withLLM} for the explicit form).
     */
    constructor(private aiConfig: AIConfig, llm?: BaseLLM) {
        if (llm) {
            this.llm = llm;
            return;
        }
        // Use createLLMInstance which correctly maps the provider name
        // (e.g. 'gemini') to the registered driver class name (e.g. 'GeminiLLM').
        // Passing the provider name directly to ClassFactory.CreateInstance returns
        // the abstract BaseLLM, whose ChatCompletion throws at call time.
        this.llm = createLLMInstance(aiConfig.provider, aiConfig.apiKey);
    }

    /** Test-friendly factory that injects a pre-built BaseLLM. */
    public static withLLM(aiConfig: AIConfig, llm: BaseLLM): OrganicKeyClusterRefiner {
        return new OrganicKeyClusterRefiner(aiConfig, llm);
    }

    /**
     * Refine a single candidate cluster.
     * Members get description context inlined into the user prompt so the LLM has
     * the full semantic signal — schema, table, column, and column description.
     */
    public async refine(
        cluster: OrganicKeyCluster,
        memberDescriptions: Map<string, string>,
    ): Promise<ClusterRefinementResult> {
        const userPrompt = buildUserPrompt(cluster, memberDescriptions);

        const params: ChatParams = {
            model: this.aiConfig.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: this.aiConfig.temperature ?? 0.1,
            maxOutputTokens: this.aiConfig.maxTokens,
            responseFormat: 'JSON',
        };

        let chatResult: ChatResult;
        try {
            chatResult = await this.llm.ChatCompletion(params);
        } catch (err) {
            return {
                outcome: 'error',
                tokensUsed: 0,
                inputTokens: 0,
                outputTokens: 0,
                errorMessage: (err as Error).message,
            };
        }

        if (!chatResult.success) {
            return {
                outcome: 'error',
                tokensUsed: 0,
                inputTokens: 0,
                outputTokens: 0,
                errorMessage: `LLM call failed: ${chatResult.errorMessage}`,
            };
        }

        const content = chatResult.data?.choices?.[0]?.message?.content ?? '';
        const usage = chatResult.data?.usage;
        const tokensUsed = usage?.totalTokens ?? 0;
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;

        let parsed: LLMRefinementResponse;
        try {
            parsed = JSON.parse(stripMarkdownFences(content));
        } catch (parseErr) {
            return {
                outcome: 'error',
                tokensUsed,
                inputTokens,
                outputTokens,
                errorMessage: `Failed to parse LLM JSON: ${(parseErr as Error).message}`,
            };
        }

        // Handle split outcome first
        if (parsed.subClusters && parsed.subClusters.length > 0) {
            const subClusters = parsed.subClusters
                .filter((sc) => sc.isUsefulOrganicKey)
                .map((sc, idx) => buildSubCluster(cluster, sc, idx));
            return {
                outcome: 'split',
                tokensUsed,
                inputTokens,
                outputTokens,
                subClusters,
            };
        }

        // Reject outcome
        if (!parsed.isUsefulOrganicKey) {
            return {
                outcome: 'reject',
                tokensUsed,
                inputTokens,
                outputTokens,
                rejectReason: parsed.reasoning,
            };
        }

        // Keep outcome — apply outlier ejection
        const ejectedSet = new Set(parsed.outliers ?? []);
        const survivingMembers = cluster.members.filter(
            (m) => !ejectedSet.has(memberKey(m)),
        );

        const refined: OrganicKeyCluster = {
            ...cluster,
            concept: parsed.concept,
            normalization: parsed.normalization,
            confidence: clamp01(parsed.confidence),
            reasoning: parsed.reasoning,
            members: survivingMembers,
        };

        return {
            outcome: 'keep',
            tokensUsed,
            inputTokens,
            outputTokens,
            refinedCluster: refined,
        };
    }

    /**
     * Refine a batch of clusters with bounded concurrency.
     * Returns refined clusters (keeps + sub-clusters from splits), aggregated token usage,
     * and counts by outcome.
     */
    public async refineAll(
        clusters: OrganicKeyCluster[],
        memberDescriptions: Map<string, string>,
        opts: { concurrency?: number } = {},
    ): Promise<{
        confirmed: OrganicKeyCluster[];
        rejected: number;
        split: number;
        errors: number;
        tokens: { total: number; input: number; output: number };
    }> {
        const concurrency = Math.max(1, opts.concurrency ?? 4);
        const confirmed: OrganicKeyCluster[] = [];
        let rejected = 0;
        let split = 0;
        let errors = 0;
        let totalTokens = 0;
        let inputTokens = 0;
        let outputTokens = 0;

        let cursor = 0;
        const runners = Array.from({ length: concurrency }, async () => {
            while (true) {
                const idx = cursor++;
                if (idx >= clusters.length) return;
                const result = await this.refine(clusters[idx], memberDescriptions);
                totalTokens += result.tokensUsed;
                inputTokens += result.inputTokens;
                outputTokens += result.outputTokens;
                switch (result.outcome) {
                    case 'keep':
                        if (result.refinedCluster) confirmed.push(result.refinedCluster);
                        break;
                    case 'split':
                        split++;
                        if (result.subClusters) confirmed.push(...result.subClusters);
                        break;
                    case 'reject':
                        rejected++;
                        break;
                    case 'error':
                        errors++;
                        break;
                }
            }
        });

        await Promise.all(runners);
        return {
            confirmed,
            rejected,
            split,
            errors,
            tokens: { total: totalTokens, input: inputTokens, output: outputTokens },
        };
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildUserPrompt(cluster: OrganicKeyCluster, descriptions: Map<string, string>): string {
    const lines = [
        `Candidate cluster with ${cluster.members.length} columns (max intra-cluster distance: ${cluster.maxIntraDistance.toFixed(3)}):`,
        '',
    ];
    for (const m of cluster.members) {
        const key = memberKey(m);
        const desc = descriptions.get(key) ?? '';
        lines.push(`- ${key}`);
        if (desc) lines.push(`    "${desc}"`);
    }
    if (cluster.tags.length > 0) {
        lines.push('');
        lines.push(`Structural tags: ${cluster.tags.join(', ')}`);
    }
    lines.push('');
    lines.push('Evaluate per the system prompt and output strict JSON.');
    return lines.join('\n');
}

function buildSubCluster(
    parent: OrganicKeyCluster,
    sub: {
        concept: string;
        members: string[];
        normalization: OrganicKeyNormalizationStrategy;
        isUsefulOrganicKey: boolean;
        reasoning: string;
    },
    subIndex: number,
): OrganicKeyCluster {
    const memberSet = new Set(sub.members);
    const subMembers = parent.members.filter((m) => memberSet.has(memberKey(m)));
    return {
        ...parent,
        id: `${parent.id}_sub${subIndex}`,
        concept: sub.concept,
        normalization: sub.normalization,
        confidence: 0.9, // LLM-split sub-clusters get a high default; not directly scored
        reasoning: sub.reasoning,
        members: subMembers,
    };
}

function memberKey(m: OrganicKeyClusterMember): string {
    return `${m.schema}.${m.table}.${m.column}`;
}

function clamp01(x: number): number {
    if (!Number.isFinite(x)) return 0;
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
}

function stripMarkdownFences(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith('```')) {
        const lines = trimmed.split('\n');
        // Drop the leading ``` line (possibly ```json)
        lines.shift();
        // Drop the trailing ``` line if present
        if (lines[lines.length - 1]?.trim() === '```') lines.pop();
        return lines.join('\n');
    }
    return trimmed;
}
