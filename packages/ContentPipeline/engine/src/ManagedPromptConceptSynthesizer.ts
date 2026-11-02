/**
 * @fileoverview Default {@link BaseConceptSynthesizer} implementation (`ManagedPrompt`).
 *
 * Synthesizes `MJ: Graph Concepts` and `MJ: Graph Edges` from a {@link ConceptSeedCluster},
 * combining deterministic authority-ranked specification assembly, schema-grounding alignment,
 * and cross-chunk contradiction edge generation with an optional pluggable prompt runner hook.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BaseConceptSynthesizer,
    ConceptCitation,
    ConceptSeedCluster,
    ConceptSynthesizeRequest,
    ConceptSynthesizeResult,
    ExistingGraphConceptSummary,
    GetAuthorityTierRank,
    SchemaGroundingCandidate,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
    TokenizeConceptPhrase,
} from '@memberjunction/content-pipeline-base';

/** Registration key for the default concept synthesizer. */
export const MANAGED_PROMPT_CONCEPT_SYNTHESIZER = 'ManagedPrompt';

/**
 * Optional callback signature that callers or host services can supply in
 * `ConceptSynthesizeRequest.Parameters.PromptRunner` to refine the deterministic
 * synthesis via a managed AI prompt.
 */
export type ConceptSynthesisPromptRunner = (
    request: ConceptSynthesizeRequest,
    baseline: ConceptSynthesizeResult,
) => Promise<ConceptSynthesizeResult>;

/**
 * Default {@link BaseConceptSynthesizer} registered under `'ManagedPrompt'`.
 *
 * Produces a complete, deterministic {@link ConceptSynthesizeResult} from the cluster's
 * supporting chunks, tags, authority tiers, threshold conflicts, and schema grounding
 * candidates, and optionally delegates refinement to a configured {@link ConceptSynthesisPromptRunner}.
 */
@RegisterClass(BaseConceptSynthesizer, MANAGED_PROMPT_CONCEPT_SYNTHESIZER)
export class ManagedPromptConceptSynthesizer extends BaseConceptSynthesizer {
    public readonly Key = MANAGED_PROMPT_CONCEPT_SYNTHESIZER;

    public async Synthesize(request: ConceptSynthesizeRequest): Promise<ConceptSynthesizeResult> {
        const baseline = this.SynthesizeDeterministically(request);
        const promptRunner = this.extractPromptRunner(request.Parameters);
        if (promptRunner) {
            return promptRunner(request, baseline);
        }
        return baseline;
    }

