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
GO
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
GO

-- ==============================================================================================
-- 2. Defaults
-- ==============================================================================================
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_ID] DEFAULT (newsequentialid()) FOR [ID];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_DefaultPageSize] DEFAULT ((100)) FOR [DefaultPageSize];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsPagination] DEFAULT ((1)) FOR [SupportsPagination];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_PaginationType] DEFAULT ('PageNumber') FOR [PaginationType];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsIncrementalSync] DEFAULT ((0)) FOR [SupportsIncrementalSync];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsWrite] DEFAULT ((0)) FOR [SupportsWrite];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_Sequence] DEFAULT ((0)) FOR [Sequence];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_Status] DEFAULT ('Active') FOR [Status];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_WriteMethod] DEFAULT ('POST') FOR [WriteMethod];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_DeleteMethod] DEFAULT ('DELETE') FOR [DeleteMethod];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_IsCustom] DEFAULT ((0)) FOR [IsCustom];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_MetadataSource] DEFAULT ('Declared') FOR [MetadataSource];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsCreate] DEFAULT ((0)) FOR [SupportsCreate];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsUpdate] DEFAULT ((0)) FOR [SupportsUpdate];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_SupportsDelete] DEFAULT ((0)) FOR [SupportsDelete];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_ContentHashApplicable] DEFAULT ((1)) FOR [ContentHashApplicable];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_Provenance] DEFAULT ('Declared') FOR [Provenance];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF_CompanyIntegrationObject_IsSelected] DEFAULT ((0)) FOR [IsSelected];

GO
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_ID] DEFAULT (newsequentialid()) FOR [ID];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_AllowsNull] DEFAULT ((1)) FOR [AllowsNull];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsPrimaryKey] DEFAULT ((0)) FOR [IsPrimaryKey];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsUniqueKey] DEFAULT ((0)) FOR [IsUniqueKey];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsReadOnly] DEFAULT ((0)) FOR [IsReadOnly];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsRequired] DEFAULT ((0)) FOR [IsRequired];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_Sequence] DEFAULT ((0)) FOR [Sequence];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_Status] DEFAULT ('Active') FOR [Status];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsCustom] DEFAULT ((0)) FOR [IsCustom];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_MetadataSource] DEFAULT ('Declared') FOR [MetadataSource];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_Provenance] DEFAULT ('Declared') FOR [Provenance];

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF_CompanyIntegrationObjectField_IsSelected] DEFAULT ((0)) FOR [IsSelected];

GO

