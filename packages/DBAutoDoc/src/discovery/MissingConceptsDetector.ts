/**
 * Missing Concepts Detector — holistic schema-coverage search.
 *
 * After refinement + expansion + merge produce a set of confirmed clusters, the
 * LLM may have rejected (or never formed) clusters for concepts that genuinely
 * exist in the schema. This module gives the LLM a second look at the WHOLE
 * picture — confirmed clusters + a sample of uncovered columns — and asks:
 * "What organic-key concepts SHOULD exist in this schema that aren't in the
 * confirmed set?"
 *
 * For each missing concept the LLM identifies, the detector:
 *   1. Embeds the LLM's concept description as a search anchor
 *   2. Finds K nearest-neighbor residual columns by cosine similarity
 *   3. Asks the LLM to confirm membership (same per-cluster K-NN+confirm flow
 *      used by SemanticClusterExpander)
 *
 * The result is fully semantic concept discovery — no hardcoded patterns, no
 * fixed catalog. The LLM decides which concepts the schema needs based on the
 * actual data it can see.
 *
 * This is the missing piece versus the soft-key pipeline in DBAutoDoc:
 * DBAutoDoc iterates with feedback and holistic review; we need an equivalent
 * for organic keys.
 */

import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { AIConfig } from '../types/config.js';
import { createLLMInstance } from '../utils/llm-factory.js';
import {
    OrganicKeyCluster,
    OrganicKeyClusterMember,
    OrganicKeyClusterTag,
    OrganicKeyNormalizationStrategy,
} from '../types/organic-keys.js';
import type { DetectorInputColumn } from './OrganicKeyClusterDetector.js';
import { EmbeddingProvider } from './EmbeddingProvider.js';

/** Result of the missing-concepts pass. */
export interface MissingConceptsResult {
    /** Newly created clusters for concepts the LLM proposed and confirmed members for. */
    newClusters: OrganicKeyCluster[];
    /** Audit trail of concepts the LLM proposed and what happened to each. */
    proposedConcepts: ProposedConcept[];
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
}

/** Audit record for one proposed missing concept. */
export interface ProposedConcept {
    concept: string;
    /** LLM-provided description of the concept (used as embedding anchor). */
    description: string;
    /** LLM-proposed normalization strategy. */
    normalization: OrganicKeyNormalizationStrategy;
    /** Outcome of the K-NN + confirmation search. */
    outcome: 'cluster-created' | 'no-members-found' | 'rejected-too-small' | 'error';
    /** When created, the cluster ID. */
    createdClusterId?: string;
    /** Number of candidates surfaced by K-NN. */
    candidatesConsidered: number;
    /** Number of candidates the LLM confirmed. */
    confirmedMembers: number;
    errorMessage?: string;
}

export interface MissingConceptsOptions {
    /** Max number of missing concepts to propose per call (default: 10). */
    maxConcepts?: number;
    /** Number of nearest neighbors per concept (default: 20). */
    topK?: number;
    /** Cosine similarity floor for candidate consideration (default: 0.45). */
    similarityFloor?: number;
    /** Number of residual sample columns shown to LLM in the discovery prompt (default: 60). */
    residualSampleSize?: number;
}

/** Internal LLM response shapes. */
interface DiscoveryResponse {
    missingConcepts: Array<{
        concept: string;
        description: string;
        normalization: OrganicKeyNormalizationStrategy;
        reasoning: string;
    }>;
}

interface MemberConfirmationResponse {
    members: Array<{ column: string; reasoning: string }>;
}

const DISCOVERY_SYSTEM_PROMPT = `You are reviewing the COVERAGE of an organic-key detection pipeline against a database schema.

An organic key is a value-based matching rule between entities (NOT a foreign key) that lets the
UI show "related records" across tables by matching shared business values — like email addresses,
phone numbers, customer IDs, postal codes, country codes, tax IDs, web URLs, domain names, etc.

You'll be given:
1. The CONFIRMED clusters the pipeline has already identified (concept names + brief descriptions)
2. A SAMPLE of residual columns (columns NOT in any confirmed cluster) with their descriptions

Your job: identify concepts that genuinely appear in this schema but are MISSING from the
confirmed-cluster set. Only propose concepts where:
- You can see clear evidence of the concept in the residual sample (specific column names + descriptions)
- The concept matches the organic-key definition (cross-entity value-based matching, business-meaningful)
- The concept is NOT already covered by a confirmed cluster (check carefully — the existing list may
  have a similarly-named concept under a slightly different name)

DO NOT propose:
- Generic clusters (just "ID" or "Name" — too unspecific)
- Concepts already in the confirmed set
- Audit / system fields (ModifiedDate, rowguid, etc.)
- Free-form text fields (Description, Comments, Notes)
- Components of compound concepts (FirstName alone, etc.)

Output STRICT JSON:
{
  "missingConcepts": [
    {
      "concept": "snake_case_concept_name",
      "description": "1-2 sentence description of what the concept represents, what values look like, and what entity types share it",
      "normalization": "LowerCaseTrim" | "Trim" | "ExactMatch" | "Custom",
      "reasoning": "1 short sentence — why this concept is needed and what evidence in the residual sample shows it"
    }
  ]
}

If you don't find any missing concepts, return { "missingConcepts": [] }.
Output ONLY the JSON, no markdown fences.`;

