import { RegisterClass, UUIDSet } from '@memberjunction/global';
import { QueryEngine } from '../../engines/QueryEngine';
import {
    BaseGraphEdgeProvider,
    FormatGraphNodeKey,
    MatchesEdgeTypeFilter,
    type GraphEdgeRequest,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphProviderContext,
} from '../BaseGraphEdgeProvider';

/**
 * Configuration for {@link QueryMetadataEdgeProvider}.
 */
export interface QueryMetadataEdgeProviderConfig {
    Include?: Array<'Reads' | 'Composes'>;
}

/**
 * Metadata-scale derived edge provider that projects `Reads` (`MJ: Queries` $\to$ `MJ: Entities` or
 * `MJ: Entity Alternate Base Views`) and `Composes` (`MJ: Queries` $\to$ `MJ: Queries`) edges from
 * `QueryEngine.Instance` caches with zero additional queries.
 */
@RegisterClass(BaseGraphEdgeProvider, 'QueryMetadataEdgeProvider')
export class QueryMetadataEdgeProvider extends BaseGraphEdgeProvider<QueryMetadataEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return true;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<QueryMetadataEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const includeList = ctx.Config?.Include ?? ['Reads', 'Composes'];
        const includeSet = new Set(includeList);
        const queriesMetaEntity = ctx.Provider.EntityByName('MJ: Queries');
        const entitiesMetaEntity = ctx.Provider.EntityByName('MJ: Entities');
        const abvMetaEntity = ctx.Provider.EntityByName('MJ: Entity Alternate Base Views');

        const frontierQueryIds = new UUIDSet();
        const frontierEntityIds = new UUIDSet();
        const frontierAbvIds = new UUIDSet();
        const hasFrontier = Boolean(request.Nodes && request.Nodes.length > 0);
        if (hasFrontier && request.Nodes) {
            for (const n of request.Nodes) {
                const nameLower = n.EntityName.trim().toLowerCase();
                if (nameLower === 'mj: queries' || nameLower === 'queries') {
                    frontierQueryIds.Add(n.RecordID);
                } else if (nameLower === 'mj: entities' || nameLower === 'entities') {
                    frontierEntityIds.Add(n.RecordID);
                } else if (
                    nameLower === 'mj: entity alternate base views' ||
                    nameLower === 'entity alternate base views'
                ) {
                    frontierAbvIds.Add(n.RecordID);
                }
            }
        }

        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';
        const edges: GraphEdgeView[] = [];

        if (includeSet.has('Reads') && MatchesEdgeTypeFilter('Reads', request.EdgeTypes)) {
            const queryEntities = QueryEngine.Instance.QueryEntities ?? [];
            for (const qe of queryEntities) {
                const queryNode: GraphNodeRef = {
                    EntityName: 'MJ: Queries',
                    EntityID: queriesMetaEntity?.ID,
                    RecordID: qe.QueryID,
                };

                if (qe.AlternateBaseViewID) {
                    const matchFrontier =
                        !hasFrontier ||
                        (wantOut && frontierQueryIds.Has(qe.QueryID)) ||
                        (wantIn && frontierAbvIds.Has(qe.AlternateBaseViewID));
                    if (!matchFrontier) {
                        continue;
                    }
                    const targetNode: GraphNodeRef = {
                        EntityName: 'MJ: Entity Alternate Base Views',
                        EntityID: abvMetaEntity?.ID,
                        RecordID: qe.AlternateBaseViewID,
                    };
                    const sKey = FormatGraphNodeKey(queryNode.EntityID ?? queryNode.EntityName, queryNode.RecordID);
                    const tKey = FormatGraphNodeKey(targetNode.EntityID ?? targetNode.EntityName, targetNode.RecordID);
                    edges.push({
                        ID: `derived:QueryMetadataEdgeProvider:Reads:${sKey}:${tKey}`,
                        GraphName: ctx.Graph.Name,
                        TypeName: 'Reads',
                        InverseTypeName: 'Read By',
                        Source: queryNode,
                        Target: targetNode,
                        IsDirected: true,
                        Weight: 0.8,
                        Description: `Query reads alternate base view`,
                        Attributes: { EntityID: qe.EntityID, AlternateBaseViewID: qe.AlternateBaseViewID },
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    });
                } else if (qe.EntityID) {
                    const matchFrontier =
                        !hasFrontier ||
                        (wantOut && frontierQueryIds.Has(qe.QueryID)) ||
                        (wantIn && frontierEntityIds.Has(qe.EntityID));
                    if (!matchFrontier) {
                        continue;
                    }
                    const targetNode: GraphNodeRef = {
                        EntityName: 'MJ: Entities',
                        EntityID: entitiesMetaEntity?.ID,
                        RecordID: qe.EntityID,
                    };
                    const sKey = FormatGraphNodeKey(queryNode.EntityID ?? queryNode.EntityName, queryNode.RecordID);
                    const tKey = FormatGraphNodeKey(targetNode.EntityID ?? targetNode.EntityName, targetNode.RecordID);
                    edges.push({
                        ID: `derived:QueryMetadataEdgeProvider:Reads:${sKey}:${tKey}`,
                        GraphName: ctx.Graph.Name,
                        TypeName: 'Reads',
                        InverseTypeName: 'Read By',
                        Source: queryNode,
                        Target: targetNode,
                        IsDirected: true,
                        Weight: 0.8,
                        Description: `Query reads entity`,
                        Attributes: { EntityID: qe.EntityID },
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    });
                }
            }
        }

        if (includeSet.has('Composes') && MatchesEdgeTypeFilter('Composes', request.EdgeTypes)) {
            const dependencies = QueryEngine.Instance.QueryDependencies ?? [];
            for (const dep of dependencies) {
                if (!dep.QueryID || !dep.DependsOnQueryID) {
                    continue;
                }
                const matchFrontier =
                    !hasFrontier ||
                    (wantOut && frontierQueryIds.Has(dep.QueryID)) ||
                    (wantIn && frontierQueryIds.Has(dep.DependsOnQueryID));
                if (!matchFrontier) {
                    continue;
                }
                const sourceNode: GraphNodeRef = {
                    EntityName: 'MJ: Queries',
                    EntityID: queriesMetaEntity?.ID,
                    RecordID: dep.QueryID,
                };
                const targetNode: GraphNodeRef = {
                    EntityName: 'MJ: Queries',
                    EntityID: queriesMetaEntity?.ID,
                    RecordID: dep.DependsOnQueryID,
                };
                const sKey = FormatGraphNodeKey(sourceNode.EntityID ?? sourceNode.EntityName, sourceNode.RecordID);
                const tKey = FormatGraphNodeKey(targetNode.EntityID ?? targetNode.EntityName, targetNode.RecordID);
                edges.push({
                    ID: `derived:QueryMetadataEdgeProvider:Composes:${sKey}:${tKey}`,
                    GraphName: ctx.Graph.Name,
                    TypeName: 'Composes',
                    InverseTypeName: 'Composed Into',
                    Source: sourceNode,
                    Target: targetNode,
                    IsDirected: true,
                    Weight: 0.9,
                    Description: dep.ReferencePath ? `Composes ${dep.ReferencePath}` : 'Composes query',
                    Attributes: dep.Alias ? { Alias: dep.Alias } : null,
                    Origin: 'Derived',
                    Status: 'Approved',
                    Confidence: null,
                });
            }
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link QueryMetadataEdgeProvider}. */
export function LoadQueryMetadataEdgeProvider(): void {
    void QueryMetadataEdgeProvider;
}
