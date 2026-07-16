/* SQL generated to create new entity MJ: RSU Audit Logs */

      INSERT INTO [__mj].[Entity] (
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
         'e3cbbdbd-303e-42dc-b7de-988adc21b0b9',
         'MJ: RSU Audit Logs',
         'RSU Audit Logs',
         NULL,
         NULL,
         'RSUAuditLog',
         'vwRSUAuditLogs',
         '__mj',
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
      );

/* SQL generated to add new entity MJ: RSU Audit Logs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [__mj].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e3cbbdbd-303e-42dc-b7de-988adc21b0b9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [__mj].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role UI */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e3cbbdbd-303e-42dc-b7de-988adc21b0b9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Developer */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e3cbbdbd-303e-42dc-b7de-988adc21b0b9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Audit Logs for role Integration */
INSERT INTO [__mj].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e3cbbdbd-303e-42dc-b7de-988adc21b0b9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RSUAuditLog */
ALTER TABLE [__mj].[RSUAuditLog] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RSUAuditLog */
UPDATE [__mj].[RSUAuditLog] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RSUAuditLog */
ALTER TABLE [__mj].[RSUAuditLog] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity __mj.RSUAuditLog */
ALTER TABLE [__mj].[RSUAuditLog] ADD CONSTRAINT [DF___mj_RSUAuditLog___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RSUAuditLog */
ALTER TABLE [__mj].[RSUAuditLog] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RSUAuditLog */
UPDATE [__mj].[RSUAuditLog] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RSUAuditLog */
ALTER TABLE [__mj].[RSUAuditLog] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.RSUAuditLog */
ALTER TABLE [__mj].[RSUAuditLog] ADD CONSTRAINT [DF___mj_RSUAuditLog___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* Set soft PK for magnetmail.email_history.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F131FDE5-EB4A-46EF-8E09-3EED9C333576' AND [Name] = 'message_id';

/* Set soft FK for magnetmail.email_history.message_id → Message.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '5AB0B6CD-0C8A-477C-A297-9B146216761B',
                                    [RelatedEntityFieldName] = 'message_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F131FDE5-EB4A-46EF-8E09-3EED9C333576' AND [Name] = 'message_id';

/* Set soft PK for magnetmail.link.link_url_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A1566598-1D57-4FC4-A0FB-E8AFF163FDD0' AND [Name] = 'link_url_id';

/* Set soft PK for magnetmail.website_link.website_link_url_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '676816D4-559C-405A-B6DD-0D09E7585E31' AND [Name] = 'website_link_url_id';

/* Set soft PK for magnetmail.Recipient.id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2BB13316-03B2-4E73-B03D-40C37D46AE79' AND [Name] = 'id';

/* Set soft PK for magnetmail.User.User_Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CC608FA3-28C5-40AB-9F35-B53FC00E117C' AND [Name] = 'User_Id';

/* Set soft PK for magnetmail.Message.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5AB0B6CD-0C8A-477C-A297-9B146216761B' AND [Name] = 'message_id';

/* Set soft PK for magnetmail.JobToGroup.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '62849B16-D519-404D-9E13-18A673E0DA2B' AND [Name] = 'group_id';

/* Set soft FK for magnetmail.JobToGroup.group_id → group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E',
                                    [RelatedEntityFieldName] = 'group_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '62849B16-D519-404D-9E13-18A673E0DA2B' AND [Name] = 'group_id';

/* Set soft PK for magnetmail.Links.linkid */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '90E9C472-BFBE-45E3-9C17-DCC58A0970F8' AND [Name] = 'linkid';

/* Set soft PK for magnetmail.recp_track.MMId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '01DF3083-0DC8-4CB4-BFDC-75B150CA0979' AND [Name] = 'MMId';

/* Set soft PK for magnetmail.group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E' AND [Name] = 'group_id';

/* Set soft PK for magnetmail.MessageDetails.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ADD0EFAF-615A-4277-B93E-76D7F6378106' AND [Name] = 'message_id';

/* Set soft PK for magnetmail.MagnetMailQueries.Search_Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5263BF41-19BC-4B94-878F-9C9404320FAD' AND [Name] = 'Search_Id';

/* Set soft PK for magnetmail.RecipientGroup.Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B62312C9-501B-456F-BCAA-032801F358EF' AND [Name] = 'Id';

/* Set soft PK for magnetmail.Unsubscribe.Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'Id';

/* Set soft FK for magnetmail.Unsubscribe.MessageId → Message.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '5AB0B6CD-0C8A-477C-A297-9B146216761B',
                                    [RelatedEntityFieldName] = 'message_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'MessageId';

/* Set soft FK for magnetmail.Unsubscribe.GroupId → group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E',
                                    [RelatedEntityFieldName] = 'group_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'GroupId';

/* Set soft FK for magnetmail.Unsubscribe.MessageCategoryId → MessageCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '67C74504-190A-45C5-9BD2-A180401E3A4E',
                                    [RelatedEntityFieldName] = 'ID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'MessageCategoryId';

/* Set soft FK for magnetmail.Unsubscribe.RecipientId → Recipient.id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '2BB13316-03B2-4E73-B03D-40C37D46AE79',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'RecipientId';

/* Set soft FK for magnetmail.Unsubscribe.GroupCategoryId → GroupCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '066BB970-19DA-42D0-BB13-DAF492D5EFBF',
                                    [RelatedEntityFieldName] = 'ID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'GroupCategoryId';

/* Set soft PK for magnetmail.MailRecipientGroup.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0EEDF928-F644-4642-9C97-E07DA704047B' AND [Name] = 'group_id';

/* Set soft FK for magnetmail.MailRecipientGroup.group_id → group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E',
                                    [RelatedEntityFieldName] = 'group_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '0EEDF928-F644-4642-9C97-E07DA704047B' AND [Name] = 'group_id';

/* Set soft PK for magnetmail.GroupRecipient.RecipientId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E3104BCC-4817-4972-B04C-A27BD579C6FA' AND [Name] = 'RecipientId';

/* Set soft FK for magnetmail.GroupRecipient.RecipientId → Recipient.id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '2BB13316-03B2-4E73-B03D-40C37D46AE79',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'E3104BCC-4817-4972-B04C-A27BD579C6FA' AND [Name] = 'RecipientId';

/* Set soft PK for magnetmail.PersonifySubscriptionMapping.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D3879C6B-AF60-4855-A39E-E2D66073887A' AND [Name] = 'ID';

/* Set soft PK for magnetmail.MessageCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '67C74504-190A-45C5-9BD2-A180401E3A4E' AND [Name] = 'ID';

/* Set soft PK for magnetmail.GroupCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '066BB970-19DA-42D0-BB13-DAF492D5EFBF' AND [Name] = 'ID';

/* Set soft PK for magnetmail.UploadInitialJob.InitialQueueId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BE1AE446-6EAF-425F-928C-D19B4AEB5032' AND [Name] = 'InitialQueueId';

/* Set soft PK for magnetmail.ExtendedField.fieldId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '855979EC-997B-4B23-BB64-86DDFAED4F63' AND [Name] = 'fieldId';

/* Set soft PK for magnetmail.UploadInitialQueueStatus.UploadId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AF7C36FE-7975-43F1-AE08-FE2652FD9A0E' AND [Name] = 'UploadId';

/* Set soft PK for magnetmail.EventSignUp.EventId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '08F43407-9259-4F6C-94BB-F93F8FA9EF9A' AND [Name] = 'EventId';

/* Set soft PK for magnetmail.PaidItem.RMPaidItemReferenceId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '34D417D9-62B5-406C-9056-A2D2B671D026' AND [Name] = 'RMPaidItemReferenceId';

/* Set soft FK for magnetmail.PaidItem.ClientReferenceId → Registrant.ClientReferenceId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '17FF074F-43D5-4B33-B9F3-C1B541F4C3EE',
                                    [RelatedEntityFieldName] = 'ClientReferenceId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '34D417D9-62B5-406C-9056-A2D2B671D026' AND [Name] = 'ClientReferenceId';

/* Set soft PK for magnetmail.Registrant.ClientReferenceId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '17FF074F-43D5-4B33-B9F3-C1B541F4C3EE' AND [Name] = 'ClientReferenceId';

/* Set soft PK for magnetmail.QuestionItem.QuestionItemId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '333BF442-BBC0-475E-9575-A78183922105' AND [Name] = 'QuestionItemId';

/* Set soft PK for magnetmail.UploadJobSettings.GroupId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '857FF20B-05AE-4C35-8AFD-0FF73358F7AB' AND [Name] = 'GroupId';

/* Index for Foreign Keys for email_history */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Histories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key message_id in table email_history
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_email_history_message_id' 
    AND object_id = OBJECT_ID('[magnetmail].[email_history]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_email_history_message_id ON [magnetmail].[email_history] ([message_id]);

/* Index for Foreign Keys for EventSignUp */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sign Ups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for ExtendedField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Extended Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for GroupCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for GroupRecipient */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Recipients
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key RecipientId in table GroupRecipient
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_GroupRecipient_RecipientId' 
    AND object_id = OBJECT_ID('[magnetmail].[GroupRecipient]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_GroupRecipient_RecipientId ON [magnetmail].[GroupRecipient] ([RecipientId]);

/* Base View SQL for Email Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Histories
-- Item: vwEmail_histories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Histories
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  email_history
-----               PRIMARY KEY: message_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwEmail_histories]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwEmail_histories];
GO

CREATE VIEW [magnetmail].[vwEmail_histories]
AS
SELECT
    e.*
FROM
    [magnetmail].[email_history] AS e
GO
GRANT SELECT ON [magnetmail].[vwEmail_histories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Histories
-- Item: Permissions for vwEmail_histories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwEmail_histories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Histories
-- Item: spCreateemail_history
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR email_history
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateemail_history]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateemail_history];
GO

CREATE PROCEDURE [magnetmail].[spCreateemail_history]
    @send_result_Clear bit = 0,
    @send_result nvarchar(255) = NULL,
    @links_Clear bit = 0,
    @links nvarchar(MAX) = NULL,
    @message_name_Clear bit = 0,
    @message_name nvarchar(255) = NULL,
    @open_date_Clear bit = 0,
    @open_date nvarchar(255) = NULL,
    @message_id nvarchar(255) = NULL,
    @sent_date_Clear bit = 0,
    @sent_date nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[email_history]
        (
            [send_result],
                [links],
                [message_name],
                [open_date],
                [sent_date],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [message_id]
        )
    VALUES
        (
            CASE WHEN @send_result_Clear = 1 THEN NULL ELSE ISNULL(@send_result, NULL) END,
                CASE WHEN @links_Clear = 1 THEN NULL ELSE ISNULL(@links, NULL) END,
                CASE WHEN @message_name_Clear = 1 THEN NULL ELSE ISNULL(@message_name, NULL) END,
                CASE WHEN @open_date_Clear = 1 THEN NULL ELSE ISNULL(@open_date, NULL) END,
                CASE WHEN @sent_date_Clear = 1 THEN NULL ELSE ISNULL(@sent_date, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @message_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwEmail_histories] WHERE [message_id] = @message_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateemail_history] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Histories */

GRANT EXECUTE ON [magnetmail].[spCreateemail_history] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Histories
-- Item: spUpdateemail_history
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR email_history
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateemail_history]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateemail_history];
GO

CREATE PROCEDURE [magnetmail].[spUpdateemail_history]
    @send_result_Clear bit = 0,
    @send_result nvarchar(255) = NULL,
    @links_Clear bit = 0,
    @links nvarchar(MAX) = NULL,
    @message_name_Clear bit = 0,
    @message_name nvarchar(255) = NULL,
    @open_date_Clear bit = 0,
    @open_date nvarchar(255) = NULL,
    @message_id nvarchar(255),
    @sent_date_Clear bit = 0,
    @sent_date nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[email_history]
    SET
        [send_result] = CASE WHEN @send_result_Clear = 1 THEN NULL ELSE ISNULL(@send_result, [send_result]) END,
        [links] = CASE WHEN @links_Clear = 1 THEN NULL ELSE ISNULL(@links, [links]) END,
        [message_name] = CASE WHEN @message_name_Clear = 1 THEN NULL ELSE ISNULL(@message_name, [message_name]) END,
        [open_date] = CASE WHEN @open_date_Clear = 1 THEN NULL ELSE ISNULL(@open_date, [open_date]) END,
        [sent_date] = CASE WHEN @sent_date_Clear = 1 THEN NULL ELSE ISNULL(@sent_date, [sent_date]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [message_id] = @message_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwEmail_histories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwEmail_histories]
                                    WHERE
                                        [message_id] = @message_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateemail_history] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the email_history table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateemail_history]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateemail_history];
GO
CREATE TRIGGER [magnetmail].trgUpdateemail_history
ON [magnetmail].[email_history]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[email_history]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[email_history] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[message_id] = I.[message_id];
END;
GO

/* spUpdate Permissions for Email Histories */

GRANT EXECUTE ON [magnetmail].[spUpdateemail_history] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Event Sign Ups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sign Ups
-- Item: vwEventSignUps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Event Sign Ups
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  EventSignUp
-----               PRIMARY KEY: EventId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwEventSignUps]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwEventSignUps];
GO

CREATE VIEW [magnetmail].[vwEventSignUps]
AS
SELECT
    e.*
FROM
    [magnetmail].[EventSignUp] AS e
GO
GRANT SELECT ON [magnetmail].[vwEventSignUps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Event Sign Ups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sign Ups
-- Item: Permissions for vwEventSignUps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwEventSignUps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Event Sign Ups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sign Ups
-- Item: spCreateEventSignUp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventSignUp
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateEventSignUp]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateEventSignUp];
GO

CREATE PROCEDURE [magnetmail].[spCreateEventSignUp]
    @UserId_Clear bit = 0,
    @UserId nvarchar(255) = NULL,
    @PaymentInfo_Clear bit = 0,
    @PaymentInfo nvarchar(MAX) = NULL,
    @PaidItems_Clear bit = 0,
    @PaidItems nvarchar(MAX) = NULL,
    @EventId nvarchar(255) = NULL,
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @Registrants_Clear bit = 0,
    @Registrants nvarchar(MAX) = NULL,
    @IsMultipleRegistration_Clear bit = 0,
    @IsMultipleRegistration nvarchar(255) = NULL,
    @IsSignupModeLive_Clear bit = 0,
    @IsSignupModeLive nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[EventSignUp]
        (
            [UserId],
                [PaymentInfo],
                [PaidItems],
                [LoginId],
                [Registrants],
                [IsMultipleRegistration],
                [IsSignupModeLive],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [EventId]
        )
    VALUES
        (
            CASE WHEN @UserId_Clear = 1 THEN NULL ELSE ISNULL(@UserId, NULL) END,
                CASE WHEN @PaymentInfo_Clear = 1 THEN NULL ELSE ISNULL(@PaymentInfo, NULL) END,
                CASE WHEN @PaidItems_Clear = 1 THEN NULL ELSE ISNULL(@PaidItems, NULL) END,
                CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, NULL) END,
                CASE WHEN @Registrants_Clear = 1 THEN NULL ELSE ISNULL(@Registrants, NULL) END,
                CASE WHEN @IsMultipleRegistration_Clear = 1 THEN NULL ELSE ISNULL(@IsMultipleRegistration, NULL) END,
                CASE WHEN @IsSignupModeLive_Clear = 1 THEN NULL ELSE ISNULL(@IsSignupModeLive, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @EventId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwEventSignUps] WHERE [EventId] = @EventId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateEventSignUp] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Event Sign Ups */

GRANT EXECUTE ON [magnetmail].[spCreateEventSignUp] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Event Sign Ups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sign Ups
-- Item: spUpdateEventSignUp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventSignUp
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateEventSignUp]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateEventSignUp];
GO

CREATE PROCEDURE [magnetmail].[spUpdateEventSignUp]
    @UserId_Clear bit = 0,
    @UserId nvarchar(255) = NULL,
    @PaymentInfo_Clear bit = 0,
    @PaymentInfo nvarchar(MAX) = NULL,
    @PaidItems_Clear bit = 0,
    @PaidItems nvarchar(MAX) = NULL,
    @EventId nvarchar(255),
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @Registrants_Clear bit = 0,
    @Registrants nvarchar(MAX) = NULL,
    @IsMultipleRegistration_Clear bit = 0,
    @IsMultipleRegistration nvarchar(255) = NULL,
    @IsSignupModeLive_Clear bit = 0,
    @IsSignupModeLive nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[EventSignUp]
    SET
        [UserId] = CASE WHEN @UserId_Clear = 1 THEN NULL ELSE ISNULL(@UserId, [UserId]) END,
        [PaymentInfo] = CASE WHEN @PaymentInfo_Clear = 1 THEN NULL ELSE ISNULL(@PaymentInfo, [PaymentInfo]) END,
        [PaidItems] = CASE WHEN @PaidItems_Clear = 1 THEN NULL ELSE ISNULL(@PaidItems, [PaidItems]) END,
        [LoginId] = CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, [LoginId]) END,
        [Registrants] = CASE WHEN @Registrants_Clear = 1 THEN NULL ELSE ISNULL(@Registrants, [Registrants]) END,
        [IsMultipleRegistration] = CASE WHEN @IsMultipleRegistration_Clear = 1 THEN NULL ELSE ISNULL(@IsMultipleRegistration, [IsMultipleRegistration]) END,
        [IsSignupModeLive] = CASE WHEN @IsSignupModeLive_Clear = 1 THEN NULL ELSE ISNULL(@IsSignupModeLive, [IsSignupModeLive]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [EventId] = @EventId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwEventSignUps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwEventSignUps]
                                    WHERE
                                        [EventId] = @EventId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateEventSignUp] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventSignUp table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateEventSignUp]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateEventSignUp];
GO
CREATE TRIGGER [magnetmail].trgUpdateEventSignUp
ON [magnetmail].[EventSignUp]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[EventSignUp]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[EventSignUp] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[EventId] = I.[EventId];
END;
GO

/* spUpdate Permissions for Event Sign Ups */

GRANT EXECUTE ON [magnetmail].[spUpdateEventSignUp] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Extended Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Extended Fields
-- Item: vwExtendedFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Extended Fields
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  ExtendedField
-----               PRIMARY KEY: fieldId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwExtendedFields]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwExtendedFields];
GO

CREATE VIEW [magnetmail].[vwExtendedFields]
AS
SELECT
    e.*
FROM
    [magnetmail].[ExtendedField] AS e
GO
GRANT SELECT ON [magnetmail].[vwExtendedFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Extended Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Extended Fields
-- Item: Permissions for vwExtendedFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwExtendedFields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Extended Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Extended Fields
-- Item: spCreateExtendedField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ExtendedField
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateExtendedField]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateExtendedField];
GO

CREATE PROCEDURE [magnetmail].[spCreateExtendedField]
    @fieldName_Clear bit = 0,
    @fieldName nvarchar(255) = NULL,
    @uploadMappingName_Clear bit = 0,
    @uploadMappingName nvarchar(255) = NULL,
    @fieldId nvarchar(255) = NULL,
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[ExtendedField]
        (
            [fieldName],
                [uploadMappingName],
                [loginId],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [fieldId]
        )
    VALUES
        (
            CASE WHEN @fieldName_Clear = 1 THEN NULL ELSE ISNULL(@fieldName, NULL) END,
                CASE WHEN @uploadMappingName_Clear = 1 THEN NULL ELSE ISNULL(@uploadMappingName, NULL) END,
                CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @fieldId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwExtendedFields] WHERE [fieldId] = @fieldId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateExtendedField] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Extended Fields */

GRANT EXECUTE ON [magnetmail].[spCreateExtendedField] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Extended Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Extended Fields
-- Item: spUpdateExtendedField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ExtendedField
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateExtendedField]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateExtendedField];
GO

CREATE PROCEDURE [magnetmail].[spUpdateExtendedField]
    @fieldName_Clear bit = 0,
    @fieldName nvarchar(255) = NULL,
    @uploadMappingName_Clear bit = 0,
    @uploadMappingName nvarchar(255) = NULL,
    @fieldId nvarchar(255),
    @loginId_Clear bit = 0,
    @loginId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[ExtendedField]
    SET
        [fieldName] = CASE WHEN @fieldName_Clear = 1 THEN NULL ELSE ISNULL(@fieldName, [fieldName]) END,
        [uploadMappingName] = CASE WHEN @uploadMappingName_Clear = 1 THEN NULL ELSE ISNULL(@uploadMappingName, [uploadMappingName]) END,
        [loginId] = CASE WHEN @loginId_Clear = 1 THEN NULL ELSE ISNULL(@loginId, [loginId]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [fieldId] = @fieldId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwExtendedFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwExtendedFields]
                                    WHERE
                                        [fieldId] = @fieldId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateExtendedField] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ExtendedField table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateExtendedField]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateExtendedField];
GO
CREATE TRIGGER [magnetmail].trgUpdateExtendedField
ON [magnetmail].[ExtendedField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[ExtendedField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[ExtendedField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[fieldId] = I.[fieldId];
END;
GO

/* spUpdate Permissions for Extended Fields */

GRANT EXECUTE ON [magnetmail].[spUpdateExtendedField] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Group Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Categories
-- Item: vwGroupCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Group Categories
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  GroupCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwGroupCategories]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwGroupCategories];
GO

CREATE VIEW [magnetmail].[vwGroupCategories]
AS
SELECT
    g.*
FROM
    [magnetmail].[GroupCategory] AS g
GO
GRANT SELECT ON [magnetmail].[vwGroupCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Group Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Categories
-- Item: Permissions for vwGroupCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwGroupCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Group Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Categories
-- Item: spCreateGroupCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GroupCategory
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateGroupCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateGroupCategory];
GO

CREATE PROCEDURE [magnetmail].[spCreateGroupCategory]
    @CategoryName_Clear bit = 0,
    @CategoryName nvarchar(255) = NULL,
    @DateCreated_Clear bit = 0,
    @DateCreated nvarchar(255) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @ID nvarchar(255) = NULL,
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[GroupCategory]
        (
            [CategoryName],
                [DateCreated],
                [Status],
                [MailUserId],
                [LoginId],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [ID]
        )
    VALUES
        (
            CASE WHEN @CategoryName_Clear = 1 THEN NULL ELSE ISNULL(@CategoryName, NULL) END,
                CASE WHEN @DateCreated_Clear = 1 THEN NULL ELSE ISNULL(@DateCreated, NULL) END,
                CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, NULL) END,
                CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @ID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwGroupCategories] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateGroupCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Group Categories */

