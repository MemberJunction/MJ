/**
 * Concept-Merge Pass — post-refinement consolidation of organic key clusters.
 *
 * The agglomerative clusterer (complete-linkage) cannot merge two candidate clusters
 * whose max pairwise distance exceeds the threshold, even when both represent the
 * same underlying business concept. Empirically against AdventureWorks we observed
 * three separate `product_id` clusters survive refinement — same concept, three
 * separate KEEP entries.
 *
 * This pass groups KEEP clusters by normalized concept name and, for any group
 * with ≥2 entries, asks the LLM whether to merge them. Confirmed equivalent
 * clusters become a single OrganicKeyCluster with merged member list and lineage
 * preserved via mergedFromClusterIds.
 *
 * Reuses the existing BaseLLM pattern from LLMDiscoveryValidator (same
 * @memberjunction/ai dependency DBAutoDoc already imports).
 */

import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { AIConfig } from '../types/config.js';
import { createLLMInstance } from '../utils/llm-factory.js';
import {
    OrganicKeyCluster,
    OrganicKeyClusterMember,
    OrganicKeyClusterTag,
} from '../types/organic-keys.js';

/** Aggregate result of running concept-merge across all KEEP clusters. */
export interface ConceptMergePassResult {
    /** Final cluster list after merging. */
    clusters: OrganicKeyCluster[];
    /** Audit trail of merge groups considered (one entry per same-concept group of size ≥2). */
    mergeGroups: ConceptMergeGroup[];
    /** Number of input clusters merged away (= input.length - clusters.length). */
    mergedAwayCount: number;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
}

/** Audit record for one same-concept group the pass considered. */
export interface ConceptMergeGroup {
    normalizedConcept: string;
    inputClusterIds: string[];
    /** Outcome: 'merged-all' / 'merged-partial' / 'kept-separate' / 'error'. */
    outcome: 'merged-all' | 'merged-partial' | 'kept-separate' | 'error';
    /** For merged outcomes: which output cluster ID(s) the inputs produced. */
    outputClusterIds: string[];
    /** LLM reasoning. */
    reasoning: string;
    errorMessage?: string;
}

/** Internal: LLM response shape for a merge decision. */
interface MergeDecisionResponse {
    /** Should all input clusters merge into ONE cluster? */
    mergeAll: boolean;
    /** Partition: if mergeAll=false but some subset can merge, list them as groups of input cluster IDs. */
    partition?: Array<{ clusterIds: string[]; reasoning?: string }>;
    /** Overall reasoning for the decision. */
    reasoning: string;
}

const SYSTEM_PROMPT = `You are a database schema analyst consolidating organic key cluster proposals.

You will be given several clusters that the upstream LLM refinement step assigned the SAME concept
name (e.g. all named "product_id"). They survived as separate clusters because the original
clustering algorithm (agglomerative complete-linkage) could not merge them — typically because
their embedding distances exceeded the merge threshold even though they represent the same
business concept.

Your job: decide whether these clusters represent ONE underlying business concept (and should
merge into one cluster) or whether the LLM gave them the same name loosely and they're actually
distinct (and should stay separate).

CRITERIA for merging:
- The clusters should describe the same business entity / attribute / concept
- The value spaces should reasonably overlap (a Person.ID in one cluster and a Customer.ID in
  another may both be "customer_id" only if they reference the same identifier system)
- If members FK to the same target table, they're nearly always the same concept and should merge
- If members FK to different target tables, they MAY still merge if the cross-cutting concept is
  the actual organic key (e.g. BusinessEntityID across hierarchical sub-types)

CRITERIA against merging:
- Different identifier spaces that happen to share a name (e.g. "internal customer_id" vs
  "external CRM customer_id" — both customer IDs but disjoint value systems)
- Different granularities (e.g. "order_id" at header level vs at line-item level)
- One cluster is clearly a system field while another is a business field

Output STRICT JSON:
{
  "mergeAll": boolean,             // true = merge all input clusters into one
  "partition": [                    // optional; only when mergeAll=false but partial merge is correct
    { "clusterIds": ["c1", "c2"], "reasoning": "..." },
    { "clusterIds": ["c3"], "reasoning": "..." }
  ],
  "reasoning": "1-3 sentences explaining the overall decision"
}

If mergeAll is true, omit "partition".
If mergeAll is false AND no partial merge applies, omit "partition" (each input cluster stays separate).
Output ONLY the JSON, no markdown fences.`;

export class ConceptMergePass {
    private llm: BaseLLM;

    constructor(private readonly aiConfig: AIConfig) {
        // Use createLLMInstance which maps provider name → registered driver class name.
        // ClassFactory.CreateInstance(BaseLLM, 'gemini') returns the abstract base, not GeminiLLM.
        this.llm = createLLMInstance(aiConfig.provider, aiConfig.apiKey);
    }

