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
    AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1,
    AutoUpdateExtendedType BIT NOT NULL DEFAULT 1;
GO

-- Update the CHECK constraint to include new Geo* ExtendedType values
ALTER TABLE ${flyway:defaultSchema}.EntityField DROP CONSTRAINT CK_EntityField_ExtendedType;
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD CONSTRAINT CK_EntityField_ExtendedType CHECK (
    ExtendedType IN ('Code', 'Email', 'FaceTime', 'Geo', 'GeoLatitude', 'GeoLongitude', 'GeoCountry', 'GeoStateProvince', 'GeoCity', 'GeoPostalCode', 'GeoAddress', 'MSTeams', 'Other', 'SIP', 'SMS', 'Skype', 'Tel', 'URL', 'WhatsApp', 'ZoomMtg')
);
GO

----------------------------------------------------------------------
-- 2. Entity: FTS and search API auto-update fields
----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    AutoUpdateFullTextSearch BIT NOT NULL DEFAULT 1,
    AutoUpdateAllowUserSearchAPI BIT NOT NULL DEFAULT 1,
    TrustServerCacheCompletely BIT NOT NULL DEFAULT 1, 
    SupportsGeoCoding BIT NOT NULL DEFAULT 0,
    AutoUpdateSupportsGeoCoding BIT NOT NULL DEFAULT 1;
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

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true (default), CodeGen can automatically suggest and apply ExtendedType values (GeoLatitude, GeoLongitude, GeoAddress, etc.) during LLM field categorization. Set to 0 to lock admin-specified ExtendedType.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'EntityField',
    @level2type=N'COLUMN', @level2name=N'AutoUpdateExtendedType';



----------------------------------------------------------------------
-- 7. Extended properties: Entity columns
----------------------------------------------------------------------
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true, CodeGen generates geo-aware subclass code, adds __mj_Latitude/__mj_Longitude virtual fields to the base view, and the UI shows a map view toggle. Auto-set by CodeGen when LLM detects geo-capable fields (address, lat/lng, etc.).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Entity',
    @level2type=N'COLUMN', @level2name=N'SupportsGeoCoding';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When true (default), CodeGen can automatically set SupportsGeoCoding based on LLM analysis of entity fields. Set to 0 to lock the value and prevent CodeGen from changing it.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE',  @level1name=N'Entity',
    @level2type=N'COLUMN', @level2name=N'AutoUpdateSupportsGeoCoding';

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

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true (default), the server-side RunView cache will store and return cached results for this entity, trusting that all mutations flow through BaseEntity.Save() which fires cache invalidation events. Set to false for entities whose rows are created as side-effects of other operations via raw SQL (e.g., Record Changes created by spCreateRecordChange_Internal), since those inserts bypass BaseEntity and never trigger cache invalidation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'TrustServerCacheCompletely';

-- NOTE along with this migration we added TrustServerCacheCompletely=false to a bunch of entities like MJ: Record Changes


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







-- Migration: SearchProvider table
-- Provides metadata-driven plugin architecture for the SearchEngine.
-- Each row represents a registered search provider (e.g., vector, full-text, entity, storage, Algolia).
-- The SearchEngine discovers active providers at startup via ClassFactory using DriverClass.

