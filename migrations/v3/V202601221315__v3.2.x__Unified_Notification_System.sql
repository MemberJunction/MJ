-- Migration: V202601151536__v2.134.0_unified_notification_system.sql
-- Description: Add unified notification system with types, preferences, and template associations
-- Date: 2026-01-18

-- Create UserNotificationType Table
CREATE TABLE [${flyway:defaultSchema}].UserNotificationType (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(500),

    DefaultInApp BIT NOT NULL DEFAULT 1,   -- In-app notifications enabled by default
    DefaultEmail BIT NOT NULL DEFAULT 0,   -- Email notifications enabled by default
    DefaultSMS BIT NOT NULL DEFAULT 0,     -- SMS notifications enabled by default
    AllowUserPreference BIT DEFAULT 1,     -- Can users override?

    -- Template Associations (nullable - templates are optional)
    EmailTemplateID UNIQUEIDENTIFIER NULL CONSTRAINT FK_UserNotificationType_EmailTemplate FOREIGN KEY REFERENCES [${flyway:defaultSchema}].Template(ID),
    SMSTemplateID UNIQUEIDENTIFIER NULL CONSTRAINT FK_UserNotificationType_SMSTemplate FOREIGN KEY REFERENCES [${flyway:defaultSchema}].Template(ID),

    -- UI Configuration
    Icon NVARCHAR(100),        -- Font Awesome icon class (e.g., 'fa-robot')
    Color NVARCHAR(50),        -- Badge/highlight color hex

    -- Behavior
    AutoExpireDays INT,        -- Auto-mark as read after N days (NULL = never)
    Priority INT DEFAULT 0     -- Sort order (lower = higher priority)
);
GO

-- Create UserNotificationPreference Table
CREATE TABLE [${flyway:defaultSchema}].UserNotificationPreference (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    UserID UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_UserNotificationPreference_User FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User](ID),
    NotificationTypeID UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_UserNotificationPreference_NotificationType FOREIGN KEY REFERENCES [${flyway:defaultSchema}].UserNotificationType(ID),

    InAppEnabled BIT NULL,
    EmailEnabled BIT NULL,
    SMSEnabled BIT NULL,
    Enabled BIT DEFAULT 1,  

    CONSTRAINT UQ_UserNotificationPreference_UserType UNIQUE(UserID, NotificationTypeID)
);
GO

-- Update UserNotification Table
ALTER TABLE [${flyway:defaultSchema}].UserNotification
ADD NotificationTypeID UNIQUEIDENTIFIER NULL
    CONSTRAINT FK_UserNotification_NotificationType
    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].UserNotificationType(ID);
GO



-- Add extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines categories of notifications with delivery configuration and template associations',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name for the notification type (e.g., ''Agent Completion'')',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationType',
    @level2type = N'COLUMN', @level2name = 'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether in-app notifications are enabled by default for this type',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationType',
    @level2type = N'COLUMN', @level2name = 'DefaultInApp';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether email notifications are enabled by default for this type',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationType',
    @level2type = N'COLUMN', @level2name = 'DefaultEmail';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether SMS notifications are enabled by default for this type',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationType',
    @level2type = N'COLUMN', @level2name = 'DefaultSMS';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether users can override the default delivery method',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationType',
    @level2type = N'COLUMN', @level2name = 'AllowUserPreference';
GO

-- Add extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-user preferences for each notification type (delivery method overrides)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationPreference';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User preference for in-app notifications (NULL = use default)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationPreference',
    @level2type = N'COLUMN', @level2name = 'InAppEnabled';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User preference for email notifications (NULL = use default)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationPreference',
    @level2type = N'COLUMN', @level2name = 'EmailEnabled';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User preference for SMS notifications (NULL = use default)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotificationPreference',
    @level2type = N'COLUMN', @level2name = 'SMSEnabled';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to notification type for categorization and delivery preferences',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'UserNotification',
    @level2type = N'COLUMN', @level2name = 'NotificationTypeID';
GO








/* SQL generated to create new entity MJ: User Notification Types */

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
         '7aa13345-ace3-403f-8f5a-cb742ab1c631',
         'MJ: User Notification Types',
         'User Notification Types',
         NULL,
         NULL,
         'UserNotificationType',
         'vwUserNotificationTypes',
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
   

