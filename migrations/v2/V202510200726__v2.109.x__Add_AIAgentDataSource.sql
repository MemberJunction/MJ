/*
   Migration: Add AIAgentDataSource table for agent data preloading
   Version: 2.109.x
   Date: 2025-10-20

   This migration adds the AIAgentDataSource entity which allows agents to
   declaratively specify data that should be preloaded into the 'data' parameter
   before agent execution. This enables agents to have reference data available
   in Nunjucks templates without requiring custom application code or action calls.

   Supports both RunView and RunQuery data sources with configurable caching.
*/
 
CREATE TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
(
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_AIAgentDataSource_ID] DEFAULT (NEWSEQUENTIALID()),
    [AgentID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [SourceType] NVARCHAR(20) NOT NULL CONSTRAINT [DF_AIAgentDataSource_SourceType] DEFAULT ('RunView'),

    -- RunView parameters
    [EntityName] NVARCHAR(255) NULL,
    [ExtraFilter] NVARCHAR(MAX) NULL,
    [OrderBy] NVARCHAR(500) NULL,
    [FieldsToRetrieve] NVARCHAR(MAX) NULL,
    [ResultType] NVARCHAR(20) NULL CONSTRAINT [DF_AIAgentDataSource_ResultType] DEFAULT ('simple'),

    -- RunQuery parameters
    [QueryName] NVARCHAR(255) NULL,
    [CategoryPath] NVARCHAR(500) NULL,
    [Parameters] NVARCHAR(MAX) NULL,

    -- Common parameters
    [MaxRows] INT NULL,
    [ExecutionOrder] INT NOT NULL CONSTRAINT [DF_AIAgentDataSource_ExecutionOrder] DEFAULT (0),
    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_AIAgentDataSource_Status] DEFAULT ('Active'),
    [CachePolicy] NVARCHAR(20) NOT NULL CONSTRAINT [DF_AIAgentDataSource_CachePolicy] DEFAULT ('None'),
    [CacheTimeoutSeconds] INT NULL,

    -- Destination configuration
    [DestinationType] NVARCHAR(20) NOT NULL CONSTRAINT [DF_AIAgentDataSource_DestinationType] DEFAULT ('Data'),
    [DestinationPath] NVARCHAR(500) NULL,

    CONSTRAINT [PK_AIAgentDataSource] PRIMARY KEY CLUSTERED ([ID] ASC),
    CONSTRAINT [FK_AIAgentDataSource_AIAgent] FOREIGN KEY ([AgentID]) REFERENCES [${flyway:defaultSchema}].[AIAgent]([ID])
)

-- Create unique index on AgentID, Name, DestinationType, and DestinationPath
-- This allows same Name across different destinations/paths
CREATE UNIQUE NONCLUSTERED INDEX [IX_AIAgentDataSource_AgentID_Name_Destination]
    ON [${flyway:defaultSchema}].[AIAgentDataSource]([AgentID], [Name], [DestinationType], [DestinationPath])

PRINT 'Created table AIAgentDataSource'


-------------------------------------------------------------
-- Add extended properties for documentation
-------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines data sources that should be preloaded into the data parameter before agent execution. Supports both RunView and RunQuery sources with configurable caching.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgentDataSource'
GO
 

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Variable name for the data in the data parameter (e.g., "ALL_ENTITIES"). Must be unique within an agent.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'Name'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Description of what this data source provides',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'Description'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type of data source: RunView or RunQuery. Determines which parameters are used.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'SourceType'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Entity name for RunView data sources (e.g., "Entities", "AI Models")',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'EntityName'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SQL WHERE clause filter for RunView data sources',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'ExtraFilter'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'SQL ORDER BY clause for RunView data sources',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'OrderBy'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of field names to return for RunView data sources (e.g., ["ID", "Name", "Description"])',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'FieldsToRetrieve'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Result type for RunView: simple (default) or entity_object',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'ResultType'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Query name for RunQuery data sources',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'QueryName'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Category path for RunQuery data sources (e.g., "/MJ/AI/Agents/")',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'CategoryPath'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON object of parameters for RunQuery data sources (e.g., {"organizationId": "123"})',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'Parameters'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Maximum number of rows to return. Applies to both RunView and RunQuery.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'MaxRows'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Execution order when multiple data sources are defined for an agent (lower numbers execute first)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'ExecutionOrder'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Status of the data source: Active or Disabled',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'Status'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Cache policy: None (no caching), PerRun (cache for duration of agent run), PerAgent (cache across runs with timeout)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'CachePolicy'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Time-to-live in seconds for PerAgent cache policy. Ignored for other cache policies.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'CacheTimeoutSeconds'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Destination for the preloaded data: Data (for Nunjucks templates in prompts), Context (for actions only), or Payload (for agent state)',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'DestinationType'
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Path within the destination where data should be injected. Supports nested paths using dot notation (e.g., "config.api.endpoints", "analysis.orders.recent"). If null, uses Name as root-level key.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'AIAgentDataSource', @level2type = N'COLUMN', @level2name = 'DestinationPath'
GO

