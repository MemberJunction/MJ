import type { EntityFieldInfo, EntityIndexInfo, EntityInfo } from '@memberjunction/core';
import { NormalizeUUID, RegisterClass, UUIDMap, UUIDSet } from '@memberjunction/global';
import {
    BaseGraphEdgeProvider,
    FormatGraphNodeKey,
    MatchesEdgeTypeFilter,
    type GraphEdgeRequest,
    type GraphEdgeView,
    type GraphNodeRef,
    type GraphProviderContext,
} from '../BaseGraphEdgeProvider';

/** Access-path classification for a directed join edge onto a target entity column. */
export type JoinAccessPath =
    | 'PrimaryKey'
    | 'UniqueLeadingIndex'
    | 'LeadingIndexKey'
    | 'NonLeadingIndexKey'
    | 'TableScan';

/**
 * Configuration for {@link IndexAwareJoinEdgeProvider}.
 */
export interface IndexAwareJoinEdgeProviderConfig {
    /**
     * When `true`, also consider `Status = 'Proposed'` indexes (e.g. from DBAutoDoc Index Advisor)
     * alongside `Active` indexes to preview how proposed indexes would improve join paths.
     * Defaults to `false`.
     */
    IncludeProposedIndexes?: boolean;
    /**
     * Optional map of entity name (case-insensitive) or entity ID to estimated row count.
     * Small tables below `SmallTableThreshold` receive a milder unindexed-scan penalty.
     */
    RowCounts?: Record<string, number>;
    /** Row count below which an unindexed table scan is treated as cheap (default `1000`). */
    SmallTableThreshold?: number;
}

const DEFAULT_SMALL_TABLE_THRESHOLD = 1000;

const BASE_WEIGHT_BY_ACCESS_PATH: Record<JoinAccessPath, number> = {
    PrimaryKey: 0.95,
    UniqueLeadingIndex: 0.92,
    LeadingIndexKey: 0.85,
    NonLeadingIndexKey: 0.55,
    TableScan: 0.20,
};

const COVERING_INCLUDE_BONUS = 0.05;
const FILTERED_INDEX_MULTIPLIER = 0.85;
const SMALL_TABLE_SCAN_WEIGHT = 0.70;

export interface JoinAccessAssessment {
    AccessPath: JoinAccessPath;
    Weight: number;
    IndexName: string | null;
    IndexType: string | null;
    IsUnique: boolean;
    HasFilter: boolean;
    IncludeFieldCount: number;
}

function clampWeight(value: number): number {
    if (value <= 0.01) {
        return 0.01;
    }
    if (value >= 1.0) {
        return 1.0;
    }
    return Math.round(value * 1000) / 1000;
}

function lookupRowCount(entity: EntityInfo, rowCounts?: Record<string, number>): number | undefined {
    if (!rowCounts) {
        return undefined;
    }
    const normalizedId = NormalizeUUID(entity.ID);
    const lowerName = entity.Name.trim().toLowerCase();
    for (const [key, count] of Object.entries(rowCounts)) {
        if (key.trim().toLowerCase() === lowerName || NormalizeUUID(key) === normalizedId) {
            return count;
        }
    }
    return undefined;
}

/**
 * Evaluates the best index access path for joining onto `targetField` of `targetEntity`.
 */
