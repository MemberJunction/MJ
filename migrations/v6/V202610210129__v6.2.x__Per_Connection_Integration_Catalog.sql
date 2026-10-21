/* ============================================================================
   Per-connection integration catalog — CompanyIntegrationObject / CompanyIntegrationObjectField
   v6.2.x

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























































/**************************************************************************************************
 **************************************************************************************************
 **                                                                                              **
 **                    GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND                 **
 **                                                                                              **
 **  Everything below this block was produced by `mj codegen` against the schema above. It      **
 **  contains:                                                                                    **
 **    • the Entity rows for MJ: Company Integration Objects and MJ: Company Integration Object   **
 **      Fields, their application membership and role permissions                               **
 **    • their 91 EntityField rows (apply-time Sequence; 5 are view name fields), value lists, **
 **      and EntityRelationship rows                                                             **
 **    • their foreign-key indexes, base views (vwCompanyIntegrationObjects /                     **
 **      vwCompanyIntegrationObjectFields) and view permissions                                   **
 **    • CRUD stored procedures (spCreate / spUpdate / spDelete for both entities)                **
 **                                                                                              **
 **  It is appended here — rather than left as a standalone CodeGen_Run_*.sql file — so the       **
 **  tables and their generated objects apply as ONE migration, per MJ convention. DO NOT         **
 **  hand-edit below this line; if the DDL above changes, re-run CodeGen and replace this section.**
 **                                                                                              **
 **************************************************************************************************
 **************************************************************************************************/

/* SQL generated to create new entity MJ: Company Integration Objects */

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
         '50b67ff6-9edb-4c88-9741-1fd6cdf5665b',
         'MJ: Company Integration Objects',
         'Company Integration Objects',
         'One connection''s (CompanyIntegration''s) own copy of an integration object: the vendor''s declared definition rebased with what THIS connection discovered and sampled, with provenance, and with selection (IsSelected) as an axis separate from Status. Replaces reading IntegrationObject directly so two connections of one connector no longer overwrite each other.',
         NULL,
         'CompanyIntegrationObject',
         'vwCompanyIntegrationObjects',
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

/* SQL generated to add new entity MJ: Company Integration Objects to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '50b67ff6-9edb-4c88-9741-1fd6cdf5665b', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Company Integration Objects for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('50b67ff6-9edb-4c88-9741-1fd6cdf5665b' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('50b67ff6-9edb-4c88-9741-1fd6cdf5665b' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Objects for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('50b67ff6-9edb-4c88-9741-1fd6cdf5665b' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('50b67ff6-9edb-4c88-9741-1fd6cdf5665b' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Objects for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('50b67ff6-9edb-4c88-9741-1fd6cdf5665b' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('50b67ff6-9edb-4c88-9741-1fd6cdf5665b' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ: Company Integration Object Fields */

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
         '01600245-995e-48d1-a60e-52d336ab5d79',
         'MJ: Company Integration Object Fields',
         'Company Integration Object Fields',
         'A field of a CompanyIntegrationObject: the declared field definition rebased with this connection''s own discovery and sampling (observed width, provenance), with selection separate from Status.',
         NULL,
         'CompanyIntegrationObjectField',
         'vwCompanyIntegrationObjectFields',
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