-------------------------------------------------------------
-- Add check constraints for validation
-------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_SourceType]
    CHECK ([SourceType] IN ('RunView', 'RunQuery'))
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_Status]
    CHECK ([Status] IN ('Active', 'Disabled'))
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_CachePolicy]
    CHECK ([CachePolicy] IN ('None', 'PerRun', 'PerAgent'))
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_DestinationType]
    CHECK ([DestinationType] IN ('Data', 'Context', 'Payload'))
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_ResultType]
    CHECK ([ResultType] IS NULL OR [ResultType] IN ('simple', 'entity_object'))
GO

-- Ensure RunView sources have EntityName
ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_RunView_EntityName]
    CHECK ([SourceType] != 'RunView' OR [EntityName] IS NOT NULL)
GO

-- Ensure RunQuery sources have QueryName
ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_RunQuery_QueryName]
    CHECK ([SourceType] != 'RunQuery' OR [QueryName] IS NOT NULL)
GO

-- Ensure PerAgent cache policy has timeout
ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource]
    ADD CONSTRAINT [CK_AIAgentDataSource_PerAgent_Timeout]
    CHECK ([CachePolicy] != 'PerAgent' OR [CacheTimeoutSeconds] IS NOT NULL)
GO

PRINT 'Added check constraints for AIAgentDataSource'
GO
 




































































-- CODE GEN RUN
/* SQL generated to create new entity MJ: AI Agent Data Sources */

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
         'c218c9b9-d7a6-4901-b073-ff25dd613f35',
         'MJ: AI Agent Data Sources',
         'AI Agent Data Sources',
         NULL,
         NULL,
         'AIAgentDataSource',
         'vwAIAgentDataSources',
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
   

