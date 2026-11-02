-- =====================================================================================
-- Semantic Graph Substrate, Generic Graph Concepts, & Content Source Graph Overlay
--
-- 1. Graph: named semantic graph partitions with GraphType ('Canon', 'Knowledge',
--    'Network', 'Custom') and LoadMode ('Preload', 'OnDemand').
-- 2. GraphEdgeType: global (GraphID IS NULL) or graph-scoped edge types with
--    directionality, inverse label, default retrieval weight, and AllowStored flag.
-- 3. GraphEdgeTypeEndpoint: optional endpoint entity constraints per edge type.
-- 4. GraphEdgeProvider: pluggable derived-edge providers enabled per graph.
-- 5. GraphEdge: polymorphic stored edges (Declared or Inferred, Proposed/Approved/Rejected)
--    connecting any (SourceEntityID, SourceRecordID) to (TargetEntityID, TargetRecordID).
-- 6. GraphConcept: generalized higher-level concept node scoped to a GraphID
--    (replacing the Canon-only CanonConcept table) with ConceptType ('Domain', 'Term',
--    'Policy', 'Metric', 'Process'), Specification, AuthorityTier, ParentID, and Status.
-- 7. ContentSource.GraphID: optional foreign key linking a Content Source to a target
--    Graph (supporting single-source or multi-source shared Knowledge/Canon graphs).
--
-- Conventions (migrations/CLAUDE.md & guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md):
--   - Plain DDL + sp_addextendedproperty only (no existence guards).
--   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted;
--     CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Graph
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[Graph] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Graph_ID] DEFAULT (newsequentialid()),
    [Name]        NVARCHAR(255)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [GraphType]   NVARCHAR(50)     NOT NULL CONSTRAINT [DF_Graph_GraphType] DEFAULT (N'Custom'),
    [LoadMode]    NVARCHAR(20)     NOT NULL CONSTRAINT [DF_Graph_LoadMode] DEFAULT (N'Preload'),
    [Status]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_Graph_Status] DEFAULT (N'Active'),
    CONSTRAINT [PK_Graph] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_Graph_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_Graph_GraphType] CHECK ([GraphType] IN (N'Canon', N'Knowledge', N'Network', N'Custom')),
    CONSTRAINT [CK_Graph_LoadMode] CHECK ([LoadMode] IN (N'Preload', N'OnDemand')),
    CONSTRAINT [CK_Graph_Status] CHECK ([Status] IN (N'Active', N'Disabled'))
);
GO

-- -------------------------------------------------------------------------------------
-- 2. GraphEdgeType
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphEdgeType] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphEdgeType_ID] DEFAULT (newsequentialid()),
    [GraphID]       UNIQUEIDENTIFIER NULL,
    [Name]          NVARCHAR(100)    NOT NULL,
    [Description]   NVARCHAR(MAX)    NOT NULL,
    [IsDirected]    BIT              NOT NULL CONSTRAINT [DF_GraphEdgeType_IsDirected] DEFAULT (1),
    [InverseName]   NVARCHAR(100)    NULL,
    [DefaultWeight] DECIMAL(5, 4)    NOT NULL CONSTRAINT [DF_GraphEdgeType_DefaultWeight] DEFAULT (1.0),
    [AllowStored]   BIT              NOT NULL CONSTRAINT [DF_GraphEdgeType_AllowStored] DEFAULT (1),
    CONSTRAINT [PK_GraphEdgeType] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_GraphEdgeType_Graph] FOREIGN KEY ([GraphID])
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID]),
    CONSTRAINT [UQ_GraphEdgeType_Graph_Name] UNIQUE ([GraphID], [Name]),
    CONSTRAINT [CK_GraphEdgeType_DefaultWeight] CHECK ([DefaultWeight] >= 0 AND [DefaultWeight] <= 1)
);
GO

-- -------------------------------------------------------------------------------------
-- 3. GraphEdgeTypeEndpoint
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] (
    [ID]         UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphEdgeTypeEndpoint_ID] DEFAULT (newsequentialid()),
    [EdgeTypeID] UNIQUEIDENTIFIER NOT NULL,
    [Side]       NVARCHAR(10)     NOT NULL,
    [EntityID]   UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK_GraphEdgeTypeEndpoint] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_GraphEdgeTypeEndpoint_EdgeType] FOREIGN KEY ([EdgeTypeID])
        REFERENCES [${flyway:defaultSchema}].[GraphEdgeType]([ID]),
    CONSTRAINT [FK_GraphEdgeTypeEndpoint_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [UQ_GraphEdgeTypeEndpoint] UNIQUE ([EdgeTypeID], [Side], [EntityID]),
    CONSTRAINT [CK_GraphEdgeTypeEndpoint_Side] CHECK ([Side] IN (N'Source', N'Target'))
);
GO

-- -------------------------------------------------------------------------------------
-- 4. GraphEdgeProvider
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphEdgeProvider] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphEdgeProvider_ID] DEFAULT (newsequentialid()),
    [GraphID]       UNIQUEIDENTIFIER NOT NULL,
    [Name]          NVARCHAR(255)    NOT NULL,
    [Description]   NVARCHAR(MAX)    NULL,
    [DriverClass]   NVARCHAR(255)    NOT NULL,
    [Configuration] NVARCHAR(MAX)    NULL,
    [Sequence]      INT              NOT NULL CONSTRAINT [DF_GraphEdgeProvider_Sequence] DEFAULT (0),
    [IsActive]      BIT              NOT NULL CONSTRAINT [DF_GraphEdgeProvider_IsActive] DEFAULT (1),
    CONSTRAINT [PK_GraphEdgeProvider] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_GraphEdgeProvider_Graph] FOREIGN KEY ([GraphID])
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID]),
    CONSTRAINT [UQ_GraphEdgeProvider_Graph_Name] UNIQUE ([GraphID], [Name])
);
GO

-- -------------------------------------------------------------------------------------
-- 5. GraphEdge
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphEdge] (
    [ID]             UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphEdge_ID] DEFAULT (newsequentialid()),
    [GraphID]        UNIQUEIDENTIFIER NOT NULL,
    [EdgeTypeID]     UNIQUEIDENTIFIER NOT NULL,
    [SourceEntityID] UNIQUEIDENTIFIER NOT NULL,
    [SourceRecordID] NVARCHAR(400)    NOT NULL,
    [TargetEntityID] UNIQUEIDENTIFIER NOT NULL,
    [TargetRecordID] NVARCHAR(400)    NOT NULL,
    [Weight]         DECIMAL(5, 4)    NOT NULL CONSTRAINT [DF_GraphEdge_Weight] DEFAULT (1.0),
    [Description]    NVARCHAR(MAX)    NULL,
    [Attributes]     NVARCHAR(MAX)    NULL,
    [Origin]         NVARCHAR(20)     NOT NULL CONSTRAINT [DF_GraphEdge_Origin] DEFAULT (N'Declared'),
    [Status]         NVARCHAR(20)     NOT NULL CONSTRAINT [DF_GraphEdge_Status] DEFAULT (N'Approved'),
    [Confidence]     DECIMAL(5, 4)    NULL,
    CONSTRAINT [PK_GraphEdge] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_GraphEdge_Graph] FOREIGN KEY ([GraphID])
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID]),
    CONSTRAINT [FK_GraphEdge_EdgeType] FOREIGN KEY ([EdgeTypeID])
        REFERENCES [${flyway:defaultSchema}].[GraphEdgeType]([ID]),
    CONSTRAINT [FK_GraphEdge_SourceEntity] FOREIGN KEY ([SourceEntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [FK_GraphEdge_TargetEntity] FOREIGN KEY ([TargetEntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [UQ_GraphEdge] UNIQUE ([GraphID], [EdgeTypeID], [SourceEntityID], [SourceRecordID], [TargetEntityID], [TargetRecordID]),
    CONSTRAINT [CK_GraphEdge_Weight] CHECK ([Weight] >= 0 AND [Weight] <= 1),
    CONSTRAINT [CK_GraphEdge_Confidence] CHECK ([Confidence] >= 0 AND [Confidence] <= 1),
    CONSTRAINT [CK_GraphEdge_Origin] CHECK ([Origin] IN (N'Declared', N'Inferred')),
    CONSTRAINT [CK_GraphEdge_Status] CHECK ([Status] IN (N'Proposed', N'Approved', N'Rejected')),
    CONSTRAINT [CK_GraphEdge_NoSelfLoop] CHECK (NOT ([SourceEntityID] = [TargetEntityID] AND [SourceRecordID] = [TargetRecordID]))
);
GO

-- -------------------------------------------------------------------------------------
-- 6. GraphConcept
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphConcept] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphConcept_ID] DEFAULT (newsequentialid()),
    [GraphID]       UNIQUEIDENTIFIER NOT NULL,
    [ParentID]      UNIQUEIDENTIFIER NULL,
    [Name]          NVARCHAR(255)    NOT NULL,
    [ConceptType]   NVARCHAR(50)     NOT NULL CONSTRAINT [DF_GraphConcept_ConceptType] DEFAULT (N'Term'),
    [Description]   NVARCHAR(MAX)    NOT NULL,
    [Specification] NVARCHAR(MAX)    NULL,
    [Synonyms]      NVARCHAR(MAX)    NULL,
    [AuthorityTier] NVARCHAR(50)     NOT NULL CONSTRAINT [DF_GraphConcept_AuthorityTier] DEFAULT (N'Reference'),
    [Status]        NVARCHAR(20)     NOT NULL CONSTRAINT [DF_GraphConcept_Status] DEFAULT (N'Draft'),
    CONSTRAINT [PK_GraphConcept] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_GraphConcept_Graph] FOREIGN KEY ([GraphID])
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID]),
    CONSTRAINT [FK_GraphConcept_Parent] FOREIGN KEY ([ParentID])
        REFERENCES [${flyway:defaultSchema}].[GraphConcept]([ID]),
    CONSTRAINT [UQ_GraphConcept_GraphID_Name] UNIQUE ([GraphID], [Name]),
    CONSTRAINT [CK_GraphConcept_NoSelfParent] CHECK ([ParentID] <> [ID]),
    CONSTRAINT [CK_GraphConcept_ConceptType] CHECK ([ConceptType] IN (N'Domain', N'Term', N'Policy', N'Metric', N'Process')),
    CONSTRAINT [CK_GraphConcept_AuthorityTier] CHECK ([AuthorityTier] IN (N'Bylaws', N'BoardPolicy', N'ExecutiveSOP', N'DepartmentPractice', N'Reference', N'Inferred')),
    CONSTRAINT [CK_GraphConcept_Status] CHECK ([Status] IN (N'Draft', N'Proposed', N'Approved', N'Deprecated'))
);
GO

-- -------------------------------------------------------------------------------------
-- 7. ContentSource.GraphID
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]
    ADD [GraphID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_ContentSource_Graph] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID])
        ON DELETE SET NULL;
GO

-- -------------------------------------------------------------------------------------
-- 8. Extended properties (Table & Column descriptions)
-- -------------------------------------------------------------------------------------

-- Graph
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Named semantic graph partitions (such as MJ Canon, Knowledge Hub GraphRAG graphs, or Member Network graphs) that own concepts, edge types, derived edge providers, and stored edges.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Graph';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique name of the semantic graph partition (e.g., MJ Canon, Industry Research Graph).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Graph',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Plain-language description of the domain, purpose, and governance scope of this graph.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Graph',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Semantic category of the graph: Canon (governed organizational definitions, policies, metrics, and workflows), Knowledge (document/RAG topic and concept graph), Network (entity relationship network), or Custom.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Graph',
    @level2type = N'COLUMN', @level2name = N'GraphType';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Whether the graph is preloaded into memory at startup (Preload, for compact metadata/Canon graphs) or traversed on demand (OnDemand, for large data/document graphs).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Graph',
    @level2type = N'COLUMN', @level2name = N'LoadMode';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Operational status of the graph (Active or Disabled).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Graph',
    @level2type = N'COLUMN', @level2name = N'Status';

-- GraphEdgeType
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Defines relationship types for semantic graph edges (e.g., Broader Than, Describes, Defines, Measures, Implements, SourcedFrom, Mentions, Contradicts). Global when GraphID is NULL, or scoped to a specific Graph.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeType';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Forward-direction label of the edge type (e.g., Broader Than, Defines, SourcedFrom).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Plain-language definition of what this relationship type means when connecting two nodes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, the edge is directed from Source to Target; when 0, the relationship is symmetric/undirected.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeType',
    @level2type = N'COLUMN', @level2name = N'IsDirected';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Inverse label shown when traversing a directed edge from Target back to Source (e.g., Narrower Than for Broader Than).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeType',
    @level2type = N'COLUMN', @level2name = N'InverseName';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Default retrieval weight (0.0000 to 1.0000) assigned to edges of this type during multi-hop graph expansion.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeType',
    @level2type = N'COLUMN', @level2name = N'DefaultWeight';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, rows of this edge type may be persisted in GraphEdge; when 0, edges of this type are produced exclusively at read time by a GraphEdgeProvider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeType',
    @level2type = N'COLUMN', @level2name = N'AllowStored';

