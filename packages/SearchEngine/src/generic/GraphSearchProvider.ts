/**
 * @fileoverview Semantic Graph search provider (`GraphSearchProvider`) for the SearchEngine RRF pipeline.
 *
 * Resolves seed nodes for the query, expands their bounded neighborhood through the registered
 * {@link IGraphExpansionService} (`@memberjunction/core-entities`, backed by `GraphEngine`), and returns
 * the reached nodes as a `SemanticGraph` lane ranked by hop-attenuated RRF.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, UserInfo } from '@memberjunction/core';
import {
    ClampGraphDepth,
    ClampGraphMaxNodes,
    ComputeGraphPathWeight,
    ComputeGraphRRFScore,
    FormatGraphNodeBreadcrumb,
    GetRegisteredGraphExpansionService,
    type GraphExpandedNode,
    type IGraphExpansionService,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { ScopeConstraints, SearchFilters, SearchResultItem, SearchSource } from './search.types';
import type { LaneKind } from './ScopeExplanation';

/** Default graph lane knobs (`plans/next-gen-ai-agents-and-durable-graphs.md` WS-4.2). */
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_NODES = 25;
const DEFAULT_MIN_WEIGHT = 0.25;

/**
 * Semantic Graph RRF lane in `SearchEngine`.
 *
 * 1. **Seeds**: `IGraphExpansionService.ResolveSeeds` — canon concepts whose name or synonyms match the
 *    query (checked as the caller) and entities named in the query. Content-chunk hits from the other
 *    lanes are not seeds: the engine runs lanes in parallel, so none exist yet when this lane runs.
 * 2. **Expansion**: `Expand` with `MaxDepth 2`, `MaxNodes 25`, `MinWeight 0.25` by default. Visibility is
 *    enforced by the service during traversal for the caller AND every audience reader
 *    (`ScopeConstraints.AudienceReaders`), so this provider does no permission checks of its own; the
 *    engine's permission and audience passes still run on the fused results.
 * 3. **Ranking**: hop-attenuated RRF, `1 / (k + seedRank + 15 × hops) × product(edge.Weight) × seedScore`,
 *    keeping nodes whose path weight (`product(edge.Weight) × seedScore`) is at least `MinWeight`, with a
 *    provenance breadcrumb in the snippet.
 *
 * Available only when a graph expansion service is registered (a server registers one at startup); with
 * no active graph the service returns no seeds, so the lane is a no-op.
 */