/* SQL generated to add new entity MJ: AI Agent Data Sources to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'c218c9b9-d7a6-4901-b073-ff25dd613f35', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: AI Agent Data Sources for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c218c9b9-d7a6-4901-b073-ff25dd613f35', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Data Sources for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c218c9b9-d7a6-4901-b073-ff25dd613f35', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: AI Agent Data Sources for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('c218c9b9-d7a6-4901-b073-ff25dd613f35', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentDataSource */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentDataSource */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentDataSource] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7978365c-3f88-48bf-9424-e4f44d59f734'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'ID')
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
            '7978365c-3f88-48bf-9424-e4f44d59f734',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
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
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e23f34ee-c5bb-4306-9db8-c0c3def52131'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'AgentID')
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
            'e23f34ee-c5bb-4306-9db8-c0c3def52131',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100002,
            'AgentID',
            'Agent ID',
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
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1',
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
         WHERE ID = 'ef0c4e90-325a-4e93-995d-9f92e1a94b3a'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'Name')
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
            'ef0c4e90-325a-4e93-995d-9f92e1a94b3a',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100003,
            'Name',
            'Name',
            'Variable name for the data in the data parameter (e.g., "ALL_ENTITIES"). Must be unique within an agent.',
            'nvarchar',
            510,
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
         WHERE ID = '8ea018d6-4fdd-402d-939b-b41a840ca5cd'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'Description')
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
            '8ea018d6-4fdd-402d-939b-b41a840ca5cd',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100004,
            'Description',
            'Description',
            'Description of what this data source provides',
            'nvarchar',
            -1,
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
         WHERE ID = '5ffe9517-6986-4e32-9e46-2d763a38a180'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'SourceType')
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
            '5ffe9517-6986-4e32-9e46-2d763a38a180',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100005,
            'SourceType',
            'Source Type',
            'Type of data source: RunView or RunQuery. Determines which parameters are used.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'RunView',
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
         WHERE ID = '58257a3e-e745-44e8-b5bd-1f93db6f8a41'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'EntityName')
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
            '58257a3e-e745-44e8-b5bd-1f93db6f8a41',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100006,
            'EntityName',
            'Entity Name',
            'Entity name for RunView data sources (e.g., "Entities", "AI Models")',
            'nvarchar',
            510,
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
         WHERE ID = '70524a60-99a8-4be5-bfe2-31611b7713d2'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'ExtraFilter')
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
            '70524a60-99a8-4be5-bfe2-31611b7713d2',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100007,
            'ExtraFilter',
            'Extra Filter',
            'SQL WHERE clause filter for RunView data sources',
            'nvarchar',
            -1,
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
         WHERE ID = '29b2c9a8-3668-46db-b166-09ee978648c2'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'OrderBy')
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
            '29b2c9a8-3668-46db-b166-09ee978648c2',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100008,
            'OrderBy',
            'Order By',
            'SQL ORDER BY clause for RunView data sources',
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
         WHERE ID = '86b9b4fd-ed11-414e-b96b-118942089792'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'FieldsToRetrieve')
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
            '86b9b4fd-ed11-414e-b96b-118942089792',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100009,
            'FieldsToRetrieve',
            'Fields To Retrieve',
            'JSON array of field names to return for RunView data sources (e.g., ["ID", "Name", "Description"])',
            'nvarchar',
            -1,
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
         WHERE ID = 'ef4bdbf6-6f1a-4f4d-aeab-458c7e33c753'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'ResultType')
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
            'ef4bdbf6-6f1a-4f4d-aeab-458c7e33c753',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100010,
            'ResultType',
            'Result Type',
            'Result type for RunView: simple (default) or entity_object',
            'nvarchar',
            40,
            0,
            0,
            1,
            'simple',
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
         WHERE ID = '3da96258-11a1-4c0c-b7d6-792ec236bfa0'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'QueryName')
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
            '3da96258-11a1-4c0c-b7d6-792ec236bfa0',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100011,
            'QueryName',
            'Query Name',
            'Query name for RunQuery data sources',
            'nvarchar',
            510,
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
         WHERE ID = 'e3fa1052-7ea9-42ce-bd72-e69dd4bcc146'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'CategoryPath')
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
            'e3fa1052-7ea9-42ce-bd72-e69dd4bcc146',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100012,
            'CategoryPath',
            'Category Path',
            'Category path for RunQuery data sources (e.g., "/MJ/AI/Agents/")',
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
         WHERE ID = 'b6cf2770-e606-4c56-9ad2-70215e7bbde3'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'Parameters')
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
            'b6cf2770-e606-4c56-9ad2-70215e7bbde3',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100013,
            'Parameters',
            'Parameters',
            'JSON object of parameters for RunQuery data sources (e.g., {"organizationId": "123"})',
            'nvarchar',
            -1,
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
         WHERE ID = 'e951d40a-1ef9-4a40-895b-32be3162f75c'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'MaxRows')
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
            'e951d40a-1ef9-4a40-895b-32be3162f75c',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100014,
            'MaxRows',
            'Max Rows',
            'Maximum number of rows to return. Applies to both RunView and RunQuery.',
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
         WHERE ID = 'db606bde-c22e-449f-b5fe-bea1c3fd206d'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'ExecutionOrder')
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
            'db606bde-c22e-449f-b5fe-bea1c3fd206d',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100015,
            'ExecutionOrder',
            'Execution Order',
            'Execution order when multiple data sources are defined for an agent (lower numbers execute first)',
            'int',
            4,
            10,
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
         WHERE ID = 'a54f0f4a-291a-45e0-b6f6-a950834a5299'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'Status')
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
            'a54f0f4a-291a-45e0-b6f6-a950834a5299',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100016,
            'Status',
            'Status',
            'Status of the data source: Active or Disabled',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
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
         WHERE ID = '22f678ee-863b-48d8-a80b-137c3eab4a7d'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'CachePolicy')
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
            '22f678ee-863b-48d8-a80b-137c3eab4a7d',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100017,
            'CachePolicy',
            'Cache Policy',
            'Cache policy: None (no caching), PerRun (cache for duration of agent run), PerAgent (cache across runs with timeout)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'None',
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
         WHERE ID = 'e3066d5b-01e3-40c2-b2f7-51c1ca3c74f6'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'CacheTimeoutSeconds')
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
            'e3066d5b-01e3-40c2-b2f7-51c1ca3c74f6',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100018,
            'CacheTimeoutSeconds',
            'Cache Timeout Seconds',
            'Time-to-live in seconds for PerAgent cache policy. Ignored for other cache policies.',
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
         WHERE ID = 'a700b2b8-1eb8-42c3-a470-1e2b6e25a816'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'DestinationType')
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
            'a700b2b8-1eb8-42c3-a470-1e2b6e25a816',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100019,
            'DestinationType',
            'Destination Type',
            'Destination for the preloaded data: Data (for Nunjucks templates in prompts), Context (for actions only), or Payload (for agent state)',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Data',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0ddc03eb-ae16-4db6-a350-57123e9d7760'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'DestinationPath')
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
            '0ddc03eb-ae16-4db6-a350-57123e9d7760',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100020,
            'DestinationPath',
            'Destination Path',
            'Path within the destination where data should be injected. Supports nested paths using dot notation (e.g., "config.api.endpoints", "analysis.orders.recent"). If null, uses Name as root-level key.',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ad5e922b-a56a-4e8d-8065-fbb15b4bd0a4'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = '__mj_CreatedAt')
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
            'ad5e922b-a56a-4e8d-8065-fbb15b4bd0a4',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100021,
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
         WHERE ID = 'b3d7df44-3118-409b-9e98-b6dc16175c73'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = '__mj_UpdatedAt')
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
            'b3d7df44-3118-409b-9e98-b6dc16175c73',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100022,
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

