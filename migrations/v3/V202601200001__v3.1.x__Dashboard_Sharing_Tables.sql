-- =====================================================================================================================
-- Migration: Dashboard Sharing Infrastructure
-- Version: 3.2.x
-- Description: Creates permission and organization tables for dashboard sharing
--   - DashboardPermission: Granular user permissions for individual dashboards
--   - DashboardCategoryPermission: Permissions for entire dashboard folders/categories
--   - DashboardCategoryLink: Allows users to link dashboards to their own category structure
-- =====================================================================================================================

-- =====================================================================================================================
-- Table 1: DashboardPermission
-- Purpose: Manages user permissions for individual dashboards with granular access control
-- =====================================================================================================================
CREATE TABLE [${flyway:defaultSchema}].[DashboardPermission] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DashboardID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [CanRead] BIT NOT NULL DEFAULT 1,
    [CanEdit] BIT NOT NULL DEFAULT 0,
    [CanDelete] BIT NOT NULL DEFAULT 0,
    [CanShare] BIT NOT NULL DEFAULT 0,
    [SharedByUserID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_DashboardPermission] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DashboardPermission_DashboardID] FOREIGN KEY ([DashboardID])
        REFERENCES [${flyway:defaultSchema}].[Dashboard]([ID]),
    CONSTRAINT [FK_DashboardPermission_UserID] FOREIGN KEY ([UserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_DashboardPermission_SharedByUserID] FOREIGN KEY ([SharedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID])
);
GO

-- Table description
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Manages user permissions for dashboards with granular access control (Read, Edit, Delete, Share). Each record grants a specific user access to a dashboard with configurable permission levels.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardPermission';
GO

-- Column descriptions
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can view the dashboard and its contents',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardPermission',
    @level2type = N'COLUMN', @level2name = N'CanRead';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can modify the dashboard layout, add/remove parts, or change settings',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardPermission',
    @level2type = N'COLUMN', @level2name = N'CanEdit';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can delete the dashboard entirely',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardPermission',
    @level2type = N'COLUMN', @level2name = N'CanDelete';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can share the dashboard with other users',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardPermission',
    @level2type = N'COLUMN', @level2name = N'CanShare';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who granted this permission. NULL if shared by the dashboard owner.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardPermission',
    @level2type = N'COLUMN', @level2name = N'SharedByUserID';
GO
 
-- Unique constraint: One permission record per user per dashboard
CREATE UNIQUE INDEX UQ_DashboardPermission_Dashboard_User
    ON [${flyway:defaultSchema}].[DashboardPermission] ([DashboardID], [UserID]);
GO


-- =====================================================================================================================
-- Table 2: DashboardCategoryPermission
-- Purpose: Manages user permissions for dashboard categories (folders), cascading to all dashboards within
-- =====================================================================================================================
CREATE TABLE [${flyway:defaultSchema}].[DashboardCategoryPermission] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DashboardCategoryID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [CanRead] BIT NOT NULL DEFAULT 1,
    [CanEdit] BIT NOT NULL DEFAULT 0,
    [CanAddRemove] BIT NOT NULL DEFAULT 0,
    [CanShare] BIT NOT NULL DEFAULT 0,
    [SharedByUserID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_DashboardCategoryPermission] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DashboardCategoryPermission_DashboardCategoryID] FOREIGN KEY ([DashboardCategoryID])
        REFERENCES [${flyway:defaultSchema}].[DashboardCategory]([ID]),
    CONSTRAINT [FK_DashboardCategoryPermission_UserID] FOREIGN KEY ([UserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_DashboardCategoryPermission_SharedByUserID] FOREIGN KEY ([SharedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID])
);
GO

-- Table description
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Manages user permissions for dashboard categories (folders). Permissions cascade to all dashboards within the category. Enables sharing entire folders of dashboards with granular access control.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryPermission';
GO

-- Column descriptions
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can view dashboards within this category',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryPermission',
    @level2type = N'COLUMN', @level2name = N'CanRead';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can modify dashboards within this category',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryPermission',
    @level2type = N'COLUMN', @level2name = N'CanEdit';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can add new dashboards to or remove dashboards from this category',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryPermission',
    @level2type = N'COLUMN', @level2name = N'CanAddRemove';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can share this category with other users',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryPermission',
    @level2type = N'COLUMN', @level2name = N'CanShare';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who granted this permission. NULL if shared by the category owner.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryPermission',
    @level2type = N'COLUMN', @level2name = N'SharedByUserID';
GO
 
-- Unique constraint: One permission record per user per category
CREATE UNIQUE INDEX UQ_DashboardCategoryPermission_Category_User
    ON [${flyway:defaultSchema}].[DashboardCategoryPermission] ([DashboardCategoryID], [UserID]);
GO


