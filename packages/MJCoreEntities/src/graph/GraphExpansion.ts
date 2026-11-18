import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';

/**
 * The graph-expansion seam (WS-4.2): one definition, consumed by `GraphSearchProvider`
 * (`@memberjunction/search-engine`) and the `graphExpand` pipeline stage (`@memberjunction/ai-agents`),
 * and implemented by `CanonGraphEngine.AsExpansionService()` over `GraphEngine`.
 *
 * It lives here, next to `GraphEngine`, because every consumer and the implementation already depend
 * on `@memberjunction/core-entities`; `@memberjunction/search-engine` does not depend on
 * `@memberjunction/ai-core-plus`, so a definition there would have to be copied.
 */

/** Global object store key for the registered {@link IGraphExpansionService}. */
export const GRAPH_EXPANSION_SERVICE_GLOBAL_KEY = '___SINGLETON__GraphExpansionService';

/** RRF constant `k` for ranking graph nodes (the conventional Reciprocal Rank Fusion value). */
export const GRAPH_RRF_K = 60;

/** Rank penalty per hop in {@link ComputeGraphRRFScore} (`plans/next-gen-ai-agents-and-durable-graphs.md`). */
export const GRAPH_RRF_HOP_PENALTY = 15;

/**
 * Seed node resolved from a query string, entity/record reference, or pipeline expression.
 */
export interface GraphSeedNode {
    /** Canonical MJ entity name (e.g. `'MJ: Entities'`, `'MJ: Graph Concepts'`, `'Invoices'`). */
    readonly EntityName: string;
    /** Primary key of the seed record. */
    readonly RecordID: string;
    /** Optional human-readable label for breadcrumb construction. */
    readonly Title?: string;
    /** Seed relevance in `(0, 1]`; defaults to `1.0` when omitted. */
    readonly SeedScore?: number;
    /** Graph that produced this seed (e.g. `'MJ Canon'`). */
    readonly GraphName?: string;
}

/**
 * One edge on the path from a seed to an expanded node, oriented in the direction it was walked.
 */
export interface GraphExpandedEdge {
    readonly EdgeID?: string;
    /** Node key the hop started from. */
    readonly FromNodeID: string;
    /** Node key the hop reached. */
    readonly ToNodeID: string;
    /** Relationship walked (the inverse name when an edge was walked against its direction). */
    readonly EdgeType: string;
    /** Edge weight in `[0, 1]`. */
    readonly Weight: number;
    readonly Label?: string;
}

/** Kind of semantic graph node returned by expansion. */
export type GraphNodeKind = 'Record' | 'View' | 'Query' | 'Concept';

/**
 * Node reached by bounded expansion. Every node returned by the engine-backed service was visible to
 * the caller and every audience reader at every hop of its path.
 */
export interface GraphExpandedNode {
    /** Node key (`<entityID>|<recordID>`). */
    readonly NodeID: string;
    readonly EntityName: string;
    readonly RecordID: string;
    readonly Title: string;
    readonly Snippet?: string;
    readonly GraphName?: string;
    readonly NodeKind?: GraphNodeKind;
    /** Relevance of the seed this node was reached from, in `(0, 1]` (defaults to `1.0`). */
    readonly SeedScore?: number;
    /** 1-based rank of that seed among the expansion's seeds (seeds are ordered best first). */
    readonly SeedRank?: number;
    readonly SeedTitle?: string;
    /** Edges walked from the seed to this node, in order; empty for a seed. */
    readonly PathEdges?: readonly GraphExpandedEdge[];
}

/**
 * Parameters controlling bounded semantic graph expansion.
 */
export interface GraphExpansionParams {
    readonly Seeds: readonly GraphSeedNode[];
    /** Named graphs to traverse (e.g. `['MJ Canon']`); the primary canon graph when omitted. */
    readonly GraphNames?: readonly string[];
    /** Maximum hop depth (`1..4`, defaults to `2`). */
    readonly MaxDepth?: number;
    /** Maximum expanded nodes (`1..200`, defaults to `25`). */
    readonly MaxNodes?: number;
    /** Minimum edge weight followed, in `[0, 1]` (defaults to `0.25`). */
    readonly MinWeight?: number;
    readonly EdgeTypeFilter?: readonly string[];
    /**
     * Readers besides `contextUser` who will see the result (a run's audience). Visibility is
     * intersected across `[contextUser, ...AudienceReaders]` during traversal.
     */
    readonly AudienceReaders?: readonly UserInfo[];
}