/* SQL text to insert entity field value with ID f6b5a7a7-6d1c-47b3-ac00-058a2a76a052 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f6b5a7a7-6d1c-47b3-ac00-058a2a76a052', '5FFE9517-6986-4E32-9E46-2D763A38A180', 1, 'RunQuery', 'RunQuery')

/* SQL text to insert entity field value with ID f48ec82c-0df7-4a4b-a030-2b0612db5a92 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f48ec82c-0df7-4a4b-a030-2b0612db5a92', '5FFE9517-6986-4E32-9E46-2D763A38A180', 2, 'RunView', 'RunView')

/* SQL text to update ValueListType for entity field ID 5FFE9517-6986-4E32-9E46-2D763A38A180 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5FFE9517-6986-4E32-9E46-2D763A38A180'

/* SQL text to insert entity field value with ID c676b5ad-82de-4ef0-8004-6e0409c706ad */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c676b5ad-82de-4ef0-8004-6e0409c706ad', 'A54F0F4A-291A-45E0-B6F6-A950834A5299', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 656efcd6-39f3-4413-8287-db3a32650c15 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('656efcd6-39f3-4413-8287-db3a32650c15', 'A54F0F4A-291A-45E0-B6F6-A950834A5299', 2, 'Disabled', 'Disabled')

/* SQL text to update ValueListType for entity field ID A54F0F4A-291A-45E0-B6F6-A950834A5299 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A54F0F4A-291A-45E0-B6F6-A950834A5299'

/* SQL text to insert entity field value with ID 9758c45e-d3de-4b11-8696-a9ca6f7916cc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9758c45e-d3de-4b11-8696-a9ca6f7916cc', '22F678EE-863B-48D8-A80B-137C3EAB4A7D', 1, 'None', 'None')

/* SQL text to insert entity field value with ID 0a54c4ce-a583-4695-ac19-82ef4463d557 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0a54c4ce-a583-4695-ac19-82ef4463d557', '22F678EE-863B-48D8-A80B-137C3EAB4A7D', 2, 'PerAgent', 'PerAgent')

/* SQL text to insert entity field value with ID e15e1974-35e1-45f9-b3c6-171ffc3934e1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e15e1974-35e1-45f9-b3c6-171ffc3934e1', '22F678EE-863B-48D8-A80B-137C3EAB4A7D', 3, 'PerRun', 'PerRun')

/* SQL text to update ValueListType for entity field ID 22F678EE-863B-48D8-A80B-137C3EAB4A7D */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='22F678EE-863B-48D8-A80B-137C3EAB4A7D'

