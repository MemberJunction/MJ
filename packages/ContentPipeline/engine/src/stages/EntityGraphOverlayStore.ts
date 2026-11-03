/**
 * @fileoverview Production {@link IGraphOverlayStore} implementation backed by MemberJunction
 * entity objects (`MJ: Graph Concepts`, `MJ: Graph Edges`, `MJ: Graph Concept Types`,
 * `MJ: Graph Authority Tiers`, `MJ: Graph Edge Types`) and batched `RunView` queries.
 *
 * Used automatically by {@link GraphStage} when no custom store is injected and `!context.IsTest`.
 *
 * @module @memberjunction/content-pipeline
 */

import { CompositeKey, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
    MJActionEntity,
    MJEntityAlternateBaseViewEntity,
    MJGraphAuthorityTierEntity,
    MJGraphConceptEntity,
    MJGraphConceptTypeEntity,
    MJGraphEdgeEntity,
    MJGraphEdgeTypeEntity,
    MJQueryEntity,
} from '@memberjunction/core-entities';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    ExistingGraphConceptSeed,
    GraphAuthorityTier,
    GraphAuthorityTierDescriptor,
    GraphConceptType,
    GraphConceptTypeDescriptor,
    ResolvedGraphOverlayConfig,
    SchemaGroundingTarget,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
} from '@memberjunction/content-pipeline-base';
import { WhereEqual } from '../Filters.js';
import type { GraphStageUpsertStatus, IGraphOverlayStore } from './GraphStage.js';

/**
 * Strongly-typed entity-backed {@link IGraphOverlayStore} for persisting and loading
 * `MJ: Graph Concepts` and `MJ: Graph Edges` during Content Pipeline `GraphStage` runs.
 */
export class EntityGraphOverlayStore implements IGraphOverlayStore {
    private conceptTypesCache: GraphConceptTypeDescriptor[] | null = null;
    private authorityTiersCache: GraphAuthorityTierDescriptor[] | null = null;
    private edgeTypesByNameCache = new Map<string, string>();
    private conceptIDByNameCache = new Map<string, string>();

