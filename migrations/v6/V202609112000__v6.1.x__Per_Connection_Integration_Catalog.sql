/* ============================================================================
   Per-connection integration catalog — CompanyIntegrationObject / CompanyIntegrationObjectField
   v6.1.x

   IntegrationObject and IntegrationObjectField are keyed by IntegrationID alone, so two
   connections (CompanyIntegrations) of the same connector share ONE set of object and field
   definitions: one tenant's discovery overwrites the other's sampled widths and custom columns,
   and one tenant's column-cap enforcement disables the object for everybody. These two tables
   give each connection its own catalog. Every declared column is carried verbatim so the engine
   can read either table through one projection; the additions are:

     * CompanyIntegrationID       — whose catalog this is
     * IntegrationObjectID / IntegrationObjectFieldID — which declared row it was rebased from
                                    (NULL when the object exists only for this connection)
     * Provenance / ProvenanceDetail — Declared | Endpoint | Sampled, and the per-attribute merge log
     * IsSelected / SelectedAt    — selection is an axis SEPARATE from Status, so a newly discovered
                                    object can arrive Active-but-unselected instead of Disabled
     * FirstSeenAt / LastSeenAt / LastSampledAt
     * ObservedMaxLength (fields) — the raw sampled width, kept apart from the padded Length

   Behaviour is flag-gated in the engine (CatalogSource Shared | PerConnection); with no rows here a
   connection reads the shared catalog exactly as before. No data is moved by this migration.

   Conventions (migrations/CLAUDE.md): DDL + sp_addextendedproperty only; entity metadata, views
   and CRUD procedures are CodeGen's; single-column FK indexes are CodeGen's; the PostgreSQL
   counterpart is build-engineer work at release time.
   ============================================================================ */

-- ==============================================================================================
-- 1. Tables
-- ==============================================================================================
IF OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObject]', 'U') IS NULL
BEGIN
CREATE TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] (
    [ID] UNIQUEIDENTIFIER NOT NULL,
    [IntegrationID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [DisplayName] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Description] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Category] NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [APIPath] NVARCHAR(500) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [ResponseDataKey] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DefaultPageSize] INT NOT NULL,
    [SupportsPagination] BIT NOT NULL,
    [PaginationType] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [SupportsIncrementalSync] BIT NOT NULL,
    [SupportsWrite] BIT NOT NULL,
    [DefaultQueryParams] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Configuration] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Sequence] INT NOT NULL,
    [Status] NVARCHAR(25) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [__mj_CreatedAt] DATETIMEOFFSET(7) NOT NULL,
    [__mj_UpdatedAt] DATETIMEOFFSET(7) NOT NULL,
    [WriteAPIPath] NVARCHAR(500) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [WriteMethod] NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DeleteMethod] NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [IsCustom] BIT NOT NULL,
    [CreateAPIPath] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreateMethod] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreateBodyShape] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreateBodyKey] NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreateIDLocation] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [UpdateAPIPath] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [UpdateMethod] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [UpdateBodyShape] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [UpdateBodyKey] NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [UpdateIDLocation] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DeleteAPIPath] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DeleteIDLocation] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [IncrementalWatermarkField] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [MetadataSource] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [SupportsCreate] BIT NOT NULL,
    [SupportsUpdate] BIT NOT NULL,
    [SupportsDelete] BIT NOT NULL,
    [SyncStrategy] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ContentHashApplicable] BIT NOT NULL,
    [StableOrderingKey] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CompanyIntegrationID] UNIQUEIDENTIFIER NOT NULL,
    [IntegrationObjectID] UNIQUEIDENTIFIER NULL,
    [Provenance] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [ProvenanceDetail] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [IsSelected] BIT NOT NULL,
    [SelectedAt] DATETIMEOFFSET(7) NULL,
    [FirstSeenAt] DATETIMEOFFSET(7) NULL,
    [LastSeenAt] DATETIMEOFFSET(7) NULL,
    [LastSampledAt] DATETIMEOFFSET(7) NULL
);
END;
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObjectField]', 'U') IS NULL
BEGIN
CREATE TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] (
    [ID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [DisplayName] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Description] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Category] NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Type] NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [Length] INT NULL,
    [Precision] INT NULL,
    [Scale] INT NULL,
    [AllowsNull] BIT NOT NULL,
    [DefaultValue] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [IsPrimaryKey] BIT NOT NULL,
    [IsUniqueKey] BIT NOT NULL,
    [IsReadOnly] BIT NOT NULL,
    [IsRequired] BIT NOT NULL,
    [RelatedIntegrationObjectFieldName] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Sequence] INT NOT NULL,
    [Configuration] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Status] NVARCHAR(25) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [__mj_CreatedAt] DATETIMEOFFSET(7) NOT NULL,
    [__mj_UpdatedAt] DATETIMEOFFSET(7) NOT NULL,
    [IsCustom] BIT NOT NULL,
    [MetadataSource] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [CompanyIntegrationObjectID] UNIQUEIDENTIFIER NOT NULL,
    [RelatedCompanyIntegrationObjectID] UNIQUEIDENTIFIER NULL,
    [IntegrationObjectFieldID] UNIQUEIDENTIFIER NULL,
    [ObservedMaxLength] INT NULL,
    [Provenance] NVARCHAR(20) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [ProvenanceDetail] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [IsSelected] BIT NOT NULL,
    [SelectedAt] DATETIMEOFFSET(7) NULL,
    [FirstSeenAt] DATETIMEOFFSET(7) NULL,
    [LastSeenAt] DATETIMEOFFSET(7) NULL,
    [LastSampledAt] DATETIMEOFFSET(7) NULL
);
END;
GO

