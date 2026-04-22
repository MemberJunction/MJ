-- Permission Domain catalog: describes each registered permission subsystem (provider).
-- The unified PermissionEngine loads this catalog at startup and uses ProviderClassName
-- as the ClassFactory key to instantiate each provider. Phase 2a seeds four domains:
-- Entity Permissions, Dashboard Permissions, Resource Permissions, Application Roles.

CREATE TABLE ${flyway:defaultSchema}.PermissionDomain (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    ProviderClassName NVARCHAR(500) NOT NULL,
    SupportedGranteeTypes NVARCHAR(200) NOT NULL,
    SupportedActions NVARCHAR(500) NOT NULL,
    SupportsDeny BIT NOT NULL DEFAULT 0,
    SupportsExpiration BIT NOT NULL DEFAULT 0,
    SupportsHierarchyInheritance BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    DisplayOrder INT NOT NULL DEFAULT 100,
    Icon NVARCHAR(100) NULL,
    CONSTRAINT PK_PermissionDomain PRIMARY KEY (ID),
    CONSTRAINT UQ_PermissionDomain_Name UNIQUE (Name)
);

-- Extended properties for CodeGen
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Catalog of registered permission subsystems. Each row describes one permission provider; the PermissionEngine uses ProviderClassName as the ClassFactory key to instantiate providers at startup. Enables unified permission queries across all subsystems.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable unique name for the permission domain (e.g., "Entity Permissions", "Dashboard Permissions"). Used in admin UI and as the domain identifier in PermissionEngine API calls.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this permission domain covers and how permissions are enforced.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ClassFactory key used to instantiate this provider. Must match the key passed to @RegisterClass(PermissionProviderBase, ''ClassName''). Convention: prefix with MJ for built-in providers (e.g., MJEntityPermissionProvider).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'ProviderClassName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Comma-delimited list of grantee types this provider supports. Valid tokens: User, Role, Everyone, Public. Example: "User,Role".',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportedGranteeTypes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Comma-delimited list of permission actions this provider can evaluate. Valid tokens: Read, Create, Update, Delete, Share, Execute, Admin. Example: "Read,Create,Update,Delete".',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportedActions';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider supports explicit Deny records that override Allow grants at the same scope.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportsDeny';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider supports time-bound permissions with an expiration timestamp.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportsExpiration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this provider resolves permissions hierarchically (e.g., category-level grants cascade to items within the category).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'SupportsHierarchyInheritance';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When false, the PermissionEngine skips loading this provider at startup. Use to temporarily disable a provider without removing its record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'IsActive';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sort order for displaying domains in the Sharing Center admin UI. Lower numbers appear first.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'DisplayOrder';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional Font Awesome icon class for display in admin UI (e.g., "fa-solid fa-shield").',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PermissionDomain',
    @level2type = N'COLUMN', @level2name = N'Icon';

























































































































/* SQL generated to create new entity MJ: Permission Domains */

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
         '8047b714-13e1-4848-813a-b928d91a671e',
         'MJ: Permission Domains',
         'Permission Domains',
         'Catalog of registered permission subsystems. Each row describes one permission provider; the PermissionEngine uses ProviderClassName as the ClassFactory key to instantiate providers at startup. Enables unified permission queries across all subsystems.',
         NULL,
         'PermissionDomain',
         'vwPermissionDomains',
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
      )
   