    /**
     * Run the concept-merge pass across all KEEP clusters. Single-concept groups pass through
     * unchanged with zero LLM cost; multi-concept groups get one LLM call each.
     */
    public async mergeAll(clusters: OrganicKeyCluster[]): Promise<ConceptMergePassResult> {
        const groups = groupByNormalizedConcept(clusters);

        const finalClusters: OrganicKeyCluster[] = [];
        const mergeGroups: ConceptMergeGroup[] = [];
        let tokensUsed = 0;
        let inputTokens = 0;
        let outputTokens = 0;

        for (const [normalizedConcept, group] of groups) {
            // Single-cluster groups pass through with no LLM call
            if (group.length === 1) {
                finalClusters.push(group[0]);
                continue;
            }

            // Multi-cluster group: ask LLM
            try {
                const decision = await this.queryMergeDecision(normalizedConcept, group);
                tokensUsed += decision.tokensUsed;
                inputTokens += decision.inputTokens;
                outputTokens += decision.outputTokens;

                if (decision.response.mergeAll) {
                    // Merge all into one cluster
                    const merged = mergeClusters(group, decision.response.reasoning);
                    finalClusters.push(merged);
                    mergeGroups.push({
                        normalizedConcept,
                        inputClusterIds: group.map((c) => c.id),
                        outcome: 'merged-all',
                        outputClusterIds: [merged.id],
                        reasoning: decision.response.reasoning,
                    });
                } else if (decision.response.partition && decision.response.partition.length > 0) {
                    // Partial merge: each partition entry becomes one output cluster
                    const idToCluster = new Map(group.map((c) => [c.id, c]));
                    const outputIds: string[] = [];
                    for (const partition of decision.response.partition) {
                        const inGroup = partition.clusterIds
                            .map((id) => idToCluster.get(id))
                            .filter((c): c is OrganicKeyCluster => !!c);
                        if (inGroup.length === 0) continue;
                        if (inGroup.length === 1) {
                            finalClusters.push(inGroup[0]);
                            outputIds.push(inGroup[0].id);
                        } else {
                            const merged = mergeClusters(
                                inGroup,
                                partition.reasoning ?? decision.response.reasoning,
                            );
                            finalClusters.push(merged);
                            outputIds.push(merged.id);
                        }
                    }
                    // Any clusters not mentioned in any partition get kept separate
                    const mentioned = new Set(
                        decision.response.partition.flatMap((p) => p.clusterIds),
                    );
                    for (const c of group) {
                        if (!mentioned.has(c.id)) {
                            finalClusters.push(c);
                            outputIds.push(c.id);
                        }
                    }
                    mergeGroups.push({
                        normalizedConcept,
                        inputClusterIds: group.map((c) => c.id),
                        outcome: 'merged-partial',
                        outputClusterIds: outputIds,
                        reasoning: decision.response.reasoning,
                    });
                } else {
                    // Keep separate
                    for (const c of group) finalClusters.push(c);
                    mergeGroups.push({
                        normalizedConcept,
                        inputClusterIds: group.map((c) => c.id),
                        outcome: 'kept-separate',
                        outputClusterIds: group.map((c) => c.id),
                        reasoning: decision.response.reasoning,
                    });
                }
            } catch (err) {
                // On error, keep clusters separate and record the failure
                for (const c of group) finalClusters.push(c);
                mergeGroups.push({
                    normalizedConcept,
                    inputClusterIds: group.map((c) => c.id),
                    outcome: 'error',
                    outputClusterIds: group.map((c) => c.id),
                    reasoning: 'Merge decision failed; clusters kept separate',
                    errorMessage: (err as Error).message,
                });
            }
        }

        return {
            clusters: finalClusters,
            mergeGroups,
            mergedAwayCount: clusters.length - finalClusters.length,
            tokensUsed,
            inputTokens,
            outputTokens,
        };
    }

