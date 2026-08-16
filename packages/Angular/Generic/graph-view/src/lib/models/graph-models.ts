/**
 * @fileoverview Domain models and configuration interfaces for `@memberjunction/ng-graph-view`.
 *
 * Provides strongly-typed data structures for representing entities as graph nodes,
 * directed/undirected relationship edges, layout configurations, and viewport telemetry.
 *
 * @module @memberjunction/ng-graph-view
 */

/**
 * Standard semantic category of a graph node.
 */
export type GraphNodeCategory =
    | 'person'
    | 'organization'
    | 'committee'
    | 'account'
    | 'asset'
    | 'group'
    | 'custom';

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

    /** Primary display label (e.g. Person Name, Organization Name) */
    Label: string;

    /** Secondary descriptive sublabel (e.g. Job Title, Industry) */
    Sublabel?: string;

    /** Semantic category defining the default icon and palette */
    Category: GraphNodeCategory;

    /** Optional Font Awesome icon class override (e.g. 'fa-solid fa-user') */
    IconClass?: string;

    /** Optional custom hex/HSL color or CSS color variable override */
    Color?: string;

    /** Node radius / diameter scale (default is 28) */
    Radius?: number;

    /** Optional small badge text or status indicator */
    Badge?: string;

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