GRANT EXECUTE ON [magnetmail].[spCreateGroupCategory] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Group Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Categories
-- Item: spUpdateGroupCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GroupCategory
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateGroupCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateGroupCategory];
GO

CREATE PROCEDURE [magnetmail].[spUpdateGroupCategory]
    @CategoryName_Clear bit = 0,
    @CategoryName nvarchar(255) = NULL,
    @DateCreated_Clear bit = 0,
    @DateCreated nvarchar(255) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @ID nvarchar(255),
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[GroupCategory]
    SET
        [CategoryName] = CASE WHEN @CategoryName_Clear = 1 THEN NULL ELSE ISNULL(@CategoryName, [CategoryName]) END,
        [DateCreated] = CASE WHEN @DateCreated_Clear = 1 THEN NULL ELSE ISNULL(@DateCreated, [DateCreated]) END,
        [Status] = CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, [Status]) END,
        [MailUserId] = CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, [MailUserId]) END,
        [LoginId] = CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, [LoginId]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwGroupCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwGroupCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateGroupCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GroupCategory table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateGroupCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateGroupCategory];
GO
CREATE TRIGGER [magnetmail].trgUpdateGroupCategory
ON [magnetmail].[GroupCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[GroupCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[GroupCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Group Categories */

GRANT EXECUTE ON [magnetmail].[spUpdateGroupCategory] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Group Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Recipients
-- Item: vwGroupRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Group Recipients
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  GroupRecipient
-----               PRIMARY KEY: RecipientId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwGroupRecipients]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwGroupRecipients];
GO

CREATE VIEW [magnetmail].[vwGroupRecipients]
AS
SELECT
    g.*
FROM
    [magnetmail].[GroupRecipient] AS g
GO
GRANT SELECT ON [magnetmail].[vwGroupRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Group Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Recipients
-- Item: Permissions for vwGroupRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwGroupRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Group Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Recipients
-- Item: spCreateGroupRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR GroupRecipient
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateGroupRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateGroupRecipient];
GO

CREATE PROCEDURE [magnetmail].[spCreateGroupRecipient]
    @CustomMemberId_Clear bit = 0,
    @CustomMemberId nvarchar(255) = NULL,
    @RecipientId nvarchar(255) = NULL,
    @EmailId_Clear bit = 0,
    @EmailId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[GroupRecipient]
        (
            [CustomMemberId],
                [EmailId],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [RecipientId]
        )
    VALUES
        (
            CASE WHEN @CustomMemberId_Clear = 1 THEN NULL ELSE ISNULL(@CustomMemberId, NULL) END,
                CASE WHEN @EmailId_Clear = 1 THEN NULL ELSE ISNULL(@EmailId, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @RecipientId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwGroupRecipients] WHERE [RecipientId] = @RecipientId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateGroupRecipient] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Group Recipients */

GRANT EXECUTE ON [magnetmail].[spCreateGroupRecipient] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Group Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Recipients
-- Item: spUpdateGroupRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR GroupRecipient
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateGroupRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateGroupRecipient];
GO

CREATE PROCEDURE [magnetmail].[spUpdateGroupRecipient]
    @CustomMemberId_Clear bit = 0,
    @CustomMemberId nvarchar(255) = NULL,
    @RecipientId nvarchar(255),
    @EmailId_Clear bit = 0,
    @EmailId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[GroupRecipient]
    SET
        [CustomMemberId] = CASE WHEN @CustomMemberId_Clear = 1 THEN NULL ELSE ISNULL(@CustomMemberId, [CustomMemberId]) END,
        [EmailId] = CASE WHEN @EmailId_Clear = 1 THEN NULL ELSE ISNULL(@EmailId, [EmailId]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [RecipientId] = @RecipientId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwGroupRecipients] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwGroupRecipients]
                                    WHERE
                                        [RecipientId] = @RecipientId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateGroupRecipient] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the GroupRecipient table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateGroupRecipient]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateGroupRecipient];
GO
CREATE TRIGGER [magnetmail].trgUpdateGroupRecipient
ON [magnetmail].[GroupRecipient]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[GroupRecipient]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[GroupRecipient] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[RecipientId] = I.[RecipientId];
END;
GO

/* spUpdate Permissions for Group Recipients */

GRANT EXECUTE ON [magnetmail].[spUpdateGroupRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Histories
-- Item: spDeleteemail_history
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR email_history
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteemail_history]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteemail_history];
GO

CREATE PROCEDURE [magnetmail].[spDeleteemail_history]
    @message_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[email_history]
    WHERE
        [message_id] = @message_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [message_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @message_id AS [message_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteemail_history] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Histories */

GRANT EXECUTE ON [magnetmail].[spDeleteemail_history] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Event Sign Ups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Event Sign Ups
-- Item: spDeleteEventSignUp
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventSignUp
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteEventSignUp]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteEventSignUp];
GO

CREATE PROCEDURE [magnetmail].[spDeleteEventSignUp]
    @EventId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[EventSignUp]
    WHERE
        [EventId] = @EventId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [EventId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @EventId AS [EventId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteEventSignUp] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Event Sign Ups */

GRANT EXECUTE ON [magnetmail].[spDeleteEventSignUp] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Extended Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Extended Fields
-- Item: spDeleteExtendedField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ExtendedField
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteExtendedField]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteExtendedField];
GO

CREATE PROCEDURE [magnetmail].[spDeleteExtendedField]
    @fieldId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[ExtendedField]
    WHERE
        [fieldId] = @fieldId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [fieldId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @fieldId AS [fieldId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteExtendedField] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Extended Fields */

GRANT EXECUTE ON [magnetmail].[spDeleteExtendedField] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Group Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Categories
-- Item: spDeleteGroupCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GroupCategory
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteGroupCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteGroupCategory];
GO

CREATE PROCEDURE [magnetmail].[spDeleteGroupCategory]
    @ID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[GroupCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteGroupCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Group Categories */

GRANT EXECUTE ON [magnetmail].[spDeleteGroupCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Group Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Group Recipients
-- Item: spDeleteGroupRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR GroupRecipient
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteGroupRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteGroupRecipient];
GO

CREATE PROCEDURE [magnetmail].[spDeleteGroupRecipient]
    @RecipientId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[GroupRecipient]
    WHERE
        [RecipientId] = @RecipientId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [RecipientId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @RecipientId AS [RecipientId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteGroupRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Group Recipients */

GRANT EXECUTE ON [magnetmail].[spDeleteGroupRecipient] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for group */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for JobToGroup */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Job To Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key group_id in table JobToGroup
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_JobToGroup_group_id' 
    AND object_id = OBJECT_ID('[magnetmail].[JobToGroup]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_JobToGroup_group_id ON [magnetmail].[JobToGroup] ([group_id]);

/* Index for Foreign Keys for Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for link */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links__magnetmail
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for MagnetMailQueries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Magnet Mail Queries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: vwGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Groups
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  group
-----               PRIMARY KEY: group_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwGroups]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwGroups];
GO

CREATE VIEW [magnetmail].[vwGroups]
AS
SELECT
    g.*
FROM
    [magnetmail].[group] AS g
GO
GRANT SELECT ON [magnetmail].[vwGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: Permissions for vwGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: spCreategroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR group
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreategroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreategroup];
GO

CREATE PROCEDURE [magnetmail].[spCreategroup]
    @subscription_group_Clear bit = 0,
    @subscription_group nvarchar(255) = NULL,
    @group_name_Clear bit = 0,
    @group_name nvarchar(255) = NULL,
    @group_created_Clear bit = 0,
    @group_created nvarchar(255) = NULL,
    @last_updated_date_Clear bit = 0,
    @last_updated_date nvarchar(255) = NULL,
    @display_status_Clear bit = 0,
    @display_status nvarchar(255) = NULL,
    @last_updated_loginid_Clear bit = 0,
    @last_updated_loginid nvarchar(255) = NULL,
    @group_id nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[group]
        (
            [subscription_group],
                [group_name],
                [group_created],
                [last_updated_date],
                [display_status],
                [last_updated_loginid],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [group_id]
        )
    VALUES
        (
            CASE WHEN @subscription_group_Clear = 1 THEN NULL ELSE ISNULL(@subscription_group, NULL) END,
                CASE WHEN @group_name_Clear = 1 THEN NULL ELSE ISNULL(@group_name, NULL) END,
                CASE WHEN @group_created_Clear = 1 THEN NULL ELSE ISNULL(@group_created, NULL) END,
                CASE WHEN @last_updated_date_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_date, NULL) END,
                CASE WHEN @display_status_Clear = 1 THEN NULL ELSE ISNULL(@display_status, NULL) END,
                CASE WHEN @last_updated_loginid_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_loginid, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @group_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwGroups] WHERE [group_id] = @group_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreategroup] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Groups */

GRANT EXECUTE ON [magnetmail].[spCreategroup] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: spUpdategroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR group
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdategroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdategroup];
GO

CREATE PROCEDURE [magnetmail].[spUpdategroup]
    @subscription_group_Clear bit = 0,
    @subscription_group nvarchar(255) = NULL,
    @group_name_Clear bit = 0,
    @group_name nvarchar(255) = NULL,
    @group_created_Clear bit = 0,
    @group_created nvarchar(255) = NULL,
    @last_updated_date_Clear bit = 0,
    @last_updated_date nvarchar(255) = NULL,
    @display_status_Clear bit = 0,
    @display_status nvarchar(255) = NULL,
    @last_updated_loginid_Clear bit = 0,
    @last_updated_loginid nvarchar(255) = NULL,
    @group_id nvarchar(255),
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[group]
    SET
        [subscription_group] = CASE WHEN @subscription_group_Clear = 1 THEN NULL ELSE ISNULL(@subscription_group, [subscription_group]) END,
        [group_name] = CASE WHEN @group_name_Clear = 1 THEN NULL ELSE ISNULL(@group_name, [group_name]) END,
        [group_created] = CASE WHEN @group_created_Clear = 1 THEN NULL ELSE ISNULL(@group_created, [group_created]) END,
        [last_updated_date] = CASE WHEN @last_updated_date_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_date, [last_updated_date]) END,
        [display_status] = CASE WHEN @display_status_Clear = 1 THEN NULL ELSE ISNULL(@display_status, [display_status]) END,
        [last_updated_loginid] = CASE WHEN @last_updated_loginid_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_loginid, [last_updated_loginid]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [group_id] = @group_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwGroups]
                                    WHERE
                                        [group_id] = @group_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdategroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the group table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdategroup]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdategroup];
GO
CREATE TRIGGER [magnetmail].trgUpdategroup
ON [magnetmail].[group]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[group]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[group] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[group_id] = I.[group_id];
END;
GO

/* spUpdate Permissions for Groups */

GRANT EXECUTE ON [magnetmail].[spUpdategroup] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Job To Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Job To Groups
-- Item: vwJobToGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Job To Groups
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  JobToGroup
-----               PRIMARY KEY: group_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwJobToGroups]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwJobToGroups];
GO

CREATE VIEW [magnetmail].[vwJobToGroups]
AS
SELECT
    j.*
FROM
    [magnetmail].[JobToGroup] AS j
GO
GRANT SELECT ON [magnetmail].[vwJobToGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Job To Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Job To Groups
-- Item: Permissions for vwJobToGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwJobToGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Job To Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Job To Groups
-- Item: spCreateJobToGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR JobToGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateJobToGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateJobToGroup];
GO

CREATE PROCEDURE [magnetmail].[spCreateJobToGroup]
    @sent_date_Clear bit = 0,
    @sent_date nvarchar(255) = NULL,
    @group_name_Clear bit = 0,
    @group_name nvarchar(255) = NULL,
    @group_id nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[JobToGroup]
        (
            [sent_date],
                [group_name],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [group_id]
        )
    VALUES
        (
            CASE WHEN @sent_date_Clear = 1 THEN NULL ELSE ISNULL(@sent_date, NULL) END,
                CASE WHEN @group_name_Clear = 1 THEN NULL ELSE ISNULL(@group_name, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @group_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwJobToGroups] WHERE [group_id] = @group_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateJobToGroup] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Job To Groups */

GRANT EXECUTE ON [magnetmail].[spCreateJobToGroup] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Job To Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Job To Groups
-- Item: spUpdateJobToGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR JobToGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateJobToGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateJobToGroup];
GO

CREATE PROCEDURE [magnetmail].[spUpdateJobToGroup]
    @sent_date_Clear bit = 0,
    @sent_date nvarchar(255) = NULL,
    @group_name_Clear bit = 0,
    @group_name nvarchar(255) = NULL,
    @group_id nvarchar(255),
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[JobToGroup]
    SET
        [sent_date] = CASE WHEN @sent_date_Clear = 1 THEN NULL ELSE ISNULL(@sent_date, [sent_date]) END,
        [group_name] = CASE WHEN @group_name_Clear = 1 THEN NULL ELSE ISNULL(@group_name, [group_name]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [group_id] = @group_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwJobToGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwJobToGroups]
                                    WHERE
                                        [group_id] = @group_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateJobToGroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the JobToGroup table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateJobToGroup]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateJobToGroup];
GO
CREATE TRIGGER [magnetmail].trgUpdateJobToGroup
ON [magnetmail].[JobToGroup]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[JobToGroup]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[JobToGroup] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[group_id] = I.[group_id];
END;
GO

/* spUpdate Permissions for Job To Groups */

GRANT EXECUTE ON [magnetmail].[spUpdateJobToGroup] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links
-- Item: vwLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Links
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  Links
-----               PRIMARY KEY: linkid
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwLinks]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwLinks];
GO

CREATE VIEW [magnetmail].[vwLinks]
AS
SELECT
    l.*
FROM
    [magnetmail].[Links] AS l
GO
GRANT SELECT ON [magnetmail].[vwLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links
-- Item: Permissions for vwLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links
-- Item: spCreateLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Links
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateLinks]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateLinks];
GO

CREATE PROCEDURE [magnetmail].[spCreateLinks]
    @link_clicks_Clear bit = 0,
    @link_clicks nvarchar(255) = NULL,
    @link_type_Clear bit = 0,
    @link_type nvarchar(255) = NULL,
    @link_url_Clear bit = 0,
    @link_url nvarchar(255) = NULL,
    @linkid nvarchar(255) = NULL,
    @link_text_Clear bit = 0,
    @link_text nvarchar(255) = NULL,
    @link_index_Clear bit = 0,
    @link_index nvarchar(255) = NULL,
    @link_label_Clear bit = 0,
    @link_label nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[Links]
        (
            [link_clicks],
                [link_type],
                [link_url],
                [link_text],
                [link_index],
                [link_label],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [linkid]
        )
    VALUES
        (
            CASE WHEN @link_clicks_Clear = 1 THEN NULL ELSE ISNULL(@link_clicks, NULL) END,
                CASE WHEN @link_type_Clear = 1 THEN NULL ELSE ISNULL(@link_type, NULL) END,
                CASE WHEN @link_url_Clear = 1 THEN NULL ELSE ISNULL(@link_url, NULL) END,
                CASE WHEN @link_text_Clear = 1 THEN NULL ELSE ISNULL(@link_text, NULL) END,
                CASE WHEN @link_index_Clear = 1 THEN NULL ELSE ISNULL(@link_index, NULL) END,
                CASE WHEN @link_label_Clear = 1 THEN NULL ELSE ISNULL(@link_label, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @linkid
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwLinks] WHERE [linkid] = @linkid
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateLinks] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Links */

GRANT EXECUTE ON [magnetmail].[spCreateLinks] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links
-- Item: spUpdateLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Links
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateLinks]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateLinks];
GO

CREATE PROCEDURE [magnetmail].[spUpdateLinks]
    @link_clicks_Clear bit = 0,
    @link_clicks nvarchar(255) = NULL,
    @link_type_Clear bit = 0,
    @link_type nvarchar(255) = NULL,
    @link_url_Clear bit = 0,
    @link_url nvarchar(255) = NULL,
    @linkid nvarchar(255),
    @link_text_Clear bit = 0,
    @link_text nvarchar(255) = NULL,
    @link_index_Clear bit = 0,
    @link_index nvarchar(255) = NULL,
    @link_label_Clear bit = 0,
    @link_label nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Links]
    SET
        [link_clicks] = CASE WHEN @link_clicks_Clear = 1 THEN NULL ELSE ISNULL(@link_clicks, [link_clicks]) END,
        [link_type] = CASE WHEN @link_type_Clear = 1 THEN NULL ELSE ISNULL(@link_type, [link_type]) END,
        [link_url] = CASE WHEN @link_url_Clear = 1 THEN NULL ELSE ISNULL(@link_url, [link_url]) END,
        [link_text] = CASE WHEN @link_text_Clear = 1 THEN NULL ELSE ISNULL(@link_text, [link_text]) END,
        [link_index] = CASE WHEN @link_index_Clear = 1 THEN NULL ELSE ISNULL(@link_index, [link_index]) END,
        [link_label] = CASE WHEN @link_label_Clear = 1 THEN NULL ELSE ISNULL(@link_label, [link_label]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [linkid] = @linkid

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwLinks]
                                    WHERE
                                        [linkid] = @linkid
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateLinks] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Links table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateLinks]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateLinks];
GO
CREATE TRIGGER [magnetmail].trgUpdateLinks
ON [magnetmail].[Links]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Links]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[Links] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[linkid] = I.[linkid];
END;
GO

/* spUpdate Permissions for Links */

GRANT EXECUTE ON [magnetmail].[spUpdateLinks] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Links__magnetmail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links__magnetmail
-- Item: vwLinks__magnetmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Links__magnetmail
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  link
-----               PRIMARY KEY: link_url_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwLinks__magnetmail]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwLinks__magnetmail];
GO

CREATE VIEW [magnetmail].[vwLinks__magnetmail]
AS
SELECT
    l.*
FROM
    [magnetmail].[link] AS l
GO
GRANT SELECT ON [magnetmail].[vwLinks__magnetmail] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Links__magnetmail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links__magnetmail
-- Item: Permissions for vwLinks__magnetmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwLinks__magnetmail] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Links__magnetmail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links__magnetmail
-- Item: spCreatelink__magnetmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR link
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreatelink__magnetmail]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreatelink__magnetmail];
GO

CREATE PROCEDURE [magnetmail].[spCreatelink__magnetmail]
    @link_url_id nvarchar(255) = NULL,
    @website_links_Clear bit = 0,
    @website_links nvarchar(MAX) = NULL,
    @link_url_Clear bit = 0,
    @link_url nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[link]
        (
            [website_links],
                [link_url],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [link_url_id]
        )
    VALUES
        (
            CASE WHEN @website_links_Clear = 1 THEN NULL ELSE ISNULL(@website_links, NULL) END,
                CASE WHEN @link_url_Clear = 1 THEN NULL ELSE ISNULL(@link_url, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @link_url_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwLinks__magnetmail] WHERE [link_url_id] = @link_url_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreatelink__magnetmail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Links__magnetmail */

GRANT EXECUTE ON [magnetmail].[spCreatelink__magnetmail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Links__magnetmail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links__magnetmail
-- Item: spUpdatelink__magnetmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR link
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdatelink__magnetmail]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdatelink__magnetmail];
GO

CREATE PROCEDURE [magnetmail].[spUpdatelink__magnetmail]
    @link_url_id nvarchar(255),
    @website_links_Clear bit = 0,
    @website_links nvarchar(MAX) = NULL,
    @link_url_Clear bit = 0,
    @link_url nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[link]
    SET
        [website_links] = CASE WHEN @website_links_Clear = 1 THEN NULL ELSE ISNULL(@website_links, [website_links]) END,
        [link_url] = CASE WHEN @link_url_Clear = 1 THEN NULL ELSE ISNULL(@link_url, [link_url]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [link_url_id] = @link_url_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwLinks__magnetmail] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwLinks__magnetmail]
                                    WHERE
                                        [link_url_id] = @link_url_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdatelink__magnetmail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the link table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdatelink__magnetmail]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdatelink__magnetmail];
GO
CREATE TRIGGER [magnetmail].trgUpdatelink__magnetmail
ON [magnetmail].[link]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[link]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[link] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[link_url_id] = I.[link_url_id];
END;
GO

/* spUpdate Permissions for Links__magnetmail */

GRANT EXECUTE ON [magnetmail].[spUpdatelink__magnetmail] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Magnet Mail Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Magnet Mail Queries
-- Item: vwMagnetMailQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Magnet Mail Queries
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  MagnetMailQueries
-----               PRIMARY KEY: Search_Id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwMagnetMailQueries]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwMagnetMailQueries];
GO

CREATE VIEW [magnetmail].[vwMagnetMailQueries]
AS
SELECT
    m.*
FROM
    [magnetmail].[MagnetMailQueries] AS m
GO
GRANT SELECT ON [magnetmail].[vwMagnetMailQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Magnet Mail Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Magnet Mail Queries
-- Item: Permissions for vwMagnetMailQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwMagnetMailQueries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Magnet Mail Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Magnet Mail Queries
-- Item: spCreateMagnetMailQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MagnetMailQueries
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateMagnetMailQueries]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateMagnetMailQueries];
GO

CREATE PROCEDURE [magnetmail].[spCreateMagnetMailQueries]
    @Search_Name_Clear bit = 0,
    @Search_Name nvarchar(255) = NULL,
    @Search_Id nvarchar(255) = NULL,
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @Create_Date_Clear bit = 0,
    @Create_Date nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[MagnetMailQueries]
        (
            [Search_Name],
                [LoginId],
                [Create_Date],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [Search_Id]
        )
    VALUES
        (
            CASE WHEN @Search_Name_Clear = 1 THEN NULL ELSE ISNULL(@Search_Name, NULL) END,
                CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, NULL) END,
                CASE WHEN @Create_Date_Clear = 1 THEN NULL ELSE ISNULL(@Create_Date, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @Search_Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwMagnetMailQueries] WHERE [Search_Id] = @Search_Id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateMagnetMailQueries] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Magnet Mail Queries */

GRANT EXECUTE ON [magnetmail].[spCreateMagnetMailQueries] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Magnet Mail Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Magnet Mail Queries
-- Item: spUpdateMagnetMailQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MagnetMailQueries
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateMagnetMailQueries]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateMagnetMailQueries];
GO