@RegisterClass(BaseSearchProvider, 'GraphSearchProvider')
export class GraphSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'SemanticGraph';
    public override readonly ConsumesLaneKinds: readonly LaneKind[] = ['Entity', 'ExternalIndex'];

    private expansionServiceOverride: IGraphExpansionService | null = null;
    private defaultGraphNames: readonly string[] | undefined;
    private maxDepth = DEFAULT_MAX_DEPTH;
    private maxNodes = DEFAULT_MAX_NODES;
    private minWeight = DEFAULT_MIN_WEIGHT;
    private edgeTypeFilter: readonly string[] | undefined;

    constructor(expansionService?: IGraphExpansionService) {
        super();
        if (expansionService) {
            this.expansionServiceOverride = expansionService;
        }
    }

    /** The service this lane expands through: an explicit override, else the registered one. */
    public get ExpansionService(): IGraphExpansionService | null {
        return this.expansionServiceOverride ?? GetRegisteredGraphExpansionService();
    }

    public set ExpansionService(service: IGraphExpansionService | null) {
        this.expansionServiceOverride = service;
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
        if (typeof providerCfg['maxDepth'] === 'number') {
            this.maxDepth = ClampGraphDepth(providerCfg['maxDepth']);
        }
        if (typeof providerCfg['maxNodes'] === 'number') {
            this.maxNodes = ClampGraphMaxNodes(providerCfg['maxNodes']);
        }
        if (typeof providerCfg['minWeight'] === 'number' && providerCfg['minWeight'] >= 0) {
            this.minWeight = Math.min(1, providerCfg['minWeight']);
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
        const effectiveQuery = this.resolveEffectiveQuery(query, scopeConstraints);
        if (!service || !contextUser || !effectiveQuery.trim() || this.isScopeExplicitlyEmpty(scopeConstraints)) {
            return [];
        }

        const graphNames = this.resolveGraphNames(scopeConstraints);
        const minWeight = Math.min(1, this.resolveNumericOption(scopeConstraints, 'minWeight', this.minWeight));
        try {
            const seeds = await service.ResolveSeeds(effectiveQuery, graphNames, contextUser, this.Provider, scopeConstraints?.AudienceReaders);
            if (seeds.length === 0) {
                return [];
            }
            const expansion = await service.Expand(
                {
                    Seeds: seeds,
                    GraphNames: graphNames,
                    MaxDepth: ClampGraphDepth(this.resolveNumericOption(scopeConstraints, 'maxDepth', this.maxDepth)),
                    MaxNodes: ClampGraphMaxNodes(this.resolveNumericOption(scopeConstraints, 'maxNodes', Math.max(this.maxNodes, topK))),
                    MinWeight: minWeight,
                    EdgeTypeFilter: this.edgeTypeFilter,
                    AudienceReaders: scopeConstraints?.AudienceReaders,
                },
                contextUser,
                this.Provider,
            );
            return this.buildRankedResults(expansion.Nodes, topK, minWeight, filters, scopeConstraints);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`GraphSearchProvider.Search failed: ${msg}`);
            return [];
        }
    }

    private resolveEffectiveQuery(query: string, scopeConstraints: ScopeConstraints | undefined): string {
        const transforms = scopeConstraints?.QueryTransforms;
        return transforms?.['GraphSearchProvider'] ?? transforms?.['SemanticGraph'] ?? transforms?.['graph'] ?? query ?? '';
    }

    private isScopeExplicitlyEmpty(scopeConstraints: ScopeConstraints | undefined): boolean {
        if (!scopeConstraints) {
            return false;
        }
        const entitiesEmpty = scopeConstraints.Entities !== undefined && scopeConstraints.Entities.length === 0;
        const indexesEmpty = scopeConstraints.ExternalIndexes !== undefined && scopeConstraints.ExternalIndexes.length === 0;
        return entitiesEmpty && (scopeConstraints.ExternalIndexes === undefined || indexesEmpty);
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

    private resolveNumericOption(scopeConstraints: ScopeConstraints | undefined, key: string, fallback: number): number {
        const candidate = scopeConstraints?.ScopeConfig?.[key];
        return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : fallback;
    }

    private buildRankedResults(
        nodes: readonly GraphExpandedNode[],
        topK: number,
        minWeight: number,
        filters: SearchFilters | undefined,
        scopeConstraints: ScopeConstraints | undefined,
    ): SearchResultItem[] {
        const allowedEntities = this.buildAllowedEntitySet(filters, scopeConstraints);
        const ranked: Array<{ Item: SearchResultItem; NodeID: string }> = [];
        for (const node of nodes) {
            if (!node.RecordID || !node.EntityName) {
                continue;
            }
            if (allowedEntities && !allowedEntities.has(node.EntityName.trim().toLowerCase())) {
                continue;
            }
            if (ComputeGraphPathWeight(node) < minWeight) {
                continue;
            }
            ranked.push({ Item: this.toResultItem(node), NodeID: node.NodeID });
        }
        ranked.sort((a, b) => b.Item.Score - a.Item.Score || (a.NodeID < b.NodeID ? -1 : a.NodeID > b.NodeID ? 1 : 0));
        return ranked.slice(0, topK).map((r) => r.Item);
    }

    private toResultItem(node: GraphExpandedNode): SearchResultItem {
        const score = ComputeGraphRRFScore(node);
        const breadcrumb = FormatGraphNodeBreadcrumb(node);
        return {
            ID: node.RecordID,
            EntityName: node.EntityName,
            RecordID: node.RecordID,
            SourceType: 'SemanticGraph',
            ResultType: 'entity-record',
            Title: node.Title,
            Snippet: node.Snippet ? `${breadcrumb} — ${node.Snippet}` : breadcrumb,
            Score: score,
            ScoreBreakdown: { Graph: score },
            Tags: node.GraphName ? [node.GraphName] : [],
            MatchedAt: new Date(),
            RawMetadata: JSON.stringify({
                NodeID: node.NodeID,
                NodeKind: node.NodeKind ?? 'Record',
                GraphName: node.GraphName,
                Breadcrumb: breadcrumb,
                PathWeight: ComputeGraphPathWeight(node),
                PathEdges: node.PathEdges ?? [],
            }),
        };
    }

    private buildAllowedEntitySet(filters: SearchFilters | undefined, scopeConstraints: ScopeConstraints | undefined): Set<string> | null {
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
}

/**
 * Loader function to ensure {@link GraphSearchProvider} is not tree-shaken out of bundles.
 */
export function LoadGraphSearchProvider(): void {
    void GraphSearchProvider;
}