CREATE TABLE ${flyway:defaultSchema}.SearchProvider (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(500) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    Priority INT NOT NULL DEFAULT 0,
    SupportsPreview BIT NOT NULL DEFAULT 1,
    MaxResultsOverride INT NULL,
    ProviderConfig NVARCHAR(MAX) NULL,
    CredentialID UNIQUEIDENTIFIER NULL,
    DisplayName NVARCHAR(200) NULL,
    Icon NVARCHAR(200) NULL,
    Comments NVARCHAR(MAX) NULL,
    CONSTRAINT PK_SearchProvider PRIMARY KEY (ID),
    CONSTRAINT FK_SearchProvider_Credential FOREIGN KEY (CredentialID)
        REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_SearchProvider_Status CHECK (Status IN ('Pending', 'Active', 'Terminated')),
    CONSTRAINT CK_SearchProvider_Priority CHECK (Priority >= 0)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'UI display name for this provider shown in filter facets and result grouping (e.g., "Database", "Semantic Search"). When NULL, falls back to the Name column.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'DisplayName';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'CSS icon class for UI display in filter facets and result badges (e.g., "fa-solid fa-database", "fa-solid fa-brain"). Supports any CSS-based icon library. When NULL, a default icon is used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'Icon';




-- Extended properties
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name for this search provider (e.g., "Vector Search", "Algolia")',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable description of what this provider searches and how it works',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ClassFactory key used with @RegisterClass(ISearchProvider, DriverClass) to instantiate the provider at runtime',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Provider lifecycle status: Pending (not yet activated), Active (in use), Terminated (disabled)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Execution priority (lower = higher priority). Controls provider ordering and can influence RRF weighting. Must be >= 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this provider should run during fast preview/autocomplete searches. Expensive providers (external APIs) may set this to 0.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'SupportsPreview';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional per-provider cap on the number of results to return. Useful for rate-limited or pay-per-query external APIs. When NULL, uses the SearchEngine default.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'MaxResultsOverride';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON configuration blob for provider-specific settings (e.g., API endpoints, index names, tuning parameters). Schema is provider-defined.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'ProviderConfig';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional FK to the Credential entity for providers that require authentication (e.g., Algolia API key, external service credentials)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'CredentialID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-form notes about this provider configuration',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SearchProvider',
    @level2type = N'COLUMN', @level2name = N'Comments';







































































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
         '14b62084-d683-487e-a939-d63af61ad31f',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '14b62084-d683-487e-a939-d63af61ad31f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('14b62084-d683-487e-a939-d63af61ad31f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('14b62084-d683-487e-a939-d63af61ad31f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: File Storage Account Permissions for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('14b62084-d683-487e-a939-d63af61ad31f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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
         '33c4f895-3313-4da7-91e3-9d30ad19f4cd',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '33c4f895-3313-4da7-91e3-9d30ad19f4cd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Instance Configurations for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('33c4f895-3313-4da7-91e3-9d30ad19f4cd', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Instance Configurations for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('33c4f895-3313-4da7-91e3-9d30ad19f4cd', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Instance Configurations for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('33c4f895-3313-4da7-91e3-9d30ad19f4cd', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

/* SQL generated to create new entity MJ: Search Providers */

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
         'c6923fa5-3f3d-4756-a2d8-e57125af450f',
         'MJ: Search Providers',
         'Search Providers',
         NULL,
         NULL,
         'SearchProvider',
         'vwSearchProviders',
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
   

/* SQL generated to add new entity MJ: Search Providers to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c6923fa5-3f3d-4756-a2d8-e57125af450f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Providers for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6923fa5-3f3d-4756-a2d8-e57125af450f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Providers for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6923fa5-3f3d-4756-a2d8-e57125af450f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0, GETUTCDATE(), GETUTCDATE())

/* SQL generated to add new permission for entity MJ: Search Providers for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c6923fa5-3f3d-4756-a2d8-e57125af450f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE())

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

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchProvider] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchProvider */
UPDATE [${flyway:defaultSchema}].[SearchProvider] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchProvider] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchProvider] ADD CONSTRAINT [DF___mj_SearchProvider___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchProvider] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchProvider */
UPDATE [${flyway:defaultSchema}].[SearchProvider] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchProvider] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SearchProvider */
ALTER TABLE [${flyway:defaultSchema}].[SearchProvider] ADD CONSTRAINT [DF___mj_SearchProvider___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a261204e-3866-41b3-92eb-784c74d2f906' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'UserSearchPredicateAPI')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a261204e-3866-41b3-92eb-784c74d2f906',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '292a1bed-3ca2-4c24-8b8e-cab2a4b2125c' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateUserSearchPredicate')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '292a1bed-3ca2-4c24-8b8e-cab2a4b2125c',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c3caf473-d086-44cf-ad6c-99a5cca926dd' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateFullTextSearch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c3caf473-d086-44cf-ad6c-99a5cca926dd',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '58a3a9f6-ee7a-409f-bf3d-ad34c153b84a' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateExtendedType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '58a3a9f6-ee7a-409f-bf3d-ad34c153b84a',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            100135,
            'AutoUpdateExtendedType',
            'Auto Update Extended Type',
            'When true (default), CodeGen can automatically suggest and apply ExtendedType values (GeoLatitude, GeoLongitude, GeoAddress, etc.) during LLM field categorization. Set to 0 to lock admin-specified ExtendedType.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '788d2007-4088-405b-98cd-056b376dd4e1' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateFullTextSearch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '788d2007-4088-405b-98cd-056b376dd4e1',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5371af90-dcf3-44c3-990b-95c29b088f0c' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateAllowUserSearchAPI')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5371af90-dcf3-44c3-990b-95c29b088f0c',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '928ff8e1-3c3f-4a9d-afcc-66808d59c151' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TrustServerCacheCompletely')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '928ff8e1-3c3f-4a9d-afcc-66808d59c151',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100125,
            'TrustServerCacheCompletely',
            'Trust Server Cache Completely',
            'When true (default), the server-side RunView cache will store and return cached results for this entity, trusting that all mutations flow through BaseEntity.Save() which fires cache invalidation events. Set to false for entities whose rows are created as side-effects of other operations via raw SQL (e.g., Record Changes created by spCreateRecordChange_Internal), since those inserts bypass BaseEntity and never trigger cache invalidation.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '886c982a-13b1-4ee2-8c89-a96b995bad5d' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SupportsGeoCoding')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '886c982a-13b1-4ee2-8c89-a96b995bad5d',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100126,
            'SupportsGeoCoding',
            'Supports Geo Coding',
            'When true, CodeGen generates geo-aware subclass code, adds ${flyway:defaultSchema}_Latitude/${flyway:defaultSchema}_Longitude virtual fields to the base view, and the UI shows a map view toggle. Auto-set by CodeGen when LLM detects geo-capable fields (address, lat/lng, etc.).',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a70e1dba-0077-49ca-aec4-cee1203d3946' OR (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateSupportsGeoCoding')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a70e1dba-0077-49ca-aec4-cee1203d3946',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entities
            100127,
            'AutoUpdateSupportsGeoCoding',
            'Auto Update Supports Geo Coding',
            'When true (default), CodeGen can automatically set SupportsGeoCoding based on LLM analysis of entity fields. Set to 0 to lock the value and prevent CodeGen from changing it.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cb71b885-cf35-4ab8-9649-fdf0a2696f44' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cb71b885-cf35-4ab8-9649-fdf0a2696f44',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd2bde8d7-a171-4eb3-9c70-1e6294b9105f' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'FeatureKey')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd2bde8d7-a171-4eb3-9c70-1e6294b9105f',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a99fe155-6749-457d-8f1c-3a35d944e2da' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'Value')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a99fe155-6749-457d-8f1c-3a35d944e2da',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3fba3d85-4e47-49f9-a262-4aaba9232c96' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'ValueType')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '3fba3d85-4e47-49f9-a262-4aaba9232c96',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c3a6973-be4c-4d3e-8605-3fa5eea73c76' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'Category')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6c3a6973-be4c-4d3e-8605-3fa5eea73c76',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a3d474c6-e6da-4c19-9829-0e63524374eb' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a3d474c6-e6da-4c19-9829-0e63524374eb',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd4142b87-219d-4a43-b9a0-9c24c65c2f41' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd4142b87-219d-4a43-b9a0-9c24c65c2f41',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '106b981d-9dd9-4707-a90f-e45cea1829f5' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = 'DefaultValue')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '106b981d-9dd9-4707-a90f-e45cea1829f5',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '716a7406-1e2e-42e2-9752-064c76f387bc' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '716a7406-1e2e-42e2-9752-064c76f387bc',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd1107233-4dcc-45ab-be90-990d5a5d51bb' OR (EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd1107233-4dcc-45ab-be90-990d5a5d51bb',
            '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', -- Entity: MJ: Instance Configurations
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8ae710d5-bdaa-4199-a3c2-40d6ae691427' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '8ae710d5-bdaa-4199-a3c2-40d6ae691427',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f809cd8-8a92-495c-825e-b43c1d88ea48' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'FileStorageAccountID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '1f809cd8-8a92-495c-825e-b43c1d88ea48',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fe2ac7bc-5f6d-462d-a09b-a66bd1854476' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'Type')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'fe2ac7bc-5f6d-462d-a09b-a66bd1854476',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a73293c1-fb0d-4900-a60b-74f947d02b59' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'UserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a73293c1-fb0d-4900-a60b-74f947d02b59',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1f340cfc-f345-42c0-992e-b01515f473ff' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'RoleID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '1f340cfc-f345-42c0-992e-b01515f473ff',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '62f5ffe5-fd80-4760-a498-ea0bbd8c30b9' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'CanRead')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '62f5ffe5-fd80-4760-a498-ea0bbd8c30b9',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ba33aa2e-a18e-48e6-a7c3-32a51b489b16' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'CanWrite')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'ba33aa2e-a18e-48e6-a7c3-32a51b489b16',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'faea9e50-5f21-4bdf-b1f9-c7a114be8795' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'faea9e50-5f21-4bdf-b1f9-c7a114be8795',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cbd51c2b-1434-4656-b354-232629f3ea65' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cbd51c2b-1434-4656-b354-232629f3ea65',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e2f5b8cc-d154-4554-bca5-5487e00a7653' OR (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'IncludeInGlobalSearch')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e2f5b8cc-d154-4554-bca5-5487e00a7653',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '01d75fe9-0677-4dd0-9b17-7d87a6aa2545' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '01d75fe9-0677-4dd0-9b17-7d87a6aa2545',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2f1ee105-22ac-4e15-bc79-50c1a2cb5a0e' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'Name')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '2f1ee105-22ac-4e15-bc79-50c1a2cb5a0e',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100002,
            'Name',
            'Name',
            'Display name for this search provider (e.g., "Vector Search", "Algolia")',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c693032c-02c8-43ad-9f0c-91b0d8c5246f' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'Description')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'c693032c-02c8-43ad-9f0c-91b0d8c5246f',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100003,
            'Description',
            'Description',
            'Human-readable description of what this provider searches and how it works',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b57c3774-e6b4-4fe3-934f-2853228b7571' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'DriverClass')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b57c3774-e6b4-4fe3-934f-2853228b7571',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100004,
            'DriverClass',
            'Driver Class',
            'ClassFactory key used with @RegisterClass(ISearchProvider, DriverClass) to instantiate the provider at runtime',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '38eb0b5a-78bd-4318-ac30-6243d7754d7b' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'Status')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '38eb0b5a-78bd-4318-ac30-6243d7754d7b',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100005,
            'Status',
            'Status',
            'Provider lifecycle status: Pending (not yet activated), Active (in use), Terminated (disabled)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5606aa9e-2d13-4421-bae1-76517dd83aa2' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'Priority')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '5606aa9e-2d13-4421-bae1-76517dd83aa2',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100006,
            'Priority',
            'Priority',
            'Execution priority (lower = higher priority). Controls provider ordering and can influence RRF weighting. Must be >= 0.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7196fc12-55e7-4d8e-8b14-75fbbde2a38e' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'SupportsPreview')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '7196fc12-55e7-4d8e-8b14-75fbbde2a38e',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100007,
            'SupportsPreview',
            'Supports Preview',
            'Whether this provider should run during fast preview/autocomplete searches. Expensive providers (external APIs) may set this to 0.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a1393f82-28ec-4b51-8948-cfbe4a01daa6' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'MaxResultsOverride')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a1393f82-28ec-4b51-8948-cfbe4a01daa6',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100008,
            'MaxResultsOverride',
            'Max Results Override',
            'Optional per-provider cap on the number of results to return. Useful for rate-limited or pay-per-query external APIs. When NULL, uses the SearchEngine default.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '975cd5ae-a9fa-4888-80f4-1506c585b7bb' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'ProviderConfig')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '975cd5ae-a9fa-4888-80f4-1506c585b7bb',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100009,
            'ProviderConfig',
            'Provider Config',
            'Optional JSON configuration blob for provider-specific settings (e.g., API endpoints, index names, tuning parameters). Schema is provider-defined.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '431e42e5-21e4-4f24-a486-46982d2ab695' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'CredentialID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '431e42e5-21e4-4f24-a486-46982d2ab695',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100010,
            'CredentialID',
            'Credential ID',
            'Optional FK to the Credential entity for providers that require authentication (e.g., Algolia API key, external service credentials)',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '20511d87-40f5-4a9d-8833-3ffe61d04916' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'DisplayName')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '20511d87-40f5-4a9d-8833-3ffe61d04916',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100011,
            'DisplayName',
            'Display Name',
            'UI display name for this provider shown in filter facets and result grouping (e.g., "Database", "Semantic Search"). When NULL, falls back to the Name column.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'fcd58c1f-7a00-4fe8-bf07-d10c0fe3e95b' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'Icon')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'fcd58c1f-7a00-4fe8-bf07-d10c0fe3e95b',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100012,
            'Icon',
            'Icon',
            'CSS icon class for UI display in filter facets and result badges (e.g., "fa-solid fa-database", "fa-solid fa-brain"). Supports any CSS-based icon library. When NULL, a default icon is used.',
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'cc1b35c6-7b04-47f3-b564-85fb92e46c2b' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'Comments')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'cc1b35c6-7b04-47f3-b564-85fb92e46c2b',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100013,
            'Comments',
            'Comments',
            'Free-form notes about this provider configuration',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e64dab70-3fd4-4312-821e-a2d6e56c7870' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'e64dab70-3fd4-4312-821e-a2d6e56c7870',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '854d8a7c-b071-4ab7-a9c2-c10efbcfba57' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '854d8a7c-b071-4ab7-a9c2-c10efbcfba57',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100015,
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

