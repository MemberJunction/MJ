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
 * Configuration for {@link EntityMetadataEdgeProvider}.
 */
export interface EntityMetadataEdgeProviderConfig {
    Include?: Array<'References' | 'IsA' | 'FieldOf'>;
}

/**
 * Metadata-scale derived edge provider that projects `References` (FK), `Is A` (IS-A parent),
 * and `Field Of` edges directly from loaded `ctx.Provider.Entities` metadata with zero database queries.
 */
@RegisterClass(BaseGraphEdgeProvider, 'EntityMetadataEdgeProvider')
export class EntityMetadataEdgeProvider extends BaseGraphEdgeProvider<EntityMetadataEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return true;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<EntityMetadataEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const includeList = ctx.Config?.Include ?? ['References', 'IsA', 'FieldOf'];
        const includeSet = new Set(includeList);
        const entities = ctx.Provider.Entities ?? [];
        const entitiesMetaEntity = ctx.Provider.EntityByName('MJ: Entities');
        const fieldsMetaEntity = ctx.Provider.EntityByName('MJ: Entity Fields');

        const frontierEntityIds = new UUIDSet();
        const frontierFieldIds = new UUIDSet();
        const hasFrontier = Boolean(request.Nodes && request.Nodes.length > 0);
        if (hasFrontier && request.Nodes) {
            for (const n of request.Nodes) {
                const nameLower = n.EntityName.trim().toLowerCase();
                if (nameLower === 'mj: entities' || nameLower === 'entities') {
                    frontierEntityIds.Add(n.RecordID);
                } else if (nameLower === 'mj: entity fields' || nameLower === 'entity fields') {
                    frontierFieldIds.Add(n.RecordID);
                }
            }
        }

        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';
        const edges: GraphEdgeView[] = [];

        for (const entity of entities) {
            const entityNode: GraphNodeRef = {
                EntityName: 'MJ: Entities',
                EntityID: entitiesMetaEntity?.ID,
                RecordID: entity.ID,
            };

            // 1. Is A (Entity -> ParentEntity)
            if (includeSet.has('IsA') && entity.ParentID && MatchesEdgeTypeFilter('Is A', request.EdgeTypes)) {
                const matchFrontier =
                    !hasFrontier ||
                    (wantOut && frontierEntityIds.Has(entity.ID)) ||
                    (wantIn && frontierEntityIds.Has(entity.ParentID));
                if (matchFrontier) {
                    const parentNode: GraphNodeRef = {
                        EntityName: 'MJ: Entities',
                        EntityID: entitiesMetaEntity?.ID,
                        RecordID: entity.ParentID,
                    };
                    const sKey = FormatGraphNodeKey(entityNode.EntityID ?? entityNode.EntityName, entityNode.RecordID);
                    const tKey = FormatGraphNodeKey(parentNode.EntityID ?? parentNode.EntityName, parentNode.RecordID);
                    edges.push({
                        ID: `derived:EntityMetadataEdgeProvider:Is A:${sKey}:${tKey}`,
                        GraphName: ctx.Graph.Name,
                        TypeName: 'Is A',
                        InverseTypeName: 'Has Subtype',
                        Source: entityNode,
                        Target: parentNode,
                        IsDirected: true,
                        Weight: 1.0,
                        Description: `${entity.Name} IS-A ${entity.ParentEntityInfo?.Name ?? entity.ParentID}`,
                        Attributes: null,
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    });
                }
            }

            for (const field of entity.Fields ?? []) {
                // 2. References (Entity -> RelatedEntity via FK field)
                if (
                    includeSet.has('References') &&
                    field.RelatedEntityID &&
                    MatchesEdgeTypeFilter('References', request.EdgeTypes)
                ) {
                    const matchFrontier =
                        !hasFrontier ||
                        (wantOut && frontierEntityIds.Has(entity.ID)) ||
                        (wantIn && frontierEntityIds.Has(field.RelatedEntityID));
                    if (matchFrontier) {
                        const targetNode: GraphNodeRef = {
                            EntityName: 'MJ: Entities',
                            EntityID: entitiesMetaEntity?.ID,
                            RecordID: field.RelatedEntityID,
                        };
                        const sKey = FormatGraphNodeKey(
                            entityNode.EntityID ?? entityNode.EntityName,
                            entityNode.RecordID,
                        );
                        const tKey = FormatGraphNodeKey(
                            targetNode.EntityID ?? targetNode.EntityName,
                            targetNode.RecordID,
                        );
                        edges.push({
                            ID: `derived:EntityMetadataEdgeProvider:References:${sKey}:${tKey}:${field.Name}`,
                            GraphName: ctx.Graph.Name,
                            TypeName: 'References',
                            InverseTypeName: 'Referenced By',
                            Source: entityNode,
                            Target: targetNode,
                            IsDirected: true,
                            Weight: 0.6,
                            Description: `${entity.Name}.${field.Name} references ${field.RelatedEntity ?? field.RelatedEntityID}`,
                            Attributes: { FieldName: field.Name, FieldID: field.ID },
                            Origin: 'Derived',
                            Status: 'Approved',
                            Confidence: null,
                        });
                    }
                }

                // 3. Field Of (Entity Field -> Entity) — only when expanding around a field or enumerating when requested
                if (
                    includeSet.has('FieldOf') &&
                    MatchesEdgeTypeFilter('Field Of', request.EdgeTypes) &&
                    hasFrontier &&
                    ((wantOut && frontierFieldIds.Has(field.ID)) ||
                        (wantIn && frontierFieldIds.Size > 0 && frontierEntityIds.Has(entity.ID)))
                ) {
                    const fieldNode: GraphNodeRef = {
                        EntityName: 'MJ: Entity Fields',
                        EntityID: fieldsMetaEntity?.ID,
                        RecordID: field.ID,
                    };
                    const sKey = FormatGraphNodeKey(fieldNode.EntityID ?? fieldNode.EntityName, fieldNode.RecordID);
                    const tKey = FormatGraphNodeKey(entityNode.EntityID ?? entityNode.EntityName, entityNode.RecordID);
                    edges.push({
                        ID: `derived:EntityMetadataEdgeProvider:Field Of:${sKey}:${tKey}`,
                        GraphName: ctx.Graph.Name,
                        TypeName: 'Field Of',
                        InverseTypeName: 'Has Field',
                        Source: fieldNode,
                        Target: entityNode,
                        IsDirected: true,
                        Weight: 1.0,
                        Description: `${entity.Name}.${field.Name} is a field of ${entity.Name}`,
                        Attributes: { FieldName: field.Name },
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    });
                }
            }
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link EntityMetadataEdgeProvider}. */
export function LoadEntityMetadataEdgeProvider(): void {
    void EntityMetadataEdgeProvider;
}
