/**
 * Semantic Cluster Expander — post-refinement, LLM-driven cluster growth.
 *
 * After the refiner has named each KEEP cluster's concept, the expander does
 * one additional pass per cluster:
 *
 *   1. Compute the cluster's centroid embedding from its members
 *   2. Find K nearest-neighbor columns in the schema NOT currently in any
 *      cluster (by cosine similarity to the centroid)
 *   3. Ask the LLM which of those candidates also belong in the cluster
 *   4. Add confirmed candidates to the cluster
 *
 * This catches the under-selection failure mode where some columns belonging
 * to a concept sit far from the cluster centroid in embedding space — far
 * enough that complete-linkage refused to merge them, but close enough that
 * a centroid-anchored K-NN search picks them up. The LLM then makes the
 * semantic call on whether each candidate genuinely belongs.
 *
 * Replaces an earlier hardcoded-regex catalog approach. This version is:
 *   - Language-agnostic (operates on embeddings + descriptions, not name patterns)
 *   - Generalizes to any concept the LLM names (not just a fixed catalog)
 *   - Subject to the same LLM semantic judgment as the rest of the pipeline
 *   - Resolves multi-cluster claims via highest-confidence-wins arbitration
 */

import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { AIConfig } from '../types/config.js';
import { createLLMInstance } from '../utils/llm-factory.js';
import {
    OrganicKeyCluster,
    OrganicKeyClusterMember,
} from '../types/organic-keys.js';
import type { DetectorInputColumn } from './OrganicKeyClusterDetector.js';

/** Aggregate result of running expansion across all clusters. */
export interface ExpansionResult {
    /** Clusters with confirmed expansions merged in. */
    expandedClusters: OrganicKeyCluster[];
    /** Total new members added across all clusters. */
    addedMemberCount: number;
    /** Per-cluster breakdown for telemetry / audit. */
    perCluster: ClusterExpansion[];
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
}

/** Audit record for one cluster's expansion attempt. */
export interface ClusterExpansion {
    clusterId: string;
    concept: string;
    /** Candidates surfaced by K-NN search (pre-LLM judgment). */
    candidatesConsidered: number;
    /** Candidates the LLM confirmed as cluster members. */
    confirmedAdditions: number;
    /** Status. */
    outcome: 'expanded' | 'no-additions' | 'no-candidates' | 'error';
    errorMessage?: string;
}

export interface SemanticExpansionOptions {
    /** Number of nearest neighbors to consider per cluster (default: 15). */
    topK?: number;
    /** Minimum cosine similarity threshold for candidate consideration (default: 0.5). */
    similarityFloor?: number;
    /** Concurrency for per-cluster LLM calls (default: 4). */
    concurrency?: number;
}

/** LLM response shape. */
interface ExpansionResponse {
    additions: Array<{
        column: string;
        reasoning: string;
    }>;
}

const SYSTEM_PROMPT = `You are evaluating whether candidate columns should JOIN an existing organic-key cluster.

You'll be given:
- An EXISTING cluster: its named concept, normalization strategy, and current member columns with their descriptions
- A list of CANDIDATE columns (with descriptions) that are semantically near the cluster's centroid but were NOT included by the earlier clustering step

Your job: for each candidate, decide whether it BELONGS in the cluster — i.e., is it the same business concept and would values from this column reasonably match values from existing cluster members for organic-key navigation?

CRITERIA for adding a candidate:
- The column represents the same business concept as the existing cluster
- Values in this column draw from the same value space as the cluster members
- A user viewing a record on one cluster member's table would benefit from seeing matching records on this candidate's table

CRITERIA against adding a candidate:
- The column is a similar-sounding but distinct concept (e.g., \`EmailServerHost\` is server config, not an email address)
- Free-form text fields where matching doesn't carry meaning (templates, descriptions, notes)
- Audit/system fields where the LLM's prior refinement step would have rejected them
- Distinct identifier spaces that happen to share a naming pattern

Be CONSERVATIVE. The default answer for a borderline candidate is NO. Adding noise to a confirmed cluster degrades the whole cluster; rejecting a borderline-true candidate just leaves it for the user to add manually.

Output STRICT JSON matching this schema:
{
  "additions": [
    { "column": "Schema.Table.Column", "reasoning": "1 short sentence explaining why this candidate belongs" }
  ]
}

If no candidates belong, return { "additions": [] }.
Output ONLY the JSON, no markdown fences.`;

