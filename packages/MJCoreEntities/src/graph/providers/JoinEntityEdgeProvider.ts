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
 * Configuration for {@link JoinEntityEdgeProvider}.
 */
export interface JoinEntityEdgeProviderConfig {
    JoinEntity: string;
    SourceField: string;
    TargetField: string;
    EdgeType?: string;
    EdgeTypeName?: string;
    SourceEntity?: string;
    TargetEntity?: string;
    WeightField?: string;
    DefaultWeight?: number;
    AttributeFields?: string[];
    MaxRowsPerStep?: number;
}

/**
 * Projects derived many-to-many edges through a join entity (e.g., `Person` $\to$ `Organization`
 * `"Member Of"` via `Memberships`). Batches one `RunView` per expansion step under `ctx.User`.
 */
@RegisterClass(BaseGraphEdgeProvider, 'JoinEntityEdgeProvider')
export class JoinEntityEdgeProvider extends BaseGraphEdgeProvider<JoinEntityEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return false;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<JoinEntityEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        const edgeTypeName = config?.EdgeType?.trim() || config?.EdgeTypeName?.trim();
        if (!config?.JoinEntity || !config?.SourceField || !config?.TargetField || !edgeTypeName) {
            return [];
        }
        if (!MatchesEdgeTypeFilter(edgeTypeName, request.EdgeTypes)) {
            return [];
        }
        if (!request.Nodes || request.Nodes.length === 0) {
            return [];
        }

        const joinEntityInfo = ctx.Provider.EntityByName(config.JoinEntity);
        if (!joinEntityInfo) {
            return [];
        }
        const sourceFieldInfo = joinEntityInfo.Fields.find(
            (f) => f.Name.trim().toLowerCase() === config.SourceField.trim().toLowerCase(),
        );
        const targetFieldInfo = joinEntityInfo.Fields.find(
            (f) => f.Name.trim().toLowerCase() === config.TargetField.trim().toLowerCase(),
        );
        const sourceFieldName = sourceFieldInfo?.Name ?? config.SourceField;
        const targetFieldName = targetFieldInfo?.Name ?? config.TargetField;

        const sourceEntityName = config.SourceEntity ?? sourceFieldInfo?.RelatedEntity;
        const targetEntityName = config.TargetEntity ?? targetFieldInfo?.RelatedEntity;
        if (!sourceEntityName || !targetEntityName) {
            return [];
        }
        const sourceEntityInfo = ctx.Provider.EntityByName(sourceEntityName);
        const targetEntityInfo = ctx.Provider.EntityByName(targetEntityName);

        const sourceIds: string[] = [];
        const targetIds: string[] = [];
        for (const node of request.Nodes) {
            const isSource =
                node.EntityName.trim().toLowerCase() === sourceEntityName.trim().toLowerCase() ||
                (sourceEntityInfo != null && node.EntityID != null && UUIDsEqual(node.EntityID, sourceEntityInfo.ID));
            const isTarget =
                node.EntityName.trim().toLowerCase() === targetEntityName.trim().toLowerCase() ||
                (targetEntityInfo != null && node.EntityID != null && UUIDsEqual(node.EntityID, targetEntityInfo.ID));

            if (isSource) {
                sourceIds.push(node.RecordID);
            }
            if (isTarget) {
                targetIds.push(node.RecordID);
            }
        }

        const predicates: string[] = [];
        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';

        if (wantOut && sourceIds.length > 0) {
            const quoted = sourceIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
            predicates.push(`[${sourceFieldName}] IN (${quoted})`);
        }
        if (wantIn && targetIds.length > 0) {
            const quoted = targetIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
            predicates.push(`[${targetFieldName}] IN (${quoted})`);
        }
        if (predicates.length === 0) {
            return [];
        }

        const fields = new Set<string>([sourceFieldName, targetFieldName]);
        if (config.WeightField) {
            fields.add(config.WeightField);
        }
        for (const attr of config.AttributeFields ?? []) {
            fields.add(attr);
        }

        const filter =
            `([${sourceFieldName}] IS NOT NULL AND [${targetFieldName}] IS NOT NULL) ` +
            `AND (${predicates.join(' OR ')})`;

        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const runResult = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: joinEntityInfo.Name,
                ExtraFilter: filter,
                Fields: Array.from(fields),
                ResultType: 'simple',
                MaxRows: config.MaxRowsPerStep ?? 200,
            },
            ctx.User,
        );

        if (!runResult.Success || !Array.isArray(runResult.Results)) {
            return [];
        }

        const defaultWeight = typeof config.DefaultWeight === 'number' ? config.DefaultWeight : 0.85;
        const edges: GraphEdgeView[] = [];

        for (const row of runResult.Results) {
            const rawSource = row[sourceFieldName];
            const rawTarget = row[targetFieldName];
            if (rawSource == null || rawTarget == null) {
                continue;
            }
            const fromNode: GraphNodeRef = {
                EntityName: sourceEntityInfo?.Name ?? sourceEntityName,
                EntityID: sourceEntityInfo?.ID,
                RecordID: String(rawSource),
            };
            const toNode: GraphNodeRef = {
                EntityName: targetEntityInfo?.Name ?? targetEntityName,
                EntityID: targetEntityInfo?.ID,
                RecordID: String(rawTarget),
            };
            const rawWeight = config.WeightField ? Number(row[config.WeightField]) : NaN;
            const weight = Number.isFinite(rawWeight) ? Math.max(0, Math.min(1, rawWeight)) : defaultWeight;

            let attributes: Record<string, unknown> | null = null;
            if (config.AttributeFields && config.AttributeFields.length > 0) {
                attributes = {};
                for (const attr of config.AttributeFields) {
                    if (row[attr] !== undefined) {
                        attributes[attr] = row[attr];
                    }
                }
            }

            const sourceKey = FormatGraphNodeKey(fromNode.EntityID ?? fromNode.EntityName, fromNode.RecordID);
            const targetKey = FormatGraphNodeKey(toNode.EntityID ?? toNode.EntityName, toNode.RecordID);

            edges.push({
                ID: `derived:JoinEntityEdgeProvider:${edgeTypeName}:${sourceKey}:${targetKey}`,
                GraphName: ctx.Graph.Name,
                TypeName: edgeTypeName,
                Source: fromNode,
                Target: toNode,
                IsDirected: true,
                Weight: weight,
                Description: `${fromNode.EntityName} --[${edgeTypeName} via ${joinEntityInfo.Name}]--> ${toNode.EntityName}`,
                Attributes: attributes,
                Origin: 'Derived',
                Status: 'Approved',
                Confidence: null,
            });
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link JoinEntityEdgeProvider}. */
export function LoadJoinEntityEdgeProvider(): void {
    void JoinEntityEdgeProvider;
}
