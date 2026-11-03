-- =====================================================================================
-- Semantic Graph Substrate, Generic Graph Concepts, & Content Source Graph Overlay
--
-- 1. GraphType: configurable semantic graph classifications (e.g., 'Canon',
--    'Knowledge', 'Network', 'Custom') with IsCanon flag and Rank order, seeded via
--    /metadata/graph-types.
-- 2. GraphConceptType: configurable concept classifications (e.g., 'Policy',
--    'Metric', 'Process', 'Role', 'Domain', 'Term') with Rank order, seeded via
--    /metadata/graph-concept-types.
-- 3. GraphAuthorityTier: configurable evidentiary precedence tiers (e.g., 'Bylaws',
--    'Board Policy', 'Executive SOP', 'Department Practice', 'Reference', 'Inferred')
--    with Rank weight, seeded via /metadata/graph-authority-tiers.
-- 4. Graph: named semantic graph partitions referencing GraphTypeID and LoadMode
--    ('Preload', 'OnDemand').
-- 5. GraphEdgeType: global (GraphID IS NULL) or graph-scoped edge types with
--    directionality, inverse label, default retrieval weight, and AllowStored flag,
--    seeded via /metadata/graph-edge-types.
-- 6. GraphEdgeTypeEndpoint: optional endpoint entity constraints per edge type.
-- 7. GraphEdgeProvider: pluggable derived-edge providers enabled per graph.
-- 8. GraphEdge: polymorphic stored edges (Declared or Inferred, Proposed/Approved/Rejected)
--    connecting any (SourceEntityID, SourceRecordID) to (TargetEntityID, TargetRecordID).
-- 9. GraphConcept: generalized higher-level concept node scoped to a GraphID and
--    referencing ConceptTypeID and AuthorityTierID, with Specification, ParentID, and Status.
-- 10. ContentSource.GraphID: optional foreign key linking a Content Source to a target
--     Graph (supporting single-source or multi-source shared Knowledge/Canon graphs).
--
-- Conventions (migrations/CLAUDE.md & guides/SCHEMA_AND_CODE_AUTHORING_GUIDE.md):
--   - Plain DDL + sp_addextendedproperty only (no existence guards).
--   - Timestamp columns (__mj_CreatedAt / __mj_UpdatedAt) and FK indexes are omitted;
--     CodeGen generates them.
--   - PostgreSQL counterpart is deferred to the release build engineer.
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

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
-- 3. GraphAuthorityTier
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphAuthorityTier] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphAuthorityTier_ID] DEFAULT (newsequentialid()),
    [Name]        NVARCHAR(100)    NOT NULL,
    [Description] NVARCHAR(MAX)    NULL,
    [Rank]        INT              NOT NULL CONSTRAINT [DF_GraphAuthorityTier_Rank] DEFAULT (20),
    [IconClass]   NVARCHAR(100)    NULL,
    [Status]      NVARCHAR(20)     NOT NULL CONSTRAINT [DF_GraphAuthorityTier_Status] DEFAULT (N'Active'),
    CONSTRAINT [PK_GraphAuthorityTier] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_GraphAuthorityTier_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_GraphAuthorityTier_Status] CHECK ([Status] IN (N'Active', N'Inactive'))
);
GO

-- -------------------------------------------------------------------------------------
-- 4. Graph
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
-- 5. GraphEdgeType
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
    CONSTRAINT [CK_GraphEdgeType_DefaultWeight] CHECK ([DefaultWeight] >= 0 AND [DefaultWeight] <= 1)
);
GO

CREATE UNIQUE INDEX [UQ_GraphEdgeType_Global_Name]
    ON [${flyway:defaultSchema}].[GraphEdgeType]([Name])
    WHERE [GraphID] IS NULL;
GO

CREATE UNIQUE INDEX [UQ_GraphEdgeType_Scoped_Name]
    ON [${flyway:defaultSchema}].[GraphEdgeType]([GraphID], [Name])
    WHERE [GraphID] IS NOT NULL;
GO

-- -------------------------------------------------------------------------------------
-- 6. GraphEdgeTypeEndpoint
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
-- 7. GraphEdgeProvider
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
-- 8. GraphEdge
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
-- 9. GraphConcept
-- -------------------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[GraphConcept] (
    [ID]              UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_GraphConcept_ID] DEFAULT (newsequentialid()),
    [GraphID]         UNIQUEIDENTIFIER NOT NULL,
    [ParentID]        UNIQUEIDENTIFIER NULL,
    [Name]            NVARCHAR(255)    NOT NULL,
    [ConceptTypeID]   UNIQUEIDENTIFIER NOT NULL,
    [AuthorityTierID] UNIQUEIDENTIFIER NULL,
    [Description]     NVARCHAR(MAX)    NOT NULL,
    [Specification]   NVARCHAR(MAX)    NULL,
    [Synonyms]        NVARCHAR(MAX)    NULL,
    [Status]          NVARCHAR(20)     NOT NULL CONSTRAINT [DF_GraphConcept_Status] DEFAULT (N'Draft'),
    CONSTRAINT [PK_GraphConcept] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_GraphConcept_Graph] FOREIGN KEY ([GraphID])
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID]),
    CONSTRAINT [FK_GraphConcept_Parent] FOREIGN KEY ([ParentID])
        REFERENCES [${flyway:defaultSchema}].[GraphConcept]([ID]),
    CONSTRAINT [FK_GraphConcept_GraphConceptType] FOREIGN KEY ([ConceptTypeID])
        REFERENCES [${flyway:defaultSchema}].[GraphConceptType]([ID]),
    CONSTRAINT [FK_GraphConcept_GraphAuthorityTier] FOREIGN KEY ([AuthorityTierID])
        REFERENCES [${flyway:defaultSchema}].[GraphAuthorityTier]([ID]),
    CONSTRAINT [UQ_GraphConcept_GraphID_Name] UNIQUE ([GraphID], [Name]),
    CONSTRAINT [CK_GraphConcept_NoSelfParent] CHECK ([ParentID] <> [ID]),
    CONSTRAINT [CK_GraphConcept_Status] CHECK ([Status] IN (N'Draft', N'Proposed', N'Approved', N'Deprecated'))
);
GO

-- -------------------------------------------------------------------------------------
-- 10. ContentSource.GraphID
-- -------------------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[ContentSource]
    ADD [GraphID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_ContentSource_Graph] FOREIGN KEY
        REFERENCES [${flyway:defaultSchema}].[Graph]([ID])
        ON DELETE SET NULL;
GO

-- -------------------------------------------------------------------------------------
-- 11. Extended properties (Table & Column descriptions)
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
    @value = N'Configurable semantic concept classifications (such as Policy, Metric, Process, Role, Domain, or Term) with rank ordering and classification guidance, seeded via metadata and extensible per organization.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique name of the concept type (e.g., Policy, Metric, Process, Role, Domain, Term).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConceptType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Plain-language definition and classification guidance describing what qualifies as a concept of this type.',
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

