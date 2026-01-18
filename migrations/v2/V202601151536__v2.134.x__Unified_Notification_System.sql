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

