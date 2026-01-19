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
         '285b6f4c-1da1-4365-a27f-398b11603ef9',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '285b6f4c-1da1-4365-a27f-398b11603ef9', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('285b6f4c-1da1-4365-a27f-398b11603ef9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('285b6f4c-1da1-4365-a27f-398b11603ef9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: File Storage Accounts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('285b6f4c-1da1-4365-a27f-398b11603ef9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         WHERE ID = '838b3325-853c-41e9-b53e-16e2943b7acd'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = 'ID')
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
            '838b3325-853c-41e9-b53e-16e2943b7acd',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '48c78395-b065-40d4-87c6-131aa7809883'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = 'Name')
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
            '48c78395-b065-40d4-87c6-131aa7809883',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '4bba3a1e-1283-4a2e-8c51-b1c1da609c77'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = 'Description')
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
            '4bba3a1e-1283-4a2e-8c51-b1c1da609c77',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '4b1a7fc7-2bc3-470c-92bc-31e4a0ca461f'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = 'ProviderID')
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
            '4b1a7fc7-2bc3-470c-92bc-31e4a0ca461f',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '099fc803-94f8-4198-a868-7c7eb9615b0f'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = 'CredentialID')
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
            '099fc803-94f8-4198-a868-7c7eb9615b0f',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '8f27f8bf-4eab-4009-9592-43b1ce264f70'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = '__mj_CreatedAt')
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
            '8f27f8bf-4eab-4009-9592-43b1ce264f70',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = '0dc3ec25-51be-4f8f-886e-6b01e904f2b1'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = '__mj_UpdatedAt')
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
            '0dc3ec25-51be-4f8f-886e-6b01e904f2b1',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a50586c9-d637-4b43-ba9a-dbc2c9e10433'  OR 
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
            'a50586c9-d637-4b43-ba9a-dbc2c9e10433',
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
         WHERE ID = '901122eb-0e36-408f-8cc8-84537f63f29f'  OR 
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
            '901122eb-0e36-408f-8cc8-84537f63f29f',
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c5482ff0-bb20-40ae-853b-a419c3fd5f0e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c5482ff0-bb20-40ae-853b-a419c3fd5f0e', '28248F34-2837-EF11-86D4-6045BDEE16E6', '285B6F4C-1DA1-4365-A27F-398B11603EF9', 'ProviderID', 'One To Many', 1, 1, 'MJ: File Storage Accounts', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '53eaf6d8-9a4c-4e32-ad03-29e13f40477c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('53eaf6d8-9a4c-4e32-ad03-29e13f40477c', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '285B6F4C-1DA1-4365-A27F-398B11603EF9', 'CredentialID', 'One To Many', 1, 1, 'MJ: File Storage Accounts', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID 60EB433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='60EB433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 84EB433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='84EB433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 18EB433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='18EB433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID CEE9433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CEE9433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 2EEA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2EEA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 2AEB433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2AEB433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 30EB433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='30EB433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 36EB433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='36EB433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 04EA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='04EA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID ACEA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ACEA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 0AEA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0AEA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 10EA433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='10EA433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ContentFileType'

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

/* SQL text to update entity field related entity name field map for entity field ID 4B1A7FC7-2BC3-470C-92BC-31E4A0CA461F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4B1A7FC7-2BC3-470C-92BC-31E4A0CA461F',
         @RelatedEntityNameFieldMap='Provider'

/* SQL text to update entity field related entity name field map for entity field ID 099FC803-94F8-4198-A868-7C7EB9615B0F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='099FC803-94F8-4198-A868-7C7EB9615B0F',
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



/* SQL text to update entity field related entity name field map for entity field ID 62EC433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='62EC433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 63EC433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='63EC433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID FAEB433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FAEB433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 12EC433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='12EC433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 18EC433E-F36B-1410-8985-007AA2BDA0B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='18EC433E-F36B-1410-8985-007AA2BDA0B9',
         @RelatedEntityNameFieldMap='User'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d4cb104-10d9-449e-8380-e58b981bb8dd'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = 'Provider')
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
            '0d4cb104-10d9-449e-8380-e58b981bb8dd',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
         WHERE ID = 'e7c3774e-0890-46df-81c0-1d19f68da96c'  OR 
               (EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9' AND Name = 'Credential')
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
            'e7c3774e-0890-46df-81c0-1d19f68da96c',
            '285B6F4C-1DA1-4365-A27F-398B11603EF9', -- Entity: MJ: File Storage Accounts
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
            WHERE ID = '48C78395-B065-40D4-87C6-131AA7809883'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '48C78395-B065-40D4-87C6-131AA7809883'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0D4CB104-10D9-449E-8380-E58B981BB8DD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E7C3774E-0890-46DF-81C0-1D19F68DA96C'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '48C78395-B065-40D4-87C6-131AA7809883'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0D4CB104-10D9-449E-8380-E58B981BB8DD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E7C3774E-0890-46DF-81C0-1D19F68DA96C'
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
            WHERE ID = '094F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F7CFAB57-DCC4-4BA6-ACA1-401636343F43'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '054F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '064F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '074F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '084F17F0-6F36-EF11-86D4-6045BDEE16E6'
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
   SET Category = 'Authentication & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A50586C9-D637-4B43-BA9A-DBC2C9E10433'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authentication & Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requires OAuth',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '901122EB-0E36-408F-8CC8-84537F63F29F'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('cbaa078e-342f-4647-b2fe-ff6b46cf6807', '28248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Authentication & Settings":{"icon":"fa fa-shield-alt","description":"Settings related to authentication mechanisms and provider‑specific configuration"},"Provider Identification":{"icon":"fa fa-tag","description":""},"Driver Configuration":{"icon":"fa fa-plug","description":""},"Selection & Availability":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authentication & Settings":"fa fa-shield-alt","Provider Identification":"fa fa-tag","Driver Configuration":"fa fa-plug","Selection & Availability":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '28248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 9 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '838B3325-853C-41E9-B53E-16E2943B7ACD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Account Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48C78395-B065-40D4-87C6-131AA7809883'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Account Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4BBA3A1E-1283-4A2E-8C51-B1C1DA609C77'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage Account Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Provider Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0D4CB104-10D9-449E-8380-E58B981BB8DD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B1A7FC7-2BC3-470C-92BC-31E4A0CA461F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '099FC803-94F8-4198-A868-7C7EB9615B0F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Connection Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Credential Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E7C3774E-0890-46DF-81C0-1D19F68DA96C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8F27F8BF-4EAB-4009-9592-43B1CE264F70'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0DC3EC25-51BE-4F8F-886E-6B01E904F2B1'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-cloud */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-cloud',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '285B6F4C-1DA1-4365-A27F-398B11603EF9'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('6618c796-1427-430f-a478-175808704cfc', '285B6F4C-1DA1-4365-A27F-398B11603EF9', 'FieldCategoryInfo', '{"Storage Account Information":{"icon":"fa fa-hdd","description":"Core details that identify and describe the file storage account"},"Connection Settings":{"icon":"fa fa-plug","description":"References to the storage provider and credential used for access"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields managed by the system"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('7ab128ee-9181-4623-95f1-0361b23b17b3', '285B6F4C-1DA1-4365-A27F-398B11603EF9', 'FieldCategoryIcons', '{"Storage Account Information":"fa fa-hdd","Connection Settings":"fa fa-plug","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '285B6F4C-1DA1-4365-A27F-398B11603EF9'
         

