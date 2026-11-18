import { RegisterClass, UUIDSet } from '@memberjunction/global';
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
 * Configuration for {@link AlternateBaseViewEdgeProvider}.
 */
export type AlternateBaseViewEdgeProviderConfig = Record<string, unknown>;

/**
 * Metadata-scale derived edge provider that projects `Subsets` edges from each
 * `MJ: Entity Alternate Base Views` record to its owning `MJ: Entities` record (and parent
 * alternate base view when `ParentID` is set) with zero database queries.
 */
@RegisterClass(BaseGraphEdgeProvider, 'AlternateBaseViewEdgeProvider')
export class AlternateBaseViewEdgeProvider extends BaseGraphEdgeProvider<AlternateBaseViewEdgeProviderConfig> {
    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<AlternateBaseViewEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        if (!MatchesEdgeTypeFilter('Subsets', request.EdgeTypes)) {
            return [];
        }

        const entitiesMetaEntity = ctx.Provider.EntityByName('MJ: Entities');
        const abvMetaEntity = ctx.Provider.EntityByName('MJ: Entity Alternate Base Views');

        const frontierEntityIds = new UUIDSet();
        const frontierAbvIds = new UUIDSet();
        if (request.Nodes.length === 0) {
            return [];
        }
        for (const n of request.Nodes) {
            const nameLower = n.EntityName.trim().toLowerCase();
            if (nameLower === 'mj: entities' || nameLower === 'entities') {
                frontierEntityIds.Add(n.RecordID);
            } else if (
                nameLower === 'mj: entity alternate base views' ||
                nameLower === 'entity alternate base views'
            ) {
                frontierAbvIds.Add(n.RecordID);
            }
        }

        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';
        const edges: GraphEdgeView[] = [];

        for (const entity of ctx.Provider.Entities ?? []) {
            for (const abv of entity.AlternateBaseViews ?? []) {
                if (!abv.ID) {
                    continue;
                }
                const abvNode: GraphNodeRef = {
                    EntityName: 'MJ: Entity Alternate Base Views',
                    EntityID: abvMetaEntity?.ID,
                    RecordID: abv.ID,
                };
                const sKey = FormatGraphNodeKey(abvNode.EntityID ?? abvNode.EntityName, abvNode.RecordID);

                const matchEntityFrontier =
                    (wantOut && frontierAbvIds.Has(abv.ID)) ||
                    (wantIn && frontierEntityIds.Has(entity.ID));
                if (matchEntityFrontier) {
                    const entityNode: GraphNodeRef = {
                        EntityName: 'MJ: Entities',
                        EntityID: entitiesMetaEntity?.ID,
                        RecordID: entity.ID,
                    };
                    const tKey = FormatGraphNodeKey(entityNode.EntityID ?? entityNode.EntityName, entityNode.RecordID);

                    edges.push({
                        ID: `derived:AlternateBaseViewEdgeProvider:Subsets:${sKey}:${tKey}`,
                        GraphName: ctx.Graph.Name,
                        TypeName: 'Subsets',
                        InverseTypeName: 'Has Subset',
                        Source: abvNode,
                        Target: entityNode,
                        IsDirected: true,
                        Weight: 1.0,
                        Description: `Alternate view ${entity.Name}.${abv.Name} (${abv.ViewName}) subsets ${entity.Name}`,
                        Attributes: { ViewName: abv.ViewName, Status: abv.Status },
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    });
                }

                if (abv.ParentID) {
                    const matchParentFrontier =
                        (wantOut && frontierAbvIds.Has(abv.ID)) ||
                        (wantIn && frontierAbvIds.Has(abv.ParentID));
                    if (matchParentFrontier) {
                        const parentAbvNode: GraphNodeRef = {
                            EntityName: 'MJ: Entity Alternate Base Views',
                            EntityID: abvMetaEntity?.ID,
                            RecordID: abv.ParentID,
                        };
                        const pKey = FormatGraphNodeKey(
                            parentAbvNode.EntityID ?? parentAbvNode.EntityName,
                            parentAbvNode.RecordID,
                        );
                        edges.push({
                            ID: `derived:AlternateBaseViewEdgeProvider:Subsets:${sKey}:${pKey}`,
                            GraphName: ctx.Graph.Name,
                            TypeName: 'Subsets',
                            InverseTypeName: 'Has Subset',
                            Source: abvNode,
                            Target: parentAbvNode,
                            IsDirected: true,
                            Weight: 0.95,
                            Description: `Alternate view ${entity.Name}.${abv.Name} subsets parent alternate view ${abv.ParentID}`,
                            Attributes: { ViewName: abv.ViewName, Status: abv.Status, ParentID: abv.ParentID },
                            Origin: 'Derived',
                            Status: 'Approved',
                            Confidence: null,
                        });
                    }
                }
            }
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link AlternateBaseViewEdgeProvider}. */
export function LoadAlternateBaseViewEdgeProvider(): void {
    void AlternateBaseViewEdgeProvider;
}