-- =====================================================================================================================
-- Table 3: DashboardCategoryLink
-- Purpose: Allows users to link dashboards to their own category structure for personal organization
-- A dashboard can appear in multiple users' category structures without being duplicated
-- =====================================================================================================================
CREATE TABLE [${flyway:defaultSchema}].[DashboardCategoryLink] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [DashboardID] UNIQUEIDENTIFIER NOT NULL,
    [UserID] UNIQUEIDENTIFIER NOT NULL,
    [DashboardCategoryID] UNIQUEIDENTIFIER NULL,
    [DisplayName] NVARCHAR(255) NULL,
    [Sequence] INT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_DashboardCategoryLink] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_DashboardCategoryLink_DashboardID] FOREIGN KEY ([DashboardID])
        REFERENCES [${flyway:defaultSchema}].[Dashboard]([ID]),
    CONSTRAINT [FK_DashboardCategoryLink_UserID] FOREIGN KEY ([UserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [FK_DashboardCategoryLink_DashboardCategoryID] FOREIGN KEY ([DashboardCategoryID])
        REFERENCES [${flyway:defaultSchema}].[DashboardCategory]([ID])
);
GO

-- Table description
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Allows users to organize shared dashboards into their own category structure. Creates a link/reference to a dashboard without duplicating it. Users can optionally provide a custom display name and control ordering within their folders.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryLink';
GO

-- Column descriptions
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The category in the user''s personal folder structure. NULL means the dashboard appears at root level.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryLink',
    @level2type = N'COLUMN', @level2name = N'DashboardCategoryID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional user-friendly alias for the dashboard within this user''s view. If NULL, uses the original dashboard name.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryLink',
    @level2type = N'COLUMN', @level2name = N'DisplayName';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order of this dashboard within the user''s category. Lower values appear first.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'DashboardCategoryLink',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO
 

-- Unique constraint: One link per user per dashboard per category (user can link same dashboard to multiple categories)
CREATE UNIQUE INDEX UQ_DashboardCategoryLink_Dashboard_User_Category
    ON [${flyway:defaultSchema}].[DashboardCategoryLink] ([DashboardID], [UserID], [DashboardCategoryID]);
GO











































































-- CODE GEN RUN 
/* SQL generated to create new entity MJ: Dashboard Permissions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '771ed81a-b504-4027-b223-ca3abbaa3c75',
         'MJ: Dashboard Permissions',
         'Dashboard Permissions',
         NULL,
         NULL,
         'DashboardPermission',
         'vwDashboardPermissions',
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
      )
   

/* SQL generated to add new entity MJ: Dashboard Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '771ed81a-b504-4027-b223-ca3abbaa3c75', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Dashboard Permissions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('771ed81a-b504-4027-b223-ca3abbaa3c75', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Permissions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('771ed81a-b504-4027-b223-ca3abbaa3c75', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Permissions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('771ed81a-b504-4027-b223-ca3abbaa3c75', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Dashboard Category Permissions */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'c7a44d04-4b50-4106-bf58-9e0c430906f4',
         'MJ: Dashboard Category Permissions',
         'Dashboard Category Permissions',
         NULL,
         NULL,
         'DashboardCategoryPermission',
         'vwDashboardCategoryPermissions',
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
      )
   

/* SQL generated to add new entity MJ: Dashboard Category Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c7a44d04-4b50-4106-bf58-9e0c430906f4', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Dashboard Category Permissions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c7a44d04-4b50-4106-bf58-9e0c430906f4', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Category Permissions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c7a44d04-4b50-4106-bf58-9e0c430906f4', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Category Permissions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c7a44d04-4b50-4106-bf58-9e0c430906f4', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Dashboard Category Links */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'dc90010a-21cf-4f61-af37-f528e4b31aa2',
         'MJ: Dashboard Category Links',
         'Dashboard Category Links',
         NULL,
         NULL,
         'DashboardCategoryLink',
         'vwDashboardCategoryLinks',
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
      )
   