-- GraphEdgeTypeEndpoint
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional endpoint constraints restricting which MJ Entities may appear on the Source or Target side of a GraphEdgeType.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeTypeEndpoint';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Which endpoint of the edge this entity constraint applies to (Source or Target).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeTypeEndpoint',
    @level2type = N'COLUMN', @level2name = N'Side';

-- GraphEdgeProvider
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Registers a BaseGraphEdgeProvider class on a Graph to project derived edges at read time without duplicating underlying relational data.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeProvider';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Display name of this provider registration within the graph.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeProvider',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Description of which derived edges this provider projects into the graph.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeProvider',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'ClassFactory registration key of the BaseGraphEdgeProvider subclass.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeProvider',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Provider-specific JSON configuration object passed to the provider at query time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeProvider',
    @level2type = N'COLUMN', @level2name = N'Configuration';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Execution order of this provider relative to other providers on the same graph.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeProvider',
    @level2type = N'COLUMN', @level2name = N'Sequence';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, this provider participates in graph expansion queries; when 0, it is skipped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdgeProvider',
    @level2type = N'COLUMN', @level2name = N'IsActive';

-- GraphEdge
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Persisted polymorphic graph edges connecting any two entity records within a Graph, carrying retrieval weight, origin (Declared vs Inferred), approval status, and confidence.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Record ID of the source node (compact URL segment for composite primary keys), paired with SourceEntityID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'SourceRecordID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Record ID of the target node (compact URL segment for composite primary keys), paired with TargetEntityID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'TargetRecordID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Retrieval pull weight (0.0000 to 1.0000) used when scoring multi-hop graph paths.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'Weight';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Human-readable explanation or provenance summary for why this edge connects the source and target nodes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional JSON object holding structured edge metadata (such as citations, authority tiers, or conflict details).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'Attributes';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'How this edge was created: Declared (explicitly authored by a human or seed metadata) or Inferred (proposed by an AI or content pipeline stage).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'Origin';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Governance lifecycle status of the edge: Proposed, Approved, or Rejected. Default graph traversal includes Approved edges only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Confidence score (0.0000 to 1.0000) for Inferred edges; NULL for Declared edges.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphEdge',
    @level2type = N'COLUMN', @level2name = N'Confidence';

-- GraphConcept
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Higher-level semantic concept nodes scoped to a Graph (such as Domain, Term, Policy, Metric, or Process definitions), serving as organizing hubs for Canon governance and Content Source GraphRAG overlays.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Canonical name of the concept, unique within its owning GraphID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Structural classification of the concept: Domain, Term, Policy, Metric, or Process.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'ConceptType';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Concise 1-3 sentence definition (~100 tokens) injected into agent subgraphs and search results.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Structured markdown specification containing authoritative rules, thresholds, decision tables, exceptions, and chunk citations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'Specification';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'JSON array of alternative names, acronyms, and surface forms that resolve to this concept.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'Synonyms';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Highest evidentiary authority tier backing this concept: Bylaws, BoardPolicy, ExecutiveSOP, DepartmentPractice, Reference, or Inferred.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'AuthorityTier';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Governance lifecycle status of the concept: Draft, Proposed, Approved, or Deprecated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'Status';

-- ContentSource.GraphID
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional target Semantic Graph (MJ: Graphs) that this Content Source populates when the Content Pipeline Graph overlay stage runs. Multiple Content Sources can share the same GraphID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ContentSource',
    @level2type = N'COLUMN', @level2name = N'GraphID';
GO






















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
--
-- Everything below this banner was produced by `mj codegen` for the schema DDL
-- above (Entity, EntityField, EntityFieldValue, EntityPermission, EntitySetting,
-- ApplicationEntity, EntityRelationship rows, __mj_CreatedAt/__mj_UpdatedAt
-- columns, FK indexes, base views, spCreate/spUpdate/spDelete procedures,
-- triggers, and extended properties). If the hand-written DDL above changes,
-- re-run CodeGen and replace this entire generated section.
-- =============================================================================