CREATE PROCEDURE [magnetmail].[spUpdateMagnetMailQueries]
    @Search_Name_Clear bit = 0,
    @Search_Name nvarchar(255) = NULL,
    @Search_Id nvarchar(255),
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @Create_Date_Clear bit = 0,
    @Create_Date nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MagnetMailQueries]
    SET
        [Search_Name] = CASE WHEN @Search_Name_Clear = 1 THEN NULL ELSE ISNULL(@Search_Name, [Search_Name]) END,
        [LoginId] = CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, [LoginId]) END,
        [Create_Date] = CASE WHEN @Create_Date_Clear = 1 THEN NULL ELSE ISNULL(@Create_Date, [Create_Date]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [Search_Id] = @Search_Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwMagnetMailQueries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwMagnetMailQueries]
                                    WHERE
                                        [Search_Id] = @Search_Id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateMagnetMailQueries] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagnetMailQueries table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateMagnetMailQueries]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateMagnetMailQueries];
GO
CREATE TRIGGER [magnetmail].trgUpdateMagnetMailQueries
ON [magnetmail].[MagnetMailQueries]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MagnetMailQueries]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[MagnetMailQueries] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Search_Id] = I.[Search_Id];
END;
GO

/* spUpdate Permissions for Magnet Mail Queries */

GRANT EXECUTE ON [magnetmail].[spUpdateMagnetMailQueries] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Groups
-- Item: spDeletegroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR group
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeletegroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeletegroup];
GO

CREATE PROCEDURE [magnetmail].[spDeletegroup]
    @group_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[group]
    WHERE
        [group_id] = @group_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [group_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @group_id AS [group_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeletegroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Groups */

GRANT EXECUTE ON [magnetmail].[spDeletegroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Job To Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Job To Groups
-- Item: spDeleteJobToGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR JobToGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteJobToGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteJobToGroup];
GO

CREATE PROCEDURE [magnetmail].[spDeleteJobToGroup]
    @group_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[JobToGroup]
    WHERE
        [group_id] = @group_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [group_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @group_id AS [group_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteJobToGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Job To Groups */

GRANT EXECUTE ON [magnetmail].[spDeleteJobToGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links
-- Item: spDeleteLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Links
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteLinks]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteLinks];
GO

CREATE PROCEDURE [magnetmail].[spDeleteLinks]
    @linkid nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[Links]
    WHERE
        [linkid] = @linkid


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [linkid] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @linkid AS [linkid] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteLinks] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Links */

GRANT EXECUTE ON [magnetmail].[spDeleteLinks] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Links__magnetmail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Links__magnetmail
-- Item: spDeletelink__magnetmail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR link
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeletelink__magnetmail]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeletelink__magnetmail];
GO

CREATE PROCEDURE [magnetmail].[spDeletelink__magnetmail]
    @link_url_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[link]
    WHERE
        [link_url_id] = @link_url_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [link_url_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @link_url_id AS [link_url_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeletelink__magnetmail] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Links__magnetmail */

GRANT EXECUTE ON [magnetmail].[spDeletelink__magnetmail] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Magnet Mail Queries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Magnet Mail Queries
-- Item: spDeleteMagnetMailQueries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MagnetMailQueries
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteMagnetMailQueries]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteMagnetMailQueries];
GO

CREATE PROCEDURE [magnetmail].[spDeleteMagnetMailQueries]
    @Search_Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[MagnetMailQueries]
    WHERE
        [Search_Id] = @Search_Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Search_Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Search_Id AS [Search_Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteMagnetMailQueries] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Magnet Mail Queries */

GRANT EXECUTE ON [magnetmail].[spDeleteMagnetMailQueries] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for MailRecipientGroup */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Mail Recipient Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key group_id in table MailRecipientGroup
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MailRecipientGroup_group_id' 
    AND object_id = OBJECT_ID('[magnetmail].[MailRecipientGroup]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MailRecipientGroup_group_id ON [magnetmail].[MailRecipientGroup] ([group_id]);

/* Index for Foreign Keys for MessageCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for MessageDetails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Message */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Messages
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Mail Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Mail Recipient Groups
-- Item: vwMailRecipientGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Mail Recipient Groups
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  MailRecipientGroup
-----               PRIMARY KEY: group_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwMailRecipientGroups]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwMailRecipientGroups];
GO

CREATE VIEW [magnetmail].[vwMailRecipientGroups]
AS
SELECT
    m.*
FROM
    [magnetmail].[MailRecipientGroup] AS m
GO
GRANT SELECT ON [magnetmail].[vwMailRecipientGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Mail Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Mail Recipient Groups
-- Item: Permissions for vwMailRecipientGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwMailRecipientGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Mail Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Mail Recipient Groups
-- Item: spCreateMailRecipientGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MailRecipientGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateMailRecipientGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateMailRecipientGroup];
GO

CREATE PROCEDURE [magnetmail].[spCreateMailRecipientGroup]
    @TotalEmailAndFaxSuppressed_Clear bit = 0,
    @TotalEmailAndFaxSuppressed nvarchar(255) = NULL,
    @group_name_Clear bit = 0,
    @group_name nvarchar(255) = NULL,
    @last_updated_date_Clear bit = 0,
    @last_updated_date nvarchar(255) = NULL,
    @group_created_Clear bit = 0,
    @group_created nvarchar(255) = NULL,
    @TotalFaxSuppressed_Clear bit = 0,
    @TotalFaxSuppressed nvarchar(255) = NULL,
    @display_status_Clear bit = 0,
    @display_status nvarchar(255) = NULL,
    @TotalUnsubscribed_Clear bit = 0,
    @TotalUnsubscribed nvarchar(255) = NULL,
    @TotalInGroup_Clear bit = 0,
    @TotalInGroup nvarchar(255) = NULL,
    @subscription_group_Clear bit = 0,
    @subscription_group nvarchar(255) = NULL,
    @last_updated_loginid_Clear bit = 0,
    @last_updated_loginid nvarchar(255) = NULL,
    @TotalEmailSuppressed_Clear bit = 0,
    @TotalEmailSuppressed nvarchar(255) = NULL,
    @group_id nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[MailRecipientGroup]
        (
            [TotalEmailAndFaxSuppressed],
                [group_name],
                [last_updated_date],
                [group_created],
                [TotalFaxSuppressed],
                [display_status],
                [TotalUnsubscribed],
                [TotalInGroup],
                [subscription_group],
                [last_updated_loginid],
                [TotalEmailSuppressed],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [group_id]
        )
    VALUES
        (
            CASE WHEN @TotalEmailAndFaxSuppressed_Clear = 1 THEN NULL ELSE ISNULL(@TotalEmailAndFaxSuppressed, NULL) END,
                CASE WHEN @group_name_Clear = 1 THEN NULL ELSE ISNULL(@group_name, NULL) END,
                CASE WHEN @last_updated_date_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_date, NULL) END,
                CASE WHEN @group_created_Clear = 1 THEN NULL ELSE ISNULL(@group_created, NULL) END,
                CASE WHEN @TotalFaxSuppressed_Clear = 1 THEN NULL ELSE ISNULL(@TotalFaxSuppressed, NULL) END,
                CASE WHEN @display_status_Clear = 1 THEN NULL ELSE ISNULL(@display_status, NULL) END,
                CASE WHEN @TotalUnsubscribed_Clear = 1 THEN NULL ELSE ISNULL(@TotalUnsubscribed, NULL) END,
                CASE WHEN @TotalInGroup_Clear = 1 THEN NULL ELSE ISNULL(@TotalInGroup, NULL) END,
                CASE WHEN @subscription_group_Clear = 1 THEN NULL ELSE ISNULL(@subscription_group, NULL) END,
                CASE WHEN @last_updated_loginid_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_loginid, NULL) END,
                CASE WHEN @TotalEmailSuppressed_Clear = 1 THEN NULL ELSE ISNULL(@TotalEmailSuppressed, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @group_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwMailRecipientGroups] WHERE [group_id] = @group_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateMailRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Mail Recipient Groups */

GRANT EXECUTE ON [magnetmail].[spCreateMailRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Mail Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Mail Recipient Groups
-- Item: spUpdateMailRecipientGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MailRecipientGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateMailRecipientGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateMailRecipientGroup];
GO

CREATE PROCEDURE [magnetmail].[spUpdateMailRecipientGroup]
    @TotalEmailAndFaxSuppressed_Clear bit = 0,
    @TotalEmailAndFaxSuppressed nvarchar(255) = NULL,
    @group_name_Clear bit = 0,
    @group_name nvarchar(255) = NULL,
    @last_updated_date_Clear bit = 0,
    @last_updated_date nvarchar(255) = NULL,
    @group_created_Clear bit = 0,
    @group_created nvarchar(255) = NULL,
    @TotalFaxSuppressed_Clear bit = 0,
    @TotalFaxSuppressed nvarchar(255) = NULL,
    @display_status_Clear bit = 0,
    @display_status nvarchar(255) = NULL,
    @TotalUnsubscribed_Clear bit = 0,
    @TotalUnsubscribed nvarchar(255) = NULL,
    @TotalInGroup_Clear bit = 0,
    @TotalInGroup nvarchar(255) = NULL,
    @subscription_group_Clear bit = 0,
    @subscription_group nvarchar(255) = NULL,
    @last_updated_loginid_Clear bit = 0,
    @last_updated_loginid nvarchar(255) = NULL,
    @TotalEmailSuppressed_Clear bit = 0,
    @TotalEmailSuppressed nvarchar(255) = NULL,
    @group_id nvarchar(255),
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MailRecipientGroup]
    SET
        [TotalEmailAndFaxSuppressed] = CASE WHEN @TotalEmailAndFaxSuppressed_Clear = 1 THEN NULL ELSE ISNULL(@TotalEmailAndFaxSuppressed, [TotalEmailAndFaxSuppressed]) END,
        [group_name] = CASE WHEN @group_name_Clear = 1 THEN NULL ELSE ISNULL(@group_name, [group_name]) END,
        [last_updated_date] = CASE WHEN @last_updated_date_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_date, [last_updated_date]) END,
        [group_created] = CASE WHEN @group_created_Clear = 1 THEN NULL ELSE ISNULL(@group_created, [group_created]) END,
        [TotalFaxSuppressed] = CASE WHEN @TotalFaxSuppressed_Clear = 1 THEN NULL ELSE ISNULL(@TotalFaxSuppressed, [TotalFaxSuppressed]) END,
        [display_status] = CASE WHEN @display_status_Clear = 1 THEN NULL ELSE ISNULL(@display_status, [display_status]) END,
        [TotalUnsubscribed] = CASE WHEN @TotalUnsubscribed_Clear = 1 THEN NULL ELSE ISNULL(@TotalUnsubscribed, [TotalUnsubscribed]) END,
        [TotalInGroup] = CASE WHEN @TotalInGroup_Clear = 1 THEN NULL ELSE ISNULL(@TotalInGroup, [TotalInGroup]) END,
        [subscription_group] = CASE WHEN @subscription_group_Clear = 1 THEN NULL ELSE ISNULL(@subscription_group, [subscription_group]) END,
        [last_updated_loginid] = CASE WHEN @last_updated_loginid_Clear = 1 THEN NULL ELSE ISNULL(@last_updated_loginid, [last_updated_loginid]) END,
        [TotalEmailSuppressed] = CASE WHEN @TotalEmailSuppressed_Clear = 1 THEN NULL ELSE ISNULL(@TotalEmailSuppressed, [TotalEmailSuppressed]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [group_id] = @group_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwMailRecipientGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwMailRecipientGroups]
                                    WHERE
                                        [group_id] = @group_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateMailRecipientGroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MailRecipientGroup table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateMailRecipientGroup]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateMailRecipientGroup];
GO
CREATE TRIGGER [magnetmail].trgUpdateMailRecipientGroup
ON [magnetmail].[MailRecipientGroup]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MailRecipientGroup]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[MailRecipientGroup] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[group_id] = I.[group_id];
END;
GO

/* spUpdate Permissions for Mail Recipient Groups */

GRANT EXECUTE ON [magnetmail].[spUpdateMailRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Message Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Categories
-- Item: vwMessageCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Message Categories
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  MessageCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwMessageCategories]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwMessageCategories];
GO

CREATE VIEW [magnetmail].[vwMessageCategories]
AS
SELECT
    m.*
FROM
    [magnetmail].[MessageCategory] AS m
GO
GRANT SELECT ON [magnetmail].[vwMessageCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Message Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Categories
-- Item: Permissions for vwMessageCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwMessageCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Message Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Categories
-- Item: spCreateMessageCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MessageCategory
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateMessageCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateMessageCategory];
GO

CREATE PROCEDURE [magnetmail].[spCreateMessageCategory]
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @ID nvarchar(255) = NULL,
    @DateCreated_Clear bit = 0,
    @DateCreated nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[MessageCategory]
        (
            [LoginId],
                [DateCreated],
                [Name],
                [MailUserId],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [ID]
        )
    VALUES
        (
            CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, NULL) END,
                CASE WHEN @DateCreated_Clear = 1 THEN NULL ELSE ISNULL(@DateCreated, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @ID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwMessageCategories] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateMessageCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Message Categories */

GRANT EXECUTE ON [magnetmail].[spCreateMessageCategory] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Message Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Categories
-- Item: spUpdateMessageCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MessageCategory
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateMessageCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateMessageCategory];
GO

CREATE PROCEDURE [magnetmail].[spUpdateMessageCategory]
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @ID nvarchar(255),
    @DateCreated_Clear bit = 0,
    @DateCreated nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MessageCategory]
    SET
        [LoginId] = CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, [LoginId]) END,
        [DateCreated] = CASE WHEN @DateCreated_Clear = 1 THEN NULL ELSE ISNULL(@DateCreated, [DateCreated]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [MailUserId] = CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, [MailUserId]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwMessageCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwMessageCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateMessageCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MessageCategory table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateMessageCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateMessageCategory];
GO
CREATE TRIGGER [magnetmail].trgUpdateMessageCategory
ON [magnetmail].[MessageCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MessageCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[MessageCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Message Categories */

GRANT EXECUTE ON [magnetmail].[spUpdateMessageCategory] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Message Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Details
-- Item: vwMessageDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Message Details
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  MessageDetails
-----               PRIMARY KEY: message_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwMessageDetails]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwMessageDetails];
GO

CREATE VIEW [magnetmail].[vwMessageDetails]
AS
SELECT
    m.*
FROM
    [magnetmail].[MessageDetails] AS m
GO
GRANT SELECT ON [magnetmail].[vwMessageDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Message Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Details
-- Item: Permissions for vwMessageDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwMessageDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Message Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Details
-- Item: spCreateMessageDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MessageDetails
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateMessageDetails]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateMessageDetails];
GO

CREATE PROCEDURE [magnetmail].[spCreateMessageDetails]
    @characterSet_Clear bit = 0,
    @characterSet nvarchar(255) = NULL,
    @fax_doc_4_Clear bit = 0,
    @fax_doc_4 nvarchar(255) = NULL,
    @template_id_Clear bit = 0,
    @template_id nvarchar(255) = NULL,
    @html_version_block2_Clear bit = 0,
    @html_version_block2 nvarchar(255) = NULL,
    @loginid_Clear bit = 0,
    @loginid nvarchar(255) = NULL,
    @fax_doc_1_Clear bit = 0,
    @fax_doc_1 nvarchar(255) = NULL,
    @SubjectLine_Clear bit = 0,
    @SubjectLine nvarchar(255) = NULL,
    @message_name_Clear bit = 0,
    @message_name nvarchar(255) = NULL,
    @is_fax_only_Clear bit = 0,
    @is_fax_only nvarchar(255) = NULL,
    @is_copy_paste_template_Clear bit = 0,
    @is_copy_paste_template nvarchar(255) = NULL,
    @fax_doc_2_Clear bit = 0,
    @fax_doc_2 nvarchar(255) = NULL,
    @text_version_Clear bit = 0,
    @text_version nvarchar(255) = NULL,
    @user_id_Clear bit = 0,
    @user_id nvarchar(255) = NULL,
    @FromAddress_Clear bit = 0,
    @FromAddress nvarchar(255) = NULL,
    @html_version_block3_Clear bit = 0,
    @html_version_block3 nvarchar(255) = NULL,
    @is_auto_unsubscribe_link_Clear bit = 0,
    @is_auto_unsubscribe_link nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @is_fax_merged_Clear bit = 0,
    @is_fax_merged nvarchar(255) = NULL,
    @lastSent_Clear bit = 0,
    @lastSent nvarchar(255) = NULL,
    @message_id nvarchar(255) = NULL,
    @fax_doc_3_Clear bit = 0,
    @fax_doc_3 nvarchar(255) = NULL,
    @fax_doc_5_Clear bit = 0,
    @fax_doc_5 nvarchar(255) = NULL,
    @html_version_block1_Clear bit = 0,
    @html_version_block1 nvarchar(255) = NULL,
    @message_category_Clear bit = 0,
    @message_category nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[MessageDetails]
        (
            [characterSet],
                [fax_doc_4],
                [template_id],
                [html_version_block2],
                [loginid],
                [fax_doc_1],
                [SubjectLine],
                [message_name],
                [is_fax_only],
                [is_copy_paste_template],
                [fax_doc_2],
                [text_version],
                [user_id],
                [FromAddress],
                [html_version_block3],
                [is_auto_unsubscribe_link],
                [createDate],
                [is_fax_merged],
                [lastSent],
                [fax_doc_3],
                [fax_doc_5],
                [html_version_block1],
                [message_category],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [message_id]
        )
    VALUES
        (
            CASE WHEN @characterSet_Clear = 1 THEN NULL ELSE ISNULL(@characterSet, NULL) END,
                CASE WHEN @fax_doc_4_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_4, NULL) END,
                CASE WHEN @template_id_Clear = 1 THEN NULL ELSE ISNULL(@template_id, NULL) END,
                CASE WHEN @html_version_block2_Clear = 1 THEN NULL ELSE ISNULL(@html_version_block2, NULL) END,
                CASE WHEN @loginid_Clear = 1 THEN NULL ELSE ISNULL(@loginid, NULL) END,
                CASE WHEN @fax_doc_1_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_1, NULL) END,
                CASE WHEN @SubjectLine_Clear = 1 THEN NULL ELSE ISNULL(@SubjectLine, NULL) END,
                CASE WHEN @message_name_Clear = 1 THEN NULL ELSE ISNULL(@message_name, NULL) END,
                CASE WHEN @is_fax_only_Clear = 1 THEN NULL ELSE ISNULL(@is_fax_only, NULL) END,
                CASE WHEN @is_copy_paste_template_Clear = 1 THEN NULL ELSE ISNULL(@is_copy_paste_template, NULL) END,
                CASE WHEN @fax_doc_2_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_2, NULL) END,
                CASE WHEN @text_version_Clear = 1 THEN NULL ELSE ISNULL(@text_version, NULL) END,
                CASE WHEN @user_id_Clear = 1 THEN NULL ELSE ISNULL(@user_id, NULL) END,
                CASE WHEN @FromAddress_Clear = 1 THEN NULL ELSE ISNULL(@FromAddress, NULL) END,
                CASE WHEN @html_version_block3_Clear = 1 THEN NULL ELSE ISNULL(@html_version_block3, NULL) END,
                CASE WHEN @is_auto_unsubscribe_link_Clear = 1 THEN NULL ELSE ISNULL(@is_auto_unsubscribe_link, NULL) END,
                CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, NULL) END,
                CASE WHEN @is_fax_merged_Clear = 1 THEN NULL ELSE ISNULL(@is_fax_merged, NULL) END,
                CASE WHEN @lastSent_Clear = 1 THEN NULL ELSE ISNULL(@lastSent, NULL) END,
                CASE WHEN @fax_doc_3_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_3, NULL) END,
                CASE WHEN @fax_doc_5_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_5, NULL) END,
                CASE WHEN @html_version_block1_Clear = 1 THEN NULL ELSE ISNULL(@html_version_block1, NULL) END,
                CASE WHEN @message_category_Clear = 1 THEN NULL ELSE ISNULL(@message_category, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @message_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwMessageDetails] WHERE [message_id] = @message_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateMessageDetails] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Message Details */

GRANT EXECUTE ON [magnetmail].[spCreateMessageDetails] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Message Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Details
-- Item: spUpdateMessageDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MessageDetails
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateMessageDetails]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateMessageDetails];
GO

