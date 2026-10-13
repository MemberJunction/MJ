/**
 * @fileoverview Before/After cancelable event argument classes for `@memberjunction/ng-graph-view`.
 *
 * Implements MemberJunction's established Before/After cancelable event pattern:
 * - `Before*` events carry an args object extending {@link CancellableGraphEventArgs} with a `Cancel: boolean` property.
 * - Listeners flip `Cancel = true` to halt the default action; the matching `After*` event will NOT fire.
 * - `After*` events carry non-cancelable results and payloads.
 *
 * @module @memberjunction/ng-graph-view
 */

import type { GraphNode, GraphEdge, GraphLayoutMode, GraphViewportTransform } from '../models/graph-models';

/**
 * Base class for all cancelable graph events. Listeners flip `Cancel = true` to
 * halt the operation before it executes.
 */
export class CancellableGraphEventArgs {
    /** Set to true in a Before-event listener to prevent the action from completing */
    public Cancel = false;

    /** Optional human-readable reason for telemetry, debugging, or UI feedback */
    public CancelReason?: string;
}

// ────────────────────────────────────────────────────────────────────
// 1. Node Selection Events
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE a node in the graph is selected. Listeners can cancel selection
 * (e.g. if navigation is restricted or unsaved changes exist in an inspector).
 */
export class BeforeNodeSelectEventArgs extends CancellableGraphEventArgs {
    constructor(
        public readonly Node: GraphNode,
        public readonly PreviousNode: GraphNode | null = null
    ) {
        super();
    }
}

/**
 * Fired AFTER a node is successfully selected.
 */
export class NodeSelectedEventArgs {
    constructor(
        public readonly Node: GraphNode,
        public readonly PreviousNode: GraphNode | null = null
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// 2. Edge Selection Events
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE an edge relationship is selected.
 */
export class BeforeEdgeSelectEventArgs extends CancellableGraphEventArgs {
    constructor(
        public readonly Edge: GraphEdge,
        public readonly SourceNode: GraphNode | null = null,
        public readonly TargetNode: GraphNode | null = null
    ) {
        super();
    }
}

/**
 * Fired AFTER an edge relationship is selected.
 */
export class EdgeSelectedEventArgs {
    constructor(
        public readonly Edge: GraphEdge,
        public readonly SourceNode: GraphNode | null = null,
        public readonly TargetNode: GraphNode | null = null
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// 3. Hop Expansion Events (Incremental Lazy Loading)
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE expanding graph hops for a given node.
 */
export class BeforeHopExpandEventArgs extends CancellableGraphEventArgs {
    constructor(
        public readonly Node: GraphNode,
        public readonly TargetDepth: number,
        public readonly CurrentDepth: number
    ) {
        super();
    }
}

/**
 * Fired AFTER graph hop expansion completes.
 */
export class HopExpandedEventArgs {
    constructor(
        public readonly Node: GraphNode,
        public readonly AddedNodes: GraphNode[],
        public readonly AddedEdges: GraphEdge[],
        public readonly CurrentDepth: number
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// 4. Layout Mode Change Events
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE the layout algorithm changes.
 */
export class BeforeLayoutChangeEventArgs extends CancellableGraphEventArgs {
    constructor(
        public readonly NewMode: GraphLayoutMode,
        public readonly CurrentMode: GraphLayoutMode
    ) {
        super();
    }
}

/**
 * Fired AFTER the layout algorithm has recomputed and applied.
 */
export class LayoutChangedEventArgs {
    constructor(
        public readonly NewMode: GraphLayoutMode,
        public readonly PreviousMode: GraphLayoutMode
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// 5. Node Navigation Action Events
// ────────────────────────────────────────────────────────────────────

/**
 * Fired BEFORE an entity navigation action triggers (e.g. user clicks "Open Entity Form").
 */
export class BeforeNodeNavigateEventArgs extends CancellableGraphEventArgs {
    constructor(
        public readonly Node: GraphNode,
        public readonly EntityName?: string,
        public readonly RecordID?: string
    ) {
        super();
    }
}

/**
 * Fired AFTER entity navigation request has been handed off to navigation service.
 */
export class NodeNavigatedEventArgs {
    constructor(
        public readonly Node: GraphNode,
        public readonly EntityName?: string,
        public readonly RecordID?: string
    ) {}
}

// ────────────────────────────────────────────────────────────────────
// 6. Viewport Transform Events (Zoom / Pan)
// ────────────────────────────────────────────────────────────────────

/**
 * Fired whenever viewport zoom or pan changes.
 */
export class ViewportTransformEventArgs {
    constructor(
        public readonly Transform: GraphViewportTransform
    ) {}
}
