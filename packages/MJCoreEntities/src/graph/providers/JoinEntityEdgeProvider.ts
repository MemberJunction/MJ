import { LogError, RunView, type EntityFieldInfo, type EntityInfo } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    BaseGraphEdgeProvider,
    FormatGraphNodeKey,
    MatchesEdgeTypeFilter,
    ResolveMaxRowsPerStep,
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

/** The join entity's columns this provider reads, each resolved from entity metadata. */
interface ResolvedJoinFields {
    Source: EntityFieldInfo;
    Target: EntityFieldInfo;
    Weight: EntityFieldInfo | null;
    Attributes: EntityFieldInfo[];
}

/**
 * Projects derived many-to-many edges through a join entity (e.g., `Person` $\to$ `Organization`
 * `"Member Of"` via `Memberships`). Batches one bounded, ordered `RunView` per expansion step under `ctx.User`.
 *
 * Every column named in the configuration must be a field of the join entity: it is resolved through
 * entity metadata and the metadata's own field name goes into the filter, so configuration text never
 * reaches SQL as an identifier. An unknown field disables the provider (logged) rather than guessing.
 */
@RegisterClass(BaseGraphEdgeProvider, 'JoinEntityEdgeProvider')
export class JoinEntityEdgeProvider extends BaseGraphEdgeProvider<JoinEntityEdgeProviderConfig> {
    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<JoinEntityEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        const edgeTypeName = config?.EdgeType?.trim() || config?.EdgeTypeName?.trim();
        if (!config?.JoinEntity || !config?.SourceField || !config?.TargetField || !edgeTypeName) {
            return [];
        }
        if (!MatchesEdgeTypeFilter(edgeTypeName, request.EdgeTypes) || request.Nodes.length === 0) {
            return [];
        }

        const joinEntityInfo = ctx.Provider.EntityByName(config.JoinEntity);
        if (!joinEntityInfo) {
            return [];
        }
        const fields = this.resolveFields(joinEntityInfo, config, ctx.Graph.Name);
        if (!fields) {
            return [];
        }

        const sourceEntityName = config.SourceEntity ?? fields.Source.RelatedEntity;
        const targetEntityName = config.TargetEntity ?? fields.Target.RelatedEntity;
        if (!sourceEntityName || !targetEntityName) {
            return [];
        }
        const sourceEntityInfo = ctx.Provider.EntityByName(sourceEntityName);
        const targetEntityInfo = ctx.Provider.EntityByName(targetEntityName);

        const { SourceIds: sourceIds, TargetIds: targetIds } = this.splitFrontier(request, sourceEntityName, targetEntityName, sourceEntityInfo, targetEntityInfo);
        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';
        const predicates: string[] = [];
        if (wantOut && sourceIds.length > 0) {
            predicates.push(`[${fields.Source.Name}] IN (${sourceIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`);
        }
        if (wantIn && targetIds.length > 0) {
            predicates.push(`[${fields.Target.Name}] IN (${targetIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`);
        }
        if (predicates.length === 0) {
            return [];
        }

        const readFields = new Set<string>([fields.Source.Name, fields.Target.Name]);
        if (fields.Weight) {
            readFields.add(fields.Weight.Name);
        }
        for (const attr of fields.Attributes) {
            readFields.add(attr.Name);
        }

        const maxRows = ResolveMaxRowsPerStep(config.MaxRowsPerStep);
        const runResult = await RunView.FromMetadataProvider(ctx.Provider).RunView<Record<string, unknown>>(
            {
                EntityName: joinEntityInfo.Name,
                ExtraFilter:
                    `([${fields.Source.Name}] IS NOT NULL AND [${fields.Target.Name}] IS NOT NULL) ` +
                    `AND (${predicates.join(' OR ')})`,
                Fields: Array.from(readFields),
                OrderBy: `[${fields.Source.Name}], [${fields.Target.Name}]`,
                ResultType: 'simple',
                MaxRows: maxRows,
            },
            ctx.User,
        );
        if (!runResult.Success || !Array.isArray(runResult.Results)) {
            return [];
        }
        if (runResult.Results.length >= maxRows) {
            this.LogTruncation('JoinEntityEdgeProvider', joinEntityInfo.Name, maxRows, ctx.Graph.Name);
        }

        const defaultWeight = typeof config.DefaultWeight === 'number' ? config.DefaultWeight : 0.85;
        const edges: GraphEdgeView[] = [];
        for (const row of runResult.Results) {
            const rawSource = row[fields.Source.Name];
            const rawTarget = row[fields.Target.Name];
            if (rawSource == null || rawTarget == null) {
                continue;
            }
            const fromNode: GraphNodeRef = { EntityName: sourceEntityInfo?.Name ?? sourceEntityName, EntityID: sourceEntityInfo?.ID, RecordID: String(rawSource) };
            const toNode: GraphNodeRef = { EntityName: targetEntityInfo?.Name ?? targetEntityName, EntityID: targetEntityInfo?.ID, RecordID: String(rawTarget) };
            const rawWeight = fields.Weight ? Number(row[fields.Weight.Name]) : NaN;
            const weight = Number.isFinite(rawWeight) ? Math.max(0, Math.min(1, rawWeight)) : defaultWeight;

            let attributes: Record<string, unknown> | null = null;
            if (fields.Attributes.length > 0) {
                attributes = {};
                for (const attr of fields.Attributes) {
                    if (row[attr.Name] !== undefined) {
                        attributes[attr.Name] = row[attr.Name];
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

    /**
     * Resolve every configured column against the join entity's metadata. Returns `null` (and logs)
     * when any of them is not a field of the entity.
     */
    private resolveFields(entity: EntityInfo, config: JoinEntityEdgeProviderConfig, graphName: string): ResolvedJoinFields | null {
        const find = (name: string): EntityFieldInfo | undefined =>
            entity.Fields.find((f) => f.Name.trim().toLowerCase() === name.trim().toLowerCase());
        const requested = [config.SourceField, config.TargetField, ...(config.WeightField ? [config.WeightField] : []), ...(config.AttributeFields ?? [])];
        const unknown = requested.filter((name) => !find(name));
        if (unknown.length > 0) {
            LogError(
                `JoinEntityEdgeProvider: graph "${graphName}" names field(s) ${unknown.map((u) => `"${u}"`).join(', ')} ` +
                    `that "${entity.Name}" does not have; the provider is skipped.`,
            );
            return null;
        }
        const source = find(config.SourceField);
        const target = find(config.TargetField);
        if (!source || !target) {
            return null;
        }
        return {
            Source: source,
            Target: target,
            Weight: config.WeightField ? (find(config.WeightField) ?? null) : null,
            Attributes: (config.AttributeFields ?? []).map((a) => find(a)).filter((f): f is EntityFieldInfo => f !== undefined),
        };
    }

    private splitFrontier(
        request: GraphEdgeRequest,
        sourceEntityName: string,
        targetEntityName: string,
        sourceEntityInfo: EntityInfo | undefined,
        targetEntityInfo: EntityInfo | undefined,
    ): { SourceIds: string[]; TargetIds: string[] } {
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
        return { SourceIds: sourceIds.sort(), TargetIds: targetIds.sort() };
    }
}

/** Tree-shaking anchor for {@link JoinEntityEdgeProvider}. */
export function LoadJoinEntityEdgeProvider(): void {
    void JoinEntityEdgeProvider;
}