/* SQL text to insert entity field value with ID 8eb93d0d-1aa1-4b17-89dc-aa6cff90bbd5 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8eb93d0d-1aa1-4b17-89dc-aa6cff90bbd5', 'A700B2B8-1EB8-42C3-A470-1E2B6E25A816', 1, 'Context', 'Context')

/* SQL text to insert entity field value with ID 53a07754-1008-4d9c-9616-a2a22d576b49 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('53a07754-1008-4d9c-9616-a2a22d576b49', 'A700B2B8-1EB8-42C3-A470-1E2B6E25A816', 2, 'Data', 'Data')

/* SQL text to insert entity field value with ID 1f4d8b21-8c93-41e0-8ac8-f594d1885b10 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1f4d8b21-8c93-41e0-8ac8-f594d1885b10', 'A700B2B8-1EB8-42C3-A470-1E2B6E25A816', 3, 'Payload', 'Payload')

/* SQL text to update ValueListType for entity field ID A700B2B8-1EB8-42C3-A470-1E2B6E25A816 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A700B2B8-1EB8-42C3-A470-1E2B6E25A816'

/* SQL text to insert entity field value with ID 76658b43-8b9f-4a6b-8a82-16510fe85a5a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('76658b43-8b9f-4a6b-8a82-16510fe85a5a', 'EF4BDBF6-6F1A-4F4D-AEAB-458C7E33C753', 1, 'entity_object', 'entity_object')

/* SQL text to insert entity field value with ID 93683f9e-25a3-490b-ba71-a3aa435eac5d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('93683f9e-25a3-490b-ba71-a3aa435eac5d', 'EF4BDBF6-6F1A-4F4D-AEAB-458C7E33C753', 2, 'simple', 'simple')

/* SQL text to update ValueListType for entity field ID EF4BDBF6-6F1A-4F4D-AEAB-458C7E33C753 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='EF4BDBF6-6F1A-4F4D-AEAB-458C7E33C753'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '54bf6c83-a4c8-4a4f-a65c-148250c36433'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('54bf6c83-a4c8-4a4f-a65c-148250c36433', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'C218C9B9-D7A6-4901-B073-FF25DD613F35', 'AgentID', 'One To Many', 1, 1, 'MJ: AI Agent Data Sources', 1);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID A0D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A0D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID A6D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A6D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 94D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='94D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 5DD3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5DD3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 6DD3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6DD3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 97D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='97D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 98D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='98D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 99D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='99D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 66D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='66D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 82D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='82D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 67D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='67D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 68D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='68D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([RelatedEntityID]);

-- Index for foreign key DisplayUserViewID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayUserViewID]);

-- Index for foreign key DisplayComponentID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayComponentID]);

/* Base View Permissions SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Sequence int = NULL,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit = NULL,
    @IncludeInParentAllQuery bit = NULL,
    @Type nchar(20) = NULL,
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit = NULL,
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50) = NULL,
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [ID],
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRelationship];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRelationship
ON [${flyway:defaultSchema}].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for AIAgentDataSource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Data Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentDataSource
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentDataSource_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentDataSource]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentDataSource_AgentID ON [${flyway:defaultSchema}].[AIAgentDataSource] ([AgentID]);

/* SQL text to update entity field related entity name field map for entity field ID E23F34EE-C5BB-4306-9DB8-C0C3DEF52131 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E23F34EE-C5BB-4306-9DB8-C0C3DEF52131',
         @RelatedEntityNameFieldMap='Agent'

/* Base View SQL for MJ: AI Agent Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Data Sources
-- Item: vwAIAgentDataSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Data Sources
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentDataSource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentDataSources]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentDataSources];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentDataSources]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent]
FROM
    [${flyway:defaultSchema}].[AIAgentDataSource] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentDataSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Data Sources
-- Item: Permissions for vwAIAgentDataSources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentDataSources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Data Sources
-- Item: spCreateAIAgentDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentDataSource]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @SourceType nvarchar(20) = NULL,
    @EntityName nvarchar(255),
    @ExtraFilter nvarchar(MAX),
    @OrderBy nvarchar(500),
    @FieldsToRetrieve nvarchar(MAX),
    @ResultType nvarchar(20),
    @QueryName nvarchar(255),
    @CategoryPath nvarchar(500),
    @Parameters nvarchar(MAX),
    @MaxRows int,
    @ExecutionOrder int = NULL,
    @Status nvarchar(20) = NULL,
    @CachePolicy nvarchar(20) = NULL,
    @CacheTimeoutSeconds int,
    @DestinationType nvarchar(20) = NULL,
    @DestinationPath nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentDataSource]
            (
                [ID],
                [AgentID],
                [Name],
                [Description],
                [SourceType],
                [EntityName],
                [ExtraFilter],
                [OrderBy],
                [FieldsToRetrieve],
                [ResultType],
                [QueryName],
                [CategoryPath],
                [Parameters],
                [MaxRows],
                [ExecutionOrder],
                [Status],
                [CachePolicy],
                [CacheTimeoutSeconds],
                [DestinationType],
                [DestinationPath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @Name,
                @Description,
                ISNULL(@SourceType, 'RunView'),
                @EntityName,
                @ExtraFilter,
                @OrderBy,
                @FieldsToRetrieve,
                @ResultType,
                @QueryName,
                @CategoryPath,
                @Parameters,
                @MaxRows,
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@Status, 'Active'),
                ISNULL(@CachePolicy, 'None'),
                @CacheTimeoutSeconds,
                ISNULL(@DestinationType, 'Data'),
                @DestinationPath
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentDataSource]
            (
                [AgentID],
                [Name],
                [Description],
                [SourceType],
                [EntityName],
                [ExtraFilter],
                [OrderBy],
                [FieldsToRetrieve],
                [ResultType],
                [QueryName],
                [CategoryPath],
                [Parameters],
                [MaxRows],
                [ExecutionOrder],
                [Status],
                [CachePolicy],
                [CacheTimeoutSeconds],
                [DestinationType],
                [DestinationPath]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @Name,
                @Description,
                ISNULL(@SourceType, 'RunView'),
                @EntityName,
                @ExtraFilter,
                @OrderBy,
                @FieldsToRetrieve,
                @ResultType,
                @QueryName,
                @CategoryPath,
                @Parameters,
                @MaxRows,
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@Status, 'Active'),
                ISNULL(@CachePolicy, 'None'),
                @CacheTimeoutSeconds,
                ISNULL(@DestinationType, 'Data'),
                @DestinationPath
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentDataSources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentDataSource] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Data Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentDataSource] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Data Sources
-- Item: spUpdateAIAgentDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentDataSource]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @SourceType nvarchar(20),
    @EntityName nvarchar(255),
    @ExtraFilter nvarchar(MAX),
    @OrderBy nvarchar(500),
    @FieldsToRetrieve nvarchar(MAX),
    @ResultType nvarchar(20),
    @QueryName nvarchar(255),
    @CategoryPath nvarchar(500),
    @Parameters nvarchar(MAX),
    @MaxRows int,
    @ExecutionOrder int,
    @Status nvarchar(20),
    @CachePolicy nvarchar(20),
    @CacheTimeoutSeconds int,
    @DestinationType nvarchar(20),
    @DestinationPath nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentDataSource]
    SET
        [AgentID] = @AgentID,
        [Name] = @Name,
        [Description] = @Description,
        [SourceType] = @SourceType,
        [EntityName] = @EntityName,
        [ExtraFilter] = @ExtraFilter,
        [OrderBy] = @OrderBy,
        [FieldsToRetrieve] = @FieldsToRetrieve,
        [ResultType] = @ResultType,
        [QueryName] = @QueryName,
        [CategoryPath] = @CategoryPath,
        [Parameters] = @Parameters,
        [MaxRows] = @MaxRows,
        [ExecutionOrder] = @ExecutionOrder,
        [Status] = @Status,
        [CachePolicy] = @CachePolicy,
        [CacheTimeoutSeconds] = @CacheTimeoutSeconds,
        [DestinationType] = @DestinationType,
        [DestinationPath] = @DestinationPath
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentDataSources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentDataSources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentDataSource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentDataSource table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentDataSource]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentDataSource];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentDataSource
ON [${flyway:defaultSchema}].[AIAgentDataSource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentDataSource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentDataSource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Data Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentDataSource] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Data Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Data Sources
-- Item: spDeleteAIAgentDataSource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentDataSource
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentDataSource]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentDataSource];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentDataSource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentDataSource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Data Sources */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 2CD4443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2CD4443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 2FD4443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2FD4443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID D3D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D3D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID E7D3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E7D3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID ECD3443E-F36B-1410-8DCC-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='ECD3443E-F36B-1410-8DCC-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '26c88b38-0d1c-402f-b6c4-d83f769aa06b'  OR 
               (EntityID = 'C218C9B9-D7A6-4901-B073-FF25DD613F35' AND Name = 'Agent')
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
            '26c88b38-0d1c-402f-b6c4-d83f769aa06b',
            'C218C9B9-D7A6-4901-B073-FF25DD613F35', -- Entity: MJ: AI Agent Data Sources
            100045,
            'Agent',
            'Agent',
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