/* SQL generated to create new entity MJ: Graphs */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '9de1db59-5d4b-4f23-adba-e5a521977faa',
         'MJ: Graphs',
         'Graphs',
         'Named semantic graph partitions (such as MJ Canon, Knowledge Hub GraphRAG graphs, or Member Network graphs) that own concepts, edge types, derived edge providers, and stored edges.',
         NULL,
         'Graph',
         'vwGraphs',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Graphs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9de1db59-5d4b-4f23-adba-e5a521977faa', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graphs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9de1db59-5d4b-4f23-adba-e5a521977faa' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9de1db59-5d4b-4f23-adba-e5a521977faa' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graphs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9de1db59-5d4b-4f23-adba-e5a521977faa' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9de1db59-5d4b-4f23-adba-e5a521977faa' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graphs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9de1db59-5d4b-4f23-adba-e5a521977faa' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9de1db59-5d4b-4f23-adba-e5a521977faa' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Graph Edge Types */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '987a289e-5763-4735-8ee3-ae61ca5c26cb',
         'MJ: Graph Edge Types',
         'Graph Edge Types',
         'Defines relationship types for semantic graph edges (e.g., Broader Than, Describes, Defines, Measures, Implements, SourcedFrom, Mentions, Contradicts). Global when GraphID is NULL, or scoped to a specific Graph.',
         NULL,
         'GraphEdgeType',
         'vwGraphEdgeTypes',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Graph Edge Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '987a289e-5763-4735-8ee3-ae61ca5c26cb', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('987a289e-5763-4735-8ee3-ae61ca5c26cb' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('987a289e-5763-4735-8ee3-ae61ca5c26cb' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('987a289e-5763-4735-8ee3-ae61ca5c26cb' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('987a289e-5763-4735-8ee3-ae61ca5c26cb' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('987a289e-5763-4735-8ee3-ae61ca5c26cb' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('987a289e-5763-4735-8ee3-ae61ca5c26cb' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Graph Edge Type Endpoints */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '8b441734-9c58-43b4-a4a0-f2c0e0d0b342',
         'MJ: Graph Edge Type Endpoints',
         'Graph Edge Type Endpoints',
         'Optional endpoint constraints restricting which MJ Entities may appear on the Source or Target side of a GraphEdgeType.',
         NULL,
         'GraphEdgeTypeEndpoint',
         'vwGraphEdgeTypeEndpoints',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Graph Edge Type Endpoints to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8b441734-9c58-43b4-a4a0-f2c0e0d0b342', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8b441734-9c58-43b4-a4a0-f2c0e0d0b342' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8b441734-9c58-43b4-a4a0-f2c0e0d0b342' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8b441734-9c58-43b4-a4a0-f2c0e0d0b342' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8b441734-9c58-43b4-a4a0-f2c0e0d0b342' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8b441734-9c58-43b4-a4a0-f2c0e0d0b342' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8b441734-9c58-43b4-a4a0-f2c0e0d0b342' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Graph Edge Providers */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '8068d8e0-6a4b-40d3-952e-ded867c8814a',
         'MJ: Graph Edge Providers',
         'Graph Edge Providers',
         'Registers a BaseGraphEdgeProvider class on a Graph to project derived edges at read time without duplicating underlying relational data.',
         NULL,
         'GraphEdgeProvider',
         'vwGraphEdgeProviders',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Graph Edge Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8068d8e0-6a4b-40d3-952e-ded867c8814a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8068d8e0-6a4b-40d3-952e-ded867c8814a' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8068d8e0-6a4b-40d3-952e-ded867c8814a' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8068d8e0-6a4b-40d3-952e-ded867c8814a' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8068d8e0-6a4b-40d3-952e-ded867c8814a' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('8068d8e0-6a4b-40d3-952e-ded867c8814a' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('8068d8e0-6a4b-40d3-952e-ded867c8814a' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Graph Edges */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '7fc12a09-e43d-44b4-8178-bf21c9cdaec4',
         'MJ: Graph Edges',
         'Graph Edges',
         'Persisted polymorphic graph edges connecting any two entity records within a Graph, carrying retrieval weight, origin (Declared vs Inferred), approval status, and confidence.',
         NULL,
         'GraphEdge',
         'vwGraphEdges',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Graph Edges to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7fc12a09-e43d-44b4-8178-bf21c9cdaec4', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edges for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7fc12a09-e43d-44b4-8178-bf21c9cdaec4' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7fc12a09-e43d-44b4-8178-bf21c9cdaec4' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edges for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7fc12a09-e43d-44b4-8178-bf21c9cdaec4' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7fc12a09-e43d-44b4-8178-bf21c9cdaec4' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edges for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7fc12a09-e43d-44b4-8178-bf21c9cdaec4' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7fc12a09-e43d-44b4-8178-bf21c9cdaec4' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Graph Concepts */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'fddd3e40-0131-4f60-a019-227d63051cdc',
         'MJ: Graph Concepts',
         'Graph Concepts',
         'Higher-level semantic concept nodes scoped to a Graph (such as Domain, Term, Policy, Metric, or Process definitions), serving as organizing hubs for Canon governance and Content Source GraphRAG overlays.',
         NULL,
         'GraphConcept',
         'vwGraphConcepts',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Graph Concepts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'fddd3e40-0131-4f60-a019-227d63051cdc', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Concepts for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('fddd3e40-0131-4f60-a019-227d63051cdc' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('fddd3e40-0131-4f60-a019-227d63051cdc' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concepts for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('fddd3e40-0131-4f60-a019-227d63051cdc' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('fddd3e40-0131-4f60-a019-227d63051cdc' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concepts for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('fddd3e40-0131-4f60-a019-227d63051cdc' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('fddd3e40-0131-4f60-a019-227d63051cdc' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConcept */
ALTER TABLE [${flyway:defaultSchema}].[GraphConcept] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConcept */
UPDATE [${flyway:defaultSchema}].[GraphConcept] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConcept */
ALTER TABLE [${flyway:defaultSchema}].[GraphConcept] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConcept */
ALTER TABLE [${flyway:defaultSchema}].[GraphConcept] ADD CONSTRAINT [DF___mj_GraphConcept___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConcept */
ALTER TABLE [${flyway:defaultSchema}].[GraphConcept] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConcept */
UPDATE [${flyway:defaultSchema}].[GraphConcept] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConcept */
ALTER TABLE [${flyway:defaultSchema}].[GraphConcept] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConcept */
ALTER TABLE [${flyway:defaultSchema}].[GraphConcept] ADD CONSTRAINT [DF___mj_GraphConcept___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeType] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
UPDATE [${flyway:defaultSchema}].[GraphEdgeType] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeType] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeType] ADD CONSTRAINT [DF___mj_GraphEdgeType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeType] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
UPDATE [${flyway:defaultSchema}].[GraphEdgeType] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeType] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeType */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeType] ADD CONSTRAINT [DF___mj_GraphEdgeType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdge */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdge] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdge */
UPDATE [${flyway:defaultSchema}].[GraphEdge] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdge */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdge] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdge */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdge] ADD CONSTRAINT [DF___mj_GraphEdge___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdge */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdge] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdge */
UPDATE [${flyway:defaultSchema}].[GraphEdge] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdge */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdge] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdge */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdge] ADD CONSTRAINT [DF___mj_GraphEdge___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeProvider] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
UPDATE [${flyway:defaultSchema}].[GraphEdgeProvider] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeProvider] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeProvider] ADD CONSTRAINT [DF___mj_GraphEdgeProvider___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeProvider] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
UPDATE [${flyway:defaultSchema}].[GraphEdgeProvider] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeProvider] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeProvider */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeProvider] ADD CONSTRAINT [DF___mj_GraphEdgeProvider___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Graph */
ALTER TABLE [${flyway:defaultSchema}].[Graph] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Graph */
UPDATE [${flyway:defaultSchema}].[Graph] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Graph */
ALTER TABLE [${flyway:defaultSchema}].[Graph] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.Graph */
ALTER TABLE [${flyway:defaultSchema}].[Graph] ADD CONSTRAINT [DF___mj_Graph___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Graph */
ALTER TABLE [${flyway:defaultSchema}].[Graph] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Graph */
UPDATE [${flyway:defaultSchema}].[Graph] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Graph */
ALTER TABLE [${flyway:defaultSchema}].[Graph] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.Graph */
ALTER TABLE [${flyway:defaultSchema}].[Graph] ADD CONSTRAINT [DF___mj_Graph___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
UPDATE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ADD CONSTRAINT [DF___mj_GraphEdgeTypeEndpoint___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
UPDATE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphEdgeTypeEndpoint */
ALTER TABLE [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ADD CONSTRAINT [DF___mj_GraphEdgeTypeEndpoint___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 62 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3b53b127-b8fc-4c36-a36b-5cea55c1a57f' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3b53b127-b8fc-4c36-a36b-5cea55c1a57f',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88a38981-5d2b-45c8-b9fe-a84109398933' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'GraphID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '88a38981-5d2b-45c8-b9fe-a84109398933',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'GraphID',
            'Graph ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '153b7dbb-ad06-4dd5-b0b1-36968be782c1' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'ParentID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '153b7dbb-ad06-4dd5-b0b1-36968be782c1',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'ParentID',
            'Parent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'FDDD3E40-0131-4F60-A019-227D63051CDC',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1932ac9c-278c-4756-97e5-2b50a6368f25' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1932ac9c-278c-4756-97e5-2b50a6368f25',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'Name',
            'Name',
            'Canonical name of the concept, unique within its owning GraphID.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63945900-a006-47cf-8c44-5722f4c940cb' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'ConceptType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '63945900-a006-47cf-8c44-5722f4c940cb',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'ConceptType',
            'Concept Type',
            'Structural classification of the concept: Domain, Term, Policy, Metric, or Process.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Term',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8544309-c27c-4b04-89d4-6c8a0c188de9' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f8544309-c27c-4b04-89d4-6c8a0c188de9',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'Description',
            'Description',
            'Concise 1-3 sentence definition (~100 tokens) injected into agent subgraphs and search results.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed6d8cbc-503e-489a-b1de-3c229e3d003d' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'Specification')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ed6d8cbc-503e-489a-b1de-3c229e3d003d',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'Specification',
            'Specification',
            'Structured markdown specification containing authoritative rules, thresholds, decision tables, exceptions, and chunk citations.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7770d8e4-0511-4244-8e7a-fe7814c73fbc' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'Synonyms')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7770d8e4-0511-4244-8e7a-fe7814c73fbc',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'Synonyms',
            'Synonyms',
            'JSON array of alternative names, acronyms, and surface forms that resolve to this concept.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1cfecc86-5c83-451e-85a3-8b2336e3e3ed' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'AuthorityTier')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1cfecc86-5c83-451e-85a3-8b2336e3e3ed',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'AuthorityTier',
            'Authority Tier',
            'Highest evidentiary authority tier backing this concept: Bylaws, BoardPolicy, ExecutiveSOP, DepartmentPractice, Reference, or Inferred.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Reference',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f2902635-d7e6-4ae3-94cb-9a1a8302c2e1' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2902635-d7e6-4ae3-94cb-9a1a8302c2e1',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'Status',
            'Status',
            'Governance lifecycle status of the concept: Draft, Proposed, Approved, or Deprecated.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Draft',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1adf0971-69c8-47ef-ba62-dea9e5a670b8' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1adf0971-69c8-47ef-ba62-dea9e5a670b8',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '568f43be-1855-471b-83c6-c07013596b26' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '568f43be-1855-471b-83c6-c07013596b26',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a7185cf9-a719-45cf-a215-5865726cb84c' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a7185cf9-a719-45cf-a215-5865726cb84c',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '490023a0-6e4c-4a32-b902-b1c25e8e7cce' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'GraphID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '490023a0-6e4c-4a32-b902-b1c25e8e7cce',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'GraphID',
            'Graph ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb3b26db-7a7d-4859-9c4a-e2072855a64f' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eb3b26db-7a7d-4859-9c4a-e2072855a64f',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'Name',
            'Name',
            'Forward-direction label of the edge type (e.g., Broader Than, Defines, SourcedFrom).',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25cfd6f8-ec88-40fa-bbd3-985e4562da2b' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '25cfd6f8-ec88-40fa-bbd3-985e4562da2b',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'Description',
            'Description',
            'Plain-language definition of what this relationship type means when connecting two nodes.',
            'nvarchar',
            -1,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1c88250-da54-49ba-8c8c-706480159318' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'IsDirected')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b1c88250-da54-49ba-8c8c-706480159318',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'IsDirected',
            'Is Directed',
            'When 1, the edge is directed from Source to Target; when 0, the relationship is symmetric/undirected.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32141bd9-63fd-425e-9cdb-2ac4a22c3767' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'InverseName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '32141bd9-63fd-425e-9cdb-2ac4a22c3767',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'InverseName',
            'Inverse Name',
            'Inverse label shown when traversing a directed edge from Target back to Source (e.g., Narrower Than for Broader Than).',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3064dfcc-8ffa-4ddb-b6a0-0ca7671c83e5' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'DefaultWeight')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3064dfcc-8ffa-4ddb-b6a0-0ca7671c83e5',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'DefaultWeight',
            'Default Weight',
            'Default retrieval weight (0.0000 to 1.0000) assigned to edges of this type during multi-hop graph expansion.',
            'decimal',
            5,
            5,
            4,
            0,
            '(1.0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa81e5b2-b418-4868-9b12-ba5bb2d4fee2' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'AllowStored')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'aa81e5b2-b418-4868-9b12-ba5bb2d4fee2',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'AllowStored',
            'Allow Stored',
            'When 1, rows of this edge type may be persisted in GraphEdge; when 0, edges of this type are produced exclusively at read time by a GraphEdgeProvider.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1a33eae3-6683-421b-9305-bf387befd1b8' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1a33eae3-6683-421b-9305-bf387befd1b8',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee5f33df-d91f-4678-8641-a9a11e17c1bf' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ee5f33df-d91f-4678-8641-a9a11e17c1bf',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c2759bd0-6d4f-4b04-bf48-b752cb13c179' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c2759bd0-6d4f-4b04-bf48-b752cb13c179',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c4c73bcc-76a4-4bb7-8133-15ec06fd4395' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'GraphID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c4c73bcc-76a4-4bb7-8133-15ec06fd4395',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'GraphID',
            'Graph ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '971ffe22-db34-4492-814b-f7dca29524c1' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'EdgeTypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '971ffe22-db34-4492-814b-f7dca29524c1',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'EdgeTypeID',
            'Edge Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '987A289E-5763-4735-8EE3-AE61CA5C26CB',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd9f0b61-c44a-47a4-87bd-cc1551defafd' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'SourceEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd9f0b61-c44a-47a4-87bd-cc1551defafd',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'SourceEntityID',
            'Source Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5e64435e-d5f0-4dc0-9f23-52cdfeb05392' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'SourceRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5e64435e-d5f0-4dc0-9f23-52cdfeb05392',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'SourceRecordID',
            'Source Record ID',
            'Record ID of the source node (compact URL segment for composite primary keys), paired with SourceEntityID.',
            'nvarchar',
            800,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '531b0f00-47d8-401e-bc13-e73a67a52795' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'TargetEntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '531b0f00-47d8-401e-bc13-e73a67a52795',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'TargetEntityID',
            'Target Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d9b184e-d1b8-4ba9-8948-9d7bad62df95' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'TargetRecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d9b184e-d1b8-4ba9-8948-9d7bad62df95',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'TargetRecordID',
            'Target Record ID',
            'Record ID of the target node (compact URL segment for composite primary keys), paired with TargetEntityID.',
            'nvarchar',
            800,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1efcd4ea-2c03-478d-b3cc-db9f1194f4f2' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'Weight')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1efcd4ea-2c03-478d-b3cc-db9f1194f4f2',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'Weight',
            'Weight',
            'Retrieval pull weight (0.0000 to 1.0000) used when scoring multi-hop graph paths.',
            'decimal',
            5,
            5,
            4,
            0,
            '(1.0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd04a2f5-0b9b-432e-8dea-ed781c7f6856' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dd04a2f5-0b9b-432e-8dea-ed781c7f6856',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'Description',
            'Description',
            'Human-readable explanation or provenance summary for why this edge connects the source and target nodes.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0830c6d0-1269-42dc-9a83-8ff8a340ef16' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'Attributes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0830c6d0-1269-42dc-9a83-8ff8a340ef16',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'Attributes',
            'Attributes',
            'Optional JSON object holding structured edge metadata (such as citations, authority tiers, or conflict details).',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48a4919a-91a9-424b-981f-95680d2ad912' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'Origin')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '48a4919a-91a9-424b-981f-95680d2ad912',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'Origin',
            'Origin',
            'How this edge was created: Declared (explicitly authored by a human or seed metadata) or Inferred (proposed by an AI or content pipeline stage).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Declared',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4883a949-53bb-4a14-bf07-8c00b27dd685' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4883a949-53bb-4a14-bf07-8c00b27dd685',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'Status',
            'Status',
            'Governance lifecycle status of the edge: Proposed, Approved, or Rejected. Default graph traversal includes Approved edges only.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Approved',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '413fd549-1b28-4df3-b731-fcdad7a4ea20' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'Confidence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '413fd549-1b28-4df3-b731-fcdad7a4ea20',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'Confidence',
            'Confidence',
            'Confidence score (0.0000 to 1.0000) for Inferred edges; NULL for Declared edges.',
            'decimal',
            5,
            5,
            4,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '826c61c5-8ecd-4783-aad7-e77f3b7c20c9' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '826c61c5-8ecd-4783-aad7-e77f3b7c20c9',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40f253d2-1fe9-4315-bbcd-acdf28e0aeaf' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '40f253d2-1fe9-4315-bbcd-acdf28e0aeaf',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e8e5b79-0be9-40c6-bdf9-b0e9c1f50b68' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'GraphID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1e8e5b79-0be9-40c6-bdf9-b0e9c1f50b68',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'GraphID',
            'Graph ID',
            'Optional target Semantic Graph (MJ: Graphs) that this Content Source populates when the Content Pipeline Graph overlay stage runs. Multiple Content Sources can share the same GraphID.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2609e0c9-6e2c-49ed-86fd-0dd88ca2b749' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2609e0c9-6e2c-49ed-86fd-0dd88ca2b749',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01b30f44-b87c-465e-87ef-594c5fbf1673' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'GraphID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '01b30f44-b87c-465e-87ef-594c5fbf1673',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'GraphID',
            'Graph ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c7e26fc-e89d-480f-9345-75fd3e277777' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4c7e26fc-e89d-480f-9345-75fd3e277777',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'Name',
            'Name',
            'Display name of this provider registration within the graph.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a647866b-51f7-4512-8e25-99319081c374' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a647866b-51f7-4512-8e25-99319081c374',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'Description',
            'Description',
            'Description of which derived edges this provider projects into the graph.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5f90da51-db48-4f90-a669-e262bafdea96' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5f90da51-db48-4f90-a669-e262bafdea96',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'DriverClass',
            'Driver Class',
            'ClassFactory registration key of the BaseGraphEdgeProvider subclass.',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3750013c-01a7-4532-8335-1970125d80ff' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3750013c-01a7-4532-8335-1970125d80ff',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'Configuration',
            'Configuration',
            'Provider-specific JSON configuration object passed to the provider at query time.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8fc2008-8d43-4540-9347-5e7f38757be0' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8fc2008-8d43-4540-9347-5e7f38757be0',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'Sequence',
            'Sequence',
            'Execution order of this provider relative to other providers on the same graph.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85263880-7be7-4b49-91bc-ee9e7ef3036b' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '85263880-7be7-4b49-91bc-ee9e7ef3036b',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'IsActive',
            'Is Active',
            'When 1, this provider participates in graph expansion queries; when 0, it is skipped.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '051b91e2-32fc-4a01-a571-ff0b713545b1' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '051b91e2-32fc-4a01-a571-ff0b713545b1',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '286e55c8-f1f2-4404-955d-93a10e27ed45' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '286e55c8-f1f2-4404-955d-93a10e27ed45',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b343bfb-249d-486c-a867-57c0108e406b' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b343bfb-249d-486c-a867-57c0108e406b',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a5a82d9-e2b1-44f4-968d-b3c4d12b30b3' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a5a82d9-e2b1-44f4-968d-b3c4d12b30b3',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            'Name',
            'Name',
            'Unique name of the semantic graph partition (e.g., MJ Canon, Industry Research Graph).',
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27a2fe17-f973-4b4e-8efe-0e32724524c8' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '27a2fe17-f973-4b4e-8efe-0e32724524c8',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            'Description',
            'Description',
            'Plain-language description of the domain, purpose, and governance scope of this graph.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba67a003-ed4f-4553-ac95-297a02398709' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = 'GraphType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ba67a003-ed4f-4553-ac95-297a02398709',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            'GraphType',
            'Graph Type',
            'Semantic category of the graph: Canon (governed organizational definitions, policies, metrics, and workflows), Knowledge (document/RAG topic and concept graph), Network (entity relationship network), or Custom.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Custom',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc5403f2-78d9-4e19-8793-fb2bdfa9c121' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = 'LoadMode')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cc5403f2-78d9-4e19-8793-fb2bdfa9c121',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            'LoadMode',
            'Load Mode',
            'Whether the graph is preloaded into memory at startup (Preload, for compact metadata/Canon graphs) or traversed on demand (OnDemand, for large data/document graphs).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Preload',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e1cfe3c-c3fe-4c06-8d01-fdd52a7d91e9' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1e1cfe3c-c3fe-4c06-8d01-fdd52a7d91e9',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            'Status',
            'Status',
            'Operational status of the graph (Active or Disabled).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b76ba3a-a2b9-44cc-ac87-a92d26147918' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b76ba3a-a2b9-44cc-ac87-a92d26147918',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8257e963-a41a-488c-8534-7cb4fca05366' OR (EntityID = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8257e963-a41a-488c-8534-7cb4fca05366',
            '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51df14c0-f6e9-4be2-84bf-a851239d0cd4' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51df14c0-f6e9-4be2-84bf-a851239d0cd4',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '91d9fa3b-9b66-4c86-b3f3-a6af9ea9ce80' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = 'EdgeTypeID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '91d9fa3b-9b66-4c86-b3f3-a6af9ea9ce80',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            'EdgeTypeID',
            'Edge Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '987A289E-5763-4735-8EE3-AE61CA5C26CB',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a36fe7d-721f-4463-b5c8-fcf4e98baba1' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = 'Side')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a36fe7d-721f-4463-b5c8-fcf4e98baba1',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            'Side',
            'Side',
            'Which endpoint of the edge this entity constraint applies to (Source or Target).',
            'nvarchar',
            20,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce286c25-49da-4e7a-a06a-ef5ecd48fb9d' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ce286c25-49da-4e7a-a06a-ef5ecd48fb9d',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            'EntityID',
            'Entity ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3d4cab6d-6514-45e9-b70f-0a7c81d8b4fb' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3d4cab6d-6514-45e9-b70f-0a7c81d8b4fb',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '09617ec9-202f-436d-8927-930a2f504136' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '09617ec9-202f-436d-8927-930a2f504136',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID 4eaf68b3-67ea-4882-b3b6-c38b4dda385c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4eaf68b3-67ea-4882-b3b6-c38b4dda385c', 'BA67A003-ED4F-4553-AC95-297A02398709', 1, 'Canon', 'Canon', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e5fad9ed-3359-4e9c-a5a8-8d29ebfe1c0f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e5fad9ed-3359-4e9c-a5a8-8d29ebfe1c0f', 'BA67A003-ED4F-4553-AC95-297A02398709', 2, 'Custom', 'Custom', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 11091896-caf6-4391-ab8f-a12a70f3ddab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('11091896-caf6-4391-ab8f-a12a70f3ddab', 'BA67A003-ED4F-4553-AC95-297A02398709', 3, 'Knowledge', 'Knowledge', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c828171c-2200-4618-9cf4-fdf361bfb932 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c828171c-2200-4618-9cf4-fdf361bfb932', 'BA67A003-ED4F-4553-AC95-297A02398709', 4, 'Network', 'Network', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID BA67A003-ED4F-4553-AC95-297A02398709 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='BA67A003-ED4F-4553-AC95-297A02398709';

/* SQL text to insert entity field value with ID 98a5684d-2b8c-4684-889c-fd9e3eaf7f95 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('98a5684d-2b8c-4684-889c-fd9e3eaf7f95', 'CC5403F2-78D9-4E19-8793-FB2BDFA9C121', 1, 'OnDemand', 'OnDemand', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a7a4fea3-adc6-4ae8-8230-809e9b432956 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a7a4fea3-adc6-4ae8-8230-809e9b432956', 'CC5403F2-78D9-4E19-8793-FB2BDFA9C121', 2, 'Preload', 'Preload', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CC5403F2-78D9-4E19-8793-FB2BDFA9C121 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CC5403F2-78D9-4E19-8793-FB2BDFA9C121';

/* SQL text to insert entity field value with ID 0828ae46-325c-46bb-8771-a3b2f1151cfd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0828ae46-325c-46bb-8771-a3b2f1151cfd', '1E1CFE3C-C3FE-4C06-8D01-FDD52A7D91E9', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a427647f-dcce-4aef-8086-9940f5d49469 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a427647f-dcce-4aef-8086-9940f5d49469', '1E1CFE3C-C3FE-4C06-8D01-FDD52A7D91E9', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1E1CFE3C-C3FE-4C06-8D01-FDD52A7D91E9 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1E1CFE3C-C3FE-4C06-8D01-FDD52A7D91E9';

/* SQL text to insert entity field value with ID f2e36c94-bbc1-4338-9bc7-9ed60e1b60b0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f2e36c94-bbc1-4338-9bc7-9ed60e1b60b0', '8A36FE7D-721F-4463-B5C8-FCF4E98BABA1', 1, 'Source', 'Source', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a68be9af-6ac6-4e67-ba31-b008d784030b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a68be9af-6ac6-4e67-ba31-b008d784030b', '8A36FE7D-721F-4463-B5C8-FCF4E98BABA1', 2, 'Target', 'Target', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8A36FE7D-721F-4463-B5C8-FCF4E98BABA1 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='8A36FE7D-721F-4463-B5C8-FCF4E98BABA1';

/* SQL text to insert entity field value with ID 145d5340-7e6c-4de3-9ba6-4d5483c1c0cb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('145d5340-7e6c-4de3-9ba6-4d5483c1c0cb', '48A4919A-91A9-424B-981F-95680D2AD912', 1, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8a377e93-d399-4dd5-a13b-8af0e053af7e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8a377e93-d399-4dd5-a13b-8af0e053af7e', '48A4919A-91A9-424B-981F-95680D2AD912', 2, 'Inferred', 'Inferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 48A4919A-91A9-424B-981F-95680D2AD912 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='48A4919A-91A9-424B-981F-95680D2AD912';

/* SQL text to insert entity field value with ID c6d00347-e0e1-4761-a2d4-8ebf2e1d93fc */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c6d00347-e0e1-4761-a2d4-8ebf2e1d93fc', '4883A949-53BB-4A14-BF07-8C00B27DD685', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6a755b27-da79-4e9a-9332-d693ff930340 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6a755b27-da79-4e9a-9332-d693ff930340', '4883A949-53BB-4A14-BF07-8C00B27DD685', 2, 'Proposed', 'Proposed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 10961477-071f-47a5-afbe-c3ded8f14886 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('10961477-071f-47a5-afbe-c3ded8f14886', '4883A949-53BB-4A14-BF07-8C00B27DD685', 3, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4883A949-53BB-4A14-BF07-8C00B27DD685 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4883A949-53BB-4A14-BF07-8C00B27DD685';

/* SQL text to insert entity field value with ID 8bd98e89-4a74-45b2-ad09-26566374d407 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8bd98e89-4a74-45b2-ad09-26566374d407', '63945900-A006-47CF-8C44-5722F4C940CB', 1, 'Domain', 'Domain', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ea3b3c22-dc34-4f74-b34a-b25646c348d9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ea3b3c22-dc34-4f74-b34a-b25646c348d9', '63945900-A006-47CF-8C44-5722F4C940CB', 2, 'Metric', 'Metric', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 499fe8df-426d-44a0-b010-7489a521fa45 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('499fe8df-426d-44a0-b010-7489a521fa45', '63945900-A006-47CF-8C44-5722F4C940CB', 3, 'Policy', 'Policy', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1d32c476-ab9d-403c-b1b7-542c79586100 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1d32c476-ab9d-403c-b1b7-542c79586100', '63945900-A006-47CF-8C44-5722F4C940CB', 4, 'Process', 'Process', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0ce9ec7c-848d-431f-8e03-16fd6a02e7b5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0ce9ec7c-848d-431f-8e03-16fd6a02e7b5', '63945900-A006-47CF-8C44-5722F4C940CB', 5, 'Term', 'Term', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 63945900-A006-47CF-8C44-5722F4C940CB */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='63945900-A006-47CF-8C44-5722F4C940CB';

/* SQL text to insert entity field value with ID a9bbac08-d689-4f33-8d8a-1eea48d4f528 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a9bbac08-d689-4f33-8d8a-1eea48d4f528', '1CFECC86-5C83-451E-85A3-8B2336E3E3ED', 1, 'BoardPolicy', 'BoardPolicy', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d10dfe31-0ddb-452b-a2a1-52e7b79f1ea7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d10dfe31-0ddb-452b-a2a1-52e7b79f1ea7', '1CFECC86-5C83-451E-85A3-8B2336E3E3ED', 2, 'Bylaws', 'Bylaws', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 745d34b4-2b7e-4c2e-8398-e79709228c88 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('745d34b4-2b7e-4c2e-8398-e79709228c88', '1CFECC86-5C83-451E-85A3-8B2336E3E3ED', 3, 'DepartmentPractice', 'DepartmentPractice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f0d102f3-f6c1-43d1-839f-36a75f78bbb1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f0d102f3-f6c1-43d1-839f-36a75f78bbb1', '1CFECC86-5C83-451E-85A3-8B2336E3E3ED', 4, 'ExecutiveSOP', 'ExecutiveSOP', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 63a46901-6d1c-41d9-98e8-708e61e5fad0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('63a46901-6d1c-41d9-98e8-708e61e5fad0', '1CFECC86-5C83-451E-85A3-8B2336E3E3ED', 5, 'Inferred', 'Inferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 82e7b849-ca12-4457-b419-bdcdcb6345c2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82e7b849-ca12-4457-b419-bdcdcb6345c2', '1CFECC86-5C83-451E-85A3-8B2336E3E3ED', 6, 'Reference', 'Reference', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1CFECC86-5C83-451E-85A3-8B2336E3E3ED */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1CFECC86-5C83-451E-85A3-8B2336E3E3ED';

/* SQL text to insert entity field value with ID 5f52c36c-6a76-4d72-8c4d-1c653b1d2779 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5f52c36c-6a76-4d72-8c4d-1c653b1d2779', 'F2902635-D7E6-4AE3-94CB-9A1A8302C2E1', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d0689a8a-eb64-4fba-b4e3-372bceee36b5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d0689a8a-eb64-4fba-b4e3-372bceee36b5', 'F2902635-D7E6-4AE3-94CB-9A1A8302C2E1', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2ac77750-25a1-4863-a2cc-5c64b32ed5d6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2ac77750-25a1-4863-a2cc-5c64b32ed5d6', 'F2902635-D7E6-4AE3-94CB-9A1A8302C2E1', 3, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f7a46ffe-ee49-45e8-8272-dc6aac68e69d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f7a46ffe-ee49-45e8-8272-dc6aac68e69d', 'F2902635-D7E6-4AE3-94CB-9A1A8302C2E1', 4, 'Proposed', 'Proposed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F2902635-D7E6-4AE3-94CB-9A1A8302C2E1 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F2902635-D7E6-4AE3-94CB-9A1A8302C2E1';

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Graph Concepts -> MJ: Graph Concepts (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd3cb49eb-81ab-4bd6-8ecf-9362c85ea078' OR ([EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND [RelatedEntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND [RelatedEntityJoinField] = 'ParentID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d3cb49eb-81ab-4bd6-8ecf-9362c85ea078', 'FDDD3E40-0131-4F60-A019-227D63051CDC', 'FDDD3E40-0131-4F60-A019-227D63051CDC', 'ParentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edges (One To Many via SourceEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f59c0402-95dc-45f5-ae0d-79385a2d531b' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND [RelatedEntityJoinField] = 'SourceEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f59c0402-95dc-45f5-ae0d-79385a2d531b', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', 'SourceEntityID', 'One To Many', 1, 1, 90, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edges (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9b7a90c1-8731-4177-8022-f44e12a1a405' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND [RelatedEntityJoinField] = 'TargetEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9b7a90c1-8731-4177-8022-f44e12a1a405', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', 'TargetEntityID', 'One To Many', 1, 1, 91, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edge Type Endpoints (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a679d54b-f7f4-46bb-90a9-43c34f80ea2a' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND [RelatedEntityJoinField] = 'EntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a679d54b-f7f4-46bb-90a9-43c34f80ea2a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', 'EntityID', 'One To Many', 1, 1, 92, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Edge Types -> MJ: Graph Edges (One To Many via EdgeTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dbc5e541-2a99-405f-844e-42d792f50bab' OR ([EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND [RelatedEntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND [RelatedEntityJoinField] = 'EdgeTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dbc5e541-2a99-405f-844e-42d792f50bab', '987A289E-5763-4735-8EE3-AE61CA5C26CB', '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', 'EdgeTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graph Edge Types -> MJ: Graph Edge Type Endpoints (One To Many via EdgeTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '531128a5-9ab9-4069-a367-eee4698fd46f' OR ([EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND [RelatedEntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND [RelatedEntityJoinField] = 'EdgeTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('531128a5-9ab9-4069-a367-eee4698fd46f', '987A289E-5763-4735-8EE3-AE61CA5C26CB', '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', 'EdgeTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Concepts (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '186f81b5-cfc6-43c6-b0df-a2a13a599f5c' OR ([EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND [RelatedEntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('186f81b5-cfc6-43c6-b0df-a2a13a599f5c', '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', 'FDDD3E40-0131-4F60-A019-227D63051CDC', 'GraphID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edge Types (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '7a74673e-e942-4dc9-a58d-b41249090c37' OR ([EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND [RelatedEntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7a74673e-e942-4dc9-a58d-b41249090c37', '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', '987A289E-5763-4735-8EE3-AE61CA5C26CB', 'GraphID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edges (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '629ae722-c9a0-4d52-8b1b-288925586566' OR ([EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND [RelatedEntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('629ae722-c9a0-4d52-8b1b-288925586566', '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', 'GraphID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Content Sources (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a4418bc1-b258-42fb-a5bb-6115e6b0ae47' OR ([EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND [RelatedEntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a4418bc1-b258-42fb-a5bb-6115e6b0ae47', '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'GraphID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edge Providers (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2cee0329-a49c-4c5c-916e-0a97a79cb7fa' OR ([EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND [RelatedEntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2cee0329-a49c-4c5c-916e-0a97a79cb7fa', '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', '8068D8E0-6A4B-40D3-952E-DED867C8814A', 'GraphID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for ContentSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ContentTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentTypeID]);

-- Index for foreign key ContentSourceTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentSourceTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentSourceTypeID]);

-- Index for foreign key ContentFileTypeID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ContentFileTypeID ON [${flyway:defaultSchema}].[ContentSource] ([ContentFileTypeID]);

-- Index for foreign key EmbeddingModelID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EmbeddingModelID ON [${flyway:defaultSchema}].[ContentSource] ([EmbeddingModelID]);

-- Index for foreign key VectorIndexID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_VectorIndexID ON [${flyway:defaultSchema}].[ContentSource] ([VectorIndexID]);

-- Index for foreign key EntityID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityID ON [${flyway:defaultSchema}].[ContentSource] ([EntityID]);

-- Index for foreign key EntityDocumentID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_EntityDocumentID ON [${flyway:defaultSchema}].[ContentSource] ([EntityDocumentID]);

-- Index for foreign key ScheduledJobID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_ScheduledJobID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_ScheduledJobID ON [${flyway:defaultSchema}].[ContentSource] ([ScheduledJobID]);

-- Index for foreign key GraphID in table ContentSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ContentSource_GraphID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ContentSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ContentSource_GraphID ON [${flyway:defaultSchema}].[ContentSource] ([GraphID]);

/* SQL text to update entity field related entity name field map for entity field ID 1E8E5B79-0BE9-40C6-BDF9-B0E9C1F50B68 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1E8E5B79-0BE9-40C6-BDF9-B0E9C1F50B68', @RelatedEntityNameFieldMap='Graph';

/* Base View SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ContentSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwContentSources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwContentSources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwContentSources]
AS
SELECT
    c.*,
    MJContentType_ContentTypeID.[Name] AS [ContentType],
    MJContentSourceType_ContentSourceTypeID.[Name] AS [ContentSourceType],
    MJContentFileType_ContentFileTypeID.[Name] AS [ContentFileType],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJVectorIndex_VectorIndexID.[Name] AS [VectorIndex],
    MJEntity_EntityID.[Name] AS [Entity],
    MJEntityDocument_EntityDocumentID.[Name] AS [EntityDocument],
    MJScheduledJob_ScheduledJobID.[Name] AS [ScheduledJob],
    MJGraph_GraphID.[Name] AS [Graph]
FROM
    [${flyway:defaultSchema}].[ContentSource] AS c
INNER JOIN
    [${flyway:defaultSchema}].[ContentType] AS MJContentType_ContentTypeID
  ON
    [c].[ContentTypeID] = MJContentType_ContentTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentSourceType] AS MJContentSourceType_ContentSourceTypeID
  ON
    [c].[ContentSourceTypeID] = MJContentSourceType_ContentSourceTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ContentFileType] AS MJContentFileType_ContentFileTypeID
  ON
    [c].[ContentFileTypeID] = MJContentFileType_ContentFileTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [c].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[VectorIndex] AS MJVectorIndex_VectorIndexID
  ON
    [c].[VectorIndexID] = MJVectorIndex_VectorIndexID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [c].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS MJEntityDocument_EntityDocumentID
  ON
    [c].[EntityDocumentID] = MJEntityDocument_EntityDocumentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ScheduledJob] AS MJScheduledJob_ScheduledJobID
  ON
    [c].[ScheduledJobID] = MJScheduledJob_ScheduledJobID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Graph] AS MJGraph_GraphID
  ON
    [c].[GraphID] = MJGraph_GraphID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: Permissions for vwContentSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwContentSources] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwContentSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spCreateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentSource]
    @ID uniqueidentifier = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContentTypeID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @ContentFileTypeID uniqueidentifier,
    @URL nvarchar(2000),
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @EntityDocumentID_Clear bit = 0,
    @EntityDocumentID uniqueidentifier = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ScheduledJobID_Clear bit = 0,
    @ScheduledJobID uniqueidentifier = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @ForceDiscovery bit = NULL,
    @LastDiscoveredAt_Clear bit = 0,
    @LastDiscoveredAt datetimeoffset = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @GraphID_Clear bit = 0,
    @GraphID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [ID],
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID],
                [SegmenterKey],
                [CleanerKey],
                [ScheduledJobID],
                [FieldConfidence],
                [ForceDiscovery],
                [LastDiscoveredAt],
                [LastSyncedAt],
                [GraphID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                ISNULL(@ForceDiscovery, 0),
                CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                CASE WHEN @GraphID_Clear = 1 THEN NULL ELSE ISNULL(@GraphID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentSource]
            (
                [Name],
                [ContentTypeID],
                [ContentSourceTypeID],
                [ContentFileTypeID],
                [URL],
                [EmbeddingModelID],
                [VectorIndexID],
                [Configuration],
                [EntityID],
                [EntityDocumentID],
                [SegmenterKey],
                [CleanerKey],
                [ScheduledJobID],
                [FieldConfidence],
                [ForceDiscovery],
                [LastDiscoveredAt],
                [LastSyncedAt],
                [GraphID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                @ContentTypeID,
                @ContentSourceTypeID,
                @ContentFileTypeID,
                @URL,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, NULL) END,
                CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, NULL) END,
                CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, NULL) END,
                CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, NULL) END,
                CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, NULL) END,
                ISNULL(@ForceDiscovery, 0),
                CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, NULL) END,
                CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, NULL) END,
                CASE WHEN @GraphID_Clear = 1 THEN NULL ELSE ISNULL(@GraphID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spUpdateContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentSource]
    @ID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @ContentTypeID uniqueidentifier = NULL,
    @ContentSourceTypeID uniqueidentifier = NULL,
    @ContentFileTypeID uniqueidentifier = NULL,
    @URL nvarchar(2000) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @VectorIndexID_Clear bit = 0,
    @VectorIndexID uniqueidentifier = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @EntityDocumentID_Clear bit = 0,
    @EntityDocumentID uniqueidentifier = NULL,
    @SegmenterKey_Clear bit = 0,
    @SegmenterKey nvarchar(100) = NULL,
    @CleanerKey_Clear bit = 0,
    @CleanerKey nvarchar(100) = NULL,
    @ScheduledJobID_Clear bit = 0,
    @ScheduledJobID uniqueidentifier = NULL,
    @FieldConfidence_Clear bit = 0,
    @FieldConfidence nvarchar(MAX) = NULL,
    @ForceDiscovery bit = NULL,
    @LastDiscoveredAt_Clear bit = 0,
    @LastDiscoveredAt datetimeoffset = NULL,
    @LastSyncedAt_Clear bit = 0,
    @LastSyncedAt datetimeoffset = NULL,
    @GraphID_Clear bit = 0,
    @GraphID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [ContentTypeID] = ISNULL(@ContentTypeID, [ContentTypeID]),
        [ContentSourceTypeID] = ISNULL(@ContentSourceTypeID, [ContentSourceTypeID]),
        [ContentFileTypeID] = ISNULL(@ContentFileTypeID, [ContentFileTypeID]),
        [URL] = ISNULL(@URL, [URL]),
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [VectorIndexID] = CASE WHEN @VectorIndexID_Clear = 1 THEN NULL ELSE ISNULL(@VectorIndexID, [VectorIndexID]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [EntityDocumentID] = CASE WHEN @EntityDocumentID_Clear = 1 THEN NULL ELSE ISNULL(@EntityDocumentID, [EntityDocumentID]) END,
        [SegmenterKey] = CASE WHEN @SegmenterKey_Clear = 1 THEN NULL ELSE ISNULL(@SegmenterKey, [SegmenterKey]) END,
        [CleanerKey] = CASE WHEN @CleanerKey_Clear = 1 THEN NULL ELSE ISNULL(@CleanerKey, [CleanerKey]) END,
        [ScheduledJobID] = CASE WHEN @ScheduledJobID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobID, [ScheduledJobID]) END,
        [FieldConfidence] = CASE WHEN @FieldConfidence_Clear = 1 THEN NULL ELSE ISNULL(@FieldConfidence, [FieldConfidence]) END,
        [ForceDiscovery] = ISNULL(@ForceDiscovery, [ForceDiscovery]),
        [LastDiscoveredAt] = CASE WHEN @LastDiscoveredAt_Clear = 1 THEN NULL ELSE ISNULL(@LastDiscoveredAt, [LastDiscoveredAt]) END,
        [LastSyncedAt] = CASE WHEN @LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSyncedAt, [LastSyncedAt]) END,
        [GraphID] = CASE WHEN @GraphID_Clear = 1 THEN NULL ELSE ISNULL(@GraphID, [GraphID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwContentSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwContentSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentSource
ON [${flyway:defaultSchema}].[ContentSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Content Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Sources
-- Item: spDeleteContentSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteContentSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteContentSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ContentSource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Content Sources */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteContentSource] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for GraphConcept */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concepts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GraphID in table GraphConcept
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphConcept_GraphID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphConcept]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphConcept_GraphID ON [${flyway:defaultSchema}].[GraphConcept] ([GraphID]);

-- Index for foreign key ParentID in table GraphConcept
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphConcept_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphConcept]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphConcept_ParentID ON [${flyway:defaultSchema}].[GraphConcept] ([ParentID]);

/* SQL text to update entity field related entity name field map for entity field ID 88A38981-5D2B-45C8-B9FE-A84109398933 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='88A38981-5D2B-45C8-B9FE-A84109398933', @RelatedEntityNameFieldMap='Graph';

/* Index for Foreign Keys for GraphEdgeProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GraphID in table GraphEdgeProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdgeProvider_GraphID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdgeProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdgeProvider_GraphID ON [${flyway:defaultSchema}].[GraphEdgeProvider] ([GraphID]);

/* SQL text to update entity field related entity name field map for entity field ID 01B30F44-B87C-465E-87EF-594C5FBF1673 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='01B30F44-B87C-465E-87EF-594C5FBF1673', @RelatedEntityNameFieldMap='Graph';

/* Index for Foreign Keys for GraphEdgeTypeEndpoint */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Type Endpoints
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EdgeTypeID in table GraphEdgeTypeEndpoint
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdgeTypeEndpoint_EdgeTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdgeTypeEndpoint_EdgeTypeID ON [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ([EdgeTypeID]);

-- Index for foreign key EntityID in table GraphEdgeTypeEndpoint
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdgeTypeEndpoint_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdgeTypeEndpoint_EntityID ON [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] ([EntityID]);

/* SQL text to update entity field related entity name field map for entity field ID 91D9FA3B-9B66-4C86-B3F3-A6AF9EA9CE80 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='91D9FA3B-9B66-4C86-B3F3-A6AF9EA9CE80', @RelatedEntityNameFieldMap='EdgeType';

/* Index for Foreign Keys for GraphEdgeType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GraphID in table GraphEdgeType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdgeType_GraphID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdgeType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdgeType_GraphID ON [${flyway:defaultSchema}].[GraphEdgeType] ([GraphID]);

/* SQL text to update entity field related entity name field map for entity field ID 490023A0-6E4C-4A32-B902-B1C25E8E7CCE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='490023A0-6E4C-4A32-B902-B1C25E8E7CCE', @RelatedEntityNameFieldMap='Graph';

/* Base View SQL for MJ: Graph Edge Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Providers
-- Item: vwGraphEdgeProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Edge Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphEdgeProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphEdgeProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphEdgeProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphEdgeProviders]
AS
SELECT
    g.*,
    MJGraph_GraphID.[Name] AS [Graph]
FROM
    [${flyway:defaultSchema}].[GraphEdgeProvider] AS g
INNER JOIN
    [${flyway:defaultSchema}].[Graph] AS MJGraph_GraphID
  ON
    [g].[GraphID] = MJGraph_GraphID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdgeProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Edge Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Providers
-- Item: Permissions for vwGraphEdgeProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdgeProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Edge Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Providers
-- Item: spCreateGraphEdgeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphEdgeProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphEdgeProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdgeProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdgeProvider]
    @ID uniqueidentifier = NULL,
    @GraphID uniqueidentifier,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255),
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GraphEdgeProvider]
            (
                [ID],
                [GraphID],
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [Sequence],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @GraphID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Sequence, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphEdgeProvider]
            (
                [GraphID],
                [Name],
                [Description],
                [DriverClass],
                [Configuration],
                [Sequence],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @GraphID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Sequence, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphEdgeProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdgeProvider] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Edge Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdgeProvider] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Edge Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Providers
-- Item: spUpdateGraphEdgeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphEdgeProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphEdgeProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdgeProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdgeProvider]
    @ID uniqueidentifier,
    @GraphID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdgeProvider]
    SET
        [GraphID] = ISNULL(@GraphID, [GraphID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphEdgeProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphEdgeProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdgeProvider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphEdgeProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphEdgeProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphEdgeProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphEdgeProvider
ON [${flyway:defaultSchema}].[GraphEdgeProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdgeProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphEdgeProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Edge Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdgeProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graph Edge Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Providers
-- Item: spDeleteGraphEdgeProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphEdgeProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphEdgeProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdgeProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdgeProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphEdgeProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdgeProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Edge Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdgeProvider] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Graph Edge Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Types
-- Item: vwGraphEdgeTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Edge Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphEdgeType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphEdgeTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphEdgeTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphEdgeTypes]
AS
SELECT
    g.*,
    MJGraph_GraphID.[Name] AS [Graph]
FROM
    [${flyway:defaultSchema}].[GraphEdgeType] AS g
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Graph] AS MJGraph_GraphID
  ON
    [g].[GraphID] = MJGraph_GraphID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdgeTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Edge Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Types
-- Item: Permissions for vwGraphEdgeTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdgeTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Edge Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Types
-- Item: spCreateGraphEdgeType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphEdgeType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphEdgeType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdgeType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdgeType]
    @ID uniqueidentifier = NULL,
    @GraphID_Clear bit = 0,
    @GraphID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDirected bit = NULL,
    @InverseName_Clear bit = 0,
    @InverseName nvarchar(100) = NULL,
    @DefaultWeight decimal(5, 4) = NULL,
    @AllowStored bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GraphEdgeType]
            (
                [ID],
                [GraphID],
                [Name],
                [Description],
                [IsDirected],
                [InverseName],
                [DefaultWeight],
                [AllowStored]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @GraphID_Clear = 1 THEN NULL ELSE ISNULL(@GraphID, NULL) END,
                @Name,
                @Description,
                ISNULL(@IsDirected, 1),
                CASE WHEN @InverseName_Clear = 1 THEN NULL ELSE ISNULL(@InverseName, NULL) END,
                ISNULL(@DefaultWeight, 1.0),
                ISNULL(@AllowStored, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphEdgeType]
            (
                [GraphID],
                [Name],
                [Description],
                [IsDirected],
                [InverseName],
                [DefaultWeight],
                [AllowStored]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @GraphID_Clear = 1 THEN NULL ELSE ISNULL(@GraphID, NULL) END,
                @Name,
                @Description,
                ISNULL(@IsDirected, 1),
                CASE WHEN @InverseName_Clear = 1 THEN NULL ELSE ISNULL(@InverseName, NULL) END,
                ISNULL(@DefaultWeight, 1.0),
                ISNULL(@AllowStored, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphEdgeTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdgeType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Edge Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdgeType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Edge Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Types
-- Item: spUpdateGraphEdgeType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphEdgeType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphEdgeType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdgeType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdgeType]
    @ID uniqueidentifier,
    @GraphID_Clear bit = 0,
    @GraphID uniqueidentifier = NULL,
    @Name nvarchar(100) = NULL,
    @Description nvarchar(MAX) = NULL,
    @IsDirected bit = NULL,
    @InverseName_Clear bit = 0,
    @InverseName nvarchar(100) = NULL,
    @DefaultWeight decimal(5, 4) = NULL,
    @AllowStored bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdgeType]
    SET
        [GraphID] = CASE WHEN @GraphID_Clear = 1 THEN NULL ELSE ISNULL(@GraphID, [GraphID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Description] = ISNULL(@Description, [Description]),
        [IsDirected] = ISNULL(@IsDirected, [IsDirected]),
        [InverseName] = CASE WHEN @InverseName_Clear = 1 THEN NULL ELSE ISNULL(@InverseName, [InverseName]) END,
        [DefaultWeight] = ISNULL(@DefaultWeight, [DefaultWeight]),
        [AllowStored] = ISNULL(@AllowStored, [AllowStored])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphEdgeTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphEdgeTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdgeType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphEdgeType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphEdgeType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphEdgeType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphEdgeType
ON [${flyway:defaultSchema}].[GraphEdgeType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdgeType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphEdgeType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Edge Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdgeType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graph Edge Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Types
-- Item: spDeleteGraphEdgeType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphEdgeType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphEdgeType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdgeType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdgeType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphEdgeType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdgeType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Edge Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdgeType] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 153B7DBB-AD06-4DD5-B0B1-36968BE782C1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='153B7DBB-AD06-4DD5-B0B1-36968BE782C1', @RelatedEntityNameFieldMap='Parent';

/* SQL text to update entity field related entity name field map for entity field ID CE286C25-49DA-4E7A-A06A-EF5ECD48FB9D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CE286C25-49DA-4E7A-A06A-EF5ECD48FB9D', @RelatedEntityNameFieldMap='Entity';

/* Base View SQL for MJ: Graph Edge Type Endpoints */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Type Endpoints
-- Item: vwGraphEdgeTypeEndpoints
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Edge Type Endpoints
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphEdgeTypeEndpoint
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints]
AS
SELECT
    g.*,
    MJGraphEdgeType_EdgeTypeID.[Name] AS [EdgeType],
    MJEntity_EntityID.[Name] AS [Entity]
FROM
    [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] AS g
INNER JOIN
    [${flyway:defaultSchema}].[GraphEdgeType] AS MJGraphEdgeType_EdgeTypeID
  ON
    [g].[EdgeTypeID] = MJGraphEdgeType_EdgeTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [g].[EntityID] = MJEntity_EntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Edge Type Endpoints */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Type Endpoints
-- Item: Permissions for vwGraphEdgeTypeEndpoints
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Edge Type Endpoints */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Type Endpoints
-- Item: spCreateGraphEdgeTypeEndpoint
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphEdgeTypeEndpoint
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphEdgeTypeEndpoint]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdgeTypeEndpoint];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdgeTypeEndpoint]
    @ID uniqueidentifier = NULL,
    @EdgeTypeID uniqueidentifier,
    @Side nvarchar(10),
    @EntityID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]
            (
                [ID],
                [EdgeTypeID],
                [Side],
                [EntityID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EdgeTypeID,
                @Side,
                @EntityID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]
            (
                [EdgeTypeID],
                [Side],
                [EntityID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EdgeTypeID,
                @Side,
                @EntityID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdgeTypeEndpoint] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Edge Type Endpoints */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdgeTypeEndpoint] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Edge Type Endpoints */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Type Endpoints
-- Item: spUpdateGraphEdgeTypeEndpoint
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphEdgeTypeEndpoint
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphEdgeTypeEndpoint]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdgeTypeEndpoint];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdgeTypeEndpoint]
    @ID uniqueidentifier,
    @EdgeTypeID uniqueidentifier = NULL,
    @Side nvarchar(10) = NULL,
    @EntityID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]
    SET
        [EdgeTypeID] = ISNULL(@EdgeTypeID, [EdgeTypeID]),
        [Side] = ISNULL(@Side, [Side]),
        [EntityID] = ISNULL(@EntityID, [EntityID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphEdgeTypeEndpoints]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdgeTypeEndpoint] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphEdgeTypeEndpoint table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphEdgeTypeEndpoint]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphEdgeTypeEndpoint];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphEdgeTypeEndpoint
ON [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Edge Type Endpoints */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdgeTypeEndpoint] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graph Edge Type Endpoints */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edge Type Endpoints
-- Item: spDeleteGraphEdgeTypeEndpoint
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphEdgeTypeEndpoint
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphEdgeTypeEndpoint]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdgeTypeEndpoint];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdgeTypeEndpoint]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdgeTypeEndpoint] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Edge Type Endpoints */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdgeTypeEndpoint] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: Graph Concepts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concepts
-- Item: vwGraphConcepts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Concepts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphConcept
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphConcepts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphConcepts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphConcepts]
AS
SELECT
    g.*,
    MJGraph_GraphID.[Name] AS [Graph],
    MJGraphConcept_ParentID.[Name] AS [Parent]
FROM
    [${flyway:defaultSchema}].[GraphConcept] AS g
INNER JOIN
    [${flyway:defaultSchema}].[Graph] AS MJGraph_GraphID
  ON
    [g].[GraphID] = MJGraph_GraphID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[GraphConcept] AS MJGraphConcept_ParentID
  ON
    [g].[ParentID] = MJGraphConcept_ParentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphConcepts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Concepts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concepts
-- Item: Permissions for vwGraphConcepts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphConcepts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Concepts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concepts
-- Item: spCreateGraphConcept
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphConcept
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphConcept]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphConcept];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphConcept]
    @ID uniqueidentifier = NULL,
    @GraphID uniqueidentifier,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @ConceptType nvarchar(50) = NULL,
    @Description nvarchar(MAX),
    @Specification_Clear bit = 0,
    @Specification nvarchar(MAX) = NULL,
    @Synonyms_Clear bit = 0,
    @Synonyms nvarchar(MAX) = NULL,
    @AuthorityTier nvarchar(50) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GraphConcept]
            (
                [ID],
                [GraphID],
                [ParentID],
                [Name],
                [ConceptType],
                [Description],
                [Specification],
                [Synonyms],
                [AuthorityTier],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @GraphID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                ISNULL(@ConceptType, 'Term'),
                @Description,
                CASE WHEN @Specification_Clear = 1 THEN NULL ELSE ISNULL(@Specification, NULL) END,
                CASE WHEN @Synonyms_Clear = 1 THEN NULL ELSE ISNULL(@Synonyms, NULL) END,
                ISNULL(@AuthorityTier, 'Reference'),
                ISNULL(@Status, 'Draft')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphConcept]
            (
                [GraphID],
                [ParentID],
                [Name],
                [ConceptType],
                [Description],
                [Specification],
                [Synonyms],
                [AuthorityTier],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @GraphID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                ISNULL(@ConceptType, 'Term'),
                @Description,
                CASE WHEN @Specification_Clear = 1 THEN NULL ELSE ISNULL(@Specification, NULL) END,
                CASE WHEN @Synonyms_Clear = 1 THEN NULL ELSE ISNULL(@Synonyms, NULL) END,
                ISNULL(@AuthorityTier, 'Reference'),
                ISNULL(@Status, 'Draft')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphConcepts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphConcept] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Concepts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphConcept] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Concepts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concepts
