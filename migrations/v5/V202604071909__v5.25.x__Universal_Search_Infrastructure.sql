-- Universal Search Infrastructure
--
-- Schema changes to support the MJ Universal Search feature:
--   EntityField:  +UserSearchPredicateAPI, +AutoUpdateUserSearchPredicate, +AutoUpdateFullTextSearch
--   Entity:       +AutoUpdateFullTextSearch, +AutoUpdateAllowUserSearchAPI
--   FileStorageAccount: +IncludeInGlobalSearch
--   FileStorageAccountPermission: NEW TABLE (account-level access control)
--   InstanceConfiguration: NEW TABLE (instance-level feature toggles)
--

----------------------------------------------------------------------
-- 1. EntityField: Search predicate and auto-update fields
----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD
    UserSearchPredicateAPI NVARCHAR(20) NOT NULL DEFAULT 'Contains',
    AutoUpdateUserSearchPredicate BIT NOT NULL DEFAULT 1,
    AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1;
GO

----------------------------------------------------------------------
-- 2. Entity: FTS and search API auto-update fields
----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1,
    AutoUpdateAllowUserSearchAPI BIT NOT NULL DEFAULT 1;
GO

----------------------------------------------------------------------
-- 3. FileStorageAccount: Global search inclusion
----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.FileStorageAccount ADD
    IncludeInGlobalSearch BIT NOT NULL DEFAULT 0;
GO

----------------------------------------------------------------------
-- 4. FileStorageAccountPermission: Account-level access control
----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.FileStorageAccountPermission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FileStorageAccountID UNIQUEIDENTIFIER NOT NULL,
    Type NVARCHAR(20) NOT NULL DEFAULT 'Role',
    UserID UNIQUEIDENTIFIER NULL,
    RoleID UNIQUEIDENTIFIER NULL,
    CanRead BIT NOT NULL DEFAULT 1,
    CanWrite BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_FileStorageAccountPermission PRIMARY KEY (ID),
    CONSTRAINT FK_FileStorageAccountPermission_Account
        FOREIGN KEY (FileStorageAccountID)
        REFERENCES ${flyway:defaultSchema}.FileStorageAccount(ID),
    CONSTRAINT FK_FileStorageAccountPermission_User
        FOREIGN KEY (UserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_FileStorageAccountPermission_Role
        FOREIGN KEY (RoleID)
        REFERENCES ${flyway:defaultSchema}.[Role](ID),
    CONSTRAINT CK_FileStorageAccountPermission_Type
        CHECK (Type IN ('User', 'Role', 'Everyone')),
    CONSTRAINT CK_FileStorageAccountPermission_GranteeMatch
        CHECK (
            (Type = 'User'     AND UserID IS NOT NULL AND RoleID IS NULL) OR
            (Type = 'Role'     AND RoleID IS NOT NULL AND UserID IS NULL) OR
            (Type = 'Everyone' AND UserID IS NULL     AND RoleID IS NULL)
        )
);
GO

----------------------------------------------------------------------
-- 5. InstanceConfiguration: Feature toggle system
----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.InstanceConfiguration (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FeatureKey NVARCHAR(200) NOT NULL,
    Value NVARCHAR(MAX) NOT NULL,
    ValueType NVARCHAR(20) NOT NULL DEFAULT 'boolean',
    Category NVARCHAR(100) NOT NULL DEFAULT 'General',
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DefaultValue NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_InstanceConfiguration PRIMARY KEY (ID),
    CONSTRAINT CK_InstanceConfiguration_ValueType
        CHECK (ValueType IN ('boolean', 'string', 'number', 'json')),
    CONSTRAINT UQ_InstanceConfiguration_Key UNIQUE (FeatureKey)
);
GO

----------------------------------------------------------------------
-- 6. Extended properties: EntityField columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Search predicate controlling how user search queries match against this field. Valid values: BeginsWith, Contains, EndsWith, Exact.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'UserSearchPredicateAPI';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, CodeGen LLM can auto-set the UserSearchPredicateAPI value during code generation runs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'AutoUpdateUserSearchPredicate';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, CodeGen LLM can auto-set the FullTextSearchEnabled value during code generation runs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'AutoUpdateFullTextSearch';

----------------------------------------------------------------------
-- 7. Extended properties: Entity columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, CodeGen LLM can auto-configure full-text search settings (FullTextSearchEnabled, catalog, index, function) during code generation runs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AutoUpdateFullTextSearch';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, CodeGen LLM can auto-set AllowUserSearchAPI during code generation runs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AutoUpdateAllowUserSearchAPI';

----------------------------------------------------------------------
-- 8. Extended properties: FileStorageAccount column
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this storage account is included in universal/global search results. Only effective if the associated provider supports search (SupportsSearch = 1).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccount',
    @level2type = N'COLUMN', @level2name = N'IncludeInGlobalSearch';

----------------------------------------------------------------------
-- 9. Extended properties: FileStorageAccountPermission table + columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls which users and roles can access specific file storage accounts. If no permission records exist for an account, it is accessible to everyone (backwards compatible).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccountPermission';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The storage account this permission applies to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccountPermission',
    @level2type = N'COLUMN', @level2name = N'FileStorageAccountID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Permission type: User (requires UserID), Role (requires RoleID), or Everyone (both NULL).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccountPermission',
    @level2type = N'COLUMN', @level2name = N'Type';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Required when Type is User. The specific user granted access to this storage account.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccountPermission',
    @level2type = N'COLUMN', @level2name = N'UserID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Required when Type is Role. The role granted access to this storage account.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccountPermission',
    @level2type = N'COLUMN', @level2name = N'RoleID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the grantee can read/search files in this storage account.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccountPermission',
    @level2type = N'COLUMN', @level2name = N'CanRead';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the grantee can upload/modify files in this storage account.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileStorageAccountPermission',
    @level2type = N'COLUMN', @level2name = N'CanWrite';

----------------------------------------------------------------------
-- 10. Extended properties: InstanceConfiguration table + columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Instance-level feature toggles and configuration. Controls which features are enabled per MJ Explorer deployment.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique dot-notation key identifying the feature, e.g. Shell.SearchBar.Enabled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration',
    @level2type = N'COLUMN', @level2name = N'FeatureKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current value for this feature setting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration',
    @level2type = N'COLUMN', @level2name = N'Value';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Data type of the value: boolean, string, number, or json.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration',
    @level2type = N'COLUMN', @level2name = N'ValueType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Grouping category for admin UI display.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration',
    @level2type = N'COLUMN', @level2name = N'Category';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable display name for the setting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional extended description or help text for the setting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Factory default value. Used when resetting to defaults.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstanceConfiguration',
    @level2type = N'COLUMN', @level2name = N'DefaultValue';























