/* SQL generated to add new entity MJ: User Notification Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '7aa13345-ace3-403f-8f5a-cb742ab1c631', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7aa13345-ace3-403f-8f5a-cb742ab1c631', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7aa13345-ace3-403f-8f5a-cb742ab1c631', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7aa13345-ace3-403f-8f5a-cb742ab1c631', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: User Notification Preferences */

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
         '4b35f25f-d5e7-4489-b722-29b75af384a8',
         'MJ: User Notification Preferences',
         'User Notification Preferences',
         NULL,
         NULL,
         'UserNotificationPreference',
         'vwUserNotificationPreferences',
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
   

/* SQL generated to add new entity MJ: User Notification Preferences to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4b35f25f-d5e7-4489-b722-29b75af384a8', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4b35f25f-d5e7-4489-b722-29b75af384a8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4b35f25f-d5e7-4489-b722-29b75af384a8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: User Notification Preferences for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('4b35f25f-d5e7-4489-b722-29b75af384a8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserNotificationPreference */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationPreference] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserNotificationPreference */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationPreference] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.UserNotificationType */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.UserNotificationType */
ALTER TABLE [${flyway:defaultSchema}].[UserNotificationType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1276bdeb-f585-44fa-9095-38f3dda167f6'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'ID')
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
            '1276bdeb-f585-44fa-9095-38f3dda167f6',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
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
         WHERE ID = 'd06ac7c4-2ce5-4b7b-9904-f944a21193a2'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'UserID')
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
            'd06ac7c4-2ce5-4b7b-9904-f944a21193a2',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100002,
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
         WHERE ID = '6088be4b-8683-45d4-bd9e-8cb064261159'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'NotificationTypeID')
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
            '6088be4b-8683-45d4-bd9e-8cb064261159',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100003,
            'NotificationTypeID',
            'Notification Type ID',
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
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631',
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
         WHERE ID = '48884170-06d4-49b6-b5c1-e9afb983cf60'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'InAppEnabled')
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
            '48884170-06d4-49b6-b5c1-e9afb983cf60',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100004,
            'InAppEnabled',
            'In App Enabled',
            'User preference for in-app notifications (NULL = use default)',
            'bit',
            1,
            1,
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
         WHERE ID = 'dfbb523f-7dbb-49d3-a3c9-19d3810d2d1a'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'EmailEnabled')
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
            'dfbb523f-7dbb-49d3-a3c9-19d3810d2d1a',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100005,
            'EmailEnabled',
            'Email Enabled',
            'User preference for email notifications (NULL = use default)',
            'bit',
            1,
            1,
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
         WHERE ID = '5c60d40d-b382-4772-80da-145fe12b8aaf'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'SMSEnabled')
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
            '5c60d40d-b382-4772-80da-145fe12b8aaf',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100006,
            'SMSEnabled',
            'SMS Enabled',
            'User preference for SMS notifications (NULL = use default)',
            'bit',
            1,
            1,
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
         WHERE ID = '7f53b665-d5f5-462d-a4c2-bd27274075cb'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'Enabled')
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
            '7f53b665-d5f5-462d-a4c2-bd27274075cb',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100007,
            'Enabled',
            'Enabled',
            NULL,
            'bit',
            1,
            1,
            0,
            1,
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
         WHERE ID = 'd59b2b61-c3fd-4787-aa12-b43ced2a7b4b'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = '__mj_CreatedAt')
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
            'd59b2b61-c3fd-4787-aa12-b43ced2a7b4b',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a293bf93-1c05-49a8-abc2-990d9615bf11'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = '__mj_UpdatedAt')
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
            'a293bf93-1c05-49a8-abc2-990d9615bf11',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6cec6a48-576d-49b6-a40f-f62e5a8efd75'  OR 
               (EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'NotificationTypeID')
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
            '6cec6a48-576d-49b6-a40f-f62e5a8efd75',
            '14248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: User Notifications
            100025,
            'NotificationTypeID',
            'Notification Type ID',
            'Optional reference to notification type for categorization and delivery preferences',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631',
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
         WHERE ID = '8b325b74-636f-442f-b21a-2019dc3de9df'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'ID')
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
            '8b325b74-636f-442f-b21a-2019dc3de9df',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
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
         WHERE ID = '4d4d2eac-bcf4-49f9-907a-73665e70255b'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'Name')
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
            '4d4d2eac-bcf4-49f9-907a-73665e70255b',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100002,
            'Name',
            'Name',
            'Unique name for the notification type (e.g., ''Agent Completion'')',
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
         WHERE ID = '79f62158-2d32-485b-84ea-a5029dc460b0'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'Description')
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
            '79f62158-2d32-485b-84ea-a5029dc460b0',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100003,
            'Description',
            'Description',
            NULL,
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
         WHERE ID = '241926b1-91a7-447e-bac0-79a2f9c8c6cf'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'DefaultInApp')
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
            '241926b1-91a7-447e-bac0-79a2f9c8c6cf',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100004,
            'DefaultInApp',
            'Default In App',
            'Whether in-app notifications are enabled by default for this type',
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
         WHERE ID = '8ccd0cf8-8e75-4506-877e-7879932a53ad'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'DefaultEmail')
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
            '8ccd0cf8-8e75-4506-877e-7879932a53ad',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100005,
            'DefaultEmail',
            'Default Email',
            'Whether email notifications are enabled by default for this type',
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
         WHERE ID = 'd74f9eaf-1bac-45d8-9334-18a0442a97a9'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'DefaultSMS')
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
            'd74f9eaf-1bac-45d8-9334-18a0442a97a9',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100006,
            'DefaultSMS',
            'Default SMS',
            'Whether SMS notifications are enabled by default for this type',
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
         WHERE ID = '84d43701-6fad-4465-9148-9f9b1181a7a1'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'AllowUserPreference')
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
            '84d43701-6fad-4465-9148-9f9b1181a7a1',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100007,
            'AllowUserPreference',
            'Allow User Preference',
            'Whether users can override the default delivery method',
            'bit',
            1,
            1,
            0,
            1,
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
         WHERE ID = 'df8b1c12-6013-4220-b2ec-6a25e434142f'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'EmailTemplateID')
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
            'df8b1c12-6013-4220-b2ec-6a25e434142f',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100008,
            'EmailTemplateID',
            'Email Template ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '48248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '2db56e50-aca2-45d9-94a6-782281a60cc0'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'SMSTemplateID')
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
            '2db56e50-aca2-45d9-94a6-782281a60cc0',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100009,
            'SMSTemplateID',
            'SMS Template ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '48248F34-2837-EF11-86D4-6045BDEE16E6',
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
         WHERE ID = '15ef9b08-7b0b-43d0-86ec-4b35f4b22558'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'Icon')
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
            '15ef9b08-7b0b-43d0-86ec-4b35f4b22558',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100010,
            'Icon',
            'Icon',
            NULL,
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
         WHERE ID = 'bbfe5766-8467-4256-881d-5c92a59cdb20'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'Color')
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
            'bbfe5766-8467-4256-881d-5c92a59cdb20',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100011,
            'Color',
            'Color',
            NULL,
            'nvarchar',
            100,
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
         WHERE ID = '98d96252-22be-4ed9-bcb1-d4dce0cc74f0'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'AutoExpireDays')
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
            '98d96252-22be-4ed9-bcb1-d4dce0cc74f0',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100012,
            'AutoExpireDays',
            'Auto Expire Days',
            NULL,
            'int',
            4,
            10,
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
         WHERE ID = 'fc0b6233-477b-407e-baf0-c1bb8875e8b0'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'Priority')
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
            'fc0b6233-477b-407e-baf0-c1bb8875e8b0',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100013,
            'Priority',
            'Priority',
            NULL,
            'int',
            4,
            10,
            0,
            1,
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
         WHERE ID = '1dbf2324-10d4-4bb7-852c-1e0e45a879a1'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = '__mj_CreatedAt')
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
            '1dbf2324-10d4-4bb7-852c-1e0e45a879a1',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e37f037b-7e4c-438c-809a-342f124b1151'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = '__mj_UpdatedAt')
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
            'e37f037b-7e4c-438c-809a-342f124b1151',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
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
            'Search'
         )
      END

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e0065a35-00e4-466d-868d-0e93edb497ba'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e0065a35-00e4-466d-868d-0e93edb497ba', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '4B35F25F-D5E7-4489-B722-29B75AF384A8', 'UserID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1a061c05-49cd-4328-8375-6809189bc57b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1a061c05-49cd-4328-8375-6809189bc57b', '48248F34-2837-EF11-86D4-6045BDEE16E6', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', 'SMSTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2712a384-38a8-455f-b4bb-c6dc10274214'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2712a384-38a8-455f-b4bb-c6dc10274214', '48248F34-2837-EF11-86D4-6045BDEE16E6', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', 'EmailTemplateID', 'One To Many', 1, 1, 'MJ: User Notification Types', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8e432d89-6938-4022-bf1c-eb277ed6ad6d'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8e432d89-6938-4022-bf1c-eb277ed6ad6d', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', '4B35F25F-D5E7-4489-B722-29B75AF384A8', 'NotificationTypeID', 'One To Many', 1, 1, 'MJ: User Notification Preferences', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8b3faffa-0fba-4e4a-83fe-d2e2ff3e3c05'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8b3faffa-0fba-4e4a-83fe-d2e2ff3e3c05', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', '14248F34-2837-EF11-86D4-6045BDEE16E6', 'NotificationTypeID', 'One To Many', 1, 1, 'User Notifications', 1);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID 49D4433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='49D4433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 73D4433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='73D4433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID F5D3433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F5D3433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 74D2433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='74D2433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID E4D2433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E4D2433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 0AD4433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0AD4433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 11D4433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='11D4433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 18D4433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='18D4433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID B3D2433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B3D2433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 77D3433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='77D3433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID BAD2433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BAD2433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID C1D2433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C1D2433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for UserNotificationPreference */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserNotificationPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationPreference_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationPreference_UserID ON [${flyway:defaultSchema}].[UserNotificationPreference] ([UserID]);

