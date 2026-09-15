-- =====================================================================================
-- Web Search Provider registry
--
-- Creates the metadata table behind @memberjunction/web-search-engine: one row per external
-- web search vendor, carrying the ClassFactory driver key, an admin on/off switch, ordering,
-- and an optional credential link.
--
-- Deliberately a near-mirror of __mj.SearchProvider so the two are learnable together. The
-- tables are separate because the engines are: SearchProvider feeds the internal search engine,
-- whose SearchResultItem requires EntityName and RecordID (the primary key of a source record).
-- A web result has a URL and neither of those.
--
-- Capability flags are NOT columns. Whether a driver can return a synthesized answer or honour
-- a domain filter is a property of the driver implementation, declared on the class — exactly
-- as SearchProvider declares SourceType. This table holds configuration only.
-- =====================================================================================

CREATE TABLE ${flyway:defaultSchema}.WebSearchProvider (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(500) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    Priority INT NOT NULL DEFAULT 0,
    CredentialID UNIQUEIDENTIFIER NULL,
    ProviderConfig NVARCHAR(MAX) NULL,
    MaxResultsOverride INT NULL,
    AllowResultCaching BIT NOT NULL DEFAULT 0,
    DisplayName NVARCHAR(200) NULL,
    Icon NVARCHAR(200) NULL,
    Comments NVARCHAR(MAX) NULL,
    CONSTRAINT PK_WebSearchProvider PRIMARY KEY (ID),
    CONSTRAINT UQ_WebSearchProvider_Name UNIQUE (Name),
    CONSTRAINT FK_WebSearchProvider_Credential FOREIGN KEY (CredentialID)
        REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_WebSearchProvider_Status CHECK (Status IN ('Pending', 'Active', 'Terminated')),
    CONSTRAINT CK_WebSearchProvider_Priority CHECK (Priority >= 0),
    CONSTRAINT CK_WebSearchProvider_MaxResultsOverride CHECK (MaxResultsOverride IS NULL OR MaxResultsOverride > 0)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Registry of external web search vendors available to @memberjunction/web-search-engine. Each row configures one driver: whether it is active, its position in the failover order, and where its credential lives. Provider capabilities (answer synthesis, domain filtering, freshness) are declared by the driver class, not stored here.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Administrator-facing name for this provider, e.g. "Brave" or "Tavily". Unique, and usable as the Provider value when a caller pins a search to one vendor.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What this provider searches, what it costs, and when it is the right choice.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ClassFactory key used with @RegisterClass(BaseWebSearchProvider, DriverClass) to instantiate the driver at runtime, e.g. "BraveWebSearchProvider". A value with no matching registration leaves the provider unavailable and is logged at engine startup.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider lifecycle status: Pending (configured but not yet in use), Active (participates in searches), Terminated (disabled). Only Active providers are loaded. Matches the vocabulary used by SearchProvider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Failover order: LOWER values are tried FIRST. The engine serves a search from the first available provider in this order, moving on only when one fails transiently. Must be >= 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional FK to the Credential record holding this provider''s API key. When NULL the driver falls back to its documented environment variable, so a host that has not yet migrated its secrets into the Credential store keeps working.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'CredentialID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON blob of non-secret, driver-specific settings (endpoint overrides, tier flags, answer model). Schema is defined by each driver; invalid JSON is logged and ignored rather than disabling the provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'ProviderConfig';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional per-provider cap on results per request, for pay-per-query vendors. The effective cap is the smallest of the caller''s request, this value, and the vendor''s own hard limit. NULL means the driver''s own limit applies.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'MaxResultsOverride';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this vendor''s terms permit storing returned results. Defaults to 0 (deny), because caching rights differ sharply between vendors and violating them is silent: some sell storage rights as a plan tier, others forbid persistent caching outright. Nothing in the engine caches today; this column exists so the first caching layer reads a per-provider gate instead of inventing one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'AllowResultCaching';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UI display name shown in admin surfaces and result attribution. When NULL, falls back to the Name column.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'CSS icon class for UI display, e.g. "fa-brands fa-brave". Supports any CSS-based icon library. When NULL a default icon is used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Icon';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form administrator notes, e.g. contract terms, billing owner, or why this provider sits at its priority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'WebSearchProvider',
    @level2type = N'COLUMN', @level2name = N'Comments';


















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================
-- Everything below this block was produced by MemberJunction CodeGen after
-- the hand-written DDL above. It contains:
--   * Entity record for WebSearchProvider (MJ: Web Search Providers)
--   * ApplicationEntity & EntityPermission grants
--   * EntityField records (apply-time dynamic Sequence)
--   * Auto-generated foreign key indexes
--   * Generated CRUD stored procedures (spCreate/spUpdate/spDelete) and update triggers
--   * Base view (vwWebSearchProviders)
-- =============================================================================

/* SQL generated to create new entity MJ: Web Search Providers */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56',
         'MJ: Web Search Providers',
         'Web Search Providers',
         'Registry of external web search vendors available to @memberjunction/web-search-engine. Each row configures one driver: whether it is active, its position in the failover order, and where its credential lives. Provider capabilities (answer synthesis, domain filtering, freshness) are declared by the driver class, not stored here.',
         NULL,
         'WebSearchProvider',
         'vwWebSearchProviders',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: Web Search Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Web Search Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Web Search Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Web Search Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('7b7d65a1-bf9f-4174-b4c7-0a98b0cd1f56' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[WebSearchProvider] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
UPDATE [${flyway:defaultSchema}].[WebSearchProvider] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[WebSearchProvider] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[WebSearchProvider] ADD CONSTRAINT [DF___mj_WebSearchProvider___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[WebSearchProvider] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
UPDATE [${flyway:defaultSchema}].[WebSearchProvider] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[WebSearchProvider] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.WebSearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[WebSearchProvider] ADD CONSTRAINT [DF___mj_WebSearchProvider___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 15 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c38c8218-02c0-4d7c-8fe6-daf0834e81a8' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c38c8218-02c0-4d7c-8fe6-daf0834e81a8',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd7982d88-ba05-4374-bd81-e8938d3ab09c' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd7982d88-ba05-4374-bd81-e8938d3ab09c',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'Name',
            'Name',
            'Administrator-facing name for this provider, e.g. "Brave" or "Tavily". Unique, and usable as the Provider value when a caller pins a search to one vendor.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11384fc5-8bfd-4bcd-a455-564b89d6d763' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '11384fc5-8bfd-4bcd-a455-564b89d6d763',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'Description',
            'Description',
            'What this provider searches, what it costs, and when it is the right choice.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9eead17c-322a-4c71-9ec5-25f099e64222' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9eead17c-322a-4c71-9ec5-25f099e64222',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'DriverClass',
            'Driver Class',
            'ClassFactory key used with @RegisterClass(BaseWebSearchProvider, DriverClass) to instantiate the driver at runtime, e.g. "BraveWebSearchProvider". A value with no matching registration leaves the provider unavailable and is logged at engine startup.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0a02e01a-501b-4b28-b237-248626a34eb8' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0a02e01a-501b-4b28-b237-248626a34eb8',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'Status',
            'Status',
            'Provider lifecycle status: Pending (configured but not yet in use), Active (participates in searches), Terminated (disabled). Only Active providers are loaded. Matches the vocabulary used by SearchProvider.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b80a062-a8e5-4710-8c8e-6925157df040' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1b80a062-a8e5-4710-8c8e-6925157df040',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'Priority',
            'Priority',
            'Failover order: LOWER values are tried FIRST. The engine serves a search from the first available provider in this order, moving on only when one fails transiently. Must be >= 0.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5d9769bd-7f8b-47e5-866a-a76b90d0090c' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'CredentialID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5d9769bd-7f8b-47e5-866a-a76b90d0090c',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'CredentialID',
            'Credential ID',
            'Optional FK to the Credential record holding this provider''s API key. When NULL the driver falls back to its documented environment variable, so a host that has not yet migrated its secrets into the Credential store keeps working.',
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
            '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3e7c203-2ea2-451b-a07b-9aee0b99004a' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'ProviderConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f3e7c203-2ea2-451b-a07b-9aee0b99004a',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'ProviderConfig',
            'Provider Config',
            'Optional JSON blob of non-secret, driver-specific settings (endpoint overrides, tier flags, answer model). Schema is defined by each driver; invalid JSON is logged and ignored rather than disabling the provider.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '719177fb-3a1e-4b34-87e5-31a376222a02' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'MaxResultsOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '719177fb-3a1e-4b34-87e5-31a376222a02',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'MaxResultsOverride',
            'Max Results Override',
            'Optional per-provider cap on results per request, for pay-per-query vendors. The effective cap is the smallest of the caller''s request, this value, and the vendor''s own hard limit. NULL means the driver''s own limit applies.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ab5bca2-5d24-4e4e-b6d5-3be5ed36816e' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'AllowResultCaching')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ab5bca2-5d24-4e4e-b6d5-3be5ed36816e',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'AllowResultCaching',
            'Allow Result Caching',
            'Whether this vendor''s terms permit storing returned results. Defaults to 0 (deny), because caching rights differ sharply between vendors and violating them is silent: some sell storage rights as a plan tier, others forbid persistent caching outright. Nothing in the engine caches today; this column exists so the first caching layer reads a per-provider gate instead of inventing one.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '003c9848-beaf-42a7-9b88-fcbd1a3298b1' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '003c9848-beaf-42a7-9b88-fcbd1a3298b1',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'DisplayName',
            'Display Name',
            'UI display name shown in admin surfaces and result attribution. When NULL, falls back to the Name column.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '32607248-aad9-4797-88eb-8b86294746e9' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'Icon')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '32607248-aad9-4797-88eb-8b86294746e9',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'Icon',
            'Icon',
            'CSS icon class for UI display, e.g. "fa-brands fa-brave". Supports any CSS-based icon library. When NULL a default icon is used.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '187854f9-2870-459b-a089-0fc30b9d845e' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'Comments')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '187854f9-2870-459b-a089-0fc30b9d845e',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'Comments',
            'Comments',
            'Free-form administrator notes, e.g. contract terms, billing owner, or why this provider sits at its priority.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8a4a3001-c450-41f2-b67f-bec55c01f3a1' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8a4a3001-c450-41f2-b67f-bec55c01f3a1',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b5813667-6134-4ab2-8027-45b0a6c708d5' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b5813667-6134-4ab2-8027-45b0a6c708d5',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
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

/* SQL text to insert entity field value with ID 506babc9-0bdb-4661-8432-86e7cc9de726 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('506babc9-0bdb-4661-8432-86e7cc9de726', '0A02E01A-501B-4B28-B237-248626A34EB8', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ab48db5b-1285-4a31-acbd-b9477248906e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ab48db5b-1285-4a31-acbd-b9477248906e', '0A02E01A-501B-4B28-B237-248626A34EB8', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a7b64548-d511-4889-9f07-388819ade434 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a7b64548-d511-4889-9f07-388819ade434', '0A02E01A-501B-4B28-B237-248626A34EB8', 3, 'Terminated', 'Terminated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 0A02E01A-501B-4B28-B237-248626A34EB8 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='0A02E01A-501B-4B28-B237-248626A34EB8';


/* Create Entity Relationship: MJ: Credentials -> MJ: Web Search Providers (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '3865902d-bc19-403e-bbf3-d181f5437a02'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3865902d-bc19-403e-bbf3-d181f5437a02', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', 'CredentialID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for WebSearchProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Web Search Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialID in table WebSearchProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_WebSearchProvider_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[WebSearchProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_WebSearchProvider_CredentialID ON [${flyway:defaultSchema}].[WebSearchProvider] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID 5D9769BD-7F8B-47E5-866A-A76B90D0090C */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='5D9769BD-7F8B-47E5-866A-A76B90D0090C', @RelatedEntityNameFieldMap='Credential';

/* Base View SQL for MJ: Web Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Web Search Providers
-- Item: vwWebSearchProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Web Search Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  WebSearchProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwWebSearchProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwWebSearchProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwWebSearchProviders]
AS
SELECT
    w.*,
    MJCredential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[WebSearchProvider] AS w
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_CredentialID
  ON
    [w].[CredentialID] = MJCredential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwWebSearchProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Web Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Web Search Providers
-- Item: Permissions for vwWebSearchProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwWebSearchProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Web Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Web Search Providers
-- Item: spCreateWebSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR WebSearchProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateWebSearchProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateWebSearchProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateWebSearchProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(500),
    @Status nvarchar(20) = NULL,
    @Priority int = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @ProviderConfig_Clear bit = 0,
    @ProviderConfig nvarchar(MAX) = NULL,
    @MaxResultsOverride_Clear bit = 0,
    @MaxResultsOverride int = NULL,
    @AllowResultCaching bit = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(200) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(200) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[WebSearchProvider]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Status],
                [Priority],
                [CredentialID],
                [ProviderConfig],
                [MaxResultsOverride],
                [AllowResultCaching],
                [DisplayName],
                [Icon],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                ISNULL(@Status, 'Active'),
                ISNULL(@Priority, 0),
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                CASE WHEN @ProviderConfig_Clear = 1 THEN NULL ELSE ISNULL(@ProviderConfig, NULL) END,
                CASE WHEN @MaxResultsOverride_Clear = 1 THEN NULL ELSE ISNULL(@MaxResultsOverride, NULL) END,
                ISNULL(@AllowResultCaching, 0),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[WebSearchProvider]
            (
                [Name],
                [Description],
                [DriverClass],
                [Status],
                [Priority],
                [CredentialID],
                [ProviderConfig],
                [MaxResultsOverride],
                [AllowResultCaching],
                [DisplayName],
                [Icon],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                ISNULL(@Status, 'Active'),
                ISNULL(@Priority, 0),
                CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, NULL) END,
                CASE WHEN @ProviderConfig_Clear = 1 THEN NULL ELSE ISNULL(@ProviderConfig, NULL) END,
                CASE WHEN @MaxResultsOverride_Clear = 1 THEN NULL ELSE ISNULL(@MaxResultsOverride, NULL) END,
                ISNULL(@AllowResultCaching, 0),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwWebSearchProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWebSearchProvider] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Web Search Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateWebSearchProvider] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Web Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Web Search Providers
-- Item: spUpdateWebSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR WebSearchProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateWebSearchProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateWebSearchProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateWebSearchProvider]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @Priority int = NULL,
    @CredentialID_Clear bit = 0,
    @CredentialID uniqueidentifier = NULL,
    @ProviderConfig_Clear bit = 0,
    @ProviderConfig nvarchar(MAX) = NULL,
    @MaxResultsOverride_Clear bit = 0,
    @MaxResultsOverride int = NULL,
    @AllowResultCaching bit = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(200) = NULL,
    @Icon_Clear bit = 0,
    @Icon nvarchar(200) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WebSearchProvider]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [Status] = ISNULL(@Status, [Status]),
        [Priority] = ISNULL(@Priority, [Priority]),
        [CredentialID] = CASE WHEN @CredentialID_Clear = 1 THEN NULL ELSE ISNULL(@CredentialID, [CredentialID]) END,
        [ProviderConfig] = CASE WHEN @ProviderConfig_Clear = 1 THEN NULL ELSE ISNULL(@ProviderConfig, [ProviderConfig]) END,
        [MaxResultsOverride] = CASE WHEN @MaxResultsOverride_Clear = 1 THEN NULL ELSE ISNULL(@MaxResultsOverride, [MaxResultsOverride]) END,
        [AllowResultCaching] = ISNULL(@AllowResultCaching, [AllowResultCaching]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Icon] = CASE WHEN @Icon_Clear = 1 THEN NULL ELSE ISNULL(@Icon, [Icon]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwWebSearchProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwWebSearchProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWebSearchProvider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the WebSearchProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateWebSearchProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateWebSearchProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateWebSearchProvider
ON [${flyway:defaultSchema}].[WebSearchProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[WebSearchProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[WebSearchProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Web Search Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateWebSearchProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Web Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Web Search Providers
-- Item: spDeleteWebSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR WebSearchProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteWebSearchProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteWebSearchProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteWebSearchProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[WebSearchProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWebSearchProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Web Search Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteWebSearchProvider] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e366c33e-76b4-44fe-b1ee-04edb1188493' OR (EntityID = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56' AND Name = 'Credential')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e366c33e-76b4-44fe-b1ee-04edb1188493',
            '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56', -- Entity: MJ: Web Search Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '7B7D65A1-BF9F-4174-B4C7-0A98B0CD1F56'),
            'Credential',
            'Credential',
            NULL,
            'nvarchar',
            400,
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

