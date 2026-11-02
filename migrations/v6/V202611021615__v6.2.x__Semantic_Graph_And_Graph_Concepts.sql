-- =====================================================================================
-- Semantic Graph Substrate, Generic Graph Concepts, & Content Source Graph Overlay
--
-- 1. GraphType: configurable semantic graph classifications (e.g., 'Canon',
--    'Knowledge', 'Network', 'Custom') with IsCanon flag and Rank order, seeded via
--    /metadata/graph-types.
-- 2. GraphConceptType: configurable concept classifications (e.g., 'Policy',
--    'Metric', 'Process', 'Role', 'Domain', 'Term') with Rank order, seeded via
--    /metadata/graph-concept-types.
-- 3. Graph: named semantic graph partitions referencing GraphTypeID and LoadMode
--    ('Preload', 'OnDemand').
-- 4. GraphEdgeType: global (GraphID IS NULL) or graph-scoped edge types with
--    directionality, inverse label, default retrieval weight, and AllowStored flag.
-- 5. GraphEdgeTypeEndpoint: optional endpoint entity constraints per edge type.
-- 6. GraphEdgeProvider: pluggable derived-edge providers enabled per graph.
-- 7. GraphEdge: polymorphic stored edges (Declared or Inferred, Proposed/Approved/Rejected)
--    connecting any (SourceEntityID, SourceRecordID) to (TargetEntityID, TargetRecordID).
-- 8. GraphConcept: generalized higher-level concept node scoped to a GraphID and
--    referencing ConceptTypeID, with Specification, AuthorityTier, ParentID, and Status.
-- 9. ContentSource.GraphID: optional foreign key linking a Content Source to a target
--    Graph (supporting single-source or multi-source shared Knowledge/Canon graphs).
--
-- Conventions (migrations/CLAUDE.md & guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md):
--   - Plain DDL + sp_addextendedproperty only (no existence guards).
--   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted;
--     CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. GraphType
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphType] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphType_ID] DEFAULT (newsequentialid()),
    [Name]        NVARCHAR(100)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [IsCanon]     BIT              NOT NULL CONSTRAINT [DF_GraphType_IsCanon] DEFAULT (0),
    [Rank]        INT              NOT NULL CONSTRAINT [DF_GraphType_Rank] DEFAULT (100),
    [IconClass]   NVARCHAR(100)    NULL,
    [Status]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_GraphType_Status] DEFAULT (N'Active'),
    CONSTRAINT [PK_GraphType] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_GraphType_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_GraphType_Status] CHECK ([Status] IN (N'Active', N'Inactive'))
);
GO

-- -------------------------------------------------------------------------------------
-- 2. GraphConceptType
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphConceptType] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphConceptType_ID] DEFAULT (newsequentialid()),
    [Name]        NVARCHAR(100)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [Rank]        INT              NOT NULL CONSTRAINT [DF_GraphConceptType_Rank] DEFAULT (100),
    [IconClass]   NVARCHAR(100)    NULL,
    [Status]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_GraphConceptType_Status] DEFAULT (N'Active'),
    CONSTRAINT [PK_GraphConceptType] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_GraphConceptType_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_GraphConceptType_Status] CHECK ([Status] IN (N'Active', N'Inactive'))
);
GO

-- -------------------------------------------------------------------------------------
-- 3. Graph
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[Graph] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_Graph_ID] DEFAULT (newsequentialid()),
    [Name]        NVARCHAR(255)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [GraphTypeID] UNIQUEIDENTIFIER NOT NULL,
    [LoadMode]    NVARCHAR(20)     NOT NULL CONSTRAINT [DF_Graph_LoadMode] DEFAULT (N'Preload'),
    [Status]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_Graph_Status] DEFAULT (N'Active'),
    CONSTRAINT [PK_Graph] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_Graph_GraphType] FOREIGN KEY ([GraphTypeID])
        REFERENCES [${flyway:defaultSchema}].[GraphType]([ID]),
    CONSTRAINT [UQ_Graph_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_Graph_LoadMode] CHECK ([LoadMode] IN (N'Preload', N'OnDemand')),
    CONSTRAINT [CK_Graph_Status] CHECK ([Status] IN (N'Active', N'Disabled'))
);
GO

-- -------------------------------------------------------------------------------------
-- 4. GraphEdgeType
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
-- 5. GraphEdgeTypeEndpoint
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
-- 6. GraphEdgeProvider
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
-- 7. GraphEdge
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
-- 8. GraphConcept
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphConcept] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphConcept_ID] DEFAULT (newsequentialid()),
    [GraphID]       UNIQUEIDENTIFIER NOT NULL,
    [ParentID]      UNIQUEIDENTIFIER NULL,
    [Name]          NVARCHAR(255)    NOT NULL,
    [ConceptTypeID] UNIQUEIDENTIFIER NOT NULL,
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
    CONSTRAINT [FK_GraphConcept_GraphConceptType] FOREIGN KEY ([ConceptTypeID])
        REFERENCES [${flyway:defaultSchema}].[GraphConceptType]([ID]),
    CONSTRAINT [UQ_GraphConcept_GraphID_Name] UNIQUE ([GraphID], [Name]),
    CONSTRAINT [CK_GraphConcept_NoSelfParent] CHECK ([ParentID] <> [ID]),
    CONSTRAINT [CK_GraphConcept_AuthorityTier] CHECK ([AuthorityTier] IN (N'Bylaws', N'BoardPolicy', N'ExecutiveSOP', N'DepartmentPractice', N'Reference', N'Inferred')),
    CONSTRAINT [CK_GraphConcept_Status] CHECK ([Status] IN (N'Draft', N'Proposed', N'Approved', N'Deprecated'))
);
GO

-- -------------------------------------------------------------------------------------
-- 9. ContentSource.GraphID
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]
    ADD [GraphID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_ContentSource_Graph] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID])
        ON DELETE SET NULL;
GO

-- -------------------------------------------------------------------------------------
-- 10. Extended properties (Table & Column descriptions)
-- -------------------------------------------------------------------------------------

-- GraphType
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Configurable semantic graph classifications (such as Canon, Knowledge, Network, or Custom), defining whether graphs of this type participate in governed organizational Canon (IsCanon) and their precedence rank.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphType';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique display name of the graph type (e.g., Canon, Knowledge, Network, Custom).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Plain-language description of what graphs of this type represent and how agents should use them.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, graphs of this type feed governed institutional Canon (authoritative definitions, policies, metrics, and workflows); when 0, the graph is non-canonical (such as exploratory Knowledge or Network graphs).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphType',
    @level2type = N'COLUMN', @level2name = N'IsCanon';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Sort and priority rank order of the graph type (lower numbers have higher priority).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphType',
    @level2type = N'COLUMN', @level2name = N'Rank';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional Font Awesome CSS icon class used to render badges for graphs of this type in the UI.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphType',
    @level2type = N'COLUMN', @level2name = N'IconClass';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Operational status of the graph type (Active or Inactive).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphType',
    @level2type = N'COLUMN', @level2name = N'Status';

-- GraphConceptType
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Configurable semantic concept classifications (such as Policy, Metric, Process, Role, Domain, or Term) with rank ordering and synthesis guidance, seeded via metadata and extensible per organization.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique name of the concept type (e.g., Policy, Metric, Process, Role, Domain, Term).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Plain-language definition and LLM extraction guidance describing what qualifies as a concept of this type.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Precedence and display rank order of this concept type (lower numbers represent higher-order institutional concepts such as Policy and Metric ahead of granular Terms).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType',
    @level2type = N'COLUMN', @level2name = N'Rank';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional Font Awesome CSS icon class used to render concept nodes of this type in graph explorers and cards.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType',
    @level2type = N'COLUMN', @level2name = N'IconClass';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Operational status of the concept type (Active or Inactive).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType',
    @level2type = N'COLUMN', @level2name = N'Status';

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
    @value = N'Foreign key to GraphType defining the semantic classification of this graph and whether it feeds institutional Canon.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Graph',
    @level2type = N'COLUMN', @level2name = N'GraphTypeID';

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
    @value = N'Higher-level semantic concept nodes scoped to a Graph (referencing GraphConceptType such as Policy, Metric, Process, Role, Domain, or Term), serving as organizing hubs for Canon governance and Content Source GraphRAG overlays.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Canonical name of the concept, unique within its owning GraphID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Foreign key to GraphConceptType classifying the structural role and priority rank of this concept.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'ConceptTypeID';

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

/* SQL generated to create new entity MJ: Graph Concept Types */

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
         '2a8edba7-8ba8-4da7-8f6e-915585c197bd',
         'MJ: Graph Concept Types',
         'Graph Concept Types',
         'Configurable semantic concept classifications (such as Policy, Metric, Process, Role, Domain, or Term) with rank ordering and synthesis guidance, seeded via metadata and extensible per organization.',
         NULL,
         'GraphConceptType',
         'vwGraphConceptTypes',
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

