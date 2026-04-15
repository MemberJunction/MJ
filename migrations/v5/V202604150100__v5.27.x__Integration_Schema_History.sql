-- Migration: Integration schema history table + IsCustom flag on IntegrationObject/Field
-- =====================================================================

-- Create the __mj_integration schema if it doesn't already exist
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '__mj_integration')
BEGIN
    EXEC('CREATE SCHEMA [__mj_integration]');
END
GO

-- Track DDL history for integration-created tables (HubSpot, YM, Salesforce, etc.)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '__mj_integration' AND TABLE_NAME = 'SchemaHistory')
BEGIN
    CREATE TABLE [__mj_integration].[SchemaHistory] (
        [ID]               UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        [IntegrationName]  NVARCHAR(200)    NOT NULL,
        [SchemaName]       NVARCHAR(200)    NOT NULL,
        [TableName]        NVARCHAR(200)    NULL,
        [OperationType]    NVARCHAR(50)     NOT NULL,  -- CREATE_SCHEMA, CREATE_TABLE, ALTER_TABLE, DROP_TABLE
        [DDLStatement]     NVARCHAR(MAX)    NOT NULL,
        [ExecutedAt]       DATETIMEOFFSET   NOT NULL DEFAULT GETUTCDATE(),
        [ExecutedBy]       NVARCHAR(200)    NULL,
        [Success]          BIT              NOT NULL DEFAULT 1,
        [ErrorMessage]     NVARCHAR(MAX)    NULL,
        [MigrationFile]    NVARCHAR(500)    NULL,      -- RSU migration file path
        [AffectedColumns]  NVARCHAR(MAX)    NULL,      -- JSON array of columns added/modified
        CONSTRAINT [PK___mj_integration_SchemaHistory] PRIMARY KEY ([ID])
    );

    CREATE NONCLUSTERED INDEX [IX_SchemaHistory_Integration]
        ON [__mj_integration].[SchemaHistory] ([IntegrationName], [SchemaName], [ExecutedAt] DESC);

    CREATE NONCLUSTERED INDEX [IX_SchemaHistory_Table]
        ON [__mj_integration].[SchemaHistory] ([SchemaName], [TableName], [ExecutedAt] DESC);
END
GO

-- IsCustom flag: distinguishes static metadata (mj-sync push) from runtime-discovered objects/fields
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