    /**
     * Deterministic synthesis of a concept and its outbound/inbound graph edges from a seed cluster.
     */
    public SynthesizeDeterministically(request: ConceptSynthesizeRequest): ConceptSynthesizeResult {
        const { Cluster, OverlayConfig, ExistingConcepts, GroundingCandidates } = request;

        // Sort supporting chunks by AuthorityTier precedence (highest authority first)
        const sortedChunks = [...Cluster.SupportingChunks].sort((a, b) => {
            const tierDiff = GetAuthorityTierRank(a.AuthorityTier) - GetAuthorityTierRank(b.AuthorityTier);
            if (tierDiff !== 0) {
                return tierDiff;
            }
            return a.ChunkIndex - b.ChunkIndex;
        });

        const citations: ConceptCitation[] = sortedChunks.slice(0, 8).map((chunk) => ({
            ChunkID: chunk.ChunkID,
            ContentItemID: chunk.ContentItemID,
            ContentSourceID: chunk.ContentSourceID,
            SectionHeading: chunk.HeadingText,
            QuoteExcerpt: this.buildExcerpt(chunk.Text, 240),
            AuthorityTier: chunk.AuthorityTier,
        }));

        const existingMatch = Cluster.MatchedExistingConceptID
            ? ExistingConcepts.find((c) => c.ID === Cluster.MatchedExistingConceptID)
            : undefined;

        const status: SynthesizedGraphConcept['Status'] = existingMatch
            ? existingMatch.Status
            : OverlayConfig.ConceptTaxonomyMode === 'propose-only'
              ? 'Proposed'
              : 'Approved';

        const parentConceptID = this.resolveParentConceptID(Cluster, ExistingConcepts);
        const description = this.buildDescription(Cluster, sortedChunks, existingMatch);
        const specification = this.buildSpecification(Cluster, sortedChunks, existingMatch);

        const concept: SynthesizedGraphConcept = {
            ExistingConceptID: Cluster.MatchedExistingConceptID,
            Name: existingMatch ? existingMatch.Name : Cluster.CanonicalName,
            ConceptType: existingMatch ? existingMatch.ConceptType : Cluster.InferredConceptType,
            Description: description,
            Specification: specification,
            Synonyms: this.mergeSynonyms(Cluster.Synonyms, existingMatch?.Synonyms ?? []),
            AuthorityTier: Cluster.HighestAuthorityTier,
            Status: status,
            ParentConceptID: parentConceptID,
            Citations: citations,
        };

        const edges: SynthesizedGraphEdge[] = [];

        // 1. Provenance edges: Graph Concept -> Content Item Chunks & Content Items
        const seenItems = new Set<string>();
        for (const chunk of sortedChunks) {
            edges.push({
                EdgeTypeName: 'SourcedFrom',
                Direction: 'Outbound',
                TargetEntityName: 'MJ: Content Item Chunks',
                TargetRecordID: chunk.ChunkID,
                Weight: 1.0,
                Source: 'System',
                Properties: {
                    contentItemID: chunk.ContentItemID,
                    contentSourceID: chunk.ContentSourceID,
                    authorityTier: chunk.AuthorityTier,
                    heading: chunk.HeadingText,
                },
            });

            if (!seenItems.has(chunk.ContentItemID)) {
                seenItems.add(chunk.ContentItemID);
                edges.push({
                    EdgeTypeName: 'Mentions',
                    Direction: 'Inbound',
                    TargetEntityName: 'MJ: Content Items',
                    TargetRecordID: chunk.ContentItemID,
                    Weight: Number(Math.min(1, Cluster.Confidence).toFixed(4)),
                    Source: 'Inferred',
                    Properties: {
                        contentSourceID: chunk.ContentSourceID,
                        authorityTier: chunk.AuthorityTier,
                    },
                });
            }
        }

        // 2. Hierarchy edge: Parent Concept -> This Concept (Broader Than)
        if (parentConceptID) {
            edges.push({
                EdgeTypeName: 'Broader Than',
                Direction: 'Inbound',
                TargetEntityName: 'MJ: Graph Concepts',
                TargetRecordID: parentConceptID,
                Weight: 0.9,
                Source: 'Inferred',
            });
        }

        // 3. Schema & Operational Grounding edges (when GroundingMode !== 'none')
        if (OverlayConfig.GroundingMode !== 'none' && GroundingCandidates.length > 0) {
            const groundingEdges = this.inferSchemaGroundingEdges(
                concept,
                Cluster,
                GroundingCandidates,
                OverlayConfig.GroundingMode,
            );
            edges.push(...groundingEdges);
        }

        // 4. Contradiction detection edges
        if (OverlayConfig.DetectContradictions && Cluster.DetectedConflicts.length > 0) {
            for (const conflict of Cluster.DetectedConflicts) {
                edges.push({
                    EdgeTypeName: 'Contradicts',
                    Direction: 'Outbound',
                    TargetEntityName: 'MJ: Content Item Chunks',
                    TargetRecordID: conflict.LowerAuthorityChunkID,
                    Weight: 1.0,
                    Source: 'Inferred',
                    Properties: {
                        subjectTokens: conflict.SubjectTokens,
                        higherAuthorityChunkID: conflict.HigherAuthorityChunkID,
                        higherAuthorityTier: conflict.HigherAuthorityTier,
                        higherAuthorityValue: conflict.HigherAuthorityValue,
                        lowerAuthorityChunkID: conflict.LowerAuthorityChunkID,
                        lowerAuthorityTier: conflict.LowerAuthorityTier,
                        lowerAuthorityValue: conflict.LowerAuthorityValue,
                        summary: conflict.Summary,
                    },
                });
            }
        }

        return {
            Concept: concept,
            Edges: edges,
            PromptRunID: null,
        };
    }

