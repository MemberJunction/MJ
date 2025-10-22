-- ============================================================================
-- Create ArtifactPermission Table
-- Part 1 of Conversation Artifact Migration
-- ============================================================================
-- This migration creates the new ArtifactPermission table to replace
-- ConversationArtifactPermission with a more granular permission model.
-- After this migration, run CodeGen to generate entity classes.
-- ============================================================================

SET NOCOUNT ON;

-- ============================================================================
-- Create ArtifactPermission Table
-- ============================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ArtifactPermission' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[ArtifactPermission] (
        [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        [ArtifactID] UNIQUEIDENTIFIER NOT NULL,
        [UserID] UNIQUEIDENTIFIER NOT NULL,
        [CanRead] BIT NOT NULL DEFAULT 1,
        [CanEdit] BIT NOT NULL DEFAULT 0,
        [CanDelete] BIT NOT NULL DEFAULT 0,
        [CanShare] BIT NOT NULL DEFAULT 0,
        [SharedByUserID] UNIQUEIDENTIFIER NULL,
        CONSTRAINT [PK_ArtifactPermission] PRIMARY KEY CLUSTERED ([ID]),
        CONSTRAINT [FK_ArtifactPermission_ArtifactID] FOREIGN KEY ([ArtifactID])
            REFERENCES [${flyway:defaultSchema}].[Artifact]([ID]),
        CONSTRAINT [FK_ArtifactPermission_UserID] FOREIGN KEY ([UserID])
            REFERENCES [${flyway:defaultSchema}].[User]([ID]),
        CONSTRAINT [FK_ArtifactPermission_SharedByUserID] FOREIGN KEY ([SharedByUserID])
            REFERENCES [${flyway:defaultSchema}].[User]([ID])
    );

    PRINT 'Created ArtifactPermission table';
END
ELSE
BEGIN
    PRINT 'ArtifactPermission table already exists';
END
 
-- ============================================================================
-- Add Extended Properties (Descriptions)
-- ============================================================================
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Manages user permissions for artifacts with granular access control (Read, Edit, Delete, Share)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ArtifactPermission';
  

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can view/read the artifact',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'CanRead';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can modify the artifact or create new versions',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'CanEdit';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can delete the artifact',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'CanDelete';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the user can share the artifact with other users',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'CanShare';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the User who shared this artifact (if shared)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ArtifactPermission',
    @level2type = N'COLUMN', @level2name = N'SharedByUserID';

PRINT '';
PRINT '=== ArtifactPermission Table Created Successfully ===';
PRINT 'Next steps:';
PRINT '1. Run CodeGen to generate entity classes and views';
PRINT '2. Run the data migration script (V202510211512)';












































































































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Artifact Permissions */

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
         '19846e1a-fd8e-405f-a0fa-42a7aa44758d',
         'MJ: Artifact Permissions',
         'Artifact Permissions',
         NULL,
         NULL,
         'ArtifactPermission',
         'vwArtifactPermissions',
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
   

