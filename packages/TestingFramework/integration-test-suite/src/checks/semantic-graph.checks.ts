/**
 * @fileoverview Integration check bundle `'semantic-graph'` (IT162) — verifies the Semantic Graph
 * substrate (`MJ: Graphs`, `MJ: Graph Edge Types`, `MJ: Graph Edge Type Endpoints`,
 * `MJ: Graph Edge Providers`, `MJ: Graph Edges`, `MJ: Graph Concepts`, and `MJ: Content Sources.GraphID`),
 * the Content Pipeline `GraphStage` overlay (`ClusterContentIntoConceptSeeds` + `ManagedPromptConceptSynthesizer`),
 * and Executable Canon deterministic `TaskGraph` DAG similarity & workflow health telemetry.
 *
 * Registered check IDs:
 *   - `semantic-graph.SG1` — Metadata coherence across all 6 Semantic Graph entities, `ContentSource.GraphID`, value lists, and polymorphic FK `EntityIDFieldName`
 *   - `semantic-graph.SG2` — Physical catalog PK, UQ, FK, and CHECK constraints on all 6 Graph tables + `FK_ContentSource_Graph`
 *   - `semantic-graph.SG3` — Live `RunView` (`simple` and `count_only`) across all 6 Semantic Graph base views and `MJ: Content Sources`
 *   - `semantic-graph.SG4` — (`RequiresMutation: true`) Live DB entity CRUD (`MJGraphEntity`, `MJGraphConceptEntity`, `MJGraphEdgeTypeEntity`, `MJGraphEdgeEntity`), virtual view columns, and self-loop/self-parent CHECK enforcement
 *   - `semantic-graph.SG5` — Content Pipeline `GraphStage` end-to-end execution with live `ctx.Provider.Entities` schema grounding and cross-source authority conflict detection
 *   - `semantic-graph.SG6` — Executable Canon deterministic `TaskGraph` DAG fingerprinting, WL isomorphism invariance, and `DiscoverWorkflowPromotionCandidates`
 *   - `semantic-graph.SG7` — Executable Canon `EvaluateWorkflowCanonHealth` telemetry across `Dormant`, `UsageDecay` vs. seasonal slowdown, `ExceptionSpike`, `OutcomeDrift`, and `ShadowBypassed`
 */