export class SemanticClusterExpander {
    private readonly llm: BaseLLM;
    private readonly aiConfig: AIConfig;

    constructor(aiConfig: AIConfig) {
        this.aiConfig = aiConfig;
        this.llm = createLLMInstance(aiConfig.provider, aiConfig.apiKey);
    }

    /**
     * Expand all clusters by considering K-NN candidates from the residual column pool.
     *
     * @param clusters  KEEP clusters from the refiner
     * @param allColumns Original input columns (with embeddings attached)
     * @param descriptions Map of `schema.table.column` → description text
     * @param opts Tunable options
     */
    public async expandAll(
        clusters: OrganicKeyCluster[],
        allColumns: DetectorInputColumn[],
        descriptions: Map<string, string>,
        opts: SemanticExpansionOptions = {},
    ): Promise<ExpansionResult> {
        const topK = Math.max(1, opts.topK ?? 15);
        const similarityFloor = opts.similarityFloor ?? 0.5;
        const concurrency = Math.max(1, opts.concurrency ?? 4);

        // Build the assigned-columns set so we don't try to claim columns already in a cluster
        const assigned = new Set<string>();
        for (const c of clusters) {
            for (const m of c.members) {
                assigned.add(memberKey(m));
            }
        }

        // Build a lookup table of columns with embeddings
        const colsByKey = new Map<string, DetectorInputColumn>();
        for (const col of allColumns) {
            if (col.embedding) colsByKey.set(columnKey(col), col);
        }

        // Identify the residual pool — columns with embeddings NOT in any cluster
        const residual = allColumns.filter(
            (c) => c.embedding && !assigned.has(columnKey(c)),
        );

        // Process clusters in priority order (highest confidence first) so the
        // strongest cluster gets to claim shared candidates.
        const sortedClusters = [...clusters].sort((a, b) => b.confidence - a.confidence);

        // Track which residual columns each cluster has claimed so we can resolve
        // multi-claim conflicts. We process clusters serially within a concurrency
        // worker to ensure the assigned-set updates correctly.
        const newlyAssigned = new Set<string>();
        const perClusterResults = new Map<string, ClusterExpansion>();
        let tokensUsed = 0;
        let inputTokens = 0;
        let outputTokens = 0;

        // Run expansion with bounded concurrency. Each call computes its own K-NN
        // from residual+newlyAssigned, so order matters — we serialize by chunk.
        let cursor = 0;
        const runners = Array.from({ length: concurrency }, async () => {
            while (true) {
                const idx = cursor++;
                if (idx >= sortedClusters.length) return;
                const cluster = sortedClusters[idx];
                try {
                    const expansion = await this.expandOne(
                        cluster,
                        residual,
                        newlyAssigned,
                        colsByKey,
                        descriptions,
                        topK,
                        similarityFloor,
                    );
                    tokensUsed += expansion.tokensUsed;
                    inputTokens += expansion.inputTokens;
                    outputTokens += expansion.outputTokens;
                    perClusterResults.set(cluster.id, expansion.audit);
                    // Apply the confirmed additions to the cluster IN-PLACE
                    for (const add of expansion.additions) {
                        cluster.members.push(add);
                        newlyAssigned.add(memberKey(add));
                    }
                } catch (err) {
                    perClusterResults.set(cluster.id, {
                        clusterId: cluster.id,
                        concept: cluster.concept,
                        candidatesConsidered: 0,
                        confirmedAdditions: 0,
                        outcome: 'error',
                        errorMessage: (err as Error).message,
                    });
                }
            }
        });
        await Promise.all(runners);

        // Compute added-member total
        const addedMemberCount = Array.from(perClusterResults.values()).reduce(
            (a, c) => a + c.confirmedAdditions,
            0,
        );

        // Preserve original cluster order in the output
        const expandedClusters = clusters; // mutated in place
        const perCluster = clusters.map(
            (c) =>
                perClusterResults.get(c.id) ?? {
                    clusterId: c.id,
                    concept: c.concept,
                    candidatesConsidered: 0,
                    confirmedAdditions: 0,
                    outcome: 'no-candidates' as const,
                },
        );

        return {
            expandedClusters,
            addedMemberCount,
            perCluster,
            tokensUsed,
            inputTokens,
            outputTokens,
        };
    }