-- GraphAuthorityTier
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Configurable evidentiary authority tiers (such as Governing Charter / Bylaws, Board Policy, Executive SOP, Department Practice, Reference, or Inferred) with numeric precedence weight (Rank) used for Canon conflict resolution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphAuthorityTier';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique display name of the authority tier (e.g., Bylaws, Board Policy, Executive SOP, Department Practice, Reference, Inferred).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphAuthorityTier',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Plain-language description of what sources belong to this authority tier and how conflicts involving this tier should be resolved.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphAuthorityTier',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Numeric evidentiary precedence weight of the authority tier (higher numbers outrank lower numbers during conflict resolution, e.g., 100 for Bylaws vs 20 for Reference).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphAuthorityTier',
    @level2type = N'COLUMN', @level2name = N'Rank';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Optional Font Awesome CSS icon class used to render authority tier badges in the UI.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphAuthorityTier',
    @level2type = N'COLUMN', @level2name = N'IconClass';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Operational status of the authority tier (Active or Inactive).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphAuthorityTier',
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
    @value = N'Higher-level semantic concept nodes scoped to a Graph (referencing GraphConceptType and GraphAuthorityTier), serving as organizing hubs for Canon governance and Content Source GraphRAG overlays.',
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
    @value = N'Optional foreign key to GraphAuthorityTier indicating the highest evidentiary authority tier backing this concept.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'GraphConcept',
    @level2type = N'COLUMN', @level2name = N'AuthorityTierID';

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
-- =============================================================================

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
         '2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d',
         'MJ: Graph Concepts',
         'Graph Concepts',
         'Higher-level semantic concept nodes scoped to a Graph (referencing GraphConceptType and GraphAuthorityTier), serving as organizing hubs for Canon governance and Content Source GraphRAG overlays.',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Concepts for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concepts for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concepts for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2cc24f2c-6c7c-4ec8-bda7-3fdbbec4535d' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'c52b0468-a653-49ad-9fc6-097d7374e803',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c52b0468-a653-49ad-9fc6-097d7374e803', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c52b0468-a653-49ad-9fc6-097d7374e803' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c52b0468-a653-49ad-9fc6-097d7374e803' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c52b0468-a653-49ad-9fc6-097d7374e803' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c52b0468-a653-49ad-9fc6-097d7374e803' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c52b0468-a653-49ad-9fc6-097d7374e803' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c52b0468-a653-49ad-9fc6-097d7374e803' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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
         'db47217b-e302-43aa-baf0-1b53a26dbc67',
         'MJ: Graph Concept Types',
         'Graph Concept Types',
         'Configurable semantic concept classifications (such as Policy, Metric, Process, Role, Domain, or Term) with rank ordering and classification guidance, seeded via metadata and extensible per organization.',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'db47217b-e302-43aa-baf0-1b53a26dbc67', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Concept Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('db47217b-e302-43aa-baf0-1b53a26dbc67' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('db47217b-e302-43aa-baf0-1b53a26dbc67' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concept Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('db47217b-e302-43aa-baf0-1b53a26dbc67' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('db47217b-e302-43aa-baf0-1b53a26dbc67' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Concept Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('db47217b-e302-43aa-baf0-1b53a26dbc67' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('db47217b-e302-43aa-baf0-1b53a26dbc67' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Graph Authority Tiers */

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
         '4e40bd04-842d-4cae-841d-d69dec4b17e9',
         'MJ: Graph Authority Tiers',
         'Graph Authority Tiers',
         'Configurable evidentiary authority tiers (such as Governing Charter / Bylaws, Board Policy, Executive SOP, Department Practice, Reference, or Inferred) with numeric precedence weight (Rank) used for Canon conflict resolution.',
         NULL,
         'GraphAuthorityTier',
         'vwGraphAuthorityTiers',
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

/* SQL generated to add entity MJ: Graph Authority Tiers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4e40bd04-842d-4cae-841d-d69dec4b17e9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Authority Tiers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4e40bd04-842d-4cae-841d-d69dec4b17e9' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4e40bd04-842d-4cae-841d-d69dec4b17e9' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Authority Tiers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4e40bd04-842d-4cae-841d-d69dec4b17e9' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4e40bd04-842d-4cae-841d-d69dec4b17e9' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Authority Tiers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('4e40bd04-842d-4cae-841d-d69dec4b17e9' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('4e40bd04-842d-4cae-841d-d69dec4b17e9' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '1a487757-9198-4346-85ce-8a5374e82fe9',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '1a487757-9198-4346-85ce-8a5374e82fe9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graphs for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1a487757-9198-4346-85ce-8a5374e82fe9' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1a487757-9198-4346-85ce-8a5374e82fe9' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graphs for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1a487757-9198-4346-85ce-8a5374e82fe9' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1a487757-9198-4346-85ce-8a5374e82fe9' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graphs for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('1a487757-9198-4346-85ce-8a5374e82fe9' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('1a487757-9198-4346-85ce-8a5374e82fe9' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '9f985fc5-8db9-4bba-8ea4-b0af90a76f3d',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '9f985fc5-8db9-4bba-8ea4-b0af90a76f3d', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9f985fc5-8db9-4bba-8ea4-b0af90a76f3d' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9f985fc5-8db9-4bba-8ea4-b0af90a76f3d' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9f985fc5-8db9-4bba-8ea4-b0af90a76f3d' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9f985fc5-8db9-4bba-8ea4-b0af90a76f3d' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Types for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('9f985fc5-8db9-4bba-8ea4-b0af90a76f3d' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('9f985fc5-8db9-4bba-8ea4-b0af90a76f3d' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '11579cd9-246e-416f-8915-61cf7b77842f',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '11579cd9-246e-416f-8915-61cf7b77842f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('11579cd9-246e-416f-8915-61cf7b77842f' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('11579cd9-246e-416f-8915-61cf7b77842f' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('11579cd9-246e-416f-8915-61cf7b77842f' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('11579cd9-246e-416f-8915-61cf7b77842f' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Type Endpoints for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('11579cd9-246e-416f-8915-61cf7b77842f' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('11579cd9-246e-416f-8915-61cf7b77842f' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         'c94c4f04-f747-49b8-9c57-aeb656a64592',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c94c4f04-f747-49b8-9c57-aeb656a64592', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c94c4f04-f747-49b8-9c57-aeb656a64592' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c94c4f04-f747-49b8-9c57-aeb656a64592' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c94c4f04-f747-49b8-9c57-aeb656a64592' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c94c4f04-f747-49b8-9c57-aeb656a64592' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edge Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c94c4f04-f747-49b8-9c57-aeb656a64592' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c94c4f04-f747-49b8-9c57-aeb656a64592' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '03bdcb52-1a3a-408a-8079-879493a8598a',
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
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '03bdcb52-1a3a-408a-8079-879493a8598a', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Graph Edges for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('03bdcb52-1a3a-408a-8079-879493a8598a' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('03bdcb52-1a3a-408a-8079-879493a8598a' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edges for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('03bdcb52-1a3a-408a-8079-879493a8598a' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('03bdcb52-1a3a-408a-8079-879493a8598a' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Graph Edges for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('03bdcb52-1a3a-408a-8079-879493a8598a' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('03bdcb52-1a3a-408a-8079-879493a8598a' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

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

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
ALTER TABLE [${flyway:defaultSchema}].[GraphAuthorityTier] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
UPDATE [${flyway:defaultSchema}].[GraphAuthorityTier] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
ALTER TABLE [${flyway:defaultSchema}].[GraphAuthorityTier] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
ALTER TABLE [${flyway:defaultSchema}].[GraphAuthorityTier] ADD CONSTRAINT [DF___mj_GraphAuthorityTier___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
ALTER TABLE [${flyway:defaultSchema}].[GraphAuthorityTier] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
UPDATE [${flyway:defaultSchema}].[GraphAuthorityTier] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
ALTER TABLE [${flyway:defaultSchema}].[GraphAuthorityTier] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.GraphAuthorityTier */
ALTER TABLE [${flyway:defaultSchema}].[GraphAuthorityTier] ADD CONSTRAINT [DF___mj_GraphAuthorityTier___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 88 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c6d9e89-84a7-4e00-885a-961b662fb15b' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = 'ID')) BEGIN
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
            '5c6d9e89-84a7-4e00-885a-961b662fb15b',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3271e508-9035-4e28-8d71-fef5cfff41cf' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = 'Name')) BEGIN
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
            '3271e508-9035-4e28-8d71-fef5cfff41cf',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58866275-5670-4643-9854-95cdcd5c8b32' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = 'Description')) BEGIN
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
            '58866275-5670-4643-9854-95cdcd5c8b32',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bc2c03b-3f9b-41f5-952e-154a5f0aa42f' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = 'IsCanon')) BEGIN
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
            '3bc2c03b-3f9b-41f5-952e-154a5f0aa42f',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd955aabb-ee24-4a96-96f6-deaf35436ada' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = 'Rank')) BEGIN
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
            'd955aabb-ee24-4a96-96f6-deaf35436ada',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f55ae22-8ca5-4c9e-b8b6-08f666c9b039' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = 'IconClass')) BEGIN
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
            '8f55ae22-8ca5-4c9e-b8b6-08f666c9b039',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca034741-f731-45f2-a880-a69cf5f5bbdc' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = 'Status')) BEGIN
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
            'ca034741-f731-45f2-a880-a69cf5f5bbdc',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aaab2477-0ecf-4428-b16a-1fd8ae55ae0e' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = '__mj_CreatedAt')) BEGIN
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
            'aaab2477-0ecf-4428-b16a-1fd8ae55ae0e',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d0317f9-e676-4edf-bd30-376ead2e9a74' OR (EntityID = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5d0317f9-e676-4edf-bd30-376ead2e9a74',
            'C52B0468-A653-49AD-9FC6-097D7374E803', -- Entity: MJ: Graph Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a263a7e5-60e3-4ba0-a905-f25e167917e8' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = 'ID')) BEGIN
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
            'a263a7e5-60e3-4ba0-a905-f25e167917e8',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '75d1dd74-4fcd-4b8b-8fea-b31b5a87b3ca' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = 'Name')) BEGIN
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
            '75d1dd74-4fcd-4b8b-8fea-b31b5a87b3ca',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '46a0c7cd-b845-455b-8d48-ded4f318c49e' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = 'Description')) BEGIN
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
            '46a0c7cd-b845-455b-8d48-ded4f318c49e',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
            'Description',
            'Description',
            'Plain-language definition and classification guidance describing what qualifies as a concept of this type.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7a9087c1-fd42-4d4d-ae49-77be8c083685' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = 'Rank')) BEGIN
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
            '7a9087c1-fd42-4d4d-ae49-77be8c083685',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '511efc28-99c3-4ce8-be37-a92b3d40454f' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = 'IconClass')) BEGIN
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
            '511efc28-99c3-4ce8-be37-a92b3d40454f',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '307357ef-35ef-432b-bd94-e34869467c76' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = 'Status')) BEGIN
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
            '307357ef-35ef-432b-bd94-e34869467c76',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae8740aa-0084-40fd-8916-b485b855b112' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ae8740aa-0084-40fd-8916-b485b855b112',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd81f9321-e69d-40f3-be98-d7504a5c87b7' OR (EntityID = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'd81f9321-e69d-40f3-be98-d7504a5c87b7',
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67', -- Entity: MJ: Graph Concept Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '444cf878-6da2-44bc-9149-a29ae0592350' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'ID')) BEGIN
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
            '444cf878-6da2-44bc-9149-a29ae0592350',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ed274a84-5c8f-4bb9-9150-1f0271f59690' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'GraphID')) BEGIN
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
            'ed274a84-5c8f-4bb9-9150-1f0271f59690',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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
            '1A487757-9198-4346-85CE-8A5374E82FE9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '50f0d76d-2b82-48e7-b94d-0caad951a3a8' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'ParentID')) BEGIN
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
            '50f0d76d-2b82-48e7-b94d-0caad951a3a8',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f66c886d-42ea-4fc0-87b2-2c1d9e723ba5' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'Name')) BEGIN
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
            'f66c886d-42ea-4fc0-87b2-2c1d9e723ba5',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf7c02ac-ed11-4d8e-a4ce-8e7528d1c2d1' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'ConceptTypeID')) BEGIN
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
            'cf7c02ac-ed11-4d8e-a4ce-8e7528d1c2d1',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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
            'DB47217B-E302-43AA-BAF0-1B53A26DBC67',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c5f78eeb-7770-4947-bd75-73ea8bdfe29a' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'AuthorityTierID')) BEGIN
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
            'c5f78eeb-7770-4947-bd75-73ea8bdfe29a',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
            'AuthorityTierID',
            'Authority Tier ID',
            'Optional foreign key to GraphAuthorityTier indicating the highest evidentiary authority tier backing this concept.',
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
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '727e0744-d1de-418a-a44d-9952161ce2ff' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'Description')) BEGIN
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
            '727e0744-d1de-418a-a44d-9952161ce2ff',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '565a8b0c-adce-4c76-8e8e-50b1aafb1eeb' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'Specification')) BEGIN
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
            '565a8b0c-adce-4c76-8e8e-50b1aafb1eeb',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '287d0784-476d-4abb-9439-fa3f40a16923' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'Synonyms')) BEGIN
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
            '287d0784-476d-4abb-9439-fa3f40a16923',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca124920-b79d-4d01-bb93-c3e46a8e7dac' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'Status')) BEGIN
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
            'ca124920-b79d-4d01-bb93-c3e46a8e7dac',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e276bc6-3a98-4cd9-b524-c8afdab349bd' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = '__mj_CreatedAt')) BEGIN
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
            '7e276bc6-3a98-4cd9-b524-c8afdab349bd',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58de7243-882e-47b6-9686-4f0ec01bd16b' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '58de7243-882e-47b6-9686-4f0ec01bd16b',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e0edcb80-4902-4199-8f46-c17809719f57' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = 'ID')) BEGIN
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
            'e0edcb80-4902-4199-8f46-c17809719f57',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '172e3c4c-7f05-4bab-b4b5-fb8ff09e8979' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = 'EdgeTypeID')) BEGIN
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
            '172e3c4c-7f05-4bab-b4b5-fb8ff09e8979',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7647419c-f104-489f-b81b-ce9e10355457' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = 'Side')) BEGIN
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
            '7647419c-f104-489f-b81b-ce9e10355457',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0159dd8f-4065-49f6-b5be-2c8e6a5c4740' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = 'EntityID')) BEGIN
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
            '0159dd8f-4065-49f6-b5be-2c8e6a5c4740',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35d230e7-8091-48d8-a523-b30c8ce3238a' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = '__mj_CreatedAt')) BEGIN
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
            '35d230e7-8091-48d8-a523-b30c8ce3238a',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eb4b4cbb-79ba-4ff3-91be-e8b6e50fd5ee' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'eb4b4cbb-79ba-4ff3-91be-e8b6e50fd5ee',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '681283db-93de-4fc8-bd03-0c1a749c2e03' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'ID')) BEGIN
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
            '681283db-93de-4fc8-bd03-0c1a749c2e03',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5bc1f666-bd19-4b25-a790-e4bd6453b4d1' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'GraphID')) BEGIN
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
            '5bc1f666-bd19-4b25-a790-e4bd6453b4d1',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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
            '1A487757-9198-4346-85CE-8A5374E82FE9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '71f90de6-b271-4766-ae0a-adbef67fb35c' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'EdgeTypeID')) BEGIN
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
            '71f90de6-b271-4766-ae0a-adbef67fb35c',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '51c1997c-7bb6-4974-9d43-71fa0c6d0061' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'SourceEntityID')) BEGIN
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
            '51c1997c-7bb6-4974-9d43-71fa0c6d0061',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b6ad65d4-2f89-4dcf-a51e-dcc8f279d829' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'SourceRecordID')) BEGIN
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
            'b6ad65d4-2f89-4dcf-a51e-dcc8f279d829',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c70da047-5a00-4b2e-9c8f-57c09dbca697' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'TargetEntityID')) BEGIN
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
            'c70da047-5a00-4b2e-9c8f-57c09dbca697',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ab5ec93-7de4-4547-9996-1bad159b650b' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'TargetRecordID')) BEGIN
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
            '8ab5ec93-7de4-4547-9996-1bad159b650b',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e7b4ac7-8e53-47b0-b9ec-9740d0805acb' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'Weight')) BEGIN
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
            '4e7b4ac7-8e53-47b0-b9ec-9740d0805acb',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d01d7a0-5b67-4ee6-aea2-f3e72666c6cc' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'Description')) BEGIN
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
            '6d01d7a0-5b67-4ee6-aea2-f3e72666c6cc',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22269d72-cfd8-4b03-bc52-4d094d84c48e' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'Attributes')) BEGIN
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
            '22269d72-cfd8-4b03-bc52-4d094d84c48e',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fbc1e4dc-cf1c-436f-97d4-1f692e41e23c' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'Origin')) BEGIN
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
            'fbc1e4dc-cf1c-436f-97d4-1f692e41e23c',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '453d84d9-2c94-4cb7-bb03-75f83287d5ef' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'Status')) BEGIN
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
            '453d84d9-2c94-4cb7-bb03-75f83287d5ef',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '48065d9d-abb6-4a30-9535-b7fa7d184220' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'Confidence')) BEGIN
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
            '48065d9d-abb6-4a30-9535-b7fa7d184220',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee4d1d8b-60ce-4149-b7ca-2cbc815b3437' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ee4d1d8b-60ce-4149-b7ca-2cbc815b3437',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c436c8c-64b0-4f39-b220-111fc7708bc3' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6c436c8c-64b0-4f39-b220-111fc7708bc3',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8bcc9c7-a5c6-4cf6-8371-a9e7da26a62d' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = 'ID')) BEGIN
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
            'd8bcc9c7-a5c6-4cf6-8371-a9e7da26a62d',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '80c8833b-99d2-4c33-94fb-5f7760fab544' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = 'Name')) BEGIN
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
            '80c8833b-99d2-4c33-94fb-5f7760fab544',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '178f0caf-38e3-48cc-a27b-94124854103e' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = 'Description')) BEGIN
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
            '178f0caf-38e3-48cc-a27b-94124854103e',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1feaf1fa-15cc-4eef-a8f1-34e26d866bb2' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = 'GraphTypeID')) BEGIN
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
            '1feaf1fa-15cc-4eef-a8f1-34e26d866bb2',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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
            'C52B0468-A653-49AD-9FC6-097D7374E803',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fda02c37-6976-4397-8103-a917b8a15329' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = 'LoadMode')) BEGIN
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
            'fda02c37-6976-4397-8103-a917b8a15329',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f75f00b6-83a3-4e5a-8268-0894d18793de' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = 'Status')) BEGIN
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
            'f75f00b6-83a3-4e5a-8268-0894d18793de',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0c83031-9f58-4879-a363-9873a8f4d9c4' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = '__mj_CreatedAt')) BEGIN
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
            'c0c83031-9f58-4879-a363-9873a8f4d9c4',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1682d007-6f0e-4645-ac4e-948e71639ccd' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '1682d007-6f0e-4645-ac4e-948e71639ccd',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ffabdb23-0d95-40a7-b185-e264e03dd071' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'ID')) BEGIN
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
            'ffabdb23-0d95-40a7-b185-e264e03dd071',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c6398dd0-47cd-4174-a515-dc6b41cc53e0' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'GraphID')) BEGIN
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
            'c6398dd0-47cd-4174-a515-dc6b41cc53e0',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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
            '1A487757-9198-4346-85CE-8A5374E82FE9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b9b113f-c921-433a-bd67-c84831ebfb9b' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'Name')) BEGIN
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
            '7b9b113f-c921-433a-bd67-c84831ebfb9b',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b65335d-1cb3-43d0-a804-d2fc41a30a79' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'Description')) BEGIN
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
            '9b65335d-1cb3-43d0-a804-d2fc41a30a79',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '468d1ac7-3f23-4c43-bd9e-d2bc79b27a8e' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'DriverClass')) BEGIN
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
            '468d1ac7-3f23-4c43-bd9e-d2bc79b27a8e',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3bc10725-5cc8-4f8a-a8ff-c79856539be3' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'Configuration')) BEGIN
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
            '3bc10725-5cc8-4f8a-a8ff-c79856539be3',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c054b96-ee4f-4d12-8deb-6e615d19aad1' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'Sequence')) BEGIN
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
            '4c054b96-ee4f-4d12-8deb-6e615d19aad1',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94c9ba20-6190-410e-965c-3504bdfffc9f' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'IsActive')) BEGIN
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
            '94c9ba20-6190-410e-965c-3504bdfffc9f',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc3fc749-cf4d-4cfa-937f-397d7386449d' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = '__mj_CreatedAt')) BEGIN
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
            'bc3fc749-cf4d-4cfa-937f-397d7386449d',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85b73efd-e611-43f6-b08a-87b67457a334' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '85b73efd-e611-43f6-b08a-87b67457a334',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57a3d91a-61bc-4cab-aa24-5b55da4c4de6' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'ID')) BEGIN
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
            '57a3d91a-61bc-4cab-aa24-5b55da4c4de6',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e234a638-91c1-4481-99b6-0784323bab1f' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'GraphID')) BEGIN
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
            'e234a638-91c1-4481-99b6-0784323bab1f',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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
            '1A487757-9198-4346-85CE-8A5374E82FE9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c2d1e68d-c7db-4c12-b2af-5c7f20ccc619' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'Name')) BEGIN
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
            'c2d1e68d-c7db-4c12-b2af-5c7f20ccc619',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b4f26391-d60c-47c3-8f11-1e5513b1fb64' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'Description')) BEGIN
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
            'b4f26391-d60c-47c3-8f11-1e5513b1fb64',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd7f7264-7746-4ce9-b96d-8451454014f3' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'IsDirected')) BEGIN
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
            'dd7f7264-7746-4ce9-b96d-8451454014f3',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '089f9479-c981-400d-b4e9-23f671e34504' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'InverseName')) BEGIN
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
            '089f9479-c981-400d-b4e9-23f671e34504',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1a4a59b-a3a6-4a44-80d8-8e50d497e989' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'DefaultWeight')) BEGIN
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
            'd1a4a59b-a3a6-4a44-80d8-8e50d497e989',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e27c91e4-acaa-4515-90a9-b743cde57e38' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'AllowStored')) BEGIN
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
            'e27c91e4-acaa-4515-90a9-b743cde57e38',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4e45a26a-e70c-4c53-af4c-3309b560b07c' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = '__mj_CreatedAt')) BEGIN
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
            '4e45a26a-e70c-4c53-af4c-3309b560b07c',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e9b24893-7a66-4e9d-b8bb-b0c1356d6632' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'e9b24893-7a66-4e9d-b8bb-b0c1356d6632',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7b2727fe-62c6-4fd6-9f81-5fd48611bf31' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'GraphID')) BEGIN
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
            '7b2727fe-62c6-4fd6-9f81-5fd48611bf31',
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
            '1A487757-9198-4346-85CE-8A5374E82FE9',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9f475421-56c3-4532-bc14-42cd957777ac' OR (EntityID = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND Name = 'Graph')) BEGIN
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
            '9f475421-56c3-4532-bc14-42cd957777ac',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dd3983fb-1ea4-427d-9a62-0e1ac6a83ce0' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = 'ID')) BEGIN
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
            'dd3983fb-1ea4-427d-9a62-0e1ac6a83ce0',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'eda121cf-c655-4927-8d62-e83dd9fcb012' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = 'Name')) BEGIN
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
            'eda121cf-c655-4927-8d62-e83dd9fcb012',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
            'Name',
            'Name',
            'Unique display name of the authority tier (e.g., Bylaws, Board Policy, Executive SOP, Department Practice, Reference, Inferred).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '94ac1a2e-42aa-48a0-a3b8-d637468dc435' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = 'Description')) BEGIN
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
            '94ac1a2e-42aa-48a0-a3b8-d637468dc435',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
            'Description',
            'Description',
            'Plain-language description of what sources belong to this authority tier and how conflicts involving this tier should be resolved.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '544caa44-e047-4a15-ab68-e8842cf9b502' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = 'Rank')) BEGIN
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
            '544caa44-e047-4a15-ab68-e8842cf9b502',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
            'Rank',
            'Rank',
            'Numeric evidentiary precedence weight of the authority tier (higher numbers outrank lower numbers during conflict resolution, e.g., 100 for Bylaws vs 20 for Reference).',
            'int',
            4,
            10,
            0,
            0,
            '(20)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '561773d6-8075-4776-bcea-0741ee818bca' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = 'IconClass')) BEGIN
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
            '561773d6-8075-4776-bcea-0741ee818bca',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
            'IconClass',
            'Icon Class',
            'Optional Font Awesome CSS icon class used to render authority tier badges in the UI.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '67415ea4-0087-46c3-b76a-594bdfbe0a46' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = 'Status')) BEGIN
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
            '67415ea4-0087-46c3-b76a-594bdfbe0a46',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
            'Status',
            'Status',
            'Operational status of the authority tier (Active or Inactive).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1742c315-9c3a-4805-bc52-b5b58ee426eb' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = '__mj_CreatedAt')) BEGIN
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
            '1742c315-9c3a-4805-bc52-b5b58ee426eb',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bf03ba60-888e-45e9-8316-6dcecd23c5f1' OR (EntityID = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'bf03ba60-888e-45e9-8316-6dcecd23c5f1',
            '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', -- Entity: MJ: Graph Authority Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9'),
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