-- Item: spUpdateGraphConcept
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphConcept
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphConcept]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphConcept];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphConcept]
    @ID uniqueidentifier,
    @GraphID uniqueidentifier = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @ConceptType nvarchar(50) = NULL,
    @Description nvarchar(MAX) = NULL,
    @Specification_Clear bit = 0,
    @Specification nvarchar(MAX) = NULL,
    @Synonyms_Clear bit = 0,
    @Synonyms nvarchar(MAX) = NULL,
    @AuthorityTier nvarchar(50) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphConcept]
    SET
        [GraphID] = ISNULL(@GraphID, [GraphID]),
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Name] = ISNULL(@Name, [Name]),
        [ConceptType] = ISNULL(@ConceptType, [ConceptType]),
        [Description] = ISNULL(@Description, [Description]),
        [Specification] = CASE WHEN @Specification_Clear = 1 THEN NULL ELSE ISNULL(@Specification, [Specification]) END,
        [Synonyms] = CASE WHEN @Synonyms_Clear = 1 THEN NULL ELSE ISNULL(@Synonyms, [Synonyms]) END,
        [AuthorityTier] = ISNULL(@AuthorityTier, [AuthorityTier]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphConcepts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphConcepts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphConcept] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphConcept table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphConcept]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphConcept];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphConcept
ON [${flyway:defaultSchema}].[GraphConcept]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphConcept]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphConcept] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Concepts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphConcept] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graph Concepts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concepts
-- Item: spDeleteGraphConcept
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphConcept
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphConcept]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphConcept];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphConcept]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphConcept]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphConcept] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Concepts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphConcept] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for GraphEdge */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edges
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GraphID in table GraphEdge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdge_GraphID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdge_GraphID ON [${flyway:defaultSchema}].[GraphEdge] ([GraphID]);

-- Index for foreign key EdgeTypeID in table GraphEdge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdge_EdgeTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdge_EdgeTypeID ON [${flyway:defaultSchema}].[GraphEdge] ([EdgeTypeID]);

-- Index for foreign key SourceEntityID in table GraphEdge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdge_SourceEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdge_SourceEntityID ON [${flyway:defaultSchema}].[GraphEdge] ([SourceEntityID]);

-- Index for foreign key TargetEntityID in table GraphEdge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphEdge_TargetEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphEdge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphEdge_TargetEntityID ON [${flyway:defaultSchema}].[GraphEdge] ([TargetEntityID]);

/* SQL text to update entity field related entity name field map for entity field ID C4C73BCC-76A4-4BB7-8133-15EC06FD4395 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C4C73BCC-76A4-4BB7-8133-15EC06FD4395', @RelatedEntityNameFieldMap='Graph';

/* Index for Foreign Keys for Graph */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graphs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ: Graphs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graphs
-- Item: vwGraphs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graphs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Graph
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphs]
AS
SELECT
    g.*
