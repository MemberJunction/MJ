import type { CompositeKey, EntityInfo, EntityRelationshipInfo } from '@memberjunction/core';

/**
 * Kind of edge connecting two record nodes in the dependency graph.
 */
export type EdgeKind =
    | 'IsASubtype'
    | 'Collection'
    | 'Embedded'
    | 'Relationship'
    | 'InboundFK'
    | 'ForwardFK'
    | 'SoftLink'
    | 'Hierarchy'
    | 'SelfPointer';

/**
 * Backward-compatibility alias for clone plan consumers.
 */
export type CloneEdgeKind = EdgeKind;

/**
 * Policy decision returned by the EdgePolicy callback.
 * - 'Deep': traverse and recurse children.
 * - 'Reference': record the target node / edge but do not recurse into its reverse children.
 * - 'Skip': do not traverse or include the target node.
 */
export type EdgePolicyDecision = 'Deep' | 'Reference' | 'Skip';

/**
 * Information about a candidate edge presented to an EdgePolicy callback before traversal.
 */
export interface GraphEdgeCandidate {
    Kind: EdgeKind;
    SourceEntityName: string;
    SourceKey: CompositeKey;
    SourceRecordData: Record<string, unknown>;
    TargetEntityName: string;
    TargetKey?: CompositeKey;
    JoinField: string;
    Relationship?: EntityRelationshipInfo | null;
    CollectionName?: string;
    IsSoftLink?: boolean;
    EntityIDFieldName?: string;
    Depth: number;
}

/**
 * A resolved edge in the record graph.
 */
export interface GraphEdge {
    Kind: EdgeKind;
    FromKey: string;
    ToKey: string;
    SourceEntityName: string;
    TargetEntityName: string;
    JoinField: string;
    Relationship?: EntityRelationshipInfo | null;
    CollectionName?: string;
    IsSoftLink?: boolean;
    EntityIDFieldName?: string;
}

/**
 * A node in the record dependency graph representing a single entity record.
 */
export interface DependencyNode {
    /** Entity name */
    EntityName: string;
    /** Entity metadata */
    EntityInfo: EntityInfo;
    /** The record's primary key */
    RecordKey: CompositeKey;
    /** The record's primary key as a concatenated string */
    RecordID: string;
    /** Current field values of the record */
    RecordData: Record<string, unknown>;
    /** Relationship from parent to this node (null for root) */
    Relationship: EntityRelationshipInfo | null;
    /** Child/dependent record nodes */
    Children: DependencyNode[];
    /** Depth in the graph (0 = root) */
    Depth: number;
    /** The edge that led to the discovery of this node (null for root) */
    DiscoveringEdge?: GraphEdge | null;
    /** Whether this node is an IS-A subtype row */
    IsSubtypeRow?: boolean;
}

/**
 * Alias for DependencyNode in generalized graph contexts.
 */
export type GraphNode = DependencyNode;

/**
 * A full record dependency graph model containing root, flattened nodes, edges, and optional key map.
 */
export interface RecordGraph {
    Root: DependencyNode;
    Nodes: DependencyNode[];
    Edges: GraphEdge[];
    KeyMap?: Record<string, string>;
}

/**
 * Mapping between source record keys and target/new record keys.
 */
export type KeyMap = Record<string, string>;

/**
 * Options controlling graph traversal.
 */
export interface WalkOptions {
    /** Maximum recursion depth (default: 10 for Version History, 3 for cloning) */
    MaxDepth?: number;
    /** Only include these entities */
    EntityFilter?: string[];
    /** Skip these entities */
    ExcludeEntities?: string[];
    /** Include soft-deleted records (default: false) */
    IncludeDeleted?: boolean;
    /**
     * Whether to require entities to have TrackRecordChanges enabled.
     * Version History passes true (or defaults to true); cloning passes false.
     * Default: true
     */
    RequireTrackRecordChanges?: boolean;
    /** Follow inbound EntityID/RecordID soft links as reverse edges. Default false. */
    IncludeSoftLinks?: boolean;
    /** Add IS-A subtype rows of every discovered record as nodes (via FindISAChildEntities). Default false. */
    IncludeSubtypes?: boolean;
    /** Allow same-entity recursion on fields whose Configuration.Hierarchy.IsHierarchy is true, up to HierarchyMaxDepth. Default false. */
    FollowHierarchies?: boolean;
    /** List (without loading) inbound FK relationships that are not curated EntityRelationship rows, so a caller can show "available" edges. Default false. */
    ListNonCuratedInbound?: boolean;
    /** Called per candidate edge before traversal; returning Skip prunes the walk, Reference records the target without recursing, Deep recurses. */
    EdgePolicy?: (edge: GraphEdgeCandidate) => EdgePolicyDecision;
    /** Batch children per (entity, join field) across all parents at a depth level: one query per relationship per level instead of one per parent. Default true. */
    BatchChildLoads?: boolean;
}

/**
 * Accumulator for graph traversal statistics.
 */
export interface WalkStats {
    EntityCounts: Map<string, number>;
    TotalRecords: number;
    AncestorSkips: number;
    VisitedSkips: number;
    ForwardOnlySuppressions: number;
}
