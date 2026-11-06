import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * Global object store key used to register/retrieve the active {@link IGraphExpansionService}
 * across `@memberjunction/ai-core-plus`, `@memberjunction/search-engine`, and `@memberjunction/ai-agents`
 * without introducing circular or reverse package dependencies.
 */
export const GRAPH_EXPANSION_SERVICE_GLOBAL_KEY = '___SINGLETON__GraphExpansionService';

/**
 * Seed node resolved from a query string, entity/record reference, or pipeline expression.
 */
export interface GraphSeedNode {
    /** Canonical MJ entity name (e.g. `'MJ: Entities'`, `'MJ: Queries'`, `'Invoices'`). */
    readonly EntityName: string;
    /** Primary key or compact record identifier of the seed record. */
    readonly RecordID: string;
    /** Optional human-readable label for breadcrumb construction. */
    readonly Title?: string;
    /** Initial seed relevance score in `(0, 1]`; defaults to `1.0` when omitted. */
    readonly SeedScore?: number;
    /** Optional graph name that produced this seed (e.g. `'MJ Canon'`). */
    readonly GraphName?: string;
}

/**
 * Directed, weighted edge traversed during bounded semantic graph expansion.
 */
export interface GraphExpandedEdge {
    /** Optional stable edge identifier. */
    readonly EdgeID?: string;
    /** Source node identifier (`<EntityName>::<RecordID>` or provider node ID). */
    readonly FromNodeID: string;
    /** Target node identifier (`<EntityName>::<RecordID>` or provider node ID). */
    readonly ToNodeID: string;
    /** Semantic relationship label (e.g. `'Defined By'`, `'Governs'`, `'Narrower Than'`). */
    readonly EdgeType: string;
    /** Edge weight in `[0, 1]` used for path-attenuated ranking. */
    readonly Weight: number;
    /** Optional display label for provenance breadcrumbs. */
    readonly Label?: string;
}

/**
 * Kind of semantic graph node returned by expansion.
 */
export type GraphNodeKind = 'Record' | 'View' | 'Query' | 'Concept';

/**
 * Neighbor node discovered during bounded semantic graph traversal.
 */
export interface GraphExpandedNode {
    /** Unique node identifier within the expansion result. */
    readonly NodeID: string;
    /** Target MJ entity name (`'MJ: User Views'`, `'MJ: Queries'`, business entity name, etc.). */
    readonly EntityName: string;
    /** Target record ID. */
    readonly RecordID: string;
    /** Display title for search hits and context blocks. */
    readonly Title: string;
    /** Summary or definition text associated with the node. */
    readonly Snippet?: string;
    /** Named graph this node belongs to (e.g. `'MJ Canon'`). */
    readonly GraphName?: string;
    /** Kind of artifact represented by the node. */
    readonly NodeKind?: GraphNodeKind;
    /**
     * Optional precomputed score in `[0, 1]`. When omitted, consumers compute
     * `seedScore * product(PathEdges.Weight)`.
     */
    readonly Score?: number;
    /** Score of the originating seed node in `(0, 1]` (defaults to `1.0`). */
    readonly SeedScore?: number;
    /** Human-readable origin seed title used when building provenance breadcrumbs. */
    readonly SeedTitle?: string;
    /** Ordered sequence of edges traversed from the seed node to this node. */
    readonly PathEdges?: readonly GraphExpandedEdge[];
    /**
     * Optional pre-formatted provenance breadcrumb, e.g.:
     * `"Open AR" --[Defined By (0.95)]--> View "Invoices.Open"`.
     */
    readonly Breadcrumb?: string;
    /**
     * Optional explicit entity name whose `CanRead` permission must be checked
     * (for example, the underlying entity of a view or canonical concept).
     */
    readonly UnderlyingEntityName?: string;
    /**
     * Optional allow-list of role names required to run/use a query or view node
     * when evaluated outside `GraphEngine`.
     */
    readonly AllowedRoleNames?: readonly string[];
    /**
     * Optional predicate supplied by the graph engine or test fixture to evaluate
     * whether a specific `UserInfo` (caller or audience reader) may access this node.
     */
    readonly CanReadForUser?: (user: UserInfo) => boolean;
}

