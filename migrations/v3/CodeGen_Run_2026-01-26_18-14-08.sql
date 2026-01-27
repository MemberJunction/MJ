/* SQL generated to create new entity Channel Message Attachments */

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
         '5528ede4-93e9-48ef-90e6-d1dc5a1cc3e1',
         'Channel Message Attachments',
         NULL,
         NULL,
         NULL,
         'ChannelMessageAttachment',
         'vwChannelMessageAttachments',
         'Izzy',
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
   

/* SQL generated to add new permission for entity Channel Message Attachments for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5528ede4-93e9-48ef-90e6-d1dc5a1cc3e1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Channel Message Attachments for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5528ede4-93e9-48ef-90e6-d1dc5a1cc3e1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Channel Message Attachments for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5528ede4-93e9-48ef-90e6-d1dc5a1cc3e1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity Izzy.ChannelMessageAttachment */
ALTER TABLE [Izzy].[ChannelMessageAttachment] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Izzy.ChannelMessageAttachment */
ALTER TABLE [Izzy].[ChannelMessageAttachment] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '13bd144e-c8ae-45a5-8bd7-1feb96313ca8'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'ID')
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
            '13bd144e-c8ae-45a5-8bd7-1feb96313ca8',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
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
         WHERE ID = '172bdffe-631f-406d-b018-b94efb24bfd3'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'ChannelMessageID')
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
            '172bdffe-631f-406d-b018-b94efb24bfd3',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100002,
            'ChannelMessageID',
            'Channel Message ID',
            'Foreign key to ChannelMessage table',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'ADAF7570-DF8A-4FB9-941F-EA81BAA267FE',
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
         WHERE ID = '21c16f87-2bdd-42e7-8217-ab259722eb84'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'ExternalSystemAttachmentID')
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
            '21c16f87-2bdd-42e7-8217-ab259722eb84',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100003,
            'ExternalSystemAttachmentID',
            'External System Attachment ID',
            'The attachment ID from the external system (e.g. MS Graph attachment ID)',
            'nvarchar',
            1000,
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
         WHERE ID = 'b857bbb2-d39a-40fb-9e77-672b1a9e21f4'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'Filename')
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
            'b857bbb2-d39a-40fb-9e77-672b1a9e21f4',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100004,
            'Filename',
            'Filename',
            'Original filename of the attachment',
            'nvarchar',
            1000,
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
         WHERE ID = '8ea09f54-5073-4c3e-abd8-da30af001b7d'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'ContentType')
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
            '8ea09f54-5073-4c3e-abd8-da30af001b7d',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100005,
            'ContentType',
            'Content Type',
            'MIME type of the attachment (e.g. image/png, application/pdf)',
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
         WHERE ID = 'e790b2c0-76ea-4321-b4ed-64a71c4f522d'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'Size')
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
            'e790b2c0-76ea-4321-b4ed-64a71c4f522d',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100006,
            'Size',
            'Size',
            'Size of the attachment in bytes',
            'int',
            4,
            10,
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
         WHERE ID = 'acc4ce46-77f0-4d62-8f33-f5f162c04f47'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'IsInline')
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
            'acc4ce46-77f0-4d62-8f33-f5f162c04f47',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100007,
            'IsInline',
            'Is Inline',
            'True if this is an inline image embedded in the email body (referenced by cid:)',
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
         WHERE ID = '61340394-3bd5-4396-b07f-c39054a2a625'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'ContentID')
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
            '61340394-3bd5-4396-b07f-c39054a2a625',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100008,
            'ContentID',
            'Content ID',
            'Content-ID used to reference inline images in HTML (e.g. "image001@microsoft.com" for <img src="cid:image001@microsoft.com">)',
            'nvarchar',
            1000,
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
         WHERE ID = '8ab275c4-0ec8-4d76-8d1a-805a9a47ab15'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'Content')
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
            '8ab275c4-0ec8-4d76-8d1a-805a9a47ab15',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100009,
            'Content',
            'Content',
            'Binary content of the attachment. NULL if stored externally (see StoragePath)',
            'varbinary',
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
         WHERE ID = '7ac58dbf-86c2-40c9-928b-c0482777ab59'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'StoragePath')
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
            '7ac58dbf-86c2-40c9-928b-c0482777ab59',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100010,
            'StoragePath',
            'Storage Path',
            'Optional path to external storage (e.g. Azure Blob Storage URL) if Content is not stored in database',
            'nvarchar',
            2000,
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
         WHERE ID = '1b593329-6507-49c2-bf5b-987b99cb9af4'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = '__mj_CreatedAt')
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
            '1b593329-6507-49c2-bf5b-987b99cb9af4',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100011,
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
         WHERE ID = 'f7f82ffc-a2ab-4709-897b-8cac651aef4b'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = '__mj_UpdatedAt')
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
            'f7f82ffc-a2ab-4709-897b-8cac651aef4b',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100012,
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
      WHERE ID = '455384af-e7dc-40bf-b300-de2ba5872e69'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('455384af-e7dc-40bf-b300-de2ba5872e69', 'ADAF7570-DF8A-4FB9-941F-EA81BAA267FE', '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', 'ChannelMessageID', 'One To Many', 1, 1, 'Channel Message Attachments', 1);
   END
                              