/* SQL text to insert entity field value with ID 3abe1862-1635-4bc5-a950-a9bd3bc0b489 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3abe1862-1635-4bc5-a950-a9bd3bc0b489', '453D84D9-2C94-4CB7-BB03-75F83287D5EF', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 343db4eb-18e8-4a00-8c2d-e0c0c5f922e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('343db4eb-18e8-4a00-8c2d-e0c0c5f922e0', '453D84D9-2C94-4CB7-BB03-75F83287D5EF', 2, 'Proposed', 'Proposed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ddc70dbe-7a9a-4aab-bc4b-52ee33d0c080 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ddc70dbe-7a9a-4aab-bc4b-52ee33d0c080', '453D84D9-2C94-4CB7-BB03-75F83287D5EF', 3, 'Rejected', 'Rejected', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 453D84D9-2C94-4CB7-BB03-75F83287D5EF */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='453D84D9-2C94-4CB7-BB03-75F83287D5EF';

/* SQL text to insert entity field value with ID 99a6419b-9d38-4020-b192-7e7a2b80e338 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('99a6419b-9d38-4020-b192-7e7a2b80e338', 'CA124920-B79D-4D01-BB93-C3E46A8E7DAC', 1, 'Approved', 'Approved', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1f2d8ddd-5793-4abb-a708-47fb78cbb12f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1f2d8ddd-5793-4abb-a708-47fb78cbb12f', 'CA124920-B79D-4D01-BB93-C3E46A8E7DAC', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 13b4643c-58a2-4414-a11f-e63a174326fa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('13b4643c-58a2-4414-a11f-e63a174326fa', 'CA124920-B79D-4D01-BB93-C3E46A8E7DAC', 3, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 52823e96-92bf-40a0-a527-04980139f133 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('52823e96-92bf-40a0-a527-04980139f133', 'CA124920-B79D-4D01-BB93-C3E46A8E7DAC', 4, 'Proposed', 'Proposed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CA124920-B79D-4D01-BB93-C3E46A8E7DAC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CA124920-B79D-4D01-BB93-C3E46A8E7DAC';

/* SQL text to insert entity field value with ID 54bd9e84-e1c9-4961-a6cc-6187e2215dc1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('54bd9e84-e1c9-4961-a6cc-6187e2215dc1', 'CA034741-F731-45F2-A880-A69CF5F5BBDC', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4b71c67b-eef1-4a19-8cd9-5dcdffdfe664 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4b71c67b-eef1-4a19-8cd9-5dcdffdfe664', 'CA034741-F731-45F2-A880-A69CF5F5BBDC', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CA034741-F731-45F2-A880-A69CF5F5BBDC */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='CA034741-F731-45F2-A880-A69CF5F5BBDC';