    private extractPromptRunner(
        parameters: Record<string, unknown> | undefined,
    ): ConceptSynthesisPromptRunner | undefined {
        if (!parameters) {
            return undefined;
        }
        const candidate = parameters['PromptRunner'];
        if (typeof candidate === 'function') {
            return candidate as ConceptSynthesisPromptRunner;
        }
        return undefined;
    }

    private buildExcerpt(text: string, maxLength: number): string {
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (normalized.length <= maxLength) {
            return normalized;
        }
        return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
    }

    private buildDescription(
        cluster: ConceptSeedCluster,
        sortedChunks: ConceptSeedCluster['SupportingChunks'],
        existing?: ExistingGraphConceptSummary,
    ): string {
        if (existing?.Description && existing.Description.trim().length > 0) {
            return existing.Description;
        }
        const primaryChunk = sortedChunks[0];
        if (!primaryChunk) {
            return `${cluster.CanonicalName} (${cluster.InferredConceptType}) synthesized from content pipeline.`;
        }
        // Take first 1-2 sentences of the highest-authority chunk
        const cleanText = primaryChunk.Text.replace(/\s+/g, ' ').trim();
        const sentences = cleanText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
        const summary = sentences.slice(0, 2).join(' ');
        return this.buildExcerpt(summary || cleanText, 320);
    }

    private buildSpecification(
        cluster: ConceptSeedCluster,
        sortedChunks: ConceptSeedCluster['SupportingChunks'],
        existing?: ExistingGraphConceptSummary,
    ): string {
        const sections: string[] = [];

        if (existing?.Specification && existing.Specification.trim().length > 0) {
            sections.push(existing.Specification.trim());
        }

        sections.push(
            `### Authority & Provenance\n` +
                `- **Highest Authority Tier**: \`${cluster.HighestAuthorityTier}\`\n` +
                `- **Concept Type**: \`${cluster.InferredConceptType}\`\n` +
                `- **Supporting Chunks**: ${sortedChunks.length}`,
        );

        const topPassages = sortedChunks.slice(0, 3).map((chunk, idx) => {
            const headingLabel = chunk.HeadingText ? ` (${chunk.HeadingText})` : '';
            return `${idx + 1}. **[${chunk.AuthorityTier}]${headingLabel}**: ${this.buildExcerpt(chunk.Text, 300)}`;
        });

        if (topPassages.length > 0) {
            sections.push(`### Authoritative Excerpts\n${topPassages.join('\n')}`);
        }

        if (cluster.DetectedConflicts.length > 0) {
            const conflictLines = cluster.DetectedConflicts.map(
                (c) => `- **Conflict**: ${c.Summary}`,
            );
            sections.push(`### Detected Authority Conflicts\n${conflictLines.join('\n')}`);
        }

        return sections.join('\n\n');
    }

    private mergeSynonyms(clusterSynonyms: string[], existingSynonyms: string[]): string[] {
        const seen = new Set<string>();
        const merged: string[] = [];
        for (const syn of [...existingSynonyms, ...clusterSynonyms]) {
            const trimmed = syn.trim();
            const key = trimmed.toLowerCase();
            if (trimmed.length > 0 && !seen.has(key)) {
                seen.add(key);
                merged.push(trimmed);
            }
        }
        return merged;
    }