/* Index for Foreign Keys for ChannelMessageAttachment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Channel Message Attachments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ChannelMessageID in table ChannelMessageAttachment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ChannelMessageAttachment_ChannelMessageID' 
    AND object_id = OBJECT_ID('[Izzy].[ChannelMessageAttachment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ChannelMessageAttachment_ChannelMessageID ON [Izzy].[ChannelMessageAttachment] ([ChannelMessageID]);

/* SQL text to update entity field related entity name field map for entity field ID 172BDFFE-631F-406D-B018-B94EFB24BFD3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='172BDFFE-631F-406D-B018-B94EFB24BFD3',
         @RelatedEntityNameFieldMap='ChannelMessage'

/* Base View SQL for Channel Message Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Channel Message Attachments
-- Item: vwChannelMessageAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Channel Message Attachments
-----               SCHEMA:      Izzy
-----               BASE TABLE:  ChannelMessageAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Izzy].[vwChannelMessageAttachments]', 'V') IS NOT NULL
    DROP VIEW [Izzy].[vwChannelMessageAttachments];
GO

CREATE VIEW [Izzy].[vwChannelMessageAttachments]
AS
SELECT
    c.*,
    ChannelMessage_ChannelMessageID.[Subject] AS [ChannelMessage]
FROM
    [Izzy].[ChannelMessageAttachment] AS c
INNER JOIN
    [Izzy].[ChannelMessage] AS ChannelMessage_ChannelMessageID
  ON
    [c].[ChannelMessageID] = ChannelMessage_ChannelMessageID.[ID]
GO
GRANT SELECT ON [Izzy].[vwChannelMessageAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Channel Message Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Channel Message Attachments
-- Item: Permissions for vwChannelMessageAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Izzy].[vwChannelMessageAttachments] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Channel Message Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Channel Message Attachments
-- Item: spCreateChannelMessageAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ChannelMessageAttachment
------------------------------------------------------------
IF OBJECT_ID('[Izzy].[spCreateChannelMessageAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [Izzy].[spCreateChannelMessageAttachment];
GO

CREATE PROCEDURE [Izzy].[spCreateChannelMessageAttachment]
    @ID uniqueidentifier = NULL,
    @ChannelMessageID uniqueidentifier,
    @ExternalSystemAttachmentID nvarchar(500),
    @Filename nvarchar(500),
    @ContentType nvarchar(200),
    @Size int,
    @IsInline bit = NULL,
    @ContentID nvarchar(500),
    @Content varbinary,
    @StoragePath nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Izzy].[ChannelMessageAttachment]
            (
                [ID],
                [ChannelMessageID],
                [ExternalSystemAttachmentID],
                [Filename],
                [ContentType],
                [Size],
                [IsInline],
                [ContentID],
                [Content],
                [StoragePath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ChannelMessageID,
                @ExternalSystemAttachmentID,
                @Filename,
                @ContentType,
                @Size,
                ISNULL(@IsInline, 0),
                @ContentID,
                @Content,
                @StoragePath
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Izzy].[ChannelMessageAttachment]
            (
                [ChannelMessageID],
                [ExternalSystemAttachmentID],
                [Filename],
                [ContentType],
                [Size],
                [IsInline],
                [ContentID],
                [Content],
                [StoragePath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ChannelMessageID,
                @ExternalSystemAttachmentID,
                @Filename,
                @ContentType,
                @Size,
                ISNULL(@IsInline, 0),
                @ContentID,
                @Content,
                @StoragePath
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Izzy].[vwChannelMessageAttachments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Izzy].[spCreateChannelMessageAttachment] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Channel Message Attachments */

