/**
 * @fileoverview Domain models and configuration interfaces for `@memberjunction/ng-graph-view`.
 *
 * Provides strongly-typed data structures for representing entities as graph nodes,
 * directed/undirected relationship edges, layout configurations, and viewport telemetry.
 *
 * @module @memberjunction/ng-graph-view
 */

/**
 * Standard semantic category of a graph node, or any custom category key defined by the consumer.
 */
export type GraphNodeCategory =
    | 'person'
    | 'organization'
    | 'committee'
    | 'account'
    | 'asset'
    | 'group'
    | 'custom'
    | (string & {});

/**
 * Configuration for a graph node category defining its visual appearance in the canvas,
 * dynamic legend, and inspector drawer.
 */
export interface GraphCategoryConfig {
    /** Unique category key matching GraphNode.Category (e.g. 'person', 'organization', 'Policy', 'Metric') */
    Category: string;
    /** Human-readable display label shown in the legend and node inspector */
    Label: string;
    /** Hex code, HSL, or CSS color variable (e.g. '#10b981' or 'var(--mj-brand-primary)') */
    Color: string;
    /** Font Awesome icon class (e.g. 'fa-solid fa-user') */
    IconClass?: string;
    /** Optional secondary stroke / accent color */
    StrokeColor?: string;
    /** Optional numeric rank priority (e.g. from MJ: Graph Concept Types.Rank) */
    Rank?: number;
}

/**
 * Directional behavior of an edge in the network graph.
 */
export type GraphEdgeDirection =
    | 'directed'
    | 'undirected'
    | 'bidirectional';

/**
 * Visual styling pattern for relationship edge lines.
 */
export type GraphEdgeStyle =
    | 'solid'
    | 'dashed'
    | 'dotted';

/**
 * Governance or lifecycle status of a semantic graph node.
 */
export type GraphNodeStatus =
    | 'Draft'
    | 'Proposed'
    | 'Approved'
    | 'Deprecated'
    | 'Rejected'
    | (string & {});

/**
 * Conflict detail surfaced on a concept or chunk node when a `Contradicts` edge exists.
 */
export interface GraphConflictItem {
    /** Higher-authority chunk or concept summary (e.g. 'Association Bylaws §4.2 — "60 days"') */
    HigherAuthoritySummary: string;
    /** Lower-authority conflicting chunk or concept summary (e.g. 'Staff Desk Manual p.42 — "90 days"') */
    ConflictingSummary: string;
    /** Explanation of how authority precedence resolved or flagged the discrepancy */
    ResolutionNote?: string;
    /** Edge ID of the underlying `Contradicts` edge if persisted */
    EdgeID?: string;
}

/**
 * Grounded MemberJunction primitive linked to a concept node (e.g. Entity, Alternate Base View, Query, Action, Workflow).
 */
export interface GraphGroundingItem {
    /** Relationship verb (e.g. 'Defines', 'Describes', 'Measures', 'Implements') */
    EdgeLabel: string;
    /** Target MJ Entity name (e.g. 'MJ: Entity Alternate Base Views', 'MJ: Queries', 'MJ: AI Agents') */
    TargetEntityName: string;
    /** Target record primary key ID */
    TargetRecordID: string;
    /** Human-readable display name of the target primitive */
    TargetDisplayName: string;
}

/**
 * Provenance chunk item (`SourcedFrom` edge) attached to a concept node.
 */
export interface GraphProvenanceChunkItem {
    /** Chunk record ID in `MJ: Content Item Chunks` */
    ChunkID: string;
    /** Source name (e.g. 'Association Bylaws PDF') */
    SourceName: string;
    /** Heading breadcrumb / section locator (e.g. 'Article IV > §4.2') */
    Locator?: string;
    /** Authority tier label (e.g. 'Bylaws', 'ExecutiveSOP') */
    AuthorityTier?: string;
    /** Excerpt of the chunk text */
    Snippet: string;
}

/**
 * Layout simulation mode for graph positioning.
 */
export type GraphLayoutMode =
    | 'force'
    | 'circular'
    | 'hierarchy'
    | 'grid';

