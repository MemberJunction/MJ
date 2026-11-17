import type {
    IMetadataProvider,
    IRunQueryProvider,
    IRunViewProvider,
    UserInfo,
} from '@memberjunction/core';
import { LogStatus } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type { MJGraphEntity } from '../generated/entity_subclasses';

/**
 * Polymorphic reference to any entity record node in a semantic graph (`EntityName` + `RecordID`).
 */
export interface GraphNodeRef {
    EntityName: string;
    RecordID: string;
    EntityID?: string;
}

/**
 * Resolved view of a semantic graph node with display label, icon, and description.
 *
 * `Hop`, `PathWeight`, `ParentKey` and `ViaEdgeID` are set by {@link GraphEngine.Subgraph}: they
 * record the best path that reached the node, so a caller can explain how it got there.
 */
export interface GraphNodeView {
    /** Canonical node key (`<normalizedEntityID>|<recordID>` or `<normalizedEntityName>|<recordID>`). */
    Key: string;
    EntityName: string;
    RecordID: string;
    Label: string;
    Icon: string | null;
    Description: string | null;
    EntityID?: string;
    /** Hops from the nearest seed (`0` for a seed). */
    Hop?: number;
    /** Best-first path score: product of edge weights, decayed per hop (`1` for a seed). */
    PathWeight?: number;
    /** Key of the node this one was reached from (`null` for a seed). */
    ParentKey?: string | null;
    /** ID of the edge this node was reached through (`null` for a seed). */
    ViaEdgeID?: string | null;
}

/**
 * Resolved view of a stored or derived semantic graph edge.
 */
export interface GraphEdgeView {
    /** Stored edge ID, or `'derived:<provider>:<type>:<sourceKey>:<targetKey>'`. */
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
    InverseTypeName?: string | null;
}

/**
 * Alias for {@link GraphEdgeView} used in RAG and provider slice contracts.
 */
export type GraphEdgeSlice = GraphEdgeView;

/**
 * Options controlling bounded graph traversal (`GetEdges` and `Subgraph`).
 */
export interface GraphTraversalOptions {
    /** Traversal direction relative to seed/frontier nodes (`'Both'` by default). */
    Direction?: 'Out' | 'In' | 'Both';
    /** Optional allow-list of edge type names. */
    EdgeTypes?: string[];
    /** Minimum edge weight in `[0, 1]`. */
    MinWeight?: number;
    /** When `true`, include `'Proposed'` stored edges alongside `'Approved'` ones (`false` by default). */
    IncludeProposed?: boolean;
    /** Maximum hop depth (`2` by default, clamped to `1..4`). */
    Depth?: number;
    /** Alias for {@link Depth} used by RAG/pipeline callers. */
    MaxDepth?: number;
    /** Maximum expanded nodes (`50` by default, clamped to `1..200`). */
    MaxNodes?: number;
    /**
     * Everyone besides the caller who will see the result (a run's audience). A node is admitted only
     * when the caller AND every reader may see it, checked during traversal, so a node reachable only
     * through a node some reader cannot see is never reached.
     */
    AudienceReaders?: readonly UserInfo[];
}

/**
 * Bounded subgraph returned by {@link GraphEngine.Subgraph}.
 */
export interface GraphSubgraph {
    Nodes: GraphNodeView[];
    Edges: GraphEdgeView[];
    /** Why the result is empty or partial: an unknown or inactive graph, or a cap that was reached. */
    Message?: string;
}

/**
 * Request passed to a {@link BaseGraphEdgeProvider} for one expansion step.
 */
export interface GraphEdgeRequest {
    /** Frontier nodes to expand around. Providers return only edges incident to these nodes. */
    Nodes: GraphNodeRef[];
    Direction: 'Out' | 'In' | 'Both';
    EdgeTypes?: string[];
}

/**
 * A provider that can answer metadata lookups, `RunView` and `RunQuery` — what graph traversal and
 * every edge provider read through. `ProviderBase` implements all three; the interfaces are separate
 * in `@memberjunction/core`, so {@link IsGraphDataProvider} narrows to this without a cast.
 */
export type GraphDataProvider = IMetadataProvider & IRunViewProvider & IRunQueryProvider;

