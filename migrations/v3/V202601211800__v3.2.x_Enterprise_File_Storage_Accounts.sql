-- =============================================
-- Migration: Enterprise File Storage Accounts
-- Description: Creates FileStorageAccount table for enterprise-level file storage management.
-- This implements an organizational model where storage accounts are shared resources tied to
-- credentials managed by the Credential Engine, replacing the previous per-user model.
-- =============================================

-- Create FileStorageAccount table
CREATE TABLE [${flyway:defaultSchema}].[FileStorageAccount] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_FileStorageAccount_ID] DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [ProviderID] UNIQUEIDENTIFIER NOT NULL,
    [CredentialID] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [PK_FileStorageAccount] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_FileStorageAccount_Provider] FOREIGN KEY ([ProviderID])
        REFERENCES [${flyway:defaultSchema}].[FileStorageProvider] ([ID]),
    CONSTRAINT [FK_FileStorageAccount_Credential] FOREIGN KEY ([CredentialID])
        REFERENCES [${flyway:defaultSchema}].[Credential] ([ID]),
    CONSTRAINT [UQ_FileStorageAccount_Provider_Name] UNIQUE ([ProviderID], [Name])
);
GO

-- Add Configuration and RequiresOAuth columns to FileStorageProvider
ALTER TABLE [${flyway:defaultSchema}].[FileStorageProvider]
ADD [Configuration] NVARCHAR(MAX) NULL,
    [RequiresOAuth] BIT NOT NULL CONSTRAINT [DF_FileStorageProvider_RequiresOAuth] DEFAULT 0;
GO

-- Extended properties for FileStorageProvider new columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON configuration for providers that don''t use Credential Engine. Used as fallback when CredentialID is not set on FileStorageAccount.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageProvider',
    @level2type = N'COLUMN', @level2name = N'Configuration';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'If true, this provider requires OAuth authentication. Enterprise OAuth integration via Credential Engine is planned but not yet implemented.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageProvider',
    @level2type = N'COLUMN', @level2name = N'RequiresOAuth';
GO

-- Extended properties for table documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Enterprise-level file storage accounts. Each account represents a configured connection to a storage provider (e.g., Marketing Dropbox, Engineering Google Drive) with credentials managed centrally.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageAccount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary key',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageAccount',
    @level2type = N'COLUMN', @level2name = N'ID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name for the storage account (e.g., Marketing Files, Engineering Docs). Must be unique per provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageAccount',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional description providing additional context about the account purpose or contents.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageAccount',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to FileStorageProvider indicating which storage service this account uses (Dropbox, Google Drive, S3, etc.).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageAccount',
    @level2type = N'COLUMN', @level2name = N'ProviderID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Credential containing the authentication details (OAuth tokens, API keys, etc.) for this account. Credentials are decrypted at runtime by the Credential Engine.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'FileStorageAccount',
    @level2type = N'COLUMN', @level2name = N'CredentialID';
GO



































































-- =============================================
-- CodeGen Output Section
-- Generated: 2026-01-22
-- =============================================

/* SQL generated to create new entity MJ: File Storage Accounts */

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
         '18033543-b80d-4bf7-adaf-de1aa2cf70d0',
         'MJ: File Storage Accounts',
         'File Storage Accounts',
         NULL,
         NULL,
         'FileStorageAccount',
         'vwFileStorageAccounts',
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


