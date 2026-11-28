/**
 * Structured telemetry details for an `MJ: AI Agent Context Items` row (`AIAgentContextItem.Details`).
 *
 * Records how the item was selected, which retrieval lane surfaced it, scoring signals,
 * a snapshot of the item's lifecycle/canon status at injection time, holdout bucket assignment,
 * and citation detection source.
 */
export interface IAgentContextItemDetails {
    /** Schema version for forward-compatible evolution; readers branch on it. */
    Version: 1;
    /** How the item was selected for context injection. */
    Strategy?:
        | 'Relevant'
        | 'Recent'
        | 'All'
        | 'Semantic'
        | 'Rated'
        | 'Canon Lane'
        | 'Graph Expansion'
        | 'In-Flight Search'
        | 'Other';
    /** Two-lane retrieval lane (§4.2). */
    Lane?: 'Canon' | 'Dynamic';
    /** Reranker score when a reranker evaluated the item. */
    RerankScore?: number;
    /** Authority-boosted effective score (§4.2). */
    EffectiveScore?: number;
    /** Snapshot of the item's status at injection time (the item itself may change later). */
    StatusAtInjection?: string;
    /** Snapshot of the item's protection tier at injection time. */
    ProtectionTierAtInjection?: string;
    /** Snapshot of whether the item was canonical at injection time. */
    IsCanonicalAtInjection?: boolean;
    /** Scope level at which the item matched (e.g., User, Company, Global). */
    ScopeLevel?: string;
    /** Deterministic sample bucket value so holdout arms can be re-derived. */
    HoldoutBucket?: number;
    /** For Cited rows: where the citation was detected. */
    CitationSource?: 'Agent Response' | 'Post-Session Judge' | 'Other';
}
