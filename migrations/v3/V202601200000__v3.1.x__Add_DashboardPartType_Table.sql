-- =============================================
-- Migration: Add DashboardPartType Table
-- Version: v3.1.x
-- Description: Creates the DashboardPartType table for metadata-driven dashboard panel types.
--              This table stores available panel types (View, Query, Artifact, WebURL, Custom)
--              that can be used in configurable dashboards. Each panel type has a driver class
--              for rendering and an optional config dialog class for configuration UI.
-- =============================================

-- =============================================
-- DDL: Create DashboardPartType Table
-- =============================================
CREATE TABLE ${flyway:defaultSchema}.DashboardPartType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Icon NVARCHAR(100) NULL,
    DriverClass NVARCHAR(255) NOT NULL,
    ConfigDialogClass NVARCHAR(255) NULL,
    DefaultConfig NVARCHAR(MAX) NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_DashboardPartType PRIMARY KEY (ID),
    CONSTRAINT UQ_DashboardPartType_Name UNIQUE (Name)
);
GO

-- =============================================
-- Extended Properties: Table Description
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores available panel types for metadata-driven dashboards. Each panel type defines a driver class for rendering content and an optional config dialog for setup UI.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType';
 

-- =============================================
-- Extended Properties: Column Descriptions
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'ID';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name for the panel type (e.g., View, Query, Artifact, WebURL, Custom)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'Name';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of what this panel type displays and its capabilities',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'Description';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Font Awesome icon class for the panel type (e.g., fa-solid fa-table)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'Icon';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The @RegisterClass name for the panel renderer component that extends DashboardBasePanelRenderer',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The @RegisterClass name for the configuration dialog component that extends DashboardBasePanelConfigDialog',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'ConfigDialogClass';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing default configuration values for new panels of this type',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'DefaultConfig';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order in panel type selection UI (lower numbers appear first)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'SortOrder';
 

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this panel type is currently available for use',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'DashboardPartType',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO
 






























































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Dashboard Part Types */

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
         '4a6907ab-b05c-4140-a612-2a580feb94d0',
         'MJ: Dashboard Part Types',
         'Dashboard Part Types',
         NULL,
         NULL,
         'DashboardPartType',
         'vwDashboardPartTypes',
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
   

