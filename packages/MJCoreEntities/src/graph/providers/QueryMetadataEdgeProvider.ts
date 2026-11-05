import { IndexByUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { QueryEngine } from '../../engines/QueryEngine';
import { MJQueryDependencyEntity, MJQueryEntityEntity } from '../../generated/entity_subclasses';
import { MJQueryEntityExtended } from '../../custom/MJQueryEntityExtended';
import {
    BaseGraphEdgeProvider,
    BuildDerivedGraphEdgeID,
    GraphEdgeRequest,
    GraphEdgeView,
    GraphNodeRef,
    GraphProviderContext,
    MatchesGraphEdgeRequest,
} from '../BaseGraphEdgeProvider';

export type QueryMetadataEdgeKind = 'Reads' | 'Composes';

/**
 * Configuration options for {@link QueryMetadataEdgeProvider}.
 */
export interface QueryMetadataEdgeProviderConfig {
    /**
     * Which query relationship kinds to project into the graph.
     * Defaults to `['Reads', 'Composes']`.
     */
    Include?: QueryMetadataEdgeKind[];
    /**
     * When `true`, includes non-Approved queries in addition to Approved queries.
     * Defaults to `false` (`Approved` queries only).
     */
    IncludeUnapproved?: boolean;
}

const PROVIDER_CLASS = 'QueryMetadataEdgeProvider';
const EDGE_TYPE_READS = 'Reads';
const EDGE_TYPE_COMPOSES = 'Composes';
const ENTITY_QUERIES = 'MJ: Queries';
const ENTITY_ENTITIES = 'MJ: Entities';
const ENTITY_ALTERNATE_BASE_VIEWS = 'MJ: Entity Alternate Base Views';

/**
 * Metadata-scale edge provider that projects `MJ: Query Entities` and `MJ: Query Dependencies`
 * from `QueryEngine` into graph edges:
 * - `Reads`: Query -> Entity Alternate Base View (when `AlternateBaseViewID` is set) or Query -> Entity
 * - `Composes`: Query -> DependsOnQuery (`{{query:"..."}}` composition)
 */
@RegisterClass(BaseGraphEdgeProvider, PROVIDER_CLASS)
export class QueryMetadataEdgeProvider extends BaseGraphEdgeProvider<QueryMetadataEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return true;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<QueryMetadataEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const includeSet = this.resolveIncludeSet(ctx.Config?.Include);
        const includeUnapproved = ctx.Config?.IncludeUnapproved === true;

        const queries = QueryEngine.Instance.Queries ?? [];
        const queriesByID = IndexByUUID(queries);
        const edgesByID = new Map<string, GraphEdgeView>();

        if (includeSet.has('reads')) {
            const queryEntities = QueryEngine.Instance.QueryEntities ?? [];
            for (const qe of queryEntities) {
                const query = queriesByID.Get(qe.QueryID);
                if (!this.isQueryEligible(query, includeUnapproved)) {
                    continue;
                }
                const edge = this.buildReadsEdge(qe, query!, ctx);
                if (edge && MatchesGraphEdgeRequest(edge, request)) {
                    edgesByID.set(edge.ID, edge);
                }
            }
        }

        if (includeSet.has('composes')) {
            const dependencies = QueryEngine.Instance.Dependencies ?? [];
            for (const dep of dependencies) {
                const sourceQuery = queriesByID.Get(dep.QueryID);
                const targetQuery = queriesByID.Get(dep.DependsOnQueryID);
                if (
                    !this.isQueryEligible(sourceQuery, includeUnapproved) ||
                    !this.isQueryEligible(targetQuery, includeUnapproved)
                ) {
                    continue;
                }
                const edge = this.buildComposesEdge(dep, sourceQuery!, targetQuery!, ctx);
                if (edge && MatchesGraphEdgeRequest(edge, request)) {
                    edgesByID.set(edge.ID, edge);
                }
            }
        }

        return Array.from(edgesByID.values());
    }

    private resolveIncludeSet(include?: QueryMetadataEdgeKind[]): Set<string> {
        if (!include || include.length === 0) {
            return new Set(['reads', 'composes']);
        }
        return new Set(include.map(i => i.trim().toLowerCase()));
    }

    private isQueryEligible(
        query: MJQueryEntityExtended | undefined,
        includeUnapproved: boolean,
    ): boolean {
        if (!query) {
            return false;
        }
        return includeUnapproved || query.Status === 'Approved';
    }

    private buildReadsEdge(
        qe: MJQueryEntityEntity,
        query: MJQueryEntityExtended,
        ctx: GraphProviderContext<QueryMetadataEdgeProviderConfig>,
    ): GraphEdgeView | null {
        if (!qe.EntityID) {
            return null;
        }
        const source: GraphNodeRef = {
            EntityName: ENTITY_QUERIES,
            RecordID: query.ID,
        };
        const target: GraphNodeRef = qe.AlternateBaseViewID
            ? {
                  EntityName: ENTITY_ALTERNATE_BASE_VIEWS,
                  RecordID: qe.AlternateBaseViewID,
              }
            : {
                  EntityName: ENTITY_ENTITIES,
                  RecordID: qe.EntityID,
              };

        const weight = ctx.ResolveDefaultWeight?.(EDGE_TYPE_READS, 0.8) ?? 0.8;
        const targetLabel = qe.AlternateBaseView
            ? `${qe.Entity}.${qe.AlternateBaseView}`
            : qe.Entity || qe.EntityID;

        return {
            ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, EDGE_TYPE_READS, source, target),
            GraphName: ctx.Graph.Name,
            TypeName: EDGE_TYPE_READS,
            Source: source,
            Target: target,
            IsDirected: true,
            Weight: weight,
            Description: `${query.Name} reads ${targetLabel}`,
            Attributes: {
                DetectionMethod: qe.DetectionMethod,
                EntityID: qe.EntityID,
                AlternateBaseViewID: qe.AlternateBaseViewID ?? null,
            },
            Origin: 'Derived',
            Status: 'Approved',
            Confidence: qe.AutoDetectConfidenceScore ?? null,
        };
    }

    private buildComposesEdge(
        dep: MJQueryDependencyEntity,
        sourceQuery: MJQueryEntityExtended,
        targetQuery: MJQueryEntityExtended,
        ctx: GraphProviderContext<QueryMetadataEdgeProviderConfig>,
    ): GraphEdgeView | null {
        if (UUIDsEqual(sourceQuery.ID, targetQuery.ID)) {
            return null;
        }
        const source: GraphNodeRef = {
            EntityName: ENTITY_QUERIES,
            RecordID: sourceQuery.ID,
        };
        const target: GraphNodeRef = {
            EntityName: ENTITY_QUERIES,
            RecordID: targetQuery.ID,
        };
        const weight = ctx.ResolveDefaultWeight?.(EDGE_TYPE_COMPOSES, 0.9) ?? 0.9;
        const description = dep.Alias
            ? `as ${dep.Alias} (${dep.ReferencePath})`
            : dep.ReferencePath || `${sourceQuery.Name} composes ${targetQuery.Name}`;

        return {
            ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, EDGE_TYPE_COMPOSES, source, target),
            GraphName: ctx.Graph.Name,
            TypeName: EDGE_TYPE_COMPOSES,
            Source: source,
            Target: target,
            IsDirected: true,
            Weight: weight,
            Description: description,
            Attributes: {
                ReferencePath: dep.ReferencePath,
                Alias: dep.Alias,
                DetectionMethod: dep.DetectionMethod,
            },
            Origin: 'Derived',
            Status: 'Approved',
            Confidence: null,
        };
    }
}

/**
 * Tree-shaking anchor for {@link QueryMetadataEdgeProvider}.
 */
export function LoadQueryMetadataEdgeProvider(): void {
    // Prevents tree-shaking of @RegisterClass decorator
}