/**
 * True when `candidate` implements {@link GraphDataProvider}. Used instead of an `as unknown as`
 * cast wherever a provider arrives typed as only one of the three interfaces.
 */
export function IsGraphDataProvider(candidate: object | null | undefined): candidate is GraphDataProvider {
    return (
        candidate != null &&
        'Entities' in candidate &&
        'EntityByName' in candidate &&
        typeof candidate.EntityByName === 'function' &&
        'RunView' in candidate &&
        typeof candidate.RunView === 'function' &&
        'RunViews' in candidate &&
        typeof candidate.RunViews === 'function' &&
        'RunQuery' in candidate &&
        typeof candidate.RunQuery === 'function'
    );
}

/**
 * Execution context passed to {@link BaseGraphEdgeProvider.GetEdges}.
 */
export interface GraphProviderContext<TConfig = Record<string, unknown>> {
    Graph: MJGraphEntity;
    Config: TConfig;
    /** The caller. Every data read runs as this user so entity permissions and row-level security apply. */
    User: UserInfo;
    Provider: GraphDataProvider;
}

/** Default per-step row cap for data-scale providers (`MaxRowsPerStep` in their configuration). */
export const DEFAULT_GRAPH_PROVIDER_MAX_ROWS_PER_STEP = 200;

/**
 * Build a canonical, case-normalized key for a `(EntityID/EntityName, RecordID)` pair.
 */
export function FormatGraphNodeKey(entityIdOrName: string, recordId: string): string {
    const normalizedEntity = NormalizeUUID(entityIdOrName.trim());
    const trimmedRecordId = String(recordId).trim();
    // Normalize UUID record IDs so SQL Server upper-case and PostgreSQL lower-case keys match
    const normalizedRecord = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        trimmedRecordId,
    )
        ? NormalizeUUID(trimmedRecordId)
        : trimmedRecordId;
    return `${normalizedEntity}|${normalizedRecord}`;
}

/**
 * Check whether an edge type name passes an optional `EdgeTypes` filter (case-insensitive).
 */
export function MatchesEdgeTypeFilter(typeName: string, allowedTypes?: readonly string[]): boolean {
    if (!allowedTypes || allowedTypes.length === 0) {
        return true;
    }
    const target = typeName.trim().toLowerCase();
    return allowedTypes.some((t) => t.trim().toLowerCase() === target);
}

/**
 * Abstract base class for derived semantic graph edge providers (`@RegisterClass(BaseGraphEdgeProvider, '<DriverClass>')`).
 *
 * Providers are called once per expansion step with the step's frontier and must return only edges
 * incident to it. Metadata-scale providers read loaded metadata and `QueryEngine` caches (no I/O);
 * data-scale providers batch one bounded, ordered read per step.
 */
export abstract class BaseGraphEdgeProvider<TConfig = Record<string, unknown>> {
    /**
     * Project derived edges for `request`. Every data read must go through `RunView` or `RunQuery`
     * with `ctx.User` so entity permissions and row-level security apply.
     */
    public abstract GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<TConfig>,
    ): Promise<GraphEdgeView[]>;

    /**
     * Log that a per-step read hit its row cap, so a truncated neighborhood is visible rather than
     * silently partial.
     */
    protected LogTruncation(providerName: string, source: string, maxRows: number, graphName: string): void {
        LogStatus(
            `${providerName}: the per-step read of "${source}" in graph "${graphName}" reached its ${maxRows}-row cap; ` +
                'this expansion step may be missing edges. Raise MaxRowsPerStep or narrow the frontier.',
        );
    }
}

/** Hard ceiling on any provider's per-step row cap. */
export const MAX_GRAPH_PROVIDER_ROWS_PER_STEP = 1000;

/**
 * A provider's per-step row cap from its configuration: `DEFAULT_GRAPH_PROVIDER_MAX_ROWS_PER_STEP`
 * when unset, clamped to `1..MAX_GRAPH_PROVIDER_ROWS_PER_STEP`.
 */
export function ResolveMaxRowsPerStep(configured: number | undefined): number {
    const value = configured != null && Number.isFinite(configured) ? Math.floor(configured) : DEFAULT_GRAPH_PROVIDER_MAX_ROWS_PER_STEP;
    return Math.max(1, Math.min(MAX_GRAPH_PROVIDER_ROWS_PER_STEP, value));
}
