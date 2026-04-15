-- Add IsCustom flag to IntegrationObject and IntegrationObjectField
-- IsCustom = 0: defined in static metadata (mj-sync push)
-- IsCustom = 1: dynamically discovered by IntrospectSchema, not in static metadata

ALTER TABLE ${flyway:defaultSchema}.IntegrationObject
    ADD [IsCustom] BIT NOT NULL CONSTRAINT [DF_IntegrationObject_IsCustom] DEFAULT 0;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObject',
    @level2type = N'COLUMN', @level2name = N'IsCustom';
GO

ALTER TABLE ${flyway:defaultSchema}.IntegrationObjectField
    ADD [IsCustom] BIT NOT NULL CONSTRAINT [DF_IntegrationObjectField_IsCustom] DEFAULT 0;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'IntegrationObjectField',
    @level2type = N'COLUMN', @level2name = N'IsCustom';
GO
