/**
 * @fileoverview Semantic Graph search provider (`GraphSearchProvider`) for the SearchEngine RRF pipeline.
 *
 * Bridges free-text search queries to `@memberjunction/graph-engine` (via the pluggable
 * {@link IGraphExpansionService} seam) to discover canonical definitions, governing views/queries,
 * and narrower/broader domain concepts over bounded multi-hop graph traversal.
 *
 * @module @memberjunction/search-engine
 */

import { EntityInfo, IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import {
    ComputeGraphNodeAttenuatedScore,
    CreateCanonGraphExpansionService,
    FormatGraphNodeBreadcrumb,
    GraphEngine,
} from '@memberjunction/core-entities';
import { GetGlobalObjectStore, RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { ScopeConstraints, SearchFilters, SearchResultItem, SearchSource } from './search.types';
import type { LaneKind } from './ScopeExplanation';

/**
 * Shared global store key matching `@memberjunction/ai-core-plus`'s `GRAPH_EXPANSION_SERVICE_GLOBAL_KEY`.
 */
const GRAPH_EXPANSION_SERVICE_KEY = '___SINGLETON__GraphExpansionService';

/**
 * Seed node resolved from a query string or entity/record reference.
 * Mirrors `@memberjunction/ai-core-plus`'s `GraphSeedNode` to avoid a reverse dependency.
 */
export interface GraphSearchSeedNode {
    readonly EntityName: string;
    readonly RecordID: string;
    readonly Title?: string;
    readonly SeedScore?: number;
    readonly GraphName?: string;
}

/**
 * Directed, weighted edge traversed during bounded semantic graph expansion.
 */
export interface GraphSearchExpandedEdge {
    readonly EdgeID?: string;
    readonly FromNodeID: string;
    readonly ToNodeID: string;
    readonly EdgeType: string;
    readonly Weight: number;
    readonly Label?: string;
}

/**
 * Neighbor node returned by bounded semantic graph expansion.
 */
export interface GraphSearchExpandedNode {
    readonly NodeID: string;
    readonly EntityName: string;
    readonly RecordID: string;
    readonly Title: string;
    readonly Snippet?: string;
    readonly GraphName?: string;
    readonly NodeKind?: 'Record' | 'View' | 'Query' | 'Concept';
    readonly Score?: number;
    readonly SeedScore?: number;
    readonly SeedTitle?: string;
    readonly PathEdges?: readonly GraphSearchExpandedEdge[];
    readonly Breadcrumb?: string;
    readonly UnderlyingEntityName?: string;
    readonly AllowedRoleNames?: readonly string[];
    readonly CanReadForUser?: (user: UserInfo) => boolean;
}

/**
 * Parameters passed to {@link IGraphSearchExpansionService.Expand}.
 */
export interface GraphSearchExpansionParams {
    readonly Seeds: readonly GraphSearchSeedNode[];
    readonly GraphNames?: readonly string[];
    readonly MaxDepth?: number;
    readonly MaxNodes?: number;
    readonly MinWeight?: number;
    readonly EdgeTypeFilter?: readonly string[];
    readonly AudienceReaders?: readonly UserInfo[];
}

/**
 * Result returned by {@link IGraphSearchExpansionService.Expand}.
 */
export interface GraphSearchExpansionResult {
    readonly Nodes: readonly GraphSearchExpandedNode[];
    readonly Edges: readonly GraphSearchExpandedEdge[];
}

/**
 * Pluggable graph expansion service seam (compatible with `@memberjunction/ai-core-plus`'s
 * `IGraphExpansionService` and `@memberjunction/graph-engine`'s `GraphEngine`).
 */
export interface IGraphSearchExpansionService {
    ResolveSeeds(
        queryText: string,
        graphNames: readonly string[] | undefined,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<readonly GraphSearchSeedNode[]>;

    Expand(
        params: GraphSearchExpansionParams,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<GraphSearchExpansionResult>;
}

/**
 * Semantic Graph RRF lane in `SearchEngine`.
 *
 * Flow:
 * 1. Resolve initial seed nodes from `query` via `IGraphExpansionService.ResolveSeeds`.
 * 2. Expand bounded neighborhood (`MaxDepth: 2`, `MaxNodes: 25`, `MinWeight: 0.25` by default).
 * 3. Enforce permission and audience visibility intersection across `[contextUser, ...audienceReaders]`.
 * 4. Rank expanded neighbor nodes by path-attenuated edge weight (`product(edge.Weight) * seedScore`)
 *    and emit standardized `SearchResultItem` entries with `SourceType: 'SemanticGraph'` and
 *    human-readable provenance breadcrumbs.
 */
@RegisterClass(BaseSearchProvider, 'GraphSearchProvider')
export class GraphSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'SemanticGraph';
    public override readonly ConsumesLaneKinds: readonly LaneKind[] = ['Entity', 'ExternalIndex'];

    private expansionServiceOverride: IGraphSearchExpansionService | null = null;
    private audienceReaders: readonly UserInfo[] = [];
    private defaultGraphNames: readonly string[] | undefined;
    private maxDepth = 2;
    private maxNodes = 25;
    private minWeight = 0.25;
    private edgeTypeFilter: readonly string[] | undefined;

    constructor(expansionService?: IGraphSearchExpansionService) {
        super();
        if (expansionService) {
            this.expansionServiceOverride = expansionService;
        }
    }

    /**
     * Explicitly set or override the graph expansion service used by this provider instance.
     */
    public set ExpansionService(service: IGraphSearchExpansionService | null) {
        this.expansionServiceOverride = service;
    }

    public get ExpansionService(): IGraphSearchExpansionService | null {
        if (this.expansionServiceOverride) {
            return this.expansionServiceOverride;
        }
        const store = GetGlobalObjectStore();
        const registered = store
            ? (store[GRAPH_EXPANSION_SERVICE_KEY] as IGraphSearchExpansionService | undefined)
            : undefined;
        if (registered) {
            return registered;
        }
        if (GraphEngine.Instance.Graphs.length > 0) {
            return CreateCanonGraphExpansionService();
        }
        return null;
    }

    /**
     * Configure audience readers whose visibility must be intersected with `contextUser`.
     */
    public SetAudienceReaders(readers: readonly UserInfo[] | undefined): void {
        this.audienceReaders = readers ?? [];
    }

    public override async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        await super.Initialize(config, contextUser);
        const providerCfg = config.ProviderConfig;
        if (!providerCfg) {
            return;
        }
        if (Array.isArray(providerCfg['graphNames'])) {
            this.defaultGraphNames = providerCfg['graphNames'].filter((g): g is string => typeof g === 'string');
        }
        if (typeof providerCfg['maxDepth'] === 'number' && providerCfg['maxDepth'] >= 1) {
            this.maxDepth = Math.min(4, Math.floor(providerCfg['maxDepth']));
        }
        if (typeof providerCfg['maxNodes'] === 'number' && providerCfg['maxNodes'] >= 1) {
            this.maxNodes = Math.floor(providerCfg['maxNodes']);
        }
        if (typeof providerCfg['minWeight'] === 'number' && providerCfg['minWeight'] >= 0) {
            this.minWeight = providerCfg['minWeight'];
        }
        if (Array.isArray(providerCfg['edgeTypeFilter'])) {
            this.edgeTypeFilter = providerCfg['edgeTypeFilter'].filter((e): e is string => typeof e === 'string');
        }
    }

    public override IsAvailable(): boolean {
        return this.ExpansionService != null;
    }

    public async Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints,
    ): Promise<SearchResultItem[]> {
        const service = this.ExpansionService;
        if (!service) {
            return [];
        }

        const effectiveQuery = this.resolveEffectiveQuery(query, scopeConstraints);
        if (!effectiveQuery || effectiveQuery.trim().length === 0) {
            return [];
        }

        if (this.isScopeExplicitlyEmpty(scopeConstraints)) {
            return [];
        }

        const graphNames = this.resolveGraphNames(scopeConstraints);
        const maxDepth = this.resolveNumericOption(scopeConstraints, 'maxDepth', this.maxDepth);
        const maxNodes = this.resolveNumericOption(scopeConstraints, 'maxNodes', Math.max(this.maxNodes, topK));
        const minWeight = this.resolveNumericOption(scopeConstraints, 'minWeight', this.minWeight);
        const readers = this.resolveAudienceReaders(scopeConstraints);

        try {
            const seeds = await service.ResolveSeeds(effectiveQuery, graphNames, contextUser, this.Provider);
            if (!seeds || seeds.length === 0) {
                return [];
            }

            const expansion = await service.Expand(
                {
                    Seeds: seeds,
                    GraphNames: graphNames,
                    MaxDepth: maxDepth,
                    MaxNodes: maxNodes,
                    MinWeight: minWeight,
                    EdgeTypeFilter: this.edgeTypeFilter,
                    AudienceReaders: readers,
                },
                contextUser,
                this.Provider,
            );

            return this.buildRankedResults(expansion.Nodes, topK, minWeight, filters, scopeConstraints, contextUser, readers);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`GraphSearchProvider.Search failed: ${msg}`);
            return [];
        }
    }

    private resolveEffectiveQuery(query: string, scopeConstraints: ScopeConstraints | undefined): string {
        const transforms = scopeConstraints?.QueryTransforms;
        if (!transforms) {
            return query;
        }
        return (
            transforms['GraphSearchProvider'] ??
            transforms['SemanticGraph'] ??
            transforms['graph'] ??
            query
        );
    }

    private isScopeExplicitlyEmpty(scopeConstraints: ScopeConstraints | undefined): boolean {
        if (!scopeConstraints) {
            return false;
        }
        const entitiesEmpty = scopeConstraints.Entities !== undefined && scopeConstraints.Entities.length === 0;
        const indexesEmpty =
            scopeConstraints.ExternalIndexes !== undefined && scopeConstraints.ExternalIndexes.length === 0;
        if (entitiesEmpty && (scopeConstraints.ExternalIndexes === undefined || indexesEmpty)) {
            return true;
        }
        return false;
    }

    private resolveGraphNames(scopeConstraints: ScopeConstraints | undefined): readonly string[] | undefined {
        const scopedGraphs = scopeConstraints?.ScopeConfig?.['graphNames'];
        if (Array.isArray(scopedGraphs)) {
            const names = scopedGraphs.filter((g): g is string => typeof g === 'string' && g.trim().length > 0);
            if (names.length > 0) {
                return names;
            }
        }
        return this.defaultGraphNames;
    }

    private resolveNumericOption(
        scopeConstraints: ScopeConstraints | undefined,
        key: string,
        fallback: number,
    ): number {
        const candidate = scopeConstraints?.ScopeConfig?.[key];
        if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
            return candidate;
        }
        return fallback;
    }

    private resolveAudienceReaders(scopeConstraints: ScopeConstraints | undefined): readonly UserInfo[] {
        const scopedReaders = scopeConstraints?.ScopeConfig?.['audienceReaders'];
        if (Array.isArray(scopedReaders)) {
            return [...this.audienceReaders, ...(scopedReaders as UserInfo[])];
        }
        return this.audienceReaders;
    }

    private buildRankedResults(
        nodes: readonly GraphSearchExpandedNode[],
        topK: number,
        minWeight: number,
        filters: SearchFilters | undefined,
        scopeConstraints: ScopeConstraints | undefined,
        contextUser: UserInfo,
        audienceReaders: readonly UserInfo[],
    ): SearchResultItem[] {
        const principals: UserInfo[] = [contextUser, ...audienceReaders];
        const allowedEntities = this.buildAllowedEntitySet(filters, scopeConstraints);
        const scoredItems: SearchResultItem[] = [];

        for (const node of nodes) {
            if (!node.RecordID || !node.EntityName) {
                continue;
            }
            if (allowedEntities && !this.matchesEntityFilter(node, allowedEntities)) {
                continue;
            }
            if (!this.isVisibleToAllPrincipals(node, principals)) {
                continue;
            }

            const score = this.computePathAttenuatedScore(node);
            if (score < minWeight) {
                continue;
            }

            const breadcrumb = this.formatBreadcrumb(node);
            const snippet = node.Snippet ? `${breadcrumb} — ${node.Snippet}` : breadcrumb;

            scoredItems.push({
                ID: node.RecordID,
                EntityName: node.EntityName,
                RecordID: node.RecordID,
                SourceType: 'SemanticGraph',
                ResultType: 'entity-record',
                Title: node.Title,
                Snippet: snippet,
                Score: score,
                ScoreBreakdown: { Graph: score },
                Tags: node.GraphName ? [node.GraphName] : [],
                MatchedAt: new Date(),
                RawMetadata: JSON.stringify({
                    NodeID: node.NodeID,
                    NodeKind: node.NodeKind ?? 'Record',
                    GraphName: node.GraphName,
                    Breadcrumb: breadcrumb,
                    PathEdges: node.PathEdges ?? [],
                }),
            });
        }

        scoredItems.sort((a, b) => b.Score - a.Score);
        return scoredItems.slice(0, topK);
    }

    private buildAllowedEntitySet(
        filters: SearchFilters | undefined,
        scopeConstraints: ScopeConstraints | undefined,
    ): Set<string> | null {
        const filterNames = filters?.EntityNames?.map((n) => n.trim().toLowerCase()).filter(Boolean);
        const scopeNames = scopeConstraints?.Entities?.map((e) => e.EntityName.trim().toLowerCase()).filter(Boolean);

        if (filterNames && filterNames.length > 0 && scopeNames && scopeNames.length > 0) {
            const scopeSet = new Set(scopeNames);
            return new Set(filterNames.filter((n) => scopeSet.has(n)));
        }
        if (filterNames && filterNames.length > 0) {
            return new Set(filterNames);
        }
        if (scopeNames && scopeNames.length > 0) {
            return new Set(scopeNames);
        }
        return null;
    }

    private matchesEntityFilter(node: GraphSearchExpandedNode, allowedEntities: Set<string>): boolean {
        const directMatch = allowedEntities.has(node.EntityName.trim().toLowerCase());
        if (directMatch) {
            return true;
        }
        if (node.UnderlyingEntityName) {
            return allowedEntities.has(node.UnderlyingEntityName.trim().toLowerCase());
        }
        return false;
    }

    private isVisibleToAllPrincipals(node: GraphSearchExpandedNode, principals: readonly UserInfo[]): boolean {
        for (const principal of principals) {
            if (!principal || !principal.ID || !Array.isArray(principal.UserRoles)) {
                return false;
            }
            if (!this.canPrincipalAccessNode(node, principal)) {
                return false;
            }
        }
        return true;
    }

    private canPrincipalAccessNode(node: GraphSearchExpandedNode, principal: UserInfo): boolean {
        if (node.CanReadForUser && !node.CanReadForUser(principal)) {
            return false;
        }

        if (node.AllowedRoleNames && node.AllowedRoleNames.length > 0 && principal.Type !== 'Owner') {
            const principalRoles = new Set(
                principal.UserRoles.map((r) => (r.Role ?? '').trim().toLowerCase()).filter(Boolean),
            );
            const hasAllowedRole = node.AllowedRoleNames.some((role) =>
                principalRoles.has(role.trim().toLowerCase()),
            );
            if (!hasAllowedRole) {
                return false;
            }
        }

        const entityToCheck = node.UnderlyingEntityName ?? node.EntityName;
        return this.canPrincipalReadEntity(entityToCheck, principal);
    }

    private canPrincipalReadEntity(entityName: string, principal: UserInfo): boolean {
        try {
            if (!principal) {
                return false;
            }
            const entities: EntityInfo[] | undefined = this.Provider?.Entities;
            if (!entities || entities.length === 0) {
                return true;
            }
            const entityInfo = entities.find(
                (e) => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase(),
            );
            if (!entityInfo) {
                return true;
            }
            if (principal.Type && principal.Type.trim().toLowerCase() === 'owner') {
                return true;
            }
            if (!Array.isArray(principal.UserRoles) || principal.UserRoles.length === 0) {
                return false;
            }
            if (typeof entityInfo.GetUserPermisions === 'function') {
                const perms = entityInfo.GetUserPermisions(principal);
                return Boolean(perms?.CanRead);
            }
            if (!Array.isArray(entityInfo.Permissions) || entityInfo.Permissions.length === 0) {
                return false;
            }
            const userRoleNames = new Set(
                principal.UserRoles.map((ur) => (ur.Role ?? '').trim().toLowerCase()).filter(Boolean),
            );
            return entityInfo.Permissions.some(
                (perm) => perm.CanRead && userRoleNames.has((perm.Role ?? '').trim().toLowerCase()),
            );
        } catch {
            return false;
        }
    }

    private computePathAttenuatedScore(node: GraphSearchExpandedNode): number {
        return ComputeGraphNodeAttenuatedScore(node);
    }

    private formatBreadcrumb(node: GraphSearchExpandedNode): string {
        return FormatGraphNodeBreadcrumb(node);
    }
}

/**
 * Loader function to ensure {@link GraphSearchProvider} is not tree-shaken out of bundles.
 */
export function LoadGraphSearchProvider(): void {
    // Registration occurs via @RegisterClass decorator when this module is evaluated.
}