/* SQL text to insert entity field value with ID c5115103-44e7-48ae-8664-ac507249d2ba */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c5115103-44e7-48ae-8664-ac507249d2ba', '307357EF-35EF-432B-BD94-E34869467C76', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6c8ebba7-5085-4426-8cfd-d18cbdad0362 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6c8ebba7-5085-4426-8cfd-d18cbdad0362', '307357EF-35EF-432B-BD94-E34869467C76', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 307357EF-35EF-432B-BD94-E34869467C76 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='307357EF-35EF-432B-BD94-E34869467C76';

/* SQL text to insert entity field value with ID 47ab675b-4d82-4762-80d8-fa4158b0b19e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('47ab675b-4d82-4762-80d8-fa4158b0b19e', '67415EA4-0087-46C3-B76A-594BDFBE0A46', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 2ef63bb6-3bd9-4577-bc6d-04b84ede4d9e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('2ef63bb6-3bd9-4577-bc6d-04b84ede4d9e', '67415EA4-0087-46C3-B76A-594BDFBE0A46', 2, 'Inactive', 'Inactive', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 67415EA4-0087-46C3-B76A-594BDFBE0A46 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='67415EA4-0087-46C3-B76A-594BDFBE0A46';

/* SQL text to insert entity field value with ID 5808c7d4-8039-44f3-b9d9-e3c5f2ca7531 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5808c7d4-8039-44f3-b9d9-e3c5f2ca7531', 'FDA02C37-6976-4397-8103-A917B8A15329', 1, 'OnDemand', 'OnDemand', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7e8fb011-85c5-4eed-ac0d-00dc5ee034aa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7e8fb011-85c5-4eed-ac0d-00dc5ee034aa', 'FDA02C37-6976-4397-8103-A917B8A15329', 2, 'Preload', 'Preload', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FDA02C37-6976-4397-8103-A917B8A15329 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FDA02C37-6976-4397-8103-A917B8A15329';

/* SQL text to insert entity field value with ID 6fa73429-651f-46ed-8536-88af735182bb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6fa73429-651f-46ed-8536-88af735182bb', 'F75F00B6-83A3-4E5A-8268-0894D18793DE', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 71c61e73-ad41-47a3-bf1c-2066be43b4c2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('71c61e73-ad41-47a3-bf1c-2066be43b4c2', 'F75F00B6-83A3-4E5A-8268-0894D18793DE', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F75F00B6-83A3-4E5A-8268-0894D18793DE */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F75F00B6-83A3-4E5A-8268-0894D18793DE';