const MEMBER_CONFIRMATION_SYSTEM_PROMPT = `You are deciding which candidate columns belong to a NEWLY-PROPOSED organic-key concept.

You'll be given:
- A concept (name + description) the prior step identified as missing from the schema's organic-key coverage
- A list of CANDIDATE columns (with descriptions) that are semantically near the concept based on embedding similarity

For each candidate, decide whether it BELONGS to this concept — i.e., does it represent the same business
value space, would matching values across these columns identify related records?

CRITERIA to ADD a candidate:
- The column represents the same business concept
- The value space matches (e.g. real email addresses, not server hostnames)
- A user navigating from one matched record would benefit from seeing the others

CRITERIA against ADD:
- Similar-sounding but distinct concept (EmailServerHost vs EmailAddress)
- Free-form text fields, descriptions, audit fields
- Different identifier spaces sharing a naming pattern

Be CONSERVATIVE. Return only the candidates clearly matching the concept.

Output STRICT JSON:
{
  "members": [
    { "column": "Schema.Table.Column", "reasoning": "1 sentence" }
  ]
}

Output ONLY the JSON, no markdown fences.`;

export class MissingConceptsDetector {
    private readonly llm: BaseLLM;
    private readonly aiConfig: AIConfig;
    private readonly embedder: EmbeddingProvider;

    constructor(aiConfig: AIConfig, embedder: EmbeddingProvider) {
        this.aiConfig = aiConfig;
        this.llm = createLLMInstance(aiConfig.provider, aiConfig.apiKey);
        this.embedder = embedder;
    }

