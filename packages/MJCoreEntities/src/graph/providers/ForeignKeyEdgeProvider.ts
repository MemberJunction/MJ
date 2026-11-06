import { RunView } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
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
 * Configuration for {@link ForeignKeyEdgeProvider}.
 */
export interface ForeignKeyEdgeProviderConfig {
    EntityName?: string;
    SourceEntity?: string;
    ForeignKeyField: string;
    TargetEntity?: string;
    EdgeType?: string;
    EdgeTypeName?: string;
    Weight?: number;
    Reverse?: boolean;
    MaxRowsPerStep?: number;
}

/**
 * Projects derived edges from a foreign-key column on a business or metadata entity
 * (e.g., `Invoices.MemberID` $\to$ `Members`). Batches one `RunView` per expansion step under `ctx.User`.
 */
@RegisterClass(BaseGraphEdgeProvider, 'ForeignKeyEdgeProvider')
export class ForeignKeyEdgeProvider extends BaseGraphEdgeProvider<ForeignKeyEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return false;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<ForeignKeyEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        const sourceEntityName = config?.EntityName ?? config?.SourceEntity;
        if (!sourceEntityName || !config?.ForeignKeyField) {
            return [];
        }
        const edgeType = config.EdgeType?.trim() || config.EdgeTypeName?.trim() || 'References';
        if (!MatchesEdgeTypeFilter(edgeType, request.EdgeTypes)) {
            return [];
        }
        if (!request.Nodes || request.Nodes.length === 0) {
            return [];
        }

        const sourceEntityInfo = ctx.Provider.EntityByName(sourceEntityName);
        if (!sourceEntityInfo) {
            return [];
        }
        const fkField = sourceEntityInfo.Fields.find(
            (f) => f.Name.trim().toLowerCase() === config.ForeignKeyField.trim().toLowerCase(),
        );
        const relatedEntityName = config.TargetEntity ?? fkField?.RelatedEntity;
        if (!fkField || !relatedEntityName) {
            return [];
        }
        const targetEntityInfo = ctx.Provider.EntityByName(relatedEntityName);
        if (!targetEntityInfo) {
            return [];
        }

        const pkFieldName = sourceEntityInfo.FirstPrimaryKey.Name; // first-pk-ok: Graph node keys address single-PK or URL-segment records via FirstPrimaryKey
        const sourceNodeIds: string[] = [];
        const targetNodeIds: string[] = [];

        for (const node of request.Nodes) {
            const matchesSource =
                node.EntityName.trim().toLowerCase() === sourceEntityInfo.Name.trim().toLowerCase() ||
                (node.EntityID != null && UUIDsEqual(node.EntityID, sourceEntityInfo.ID));
            const matchesTarget =
                node.EntityName.trim().toLowerCase() === targetEntityInfo.Name.trim().toLowerCase() ||
                (node.EntityID != null && UUIDsEqual(node.EntityID, targetEntityInfo.ID));

            if (matchesSource) {
                sourceNodeIds.push(node.RecordID);
            }
            if (matchesTarget) {
                targetNodeIds.push(node.RecordID);
            }
        }

        const predicates: string[] = [];
        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';

        const checkSourceIds = config.Reverse ? wantIn : wantOut;
        const checkTargetIds = config.Reverse ? wantOut : wantIn;

        if (checkSourceIds && sourceNodeIds.length > 0) {
            const quoted = sourceNodeIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
            predicates.push(`[${pkFieldName}] IN (${quoted})`);
        }
        if (checkTargetIds && targetNodeIds.length > 0) {
            const quoted = targetNodeIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
            predicates.push(`[${fkField.Name}] IN (${quoted})`);
        }

        if (predicates.length === 0) {
            return [];
        }

        const filter = `([${fkField.Name}] IS NOT NULL) AND (${predicates.join(' OR ')})`;
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const runResult = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: sourceEntityInfo.Name,
                ExtraFilter: filter,
                Fields: [pkFieldName, fkField.Name],
                ResultType: 'simple',
                MaxRows: config.MaxRowsPerStep ?? 200,
            },
            ctx.User,
        );

        if (!runResult.Success || !Array.isArray(runResult.Results)) {
            return [];
        }

        const weight = typeof config.Weight === 'number' ? config.Weight : 0.6;
        const edges: GraphEdgeView[] = [];

        for (const row of runResult.Results) {
            const rawPk = row[pkFieldName];
            const rawFk = row[fkField.Name];
            if (rawPk == null || rawFk == null) {
                continue;
            }
            const fromNode: GraphNodeRef = config.Reverse
                ? { EntityName: targetEntityInfo.Name, EntityID: targetEntityInfo.ID, RecordID: String(rawFk) }
                : { EntityName: sourceEntityInfo.Name, EntityID: sourceEntityInfo.ID, RecordID: String(rawPk) };
            const toNode: GraphNodeRef = config.Reverse
                ? { EntityName: sourceEntityInfo.Name, EntityID: sourceEntityInfo.ID, RecordID: String(rawPk) }
                : { EntityName: targetEntityInfo.Name, EntityID: targetEntityInfo.ID, RecordID: String(rawFk) };

            const sourceKey = FormatGraphNodeKey(fromNode.EntityID ?? fromNode.EntityName, fromNode.RecordID);
            const targetKey = FormatGraphNodeKey(toNode.EntityID ?? toNode.EntityName, toNode.RecordID);

            edges.push({
                ID: `derived:ForeignKeyEdgeProvider:${edgeType}:${sourceKey}:${targetKey}`,
                GraphName: ctx.Graph.Name,
                TypeName: edgeType,
                Source: fromNode,
                Target: toNode,
                IsDirected: true,
                Weight: weight,
                Description: `${sourceEntityInfo.Name}.${fkField.Name} -> ${targetEntityInfo.Name}`,
                Attributes: { ForeignKeyField: fkField.Name },
                Origin: 'Derived',
                Status: 'Approved',
                Confidence: null,
            });
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link ForeignKeyEdgeProvider}. */
export function LoadForeignKeyEdgeProvider(): void {
    void ForeignKeyEdgeProvider;
}