CREATE PROCEDURE [magnetmail].[spUpdateMessageDetails]
    @characterSet_Clear bit = 0,
    @characterSet nvarchar(255) = NULL,
    @fax_doc_4_Clear bit = 0,
    @fax_doc_4 nvarchar(255) = NULL,
    @template_id_Clear bit = 0,
    @template_id nvarchar(255) = NULL,
    @html_version_block2_Clear bit = 0,
    @html_version_block2 nvarchar(255) = NULL,
    @loginid_Clear bit = 0,
    @loginid nvarchar(255) = NULL,
    @fax_doc_1_Clear bit = 0,
    @fax_doc_1 nvarchar(255) = NULL,
    @SubjectLine_Clear bit = 0,
    @SubjectLine nvarchar(255) = NULL,
    @message_name_Clear bit = 0,
    @message_name nvarchar(255) = NULL,
    @is_fax_only_Clear bit = 0,
    @is_fax_only nvarchar(255) = NULL,
    @is_copy_paste_template_Clear bit = 0,
    @is_copy_paste_template nvarchar(255) = NULL,
    @fax_doc_2_Clear bit = 0,
    @fax_doc_2 nvarchar(255) = NULL,
    @text_version_Clear bit = 0,
    @text_version nvarchar(255) = NULL,
    @user_id_Clear bit = 0,
    @user_id nvarchar(255) = NULL,
    @FromAddress_Clear bit = 0,
    @FromAddress nvarchar(255) = NULL,
    @html_version_block3_Clear bit = 0,
    @html_version_block3 nvarchar(255) = NULL,
    @is_auto_unsubscribe_link_Clear bit = 0,
    @is_auto_unsubscribe_link nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @is_fax_merged_Clear bit = 0,
    @is_fax_merged nvarchar(255) = NULL,
    @lastSent_Clear bit = 0,
    @lastSent nvarchar(255) = NULL,
    @message_id nvarchar(255),
    @fax_doc_3_Clear bit = 0,
    @fax_doc_3 nvarchar(255) = NULL,
    @fax_doc_5_Clear bit = 0,
    @fax_doc_5 nvarchar(255) = NULL,
    @html_version_block1_Clear bit = 0,
    @html_version_block1 nvarchar(255) = NULL,
    @message_category_Clear bit = 0,
    @message_category nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MessageDetails]
    SET
        [characterSet] = CASE WHEN @characterSet_Clear = 1 THEN NULL ELSE ISNULL(@characterSet, [characterSet]) END,
        [fax_doc_4] = CASE WHEN @fax_doc_4_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_4, [fax_doc_4]) END,
        [template_id] = CASE WHEN @template_id_Clear = 1 THEN NULL ELSE ISNULL(@template_id, [template_id]) END,
        [html_version_block2] = CASE WHEN @html_version_block2_Clear = 1 THEN NULL ELSE ISNULL(@html_version_block2, [html_version_block2]) END,
        [loginid] = CASE WHEN @loginid_Clear = 1 THEN NULL ELSE ISNULL(@loginid, [loginid]) END,
        [fax_doc_1] = CASE WHEN @fax_doc_1_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_1, [fax_doc_1]) END,
        [SubjectLine] = CASE WHEN @SubjectLine_Clear = 1 THEN NULL ELSE ISNULL(@SubjectLine, [SubjectLine]) END,
        [message_name] = CASE WHEN @message_name_Clear = 1 THEN NULL ELSE ISNULL(@message_name, [message_name]) END,
        [is_fax_only] = CASE WHEN @is_fax_only_Clear = 1 THEN NULL ELSE ISNULL(@is_fax_only, [is_fax_only]) END,
        [is_copy_paste_template] = CASE WHEN @is_copy_paste_template_Clear = 1 THEN NULL ELSE ISNULL(@is_copy_paste_template, [is_copy_paste_template]) END,
        [fax_doc_2] = CASE WHEN @fax_doc_2_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_2, [fax_doc_2]) END,
        [text_version] = CASE WHEN @text_version_Clear = 1 THEN NULL ELSE ISNULL(@text_version, [text_version]) END,
        [user_id] = CASE WHEN @user_id_Clear = 1 THEN NULL ELSE ISNULL(@user_id, [user_id]) END,
        [FromAddress] = CASE WHEN @FromAddress_Clear = 1 THEN NULL ELSE ISNULL(@FromAddress, [FromAddress]) END,
        [html_version_block3] = CASE WHEN @html_version_block3_Clear = 1 THEN NULL ELSE ISNULL(@html_version_block3, [html_version_block3]) END,
        [is_auto_unsubscribe_link] = CASE WHEN @is_auto_unsubscribe_link_Clear = 1 THEN NULL ELSE ISNULL(@is_auto_unsubscribe_link, [is_auto_unsubscribe_link]) END,
        [createDate] = CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, [createDate]) END,
        [is_fax_merged] = CASE WHEN @is_fax_merged_Clear = 1 THEN NULL ELSE ISNULL(@is_fax_merged, [is_fax_merged]) END,
        [lastSent] = CASE WHEN @lastSent_Clear = 1 THEN NULL ELSE ISNULL(@lastSent, [lastSent]) END,
        [fax_doc_3] = CASE WHEN @fax_doc_3_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_3, [fax_doc_3]) END,
        [fax_doc_5] = CASE WHEN @fax_doc_5_Clear = 1 THEN NULL ELSE ISNULL(@fax_doc_5, [fax_doc_5]) END,
        [html_version_block1] = CASE WHEN @html_version_block1_Clear = 1 THEN NULL ELSE ISNULL(@html_version_block1, [html_version_block1]) END,
        [message_category] = CASE WHEN @message_category_Clear = 1 THEN NULL ELSE ISNULL(@message_category, [message_category]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [message_id] = @message_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwMessageDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwMessageDetails]
                                    WHERE
                                        [message_id] = @message_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateMessageDetails] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MessageDetails table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateMessageDetails]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateMessageDetails];
GO
CREATE TRIGGER [magnetmail].trgUpdateMessageDetails
ON [magnetmail].[MessageDetails]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[MessageDetails]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[MessageDetails] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[message_id] = I.[message_id];
END;
GO

/* spUpdate Permissions for Message Details */

GRANT EXECUTE ON [magnetmail].[spUpdateMessageDetails] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Messages
-- Item: vwMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Messages
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  Message
-----               PRIMARY KEY: message_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwMessages]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwMessages];
GO

CREATE VIEW [magnetmail].[vwMessages]
AS
SELECT
    m.*
FROM
    [magnetmail].[Message] AS m
GO
GRANT SELECT ON [magnetmail].[vwMessages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Messages
-- Item: Permissions for vwMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwMessages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Messages
-- Item: spCreateMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Message
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateMessage];
GO

CREATE PROCEDURE [magnetmail].[spCreateMessage]
    @message_id nvarchar(255) = NULL,
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastSent_Clear bit = 0,
    @lastSent nvarchar(255) = NULL,
    @user_id_Clear bit = 0,
    @user_id nvarchar(255) = NULL,
    @message_name_Clear bit = 0,
    @message_name nvarchar(255) = NULL,
    @loginid_Clear bit = 0,
    @loginid nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[Message]
        (
            [createDate],
                [lastSent],
                [user_id],
                [message_name],
                [loginid],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [message_id]
        )
    VALUES
        (
            CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, NULL) END,
                CASE WHEN @lastSent_Clear = 1 THEN NULL ELSE ISNULL(@lastSent, NULL) END,
                CASE WHEN @user_id_Clear = 1 THEN NULL ELSE ISNULL(@user_id, NULL) END,
                CASE WHEN @message_name_Clear = 1 THEN NULL ELSE ISNULL(@message_name, NULL) END,
                CASE WHEN @loginid_Clear = 1 THEN NULL ELSE ISNULL(@loginid, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @message_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwMessages] WHERE [message_id] = @message_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateMessage] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Messages */

GRANT EXECUTE ON [magnetmail].[spCreateMessage] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Messages
-- Item: spUpdateMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Message
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateMessage];
GO

CREATE PROCEDURE [magnetmail].[spUpdateMessage]
    @message_id nvarchar(255),
    @createDate_Clear bit = 0,
    @createDate nvarchar(255) = NULL,
    @lastSent_Clear bit = 0,
    @lastSent nvarchar(255) = NULL,
    @user_id_Clear bit = 0,
    @user_id nvarchar(255) = NULL,
    @message_name_Clear bit = 0,
    @message_name nvarchar(255) = NULL,
    @loginid_Clear bit = 0,
    @loginid nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Message]
    SET
        [createDate] = CASE WHEN @createDate_Clear = 1 THEN NULL ELSE ISNULL(@createDate, [createDate]) END,
        [lastSent] = CASE WHEN @lastSent_Clear = 1 THEN NULL ELSE ISNULL(@lastSent, [lastSent]) END,
        [user_id] = CASE WHEN @user_id_Clear = 1 THEN NULL ELSE ISNULL(@user_id, [user_id]) END,
        [message_name] = CASE WHEN @message_name_Clear = 1 THEN NULL ELSE ISNULL(@message_name, [message_name]) END,
        [loginid] = CASE WHEN @loginid_Clear = 1 THEN NULL ELSE ISNULL(@loginid, [loginid]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [message_id] = @message_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwMessages] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwMessages]
                                    WHERE
                                        [message_id] = @message_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateMessage] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Message table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateMessage]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateMessage];
GO
CREATE TRIGGER [magnetmail].trgUpdateMessage
ON [magnetmail].[Message]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Message]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[Message] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[message_id] = I.[message_id];
END;
GO

/* spUpdate Permissions for Messages */

GRANT EXECUTE ON [magnetmail].[spUpdateMessage] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Mail Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Mail Recipient Groups
-- Item: spDeleteMailRecipientGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MailRecipientGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteMailRecipientGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteMailRecipientGroup];
GO

CREATE PROCEDURE [magnetmail].[spDeleteMailRecipientGroup]
    @group_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[MailRecipientGroup]
    WHERE
        [group_id] = @group_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [group_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @group_id AS [group_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteMailRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Mail Recipient Groups */

GRANT EXECUTE ON [magnetmail].[spDeleteMailRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Message Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Categories
-- Item: spDeleteMessageCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MessageCategory
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteMessageCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteMessageCategory];
GO

CREATE PROCEDURE [magnetmail].[spDeleteMessageCategory]
    @ID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[MessageCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteMessageCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Message Categories */

GRANT EXECUTE ON [magnetmail].[spDeleteMessageCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Message Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Message Details
-- Item: spDeleteMessageDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MessageDetails
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteMessageDetails]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteMessageDetails];
GO

CREATE PROCEDURE [magnetmail].[spDeleteMessageDetails]
    @message_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[MessageDetails]
    WHERE
        [message_id] = @message_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [message_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @message_id AS [message_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteMessageDetails] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Message Details */

GRANT EXECUTE ON [magnetmail].[spDeleteMessageDetails] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Messages
-- Item: spDeleteMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Message
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteMessage];
GO

CREATE PROCEDURE [magnetmail].[spDeleteMessage]
    @message_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[Message]
    WHERE
        [message_id] = @message_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [message_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @message_id AS [message_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteMessage] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Messages */

GRANT EXECUTE ON [magnetmail].[spDeleteMessage] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PaidItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Paid Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ClientReferenceId in table PaidItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaidItem_ClientReferenceId' 
    AND object_id = OBJECT_ID('[magnetmail].[PaidItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaidItem_ClientReferenceId ON [magnetmail].[PaidItem] ([ClientReferenceId]);

/* Index for Foreign Keys for PersonifySubscriptionMapping */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Personify Subscription Mappings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for QuestionItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Question Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Paid Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Paid Items
-- Item: vwPaidItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Paid Items
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  PaidItem
-----               PRIMARY KEY: RMPaidItemReferenceId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwPaidItems]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwPaidItems];
GO

CREATE VIEW [magnetmail].[vwPaidItems]
AS
SELECT
    p.*
FROM
    [magnetmail].[PaidItem] AS p
GO
GRANT SELECT ON [magnetmail].[vwPaidItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Paid Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Paid Items
-- Item: Permissions for vwPaidItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwPaidItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Paid Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Paid Items
-- Item: spCreatePaidItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaidItem
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreatePaidItem]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreatePaidItem];
GO

CREATE PROCEDURE [magnetmail].[spCreatePaidItem]
    @ClientReferenceId_Clear bit = 0,
    @ClientReferenceId nvarchar(255) = NULL,
    @RMPaidItemReferenceId nvarchar(255) = NULL,
    @Quantity_Clear bit = 0,
    @Quantity nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[PaidItem]
        (
            [ClientReferenceId],
                [Quantity],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [RMPaidItemReferenceId]
        )
    VALUES
        (
            CASE WHEN @ClientReferenceId_Clear = 1 THEN NULL ELSE ISNULL(@ClientReferenceId, NULL) END,
                CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @RMPaidItemReferenceId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwPaidItems] WHERE [RMPaidItemReferenceId] = @RMPaidItemReferenceId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreatePaidItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Paid Items */

GRANT EXECUTE ON [magnetmail].[spCreatePaidItem] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Paid Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Paid Items
-- Item: spUpdatePaidItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaidItem
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdatePaidItem]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdatePaidItem];
GO

CREATE PROCEDURE [magnetmail].[spUpdatePaidItem]
    @ClientReferenceId_Clear bit = 0,
    @ClientReferenceId nvarchar(255) = NULL,
    @RMPaidItemReferenceId nvarchar(255),
    @Quantity_Clear bit = 0,
    @Quantity nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[PaidItem]
    SET
        [ClientReferenceId] = CASE WHEN @ClientReferenceId_Clear = 1 THEN NULL ELSE ISNULL(@ClientReferenceId, [ClientReferenceId]) END,
        [Quantity] = CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, [Quantity]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [RMPaidItemReferenceId] = @RMPaidItemReferenceId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwPaidItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwPaidItems]
                                    WHERE
                                        [RMPaidItemReferenceId] = @RMPaidItemReferenceId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdatePaidItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaidItem table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdatePaidItem]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdatePaidItem];
GO
CREATE TRIGGER [magnetmail].trgUpdatePaidItem
ON [magnetmail].[PaidItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[PaidItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[PaidItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[RMPaidItemReferenceId] = I.[RMPaidItemReferenceId];
END;
GO

/* spUpdate Permissions for Paid Items */

GRANT EXECUTE ON [magnetmail].[spUpdatePaidItem] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Personify Subscription Mappings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Personify Subscription Mappings
-- Item: vwPersonifySubscriptionMappings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Personify Subscription Mappings
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  PersonifySubscriptionMapping
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwPersonifySubscriptionMappings]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwPersonifySubscriptionMappings];
GO

CREATE VIEW [magnetmail].[vwPersonifySubscriptionMappings]
AS
SELECT
    p.*
FROM
    [magnetmail].[PersonifySubscriptionMapping] AS p
GO
GRANT SELECT ON [magnetmail].[vwPersonifySubscriptionMappings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Personify Subscription Mappings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Personify Subscription Mappings
-- Item: Permissions for vwPersonifySubscriptionMappings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwPersonifySubscriptionMappings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Personify Subscription Mappings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Personify Subscription Mappings
-- Item: spCreatePersonifySubscriptionMapping
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PersonifySubscriptionMapping
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreatePersonifySubscriptionMapping]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreatePersonifySubscriptionMapping];
GO

CREATE PROCEDURE [magnetmail].[spCreatePersonifySubscriptionMapping]
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @RealMagnetObjectId_Clear bit = 0,
    @RealMagnetObjectId nvarchar(255) = NULL,
    @DateCreated_Clear bit = 0,
    @DateCreated nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @RealMagnetObjectName_Clear bit = 0,
    @RealMagnetObjectName nvarchar(255) = NULL,
    @ID nvarchar(255) = NULL,
    @PersonifyType_Clear bit = 0,
    @PersonifyType nvarchar(255) = NULL,
    @RealMagnetType_Clear bit = 0,
    @RealMagnetType nvarchar(255) = NULL,
    @PersonifyId_Clear bit = 0,
    @PersonifyId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[PersonifySubscriptionMapping]
        (
            [CreatedBy],
                [RealMagnetObjectId],
                [DateCreated],
                [MailUserId],
                [RealMagnetObjectName],
                [PersonifyType],
                [RealMagnetType],
                [PersonifyId],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [ID]
        )
    VALUES
        (
            CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, NULL) END,
                CASE WHEN @RealMagnetObjectId_Clear = 1 THEN NULL ELSE ISNULL(@RealMagnetObjectId, NULL) END,
                CASE WHEN @DateCreated_Clear = 1 THEN NULL ELSE ISNULL(@DateCreated, NULL) END,
                CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, NULL) END,
                CASE WHEN @RealMagnetObjectName_Clear = 1 THEN NULL ELSE ISNULL(@RealMagnetObjectName, NULL) END,
                CASE WHEN @PersonifyType_Clear = 1 THEN NULL ELSE ISNULL(@PersonifyType, NULL) END,
                CASE WHEN @RealMagnetType_Clear = 1 THEN NULL ELSE ISNULL(@RealMagnetType, NULL) END,
                CASE WHEN @PersonifyId_Clear = 1 THEN NULL ELSE ISNULL(@PersonifyId, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @ID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwPersonifySubscriptionMappings] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [magnetmail].[spCreatePersonifySubscriptionMapping] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Personify Subscription Mappings */

GRANT EXECUTE ON [magnetmail].[spCreatePersonifySubscriptionMapping] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Personify Subscription Mappings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Personify Subscription Mappings
-- Item: spUpdatePersonifySubscriptionMapping
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PersonifySubscriptionMapping
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdatePersonifySubscriptionMapping]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdatePersonifySubscriptionMapping];
GO

CREATE PROCEDURE [magnetmail].[spUpdatePersonifySubscriptionMapping]
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(255) = NULL,
    @RealMagnetObjectId_Clear bit = 0,
    @RealMagnetObjectId nvarchar(255) = NULL,
    @DateCreated_Clear bit = 0,
    @DateCreated nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @RealMagnetObjectName_Clear bit = 0,
    @RealMagnetObjectName nvarchar(255) = NULL,
    @ID nvarchar(255),
    @PersonifyType_Clear bit = 0,
    @PersonifyType nvarchar(255) = NULL,
    @RealMagnetType_Clear bit = 0,
    @RealMagnetType nvarchar(255) = NULL,
    @PersonifyId_Clear bit = 0,
    @PersonifyId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[PersonifySubscriptionMapping]
    SET
        [CreatedBy] = CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, [CreatedBy]) END,
        [RealMagnetObjectId] = CASE WHEN @RealMagnetObjectId_Clear = 1 THEN NULL ELSE ISNULL(@RealMagnetObjectId, [RealMagnetObjectId]) END,
        [DateCreated] = CASE WHEN @DateCreated_Clear = 1 THEN NULL ELSE ISNULL(@DateCreated, [DateCreated]) END,
        [MailUserId] = CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, [MailUserId]) END,
        [RealMagnetObjectName] = CASE WHEN @RealMagnetObjectName_Clear = 1 THEN NULL ELSE ISNULL(@RealMagnetObjectName, [RealMagnetObjectName]) END,
        [PersonifyType] = CASE WHEN @PersonifyType_Clear = 1 THEN NULL ELSE ISNULL(@PersonifyType, [PersonifyType]) END,
        [RealMagnetType] = CASE WHEN @RealMagnetType_Clear = 1 THEN NULL ELSE ISNULL(@RealMagnetType, [RealMagnetType]) END,
        [PersonifyId] = CASE WHEN @PersonifyId_Clear = 1 THEN NULL ELSE ISNULL(@PersonifyId, [PersonifyId]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwPersonifySubscriptionMappings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwPersonifySubscriptionMappings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdatePersonifySubscriptionMapping] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PersonifySubscriptionMapping table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdatePersonifySubscriptionMapping]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdatePersonifySubscriptionMapping];
GO
CREATE TRIGGER [magnetmail].trgUpdatePersonifySubscriptionMapping
ON [magnetmail].[PersonifySubscriptionMapping]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[PersonifySubscriptionMapping]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[PersonifySubscriptionMapping] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Personify Subscription Mappings */

GRANT EXECUTE ON [magnetmail].[spUpdatePersonifySubscriptionMapping] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Question Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Question Items
-- Item: vwQuestionItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Question Items
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  QuestionItem
-----               PRIMARY KEY: QuestionItemId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwQuestionItems]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwQuestionItems];
GO

CREATE VIEW [magnetmail].[vwQuestionItems]
AS
SELECT
    q.*
FROM
    [magnetmail].[QuestionItem] AS q
GO
GRANT SELECT ON [magnetmail].[vwQuestionItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Question Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Question Items
-- Item: Permissions for vwQuestionItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwQuestionItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Question Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Question Items
-- Item: spCreateQuestionItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QuestionItem
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateQuestionItem]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateQuestionItem];
GO

CREATE PROCEDURE [magnetmail].[spCreateQuestionItem]
    @QuestionItemId nvarchar(255) = NULL,
    @QuestionItemData_Clear bit = 0,
    @QuestionItemData nvarchar(255) = NULL,
    @QuestionItemOtherOptionData_Clear bit = 0,
    @QuestionItemOtherOptionData nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[QuestionItem]
        (
            [QuestionItemData],
                [QuestionItemOtherOptionData],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [QuestionItemId]
        )
    VALUES
        (
            CASE WHEN @QuestionItemData_Clear = 1 THEN NULL ELSE ISNULL(@QuestionItemData, NULL) END,
                CASE WHEN @QuestionItemOtherOptionData_Clear = 1 THEN NULL ELSE ISNULL(@QuestionItemOtherOptionData, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @QuestionItemId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwQuestionItems] WHERE [QuestionItemId] = @QuestionItemId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateQuestionItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Question Items */

GRANT EXECUTE ON [magnetmail].[spCreateQuestionItem] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Question Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Question Items
-- Item: spUpdateQuestionItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QuestionItem
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateQuestionItem]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateQuestionItem];
GO

CREATE PROCEDURE [magnetmail].[spUpdateQuestionItem]
    @QuestionItemId nvarchar(255),
    @QuestionItemData_Clear bit = 0,
    @QuestionItemData nvarchar(255) = NULL,
    @QuestionItemOtherOptionData_Clear bit = 0,
    @QuestionItemOtherOptionData nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[QuestionItem]
    SET
        [QuestionItemData] = CASE WHEN @QuestionItemData_Clear = 1 THEN NULL ELSE ISNULL(@QuestionItemData, [QuestionItemData]) END,
        [QuestionItemOtherOptionData] = CASE WHEN @QuestionItemOtherOptionData_Clear = 1 THEN NULL ELSE ISNULL(@QuestionItemOtherOptionData, [QuestionItemOtherOptionData]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [QuestionItemId] = @QuestionItemId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwQuestionItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwQuestionItems]
                                    WHERE
                                        [QuestionItemId] = @QuestionItemId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateQuestionItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QuestionItem table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateQuestionItem]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateQuestionItem];
GO
CREATE TRIGGER [magnetmail].trgUpdateQuestionItem
ON [magnetmail].[QuestionItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[QuestionItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[QuestionItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[QuestionItemId] = I.[QuestionItemId];
END;
GO

/* spUpdate Permissions for Question Items */

GRANT EXECUTE ON [magnetmail].[spUpdateQuestionItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Paid Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Paid Items
-- Item: spDeletePaidItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaidItem
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeletePaidItem]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeletePaidItem];
GO

CREATE PROCEDURE [magnetmail].[spDeletePaidItem]
    @RMPaidItemReferenceId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[PaidItem]
    WHERE
        [RMPaidItemReferenceId] = @RMPaidItemReferenceId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [RMPaidItemReferenceId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @RMPaidItemReferenceId AS [RMPaidItemReferenceId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeletePaidItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Paid Items */

GRANT EXECUTE ON [magnetmail].[spDeletePaidItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Personify Subscription Mappings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Personify Subscription Mappings
-- Item: spDeletePersonifySubscriptionMapping
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PersonifySubscriptionMapping
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeletePersonifySubscriptionMapping]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeletePersonifySubscriptionMapping];
GO

CREATE PROCEDURE [magnetmail].[spDeletePersonifySubscriptionMapping]
    @ID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[PersonifySubscriptionMapping]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeletePersonifySubscriptionMapping] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Personify Subscription Mappings */

GRANT EXECUTE ON [magnetmail].[spDeletePersonifySubscriptionMapping] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Question Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Question Items
-- Item: spDeleteQuestionItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR QuestionItem
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteQuestionItem]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteQuestionItem];
GO