    public async findAndExpand(
        confirmedClusters: OrganicKeyCluster[],
        allColumns: DetectorInputColumn[],
        descriptions: Map<string, string>,
        opts: MissingConceptsOptions = {},
    ): Promise<MissingConceptsResult> {
        const maxConcepts = opts.maxConcepts ?? 10;
        const topK = opts.topK ?? 20;
        const similarityFloor = opts.similarityFloor ?? 0.45;
        const residualSampleSize = opts.residualSampleSize ?? 60;

        let tokensUsed = 0;
        let inputTokens = 0;
        let outputTokens = 0;

        // Build the assigned-columns set
        const assigned = new Set<string>();
        for (const c of confirmedClusters) {
            for (const m of c.members) assigned.add(memberKey(m));
        }

        // Build residual + embeddings lookup
        const residual = allColumns.filter(
            (c) => c.embedding && !assigned.has(columnKey(c)),
        );
        const colsByKey = new Map<string, DetectorInputColumn>();
        for (const c of residual) colsByKey.set(columnKey(c), c);

        if (residual.length === 0) {
            return {
                newClusters: [],
                proposedConcepts: [],
                tokensUsed,
                inputTokens,
                outputTokens,
            };
        }

        // Sample residual columns for the discovery prompt
        const residualSample = sampleResidual(residual, residualSampleSize);

        // Step 1 — Discovery
        let discovery: DiscoveryResponse;
        try {
            const result = await this.callDiscovery(
                confirmedClusters,
                residualSample,
                descriptions,
                maxConcepts,
            );
            discovery = result.parsed;
            tokensUsed += result.tokensUsed;
            inputTokens += result.inputTokens;
            outputTokens += result.outputTokens;
        } catch (err) {
            return {
                newClusters: [],
                proposedConcepts: [
                    {
                        concept: '(discovery)',
                        description: '',
                        normalization: 'ExactMatch',
                        outcome: 'error',
                        candidatesConsidered: 0,
                        confirmedMembers: 0,
                        errorMessage: (err as Error).message,
                    },
                ],
                tokensUsed,
                inputTokens,
                outputTokens,
            };
        }

        if (discovery.missingConcepts.length === 0) {
            return {
                newClusters: [],
                proposedConcepts: [],
                tokensUsed,
                inputTokens,
                outputTokens,
            };
        }

        // Step 2 — embed all proposed concept descriptions in one batch
        const conceptTexts = discovery.missingConcepts.map(
            (c) => `Organic key concept: ${c.concept}. ${c.description}`,
        );
        let conceptEmbeddings: Float32Array[];
        try {
            conceptEmbeddings = await this.embedder.embed(conceptTexts);
        } catch (err) {
            return {
                newClusters: [],
                proposedConcepts: discovery.missingConcepts.map((c) => ({
                    concept: c.concept,
                    description: c.description,
                    normalization: c.normalization,
                    outcome: 'error',
                    candidatesConsidered: 0,
                    confirmedMembers: 0,
                    errorMessage: `concept embedding failed: ${(err as Error).message}`,
                })),
                tokensUsed,
                inputTokens,
                outputTokens,
            };
        }

        // Step 3 — for each proposed concept, do K-NN + member confirmation
        const newClusters: OrganicKeyCluster[] = [];
        const proposedConcepts: ProposedConcept[] = [];
        const newlyAssigned = new Set<string>();
        let nextClusterId = 0;

        for (let i = 0; i < discovery.missingConcepts.length; i++) {
            const proposed = discovery.missingConcepts[i];
            const anchor = unitNormalize(conceptEmbeddings[i]);

            // K-NN search
            const candidates: { col: DetectorInputColumn; sim: number }[] = [];
            for (const col of residual) {
                if (newlyAssigned.has(columnKey(col))) continue;
                const sim = dot(anchor, unitNormalize(toFloat32(col.embedding!)));
                if (sim >= similarityFloor) candidates.push({ col, sim });
            }
            candidates.sort((a, b) => b.sim - a.sim);
            const topCandidates = candidates.slice(0, topK);

            if (topCandidates.length === 0) {
                proposedConcepts.push({
                    concept: proposed.concept,
                    description: proposed.description,
                    normalization: proposed.normalization,
                    outcome: 'no-members-found',
                    candidatesConsidered: 0,
                    confirmedMembers: 0,
                });
                continue;
            }

            // Member confirmation
            try {
                const result = await this.callMemberConfirmation(
                    proposed,
                    topCandidates,
                    descriptions,
                );
                tokensUsed += result.tokensUsed;
                inputTokens += result.inputTokens;
                outputTokens += result.outputTokens;

                const candidateByKey = new Map(
                    topCandidates.map((c) => [columnKey(c.col), c.col]),
                );
                const confirmedMembers: OrganicKeyClusterMember[] = [];
                for (const add of result.parsed.members) {
                    const col = candidateByKey.get(add.column);
                    if (!col) continue;
                    confirmedMembers.push({
                        schema: col.schema,
                        table: col.table,
                        column: col.column,
                        participatesInFK: !!col.participatesInFK,
                        fkTarget: col.fkTarget ?? null,
                    });
                }

                // Minimum shape: ≥2 members across ≥2 tables
                const tableSet = new Set(
                    confirmedMembers.map((m) => `${m.schema}.${m.table}`),
                );
                if (confirmedMembers.length < 2 || tableSet.size < 2) {
                    proposedConcepts.push({
                        concept: proposed.concept,
                        description: proposed.description,
                        normalization: proposed.normalization,
                        outcome: 'rejected-too-small',
                        candidatesConsidered: topCandidates.length,
                        confirmedMembers: confirmedMembers.length,
                    });
                    continue;
                }

                // Build cluster
                const cluster = buildNewCluster(
                    `missing_concept_${nextClusterId++}`,
                    proposed,
                    confirmedMembers,
                );
                newClusters.push(cluster);
                proposedConcepts.push({
                    concept: proposed.concept,
                    description: proposed.description,
                    normalization: proposed.normalization,
                    outcome: 'cluster-created',
                    createdClusterId: cluster.id,
                    candidatesConsidered: topCandidates.length,
                    confirmedMembers: confirmedMembers.length,
                });

                // Mark members as assigned so subsequent proposals don't double-claim
                for (const m of confirmedMembers) newlyAssigned.add(memberKey(m));
            } catch (err) {
                proposedConcepts.push({
                    concept: proposed.concept,
                    description: proposed.description,
                    normalization: proposed.normalization,
                    outcome: 'error',
                    candidatesConsidered: topCandidates.length,
                    confirmedMembers: 0,
                    errorMessage: (err as Error).message,
                });
            }
        }

        return {
            newClusters,
            proposedConcepts,
            tokensUsed,
            inputTokens,
            outputTokens,
        };
    }