/* SQL generated to add new entity MJ: Company Integration Object Fields to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '01600245-995e-48d1-a60e-52d336ab5d79', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('01600245-995e-48d1-a60e-52d336ab5d79' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('01600245-995e-48d1-a60e-52d336ab5d79' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('01600245-995e-48d1-a60e-52d336ab5d79' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('01600245-995e-48d1-a60e-52d336ab5d79' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('01600245-995e-48d1-a60e-52d336ab5d79' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('01600245-995e-48d1-a60e-52d336ab5d79' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to insert 86 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd615462-b09a-429e-a6c2-c8ceb2445efc' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd615462-b09a-429e-a6c2-c8ceb2445efc',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98735ec1-527f-42b4-99ba-c8bd4152f87b' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'IntegrationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '98735ec1-527f-42b4-99ba-c8bd4152f87b',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'IntegrationID',
            'Integration ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c8bf7b2-9499-4e8b-b3e3-8278a20e49bf' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8c8bf7b2-9499-4e8b-b3e3-8278a20e49bf',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'Name',
            'Name',
            'Internal/programmatic name of the external object (e.g., Members, Events)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9eb84516-914a-4f67-bf58-7f6f25bb65bd' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9eb84516-914a-4f67-bf58-7f6f25bb65bd',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'DisplayName',
            'Display Name',
            'Human-friendly display label',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2314326-98c9-417d-b8da-1fbc049d6bee' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e2314326-98c9-417d-b8da-1fbc049d6bee',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'Description',
            'Description',
            'Description of what this external object represents',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f57eb82-3271-4f2b-9dd7-d7b99115e43e' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f57eb82-3271-4f2b-9dd7-d7b99115e43e',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'Category',
            'Category',
            'UI grouping category (e.g., Membership, Events, Finance)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a64161aa-e8a3-4f69-8233-af186e72ed0c' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'APIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a64161aa-e8a3-4f69-8233-af186e72ed0c',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'APIPath',
            'API Path',
            'API endpoint path, may include template variables like {ProfileID} that are resolved at runtime from parent object records',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f718d402-a020-460b-ae96-e8f757aad00a' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'ResponseDataKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f718d402-a020-460b-ae96-e8f757aad00a',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'ResponseDataKey',
            'Response Data Key',
            'JSON key used to extract the data array from the API response envelope. NULL means the response is a root-level array.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d37369e-592d-4b8b-a34d-629f37b21858' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'DefaultPageSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d37369e-592d-4b8b-a34d-629f37b21858',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'DefaultPageSize',
            'Default Page Size',
            'Number of records to request per page from the API',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32348552-f54e-4e19-9572-ef0fbe239cf6' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SupportsPagination')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '32348552-f54e-4e19-9572-ef0fbe239cf6',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SupportsPagination',
            'Supports Pagination',
            'Whether this endpoint supports paginated fetching',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90b95ee9-2e3a-4816-925f-c0b5157cef1d' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'PaginationType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90b95ee9-2e3a-4816-925f-c0b5157cef1d',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'PaginationType',
            'Pagination Type',
            'Pagination strategy: PageNumber (page index), Offset (record offset), Cursor (opaque token), or None',
            'nvarchar',
            40,
            0,
            0,
            0,
            'PageNumber',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15eb00f1-218c-4968-b396-5b4ab3f4d8c9' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SupportsIncrementalSync')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '15eb00f1-218c-4968-b396-5b4ab3f4d8c9',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SupportsIncrementalSync',
            'Supports Incremental Sync',
            'Whether this object supports watermark-based incremental sync',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '27c3d5bc-164c-4b9b-9639-f899dde07374' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SupportsWrite')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '27c3d5bc-164c-4b9b-9639-f899dde07374',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SupportsWrite',
            'Supports Write',
            'Whether data can be pushed back to this object via the API',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9153f0b3-be6e-45b7-98bc-4fb372afb33d' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'DefaultQueryParams')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9153f0b3-be6e-45b7-98bc-4fb372afb33d',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'DefaultQueryParams',
            'Default Query Params',
            'JSON object of default query parameters to include with every API request for this object',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca2f233e-e1d0-45f5-b9b1-735db2d7d033' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca2f233e-e1d0-45f5-b9b1-735db2d7d033',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'Configuration',
            'Configuration',
            'Freeform JSON for connector-specific configuration not covered by standard columns',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6911c0a9-ba9f-46e2-8c8f-d498c5c5e287' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6911c0a9-ba9f-46e2-8c8f-d498c5c5e287',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'Sequence',
            'Sequence',
            'Processing and display order. Lower numbers are processed first.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '22b3da1a-4da5-49a0-8d62-9eb51f84bc19' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '22b3da1a-4da5-49a0-8d62-9eb51f84bc19',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'Status',
            'Status',
            'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
            'nvarchar',
            50,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'be1254fe-5426-4a78-ad21-97940d751923' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'be1254fe-5426-4a78-ad21-97940d751923',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '213f74b2-92df-4dc6-b585-d623ed9f35a9' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '213f74b2-92df-4dc6-b585-d623ed9f35a9',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d2a8c28-c051-404b-9640-534591f97769' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'WriteAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d2a8c28-c051-404b-9640-534591f97769',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'WriteAPIPath',
            'Write API Path',
            'API path for create/update operations when different from the read APIPath. If NULL, the read APIPath is used for writes as well.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5cba6ea9-bb2f-4776-9feb-dee6f191c748' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'WriteMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5cba6ea9-bb2f-4776-9feb-dee6f191c748',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'WriteMethod',
            'Write Method',
            'HTTP method for create operations. Defaults to POST.',
            'nvarchar',
            20,
            0,
            0,
            1,
            'POST',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9df2dbc6-1980-4928-a3c3-82f61867e487' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'DeleteMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9df2dbc6-1980-4928-a3c3-82f61867e487',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'DeleteMethod',
            'Delete Method',
            'HTTP method for delete operations. Defaults to DELETE.',
            'nvarchar',
            20,
            0,
            0,
            1,
            'DELETE',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c6be51ac-23be-490c-882c-50c2bfa688cb' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'IsCustom')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c6be51ac-23be-490c-882c-50c2bfa688cb',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'IsCustom',
            'Is Custom',
            'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f774f45-548b-42ae-90d7-1f0ce4d4edf6' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'CreateAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1f774f45-548b-42ae-90d7-1f0ce4d4edf6',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'CreateAPIPath',
            'Create API Path',
            'HTTP path template for create operations. Generic CRUD in BaseRESTIntegrationConnector substitutes parent IDs into {var} placeholders. NULL means create not supported via metadata-driven path.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1406bfe-b002-48a5-b249-e35b966b8cef' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'CreateMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd1406bfe-b002-48a5-b249-e35b966b8cef',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'CreateMethod',
            'Create Method',
            'HTTP method for create (typically POST). NULL means create not supported via metadata-driven path.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45cda30a-8ac9-4217-8246-24ae134c45ca' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'CreateBodyShape')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '45cda30a-8ac9-4217-8246-24ae134c45ca',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'CreateBodyShape',
            'Create Body Shape',
            'Request body shape for create: flat (top-level fields), wrapped (under CreateBodyKey), or literal (connector overrides CreateRecord and supplies own body).',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '263c949b-50b3-4c81-a56c-bb207404ce08' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'CreateBodyKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '263c949b-50b3-4c81-a56c-bb207404ce08',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'CreateBodyKey',
            'Create Body Key',
            'Wrapper key for create body when CreateBodyShape=wrapped. Example: ''member'' for YourMembership which wraps body as {member:{...}}.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3333451a-c8e0-44c1-8b2c-a97f725f06ef' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'CreateIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3333451a-c8e0-44c1-8b2c-a97f725f06ef',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'CreateIDLocation',
            'Create ID Location',
            'Where the created record ID is found in the create response: path (URL of returned Location header), body (parsed from JSON response), header (specific named header).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e25bab56-8834-4c13-ab73-d27d4f228f82' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'UpdateAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e25bab56-8834-4c13-ab73-d27d4f228f82',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'UpdateAPIPath',
            'Update API Path',
            'HTTP path template for update operations. Typically contains {ID} placeholder substituted with the record ExternalID at runtime.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '605019a2-db56-4338-9ef1-d36fa6432292' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'UpdateMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '605019a2-db56-4338-9ef1-d36fa6432292',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'UpdateMethod',
            'Update Method',
            'HTTP method for update (typically PATCH or PUT).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6fb4b246-8471-4848-ac52-a5579437192f' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'UpdateBodyShape')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6fb4b246-8471-4848-ac52-a5579437192f',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'UpdateBodyShape',
            'Update Body Shape',
            'Request body shape for update: flat | wrapped | literal. See CreateBodyShape.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc3ca925-6d5d-4389-be2e-bd7cac7d50d9' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'UpdateBodyKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc3ca925-6d5d-4389-be2e-bd7cac7d50d9',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'UpdateBodyKey',
            'Update Body Key',
            'Wrapper key for update body when UpdateBodyShape=wrapped.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a95a040d-b73a-4835-bd33-6fb227b06479' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'UpdateIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a95a040d-b73a-4835-bd33-6fb227b06479',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'UpdateIDLocation',
            'Update ID Location',
            'For update: where the target record ID is located in the request — typically ''path'' (substituted into UpdateAPIPath URL template).',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '934cdd35-1364-43b1-9b54-e8804cdfba54' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'DeleteAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '934cdd35-1364-43b1-9b54-e8804cdfba54',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'DeleteAPIPath',
            'Delete API Path',
            'HTTP path template for delete operations. Typically contains {ID} placeholder. NULL means delete not supported via metadata-driven path. (Existing DeleteMethod column carries the verb.)',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ebacf9a0-63a8-4024-974d-721184ae9d15' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'DeleteIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ebacf9a0-63a8-4024-974d-721184ae9d15',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'DeleteIDLocation',
            'Delete ID Location',
            'For delete: where the target record ID is located — typically ''path''.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8dd6a0dc-bb66-456e-b47c-e779dbe037ae' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'IncrementalWatermarkField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8dd6a0dc-bb66-456e-b47c-e779dbe037ae',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'IncrementalWatermarkField',
            'Incremental Watermark Field',
            'Vendor field name marking "last changed" — drives incremental sync filter when SupportsIncrementalSync=1. The exact filter syntax (e.g., $filter=Modified gt {value} or modified_since={value}) lives in Configuration.incrementalFilterFormat. Provable-only: leave NULL if docs do not name a watermark field.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a2f4ec9-44f9-461e-a974-7a66484b39ce' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'MetadataSource')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a2f4ec9-44f9-461e-a974-7a66484b39ce',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'MetadataSource',
            'Metadata Source',
            'Provenance of this IntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f4de3b9-67c6-41fe-bd4e-efc434aad314' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SupportsCreate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f4de3b9-67c6-41fe-bd4e-efc434aad314',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SupportsCreate',
            'Supports Create',
            'Whether this object supports record creation in the external system (per-operation granularity beyond SupportsWrite). Drives whether the generic CreateRecord path is wired and whether the object is offered for write-back create.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c84fd32c-3b5f-4bfd-b8d7-da9009b31857' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SupportsUpdate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c84fd32c-3b5f-4bfd-b8d7-da9009b31857',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SupportsUpdate',
            'Supports Update',
            'Whether this object supports record updates in the external system (per-operation granularity beyond SupportsWrite).',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e269ac26-50d9-4882-96c5-dea778d09723' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SupportsDelete')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e269ac26-50d9-4882-96c5-dea778d09723',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SupportsDelete',
            'Supports Delete',
            'Whether this object supports record deletion/tombstoning in the external system (per-operation granularity beyond SupportsWrite).',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '842bec6c-4bdc-4a9f-b136-85aa85afc918' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SyncStrategy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '842bec6c-4bdc-4a9f-b136-85aa85afc918',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SyncStrategy',
            'Sync Strategy',
            'Declared incremental sync strategy for this object (e.g. WatermarkIncremental, ContentHash, FullSnapshot). Informs how the engine narrows subsequent syncs.',
            'nvarchar',
            100,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15b5f963-bb72-42d7-bd9d-6e1c5ff0b9f2' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'ContentHashApplicable')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '15b5f963-bb72-42d7-bd9d-6e1c5ff0b9f2',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'ContentHashApplicable',
            'Content Hash Applicable',
            'Whether per-record content hashing is meaningful for this object (false for append-only/event streams where every row is new). Controls whether the engine uses content-hash to skip unchanged-row writes.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '83ea530d-a134-44f7-8bae-5ac44c37d22c' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'StableOrderingKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '83ea530d-a134-44f7-8bae-5ac44c37d22c',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'StableOrderingKey',
            'Stable Ordering Key',
            'Stable, monotonic ordering column (usually the PK) used for keyset/no-watermark resume of a scan. Null when the object has no stable key.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6bf7a7d3-070a-45b7-a0b2-09c94eb0d27d' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'CompanyIntegrationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6bf7a7d3-070a-45b7-a0b2-09c94eb0d27d',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'CompanyIntegrationID',
            'Company Integration ID',
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
            'DE238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c9f23cbf-a922-4bf4-b20e-3d73b9aa8a51' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'IntegrationObjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c9f23cbf-a922-4bf4-b20e-3d73b9aa8a51',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'IntegrationObjectID',
            'Integration Object ID',
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
            '86D3ED6F-2D1D-43F6-9777-FD9672FA9021',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd344bd76-6623-4e1a-b2f3-03adf6e3d5b7' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'Provenance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd344bd76-6623-4e1a-b2f3-03adf6e3d5b7',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'Provenance',
            'Provenance',
            'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '992ed77b-c711-4713-b67b-d68d38560dab' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'ProvenanceDetail')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '992ed77b-c711-4713-b67b-d68d38560dab',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'ProvenanceDetail',
            'Provenance Detail',
            'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a9d5b79-648e-4d83-a5eb-7d8323c17444' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'IsSelected')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a9d5b79-648e-4d83-a5eb-7d8323c17444',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'IsSelected',
            'Is Selected',
            'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dcc6c970-5cd4-4ffa-962a-469208d619d2' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'SelectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dcc6c970-5cd4-4ffa-962a-469208d619d2',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'SelectedAt',
            'Selected At',
            'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '195c0c3b-9846-477a-b424-f859c40dc37a' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'FirstSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '195c0c3b-9846-477a-b424-f859c40dc37a',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'FirstSeenAt',
            'First Seen At',
            'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '411211a6-e401-46ea-af3a-d32dea4de5fc' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'LastSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '411211a6-e401-46ea-af3a-d32dea4de5fc',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'LastSeenAt',
            'Last Seen At',
            'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc7ef965-574e-427d-95b1-c562018cc0a5' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'LastSampledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc7ef965-574e-427d-95b1-c562018cc0a5',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'LastSampledAt',
            'Last Sampled At',
            'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '25ac8e9b-a956-4a5b-ab41-b00d2d78050c' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '25ac8e9b-a956-4a5b-ab41-b00d2d78050c',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd42ab824-eede-475c-a13b-891fe7b6063b' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd42ab824-eede-475c-a13b-891fe7b6063b',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Name',
            'Name',
            'Field name as returned by the external API',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5799194c-7448-46e6-9a7f-f92dda417dcd' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5799194c-7448-46e6-9a7f-f92dda417dcd',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'DisplayName',
            'Display Name',
            'Human-friendly display label for the field',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44c01d04-1597-4295-8be1-6a29d579af3a' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '44c01d04-1597-4295-8be1-6a29d579af3a',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Description',
            'Description',
            'Description of what this field represents',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b2fffcb2-57cc-441f-bce9-0d035e1b7bc9' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b2fffcb2-57cc-441f-bce9-0d035e1b7bc9',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Category',
            'Category',
            'UI grouping category within the object',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6460ac95-dce4-443e-97bc-db76ec67b899' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6460ac95-dce4-443e-97bc-db76ec67b899',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Type',
            'Type',
            'Data type of the field (e.g., nvarchar, int, datetime, decimal, bit). Uses same type vocabulary as EntityField.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '47a0349f-e985-45b0-a17f-7fe11ef42d5b' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Length')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '47a0349f-e985-45b0-a17f-7fe11ef42d5b',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Length',
            'Length',
            'Maximum length for string types',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7d8c7331-a19e-4e99-802a-39c86edd9c31' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Precision')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7d8c7331-a19e-4e99-802a-39c86edd9c31',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Precision',
            'Precision',
            'Numeric precision',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f70ce542-3fd9-478f-85d4-4e19851430ab' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Scale')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f70ce542-3fd9-478f-85d4-4e19851430ab',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Scale',
            'Scale',
            'Numeric scale',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '90b4a25a-f143-475d-bc8e-2729c10e3d47' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'AllowsNull')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90b4a25a-f143-475d-bc8e-2729c10e3d47',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'AllowsNull',
            'Allows Null',
            'Whether the field can contain NULL values',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '059eca12-ae1a-40ae-847a-3a23fb9a9cb6' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'DefaultValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '059eca12-ae1a-40ae-847a-3a23fb9a9cb6',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'DefaultValue',
            'Default Value',
            'Default value from the source system',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3ef3bdb2-a87d-4638-a7c7-55c3f2347c31' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IsPrimaryKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3ef3bdb2-a87d-4638-a7c7-55c3f2347c31',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IsPrimaryKey',
            'Is Primary Key',
            'Whether this field is part of the object primary key',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '10ae8ed0-7e84-49cd-b573-a2fe5a93344c' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IsUniqueKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '10ae8ed0-7e84-49cd-b573-a2fe5a93344c',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IsUniqueKey',
            'Is Unique Key',
            'Whether values must be unique across all records',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '33ea2ebb-dda1-4fb4-8e1f-e54074013450' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IsReadOnly')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '33ea2ebb-dda1-4fb4-8e1f-e54074013450',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IsReadOnly',
            'Is Read Only',
            'Whether this field cannot be written back to the source system',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '700f1de5-ec14-4889-9ae7-a28af538bcaa' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IsRequired')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '700f1de5-ec14-4889-9ae7-a28af538bcaa',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IsRequired',
            'Is Required',
            'Whether this field is required for create/update operations',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '582e0c7d-8d75-44f9-9fc0-9f759d7a723d' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'RelatedIntegrationObjectFieldName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '582e0c7d-8d75-44f9-9fc0-9f759d7a723d',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'RelatedIntegrationObjectFieldName',
            'Related Integration Object Field Name',
            'The field name on the related IntegrationObject that this FK points to (typically the PK field)',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e50910e8-39ae-47a4-9326-d73e8163eef7' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e50910e8-39ae-47a4-9326-d73e8163eef7',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Sequence',
            'Sequence',
            'Display and processing order within the object. Lower numbers appear first.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6d64e0fa-8122-4e3e-bdc8-fd7c15f926d4' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d64e0fa-8122-4e3e-bdc8-fd7c15f926d4',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Configuration',
            'Configuration',
            'Freeform JSON for connector-specific field configuration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8d20c3ad-4314-4799-ab79-97b9eb66af5a' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8d20c3ad-4314-4799-ab79-97b9eb66af5a',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Status',
            'Status',
            'Active, Deprecated, or Disabled. Mirrors EntityField status values.',
            'nvarchar',
            50,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85ea97e7-77ad-4160-95e5-d1673dc2a990' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '85ea97e7-77ad-4160-95e5-d1673dc2a990',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7e246cfd-6757-44fc-bb70-947c0067b254' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7e246cfd-6757-44fc-bb70-947c0067b254',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '450f3a3d-34bc-43b7-8e69-995cd58b2376' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IsCustom')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '450f3a3d-34bc-43b7-8e69-995cd58b2376',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IsCustom',
            'Is Custom',
            'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a8ef84e-6092-4908-a539-18746fd2b7ff' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'MetadataSource')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a8ef84e-6092-4908-a539-18746fd2b7ff',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'MetadataSource',
            'Metadata Source',
            'Provenance of this IntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c42e357-f513-494c-957b-8d4dc46714df' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'CompanyIntegrationObjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4c42e357-f513-494c-957b-8d4dc46714df',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'CompanyIntegrationObjectID',
            'Company Integration Object ID',
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
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d1ce67f-a5db-4e9f-b0e0-a3332e7f9730' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'RelatedCompanyIntegrationObjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d1ce67f-a5db-4e9f-b0e0-a3332e7f9730',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'RelatedCompanyIntegrationObjectID',
            'Related Company Integration Object ID',
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
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b4a1dde7-a5bf-425f-a8e1-a19b51839286' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IntegrationObjectFieldID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b4a1dde7-a5bf-425f-a8e1-a19b51839286',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IntegrationObjectFieldID',
            'Integration Object Field ID',
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
            '3630CBFD-4C85-4B24-8A51-88D67389373E',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d127d0b-ab90-4185-a908-6d014378f8ce' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'ObservedMaxLength')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d127d0b-ab90-4185-a908-6d014378f8ce',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'ObservedMaxLength',
            'Observed Max Length',
            'The longest value sampling actually saw, kept SEPARATE from Length. Length carries the padded width the schema builder will use; this carries the evidence. Without both, a width cannot be audited and a truncation cannot be distinguished from a bad guess.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '149a203f-2b93-4675-af33-5aa1e2d410c4' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'Provenance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '149a203f-2b93-4675-af33-5aa1e2d410c4',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'Provenance',
            'Provenance',
            'Where this row came from: Declared (the connector shipped catalog), Endpoint (the source listed it) or Sampled (only streaming records revealed it). Answers "whose is this" for a connection whose catalog no longer matches the connector default.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b1c26b71-5ee7-44f5-bf78-c197735ef89c' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'ProvenanceDetail')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b1c26b71-5ee7-44f5-bf78-c197735ef89c',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'ProvenanceDetail',
            'Provenance Detail',
            'The per-attribute merge log for this row: which side won each overlay decision and why. The persist already computes this and throws it away, so the operator has never been able to see why a width or a key looks the way it does.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4d724d90-9aa7-4032-987b-5989f11905c9' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IsSelected')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4d724d90-9aa7-4032-987b-5989f11905c9',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IsSelected',
            'Is Selected',
            'Whether this connection syncs this item. THE AXIS THAT MAKES THE CONTRACT SATISFIABLE: Status says whether the item is in the catalog at all, IsSelected says whether the customer chose it. Conflating the two is why a newly discovered object had to arrive ENABLED — a disabled object was excluded from schema introspection, so it never reached key inference and never reached a migration.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2bf78170-e0c6-4d7b-ba7e-30c55aab0ac2' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'SelectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2bf78170-e0c6-4d7b-ba7e-30c55aab0ac2',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'SelectedAt',
            'Selected At',
            'When the selection last changed. Lets the UI distinguish "never chosen" from "deliberately deselected".',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe72b0f9-edb8-4e44-a671-4985e0ce388d' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'FirstSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fe72b0f9-edb8-4e44-a671-4985e0ce388d',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'FirstSeenAt',
            'First Seen At',
            'When this connection first observed this item. Set once and never updated, so a catalog can be read as a history of what the source exposed and when.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fc4681b-6b84-46f0-bdf8-8c0319c3a619' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'LastSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8fc4681b-6b84-46f0-bdf8-8c0319c3a619',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'LastSeenAt',
            'Last Seen At',
            'When this connection most recently observed this item. A row whose LastSeenAt is older than the connection last discovery is what "absent from the source" means.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e0aae746-bc67-462f-97cc-e6ced8b08fed' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'LastSampledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e0aae746-bc67-462f-97cc-e6ced8b08fed',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'LastSampledAt',
            'Last Sampled At',
            'When sampling last streamed records for this item. Distinct from LastSeenAt: an item can be listed by an endpoint without ever being sampled, and unsampled items are exactly the ones whose widths and keys came from the declared catalog rather than from data.',
            'datetimeoffset',
            10,
            34,
            7,
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

/* SQL text to insert entity field value with ID e7ea9d51-1f39-4094-a93c-77bdcba77f09 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e7ea9d51-1f39-4094-a93c-77bdcba77f09', 'D344BD76-6623-4E1A-B2F3-03ADF6E3D5B7', 1, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e8388d57-5290-440f-8fde-76f928662227 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e8388d57-5290-440f-8fde-76f928662227', 'D344BD76-6623-4E1A-B2F3-03ADF6E3D5B7', 2, 'Endpoint', 'Endpoint', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 66f2a531-b78c-4232-b36a-2f4863cccf85 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('66f2a531-b78c-4232-b36a-2f4863cccf85', 'D344BD76-6623-4E1A-B2F3-03ADF6E3D5B7', 3, 'Sampled', 'Sampled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D344BD76-6623-4E1A-B2F3-03ADF6E3D5B7 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D344BD76-6623-4E1A-B2F3-03ADF6E3D5B7';

/* SQL text to insert entity field value with ID 82c02972-2fba-48cf-ba6c-60b81ebdf8dd */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82c02972-2fba-48cf-ba6c-60b81ebdf8dd', '149A203F-2B93-4675-AF33-5AA1E2D410C4', 1, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 25574523-88f7-4edd-830a-8e5af88d7718 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('25574523-88f7-4edd-830a-8e5af88d7718', '149A203F-2B93-4675-AF33-5AA1E2D410C4', 2, 'Endpoint', 'Endpoint', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID b0c9ebd6-5992-4971-a4c5-d4654a05cab5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b0c9ebd6-5992-4971-a4c5-d4654a05cab5', '149A203F-2B93-4675-AF33-5AA1E2D410C4', 3, 'Sampled', 'Sampled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 149A203F-2B93-4675-AF33-5AA1E2D410C4 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='149A203F-2B93-4675-AF33-5AA1E2D410C4';


