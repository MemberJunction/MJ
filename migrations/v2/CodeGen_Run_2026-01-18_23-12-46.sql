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
         '0e9cadcb-5420-4c23-b838-21137feb08eb',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '0e9cadcb-5420-4c23-b838-21137feb08eb', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0e9cadcb-5420-4c23-b838-21137feb08eb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0e9cadcb-5420-4c23-b838-21137feb08eb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('0e9cadcb-5420-4c23-b838-21137feb08eb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageAccount */

         DECLARE @constraintName NVARCHAR(255);

         -- Get the default constraint name
         SELECT @constraintName = d.name
         FROM sys.tables t
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         JOIN sys.columns c ON t.object_id = c.object_id
         JOIN sys.default_constraints d ON c.default_object_id = d.object_id
         WHERE s.name = '${flyway:defaultSchema}'
         AND t.name = 'FileStorageAccount'
         AND c.name = '__mj_CreatedAt';

         -- Drop the default constraint if it exists
         IF @constraintName IS NOT NULL
         BEGIN
            EXEC('ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccount] DROP CONSTRAINT ' + @constraintName);
         END
         

/* SQL text to add default constraint for special date field __mj_CreatedAt in entity ${flyway:defaultSchema}.FileStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccount] ADD CONSTRAINT DF___mj_FileStorageAccount___mj_CreatedAt DEFAULT GETUTCDATE() FOR [__mj_CreatedAt]

/* SQL text to drop default existing default constraints in entity ${flyway:defaultSchema}.FileStorageAccount */

         DECLARE @constraintName NVARCHAR(255);

         -- Get the default constraint name
         SELECT @constraintName = d.name
         FROM sys.tables t
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         JOIN sys.columns c ON t.object_id = c.object_id
         JOIN sys.default_constraints d ON c.default_object_id = d.object_id
         WHERE s.name = '${flyway:defaultSchema}'
         AND t.name = 'FileStorageAccount'
         AND c.name = '__mj_UpdatedAt';

         -- Drop the default constraint if it exists
         IF @constraintName IS NOT NULL
         BEGIN
            EXEC('ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccount] DROP CONSTRAINT ' + @constraintName);
         END
         

/* SQL text to add default constraint for special date field __mj_UpdatedAt in entity ${flyway:defaultSchema}.FileStorageAccount */
ALTER TABLE [${flyway:defaultSchema}].[FileStorageAccount] ADD CONSTRAINT DF___mj_FileStorageAccount___mj_UpdatedAt DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt]

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1e16311d-5303-437a-a6b0-00d407d4d340'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = 'ID')
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
            '1e16311d-5303-437a-a6b0-00d407d4d340',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '84d74cd0-8715-4ca1-9d87-371209e9f4c2'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = 'Name')
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
            '84d74cd0-8715-4ca1-9d87-371209e9f4c2',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '2a5267b1-f941-4bec-b6e9-51e8c84092e3'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = 'Description')
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
            '2a5267b1-f941-4bec-b6e9-51e8c84092e3',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '3f29b0a7-d17f-4b25-941f-cafb1375f33b'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = 'ProviderID')
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
            '3f29b0a7-d17f-4b25-941f-cafb1375f33b',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '9d4f5fad-992b-4545-9828-3376b578f1a4'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = 'CredentialID')
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
            '9d4f5fad-992b-4545-9828-3376b578f1a4',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = 'c566a103-5981-4d7f-82dc-3ec7426bbc3b'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = '__mj_CreatedAt')
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
            'c566a103-5981-4d7f-82dc-3ec7426bbc3b',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '6f6ed294-eb32-4179-b869-bfa729ae1efa'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = '__mj_UpdatedAt')
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
            '6f6ed294-eb32-4179-b869-bfa729ae1efa',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
      WHERE ID = 'bac67bc1-3554-457e-b769-cb37396c8409'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('bac67bc1-3554-457e-b769-cb37396c8409', '28248F34-2837-EF11-86D4-6045BDEE16E6', '0E9CADCB-5420-4C23-B838-21137FEB08EB', 'ProviderID', 'One To Many', 1, 1, 'MJ: File Storage Accounts', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '65ac9f3b-00f4-4a11-9612-de7e5a9f2e9e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('65ac9f3b-00f4-4a11-9612-de7e5a9f2e9e', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '0E9CADCB-5420-4C23-B838-21137FEB08EB', 'CredentialID', 'One To Many', 1, 1, 'MJ: File Storage Accounts', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID FBD9433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FBD9433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 19DA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='19DA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID BFD9433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BFD9433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID ACD8433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ACD8433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID FCD8433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FCD8433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID CED9433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CED9433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID D3D9433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D3D9433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID D8D9433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D8D9433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID D9D8433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D9D8433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 65D9433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='65D9433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID DED8433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DED8433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID E3D8433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E3D8433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentFileType'

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

/* SQL text to update entity field related entity name field map for entity field ID 3F29B0A7-D17F-4B25-941F-CAFB1375F33B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3F29B0A7-D17F-4B25-941F-CAFB1375F33B',
         @RelatedEntityNameFieldMap='Provider'

/* SQL text to update entity field related entity name field map for entity field ID 9D4F5FAD-992B-4545-9828-3376B578F1A4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9D4F5FAD-992B-4545-9828-3376B578F1A4',
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



/* SQL text to update entity field related entity name field map for entity field ID BFDA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BFDA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID C5DA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C5DA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 6EDA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6EDA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 7ADA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7ADA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 7DDA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7DDA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='User'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9a928d00-67b2-4178-bb9f-38e93784e0bb'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = 'Provider')
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
            '9a928d00-67b2-4178-bb9f-38e93784e0bb',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '79ce4530-ac9e-4458-935d-4bd07e5f3ccc'  OR 
               (EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB' AND Name = 'Credential')
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
            '79ce4530-ac9e-4458-935d-4bd07e5f3ccc',
            '0E9CADCB-5420-4C23-B838-21137FEB08EB', -- Entity: MJ: File Storage Accounts
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
            WHERE ID = '84D74CD0-8715-4CA1-9D87-371209E9F4C2'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '84D74CD0-8715-4CA1-9D87-371209E9F4C2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9A928D00-67B2-4178-BB9F-38E93784E0BB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '79CE4530-AC9E-4458-935D-4BD07E5F3CCC'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '84D74CD0-8715-4CA1-9D87-371209E9F4C2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9A928D00-67B2-4178-BB9F-38E93784E0BB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '79CE4530-AC9E-4458-935D-4BD07E5F3CCC'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1E16311D-5303-437A-A6B0-00D407D4D340'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84D74CD0-8715-4CA1-9D87-371209E9F4C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'General Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2A5267B1-F941-4BEC-B6E9-51E8C84092E3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3F29B0A7-D17F-4B25-941F-CAFB1375F33B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D4F5FAD-992B-4545-9828-3376B578F1A4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Provider Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9A928D00-67B2-4178-BB9F-38E93784E0BB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79CE4530-AC9E-4458-935D-4BD07E5F3CCC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C566A103-5981-4D7F-82DC-3EC7426BBC3B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F6ED294-EB32-4179-B869-BFA729AE1EFA'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-cloud */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-cloud',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '0E9CADCB-5420-4C23-B838-21137FEB08EB'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('682984cd-fa0e-426a-8753-efd0324aedb6', '0E9CADCB-5420-4C23-B838-21137FEB08EB', 'FieldCategoryInfo', '{"General Information":{"icon":"fa fa-info-circle","description":"Core identifiers and descriptive details of the storage account"},"Connection Settings":{"icon":"fa fa-plug","description":"Provider and credential configuration used to connect to the external storage service"},"System Metadata":{"icon":"fa fa-cog","description":"Audit timestamps managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('b6342e18-b667-4e3d-83ec-7fc50b3c557b', '0E9CADCB-5420-4C23-B838-21137FEB08EB', 'FieldCategoryIcons', '{"General Information":"fa fa-info-circle","Connection Settings":"fa fa-plug","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: primary, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '0E9CADCB-5420-4C23-B838-21137FEB08EB'
         