CREATE PROCEDURE [magnetmail].[spDeleteQuestionItem]
    @QuestionItemId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[QuestionItem]
    WHERE
        [QuestionItemId] = @QuestionItemId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [QuestionItemId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @QuestionItemId AS [QuestionItemId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteQuestionItem] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Question Items */

GRANT EXECUTE ON [magnetmail].[spDeleteQuestionItem] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for RecipientGroup */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipient Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Recipient */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipients
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for recp_track */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recp Tracks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Registrant */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Registrants
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for Unsubscribe */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Unsubscribes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MessageId in table Unsubscribe
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Unsubscribe_MessageId' 
    AND object_id = OBJECT_ID('[magnetmail].[Unsubscribe]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Unsubscribe_MessageId ON [magnetmail].[Unsubscribe] ([MessageId]);

-- Index for foreign key GroupId in table Unsubscribe
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Unsubscribe_GroupId' 
    AND object_id = OBJECT_ID('[magnetmail].[Unsubscribe]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Unsubscribe_GroupId ON [magnetmail].[Unsubscribe] ([GroupId]);

-- Index for foreign key MessageCategoryId in table Unsubscribe
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Unsubscribe_MessageCategoryId' 
    AND object_id = OBJECT_ID('[magnetmail].[Unsubscribe]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Unsubscribe_MessageCategoryId ON [magnetmail].[Unsubscribe] ([MessageCategoryId]);

-- Index for foreign key RecipientId in table Unsubscribe
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Unsubscribe_RecipientId' 
    AND object_id = OBJECT_ID('[magnetmail].[Unsubscribe]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Unsubscribe_RecipientId ON [magnetmail].[Unsubscribe] ([RecipientId]);

-- Index for foreign key GroupCategoryId in table Unsubscribe
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Unsubscribe_GroupCategoryId' 
    AND object_id = OBJECT_ID('[magnetmail].[Unsubscribe]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Unsubscribe_GroupCategoryId ON [magnetmail].[Unsubscribe] ([GroupCategoryId]);

/* Base View SQL for Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipient Groups
-- Item: vwRecipientGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Recipient Groups
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  RecipientGroup
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwRecipientGroups]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwRecipientGroups];
GO

CREATE VIEW [magnetmail].[vwRecipientGroups]
AS
SELECT
    r.*
FROM
    [magnetmail].[RecipientGroup] AS r
GO
GRANT SELECT ON [magnetmail].[vwRecipientGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipient Groups
-- Item: Permissions for vwRecipientGroups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwRecipientGroups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipient Groups
-- Item: spCreateRecipientGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecipientGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateRecipientGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateRecipientGroup];
GO

CREATE PROCEDURE [magnetmail].[spCreateRecipientGroup]
    @SubscriptionGroup_Clear bit = 0,
    @SubscriptionGroup nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @LastUpdated_Clear bit = 0,
    @LastUpdated nvarchar(255) = NULL,
    @DisplayStatus_Clear bit = 0,
    @DisplayStatus nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @LastUpdatedLoginId_Clear bit = 0,
    @LastUpdatedLoginId nvarchar(255) = NULL,
    @Created_Clear bit = 0,
    @Created nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[RecipientGroup]
        (
            [SubscriptionGroup],
                [Name],
                [LastUpdated],
                [DisplayStatus],
                [LastUpdatedLoginId],
                [Created],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [Id]
        )
    VALUES
        (
            CASE WHEN @SubscriptionGroup_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionGroup, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @LastUpdated_Clear = 1 THEN NULL ELSE ISNULL(@LastUpdated, NULL) END,
                CASE WHEN @DisplayStatus_Clear = 1 THEN NULL ELSE ISNULL(@DisplayStatus, NULL) END,
                CASE WHEN @LastUpdatedLoginId_Clear = 1 THEN NULL ELSE ISNULL(@LastUpdatedLoginId, NULL) END,
                CASE WHEN @Created_Clear = 1 THEN NULL ELSE ISNULL(@Created, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwRecipientGroups] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Recipient Groups */

GRANT EXECUTE ON [magnetmail].[spCreateRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipient Groups
-- Item: spUpdateRecipientGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecipientGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateRecipientGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateRecipientGroup];
GO

CREATE PROCEDURE [magnetmail].[spUpdateRecipientGroup]
    @SubscriptionGroup_Clear bit = 0,
    @SubscriptionGroup nvarchar(255) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @LastUpdated_Clear bit = 0,
    @LastUpdated nvarchar(255) = NULL,
    @DisplayStatus_Clear bit = 0,
    @DisplayStatus nvarchar(255) = NULL,
    @Id nvarchar(255),
    @LastUpdatedLoginId_Clear bit = 0,
    @LastUpdatedLoginId nvarchar(255) = NULL,
    @Created_Clear bit = 0,
    @Created nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[RecipientGroup]
    SET
        [SubscriptionGroup] = CASE WHEN @SubscriptionGroup_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionGroup, [SubscriptionGroup]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [LastUpdated] = CASE WHEN @LastUpdated_Clear = 1 THEN NULL ELSE ISNULL(@LastUpdated, [LastUpdated]) END,
        [DisplayStatus] = CASE WHEN @DisplayStatus_Clear = 1 THEN NULL ELSE ISNULL(@DisplayStatus, [DisplayStatus]) END,
        [LastUpdatedLoginId] = CASE WHEN @LastUpdatedLoginId_Clear = 1 THEN NULL ELSE ISNULL(@LastUpdatedLoginId, [LastUpdatedLoginId]) END,
        [Created] = CASE WHEN @Created_Clear = 1 THEN NULL ELSE ISNULL(@Created, [Created]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwRecipientGroups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwRecipientGroups]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateRecipientGroup] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecipientGroup table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateRecipientGroup]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateRecipientGroup];
GO
CREATE TRIGGER [magnetmail].trgUpdateRecipientGroup
ON [magnetmail].[RecipientGroup]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[RecipientGroup]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[RecipientGroup] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Recipient Groups */

GRANT EXECUTE ON [magnetmail].[spUpdateRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipients
-- Item: vwRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Recipients
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  Recipient
-----               PRIMARY KEY: id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwRecipients]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwRecipients];
GO

CREATE VIEW [magnetmail].[vwRecipients]
AS
SELECT
    r.*
FROM
    [magnetmail].[Recipient] AS r
GO
GRANT SELECT ON [magnetmail].[vwRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipients
-- Item: Permissions for vwRecipients
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwRecipients] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipients
-- Item: spCreateRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Recipient
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateRecipient];
GO

CREATE PROCEDURE [magnetmail].[spCreateRecipient]
    @custom11_Clear bit = 0,
    @custom11 nvarchar(255) = NULL,
    @fax_Clear bit = 0,
    @fax nvarchar(255) = NULL,
    @email_Clear bit = 0,
    @email nvarchar(255) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(255) = NULL,
    @custom16_Clear bit = 0,
    @custom16 nvarchar(255) = NULL,
    @custom27_Clear bit = 0,
    @custom27 nvarchar(255) = NULL,
    @custom12_Clear bit = 0,
    @custom12 nvarchar(255) = NULL,
    @company_Clear bit = 0,
    @company nvarchar(255) = NULL,
    @address_2_Clear bit = 0,
    @address_2 nvarchar(255) = NULL,
    @custom15_Clear bit = 0,
    @custom15 nvarchar(255) = NULL,
    @custom19_Clear bit = 0,
    @custom19 nvarchar(255) = NULL,
    @custom9_Clear bit = 0,
    @custom9 nvarchar(255) = NULL,
    @custom24_Clear bit = 0,
    @custom24 nvarchar(255) = NULL,
    @custom1_Clear bit = 0,
    @custom1 nvarchar(255) = NULL,
    @unsubscribed_Clear bit = 0,
    @unsubscribed nvarchar(255) = NULL,
    @custom21_Clear bit = 0,
    @custom21 nvarchar(255) = NULL,
    @text_only_Clear bit = 0,
    @text_only nvarchar(255) = NULL,
    @custom4_Clear bit = 0,
    @custom4 nvarchar(255) = NULL,
    @custom30_Clear bit = 0,
    @custom30 nvarchar(255) = NULL,
    @phone_Clear bit = 0,
    @phone nvarchar(255) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(255) = NULL,
    @custom3_Clear bit = 0,
    @custom3 nvarchar(255) = NULL,
    @email_send_suppress_Clear bit = 0,
    @email_send_suppress nvarchar(255) = NULL,
    @custom2_Clear bit = 0,
    @custom2 nvarchar(255) = NULL,
    @custom26_Clear bit = 0,
    @custom26 nvarchar(255) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @custom23_Clear bit = 0,
    @custom23 nvarchar(255) = NULL,
    @id nvarchar(255) = NULL,
    @custom10_Clear bit = 0,
    @custom10 nvarchar(255) = NULL,
    @city_Clear bit = 0,
    @city nvarchar(255) = NULL,
    @fax_send_suppress_Clear bit = 0,
    @fax_send_suppress nvarchar(255) = NULL,
    @custom28_Clear bit = 0,
    @custom28 nvarchar(255) = NULL,
    @Custom_Id_Clear bit = 0,
    @Custom_Id nvarchar(255) = NULL,
    @custom7_Clear bit = 0,
    @custom7 nvarchar(255) = NULL,
    @custom5_Clear bit = 0,
    @custom5 nvarchar(255) = NULL,
    @suppressed_date_Clear bit = 0,
    @suppressed_date nvarchar(255) = NULL,
    @custom25_Clear bit = 0,
    @custom25 nvarchar(255) = NULL,
    @custom13_Clear bit = 0,
    @custom13 nvarchar(255) = NULL,
    @custom17_Clear bit = 0,
    @custom17 nvarchar(255) = NULL,
    @custom18_Clear bit = 0,
    @custom18 nvarchar(255) = NULL,
    @custom29_Clear bit = 0,
    @custom29 nvarchar(255) = NULL,
    @custom20_Clear bit = 0,
    @custom20 nvarchar(255) = NULL,
    @custom6_Clear bit = 0,
    @custom6 nvarchar(255) = NULL,
    @suppressed_Clear bit = 0,
    @suppressed nvarchar(255) = NULL,
    @custom8_Clear bit = 0,
    @custom8 nvarchar(255) = NULL,
    @zip_Clear bit = 0,
    @zip nvarchar(255) = NULL,
    @email_confirm_Clear bit = 0,
    @email_confirm nvarchar(255) = NULL,
    @custom14_Clear bit = 0,
    @custom14 nvarchar(255) = NULL,
    @custom22_Clear bit = 0,
    @custom22 nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[Recipient]
        (
            [custom11],
                [fax],
                [email],
                [first_name],
                [address],
                [custom16],
                [custom27],
                [custom12],
                [company],
                [address_2],
                [custom15],
                [custom19],
                [custom9],
                [custom24],
                [custom1],
                [unsubscribed],
                [custom21],
                [text_only],
                [custom4],
                [custom30],
                [phone],
                [last_name],
                [custom3],
                [email_send_suppress],
                [custom2],
                [custom26],
                [state],
                [custom23],
                [custom10],
                [city],
                [fax_send_suppress],
                [custom28],
                [Custom_Id],
                [custom7],
                [custom5],
                [suppressed_date],
                [custom25],
                [custom13],
                [custom17],
                [custom18],
                [custom29],
                [custom20],
                [custom6],
                [suppressed],
                [custom8],
                [zip],
                [email_confirm],
                [custom14],
                [custom22],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [id]
        )
    VALUES
        (
            CASE WHEN @custom11_Clear = 1 THEN NULL ELSE ISNULL(@custom11, NULL) END,
                CASE WHEN @fax_Clear = 1 THEN NULL ELSE ISNULL(@fax, NULL) END,
                CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, NULL) END,
                CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, NULL) END,
                CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, NULL) END,
                CASE WHEN @custom16_Clear = 1 THEN NULL ELSE ISNULL(@custom16, NULL) END,
                CASE WHEN @custom27_Clear = 1 THEN NULL ELSE ISNULL(@custom27, NULL) END,
                CASE WHEN @custom12_Clear = 1 THEN NULL ELSE ISNULL(@custom12, NULL) END,
                CASE WHEN @company_Clear = 1 THEN NULL ELSE ISNULL(@company, NULL) END,
                CASE WHEN @address_2_Clear = 1 THEN NULL ELSE ISNULL(@address_2, NULL) END,
                CASE WHEN @custom15_Clear = 1 THEN NULL ELSE ISNULL(@custom15, NULL) END,
                CASE WHEN @custom19_Clear = 1 THEN NULL ELSE ISNULL(@custom19, NULL) END,
                CASE WHEN @custom9_Clear = 1 THEN NULL ELSE ISNULL(@custom9, NULL) END,
                CASE WHEN @custom24_Clear = 1 THEN NULL ELSE ISNULL(@custom24, NULL) END,
                CASE WHEN @custom1_Clear = 1 THEN NULL ELSE ISNULL(@custom1, NULL) END,
                CASE WHEN @unsubscribed_Clear = 1 THEN NULL ELSE ISNULL(@unsubscribed, NULL) END,
                CASE WHEN @custom21_Clear = 1 THEN NULL ELSE ISNULL(@custom21, NULL) END,
                CASE WHEN @text_only_Clear = 1 THEN NULL ELSE ISNULL(@text_only, NULL) END,
                CASE WHEN @custom4_Clear = 1 THEN NULL ELSE ISNULL(@custom4, NULL) END,
                CASE WHEN @custom30_Clear = 1 THEN NULL ELSE ISNULL(@custom30, NULL) END,
                CASE WHEN @phone_Clear = 1 THEN NULL ELSE ISNULL(@phone, NULL) END,
                CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, NULL) END,
                CASE WHEN @custom3_Clear = 1 THEN NULL ELSE ISNULL(@custom3, NULL) END,
                CASE WHEN @email_send_suppress_Clear = 1 THEN NULL ELSE ISNULL(@email_send_suppress, NULL) END,
                CASE WHEN @custom2_Clear = 1 THEN NULL ELSE ISNULL(@custom2, NULL) END,
                CASE WHEN @custom26_Clear = 1 THEN NULL ELSE ISNULL(@custom26, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @custom23_Clear = 1 THEN NULL ELSE ISNULL(@custom23, NULL) END,
                CASE WHEN @custom10_Clear = 1 THEN NULL ELSE ISNULL(@custom10, NULL) END,
                CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, NULL) END,
                CASE WHEN @fax_send_suppress_Clear = 1 THEN NULL ELSE ISNULL(@fax_send_suppress, NULL) END,
                CASE WHEN @custom28_Clear = 1 THEN NULL ELSE ISNULL(@custom28, NULL) END,
                CASE WHEN @Custom_Id_Clear = 1 THEN NULL ELSE ISNULL(@Custom_Id, NULL) END,
                CASE WHEN @custom7_Clear = 1 THEN NULL ELSE ISNULL(@custom7, NULL) END,
                CASE WHEN @custom5_Clear = 1 THEN NULL ELSE ISNULL(@custom5, NULL) END,
                CASE WHEN @suppressed_date_Clear = 1 THEN NULL ELSE ISNULL(@suppressed_date, NULL) END,
                CASE WHEN @custom25_Clear = 1 THEN NULL ELSE ISNULL(@custom25, NULL) END,
                CASE WHEN @custom13_Clear = 1 THEN NULL ELSE ISNULL(@custom13, NULL) END,
                CASE WHEN @custom17_Clear = 1 THEN NULL ELSE ISNULL(@custom17, NULL) END,
                CASE WHEN @custom18_Clear = 1 THEN NULL ELSE ISNULL(@custom18, NULL) END,
                CASE WHEN @custom29_Clear = 1 THEN NULL ELSE ISNULL(@custom29, NULL) END,
                CASE WHEN @custom20_Clear = 1 THEN NULL ELSE ISNULL(@custom20, NULL) END,
                CASE WHEN @custom6_Clear = 1 THEN NULL ELSE ISNULL(@custom6, NULL) END,
                CASE WHEN @suppressed_Clear = 1 THEN NULL ELSE ISNULL(@suppressed, NULL) END,
                CASE WHEN @custom8_Clear = 1 THEN NULL ELSE ISNULL(@custom8, NULL) END,
                CASE WHEN @zip_Clear = 1 THEN NULL ELSE ISNULL(@zip, NULL) END,
                CASE WHEN @email_confirm_Clear = 1 THEN NULL ELSE ISNULL(@email_confirm, NULL) END,
                CASE WHEN @custom14_Clear = 1 THEN NULL ELSE ISNULL(@custom14, NULL) END,
                CASE WHEN @custom22_Clear = 1 THEN NULL ELSE ISNULL(@custom22, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwRecipients] WHERE [id] = @id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateRecipient] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Recipients */

GRANT EXECUTE ON [magnetmail].[spCreateRecipient] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipients
-- Item: spUpdateRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Recipient
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateRecipient];
GO

CREATE PROCEDURE [magnetmail].[spUpdateRecipient]
    @custom11_Clear bit = 0,
    @custom11 nvarchar(255) = NULL,
    @fax_Clear bit = 0,
    @fax nvarchar(255) = NULL,
    @email_Clear bit = 0,
    @email nvarchar(255) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(255) = NULL,
    @custom16_Clear bit = 0,
    @custom16 nvarchar(255) = NULL,
    @custom27_Clear bit = 0,
    @custom27 nvarchar(255) = NULL,
    @custom12_Clear bit = 0,
    @custom12 nvarchar(255) = NULL,
    @company_Clear bit = 0,
    @company nvarchar(255) = NULL,
    @address_2_Clear bit = 0,
    @address_2 nvarchar(255) = NULL,
    @custom15_Clear bit = 0,
    @custom15 nvarchar(255) = NULL,
    @custom19_Clear bit = 0,
    @custom19 nvarchar(255) = NULL,
    @custom9_Clear bit = 0,
    @custom9 nvarchar(255) = NULL,
    @custom24_Clear bit = 0,
    @custom24 nvarchar(255) = NULL,
    @custom1_Clear bit = 0,
    @custom1 nvarchar(255) = NULL,
    @unsubscribed_Clear bit = 0,
    @unsubscribed nvarchar(255) = NULL,
    @custom21_Clear bit = 0,
    @custom21 nvarchar(255) = NULL,
    @text_only_Clear bit = 0,
    @text_only nvarchar(255) = NULL,
    @custom4_Clear bit = 0,
    @custom4 nvarchar(255) = NULL,
    @custom30_Clear bit = 0,
    @custom30 nvarchar(255) = NULL,
    @phone_Clear bit = 0,
    @phone nvarchar(255) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(255) = NULL,
    @custom3_Clear bit = 0,
    @custom3 nvarchar(255) = NULL,
    @email_send_suppress_Clear bit = 0,
    @email_send_suppress nvarchar(255) = NULL,
    @custom2_Clear bit = 0,
    @custom2 nvarchar(255) = NULL,
    @custom26_Clear bit = 0,
    @custom26 nvarchar(255) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(255) = NULL,
    @custom23_Clear bit = 0,
    @custom23 nvarchar(255) = NULL,
    @id nvarchar(255),
    @custom10_Clear bit = 0,
    @custom10 nvarchar(255) = NULL,
    @city_Clear bit = 0,
    @city nvarchar(255) = NULL,
    @fax_send_suppress_Clear bit = 0,
    @fax_send_suppress nvarchar(255) = NULL,
    @custom28_Clear bit = 0,
    @custom28 nvarchar(255) = NULL,
    @Custom_Id_Clear bit = 0,
    @Custom_Id nvarchar(255) = NULL,
    @custom7_Clear bit = 0,
    @custom7 nvarchar(255) = NULL,
    @custom5_Clear bit = 0,
    @custom5 nvarchar(255) = NULL,
    @suppressed_date_Clear bit = 0,
    @suppressed_date nvarchar(255) = NULL,
    @custom25_Clear bit = 0,
    @custom25 nvarchar(255) = NULL,
    @custom13_Clear bit = 0,
    @custom13 nvarchar(255) = NULL,
    @custom17_Clear bit = 0,
    @custom17 nvarchar(255) = NULL,
    @custom18_Clear bit = 0,
    @custom18 nvarchar(255) = NULL,
    @custom29_Clear bit = 0,
    @custom29 nvarchar(255) = NULL,
    @custom20_Clear bit = 0,
    @custom20 nvarchar(255) = NULL,
    @custom6_Clear bit = 0,
    @custom6 nvarchar(255) = NULL,
    @suppressed_Clear bit = 0,
    @suppressed nvarchar(255) = NULL,
    @custom8_Clear bit = 0,
    @custom8 nvarchar(255) = NULL,
    @zip_Clear bit = 0,
    @zip nvarchar(255) = NULL,
    @email_confirm_Clear bit = 0,
    @email_confirm nvarchar(255) = NULL,
    @custom14_Clear bit = 0,
    @custom14 nvarchar(255) = NULL,
    @custom22_Clear bit = 0,
    @custom22 nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Recipient]
    SET
        [custom11] = CASE WHEN @custom11_Clear = 1 THEN NULL ELSE ISNULL(@custom11, [custom11]) END,
        [fax] = CASE WHEN @fax_Clear = 1 THEN NULL ELSE ISNULL(@fax, [fax]) END,
        [email] = CASE WHEN @email_Clear = 1 THEN NULL ELSE ISNULL(@email, [email]) END,
        [first_name] = CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, [first_name]) END,
        [address] = CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, [address]) END,
        [custom16] = CASE WHEN @custom16_Clear = 1 THEN NULL ELSE ISNULL(@custom16, [custom16]) END,
        [custom27] = CASE WHEN @custom27_Clear = 1 THEN NULL ELSE ISNULL(@custom27, [custom27]) END,
        [custom12] = CASE WHEN @custom12_Clear = 1 THEN NULL ELSE ISNULL(@custom12, [custom12]) END,
        [company] = CASE WHEN @company_Clear = 1 THEN NULL ELSE ISNULL(@company, [company]) END,
        [address_2] = CASE WHEN @address_2_Clear = 1 THEN NULL ELSE ISNULL(@address_2, [address_2]) END,
        [custom15] = CASE WHEN @custom15_Clear = 1 THEN NULL ELSE ISNULL(@custom15, [custom15]) END,
        [custom19] = CASE WHEN @custom19_Clear = 1 THEN NULL ELSE ISNULL(@custom19, [custom19]) END,
        [custom9] = CASE WHEN @custom9_Clear = 1 THEN NULL ELSE ISNULL(@custom9, [custom9]) END,
        [custom24] = CASE WHEN @custom24_Clear = 1 THEN NULL ELSE ISNULL(@custom24, [custom24]) END,
        [custom1] = CASE WHEN @custom1_Clear = 1 THEN NULL ELSE ISNULL(@custom1, [custom1]) END,
        [unsubscribed] = CASE WHEN @unsubscribed_Clear = 1 THEN NULL ELSE ISNULL(@unsubscribed, [unsubscribed]) END,
        [custom21] = CASE WHEN @custom21_Clear = 1 THEN NULL ELSE ISNULL(@custom21, [custom21]) END,
        [text_only] = CASE WHEN @text_only_Clear = 1 THEN NULL ELSE ISNULL(@text_only, [text_only]) END,
        [custom4] = CASE WHEN @custom4_Clear = 1 THEN NULL ELSE ISNULL(@custom4, [custom4]) END,
        [custom30] = CASE WHEN @custom30_Clear = 1 THEN NULL ELSE ISNULL(@custom30, [custom30]) END,
        [phone] = CASE WHEN @phone_Clear = 1 THEN NULL ELSE ISNULL(@phone, [phone]) END,
        [last_name] = CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, [last_name]) END,
        [custom3] = CASE WHEN @custom3_Clear = 1 THEN NULL ELSE ISNULL(@custom3, [custom3]) END,
        [email_send_suppress] = CASE WHEN @email_send_suppress_Clear = 1 THEN NULL ELSE ISNULL(@email_send_suppress, [email_send_suppress]) END,
        [custom2] = CASE WHEN @custom2_Clear = 1 THEN NULL ELSE ISNULL(@custom2, [custom2]) END,
        [custom26] = CASE WHEN @custom26_Clear = 1 THEN NULL ELSE ISNULL(@custom26, [custom26]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [custom23] = CASE WHEN @custom23_Clear = 1 THEN NULL ELSE ISNULL(@custom23, [custom23]) END,
        [custom10] = CASE WHEN @custom10_Clear = 1 THEN NULL ELSE ISNULL(@custom10, [custom10]) END,
        [city] = CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, [city]) END,
        [fax_send_suppress] = CASE WHEN @fax_send_suppress_Clear = 1 THEN NULL ELSE ISNULL(@fax_send_suppress, [fax_send_suppress]) END,
        [custom28] = CASE WHEN @custom28_Clear = 1 THEN NULL ELSE ISNULL(@custom28, [custom28]) END,
        [Custom_Id] = CASE WHEN @Custom_Id_Clear = 1 THEN NULL ELSE ISNULL(@Custom_Id, [Custom_Id]) END,
        [custom7] = CASE WHEN @custom7_Clear = 1 THEN NULL ELSE ISNULL(@custom7, [custom7]) END,
        [custom5] = CASE WHEN @custom5_Clear = 1 THEN NULL ELSE ISNULL(@custom5, [custom5]) END,
        [suppressed_date] = CASE WHEN @suppressed_date_Clear = 1 THEN NULL ELSE ISNULL(@suppressed_date, [suppressed_date]) END,
        [custom25] = CASE WHEN @custom25_Clear = 1 THEN NULL ELSE ISNULL(@custom25, [custom25]) END,
        [custom13] = CASE WHEN @custom13_Clear = 1 THEN NULL ELSE ISNULL(@custom13, [custom13]) END,
        [custom17] = CASE WHEN @custom17_Clear = 1 THEN NULL ELSE ISNULL(@custom17, [custom17]) END,
        [custom18] = CASE WHEN @custom18_Clear = 1 THEN NULL ELSE ISNULL(@custom18, [custom18]) END,
        [custom29] = CASE WHEN @custom29_Clear = 1 THEN NULL ELSE ISNULL(@custom29, [custom29]) END,
        [custom20] = CASE WHEN @custom20_Clear = 1 THEN NULL ELSE ISNULL(@custom20, [custom20]) END,
        [custom6] = CASE WHEN @custom6_Clear = 1 THEN NULL ELSE ISNULL(@custom6, [custom6]) END,
        [suppressed] = CASE WHEN @suppressed_Clear = 1 THEN NULL ELSE ISNULL(@suppressed, [suppressed]) END,
        [custom8] = CASE WHEN @custom8_Clear = 1 THEN NULL ELSE ISNULL(@custom8, [custom8]) END,
        [zip] = CASE WHEN @zip_Clear = 1 THEN NULL ELSE ISNULL(@zip, [zip]) END,
        [email_confirm] = CASE WHEN @email_confirm_Clear = 1 THEN NULL ELSE ISNULL(@email_confirm, [email_confirm]) END,
        [custom14] = CASE WHEN @custom14_Clear = 1 THEN NULL ELSE ISNULL(@custom14, [custom14]) END,
        [custom22] = CASE WHEN @custom22_Clear = 1 THEN NULL ELSE ISNULL(@custom22, [custom22]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [id] = @id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwRecipients] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwRecipients]
                                    WHERE
                                        [id] = @id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateRecipient] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Recipient table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateRecipient]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateRecipient];