import { RunView } from '@memberjunction/core';
import {
    MJGraphConceptEntity,
    MJGraphConceptTypeEntity,
    MJGraphEdgeEntity,
    MJGraphEdgeTypeEntity,
    MJGraphEntity,
    MJGraphTypeEntity,
} from '@memberjunction/core-entities';
import {
    CompareDAGFingerprints,
    ComputeDAGFingerprint,
    DiscoverWorkflowPromotionCandidates,
    EvaluateWorkflowCanonHealth,
    TaskNode,
    type ExecutedTaskGraphRecord,
    type SavedWorkflowRecord,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type WorkflowRunTelemetryRecord,
} from '@memberjunction/ai-core-plus';
import {
    BasePipelineStage,
    ClassifiedTag,
    ContentChunkSeedInput,
    ExistingGraphConceptSeed,
    SchemaGroundingTarget,
    StageContext,
    SynthesizedGraphConcept,
    SynthesizedGraphEdge,
    WorkingRecord,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import {
    GRAPH_STAGE,
    GraphStage,
    GraphStageExecutionSummary,
    IGraphOverlayStore,
    TAG_STAGE,
} from '@memberjunction/content-pipeline';
import {
    Assert,
    AssertEqual,
    IntegrationCheckContext,
    IntegrationCheckRegistry,
    NamedCheck,
    SkipCheck,
} from '@memberjunction/testing-integration';

interface CatalogQueryProvider {
    PlatformKey?: string;
    ExecuteSQL?<T>(query: string): Promise<T[]>;
}

const GRAPH_ENTITIES: ReadonlyArray<{
    EntityName: string;
    BaseTable: string;
    BaseView: string;
    RequiredFields: readonly string[];
}> = [
    {
        EntityName: 'MJ: Graph Types',
        BaseTable: 'GraphType',
        BaseView: 'vwGraphTypes',
        RequiredFields: ['ID', 'Name', 'Description', 'IsCanon', 'Rank', 'IconClass', 'Status'],
    },
    {
        EntityName: 'MJ: Graph Concept Types',
        BaseTable: 'GraphConceptType',
        BaseView: 'vwGraphConceptTypes',
        RequiredFields: ['ID', 'Name', 'Description', 'Rank', 'IconClass', 'Status'],
    },
    {
        EntityName: 'MJ: Graphs',
        BaseTable: 'Graph',
        BaseView: 'vwGraphs',
        RequiredFields: ['ID', 'Name', 'Description', 'GraphTypeID', 'GraphType', 'LoadMode', 'Status'],
    },
    {
        EntityName: 'MJ: Graph Edge Types',
        BaseTable: 'GraphEdgeType',
        BaseView: 'vwGraphEdgeTypes',
        RequiredFields: ['ID', 'GraphID', 'Name', 'Description', 'IsDirected', 'InverseName', 'DefaultWeight', 'AllowStored'],
    },
    {
        EntityName: 'MJ: Graph Edge Type Endpoints',
        BaseTable: 'GraphEdgeTypeEndpoint',
        BaseView: 'vwGraphEdgeTypeEndpoints',
        RequiredFields: ['ID', 'EdgeTypeID', 'Side', 'EntityID'],
    },
    {
        EntityName: 'MJ: Graph Edge Providers',
        BaseTable: 'GraphEdgeProvider',
        BaseView: 'vwGraphEdgeProviders',
        RequiredFields: ['ID', 'GraphID', 'Name', 'Description', 'DriverClass', 'Configuration', 'Sequence', 'IsActive'],
    },
    {
        EntityName: 'MJ: Graph Edges',
        BaseTable: 'GraphEdge',
        BaseView: 'vwGraphEdges',
        RequiredFields: [
            'ID',
            'GraphID',
            'EdgeTypeID',
            'SourceEntityID',
            'SourceRecordID',
            'TargetEntityID',
            'TargetRecordID',
            'Weight',
            'Description',
            'Attributes',
            'Origin',
            'Status',
            'Confidence',
        ],
    },
    {
        EntityName: 'MJ: Graph Concepts',
        BaseTable: 'GraphConcept',
        BaseView: 'vwGraphConcepts',
        RequiredFields: [
            'ID',
            'GraphID',
            'ParentID',
            'Name',
            'ConceptTypeID',
            'ConceptType',
            'Description',
            'Specification',
            'Synonyms',
            'AuthorityTier',
            'Status',
        ],
    },
];

// ─── SG1: Metadata coherence, FK links, and polymorphic EntityIDFieldName ────

async function checkSg1MetadataCoherence(ctx: IntegrationCheckContext): Promise<void> {
    for (const spec of GRAPH_ENTITIES) {
        const ent = ctx.Provider.Entities.find((e) => e.Name === spec.EntityName);
        Assert(ent !== undefined, `Entity '${spec.EntityName}' must exist in Provider.Entities`);
        AssertEqual(ent!.BaseTable, spec.BaseTable, `${spec.EntityName} BaseTable`);
        AssertEqual(ent!.BaseView, spec.BaseView, `${spec.EntityName} BaseView`);

        const fieldNames = new Set(ent!.Fields.map((f) => f.Name));
        const missing = spec.RequiredFields.filter((f) => !fieldNames.has(f));
        Assert(
            missing.length === 0,
            `${spec.EntityName} missing required fields: ${missing.join(', ')}`,
        );
    }

    // Verify Graph.GraphTypeID FK metadata points to MJ: Graph Types
    const graphsEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Graphs')!;
    const graphTypeIdField = graphsEnt.Fields.find((f) => f.Name === 'GraphTypeID');
    AssertEqual(
        graphTypeIdField?.RelatedEntity,
        'MJ: Graph Types',
        'MJ: Graphs.GraphTypeID RelatedEntity',
    );

    // Verify GraphConcept.ConceptTypeID FK metadata points to MJ: Graph Concept Types
    const conceptsEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Graph Concepts')!;
    const conceptTypeIdField = conceptsEnt.Fields.find((f) => f.Name === 'ConceptTypeID');
    AssertEqual(
        conceptTypeIdField?.RelatedEntity,
        'MJ: Graph Concept Types',
        'MJ: Graph Concepts.ConceptTypeID RelatedEntity',
    );

    // Verify polymorphic EntityIDFieldName on MJ: Graph Edges (SourceRecordID -> SourceEntityID, TargetRecordID -> TargetEntityID)
    const edgesEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Graph Edges')!;
    const sourceRecordField = edgesEnt.Fields.find((f) => f.Name === 'SourceRecordID');
    const targetRecordField = edgesEnt.Fields.find((f) => f.Name === 'TargetRecordID');
    AssertEqual(
        sourceRecordField?.EntityIDFieldName,
        'SourceEntityID',
        'MJ: Graph Edges.SourceRecordID EntityIDFieldName',
    );
    AssertEqual(
        targetRecordField?.EntityIDFieldName,
        'TargetEntityID',
        'MJ: Graph Edges.TargetRecordID EntityIDFieldName',
    );

    // Verify ContentSource.GraphID exists and points to MJ: Graphs
    const contentSourcesEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Content Sources');
    const graphIdField = contentSourcesEnt?.Fields.find((f) => f.Name === 'GraphID');
    Assert(graphIdField !== undefined, 'MJ: Content Sources.GraphID must exist');
    AssertEqual(
        graphIdField!.RelatedEntity,
        'MJ: Graphs',
        'MJ: Content Sources.GraphID RelatedEntity',
    );
}

// ─── SG2: Physical catalog constraints ───────────────────────────────────────

async function checkSg2PhysicalConstraints(ctx: IntegrationCheckContext): Promise<void> {
    const expectedConstraints = [
        'PK_GraphType',
        'UQ_GraphType_Name',
        'CK_GraphType_Status',
        'PK_GraphConceptType',
        'UQ_GraphConceptType_Name',
        'CK_GraphConceptType_Status',
        'PK_Graph',
        'FK_Graph_GraphType',
        'UQ_Graph_Name',
        'CK_Graph_LoadMode',
        'CK_Graph_Status',
        'PK_GraphEdgeType',
        'FK_GraphEdgeType_Graph',
        'UQ_GraphEdgeType_Graph_Name',
        'CK_GraphEdgeType_DefaultWeight',
        'PK_GraphEdgeTypeEndpoint',
        'FK_GraphEdgeTypeEndpoint_EdgeType',
        'FK_GraphEdgeTypeEndpoint_Entity',
        'UQ_GraphEdgeTypeEndpoint',
        'CK_GraphEdgeTypeEndpoint_Side',
        'PK_GraphEdgeProvider',
        'FK_GraphEdgeProvider_Graph',
        'UQ_GraphEdgeProvider_Graph_Name',
        'PK_GraphEdge',
        'FK_GraphEdge_Graph',
        'FK_GraphEdge_EdgeType',
        'FK_GraphEdge_SourceEntity',
        'FK_GraphEdge_TargetEntity',
        'UQ_GraphEdge',
        'CK_GraphEdge_Weight',
        'CK_GraphEdge_Confidence',
        'CK_GraphEdge_Origin',
        'CK_GraphEdge_Status',
        'CK_GraphEdge_NoSelfLoop',
        'PK_GraphConcept',
        'FK_GraphConcept_Graph',
        'FK_GraphConcept_Parent',
        'FK_GraphConcept_GraphConceptType',
        'UQ_GraphConcept_GraphID_Name',
        'CK_GraphConcept_NoSelfParent',
        'CK_GraphConcept_AuthorityTier',
        'CK_GraphConcept_Status',
        'FK_ContentSource_Graph',
    ];

    let foundLower: Set<string>;
    if (ctx.Pool) {
        const result = await ctx.Pool.request().query<{ name: string }>(`
            SELECT o.name
              FROM sys.objects o
              JOIN sys.schemas s ON o.schema_id = s.schema_id
             WHERE s.name = '__mj'
               AND o.name IN (${expectedConstraints.map((c) => `'${c}'`).join(', ')})
        `);
        foundLower = new Set(result.recordset.map((r) => r.name.toLowerCase()));
    } else {
        const provider = ctx.Provider as unknown as CatalogQueryProvider;
        if (provider?.PlatformKey === 'postgresql' && typeof provider.ExecuteSQL === 'function') {
            const rows = await provider.ExecuteSQL<{ name: string }>(`
                SELECT con.conname AS "name"
                  FROM pg_constraint con
                  JOIN pg_namespace nsp ON nsp.oid = con.connamespace
                 WHERE nsp.nspname = '__mj'
                   AND con.conname IN (${expectedConstraints.map((c) => `'${c.toLowerCase()}'`).join(', ')})
            `);
            foundLower = new Set(rows.map((r) => String(r.name).toLowerCase()));
        } else {
            SkipCheck('no catalog access on this run path: needs an mssql pool or a PostgreSQL provider with ExecuteSQL');
        }
    }

    for (const name of expectedConstraints) {
        Assert(
            foundLower.has(name.toLowerCase()),
            `Constraint "${name}" must exist in schema __mj`,
        );
    }
}

// ─── SG3: Live RunView execution across all 6 Graph views + Content Sources ──

async function checkSg3BaseViewsRunView(ctx: IntegrationCheckContext): Promise<void> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const entityNames = [...GRAPH_ENTITIES.map((g) => g.EntityName), 'MJ: Content Sources'];

    for (const entityName of entityNames) {
        const [simpleRes, countRes] = await Promise.all([
            rv.RunView<Record<string, unknown>>(
                { EntityName: entityName, MaxRows: 5, ResultType: 'simple' },
                ctx.User,
            ),
            rv.RunView<Record<string, unknown>>(
                { EntityName: entityName, ResultType: 'count_only' },
                ctx.User,
            ),
        ]);
        Assert(
            simpleRes.Success,
            `RunView (simple) failed on '${entityName}': ${simpleRes.ErrorMessage}`,
        );
        Assert(
            countRes.Success,
            `RunView (count_only) failed on '${entityName}': ${countRes.ErrorMessage}`,
        );
    }
}