    private async callDiscovery(
        confirmedClusters: OrganicKeyCluster[],
        residualSample: DetectorInputColumn[],
        descriptions: Map<string, string>,
        maxConcepts: number,
    ): Promise<{
        parsed: DiscoveryResponse;
        tokensUsed: number;
        inputTokens: number;
        outputTokens: number;
    }> {
        const userPrompt = buildDiscoveryPrompt(
            confirmedClusters,
            residualSample,
            descriptions,
            maxConcepts,
        );
        const params: ChatParams = {
            model: this.aiConfig.model,
            messages: [
                { role: 'system', content: DISCOVERY_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: this.aiConfig.temperature ?? 0,
            maxOutputTokens: this.aiConfig.maxTokens,
            responseFormat: 'JSON',
        };
        const chat: ChatResult = await this.llm.ChatCompletion(params);
        if (!chat.success) {
            throw new Error(`Discovery LLM failed: ${chat.errorMessage ?? 'unknown'}`);
        }
        const content = chat.data?.choices?.[0]?.message?.content ?? '';
        const usage = chat.data?.usage;
        return {
            parsed: parseDiscoveryResponse(content),
            tokensUsed: usage?.totalTokens ?? 0,
            inputTokens: usage?.promptTokens ?? 0,
            outputTokens: usage?.completionTokens ?? 0,
        };
    }

    private async callMemberConfirmation(
        proposed: { concept: string; description: string; normalization: string },
        candidates: { col: DetectorInputColumn; sim: number }[],
        descriptions: Map<string, string>,
    ): Promise<{
        parsed: MemberConfirmationResponse;
        tokensUsed: number;
        inputTokens: number;
        outputTokens: number;
    }> {
        const userPrompt = buildMemberPrompt(proposed, candidates, descriptions);
        const params: ChatParams = {
            model: this.aiConfig.model,
            messages: [
                { role: 'system', content: MEMBER_CONFIRMATION_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            temperature: this.aiConfig.temperature ?? 0,
            maxOutputTokens: this.aiConfig.maxTokens,
            responseFormat: 'JSON',
        };
        const chat: ChatResult = await this.llm.ChatCompletion(params);
        if (!chat.success) {
            throw new Error(`Member-confirmation LLM failed: ${chat.errorMessage ?? 'unknown'}`);
        }
        const content = chat.data?.choices?.[0]?.message?.content ?? '';
        const usage = chat.data?.usage;
        return {
            parsed: parseMemberResponse(content),
            tokensUsed: usage?.totalTokens ?? 0,
            inputTokens: usage?.promptTokens ?? 0,
            outputTokens: usage?.completionTokens ?? 0,
        };
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function columnKey(c: { schema: string; table: string; column: string }): string {
    return `${c.schema}.${c.table}.${c.column}`;
}
function memberKey(m: { schema: string; table: string; column: string }): string {
    return `${m.schema}.${m.table}.${m.column}`;
}
function toFloat32(v: Float32Array | number[]): Float32Array {
    return v instanceof Float32Array ? v : Float32Array.from(v);
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

/** Sample residual columns deterministically: prefer columns from distinct tables for diversity. */
function sampleResidual(
    residual: DetectorInputColumn[],
    n: number,
): DetectorInputColumn[] {
    if (residual.length <= n) return residual;
    // Group by table; round-robin sample to spread across tables for diversity
    const byTable = new Map<string, DetectorInputColumn[]>();
    for (const c of residual) {
        const key = `${c.schema}.${c.table}`;
        const bucket = byTable.get(key);
        if (bucket) bucket.push(c);
        else byTable.set(key, [c]);
    }
    const tables = [...byTable.keys()].sort();
    const out: DetectorInputColumn[] = [];
    let round = 0;
    while (out.length < n) {
        let added = false;
        for (const table of tables) {
            const bucket = byTable.get(table)!;
            if (bucket[round]) {
                out.push(bucket[round]);
                added = true;
                if (out.length >= n) break;
            }
        }
        if (!added) break;
        round++;
    }
    return out;
}

function buildDiscoveryPrompt(
    confirmedClusters: OrganicKeyCluster[],
    residualSample: DetectorInputColumn[],
    descriptions: Map<string, string>,
    maxConcepts: number,
): string {
    const lines: string[] = [];
    lines.push(
        `CONFIRMED organic-key clusters (${confirmedClusters.length} total — the pipeline has identified these):`,
    );
    for (const c of confirmedClusters.slice(0, 60)) {
        lines.push(`  - ${c.concept}: ${c.members.length} cols (normalization: ${c.normalization}). ${truncate(c.reasoning, 120)}`);
    }
    if (confirmedClusters.length > 60) {
        lines.push(`  ... and ${confirmedClusters.length - 60} more confirmed clusters`);
    }
    lines.push('');
    lines.push(
        `RESIDUAL SAMPLE (${residualSample.length} columns NOT in any confirmed cluster — review these for missing organic-key concepts):`,
    );
    for (const col of residualSample) {
        const desc = descriptions.get(columnKey(col)) ?? col.description ?? '';
        lines.push(`  - ${col.schema}.${col.table}.${col.column} [${col.dataType}]`);
        if (desc) lines.push(`      "${truncate(desc, 180)}"`);
    }
    lines.push('');
    lines.push(
        `Identify up to ${maxConcepts} missing organic-key concepts per the system prompt. Output the JSON.`,
    );
    return lines.join('\n');
}

function buildMemberPrompt(
    proposed: { concept: string; description: string; normalization: string },
    candidates: { col: DetectorInputColumn; sim: number }[],
    descriptions: Map<string, string>,
): string {
    const lines: string[] = [];
    lines.push(`Proposed concept: \`${proposed.concept}\``);
    lines.push(`Normalization: \`${proposed.normalization}\``);
    lines.push(`Description: ${proposed.description}`);
    lines.push('');
    lines.push(`Candidate columns (sorted by similarity to concept):`);
    for (const { col, sim } of candidates) {
        const desc = descriptions.get(columnKey(col)) ?? col.description ?? '';
        lines.push(`  - ${col.schema}.${col.table}.${col.column} [${col.dataType}]  (sim ${sim.toFixed(2)})`);
        if (desc) lines.push(`      "${truncate(desc, 180)}"`);
    }
    lines.push('');
    lines.push('Which of these candidates belong to the proposed concept? Output the JSON.');
    return lines.join('\n');
}

function parseDiscoveryResponse(text: string): DiscoveryResponse {
    const cleaned = stripFences(text);
    if (!cleaned) return { missingConcepts: [] };
    try {
        const parsed = JSON.parse(cleaned) as Partial<DiscoveryResponse>;
        if (!parsed.missingConcepts || !Array.isArray(parsed.missingConcepts)) {
            return { missingConcepts: [] };
        }
        return {
            missingConcepts: parsed.missingConcepts.filter(
                (c) =>
                    c &&
                    typeof c.concept === 'string' &&
                    typeof c.description === 'string',
            ).map((c) => ({
                concept: c.concept,
                description: c.description,
                normalization: (c.normalization ?? 'ExactMatch') as OrganicKeyNormalizationStrategy,
                reasoning: c.reasoning ?? '',
            })),
        };
    } catch {
        return { missingConcepts: [] };
    }
}

function parseMemberResponse(text: string): MemberConfirmationResponse {
    const cleaned = stripFences(text);
    if (!cleaned) return { members: [] };
    try {
        const parsed = JSON.parse(cleaned) as Partial<MemberConfirmationResponse>;
        if (!parsed.members || !Array.isArray(parsed.members)) return { members: [] };
        return {
            members: parsed.members
                .filter((m) => m && typeof m.column === 'string')
                .map((m) => ({ column: m.column, reasoning: m.reasoning ?? '' })),
        };
    } catch {
        return { members: [] };
    }
}

function stripFences(text: string): string {
    return text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
}

function buildNewCluster(
    id: string,
    proposed: {
        concept: string;
        description: string;
        normalization: OrganicKeyNormalizationStrategy;
        reasoning: string;
    },
    members: OrganicKeyClusterMember[],
): OrganicKeyCluster {
    const allFK = members.every((m) => m.participatesInFK);
    const noFK = members.every((m) => !m.participatesInFK);
    let tag: OrganicKeyClusterTag;
    if (allFK) {
        const targets = new Set(
            members
                .map((m) => m.fkTarget)
                .filter((t): t is { schema: string; table: string; column: string } => !!t)
                .map((t) => `${t.schema}.${t.table}.${t.column}`),
        );
        tag = targets.size === 1 ? 'fk-redundant-single-target' : 'fk-fragmented';
    } else if (noFK) {
        tag = 'no-fk-no-pk';
    } else {
        tag = 'mixed';
    }
    return {
        id,
        concept: proposed.concept,
        normalization: proposed.normalization,
        members,
        confidence: 0.9, // Slightly lower than LLM-refined clusters; reflects the LLM proposed without seeing all columns
        reasoning: proposed.description,
        tags: [tag],
        maxIntraDistance: 0, // Not produced by distance metric
    };
}

function truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