GRANT EXECUTE ON [Izzy].[spCreateChannelMessageAttachment] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Channel Message Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Channel Message Attachments
-- Item: spUpdateChannelMessageAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ChannelMessageAttachment
------------------------------------------------------------
IF OBJECT_ID('[Izzy].[spUpdateChannelMessageAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [Izzy].[spUpdateChannelMessageAttachment];
GO

CREATE PROCEDURE [Izzy].[spUpdateChannelMessageAttachment]
    @ID uniqueidentifier,
    @ChannelMessageID uniqueidentifier,
    @ExternalSystemAttachmentID nvarchar(500),
    @Filename nvarchar(500),
    @ContentType nvarchar(200),
    @Size int,
    @IsInline bit,
    @ContentID nvarchar(500),
    @Content varbinary,
    @StoragePath nvarchar(1000)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Izzy].[ChannelMessageAttachment]
    SET
        [ChannelMessageID] = @ChannelMessageID,
        [ExternalSystemAttachmentID] = @ExternalSystemAttachmentID,
        [Filename] = @Filename,
        [ContentType] = @ContentType,
        [Size] = @Size,
        [IsInline] = @IsInline,
        [ContentID] = @ContentID,
        [Content] = @Content,
        [StoragePath] = @StoragePath
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Izzy].[vwChannelMessageAttachments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Izzy].[vwChannelMessageAttachments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Izzy].[spUpdateChannelMessageAttachment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ChannelMessageAttachment table
------------------------------------------------------------
IF OBJECT_ID('[Izzy].[trgUpdateChannelMessageAttachment]', 'TR') IS NOT NULL
    DROP TRIGGER [Izzy].[trgUpdateChannelMessageAttachment];
GO
CREATE TRIGGER [Izzy].trgUpdateChannelMessageAttachment
ON [Izzy].[ChannelMessageAttachment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Izzy].[ChannelMessageAttachment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Izzy].[ChannelMessageAttachment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Channel Message Attachments */

GRANT EXECUTE ON [Izzy].[spUpdateChannelMessageAttachment] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Channel Message Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Channel Message Attachments
-- Item: spDeleteChannelMessageAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ChannelMessageAttachment
------------------------------------------------------------
IF OBJECT_ID('[Izzy].[spDeleteChannelMessageAttachment]', 'P') IS NOT NULL
    DROP PROCEDURE [Izzy].[spDeleteChannelMessageAttachment];
GO

CREATE PROCEDURE [Izzy].[spDeleteChannelMessageAttachment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Izzy].[ChannelMessageAttachment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Izzy].[spDeleteChannelMessageAttachment] TO [cdp_Integration]
    

/* spDelete Permissions for Channel Message Attachments */

GRANT EXECUTE ON [Izzy].[spDeleteChannelMessageAttachment] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'aa493934-0b6c-4c29-8ba8-ba76f96fa3c7'  OR 
               (EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1' AND Name = 'ChannelMessage')
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
            'aa493934-0b6c-4c29-8ba8-ba76f96fa3c7',
            '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', -- Entity: Channel Message Attachments
            100025,
            'ChannelMessage',
            'Channel Message',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'B857BBB2-D39A-40FB-9E77-672B1A9E21F4'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B857BBB2-D39A-40FB-9E77-672B1A9E21F4'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8EA09F54-5073-4C3E-ABD8-DA30AF001B7D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E790B2C0-76EA-4321-B4ED-64A71C4F522D'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'ACC4CE46-77F0-4D62-8F33-F5F162C04F47'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '21C16F87-2BDD-42E7-8217-AB259722EB84'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B857BBB2-D39A-40FB-9E77-672B1A9E21F4'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 13 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linkage & System',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '13BD144E-C8AE-45A5-8BD7-1FEB96313CA8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linkage & System',
       GeneratedFormSection = 'Category',
       DisplayName = 'Channel Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '172BDFFE-631F-406D-B018-B94EFB24BFD3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linkage & System',
       GeneratedFormSection = 'Category',
       DisplayName = 'Channel Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA493934-0B6C-4C29-8BA8-BA76F96FA3C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B593329-6507-49C2-BF5B-987B99CB9AF4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F7F82FFC-A2AB-4709-897B-8CAC651AEF4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'External Attachment ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '21C16F87-2BDD-42E7-8217-AB259722EB84'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'File Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B857BBB2-D39A-40FB-9E77-672B1A9E21F4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Content Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8EA09F54-5073-4C3E-ABD8-DA30AF001B7D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Size',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E790B2C0-76EA-4321-B4ED-64A71C4F522D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage & Inline Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Inline',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'ACC4CE46-77F0-4D62-8F33-F5F162C04F47'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage & Inline Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Content ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '61340394-3BD5-4396-B07F-C39054A2A625'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage & Inline Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Content',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8AB275C4-0EC8-4D76-8D1A-805A9A47AB15'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Storage & Inline Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Storage Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7AC58DBF-86C2-40C9-928B-C0482777AB59'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-paperclip */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-paperclip',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('89ef6593-9ee2-4668-8b94-8ebb20f8dcc1', '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', 'FieldCategoryInfo', '{"Attachment Details":{"icon":"fa fa-file","description":"Core metadata of the attachment such as name, type, size and external reference ID"},"Storage & Inline Settings":{"icon":"fa fa-database","description":"Settings and storage information, including inline flags and where the file data is kept"},"Linkage & System":{"icon":"fa fa-link","description":"Fields that connect the attachment to its channel message and system audit information"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit and tracking fields"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('cad276c6-9ebb-4264-b7b6-4e7ff5f39a9c', '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1', 'FieldCategoryIcons', '{"Attachment Details":"fa fa-file","Storage & Inline Settings":"fa fa-database","Linkage & System":"fa fa-link","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '5528EDE4-93E9-48EF-90E6-D1DC5A1CC3E1'
         

