import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    BaseGraphEdgeProvider,
    BuildDerivedGraphEdgeID,
    GraphEdgeRequest,
    GraphEdgeView,
    GraphNodeRef,
    GraphProviderContext,
    MatchesGraphEdgeRequest,
} from '../BaseGraphEdgeProvider';

/**
 * Configuration options for {@link AlternateBaseViewEdgeProvider}.
 */
export interface AlternateBaseViewEdgeProviderConfig {
    /**
     * When `true`, includes `Deprecated` alternate base views in addition to `Active` views.
     * Defaults to `false` (`Active` only).
     */
    IncludeDeprecated?: boolean;
}

const PROVIDER_CLASS = 'AlternateBaseViewEdgeProvider';
const EDGE_TYPE_SUBSETS = 'Subsets';
const ENTITY_ALTERNATE_BASE_VIEWS = 'MJ: Entity Alternate Base Views';
const ENTITY_ENTITIES = 'MJ: Entities';

/**
 * Metadata-scale edge provider that projects `MJ: Entity Alternate Base Views` rows into
 * `Subsets` edges pointing to their owning `MJ: Entities` row (and to their parent
 * alternate base view when `ParentID` is populated).
 */
@RegisterClass(BaseGraphEdgeProvider, PROVIDER_CLASS)
export class AlternateBaseViewEdgeProvider extends BaseGraphEdgeProvider<AlternateBaseViewEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return true;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<AlternateBaseViewEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const includeDeprecated = ctx.Config?.IncludeDeprecated === true;
        const graphName = ctx.Graph.Name;
        const defaultWeight = ctx.ResolveDefaultWeight?.(EDGE_TYPE_SUBSETS, 1.0) ?? 1.0;
        const edges: GraphEdgeView[] = [];

        const entities = ctx.Provider?.Entities ?? [];
        for (const entity of entities) {
            const alternateViews = entity.AlternateBaseViews ?? [];
            for (const abv of alternateViews) {
                const isEligible = includeDeprecated
                    ? abv.IsUsable
                    : abv.Status === 'Active';
                if (!isEligible) {
                    continue;
                }

                const source: GraphNodeRef = {
                    EntityName: ENTITY_ALTERNATE_BASE_VIEWS,
                    RecordID: abv.ID,
                };
                const targetEntity: GraphNodeRef = {
                    EntityName: ENTITY_ENTITIES,
                    RecordID: entity.ID,
                };
                const description =
                    abv.Description?.trim() ||
                    `${abv.EffectiveDisplayName} (${abv.ViewName}) is a canonical row subset of ${entity.Name}`;

                const entityEdge: GraphEdgeView = {
                    ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, EDGE_TYPE_SUBSETS, source, targetEntity),
                    GraphName: graphName,
                    TypeName: EDGE_TYPE_SUBSETS,
                    Source: source,
                    Target: targetEntity,
                    IsDirected: true,
                    Weight: defaultWeight,
                    Description: description,
                    Attributes: {
                        ViewName: abv.ViewName,
                        SchemaName: abv.EffectiveSchemaName,
                        EntityName: entity.Name,
                        AlternateBaseViewName: abv.Name,
                    },
                    Origin: 'Derived',
                    Status: 'Approved',
                    Confidence: null,
                };

                if (MatchesGraphEdgeRequest(entityEdge, request)) {
                    edges.push(entityEdge);
                }

                if (abv.ParentID && !UUIDsEqual(abv.ParentID, abv.ID)) {
                    const parentTarget: GraphNodeRef = {
                        EntityName: ENTITY_ALTERNATE_BASE_VIEWS,
                        RecordID: abv.ParentID,
                    };
                    const parentEdge: GraphEdgeView = {
                        ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, EDGE_TYPE_SUBSETS, source, parentTarget),
                        GraphName: graphName,
                        TypeName: EDGE_TYPE_SUBSETS,
                        Source: source,
                        Target: parentTarget,
                        IsDirected: true,
                        Weight: defaultWeight,
                        Description: `${abv.EffectiveDisplayName} subsets parent alternate base view ${abv.Parent ?? abv.ParentID}`,
                        Attributes: {
                            ViewName: abv.ViewName,
                            ParentAlternateBaseViewID: abv.ParentID,
                        },
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    };
                    if (MatchesGraphEdgeRequest(parentEdge, request)) {
                        edges.push(parentEdge);
                    }
                }
            }
        }

        return edges;
    }
}

/**
 * Tree-shaking anchor for {@link AlternateBaseViewEdgeProvider}.
 */
export function LoadAlternateBaseViewEdgeProvider(): void {
    // Prevents tree-shaking of @RegisterClass decorator
}