/* SQL generated to add new entity MJ: Artifact Permissions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '19846e1a-fd8e-405f-a0fa-42a7aa44758d', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Artifact Permissions for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('19846e1a-fd8e-405f-a0fa-42a7aa44758d', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Artifact Permissions for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('19846e1a-fd8e-405f-a0fa-42a7aa44758d', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Artifact Permissions for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('19846e1a-fd8e-405f-a0fa-42a7aa44758d', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ArtifactPermission */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactPermission] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ArtifactPermission */
ALTER TABLE [${flyway:defaultSchema}].[ArtifactPermission] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd41ad94d-f60f-4471-80d2-6b06fd0ef54a'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'ID')
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
            'd41ad94d-f60f-4471-80d2-6b06fd0ef54a',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
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
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '10988c4b-74fb-4b11-acce-077187826a42'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'ArtifactID')
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
            '10988c4b-74fb-4b11-acce-077187826a42',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
            100002,
            'ArtifactID',
            'Artifact ID',
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
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD',
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
         WHERE ID = '1b5cfd0f-a9f6-4ac4-af1e-13438ad59285'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'UserID')
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
            '1b5cfd0f-a9f6-4ac4-af1e-13438ad59285',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
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
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4709af50-5239-475b-99ee-1b32eef11289'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'CanRead')
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
            '4709af50-5239-475b-99ee-1b32eef11289',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
            100004,
            'CanRead',
            'Can Read',
            'Whether the user can view/read the artifact',
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
         WHERE ID = '3eb23c85-234e-467b-a9f9-20cb49e08b0a'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'CanEdit')
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
            '3eb23c85-234e-467b-a9f9-20cb49e08b0a',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
            100005,
            'CanEdit',
            'Can Edit',
            'Whether the user can modify the artifact or create new versions',
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
         WHERE ID = '374d55a8-d767-4847-8e0e-928920876f7a'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'CanDelete')
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
            '374d55a8-d767-4847-8e0e-928920876f7a',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
            100006,
            'CanDelete',
            'Can Delete',
            'Whether the user can delete the artifact',
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
         WHERE ID = 'c16f101b-4657-4c66-98cd-c0b927ea16b3'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'CanShare')
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
            'c16f101b-4657-4c66-98cd-c0b927ea16b3',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
            100007,
            'CanShare',
            'Can Share',
            'Whether the user can share the artifact with other users',
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
         WHERE ID = '546eade0-7781-4e7c-a3bb-c8176dc8edaf'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'SharedByUserID')
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
            '546eade0-7781-4e7c-a3bb-c8176dc8edaf',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
            100008,
            'SharedByUserID',
            'Shared By User ID',
            'Foreign key to the User who shared this artifact (if shared)',
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
         WHERE ID = '4dd52506-5053-4210-b61f-b0044e8aac89'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = '__mj_CreatedAt')
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
            '4dd52506-5053-4210-b61f-b0044e8aac89',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
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
         WHERE ID = '617027dd-bcba-476d-9e34-7c174de79c7f'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = '__mj_UpdatedAt')
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
            '617027dd-bcba-476d-9e34-7c174de79c7f',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6c80ec70-ce3d-4a90-9838-8bac5dbed65c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6c80ec70-ce3d-4a90-9838-8bac5dbed65c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '19846E1A-FD8E-405F-A0FA-42A7AA44758D', 'UserID', 'One To Many', 1, 1, 'MJ: Artifact Permissions', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'd44e5696-7c12-4782-a719-ff3bcd827f3d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('d44e5696-7c12-4782-a719-ff3bcd827f3d', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '19846E1A-FD8E-405F-A0FA-42A7AA44758D', 'SharedByUserID', 'One To Many', 1, 1, 'MJ: Artifact Permissions', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '4bcb1f8d-91c1-4516-baf5-39079d58cca0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('4bcb1f8d-91c1-4516-baf5-39079d58cca0', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', '19846E1A-FD8E-405F-A0FA-42A7AA44758D', 'ArtifactID', 'One To Many', 1, 1, 'MJ: Artifact Permissions', 3);
   END
                              

/* Index for Foreign Keys for ArtifactPermission */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Permissions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ArtifactID in table ArtifactPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactPermission_ArtifactID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactPermission_ArtifactID ON [${flyway:defaultSchema}].[ArtifactPermission] ([ArtifactID]);

-- Index for foreign key UserID in table ArtifactPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactPermission_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactPermission_UserID ON [${flyway:defaultSchema}].[ArtifactPermission] ([UserID]);

-- Index for foreign key SharedByUserID in table ArtifactPermission
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ArtifactPermission_SharedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ArtifactPermission]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ArtifactPermission_SharedByUserID ON [${flyway:defaultSchema}].[ArtifactPermission] ([SharedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 10988C4B-74FB-4B11-ACCE-077187826A42 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='10988C4B-74FB-4B11-ACCE-077187826A42',
         @RelatedEntityNameFieldMap='Artifact'

/* SQL text to update entity field related entity name field map for entity field ID 1B5CFD0F-A9F6-4AC4-AF1E-13438AD59285 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1B5CFD0F-A9F6-4AC4-AF1E-13438AD59285',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 546EADE0-7781-4E7C-A3BB-C8176DC8EDAF */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='546EADE0-7781-4E7C-A3BB-C8176DC8EDAF',
         @RelatedEntityNameFieldMap='SharedByUser'

/* Base View SQL for MJ: Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Permissions
-- Item: vwArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Artifact Permissions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ArtifactPermission
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArtifactPermissions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArtifactPermissions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArtifactPermissions]
AS
SELECT
    a.*,
    Artifact_ArtifactID.[Name] AS [Artifact],
    User_UserID.[Name] AS [User],
    User_SharedByUserID.[Name] AS [SharedByUser]
FROM
    [${flyway:defaultSchema}].[ArtifactPermission] AS a
INNER JOIN
    [${flyway:defaultSchema}].[Artifact] AS Artifact_ArtifactID
  ON
    [a].[ArtifactID] = Artifact_ArtifactID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_SharedByUserID
  ON
    [a].[SharedByUserID] = User_SharedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Permissions
-- Item: Permissions for vwArtifactPermissions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwArtifactPermissions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Permissions
-- Item: spCreateArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArtifactPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArtifactPermission]
    @ID uniqueidentifier = NULL,
    @ArtifactID uniqueidentifier,
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
        INSERT INTO [${flyway:defaultSchema}].[ArtifactPermission]
            (
                [ID],
                [ArtifactID],
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
                @ArtifactID,
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
        INSERT INTO [${flyway:defaultSchema}].[ArtifactPermission]
            (
                [ArtifactID],
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
                @ArtifactID,
                @UserID,
                ISNULL(@CanRead, 1),
                ISNULL(@CanEdit, 0),
                ISNULL(@CanDelete, 0),
                ISNULL(@CanShare, 0),
                @SharedByUserID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwArtifactPermissions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactPermission] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Permissions
-- Item: spUpdateArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArtifactPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArtifactPermission]
    @ID uniqueidentifier,
    @ArtifactID uniqueidentifier,
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
        [${flyway:defaultSchema}].[ArtifactPermission]
    SET
        [ArtifactID] = @ArtifactID,
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArtifactPermissions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwArtifactPermissions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactPermission] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArtifactPermission table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateArtifactPermission]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateArtifactPermission];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateArtifactPermission
ON [${flyway:defaultSchema}].[ArtifactPermission]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArtifactPermission]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ArtifactPermission] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArtifactPermission] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Artifact Permissions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Permissions
-- Item: spDeleteArtifactPermission
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactPermission
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteArtifactPermission]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactPermission];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteArtifactPermission]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ArtifactPermission]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactPermission] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Artifact Permissions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteArtifactPermission] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2946b422-b878-4bd3-b2f3-180a45145c80'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'Artifact')
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
            '2946b422-b878-4bd3-b2f3-180a45145c80',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
            100021,
            'Artifact',
            'Artifact',
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
         WHERE ID = 'bd264d3c-bbda-49c9-99b1-6bf128b7cf44'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'User')
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
            'bd264d3c-bbda-49c9-99b1-6bf128b7cf44',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
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
         WHERE ID = 'eea1da03-c7bc-495d-b791-b243c24732fa'  OR 
               (EntityID = '19846E1A-FD8E-405F-A0FA-42A7AA44758D' AND Name = 'SharedByUser')
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
            'eea1da03-c7bc-495d-b791-b243c24732fa',
            '19846E1A-FD8E-405F-A0FA-42A7AA44758D', -- Entity: MJ: Artifact Permissions
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