-- Index for foreign key NotificationTypeID in table UserNotificationPreference
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationPreference_NotificationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationPreference]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationPreference_NotificationTypeID ON [${flyway:defaultSchema}].[UserNotificationPreference] ([NotificationTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID D06AC7C4-2CE5-4B7B-9904-F944A21193A2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D06AC7C4-2CE5-4B7B-9904-F944A21193A2',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for UserNotificationType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EmailTemplateID in table UserNotificationType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationType_EmailTemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationType_EmailTemplateID ON [${flyway:defaultSchema}].[UserNotificationType] ([EmailTemplateID]);

-- Index for foreign key SMSTemplateID in table UserNotificationType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotificationType_SMSTemplateID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotificationType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotificationType_SMSTemplateID ON [${flyway:defaultSchema}].[UserNotificationType] ([SMSTemplateID]);

/* SQL text to update entity field related entity name field map for entity field ID DF8B1C12-6013-4220-B2EC-6A25E434142F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DF8B1C12-6013-4220-B2EC-6A25E434142F',
         @RelatedEntityNameFieldMap='EmailTemplate'

/* SQL text to update entity field related entity name field map for entity field ID 2DB56E50-ACA2-45D9-94A6-782281A60CC0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2DB56E50-ACA2-45D9-94A6-782281A60CC0',
         @RelatedEntityNameFieldMap='SMSTemplate'

/* SQL text to update entity field related entity name field map for entity field ID 6088BE4B-8683-45D4-BD9E-8CB064261159 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6088BE4B-8683-45D4-BD9E-8CB064261159',
         @RelatedEntityNameFieldMap='NotificationType'

/* Base View SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: vwUserNotificationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Notification Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotificationType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotificationTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotificationTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotificationTypes]
AS
SELECT
    u.*,
    Template_EmailTemplateID.[Name] AS [EmailTemplate],
    Template_SMSTemplateID.[Name] AS [SMSTemplate]
FROM
    [${flyway:defaultSchema}].[UserNotificationType] AS u
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_EmailTemplateID
  ON
    [u].[EmailTemplateID] = Template_EmailTemplateID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Template] AS Template_SMSTemplateID
  ON
    [u].[SMSTemplateID] = Template_SMSTemplateID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: Permissions for vwUserNotificationTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: spCreateUserNotificationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotificationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotificationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @DefaultInApp bit = NULL,
    @DefaultEmail bit = NULL,
    @DefaultSMS bit = NULL,
    @AllowUserPreference bit,
    @EmailTemplateID uniqueidentifier,
    @SMSTemplateID uniqueidentifier,
    @Icon nvarchar(100),
    @Color nvarchar(50),
    @AutoExpireDays int,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationType]
            (
                [ID],
                [Name],
                [Description],
                [DefaultInApp],
                [DefaultEmail],
                [DefaultSMS],
                [AllowUserPreference],
                [EmailTemplateID],
                [SMSTemplateID],
                [Icon],
                [Color],
                [AutoExpireDays],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@DefaultInApp, 1),
                ISNULL(@DefaultEmail, 0),
                ISNULL(@DefaultSMS, 0),
                @AllowUserPreference,
                @EmailTemplateID,
                @SMSTemplateID,
                @Icon,
                @Color,
                @AutoExpireDays,
                @Priority
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationType]
            (
                [Name],
                [Description],
                [DefaultInApp],
                [DefaultEmail],
                [DefaultSMS],
                [AllowUserPreference],
                [EmailTemplateID],
                [SMSTemplateID],
                [Icon],
                [Color],
                [AutoExpireDays],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@DefaultInApp, 1),
                ISNULL(@DefaultEmail, 0),
                ISNULL(@DefaultSMS, 0),
                @AllowUserPreference,
                @EmailTemplateID,
                @SMSTemplateID,
                @Icon,
                @Color,
                @AutoExpireDays,
                @Priority
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotificationTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: User Notification Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: spUpdateUserNotificationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotificationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotificationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(500),
    @DefaultInApp bit,
    @DefaultEmail bit,
    @DefaultSMS bit,
    @AllowUserPreference bit,
    @EmailTemplateID uniqueidentifier,
    @SMSTemplateID uniqueidentifier,
    @Icon nvarchar(100),
    @Color nvarchar(50),
    @AutoExpireDays int,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DefaultInApp] = @DefaultInApp,
        [DefaultEmail] = @DefaultEmail,
        [DefaultSMS] = @DefaultSMS,
        [AllowUserPreference] = @AllowUserPreference,
        [EmailTemplateID] = @EmailTemplateID,
        [SMSTemplateID] = @SMSTemplateID,
        [Icon] = @Icon,
        [Color] = @Color,
        [AutoExpireDays] = @AutoExpireDays,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotificationTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotificationTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotificationType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotificationType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotificationType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotificationType
ON [${flyway:defaultSchema}].[UserNotificationType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotificationType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: User Notification Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: User Notification Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Types
-- Item: spDeleteUserNotificationType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotificationType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotificationType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotificationType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: User Notification Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationType] TO [cdp_Integration]



/* Base View SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: vwUserNotificationPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: User Notification Preferences
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotificationPreference
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotificationPreferences]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotificationPreferences];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotificationPreferences]
AS
SELECT
    u.*,
    User_UserID.[Name] AS [User],
    UserNotificationType_NotificationTypeID.[Name] AS [NotificationType]
FROM
    [${flyway:defaultSchema}].[UserNotificationPreference] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[UserNotificationType] AS UserNotificationType_NotificationTypeID
  ON
    [u].[NotificationTypeID] = UserNotificationType_NotificationTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: Permissions for vwUserNotificationPreferences
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotificationPreferences] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: spCreateUserNotificationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotificationPreference
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotificationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationPreference];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotificationPreference]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @NotificationTypeID uniqueidentifier,
    @InAppEnabled bit,
    @EmailEnabled bit,
    @SMSEnabled bit,
    @Enabled bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationPreference]
            (
                [ID],
                [UserID],
                [NotificationTypeID],
                [InAppEnabled],
                [EmailEnabled],
                [SMSEnabled],
                [Enabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @NotificationTypeID,
                @InAppEnabled,
                @EmailEnabled,
                @SMSEnabled,
                @Enabled
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotificationPreference]
            (
                [UserID],
                [NotificationTypeID],
                [InAppEnabled],
                [EmailEnabled],
                [SMSEnabled],
                [Enabled]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @NotificationTypeID,
                @InAppEnabled,
                @EmailEnabled,
                @SMSEnabled,
                @Enabled
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotificationPreferences] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: User Notification Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: spUpdateUserNotificationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotificationPreference
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotificationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationPreference];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotificationPreference]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @NotificationTypeID uniqueidentifier,
    @InAppEnabled bit,
    @EmailEnabled bit,
    @SMSEnabled bit,
    @Enabled bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationPreference]
    SET
        [UserID] = @UserID,
        [NotificationTypeID] = @NotificationTypeID,
        [InAppEnabled] = @InAppEnabled,
        [EmailEnabled] = @EmailEnabled,
        [SMSEnabled] = @SMSEnabled,
        [Enabled] = @Enabled
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotificationPreferences] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotificationPreferences]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotificationPreference table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotificationPreference]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotificationPreference];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotificationPreference
ON [${flyway:defaultSchema}].[UserNotificationPreference]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotificationPreference]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotificationPreference] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: User Notification Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotificationPreference] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: User Notification Preferences */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Notification Preferences
-- Item: spDeleteUserNotificationPreference
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotificationPreference
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotificationPreference]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationPreference];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotificationPreference]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotificationPreference]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationPreference] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: User Notification Preferences */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserNotificationPreference] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 89D5433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='89D5433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 06D5433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='06D5433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 8ED5433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8ED5433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 22D5433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='22D5433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 29D5433E-F36B-1410-8386-00BBA0B32CF2 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='29D5433E-F36B-1410-8386-00BBA0B32CF2',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for UserNotification */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_UserID ON [${flyway:defaultSchema}].[UserNotification] ([UserID]);