/* Generated Validation Functions for AI Agent Actions */
-- CHECK constraint for AI Agent Actions: Field: CompactLength was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CompactLength] IS NULL OR [CompactLength]>(0))', 'public ValidateCompactLengthGreaterThanZero(result: ValidationResult) {
	if (this.CompactLength != null && this.CompactLength <= 0) {
		result.Errors.push(new ValidationErrorInfo("CompactLength", "CompactLength must be greater than zero if specified.", this.CompactLength, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a value is provided for CompactLength, it must be greater than zero. If CompactLength is left empty, no rule applies.', 'ValidateCompactLengthGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'D3B6D192-EA9E-49EA-A67B-74B24EC8EDF5');
  
            -- CHECK constraint for AI Agent Actions: Field: ResultExpirationTurns was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ResultExpirationTurns] IS NULL OR [ResultExpirationTurns]>=(0))', 'public ValidateResultExpirationTurnsNonNegative(result: ValidationResult) {
	if (this.ResultExpirationTurns != null && this.ResultExpirationTurns < 0) {
		result.Errors.push(new ValidationErrorInfo("ResultExpirationTurns", "If provided, ResultExpirationTurns must be zero or greater.", this.ResultExpirationTurns, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the ResultExpirationTurns field has a value, it must be zero or greater (it cannot be negative). If ResultExpirationTurns is left empty, there is no restriction.', 'ValidateResultExpirationTurnsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A4DF120D-B24D-4AC1-8D11-FEB556FB3904');
  
            -- CHECK constraint for AI Agent Actions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CompactMode]<>''First N Chars'' OR [CompactLength] IS NOT NULL)', 'public ValidateCompactLengthRequiredForFirstNCharsMode(result: ValidationResult) {
	if (this.CompactMode === "First N Chars" && this.CompactLength == null) {
		result.Errors.push(new ValidationErrorInfo("CompactLength", "When CompactMode is set to ''First N Chars'', CompactLength must be specified.", this.CompactLength, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the compact mode is set to ''First N Chars'', a compact length must be specified. For any other compact mode, the compact length can be left empty.', 'ValidateCompactLengthRequiredForFirstNCharsMode', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '196B0316-6078-47A4-94B9-44A2FC5E8A55');
  
            -- CHECK constraint for AI Agent Actions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ResultExpirationMode]<>''Compact'' OR [CompactMode] IS NOT NULL)', 'public ValidateCompactModeWhenResultExpirationModeIsCompact(result: ValidationResult) {
	if (this.ResultExpirationMode === "Compact" && this.CompactMode == null) {
		result.Errors.push(new ValidationErrorInfo("CompactMode", "CompactMode must be specified when ResultExpirationMode is ''Compact''.", this.CompactMode, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the result expiration mode is set to ''Compact'', a compact mode value must also be provided. If the result expiration mode is not ''Compact'', compact mode can be left empty.', 'ValidateCompactModeWhenResultExpirationModeIsCompact', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '196B0316-6078-47A4-94B9-44A2FC5E8A55');
  
            -- CHECK constraint for AI Agent Actions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([ResultExpirationMode]=''Compact'' OR [CompactMode] IS NULL AND [CompactLength] IS NULL AND [CompactPromptID] IS NULL)', 'public ValidateResultExpirationModeRequiresCompactFieldsEmpty(result: ValidationResult) {
	if (this.ResultExpirationMode === "Compact") {
		if (this.CompactMode != null || this.CompactLength != null || this.CompactPromptID != null) {
			result.Errors.push(new ValidationErrorInfo("ResultExpirationMode", "When ResultExpirationMode is set to ''Compact'', the fields CompactMode, CompactLength, and CompactPromptID must be empty.", this.ResultExpirationMode, ValidationErrorType.Failure));
		}
	}
}', 'This rule ensures that if the result expiration mode is set to ''Compact'', then CompactMode, CompactLength, and CompactPromptID must all be empty (null). If the expiration mode is not ''Compact'', these fields may be filled in.', 'ValidateResultExpirationModeRequiresCompactFieldsEmpty', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '196B0316-6078-47A4-94B9-44A2FC5E8A55');
  
            

/* Generated Validation Functions for MJ: AI Agent Data Sources */
-- CHECK constraint for MJ: AI Agent Data Sources @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CachePolicy]<>''PerAgent'' OR [CacheTimeoutSeconds] IS NOT NULL)', 'public ValidateCacheTimeoutSecondsRequiredForPerAgentPolicy(result: ValidationResult) {
	if (this.CachePolicy === "PerAgent" && this.CacheTimeoutSeconds == null) {
		result.Errors.push(new ValidationErrorInfo("CacheTimeoutSeconds", "When the cache policy is set to ''PerAgent'', you must specify a cache timeout value.", this.CacheTimeoutSeconds, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the cache policy is set to ''PerAgent'', a cache timeout value must be provided. For other cache policies, providing a cache timeout is optional.', 'ValidateCacheTimeoutSecondsRequiredForPerAgentPolicy', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C218C9B9-D7A6-4901-B073-FF25DD613F35');
  
            -- CHECK constraint for MJ: AI Agent Data Sources @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([SourceType]<>''RunView'' OR [EntityName] IS NOT NULL)', 'public ValidateEntityNameRequiredWhenSourceTypeRunView(result: ValidationResult) {
	if (this.SourceType === "RunView" && this.EntityName == null) {
		result.Errors.push(new ValidationErrorInfo("EntityName", "EntityName is required when SourceType is ''RunView''.", this.EntityName, ValidationErrorType.Failure));
	}
}', 'This rule makes sure that if the source type is ''RunView'', the entity name must be provided. If the source type is anything else, the entity name can be left blank.', 'ValidateEntityNameRequiredWhenSourceTypeRunView', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C218C9B9-D7A6-4901-B073-FF25DD613F35');
  
            -- CHECK constraint for MJ: AI Agent Data Sources @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([SourceType]<>''RunQuery'' OR [QueryName] IS NOT NULL)', 'public ValidateQueryNameRequiredWhenSourceTypeIsRunQuery(result: ValidationResult) {
	if (this.SourceType === "RunQuery" && this.QueryName == null) {
		result.Errors.push(new ValidationErrorInfo("QueryName", "The query name must be provided when Source Type is ''RunQuery''.", this.QueryName, ValidationErrorType.Failure));
	}
}', 'This rule ensures that when the Source Type is set to ''RunQuery'', a Query Name must be provided. If Source Type is anything other than ''RunQuery'', Query Name is optional.', 'ValidateQueryNameRequiredWhenSourceTypeIsRunQuery', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'C218C9B9-D7A6-4901-B073-FF25DD613F35');
  
            

