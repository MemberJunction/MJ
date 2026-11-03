/**
 * @fileoverview Pluggable Concept & Graph Edge Synthesizer contract (`BaseConceptSynthesizer`).
 *
 * Follows the exact `BaseContentClassifier` pattern: pipeline stages and corpus-level onboarding
 * services resolve a registered synthesizer via `BaseConceptSynthesizer.Resolve(key)` rather than
 * hardcoding prompt or LLM logic inside the stage.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ConceptSeedCluster } from './ConceptSeedClustering.js';
import type {
    GraphAuthorityTier,
    GraphConceptType,
    ResolvedGraphOverlayConfig,
} from './GraphOverlay.types.js';

/** Citation linking a synthesized concept or specification rule back to a `Content Item Chunk`. */
export interface ConceptChunkCitation {
    readonly ChunkID: string;
    readonly ContentItemID: string;
    readonly HeadingPath?: string | null;
    readonly AuthorityTier: GraphAuthorityTier;
    readonly Excerpt?: string | null;
}

/** Synthesized concept output ready to be persisted into `MJ: Graph Concepts`. */
export interface SynthesizedGraphConcept {
    /** Existing `ConceptID` when updating/enriching an existing concept, or `undefined` when creating a new one. */
    readonly ExistingConceptID?: string;
    /** Existing governance status when matched to an existing `GraphConcept` so `GraphStage` never overwrites it. */
    readonly ExistingStatus?: 'Draft' | 'Proposed' | 'Approved' | 'Deprecated';
    readonly Name: string;
    readonly ConceptType: GraphConceptType;
    /** Optional foreign key to `MJ: Graph Concept Types` (`__mj.GraphConceptType.ID`). */
    readonly ConceptTypeID?: string | null;
    /** Crisp 1–3 sentence summary (~100 tokens) used for fast prompt subgraph descriptions. */
    readonly Description: string;
    /** Full markdown specification (rules, decision tables, thresholds, exceptions, inline citations). */
    readonly Specification: string;
    readonly Synonyms: readonly string[];
    readonly ParentConceptName?: string | null;
    readonly AuthorityTier: GraphAuthorityTier;
    /** Optional foreign key to `MJ: Graph Authority Tiers` (`__mj.GraphAuthorityTier.ID`). */
    readonly AuthorityTierID?: string | null;
    readonly Confidence: number;
    readonly Citations: readonly ConceptChunkCitation[];
}

/** Synthesized edge ready to be persisted into `MJ: Graph Edges`. */
export interface SynthesizedGraphEdge {
    readonly EdgeTypeName:
        | 'SourcedFrom'
        | 'Mentions'
        | 'Broader Than'
        | 'Describes'
        | 'Defines'
        | 'Measures'
        | 'Implements'
        | 'Governs'
        | 'Contradicts'
        | 'RelatedTo'
        | 'Related To'
        | (string & {});
    readonly SourceEntityName: string;
    /** Record ID (or concept name placeholder when referencing the newly synthesized concept). */
    readonly SourceRecordID: string;
    readonly TargetEntityName: string;
    readonly TargetRecordID: string;
    readonly Weight: number;
    readonly Confidence: number;
    /** Provenance origin (`'Inferred'` when synthesized by `GraphStage`, `'Declared'` when explicitly authored). */
    readonly Origin?: 'Declared' | 'Inferred';
    readonly Description: string;
    readonly Attributes?: Record<string, unknown>;
}

/** Request passed to `BaseConceptSynthesizer.SynthesizeCluster`. */
export interface SynthesizeConceptRequest {
    readonly GraphID: string;
    readonly OverlayConfig: ResolvedGraphOverlayConfig;
    readonly SeedCluster: ConceptSeedCluster;
    readonly ContextUser: UserInfo;
    readonly Provider: IMetadataProvider;
    readonly Signal: AbortSignal;
    readonly ReportProgress: (message: string) => void;
}

/** Result returned by `BaseConceptSynthesizer.SynthesizeCluster`. */
export interface SynthesizeConceptResult {
    readonly Concept: SynthesizedGraphConcept | null;
    readonly Edges: readonly SynthesizedGraphEdge[];
    readonly PromptRunID?: string | null;
}

/**
 * Abstract base class for registered Concept Synthesizers (`@RegisterClass(BaseConceptSynthesizer, key)`).
 */
export abstract class BaseConceptSynthesizer {
    /** Registration key matching `@RegisterClass(BaseConceptSynthesizer, Key)`. */
    public abstract readonly Key: string;

    /** Synthesizes or updates a `GraphConcept` and its `GraphEdge`s from a grouped `ConceptSeedCluster`. */
    public abstract SynthesizeCluster(request: SynthesizeConceptRequest): Promise<SynthesizeConceptResult>;

    /** Resolves a registered synthesizer by key, returning `null` if unregistered. */
    public static Resolve(key: string): BaseConceptSynthesizer | null {
        if (!key || key.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseConceptSynthesizer>(
            BaseConceptSynthesizer,
            key.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}