    /** Expand a single cluster. */
    private async expandOne(
        cluster: OrganicKeyCluster,
        residual: DetectorInputColumn[],
        newlyAssigned: Set<string>,
        colsByKey: Map<string, DetectorInputColumn>,
        descriptions: Map<string, string>,
        topK: number,
        similarityFloor: number,
    ): Promise<{
        additions: OrganicKeyClusterMember[];
        audit: ClusterExpansion;
        tokensUsed: number;
        inputTokens: number;
        outputTokens: number;
    }> {
        // Compute centroid from current member embeddings (current includes any
        // additions made earlier in this run since we mutate clusters in place).
        const memberEmbeddings: Float32Array[] = [];
        for (const m of cluster.members) {
            const col = colsByKey.get(memberKey(m));
            if (col?.embedding) {
                memberEmbeddings.push(toFloat32(col.embedding));
            }
        }
        if (memberEmbeddings.length === 0) {
            return {
                additions: [],
                audit: {
                    clusterId: cluster.id,
                    concept: cluster.concept,
                    candidatesConsidered: 0,
                    confirmedAdditions: 0,
                    outcome: 'no-candidates',
                },
                tokensUsed: 0,
                inputTokens: 0,
                outputTokens: 0,
            };
        }
        const centroid = unitNormalize(computeCentroid(memberEmbeddings));

        // Score residual columns against the centroid (skip already-claimed ones)
        const candidates: { col: DetectorInputColumn; sim: number }[] = [];
        for (const col of residual) {
            if (newlyAssigned.has(columnKey(col))) continue;
            const cosSim = dot(centroid, unitNormalize(toFloat32(col.embedding!)));
            if (cosSim >= similarityFloor) {
                candidates.push({ col, sim: cosSim });
            }
        }
        candidates.sort((a, b) => b.sim - a.sim);
        const topCandidates = candidates.slice(0, topK);

        if (topCandidates.length === 0) {
            return {
                additions: [],
                audit: {
                    clusterId: cluster.id,
                    concept: cluster.concept,
                    candidatesConsidered: 0,
                    confirmedAdditions: 0,
                    outcome: 'no-candidates',
                },
                tokensUsed: 0,
                inputTokens: 0,
                outputTokens: 0,
            };
        }

        // Build the LLM prompt
        const userPrompt = buildUserPrompt(cluster, topCandidates, descriptions);
        const params: ChatParams = {
            model: this.aiConfig.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: this.aiConfig.temperature ?? 0,
            maxOutputTokens: this.aiConfig.maxTokens,
            responseFormat: 'JSON',
        };
        const result: ChatResult = await this.llm.ChatCompletion(params);

        if (!result.success) {
            throw new Error(`Expansion LLM call failed: ${result.errorMessage ?? 'unknown'}`);
        }
        const content = result.data?.choices?.[0]?.message?.content ?? '';
        const tokensUsed = result.data?.usage?.totalTokens ?? 0;
        const inputTokens = result.data?.usage?.promptTokens ?? 0;
        const outputTokens = result.data?.usage?.completionTokens ?? 0;

        const parsed = parseExpansionResponse(content);

        // Resolve the LLM's column references back to actual column objects.
        // Be defensive: the LLM may hallucinate columns or get the format slightly wrong.
        const candidateByKey = new Map(topCandidates.map((c) => [columnKey(c.col), c.col]));
        const additions: OrganicKeyClusterMember[] = [];
        for (const add of parsed.additions) {
            const col = candidateByKey.get(add.column);
            if (!col) continue; // LLM hallucinated a column key; skip
            additions.push({
                schema: col.schema,
                table: col.table,
                column: col.column,
                participatesInFK: !!col.participatesInFK,
                fkTarget: col.fkTarget ?? null,
            });
        }

        return {
            additions,
            audit: {
                clusterId: cluster.id,
                concept: cluster.concept,
                candidatesConsidered: topCandidates.length,
                confirmedAdditions: additions.length,
                outcome: additions.length > 0 ? 'expanded' : 'no-additions',
            },
            tokensUsed,
            inputTokens,
            outputTokens,
        };
    }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function columnKey(col: { schema: string; table: string; column: string }): string {
    return `${col.schema}.${col.table}.${col.column}`;
}

function memberKey(m: { schema: string; table: string; column: string }): string {
    return `${m.schema}.${m.table}.${m.column}`;
}

function toFloat32(vec: Float32Array | number[]): Float32Array {
    return vec instanceof Float32Array ? vec : Float32Array.from(vec);
}

function computeCentroid(vectors: Float32Array[]): Float32Array {
    const dim = vectors[0].length;
    const out = new Float32Array(dim);
    for (const v of vectors) {
        const normalized = unitNormalize(v);
        for (let i = 0; i < dim; i++) out[i] += normalized[i];
    }
    for (let i = 0; i < dim; i++) out[i] /= vectors.length;
    return out;
}

function unitNormalize(v: Float32Array): Float32Array {
    let n = 0;
    for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
    return out;
}

function dot(a: Float32Array, b: Float32Array): number {
    let s = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) s += a[i] * b[i];
    return s;
}