/* SQL generated to add new entity MJ: Permission Domains to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '8047b714-13e1-4848-813a-b928d91a671e', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Permission Domains for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8047b714-13e1-4848-813a-b928d91a671e', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Permission Domains for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8047b714-13e1-4848-813a-b928d91a671e', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Permission Domains for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8047b714-13e1-4848-813a-b928d91a671e', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
UPDATE [${flyway:defaultSchema}].[PermissionDomain] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD CONSTRAINT [DF___mj_PermissionDomain___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
UPDATE [${flyway:defaultSchema}].[PermissionDomain] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PermissionDomain */
ALTER TABLE [${flyway:defaultSchema}].[PermissionDomain] ADD CONSTRAINT [DF___mj_PermissionDomain___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4f308390-d6f5-422d-8ec8-181d0a3db928' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4f308390-d6f5-422d-8ec8-181d0a3db928',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100001,
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
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4ffc5f3f-be5d-454e-9e5e-12c8ab7bf311' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4ffc5f3f-be5d-454e-9e5e-12c8ab7bf311',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100002,
            'Name',
            'Name',
            'Human-readable unique name for the permission domain (e.g., "Entity Permissions", "Dashboard Permissions"). Used in admin UI and as the domain identifier in PermissionEngine API calls.',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7fcddac0-cafa-4934-b680-5e8469ddc7db' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7fcddac0-cafa-4934-b680-5e8469ddc7db',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100003,
            'Description',
            'Description',
            'Detailed description of what this permission domain covers and how permissions are enforced.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ccd03c74-7f28-40e8-85ea-c50cf3566390' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'ProviderClassName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ccd03c74-7f28-40e8-85ea-c50cf3566390',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100004,
            'ProviderClassName',
            'Provider Class Name',
            'ClassFactory key used to instantiate this provider. Must match the key passed to @RegisterClass(PermissionProviderBase, ''ClassName''). Convention: prefix with MJ for built-in providers (e.g., MJEntityPermissionProvider).',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '403eca12-54b6-4926-9e84-120707209f42' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'SupportedGranteeTypes')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '403eca12-54b6-4926-9e84-120707209f42',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100005,
            'SupportedGranteeTypes',
            'Supported Grantee Types',
            'Comma-delimited list of grantee types this provider supports. Valid tokens: User, Role, Everyone, Public. Example: "User,Role".',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '55666109-5281-434b-a6d3-4614a494e1e9' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'SupportedActions')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '55666109-5281-434b-a6d3-4614a494e1e9',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100006,
            'SupportedActions',
            'Supported Actions',
            'Comma-delimited list of permission actions this provider can evaluate. Valid tokens: Read, Create, Update, Delete, Share, Execute, Admin. Example: "Read,Create,Update,Delete".',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '963e61d7-93f3-4395-9dd5-2a6f51d47b84' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'SupportsDeny')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '963e61d7-93f3-4395-9dd5-2a6f51d47b84',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100007,
            'SupportsDeny',
            'Supports Deny',
            'When true, this provider supports explicit Deny records that override Allow grants at the same scope.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0c6fb6c9-08d7-4789-8579-85fef4e3c8e2' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'SupportsExpiration')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0c6fb6c9-08d7-4789-8579-85fef4e3c8e2',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100008,
            'SupportsExpiration',
            'Supports Expiration',
            'When true, this provider supports time-bound permissions with an expiration timestamp.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7ee0ec2b-a9f7-460b-9f48-fe6175252c2b' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'SupportsHierarchyInheritance')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7ee0ec2b-a9f7-460b-9f48-fe6175252c2b',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100009,
            'SupportsHierarchyInheritance',
            'Supports Hierarchy Inheritance',
            'When true, this provider resolves permissions hierarchically (e.g., category-level grants cascade to items within the category).',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ca461ac5-f1d3-4460-b378-6c49c5fad3aa' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ca461ac5-f1d3-4460-b378-6c49c5fad3aa',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100010,
            'IsActive',
            'Is Active',
            'When false, the PermissionEngine skips loading this provider at startup. Use to temporarily disable a provider without removing its record.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c14a0cc-ff2b-41d4-89dc-0a3ae997c691' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'DisplayOrder')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3c14a0cc-ff2b-41d4-89dc-0a3ae997c691',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100011,
            'DisplayOrder',
            'Display Order',
            'Sort order for displaying domains in the Sharing Center admin UI. Lower numbers appear first.',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4fb16f0e-0e39-443d-892a-ca408f2ace02' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = 'Icon')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4fb16f0e-0e39-443d-892a-ca408f2ace02',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100012,
            'Icon',
            'Icon',
            'Optional Font Awesome icon class for display in admin UI (e.g., "fa-solid fa-shield").',
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd97aa9a0-ef44-4fe4-895a-6c68c5d3af1a' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd97aa9a0-ef44-4fe4-895a-6c68c5d3af1a',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100013,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f37dfc10-eb92-44fa-b6ea-83ce32ba2d8a' OR (EntityID = '8047B714-13E1-4848-813A-B928D91A671E' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f37dfc10-eb92-44fa-b6ea-83ce32ba2d8a',
            '8047B714-13E1-4848-813A-B928D91A671E', -- Entity: MJ: Permission Domains
            100014,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* Index for Foreign Keys for PermissionDomain */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: vwPermissionDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Permission Domains
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PermissionDomain
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPermissionDomains]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPermissionDomains];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPermissionDomains]
AS
SELECT
    p.*
