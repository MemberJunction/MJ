-- Migration: Create __mj_integration schema and SchemaHistory table
-- Purpose: Track DDL history for integration-created tables (HubSpot, YM, Salesforce, etc.)
--          separately from core __mj Flyway migrations
-- =====================================================================

-- Create the schema if it doesn't already exist
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '__mj_integration')
BEGIN
    EXEC('CREATE SCHEMA [__mj_integration]');
END
GO

-- Create the DDL history tracking table
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

    -- Index for querying by integration + schema
    CREATE NONCLUSTERED INDEX [IX_SchemaHistory_Integration]
        ON [__mj_integration].[SchemaHistory] ([IntegrationName], [SchemaName], [ExecutedAt] DESC);

    -- Index for querying by table
    CREATE NONCLUSTERED INDEX [IX_SchemaHistory_Table]
        ON [__mj_integration].[SchemaHistory] ([SchemaName], [TableName], [ExecutedAt] DESC);
END
GO
