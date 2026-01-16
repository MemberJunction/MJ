-- =============================================
-- Migration: V202601160846__notification_delivery_checkboxes.sql
-- Description: Replace single DeliveryMethod column with 3 boolean columns for flexible notification delivery
-- Date: 2026-01-16
-- =============================================

-- =============================================
-- 1. Update UserNotificationType - Add default boolean columns
-- =============================================
ALTER TABLE [${flyway:defaultSchema}].UserNotificationType
ADD DefaultInApp BIT NOT NULL DEFAULT 1;
GO

ALTER TABLE [${flyway:defaultSchema}].UserNotificationType
ADD DefaultEmail BIT NOT NULL DEFAULT 0;
GO

ALTER TABLE [${flyway:defaultSchema}].UserNotificationType
ADD DefaultSMS BIT NOT NULL DEFAULT 0;
GO

-- Migrate existing DefaultDeliveryMethod data to new columns
UPDATE [${flyway:defaultSchema}].UserNotificationType SET
    DefaultInApp = CASE WHEN DefaultDeliveryMethod IN ('InApp', 'All') THEN 1 ELSE 0 END,
    DefaultEmail = CASE WHEN DefaultDeliveryMethod IN ('Email', 'All') THEN 1 ELSE 0 END,
    DefaultSMS = CASE WHEN DefaultDeliveryMethod IN ('SMS', 'All') THEN 1 ELSE 0 END;
GO

-- Add extended properties
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

-- =============================================
-- 2. Update UserNotificationPreference - Add boolean columns
-- =============================================
ALTER TABLE [${flyway:defaultSchema}].UserNotificationPreference
ADD InAppEnabled BIT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].UserNotificationPreference
ADD EmailEnabled BIT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].UserNotificationPreference
ADD SMSEnabled BIT NULL;
GO

-- Migrate existing DeliveryMethod data to new columns
UPDATE [${flyway:defaultSchema}].UserNotificationPreference SET
    InAppEnabled = CASE WHEN DeliveryMethod IN ('InApp', 'All') THEN 1
                        WHEN DeliveryMethod = 'None' THEN 0
                        WHEN DeliveryMethod IS NULL THEN NULL
                        ELSE 0 END,
    EmailEnabled = CASE WHEN DeliveryMethod IN ('Email', 'All') THEN 1
                        WHEN DeliveryMethod = 'None' THEN 0
                        WHEN DeliveryMethod IS NULL THEN NULL
                        ELSE 0 END,
    SMSEnabled = CASE WHEN DeliveryMethod IN ('SMS', 'All') THEN 1
                      WHEN DeliveryMethod = 'None' THEN 0
                      WHEN DeliveryMethod IS NULL THEN NULL
                      ELSE 0 END;
GO

-- Add extended properties
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

-- =============================================
-- 3. Drop old columns (keeping for backwards compatibility during transition)
-- Uncomment these after CodeGen and deployment is verified
-- =============================================
-- ALTER TABLE [${flyway:defaultSchema}].UserNotificationType DROP COLUMN DefaultDeliveryMethod;
-- GO
-- ALTER TABLE [${flyway:defaultSchema}].UserNotificationPreference DROP COLUMN DeliveryMethod;
-- GO

-- =============================================
-- Migration Complete
-- =============================================