GO
CREATE TRIGGER [magnetmail].trgUpdateRecipient
ON [magnetmail].[Recipient]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Recipient]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[Recipient] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[id] = I.[id];
END;
GO

/* spUpdate Permissions for Recipients */

GRANT EXECUTE ON [magnetmail].[spUpdateRecipient] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Recp Tracks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recp Tracks
-- Item: vwRecp_tracks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Recp Tracks
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  recp_track
-----               PRIMARY KEY: MMId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwRecp_tracks]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwRecp_tracks];
GO

CREATE VIEW [magnetmail].[vwRecp_tracks]
AS
SELECT
    r.*
FROM
    [magnetmail].[recp_track] AS r
GO
GRANT SELECT ON [magnetmail].[vwRecp_tracks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Recp Tracks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recp Tracks
-- Item: Permissions for vwRecp_tracks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwRecp_tracks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Recp Tracks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recp Tracks
-- Item: spCreaterecp_track
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR recp_track
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreaterecp_track]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreaterecp_track];
GO

CREATE PROCEDURE [magnetmail].[spCreaterecp_track]
    @Status_Clear bit = 0,
    @Status nvarchar(255) = NULL,
    @OpenDate_Clear bit = 0,
    @OpenDate nvarchar(255) = NULL,
    @recipient_Clear bit = 0,
    @recipient nvarchar(MAX) = NULL,
    @MMId nvarchar(255) = NULL,
    @faxStatus_Clear bit = 0,
    @faxStatus nvarchar(255) = NULL,
    @ResultDate_Clear bit = 0,
    @ResultDate nvarchar(255) = NULL,
    @remarks_Clear bit = 0,
    @remarks nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[recp_track]
        (
            [Status],
                [OpenDate],
                [recipient],
                [faxStatus],
                [ResultDate],
                [remarks],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [MMId]
        )
    VALUES
        (
            CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @OpenDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenDate, NULL) END,
                CASE WHEN @recipient_Clear = 1 THEN NULL ELSE ISNULL(@recipient, NULL) END,
                CASE WHEN @faxStatus_Clear = 1 THEN NULL ELSE ISNULL(@faxStatus, NULL) END,
                CASE WHEN @ResultDate_Clear = 1 THEN NULL ELSE ISNULL(@ResultDate, NULL) END,
                CASE WHEN @remarks_Clear = 1 THEN NULL ELSE ISNULL(@remarks, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @MMId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwRecp_tracks] WHERE [MMId] = @MMId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreaterecp_track] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Recp Tracks */

GRANT EXECUTE ON [magnetmail].[spCreaterecp_track] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Recp Tracks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recp Tracks
-- Item: spUpdaterecp_track
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR recp_track
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdaterecp_track]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdaterecp_track];
GO

CREATE PROCEDURE [magnetmail].[spUpdaterecp_track]
    @Status_Clear bit = 0,
    @Status nvarchar(255) = NULL,
    @OpenDate_Clear bit = 0,
    @OpenDate nvarchar(255) = NULL,
    @recipient_Clear bit = 0,
    @recipient nvarchar(MAX) = NULL,
    @MMId nvarchar(255),
    @faxStatus_Clear bit = 0,
    @faxStatus nvarchar(255) = NULL,
    @ResultDate_Clear bit = 0,
    @ResultDate nvarchar(255) = NULL,
    @remarks_Clear bit = 0,
    @remarks nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[recp_track]
    SET
        [Status] = CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, [Status]) END,
        [OpenDate] = CASE WHEN @OpenDate_Clear = 1 THEN NULL ELSE ISNULL(@OpenDate, [OpenDate]) END,
        [recipient] = CASE WHEN @recipient_Clear = 1 THEN NULL ELSE ISNULL(@recipient, [recipient]) END,
        [faxStatus] = CASE WHEN @faxStatus_Clear = 1 THEN NULL ELSE ISNULL(@faxStatus, [faxStatus]) END,
        [ResultDate] = CASE WHEN @ResultDate_Clear = 1 THEN NULL ELSE ISNULL(@ResultDate, [ResultDate]) END,
        [remarks] = CASE WHEN @remarks_Clear = 1 THEN NULL ELSE ISNULL(@remarks, [remarks]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [MMId] = @MMId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwRecp_tracks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwRecp_tracks]
                                    WHERE
                                        [MMId] = @MMId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdaterecp_track] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the recp_track table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdaterecp_track]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdaterecp_track];
GO
CREATE TRIGGER [magnetmail].trgUpdaterecp_track
ON [magnetmail].[recp_track]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[recp_track]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[recp_track] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[MMId] = I.[MMId];
END;
GO

/* spUpdate Permissions for Recp Tracks */

GRANT EXECUTE ON [magnetmail].[spUpdaterecp_track] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Registrants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Registrants
-- Item: vwRegistrants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Registrants
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  Registrant
-----               PRIMARY KEY: ClientReferenceId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwRegistrants]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwRegistrants];
GO

CREATE VIEW [magnetmail].[vwRegistrants]
AS
SELECT
    r.*
FROM
    [magnetmail].[Registrant] AS r
GO
GRANT SELECT ON [magnetmail].[vwRegistrants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Registrants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Registrants
-- Item: Permissions for vwRegistrants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwRegistrants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Registrants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Registrants
-- Item: spCreateRegistrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Registrant
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateRegistrant]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateRegistrant];
GO

CREATE PROCEDURE [magnetmail].[spCreateRegistrant]
    @EmailAddress_Clear bit = 0,
    @EmailAddress nvarchar(255) = NULL,
    @Payer_Clear bit = 0,
    @Payer nvarchar(255) = NULL,
    @QuestionItem_Clear bit = 0,
    @QuestionItem nvarchar(MAX) = NULL,
    @IncludePaymentDetailsInConfirmationEmail_Clear bit = 0,
    @IncludePaymentDetailsInConfirmationEmail nvarchar(255) = NULL,
    @SendConfirmationEmail_Clear bit = 0,
    @SendConfirmationEmail nvarchar(255) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(255) = NULL,
    @ClientReferenceId nvarchar(255) = NULL,
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[Registrant]
        (
            [EmailAddress],
                [Payer],
                [QuestionItem],
                [IncludePaymentDetailsInConfirmationEmail],
                [SendConfirmationEmail],
                [LastName],
                [FirstName],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [ClientReferenceId]
        )
    VALUES
        (
            CASE WHEN @EmailAddress_Clear = 1 THEN NULL ELSE ISNULL(@EmailAddress, NULL) END,
                CASE WHEN @Payer_Clear = 1 THEN NULL ELSE ISNULL(@Payer, NULL) END,
                CASE WHEN @QuestionItem_Clear = 1 THEN NULL ELSE ISNULL(@QuestionItem, NULL) END,
                CASE WHEN @IncludePaymentDetailsInConfirmationEmail_Clear = 1 THEN NULL ELSE ISNULL(@IncludePaymentDetailsInConfirmationEmail, NULL) END,
                CASE WHEN @SendConfirmationEmail_Clear = 1 THEN NULL ELSE ISNULL(@SendConfirmationEmail, NULL) END,
                CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, NULL) END,
                CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @ClientReferenceId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwRegistrants] WHERE [ClientReferenceId] = @ClientReferenceId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateRegistrant] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Registrants */

GRANT EXECUTE ON [magnetmail].[spCreateRegistrant] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Registrants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Registrants
-- Item: spUpdateRegistrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Registrant
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateRegistrant]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateRegistrant];
GO

CREATE PROCEDURE [magnetmail].[spUpdateRegistrant]
    @EmailAddress_Clear bit = 0,
    @EmailAddress nvarchar(255) = NULL,
    @Payer_Clear bit = 0,
    @Payer nvarchar(255) = NULL,
    @QuestionItem_Clear bit = 0,
    @QuestionItem nvarchar(MAX) = NULL,
    @IncludePaymentDetailsInConfirmationEmail_Clear bit = 0,
    @IncludePaymentDetailsInConfirmationEmail nvarchar(255) = NULL,
    @SendConfirmationEmail_Clear bit = 0,
    @SendConfirmationEmail nvarchar(255) = NULL,
    @LastName_Clear bit = 0,
    @LastName nvarchar(255) = NULL,
    @ClientReferenceId nvarchar(255),
    @FirstName_Clear bit = 0,
    @FirstName nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Registrant]
    SET
        [EmailAddress] = CASE WHEN @EmailAddress_Clear = 1 THEN NULL ELSE ISNULL(@EmailAddress, [EmailAddress]) END,
        [Payer] = CASE WHEN @Payer_Clear = 1 THEN NULL ELSE ISNULL(@Payer, [Payer]) END,
        [QuestionItem] = CASE WHEN @QuestionItem_Clear = 1 THEN NULL ELSE ISNULL(@QuestionItem, [QuestionItem]) END,
        [IncludePaymentDetailsInConfirmationEmail] = CASE WHEN @IncludePaymentDetailsInConfirmationEmail_Clear = 1 THEN NULL ELSE ISNULL(@IncludePaymentDetailsInConfirmationEmail, [IncludePaymentDetailsInConfirmationEmail]) END,
        [SendConfirmationEmail] = CASE WHEN @SendConfirmationEmail_Clear = 1 THEN NULL ELSE ISNULL(@SendConfirmationEmail, [SendConfirmationEmail]) END,
        [LastName] = CASE WHEN @LastName_Clear = 1 THEN NULL ELSE ISNULL(@LastName, [LastName]) END,
        [FirstName] = CASE WHEN @FirstName_Clear = 1 THEN NULL ELSE ISNULL(@FirstName, [FirstName]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [ClientReferenceId] = @ClientReferenceId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwRegistrants] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwRegistrants]
                                    WHERE
                                        [ClientReferenceId] = @ClientReferenceId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateRegistrant] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Registrant table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateRegistrant]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateRegistrant];
GO
CREATE TRIGGER [magnetmail].trgUpdateRegistrant
ON [magnetmail].[Registrant]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Registrant]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[Registrant] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ClientReferenceId] = I.[ClientReferenceId];
END;
GO

/* spUpdate Permissions for Registrants */

GRANT EXECUTE ON [magnetmail].[spUpdateRegistrant] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Unsubscribes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Unsubscribes
-- Item: vwUnsubscribes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Unsubscribes
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  Unsubscribe
-----               PRIMARY KEY: Id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwUnsubscribes]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwUnsubscribes];
GO

CREATE VIEW [magnetmail].[vwUnsubscribes]
AS
SELECT
    u.*
FROM
    [magnetmail].[Unsubscribe] AS u
GO
GRANT SELECT ON [magnetmail].[vwUnsubscribes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Unsubscribes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Unsubscribes
-- Item: Permissions for vwUnsubscribes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwUnsubscribes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Unsubscribes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Unsubscribes
-- Item: spCreateUnsubscribe
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Unsubscribe
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateUnsubscribe]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateUnsubscribe];
GO

CREATE PROCEDURE [magnetmail].[spCreateUnsubscribe]
    @UserId_Clear bit = 0,
    @UserId nvarchar(255) = NULL,
    @Id nvarchar(255) = NULL,
    @MessageId_Clear bit = 0,
    @MessageId nvarchar(255) = NULL,
    @GroupId_Clear bit = 0,
    @GroupId nvarchar(255) = NULL,
    @MessageCategoryId_Clear bit = 0,
    @MessageCategoryId nvarchar(255) = NULL,
    @RecipientId_Clear bit = 0,
    @RecipientId nvarchar(255) = NULL,
    @GroupCategoryId_Clear bit = 0,
    @GroupCategoryId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[Unsubscribe]
        (
            [UserId],
                [MessageId],
                [GroupId],
                [MessageCategoryId],
                [RecipientId],
                [GroupCategoryId],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [Id]
        )
    VALUES
        (
            CASE WHEN @UserId_Clear = 1 THEN NULL ELSE ISNULL(@UserId, NULL) END,
                CASE WHEN @MessageId_Clear = 1 THEN NULL ELSE ISNULL(@MessageId, NULL) END,
                CASE WHEN @GroupId_Clear = 1 THEN NULL ELSE ISNULL(@GroupId, NULL) END,
                CASE WHEN @MessageCategoryId_Clear = 1 THEN NULL ELSE ISNULL(@MessageCategoryId, NULL) END,
                CASE WHEN @RecipientId_Clear = 1 THEN NULL ELSE ISNULL(@RecipientId, NULL) END,
                CASE WHEN @GroupCategoryId_Clear = 1 THEN NULL ELSE ISNULL(@GroupCategoryId, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwUnsubscribes] WHERE [Id] = @Id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateUnsubscribe] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Unsubscribes */

GRANT EXECUTE ON [magnetmail].[spCreateUnsubscribe] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Unsubscribes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Unsubscribes
-- Item: spUpdateUnsubscribe
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Unsubscribe
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateUnsubscribe]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateUnsubscribe];
GO

CREATE PROCEDURE [magnetmail].[spUpdateUnsubscribe]
    @UserId_Clear bit = 0,
    @UserId nvarchar(255) = NULL,
    @Id nvarchar(255),
    @MessageId_Clear bit = 0,
    @MessageId nvarchar(255) = NULL,
    @GroupId_Clear bit = 0,
    @GroupId nvarchar(255) = NULL,
    @MessageCategoryId_Clear bit = 0,
    @MessageCategoryId nvarchar(255) = NULL,
    @RecipientId_Clear bit = 0,
    @RecipientId nvarchar(255) = NULL,
    @GroupCategoryId_Clear bit = 0,
    @GroupCategoryId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Unsubscribe]
    SET
        [UserId] = CASE WHEN @UserId_Clear = 1 THEN NULL ELSE ISNULL(@UserId, [UserId]) END,
        [MessageId] = CASE WHEN @MessageId_Clear = 1 THEN NULL ELSE ISNULL(@MessageId, [MessageId]) END,
        [GroupId] = CASE WHEN @GroupId_Clear = 1 THEN NULL ELSE ISNULL(@GroupId, [GroupId]) END,
        [MessageCategoryId] = CASE WHEN @MessageCategoryId_Clear = 1 THEN NULL ELSE ISNULL(@MessageCategoryId, [MessageCategoryId]) END,
        [RecipientId] = CASE WHEN @RecipientId_Clear = 1 THEN NULL ELSE ISNULL(@RecipientId, [RecipientId]) END,
        [GroupCategoryId] = CASE WHEN @GroupCategoryId_Clear = 1 THEN NULL ELSE ISNULL(@GroupCategoryId, [GroupCategoryId]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [Id] = @Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwUnsubscribes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwUnsubscribes]
                                    WHERE
                                        [Id] = @Id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateUnsubscribe] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Unsubscribe table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateUnsubscribe]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateUnsubscribe];
GO
CREATE TRIGGER [magnetmail].trgUpdateUnsubscribe
ON [magnetmail].[Unsubscribe]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[Unsubscribe]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[Unsubscribe] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[Id] = I.[Id];
END;
GO

/* spUpdate Permissions for Unsubscribes */

GRANT EXECUTE ON [magnetmail].[spUpdateUnsubscribe] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Recipient Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipient Groups
-- Item: spDeleteRecipientGroup
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecipientGroup
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteRecipientGroup]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteRecipientGroup];
GO

CREATE PROCEDURE [magnetmail].[spDeleteRecipientGroup]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[RecipientGroup]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Recipient Groups */

GRANT EXECUTE ON [magnetmail].[spDeleteRecipientGroup] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Recipients */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recipients
-- Item: spDeleteRecipient
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Recipient
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteRecipient]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteRecipient];
GO

CREATE PROCEDURE [magnetmail].[spDeleteRecipient]
    @id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[Recipient]
    WHERE
        [id] = @id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @id AS [id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Recipients */

GRANT EXECUTE ON [magnetmail].[spDeleteRecipient] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Recp Tracks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Recp Tracks
-- Item: spDeleterecp_track
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR recp_track
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleterecp_track]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleterecp_track];
GO

CREATE PROCEDURE [magnetmail].[spDeleterecp_track]
    @MMId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[recp_track]
    WHERE
        [MMId] = @MMId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [MMId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @MMId AS [MMId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleterecp_track] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Recp Tracks */

GRANT EXECUTE ON [magnetmail].[spDeleterecp_track] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Registrants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Registrants
-- Item: spDeleteRegistrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Registrant
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteRegistrant]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteRegistrant];
GO

CREATE PROCEDURE [magnetmail].[spDeleteRegistrant]
    @ClientReferenceId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[Registrant]
    WHERE
        [ClientReferenceId] = @ClientReferenceId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ClientReferenceId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ClientReferenceId AS [ClientReferenceId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteRegistrant] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Registrants */

GRANT EXECUTE ON [magnetmail].[spDeleteRegistrant] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Unsubscribes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Unsubscribes
-- Item: spDeleteUnsubscribe
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Unsubscribe
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteUnsubscribe]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteUnsubscribe];
GO

CREATE PROCEDURE [magnetmail].[spDeleteUnsubscribe]
    @Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[Unsubscribe]
    WHERE
        [Id] = @Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @Id AS [Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteUnsubscribe] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Unsubscribes */

GRANT EXECUTE ON [magnetmail].[spDeleteUnsubscribe] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for UploadInitialJob */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Jobs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for UploadInitialQueueStatus */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Queue Status
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for UploadJobSettings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Job Settings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for User */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for website_link */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Website Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Upload Initial Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Jobs
-- Item: vwUploadInitialJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Upload Initial Jobs
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  UploadInitialJob
-----               PRIMARY KEY: InitialQueueId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwUploadInitialJobs]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwUploadInitialJobs];
GO