function buildUserPrompt(
    cluster: OrganicKeyCluster,
    candidates: { col: DetectorInputColumn; sim: number }[],
    descriptions: Map<string, string>,
): string {
    const lines: string[] = [];
    lines.push(`Existing cluster: \`${cluster.concept}\``);
    lines.push(`Normalization strategy: \`${cluster.normalization}\``);
    lines.push(`Current members (${cluster.members.length}):`);
    for (const m of cluster.members.slice(0, 20)) {
        const desc = descriptions.get(memberKey(m)) ?? '';
        lines.push(`  - ${m.schema}.${m.table}.${m.column}`);
        if (desc) lines.push(`      "${truncate(desc, 200)}"`);
    }
    if (cluster.members.length > 20) {
        lines.push(`  ... and ${cluster.members.length - 20} more members`);
    }
    lines.push('');
    lines.push(`Candidate columns (sorted by similarity to cluster centroid, descending):`);
    for (const { col, sim } of candidates) {
        const desc = descriptions.get(columnKey(col)) ?? '';
        lines.push(`  - ${col.schema}.${col.table}.${col.column}  (similarity ${sim.toFixed(2)})`);
        if (desc) lines.push(`      "${truncate(desc, 200)}"`);
    }
    lines.push('');
    lines.push('Decide which candidates belong in the cluster. Output the JSON per the system prompt.');
    return lines.join('\n');
}

function parseExpansionResponse(content: string): ExpansionResponse {
    const cleaned = content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
    if (!cleaned) return { additions: [] };
    try {
        const parsed = JSON.parse(cleaned) as Partial<ExpansionResponse>;
        if (!parsed.additions || !Array.isArray(parsed.additions)) {
            return { additions: [] };
        }
        return {
            additions: parsed.additions
                .filter((a) => a && typeof a.column === 'string')
                .map((a) => ({
                    column: a.column,
                    reasoning: typeof a.reasoning === 'string' ? a.reasoning : '',
                })),
        };
    } catch {
        return { additions: [] };
    }
}

function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
