import type {
    IMetadataProvider,
    IRunQueryProvider,
    IRunViewProvider,
    UserInfo,
} from '@memberjunction/core';
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
    /** When `true`, include `'Proposed'` edges alongside `'Approved'` and `'Derived'` edges (`false` by default). */
    IncludeProposed?: boolean;
    /** Maximum hop depth (`2` by default, capped at `4`). */
    Depth?: number;
    /** Alias for {@link Depth} used by RAG/pipeline callers. */
    MaxDepth?: number;
    /** Maximum expanded nodes (`50` by default; hard-capped at `200`). */
    MaxNodes?: number;
}

/**
 * Bounded subgraph returned by {@link GraphEngine.Subgraph}.
 */
export interface GraphSubgraph {
    Nodes: GraphNodeView[];
    Edges: GraphEdgeView[];
}

/**
 * Request passed to a {@link BaseGraphEdgeProvider} during preload enumeration or on-demand step expansion.
 */
export interface GraphEdgeRequest {
    /** Frontier nodes to expand around; `undefined` means enumerate all edges (for `Preload` graphs only). */
    Nodes?: GraphNodeRef[];
    Direction: 'Out' | 'In' | 'Both';
    EdgeTypes?: string[];
}

/**
 * Execution context passed to {@link BaseGraphEdgeProvider.GetEdges}.
 */
export interface GraphProviderContext<TConfig = Record<string, unknown>> {
    Graph: MJGraphEntity;
    Config: TConfig;
    User: UserInfo;
    Provider: IMetadataProvider & IRunViewProvider & Partial<IRunQueryProvider>;
}

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
 * Minimal node shape consumed by {@link ComputeGraphNodeAttenuatedScore} and {@link FormatGraphNodeBreadcrumb}.
 */
export interface GraphNodeProvenanceInput {
    readonly EntityName: string;
    readonly RecordID: string;
    readonly Title: string;
    readonly NodeKind?: 'Record' | 'View' | 'Query' | 'Concept';
    readonly Score?: number;
    readonly SeedScore?: number;
    readonly SeedTitle?: string;
    readonly Breadcrumb?: string;
    readonly PathEdges?: readonly {
        readonly EdgeType: string;
        readonly Weight: number;
        readonly Label?: string;
    }[];
}

/**
 * Compute the path-attenuated score for an expanded graph node:
 * `seedScore * product(edge.Weight)` clamped to `[0, 1]`.
 */
export function ComputeGraphNodeAttenuatedScore(node: GraphNodeProvenanceInput): number {
    if (typeof node.Score === 'number' && Number.isFinite(node.Score)) {
        return Math.max(0, Math.min(1, node.Score));
    }
    const seedScore =
        typeof node.SeedScore === 'number' && Number.isFinite(node.SeedScore)
            ? Math.max(0, Math.min(1, node.SeedScore))
            : 1.0;
    const edges = node.PathEdges ?? [];
    let product = seedScore;
    for (const edge of edges) {
        const weight = Number.isFinite(edge.Weight) ? Math.max(0, Math.min(1, edge.Weight)) : 0;
        product *= weight;
    }
    return Math.max(0, Math.min(1, product));
}

/**
 * Format a human-readable provenance breadcrumb for an expanded graph node, e.g.:
 * `"Open AR" --[Defined By (0.95)]--> View "Invoices.Open"`.
 */
export function FormatGraphNodeBreadcrumb(node: GraphNodeProvenanceInput): string {
    if (node.Breadcrumb && node.Breadcrumb.trim().length > 0) {
        return node.Breadcrumb;
    }
    const seedLabel = node.SeedTitle ? `"${node.SeedTitle}"` : `"${node.EntityName}:${node.RecordID}"`;
    const kindPrefix = node.NodeKind && node.NodeKind !== 'Record' ? `${node.NodeKind} ` : '';
    const targetLabel = `${kindPrefix}"${node.Title}"`;
    const edges = node.PathEdges ?? [];
    if (edges.length === 0) {
        return `${seedLabel} --> ${targetLabel}`;
    }
    const hops = edges.map((edge) => {
        const edgeLabel = edge.Label ?? edge.EdgeType;
        const formattedWeight = edge.Weight.toFixed(2);
        return `--[${edgeLabel} (${formattedWeight})]-->`;
    });
    return `${seedLabel} ${hops.join(' ')} ${targetLabel}`;
}

/**
 * Abstract base class for derived semantic graph edge providers (`@RegisterClass(BaseGraphEdgeProvider, '<DriverClass>')`).
 */
export abstract class BaseGraphEdgeProvider<TConfig = Record<string, unknown>> {
    /**
     * `true` when the provider can enumerate every edge cheaply at preload time (metadata-scale);
     * `false` when the provider only expands around given frontier `Nodes` (data-scale).
     */
    public abstract get SupportsEnumeration(): boolean;

    /**
     * Project derived edges for `request`. Every data read must go through `RunView` or `RunQuery`
     * with `ctx.User` so entity permissions and row-level security apply.
     */
    public abstract GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<TConfig>,
    ): Promise<GraphEdgeView[]>;
}

