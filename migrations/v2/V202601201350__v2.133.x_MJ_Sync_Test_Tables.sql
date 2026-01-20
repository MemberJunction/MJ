-- MJ-Sync Pull/Push Qualification Test Tables
-- This migration creates test tables for validating mj-sync pull/push functionality
-- The __mj_CreatedAt and __mj_UpdatedAt columns will be added by CodeGen

-- Producer table
CREATE TABLE [${flyway:defaultSchema}].[Producer] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_Producer] PRIMARY KEY ([ID])
);

-- Consumer table
CREATE TABLE [${flyway:defaultSchema}].[Consumer] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_Consumer] PRIMARY KEY ([ID])
);

-- ProducerConsumer junction table
CREATE TABLE [${flyway:defaultSchema}].[ProducerConsumer] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProducerID] UNIQUEIDENTIFIER NOT NULL,
    [ConsumerID] UNIQUEIDENTIFIER NOT NULL,
    [Notes] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_ProducerConsumer] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_ProducerConsumer_Producer] FOREIGN KEY ([ProducerID]) REFERENCES [${flyway:defaultSchema}].[Producer]([ID]),
    CONSTRAINT [FK_ProducerConsumer_Consumer] FOREIGN KEY ([ConsumerID]) REFERENCES [${flyway:defaultSchema}].[Consumer]([ID])
);

-- Add extended properties for table descriptions
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Test entity representing a data producer for mj-sync qualification testing',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Producer';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Test entity representing a data consumer for mj-sync qualification testing',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Consumer';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction table linking producers to consumers for mj-sync qualification testing',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ProducerConsumer';
