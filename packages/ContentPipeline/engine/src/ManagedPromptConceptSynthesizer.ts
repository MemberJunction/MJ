/**
 * @fileoverview Default {@link BaseConceptSynthesizer} implementation (`ManagedPrompt`).
 *
 * Synthesizes `MJ: Graph Concepts` and `MJ: Graph Edges` from a {@link ConceptSeedCluster},
 * combining deterministic authority-ranked specification assembly, schema-grounding alignment,
 * and cross-chunk contradiction edge generation.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BaseConceptSynthesizer,
    ConceptChunkCitation,
    ConceptSeedCluster,
    GetAuthorityTierRank,
    SynthesizeConceptRequest,
    SynthesizeConceptResult,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
} from '@memberjunction/content-pipeline-base';

/** Registration key for the default concept synthesizer. */
export const MANAGED_PROMPT_CONCEPT_SYNTHESIZER = 'ManagedPrompt';

/**
 * Default {@link BaseConceptSynthesizer} registered under `'ManagedPrompt'`.
 *
 * Produces a complete, deterministic {@link SynthesizeConceptResult} from the cluster's
 * supporting chunks, tags, authority tiers, threshold conflicts, and schema grounding matches.
 */
@RegisterClass(BaseConceptSynthesizer, MANAGED_PROMPT_CONCEPT_SYNTHESIZER)
export class ManagedPromptConceptSynthesizer extends BaseConceptSynthesizer {
    public readonly Key = MANAGED_PROMPT_CONCEPT_SYNTHESIZER;

    public async SynthesizeCluster(request: SynthesizeConceptRequest): Promise<SynthesizeConceptResult> {
        return this.SynthesizeDeterministically(request);
    }