-- ==============================================================================================
-- 3. Keys, foreign keys and checks
-- ==============================================================================================
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [PK_CompanyIntegrationObject] PRIMARY KEY CLUSTERED ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [UQ_CompanyIntegrationObject_Name] UNIQUE NONCLUSTERED ([CompanyIntegrationID], [Name]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [FK_CompanyIntegrationObject_CompanyIntegrationID] FOREIGN KEY ([CompanyIntegrationID]) REFERENCES [${flyway:defaultSchema}].[CompanyIntegration] ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [FK_CompanyIntegrationObject_IntegrationObjectID] FOREIGN KEY ([IntegrationObjectID]) REFERENCES [${flyway:defaultSchema}].[IntegrationObject] ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [CK_CompanyIntegrationObject_Provenance] CHECK ([Provenance] IN ('Declared','Endpoint','Sampled'));
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [CK_CompanyIntegrationObject_Status] CHECK ([Status] IN ('Active','Deprecated','Disabled'));
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [CK_CompanyIntegrationObject_MetadataSource] CHECK ([MetadataSource] IN ('Declared','Discovered','Custom'));
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [FK_CompanyIntegrationObject_IntegrationID] FOREIGN KEY ([IntegrationID]) REFERENCES [${flyway:defaultSchema}].[Integration] ([ID]);

GO
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [PK_CompanyIntegrationObjectField] PRIMARY KEY CLUSTERED ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [UQ_CompanyIntegrationObjectField_Name] UNIQUE NONCLUSTERED ([CompanyIntegrationObjectID], [Name]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [FK_CompanyIntegrationObjectField_CompanyIntegrationObjectID] FOREIGN KEY ([CompanyIntegrationObjectID]) REFERENCES [${flyway:defaultSchema}].[CompanyIntegrationObject] ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [FK_CompanyIntegrationObjectField_RelatedCompanyIntegrationObjectID] FOREIGN KEY ([RelatedCompanyIntegrationObjectID]) REFERENCES [${flyway:defaultSchema}].[CompanyIntegrationObject] ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [FK_CompanyIntegrationObjectField_IntegrationObjectFieldID] FOREIGN KEY ([IntegrationObjectFieldID]) REFERENCES [${flyway:defaultSchema}].[IntegrationObjectField] ([ID]);

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [CK_CompanyIntegrationObjectField_Provenance] CHECK ([Provenance] IN ('Declared','Endpoint','Sampled'));
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [CK_CompanyIntegrationObjectField_Status] CHECK ([Status] IN ('Active','Deprecated','Disabled'));
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [CK_CompanyIntegrationObjectField_MetadataSource] CHECK ([MetadataSource] IN ('Declared','Discovered','Custom'));

GO

-- ==============================================================================================
-- 4. Indexes (composite only — CodeGen creates the single-column foreign-key indexes)
-- ==============================================================================================
CREATE INDEX [IX_CompanyIntegrationObject_Connection_Status_Sequence] ON [${flyway:defaultSchema}].[CompanyIntegrationObject] ([CompanyIntegrationID], [Status], [Sequence]);


GO
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
    @name = N'MS_Description', @value = N'The integration (connector) this object belongs to. Always the IntegrationID of the owning CompanyIntegration, copied onto the row by the catalog writer so the per-connection catalog can be read through the same projection as the shared IntegrationObject catalog.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationObject',
    @level2type = N'COLUMN', @level2name = N'IntegrationID';
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
    @name = N'MS_Description', @value = N'Provenance of this CompanyIntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.',
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
    @name = N'MS_Description', @value = N'Provenance of this CompanyIntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.',
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
 **  contains, for MJ: Company Integration Objects and MJ: Company Integration Object Fields:     **
 **    • the __mj_CreatedAt / __mj_UpdatedAt columns CodeGen owns, with their defaults            **
 **    • the Entity rows, application membership and role permissions                            **
 **    • the EntityField rows (apply-time Sequence), value lists and EntityRelationship rows      **
 **    • foreign-key indexes, base views and their permissions                                    **
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
         '3c30fa05-9490-49f0-8943-6052573c66b2',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '3c30fa05-9490-49f0-8943-6052573c66b2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Company Integration Objects for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Objects for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Objects for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3c30fa05-9490-49f0-8943-6052573c66b2' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
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
         '2d4f0c97-b8f8-46be-b75a-bfa90f93d368',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '2d4f0c97-b8f8-46be-b75a-bfa90f93d368', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Company Integration Object Fields for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('2d4f0c97-b8f8-46be-b75a-bfa90f93d368' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
UPDATE [${flyway:defaultSchema}].[CompanyIntegrationObject] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF___mj_CompanyIntegrationObject___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
UPDATE [${flyway:defaultSchema}].[CompanyIntegrationObject] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObject */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObject] ADD CONSTRAINT [DF___mj_CompanyIntegrationObject___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
UPDATE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF___mj_CompanyIntegrationObjectField___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
UPDATE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.CompanyIntegrationObjectField */
ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationObjectField] ADD CONSTRAINT [DF___mj_CompanyIntegrationObjectField___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 86 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '05be7057-744d-4633-b84d-0903cd97ea2c' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '05be7057-744d-4633-b84d-0903cd97ea2c',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '507eba52-4eed-4a99-bf38-8057856ea2dd' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'IntegrationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '507eba52-4eed-4a99-bf38-8057856ea2dd',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
            'IntegrationID',
            'Integration ID',
            'The integration (connector) this object belongs to. Always the IntegrationID of the owning CompanyIntegration, copied onto the row by the catalog writer so the per-connection catalog can be read through the same projection as the shared IntegrationObject catalog.',
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
            'DD238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3016c7c1-9590-458d-bee2-63e243bd1563' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3016c7c1-9590-458d-bee2-63e243bd1563',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15ba5f59-d1c7-4c0b-afe7-4180206fd238' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '15ba5f59-d1c7-4c0b-afe7-4180206fd238',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '906841c6-b61b-48da-ad0e-3e4f2548f8a5' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '906841c6-b61b-48da-ad0e-3e4f2548f8a5',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cd803190-da6e-4672-9068-d16facb5c38b' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cd803190-da6e-4672-9068-d16facb5c38b',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'faa619bc-1892-4592-8161-d87271ee248e' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'APIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'faa619bc-1892-4592-8161-d87271ee248e',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '088667b9-6ff6-45c7-b537-1e84f5da2bf6' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'ResponseDataKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '088667b9-6ff6-45c7-b537-1e84f5da2bf6',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4b7f90d2-84e4-4a50-9e39-1f6aa7ae41d0' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'DefaultPageSize')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4b7f90d2-84e4-4a50-9e39-1f6aa7ae41d0',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c10df761-0fb3-4892-9b6d-8803df35919b' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SupportsPagination')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c10df761-0fb3-4892-9b6d-8803df35919b',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '45a82d17-8ce7-4329-877a-f613a6d13a5c' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'PaginationType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '45a82d17-8ce7-4329-877a-f613a6d13a5c',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dee5e70d-93eb-4b6e-9d3b-1c14c318d725' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SupportsIncrementalSync')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dee5e70d-93eb-4b6e-9d3b-1c14c318d725',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc6f770a-d31a-41cd-bbb3-1362bda880b0' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SupportsWrite')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dc6f770a-d31a-41cd-bbb3-1362bda880b0',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cef10f98-441a-4295-9317-b243475277fd' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'DefaultQueryParams')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cef10f98-441a-4295-9317-b243475277fd',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edc25016-6696-4001-bb01-a6cf7d65cae5' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'edc25016-6696-4001-bb01-a6cf7d65cae5',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd579d52a-2ee9-4cf3-88a8-284ce92a6171' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd579d52a-2ee9-4cf3-88a8-284ce92a6171',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c0706f7-ff1b-46fc-a9e1-2325eba3de7e' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3c0706f7-ff1b-46fc-a9e1-2325eba3de7e',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7feac66f-2348-411e-b22a-8a32c1ac55a8' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'WriteAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7feac66f-2348-411e-b22a-8a32c1ac55a8',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c3f0821-6297-4d02-90a8-0b704332a2ac' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'WriteMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2c3f0821-6297-4d02-90a8-0b704332a2ac',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9485116a-ca15-4d3a-8ac3-d7bd4f5f63d0' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'DeleteMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9485116a-ca15-4d3a-8ac3-d7bd4f5f63d0',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '15c21343-cea7-4fa0-a2fd-5d159b9f3861' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'IsCustom')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '15c21343-cea7-4fa0-a2fd-5d159b9f3861',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '241534a8-70f3-4dfa-8a5a-37909df2ba1d' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'CreateAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '241534a8-70f3-4dfa-8a5a-37909df2ba1d',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'af3f53cc-bee7-4e68-acab-4e59cd4913e0' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'CreateMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'af3f53cc-bee7-4e68-acab-4e59cd4913e0',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '40ac4e03-4321-4118-b42d-66cb9b6caf33' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'CreateBodyShape')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '40ac4e03-4321-4118-b42d-66cb9b6caf33',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a5afd09-1ac7-4a94-840d-80551d243a77' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'CreateBodyKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0a5afd09-1ac7-4a94-840d-80551d243a77',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '707156ac-99d7-457e-8e72-142c2e80cc7e' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'CreateIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '707156ac-99d7-457e-8e72-142c2e80cc7e',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0aaf72cb-e783-4022-855b-eacdc22ff67c' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'UpdateAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0aaf72cb-e783-4022-855b-eacdc22ff67c',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba4ff9e5-09f9-43a0-8927-8f1f716e30f8' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'UpdateMethod')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ba4ff9e5-09f9-43a0-8927-8f1f716e30f8',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68f6fdf4-096d-456c-8d14-0f00ba8b5c81' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'UpdateBodyShape')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '68f6fdf4-096d-456c-8d14-0f00ba8b5c81',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f6bbea2-f077-451f-9dbe-ca1cde755a67' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'UpdateBodyKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f6bbea2-f077-451f-9dbe-ca1cde755a67',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1e4b087b-f7d1-4e16-be36-cc732e3276b1' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'UpdateIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1e4b087b-f7d1-4e16-be36-cc732e3276b1',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a4930718-50dd-486a-af4f-780d9f80d288' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'DeleteAPIPath')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a4930718-50dd-486a-af4f-780d9f80d288',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '845be607-43ef-4e44-9ad9-2b46be8778d3' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'DeleteIDLocation')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '845be607-43ef-4e44-9ad9-2b46be8778d3',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c979f76e-c2bf-4b33-9086-354f265cf9e2' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'IncrementalWatermarkField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c979f76e-c2bf-4b33-9086-354f265cf9e2',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '28b7beac-de05-4288-ab76-76be01577a9b' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'MetadataSource')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '28b7beac-de05-4288-ab76-76be01577a9b',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
            'MetadataSource',
            'Metadata Source',
            'Provenance of this CompanyIntegrationObject row: Declared (from static research/docs), Discovered (from runtime API introspection like Salesforce /describe), Custom (genuinely customer-created, e.g., HubSpot custom objects). Drives merge precedence in IntegrationSchemaSync.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f667abf4-3f36-468f-af2f-3e2af3dc245d' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SupportsCreate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f667abf4-3f36-468f-af2f-3e2af3dc245d',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '66dbd225-b2e1-4a6c-b319-8b35ad8fc191' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SupportsUpdate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '66dbd225-b2e1-4a6c-b319-8b35ad8fc191',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1fb8d585-3341-4c41-8ed8-6dd79da4c827' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SupportsDelete')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1fb8d585-3341-4c41-8ed8-6dd79da4c827',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'edfdd822-2808-457b-8d89-d2a6e5486283' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SyncStrategy')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'edfdd822-2808-457b-8d89-d2a6e5486283',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '915824e0-c086-4f28-876f-d9f5a0849b6c' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'ContentHashApplicable')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '915824e0-c086-4f28-876f-d9f5a0849b6c',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b90d39ca-efbc-4b14-a352-26c44f05be6e' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'StableOrderingKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b90d39ca-efbc-4b14-a352-26c44f05be6e',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'abd44592-2ec6-45a4-91a2-a6aa7de62d6f' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'CompanyIntegrationID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'abd44592-2ec6-45a4-91a2-a6aa7de62d6f',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b4dc9c5-2c8d-43fb-a56a-da2baa3366b9' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'IntegrationObjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b4dc9c5-2c8d-43fb-a56a-da2baa3366b9',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd42e167c-1e9c-4ef0-8d99-7208d251cf11' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Provenance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd42e167c-1e9c-4ef0-8d99-7208d251cf11',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '064b2c60-2312-421f-99b8-45e752e52ca8' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'ProvenanceDetail')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '064b2c60-2312-421f-99b8-45e752e52ca8',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8fa0212-2c88-4b7b-b2a5-c91720e9fdb4' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'IsSelected')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f8fa0212-2c88-4b7b-b2a5-c91720e9fdb4',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53bf6da6-a187-4d71-a990-411b85712296' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'SelectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '53bf6da6-a187-4d71-a990-411b85712296',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd836b032-97d7-4d8a-833f-5b197be0d7cf' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'FirstSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd836b032-97d7-4d8a-833f-5b197be0d7cf',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ebbafcc-b81c-4f2a-ae8a-cb32ecca1464' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'LastSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6ebbafcc-b81c-4f2a-ae8a-cb32ecca1464',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b82c2390-d728-4328-b8bb-dc4d6614a628' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'LastSampledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b82c2390-d728-4328-b8bb-dc4d6614a628',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2158cb0-d019-46be-808b-6870df948930' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e2158cb0-d019-46be-808b-6870df948930',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a7e15ec-1590-4996-8621-8f98d2f0b49f' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2a7e15ec-1590-4996-8621-8f98d2f0b49f',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24688f29-d02b-469a-9a0a-78341e7015f4' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '24688f29-d02b-469a-9a0a-78341e7015f4',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '29e0f8f6-10d4-402a-a354-e072fbab8230' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '29e0f8f6-10d4-402a-a354-e072fbab8230',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2fd7f3ae-c357-4382-98ef-7478ca3e7ede' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2fd7f3ae-c357-4382-98ef-7478ca3e7ede',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '08097355-34de-4dcc-a05a-24690940e7e0' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '08097355-34de-4dcc-a05a-24690940e7e0',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ce012f0d-7b86-42be-a052-f9cd46743411' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ce012f0d-7b86-42be-a052-f9cd46743411',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0e162f4d-c802-4f17-8006-cfdec81ce837' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0e162f4d-c802-4f17-8006-cfdec81ce837',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '557b76b4-3241-4741-9c66-b18bc42d86af' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Length')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '557b76b4-3241-4741-9c66-b18bc42d86af',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd8edc170-38d2-4725-a9ce-6ae9b9d1ef48' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Precision')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8edc170-38d2-4725-a9ce-6ae9b9d1ef48',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b54d45f7-d0c0-4a3f-82a5-36ab576f9241' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Scale')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b54d45f7-d0c0-4a3f-82a5-36ab576f9241',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '99531a77-462f-4727-b7e1-88f924611102' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'AllowsNull')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '99531a77-462f-4727-b7e1-88f924611102',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b709b65a-70e6-4d58-802a-925f515bdf7c' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'DefaultValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b709b65a-70e6-4d58-802a-925f515bdf7c',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a0088e52-841d-40ca-a367-a9616be16d1e' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IsPrimaryKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a0088e52-841d-40ca-a367-a9616be16d1e',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f017513d-1f90-43f4-812c-61209794bc7e' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IsUniqueKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f017513d-1f90-43f4-812c-61209794bc7e',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '606f96cc-e081-4e59-aa0a-886ac2046293' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IsReadOnly')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '606f96cc-e081-4e59-aa0a-886ac2046293',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '974f8c55-18da-43e7-9139-6b330b6d7e13' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IsRequired')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '974f8c55-18da-43e7-9139-6b330b6d7e13',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '57f93aee-da62-44ff-b09f-c11e27362b23' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'RelatedIntegrationObjectFieldName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '57f93aee-da62-44ff-b09f-c11e27362b23',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9df9e3f9-d6de-4c74-a9a6-a761c924b87d' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9df9e3f9-d6de-4c74-a9a6-a761c924b87d',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '913072cf-49a4-410a-9649-c1a916e0ee2f' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Configuration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '913072cf-49a4-410a-9649-c1a916e0ee2f',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ad492f95-b325-425a-8370-33aaee0cab22' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ad492f95-b325-425a-8370-33aaee0cab22',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '26b2bf39-cf02-407c-a8fd-be46df396edd' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IsCustom')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '26b2bf39-cf02-407c-a8fd-be46df396edd',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f7c5ca70-f531-4c56-9827-6860b7214397' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'MetadataSource')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f7c5ca70-f531-4c56-9827-6860b7214397',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
            'MetadataSource',
            'Metadata Source',
            'Provenance of this CompanyIntegrationObjectField row: Declared (from static research/docs), Discovered (from runtime API introspection), Custom (customer-defined custom field, e.g., HubSpot custom property on standard object). Drives merge precedence — discovered/runtime wins for type/constraints; declared wins for description/label/sequence/category.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b96cddd-d560-44f3-922b-a60947326adf' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'CompanyIntegrationObjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b96cddd-d560-44f3-922b-a60947326adf',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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
            '3C30FA05-9490-49F0-8943-6052573C66B2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3df5b72-312b-42ae-84bc-766a24d2d23a' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'RelatedCompanyIntegrationObjectID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f3df5b72-312b-42ae-84bc-766a24d2d23a',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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
            '3C30FA05-9490-49F0-8943-6052573C66B2',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f599e5b-ec18-4c64-a703-c9288c9fd8e0' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IntegrationObjectFieldID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4f599e5b-ec18-4c64-a703-c9288c9fd8e0',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a883aed-85e2-4e75-9f3b-e77be362060a' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'ObservedMaxLength')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a883aed-85e2-4e75-9f3b-e77be362060a',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c938ab2b-08a0-4b4b-8a0a-d4891468d993' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'Provenance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c938ab2b-08a0-4b4b-8a0a-d4891468d993',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fc40cce5-1013-4497-86ac-fc063fbe3017' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'ProvenanceDetail')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fc40cce5-1013-4497-86ac-fc063fbe3017',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2b2d43b7-3603-486b-ab75-180835c97e47' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IsSelected')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b2d43b7-3603-486b-ab75-180835c97e47',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2406202c-c8a8-48e1-b656-ae471e90444d' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'SelectedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2406202c-c8a8-48e1-b656-ae471e90444d',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0abe020-59ac-4084-81fc-a7d429913962' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'FirstSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b0abe020-59ac-4084-81fc-a7d429913962',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '88b368a0-c9bc-43c7-812d-bec153989ed1' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'LastSeenAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '88b368a0-c9bc-43c7-812d-bec153989ed1',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1d2f7b68-831f-4f17-b3f4-c9d41cc87c13' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'LastSampledAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1d2f7b68-831f-4f17-b3f4-c9d41cc87c13',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '414682a2-eea2-46ca-bed1-b0a0d9b76df0' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '414682a2-eea2-46ca-bed1-b0a0d9b76df0',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6919d3b3-206e-4e69-b8b5-77ad4b68973b' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6919d3b3-206e-4e69-b8b5-77ad4b68973b',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