export function AssessJoinAccessPath(
    targetEntity: EntityInfo,
    targetField: EntityFieldInfo | undefined,
    config?: IndexAwareJoinEdgeProviderConfig,
): JoinAccessAssessment {
    if (!targetField) {
        return {
            AccessPath: 'TableScan',
            Weight: BASE_WEIGHT_BY_ACCESS_PATH.TableScan,
            IndexName: null,
            IndexType: null,
            IsUnique: false,
            HasFilter: false,
            IncludeFieldCount: 0,
        };
    }

    const candidateIndexes: EntityIndexInfo[] = config?.IncludeProposedIndexes
        ? targetEntity.Indexes.filter((idx) => idx.Status === 'Active' || idx.Status === 'Proposed')
        : targetEntity.ActiveIndexes;

    const targetFieldKey = NormalizeUUID(targetField.ID);
    let best: JoinAccessAssessment | null = null;

    for (const index of candidateIndexes) {
        const keyFields = index.KeyFields;
        const position = keyFields.findIndex(
            (f) => f.EntityFieldID != null && NormalizeUUID(f.EntityFieldID) === targetFieldKey,
        );
        if (position < 0) {
            continue;
        }

        let accessPath: JoinAccessPath;
        if (index.IsPrimaryKey && position === 0) {
            accessPath = 'PrimaryKey';
        } else if (index.IsUnique && position === 0) {
            accessPath = 'UniqueLeadingIndex';
        } else if (position === 0) {
            accessPath = 'LeadingIndexKey';
        } else {
            accessPath = 'NonLeadingIndexKey';
        }

        const hasFilter = Boolean(index.FilterDefinition && index.FilterDefinition.trim().length > 0);
        const includeCount = index.IncludeFields.length;

        let weight = BASE_WEIGHT_BY_ACCESS_PATH[accessPath];
        if (includeCount > 0) {
            weight += COVERING_INCLUDE_BONUS;
        }
        if (hasFilter) {
            weight *= FILTERED_INDEX_MULTIPLIER;
        }
        weight = clampWeight(weight);

        const candidate: JoinAccessAssessment = {
            AccessPath: accessPath,
            Weight: weight,
            IndexName: index.Name,
            IndexType: index.IndexType,
            IsUnique: index.IsUnique,
            HasFilter: hasFilter,
            IncludeFieldCount: includeCount,
        };

        if (!best || candidate.Weight > best.Weight) {
            best = candidate;
        }
    }

    if (best) {
        return best;
    }

    // Fallback when entity metadata declares IsPrimaryKey without an explicit EntityIndex row yet.
    if (targetField.IsPrimaryKey) {
        return {
            AccessPath: 'PrimaryKey',
            Weight: BASE_WEIGHT_BY_ACCESS_PATH.PrimaryKey,
            IndexName: null,
            IndexType: 'BTree',
            IsUnique: true,
            HasFilter: false,
            IncludeFieldCount: 0,
        };
    }

    const rowCount = lookupRowCount(targetEntity, config?.RowCounts);
    const smallThreshold = config?.SmallTableThreshold ?? DEFAULT_SMALL_TABLE_THRESHOLD;
    const scanWeight = rowCount != null && rowCount < smallThreshold
        ? SMALL_TABLE_SCAN_WEIGHT
        : BASE_WEIGHT_BY_ACCESS_PATH.TableScan;

    return {
        AccessPath: 'TableScan',
        Weight: scanWeight,
        IndexName: null,
        IndexType: null,
        IsUnique: false,
        HasFilter: false,
        IncludeFieldCount: 0,
    };
}

function findTargetField(entity: EntityInfo, fieldName?: string | null): EntityFieldInfo | undefined {
    const fields = entity.Fields ?? [];
    if (fieldName) {
        const lower = fieldName.trim().toLowerCase();
        const exact = fields.find((f) => f.Name.trim().toLowerCase() === lower);
        if (exact) {
            return exact;
        }
    }
    return fields.find((f) => f.IsPrimaryKey);
}

/**
 * Metadata-scale derived edge provider that materializes **directed, index-weighted join edges**
 * (`Indexed Join`) between `MJ: Entities` nodes directly from loaded `ctx.Provider.Entities`
 * (`Fields` + `EntityInfo.Indexes` from #6801) with zero database queries.
 *
 * Each foreign key `Child.FK -> Parent.PK` produces two asymmetric directed edges:
 * - `Child -> Parent` weighted by the index on `Parent.PK` (typically a PrimaryKey seek, ~0.95)
 * - `Parent -> Child` weighted by the index on `Child.FK` (~0.85–0.95 if indexed as leading key,
 *   ~0.55 if non-leading key, ~0.20 if unindexed table scan)
 *
 * Pair with `GraphEngine.FindPath(..., { Strategy: 'Weighted', Direction: 'Out' })` to find the
 * cheapest indexed join path between any two entities.
 */