    /**
     * Deterministic synthesis of a concept and its outbound/inbound graph edges from a seed cluster.
     */
    public SynthesizeDeterministically(request: SynthesizeConceptRequest): SynthesizeConceptResult {
        const { SeedCluster: cluster, OverlayConfig } = request;

        // Chunks are already sorted highest authority first, but guarantee deterministic ordering
        const sortedChunks = [...cluster.Chunks].sort((a, b) => {
            const tierDiff = GetAuthorityTierRank(b.AuthorityTier) - GetAuthorityTierRank(a.AuthorityTier);
            if (tierDiff !== 0) {
                return tierDiff;
            }
            return (a.Sequence ?? 0) - (b.Sequence ?? 0);
        });

        const citations: ConceptChunkCitation[] = sortedChunks.slice(0, 8).map((chunk) => ({
            ChunkID: chunk.ChunkID,
            ContentItemID: chunk.ContentItemID,
            HeadingPath: chunk.HeadingPath ?? null,
            AuthorityTier: chunk.AuthorityTier ?? OverlayConfig.AuthorityTier,
            Excerpt: this.buildExcerpt(chunk.Text, 240),
        }));

        const existingMatch = cluster.MatchedExistingConcept;
        const parentConceptName = this.extractParentConceptName(sortedChunks);
        const description = this.buildDescription(cluster, sortedChunks);
        const specification = this.buildSpecification(cluster, sortedChunks);
        const confidence = existingMatch
            ? Math.max(0.75, cluster.ExistingConceptMatchScore)
            : Math.min(0.95, 0.6 + Math.min(0.35, sortedChunks.length * 0.1));

        const conceptName = existingMatch ? existingMatch.Name : cluster.ConceptName;
        const conceptRecordPlaceholder = existingMatch?.ConceptID ?? `concept:${conceptName}`;

        const concept: SynthesizedGraphConcept = {
            ExistingConceptID: existingMatch?.ConceptID,
            Name: conceptName,
            ConceptType: existingMatch ? existingMatch.ConceptType : cluster.InferredConceptType,
            Description: description,
            Specification: specification,
            Synonyms: this.mergeSynonyms(cluster.AssociatedTags, existingMatch?.Synonyms ?? [], conceptName),
            ParentConceptName: parentConceptName,
            AuthorityTier: cluster.HighestAuthorityTier,
            Confidence: Number(confidence.toFixed(4)),
            Citations: citations,
        };

        const edges: SynthesizedGraphEdge[] = [];

        // 1. Provenance edges: Graph Concept -> Content Item Chunks (SourcedFrom) & Content Items -> Graph Concept (Mentions)
        const seenItems = new Set<string>();
        for (const chunk of sortedChunks) {
            edges.push({
                EdgeTypeName: 'SourcedFrom',
                SourceEntityName: 'MJ: Graph Concepts',
                SourceRecordID: conceptRecordPlaceholder,
                TargetEntityName: 'MJ: Content Item Chunks',
                TargetRecordID: chunk.ChunkID,
                Weight: 1.0,
                Confidence: 1.0,
                Description: `Concept '${conceptName}' is sourced from chunk '${chunk.ChunkID}'.`,
                Attributes: {
                    contentItemID: chunk.ContentItemID,
                    contentSourceID: chunk.ContentSourceID,
                    authorityTier: chunk.AuthorityTier ?? OverlayConfig.AuthorityTier,
                    headingPath: chunk.HeadingPath ?? null,
                },
            });

            if (!seenItems.has(chunk.ContentItemID)) {
                seenItems.add(chunk.ContentItemID);
                edges.push({
                    EdgeTypeName: 'Mentions',
                    SourceEntityName: 'MJ: Content Items',
                    SourceRecordID: chunk.ContentItemID,
                    TargetEntityName: 'MJ: Graph Concepts',
                    TargetRecordID: conceptRecordPlaceholder,
                    Weight: Number(Math.min(1, confidence).toFixed(4)),
                    Confidence: Number(Math.min(1, confidence).toFixed(4)),
                    Description: `Content item '${chunk.ContentItemID}' mentions concept '${conceptName}'.`,
                    Attributes: {
                        contentSourceID: chunk.ContentSourceID,
                        authorityTier: chunk.AuthorityTier ?? OverlayConfig.AuthorityTier,
                    },
                });
            }
        }

        // 2. Hierarchy edge: Parent Concept -> This Concept (Broader Than)
        if (parentConceptName) {
            edges.push({
                EdgeTypeName: 'Broader Than',
                SourceEntityName: 'MJ: Graph Concepts',
                SourceRecordID: `concept:${parentConceptName}`,
                TargetEntityName: 'MJ: Graph Concepts',
                TargetRecordID: conceptRecordPlaceholder,
                Weight: 0.9,
                Confidence: 0.85,
                Description: `Parent concept '${parentConceptName}' is broader than '${conceptName}'.`,
            });
        }

        // 3. Schema & Operational Grounding edges (when GroundingMode !== 'none')
        if (OverlayConfig.GroundingMode !== 'none' && cluster.GroundingMatches.length > 0) {
            for (const match of cluster.GroundingMatches) {
                const isOperational =
                    match.Target.EntityName === 'MJ: AI Skills' || match.Target.EntityName === 'MJ: Actions';
                if (OverlayConfig.GroundingMode === 'schema-and-queries' && isOperational) {
                    continue;
                }
                edges.push({
                    EdgeTypeName: match.SuggestedEdgeType,
                    SourceEntityName: 'MJ: Graph Concepts',
                    SourceRecordID: conceptRecordPlaceholder,
                    TargetEntityName: match.Target.EntityName,
                    TargetRecordID: match.Target.RecordID,
                    Weight: Number(Math.min(1, match.MatchScore).toFixed(4)),
                    Confidence: Number(Math.min(1, match.MatchScore).toFixed(4)),
                    Description: `Concept '${conceptName}' ${match.SuggestedEdgeType.toLowerCase()} ${match.Target.EntityName} '${match.Target.Name}'.`,
                    Attributes: {
                        targetName: match.Target.Name,
                        matchScore: match.MatchScore,
                    },
                });
            }
        }

        // 4. Contradiction detection edges across chunks of differing authority tiers
        if (cluster.PotentialConflicts.length > 0) {
            for (const conflict of cluster.PotentialConflicts) {
                edges.push({
                    EdgeTypeName: 'Contradicts',
                    SourceEntityName: 'MJ: Content Item Chunks',
                    SourceRecordID: conflict.LowerAuthorityChunkID,
                    TargetEntityName: 'MJ: Content Item Chunks',
                    TargetRecordID: conflict.HigherAuthorityChunkID,
                    Weight: 1.0,
                    Confidence: 0.9,
                    Description: conflict.Reason,
                    Attributes: {
                        higherAuthorityChunkID: conflict.HigherAuthorityChunkID,
                        higherAuthorityTier: conflict.HigherAuthorityTier,
                        lowerAuthorityChunkID: conflict.LowerAuthorityChunkID,
                        lowerAuthorityTier: conflict.LowerAuthorityTier,
                        reason: conflict.Reason,
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

    private buildExcerpt(text: string, maxLength: number): string {
        const normalized = text.replace(/\s+/g, ' ').trim();
        if (normalized.length <= maxLength) {
            return normalized;
        }
        return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
    }

    private buildDescription(
        cluster: ConceptSeedCluster,
        sortedChunks: ConceptSeedCluster['Chunks'],
    ): string {
        if (
            cluster.MatchedExistingConcept?.Description &&
            cluster.MatchedExistingConcept.Description.trim().length > 0
        ) {
            return cluster.MatchedExistingConcept.Description;
        }
        const primaryChunk = sortedChunks[0];
        if (!primaryChunk) {
            return `${cluster.ConceptName} (${cluster.InferredConceptType}) synthesized from content pipeline.`;
        }
        const cleanText = primaryChunk.Text.replace(/\s+/g, ' ').trim();
        const sentences = cleanText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
        const summary = sentences.slice(0, 2).join(' ');
        return this.buildExcerpt(summary || cleanText, 320);
    }

    private buildSpecification(
        cluster: ConceptSeedCluster,
        sortedChunks: ConceptSeedCluster['Chunks'],
    ): string {
        const sections: string[] = [];

        if (
            cluster.MatchedExistingConcept?.Specification &&
            cluster.MatchedExistingConcept.Specification.trim().length > 0
        ) {
            sections.push(cluster.MatchedExistingConcept.Specification.trim());
        }

        sections.push(
            `### Authority & Provenance\n` +
                `- **Highest Authority Tier**: \`${cluster.HighestAuthorityTier}\`\n` +
                `- **Concept Type**: \`${cluster.InferredConceptType}\`\n` +
                `- **Supporting Chunks**: ${sortedChunks.length}`,
        );

        const topPassages = sortedChunks.slice(0, 3).map((chunk, idx) => {
            const headingLabel = chunk.HeadingPath ? ` (${chunk.HeadingPath})` : '';
            const tierLabel = chunk.AuthorityTier ?? cluster.HighestAuthorityTier;
            return `${idx + 1}. **[${tierLabel}]${headingLabel}**: ${this.buildExcerpt(chunk.Text, 300)}`;
        });

        if (topPassages.length > 0) {
            sections.push(`### Authoritative Excerpts\n${topPassages.join('\n')}`);
        }

        if (cluster.PotentialConflicts.length > 0) {
            const conflictLines = cluster.PotentialConflicts.map((c) => `- **Conflict**: ${c.Reason}`);
            sections.push(`### Detected Authority Conflicts\n${conflictLines.join('\n')}`);
        }

        return sections.join('\n\n');
    }

    private mergeSynonyms(
        associatedTags: readonly string[],
        existingSynonyms: readonly string[],
        canonicalName: string,
    ): string[] {
        const canonicalLower = canonicalName.trim().toLowerCase();
        const seen = new Set<string>([canonicalLower]);
        const merged: string[] = [];
        for (const syn of [...existingSynonyms, ...associatedTags]) {
            const trimmed = syn.trim();
            const key = trimmed.toLowerCase();
            if (trimmed.length > 0 && !seen.has(key)) {
                seen.add(key);
                merged.push(trimmed);
            }
        }
        return merged;
    }

    private extractParentConceptName(sortedChunks: ConceptSeedCluster['Chunks']): string | null {
        for (const chunk of sortedChunks) {
            if (!chunk.HeadingPath) {
                continue;
            }
            const parts = chunk.HeadingPath
                .split(/\s*(?:>|\/|»|::|—|--)\s*/)
                .map((p) => p.replace(/^#+\s*/, '').trim())
                .filter((p) => p.length > 0);
            if (parts.length >= 2) {
                return parts[parts.length - 2];
            }
        }
        return null;
    }
}