    /** Call the LLM with the merge-decision prompt. Returns the parsed response + token usage. */
    private async queryMergeDecision(
        normalizedConcept: string,
        clusters: OrganicKeyCluster[],
    ): Promise<{
        response: MergeDecisionResponse;
        tokensUsed: number;
        inputTokens: number;
        outputTokens: number;
    }> {
        const userPrompt = buildUserPrompt(normalizedConcept, clusters);

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

        const result: ChatResult = await this.llm.ChatCompletion(params);
        const text = result.data?.choices?.[0]?.message?.content ?? '';
        const parsed = parseResponse(text);

        return {
            response: parsed,
            tokensUsed: (result.data?.usage?.totalTokens ?? 0),
            inputTokens: (result.data?.usage?.promptTokens ?? 0),
            outputTokens: (result.data?.usage?.completionTokens ?? 0),
        };
    }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Group clusters by case-insensitive normalized concept name. */
function groupByNormalizedConcept(
    clusters: OrganicKeyCluster[],
): Map<string, OrganicKeyCluster[]> {
    const out = new Map<string, OrganicKeyCluster[]>();
    for (const cluster of clusters) {
        const key = normalizeConceptName(cluster.concept);
        const bucket = out.get(key);
        if (bucket) bucket.push(cluster);
        else out.set(key, [cluster]);
    }
    return out;
}

/** Normalize a concept name: lowercase + collapse separators + trim. */
export function normalizeConceptName(name: string): string {
    return (name ?? '')
        .toLowerCase()
        .replace(/[\s\-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim();
}

/** Merge N clusters into one. Picks the highest-confidence cluster as the "base" and unions members. */
function mergeClusters(group: OrganicKeyCluster[], reasoning: string): OrganicKeyCluster {
    // Pick base = highest confidence (ties broken by largest member count)
    const sorted = [...group].sort((a, b) => {
        const dc = b.confidence - a.confidence;
        if (dc !== 0) return dc;
        return b.members.length - a.members.length;
    });
    const base = sorted[0];

    // Dedupe members by schema.table.column key
    const seen = new Set<string>();
    const mergedMembers: OrganicKeyClusterMember[] = [];
    for (const cluster of group) {
        for (const m of cluster.members) {
            const k = `${m.schema}.${m.table}.${m.column}`;
            if (seen.has(k)) continue;
            seen.add(k);
            mergedMembers.push(m);
        }
    }

    // Union tags; if multiple FK-related tags appear, prefer 'fk-fragmented' since merging
    // implies the cross-cutting interpretation
    const tagSet = new Set<OrganicKeyClusterTag>();
    for (const c of group) for (const t of c.tags) tagSet.add(t);
    if (tagSet.has('fk-redundant-single-target') && tagSet.has('fk-fragmented')) {
        tagSet.delete('fk-redundant-single-target');
    }
    if (tagSet.size > 1 && tagSet.has('mixed')) {
        // 'mixed' is uninformative when other tags are also present
        tagSet.delete('mixed');
    }

    return {
        id: `${base.id}_merged`,
        concept: base.concept,
        normalization: base.normalization,
        customNormalizationExpression: base.customNormalizationExpression,
        members: mergedMembers,
        confidence: Math.max(...group.map((c) => c.confidence)),
        reasoning: base.reasoning,
        tags: Array.from(tagSet),
        maxIntraDistance: Math.max(...group.map((c) => c.maxIntraDistance)),
        distanceWeights: base.distanceWeights,
        mergedFromClusterIds: group.map((c) => c.id),
        mergeReasoning: reasoning,
    };
}

/** Build the user prompt describing the same-concept group for the LLM. */
function buildUserPrompt(
    normalizedConcept: string,
    clusters: OrganicKeyCluster[],
): string {
    const lines: string[] = [];
    lines.push(
        `The upstream LLM refinement step assigned the concept name "${normalizedConcept}" to ${clusters.length} separate clusters.`,
    );
    lines.push(
        'Decide whether they represent the SAME business concept (merge into one) or DIFFERENT concepts that happen to share a name.',
    );
    lines.push('');
    for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        lines.push(`─── Cluster ${i + 1} (id: ${c.id}) ───`);
        lines.push(`  concept: ${c.concept}`);
        lines.push(`  normalization: ${c.normalization}`);
        lines.push(`  confidence: ${c.confidence.toFixed(2)}`);
        lines.push(`  reasoning: ${c.reasoning}`);
        lines.push(`  tags: ${c.tags.join(', ') || '(none)'}`);
        lines.push(`  members (${c.members.length}):`);
        for (const m of c.members.slice(0, 12)) {
            const fkNote = m.participatesInFK
                ? m.fkTarget
                    ? ` [FK→ ${m.fkTarget.schema}.${m.fkTarget.table}.${m.fkTarget.column}]`
                    : ' [FK]'
                : '';
            lines.push(`    - ${m.schema}.${m.table}.${m.column}${fkNote}`);
        }
        if (c.members.length > 12) {
            lines.push(`    ... and ${c.members.length - 12} more`);
        }
        lines.push('');
    }
    lines.push('Output the JSON decision per the system prompt.');
    return lines.join('\n');
}

/** Parse the LLM JSON response, with defensive fallback on malformed output. */
function parseResponse(text: string): MergeDecisionResponse {
    // Strip code fences if the model added them despite JSON-mode
    const cleaned = text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    if (!cleaned) {
        throw new Error('Empty LLM response');
    }
    const parsed = JSON.parse(cleaned) as Partial<MergeDecisionResponse>;
    if (typeof parsed.mergeAll !== 'boolean') {
        throw new Error('LLM response missing required field: mergeAll');
    }
    return {
        mergeAll: parsed.mergeAll,
        partition: parsed.partition,
        reasoning: parsed.reasoning ?? '(no reasoning provided)',
    };
}