/* SQL text to insert entity field value with ID d8dbb0dc-44d0-4680-b336-71394f02963a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d8dbb0dc-44d0-4680-b336-71394f02963a', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 5, 'GeoAddress', 'GeoAddress', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID e9e3aea7-9f3c-47c8-9ce2-5fdf64d34acf */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e9e3aea7-9f3c-47c8-9ce2-5fdf64d34acf', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 6, 'GeoCity', 'GeoCity', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID afae0954-1959-46d7-ad86-7b042bfbaebb */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('afae0954-1959-46d7-ad86-7b042bfbaebb', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 7, 'GeoCountry', 'GeoCountry', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 38d62f4e-338a-4bf2-b1a6-16106fa0fa01 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('38d62f4e-338a-4bf2-b1a6-16106fa0fa01', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 8, 'GeoLatitude', 'GeoLatitude', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7e3f3656-ad62-4294-a3a9-2ea254c91269 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7e3f3656-ad62-4294-a3a9-2ea254c91269', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 9, 'GeoLongitude', 'GeoLongitude', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID b6d14033-c479-4167-b075-e2796f8a159d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b6d14033-c479-4167-b075-e2796f8a159d', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 10, 'GeoPostalCode', 'GeoPostalCode', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID d2054017-412b-457a-a98e-aa2400128bad */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d2054017-412b-457a-a98e-aa2400128bad', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 11, 'GeoStateProvince', 'GeoStateProvince', GETUTCDATE(), GETUTCDATE())

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=12 WHERE ID='F45F1816-CAAA-434C-8239-3932D448DEB6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=13 WHERE ID='68A4F7CA-B203-40C8-ABAC-A91122866B00'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=14 WHERE ID='DFD25989-75AD-4F5B-8F18-88E687E067E5'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=15 WHERE ID='7758B42A-D133-4052-9991-1869AA5DFD74'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=16 WHERE ID='5B3460FB-56CC-4DAB-8375-60BDCD11FE35'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=17 WHERE ID='E1D0D56C-10D6-4A7C-BED8-D4F7A439204D'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=18 WHERE ID='A5865195-4AD1-432D-8797-57D25F3741FF'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=19 WHERE ID='356C61B4-27B5-48F3-A240-31B0CC6CA23D'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=20 WHERE ID='45F07992-2974-4F4B-A5C8-FAECCF86BDB9'