// ─── SG4: Live DB Entity CRUD + Virtual Fields + Constraint Rejection ────────

async function checkSg4LiveEntityCrudAndConstraints(ctx: IntegrationCheckContext): Promise<void> {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let graphType: MJGraphTypeEntity | null = null;
    let domainConceptType: MJGraphConceptTypeEntity | null = null;
    let policyConceptType: MJGraphConceptTypeEntity | null = null;
    let graph: MJGraphEntity | null = null;
    let parentConcept: MJGraphConceptEntity | null = null;
    let childConcept: MJGraphConceptEntity | null = null;
    let edgeType: MJGraphEdgeTypeEntity | null = null;
    let edge: MJGraphEdgeEntity | null = null;

    try {
        // 1. Create a custom canonical GraphType (IsCanon = true, Rank = 15) and two ranked GraphConceptTypes
        graphType = await ctx.Provider.GetEntityObject<MJGraphTypeEntity>('MJ: Graph Types', ctx.User);
        graphType.NewRecord();
        graphType.Name = `__IT162_Governance_Canon_${suffix}`;
        graphType.Description = 'Integration test canonical graph type';
        graphType.IsCanon = true;
        graphType.Rank = 15;
        graphType.IconClass = 'fa-solid fa-scale-balanced';
        graphType.Status = 'Active';
        Assert(
            await graphType.Save(),
            `Failed to save MJGraphTypeEntity: ${graphType.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );

        domainConceptType = await ctx.Provider.GetEntityObject<MJGraphConceptTypeEntity>('MJ: Graph Concept Types', ctx.User);
        domainConceptType.NewRecord();
        domainConceptType.Name = `__IT162_Domain_${suffix}`;
        domainConceptType.Description = 'High-level domain umbrella';
        domainConceptType.Rank = 50;
        domainConceptType.IconClass = 'fa-solid fa-layer-group';
        domainConceptType.Status = 'Active';
        Assert(
            await domainConceptType.Save(),
            `Failed to save domain MJGraphConceptTypeEntity: ${domainConceptType.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );

        policyConceptType = await ctx.Provider.GetEntityObject<MJGraphConceptTypeEntity>('MJ: Graph Concept Types', ctx.User);
        policyConceptType.NewRecord();
        policyConceptType.Name = `__IT162_Policy_${suffix}`;
        policyConceptType.Description = 'Governing policy rule';
        policyConceptType.Rank = 10;
        policyConceptType.IconClass = 'fa-solid fa-gavel';
        policyConceptType.Status = 'Active';
        Assert(
            await policyConceptType.Save(),
            `Failed to save policy MJGraphConceptTypeEntity: ${policyConceptType.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );

        // 2. Create a Canon Graph referencing graphType.ID
        graph = await ctx.Provider.GetEntityObject<MJGraphEntity>('MJ: Graphs', ctx.User);
        graph.NewRecord();
        graph.Name = `__IT162_Canon_Graph_${suffix}`;
        graph.Description = 'Integration test Canon Graph';
        graph.GraphTypeID = graphType.ID;
        graph.LoadMode = 'Preload';
        graph.Status = 'Active';
        Assert(
            await graph.Save(),
            `Failed to save MJGraphEntity: ${graph.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
        AssertEqual(graph.GraphType, graphType.Name, 'graph.GraphType virtual field');

        // 3. Create Parent Domain Concept + Child Policy Concept
        parentConcept = await ctx.Provider.GetEntityObject<MJGraphConceptEntity>('MJ: Graph Concepts', ctx.User);
        parentConcept.NewRecord();
        parentConcept.GraphID = graph.ID;
        parentConcept.Name = `Membership Governance ${suffix}`;
        parentConcept.ConceptTypeID = domainConceptType.ID;
        parentConcept.Description = 'Governance domain for membership policies.';
        parentConcept.AuthorityTier = 'Bylaws';
        parentConcept.Status = 'Approved';
        Assert(
            await parentConcept.Save(),
            `Failed to save parent MJGraphConceptEntity: ${parentConcept.LatestResult?.CompleteMessage ?? 'unknown'}`,
        );
        AssertEqual(parentConcept.ConceptType, domainConceptType.Name, 'parentConcept.ConceptType virtual field');

        childConcept = await ctx.Provider.GetEntityObject<MJGraphConceptEntity>('MJ: Graph Concepts', ctx.User);
        childConcept.NewRecord();
        childConcept.GraphID = graph.ID;
        childConcept.ParentID = parentConcept.ID;
        childConcept.Name = `Renewal Grace Period ${suffix}`;
        childConcept.ConceptTypeID = policyConceptType.ID;
        childConcept.Description = 'Members have 60 days from invoice due date before suspension.';
        childConcept.Specification = '### Rule\nGrace period is strictly 60 days per Article IV.';
        childConcept.Synonyms = JSON.stringify(['Dues Grace Window']);
        childConcept.AuthorityTier = 'Bylaws';
        childConcept.Status = 'Proposed';
        Assert(
            await childConcept.Save(),
            `Failed to save child MJGraphConceptEntity: ${childConcept.LatestResult?.CompleteMessage ?? 'unknown'}`,
        );

        // Verify base view virtual fields (Graph, Parent, ConceptType) populated on reload
        AssertEqual(childConcept.Graph, graph.Name, 'childConcept.Graph virtual field');
        AssertEqual(childConcept.Parent, parentConcept.Name, 'childConcept.Parent virtual field');
        AssertEqual(childConcept.ConceptType, policyConceptType.Name, 'childConcept.ConceptType virtual field');

        // 4. Verify CK_GraphConcept_NoSelfParent rejects setting ParentID = ID
        childConcept.ParentID = childConcept.ID;
        const selfParentSaved = await childConcept.Save();
        Assert(
            !selfParentSaved,
            'CK_GraphConcept_NoSelfParent must reject self-referential ParentID = ID',
        );
        childConcept.ParentID = parentConcept.ID;

        // 5. Create GraphEdgeType and GraphEdge linking ParentConcept -> ChildConcept
        edgeType = await ctx.Provider.GetEntityObject<MJGraphEdgeTypeEntity>('MJ: Graph Edge Types', ctx.User);
        edgeType.NewRecord();
        edgeType.GraphID = graph.ID;
        edgeType.Name = `__IT162_BroaderThan_${suffix}`;
        edgeType.Description = 'Parent concept is broader than child concept';
        edgeType.InverseName = 'Narrower Than';
        edgeType.IsDirected = true;
        edgeType.AllowStored = true;
        edgeType.DefaultWeight = 1.0;
        Assert(
            await edgeType.Save(),
            `Failed to save MJGraphEdgeTypeEntity: ${edgeType.LatestResult?.CompleteMessage ?? 'unknown'}`,
        );

        const conceptsEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Graph Concepts')!;
        edge = await ctx.Provider.GetEntityObject<MJGraphEdgeEntity>('MJ: Graph Edges', ctx.User);
        edge.NewRecord();
        edge.GraphID = graph.ID;
        edge.EdgeTypeID = edgeType.ID;
        edge.SourceEntityID = conceptsEnt.ID;
        edge.SourceRecordID = parentConcept.ID;
        edge.TargetEntityID = conceptsEnt.ID;
        edge.TargetRecordID = childConcept.ID;
        edge.Weight = 0.95;
        edge.Confidence = 0.9;
        edge.Origin = 'Inferred';
        edge.Status = 'Approved';
        Assert(
            await edge.Save(),
            `Failed to save MJGraphEdgeEntity: ${edge.LatestResult?.CompleteMessage ?? 'unknown'}`,
        );

        AssertEqual(edge.Graph, graph.Name, 'edge.Graph virtual field');
        AssertEqual(edge.EdgeType, edgeType.Name, 'edge.EdgeType virtual field');
        AssertEqual(edge.SourceEntity, 'MJ: Graph Concepts', 'edge.SourceEntity virtual field');
        AssertEqual(edge.TargetEntity, 'MJ: Graph Concepts', 'edge.TargetEntity virtual field');

        // 6. Verify CK_GraphEdge_NoSelfLoop rejects self-loop edge
        const selfLoopEdge = await ctx.Provider.GetEntityObject<MJGraphEdgeEntity>('MJ: Graph Edges', ctx.User);
        selfLoopEdge.NewRecord();
        selfLoopEdge.GraphID = graph.ID;
        selfLoopEdge.EdgeTypeID = edgeType.ID;
        selfLoopEdge.SourceEntityID = conceptsEnt.ID;
        selfLoopEdge.SourceRecordID = parentConcept.ID;
        selfLoopEdge.TargetEntityID = conceptsEnt.ID;
        selfLoopEdge.TargetRecordID = parentConcept.ID;
        selfLoopEdge.Weight = 1.0;
        selfLoopEdge.Origin = 'Declared';
        selfLoopEdge.Status = 'Proposed';
        const selfLoopSaved = await selfLoopEdge.Save();
        if (selfLoopSaved) {
            await selfLoopEdge.Delete();
        }
        Assert(!selfLoopSaved, 'CK_GraphEdge_NoSelfLoop must reject self-loop edge');
    } finally {
        if (edge?.IsSaved) await edge.Delete();
        if (edgeType?.IsSaved) await edgeType.Delete();
        if (childConcept?.IsSaved) {
            childConcept.ParentID = null;
            await childConcept.Delete();
        }
        if (parentConcept?.IsSaved) await parentConcept.Delete();
        if (graph?.IsSaved) await graph.Delete();
        if (policyConceptType?.IsSaved) await policyConceptType.Delete();
        if (domainConceptType?.IsSaved) await domainConceptType.Delete();
        if (graphType?.IsSaved) await graphType.Delete();
    }
}

// ─── SG5: Content Pipeline GraphStage End-to-End with Live Schema Grounding ──

class IntegrationTestGraphOverlayStore implements IGraphOverlayStore {
    public ExistingConcepts: ExistingGraphConceptSeed[] = [];
    public GroundingTargets: SchemaGroundingTarget[] = [];
    public Chunks: ContentChunkSeedInput[] = [];
    public PersistedConcepts: Array<{ ID: string; Status: string; Concept: SynthesizedGraphConcept }> = [];
    public PersistedEdges: Array<{ ConceptID: string; Status: string; Edge: SynthesizedGraphEdge }> = [];

    public async LoadExistingConcepts(): Promise<ExistingGraphConceptSeed[]> {
        return this.ExistingConcepts;
    }

    public async LoadGroundingTargets(): Promise<SchemaGroundingTarget[]> {
        return this.GroundingTargets;
    }

    public async LoadItemChunks(): Promise<ContentChunkSeedInput[]> {
        return this.Chunks;
    }

    public async UpsertConcept(
        _graphID: string,
        concept: SynthesizedGraphConcept,
        status: 'Proposed' | 'Approved',
    ): Promise<string> {
        const id = concept.ExistingConceptID ?? `concept-${this.PersistedConcepts.length + 1}`;
        this.PersistedConcepts.push({ ID: id, Status: status, Concept: concept });
        return id;
    }

    public async UpsertEdges(
        _graphID: string,
        conceptID: string,
        edges: readonly SynthesizedGraphEdge[],
        status: 'Proposed' | 'Approved',
    ): Promise<number> {
        for (const e of edges) {
            this.PersistedEdges.push({ ConceptID: conceptID, Status: status, Edge: e });
        }
        return edges.length;
    }
}

async function checkSg5ContentPipelineGraphStage(ctx: IntegrationCheckContext): Promise<void> {
    const stage = BasePipelineStage.Resolve(GRAPH_STAGE);
    Assert(stage instanceof GraphStage, 'BasePipelineStage.Resolve("Graph") must return GraphStage');

    const contentSourcesMeta = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Content Sources');
    Assert(contentSourcesMeta !== undefined, 'MJ: Content Sources must exist in Provider.Entities');

    const store = new IntegrationTestGraphOverlayStore();
    store.GroundingTargets = [
        {
            EntityName: 'MJ: Entities',
            RecordID: contentSourcesMeta!.ID,
            Name: 'Content Source Retention Policy',
            Description: contentSourcesMeta!.Description,
            SynonymsOrKeywords: ['Dues Grace Period Policy'],
        },
    ];

    store.Chunks = [
        {
            ChunkID: 'CHK-BYLAWS-101',
            ContentItemID: 'ITEM-MANUAL-101',
            ContentSourceID: 'SRC-BYLAWS',
            ContentItemTitle: 'Association Bylaws',
            HeadingPath: 'Membership Governance > Section 4.2 Dues Grace Period Policy',
            Text: 'Per Association Bylaws, the Dues Grace Period Policy grants 60 days past due date before suspension.',
            Tags: ['Dues Grace Period Policy'],
            AuthorityTier: 'Bylaws',
        },
        {
            ChunkID: 'CHK-SOP-202',
            ContentItemID: 'ITEM-MANUAL-101',
            ContentSourceID: 'SRC-DEPT-SOP',
            ContentItemTitle: 'Staff Billing Handbook',
            HeadingPath: 'Membership Governance > Section 2.1 Dues Grace Period Policy',
            Text: 'In daily practice, the Dues Grace Period Policy grants 90 days past due date before suspension.',
            Tags: ['Dues Grace Period Policy'],
            AuthorityTier: 'DepartmentPractice',
        },
    ];

    const record = new WorkingRecord(
        new WorkingRecordIdentity('Content Item', 'https://canon.test/bylaws.pdf', 'ITEM-MANUAL-101'),
    );
    record.Propose('Title', 'Association Bylaws & Billing Handbook', 0.95, 'Extract');
    const tags: ClassifiedTag[] = [{ Name: 'Dues Grace Period Policy', Score: 0.96 }];
    record.SetExtension(TAG_STAGE, 'tags', tags);

    const stageCtx: StageContext = {
        ContextUser: ctx.User,
        Provider: ctx.Provider,
        Configuration: {
            GraphOverlay: {
                EnableGraphOverlay: true,
                GraphID: 'GRAPH-CANON-IT162',
                TargetGraphType: 'Canon',
                AuthorityTier: 'Bylaws',
                GroundingMode: 'full-canon',
            },
            GraphOverlayStore: store,
        },
        IsTest: false,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };

    const outcome = await stage!.Run(record, stageCtx);
    AssertEqual(outcome.Status, 'Complete', 'GraphStage outcome status');

    const summary = record.GetExtension<GraphStageExecutionSummary>(GRAPH_STAGE, 'summary');
    Assert(summary !== undefined, 'GraphStageExecutionSummary must be set on record extension');
    AssertEqual(summary!.PersistedConceptCount, 1, 'PersistedConceptCount');

    const saved = store.PersistedConcepts[0];
    AssertEqual(saved.Status, 'Proposed', 'Canon concept Status');
    AssertEqual(saved.Concept.AuthorityTier, 'Bylaws', 'Canon concept AuthorityTier');
    AssertEqual(saved.Concept.ParentConceptName, 'Membership Governance', 'ParentConceptName');

    const edgeTypes = new Set<string>(store.PersistedEdges.map((e) => e.Edge.EdgeTypeName));
    for (const requiredEdge of ['SourcedFrom', 'Mentions', 'Broader Than', 'Describes', 'Contradicts']) {
        Assert(
            edgeTypes.has(requiredEdge),
            `Synthesized edges must include '${requiredEdge}', got [${Array.from(edgeTypes).join(', ')}]`,
        );
    }
}

// ─── SG6: Executable Canon Deterministic DAG Similarity & Promotion Discovery ─

async function checkSg6DagSimilarityAndPromotion(): Promise<void> {
    const buildDuesWaiverGraph = (prefix: string, reverseOrder: boolean, withCfoStep: boolean): TaskGraphSpec => {
        const step1 = TaskNode.Action(
            { tempId: `${prefix}_1`, name: 'Load Member', description: '', dependsOn: [] },
            { actionName: 'Get Member Dues Balance' },
        );
        const step2 = TaskNode.Decision(
            { tempId: `${prefix}_2`, name: 'Check Waiver Limit', description: '', dependsOn: [`${prefix}_1`] },
            {
                promptName: 'Evaluate Dues Waiver Limit',
                questions: { needsCfo: { kind: 'Likelihood', instructions: 'Over $1,000?' } },
            },
        );
        const step3 = TaskNode.Action(
            { tempId: `${prefix}_3`, name: 'Post Credit Memo', description: '', dependsOn: [`${prefix}_2`] },
            { actionName: 'Create Dues Credit Memo' },
        );
        const tasks: TaskGraphSpecNode[] = [step1, step2, step3];
        if (withCfoStep) {
            tasks.push(
                TaskNode.Human(
                    { tempId: `${prefix}_4`, name: 'CFO Signoff', description: '', dependsOn: [`${prefix}_3`] },
                    { instructions: 'Approve credit memo' },
                ),
            );
        }
        if (reverseOrder) tasks.reverse();
        return { workflowName: 'Dues Waiver Flow', tasks };
    };

    const fpIsoA = ComputeDAGFingerprint(buildDuesWaiverGraph('a', false, false));
    const fpIsoB = ComputeDAGFingerprint(buildDuesWaiverGraph('b', true, false));
    AssertEqual(
        fpIsoA.ExactStructureHash,
        fpIsoB.ExactStructureHash,
        'Isomorphic DAGs ExactStructureHash',
    );
    const isoSim = CompareDAGFingerprints(fpIsoA, fpIsoB);
    Assert(isoSim.IsExactStructuralMatch && isoSim.Overall === 1, 'Isomorphic DAG similarity must be 1.0');

    const savedWorkflows: SavedWorkflowRecord[] = [
        {
            WorkflowAgentID: 'wf-dues-waiver-v1',
            WorkflowName: 'Standard Dues Waiver',
            Spec: buildDuesWaiverGraph('saved', false, false),
        },
    ];

    const buildNovelSponsorGraph = (i: number): TaskGraphSpec => ({
        workflowName: `Sponsor Onboarding ${i}`,
        tasks: [
            TaskNode.Action(
                { tempId: `sp1_${i}`, name: 'Verify Contract', description: '', dependsOn: [] },
                { actionName: 'Verify Sponsor Contract' },
            ),
            TaskNode.Action(
                { tempId: `sp2_${i}`, name: 'Create Booth', description: '', dependsOn: [`sp1_${i}`] },
                { actionName: 'Allocate Exhibitor Booth' },
            ),
        ],
    });

    const executedRuns: ExecutedTaskGraphRecord[] = [
        { RunID: 'sp-1', Spec: buildNovelSponsorGraph(1), Succeeded: true },
        { RunID: 'sp-2', Spec: buildNovelSponsorGraph(2), Succeeded: true },
        { RunID: 'sp-3', Spec: buildNovelSponsorGraph(3), Succeeded: true },
        { RunID: 'dw-1', Spec: buildDuesWaiverGraph('dw1', true, false), Succeeded: true },
        { RunID: 'dw-2', Spec: buildDuesWaiverGraph('dw2', false, false), Succeeded: true },
        { RunID: 'dw-3', Spec: buildDuesWaiverGraph('dw3', true, false), Succeeded: true },
        { RunID: 'ev-1', Spec: buildDuesWaiverGraph('ev1', false, true), Succeeded: true },
        { RunID: 'ev-2', Spec: buildDuesWaiverGraph('ev2', false, true), Succeeded: true },
        { RunID: 'ev-3', Spec: buildDuesWaiverGraph('ev3', false, true), Succeeded: true },
    ];

    const discovery = DiscoverWorkflowPromotionCandidates(executedRuns, savedWorkflows, {
        minClusterSize: 3,
    });

    AssertEqual(discovery.PromotionCandidates.length, 1, 'PromotionCandidates count');
    AssertEqual(discovery.DiscoveryGaps.length, 1, 'DiscoveryGaps count');
    AssertEqual(discovery.EvolutionCandidates.length, 1, 'EvolutionCandidates count');
}

// ─── SG7: Executable Canon Workflow Health & Shadow-Bypass Telemetry ─────────

async function checkSg7WorkflowCanonHealthTelemetry(): Promise<void> {
    const evalTime = new Date('2026-11-02T12:00:00Z');
    const dayMs = 86_400_000;
    const daysAgo = (d: number): Date => new Date(evalTime.getTime() - d * dayMs);

    const dormantSpec: TaskGraphSpec = {
        workflowName: 'Legacy Paper Directory Export',
        tasks: [
            TaskNode.Action(
                { tempId: 'd1', name: 'Query Fax List', description: '', dependsOn: [] },
                { actionName: 'Export Legacy Paper Directory' },
            ),
            TaskNode.Action(
                { tempId: 'd2', name: 'Archive CSV', description: '', dependsOn: ['d1'] },
                { actionName: 'Upload Legacy Directory Tape' },
            ),
        ],
    };

    const baseSpec: TaskGraphSpec = {
        workflowName: 'Event Registration Sync',
        tasks: [
            TaskNode.Action(
                { tempId: 'n1', name: 'Fetch Reg', description: '', dependsOn: [] },
                { actionName: 'Fetch Event Registrations' },
            ),
            TaskNode.Action(
                { tempId: 'n2', name: 'Post Invoice', description: '', dependsOn: ['n1'] },
                { actionName: 'Create Event Invoice' },
            ),
        ],
    };

    const shadowSpec: TaskGraphSpec = {
        workflowName: 'Event Registration Sync With Badge QR',
        tasks: [
            ...baseSpec.tasks,
            TaskNode.Action(
                { tempId: 'n3', name: 'Generate QR', description: '', dependsOn: ['n2'] },
                { actionName: 'Generate Attendee Badge QR' },
            ),
        ],
    };

    const adHocRuns: ExecutedTaskGraphRecord[] = Array.from({ length: 4 }, (_, i) => ({
        RunID: `shadow-${i}`,
        Spec: shadowSpec,
        Succeeded: true,
        ExecutedAt: daysAgo(2 + i * 2),
    }));
    const clusters = DiscoverWorkflowPromotionCandidates(adHocRuns, []).Findings.map((f) => f.Cluster);

    const baselineRuns: WorkflowRunTelemetryRecord[] = Array.from({ length: 10 }, (_, i) => ({
        RunID: `base-${i}`,
        StartedAt: daysAgo(35 + i * 4),
        Status: 'Completed',
    }));

    const reports = EvaluateWorkflowCanonHealth(
        [
            {
                WorkflowAgentID: 'wf-dormant',
                WorkflowName: 'Dormant Legacy Sync',
                Spec: dormantSpec,
                Runs: [{ RunID: 'old-1', StartedAt: daysAgo(75), Status: 'Completed' }],
            },
            {
                WorkflowAgentID: 'wf-shadowed',
                WorkflowName: 'Event Registration Sync v1',
                Spec: baseSpec,
                Runs: [...baselineRuns, { RunID: 'rec-1', StartedAt: daysAgo(10), Status: 'Completed' }],
            },
            {
                WorkflowAgentID: 'wf-exception',
                WorkflowName: 'Failing Invoice Flow',
                Spec: baseSpec,
                Runs: [
                    ...baselineRuns,
                    {
                        RunID: 'exc-1',
                        StartedAt: daysAgo(2),
                        Status: 'Failed',
                        EscalatedToLoopOrRecovery: true,
                        FailedOrEscalatedNodeSignatures: ['Action:create_event_invoice'],
                    },
                    {
                        RunID: 'exc-2',
                        StartedAt: daysAgo(4),
                        Status: 'Completed',
                        EscalatedToLoopOrRecovery: true,
                        FailedOrEscalatedNodeSignatures: ['Action:create_event_invoice'],
                    },
                ],
            },
        ],
        clusters,
        { evaluationTime: evalTime },
    );

    const dormant = reports.find((r) => r.WorkflowAgentID === 'wf-dormant');
    const shadowed = reports.find((r) => r.WorkflowAgentID === 'wf-shadowed');
    const exception = reports.find((r) => r.WorkflowAgentID === 'wf-exception');

    Assert(dormant !== undefined && dormant.Signals.includes('Dormant'), 'wf-dormant must be Dormant');
    AssertEqual(dormant!.RecommendedAction, 'PruneOrDeprecate', 'wf-dormant RecommendedAction');

    Assert(
        shadowed !== undefined && shadowed.Signals.includes('ShadowBypassed'),
        'wf-shadowed must be ShadowBypassed',
    );
    AssertEqual(shadowed!.RecommendedAction, 'SupersedeWithShadowCluster', 'wf-shadowed RecommendedAction');

    Assert(
        exception !== undefined && exception.Signals.includes('ExceptionSpike'),
        'wf-exception must be ExceptionSpike',
    );
    AssertEqual(
        exception!.HotspotNodes[0]?.NodeSignature,
        'Action:create_event_invoice',
        'wf-exception HotspotNode',
    );
}

export const SemanticGraphChecks: NamedCheck[] = [
    {
        Id: 'semantic-graph.SG1',
        Name: 'SG1: metadata coherence across all 8 Semantic Graph entities, ContentSource.GraphID, FK links, and polymorphic EntityIDFieldName',
        Fn: checkSg1MetadataCoherence,
    },
    {
        Id: 'semantic-graph.SG2',
        Name: 'SG2: physical catalog PK, UQ, FK, and CHECK constraints exist on all 8 Graph tables and ContentSource',
        Fn: checkSg2PhysicalConstraints,
    },
    {
        Id: 'semantic-graph.SG3',
        Name: 'SG3: RunView simple and count_only succeed across all 8 Semantic Graph base views and MJ: Content Sources',
        Fn: checkSg3BaseViewsRunView,
    },
    {
        Id: 'semantic-graph.SG4',
        Name: 'SG4: live DB CRUD for MJGraphTypeEntity, MJGraphConceptTypeEntity, MJGraphEntity, hierarchical MJGraphConceptEntity, MJGraphEdgeTypeEntity, MJGraphEdgeEntity, and CHECK constraint enforcement',
        Fn: checkSg4LiveEntityCrudAndConstraints,
        RequiresMutation: true,
    },
    {
        Id: 'semantic-graph.SG5',
        Name: 'SG5: Content Pipeline GraphStage clusters multi-source chunks, enforces AuthorityTier precedence, grounds to live Entities, and emits Contradicts edges',
        Fn: checkSg5ContentPipelineGraphStage,
    },
    {
        Id: 'semantic-graph.SG6',
        Name: 'SG6: deterministic TaskGraph WL fingerprinting is isomorphism-invariant and classifies PromoteToWorkflow, EvolveExistingWorkflow, and ExistingWorkflowDiscoveryGap',
        Fn: checkSg6DagSimilarityAndPromotion,
    },
    {
        Id: 'semantic-graph.SG7',
        Name: 'SG7: EvaluateWorkflowCanonHealth detects Dormant, UsageDecay, ExceptionSpike hotspots, and ShadowBypassed correlation',
        Fn: checkSg7WorkflowCanonHealthTelemetry,
    },
];

for (const c of SemanticGraphChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