/* Create Entity Relationship: MJ: Company Integration Objects -> MJ: Company Integration Object Fields (One To Many via CompanyIntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3e35edd4-aee5-492d-adde-ce597ceacfff'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3e35edd4-aee5-492d-adde-ce597ceacfff', '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', '01600245-995E-48D1-A60E-52D336AB5D79', 'CompanyIntegrationObjectID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Company Integration Objects -> MJ: Company Integration Object Fields (One To Many via RelatedCompanyIntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0961917a-76bf-44a5-b677-d9e94299e631'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0961917a-76bf-44a5-b677-d9e94299e631', '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', '01600245-995E-48D1-A60E-52D336AB5D79', 'RelatedCompanyIntegrationObjectID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Company Integrations -> MJ: Company Integration Objects (One To Many via CompanyIntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'e8707103-3d8f-4c96-92a7-a2c890a96710'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e8707103-3d8f-4c96-92a7-a2c890a96710', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', 'CompanyIntegrationID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Integration Object Fields -> MJ: Company Integration Object Fields (One To Many via IntegrationObjectFieldID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '36bec07e-034b-4b40-a7ca-050f130f41e8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('36bec07e-034b-4b40-a7ca-050f130f41e8', '3630CBFD-4C85-4B24-8A51-88D67389373E', '01600245-995E-48D1-A60E-52D336AB5D79', 'IntegrationObjectFieldID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Integration Objects -> MJ: Company Integration Objects (One To Many via IntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5cc3e404-7170-4b89-b961-4f090adac8b1'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5cc3e404-7170-4b89-b961-4f090adac8b1', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', 'IntegrationObjectID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;


/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '771dd4ae-b105-4b65-8887-565160b567ac' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'CompanyIntegration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '771dd4ae-b105-4b65-8887-565160b567ac',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'CompanyIntegration',
            'Company Integration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '092b01f7-d54a-4681-962c-439db4c88cad' OR (EntityID = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B' AND Name = 'IntegrationObject')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '092b01f7-d54a-4681-962c-439db4c88cad',
            '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '50B67FF6-9EDB-4C88-9741-1FD6CDF5665B'),
            'IntegrationObject',
            'Integration Object',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e094c00b-0034-4d26-a027-87182dd9267f' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'CompanyIntegrationObject')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e094c00b-0034-4d26-a027-87182dd9267f',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'CompanyIntegrationObject',
            'Company Integration Object',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9ec2035-7dff-4b8b-8266-36b7b43de11b' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'RelatedCompanyIntegrationObject')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f9ec2035-7dff-4b8b-8266-36b7b43de11b',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'RelatedCompanyIntegrationObject',
            'Related Company Integration Object',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f6ceb7d-3856-43c0-87f6-1110d3e571f6' OR (EntityID = '01600245-995E-48D1-A60E-52D336AB5D79' AND Name = 'IntegrationObjectField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1f6ceb7d-3856-43c0-87f6-1110d3e571f6',
            '01600245-995E-48D1-A60E-52D336AB5D79', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '01600245-995E-48D1-A60E-52D336AB5D79'),
            'IntegrationObjectField',
            'Integration Object Field',
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

/* Index for Foreign Keys for CompanyIntegrationObjectField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Object Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationObjectID in table CompanyIntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationObjectField_CompanyIntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationObjectField_CompanyIntegrationObjectID ON [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ([CompanyIntegrationObjectID]);

-- Index for foreign key RelatedCompanyIntegrationObjectID in table CompanyIntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationObjectField_RelatedCompanyIntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationObjectField_RelatedCompanyIntegrationObjectID ON [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ([RelatedCompanyIntegrationObjectID]);

-- Index for foreign key IntegrationObjectFieldID in table CompanyIntegrationObjectField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationObjectField_IntegrationObjectFieldID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObjectField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationObjectField_IntegrationObjectFieldID ON [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ([IntegrationObjectFieldID]);

/* Base View SQL for MJ: Company Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Object Fields
-- Item: vwCompanyIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Object Fields
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationObjectField
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields]
AS
SELECT
    c.*,
    MJCompanyIntegrationObject_CompanyIntegrationObjectID.[Name] AS [CompanyIntegrationObject],
    MJCompanyIntegrationObject_RelatedCompanyIntegrationObjectID.[Name] AS [RelatedCompanyIntegrationObject],
    MJIntegrationObjectField_IntegrationObjectFieldID.[Name] AS [IntegrationObjectField]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationObjectField] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CompanyIntegrationObject] AS MJCompanyIntegrationObject_CompanyIntegrationObjectID
  ON
    [c].[CompanyIntegrationObjectID] = MJCompanyIntegrationObject_CompanyIntegrationObjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CompanyIntegrationObject] AS MJCompanyIntegrationObject_RelatedCompanyIntegrationObjectID
  ON
    [c].[RelatedCompanyIntegrationObjectID] = MJCompanyIntegrationObject_RelatedCompanyIntegrationObjectID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[IntegrationObjectField] AS MJIntegrationObjectField_IntegrationObjectFieldID
  ON
    [c].[IntegrationObjectFieldID] = MJIntegrationObjectField_IntegrationObjectFieldID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Company Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Object Fields
-- Item: Permissions for vwCompanyIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Company Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Object Fields
-- Item: spCreateCompanyIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @Type nvarchar(100),
    @Length_Clear bit = 0,
    @Length int = NULL,
    @Precision_Clear bit = 0,
    @Precision int = NULL,
    @Scale_Clear bit = 0,
    @Scale int = NULL,
    @AllowsNull bit = NULL,
    @DefaultValue_Clear bit = 0,
    @DefaultValue nvarchar(255) = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUniqueKey bit = NULL,
    @IsReadOnly bit = NULL,
    @IsRequired bit = NULL,
    @RelatedIntegrationObjectFieldName_Clear bit = 0,
    @RelatedIntegrationObjectFieldName nvarchar(255) = NULL,
    @Sequence int = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Status nvarchar(25) = NULL,
    @IsCustom bit = NULL,
    @MetadataSource nvarchar(20) = NULL,
    @CompanyIntegrationObjectID uniqueidentifier,
    @RelatedCompanyIntegrationObjectID_Clear bit = 0,
    @RelatedCompanyIntegrationObjectID uniqueidentifier = NULL,
    @IntegrationObjectFieldID_Clear bit = 0,
    @IntegrationObjectFieldID uniqueidentifier = NULL,
    @ObservedMaxLength_Clear bit = 0,
    @ObservedMaxLength int = NULL,
    @Provenance nvarchar(20) = NULL,
    @ProvenanceDetail_Clear bit = 0,
    @ProvenanceDetail nvarchar(MAX) = NULL,
    @IsSelected bit = NULL,
    @SelectedAt_Clear bit = 0,
    @SelectedAt datetimeoffset = NULL,
    @FirstSeenAt_Clear bit = 0,
    @FirstSeenAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @LastSampledAt_Clear bit = 0,
    @LastSampledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationObjectField]
            (
                [ID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status],
                [IsCustom],
                [MetadataSource],
                [CompanyIntegrationObjectID],
                [RelatedCompanyIntegrationObjectID],
                [IntegrationObjectFieldID],
                [ObservedMaxLength],
                [Provenance],
                [ProvenanceDetail],
                [IsSelected],
                [SelectedAt],
                [FirstSeenAt],
                [LastSeenAt],
                [LastSampledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @Type,
                CASE WHEN @Length_Clear = 1 THEN NULL ELSE ISNULL(@Length, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Scale_Clear = 1 THEN NULL ELSE ISNULL(@Scale, NULL) END,
                ISNULL(@AllowsNull, 1),
                CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, NULL) END,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                CASE WHEN @RelatedIntegrationObjectFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectFieldName, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsCustom, 0),
                ISNULL(@MetadataSource, 'Declared'),
                @CompanyIntegrationObjectID,
                CASE WHEN @RelatedCompanyIntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedCompanyIntegrationObjectID, NULL) END,
                CASE WHEN @IntegrationObjectFieldID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationObjectFieldID, NULL) END,
                CASE WHEN @ObservedMaxLength_Clear = 1 THEN NULL ELSE ISNULL(@ObservedMaxLength, NULL) END,
                ISNULL(@Provenance, 'Declared'),
                CASE WHEN @ProvenanceDetail_Clear = 1 THEN NULL ELSE ISNULL(@ProvenanceDetail, NULL) END,
                ISNULL(@IsSelected, 0),
                CASE WHEN @SelectedAt_Clear = 1 THEN NULL ELSE ISNULL(@SelectedAt, NULL) END,
                CASE WHEN @FirstSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstSeenAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                CASE WHEN @LastSampledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSampledAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationObjectField]
            (
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [Type],
                [Length],
                [Precision],
                [Scale],
                [AllowsNull],
                [DefaultValue],
                [IsPrimaryKey],
                [IsUniqueKey],
                [IsReadOnly],
                [IsRequired],
                [RelatedIntegrationObjectFieldName],
                [Sequence],
                [Configuration],
                [Status],
                [IsCustom],
                [MetadataSource],
                [CompanyIntegrationObjectID],
                [RelatedCompanyIntegrationObjectID],
                [IntegrationObjectFieldID],
                [ObservedMaxLength],
                [Provenance],
                [ProvenanceDetail],
                [IsSelected],
                [SelectedAt],
                [FirstSeenAt],
                [LastSeenAt],
                [LastSampledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @Type,
                CASE WHEN @Length_Clear = 1 THEN NULL ELSE ISNULL(@Length, NULL) END,
                CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, NULL) END,
                CASE WHEN @Scale_Clear = 1 THEN NULL ELSE ISNULL(@Scale, NULL) END,
                ISNULL(@AllowsNull, 1),
                CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, NULL) END,
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUniqueKey, 0),
                ISNULL(@IsReadOnly, 0),
                ISNULL(@IsRequired, 0),
                CASE WHEN @RelatedIntegrationObjectFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectFieldName, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsCustom, 0),
                ISNULL(@MetadataSource, 'Declared'),
                @CompanyIntegrationObjectID,
                CASE WHEN @RelatedCompanyIntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedCompanyIntegrationObjectID, NULL) END,
                CASE WHEN @IntegrationObjectFieldID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationObjectFieldID, NULL) END,
                CASE WHEN @ObservedMaxLength_Clear = 1 THEN NULL ELSE ISNULL(@ObservedMaxLength, NULL) END,
                ISNULL(@Provenance, 'Declared'),
                CASE WHEN @ProvenanceDetail_Clear = 1 THEN NULL ELSE ISNULL(@ProvenanceDetail, NULL) END,
                ISNULL(@IsSelected, 0),
                CASE WHEN @SelectedAt_Clear = 1 THEN NULL ELSE ISNULL(@SelectedAt, NULL) END,
                CASE WHEN @FirstSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstSeenAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                CASE WHEN @LastSampledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSampledAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Company Integration Object Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Company Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Object Fields
-- Item: spUpdateCompanyIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField]
    @ID uniqueidentifier,
    @Name nvarchar(255) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @Type nvarchar(100) = NULL,
    @Length_Clear bit = 0,
    @Length int = NULL,
    @Precision_Clear bit = 0,
    @Precision int = NULL,
    @Scale_Clear bit = 0,
    @Scale int = NULL,
    @AllowsNull bit = NULL,
    @DefaultValue_Clear bit = 0,
    @DefaultValue nvarchar(255) = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUniqueKey bit = NULL,
    @IsReadOnly bit = NULL,
    @IsRequired bit = NULL,
    @RelatedIntegrationObjectFieldName_Clear bit = 0,
    @RelatedIntegrationObjectFieldName nvarchar(255) = NULL,
    @Sequence int = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Status nvarchar(25) = NULL,
    @IsCustom bit = NULL,
    @MetadataSource nvarchar(20) = NULL,
    @CompanyIntegrationObjectID uniqueidentifier = NULL,
    @RelatedCompanyIntegrationObjectID_Clear bit = 0,
    @RelatedCompanyIntegrationObjectID uniqueidentifier = NULL,
    @IntegrationObjectFieldID_Clear bit = 0,
    @IntegrationObjectFieldID uniqueidentifier = NULL,
    @ObservedMaxLength_Clear bit = 0,
    @ObservedMaxLength int = NULL,
    @Provenance nvarchar(20) = NULL,
    @ProvenanceDetail_Clear bit = 0,
    @ProvenanceDetail nvarchar(MAX) = NULL,
    @IsSelected bit = NULL,
    @SelectedAt_Clear bit = 0,
    @SelectedAt datetimeoffset = NULL,
    @FirstSeenAt_Clear bit = 0,
    @FirstSeenAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @LastSampledAt_Clear bit = 0,
    @LastSampledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationObjectField]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [Type] = ISNULL(@Type, [Type]),
        [Length] = CASE WHEN @Length_Clear = 1 THEN NULL ELSE ISNULL(@Length, [Length]) END,
        [Precision] = CASE WHEN @Precision_Clear = 1 THEN NULL ELSE ISNULL(@Precision, [Precision]) END,
        [Scale] = CASE WHEN @Scale_Clear = 1 THEN NULL ELSE ISNULL(@Scale, [Scale]) END,
        [AllowsNull] = ISNULL(@AllowsNull, [AllowsNull]),
        [DefaultValue] = CASE WHEN @DefaultValue_Clear = 1 THEN NULL ELSE ISNULL(@DefaultValue, [DefaultValue]) END,
        [IsPrimaryKey] = ISNULL(@IsPrimaryKey, [IsPrimaryKey]),
        [IsUniqueKey] = ISNULL(@IsUniqueKey, [IsUniqueKey]),
        [IsReadOnly] = ISNULL(@IsReadOnly, [IsReadOnly]),
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [RelatedIntegrationObjectFieldName] = CASE WHEN @RelatedIntegrationObjectFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedIntegrationObjectFieldName, [RelatedIntegrationObjectFieldName]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [Status] = ISNULL(@Status, [Status]),
        [IsCustom] = ISNULL(@IsCustom, [IsCustom]),
        [MetadataSource] = ISNULL(@MetadataSource, [MetadataSource]),
        [CompanyIntegrationObjectID] = ISNULL(@CompanyIntegrationObjectID, [CompanyIntegrationObjectID]),
        [RelatedCompanyIntegrationObjectID] = CASE WHEN @RelatedCompanyIntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedCompanyIntegrationObjectID, [RelatedCompanyIntegrationObjectID]) END,
        [IntegrationObjectFieldID] = CASE WHEN @IntegrationObjectFieldID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationObjectFieldID, [IntegrationObjectFieldID]) END,
        [ObservedMaxLength] = CASE WHEN @ObservedMaxLength_Clear = 1 THEN NULL ELSE ISNULL(@ObservedMaxLength, [ObservedMaxLength]) END,
        [Provenance] = ISNULL(@Provenance, [Provenance]),
        [ProvenanceDetail] = CASE WHEN @ProvenanceDetail_Clear = 1 THEN NULL ELSE ISNULL(@ProvenanceDetail, [ProvenanceDetail]) END,
        [IsSelected] = ISNULL(@IsSelected, [IsSelected]),
        [SelectedAt] = CASE WHEN @SelectedAt_Clear = 1 THEN NULL ELSE ISNULL(@SelectedAt, [SelectedAt]) END,
        [FirstSeenAt] = CASE WHEN @FirstSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstSeenAt, [FirstSeenAt]) END,
        [LastSeenAt] = CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, [LastSeenAt]) END,
        [LastSampledAt] = CASE WHEN @LastSampledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSampledAt, [LastSampledAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationObjectFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationObjectField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationObjectField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationObjectField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationObjectField
ON [${flyway:defaultSchema}].[CompanyIntegrationObjectField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationObjectField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationObjectField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Company Integration Object Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Company Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Object Fields
-- Item: spDeleteCompanyIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationObjectField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationObjectField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Company Integration Object Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for CompanyIntegrationObject */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Objects
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationID in table CompanyIntegrationObject
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationObject_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObject]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationObject_CompanyIntegrationID ON [${flyway:defaultSchema}].[CompanyIntegrationObject] ([CompanyIntegrationID]);