/* SQL text to insert entity field value with ID 3146f90e-0e7f-40e1-8794-f731366686f1 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3146f90e-0e7f-40e1-8794-f731366686f1', 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476', 1, 'Everyone', 'Everyone', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 707f0986-3a6c-4964-93c7-3db87f9e88e7 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('707f0986-3a6c-4964-93c7-3db87f9e88e7', 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476', 2, 'Role', 'Role', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 28b67d40-9c5a-4394-8cf3-84313c3beeaa */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('28b67d40-9c5a-4394-8cf3-84313c3beeaa', 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476', 3, 'User', 'User', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID FE2AC7BC-5F6D-462D-A09B-A66BD1854476 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='FE2AC7BC-5F6D-462D-A09B-A66BD1854476'

/* SQL text to insert entity field value with ID 92cbba12-3e5d-4e82-8f84-abf09841b98a */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('92cbba12-3e5d-4e82-8f84-abf09841b98a', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 1, 'boolean', 'boolean', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 7651d9d0-d810-4c76-b21b-9aad9ea10d54 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7651d9d0-d810-4c76-b21b-9aad9ea10d54', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 2, 'json', 'json', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 62b9a5b6-39fc-4b0f-8b57-feae68e675f3 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('62b9a5b6-39fc-4b0f-8b57-feae68e675f3', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 3, 'number', 'number', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 55fac5ae-b8bd-47b8-9168-32b6cb5556ea */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('55fac5ae-b8bd-47b8-9168-32b6cb5556ea', '3FBA3D85-4E47-49F9-A262-4AABA9232C96', 4, 'string', 'string', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 3FBA3D85-4E47-49F9-A262-4AABA9232C96 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='3FBA3D85-4E47-49F9-A262-4AABA9232C96'

/* SQL text to insert entity field value with ID 0187904a-0ba9-4fea-859a-632a4a189f0e */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('0187904a-0ba9-4fea-859a-632a4a189f0e', '38EB0B5A-78BD-4318-AC30-6243D7754D7B', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 4f91f3f9-806d-4ae3-88d2-a6274cf51e9f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4f91f3f9-806d-4ae3-88d2-a6274cf51e9f', '38EB0B5A-78BD-4318-AC30-6243D7754D7B', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE())

/* SQL text to insert entity field value with ID 6c21fc66-1dcc-4c3f-ab80-9b1bf9efc661 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6c21fc66-1dcc-4c3f-ab80-9b1bf9efc661', '38EB0B5A-78BD-4318-AC30-6243D7754D7B', 3, 'Terminated', 'Terminated', GETUTCDATE(), GETUTCDATE())

/* SQL text to update ValueListType for entity field ID 38EB0B5A-78BD-4318-AC30-6243D7754D7B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='38EB0B5A-78BD-4318-AC30-6243D7754D7B'


/* Create Entity Relationship: MJ: Roles -> MJ: File Storage Account Permissions (One To Many via RoleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'fdb5ba5f-1e07-4bb8-8439-c14f7f4bea7c'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('fdb5ba5f-1e07-4bb8-8439-c14f7f4bea7c', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', '14B62084-D683-487E-A939-D63AF61AD31F', 'RoleID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Users -> MJ: File Storage Account Permissions (One To Many via UserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'ce674f35-e1b1-46e3-81e4-ecfb86e61b69'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ce674f35-e1b1-46e3-81e4-ecfb86e61b69', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '14B62084-D683-487E-A939-D63AF61AD31F', 'UserID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: Credentials -> MJ: Search Providers (One To Many via CredentialID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '5e1c0afa-9a3b-453f-ba31-b1b499491297'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5e1c0afa-9a3b-453f-ba31-b1b499491297', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', 'CredentialID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    


/* Create Entity Relationship: MJ: File Storage Accounts -> MJ: File Storage Account Permissions (One To Many via FileStorageAccountID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '1e130a27-246a-4215-aa1b-f1ba7badc7bc'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1e130a27-246a-4215-aa1b-f1ba7badc7bc', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', '14B62084-D683-487E-A939-D63AF61AD31F', 'FileStorageAccountID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
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
    @AutoUpdateAllowUserSearchAPI bit = NULL,
    @TrustServerCacheCompletely bit = NULL,
    @SupportsGeoCoding bit = NULL,
    @AutoUpdateSupportsGeoCoding bit = NULL
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
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding]
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
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1)
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
                [AutoUpdateAllowUserSearchAPI],
                [TrustServerCacheCompletely],
                [SupportsGeoCoding],
                [AutoUpdateSupportsGeoCoding]
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
                ISNULL(@AutoUpdateAllowUserSearchAPI, 1),
                ISNULL(@TrustServerCacheCompletely, 1),
                ISNULL(@SupportsGeoCoding, 0),
                ISNULL(@AutoUpdateSupportsGeoCoding, 1)
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
    @AutoUpdateAllowUserSearchAPI bit,
    @TrustServerCacheCompletely bit,
    @SupportsGeoCoding bit,
    @AutoUpdateSupportsGeoCoding bit
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
        [AutoUpdateAllowUserSearchAPI] = @AutoUpdateAllowUserSearchAPI,
        [TrustServerCacheCompletely] = @TrustServerCacheCompletely,
        [SupportsGeoCoding] = @SupportsGeoCoding,
        [AutoUpdateSupportsGeoCoding] = @AutoUpdateSupportsGeoCoding
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
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateExtendedType bit = NULL
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
                [AutoUpdateFullTextSearch],
                [AutoUpdateExtendedType]
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
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateExtendedType, 1)
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
                [AutoUpdateFullTextSearch],
                [AutoUpdateExtendedType]
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
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateExtendedType, 1)
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
    @AutoUpdateFullTextSearch bit,
    @AutoUpdateExtendedType bit
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
        [AutoUpdateFullTextSearch] = @AutoUpdateFullTextSearch,
        [AutoUpdateExtendedType] = @AutoUpdateExtendedType
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

/* SQL text to update entity field related entity name field map for entity field ID 1F809CD8-8A92-495C-825E-B43C1D88EA48 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1F809CD8-8A92-495C-825E-B43C1D88EA48', @RelatedEntityNameFieldMap='FileStorageAccount'

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



/* SQL text to update entity field related entity name field map for entity field ID A73293C1-FB0D-4900-A60B-74F947D02B59 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A73293C1-FB0D-4900-A60B-74F947D02B59', @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 1F340CFC-F345-42C0-992E-B01515F473FF */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1F340CFC-F345-42C0-992E-B01515F473FF', @RelatedEntityNameFieldMap='Role'

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



/* Index for Foreign Keys for SearchProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialID in table SearchProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SearchProvider_CredentialID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SearchProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SearchProvider_CredentialID ON [${flyway:defaultSchema}].[SearchProvider] ([CredentialID]);

/* SQL text to update entity field related entity name field map for entity field ID 431E42E5-21E4-4F24-A486-46982D2AB695 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='431E42E5-21E4-4F24-A486-46982D2AB695', @RelatedEntityNameFieldMap='Credential'

/* Base View SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: vwSearchProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SearchProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSearchProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSearchProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSearchProviders]
AS
SELECT
    s.*,
    MJCredential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[SearchProvider] AS s
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Credential] AS MJCredential_CredentialID
  ON
    [s].[CredentialID] = MJCredential_CredentialID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: Permissions for vwSearchProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSearchProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: spCreateSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(500),
    @Status nvarchar(20) = NULL,
    @Priority int = NULL,
    @SupportsPreview bit = NULL,
    @MaxResultsOverride int,
    @ProviderConfig nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @DisplayName nvarchar(200),
    @Icon nvarchar(200),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchProvider]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [Status],
                [Priority],
                [SupportsPreview],
                [MaxResultsOverride],
                [ProviderConfig],
                [CredentialID],
                [DisplayName],
                [Icon],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                ISNULL(@Status, 'Active'),
                ISNULL(@Priority, 0),
                ISNULL(@SupportsPreview, 1),
                @MaxResultsOverride,
                @ProviderConfig,
                @CredentialID,
                @DisplayName,
                @Icon,
                @Comments
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchProvider]
            (
                [Name],
                [Description],
                [DriverClass],
                [Status],
                [Priority],
                [SupportsPreview],
                [MaxResultsOverride],
                [ProviderConfig],
                [CredentialID],
                [DisplayName],
                [Icon],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                ISNULL(@Status, 'Active'),
                ISNULL(@Priority, 0),
                ISNULL(@SupportsPreview, 1),
                @MaxResultsOverride,
                @ProviderConfig,
                @CredentialID,
                @DisplayName,
                @Icon,
                @Comments
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSearchProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchProvider] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Search Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchProvider] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: spUpdateSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchProvider]
    @ID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(500),
    @Status nvarchar(20),
    @Priority int,
    @SupportsPreview bit,
    @MaxResultsOverride int,
    @ProviderConfig nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @DisplayName nvarchar(200),
    @Icon nvarchar(200),
    @Comments nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchProvider]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [Status] = @Status,
        [Priority] = @Priority,
        [SupportsPreview] = @SupportsPreview,
        [MaxResultsOverride] = @MaxResultsOverride,
        [ProviderConfig] = @ProviderConfig,
        [CredentialID] = @CredentialID,
        [DisplayName] = @DisplayName,
        [Icon] = @Icon,
        [Comments] = @Comments
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSearchProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSearchProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchProvider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchProvider
ON [${flyway:defaultSchema}].[SearchProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Search Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchProvider] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Search Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Providers
-- Item: spDeleteSearchProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SearchProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSearchProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSearchProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SearchProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchProvider] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Search Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSearchProvider] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a5b70913-c4af-4cf1-ae6f-931cd3614203' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'FileStorageAccount')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'a5b70913-c4af-4cf1-ae6f-931cd3614203',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6c491c08-2a0f-483e-92b2-262a948d7c47' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'User')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            '6c491c08-2a0f-483e-92b2-262a948d7c47',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b8bc2eac-413e-468c-80f6-6e157134ad23' OR (EntityID = '14B62084-D683-487E-A939-D63AF61AD31F' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'b8bc2eac-413e-468c-80f6-6e157134ad23',
            '14B62084-D683-487E-A939-D63AF61AD31F', -- Entity: MJ: File Storage Account Permissions
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd41e3892-8d33-4998-81d2-632caa6f22cf' OR (EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F' AND Name = 'Credential')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
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
            'd41e3892-8d33-4998-81d2-632caa6f22cf',
            'C6923FA5-3F3D-4756-A2D8-E57125AF450F', -- Entity: MJ: Search Providers
            100031,
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
            NULL,
            NULL,
            0,
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
               WHERE ID = '204F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

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
               WHERE ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '594D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '6C491C08-2A0F-483E-92B2-262A948D7C47'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'B8BC2EAC-413E-468C-80F6-6E157134AD23'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '62F5FFE5-FD80-4760-A498-EA0BBD8C30B9'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BA33AA2E-A18E-48E6-A7C3-32A51B489B16'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6C491C08-2A0F-483E-92B2-262A948D7C47'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B8BC2EAC-413E-468C-80F6-6E157134AD23'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6C491C08-2A0F-483E-92B2-262A948D7C47'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B8BC2EAC-413E-468C-80F6-6E157134AD23'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '84C51291-65AB-4677-A0B6-5DACD698A255'
               AND AutoUpdateDefaultInView = 1
            

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8AE710D5-BDAA-4199-A3C2-40D6AE691427' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.FileStorageAccountID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Permissions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F809CD8-8A92-495C-825E-B43C1D88EA48' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.FileStorageAccount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Permissions',
   GeneratedFormSection = 'Category',
   DisplayName = 'Storage Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A5B70913-C4AF-4CF1-AE6F-931CD3614203' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.CanRead 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Permissions',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '62F5FFE5-FD80-4760-A498-EA0BBD8C30B9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.CanWrite 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Account Permissions',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA33AA2E-A18E-48E6-A7C3-32A51B489B16' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Permission Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE2AC7BC-5F6D-462D-A09B-A66BD1854476' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A73293C1-FB0D-4900-A60B-74F947D02B59' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'User Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C491C08-2A0F-483E-92B2-262A948D7C47' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.RoleID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F340CFC-F345-42C0-992E-B01515F473FF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.Role 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Grantee Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Role Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8BC2EAC-413E-468C-80F6-6E157134AD23' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FAEA9E50-5F21-4BDF-B1F9-C7A114BE8795' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: File Storage Account Permissions.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBD51C2B-1434-4656-B354-232629F3EA65' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-shield-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-shield-alt', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '14B62084-D683-487E-A939-D63AF61AD31F'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('c19cde13-37fb-466b-9a9f-2cb0c8ae331a', '14B62084-D683-487E-A939-D63AF61AD31F', 'FieldCategoryInfo', '{"Grantee Information":{"icon":"fa fa-user-lock","description":"Details regarding the user, role, or group to whom the permission is being granted."},"Account Permissions":{"icon":"fa fa-key","description":"The target storage account and the specific read/write access levels assigned to the grantee."},"System Metadata":{"icon":"fa fa-cog","description":"Internal system identifiers and audit timestamps for tracking record changes."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('d76fe517-b5c9-44ac-8804-a521ad85969e', '14B62084-D683-487E-A939-D63AF61AD31F', 'FieldCategoryIcons', '{"Grantee Information":"fa fa-user-lock","Account Permissions":"fa fa-key","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '14B62084-D683-487E-A939-D63AF61AD31F'
      

/* Set categories for 76 fields */

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
   ExtendedType = NULL,
   CodeType = NULL
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
   DisplayName = 'Data Type',
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
   DisplayName = 'Include In User Search',
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
   DisplayName = 'Search Param Format',
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
   DisplayName = 'Auto Update Search Inclusion',
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
   ID = 'A261204E-3866-41B3-92EB-784C74D2F906' AND AutoUpdateCategory = 1

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
   DisplayName = 'Related Entity Field',
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
   DisplayName = 'Related Entity Name Map',
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
   DisplayName = 'Auto Update Related Info',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFC3C691-2E33-46D0-B11C-AB348997E08C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityJoinFields 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
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

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateUserSearchPredicate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System & Audit Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update Search Predicate',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '292A1BED-3CA2-4C24-8B8E-CAB2A4B2125C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateFullTextSearch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System & Audit Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3CAF473-D086-44CF-AD6C-99A5CCA926DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateExtendedType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System & Audit Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58A3A9F6-EE7A-409F-BF3D-AD34C153B84A' AND AutoUpdateCategory = 1

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

/* Set categories for 69 fields */

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
   DisplayName = 'Default Relationship Display Type',
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

-- UPDATE Entity Field Category Info MJ: Entities.SupportsGeoCoding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'User Interface & Customization',
   GeneratedFormSection = 'Category',
   DisplayName = 'Supports Geo-Coding',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '886C982A-13B1-4EE2-8C89-A96B995BAD5D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateSupportsGeoCoding 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'User Interface & Customization',
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update Geo-Coding',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A70E1DBA-0077-49CA-AEC4-CEE1203D3946' AND AutoUpdateCategory = 1

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
   DisplayName = 'Search Function',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '244E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.FullTextSearchFunctionGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Function Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '254E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.UserViewMaxRows 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
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
   DisplayName = 'Rows To Pack',
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
   DisplayName = 'Auto Update Search Settings',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '788D2007-4088-405B-98CD-056B376DD4E1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.AutoUpdateAllowUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API & Search Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update Search API',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5371AF90-DCF3-44C3-990B-95C29B088F0C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.TrustServerCacheCompletely 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API & Search Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Trust Server Cache',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '928FF8E1-3C3F-4A9D-AFCC-66808D59C151' AND AutoUpdateCategory = 1

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
   DisplayName = 'Create SP Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spUpdateGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Update SP Generated',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '904D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entities.spDeleteGenerated 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Delete SP Generated',
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
   DisplayName = 'Refresh Frequency (Hours)',
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
               WHERE ID = 'A3D474C6-E6DA-4C19-9829-0E63524374EB'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D2BDE8D7-A171-4EB3-9C70-1E6294B9105F'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A99FE155-6749-457D-8F1C-3A35D944E2DA'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3FBA3D85-4E47-49F9-A262-4AABA9232C96'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6C3A6973-BE4C-4D3E-8605-3FA5EEA73C76'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A3D474C6-E6DA-4C19-9829-0E63524374EB'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D2BDE8D7-A171-4EB3-9C70-1E6294B9105F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6C3A6973-BE4C-4D3E-8605-3FA5EEA73C76'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A3D474C6-E6DA-4C19-9829-0E63524374EB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E2F5B8CC-D154-4554-BCA5-5487E00A7653'
               AND AutoUpdateDefaultInView = 1
            

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B57C3774-E6B4-4FE3-934F-2853228B7571'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '38EB0B5A-78BD-4318-AC30-6243D7754D7B'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5606AA9E-2D13-4421-BAE1-76517DD83AA2'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '20511D87-40F5-4A9D-8833-3FFE61D04916'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D41E3892-8D33-4998-81D2-632CAA6F22CF'
               AND AutoUpdateDefaultInView = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '38EB0B5A-78BD-4318-AC30-6243D7754D7B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '20511D87-40F5-4A9D-8833-3FFE61D04916'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Instance Configurations.FeatureKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D2BDE8D7-A171-4EB3-9C70-1E6294B9105F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A3D474C6-E6DA-4C19-9829-0E63524374EB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Definition',
   GeneratedFormSection = 'Category',
   DisplayName = 'Admin Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C3A6973-BE4C-4D3E-8605-3FA5EEA73C76' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Feature Definition',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D4142B87-219D-4A43-B9A0-9C24C65C2F41' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.Value 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Current Value',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A99FE155-6749-457D-8F1C-3A35D944E2DA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.ValueType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3FBA3D85-4E47-49F9-A262-4AABA9232C96' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration Settings',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '106B981D-9DD9-4707-A90F-E45CEA1829F5' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CB71B885-CF35-4AB8-9649-FDF0A2696F44' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '716A7406-1E2E-42E2-9752-064C76F387BC' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Instance Configurations.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D1107233-4DCC-45AB-BE90-990D5A5D51BB' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-sliders-h */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-sliders-h', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('40d40ed6-9cc0-42d5-854b-6ae08b6c97c5', '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', 'FieldCategoryInfo', '{"Feature Definition":{"icon":"fa fa-tag","description":"Core identification, naming, and descriptive information for the feature toggle"},"Configuration Settings":{"icon":"fa fa-toggle-on","description":"Operational values, data types, and default settings for the configuration"},"System Metadata":{"icon":"fa fa-database","description":"System-managed identifiers and audit tracking timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('028adcf6-cc88-4a49-aff8-104265a4fbb6', '33C4F895-3313-4DA7-91E3-9D30AD19F4CD', 'FieldCategoryIcons', '{"Feature Definition":"fa fa-tag","Configuration Settings":"fa fa-toggle-on","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = '33C4F895-3313-4DA7-91E3-9D30AD19F4CD'
      

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Search Providers.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01D75FE9-0677-4DD0-9B17-7D87A6AA2545' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F1EE105-22AC-4E15-BC79-50C1A2CB5A0E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20511D87-40F5-4A9D-8833-3FFE61D04916' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C693032C-02C8-43AD-9F0C-91B0D8C5246F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.Icon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FCD58C1F-7A00-4FE8-BF07-D10C0FE3E95B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Provider Identity',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38EB0B5A-78BD-4318-AC30-6243D7754D7B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.DriverClass 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B57C3774-E6B4-4FE3-934F-2853228B7571' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.Priority 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5606AA9E-2D13-4421-BAE1-76517DD83AA2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.SupportsPreview 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7196FC12-55E7-4D8E-8B14-75FBBDE2A38E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.MaxResultsOverride 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Search Behavior',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1393F82-28EC-4B51-8948-CFBE4A01DAA6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.ProviderConfig 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration & Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Provider Configuration',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '975CD5AE-A9FA-4888-80F4-1506C585B7BB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.CredentialID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration & Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '431E42E5-21E4-4F24-A486-46982D2AB695' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.Credential 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration & Security',
   GeneratedFormSection = 'Category',
   DisplayName = 'Credential Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D41E3892-8D33-4998-81D2-632CAA6F22CF' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Configuration & Security',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC1B35C6-7B04-47F3-B564-85FB92E46C2B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E64DAB70-3FD4-4312-821E-A2D6E56C7870' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Search Providers.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '854D8A7C-B071-4AB7-A9C2-C10EFBCFBA57' AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-search */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET Icon = 'fa fa-search', __mj_UpdatedAt = GETUTCDATE()
               WHERE ID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F'
            

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a2fdfa6b-e010-428c-b3c8-66b0bc96fa58', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', 'FieldCategoryInfo', '{"Provider Identity":{"icon":"fa fa-id-card","description":"Core identification and UI display properties for the search provider"},"Search Behavior":{"icon":"fa fa-cogs","description":"Technical settings governing how and when the search provider executes"},"Configuration & Security":{"icon":"fa fa-key","description":"Provider-specific JSON settings, credentials, and administrative notes"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit fields and unique identifiers"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting (legacy) */

               INSERT INTO [${flyway:defaultSchema}].[EntitySetting] (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('ecac7693-7718-4bc4-97df-50050d446c20', 'C6923FA5-3F3D-4756-A2D8-E57125AF450F', 'FieldCategoryIcons', '{"Provider Identity":"fa fa-id-card","Search Behavior":"fa fa-cogs","Configuration & Security":"fa fa-key","System Metadata":"fa fa-database"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity (category: system, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET DefaultForNewUser = 0, __mj_UpdatedAt = GETUTCDATE()
         WHERE EntityID = 'C6923FA5-3F3D-4756-A2D8-E57125AF450F'
      

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
   DisplayName = 'Provider Type',
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
   ID = 'E2F5B8CC-D154-4554-BCA5-5487E00A7653' AND AutoUpdateCategory = 1

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
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([Type]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Type]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Type]=''Everyone'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateTypeIdentifierAssignment(result: ValidationResult) {
	// Validates that the correct ID is provided or omitted based on the Type field
	const isUserValid = this.Type === "User" && this.UserID != null && this.RoleID == null;
	const isRoleValid = this.Type === "Role" && this.RoleID != null && this.UserID == null;
	const isEveryoneValid = this.Type === "Everyone" && this.UserID == null && this.RoleID == null;

	if (!isUserValid && !isRoleValid && !isEveryoneValid) {
		result.Errors.push(new ValidationErrorInfo(
			"Type",
			"The identifier assignment is invalid for the selected Type. ''User'' requires a User ID and no Role ID, ''Role'' requires a Role ID and no User ID, and ''Everyone'' requires both to be empty.",
			this.Type,
			ValidationErrorType.Failure
		));
	}
}', 'Permissions must be correctly assigned based on the type: a ''User'' type requires a User ID and no Role ID, a ''Role'' type requires a Role ID and no User ID, and the ''Everyone'' type requires both IDs to be empty. This ensures that permissions are always linked to the correct entity.', 'ValidateTypeIdentifierAssignment', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '14B62084-D683-487E-A939-D63AF61AD31F');

            

/* Generated Validation Functions for MJ: Search Providers */
-- CHECK constraint for MJ: Search Providers: Field: Priority was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', GETUTCDATE(), 'TypeScript','Approved', '([Priority]>=(0))', 'public ValidatePriorityAtLeastZero(result: ValidationResult) {
	if (this.Priority < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Priority",
			"Priority must be 0 or greater.",
			this.Priority,
			ValidationErrorType.Failure
		));
	}
}', 'The priority level must be a non-negative value (0 or greater) to ensure valid ordering and categorization of records.', 'ValidatePriorityAtLeastZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5606AA9E-2D13-4421-BAE1-76517DD83AA2');

            

