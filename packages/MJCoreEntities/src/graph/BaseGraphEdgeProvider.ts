import { IMetadataProvider, IRunQueryProvider, IRunViewProvider, UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { MJGraphEntity } from '../generated/entity_subclasses';

/**
 * Identifies a node in a semantic graph by its MJ Entity name and primary key record ID.
 */
export interface GraphNodeRef {
    EntityName: string;
    RecordID: string;
}

/**
 * Resolved view of a semantic graph node with display label, icon, and description.
 */
export interface GraphNodeView {
    Key: string;
    EntityName: string;
    RecordID: string;
    Label: string;
    Icon: string | null;
    Description: string | null;
}

/**
 * Resolved view of a semantic graph edge (either stored in `MJ: Graph Edges` or projected
 * at read time by a {@link BaseGraphEdgeProvider}).
 */
export interface GraphEdgeView {
    /** Stored edge ID, or `derived:<provider>:<type>:<sourceKey>:<targetKey>` for provider edges */
    ID: string;
    GraphName: string;
    TypeName: string;
    Source: GraphNodeRef;
    Target: GraphNodeRef;
    IsDirected: boolean;
    Weight: number;
    Description: string | null;
    Attributes: Record<string, unknown> | null;
    Origin: 'Derived' | 'Declared' | 'Inferred';
    Status: 'Proposed' | 'Approved' | 'Rejected';
    Confidence: number | null;
}

/**
 * Request passed to {@link BaseGraphEdgeProvider.GetEdges}.
 */
export interface GraphEdgeRequest {
    /**
     * Frontier nodes to expand around. When `undefined`, the provider should enumerate all
     * edges it produces (only invoked when {@link BaseGraphEdgeProvider.SupportsEnumeration} is `true`).
     */
    Nodes?: GraphNodeRef[];
    /**
     * Traversal direction relative to {@link Nodes}:
     * - `'Out'`: edges where `Source` is in `Nodes`
     * - `'In'`: edges where `Target` is in `Nodes`
     * - `'Both'`: edges where either `Source` or `Target` is in `Nodes` (or undirected edges)
     */
    Direction: 'Out' | 'In' | 'Both';
    /**
     * Optional filter restricting returned edges to the specified edge type names (case-insensitive).
     */
    EdgeTypes?: string[];
}

/**
 * Options controlling single-node edge lookup (`GetEdges`) and multi-hop subgraph expansion (`Subgraph`).
 */
export interface GraphTraversalOptions {
    /** Traversal direction at each hop (default `'Both'`) */
    Direction?: 'Out' | 'In' | 'Both';
    /** Optional edge type name allow-list (case-insensitive) */
    EdgeTypes?: string[];
    /** Minimum edge weight threshold (0.0 to 1.0) */
    MinWeight?: number;
    /** Whether to include `Proposed` edges in addition to `Approved` edges (default `false`) */
    IncludeProposed?: boolean;
    /** Maximum hop depth from seed nodes (default `2`, capped at `4`) */
    Depth?: number;
    /** Maximum number of nodes in the returned subgraph (default `50`, capped at `200` for OnDemand graphs) */
    MaxNodes?: number;
}

/**
 * Subgraph returned by {@link GraphEngine.Subgraph} and {@link CanonGraphEngine.CanonContext}.
 */
export interface GraphSubgraphResult {
    Nodes: GraphNodeView[];
    Edges: GraphEdgeView[];
}

/**
 * Execution context supplied to a {@link BaseGraphEdgeProvider} when projecting derived edges.
 */
export interface GraphProviderContext<TConfig = unknown> {
    Graph: MJGraphEntity;
    Config: TConfig;
    User: UserInfo;
    Provider: IMetadataProvider & IRunViewProvider & Partial<IRunQueryProvider>;
    /**
     * Optional set of normalized `MJ: Entity Fields` IDs that appear as endpoints on stored edges
     * in this graph. Used by `EntityMetadataEdgeProvider` so `'Field Of'` edges are only emitted
     * for fields that participate in stored graph edges.
     */
    StoredEdgeFieldIDs?: ReadonlySet<string>;
    /**
     * Optional callback resolving the configured `DefaultWeight` for an edge type on this graph.
     */
    ResolveDefaultWeight?: (edgeTypeName: string, fallbackWeight: number) => number;
}

/**
 * Builds a canonical node key `<normalizedEntityIDOrName>|<normalizedRecordID>` suitable for
 * map indexing and deduplication without raw UUID `===` comparisons.
 */
export function BuildGraphNodeKey(entityIDOrName: string, recordID: string): string {
    const normEntity = NormalizeUUID(entityIDOrName);
    const normRecord = NormalizeUUID(recordID);
    return `${normEntity}|${normRecord}`;
}

/**
 * Builds a deterministic derived edge identifier:
 * `derived:<provider>:<type>:<sourceEntity>:<sourceRecordID>:<targetEntity>:<targetRecordID>`
 */
export function BuildDerivedGraphEdgeID(
    providerClass: string,
    edgeTypeName: string,
    source: GraphNodeRef,
    target: GraphNodeRef,
): string {
    const srcKey = BuildGraphNodeKey(source.EntityName, source.RecordID);
    const tgtKey = BuildGraphNodeKey(target.EntityName, target.RecordID);
    return `derived:${providerClass}:${edgeTypeName}:${srcKey}:${tgtKey}`;
}

/**
 * Checks whether two {@link GraphNodeRef} instances refer to the same entity and record.
 */
export function GraphNodeRefsEqual(a: GraphNodeRef, b: GraphNodeRef): boolean {
    return (
        a.EntityName.trim().toLowerCase() === b.EntityName.trim().toLowerCase() &&
        UUIDsEqual(a.RecordID, b.RecordID)
    );
}

/**
 * Checks whether a candidate edge matches the requested `EdgeTypes`, `Nodes`, and `Direction`.
 */
export function MatchesGraphEdgeRequest(
    edge: Pick<GraphEdgeView, 'TypeName' | 'Source' | 'Target' | 'IsDirected'>,
    request: GraphEdgeRequest,
): boolean {
    if (request.EdgeTypes && request.EdgeTypes.length > 0) {
        const typeLower = edge.TypeName.trim().toLowerCase();
        const matchesType = request.EdgeTypes.some(t => t.trim().toLowerCase() === typeLower);
        if (!matchesType) {
            return false;
        }
    }

    if (!request.Nodes || request.Nodes.length === 0) {
        return true;
    }

    const direction = request.Direction ?? 'Both';
    const matchesSource = request.Nodes.some(n => GraphNodeRefsEqual(n, edge.Source));
    const matchesTarget = request.Nodes.some(n => GraphNodeRefsEqual(n, edge.Target));

    if (!edge.IsDirected || direction === 'Both') {
        return matchesSource || matchesTarget;
    }
    if (direction === 'Out') {
        return matchesSource;
    }
    return matchesTarget;
}

/**
 * Abstract base class for derived graph edge providers.
 *
 * Subclasses register with `@RegisterClass(BaseGraphEdgeProvider, '<DriverClass>')` and are
 * instantiated by `GraphEngine` for each active `MJ: Graph Edge Providers` row on a graph.
 */
export abstract class BaseGraphEdgeProvider<TConfig = unknown> {
    /**
     * When `true`, this provider can enumerate its full edge set cheaply from in-memory metadata
     * (used by `Preload` graphs such as `"MJ Canon"`).
     * When `false`, this provider operates at data scale and only expands around `request.Nodes`.
     */
    public abstract get SupportsEnumeration(): boolean;

    /**
     * Projects derived edges matching `request` within `ctx`.
     * Data-scale providers must execute all data reads through `RunView` / `RunViews` / `RunQuery`
     * with `ctx.User` so entity permissions and row-level security (RLS) are enforced.
     */
    public abstract GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<TConfig>,
    ): Promise<GraphEdgeView[]>;
}