/* SQL generated to add entity MJ: Graph Concept Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2a8edba7-8ba8-4da7-8f6e-915585c197bd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Concept Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2a8edba7-8ba8-4da7-8f6e-915585c197bd' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2a8edba7-8ba8-4da7-8f6e-915585c197bd' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concept Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2a8edba7-8ba8-4da7-8f6e-915585c197bd' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2a8edba7-8ba8-4da7-8f6e-915585c197bd' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concept Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2a8edba7-8ba8-4da7-8f6e-915585c197bd' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2a8edba7-8ba8-4da7-8f6e-915585c197bd' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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
         '6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graphs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graphs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graphs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('6f9d2a33-7a64-4cee-b9d3-52b3cc58e9ea' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '4a8d91d6-0933-4cac-966a-95c69f5228ba',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4a8d91d6-0933-4cac-966a-95c69f5228ba', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4a8d91d6-0933-4cac-966a-95c69f5228ba' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4a8d91d6-0933-4cac-966a-95c69f5228ba' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4a8d91d6-0933-4cac-966a-95c69f5228ba' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4a8d91d6-0933-4cac-966a-95c69f5228ba' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4a8d91d6-0933-4cac-966a-95c69f5228ba' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4a8d91d6-0933-4cac-966a-95c69f5228ba' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'd74e798f-d63f-479a-bc2b-c629b252fe60',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd74e798f-d63f-479a-bc2b-c629b252fe60', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d74e798f-d63f-479a-bc2b-c629b252fe60' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d74e798f-d63f-479a-bc2b-c629b252fe60' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d74e798f-d63f-479a-bc2b-c629b252fe60' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d74e798f-d63f-479a-bc2b-c629b252fe60' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d74e798f-d63f-479a-bc2b-c629b252fe60' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d74e798f-d63f-479a-bc2b-c629b252fe60' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '234a4d46-27b8-4011-b3f3-8b862d77073c',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '234a4d46-27b8-4011-b3f3-8b862d77073c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('234a4d46-27b8-4011-b3f3-8b862d77073c' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('234a4d46-27b8-4011-b3f3-8b862d77073c' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('234a4d46-27b8-4011-b3f3-8b862d77073c' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('234a4d46-27b8-4011-b3f3-8b862d77073c' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('234a4d46-27b8-4011-b3f3-8b862d77073c' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('234a4d46-27b8-4011-b3f3-8b862d77073c' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '52acc265-e651-4cd9-8c96-088b6263cc2b',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '52acc265-e651-4cd9-8c96-088b6263cc2b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edges for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('52acc265-e651-4cd9-8c96-088b6263cc2b' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('52acc265-e651-4cd9-8c96-088b6263cc2b' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edges for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('52acc265-e651-4cd9-8c96-088b6263cc2b' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('52acc265-e651-4cd9-8c96-088b6263cc2b' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edges for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('52acc265-e651-4cd9-8c96-088b6263cc2b' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('52acc265-e651-4cd9-8c96-088b6263cc2b' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '2c3071c8-ec27-41c4-a4c7-e64f50ba1b99',
         'MJ: Graph Concepts',
         'Graph Concepts',
         'Higher-level semantic concept nodes scoped to a Graph (referencing GraphConceptType such as Policy, Metric, Process, Role, Domain, or Term), serving as organizing hubs for Canon governance and Content Source GraphRAG overlays.',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2c3071c8-ec27-41c4-a4c7-e64f50ba1b99', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Concepts for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2c3071c8-ec27-41c4-a4c7-e64f50ba1b99' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2c3071c8-ec27-41c4-a4c7-e64f50ba1b99' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concepts for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2c3071c8-ec27-41c4-a4c7-e64f50ba1b99' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2c3071c8-ec27-41c4-a4c7-e64f50ba1b99' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concepts for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2c3071c8-ec27-41c4-a4c7-e64f50ba1b99' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2c3071c8-ec27-41c4-a4c7-e64f50ba1b99' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Graph Types */

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
         '037fd55f-0f21-4584-8f86-90c2e45fc671',
         'MJ: Graph Types',
         'Graph Types',
         'Configurable semantic graph classifications (such as Canon, Knowledge, Network, or Custom), defining whether graphs of this type participate in governed organizational Canon (IsCanon) and their precedence rank.',
         NULL,
         'GraphType',
         'vwGraphTypes',
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