/**
 * Parameters controlling bounded semantic graph expansion.
 */
export interface GraphExpansionParams {
    /** Starting seed nodes for traversal. */
    readonly Seeds: readonly GraphSeedNode[];
    /** Optional filter of named graphs to traverse (e.g. `['MJ Canon']`). */
    readonly GraphNames?: readonly string[];
    /** Maximum hop depth (`1..4`, defaults to `2`). */
    readonly MaxDepth?: number;
    /** Maximum number of expanded nodes returned (defaults to `25`). */
    readonly MaxNodes?: number;
    /** Minimum path-attenuated weight floor in `[0, 1]` (defaults to `0.25`). */
    readonly MinWeight?: number;
    /** Optional allow-list of edge types to traverse. */
    readonly EdgeTypeFilter?: readonly string[];
    /**
     * Optional additional readers (from `SearchParams.Audience` or `TaskSecurityEnvelope.Audience`)
     * whose visibility must be intersected with `contextUser`.
     */
    readonly AudienceReaders?: readonly UserInfo[];
}

/**
 * Subgraph returned by {@link IGraphExpansionService.Expand}.
 */
export interface GraphExpansionResult {
    /** Ranked, permission-checked neighbor nodes. */
    readonly Nodes: readonly GraphExpandedNode[];
    /** Traversed edges connecting the returned nodes. */
    readonly Edges: readonly GraphExpandedEdge[];
}

/**
 * Pluggable seam for `@memberjunction/graph-engine` (`GraphEngine.Instance`)
 * consumed by `GraphSearchProvider` in `@memberjunction/search-engine` and
 * the deterministic `graphExpand` stage in `@memberjunction/ai-agents`.
 */
export interface IGraphExpansionService {
    /**
     * Map free-text query terms and lexical/entity-name matches to initial graph seed nodes.
     */
    ResolveSeeds(
        queryText: string,
        graphNames: readonly string[] | undefined,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<readonly GraphSeedNode[]>;

    /**
     * Perform bounded multi-hop expansion from `params.Seeds` while enforcing
     * entity/query/view permissions for `contextUser` (and any `AudienceReaders`).
     */
    Expand(
        params: GraphExpansionParams,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GraphExpansionResult>;
}

/**
 * Register or clear the process-wide {@link IGraphExpansionService} implementation
 * in `GetGlobalObjectStore()`.
 */
export function RegisterGraphExpansionService(service: IGraphExpansionService | null): void {
    const store = GetGlobalObjectStore();
    if (!store) {
        return;
    }
    if (service == null) {
        delete store[GRAPH_EXPANSION_SERVICE_GLOBAL_KEY];
    } else {
        store[GRAPH_EXPANSION_SERVICE_GLOBAL_KEY] = service;
    }
}

/**
 * Retrieve the currently registered {@link IGraphExpansionService}, or `null` when
 * no graph engine has been configured in this process.
 */
export function GetRegisteredGraphExpansionService(): IGraphExpansionService | null {
    const store = GetGlobalObjectStore();
    if (!store) {
        return null;
    }
    const candidate = store[GRAPH_EXPANSION_SERVICE_GLOBAL_KEY] as IGraphExpansionService | undefined;
    return candidate ?? null;
}

/**
 * Compute the path-attenuated score for an expanded graph node:
 * `seedScore * product(edge.Weight)` clamped to `[0, 1]`.
 */
export function ComputeGraphNodeAttenuatedScore(node: GraphExpandedNode): number {
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
export function FormatGraphNodeBreadcrumb(node: GraphExpandedNode): string {
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