/* SQL generated to add new entity MJ: File Storage Accounts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '18033543-b80d-4bf7-adaf-de1aa2cf70d0', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('18033543-b80d-4bf7-adaf-de1aa2cf70d0', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('18033543-b80d-4bf7-adaf-de1aa2cf70d0', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('18033543-b80d-4bf7-adaf-de1aa2cf70d0', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccount] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccount] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '84dfc06a-4105-461e-85b8-68026c77822c'  OR
               (EntityID = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Configuration')
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
            '84dfc06a-4105-461e-85b8-68026c77822c',
            '28248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: File Storage Providers
            100021,
            'Configuration',
            'Configuration',
            'Optional JSON configuration for providers that don''t use Credential Engine. Used as fallback when CredentialID is not set on FileStorageAccount.',
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '38f50d13-8f08-4f8c-ab79-80adb7b8993c'  OR
               (EntityID = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RequiresOAuth')
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
            '38f50d13-8f08-4f8c-ab79-80adb7b8993c',
            '28248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: File Storage Providers
            100022,
            'RequiresOAuth',
            'Requires O Auth',
            'If true, this provider requires OAuth authentication. Enterprise OAuth integration via Credential Engine is planned but not yet implemented.',
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
            'Dropdown'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '6711d6d0-0fb5-4e95-94de-936a1c3a22c2'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'ID')
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
            '6711d6d0-0fb5-4e95-94de-936a1c3a22c2',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = 'dfd9e389-750a-49f3-81c9-bce972359d67'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'Name')
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
            'dfd9e389-750a-49f3-81c9-bce972359d67',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100002,
            'Name',
            'Name',
            'Display name for the storage account (e.g., Marketing Files, Engineering Docs). Must be unique per provider.',
            'nvarchar',
            400,
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
         WHERE ID = '7af85902-718b-435e-8575-1a77b0533eb1'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'Description')
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
            '7af85902-718b-435e-8575-1a77b0533eb1',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100003,
            'Description',
            'Description',
            'Optional description providing additional context about the account purpose or contents.',
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
         WHERE ID = 'fb4ca74a-55eb-49b5-8ef9-4b1d3fbb02e7'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'ProviderID')
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
            'fb4ca74a-55eb-49b5-8ef9-4b1d3fbb02e7',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100004,
            'ProviderID',
            'Provider ID',
            'Foreign key to FileStorageProvider indicating which storage service this account uses (Dropbox, Google Drive, S3, etc.).',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '28248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '2704a192-0578-41e4-b9f1-013431b49b9b'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'CredentialID')
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
            '2704a192-0578-41e4-b9f1-013431b49b9b',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100005,
            'CredentialID',
            'Credential ID',
            'Foreign key to Credential containing the authentication details (OAuth tokens, API keys, etc.) for this account. Credentials are decrypted at runtime by the Credential Engine.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '940c9a4b-99c1-43f7-b52d-bb7ba6bd684d'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = '__mj_CreatedAt')
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
            '940c9a4b-99c1-43f7-b52d-bb7ba6bd684d',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100006,
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
         WHERE ID = '7b02a9c8-027d-4ebd-995c-c5ce157976b5'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = '__mj_UpdatedAt')
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
            '7b02a9c8-027d-4ebd-995c-c5ce157976b5',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100007,
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
      WHERE ID = 'b22f5034-c9de-4228-8bb0-d161cc1c6d47'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('b22f5034-c9de-4228-8bb0-d161cc1c6d47', '28248F34-2837-EF11-86D4-6045BDEE16E6', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'ProviderID', 'One To Many', 1, 1, 'MJ: File Storage Accounts', 1);
   END


/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '905e1041-c42f-4e7d-928e-991c677ef038'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('905e1041-c42f-4e7d-928e-991c677ef038', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'CredentialID', 'One To Many', 1, 1, 'MJ: File Storage Accounts', 2);
   END


/* Index for Foreign Keys for FileStorageProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: vwFileStorageProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      File Storage Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FileStorageProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFileStorageProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFileStorageProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFileStorageProviders]
AS
SELECT
    f.*
FROM
    [${flyway:defaultSchema}].[FileStorageProvider] AS f
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]


/* Base View Permissions SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: Permissions for vwFileStorageProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFileStorageProviders] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: spCreateFileStorageProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFileStorageProvider]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int = NULL,
    @IsActive bit = NULL,
    @SupportsSearch bit = NULL,
    @Configuration nvarchar(MAX),
    @RequiresOAuth bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FileStorageProvider]
            (
                [ID],
                [Name],
                [Description],
                [ServerDriverKey],
                [ClientDriverKey],
                [Priority],
                [IsActive],
                [SupportsSearch],
                [Configuration],
                [RequiresOAuth]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ServerDriverKey,
                @ClientDriverKey,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSearch, 0),
                @Configuration,
                ISNULL(@RequiresOAuth, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FileStorageProvider]
            (
                [Name],
                [Description],
                [ServerDriverKey],
                [ClientDriverKey],
                [Priority],
                [IsActive],
                [SupportsSearch],
                [Configuration],
                [RequiresOAuth]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ServerDriverKey,
                @ClientDriverKey,
                ISNULL(@Priority, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSearch, 0),
                @Configuration,
                ISNULL(@RequiresOAuth, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFileStorageProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]


/* spCreate Permissions for File Storage Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: spUpdateFileStorageProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFileStorageProvider]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @ServerDriverKey nvarchar(100),
    @ClientDriverKey nvarchar(100),
    @Priority int,
    @IsActive bit,
    @SupportsSearch bit,
    @Configuration nvarchar(MAX),
    @RequiresOAuth bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageProvider]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ServerDriverKey] = @ServerDriverKey,
        [ClientDriverKey] = @ClientDriverKey,
        [Priority] = @Priority,
        [IsActive] = @IsActive,
        [SupportsSearch] = @SupportsSearch,
        [Configuration] = @Configuration,
        [RequiresOAuth] = @RequiresOAuth
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFileStorageProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFileStorageProviders]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FileStorageProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFileStorageProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFileStorageProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFileStorageProvider
ON [${flyway:defaultSchema}].[FileStorageProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FileStorageProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for File Storage Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileStorageProvider] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for File Storage Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: File Storage Providers
-- Item: spDeleteFileStorageProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileStorageProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFileStorageProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFileStorageProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FileStorageProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageProvider] TO [cdp_Integration], [cdp_Developer]


/* spDelete Permissions for File Storage Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileStorageProvider] TO [cdp_Integration], [cdp_Developer]



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

/* SQL text to update entity field related entity name field map for entity field ID FB4CA74A-55EB-49B5-8EF9-4B1D3FBB02E7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FB4CA74A-55EB-49B5-8EF9-4B1D3FBB02E7',
         @RelatedEntityNameFieldMap='Provider'

/* SQL text to update entity field related entity name field map for entity field ID 2704A192-0578-41E4-B9F1-013431B49B9B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2704A192-0578-41E4-B9F1-013431B49B9B',
         @RelatedEntityNameFieldMap='Credential'

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
    FileStorageProvider_ProviderID.[Name] AS [Provider],
    Credential_CredentialID.[Name] AS [Credential]
FROM
    [${flyway:defaultSchema}].[FileStorageAccount] AS f
INNER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS FileStorageProvider_ProviderID
  ON
    [f].[ProviderID] = FileStorageProvider_ProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Credential] AS Credential_CredentialID
  ON
    [f].[CredentialID] = Credential_CredentialID.[ID]
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
    @CredentialID uniqueidentifier
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
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @ProviderID,
                @CredentialID
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
                [CredentialID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @ProviderID,
                @CredentialID
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
    @CredentialID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileStorageAccount]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [ProviderID] = @ProviderID,
        [CredentialID] = @CredentialID
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



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = 'cfbed107-e7f8-47d2-a4fc-6b6fda5a0869'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'Provider')
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
            'cfbed107-e7f8-47d2-a4fc-6b6fda5a0869',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100015,
            'Provider',
            'Provider',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '9315b467-17c6-4fa2-ab5f-70774e51ddcf'  OR
               (EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0' AND Name = 'Credential')
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
            '9315b467-17c6-4fa2-ab5f-70774e51ddcf',
            '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', -- Entity: MJ: File Storage Accounts
            100016,
            'Credential',
            'Credential',
            NULL,
            'nvarchar',
            400,
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'DFD9E389-750A-49F3-81C9-BCE972359D67'
            AND AutoUpdateIsNameField = 1


            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DFD9E389-750A-49F3-81C9-BCE972359D67'
            AND AutoUpdateDefaultInView = 1


            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CFBED107-E7F8-47D2-A4FC-6B6FDA5A0869'
            AND AutoUpdateDefaultInView = 1


            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9315B467-17C6-4FA2-AB5F-70774E51DDCF'
            AND AutoUpdateDefaultInView = 1


               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'DFD9E389-750A-49F3-81C9-BCE972359D67'
               AND AutoUpdateIncludeInUserSearchAPI = 1


               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'CFBED107-E7F8-47D2-A4FC-6B6FDA5A0869'
               AND AutoUpdateIncludeInUserSearchAPI = 1


               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9315B467-17C6-4FA2-AB5F-70774E51DDCF'
               AND AutoUpdateIncludeInUserSearchAPI = 1


/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1


            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1


            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '064F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1


            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '094F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1


            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1


               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1


               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '064F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1


/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Provider Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Provider Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Provider Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '064F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Driver Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Server Driver Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '074F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Driver Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Client Driver Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '084F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Selection & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '094F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Selection & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Selection & Availability',
       GeneratedFormSection = 'Category',
       DisplayName = 'Supports Search',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F7CFAB57-DCC4-4BA6-ACA1-401636343F43'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '775817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '785817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authentication & Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84DFC06A-4105-461E-85B8-68026C77822C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authentication & Access',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requires OAuth',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '38F50D13-8F08-4F8C-AB79-80ADB7B8993C'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('bbd75b5c-4de9-41c1-b882-fa3f93381ea6', '28248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Authentication & Access":{"icon":"fa fa-shield-alt","description":"Settings related to authentication, OAuth requirements and custom configuration for the storage provider."},"Provider Identification":{"icon":"fa fa-tag","description":""},"Driver Configuration":{"icon":"fa fa-plug","description":""},"Selection & Availability":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())


/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authentication & Access":"fa fa-shield-alt","Provider Identification":"fa fa-tag","Driver Configuration":"fa fa-plug","Selection & Availability":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'


/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6711D6D0-0FB5-4E95-94DE-936A1C3A22C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFD9E389-750A-49F3-81C9-BCE972359D67'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7AF85902-718B-435E-8575-1A77B0533EB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Account Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Provider Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CFBED107-E7F8-47D2-A4FC-6B6FDA5A0869'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB4CA74A-55EB-49B5-8EF9-4B1D3FBB02E7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2704A192-0578-41E4-B9F1-013431B49B9B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9315B467-17C6-4FA2-AB5F-70774E51DDCF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '940C9A4B-99C1-43F7-B52D-BB7BA6BD684D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B02A9C8-027D-4EBD-995C-C5CE157976B5'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-cloud */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-cloud',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0'


/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3e23a561-f950-456e-9330-6363ed6d566d', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'FieldCategoryInfo', '{"Account Overview":{"icon":"fa fa-file-alt","description":"Basic identifying information for the storage account."},"Connection Details":{"icon":"fa fa-plug","description":"Provider and credential configuration for accessing the storage service."},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit and technical fields."}}', GETUTCDATE(), GETUTCDATE())


/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('757bc759-c9aa-482c-a71e-96a45c8ce22a', '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0', 'FieldCategoryIcons', '{"Account Overview":"fa fa-file-alt","Connection Details":"fa fa-plug","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())


/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '18033543-B80D-4BF7-ADAF-DE1AA2CF70D0'
