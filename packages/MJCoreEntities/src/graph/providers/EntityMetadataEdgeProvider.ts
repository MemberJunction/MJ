import { EntityInfo } from '@memberjunction/core';
import { NormalizeUUID, RegisterClass, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import {
    BaseGraphEdgeProvider,
    BuildDerivedGraphEdgeID,
    GraphEdgeRequest,
    GraphEdgeView,
    GraphNodeRef,
    GraphProviderContext,
    MatchesGraphEdgeRequest,
} from '../BaseGraphEdgeProvider';

export type EntityMetadataEdgeKind = 'References' | 'IsA' | 'Is A' | 'FieldOf' | 'Field Of';

/**
 * Configuration options for {@link EntityMetadataEdgeProvider}.
 */
export interface EntityMetadataEdgeProviderConfig {
    /**
     * Which entity metadata relationship kinds to project into the graph.
     * Defaults to `['References', 'IsA', 'FieldOf']`.
     */
    Include?: EntityMetadataEdgeKind[];
}

const PROVIDER_CLASS = 'EntityMetadataEdgeProvider';
const EDGE_TYPE_REFERENCES = 'References';
const EDGE_TYPE_IS_A = 'Is A';
const EDGE_TYPE_FIELD_OF = 'Field Of';
const ENTITY_ENTITIES = 'MJ: Entities';
const ENTITY_FIELDS = 'MJ: Entity Fields';

/**
 * Metadata-scale edge provider that projects `MJ: Entities` and `MJ: Entity Fields`
 * structural metadata into graph edges:
 * - `References`: Entity -> Related Entity (via foreign key fields)
 * - `Is A`: Child Entity -> Parent Entity (via IS-A `ParentID`)
 * - `Field Of`: Entity Field -> Owning Entity (for fields referenced by stored edges or explicit frontier nodes)
 */
@RegisterClass(BaseGraphEdgeProvider, PROVIDER_CLASS)
export class EntityMetadataEdgeProvider extends BaseGraphEdgeProvider<EntityMetadataEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return true;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<EntityMetadataEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const includeSet = this.resolveIncludeSet(ctx.Config?.Include);
        const entities = ctx.Provider?.Entities ?? [];
        const edges: GraphEdgeView[] = [];

        const requestedFieldIDs = this.collectRequestedFieldIDs(request, ctx.StoredEdgeFieldIDs);

        for (const entity of entities) {
            if (includeSet.has('isa')) {
                this.appendIsAEdge(entity, request, ctx, edges);
            }
            if (includeSet.has('references')) {
                this.appendReferenceEdges(entity, request, ctx, edges);
            }
            if (includeSet.has('fieldof') && requestedFieldIDs.size > 0) {
                this.appendFieldOfEdges(entity, requestedFieldIDs, request, ctx, edges);
            }
        }

        return edges;
    }

    private resolveIncludeSet(include?: EntityMetadataEdgeKind[]): Set<string> {
        if (!include || include.length === 0) {
            return new Set(['references', 'isa', 'fieldof']);
        }
        const normalized = new Set<string>();
        for (const item of include) {
            normalized.add(item.replace(/\s+/g, '').toLowerCase());
        }
        return normalized;
    }

    private collectRequestedFieldIDs(
        request: GraphEdgeRequest,
        storedEdgeFieldIDs?: ReadonlySet<string>,
    ): Set<string> {
        const result = new Set<string>();
        if (storedEdgeFieldIDs) {
            for (const id of storedEdgeFieldIDs) {
                const norm = NormalizeUUID(id);
                if (norm) {
                    result.add(norm);
                }
            }
        }
        if (request.Nodes) {
            for (const node of request.Nodes) {
                if (node.EntityName.trim().toLowerCase() === ENTITY_FIELDS.toLowerCase()) {
                    const norm = NormalizeUUID(node.RecordID);
                    if (norm) {
                        result.add(norm);
                    }
                }
            }
        }
        return result;
    }

    private appendIsAEdge(
        entity: EntityInfo,
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<EntityMetadataEdgeProviderConfig>,
        edges: GraphEdgeView[],
    ): void {
        if (!entity.ParentID || UUIDsEqual(entity.ParentID, entity.ID)) {
            return;
        }
        const source: GraphNodeRef = { EntityName: ENTITY_ENTITIES, RecordID: entity.ID };
        const target: GraphNodeRef = { EntityName: ENTITY_ENTITIES, RecordID: entity.ParentID };
        const weight = ctx.ResolveDefaultWeight?.(EDGE_TYPE_IS_A, 1.0) ?? 1.0;

        const edge: GraphEdgeView = {
            ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, EDGE_TYPE_IS_A, source, target),
            GraphName: ctx.Graph.Name,
            TypeName: EDGE_TYPE_IS_A,
            Source: source,
            Target: target,
            IsDirected: true,
            Weight: weight,
            Description: `${entity.Name} is a subtype of ${entity.ParentEntityInfo?.Name ?? entity.ParentID}`,
            Attributes: {
                ChildEntity: entity.Name,
                ParentEntityID: entity.ParentID,
            },
            Origin: 'Derived',
            Status: 'Approved',
            Confidence: null,
        };

        if (MatchesGraphEdgeRequest(edge, request)) {
            edges.push(edge);
        }
    }

    private appendReferenceEdges(
        entity: EntityInfo,
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<EntityMetadataEdgeProviderConfig>,
        edges: GraphEdgeView[],
    ): void {
        const fieldsByTarget = new UUIDMap<{ TargetID: string; FieldNames: string[] }>();
        for (const field of entity.Fields ?? []) {
            if (!field.RelatedEntityID || UUIDsEqual(field.RelatedEntityID, entity.ID)) {
                continue;
            }
            let entry = fieldsByTarget.Get(field.RelatedEntityID);
            if (!entry) {
                entry = { TargetID: field.RelatedEntityID, FieldNames: [] };
                fieldsByTarget.Set(field.RelatedEntityID, entry);
            }
            entry.FieldNames.push(field.Name);
        }

        const weight = ctx.ResolveDefaultWeight?.(EDGE_TYPE_REFERENCES, 0.6) ?? 0.6;
        for (const [, entry] of fieldsByTarget) {
            const source: GraphNodeRef = { EntityName: ENTITY_ENTITIES, RecordID: entity.ID };
            const target: GraphNodeRef = { EntityName: ENTITY_ENTITIES, RecordID: entry.TargetID };
            const edge: GraphEdgeView = {
                ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, EDGE_TYPE_REFERENCES, source, target),
                GraphName: ctx.Graph.Name,
                TypeName: EDGE_TYPE_REFERENCES,
                Source: source,
                Target: target,
                IsDirected: true,
                Weight: weight,
                Description: `via ${entry.FieldNames.join(', ')}`,
                Attributes: {
                    FieldNames: entry.FieldNames,
                },
                Origin: 'Derived',
                Status: 'Approved',
                Confidence: null,
            };

            if (MatchesGraphEdgeRequest(edge, request)) {
                edges.push(edge);
            }
        }
    }

    private appendFieldOfEdges(
        entity: EntityInfo,
        requestedFieldIDs: ReadonlySet<string>,
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<EntityMetadataEdgeProviderConfig>,
        edges: GraphEdgeView[],
    ): void {
        const weight = ctx.ResolveDefaultWeight?.(EDGE_TYPE_FIELD_OF, 1.0) ?? 1.0;
        for (const field of entity.Fields ?? []) {
            const normFieldID = NormalizeUUID(field.ID);
            if (!normFieldID || !requestedFieldIDs.has(normFieldID)) {
                continue;
            }

            const source: GraphNodeRef = { EntityName: ENTITY_FIELDS, RecordID: field.ID };
            const target: GraphNodeRef = { EntityName: ENTITY_ENTITIES, RecordID: entity.ID };
            const edge: GraphEdgeView = {
                ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, EDGE_TYPE_FIELD_OF, source, target),
                GraphName: ctx.Graph.Name,
                TypeName: EDGE_TYPE_FIELD_OF,
                Source: source,
                Target: target,
                IsDirected: true,
                Weight: weight,
                Description: `${entity.Name}.${field.Name}`,
                Attributes: {
                    FieldName: field.Name,
                    EntityName: entity.Name,
                },
                Origin: 'Derived',
                Status: 'Approved',
                Confidence: null,
            };

            if (MatchesGraphEdgeRequest(edge, request)) {
                edges.push(edge);
            }
        }
    }
}

/**
 * Tree-shaking anchor for {@link EntityMetadataEdgeProvider}.
 */
export function LoadEntityMetadataEdgeProvider(): void {
    // Prevents tree-shaking of @RegisterClass decorator
}
