-- =============================================
-- Advanced Generation: Metadata Intelligence
-- Version: 2.x
-- Date: 2025-11-02
-- Description: Add metadata tracking for LLM-powered
--              field identification and form layout generation
-- =============================================

-- Add user modification tracking columns to EntityField
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD _IsNameField_UserModified BIT NOT NULL DEFAULT 0,
    _DefaultInView_UserModified BIT NOT NULL DEFAULT 0,
    _CategoryID_UserModified BIT NOT NULL DEFAULT 0;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks whether IsNameField was manually set by user (1) or by system/LLM (0)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = '_IsNameField_UserModified';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks whether DefaultInView was manually set by user (1) or by system/LLM (0)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = '_DefaultInView_UserModified';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks whether CategoryID was manually set by user (1) or by system/LLM (0)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = '_CategoryID_UserModified';

-- Create global FieldCategory table for reusable categories
CREATE TABLE [${flyway:defaultSchema}].FieldCategory (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) UNIQUE NOT NULL,
    Icon NVARCHAR(100) NULL,
    Description NVARCHAR(500) NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
);

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Global dictionary of field categories that can be reused across entities (e.g., Basic Information, Billing Details)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'FieldCategory';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Semantic icon name (Font Awesome without prefix, e.g., "user", "credit-card")',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'FieldCategory',
    @level2type = N'COLUMN', @level2name = 'Icon';

-- Create EntityFieldCategory for entity-specific category instances
CREATE TABLE [${flyway:defaultSchema}].EntityFieldCategory (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    CategoryID UNIQUEIDENTIFIER NULL, -- Optional link to global category
    Name NVARCHAR(100) NOT NULL,
    Icon NVARCHAR(100) NULL,
    Priority INT NOT NULL DEFAULT 100,
    DefaultExpanded BIT NOT NULL DEFAULT 1,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_EntityFieldCategory_Entity
        FOREIGN KEY (EntityID) REFERENCES [${flyway:defaultSchema}].Entity(ID),
    CONSTRAINT FK_EntityFieldCategory_FieldCategory
        FOREIGN KEY (CategoryID) REFERENCES [${flyway:defaultSchema}].FieldCategory(ID)
);

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Entity-specific instances of field categories with display properties like icon and priority',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityFieldCategory';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display order priority (1 = highest, appears first)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityFieldCategory',
    @level2type = N'COLUMN', @level2name = 'Priority';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this section should be expanded by default in forms',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityFieldCategory',
    @level2type = N'COLUMN', @level2name = 'DefaultExpanded';

-- Add CategoryID to EntityField
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD CategoryID UNIQUEIDENTIFIER NULL,
    CONSTRAINT FK_EntityField_EntityFieldCategory
        FOREIGN KEY (CategoryID) REFERENCES [${flyway:defaultSchema}].EntityFieldCategory(ID);

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links field to a category for form layout grouping',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'CategoryID';

-- Add transitive join metadata to EntityRelationship
ALTER TABLE [${flyway:defaultSchema}].EntityRelationship
ADD AdditionalFieldsToInclude NVARCHAR(MAX) NULL;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of additional field names to include when joining through this relationship (for junction tables)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityRelationship',
    @level2type = N'COLUMN', @level2name = 'AdditionalFieldsToInclude';

-- Insert common global categories
INSERT INTO [${flyway:defaultSchema}].FieldCategory (ID, Name, Icon, Description)
VALUES
    (NEWID(), 'Basic Information', 'user', 'Core identifying fields'),
    (NEWID(), 'Contact Information', 'envelope', 'Communication channels and addresses'),
    (NEWID(), 'Financial Information', 'credit-card', 'Money, payments, and billing'),
    (NEWID(), 'Dates and Timeline', 'calendar', 'Time-related fields'),
    (NEWID(), 'Settings and Preferences', 'sliders', 'Configuration and user preferences'),
    (NEWID(), 'Relationships', 'link', 'Foreign keys to other entities'),
    (NEWID(), 'System Metadata', 'info-circle', 'Technical fields and audit information');
