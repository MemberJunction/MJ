import { RunView } from '@memberjunction/core';
import { EscapeSQLString, IndexByUUID, RegisterClass } from '@memberjunction/global';
import type { MJRecordLinkEntityType } from '../../generated/entities/__mj';
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
 * Configuration for {@link RecordLinkEdgeProvider}.
 */
export interface RecordLinkEdgeProviderConfig {
    LinkTypes?: string[];
    EdgeType?: string;
    DefaultWeight?: number;
    MaxRowsPerStep?: number;
}

/**
 * Projects existing `MJ: Record Links` rows as derived semantic graph edges.
 * Batches one `RunView` per expansion step under `ctx.User`.
 */
@RegisterClass(BaseGraphEdgeProvider, 'RecordLinkEdgeProvider')
export class RecordLinkEdgeProvider extends BaseGraphEdgeProvider<RecordLinkEdgeProviderConfig> {
    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<RecordLinkEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        if (request.Nodes.length === 0) {
            return [];
        }
        const config = ctx.Config ?? {};
        const configuredEdgeType = config.EdgeType?.trim();
        if (configuredEdgeType && !MatchesEdgeTypeFilter(configuredEdgeType, request.EdgeTypes)) {
            return [];
        }

        const idsByEntityId = new Map<string, Set<string>>();
        const ungroupedRecordIds = new Set<string>();
        const frontierKeys = new Set<string>();

        for (const node of request.Nodes) {
            const recId = node.RecordID.trim();
            if (!recId) {
                continue;
            }
            const resolvedEntity = node.EntityName ? ctx.Provider.EntityByName(node.EntityName) : undefined;
            const entityId = node.EntityID ?? resolvedEntity?.ID;
            frontierKeys.add(FormatGraphNodeKey(entityId ?? node.EntityName, recId));
            if (entityId) {
                let set = idsByEntityId.get(entityId);
                if (!set) {
                    set = new Set<string>();
                    idsByEntityId.set(entityId, set);
                }
                set.add(recId);
            } else {
                ungroupedRecordIds.add(recId);
            }
        }

        if (idsByEntityId.size === 0 && ungroupedRecordIds.size === 0) {
            return [];
        }

        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';

        const buildSideClauses = (
            entityCol: 'SourceEntityID' | 'TargetEntityID',
            recordCol: 'SourceRecordID' | 'TargetRecordID',
        ): string[] => {
            const parts: string[] = [];
            for (const [entId, recSet] of idsByEntityId.entries()) {
                const quotedIds = Array.from(recSet)
                    .map((id) => `'${EscapeSQLString(id)}'`)
                    .join(', ');
                parts.push(`([${entityCol}] = '${EscapeSQLString(entId)}' AND [${recordCol}] IN (${quotedIds}))`);
            }
            if (ungroupedRecordIds.size > 0) {
                const quotedIds = Array.from(ungroupedRecordIds)
                    .map((id) => `'${EscapeSQLString(id)}'`)
                    .join(', ');
                parts.push(`[${recordCol}] IN (${quotedIds})`);
            }
            return parts;
        };

        const dirClauses: string[] = [];
        if (wantOut) {
            dirClauses.push(...buildSideClauses('SourceEntityID', 'SourceRecordID'));
        }
        if (wantIn) {
            dirClauses.push(...buildSideClauses('TargetEntityID', 'TargetRecordID'));
        }
        if (dirClauses.length === 0) {
            return [];
        }

        let extraFilter = `(${dirClauses.join(' OR ')})`;
        if (config.LinkTypes && config.LinkTypes.length > 0) {
            const quotedTypes = config.LinkTypes.map((lt) => `'${EscapeSQLString(lt)}'`).join(', ');
            extraFilter += ` AND ([LinkType] IN (${quotedTypes}))`;
        }

        const maxRows = ResolveMaxRowsPerStep(config.MaxRowsPerStep);
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const runResult = await rv.RunView<
            Pick<
                MJRecordLinkEntityType,
                | 'ID'
                | 'SourceEntityID'
                | 'SourceEntity'
                | 'SourceRecordID'
                | 'TargetEntityID'
                | 'TargetEntity'
                | 'TargetRecordID'
                | 'LinkType'
                | 'Metadata'
            >
        >(
            {
                EntityName: 'MJ: Record Links',
                ExtraFilter: extraFilter,
                Fields: [
                    'ID',
                    'SourceEntityID',
                    'SourceEntity',
                    'SourceRecordID',
                    'TargetEntityID',
                    'TargetEntity',
                    'TargetRecordID',
                    'LinkType',
                    'Metadata',
                ],
                OrderBy: '[ID]',
                ResultType: 'simple',
                MaxRows: maxRows,
            },
            ctx.User,
        );

        if (!runResult.Success || !Array.isArray(runResult.Results)) {
            return [];
        }
        if (runResult.Results.length >= maxRows) {
            this.LogTruncation('RecordLinkEdgeProvider', 'MJ: Record Links', maxRows, ctx.Graph.Name);
        }

        const defaultWeight = typeof config.DefaultWeight === 'number' ? config.DefaultWeight : 0.65;
        const edges: GraphEdgeView[] = [];
        const entitiesById = IndexByUUID(ctx.Provider.Entities);

        for (const row of runResult.Results) {
            const edgeType = configuredEdgeType || row.LinkType?.trim() || 'Related To';
            if (!MatchesEdgeTypeFilter(edgeType, request.EdgeTypes)) {
                continue;
            }
            const sourceInfo = entitiesById.Get(row.SourceEntityID);
            const targetInfo = entitiesById.Get(row.TargetEntityID);

            const fromNode: GraphNodeRef = {
                EntityName: sourceInfo?.Name ?? row.SourceEntity ?? 'Unknown',
                EntityID: row.SourceEntityID,
                RecordID: String(row.SourceRecordID),
            };
            const toNode: GraphNodeRef = {
                EntityName: targetInfo?.Name ?? row.TargetEntity ?? 'Unknown',
                EntityID: row.TargetEntityID,
                RecordID: String(row.TargetRecordID),
            };

            const sourceKey = FormatGraphNodeKey(fromNode.EntityID ?? fromNode.EntityName, fromNode.RecordID);
            const targetKey = FormatGraphNodeKey(toNode.EntityID ?? toNode.EntityName, toNode.RecordID);
            if (!((wantOut && frontierKeys.has(sourceKey)) || (wantIn && frontierKeys.has(targetKey)))) {
                continue;
            }

            let attributes: Record<string, unknown> | null = null;
            if (row.Metadata) {
                try {
                    const parsed: unknown = JSON.parse(row.Metadata);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        attributes = parsed as Record<string, unknown>;
                    }
                } catch {
                    attributes = { RawMetadata: row.Metadata };
                }
            }

            edges.push({
                ID: `derived:RecordLinkEdgeProvider:${edgeType}:${sourceKey}:${targetKey}`,
                GraphName: ctx.Graph.Name,
                TypeName: edgeType,
                Source: fromNode,
                Target: toNode,
                IsDirected: true,
                Weight: defaultWeight,
                Description: row.LinkType ? `Record Link (${row.LinkType})` : 'Record Link',
                Attributes: attributes,
                Origin: 'Derived',
                Status: 'Approved',
                Confidence: null,
            });
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link RecordLinkEdgeProvider}. */
export function LoadRecordLinkEdgeProvider(): void {
    void RecordLinkEdgeProvider;
}