-- CODE GEN RUN
/* SQL generated to create new entity MJ: File Storage Account Permissions */

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
         [AllowUserSearchAPI]
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
         'b1c3e483-86eb-4a88-8e2b-88839f90e3e5',
         'MJ: File Storage Account Permissions',
         'File Storage Account Permissions',
         'Controls which users and roles can access specific file storage accounts. If no permission records exist for an account, it is accessible to everyone (backwards compatible).',
         NULL,
         'FileStorageAccountPermission',
         'vwFileStorageAccountPermissions',
         '${flyway:defaultSchema}',
         1,
         0
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
   

/* SQL generated to add new entity MJ: File Storage Account Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'b1c3e483-86eb-4a88-8e2b-88839f90e3e5', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b1c3e483-86eb-4a88-8e2b-88839f90e3e5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b1c3e483-86eb-4a88-8e2b-88839f90e3e5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('b1c3e483-86eb-4a88-8e2b-88839f90e3e5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Instance Configurations */

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
         [AllowUserSearchAPI]
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
         'd395f603-72ce-45c8-8f91-95670a0595a1',
         'MJ: Instance Configurations',
         'Instance Configurations',
         'Instance-level feature toggles and configuration. Controls which features are enabled per MJ Explorer deployment.',
         NULL,
         'InstanceConfiguration',
         'vwInstanceConfigurations',
         '${flyway:defaultSchema}',
         1,
         0
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
   