    public async LoadExistingConcepts(
        graphID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ExistingGraphConceptSeed[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJGraphConceptEntity>(
            {
                EntityName: 'MJ: Graph Concepts',
                ExtraFilter: WhereEqual({ GraphID: graphID }),
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`EntityGraphOverlayStore.LoadExistingConcepts failed for GraphID '${graphID}': ${result.ErrorMessage}`);
            return [];
        }

        const tiers = await this.LoadAuthorityTiers(contextUser, provider);
        const tierNameByID = new Map<string, GraphAuthorityTier>(tiers.map((t) => [t.ID.toLowerCase(), t.Name]));

        const seeds: ExistingGraphConceptSeed[] = [];
        for (const row of result.Results ?? []) {
            this.conceptIDByNameCache.set(`${graphID.toLowerCase()}::${row.Name.trim().toLowerCase()}`, row.ID);
            const parsedSynonyms = row.Synonyms ? (SafeJSONParse<string[]>(row.Synonyms) ?? []) : [];
            const tierName = row.AuthorityTierID
                ? (tierNameByID.get(row.AuthorityTierID.toLowerCase()) ?? row.AuthorityTier ?? 'Reference')
                : 'Reference';
            seeds.push({
                ConceptID: row.ID,
                Name: row.Name,
                ConceptType: (row.ConceptType ?? 'Term') as GraphConceptType,
                ConceptTypeID: row.ConceptTypeID,
                Synonyms: Array.isArray(parsedSynonyms) ? parsedSynonyms : [],
                Description: row.Description,
                Specification: row.Specification,
                AuthorityTier: tierName,
                AuthorityTierID: row.AuthorityTierID,
                Status: row.Status,
            });
        }
        return seeds;
    }

    public async LoadConceptTypes(
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<GraphConceptTypeDescriptor[]> {
        if (this.conceptTypesCache) {
            return this.conceptTypesCache;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJGraphConceptTypeEntity>(
            {
                EntityName: 'MJ: Graph Concept Types',
                ExtraFilter: WhereEqual({ Status: 'Active' }),
                OrderBy: 'Rank ASC, Name ASC',
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`EntityGraphOverlayStore.LoadConceptTypes failed: ${result.ErrorMessage}`);
            return [];
        }
        this.conceptTypesCache = (result.Results ?? []).map((row) => ({
            ID: row.ID,
            Name: row.Name as GraphConceptType,
            Description: row.Description,
            Rank: row.Rank,
            IconClass: row.IconClass,
        }));
        return this.conceptTypesCache;
    }

    public async LoadAuthorityTiers(
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<GraphAuthorityTierDescriptor[]> {
        if (this.authorityTiersCache) {
            return this.authorityTiersCache;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<MJGraphAuthorityTierEntity>(
            {
                EntityName: 'MJ: Graph Authority Tiers',
                ExtraFilter: WhereEqual({ Status: 'Active' }),
                OrderBy: 'Rank DESC, Name ASC',
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`EntityGraphOverlayStore.LoadAuthorityTiers failed: ${result.ErrorMessage}`);
            return [];
        }
        this.authorityTiersCache = (result.Results ?? []).map((row) => ({
            ID: row.ID,
            Name: row.Name as GraphAuthorityTier,
            Description: row.Description,
            Rank: row.Rank,
            IconClass: row.IconClass,
        }));
        return this.authorityTiersCache;
    }

    public async LoadGroundingTargets(
        groundingMode: ResolvedGraphOverlayConfig['GroundingMode'],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<SchemaGroundingTarget[]> {
        if (groundingMode === 'none') {
            return [];
        }
        const targets: SchemaGroundingTarget[] = [];

        for (const ent of provider.Entities) {
            targets.push({
                EntityName: 'MJ: Entities',
                RecordID: ent.ID,
                Name: ent.Name,
                Description: ent.Description,
                SynonymsOrKeywords: [ent.BaseTable, ent.BaseView].filter((s): s is string => Boolean(s)),
            });
        }

        const rv = RunView.FromMetadataProvider(provider);
        const batchParams = [
            {
                EntityName: 'MJ: Entity Alternate Base Views',
                ExtraFilter: WhereEqual({ Status: 'Approved' }),
                ResultType: 'simple' as const,
            },
            {
                EntityName: 'MJ: Queries',
                ExtraFilter: WhereEqual({ Status: 'Approved' }),
                ResultType: 'simple' as const,
            },
            ...(groundingMode === 'full-canon'
                ? [
                      {
                          EntityName: 'MJ: Actions',
                          ExtraFilter: WhereEqual({ Status: 'Active' }),
                          ResultType: 'simple' as const,
                      },
                  ]
                : []),
        ];

        const results = await rv.RunViews(batchParams, contextUser);
        const abvRows = (results[0]?.Success ? results[0].Results : []) as MJEntityAlternateBaseViewEntity[];
        for (const abv of abvRows) {
            targets.push({
                EntityName: 'MJ: Entity Alternate Base Views',
                RecordID: abv.ID,
                Name: abv.Name,
                Description: abv.Description,
                SynonymsOrKeywords: [abv.ViewName],
            });
        }

        const queryRows = (results[1]?.Success ? results[1].Results : []) as MJQueryEntity[];
        for (const q of queryRows) {
            targets.push({
                EntityName: 'MJ: Queries',
                RecordID: q.ID,
                Name: q.Name,
                Description: q.Description,
            });
        }

        if (groundingMode === 'full-canon' && results[2]?.Success) {
            const actionRows = results[2].Results as MJActionEntity[];
            for (const act of actionRows) {
                targets.push({
                    EntityName: 'MJ: Actions',
                    RecordID: act.ID,
                    Name: act.Name,
                    Description: act.Description,
                });
            }
        }

        return targets;
    }

    public async UpsertConcept(
        graphID: string,
        concept: SynthesizedGraphConcept,
        status: GraphStageUpsertStatus,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string> {
        const entity = await provider.GetEntityObject<MJGraphConceptEntity>('MJ: Graph Concepts', contextUser);
        let loadedExisting = false;

        if (concept.ExistingConceptID) {
            loadedExisting = await entity.InnerLoad(CompositeKey.FromID(concept.ExistingConceptID)); // first-pk-ok: single PK ID
        }

        if (!loadedExisting) {
            entity.NewRecord();
            entity.GraphID = graphID;
            entity.Status = status;
        }

        const conceptTypeID = await this.resolveConceptTypeID(concept, contextUser, provider);
        if (!conceptTypeID) {
            throw new Error(`Could not resolve ConceptTypeID for concept '${concept.Name}' (type '${concept.ConceptType}')`);
        }
        const authorityTierID = await this.resolveAuthorityTierID(concept, contextUser, provider);

        entity.Name = concept.Name;
        entity.ConceptTypeID = conceptTypeID;
        entity.AuthorityTierID = authorityTierID;
        entity.Description = concept.Description;
        entity.Specification = concept.Specification;
        entity.Synonyms = concept.Synonyms.length > 0 ? JSON.stringify(concept.Synonyms) : null;

        if (concept.ParentConceptName) {
            const parentID = this.conceptIDByNameCache.get(
                `${graphID.toLowerCase()}::${concept.ParentConceptName.trim().toLowerCase()}`,
            );
            if (parentID && !UUIDsEqual(parentID, entity.ID)) {
                entity.ParentID = parentID;
            }
        }

        const saved = await entity.Save();
        if (!saved) {
            throw new Error(
                `Failed to save MJ: Graph Concepts '${concept.Name}': ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }

        this.conceptIDByNameCache.set(`${graphID.toLowerCase()}::${entity.Name.trim().toLowerCase()}`, entity.ID);
        return entity.ID;
    }

    public async UpsertEdges(
        graphID: string,
        conceptID: string,
        edges: readonly SynthesizedGraphEdge[],
        status: GraphStageUpsertStatus,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<number> {
        await this.ensureEdgeTypesLoaded(graphID, contextUser, provider);
        let savedCount = 0;

        for (const edge of edges) {
            const edgeTypeID = this.resolveEdgeTypeID(edge.EdgeTypeName);
            if (!edgeTypeID) {
                continue;
            }
            const sourceEnt = provider.Entities.find((e) => e.Name === edge.SourceEntityName);
            const targetEnt = provider.Entities.find((e) => e.Name === edge.TargetEntityName);
            if (!sourceEnt || !targetEnt) {
                continue;
            }

            const sourceRecordID = this.resolveEndpointRecordID(graphID, conceptID, edge.SourceRecordID);
            const targetRecordID = this.resolveEndpointRecordID(graphID, conceptID, edge.TargetRecordID);
            if (!sourceRecordID || !targetRecordID) {
                continue;
            }

            const edgeEntity = await provider.GetEntityObject<MJGraphEdgeEntity>('MJ: Graph Edges', contextUser);
            edgeEntity.NewRecord();
            edgeEntity.GraphID = graphID;
            edgeEntity.EdgeTypeID = edgeTypeID;
            edgeEntity.SourceEntityID = sourceEnt.ID;
            edgeEntity.SourceRecordID = sourceRecordID;
            edgeEntity.TargetEntityID = targetEnt.ID;
            edgeEntity.TargetRecordID = targetRecordID;
            edgeEntity.Weight = edge.Weight;
            edgeEntity.Confidence = edge.Confidence;
            edgeEntity.Origin = edge.Origin ?? 'Inferred';
            edgeEntity.Status = edge.EdgeTypeName === 'Contradicts' ? 'Proposed' : status;
            edgeEntity.Description = edge.Description;
            edgeEntity.Attributes = edge.Attributes ? JSON.stringify(edge.Attributes) : null;

            if (await edgeEntity.Save()) {
                savedCount++;
            } else {
                LogError(
                    `EntityGraphOverlayStore.UpsertEdges failed to save '${edge.EdgeTypeName}' edge: ${edgeEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }

        return savedCount;
    }

    private async resolveConceptTypeID(
        concept: SynthesizedGraphConcept,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        if (concept.ConceptTypeID) {
            return concept.ConceptTypeID;
        }
        const types = await this.LoadConceptTypes(contextUser, provider);
        const lower = concept.ConceptType.trim().toLowerCase();
        const matched = types.find((t) => t.Name.trim().toLowerCase() === lower);
        if (matched) {
            return matched.ID;
        }
        return types.find((t) => t.Name.trim().toLowerCase() === 'term')?.ID ?? types[0]?.ID ?? null;
    }

    private async resolveAuthorityTierID(
        concept: SynthesizedGraphConcept,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        if (concept.AuthorityTierID) {
            return concept.AuthorityTierID;
        }
        const tiers = await this.LoadAuthorityTiers(contextUser, provider);
        const norm = concept.AuthorityTier.trim().toLowerCase().replace(/\s+/g, '');
        const matched = tiers.find((t) => t.Name.trim().toLowerCase().replace(/\s+/g, '') === norm);
        if (matched) {
            return matched.ID;
        }
        return tiers.find((t) => t.Name.trim().toLowerCase() === 'reference')?.ID ?? null;
    }

    private async ensureEdgeTypesLoaded(
        graphID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        if (this.edgeTypesByNameCache.size > 0) {
            return;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const res = await rv.RunView<MJGraphEdgeTypeEntity>(
            {
                EntityName: 'MJ: Graph Edge Types',
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!res.Success) {
            LogError(`EntityGraphOverlayStore.ensureEdgeTypesLoaded failed: ${res.ErrorMessage}`);
            return;
        }
        for (const row of res.Results ?? []) {
            if (!row.GraphID || UUIDsEqual(row.GraphID, graphID)) {
                const normName = row.Name.trim().toLowerCase().replace(/\s+/g, '');
                this.edgeTypesByNameCache.set(normName, row.ID);
            }
        }
    }

    private resolveEdgeTypeID(edgeTypeName: string): string | null {
        const norm = edgeTypeName.trim().toLowerCase().replace(/\s+/g, '');
        return this.edgeTypesByNameCache.get(norm) ?? null;
    }

    private resolveEndpointRecordID(graphID: string, currentConceptID: string, rawID: string): string | null {
        if (!rawID.startsWith('concept:')) {
            return rawID;
        }
        const conceptName = rawID.slice('concept:'.length).trim().toLowerCase();
        return this.conceptIDByNameCache.get(`${graphID.toLowerCase()}::${conceptName}`) ?? currentConceptID;
    }
}