/* SQL generated to add entity MJ: Graph Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '037fd55f-0f21-4584-8f86-90c2e45fc671', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('037fd55f-0f21-4584-8f86-90c2e45fc671' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('037fd55f-0f21-4584-8f86-90c2e45fc671' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('037fd55f-0f21-4584-8f86-90c2e45fc671' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('037fd55f-0f21-4584-8f86-90c2e45fc671' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('037fd55f-0f21-4584-8f86-90c2e45fc671' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('037fd55f-0f21-4584-8f86-90c2e45fc671' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphType */
ALTER TABLE [${flyway:defaultSchema}].[GraphType] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphType */
UPDATE [${flyway:defaultSchema}].[GraphType] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphType */
ALTER TABLE [${flyway:defaultSchema}].[GraphType] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphType */
ALTER TABLE [${flyway:defaultSchema}].[GraphType] ADD CONSTRAINT [DF___mj_GraphType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphType */
ALTER TABLE [${flyway:defaultSchema}].[GraphType] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphType */
UPDATE [${flyway:defaultSchema}].[GraphType] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphType */
ALTER TABLE [${flyway:defaultSchema}].[GraphType] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphType */
ALTER TABLE [${flyway:defaultSchema}].[GraphType] ADD CONSTRAINT [DF___mj_GraphType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
ALTER TABLE [${flyway:defaultSchema}].[GraphConceptType] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
UPDATE [${flyway:defaultSchema}].[GraphConceptType] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
ALTER TABLE [${flyway:defaultSchema}].[GraphConceptType] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
ALTER TABLE [${flyway:defaultSchema}].[GraphConceptType] ADD CONSTRAINT [DF___mj_GraphConceptType___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
ALTER TABLE [${flyway:defaultSchema}].[GraphConceptType] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
UPDATE [${flyway:defaultSchema}].[GraphConceptType] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
ALTER TABLE [${flyway:defaultSchema}].[GraphConceptType] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphConceptType */
ALTER TABLE [${flyway:defaultSchema}].[GraphConceptType] ADD CONSTRAINT [DF___mj_GraphConceptType___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
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

/* SQL text to insert 80 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '582c33c6-c6c1-4fe3-9104-f4a042a6b769' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'ID')) BEGIN
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
            '582c33c6-c6c1-4fe3-9104-f4a042a6b769',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5a451c92-4937-486b-a99a-86ec356c99b9' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'GraphID')) BEGIN
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
            '5a451c92-4937-486b-a99a-86ec356c99b9',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3e67fdf9-8943-4d0a-ae2c-1afbf5beb404' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'EdgeTypeID')) BEGIN
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
            '3e67fdf9-8943-4d0a-ae2c-1afbf5beb404',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7fc72692-952b-4cb4-b964-ec675f74c593' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'SourceEntityID')) BEGIN
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
            '7fc72692-952b-4cb4-b964-ec675f74c593',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5817617b-f538-4486-964f-d9a62f133da9' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'SourceRecordID')) BEGIN
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
            '5817617b-f538-4486-964f-d9a62f133da9',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6959eb2c-729b-4828-9722-222a893300de' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'TargetEntityID')) BEGIN
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
            '6959eb2c-729b-4828-9722-222a893300de',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89db171e-292c-4e1d-aea4-89d4f0ab5801' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'TargetRecordID')) BEGIN
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
            '89db171e-292c-4e1d-aea4-89d4f0ab5801',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2e9a60e9-694c-418f-95cb-9d4fddf44334' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'Weight')) BEGIN
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
            '2e9a60e9-694c-418f-95cb-9d4fddf44334',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36c6bf28-c912-4344-86aa-f56854dc7d1f' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'Description')) BEGIN
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
            '36c6bf28-c912-4344-86aa-f56854dc7d1f',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9fe71313-94d8-43cc-b72b-2d9c289a4195' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'Attributes')) BEGIN
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
            '9fe71313-94d8-43cc-b72b-2d9c289a4195',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f4878649-5999-4cc7-b195-fc17b88667a3' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'Origin')) BEGIN
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
            'f4878649-5999-4cc7-b195-fc17b88667a3',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '214b6e6f-3e16-4f55-b9a4-5e4a78a77a1b' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'Status')) BEGIN
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
            '214b6e6f-3e16-4f55-b9a4-5e4a78a77a1b',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '030c1bde-f141-4107-ab0c-1c29be2bc5ab' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'Confidence')) BEGIN
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
            '030c1bde-f141-4107-ab0c-1c29be2bc5ab',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d4fb832-c5ca-426b-9576-cf89c0ba2ab7' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = '__mj_CreatedAt')) BEGIN
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
            '6d4fb832-c5ca-426b-9576-cf89c0ba2ab7',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'da4021c1-1495-4707-9777-dd6a634396b3' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'da4021c1-1495-4707-9777-dd6a634396b3',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'def208fa-d4cf-4e48-a3f1-b403fc1f8a57' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = 'ID')) BEGIN
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
            'def208fa-d4cf-4e48-a3f1-b403fc1f8a57',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fa41b09-f360-47ea-aaf8-715b76cc81fc' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = 'Name')) BEGIN
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
            '5fa41b09-f360-47ea-aaf8-715b76cc81fc',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed4e169d-1c52-4d3b-97be-842e2a2b0a53' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = 'Description')) BEGIN
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
            'ed4e169d-1c52-4d3b-97be-842e2a2b0a53',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '025c4b99-dd64-4935-b134-463b03577cd1' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = 'GraphTypeID')) BEGIN
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
            '025c4b99-dd64-4935-b134-463b03577cd1',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
            'GraphTypeID',
            'Graph Type ID',
            'Foreign key to GraphType defining the semantic classification of this graph and whether it feeds institutional Canon.',
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
            '037FD55F-0F21-4584-8F86-90C2E45FC671',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '124810dc-8beb-4ede-8ba3-d9421781e145' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = 'LoadMode')) BEGIN
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
            '124810dc-8beb-4ede-8ba3-d9421781e145',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a339b589-1899-478c-8b29-7dfc6685931a' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = 'Status')) BEGIN
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
            'a339b589-1899-478c-8b29-7dfc6685931a',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fac9102e-33c3-4276-94ee-5e27956039b5' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = '__mj_CreatedAt')) BEGIN
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
            'fac9102e-33c3-4276-94ee-5e27956039b5',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '69c52773-8871-4990-bd54-f5d685bb4175' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '69c52773-8871-4990-bd54-f5d685bb4175',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee599e24-5e75-43c9-be96-1518ac266c35' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'ID')) BEGIN
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
            'ee599e24-5e75-43c9-be96-1518ac266c35',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a1cf78b-e858-4773-9e07-6b9b9b78a27a' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'GraphID')) BEGIN
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
            '0a1cf78b-e858-4773-9e07-6b9b9b78a27a',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '664125d1-6eb7-4afc-b73b-3b6d5eb7e9b7' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'Name')) BEGIN
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
            '664125d1-6eb7-4afc-b73b-3b6d5eb7e9b7',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '42664051-b612-4a2d-b82b-5e50850fdd4a' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'Description')) BEGIN
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
            '42664051-b612-4a2d-b82b-5e50850fdd4a',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35e93800-9085-4636-b16d-3017a117f300' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'DriverClass')) BEGIN
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
            '35e93800-9085-4636-b16d-3017a117f300',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ea46c851-185b-48cb-9c30-242250eb4b08' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'Configuration')) BEGIN
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
            'ea46c851-185b-48cb-9c30-242250eb4b08',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '36cd6ce2-3598-4652-8587-aca7f51c9cd4' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'Sequence')) BEGIN
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
            '36cd6ce2-3598-4652-8587-aca7f51c9cd4',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fd60774-47da-44dd-be9d-6d8d0cd3bcd3' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'IsActive')) BEGIN
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
            '2fd60774-47da-44dd-be9d-6d8d0cd3bcd3',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2bacbf2a-4c4c-4c37-aed6-0850391f875c' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2bacbf2a-4c4c-4c37-aed6-0850391f875c',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c81340c-8f85-4c53-b973-47b393842b1b' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0c81340c-8f85-4c53-b973-47b393842b1b',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0cda78d2-75bd-4ae3-b94a-4a585fdbc347' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = 'ID')) BEGIN
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
            '0cda78d2-75bd-4ae3-b94a-4a585fdbc347',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e89a1147-4b30-4947-92bc-1094b59f28ac' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = 'Name')) BEGIN
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
            'e89a1147-4b30-4947-92bc-1094b59f28ac',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
            'Name',
            'Name',
            'Unique display name of the graph type (e.g., Canon, Knowledge, Network, Custom).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7c33a26-dfec-4c27-a503-8ddf050457b3' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = 'Description')) BEGIN
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
            'e7c33a26-dfec-4c27-a503-8ddf050457b3',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
            'Description',
            'Description',
            'Plain-language description of what graphs of this type represent and how agents should use them.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '81c1a0ed-6563-4dc8-8564-eedc8b097120' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = 'IsCanon')) BEGIN
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
            '81c1a0ed-6563-4dc8-8564-eedc8b097120',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
            'IsCanon',
            'Is Canon',
            'When 1, graphs of this type feed governed institutional Canon (authoritative definitions, policies, metrics, and workflows); when 0, the graph is non-canonical (such as exploratory Knowledge or Network graphs).',
            'bit',
            1,
            1,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '96838cad-b3ee-42be-a8d5-d2b2b18cee15' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = 'Rank')) BEGIN
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
            '96838cad-b3ee-42be-a8d5-d2b2b18cee15',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
            'Rank',
            'Rank',
            'Sort and priority rank order of the graph type (lower numbers have higher priority).',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'de62f801-9a1e-4b1f-b382-b93ffd8dc144' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = 'IconClass')) BEGIN
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
            'de62f801-9a1e-4b1f-b382-b93ffd8dc144',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
            'IconClass',
            'Icon Class',
            'Optional Font Awesome CSS icon class used to render badges for graphs of this type in the UI.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c7fa5dac-4eb3-4f1b-a840-c4b40a781ae4' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = 'Status')) BEGIN
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
            'c7fa5dac-4eb3-4f1b-a840-c4b40a781ae4',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
            'Status',
            'Status',
            'Operational status of the graph type (Active or Inactive).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33c5a5ac-4140-44b0-b0eb-293f57d01806' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = '__mj_CreatedAt')) BEGIN
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
            '33c5a5ac-4140-44b0-b0eb-293f57d01806',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4faccae0-29d6-4e2e-a928-77066cd3046d' OR (EntityID = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '4faccae0-29d6-4e2e-a928-77066cd3046d',
            '037FD55F-0F21-4584-8F86-90C2E45FC671', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f686dd28-8d73-498c-8722-a380d1d11b1e' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = 'ID')) BEGIN
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
            'f686dd28-8d73-498c-8722-a380d1d11b1e',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ab2108b3-9f48-45cd-ba01-284e2f022781' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = 'Name')) BEGIN
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
            'ab2108b3-9f48-45cd-ba01-284e2f022781',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
            'Name',
            'Name',
            'Unique name of the concept type (e.g., Policy, Metric, Process, Role, Domain, Term).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a1e68bd-fa0a-4e1a-8b56-d5cacddde466' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = 'Description')) BEGIN
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
            '7a1e68bd-fa0a-4e1a-8b56-d5cacddde466',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
            'Description',
            'Description',
            'Plain-language definition and LLM extraction guidance describing what qualifies as a concept of this type.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22385146-7d25-447d-b63f-d32fd4c28059' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = 'Rank')) BEGIN
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
            '22385146-7d25-447d-b63f-d32fd4c28059',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
            'Rank',
            'Rank',
            'Precedence and display rank order of this concept type (lower numbers represent higher-order institutional concepts such as Policy and Metric ahead of granular Terms).',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68b47cef-6010-4372-be71-47d6066daf9d' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = 'IconClass')) BEGIN
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
            '68b47cef-6010-4372-be71-47d6066daf9d',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
            'IconClass',
            'Icon Class',
            'Optional Font Awesome CSS icon class used to render concept nodes of this type in graph explorers and cards.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fec2e91-754c-40b5-91dd-917447714548' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = 'Status')) BEGIN
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
            '1fec2e91-754c-40b5-91dd-917447714548',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
            'Status',
            'Status',
            'Operational status of the concept type (Active or Inactive).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e3cca960-1f9d-4124-b670-07836c77bffe' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e3cca960-1f9d-4124-b670-07836c77bffe',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c46305b4-9536-4d08-b706-9f01adea4243' OR (EntityID = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'c46305b4-9536-4d08-b706-9f01adea4243',
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0200db32-1b57-4bcf-8d2c-a1f80bdcf843' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'ID')) BEGIN
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
            '0200db32-1b57-4bcf-8d2c-a1f80bdcf843',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a185ae28-27d9-4d81-95a9-eb66493e9198' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'GraphID')) BEGIN
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
            'a185ae28-27d9-4d81-95a9-eb66493e9198',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a05ddd69-e6d9-4121-856c-a0b9eaedc882' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'Name')) BEGIN
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
            'a05ddd69-e6d9-4121-856c-a0b9eaedc882',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '799b5f84-5186-4ee0-b810-b92fbe5781f6' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'Description')) BEGIN
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
            '799b5f84-5186-4ee0-b810-b92fbe5781f6',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '679f79db-e2e6-40b2-a830-d92e52928a68' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'IsDirected')) BEGIN
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
            '679f79db-e2e6-40b2-a830-d92e52928a68',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fb8aaa3d-685b-4347-985d-ef4a3c66f8b7' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'InverseName')) BEGIN
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
            'fb8aaa3d-685b-4347-985d-ef4a3c66f8b7',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c540096a-437c-4202-b7c9-e13b6a233f1f' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'DefaultWeight')) BEGIN
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
            'c540096a-437c-4202-b7c9-e13b6a233f1f',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a44e9352-951b-4719-9e19-38cc3744ea0a' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'AllowStored')) BEGIN
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
            'a44e9352-951b-4719-9e19-38cc3744ea0a',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '607f0f42-b7d5-439a-9bfb-d9893ca5d363' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = '__mj_CreatedAt')) BEGIN
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
            '607f0f42-b7d5-439a-9bfb-d9893ca5d363',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ec98d00-2621-4d02-9b71-d8d7b41f99e7' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0ec98d00-2621-4d02-9b71-d8d7b41f99e7',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '89139890-8f7b-4d8d-a77d-1643f617b6d5' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'GraphID')) BEGIN
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
            '89139890-8f7b-4d8d-a77d-1643f617b6d5',
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
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75645c36-084d-405b-9015-b6f0389341c5' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Graph')) BEGIN
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
            '75645c36-084d-405b-9015-b6f0389341c5',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c273aff5-6bc3-49c0-8027-00f4c6d9efcf' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = 'ID')) BEGIN
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
            'c273aff5-6bc3-49c0-8027-00f4c6d9efcf',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '606dfb4b-6789-4adf-9e64-24668092d9db' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = 'EdgeTypeID')) BEGIN
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
            '606dfb4b-6789-4adf-9e64-24668092d9db',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5957a809-6c5a-42d2-a500-6d06cda9e4e3' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = 'Side')) BEGIN
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
            '5957a809-6c5a-42d2-a500-6d06cda9e4e3',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '73d2c416-437e-4fdc-8abc-ccd200023753' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = 'EntityID')) BEGIN
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
            '73d2c416-437e-4fdc-8abc-ccd200023753',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b75aaf6d-b753-4379-b41c-5b09b68a998c' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = '__mj_CreatedAt')) BEGIN
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
            'b75aaf6d-b753-4379-b41c-5b09b68a998c',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cdfa1c03-c365-4dbb-b051-e58f09d32975' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'cdfa1c03-c365-4dbb-b051-e58f09d32975',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '494179a9-693e-48ed-a4f5-de092bf848f9' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'ID')) BEGIN
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
            '494179a9-693e-48ed-a4f5-de092bf848f9',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c493f15-ad4b-4123-a1f5-7cedb0b72be7' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'GraphID')) BEGIN
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
            '2c493f15-ad4b-4123-a1f5-7cedb0b72be7',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '60681b95-ff7a-4c95-b09b-e919ddfed6b4' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'ParentID')) BEGIN
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
            '60681b95-ff7a-4c95-b09b-e919ddfed6b4',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '684bf023-df26-40f3-ac2a-6455fe606db9' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'Name')) BEGIN
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
            '684bf023-df26-40f3-ac2a-6455fe606db9',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '095762fb-adc5-48d7-9d74-523ce01e0cc9' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'ConceptTypeID')) BEGIN
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
            '095762fb-adc5-48d7-9d74-523ce01e0cc9',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
            'ConceptTypeID',
            'Concept Type ID',
            'Foreign key to GraphConceptType classifying the structural role and priority rank of this concept.',
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
            '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af541026-7247-41dd-952b-3bc4769eb459' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'Description')) BEGIN
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
            'af541026-7247-41dd-952b-3bc4769eb459',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8301a585-cf27-493e-b5e9-0ad3df585488' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'Specification')) BEGIN
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
            '8301a585-cf27-493e-b5e9-0ad3df585488',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ac32b20-f7ac-4865-a8c3-f95e74f47da2' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'Synonyms')) BEGIN
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
            '7ac32b20-f7ac-4865-a8c3-f95e74f47da2',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c240ea1-0ac2-41bf-ae25-07c667c32318' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'AuthorityTier')) BEGIN
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
            '4c240ea1-0ac2-41bf-ae25-07c667c32318',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01d914e7-bef0-4f12-8fef-1d4c93cacb97' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'Status')) BEGIN
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
            '01d914e7-bef0-4f12-8fef-1d4c93cacb97',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68fc9db9-58bc-4abd-9674-85844a8ebdcb' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = '__mj_CreatedAt')) BEGIN
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
            '68fc9db9-58bc-4abd-9674-85844a8ebdcb',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5b31597e-d660-4a6a-b257-2e74c298cfd5' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5b31597e-d660-4a6a-b257-2e74c298cfd5',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

/* SQL text to insert entity field value with ID 5a2c553e-ba7b-4d26-b5e6-3ee1ce134491 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5a2c553e-ba7b-4d26-b5e6-3ee1ce134491', 'C7FA5DAC-4EB3-4F1B-A840-C4B40A781AE4', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 57bef8d9-a15e-4589-89a8-e524901081b9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('57bef8d9-a15e-4589-89a8-e524901081b9', 'C7FA5DAC-4EB3-4F1B-A840-C4B40A781AE4', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C7FA5DAC-4EB3-4F1B-A840-C4B40A781AE4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C7FA5DAC-4EB3-4F1B-A840-C4B40A781AE4';

/* SQL text to insert entity field value with ID 6d5c3bc4-2ce2-4127-9eda-eb90327c93f2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6d5c3bc4-2ce2-4127-9eda-eb90327c93f2', '1FEC2E91-754C-40B5-91DD-917447714548', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6d875e01-96de-44eb-978e-59d24a66ea92 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6d875e01-96de-44eb-978e-59d24a66ea92', '1FEC2E91-754C-40B5-91DD-917447714548', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1FEC2E91-754C-40B5-91DD-917447714548 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1FEC2E91-754C-40B5-91DD-917447714548';

/* SQL text to insert entity field value with ID ff5c3b79-bb24-4f5e-9beb-7395ab4dd5e1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ff5c3b79-bb24-4f5e-9beb-7395ab4dd5e1', '124810DC-8BEB-4EDE-8BA3-D9421781E145', 1, 'OnDemand', 'OnDemand', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6aa8f2de-0737-4a0d-9b55-d4b2f889bc76 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6aa8f2de-0737-4a0d-9b55-d4b2f889bc76', '124810DC-8BEB-4EDE-8BA3-D9421781E145', 2, 'Preload', 'Preload', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 124810DC-8BEB-4EDE-8BA3-D9421781E145 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='124810DC-8BEB-4EDE-8BA3-D9421781E145';

/* SQL text to insert entity field value with ID ed836598-f57a-4fd1-9a2c-d83bab88c1e5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ed836598-f57a-4fd1-9a2c-d83bab88c1e5', 'A339B589-1899-478C-8B29-7DFC6685931A', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 15a1594d-7b83-48a2-bad6-f89318c3e6b3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('15a1594d-7b83-48a2-bad6-f89318c3e6b3', 'A339B589-1899-478C-8B29-7DFC6685931A', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A339B589-1899-478C-8B29-7DFC6685931A */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A339B589-1899-478C-8B29-7DFC6685931A';

/* SQL text to insert entity field value with ID 9f413b38-2335-4f72-9f46-6497312832be */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9f413b38-2335-4f72-9f46-6497312832be', '5957A809-6C5A-42D2-A500-6D06CDA9E4E3', 1, 'Source', 'Source', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID feed4c0b-e83a-436b-9b82-176d464a7c43 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('feed4c0b-e83a-436b-9b82-176d464a7c43', '5957A809-6C5A-42D2-A500-6D06CDA9E4E3', 2, 'Target', 'Target', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5957A809-6C5A-42D2-A500-6D06CDA9E4E3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5957A809-6C5A-42D2-A500-6D06CDA9E4E3';

/* SQL text to insert entity field value with ID e140ac60-8436-4b73-a7c9-69c15c7c0b52 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e140ac60-8436-4b73-a7c9-69c15c7c0b52', 'F4878649-5999-4CC7-B195-FC17B88667A3', 1, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 171dd2ae-8b02-4f52-a3ef-8bfffdb4cf59 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('171dd2ae-8b02-4f52-a3ef-8bfffdb4cf59', 'F4878649-5999-4CC7-B195-FC17B88667A3', 2, 'Inferred', 'Inferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F4878649-5999-4CC7-B195-FC17B88667A3 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F4878649-5999-4CC7-B195-FC17B88667A3';

/* SQL text to insert entity field value with ID 0211b055-4418-4bf8-a940-b782340f51f0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0211b055-4418-4bf8-a940-b782340f51f0', '214B6E6F-3E16-4F55-B9A4-5E4A78A77A1B', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 079dc61e-923c-492c-8d45-d517a3a7c9de */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('079dc61e-923c-492c-8d45-d517a3a7c9de', '214B6E6F-3E16-4F55-B9A4-5E4A78A77A1B', 2, 'Proposed', 'Proposed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ccd8aa86-a16a-4946-acea-22381c079c6f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ccd8aa86-a16a-4946-acea-22381c079c6f', '214B6E6F-3E16-4F55-B9A4-5E4A78A77A1B', 3, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 214B6E6F-3E16-4F55-B9A4-5E4A78A77A1B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='214B6E6F-3E16-4F55-B9A4-5E4A78A77A1B';

/* SQL text to insert entity field value with ID 4628b947-5031-4e84-bc5b-80be40ff7d50 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4628b947-5031-4e84-bc5b-80be40ff7d50', '4C240EA1-0AC2-41BF-AE25-07C667C32318', 1, 'BoardPolicy', 'BoardPolicy', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 407e6127-4d84-41c9-a21a-d8f6ad0b4b68 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('407e6127-4d84-41c9-a21a-d8f6ad0b4b68', '4C240EA1-0AC2-41BF-AE25-07C667C32318', 2, 'Bylaws', 'Bylaws', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3ffb16bd-6bcf-4cb3-832f-fda07465d09d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3ffb16bd-6bcf-4cb3-832f-fda07465d09d', '4C240EA1-0AC2-41BF-AE25-07C667C32318', 3, 'DepartmentPractice', 'DepartmentPractice', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 0244b22e-ebb3-4a41-8a21-66bb04ab9b1a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0244b22e-ebb3-4a41-8a21-66bb04ab9b1a', '4C240EA1-0AC2-41BF-AE25-07C667C32318', 4, 'ExecutiveSOP', 'ExecutiveSOP', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 53aaa853-733b-49d1-9138-b5355a480e48 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('53aaa853-733b-49d1-9138-b5355a480e48', '4C240EA1-0AC2-41BF-AE25-07C667C32318', 5, 'Inferred', 'Inferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 68c20bae-dd31-4373-83ce-9fa3d3897a76 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('68c20bae-dd31-4373-83ce-9fa3d3897a76', '4C240EA1-0AC2-41BF-AE25-07C667C32318', 6, 'Reference', 'Reference', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 4C240EA1-0AC2-41BF-AE25-07C667C32318 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='4C240EA1-0AC2-41BF-AE25-07C667C32318';

/* SQL text to insert entity field value with ID 2c841db1-23e7-47c4-85fa-3af6838968e3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2c841db1-23e7-47c4-85fa-3af6838968e3', '01D914E7-BEF0-4F12-8FEF-1D4C93CACB97', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 61dcac00-2fa8-4512-a4dd-119e23c76473 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('61dcac00-2fa8-4512-a4dd-119e23c76473', '01D914E7-BEF0-4F12-8FEF-1D4C93CACB97', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e386ceb3-9dc0-4f7c-a94f-1b959daaf083 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e386ceb3-9dc0-4f7c-a94f-1b959daaf083', '01D914E7-BEF0-4F12-8FEF-1D4C93CACB97', 3, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4316f951-e25d-4689-9e69-fca1451555ef */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4316f951-e25d-4689-9e69-fca1451555ef', '01D914E7-BEF0-4F12-8FEF-1D4C93CACB97', 4, 'Proposed', 'Proposed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 01D914E7-BEF0-4F12-8FEF-1D4C93CACB97 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='01D914E7-BEF0-4F12-8FEF-1D4C93CACB97';

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


/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edges (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ddfb3c46-36e3-45fc-88b7-0903f0ddbbe0' OR ([EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [RelatedEntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ddfb3c46-36e3-45fc-88b7-0903f0ddbbe0', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', '52ACC265-E651-4CD9-8C96-088B6263CC2B', 'GraphID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edge Providers (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '33ef9319-e0aa-4c1c-a577-cb0dd73032e2' OR ([EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [RelatedEntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('33ef9319-e0aa-4c1c-a577-cb0dd73032e2', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', '234A4D46-27B8-4011-B3F3-8B862D77073C', 'GraphID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edge Types (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c2e55bda-132d-40b8-85ff-0780e383ea39' OR ([EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [RelatedEntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c2e55bda-132d-40b8-85ff-0780e383ea39', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', '4A8D91D6-0933-4CAC-966A-95C69F5228BA', 'GraphID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Content Sources (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd8400b3f-7364-4b56-81ef-7cd368cfd5fb' OR ([EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [RelatedEntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d8400b3f-7364-4b56-81ef-7cd368cfd5fb', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'GraphID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Concepts (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'c521c7a6-debd-4052-bd5c-d636490e8435' OR ([EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [RelatedEntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c521c7a6-debd-4052-bd5c-d636490e8435', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', 'GraphID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edges (One To Many via SourceEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4e7d0cc1-6fca-4d88-9874-5960ff283e1c' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND [RelatedEntityJoinField] = 'SourceEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4e7d0cc1-6fca-4d88-9874-5960ff283e1c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '52ACC265-E651-4CD9-8C96-088B6263CC2B', 'SourceEntityID', 'One To Many', 1, 1, 90, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edges (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '96f6ed73-d417-4d11-b0ef-d1f93760e188' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND [RelatedEntityJoinField] = 'TargetEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('96f6ed73-d417-4d11-b0ef-d1f93760e188', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '52ACC265-E651-4CD9-8C96-088B6263CC2B', 'TargetEntityID', 'One To Many', 1, 1, 91, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edge Type Endpoints (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd310399e-868f-408b-82d2-24e45bfee34a' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND [RelatedEntityJoinField] = 'EntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d310399e-868f-408b-82d2-24e45bfee34a', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D74E798F-D63F-479A-BC2B-C629B252FE60', 'EntityID', 'One To Many', 1, 1, 92, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Types -> MJ: Graphs (One To Many via GraphTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd69d6e91-531c-4fe3-bdf2-3da664e29871' OR ([EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND [RelatedEntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [RelatedEntityJoinField] = 'GraphTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d69d6e91-531c-4fe3-bdf2-3da664e29871', '037FD55F-0F21-4584-8F86-90C2E45FC671', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', 'GraphTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graph Concept Types -> MJ: Graph Concepts (One To Many via ConceptTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6a9fc8a9-35bc-40a9-8ad0-787ebb11a85d' OR ([EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND [RelatedEntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND [RelatedEntityJoinField] = 'ConceptTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6a9fc8a9-35bc-40a9-8ad0-787ebb11a85d', '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', 'ConceptTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Edge Types -> MJ: Graph Edges (One To Many via EdgeTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '81e10655-181f-4e95-bc84-e34ea9951527' OR ([EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND [RelatedEntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND [RelatedEntityJoinField] = 'EdgeTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('81e10655-181f-4e95-bc84-e34ea9951527', '4A8D91D6-0933-4CAC-966A-95C69F5228BA', '52ACC265-E651-4CD9-8C96-088B6263CC2B', 'EdgeTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graph Edge Types -> MJ: Graph Edge Type Endpoints (One To Many via EdgeTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f09c2c87-f164-42fb-8428-938642e00716' OR ([EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND [RelatedEntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND [RelatedEntityJoinField] = 'EdgeTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f09c2c87-f164-42fb-8428-938642e00716', '4A8D91D6-0933-4CAC-966A-95C69F5228BA', 'D74E798F-D63F-479A-BC2B-C629B252FE60', 'EdgeTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Concepts -> MJ: Graph Concepts (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '474ce08d-0ac2-47dc-9500-6d4501fb17d5' OR ([EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND [RelatedEntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND [RelatedEntityJoinField] = 'ParentID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('474ce08d-0ac2-47dc-9500-6d4501fb17d5', '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', 'ParentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 89139890-8F7B-4D8D-A77D-1643F617B6D5 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='89139890-8F7B-4D8D-A77D-1643F617B6D5', @RelatedEntityNameFieldMap='Graph';

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

/* Index for Foreign Keys for GraphConceptType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concept Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

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

-- Index for foreign key ConceptTypeID in table GraphConcept
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphConcept_ConceptTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphConcept]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphConcept_ConceptTypeID ON [${flyway:defaultSchema}].[GraphConcept] ([ConceptTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 2C493F15-AD4B-4123-A1F5-7CEDB0B72BE7 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='2C493F15-AD4B-4123-A1F5-7CEDB0B72BE7', @RelatedEntityNameFieldMap='Graph';

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

/* SQL text to update entity field related entity name field map for entity field ID 0A1CF78B-E858-4773-9E07-6B9B9B78A27A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0A1CF78B-E858-4773-9E07-6B9B9B78A27A', @RelatedEntityNameFieldMap='Graph';

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

/* SQL text to update entity field related entity name field map for entity field ID 606DFB4B-6789-4ADF-9E64-24668092D9DB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='606DFB4B-6789-4ADF-9E64-24668092D9DB', @RelatedEntityNameFieldMap='EdgeType';

/* Base View SQL for MJ: Graph Concept Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concept Types
-- Item: vwGraphConceptTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Concept Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphConceptType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphConceptTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphConceptTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphConceptTypes]
AS
SELECT
    g.*
FROM
    [${flyway:defaultSchema}].[GraphConceptType] AS g
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphConceptTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Concept Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concept Types
-- Item: Permissions for vwGraphConceptTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphConceptTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Concept Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concept Types
-- Item: spCreateGraphConceptType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphConceptType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphConceptType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphConceptType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphConceptType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Rank int = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GraphConceptType]
            (
                [ID],
                [Name],
                [Description],
                [Rank],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Rank, 100),
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphConceptType]
            (
                [Name],
                [Description],
                [Rank],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@Rank, 100),
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphConceptTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphConceptType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Concept Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphConceptType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Concept Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concept Types
-- Item: spUpdateGraphConceptType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphConceptType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphConceptType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphConceptType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphConceptType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Rank int = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphConceptType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Rank] = ISNULL(@Rank, [Rank]),
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphConceptTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphConceptTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphConceptType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphConceptType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphConceptType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphConceptType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphConceptType
ON [${flyway:defaultSchema}].[GraphConceptType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphConceptType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphConceptType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Concept Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphConceptType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graph Concept Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Concept Types
-- Item: spDeleteGraphConceptType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphConceptType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphConceptType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphConceptType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphConceptType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphConceptType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphConceptType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Concept Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphConceptType] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 73D2C416-437E-4FDC-8ABC-CCD200023753 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='73D2C416-437E-4FDC-8ABC-CCD200023753', @RelatedEntityNameFieldMap='Entity';

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

/* SQL text to update entity field related entity name field map for entity field ID 60681B95-FF7A-4C95-B09B-E919DDFED6B4 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='60681B95-FF7A-4C95-B09B-E919DDFED6B4', @RelatedEntityNameFieldMap='Parent';

/* SQL text to update entity field related entity name field map for entity field ID 095762FB-ADC5-48D7-9D74-523CE01E0CC9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='095762FB-ADC5-48D7-9D74-523CE01E0CC9', @RelatedEntityNameFieldMap='ConceptType';

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
    MJGraphConcept_ParentID.[Name] AS [Parent],
    MJGraphConceptType_ConceptTypeID.[Name] AS [ConceptType]
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
INNER JOIN
    [${flyway:defaultSchema}].[GraphConceptType] AS MJGraphConceptType_ConceptTypeID
  ON
    [g].[ConceptTypeID] = MJGraphConceptType_ConceptTypeID.[ID]
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
    @ConceptTypeID uniqueidentifier,
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
                [ConceptTypeID],
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
                @ConceptTypeID,
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
                [ConceptTypeID],
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
                @ConceptTypeID,
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
    @ConceptTypeID uniqueidentifier = NULL,
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
        [ConceptTypeID] = ISNULL(@ConceptTypeID, [ConceptTypeID]),
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

/* SQL text to update entity field related entity name field map for entity field ID A185AE28-27D9-4D81-95A9-EB66493E9198 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A185AE28-27D9-4D81-95A9-EB66493E9198', @RelatedEntityNameFieldMap='Graph';

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

/* SQL text to update entity field related entity name field map for entity field ID 5A451C92-4937-486B-A99A-86EC356C99B9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5A451C92-4937-486B-A99A-86EC356C99B9', @RelatedEntityNameFieldMap='Graph';

/* Index for Foreign Keys for GraphType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Graph */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graphs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key GraphTypeID in table Graph
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Graph_GraphTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Graph]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Graph_GraphTypeID ON [${flyway:defaultSchema}].[Graph] ([GraphTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 025C4B99-DD64-4935-B134-463B03577CD1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='025C4B99-DD64-4935-B134-463B03577CD1', @RelatedEntityNameFieldMap='GraphType';

/* Base View SQL for MJ: Graph Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Types
-- Item: vwGraphTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphTypes]
AS
SELECT
    g.*
FROM
    [${flyway:defaultSchema}].[GraphType] AS g
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Types
-- Item: Permissions for vwGraphTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Types
-- Item: spCreateGraphType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsCanon bit = NULL,
    @Rank int = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[GraphType]
            (
                [ID],
                [Name],
                [Description],
                [IsCanon],
                [Rank],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsCanon, 0),
                ISNULL(@Rank, 100),
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphType]
            (
                [Name],
                [Description],
                [IsCanon],
                [Rank],
                [IconClass],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsCanon, 0),
                ISNULL(@Rank, 100),
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Types
-- Item: spUpdateGraphType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphType]
    @ID uniqueidentifier,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsCanon bit = NULL,
    @Rank int = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphType]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsCanon] = ISNULL(@IsCanon, [IsCanon]),
        [Rank] = ISNULL(@Rank, [Rank]),
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphType
ON [${flyway:defaultSchema}].[GraphType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Graph Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Types
-- Item: spDeleteGraphType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphType] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 3E67FDF9-8943-4D0A-AE2C-1AFBF5BEB404 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3E67FDF9-8943-4D0A-AE2C-1AFBF5BEB404', @RelatedEntityNameFieldMap='EdgeType';

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
    g.*,
    MJGraphType_GraphTypeID.[Name] AS [GraphType]
FROM
    [${flyway:defaultSchema}].[Graph] AS g
INNER JOIN
    [${flyway:defaultSchema}].[GraphType] AS MJGraphType_GraphTypeID
  ON
    [g].[GraphTypeID] = MJGraphType_GraphTypeID.[ID]
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
    @GraphTypeID uniqueidentifier,
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
                [GraphTypeID],
                [LoadMode],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @GraphTypeID,
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
                [GraphTypeID],
                [LoadMode],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @GraphTypeID,
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
    @GraphTypeID uniqueidentifier = NULL,
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
        [GraphTypeID] = ISNULL(@GraphTypeID, [GraphTypeID]),
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

/* SQL text to update entity field related entity name field map for entity field ID 7FC72692-952B-4CB4-B964-EC675F74C593 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7FC72692-952B-4CB4-B964-EC675F74C593', @RelatedEntityNameFieldMap='SourceEntity';

/* SQL text to update entity field related entity name field map for entity field ID 6959EB2C-729B-4828-9722-222A893300DE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6959EB2C-729B-4828-9722-222A893300DE', @RelatedEntityNameFieldMap='TargetEntity';

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

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '74aa4448-ab89-4ee5-82d4-601bffce09f7' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'Graph')) BEGIN
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
            '74aa4448-ab89-4ee5-82d4-601bffce09f7',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3a162e04-62b6-48b7-b6a0-01f674ee1d45' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'EdgeType')) BEGIN
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
            '3a162e04-62b6-48b7-b6a0-01f674ee1d45',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd78ff032-780e-4e18-9c15-0321dbb2ec8e' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'SourceEntity')) BEGIN
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
            'd78ff032-780e-4e18-9c15-0321dbb2ec8e',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27cec05b-74e2-4320-84fe-17cfb0cfa049' OR (EntityID = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND Name = 'TargetEntity')) BEGIN
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
            '27cec05b-74e2-4320-84fe-17cfb0cfa049',
            '52ACC265-E651-4CD9-8C96-088B6263CC2B', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4cd2ad93-52be-49f8-8457-f30e8439f695' OR (EntityID = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND Name = 'GraphType')) BEGIN
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
            '4cd2ad93-52be-49f8-8457-f30e8439f695',
            '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA'),
            'GraphType',
            'Graph Type',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25121b0a-ec51-415b-8c4c-ec1bab0caa17' OR (EntityID = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND Name = 'Graph')) BEGIN
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
            '25121b0a-ec51-415b-8c4c-ec1bab0caa17',
            '234A4D46-27B8-4011-B3F3-8B862D77073C', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27bf477d-a199-40c1-8601-39f1a6edcc83' OR (EntityID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND Name = 'Graph')) BEGIN
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
            '27bf477d-a199-40c1-8601-39f1a6edcc83',
            '4A8D91D6-0933-4CAC-966A-95C69F5228BA', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc8bda97-f827-4583-879e-30044a20c2ab' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = 'EdgeType')) BEGIN
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
            'cc8bda97-f827-4583-879e-30044a20c2ab',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3daebebe-9239-43c6-a618-c454525af894' OR (EntityID = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND Name = 'Entity')) BEGIN
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
            '3daebebe-9239-43c6-a618-c454525af894',
            'D74E798F-D63F-479A-BC2B-C629B252FE60', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed884c9f-cab1-4adb-9b77-d9d161ea7ae8' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'Graph')) BEGIN
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
            'ed884c9f-cab1-4adb-9b77-d9d161ea7ae8',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5216386c-bbda-4b9e-a431-0c27ceacd857' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'Parent')) BEGIN
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
            '5216386c-bbda-4b9e-a431-0c27ceacd857',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ba3c4e0-7dab-4b9b-a24a-c7c097179f97' OR (EntityID = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND Name = 'ConceptType')) BEGIN
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
            '9ba3c4e0-7dab-4b9b-a24a-c7c097179f97',
            '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99'),
            'ConceptType',
            'Concept Type',
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A339B589-1899-478C-8B29-7DFC6685931A'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4CD2AD93-52BE-49F8-8457-F30E8439F695'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '5FA41B09-F360-47EA-AAF8-715B76CC81FC'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4C240EA1-0AC2-41BF-AE25-07C667C32318'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '01D914E7-BEF0-4F12-8FEF-1D4C93CACB97'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ED884C9F-CAB1-4ADB-9B77-D9D161EA7AE8'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9BA3C4E0-7DAB-4B9B-A24A-C7C097179F97'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '684BF023-DF26-40F3-AC2A-6455FE606DB9'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '36CD6CE2-3598-4652-8587-ACA7F51C9CD4'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2FD60774-47DA-44DD-BE9D-6D8D0CD3BCD3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '35E93800-9085-4636-B16D-3017A117F300'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '664125D1-6EB7-4AFC-B73B-3B6D5EB7E9B7'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '35E93800-9085-4636-B16D-3017A117F300'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2E9A60E9-694C-418F-95CB-9D4FDDF44334'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F4878649-5999-4CC7-B195-FC17B88667A3'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '214B6E6F-3E16-4F55-B9A4-5E4A78A77A1B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3A162E04-62B6-48B7-B6A0-01F674EE1D45'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D78FF032-780E-4E18-9C15-0321DBB2EC8E'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '27CEC05B-74E2-4320-84FE-17CFB0CFA049'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '1FEC2E91-754C-40B5-91DD-917447714548'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'AB2108B3-9F48-45CD-BA01-284E2F022781'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FB8AAA3D-685B-4347-985D-EF4A3C66F8B7'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C540096A-437C-4202-B7C9-E13B6A233F1F'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A44E9352-951B-4719-9E19-38CC3744EA0A'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '4A8D91D6-0933-4CAC-966A-95C69F5228BA'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ: Content Sources.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph'
WHERE 
   ID = '89139890-8F7B-4D8D-A77D-1643F617B6D5';

-- UPDATE Entity Field Category Info MJ: Content Sources.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Processing & Automation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Name'
WHERE 
   ID = '75645C36-084D-405B-9015-B6F0389341C5';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F686DD28-8D73-498C-8722-A380D1D11B1E';

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AB2108B3-9F48-45CD-BA01-284E2F022781';

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7A1E68BD-FA0A-4E1A-8B56-D5CACDDDE466';

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.Rank 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Display',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '22385146-7D25-447D-B63F-D32FD4C28059';

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.IconClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Display',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Icon'
WHERE 
   ID = '68B47CEF-6010-4372-BE71-47D6066DAF9D';

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Display',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1FEC2E91-754C-40B5-91DD-917447714548';

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E3CCA960-1F9D-4124-B670-07836C77BFFE';

-- UPDATE Entity Field Category Info MJ: Graph Concept Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C46305B4-9536-4D08-B706-9F01ADEA4243';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('cc10fee8-9c4e-5476-9f96-d99e0871d539', '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', 'FieldCategoryInfo', '{
  "Concept Type Details": {
    "description": "Core descriptive information defining the concept type and its semantic purpose",
    "icon": "fa fa-info-circle"
  },
  "Configuration and Display": {
    "description": "Rank ordering, visual styling, and operational status settings",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('07792307-b214-5a02-a9f8-43ce85840e82', '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD', 'FieldCategoryIcons', '{
  "Concept Type Details": "fa fa-info-circle",
  "Configuration and Display": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '2A8EDBA7-8BA8-4DA7-8F6E-915585C197BD';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Graphs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DEF208FA-D4CF-4E48-A3F1-B403FC1F8A57';

-- UPDATE Entity Field Category Info MJ: Graphs.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5FA41B09-F360-47EA-AAF8-715B76CC81FC';

-- UPDATE Entity Field Category Info MJ: Graphs.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ED4E169D-1C52-4D3B-97BE-842E2A2B0A53';

-- UPDATE Entity Field Category Info MJ: Graphs.GraphTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Type'
WHERE 
   ID = '025C4B99-DD64-4935-B134-463B03577CD1';

-- UPDATE Entity Field Category Info MJ: Graphs.LoadMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operational Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '124810DC-8BEB-4EDE-8BA3-D9421781E145';

-- UPDATE Entity Field Category Info MJ: Graphs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Operational Settings',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A339B589-1899-478C-8B29-7DFC6685931A';

-- UPDATE Entity Field Category Info MJ: Graphs.GraphType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Type Name'
WHERE 
   ID = '4CD2AD93-52BE-49F8-8457-F30E8439F695';

-- UPDATE Entity Field Category Info MJ: Graphs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FAC9102E-33C3-4276-94EE-5E27956039B5';

-- UPDATE Entity Field Category Info MJ: Graphs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '69C52773-8871-4990-BD54-F5D685BB4175';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('8cfcaf57-2df0-5ee1-9053-6cee06202fde', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', 'FieldCategoryInfo', '{
  "Graph Configuration": {
    "description": "Core configuration and identity attributes of the semantic graph partition",
    "icon": "fa fa-project-diagram"
  },
  "Operational Settings": {
    "description": "Runtime behavior, loading modes, and operational status settings",
    "icon": "fa fa-cogs"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6b87e292-376e-5e7d-a2b1-d87fb9924c4b', '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA', 'FieldCategoryIcons', '{
  "Graph Configuration": "fa fa-project-diagram",
  "Operational Settings": "fa fa-cogs",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '6F9D2A33-7A64-4CEE-B9D3-52B3CC58E9EA';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EE599E24-5E75-43C9-BE96-1518AC266C35';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph'
WHERE 
   ID = '0A1CF78B-E858-4773-9E07-6B9B9B78A27A';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '25121B0A-EC51-415B-8C4C-EC1BAB0CAA17';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '664125D1-6EB7-4AFC-B73B-3B6D5EB7E9B7';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '42664051-B612-4A2D-B82B-5E50850FDD4A';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution and Implementation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '35E93800-9085-4636-B16D-3017A117F300';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution and Implementation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'EA46C851-185B-48CB-9C30-242250EB4B08';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution and Implementation',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '36CD6CE2-3598-4652-8587-ACA7F51C9CD4';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Execution and Implementation',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active'
WHERE 
   ID = '2FD60774-47DA-44DD-BE9D-6D8D0CD3BCD3';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2BACBF2A-4C4C-4C37-AED6-0850391F875C';

-- UPDATE Entity Field Category Info MJ: Graph Edge Providers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0C81340C-8F85-4C53-B973-47B393842B1B';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '234A4D46-27B8-4011-B3F3-8B862D77073C';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3c657943-3a20-5641-8e20-38eaff124b62', '234A4D46-27B8-4011-B3F3-8B862D77073C', 'FieldCategoryInfo', '{
  "Execution and Implementation": {
    "description": "Technical settings governing execution order, driver class, and configuration parameters",
    "icon": "fa fa-cogs"
  },
  "Provider Configuration": {
    "description": "Core identifying attributes and descriptive details for the edge provider",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('23e39cc8-c095-5b38-bbdd-6c41e847c52a', '234A4D46-27B8-4011-B3F3-8B862D77073C', 'FieldCategoryIcons', '{
  "Execution and Implementation": "fa fa-cogs",
  "Provider Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '234A4D46-27B8-4011-B3F3-8B862D77073C';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0200DB32-1B57-4BCF-8D2C-A1F80BDCF843';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Scope',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph'
WHERE 
   ID = 'A185AE28-27D9-4D81-95A9-EB66493E9198';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Relationship Scope',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Details'
WHERE 
   ID = '27BF477D-A199-40C1-8601-39F1A6EDCC83';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Type Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A05DDD69-E6D9-4121-856C-A0B9EAEDC882';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Type Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '799B5F84-5186-4EE0-B810-B92FBE5781F6';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.InverseName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Type Definition',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FB8AAA3D-685B-4347-985D-EF4A3C66F8B7';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.IsDirected 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Behavior',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '679F79DB-E2E6-40B2-A830-D92E52928A68';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.DefaultWeight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Behavior',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C540096A-437C-4202-B7C9-E13B6A233F1F';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.AllowStored 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration and Behavior',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A44E9352-951B-4719-9E19-38CC3744EA0A';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '607F0F42-B7D5-439A-9BFB-D9893CA5D363';

-- UPDATE Entity Field Category Info MJ: Graph Edge Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0EC98D00-2621-4D02-9B71-D8D7B41F99E7';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('372fef26-518a-5536-9deb-4175e9e531e4', '4A8D91D6-0933-4CAC-966A-95C69F5228BA', 'FieldCategoryInfo', '{
  "Configuration and Behavior": {
    "description": "Behavioral flags and retrieval weights for graph expansion",
    "icon": "fa fa-sliders-h"
  },
  "Edge Type Definition": {
    "description": "Semantic labels and descriptions defining the relationship type",
    "icon": "fa fa-font"
  },
  "Relationship Scope": {
    "description": "Defines whether the edge type is global or scoped to a specific graph",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('6101fd47-7b41-508c-b911-defff1683ccc', '4A8D91D6-0933-4CAC-966A-95C69F5228BA', 'FieldCategoryIcons', '{
  "Configuration and Behavior": "fa fa-sliders-h",
  "Edge Type Definition": "fa fa-font",
  "Relationship Scope": "fa fa-sitemap",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '4A8D91D6-0933-4CAC-966A-95C69F5228BA';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C7FA5DAC-4EB3-4F1B-A840-C4B40A781AE4'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '037FD55F-0F21-4584-8F86-90C2E45FC671'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 15 fields */

-- UPDATE Entity Field Category Info MJ: Graph Concepts.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '494179A9-693E-48ED-A4F5-DE092BF848F9';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph'
WHERE 
   ID = '2C493F15-AD4B-4123-A1F5-7CEDB0B72BE7';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Concept'
WHERE 
   ID = '60681B95-FF7A-4C95-B09B-E919DDFED6B4';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '684BF023-DF26-40F3-AC2A-6455FE606DB9';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.ConceptTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Concept Type'
WHERE 
   ID = '095762FB-ADC5-48D7-9D74-523CE01E0CC9';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AF541026-7247-41DD-952B-3BC4769EB459';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Specification 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Rules',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Markdown'
WHERE 
   ID = '8301A585-CF27-493E-B5E9-0AD3DF585488';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Synonyms 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '7AC32B20-F7AC-4865-A8C3-F95E74F47DA2';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.AuthorityTier 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4C240EA1-0AC2-41BF-AE25-07C667C32318';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Rules',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '01D914E7-BEF0-4F12-8FEF-1D4C93CACB97';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '68FC9DB9-58BC-4ABD-9674-85844A8EBDCB';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5B31597E-D660-4A6A-B257-2E74C298CFD5';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Name'
WHERE 
   ID = 'ED884C9F-CAB1-4ADB-9B77-D9D161EA7AE8';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.Parent 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Name'
WHERE 
   ID = '5216386C-BBDA-4B9E-A431-0C27CEACD857';

-- UPDATE Entity Field Category Info MJ: Graph Concepts.ConceptType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Concept Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Concept Type Name'
WHERE 
   ID = '9BA3C4E0-7DAB-4B9B-A24A-C7C097179F97';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('fc25ac14-ff1e-5796-b36c-2fe1e514b3e0', '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', 'FieldCategoryInfo', '{
  "Concept Details": {
    "description": "Core identifying attributes, definitions, and naming variations of the concept",
    "icon": "fa fa-info-circle"
  },
  "Concept Relationships": {
    "description": "Graph scoping and hierarchical parent-child relationships",
    "icon": "fa fa-sitemap"
  },
  "Governance and Rules": {
    "description": "Authoritative specifications, lifecycle status, and evidentiary tiers",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4c06d00a-913d-591a-be40-f4f5dbe10cc2', '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99', 'FieldCategoryIcons', '{
  "Concept Details": "fa fa-info-circle",
  "Concept Relationships": "fa fa-sitemap",
  "Governance and Rules": "fa fa-shield-alt",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=true for NEW entity (category: primary, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 1, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '2C3071C8-EC27-41C4-A4C7-E64F50BA1B99';

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edges.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '582C33C6-C6C1-4FE3-9104-F4A042A6B769';

-- UPDATE Entity Field Category Info MJ: Graph Edges.GraphID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph'
WHERE 
   ID = '5A451C92-4937-486B-A99A-86EC356C99B9';

-- UPDATE Entity Field Category Info MJ: Graph Edges.EdgeTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Edge Type'
WHERE 
   ID = '3E67FDF9-8943-4D0A-AE2C-1AFBF5BEB404';

-- UPDATE Entity Field Category Info MJ: Graph Edges.SourceEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Node',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity'
WHERE 
   ID = '7FC72692-952B-4CB4-B964-EC675F74C593';

-- UPDATE Entity Field Category Info MJ: Graph Edges.SourceRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Node',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5817617B-F538-4486-964F-D9A62F133DA9';

-- UPDATE Entity Field Category Info MJ: Graph Edges.TargetEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Node',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Entity'
WHERE 
   ID = '6959EB2C-729B-4828-9722-222A893300DE';

-- UPDATE Entity Field Category Info MJ: Graph Edges.TargetRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Node',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '89DB171E-292C-4E1D-AEA4-89D4F0AB5801';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Weight 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2E9A60E9-694C-418F-95CB-9D4FDDF44334';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '36C6BF28-C912-4344-86AA-F56854DC7D1F';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Attributes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Properties',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '9FE71313-94D8-43CC-B72B-2D9C289A4195';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Origin 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Origin',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F4878649-5999-4CC7-B195-FC17B88667A3';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Origin',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '214B6E6F-3E16-4F55-B9A4-5E4A78A77A1B';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Confidence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Governance and Origin',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '030C1BDE-F141-4107-AB0C-1C29BE2BC5AB';

-- UPDATE Entity Field Category Info MJ: Graph Edges.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6D4FB832-C5CA-426B-9576-CF89C0BA2AB7';

-- UPDATE Entity Field Category Info MJ: Graph Edges.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DA4021C1-1495-4707-9777-DD6A634396B3';

-- UPDATE Entity Field Category Info MJ: Graph Edges.Graph 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Graph Name'
WHERE 
   ID = '74AA4448-AB89-4EE5-82D4-601BFFCE09F7';

-- UPDATE Entity Field Category Info MJ: Graph Edges.EdgeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Edge Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Edge Type Name'
WHERE 
   ID = '3A162E04-62B6-48B7-B6A0-01F674EE1D45';

-- UPDATE Entity Field Category Info MJ: Graph Edges.SourceEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Source Node',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Entity Name'
WHERE 
   ID = 'D78FF032-780E-4E18-9C15-0321DBB2EC8E';

-- UPDATE Entity Field Category Info MJ: Graph Edges.TargetEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Target Node',
   GeneratedFormSection = 'Category',
   DisplayName = 'Target Entity Name'
WHERE 
   ID = '27CEC05B-74E2-4320-84FE-17CFB0CFA049';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('252dd426-93e1-55b6-b9c0-1527a1e58101', '52ACC265-E651-4CD9-8C96-088B6263CC2B', 'FieldCategoryInfo', '{
  "Edge Properties": {
    "description": "Weight, descriptions, and structured metadata attributes of the edge",
    "icon": "fa fa-sliders-h"
  },
  "Edge Relationships": {
    "description": "Association links connecting the edge to graphs and types",
    "icon": "fa fa-link"
  },
  "Governance and Origin": {
    "description": "Lifecycle status, origin tracking, and confidence scoring",
    "icon": "fa fa-shield-alt"
  },
  "Source Node": {
    "description": "Identification details for the origin node of the edge",
    "icon": "fa fa-arrow-alt-circle-right"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Target Node": {
    "description": "Identification details for the destination node of the edge",
    "icon": "fa fa-arrow-alt-circle-left"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d27ee910-3d0b-501b-879b-44aeea3496c4', '52ACC265-E651-4CD9-8C96-088B6263CC2B', 'FieldCategoryIcons', '{
  "Edge Properties": "fa fa-sliders-h",
  "Edge Relationships": "fa fa-link",
  "Governance and Origin": "fa fa-shield-alt",
  "Source Node": "fa fa-arrow-alt-circle-right",
  "System Metadata": "fa fa-cog",
  "Target Node": "fa fa-arrow-alt-circle-left"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '52ACC265-E651-4CD9-8C96-088B6263CC2B';

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '5957A809-6C5A-42D2-A500-6D06CDA9E4E3'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CC8BDA97-F827-4583-879E-30044A20C2AB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3DAEBEBE-9239-43C6-A618-C454525AF894'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ: Graph Types.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0CDA78D2-75BD-4AE3-B94A-4A585FDBC347';

-- UPDATE Entity Field Category Info MJ: Graph Types.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E89A1147-4B30-4947-92BC-1094B59F28AC';

-- UPDATE Entity Field Category Info MJ: Graph Types.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Graph Type Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E7C33A26-DFEC-4C27-A503-8DDF050457B3';

-- UPDATE Entity Field Category Info MJ: Graph Types.IsCanon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '81C1A0ED-6563-4DC8-8564-EEDC8B097120';

-- UPDATE Entity Field Category Info MJ: Graph Types.Rank 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '96838CAD-B3EE-42BE-A8D5-D2B2B18CEE15';

-- UPDATE Entity Field Category Info MJ: Graph Types.IconClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Icon'
WHERE 
   ID = 'DE62F801-9A1E-4B1F-B382-B93FFD8DC144';

-- UPDATE Entity Field Category Info MJ: Graph Types.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C7FA5DAC-4EB3-4F1B-A840-C4B40A781AE4';

-- UPDATE Entity Field Category Info MJ: Graph Types.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '33C5A5AC-4140-44B0-B0EB-293F57D01806';

-- UPDATE Entity Field Category Info MJ: Graph Types.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4FACCAE0-29D6-4E2E-A928-77066CD3046D';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '037FD55F-0F21-4584-8F86-90C2E45FC671';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('54b52a9b-d5fb-5b30-9456-a18c81ce55b3', '037FD55F-0F21-4584-8F86-90C2E45FC671', 'FieldCategoryInfo', '{
  "Configuration": {
    "description": "Behavioral settings, canon governance, precedence ranking, and visual styling",
    "icon": "fa fa-sliders-h"
  },
  "Graph Type Details": {
    "description": "Primary identification and descriptive details for the graph classification",
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
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b90af78c-505c-535f-822c-3e05c02036bd', '037FD55F-0F21-4584-8F86-90C2E45FC671', 'FieldCategoryIcons', '{
  "Configuration": "fa fa-sliders-h",
  "Graph Type Details": "fa fa-info-circle",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '037FD55F-0F21-4584-8F86-90C2E45FC671';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C273AFF5-6BC3-49C0-8027-00F4C6D9EFCF';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.EdgeTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Constraints',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '606DFB4B-6789-4ADF-9E64-24668092D9DB';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.Side 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Constraints',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5957A809-6C5A-42D2-A500-6D06CDA9E4E3';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Constraints',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '73D2C416-437E-4FDC-8ABC-CCD200023753';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.EdgeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Constraints',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CC8BDA97-F827-4583-879E-30044A20C2AB';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Endpoint Constraints',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3DAEBEBE-9239-43C6-A618-C454525AF894';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B75AAF6D-B753-4379-B41C-5B09B68A998C';

-- UPDATE Entity Field Category Info MJ: Graph Edge Type Endpoints.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CDFA1C03-C365-4DBB-B051-E58F09D32975';

/* Set entity icon to fa fa-project-diagram */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-project-diagram', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('34261007-cb66-5654-97e4-d377ff3a765f', 'D74E798F-D63F-479A-BC2B-C629B252FE60', 'FieldCategoryInfo', '{
  "Endpoint Constraints": {
    "description": "Rules and relationships defining valid source and target entities for graph edges",
    "icon": "fa fa-link"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('66a389cd-00e3-5995-957f-eb4ee1719ffe', 'D74E798F-D63F-479A-BC2B-C629B252FE60', 'FieldCategoryIcons', '{
  "Endpoint Constraints": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'D74E798F-D63F-479A-BC2B-C629B252FE60';

