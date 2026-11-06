import { RunQuery } from '@memberjunction/core';
import { IsPlainObject, RegisterClass } from '@memberjunction/global';
import { QueryEngine } from '../../engines/QueryEngine';
import {
    BaseGraphEdgeProvider,
    FormatGraphNodeKey,
    ResolveMaxRowsPerStep,
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
    /**
     * Name of a query parameter that receives the frontier's record IDs (an array) on every
     * expansion step, so the query reads only the frontier's edges — e.g. a parameter `NodeIDs` used as
     * `WHERE SourceRecordID IN {{ NodeIDs | sqlIn }}`. Without it the query is not frontier-scoped and
     * every step runs it whole (still capped at `MaxRowsPerStep`); set it for any data-scale query.
     */
    FrontierParameter?: string;
    DefaultEdgeType?: string;
    EdgeTypeName?: string;
    DefaultWeight?: number;
    IsDirected?: boolean;
    MaxRowsPerStep?: number;
}

/**
 * Projects derived edges from any saved MJ Query returning `SourceEntity`, `SourceRecordID`,
 * `TargetEntity`, `TargetRecordID` (and optional `EdgeType`, `Weight`, `Description`).
 * Runs through `RunQuery` under `ctx.User` so query permissions (`UserCanRun`) apply, receives the
 * frontier through `FrontierParameter` when configured, and is capped at `MaxRowsPerStep` rows per step.
 */
@RegisterClass(BaseGraphEdgeProvider, 'QueryEdgeProvider')
export class QueryEdgeProvider extends BaseGraphEdgeProvider<QueryEdgeProviderConfig> {
    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<QueryEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        if (!config?.QueryName || request.Nodes.length === 0) {
            return [];
        }

        const cachedQuery = QueryEngine.Instance.FindQueryByName(config.QueryName);
        // UserCanRun returns { canRun, deniedEntities }; the object itself is always truthy.
        if (cachedQuery && !cachedQuery.UserCanRun(ctx.User).canRun) {
            return [];
        }

        const parameters: Record<string, string | number | boolean | string[]> = { ...(config.Parameters ?? {}) };
        const frontierParameter = config.FrontierParameter?.trim();
        if (frontierParameter) {
            parameters[frontierParameter] = Array.from(new Set(request.Nodes.map((n) => n.RecordID))).sort();
        }
        const maxRows = ResolveMaxRowsPerStep(config.MaxRowsPerStep);
        const queryResult = await new RunQuery(ctx.Provider).RunQuery(
            {
                QueryName: config.QueryName,
                CategoryPath: config.CategoryPath,
                Parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
                MaxRows: maxRows,
            },
            ctx.User,
        );

        if (!queryResult?.Success || !Array.isArray(queryResult.Results)) {
            return [];
        }
        if (queryResult.Results.length >= maxRows) {
            this.LogTruncation('QueryEdgeProvider', config.QueryName, maxRows, ctx.Graph.Name);
        }

        const frontierKeys = new Set(
            request.Nodes.map((n) => {
                const entityInfo = ctx.Provider.EntityByName(n.EntityName);
                return FormatGraphNodeKey(entityInfo?.ID ?? n.EntityID ?? n.EntityName, n.RecordID);
            }),
        );

        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';
        const defaultEdgeType = config.DefaultEdgeType?.trim() || config.EdgeTypeName?.trim() || 'Related To';
        const defaultWeight = typeof config.DefaultWeight === 'number' ? config.DefaultWeight : 0.75;
        const isDirected = config.IsDirected !== false;

        const edges: GraphEdgeView[] = [];
        for (const row of queryResult.Results) {
            if (!IsPlainObject(row)) {
                continue;
            }
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

            const matchOut = wantOut && frontierKeys.has(sourceKey);
            const matchIn = wantIn && frontierKeys.has(targetKey);
            const matchUndirected = !isDirected && (frontierKeys.has(sourceKey) || frontierKeys.has(targetKey));
            if (!matchOut && !matchIn && !matchUndirected) {
                continue;
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