/* SQL text to insert entity field value with ID 5ec4d75c-1813-4238-93e3-aa5fa8ca15c9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5ec4d75c-1813-4238-93e3-aa5fa8ca15c9', 'D42E167C-1E9C-4EF0-8D99-7208D251CF11', 1, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9cfba287-bfbc-472a-8bd6-7b59896051e9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9cfba287-bfbc-472a-8bd6-7b59896051e9', 'D42E167C-1E9C-4EF0-8D99-7208D251CF11', 2, 'Endpoint', 'Endpoint', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 41e99c5d-6597-49af-9511-a6929ab02f56 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('41e99c5d-6597-49af-9511-a6929ab02f56', 'D42E167C-1E9C-4EF0-8D99-7208D251CF11', 3, 'Sampled', 'Sampled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D42E167C-1E9C-4EF0-8D99-7208D251CF11 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='D42E167C-1E9C-4EF0-8D99-7208D251CF11';

/* SQL text to insert entity field value with ID b88992e1-89ad-4a54-afae-212bc49dda3c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b88992e1-89ad-4a54-afae-212bc49dda3c', '3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 97dfe4c3-d118-435e-8659-917e181fd28c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('97dfe4c3-d118-435e-8659-917e181fd28c', '3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID aa4e41f1-ff4f-4b9c-9395-c37d63ccde03 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('aa4e41f1-ff4f-4b9c-9395-c37d63ccde03', '3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3C0706F7-FF1B-46FC-A9E1-2325EBA3DE7E';

/* SQL text to insert entity field value with ID 8b0b9d8a-15b6-4831-b54c-efaff1cf5c20 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8b0b9d8a-15b6-4831-b54c-efaff1cf5c20', '28B7BEAC-DE05-4288-AB76-76BE01577A9B', 1, 'Custom', 'Custom', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e3663f3b-9bdd-497d-8142-733e23e69b31 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e3663f3b-9bdd-497d-8142-733e23e69b31', '28B7BEAC-DE05-4288-AB76-76BE01577A9B', 2, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 27db8169-8521-4d58-aa35-94d351f68094 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('27db8169-8521-4d58-aa35-94d351f68094', '28B7BEAC-DE05-4288-AB76-76BE01577A9B', 3, 'Discovered', 'Discovered', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 28B7BEAC-DE05-4288-AB76-76BE01577A9B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='28B7BEAC-DE05-4288-AB76-76BE01577A9B';

/* SQL text to insert entity field value with ID ffe6ab0c-c134-466d-83fe-28ab29031291 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ffe6ab0c-c134-466d-83fe-28ab29031291', 'C938AB2B-08A0-4B4B-8A0A-D4891468D993', 1, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5263c9cb-1ddc-4beb-b0a8-f64b3217bf9a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5263c9cb-1ddc-4beb-b0a8-f64b3217bf9a', 'C938AB2B-08A0-4B4B-8A0A-D4891468D993', 2, 'Endpoint', 'Endpoint', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8f2fc18c-faab-4a05-9d38-194fd88b61e3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8f2fc18c-faab-4a05-9d38-194fd88b61e3', 'C938AB2B-08A0-4B4B-8A0A-D4891468D993', 3, 'Sampled', 'Sampled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C938AB2B-08A0-4B4B-8A0A-D4891468D993 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='C938AB2B-08A0-4B4B-8A0A-D4891468D993';

/* SQL text to insert entity field value with ID 7c5845ad-3a8d-41c3-8a4b-2dc0e0e5facb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7c5845ad-3a8d-41c3-8a4b-2dc0e0e5facb', 'AD492F95-B325-425A-8370-33AAEE0CAB22', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 17f83105-daf7-4281-b55a-1db9ef7a1f60 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('17f83105-daf7-4281-b55a-1db9ef7a1f60', 'AD492F95-B325-425A-8370-33AAEE0CAB22', 2, 'Deprecated', 'Deprecated', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bc17f055-2701-46b4-a750-39f5f084000c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bc17f055-2701-46b4-a750-39f5f084000c', 'AD492F95-B325-425A-8370-33AAEE0CAB22', 3, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID AD492F95-B325-425A-8370-33AAEE0CAB22 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='AD492F95-B325-425A-8370-33AAEE0CAB22';

/* SQL text to insert entity field value with ID 3bbabdb1-9af7-4b84-9548-c8a6ca7d2ef5 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3bbabdb1-9af7-4b84-9548-c8a6ca7d2ef5', 'F7C5CA70-F531-4C56-9827-6860B7214397', 1, 'Custom', 'Custom', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fa9a47e6-234d-4dff-90cf-2d9eafad78a9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fa9a47e6-234d-4dff-90cf-2d9eafad78a9', 'F7C5CA70-F531-4C56-9827-6860B7214397', 2, 'Declared', 'Declared', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fe537995-08b8-41d9-9040-971b5d359d3a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fe537995-08b8-41d9-9040-971b5d359d3a', 'F7C5CA70-F531-4C56-9827-6860B7214397', 3, 'Discovered', 'Discovered', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID F7C5CA70-F531-4C56-9827-6860B7214397 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F7C5CA70-F531-4C56-9827-6860B7214397';


/* Create Entity Relationship: MJ: Integrations -> MJ: Company Integration Objects (One To Many via IntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '31bcda52-f202-46ce-9711-76464b831948'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('31bcda52-f202-46ce-9711-76464b831948', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', '3C30FA05-9490-49F0-8943-6052573C66B2', 'IntegrationID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Company Integrations -> MJ: Company Integration Objects (One To Many via CompanyIntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5056e1cc-5d51-4391-86ba-2f3d37ab29f2'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5056e1cc-5d51-4391-86ba-2f3d37ab29f2', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', '3C30FA05-9490-49F0-8943-6052573C66B2', 'CompanyIntegrationID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Company Integration Objects -> MJ: Company Integration Object Fields (One To Many via CompanyIntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '71dd63fc-078f-4ea0-8b21-34fa6f4f9b64'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('71dd63fc-078f-4ea0-8b21-34fa6f4f9b64', '3C30FA05-9490-49F0-8943-6052573C66B2', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', 'CompanyIntegrationObjectID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ: Company Integration Objects -> MJ: Company Integration Object Fields (One To Many via RelatedCompanyIntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'add4c33f-87f4-4658-82a2-e66b14348fcb'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('add4c33f-87f4-4658-82a2-e66b14348fcb', '3C30FA05-9490-49F0-8943-6052573C66B2', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', 'RelatedCompanyIntegrationObjectID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Integration Object Fields -> MJ: Company Integration Object Fields (One To Many via IntegrationObjectFieldID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'f83563b6-3e7a-4391-8d49-283b42bd14fc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f83563b6-3e7a-4391-8d49-283b42bd14fc', '3630CBFD-4C85-4B24-8A51-88D67389373E', '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', 'IntegrationObjectFieldID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Integration Objects -> MJ: Company Integration Objects (One To Many via IntegrationObjectID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'a34b681b-96e0-423d-85ac-ded72da90104'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a34b681b-96e0-423d-85ac-ded72da90104', '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', '3C30FA05-9490-49F0-8943-6052573C66B2', 'IntegrationObjectID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
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

/* SQL text to update entity field related entity name field map for entity field ID 8B96CDDD-D560-44F3-922B-A60947326ADF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8B96CDDD-D560-44F3-922B-A60947326ADF', @RelatedEntityNameFieldMap='CompanyIntegrationObject';

/* SQL text to update entity field related entity name field map for entity field ID F3DF5B72-312B-42AE-84BC-766A24D2D23A */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F3DF5B72-312B-42AE-84BC-766A24D2D23A', @RelatedEntityNameFieldMap='RelatedCompanyIntegrationObject';