-- Index for foreign key ResourceTypeID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_ResourceTypeID ON [${flyway:defaultSchema}].[UserNotification] ([ResourceTypeID]);

-- Index for foreign key NotificationTypeID in table UserNotification
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserNotification_NotificationTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserNotification]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserNotification_NotificationTypeID ON [${flyway:defaultSchema}].[UserNotification] ([NotificationTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID 6CEC6A48-576D-49B6-A40F-F62E5A8EFD75 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6CEC6A48-576D-49B6-A40F-F62E5A8EFD75',
         @RelatedEntityNameFieldMap='NotificationType'

/* Base View SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      User Notifications
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  UserNotification
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwUserNotifications]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwUserNotifications];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwUserNotifications]
AS
SELECT
    u.*,
    User_UserID.[Name] AS [User],
    ResourceType_ResourceTypeID.[Name] AS [ResourceType],
    UserNotificationType_NotificationTypeID.[Name] AS [NotificationType]
FROM
    [${flyway:defaultSchema}].[UserNotification] AS u
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [u].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ResourceType] AS ResourceType_ResourceTypeID
  ON
    [u].[ResourceTypeID] = ResourceType_ResourceTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserNotificationType] AS UserNotificationType_NotificationTypeID
  ON
    [u].[NotificationTypeID] = UserNotificationType_NotificationTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* Base View Permissions SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: Permissions for vwUserNotifications
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserNotifications] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spCreateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserNotification]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit = NULL,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier,
    @NotificationTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [ID],
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID],
                [NotificationTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID,
                @NotificationTypeID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserNotification]
            (
                [UserID],
                [Title],
                [Message],
                [ResourceTypeID],
                [ResourceConfiguration],
                [Unread],
                [ReadAt],
                [ResourceRecordID],
                [NotificationTypeID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @Title,
                @Message,
                @ResourceTypeID,
                @ResourceConfiguration,
                ISNULL(@Unread, 1),
                @ReadAt,
                @ResourceRecordID,
                @NotificationTypeID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
    

/* spCreate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spUpdateUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserNotification]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @Title nvarchar(255),
    @Message nvarchar(MAX),
    @ResourceTypeID uniqueidentifier,
    @ResourceConfiguration nvarchar(MAX),
    @Unread bit,
    @ReadAt datetimeoffset,
    @ResourceRecordID uniqueidentifier,
    @NotificationTypeID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        [UserID] = @UserID,
        [Title] = @Title,
        [Message] = @Message,
        [ResourceTypeID] = @ResourceTypeID,
        [ResourceConfiguration] = @ResourceConfiguration,
        [Unread] = @Unread,
        [ReadAt] = @ReadAt,
        [ResourceRecordID] = @ResourceRecordID,
        [NotificationTypeID] = @NotificationTypeID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwUserNotifications] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserNotifications]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserNotification table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserNotification]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserNotification];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserNotification
ON [${flyway:defaultSchema}].[UserNotification]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserNotification]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserNotification] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for User Notifications */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserNotification] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Notifications */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Notifications
-- Item: spDeleteUserNotification
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserNotification
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteUserNotification]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserNotification]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserNotification]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
    