FROM
    [${flyway:defaultSchema}].[PermissionDomain] AS p
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPermissionDomains] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: Permissions for vwPermissionDomains
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPermissionDomains] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spCreatePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PermissionDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePermissionDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePermissionDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePermissionDomain]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ProviderClassName nvarchar(500),
    @SupportedGranteeTypes nvarchar(200),
    @SupportedActions nvarchar(500),
    @SupportsDeny bit = NULL,
    @SupportsExpiration bit = NULL,
    @SupportsHierarchyInheritance bit = NULL,
    @IsActive bit = NULL,
    @DisplayOrder int = NULL,
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PermissionDomain]
            (
                [ID],
                [Name],
                [Description],
                [ProviderClassName],
                [SupportedGranteeTypes],
                [SupportedActions],
                [SupportsDeny],
                [SupportsExpiration],
                [SupportsHierarchyInheritance],
                [IsActive],
                [DisplayOrder],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ProviderClassName,
                @SupportedGranteeTypes,
                @SupportedActions,
                ISNULL(@SupportsDeny, 0),
                ISNULL(@SupportsExpiration, 0),
                ISNULL(@SupportsHierarchyInheritance, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@DisplayOrder, 100),
                @Icon
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PermissionDomain]
            (
                [Name],
                [Description],
                [ProviderClassName],
                [SupportedGranteeTypes],
                [SupportedActions],
                [SupportsDeny],
                [SupportsExpiration],
                [SupportsHierarchyInheritance],
                [IsActive],
                [DisplayOrder],
                [Icon]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ProviderClassName,
                @SupportedGranteeTypes,
                @SupportedActions,
                ISNULL(@SupportsDeny, 0),
                ISNULL(@SupportsExpiration, 0),
                ISNULL(@SupportsHierarchyInheritance, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@DisplayOrder, 100),
                @Icon
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPermissionDomains] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePermissionDomain] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Permission Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePermissionDomain] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spUpdatePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PermissionDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePermissionDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePermissionDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePermissionDomain]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ProviderClassName nvarchar(500),
    @SupportedGranteeTypes nvarchar(200),
    @SupportedActions nvarchar(500),
    @SupportsDeny bit,
    @SupportsExpiration bit,
    @SupportsHierarchyInheritance bit,
    @IsActive bit,
    @DisplayOrder int,
    @Icon nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PermissionDomain]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ProviderClassName] = @ProviderClassName,
        [SupportedGranteeTypes] = @SupportedGranteeTypes,
        [SupportedActions] = @SupportedActions,
        [SupportsDeny] = @SupportsDeny,
        [SupportsExpiration] = @SupportsExpiration,
        [SupportsHierarchyInheritance] = @SupportsHierarchyInheritance,
        [IsActive] = @IsActive,
        [DisplayOrder] = @DisplayOrder,
        [Icon] = @Icon
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPermissionDomains] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPermissionDomains]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePermissionDomain] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PermissionDomain table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePermissionDomain]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePermissionDomain];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePermissionDomain
ON [${flyway:defaultSchema}].[PermissionDomain]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PermissionDomain]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PermissionDomain] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Permission Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePermissionDomain] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Permission Domains */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Permission Domains
-- Item: spDeletePermissionDomain
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PermissionDomain
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePermissionDomain]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePermissionDomain];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePermissionDomain]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PermissionDomain]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePermissionDomain] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Permission Domains */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePermissionDomain] TO [cdp_Integration]



/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CCD03C74-7F28-40E8-85EA-C50CF3566390'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '55666109-5281-434B-A6D3-4614A494E1E9'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CA461AC5-F1D3-4460-B378-6C49C5FAD3AA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CCD03C74-7F28-40E8-85EA-C50CF3566390'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '55666109-5281-434B-A6D3-4614A494E1E9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '4FFC5F3F-BE5D-454E-9E5E-12C8AB7BF311'
               AND AutoUpdateUserSearchPredicate = 1
            

/* Set categories for 14 fields */

-- UPDATE Entity Field Category Info MJ: Permission Domains.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F308390-D6F5-422D-8EC8-181D0A3DB928' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FFC5F3F-BE5D-454E-9E5E-12C8AB7BF311' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7FCDDAC0-CAFA-4934-B680-5E8469DDC7DB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.ProviderClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Implementation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CCD03C74-7F28-40E8-85EA-C50CF3566390' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportedGranteeTypes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Implementation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '403ECA12-54B6-4926-9E84-120707209F42' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportedActions 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Implementation Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '55666109-5281-434B-A6D3-4614A494E1E9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportsDeny 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Support',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '963E61D7-93F3-4395-9DD5-2A6F51D47B84' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportsExpiration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Support',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C6FB6C9-08D7-4789-8579-85FEF4E3C8E2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.SupportsHierarchyInheritance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Support',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7EE0EC2B-A9F7-460B-9F48-FE6175252C2B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.IsActive 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CA461AC5-F1D3-4460-B378-6C49C5FAD3AA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.DisplayOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C14A0CC-FF2B-41D4-89DC-0A3AE997C691' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Domain Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FB16F0E-0E39-443D-892A-CA408F2ACE02' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D97AA9A0-EF44-4FE4-895A-6C68C5D3AF1A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Permission Domains.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F37DFC10-EB92-44FA-B6EA-83CE32BA2D8A' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-shield-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '8047B714-13E1-4848-813A-B928D91A671E'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('39c27d91-c80d-44d9-9090-d4c2d6f4065e', '8047B714-13E1-4848-813A-B928D91A671E', 'FieldCategoryInfo', '{"Domain Configuration":{"icon":"fa fa-sliders-h","description":"General settings, naming, and UI configuration for the permission domain"},"Implementation Details":{"icon":"fa fa-code","description":"Technical configuration for provider instantiation and supported permission logic"},"Feature Support":{"icon":"fa fa-check-circle","description":"Flags defining the functional capabilities supported by the permission provider"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d2f83ac2-eb91-42f5-ac4b-c5a99907ad7d', '8047B714-13E1-4848-813A-B928D91A671E', 'FieldCategoryIcons', '{"Domain Configuration":"fa fa-sliders-h","Implementation Details":"fa fa-code","Feature Support":"fa fa-check-circle","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: reference, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '8047B714-13E1-4848-813A-B928D91A671E'
      