    private resolveParentConceptID(
        cluster: ConceptSeedCluster,
        existingConcepts: ExistingGraphConceptSummary[],
    ): string | null {
        // Check if any supporting chunk has a multi-level breadcrumb where the parent segment matches an existing concept
        for (const chunk of cluster.SupportingChunks) {
            if (!chunk.HeadingText) {
                continue;
            }
            const parts = chunk.HeadingText
                .split(/\s*(?:>|\/|»|::|—|--)\s*/)
                .map((p) => p.replace(/^#+\s*/, '').trim())
                .filter((p) => p.length > 0);
            if (parts.length >= 2) {
                const parentSegment = parts[parts.length - 2].toLowerCase();
                const match = existingConcepts.find(
                    (c) =>
                        c.ID !== cluster.MatchedExistingConceptID &&
                        (c.Name.toLowerCase() === parentSegment ||
                            c.Synonyms.some((s) => s.toLowerCase() === parentSegment)),
                );
                if (match) {
                    return match.ID;
                }
            }
        }
        return null;
    }

    private inferSchemaGroundingEdges(
        concept: SynthesizedGraphConcept,
        cluster: ConceptSeedCluster,
        candidates: SchemaGroundingCandidate[],
        groundingMode: 'schema-only' | 'full-canon',
    ): SynthesizedGraphEdge[] {
        const conceptTokens = new Set<string>(
            TokenizeConceptPhrase([concept.Name, ...concept.Synonyms].join(' ')),
        );
        // Also collect high-frequency tokens from supporting tags
        for (const tag of cluster.SupportingTags) {
            for (const t of TokenizeConceptPhrase(tag.TagName)) {
                conceptTokens.add(t);
            }
        }

        if (conceptTokens.size === 0) {
            return [];
        }

        const edges: SynthesizedGraphEdge[] = [];
        for (const candidate of candidates) {
            const isOperationalTarget =
                candidate.EntityName === 'MJ: Skills' || candidate.EntityName === 'MJ: Actions';
            if (groundingMode === 'schema-only' && isOperationalTarget) {
                continue;
            }

            const candidateTokens = TokenizeConceptPhrase(
                `${candidate.DisplayName} ${candidate.Description ?? ''}`,
            );
            if (candidateTokens.length === 0) {
                continue;
            }

            // Compute token overlap with emphasis on DisplayName tokens
            const nameTokens = TokenizeConceptPhrase(candidate.DisplayName);
            let matchedNameTokens = 0;
            for (const nt of nameTokens) {
                if (conceptTokens.has(nt)) {
                    matchedNameTokens++;
                }
            }

            if (nameTokens.length === 0 || matchedNameTokens === 0) {
                continue;
            }

            const nameCoverage = matchedNameTokens / nameTokens.length;
            if (nameCoverage < 0.5) {
                continue;
            }

            const edgeTypeName = this.selectGroundingEdgeType(concept.ConceptType, candidate.EntityName);
            edges.push({
                EdgeTypeName: edgeTypeName,
                Direction: 'Outbound',
                TargetEntityName: candidate.EntityName,
                TargetRecordID: candidate.RecordID,
                Weight: Number(Math.min(1, 0.5 + nameCoverage * 0.5).toFixed(4)),
                Source: 'Inferred',
                Properties: {
                    targetDisplayName: candidate.DisplayName,
                    matchedNameCoverage: Number(nameCoverage.toFixed(4)),
                },
            });
        }

        return edges;
    }

    private selectGroundingEdgeType(
        conceptType: SynthesizedGraphConcept['ConceptType'],
        targetEntityName: SchemaGroundingCandidate['EntityName'],
    ): string {
        switch (targetEntityName) {
            case 'MJ: Entities':
                return 'Describes';
            case 'MJ: Entity Fields':
                return 'Defines';
            case 'MJ: Queries':
            case 'MJ: Entity Alternate Base Views':
                return conceptType === 'Metric' ? 'Measures' : 'Defines';
            case 'MJ: Skills':
            case 'MJ: Actions':
                return 'Implements';
            default: {
                const _exhaustive: never = targetEntityName;
                return _exhaustive;
            }
        }
    }
}