FROM
    [${flyway:defaultSchema}].[Graph] AS g
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graphs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graphs
-- Item: Permissions for vwGraphs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graphs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graphs
-- Item: spCreateGraph
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Graph
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraph]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraph];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraph]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @GraphType nvarchar(50) = NULL,
    @LoadMode nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Graph]
            (
                [ID],
                [Name],
                [Description],
                [GraphType],
                [LoadMode],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@GraphType, 'Custom'),
                ISNULL(@LoadMode, 'Preload'),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Graph]
            (
                [Name],
                [Description],
                [GraphType],
                [LoadMode],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@GraphType, 'Custom'),
                ISNULL(@LoadMode, 'Preload'),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraph] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graphs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraph] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graphs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graphs
-- Item: spUpdateGraph
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Graph
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraph]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraph];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraph]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @GraphType nvarchar(50) = NULL,
    @LoadMode nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Graph]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [GraphType] = ISNULL(@GraphType, [GraphType]),
        [LoadMode] = ISNULL(@LoadMode, [LoadMode]),
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraph] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Graph table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraph]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraph];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraph
ON [${flyway:defaultSchema}].[Graph]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Graph]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Graph] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graphs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraph] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graphs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graphs
-- Item: spDeleteGraph
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Graph
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraph]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraph];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraph]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Graph]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraph] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graphs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraph] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 971FFE22-DB34-4492-814B-F7DCA29524C1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='971FFE22-DB34-4492-814B-F7DCA29524C1', @RelatedEntityNameFieldMap='EdgeType';

/* SQL text to update entity field related entity name field map for entity field ID DD9F0B61-C44A-47A4-87BD-CC1551DEFAFD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DD9F0B61-C44A-47A4-87BD-CC1551DEFAFD', @RelatedEntityNameFieldMap='SourceEntity';

/* SQL text to update entity field related entity name field map for entity field ID 531B0F00-47D8-401E-BC13-E73A67A52795 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='531B0F00-47D8-401E-BC13-E73A67A52795', @RelatedEntityNameFieldMap='TargetEntity';

/* Base View SQL for MJ: Graph Edges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edges
-- Item: vwGraphEdges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Edges
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphEdge
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphEdges]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphEdges];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphEdges]
AS
SELECT
    g.*,
    MJGraph_GraphID.[Name] AS [Graph],
    MJGraphEdgeType_EdgeTypeID.[Name] AS [EdgeType],
    MJEntity_SourceEntityID.[Name] AS [SourceEntity],
    MJEntity_TargetEntityID.[Name] AS [TargetEntity]
FROM
    [${flyway:defaultSchema}].[GraphEdge] AS g
INNER JOIN
    [${flyway:defaultSchema}].[Graph] AS MJGraph_GraphID
  ON
    [g].[GraphID] = MJGraph_GraphID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[GraphEdgeType] AS MJGraphEdgeType_EdgeTypeID
  ON
    [g].[EdgeTypeID] = MJGraphEdgeType_EdgeTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_SourceEntityID
  ON
    [g].[SourceEntityID] = MJEntity_SourceEntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_TargetEntityID
  ON
    [g].[TargetEntityID] = MJEntity_TargetEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Edges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edges
-- Item: Permissions for vwGraphEdges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphEdges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Edges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edges
-- Item: spCreateGraphEdge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphEdge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphEdge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphEdge]
    @ID uniqueidentifier = NULL,
    @GraphID uniqueidentifier,
    @EdgeTypeID uniqueidentifier,
    @SourceEntityID uniqueidentifier,
    @SourceRecordID nvarchar(400),
    @TargetEntityID uniqueidentifier,
    @TargetRecordID nvarchar(400),
    @Weight decimal(5, 4) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Attributes_Clear bit = 0,
    @Attributes nvarchar(MAX) = NULL,
    @Origin nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GraphEdge]
            (
                [ID],
                [GraphID],
                [EdgeTypeID],
                [SourceEntityID],
                [SourceRecordID],
                [TargetEntityID],
                [TargetRecordID],
                [Weight],
                [Description],
                [Attributes],
                [Origin],
                [Status],
                [Confidence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @GraphID,
                @EdgeTypeID,
                @SourceEntityID,
                @SourceRecordID,
                @TargetEntityID,
                @TargetRecordID,
                ISNULL(@Weight, 1.0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Attributes_Clear = 1 THEN NULL ELSE ISNULL(@Attributes, NULL) END,
                ISNULL(@Origin, 'Declared'),
                ISNULL(@Status, 'Approved'),
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphEdge]
            (
                [GraphID],
                [EdgeTypeID],
                [SourceEntityID],
                [SourceRecordID],
                [TargetEntityID],
                [TargetRecordID],
                [Weight],
                [Description],
                [Attributes],
                [Origin],
                [Status],
                [Confidence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @GraphID,
                @EdgeTypeID,
                @SourceEntityID,
                @SourceRecordID,
                @TargetEntityID,
                @TargetRecordID,
                ISNULL(@Weight, 1.0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Attributes_Clear = 1 THEN NULL ELSE ISNULL(@Attributes, NULL) END,
                ISNULL(@Origin, 'Declared'),
                ISNULL(@Status, 'Approved'),
                CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphEdges] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdge] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Edges */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphEdge] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Edges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edges
-- Item: spUpdateGraphEdge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphEdge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphEdge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphEdge]
    @ID uniqueidentifier,
    @GraphID uniqueidentifier = NULL,
    @EdgeTypeID uniqueidentifier = NULL,
    @SourceEntityID uniqueidentifier = NULL,
    @SourceRecordID nvarchar(400) = NULL,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID nvarchar(400) = NULL,
    @Weight decimal(5, 4) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Attributes_Clear bit = 0,
    @Attributes nvarchar(MAX) = NULL,
    @Origin nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @Confidence_Clear bit = 0,
    @Confidence decimal(5, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdge]
    SET
        [GraphID] = ISNULL(@GraphID, [GraphID]),
        [EdgeTypeID] = ISNULL(@EdgeTypeID, [EdgeTypeID]),
        [SourceEntityID] = ISNULL(@SourceEntityID, [SourceEntityID]),
        [SourceRecordID] = ISNULL(@SourceRecordID, [SourceRecordID]),
        [TargetEntityID] = ISNULL(@TargetEntityID, [TargetEntityID]),
        [TargetRecordID] = ISNULL(@TargetRecordID, [TargetRecordID]),
        [Weight] = ISNULL(@Weight, [Weight]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Attributes] = CASE WHEN @Attributes_Clear = 1 THEN NULL ELSE ISNULL(@Attributes, [Attributes]) END,
        [Origin] = ISNULL(@Origin, [Origin]),
        [Status] = ISNULL(@Status, [Status]),
        [Confidence] = CASE WHEN @Confidence_Clear = 1 THEN NULL ELSE ISNULL(@Confidence, [Confidence]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphEdges] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphEdges]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdge] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphEdge table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphEdge]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphEdge];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphEdge
ON [${flyway:defaultSchema}].[GraphEdge]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphEdge]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphEdge] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Edges */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphEdge] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graph Edges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Edges
-- Item: spDeleteGraphEdge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphEdge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphEdge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphEdge]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphEdge]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdge] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Edges */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphEdge] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 11 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08658d91-9ea0-43db-9d5f-576444934215' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'Graph')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '08658d91-9ea0-43db-9d5f-576444934215',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'Graph',
            'Graph',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '009bb3c5-676b-43ac-9d01-50108f6b1389' OR (EntityID = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND Name = 'Parent')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '009bb3c5-676b-43ac-9d01-50108f6b1389',
            'FDDD3E40-0131-4F60-A019-227D63051CDC', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC'),
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5dcf83d-714f-4c91-87df-8ce63e55daf2' OR (EntityID = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND Name = 'Graph')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f5dcf83d-714f-4c91-87df-8ce63e55daf2',
            '987A289E-5763-4735-8EE3-AE61CA5C26CB', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB'),
            'Graph',
            'Graph',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c8e589f-096b-4237-95da-bd1b7e3a4ed4' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'Graph')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5c8e589f-096b-4237-95da-bd1b7e3a4ed4',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'Graph',
            'Graph',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c9bc6597-f8d1-42d9-8202-5bb329ab3c22' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'EdgeType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c9bc6597-f8d1-42d9-8202-5bb329ab3c22',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'EdgeType',
            'Edge Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51fc8ca8-396e-4d2f-859a-faba7a0f6dcd' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'SourceEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '51fc8ca8-396e-4d2f-859a-faba7a0f6dcd',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'SourceEntity',
            'Source Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b812eb8d-1153-4f8f-a893-ca9962042151' OR (EntityID = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND Name = 'TargetEntity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b812eb8d-1153-4f8f-a893-ca9962042151',
            '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4'),
            'TargetEntity',
            'Target Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00cc6479-2587-4154-9646-020fe1152656' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Graph')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '00cc6479-2587-4154-9646-020fe1152656',
            'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', -- Entity: MJ: Content Sources
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22'),
            'Graph',
            'Graph',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ec99a13-ba90-4043-b637-b3383de88f1f' OR (EntityID = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND Name = 'Graph')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ec99a13-ba90-4043-b637-b3383de88f1f',
            '8068D8E0-6A4B-40D3-952E-DED867C8814A', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A'),
            'Graph',
            'Graph',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9be74cf9-67e5-4a9f-abb8-b35ca2657e36' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = 'EdgeType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9be74cf9-67e5-4a9f-abb8-b35ca2657e36',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            'EdgeType',
            'Edge Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '888de2f0-2cea-4a28-93ba-fa6a5b466bd4' OR (EntityID = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '888de2f0-2cea-4a28-93ba-fa6a5b466bd4',
            '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342'),
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1E1CFE3C-C3FE-4C06-8D01-FDD52A7D91E9'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '8A5A82D9-E2B1-44F4-968D-B3C4D12B30B3'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1CFECC86-5C83-451E-85A3-8B2336E3E3ED'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F2902635-D7E6-4AE3-94CB-9A1A8302C2E1'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '08658D91-9EA0-43DB-9D5F-576444934215'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '1932AC9C-278C-4756-97E5-2B50A6368F25'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph'
WHERE 
   ID = '1E8E5B79-0BE9-40C6-BDF9-B0E9C1F50B68';

-- UPDATE Entity Field Category Info MJ: Content Sources.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Name'
WHERE 
   ID = '00CC6479-2587-4154-9646-020FE1152656';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Graphs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2B343BFB-249D-486C-A867-57C0108E406B';

-- UPDATE Entity Field Category Info MJ: Graphs.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8A5A82D9-E2B1-44F4-968D-B3C4D12B30B3';

-- UPDATE Entity Field Category Info MJ: Graphs.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '27A2FE17-F973-4B4E-8EFE-0E32724524C8';