/* SQL text to insert entity field value with ID cd1f23c8-2873-40a8-8991-a729927b201f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('cd1f23c8-2873-40a8-8991-a729927b201f', '7647419C-F104-489F-B81B-CE9E10355457', 1, 'Source', 'Source', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b4553ad6-9484-4b3e-b710-cffb47c3a45a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b4553ad6-9484-4b3e-b710-cffb47c3a45a', '7647419C-F104-489F-B81B-CE9E10355457', 2, 'Target', 'Target', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7647419C-F104-489F-B81B-CE9E10355457 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='7647419C-F104-489F-B81B-CE9E10355457';

/* SQL text to insert entity field value with ID 0bc0be89-d2c9-48b7-b572-f4decd31afd5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0bc0be89-d2c9-48b7-b572-f4decd31afd5', 'FBC1E4DC-CF1C-436F-97D4-1F692E41E23C', 1, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 4b2ba50f-8468-48e8-8e03-a9711f370eab */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4b2ba50f-8468-48e8-8e03-a9711f370eab', 'FBC1E4DC-CF1C-436F-97D4-1F692E41E23C', 2, 'Inferred', 'Inferred', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID FBC1E4DC-CF1C-436F-97D4-1F692E41E23C */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FBC1E4DC-CF1C-436F-97D4-1F692E41E23C';

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