/* SQL text to update entity field related entity name field map for entity field ID 4F599E5B-EC18-4C64-A703-C9288C9FD8E0 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='4F599E5B-EC18-4C64-A703-C9288C9FD8E0', @RelatedEntityNameFieldMap='IntegrationObjectField';

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Company Integration Object Fields */

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObjectField] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Company Integration Object Fields */

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
-- Index for foreign key IntegrationID in table CompanyIntegrationObject
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationObject_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationObject]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationObject_IntegrationID ON [${flyway:defaultSchema}].[CompanyIntegrationObject] ([IntegrationID]);

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

/* SQL text to update entity field related entity name field map for entity field ID 507EBA52-4EED-4A99-BF38-8057856EA2DD */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='507EBA52-4EED-4A99-BF38-8057856EA2DD', @RelatedEntityNameFieldMap='Integration';

/* SQL text to update entity field related entity name field map for entity field ID ABD44592-2EC6-45A4-91A2-A6AA7DE62D6F */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ABD44592-2EC6-45A4-91A2-A6AA7DE62D6F', @RelatedEntityNameFieldMap='CompanyIntegration';

/* SQL text to update entity field related entity name field map for entity field ID 9B4DC9C5-2C8D-43FB-A56A-DA2BAA3366B9 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9B4DC9C5-2C8D-43FB-A56A-DA2BAA3366B9', @RelatedEntityNameFieldMap='IntegrationObject';

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
    MJIntegration_IntegrationID.[Name] AS [Integration],
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration],
    MJIntegrationObject_IntegrationObjectID.[Name] AS [IntegrationObject]
FROM
    [${flyway:defaultSchema}].[CompanyIntegrationObject] AS c
INNER JOIN
    [${flyway:defaultSchema}].[Integration] AS MJIntegration_IntegrationID
  ON
    [c].[IntegrationID] = MJIntegration_IntegrationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [c].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[IntegrationObject] AS MJIntegrationObject_IntegrationObjectID
  ON
    [c].[IntegrationObjectID] = MJIntegrationObject_IntegrationObjectID.[ID]
GO
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Company Integration Objects */

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Company Integration Objects */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationObject] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 6 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '294e1eef-929c-4452-84d4-ab24a71fe6d6' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'Integration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '294e1eef-929c-4452-84d4-ab24a71fe6d6',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
            'Integration',
            'Integration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '00a0fe69-4349-4b82-9985-03d84c762d57' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'CompanyIntegration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '00a0fe69-4349-4b82-9985-03d84c762d57',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '155a8c38-a86d-4c24-94b6-a0537d7c560c' OR (EntityID = '3C30FA05-9490-49F0-8943-6052573C66B2' AND Name = 'IntegrationObject')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '155a8c38-a86d-4c24-94b6-a0537d7c560c',
            '3C30FA05-9490-49F0-8943-6052573C66B2', -- Entity: MJ: Company Integration Objects
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '3C30FA05-9490-49F0-8943-6052573C66B2'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '738d3325-4543-4a33-977d-826195d21d6a' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'CompanyIntegrationObject')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '738d3325-4543-4a33-977d-826195d21d6a',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e2bf4cb-cc40-4688-9596-cf8fcc48951d' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'RelatedCompanyIntegrationObject')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9e2bf4cb-cc40-4688-9596-cf8fcc48951d',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9b74e1d4-e18f-4108-9992-2f30224d1e15' OR (EntityID = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368' AND Name = 'IntegrationObjectField')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b74e1d4-e18f-4108-9992-2f30224d1e15',
            '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368', -- Entity: MJ: Company Integration Object Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '2D4F0C97-B8F8-46BE-B75A-BFA90F93D368'),
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