-- UPDATE Entity Field Category Info MJ: Graphs.GraphType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BA67A003-ED4F-4553-AC95-297A02398709';

-- UPDATE Entity Field Category Info MJ: Graphs.LoadMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CC5403F2-78D9-4E19-8793-FB2BDFA9C121';

-- UPDATE Entity Field Category Info MJ: Graphs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1E1CFE3C-C3FE-4C06-8D01-FDD52A7D91E9';

-- UPDATE Entity Field Category Info MJ: Graphs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9B76BA3A-A2B9-44CC-AC87-A92D26147918';

-- UPDATE Entity Field Category Info MJ: Graphs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8257E963-A41A-488C-8534-7CB4FCA05366';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4ab57ac0-4f5d-5f53-b388-5507ee25af22', '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', 'FieldCategoryInfo', '{
  "Configuration": {
    "description": "Operational settings, loading modes, and graph categorization",
    "icon": "fa fa-cogs"
  },
  "Graph Details": {
    "description": "Core identifying information and purpose of the semantic graph",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('af043832-5b26-5f37-8237-26f3abe274df', '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA', 'FieldCategoryIcons', '{
  "Configuration": "fa fa-cogs",
  "Graph Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '9DE1DB59-5D4B-4F23-ADBA-E5A521977FAA';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9BE74CF9-67E5-4A9F-ABB8-B35CA2657E36'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '888DE2F0-2CEA-4A28-93BA-FA6A5B466BD4'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Graph Concepts.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3B53B127-B8FC-4C36-A36B-5CEA55C1A57F';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '88A38981-5D2B-45C8-B9FE-A84109398933';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '153B7DBB-AD06-4DD5-B0B1-36968BE782C1';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1932AC9C-278C-4756-97E5-2B50A6368F25';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.ConceptType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '63945900-A006-47CF-8C44-5722F4C940CB';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F8544309-C27C-4B04-89D4-6C8A0C188DE9';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Specification 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Markdown'
WHERE 
   ID = 'ED6D8CBC-503E-489A-B1DE-3C229E3D003D';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Synonyms 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7770D8E4-0511-4244-8E7A-FE7814C73FBC';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.AuthorityTier 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1CFECC86-5C83-451E-85A3-8B2336E3E3ED';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F2902635-D7E6-4AE3-94CB-9A1A8302C2E1';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1ADF0971-69C8-47EF-BA62-DEA9E5A670B8';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '568F43BE-1855-471B-83C6-C07013596B26';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '08658D91-9EA0-43DB-9D5F-576444934215';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '009BB3C5-676B-43AC-9D01-50108F6B1389';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('025349f0-7782-5eb2-abf5-cb6431797762', 'FDDD3E40-0131-4F60-A019-227D63051CDC', 'FieldCategoryInfo', '{
  "Concept Definition": {
    "description": "Core identity, naming, and definition attributes of the concept",
    "icon": "fa fa-book"
  },
  "Concept Relationships": {
    "description": "Graph association and hierarchical parent-child relationships",
    "icon": "fa fa-sitemap"
  },
  "Governance and Rules": {
    "description": "Authoritative rules, specifications, authority tiers, and lifecycle statuses",
    "icon": "fa fa-shield-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ab799d2f-f448-555d-bc47-fe0fff634be7', 'FDDD3E40-0131-4F60-A019-227D63051CDC', 'FieldCategoryIcons', '{
  "Concept Definition": "fa fa-book",
  "Concept Relationships": "fa fa-sitemap",
  "Governance and Rules": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'FDDD3E40-0131-4F60-A019-227D63051CDC';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '32141BD9-63FD-425E-9CDB-2AC4A22C3767'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3064DFCC-8FFA-4DDB-B6A0-0CA7671C83E5'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F5DCF83D-714F-4C91-87DF-8CE63E55DAF2'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '987A289E-5763-4735-8EE3-AE61CA5C26CB'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D8FC2008-8D43-4540-9347-5E7F38757BE0'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '85263880-7BE7-4B49-91BC-EE9E7EF3036B'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '8068D8E0-6A4B-40D3-952E-DED867C8814A'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1EFCD4EA-2C03-478D-B3CC-DB9F1194F4F2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '48A4919A-91A9-424B-981F-95680D2AD912'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4883A949-53BB-4A14-BF07-8C00B27DD685'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '413FD549-1B28-4DF3-B731-FCDAD7A4EA20'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C9BC6597-F8D1-42D9-8202-5BB329AB3C22'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A7185CF9-A719-45CF-A215-5865726CB84C';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '490023A0-6E4C-4A32-B902-B1C25E8E7CCE';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F5DCF83D-714F-4C91-87DF-8CE63E55DAF2';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EB3B26DB-7A7D-4859-9C4A-E2072855A64F';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.InverseName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '32141BD9-63FD-425E-9CDB-2AC4A22C3767';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '25CFD6F8-EC88-40FA-BBD3-985E4562DA2B';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.IsDirected 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Weights',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B1C88250-DA54-49BA-8C8C-706480159318';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.DefaultWeight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Weights',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3064DFCC-8FFA-4DDB-B6A0-0CA7671C83E5';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.AllowStored 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Behavior and Weights',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AA81E5B2-B418-4868-9B12-BA5BB2D4FEE2';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1A33EAE3-6683-421B-9305-BF387BEFD1B8';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EE5F33DF-D91F-4678-8641-A9A11E17C1BF';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('20c6ca52-5515-5290-ab7a-ef5e7fd62511', '987A289E-5763-4735-8EE3-AE61CA5C26CB', 'FieldCategoryInfo', '{
  "Behavior and Weights": {
    "description": "Directionality, weights, and persistence configuration",
    "icon": "fa fa-sliders-h"
  },
  "Graph Definition": {
    "description": "Defines global or graph-specific scope for the edge type",
    "icon": "fa fa-sitemap"
  },
  "Relationship Properties": {
    "description": "Labels and descriptions defining the semantic relationship",
    "icon": "fa fa-font"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c49695bb-ea59-5811-9728-29c4a0d5ef18', '987A289E-5763-4735-8EE3-AE61CA5C26CB', 'FieldCategoryIcons', '{
  "Behavior and Weights": "fa fa-sliders-h",
  "Graph Definition": "fa fa-sitemap",
  "Relationship Properties": "fa fa-font",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '987A289E-5763-4735-8EE3-AE61CA5C26CB';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2609E0C9-6E2C-49ED-86FD-0DD88CA2B749';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '01B30F44-B87C-465E-87EF-594C5FBF1673';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4C7E26FC-E89D-480F-9345-75FD3E277777';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A647866B-51F7-4512-8E25-99319081C374';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Execution',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5F90DA51-DB48-4F90-A669-E262BAFDEA96';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Execution',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '3750013C-01A7-4532-8335-1970125D80FF';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Execution',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D8FC2008-8D43-4540-9347-5E7F38757BE0';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Execution',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '85263880-7BE7-4B49-91BC-EE9E7EF3036B';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4EC99A13-BA90-4043-B637-B3383DE88F1F';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '051B91E2-32FC-4A01-A571-FF0B713545B1';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '286E55C8-F1F2-4404-955D-93A10E27ED45';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('446390ed-2930-5d67-93b9-6fdc088207d0', '8068D8E0-6A4B-40D3-952E-DED867C8814A', 'FieldCategoryInfo', '{
  "Configuration and Execution": {
    "description": "Driver implementation settings, JSON configurations, and execution control",
    "icon": "fa fa-sliders-h"
  },
  "Provider Details": {
    "description": "General identification and descriptive details of the edge provider",
    "icon": "fa fa-info-circle"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('550e7c09-2270-5d61-875e-36a8782db11e', '8068D8E0-6A4B-40D3-952E-DED867C8814A', 'FieldCategoryIcons', '{
  "Configuration and Execution": "fa fa-sliders-h",
  "Provider Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '8068D8E0-6A4B-40D3-952E-DED867C8814A';

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edges.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C2759BD0-6D4F-4B04-BF48-B752CB13C179';

-- UPDATE Entity Field Category Info MJ: Graph Edges.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph'
WHERE 
   ID = 'C4C73BCC-76A4-4BB7-8133-15EC06FD4395';

-- UPDATE Entity Field Category Info MJ: Graph Edges.EdgeTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Edge Type'
WHERE 
   ID = '971FFE22-DB34-4492-814B-F7DCA29524C1';

-- UPDATE Entity Field Category Info MJ: Graph Edges.SourceEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity'
WHERE 
   ID = 'DD9F0B61-C44A-47A4-87BD-CC1551DEFAFD';

-- UPDATE Entity Field Category Info MJ: Graph Edges.SourceRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5E64435E-D5F0-4DC0-9F23-52CDFEB05392';

-- UPDATE Entity Field Category Info MJ: Graph Edges.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Entity'
WHERE 
   ID = '531B0F00-47D8-401E-BC13-E73A67A52795';

-- UPDATE Entity Field Category Info MJ: Graph Edges.TargetRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3D9B184E-D1B8-4BA9-8948-9D7BAD62DF95';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Weight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1EFCD4EA-2C03-478D-B3CC-DB9F1194F4F2';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DD04A2F5-0B9B-432E-8DEA-ED781C7F6856';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Attributes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Properties',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '0830C6D0-1269-42DC-9A83-8FF8A340EF16';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Origin 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Scoring',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '48A4919A-91A9-424B-981F-95680D2AD912';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Scoring',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4883A949-53BB-4A14-BF07-8C00B27DD685';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Scoring',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '413FD549-1B28-4DF3-B731-FCDAD7A4EA20';

-- UPDATE Entity Field Category Info MJ: Graph Edges.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '826C61C5-8ECD-4783-AAD7-E77F3B7C20C9';

-- UPDATE Entity Field Category Info MJ: Graph Edges.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '40F253D2-1FE9-4315-BBCD-ACDF28E0AEAF';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Name'
WHERE 
   ID = '5C8E589F-096B-4237-95DA-BD1B7E3A4ED4';

-- UPDATE Entity Field Category Info MJ: Graph Edges.EdgeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Edge Type Name'
WHERE 
   ID = 'C9BC6597-F8D1-42D9-8202-5BB329AB3C22';

-- UPDATE Entity Field Category Info MJ: Graph Edges.SourceEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity Name'
WHERE 
   ID = '51FC8CA8-396E-4D2F-859A-FABA7A0F6DCD';

-- UPDATE Entity Field Category Info MJ: Graph Edges.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Entity Name'
WHERE 
   ID = 'B812EB8D-1153-4F8F-A893-CA9962042151';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c92d6a2a-1b50-534b-8b63-001713a9f3bc', '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', 'FieldCategoryInfo', '{
  "Edge Properties": {
    "description": "Weights, descriptions, and metadata attributes characterizing the edge",
    "icon": "fa fa-sliders-h"
  },
  "Edge Relationships": {
    "description": "Source and target entity references linking nodes within the graph",
    "icon": "fa fa-link"
  },
  "Governance and Scoring": {
    "description": "Origin provenance, lifecycle approval status, and confidence metrics",
    "icon": "fa fa-shield-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('7db0e94a-0478-599b-968d-30b33871e6f3', '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4', 'FieldCategoryIcons', '{
  "Edge Properties": "fa fa-sliders-h",
  "Edge Relationships": "fa fa-link",
  "Governance and Scoring": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '7FC12A09-E43D-44B4-8178-BF21C9CDAEC4';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '51DF14C0-F6E9-4BE2-84BF-A851239D0CD4';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.EdgeTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '91D9FA3B-9B66-4C86-B3F3-A6AF9EA9CE80';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.Side 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8A36FE7D-721F-4463-B5C8-FCF4E98BABA1';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CE286C25-49DA-4E7A-A06A-EF5ECD48FB9D';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.EdgeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9BE74CF9-67E5-4A9F-ABB8-B35CA2657E36';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '888DE2F0-2CEA-4A28-93BA-FA6A5B466BD4';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3D4CAB6D-6514-45E9-B70F-0A7C81D8B4FB';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '09617EC9-202F-436D-8927-930A2F504136';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b369c4ce-0fc9-59fa-896a-18b0b60ac4f0', '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', 'FieldCategoryInfo', '{
  "Endpoint Configuration": {
    "description": "Configuration settings defining source and target entity constraints for graph edge types",
    "icon": "fa fa-sitemap"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('552b8985-484f-54dd-b49c-eeb0384c1970', '8B441734-9C58-43B4-A4A0-F2C0E0D0B342', 'FieldCategoryIcons', '{
  "Endpoint Configuration": "fa fa-sitemap",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '8B441734-9C58-43B4-A4A0-F2C0E0D0B342';