-- ==============================================================================================
-- 2. Defaults
-- ==============================================================================================
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_ID')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_ID] DEFAULT (newsequentialid()) FOR [ID];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_DefaultPageSize')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_DefaultPageSize] DEFAULT ((100)) FOR [DefaultPageSize];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_SupportsPagination')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsPagination] DEFAULT ((1)) FOR [SupportsPagination];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_PaginationType')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_PaginationType] DEFAULT ('PageNumber') FOR [PaginationType];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_SupportsIncrementalSync')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsIncrementalSync] DEFAULT ((0)) FOR [SupportsIncrementalSync];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_SupportsWrite')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsWrite] DEFAULT ((0)) FOR [SupportsWrite];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_Sequence')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_Sequence] DEFAULT ((0)) FOR [Sequence];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_Status')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_Status] DEFAULT ('Active') FOR [Status];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject___mj_CreatedAt')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject___mj_CreatedAt] DEFAULT (getutcdate()) FOR [__mj_CreatedAt];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject___mj_UpdatedAt')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject___mj_UpdatedAt] DEFAULT (getutcdate()) FOR [__mj_UpdatedAt];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_WriteMethod')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_WriteMethod] DEFAULT ('POST') FOR [WriteMethod];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_DeleteMethod')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_DeleteMethod] DEFAULT ('DELETE') FOR [DeleteMethod];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_IsCustom')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_IsCustom] DEFAULT ((0)) FOR [IsCustom];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_MetadataSource')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_MetadataSource] DEFAULT ('Declared') FOR [MetadataSource];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_SupportsCreate')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsCreate] DEFAULT ((0)) FOR [SupportsCreate];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_SupportsUpdate')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsUpdate] DEFAULT ((0)) FOR [SupportsUpdate];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_SupportsDelete')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsDelete] DEFAULT ((0)) FOR [SupportsDelete];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_ContentHashApplicable')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_ContentHashApplicable] DEFAULT ((1)) FOR [ContentHashApplicable];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_Provenance')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_Provenance] DEFAULT ('Declared') FOR [Provenance];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObject_IsSelected')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_IsSelected] DEFAULT ((0)) FOR [IsSelected];

GO
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_ID')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_ID] DEFAULT (newsequentialid()) FOR [ID];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_AllowsNull')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_AllowsNull] DEFAULT ((1)) FOR [AllowsNull];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_IsPrimaryKey')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsPrimaryKey] DEFAULT ((0)) FOR [IsPrimaryKey];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_IsUniqueKey')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsUniqueKey] DEFAULT ((0)) FOR [IsUniqueKey];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_IsReadOnly')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsReadOnly] DEFAULT ((0)) FOR [IsReadOnly];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_IsRequired')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsRequired] DEFAULT ((0)) FOR [IsRequired];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_Sequence')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_Sequence] DEFAULT ((0)) FOR [Sequence];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_Status')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_Status] DEFAULT ('Active') FOR [Status];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField___mj_CreatedAt')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField___mj_CreatedAt] DEFAULT (getutcdate()) FOR [__mj_CreatedAt];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField___mj_UpdatedAt')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField___mj_UpdatedAt] DEFAULT (getutcdate()) FOR [__mj_UpdatedAt];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_IsCustom')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsCustom] DEFAULT ((0)) FOR [IsCustom];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_MetadataSource')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_MetadataSource] DEFAULT ('Declared') FOR [MetadataSource];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_Provenance')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_Provenance] DEFAULT ('Declared') FOR [Provenance];

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_CompanyIntegrationObjectField_IsSelected')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsSelected] DEFAULT ((0)) FOR [IsSelected];