/* SQL generated to add new entity MJ: Instance Configurations to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'd395f603-72ce-45c8-8f91-95670a0595a1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Instance Configurations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d395f603-72ce-45c8-8f91-95670a0595a1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Instance Configurations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d395f603-72ce-45c8-8f91-95670a0595a1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Instance Configurations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d395f603-72ce-45c8-8f91-95670a0595a1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccountPermission] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
UPDATE [${flyway:defaultSchema}].[FileStorageAccountPermission] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccountPermission] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccountPermission] ADD CONSTRAINT [DF___mj_FileStorageAccountPermission___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccountPermission] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
UPDATE [${flyway:defaultSchema}].[FileStorageAccountPermission] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccountPermission] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileStorageAccountPermission */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccountPermission] ADD CONSTRAINT [DF___mj_FileStorageAccountPermission___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[InstanceConfiguration] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
UPDATE [${flyway:defaultSchema}].[InstanceConfiguration] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[InstanceConfiguration] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[InstanceConfiguration] ADD CONSTRAINT [DF___mj_InstanceConfiguration___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[InstanceConfiguration] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
UPDATE [${flyway:defaultSchema}].[InstanceConfiguration] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[InstanceConfiguration] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstanceConfiguration */
ALTER TABLE [${flyway:defaultSchema}].[InstanceConfiguration] ADD CONSTRAINT [DF___mj_InstanceConfiguration___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '901e0b5d-e65d-49af-812d-b93ff6842219' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UserSearchPredicateAPI')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '901e0b5d-e65d-49af-812d-b93ff6842219',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            100132,
            'UserSearchPredicateAPI',
            'User Search Predicate API',
            'Search predicate controlling how user search queries match against this field. Valid values: BeginsWith, Contains, EndsWith, Exact.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Contains',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '53f6aba4-2d8d-4cd9-ac9c-e939b21f6dcf' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateUserSearchPredicate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '53f6aba4-2d8d-4cd9-ac9c-e939b21f6dcf',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            100133,
            'AutoUpdateUserSearchPredicate',
            'Auto Update User Search Predicate',
            'When true, CodeGen LLM can auto-set the UserSearchPredicateAPI value during code generation runs.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2c378e50-e304-49ce-8858-ae7c7efc8e99' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateFullTextSearch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2c378e50-e304-49ce-8858-ae7c7efc8e99',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            100134,
            'AutoUpdateFullTextSearch',
            'Auto Update Full Text Search',
            'When true, CodeGen LLM can auto-set the FullTextSearchEnabled value during code generation runs.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '634c3458-cdc9-4a93-aeda-22b421ef204d' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateFullTextSearch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '634c3458-cdc9-4a93-aeda-22b421ef204d',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100123,
            'AutoUpdateFullTextSearch',
            'Auto Update Full Text Search',
            'When true, CodeGen LLM can auto-configure full-text search settings (FullTextSearchEnabled, catalog, index, function) during code generation runs.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b515db5-7fdb-44a1-b728-e7cff54f5ea5' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateAllowUserSearchAPI')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8b515db5-7fdb-44a1-b728-e7cff54f5ea5',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100124,
            'AutoUpdateAllowUserSearchAPI',
            'Auto Update Allow User Search API',
            'When true, CodeGen LLM can auto-set AllowUserSearchAPI during code generation runs.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5fed598b-cdbb-44f1-b679-7465f41e8d52' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5fed598b-cdbb-44f1-b679-7465f41e8d52',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '76486940-e410-4545-8862-45bf0085b8ab' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'FileStorageAccountID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '76486940-e410-4545-8862-45bf0085b8ab',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100002,
            'FileStorageAccountID',
            'File Storage Account ID',
            'The storage account this permission applies to.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f62ecaae-80f3-4769-afa0-1c04e2a9dbd2' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'Type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'f62ecaae-80f3-4769-afa0-1c04e2a9dbd2',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100003,
            'Type',
            'Type',
            'Permission type: User (requires UserID), Role (requires RoleID), or Everyone (both NULL).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Role',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '11116e6c-3f98-416e-a982-a2e4c3e351cf' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '11116e6c-3f98-416e-a982-a2e4c3e351cf',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100004,
            'UserID',
            'User ID',
            'Required when Type is User. The specific user granted access to this storage account.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3d722f8-98df-497b-987c-fde597a6a3be' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'RoleID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c3d722f8-98df-497b-987c-fde597a6a3be',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100005,
            'RoleID',
            'Role ID',
            'Required when Type is Role. The role granted access to this storage account.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'DA238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'dc3ebda9-afca-4130-a6d7-175885771f5e' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'CanRead')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'dc3ebda9-afca-4130-a6d7-175885771f5e',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100006,
            'CanRead',
            'Can Read',
            'Whether the grantee can read/search files in this storage account.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'aa0c1be8-65b4-4106-9f0f-8ca5f96d0642' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'CanWrite')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'aa0c1be8-65b4-4106-9f0f-8ca5f96d0642',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100007,
            'CanWrite',
            'Can Write',
            'Whether the grantee can upload/modify files in this storage account.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9e79952a-c33b-4bd5-a25b-6a922cb476dc' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '9e79952a-c33b-4bd5-a25b-6a922cb476dc',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '37477c58-4171-4b42-920e-4a0e824118f9' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '37477c58-4171-4b42-920e-4a0e824118f9',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100009,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '35d1c622-8b79-4eaf-b0ea-a086b20042ab' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '35d1c622-8b79-4eaf-b0ea-a086b20042ab',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68cfbfd4-fd6b-4621-9b4e-5a2e5b1988a2' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'FeatureKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '68cfbfd4-fd6b-4621-9b4e-5a2e5b1988a2',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100002,
            'FeatureKey',
            'Feature Key',
            'Unique dot-notation key identifying the feature, e.g. Shell.SearchBar.Enabled.',
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '98f893ea-0b22-4046-9e37-89af90b1f4a5' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'Value')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '98f893ea-0b22-4046-9e37-89af90b1f4a5',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100003,
            'Value',
            'Value',
            'Current value for this feature setting.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '995d40d4-e0ac-4420-b194-66620ad472a6' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'ValueType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '995d40d4-e0ac-4420-b194-66620ad472a6',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100004,
            'ValueType',
            'Value Type',
            'Data type of the value: boolean, string, number, or json.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'boolean',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0c5b053-1388-4fe6-9ba4-3efc253cbc9f' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b0c5b053-1388-4fe6-9ba4-3efc253cbc9f',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100005,
            'Category',
            'Category',
            'Grouping category for admin UI display.',
            'nvarchar',
            200,
            0,
            0,
            0,
            'General',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a13beb54-3fc6-460e-9d4c-e1ce12a04043' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a13beb54-3fc6-460e-9d4c-e1ce12a04043',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100006,
            'DisplayName',
            'Display Name',
            'Human-readable display name for the setting.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '61ee6ce9-05ec-44bb-bcc1-f582002f06c1' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '61ee6ce9-05ec-44bb-bcc1-f582002f06c1',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100007,
            'Description',
            'Description',
            'Optional extended description or help text for the setting.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4752afa5-778a-455e-9405-8e38628f0e7d' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = 'DefaultValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '4752afa5-778a-455e-9405-8e38628f0e7d',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100008,
            'DefaultValue',
            'Default Value',
            'Factory default value. Used when resetting to defaults.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7c218aa7-0623-4e41-9bdf-da8571867139' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7c218aa7-0623-4e41-9bdf-da8571867139',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100009,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '24b3b779-13fb-4233-8f4f-1083c727998e' OR (EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '24b3b779-13fb-4233-8f4f-1083c727998e',
            'D395F603-72CE-45C8-8F91-95670A0595A1', -- Entity: MJ: Instance Configurations
            100010,
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd9e04290-4dc3-4e8f-8229-352fed516e64' OR (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'IncludeInGlobalSearch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd9e04290-4dc3-4e8f-8229-352fed516e64',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100017,
            'IncludeInGlobalSearch',
            'Include In Global Search',
            'When true, this storage account is included in universal/global search results. Only effective if the associated provider supports search (SupportsSearch = 1).',
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

/* SQL text to insert entity field value with ID 5da2b20b-7c5c-4d59-8eee-41ef259ec2b0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5da2b20b-7c5c-4d59-8eee-41ef259ec2b0', 'F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2', 1, 'Everyone', 'Everyone', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 996d2868-9a4a-4808-8899-e6d5fd3c311b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('996d2868-9a4a-4808-8899-e6d5fd3c311b', 'F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 82de32c8-1829-43d2-b7b7-474138c94bbf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('82de32c8-1829-43d2-b7b7-474138c94bbf', 'F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2'

/* SQL text to insert entity field value with ID 3c1d9c04-b714-4abb-b25c-80b9b321687c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c1d9c04-b714-4abb-b25c-80b9b321687c', '995D40D4-E0AC-4420-B194-66620AD472A6', 1, 'boolean', 'boolean', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 967a9950-f2c0-4d12-9967-f17d157f207c */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('967a9950-f2c0-4d12-9967-f17d157f207c', '995D40D4-E0AC-4420-B194-66620AD472A6', 2, 'json', 'json', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 304e27e4-adfe-488a-94dd-1d3c5b951d62 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('304e27e4-adfe-488a-94dd-1d3c5b951d62', '995D40D4-E0AC-4420-B194-66620AD472A6', 3, 'number', 'number', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 9d738e09-f862-49bc-9f37-cbce54d5a1b9 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9d738e09-f862-49bc-9f37-cbce54d5a1b9', '995D40D4-E0AC-4420-B194-66620AD472A6', 4, 'string', 'string', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 995D40D4-E0AC-4420-B194-66620AD472A6 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='995D40D4-E0AC-4420-B194-66620AD472A6'


/* Create Entity Relationship: MJ: Roles -> MJ: File Storage Account Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1542b3a0-2ced-43bd-832a-9f8263b90008'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1542b3a0-2ced-43bd-832a-9f8263b90008', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', 'RoleID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: File Storage Account Permissions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '49121211-8e0b-452f-b5bc-878013dc6253'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('49121211-8e0b-452f-b5bc-878013dc6253', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', 'UserID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: File Storage Accounts -> MJ: File Storage Account Permissions (One To Many via FileStorageAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '6b6b9148-84a6-4b3c-941d-ea75adf6f0df'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6b6b9148-84a6-4b3c-941d-ea75adf6f0df', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', 'FileStorageAccountID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    

/* Index for Foreign Keys for ApplicationEntity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ApplicationID in table ApplicationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ApplicationEntity_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ApplicationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ApplicationEntity_ApplicationID ON [${flyway:defaultSchema}].[ApplicationEntity] ([ApplicationID]);

-- Index for foreign key EntityID in table ApplicationEntity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ApplicationEntity_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ApplicationEntity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ApplicationEntity_EntityID ON [${flyway:defaultSchema}].[ApplicationEntity] ([EntityID]);

/* Base View Permissions SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: Permissions for vwApplicationEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwApplicationEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spCreateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateApplicationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateApplicationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateApplicationEntity]
    @ID uniqueidentifier = NULL,
    @ApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @DefaultForNewUser bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
            (
                [ID],
                [ApplicationID],
                [EntityID],
                [Sequence],
                [DefaultForNewUser]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ApplicationID,
                @EntityID,
                @Sequence,
                ISNULL(@DefaultForNewUser, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
            (
                [ApplicationID],
                [EntityID],
                [Sequence],
                [DefaultForNewUser]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ApplicationID,
                @EntityID,
                @Sequence,
                ISNULL(@DefaultForNewUser, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwApplicationEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Application Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateApplicationEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spUpdateApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateApplicationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateApplicationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateApplicationEntity]
    @ID uniqueidentifier,
    @ApplicationID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @DefaultForNewUser bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationEntity]
    SET
        [ApplicationID] = @ApplicationID,
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [DefaultForNewUser] = @DefaultForNewUser
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwApplicationEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwApplicationEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ApplicationEntity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateApplicationEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateApplicationEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateApplicationEntity
ON [${flyway:defaultSchema}].[ApplicationEntity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ApplicationEntity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ApplicationEntity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Application Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateApplicationEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Application Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Application Entities
-- Item: spDeleteApplicationEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ApplicationEntity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteApplicationEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteApplicationEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteApplicationEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ApplicationEntity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Application Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteApplicationEntity] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ID uniqueidentifier = NULL,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit = NULL,
    @VirtualEntity bit = NULL,
    @TrackRecordChanges bit = NULL,
    @AuditRecordAccess bit = NULL,
    @AuditViewRuns bit = NULL,
    @IncludeInAPI bit = NULL,
    @AllowAllRowsAPI bit = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowCreateAPI bit = NULL,
    @AllowDeleteAPI bit = NULL,
    @CustomResolverAPI bit = NULL,
    @AllowUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit = NULL,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit = NULL,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit = NULL,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit = NULL,
    @spUpdateGenerated bit = NULL,
    @spDeleteGenerated bit = NULL,
    @CascadeDeletes bit = NULL,
    @DeleteType nvarchar(10) = NULL,
    @AllowRecordMerge bit = NULL,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20) = NULL,
    @UserFormGenerated bit = NULL,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20) = NULL,
    @RowsToPackSampleMethod nvarchar(20) = NULL,
    @RowsToPackSampleCount int = NULL,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25) = NULL,
    @DisplayName nvarchar(255),
    @AllowMultipleSubtypes bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateAllowUserSearchAPI bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ID],
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Entity]
            (
                [ParentID],
                [Name],
                [NameSuffix],
                [Description],
                [AutoUpdateDescription],
                [BaseView],
                [BaseViewGenerated],
                [VirtualEntity],
                [TrackRecordChanges],
                [AuditRecordAccess],
                [AuditViewRuns],
                [IncludeInAPI],
                [AllowAllRowsAPI],
                [AllowUpdateAPI],
                [AllowCreateAPI],
                [AllowDeleteAPI],
                [CustomResolverAPI],
                [AllowUserSearchAPI],
                [FullTextSearchEnabled],
                [FullTextCatalog],
                [FullTextCatalogGenerated],
                [FullTextIndex],
                [FullTextIndexGenerated],
                [FullTextSearchFunction],
                [FullTextSearchFunctionGenerated],
                [UserViewMaxRows],
                [spCreate],
                [spUpdate],
                [spDelete],
                [spCreateGenerated],
                [spUpdateGenerated],
                [spDeleteGenerated],
                [CascadeDeletes],
                [DeleteType],
                [AllowRecordMerge],
                [spMatch],
                [RelationshipDefaultDisplayType],
                [UserFormGenerated],
                [EntityObjectSubclassName],
                [EntityObjectSubclassImport],
                [PreferredCommunicationField],
                [Icon],
                [ScopeDefault],
                [RowsToPackWithSchema],
                [RowsToPackSampleMethod],
                [RowsToPackSampleCount],
                [RowsToPackSampleOrder],
                [AutoRowCountFrequency],
                [RowCount],
                [RowCountRunAt],
                [Status],
                [DisplayName],
                [AllowMultipleSubtypes],
                [AutoUpdateFullTextSearch],
                [AutoUpdateAllowUserSearchAPI]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ParentID,
                @Name,
                @NameSuffix,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                @BaseView,
                ISNULL(@BaseViewGenerated, 1),
                ISNULL(@VirtualEntity, 0),
                ISNULL(@TrackRecordChanges, 1),
                ISNULL(@AuditRecordAccess, 1),
                ISNULL(@AuditViewRuns, 1),
                ISNULL(@IncludeInAPI, 0),
                ISNULL(@AllowAllRowsAPI, 0),
                ISNULL(@AllowUpdateAPI, 0),
                ISNULL(@AllowCreateAPI, 0),
                ISNULL(@AllowDeleteAPI, 0),
                ISNULL(@CustomResolverAPI, 0),
                ISNULL(@AllowUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @FullTextCatalog,
                ISNULL(@FullTextCatalogGenerated, 1),
                @FullTextIndex,
                ISNULL(@FullTextIndexGenerated, 1),
                @FullTextSearchFunction,
                ISNULL(@FullTextSearchFunctionGenerated, 1),
                @UserViewMaxRows,
                @spCreate,
                @spUpdate,
                @spDelete,
                ISNULL(@spCreateGenerated, 1),
                ISNULL(@spUpdateGenerated, 1),
                ISNULL(@spDeleteGenerated, 1),
                ISNULL(@CascadeDeletes, 0),
                ISNULL(@DeleteType, 'Hard'),
                ISNULL(@AllowRecordMerge, 0),
                @spMatch,
                ISNULL(@RelationshipDefaultDisplayType, 'Search'),
                ISNULL(@UserFormGenerated, 1),
                @EntityObjectSubclassName,
                @EntityObjectSubclassImport,
                @PreferredCommunicationField,
                @Icon,
                @ScopeDefault,
                ISNULL(@RowsToPackWithSchema, 'None'),
                ISNULL(@RowsToPackSampleMethod, 'random'),
                ISNULL(@RowsToPackSampleCount, 0),
                @RowsToPackSampleOrder,
                @AutoRowCountFrequency,
                @RowCount,
                @RowCountRunAt,
                ISNULL(@Status, 'Active'),
                @DisplayName,
                ISNULL(@AllowMultipleSubtypes, 0),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25),
    @DisplayName nvarchar(255),
    @AllowMultipleSubtypes bit,
    @AutoUpdateFullTextSearch bit,
    @AutoUpdateAllowUserSearchAPI bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder,
        [AutoRowCountFrequency] = @AutoRowCountFrequency,
        [RowCount] = @RowCount,
        [RowCountRunAt] = @RowCountRunAt,
        [Status] = @Status,
        [DisplayName] = @DisplayName,
        [AllowMultipleSubtypes] = @AllowMultipleSubtypes,
        [AutoUpdateFullTextSearch] = @AutoUpdateFullTextSearch,
        [AutoUpdateAllowUserSearchAPI] = @AutoUpdateAllowUserSearchAPI
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Entity table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntity]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntity];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntity]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]
    

/* spDelete Permissions for MJ: Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for EntityFieldValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityFieldID in table EntityFieldValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityFieldValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID ON [${flyway:defaultSchema}].[EntityFieldValue] ([EntityFieldID]);

/* Base View Permissions SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: Permissions for vwEntityFieldValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFieldValues] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* spCreate SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spCreateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityFieldValue]
    @ID uniqueidentifier = NULL,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [ID],
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
            (
                [EntityFieldID],
                [Sequence],
                [Value],
                [Code],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityFieldID,
                @Sequence,
                @Value,
                @Code,
                @Description
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
    

/* spCreate Permissions for MJ: Entity Field Values */




/* spUpdate SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spUpdateEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityFieldValue]
    @ID uniqueidentifier,
    @EntityFieldID uniqueidentifier,
    @Sequence int,
    @Value nvarchar(255),
    @Code nvarchar(50),
    @Description nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        [EntityFieldID] = @EntityFieldID,
        [Sequence] = @Sequence,
        [Value] = @Value,
        [Code] = @Code,
        [Description] = @Description
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFieldValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFieldValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityFieldValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityFieldValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityFieldValue
ON [${flyway:defaultSchema}].[EntityFieldValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityFieldValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityFieldValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Field Values */




/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [${flyway:defaultSchema}].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category nvarchar(255),
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit = NULL,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields nvarchar(MAX),
    @JSONType nvarchar(255),
    @JSONTypeIsArray bit = NULL,
    @JSONTypeDefinition nvarchar(MAX),
    @UserSearchPredicateAPI nvarchar(20) = NULL,
    @AutoUpdateUserSearchPredicate bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [UserSearchPredicateAPI],
                [AutoUpdateUserSearchPredicate],
                [AutoUpdateFullTextSearch]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields,
                @JSONType,
                ISNULL(@JSONTypeIsArray, 0),
                @JSONTypeDefinition,
                ISNULL(@UserSearchPredicateAPI, 'Contains'),
                ISNULL(@AutoUpdateUserSearchPredicate, 1),
                ISNULL(@AutoUpdateFullTextSearch, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [UserSearchPredicateAPI],
                [AutoUpdateUserSearchPredicate],
                [AutoUpdateFullTextSearch]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields,
                @JSONType,
                ISNULL(@JSONTypeIsArray, 0),
                @JSONTypeDefinition,
                ISNULL(@UserSearchPredicateAPI, 'Contains'),
                ISNULL(@AutoUpdateUserSearchPredicate, 1),
                ISNULL(@AutoUpdateFullTextSearch, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25),
    @AutoUpdateIsNameField bit,
    @AutoUpdateDefaultInView bit,
    @AutoUpdateCategory bit,
    @AutoUpdateDisplayName bit,
    @AutoUpdateIncludeInUserSearchAPI bit,
    @Encrypt bit,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit,
    @SendEncryptedValue bit,
    @IsSoftPrimaryKey bit,
    @IsSoftForeignKey bit,
    @RelatedEntityJoinFields nvarchar(MAX),
    @JSONType nvarchar(255),
    @JSONTypeIsArray bit,
    @JSONTypeDefinition nvarchar(MAX),
    @UserSearchPredicateAPI nvarchar(20),
    @AutoUpdateUserSearchPredicate bit,
    @AutoUpdateFullTextSearch bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status,
        [AutoUpdateIsNameField] = @AutoUpdateIsNameField,
        [AutoUpdateDefaultInView] = @AutoUpdateDefaultInView,
        [AutoUpdateCategory] = @AutoUpdateCategory,
        [AutoUpdateDisplayName] = @AutoUpdateDisplayName,
        [AutoUpdateIncludeInUserSearchAPI] = @AutoUpdateIncludeInUserSearchAPI,
        [Encrypt] = @Encrypt,
        [EncryptionKeyID] = @EncryptionKeyID,
        [AllowDecryptInAPI] = @AllowDecryptInAPI,
        [SendEncryptedValue] = @SendEncryptedValue,
        [IsSoftPrimaryKey] = @IsSoftPrimaryKey,
        [IsSoftForeignKey] = @IsSoftForeignKey,
        [RelatedEntityJoinFields] = @RelatedEntityJoinFields,
        [JSONType] = @JSONType,
        [JSONTypeIsArray] = @JSONTypeIsArray,
        [JSONTypeDefinition] = @JSONTypeDefinition,
        [UserSearchPredicateAPI] = @UserSearchPredicateAPI,
        [AutoUpdateUserSearchPredicate] = @AutoUpdateUserSearchPredicate,
        [AutoUpdateFullTextSearch] = @AutoUpdateFullTextSearch
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for MJ: Entity Field Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Field Values
-- Item: spDeleteEntityFieldValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFieldValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityFieldValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityFieldValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityFieldValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for MJ: Entity Field Values */




/* spDelete SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for FileStorageAccountPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key FileStorageAccountID in table FileStorageAccountPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_FileStorageAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FileStorageAccountPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_FileStorageAccountID ON [${flyway:defaultSchema}].[FileStorageAccountPermission] ([FileStorageAccountID]);

-- Index for foreign key UserID in table FileStorageAccountPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FileStorageAccountPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_UserID ON [${flyway:defaultSchema}].[FileStorageAccountPermission] ([UserID]);

-- Index for foreign key RoleID in table FileStorageAccountPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_RoleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FileStorageAccountPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FileStorageAccountPermission_RoleID ON [${flyway:defaultSchema}].[FileStorageAccountPermission] ([RoleID]);

/* SQL text to update entity field related entity name field map for entity field ID 76486940-E410-4545-8862-45BF0085B8AB */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='76486940-E410-4545-8862-45BF0085B8AB', @RelatedEntityNameFieldMap='FileStorageAccount'

/* Index for Foreign Keys for FileStorageAccount */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProviderID in table FileStorageAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FileStorageAccount_ProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FileStorageAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FileStorageAccount_ProviderID ON [${flyway:defaultSchema}].[FileStorageAccount] ([ProviderID]);

-- Index for foreign key CredentialID in table FileStorageAccount
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FileStorageAccount_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FileStorageAccount]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FileStorageAccount_CredentialID ON [${flyway:defaultSchema}].[FileStorageAccount] ([CredentialID]);

/* Base View SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: vwFileStorageAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: File Storage Accounts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FileStorageAccount
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFileStorageAccounts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFileStorageAccounts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFileStorageAccounts]
AS
SELECT
    f.*,
    MJFileStorageProvider_ProviderID.[Name] AS [Provider],
    MJCredential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[FileStorageAccount] AS f
INNER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_ProviderID
  ON
    [f].[ProviderID] = MJFileStorageProvider_ProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_CredentialID
  ON
    [f].[CredentialID] = MJCredential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: Permissions for vwFileStorageAccounts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageAccounts] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: spCreateFileStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileStorageAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFileStorageAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageAccount]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ProviderID uniqueidentifier,
    @CredentialID uniqueidentifier,
    @IncludeInGlobalSearch bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FileStorageAccount]
            (
                [ID],
                [Name],
                [Description],
                [ProviderID],
                [CredentialID],
                [IncludeInGlobalSearch]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ProviderID,
                @CredentialID,
                ISNULL(@IncludeInGlobalSearch, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FileStorageAccount]
            (
                [Name],
                [Description],
                [ProviderID],
                [CredentialID],
                [IncludeInGlobalSearch]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ProviderID,
                @CredentialID,
                ISNULL(@IncludeInGlobalSearch, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFileStorageAccounts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageAccount] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: File Storage Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageAccount] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: spUpdateFileStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileStorageAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFileStorageAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageAccount]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @ProviderID uniqueidentifier,
    @CredentialID uniqueidentifier,
    @IncludeInGlobalSearch bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageAccount]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ProviderID] = @ProviderID,
        [CredentialID] = @CredentialID,
        [IncludeInGlobalSearch] = @IncludeInGlobalSearch
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFileStorageAccounts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFileStorageAccounts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageAccount] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FileStorageAccount table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFileStorageAccount]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFileStorageAccount];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFileStorageAccount
ON [${flyway:defaultSchema}].[FileStorageAccount]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageAccount]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FileStorageAccount] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: File Storage Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageAccount] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: File Storage Accounts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Accounts
-- Item: spDeleteFileStorageAccount
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageAccount
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFileStorageAccount]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageAccount];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageAccount]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FileStorageAccount]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageAccount] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: File Storage Accounts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageAccount] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 11116E6C-3F98-416E-A982-A2E4C3E351CF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='11116E6C-3F98-416E-A982-A2E4C3E351CF', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID C3D722F8-98DF-497B-987C-FDE597A6A3BE */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='C3D722F8-98DF-497B-987C-FDE597A6A3BE', @RelatedEntityNameFieldMap='Role'

/* Base View SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: vwFileStorageAccountPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: File Storage Account Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FileStorageAccountPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFileStorageAccountPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFileStorageAccountPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFileStorageAccountPermissions]
AS
SELECT
    f.*,
    MJFileStorageAccount_FileStorageAccountID.[Name] AS [FileStorageAccount],
    MJUser_UserID.[Name] AS [User],
    MJRole_RoleID.[Name] AS [Role]
FROM
    [${flyway:defaultSchema}].[FileStorageAccountPermission] AS f
INNER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_FileStorageAccountID
  ON
    [f].[FileStorageAccountID] = MJFileStorageAccount_FileStorageAccountID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [f].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Role] AS MJRole_RoleID
  ON
    [f].[RoleID] = MJRole_RoleID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageAccountPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: Permissions for vwFileStorageAccountPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageAccountPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: spCreateFileStorageAccountPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileStorageAccountPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFileStorageAccountPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageAccountPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageAccountPermission]
    @ID uniqueidentifier = NULL,
    @FileStorageAccountID uniqueidentifier,
    @Type nvarchar(20) = NULL,
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanRead bit = NULL,
    @CanWrite bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FileStorageAccountPermission]
            (
                [ID],
                [FileStorageAccountID],
                [Type],
                [UserID],
                [RoleID],
                [CanRead],
                [CanWrite]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FileStorageAccountID,
                ISNULL(@Type, 'Role'),
                @UserID,
                @RoleID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanWrite, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FileStorageAccountPermission]
            (
                [FileStorageAccountID],
                [Type],
                [UserID],
                [RoleID],
                [CanRead],
                [CanWrite]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FileStorageAccountID,
                ISNULL(@Type, 'Role'),
                @UserID,
                @RoleID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanWrite, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFileStorageAccountPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageAccountPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: File Storage Account Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageAccountPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: spUpdateFileStorageAccountPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileStorageAccountPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFileStorageAccountPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageAccountPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageAccountPermission]
    @ID uniqueidentifier,
    @FileStorageAccountID uniqueidentifier,
    @Type nvarchar(20),
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @CanRead bit,
    @CanWrite bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageAccountPermission]
    SET
        [FileStorageAccountID] = @FileStorageAccountID,
        [Type] = @Type,
        [UserID] = @UserID,
        [RoleID] = @RoleID,
        [CanRead] = @CanRead,
        [CanWrite] = @CanWrite
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFileStorageAccountPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFileStorageAccountPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageAccountPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FileStorageAccountPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFileStorageAccountPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFileStorageAccountPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFileStorageAccountPermission
ON [${flyway:defaultSchema}].[FileStorageAccountPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageAccountPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FileStorageAccountPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: File Storage Account Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageAccountPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: File Storage Account Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: File Storage Account Permissions
-- Item: spDeleteFileStorageAccountPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageAccountPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFileStorageAccountPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageAccountPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageAccountPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FileStorageAccountPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageAccountPermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: File Storage Account Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageAccountPermission] TO [cdp_Integration]



/* Index for Foreign Keys for InstanceConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: vwInstanceConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Instance Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  InstanceConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwInstanceConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwInstanceConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwInstanceConfigurations]
AS
SELECT
    i.*
FROM
    [${flyway:defaultSchema}].[InstanceConfiguration] AS i
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwInstanceConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: Permissions for vwInstanceConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwInstanceConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: spCreateInstanceConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InstanceConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateInstanceConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateInstanceConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateInstanceConfiguration]
    @ID uniqueidentifier = NULL,
    @FeatureKey nvarchar(200),
    @Value nvarchar(MAX),
    @ValueType nvarchar(20) = NULL,
    @Category nvarchar(100) = NULL,
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @DefaultValue nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[InstanceConfiguration]
            (
                [ID],
                [FeatureKey],
                [Value],
                [ValueType],
                [Category],
                [DisplayName],
                [Description],
                [DefaultValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @FeatureKey,
                @Value,
                ISNULL(@ValueType, 'boolean'),
                ISNULL(@Category, 'General'),
                @DisplayName,
                @Description,
                @DefaultValue
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[InstanceConfiguration]
            (
                [FeatureKey],
                [Value],
                [ValueType],
                [Category],
                [DisplayName],
                [Description],
                [DefaultValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @FeatureKey,
                @Value,
                ISNULL(@ValueType, 'boolean'),
                ISNULL(@Category, 'General'),
                @DisplayName,
                @Description,
                @DefaultValue
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwInstanceConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInstanceConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Instance Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInstanceConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: spUpdateInstanceConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InstanceConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInstanceConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInstanceConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInstanceConfiguration]
    @ID uniqueidentifier,
    @FeatureKey nvarchar(200),
    @Value nvarchar(MAX),
    @ValueType nvarchar(20),
    @Category nvarchar(100),
    @DisplayName nvarchar(200),
    @Description nvarchar(MAX),
    @DefaultValue nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InstanceConfiguration]
    SET
        [FeatureKey] = @FeatureKey,
        [Value] = @Value,
        [ValueType] = @ValueType,
        [Category] = @Category,
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [DefaultValue] = @DefaultValue
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInstanceConfigurations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInstanceConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInstanceConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InstanceConfiguration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInstanceConfiguration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInstanceConfiguration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInstanceConfiguration
ON [${flyway:defaultSchema}].[InstanceConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InstanceConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[InstanceConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Instance Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInstanceConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Instance Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Instance Configurations
-- Item: spDeleteInstanceConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InstanceConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteInstanceConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteInstanceConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteInstanceConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[InstanceConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInstanceConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Instance Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInstanceConfiguration] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '54dcbada-8ba9-4888-860c-0f5299faaffd' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'FileStorageAccount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '54dcbada-8ba9-4888-860c-0f5299faaffd',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100019,
            'FileStorageAccount',
            'File Storage Account',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            NULL,
            NULL,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd9480083-c4e3-41d5-bffd-c63aa19c22a3' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd9480083-c4e3-41d5-bffd-c63aa19c22a3',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100020,
            'User',
            'User',
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
            NULL,
            NULL,
            0,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '04b2823e-25b7-40f9-9a5a-4534d800a39e' OR (EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '04b2823e-25b7-40f9-9a5a-4534d800a39e',
            'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', -- Entity: MJ: File Storage Account Permissions
            100021,
            'Role',
            'Role',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            NULL,
            NULL,
            0,
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

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '514F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A94217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '514F17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '834D17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A94217F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'AF4217F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '54DCBADA-8BA9-4888-860C-0F5299FAAFFD'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'D9480083-C4E3-41D5-BFFD-C63AA19C22A3'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '04B2823E-25B7-40F9-9A5A-4534D800A39E'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DC3EBDA9-AFCA-4130-A6D7-175885771F5E'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'AA0C1BE8-65B4-4106-9F0F-8CA5F96D0642'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '54DCBADA-8BA9-4888-860C-0F5299FAAFFD'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D9480083-C4E3-41D5-BFFD-C63AA19C22A3'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '04B2823E-25B7-40F9-9A5A-4534D800A39E'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '54DCBADA-8BA9-4888-860C-0F5299FAAFFD'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'D9480083-C4E3-41D5-BFFD-C63AA19C22A3'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '04B2823E-25B7-40F9-9A5A-4534D800A39E'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '204F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C24D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C34D17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C44D17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'C54D17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '204F17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FED598B-CDBB-44F1-B679-7465F41E8D52' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Grantee Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F62ECAAE-80F3-4769-AFA0-1C04E2A9DBD2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11116E6C-3F98-416E-A982-A2E4C3E351CF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D9480083-C4E3-41D5-BFFD-C63AA19C22A3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3D722F8-98DF-497B-987C-FDE597A6A3BE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04B2823E-25B7-40F9-9A5A-4534D800A39E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.FileStorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76486940-E410-4545-8862-45BF0085B8AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.FileStorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54DCBADA-8BA9-4888-860C-0F5299FAAFFD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.CanRead 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC3EBDA9-AFCA-4130-A6D7-175885771F5E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.CanWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Access Rights',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA0C1BE8-65B4-4106-9F0F-8CA5F96D0642' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E79952A-C33B-4BD5-A25B-6A922CB476DC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37477C58-4171-4B42-920E-4A0E824118F9' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-shield-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('8c7602cd-2aed-4252-8c97-249e02fee01e', 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', 'FieldCategoryInfo', '{"Grantee Details":{"icon":"fa fa-user-shield","description":"Information about the user, role, or group being granted access permissions"},"Access Rights":{"icon":"fa fa-key","description":"Details regarding the target storage account and the specific actions allowed"},"System Metadata":{"icon":"fa fa-database","description":"Internal system identifiers and audit tracking information"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ad4fc688-817e-4eef-89d2-6571905fea00', 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5', 'FieldCategoryIcons', '{"Grantee Details":"fa fa-user-shield","Access Rights":"fa fa-key","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5'
      

/* Set categories for 75 fields */

-- UPDATE Entity Field Category Info MJ: Entity Fields.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '414D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsUnique 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoIncrement 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '045817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsVirtual 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '075817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsSoftPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F31790E1-FAA3-425A-B020-AEACAFCB2B6E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsSoftForeignKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5203089E-9FFC-4BB7-B23C-91F2555504D1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.FieldCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateDescription 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '044417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DefaultInView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '065817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ViewCellTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F34217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DefaultColumnWidth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowUpdateInView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IncludeInGeneratedForm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F54217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.GeneratedFormSection 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F64217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityDisplayType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F05717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ScopeDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C2449FB-1BDA-4BE9-A059-7224C05A14B9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateDisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8486168A-5082-48DC-BE13-EF53F49922CB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Length 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '005817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '015817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Scale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '025817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowsNull 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '035817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D74217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ValueListType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ExtendedType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '055817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.CodeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowUpdateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '404F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IncludeInUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '424F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.FullTextSearchEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.UserSearchParamFormatAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'User Search Param Format',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '434F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsNameField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B64217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateIncludeInUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E1D732F-E33E-40FE-AFAD-477623AC9DEA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.JSONType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D97C0BEC-3B59-4BA2-BAB5-432944AD257B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.JSONTypeIsArray 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B94F8690-5226-48A9-9C89-4549F141FBB7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.JSONTypeDefinition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'TypeScript'
WHERE 
   ID = '1187C2FF-0226-4790-8D0D-036D9F8A15C1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.UserSearchPredicateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints & Validation',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Search Predicate',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '901E0B5D-E65D-49AF-812D-B93FF6842219' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateUserSearchPredicate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '53F6ABA4-2D8D-4CD9-AC9C-E939B21F6DCF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateFullTextSearch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Data Constraints & Validation',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C378E50-E304-49CE-8858-AE7C7EFC8E99' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '954D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B74217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IncludeRelatedEntityNameFieldInBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Include Related Name In View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '974D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityNameFieldMap 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F74217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityIDFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '35A18EA5-5641-EF11-86C3-00224821D189' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateRelatedEntityInfo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFC3C691-2E33-46D0-B11C-AB348997E08C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityJoinFields 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'EE0B81ED-767A-4BCE-9E6E-E4E48711B482' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntitySchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Schema',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityBaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Table',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ValuesToPackWithSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20818E34-47E7-4371-A51E-3D29BCC4B4B8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '407A96C8-580A-4427-BEED-ABB46F015586' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateIsNameField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EFD956B-0DB1-491B-9153-0891A7B1835D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateDefaultInView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9707755-1A43-4DE3-815D-37E41CA7C7D0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateCategory 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D64DD327-8057-4DF5-A24C-F951932C1A26' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.BaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '594D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.BaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Encrypt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04C52058-4E01-4316-ABAE-9958AFB71B5C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EncryptionKeyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B24D31A6-A3BE-449C-9FE7-98C87E40DA55' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowDecryptInAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C097F3D-79AC-4144-A3B6-A8BFF64EDF3C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.SendEncryptedValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '901EE131-BC99-4B80-B5E5-D974057EEA8A' AND AutoUpdateCategory = 1

/* Set categories for 66 fields */

-- UPDATE Entity Field Category Info MJ: Entities.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '195817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.ParentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.NameSuffix 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '164E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.BaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '554D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.BaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '564D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.BaseViewGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '964D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '574D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.VirtualEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AllowMultipleSubtypes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18B53A1B-EE59-4382-B902-85BAC79BCED0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.CodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.ClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.BaseTableCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.ParentEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.ParentBaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.ParentBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.RelationshipDefaultDisplayType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Relationship Display',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F75817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.UserFormGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.EntityObjectSubclassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Subclass Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D84217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.EntityObjectSubclassImport 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Subclass Import Path',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateDescription 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F34E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.TrackRecordChanges 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B94D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AuditRecordAccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C74D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AuditViewRuns 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C84D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.PreferredCommunicationField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B15717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.IncludeInAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5B4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AllowAllRowsAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AllowUpdateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '414F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AllowCreateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AllowDeleteAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '804D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.CustomResolverAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '814D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AllowUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Allow User Search',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '444F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextSearchEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full-Text Search Enabled',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextCatalog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full-Text Catalog',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '204E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextCatalogGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full-Text Catalog Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '214E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextIndex 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full-Text Index',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '224E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextIndexGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full-Text Index Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '234E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextSearchFunction 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full-Text Search Function',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '244E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextSearchFunctionGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full-Text Search Function Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '254E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.UserViewMaxRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Max Rows Per View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F84217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.ScopeDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Scope',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BCA2D814-7530-48F8-9AB7-DCEF70AC5FC9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackWithSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Row Packing Strategy',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackSampleMethod 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Packing Sample Method',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EFB53FA7-D868-4E1C-9932-A5E624092DC5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackSampleCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Packing Sample Count',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B3B3BCB-9E96-4FB0-B2B2-93C676C43261' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.RowsToPackSampleOrder 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Packing Sample Order',
   ExtendedType = 'Code',
   CodeType = 'SQL'
WHERE 
   ID = '29690283-5206-48EA-ADF6-43C40DA3220B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateFullTextSearch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API & Search Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update Full-Text Search',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '634C3458-CDC9-4A93-AEDA-22B421EF204D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateAllowUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API & Search Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update User Search API',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B515DB5-7FDB-44A1-B728-E7CFF54F5EA5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spCreate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Create Procedure',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spUpdate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Update Procedure',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spDelete 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Delete Procedure',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spCreateGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Create Proc Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spUpdateGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Update Proc Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '904D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spDeleteGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Delete Proc Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '914D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.CascadeDeletes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.DeleteType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '115917F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AllowRecordMerge 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '125917F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spMatch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Match Procedure',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D05717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D15717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AutoRowCountFrequency 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2212928A-D5D0-4AE3-8F5A-25C4DFE8C373' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.RowCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84C51291-65AB-4677-A0B6-5DACD698A255' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.RowCountRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Last Counted At',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A02DE6F-6D75-46B7-B800-D42B82227D1A' AND AutoUpdateCategory = 1

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'A13BEB54-3FC6-460E-9D4C-E1CE12A04043'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '68CFBFD4-FD6B-4621-9B4E-5A2E5B1988A2'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '98F893EA-0B22-4046-9E37-89AF90B1F4A5'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B0C5B053-1388-4FE6-9BA4-3EFC253CBC9F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A13BEB54-3FC6-460E-9D4C-E1CE12A04043'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '68CFBFD4-FD6B-4621-9B4E-5A2E5B1988A2'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'B0C5B053-1388-4FE6-9BA4-3EFC253CBC9F'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = 'A13BEB54-3FC6-460E-9D4C-E1CE12A04043'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D9E04290-4DC3-4E8F-8229-352FED516E64'
               AND AutoUpdateDefaultInView = 1
            

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '7AF85902-718B-435E-8575-1A77B0533EB1'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Instance Configurations.FeatureKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68CFBFD4-FD6B-4621-9B4E-5A2E5B1988A2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A13BEB54-3FC6-460E-9D4C-E1CE12A04043' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61EE6CE9-05EC-44BB-BCC1-F582002F06C1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Admin Grouping',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0C5B053-1388-4FE6-9BA4-3EFC253CBC9F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.Value 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Value Management',
   GeneratedFormSection = 'Category',
   DisplayName = 'Current Value',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '98F893EA-0B22-4046-9E37-89AF90B1F4A5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.ValueType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Value Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '995D40D4-E0AC-4420-B194-66620AD472A6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Value Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4752AFA5-778A-455E-9405-8E38628F0E7D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '35D1C622-8B79-4EAF-B0EA-A086B20042AB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C218AA7-0623-4E41-9BDF-DA8571867139' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '24B3B779-13FB-4233-8F4F-1083C727998E' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-cogs */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-cogs', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'D395F603-72CE-45C8-8F91-95670A0595A1'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('450b9ffb-72ad-4945-aa36-89882d97ca3e', 'D395F603-72CE-45C8-8F91-95670A0595A1', 'FieldCategoryInfo', '{"Configuration Definition":{"icon":"fa fa-info-circle","description":"Fields that identify, label, and describe the configuration setting for administrators."},"Value Management":{"icon":"fa fa-sliders-h","description":"Fields related to the actual data values, types, and default settings for the feature toggle."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and internal identifiers."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a4a938a5-4c72-4c7b-924b-58cde4ec786a', 'D395F603-72CE-45C8-8F91-95670A0595A1', 'FieldCategoryIcons', '{"Configuration Definition":"fa fa-info-circle","Value Management":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'D395F603-72CE-45C8-8F91-95670A0595A1'
      

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6711D6D0-0FB5-4E95-94DE-936A1C3A22C2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFD9E389-750A-49F3-81C9-BCE972359D67' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AF85902-718B-435E-8575-1A77B0533EB1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.Provider 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CFBED107-E7F8-47D2-A4FC-6B6FDA5A0869' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.IncludeInGlobalSearch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Overview',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D9E04290-4DC3-4E8F-8229-352FED516E64' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.ProviderID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB4CA74A-55EB-49B5-8EF9-4B1D3FBB02E7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.CredentialID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2704A192-0578-41E4-B9F1-013431B49B9B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.Credential 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9315B467-17C6-4FA2-AB5F-70774E51DDCF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '940C9A4B-99C1-43F7-B52D-BB7BA6BD684D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Accounts.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7B02A9C8-027D-4EBD-995C-C5CE157976B5' AND AutoUpdateCategory = 1

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwApplicationEntities';
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntities';
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityFieldValues';
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityFields';

/* Generated Validation Functions for MJ: File Storage Account Permissions */
-- CHECK constraint for MJ: File Storage Account Permissions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([Type]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Type]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Type]=''Everyone'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateTypeTargetConsistency(result: ValidationResult) {
	// Ensure the target (User or Role) matches the selected Type
	if (this.Type === "User") {
		if (this.UserID == null || this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"UserID",
				"When the type is ''User'', a User must be selected and the Role field must be empty.",
				this.UserID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Type === "Role") {
		if (this.RoleID == null || this.UserID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"RoleID",
				"When the type is ''Role'', a Role must be selected and the User field must be empty.",
				this.RoleID,
				ValidationErrorType.Failure
			));
		}
	} else if (this.Type === "Everyone") {
		if (this.UserID != null || this.RoleID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"Type",
				"When the type is ''Everyone'', both the User and Role fields must be empty.",
				this.Type,
				ValidationErrorType.Failure
			));
		}
	} else {
		// If Type is none of the above, the constraint fails
		result.Errors.push(new ValidationErrorInfo(
			"Type",
			"The Type must be ''User'', ''Role'', or ''Everyone''.",
			this.Type,
			ValidationErrorType.Failure
		));
	}
}', 'Permissions must be assigned to a specific target based on the Type: a User must be selected for ''User'', a Role for ''Role'', and neither for ''Everyone''. This ensures access rules are correctly applied to the intended recipient.', 'ValidateTypeTargetConsistency', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B1C3E483-86EB-4A88-8E2B-88839F90E3E5');

            