-- Index for foreign key IntegrationObjectID in table CompanyIntegrationObject
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationObject_IntegrationObjectID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObject]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationObject_IntegrationObjectID ON [${flyway:defaultSchema}].[CompanyIntegrationObject] ([IntegrationObjectID]);

/* SQL text to update entity field related entity name field map for entity field ID C9F23CBF-A922-4BF4-B20E-3D73B9AA8A51 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C9F23CBF-A922-4BF4-B20E-3D73B9AA8A51', @RelatedEntityNameFieldMap='IntegrationObject';

/* SQL text to update entity field related entity name field map for entity field ID 4C42E357-F513-494C-957B-8D4DC46714DF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4C42E357-F513-494C-957B-8D4DC46714DF', @RelatedEntityNameFieldMap='CompanyIntegrationObject';

/* SQL text to update entity field related entity name field map for entity field ID 1D1CE67F-A5DB-4E9F-B0E0-A3332E7F9730 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1D1CE67F-A5DB-4E9F-B0E0-A3332E7F9730', @RelatedEntityNameFieldMap='RelatedCompanyIntegrationObject';

/* SQL text to update entity field related entity name field map for entity field ID B4A1DDE7-A5BF-425F-A8E1-A19B51839286 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B4A1DDE7-A5BF-425F-A8E1-A19B51839286', @RelatedEntityNameFieldMap='IntegrationObjectField';

/* SQL text to update entity field related entity name field map for entity field ID 6BF7A7D3-070A-45B7-A0B2-09C94EB0D27D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='6BF7A7D3-070A-45B7-A0B2-09C94EB0D27D', @RelatedEntityNameFieldMap='CompanyIntegration';

/* Base View SQL for MJ: Company Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Objects
-- Item: vwCompanyIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Objects
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CompanyIntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCompanyIntegrationObjects]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationObjects];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCompanyIntegrationObjects]
AS
SELECT
    c.*,
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration],
    MJIntegrationObject_IntegrationObjectID.[Name] AS [IntegrationObject]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationObject] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [c].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_IntegrationObjectID
  ON
    [c].[IntegrationObjectID] = MJIntegrationObject_IntegrationObjectID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Company Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Objects
-- Item: Permissions for vwCompanyIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Company Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Objects
-- Item: spCreateCompanyIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject]
    @ID uniqueidentifier = NULL,
    @IntegrationID uniqueidentifier,
    @Name nvarchar(255),
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @APIPath nvarchar(500),
    @ResponseDataKey_Clear bit = 0,
    @ResponseDataKey nvarchar(255) = NULL,
    @DefaultPageSize int = NULL,
    @SupportsPagination bit = NULL,
    @PaginationType nvarchar(20) = NULL,
    @SupportsIncrementalSync bit = NULL,
    @SupportsWrite bit = NULL,
    @DefaultQueryParams_Clear bit = 0,
    @DefaultQueryParams nvarchar(MAX) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @Status nvarchar(25) = NULL,
    @WriteAPIPath_Clear bit = 0,
    @WriteAPIPath nvarchar(500) = NULL,
    @WriteMethod_Clear bit = 0,
    @WriteMethod nvarchar(10) = NULL,
    @DeleteMethod_Clear bit = 0,
    @DeleteMethod nvarchar(10) = NULL,
    @IsCustom bit = NULL,
    @CreateAPIPath_Clear bit = 0,
    @CreateAPIPath nvarchar(MAX) = NULL,
    @CreateMethod_Clear bit = 0,
    @CreateMethod nvarchar(20) = NULL,
    @CreateBodyShape_Clear bit = 0,
    @CreateBodyShape nvarchar(50) = NULL,
    @CreateBodyKey_Clear bit = 0,
    @CreateBodyKey nvarchar(100) = NULL,
    @CreateIDLocation_Clear bit = 0,
    @CreateIDLocation nvarchar(20) = NULL,
    @UpdateAPIPath_Clear bit = 0,
    @UpdateAPIPath nvarchar(MAX) = NULL,
    @UpdateMethod_Clear bit = 0,
    @UpdateMethod nvarchar(20) = NULL,
    @UpdateBodyShape_Clear bit = 0,
    @UpdateBodyShape nvarchar(50) = NULL,
    @UpdateBodyKey_Clear bit = 0,
    @UpdateBodyKey nvarchar(100) = NULL,
    @UpdateIDLocation_Clear bit = 0,
    @UpdateIDLocation nvarchar(20) = NULL,
    @DeleteAPIPath_Clear bit = 0,
    @DeleteAPIPath nvarchar(MAX) = NULL,
    @DeleteIDLocation_Clear bit = 0,
    @DeleteIDLocation nvarchar(20) = NULL,
    @IncrementalWatermarkField_Clear bit = 0,
    @IncrementalWatermarkField nvarchar(255) = NULL,
    @MetadataSource nvarchar(20) = NULL,
    @SupportsCreate bit = NULL,
    @SupportsUpdate bit = NULL,
    @SupportsDelete bit = NULL,
    @SyncStrategy_Clear bit = 0,
    @SyncStrategy nvarchar(50) = NULL,
    @ContentHashApplicable bit = NULL,
    @StableOrderingKey_Clear bit = 0,
    @StableOrderingKey nvarchar(255) = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @IntegrationObjectID_Clear bit = 0,
    @IntegrationObjectID uniqueidentifier = NULL,
    @Provenance nvarchar(20) = NULL,
    @ProvenanceDetail_Clear bit = 0,
    @ProvenanceDetail nvarchar(MAX) = NULL,
    @IsSelected bit = NULL,
    @SelectedAt_Clear bit = 0,
    @SelectedAt datetimeoffset = NULL,
    @FirstSeenAt_Clear bit = 0,
    @FirstSeenAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @LastSampledAt_Clear bit = 0,
    @LastSampledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationObject]
            (
                [ID],
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status],
                [WriteAPIPath],
                [WriteMethod],
                [DeleteMethod],
                [IsCustom],
                [CreateAPIPath],
                [CreateMethod],
                [CreateBodyShape],
                [CreateBodyKey],
                [CreateIDLocation],
                [UpdateAPIPath],
                [UpdateMethod],
                [UpdateBodyShape],
                [UpdateBodyKey],
                [UpdateIDLocation],
                [DeleteAPIPath],
                [DeleteIDLocation],
                [IncrementalWatermarkField],
                [MetadataSource],
                [SupportsCreate],
                [SupportsUpdate],
                [SupportsDelete],
                [SyncStrategy],
                [ContentHashApplicable],
                [StableOrderingKey],
                [CompanyIntegrationID],
                [IntegrationObjectID],
                [Provenance],
                [ProvenanceDetail],
                [IsSelected],
                [SelectedAt],
                [FirstSeenAt],
                [LastSeenAt],
                [LastSampledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @IntegrationID,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @APIPath,
                CASE WHEN @ResponseDataKey_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDataKey, NULL) END,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                CASE WHEN @DefaultQueryParams_Clear = 1 THEN NULL ELSE ISNULL(@DefaultQueryParams, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @WriteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WriteAPIPath, NULL) END,
                CASE WHEN @WriteMethod_Clear = 1 THEN NULL ELSE ISNULL(@WriteMethod, 'POST') END,
                CASE WHEN @DeleteMethod_Clear = 1 THEN NULL ELSE ISNULL(@DeleteMethod, 'DELETE') END,
                ISNULL(@IsCustom, 0),
                CASE WHEN @CreateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@CreateAPIPath, NULL) END,
                CASE WHEN @CreateMethod_Clear = 1 THEN NULL ELSE ISNULL(@CreateMethod, NULL) END,
                CASE WHEN @CreateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyShape, NULL) END,
                CASE WHEN @CreateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyKey, NULL) END,
                CASE WHEN @CreateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@CreateIDLocation, NULL) END,
                CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, NULL) END,
                CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, NULL) END,
                CASE WHEN @UpdateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyShape, NULL) END,
                CASE WHEN @UpdateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyKey, NULL) END,
                CASE WHEN @UpdateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@UpdateIDLocation, NULL) END,
                CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, NULL) END,
                CASE WHEN @DeleteIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@DeleteIDLocation, NULL) END,
                CASE WHEN @IncrementalWatermarkField_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkField, NULL) END,
                ISNULL(@MetadataSource, 'Declared'),
                ISNULL(@SupportsCreate, 0),
                ISNULL(@SupportsUpdate, 0),
                ISNULL(@SupportsDelete, 0),
                CASE WHEN @SyncStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SyncStrategy, NULL) END,
                ISNULL(@ContentHashApplicable, 1),
                CASE WHEN @StableOrderingKey_Clear = 1 THEN NULL ELSE ISNULL(@StableOrderingKey, NULL) END,
                @CompanyIntegrationID,
                CASE WHEN @IntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationObjectID, NULL) END,
                ISNULL(@Provenance, 'Declared'),
                CASE WHEN @ProvenanceDetail_Clear = 1 THEN NULL ELSE ISNULL(@ProvenanceDetail, NULL) END,
                ISNULL(@IsSelected, 0),
                CASE WHEN @SelectedAt_Clear = 1 THEN NULL ELSE ISNULL(@SelectedAt, NULL) END,
                CASE WHEN @FirstSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstSeenAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                CASE WHEN @LastSampledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSampledAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationObject]
            (
                [IntegrationID],
                [Name],
                [DisplayName],
                [Description],
                [Category],
                [APIPath],
                [ResponseDataKey],
                [DefaultPageSize],
                [SupportsPagination],
                [PaginationType],
                [SupportsIncrementalSync],
                [SupportsWrite],
                [DefaultQueryParams],
                [Configuration],
                [Sequence],
                [Status],
                [WriteAPIPath],
                [WriteMethod],
                [DeleteMethod],
                [IsCustom],
                [CreateAPIPath],
                [CreateMethod],
                [CreateBodyShape],
                [CreateBodyKey],
                [CreateIDLocation],
                [UpdateAPIPath],
                [UpdateMethod],
                [UpdateBodyShape],
                [UpdateBodyKey],
                [UpdateIDLocation],
                [DeleteAPIPath],
                [DeleteIDLocation],
                [IncrementalWatermarkField],
                [MetadataSource],
                [SupportsCreate],
                [SupportsUpdate],
                [SupportsDelete],
                [SyncStrategy],
                [ContentHashApplicable],
                [StableOrderingKey],
                [CompanyIntegrationID],
                [IntegrationObjectID],
                [Provenance],
                [ProvenanceDetail],
                [IsSelected],
                [SelectedAt],
                [FirstSeenAt],
                [LastSeenAt],
                [LastSampledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @IntegrationID,
                @Name,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                @APIPath,
                CASE WHEN @ResponseDataKey_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDataKey, NULL) END,
                ISNULL(@DefaultPageSize, 100),
                ISNULL(@SupportsPagination, 1),
                ISNULL(@PaginationType, 'PageNumber'),
                ISNULL(@SupportsIncrementalSync, 0),
                ISNULL(@SupportsWrite, 0),
                CASE WHEN @DefaultQueryParams_Clear = 1 THEN NULL ELSE ISNULL(@DefaultQueryParams, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                ISNULL(@Sequence, 0),
                ISNULL(@Status, 'Active'),
                CASE WHEN @WriteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WriteAPIPath, NULL) END,
                CASE WHEN @WriteMethod_Clear = 1 THEN NULL ELSE ISNULL(@WriteMethod, 'POST') END,
                CASE WHEN @DeleteMethod_Clear = 1 THEN NULL ELSE ISNULL(@DeleteMethod, 'DELETE') END,
                ISNULL(@IsCustom, 0),
                CASE WHEN @CreateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@CreateAPIPath, NULL) END,
                CASE WHEN @CreateMethod_Clear = 1 THEN NULL ELSE ISNULL(@CreateMethod, NULL) END,
                CASE WHEN @CreateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyShape, NULL) END,
                CASE WHEN @CreateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyKey, NULL) END,
                CASE WHEN @CreateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@CreateIDLocation, NULL) END,
                CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, NULL) END,
                CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, NULL) END,
                CASE WHEN @UpdateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyShape, NULL) END,
                CASE WHEN @UpdateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyKey, NULL) END,
                CASE WHEN @UpdateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@UpdateIDLocation, NULL) END,
                CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, NULL) END,
                CASE WHEN @DeleteIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@DeleteIDLocation, NULL) END,
                CASE WHEN @IncrementalWatermarkField_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkField, NULL) END,
                ISNULL(@MetadataSource, 'Declared'),
                ISNULL(@SupportsCreate, 0),
                ISNULL(@SupportsUpdate, 0),
                ISNULL(@SupportsDelete, 0),
                CASE WHEN @SyncStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SyncStrategy, NULL) END,
                ISNULL(@ContentHashApplicable, 1),
                CASE WHEN @StableOrderingKey_Clear = 1 THEN NULL ELSE ISNULL(@StableOrderingKey, NULL) END,
                @CompanyIntegrationID,
                CASE WHEN @IntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationObjectID, NULL) END,
                ISNULL(@Provenance, 'Declared'),
                CASE WHEN @ProvenanceDetail_Clear = 1 THEN NULL ELSE ISNULL(@ProvenanceDetail, NULL) END,
                ISNULL(@IsSelected, 0),
                CASE WHEN @SelectedAt_Clear = 1 THEN NULL ELSE ISNULL(@SelectedAt, NULL) END,
                CASE WHEN @FirstSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstSeenAt, NULL) END,
                CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, NULL) END,
                CASE WHEN @LastSampledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSampledAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Company Integration Objects */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Company Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Objects