/**
 * Represents a single node entity in the network graph.
 */
export interface GraphNode<TData = Record<string, unknown>> {
    /** Unique identifier for the node */
    ID: string;

    /** Primary display label (e.g. Person Name, Organization Name, Concept Name) */
    Label: string;

    /** Secondary descriptive sublabel (e.g. Job Title, Industry, ConceptType) */
    Sublabel?: string;

    /** Semantic category defining the default icon and palette */
    Category: GraphNodeCategory;

    /** Optional Font Awesome icon class override (e.g. 'fa-solid fa-gavel') */
    IconClass?: string;

    /** Optional custom hex/HSL color or CSS color variable override */
    Color?: string;

    /** Node radius / diameter scale (default is 26) */
    Radius?: number;

    /** Optional small badge text or status indicator (e.g. '#10', '§', '⚡') */
    Badge?: string;

    /** Optional governance status (e.g. 'Proposed', 'Approved'); 'Proposed'/'Draft' renders a dashed outer ring */
    Status?: GraphNodeStatus;

    /** Optional authority tier badge (e.g. 'Bylaws (100)', 'ExecutiveSOP (60)') */
    AuthorityTier?: string;

    /** Optional numeric rank priority (e.g. from MJ: Graph Concept Types.Rank) */
    Rank?: number;

    /** Optional parent node ID for hierarchical layouts */
    ParentID?: string | null;

    /** Optional short description displayed in the node inspector drawer */
    Description?: string;

    /** Optional Markdown specification or rule definition displayed in the inspector drawer */
    Specification?: string;

    /** Optional authority/threshold conflicts surfaced on this node */
    Conflicts?: GraphConflictItem[];

    /** Optional grounded MJ primitives (Entities, Alternate Base Views, Queries, Actions, Workflows) */
    Groundings?: GraphGroundingItem[];

    /** Optional provenance chunks (`SourcedFrom`) backing this node */
    ProvenanceChunks?: GraphProvenanceChunkItem[];

    /** Distance from root/selected focus node in hops (0 = focal center) */
    HopDistance?: number;

    /** Current 2D simulation coordinates (uppercase for MJ models, lowercase for D3 compatibility) */
    X?: number;
    Y?: number;
    VX?: number;
    VY?: number;
    FX?: number | null;
    FY?: number | null;

    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    index?: number;

    /** Underlying business entity reference / data payload */
    Data?: TData;
}

/**
 * Represents a relationship edge between two nodes.
 */
export interface GraphEdge<TData = Record<string, unknown>> {
    /** Unique identifier for the relationship edge */
    ID: string;

    /** Source node identifier */
    SourceID: string;

    /** Target node identifier */
    TargetID: string;

    /** D3 simulation link object references */
    source?: string | GraphNode;
    target?: string | GraphNode;
    index?: number;

    /** Relationship semantic label (e.g. 'Employed By', 'Board Member', 'Subsidiary Of') */
    Label: string;

    /** Directionality of the relationship */
    Direction?: GraphEdgeDirection;

    /** Edge thickness / weight (default is 2) */
    Weight?: number;

    /** Line style pattern */
    Style?: GraphEdgeStyle;

    /** Optional stroke color override */
    Color?: string;

    /** Whether to render an animated particle flow along the edge */
    Animated?: boolean;

    /** Underlying relationship entity reference / data payload */
    Data?: TData;
}

/**
 * Viewport zoom and pan transformation state.
 */
export interface GraphViewportTransform {
    Scale: number;
    PanX: number;
    PanY: number;
}

/**
 * Options for configuring graph layout physics simulation.
 */
export interface GraphPhysicsConfig {
    /** Node repulsion charge strength (negative number, default -400) */
    Repulsion: number;

    /** Ideal spring link distance between connected nodes (default 120) */
    LinkDistance: number;

    /** Centering gravity force strength (default 0.05) */
    Gravity: number;

    /** Velocity damping coefficient between 0 and 1 (default 0.85) */
    Damping: number;

    /** Maximum simulation iterations before settling (default 300) */
    MaxIterations: number;
}
