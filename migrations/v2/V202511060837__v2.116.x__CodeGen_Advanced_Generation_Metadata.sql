-- =============================================
-- Advanced Generation: Metadata Intelligence
-- Version: 2.x
-- Date: 2025-11-02
-- Description: Add metadata tracking for LLM-powered
--              field identification and form layout generation
-- =============================================

-- Add AutoUpdate flags to EntityField for Smart Field Identification
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD AutoUpdateIsNameField BIT NOT NULL DEFAULT 1,
    AutoUpdateDefaultInView BIT NOT NULL DEFAULT 1,
    AutoUpdateCategory BIT NOT NULL DEFAULT 1;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update IsNameField; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateIsNameField';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update DefaultInView; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateDefaultInView';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update Category; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateCategory';

-- Add transitive join metadata to EntityRelationship
ALTER TABLE [${flyway:defaultSchema}].EntityRelationship
ADD AdditionalFieldsToInclude NVARCHAR(MAX) NULL,
    AutoUpdateAdditionalFieldsToInclude BIT NOT NULL DEFAULT 1;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of additional field names to include when joining through this relationship (for junction tables, e.g., ["RoleName", "UserEmail"])',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityRelationship',
    @level2type = N'COLUMN', @level2name = 'AdditionalFieldsToInclude';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update AdditionalFieldsToInclude; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityRelationship',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateAdditionalFieldsToInclude';














































-- CODE GEN RUN
-- IN V202511061942__v2.116.x__CodeGenRun_Categories_Icons.sql
 