-- Item: spUpdateCompanyIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject]
    @ID uniqueidentifier,
    @IntegrationID uniqueidentifier = NULL,
    @Name nvarchar(255) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(100) = NULL,
    @APIPath nvarchar(500) = NULL,
    @ResponseDataKey_Clear bit = 0,
    @ResponseDataKey nvarchar(255) = NULL,
    @DefaultPageSize int = NULL,
    @SupportsPagination bit = NULL,
    @PaginationType nvarchar(20) = NULL,
    @SupportsIncrementalSync bit = NULL,
    @SupportsWrite bit = NULL,
    @DefaultQueryParams_Clear bit = 0,
    @DefaultQueryParams nvarchar(MAX) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @Sequence int = NULL,
    @Status nvarchar(25) = NULL,
    @WriteAPIPath_Clear bit = 0,
    @WriteAPIPath nvarchar(500) = NULL,
    @WriteMethod_Clear bit = 0,
    @WriteMethod nvarchar(10) = NULL,
    @DeleteMethod_Clear bit = 0,
    @DeleteMethod nvarchar(10) = NULL,
    @IsCustom bit = NULL,
    @CreateAPIPath_Clear bit = 0,
    @CreateAPIPath nvarchar(MAX) = NULL,
    @CreateMethod_Clear bit = 0,
    @CreateMethod nvarchar(20) = NULL,
    @CreateBodyShape_Clear bit = 0,
    @CreateBodyShape nvarchar(50) = NULL,
    @CreateBodyKey_Clear bit = 0,
    @CreateBodyKey nvarchar(100) = NULL,
    @CreateIDLocation_Clear bit = 0,
    @CreateIDLocation nvarchar(20) = NULL,
    @UpdateAPIPath_Clear bit = 0,
    @UpdateAPIPath nvarchar(MAX) = NULL,
    @UpdateMethod_Clear bit = 0,
    @UpdateMethod nvarchar(20) = NULL,
    @UpdateBodyShape_Clear bit = 0,
    @UpdateBodyShape nvarchar(50) = NULL,
    @UpdateBodyKey_Clear bit = 0,
    @UpdateBodyKey nvarchar(100) = NULL,
    @UpdateIDLocation_Clear bit = 0,
    @UpdateIDLocation nvarchar(20) = NULL,
    @DeleteAPIPath_Clear bit = 0,
    @DeleteAPIPath nvarchar(MAX) = NULL,
    @DeleteIDLocation_Clear bit = 0,
    @DeleteIDLocation nvarchar(20) = NULL,
    @IncrementalWatermarkField_Clear bit = 0,
    @IncrementalWatermarkField nvarchar(255) = NULL,
    @MetadataSource nvarchar(20) = NULL,
    @SupportsCreate bit = NULL,
    @SupportsUpdate bit = NULL,
    @SupportsDelete bit = NULL,
    @SyncStrategy_Clear bit = 0,
    @SyncStrategy nvarchar(50) = NULL,
    @ContentHashApplicable bit = NULL,
    @StableOrderingKey_Clear bit = 0,
    @StableOrderingKey nvarchar(255) = NULL,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @IntegrationObjectID_Clear bit = 0,
    @IntegrationObjectID uniqueidentifier = NULL,
    @Provenance nvarchar(20) = NULL,
    @ProvenanceDetail_Clear bit = 0,
    @ProvenanceDetail nvarchar(MAX) = NULL,
    @IsSelected bit = NULL,
    @SelectedAt_Clear bit = 0,
    @SelectedAt datetimeoffset = NULL,
    @FirstSeenAt_Clear bit = 0,
    @FirstSeenAt datetimeoffset = NULL,
    @LastSeenAt_Clear bit = 0,
    @LastSeenAt datetimeoffset = NULL,
    @LastSampledAt_Clear bit = 0,
    @LastSampledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationObject]
    SET
        [IntegrationID] = ISNULL(@IntegrationID, [IntegrationID]),
        [Name] = ISNULL(@Name, [Name]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [APIPath] = ISNULL(@APIPath, [APIPath]),
        [ResponseDataKey] = CASE WHEN @ResponseDataKey_Clear = 1 THEN NULL ELSE ISNULL(@ResponseDataKey, [ResponseDataKey]) END,
        [DefaultPageSize] = ISNULL(@DefaultPageSize, [DefaultPageSize]),
        [SupportsPagination] = ISNULL(@SupportsPagination, [SupportsPagination]),
        [PaginationType] = ISNULL(@PaginationType, [PaginationType]),
        [SupportsIncrementalSync] = ISNULL(@SupportsIncrementalSync, [SupportsIncrementalSync]),
        [SupportsWrite] = ISNULL(@SupportsWrite, [SupportsWrite]),
        [DefaultQueryParams] = CASE WHEN @DefaultQueryParams_Clear = 1 THEN NULL ELSE ISNULL(@DefaultQueryParams, [DefaultQueryParams]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Status] = ISNULL(@Status, [Status]),
        [WriteAPIPath] = CASE WHEN @WriteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@WriteAPIPath, [WriteAPIPath]) END,
        [WriteMethod] = CASE WHEN @WriteMethod_Clear = 1 THEN NULL ELSE ISNULL(@WriteMethod, [WriteMethod]) END,
        [DeleteMethod] = CASE WHEN @DeleteMethod_Clear = 1 THEN NULL ELSE ISNULL(@DeleteMethod, [DeleteMethod]) END,
        [IsCustom] = ISNULL(@IsCustom, [IsCustom]),
        [CreateAPIPath] = CASE WHEN @CreateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@CreateAPIPath, [CreateAPIPath]) END,
        [CreateMethod] = CASE WHEN @CreateMethod_Clear = 1 THEN NULL ELSE ISNULL(@CreateMethod, [CreateMethod]) END,
        [CreateBodyShape] = CASE WHEN @CreateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyShape, [CreateBodyShape]) END,
        [CreateBodyKey] = CASE WHEN @CreateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@CreateBodyKey, [CreateBodyKey]) END,
        [CreateIDLocation] = CASE WHEN @CreateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@CreateIDLocation, [CreateIDLocation]) END,
        [UpdateAPIPath] = CASE WHEN @UpdateAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@UpdateAPIPath, [UpdateAPIPath]) END,
        [UpdateMethod] = CASE WHEN @UpdateMethod_Clear = 1 THEN NULL ELSE ISNULL(@UpdateMethod, [UpdateMethod]) END,
        [UpdateBodyShape] = CASE WHEN @UpdateBodyShape_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyShape, [UpdateBodyShape]) END,
        [UpdateBodyKey] = CASE WHEN @UpdateBodyKey_Clear = 1 THEN NULL ELSE ISNULL(@UpdateBodyKey, [UpdateBodyKey]) END,
        [UpdateIDLocation] = CASE WHEN @UpdateIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@UpdateIDLocation, [UpdateIDLocation]) END,
        [DeleteAPIPath] = CASE WHEN @DeleteAPIPath_Clear = 1 THEN NULL ELSE ISNULL(@DeleteAPIPath, [DeleteAPIPath]) END,
        [DeleteIDLocation] = CASE WHEN @DeleteIDLocation_Clear = 1 THEN NULL ELSE ISNULL(@DeleteIDLocation, [DeleteIDLocation]) END,
        [IncrementalWatermarkField] = CASE WHEN @IncrementalWatermarkField_Clear = 1 THEN NULL ELSE ISNULL(@IncrementalWatermarkField, [IncrementalWatermarkField]) END,
        [MetadataSource] = ISNULL(@MetadataSource, [MetadataSource]),
        [SupportsCreate] = ISNULL(@SupportsCreate, [SupportsCreate]),
        [SupportsUpdate] = ISNULL(@SupportsUpdate, [SupportsUpdate]),
        [SupportsDelete] = ISNULL(@SupportsDelete, [SupportsDelete]),
        [SyncStrategy] = CASE WHEN @SyncStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SyncStrategy, [SyncStrategy]) END,
        [ContentHashApplicable] = ISNULL(@ContentHashApplicable, [ContentHashApplicable]),
        [StableOrderingKey] = CASE WHEN @StableOrderingKey_Clear = 1 THEN NULL ELSE ISNULL(@StableOrderingKey, [StableOrderingKey]) END,
        [CompanyIntegrationID] = ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]),
        [IntegrationObjectID] = CASE WHEN @IntegrationObjectID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationObjectID, [IntegrationObjectID]) END,
        [Provenance] = ISNULL(@Provenance, [Provenance]),
        [ProvenanceDetail] = CASE WHEN @ProvenanceDetail_Clear = 1 THEN NULL ELSE ISNULL(@ProvenanceDetail, [ProvenanceDetail]) END,
        [IsSelected] = ISNULL(@IsSelected, [IsSelected]),
        [SelectedAt] = CASE WHEN @SelectedAt_Clear = 1 THEN NULL ELSE ISNULL(@SelectedAt, [SelectedAt]) END,
        [FirstSeenAt] = CASE WHEN @FirstSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstSeenAt, [FirstSeenAt]) END,
        [LastSeenAt] = CASE WHEN @LastSeenAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSeenAt, [LastSeenAt]) END,
        [LastSampledAt] = CASE WHEN @LastSampledAt_Clear = 1 THEN NULL ELSE ISNULL(@LastSampledAt, [LastSampledAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationObjects] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationObjects]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationObject table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationObject]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationObject];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationObject
ON [${flyway:defaultSchema}].[CompanyIntegrationObject]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationObject]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationObject] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Company Integration Objects */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Company Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Objects
-- Item: spDeleteCompanyIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationObject
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationObject]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Company Integration Objects */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];
