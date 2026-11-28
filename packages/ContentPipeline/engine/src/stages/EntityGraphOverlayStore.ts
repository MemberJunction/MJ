/**
 * @fileoverview Production {@link IGraphOverlayStore} implementation backed by MemberJunction
 * entity objects (`MJ: Graph Concepts`, `MJ: Graph Edges`, `MJ: Graph Concept Types`,
 * `MJ: Graph Authority Tiers`, `MJ: Graph Edge Types`) and batched `RunView` queries.
 *
 * Used automatically by {@link GraphStage} when no custom store is injected and `!context.IsTest`.
 *
 * @module @memberjunction/content-pipeline
 */

import { CompositeKey, IMetadataProvider, LogError, LogStatus, RunView, ServerOperationScopeManager, UserInfo } from '@memberjunction/core';
import {
    GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION,
    GraphEdgeEndpointAllows,
    type GraphEdgeEndpointRule,
    NormalizeGraphEdgeTypeName,
    MJActionEntity,
    MJEntityAlternateBaseViewEntity,
    MJGraphAuthorityTierEntity,
    MJGraphConceptEntity,
    MJGraphConceptTypeEntity,
    MJGraphEdgeEntity,
    MJGraphEdgeTypeEntity,
    MJGraphEntity,
    MJGraphTypeEntity,
    MJQueryEntity,
} from '@memberjunction/core-entities';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    ExistingGraphConceptSeed,
    FindAuthorityTier,
    GraphAuthorityTier,
    GraphAuthorityTierDescriptor,
    GraphConceptType,
    GraphConceptTypeDescriptor,
    GraphTypeDescriptor,
    GroundingModeFromGraphTypeValue,
    ResolvedGraphOverlayConfig,
    SchemaGroundingTarget,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
    TaxonomyModeFromGraphTypeValue,
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
    private edgeTypeEndpoints: GraphEdgeEndpointRule[] = [];
    private edgeTypesLoaded = false;
    private conceptIDByNameCache = new Map<string, string>();
    private rejectedEdgeCount = 0;

    /**
     * Synthesized edges this store refused to write because they break the edge-type contract: an
     * edge type with no `MJ: Graph Edge Types` row, an endpoint entity not in metadata, or an endpoint
     * entity the type's `MJ: Graph Edge Type Endpoints` rows do not allow. Each refusal is also logged.
     */
    public get RejectedEdgeCount(): number {
        return this.rejectedEdgeCount;
    }

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
            const tierName = (row.AuthorityTierID ? tierNameByID.get(row.AuthorityTierID.toLowerCase()) : undefined) ?? row.AuthorityTier ?? undefined;
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

    /**
     * The `MJ: Graph Types` row of the graph, with its overlay defaults. Returns `null` when the graph
     * or its type cannot be read. Two plain reads rather than one subquery, so the filter stays
     * dialect-neutral.
     */
    public async LoadGraphType(
        graphID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<GraphTypeDescriptor | null> {
        const rv = RunView.FromMetadataProvider(provider);
        const graphResult = await rv.RunView<MJGraphEntity>(
            { EntityName: 'MJ: Graphs', Fields: ['ID', 'GraphTypeID'], ExtraFilter: WhereEqual({ ID: graphID }), ResultType: 'simple', MaxRows: 1 },
            contextUser,
        );
        const graphTypeID = graphResult.Success ? graphResult.Results?.[0]?.GraphTypeID : undefined;
        if (!graphTypeID) {
            LogError(`EntityGraphOverlayStore.LoadGraphType: graph '${graphID}' could not be read: ${graphResult.ErrorMessage ?? 'not found'}`);
            return null;
        }
        const typeResult = await rv.RunView<MJGraphTypeEntity>(
            { EntityName: 'MJ: Graph Types', ExtraFilter: WhereEqual({ ID: graphTypeID }), ResultType: 'simple', MaxRows: 1 },
            contextUser,
        );
        const row = typeResult.Success ? typeResult.Results?.[0] : undefined;
        if (!row) {
            LogError(`EntityGraphOverlayStore.LoadGraphType: graph type '${graphTypeID}' could not be read: ${typeResult.ErrorMessage ?? 'not found'}`);
            return null;
        }
        return {
            ID: row.ID,
            Name: row.Name,
            Description: row.Description,
            IsCanon: row.IsCanon,
            Rank: row.Rank,
            IconClass: row.IconClass,
            DefaultAuthorityTierID: row.DefaultAuthorityTierID,
            DefaultConceptTaxonomyMode: TaxonomyModeFromGraphTypeValue(row.DefaultConceptTaxonomyMode),
            DefaultGroundingMode: GroundingModeFromGraphTypeValue(row.DefaultGroundingMode),
        };
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
            if (!loadedExisting) {
                throw new Error(
                    `Could not load existing MJ: Graph Concepts record '${concept.ExistingConceptID}' in graph '${graphID}'.`,
                );
            }
        }

        if (loadedExisting && (entity.Status === 'Approved' || entity.Status === 'Deprecated')) {
            // Preserve human-governed Approved and Deprecated concepts in place: pipeline re-runs may link
            // new edges to an existing Approved concept ID, but must never overwrite its definition or status
            // without a Graph: Approve Edges steward.
            this.conceptIDByNameCache.set(`${graphID.toLowerCase()}::${entity.Name.trim().toLowerCase()}`, entity.ID);
            return entity.ID;
        }

        if (!loadedExisting) {
            entity.NewRecord();
            entity.GraphID = graphID;
            entity.Status = status;
            // Synthesized from document chunks: the provenance access policy keeps it behind its
            // sources even after they are retracted (an authored concept stays 'Declared').
            entity.Origin = 'Inferred';
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

        const saved = await this.saveEntityUnderPipelinePolicy(entity, 'MJ: Graph Concepts', contextUser);
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
            const contract = this.checkEdgeContract(edge, provider);
            if (typeof contract === 'string') {
                this.rejectEdge(edge, contract);
                continue;
            }
            const { EdgeTypeID: edgeTypeID, SourceEntityID: sourceEntityID, TargetEntityID: targetEntityID } = contract;

            const sourceRecordID = this.resolveEndpointRecordID(graphID, conceptID, edge.SourceRecordID);
            const targetRecordID = this.resolveEndpointRecordID(graphID, conceptID, edge.TargetRecordID);
            if (!sourceRecordID || !targetRecordID) {
                continue;
            }

            const edgeEntity = await provider.GetEntityObject<MJGraphEdgeEntity>('MJ: Graph Edges', contextUser);
            edgeEntity.NewRecord();
            edgeEntity.GraphID = graphID;
            edgeEntity.EdgeTypeID = edgeTypeID;
            edgeEntity.SourceEntityID = sourceEntityID;
            edgeEntity.SourceRecordID = sourceRecordID;
            edgeEntity.TargetEntityID = targetEntityID;
            edgeEntity.TargetRecordID = targetRecordID;
            edgeEntity.Weight = edge.Weight;
            edgeEntity.Confidence = edge.Confidence;
            edgeEntity.Origin = edge.Origin ?? 'Inferred';
            edgeEntity.Status = edge.EdgeTypeName === 'Contradicts' ? 'Proposed' : status;
            edgeEntity.Description = edge.Description;
            edgeEntity.Attributes = edge.Attributes ? JSON.stringify(edge.Attributes) : null;

            if (await this.saveEntityUnderPipelinePolicy(edgeEntity, 'MJ: Graph Edges', contextUser)) {
                savedCount++;
            } else {
                LogError(
                    `EntityGraphOverlayStore.UpsertEdges failed to save '${edge.EdgeTypeName}' edge: ${edgeEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }

        return savedCount;
    }

    /**
     * Checks a synthesized edge against the edge-type contract before anything is written (Canon Rule 2):
     * its type must resolve to an `MJ: Graph Edge Types` row, both endpoint entities must exist, and each
     * endpoint entity must be allowed by the type's `MJ: Graph Edge Type Endpoints` rows. Returns the
     * resolved IDs, or the reason the edge breaks the contract. `MJGraphEdgeEntityServer` checks the same
     * rows on save; checking here keeps a malformed proposal out of the review queue and out of the log
     * of failed saves.
     */
    private checkEdgeContract(
        edge: SynthesizedGraphEdge,
        provider: IMetadataProvider,
    ): { EdgeTypeID: string; SourceEntityID: string; TargetEntityID: string } | string {
        const edgeTypeID = this.resolveEdgeTypeID(edge.EdgeTypeName);
        if (!edgeTypeID) {
            return `edge type '${edge.EdgeTypeName}' has no MJ: Graph Edge Types row`;
        }
        const sourceEntity = provider.EntityByName(edge.SourceEntityName);
        const targetEntity = provider.EntityByName(edge.TargetEntityName);
        if (!sourceEntity || !targetEntity) {
            return `endpoint entity '${!sourceEntity ? edge.SourceEntityName : edge.TargetEntityName}' is not in metadata`;
        }
        if (!GraphEdgeEndpointAllows(this.edgeTypeEndpoints, edgeTypeID, 'Source', sourceEntity.ID)) {
            return `'${edge.SourceEntityName}' is not an allowed Source for '${edge.EdgeTypeName}'`;
        }
        if (!GraphEdgeEndpointAllows(this.edgeTypeEndpoints, edgeTypeID, 'Target', targetEntity.ID)) {
            return `'${edge.TargetEntityName}' is not an allowed Target for '${edge.EdgeTypeName}'`;
        }
        return { EdgeTypeID: edgeTypeID, SourceEntityID: sourceEntity.ID, TargetEntityID: targetEntity.ID };
    }

    /** Counts and logs an edge refused by {@link checkEdgeContract}; nothing is written for it. */
    private rejectEdge(edge: SynthesizedGraphEdge, reason: string): void {
        this.rejectedEdgeCount++;
        LogStatus(
            `EntityGraphOverlayStore: not writing '${edge.EdgeTypeName}' edge ` +
                `${edge.SourceEntityName} '${edge.SourceRecordID}' -> ${edge.TargetEntityName} '${edge.TargetRecordID}': ${reason}.`,
        );
    }

    /**
     * Saves a newly synthesized graph concept or edge inside {@link GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION},
     * bound to the run's user and the single target entity (`'MJ: Graph Concepts'` or `'MJ: Graph Edges'`).
     * The row's `Approved` status comes from the content source's `GraphOverlay` policy rather than the
     * triggering user's own `Graph: Approve Edges` grant. Client CRUD boundaries mask this scope, and
     * entity-server validation rejects anything except newly created policy-approved rows.
     */
    private saveEntityUnderPipelinePolicy(
        entity: MJGraphConceptEntity | MJGraphEdgeEntity,
        entityName: 'MJ: Graph Concepts' | 'MJ: Graph Edges',
        contextUser: UserInfo,
    ): Promise<boolean> {
        return ServerOperationScopeManager.Instance.RunWithAuthority(
            {
                operationKey: GRAPH_PIPELINE_EDGE_APPROVAL_OPERATION,
                source: 'ServerEngine',
                allowedEntities: [entityName],
                userId: contextUser.ID,
            },
            () => entity.Save(),
        );
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
        if (!concept.AuthorityTier) {
            return null; // unranked
        }
        const tiers = await this.LoadAuthorityTiers(contextUser, provider);
        return FindAuthorityTier(concept.AuthorityTier, tiers)?.ID ?? null;
    }

    private async ensureEdgeTypesLoaded(
        graphID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        if (this.edgeTypesLoaded) {
            return;
        }
        const rv = RunView.FromMetadataProvider(provider);
        const [types, endpoints] = await rv.RunViews(
            [
                { EntityName: 'MJ: Graph Edge Types', Fields: ['ID', 'Name', 'GraphID'], ResultType: 'simple' },
                { EntityName: 'MJ: Graph Edge Type Endpoints', Fields: ['EdgeTypeID', 'Side', 'EntityID'], ResultType: 'simple' },
            ],
            contextUser,
        );
        if (!types?.Success) {
            // With no edge types every edge is refused as unknown; log it and try again on the next call.
            LogError(`EntityGraphOverlayStore.ensureEdgeTypesLoaded failed: ${types?.ErrorMessage || 'no result'}`);
            return;
        }
        for (const row of (types.Results ?? []) as Array<Pick<MJGraphEdgeTypeEntity, 'ID' | 'Name' | 'GraphID'>>) {
            if (!row.GraphID || UUIDsEqual(row.GraphID, graphID)) {
                this.edgeTypesByNameCache.set(NormalizeGraphEdgeTypeName(row.Name), row.ID);
            }
        }
        if (!endpoints?.Success) {
            // Edges are then checked by type only here; MJGraphEdgeEntityServer still refuses one that
            // breaks its endpoint rows when it is saved. Try the endpoint rows again on the next call.
            LogError(`EntityGraphOverlayStore.ensureEdgeTypesLoaded could not read MJ: Graph Edge Type Endpoints: ${endpoints?.ErrorMessage || 'no result'}`);
            return;
        }
        this.edgeTypeEndpoints = (endpoints.Results ?? []) as GraphEdgeEndpointRule[];
        this.edgeTypesLoaded = true;
    }

    private resolveEdgeTypeID(edgeTypeName: string): string | null {
        return this.edgeTypesByNameCache.get(NormalizeGraphEdgeTypeName(edgeTypeName)) ?? null;
    }

    private resolveEndpointRecordID(graphID: string, currentConceptID: string, rawID: string): string | null {
        if (!rawID.startsWith('concept:')) {
            return rawID;
        }
        const conceptName = rawID.slice('concept:'.length).trim().toLowerCase();
        return this.conceptIDByNameCache.get(`${graphID.toLowerCase()}::${conceptName}`) ?? currentConceptID;
    }
}