/* spDelete Permissions for User Notifications */




/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '29e17240-6d1e-4e6c-ad1a-115fae5e6612'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'User')
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
            '29e17240-6d1e-4e6c-ad1a-115fae5e6612',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100019,
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
         WHERE ID = 'afb9dd82-64bd-4398-b385-78c27d816047'  OR 
               (EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8' AND Name = 'NotificationType')
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
            'afb9dd82-64bd-4398-b385-78c27d816047',
            '4B35F25F-D5E7-4489-B722-29B75AF384A8', -- Entity: MJ: User Notification Preferences
            100020,
            'NotificationType',
            'Notification Type',
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
         WHERE ID = '9618d364-8321-4987-a429-e2e7ef1acfbb'  OR 
               (EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'NotificationType')
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
            '9618d364-8321-4987-a429-e2e7ef1acfbb',
            '14248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: User Notifications
            100029,
            'NotificationType',
            'Notification Type',
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
         WHERE ID = '60a62089-847a-4f46-b0ed-a5e172f25817'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'EmailTemplate')
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
            '60a62089-847a-4f46-b0ed-a5e172f25817',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100031,
            'EmailTemplate',
            'Email Template',
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
         WHERE ID = 'e4f766fd-f322-4802-8133-431b0b93b98f'  OR 
               (EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631' AND Name = 'SMSTemplate')
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
            'e4f766fd-f322-4802-8133-431b0b93b98f',
            '7AA13345-ACE3-403F-8F5A-CB742AB1C631', -- Entity: MJ: User Notification Types
            100032,
            'SMSTemplate',
            'SMS Template',
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '4D4D2EAC-BCF4-49F9-907A-73665E70255B'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '4D4D2EAC-BCF4-49F9-907A-73665E70255B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '79F62158-2D32-485B-84EA-A5029DC460B0'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '241926B1-91A7-447E-BAC0-79A2F9C8C6CF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8CCD0CF8-8E75-4506-877E-7879932A53AD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D74F9EAF-1BAC-45D8-9334-18A0442A97A9'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FC0B6233-477B-407E-BAF0-C1BB8875E8B0'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '4D4D2EAC-BCF4-49F9-907A-73665E70255B'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '79F62158-2D32-485B-84EA-A5029DC460B0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '60A62089-847A-4F46-B0ED-A5E172F25817'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E4F766FD-F322-4802-8133-431B0B93B98F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9618D364-8321-4987-A429-E2E7EF1ACFBB'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9618D364-8321-4987-A429-E2E7EF1ACFBB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'AFB9DD82-64BD-4398-B385-78C27D816047'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '48884170-06D4-49B6-B5C1-E9AFB983CF60'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'DFBB523F-7DBB-49D3-A3C9-19D3810D2D1A'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C60D40D-B382-4772-80DA-145FE12B8AAF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '7F53B665-D5F5-462D-A4C2-BD27274075CB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '29E17240-6D1E-4E6C-AD1A-115FAE5E6612'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'AFB9DD82-64BD-4398-B385-78C27D816047'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '29E17240-6D1E-4E6C-AD1A-115FAE5E6612'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'AFB9DD82-64BD-4398-B385-78C27D816047'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B325B74-636F-442F-B21A-2019DC3DE9DF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4D4D2EAC-BCF4-49F9-907A-73665E70255B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '79F62158-2D32-485B-84EA-A5029DC460B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC0B6233-477B-407E-BAF0-C1BB8875E8B0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Expire Days',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '98D96252-22BE-4ED9-BCB1-D4DCE0CC74F0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '15EF9B08-7B0B-43D0-86EC-4B35F4B22558'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Color',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BBFE5766-8467-4256-881D-5C92A59CDB20'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Defaults',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In‑App',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '241926B1-91A7-447E-BAC0-79A2F9C8C6CF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Defaults',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Email',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8CCD0CF8-8E75-4506-877E-7879932A53AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Defaults',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default SMS',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D74F9EAF-1BAC-45D8-9334-18A0442A97A9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Delivery Defaults',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow User Preference',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '84D43701-6FAD-4465-9148-9F9B1181A7A1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF8B1C12-6013-4220-B2EC-6A25E434142F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2DB56E50-ACA2-45D9-94A6-782281A60CC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Template Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '60A62089-847A-4F46-B0ED-A5E172F25817'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Template Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Template Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E4F766FD-F322-4802-8133-431B0B93B98F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1DBF2324-10D4-4BB7-852C-1E0E45A879A1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E37F037B-7E4C-438C-809A-342F124B1151'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('3adf0168-7dba-4941-ae4d-a0dbcb8c19f6', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', 'FieldCategoryInfo', '{"Notification Details":{"icon":"fa fa-bell","description":"Core definition of the notification type, including name, description, visual styling and priority"},"Delivery Defaults":{"icon":"fa fa-envelope-open","description":"Default delivery channel settings and user‑override permission for the notification type"},"Template Settings":{"icon":"fa fa-file-code","description":"Associations with email and SMS templates used when the notification is sent"},"System Metadata":{"icon":"fa fa-cog","description":"Technical audit fields tracking creation, updates and the primary identifier"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('575c9738-cd77-48ae-9540-456a6d1c483d', '7AA13345-ACE3-403F-8F5A-CB742AB1C631', 'FieldCategoryIcons', '{"Notification Details":"fa fa-bell","Delivery Defaults":"fa fa-envelope-open","Template Settings":"fa fa-file-code","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=0 for NEW entity based on AI analysis (category: reference, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 0,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '7AA13345-ACE3-403F-8F5A-CB742AB1C631'
         

/* Set categories for 15 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '544F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '554F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Title',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '564F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '574F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Unread',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5B4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Read At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '584F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Record',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Related Resource',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1A8FEEC-7840-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6CEC6A48-576D-49B6-A40F-F62E5A8EFD75'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Overview',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9618D364-8321-4987-A429-E2E7EF1ACFBB'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Notification Overview":{"icon":"fa fa-bell","description":""},"Related Resource":{"icon":"fa fa-link","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Notification Overview":"fa fa-bell","Related Resource":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '14248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1276BDEB-F585-44FA-9095-38F3DDA167F6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D06AC7C4-2CE5-4B7B-9904-F944A21193A2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6088BE4B-8683-45D4-BD9E-8CB064261159'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Preferences',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '29E17240-6D1E-4E6C-AD1A-115FAE5E6612'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Preferences',
       GeneratedFormSection = 'Category',
       DisplayName = 'Notification Type Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AFB9DD82-64BD-4398-B385-78C27D816047'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Preferences',
       GeneratedFormSection = 'Category',
       DisplayName = 'In‑App Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48884170-06D4-49B6-B5C1-E9AFB983CF60'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Preferences',
       GeneratedFormSection = 'Category',
       DisplayName = 'Email Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DFBB523F-7DBB-49D3-A3C9-19D3810D2D1A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Preferences',
       GeneratedFormSection = 'Category',
       DisplayName = 'SMS Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C60D40D-B382-4772-80DA-145FE12B8AAF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Notification Preferences',
       GeneratedFormSection = 'Category',
       DisplayName = 'Overall Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7F53B665-D5F5-462D-A4C2-BD27274075CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D59B2B61-C3FD-4787-AA12-B43CED2A7B4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A293BF93-1C05-49A8-ABC2-990D9615BF11'
   AND AutoUpdateCategory = 1

/* Set entity icon to fa fa-bell */

                  UPDATE [${flyway:defaultSchema}].Entity
                  SET Icon = 'fa fa-bell',
                      __mj_UpdatedAt = GETUTCDATE()
                  WHERE ID = '4B35F25F-D5E7-4489-B722-29B75AF384A8'
               

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('4344d605-ad9b-4c08-980a-986f6957515c', '4B35F25F-D5E7-4489-B722-29B75AF384A8', 'FieldCategoryInfo', '{"Identification":{"icon":"fa fa-id-card","description":"Key identifiers linking the preference record to a user and notification type"},"Notification Preferences":{"icon":"fa fa-bell","description":"Settings that control which channels (in‑app, email, SMS) are enabled for each notification type"},"System Metadata":{"icon":"fa fa-cog","description":"System‑managed audit fields tracking creation and modification timestamps"}}', GETUTCDATE(), GETUTCDATE())
            

/* Insert FieldCategoryIcons setting for entity (legacy format) */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('caa1e393-81cb-4896-b5f8-efed56b73779', '4B35F25F-D5E7-4489-B722-29B75AF384A8', 'FieldCategoryIcons', '{"Identification":"fa fa-id-card","Notification Preferences":"fa fa-bell","System Metadata":"fa fa-cog"}', GETUTCDATE(), GETUTCDATE())
            

/* Set DefaultForNewUser=1 for NEW entity based on AI analysis (category: supporting, confidence: high) */

            UPDATE [${flyway:defaultSchema}].ApplicationEntity
            SET DefaultForNewUser = 1,
                __mj_UpdatedAt = GETUTCDATE()
            WHERE EntityID = '4B35F25F-D5E7-4489-B722-29B75AF384A8'