@RegisterClass(BaseGraphEdgeProvider, 'IndexAwareJoinEdgeProvider')
export class IndexAwareJoinEdgeProvider extends BaseGraphEdgeProvider<IndexAwareJoinEdgeProviderConfig> {
    public override async GetEdges(
        request: GraphEdgeRequest,
        ctx: GraphProviderContext<IndexAwareJoinEdgeProviderConfig>,
    ): Promise<GraphEdgeView[]> {
        if (request.Nodes.length === 0 || !MatchesEdgeTypeFilter('Indexed Join', request.EdgeTypes)) {
            return [];
        }

        const entities = ctx.Provider.Entities ?? [];
        const entitiesMetaEntity = ctx.Provider.EntityByName('MJ: Entities');
        const entityById = new UUIDMap<EntityInfo>();
        for (const e of entities) {
            entityById.Set(e.ID, e);
        }

        const frontierEntityIds = new UUIDSet();
        for (const n of request.Nodes) {
            const nameLower = n.EntityName.trim().toLowerCase();
            if (nameLower === 'mj: entities' || nameLower === 'entities') {
                frontierEntityIds.Add(n.RecordID);
            }
        }
        if (frontierEntityIds.Size === 0) {
            return [];
        }

        const wantOut = request.Direction === 'Out' || request.Direction === 'Both';
        const wantIn = request.Direction === 'In' || request.Direction === 'Both';
        const edges: GraphEdgeView[] = [];

        for (const child of entities) {
            if (child.VirtualEntity) {
                continue;
            }
            const childNode: GraphNodeRef = {
                EntityName: 'MJ: Entities',
                EntityID: entitiesMetaEntity?.ID,
                RecordID: child.ID,
            };
            const childKey = FormatGraphNodeKey(childNode.EntityID ?? childNode.EntityName, childNode.RecordID);

            for (const fkField of child.Fields ?? []) {
                if (!fkField.RelatedEntityID) {
                    continue;
                }
                const parent = entityById.Get(fkField.RelatedEntityID);
                if (!parent || parent.VirtualEntity) {
                    continue;
                }

                const parentNode: GraphNodeRef = {
                    EntityName: 'MJ: Entities',
                    EntityID: entitiesMetaEntity?.ID,
                    RecordID: parent.ID,
                };
                const parentKey = FormatGraphNodeKey(parentNode.EntityID ?? parentNode.EntityName, parentNode.RecordID);
                const parentTargetField = findTargetField(parent, fkField.RelatedEntityFieldName);

                // 1. Child -> Parent (join from child FK to parent PK/target field)
                if ((wantOut && frontierEntityIds.Has(child.ID)) || (wantIn && frontierEntityIds.Has(parent.ID))) {
                    const assessment = AssessJoinAccessPath(parent, parentTargetField, ctx.Config);
                    const indexSuffix = assessment.IndexName ? ` via ${assessment.IndexName}` : '';
                    edges.push({
                        ID: `derived:IndexAwareJoinEdgeProvider:Indexed Join:${childKey}:${parentKey}:${fkField.Name}:c2p`,
                        GraphName: ctx.Graph.Name,
                        TypeName: 'Indexed Join',
                        InverseTypeName: 'Indexed Join',
                        Source: childNode,
                        Target: parentNode,
                        IsDirected: true,
                        Weight: assessment.Weight,
                        Description: `${child.Name}.${fkField.Name} -> ${parent.Name}.${parentTargetField?.Name ?? 'ID'} [${assessment.AccessPath}${indexSuffix}]`,
                        Attributes: {
                            Direction: 'ChildToParent',
                            SourceFieldName: fkField.Name,
                            TargetFieldName: parentTargetField?.Name ?? null,
                            AccessPath: assessment.AccessPath,
                            IndexName: assessment.IndexName,
                            IndexType: assessment.IndexType,
                            IsUnique: assessment.IsUnique,
                            HasFilter: assessment.HasFilter,
                            IncludeFieldCount: assessment.IncludeFieldCount,
                        },
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    });
                }

                // 2. Parent -> Child (join from parent PK/target field to child FK field)
                if ((wantOut && frontierEntityIds.Has(parent.ID)) || (wantIn && frontierEntityIds.Has(child.ID))) {
                    const assessment = AssessJoinAccessPath(child, fkField, ctx.Config);
                    const indexSuffix = assessment.IndexName ? ` via ${assessment.IndexName}` : '';
                    edges.push({
                        ID: `derived:IndexAwareJoinEdgeProvider:Indexed Join:${parentKey}:${childKey}:${fkField.Name}:p2c`,
                        GraphName: ctx.Graph.Name,
                        TypeName: 'Indexed Join',
                        InverseTypeName: 'Indexed Join',
                        Source: parentNode,
                        Target: childNode,
                        IsDirected: true,
                        Weight: assessment.Weight,
                        Description: `${parent.Name}.${parentTargetField?.Name ?? 'ID'} -> ${child.Name}.${fkField.Name} [${assessment.AccessPath}${indexSuffix}]`,
                        Attributes: {
                            Direction: 'ParentToChild',
                            SourceFieldName: parentTargetField?.Name ?? null,
                            TargetFieldName: fkField.Name,
                            AccessPath: assessment.AccessPath,
                            IndexName: assessment.IndexName,
                            IndexType: assessment.IndexType,
                            IsUnique: assessment.IsUnique,
                            HasFilter: assessment.HasFilter,
                            IncludeFieldCount: assessment.IncludeFieldCount,
                        },
                        Origin: 'Derived',
                        Status: 'Approved',
                        Confidence: null,
                    });
                }
            }
        }

        return edges;
    }
}

/** Tree-shaking anchor for {@link IndexAwareJoinEdgeProvider}. */
export function LoadIndexAwareJoinEdgeProvider(): void {
    // Reference class to prevent tree-shaking
    void IndexAwareJoinEdgeProvider;
}
