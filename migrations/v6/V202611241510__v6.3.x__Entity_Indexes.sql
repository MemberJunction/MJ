-- ════════════════════════════════════════════════════════════════════════════════════════
-- Track database indexes in MJ entity metadata (#6801)
--
--  1. EntityIndex (MJ: Entity Indexes): one row per database index on an entity's base
--     table (Active), or per DBAutoDoc/advisor proposal (Proposed / Rejected). CodeGen
--     syncs Active rows from the database catalog, marks IDX_AUTO_MJ_FKEY_* indexes with
--     Source = 'CodeGen', preserves Proposed/Rejected rows, and transitions Proposed rows
--     to Active when they appear in the database.
--
--  2. EntityIndexField (MJ: Entity Index Fields): ordered key and INCLUDE entries for
--     each EntityIndex row. EntityFieldID is nullable to support expression key parts
--     (PostgreSQL / MySQL), where Expression holds the expression text.
--
-- The PostgreSQL counterpart is produced at release time by the build engineer.
-- ════════════════════════════════════════════════════════════════════════════════════════


-- ── 1. EntityIndex ──────────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[EntityIndex] (
    [ID]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EntityIndex_ID] DEFAULT (newsequentialid()),
    [EntityID]         UNIQUEIDENTIFIER NOT NULL,
    [Name]             NVARCHAR(255)    COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [IndexType]        NVARCHAR(20)     COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityIndex_IndexType] DEFAULT (N'BTree'),
    [NativeType]       NVARCHAR(100)    COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityIndex_NativeType] DEFAULT (N''),
    [IsUnique]         BIT              NOT NULL CONSTRAINT [DF_EntityIndex_IsUnique] DEFAULT (0),
    [IsPrimaryKey]     BIT              NOT NULL CONSTRAINT [DF_EntityIndex_IsPrimaryKey] DEFAULT (0),
    [IsClustered]      BIT              NOT NULL CONSTRAINT [DF_EntityIndex_IsClustered] DEFAULT (0),
    [FilterDefinition] NVARCHAR(MAX)    COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [HasExpressions]   BIT              NOT NULL CONSTRAINT [DF_EntityIndex_HasExpressions] DEFAULT (0),
    [Source]           NVARCHAR(20)     COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityIndex_Source] DEFAULT (N'Database'),
    [Status]           NVARCHAR(20)     COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityIndex_Status] DEFAULT (N'Active'),
    [Description]      NVARCHAR(MAX)    COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    CONSTRAINT [PK_EntityIndex] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_EntityIndex_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [UQ_EntityIndex_EntityID_Name] UNIQUE ([EntityID], [Name]),
    CONSTRAINT [CK_EntityIndex_IndexType] CHECK ([IndexType] IN ('BTree', 'Hash', 'FullText', 'Columnstore', 'GIN', 'GiST', 'BRIN', 'Spatial', 'XML', 'Other')),
    CONSTRAINT [CK_EntityIndex_Source]    CHECK ([Source] IN ('Database', 'CodeGen', 'DBAutoDoc')),
    CONSTRAINT [CK_EntityIndex_Status]    CHECK ([Status] IN ('Active', 'Proposed', 'Rejected'))
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Database indexes on each entity''s base table (Status = Active) and index proposals from advisors such as DBAutoDoc (Status = Proposed or Rejected). Kept in sync with the database catalog by CodeGen.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The entity whose base table owns this index.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'EntityID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The index name in the database (or proposed index name when Status is Proposed/Rejected).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Normalized cross-database index type: BTree, Hash, FullText, Columnstore, GIN, GiST, BRIN, Spatial, XML, or Other.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'IndexType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Database-native index type or access method name (for example CLUSTERED, NONCLUSTERED, btree, gin).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'NativeType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True when the index enforces uniqueness across its key columns.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'IsUnique';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True when this index backs the table''s primary key constraint.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'IsPrimaryKey';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True when the index is clustered (SQL Server CLUSTERED / CLUSTERED COLUMNSTORE or PostgreSQL indisclustered).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'IsClustered';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Predicate expression for a filtered (SQL Server) or partial (PostgreSQL) index; NULL when unfiltered.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'FilterDefinition';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'True when one or more key parts are expressions rather than plain base-table columns.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'HasExpressions';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Origin of the index record: Database (discovered in catalog), CodeGen (auto-generated IDX_AUTO_MJ_FKEY_* index), or DBAutoDoc (proposed by DBAutoDoc Index Advisor).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'Source';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Lifecycle status of the index: Active (exists in database), Proposed (recommended but not yet created), or Rejected (proposal dismissed).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional human-readable description or advisor rationale for why this index exists or is proposed.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndex', @level2type = N'COLUMN', @level2name = N'Description';
GO


-- ── 2. EntityIndexField ─────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[EntityIndexField] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_EntityIndexField_ID] DEFAULT (newsequentialid()),
    [EntityIndexID] UNIQUEIDENTIFIER NOT NULL,
    [EntityFieldID] UNIQUEIDENTIFIER NULL,
    [Expression]    NVARCHAR(MAX)    COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Sequence]      INT              NOT NULL,
    [Role]          NVARCHAR(20)     COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityIndexField_Role] DEFAULT (N'Key'),
    [SortDirection] NVARCHAR(10)     COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_EntityIndexField_SortDirection] DEFAULT (N'ASC'),
    CONSTRAINT [PK_EntityIndexField] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_EntityIndexField_EntityIndex] FOREIGN KEY ([EntityIndexID])
        REFERENCES [${flyway:defaultSchema}].[EntityIndex]([ID]) ON DELETE CASCADE,
    CONSTRAINT [FK_EntityIndexField_EntityField] FOREIGN KEY ([EntityFieldID])
        REFERENCES [${flyway:defaultSchema}].[EntityField]([ID]),
    CONSTRAINT [UQ_EntityIndexField_Index_Sequence] UNIQUE ([EntityIndexID], [Sequence]),
    CONSTRAINT [CK_EntityIndexField_Role]          CHECK ([Role] IN ('Key', 'Include')),
    CONSTRAINT [CK_EntityIndexField_SortDirection] CHECK ([SortDirection] IN ('ASC', 'DESC')),
    CONSTRAINT [CK_EntityIndexField_ColumnOrExpression] CHECK ([EntityFieldID] IS NOT NULL OR [Expression] IS NOT NULL)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Ordered key and INCLUDE column (or expression) entries belonging to an EntityIndex.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndexField';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The parent EntityIndex row.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndexField', @level2type = N'COLUMN', @level2name = N'EntityIndexID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The indexed entity field, or NULL when this key position is an expression.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndexField', @level2type = N'COLUMN', @level2name = N'EntityFieldID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Expression text for an expression key part when EntityFieldID is NULL (for example lower(email)).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndexField', @level2type = N'COLUMN', @level2name = N'Expression';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'1-based ordinal position within the index (key parts first, followed by INCLUDE columns).', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndexField', @level2type = N'COLUMN', @level2name = N'Sequence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this entry is a Key column/expression or a non-key Include column.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndexField', @level2type = N'COLUMN', @level2name = N'Role';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sort direction of a Key column (ASC or DESC). INCLUDE columns default to ASC.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'EntityIndexField', @level2type = N'COLUMN', @level2name = N'SortDirection';
GO
