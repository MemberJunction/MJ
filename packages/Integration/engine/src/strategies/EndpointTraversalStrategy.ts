/**
 * Strategy interfaces for classifying how API endpoints are traversed.
 * Different objects require different fetch patterns (simple GET, paginated,
 * per-parent template iteration, detail enrichment, or association queries).
 */

/** How an endpoint is traversed during data fetch */
export type TraversalType = 'Simple' | 'Paginated' | 'Templated' | 'Enrichment' | 'Association';

/** Describes the traversal pattern for a specific integration object */
export interface EndpointTraversal {
    /** The traversal type */
    Type: TraversalType;
    /** Human-readable description of how this endpoint is traversed */
    Description: string;
}