/* SQL generated to add new entity MJ: Dashboard Part Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4a6907ab-b05c-4140-a612-2a580feb94d0', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Dashboard Part Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4a6907ab-b05c-4140-a612-2a580feb94d0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Part Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4a6907ab-b05c-4140-a612-2a580feb94d0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Dashboard Part Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4a6907ab-b05c-4140-a612-2a580feb94d0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DashboardPartType */
ALTER TABLE [${flyway:defaultSchema}].[DashboardPartType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DashboardPartType */
ALTER TABLE [${flyway:defaultSchema}].[DashboardPartType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5485a153-c036-4ea3-863e-1b8428e32ca7'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'ID')
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
            '5485a153-c036-4ea3-863e-1b8428e32ca7',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100001,
            'ID',
            'ID',
            'Primary key',
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
         WHERE ID = '4f626971-9b56-4729-be20-30702aee6387'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'Name')
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
            '4f626971-9b56-4729-be20-30702aee6387',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100002,
            'Name',
            'Name',
            'Unique name for the panel type (e.g., View, Query, Artifact, WebURL, Custom)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c6be1c05-af5c-4ae6-9729-a7160f357919'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'Description')
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
            'c6be1c05-af5c-4ae6-9729-a7160f357919',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100003,
            'Description',
            'Description',
            'Detailed description of what this panel type displays and its capabilities',
            'nvarchar',
            -1,
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
         WHERE ID = 'cbd2a2f9-cd8a-4cc1-bb6f-512393b3e271'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'Icon')
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
            'cbd2a2f9-cd8a-4cc1-bb6f-512393b3e271',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100004,
            'Icon',
            'Icon',
            'Font Awesome icon class for the panel type (e.g., fa-solid fa-table)',
            'nvarchar',
            200,
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
         WHERE ID = 'fbb14712-177d-44f9-8ada-d286380b3cd9'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'DriverClass')
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
            'fbb14712-177d-44f9-8ada-d286380b3cd9',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100005,
            'DriverClass',
            'Driver Class',
            'The @RegisterClass name for the panel renderer component that extends DashboardBasePanelRenderer',
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = 'c2ad0575-61bb-4071-af8f-bbfa63b0a197'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'ConfigDialogClass')
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
            'c2ad0575-61bb-4071-af8f-bbfa63b0a197',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100006,
            'ConfigDialogClass',
            'Config Dialog Class',
            'The @RegisterClass name for the configuration dialog component that extends DashboardBasePanelConfigDialog',
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
         WHERE ID = '831ef687-fed1-4537-80c4-cbc8add5f420'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'DefaultConfig')
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
            '831ef687-fed1-4537-80c4-cbc8add5f420',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100007,
            'DefaultConfig',
            'Default Config',
            'JSON object containing default configuration values for new panels of this type',
            'nvarchar',
            -1,
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
         WHERE ID = '8f495941-aa88-4cc5-b3c0-c0c612fea631'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'SortOrder')
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
            '8f495941-aa88-4cc5-b3c0-c0c612fea631',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100008,
            'SortOrder',
            'Sort Order',
            'Display order in panel type selection UI (lower numbers appear first)',
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
         WHERE ID = 'eb20e458-9e36-410e-a7d7-05cf79c644cf'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = 'IsActive')
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
            'eb20e458-9e36-410e-a7d7-05cf79c644cf',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100009,
            'IsActive',
            'Is Active',
            'Whether this panel type is currently available for use',
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
         WHERE ID = '7000c344-fd49-4d71-9748-6113fd884e75'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = '__mj_CreatedAt')
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
            '7000c344-fd49-4d71-9748-6113fd884e75',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100010,
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
         WHERE ID = 'f8a5373e-759c-4f1c-ad66-be060b0b42f5'  OR 
               (EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0' AND Name = '__mj_UpdatedAt')
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
            'f8a5373e-759c-4f1c-ad66-be060b0b42f5',
            '4A6907AB-B05C-4140-A612-2A580FEB94D0', -- Entity: MJ: Dashboard Part Types
            100011,
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

/* SQL text to update entity field related entity name field map for entity field ID 898B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='898B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID A18B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A18B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 598B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='598B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 7D8A443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7D8A443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID BD8A443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BD8A443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 658B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='658B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 698B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='698B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6D8B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6D8B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID A18A443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A18A443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 118B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='118B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID A58A443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A58A443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID A98A443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A98A443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for DashboardPartType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Part Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Dashboard Part Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Part Types
-- Item: vwDashboardPartTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Dashboard Part Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DashboardPartType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDashboardPartTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDashboardPartTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboardPartTypes]
AS
SELECT
    d.*
FROM
    [${flyway:defaultSchema}].[DashboardPartType] AS d
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardPartTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Dashboard Part Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Part Types
-- Item: Permissions for vwDashboardPartTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboardPartTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Dashboard Part Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Part Types
-- Item: spCreateDashboardPartType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DashboardPartType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDashboardPartType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardPartType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboardPartType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(100),
    @DriverClass nvarchar(255),
    @ConfigDialogClass nvarchar(255),
    @DefaultConfig nvarchar(MAX),
    @SortOrder int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DashboardPartType]
            (
                [ID],
                [Name],
                [Description],
                [Icon],
                [DriverClass],
                [ConfigDialogClass],
                [DefaultConfig],
                [SortOrder],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @Icon,
                @DriverClass,
                @ConfigDialogClass,
                @DefaultConfig,
                ISNULL(@SortOrder, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DashboardPartType]
            (
                [Name],
                [Description],
                [Icon],
                [DriverClass],
                [ConfigDialogClass],
                [DefaultConfig],
                [SortOrder],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @Icon,
                @DriverClass,
                @ConfigDialogClass,
                @DefaultConfig,
                ISNULL(@SortOrder, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboardPartTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardPartType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Dashboard Part Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboardPartType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Dashboard Part Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Part Types
-- Item: spUpdateDashboardPartType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DashboardPartType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDashboardPartType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardPartType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboardPartType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @Icon nvarchar(100),
    @DriverClass nvarchar(255),
    @ConfigDialogClass nvarchar(255),
    @DefaultConfig nvarchar(MAX),
    @SortOrder int,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardPartType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [Icon] = @Icon,
        [DriverClass] = @DriverClass,
        [ConfigDialogClass] = @ConfigDialogClass,
        [DefaultConfig] = @DefaultConfig,
        [SortOrder] = @SortOrder,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDashboardPartTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboardPartTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardPartType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DashboardPartType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDashboardPartType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDashboardPartType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboardPartType
ON [${flyway:defaultSchema}].[DashboardPartType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DashboardPartType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DashboardPartType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Dashboard Part Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboardPartType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Dashboard Part Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Dashboard Part Types
-- Item: spDeleteDashboardPartType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DashboardPartType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDashboardPartType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardPartType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboardPartType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DashboardPartType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardPartType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Dashboard Part Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboardPartType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 198C443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='198C443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 1E8C443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1E8C443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID ED8B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ED8B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID F58B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F58B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID F78B443E-F36B-1410-8DD7-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F78B443E-F36B-1410-8DD7-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4F626971-9B56-4729-BE20-30702AEE6387'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4F626971-9B56-4729-BE20-30702AEE6387'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C6BE1C05-AF5C-4AE6-9729-A7160F357919'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CBD2A2F9-CD8A-4CC1-BB6F-512393B3E271'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EB20E458-9E36-410E-A7D7-05CF79C644CF'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4F626971-9B56-4729-BE20-30702AEE6387'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C6BE1C05-AF5C-4AE6-9729-A7160F357919'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5485A153-C036-4EA3-863E-1B8428E32CA7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7000C344-FD49-4D71-9748-6113FD884E75'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8A5373E-759C-4F1C-AD66-BE060B0B42F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Panel Type Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4F626971-9B56-4729-BE20-30702AEE6387'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Panel Type Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C6BE1C05-AF5C-4AE6-9729-A7160F357919'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Panel Type Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CBD2A2F9-CD8A-4CC1-BB6F-512393B3E271'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Panel Type Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sort Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F495941-AA88-4CC5-B3C0-C0C612FEA631'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Panel Type Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EB20E458-9E36-410E-A7D7-05CF79C644CF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renderer Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FBB14712-177D-44F9-8ADA-D286380B3CD9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renderer Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration Dialog Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C2AD0575-61BB-4071-AF8F-BBFA63B0A197'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Renderer Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '831EF687-FED1-4537-80C4-CBC8ADD5F420'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-th-large */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-th-large',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '4A6907AB-B05C-4140-A612-2A580FEB94D0'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('04ac9ec2-1b81-4794-87ef-fa02914d9995', '4A6907AB-B05C-4140-A612-2A580FEB94D0', 'FieldCategoryInfo', '{"Panel Type Information":{"icon":"fa fa-info-circle","description":"Core descriptive fields and activation settings for each dashboard panel type"},"Renderer Settings":{"icon":"fa fa-cogs","description":"Technical configuration for how the panel is rendered and its setup dialog"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields and primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('98620daa-b950-4e1c-9707-8b9ad1495a49', '4A6907AB-B05C-4140-A612-2A580FEB94D0', 'FieldCategoryIcons', '{"Panel Type Information":"fa fa-info-circle","Renderer Settings":"fa fa-cogs","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '4A6907AB-B05C-4140-A612-2A580FEB94D0'
         









































-- ADDITIONAL CODE GEN RUN FOR VIRTUAL FIELDS RESTORATION
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '34df8e45-2c56-4e9d-ac4c-2fd4c4eee196'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TestRun')
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
            '34df8e45-2c56-4e9d-ac4c-2fd4c4eee196',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100105,
            'TestRun',
            'Test Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'd9422a2e-4c9b-4daa-ad7c-484c063c240b'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'SourceConversationDetail')
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
            'd9422a2e-4c9b-4daa-ad7c-484c063c240b',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100045,
            'SourceConversationDetail',
            'Source Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = '65862a21-c4a3-4848-aab9-bdfd79ad1117'  OR 
               (EntityID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND Name = 'SourceAIAgentRun')
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
            '65862a21-c4a3-4848-aab9-bdfd79ad1117',
            'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- Entity: AI Agent Notes
            100046,
            'SourceAIAgentRun',
            'Source AI Agent Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'fa4d7cab-1859-4245-8bdc-77d792135d7f'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptRun')
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
            'fa4d7cab-1859-4245-8bdc-77d792135d7f',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            100041,
            'PromptRun',
            'Prompt Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '699a731a-fdac-431e-a1ff-9c499c70dd2a'  OR 
               (EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            '699a731a-fdac-431e-a1ff-9c499c70dd2a',
            'D7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Company Integrations
            100016,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = 'aa1fe8b0-ac54-499a-9865-f1eaaeabc23a'  OR 
               (EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'aa1fe8b0-ac54-499a-9865-f1eaaeabc23a',
            'D8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Roles
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = 'a3f1e6cc-b79a-48b9-92b8-22509d56acde'  OR 
               (EntityID = 'D9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'a3f1e6cc-b79a-48b9-92b8-22509d56acde',
            'D9238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Skills
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = '72a81617-a8dc-4388-92e4-6434624034eb'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRun')
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
            '72a81617-a8dc-4388-92e4-6434624034eb',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100023,
            'CompanyIntegrationRun',
            'Company Integration Run',
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
         WHERE ID = '1e65cdad-0f0f-44e4-8118-fc175137d082'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRunDetail')
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
            '1e65cdad-0f0f-44e4-8118-fc175137d082',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100024,
            'CompanyIntegrationRunDetail',
            'Company Integration Run Detail',
            NULL,
            'nvarchar',
            900,
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
         WHERE ID = '9dc032e3-a3cd-42fb-8172-b32e06bd8ada'  OR 
               (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReplayRun')
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
            '9dc032e3-a3cd-42fb-8172-b32e06bd8ada',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Changes
            100040,
            'ReplayRun',
            'Replay Run',
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
         WHERE ID = '9f3c64a4-8933-4b0e-8461-933c73861d62'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ConversationDetail')
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
            '9f3c64a4-8933-4b0e-8461-933c73861d62',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            100053,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = '78002dd7-34e0-4413-9248-fe16082adfb0'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TestRun')
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
            '78002dd7-34e0-4413-9248-fe16082adfb0',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100045,
            'TestRun',
            'Test Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'a9de4221-9a18-47e6-9fd7-5687a9807f7d'  OR 
               (EntityID = '18248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMergeLog')
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
            'a9de4221-9a18-47e6-9fd7-5687a9807f7d',
            '18248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Merge Deletion Logs
            100015,
            'RecordMergeLog',
            'Record Merge Log',
            NULL,
            'nvarchar',
            900,
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
         WHERE ID = '1eef7fad-cbc0-4ab1-9b84-9c25653d3cf0'  OR 
               (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DuplicateRun')
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
            '1eef7fad-cbc0-4ab1-9b84-9c25653d3cf0',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Duplicate Run Details
            100021,
            'DuplicateRun',
            'Duplicate Run',
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
         WHERE ID = '4b7507a5-3676-4c03-b360-6e974e29fe71'  OR 
               (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '4b7507a5-3676-4c03-b360-6e974e29fe71',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Invocations
            100014,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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
         WHERE ID = '6a2fff7e-7663-4e96-9c2c-058346ce4d29'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '6a2fff7e-7663-4e96-9c2c-058346ce4d29',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100015,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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
         WHERE ID = '38f35bd4-0d91-4de5-9d07-3e59cabc18d9'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ActionFilter')
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
            '38f35bd4-0d91-4de5-9d07-3e59cabc18d9',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100016,
            'ActionFilter',
            'Action Filter',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = '0ab16136-4b12-4a41-a8dc-dffb3889da76'  OR 
               (EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TemplateContent')
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
            '0ab16136-4b12-4a41-a8dc-dffb3889da76',
            '4B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Template Params
            100037,
            'TemplateContent',
            'Template Content',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '0ba4c49a-c8e5-4e73-a22b-b53774f41612'  OR 
               (EntityID = '4D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecommendationRun')
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
            '0ba4c49a-c8e5-4e73-a22b-b53774f41612',
            '4D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendations
            100014,
            'RecommendationRun',
            'Recommendation Run',
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
         WHERE ID = '3cabd321-e952-46fd-bf1b-033f8d4e7669'  OR 
               (EntityID = '50248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Recommendation')
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
            '3cabd321-e952-46fd-bf1b-033f8d4e7669',
            '50248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendation Items
            100016,
            'Recommendation',
            'Recommendation',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = '89b1b118-7fb6-4313-96b0-4716468c924a'  OR 
               (EntityID = '52248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityCommunicationMessageType')
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
            '89b1b118-7fb6-4313-96b0-4716468c924a',
            '52248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Communication Fields
            100013,
            'EntityCommunicationMessageType',
            'Entity Communication Message Type',
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
         WHERE ID = 'c0ca1fc8-bf8a-4999-a922-456e77093d1e'  OR 
               (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            'c0ca1fc8-bf8a-4999-a922-456e77093d1e',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Params
            100018,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
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
         WHERE ID = '93ba3c24-ce83-4eca-a9ba-e7e22cedb05a'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'SourceConversationDetail')
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
            '93ba3c24-ce83-4eca-a9ba-e7e22cedb05a',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100046,
            'SourceConversationDetail',
            'Source Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = '05921920-eb03-45d1-ae0a-eb0a18d75d0b'  OR 
               (EntityID = '3A139346-CC48-479A-A53B-8892664F5DFD' AND Name = 'SourceAIAgentRun')
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
            '05921920-eb03-45d1-ae0a-eb0a18d75d0b',
            '3A139346-CC48-479A-A53B-8892664F5DFD', -- Entity: MJ: AI Agent Examples
            100047,
            'SourceAIAgentRun',
            'Source AI Agent Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '362af9e8-f534-4940-b845-6f889d40f465'  OR 
               (EntityID = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E' AND Name = 'ConversationDetail')
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
            '362af9e8-f534-4940-b845-6f889d40f465',
            'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', -- Entity: MJ: Conversation Detail Ratings
            100016,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = '3d0acab0-1957-4601-b592-fd4d70813eaf'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'AgentRun')
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
            '3d0acab0-1957-4601-b592-fd4d70813eaf',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100046,
            'AgentRun',
            'Agent Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'ef5803ce-1774-4b7a-9ffc-f139312b82a4'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'Parent')
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
            'ef5803ce-1774-4b7a-9ffc-f139312b82a4',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100047,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '07c77223-5d02-46eb-8c70-ad9359ffa57d'  OR 
               (EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'ConversationDetail')
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
            '07c77223-5d02-46eb-8c70-ad9359ffa57d',
            '16AB21D1-8047-41B9-8AEA-CD253DED9743', -- Entity: MJ: Conversation Detail Artifacts
            100014,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = 'ab518304-cc35-4d1c-9fb7-64a8b349b198'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ConversationDetail')
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
            'ab518304-cc35-4d1c-9fb7-64a8b349b198',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100046,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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

