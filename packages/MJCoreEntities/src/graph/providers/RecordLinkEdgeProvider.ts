import { RunView } from '@memberjunction/core';
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

/**
 * Configuration options for {@link RecordLinkEdgeProvider}.
 */
export interface RecordLinkEdgeProviderConfig {
    /** Optional allow-list of `LinkType` values from `MJ: Record Links` */
    LinkTypes?: string[];
    /** Graph edge type name to emit (falls back to `row.LinkType` or `'RelatedTo'`) */
    EdgeType?: string;
    /** Optional explicit weight override (0.0 to 1.0) */
    Weight?: number;
    /** Optional per-expansion row cap (default `200`) */
    MaxRowsPerExpansion?: number;
}

interface RecordLinkRow {
    ID: string;
    SourceEntityID: string;
    SourceEntity?: string;
    SourceRecordID: string;
    TargetEntityID: string;
    TargetEntity?: string;
    TargetRecordID: string;
    LinkType?: string | null;
    Metadata?: string | null;
}

const PROVIDER_CLASS = 'RecordLinkEdgeProvider';
const ENTITY_RECORD_LINKS = 'MJ: Record Links';

function escapeSqlLiteral(val: string): string {
    return val.replace(/'/g, "''");
}

/**
 * Data-scale edge provider that projects `MJ: Record Links` rows into graph edges
 * using a batched `RunView` query under `ctx.User`.
 */
@RegisterClass(BaseGraphEdgeProvider, PROVIDER_CLASS)
export class RecordLinkEdgeProvider extends BaseGraphEdgeProvider<RecordLinkEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return false;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<RecordLinkEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        if (!request.Nodes || request.Nodes.length === 0) {
            return [];
        }
        const config = ctx.Config ?? {};

        const endpointClause = this.buildEndpointFilter(request, ctx);
        if (!endpointClause) {
            return [];
        }

        let extraFilter = endpointClause;
        if (config.LinkTypes && config.LinkTypes.length > 0) {
            const quotedTypes = config.LinkTypes.map(t => `'${escapeSqlLiteral(t)}'`).join(', ');
            extraFilter = `(${endpointClause}) AND (LinkType IN (${quotedTypes}))`;
        }

        const rv = new RunView(ctx.Provider);
        const result = await rv.RunView<RecordLinkRow>(
            {
                EntityName: ENTITY_RECORD_LINKS,
                ExtraFilter: extraFilter,
                ResultType: 'simple',
                MaxRows: config.MaxRowsPerExpansion ?? 200,
            },
            ctx.User,
        );

        if (!result.Success || !result.Results) {
            return [];
        }

        const edges: GraphEdgeView[] = [];
        for (const row of result.Results) {
            const edge = this.rowToEdge(row, ctx);
            if (edge && MatchesGraphEdgeRequest(edge, request)) {
                edges.push(edge);
            }
        }
        return edges;
    }

    private buildEndpointFilter(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<RecordLinkEdgeProviderConfig>,
    ): string | null {
        const byEntity = new UUIDMap<{ EntityID: string; RecordIDs: string[] }>();
        for (const node of request.Nodes ?? []) {
            const entity = ctx.Provider.EntityByName(node.EntityName);
            if (!entity) {
                continue;
            }
            let entry = byEntity.Get(entity.ID);
            if (!entry) {
                entry = { EntityID: entity.ID, RecordIDs: [] };
                byEntity.Set(entity.ID, entry);
            }
            entry.RecordIDs.push(`'${escapeSqlLiteral(node.RecordID)}'`);
        }

        const direction = request.Direction ?? 'Both';
        const clauses: string[] = [];
        for (const [, entry] of byEntity) {
            const eid = escapeSqlLiteral(entry.EntityID);
            const rids = entry.RecordIDs.join(', ');
            if (direction === 'Both' || direction === 'Out') {
                clauses.push(`(SourceEntityID = '${eid}' AND SourceRecordID IN (${rids}))`);
            }
            if (direction === 'Both' || direction === 'In') {
                clauses.push(`(TargetEntityID = '${eid}' AND TargetRecordID IN (${rids}))`);
            }
        }

        return clauses.length > 0 ? clauses.join(' OR ') : null;
    }

    private rowToEdge(
        row: RecordLinkRow,
        ctx: GraphProviderContext<RecordLinkEdgeProviderConfig>,
    ): GraphEdgeView | null {
        const sourceEntityName =
            row.SourceEntity ?? ctx.Provider.EntityByID(row.SourceEntityID)?.Name;
        const targetEntityName =
            row.TargetEntity ?? ctx.Provider.EntityByID(row.TargetEntityID)?.Name;
        if (!sourceEntityName || !targetEntityName || !row.SourceRecordID || !row.TargetRecordID) {
            return null;
        }
        if (
            UUIDsEqual(row.SourceEntityID, row.TargetEntityID) &&
            NormalizeUUID(row.SourceRecordID) === NormalizeUUID(row.TargetRecordID)
        ) {
            return null;
        }

        const config = ctx.Config ?? {};
        const edgeType = (config.EdgeType ?? row.LinkType ?? 'RelatedTo').trim();
        const weight = config.Weight ?? ctx.ResolveDefaultWeight?.(edgeType, 0.7) ?? 0.7;

        let attributes: Record<string, unknown> | null = null;
        if (row.Metadata) {
            try {
                const parsed: unknown = JSON.parse(row.Metadata);
                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                    attributes = parsed as Record<string, unknown>;
                }
            } catch {
                attributes = { RawMetadata: row.Metadata };
            }
        }

        const source: GraphNodeRef = { EntityName: sourceEntityName, RecordID: row.SourceRecordID };
        const target: GraphNodeRef = { EntityName: targetEntityName, RecordID: row.TargetRecordID };

        return {
            ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, edgeType, source, target),
            GraphName: ctx.Graph.Name,
            TypeName: edgeType,
            Source: source,
            Target: target,
            IsDirected: true,
            Weight: weight,
            Description: row.LinkType ? `Record Link (${row.LinkType})` : 'Record Link',
            Attributes: attributes,
            Origin: 'Derived',
            Status: 'Approved',
            Confidence: null,
        };
    }
}

/**
 * Tree-shaking anchor for {@link RecordLinkEdgeProvider}.
 */
export function LoadRecordLinkEdgeProvider(): void {
    // Prevents tree-shaking of @RegisterClass decorator
}