GO

-- ==============================================================================================
-- 3. Keys, foreign keys and checks
-- ==============================================================================================
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_CompanyIntegrationObject')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [PK_CompanyIntegrationObject] PRIMARY KEY CLUSTERED ([ID]);

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_CompanyIntegrationObject_Name')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [UQ_CompanyIntegrationObject_Name] UNIQUE NONCLUSTERED ([CompanyIntegrationID], [Name]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CompanyIntegrationObject_CompanyIntegrationID')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [FK_CompanyIntegrationObject_CompanyIntegrationID] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [${flyway:defaultSchema}].[CompanyIntegration] ([ID]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CompanyIntegrationObject_IntegrationObjectID')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [FK_CompanyIntegrationObject_IntegrationObjectID] FOREIGN KEY ([IntegrationObjectID]) REFERENCES [${flyway:defaultSchema}].[IntegrationObject] ([ID]);

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CompanyIntegrationObject_Provenance')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [CK_CompanyIntegrationObject_Provenance] CHECK ([Provenance] IN ('Declared','Endpoint','Sampled'));

GO
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'PK_CompanyIntegrationObjectField')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [PK_CompanyIntegrationObjectField] PRIMARY KEY CLUSTERED ([ID]);

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_CompanyIntegrationObjectField_Name')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [UQ_CompanyIntegrationObjectField_Name] UNIQUE NONCLUSTERED ([CompanyIntegrationObjectID], [Name]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CompanyIntegrationObjectField_CompanyIntegrationObjectID')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [FK_CompanyIntegrationObjectField_CompanyIntegrationObjectID] FOREIGN KEY ([CompanyIntegrationObjectID]) REFERENCES [${flyway:defaultSchema}].[CompanyIntegrationObject] ([ID]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CompanyIntegrationObjectField_RelatedCompanyIntegrationObjectID')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [FK_CompanyIntegrationObjectField_RelatedCompanyIntegrationObjectID] FOREIGN KEY ([RelatedCompanyIntegrationObjectID]) REFERENCES [${flyway:defaultSchema}].[CompanyIntegrationObject] ([ID]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_CompanyIntegrationObjectField_IntegrationObjectFieldID')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [FK_CompanyIntegrationObjectField_IntegrationObjectFieldID] FOREIGN KEY ([IntegrationObjectFieldID]) REFERENCES [${flyway:defaultSchema}].[IntegrationObjectField] ([ID]);

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_CompanyIntegrationObjectField_Provenance')
    ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [CK_CompanyIntegrationObjectField_Provenance] CHECK ([Provenance] IN ('Declared','Endpoint','Sampled'));

GO

-- ==============================================================================================
-- 4. Indexes (composite only — CodeGen creates the single-column foreign-key indexes)
-- ==============================================================================================
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompanyIntegrationObject_Connection_Status_Sequence' AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObject]'))
    CREATE INDEX [IX_CompanyIntegrationObject_Connection_Status_Sequence] ON [${flyway:defaultSchema}].[CompanyIntegrationObject] ([CompanyIntegrationID], [Status], [Sequence]);


GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CompanyIntegrationObjectField_Object_Status' AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObjectField]'))
    CREATE INDEX [IX_CompanyIntegrationObjectField_Object_Status] ON [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ([CompanyIntegrationObjectID], [Status]);


GO

-- ==============================================================================================
-- 5. Descriptions (sp_addextendedproperty, so CodeGen surfaces them on regen)
-- ==============================================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'One connection''s (CompanyIntegration''s) own copy of an integration object: the vendor''s declared definition rebased with what THIS connection discovered and sampled, with provenance, and with selection (IsSelected) as an axis separate from Status. Replaces reading IntegrationObject directly so two connections of one connector no longer overwrite each other.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'A field of a CompanyIntegrationObject: the declared field definition rebased with this connection''s own discovery and sampling (observed width, provenance), with selection separate from Status.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Internal/programmatic name of the external object (e.g., Members, Events)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'Name';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Human-friendly display label',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DisplayName';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Description of what this external object represents',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'Description';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'UI grouping category (e.g., Membership, Events, Finance)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'Category';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'API endpoint path, may include template variables like {ProfileID} that are resolved at runtime from parent object records',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'APIPath';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'JSON key used to extract the data array from the API response envelope. NULL means the response is a root-level array.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'ResponseDataKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of records to request per page from the API',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DefaultPageSize';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this endpoint supports paginated fetching',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SupportsPagination';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Pagination strategy: PageNumber (page index), Offset (record offset), Cursor (opaque token), or None',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'PaginationType';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this object supports watermark-based incremental sync',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SupportsIncrementalSync';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether data can be pushed back to this object via the API',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SupportsWrite';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'JSON object of default query parameters to include with every API request for this object',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DefaultQueryParams';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Freeform JSON for connector-specific configuration not covered by standard columns',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'Configuration';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Processing and display order. Lower numbers are processed first.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'Status';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'API path for create/update operations when different from the read APIPath. If NULL, the read APIPath is used for writes as well.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'WriteAPIPath';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTTP method for create operations. Defaults to POST.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'WriteMethod';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTTP method for delete operations. Defaults to DELETE.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DeleteMethod';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'IsCustom';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateAPIPath';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateMethod';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateBodyShape';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Wrapper key for create body when CreateBodyShape=wrapped. Example: ''member'' for YourMembership which wraps body as {member:{...}}.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateBodyKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'CreateIDLocation';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateAPIPath';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTTP method for update (typically PATCH or PUT).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateMethod';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateBodyShape';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Wrapper key for update body when UpdateBodyShape=wrapped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateBodyKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'For update: where the target record ID is located in the request — typically ''path'' (substituted into UpdateAPIPath URL template).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'UpdateIDLocation';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DeleteAPIPath';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'For delete: where the target record ID is located — typically ''path''.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'DeleteIDLocation';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'IncrementalWatermarkField';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Provenance of this IntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'MetadataSource';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this object supports record creation in the external system (per-operation granularity beyond SupportsWrite). Drives whether the generic CreateRecord path is wired and whether the object is offered for write-back create.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SupportsCreate';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this object supports record updates in the external system (per-operation granularity beyond SupportsWrite).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SupportsUpdate';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this object supports record deletion/tombstoning in the external system (per-operation granularity beyond SupportsWrite).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SupportsDelete';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Declared incremental sync strategy for this object (e.g. WatermarkIncremental, ContentHash, FullSnapshot). Informs how the engine narrows subsequent syncs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SyncStrategy';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether per-record content hashing is meaningful for this object (false for append-only/event streams where every row is new). Controls whether the engine uses content-hash to skip unchanged-row writes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'ContentHashApplicable';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Stable, monotonic ordering column (usually the PK) used for keyset/no-watermark resume of a scan. Null when the object has no stable key.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'StableOrderingKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'Provenance';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'ProvenanceDetail';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'IsSelected';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'SelectedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'FirstSeenAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'LastSeenAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'LastSampledAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Field name as returned by the external API',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Name';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Human-friendly display label for the field',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'DisplayName';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Description of what this field represents',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Description';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'UI grouping category within the object',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Category';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Data type of the field (e.g., nvarchar, int, datetime, decimal, bit). Uses same type vocabulary as EntityField.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Type';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Maximum length for string types',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Length';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Numeric precision',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Precision';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Numeric scale',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Scale';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether the field can contain NULL values',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'AllowsNull';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Default value from the source system',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'DefaultValue';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this field is part of the object primary key',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'IsPrimaryKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether values must be unique across all records',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'IsUniqueKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this field cannot be written back to the source system',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'IsReadOnly';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this field is required for create/update operations',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'IsRequired';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The field name on the related IntegrationObject that this FK points to (typically the PK field)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'RelatedIntegrationObjectFieldName';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Display and processing order within the object. Lower numbers appear first.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Freeform JSON for connector-specific field configuration',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Configuration';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Status';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'IsCustom';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Provenance of this IntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'MetadataSource';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The longest value sampling actually saw, kept SEPARATE from Length. Length carries the padded width the schema builder will use; this carries the evidence. Without both, a width cannot be audited and a truncation cannot be distinguished from a bad guess.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'ObservedMaxLength';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'Provenance';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'ProvenanceDetail';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'IsSelected';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'SelectedAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'FirstSeenAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'LastSeenAt';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'LastSampledAt';
GO