CREATE VIEW [magnetmail].[vwUploadInitialJobs]
AS
SELECT
    u.*
FROM
    [magnetmail].[UploadInitialJob] AS u
GO
GRANT SELECT ON [magnetmail].[vwUploadInitialJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Upload Initial Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Jobs
-- Item: Permissions for vwUploadInitialJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwUploadInitialJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Upload Initial Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Jobs
-- Item: spCreateUploadInitialJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UploadInitialJob
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateUploadInitialJob]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateUploadInitialJob];
GO

CREATE PROCEDURE [magnetmail].[spCreateUploadInitialJob]
    @UserId_Clear bit = 0,
    @UserId nvarchar(255) = NULL,
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL,
    @CsvData_Clear bit = 0,
    @CsvData nvarchar(255) = NULL,
    @InitialQueueId nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[UploadInitialJob]
        (
            [UserId],
                [LoginId],
                [Settings],
                [CsvData],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [InitialQueueId]
        )
    VALUES
        (
            CASE WHEN @UserId_Clear = 1 THEN NULL ELSE ISNULL(@UserId, NULL) END,
                CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, NULL) END,
                CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, NULL) END,
                CASE WHEN @CsvData_Clear = 1 THEN NULL ELSE ISNULL(@CsvData, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @InitialQueueId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwUploadInitialJobs] WHERE [InitialQueueId] = @InitialQueueId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateUploadInitialJob] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Upload Initial Jobs */

GRANT EXECUTE ON [magnetmail].[spCreateUploadInitialJob] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Upload Initial Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Jobs
-- Item: spUpdateUploadInitialJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UploadInitialJob
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateUploadInitialJob]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateUploadInitialJob];
GO

CREATE PROCEDURE [magnetmail].[spUpdateUploadInitialJob]
    @UserId_Clear bit = 0,
    @UserId nvarchar(255) = NULL,
    @LoginId_Clear bit = 0,
    @LoginId nvarchar(255) = NULL,
    @Settings_Clear bit = 0,
    @Settings nvarchar(MAX) = NULL,
    @CsvData_Clear bit = 0,
    @CsvData nvarchar(255) = NULL,
    @InitialQueueId nvarchar(255),
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[UploadInitialJob]
    SET
        [UserId] = CASE WHEN @UserId_Clear = 1 THEN NULL ELSE ISNULL(@UserId, [UserId]) END,
        [LoginId] = CASE WHEN @LoginId_Clear = 1 THEN NULL ELSE ISNULL(@LoginId, [LoginId]) END,
        [Settings] = CASE WHEN @Settings_Clear = 1 THEN NULL ELSE ISNULL(@Settings, [Settings]) END,
        [CsvData] = CASE WHEN @CsvData_Clear = 1 THEN NULL ELSE ISNULL(@CsvData, [CsvData]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [InitialQueueId] = @InitialQueueId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwUploadInitialJobs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwUploadInitialJobs]
                                    WHERE
                                        [InitialQueueId] = @InitialQueueId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateUploadInitialJob] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UploadInitialJob table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateUploadInitialJob]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateUploadInitialJob];
GO
CREATE TRIGGER [magnetmail].trgUpdateUploadInitialJob
ON [magnetmail].[UploadInitialJob]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[UploadInitialJob]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[UploadInitialJob] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[InitialQueueId] = I.[InitialQueueId];
END;
GO

/* spUpdate Permissions for Upload Initial Jobs */

GRANT EXECUTE ON [magnetmail].[spUpdateUploadInitialJob] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Upload Initial Queue Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Queue Status
-- Item: vwUploadInitialQueueStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Upload Initial Queue Status
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  UploadInitialQueueStatus
-----               PRIMARY KEY: UploadId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwUploadInitialQueueStatus]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwUploadInitialQueueStatus];
GO

CREATE VIEW [magnetmail].[vwUploadInitialQueueStatus]
AS
SELECT
    u.*
FROM
    [magnetmail].[UploadInitialQueueStatus] AS u
GO
GRANT SELECT ON [magnetmail].[vwUploadInitialQueueStatus] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Upload Initial Queue Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Queue Status
-- Item: Permissions for vwUploadInitialQueueStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwUploadInitialQueueStatus] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Upload Initial Queue Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Queue Status
-- Item: spCreateUploadInitialQueueStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UploadInitialQueueStatus
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateUploadInitialQueueStatus]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateUploadInitialQueueStatus];
GO

CREATE PROCEDURE [magnetmail].[spCreateUploadInitialQueueStatus]
    @UploadId nvarchar(255) = NULL,
    @JobId_Clear bit = 0,
    @JobId nvarchar(255) = NULL,
    @UploadDate_Clear bit = 0,
    @UploadDate nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @errorMessage_Clear bit = 0,
    @errorMessage nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[UploadInitialQueueStatus]
        (
            [JobId],
                [UploadDate],
                [MailUserId],
                [errorMessage],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [UploadId]
        )
    VALUES
        (
            CASE WHEN @JobId_Clear = 1 THEN NULL ELSE ISNULL(@JobId, NULL) END,
                CASE WHEN @UploadDate_Clear = 1 THEN NULL ELSE ISNULL(@UploadDate, NULL) END,
                CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, NULL) END,
                CASE WHEN @errorMessage_Clear = 1 THEN NULL ELSE ISNULL(@errorMessage, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @UploadId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwUploadInitialQueueStatus] WHERE [UploadId] = @UploadId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateUploadInitialQueueStatus] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Upload Initial Queue Status */

GRANT EXECUTE ON [magnetmail].[spCreateUploadInitialQueueStatus] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Upload Initial Queue Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Queue Status
-- Item: spUpdateUploadInitialQueueStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UploadInitialQueueStatus
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateUploadInitialQueueStatus]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateUploadInitialQueueStatus];
GO

CREATE PROCEDURE [magnetmail].[spUpdateUploadInitialQueueStatus]
    @UploadId nvarchar(255),
    @JobId_Clear bit = 0,
    @JobId nvarchar(255) = NULL,
    @UploadDate_Clear bit = 0,
    @UploadDate nvarchar(255) = NULL,
    @MailUserId_Clear bit = 0,
    @MailUserId nvarchar(255) = NULL,
    @errorMessage_Clear bit = 0,
    @errorMessage nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[UploadInitialQueueStatus]
    SET
        [JobId] = CASE WHEN @JobId_Clear = 1 THEN NULL ELSE ISNULL(@JobId, [JobId]) END,
        [UploadDate] = CASE WHEN @UploadDate_Clear = 1 THEN NULL ELSE ISNULL(@UploadDate, [UploadDate]) END,
        [MailUserId] = CASE WHEN @MailUserId_Clear = 1 THEN NULL ELSE ISNULL(@MailUserId, [MailUserId]) END,
        [errorMessage] = CASE WHEN @errorMessage_Clear = 1 THEN NULL ELSE ISNULL(@errorMessage, [errorMessage]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [UploadId] = @UploadId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwUploadInitialQueueStatus] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwUploadInitialQueueStatus]
                                    WHERE
                                        [UploadId] = @UploadId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateUploadInitialQueueStatus] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UploadInitialQueueStatus table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateUploadInitialQueueStatus]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateUploadInitialQueueStatus];
GO
CREATE TRIGGER [magnetmail].trgUpdateUploadInitialQueueStatus
ON [magnetmail].[UploadInitialQueueStatus]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[UploadInitialQueueStatus]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[UploadInitialQueueStatus] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[UploadId] = I.[UploadId];
END;
GO

/* spUpdate Permissions for Upload Initial Queue Status */

GRANT EXECUTE ON [magnetmail].[spUpdateUploadInitialQueueStatus] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Upload Job Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Job Settings
-- Item: vwUploadJobSettings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Upload Job Settings
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  UploadJobSettings
-----               PRIMARY KEY: GroupId
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwUploadJobSettings]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwUploadJobSettings];
GO

CREATE VIEW [magnetmail].[vwUploadJobSettings]
AS
SELECT
    u.*
FROM
    [magnetmail].[UploadJobSettings] AS u
GO
GRANT SELECT ON [magnetmail].[vwUploadJobSettings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Upload Job Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Job Settings
-- Item: Permissions for vwUploadJobSettings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwUploadJobSettings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Upload Job Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Job Settings
-- Item: spCreateUploadJobSettings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UploadJobSettings
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateUploadJobSettings]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateUploadJobSettings];
GO

CREATE PROCEDURE [magnetmail].[spCreateUploadJobSettings]
    @GroupId nvarchar(255) = NULL,
    @ColumnMappings_Clear bit = 0,
    @ColumnMappings nvarchar(MAX) = NULL,
    @HasHeaderRow_Clear bit = 0,
    @HasHeaderRow nvarchar(255) = NULL,
    @AddReplace_Clear bit = 0,
    @AddReplace nvarchar(255) = NULL,
    @UpdateExistingRecipients_Clear bit = 0,
    @UpdateExistingRecipients nvarchar(255) = NULL,
    @ContainsNonWesternCharacters_Clear bit = 0,
    @ContainsNonWesternCharacters nvarchar(255) = NULL,
    @MappingName_Clear bit = 0,
    @MappingName nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[UploadJobSettings]
        (
            [ColumnMappings],
                [HasHeaderRow],
                [AddReplace],
                [UpdateExistingRecipients],
                [ContainsNonWesternCharacters],
                [MappingName],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [GroupId]
        )
    VALUES
        (
            CASE WHEN @ColumnMappings_Clear = 1 THEN NULL ELSE ISNULL(@ColumnMappings, NULL) END,
                CASE WHEN @HasHeaderRow_Clear = 1 THEN NULL ELSE ISNULL(@HasHeaderRow, NULL) END,
                CASE WHEN @AddReplace_Clear = 1 THEN NULL ELSE ISNULL(@AddReplace, NULL) END,
                CASE WHEN @UpdateExistingRecipients_Clear = 1 THEN NULL ELSE ISNULL(@UpdateExistingRecipients, NULL) END,
                CASE WHEN @ContainsNonWesternCharacters_Clear = 1 THEN NULL ELSE ISNULL(@ContainsNonWesternCharacters, NULL) END,
                CASE WHEN @MappingName_Clear = 1 THEN NULL ELSE ISNULL(@MappingName, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @GroupId
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwUploadJobSettings] WHERE [GroupId] = @GroupId
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateUploadJobSettings] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Upload Job Settings */

GRANT EXECUTE ON [magnetmail].[spCreateUploadJobSettings] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Upload Job Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Job Settings
-- Item: spUpdateUploadJobSettings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UploadJobSettings
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateUploadJobSettings]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateUploadJobSettings];
GO

CREATE PROCEDURE [magnetmail].[spUpdateUploadJobSettings]
    @GroupId nvarchar(255),
    @ColumnMappings_Clear bit = 0,
    @ColumnMappings nvarchar(MAX) = NULL,
    @HasHeaderRow_Clear bit = 0,
    @HasHeaderRow nvarchar(255) = NULL,
    @AddReplace_Clear bit = 0,
    @AddReplace nvarchar(255) = NULL,
    @UpdateExistingRecipients_Clear bit = 0,
    @UpdateExistingRecipients nvarchar(255) = NULL,
    @ContainsNonWesternCharacters_Clear bit = 0,
    @ContainsNonWesternCharacters nvarchar(255) = NULL,
    @MappingName_Clear bit = 0,
    @MappingName nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[UploadJobSettings]
    SET
        [ColumnMappings] = CASE WHEN @ColumnMappings_Clear = 1 THEN NULL ELSE ISNULL(@ColumnMappings, [ColumnMappings]) END,
        [HasHeaderRow] = CASE WHEN @HasHeaderRow_Clear = 1 THEN NULL ELSE ISNULL(@HasHeaderRow, [HasHeaderRow]) END,
        [AddReplace] = CASE WHEN @AddReplace_Clear = 1 THEN NULL ELSE ISNULL(@AddReplace, [AddReplace]) END,
        [UpdateExistingRecipients] = CASE WHEN @UpdateExistingRecipients_Clear = 1 THEN NULL ELSE ISNULL(@UpdateExistingRecipients, [UpdateExistingRecipients]) END,
        [ContainsNonWesternCharacters] = CASE WHEN @ContainsNonWesternCharacters_Clear = 1 THEN NULL ELSE ISNULL(@ContainsNonWesternCharacters, [ContainsNonWesternCharacters]) END,
        [MappingName] = CASE WHEN @MappingName_Clear = 1 THEN NULL ELSE ISNULL(@MappingName, [MappingName]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [GroupId] = @GroupId

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwUploadJobSettings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwUploadJobSettings]
                                    WHERE
                                        [GroupId] = @GroupId
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateUploadJobSettings] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UploadJobSettings table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateUploadJobSettings]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateUploadJobSettings];
GO
CREATE TRIGGER [magnetmail].trgUpdateUploadJobSettings
ON [magnetmail].[UploadJobSettings]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[UploadJobSettings]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[UploadJobSettings] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[GroupId] = I.[GroupId];
END;
GO

/* spUpdate Permissions for Upload Job Settings */

GRANT EXECUTE ON [magnetmail].[spUpdateUploadJobSettings] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: vwUsers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Users
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  User
-----               PRIMARY KEY: User_Id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwUsers]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwUsers];
GO

CREATE VIEW [magnetmail].[vwUsers]
AS
SELECT
    u.*
FROM
    [magnetmail].[User] AS u
GO
GRANT SELECT ON [magnetmail].[vwUsers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: Permissions for vwUsers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwUsers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spCreateUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreateUser]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreateUser];
GO

CREATE PROCEDURE [magnetmail].[spCreateUser]
    @newsletter_permission_Clear bit = 0,
    @newsletter_permission nvarchar(255) = NULL,
    @FilterOutGroupsOnSend_Clear bit = 0,
    @FilterOutGroupsOnSend nvarchar(255) = NULL,
    @event_permission_Clear bit = 0,
    @event_permission nvarchar(255) = NULL,
    @hasForms_Clear bit = 0,
    @hasForms nvarchar(255) = NULL,
    @hasEmail_Clear bit = 0,
    @hasEmail nvarchar(255) = NULL,
    @req_billing_code_Clear bit = 0,
    @req_billing_code nvarchar(255) = NULL,
    @hasCustomId_Clear bit = 0,
    @hasCustomId nvarchar(255) = NULL,
    @rss_permission_Clear bit = 0,
    @rss_permission nvarchar(255) = NULL,
    @messageCategory_Clear bit = 0,
    @messageCategory nvarchar(255) = NULL,
    @web_version_Clear bit = 0,
    @web_version nvarchar(255) = NULL,
    @User_Nbr_Clear bit = 0,
    @User_Nbr nvarchar(255) = NULL,
    @req_billing_initials_Clear bit = 0,
    @req_billing_initials nvarchar(255) = NULL,
    @hasFax_Clear bit = 0,
    @hasFax nvarchar(255) = NULL,
    @email_notification_permission_Clear bit = 0,
    @email_notification_permission nvarchar(255) = NULL,
    @billing_name_Clear bit = 0,
    @billing_name nvarchar(255) = NULL,
    @CampaignManager_permission_Clear bit = 0,
    @CampaignManager_permission nvarchar(255) = NULL,
    @insertTextUnsubscribe_Clear bit = 0,
    @insertTextUnsubscribe nvarchar(255) = NULL,
    @enable_ignore_dedupe_Clear bit = 0,
    @enable_ignore_dedupe nvarchar(255) = NULL,
    @unsubscribe_type_Clear bit = 0,
    @unsubscribe_type nvarchar(255) = NULL,
    @dynamic_content_permission_Clear bit = 0,
    @dynamic_content_permission nvarchar(255) = NULL,
    @User_Id nvarchar(255) = NULL,
    @UploadSystemVersion_Clear bit = 0,
    @UploadSystemVersion nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[User]
        (
            [newsletter_permission],
                [FilterOutGroupsOnSend],
                [event_permission],
                [hasForms],
                [hasEmail],
                [req_billing_code],
                [hasCustomId],
                [rss_permission],
                [messageCategory],
                [web_version],
                [User_Nbr],
                [req_billing_initials],
                [hasFax],
                [email_notification_permission],
                [billing_name],
                [CampaignManager_permission],
                [insertTextUnsubscribe],
                [enable_ignore_dedupe],
                [unsubscribe_type],
                [dynamic_content_permission],
                [UploadSystemVersion],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [User_Id]
        )
    VALUES
        (
            CASE WHEN @newsletter_permission_Clear = 1 THEN NULL ELSE ISNULL(@newsletter_permission, NULL) END,
                CASE WHEN @FilterOutGroupsOnSend_Clear = 1 THEN NULL ELSE ISNULL(@FilterOutGroupsOnSend, NULL) END,
                CASE WHEN @event_permission_Clear = 1 THEN NULL ELSE ISNULL(@event_permission, NULL) END,
                CASE WHEN @hasForms_Clear = 1 THEN NULL ELSE ISNULL(@hasForms, NULL) END,
                CASE WHEN @hasEmail_Clear = 1 THEN NULL ELSE ISNULL(@hasEmail, NULL) END,
                CASE WHEN @req_billing_code_Clear = 1 THEN NULL ELSE ISNULL(@req_billing_code, NULL) END,
                CASE WHEN @hasCustomId_Clear = 1 THEN NULL ELSE ISNULL(@hasCustomId, NULL) END,
                CASE WHEN @rss_permission_Clear = 1 THEN NULL ELSE ISNULL(@rss_permission, NULL) END,
                CASE WHEN @messageCategory_Clear = 1 THEN NULL ELSE ISNULL(@messageCategory, NULL) END,
                CASE WHEN @web_version_Clear = 1 THEN NULL ELSE ISNULL(@web_version, NULL) END,
                CASE WHEN @User_Nbr_Clear = 1 THEN NULL ELSE ISNULL(@User_Nbr, NULL) END,
                CASE WHEN @req_billing_initials_Clear = 1 THEN NULL ELSE ISNULL(@req_billing_initials, NULL) END,
                CASE WHEN @hasFax_Clear = 1 THEN NULL ELSE ISNULL(@hasFax, NULL) END,
                CASE WHEN @email_notification_permission_Clear = 1 THEN NULL ELSE ISNULL(@email_notification_permission, NULL) END,
                CASE WHEN @billing_name_Clear = 1 THEN NULL ELSE ISNULL(@billing_name, NULL) END,
                CASE WHEN @CampaignManager_permission_Clear = 1 THEN NULL ELSE ISNULL(@CampaignManager_permission, NULL) END,
                CASE WHEN @insertTextUnsubscribe_Clear = 1 THEN NULL ELSE ISNULL(@insertTextUnsubscribe, NULL) END,
                CASE WHEN @enable_ignore_dedupe_Clear = 1 THEN NULL ELSE ISNULL(@enable_ignore_dedupe, NULL) END,
                CASE WHEN @unsubscribe_type_Clear = 1 THEN NULL ELSE ISNULL(@unsubscribe_type, NULL) END,
                CASE WHEN @dynamic_content_permission_Clear = 1 THEN NULL ELSE ISNULL(@dynamic_content_permission, NULL) END,
                CASE WHEN @UploadSystemVersion_Clear = 1 THEN NULL ELSE ISNULL(@UploadSystemVersion, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @User_Id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwUsers] WHERE [User_Id] = @User_Id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreateUser] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Users */

GRANT EXECUTE ON [magnetmail].[spCreateUser] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spUpdateUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdateUser]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdateUser];
GO