/* Create Entity Relationship: MJ: Graph Types -> MJ: Graphs (One To Many via GraphTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '2b72775d-f181-45b5-920f-9fa4dfc50a93' OR ([EntityID] = 'C52B0468-A653-49AD-9FC6-097D7374E803' AND [RelatedEntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9' AND [RelatedEntityJoinField] = 'GraphTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2b72775d-f181-45b5-920f-9fa4dfc50a93', 'C52B0468-A653-49AD-9FC6-097D7374E803', '1A487757-9198-4346-85CE-8A5374E82FE9', 'GraphTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Concept Types -> MJ: Graph Concepts (One To Many via ConceptTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f65d1769-916c-4101-862e-e9820c6459b7' OR ([EntityID] = 'DB47217B-E302-43AA-BAF0-1B53A26DBC67' AND [RelatedEntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND [RelatedEntityJoinField] = 'ConceptTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f65d1769-916c-4101-862e-e9820c6459b7', 'DB47217B-E302-43AA-BAF0-1B53A26DBC67', '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', 'ConceptTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Concepts -> MJ: Graph Concepts (One To Many via ParentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ad389285-4710-41bb-b899-5671008617db' OR ([EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND [RelatedEntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND [RelatedEntityJoinField] = 'ParentID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ad389285-4710-41bb-b899-5671008617db', '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', 'ParentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edge Type Endpoints (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'aeb97b21-8c42-4352-b6aa-0f0fef64814b' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '11579CD9-246E-416F-8915-61CF7B77842F' AND [RelatedEntityJoinField] = 'EntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('aeb97b21-8c42-4352-b6aa-0f0fef64814b', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '11579CD9-246E-416F-8915-61CF7B77842F', 'EntityID', 'One To Many', 1, 1, 90, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edges (One To Many via SourceEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bea05ef8-98c3-417a-8e81-f50c9e18050d' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A' AND [RelatedEntityJoinField] = 'SourceEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bea05ef8-98c3-417a-8e81-f50c9e18050d', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '03BDCB52-1A3A-408A-8079-879493A8598A', 'SourceEntityID', 'One To Many', 1, 1, 91, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Entities -> MJ: Graph Edges (One To Many via TargetEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '78e92eeb-ca39-4a43-a717-a8c0d1f78360' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A' AND [RelatedEntityJoinField] = 'TargetEntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('78e92eeb-ca39-4a43-a717-a8c0d1f78360', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '03BDCB52-1A3A-408A-8079-879493A8598A', 'TargetEntityID', 'One To Many', 1, 1, 92, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Concepts (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '4e498755-4980-4595-9e4e-58aba3895e02' OR ([EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9' AND [RelatedEntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4e498755-4980-4595-9e4e-58aba3895e02', '1A487757-9198-4346-85CE-8A5374E82FE9', '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', 'GraphID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edges (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'd8e0b352-0f40-4471-a18c-51acfe7d2195' OR ([EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9' AND [RelatedEntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('d8e0b352-0f40-4471-a18c-51acfe7d2195', '1A487757-9198-4346-85CE-8A5374E82FE9', '03BDCB52-1A3A-408A-8079-879493A8598A', 'GraphID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edge Providers (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '8c62c177-d7e3-4575-aa89-d767f65e4f7e' OR ([EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9' AND [RelatedEntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8c62c177-d7e3-4575-aa89-d767f65e4f7e', '1A487757-9198-4346-85CE-8A5374E82FE9', 'C94C4F04-F747-49B8-9C57-AEB656A64592', 'GraphID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graphs -> MJ: Graph Edge Types (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '50b8a205-0fc3-4984-ab2b-6bb14e156b4a' OR ([EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9' AND [RelatedEntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('50b8a205-0fc3-4984-ab2b-6bb14e156b4a', '1A487757-9198-4346-85CE-8A5374E82FE9', '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', 'GraphID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graphs -> MJ: Content Sources (One To Many via GraphID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'dd8ea11b-0d4c-4b65-8ff4-4d7e561bfd04' OR ([EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9' AND [RelatedEntityID] = 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22' AND [RelatedEntityJoinField] = 'GraphID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dd8ea11b-0d4c-4b65-8ff4-4d7e561bfd04', '1A487757-9198-4346-85CE-8A5374E82FE9', 'B420FF22-0E66-EF11-A752-C0A5E8ACCB22', 'GraphID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Edge Types -> MJ: Graph Edge Type Endpoints (One To Many via EdgeTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '92ae062a-8630-4dbd-b35b-b064af19fc61' OR ([EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND [RelatedEntityID] = '11579CD9-246E-416F-8915-61CF7B77842F' AND [RelatedEntityJoinField] = 'EdgeTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('92ae062a-8630-4dbd-b35b-b064af19fc61', '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', '11579CD9-246E-416F-8915-61CF7B77842F', 'EdgeTypeID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Graph Edge Types -> MJ: Graph Edges (One To Many via EdgeTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3e252a75-607d-4367-a7ef-71f9a82d01dc' OR ([EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND [RelatedEntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A' AND [RelatedEntityJoinField] = 'EdgeTypeID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3e252a75-607d-4367-a7ef-71f9a82d01dc', '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', '03BDCB52-1A3A-408A-8079-879493A8598A', 'EdgeTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Graph Authority Tiers -> MJ: Graph Concepts (One To Many via AuthorityTierID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6ad8e7c8-ad7b-4293-9cfe-7ff16d29a33e' OR ([EntityID] = '4E40BD04-842D-4CAE-841D-D69DEC4B17E9' AND [RelatedEntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND [RelatedEntityJoinField] = 'AuthorityTierID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6ad8e7c8-ad7b-4293-9cfe-7ff16d29a33e', '4E40BD04-842D-4CAE-841D-D69DEC4B17E9', '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', 'AuthorityTierID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 7B2727FE-62C6-4FD6-9F81-5FD48611BF31 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7B2727FE-62C6-4FD6-9F81-5FD48611BF31', @RelatedEntityNameFieldMap='Graph';

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

/* Index for Foreign Keys for GraphAuthorityTier */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Authority Tiers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

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

