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
 * Configuration options for {@link ForeignKeyEdgeProvider}.
 */
export interface ForeignKeyEdgeProviderConfig {
    /** Source entity containing the foreign key column (e.g. `'Invoices'`) */
    EntityName: string;
    /** Foreign key field name on `EntityName` (e.g. `'CustomerID'`) */
    ForeignKeyField: string;
    /** Graph edge type name to emit (e.g. `'Billed To'`) */
    EdgeType: string;
    /**
     * When `true`, reverses edge orientation so the referenced record is `Source`
     * and the record holding the FK is `Target`.
     */
    Reverse?: boolean;
    /** Optional explicit weight override (0.0 to 1.0) */
    Weight?: number;
    /** Optional per-expansion row cap (default `200`) */
    MaxRowsPerExpansion?: number;
}

const PROVIDER_CLASS = 'ForeignKeyEdgeProvider';

function escapeSqlLiteral(val: string): string {
    return val.replace(/'/g, "''");
}

/**
 * Data-scale edge provider that projects foreign key relationships between business records
 * into graph edges at read time using batched `RunView` calls under `ctx.User`.
 */
@RegisterClass(BaseGraphEdgeProvider, PROVIDER_CLASS)
export class ForeignKeyEdgeProvider extends BaseGraphEdgeProvider<ForeignKeyEdgeProviderConfig> {
    public override get SupportsEnumeration(): boolean {
        return false;
    }

    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<ForeignKeyEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        const config = ctx.Config;
        if (!config?.EntityName || !config?.ForeignKeyField || !config?.EdgeType) {
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

        const sourceEntity = ctx.Provider.EntityByName(config.EntityName);
        if (!sourceEntity) {
            return [];
        }
        const pkField = sourceEntity.FirstPrimaryKey;
        const fkField = sourceEntity.Fields.find(
            f => f.Name.trim().toLowerCase() === config.ForeignKeyField.trim().toLowerCase(),
        );
        if (!pkField || !fkField || !fkField.RelatedEntityID) {
            return [];
        }
        const targetEntity = ctx.Provider.EntityByID(fkField.RelatedEntityID);
        if (!targetEntity) {
            return [];
        }

        const filterClauses = this.buildFilterClauses(
            request,
            sourceEntity.Name,
            targetEntity.Name,
            pkField.Name,
            fkField.Name,
            config.Reverse === true,
        );
        if (filterClauses.length === 0) {
            return [];
        }

        const extraFilter = `(${fkField.Name} IS NOT NULL) AND (${filterClauses.join(' OR ')})`;
        const rv = new RunView(ctx.Provider);
        const result = await rv.RunView<Record<string, unknown>>(
            {
                EntityName: sourceEntity.Name,
                ExtraFilter: extraFilter,
                Fields: [pkField.Name, fkField.Name],
                ResultType: 'simple',
                MaxRows: config.MaxRowsPerExpansion ?? 200,
            },
            ctx.User,
        );

        if (!result.Success || !result.Results) {
            return [];
        }

        const weight =
            config.Weight ?? ctx.ResolveDefaultWeight?.(config.EdgeType, 0.8) ?? 0.8;
        const edges: GraphEdgeView[] = [];

        for (const row of result.Results) {
            const rawSourceID = row[pkField.Name];
            const rawTargetID = row[fkField.Name];
            if (rawSourceID == null || rawTargetID == null) {
                continue;
            }
            const sourceRecordID = String(rawSourceID);
            const targetRecordID = String(rawTargetID);
            if (
                UUIDsEqual(sourceEntity.ID, targetEntity.ID) &&
                UUIDsEqual(sourceRecordID, targetRecordID)
            ) {
                continue;
            }

            const forwardSource: GraphNodeRef = {
                EntityName: sourceEntity.Name,
                RecordID: sourceRecordID,
            };
            const forwardTarget: GraphNodeRef = {
                EntityName: targetEntity.Name,
                RecordID: targetRecordID,
            };
            const source = config.Reverse ? forwardTarget : forwardSource;
            const target = config.Reverse ? forwardSource : forwardTarget;

            const edge: GraphEdgeView = {
                ID: BuildDerivedGraphEdgeID(PROVIDER_CLASS, config.EdgeType, source, target),
                GraphName: ctx.Graph.Name,
                TypeName: config.EdgeType,
                Source: source,
                Target: target,
                IsDirected: true,
                Weight: weight,
                Description: `${sourceEntity.Name}.${fkField.Name}`,
                Attributes: {
                    ForeignKeyField: fkField.Name,
                },
                Origin: 'Derived',
                Status: 'Approved',
                Confidence: null,
            };

            if (MatchesGraphEdgeRequest(edge, request)) {
                edges.push(edge);
            }
        }

        return edges;
    }

    private buildFilterClauses(
        request: GraphEdgeRequest,
        sourceEntityName: string,
        targetEntityName: string,
        pkFieldName: string,
        fkFieldName: string,
        reverse: boolean,
    ): string[] {
        const nodes = request.Nodes ?? [];
        const direction = request.Direction ?? 'Both';

        const checkForwardOut = direction === 'Both' || (!reverse && direction === 'Out') || (reverse && direction === 'In');
        const checkForwardIn = direction === 'Both' || (!reverse && direction === 'In') || (reverse && direction === 'Out');

        const sourceIDs: string[] = [];
        const targetIDs: string[] = [];

        for (const node of nodes) {
            const entityLower = node.EntityName.trim().toLowerCase();
            if (checkForwardOut && entityLower === sourceEntityName.trim().toLowerCase()) {
                sourceIDs.push(`'${escapeSqlLiteral(node.RecordID)}'`);
            }
            if (checkForwardIn && entityLower === targetEntityName.trim().toLowerCase()) {
                targetIDs.push(`'${escapeSqlLiteral(node.RecordID)}'`);
            }
        }

        const clauses: string[] = [];
        if (sourceIDs.length > 0) {
            clauses.push(`${pkFieldName} IN (${sourceIDs.join(', ')})`);
        }
        if (targetIDs.length > 0) {
            clauses.push(`${fkFieldName} IN (${targetIDs.join(', ')})`);
        }
        return clauses;
    }
}

/**
 * Tree-shaking anchor for {@link ForeignKeyEdgeProvider}.
 */
export function LoadForeignKeyEdgeProvider(): void {
    // Prevents tree-shaking of @RegisterClass decorator
}