/* SQL generated to add new entity MJ: Dashboard Category Links to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'dc90010a-21cf-4f61-af37-f528e4b31aa2', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Dashboard Category Links for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('dc90010a-21cf-4f61-af37-f528e4b31aa2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Category Links for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('dc90010a-21cf-4f61-af37-f528e4b31aa2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Category Links for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('dc90010a-21cf-4f61-af37-f528e4b31aa2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DashboardCategoryPermission */
ALTER TABLE [${flyway:defaultSchema}].[DashboardCategoryPermission] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DashboardCategoryPermission */
ALTER TABLE [${flyway:defaultSchema}].[DashboardCategoryPermission] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DashboardPermission */
ALTER TABLE [${flyway:defaultSchema}].[DashboardPermission] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DashboardPermission */
ALTER TABLE [${flyway:defaultSchema}].[DashboardPermission] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DashboardCategoryLink */
ALTER TABLE [${flyway:defaultSchema}].[DashboardCategoryLink] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DashboardCategoryLink */
ALTER TABLE [${flyway:defaultSchema}].[DashboardCategoryLink] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8619a6ea-b91a-444d-872c-d57c6f3a4337'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8619a6ea-b91a-444d-872c-d57c6f3a4337',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1edb9153-3135-4923-9c24-18c1b4b73e59'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'DashboardCategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1edb9153-3135-4923-9c24-18c1b4b73e59',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100002,
            'DashboardCategoryID',
            'Dashboard Category ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '26248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7c5d7cf8-cc50-411d-bb85-5a6255d75e1e'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c5d7cf8-cc50-411d-bb85-5a6255d75e1e',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100003,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dd81f3cc-00bd-4169-9866-82d327db957a'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'CanRead')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dd81f3cc-00bd-4169-9866-82d327db957a',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100004,
            'CanRead',
            'Can Read',
            'Whether the user can view dashboards within this category',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd8963007-4bce-4d9e-973f-ad8f5996f1db'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'CanEdit')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd8963007-4bce-4d9e-973f-ad8f5996f1db',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100005,
            'CanEdit',
            'Can Edit',
            'Whether the user can modify dashboards within this category',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5e064156-5b7d-44f5-a93d-5758951bd692'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'CanAddRemove')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5e064156-5b7d-44f5-a93d-5758951bd692',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100006,
            'CanAddRemove',
            'Can Add Remove',
            'Whether the user can add new dashboards to or remove dashboards from this category',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b6aeb28f-04e2-49ea-9178-f3f17b9cee8f'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'CanShare')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b6aeb28f-04e2-49ea-9178-f3f17b9cee8f',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100007,
            'CanShare',
            'Can Share',
            'Whether the user can share this category with other users',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '341251ff-8c37-4afc-b203-120e710adb94'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'SharedByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '341251ff-8c37-4afc-b203-120e710adb94',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100008,
            'SharedByUserID',
            'Shared By User ID',
            'The user who granted this permission. NULL if shared by the category owner.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a4ac9b9c-dfaa-446c-9771-c1e712ee1c5a'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a4ac9b9c-dfaa-446c-9771-c1e712ee1c5a',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '13f4e2d5-7e98-4b79-a811-d8459265fe64'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '13f4e2d5-7e98-4b79-a811-d8459265fe64',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '794cd25f-ac1b-460e-8f12-58ecef1540a1'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '794cd25f-ac1b-460e-8f12-58ecef1540a1',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fe2fce0d-a2ae-450d-9358-4f82d9c7195e'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'DashboardID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fe2fce0d-a2ae-450d-9358-4f82d9c7195e',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100002,
            'DashboardID',
            'Dashboard ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '05248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7b198679-d820-4a33-994e-e08bb0df66fa'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7b198679-d820-4a33-994e-e08bb0df66fa',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100003,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3508d5e1-defb-41ce-8eb1-18651fe5d512'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'CanRead')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3508d5e1-defb-41ce-8eb1-18651fe5d512',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100004,
            'CanRead',
            'Can Read',
            'Whether the user can view the dashboard and its contents',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '618b7b56-5bee-4bfa-a3aa-cbf8435a307b'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'CanEdit')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '618b7b56-5bee-4bfa-a3aa-cbf8435a307b',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100005,
            'CanEdit',
            'Can Edit',
            'Whether the user can modify the dashboard layout, add/remove parts, or change settings',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3ba6728c-8ca3-4f22-8e9f-e1da448c2579'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'CanDelete')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3ba6728c-8ca3-4f22-8e9f-e1da448c2579',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100006,
            'CanDelete',
            'Can Delete',
            'Whether the user can delete the dashboard entirely',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5ab597eb-10ab-4264-b5f8-c373929373d0'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'CanShare')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5ab597eb-10ab-4264-b5f8-c373929373d0',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100007,
            'CanShare',
            'Can Share',
            'Whether the user can share the dashboard with other users',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b50a3b4e-d70f-4e48-aeab-426bdcd10db1'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'SharedByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b50a3b4e-d70f-4e48-aeab-426bdcd10db1',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100008,
            'SharedByUserID',
            'Shared By User ID',
            'The user who granted this permission. NULL if shared by the dashboard owner.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3cd4f1d7-cf8e-47df-9969-9e860122fead'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3cd4f1d7-cf8e-47df-9969-9e860122fead',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7bceaeb0-1607-41c0-ad09-fc27e0287859'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7bceaeb0-1607-41c0-ad09-fc27e0287859',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ad94730a-859e-4848-9c8e-aaab0429741e'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ad94730a-859e-4848-9c8e-aaab0429741e',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '20995548-64db-47d0-b532-da12608f11c0'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'DashboardID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '20995548-64db-47d0-b532-da12608f11c0',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100002,
            'DashboardID',
            'Dashboard ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '05248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e8c09759-9f04-4045-b648-bf6281745137'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e8c09759-9f04-4045-b648-bf6281745137',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100003,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5af7ba52-e69e-4fa9-b620-7e9d380480e2'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'DashboardCategoryID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5af7ba52-e69e-4fa9-b620-7e9d380480e2',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100004,
            'DashboardCategoryID',
            'Dashboard Category ID',
            'The category in the user''s personal folder structure. NULL means the dashboard appears at root level.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '26248F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '39dcc23e-670e-4a3b-849f-9f808474517f'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'DisplayName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '39dcc23e-670e-4a3b-849f-9f808474517f',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100005,
            'DisplayName',
            'Display Name',
            'Optional user-friendly alias for the dashboard within this user''s view. If NULL, uses the original dashboard name.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a3545394-6da5-4d9b-be58-e59e7dcdfeb9'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'Sequence')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a3545394-6da5-4d9b-be58-e59e7dcdfeb9',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100006,
            'Sequence',
            'Sequence',
            'Display order of this dashboard within the user''s category. Lower values appear first.',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3c69dc3a-8dda-40dc-9348-4a15b826a3bb'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3c69dc3a-8dda-40dc-9348-4a15b826a3bb',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100007,
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '348d40a3-82da-4bba-8f2c-f65825a54676'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '348d40a3-82da-4bba-8f2c-f65825a54676',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100008,
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
            'Search'
         )
      END

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '274ec64b-6605-412c-97e2-24d54b1f7a60'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('274ec64b-6605-412c-97e2-24d54b1f7a60', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C7A44D04-4B50-4106-BF58-9E0C430906F4', 'UserID', 'One To Many', 1, 1, 'MJ: Dashboard Category Permissions', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4df971e6-fbf5-4664-9809-f2cd913e11af'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4df971e6-fbf5-4664-9809-f2cd913e11af', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C7A44D04-4B50-4106-BF58-9E0C430906F4', 'SharedByUserID', 'One To Many', 1, 1, 'MJ: Dashboard Category Permissions', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '410fc0a7-d806-4cfe-ab46-0851afa9ef08'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('410fc0a7-d806-4cfe-ab46-0851afa9ef08', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'DC90010A-21CF-4F61-AF37-F528E4B31AA2', 'UserID', 'One To Many', 1, 1, 'MJ: Dashboard Category Links', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c5e028c8-5366-45d5-aa41-a8fbd4141b98'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c5e028c8-5366-45d5-aa41-a8fbd4141b98', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '771ED81A-B504-4027-B223-CA3ABBAA3C75', 'SharedByUserID', 'One To Many', 1, 1, 'MJ: Dashboard Permissions', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'dee326a5-8469-42fc-acf5-3e8b95154452'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('dee326a5-8469-42fc-acf5-3e8b95154452', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '771ED81A-B504-4027-B223-CA3ABBAA3C75', 'UserID', 'One To Many', 1, 1, 'MJ: Dashboard Permissions', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1a9140c7-ba9d-4d08-a719-181b12edc305'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1a9140c7-ba9d-4d08-a719-181b12edc305', '05248F34-2837-EF11-86D4-6045BDEE16E6', '771ED81A-B504-4027-B223-CA3ABBAA3C75', 'DashboardID', 'One To Many', 1, 1, 'MJ: Dashboard Permissions', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f61e111e-f8b2-4851-964c-cd08482dd52d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f61e111e-f8b2-4851-964c-cd08482dd52d', '05248F34-2837-EF11-86D4-6045BDEE16E6', 'DC90010A-21CF-4F61-AF37-F528E4B31AA2', 'DashboardID', 'One To Many', 1, 1, 'MJ: Dashboard Category Links', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'fcd2bb99-12ee-4d36-8fa1-5c76314cc1bc'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('fcd2bb99-12ee-4d36-8fa1-5c76314cc1bc', '26248F34-2837-EF11-86D4-6045BDEE16E6', 'C7A44D04-4B50-4106-BF58-9E0C430906F4', 'DashboardCategoryID', 'One To Many', 1, 1, 'MJ: Dashboard Category Permissions', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'ecb6e8eb-a454-40b6-870b-a12949ea6f46'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('ecb6e8eb-a454-40b6-870b-a12949ea6f46', '26248F34-2837-EF11-86D4-6045BDEE16E6', 'DC90010A-21CF-4F61-AF37-F528E4B31AA2', 'DashboardCategoryID', 'One To Many', 1, 1, 'MJ: Dashboard Category Links', 3);
   END
                              

/* Index for Foreign Keys for DashboardCategoryLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DashboardID in table DashboardCategoryLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardCategoryLink_DashboardID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardCategoryLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardCategoryLink_DashboardID ON [${flyway:defaultSchema}].[DashboardCategoryLink] ([DashboardID]);

-- Index for foreign key UserID in table DashboardCategoryLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardCategoryLink_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardCategoryLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardCategoryLink_UserID ON [${flyway:defaultSchema}].[DashboardCategoryLink] ([UserID]);

-- Index for foreign key DashboardCategoryID in table DashboardCategoryLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardCategoryLink_DashboardCategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardCategoryLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardCategoryLink_DashboardCategoryID ON [${flyway:defaultSchema}].[DashboardCategoryLink] ([DashboardCategoryID]);

/* SQL text to update entity field related entity name field map for entity field ID 20995548-64DB-47D0-B532-DA12608F11C0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='20995548-64DB-47D0-B532-DA12608F11C0',
         @RelatedEntityNameFieldMap='Dashboard'

/* Index for Foreign Keys for DashboardCategoryPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DashboardCategoryID in table DashboardCategoryPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardCategoryPermission_DashboardCategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardCategoryPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardCategoryPermission_DashboardCategoryID ON [${flyway:defaultSchema}].[DashboardCategoryPermission] ([DashboardCategoryID]);

-- Index for foreign key UserID in table DashboardCategoryPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardCategoryPermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardCategoryPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardCategoryPermission_UserID ON [${flyway:defaultSchema}].[DashboardCategoryPermission] ([UserID]);

-- Index for foreign key SharedByUserID in table DashboardCategoryPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardCategoryPermission_SharedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardCategoryPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardCategoryPermission_SharedByUserID ON [${flyway:defaultSchema}].[DashboardCategoryPermission] ([SharedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 1EDB9153-3135-4923-9C24-18C1B4B73E59 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1EDB9153-3135-4923-9C24-18C1B4B73E59',
         @RelatedEntityNameFieldMap='DashboardCategory'

/* SQL text to update entity field related entity name field map for entity field ID E8C09759-9F04-4045-B648-BF6281745137 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E8C09759-9F04-4045-B648-BF6281745137',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 7C5D7CF8-CC50-411D-BB85-5A6255D75E1E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7C5D7CF8-CC50-411D-BB85-5A6255D75E1E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 5AF7BA52-E69E-4FA9-B620-7E9D380480E2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5AF7BA52-E69E-4FA9-B620-7E9D380480E2',
         @RelatedEntityNameFieldMap='DashboardCategory'

/* SQL text to update entity field related entity name field map for entity field ID 341251FF-8C37-4AFC-B203-120E710ADB94 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='341251FF-8C37-4AFC-B203-120E710ADB94',
         @RelatedEntityNameFieldMap='SharedByUser'

/* Base View SQL for MJ: Dashboard Category Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Links
-- Item: vwDashboardCategoryLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dashboard Category Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DashboardCategoryLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDashboardCategoryLinks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDashboardCategoryLinks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboardCategoryLinks]
AS
SELECT
    d.*,
    Dashboard_DashboardID.[Name] AS [Dashboard],
    User_UserID.[Name] AS [User],
    DashboardCategory_DashboardCategoryID.[Name] AS [DashboardCategory]
FROM
    [${flyway:defaultSchema}].[DashboardCategoryLink] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Dashboard] AS Dashboard_DashboardID
  ON
    [d].[DashboardID] = Dashboard_DashboardID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS DashboardCategory_DashboardCategoryID
  ON
    [d].[DashboardCategoryID] = DashboardCategory_DashboardCategoryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardCategoryLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Dashboard Category Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Links
-- Item: Permissions for vwDashboardCategoryLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardCategoryLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Dashboard Category Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Links
-- Item: spCreateDashboardCategoryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DashboardCategoryLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDashboardCategoryLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardCategoryLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardCategoryLink]
    @ID uniqueidentifier = NULL,
    @DashboardID uniqueidentifier,
    @UserID uniqueidentifier,
    @DashboardCategoryID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DashboardCategoryLink]
            (
                [ID],
                [DashboardID],
                [UserID],
                [DashboardCategoryID],
                [DisplayName],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DashboardID,
                @UserID,
                @DashboardCategoryID,
                @DisplayName,
                ISNULL(@Sequence, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DashboardCategoryLink]
            (
                [DashboardID],
                [UserID],
                [DashboardCategoryID],
                [DisplayName],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DashboardID,
                @UserID,
                @DashboardCategoryID,
                @DisplayName,
                ISNULL(@Sequence, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboardCategoryLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardCategoryLink] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Dashboard Category Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardCategoryLink] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Dashboard Category Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Links
-- Item: spUpdateDashboardCategoryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DashboardCategoryLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDashboardCategoryLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardCategoryLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardCategoryLink]
    @ID uniqueidentifier,
    @DashboardID uniqueidentifier,
    @UserID uniqueidentifier,
    @DashboardCategoryID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardCategoryLink]
    SET
        [DashboardID] = @DashboardID,
        [UserID] = @UserID,
        [DashboardCategoryID] = @DashboardCategoryID,
        [DisplayName] = @DisplayName,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDashboardCategoryLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboardCategoryLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardCategoryLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DashboardCategoryLink table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDashboardCategoryLink]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDashboardCategoryLink];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboardCategoryLink
ON [${flyway:defaultSchema}].[DashboardCategoryLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardCategoryLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DashboardCategoryLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Dashboard Category Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardCategoryLink] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Dashboard Category Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Links
-- Item: spDeleteDashboardCategoryLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardCategoryLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDashboardCategoryLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardCategoryLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardCategoryLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DashboardCategoryLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardCategoryLink] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Dashboard Category Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardCategoryLink] TO [cdp_Integration]



/* Base View SQL for MJ: Dashboard Category Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Permissions
-- Item: vwDashboardCategoryPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dashboard Category Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DashboardCategoryPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDashboardCategoryPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDashboardCategoryPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboardCategoryPermissions]
AS
SELECT
    d.*,
    DashboardCategory_DashboardCategoryID.[Name] AS [DashboardCategory],
    User_UserID.[Name] AS [User],
    User_SharedByUserID.[Name] AS [SharedByUser]
FROM
    [${flyway:defaultSchema}].[DashboardCategoryPermission] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS DashboardCategory_DashboardCategoryID
  ON
    [d].[DashboardCategoryID] = DashboardCategory_DashboardCategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_SharedByUserID
  ON
    [d].[SharedByUserID] = User_SharedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardCategoryPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Dashboard Category Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Permissions
-- Item: Permissions for vwDashboardCategoryPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardCategoryPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Dashboard Category Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Permissions
-- Item: spCreateDashboardCategoryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DashboardCategoryPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDashboardCategoryPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardCategoryPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardCategoryPermission]
    @ID uniqueidentifier = NULL,
    @DashboardCategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @CanRead bit = NULL,
    @CanEdit bit = NULL,
    @CanAddRemove bit = NULL,
    @CanShare bit = NULL,
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DashboardCategoryPermission]
            (
                [ID],
                [DashboardCategoryID],
                [UserID],
                [CanRead],
                [CanEdit],
                [CanAddRemove],
                [CanShare],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DashboardCategoryID,
                @UserID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanAddRemove, 0),
                ISNULL(@CanShare, 0),
                @SharedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DashboardCategoryPermission]
            (
                [DashboardCategoryID],
                [UserID],
                [CanRead],
                [CanEdit],
                [CanAddRemove],
                [CanShare],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DashboardCategoryID,
                @UserID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanAddRemove, 0),
                ISNULL(@CanShare, 0),
                @SharedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboardCategoryPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardCategoryPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Dashboard Category Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardCategoryPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Dashboard Category Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Permissions
-- Item: spUpdateDashboardCategoryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DashboardCategoryPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDashboardCategoryPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardCategoryPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardCategoryPermission]
    @ID uniqueidentifier,
    @DashboardCategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @CanRead bit,
    @CanEdit bit,
    @CanAddRemove bit,
    @CanShare bit,
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardCategoryPermission]
    SET
        [DashboardCategoryID] = @DashboardCategoryID,
        [UserID] = @UserID,
        [CanRead] = @CanRead,
        [CanEdit] = @CanEdit,
        [CanAddRemove] = @CanAddRemove,
        [CanShare] = @CanShare,
        [SharedByUserID] = @SharedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDashboardCategoryPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboardCategoryPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardCategoryPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DashboardCategoryPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDashboardCategoryPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDashboardCategoryPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboardCategoryPermission
ON [${flyway:defaultSchema}].[DashboardCategoryPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardCategoryPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DashboardCategoryPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Dashboard Category Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardCategoryPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Dashboard Category Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Category Permissions
-- Item: spDeleteDashboardCategoryPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardCategoryPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDashboardCategoryPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardCategoryPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardCategoryPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DashboardCategoryPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardCategoryPermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Dashboard Category Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardCategoryPermission] TO [cdp_Integration]



/* Index for Foreign Keys for DashboardPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DashboardID in table DashboardPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardPermission_DashboardID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardPermission_DashboardID ON [${flyway:defaultSchema}].[DashboardPermission] ([DashboardID]);

-- Index for foreign key UserID in table DashboardPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardPermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardPermission_UserID ON [${flyway:defaultSchema}].[DashboardPermission] ([UserID]);

-- Index for foreign key SharedByUserID in table DashboardPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DashboardPermission_SharedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DashboardPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DashboardPermission_SharedByUserID ON [${flyway:defaultSchema}].[DashboardPermission] ([SharedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID FE2FCE0D-A2AE-450D-9358-4F82D9C7195E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FE2FCE0D-A2AE-450D-9358-4F82D9C7195E',
         @RelatedEntityNameFieldMap='Dashboard'

/* SQL text to update entity field related entity name field map for entity field ID 7B198679-D820-4A33-994E-E08BB0DF66FA */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7B198679-D820-4A33-994E-E08BB0DF66FA',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID B50A3B4E-D70F-4E48-AEAB-426BDCD10DB1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B50A3B4E-D70F-4E48-AEAB-426BDCD10DB1',
         @RelatedEntityNameFieldMap='SharedByUser'

/* Base View SQL for MJ: Dashboard Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Permissions
-- Item: vwDashboardPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dashboard Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DashboardPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDashboardPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDashboardPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboardPermissions]
AS
SELECT
    d.*,
    Dashboard_DashboardID.[Name] AS [Dashboard],
    User_UserID.[Name] AS [User],
    User_SharedByUserID.[Name] AS [SharedByUser]
FROM
    [${flyway:defaultSchema}].[DashboardPermission] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Dashboard] AS Dashboard_DashboardID
  ON
    [d].[DashboardID] = Dashboard_DashboardID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_SharedByUserID
  ON
    [d].[SharedByUserID] = User_SharedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Dashboard Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Permissions
-- Item: Permissions for vwDashboardPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Dashboard Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Permissions
-- Item: spCreateDashboardPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DashboardPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDashboardPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardPermission]
    @ID uniqueidentifier = NULL,
    @DashboardID uniqueidentifier,
    @UserID uniqueidentifier,
    @CanRead bit = NULL,
    @CanEdit bit = NULL,
    @CanDelete bit = NULL,
    @CanShare bit = NULL,
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DashboardPermission]
            (
                [ID],
                [DashboardID],
                [UserID],
                [CanRead],
                [CanEdit],
                [CanDelete],
                [CanShare],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DashboardID,
                @UserID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanDelete, 0),
                ISNULL(@CanShare, 0),
                @SharedByUserID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DashboardPermission]
            (
                [DashboardID],
                [UserID],
                [CanRead],
                [CanEdit],
                [CanDelete],
                [CanShare],
                [SharedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DashboardID,
                @UserID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanDelete, 0),
                ISNULL(@CanShare, 0),
                @SharedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboardPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Dashboard Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Dashboard Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Permissions
-- Item: spUpdateDashboardPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DashboardPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDashboardPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardPermission]
    @ID uniqueidentifier,
    @DashboardID uniqueidentifier,
    @UserID uniqueidentifier,
    @CanRead bit,
    @CanEdit bit,
    @CanDelete bit,
    @CanShare bit,
    @SharedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardPermission]
    SET
        [DashboardID] = @DashboardID,
        [UserID] = @UserID,
        [CanRead] = @CanRead,
        [CanEdit] = @CanEdit,
        [CanDelete] = @CanDelete,
        [CanShare] = @CanShare,
        [SharedByUserID] = @SharedByUserID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDashboardPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboardPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DashboardPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDashboardPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDashboardPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboardPermission
ON [${flyway:defaultSchema}].[DashboardPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DashboardPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Dashboard Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Dashboard Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Permissions
-- Item: spDeleteDashboardPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDashboardPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DashboardPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardPermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Dashboard Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardPermission] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b78436b3-e552-4f26-9811-47927da4922a'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'DashboardCategory')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b78436b3-e552-4f26-9811-47927da4922a',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100021,
            'DashboardCategory',
            'Dashboard Category',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6d8fb806-229b-4661-88c3-2d49c3c9f099'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6d8fb806-229b-4661-88c3-2d49c3c9f099',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100022,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'af2b4c07-0f39-47e0-a959-06fac32a181d'  OR 
               (EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4' AND Name = 'SharedByUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'af2b4c07-0f39-47e0-a959-06fac32a181d',
            'C7A44D04-4B50-4106-BF58-9E0C430906F4', -- Entity: MJ: Dashboard Category Permissions
            100023,
            'SharedByUser',
            'Shared By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ab930121-6ce0-4a5c-9d3a-158fea67d8b4'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'Dashboard')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ab930121-6ce0-4a5c-9d3a-158fea67d8b4',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100021,
            'Dashboard',
            'Dashboard',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7894f8be-e107-46ef-92ac-1b7423c4498d'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7894f8be-e107-46ef-92ac-1b7423c4498d',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100022,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a723e16a-343d-4674-bb3a-b3af8f89f8b1'  OR 
               (EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75' AND Name = 'SharedByUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a723e16a-343d-4674-bb3a-b3af8f89f8b1',
            '771ED81A-B504-4027-B223-CA3ABBAA3C75', -- Entity: MJ: Dashboard Permissions
            100023,
            'SharedByUser',
            'Shared By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9df7bcad-d91e-49a8-9081-f82fe99697cc'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'Dashboard')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9df7bcad-d91e-49a8-9081-f82fe99697cc',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100017,
            'Dashboard',
            'Dashboard',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5deb88cf-6f5d-4b4e-9391-2417d7ab6573'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'User')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5deb88cf-6f5d-4b4e-9391-2417d7ab6573',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100018,
            'User',
            'User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f2b25a46-cf8c-4861-a206-33a0330d786b'  OR 
               (EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2' AND Name = 'DashboardCategory')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f2b25a46-cf8c-4861-a206-33a0330d786b',
            'DC90010A-21CF-4F61-AF37-F528E4B31AA2', -- Entity: MJ: Dashboard Category Links
            100019,
            'DashboardCategory',
            'Dashboard Category',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '39DCC23E-670E-4A3B-849F-9F808474517F'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '39DCC23E-670E-4A3B-849F-9F808474517F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9DF7BCAD-D91E-49A8-9081-F82FE99697CC'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F2B25A46-CF8C-4861-A206-33A0330D786B'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '39DCC23E-670E-4A3B-849F-9F808474517F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9DF7BCAD-D91E-49A8-9081-F82FE99697CC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F2B25A46-CF8C-4861-A206-33A0330D786B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '7894F8BE-E107-46EF-92AC-1B7423C4498D'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3508D5E1-DEFB-41CE-8EB1-18651FE5D512'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '618B7B56-5BEE-4BFA-A3AA-CBF8435A307B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3BA6728C-8CA3-4F22-8E9F-E1DA448C2579'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5AB597EB-10AB-4264-B5F8-C373929373D0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AB930121-6CE0-4A5C-9D3A-158FEA67D8B4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7894F8BE-E107-46EF-92AC-1B7423C4498D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'A723E16A-343D-4674-BB3A-B3AF8F89F8B1'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AB930121-6CE0-4A5C-9D3A-158FEA67D8B4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '7894F8BE-E107-46EF-92AC-1B7423C4498D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A723E16A-343D-4674-BB3A-B3AF8F89F8B1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B78436B3-E552-4F26-9811-47927DA4922A'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DD81F3CC-00BD-4169-9866-82D327DB957A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D8963007-4BCE-4D9E-973F-AD8F5996F1DB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E064156-5B7D-44F5-A93D-5758951BD692'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B6AEB28F-04E2-49EA-9178-F3F17B9CEE8F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B78436B3-E552-4F26-9811-47927DA4922A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6D8FB806-229B-4661-88C3-2D49C3C9F099'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AF2B4C07-0F39-47E0-A959-06FAC32A181D'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B78436B3-E552-4F26-9811-47927DA4922A'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6D8FB806-229B-4661-88C3-2D49C3C9F099'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AF2B4C07-0F39-47E0-A959-06FAC32A181D'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Read',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3508D5E1-DEFB-41CE-8EB1-18651FE5D512'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Edit',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '618B7B56-5BEE-4BFA-A3AA-CBF8435A307B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Delete',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3BA6728C-8CA3-4F22-8E9F-E1DA448C2579'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Share',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5AB597EB-10AB-4264-B5F8-C373929373D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Assignment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dashboard ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE2FCE0D-A2AE-450D-9358-4F82D9C7195E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Assignment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B198679-D820-4A33-994E-E08BB0DF66FA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Assignment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Shared By User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B50A3B4E-D70F-4E48-AEAB-426BDCD10DB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Assignment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dashboard',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AB930121-6CE0-4A5C-9D3A-158FEA67D8B4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Assignment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7894F8BE-E107-46EF-92AC-1B7423C4498D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Assignment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Shared By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A723E16A-343D-4674-BB3A-B3AF8F89F8B1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '794CD25F-AC1B-460E-8F12-58ECEF1540A1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3CD4F1D7-CF8E-47DF-9969-9E860122FEAD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7BCEAEB0-1607-41C0-AD09-FC27E0287859'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-tachometer-alt */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-tachometer-alt',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '771ED81A-B504-4027-B223-CA3ABBAA3C75'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4703f45d-fc9a-476a-9845-e3e8d189371a', '771ED81A-B504-4027-B223-CA3ABBAA3C75', 'FieldCategoryInfo', '{"Permission Settings":{"icon":"fa fa-lock","description":"Granular access rights for a dashboard, specifying read, edit, delete, and share capabilities."},"Assignment Details":{"icon":"fa fa-link","description":"Links the permission entry to a specific dashboard and user, and records who granted the permission."},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking creation and modification timestamps."}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4aff06a9-e498-4126-9658-aded5d1185b0', '771ED81A-B504-4027-B223-CA3ABBAA3C75', 'FieldCategoryIcons', '{"Permission Settings":"fa fa-lock","Assignment Details":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '771ED81A-B504-4027-B223-CA3ABBAA3C75'
         

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD94730A-859E-4848-9C8E-AAAB0429741E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3C69DC3A-8DDA-40DC-9348-4A15B826A3BB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '348D40A3-82DA-4BBA-8F2C-F65825A54676'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dashboard Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dashboard',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20995548-64DB-47D0-B532-DA12608F11C0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dashboard Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E8C09759-9F04-4045-B648-BF6281745137'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Dashboard Association',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dashboard Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5AF7BA52-E69E-4FA9-B620-7E9D380480E2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '39DCC23E-670E-4A3B-849F-9F808474517F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A3545394-6DA5-4D9B-BE58-E59E7DCDFEB9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dashboard Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9DF7BCAD-D91E-49A8-9081-F82FE99697CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5DEB88CF-6F5D-4B4E-9391-2417D7AB6573'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2B25A46-CF8C-4861-A206-33A0330D786B'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-folder-open */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-folder-open',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4f5e8360-ac9b-4a16-ad47-c63a61f2da94', 'DC90010A-21CF-4F61-AF37-F528E4B31AA2', 'FieldCategoryInfo', '{"Dashboard Association":{"icon":"fa fa-link","description":"Core relationships linking a dashboard to a user and optional category"},"Display Settings":{"icon":"fa fa-sliders-h","description":"User‑controlled naming, ordering, and display information for the linked dashboard"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking creation and modification of the record"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('82020d68-f98f-4589-bcc9-2639b4d60d6b', 'DC90010A-21CF-4F61-AF37-F528E4B31AA2', 'FieldCategoryIcons', '{"Dashboard Association":"fa fa-link","Display Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'DC90010A-21CF-4F61-AF37-F528E4B31AA2'
         

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8619A6EA-B91A-444D-872C-D57C6F3A4337'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dashboard Category ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1EDB9153-3135-4923-9C24-18C1B4B73E59'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Category Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Dashboard Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B78436B3-E552-4F26-9811-47927DA4922A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C5D7CF8-CC50-411D-BB85-5A6255D75E1E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D8FB806-229B-4661-88C3-2D49C3C9F099'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Shared By User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '341251FF-8C37-4AFC-B203-120E710ADB94'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Shared By User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF2B4C07-0F39-47E0-A959-06FAC32A181D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Read',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DD81F3CC-00BD-4169-9866-82D327DB957A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Edit',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D8963007-4BCE-4D9E-973F-AD8F5996F1DB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Add/Remove',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E064156-5B7D-44F5-A93D-5758951BD692'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Permission Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Can Share',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B6AEB28F-04E2-49EA-9178-F3F17B9CEE8F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A4AC9B9C-DFAA-446C-9771-C1E712EE1C5A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13F4E2D5-7E98-4B79-A811-D8459265FE64'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-folder-open */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-folder-open',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4ea2fe31-aeda-4c49-b57b-8740b40a9120', 'C7A44D04-4B50-4106-BF58-9E0C430906F4', 'FieldCategoryInfo', '{"Category Identification":{"icon":"fa fa-folder","description":"Identifiers for the permission entry and its dashboard category"},"User Access":{"icon":"fa fa-user","description":"Details about the user receiving permission and who shared it"},"Permission Settings":{"icon":"fa fa-lock","description":"Specific rights granted to the user for the dashboard category"},"System Metadata":{"icon":"fa fa-cog","description":"Audit timestamps and system‑managed fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('a3eb6bd2-a51d-4c3a-837b-fbcaf200a625', 'C7A44D04-4B50-4106-BF58-9E0C430906F4', 'FieldCategoryIcons', '{"Category Identification":"fa fa-folder","User Access":"fa fa-user","Permission Settings":"fa fa-lock","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: medium) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = 'C7A44D04-4B50-4106-BF58-9E0C430906F4'
         