CREATE PROCEDURE [magnetmail].[spUpdateUser]
    @newsletter_permission_Clear bit = 0,
    @newsletter_permission nvarchar(255) = NULL,
    @FilterOutGroupsOnSend_Clear bit = 0,
    @FilterOutGroupsOnSend nvarchar(255) = NULL,
    @event_permission_Clear bit = 0,
    @event_permission nvarchar(255) = NULL,
    @hasForms_Clear bit = 0,
    @hasForms nvarchar(255) = NULL,
    @hasEmail_Clear bit = 0,
    @hasEmail nvarchar(255) = NULL,
    @req_billing_code_Clear bit = 0,
    @req_billing_code nvarchar(255) = NULL,
    @hasCustomId_Clear bit = 0,
    @hasCustomId nvarchar(255) = NULL,
    @rss_permission_Clear bit = 0,
    @rss_permission nvarchar(255) = NULL,
    @messageCategory_Clear bit = 0,
    @messageCategory nvarchar(255) = NULL,
    @web_version_Clear bit = 0,
    @web_version nvarchar(255) = NULL,
    @User_Nbr_Clear bit = 0,
    @User_Nbr nvarchar(255) = NULL,
    @req_billing_initials_Clear bit = 0,
    @req_billing_initials nvarchar(255) = NULL,
    @hasFax_Clear bit = 0,
    @hasFax nvarchar(255) = NULL,
    @email_notification_permission_Clear bit = 0,
    @email_notification_permission nvarchar(255) = NULL,
    @billing_name_Clear bit = 0,
    @billing_name nvarchar(255) = NULL,
    @CampaignManager_permission_Clear bit = 0,
    @CampaignManager_permission nvarchar(255) = NULL,
    @insertTextUnsubscribe_Clear bit = 0,
    @insertTextUnsubscribe nvarchar(255) = NULL,
    @enable_ignore_dedupe_Clear bit = 0,
    @enable_ignore_dedupe nvarchar(255) = NULL,
    @unsubscribe_type_Clear bit = 0,
    @unsubscribe_type nvarchar(255) = NULL,
    @dynamic_content_permission_Clear bit = 0,
    @dynamic_content_permission nvarchar(255) = NULL,
    @User_Id nvarchar(255),
    @UploadSystemVersion_Clear bit = 0,
    @UploadSystemVersion nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[User]
    SET
        [newsletter_permission] = CASE WHEN @newsletter_permission_Clear = 1 THEN NULL ELSE ISNULL(@newsletter_permission, [newsletter_permission]) END,
        [FilterOutGroupsOnSend] = CASE WHEN @FilterOutGroupsOnSend_Clear = 1 THEN NULL ELSE ISNULL(@FilterOutGroupsOnSend, [FilterOutGroupsOnSend]) END,
        [event_permission] = CASE WHEN @event_permission_Clear = 1 THEN NULL ELSE ISNULL(@event_permission, [event_permission]) END,
        [hasForms] = CASE WHEN @hasForms_Clear = 1 THEN NULL ELSE ISNULL(@hasForms, [hasForms]) END,
        [hasEmail] = CASE WHEN @hasEmail_Clear = 1 THEN NULL ELSE ISNULL(@hasEmail, [hasEmail]) END,
        [req_billing_code] = CASE WHEN @req_billing_code_Clear = 1 THEN NULL ELSE ISNULL(@req_billing_code, [req_billing_code]) END,
        [hasCustomId] = CASE WHEN @hasCustomId_Clear = 1 THEN NULL ELSE ISNULL(@hasCustomId, [hasCustomId]) END,
        [rss_permission] = CASE WHEN @rss_permission_Clear = 1 THEN NULL ELSE ISNULL(@rss_permission, [rss_permission]) END,
        [messageCategory] = CASE WHEN @messageCategory_Clear = 1 THEN NULL ELSE ISNULL(@messageCategory, [messageCategory]) END,
        [web_version] = CASE WHEN @web_version_Clear = 1 THEN NULL ELSE ISNULL(@web_version, [web_version]) END,
        [User_Nbr] = CASE WHEN @User_Nbr_Clear = 1 THEN NULL ELSE ISNULL(@User_Nbr, [User_Nbr]) END,
        [req_billing_initials] = CASE WHEN @req_billing_initials_Clear = 1 THEN NULL ELSE ISNULL(@req_billing_initials, [req_billing_initials]) END,
        [hasFax] = CASE WHEN @hasFax_Clear = 1 THEN NULL ELSE ISNULL(@hasFax, [hasFax]) END,
        [email_notification_permission] = CASE WHEN @email_notification_permission_Clear = 1 THEN NULL ELSE ISNULL(@email_notification_permission, [email_notification_permission]) END,
        [billing_name] = CASE WHEN @billing_name_Clear = 1 THEN NULL ELSE ISNULL(@billing_name, [billing_name]) END,
        [CampaignManager_permission] = CASE WHEN @CampaignManager_permission_Clear = 1 THEN NULL ELSE ISNULL(@CampaignManager_permission, [CampaignManager_permission]) END,
        [insertTextUnsubscribe] = CASE WHEN @insertTextUnsubscribe_Clear = 1 THEN NULL ELSE ISNULL(@insertTextUnsubscribe, [insertTextUnsubscribe]) END,
        [enable_ignore_dedupe] = CASE WHEN @enable_ignore_dedupe_Clear = 1 THEN NULL ELSE ISNULL(@enable_ignore_dedupe, [enable_ignore_dedupe]) END,
        [unsubscribe_type] = CASE WHEN @unsubscribe_type_Clear = 1 THEN NULL ELSE ISNULL(@unsubscribe_type, [unsubscribe_type]) END,
        [dynamic_content_permission] = CASE WHEN @dynamic_content_permission_Clear = 1 THEN NULL ELSE ISNULL(@dynamic_content_permission, [dynamic_content_permission]) END,
        [UploadSystemVersion] = CASE WHEN @UploadSystemVersion_Clear = 1 THEN NULL ELSE ISNULL(@UploadSystemVersion, [UploadSystemVersion]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [User_Id] = @User_Id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwUsers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwUsers]
                                    WHERE
                                        [User_Id] = @User_Id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdateUser] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the User table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdateUser]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdateUser];
GO
CREATE TRIGGER [magnetmail].trgUpdateUser
ON [magnetmail].[User]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[User]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[User] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[User_Id] = I.[User_Id];
END;
GO

/* spUpdate Permissions for Users */

GRANT EXECUTE ON [magnetmail].[spUpdateUser] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Website Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Website Links
-- Item: vwWebsite_links
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Website Links
-----               SCHEMA:      magnetmail
-----               BASE TABLE:  website_link
-----               PRIMARY KEY: website_link_url_id
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[vwWebsite_links]', 'V') IS NOT NULL
    DROP VIEW [magnetmail].[vwWebsite_links];
GO

CREATE VIEW [magnetmail].[vwWebsite_links]
AS
SELECT
    w.*
FROM
    [magnetmail].[website_link] AS w
GO
GRANT SELECT ON [magnetmail].[vwWebsite_links] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Website Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Website Links
-- Item: Permissions for vwWebsite_links
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [magnetmail].[vwWebsite_links] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Website Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Website Links
-- Item: spCreatewebsite_link
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR website_link
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spCreatewebsite_link]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spCreatewebsite_link];
GO

CREATE PROCEDURE [magnetmail].[spCreatewebsite_link]
    @website_link_url_id nvarchar(255) = NULL,
    @website_link_url_Clear bit = 0,
    @website_link_url nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [magnetmail].[website_link]
        (
            [website_link_url],
                [__mj_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [__mj_integration_LastSyncedSnapshot],
                [__mj_integration_SyncMessage],
                [__mj_integration_ContentHash],
                [__mj_integration_CustomOverflow],
                [__mj_integration_ExternalVersion],
                [__mj_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [__mj_integration_LastWriterDirection],
                [__mj_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [website_link_url_id]
        )
    VALUES
        (
            CASE WHEN @website_link_url_Clear = 1 THEN NULL ELSE ISNULL(@website_link_url, NULL) END,
                ISNULL(@__mj_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, NULL) END,
                CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, NULL) END,
                CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, NULL) END,
                CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, NULL) END,
                CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, NULL) END,
                ISNULL(@__mj_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @website_link_url_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [magnetmail].[vwWebsite_links] WHERE [website_link_url_id] = @website_link_url_id
END
GO
GRANT EXECUTE ON [magnetmail].[spCreatewebsite_link] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Website Links */

GRANT EXECUTE ON [magnetmail].[spCreatewebsite_link] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Website Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Website Links
-- Item: spUpdatewebsite_link
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR website_link
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spUpdatewebsite_link]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spUpdatewebsite_link];
GO

CREATE PROCEDURE [magnetmail].[spUpdatewebsite_link]
    @website_link_url_id nvarchar(255),
    @website_link_url_Clear bit = 0,
    @website_link_url nvarchar(255) = NULL,
    @__mj_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @__mj_integration_LastSyncedSnapshot_Clear bit = 0,
    @__mj_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @__mj_integration_SyncMessage_Clear bit = 0,
    @__mj_integration_SyncMessage nvarchar(MAX) = NULL,
    @__mj_integration_ContentHash_Clear bit = 0,
    @__mj_integration_ContentHash nvarchar(64) = NULL,
    @__mj_integration_CustomOverflow_Clear bit = 0,
    @__mj_integration_CustomOverflow nvarchar(MAX) = NULL,
    @__mj_integration_ExternalVersion_Clear bit = 0,
    @__mj_integration_ExternalVersion nvarchar(255) = NULL,
    @__mj_integration_LastSeenModifiedValue_Clear bit = 0,
    @__mj_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @__mj_integration_LastWriterDirection_Clear bit = 0,
    @__mj_integration_LastWriterDirection nvarchar(10) = NULL,
    @__mj_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[website_link]
    SET
        [website_link_url] = CASE WHEN @website_link_url_Clear = 1 THEN NULL ELSE ISNULL(@website_link_url, [website_link_url]) END,
        [__mj_integration_SyncStatus] = ISNULL(@__mj_integration_SyncStatus, [__mj_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [__mj_integration_LastSyncedSnapshot] = CASE WHEN @__mj_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedSnapshot, [__mj_integration_LastSyncedSnapshot]) END,
        [__mj_integration_SyncMessage] = CASE WHEN @__mj_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_SyncMessage, [__mj_integration_SyncMessage]) END,
        [__mj_integration_ContentHash] = CASE WHEN @__mj_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ContentHash, [__mj_integration_ContentHash]) END,
        [__mj_integration_CustomOverflow] = CASE WHEN @__mj_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_CustomOverflow, [__mj_integration_CustomOverflow]) END,
        [__mj_integration_ExternalVersion] = CASE WHEN @__mj_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_ExternalVersion, [__mj_integration_ExternalVersion]) END,
        [__mj_integration_LastSeenModifiedValue] = CASE WHEN @__mj_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSeenModifiedValue, [__mj_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [__mj_integration_LastWriterDirection] = CASE WHEN @__mj_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastWriterDirection, [__mj_integration_LastWriterDirection]) END,
        [__mj_integration_IsTombstoned] = ISNULL(@__mj_integration_IsTombstoned, [__mj_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [website_link_url_id] = @website_link_url_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [magnetmail].[vwWebsite_links] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [magnetmail].[vwWebsite_links]
                                    WHERE
                                        [website_link_url_id] = @website_link_url_id
                                    
END
GO

GRANT EXECUTE ON [magnetmail].[spUpdatewebsite_link] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the website_link table
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[trgUpdatewebsite_link]', 'TR') IS NOT NULL
    DROP TRIGGER [magnetmail].[trgUpdatewebsite_link];
GO
CREATE TRIGGER [magnetmail].trgUpdatewebsite_link
ON [magnetmail].[website_link]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [magnetmail].[website_link]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [magnetmail].[website_link] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[website_link_url_id] = I.[website_link_url_id];
END;
GO

/* spUpdate Permissions for Website Links */

GRANT EXECUTE ON [magnetmail].[spUpdatewebsite_link] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Upload Initial Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Jobs
-- Item: spDeleteUploadInitialJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UploadInitialJob
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteUploadInitialJob]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteUploadInitialJob];
GO

CREATE PROCEDURE [magnetmail].[spDeleteUploadInitialJob]
    @InitialQueueId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[UploadInitialJob]
    WHERE
        [InitialQueueId] = @InitialQueueId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [InitialQueueId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @InitialQueueId AS [InitialQueueId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteUploadInitialJob] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Upload Initial Jobs */

GRANT EXECUTE ON [magnetmail].[spDeleteUploadInitialJob] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Upload Initial Queue Status */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Initial Queue Status
-- Item: spDeleteUploadInitialQueueStatus
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UploadInitialQueueStatus
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteUploadInitialQueueStatus]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteUploadInitialQueueStatus];
GO

CREATE PROCEDURE [magnetmail].[spDeleteUploadInitialQueueStatus]
    @UploadId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[UploadInitialQueueStatus]
    WHERE
        [UploadId] = @UploadId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [UploadId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @UploadId AS [UploadId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteUploadInitialQueueStatus] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Upload Initial Queue Status */

GRANT EXECUTE ON [magnetmail].[spDeleteUploadInitialQueueStatus] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Upload Job Settings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Upload Job Settings
-- Item: spDeleteUploadJobSettings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UploadJobSettings
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteUploadJobSettings]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteUploadJobSettings];
GO

CREATE PROCEDURE [magnetmail].[spDeleteUploadJobSettings]
    @GroupId nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[UploadJobSettings]
    WHERE
        [GroupId] = @GroupId


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [GroupId] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @GroupId AS [GroupId] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteUploadJobSettings] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Upload Job Settings */

GRANT EXECUTE ON [magnetmail].[spDeleteUploadJobSettings] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Users */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Users
-- Item: spDeleteUser
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR User
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeleteUser]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeleteUser];
GO

CREATE PROCEDURE [magnetmail].[spDeleteUser]
    @User_Id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[User]
    WHERE
        [User_Id] = @User_Id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [User_Id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @User_Id AS [User_Id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeleteUser] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Users */

GRANT EXECUTE ON [magnetmail].[spDeleteUser] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Website Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Website Links
-- Item: spDeletewebsite_link
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR website_link
------------------------------------------------------------
IF OBJECT_ID('[magnetmail].[spDeletewebsite_link]', 'P') IS NOT NULL
    DROP PROCEDURE [magnetmail].[spDeletewebsite_link];
GO

CREATE PROCEDURE [magnetmail].[spDeletewebsite_link]
    @website_link_url_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [magnetmail].[website_link]
    WHERE
        [website_link_url_id] = @website_link_url_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [website_link_url_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @website_link_url_id AS [website_link_url_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [magnetmail].[spDeletewebsite_link] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Website Links */

GRANT EXECUTE ON [magnetmail].[spDeletewebsite_link] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '024c2d11-c3af-417b-baf4-a230c8d4754b' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'ID')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '024c2d11-c3af-417b-baf4-a230c8d4754b',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100001,
            'ID',
            'ID',
            NULL,
            'int',
            4,
            10,
            0,
            0,
            NULL,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '2ab9e858-1ca5-4b79-946d-d6719d0e382c' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'Description')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '2ab9e858-1ca5-4b79-946d-d6719d0e382c',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100002,
            'Description',
            'Description',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '08b5d118-65a8-423b-8f69-d1334ae5600d' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'AffectedTables')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '08b5d118-65a8-423b-8f69-d1334ae5600d',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100003,
            'AffectedTables',
            'Affected Tables',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '283380c1-ed3e-47af-9411-9d6b38e3eede' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'Success')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '283380c1-ed3e-47af-9411-9d6b38e3eede',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100004,
            'Success',
            'Success',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'ad672dcd-8c7a-4325-8aeb-25f51844b545' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'APIRestarted')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            'ad672dcd-8c7a-4325-8aeb-25f51844b545',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100005,
            'APIRestarted',
            'API Restarted',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'da688200-fb37-4f28-85d1-78b13c418aa5' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'GitCommitSuccess')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            'da688200-fb37-4f28-85d1-78b13c418aa5',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100006,
            'GitCommitSuccess',
            'Git Commit Success',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '989dfa59-404f-4407-8035-ae05c487149c' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'BranchName')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '989dfa59-404f-4407-8035-ae05c487149c',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100007,
            'BranchName',
            'Branch Name',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'e4f6873f-cf2d-4fb4-9c4a-2ceb85f3a29b' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'MigrationFilePath')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            'e4f6873f-cf2d-4fb4-9c4a-2ceb85f3a29b',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100008,
            'MigrationFilePath',
            'Migration File Path',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '2bfef238-e0ce-4c79-b97a-8f181e4244b1' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'ErrorMessage')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '2bfef238-e0ce-4c79-b97a-8f181e4244b1',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100009,
            'ErrorMessage',
            'Error Message',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '87f4b8aa-7ea4-40f8-8db3-6bac9c4f87f9' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'ErrorStep')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '87f4b8aa-7ea4-40f8-8db3-6bac9c4f87f9',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100010,
            'ErrorStep',
            'Error Step',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '37a43982-156e-4f8f-97b5-59d267ff7147' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'StepsJSON')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '37a43982-156e-4f8f-97b5-59d267ff7147',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100011,
            'StepsJSON',
            'Steps JSON',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = '049ff5dc-a665-49ee-987c-00087cbf627d' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'TotalDurationMs')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            '049ff5dc-a665-49ee-987c-00087cbf627d',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100012,
            'TotalDurationMs',
            'Total Duration Ms',
            NULL,
            'int',
            4,
            10,
            0,
            1,
            NULL,
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'ea2d912c-0eac-4a91-a683-ed119662838a' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = 'RunAt')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            'ea2d912c-0eac-4a91-a683-ed119662838a',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
            100013,
            'RunAt',
            'Run At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            1,
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'a4f4abdb-1f63-4ed7-bc50-8bb1ec3fa2fc' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            'a4f4abdb-1f63-4ed7-bc50-8bb1ec3fa2fc',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
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
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'bc3ea3d6-8f6e-48d1-b2d7-26f0d084042b' OR (EntityID = 'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [__mj].[EntityField]
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
            [IsComputed],
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
            'bc3ea3d6-8f6e-48d1-b2d7-26f0d084042b',
            'E3CBBDBD-303E-42DC-B7DE-988ADC21B0B9', -- Entity: MJ: RSU Audit Logs
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
      END;

/* Set soft PK for magnetmail.email_history.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F131FDE5-EB4A-46EF-8E09-3EED9C333576' AND [Name] = 'message_id';

/* Set soft FK for magnetmail.email_history.message_id → Message.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '5AB0B6CD-0C8A-477C-A297-9B146216761B',
                                    [RelatedEntityFieldName] = 'message_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F131FDE5-EB4A-46EF-8E09-3EED9C333576' AND [Name] = 'message_id';

/* Set soft PK for magnetmail.link.link_url_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A1566598-1D57-4FC4-A0FB-E8AFF163FDD0' AND [Name] = 'link_url_id';

/* Set soft PK for magnetmail.website_link.website_link_url_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '676816D4-559C-405A-B6DD-0D09E7585E31' AND [Name] = 'website_link_url_id';

/* Set soft PK for magnetmail.Recipient.id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '2BB13316-03B2-4E73-B03D-40C37D46AE79' AND [Name] = 'id';

/* Set soft PK for magnetmail.User.User_Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CC608FA3-28C5-40AB-9F35-B53FC00E117C' AND [Name] = 'User_Id';

/* Set soft PK for magnetmail.Message.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5AB0B6CD-0C8A-477C-A297-9B146216761B' AND [Name] = 'message_id';

/* Set soft PK for magnetmail.JobToGroup.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '62849B16-D519-404D-9E13-18A673E0DA2B' AND [Name] = 'group_id';

/* Set soft FK for magnetmail.JobToGroup.group_id → group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E',
                                    [RelatedEntityFieldName] = 'group_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '62849B16-D519-404D-9E13-18A673E0DA2B' AND [Name] = 'group_id';

/* Set soft PK for magnetmail.Links.linkid */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '90E9C472-BFBE-45E3-9C17-DCC58A0970F8' AND [Name] = 'linkid';

/* Set soft PK for magnetmail.recp_track.MMId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '01DF3083-0DC8-4CB4-BFDC-75B150CA0979' AND [Name] = 'MMId';

/* Set soft PK for magnetmail.group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E' AND [Name] = 'group_id';

/* Set soft PK for magnetmail.MessageDetails.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ADD0EFAF-615A-4277-B93E-76D7F6378106' AND [Name] = 'message_id';

/* Set soft PK for magnetmail.MagnetMailQueries.Search_Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '5263BF41-19BC-4B94-878F-9C9404320FAD' AND [Name] = 'Search_Id';

/* Set soft PK for magnetmail.RecipientGroup.Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'B62312C9-501B-456F-BCAA-032801F358EF' AND [Name] = 'Id';

/* Set soft PK for magnetmail.Unsubscribe.Id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'Id';

/* Set soft FK for magnetmail.Unsubscribe.MessageId → Message.message_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '5AB0B6CD-0C8A-477C-A297-9B146216761B',
                                    [RelatedEntityFieldName] = 'message_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'MessageId';

/* Set soft FK for magnetmail.Unsubscribe.GroupId → group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E',
                                    [RelatedEntityFieldName] = 'group_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'GroupId';

/* Set soft FK for magnetmail.Unsubscribe.MessageCategoryId → MessageCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '67C74504-190A-45C5-9BD2-A180401E3A4E',
                                    [RelatedEntityFieldName] = 'ID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'MessageCategoryId';

/* Set soft FK for magnetmail.Unsubscribe.RecipientId → Recipient.id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '2BB13316-03B2-4E73-B03D-40C37D46AE79',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'RecipientId';

/* Set soft FK for magnetmail.Unsubscribe.GroupCategoryId → GroupCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '066BB970-19DA-42D0-BB13-DAF492D5EFBF',
                                    [RelatedEntityFieldName] = 'ID',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '52E17D2F-8381-4D28-BF89-432C618790DD' AND [Name] = 'GroupCategoryId';

/* Set soft PK for magnetmail.MailRecipientGroup.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '0EEDF928-F644-4642-9C97-E07DA704047B' AND [Name] = 'group_id';

/* Set soft FK for magnetmail.MailRecipientGroup.group_id → group.group_id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '72EACF67-32DF-4C7B-96B9-69247913CB6E',
                                    [RelatedEntityFieldName] = 'group_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '0EEDF928-F644-4642-9C97-E07DA704047B' AND [Name] = 'group_id';

/* Set soft PK for magnetmail.GroupRecipient.RecipientId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E3104BCC-4817-4972-B04C-A27BD579C6FA' AND [Name] = 'RecipientId';

/* Set soft FK for magnetmail.GroupRecipient.RecipientId → Recipient.id */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '2BB13316-03B2-4E73-B03D-40C37D46AE79',
                                    [RelatedEntityFieldName] = 'id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'E3104BCC-4817-4972-B04C-A27BD579C6FA' AND [Name] = 'RecipientId';

/* Set soft PK for magnetmail.PersonifySubscriptionMapping.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D3879C6B-AF60-4855-A39E-E2D66073887A' AND [Name] = 'ID';

/* Set soft PK for magnetmail.MessageCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '67C74504-190A-45C5-9BD2-A180401E3A4E' AND [Name] = 'ID';

/* Set soft PK for magnetmail.GroupCategory.ID */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '066BB970-19DA-42D0-BB13-DAF492D5EFBF' AND [Name] = 'ID';

/* Set soft PK for magnetmail.UploadInitialJob.InitialQueueId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BE1AE446-6EAF-425F-928C-D19B4AEB5032' AND [Name] = 'InitialQueueId';

/* Set soft PK for magnetmail.ExtendedField.fieldId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '855979EC-997B-4B23-BB64-86DDFAED4F63' AND [Name] = 'fieldId';

/* Set soft PK for magnetmail.UploadInitialQueueStatus.UploadId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AF7C36FE-7975-43F1-AE08-FE2652FD9A0E' AND [Name] = 'UploadId';

/* Set soft PK for magnetmail.EventSignUp.EventId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '08F43407-9259-4F6C-94BB-F93F8FA9EF9A' AND [Name] = 'EventId';

/* Set soft PK for magnetmail.PaidItem.RMPaidItemReferenceId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '34D417D9-62B5-406C-9056-A2D2B671D026' AND [Name] = 'RMPaidItemReferenceId';

/* Set soft FK for magnetmail.PaidItem.ClientReferenceId → Registrant.ClientReferenceId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '17FF074F-43D5-4B33-B9F3-C1B541F4C3EE',
                                    [RelatedEntityFieldName] = 'ClientReferenceId',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '34D417D9-62B5-406C-9056-A2D2B671D026' AND [Name] = 'ClientReferenceId';

/* Set soft PK for magnetmail.Registrant.ClientReferenceId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '17FF074F-43D5-4B33-B9F3-C1B541F4C3EE' AND [Name] = 'ClientReferenceId';

/* Set soft PK for magnetmail.QuestionItem.QuestionItemId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '333BF442-BBC0-475E-9575-A78183922105' AND [Name] = 'QuestionItemId';

/* Set soft PK for magnetmail.UploadJobSettings.GroupId */
UPDATE [__mj].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '857FF20B-05AE-4C35-8AFD-0FF73358F7AB' AND [Name] = 'GroupId';

