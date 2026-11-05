import { IRunQueryProvider, RunQuery } from '@memberjunction/core';
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
 * Configuration options for {@link QueryEdgeProvider}.
 */
export interface QueryEdgeProviderConfig {
    /** Name of the approved MJ Query to execute */
    QueryName: string;
    /** Optional category path for disambiguating `QueryName` */
    CategoryPath?: string;
    /** Optional static parameters passed to `RunQuery` */
    Parameters?: Record<string, unknown>;
    /** Default edge type name when the query result does not include an `EdgeType` column */
    EdgeType?: string;
    /** Default directedness of edges emitted by this query (default `true`) */
    IsDirected?: boolean;
    /** Whether this query edge provider can be enumerated in full on `Preload` graphs (default `false`) */
    SupportsEnumeration?: boolean;
    /** Optional row limit passed to `RunQuery` */
    MaxRows?: number;
}

interface QueryEdgeRow {
    SourceEntity?: string;
    SourceRecordID?: string | number;
    TargetEntity?: string;
    TargetRecordID?: string | number;
    EdgeType?: string;
    Weight?: number | string;
    Description?: string | null;
    IsDirected?: boolean;
    [key: string]: unknown;
}

const PROVIDER_CLASS = 'QueryEdgeProvider';
const RESERVED_COLUMNS = new Set([
    'SourceEntity',
    'SourceRecordID',
    'TargetEntity',
    'TargetRecordID',
    'EdgeType',
    'Weight',
    'Description',
    'IsDirected',
]);

function isRunQueryProvider(provider: unknown): provider is IRunQueryProvider {
    return (
        typeof provider === 'object' &&
        provider !== null &&
        'RunQuery' in provider &&
        typeof (provider as IRunQueryProvider).RunQuery === 'function'
    );
}

/**
 * Edge provider that executes an approved MJ Query via `RunQuery` under `ctx.User`
 * and maps result rows (`SourceEntity`, `SourceRecordID`, `TargetEntity`, `TargetRecordID`,
 * plus optional `EdgeType`, `Weight`, `Description`) into `GraphEdgeView` objects.
 */
@RegisterClass(BaseGraphEdgeProvider, PROVIDER_CLASS)
export class QueryEdgeProvider extends BaseGraphEdgeProvider<QueryEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return false;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<QueryEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        if (!config?.QueryName) {
            return [];
        }

        const rq = isRunQueryProvider(ctx.Provider)
            ? new RunQuery(ctx.Provider)
            : new RunQuery();

        const parameters: Record<string, unknown> = { ...(config.Parameters ?? {}) };
        if (request.Nodes && request.Nodes.length > 0 && parameters['NodeRecordIDs'] === undefined) {
            parameters['NodeRecordIDs'] = request.Nodes.map(n => n.RecordID).join(',');
        }

        const result = await rq.RunQuery(
            {
                QueryName: config.QueryName,
                CategoryPath: config.CategoryPath,
                Parameters: parameters,
                MaxRows: config.MaxRows,
            },
            ctx.User,
        );

        if (!result.Success || !result.Results) {
            return [];
        }

        const rows = result.Results as QueryEdgeRow[];
        const edgesByID = new Map<string, GraphEdgeView>();

        for (const row of rows) {
            const edge = this.rowToEdge(row, ctx);
            if (edge && MatchesGraphEdgeRequest(edge, request)) {
                edgesByID.set(edge.ID, edge);
            }
        }

        return Array.from(edgesByID.values());
    }

    private rowToEdge(
        row: QueryEdgeRow,
        ctx: GraphProviderContext<QueryEdgeProviderConfig>,
    ): GraphEdgeView | null {
        const config = ctx.Config;
        const sourceEntity = row.SourceEntity?.trim();
        const targetEntity = row.TargetEntity?.trim();
        const rawSourceID = row.SourceRecordID;
        const rawTargetID = row.TargetRecordID;
        const edgeType = (row.EdgeType ?? config.EdgeType ?? 'RelatedTo').trim();

        if (!sourceEntity || !targetEntity || rawSourceID == null || rawTargetID == null || !edgeType) {
            return null;
        }

        const sourceRecordID = String(rawSourceID);
        const targetRecordID = String(rawTargetID);
        if (
            sourceEntity.toLowerCase() === targetEntity.toLowerCase() &&
            UUIDsEqual(sourceRecordID, targetRecordID)
        ) {
            return null;
        }

        const defaultWeight = ctx.ResolveDefaultWeight?.(edgeType, 0.8) ?? 0.8;
        let weight = defaultWeight;
        if (row.Weight != null) {
            const parsed = Number(row.Weight);
            if (Number.isFinite(parsed)) {
                weight = Math.max(0, Math.min(1, parsed));
            }
        }

        const isDirected =
            typeof row.IsDirected === 'boolean'
                ? row.IsDirected
                : config.IsDirected !== false;

        const extraAttributes: Record<string, unknown> = {};
        let hasExtra = false;
        for (const [k, v] of Object.entries(row)) {
            if (!RESERVED_COLUMNS.has(k) && v !== undefined) {
                extraAttributes[k] = v;
                hasExtra = true;
            }
        }

        const source: GraphNodeRef = { EntityName: sourceEntity, RecordID: sourceRecordID };
        const target: GraphNodeRef = { EntityName: targetEntity, RecordID: targetRecordID };

        return {
            ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, edgeType, source, target),
            GraphName: ctx.Graph.Name,
            TypeName: edgeType,
            Source: source,
            Target: target,
            IsDirected: isDirected,
            Weight: weight,
            Description: row.Description ?? `via query ${config.QueryName}`,
            Attributes: hasExtra ? extraAttributes : null,
            Origin: 'Derived',
            Status: 'Approved',
            Confidence: null,
        };
    }
}

/**
 * Tree-shaking anchor for {@link QueryEdgeProvider}.
 */
export function LoadQueryEdgeProvider(): void {
    // Prevents tree-shaking of @RegisterClass decorator
}