-- Index for foreign key AuthorityTierID in table GraphConcept
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GraphConcept_AuthorityTierID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[GraphConcept]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GraphConcept_AuthorityTierID ON [${flyway:defaultSchema}].[GraphConcept] ([AuthorityTierID]);

/* SQL text to update entity field related entity name field map for entity field ID ED274A84-5C8F-4BB9-9150-1F0271F59690 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ED274A84-5C8F-4BB9-9150-1F0271F59690', @RelatedEntityNameFieldMap='Graph';

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

/* SQL text to update entity field related entity name field map for entity field ID C6398DD0-47CD-4174-A515-DC6B41CC53E0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C6398DD0-47CD-4174-A515-DC6B41CC53E0', @RelatedEntityNameFieldMap='Graph';

/* Base View SQL for MJ: Graph Authority Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Authority Tiers
-- Item: vwGraphAuthorityTiers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Graph Authority Tiers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  GraphAuthorityTier
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwGraphAuthorityTiers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwGraphAuthorityTiers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwGraphAuthorityTiers]
AS
SELECT
    g.*
FROM
    [${flyway:defaultSchema}].[GraphAuthorityTier] AS g
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphAuthorityTiers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Graph Authority Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Authority Tiers
-- Item: Permissions for vwGraphAuthorityTiers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwGraphAuthorityTiers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Graph Authority Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Authority Tiers
-- Item: spCreateGraphAuthorityTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GraphAuthorityTier
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateGraphAuthorityTier]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateGraphAuthorityTier];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateGraphAuthorityTier]
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
        INSERT INTO [${flyway:defaultSchema}].[GraphAuthorityTier]
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
                ISNULL(@Rank, 20),
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[GraphAuthorityTier]
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
                ISNULL(@Rank, 20),
                CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, NULL) END,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwGraphAuthorityTiers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphAuthorityTier] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Graph Authority Tiers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateGraphAuthorityTier] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Graph Authority Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Authority Tiers
-- Item: spUpdateGraphAuthorityTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GraphAuthorityTier
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateGraphAuthorityTier]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphAuthorityTier];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateGraphAuthorityTier]
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
        [${flyway:defaultSchema}].[GraphAuthorityTier]
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwGraphAuthorityTiers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwGraphAuthorityTiers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphAuthorityTier] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GraphAuthorityTier table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateGraphAuthorityTier]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateGraphAuthorityTier];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateGraphAuthorityTier
ON [${flyway:defaultSchema}].[GraphAuthorityTier]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[GraphAuthorityTier]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[GraphAuthorityTier] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Graph Authority Tiers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateGraphAuthorityTier] TO [cdp_Developer], [cdp_Integration];

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

/* spDelete SQL for MJ: Graph Authority Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Graph Authority Tiers
-- Item: spDeleteGraphAuthorityTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GraphAuthorityTier
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteGraphAuthorityTier]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphAuthorityTier];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteGraphAuthorityTier]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[GraphAuthorityTier]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphAuthorityTier] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Graph Authority Tiers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteGraphAuthorityTier] TO [cdp_Developer], [cdp_Integration];

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

/* SQL text to update entity field related entity name field map for entity field ID 50F0D76D-2B82-48E7-B94D-0CAAD951A3A8 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='50F0D76D-2B82-48E7-B94D-0CAAD951A3A8', @RelatedEntityNameFieldMap='Parent';

/* SQL text to update entity field related entity name field map for entity field ID CF7C02AC-ED11-4D8E-A4CE-8E7528D1C2D1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='CF7C02AC-ED11-4D8E-A4CE-8E7528D1C2D1', @RelatedEntityNameFieldMap='ConceptType';

/* SQL text to update entity field related entity name field map for entity field ID C5F78EEB-7770-4947-BD75-73EA8BDFE29A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C5F78EEB-7770-4947-BD75-73EA8BDFE29A', @RelatedEntityNameFieldMap='AuthorityTier';

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
    MJGraphConceptType_ConceptTypeID.[Name] AS [ConceptType],
    MJGraphAuthorityTier_AuthorityTierID.[Name] AS [AuthorityTier]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[GraphAuthorityTier] AS MJGraphAuthorityTier_AuthorityTierID
  ON
    [g].[AuthorityTierID] = MJGraphAuthorityTier_AuthorityTierID.[ID]
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
    @AuthorityTierID_Clear bit = 0,
    @AuthorityTierID uniqueidentifier = NULL,
    @Description nvarchar(MAX),
    @Specification_Clear bit = 0,
    @Specification nvarchar(MAX) = NULL,
    @Synonyms_Clear bit = 0,
    @Synonyms nvarchar(MAX) = NULL,
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
                [AuthorityTierID],
                [Description],
                [Specification],
                [Synonyms],
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
                CASE WHEN @AuthorityTierID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorityTierID, NULL) END,
                @Description,
                CASE WHEN @Specification_Clear = 1 THEN NULL ELSE ISNULL(@Specification, NULL) END,
                CASE WHEN @Synonyms_Clear = 1 THEN NULL ELSE ISNULL(@Synonyms, NULL) END,
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
                [AuthorityTierID],
                [Description],
                [Specification],
                [Synonyms],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @GraphID,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                @Name,
                @ConceptTypeID,
                CASE WHEN @AuthorityTierID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorityTierID, NULL) END,
                @Description,
                CASE WHEN @Specification_Clear = 1 THEN NULL ELSE ISNULL(@Specification, NULL) END,
                CASE WHEN @Synonyms_Clear = 1 THEN NULL ELSE ISNULL(@Synonyms, NULL) END,
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
    @AuthorityTierID_Clear bit = 0,
    @AuthorityTierID uniqueidentifier = NULL,
    @Description nvarchar(MAX) = NULL,
    @Specification_Clear bit = 0,
    @Specification nvarchar(MAX) = NULL,
    @Synonyms_Clear bit = 0,
    @Synonyms nvarchar(MAX) = NULL,
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
        [AuthorityTierID] = CASE WHEN @AuthorityTierID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorityTierID, [AuthorityTierID]) END,
        [Description] = ISNULL(@Description, [Description]),
        [Specification] = CASE WHEN @Specification_Clear = 1 THEN NULL ELSE ISNULL(@Specification, [Specification]) END,
        [Synonyms] = CASE WHEN @Synonyms_Clear = 1 THEN NULL ELSE ISNULL(@Synonyms, [Synonyms]) END,
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

/* SQL text to update entity field related entity name field map for entity field ID 172E3C4C-7F05-4BAB-B4B5-FB8FF09E8979 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='172E3C4C-7F05-4BAB-B4B5-FB8FF09E8979', @RelatedEntityNameFieldMap='EdgeType';

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

/* SQL text to update entity field related entity name field map for entity field ID E234A638-91C1-4481-99B6-0784323BAB1F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E234A638-91C1-4481-99B6-0784323BAB1F', @RelatedEntityNameFieldMap='Graph';

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

/* SQL text to update entity field related entity name field map for entity field ID 5BC1F666-BD19-4B25-A790-E4BD6453B4D1 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5BC1F666-BD19-4B25-A790-E4BD6453B4D1', @RelatedEntityNameFieldMap='Graph';

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

/* SQL text to update entity field related entity name field map for entity field ID 1FEAF1FA-15CC-4EEF-A8F1-34E26D866BB2 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1FEAF1FA-15CC-4EEF-A8F1-34E26D866BB2', @RelatedEntityNameFieldMap='GraphType';

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

/* SQL text to update entity field related entity name field map for entity field ID 0159DD8F-4065-49F6-B5BE-2C8E6A5C4740 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0159DD8F-4065-49F6-B5BE-2C8E6A5C4740', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 71F90DE6-B271-4766-AE0A-ADBEF67FB35C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='71F90DE6-B271-4766-AE0A-ADBEF67FB35C', @RelatedEntityNameFieldMap='EdgeType';

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

/* SQL text to update entity field related entity name field map for entity field ID 51C1997C-7BB6-4974-9D43-71FA0C6D0061 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='51C1997C-7BB6-4974-9D43-71FA0C6D0061', @RelatedEntityNameFieldMap='SourceEntity';

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

/* SQL text to update entity field related entity name field map for entity field ID C70DA047-5A00-4B2E-9C8F-57C09DBCA697 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C70DA047-5A00-4B2E-9C8F-57C09DBCA697', @RelatedEntityNameFieldMap='TargetEntity';

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

/* SQL text to insert 13 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f5f1ca12-357d-4853-b920-00b4356993f1' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'Graph')) BEGIN
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
            'f5f1ca12-357d-4853-b920-00b4356993f1',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61eca215-7083-44aa-a2de-da788cbd844c' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'Parent')) BEGIN
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
            '61eca215-7083-44aa-a2de-da788cbd844c',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'df562741-6060-46d1-a518-14224fdb059b' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'ConceptType')) BEGIN
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
            'df562741-6060-46d1-a518-14224fdb059b',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7aa0559e-86b4-4bca-9d05-f7e63ae70399' OR (EntityID = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D' AND Name = 'AuthorityTier')) BEGIN
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
            '7aa0559e-86b4-4bca-9d05-f7e63ae70399',
            '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D', -- Entity: MJ: Graph Concepts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2CC24F2C-6C7C-4EC8-BDA7-3FDBBEC4535D'),
            'AuthorityTier',
            'Authority Tier',
            NULL,
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '840814a6-c9c3-49d0-a361-a19bd99c329a' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = 'EdgeType')) BEGIN
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
            '840814a6-c9c3-49d0-a361-a19bd99c329a',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8f8024e9-c9a5-483f-8f43-88d9a15300ff' OR (EntityID = '11579CD9-246E-416F-8915-61CF7B77842F' AND Name = 'Entity')) BEGIN
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
            '8f8024e9-c9a5-483f-8f43-88d9a15300ff',
            '11579CD9-246E-416F-8915-61CF7B77842F', -- Entity: MJ: Graph Edge Type Endpoints
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '11579CD9-246E-416F-8915-61CF7B77842F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '07e067ec-4290-4a9f-8188-83f1a50590af' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'Graph')) BEGIN
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
            '07e067ec-4290-4a9f-8188-83f1a50590af',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4573eb3f-d264-4714-8c1f-5d60d86c2319' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'EdgeType')) BEGIN
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
            '4573eb3f-d264-4714-8c1f-5d60d86c2319',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0ae5b5c9-e79b-408f-b35a-aed9873693b8' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'SourceEntity')) BEGIN
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
            '0ae5b5c9-e79b-408f-b35a-aed9873693b8',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cf2f785b-26bd-4478-8186-c22e2d7e59fd' OR (EntityID = '03BDCB52-1A3A-408A-8079-879493A8598A' AND Name = 'TargetEntity')) BEGIN
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
            'cf2f785b-26bd-4478-8186-c22e2d7e59fd',
            '03BDCB52-1A3A-408A-8079-879493A8598A', -- Entity: MJ: Graph Edges
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '03BDCB52-1A3A-408A-8079-879493A8598A'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb8e1e46-0798-49b1-a21c-e94061e342a2' OR (EntityID = '1A487757-9198-4346-85CE-8A5374E82FE9' AND Name = 'GraphType')) BEGIN
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
            'cb8e1e46-0798-49b1-a21c-e94061e342a2',
            '1A487757-9198-4346-85CE-8A5374E82FE9', -- Entity: MJ: Graphs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '1A487757-9198-4346-85CE-8A5374E82FE9'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '054ee7a4-a1eb-47bb-9deb-c649392de5c6' OR (EntityID = 'C94C4F04-F747-49B8-9C57-AEB656A64592' AND Name = 'Graph')) BEGIN
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
            '054ee7a4-a1eb-47bb-9deb-c649392de5c6',
            'C94C4F04-F747-49B8-9C57-AEB656A64592', -- Entity: MJ: Graph Edge Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'C94C4F04-F747-49B8-9C57-AEB656A64592'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3904daeb-0a20-422f-a96f-ec6250b71a1b' OR (EntityID = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D' AND Name = 'Graph')) BEGIN
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
            '3904daeb-0a20-422f-a96f-ec6250b71a1b',
            '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D', -- Entity: MJ: Graph Edge Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '9F985FC5-8DB9-4BBA-8EA4-B0AF90A76F3D'),
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