/**
 * Result of {@link IGraphExpansionService.Expand}.
 */
export interface GraphExpansionResult {
    readonly Nodes: readonly GraphExpandedNode[];
    readonly Edges: readonly GraphExpandedEdge[];
    /**
     * The requested seeds the expansion admitted: each passed the same caller-and-every-audience-reader
     * check as an expanded node, and its `Title` is the label that check produced. A caller that reports
     * seeds reports these, never the seeds it asked for (a requested seed may be hidden from a reader).
     */
    readonly Seeds?: readonly GraphSeedNode[];
    /** Why a graph contributed nothing or was cut short (unknown/inactive graph, a cap reached). */
    readonly Messages?: readonly string[];
}

/**
 * Pluggable graph expansion service. Implementations enforce node visibility for the caller and
 * every audience reader during traversal, and degrade to empty results when no graph is active.
 */
export interface IGraphExpansionService {
    /**
     * Map free-text query terms to initial graph seed nodes the caller AND every one of
     * `audienceReaders` (a run's audience) may see.
     */
    ResolveSeeds(
        queryText: string,
        graphNames: readonly string[] | undefined,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        audienceReaders?: readonly UserInfo[],
    ): Promise<readonly GraphSeedNode[]>;

    /** Bounded multi-hop expansion from `params.Seeds`. */
    Expand(
        params: GraphExpansionParams,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GraphExpansionResult>;
}

/**
 * Register (or clear, with `null`) the process-wide {@link IGraphExpansionService}. A server registers
 * the engine-backed service at startup; nothing registered means graph lanes are off.
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

/** The registered {@link IGraphExpansionService}, or `null` when none is registered in this process. */
export function GetRegisteredGraphExpansionService(): IGraphExpansionService | null {
    const store = GetGlobalObjectStore();
    const candidate: unknown = store ? store[GRAPH_EXPANSION_SERVICE_GLOBAL_KEY] : undefined;
    return isGraphExpansionService(candidate) ? candidate : null;
}

function isGraphExpansionService(candidate: unknown): candidate is IGraphExpansionService {
    return (
        typeof candidate === 'object' &&
        candidate !== null &&
        'ResolveSeeds' in candidate &&
        typeof candidate.ResolveSeeds === 'function' &&
        'Expand' in candidate &&
        typeof candidate.Expand === 'function'
    );
}

/**
 * Path weight of an expanded node: `seedScore × product(edge.Weight)`, clamped to `[0, 1]`.
 */
export function ComputeGraphPathWeight(node: GraphExpandedNode): number {
    let product = clampUnit(node.SeedScore ?? 1.0);
    for (const edge of node.PathEdges ?? []) {
        product *= clampUnit(edge.Weight);
    }
    return product;
}

/**
 * Hop-attenuated RRF score of an expanded node:
 * `1 / (k + seedRank + 15 × hops) × product(edge.Weight) × seedScore`.
 *
 * `seedRank` is the 1-based rank of the seed the node was reached from (best seed first) and `hops`
 * the length of its path, so nodes near strong seeds over strong edges rank first.
 */
export function ComputeGraphRRFScore(node: GraphExpandedNode, k: number = GRAPH_RRF_K): number {
    const hops = node.PathEdges?.length ?? 0;
    const seedRank = node.SeedRank != null && node.SeedRank >= 1 ? node.SeedRank : 1;
    return (1 / (k + seedRank + GRAPH_RRF_HOP_PENALTY * hops)) * ComputeGraphPathWeight(node);
}

/**
 * Human-readable provenance breadcrumb for an expanded node, e.g.:
 * `"Open AR" --[Defined By (0.95)]--> View "Invoices.Open"`.
 */
export function FormatGraphNodeBreadcrumb(node: GraphExpandedNode): string {
    const seedLabel = node.SeedTitle ? `"${node.SeedTitle}"` : `"${node.EntityName}:${node.RecordID}"`;
    const kindPrefix = node.NodeKind && node.NodeKind !== 'Record' ? `${node.NodeKind} ` : '';
    const targetLabel = `${kindPrefix}"${node.Title}"`;
    const edges = node.PathEdges ?? [];
    if (edges.length === 0) {
        return `${seedLabel} --> ${targetLabel}`;
    }
    const hops = edges.map((edge) => `--[${edge.Label ?? edge.EdgeType} (${edge.Weight.toFixed(2)})]-->`);
    return `${seedLabel} ${hops.join(' ')} ${targetLabel}`;
}

function clampUnit(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
