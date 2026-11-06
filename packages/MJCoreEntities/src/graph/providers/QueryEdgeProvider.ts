import { RunQuery } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
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
 * Configuration for {@link QueryEdgeProvider}.
 */
export interface QueryEdgeProviderConfig {
    QueryName: string;
    CategoryPath?: string;
    Parameters?: Record<string, string | number | boolean>;
    DefaultEdgeType?: string;
    EdgeTypeName?: string;
    DefaultWeight?: number;
    IsDirected?: boolean;
}

/**
 * Projects derived edges from any saved MJ Query returning `SourceEntity`, `SourceRecordID`,
 * `TargetEntity`, `TargetRecordID` (and optional `EdgeType`, `Weight`, `Description`).
 * Runs through `RunQuery` under `ctx.User` so query permissions (`UserCanRun`) apply.
 */
@RegisterClass(BaseGraphEdgeProvider, 'QueryEdgeProvider')
export class QueryEdgeProvider extends BaseGraphEdgeProvider<QueryEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return true;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<QueryEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        if (!config?.QueryName) {
            return [];
        }

        const cachedQuery = QueryEngine.Instance.FindQueryByName(config.QueryName);
        // UserCanRun returns { canRun, deniedEntities }; the object itself is always truthy.
        if (cachedQuery && !cachedQuery.UserCanRun(ctx.User).canRun) {
            return [];
        }

        const rq = new RunQuery(ctx.Provider);

        const queryResult = await rq.RunQuery(
            {
                QueryName: config.QueryName,
                CategoryPath: config.CategoryPath,
                Parameters: config.Parameters ? { ...config.Parameters } : undefined,
            },
            ctx.User,
        );

        if (!queryResult?.Success || !Array.isArray(queryResult.Results)) {
            return [];
        }

        const frontierKeys =
            request.Nodes && request.Nodes.length > 0
                ? new Set(
                      request.Nodes.map((n) => {
                          const entityInfo = ctx.Provider.EntityByName(n.EntityName);
                          return FormatGraphNodeKey(entityInfo?.ID ?? n.EntityID ?? n.EntityName, n.RecordID);
                      }),
                  )
                : null;

        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';
        const defaultEdgeType = config.DefaultEdgeType?.trim() || config.EdgeTypeName?.trim() || 'Related To';
        const defaultWeight = typeof config.DefaultWeight === 'number' ? config.DefaultWeight : 0.75;
        const isDirected = config.IsDirected !== false;

        const edges: GraphEdgeView[] = [];
        for (const rawRow of queryResult.Results) {
            if (!rawRow || typeof rawRow !== 'object') {
                continue;
            }
            const row = rawRow as Record<string, unknown>;
            const sourceEntityName = row['SourceEntity'] != null ? String(row['SourceEntity']).trim() : '';
            const sourceRecordId = row['SourceRecordID'] != null ? String(row['SourceRecordID']).trim() : '';
            const targetEntityName = row['TargetEntity'] != null ? String(row['TargetEntity']).trim() : '';
            const targetRecordId = row['TargetRecordID'] != null ? String(row['TargetRecordID']).trim() : '';
            if (!sourceEntityName || !sourceRecordId || !targetEntityName || !targetRecordId) {
                continue;
            }

            const edgeType = row['EdgeType'] != null ? String(row['EdgeType']).trim() : defaultEdgeType;
            if (!MatchesEdgeTypeFilter(edgeType, request.EdgeTypes)) {
                continue;
            }

            const sourceInfo = ctx.Provider.EntityByName(sourceEntityName);
            const targetInfo = ctx.Provider.EntityByName(targetEntityName);
            const fromNode: GraphNodeRef = {
                EntityName: sourceInfo?.Name ?? sourceEntityName,
                EntityID: sourceInfo?.ID,
                RecordID: sourceRecordId,
            };
            const toNode: GraphNodeRef = {
                EntityName: targetInfo?.Name ?? targetEntityName,
                EntityID: targetInfo?.ID,
                RecordID: targetRecordId,
            };

            const sourceKey = FormatGraphNodeKey(fromNode.EntityID ?? fromNode.EntityName, fromNode.RecordID);
            const targetKey = FormatGraphNodeKey(toNode.EntityID ?? toNode.EntityName, toNode.RecordID);

            if (frontierKeys) {
                const matchOut = wantOut && frontierKeys.has(sourceKey);
                const matchIn = wantIn && frontierKeys.has(targetKey);
                const matchUndirected = !isDirected && (frontierKeys.has(sourceKey) || frontierKeys.has(targetKey));
                if (!matchOut && !matchIn && !matchUndirected) {
                    continue;
                }
            }

            const rawWeight = row['Weight'] != null ? Number(row['Weight']) : NaN;
            const weight = Number.isFinite(rawWeight) ? Math.max(0, Math.min(1, rawWeight)) : defaultWeight;
            const description = row['Description'] != null ? String(row['Description']) : null;

            edges.push({
                ID: `derived:QueryEdgeProvider:${edgeType}:${sourceKey}:${targetKey}`,
                GraphName: ctx.Graph.Name,
                TypeName: edgeType,
                Source: fromNode,
                Target: toNode,
                IsDirected: isDirected,
                Weight: weight,
                Description: description,
                Attributes: { QueryName: config.QueryName },
                Origin: 'Derived',
                Status: 'Approved',
                Confidence: null,
            });
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link QueryEdgeProvider}. */
export function LoadQueryEdgeProvider(): void {
    void QueryEdgeProvider;
}
