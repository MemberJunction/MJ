import { RunView } from '@memberjunction/core';
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
 * Configuration options for {@link JoinEntityEdgeProvider}.
 */
export interface JoinEntityEdgeProviderConfig {
    /** Junction/bridge entity name (e.g. `'Memberships'`) */
    JoinEntity: string;
    /** Foreign key field on `JoinEntity` pointing to the source entity (e.g. `'PersonID'`) */
    SourceField: string;
    /** Foreign key field on `JoinEntity` pointing to the target entity (e.g. `'OrganizationID'`) */
    TargetField: string;
    /** Graph edge type name to emit (e.g. `'Member Of'`) */
    EdgeType: string;
    /** Optional numeric column on `JoinEntity` supplying edge weight (0.0 to 1.0) */
    WeightField?: string;
    /** Optional additional columns on `JoinEntity` to attach to `Attributes` */
    AttributeFields?: string[];
    /** Optional additional SQL WHERE predicate applied to `JoinEntity` (e.g. `"Status = 'Active'"`) */
    ExtraFilter?: string;
    /** Optional per-expansion row cap (default `200`) */
    MaxRowsPerExpansion?: number;
}

const PROVIDER_CLASS = 'JoinEntityEdgeProvider';

function escapeSqlLiteral(val: string): string {
    return val.replace(/'/g, "''");
}

/**
 * Data-scale edge provider that projects many-to-many relationships across a junction entity
 * into direct `Source -> Target` graph edges using a single batched `RunView` per expansion step.
 */
@RegisterClass(BaseGraphEdgeProvider, PROVIDER_CLASS)
export class JoinEntityEdgeProvider extends BaseGraphEdgeProvider<JoinEntityEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return false;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<JoinEntityEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        if (!config?.JoinEntity || !config?.SourceField || !config?.TargetField || !config?.EdgeType) {
            return [];
        }
        if (!request.Nodes || request.Nodes.length === 0) {
            return [];
        }
        if (
            request.EdgeTypes &&
            request.EdgeTypes.length > 0 &&
            !request.EdgeTypes.some(t => t.trim().toLowerCase() === config.EdgeType.trim().toLowerCase())
        ) {
            return [];
        }

        const joinEntity = ctx.Provider.EntityByName(config.JoinEntity);
        if (!joinEntity) {
            return [];
        }
        const sourceField = joinEntity.Fields.find(
            f => f.Name.trim().toLowerCase() === config.SourceField.trim().toLowerCase(),
        );
        const targetField = joinEntity.Fields.find(
            f => f.Name.trim().toLowerCase() === config.TargetField.trim().toLowerCase(),
        );
        if (!sourceField?.RelatedEntityID || !targetField?.RelatedEntityID) {
            return [];
        }

        const sourceEntity = ctx.Provider.EntityByID(sourceField.RelatedEntityID);
        const targetEntity = ctx.Provider.EntityByID(targetField.RelatedEntityID);
        if (!sourceEntity || !targetEntity) {
            return [];
        }

        const filterClauses = this.buildEndpointClauses(
            request,
            sourceEntity.Name,
            targetEntity.Name,
            sourceField.Name,
            targetField.Name,
        );
        if (filterClauses.length === 0) {
            return [];
        }

        const baseFilter =
            `(${sourceField.Name} IS NOT NULL AND ${targetField.Name} IS NOT NULL) ` +
            `AND (${filterClauses.join(' OR ')})`;
        const extraFilter = config.ExtraFilter?.trim()
            ? `(${baseFilter}) AND (${config.ExtraFilter.trim()})`
            : baseFilter;

        const fields = new Set<string>([sourceField.Name, targetField.Name]);
        if (config.WeightField) {
            fields.add(config.WeightField);
        }
        for (const attrField of config.AttributeFields ?? []) {
            fields.add(attrField);
        }

        const rv = new RunView(ctx.Provider);
        const result = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: joinEntity.Name,
                ExtraFilter: extraFilter,
                Fields: Array.from(fields),
                ResultType: 'simple',
                MaxRows: config.MaxRowsPerExpansion ?? 200,
            },
            ctx.User,
        );

        if (!result.Success || !result.Results) {
            return [];
        }

        const defaultWeight = ctx.ResolveDefaultWeight?.(config.EdgeType, 0.8) ?? 0.8;
        const edgesByID = new Map<string, GraphEdgeView>();

        for (const row of result.Results) {
            const edge = this.rowToEdge(
                row,
                sourceEntity.Name,
                sourceEntity.ID,
                targetEntity.Name,
                targetEntity.ID,
                sourceField.Name,
                targetField.Name,
                defaultWeight,
                ctx,
            );
            if (edge && MatchesGraphEdgeRequest(edge, request)) {
                edgesByID.set(edge.ID, edge);
            }
        }

        return Array.from(edgesByID.values());
    }

    private buildEndpointClauses(
        request: GraphEdgeRequest,
        sourceEntityName: string,
        targetEntityName: string,
        sourceFieldName: string,
        targetFieldName: string,
    ): string[] {
        const nodes = request.Nodes ?? [];
        const direction = request.Direction ?? 'Both';
        const sourceIDs: string[] = [];
        const targetIDs: string[] = [];

        for (const node of nodes) {
            const entityLower = node.EntityName.trim().toLowerCase();
            if (
                (direction === 'Both' || direction === 'Out') &&
                entityLower === sourceEntityName.trim().toLowerCase()
            ) {
                sourceIDs.push(`'${escapeSqlLiteral(node.RecordID)}'`);
            }
            if (
                (direction === 'Both' || direction === 'In') &&
                entityLower === targetEntityName.trim().toLowerCase()
            ) {
                targetIDs.push(`'${escapeSqlLiteral(node.RecordID)}'`);
            }
        }

        const clauses: string[] = [];
        if (sourceIDs.length > 0) {
            clauses.push(`${sourceFieldName} IN (${sourceIDs.join(', ')})`);
        }
        if (targetIDs.length > 0) {
            clauses.push(`${targetFieldName} IN (${targetIDs.join(', ')})`);
        }
        return clauses;
    }

    private rowToEdge(
        row: Record<string, unknown>,
        sourceEntityName: string,
        sourceEntityID: string,
        targetEntityName: string,
        targetEntityID: string,
        sourceFieldName: string,
        targetFieldName: string,
        defaultWeight: number,
        ctx: GraphProviderContext<JoinEntityEdgeProviderConfig>,
    ): GraphEdgeView | null {
        const rawSourceID = row[sourceFieldName];
        const rawTargetID = row[targetFieldName];
        if (rawSourceID == null || rawTargetID == null) {
            return null;
        }
        const sourceRecordID = String(rawSourceID);
        const targetRecordID = String(rawTargetID);
        if (UUIDsEqual(sourceEntityID, targetEntityID) && UUIDsEqual(sourceRecordID, targetRecordID)) {
            return null;
        }

        const config = ctx.Config;
        let weight = defaultWeight;
        if (config.WeightField && row[config.WeightField] != null) {
            const parsed = Number(row[config.WeightField]);
            if (Number.isFinite(parsed)) {
                weight = Math.max(0, Math.min(1, parsed));
            }
        }

        let attributes: Record<string, unknown> | null = null;
        if (config.AttributeFields && config.AttributeFields.length > 0) {
            attributes = {};
            for (const attr of config.AttributeFields) {
                if (attr in row) {
                    attributes[attr] = row[attr];
                }
            }
        }

        const source: GraphNodeRef = { EntityName: sourceEntityName, RecordID: sourceRecordID };
        const target: GraphNodeRef = { EntityName: targetEntityName, RecordID: targetRecordID };

        return {
            ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, config.EdgeType, source, target),
            GraphName: ctx.Graph.Name,
            TypeName: config.EdgeType,
            Source: source,
            Target: target,
            IsDirected: true,
            Weight: weight,
            Description: `via ${config.JoinEntity}`,
            Attributes: attributes,
            Origin: 'Derived',
            Status: 'Approved',
            Confidence: null,
        };
    }
}

/**
 * Tree-shaking anchor for {@link JoinEntityEdgeProvider}.
 */
export function LoadJoinEntityEdgeProvider(): void {
    // Prevents tree-shaking of @RegisterClass decorator
}
